import { FollowUpRecord } from '@/types/mediflow';
import { fetchApi } from './api-client';

export async function generateFollowUp(recordId: string): Promise<FollowUpRecord> {
  const data = await fetchApi(`/follow-ups/${recordId}/analyze`, { method: 'POST' });
  
  return {
    id: data.id,
    visitId: data.record_id,
    appointmentId: '',
    mrn: '',
    patientName: '',
    patientPhone: '',
    doctorId: data.doctor_id,
    doctorName: '',
    generatedMessage: data.ai_content || '',
    followUpDate: data.scheduled_for ? data.scheduled_for.split('T')[0] : '',
    channel: 'SMS',
    status: data.status.toUpperCase(),
    sentAt: data.created_at,
  };
}

export async function getFollowUpStatus(id: string): Promise<FollowUpRecord> {
  const data = await fetchApi(`/follow-ups/${id}`);
  return {
    id: data.id,
    visitId: data.record_id,
    appointmentId: '',
    mrn: '', // the backend response has patient_id, we could expand it if needed
    patientName: '',
    patientPhone: '',
    doctorId: data.doctor_id,
    doctorName: '',
    generatedMessage: data.doctor_content || data.ai_content || '',
    followUpDate: data.scheduled_for ? data.scheduled_for.split('T')[0] : '',
    channel: 'SMS',
    status: data.status.toUpperCase(),
    sentAt: data.created_at,
  };
}

export async function listFollowUps(params?: {
  doctorId?: string;
  status?: string;
  search?: string;
}): Promise<FollowUpRecord[]> {
  const data = await fetchApi('/follow-ups');
  return data.map((d: any) => ({
    id: d.id,
    visitId: d.record_id,
    appointmentId: '',
    mrn: '',
    patientName: 'Patient',
    patientPhone: '',
    doctorId: d.doctor_id,
    doctorName: 'Doctor',
    generatedMessage: d.doctor_content || d.ai_content || '',
    followUpDate: d.scheduled_for ? d.scheduled_for.split('T')[0] : '',
    channel: 'SMS',
    status: d.status.toUpperCase(),
    sentAt: d.created_at,
  }));
}

export async function retryFollowUpDelivery(id: string): Promise<any> {
  return await fetchApi(`/follow-ups/${id}/retry`, { method: 'POST' });
}
