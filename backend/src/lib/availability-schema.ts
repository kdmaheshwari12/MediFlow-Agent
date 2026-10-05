import { z } from 'zod';

export function getLocalTodayStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getLocalCurrentMins(d: Date = new Date()): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function parseTimeToMinutes(t: string | null | undefined): number | null {
  if (!t || typeof t !== 'string') return null;
  const trimmed = t.trim();
  if (trimmed === '' || trimmed === '00:00' || trimmed === '00:00:00') return null;
  const parts = trimmed.split(':');
  if (parts.length < 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

export function formatMinutesToHHMMSS(mins: number | null): string | null {
  if (mins === null || isNaN(mins)) return null;
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00`;
}

export const availabilityInputSchema = z.object({
  daily_patient_limit: z
    .union([z.number(), z.string().transform((v) => parseInt(v, 10))])
    .optional(),
  daily_limit: z
    .union([z.number(), z.string().transform((v) => parseInt(v, 10))])
    .optional(),
  dates: z
    .array(z.string().transform((val) => val.split('T')[0].trim()))
    .default([]),
  start_time: z.string().default('09:00'),
  end_time: z.string().default('17:00'),
  break_start: z
    .string()
    .nullable()
    .optional()
    .transform((val) => (val && val.trim() !== '' ? val.trim() : null)),
  break_end: z
    .string()
    .nullable()
    .optional()
    .transform((val) => (val && val.trim() !== '' ? val.trim() : null)),
  slot_minutes: z
    .union([z.number(), z.string().transform((v) => parseInt(v, 10))])
    .optional()
    .default(15),
  repeat_weekly_until: z
    .string()
    .nullable()
    .optional()
    .transform((val) => (val && val.trim() !== '' ? val.split('T')[0].trim() : undefined)),
  availability: z
    .array(
      z.object({
        date: z.string().optional(),
        weekday: z.number().optional(),
        start_time: z.string(),
        end_time: z.string(),
        break_start: z.string().nullable().optional(),
        break_end: z.string().nullable().optional(),
        slot_minutes: z.union([z.number(), z.string().transform((v) => parseInt(v, 10))]).optional(),
      })
    )
    .optional(),
});
