import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listAppointments,
  getAppointment,
  createAppointment,
  updateAppointmentStatus,
  getAvailableSlots,
  getQueueStats,
  listDoctors,
} from '@/services/appointments.service';
import { AppointmentStatus } from '@/constants/status';
import { AppointmentType } from '@/types/mediflow';
import { toast } from 'sonner';

export function useAppointments(params?: {
  doctorId?: string;
  clinicId?: string;
  date?: string;
  status?: AppointmentStatus;
  search?: string;
}) {
  return useQuery({
    queryKey: ['appointments', params],
    queryFn: () => listAppointments(params),
    refetchInterval: 5000, // 5 second polling for live reception queue updates
  });
}

export function useAppointment(id: string) {
  return useQuery({
    queryKey: ['appointment', id],
    queryFn: () => getAppointment(id),
    enabled: !!id,
  });
}

export function useAvailableSlots(doctorId: string, date: string) {
  return useQuery({
    queryKey: ['available-slots', doctorId, date],
    queryFn: () => getAvailableSlots(doctorId, date),
    enabled: !!doctorId && !!date,
  });
}

export function useDoctorAvailabilityDates(doctorId: string | undefined, from: string, to: string) {
  return useQuery({
    queryKey: ['available-dates', doctorId, from, to],
    queryFn: () => {
      // Need to import it from appointments.service but we'll import it above or just use the same import block
      return import('@/services/appointments.service').then(m => m.getDoctorAvailabilityDates(doctorId!, from, to));
    },
    enabled: !!doctorId && !!from && !!to,
  });
}

export function useQueueStats(clinicId?: string) {
  return useQuery({
    queryKey: ['queue-stats', clinicId],
    queryFn: () => getQueueStats(clinicId),
    refetchInterval: 5000, // 5 second polling for staff queue counter
  });
}

export function useDoctors(clinicId?: string, specialization?: string, date?: string) {
  return useQuery({
    queryKey: ['doctors', clinicId, specialization, date],
    queryFn: () => listDoctors(clinicId, specialization, date),
    refetchInterval: 30000, // Auto-refresh every 30 seconds to pick up newly added doctors
  });
}

export function useCreateAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      mrn: string;
      patientId?: string;
      patientName: string;
      patientPhone: string;
      patientAge: number;
      patientGender: string;
      doctorId: string;
      doctorName?: string;
      date: string;
      timeSlot: string;
      type: AppointmentType;
      reason: string;
      notes?: string;
    }) => createAppointment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['queue-stats'] });
      queryClient.invalidateQueries({ queryKey: ['available-slots'] });
      queryClient.invalidateQueries({ queryKey: ['available-dates'] });
      queryClient.invalidateQueries({ queryKey: ['doctors'] });
      toast.success('Appointment created successfully.');
    },
    onError: (err: any) => {
      toast.error(err.userMessage || err.message || 'Failed to create appointment.');
    },
  });
}

export function useUpdateAppointmentStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: AppointmentStatus }) =>
      updateAppointmentStatus(id, status),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['queue-stats'] });
      queryClient.invalidateQueries({ queryKey: ['available-slots'] });
      queryClient.invalidateQueries({ queryKey: ['doctors'] });
      toast.success(`Appointment status updated to ${updated.status}.`);
    },
    onError: (err: any) => {
      toast.error(err.userMessage || err.message || 'Failed to update status.');
    },
  });
}

export function useRescheduleAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, date, timeSlot }: { id: string; date: string; timeSlot: string }) =>
      import('@/services/appointments.service').then(m => m.rescheduleAppointment(id, date, timeSlot)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['available-slots'] });
      queryClient.invalidateQueries({ queryKey: ['available-dates'] });
      queryClient.invalidateQueries({ queryKey: ['doctors'] });
      toast.success('Appointment rescheduled successfully.');
    },
    onError: (err: any) => {
      toast.error(err.userMessage || err.message || 'Failed to reschedule appointment.');
    },
  });
}

export function useCancelAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      import('@/services/appointments.service').then(m => m.cancelAppointment(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['available-slots'] });
      queryClient.invalidateQueries({ queryKey: ['available-dates'] });
      queryClient.invalidateQueries({ queryKey: ['doctors'] });
      toast.success('Appointment cancelled.');
    },
    onError: (err: any) => {
      toast.error(err.userMessage || err.message || 'Failed to cancel appointment.');
    },
  });
}

export function useDoctorAvailabilities(doctorId?: string) {
  return useQuery({
    queryKey: ['doctor-availabilities', doctorId],
    queryFn: () => import('@/services/appointments.service').then(m => m.listDoctorAvailabilities(doctorId)),
    enabled: !!doctorId,
  });
}

export function useAddDoctorAvailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      dates: string[];
      start_time: string;
      end_time: string;
      break_start?: string | null;
      break_end?: string | null;
      slot_minutes?: number;
      repeat_weekly_until?: string;
    }) => import('@/services/appointments.service').then(m => m.addDoctorAvailability(data)),
    onSuccess: (res: any) => {
      queryClient.invalidateQueries({ queryKey: ['doctor-availabilities'] });
      queryClient.invalidateQueries({ queryKey: ['available-slots'] });
      queryClient.invalidateQueries({ queryKey: ['available-dates'] });
      queryClient.invalidateQueries({ queryKey: ['doctors'] });
      toast.success(`Added availability for ${res.count || 1} date(s).`);
    },
    onError: (err: any) => {
      if (err.code === 'AFFECTED_BOOKINGS_EXIST' || err.code === 'DOCTOR_AVAILABILITY_OVERLAP') {
        toast.error(err.message || 'Availability conflict detected.');
      } else {
        toast.error(err.userMessage || err.message || 'Failed to add availability.');
      }
    },
  });
}

export function useDeleteDoctorAvailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      import('@/services/appointments.service').then(m => m.deleteDoctorAvailability(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctor-availabilities'] });
      queryClient.invalidateQueries({ queryKey: ['available-slots'] });
      queryClient.invalidateQueries({ queryKey: ['available-dates'] });
      queryClient.invalidateQueries({ queryKey: ['doctors'] });
      toast.success('Availability removed successfully.');
    },
    onError: (err: any) => {
      if (err.affectedAppointments) {
        toast.error(`Cannot remove availability: ${err.affectedAppointments.length} booked appointment(s) exist.`);
      } else {
        toast.error(err.userMessage || err.message || 'Failed to remove availability.');
      }
    },
  });
}

