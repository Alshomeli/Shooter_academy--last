export function isInvalidRefreshTokenError(reason: unknown): boolean {
  const error = reason && typeof reason === 'object'
    ? reason as { code?: unknown; message?: unknown }
    : null;
  const code = String(error?.code ?? '');
  const message = String(error?.message ?? (typeof reason === 'string' ? reason : ''));
  return code === 'refresh_token_not_found' ||
    /refresh token.*not found|invalid refresh token/i.test(message);
}
