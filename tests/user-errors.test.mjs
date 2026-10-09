import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LocalizedError, errorMessage, localized } from '../src/lib/user-errors.ts';

test('an existing error and success message follow the current language on rerender', () => {
  const error = new LocalizedError('تعذر الدخول.', 'Unable to sign in.');
  assert.equal(errorMessage(error, false), 'Unable to sign in.');
  assert.equal(errorMessage(error, true), 'تعذر الدخول.');
  const message = localized('راجع بريدك.', 'Check your email.');
  assert.equal(message.en, 'Check your email.');
  assert.equal(message.ar, 'راجع بريدك.');
});

test('server exceptions never expose database names, IDs, or raw details', () => {
  for (const error of [new Error('secret_table user_id=private-id'), { code: '42501', message: 'permission denied for function secret_rpc' }, { code: '23505', message: 'private-id already exists' }, null, 'secret']) {
    for (const ar of [true, false]) {
      assert.doesNotMatch(errorMessage(error, ar), /secret|private-id|user_id/);
      if (ar) assert.doesNotMatch(errorMessage(error, ar), /[A-Za-z]/);
    }
  }
});

test('known workflow constraints give actionable localized guidance', () => {
  assert.match(errorMessage(new Error('At least one child is required'), true), /طفل واحد/);
  assert.match(errorMessage({ code: 'over_email_send_rate_limit' }, false), /Wait/);
});
