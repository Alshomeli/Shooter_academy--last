import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

type Operation = "approve_registration" | "review_registration" | "record_subscription_payment";
type Mode = "prepare" | "execute" | "cancel";

const OP_ROLES: Record<Operation, string[]> = {
  approve_registration: ["manager"],
  review_registration: ["manager"],
  record_subscription_payment: ["manager", "accountant"],
};

const cors = (origin: string | null) => ({
  "Access-Control-Allow-Origin": origin || "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
});

const reply = (origin: string | null, status: number, data: unknown) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

function publicKey(): string {
  const raw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, string>;
      const first = parsed.default || Object.values(parsed)[0];
      if (first) return String(first);
    } catch {}
  }
  const legacy = Deno.env.get("SUPABASE_ANON_KEY");
  if (!legacy) throw new Error("publishable_key_unavailable");
  return legacy;
}

function cleanText(value: unknown, max = 500): string {
  return String(value ?? "").trim().slice(0, max);
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return reply(origin, 405, { error: "method_not_allowed" });

  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return reply(origin, 401, { error: "authentication_required" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return reply(origin, 500, { error: "server_configuration_error" });

  let body: {
    mode?: Mode;
    operation?: Operation;
    params?: Record<string, unknown>;
    requestId?: string;
    confirm?: boolean;
  };
  try { body = await req.json(); } catch { return reply(origin, 400, { error: "invalid_json" }); }

  const userClient = createClient(supabaseUrl, publicKey(), {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const serverClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return reply(origin, 401, { error: "invalid_session" });

  const { data: staff, error: staffError } = await userClient
    .from("staff")
    .select("id,role,status")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (staffError || !staff || staff.status !== "active") return reply(origin, 403, { error: "active_staff_required" });

  const mode: Mode = body.mode === "execute" ? "execute" : body.mode === "cancel" ? "cancel" : "prepare";

  if (mode === "prepare") {
    const operation = body.operation;
    if (!operation || !OP_ROLES[operation]) return reply(origin, 400, { error: "unsupported_operation" });
    if (!OP_ROLES[operation].includes(staff.role)) return reply(origin, 403, { error: "insufficient_role" });

    const params = body.params || {};
    let normalized: Record<string, unknown> = {};
    let preview: Record<string, unknown> = {};

    if (operation === "approve_registration" || operation === "review_registration") {
      const applicationId = cleanText(params.applicationId, 64);
      if (!applicationId) return reply(origin, 400, { error: "application_id_required" });

      const { data: application, error } = await userClient
        .from("registration_applications")
        .select("id,status,registration_type,submitted_at")
        .eq("id", applicationId)
        .maybeSingle();
      if (error || !application) return reply(origin, 404, { error: "registration_not_found" });

      normalized = { applicationId };
      preview = {
        applicationId,
        currentStatus: application.status,
        registrationType: application.registration_type,
        submittedAt: application.submitted_at,
      };

      if (operation === "review_registration") {
        const status = cleanText(params.status, 30);
        const notes = cleanText(params.notes, 1000);
        if (!["under_review", "needs_info", "rejected"].includes(status)) {
          return reply(origin, 400, { error: "invalid_review_status" });
        }
        normalized.status = status;
        normalized.notes = notes;
        preview.newStatus = status;
        preview.hasReviewNotes = Boolean(notes);
      }
    } else if (operation === "record_subscription_payment") {
      const subscriptionId = cleanText(params.subscriptionId, 100);
      const paymentMethod = cleanText(params.paymentMethod, 100);
      const description = cleanText(params.description, 500);
      const transactionDate = cleanText(params.transactionDate, 20);
      if (!subscriptionId || !paymentMethod) {
        return reply(origin, 400, { error: "subscription_and_payment_method_required" });
      }

      const { data: subscription, error } = await userClient
        .from("subscriptions")
        .select("id,status,amount,player_id,start_date,end_date")
        .eq("id", subscriptionId)
        .maybeSingle();
      if (error || !subscription) return reply(origin, 404, { error: "subscription_not_found" });
      if (subscription.status === "paid") return reply(origin, 409, { error: "subscription_already_paid" });

      normalized = {
        subscriptionId,
        paymentMethod,
        description,
        transactionDate: transactionDate || null,
        amount: Number(subscription.amount) || 0,
      };
      preview = {
        subscriptionId,
        amount: Number(subscription.amount) || 0,
        currency: "BHD",
        currentStatus: subscription.status,
        paymentMethod,
        period: { start: subscription.start_date, end: subscription.end_date },
      };
    }

    const { data: action, error: insertError } = await serverClient
      .from("ai_action_requests")
      .insert({
        user_id: userData.user.id,
        operation,
        payload: normalized,
        preview,
      })
      .select("id,operation,preview,status,created_at,expires_at")
      .single();

    if (insertError || !action) {
      console.error("AI action prepare insert failed", insertError?.code);
      return reply(origin, 500, { error: "prepare_failed" });
    }

    return reply(origin, 200, {
      requestId: action.id,
      operation: action.operation,
      preview: action.preview,
      status: action.status,
      requiresConfirmation: true,
      expiresAt: action.expires_at,
    });
  }

  const requestId = cleanText(body.requestId, 64);
  if (!requestId) return reply(origin, 400, { error: "request_id_required" });

  const { data: action, error: actionError } = await serverClient
    .from("ai_action_requests")
    .select("id,user_id,operation,payload,preview,status,expires_at")
    .eq("id", requestId)
    .maybeSingle();

  if (actionError || !action) return reply(origin, 404, { error: "action_request_not_found" });
  if (action.user_id !== userData.user.id) return reply(origin, 403, { error: "action_owner_mismatch" });
  if (!OP_ROLES[action.operation as Operation]?.includes(staff.role)) return reply(origin, 403, { error: "insufficient_role" });

  if (mode === "cancel") {
    if (action.status !== "pending") return reply(origin, 409, { error: "action_not_pending" });
    const { data: cancelled, error: cancelError } = await serverClient
      .from("ai_action_requests")
      .update({ status: "cancelled" })
      .eq("id", action.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (cancelError) return reply(origin, 500, { error: "cancel_failed" });
    if (!cancelled) return reply(origin, 409, { error: "action_not_pending" });
    return reply(origin, 200, { requestId: action.id, status: "cancelled" });
  }

  if (body.confirm !== true) return reply(origin, 400, { error: "explicit_confirmation_required" });
  if (action.status !== "pending") return reply(origin, 409, { error: "action_not_pending", status: action.status });
  if (new Date(action.expires_at).getTime() <= Date.now()) {
    await serverClient.from("ai_action_requests").update({ status: "expired" }).eq("id", action.id);
    return reply(origin, 410, { error: "action_expired" });
  }

  const { data: claimed, error: claimError } = await serverClient
    .from("ai_action_requests")
    .update({ status: "executing" })
    .eq("id", action.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (claimError) {
    console.error("AI action claim failed", claimError.code);
    return reply(origin, 500, { error: "claim_failed" });
  }
  if (!claimed) return reply(origin, 409, { error: "action_not_pending" });

  const op = action.operation as Operation;
  const p = action.payload as Record<string, unknown>;

  try {
    let sanitizedResult: Record<string, unknown>;

    if (op === "approve_registration") {
      const { error } = await userClient.rpc("approve_registration_application", {
        p_application_id: String(p.applicationId),
      });
      if (error) throw error;
      sanitizedResult = { applicationId: p.applicationId, approved: true };
    } else if (op === "review_registration") {
      const { error } = await userClient.rpc("review_registration_application", {
        p_application_id: String(p.applicationId),
        p_status: String(p.status),
        p_notes: p.notes ? String(p.notes) : null,
      });
      if (error) throw error;
      sanitizedResult = { applicationId: p.applicationId, status: p.status };
    } else {
      const { data, error } = await userClient.rpc("record_subscription_payment", {
        p_subscription_id: String(p.subscriptionId),
        p_amount: Number(p.amount),
        p_payment_method: String(p.paymentMethod),
        p_transaction_date: p.transactionDate ? String(p.transactionDate) : null,
        p_description: p.description ? String(p.description) : null,
      });
      if (error) throw error;
      sanitizedResult = {
        subscriptionId: p.subscriptionId,
        amount: p.amount,
        paymentMethod: p.paymentMethod,
        transactionId: data?.id ?? null,
      };
    }

    await serverClient
      .from("ai_action_requests")
      .update({ status: "executed", result: sanitizedResult, executed_at: new Date().toISOString() })
      .eq("id", action.id)
      .eq("status", "executing");

    await userClient.rpc("record_audit_log", {
      p_action: "AI_ACTION_EXECUTED",
      p_details: JSON.stringify({ requestId: action.id, operation: op }),
    }).catch(() => undefined);

    return reply(origin, 200, {
      requestId: action.id,
      operation: op,
      status: "executed",
      result: sanitizedResult,
    });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code || "operation_failed") : "operation_failed";
    console.error("AI action execution failed", op, code);
    await serverClient
      .from("ai_action_requests")
      .update({ status: "failed", error_code: code })
      .eq("id", action.id)
      .eq("status", "executing");
    return reply(origin, 409, { error: "operation_failed", code });
  }
});
