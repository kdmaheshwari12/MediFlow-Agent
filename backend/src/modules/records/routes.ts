import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { createScopedClient } from '../../lib/supabase';

const createRecordSchema = z.object({
  appointment_id: z.string().uuid(),
  patient_id: z.string().uuid(),
  symptoms: z.string().optional(),
  diagnosis: z.string().optional(),
  doctor_notes: z.string().optional(),
  treatment_plan: z.string().optional(),
  follow_up_period: z.string().optional(),
  follow_up_required: z.boolean().optional(),
  follow_up_after_days: z.number().int().min(1).max(90).optional().nullable(),
  follow_up_notes: z.string().optional().nullable(),
});

const createPrescriptionSchema = z.object({
  record_id: z.string().uuid(),
  patient_id: z.string().uuid(),
  appointment_id: z.string().uuid().optional(),
  content: z.string().optional(),
  follow_up_period: z.string().optional(),
  items: z.array(z.object({
    medication_name: z.string(),
    dosage: z.string(),
    frequency: z.string(),
    duration_days: z.number(),
    instructions: z.string().optional(),
  })),
});

export const recordRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/records/:id/agent-context', { preHandler: [fastify.authenticate, fastify.requireOnboarded, fastify.requireDoctor] }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const client = createScopedClient(request.token!);
    const doctor_id = request.user!.id;

    const { data: record, error } = await client.from('medical_records')
      .select(`
        *,
        doctor_profiles(
          id,
          clinic_id,
          clinics(id, name, timezone, followup_send_mode)
        ),
        prescriptions(
          id,
          content,
          prescription_items(*)
        ),
        follow_up_instructions(instructions)
      `)
      .eq('id', params.id)
      .eq('doctor_id', doctor_id)
      .maybeSingle();

    if (error || !record) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Record not found' } });
    }

    const symptomsList = record.symptoms
      ? record.symptoms.split(/[,;\n]+/).map((s: string) => s.trim()).filter(Boolean)
      : [];

    const rxItems: any[] = [];
    if (Array.isArray(record.prescriptions)) {
      for (const rx of record.prescriptions) {
        if (Array.isArray(rx.prescription_items)) {
          for (const item of rx.prescription_items) {
            rxItems.push({
              medicine: item.medication_name,
              dosage: item.dosage || null,
              frequency: item.frequency || null,
              duration: item.duration_days ? `${item.duration_days} days` : null,
              instructions: item.instructions || null,
            });
          }
        }
      }
    }

    const clinicObj = (record.doctor_profiles as any)?.clinics;
    const clinicName = clinicObj?.name || 'MediFlow Clinic';
    const clinicTimezone = clinicObj?.timezone || 'UTC';
    const followUpSendMode = clinicObj?.followup_send_mode || 'doctor_review';

    const instText = record.follow_up_notes ||
      (Array.isArray(record.follow_up_instructions) && record.follow_up_instructions.length > 0 ? record.follow_up_instructions[0].instructions : null);

    const followUp = {
      required: record.follow_up_required ?? null,
      afterDays: record.follow_up_after_days ?? null,
      instructions: instText || null,
    };

    return reply.send({
      recordId: record.id,
      clinicName,
      clinicTimezone,
      followUpSendMode,
      chiefComplaint: record.symptoms || null,
      symptoms: symptomsList,
      diagnosis: record.diagnosis || null,
      notes: record.doctor_notes || null,
      treatmentPlan: record.doctor_notes || null,
      prescriptionItems: rxItems,
      followUp,
    });
  });

  fastify.post('/records', { preHandler: [fastify.authenticate, fastify.requireOnboarded] }, async (request, reply) => {
    if (request.user!.role !== 'doctor') {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Only doctors can create records' } });
    }

    const data = createRecordSchema.parse(request.body);
    const client = createScopedClient(request.token!);
    const doctor_id = request.user!.id;

    // 1. Fetch patient MRN
    const { data: patient } = await client.from('patients').select('mrn').eq('id', data.patient_id).single();
    const mrn = patient?.mrn || '';

    // 2. Create record
    const { data: record, error: recordError } = await client.from('medical_records')
      .insert({
        appointment_id: data.appointment_id,
        patient_id: data.patient_id,
        doctor_id,
        symptoms: data.symptoms,
        diagnosis: data.diagnosis,
        doctor_notes: data.doctor_notes,
        follow_up_required: data.follow_up_required ?? true,
        follow_up_after_days: data.follow_up_after_days || null,
        follow_up_notes: data.follow_up_notes || null,
      })
      .select('*')
      .single();

    if (recordError || !record) {
      return reply.status(400).send({ error: { code: 'CREATE_RECORD_FAILED', message: recordError?.message || 'Failed' } });
    }

    // 3. Mark appointment completed
    await client.from('appointments').update({ status: 'completed' }).eq('id', data.appointment_id);

    // 4. Also store follow_up_instructions if provided
    if (data.follow_up_notes) {
      await client.from('follow_up_instructions').insert({
        record_id: record.id,
        instructions: data.follow_up_notes,
      });
    }

    // 5. Follow-up handling
    const isFollowUpRequired = data.follow_up_required !== false;

    if (!isFollowUpRequired) {
      // Doctor marked NO follow-up required: store row as status 'draft', follow_up_required: false, ai_content: null
      await client.from('follow_ups').insert({
        record_id: record.id,
        patient_id: data.patient_id,
        doctor_id,
        status: 'draft',
        follow_up_required: false,
        ai_content: null,
      });
    } else {
      // Create follow-up in 'generating' state
      const { data: followup, error: fuError } = await client.from('follow_ups')
        .insert({
          record_id: record.id,
          patient_id: data.patient_id,
          doctor_id,
          status: 'generating',
          follow_up_required: true,
        })
        .select('*')
        .single();

      if (!fuError && followup) {
        // Enqueue ai-analysis job with doctor token
        import('../../lib/boss').then(({ boss }) => {
          boss.send('ai-analysis', {
            follow_up_id: followup.id,
            record_id: record.id,
            mrn,
            token: request.token
          });
        });
      }
    }

    return reply.status(201).send(record);
  });


  fastify.post('/prescriptions', { preHandler: [fastify.authenticate, fastify.requireOnboarded] }, async (request, reply) => {
    if (request.user!.role !== 'doctor') {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Only doctors can create prescriptions' } });
    }

    const data = createPrescriptionSchema.parse(request.body);
    const client = createScopedClient(request.token!);
    const doctor_id = request.user!.id;

    // Create prescription
    const { data: rx, error: rxError } = await client.from('prescriptions')
      .insert({
        record_id: data.record_id,
        patient_id: data.patient_id,
        doctor_id,
        appointment_id: data.appointment_id || null,
        content: data.content || null,
        follow_up_period: data.follow_up_period || null,
      })
      .select('*')
      .single();

    if (rxError || !rx) {
      return reply.status(400).send({ error: { code: 'CREATE_PRESCRIPTION_FAILED', message: rxError?.message || 'Failed' } });
    }

    // Create items
    if (data.items.length > 0) {
      const itemsToInsert = data.items.map(item => ({ ...item, prescription_id: rx.id }));
      const { error: itemsError } = await client.from('prescription_items').insert(itemsToInsert);
      
      if (itemsError) {
        return reply.status(400).send({ error: { code: 'CREATE_ITEMS_FAILED', message: itemsError.message } });
      }
    }

    return reply.status(201).send(rx);
  });

  fastify.get('/prescriptions/:id', { preHandler: [fastify.authenticate, fastify.requireOnboarded] }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const client = createScopedClient(request.token!);

    const { data: prescription, error } = await client.from('prescriptions')
      .select('*, prescription_items(*)')
      .eq('id', params.id)
      .maybeSingle();

    if (error || !prescription) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Prescription not found' } });
    }
    return reply.send(prescription);
  });

  // Patch prescription (new version via trigger handled automatically on update of prescription row?)
  // Actually, to trigger update we can just touch a column, or update items.
  // Wait, `prescription_versions` trigger listens on `prescriptions` updates. So if we update items, the prescription doesn't automatically increment version unless we update it.
  
  const patchPrescriptionSchema = z.object({
    items: z.array(z.object({
      medication_name: z.string(),
      dosage: z.string(),
      frequency: z.string(),
      duration_days: z.number(),
      instructions: z.string().optional(),
    }))
  });

  fastify.patch('/prescriptions/:id', { preHandler: [fastify.authenticate, fastify.requireOnboarded] }, async (request, reply) => {
    if (request.user!.role !== 'doctor') {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Only doctors can update prescriptions' } });
    }

    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const data = patchPrescriptionSchema.parse(request.body);
    const client = createScopedClient(request.token!);

    // First trigger a version bump on the prescription by updating updated_at directly or a dummy update
    // But updated_at is updated by trigger. Our trigger for version bumps checks `OLD.* IS DISTINCT FROM NEW.*`.
    // Wait, the trigger specifically says: `WHEN (OLD.* IS DISTINCT FROM NEW.* AND NEW.version = OLD.version)`
    // So if we just update the row to itself? No, `DISTINCT` means something must change.
    // Let's add a dummy column or just we can let `updated_at` trigger fire first? `updated_at` trigger changes NEW.updated_at, so OLD.* is distinct from NEW.*!
    
    // Actually, `UPDATE prescriptions SET id = id WHERE id = ...` fires triggers, but `OLD` and `NEW` might be identical before `updated_at` trigger modifies it.
    // Better way: manual bump `version = version` and let the trigger handle it.
    // The instructions say "prescription versioning trigger".
    
    // First, delete old items
    await client.from('prescription_items').delete().eq('prescription_id', params.id);
    
    // Insert new items
    if (data.items.length > 0) {
      const itemsToInsert = data.items.map(item => ({ ...item, prescription_id: params.id }));
      await client.from('prescription_items').insert(itemsToInsert);
    }

    // Now bump prescription to trigger versioning
    // We could literally just do `UPDATE prescriptions SET version = version WHERE id = ?`.
    const { error: rxError } = await client.from('prescriptions').update({ updated_at: new Date().toISOString() }).eq('id', params.id);
    
    if (rxError) {
      return reply.status(400).send({ error: { code: 'UPDATE_PRESCRIPTION_FAILED', message: rxError.message } });
    }

    return reply.send({ message: 'Prescription updated' });
  });

  fastify.get('/prescriptions/:id/versions', { preHandler: [fastify.authenticate, fastify.requireOnboarded] }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const client = createScopedClient(request.token!);

    const { data: versions, error } = await client.from('prescription_versions')
      .select('*')
      .eq('prescription_id', params.id)
      .order('version', { ascending: false });

    if (error) {
      return reply.status(400).send({ error: { code: 'FETCH_VERSIONS_FAILED', message: error.message } });
    }
    return reply.send(versions);
  });

  fastify.get('/records/:id', { preHandler: [fastify.authenticate, fastify.requireOnboarded] }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const client = createScopedClient(request.token!);

    const { data: record, error } = await client.from('medical_records')
      .select('*, prescriptions(*, prescription_items(*))')
      .eq('id', params.id)
      .maybeSingle();

    if (error || !record) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Record not found' } });
    }
    return reply.send(record);
  });

  fastify.get('/prescriptions', { preHandler: [fastify.authenticate, fastify.requireOnboarded] }, async (request, reply) => {
    if (request.user!.role !== 'doctor') {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Only doctors can list prescriptions' } });
    }

    const client = createScopedClient(request.token!);

    const { data: prescriptions, error } = await client.from('prescriptions')
      .select('*, prescription_items(*), patients(*), medical_records(*, appointments(*))')
      .eq('doctor_id', request.user!.id);

    if (error) {
      return reply.status(400).send({ error: { code: 'FETCH_PRESCRIPTIONS_FAILED', message: error.message } });
    }

    return reply.send(prescriptions);
  });

  const createMessageLogSchema = z.object({
    patient_id: z.string().uuid(),
    prescription_id: z.string().uuid().optional().nullable(),
    draft: z.string(),
    status: z.enum(['drafted', 'sent', 'failed']).default('drafted'),
    provider_response: z.record(z.string(), z.any()).optional().nullable(),
    sent_at: z.string().optional().nullable(),
  });

  fastify.post('/message-logs', { preHandler: [fastify.authenticate, fastify.requireOnboarded] }, async (request, reply) => {
    const data = createMessageLogSchema.parse(request.body);
    const client = createScopedClient(request.token!);

    const { data: log, error } = await client.from('message_logs')
      .insert({
        patient_id: data.patient_id,
        prescription_id: data.prescription_id || null,
        draft: data.draft,
        status: data.status,
        provider_response: data.provider_response || null,
        sent_at: data.sent_at || (data.status === 'sent' ? new Date().toISOString() : null),
      })
      .select('*')
      .single();

    if (error) {
      return reply.status(400).send({ error: { code: 'CREATE_MESSAGE_LOG_FAILED', message: error.message } });
    }
    return reply.status(201).send(log);
  });

  fastify.get('/message-logs', { preHandler: [fastify.authenticate, fastify.requireOnboarded] }, async (request, reply) => {
    const query = z.object({
      patient_id: z.string().uuid().optional(),
      prescription_id: z.string().uuid().optional(),
    }).parse(request.query);
    const client = createScopedClient(request.token!);

    let qb = client.from('message_logs').select('*');
    if (query.patient_id) qb = qb.eq('patient_id', query.patient_id);
    if (query.prescription_id) qb = qb.eq('prescription_id', query.prescription_id);

    const { data: logs, error } = await qb.order('created_at', { ascending: false });
    if (error) {
      return reply.status(400).send({ error: { code: 'FETCH_MESSAGE_LOGS_FAILED', message: error.message } });
    }
    return reply.send(logs);
  });
};
