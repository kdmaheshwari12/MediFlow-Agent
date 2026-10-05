import dotenv from 'dotenv';
dotenv.config();

import postgres from 'postgres';
import { supabaseAdmin } from '../src/lib/supabase';

const { DATABASE_URL } = process.env;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required in .env');
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

async function emptyDatabase() {
  console.log('=== STARTING DATABASE TRUNCATION ===\n');

  // 1. Fetch all public tables except schema_migrations
  const tablesResult = await sql`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      AND table_name != 'schema_migrations'
    ORDER BY table_name;
  `;

  const tableNames = tablesResult.map((t) => t.table_name);
  console.log(`Found ${tableNames.length} tables in public schema.`);

  if (tableNames.length > 0) {
    const formattedTables = tableNames.map((name) => `"${name}"`).join(', ');
    console.log('Truncating tables with CASCADE...');
    await sql.unsafe(`TRUNCATE TABLE ${formattedTables} RESTART IDENTITY CASCADE;`);
    console.log('✅ All public tables successfully truncated.\n');
  }

  // 2. Delete Supabase Auth users
  console.log('Fetching Supabase Auth users...');
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers();

  if (authError) {
    console.warn('Could not fetch Supabase Auth users:', authError.message);
  } else if (authData && authData.users) {
    console.log(`Found ${authData.users.length} auth users to delete.`);
    let deletedCount = 0;
    for (const u of authData.users) {
      const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(u.id);
      if (delErr) {
        console.error(`Failed to delete user ${u.id} (${u.email}):`, delErr.message);
      } else {
        deletedCount++;
      }
    }
    console.log(`✅ Deleted ${deletedCount}/${authData.users.length} Supabase auth users.\n`);
  }

  // 3. Verify final row counts
  console.log('=== VERIFYING TABLE ROW COUNTS ===');
  let totalRowsRemaining = 0;
  for (const name of tableNames) {
    const res = await sql.unsafe(`SELECT COUNT(*) as count FROM "${name}"`);
    const count = parseInt(res[0].count, 10);
    totalRowsRemaining += count;
    console.log(`- ${name}: ${count} rows`);
  }

  console.log(`\nTotal remaining rows across all public tables: ${totalRowsRemaining}`);

  if (totalRowsRemaining === 0) {
    console.log('\n🎉 DATABASE EMPTIED SUCCESSFULLY!');
  } else {
    console.error('\n⚠️ Warning: Some rows still remain in database tables.');
  }

  await sql.end();
  process.exit(0);
}

emptyDatabase().catch((err) => {
  console.error('Error emptying database:', err);
  process.exit(1);
});
