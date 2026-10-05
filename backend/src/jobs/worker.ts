import { boss } from '../lib/boss';
import { supabaseAdmin } from '../lib/supabase';
import { env } from '../config/env';
import { AgentClient, AgentError } from '../services/agent.client';

export async function startWorkers() {
  await boss.createQueue('ai-analysis');
  await boss.createQueue('sms-send');
  await boss.createQueue('auto-waiting');

  await boss.schedule('auto-waiting', '*/5 * * * *');
  
  await boss.work('auto-waiting', async () => {
    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    
    const { error } = await supabaseAdmin.from('appointments')
      .update({ status: 'waiting' })
      .eq('status', 'scheduled')
      .lt('scheduled_start', thirtyMinsAgo);

    if (error) {
      console.error('Auto-waiting update failed:', error.message);
    }
  });

  await boss.work('ai-analysis', async (job: any) => {
    const { follow_up_id, record_id, token } = job.data as {
      follow_up_id: string;
      record_id: string;
      mrn?: string;
      token: string;
    };

    try {
      // 1. Fetch MRN if missing
      let mrn = job.data.mrn;
      if (!mrn) {
        const { data: fu } = await supabaseAdmin.from('follow_ups')
          .select('record_id, medical_records(patient_id, patients(mrn))')
          .eq('id', follow_up_id)
          .single();
        mrn = (fu?.medical_records as any)?.patients?.mrn;
      }

      if (!mrn) {
        throw new Error(`Cannot find MRN for follow-up ${follow_up_id}`);
      }

      // 2. Call Agent service /v1/followup-draft
      await AgentClient.requestFollowupDraft(
        { mrn, followUpId: follow_up_id, medicalRecordId: record_id },
        token
      );
    } catch (error: any) {
      console.error(`AI Analysis Job Failed for follow-up ${follow_up_id}:`, error?.message || error);
      // Mark status failed so doctor UI displays retry button
      await supabaseAdmin.from('follow_ups')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', follow_up_id);
    }
  });

  await boss.work('sms-send', async (job: any) => {
    const { follow_up_id } = job.data as { follow_up_id: string };

    try {
      const { data: fu, error: fuError } = await supabaseAdmin.from('follow_ups')
        .select('*, patients(phone)')
        .eq('id', follow_up_id)
        .single();

      if (fuError || !fu) throw new Error('Follow-up not found');
      
      const phone = fu.patients?.phone;
      const idempotency_key = `sms-${follow_up_id}-${Date.now()}`;
      
      // Ensure an sms_deliveries record exists or create one
      const { data: existingDel } = await supabaseAdmin.from('sms_deliveries')
        .select('id, status')
        .eq('follow_up_id', follow_up_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let deliveryId = existingDel?.id;

      if (!deliveryId) {
        const { data: delivery, error: delError } = await supabaseAdmin.from('sms_deliveries')
          .insert({ follow_up_id, idempotency_key, status: 'pending' })
          .select('*')
          .single();

        if (delError) {
          console.error('SMS Gate Rejected or Delivery insert failed:', delError.message);
          throw delError;
        }
        deliveryId = delivery.id;
      }

      // Simulate sending SMS
      if (env.SMS_PROVIDER === 'mock') {
        await supabaseAdmin.from('sms_deliveries')
          .update({ status: 'delivered', provider_message_id: 'mock-id' })
          .eq('id', deliveryId);
        
        await supabaseAdmin.from('follow_ups').update({ status: 'delivered' }).eq('id', follow_up_id);
      } else {
        await supabaseAdmin.from('sms_deliveries')
          .update({ status: 'sent', provider_message_id: 'provider-id' })
          .eq('id', deliveryId);
        await supabaseAdmin.from('follow_ups').update({ status: 'sent' }).eq('id', follow_up_id);
      }
    } catch (error: any) {
      console.error('SMS Send Job Failed:', error?.message || error);
      throw error;
    }
  });
}
