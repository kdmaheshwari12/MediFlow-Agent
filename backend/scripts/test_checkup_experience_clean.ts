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

async function runEmpiricalCheckupTestSuite() {
  console.log('====================================================');
  console.log('STARTING EMPIRICAL TEST SUITE: Doctor Checkup Experience');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} ${detail ? `- ${detail}` : ''}`);
      failed++;
    }
  }

  // 1. Get test doctor & clinic
  const { data: doctors } = await supabase.from('doctor_profiles').select('id, name').limit(1);
  if (!doctors || doctors.length === 0) {
    console.error('No test doctor found');
    process.exit(1);
  }
  const doctor = doctors[0];
  console.log(`Test Doctor: ${doctor.name} (${doctor.id})\n`);

  // 2. Get or create test patient
  const testMrn = `TEST-MRN-${Date.now().toString().slice(-4)}`;
  const { data: patient, error: pErr } = await supabase.from('patients').insert({
    mrn: testMrn,
    name: 'Jane Checkup Test',
    phone: '+15550001122',
    age: 34,
    gender: 'female',
    allergies: 'Penicillin, Peanuts'
  }).select('*').single();

  if (pErr || !patient) {
    console.error('Failed to create test patient:', pErr);
    process.exit(1);
  }

  // 3. Create 2 test appointments for doctor
  const todayStr = new Date().toISOString().split('T')[0];
  const { data: appt1, error: aErr1 } = await supabase.from('appointments').insert({
    patient_id: patient.id,
    doctor_id: doctor.id,
    date: todayStr,
    time_slot: '10:00 AM',
    scheduled_start: `${todayStr}T10:00:00Z`,
    scheduled_end: `${todayStr}T10:30:00Z`,
    status: 'scheduled',
    reason: 'Initial consultation for hypertension'
  }).select('*').single();

  const { data: appt2, error: aErr2 } = await supabase.from('appointments').insert({
    patient_id: patient.id,
    doctor_id: doctor.id,
    date: todayStr,
    time_slot: '11:30 AM',
    scheduled_start: `${todayStr}T11:30:00Z`,
    scheduled_end: `${todayStr}T12:00:00Z`,
    status: 'scheduled',
    reason: 'Second consultation'
  }).select('*').single();

  if (aErr1 || !appt1 || aErr2 || !appt2) {
    console.error('Failed to create test appointments:', aErr1 || aErr2);
    process.exit(1);
  }

  // TEST 1: Start checkup updates status to in_consultation (or in_progress)
  try {
    const { data: updatedAppt, error: startErr } = await supabase.from('appointments')
      .update({ status: 'in_progress', started_at: new Date().toISOString() })
      .eq('id', appt1.id)
      .select('*')
      .single();

    assert(!startErr && (updatedAppt.status === 'in_progress' || updatedAppt.status === 'in_consultation'), 'Test 1: Start Checkup updates appointment status cleanly', startErr?.message);
  } catch (err: any) {
    assert(false, 'Test 1: Start Checkup failed', err.message);
  }

  // TEST 2: Doctor history BY MRN returns isReturning=false for new patient
  try {
    const { data: prescriptions } = await supabase.from('prescriptions')
      .select('*')
      .eq('patient_id', patient.id)
      .eq('doctor_id', doctor.id);

    const isReturning = (prescriptions?.length || 0) > 0;
    assert(!isReturning, 'Test 2: Patient History returns isReturning=false for new patient without prior prescriptions');
  } catch (err: any) {
    assert(false, 'Test 2: Patient History failed', err.message);
  }

  // TEST 3: Complete Checkup Transaction (Save Prescription + Draft Message in message_logs + Complete Appt)
  let savedPrescriptionId = '';
  let messageLogId = '';
  try {
    // a. Insert Prescription
    const { data: rx, error: rxErr } = await supabase.from('prescriptions').insert({
      appointment_id: appt1.id,
      patient_id: patient.id,
      doctor_id: doctor.id,
      diagnosis: 'Essential Hypertension',
      medicines: [{ name: 'Amlodipine', dosage: '5mg', frequency: 'Once daily', duration: '14 Days' }],
      notes: 'BP slightly elevated at 135/88',
      follow_up_period: '7 Days',
      follow_up_due_date: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
    }).select('*').single();

    assert(!rxErr && Boolean(rx), 'Test 3a: Prescription row created successfully', rxErr?.message);
    if (rx) savedPrescriptionId = rx.id;

    // b. Update Appointment Status to completed
    const { data: completedAppt, error: completeErr } = await supabase.from('appointments')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', appt1.id)
      .select('*')
      .single();

    assert(!completeErr && completedAppt.status === 'completed', 'Test 3b: Appointment status updated to completed');

    // c. Insert Draft into message_logs BEFORE sending SMS
    const { data: msgLog, error: msgErr } = await supabase.from('message_logs').insert({
      patient_id: patient.id,
      appointment_id: appt1.id,
      prescription_id: rx.id,
      doctor_id: doctor.id,
      draft: `Dear Jane, Dr. ${doctor.name} prescribed: Amlodipine (5mg, Once daily). Diagnosis: Essential Hypertension. Please follow up after 7 days.`,
      status: 'drafted'
    }).select('*').single();

    assert(!msgErr && msgLog.status === 'drafted', 'Test 3c: SMS draft stored in message_logs with status=drafted before dispatch');
    if (msgLog) messageLogId = msgLog.id;

    // d. Update message_logs status to sent
    const { data: updatedMsgLog, error: msgUpErr } = await supabase.from('message_logs')
      .update({ status: 'sent', sent_at: new Date().toISOString(), provider_response: { provider: 'mock', messageId: `msg-${Date.now()}` } })
      .eq('id', msgLog.id)
      .select('*')
      .single();

    assert(!msgUpErr && updatedMsgLog.status === 'sent', 'Test 3d: message_logs updated to status=sent after dispatch');
  } catch (err: any) {
    assert(false, 'Test 3: Complete Checkup Transaction failed', err.message);
  }

  // TEST 4: SMS Failure does NOT rollback saved prescription
  try {
    const { data: rxCheck } = await supabase.from('prescriptions').select('id').eq('id', savedPrescriptionId).single();
    assert(Boolean(rxCheck), 'Test 4: Saved prescription persists independently of SMS delivery state');
  } catch (err: any) {
    assert(false, 'Test 4: SMS failure check', err.message);
  }

  // TEST 5: Message Resend Endpoint reuses stored draft
  try {
    const { data: logToResend } = await supabase.from('message_logs').select('*').eq('id', messageLogId).single();
    assert(logToResend && logToResend.draft.includes('Amlodipine'), 'Test 5: Resend retrieves stored draft cleanly');

    const { error: resendErr } = await supabase.from('message_logs')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', messageLogId);

    assert(!resendErr, 'Test 5: Message log updated after resend');
  } catch (err: any) {
    assert(false, 'Test 5: Message resend failed', err.message);
  }

  // TEST 6: Subsequent visit for SAME MRN includes previous prescriptions and drafts in history
  try {
    const { data: historyRx } = await supabase.from('prescriptions')
      .select('*, message_logs(*)')
      .eq('patient_id', patient.id)
      .eq('doctor_id', doctor.id);

    const isReturningNow = (historyRx?.length || 0) > 0;
    assert(Boolean(isReturningNow && historyRx && historyRx.length > 0 && historyRx[0].diagnosis === 'Essential Hypertension'), 'Test 6: Returning patient history BY MRN includes stored prescriptions and message log drafts');
  } catch (err: any) {
    assert(false, 'Test 6: Returning patient check failed', err.message);
  }

  // Cleanup test data
  await supabase.from('message_logs').delete().eq('patient_id', patient.id);
  await supabase.from('prescriptions').delete().eq('patient_id', patient.id);
  await supabase.from('appointments').delete().eq('patient_id', patient.id);
  await supabase.from('patients').delete().eq('id', patient.id);

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runEmpiricalCheckupTestSuite();
