import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin, createScopedClient } from '../../lib/supabase';
import { sendSms } from '../../services/sms.service';

export function maskPhone(phone: string): string {
  if (!phone) return '';
  const trimmed = phone.trim();
  if (trimmed.length <= 5) return '***';
  return `${trimmed.substring(0, 5)}*****${trimmed.substring(trimmed.length - 2)}`;
}

export const messageRoutes: FastifyPluginAsync = async (fastify) => {

  // 1. GET /api/v1/doctors/me/messages (Paginated Messages List for Doctor)
  fastify.get('/doctors/me/messages', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user!.role !== 'doctor') {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Only doctors can access sent message history' } });
    }

    const doctorId = request.user!.id;
    const query = z.object({
      date: z.string().optional(),
      mrn: z.string().optional(),
      q: z.string().optional(),
      status: z.enum(['queued', 'sent', 'delivered', 'failed', 'ALL']).optional().default('ALL'),
      page: z.coerce.number().int().min(1).optional().default(1),
      limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    }).parse(request.query);

    const client = createScopedClient(request.token!);
    const offset = (query.page - 1) * query.limit;

    let qb = client
      .from('sms_logs')
      .select('*, visits(prescription, followup_period)', { count: 'exact' })
      .eq('doctor_id', doctorId);

    if (query.date) {
      qb = qb.gte('created_at', `${query.date}T00:00:00Z`).lte('created_at', `${query.date}T23:59:59Z`);
    }

    if (query.mrn) {
      qb = qb.ilike('patient_mrn', `%${query.mrn.trim().toUpperCase()}%`);
    }

    if (query.status && query.status !== 'ALL') {
      qb = qb.eq('status', query.status);
    }

    if (query.q && query.q.trim()) {
      const qTerm = `%${query.q.trim()}%`;
      qb = qb.or(`patient_name.ilike.${qTerm},patient_mrn.ilike.${qTerm},to_phone.ilike.${qTerm}`);
    }

    qb = qb.order('created_at', { ascending: false }).range(offset, offset + query.limit - 1);

    const { data: logs, count, error } = await qb;

    if (error) {
      return reply.status(400).send({ error: { code: 'FETCH_FAILED', message: error.message } });
    }

    const total = count || 0;
    const totalPages = Math.ceil(total / query.limit);

    const mapped = (logs || []).map((log: any) => ({
      id: log.id,
      visitId: log.visit_id,
      patientId: log.patient_id,
      patientMrn: log.patient_mrn,
      patientName: log.patient_name,
      toPhone: log.to_phone,
      maskedPhone: maskPhone(log.to_phone),
      messageBody: log.message_body,
      previewText: log.message_body ? (log.message_body.length > 80 ? log.message_body.substring(0, 80) + '...' : log.message_body) : '',
      provider: log.provider,
      providerMessageId: log.provider_message_id,
      status: log.status,
      attemptNumber: log.attempt_number || 1,
      errorMessage: log.error_message,
      sentAt: log.sent_at || log.created_at,
      createdAt: log.created_at,
      prescriptionText: log.visits?.prescription || null,
      followupPeriod: log.visits?.followup_period || null,
    }));

    return reply.send({
      messages: mapped,
      data: mapped,
      pagination: {
        total,
        page: query.page,
        limit: query.limit,
        totalPages,
      }
    });
  });

  // 2. GET /api/v1/visits/:id (Full Visit Details & SMS Attempts Timeline)
  fastify.get('/visits/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const client = createScopedClient(request.token!);
    const userRole = request.user!.role;
    const userId = request.user!.id;

    const { data: visit, error: fetchErr } = await client
      .from('visits')
      .select('*, patients(id, mrn, name, age, gender, phone, allergies), appointments(time_slot, date)')
      .eq('id', params.id)
      .maybeSingle();

    if (fetchErr || !visit) {
      return reply.status(404).send({ error: { code: 'VISIT_NOT_FOUND', message: 'Visit record not found' } });
    }

    if (userRole === 'doctor' && visit.doctor_id !== userId) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Cannot access visit record of another doctor' } });
    }

    // Fetch all SMS attempt logs for this visit
    const { data: attempts } = await client
      .from('sms_logs')
      .select('*')
      .eq('visit_id', visit.id)
      .order('attempt_number', { ascending: true });

    const patientObj = Array.isArray(visit.patients) ? visit.patients[0] : visit.patients;

    // Security check for receptionists (mask body and prescription text)
    const isReceptionist = (userRole as string) === 'staff' || (userRole as string) === 'receptionist';

    return reply.send({
      id: visit.id,
      appointmentId: visit.appointment_id,
      patientId: visit.patient_id,
      patientMrn: visit.patient_mrn,
      patientName: patientObj?.name || 'Patient',
      patientPhone: patientObj?.phone || '',
      maskedPhone: maskPhone(patientObj?.phone || ''),
      patientAge: patientObj?.age || '--',
      patientGender: patientObj?.gender || '--',
      allergies: patientObj?.allergies || [],
      prescription: isReceptionist ? '[Restricted]' : visit.prescription,
      followupText: isReceptionist ? '[Restricted]' : visit.followup_text,
      followupPeriod: visit.followup_period,
      draftMessage: isReceptionist ? '[Restricted]' : visit.draft_message,
      draftLanguage: visit.draft_language,
      agentModel: visit.agent_model,
      createdAt: visit.created_at,
      attemptsTimeline: (attempts || []).map((att: any) => ({
        id: att.id,
        attemptNumber: att.attempt_number,
        status: att.status,
        provider: att.provider,
        providerMessageId: att.provider_message_id,
        errorMessage: att.error_message,
        messageBody: isReceptionist ? '[Restricted]' : att.message_body,
        sentAt: att.sent_at || att.created_at,
        createdAt: att.created_at,
      })),
    });
  });

  // 3. GET /api/v1/patients/:mrn/history (Past Visits for Patient by THIS Doctor)
  fastify.get('/patients/:mrn/history', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const params = z.object({ mrn: z.string().trim().max(100) }).parse(request.params);
    const client = createScopedClient(request.token!);
    const doctorId = request.user!.id;
    const mrn = params.mrn.toUpperCase();

    const { data: patient } = await client
      .from('patients')
      .select('id, mrn, name, phone, age, gender, allergies')
      .eq('mrn', mrn)
      .maybeSingle();

    if (!patient) {
      return reply.status(404).send({ error: { code: 'PATIENT_NOT_FOUND', message: 'Patient not found' } });
    }

    const { data: visits } = await client
      .from('visits')
      .select('*, sms_logs(*)')
      .eq('patient_id', patient.id)
      .eq('doctor_id', doctorId)
      .order('created_at', { ascending: false });

    const visitCount = visits?.length || 0;
    const isReturning = visitCount > 0;

    const mappedVisits = (visits || []).map((v: any) => {
      const logs = Array.isArray(v.sms_logs) ? v.sms_logs : (v.sms_logs ? [v.sms_logs] : []);
      const sortedLogs = logs.sort((a: any, b: any) => (a.attempt_number || 1) - (b.attempt_number || 1));
      const latestLog = sortedLogs[sortedLogs.length - 1];

      return {
        id: v.id,
        appointmentId: v.appointment_id,
        date: v.created_at,
        prescription: v.prescription,
        followupPeriod: v.followup_period,
        draftMessage: v.draft_message,
        latestSmsStatus: latestLog?.status || 'queued',
        attemptsTimeline: sortedLogs.map((att: any) => ({
          id: att.id,
          attemptNumber: att.attempt_number,
          status: att.status,
          provider: att.provider,
          errorMessage: att.error_message,
          messageBody: att.message_body,
          sentAt: att.sent_at || att.created_at,
        })),
      };
    });

    const allergies = patient.allergies
      ? (typeof patient.allergies === 'string' ? patient.allergies.split(/[,;\n]+/).map((a: string) => a.trim()).filter(Boolean) : patient.allergies)
      : [];

    return reply.send({
      isReturning,
      visitCount,
      allergies,
      patient,
      visits: mappedVisits,
      history: mappedVisits,
    });
  });

  // 4. POST /api/v1/sms/:visitId/retry (Retry Sending Stored SMS for Visit)
  fastify.post('/sms/:visitId/retry', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user!.role !== 'doctor') {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Only doctors can retry sending SMS' } });
    }

    const params = z.object({ visitId: z.string().uuid() }).parse(request.params);
    const doctorId = request.user!.id;
    const client = createScopedClient(request.token!);

    const { data: visit, error: fetchErr } = await client
      .from('visits')
      .select('*, patients(name, phone, mrn)')
      .eq('id', params.visitId)
      .maybeSingle();

    if (fetchErr || !visit) {
      return reply.status(404).send({ error: { code: 'VISIT_NOT_FOUND', message: 'Visit record not found' } });
    }

    if (visit.doctor_id !== doctorId) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Cannot resend SMS for another doctor\'s visit' } });
    }

    // Get latest attempt number
    const { data: existingLogs } = await client
      .from('sms_logs')
      .select('attempt_number')
      .eq('visit_id', visit.id)
      .order('attempt_number', { ascending: false })
      .limit(1);

    const lastAttempt = existingLogs && existingLogs.length > 0 ? existingLogs[0].attempt_number : 0;
    const newAttemptNum = lastAttempt + 1;

    const patientObj = Array.isArray(visit.patients) ? visit.patients[0] : visit.patients;
    const patientName = patientObj?.name || 'Patient';
    const patientPhone = patientObj?.phone || '';
    const bodyToSend = visit.draft_message || visit.prescription;

    // Send SMS via provider
    const smsRes = await sendSms(patientPhone, bodyToSend);

    // Insert new sms_logs row (never overwrite)
    const { data: newSmsLog, error: insErr } = await client
      .from('sms_logs')
      .insert({
        visit_id: visit.id,
        patient_id: visit.patient_id,
        patient_mrn: visit.patient_mrn,
        patient_name: patientName,
        doctor_id: doctorId,
        to_phone: patientPhone,
        message_body: bodyToSend,
        provider: smsRes.providerResponse?.provider || 'mock',
        provider_message_id: smsRes.providerResponse?.messageId || null,
        provider_response: smsRes.providerResponse || null,
        status: smsRes.success ? 'sent' : 'failed',
        attempt_number: newAttemptNum,
        error_message: smsRes.errorReason || null,
        sent_at: smsRes.success ? new Date().toISOString() : null,
      })
      .select('*')
      .single();

    if (insErr) {
      return reply.status(400).send({ error: { code: 'RETRY_FAILED', message: insErr.message } });
    }

    return reply.send({
      ok: true,
      attemptNumber: newAttemptNum,
      smsLog: newSmsLog,
      status: newSmsLog.status,
    });
  });
};
