// sales-prospect-check — "Check before calling": a salesperson's bulk pre-call check (2026-10-04,
// fix/07-sales-bulk-audit; master plan M-034 / WS-7; docs/pre-sales-certification/fixes-07-sales-bulk-audit.md).
//
// The door only: who is calling, which action, and the real providers wired into the engine
// (_shared/sales-check.ts, where every decision lives and is tested). Rules: src/lib/salesCheck.ts.
//
// Actions (all with the caller's own session — verify_jwt true, and resolveActor reads the role on EVERY
// call, so Team → Disable stops a rep at the next request):
//   start    (sales)  — { lead_ids, client_request_id, refresh? } → one batch, then moves it on once.
//   advance  (sales)  — moves the rep's open batches on (starts what is queued, resolves what is running).
//   view     (sales)  — the rep's newest batch (or `batch_id`) and today's allowance. Reads only.
//   cancel   (sales)  — { batch_id } → whatever has not started is skipped.
//   admin_overview (admin) — { days? } → every rep's batches, spend (estimated and actual), problems.
//
// ⛔ NEVER CONTACTS ANYONE. This file and everything it imports reach no WhatsApp, email or auto-reply
// sender (scripts/sales-prospect-check.test.ts walks the import closure and fails if one appears). It calls
// exactly two functions, both on their INTERNAL door with ids it read from the database itself — never an
// id from the browser: create-ai-audit (the hook check the rep's own button makes) and crawl-check (the
// lead's own website, standard profile, no run id, no job id).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { refusalBody, requireAdmin, resolveActor } from "../_shared/access.ts";
import { guardAction } from "../_shared/protection.ts";
import { checkSuppressed } from "../_shared/suppression.ts";
import { latestApifyUsage } from "../_shared/audit-budget.ts";
import { rollingSpendUsd } from "../_shared/enrichment/runner.ts";
import { OUTREACH_AUDIT_EST_USD } from "../_shared/outreach-audit.ts";
import { advance, adminOverview, batchView, cancelBatch, startBatch, type SalesCheckDeps } from "../_shared/sales-check.ts";
import { townGated } from "../../../src/lib/townVerdict.ts";
import { OUTREACH_HOOK_QUESTIONS } from "../../../src/lib/auditQuestionCounts.ts";

/** Bumped with every change to this function — the deploy marker (OPTIONS answers it). */
const BUILD_ID = "sales-prospect-check-1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Expose-Headers": "x-sales-check-build",
  "x-sales-check-build": BUILD_ID,
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/* The internal-call headers, as bulk-jobs sends them: the vault's real keys for the gateway (the injected
   ones are stale after the key rotation) plus CRON_SECRET + x-internal-job for the target's own check. */
let internalKeys: { service_key: string; anon_key: string } | null = null;
// deno-lint-ignore no-explicit-any
async function internalHeaders(service: any): Promise<Record<string, string>> {
  if (!internalKeys) {
    try {
      const { data } = await service.rpc("edge_internal_keys");
      const row = Array.isArray(data) ? data[0] : data;
      internalKeys = { service_key: (row?.service_key as string) || SERVICE_KEY, anon_key: (row?.anon_key as string) || ANON_KEY };
    } catch {
      internalKeys = { service_key: SERVICE_KEY, anon_key: ANON_KEY };
    }
  }
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${internalKeys.service_key}`,
    "apikey": internalKeys.anon_key,
    "x-internal-job": "1",
    "x-cron-secret": CRON_SECRET,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  // deno-lint-ignore no-explicit-any
  let body: any = {};
  try {
    body = await req.json().catch(() => ({}));
    const action = typeof body?.action === "string" ? body.action : "";

    if (action === "admin_overview") {
      const who = await requireAdmin(req, service);
      if (!who.ok) return json(refusalBody(who), who.status);
      const days = Number(body?.days);
      return json({ ok: true, overview: await adminOverview(depsFor(service, who.actor.id), Number.isFinite(days) ? days : 7) });
    }

    const who = await resolveActor(req, service);
    if (!who.ok) return json(refusalBody(who), who.status);
    /* ⛔ POSITIVE MATCH ON THE SALES ROLE. The admin has the admin bulk runner; this stricter path is the
       salesperson's, and an unknown role is refused. */
    if (who.actor.role !== "sales") return json({ ok: false, error: "sales_only", detail: "Check before calling is the salesperson's tool." }, 403);
    const actor = { id: who.actor.id, role: who.actor.role };
    const deps = depsFor(service, actor.id);

    if (action === "start") {
      const out = await startBatch(deps, actor, body);
      if (out.status !== 200) {
        if (out.body.error === "batch_active") return json({ ...out.body, view: await batchView(deps, actor, out.body.batch_id ?? null) }, out.status);
        return json(out.body, out.status);
      }
      await advance(deps, actor);
      return json({ ...out.body, view: await batchView(deps, actor, out.body.batch_id) });
    }
    if (action === "advance") {
      await advance(deps, actor);
      return json({ ok: true, view: await batchView(deps, actor, typeof body?.batch_id === "string" ? body.batch_id : null) });
    }
    if (action === "view") {
      return json({ ok: true, view: await batchView(deps, actor, typeof body?.batch_id === "string" ? body.batch_id : null) });
    }
    if (action === "cancel") {
      if (typeof body?.batch_id !== "string") return json({ ok: false, error: "batch_id required" }, 400);
      const r = await cancelBatch(deps, actor, body.batch_id);
      if (!r.ok) return json({ ok: false, error: "not_found" }, 404);
      return json({ ok: true, view: await batchView(deps, actor, body.batch_id) });
    }
    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    try {
      await service.from("client_error_reports").insert({
        error_id: "sales_prospect_check_unhandled",
        context: { action: String(body?.action ?? "?"), message: why.slice(0, 500), at: new Date().toISOString() },
      });
    } catch { /* best-effort */ }
    return json({ ok: false, error: "internal", detail: "Something went wrong — your leads are unchanged. Try again in a minute." }, 500);
  }
});

// deno-lint-ignore no-explicit-any
function depsFor(service: any, actorId: string): SalesCheckDeps {
  return {
    service,
    now: () => Date.now(),
    estUsd: OUTREACH_AUDIT_EST_USD,
    questionCount: OUTREACH_HOOK_QUESTIONS,
    suppressed: async (lead) => (await checkSuppressed(service, { phone: lead.phone ?? null, email: lead.email ?? null, leadId: lead.id })).suppressed,
    townGated: (lead) => townGated(lead as Parameters<typeof townGated>[0]),
    guard: async (actor, leadId) => {
      const g = await guardAction(service, actor, "sales_check", { fn: "sales-prospect-check", leadId, estCostUsd: OUTREACH_AUDIT_EST_USD, role: "sales" });
      return g.ok ? { ok: true } : { ok: false, reason: g.reason };
    },
    prospecting: async (ownerId) => {
      const [spend, apify] = await Promise.all([rollingSpendUsd(service, ownerId, "prospecting"), latestApifyUsage(service)]);
      return spend ? { poolSpentUsd: spend.spent, apify } : null;
    },
    startAudit: async (auditBody) => {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-ai-audit`, {
        method: "POST", headers: await internalHeaders(service), body: JSON.stringify(auditBody),
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok && data?.ok === true, status: res.status, audit_id: data?.audit_id, run_id: data?.run_id, error: data?.error, detail: data?.detail, message: data?.message };
    },
    runCrawl: async (leadId, url) => {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/crawl-check`, {
        method: "POST", headers: await internalHeaders(service), body: JSON.stringify({ lead_id: leadId, url, deep: true }),
      });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok && data?.ok === true };
    },
    reportError: async (errorId, context) => {
      try { await service.from("client_error_reports").insert({ error_id: errorId, context: { actor: actorId, ...context, at: new Date().toISOString() } }); } catch { /* best-effort */ }
    },
  };
}
