import { AppointmentStatus, FollowUpStatus } from '@/constants/status';

export type UserRole = 'doctor' | 'receptionist' | 'staff';
export type OnboardingStatus = 'not_started' | 'in_progress' | 'complete';

export interface User {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: UserRole;
  // Doctor profile fields
  cnic?: string;
  specialization?: string;
  licenseNumber?: string;
  yearsExperience?: string | number;
  department?: string;
  // Receptionist profile fields
  employeeId?: string;
  shift?: 'Morning' | 'Evening' | 'Night';
  departmentOrDesk?: string;
  // Backward compatibility fields
  registrationNumber?: string;
  specializations?: any[];
  avatarUrl?: string;
  clinicId?: string;
  clinicName?: string;
  onboardingStatus?: OnboardingStatus;
  onboardingStep?: number;
  onboardingData?: Record<string, any>;
}

export interface Clinic {
  id: string;
  name: string;
  address: string;
  phone: string;
  openHours: string;
  slotDurationMinutes: number;
}

export interface Patient {
  id: string;
  mrn: string; // e.g. MRN-10024
  fullName: string;
  phone: string;
  age: number;
  gender: 'Male' | 'Female' | 'Other';
  emergencyContactName: string;
  emergencyContactPhone: string;
  allergies: string[];
  criticalFlags: string[];
  createdAt: string;
}

export type AppointmentType = 'Consultation' | 'Follow-up' | 'Procedure' | 'Emergency';

export interface Appointment {
  id: string;
  mrn: string;
  patientName: string;
  patientPhone: string;
  patientAge: number;
  patientGender: string;
  doctorId: string;
  doctorName: string;
  doctorSpecialization: string;
  date: string; // YYYY-MM-DD
  timeSlot: string; // e.g. "09:30 AM"
  type: AppointmentType;
  reason: string;
  notes?: string;
  status: AppointmentStatus;
  visitId?: string;
  createdAt: string;
}

export interface MedicineItem {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
}

export interface Visit {
  id: string;
  appointmentId: string;
  mrn: string;
  patientName: string;
  doctorId: string;
  doctorName: string;
  date: string;
  chiefComplaint: string;
  symptoms: string[];
  diagnosis: string;
  notes: string;
  treatmentPlan: string;
  medicines: MedicineItem[];
  createdAt: string;
}

export interface FollowUpRecord {
  id: string;
  visitId: string;
  appointmentId: string;
  mrn: string;
  patientName: string;
  patientPhone: string;
  doctorId: string;
  doctorName: string;
  generatedMessage: string;
  followUpDate: string;
  channel: 'SMS' | 'WhatsApp';
  status: FollowUpStatus;
  sentAt?: string;
  failureReason?: string;
}

export interface DoctorQueueStat {
  doctorId: string;
  doctorName: string;
  examined: number;
  total: number;
}

export interface QueueStats {
  totalToday: number;
  waitingCount: number;
  completedCount: number;
  upcomingCount: number;
  doctorStats: DoctorQueueStat[];
}

export type SlotState = 'available' | 'booked' | 'past' | 'break' | 'not_available';
export type SessionState = 'NOT_SCHEDULED' | 'UPCOMING' | 'IN_SESSION' | 'ENDED' | 'FULLY_BOOKED';

export interface SlotAvailability {
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

export interface DoctorDaySchedule {
  doctorId: string;
  dateStr: string;
  sessionState: SessionState;
  disabledReason?: string;
  scheduleConfigured: boolean;
  workingHours: string;
  slotMinutes: number;
  dailyLimit: number;
  bookedCount: number;
  slots: SlotAvailability[];
  serverNow: string;
  todayStr: string;
  nextAvailableDate?: string | null;
}

export interface WeeklyAvailability {
  id?: string;
  doctor_id?: string;
  weekday: number;
  start_time: string;
  end_time: string;
  break_start?: string | null;
  break_end?: string | null;
  slot_minutes: number;
  is_active: boolean;
}

export interface AvailabilityOverride {
  id: string;
  doctor_id: string;
  date: string;
  is_available: boolean;
  start_time?: string;
  end_time?: string;
  break_start?: string | null;
  break_end?: string | null;
  slot_minutes: number;
  reason?: string;
  created_at: string;
  updated_at: string;
}

export interface DoctorTimeOff {
  id: string;
  doctor_id: string;
  starts_on: string;
  ends_on: string;
  reason?: string;
  created_at: string;
}
