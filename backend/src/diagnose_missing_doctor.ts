// @ts-nocheck
import pg from 'pg';

import dotenv from 'dotenv';
dotenv.config();

async function diagnose() {
  const dbUrl = process.env.DATABASE_URL?.replace('?pgbouncer=true', '');
  const pool = new pg.Pool({ connectionString: dbUrl, connectionTimeoutMillis: 5000 });

  try {
    console.log('=== ALL DOCTOR PROFILES ===');
    const docs = await pool.query(`
      SELECT id, name, onboarding_status, onboarding_step, profile_completed, clinic_id 
      FROM doctor_profiles ORDER BY created_at;
    `);
    for (const d of docs.rows) {
      console.log(`  ${d.name} | status=${d.onboarding_status} | step=${d.onboarding_step} | completed=${d.profile_completed} | clinic=${d.clinic_id}`);
    }

    console.log('\n=== DOCTOR SPECIALIZATIONS ===');
    const specs = await pool.query(`
      SELECT ds.doctor_id, dp.name as doctor_name, s.name as spec_name
      FROM doctor_specializations ds
      JOIN doctor_profiles dp ON dp.id = ds.doctor_id
      JOIN specializations s ON s.id = ds.specialization_id
      ORDER BY dp.name;
    `);
    for (const s of specs.rows) {
      console.log(`  ${s.doctor_name} -> ${s.spec_name}`);
    }

    // Check which doctors are MISSING specializations
    console.log('\n=== DOCTORS WITHOUT SPECIALIZATIONS ===');
    const missing = await pool.query(`
      SELECT dp.id, dp.name, dp.onboarding_status
      FROM doctor_profiles dp
      LEFT JOIN doctor_specializations ds ON ds.doctor_id = dp.id
      WHERE ds.doctor_id IS NULL;
    `);
    for (const m of missing.rows) {
      console.log(`  ❌ ${m.name} (status=${m.onboarding_status}) - NO specializations linked!`);
    }
    if (missing.rows.length === 0) {
      console.log('  All doctors have specializations.');
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

diagnose();
