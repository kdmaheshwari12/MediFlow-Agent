import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

async function main() {
  console.log('--- 1. Real Tables ---');
  const tables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `;
  console.log(tables.map(t => t.table_name));

  console.log('\n--- 2. Real Views ---');
  const views = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'VIEW'
    ORDER BY table_name;
  `;
  console.log(views.map(v => v.table_name));

  console.log('\n--- 3. doctor_availability Constraints ---');
  const constraints = await sql`
    SELECT conname, pg_get_constraintdef(oid) 
    FROM pg_constraint 
    WHERE conrelid = 'public.doctor_availability'::regclass;
  `;
  console.log(constraints);

  console.log('\n--- 4. Triggers in public schema ---');
  const triggers = await sql`
    SELECT trigger_name, event_object_table, action_statement, action_timing, event_manipulation
    FROM information_schema.triggers
    WHERE trigger_schema = 'public' OR event_object_schema = 'auth';
  `;
  console.log(triggers);

  console.log('\n--- 5. RLS Policies ---');
  const policies = await sql`
    SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public';
  `;
  console.log(policies);

  await sql.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
