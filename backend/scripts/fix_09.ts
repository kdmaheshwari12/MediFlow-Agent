import dotenv from 'dotenv';
dotenv.config();
import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL as string);

async function run() {
  await sql`INSERT INTO schema_migrations (version) VALUES ('09') ON CONFLICT DO NOTHING`;
  console.log('Fixed');
  process.exit(0);
}
run();
