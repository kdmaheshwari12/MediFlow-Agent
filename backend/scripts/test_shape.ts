import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testQueryShape() {
  const { data: rows } = await supabase.from('prescriptions').select('*, patients(*), doctor_profiles(*, clinics(*))');
  if (rows && rows.length > 0) {
    const rx = rows[0];
    console.log('rx.patients type:', typeof rx.patients, 'isArray:', Array.isArray(rx.patients));
    console.log('rx.patients content:', rx.patients);
    console.log('rx.doctor_profiles type:', typeof rx.doctor_profiles, 'isArray:', Array.isArray(rx.doctor_profiles));
    console.log('rx.doctor_profiles content:', rx.doctor_profiles);
  }
}

testQueryShape();
