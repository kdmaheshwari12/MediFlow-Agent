import { fetchApi } from './api-client';

export interface MedicineItem {
  id?: string;
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
}

export interface PatientData {
  id: string;
  mrn: string;
  name: string;
  age: number | string;
  gender: string;
  phone: string;
}

export interface DoctorData {
  id: string;
  name: string;
  qualification: string;
  specialization: string;
  license_number: string;
}

export interface HospitalData {
  name: string;
  address: string;
  phone: string;
}

export interface NormalizedPrescription {
  id: string;
  visit_id: string;
  issued_at: string;
  diagnosis: string;
  notes?: string;
  follow_up?: string | null;
  patient: PatientData;
  doctor: DoctorData;
  hospital: HospitalData;
  medicines: MedicineItem[];
}

export interface PrescriptionQueryParams {
  q?: string;
  mrn?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface PrescriptionListResponse {
  data: NormalizedPrescription[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function formatPrescriptionDate(isoString: string): string {
  if (!isoString) return '-';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '-';

    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Karachi',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    return formatter.format(d).replace(/\b(am|pm)\b/gi, (m) => m.toUpperCase());
  } catch {
    return '-';
  }
}

export async function getDoctorPrescriptions(params: PrescriptionQueryParams = {}): Promise<PrescriptionListResponse> {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.mrn) query.set('mrn', params.mrn);
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));

  const queryString = query.toString();
  const endpoint = `/doctors/me/prescriptions${queryString ? `?${queryString}` : ''}`;
  
  const res = await fetchApi(endpoint);
  return res || { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 1 } };
}

// Backward compatibility helper
export async function listPrescriptions(): Promise<NormalizedPrescription[]> {
  const res = await getDoctorPrescriptions();
  return res.data;
}
