import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const { DATABASE_URL } = process.env;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

async function runAudit() {
  console.log('=== 1. CONSTRAINTS ON doctor_availability ===');
  const constraints = await sql`
    SELECT conname, pg_get_constraintdef(oid) 
    FROM pg_constraint 
    WHERE conrelid = 'public.doctor_availability'::regclass
  `;
  console.log(JSON.stringify(constraints, null, 2));

  process.exit(0);
}

runAudit().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
