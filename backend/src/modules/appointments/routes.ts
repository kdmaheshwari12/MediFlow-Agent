import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin, createScopedClient } from '../../lib/supabase';
import { getDoctorSlots, getDoctorAvailabilityDates, getDoctorDaySchedule, timeToMinutes } from '../../services/slot.service';

const createAppointmentSchema = z.object({
  patient_id: z.string().uuid(),
  doctor_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeSlot: z.string(), // e.g. "09:30 AM"
  reason: z.string().optional(),
  source: z.string().optional().default('reception_booking'),
});

export const appointmentRoutes: FastifyPluginAsync = async (fastify) => {

  // GET /appointments/slots
  fastify.get('/appointments/slots', { preHandler: [fastify.authenticate, fastify.requireOnboarded] }, async (request, reply) => {
    const query = z.object({
      doctorId: z.string().uuid(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) // YYYY-MM-DD
    }).parse(request.query);

    const client = createScopedClient(request.token!);
    
    try {
      const data = await getDoctorSlots(client, query.doctorId, query.date);
      return reply.send(data);
    } catch (err: any) {
      return reply.status(400).send({ error: { code: 'FETCH_FAILED', message: err.message } });
    }
  });

  // POST /appointments
  fastify.post('/appointments', { preHandler: [fastify.authenticate, fastify.requireOnboarded] }, async (request, reply) => {
    if (request.user!.role === 'doctor') {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Doctors cannot create appointments' } });
    }

    const data = createAppointmentSchema.parse(request.body);
    const client = createScopedClient(request.token!);

    // 1. Fetch staff clinic
    const { data: staff } = await client.from('staff_profiles').select('clinic_id').eq('id', request.user!.id).single();
    if (!staff?.clinic_id) {
      return reply.status(400).send({ error: { code: 'NO_CLINIC', message: 'Staff is not assigned to a clinic' } });
    }

    // 2. SERVER-ENFORCED BOOKING RULES (Single source of truth)
    const daySchedule = await getDoctorDaySchedule({
      client,
      doctorId: data.doctor_id,
      dateStr: data.date,
    });

    if (daySchedule.sessionState === 'NOT_SCHEDULED') {
      return reply.status(400).send({
        error: {
          code: 'DOCTOR_NOT_AVAILABLE',
          message: daySchedule.disabledReason || 'Doctor is not available on this date.'
        }
      });
    }

    if (daySchedule.sessionState === 'ENDED') {
      return reply.status(409).send({
        error: {
          code: 'SLOT_IN_PAST',
          message: 'Doctor session for this date has already ended.'
        }
      });
    }

    if (daySchedule.bookedCount >= daySchedule.dailyLimit) {
      return reply.status(409).send({
        error: {
          code: 'DAILY_LIMIT_REACHED',
          message: 'Doctor has reached maximum patient limit for this date.'
        }
      });
    }

    // Find requested slot
    const targetSlot = daySchedule.slots.find(s => s.time === data.timeSlot);

    if (!targetSlot) {
      return reply.status(400).send({
        error: { code: 'DOCTOR_NOT_AVAILABLE', message: 'Time slot does not belong to doctor\'s availability schedule.' }
      });
    }

    if (targetSlot.state === 'booked') {
      return reply.status(409).send({
        error: { code: 'SLOT_TAKEN', message: 'This time slot is already booked.' }
      });
    }

    if (targetSlot.state === 'past') {
      return reply.status(400).send({
        error: { code: 'SLOT_IN_PAST', message: 'Selected time slot has already passed.' }
      });
    }

    if (targetSlot.state === 'break' || targetSlot.state === 'not_available') {
      return reply.status(400).send({
        error: { code: 'SLOT_UNAVAILABLE', message: `Selected slot is ${targetSlot.state}.` }
      });
    }

    // 3. Compute ISO start & end times based on slot duration
    const slotMins = daySchedule.slotMinutes || 15;
    const slotStartMins = targetSlot.startsAt;
    const startHours = Math.floor(slotStartMins / 60);
    const startMinutes = slotStartMins % 60;
    const isoStart = `${data.date}T${startHours.toString().padStart(2, '0')}:${startMinutes.toString().padStart(2, '0')}:00Z`;

    const startObj = new Date(isoStart);
    startObj.setMinutes(startObj.getMinutes() + slotMins);
    const isoEnd = startObj.toISOString();

    // 4. Initial Status Decision (WAITING if within 30 mins before appointment time or in session)
    const now = new Date();
    const apptStart = new Date(isoStart);
    let initialStatus = 'scheduled';
    let checkedInAt: string | null = null;

    // T-30 minutes before appointment start time OR same-day/in session booking
    if (apptStart.getTime() - now.getTime() <= 30 * 60 * 1000) {
      initialStatus = 'waiting';
      checkedInAt = now.toISOString();
    }

    // 5. Insert Appointment into DB
    const { data: appointment, error } = await supabaseAdmin.from('appointments')
      .insert({
        patient_id: data.patient_id,
        doctor_id: data.doctor_id,
        clinic_id: staff.clinic_id,
        scheduled_start: isoStart,
        scheduled_end: isoEnd,
        date: data.date,
        time_slot: data.timeSlot,
        reason: data.reason || null,
        status: initialStatus,
        checked_in_at: checkedInAt,
        source: data.source || 'reception_booking',
      })
      .select('*, patients(id, name, mrn, phone, age, gender), doctor_profiles(id, name, qualification, doctor_specializations(specializations(name)))')
      .single();

    if (error) {
      if (error.message.includes('prevent_double_booking') || error.code === '23505') {
        return reply.status(409).send({
          error: { code: 'SLOT_TAKEN', message: 'This time slot was just booked by another patient.' }
        });
      }
      return reply.status(400).send({
        error: { code: 'CREATE_APPOINTMENT_FAILED', message: error.message }
      });
    }

    const pObj = Array.isArray(appointment.patients) ? appointment.patients[0] : appointment.patients;
    const dObj = Array.isArray(appointment.doctor_profiles) ? appointment.doctor_profiles[0] : appointment.doctor_profiles;

    if (!pObj?.name || !dObj?.name) {
      return reply.status(500).send({
        error: { code: 'DATA_INTEGRITY_ERROR', message: 'Missing patient or doctor name in database record.' }
      });
    }

    const dSpecs = Array.isArray(dObj.doctor_specializations) ? dObj.doctor_specializations : [];
    const firstSpec = dSpecs[0]?.specializations ? (Array.isArray(dSpecs[0].specializations) ? dSpecs[0].specializations[0] : dSpecs[0].specializations) : null;
    const specName = firstSpec?.name || 'General Specialist';

    const formattedDoctorName = dObj.name.startsWith('Dr.') ? dObj.name : `Dr. ${dObj.name}`;

    return reply.status(201).send({
      ...appointment,
      patient: {
        id: pObj.id,
        mrn: pObj.mrn,
        name: pObj.name,
      },
      doctor: {
        id: dObj.id,
        name: formattedDoctorName,
        specialization: specName,
      },
      statusMessage: initialStatus === 'waiting'
        ? 'Appointment created and placed in the waiting queue.'
        : 'Appointment scheduled successfully.'
    });
  });

  // GET /appointments
  fastify.get('/appointments', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const query = z.object({
      status: z.enum(['scheduled', 'cancelled', 'completed', 'waiting', 'in_progress', 'no_show']).optional(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      doctorId: z.string().uuid().optional(),
      q: z.string().optional(),
      needsReschedule: z.string().optional(), // 'true'
    }).parse(request.query);
    
    let qb = supabaseAdmin.from('appointments').select('*, patients(id, name, mrn, phone, age, gender), doctor_profiles(id, name, qualification, doctor_specializations(specializations(name)))');

    if (request.user!.role === 'doctor') {
      qb = qb.eq('doctor_id', request.user!.id);
    } else if (query.doctorId) {
      qb = qb.eq('doctor_id', query.doctorId);
    }

    if (query.date) {
      qb = qb.gte('scheduled_start', `${query.date}T00:00:00Z`)
             .lt('scheduled_start', `${query.date}T23:59:59Z`);
    }

    if (query.needsReschedule === 'true') {
      qb = qb.eq('needs_reschedule', true);
    }

    const { data: rawAppointments, error } = await qb.order('scheduled_start', { ascending: true });

    if (error) {
      return reply.status(400).send({ error: { code: 'FETCH_APPOINTMENTS_FAILED', message: error.message } });
    }

    const now = new Date();
    let filtered = (rawAppointments || []).map((apt: any) => {
      // Computed status: SCHEDULED -> WAITING when now >= (scheduled_start - 30 minutes)
      if (apt.status === 'scheduled' && apt.scheduled_start) {
        const startTime = new Date(apt.scheduled_start);
        const thirtyMinsBefore = new Date(startTime.getTime() - 30 * 60 * 1000);
        if (now >= thirtyMinsBefore) {
          return { ...apt, status: 'waiting' };
        }
      }
      return apt;
    });

    if (query.status) {
      filtered = filtered.filter((apt: any) => apt.status === query.status);
    }

    if (query.q && query.q.trim()) {
      const q = query.q.trim().toLowerCase();
      filtered = filtered.filter((apt: any) => {
        const p = apt.patients;
        if (!p) return false;
        return (
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.mrn && p.mrn.toLowerCase().includes(q)) ||
          (p.phone && p.phone.toLowerCase().includes(q))
        );
      });
    }

    return reply.send(filtered);
  });

  // GET /appointments/:id
  fastify.get('/appointments/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);

    const { data: appointment, error } = await supabaseAdmin.from('appointments')
      .select('*, patients(*), doctor_profiles(*)')
      .eq('id', params.id)
      .maybeSingle();

    if (error || !appointment) {
      return reply.status(404).send({ error: { code: 'APPOINTMENT_NOT_FOUND', message: 'Appointment not found' } });
    }

    // Computed status on read (T-30 mins)
    if (appointment.status === 'scheduled' && appointment.scheduled_start) {
      const startTime = new Date(appointment.scheduled_start);
      const thirtyMinsBefore = new Date(startTime.getTime() - 30 * 60 * 1000);
      if (new Date() >= thirtyMinsBefore) {
        appointment.status = 'waiting';
      }
    }

    return reply.send(appointment);
  });

  const updateStatusSchema = z.object({ status: z.enum(['scheduled', 'cancelled', 'completed', 'waiting', 'in_progress', 'no_show']) });

  // PATCH /appointments/:id/status (Lifecycle status transitions)
  fastify.patch('/appointments/:id/status', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const data = updateStatusSchema.parse(request.body);

    const { data: existingAppt, error: fetchErr } = await supabaseAdmin.from('appointments')
      .select('*')
      .eq('id', params.id)
      .maybeSingle();

    if (fetchErr || !existingAppt) {
      return reply.status(404).send({ error: { code: 'APPOINTMENT_NOT_FOUND', message: 'Appointment not found' } });
    }

    const doctorId = request.user!.id;
    const isDoctor = request.user!.role === 'doctor';

    // Doctor role restrictions: doctor can only update their own appointments
    if (isDoctor && existingAppt.doctor_id !== doctorId) {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'You can only update status for your assigned appointments.' } });
    }

    const currentStatus = existingAppt.status.toLowerCase();
    const targetStatus = data.status.toLowerCase();

    // Prevent transitions from terminal states
    if (currentStatus === 'completed' || currentStatus === 'done') {
      return reply.status(400).send({
        error: { code: 'INVALID_STATUS_TRANSITION', message: 'Completed appointments cannot be changed.' }
      });
    }

    if (currentStatus === 'cancelled' && targetStatus !== 'scheduled') {
      return reply.status(400).send({
        error: { code: 'INVALID_STATUS_TRANSITION', message: 'Cancelled appointments cannot be changed to ' + targetStatus }
      });
    }

    // 1. Starting Checkup -> IN_PROGRESS
    if (targetStatus === 'in_progress') {
      if (!isDoctor) {
        return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Only assigned doctor can start checkup.' } });
      }

      // Check max 1 in_progress limit per doctor
      const { data: activeAppts } = await supabaseAdmin.from('appointments')
        .select('id')
        .eq('doctor_id', doctorId)
        .eq('status', 'in_progress')
        .neq('id', params.id);

      if (activeAppts && activeAppts.length > 0) {
        return reply.status(409).send({
          error: {
            code: 'MAX_IN_PROGRESS_REACHED',
            message: 'You already have an appointment in progress. Please finish or pause the active checkup before starting another.'
          }
        });
      }
    }

    // 2. Finishing Checkup -> COMPLETED
    if (targetStatus === 'completed') {
      if (!isDoctor) {
        return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Only assigned doctor can complete checkup.' } });
      }
      if (currentStatus === 'scheduled') {
        return reply.status(400).send({
          error: { code: 'INVALID_STATUS_TRANSITION', message: 'Cannot skip directly from scheduled to completed. Start checkup first.' }
        });
      }
    }

    const updatePayload: Record<string, any> = {
      status: targetStatus,
      updated_at: new Date().toISOString()
    };

    if (targetStatus === 'waiting' && !existingAppt.checked_in_at) {
      updatePayload.checked_in_at = new Date().toISOString();
    }
    if (targetStatus === 'in_progress' && !existingAppt.started_at) {
      updatePayload.started_at = new Date().toISOString();
    }
    if (targetStatus === 'completed' && !existingAppt.completed_at) {
      updatePayload.completed_at = new Date().toISOString();
    }

    const { data: appointment, error } = await supabaseAdmin.from('appointments')
      .update(updatePayload)
      .eq('id', params.id)
      .select('*')
      .single();

    if (error) {
      return reply.status(400).send({ error: { code: 'UPDATE_FAILED', message: error.message } });
    }

    return reply.send(appointment);
  });
  
  // PATCH /appointments/:id/reschedule
  fastify.patch('/appointments/:id/reschedule', { preHandler: [fastify.authenticate, fastify.requireOnboarded] }, async (request, reply) => {
    if (request.user!.role === 'doctor') {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Only staff/receptionists can reschedule appointments' } });
    }

    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const bodySchema = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      timeSlot: z.string(),
    });
    const data = bodySchema.parse(request.body);
    const client = createScopedClient(request.token!);

    // Fetch existing appointment
    const { data: existingAppt, error: fetchErr } = await client.from('appointments')
      .select('*')
      .eq('id', params.id)
      .maybeSingle();

    if (fetchErr || !existingAppt) {
      return reply.status(404).send({ error: { code: 'APPOINTMENT_NOT_FOUND', message: 'Appointment not found' } });
    }

    if (existingAppt.status === 'completed' || existingAppt.status === 'in_progress') {
      return reply.status(400).send({
        error: { code: 'CANNOT_RESCHEDULE_COMPLETED', message: 'Completed or in-progress appointments cannot be rescheduled.' }
      });
    }

    // Check availability for new date & timeSlot
    const daySchedule = await getDoctorDaySchedule({
      client,
      doctorId: existingAppt.doctor_id,
      dateStr: data.date,
    });

    if (daySchedule.sessionState === 'NOT_SCHEDULED') {
      return reply.status(400).send({
        error: { code: 'DOCTOR_NOT_AVAILABLE', message: daySchedule.disabledReason || 'Doctor is not available on target date.' }
      });
    }

    if (daySchedule.sessionState === 'ENDED') {
      return reply.status(409).send({
        error: { code: 'SESSION_ENDED', message: 'Doctor session for target date has ended.' }
      });
    }

    const targetSlot = daySchedule.slots.find(s => s.time === data.timeSlot);
    if (!targetSlot) {
      return reply.status(400).send({
        error: { code: 'SLOT_UNAVAILABLE', message: 'Invalid time slot.' }
      });
    }

    if (targetSlot.state === 'booked' && targetSlot.appointmentId !== params.id) {
      return reply.status(409).send({
        error: { code: 'SLOT_CONFLICT', message: 'This time slot is already booked.' }
      });
    }

    if (targetSlot.state === 'past' || targetSlot.state === 'break' || targetSlot.state === 'not_available') {
      return reply.status(400).send({
        error: { code: 'SLOT_UNAVAILABLE', message: `Selected slot is ${targetSlot.state}.` }
      });
    }

    const slotMins = daySchedule.slotMinutes || 15;
    const slotStartMins = targetSlot.startsAt;
    const startHours = Math.floor(slotStartMins / 60);
    const startMinutes = slotStartMins % 60;
    const isoStart = `${data.date}T${startHours.toString().padStart(2, '0')}:${startMinutes.toString().padStart(2, '0')}:00Z`;

    const startObj = new Date(isoStart);
    startObj.setMinutes(startObj.getMinutes() + slotMins);
    const isoEnd = startObj.toISOString();

    const { data: updatedAppt, error: updateErr } = await client.from('appointments')
      .update({
        scheduled_start: isoStart,
        scheduled_end: isoEnd,
        date: data.date,
        time_slot: data.timeSlot,
        status: 'scheduled',
        needs_reschedule: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .select('*, patients(id, name, mrn, phone), doctor_profiles(id, name, qualification)')
      .single();

    if (updateErr) {
      return reply.status(400).send({ error: { code: 'RESCHEDULE_FAILED', message: updateErr.message } });
    }

    return reply.send(updatedAppt);
  });

  // PATCH /appointments/:id/cancel
  fastify.patch('/appointments/:id/cancel', { preHandler: [fastify.authenticate, fastify.requireOnboarded] }, async (request, reply) => {
    if (request.user!.role === 'doctor') {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Only staff/receptionists can cancel appointments' } });
    }

    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const client = createScopedClient(request.token!);

    const { data: existingAppt, error: fetchErr } = await client.from('appointments')
      .select('status')
      .eq('id', params.id)
      .maybeSingle();

    if (fetchErr || !existingAppt) {
      return reply.status(404).send({ error: { code: 'APPOINTMENT_NOT_FOUND', message: 'Appointment not found' } });
    }

    if (existingAppt.status === 'completed') {
      return reply.status(400).send({
        error: { code: 'CANNOT_CANCEL_COMPLETED', message: 'Completed appointments cannot be cancelled.' }
      });
    }

    const { data: updatedAppt, error: updateErr } = await client.from('appointments')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .select('*')
      .single();

    if (updateErr) {
      return reply.status(400).send({ error: { code: 'CANCEL_FAILED', message: updateErr.message } });
    }

    return reply.send(updatedAppt);
  });

  // GET /appointments/queue-stats
  fastify.get('/appointments/queue-stats', { preHandler: [fastify.authenticate, fastify.requireOnboarded] }, async (request, reply) => {
    const client = createScopedClient(request.token!);
    const today = new Date().toISOString().split('T')[0];
    
    const { data, error } = await client.from('appointments')
      .select('status')
      .gte('scheduled_start', `${today}T00:00:00Z`)
      .lt('scheduled_start', `${today}T23:59:59Z`);
      
    if (error) {
      return reply.status(400).send({ error: { code: 'FETCH_FAILED', message: error.message } });
    }
    
    const examined = data.filter(d => d.status === 'completed').length;
    const remaining = data.filter(d => d.status === 'scheduled' || d.status === 'waiting').length;
    const waitingCount = data.filter(d => d.status === 'waiting').length;
    
    return reply.send({ examined, remaining, waitingCount });
  });
};
