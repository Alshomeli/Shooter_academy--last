const TELEGRAM_BOT_TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN');
const TELEGRAM_WEBHOOK_SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET');

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_WEBHOOK_SECRET) {
    console.error('Required Telegram function secrets are missing');
    return new Response('Function is not configured', { status: 500 });
  }

  const providedSecret = req.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (providedSecret !== TELEGRAM_WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  let update: {
    message?: {
      chat?: { id?: number };
      text?: string;
    };
  };

  try {
    update = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const chatId = update.message?.chat?.id;
  const incomingText = update.message?.text;

  // Ignore non-text updates (photos, stickers, edited messages, etc.).
  if (typeof chatId !== 'number' || typeof incomingText !== 'string') {
    return Response.json({ ok: true });
  }

  const replyText = `Thanks for your message! You said: ${incomingText}`.slice(0, 4096);

  try {
    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: replyText }),
      },
    );

    if (!telegramResponse.ok) {
      const details = await telegramResponse.text();
      console.error('Telegram sendMessage failed:', telegramResponse.status, details);
      return new Response('Could not send Telegram reply', { status: 502 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error('Telegram API request failed:', error);
    return new Response('Telegram API request failed', { status: 502 });
  }
});
