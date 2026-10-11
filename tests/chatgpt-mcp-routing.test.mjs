import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../supabase/functions/chatgpt-mcp/index.ts', import.meta.url), 'utf8');
const project = 'https://academy-test.supabase.co';

function loadHandler() {
  let handle;
  const routes = [];
  class Hono {
    basePath(prefix) { this.prefix = prefix; return this; }
    get(path, callback) { routes.push({ method: 'GET', path: this.prefix + path, callback }); return this; }
    all(path, callback) { routes.push({ method: '*', path: this.prefix + path, callback }); return this; }
    fetch(request) {
      const path = new URL(request.url).pathname.replace(/^\/functions\/v1/, '');
      const route = routes.find(route => route.path === path && (route.method === '*' || route.method === request.method));
      if (!route) return new Response('Not found', { status: 404 });
      return route.callback({ req: { raw: request, header: name => request.headers.get(name) || undefined } });
    }
  }
  const code = stripTypeScriptTypes(source.replace(/^import .*;\r?\n/gm, ''), { mode: 'strip' });
  runInNewContext(code, {
    URL, Response, Request, Hono,
    Deno: {
      env: { get: name => ({ SUPABASE_URL: project, SUPABASE_ANON_KEY: 'public-test-key' })[name] },
      serve: handler => { handle = handler; },
    },
    createClient: () => ({ auth: { getUser: async () => ({ data: { user: null }, error: new Error('invalid token') }) } }),
  });
  assert.equal(typeof handle, 'function');
  return handle;
}

for (const root of ['/chatgpt-mcp', '/chatgpt-mcp/', '/functions/v1/chatgpt-mcp', '/functions/v1/chatgpt-mcp/']) {
  test('legacy MCP root redirects to the canonical endpoint: ' + root, async () => {
    const request = new Request(project + root + '?probe=a%2Fb&second=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' }),
    });
    const response = await loadHandler()(request);
    assert.equal(response.status, 307);
    assert.equal(response.headers.get('location'), project + '/functions/v1/chatgpt-mcp/mcp?probe=a%2Fb&second=1');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(request.bodyUsed, false, 'redirect must leave the MCP request body untouched');
  });
}

for (const authorization of [undefined, 'Bearer invalid-test-token']) {
  test('canonical MCP requires authentication: ' + (authorization ? 'invalid token' : 'no token'), async () => {
    const headers = authorization ? { Authorization: authorization } : {};
    const response = await loadHandler()(new Request(project + '/functions/v1/chatgpt-mcp/mcp', { headers }));
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('location'), null, 'canonical path must not redirect to itself');
    assert.equal(response.headers.get('www-authenticate'), 'Bearer resource_metadata="' + project + '/functions/v1/chatgpt-mcp/.well-known/oauth-protected-resource"');
    assert.deepEqual(await response.json(), { error: 'authentication_required' });
  });
}

test('OAuth discovery remains public and points to the same canonical MCP resource', async () => {
  const response = await loadHandler()(new Request(project + '/functions/v1/chatgpt-mcp/.well-known/oauth-protected-resource'));
  assert.equal(response.status, 200);
  const metadata = await response.json();
  assert.equal(metadata.resource, project + '/functions/v1/chatgpt-mcp/mcp');
  assert.deepEqual(metadata.authorization_servers, [project + '/auth/v1']);
});

test('public health returns only service readiness', async () => {
  const response = await loadHandler()(new Request(project + '/functions/v1/chatgpt-mcp/health'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: 'ok',
    service: 'shooter-academy-admin-mcp',
    version: '1.0.0',
    authentication: 'supabase-oauth',
    mutationFlow: 'prepare-confirm-execute',
  });
});
