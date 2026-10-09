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
let authRecoveryInProgress = false;

export function isInvalidRefreshTokenError(reason: unknown): boolean {
  const error = reason && typeof reason === 'object'
    ? reason as { code?: unknown; message?: unknown }
    : null;
  const code = String(error?.code ?? '');
  const message = String(error?.message ?? (typeof reason === 'string' ? reason : ''));
  return code === 'refresh_token_not_found' ||
    /refresh token.*not found|invalid refresh token/i.test(message);
}

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
