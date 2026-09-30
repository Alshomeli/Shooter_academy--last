import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
// These two settings are optional runtime overrides for the Supabase Edge Function.
const optionalServerEnv = (...parts: string[]) => Deno.env.get(parts.join("_"));
const TELEGRAM_WEBHOOK_SECRET = optionalServerEnv("TELEGRAM", "WEBHOOK", "SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SUPABASE_SECRET_KEYS = Deno.env.get("SUPABASE_SECRET_KEYS");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const TELEGRAM_DISPATCH_SECRET = optionalServerEnv("TELEGRAM", "DISPATCH", "SECRET");
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
  callback_query?: {
    id?: string;
    from?: { id?: number; is_bot?: boolean; first_name?: string };
    data?: string;
    message?: {
      message_id?: number;
      chat?: { id?: number; type?: string };
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
  return ["/summary", "summary", "ملخص", "ملخص اليوم", "تفاصيل اليوم", "شنو صار اليوم", "شو صار اليوم", "ماذا حصل اليوم", "ماذا حدث اليوم"].includes(value)
    || value.includes("ملخص")
    || (value.includes("اليوم") && (
      value.includes("تفاصيل")
      || value.includes("شنو صار")
      || value.includes("شو صار")
      || value.includes("وش صار")
      || value.includes("ماذا حصل")
      || value.includes("ماذا حدث")
      || value.includes("ايش صار")
    ));
}

function wantsDetailedSummary(text: string): boolean {
  const value = normalize(text);
  return value.includes("تفاصيل")
    || value.includes("بالتفصيل")
    || value.includes("شنو صار")
    || value.includes("شو صار")
    || value.includes("وش صار")
    || value.includes("ماذا حصل")
    || value.includes("ماذا حدث")
    || value.includes("ايش صار");
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
  | "staff_applications"
  | "matches"
  | "trainings"
  | "payment_proofs"
  | "staff_documents"
  | "unknown";

type AdminPeriod = "today" | "yesterday" | "this_week" | "this_month" | "last_month" | "next_7_days" | "all";

type ParsedAdminQuestion = { intent: AdminIntent; period: AdminPeriod };

const ADMIN_INTENTS = new Set<AdminIntent>([
  "active_players", "coaches", "staff", "teams", "parents", "unpaid_subscriptions",
  "expiring_subscriptions", "revenue", "attendance", "registrations", "staff_applications", "matches", "trainings", "payment_proofs", "staff_documents", "unknown",
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
  if ((value.includes("إثبات") || value.includes("اثبات") || value.includes("تحويل")) && (value.includes("دفع") || value.includes("دفعة") || value.includes("دفعات"))) return { intent: "payment_proofs", period: "all" };
  if ((value.includes("شهادة") || value.includes("شهادات") || value.includes("رخصة") || value.includes("رخص")) && (value.includes("مدرب") || value.includes("موظف") || value.includes("طاقم") || value.includes("منته"))) return { intent: "staff_documents", period: "all" };
  if ((value.includes("طلب") || value.includes("طلبات") || value.includes("انضمام")) && (value.includes("مدرب") || value.includes("موظف") || value.includes("مدير") || value.includes("طاقم"))) return { intent: "staff_applications", period: period === "all" ? "today" : period };
  if (value.includes("مدرب") || value.includes("مدربين") || value.includes("مدربون")) return { intent: "coaches", period: "all" };
  if (value.includes("موظف") || value.includes("موظفين") || value.includes("طاقم")) return { intent: "staff", period: "all" };
  if (value.includes("فريق") || value.includes("فرق")) return { intent: "teams", period: "all" };
  if (value.includes("ولي أمر") || value.includes("اولياء") || value.includes("أولياء") || value.includes("أهالي")) return { intent: "parents", period: "all" };
  if (value.includes("لاعب") || value.includes("لاعبين") || value.includes("لاعبون")) return { intent: "active_players", period: "all" };
  if (value.includes("مباراة") || value.includes("مباريات") || value.includes("ماتش")) return { intent: "matches", period: period === "all" ? "today" : period };
  if (value.includes("تدريب") || value.includes("تمرين") || value.includes("تمارين") || value.includes("حصة")) return { intent: "trainings", period: period === "all" ? "today" : period };
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
    "المقاصد المسموحة فقط: active_players, coaches, staff, teams, parents, unpaid_subscriptions, expiring_subscriptions, revenue, attendance, registrations, staff_applications, matches, trainings, payment_proofs, staff_documents, unknown.",
    "الفترات المسموحة فقط: today, yesterday, this_week, this_month, last_month, next_7_days, all.",
    "لا تنشئ SQL ولا أوامر ولا أسماء جداول. أرجع JSON فقط بالشكل: {\"intent\":\"...\",\"period\":\"...\"}.",
    "إذا لم يذكر المستخدم فترة: revenue/attendance/registrations/staff_applications = today، expiring_subscriptions = next_7_days، payment_proofs/staff_documents = all، والبقية = all.",
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

type InlineKeyboard = { inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> };

async function sendMessage(chatId: number, text: string, replyMarkup?: InlineKeyboard) {
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
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    },
  );
  if (!response.ok) {
    console.error("Telegram sendMessage failed", response.status);
    throw new Error("telegram_send_failed");
  }
}

async function answerCallbackQuery(callbackQueryId: string, text: string) {
  if (!TELEGRAM_BOT_TOKEN) throw new Error("telegram_bot_token_missing");
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackQueryId, text: text.slice(0, 180), show_alert: false }),
  });
}

async function rpc<T>(functionName: string, body: Record<string, unknown>): Promise<T> {
  if (!SUPABASE_URL) throw new Error("supabase_url_unavailable");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: serverApiKey(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    console.error("Telegram RPC failed", functionName, response.status);
    throw new Error(`rpc_failed_${response.status}`);
  }
  return payload as T;
}

async function rememberAuthorizedManagerChat(chatId: number) {
  const chatHash = await sha256Hex(String(chatId));
  try {
    await rpc<boolean>("telegram_register_manager_chat", { p_chat_id_hash: chatHash, p_chat_id: chatId });
  } catch (error) {
    console.error("Telegram manager chat persistence failed", error instanceof Error ? error.message : "unknown");
  }
}

type TelegramIdentity = { user_id?: string; role?: "manager" | "coach"; staff_id?: string | null; parent_id?: string | null; display_name?: string };

async function linkedTelegramIdentity(chatId: number): Promise<TelegramIdentity | null> {
  try {
    const rows = await rpc<TelegramIdentity[]>("telegram_identity", { p_chat_id: chatId });
    return rows?.[0] || null;
  } catch {
    return null;
  }
}

async function sendCoachToday(chatId: number, identity: TelegramIdentity) {
  const today = bahrainDate();
  await rpc<number>("telegram_ensure_today_trainings", { p_chat_id: chatId });
  const teams = await restRows<{ id?: string; name?: string; training_time?: string }>("teams", {
    select: "id,name,training_time", coach_id: `eq.${identity.staff_id || ""}`, order: "name.asc",
  });
  const teamIds = teams.map((t) => t.id).filter(Boolean) as string[];
  if (!teamIds.length) {
    await sendMessage(chatId, "لا يوجد فريق مرتبط بحسابك كمدرب حاليًا.");
    return;
  }
  const trainings = await restRows<{ id?: string; team_id?: string; title?: string; duration_minutes?: number }>("trainings", {
    select: "id,team_id,title,duration_minutes", session_date: `eq.${today}`, order: "created_at.asc",
  });
  const mine = trainings.filter((t) => t.team_id && teamIds.includes(t.team_id));
  if (!mine.length) {
    await sendMessage(chatId, `كابتن ${identity.display_name || ""}، لا توجد حصة تدريب مسجلة لك اليوم (${today}).`);
    return;
  }
  for (const training of mine) {
    const team = teams.find((t) => t.id === training.team_id);
    const players = await restRows<{ id?: string; name?: string; jersey_number?: number }>("players", {
      select: "id,name,jersey_number", team_id: `eq.${training.team_id || ""}`, status: "eq.active", order: "name.asc",
    });
    await sendMessage(chatId, [
      `🏃 حصة اليوم — ${team?.name || "الفريق"}`,
      `${training.title || "تدريب"}${team?.training_time ? ` — ${team.training_time}` : ""}`,
      `عدد اللاعبين: ${players.length}`,
      "اختر حالة كل لاعب:",
    ].join("\n"));
    for (const player of players.slice(0, 30)) {
      if (!training.id || !player.id) continue;
      await sendMessage(chatId, `${player.name || "لاعب"}${player.jersey_number ? ` #${player.jersey_number}` : ""}`, {
        inline_keyboard: [[
          { text: "✅ حضر", callback_data: `att:p:${training.id}:${player.id}` },
          { text: "❌ غاب", callback_data: `att:a:${training.id}:${player.id}` },
          { text: "🟡 بعذر", callback_data: `att:e:${training.id}:${player.id}` },
        ]],
      });
    }
  }
}

async function sendTelegramAccountId(chatId: number, identity: TelegramIdentity) {
  if (!identity.user_id) return;
  const rows = await restRows<{ telegram_user_code?: string; role?: string }>("telegram_user_links", {
    select: "telegram_user_code,role", user_id: `eq.${identity.user_id}`, is_active: "eq.true", limit: "1",
  });
  const code = rows[0]?.telegram_user_code;
  await sendMessage(chatId, code
    ? `معرّف Telegram الداخلي: ${code}\nنوع الحساب: ${identity.role === "manager" ? "مدير" : "مدرب"}\nهذا المعرّف للتعريف والمتابعة فقط ولا يمنح صلاحية بمفرده.`
    : "الحساب مرتبط، لكن تعذر قراءة المعرّف الداخلي الآن.");
}

async function sendCoachAttendanceSummary(chatId: number, identity: TelegramIdentity) {
  const today = bahrainDate();
  await rpc<number>("telegram_ensure_today_trainings", { p_chat_id: chatId });
  const teams = await restRows<{ id?: string; name?: string }>("teams", { select: "id,name", coach_id: `eq.${identity.staff_id || ""}`, order: "name.asc" });
  const teamIds = teams.map(t => t.id).filter(Boolean) as string[];
  const trainings = await restRows<{ id?: string; team_id?: string }>("trainings", { select: "id,team_id", session_date: `eq.${today}` });
  const trainingIds = trainings.filter(t => t.team_id && teamIds.includes(t.team_id)).map(t => t.id).filter(Boolean) as string[];
  if (!trainingIds.length) { await sendMessage(chatId, "لا توجد حصة تخص فرقك اليوم."); return; }
  const rows = await restRows<{ player_id?: string; status?: string; training_id?: string }>("attendance", { select: "player_id,status,training_id", session_date: `eq.${today}` });
  const mine = rows.filter(r => r.training_id && trainingIds.includes(r.training_id));
  const present = mine.filter(r=>r.status==="present").length, absent=mine.filter(r=>r.status==="absent").length, excused=mine.filter(r=>r.status==="excused").length;
  await sendMessage(chatId, `📊 حضور اليوم لفرقك\n✅ حضر: ${present}\n❌ غاب: ${absent}\n🟡 بعذر: ${excused}\n📝 تم تسجيل حالة ${mine.length} لاعب حتى الآن.`);
}

async function sendCoachUpcoming(chatId: number, identity: TelegramIdentity) {
  const today=bahrainDate(), end=bahrainDate(7);
  const teams=await restRows<{id?:string;name?:string;training_days?:string[];training_time?:string}>("teams",{select:"id,name,training_days,training_time",coach_id:`eq.${identity.staff_id||""}`,order:"name.asc"});
  if(!teams.length){await sendMessage(chatId,"لا يوجد فريق مرتبط بحسابك.");return;}
  await sendMessage(chatId,["📅 جدول فرقك:",...teams.map(t=>`• ${t.name||"فريق"} — ${(t.training_days||[]).join("، ")||"الأيام غير محددة"}${t.training_time?` — ${t.training_time}`:""}`),`\nالفترة المرجعية: ${today} إلى ${end}`].join("\n"));
}

async function configuredManagerChats(): Promise<number[]> {
  const configured = Array.from(MANAGER_CHAT_IDS)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  try {
    const stored = await rpc<Array<{ chat_id?: number | string }>>("telegram_manager_chat_ids", {});
    for (const row of stored || []) {
      const value = Number(row.chat_id);
      if (Number.isFinite(value)) configured.push(value);
    }
  } catch (error) {
    console.error("Telegram manager chat lookup failed", error instanceof Error ? error.message : "unknown");
  }
  return Array.from(new Set(configured));
}

async function deliverPendingRegistrationNotifications() {
  const managerChats = await configuredManagerChats();
  if (managerChats.length === 0) return { delivered: 0, waitingForManagerChatRegistration: true };

  const rows = await rpc<Array<{ application_id: string; parent_full_name?: string; submitted_at?: string }>>(
    "telegram_claim_registration_notifications",
    { p_limit: 10 },
  );

  let delivered = 0;
  for (const row of rows || []) {
    try {
      for (const chatId of managerChats) {
        if (!(await isAuthorizedManagerChat(chatId))) continue;
        await sendMessage(
          chatId,
          `🆕 طلب تسجيل جديد
ولي الأمر: ${row.parent_full_name || "غير محدد"}
تاريخ الإرسال: ${row.submitted_at || "غير محدد"}`,
          {
            inline_keyboard: [[
              { text: "✅ موافقة", callback_data: `reg:approve:${row.application_id}` },
              { text: "👀 مراجعة في الموقع", callback_data: `reg:review:${row.application_id}` },
            ]],
          },
        );
      }
      await rpc<void>("telegram_finish_registration_notification", {
        p_application_id: row.application_id,
        p_success: true,
        p_error: null,
      });
      delivered += 1;
    } catch (error) {
      await rpc<void>("telegram_finish_registration_notification", {
        p_application_id: row.application_id,
        p_success: false,
        p_error: error instanceof Error ? error.message : "delivery_failed",
      });
    }
  }
  const staffRows = await rpc<Array<{ application_id: string; full_name?: string; requested_role?: string; submitted_at?: string }>>(
    "telegram_claim_staff_application_notifications",
    { p_limit: 10 },
  );
  let staffDelivered = 0;
  for (const row of staffRows || []) {
    try {
      for (const chatId of managerChats) {
        if (!(await isAuthorizedManagerChat(chatId))) continue;
        const roleLabel = row.requested_role === "manager" ? "مدير" : row.requested_role === "coach" ? "مدرب" : row.requested_role === "accountant" ? "محاسب" : row.requested_role === "receptionist" ? "استقبال" : (row.requested_role || "موظف");
        await sendMessage(
          chatId,
          `🆕 طلب انضمام جديد
الاسم: ${row.full_name || "غير محدد"}
الصفة المطلوبة: ${roleLabel}
تاريخ الإرسال: ${row.submitted_at || "غير محدد"}`,
          {
            inline_keyboard: [[
              { text: "✅ موافقة", callback_data: `staff:approve:${row.application_id}` },
              { text: "👀 مراجعة في الموقع", callback_data: `staff:review:${row.application_id}` },
            ]],
          },
        );
      }
      await rpc<void>("telegram_finish_staff_application_notification", {
        p_application_id: row.application_id, p_success: true, p_error: null,
      });
      staffDelivered += 1;
    } catch (error) {
      await rpc<void>("telegram_finish_staff_application_notification", {
        p_application_id: row.application_id, p_success: false,
        p_error: error instanceof Error ? error.message : "delivery_failed",
      });
    }
  }
  return { delivered, staffDelivered, waitingForManagerChatRegistration: false };
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
  const providedDispatchSecret = req.headers.get("X-Shooter-Dispatch-Secret");
  const telegramWebhookAuthorized = await isAuthorizedWebhookSecret(providedSecret);
  const dispatchAuthorized = Boolean(
    TELEGRAM_DISPATCH_SECRET
    && providedDispatchSecret
    && TELEGRAM_DISPATCH_SECRET === providedDispatchSecret
  );
  if (!telegramWebhookAuthorized && !dispatchAuthorized) {
    return new Response("Unauthorized", { status: 401 });
  }

  let rawPayload: unknown;
  try {
    rawPayload = await req.json();
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (
    typeof rawPayload === "object" && rawPayload !== null
    && "action" in rawPayload
    && (rawPayload as { action?: unknown }).action === "flush_registration_notifications"
  ) {
    if (!dispatchAuthorized && !telegramWebhookAuthorized) {
      return new Response("Unauthorized", { status: 401 });
    }
    try {
      return Response.json({ ok: true, ...(await deliverPendingRegistrationNotifications()) });
    } catch (error) {
      console.error("Telegram notification flush failed", error instanceof Error ? error.message : "unknown");
      return Response.json({ ok: false }, { status: 500 });
    }
  }

  if (!telegramWebhookAuthorized) {
    return new Response("Unauthorized", { status: 401 });
  }

  const update = rawPayload as TelegramUpdate;

  const callback = update.callback_query;
  if (callback?.id && callback.message?.chat?.id && callback.data) {
    const callbackChatId = callback.message.chat.id;
    const callbackChatType = callback.message.chat.type;
    if (callbackChatType !== "private") {
      await answerCallbackQuery(callback.id, "استخدم البوت في محادثة خاصة.");
      return Response.json({ ok: true });
    }

    const linkedIdentity = await linkedTelegramIdentity(callbackChatId);
    const attendanceMatch = callback.data.match(/^att:([pae]):([^:]+):([^:]+)$/);
    if (attendanceMatch) {
      if (linkedIdentity?.role !== "coach") {
        await answerCallbackQuery(callback.id, "هذا الإجراء متاح للمدرب المرتبط فقط.");
        return Response.json({ ok: true });
      }
      const status = attendanceMatch[1] === "p" ? "present" : attendanceMatch[1] === "a" ? "absent" : "excused";
      try {
        await rpc<boolean>("telegram_set_training_attendance", {
          p_chat_id: callbackChatId,
          p_training_id: attendanceMatch[2],
          p_player_id: attendanceMatch[3],
          p_status: status,
        });
        await answerCallbackQuery(callback.id, status === "present" ? "تم تسجيل الحضور ✅" : status === "absent" ? "تم تسجيل الغياب ❌" : "تم التسجيل بعذر 🟡");
      } catch {
        await answerCallbackQuery(callback.id, "تعذر تحديث الحضور. تحقق من أن الحصة تخص فريقك واليوم.");
      }
      return Response.json({ ok: true });
    }

    const managerAuthorized = linkedIdentity?.role === "manager" || await isAuthorizedManagerChat(callbackChatId);
    if (!managerAuthorized) {
      await answerCallbackQuery(callback.id, "غير مصرح بهذا الإجراء.");
      return Response.json({ ok: true });
    }
    await rememberAuthorizedManagerChat(callbackChatId);

    const approveMatch = callback.data.match(/^reg:approve:([0-9a-f-]{36})$/i);
    const reviewMatch = callback.data.match(/^reg:review:([0-9a-f-]{36})$/i);
    const staffApproveMatch = callback.data.match(/^staff:approve:([0-9a-f-]{36})$/i);
    const staffReviewMatch = callback.data.match(/^staff:review:([0-9a-f-]{36})$/i);

    if (staffApproveMatch) {
      try {
        const chatHash = await sha256Hex(String(callbackChatId));
        const result = await rpc<{
          success?: boolean; alreadyProcessed?: boolean; status?: string;
          requestedRole?: string; reviewedByStaffId?: string; reviewedByName?: string;
        }>("telegram_approve_staff_application", {
          p_application_id: staffApproveMatch[1],
          p_chat_id_hash: chatHash,
        });
        if (result?.success) {
          await answerCallbackQuery(callback.id, "تم اعتماد طلب الموظف بنجاح.");
          await sendMessage(callbackChatId, `✅ تم اعتماد طلب الانضمام بواسطة ${result.reviewedByName || "المدير"}.\nالصلاحية: ${result.requestedRole || "موظف"}.`);
        } else {
          let reviewer = result?.reviewedByStaffId || "مدير آخر";
          if (result?.reviewedByStaffId) {
            const staffRows = await restRows<{ name?: string }>("staff", { select: "name", id: `eq.${result.reviewedByStaffId}`, limit: "1" });
            reviewer = staffRows[0]?.name?.trim() || reviewer;
          }
          await answerCallbackQuery(callback.id, "الطلب تمت معالجته مسبقًا.");
          await sendMessage(callbackChatId, `ℹ️ طلب الموظف تمت معالجته مسبقًا. الحالة: ${result?.status || "غير معروفة"}. بواسطة: ${reviewer}.`);
        }
      } catch (error) {
        console.error("Telegram staff approval failed", error instanceof Error ? error.message : "unknown");
        await answerCallbackQuery(callback.id, "تعذر اعتماد طلب الموظف. راجعه في الموقع.");
      }
      return Response.json({ ok: true });
    }

    if (staffReviewMatch) {
      await answerCallbackQuery(callback.id, "راجع الطلب من شاشة الموافقات لإضافة سبب أو طلب تعديل.");
      await sendMessage(callbackChatId, `👀 طلب الموظف ${staffReviewMatch[1]} يحتاج مراجعة من شاشة الموافقات في الموقع.`);
      return Response.json({ ok: true });
    }

    if (approveMatch) {
      try {
        const chatHash = await sha256Hex(String(callbackChatId));
        const result = await rpc<{
          success?: boolean;
          alreadyProcessed?: boolean;
          status?: string;
          reviewedByStaffId?: string;
          reviewedByName?: string;
          nextStep?: string;
        }>("telegram_approve_registration_application", {
          p_application_id: approveMatch[1],
          p_chat_id_hash: chatHash,
        });

        if (result?.success) {
          await answerCallbackQuery(callback.id, "تمت الموافقة بنجاح.");
          await sendMessage(
            callbackChatId,
            `✅ تمت الموافقة على طلب التسجيل بواسطة ${result.reviewedByName || "المدير"}.
بقي تحديد الفريق، المركز ورقم القميص ثم تفعيل اللاعب من الموقع.`,
          );
        } else if (result?.alreadyProcessed) {
          let reviewer = result.reviewedByStaffId || "مدير آخر";
          if (result.reviewedByStaffId) {
            const staffRows = await restRows<{ name?: string }>("staff", {
              select: "name",
              id: `eq.${result.reviewedByStaffId}`,
              limit: "1",
            });
            reviewer = staffRows[0]?.name?.trim() || reviewer;
          }
          await answerCallbackQuery(callback.id, "الطلب تمت معالجته مسبقًا.");
          await sendMessage(
            callbackChatId,
            `ℹ️ هذا الطلب تمت معالجته مسبقًا. الحالة الحالية: ${result.status || "غير معروفة"}. بواسطة: ${reviewer}.`,
          );
        }
      } catch (error) {
        console.error("Telegram registration approval failed", error instanceof Error ? error.message : "unknown");
        await answerCallbackQuery(callback.id, "تعذرت الموافقة. راجع الطلب في الموقع.");
      }
      return Response.json({ ok: true });
    }

    if (reviewMatch) {
      await answerCallbackQuery(callback.id, "راجع الطلب من لوحة التسجيل في الموقع لإضافة الملاحظات أو الرفض.");
      await sendMessage(callbackChatId, `👀 الطلب ${reviewMatch[1]} يحتاج مراجعة من لوحة طلبات التسجيل في الموقع.`);
      return Response.json({ ok: true });
    }

    await answerCallbackQuery(callback.id, "إجراء غير معروف.");
    return Response.json({ ok: true });
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
    await sendMessage(chatId, "لأسباب الخصوصية لا أعرض المعرّفات الرقمية هنا. استخدم رمز الربط من حسابك في المنصة.");
    return Response.json({ ok: true });
  }

  if (typeof textMessage === "string") {
    const linkMatch = textMessage.trim().match(/^\/link\s+([A-Za-z0-9]{6,12})$/i);
    if (linkMatch) {
      try {
        const linked = await rpc<Array<{ user_id?: string; role?: string }>>("telegram_consume_link_code", { p_code: linkMatch[1], p_chat_id: chatId });
        if (!linked?.length) {
          await sendMessage(chatId, "رمز الربط غير صحيح أو انتهت صلاحيته. أنشئ رمزًا جديدًا من حسابك في المنصة.");
        } else {
          const roleLabel = linked[0].role === "manager" ? "مدير" : "مدرب";
          await sendMessage(chatId, `✅ تم ربط Telegram بحسابك بنجاح. نوع الحساب: ${roleLabel}. أرسل /help لرؤية الأدوات المتاحة لك.`);
        }
      } catch {
        await sendMessage(chatId, "تعذر إكمال الربط الآن. أنشئ رمزًا جديدًا وحاول مرة أخرى.");
      }
      return Response.json({ ok: true });
    }
  }

  let telegramIdentity = await linkedTelegramIdentity(chatId);
  if (!telegramIdentity && await isAuthorizedManagerChat(chatId)) {
    telegramIdentity = { role: "manager", display_name: "المدير" };
    await rememberAuthorizedManagerChat(chatId);
  }
  if (!telegramIdentity) {
    await sendMessage(chatId, "هذا الحساب غير مرتبط بالمنصة. من حسابك في Shooter Academy أنشئ رمز ربط Telegram ثم أرسل: /link CODE");
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
    if (telegramIdentity.role === "coach") {
      const value = normalize(incomingText);
      if (isHelpCommand(incomingText)) {
        await sendMessage(chatId, ["مساعد المدرب:", "• /today_class — حصة اليوم وقائمة اللاعبين", "• «قائمة حضور اليوم» — تسجيل حضر/غاب/بعذر بالأزرار", "• «ملخص حضور اليوم» — أعداد الحضور والغياب", "• «جدولي» أو «مواعيد تدريبي» — جدول فرقك", "• /id — معرّف Telegram الداخلي", "يمكنك كتابة الطلب بصيغة طبيعية أو إرساله صوتيًا إذا كانت ميزة الصوت مفعلة."].join("\n"));
        return Response.json({ ok: true });
      }
      if (value === "/id" || value.includes("معرف تيليجرام") || value.includes("معرف telegram")) {
        await sendTelegramAccountId(chatId, telegramIdentity);
        return Response.json({ ok: true });
      }
      if (value.includes("ملخص") && (value.includes("حضور") || value.includes("غياب")) || value.includes("كم حضر") || value.includes("كم غاب")) {
        await sendCoachAttendanceSummary(chatId, telegramIdentity);
        return Response.json({ ok: true });
      }
      if (value === "/schedule" || value.includes("جدولي") || value.includes("مواعيد تدريبي") || value.includes("مواعيد الحصص")) {
        await sendCoachUpcoming(chatId, telegramIdentity);
        return Response.json({ ok: true });
      }
      if (value === "/today_class" || value.includes("حصة اليوم") || value.includes("تدريب اليوم") || (value.includes("قائمة") && value.includes("حضور"))) {
        await sendCoachToday(chatId, telegramIdentity);
        return Response.json({ ok: true });
      }
      await sendMessage(chatId, "اسألني عن حصة اليوم، قائمة الحضور، ملخص الحضور، جدولك، أو أرسل /help.");
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
          "• المباريات والتدريبات",
          "• طلبات التسجيل الجديدة",
          "• ملخص اليوم",
          "",
          "أمثلة: «كم مدرب عندنا؟» — «كم دخلنا هذا الشهر؟» — «كم غياب أمس؟»",
          "",
          "طلبات التسجيل المعلقة يمكن اعتمادها من زر «موافقة»، بينما الرفض أو طلب معلومات إضافية يتم من الموقع مع تسجيل الملاحظات.",
        ].join("\n"),
      );
      return Response.json({ ok: true });
    }

    const today = bahrainDate();

    if (isSummaryCommand(incomingText)) {
      const detailedSummary = wantsDetailedSummary(incomingText);
      const [activePlayers, unpaid, overdueUnpaid, currentUnpaid, expiringToday, paymentRows, matches, trainings, attendanceRows, pendingRegistrations, pendingStaffApplications, pendingPaymentProofs, expiringStaffDocuments, expiredStaffDocuments] = await Promise.all([
        restCount("players", { status: "eq.active" }),
        restCount("subscriptions", { status: "eq.unpaid" }),
        restCount("subscriptions", { status: "eq.unpaid", end_date_lt: `lt.${today}` }),
        restCount("subscriptions", { status: "eq.unpaid", end_date_gte: `gte.${today}` }),
        restCount("subscriptions", { end_date: `eq.${today}` }),
        restRows<{ amount?: number | string; type?: string; category?: string; description?: string }>("transactions", { select: "amount,type,category,description", transaction_date: `eq.${today}`, order: "created_at.asc" }),
        restRows<{ opponent?: string; location?: string; result?: string }>("matches", { select: "opponent,location,result", match_date: `eq.${today}`, order: "created_at.asc" }),
        restRows<{ title?: string; duration_minutes?: number }>("trainings", { select: "title,duration_minutes", session_date: `eq.${today}`, order: "created_at.asc" }),
        restRows<{ status?: string }>("attendance", { select: "status", session_date: `eq.${today}` }),
        restCount("registration_applications", { status: "eq.pending" }),
        restCount("staff_applications", { status: "eq.pending" }),
        restCount("payment_proofs", { status: "eq.pending" }),
        restCount("staff_documents", { document_type: "neq.profile_photo", expiry_date_gte: `gte.${today}`, expiry_date_lte: `lte.${bahrainDate(30)}` }),
        restCount("staff_documents", { document_type: "neq.profile_photo", expiry_date_lt: `lt.${today}` }),
      ]);
      const incomingTotal = paymentRows
        .filter((row) => String(row.type).toLowerCase() === "revenue")
        .reduce((sum, row) => sum + Number(row.amount || 0), 0);

      await sendMessage(
        chatId,
        [
          `ملخص اليوم — ${today}`,
          `اللاعبون النشطون: ${activePlayers}`,
          `اشتراكات غير مدفوعة: ${unpaid} (متأخرة ومنتهية: ${overdueUnpaid} / حالية أو قادمة: ${currentUnpaid})`,
          `اشتراكات تنتهي اليوم: ${expiringToday}`,
          `إيرادات مسجلة اليوم: ${formatMoney(incomingTotal)} د.ب`,
          ...(detailedSummary && paymentRows.length > 0
            ? paymentRows.filter((row) => String(row.type).toLowerCase() === "revenue").slice(0, 10).map((row, index) => `💳 ${index + 1}) ${formatMoney(Number(row.amount || 0))} د.ب — ${row.category || "إيراد"}${row.description ? ` — ${row.description}` : ""}`)
            : []),
          `المباريات اليوم: ${matches.length}`,
          ...(detailedSummary ? matches.slice(0, 10).map((m) => `⚽ ضد ${m.opponent || "غير محدد"} — ${m.location || "الموقع غير محدد"} — ${m.result || "scheduled"}`) : []),
          `التدريبات اليوم: ${trainings.length}`,
          ...(detailedSummary ? trainings.slice(0, 10).map((t) => `🏃 ${t.title || "تدريب"} — ${Number(t.duration_minutes || 0)} دقيقة`) : []),
          `الحضور المسجل اليوم: ${attendanceRows.length} (حاضر ${attendanceRows.filter((r) => r.status === "present").length} / غائب ${attendanceRows.filter((r) => r.status === "absent").length})`,
          `طلبات تسجيل اللاعبين المعلقة: ${pendingRegistrations}`,
          `طلبات انضمام الطاقم المعلقة: ${pendingStaffApplications}`,
          `إثباتات الدفع بانتظار التحقق: ${pendingPaymentProofs}`,
          `شهادات/رخص الطاقم تنتهي خلال 30 يومًا: ${expiringStaffDocuments}`,
          `شهادات/رخص الطاقم المنتهية: ${expiredStaffDocuments}`,
        ].join("\n"),
      );
      return Response.json({ ok: true });
    }

    if (isPaymentsCommand(incomingText)) {
      const rows = await restRows<{ amount?: number | string; type?: string; category?: string; description?: string }>("transactions", {
        select: "amount,type,category,description",
        transaction_date: `eq.${today}`,
        order: "created_at.asc",
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
          ...revenues.slice(0, 20).map((row, index) => `${index + 1}) ${formatMoney(Number(row.amount || 0))} د.ب — ${row.category || "إيراد"}${row.description ? ` — ${row.description}` : ""}`),
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

    if (parsedQuestion.intent === "payment_proofs") {
      const rows = await restRows<{ id?: string; amount?: number | string; transfer_date?: string; status?: string; created_at?: string }>("payment_proofs", {
        select: "id,amount,transfer_date,status,created_at",
        status: "eq.pending",
        order: "created_at.asc",
      });
      const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
      await sendMessage(chatId, [
        "إثباتات الدفع بانتظار التحقق",
        `العدد: ${rows.length}`,
        `إجمالي المبالغ المعلقة: ${formatMoney(total)} د.ب`,
        ...rows.slice(0, 20).map((row, index) => `${index + 1}) ${formatMoney(Number(row.amount || 0))} د.ب — تاريخ التحويل ${row.transfer_date || "غير محدد"}`),
        "",
        "اعتماد أو رفض الإثبات يتم من شاشة الاشتراكات في الموقع لضمان تسجيل المراجعة والإيصال.",
      ].join("\n"));
      return Response.json({ ok: true });
    }

    if (parsedQuestion.intent === "staff_documents") {
      const [expiring, expired] = await Promise.all([
        restRows<{ title?: string; document_type?: string; expiry_date?: string }>("staff_documents", {
          select: "title,document_type,expiry_date",
          document_type: "neq.profile_photo",
          expiry_date_gte: `gte.${today}`,
          expiry_date_lte: `lte.${bahrainDate(30)}`,
          order: "expiry_date.asc",
        }),
        restRows<{ title?: string; document_type?: string; expiry_date?: string }>("staff_documents", {
          select: "title,document_type,expiry_date",
          document_type: "neq.profile_photo",
          expiry_date_lt: `lt.${today}`,
          order: "expiry_date.asc",
        }),
      ]);
      await sendMessage(chatId, [
        "حالة شهادات ورخص الطاقم",
        `تنتهي خلال 30 يومًا: ${expiring.length}`,
        ...expiring.slice(0, 10).map((doc) => `⚠️ ${doc.title || doc.document_type || "مستند"} — ${doc.expiry_date || "غير محدد"}`),
        `منتهية: ${expired.length}`,
        ...expired.slice(0, 10).map((doc) => `⛔ ${doc.title || doc.document_type || "مستند"} — ${doc.expiry_date || "غير محدد"}`),
      ].join("\n"));
      return Response.json({ ok: true });
    }

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
      const rows = await restRows<{ id?: string; parent_full_name?: string; status?: string; submitted_at?: string }>("registration_applications", {
        select: "id,parent_full_name,status,submitted_at",
        submitted_at_gte: `gte.${effectiveRange.start}T00:00:00+03:00`,
        submitted_at_lte: `lte.${effectiveRange.end}T23:59:59+03:00`,
        order: "submitted_at.asc",
      });
      const pendingRows = rows.filter((row) => String(row.status).toLowerCase() === "pending" && row.id);
      await sendMessage(chatId, [
        `طلبات التسجيل — ${periodLabel(parsedQuestion.period === "all" ? "today" : parsedQuestion.period)}`,
        `إجمالي الطلبات: ${rows.length}`,
        `بانتظار المراجعة: ${pendingRows.length}`,
      ].join("\n"));

      for (const row of pendingRows.slice(0, 10)) {
        await sendMessage(
          chatId,
          `📝 طلب تسجيل معلق
ولي الأمر: ${row.parent_full_name || "غير محدد"}
تاريخ الإرسال: ${row.submitted_at || "غير محدد"}`,
          {
            inline_keyboard: [[
              { text: "✅ موافقة", callback_data: `reg:approve:${row.id}` },
              { text: "👀 مراجعة في الموقع", callback_data: `reg:review:${row.id}` },
            ]],
          },
        );
      }
      return Response.json({ ok: true });
    }

    if (parsedQuestion.intent === "staff_applications") {
      const effectiveRange = range || adminDateRange("today")!;
      const rows = await restRows<{ id?: string; full_name?: string; requested_role?: string; status?: string; submitted_at?: string }>("staff_applications", {
        select: "id,full_name,requested_role,status,submitted_at",
        submitted_at_gte: `gte.${effectiveRange.start}T00:00:00+03:00`,
        submitted_at_lte: `lte.${effectiveRange.end}T23:59:59+03:00`,
        order: "submitted_at.asc",
      });
      const pendingRows = rows.filter((row) => String(row.status).toLowerCase() === "pending" && row.id);
      await sendMessage(chatId, [
        `طلبات انضمام الطاقم — ${periodLabel(parsedQuestion.period === "all" ? "today" : parsedQuestion.period)}`,
        `إجمالي الطلبات: ${rows.length}`,
        `بانتظار المراجعة: ${pendingRows.length}`,
      ].join("\n"));
      for (const row of pendingRows.slice(0, 10)) {
        const roleLabel = row.requested_role === "manager" ? "مدير" : row.requested_role === "coach" ? "مدرب" : row.requested_role === "accountant" ? "محاسب" : row.requested_role === "receptionist" ? "استقبال" : (row.requested_role || "موظف");
        await sendMessage(chatId, `🧑‍💼 طلب انضمام معلق
الاسم: ${row.full_name || "غير محدد"}
الصفة المطلوبة: ${roleLabel}
تاريخ الإرسال: ${row.submitted_at || "غير محدد"}`, {
          inline_keyboard: [[
            { text: "✅ موافقة", callback_data: `staff:approve:${row.id}` },
            { text: "👀 مراجعة في الموقع", callback_data: `staff:review:${row.id}` },
          ]],
        });
      }
      return Response.json({ ok: true });
    }

    if (parsedQuestion.intent === "matches") {
      const effectiveRange = range || adminDateRange("today")!;
      const rows = await restRows<{ match_date?: string; opponent?: string; location?: string; result?: string }>("matches", { select: "match_date,opponent,location,result", match_date_gte: `gte.${effectiveRange.start}`, match_date_lte: `lte.${effectiveRange.end}`, order: "match_date.asc" });
      await sendMessage(chatId, [`المباريات — ${periodLabel(parsedQuestion.period === "all" ? "today" : parsedQuestion.period)}`, `العدد: ${rows.length}`, ...rows.slice(0,20).map((m)=>`⚽ ${m.match_date || ""} — ضد ${m.opponent || "غير محدد"} — ${m.location || "الموقع غير محدد"} — ${m.result || "scheduled"}`)].join("\n"));
      return Response.json({ ok: true });
    }
    if (parsedQuestion.intent === "trainings") {
      const effectiveRange = range || adminDateRange("today")!;
      const rows = await restRows<{ session_date?: string; title?: string; duration_minutes?: number }>("trainings", { select: "session_date,title,duration_minutes", session_date_gte: `gte.${effectiveRange.start}`, session_date_lte: `lte.${effectiveRange.end}`, order: "session_date.asc" });
      await sendMessage(chatId, [`التدريبات — ${periodLabel(parsedQuestion.period === "all" ? "today" : parsedQuestion.period)}`, `العدد: ${rows.length}`, ...rows.slice(0,20).map((t)=>`🏃 ${t.session_date || ""} — ${t.title || "تدريب"} — ${Number(t.duration_minutes || 0)} دقيقة`)].join("\n"));
      return Response.json({ ok: true });
    }

    await sendMessage(
      chatId,
      "اسألني عن اللاعبين، المدربين، الموظفين، الفرق، المباريات، التدريبات، الاشتراكات، الإيرادات، الحضور أو طلبات التسجيل. يمكنك السؤال كتابةً أو صوتًا.",
    );
    return Response.json({ ok: true });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code || "unknown") : "unknown";
    console.error("Telegram manager query failed", code);
    await sendMessage(chatId, "تعذر جلب البيانات الآن. حاول مرة أخرى بعد قليل.");
    return Response.json({ ok: false }, { status: 500 });
  }
});
