import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const expected = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
};
const source = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
const built = readFileSync(new URL('../dist/_headers', import.meta.url), 'utf8');
assert.equal(built, source, 'Security headers must be copied unchanged to dist/_headers');
assert.ok(built.startsWith('/*\n'), 'Security headers must cover every static path');
for (const [name, value] of Object.entries(expected)) {
  assert.ok(built.includes(`  ${name}: ${value}`), `Missing security header: ${name}`);
}
console.log('Verified all five security headers in dist/_headers. Live deployment must also be checked.');
