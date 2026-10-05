import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin, createScopedClient } from '../../lib/supabase';
import { validateCnicFormat, normalizeCnic, maskCnic } from '../../lib/cnic';
import {
  getDoctorDaySchedule,
  getDoctorSlots,
  getDoctorAvailabilityDates,
  findNextAvailableDate,
  minutesToTimeStr,
  timeToMinutes,
} from '../../services/slot.service';

import {
  saveDoctorAvailabilitySchema,
  getServerZonedNow,
  parseTimeToMinutes,
  formatMinutesToHHMMSS,
  validateAvailabilityItems,
  expandAvailabilityItems,
} from '../../lib/availability-contract';

export const doctorRoutes: FastifyPluginAsync = async (fastify) => {
  // Specializations suggestion
  fastify.get('/specializations/suggest', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const query = z.object({
      q: z.string().max(100).optional()
    }).parse(request.query);

    const client = createScopedClient(request.token!);
    
    let qb = client.from('specializations')
      .select('id, name')
      .eq('is_active', true)
      .order('name')
      .limit(10);

    if (query.q && query.q.trim().length > 0) {
      qb = qb.ilike('name', `%${query.q.replace(/[%_\\]/g, '\\$&')}%`);
    }

    const { data, error } = await qb;
    if (error) return reply.status(400).send({ error: { code: 'FETCH_FAILED', message: error.message } });
    return reply.send(data);
  });

  // Specializations list
  fastify.get('/specializations', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const query = z.object({
      withDoctors: z.string().optional()
    }).parse(request.query);

    if (query.withDoctors === 'true') {
      let qb = supabaseAdmin.from('doctor_specializations')
        .select(`
          specializations (id, name, slug),
          doctor_profiles!inner (id, clinic_id, onboarding_status)
        `);

      let { data, error } = await qb;

      if (error || !data || data.length === 0) {
        const { data: allSpecs } = await supabaseAdmin.from('specializations').select('id, name, slug').eq('is_active', true).order('name');
        return reply.send((allSpecs || []).map((s: any) => ({ ...s, count: 1, doctorCount: 1 })));
      }

      const specMap = new Map<string, any>();
      for (const row of (data || [])) {
        const specList = Array.isArray(row.specializations) ? row.specializations : (row.specializations ? [row.specializations] : []);
        for (const spec of specList) {
          if (!spec) continue;

          if (!specMap.has(spec.id)) {
            specMap.set(spec.id, { id: spec.id, name: spec.name, slug: spec.slug, _doctorIds: new Set() });
          }
          const docs = Array.isArray(row.doctor_profiles) ? row.doctor_profiles : [row.doctor_profiles];
          docs.forEach((doc: any) => {
             if (doc && doc.id) {
               specMap.get(spec.id)._doctorIds.add(doc.id);
             }
          });
        }
      }

      const results = Array.from(specMap.values()).map((s: any) => {
        const { _doctorIds, ...rest } = s;
        return { ...rest, count: _doctorIds.size, doctorCount: _doctorIds.size };
      });
      return reply.send(results.sort((a: any, b: any) => a.name.localeCompare(b.name)));
    } else {
      const { data, error } = await supabaseAdmin.from('specializations')
        .select('id, name, slug')
        .eq('is_active', true)
        .order('name');
        
      if (error) {
        return reply.status(400).send({ error: { code: 'FETCH_FAILED', message: error.message } });
      }
      return reply.send(data || []);
    }
  });

  // GET /doctors (Receptionist view of ALL doctors with date availability previews)
  fastify.get('/doctors', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const query = z.object({
      specialization: z.string().max(255).optional(),
      clinicId: z.string().optional(),
      q: z.string().optional(),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).parse(request.query);

    const client = createScopedClient(request.token!);
    const targetDate = query.date || new Date().toISOString().split('T')[0];

    const fetchDoctors = async (specSlug?: string) => {
      const selectQuery = `
        id, name, qualification, clinic_id, daily_limit, daily_patient_limit, onboarding_status,
        doctor_specializations (
          years_experience,
          is_primary,
          specializations (id, name, slug)
        ),
        doctor_availability (
          id, date, start_time, end_time, slot_minutes, is_active
        )
      `;

      let qb = supabaseAdmin.from('doctor_profiles').select(selectQuery);

      if (specSlug) {
        qb = qb.eq('doctor_specializations.specializations.slug', specSlug);
      }
      return await qb;
    };

    let { data: doctors, error } = await fetchDoctors(query.specialization);

    if (!doctors || doctors.length === 0) {
      const { data: profDocs } = await supabaseAdmin.from('profiles').select('id, full_name, email, phone').eq('role', 'doctor');
      if (profDocs && profDocs.length > 0) {
        doctors = profDocs.map((pd: any) => ({
          id: pd.id,
          name: pd.full_name || 'Dr. Physician',
          qualification: 'MBBS, FCPS',
          clinic_id: null,
          daily_limit: 30,
          daily_patient_limit: 30,
          onboarding_status: 'complete',
          doctor_specializations: [],
          doctor_availability: [],
        }));
      }
    }

    const mappedDoctors = await Promise.all((doctors || []).map(async (doc: any) => {
      const dSpecs = Array.isArray(doc.doctor_specializations) ? doc.doctor_specializations : [];
      let specializations = dSpecs.map((ds: any) => {
        const specInfo = Array.isArray(ds.specializations) ? ds.specializations[0] : ds.specializations;
        return {
          id: specInfo?.id || 'gen',
          name: specInfo?.name || 'General Physician',
          slug: specInfo?.slug || 'general-physician',
          yearsExperience: ds.years_experience || 5,
          isPrimary: ds.is_primary || true
        };
      });

      if (specializations.length === 0) {
        specializations = [{
          id: 'gen',
          name: 'General Physician',
          slug: 'general-physician',
          yearsExperience: 5,
          isPrimary: true
        }];
      }

      const primarySpec = specializations.find((s: any) => s.isPrimary) || specializations[0];

      let daySched: any;
      try {
        daySched = await getDoctorDaySchedule({ client: supabaseAdmin, doctorId: doc.id, dateStr: targetDate });
      } catch {
        daySched = {
          workingHours: '09:00 AM - 05:00 PM',
          sessionState: 'UPCOMING',
          disabledReason: null,
          slots: []
        };
      }

      const { data: dayAppts } = await supabaseAdmin
        .from('appointments')
        .select('id, status')
        .eq('doctor_id', doc.id)
        .gte('scheduled_start', `${targetDate}T00:00:00Z`)
        .lt('scheduled_start', `${targetDate}T23:59:59Z`);

      const validAppts = (dayAppts || []).filter((a: any) => a.status !== 'cancelled');
      const assignedCount = validAppts.length;
      const seenCount = validAppts.filter((a: any) => a.status === 'completed' || a.status === 'done').length;
      const waitingCountToday = validAppts.filter((a: any) => a.status === 'waiting').length;
      const freeSlotsCountToday = daySched.slots ? daySched.slots.filter((s: any) => s.isAvailable).length : 0;

      let badgeLabel = 'Available Today';
      let canTakeBooking = true;

      if (daySched.sessionState === 'UPCOMING') {
        canTakeBooking = true;
        const firstSlot = daySched.slots?.find((s: any) => s.isAvailable);
        badgeLabel = firstSlot ? `Starts at ${firstSlot.time}` : 'Available Today';
      } else if (daySched.sessionState === 'IN_SESSION') {
        canTakeBooking = true;
        badgeLabel = 'In Session';
      } else if (daySched.sessionState === 'FULLY_BOOKED') {
        badgeLabel = 'Fully Booked';
        canTakeBooking = false;
      } else if (daySched.sessionState === 'ENDED') {
        badgeLabel = 'Session Ended';
        canTakeBooking = false;
      } else if (daySched.sessionState === 'NOT_SCHEDULED') {
        badgeLabel = 'Not Scheduled';
        canTakeBooking = false;
      }

      // Next 14 days upcoming preview
      const todayStr = new Date().toISOString().split('T')[0];
      const avails = Array.isArray(doc.doctor_availability) ? doc.doctor_availability : [];
      const upcomingAvails = avails
        .filter((a: any) => a.is_active && a.date >= todayStr)
        .sort((a: any, b: any) => a.date.localeCompare(b.date))
        .slice(0, 14)
        .map((a: any) => ({
          date: a.date,
          startTime: a.start_time,
          endTime: a.end_time,
          formatted: `${a.date}: ${a.start_time.substring(0,5)} - ${a.end_time.substring(0,5)}`
        }));

      // Next available date if today is ended/not available
      let nextAvailableDate: string | null = null;
      if (!canTakeBooking || freeSlotsCountToday === 0) {
        nextAvailableDate = await findNextAvailableDate(supabaseAdmin, doc.id, targetDate);
      }

      return {
        id: doc.id,
        fullName: doc.name || 'Dr. Physician',
        qualification: doc.qualification || 'MBBS, FCPS',
        clinicId: doc.clinic_id,
        specializations,
        yearsExperienceInSelected: primarySpec?.yearsExperience || 5,
        visitingDaysTimes: upcomingAvails,
        dailyLimit: doc.daily_patient_limit || doc.daily_limit || 30,
        workingHours: daySched.workingHours || 'Not Scheduled',
        sessionState: daySched.sessionState || 'NOT_SCHEDULED',
        badgeLabel,
        canTakeBooking,
        freeSlotsCountToday,
        waitingCountToday,
        assignedCount,
        seenCount,
        selectedDate: targetDate,
        nextAvailableDate,
        disabledReason: daySched.disabledReason,
      };
    }));

    let result = mappedDoctors;
    if (query.q && query.q.trim()) {
      const qLower = query.q.trim().toLowerCase();
      result = result.filter((d: any) => 
        d.fullName.toLowerCase().includes(qLower) || 
        d.specializations.some((s: any) => s.name?.toLowerCase().includes(qLower))
      );
    }

    return reply.send(result);
  });

  // GET /doctors/:id/availability (Available dates for Receptionist Date Picker)
  fastify.get('/doctors/:id/availability', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const query = z.object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).parse(request.query);

    const client = createScopedClient(request.token!);
    const todayStr = new Date().toISOString().split('T')[0];
    const fromStr = query.from || todayStr;
    const defaultTo = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toStr = query.to || defaultTo;

    const result = await getDoctorAvailabilityDates(client, params.id, fromStr, toStr);
    return reply.send(result);
  });

  // GET /doctors/:id/slots (Remaining slots for a specific date)
  fastify.get('/doctors/:id/slots', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const query = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }).parse(request.query);

    const client = createScopedClient(request.token!);
    const result = await getDoctorSlots(client, params.id, query.date);
    return reply.send(result);
  });

  // --------------------------------------------------------------------------
  // DOCTOR AVAILABILITY MANAGEMENT ENDPOINTS (Doctor role)
  // --------------------------------------------------------------------------

  // GET /availability (List upcoming dated availabilities)
  fastify.get('/availability', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const doctorId = request.user!.role === 'doctor' ? request.user!.id : (request.query as any)?.doctorId;
    if (!doctorId) return reply.status(400).send({ error: { code: 'MISSING_DOCTOR_ID', message: 'Doctor ID required' } });

    const client = createScopedClient(request.token!);
    const todayStr = new Date().toISOString().split('T')[0];

    const { data, error } = await client
      .from('doctor_availability')
      .select('*')
      .eq('doctor_id', doctorId)
      .gte('date', todayStr)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    if (error) return reply.status(400).send({ error: { code: 'FETCH_FAILED', message: error.message } });

    // Attach booked appointment counts per availability row
    const withCounts = await Promise.all((data || []).map(async (row: any) => {
      const { count } = await client
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('doctor_id', doctorId)
        .neq('status', 'cancelled')
        .gte('scheduled_start', `${row.date}T${row.start_time}`)
        .lt('scheduled_start', `${row.date}T${row.end_time}`);
      return { ...row, bookedCount: count || 0 };
    }));

    return reply.send(withCounts);
  });

  // POST /doctors/me/availability (Add row-based doctor availability with shared contract and field-level validation)
  const handleSaveAvailabilityRequest = async (request: any, reply: any) => {
    if (request.user!.role !== 'doctor') {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Only doctors can add availability' } });
    }

    const doctorId = request.user!.id;
    const client = createScopedClient(request.token!);

    // Shared contract payload parsing
    const rawItems = expandAvailabilityItems(request.body);
    const parsed = saveDoctorAvailabilitySchema.parse({ items: rawItems });
    const { todayStr, currentMins } = getServerZonedNow('Asia/Karachi');

    // Query existing saved rows for DB overlap & duplicate check
    const { data: existingRows } = await client
      .from('doctor_availability')
      .select('*')
      .eq('doctor_id', doctorId)
      .eq('is_active', true);

    const dbRows = existingRows || [];
    const details = validateAvailabilityItems(parsed.items, todayStr, currentMins, dbRows);

    if (details.length > 0) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Please fix the highlighted fields',
          details,
        },
      });
    }

    // Exact duplicate calculation for idempotency
    const exactDuplicates = new Set<number>();
    for (let i = 0; i < parsed.items.length; i++) {
      const item = parsed.items[i];
      const sMins = parseTimeToMinutes(item.start_time);
      const eMins = parseTimeToMinutes(item.end_time);
      if (sMins !== null && eMins !== null) {
        for (const dbRow of dbRows) {
          if (dbRow.date === item.date) {
            const dbSMins = parseTimeToMinutes(dbRow.start_time);
            const dbEMins = parseTimeToMinutes(dbRow.end_time);
            if (sMins === dbSMins && eMins === dbEMins && (dbRow.slot_minutes || 30) === item.slot_minutes) {
              exactDuplicates.add(i);
            }
          }
        }
      }
    }

    // Atomic DB Insertion (skipping exact duplicate items for idempotency)
    const insertsToMake: any[] = [];
    for (let i = 0; i < parsed.items.length; i++) {
      if (exactDuplicates.has(i)) continue;
      const item = parsed.items[i];
      insertsToMake.push({
        doctor_id: doctorId,
        date: item.date,
        start_time: item.start_time,
        end_time: item.end_time,
        slot_minutes: item.slot_minutes,
        is_active: true,
      });
    }

    let createdRows: any[] = [];
    if (insertsToMake.length > 0) {
      const { data: rows, error: insertErr } = await client
        .from('doctor_availability')
        .insert(insertsToMake)
        .select('*');

      if (insertErr) {
        if (insertErr.message.includes('DOCTOR_AVAILABILITY_OVERLAP') || insertErr.code === '23505') {
          return reply.status(409).send({
            error: {
              code: 'DOCTOR_AVAILABILITY_OVERLAP',
              message: 'Time range overlaps with an existing schedule on selected date.',
            },
          });
        }
        return reply.status(400).send({ error: { code: 'SAVE_FAILED', message: insertErr.message } });
      }
      createdRows = rows || [];
    }

    return reply.status(201).send({
      success: true,
      count: createdRows.length,
      items: createdRows,
    });
  };

  fastify.post('/doctors/me/availability', { preHandler: [fastify.authenticate] }, handleSaveAvailabilityRequest);
  fastify.post('/availability', { preHandler: [fastify.authenticate] }, handleSaveAvailabilityRequest);

  // GET /doctors/me/patients (Date-Wise Doctor Patient Directory)
  fastify.get('/doctors/me/patients', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user!.role !== 'doctor') {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Only doctors can access their date-wise patient directory' } });
    }

    const doctorId = request.user!.id;
    const query = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    }).parse(request.query);

    const { todayStr: serverTodayStr } = getServerZonedNow('Asia/Karachi');
    const targetDate = query.date || serverTodayStr;
    const isToday = targetDate === serverTodayStr;
    const isFuture = targetDate > serverTodayStr;

    // Fetch doctor profile for daily limit
    const { data: docProfile } = await supabaseAdmin
      .from('doctor_profiles')
      .select('daily_limit, daily_patient_limit')
      .eq('id', doctorId)
      .maybeSingle();

    const dailyLimit = docProfile?.daily_patient_limit || docProfile?.daily_limit || 30;

    // Check availability on targetDate
    const { data: avails } = await supabaseAdmin
      .from('doctor_availability')
      .select('id')
      .eq('doctor_id', doctorId)
      .eq('date', targetDate)
      .eq('is_active', true);

    const hasAvailability = (avails || []).length > 0;

    // Fetch appointments for this doctor on targetDate with single query join
    const { data: rawAppts, error: apptErr } = await supabaseAdmin
      .from('appointments')
      .select(`
        id, doctor_id, patient_id, date, time_slot, scheduled_start, scheduled_end, status, reason,
        patients (id, mrn, name, age, gender, phone, allergies),
        prescriptions (id, diagnosis, medicines, notes, follow_up_period, follow_up_due_date, created_at),
        visits (id, prescription, draft_message, followup_text, followup_period, created_at, sms_logs(id, message_body, status, sent_at, created_at))
      `)
      .eq('doctor_id', doctorId)
      .order('scheduled_start', { ascending: true });

    if (apptErr) {
      return reply.status(400).send({ error: { code: 'FETCH_FAILED', message: apptErr.message } });
    }

    // Filter appointments belonging strictly to targetDate
    const dateAppts = (rawAppts || []).filter((apt: any) => {
      if (apt.date === targetDate) return true;
      if (apt.scheduled_start && apt.scheduled_start.substring(0, 10) === targetDate) return true;
      return false;
    });

    const activeAppts = dateAppts.filter((a: any) => a.status !== 'cancelled');

    const total = activeAppts.length;
    const waiting = activeAppts.filter((a: any) => a.status === 'waiting').length;
    const inProgress = activeAppts.filter((a: any) => a.status === 'in_progress' || a.status === 'in_consultation').length;
    const completed = activeAppts.filter((a: any) => a.status === 'completed' || a.status === 'done').length;
    const remaining = total - completed;

    const mappedAppointments = activeAppts.map((apt: any) => {
      const p = Array.isArray(apt.patients) ? apt.patients[0] : apt.patients;
      const rx = Array.isArray(apt.prescriptions) ? apt.prescriptions[0] : apt.prescriptions;
      const visitObj = Array.isArray(apt.visits) ? apt.visits[0] : apt.visits;
      const smsLogs = visitObj?.sms_logs ? (Array.isArray(visitObj.sms_logs) ? visitObj.sms_logs : [visitObj.sms_logs]) : [];
      const msg = smsLogs[smsLogs.length - 1] || null;

      return {
        id: apt.id,
        appointmentId: apt.id,
        timeSlot: apt.time_slot || (apt.scheduled_start ? apt.scheduled_start.substring(11, 16) : '10:00 AM'),
        scheduledStart: apt.scheduled_start,
        status: (apt.status || 'SCHEDULED').toUpperCase(),
        reason: apt.reason || 'General Consultation',
        notes: '',
        patient: p ? {
          id: p.id,
          mrn: p.mrn,
          name: p.name || 'Patient',
          fullName: p.name || 'Patient',
          age: p.age || 0,
          gender: p.gender || 'Unknown',
          phone: p.phone || '',
          allergies: p.allergies ? (typeof p.allergies === 'string' ? p.allergies.split(',').map((s: string) => s.trim()) : p.allergies) : [],
          emergencyContactName: '',
          emergencyContactPhone: '',
        } : null,
        prescription: rx || (visitObj ? { id: visitObj.id, diagnosis: visitObj.prescription, notes: '', follow_up_period: visitObj.followup_period } : null),
        messageLog: msg ? { id: msg.id, draft: msg.message_body, status: msg.status, sent_at: msg.sent_at } : null,
      };
    });

    return reply.send({
      date: targetDate,
      isToday,
      isFuture,
      hasAvailability,
      counts: {
        total,
        waiting,
        inProgress,
        completed,
        remaining,
        assignedCount: total,
        dailyLimit,
      },
      appointments: mappedAppointments,
    });
  });

  // DELETE /availability/:id
  fastify.delete('/availability/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user!.role !== 'doctor') {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Only doctors can delete availability' } });
    }

    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const doctorId = request.user!.id;
    const client = createScopedClient(request.token!);

    const { data: avail } = await client
      .from('doctor_availability')
      .select('*')
      .eq('id', params.id)
      .eq('doctor_id', doctorId)
      .maybeSingle();

    if (!avail) {
      return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Availability record not found' } });
    }

    const { data: appts } = await client
      .from('appointments')
      .select('id, scheduled_start, time_slot, status, patients(name, mrn)')
      .eq('doctor_id', doctorId)
      .neq('status', 'cancelled')
      .gte('scheduled_start', `${avail.date}T${avail.start_time}`)
      .lt('scheduled_start', `${avail.date}T${avail.end_time}`);

    if (appts && appts.length > 0) {
      const affected = appts.map((apt: any) => {
        const p = Array.isArray(apt.patients) ? apt.patients[0] : apt.patients;
        return { id: apt.id, patientName: p?.name, mrn: p?.mrn, date: avail.date, timeSlot: apt.time_slot };
      });

      return reply.status(409).send({
        error: {
          code: 'AFFECTED_BOOKINGS_EXIST',
          message: `Cannot delete availability on ${avail.date} because ${affected.length} booked appointment(s) exist in this range.`,
          affectedAppointments: affected,
        }
      });
    }

    await client.from('doctor_availability').delete().eq('id', params.id);
    return reply.send({ success: true, message: 'Availability removed successfully' });
  });

  // GET & POST & DELETE /availability/time-off
  fastify.get('/availability/time-off', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const doctorId = request.user!.role === 'doctor' ? request.user!.id : (request.query as any)?.doctorId;
    const client = createScopedClient(request.token!);

    const { data, error } = await client
      .from('doctor_time_off')
      .select('*')
      .eq('doctor_id', doctorId)
      .order('starts_on');

    if (error) return reply.status(400).send({ error: { code: 'FETCH_FAILED', message: error.message } });
    return reply.send(data || []);
  });

  fastify.post('/availability/time-off', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user!.role !== 'doctor') {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Only doctors can request time off' } });
    }

    const schema = z.object({
      starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      ends_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      reason: z.string().optional(),
    });

    const data = schema.parse(request.body);
    if (data.ends_on < data.starts_on) {
      return reply.status(400).send({ error: { code: 'INVALID_DATES', message: 'End date cannot be before start date' } });
    }

    const doctorId = request.user!.id;
    const client = createScopedClient(request.token!);

    const { data: record, error } = await client
      .from('doctor_time_off')
      .insert({
        doctor_id: doctorId,
        starts_on: data.starts_on,
        ends_on: data.ends_on,
        reason: data.reason || 'Personal Leave',
      })
      .select('*')
      .single();

    if (error) return reply.status(400).send({ error: { code: 'SAVE_FAILED', message: error.message } });

    client.from('audit_log').insert({
      actor_id: doctorId,
      actor_role: 'doctor',
      action: 'ADD_TIME_OFF',
      resource_type: 'doctor_time_off',
      resource_id: record.id,
      payload: data
    }).then(() => {});

    return reply.send(record);
  });

  fastify.delete('/availability/time-off/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user!.role !== 'doctor') {
      return reply.status(403).send({ error: { code: 'FORBIDDEN', message: 'Only doctors can remove time off' } });
    }
    const params = z.object({ id: z.string().uuid() }).parse(request.params);
    const client = createScopedClient(request.token!);

    const { error } = await client
      .from('doctor_time_off')
      .delete()
      .eq('id', params.id)
      .eq('doctor_id', request.user!.id);

    if (error) return reply.status(400).send({ error: { code: 'DELETE_FAILED', message: error.message } });
    return reply.send({ success: true });
  });

  // POST /availability/preview-impact
  fastify.post('/availability/preview-impact', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const doctorId = request.user!.id;
    const client = createScopedClient(request.token!);

    const schema = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      start_time: z.string().optional(),
      end_time: z.string().optional(),
      is_available: z.boolean().optional(),
    });

    const data = schema.parse(request.body);
    const targetDate = data.date || new Date().toISOString().split('T')[0];

    const { data: appointments } = await client
      .from('appointments')
      .select('id, scheduled_start, scheduled_end, time_slot, status, patients(name, mrn)')
      .eq('doctor_id', doctorId)
      .neq('status', 'cancelled')
      .gte('scheduled_start', `${targetDate}T00:00:00Z`)
      .lt('scheduled_start', `${targetDate}T23:59:59Z`);

    if (!appointments || appointments.length === 0) {
      return reply.send({ affectedCount: 0, appointments: [] });
    }

    if (data.is_available === false) {
      return reply.send({ affectedCount: appointments.length, appointments });
    }

    const newStartM = data.start_time ? timeToMinutes(data.start_time) : 0;
    const newEndM = data.end_time ? timeToMinutes(data.end_time) : 1440;

    const affected = appointments.filter((apt: any) => {
      const aptStart = new Date(apt.scheduled_start);
      const m = aptStart.getUTCHours() * 60 + aptStart.getUTCMinutes();
      return m < newStartM || m >= newEndM;
    });

    return reply.send({ affectedCount: affected.length, appointments: affected });
  });

  // PATCH /doctors/profile (Update doctor profile, enforce CNIC lock)
  fastify.patch('/doctors/profile', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const userId = request.user!.id;
    const client = createScopedClient(request.token!);

    const schema = z.object({
      name: z.string().max(255).optional(),
      phone: z.string().max(50).optional(),
      qualification: z.string().max(255).optional(),
      daily_limit: z.number().int().min(1).max(200).optional(),
      cnic: z.string().max(50).optional(),
    });

    const data = schema.parse(request.body);

    const { data: existingDoc } = await client.from('doctor_profiles').select('cnic').eq('id', userId).maybeSingle();

    if (data.cnic !== undefined) {
      if (existingDoc && existingDoc.cnic && existingDoc.cnic.trim() !== '') {
        const normalizedInput = normalizeCnic(data.cnic);
        if (normalizedInput !== existingDoc.cnic) {
          return reply.status(409).send({
            error: { code: 'CNIC_LOCKED', message: 'CNIC is locked and cannot be edited after initial save.' }
          });
        }
      } else if (data.cnic && data.cnic.trim() !== '') {
        const normalizedInput = normalizeCnic(data.cnic);
        if (!validateCnicFormat(normalizedInput)) {
          return reply.status(400).send({
            error: { code: 'INVALID_CNIC_FORMAT', message: 'CNIC must be in XXXXX-XXXXXXX-X format (13 digits)' }
          });
        }
      }
    }

    const updates: Record<string, any> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.phone !== undefined) updates.phone = data.phone;
    if (data.qualification !== undefined) updates.qualification = data.qualification;
    if (data.daily_limit !== undefined) updates.daily_limit = data.daily_limit;
    if (data.cnic !== undefined && (!existingDoc?.cnic || existingDoc.cnic.trim() === '')) {
      updates.cnic = data.cnic ? normalizeCnic(data.cnic) : null;
    }

    if (Object.keys(updates).length === 0) {
      return reply.send({ message: 'No changes provided' });
    }

    const { data: updated, error } = await client
      .from('doctor_profiles')
      .update(updates)
      .eq('id', userId)
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505' || error.message.includes('cnic') || error.message.includes('idx_unique_doctor_cnic')) {
        return reply.status(409).send({ error: { code: 'CNIC_ALREADY_EXISTS', message: 'A doctor with this CNIC already exists.' } });
      }
      return reply.status(400).send({ error: { code: 'UPDATE_FAILED', message: error.message } });
    }

    return reply.send({
      ...updated,
      cnic_masked: updated.cnic ? maskCnic(updated.cnic) : null,
      cnic_locked: !!(updated.cnic && updated.cnic.trim() !== ''),
    });
  });

  // GET /doctors/me/prescriptions (Issued Prescriptions search & list)
  fastify.get('/doctors/me/prescriptions', { preHandler: [fastify.authenticate, fastify.requireOnboarded, fastify.requireDoctor] }, async (request, reply) => {
    const doctorId = request.user!.id;
    const client = createScopedClient(request.token!);

    const querySchema = z.object({
      q: z.string().optional(),
      mrn: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      page: z.string().optional(),
      limit: z.string().optional(),
    });

    const query = querySchema.parse(request.query);
    const pageNum = Math.max(1, parseInt(query.page || '1', 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    // Perform patient ID matching if search 'q' or 'mrn' filters are provided
    let matchingPatientIds: string[] | null = null;

    if (query.q && query.q.trim().length > 0) {
      const searchTerm = query.q.trim();
      const cleanDigits = searchTerm.replace(/\D/g, '');
      const isDigitsOnly = /^\d+$/.test(searchTerm.replace(/[\s+-]/g, ''));
      const sanitized = searchTerm.replace(/[%_\\]/g, '\\$&');

      let patientQb = client.from('patients').select('id');
      if (isDigitsOnly && cleanDigits.length >= 3) {
        patientQb = patientQb.or(`phone.ilike.%${cleanDigits}%,mrn.ilike.%${sanitized}%`);
      } else {
        patientQb = patientQb.or(`name.ilike.%${sanitized}%,mrn.ilike.%${sanitized}%`);
      }

      const { data: matchedPatients } = await patientQb;
      matchingPatientIds = (matchedPatients || []).map((p: any) => p.id);

      if (matchingPatientIds.length === 0) {
        return reply.send({
          data: [],
          pagination: { page: pageNum, limit: limitNum, total: 0, totalPages: 1 }
        });
      }
    }

    if (query.mrn && query.mrn.trim().length > 0) {
      const cleanMrn = query.mrn.trim().replace(/[%_\\]/g, '\\$&');
      const { data: mrnPatients } = await client.from('patients').select('id').ilike('mrn', `%${cleanMrn}%`);
      const mrnIds = (mrnPatients || []).map((p: any) => p.id);

      if (mrnIds.length === 0) {
        return reply.send({
          data: [],
          pagination: { page: pageNum, limit: limitNum, total: 0, totalPages: 1 }
        });
      }

      if (matchingPatientIds !== null) {
        matchingPatientIds = matchingPatientIds.filter(id => mrnIds.includes(id));
      } else {
        matchingPatientIds = mrnIds;
      }
    }

    // Build query on prescriptions table with joins
    let qb = client.from('prescriptions')
      .select(`
        *,
        patients (
          id,
          mrn,
          name,
          age,
          gender,
          phone
        ),
        doctor_profiles (
          id,
          name,
          qualification,
          license_number,
          doctor_specializations (
            specializations (
              name
            )
          ),
          clinics (
            id,
            name,
            address,
            phone
          )
        ),
        medical_records (
          id,
          diagnosis,
          doctor_notes
        ),
        prescription_items (*)
      `, { count: 'exact' })
      .eq('doctor_id', doctorId);

    if (matchingPatientIds !== null) {
      if (matchingPatientIds.length === 0) {
        return reply.send({
          data: [],
          pagination: { page: pageNum, limit: limitNum, total: 0, totalPages: 1 }
        });
      }
      qb = qb.in('patient_id', matchingPatientIds);
    }

    // Apply date range filters
    if (query.from && query.from.trim().length > 0) {
      const fromIso = query.from.includes('T') ? query.from : `${query.from}T00:00:00.000Z`;
      qb = qb.gte('created_at', fromIso);
    }
    if (query.to && query.to.trim().length > 0) {
      const toIso = query.to.includes('T') ? query.to : `${query.to}T23:59:59.999Z`;
      qb = qb.lte('created_at', toIso);
    }

    const { data: rows, count, error } = await qb
      .order('created_at', { ascending: false })
      .range(offset, offset + limitNum - 1);

    if (error) {
      request.log.warn({ error: error.message }, 'Failed to fetch doctor prescriptions');
      return reply.status(400).send({ error: { code: 'FETCH_FAILED', message: error.message } });
    }

    const total = count || (rows ? rows.length : 0);
    const totalPages = Math.ceil(total / limitNum) || 1;

    // Pre-fetch any missing patient data by patient_id if PostgREST join returned empty/unjoined array
    const missingPatientIds = (rows || [])
      .map((rx: any) => {
        const p = Array.isArray(rx.patients) ? rx.patients[0] : rx.patients;
        return (!p || !p.name) && rx.patient_id ? rx.patient_id : null;
      })
      .filter((id): id is string => Boolean(id));

    const patientMap = new Map<string, any>();
    if (missingPatientIds.length > 0) {
      const { data: fetchedPatients } = await client.from('patients').select('*').in('id', missingPatientIds);
      (fetchedPatients || []).forEach((p: any) => patientMap.set(p.id, p));
    }

    // Normalize result shape
    const formattedData = (rows || []).map((rx: any) => {
      let patientObj = Array.isArray(rx.patients) ? rx.patients[0] : rx.patients;
      if ((!patientObj || !patientObj.name) && rx.patient_id && patientMap.has(rx.patient_id)) {
        patientObj = patientMap.get(rx.patient_id);
      }
      const patient = patientObj || {};

      const doctorObj = Array.isArray(rx.doctor_profiles) ? rx.doctor_profiles[0] : rx.doctor_profiles;
      const doctor = doctorObj || {};

      const clinicObj = Array.isArray(doctor.clinics) ? doctor.clinics[0] : doctor.clinics;
      const clinic = clinicObj || {};

      const recordObj = Array.isArray(rx.medical_records) ? rx.medical_records[0] : rx.medical_records;
      const record = recordObj || {};

      const specializations = Array.isArray(doctor.doctor_specializations)
        ? doctor.doctor_specializations.map((ds: any) => ds.specializations?.name).filter(Boolean).join(', ')
        : (doctor.specialization || '-');

      // Process medicines array: from prescription_items OR jsonb medicines field on prescriptions
      let medicines: any[] = [];
      if (Array.isArray(rx.prescription_items) && rx.prescription_items.length > 0) {
        medicines = rx.prescription_items.map((item: any) => ({
          id: item.id,
          name: item.medication_name || item.name || '-',
          dosage: item.dosage || '-',
          frequency: item.frequency || '-',
          duration: item.duration_days ? `${item.duration_days} days` : (item.duration || '-'),
          instructions: item.instructions || '-',
        }));
      } else if (Array.isArray(rx.medicines) && rx.medicines.length > 0) {
        medicines = rx.medicines.map((item: any, idx: number) => ({
          id: `med-${idx}`,
          name: item.name || item.medication_name || '-',
          dosage: item.dosage || '-',
          frequency: item.frequency || '-',
          duration: item.duration ? (typeof item.duration === 'number' ? `${item.duration} days` : item.duration) : '-',
          instructions: item.instructions || '-',
        }));
      }

      if (!patient.name) {
        request.log.warn({ prescription_id: rx.id, patient_id: rx.patient_id }, 'Prescription record missing patient name');
      }

      return {
        id: rx.id,
        visit_id: rx.record_id || rx.appointment_id || rx.id,
        issued_at: rx.created_at,
        diagnosis: rx.diagnosis || record.diagnosis || 'Consultation',
        notes: rx.notes || record.doctor_notes || '',
        follow_up: rx.follow_up_period || rx.notes || null,
        patient: {
          id: patient.id || '-',
          mrn: patient.mrn || '-',
          name: patient.name || '-',
          age: patient.age ?? '-',
          gender: patient.gender || '-',
          phone: patient.phone || '-',
        },
        doctor: {
          id: doctor.id || '-',
          name: doctor.name ? (doctor.name.startsWith('Dr.') ? doctor.name : `Dr. ${doctor.name}`) : '-',
          qualification: doctor.qualification || '-',
          specialization: specializations || 'General Physician',
          license_number: doctor.license_number || '-',
        },
        hospital: {
          name: clinic.name || 'MediFlow Health Clinic',
          address: clinic.address || 'Main Hospital Boulevard',
          phone: clinic.phone || '+92 42 35789000',
        },
        medicines,
      };
    });

    return reply.send({
      data: formattedData,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
      }
    });
  });
};
