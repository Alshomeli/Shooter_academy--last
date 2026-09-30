import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const gateway = readFileSync(new URL('../supabase/functions/ai-operations-gateway/index.ts', import.meta.url), 'utf8');
const openapi = readFileSync(new URL('../docs/chatgpt-operations-openapi.yaml', import.meta.url), 'utf8');

function gatewayOperations() {
  const match = gateway.match(/type Operation = ([^;]+);/);
  assert.ok(match, 'gateway Operation union should exist');
  return [...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]).sort();
}

function openApiOperations() {
  const match = openapi.match(/Operation:\n\s+type: string\n\s+enum:\n((?:\s+- [^\n]+\n?)+)/);
  assert.ok(match, 'OpenAPI Operation enum should exist');
  return match[1].split('\n').map((line) => line.trim()).filter((line) => line.startsWith('- ')).map((line) => line.slice(2)).sort();
}

test('AI operations OpenAPI stays synchronized with the gateway allow-list', () => {
  assert.deepEqual(openApiOperations(), gatewayOperations());
});

test('connector contract exposes the complete safe action lifecycle', () => {
  for (const mode of ['prepare', 'execute', 'cancel', 'history', 'snapshot']) {
    assert.match(gateway, new RegExp('"' + mode + '"'));
    assert.match(openapi, new RegExp('const: ' + mode));
  }
  assert.match(openapi, /bearerAuth:/);
  assert.match(openapi, /SnapshotResponse:/);
});

test('snapshot remains aggregate and role-scoped', () => {
  assert.match(gateway, /const canPayments = \["manager", "accountant"\]/);
  assert.match(gateway, /const canEvaluations = \["manager", "coach"\]/);
  assert.match(gateway, /const canRegistrations = staff\.role === "manager"/);
  assert.match(gateway, /unpaidSubscriptions:/);
  assert.match(gateway, /activePlayers:/);
  assert.match(gateway, /draftEvaluations:/);
  assert.match(gateway, /applicationsNeedingAction:/);
});


test('execute enforces owner, explicit confirmation, expiry, and a single pending-to-executing claim', () => {
  const owner = gateway.indexOf('action.user_id !== userData.user.id');
  const confirm = gateway.indexOf('body.confirm !== true');
  const pending = gateway.indexOf('action.status !== "pending"');
  const expiry = gateway.indexOf('new Date(action.expires_at).getTime() <= Date.now()');
  const claim = gateway.indexOf('status: "executing"');
  const claimGuard = gateway.indexOf('.eq("status", "pending")', claim);

  assert.ok(owner >= 0, 'owner check should exist');
  assert.ok(confirm > owner, 'explicit confirmation must happen after ownership is established');
  assert.ok(pending > confirm, 'pending-state guard must happen before execution');
  assert.ok(expiry > pending, 'expiry must be checked before claiming execution');
  assert.ok(claim > expiry, 'execution claim must happen only after expiry validation');
  assert.ok(claimGuard > claim, 'claim must be conditional on pending status to prevent double execution');
});

test('business mutations happen only after the execution claim', () => {
  const claim = gateway.indexOf('status: "executing"');
  for (const rpc of [
    'approve_registration_application',
    'review_registration_application',
    'record_subscription_payment',
    'record_attendance_entry',
    'publish_player_evaluation',
    'create_subscription_entry',
  ]) {
    const mutation = gateway.indexOf('rpc("' + rpc + '"');
    assert.ok(mutation > claim, rpc + ' must not run before the request is claimed');
  }
});

test('audit failure is persisted without making the business operation retryable', () => {
  const audit = gateway.indexOf('p_action: "AI_ACTION_EXECUTED"');
  const auditCode = gateway.indexOf('audit_log_failed');
  const executed = gateway.indexOf('status: "executed"', audit);
  const finalizeGuard = gateway.indexOf('.eq("status", "executing")', executed);

  assert.ok(audit >= 0, 'execution audit attempt should exist');
  assert.ok(auditCode > audit, 'audit failure should be converted to a stable error code');
  assert.ok(executed > auditCode, 'request should finalize only after the audit attempt');
  assert.ok(finalizeGuard > executed, 'finalization must only update the claimed executing request');
  assert.match(gateway, /auditLogged:\s*!auditError/);
});
