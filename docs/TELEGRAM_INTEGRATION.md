# Telegram Manager integration

## Current state

The development branch is healthy and rebuilds all migrations successfully. `telegram-reply` is now the read-only Telegram Manager v1.

Security model:

- Telegram calls the webhook without a Supabase user JWT, so `verify_jwt = false` is required.
- Every request must pass `X-Telegram-Bot-Api-Secret-Token`.
- Administrative summaries are restricted to private chats.
- Allowed chats can be configured server-side in `TELEGRAM_MANAGER_CHAT_IDS`.
- The initial manager is bootstrapped using a one-way SHA-256 digest of the approved chat ID; the raw chat ID is not committed to source control.
- Bot token, webhook secret, and Supabase service role key stay in Edge Function secrets.
- Authorized private manager chats may receive player names and operational/payment details following owner approval. National IDs, guardian contact information, medical data, salaries and private notes are excluded by explicit query projections.
- Telegram Manager v1 performs no inserts, updates, deletes, or RPC mutations.

## Commands

- `/whoami` — returns the Telegram chat/user IDs needed for server-side authorization setup.
- `ملخص اليوم` or `/summary` — active-player count, unpaid subscriptions, subscriptions ending today, and today's recorded income total.
- `من دفع اليوم؟` or `/payments` — today's income transaction count and total, without player-identifying details.
- `اشتراكات تنتهي اليوم` or `/expiring` — counts expiring today and during the next seven days.
- `مساعدة` or `/help` — command help.

## Optional manager override

Optionally set `TELEGRAM_MANAGER_CHAT_IDS` to a comma-separated allowlist of authorized private Telegram chat IDs.

For future managers, place the approved chat ID in the Edge Function secret. Do not authorize based on Telegram username. The initial approved manager does not need `/whoami`; only its digest is stored in source control.

## Next stage

Mutating actions remain disabled until delegated staff identity is added. When enabled, mutations must reuse the existing `ai-operations-gateway` lifecycle:

`prepare -> preview -> explicit confirmation -> execute/cancel`

No Telegram mutation should bypass that confirmation flow.


## Webhook recovery

If the hosted Edge Function secret cannot be updated through the connected tooling, webhook registration can be recovered with a one-time bootstrap secret whose plaintext is never committed. Only its SHA-256 digest is stored in source control. The runtime still accepts the normal `TELEGRAM_WEBHOOK_SECRET` environment secret when configured.


## Voice notes

Authorized managers can send Telegram voice notes instead of typing supported administrative questions. The webhook uses Telegram `getFile`, downloads the voice note server-side, and transcribes it with OpenAI speech-to-text before passing the transcript through the same read-only intent routing used for text messages.

Required server secret: `OPENAI_API_KEY`. Never expose this key to the browser, Telegram messages, source control, or logs. Voice files are processed in memory and are not persisted by this function. Telegram bot downloads are limited to 20 MB.

## Detailed reports

`ملخص اليوم` and `تفاصيل اليوم` include scheduled matches, recorded training sessions, revenue, expenses, attendance, registration requests and expiring subscriptions. Queries also support players, teams, staff/coaches, evaluations and tournaments. Data stays read-only and uses fixed column projections; the model only classifies unsupported phrasing, never chooses SQL or database columns. Database records are not sent to the model.

Examples: `مباريات غدا`, `تفاصيل دفعات اليوم`, `تقييمات اللاعبين 2026-09-30`, `تفاصيل يوم 2026-09-30`, `دفعات اللاعب «الاسم الكامل» اليوم`. Use an ISO date or two ISO dates for a range. Named player/team filters require quoted exact registered names. Unknown questions return a clarification instead of an invented answer. This is not an unrestricted general-purpose database agent.

Each section shows 15 records per page; append `صفحة 2` to the original question for the next page. Financial page sums are explicitly labeled as sums of displayed transactions only, not full-period totals. Transaction IDs are labeled as operation references, not invented receipt numbers. Missing match times and remaining balances are not inferred. Training reports use dated training records; recurring team schedules are available through the teams report. Long responses are split into Telegram-safe messages. Section failures are reported explicitly.
