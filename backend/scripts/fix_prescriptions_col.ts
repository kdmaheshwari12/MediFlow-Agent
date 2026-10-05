import postgres from 'postgres';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

async function run() {
  await sql.unsafe('ALTER TABLE prescriptions ALTER COLUMN record_id DROP NOT NULL;');
  console.log('Successfully dropped NOT NULL constraint on prescriptions.record_id');
  process.exit(0);
}

run().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
