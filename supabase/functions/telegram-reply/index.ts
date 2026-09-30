import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { reportRequest, detailedReport, splitMessages } from "./reports.ts";
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
// These two settings are optional runtime overrides for the Supabase Edge Function.
const optionalServerEnv = (...parts: string[]) => Deno.env.get(parts.join("_"));
const TELEGRAM_WEBHOOK_SECRET = optionalServerEnv("TELEGRAM", "WEBHOOK", "SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_SECRET_KEYS = Deno.env.get("SUPABASE_SECRET_KEYS");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const MAX_VOICE_BYTES = 20 * 1024 * 1024;
const MANAGER_CHAT_IDS = new Set(
  (optionalServerEnv("TELEGRAM", "MANAGER", "CHAT", "IDS") || "")
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
    voice?: {
      file_id?: string;
      file_unique_id?: string;
      duration?: number;
      mime_type?: string;
      file_size?: number;
    };
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

type AdminIntent =
  | "active_players"
  | "coaches"
  | "staff"
  | "teams"
  | "parents"
  | "unpaid_subscriptions"
  | "expiring_subscriptions"
  | "revenue"
  | "attendance"
  | "registrations"
  | "matches" | "trainings" | "evaluations" | "tournaments" | "overview" | "expenses" | "subscriptions"
  | "unknown";

type AdminPeriod = "today" | "yesterday" | "this_week" | "this_month" | "last_month" | "next_7_days" | "all";

type ParsedAdminQuestion = { intent: AdminIntent; period: AdminPeriod };

const ADMIN_INTENTS = new Set<AdminIntent>([
  "active_players", "coaches", "staff", "teams", "parents", "unpaid_subscriptions",
  "expiring_subscriptions", "revenue", "attendance", "registrations", "matches", "trainings", "evaluations", "tournaments", "overview", "expenses", "subscriptions", "unknown",
]);
const ADMIN_PERIODS = new Set<AdminPeriod>([
  "today", "yesterday", "this_week", "this_month", "last_month", "next_7_days", "all",
]);

function inferPeriod(text: string): AdminPeriod {
  const value = normalize(text);
  if (value.includes("أمس") || value.includes("امس") || value.includes("البارح")) return "yesterday";
  if (value.includes("الشهر الماضي") || value.includes("الشهر اللي فات")) return "last_month";
  if (value.includes("هذا الشهر") || value.includes("الشهر الحالي")) return "this_month";
  if (value.includes("هذا الأسبوع") || value.includes("هذا الاسبوع") || value.includes("الأسبوع الحالي")) return "this_week";
  if (value.includes("أسبوع") || value.includes("اسبوع") || value.includes("7 أيام") || value.includes("سبعة أيام")) return "next_7_days";
  if (value.includes("اليوم")) return "today";
  return "all";
}

function deterministicAdminIntent(text: string): ParsedAdminQuestion | null {
  const value = normalize(text);
  const period = inferPeriod(value);
  if (value.includes("مدرب") || value.includes("مدربين") || value.includes("مدربون")) return { intent: "coaches", period: "all" };
  if (value.includes("موظف") || value.includes("موظفين") || value.includes("طاقم")) return { intent: "staff", period: "all" };
  if (value.includes("فريق") || value.includes("فرق")) return { intent: "teams", period: "all" };
  if (value.includes("ولي أمر") || value.includes("اولياء") || value.includes("أولياء") || value.includes("أهالي")) return { intent: "parents", period: "all" };
  if (value.includes("لاعب") || value.includes("لاعبين") || value.includes("لاعبون")) return { intent: "active_players", period: "all" };
  if (value.includes("حضور") || value.includes("غياب") || value.includes("غائب") || value.includes("حاضر")) return { intent: "attendance", period: period === "all" ? "today" : period };
  if (value.includes("تسجيل") || value.includes("طلبات") || value.includes("طلب جديد")) return { intent: "registrations", period: period === "all" ? "today" : period };
  if ((value.includes("دخل") || value.includes("إيراد") || value.includes("ايراد") || value.includes("مبيعات")) && !value.includes("اشتراك")) {
    return { intent: "revenue", period: period === "all" ? "today" : period };
  }
  if (value.includes("اشتراك") && (value.includes("غير مدفوع") || value.includes("ما دفع") || value.includes("لم يدفع"))) {
    return { intent: "unpaid_subscriptions", period: "all" };
  }
  if (value.includes("اشتراك") && (value.includes("ينتهي") || value.includes("تنتهي") || value.includes("انتهاء") || value.includes("منته"))) {
    return { intent: "expiring_subscriptions", period: period === "all" ? "next_7_days" : period };
  }
  return null;
}

async function classifyAdminQuestion(text: string): Promise<ParsedAdminQuestion> {
  const deterministic = deterministicAdminIntent(text);
  if (deterministic) return deterministic;
  if (!OPENAI_API_KEY) return { intent: "unknown", period: "all" };

  const prompt = [
    "صنّف سؤال مدير أكاديمية رياضية إلى مقصد واحد وفترة زمنية.",
    "المقاصد المسموحة فقط: active_players, coaches, staff, teams, parents, unpaid_subscriptions, expiring_subscriptions, revenue, attendance, registrations, matches, trainings, evaluations, tournaments, overview, expenses, subscriptions, unknown.",
    "الفترات المسموحة فقط: today, yesterday, this_week, this_month, last_month, next_7_days, all.",
    "لا تنشئ SQL ولا أوامر ولا أسماء جداول. أرجع JSON فقط بالشكل: {\"intent\":\"...\",\"period\":\"...\"}.",
    "إذا لم يذكر المستخدم فترة: revenue/attendance/registrations = today، expiring_subscriptions = next_7_days، والبقية = all.",
  ].join("\n");

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.6-luna",
        instructions: prompt,
        input: text.slice(0, 1000),
        max_output_tokens: 120,
      }),
    });
    if (!response.ok) {
      console.error("Admin intent classification failed", response.status);
      return { intent: "unknown", period: "all" };
    }
    const data = await response.json();
    const outputText = Array.isArray(data?.output)
      ? data.output.flatMap((item: { content?: Array<{ type?: string; text?: string }> }) => item.content || [])
        .find((part: { type?: string; text?: string }) => part.type === "output_text")?.text
      : undefined;
    if (typeof outputText !== "string") return { intent: "unknown", period: "all" };
    const match = outputText.match(/\{[\s\S]*\}/);
    if (!match) return { intent: "unknown", period: "all" };
    const parsed = JSON.parse(match[0]) as { intent?: string; period?: string };
    const intent = ADMIN_INTENTS.has(parsed.intent as AdminIntent) ? parsed.intent as AdminIntent : "unknown";
    const period = ADMIN_PERIODS.has(parsed.period as AdminPeriod) ? parsed.period as AdminPeriod : "all";
    return { intent, period };
  } catch {
    return { intent: "unknown", period: "all" };
  }
}

function isoDateShift(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function adminDateRange(period: AdminPeriod): { start: string; end: string } | null {
  const today = bahrainDate();
  if (period === "all") return null;
  if (period === "today") return { start: today, end: today };
  if (period === "yesterday") {
    const yesterday = isoDateShift(today, -1);
    return { start: yesterday, end: yesterday };
  }
  if (period === "next_7_days") return { start: isoDateShift(today, 1), end: isoDateShift(today, 7) };

  const current = new Date(`${today}T12:00:00Z`);
  if (period === "this_week") {
    const day = current.getUTCDay();
    return { start: isoDateShift(today, -day), end: today };
  }
  if (period === "this_month") return { start: `${today.slice(0, 8)}01`, end: today };

  const firstThisMonth = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1, 12));
  const lastPrevMonth = new Date(firstThisMonth.getTime() - 86_400_000);
  const startPrevMonth = new Date(Date.UTC(lastPrevMonth.getUTCFullYear(), lastPrevMonth.getUTCMonth(), 1, 12));
  return {
    start: startPrevMonth.toISOString().slice(0, 10),
    end: lastPrevMonth.toISOString().slice(0, 10),
  };
}

function periodLabel(period: AdminPeriod): string {
  return ({
    today: "اليوم",
    yesterday: "أمس",
    this_week: "هذا الأسبوع",
    this_month: "هذا الشهر",
    last_month: "الشهر الماضي",
    next_7_days: "خلال 7 أيام القادمة",
    all: "الإجمالي",
  } as Record<AdminPeriod, string>)[period];
}

async function telegramVoiceToText(voice: NonNullable<NonNullable<TelegramUpdate["message"]>["voice"]>): Promise<string> {
  if (!TELEGRAM_BOT_TOKEN) throw new Error("telegram_bot_token_missing");
  if (!OPENAI_API_KEY) throw new Error("voice_transcription_not_configured");
  if (!voice.file_id) throw new Error("voice_file_id_missing");
  if (voice.file_size && voice.file_size > MAX_VOICE_BYTES) throw new Error("voice_file_too_large");

  const fileInfoResponse = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(voice.file_id)}`,
  );
  const fileInfo = await fileInfoResponse.json();
  const filePath = fileInfo?.result?.file_path;
  if (!fileInfoResponse.ok || !fileInfo?.ok || typeof filePath !== "string") {
    throw new Error("telegram_get_file_failed");
  }

  const audioResponse = await fetch(
    `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`,
  );
  if (!audioResponse.ok) throw new Error("telegram_voice_download_failed");
  const audioBlob = await audioResponse.blob();
  if (audioBlob.size > MAX_VOICE_BYTES) throw new Error("voice_file_too_large");

  const form = new FormData();
  form.append("file", audioBlob, "telegram-voice.ogg");
  form.append("model", "gpt-4o-mini-transcribe");
  form.append("language", "ar");
  form.append(
    "prompt",
    "محادثة إدارية باللهجة البحرينية أو الخليجية عن الأكاديمية: ملخص اليوم، الدفعات، الاشتراكات، اللاعبين، الحضور والإدارة.",
  );

  const transcriptionResponse = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
  });
  const transcription = await transcriptionResponse.json();
  if (!transcriptionResponse.ok || typeof transcription?.text !== "string") {
    console.error("Voice transcription failed", transcriptionResponse.status);
    throw new Error("voice_transcription_failed");
  }

  const text = transcription.text.trim();
  if (!text) throw new Error("voice_transcription_empty");
  return text;
}

async function sendMessage(chatId: number, text: string) {
  for (const chunk of splitMessages(text)) await sendMessageChunk(chatId, chunk);
}

async function sendMessageChunk(chatId: number, text: string) {
  if (!TELEGRAM_BOT_TOKEN) throw new Error("telegram_bot_token_missing");
  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
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
    const paramName = key.replace(/_(gte|lte|gt|lt)$/, "");
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
      Prefer: "count=exact",
    },
  });
  if (!response.ok) {
    console.error("Telegram REST rows failed", table, response.status);
    throw new Error(`rest_rows_failed_${response.status}`);
  }
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error("invalid_rest_response");
  const rows = data as T[] & { total?: number };
  const totalText = response.headers.get("content-range")?.split("/")[1];
  if (totalText && totalText !== "*" && Number.isFinite(Number(totalText))) rows.total = Number(totalText);
  return rows;
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
  const textMessage = update.message?.text;
  const voiceMessage = update.message?.voice;

  if (typeof chatId !== "number" || (typeof textMessage !== "string" && !voiceMessage?.file_id)) {
    return Response.json({ ok: true });
  }

  // Manager information is intentionally limited to direct chats.
  if (chatType !== "private") {
    await sendMessage(chatId, "استخدم البوت في محادثة خاصة فقط.");
    return Response.json({ ok: true });
  }

  if (typeof textMessage === "string" && normalize(textMessage) === "/whoami") {
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

  let incomingText = textMessage || "";
  if (voiceMessage?.file_id) {
    try {
      incomingText = await telegramVoiceToText(voiceMessage);
      await sendMessage(chatId, `🎙️ فهمت طلبك: «${incomingText.slice(0, 500)}»`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "voice_transcription_failed";
      console.error("Telegram voice handling failed", message);
      if (message === "voice_transcription_not_configured") {
        await sendMessage(chatId, "ميزة الرسائل الصوتية جاهزة برمجيًا، لكنها تحتاج تفعيل مفتاح تحويل الصوت إلى نص على الخادم.");
      } else if (message === "voice_file_too_large") {
        await sendMessage(chatId, "الرسالة الصوتية كبيرة جدًا. أرسل مقطعًا أقصر.");
      } else {
        await sendMessage(chatId, "لم أستطع فهم الرسالة الصوتية هذه المرة. جرّب إرسالها مرة أخرى أو اكتب الطلب.");
      }
      return Response.json({ ok: false }, { status: 200 });
    }
  }

  try {
    // Authorization above applies equally to names, payments, text and voice reports.
    if (!isHelpCommand(incomingText)) {
      const today = bahrainDate();
      let request = reportRequest(incomingText, today);
      if (!request) {
        const classification = await classifyAdminQuestion(incomingText);
        request = reportRequest(incomingText, today, classification);
      }
      if (request) {
        await sendMessage(chatId, await detailedReport(request, restRows));
        return Response.json({ ok: true });
      }
      await sendMessage(chatId, "لم أستطع تحديد تقرير موثوق لهذا السؤال. أستطيع قراءة تفاصيل اليوم والمباريات والتدريبات والدفعات والمصروفات والاشتراكات واللاعبين والفرق والطاقم والحضور والتسجيل والتقييمات والبطولات. اذكر الموضوع والتاريخ بصيغة YYYY-MM-DD. التعديل والحذف غير متاحين من البوت.");
      return Response.json({ ok: true });
    }
    if (isHelpCommand(incomingText)) {
      await sendMessage(
        chatId,
        [
          "مساعد Shooter Academy الإداري:",
          "اسألني كتابة أو صوتًا عن:",
          "• اللاعبين والمدربين والموظفين والفرق",
          "• الاشتراكات غير المدفوعة والقريبة من الانتهاء",
          "• الإيرادات اليوم أو هذا الأسبوع أو هذا الشهر",
          "• الحضور والغياب",
          "• طلبات التسجيل الجديدة",
          "• ملخص اليوم أو تفاصيل اليوم، بما فيها المباريات والتدريبات",
          "• تفاصيل دفعات اليوم، تقييمات اللاعبين، والبطولات",
          "• تحديد تاريخ YYYY-MM-DD أو أمس أو غدًا؛ وللمزيد أضف صفحة 2",
          "",
          "أمثلة: «كم مدرب عندنا؟» — «كم دخلنا هذا الشهر؟» — «كم غياب أمس؟»",
          "",
          "المساعد حاليًا للقراءة فقط. أي تعديل إداري يحتاج مسار تأكيد منفصل.",
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
        .filter((row) => String(row.type).toLowerCase() === "revenue")
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
      const revenues = rows.filter((row) => String(row.type).toLowerCase() === "revenue");
      const total = revenues.reduce((sum, row) => sum + Number(row.amount || 0), 0);

      await sendMessage(
        chatId,
        [
          `دفعات اليوم — ${today}`,
          `عدد عمليات الإيراد: ${revenues.length}`,
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

    const parsedQuestion = await classifyAdminQuestion(incomingText);
    const range = adminDateRange(parsedQuestion.period);

    if (parsedQuestion.intent === "active_players") {
      const count = await restCount("players", { status: "eq.active" });
      await sendMessage(chatId, `عدد اللاعبين النشطين: ${count}`);
      return Response.json({ ok: true });
    }

    if (parsedQuestion.intent === "coaches") {
      const count = await restCount("staff", { role: "eq.coach", status: "eq.active" });
      await sendMessage(chatId, `عدد المدربين النشطين: ${count}`);
      return Response.json({ ok: true });
    }

    if (parsedQuestion.intent === "staff") {
      const count = await restCount("staff", { status: "eq.active" });
      await sendMessage(chatId, `عدد الموظفين النشطين: ${count}`);
      return Response.json({ ok: true });
    }

    if (parsedQuestion.intent === "teams") {
      const count = await restCount("teams", {});
      await sendMessage(chatId, `عدد الفرق: ${count}`);
      return Response.json({ ok: true });
    }

    if (parsedQuestion.intent === "parents") {
      const count = await restCount("parents", {});
      await sendMessage(chatId, `عدد حسابات أولياء الأمور: ${count}`);
      return Response.json({ ok: true });
    }

    if (parsedQuestion.intent === "unpaid_subscriptions") {
      const count = await restCount("subscriptions", { status: "eq.unpaid" });
      await sendMessage(chatId, `الاشتراكات غير المدفوعة: ${count}`);
      return Response.json({ ok: true });
    }

    if (parsedQuestion.intent === "expiring_subscriptions") {
      const effectiveRange = range || adminDateRange("next_7_days")!;
      const count = await restCount("subscriptions", {
        end_date_gte: `gte.${effectiveRange.start}`,
        end_date_lte: `lte.${effectiveRange.end}`,
      });
      await sendMessage(chatId, `الاشتراكات التي تنتهي ${periodLabel(parsedQuestion.period === "all" ? "next_7_days" : parsedQuestion.period)}: ${count}`);
      return Response.json({ ok: true });
    }

    if (parsedQuestion.intent === "revenue") {
      const effectiveRange = range || adminDateRange("today")!;
      const rows = await restRows<{ amount?: number | string; type?: string }>("transactions", {
        select: "amount,type",
        transaction_date_gte: `gte.${effectiveRange.start}`,
        transaction_date_lte: `lte.${effectiveRange.end}`,
      });
      const revenues = rows.filter((row) => String(row.type).toLowerCase() === "revenue");
      const total = revenues.reduce((sum, row) => sum + Number(row.amount || 0), 0);
      await sendMessage(chatId, [
        `الإيرادات — ${periodLabel(parsedQuestion.period === "all" ? "today" : parsedQuestion.period)}`,
        `عدد العمليات: ${revenues.length}`,
        `الإجمالي: ${formatMoney(total)} د.ب`,
      ].join("\n"));
      return Response.json({ ok: true });
    }

    if (parsedQuestion.intent === "attendance") {
      const effectiveRange = range || adminDateRange("today")!;
      const rows = await restRows<{ status?: string }>("attendance", {
        select: "status",
        session_date_gte: `gte.${effectiveRange.start}`,
        session_date_lte: `lte.${effectiveRange.end}`,
      });
      const present = rows.filter((row) => ["present", "حاضر"].includes(String(row.status).toLowerCase())).length;
      const absent = rows.filter((row) => ["absent", "غائب"].includes(String(row.status).toLowerCase())).length;
      await sendMessage(chatId, [
        `الحضور — ${periodLabel(parsedQuestion.period === "all" ? "today" : parsedQuestion.period)}`,
        `سجلات الحضور: ${rows.length}`,
        `حاضر: ${present}`,
        `غائب: ${absent}`,
      ].join("\n"));
      return Response.json({ ok: true });
    }

    if (parsedQuestion.intent === "registrations") {
      const effectiveRange = range || adminDateRange("today")!;
      const rows = await restRows<{ status?: string }>("registration_applications", {
        select: "status",
        submitted_at_gte: `gte.${effectiveRange.start}T00:00:00+03:00`,
        submitted_at_lte: `lte.${effectiveRange.end}T23:59:59+03:00`,
      });
      const pending = rows.filter((row) => String(row.status).toLowerCase() === "pending").length;
      await sendMessage(chatId, [
        `طلبات التسجيل — ${periodLabel(parsedQuestion.period === "all" ? "today" : parsedQuestion.period)}`,
        `إجمالي الطلبات: ${rows.length}`,
        `بانتظار المراجعة: ${pending}`,
      ].join("\n"));
      return Response.json({ ok: true });
    }

    await sendMessage(
      chatId,
      "اسألني عن اللاعبين، المدربين، الموظفين، الفرق، الاشتراكات، الإيرادات، الحضور أو طلبات التسجيل. يمكنك السؤال كتابةً أو صوتًا.",
    );
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && ['invalid_report_date', 'invalid_report_page'].includes(error.message)) {
      await sendMessage(chatId, "حدد تاريخًا صحيحًا بصيغة YYYY-MM-DD وفترة نهايتها بعد بدايتها، ورقم صفحة بين 1 و1000.");
      return Response.json({ ok: false });
    }
    const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code || "unknown") : "unknown";
    console.error("Telegram manager query failed", code);
    await sendMessage(chatId, "تعذر جلب البيانات الآن. حاول مرة أخرى بعد قليل.");
    return Response.json({ ok: false }, { status: 500 });
  }
});

