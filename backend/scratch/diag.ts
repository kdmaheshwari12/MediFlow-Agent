import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const { DATABASE_URL } = process.env;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

async function runDiagnostic() {
  console.log('=== 1. ALL DOCTOR PROFILES ===');
  const allDoctors = await sql`
    SELECT 
      dp.id, 
      dp.name, 
      dp.qualification, 
      dp.clinic_id, 
      dp.onboarding_status,
      (SELECT COUNT(*) FROM doctor_specializations ds WHERE ds.doctor_id = dp.id) AS spec_count,
      (SELECT COUNT(*) FROM doctor_availability da WHERE da.doctor_id = dp.id) AS avail_count
    FROM doctor_profiles dp
  `;
  console.log(allDoctors);

  console.log('=== 2. DOCTORS PUBLIC VIEW COUNT ===');
  const viewCount = await sql`SELECT COUNT(*) FROM doctors_public`;
  console.log(viewCount);

  console.log('=== 3. DOCTORS FILTERED BY onboarding_status = complete ===');
  const completeDoctors = await sql`
    SELECT id, name, onboarding_status, clinic_id
    FROM doctor_profiles
    WHERE onboarding_status = 'complete'
  `;
  console.log(completeDoctors);

  console.log('=== 4. SPECIALIZATIONS FOR EACH DOCTOR ===');
  const specs = await sql`
    SELECT ds.doctor_id, s.name, s.slug, ds.is_primary
    FROM doctor_specializations ds
    JOIN specializations s ON ds.specialization_id = s.id
  `;
  console.log(specs);

  console.log('=== 5. AVAILABILITY FOR EACH DOCTOR ===');
  const avails = await sql`
    SELECT doctor_id, weekday, start_time, end_time, is_active
    FROM doctor_availability
  `;
  console.log(avails);

  process.exit(0);
}

runDiagnostic().catch((err) => {
  console.error('Diagnostic failed:', err);
  process.exit(1);
});
