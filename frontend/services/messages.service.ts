import { fetchApi } from './api-client';

export interface SmsAttempt {
  id: string;
  visit_id: string;
  patient_id: string;
  patient_mrn: string;
  patient_name: string;
  doctor_id: string;
  to_phone: string;
  message_body: string;
  provider: string;
  provider_message_id: string | null;
  provider_response: any;
  status: 'queued' | 'sent' | 'delivered' | 'failed';
  attempt_number: number;
  error_message: string | null;
  sent_at: string;
  created_at: string;
}

export interface VisitDetail {
  id: string;
  appointment_id: string;
  patient_id: string;
  patient_mrn: string;
  patient_name?: string;
  patient_phone?: string;
  patient_age?: number;
  patient_gender?: string;
  doctor_id: string;
  prescription: string;
  followup_text: string | null;
  followup_period: string | null;
  draft_message: string | null;
  draft_language: string | null;
  agent_model: string | null;
  langsmith_run_id: string | null;
  created_at: string;
  updated_at: string;
  sms_attempts: SmsAttempt[];
  latest_sms_status?: 'queued' | 'sent' | 'delivered' | 'failed' | null;
  latest_sent_at?: string | null;
}

export interface DoctorMessagesParams {
  date?: string;
  mrn?: string;
  q?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface DoctorMessagesResponse {
  messages: Array<{
    visit_id: string;
    appointment_id: string;
    patient_id: string;
    patient_mrn: string;
    patient_name: string;
    patient_phone: string;
    created_at: string;
    status: 'queued' | 'sent' | 'delivered' | 'failed';
    preview: string;
    latest_attempt: number;
    sent_at: string;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export async function getDoctorMessages(params?: DoctorMessagesParams): Promise<DoctorMessagesResponse> {
  const query = new URLSearchParams();
  if (params?.date) query.set('date', params.date);
  if (params?.mrn) query.set('mrn', params.mrn);
  if (params?.q) query.set('q', params.q);
  if (params?.status) query.set('status', params.status);
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));

  const queryString = query.toString();
  const endpoint = `/doctors/me/messages${queryString ? `?${queryString}` : ''}`;
  return fetchApi(endpoint);
}

export async function getVisitDetails(id: string): Promise<VisitDetail> {
  return fetchApi(`/visits/${id}`);
}

export async function getPatientHistory(mrn: string): Promise<VisitDetail[]> {
  const data = await fetchApi(`/patients/${encodeURIComponent(mrn)}/history`);
  return data.history || [];
}

export async function retrySms(visitId: string): Promise<{ success: boolean; sms: SmsAttempt }> {
  return fetchApi(`/sms/${visitId}/retry`, {
    method: 'POST',
  });
}
