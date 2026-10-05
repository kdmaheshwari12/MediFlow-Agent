import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function debugQueries() {
  console.log('--- Testing Patients Query Without Bad Columns ---');
  const { data: doc } = await supabase.from('doctor_profiles').select('id').limit(1).single();
  if (doc) {
    const { data: rawAppts, error: apptErr } = await supabase
      .from('appointments')
      .select(`
        id, doctor_id, patient_id, date, time_slot, scheduled_start, scheduled_end, status, reason,
        patients (id, mrn, name, age, gender, phone, allergies),
        prescriptions (id, diagnosis, medicines, notes, follow_up_period, follow_up_due_date, created_at),
        visits (id, prescription, draft_message, followup_text, followup_period, created_at)
      `)
      .eq('doctor_id', doc.id)
      .limit(1);

    if (apptErr) {
      console.error('Appt query error:', apptErr);
    } else {
      console.log('Appt query success, count:', rawAppts?.length);
    }
  }

  console.log('\n--- Testing Messages Query ---');
  if (doc) {
    const { data: logs, error: msgErr } = await supabase
      .from('sms_logs')
      .select('*, visits(prescription, followup_period)')
      .eq('doctor_id', doc.id)
      .limit(1);

    if (msgErr) {
      console.error('Messages query error:', msgErr);
    } else {
      console.log('Messages query success, count:', logs?.length, 'Sample:', logs);
    }
  }
}

debugQueries();
