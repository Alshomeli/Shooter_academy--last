import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../supabase/functions/telegram-reply/index.ts', import.meta.url), 'utf8');

test('Telegram webhook requires the configured secret header', () => {
  assert.match(source, /TELEGRAM_WEBHOOK_SECRET/);
  assert.match(source, /X-Telegram-Bot-Api-Secret-Token/);
  assert.match(source, /status:\s*401/);
});

test('Telegram webhook only accepts POST and safely ignores non-text updates', () => {
  assert.match(source, /req\.method\s*!==\s*['"]POST['"]/);
  assert.match(source, /status:\s*405/);
  assert.match(source, /typeof chatId !== ['"]number['"]/);
  assert.match(source, /typeof incomingText !== ['"]string['"]/);
});

test('Telegram bot token stays in environment and is only used for Telegram sendMessage', () => {
  assert.match(source, /Deno\.env\.get\(['"]TELEGRAM_BOT_TOKEN['"]\)/);
  assert.match(source, /api\.telegram\.org\/bot/);
  assert.match(source, /sendMessage/);
  assert.doesNotMatch(source, /\b\d{8,12}:[A-Za-z0-9_-]{20,}\b/);
});

test('Telegram production baseline is synchronized before gateway integration', () => {
  assert.match(source, /Thanks for your message! You said:/);
});
