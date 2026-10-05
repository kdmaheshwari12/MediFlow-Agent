import fs from 'fs';
import path from 'path';
import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const { DATABASE_URL } = process.env;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

async function runMigrations() {
  const migrationsDir = path.join(__dirname, '../supabase/migrations');
  const files = fs.readdirSync(migrationsDir).sort();

  console.log('Starting migrations...');

  // Ensure schema_migrations table exists before starting
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version varchar(255) PRIMARY KEY,
      applied_at timestamptz DEFAULT NOW()
    )
  `;

  for (const file of files) {
    if (!file.endsWith('.sql')) continue;
    
    const version = file.split('_')[0];
    
    // Check if migration exists
    try {
      const exists = await sql`SELECT 1 FROM schema_migrations WHERE version = ${version}`;
      if (exists.length > 0) {
        console.log(`Skipping ${file}, already applied.`);
        continue;
      }
    } catch (err) {
      // If table doesn't exist yet, we catch error and proceed
    }

    console.log(`Applying ${file}...`);
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    
    await sql.unsafe(content);
    try {
      await sql`INSERT INTO schema_migrations (version) VALUES (${version})`;
    } catch (e) {
      console.warn(`Could not record migration ${version}:`, e);
    }
    console.log(`Applied ${file}`);
  }

  console.log('Migrations complete.');
  process.exit(0);
}

runMigrations().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
