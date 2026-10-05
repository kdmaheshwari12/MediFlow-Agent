import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listFollowUps, getFollowUpStatus, retryFollowUpDelivery } from '@/services/followups.service';
import { toast } from 'sonner';

export function useFollowUps(params?: { doctorId?: string; status?: string; search?: string }) {
  return useQuery({
    queryKey: ['followups', params],
    queryFn: () => listFollowUps(params),
    refetchInterval: 5000,
  });
}

export function useFollowUpStatus(id: string) {
  return useQuery({
    queryKey: ['followup-status', id],
    queryFn: () => getFollowUpStatus(id),
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && (data.status === 'GENERATING' || data.status === 'PENDING')) {
        return 2000;
      }
      return false;
    },
  });
}

export function useRetryFollowUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => retryFollowUpDelivery(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['followups'] });
      queryClient.invalidateQueries({ queryKey: ['followup-status'] });
      toast.success('Follow-up message re-sent successfully.');
    },
    onError: (err: any) => {
      toast.error(err.userMessage || err.message || 'The message could not be delivered.');
    },
  });
}
