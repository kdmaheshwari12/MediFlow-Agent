import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin, createScopedClient } from '../../lib/supabase';
import { validateCnicFormat, normalizeCnic, maskCnic } from '../../lib/cnic';
import { getLocalTodayStr, getLocalCurrentMins, availabilityInputSchema } from '../../lib/availability-schema';
import { saveDoctorAvailabilitySchema, getServerZonedNow, parseTimeToMinutes } from '../../lib/availability-contract';

declare module 'fastify' {
  interface FastifyRequest {
    cookies: Record<string, string | undefined>;
  }

  interface FastifyReply {
    setCookie(name: string, value: string | undefined, options?: Record<string, any>): FastifyReply;
  }
}

const signupDoctorSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(6).max(255),
  name: z.string().max(255),
  phone: z.string().max(50),
  cnic: z.string().max(50).optional(),
});

const signupStaffSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(6).max(255),
  name: z.string().max(255),
  phone: z.string().max(50),
  cnic: z.string().max(50).optional(),
  clinic_id: z.string().uuid().optional(),
  clinic_name: z.string().max(255).optional(),
});

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/auth/check-email', async (request, reply) => {
    const data = z.object({ email: z.string().email() }).parse(request.body);
    const { data: users, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) {
      return reply.status(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Failed to check email' } });
    }
    const user = users.users.find(u => u.email === data.email);
    if (user) {
      return reply.send({ exists: true, verified: !!user.email_confirmed_at });
    }
    return reply.send({ exists: false, verified: false });
  });

  async function atomicSignup(email: string, password: string, role: string, profileData: any) {
    let authUserId: string;
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existing = existingUsers?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());

    if (existing) {
      throw new Error('EMAIL_EXISTS');
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role,
        name: profileData.name,
        phone: profileData.phone,
        clinic_id: profileData.clinic_id,
      },
    });

    if (authError || !authData.user) {
      console.error('[atomicSignup] createUser error:', authError);
      throw new Error(authError?.message || 'SIGNUP_FAILED');
    }

    authUserId = authData.user.id;

    let normalizedCnic = null;
    if (profileData.cnic) {
      normalizedCnic = normalizeCnic(profileData.cnic);
    }

    // Create profile record immediately
    if (role === 'doctor') {
      await supabaseAdmin.from('doctor_profiles').upsert({
        id: authUserId,
        name: profileData.name,
        phone: profileData.phone,
        cnic: normalizedCnic,
        clinic_id: profileData.clinic_id || null,
        onboarding_status: profileData.onboarding_status || 'in_progress',
        onboarding_step: profileData.onboarding_step || 'info',
        profile_completed: false,
      });
    } else {
      await supabaseAdmin.from('staff_profiles').upsert({
        id: authUserId,
        name: profileData.name,
        phone: profileData.phone,
        cnic: normalizedCnic,
        clinic_id: profileData.clinic_id || null,
        onboarding_status: 'complete',
      });
    }

    return authUserId;
  }

  fastify.post('/auth/signup/doctor', async (request, reply) => {
    const data = signupDoctorSchema.parse(request.body);
    try {
      const userId = await atomicSignup(data.email, data.password, 'doctor', {
        name: data.name, phone: data.phone, cnic: data.cnic, onboarding_status: 'in_progress', onboarding_step: 'info'
      });
      return reply.status(201).send({ message: 'Signup successful', user_id: userId });
    } catch (err: any) {
      console.error('[signup/doctor] error:', err);
      if (err.message === 'EMAIL_EXISTS' || err.message === 'EMAIL_EXISTS_VERIFIED') {
        return reply.status(409).send({ error: { code: 'EMAIL_EXISTS', message: 'An account with this email already exists.' } });
      }
      return reply.status(400).send({ error: { code: 'SIGNUP_FAILED', message: err.message || 'Signup failed. Please try again.' } });
    }
  });

  fastify.post('/auth/signup/staff', async (request, reply) => {
    const data = signupStaffSchema.parse(request.body);
    let clinicId = data.clinic_id;
    if (!clinicId && data.clinic_name) {
      const { data: existingClinic } = await supabaseAdmin.from('clinics').select('id').ilike('name', data.clinic_name).maybeSingle();
      if (existingClinic) {
        clinicId = existingClinic.id;
      } else {
        const { data: clinic, error: clinicError } = await supabaseAdmin.from('clinics').insert({ name: data.clinic_name }).select('id').single();
        if (clinicError || !clinic) return reply.status(400).send({ error: { code: 'CLINIC_FAILED', message: clinicError?.message || 'Could not create clinic' } });
        clinicId = clinic.id;
      }
    }
    if (!clinicId) return reply.status(400).send({ error: { code: 'MISSING_CLINIC', message: 'clinic_id or clinic_name is required' } });

    try {
      const userId = await atomicSignup(data.email, data.password, 'staff', {
        name: data.name, phone: data.phone, cnic: data.cnic, clinic_id: clinicId, onboarding_status: 'complete'
      });
      return reply.status(201).send({ message: 'Signup successful', user_id: userId });
    } catch (err: any) {
      console.error('[signup/staff] error:', err);
      if (err.message === 'EMAIL_EXISTS' || err.message === 'EMAIL_EXISTS_VERIFIED') {
        return reply.status(409).send({ error: { code: 'EMAIL_EXISTS', message: 'An account with this email already exists.' } });
      }
      return reply.status(400).send({ error: { code: 'SIGNUP_FAILED', message: err.message || 'Signup failed. Please try again.' } });
    }
  });

  fastify.get('/auth/verification-status', async (request, reply) => {
    const userId = request.cookies.pending_signup_id;
    if (!userId) return reply.send({ verified: false });
    const { data: user, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error || !user.user) return reply.send({ verified: false });
    return reply.send({ verified: !!user.user.email_confirmed_at });
  });

  fastify.post('/auth/resend-verification', async (request, reply) => {
    const { email } = z.object({ email: z.string().email() }).parse(request.body);
    await supabaseAdmin.auth.resend({ type: 'signup', email });
    return reply.send({ message: 'If the email exists, a new verification link has been sent.' });
  });

  // --- Onboarding Endpoints --- //

  fastify.get('/onboarding/status', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const userId = request.user!.id;
    const { data } = await supabaseAdmin.from('doctor_profiles').select('onboarding_status, onboarding_step').eq('id', userId).single();
    if (!data) return reply.send({ status: 'complete', step: 'complete' });
    return reply.send({ status: data.onboarding_status, step: data.onboarding_step });
  });

  const onboardingInfoSchema = z.object({
    qualification: z.string().max(255),
    license_number: z.string().max(100),
    cnic: z.string().max(50).optional(),
    daily_limit: z.number().int().min(1).max(200).optional(),
    clinic_id: z.string().uuid().optional(),
    clinic_name: z.string().max(255).optional(),
    clinic_address: z.string().max(500).optional(),
    clinic_phone: z.string().max(50).optional(),
  });

  fastify.post('/onboarding/doctor/info', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const data = onboardingInfoSchema.parse(request.body);
    const userId = request.user!.id;
    let clinicId = data.clinic_id;

    // Check existing doctor profile for CNIC lock
    const { data: existingDoc } = await supabaseAdmin.from('doctor_profiles').select('cnic').eq('id', userId).maybeSingle();

    if (data.cnic && data.cnic.trim() !== '') {
      const normalizedCnic = normalizeCnic(data.cnic);
      if (!validateCnicFormat(normalizedCnic)) {
        return reply.status(400).send({
          error: { code: 'INVALID_CNIC_FORMAT', message: 'CNIC must be in XXXXX-XXXXXXX-X format (13 digits)' }
        });
      }

      if (existingDoc && existingDoc.cnic && existingDoc.cnic.trim() !== '' && existingDoc.cnic !== normalizedCnic) {
        return reply.status(409).send({
          error: { code: 'CNIC_LOCKED', message: 'CNIC is locked and cannot be edited after initial save.' }
        });
      }
    }

    if (!clinicId && data.clinic_name) {
      const { data: existingClinic } = await supabaseAdmin.from('clinics').select('id').ilike('name', data.clinic_name).maybeSingle();
      if (existingClinic) {
        clinicId = existingClinic.id;
      } else {
        const { data: clinic, error: clinicError } = await supabaseAdmin.from('clinics').insert({
          name: data.clinic_name, address: data.clinic_address, phone: data.clinic_phone
        }).select('id').single();
        if (clinicError || !clinic) return reply.status(400).send({ error: { code: 'CLINIC_FAILED', message: clinicError?.message || 'Could not create clinic' } });
        clinicId = clinic.id;
      }
    }

    const updatePayload: Record<string, any> = {
      qualification: data.qualification,
      license_number: data.license_number,
      clinic_id: clinicId,
      onboarding_step: 'specialization'
    };
    if (data.cnic && data.cnic.trim() !== '') {
      updatePayload.cnic = normalizeCnic(data.cnic);
    }
    if (data.daily_limit) updatePayload.daily_limit = data.daily_limit;

    const { error } = await supabaseAdmin.from('doctor_profiles').update(updatePayload).eq('id', userId);

    if (error) {
      console.error('[onboarding/doctor/info] error:', error);
      if (error.code === '23505' || error.message.includes('cnic') || error.message.includes('idx_unique_doctor_cnic')) {
        return reply.status(409).send({ error: { code: 'CNIC_ALREADY_EXISTS', message: 'A doctor with this CNIC already exists.' } });
      }
      if (error.code === '23505' || error.message.includes('license_number')) {
        return reply.status(409).send({ error: { code: 'DUPLICATE_LICENSE', message: 'This medical license number is already registered.' } });
      }
      return reply.status(400).send({ error: { code: 'ONBOARDING_FAILED', message: error.message } });
    }
    return reply.send({ message: 'Info saved', step: 'specialization' });
  });

  const onboardingSpecializationSchema = z.object({
    specializations: z.array(z.object({
      name: z.string().trim().min(2).max(60),
      experience_years: z.number().min(0).max(70),
      is_primary: z.boolean().default(false)
    })).min(1)
  });

  fastify.post('/onboarding/doctor/specialization', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const data = onboardingSpecializationSchema.parse(request.body);
    const userId = request.user!.id;
    
    // Call the RPC to handle upsert safely
    const { error: specError } = await supabaseAdmin.rpc('upsert_doctor_specializations', {
      p_doctor_id: userId,
      p_specializations: data.specializations
    });

    if (specError) return reply.status(400).send({ error: { code: 'SPECIALIZATION_FAILED', message: specError.message } });

    const { error } = await supabaseAdmin.from('doctor_profiles').update({
      onboarding_step: 'availability'
    }).eq('id', userId);

    if (error) return reply.status(400).send({ error: { code: 'ONBOARDING_FAILED', message: error.message } });
    return reply.send({ message: 'Specializations saved', step: 'availability' });
  });

  function timeToMins(t: string | null | undefined): number | null {
    if (!t || typeof t !== 'string') return null;
    const trimmed = t.trim();
    if (trimmed === '' || trimmed === '00:00' || trimmed === '00:00:00') return null;
    const parts = trimmed.split(':');
    if (parts.length < 2) return null;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  }

  function formatMinsToHHMM(mins: number | null): string | null {
    if (mins === null || isNaN(mins)) return null;
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  fastify.post('/onboarding/doctor/availability', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    let rawItems = (request.body as any)?.items;
    if (!rawItems && Array.isArray((request.body as any)?.availability)) {
      rawItems = (request.body as any).availability;
    } else if (!rawItems && (request.body as any)?.date) {
      rawItems = [request.body];
    }

    const parsed = saveDoctorAvailabilitySchema.parse({ items: rawItems || [] });
    const userId = request.user!.id;
    const { todayStr, currentMins } = getServerZonedNow('Asia/Karachi');

    const details: Array<{ index?: number; field: string; message: string }> = [];

    for (let i = 0; i < parsed.items.length; i++) {
      const item = parsed.items[i];
      const sMins = parseTimeToMinutes(item.start_time);
      const eMins = parseTimeToMinutes(item.end_time);

      if (item.date < todayStr) {
        details.push({ index: i, field: 'date', message: `Cannot add availability for past date ${item.date}` });
      }

      if (item.date === todayStr && sMins !== null && sMins <= currentMins) {
        details.push({ index: i, field: 'start_time', message: 'Start time for today must be in the future' });
      }

      if (sMins !== null && eMins !== null && eMins <= sMins) {
        details.push({ index: i, field: 'end_time', message: 'End time must be after start time' });
      } else if (sMins !== null && eMins !== null && (eMins - sMins) < item.slot_minutes) {
        details.push({ index: i, field: 'slot_minutes', message: `Time range must fit at least one ${item.slot_minutes}-minute slot` });
      }

      for (let j = i + 1; j < parsed.items.length; j++) {
        const other = parsed.items[j];
        if (item.date === other.date) {
          const sMinsOther = parseTimeToMinutes(other.start_time);
          const eMinsOther = parseTimeToMinutes(other.end_time);
          if (sMins !== null && eMins !== null && sMinsOther !== null && eMinsOther !== null) {
            if (sMins < eMinsOther && eMins > sMinsOther) {
              details.push({ index: i, field: 'start_time', message: `Time range overlaps with row ${j + 1} on date ${item.date}` });
              details.push({ index: j, field: 'start_time', message: `Time range overlaps with row ${i + 1} on date ${item.date}` });
            }
          }
        }
      }
    }

    if (details.length > 0) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Please fix the highlighted fields',
          details,
        },
      });
    }

    // Delete existing availability first, then insert new ones
    await supabaseAdmin.from('doctor_availability').delete().eq('doctor_id', userId);

    const inserts = parsed.items.map((item) => ({
      doctor_id: userId,
      date: item.date,
      start_time: item.start_time,
      end_time: item.end_time,
      slot_minutes: item.slot_minutes,
      is_active: true,
    }));

    if (inserts.length > 0) {
      const { error: availError } = await supabaseAdmin.from('doctor_availability').insert(inserts);
      if (availError) {
        if (availError.message.includes('DOCTOR_AVAILABILITY_OVERLAP') || availError.code === '23505') {
          return reply.status(409).send({ error: { code: 'DOCTOR_AVAILABILITY_OVERLAP', message: 'Time range overlaps with an existing schedule on selected date.' } });
        }
        return reply.status(400).send({ error: { code: 'AVAILABILITY_FAILED', message: availError.message } });
      }
    }

    const updatePayload: Record<string, any> = {
      onboarding_step: 'complete',
      onboarding_status: 'complete',
      profile_completed: true
    };
    const reqBody = (request.body as any) || {};
    const limit = reqBody.daily_patient_limit || reqBody.daily_limit;
    if (typeof limit === 'number') {
      updatePayload.daily_limit = limit;
    }

    const { error } = await supabaseAdmin.from('doctor_profiles').update(updatePayload).eq('id', userId);

    if (error) return reply.status(400).send({ error: { code: 'ONBOARDING_FAILED', message: error.message } });
    return reply.send({ message: 'Availability saved', step: 'complete' });
  });

  // --- End Onboarding Endpoints --- //

  fastify.get('/auth/me', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const userId = request.user!.id;
    const role = request.user!.role; 
    let profileData: any = null;
    if (role === 'doctor') {
      const { data } = await supabaseAdmin.from('doctor_profiles').select('*').eq('id', userId).maybeSingle();
      profileData = data;
    } else {
      const { data } = await supabaseAdmin.from('staff_profiles').select('*').eq('id', userId).maybeSingle();
      profileData = data;
    }

    if (!profileData) return reply.status(404).send({ error: { code: 'PROFILE_NOT_FOUND', message: 'Profile not found' } });

    // Mask CNIC before returning to user
    const maskedCnic = profileData.cnic ? maskCnic(profileData.cnic) : null;
    const isCnicLocked = !!(profileData.cnic && profileData.cnic.trim() !== '');

    if (role === 'doctor') {
      const { data: specData, error: specError } = await supabaseAdmin.from('doctor_specializations').select(`
        years_experience, is_primary, specializations ( id, name, slug )
      `).eq('doctor_id', userId);

      if (specError) {
        console.error('[GET /auth/me] specError:', specError);
      }

      const specializations = (specData || []).map(s => {
        const spec = Array.isArray(s.specializations) ? s.specializations[0] : s.specializations;
        if (!spec) return null;
        return {
          id: (spec as any).id,
          name: (spec as any).name,
          slug: (spec as any).slug,
          experience_years: s.years_experience,
          is_primary: s.is_primary
        };
      }).filter(Boolean);

      return reply.send({
        id: userId,
        role: role,
        ...profileData,
        cnic_masked: maskedCnic,
        cnic_locked: isCnicLocked,
        specializations
      });
    }

    return reply.send({
      id: userId,
      role: role,
      ...profileData,
      cnic_masked: maskedCnic,
      cnic_locked: isCnicLocked
    });
  });
};

