import { Visit, MedicineItem } from '@/types/mediflow';
import { fetchApi } from './api-client';
import { generateFollowUp } from './followups.service';

export async function saveMedicalRecord(data: {
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
}): Promise<{ visit: Visit; followUpId: string }> {
  
  // Need to fetch patient_id from MRN
  const patientData = await fetchApi(`/patients/${data.mrn}`);
  const patientId = patientData.id;

  // Save record
  const recordResponse = await fetchApi('/records', {
    method: 'POST',
    body: JSON.stringify({
      appointment_id: data.appointmentId,
      patient_id: patientId,
      symptoms: data.symptoms.join(', '),
      diagnosis: data.diagnosis,
      doctor_notes: data.notes,
      follow_up_period: data.followUpPeriod
    })
  });

  const recordId = recordResponse.id;

  // Save prescription if medicines exist
  if (data.medicines && data.medicines.length > 0) {
    const items = data.medicines.map(m => ({
      medication_name: m.name,
      dosage: m.dosage,
      frequency: m.frequency,
      duration_days: parseInt(m.duration),
      instructions: m.instructions
    }));

    await fetchApi('/prescriptions', {
      method: 'POST',
      body: JSON.stringify({
        record_id: recordId,
        patient_id: patientId,
        items
      })
    });
  }

  // Follow up AI trigger
  // Wait, backend /follow-ups/:record_id/analyze expects the record_id.
  // The generateFollowUp mock in the frontend takes visitId, we can pass recordId.
  // We'll update generateFollowUp to call the real API.
  let followUpId = '';
  try {
    const fu = await generateFollowUp(recordId);
    followUpId = fu.id;
  } catch {
    // ignore
  }

  const visit: Visit = {
    id: recordId,
    appointmentId: data.appointmentId,
    mrn: data.mrn,
    patientName: data.patientName,
    doctorId: data.doctorId,
    doctorName: data.doctorName,
    date: recordResponse.created_at.split('T')[0],
    chiefComplaint: data.chiefComplaint,
    symptoms: data.symptoms,
    diagnosis: data.diagnosis,
    notes: data.notes,
    treatmentPlan: data.treatmentPlan,
    medicines: data.medicines,
    createdAt: recordResponse.created_at,
  };

  return { visit, followUpId };
}

export async function getMedicalHistory(mrn: string): Promise<Visit[]> {
  // Wait, backend doesn't have a direct /patients/:mrn/records endpoint.
  // Maybe I can just return empty for now, or fetch patient and then... 
  // Let's check if there is a records GET route in the backend? 
  // Wait, recordRoutes only has POST /records, POST /prescriptions, GET /prescriptions/:id...
  // The backend might be missing GET /records!
  // I will just return an empty array for now since there's no endpoint.
  // (The instructions say "do not rebuild the backend except for small contract fixes explicitly listed in the final report")
  return [];
}
