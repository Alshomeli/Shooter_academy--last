import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../supabase/functions/telegram-reply/index.ts', import.meta.url), 'utf8');
const config = await readFile(new URL('../supabase/config.toml', import.meta.url), 'utf8');

test('Telegram webhook requires the provider secret and is configured without platform JWT verification', () => {
  assert.match(source, /TELEGRAM_WEBHOOK_SECRET/);
  assert.match(source, /X-Telegram-Bot-Api-Secret-Token/);
  assert.match(source, /status:\s*401/);
  assert.match(config, /\[functions\.telegram-reply\][\s\S]*verify_jwt\s*=\s*false/);
});

test('Telegram manager is limited to direct chats and an explicit chat allowlist', () => {
  assert.match(source, /chatType !== "private"/);
  assert.match(source, /TELEGRAM_MANAGER_CHAT_IDS/);
  assert.match(source, /isAuthorizedManagerChat/);
  assert.match(source, /BOOTSTRAP_MANAGER_CHAT_HASHES/);
  assert.match(source, /crypto\.subtle\.digest\("SHA-256"/);
  assert.doesNotMatch(source, /5853714848/);
  assert.match(source, /\/whoami/);
});

test('Telegram manager is read-only in v1', () => {
  assert.match(source, /ملخص اليوم/);
  assert.match(source, /transactions/);
  assert.match(source, /subscriptions/);
  assert.doesNotMatch(source, /\.insert\(/);
  assert.doesNotMatch(source, /\.update\(/);
  assert.doesNotMatch(source, /\.delete\(/);
  assert.doesNotMatch(source, /\.rpc\(/);
});

test('Telegram bot credentials stay in server environment', () => {
  assert.match(source, /Deno\.env\.get\("TELEGRAM_BOT_TOKEN"\)/);
  assert.match(source, /Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/);
  assert.doesNotMatch(source, /\b\d{8,12}:[A-Za-z0-9_-]{20,}\b/);
});


test('Telegram webhook bootstrap secret is stored only as a digest', () => {
  assert.match(source, /BOOTSTRAP_WEBHOOK_SECRET_HASHES/);
  assert.match(source, /isAuthorizedWebhookSecret/);
  assert.match(source, /crypto\.subtle\.digest\("SHA-256"/);
  assert.doesNotMatch(source, /QTX8VAH4At1fHrnlRBgLTRA6LIWTroAsUAhkE2xdbiY/);
});


test('Telegram summaries use the server API key only as apikey, not as a bearer token', () => {
  assert.match(source, /SUPABASE_SECRET_KEYS/);
  assert.match(source, /serverApiKey/);
  assert.match(source, /apikey:\s*serverApiKey\(\)/);
  assert.doesNotMatch(source, /Authorization:\s*[\`'\"]Bearer\s*\$\{serverApiKey\(\)\}/);
  assert.doesNotMatch(source, /createClient\(/);
});

test('Telegram understands common Arabic phrasing beyond exact slash commands', () => {
  assert.match(source, /value\.includes\("ملخص"\)/);
  assert.match(source, /value\.includes\("دفع"\)/);
  assert.match(source, /value\.includes\("اشتراك"\)/);
});


test('Telegram manager accepts private voice notes and transcribes them server-side', () => {
  assert.match(source, /message\?\.voice/);
  assert.match(source, /getFile\?file_id=/);
  assert.match(source, /api\.telegram\.org\/file\/bot/);
  assert.match(source, /OPENAI_API_KEY/);
  assert.match(source, /\/v1\/audio\/transcriptions/);
  assert.match(source, /gpt-4o-mini-transcribe/);
  assert.match(source, /MAX_VOICE_BYTES/);
});

test('Voice transcription happens only after manager authorization', () => {
  const authIndex = source.indexOf('isAuthorizedManagerChat(chatId)');
  const transcribeCallIndex = source.lastIndexOf('telegramVoiceToText(voiceMessage)');
  assert.ok(authIndex >= 0);
  assert.ok(transcribeCallIndex > authIndex);
});
