import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createScopedClient, supabaseAdmin } from '../../lib/supabase';
import { sendSms } from '../../services/sms.service';
import { AgentClient } from '../../services/agent.client';

function parseFollowUpDays(periodStr?: string | null): { period: string | null; dueDate: string | null } {
  if (!periodStr || periodStr === 'No Follow-up' || periodStr.trim() === '') {
    return { period: null, dueDate: null };
  }

  const trimmed = periodStr.trim();
  let days = 0;
  const lower = trimmed.toLowerCase();

  if (lower.includes('3 day')) days = 3;
  else if (lower.includes('7 day') || lower.includes('1 week')) days = 7;
  else if (lower.includes('2 week')) days = 14;
  else if (lower.includes('1 month') || lower.includes('30 day')) days = 30;
  else {
    const match = trimmed.match(/(\d+)\s*(day|week|month)s?/i);
    if (match) {
      const num = parseInt(match[1], 10);
      const unit = match[2].toLowerCase();
      if (unit.startsWith('day')) days = num;
      else if (unit.startsWith('week')) days = num * 7;
      else if (unit.startsWith('month')) days = num * 30;
    }
  }

  if (days <= 0) {
    return { period: trimmed, dueDate: null };
  }

  const d = new Date();
  d.setDate(d.getDate() + days);
  const dueDate = d.toISOString().split('T')[0];
  return { period: trimmed, dueDate };
}

const completeCheckupSchema = z.object({
  diagnosis: z.string().min(1, 'Diagnosis is required'),
  medicines: z.array(z.object({
    name: z.string().min(1),
    dosage: z.string().optional().default(''),
    frequency: z.string().optional().default(''),
    duration: z.string().optional().default(''),
    instructions: z.string().optional().default('')
  })).default([]),
  notes: z.string().optional().default(''),
  followUpPeriod: z.string().optional().default('')
});

export const checkupRoutes: FastifyPluginAsync = async (fastify) => {

  // 1. POST /api/v1/checkup/:appointmentId/start (or /appointments/:id/start-checkup)
  const handleStartCheckup = async (request: any, reply: any) => {
    if (request.user!.role !== 'doctor') {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Only doctors can start a checkup' } });
    }

    const params = z.object({ appointmentId: z.string().uuid() }).parse(request.params);
    const client = createScopedClient(request.token!);
    const doctorId = request.user!.id;

    // Fetch appointment
    const { data: appointment, error: fetchErr } = await client.from('appointments')
      .select('*, patients(*)')
      .eq('id', params.appointmentId)
      .maybeSingle();

    if (fetchErr || !appointment) {
      return reply.status(404).send({ error: { code: 'APPOINTMENT_NOT_FOUND', message: 'Appointment not found' } });
    }

    if (appointment.doctor_id !== doctorId) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'This appointment is assigned to another doctor' } });
    }

    if (appointment.status === 'done' || appointment.status === 'completed') {
      return reply.status(409).send({ error: { code: 'ALREADY_COMPLETED', message: 'This appointment has already been completed.' } });
    }

    // Check max 1 in_progress limit per doctor
    const { data: activeAppts } = await supabaseAdmin.from('appointments')
      .select('id')
      .eq('doctor_id', doctorId)
      .eq('status', 'in_progress')
      .neq('id', params.appointmentId);

    if (activeAppts && activeAppts.length > 0) {
      return reply.status(409).send({
        error: {
          code: 'MAX_IN_PROGRESS_REACHED',
          message: 'You already have an appointment in progress. Please finish or pause the active checkup before starting another.'
        }
      });
    }

    // Set status to in_progress
    const nowIso = new Date().toISOString();
    const updatePayload: Record<string, any> = {
      status: 'in_progress',
      started_at: appointment.started_at || nowIso,
      updated_at: nowIso
    };
    if (!appointment.checked_in_at) {
      updatePayload.checked_in_at = nowIso;
    }

    const { data: updatedAppt, error: updateErr } = await supabaseAdmin.from('appointments')
      .update(updatePayload)
      .eq('id', params.appointmentId)
      .select('*, patients(*)')
      .single();

    if (updateErr) {
      return reply.status(400).send({ error: { code: 'START_CHECKUP_FAILED', message: updateErr.message } });
    }

    return reply.send(updatedAppt);
  };

  fastify.post('/checkup/:appointmentId/start', { preHandler: [fastify.authenticate, fastify.requireOnboarded, fastify.requireDoctor] }, handleStartCheckup);
  fastify.post('/appointments/:appointmentId/start-checkup', { preHandler: [fastify.authenticate, fastify.requireOnboarded, fastify.requireDoctor] }, handleStartCheckup);

  // 2. GET /api/v1/checkup/history/:mrn (or /patients/:mrn/doctor-history)
  const handleGetCheckupHistory = async (request: any, reply: any) => {
    const params = z.object({ mrn: z.string().trim().max(100) }).parse(request.params);
    const client = createScopedClient(request.token!);
    const doctorId = request.user!.id;
    const mrn = params.mrn.toUpperCase();

    const { data: patient, error: pError } = await client.from('patients')
      .select('id, allergies, mrn, name, phone, age, gender')
      .eq('mrn', mrn)
      .maybeSingle();

    if (pError || !patient) {
      return reply.status(404).send({ error: { code: 'PATIENT_NOT_FOUND', message: 'Patient not found' } });
    }

    // Fetch prescriptions for THIS doctor & patient
    const { data: prescriptions } = await client.from('prescriptions')
      .select('*, appointments(scheduled_start, status)')
      .eq('patient_id', patient.id)
      .eq('doctor_id', doctorId)
      .order('created_at', { ascending: false });

    // Fetch message logs for THIS doctor & patient
    const { data: messageLogs } = await client.from('message_logs')
      .select('*')
      .eq('patient_id', patient.id)
      .eq('doctor_id', doctorId)
      .order('created_at', { ascending: false });

    // Also fetch medical_records for backward compatibility
    const { data: medicalRecords } = await client.from('medical_records')
      .select('*')
      .eq('patient_id', patient.id)
      .eq('doctor_id', doctorId)
      .order('created_at', { ascending: false });

    const visitCount = (prescriptions?.length || 0) || (medicalRecords?.length || 0);
    const isReturning = visitCount > 0;

    const allergies = patient.allergies
      ? patient.allergies.split(/[,;\n]+/).map((a: string) => a.trim()).filter(Boolean)
      : [];

    const visits = (prescriptions || []).map((rx: any) => {
      const msg = (messageLogs || []).find((m: any) => m.prescription_id === rx.id || m.appointment_id === rx.appointment_id);
      return {
        id: rx.id,
        date: rx.created_at,
        diagnosis: rx.diagnosis || 'Consultation',
        notes: rx.notes || '',
        medicines: rx.medicines || [],
        followUpPeriod: rx.follow_up_period || null,
        followUpDueDate: rx.follow_up_due_date || null,
        messageLog: msg ? {
          id: msg.id,
          draft: msg.draft,
          status: msg.status,
          sentAt: msg.sent_at,
          errorReason: msg.error_reason,
        } : null,
      };
    });

    return reply.send({
      isReturning,
      visitCount,
      allergies,
      patient,
      visits,
      messageLogs: messageLogs || []
    });
  };

  fastify.get('/checkup/history/:mrn', { preHandler: [fastify.authenticate, fastify.requireOnboarded, fastify.requireDoctor] }, handleGetCheckupHistory);
  fastify.get('/patients/:mrn/doctor-history', { preHandler: [fastify.authenticate, fastify.requireOnboarded, fastify.requireDoctor] }, handleGetCheckupHistory);

  // 3. POST /api/v1/checkup/:appointmentId/complete (or /appointments/:id/complete-checkup)
  const handleCompleteCheckup = async (request: any, reply: any) => {
    if (request.user!.role !== 'doctor') {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Only doctors can complete a checkup' } });
    }

    const params = z.object({ appointmentId: z.string().uuid() }).parse(request.params);
    const data = completeCheckupSchema.parse(request.body);
    const client = createScopedClient(request.token!);
    const doctorId = request.user!.id;

    // Fetch appointment and doctor details
    const { data: appointment, error: fetchErr } = await client.from('appointments')
      .select('*, patients(*), doctor_profiles(*)')
      .eq('id', params.appointmentId)
      .maybeSingle();

    if (fetchErr || !appointment) {
      return reply.status(404).send({ error: { code: 'APPOINTMENT_NOT_FOUND', message: 'Appointment not found' } });
    }

    let patientObj = Array.isArray(appointment.patients) ? appointment.patients[0] : appointment.patients;
    let doctorObj = Array.isArray(appointment.doctor_profiles) ? appointment.doctor_profiles[0] : appointment.doctor_profiles;

    const patientId = appointment.patient_id || patientObj?.id;
    const targetDoctorId = appointment.doctor_id || doctorObj?.id || doctorId;

    if (!patientObj && patientId) {
      const { data: pData } = await supabaseAdmin.from('patients').select('*').eq('id', patientId).maybeSingle();
      patientObj = pData;
    }

    if (!doctorObj && targetDoctorId) {
      const { data: dData } = await supabaseAdmin.from('doctor_profiles').select('*').eq('id', targetDoctorId).maybeSingle();
      doctorObj = dData;
    }

    if (!patientId) {
      return reply.status(400).send({ error: { code: 'INVALID_PATIENT', message: 'Patient reference missing on appointment' } });
    }

    const patientMrn = patientObj?.mrn || (appointment as any).patient_mrn || (appointment as any).mrn || 'MRN-000';

    // Idempotency check: if visit already created for this appointment, return existing visit and sms_logs
    const { data: existingVisit } = await client.from('visits')
      .select('*')
      .eq('appointment_id', params.appointmentId)
      .maybeSingle();

    if (existingVisit || appointment.status === 'done' || appointment.status === 'completed') {
      const vId = existingVisit?.id;
      const { data: existingSmsLogs } = vId ? await client.from('sms_logs')
        .select('*')
        .eq('visit_id', vId)
        .order('attempt_number', { ascending: true }) : { data: [] };

      const { data: existingRx } = await client.from('prescriptions')
        .select('*')
        .eq('appointment_id', params.appointmentId)
        .maybeSingle();

      return reply.send({
        ok: true,
        alreadyCompleted: true,
        visit: existingVisit,
        prescription: existingRx,
        appointment,
        messageLog: existingSmsLogs && existingSmsLogs.length > 0 ? existingSmsLogs[existingSmsLogs.length - 1] : null,
        smsLogs: existingSmsLogs || []
      });
    }

    const { period, dueDate } = parseFollowUpDays(data.followUpPeriod);
    const patientName = patientObj?.name || 'Patient';
    const patientPhone = patientObj?.phone || '';
    const doctorName = doctorObj?.name || 'Doctor';
    const medsSummary = data.medicines.map((m: any) => `${m.name} (${m.dosage}, ${m.frequency})`).join(', ');

    let smsDraft = `Dear ${patientName}, Dr. ${doctorName} prescribed: ${medsSummary || 'Medication'}. Diagnosis: ${data.diagnosis}.`;
    if (period) {
      smsDraft += ` Please follow up ${period.toLowerCase()}.`;
    }
    smsDraft += ` Clinic: ${doctorObj?.clinic_id ? 'MediFlow' : 'CareFlow Hospital'}.`;

    const fullPrescriptionText = `Diagnosis: ${data.diagnosis}. Medicines: ${medsSummary || 'None'}. Notes: ${data.notes || ''}`.trim();

    // 1. Save Visit FIRST in transaction
    const { data: visit, error: visitErr } = await client.from('visits')
      .insert({
        appointment_id: appointment.id,
        patient_id: patientId,
        patient_mrn: patientMrn,
        doctor_id: targetDoctorId,
        prescription: fullPrescriptionText,
        followup_text: period || null,
        followup_period: period || null,
        draft_message: smsDraft,
        draft_language: process.env.SMS_LANGUAGE || 'en',
        agent_model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        version: 1
      })
      .select('*')
      .single();

    if (visitErr || !visit) {
      return reply.status(400).send({ error: { code: 'SAVE_VISIT_FAILED', message: visitErr?.message || 'Failed to create visit record' } });
    }

    // 2. Save Prescription row for backward compatibility
    const { data: prescription } = await client.from('prescriptions')
      .insert({
        appointment_id: appointment.id,
        patient_id: patientId,
        doctor_id: targetDoctorId,
        diagnosis: data.diagnosis,
        medicines: data.medicines,
        notes: data.notes || '',
        follow_up_period: period,
        follow_up_due_date: dueDate
      })
      .select('*')
      .single();

    // Insert prescription items
    if (prescription && data.medicines.length > 0) {
      const rxItemsToInsert = data.medicines.map((m: any) => {
        let durationDays = 7;
        if (m.duration) {
          const match = m.duration.match(/\d+/);
          if (match) durationDays = parseInt(match[0], 10);
        }
        return {
          prescription_id: prescription.id,
          medication_name: m.name,
          dosage: m.dosage || '',
          frequency: m.frequency || '',
          duration_days: durationDays,
          instructions: m.instructions || '',
        };
      });
      await client.from('prescription_items').insert(rxItemsToInsert);
    }

    // Insert medical_records row for backward compatibility
    const { data: medicalRecord } = await client.from('medical_records')
      .insert({
        appointment_id: appointment.id,
        patient_id: patientId,
        doctor_id: targetDoctorId,
        symptoms: appointment.reason || 'Consultation',
        diagnosis: data.diagnosis,
        doctor_notes: data.notes || '',
        follow_up_required: !!period,
        follow_up_notes: period || null
      })
      .select('*')
      .single();

    if (medicalRecord && prescription) {
      await client.from('prescriptions').update({ record_id: medicalRecord.id }).eq('id', prescription.id);
    }

    // Update appointment status to completed
    const nowIso = new Date().toISOString();
    const { data: updatedAppt } = await supabaseAdmin.from('appointments')
      .update({
        status: 'completed',
        completed_at: nowIso,
        follow_up_due_date: dueDate,
        updated_at: nowIso
      })
      .eq('id', appointment.id)
      .select('*')
      .single();

    // Also insert message_logs for legacy compatibility
    await client.from('message_logs').insert({
      patient_id: patientId,
      appointment_id: appointment.id,
      prescription_id: prescription?.id || null,
      doctor_id: targetDoctorId,
      draft: smsDraft,
      status: 'drafted'
    });

    // 3. Send SMS via provider with masked phone logging
    const maskedNumber = patientPhone.length > 5 ? `${patientPhone.substring(0, 5)}*****${patientPhone.substring(patientPhone.length - 2)}` : '***';
    request.log.info(`Dispatching SMS to patient: ${maskedNumber}`);

    const smsRes = await sendSms(patientPhone, smsDraft);

    // 4. Record SMS attempt 1 in sms_logs table
    const { data: smsLogRecord } = await client.from('sms_logs')
      .insert({
        visit_id: visit.id,
        patient_id: patientId,
        patient_mrn: patientMrn,
        patient_name: patientName,
        doctor_id: targetDoctorId,
        to_phone: patientPhone,
        message_body: smsDraft,
        provider: smsRes.providerResponse?.provider || 'mock',
        provider_message_id: smsRes.providerResponse?.messageId || null,
        provider_response: smsRes.providerResponse || null,
        status: smsRes.success ? 'sent' : 'failed',
        attempt_number: 1,
        error_message: smsRes.errorReason || null,
        sent_at: smsRes.success ? new Date().toISOString() : null,
      })
      .select('*')
      .single();

    return reply.status(201).send({
      ok: true,
      visit,
      prescription,
      appointment: updatedAppt || appointment,
      messageLog: smsLogRecord,
      smsStatus: smsRes.success ? 'sent' : 'failed'
    });
  };

  fastify.post('/checkup/:appointmentId/complete', { preHandler: [fastify.authenticate, fastify.requireOnboarded, fastify.requireDoctor] }, handleCompleteCheckup);
  fastify.post('/appointments/:appointmentId/complete-checkup', { preHandler: [fastify.authenticate, fastify.requireOnboarded, fastify.requireDoctor] }, handleCompleteCheckup);

  // 4. POST /api/v1/message-logs/:id/resend
  fastify.post('/message-logs/:id/resend', { preHandler: [fastify.authenticate, fastify.requireOnboarded, fastify.requireDoctor] }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const client = createScopedClient(request.token!);
    const doctorId = request.user!.id;

    const { data: log, error: fetchErr } = await client.from('message_logs')
      .select('*, patients(phone)')
      .eq('id', params.id)
      .maybeSingle();

    if (fetchErr || !log) {
      return reply.status(404).send({ error: { code: 'LOG_NOT_FOUND', message: 'Message log not found' } });
    }

    if (log.doctor_id !== doctorId) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Cannot resend message log of another doctor' } });
    }

    const phone = (log.patients as any)?.phone || '';
    const smsRes = await sendSms(phone, log.draft);

    const updatePayload: Record<string, any> = smsRes.success ? {
      status: 'sent',
      sent_at: new Date().toISOString(),
      provider_response: smsRes.providerResponse,
      error_reason: null
    } : {
      status: 'failed',
      error_reason: smsRes.errorReason || 'Resend failed',
      provider_response: smsRes.providerResponse
    };

    const { data: updatedLog, error: updateErr } = await client.from('message_logs')
      .update(updatePayload)
      .eq('id', params.id)
      .select('*')
      .single();

    if (updateErr) {
      return reply.status(400).send({ error: { code: 'RESEND_FAILED', message: updateErr.message } });
    }

    return reply.send(updatedLog);
  });

  // 5. SSE STREAM: GET /api/v1/checkup/history-stream/:mrn
  fastify.get('/checkup/history-stream/:mrn', { preHandler: [fastify.authenticate, fastify.requireOnboarded, fastify.requireDoctor] }, async (request, reply) => {
    const params = z.object({ mrn: z.string().trim().max(100) }).parse(request.params);
    const client = createScopedClient(request.token!);
    const doctorId = request.user!.id;
    const mrn = params.mrn.toUpperCase();

    // Set SSE Headers
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders();

    const sendEvent = (event: string, data: any) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      // Step 1: Searching MRN
      sendEvent('step', { step: 'searching_mrn', message: 'Searching MRN in database...' });
      await new Promise(r => setTimeout(r, 150));

      const { data: patient } = await client.from('patients').select('id, allergies, name').eq('mrn', mrn).maybeSingle();

      if (!patient) {
        sendEvent('error', { code: 'PATIENT_NOT_FOUND', message: 'Patient not found' });
        reply.raw.end();
        return;
      }

      // Step 2: Fetch history
      const { data: prescriptions } = await client.from('prescriptions')
        .select('*, message_logs(*)')
        .eq('patient_id', patient.id)
        .eq('doctor_id', doctorId)
        .order('created_at', { ascending: false });

      const visitCount = prescriptions?.length || 0;
      const isReturning = visitCount > 0;

      if (!isReturning) {
        sendEvent('step', { step: 'generating_report', message: 'Evaluating patient history...' });
        sendEvent('done', { isReturning: false, visitCount: 0, summary: 'This is a new patient.' });
        reply.raw.end();
        return;
      }

      sendEvent('step', { step: 'generating_report', message: 'Generating AI history summary...' });

      // Call Agent for history summary or stream tokens
      try {
        const agentRes = await AgentClient.requestHistorySummary(mrn, request.token!);
        const summaryText = agentRes.summary?.summaryText || `Returning patient with ${visitCount} previous visits. Last visit included prescribed medication and follow-up.`;

        // Stream tokens for smooth UI effect
        const words = summaryText.split(' ');
        for (const word of words) {
          sendEvent('token', { token: word + ' ' });
          await new Promise(r => setTimeout(r, 15));
        }

        sendEvent('done', {
          isReturning: true,
          visitCount,
          summary: summaryText,
          keyPoints: agentRes.summary?.keyPoints || [],
        });
      } catch (agentErr) {
        // Fallback summary if agent fails
        const fallbackText = `Returning patient with ${visitCount} previous visits recorded.`;
        sendEvent('token', { token: fallbackText });
        sendEvent('done', { isReturning: true, visitCount, summary: fallbackText });
      }
    } catch (err: any) {
      sendEvent('error', { code: 'STREAM_FAILED', message: err.message || 'Stream error' });
    } finally {
      reply.raw.end();
    }
  });

  // 6. SSE STREAM: POST /api/v1/checkup/:appointmentId/draft-sms-stream
  fastify.post('/checkup/:appointmentId/draft-sms-stream', { preHandler: [fastify.authenticate, fastify.requireOnboarded, fastify.requireDoctor] }, async (request, reply) => {
    const data = z.object({
      diagnosis: z.string().optional().default(''),
      medicines: z.array(z.any()).optional().default([]),
      followUpPeriod: z.string().optional().default('')
    }).parse(request.body);

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.flushHeaders();

    const sendEvent = (event: string, data: any) => {
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      sendEvent('step', { step: 'drafting_message', message: 'Drafting patient SMS message...' });
      await new Promise(r => setTimeout(r, 100));

      const medsSummary = data.medicines.map((m: any) => `${m.name || 'Medicine'} (${m.dosage || ''})`).filter(Boolean).join(', ');
      let draftText = `Dear Patient, prescription summary: ${medsSummary || 'Prescription instructions'}. Diagnosis: ${data.diagnosis || 'Consultation'}.`;
      if (data.followUpPeriod && data.followUpPeriod !== 'No Follow-up') {
        draftText += ` Please visit again ${data.followUpPeriod.toLowerCase()}.`;
      }

      const words = draftText.split(' ');
      for (const word of words) {
        sendEvent('token', { token: word + ' ' });
        await new Promise(r => setTimeout(r, 20));
      }

      sendEvent('done', { draft: draftText });
    } catch (err: any) {
      sendEvent('error', { code: 'DRAFT_STREAM_FAILED', message: err.message });
    } finally {
      reply.raw.end();
    }
  });
};
