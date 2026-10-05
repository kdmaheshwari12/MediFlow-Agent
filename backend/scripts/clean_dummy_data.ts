import dotenv from 'dotenv';
dotenv.config();

import { supabaseAdmin } from '../src/lib/supabase';
import postgres from 'postgres';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL missing');
  process.exit(1);
}

const sql = postgres(dbUrl);

async function clean() {
  console.log('=== EXECUTING DUMMY DATA DELETION ===\n');

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers();
  if (authError) {
    console.error('Error fetching auth users:', authError);
    process.exit(1);
  }
  const allUsers = authData.users;

  const doctorProfiles = await sql`SELECT * FROM doctor_profiles`;
  const staffProfiles = await sql`SELECT * FROM staff_profiles`;
  const patients = await sql`SELECT * FROM patients`;

  const realUserIds = new Set([
    '00b8b938-01a4-48e0-81bb-9e99625905d7', // Khempal
    '7c80e1a7-5dde-4605-aa81-782305f088a0', // Rushal
    '204ad058-e503-48bb-9d43-3b88a1e51e00', // Aman Bijani
    'e32008bc-e9c1-46a0-9299-36dbdba786d3'  // Dr. Raju
  ]);

  const dummyNames = [
    'alice smith',
    'bob jones',
    'carol danvers',
    'david banner',
    'demo staff',
    'dr. demo',
    'central receptionist',
    'dr. smith',
    'dr. other clinic'
  ];

  const dummyUserIds: string[] = [];

  for (const u of allUsers) {
    if (realUserIds.has(u.id)) continue;

    const docProf = doctorProfiles.find((dp: any) => dp.id === u.id);
    const staffProf = staffProfiles.find((sp: any) => sp.id === u.id);
    const name = (docProf?.name || staffProf?.name || u.user_metadata?.name || u.user_metadata?.full_name || '').toLowerCase();
    const email = (u.email || '').toLowerCase();
    const phone = docProf?.phone || staffProf?.phone || u.user_metadata?.phone || '';

    const isDummy =
      dummyNames.some(d => name.includes(d) || email.includes(d)) ||
      email.startsWith('doc1_') ||
      email.startsWith('doc2_') ||
      email.startsWith('doc3_') ||
      email.startsWith('doc4_') ||
      email.startsWith('staff_') ||
      email.includes('demo.com') ||
      email.includes('testclinic.com') ||
      phone.startsWith('0300999000');

    if (isDummy) {
      dummyUserIds.push(u.id);
    }
  }

  const testPatients = patients.filter((p: any) =>
    p.name.includes('Test Patient') ||
    p.name.startsWith('Patient ') ||
    p.phone?.startsWith('+92300100') ||
    p.phone?.startsWith('0312')
  );
  const testPatientIds = testPatients.map((p: any) => p.id);

  console.log(`Targeting ${dummyUserIds.length} dummy users and ${testPatientIds.length} test patients for deletion.`);

  let deletedAvail = 0;
  let deletedSpec = 0;
  let deletedDocPat = 0;
  let deletedAppts = 0;
  let deletedDocProf = 0;
  let deletedStaffProf = 0;
  let deletedTestPatients = 0;
  let deletedAuthUsers = 0;

  if (dummyUserIds.length > 0 || testPatientIds.length > 0) {
    await sql.begin(async (tx) => {
      if (testPatientIds.length > 0) {
        await tx`DELETE FROM follow_ups WHERE patient_id IN ${tx(testPatientIds)}`;
        await tx`DELETE FROM prescriptions WHERE patient_id IN ${tx(testPatientIds)}`;
        await tx`DELETE FROM medical_records WHERE patient_id IN ${tx(testPatientIds)}`;
        await tx`DELETE FROM appointments WHERE patient_id IN ${tx(testPatientIds)}`;
        await tx`DELETE FROM doctor_patients WHERE patient_id IN ${tx(testPatientIds)}`;
        const resP = await tx`DELETE FROM patients WHERE id IN ${tx(testPatientIds)}`;
        deletedTestPatients = resP.count;
      }

      if (dummyUserIds.length > 0) {
        const resAvail = await tx`DELETE FROM doctor_availability WHERE doctor_id IN ${tx(dummyUserIds)}`;
        deletedAvail = resAvail.count;

        const resSpec = await tx`DELETE FROM doctor_specializations WHERE doctor_id IN ${tx(dummyUserIds)}`;
        deletedSpec = resSpec.count;

        const resDocPat = await tx`DELETE FROM doctor_patients WHERE doctor_id IN ${tx(dummyUserIds)}`;
        deletedDocPat = resDocPat.count;

        const resAppts = await tx`DELETE FROM appointments WHERE doctor_id IN ${tx(dummyUserIds)}`;
        deletedAppts = resAppts.count;

        const resDocProf = await tx`DELETE FROM doctor_profiles WHERE id IN ${tx(dummyUserIds)}`;
        deletedDocProf = resDocProf.count;

        const resStaffProf = await tx`DELETE FROM staff_profiles WHERE id IN ${tx(dummyUserIds)}`;
        deletedStaffProf = resStaffProf.count;
      }
    });

    for (const id of dummyUserIds) {
      if (!realUserIds.has(id)) {
        const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
        if (!error) deletedAuthUsers++;
        else console.error(`Error deleting auth user ${id}:`, error.message);
      }
    }
  }

  console.log('\n=== DELETION SUMMARY ===');
  console.log(`- doctor_availability: ${deletedAvail} rows deleted`);
  console.log(`- doctor_specializations: ${deletedSpec} rows deleted`);
  console.log(`- doctor_patients: ${deletedDocPat} rows deleted`);
  console.log(`- appointments: ${deletedAppts} rows deleted`);
  console.log(`- doctor_profiles: ${deletedDocProf} rows deleted`);
  console.log(`- staff_profiles: ${deletedStaffProf} rows deleted`);
  console.log(`- patients: ${deletedTestPatients} rows deleted`);
  console.log(`- auth.users: ${deletedAuthUsers} users deleted`);

  console.log('\nCleanup execution complete.');
  await sql.end();
}

clean().catch(err => {
  console.error('Clean error:', err);
  process.exit(1);
});
