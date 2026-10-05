import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const { DATABASE_URL } = process.env;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

async function checkTables() {
  const tables = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      AND table_name != 'schema_migrations'
    ORDER BY table_name;
  `;

  console.log('--- Public Database Tables ---');
  for (const t of tables) {
    const tableName = t.table_name;
    const countRes = await sql.unsafe(`SELECT COUNT(*) as count FROM "${tableName}"`);
    console.log(`${tableName}: ${countRes[0].count} rows`);
  }

  await sql.end();
}

checkTables().catch((err) => {
  console.error(err);
  process.exit(1);
});
