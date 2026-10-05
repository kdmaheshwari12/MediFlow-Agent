import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const { DATABASE_URL } = process.env;
const sql = postgres(DATABASE_URL!);

async function main() {
  const views = ['doctors_public', 'safe_doctor_profiles', 'safe_doctors'];
  for (const v of views) {
    try {
      const def = await sql`SELECT pg_get_viewdef(${v}::regclass, true);`;
      console.log(`=== VIEW: ${v} ===`);
      console.log(def[0]?.pg_get_viewdef);
    } catch (e: any) {
      console.log(`=== VIEW: ${v} NOT FOUND OR ERROR: ${e.message} ===`);
    }
  }
  await sql.end();
}

main().catch(console.error);
