import fs from 'fs';
import path from 'path';
import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const { DATABASE_URL } = process.env;
const sql = postgres(DATABASE_URL!);

async function main() {
  const file = path.join(__dirname, '../supabase/migrations/18_auto_create_profile_trigger.sql');
  const content = fs.readFileSync(file, 'utf-8');
  await sql.unsafe(content);
  console.log('✅ Trigger updated successfully.');
  await sql.end();
}

main().catch(console.error);
