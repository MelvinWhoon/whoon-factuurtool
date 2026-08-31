import { createClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config';

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  console.warn(
    'Supabase config is missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.'
  );
}

// Zelfde Supabase-project als whoon-ordertool. Standaard localStorage-key
// ('sb-<ref>-auth-token') is identiek aan de hoofd-tool, dus een sessie die
// daar is ingelogd wordt hier automatisch herkend (zelfde origin via de
// Vercel-rewrite op order.whoon.com) - geen apart inlogscherm nodig.
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
