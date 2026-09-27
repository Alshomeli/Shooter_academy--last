# Telegram integration status

## Current baseline

The production Supabase project currently has an active `telegram-reply` Edge Function.
This repository now stores the same baseline source so production behavior is reproducible.

The current function:

- accepts only POST requests,
- requires `X-Telegram-Bot-Api-Secret-Token`,
- reads the bot token and webhook secret from Edge Function secrets,
- ignores non-text updates,
- sends a simple echo reply through Telegram `sendMessage`.

It is intentionally **not** connected to academy data or administrative mutations yet.

## Next integration stage

The safe target architecture is:

`Telegram webhook -> identity/pairing adapter -> ai-operations-gateway -> Supabase/RPCs`

Requirements before enabling administrative commands:

1. Fix the Supabase development branch migration drift so the branch can be rebuilt from production migrations.
2. Add manager/staff pairing without trusting Telegram usernames.
3. Keep read-only summaries role-scoped.
4. Route all mutations through the existing prepare -> explicit confirmation -> execute lifecycle.
5. Use Telegram inline confirmation/cancel actions for pending mutations.
6. Keep bot tokens and webhook secrets server-side only.
7. Avoid returning unnecessary player/minor personal data in chat.
8. Validate the integration on the development branch before production deployment.

Production should not be used as the development environment for the next stage.
