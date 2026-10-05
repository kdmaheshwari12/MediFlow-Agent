import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testQueryDirectly() {
  const { data: docs } = await supabase.from('doctor_profiles').select('id, name').limit(1);
  if (!docs || docs.length === 0) return;
  const doctorId = docs[0].id;
  console.log(`Testing direct queries for Doctor: ${docs[0].name} (${doctorId})`);

  // Search by MRN "MRN-10021"
  const searchTerm = 'MRN-10021';
  const cleanDigits = searchTerm.replace(/\D/g, '');
  const isDigitsOnly = /^\d+$/.test(searchTerm.replace(/[\s+-]/g, ''));
  const sanitized = searchTerm.replace(/[%_\\]/g, '\\$&');

  let patientQb = supabase.from('patients').select('id');
  if (isDigitsOnly && cleanDigits.length >= 3) {
    patientQb = patientQb.or(`phone.ilike.%${cleanDigits}%,mrn.ilike.%${sanitized}%`);
  } else {
    patientQb = patientQb.or(`name.ilike.%${sanitized}%,mrn.ilike.%${sanitized}%`);
  }

  const { data: matchedPatients, error: pErr } = await patientQb;
  if (pErr) console.error('Patient query error:', pErr);

  const matchingPatientIds = (matchedPatients || []).map((p: any) => p.id);
  console.log('Matched patient IDs:', matchingPatientIds);

  const { data: prescriptions, error: rxErr } = await supabase
    .from('prescriptions')
    .select(`
      *,
      patients (
        id,
        mrn,
        name,
        age,
        gender,
        phone
      ),
      doctor_profiles (
        id,
        name,
        qualification,
        license_number,
        doctor_specializations (
          specializations (
            name
          )
        ),
        clinics (
          id,
          name,
          address,
          phone
        )
      ),
      prescription_items (*)
    `)
    .eq('doctor_id', doctorId)
    .in('patient_id', matchingPatientIds);

  if (rxErr) {
    console.error('Prescriptions query error:', rxErr);
    return;
  }

  console.log(`Prescriptions found: ${prescriptions.length}`);
  if (prescriptions.length > 0) {
    const rx = prescriptions[0];
    const patientObj = Array.isArray(rx.patients) ? rx.patients[0] : rx.patients;
    console.log('Patient Object:', patientObj);
  }
}

testQueryDirectly();
