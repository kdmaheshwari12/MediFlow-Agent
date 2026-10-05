import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function isAppointmentTimeReached(apt: any): boolean {
  if (!apt) return true;
  const statusUpper = (apt.status || '').toUpperCase();
  if (statusUpper === 'IN_PROGRESS' || statusUpper === 'COMPLETED' || statusUpper === 'WAITING') {
    return true; // Waiting, In progress or completed appointments can always be started/resumed
  }

  let startTimeMs: number | null = null;

  if (apt.scheduled_start) {
    startTimeMs = new Date(apt.scheduled_start).getTime();
  } else if (apt.date && apt.timeSlot) {
    const timeSlotStr = String(apt.timeSlot).trim();
    const parts = timeSlotStr.split(' ');
    if (parts.length >= 2) {
      const timeParts = parts[0].split(':');
      let hours = parseInt(timeParts[0], 10);
      const minutes = parseInt(timeParts[1] || '0', 10);
      const modifier = parts[1].toUpperCase();

      if (hours === 12) hours = 0;
      if (modifier === 'PM') hours += 12;

      const dateStr = apt.date; // YYYY-MM-DD
      const isoStr = `${dateStr}T${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:00Z`;
      startTimeMs = new Date(isoStr).getTime();
    }
  }

  if (!startTimeMs || isNaN(startTimeMs)) {
    return true; // Fallback if time format cannot be parsed
  }

  // Allow a 5-minute grace buffer before scheduled start time
  const nowMs = Date.now();
  return nowMs >= (startTimeMs - 5 * 60 * 1000);
}
