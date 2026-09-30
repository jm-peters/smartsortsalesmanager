/**
 * Supabase Client Configuration with Passkeys (WebAuthn) Support
 * Uses @supabase/supabase-js v2.105.0+ and explicitly opts in to experimental passkeys.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_URL) ||
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.SUPABASE_URL) ||
  'https://placeholder.supabase.co';

const supabaseAnonKey =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_ANON_KEY) ||
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.SUPABASE_ANON_KEY) ||
  'placeholder-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    experimental: {
      passkey: true,
    },
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
