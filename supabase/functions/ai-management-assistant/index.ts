import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

type Persona = "financial" | "operations" | "documents" | "communication";
type Lang = "ar" | "en";

const ALLOWED_PERSONAS = new Set<Persona>([
  "financial",
  "operations",
  "documents",
  "communication",
]);

const personaRoles: Record<Persona, string[]> = {
  financial: ["manager", "accountant"],
  operations: ["manager", "receptionist"],
  documents: ["manager", "receptionist"],
  communication: ["manager", "receptionist"],
};

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(data: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function getPublishableKey(): string {
  const raw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, string>;
      const first = parsed.default || Object.values(parsed)[0];
      if (first) return first;
    } catch {
      // Fall through to the legacy anon key.
    }
  }

  const legacy = Deno.env.get("SUPABASE_ANON_KEY");
  if (!legacy) throw new Error("Supabase publishable key is unavailable");
  return legacy;
}

function extractResponseText(payload: any): string {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const output = Array.isArray(payload?.output) ? payload.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.text === "string" && part.text.trim()) return part.text.trim();
    }
  }
  return "";
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405, origin);
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "authentication_required" }, 401, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!supabaseUrl) {
    return json({ error: "server_configuration_error" }, 500, origin);
  }

  let body: { persona?: string; question?: string; lang?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400, origin);
  }

  const persona = body.persona as Persona;
  const question = String(body.question || "").trim();
  const lang: Lang = body.lang === "en" ? "en" : "ar";

  if (!ALLOWED_PERSONAS.has(persona)) {
    return json({ error: "persona_not_supported" }, 400, origin);
  }
  if (!question || question.length > 1200) {
    return json({ error: "invalid_question" }, 400, origin);
  }

  const supabase = createClient(supabaseUrl, getPublishableKey(), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return json({ error: "invalid_session" }, 401, origin);
  }

  const { data: member, error: memberError } = await supabase
    .from("staff")
    .select("id,role,status")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (memberError || !member || member.status !== "active") {
    return json({ error: "staff_access_required" }, 403, origin);
  }

  const allowedRoles = personaRoles[persona];
  if (!allowedRoles.includes(member.role)) {
    return json({ error: "insufficient_role" }, 403, origin);
  }

  const safeRows = async (table: string, columns: string) => {
    const { data, error } = await supabase.from(table).select(columns);
    return error ? [] : (data || []);
  };

  const [
    players,
    subscriptions,
    transactions,
    staff,
    teams,
    attendance,
    registrations,
    documents,
  ] = await Promise.all([
    safeRows("players", "id,status"),
    safeRows("subscriptions", "id,status,amount"),
    safeRows("transactions", "id,type,amount"),
    safeRows("staff", "id,status,role"),
    safeRows("teams", "id"),
    safeRows("attendance", "id,status"),
    safeRows("registration_applications", "id,status"),
    safeRows("registration_documents", "id"),
  ]);

  const sum = (rows: any[], key: string) =>
    rows.reduce((total, row) => total + (Number(row?.[key]) || 0), 0);

  const revenue = sum(transactions.filter((x: any) => x.type === "revenue"), "amount");
  const expenses = sum(transactions.filter((x: any) => x.type === "expense"), "amount");
  const paidSubs = subscriptions.filter((x: any) => x.status === "paid");
  const unpaidSubs = subscriptions.filter((x: any) => x.status === "unpaid");

  const snapshot = {
    players: {
      total: players.length,
      active: players.filter((x: any) => x.status === "active").length,
      inactive: players.filter((x: any) => x.status === "inactive").length,
    },
    finance: {
      revenue,
      expenses,
      net: revenue - expenses,
      paidSubscriptions: paidSubs.length,
      unpaidSubscriptions: unpaidSubs.length,
      unpaidAmount: sum(unpaidSubs, "amount"),
    },
    organization: {
      activeStaff: staff.filter((x: any) => x.status === "active").length,
      teams: teams.length,
    },
    attendance: {
      totalRecords: attendance.length,
      present: attendance.filter((x: any) => x.status === "present").length,
      absent: attendance.filter((x: any) => x.status === "absent").length,
    },
    registrations: {
      total: registrations.length,
      pending: registrations.filter((x: any) => ["submitted", "under_review"].includes(x.status)).length,
      needsInfo: registrations.filter((x: any) => x.status === "needs_info").length,
    },
    documents: {
      registrationDocuments: documents.length,
    },
  };

  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openAiKey) {
    return json(
      {
        error: "ai_provider_not_configured",
        setupRequired: true,
        provider: "openai",
      },
      503,
      origin,
    );
  }

  const model = Deno.env.get("OPENAI_MODEL") || "gpt-5.6-luna";

  const systemPrompt = lang === "ar"
    ? `أنت مساعد إداري لمنصة أكاديمية. مهمتك تحليل بيانات تشغيلية ومالية وإدارية فقط.
اعتمد حصراً على الملخص الرقمي المرسل مع السؤال. لا تخترع أرقاماً أو حقائق غير موجودة.
لا تطلب أو تعرض بيانات شخصية حساسة، ولا تحاول كشف أسماء أو هويات أو ملاحظات خاصة.
لا تقدم إرشادات عن الأسلحة أو استخدامها أو التدريب عليها أو أي نشاط خطير. إذا طُلب ذلك، وضّح أن هذا المساعد مخصص للإدارة فقط.
اجعل الرد عملياً ومختصراً وبالعربية، مع نقاط واضحة عند الحاجة.`
    : `You are an administrative assistant for an academy platform. Only provide operational, financial, document, and communications analysis.
Use only the aggregated snapshot supplied with the question. Do not invent figures.
Do not request or expose sensitive personal information.
Do not provide guidance about weapons, weapon use, weapon training, or dangerous activities. If asked, state that this assistant is limited to administration.
Keep responses concise and actionable.`;

  const userPrompt = JSON.stringify({
    persona,
    question,
    snapshot,
  });

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
        { role: "user", content: [{ type: "input_text", text: userPrompt }] },
      ],
      max_output_tokens: 700,
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    console.error("OpenAI request failed", response.status, payload?.error?.type || "unknown");
    return json({ error: "ai_provider_error" }, 502, origin);
  }

  const reply = extractResponseText(payload);
  if (!reply) {
    return json({ error: "empty_ai_response" }, 502, origin);
  }

  return json(
    {
      reply,
      provider: "openai",
      model,
      generatedAt: new Date().toISOString(),
    },
    200,
    origin,
  );
});
