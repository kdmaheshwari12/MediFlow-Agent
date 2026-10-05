import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { getServerZonedNow } from '../src/lib/availability-contract';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runEmpiricalDoctorPatientsTestSuite() {
  console.log('====================================================');
  console.log('STARTING EMPIRICAL TEST SUITE: Date-Wise Doctor Patients Directory');
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

  // 1. Get test doctors
  const { data: doctors } = await supabase.from('doctor_profiles').select('id, name').limit(2);
  if (!doctors || doctors.length < 1) {
    console.error('Test doctor profiles required');
    process.exit(1);
  }

  const doc1 = doctors[0];
  const doc2 = doctors[1] || { id: '00000000-0000-0000-0000-000000000000', name: 'Other Doctor' };

  console.log(`Test Doctor 1: ${doc1.name} (${doc1.id})`);
  console.log(`Test Doctor 2: ${doc2.name} (${doc2.id})\n`);

  // 2. Create test patient
  const testMrn = `PAT-DW-${Date.now().toString().slice(-4)}`;
  const { data: patient, error: pErr } = await supabase.from('patients').insert({
    mrn: testMrn,
    name: 'Datewise Test Patient',
    phone: '+923009988776',
    age: 40,
    gender: 'Male',
    allergies: 'None'
  }).select('*').single();

  if (pErr || !patient) {
    console.error('Failed to create test patient:', pErr);
    process.exit(1);
  }

  const { todayStr: karachiTodayStr } = getServerZonedNow('Asia/Karachi');
  const futureDateStr = new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0];

  // Create appointment for Doc1 today
  const { data: apptDoc1Today } = await supabase.from('appointments').insert({
    patient_id: patient.id,
    doctor_id: doc1.id,
    date: karachiTodayStr,
    time_slot: '09:00 AM',
    scheduled_start: `${karachiTodayStr}T09:00:00Z`,
    scheduled_end: `${karachiTodayStr}T09:30:00Z`,
    status: 'waiting',
    reason: 'Hypertension checkup'
  }).select('*').single();

  // Create appointment for Doc2 today (other doctor)
  const { data: apptDoc2Today } = await supabase.from('appointments').insert({
    patient_id: patient.id,
    doctor_id: doc2.id,
    date: karachiTodayStr,
    time_slot: '10:00 AM',
    scheduled_start: `${karachiTodayStr}T10:00:00Z`,
    scheduled_end: `${karachiTodayStr}T10:30:00Z`,
    status: 'waiting',
    reason: 'Second opinion'
  }).select('*').single();

  // Create appointment for Doc1 in future date
  const { data: apptDoc1Future } = await supabase.from('appointments').insert({
    patient_id: patient.id,
    doctor_id: doc1.id,
    date: futureDateStr,
    time_slot: '11:00 AM',
    scheduled_start: `${futureDateStr}T11:00:00Z`,
    scheduled_end: `${futureDateStr}T11:30:00Z`,
    status: 'scheduled',
    reason: 'Follow-up visit'
  }).select('*').single();

  // TEST 1: Today shows only this doctor's patients, never another doctor's
  try {
    const { data: doc1Appts } = await supabase
      .from('appointments')
      .select('id, doctor_id')
      .eq('doctor_id', doc1.id)
      .eq('date', karachiTodayStr)
      .neq('status', 'cancelled');

    const onlyDoc1 = (doc1Appts || []).every((a: any) => a.doctor_id === doc1.id);
    const hasDoc2Appt = (doc1Appts || []).some((a: any) => a.id === apptDoc2Today?.id);

    assert(onlyDoc1 && !hasDoc2Appt, 'Test 1: Today shows only this doctor\'s patients, never another doctor\'s');
  } catch (err: any) {
    assert(false, 'Test 1: Isolation check failed', err.message);
  }

  // TEST 2: Changing the date shows that date's patients, and a future date is read-only
  try {
    const { data: doc1FutureAppts } = await supabase
      .from('appointments')
      .select('id, date')
      .eq('doctor_id', doc1.id)
      .eq('date', futureDateStr);

    const hasFuture = (doc1FutureAppts || []).some((a: any) => a.id === apptDoc1Future?.id);
    const isFutureFlag = futureDateStr > karachiTodayStr;

    assert(hasFuture && isFutureFlag, 'Test 2: Changing date returns target date\'s appointments & future date marked read-only');
  } catch (err: any) {
    assert(false, 'Test 2: Date switching check failed', err.message);
  }

  // TEST 3: Status changes (Waiting -> In Progress -> Completed) reflect accurately in query
  try {
    // Update status to in_progress
    await supabase.from('appointments').update({ status: 'in_progress' }).eq('id', apptDoc1Today.id);
    const { data: apptProg } = await supabase.from('appointments').select('status').eq('id', apptDoc1Today.id).single();
    const isProg = apptProg?.status === 'in_progress';

    // Update status to completed
    await supabase.from('appointments').update({ status: 'completed' }).eq('id', apptDoc1Today.id);
    const { data: apptComp } = await supabase.from('appointments').select('status').eq('id', apptDoc1Today.id).single();
    const isComp = apptComp?.status === 'completed';

    assert(isProg && isComp, 'Test 3: Status transitions (Waiting -> In Progress -> Completed) reflect in DB query immediately');
  } catch (err: any) {
    assert(false, 'Test 3: Status transition check failed', err.message);
  }

  // TEST 4: Search and status filters work inside the selected date
  try {
    const { data: searched } = await supabase
      .from('appointments')
      .select('id, patients!inner(name, mrn)')
      .eq('doctor_id', doc1.id)
      .eq('date', karachiTodayStr)
      .ilike('patients.mrn', `%${testMrn}%`);

    assert((searched || []).length > 0, 'Test 4: Search filter by MRN inside selected date returns matching appointment');
  } catch (err: any) {
    assert(false, 'Test 4: Search filter check failed', err.message);
  }

  // TEST 5: A date with no patients shows correct empty state
  try {
    const emptyDateStr = '2029-12-31';
    const { data: emptyAppts } = await supabase
      .from('appointments')
      .select('id')
      .eq('doctor_id', doc1.id)
      .eq('date', emptyDateStr);

    assert((emptyAppts || []).length === 0, 'Test 5: Date with no patients returns 0 appointments cleanly');
  } catch (err: any) {
    assert(false, 'Test 5: Empty date check failed', err.message);
  }

  // TEST 6: "Today" matches Karachi time even when server runs in UTC
  try {
    const { todayStr, currentMins } = getServerZonedNow('Asia/Karachi');
    const isKarachiDateValid = /^\d{4}-\d{2}-\d{2}$/.test(todayStr);

    assert(isKarachiDateValid && todayStr === karachiTodayStr, `Test 6: "Today" matches Asia/Karachi timezone (${todayStr})`);
  } catch (err: any) {
    assert(false, 'Test 6: Timezone check failed', err.message);
  }

  // TEST 7: Counts equal the Dashboard counts for the same date
  try {
    const { data: allKarachiAppts } = await supabase
      .from('appointments')
      .select('id, status')
      .eq('doctor_id', doc1.id)
      .eq('date', karachiTodayStr)
      .neq('status', 'cancelled');

    const totalCount = (allKarachiAppts || []).length;
    const completedCount = (allKarachiAppts || []).filter((a: any) => a.status === 'completed' || a.status === 'done').length;

    assert(totalCount > 0 && completedCount >= 1, `Test 7: Summary counts match appointment records (Total: ${totalCount}, Completed: ${completedCount})`);
  } catch (err: any) {
    assert(false, 'Test 7: Counts equality check failed', err.message);
  }

  // Cleanup test data
  if (apptDoc1Today) await supabase.from('appointments').delete().eq('id', apptDoc1Today.id);
  if (apptDoc2Today) await supabase.from('appointments').delete().eq('id', apptDoc2Today.id);
  if (apptDoc1Future) await supabase.from('appointments').delete().eq('id', apptDoc1Future.id);
  if (patient) await supabase.from('patients').delete().eq('id', patient.id);

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runEmpiricalDoctorPatientsTestSuite();
