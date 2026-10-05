import dotenv from 'dotenv';
dotenv.config();

import { supabaseAdmin } from '../src/lib/supabase';

async function seed() {
  if (process.env.NODE_ENV === 'production' || process.env.ALLOW_SEED !== 'true') {
    console.error('Seed script is disabled. Set ALLOW_SEED=true and ensure NODE_ENV is not production.');
    process.exit(1);
  }

  console.log('Seeding database...');
  
  // Clean up first to ensure fresh state
  await supabaseAdmin.from('appointments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabaseAdmin.from('doctor_availability').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabaseAdmin.from('doctor_specializations').delete().neq('doctor_id', '00000000-0000-0000-0000-000000000000');
  
  // Create clinics
  const clinics = [
    { name: 'City Hospital', address: '123 Main St', phone: '+923001234567', timezone: 'Asia/Karachi' },
    { name: 'Care Clinic', address: '456 Side St', phone: '+923001234568', timezone: 'Asia/Karachi' }
  ];
  
  const clinicIds: string[] = [];
  for (const c of clinics) {
    const { data: existing } = await supabaseAdmin.from('clinics').select('id').eq('name', c.name).maybeSingle();
    if (existing) {
      clinicIds.push(existing.id);
    } else {
      const { data } = await supabaseAdmin.from('clinics').insert(c).select('id').single();
      if (data) clinicIds.push(data.id);
    }
  }

  const envPassword = process.env.SEED_USER_PASSWORD || 'password123';

  async function ensureUser(email: string, role: 'doctor' | 'staff', name: string, clinicId: string) {
    let { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
    let user = users.find(u => u.email === email);
    
    if (!user) {
      const res = await supabaseAdmin.auth.admin.createUser({
        email,
        password: envPassword,
        email_confirm: true,
        user_metadata: { role }
      });
      user = res.data.user!;
    }
    
    // Ensure profile
    if (role === 'doctor') {
      const { data: profile } = await supabaseAdmin.from('doctor_profiles').select('id').eq('id', user.id).maybeSingle();
      if (!profile) {
        await supabaseAdmin.from('doctor_profiles').insert({
          id: user.id,
          name,
          phone: '+923000000001',
          onboarding_status: 'complete',
          clinic_id: clinicId
        });
      }
    } else {
      const { data: profile } = await supabaseAdmin.from('staff_profiles').select('id').eq('id', user.id).maybeSingle();
      if (!profile) {
        await supabaseAdmin.from('staff_profiles').insert({
          id: user.id,
          name,
          phone: '+923000000002',
          onboarding_status: 'complete',
          clinic_id: clinicId
        });
      }
    }
    return user.id;
  }

  const doc1Id = await ensureUser('doctor1@demo.com', 'doctor', 'Dr. Demo', clinicIds[0]);
  const doc2Id = await ensureUser('doctor2@demo.com', 'doctor', 'Dr. Smith', clinicIds[0]);
  const doc3Id = await ensureUser('doctor3@demo.com', 'doctor', 'Dr. Other Clinic', clinicIds[1]);
  const staffId = await ensureUser('staff@demo.com', 'staff', 'Demo Staff', clinicIds[0]);
  
  // Seed Specializations using RPC
  await supabaseAdmin.rpc('upsert_doctor_specializations', {
    p_doctor_id: doc1Id,
    p_specializations: [
      { name: 'Cardiology', experience_years: 5, is_primary: true },
      { name: 'Internal Medicine', experience_years: 2, is_primary: false }
    ]
  });
  await supabaseAdmin.rpc('upsert_doctor_specializations', {
    p_doctor_id: doc2Id,
    p_specializations: [
      { name: 'Neurology', experience_years: 8, is_primary: true }
    ]
  });
  await supabaseAdmin.rpc('upsert_doctor_specializations', {
    p_doctor_id: doc3Id,
    p_specializations: [
      { name: 'Cardiology', experience_years: 1, is_primary: true }
    ]
  });

  // Seed Availability
  const availabilities = [];
  for (let d = 1; d <= 5; d++) {
    availabilities.push({ doctor_id: doc1Id, weekday: d, start_time: '09:00', end_time: '17:00', break_start: '13:00', break_end: '14:00', slot_minutes: 30, is_active: true });
    availabilities.push({ doctor_id: doc2Id, weekday: d, start_time: '10:00', end_time: '14:00', break_start: null, break_end: null, slot_minutes: 15, is_active: true });
    availabilities.push({ doctor_id: doc3Id, weekday: d, start_time: '08:00', end_time: '12:00', break_start: null, break_end: null, slot_minutes: 20, is_active: true });
  }
  await supabaseAdmin.from('doctor_availability').insert(availabilities);

  // Seed patients
  const { count } = await supabaseAdmin.from('patients').select('*', { count: 'exact', head: true });
  if (count && count < 10) {
    console.log('Seeding patients...');
    const patients = Array.from({ length: 10 }).map((_, i) => ({
      name: `Patient ${i + 1}`,
      phone: `+92300${(1000000 + i).toString()}`,
      dob: '1990-01-01',
      gender: i % 2 === 0 ? 'Male' : 'Female',
    }));
    await supabaseAdmin.from('patients').insert(patients);
  }

  // Assign some patients to doctor
  const { data: allPatients } = await supabaseAdmin.from('patients').select('id').limit(5);
  if (allPatients && allPatients.length > 0) {
    for (const p of allPatients) {
      try { await supabaseAdmin.from('doctor_patients').insert({ doctor_id: doc1Id, patient_id: p.id }); } catch(e) {}
    }
    
    // Seed an appointment for today to block a slot
    const today = new Date().toISOString().split('T')[0];
    const { data: existingAppts } = await supabaseAdmin.from('appointments').select('id').eq('doctor_id', doc1Id).limit(1);
    
    if (!existingAppts || existingAppts.length === 0) {
      console.log('Seeding appointments...');
      await supabaseAdmin.from('appointments').insert({
        patient_id: allPatients[0].id,
        doctor_id: doc1Id,
        clinic_id: clinicIds[0],
        scheduled_start: `${today}T09:30:00Z`, // 9:30 AM UTC
        scheduled_end: `${today}T10:00:00Z`,
        status: 'scheduled'
      });
    }
  }
  
  console.log('Seeding complete.');
  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
