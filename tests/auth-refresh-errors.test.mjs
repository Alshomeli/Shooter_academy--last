import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isInvalidRefreshTokenError } from '../src/lib/auth-refresh-errors.ts';

test('recognizes Supabase invalid refresh-token error codes and messages', () => {
  assert.equal(isInvalidRefreshTokenError({ code: 'refresh_token_not_found' }), true);
  assert.equal(isInvalidRefreshTokenError({ message: 'Invalid Refresh Token: Refresh Token Not Found' }), true);
  assert.equal(isInvalidRefreshTokenError(new Error('Refresh token not found')), true);
  assert.equal(isInvalidRefreshTokenError('Invalid Refresh Token'), true);
});

test('ignores unrelated errors, missing values, and valid-session events', () => {
  for (const reason of [null, undefined, {}, new Error('Network error'), { code: 'invalid_credentials' }, { message: 'Session not found' }]) {
    assert.equal(isInvalidRefreshTokenError(reason), false);
  }
});
