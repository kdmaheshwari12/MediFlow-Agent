import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin, createScopedClient } from '../../lib/supabase';
import { boss } from '../../lib/boss';

export function runServerSideGuardrails(
  aiContent: string | null,
  clinicName: string,
  suggestedDate: string | null,
  riskFlags: any[],
  medicinesList: string[] = [],
  diagnosisText: string | null = null
): { passed: boolean; failures: string[] } {
  const failures: string[] = [];

  if (!aiContent || typeof aiContent !== 'string') {
    failures.push('Content is missing or empty');
    return { passed: false, failures };
  }

  // 1. Max length 320 chars
  if (aiContent.length > 320) {
    failures.push('Content exceeds maximum 320 characters limit');
  }

  // 2. Risk flags must be empty
  if (Array.isArray(riskFlags) && riskFlags.length > 0) {
    failures.push(`Risk flags present: ${riskFlags.join(', ')}`);
  }

  // 3. Must contain clinic name (case-insensitive search)
  if (clinicName && !aiContent.toLowerCase().includes(clinicName.toLowerCase())) {
    failures.push(`Content does not contain clinic name (${clinicName})`);
  }

  // 4. Must contain follow-up date (if suggestedDate is given)
  if (suggestedDate && !aiContent.includes(suggestedDate)) {
    const datePattern = /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2}\b)/i;
    if (!datePattern.test(aiContent)) {
      failures.push('Content does not contain follow-up date');
    }
  }

  // 5. No URLs
  const urlPattern = /(https?:\/\/|www\.|[a-zA-Z0-9-]+\.(com|org|net|io|co|pk))/i;
  if (urlPattern.test(aiContent)) {
    failures.push('Content contains prohibited URLs');
  }

  // 6. No dose patterns or instructions to stop/skip/change medication
  const doseAndChangePattern = /\b(\d+\s*(mg|mcg|ml|tablets?|capsules?)|stop taking|skip dose|increase dose|decrease dose|change medication|discontinue)\b/i;
  if (doseAndChangePattern.test(aiContent)) {
    failures.push('Content contains prohibited dose patterns or treatment change instructions');
  }

  // 7. No medicine names from this visit
  for (const med of medicinesList) {
    if (med && med.trim().length > 2 && aiContent.toLowerCase().includes(med.trim().toLowerCase())) {
      failures.push(`Content contains prescription medicine name (${med})`);
      break;
    }
  }

  // 8. No diagnosis text from this visit
  if (diagnosisText && diagnosisText.trim().length > 3) {
    const diagWords = diagnosisText.split(/\s+/).filter(w => w.length > 4);
    for (const word of diagWords) {
      if (aiContent.toLowerCase().includes(word.toLowerCase())) {
        failures.push(`Content contains diagnosis word (${word})`);
        break;
      }
    }
  }

  return { passed: failures.length === 0, failures };
}

export const followupRoutes: FastifyPluginAsync = async (fastify) => {

  // GET /follow-ups
  fastify.get('/follow-ups', { preHandler: [fastify.authenticate, fastify.requireOnboarded] }, async (request, reply) => {
    const client = createScopedClient(request.token!);
    const { data, error } = await client.from('follow_ups')
      .select('*, patients(id, name, mrn, phone), medical_records(id, symptoms, diagnosis), sms_deliveries(*)')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) return reply.status(400).send({ error: { code: 'FETCH_FAILED', message: error.message } });
    return reply.send(data);
  });

  // GET /follow-ups/:id (status, draft, guardrail reasons, delivery status)
  fastify.get('/follow-ups/:id', { preHandler: [fastify.authenticate, fastify.requireOnboarded] }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const client = createScopedClient(request.token!);

    const { data, error } = await client.from('follow_ups')
      .select('*, patients(*), medical_records(*), sms_deliveries(*)')
      .eq('id', params.id)
      .maybeSingle();

    if (error || !data) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Follow-up not found' } });
    return reply.send(data);
  });

  const postDraftSchema = z.object({
    followUpRequired: z.boolean(),
    aiContent: z.string().max(400).nullable().optional(),
    suggestedDate: z.string().nullable().optional(),
    riskFlags: z.array(z.string()).default([]),
    reasoningSummary: z.string().optional().nullable(),
    guardrailResult: z.object({
      passed: z.boolean(),
      failures: z.array(z.string()).default([]),
    }).optional().nullable(),
    model: z.string().optional().nullable(),
  }).strict();

  // POST /follow-ups/:id/draft (Agent endpoint to save generated draft)
  fastify.post('/follow-ups/:id/draft', { preHandler: [fastify.authenticate, fastify.requireOnboarded, fastify.requireDoctor] }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const client = createScopedClient(request.token!);
    const doctorId = request.user!.id;

    // Check for forbidden fields manually if strict schema doesn't catch them
    const rawBody = (request.body || {}) as Record<string, unknown>;
    const forbiddenKeys = ['approved', 'queued', 'sent', 'final_content', 'approved_by', 'approved_at'];
    for (const key of forbiddenKeys) {
      if (key in rawBody) {
        return reply.status(400).send({
          error: { code: 'INVALID_FIELDS', message: `Draft endpoint cannot write field '${key}'` }
        });
      }
    }

    const data = postDraftSchema.parse(request.body);

    // Fetch follow_up row
    const { data: fu, error: fuErr } = await client.from('follow_ups')
      .select('id, status, doctor_id')
      .eq('id', params.id)
      .eq('doctor_id', doctorId)
      .maybeSingle();

    if (fuErr || !fu) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Follow-up not found or not owned by calling doctor' } });
    }

    if (fu.status !== 'generating') {
      return reply.status(409).send({
        error: { code: 'INVALID_STATE', message: `Follow-up status must be 'generating' to save draft, current is '${fu.status}'` }
      });
    }

    const aiContentToStore = data.followUpRequired ? (data.aiContent || null) : null;

    const { data: updated, error: updateErr } = await client.from('follow_ups')
      .update({
        status: 'draft',
        follow_up_required: data.followUpRequired,
        ai_content: aiContentToStore,
        suggested_date: data.suggestedDate || null,
        risk_flags: data.riskFlags || [],
        ai_reasoning_summary: data.reasoningSummary || null,
        guardrail_result: data.guardrailResult || null,
        ai_model: data.model || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .select('*')
      .single();

    if (updateErr) {
      return reply.status(400).send({ error: { code: 'UPDATE_FAILED', message: updateErr.message } });
    }

    return reply.send(updated);
  });

  // POST /follow-ups/:id/auto-send (Server-side auto-send verification & execution)
  fastify.post('/follow-ups/:id/auto-send', { preHandler: [fastify.authenticate, fastify.requireOnboarded, fastify.requireDoctor] }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const client = createScopedClient(request.token!);
    const doctorId = request.user!.id;

    // Fetch follow-up with patient, medical_record, prescriptions, and doctor's clinic info
    const { data: fu, error: fuErr } = await client.from('follow_ups')
      .select(`
        *,
        patients(*),
        medical_records(*, prescriptions(*, prescription_items(*))),
        doctor_profiles(
          id,
          clinic_id,
          clinics(id, name, followup_send_mode, timezone)
        )
      `)
      .eq('id', params.id)
      .eq('doctor_id', doctorId)
      .maybeSingle();

    if (fuErr || !fu) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Follow-up not found' } });
    }

    const reasons: string[] = [];

    // Check 1: Must be in status 'draft' with follow_up_required = true
    if (fu.status !== 'draft') {
      reasons.push(`Follow-up status is '${fu.status}', must be 'draft'`);
    }
    if (fu.follow_up_required === false) {
      reasons.push('Follow-up is marked as not required');
    }

    // Check 2: Clinic send mode must be 'auto'
    const clinic = (fu.doctor_profiles as any)?.clinics;
    if (clinic?.followup_send_mode !== 'auto') {
      reasons.push(`Clinic followup_send_mode is '${clinic?.followup_send_mode || 'doctor_review'}', must be 'auto'`);
    }

    // Extract medicines and diagnosis for guardrail check
    const medRecord = fu.medical_records as any;
    const diagnosisText = medRecord?.diagnosis || null;
    const medicinesList: string[] = [];
    if (Array.isArray(medRecord?.prescriptions)) {
      for (const rx of medRecord.prescriptions) {
        if (Array.isArray(rx.prescription_items)) {
          for (const item of rx.prescription_items) {
            if (item.medication_name) medicinesList.push(item.medication_name);
          }
        }
      }
    }

    // Check 3: Server-side guardrails recomputed from ai_content and risk_flags
    const clinicName = clinic?.name || 'MediFlow Clinic';
    const guardrailCheck = runServerSideGuardrails(
      fu.ai_content,
      clinicName,
      fu.suggested_date,
      fu.risk_flags || [],
      medicinesList,
      diagnosisText
    );

    if (!guardrailCheck.passed) {
      reasons.push(...guardrailCheck.failures);
    }

    // Check 4: Patient phone, consent, opt-out
    const patient = fu.patients as any;
    if (!patient) {
      reasons.push('Patient record not found');
    } else {
      const e164Regex = /^\+?[1-9]\d{1,14}$/;
      if (!patient.phone || !e164Regex.test(patient.phone.replace(/[\s\-()]/g, ''))) {
        reasons.push('Patient phone is not a valid E.164 phone number');
      }
      if (patient.sms_consent !== true) {
        reasons.push('Patient has not provided SMS consent');
      }
      if (patient.sms_opt_out === true) {
        reasons.push('Patient has opted out of SMS messages');
      }
    }

    // Check 5: Idempotency (no existing SMS delivery for this medical record)
    const { data: existingDeliveries } = await supabaseAdmin.from('sms_deliveries')
      .select('id, follow_ups!inner(record_id)')
      .eq('follow_ups.record_id', fu.record_id);

    if (existingDeliveries && existingDeliveries.length > 0) {
      reasons.push('An SMS delivery has already been dispatched for this medical record');
    }

    // IF ANY CHECK FAILS: set status 'needs_review' with failure reasons, do NOT send
    if (reasons.length > 0) {
      await client.from('follow_ups')
        .update({
          status: 'needs_review',
          needs_review_reasons: reasons,
          updated_at: new Date().toISOString(),
        })
        .eq('id', fu.id);

      return reply.send({ status: 'needs_review', reasons });
    }

    // ALL CHECKS PASSED: Proceed to auto-send
    const nowIso = new Date().toISOString();
    const isFutureDate = fu.suggested_date && new Date(fu.suggested_date) > new Date();
    const targetStatus = isFutureDate ? 'scheduled' : 'queued';
    const scheduledFor = isFutureDate ? new Date(fu.suggested_date).toISOString() : null;

    const { data: updatedFu, error: updateErr } = await client.from('follow_ups')
      .update({
        final_content: fu.ai_content,
        auto_approved_at: nowIso,
        send_mode: 'auto',
        status: targetStatus,
        scheduled_for: scheduledFor,
        updated_at: nowIso,
      })
      .eq('id', fu.id)
      .select('*')
      .single();

    if (updateErr) {
      return reply.status(400).send({ error: { code: 'AUTO_SEND_FAILED', message: updateErr.message } });
    }

    // Create sms_deliveries row with unique idempotency key using supabaseAdmin
    const idempotencyKey = `sms-auto-${fu.id}-${Date.now()}`;
    const { data: delivery, error: delErr } = await supabaseAdmin.from('sms_deliveries')
      .insert({
        follow_up_id: fu.id,
        idempotency_key: idempotencyKey,
        status: 'pending',
      })
      .select('*')
      .single();

    if (delErr) {
      // Revert status to needs_review if insertion fails
      await client.from('follow_ups').update({ status: 'needs_review', needs_review_reasons: [delErr.message] }).eq('id', fu.id);
      return reply.status(400).send({ error: { code: 'DELIVERY_INSERT_FAILED', message: delErr.message } });
    }

    // Enqueue sms-send job
    await boss.send('sms-send', { follow_up_id: fu.id }, { startAfter: scheduledFor ? new Date(scheduledFor) : undefined });

    return reply.send({ status: 'queued', followUp: updatedFu, delivery });
  });

  // POST /follow-ups/:id/approve (Manual doctor approval path)
  const approveSchema = z.object({
    confirmRisk: z.boolean().optional(),
    scheduled_for: z.string().datetime().optional()
  });

  fastify.post('/follow-ups/:id/approve', { preHandler: [fastify.authenticate, fastify.requireOnboarded, fastify.requireDoctor] }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const data = approveSchema.parse(request.body || {});
    const client = createScopedClient(request.token!);
    const doctorId = request.user!.id;

    const { data: fu, error: fuError } = await client.from('follow_ups')
      .select('*')
      .eq('id', params.id)
      .eq('doctor_id', doctorId)
      .maybeSingle();

    if (fuError || !fu) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Follow-up not found' } });
    if (fu.status !== 'draft' && fu.status !== 'needs_review') {
      return reply.status(400).send({ error: { code: 'INVALID_STATUS', message: 'Only draft or needs_review follow-ups can be approved' } });
    }

    const risks = (fu.risk_flags as any[]) || [];
    if (risks.length > 0 && !data.confirmRisk) {
      return reply.status(400).send({ error: { code: 'RISK_UNCONFIRMED', message: 'Please confirm risks to approve' } });
    }

    const final_content = fu.doctor_content || fu.ai_content;
    if (!final_content) {
      return reply.status(400).send({ error: { code: 'NO_CONTENT', message: 'No content available for follow-up' } });
    }

    const { data: updated, error } = await client.from('follow_ups')
      .update({
        status: 'approved',
        final_content,
        approved_by: doctorId,
        approved_at: new Date().toISOString(),
        scheduled_for: data.scheduled_for || null
      })
      .eq('id', params.id)
      .select('*')
      .single();

    if (error) return reply.status(400).send({ error: { code: 'APPROVE_FAILED', message: error.message } });

    // Insert sms_deliveries row using admin client
    const idempotencyKey = `sms-doc-${fu.id}-${Date.now()}`;
    await supabaseAdmin.from('sms_deliveries').insert({
      follow_up_id: fu.id,
      idempotency_key: idempotencyKey,
      status: 'pending',
    });

    await boss.send('sms-send', { follow_up_id: updated.id }, { startAfter: data.scheduled_for ? new Date(data.scheduled_for) : undefined });

    return reply.send(updated);
  });

  // POST /follow-ups/:id/reject
  fastify.post('/follow-ups/:id/reject', { preHandler: [fastify.authenticate, fastify.requireOnboarded, fastify.requireDoctor] }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const client = createScopedClient(request.token!);

    const { data: updated, error } = await client.from('follow_ups')
      .update({ status: 'rejected' })
      .eq('id', params.id)
      .eq('doctor_id', request.user!.id)
      .select('*')
      .single();

    if (error) return reply.status(400).send({ error: { code: 'REJECT_FAILED', message: error.message } });
    return reply.send(updated);
  });

  // POST /follow-ups/:id/regenerate (Trigger re-analysis)
  fastify.post('/follow-ups/:id/regenerate', { preHandler: [fastify.authenticate, fastify.requireOnboarded, fastify.requireDoctor] }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const client = createScopedClient(request.token!);
    const doctorId = request.user!.id;

    const { data: fu, error: fuError } = await client.from('follow_ups')
      .select('*, medical_records(patient_id, patients(mrn))')
      .eq('id', params.id)
      .eq('doctor_id', doctorId)
      .maybeSingle();

    if (fuError || !fu) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Follow-up not found' } });

    const { data: updated, error } = await client.from('follow_ups')
      .update({ status: 'generating', ai_content: null, risk_flags: [] })
      .eq('id', params.id)
      .select('*')
      .single();

    if (error) return reply.status(400).send({ error: { code: 'REGENERATE_FAILED', message: error.message } });

    const mrn = (fu.medical_records as any)?.patients?.mrn || '';
    await boss.send('ai-analysis', {
      follow_up_id: updated.id,
      record_id: updated.record_id,
      mrn,
      token: request.token
    });

    return reply.send(updated);
  });

  // POST /follow-ups/:id/retry
  fastify.post('/follow-ups/:id/retry', { preHandler: [fastify.authenticate, fastify.requireOnboarded, fastify.requireDoctor] }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const client = createScopedClient(request.token!);

    const { data: fu, error: fuError } = await client.from('follow_ups')
      .select('*')
      .eq('id', params.id)
      .eq('doctor_id', request.user!.id)
      .maybeSingle();

    if (fuError || !fu) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Follow-up not found' } });
    if (fu.status !== 'failed') return reply.status(400).send({ error: { code: 'NOT_FAILED', message: 'Only failed follow-ups can be retried' } });

    const { data: updated, error } = await client.from('follow_ups')
      .update({ status: 'generating' })
      .eq('id', params.id)
      .select('*')
      .single();

    if (error) return reply.status(400).send({ error: { code: 'RETRY_FAILED', message: error.message } });

    // Re-enqueue ai-analysis with fresh token from current request
    await boss.send('ai-analysis', {
      follow_up_id: updated.id,
      record_id: updated.record_id,
      token: request.token
    });

    return reply.send(updated);
  });

  // POST /follow-ups/:id/cancel
  fastify.post('/follow-ups/:id/cancel', { preHandler: [fastify.authenticate, fastify.requireOnboarded, fastify.requireDoctor] }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const client = createScopedClient(request.token!);

    const { data: fu, error: fuError } = await client.from('follow_ups')
      .select('*')
      .eq('id', params.id)
      .eq('doctor_id', request.user!.id)
      .maybeSingle();

    if (fuError || !fu) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Follow-up not found' } });
    if (fu.status !== 'queued' && fu.status !== 'scheduled') {
      return reply.status(400).send({ error: { code: 'NOT_QUEUED', message: 'Only queued or scheduled follow-ups can be cancelled' } });
    }

    const { data: updated, error } = await client.from('follow_ups')
      .update({ status: 'cancelled' })
      .eq('id', params.id)
      .select('*')
      .single();

    if (error) return reply.status(400).send({ error: { code: 'CANCEL_FAILED', message: error.message } });

    // Cancel pending sms_deliveries
    await supabaseAdmin.from('sms_deliveries').update({ status: 'cancelled' }).eq('follow_up_id', fu.id);

    return reply.send(updated);
  });
};
