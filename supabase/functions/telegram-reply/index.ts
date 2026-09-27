import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const TELEGRAM_WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const MANAGER_CHAT_IDS = new Set(
  (Deno.env.get("TELEGRAM_MANAGER_CHAT_IDS") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);

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
  return ["/summary", "summary", "ملخص", "ملخص اليوم", "شنو صار اليوم", "شو صار اليوم"].includes(normalize(text));
}

function isPaymentsCommand(text: string): boolean {
  const value = normalize(text);
  return ["/payments", "payments", "دفعات اليوم", "الدفعات اليوم", "من دفع اليوم", "من دفع اليوم؟"].includes(value);
}

function isExpiringCommand(text: string): boolean {
  const value = normalize(text);
  return [
    "/expiring",
    "expiring",
    "الاشتراكات التي تنتهي اليوم",
    "اشتراكات تنتهي اليوم",
    "الاشتراكات المنتهية اليوم",
  ].includes(value);
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

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_WEBHOOK_SECRET || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Required Telegram manager configuration is missing");
    return new Response("Function is not configured", { status: 500 });
  }

  const providedSecret = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
  if (providedSecret !== TELEGRAM_WEBHOOK_SECRET) return new Response("Unauthorized", { status: 401 });

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

  if (!MANAGER_CHAT_IDS.has(String(chatId))) {
    await sendMessage(chatId, "هذا الحساب غير مصرح له باستخدام لوحة إدارة الأكاديمية عبر Telegram.");
    return Response.json({ ok: true });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

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
      const [{ count: activePlayers, error: playersError }, { count: unpaid, error: unpaidError }, { count: expiringToday, error: expiryError }, { data: payments, error: paymentsError }] = await Promise.all([
        admin.from("players").select("id", { count: "exact", head: true }).eq("status", "active"),
        admin.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "unpaid"),
        admin.from("subscriptions").select("id", { count: "exact", head: true }).eq("end_date", today),
        admin.from("transactions").select("amount,type").eq("transaction_date", today),
      ]);
      const firstError = playersError || unpaidError || expiryError || paymentsError;
      if (firstError) throw firstError;

      const paymentRows = payments || [];
      const incomingTotal = paymentRows
        .filter((row) => String(row.type).toLowerCase() === "income")
        .reduce((sum, row) => sum + Number(row.amount || 0), 0);

      await sendMessage(
        chatId,
        [
          `ملخص اليوم — ${today}`,
          `اللاعبون النشطون: ${activePlayers ?? 0}`,
          `اشتراكات غير مدفوعة: ${unpaid ?? 0}`,
          `اشتراكات تنتهي اليوم: ${expiringToday ?? 0}`,
          `إيرادات مسجلة اليوم: ${formatMoney(incomingTotal)} د.ب`,
        ].join("\n"),
      );
      return Response.json({ ok: true });
    }

    if (isPaymentsCommand(incomingText)) {
      const { data, error } = await admin
        .from("transactions")
        .select("amount,type")
        .eq("transaction_date", today);
      if (error) throw error;

      const rows = data || [];
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
      const [{ count: todayCount, error: todayError }, { count: weekCount, error: weekError }] = await Promise.all([
        admin.from("subscriptions").select("id", { count: "exact", head: true }).eq("end_date", today),
        admin.from("subscriptions").select("id", { count: "exact", head: true }).gt("end_date", today).lte("end_date", inSevenDays),
      ]);
      if (todayError || weekError) throw todayError || weekError;

      await sendMessage(
        chatId,
        [
          "الاشتراكات القريبة من الانتهاء",
          `تنتهي اليوم: ${todayCount ?? 0}`,
          `تنتهي خلال 7 أيام القادمة: ${weekCount ?? 0}`,
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
