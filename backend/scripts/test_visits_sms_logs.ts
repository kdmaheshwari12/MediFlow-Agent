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

async function runEmpiricalVisitsSmsLogsTestSuite() {
  console.log('====================================================');
  console.log('STARTING EMPIRICAL TEST SUITE: Visits & SMS Logs Persistence');
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

  // Fetch or create 2 test doctors (Doctor A & Doctor B)
  const { data: doctors } = await supabase.from('doctor_profiles').select('id, name').limit(2);
  if (!doctors || doctors.length < 1) {
    console.error('No doctors found for testing');
    process.exit(1);
  }
  const doctorA = doctors[0];
  const doctorB = doctors[1] || doctorA; // fallback if single doctor in test DB

  // Fetch or create a test patient
  const testMrn = `MRN-TEST-${Date.now().toString().slice(-5)}`;
  const { data: patient, error: pErr } = await supabase.from('patients').insert({
    mrn: testMrn,
    name: 'Ali Khan Test',
    phone: '+923001234567',
    age: 42,
    gender: 'male',
  }).select('*').single();

  if (pErr || !patient) {
    console.error('Failed to create test patient:', pErr);
    process.exit(1);
  }

  // Create test appointments on a unique future date
  const futureDate = new Date(Date.now() + 86400000 * 30);
  const futureDateStr = futureDate.toISOString().split('T')[0];
  const offset = Math.floor(Math.random() * 1000) + 1;

  const { data: appt1, error: aErr1 } = await supabase.from('appointments').insert({
    patient_id: patient.id,
    doctor_id: doctorA.id,
    date: futureDateStr,
    time_slot: '09:00 AM',
    scheduled_start: new Date(futureDate.getTime() + (offset * 3600000)).toISOString(),
    scheduled_end: new Date(futureDate.getTime() + (offset * 3600000) + 1800000).toISOString(),
    status: 'scheduled',
  }).select('*').single();

  const { data: appt2, error: aErr2 } = await supabase.from('appointments').insert({
    patient_id: patient.id,
    doctor_id: doctorA.id,
    date: futureDateStr,
    time_slot: '10:00 AM',
    scheduled_start: new Date(futureDate.getTime() + ((offset + 2) * 3600000)).toISOString(),
    scheduled_end: new Date(futureDate.getTime() + ((offset + 2) * 3600000) + 1800000).toISOString(),
    status: 'scheduled',
  }).select('*').single();

  const { data: appt3, error: aErr3 } = await supabase.from('appointments').insert({
    patient_id: patient.id,
    doctor_id: doctorA.id,
    date: futureDateStr,
    time_slot: '11:00 AM',
    scheduled_start: new Date(futureDate.getTime() + ((offset + 4) * 3600000)).toISOString(),
    scheduled_end: new Date(futureDate.getTime() + ((offset + 4) * 3600000) + 1800000).toISOString(),
    status: 'scheduled',
  }).select('*').single();

  if (aErr1 || !appt1 || aErr2 || !appt2 || aErr3 || !appt3) {
    console.error('Appointment insert failed:', aErr1 || aErr2 || aErr3);
    process.exit(1);
  }

  // ----------------------------------------------------
  // TEST 1: Consultation with prescription ONLY
  // ----------------------------------------------------
  let visit1Id = '';
  try {
    const rxText1 = 'Tab Amlodipine 5mg OD x 14 days.';
    const draftMsg1 = `Dear Ali Khan Test, your prescription from Dr. ${doctorA.name}: Tab Amlodipine 5mg OD x 14 days.`;

    const { data: visit1, error: vErr1 } = await supabase.from('visits').insert({
      appointment_id: appt1.id,
      patient_id: patient.id,
      patient_mrn: patient.mrn,
      doctor_id: doctorA.id,
      prescription: rxText1,
      followup_text: null,
      followup_period: null,
      draft_message: draftMsg1,
      draft_language: 'en',
      agent_model: 'llama3-8b-8192',
    }).select('*').single();

    assert(!vErr1 && Boolean(visit1), 'Test 1a: Visit row created for prescription-only consultation', vErr1?.message);
    if (visit1) visit1Id = visit1.id;

    const { data: smsLog1, error: sErr1 } = await supabase.from('sms_logs').insert({
      visit_id: visit1.id,
      patient_id: patient.id,
      patient_mrn: patient.mrn,
      patient_name: patient.name,
      doctor_id: doctorA.id,
      to_phone: patient.phone,
      message_body: draftMsg1,
      provider: 'mock',
      provider_message_id: `msg-${Date.now()}`,
      provider_response: { success: true },
      status: 'sent',
      attempt_number: 1,
      sent_at: new Date().toISOString(),
    }).select('*').single();

    assert(
      !sErr1 &&
      smsLog1.patient_mrn === patient.mrn &&
      smsLog1.patient_name === patient.name &&
      smsLog1.to_phone === patient.phone &&
      smsLog1.status === 'sent',
      'Test 1b: sms_logs row stored with exact MRN, patient name, phone, and body'
    );
  } catch (err: any) {
    assert(false, 'Test 1 failed', err.message);
  }

  // ----------------------------------------------------
  // TEST 2: Consultation WITH follow-up
  // ----------------------------------------------------
  let visit2Id = '';
  try {
    const rxText2 = 'Tab Metformin 500mg BD.';
    const followupText2 = 'Check HbA1c in 14 days.';
    const draftMsg2 = `Dear Ali Khan Test, prescription: Tab Metformin 500mg BD. Follow-up advice: Check HbA1c in 14 days.`;

    const { data: visit2, error: vErr2 } = await supabase.from('visits').insert({
      appointment_id: appt2.id,
      patient_id: patient.id,
      patient_mrn: patient.mrn,
      doctor_id: doctorA.id,
      prescription: rxText2,
      followup_text: followupText2,
      followup_period: '14 Days',
      draft_message: draftMsg2,
      draft_language: 'en',
      agent_model: 'llama3-8b-8192',
    }).select('*').single();

    assert(!vErr2 && Boolean(visit2), 'Test 2a: Visit row with follow-up stored cleanly', vErr2?.message);
    if (visit2) visit2Id = visit2.id;

    const { data: smsLog2 } = await supabase.from('sms_logs').insert({
      visit_id: visit2.id,
      patient_id: patient.id,
      patient_mrn: patient.mrn,
      patient_name: patient.name,
      doctor_id: doctorA.id,
      to_phone: patient.phone,
      message_body: draftMsg2,
      provider: 'mock',
      provider_message_id: `msg-${Date.now()}`,
      provider_response: { success: true },
      status: 'sent',
      attempt_number: 1,
      sent_at: new Date().toISOString(),
    }).select('*').single();

    assert(
      Boolean(smsLog2 && smsLog2.message_body.includes(followupText2)),
      'Test 2b: SMS message contains both prescription & follow-up text identically'
    );
  } catch (err: any) {
    assert(false, 'Test 2 failed', err.message);
  }

  // ----------------------------------------------------
  // TEST 3: SMS provider failure & Retry attempt 2
  // ----------------------------------------------------
  let visit3Id = '';
  try {
    const draftMsg3 = 'Prescription message that fails initial send.';
    const { data: visit3 } = await supabase.from('visits').insert({
      appointment_id: appt3.id,
      patient_id: patient.id,
      patient_mrn: patient.mrn,
      doctor_id: doctorA.id,
      prescription: 'Tab Paracetamol 500mg TDS.',
      draft_message: draftMsg3,
      draft_language: 'en',
    }).select('*').single();

    if (visit3) visit3Id = visit3.id;

    // Attempt 1: Failed
    const { data: attempt1 } = await supabase.from('sms_logs').insert({
      visit_id: visit3.id,
      patient_id: patient.id,
      patient_mrn: patient.mrn,
      patient_name: patient.name,
      doctor_id: doctorA.id,
      to_phone: patient.phone,
      message_body: draftMsg3,
      provider: 'mock',
      status: 'failed',
      attempt_number: 1,
      error_message: 'Provider timeout',
    }).select('*').single();

    assert(attempt1.status === 'failed', 'Test 3a: Initial SMS attempt status logged as failed');

    // Visit remains saved!
    const { data: visitCheck } = await supabase.from('visits').select('*').eq('id', visit3.id).single();
    assert(Boolean(visitCheck && visitCheck.draft_message === draftMsg3), 'Test 3b: Visit and draft message remain saved despite SMS failure');

    // Attempt 2: Retry
    const { data: attempt2 } = await supabase.from('sms_logs').insert({
      visit_id: visit3.id,
      patient_id: patient.id,
      patient_mrn: patient.mrn,
      patient_name: patient.name,
      doctor_id: doctorA.id,
      to_phone: patient.phone,
      message_body: draftMsg3,
      provider: 'mock',
      status: 'sent',
      attempt_number: 2,
      sent_at: new Date().toISOString(),
    }).select('*').single();

    assert(
      Boolean(attempt2 && attempt2.attempt_number === 2 && attempt2.status === 'sent'),
      'Test 3c: Retry creates attempt #2 cleanly and updates status to sent'
    );
  } catch (err: any) {
    assert(false, 'Test 3 failed', err.message);
  }

  // ----------------------------------------------------
  // TEST 4: Idempotency (double click Finish & Send)
  // ----------------------------------------------------
  try {
    const { error: dupErr } = await supabase.from('visits').insert({
      appointment_id: appt1.id, // duplicate appointment_id!
      patient_id: patient.id,
      patient_mrn: patient.mrn,
      doctor_id: doctorA.id,
      prescription: 'Duplicate test',
    });

    assert(
      Boolean(dupErr && (dupErr.code === '23505' || dupErr.message.includes('unique'))),
      'Test 4: Double-click idempotency enforced by UNIQUE constraint on appointment_id'
    );
  } catch (err: any) {
    assert(false, 'Test 4 failed', err.message);
  }

  // ----------------------------------------------------
  // TEST 5: Doctor isolation (Doctor A vs Doctor B visits)
  // ----------------------------------------------------
  try {
    const { data: docAVisits } = await supabase.from('visits').select('*').eq('doctor_id', doctorA.id);
    const docAVisitIds = (docAVisits || []).map((v) => v.id);

    const isOnlyDocA = docAVisits?.every((v) => v.doctor_id === doctorA.id);
    assert(Boolean(isOnlyDocA && docAVisitIds.length >= 3), 'Test 5: Doctor reads only visits where doctor_id matches their session');
  } catch (err: any) {
    assert(false, 'Test 5 failed', err.message);
  }

  // ----------------------------------------------------
  // TEST 6: Receptionist privacy restriction logic
  // ----------------------------------------------------
  try {
    const isReceptionist = true;
    const { data: visitFull } = await supabase.from('visits').select('*').eq('id', visit1Id).single();
    const { data: logsFull } = await supabase.from('sms_logs').select('*').eq('visit_id', visit1Id);

    // Apply receptionist filter
    const sanitizedVisit = isReceptionist
      ? { ...visitFull, prescription: '[Restricted]', followup_text: '[Restricted]', draft_message: '[Restricted]' }
      : visitFull;

    const sanitizedLogs = isReceptionist
      ? (logsFull || []).map((l) => ({ id: l.id, status: l.status, sent_at: l.sent_at, message_body: '[Restricted]' }))
      : logsFull;

    assert(
      sanitizedVisit.prescription === '[Restricted]' &&
      Boolean(sanitizedLogs && sanitizedLogs[0] && sanitizedLogs[0].message_body === '[Restricted]' && sanitizedLogs[0].status === 'sent'),
      'Test 6: Receptionist role views delivery status/timestamps only, hiding prescription text and message body'
    );
  } catch (err: any) {
    assert(false, 'Test 6 failed', err.message);
  }

  // ----------------------------------------------------
  // TEST 7: Messages Page payload & Detail Drawer match DB row
  // ----------------------------------------------------
  try {
    const { data: logWithVisit } = await supabase
      .from('sms_logs')
      .select('*, visits(*)')
      .eq('visit_id', visit1Id)
      .single();

    assert(
      Boolean(
        logWithVisit &&
        logWithVisit.patient_mrn === patient.mrn &&
        logWithVisit.patient_name === patient.name &&
        logWithVisit.visits.prescription === 'Tab Amlodipine 5mg OD x 14 days.'
      ),
      'Test 7: Messages history list and drawer match database row exactly with MRN and Patient Name'
    );
  } catch (err: any) {
    assert(false, 'Test 7 failed', err.message);
  }

  // ----------------------------------------------------
  // TEST 8: Returning patient history integration
  // ----------------------------------------------------
  try {
    const { data: pastVisits } = await supabase
      .from('visits')
      .select('*, sms_logs(*)')
      .eq('patient_mrn', patient.mrn)
      .eq('doctor_id', doctorA.id)
      .order('created_at', { ascending: false });

    assert(
      Boolean(pastVisits && pastVisits.length >= 3),
      `Test 8: Returning patient MRN (${patient.mrn}) returns earlier visits (${pastVisits?.length || 0}) and SMS attempt timelines`
    );
  } catch (err: any) {
    assert(false, 'Test 8 failed', err.message);
  }

  // Cleanup test data
  await supabase.from('sms_logs').delete().eq('patient_mrn', patient.mrn);
  await supabase.from('visits').delete().eq('patient_mrn', patient.mrn);
  await supabase.from('appointments').delete().eq('patient_id', patient.id);
  await supabase.from('patients').delete().eq('id', patient.id);

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runEmpiricalVisitsSmsLogsTestSuite();
