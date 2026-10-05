import { fetchApi } from './api-client';

export interface DoctorPatientsResponse {
  date: string;
  isToday: boolean;
  isFuture: boolean;
  hasAvailability: boolean;
  counts: {
    total: number;
    waiting: number;
    inProgress: number;
    completed: number;
    remaining: number;
    assignedCount: number;
    dailyLimit: number;
  };
  appointments: Array<{
    id: string;
    appointmentId: string;
    timeSlot: string;
    scheduledStart: string;
    status: 'SCHEDULED' | 'WAITING' | 'IN_PROGRESS' | 'IN_CONSULTATION' | 'COMPLETED' | 'CANCELLED';
    reason: string;
    notes?: string;
    patient: {
      id: string;
      mrn: string;
      name: string;
      fullName: string;
      age: number;
      gender: string;
      phone: string;
      allergies: string[];
      emergencyContactName?: string;
      emergencyContactPhone?: string;
    } | null;
    prescription?: any | null;
    messageLog?: any | null;
  }>;
}

export async function getDoctorPatients(date?: string): Promise<DoctorPatientsResponse> {
  const query = date ? `?date=${encodeURIComponent(date)}` : '';
  const res = await fetchApi(`/doctors/me/patients${query}`);
  return res as DoctorPatientsResponse;
}
