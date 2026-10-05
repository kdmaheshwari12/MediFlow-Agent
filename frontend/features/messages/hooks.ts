import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getDoctorMessages,
  getVisitDetails,
  getPatientHistory,
  retrySms,
  DoctorMessagesParams,
} from '@/services/messages.service';
import { toast } from 'sonner';

export function useDoctorMessages(params?: DoctorMessagesParams) {
  return useQuery({
    queryKey: ['doctor-messages', params],
    queryFn: () => getDoctorMessages(params),
    refetchInterval: 5000, // auto refresh to pick up live delivery status changes
  });
}

export function useVisitDetails(id: string | null) {
  return useQuery({
    queryKey: ['visit-detail', id],
    queryFn: () => getVisitDetails(id!),
    enabled: !!id,
  });
}

export function usePatientHistory(mrn: string | null) {
  return useQuery({
    queryKey: ['patient-history', mrn],
    queryFn: () => getPatientHistory(mrn!),
    enabled: !!mrn,
  });
}

export function useRetrySms() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (visitId: string) => retrySms(visitId),
    onSuccess: (data, visitId) => {
      queryClient.invalidateQueries({ queryKey: ['doctor-messages'] });
      queryClient.invalidateQueries({ queryKey: ['visit-detail', visitId] });
      queryClient.invalidateQueries({ queryKey: ['patient-history'] });
      toast.success(`SMS retry initiated. Attempt #${data.sms.attempt_number} status: ${data.sms.status}`);
    },
    onError: (err: any) => {
      toast.error(err.userMessage || err.message || 'Failed to retry SMS send.');
    },
  });
}
