import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const { DATABASE_URL } = process.env;
const sql = postgres(DATABASE_URL!);

async function main() {
  const policies = await sql`
    SELECT policyname, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE tablename = 'doctor_profiles';
  `;
  console.log('doctor_profiles RLS policies:', JSON.stringify(policies, null, 2));
  await sql.end();
}

main().catch(console.error);
