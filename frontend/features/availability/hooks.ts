import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getWeeklySchedule,
  updateWeeklySchedule,
  getOverrides,
  createOverride,
  deleteOverride,
  getTimeOff,
  createTimeOff,
  deleteTimeOff,
  previewImpact,
  quickActionToday,
  getDatedAvailability,
  addDatedAvailability,
  deleteAvailability,
} from '@/services/availability.service';
import { WeeklyAvailability, AvailabilityOverride } from '@/types/mediflow';
import { toast } from 'sonner';

export function useWeeklySchedule(doctorId?: string) {
  return useQuery({
    queryKey: ['weekly-schedule', doctorId],
    queryFn: () => getWeeklySchedule(doctorId),
  });
}

export function useOverrides(doctorId?: string) {
  return useQuery({
    queryKey: ['availability-overrides', doctorId],
    queryFn: () => getOverrides(doctorId),
  });
}

export function useTimeOff(doctorId?: string) {
  return useQuery({
    queryKey: ['time-off', doctorId],
    queryFn: () => getTimeOff(doctorId),
  });
}

export function useUpdateWeeklySchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (schedules: WeeklyAvailability[]) => updateWeeklySchedule(schedules),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weekly-schedule'] });
      queryClient.invalidateQueries({ queryKey: ['doctors'] });
      queryClient.invalidateQueries({ queryKey: ['available-slots'] });
      toast.success('Weekly availability schedule saved successfully.');
    },
    onError: (err: any) => {
      toast.error(err.userMessage || err.message || 'Failed to update weekly schedule.');
    },
  });
}

export function useCreateOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<AvailabilityOverride>) => createOverride(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability-overrides'] });
      queryClient.invalidateQueries({ queryKey: ['doctors'] });
      queryClient.invalidateQueries({ queryKey: ['available-slots'] });
      toast.success('Date override saved.');
    },
    onError: (err: any) => {
      toast.error(err.userMessage || err.message || 'Failed to save date override.');
    },
  });
}

export function useDeleteOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteOverride(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['availability-overrides'] });
      queryClient.invalidateQueries({ queryKey: ['doctors'] });
      queryClient.invalidateQueries({ queryKey: ['available-slots'] });
      toast.success('Date override removed.');
    },
    onError: (err: any) => {
      toast.error(err.userMessage || err.message || 'Failed to remove date override.');
    },
  });
}

export function useCreateTimeOff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { starts_on: string; ends_on: string; reason?: string }) => createTimeOff(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['time-off'] });
      queryClient.invalidateQueries({ queryKey: ['doctors'] });
      queryClient.invalidateQueries({ queryKey: ['available-slots'] });
      toast.success('Time off period added.');
    },
    onError: (err: any) => {
      toast.error(err.userMessage || err.message || 'Failed to add time off.');
    },
  });
}

export function useDeleteTimeOff() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTimeOff(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['time-off'] });
      queryClient.invalidateQueries({ queryKey: ['doctors'] });
      queryClient.invalidateQueries({ queryKey: ['available-slots'] });
      toast.success('Time off period removed.');
    },
    onError: (err: any) => {
      toast.error(err.userMessage || err.message || 'Failed to remove time off.');
    },
  });
}

export function useQuickActionToday() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ action, extraData }: { action: 'unavailable' | 'end' | 'extend'; extraData?: { new_end_time?: string } }) =>
      quickActionToday(action, extraData),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['availability-overrides'] });
      queryClient.invalidateQueries({ queryKey: ['doctors'] });
      queryClient.invalidateQueries({ queryKey: ['available-slots'] });
      toast.success(`Today's action applied (${variables.action}).`);
    },
    onError: (err: any) => {
      toast.error(err.userMessage || err.message || 'Failed to apply quick action.');
    },
  });
}

export function useDatedAvailability(doctorId?: string) {
  return useQuery({
    queryKey: ['dated-availability', doctorId],
    queryFn: () => getDatedAvailability(doctorId),
  });
}

export function useAddDatedAvailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      items: Array<{
        date: string;
        start_time: string;
        end_time: string;
        slot_minutes?: number;
      }>;
    }) => addDatedAvailability(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dated-availability'] });
      queryClient.invalidateQueries({ queryKey: ['weekly-schedule'] });
      queryClient.invalidateQueries({ queryKey: ['doctors'] });
      queryClient.invalidateQueries({ queryKey: ['available-slots'] });
      toast.success('Availability added successfully.');
    },
    onError: (err: any) => {
      const msg = err.userMessage || err.message || 'Failed to add availability.';
      toast.error(msg);
    },
  });
}

export function useDeleteAvailability() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAvailability(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dated-availability'] });
      queryClient.invalidateQueries({ queryKey: ['weekly-schedule'] });
      queryClient.invalidateQueries({ queryKey: ['doctors'] });
      queryClient.invalidateQueries({ queryKey: ['available-slots'] });
      toast.success('Availability deleted.');
    },
    onError: (err: any) => {
      const msg = err.userMessage || err.message || 'Failed to delete availability.';
      toast.error(msg);
    },
  });
}
