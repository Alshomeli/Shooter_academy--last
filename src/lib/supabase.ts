import { createClient } from '@supabase/supabase-js';

function requiredEnv(name: string, value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return normalized;
}

const url = requiredEnv('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL);
const anonKey = requiredEnv('VITE_SUPABASE_ANON_KEY', import.meta.env.VITE_SUPABASE_ANON_KEY);

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

let authRecoveryInstalled = false;

export function installAuthRecovery() {
  if (authRecoveryInstalled || typeof window === 'undefined') return;
  authRecoveryInstalled = true;

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const message = reason instanceof Error ? reason.message : String(reason ?? '');
    if (!/refresh token.*not found|invalid refresh token/i.test(message)) return;

    void supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
  });
}
