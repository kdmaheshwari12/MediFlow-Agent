import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const { DATABASE_URL } = process.env;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

async function runChecks() {
  console.log('Running database checks...');
  
  // 1. Check if RLS is enabled on all tables
  const rlsCheck = await sql`
    SELECT relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND NOT c.relrowsecurity
      AND relname NOT IN ('schema_migrations');
  `;
  if (rlsCheck.length > 0) {
    console.error('RLS is not enabled on tables:', rlsCheck.map(r => r.relname).join(', '));
    process.exit(1);
  }
  console.log('✅ RLS is enabled on all required tables.');

  console.log('All db checks passed.');
  process.exit(0);
}

runChecks().catch(console.error);
