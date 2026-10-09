import { createClient } from '@supabase/supabase-js';
import { isInvalidRefreshTokenError } from './auth-refresh-errors';

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
let authRecoveryInProgress = false;


export function installAuthRecovery() {
  if (authRecoveryInstalled || typeof window === 'undefined') return;
  authRecoveryInstalled = true;

  window.addEventListener('unhandledrejection', (event) => {
    if (!isInvalidRefreshTokenError(event.reason) || authRecoveryInProgress) return;
    authRecoveryInProgress = true;
    // Only clear the browser's local session. The App auth-state listener
    // handles signed-out UI state; never revoke other devices' sessions here.
    void supabase.auth.signOut({ scope: 'local' })
      .catch(() => undefined)
      .finally(() => { authRecoveryInProgress = false; });
  });
}
