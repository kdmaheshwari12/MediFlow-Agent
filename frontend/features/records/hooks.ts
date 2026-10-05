import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { saveMedicalRecord, getMedicalHistory } from '@/services/records.service';
import { MedicineItem } from '@/types/mediflow';
import { toast } from 'sonner';

export function useMedicalHistory(mrn: string) {
  return useQuery({
    queryKey: ['medical-history', mrn],
    queryFn: () => getMedicalHistory(mrn),
    enabled: !!mrn,
  });
}

export function useSaveMedicalRecord() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      appointmentId: string;
      mrn: string;
      patientName: string;
      doctorId: string;
      doctorName: string;
      chiefComplaint: string;
      symptoms: string[];
      diagnosis: string;
      notes: string;
      treatmentPlan: string;
      medicines: MedicineItem[];
      followUpPeriod?: string;
    }) => saveMedicalRecord(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['queue-stats'] });
      queryClient.invalidateQueries({ queryKey: ['medical-history'] });
      queryClient.invalidateQueries({ queryKey: ['followups'] });
      toast.success('Medical record saved and appointment marked completed.');
    },
    onError: (err: any) => {
      toast.error(err.userMessage || err.message || 'Failed to save medical record.');
    },
  });
}
