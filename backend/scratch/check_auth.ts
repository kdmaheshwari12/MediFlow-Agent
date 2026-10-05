import dotenv from 'dotenv';
dotenv.config();
import { supabaseAdmin } from '../src/lib/supabase';

async function checkAuth() {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error) {
    console.error('Error fetching auth users:', error);
  } else {
    console.log(`Auth users count: ${data.users.length}`);
  }
}

checkAuth().catch(console.error);
