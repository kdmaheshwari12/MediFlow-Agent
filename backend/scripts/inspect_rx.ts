import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function inspectPrescriptions() {
  console.log('Inspecting prescriptions table...');
  const { data: prescriptions, error } = await supabase
    .from('prescriptions')
    .select('*, patients(*), medical_records(*, patients(*)), appointments(*, patients(*))');

  if (error) {
    console.error('Error fetching prescriptions:', error);
    return;
  }

  console.log(`Found ${prescriptions.length} prescriptions:`);
  for (const rx of prescriptions) {
    console.log({
      id: rx.id,
      patient_id: rx.patient_id,
      doctor_id: rx.doctor_id,
      appointment_id: rx.appointment_id,
      record_id: rx.record_id,
      patient_from_rx: rx.patients,
      patient_from_record: rx.medical_records?.patients,
      patient_from_appointment: rx.appointments?.patients,
      diagnosis: rx.diagnosis,
    });
  }
}

inspectPrescriptions();
