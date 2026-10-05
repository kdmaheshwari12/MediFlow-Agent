import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const { DATABASE_URL } = process.env;
const sql = postgres(DATABASE_URL!);

async function main() {
  const tables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name;
  `;
  console.log('TABLES:', JSON.stringify(tables.map(t => t.table_name)));

  const views = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_type = 'VIEW'
    ORDER BY table_name;
  `;
  console.log('VIEWS:', JSON.stringify(views.map(v => v.table_name)));

  const constraints = await sql`
    SELECT conname, pg_get_constraintdef(oid) 
    FROM pg_constraint 
    WHERE conrelid = 'public.doctor_availability'::regclass;
  `;
  console.log('CONSTRAINTS ON doctor_availability:', JSON.stringify(constraints, null, 2));

  const triggers = await sql`
    SELECT trigger_name, event_object_table, event_object_schema, action_statement
    FROM information_schema.triggers;
  `;
  console.log('TRIGGERS:', JSON.stringify(triggers, null, 2));

  await sql.end();
}

main().catch(console.error);
