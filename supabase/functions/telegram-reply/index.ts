import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const TELEGRAM_WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_SECRET_KEYS = Deno.env.get("SUPABASE_SECRET_KEYS");
const MANAGER_CHAT_IDS = new Set(
  (Deno.env.get("TELEGRAM_MANAGER_CHAT_IDS") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

// Bootstrap allowlist stores only SHA-256 digests, never raw Telegram chat IDs.
const BOOTSTRAP_MANAGER_CHAT_HASHES = new Set([
  "77aa335710747063044d0b8d13ab0c4576ea69f2e9fd5beb71167d9bdfda2a11",
]);

// Bootstrap webhook authentication stores only the SHA-256 digest of the
// Telegram secret token. This lets us securely recover webhook registration
// without committing the plaintext secret.
const BOOTSTRAP_WEBHOOK_SECRET_HASHES = new Set([
  "30d0b4b7784e9587110b7b2ec6da8d2bdcf8a502fce7e8c160dc15dd98647eac",
]);

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function isAuthorizedManagerChat(chatId: number): Promise<boolean> {
  const raw = String(chatId);
  if (MANAGER_CHAT_IDS.has(raw)) return true;
  return BOOTSTRAP_MANAGER_CHAT_HASHES.has(await sha256Hex(raw));
}

async function isAuthorizedWebhookSecret(value: string | null): Promise<boolean> {
  if (!value) return false;
  if (TELEGRAM_WEBHOOK_SECRET && value === TELEGRAM_WEBHOOK_SECRET) return true;
  return BOOTSTRAP_WEBHOOK_SECRET_HASHES.has(await sha256Hex(value));
}

type TelegramUpdate = {
  update_id?: number;
  message?: {
    message_id?: number;
    from?: { id?: number; is_bot?: boolean; first_name?: string };
    chat?: { id?: number; type?: string };
    text?: string;
  };
};

function bahrainDate(offsetDays = 0): string {
  const now = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bahrain",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function isSummaryCommand(text: string): boolean {
  const value = normalize(text);
  return ["/summary", "summary", "ملخص", "ملخص اليوم", "شنو صار اليوم", "شو صار اليوم"].includes(value)
    || value.includes("ملخص")
    || (value.includes("اليوم") && (value.includes("شنو صار") || value.includes("شو صار") || value.includes("وش صار")));
}

function isPaymentsCommand(text: string): boolean {
  const value = normalize(text);
  return ["/payments", "payments", "دفعات اليوم", "الدفعات اليوم", "من دفع اليوم", "من دفع اليوم؟"].includes(value)
    || (value.includes("اليوم") && (value.includes("دفع") || value.includes("دفعات") || value.includes("مدفوع")));
}

function isExpiringCommand(text: string): boolean {
  const value = normalize(text);
  return [
    "/expiring",
    "expiring",
    "الاشتراكات التي تنتهي اليوم",
    "اشتراكات تنتهي اليوم",
    "الاشتراكات المنتهية اليوم",
  ].includes(value)
    || (
      value.includes("اشتراك")
      && (value.includes("تنتهي") || value.includes("ينتهي") || value.includes("انتهاء") || value.includes("منته"))
    );
}

function isHelpCommand(text: string): boolean {
  return ["/start", "/help", "help", "مساعدة", "الأوامر", "اوامر"].includes(normalize(text));
}

async function sendMessage(chatId: number, text: string) {
  if (!TELEGRAM_BOT_TOKEN) throw new Error("telegram_bot_token_missing");
  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 4096),
        disable_web_page_preview: true,
      }),
    },
  );
  if (!response.ok) {
    console.error("Telegram sendMessage failed", response.status);
    throw new Error("telegram_send_failed");
  }
}

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-BH", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(value);
}

function serverApiKey(): string {
  if (SUPABASE_SECRET_KEYS) {
    try {
      const parsed = JSON.parse(SUPABASE_SECRET_KEYS) as Record<string, string>;
      const key = parsed.default || Object.values(parsed)[0];
      if (key) return String(key);
    } catch {
      console.error("SUPABASE_SECRET_KEYS could not be parsed");
    }
  }
  if (SUPABASE_SERVICE_ROLE_KEY) return SUPABASE_SERVICE_ROLE_KEY;
  throw new Error("supabase_server_key_unavailable");
}

function restUrl(table: string, params: Record<string, string>): URL {
  if (!SUPABASE_URL) throw new Error("supabase_url_unavailable");
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(params)) {
    const paramName = key === "end_date_lte" ? "end_date" : key;
    url.searchParams.append(paramName, value);
  }
  return url;
}

async function restCount(table: string, params: Record<string, string>): Promise<number> {
  const response = await fetch(restUrl(table, { select: "id", ...params }), {
    method: "HEAD",
    headers: {
      apikey: serverApiKey(),
      Prefer: "count=exact",
    },
  });
  if (!response.ok) {
    console.error("Telegram REST count failed", table, response.status);
    throw new Error(`rest_count_failed_${response.status}`);
  }
  const contentRange = response.headers.get("content-range") || "";
  const totalText = contentRange.split("/")[1] || "0";
  const total = Number(totalText);
  return Number.isFinite(total) ? total : 0;
}

async function restRows<T>(table: string, params: Record<string, string>): Promise<T[]> {
  const response = await fetch(restUrl(table, params), {
    method: "GET",
    headers: {
      apikey: serverApiKey(),
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    console.error("Telegram REST rows failed", table, response.status);
    throw new Error(`rest_rows_failed_${response.status}`);
  }
  const data = await response.json();
  return Array.isArray(data) ? data as T[] : [];
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  if (!TELEGRAM_BOT_TOKEN || !SUPABASE_URL || (!SUPABASE_SECRET_KEYS && !SUPABASE_SERVICE_ROLE_KEY)) {
    console.error("Required Telegram manager configuration is missing");
    return new Response("Function is not configured", { status: 500 });
  }

  const providedSecret = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (!(await isAuthorizedWebhookSecret(providedSecret))) {
    return new Response("Unauthorized", { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const chatId = update.message?.chat?.id;
  const chatType = update.message?.chat?.type;
  const telegramUserId = update.message?.from?.id;
  const incomingText = update.message?.text;

  if (typeof chatId !== "number" || typeof incomingText !== "string") {
    return Response.json({ ok: true });
  }

  // Manager information is intentionally limited to direct chats.
  if (chatType !== "private") {
    await sendMessage(chatId, "استخدم البوت في محادثة خاصة فقط.");
    return Response.json({ ok: true });
  }

  if (normalize(incomingText) === "/whoami") {
    await sendMessage(
      chatId,
      `Telegram Chat ID: ${chatId}\nTelegram User ID: ${telegramUserId ?? "unknown"}\n\nاستخدم هذه القيم فقط لإعداد الربط الإداري الآمن.`,
    );
    return Response.json({ ok: true });
  }

  if (!(await isAuthorizedManagerChat(chatId))) {
    await sendMessage(chatId, "هذا الحساب غير مصرح له باستخدام لوحة إدارة الأكاديمية عبر Telegram.");
    return Response.json({ ok: true });
  }

  try {
    if (isHelpCommand(incomingText)) {
      await sendMessage(
        chatId,
        [
          "أوامر Shooter Academy:",
          "• ملخص اليوم",
          "• من دفع اليوم؟",
          "• اشتراكات تنتهي اليوم",
          "• /whoami",
          "",
          "الإصدار الحالي قراءة فقط. أي تعديل إداري سيحتاج تأكيد صريح قبل التنفيذ في المرحلة التالية.",
        ].join("\n"),
      );
      return Response.json({ ok: true });
    }

    const today = bahrainDate();

    if (isSummaryCommand(incomingText)) {
      const [activePlayers, unpaid, expiringToday, paymentRows] = await Promise.all([
        restCount("players", { status: "eq.active" }),
        restCount("subscriptions", { status: "eq.unpaid" }),
        restCount("subscriptions", { end_date: `eq.${today}` }),
        restRows<{ amount?: number | string; type?: string }>("transactions", {
          select: "amount,type",
          transaction_date: `eq.${today}`,
        }),
      ]);
      const incomingTotal = paymentRows
        .filter((row) => String(row.type).toLowerCase() === "income")
        .reduce((sum, row) => sum + Number(row.amount || 0), 0);

      await sendMessage(
        chatId,
        [
          `ملخص اليوم — ${today}`,
          `اللاعبون النشطون: ${activePlayers}`,
          `اشتراكات غير مدفوعة: ${unpaid}`,
          `اشتراكات تنتهي اليوم: ${expiringToday}`,
          `إيرادات مسجلة اليوم: ${formatMoney(incomingTotal)} د.ب`,
        ].join("\n"),
      );
      return Response.json({ ok: true });
    }

    if (isPaymentsCommand(incomingText)) {
      const rows = await restRows<{ amount?: number | string; type?: string }>("transactions", {
        select: "amount,type",
        transaction_date: `eq.${today}`,
      });
      const incomes = rows.filter((row) => String(row.type).toLowerCase() === "income");
      const total = incomes.reduce((sum, row) => sum + Number(row.amount || 0), 0);

      await sendMessage(
        chatId,
        [
          `دفعات اليوم — ${today}`,
          `عدد عمليات الإيراد: ${incomes.length}`,
          `الإجمالي: ${formatMoney(total)} د.ب`,
          "",
          "لا أعرض أسماء اللاعبين أو بياناتهم الشخصية في الملخص السريع.",
        ].join("\n"),
      );
      return Response.json({ ok: true });
    }

    if (isExpiringCommand(incomingText)) {
      const inSevenDays = bahrainDate(7);
      const [todayCount, weekCount] = await Promise.all([
        restCount("subscriptions", { end_date: `eq.${today}` }),
        restCount("subscriptions", { end_date: `gt.${today}`, end_date_lte: `lte.${inSevenDays}` }),
      ]);

      await sendMessage(
        chatId,
        [
          "الاشتراكات القريبة من الانتهاء",
          `تنتهي اليوم: ${todayCount}`,
          `تنتهي خلال 7 أيام القادمة: ${weekCount}`,
        ].join("\n"),
      );
      return Response.json({ ok: true });
    }

    await sendMessage(chatId, "الأمر غير معروف. أرسل «مساعدة» لعرض الأوامر المتاحة.");
    return Response.json({ ok: true });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code || "unknown") : "unknown";
    console.error("Telegram manager query failed", code);
    await sendMessage(chatId, "تعذر جلب البيانات الآن. حاول مرة أخرى بعد قليل.");
    return Response.json({ ok: false }, { status: 500 });
  }
});
