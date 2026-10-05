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

async function preview() {
  console.log('=== DATABASE AUDIT & DUMMY DATA PREVIEW ===\n');

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers();
  if (authError) {
    console.error('Error fetching auth users:', authError);
    process.exit(1);
  }
  const allUsers = authData.users;

  const doctorProfiles = await sql`SELECT * FROM doctor_profiles`;
  const staffProfiles = await sql`SELECT * FROM staff_profiles`;
  const patients = await sql`SELECT * FROM patients`;
  const appointments = await sql`SELECT * FROM appointments`;
  const doctorAvailability = await sql`SELECT * FROM doctor_availability`;
  const doctorSpecializations = await sql`SELECT * FROM doctor_specializations`;
  const doctorPatients = await sql`SELECT * FROM doctor_patients`;
  const medicalRecords = await sql`SELECT * FROM medical_records`;
  const prescriptions = await sql`SELECT * FROM prescriptions`;

  console.log(`Table Row Counts:`);
  console.log(`- auth.users: ${allUsers.length}`);
  console.log(`- doctor_profiles: ${doctorProfiles.length}`);
  console.log(`- staff_profiles: ${staffProfiles.length}`);
  console.log(`- patients: ${patients.length}`);
  console.log(`- appointments: ${appointments.length}`);
  console.log(`- doctor_availability: ${doctorAvailability.length}`);
  console.log(`- doctor_specializations: ${doctorSpecializations.length}`);
  console.log(`- doctor_patients: ${doctorPatients.length}`);
  console.log(`- medical_records: ${medicalRecords.length}`);
  console.log(`- prescriptions: ${prescriptions.length}`);

  const realNames = ['khempal', 'rushal', 'aman bijani', 'dr. raju', 'raju'];
  const dummyNames = [
    'alice smith',
    'bob jones',
    'carol danvers',
    'david banner',
    'demo staff',
    'dr. demo',
    'central receptionist',
    'test patient e2e',
    'dr. smith',
    'dr. other clinic'
  ];

  const realUserList: any[] = [];
  const dummyUserList: any[] = [];
  const unknownUserList: any[] = [];

  for (const u of allUsers) {
    const docProf = doctorProfiles.find((dp: any) => dp.id === u.id);
    const staffProf = staffProfiles.find((sp: any) => sp.id === u.id);
    const name = docProf?.name || staffProf?.name || u.user_metadata?.name || u.user_metadata?.full_name || '';
    const email = u.email || '';
    const phone = docProf?.phone || staffProf?.phone || u.user_metadata?.phone || '';

    const lowerName = name.toLowerCase();
    const lowerEmail = email.toLowerCase();

    const isReal = realNames.some(r => lowerName.includes(r) || lowerEmail.includes(r));
    const isDummy =
      dummyNames.some(d => lowerName.includes(d) || lowerEmail.includes(d)) ||
      lowerEmail.startsWith('doc1_') ||
      lowerEmail.startsWith('doc2_') ||
      lowerEmail.startsWith('doc3_') ||
      lowerEmail.startsWith('doc4_') ||
      lowerEmail.startsWith('staff_') ||
      lowerEmail.includes('demo.com') ||
      lowerEmail.includes('testclinic.com') ||
      phone.startsWith('0300999000');

    const item = {
      id: u.id,
      email,
      name,
      phone,
      role: u.user_metadata?.role || (docProf ? 'doctor' : staffProf ? 'staff' : 'unknown')
    };

    if (isReal) {
      realUserList.push(item);
    } else if (isDummy) {
      dummyUserList.push(item);
    } else {
      unknownUserList.push(item);
    }
  }

  console.log(`\n========================================`);
  console.log(`REAL USERS TO KEEP (${realUserList.length}):`);
  console.log(`========================================`);
  realUserList.forEach(u => console.log(` [KEEP] ID: ${u.id} | Email: ${u.email} | Name: ${u.name} | Role: ${u.role}`));

  console.log(`\n========================================`);
  console.log(`DUMMY USERS TO DELETE (${dummyUserList.length}):`);
  console.log(`========================================`);
  dummyUserList.forEach(u => console.log(` [DELETE] ID: ${u.id} | Email: ${u.email} | Name: ${u.name} | Phone: ${u.phone}`));

  if (unknownUserList.length > 0) {
    console.log(`\n========================================`);
    console.log(`UNCLASSIFIED USERS (${unknownUserList.length}):`);
    console.log(`========================================`);
    unknownUserList.forEach(u => console.log(` [UNKNOWN] ID: ${u.id} | Email: ${u.email} | Name: ${u.name} | Phone: ${u.phone}`));
  }

  const dummyIds = dummyUserList.map(u => u.id);

  let dummyDocAvailCount = 0;
  let dummyDocSpecCount = 0;
  let dummyDocProfCount = 0;
  let dummyStaffProfCount = 0;
  let dummyApptCount = 0;
  let dummyDocPatientCount = 0;

  if (dummyIds.length > 0) {
    dummyDocAvailCount = (await sql`SELECT count(*) FROM doctor_availability WHERE doctor_id IN ${sql(dummyIds)}`)[0].count;
    dummyDocSpecCount = (await sql`SELECT count(*) FROM doctor_specializations WHERE doctor_id IN ${sql(dummyIds)}`)[0].count;
    dummyDocProfCount = (await sql`SELECT count(*) FROM doctor_profiles WHERE id IN ${sql(dummyIds)}`)[0].count;
    dummyStaffProfCount = (await sql`SELECT count(*) FROM staff_profiles WHERE id IN ${sql(dummyIds)}`)[0].count;
    dummyApptCount = (await sql`SELECT count(*) FROM appointments WHERE doctor_id IN ${sql(dummyIds)}`)[0].count;
    dummyDocPatientCount = (await sql`SELECT count(*) FROM doctor_patients WHERE doctor_id IN ${sql(dummyIds)}`)[0].count;
  }

  const dummyPatients = patients.filter((p: any) =>
    p.name.includes('Test Patient') ||
    p.name.startsWith('Patient ') ||
    p.phone?.startsWith('+92300100') ||
    p.phone?.startsWith('0312')
  );

  console.log(`\n========================================`);
  console.log(`PREVIEW OF DEPENDENT ROWS TO BE REMOVED:`);
  console.log(`========================================`);
  console.log(`- doctor_availability: ${dummyDocAvailCount}`);
  console.log(`- doctor_specializations: ${dummyDocSpecCount}`);
  console.log(`- doctor_profiles: ${dummyDocProfCount}`);
  console.log(`- staff_profiles: ${dummyStaffProfCount}`);
  console.log(`- appointments: ${dummyApptCount}`);
  console.log(`- doctor_patients: ${dummyDocPatientCount}`);
  console.log(`- patients (test patients): ${dummyPatients.length}`);
  console.log(`- auth.users: ${dummyUserList.length}`);

  await sql.end();
}

preview().catch(err => {
  console.error('Preview error:', err);
  process.exit(1);
});
