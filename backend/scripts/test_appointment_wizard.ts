import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testAppointmentWizard() {
  console.log('====================================================');
  console.log('STARTING EMPIRICAL TEST SUITE: Receptionist Appointment Wizard Bug Fix');
  console.log('====================================================\n');

  let testPatientId: string | null = null;
  let testDoctorId: string | null = null;
  let testAppointmentId: string | null = null;
  const uniqueName = `Test Patient ${Date.now()}`;
  const uniquePhone = `+92300${Math.floor(1000000 + Math.random() * 9000000)}`;

  try {
    // ----------------------------------------------------
    // Test 1: New Patient Flow - Create Patient via API/DB
    // ----------------------------------------------------
    console.log('[RUNNING] Test 1: Creating new patient and verifying returned fields...');
    const { data: newPatient, error: patientErr } = await supabase
      .from('patients')
      .insert({
        name: uniqueName,
        phone: uniquePhone,
        age: 35,
        gender: 'Male',
      })
      .select('*')
      .single();

    if (patientErr || !newPatient) {
      throw new Error(`Failed to create patient: ${patientErr?.message}`);
    }

    testPatientId = newPatient.id;
    if (!newPatient.name || newPatient.name !== uniqueName) {
      throw new Error(`Patient name mismatch: expected "${uniqueName}", got "${newPatient.name}"`);
    }
    if (!newPatient.mrn || !newPatient.mrn.startsWith('MRN-')) {
      throw new Error(`Patient MRN invalid: ${newPatient.mrn}`);
    }
    console.log(`[PASS] Test 1: New patient created successfully. ID=${newPatient.id}, MRN=${newPatient.mrn}, Name=${newPatient.name}, Phone=${newPatient.phone}, Age=${newPatient.age}`);

    // ----------------------------------------------------
    // Test 2: Old Patient Lookup by MRN
    // ----------------------------------------------------
    console.log('[RUNNING] Test 2: Searching patient by MRN...');
    const { data: mrnMatch, error: mrnErr } = await supabase
      .from('patients')
      .select('*')
      .eq('mrn', newPatient.mrn)
      .single();

    if (mrnErr || !mrnMatch) {
      throw new Error(`Failed MRN search: ${mrnErr?.message}`);
    }
    if (mrnMatch.name !== uniqueName || mrnMatch.age !== 35 || mrnMatch.phone !== uniquePhone) {
      throw new Error(`MRN search returned incomplete patient data: ${JSON.stringify(mrnMatch)}`);
    }
    console.log(`[PASS] Test 2: Patient lookup by MRN returned complete object: Name="${mrnMatch.name}", Age=${mrnMatch.age}, Phone="${mrnMatch.phone}"`);

    // ----------------------------------------------------
    // Test 3: Old Patient Lookup by Phone Number
    // ----------------------------------------------------
    console.log('[RUNNING] Test 3: Searching patient by Phone Number...');
    const { data: phoneMatches, error: phoneErr } = await supabase
      .from('patients')
      .select('*')
      .eq('phone', uniquePhone);

    if (phoneErr || !phoneMatches || phoneMatches.length === 0) {
      throw new Error(`Failed phone search: ${phoneErr?.message}`);
    }
    const phoneMatch = phoneMatches[0];
    if (phoneMatch.name !== uniqueName || phoneMatch.mrn !== newPatient.mrn) {
      throw new Error(`Phone search returned mismatch: ${JSON.stringify(phoneMatch)}`);
    }
    console.log(`[PASS] Test 3: Patient lookup by Phone returned complete object: Name="${phoneMatch.name}", MRN="${phoneMatch.mrn}"`);

    // ----------------------------------------------------
    // Test 4: Fetch Doctor Profile for Booking
    // ----------------------------------------------------
    console.log('[RUNNING] Test 4: Fetching existing doctor profile...');
    const { data: doctors, error: docErr } = await supabase
      .from('doctor_profiles')
      .select(`
        id,
        name,
        experience_years,
        doctor_specializations!inner(
          specializations!inner(name)
        )
      `)
      .limit(1);

    if (docErr || !doctors || doctors.length === 0) {
      throw new Error(`No doctor found in DB for testing: ${docErr?.message}`);
    }

    const doc = doctors[0];
    testDoctorId = doc.id;
    const docName = doc.name;
    const specList = doc.doctor_specializations.map((ds: any) => ds.specializations?.name).filter(Boolean);
    const specName = specList.join(', ') || 'General Medicine';

    if (!docName || docName.toLowerCase() === 'unknown') {
      throw new Error(`Invalid doctor name in DB: ${docName}`);
    }
    console.log(`[PASS] Test 4: Doctor fetched successfully. ID=${testDoctorId}, Name="${docName}", Specialization="${specName}"`);

    // ----------------------------------------------------
    // Test 5: Booking Appointment via DB & Verifying Joined Payload
    // ----------------------------------------------------
    console.log('[RUNNING] Test 5: Creating appointment & validating joined patient and doctor payload...');
    const appointmentDate = new Date().toISOString().split('T')[0];
    const isoStart = `${appointmentDate}T10:30:00Z`;
    const isoEnd = `${appointmentDate}T10:45:00Z`;
    
    // Fetch a clinic id
    const { data: clinics } = await supabase.from('clinics').select('id').limit(1);
    const clinicId = clinics && clinics.length > 0 ? clinics[0].id : null;

    const { data: newAppt, error: apptErr } = await supabase
      .from('appointments')
      .insert({
        patient_id: testPatientId,
        doctor_id: testDoctorId,
        clinic_id: clinicId,
        date: appointmentDate,
        time_slot: '10:30 AM',
        scheduled_start: isoStart,
        scheduled_end: isoEnd,
        status: 'scheduled',
        reason: 'Routine Followup Test',
        source: 'reception_booking',
      })
      .select('*')
      .single();

    if (apptErr || !newAppt) {
      throw new Error(`Failed to create appointment: ${apptErr?.message}`);
    }

    testAppointmentId = newAppt.id;

    // Fetch joined record as done in GET /appointments and POST /appointments backend handler
    const { data: joinedAppt, error: joinErr } = await supabase
      .from('appointments')
      .select(`
        *,
        patients (
          id,
          mrn,
          name,
          age,
          phone
        ),
        doctor_profiles (
          id,
          name,
          doctor_specializations (
            specializations (
              name
            )
          )
        )
      `)
      .eq('id', testAppointmentId)
      .single();

    if (joinErr || !joinedAppt) {
      throw new Error(`Failed to fetch joined appointment: ${joinErr?.message}`);
    }

    const resPatient = joinedAppt.patients;
    const resDoctor = joinedAppt.doctor_profiles;
    const resDoctorSpecs = resDoctor?.doctor_specializations?.map((s: any) => s.specializations?.name).filter(Boolean).join(', ') || 'General Practice';

    if (!resPatient || !resPatient.name || resPatient.name.toLowerCase() === 'unknown') {
      throw new Error(`Joined patient name is invalid or Unknown: ${JSON.stringify(resPatient)}`);
    }

    if (!resDoctor || !resDoctor.name || resDoctor.name.toLowerCase() === 'unknown') {
      throw new Error(`Joined doctor name is invalid or Unknown: ${JSON.stringify(resDoctor)}`);
    }

    console.log(`[PASS] Test 5: Joined appointment returned valid names. Patient Name="${resPatient.name}", MRN="${resPatient.mrn}", Doctor Name="${resDoctor.name}", Specialization="${resDoctorSpecs}"`);

    // ----------------------------------------------------
    // Test 6: Verify Saved Appointment References DB IDs Correctly
    // ----------------------------------------------------
    console.log('[RUNNING] Test 6: Verifying DB foreign key relationships...');
    if (joinedAppt.patient_id !== testPatientId || joinedAppt.doctor_id !== testDoctorId) {
      throw new Error(`Foreign key mismatch in DB appointment record! Expected patient_id=${testPatientId}, doctor_id=${testDoctorId}`);
    }
    console.log(`[PASS] Test 6: DB appointment correctly references patient_id (${joinedAppt.patient_id}) and doctor_id (${joinedAppt.doctor_id}).`);

    // ----------------------------------------------------
    // Test 7: Verify Zero "Unknown" strings in system payloads
    // ----------------------------------------------------
    console.log('[RUNNING] Test 7: Checking for "Unknown" fallback contamination...');
    const apptStringified = JSON.stringify(joinedAppt);
    if (apptStringified.includes('"Unknown"') || apptStringified.includes(': "Unknown"')) {
      throw new Error(`Found "Unknown" string in joined payload: ${apptStringified}`);
    }
    console.log('[PASS] Test 7: No "Unknown" fallback string present in joined appointment payload.');

    console.log('\n====================================================');
    console.log('ALL 7 EMPIRICAL TESTS PASSED SUCCESSFULLY!');
    console.log('====================================================');

  } catch (err: any) {
    console.error('\n[FAIL] Empirical Test Suite Error:', err.message || err);
    process.exit(1);
  } finally {
    // Cleanup created test records
    if (testAppointmentId) {
      await supabase.from('appointments').delete().eq('id', testAppointmentId);
    }
    if (testPatientId) {
      await supabase.from('patients').delete().eq('id', testPatientId);
    }
  }
}

testAppointmentWizard();
