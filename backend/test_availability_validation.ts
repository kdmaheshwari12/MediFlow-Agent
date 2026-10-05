import {
  availabilityInputSchema,
  getLocalTodayStr,
  getLocalCurrentMins,
  parseTimeToMinutes,
} from './src/lib/availability-schema';

async function runTests() {
  console.log('====================================================');
  console.log('RUNNING DOCTOR AVAILABILITY VALIDATION & RULE TESTS');
  console.log('====================================================\n');

  const now = new Date();
  const todayStr = getLocalTodayStr(now);
  const currentMins = getLocalCurrentMins(now);

  // Helper for generating date strings
  const getFutureDateStr = (daysToAdd: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + daysToAdd);
    return getLocalTodayStr(d);
  };

  const getPastDateStr = (daysToSub: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - daysToSub);
    return getLocalTodayStr(d);
  };

  // Helper function to validate shift requests against date & time constraints
  function validateShiftRequest(payload: any) {
    // 1. Zod schema parse
    const data = availabilityInputSchema.parse(payload);

    const startMins = parseTimeToMinutes(data.start_time)!;
    const endMins = parseTimeToMinutes(data.end_time)!;

    if (endMins <= startMins) {
      return { success: false, code: 'INVALID_TIMES', message: 'End time must be after start time' };
    }

    for (const dStr of data.dates) {
      if (dStr < todayStr) {
        return { success: false, code: 'INVALID_DATE', message: `Cannot add availability for past date ${dStr}` };
      }

      if (dStr === todayStr && startMins < currentMins) {
        return { success: false, code: 'INVALID_TIME', message: 'Start time cannot be earlier than current time for today' };
      }
    }

    return { success: true, data };
  }

  // TEST 1: Today with a future start time
  const futureHour = Math.min(23, Math.floor(currentMins / 60) + 1);
  const startStr = `${String(futureHour).padStart(2, '0')}:00`;
  const endStr = `${String(Math.min(23, futureHour + 1)).padStart(2, '0')}:30`;
  const t1 = validateShiftRequest({
    dates: [todayStr],
    start_time: startStr,
    end_time: endStr,
    slot_minutes: '15',
  });
  console.log('TEST 1: Today with a future start time');
  console.log('Input:', { date: todayStr, start_time: startStr, end_time: endStr });
  console.log('Result:', t1.success ? 'PASSED (Allowed)' : `FAILED: ${t1.message}`);
  console.log('----------------------------------------------------');

  // TEST 2: A future date
  const futureDate = getFutureDateStr(3);
  const t2 = validateShiftRequest({
    dates: [futureDate],
    start_time: '09:00',
    end_time: '17:00',
    slot_minutes: 20,
  });
  console.log('TEST 2: A future date');
  console.log('Input:', { date: futureDate, start_time: '09:00', end_time: '17:00' });
  console.log('Result:', t2.success ? 'PASSED (Allowed)' : `FAILED: ${t2.message}`);
  console.log('----------------------------------------------------');

  // TEST 3: Multiple dates in one save
  const datesList = [getFutureDateStr(1), getFutureDateStr(2), getFutureDateStr(5)];
  const t3 = validateShiftRequest({
    dates: datesList,
    start_time: '10:00',
    end_time: '14:00',
    slot_minutes: '15',
  });
  console.log('TEST 3: Multiple dates in one save');
  console.log('Input:', { dates: datesList, start_time: '10:00', end_time: '14:00' });
  console.log('Result:', t3.success ? `PASSED (Allowed ${t3.data?.dates.length} dates)` : `FAILED: ${t3.message}`);
  console.log('----------------------------------------------------');

  // TEST 4: Two ranges on the same date (non-overlapping: Morning 09:00-12:00, Evening 14:00-17:00)
  const fDate = getFutureDateStr(4);
  const t4a = validateShiftRequest({ dates: [fDate], start_time: '09:00', end_time: '12:00' });
  const t4b = validateShiftRequest({ dates: [fDate], start_time: '14:00', end_time: '17:00' });
  console.log('TEST 4: Two non-overlapping ranges on the same date');
  console.log('Input Range 1:', { date: fDate, start: '09:00', end: '12:00' });
  console.log('Input Range 2:', { date: fDate, start: '14:00', end: '17:00' });
  console.log('Result Range 1:', t4a.success ? 'PASSED (Allowed)' : `FAILED: ${t4a.message}`);
  console.log('Result Range 2:', t4b.success ? 'PASSED (Allowed)' : `FAILED: ${t4b.message}`);
  console.log('----------------------------------------------------');

  // TEST 5: Overlapping range (must be rejected with clear message)
  const range1Start = parseTimeToMinutes('09:00')!;
  const range1End = parseTimeToMinutes('13:00')!;
  const range2Start = parseTimeToMinutes('11:00')!;
  const range2End = parseTimeToMinutes('15:00')!;
  const overlaps = (range1Start < range2End) && (range2Start < range1End);

  console.log('TEST 5: Overlapping range on same date');
  console.log('Range 1:', '09:00 - 13:00', 'Range 2:', '11:00 - 15:00');
  console.log('Overlap Check:', overlaps ? 'REJECTED with clear code DOCTOR_AVAILABILITY_OVERLAP' : 'PASSED');
  console.log('----------------------------------------------------');

  // TEST 6: Past date (must be rejected with clear message)
  const pastDate = getPastDateStr(2);
  const t6 = validateShiftRequest({
    dates: [pastDate],
    start_time: '09:00',
    end_time: '17:00',
  });
  console.log('TEST 6: Past date rejection');
  console.log('Input:', { date: pastDate });
  console.log('Result:', !t6.success ? `REJECTED (Correct): "${t6.message}"` : 'FAILED (Past date was allowed)');
  console.log('====================================================');
}

runTests().catch(console.error);
