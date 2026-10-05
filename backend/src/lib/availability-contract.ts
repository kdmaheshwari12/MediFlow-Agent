import { z } from 'zod';
import { toZonedTime, format as formatZoned } from 'date-fns-tz';

export const availabilityItemSchema = z.object({
  date: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  start_time: z
    .string()
    .trim()
    .transform((val) => {
      const mins = parseTimeToMinutes(val);
      if (mins === null) return val;
      return formatMinutesToHHMMSS(mins);
    })
    .pipe(z.string().regex(/^\d{2}:\d{2}:\d{2}$/, 'Start time must be HH:mm or HH:mm:ss')),
  end_time: z
    .string()
    .trim()
    .transform((val) => {
      const mins = parseTimeToMinutes(val);
      if (mins === null) return val;
      return formatMinutesToHHMMSS(mins);
    })
    .pipe(z.string().regex(/^\d{2}:\d{2}:\d{2}$/, 'End time must be HH:mm or HH:mm:ss')),
  slot_minutes: z.coerce
    .number()
    .int('Slot duration must be a whole number')
    .min(5, 'Slot duration must be at least 5 minutes')
    .default(30),
});

export const saveDoctorAvailabilitySchema = z.object({
  items: z
    .array(availabilityItemSchema)
    .min(1, 'At least one availability row is required'),
});

export type AvailabilityItem = z.infer<typeof availabilityItemSchema>;
export type SaveDoctorAvailabilityInput = z.infer<typeof saveDoctorAvailabilitySchema>;

/**
 * Server timezone helper (defaults to Asia/Karachi)
 */
export function getServerZonedNow(timezone: string = 'Asia/Karachi'): {
  todayStr: string;
  currentMins: number;
  zonedNow: Date;
} {
  const now = new Date();
  const zonedNow = toZonedTime(now, timezone);
  const todayStr = formatZoned(zonedNow, 'yyyy-MM-dd', { timeZone: timezone });
  const currentMins = zonedNow.getHours() * 60 + zonedNow.getMinutes();
  return { todayStr, currentMins, zonedNow };
}

export function parseTimeToMinutes(timeStr: string): number | null {
  if (!timeStr) return null;
  const str = timeStr.trim().toUpperCase();
  const isPM = str.includes('PM');
  const isAM = str.includes('AM');
  const cleanStr = str.replace(/AM|PM/g, '').trim();
  const parts = cleanStr.split(':');
  if (parts.length < 2) return null;
  let h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;

  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;

  return h * 60 + m;
}

export function formatMinutesToHHMMSS(mins: number): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00`;
}

export function expandAvailabilityItems(body: any): any[] {
  if (!body) return [];
  if (Array.isArray(body.items) && body.items.length > 0) return body.items;
  if (Array.isArray(body.availability) && body.availability.length > 0) return body.availability;

  const dates: string[] = Array.isArray(body.dates)
    ? body.dates
    : body.date
    ? [body.date]
    : [];
  const startTime = body.start_time || body.startTime;
  const endTime = body.end_time || body.endTime;
  const slotMinutes = body.slot_minutes || body.slotMinutes || 30;

  if (dates.length === 0 || !startTime || !endTime) {
    if (body.date || body.start_time || body.startTime) {
      return [body];
    }
    return [];
  }

  const allDates = new Set<string>();

  for (const dStr of dates) {
    if (!dStr) continue;
    allDates.add(dStr);

    if (body.repeat_weekly_until || body.repeatUntil) {
      const untilStr = body.repeat_weekly_until || body.repeatUntil;
      const [y, m, d] = dStr.split('-').map(Number);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
        let curr = new Date(Date.UTC(y, m - 1, d + 7));
        const [endY, endM, endD] = untilStr.split('-').map(Number);
        const endLimit = new Date(Date.UTC(endY, endM - 1, endD));

        while (curr <= endLimit) {
          allDates.add(curr.toISOString().split('T')[0]);
          curr.setUTCDate(curr.getUTCDate() + 7);
        }
      }
    }
  }

  return Array.from(allDates).map((dStr) => ({
    date: dStr,
    start_time: startTime,
    end_time: endTime,
    slot_minutes: slotMinutes,
  }));
}

export function validateAvailabilityItems(
  items: AvailabilityItem[],
  todayStr: string,
  currentMins: number,
  existingRows: Array<{ date: string; start_time: string; end_time: string; slot_minutes?: number }> = []
): Array<{ index: number; field: string; message: string }> {
  const details: Array<{ index: number; field: string; message: string }> = [];
  const dbRows = existingRows || [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const sMins = parseTimeToMinutes(item.start_time);
    const eMins = parseTimeToMinutes(item.end_time);

    // Rule 1: Past dates disabled/rejected
    if (item.date < todayStr) {
      details.push({ index: i, field: 'date', message: `Cannot add availability for past date ${item.date}` });
    }

    // Rule 2: If today, start time must be in the future
    if (item.date === todayStr && sMins !== null && sMins <= currentMins) {
      details.push({ index: i, field: 'start_time', message: 'Start time for today must be in the future' });
    }

    // Rule 3: End time must be after start time and fit at least one slot
    if (sMins !== null && eMins !== null && eMins <= sMins) {
      details.push({ index: i, field: 'end_time', message: 'End time must be after start time' });
    } else if (sMins !== null && eMins !== null && (eMins - sMins) < item.slot_minutes) {
      details.push({ index: i, field: 'slot_minutes', message: `Time range must fit at least one ${item.slot_minutes}-minute slot` });
    }

    // Rule 4: Internal overlap check within submitted items
    for (let j = i + 1; j < items.length; j++) {
      const other = items[j];
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

    // Rule 5: Database overlap check
    if (sMins !== null && eMins !== null) {
      for (const dbRow of dbRows) {
        if (dbRow.date === item.date) {
          const dbSMins = parseTimeToMinutes(dbRow.start_time);
          const dbEMins = parseTimeToMinutes(dbRow.end_time);
          if (dbSMins !== null && dbEMins !== null) {
            if (!(sMins === dbSMins && eMins === dbEMins && (dbRow.slot_minutes || 30) === item.slot_minutes)) {
              if (sMins < dbEMins && eMins > dbSMins) {
                const existingRange = `${dbRow.start_time.substring(0, 5)}-${dbRow.end_time.substring(0, 5)}`;
                details.push({
                  index: i,
                  field: 'start_time',
                  message: `Time range ${item.start_time.substring(0, 5)}-${item.end_time.substring(0, 5)} overlaps with saved range (${existingRange}) on date ${item.date}`,
                });
              }
            }
          }
        }
      }
    }
  }

  return details;
}
