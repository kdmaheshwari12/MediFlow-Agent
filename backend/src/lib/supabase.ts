import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';

// Admin client using service role key (bypasses RLS)
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Helper to create a user-scoped client from a JWT for RLS
export function createScopedClient(token: string) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: {
      headers: { Authorization: `Bearer ${token}` }
    },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}
