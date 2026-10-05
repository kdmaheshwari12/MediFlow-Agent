import { useQuery } from '@tanstack/react-query';
import { getDoctorPatients } from '@/services/doctors.service';

export function useDoctorPatients(date?: string) {
  return useQuery({
    queryKey: ['doctor-patients', date],
    queryFn: () => getDoctorPatients(date),
    refetchInterval: 30000, // 30 second polling for live status movements
  });
}
