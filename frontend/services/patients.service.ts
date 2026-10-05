import { Patient } from '@/types/mediflow';
import { fetchApi } from './api-client';

export async function registerPatient(data: {
  fullName: string;
  phone: string;
  age: number;
  gender: 'Male' | 'Female' | 'Other';
  emergencyContactName: string;
  emergencyContactPhone: string;
  allergies?: string[];
  criticalFlags?: string[];
}): Promise<Patient> {
  const payload: any = {
    name: data.fullName,
    phone: data.phone,
    age: data.age,
    gender: data.gender,
    emergency_contact: `${data.emergencyContactName} (${data.emergencyContactPhone})`,
  };

  if (data.allergies && data.allergies.length > 0) {
    payload.allergies = data.allergies.join(', ');
  }

  const response = await fetchApi('/patients', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  return {
    id: response.id,
    mrn: response.mrn,
    fullName: response.name,
    phone: response.phone,
    age: response.age,
    gender: response.gender as 'Male'|'Female'|'Other',
    emergencyContactName: data.emergencyContactName,
    emergencyContactPhone: data.emergencyContactPhone,
    allergies: response.allergies ? response.allergies.split(',').map((s: string) => s.trim()) : [],
    criticalFlags: data.criticalFlags || [],
    createdAt: response.created_at
  };
}

export async function getPatientByMrn(mrn: string, phone?: string): Promise<Patient> {
  let url = `/patients/${encodeURIComponent(mrn)}`;
  
  // NOTE: If we want to strictly verify phone, backend might not support it in the route directly
  // We can fetch and then check or see if backend `GET /patients/:mrn` handles it.
  // Actually, the original mock threw if phone was provided and didn't match. We can just do that client side.
  
  const response = await fetchApi(url);
  
  if (phone) {
    const cleanInputPhone = phone.replace(/\D/g, '');
    const cleanPatientPhone = response.phone.replace(/\D/g, '');
    if (!cleanPatientPhone.endsWith(cleanInputPhone) && !cleanInputPhone.endsWith(cleanPatientPhone)) {
      throw new Error('MRN_NOT_FOUND'); // Mismatch
    }
  }

  const emContact = response.emergency_contact || '';
  const emName = emContact.split('(')[0]?.trim() || emContact;
  const emPhone = emContact.match(/\(([^)]+)\)/)?.[1] || '';

  return {
    id: response.id,
    mrn: response.mrn,
    fullName: response.name,
    phone: response.phone,
    age: response.age,
    gender: response.gender,
    emergencyContactName: emName,
    emergencyContactPhone: emPhone,
    allergies: response.allergies ? response.allergies.split(',').map((s: string) => s.trim()) : [],
    criticalFlags: [],
    createdAt: response.created_at
  };
}

export async function searchPatients(query: string = ''): Promise<Patient[]> {
  const url = query ? `/patients?q=${encodeURIComponent(query)}` : `/patients`;
  const data = await fetchApi(url);
  
  return (data || []).map((p: any) => {
    const emContact = p.emergency_contact || '';
    const emName = emContact.split('(')[0]?.trim() || emContact;
    const emPhone = emContact.match(/\(([^)]+)\)/)?.[1] || '';
    
    return {
      id: p.id,
      mrn: p.mrn,
      fullName: p.name,
      phone: p.phone,
      age: p.age,
      gender: p.gender,
      emergencyContactName: emName,
      emergencyContactPhone: emPhone,
      allergies: p.allergies ? p.allergies.split(',').map((s: string) => s.trim()) : [],
      criticalFlags: [],
      createdAt: p.created_at
    };
  });
}

export async function getPatientRecord(mrn: string): Promise<Patient> {
  return getPatientByMrn(mrn);
}

export async function getPatientHistoryStatus(mrn: string): Promise<{status: string, summary?: string, visitCount?: number}> {
  return fetchApi(`/patients/${encodeURIComponent(mrn)}/history-status`);
}

export async function getPatientHistory(mrn: string, doctorId?: string): Promise<any[]> {
  const params = doctorId ? `?doctorId=${doctorId}` : '';
  const data = await fetchApi(`/patients/${mrn}/history${params}`);
  return data || [];
}

export async function deletePatient(id: string): Promise<void> {
  await fetchApi(`/patients/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

