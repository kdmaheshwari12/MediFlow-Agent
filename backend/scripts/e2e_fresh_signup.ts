import { buildApp } from '../src/app';
import { supabaseAdmin } from '../src/lib/supabase';
import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

async function runE2ETest() {
  console.log('--- STARTING E2E FRESH SIGNUP VERIFICATION ---');
  const app = await buildApp();

  const timestamp = Date.now();
  const staffEmail = `staff_${timestamp}@testclinic.com`;
  const docEmails = [
    `doc1_${timestamp}@testclinic.com`,
    `doc2_${timestamp}@testclinic.com`,
    `doc3_${timestamp}@testclinic.com`,
    `doc4_${timestamp}@testclinic.com`,
  ];
  const password = 'Password123!';

  // Helper to cleanup test users by email
  const cleanupUser = async (email: string) => {
    const { data: users } = await supabaseAdmin.auth.admin.listUsers();
    const existing = users?.users?.find(u => u.email === email);
    if (existing) {
      const id = existing.id;
      await supabaseAdmin.from('doctor_availability').delete().eq('doctor_id', id);
      await supabaseAdmin.from('doctor_specializations').delete().eq('doctor_id', id);
      await supabaseAdmin.from('doctor_patients').delete().eq('doctor_id', id);
      await supabaseAdmin.from('appointments').delete().eq('doctor_id', id);
      await supabaseAdmin.from('doctor_profiles').delete().eq('id', id);
      await supabaseAdmin.from('staff_profiles').delete().eq('id', id);
      await supabaseAdmin.auth.admin.deleteUser(id);
    }
  };

  try {
    await cleanupUser(staffEmail);
    for (const email of docEmails) {
      await cleanupUser(email);
    }

    // 1. Sign up 1 receptionist
    console.log('\n1. Signing up receptionist...');
    const staffSignupRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/signup/staff',
      payload: {
        email: staffEmail,
        password,
        name: 'Central Receptionist',
        phone: '03001234567',
        clinic_name: 'CareFlow General Hospital'
      }
    });

    if (staffSignupRes.statusCode !== 201) {
      throw new Error(`Staff signup failed (${staffSignupRes.statusCode}): ${staffSignupRes.body}`);
    }
    const staffUserId = JSON.parse(staffSignupRes.body).user_id;
    console.log(`✅ Receptionist signed up with ID: ${staffUserId}`);

    await supabaseAdmin.auth.admin.updateUserById(staffUserId, { email_confirm: true });

    const { data: staffAuth, error: staffAuthErr } = await supabaseAdmin.auth.signInWithPassword({
      email: staffEmail,
      password
    });
    if (staffAuthErr || !staffAuth.session) {
      throw new Error(`Staff login failed: ${staffAuthErr?.message}`);
    }
    const staffToken = staffAuth.session.access_token;

    // 2. Sign up and complete onboarding for 4 doctors
    const docIds: string[] = [];
    const doctorConfigs = [
      { name: 'Dr. Alice Smith', spec: 'Cardiology', days: [0, 1, 2, 3, 4, 5, 6], bStart: '13:00', bEnd: '14:00' },
      { name: 'Dr. Bob Jones', spec: 'Neurology', days: [1, 2, 3], bStart: null, bEnd: null },
      { name: 'Dr. Carol Danvers', spec: 'Pediatrics', days: [2, 4], bStart: '12:00', bEnd: '12:30' },
      { name: 'Dr. David Banner', spec: 'Dermatology', days: [1, 3, 5], bStart: null, bEnd: null },
    ];

    for (let i = 0; i < 4; i++) {
      const email = docEmails[i];
      const config = doctorConfigs[i];
      console.log(`\n2.${i + 1} Signing up Doctor ${i + 1}: ${config.name}...`);

      const docSignupRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/signup/doctor',
        payload: {
          email,
          password,
          name: config.name,
          phone: `0300999000${i + 1}`
        }
      });

      if (docSignupRes.statusCode !== 201) {
        throw new Error(`Doctor ${i + 1} signup failed (${docSignupRes.statusCode}): ${docSignupRes.body}`);
      }
      const docUserId = JSON.parse(docSignupRes.body).user_id;
      docIds.push(docUserId);
      await supabaseAdmin.auth.admin.updateUserById(docUserId, { email_confirm: true });

      const { data: docAuth, error: docAuthErr } = await supabaseAdmin.auth.signInWithPassword({
        email,
        password
      });
      if (docAuthErr || !docAuth.session) {
        throw new Error(`Doctor ${i + 1} login failed: ${docAuthErr?.message}`);
      }
      const docToken = docAuth.session.access_token;

      // Step 1: Info
      const infoRes = await app.inject({
        method: 'POST',
        url: '/api/v1/onboarding/doctor/info',
        headers: { authorization: `Bearer ${docToken}` },
        payload: {
          qualification: 'MBBS, FCPS',
          license_number: `DOC-${(timestamp % 10000) + i}`,
          clinic_name: 'CareFlow General Hospital'
        }
      });
      if (infoRes.statusCode !== 200) throw new Error(`Onboarding info failed for Doc ${i + 1}: ${infoRes.body}`);

      // Step 2: Specialization
      const specRes = await app.inject({
        method: 'POST',
        url: '/api/v1/onboarding/doctor/specialization',
        headers: { authorization: `Bearer ${docToken}` },
        payload: {
          specializations: [{ name: config.spec, experience_years: 5 + i * 2, is_primary: true }]
        }
      });
      if (specRes.statusCode !== 200) throw new Error(`Onboarding specialization failed for Doc ${i + 1}: ${specRes.body}`);

      // Step 3: Availability
      const availPayload = config.days.map(weekday => ({
        weekday,
        start_time: '09:00',
        end_time: '17:00',
        break_start: config.bStart,
        break_end: config.bEnd,
        slot_minutes: 15
      }));

      const availRes = await app.inject({
        method: 'POST',
        url: '/api/v1/onboarding/doctor/availability',
        headers: { authorization: `Bearer ${docToken}` },
        payload: {
          daily_patient_limit: 25 + i * 5,
          availability: availPayload
        }
      });
      if (availRes.statusCode !== 200) throw new Error(`Onboarding availability failed for Doc ${i + 1}: ${availRes.body}`);
      console.log(`✅ Doctor ${i + 1} onboarding complete!`);
    }

    // 3. Receptionist fetches ALL doctors
    console.log('\n3. Receptionist fetching doctors list via GET /api/v1/doctors...');
    const doctorsListRes = await app.inject({
      method: 'GET',
      url: '/api/v1/doctors',
      headers: { authorization: `Bearer ${staffToken}` }
    });

    if (doctorsListRes.statusCode !== 200) {
      throw new Error(`Receptionist fetch doctors failed (${doctorsListRes.statusCode}): ${doctorsListRes.body}`);
    }

    const returnedDoctors = JSON.parse(doctorsListRes.body);
    console.log(`Returned ${returnedDoctors.length} doctors.`);

    if (returnedDoctors.length < 4) {
      throw new Error(`EXPECTED AT LEAST 4 DOCTORS, BUT GOT ${returnedDoctors.length}`);
    }

    for (const doc of returnedDoctors) {
      if (doc.cnic || doc.license_number || doc.phone || doc.email) {
        throw new Error(`SENSITIVE FIELD EXPOSED on doctor ${doc.id}: ${JSON.stringify(doc)}`);
      }
    }
    console.log('✅ Sensitive fields (CNIC, license_number, phone, email) are strictly hidden.');

    // 4. Verify booking an appointment works
    console.log('\n4. Receptionist creating patient & booking an appointment for Doctor 1...');
    const patientRes = await app.inject({
      method: 'POST',
      url: '/api/v1/patients',
      headers: { authorization: `Bearer ${staffToken}` },
      payload: {
        name: 'Test Patient E2E',
        phone: `0312${timestamp % 10000000}`,
        age: 35,
        gender: 'Male'
      }
    });

    if (patientRes.statusCode !== 201) {
      throw new Error(`Patient creation failed (${patientRes.statusCode}): ${patientRes.body}`);
    }
    const patientData = JSON.parse(patientRes.body);
    const patientId = patientData.id;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const targetDateStr = tomorrow.toISOString().split('T')[0];

    const bookRes = await app.inject({
      method: 'POST',
      url: '/api/v1/appointments',
      headers: { authorization: `Bearer ${staffToken}` },
      payload: {
        patient_id: patientId,
        doctor_id: docIds[0],
        date: targetDateStr,
        timeSlot: '10:00 AM',
        reason: 'E2E Verification'
      }
    });

    if (bookRes.statusCode !== 201) {
      throw new Error(`Appointment booking failed (${bookRes.statusCode}): ${bookRes.body}`);
    }
    const apptData = JSON.parse(bookRes.body);
    console.log(`✅ Appointment successfully booked with ID: ${apptData.id || apptData.appointment?.id}`);

    // Cleanup patient
    await supabaseAdmin.from('appointments').delete().eq('patient_id', patientId);
    await supabaseAdmin.from('patients').delete().eq('id', patientId);

    console.log('\n🎉 ALL E2E FRESH SIGNUP & BOOKING VERIFICATION CHECKS PASSED!');
  } finally {
    console.log('\nCleaning up E2E test users...');
    await cleanupUser(staffEmail);
    for (const email of docEmails) {
      await cleanupUser(email);
    }
    await app.close();
  }
}

runE2ETest().catch((err) => {
  console.error('\n❌ E2E FRESH SIGNUP VERIFICATION FAILED:', err);
  process.exit(1);
});
