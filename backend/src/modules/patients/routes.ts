import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createScopedClient } from '../../lib/supabase';

const createPatientSchema = z.object({
  name: z.string().max(255),
  phone: z.string().max(50),
  age: z.number().int().min(0).max(120),
  gender: z.string().max(50),
  emergency_contact: z.string().max(255).optional(),
  allergies: z.string().max(1000).optional(),
  sms_consent: z.boolean().default(true),
});

const lookupSchema = z.object({
  mrn: z.string().max(100).optional(),
  phone: z.string().max(50).optional(),
}).refine((d) => !!(d.mrn || d.phone), { message: 'Must provide MRN or phone number' });

export const patientRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/patients', { preHandler: [fastify.authenticate, fastify.requireOnboarded] }, async (request, reply) => {
    const data = createPatientSchema.parse(request.body);
    const client = createScopedClient(request.token!);

    // Duplicate detection based on phone and name
    const { data: existing } = await client.from('patients')
      .select('id, mrn')
      .eq('phone', data.phone)
      .eq('name', data.name)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return reply.status(409).send({ error: { code: 'PATIENT_EXISTS', message: 'Patient already exists with this phone and name', details: existing.mrn } });
    }

    const { data: newPatient, error } = await client.from('patients')
      .insert(data)
      .select('*')
      .single();

    if (error) {
      return reply.status(400).send({ error: { code: 'CREATE_PATIENT_FAILED', message: error.message } });
    }

    return reply.status(201).send(newPatient);
  });

  fastify.post('/patients/lookup', { preHandler: [fastify.authenticate, fastify.requireOnboarded] }, async (request, reply) => {
    const data = lookupSchema.parse(request.body);
    const client = createScopedClient(request.token!);

    let qb = client.from('patients').select('*');
    if (data.mrn && data.phone) {
      qb = qb.or(`mrn.eq.${data.mrn},phone.eq.${data.phone}`);
    } else if (data.mrn) {
      qb = qb.eq('mrn', data.mrn);
    } else if (data.phone) {
      qb = qb.eq('phone', data.phone);
    }

    const { data: patient, error } = await qb.limit(1).maybeSingle();

    if (error || !patient) {
      return reply.status(404).send({ error: { code: 'PATIENT_NOT_FOUND', message: 'Patient not found' } });
    }

    return reply.send(patient);
  });

  fastify.get('/patients', { preHandler: [fastify.authenticate, fastify.requireOnboarded] }, async (request, reply) => {
    // Prevent PostgREST injection by enforcing alphanumeric/spaces/dashes only
    const query = z.object({ 
      q: z.string().regex(/^[a-zA-Z0-9\s\-_]+$/).optional() 
    }).parse(request.query);
    const client = createScopedClient(request.token!);

    let qb = client.from('patients').select('*');
    
    if (query.q) {
      qb = qb.or(`name.ilike.%${query.q}%,mrn.ilike.%${query.q}%,phone.ilike.%${query.q}%`);
    }

    const { data: patients, error } = await qb.limit(50);
    
    if (error) {
      return reply.status(400).send({ error: { code: 'QUERY_FAILED', message: error.message } });
    }

    return reply.send(patients);
  });

  fastify.get('/patients/:mrn', { preHandler: [fastify.authenticate, fastify.requireOnboarded] }, async (request, reply) => {
    const params = z.object({ mrn: z.string().max(100) }).parse(request.params);
    const client = createScopedClient(request.token!);

    const { data: patient, error } = await client.from('patients')
      .select('*')
      .eq('mrn', params.mrn)
      .maybeSingle();

    if (error || !patient) {
      return reply.status(404).send({ error: { code: 'PATIENT_NOT_FOUND', message: 'Patient not found' } });
    }

    return reply.send(patient);
  });
  fastify.get('/patients/:mrn/history-status', { preHandler: [fastify.authenticate, fastify.requireOnboarded, fastify.requireDoctor] }, async (request, reply) => {
    const params = z.object({ mrn: z.string().trim().max(100) }).parse(request.params);
    const client = createScopedClient(request.token!);
    const doctorId = request.user!.id;

    const { data: patient, error: pError } = await client.from('patients')
      .select('id')
      .eq('mrn', params.mrn)
      .maybeSingle();

    if (pError || !patient) {
      return reply.status(404).send({ error: { code: 'PATIENT_NOT_FOUND', message: 'Patient not found' } });
    }

    // Check doctor assignment
    const { data: assignment } = await client.from('doctor_patients')
      .select('patient_id')
      .eq('doctor_id', doctorId)
      .eq('patient_id', patient.id)
      .maybeSingle();

    if (!assignment) {
      // Also check if doctor has any medical record or appointment for this patient
      const { data: rec } = await client.from('medical_records')
        .select('id')
        .eq('doctor_id', doctorId)
        .eq('patient_id', patient.id)
        .limit(1)
        .maybeSingle();

      if (!rec) {
        return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Doctor is not assigned to this patient' } });
      }
    }

    // Count completed medical records written by THIS doctor
    const { count, error: countErr } = await client.from('medical_records')
      .select('id', { count: 'exact', head: true })
      .eq('patient_id', patient.id)
      .eq('doctor_id', doctorId);

    if (countErr) {
      return reply.status(400).send({ error: { code: 'QUERY_FAILED', message: countErr.message } });
    }

    const visitCount = count || 0;
    const isReturning = visitCount > 0;

    return reply.send({ isReturning, visitCount });
  });



  fastify.get('/patients/:mrn/ai-summary', { preHandler: [fastify.authenticate, fastify.requireOnboarded, fastify.requireDoctor] }, async (request, reply) => {
    const params = z.object({ mrn: z.string().trim().regex(/^MRN-\d{4,}$/i) }).parse(request.params);
    const client = createScopedClient(request.token!);
    const doctorId = request.user!.id;

    const { data: patient, error: pError } = await client.from('patients')
      .select('id')
      .eq('mrn', params.mrn)
      .maybeSingle();

    if (pError || !patient) {
      return reply.status(404).send({ error: { code: 'PATIENT_NOT_FOUND', message: 'Patient not found' } });
    }

    const { data: cached } = await client.from('patient_summaries')
      .select('*')
      .eq('patient_id', patient.id)
      .eq('doctor_id', doctorId)
      .maybeSingle();

    if (!cached) {
      return reply.send(null);
    }

    return reply.send({
      summaryText: cached.summary_text || cached.summary,
      keyPoints: cached.key_points || [],
      recordsAnalyzed: cached.records_analyzed || cached.visit_count || 0,
      coveredThroughRecordId: cached.covered_through_record_id || null,
      model: cached.model || null,
    });
  });

  fastify.post('/patients/:mrn/summary/generate', { preHandler: [fastify.authenticate, fastify.requireOnboarded, fastify.requireDoctor] }, async (request, reply) => {
    const params = z.object({ mrn: z.string().trim().regex(/^MRN-\d{4,}$/i) }).parse(request.params);
    const client = createScopedClient(request.token!);
    const doctorId = request.user!.id;
    const mrn = params.mrn.toUpperCase();

    // 1. Patient lookup
    const { data: patient, error: pError } = await client.from('patients')
      .select('id')
      .eq('mrn', mrn)
      .maybeSingle();

    if (pError || !patient) {
      return reply.status(404).send({ error: { code: 'PATIENT_NOT_FOUND', message: 'Patient not found' } });
    }

    // 2. Decide NEW vs RETURNING from database (count completed records by THIS doctor)
    const { count, error: countErr } = await client.from('medical_records')
      .select('id', { count: 'exact', head: true })
      .eq('patient_id', patient.id)
      .eq('doctor_id', doctorId);

    if (countErr) {
      return reply.status(400).send({ error: { code: 'QUERY_FAILED', message: countErr.message } });
    }

    const visitCount = count || 0;
    const isReturning = visitCount > 0;

    // NEW Patient: Return isReturning: false, summary: null WITHOUT calling agent!
    if (!isReturning) {
      return reply.send({ isReturning: false, visitCount: 0, summary: null });
    }

    // 3. RETURNING Patient: Check if cached summary is up-to-date with latest medical record
    const { data: latestRecord } = await client.from('medical_records')
      .select('id, created_at')
      .eq('patient_id', patient.id)
      .eq('doctor_id', doctorId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: cached } = await client.from('patient_summaries')
      .select('*')
      .eq('patient_id', patient.id)
      .eq('doctor_id', doctorId)
      .maybeSingle();

    if (cached && latestRecord && cached.covered_through_record_id === latestRecord.id) {
      return reply.send({
        isReturning: true,
        visitCount,
        summary: {
          summaryText: cached.summary_text || cached.summary,
          keyPoints: cached.key_points || [],
          recordsAnalyzed: cached.records_analyzed || cached.visit_count || visitCount,
          coveredThroughRecordId: cached.covered_through_record_id || null,
          model: cached.model || null,
        },
      });
    }

    // 4. Call Agent POST /v1/history-summary
    const { AgentClient, AgentError } = await import('../../services/agent.client');
    try {
      const agentRes = await AgentClient.requestHistorySummary(mrn, request.token!);
      return reply.send({
        isReturning: true,
        visitCount: agentRes.visitCount || visitCount,
        summary: agentRes.summary || null,
      });
    } catch (err: any) {
      const code = err instanceof AgentError ? err.code : 'AI_GENERATION_FAILED';
      request.log.error({ code }, 'Agent history-summary call failed');
      return reply.status(502).send({
        error: {
          code: 'AI_GENERATION_FAILED',
          message: 'Unable to analyze patient history.',
        }
      });
    }
  });

  const saveAiSummarySchema = z.object({
    summaryText: z.string().max(2000),
    keyPoints: z.array(z.string()).max(8).default([]),
    recordsAnalyzed: z.number().int().min(0),
    coveredThroughRecordId: z.string().uuid().nullable().optional(),
    model: z.string().optional(),
  });

  fastify.post('/patients/:mrn/ai-summary', { preHandler: [fastify.authenticate, fastify.requireOnboarded, fastify.requireDoctor] }, async (request, reply) => {
    const params = z.object({ mrn: z.string().trim().regex(/^MRN-\d{4,}$/i) }).parse(request.params);
    const data = saveAiSummarySchema.parse(request.body);
    const client = createScopedClient(request.token!);
    const doctorId = request.user!.id;
    const mrn = params.mrn.toUpperCase();

    const { data: patient, error: pError } = await client.from('patients')
      .select('id')
      .eq('mrn', mrn)
      .maybeSingle();

    if (pError || !patient) {
      return reply.status(404).send({ error: { code: 'PATIENT_NOT_FOUND', message: 'Patient not found' } });
    }

    // Verify doctor assignment
    const { data: assignment } = await client.from('doctor_patients')
      .select('patient_id')
      .eq('doctor_id', doctorId)
      .eq('patient_id', patient.id)
      .maybeSingle();

    if (!assignment) {
      const { data: rec } = await client.from('medical_records')
        .select('id')
        .eq('doctor_id', doctorId)
        .eq('patient_id', patient.id)
        .limit(1)
        .maybeSingle();

      if (!rec) {
        return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Doctor is not assigned to this patient' } });
      }
    }

    // Upsert into patient_summaries (belonging to calling doctor)
    const { error: upsertErr } = await client.from('patient_summaries')
      .upsert({
        patient_id: patient.id,
        doctor_id: doctorId,
        summary: data.summaryText,
        summary_text: data.summaryText,
        key_points: data.keyPoints,
        records_analyzed: data.recordsAnalyzed,
        visit_count: data.recordsAnalyzed,
        covered_through_record_id: data.coveredThroughRecordId || null,
        model: data.model || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'patient_id,doctor_id' });

    if (upsertErr) {
      return reply.status(400).send({ error: { code: 'SAVE_SUMMARY_FAILED', message: upsertErr.message } });
    }

    return reply.send({ ok: true });
  });

  fastify.delete('/patients/:id', { preHandler: [fastify.authenticate, fastify.requireOnboarded] }, async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const client = createScopedClient(request.token!);

    let { data: patient } = await client.from('patients')
      .select('id, mrn, name')
      .or(`id.eq.${params.id},mrn.eq.${params.id}`)
      .maybeSingle();

    if (!patient) {
      const { data: pByMrn } = await client.from('patients')
        .select('id, mrn, name')
        .eq('mrn', params.id)
        .maybeSingle();
      patient = pByMrn;
    }

    if (!patient) {
      return reply.status(404).send({ error: { code: 'PATIENT_NOT_FOUND', message: 'Patient not found' } });
    }

    const patientId = patient.id;

    // 1. Delete doctor_patients and patient_summaries
    await client.from('doctor_patients').delete().eq('patient_id', patientId);
    await client.from('patient_summaries').delete().eq('patient_id', patientId);

    // 2. Fetch medical records for patient
    const { data: recs } = await client.from('medical_records').select('id').eq('patient_id', patientId);
    const recordIds = (recs || []).map((r: any) => r.id);

    // 3. Fetch follow_ups to delete sms_deliveries first (FK constraint)
    let followUpIds: string[] = [];
    const { data: fus1 } = await client.from('follow_ups').select('id').eq('patient_id', patientId);
    if (fus1) followUpIds.push(...fus1.map((f: any) => f.id));
    if (recordIds.length > 0) {
      const { data: fus2 } = await client.from('follow_ups').select('id').in('record_id', recordIds);
      if (fus2) followUpIds.push(...fus2.map((f: any) => f.id));
    }
    followUpIds = Array.from(new Set(followUpIds));

    if (followUpIds.length > 0) {
      await client.from('sms_deliveries').delete().in('follow_up_id', followUpIds);
    }

    if (recordIds.length > 0) {
      await client.from('follow_up_instructions').delete().in('record_id', recordIds);
    }

    await client.from('follow_ups').delete().eq('patient_id', patientId);
    if (recordIds.length > 0) {
      await client.from('follow_ups').delete().in('record_id', recordIds);
    }

    // 4. Prescriptions and items
    const { data: rxs } = await client.from('prescriptions').select('id').eq('patient_id', patientId);
    let prescriptionIds: string[] = (rxs || []).map((rx: any) => rx.id);
    if (recordIds.length > 0) {
      const { data: rxs2 } = await client.from('prescriptions').select('id').in('record_id', recordIds);
      if (rxs2) prescriptionIds.push(...rxs2.map((rx: any) => rx.id));
    }
    prescriptionIds = Array.from(new Set(prescriptionIds));

    if (prescriptionIds.length > 0) {
      await client.from('prescription_items').delete().in('prescription_id', prescriptionIds);
      await client.from('prescription_versions').delete().in('prescription_id', prescriptionIds);
    }

    await client.from('prescriptions').delete().eq('patient_id', patientId);
    if (recordIds.length > 0) {
      await client.from('prescriptions').delete().in('record_id', recordIds);
    }

    // 5. Delete medical_records and appointments
    await client.from('medical_records').delete().eq('patient_id', patientId);
    await client.from('appointments').delete().eq('patient_id', patientId);

    try {
      await client.from('message_logs').delete().eq('patient_id', patientId);
    } catch (_) {}

    const { error: delErr } = await client.from('patients').delete().eq('id', patientId);

    if (delErr) {
      return reply.status(400).send({ error: { code: 'DELETE_PATIENT_FAILED', message: delErr.message } });
    }

    return reply.send({ success: true, message: `Patient ${patient.name} (${patient.mrn}) deleted successfully.` });
  });
};



