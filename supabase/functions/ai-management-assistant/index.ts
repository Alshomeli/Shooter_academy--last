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

function extractGeminiText(payload: any): string {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
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

  if (!personaRoles[persona].includes(member.role)) {
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
      pending: registrations.filter((x: any) =>
        ["submitted", "under_review"].includes(x.status)
      ).length,
      needsInfo: registrations.filter((x: any) => x.status === "needs_info").length,
    },
    documents: {
      registrationDocuments: documents.length,
    },
  };

  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) {
    return json(
      {
        error: "ai_provider_not_configured",
        setupRequired: true,
        provider: "gemini",
      },
      503,
      origin,
    );
  }

  const model = Deno.env.get("GEMINI_MODEL") || "gemini-2.5-flash";

  const systemPrompt = lang === "ar"
    ? `أنت مساعد إداري لمنصة أكاديمية. حلل البيانات التشغيلية والمالية والإدارية فقط.
اعتمد حصراً على الملخص الرقمي المرسل ولا تخترع أرقاماً.
لا تطلب أو تعرض بيانات شخصية حساسة.
لا تقدم إرشادات عن الأسلحة أو استخدامها أو التدريب عليها أو أي نشاط خطير.
اجعل الرد عملياً ومختصراً وبالعربية.`
    : `You are an administrative assistant for an academy platform. Only provide operational, financial, document, and communications analysis.
Use only the aggregated snapshot supplied; do not invent figures or expose sensitive personal data.
Do not provide guidance about weapons, weapon use, weapon training, or dangerous activities.
Keep responses concise and actionable.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": geminiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [
          {
            role: "user",
            parts: [{ text: JSON.stringify({ persona, question, snapshot }) }],
          },
        ],
        generationConfig: { maxOutputTokens: 700 },
      }),
    },
  );

  const payload = await response.json();

  if (!response.ok) {
    console.error(
      "Gemini request failed",
      response.status,
      payload?.error?.status || "unknown",
    );
    return json({ error: "ai_provider_error" }, 502, origin);
  }

  const reply = extractGeminiText(payload);
  if (!reply) {
    return json({ error: "empty_ai_response" }, 502, origin);
  }

  return json(
    {
      reply,
      provider: "gemini",
      model,
      generatedAt: new Date().toISOString(),
    },
    200,
    origin,
  );
});
