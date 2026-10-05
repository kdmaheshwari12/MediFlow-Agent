import { SupabaseClient } from '@supabase/supabase-js';
import { toZonedTime, format as formatZoned } from 'date-fns-tz';

export function timeToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h * 60 + m;
}

export function minutesToTimeStr(minutes: number): string {
  let h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  h = h ? h : 12;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export type SlotState = 'available' | 'booked' | 'past' | 'break' | 'not_available';
export type SessionState = 'NOT_SCHEDULED' | 'UPCOMING' | 'IN_SESSION' | 'ENDED' | 'FULLY_BOOKED';

export interface SlotDetail {
  time: string;
  startsAt: number;
  endsAt: number;
  state: SlotState;
  isAvailable: boolean;
  appointmentId?: string;
  patientName?: string;
  patientMrn?: string;
  reason?: string;
  status?: string;
  bookedByPatientName?: string;
}

export interface DoctorDayScheduleResult {
  doctorId: string;
  dateStr: string;
  sessionState: SessionState;
  disabledReason?: string;
  scheduleConfigured: boolean;
  workingHours: string;
  slotMinutes: number;
  dailyLimit: number;
  bookedCount: number;
  slots: SlotDetail[];
  serverNow: string;
  todayStr: string;
  nextAvailableDate?: string | null;
}

export interface CalculateSlotOptions {
  client: SupabaseClient;
  doctorId: string;
  dateStr: string;
  timezone?: string;
  nowOverride?: Date;
}

export async function getDoctorDaySchedule(options: CalculateSlotOptions): Promise<DoctorDayScheduleResult> {
  const { client, doctorId, dateStr, timezone = 'Asia/Karachi', nowOverride } = options;

  const now = nowOverride || new Date();
  const zonedNow = toZonedTime(now, timezone);
  const todayStr = formatZoned(zonedNow, 'yyyy-MM-dd', { timeZone: timezone });
  const serverNow = formatZoned(zonedNow, "yyyy-MM-dd'T'HH:mm:ssXXX", { timeZone: timezone });
  const currentMins = zonedNow.getHours() * 60 + zonedNow.getMinutes();

  // 1. Fetch Doctor Profile & Clinic Info
  const { data: docProfile } = await client
    .from('doctor_profiles')
    .select('daily_patient_limit, daily_limit, clinic_id')
    .eq('id', doctorId)
    .maybeSingle();

  const dailyLimit = docProfile?.daily_patient_limit || docProfile?.daily_limit || 30;

  // Check if doctor has any availability configured in DB
  const { data: anyAvail } = await client
    .from('doctor_availability')
    .select('id')
    .eq('doctor_id', doctorId)
    .limit(1);

  const scheduleConfigured = Boolean(anyAvail && anyAvail.length > 0);

  const emptyResult = (sessionState: SessionState, disabledReason: string): DoctorDayScheduleResult => ({
    doctorId,
    dateStr,
    sessionState,
    disabledReason,
    scheduleConfigured,
    workingHours: 'Not Configured',
    slotMinutes: 15,
    dailyLimit,
    bookedCount: 0,
    slots: [],
    serverNow,
    todayStr,
    nextAvailableDate: null,
  });

  // 2. Check Doctor Time Off
  const { data: timeOff } = await client
    .from('doctor_time_off')
    .select('reason')
    .eq('doctor_id', doctorId)
    .lte('starts_on', dateStr)
    .gte('ends_on', dateStr);

  if (timeOff && timeOff.length > 0) {
    const reason = timeOff[0].reason ? `On leave: ${timeOff[0].reason}` : 'On leave';
    return emptyResult('NOT_SCHEDULED', reason);
  }

  // 3. Check Date-Specific Overrides
  const { data: override } = await client
    .from('doctor_availability_overrides')
    .select('*')
    .eq('doctor_id', doctorId)
    .eq('date', dateStr)
    .maybeSingle();

  interface TimeRangeConfig {
    startMins: number;
    endMins: number;
    breakStartMins: number | null;
    breakEndMins: number | null;
    slotMins: number;
  }

  let ranges: TimeRangeConfig[] = [];

  if (override) {
    if (!override.is_available) {
      return emptyResult('NOT_SCHEDULED', override.reason || 'Not available today');
    }
    ranges.push({
      startMins: timeToMinutes(override.start_time),
      endMins: timeToMinutes(override.end_time),
      breakStartMins: override.break_start ? timeToMinutes(override.break_start) : null,
      breakEndMins: override.break_end ? timeToMinutes(override.break_end) : null,
      slotMins: override.slot_minutes || 15,
    });
  } else {
    // 4. Query Date-based Availability
    const { data: avails } = await client
      .from('doctor_availability')
      .select('*')
      .eq('doctor_id', doctorId)
      .eq('date', dateStr)
      .eq('is_active', true)
      .order('start_time');

    if (!avails || avails.length === 0) {
      return emptyResult('NOT_SCHEDULED', scheduleConfigured ? 'Not scheduled on this date' : 'Schedule not set');
    }

    for (const a of avails) {
      ranges.push({
        startMins: timeToMinutes(a.start_time),
        endMins: timeToMinutes(a.end_time),
        breakStartMins: a.break_start ? timeToMinutes(a.break_start) : null,
        breakEndMins: a.break_end ? timeToMinutes(a.break_end) : null,
        slotMins: a.slot_minutes || 15,
      });
    }
  }

  if (ranges.length === 0) {
    return emptyResult('NOT_SCHEDULED', 'Schedule not set');
  }

  // 5. Fetch Existing Appointments
  const { data: appointments } = await client
    .from('appointments')
    .select('id, scheduled_start, scheduled_end, time_slot, status, reason, patients(id, name, mrn)')
    .eq('doctor_id', doctorId)
    .neq('status', 'cancelled')
    .gte('scheduled_start', `${dateStr}T00:00:00Z`)
    .lt('scheduled_start', `${dateStr}T23:59:59Z`);

  const bookedCount = appointments?.length || 0;
  const isDailyLimitReached = bookedCount >= dailyLimit;

  // Build Slots across all ranges for this date
  const slots: SlotDetail[] = [];
  const workingHourParts: string[] = [];

  for (const range of ranges) {
    const { startMins, endMins, breakStartMins, breakEndMins, slotMins } = range;
    if (endMins <= startMins) continue;

    workingHourParts.push(`${minutesToTimeStr(startMins)} - ${minutesToTimeStr(endMins)}`);

    for (let m = startMins; m + slotMins <= endMins; m += slotMins) {
      const sStart = m;
      const sEnd = m + slotMins;
      let state: SlotState = 'available';
      let appointmentId: string | undefined;
      let patientName: string | undefined;
      let patientMrn: string | undefined;
      let reason: string | undefined;
      let status: string | undefined;

      // Break check
      if (breakStartMins !== null && breakEndMins !== null) {
        if (sStart >= breakStartMins && sStart < breakEndMins) {
          state = 'break';
        }
      }

      // Appointment overlap check
      if (state !== 'break' && appointments && appointments.length > 0) {
        const matchedApt = appointments.find((apt: any) => {
          const aptStart = new Date(apt.scheduled_start);
          const aptZoned = toZonedTime(aptStart, timezone);
          const aptMins = aptZoned.getHours() * 60 + aptZoned.getMinutes();
          return aptMins === sStart;
        });

        if (matchedApt) {
          state = 'booked';
          appointmentId = matchedApt.id;
          const p = Array.isArray(matchedApt.patients) ? matchedApt.patients[0] : matchedApt.patients;
          patientName = p?.name;
          patientMrn = p?.mrn;
          reason = matchedApt.reason;
          status = matchedApt.status;
        }
      }

      // Past date or past slot time check
      const isPastDate = dateStr < todayStr;
      if (state === 'available') {
        if (isPastDate) {
          state = 'past';
        } else if (dateStr === todayStr && sStart <= currentMins) {
          state = 'past';
        } else if (isDailyLimitReached) {
          state = 'not_available';
        }
      }

      slots.push({
        time: minutesToTimeStr(sStart),
        startsAt: sStart,
        endsAt: sEnd,
        state,
        isAvailable: state === 'available',
        appointmentId,
        patientName,
        patientMrn,
        reason,
        status,
        bookedByPatientName: patientName,
      });
    }
  }

  const availableSlotsCount = slots.filter(s => s.state === 'available').length;
  let sessionState: SessionState = 'UPCOMING';
  let disabledReason: string | undefined;

  const isPastDate = dateStr < todayStr;
  const isToday = dateStr === todayStr;

  const minStartMins = Math.min(...ranges.map(r => r.startMins));
  const maxEndMins = Math.max(...ranges.map(r => r.endMins));

  if (isPastDate) {
    sessionState = 'ENDED';
    disabledReason = 'Past date';
  } else if (isToday) {
    if (currentMins >= maxEndMins) {
      sessionState = 'ENDED';
      disabledReason = 'Session ended';
    } else if (bookedCount >= dailyLimit || availableSlotsCount === 0) {
      sessionState = 'FULLY_BOOKED';
      disabledReason = bookedCount >= dailyLimit ? 'Daily patient limit reached' : 'No slots left today';
    } else if (currentMins >= minStartMins && currentMins < maxEndMins) {
      sessionState = 'IN_SESSION';
    } else {
      sessionState = 'UPCOMING';
    }
  } else {
    // Future date
    if (bookedCount >= dailyLimit || availableSlotsCount === 0) {
      sessionState = 'FULLY_BOOKED';
      disabledReason = 'Fully booked';
    } else {
      sessionState = 'UPCOMING';
    }
  }

  const workingHours = workingHourParts.join(', ');
  const defaultSlotMins = ranges[0]?.slotMins || 15;

  return {
    doctorId,
    dateStr,
    sessionState,
    disabledReason,
    scheduleConfigured,
    workingHours,
    slotMinutes: defaultSlotMins,
    dailyLimit,
    bookedCount,
    slots,
    serverNow,
    todayStr,
    nextAvailableDate: null,
  };
}

export async function getDoctorSlots(client: SupabaseClient, doctorId: string, dateStr: string, timezone = 'Asia/Karachi') {
  const result = await getDoctorDaySchedule({ client, doctorId, dateStr, timezone });
  
  if (result.sessionState === 'ENDED' || result.sessionState === 'FULLY_BOOKED' || result.sessionState === 'NOT_SCHEDULED') {
    result.nextAvailableDate = await findNextAvailableDate(client, doctorId, dateStr, timezone);
  }

  return result;
}

export async function findNextAvailableDate(
  client: SupabaseClient,
  doctorId: string,
  startDateStr: string,
  timezone = 'Asia/Karachi'
): Promise<string | null> {
  const [y, m, d] = startDateStr.split('-').map(Number);
  let current = new Date(Date.UTC(y, m - 1, d + 1, 12, 0, 0));

  for (let i = 0; i < 30; i++) {
    const candidateStr = formatZoned(current, 'yyyy-MM-dd', { timeZone: timezone });
    const sched = await getDoctorDaySchedule({ client, doctorId, dateStr: candidateStr, timezone });

    if ((sched.sessionState === 'UPCOMING' || sched.sessionState === 'IN_SESSION') && sched.slots.some(s => s.isAvailable)) {
      return candidateStr;
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return null;
}

export async function getDoctorAvailabilityDates(
  client: SupabaseClient,
  doctorId: string,
  fromDateStr: string,
  toDateInput: string,
  timezone = 'Asia/Karachi'
) {
  const [fromY, fromM, fromD] = fromDateStr.split('-').map(Number);
  const [toY, toM, toD] = toDateInput.split('-').map(Number);

  let current = new Date(Date.UTC(fromY, fromM - 1, fromD, 12, 0, 0));
  const end = new Date(Date.UTC(toY, toM - 1, toD, 12, 0, 0));

  const dates: Array<{
    date: string;
    sessionState: SessionState;
    freeSlotsCount: number;
    bookedCount: number;
    dailyLimit: number;
    disabledReason?: string;
    isAvailable: boolean;
  }> = [];

  let scheduleConfigured = false;

  while (current <= end) {
    const dateStr = formatZoned(current, 'yyyy-MM-dd', { timeZone: timezone });
    const daySched = await getDoctorDaySchedule({ client, doctorId, dateStr, timezone });

    if (daySched.scheduleConfigured) scheduleConfigured = true;

    const freeSlotsCount = daySched.slots.filter(s => s.isAvailable).length;
    const isAvailable = (daySched.sessionState === 'UPCOMING' || daySched.sessionState === 'IN_SESSION') && freeSlotsCount > 0;

    dates.push({
      date: dateStr,
      sessionState: daySched.sessionState,
      freeSlotsCount,
      bookedCount: daySched.bookedCount,
      dailyLimit: daySched.dailyLimit,
      disabledReason: daySched.disabledReason,
      isAvailable,
    });

    current.setUTCDate(current.getUTCDate() + 1);
  }

  return { dates, scheduleConfigured };
}
