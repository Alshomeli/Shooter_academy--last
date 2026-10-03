# ChatGPT MCP production readiness

Shooter Academy exposes a remote MCP server at:

`https://jgvfruijtixguavspyer.supabase.co/functions/v1/chatgpt-mcp/mcp`

A non-sensitive readiness endpoint is available at:

`https://jgvfruijtixguavspyer.supabase.co/functions/v1/chatgpt-mcp/health`

## Security model

The MCP server never writes academy tables directly. Read-only tools call the role-scoped snapshot/history modes. Administrative mutations are delegated to `ai-operations-gateway` and must follow:

1. prepare the allow-listed action;
2. show the returned preview to the signed-in staff member;
3. obtain explicit confirmation;
4. execute the prepared request;
5. refresh the app and audit trail.

The remote MCP function validates the user's Supabase access token. The business gateway applies the user's staff role and existing database/RPC checks. No service-role credential is sent to ChatGPT or the browser.

## Supabase cloud settings still required

Repository `supabase/config.toml` contains the local-development OAuth Server configuration. Production Auth configuration is managed separately in the Supabase project and must match the deployed web application.

In **Authentication → OAuth Server**:

- enable the OAuth 2.1 server;
- set the authorization UI path to `/oauth/consent` on the deployed Shooter Academy web origin;
- enable dynamic client registration only when needed for the ChatGPT MCP client;
- keep explicit user consent enabled;
- use the existing staff login/session and do not create a shared integration account.

The web application already contains the staff-only `/oauth/consent` screen. Parent and registration-only accounts are denied integration consent.

## End-to-end acceptance checks

1. Health returns HTTP 200 without credentials.
2. MCP protected-resource discovery is reachable.
3. An unauthenticated MCP request returns an OAuth authentication challenge, not academy data.
4. A staff user can authenticate and see only role-permitted aggregate snapshot fields.
5. A mutation tool can prepare and preview an action without changing data.
6. Cancel leaves business data unchanged.
7. Execute succeeds only after the user explicitly confirms the prepared action.
8. The resulting action appears in recent action history/audit logs.
9. A parent account cannot authorize the integration.
10. No service-role key or private credential is present in frontend code, MCP tool output, or connector configuration.

Do not treat the connector as production-ready until the cloud OAuth Server settings and deployed web `/oauth/consent` route are verified end to end.

## Registering the ChatGPT OAuth client

For a predefined client, register an OAuth application in this project's
**Authentication → OAuth Server** dashboard, using the exact callback URL shown
in the ChatGPT connector's current settings. Copy the generated Client ID and
the corresponding secret directly into the connector's advanced OAuth settings.
A callback URL is not a Client ID. Do not store the client secret in this
repository or share it in chat.

Dynamic registration is a separate alternative and must be enabled in the
production project's settings if chosen. The local TOML setting does not enable
it in the hosted project.

Discovery returning HTTP 200 only confirms that the OAuth server is enabled.
It does not prove that a client is registered or that ChatGPT can authorize,
exchange tokens, or call the MCP tools. Treat `invalid client_id format` as a
connector client-configuration error and verify a registered client exists
before changing the MCP code.

## Deployment consistency

The MCP function uses `verify_jwt = false` so public health and OAuth discovery
can be reached before authentication. The canonical `/mcp` handler still
validates the user's Supabase token, and business operations still pass through
the role-scoped gateway. Legacy function-root requests redirect with HTTP 307
to `/mcp`, preserving the request method, body, and query string.

The repository MCP source is synchronized with deployed function version 17.
Keep the hardened untrusted-content instructions and routing regression tests
when redeploying.
