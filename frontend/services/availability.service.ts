import { fetchApi } from './api-client';
import { WeeklyAvailability, AvailabilityOverride, DoctorTimeOff } from '@/types/mediflow';

export async function getWeeklySchedule(doctorId?: string): Promise<WeeklyAvailability[]> {
  const query = doctorId ? `?doctorId=${doctorId}` : '';
  return await fetchApi(`/availability/weekly${query}`);
}

export async function updateWeeklySchedule(schedules: WeeklyAvailability[]): Promise<{ success: boolean; message: string }> {
  return await fetchApi('/availability/weekly', {
    method: 'PUT',
    body: JSON.stringify(schedules),
  });
}

export async function getOverrides(doctorId?: string): Promise<AvailabilityOverride[]> {
  const query = doctorId ? `?doctorId=${doctorId}` : '';
  return await fetchApi(`/availability/overrides${query}`);
}

export async function createOverride(data: Partial<AvailabilityOverride>): Promise<AvailabilityOverride> {
  return await fetchApi('/availability/overrides', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteOverride(id: string): Promise<{ success: boolean }> {
  return await fetchApi(`/availability/overrides/${id}`, {
    method: 'DELETE',
  });
}

export async function getTimeOff(doctorId?: string): Promise<DoctorTimeOff[]> {
  const query = doctorId ? `?doctorId=${doctorId}` : '';
  return await fetchApi(`/availability/time-off${query}`);
}

export async function createTimeOff(data: { starts_on: string; ends_on: string; reason?: string }): Promise<DoctorTimeOff> {
  return await fetchApi('/availability/time-off', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteTimeOff(id: string): Promise<{ success: boolean }> {
  return await fetchApi(`/availability/time-off/${id}`, {
    method: 'DELETE',
  });
}

export async function previewImpact(data: { date?: string; start_time?: string; end_time?: string; is_available?: boolean }): Promise<{ affectedCount: number; appointments: any[] }> {
  return await fetchApi('/availability/preview-impact', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function getDatedAvailability(doctorId?: string): Promise<any[]> {
  const query = doctorId ? `?doctorId=${doctorId}` : '';
  return await fetchApi(`/availability${query}`);
}

export async function addDatedAvailability(data: {
  items: Array<{
    date: string;
    start_time: string;
    end_time: string;
    slot_minutes?: number;
  }>;
}): Promise<any> {
  return await fetchApi('/doctors/me/availability', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function deleteAvailability(id: string): Promise<any> {
  return await fetchApi(`/availability/${id}`, {
    method: 'DELETE',
  });
}

export async function quickActionToday(action: 'unavailable' | 'end' | 'extend', extraData?: { new_end_time?: string }): Promise<any> {
  return await fetchApi(`/availability/today/${action}`, {
    method: 'POST',
    body: extraData ? JSON.stringify(extraData) : undefined,
  });
}
