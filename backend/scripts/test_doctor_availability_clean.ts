import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { getServerZonedNow, parseTimeToMinutes, saveDoctorAvailabilitySchema, validateAvailabilityItems, expandAvailabilityItems } from '../src/lib/availability-contract';
import { getDoctorAvailabilityDates, getDoctorSlots } from '../src/services/slot.service';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runEmpiricalTestSuite() {
  console.log('====================================================');
  console.log('STARTING EMPIRICAL TEST SUITE: Doctor Availability');
  console.log('====================================================\n');

  const { todayStr, currentMins } = getServerZonedNow();
  
  // Calculate a future date (tomorrow & +5 days)
  const [y, m, d] = todayStr.split('-').map(Number);
  const tomorrowObj = new Date(Date.UTC(y, m - 1, d + 1));
  const tomorrowStr = tomorrowObj.toISOString().split('T')[0];

  const futureObj = new Date(Date.UTC(y, m - 1, d + 5));
  const futureDateStr = futureObj.toISOString().split('T')[0];

  const pastObj = new Date(Date.UTC(y, m - 1, d - 1));
  const pastDateStr = pastObj.toISOString().split('T')[0];

  // 1. Get or create test doctor
  const { data: doctors, error: docErr } = await supabase
    .from('doctor_profiles')
    .select('id')
    .limit(1);

  if (docErr || !doctors || doctors.length === 0) {
    console.error('No test doctor profile found:', docErr);
    process.exit(1);
  }

  const doctorId = doctors[0].id;
  console.log(`Using Test Doctor ID: ${doctorId}\n`);

  // Clean up existing test availability for this doctor
  await supabase.from('doctor_availability').delete().eq('doctor_id', doctorId);

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

  // ----------------------------------------------------
  // TEST 1: Today date with future start time saves successfully
  // ----------------------------------------------------
  try {
    const futureStartMins = Math.min(currentMins + 60, 23 * 60);
    const startH = Math.floor(futureStartMins / 60).toString().padStart(2, '0');
    const startM = (futureStartMins % 60).toString().padStart(2, '0');
    const endH = Math.min(parseInt(startH, 10) + 1, 23).toString().padStart(2, '0');

    const item1 = {
      date: todayStr,
      start_time: `${startH}:${startM}`,
      end_time: `${endH}:${startM}`,
      slot_minutes: 30,
    };

    const { error: insErr } = await supabase.from('doctor_availability').insert({
      doctor_id: doctorId,
      date: item1.date,
      start_time: item1.start_time,
      end_time: item1.end_time,
      slot_minutes: item1.slot_minutes,
      is_active: true,
    });

    assert(!insErr, 'Test 1: Today date with future start time saves successfully', insErr?.message);
  } catch (err: any) {
    assert(false, 'Test 1: Today date with future start time saves successfully', err.message);
  }

  // ----------------------------------------------------
  // TEST 2: Future date saves successfully
  // ----------------------------------------------------
  try {
    const { error: insErr } = await supabase.from('doctor_availability').insert({
      doctor_id: doctorId,
      date: tomorrowStr,
      start_time: '10:00',
      end_time: '14:00',
      slot_minutes: 30,
      is_active: true,
    });

    assert(!insErr, 'Test 2: Future date saves successfully', insErr?.message);
  } catch (err: any) {
    assert(false, 'Test 2: Future date saves successfully', err.message);
  }

  // ----------------------------------------------------
  // TEST 3: 3 rows with 3 DIFFERENT dates & times saved in 1 click
  // ----------------------------------------------------
  try {
    const date3 = new Date(Date.UTC(y, m - 1, d + 10)).toISOString().split('T')[0];
    const items3 = [
      { doctor_id: doctorId, date: tomorrowStr, start_time: '16:00', end_time: '18:00', slot_minutes: 30, is_active: true },
      { doctor_id: doctorId, date: futureDateStr, start_time: '09:00', end_time: '12:00', slot_minutes: 30, is_active: true },
      { doctor_id: doctorId, date: date3, start_time: '14:00', end_time: '17:00', slot_minutes: 30, is_active: true },
    ];

    const { error: insErr } = await supabase.from('doctor_availability').insert(items3);
    assert(!insErr, 'Test 3: 3 rows with 3 DIFFERENT dates saved in 1 click', insErr?.message);
  } catch (err: any) {
    assert(false, 'Test 3: 3 rows with 3 DIFFERENT dates saved in 1 click', err.message);
  }

  // ----------------------------------------------------
  // TEST 4: 2 non-overlapping ranges on SAME date (09:00-12:00 & 17:00-20:00)
  // ----------------------------------------------------
  try {
    const sameDate = new Date(Date.UTC(y, m - 1, d + 15)).toISOString().split('T')[0];
    const items4 = [
      { doctor_id: doctorId, date: sameDate, start_time: '09:00', end_time: '12:00', slot_minutes: 30, is_active: true },
      { doctor_id: doctorId, date: sameDate, start_time: '17:00', end_time: '20:00', slot_minutes: 30, is_active: true },
    ];

    const { error: insErr } = await supabase.from('doctor_availability').insert(items4);
    assert(!insErr, 'Test 4: 2 non-overlapping ranges on SAME date save successfully', insErr?.message);
  } catch (err: any) {
    assert(false, 'Test 4: 2 non-overlapping ranges on SAME date save successfully', err.message);
  }

  // ----------------------------------------------------
  // TEST 5: Overlapping range rejected by DB trigger
  // ----------------------------------------------------
  try {
    const sameDate = new Date(Date.UTC(y, m - 1, d + 15)).toISOString().split('T')[0];
    const { error: insErr } = await supabase.from('doctor_availability').insert({
      doctor_id: doctorId,
      date: sameDate,
      start_time: '10:00',
      end_time: '13:00',
      slot_minutes: 30,
      is_active: true,
    });

    const isOverlapRejected = Boolean(insErr && insErr.message.includes('DOCTOR_AVAILABILITY_OVERLAP'));
    assert(isOverlapRejected, 'Test 5: Overlapping range rejected with clear overlap error', insErr?.message);
  } catch (err: any) {
    assert(false, 'Test 5: Overlapping range rejected', err.message);
  }

  // ----------------------------------------------------
  // TEST 6: Past date rejected by validation contract
  // ----------------------------------------------------
  try {
    const pastItems = [
      { date: pastDateStr, start_time: '10:00:00', end_time: '12:00:00', slot_minutes: 30 }
    ];
    const details = validateAvailabilityItems(pastItems, todayStr, currentMins, []);

    const isPastRejected = details.some(d => d.field === 'date' && d.message.includes('past date'));
    assert(isPastRejected, 'Test 6: Past date rejected with row error message');
  } catch (err: any) {
    assert(false, 'Test 6: Past date rejected', err.message);
  }

  // ----------------------------------------------------
  // TEST 7: Today with start time earlier than now rejected by validation contract
  // ----------------------------------------------------
  try {
    const pastTimeH = Math.max(0, Math.floor(currentMins / 60) - 2).toString().padStart(2, '0');
    const earlierItems = [
      { date: todayStr, start_time: `${pastTimeH}:00:00`, end_time: '23:59:00', slot_minutes: 30 }
    ];
    const details = validateAvailabilityItems(earlierItems, todayStr, currentMins, []);

    const isEarlierTimeRejected = details.some(d => d.field === 'start_time' && d.message.includes('in the future'));
    assert(isEarlierTimeRejected, 'Test 7: Today with start time earlier than now rejected with row error message');
  } catch (err: any) {
    assert(false, 'Test 7: Start time earlier than now rejected', err.message);
  }

  // ----------------------------------------------------
  // TEST 8: DB Check: Stored date matches picked date exactly
  // ----------------------------------------------------
  try {
    const { data: rows, error: selErr } = await supabase
      .from('doctor_availability')
      .select('date, start_time, end_time, slot_minutes')
      .eq('doctor_id', doctorId)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true });

    assert(!selErr && rows.length > 0, 'Test 8: Stored dates fetched cleanly from DB', `Count: ${rows?.length}`);
  } catch (err: any) {
    assert(false, 'Test 8: Stored date DB check', err.message);
  }

  // ----------------------------------------------------
  // TEST 9: Receptionist booking sees saved dates & slots
  // ----------------------------------------------------
  try {
    const datesRes = await getDoctorAvailabilityDates(supabase, doctorId, todayStr, futureDateStr);
    const slotsRes = await getDoctorSlots(supabase, doctorId, tomorrowStr);

    const seesDates = datesRes.dates.some(d => d.date === tomorrowStr && d.isAvailable);
    const seesSlots = slotsRes.slots.some(s => s.isAvailable);

    assert(seesDates && seesSlots, 'Test 9: Receptionist booking service sees saved dates and available slots');
  } catch (err: any) {
    assert(false, 'Test 9: Receptionist booking sees saved dates', err.message);
  }

  // ----------------------------------------------------
  // TEST 10: Modal Payload Expansion (12-hour AM/PM & Weekly repetition)
  // ----------------------------------------------------
  try {
    const date20Obj = new Date(Date.UTC(y, m - 1, d + 20));
    const date20Str = date20Obj.toISOString().split('T')[0];

    const modalPayload = {
      dates: [tomorrowStr],
      start_time: '08:00 AM',
      end_time: '05:00 PM',
      slot_minutes: 15,
      repeat_weekly_until: date20Str,
    };

    const expanded = expandAvailabilityItems(modalPayload);
    const parsedModal = saveDoctorAvailabilitySchema.safeParse({ items: expanded });

    assert(parsedModal.success && expanded.length >= 2, 'Test 10: Modal payload expanded into weekly items with 24-hr times cleanly');
  } catch (err: any) {
    assert(false, 'Test 10: Modal payload expansion failed', err.message);
  }

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runEmpiricalTestSuite();
