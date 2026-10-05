import { Appointment, User, AppointmentType, QueueStats } from '@/types/mediflow';
import { AppointmentStatus } from '@/constants/status';
import { fetchApi } from './api-client';

export interface Specialization {
  id: string;
  name: string;
  slug: string;
  count?: number;
}

export async function listSpecializations(withDoctors = false): Promise<Specialization[]> {
  const query = withDoctors ? '?withDoctors=true' : '';
  return await fetchApi(`/specializations${query}`);
}

export async function listDoctors(clinicId?: string, specialization?: string, date?: string): Promise<any[]> {
  const params = new URLSearchParams();
  if (clinicId && clinicId !== 'undefined') params.append('clinicId', clinicId);
  if (specialization && specialization !== 'undefined') params.append('specialization', specialization); // slug is expected
  if (date) params.append('date', date);
  
  const queryStr = params.toString();
  const url = queryStr ? `/doctors?${queryStr}` : '/doctors';
  return await fetchApi(url);
}

export interface SlotAvailability {
  time: string;
  isAvailable: boolean;
  bookedByPatientName?: string;
}

const STANDARD_SLOTS = [
  '09:00 AM',
  '09:30 AM',
  '10:00 AM',
  '10:30 AM',
  '11:00 AM',
  '11:30 AM',
  '02:00 PM',
  '02:30 PM',
  '03:00 PM',
  '03:30 PM',
  '04:00 PM',
  '04:30 PM',
];

export async function getAvailableSlots(doctorId: string, date: string): Promise<import('@/types/mediflow').DoctorDaySchedule> {
  try {
    return await fetchApi(`/appointments/slots?doctorId=${doctorId}&date=${date}`);
  } catch (err: any) {
    return {
      doctorId,
      dateStr: date,
      sessionState: 'NOT_SCHEDULED',
      disabledReason: err.userMessage || 'Failed to load slots',
      scheduleConfigured: false,
      workingHours: 'Not Available',
      slotMinutes: 15,
      dailyLimit: 30,
      bookedCount: 0,
      slots: [],
      serverNow: new Date().toISOString(),
      todayStr: new Date().toISOString().split('T')[0],
      nextAvailableDate: null,
    };
  }
}

export async function getDoctorAvailabilityDates(
  doctorId: string,
  from: string,
  to: string
): Promise<{ scheduleConfigured: boolean; dates: { date: string; sessionState: string; freeSlotsCount: number; bookedCount: number; dailyLimit: number; disabledReason?: string }[] }> {
  try {
    return await fetchApi(`/doctors/${doctorId}/availability?from=${from}&to=${to}`);
  } catch (err: any) {
    if (err.statusCode === 404) return { scheduleConfigured: false, dates: [] };
    return { scheduleConfigured: true, dates: [] };
  }
}

export async function createAppointment(data: {
  mrn: string; // Not used in request body directly, need patient_id
  patientId?: string; // we will need this from frontend
  patientName: string;
  patientPhone: string;
  patientAge: number;
  patientGender: string;
  doctorId: string;
  doctorName?: string;
  date: string; // YYYY-MM-DD
  timeSlot: string;
  type: AppointmentType;
  reason: string;
  notes?: string;
}): Promise<Appointment> {

  // If patientId is missing, we must fetch patient by mrn first
  let patientId = data.patientId;
  let fetchedPatient: any = null;
  if (!patientId) {
    fetchedPatient = await fetchApi(`/patients/${data.mrn}`);
    patientId = fetchedPatient.id;
  }

  const payload = {
    patient_id: patientId,
    doctor_id: data.doctorId,
    date: data.date,
    timeSlot: data.timeSlot,
    reason: data.reason || null,
  };
  
  const res = await fetchApi('/appointments', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  const pName = res.patient?.name || res.patients?.name || fetchedPatient?.name || data.patientName;
  const pMrn = res.patient?.mrn || res.patients?.mrn || data.mrn || '';
  const dName = res.doctor?.name || res.doctor_profiles?.name || data.doctorName || 'Doctor';
  const dSpec = res.doctor?.specialization || 'Specialist';

  return {
    id: res.id,
    mrn: pMrn,
    patientName: pName,
    patientPhone: data.patientPhone || res.patients?.phone || '',
    patientAge: data.patientAge || res.patients?.age || 0,
    patientGender: data.patientGender || res.patients?.gender || 'Male',
    doctorId: res.doctor_id || data.doctorId,
    doctorName: dName.startsWith('Dr.') ? dName : `Dr. ${dName}`,
    doctorSpecialization: dSpec,
    date: res.date || data.date,
    timeSlot: res.time_slot || res.timeSlot || data.timeSlot,
    type: data.type,
    reason: res.reason || data.reason,
    notes: data.notes,
    status: (res.status || 'SCHEDULED').toUpperCase(),
    createdAt: res.created_at || new Date().toISOString(),
  };
}

export async function listAppointments(params?: {
  doctorId?: string;
  clinicId?: string;
  date?: string;
  status?: AppointmentStatus;
  search?: string;
}): Promise<Appointment[]> {
  const query = new URLSearchParams();
  if (params?.date) query.append('date', params.date);
  if (params?.status) query.append('status', params.status.toLowerCase());
  
  const data = await fetchApi(`/appointments?${query.toString()}`);
  
  // Transform backend response to frontend Appointment interface
  return data.map((d: any) => {
    const start = new Date(d.scheduled_start);
    let hours = start.getUTCHours();
    const mins = start.getUTCMinutes() === 0 ? '00' : '30';
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; 
    const timeSlot = `${hours.toString().padStart(2, '0')}:${mins} ${ampm}`;
    const dateStr = start.toISOString().split('T')[0];

    const rawDocName = d.doctor_profiles?.name || d.doctor?.name || '';
    const doctorName = rawDocName ? (rawDocName.startsWith('Dr.') ? rawDocName : `Dr. ${rawDocName}`) : 'Doctor';
    const dSpecs = Array.isArray(d.doctor_profiles?.doctor_specializations) ? d.doctor_profiles.doctor_specializations : [];
    const firstSpec = dSpecs[0]?.specializations ? (Array.isArray(dSpecs[0].specializations) ? dSpecs[0].specializations[0] : dSpecs[0].specializations) : null;
    const doctorSpecialization = d.doctor?.specialization || firstSpec?.name || 'General Specialist';

    return {
      id: d.id,
      mrn: d.patients?.mrn || d.patient?.mrn || 'UNKNOWN',
      patientName: d.patients?.name || d.patient?.name || 'Patient',
      patientPhone: d.patients?.phone || '',
      patientAge: d.patients?.age || 0,
      patientGender: d.patients?.gender || 'Male',
      doctorId: d.doctor_id,
      doctorName,
      doctorSpecialization,
      date: d.date || dateStr,
      timeSlot: d.time_slot || timeSlot,
      type: 'Consultation',
      reason: d.reason || '',
      status: d.status.toUpperCase(),
      createdAt: d.created_at,
    };
  });
}

export async function getAppointment(id: string): Promise<Appointment> {
  const d = await fetchApi(`/appointments/${id}`);
  
  const start = new Date(d.scheduled_start);
  let hours = start.getUTCHours();
  const mins = start.getUTCMinutes() === 0 ? '00' : '30';
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; 
  const timeSlot = `${hours.toString().padStart(2, '0')}:${mins} ${ampm}`;
  const dateStr = start.toISOString().split('T')[0];

  return {
    id: d.id,
    mrn: d.patients?.mrn || 'UNKNOWN',
    patientName: d.patients?.name || 'Unknown Patient',
    patientPhone: '',
    patientAge: 0,
    patientGender: 'Male',
    doctorId: d.doctor_id,
    doctorName: d.doctor_profiles?.name || 'Doctor',
    doctorSpecialization: d.doctor_profiles?.specialization || '',
    date: dateStr,
    timeSlot,
    type: 'Consultation',
    reason: '',
    status: d.status.toUpperCase(),
    createdAt: d.created_at,
  };
}

export async function updateAppointmentStatus(
  id: string,
  newStatus: AppointmentStatus
): Promise<Appointment> {
  await fetchApi(`/appointments/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: newStatus.toLowerCase() })
  });
  return getAppointment(id);
}

export async function rescheduleAppointment(id: string, date: string, timeSlot: string): Promise<any> {
  return await fetchApi(`/appointments/${id}/reschedule`, {
    method: 'PATCH',
    body: JSON.stringify({ date, timeSlot }),
  });
}

export async function cancelAppointment(id: string): Promise<any> {
  return await fetchApi(`/appointments/${id}/cancel`, {
    method: 'PATCH',
  });
}

export async function getQueueStats(clinicId?: string): Promise<QueueStats> {
  // Map backend's { examined, remaining } to frontend QueueStats
  try {
    const data = await fetchApi(`/appointments/queue-stats`);
    return {
      totalToday: data.examined + data.remaining,
      waitingCount: data.remaining,
      completedCount: data.examined,
      upcomingCount: data.remaining,
      doctorStats: [], // backend doesn't provide this yet
    };
  } catch {
    return {
      totalToday: 0,
      waitingCount: 0,
      completedCount: 0,
      upcomingCount: 0,
      doctorStats: [],
    };
  }
}

export async function addDoctorAvailability(data: {
  dates?: string[];
  items?: any[];
  start_time?: string;
  end_time?: string;
  break_start?: string | null;
  break_end?: string | null;
  slot_minutes?: number;
  repeat_weekly_until?: string;
}): Promise<any> {
  return await fetchApi('/doctors/me/availability', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function listDoctorAvailabilities(doctorId?: string): Promise<any[]> {
  const query = doctorId ? `?doctorId=${doctorId}` : '';
  return await fetchApi(`/availability${query}`);
}

export async function deleteDoctorAvailability(id: string): Promise<any> {
  return await fetchApi(`/availability/${id}`, {
    method: 'DELETE',
  });
}

