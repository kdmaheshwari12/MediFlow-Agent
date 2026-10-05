import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Appointment, AppointmentType } from '@/types/mediflow';

export interface NormalizedPatient {
  id: string;
  mrn: string;
  name: string;
  phone: string;
  age: number;
  gender: string;
}

export interface NormalizedDoctor {
  id: string;
  name: string;
  specialization: string;
  yearsExperience?: number;
}

export function normalizePatient(p: any): NormalizedPatient | null {
  if (!p) return null;
  const rawName = (p.name || p.fullName || p.full_name || '').trim();
  return {
    id: p.id || '',
    mrn: p.mrn || '',
    name: rawName,
    phone: p.phone || '',
    age: typeof p.age === 'number' ? p.age : (parseInt(p.age) || 30),
    gender: p.gender || 'Male',
  };
}

export function normalizeDoctor(d: any): NormalizedDoctor | null {
  if (!d) return null;
  const rawName = (d.name || d.fullName || '').trim();
  const name = rawName ? (rawName.startsWith('Dr.') ? rawName : `Dr. ${rawName}`) : 'Doctor';
  
  let specName = 'General Specialist';
  if (d.specialization) {
    specName = d.specialization;
  } else if (Array.isArray(d.specializations) && d.specializations.length > 0) {
    specName = d.specializations[0]?.name || 'General Specialist';
  }

  return {
    id: d.id,
    name,
    specialization: specName,
    yearsExperience: d.yearsExperience || d.years_experience || 5,
  };
}

interface AppointmentWizardState {
  step: number; // 1: Patient, 2: Doctor, 3: Date & Time, 4: Details, 5: Review
  patientType: 'EXISTING' | 'NEW' | null;
  selectedPatient: NormalizedPatient | null;
  selectedDoctor: NormalizedDoctor | null;
  selectedDoctorId: string;
  selectedDate: string;
  selectedTimeSlot: string;
  type: AppointmentType;
  reason: string;
  notes: string;
  confirmedAppointment: Appointment | null;

  setStep: (step: number) => void;
  setPatientType: (type: 'EXISTING' | 'NEW' | null) => void;
  setSelectedPatient: (patient: any) => void;
  setSelectedDoctor: (doctor: any) => void;
  setSelectedDoctorId: (doctorId: string) => void;
  setDateTime: (date: string, timeSlot: string) => void;
  setDetails: (type: AppointmentType, reason: string, notes?: string) => void;
  setConfirmedAppointment: (apt: Appointment | null) => void;
  resetWizard: () => void;
}

const getLocalDateStr = () => {
  const d = new Date();
  const tzOffset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tzOffset).toISOString().split('T')[0];
};

export const useAppointmentWizardStore = create<AppointmentWizardState>()(
  persist(
    (set) => ({
      step: 1,
      patientType: null,
      selectedPatient: null,
      selectedDoctor: null,
      selectedDoctorId: '',
      selectedDate: getLocalDateStr(),
      selectedTimeSlot: '',
      type: 'Consultation',
      reason: '',
      notes: '',
      confirmedAppointment: null,

      setStep: (step) => set({ step }),
      setPatientType: (patientType) => set({ patientType }),
      setSelectedPatient: (patient) => set({ selectedPatient: normalizePatient(patient) }),
      setSelectedDoctor: (doctor) => {
        const normalized = normalizeDoctor(doctor);
        set({
          selectedDoctor: normalized,
          selectedDoctorId: normalized ? normalized.id : '',
        });
      },
      setSelectedDoctorId: (selectedDoctorId) => set({ selectedDoctorId }),
      setDateTime: (selectedDate, selectedTimeSlot) => set({ selectedDate, selectedTimeSlot }),
      setDetails: (type, reason, notes = '') => set({ type, reason, notes }),
      setConfirmedAppointment: (confirmedAppointment) => set({ confirmedAppointment }),
      resetWizard: () => {
        if (typeof window !== 'undefined') {
          try {
            sessionStorage.removeItem('mediflow-appointment-wizard');
          } catch (_) {}
        }
        set({
          step: 1,
          patientType: null,
          selectedPatient: null,
          selectedDoctor: null,
          selectedDoctorId: '',
          selectedDate: getLocalDateStr(),
          selectedTimeSlot: '',
          type: 'Consultation',
          reason: '',
          notes: '',
          confirmedAppointment: null,
        });
      },
    }),
    {
      name: 'mediflow-appointment-wizard',
      storage: createJSONStorage(() => (typeof window !== 'undefined' ? sessionStorage : (null as any))),
    }
  )
);
