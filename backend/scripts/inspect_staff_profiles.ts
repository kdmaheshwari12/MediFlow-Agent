import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const { DATABASE_URL } = process.env;
const sql = postgres(DATABASE_URL!);

async function main() {
  const cols = await sql`
    SELECT column_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'staff_profiles';
  `;
  console.log('staff_profiles columns:', cols);
  await sql.end();
}

main().catch(console.error);
