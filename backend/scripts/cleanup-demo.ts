import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const dbUrl = process.env.DATABASE_URL;

if (!supabaseUrl || !supabaseKey || !dbUrl) {
  console.error('Missing required environment variables.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const sql = postgres(dbUrl);

const isConfirm = process.argv.includes('--confirm');

async function run() {
  console.log(`\n=== Demo Data Cleanup (${isConfirm ? 'EXECUTION' : 'DRY RUN'}) ===\n`);

  try {
    // 1. Identify Demo Auth Users
    const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers();
    if (usersError) throw usersError;
    
    const demoUsers = usersData.users.filter(u => u.email?.includes('demo.com') || u.email?.includes('demo.clinic'));
    const demoUserIds = demoUsers.map(u => u.id);

    console.log(`Found ${demoUsers.length} demo auth users:`);
    demoUsers.forEach(u => console.log(`  - ${u.email} (${u.id})`));

    // 2. Identify Demo Patients
    const demoPatientsQuery = await sql`SELECT id, mrn, name FROM patients WHERE mrn LIKE 'MRN-100%'`;
    const demoPatientIds = demoPatientsQuery.map(p => p.id);

    console.log(`\nFound ${demoPatientsQuery.length} demo patients:`);
    demoPatientsQuery.slice(0, 5).forEach(p => console.log(`  - ${p.mrn} (${p.name})`));
    if (demoPatientsQuery.length > 5) console.log(`  ... and ${demoPatientsQuery.length - 5} more.`);

    if (!isConfirm) {
      console.log('\n--- Dry Run Report: Rows that WOULD be deleted ---');
      
      const counts: Record<string, number> = {};
      
      if (demoPatientIds.length > 0) {
        counts['appointments'] = (await sql`SELECT count(*) FROM appointments WHERE patient_id IN ${sql(demoPatientIds)}`)[0].count;
        counts['medical_records'] = (await sql`SELECT count(*) FROM medical_records WHERE patient_id IN ${sql(demoPatientIds)}`)[0].count;
        counts['prescriptions'] = (await sql`SELECT count(*) FROM prescriptions WHERE patient_id IN ${sql(demoPatientIds)}`)[0].count;
        counts['follow_ups'] = (await sql`SELECT count(*) FROM follow_ups WHERE patient_id IN ${sql(demoPatientIds)}`)[0].count;
        counts['doctor_patients'] = (await sql`SELECT count(*) FROM doctor_patients WHERE patient_id IN ${sql(demoPatientIds)}`)[0].count;
      }
      
      if (demoUserIds.length > 0) {
        counts['doctor_availability'] = (await sql`SELECT count(*) FROM doctor_availability WHERE doctor_id IN ${sql(demoUserIds)}`)[0].count;
        counts['doctor_specializations'] = (await sql`SELECT count(*) FROM doctor_specializations WHERE doctor_id IN ${sql(demoUserIds)}`)[0].count;
        counts['doctor_profiles'] = (await sql`SELECT count(*) FROM doctor_profiles WHERE id IN ${sql(demoUserIds)}`)[0].count;
        counts['staff_profiles'] = (await sql`SELECT count(*) FROM staff_profiles WHERE id IN ${sql(demoUserIds)}`)[0].count;
      }

      counts['patients'] = demoPatientIds.length;
      counts['auth.users'] = demoUserIds.length;

      for (const [table, count] of Object.entries(counts)) {
        if (Number(count) > 0) {
          console.log(`${table}: ${count} rows`);
        }
      }
      
      console.log('\nTo execute these deletions safely respecting foreign keys, run this script with --confirm');
      process.exit(0);
    }

    // Execution Mode
    console.log('\n--- Executing Deletions ---');
    
    // Order matters for foreign keys!
    // 1. Appointments, Records, Prescriptions, Follow-ups
    if (demoPatientIds.length > 0) {
      console.log('Deleting dependent patient data...');
      await sql`DELETE FROM follow_ups WHERE patient_id IN ${sql(demoPatientIds)}`;
      await sql`DELETE FROM prescriptions WHERE patient_id IN ${sql(demoPatientIds)}`;
      await sql`DELETE FROM medical_records WHERE patient_id IN ${sql(demoPatientIds)}`;
      await sql`DELETE FROM appointments WHERE patient_id IN ${sql(demoPatientIds)}`;
      await sql`DELETE FROM doctor_patients WHERE patient_id IN ${sql(demoPatientIds)}`;
      await sql`DELETE FROM patients WHERE id IN ${sql(demoPatientIds)}`;
    }

    // 2. Doctor/Staff Profiles and dependencies
    if (demoUserIds.length > 0) {
      console.log('Deleting doctor/staff profiles and dependencies...');
      await sql`DELETE FROM doctor_availability WHERE doctor_id IN ${sql(demoUserIds)}`;
      await sql`DELETE FROM doctor_specializations WHERE doctor_id IN ${sql(demoUserIds)}`;
      await sql`DELETE FROM doctor_profiles WHERE id IN ${sql(demoUserIds)}`;
      await sql`DELETE FROM staff_profiles WHERE id IN ${sql(demoUserIds)}`;
      
      console.log('Deleting auth users...');
      for (const id of demoUserIds) {
        await supabase.auth.admin.deleteUser(id);
      }
    }

    console.log('\nCleanup completed successfully.');
    
  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

run();
