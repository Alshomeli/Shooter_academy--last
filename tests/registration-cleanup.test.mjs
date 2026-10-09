import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanupRegistrationFiles, deleteThenCleanup } from '../src/lib/registration-cleanup.ts';

test('rejected application or child deletion leaves every file untouched', async () => {
  let touched = false;
  await assert.rejects(deleteThenCleanup(async () => { throw new Error('not authorized'); }, async () => { touched = true; }), /not authorized/);
  assert.equal(touched, false);
});

test('cleanup processes only server-approved paths, after database commit', async () => {
  const calls = [];
  const paths = ['applications/deleted/photo.webp'];
  await deleteThenCleanup(async () => { calls.push('commit'); }, () => cleanupRegistrationFiles({
    pending: async () => { calls.push('pending'); return paths; },
    remove: async value => { assert.deepEqual(value, paths); calls.push('remove'); },
    acknowledge: async value => { assert.deepEqual(value, paths); calls.push('ack'); },
  }));
  assert.deepEqual(calls, ['commit', 'pending', 'remove', 'ack']);
});

test('storage failure preserves the queue and does not turn a committed deletion into failure', async () => {
  let queued = true, attempts = 0;
  const cleanup = () => cleanupRegistrationFiles({
    pending: async () => queued ? ['applications/deleted/photo.webp'] : [],
    remove: async () => { if (++attempts === 1) throw new Error('offline'); },
    acknowledge: async () => { queued = false; },
  });
  await deleteThenCleanup(async () => {}, cleanup);
  assert.equal(queued, true);
  await cleanup();
  assert.equal(queued, false);
  assert.equal(attempts, 2);
});

test('acknowledgement failure can retry an already removed file', async () => {
  let acknowledgements = 0;
  const cleanup = () => cleanupRegistrationFiles({
    pending: async () => ['applications/deleted/photo.webp'],
    remove: async () => {},
    acknowledge: async () => { if (++acknowledgements === 1) throw new Error('offline'); },
  });
  await deleteThenCleanup(async () => {}, cleanup);
  await cleanup();
  assert.equal(acknowledgements, 2);
});

test('empty queue makes no storage or acknowledgement calls', async () => {
  await cleanupRegistrationFiles({ pending: async () => [], remove: async () => assert.fail(), acknowledge: async () => assert.fail() });
});
