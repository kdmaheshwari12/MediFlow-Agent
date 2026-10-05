import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  searchPatients,
  getPatientByMrn,
  registerPatient,
  getPatientHistoryStatus,
  deletePatient,
} from '@/services/patients.service';
import { toast } from 'sonner';

export function useSearchPatients(query: string) {
  return useQuery({
    queryKey: ['patients-search', query],
    queryFn: () => searchPatients(query),
  });
}

export function usePatientByMrn(mrn: string, phone?: string) {
  return useQuery({
    queryKey: ['patient-mrn', mrn, phone],
    queryFn: () => getPatientByMrn(mrn, phone),
    enabled: !!mrn,
    retry: false,
  });
}

export function useRegisterPatient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: registerPatient,
    onSuccess: (newPatient) => {
      queryClient.invalidateQueries({ queryKey: ['patients-search'] });
      toast.success(`Patient ${newPatient.fullName} registered (${newPatient.mrn}).`);
    },
    onError: (err: any) => {
      toast.error(err.userMessage || err.message || 'Failed to register patient.');
    },
  });
}

export function useDeletePatient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deletePatient,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patients-search'] });
      toast.success('Patient deleted successfully.');
    },
    onError: (err: any) => {
      toast.error(err.userMessage || err.message || 'Failed to delete patient.');
    },
  });
}

export function usePatientHistoryStatus(mrn: string) {
  return useQuery({
    queryKey: ['patient-history-status', mrn],
    queryFn: () => getPatientHistoryStatus(mrn),
    enabled: !!mrn,
  });
}

export function usePatientLookup(query: { mrn?: string; phone?: string } | null) {
  return useQuery({
    queryKey: ['patient-lookup', query?.mrn, query?.phone],
    queryFn: () => getPatientByMrn(query?.mrn || '', query?.phone),
    enabled: !!(query?.mrn || query?.phone),
    retry: false,
  });
}

