import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { bookOwnerId, isInternalCall, refusalBody, requireAdmin } from "../_shared/access.ts";
import { hookQuestionsFor } from "../_shared/baseline-discovery.ts";
import { paidMode } from "../_shared/protection.ts";
import { buildAuditRunRequest } from "../../../src/lib/auditQuestionContext.ts";
import { WEEKLY_CHECK_AUDIT_PURPOSE } from "../../../src/lib/auditKind.ts";
import { isPaidLead } from "../../../src/lib/leadPayment.ts";
import { serviceRouteForTotal, serviceRouteFromRow, type ServiceRoute } from "../../../src/lib/findableOffer.ts";
import { chooseWeeklySet, summariseWeek, weekOf, weeklyAffordable, weeklyStart, WEEKLY_CHECK_QUESTIONS } from "../../../src/lib/weeklyCheck.ts";
import type { QueueRow } from "../../../src/lib/auditReport.ts";

// weekly-visibility — the weekly AI visibility check for paying clients (Admin control centre,
// release 4, 2026-09-30; docs/admin-control-centre.md §Weekly visibility check).
//
// Callers: the cron (x-cron-secret, hourly) and the admin (the same "run", on demand). One run at a
// time (admin_job_runs lease). Each run, for every paying client:
//   1. may it start? (src/lib/weeklyCheck.ts weeklyStart — Build: new site live; Optimise: first
//      improvements live). Not yet → nothing.
//   2. no frozen set yet → choose ONCE (the Hook Audit's questions, then the official baseline's ASKED
//      set) and freeze it (weekly_check_sets; a trigger refuses any edit).
//   3. no check this London week → if affordable (per-client and weekly caps, the Apify account not
//      near its limit, the emergency stop off) start ONE single-run 'weekly_check' audit through
//      create-ai-audit (internal) and record it (weekly_check_runs — unique per client per week).
//   4. a started check whose run has finished → fold it (named per engine, per question, rivals) and
//      store the summary with its real billed cost.
// ⛔ It never touches the baseline, the replay, the guarantee or the lead row. It sends nothing.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret, x-internal-job",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const BUILD_ID = "weekly-visibility-2026-09-30c";
const FN = "weekly-visibility";
const RUN_LEASE_SECONDS = 600;
/** Refuse to start new checks when the Apify account is this full (directory-presence's rule). */
const APIFY_CRITICAL_PCT = 90;
const RUN_DONE = new Set(["complete", "capped"]);

// deno-lint-ignore no-explicit-any
type Service = any;
interface ClientLead {
  id: string; business_name: string | null; derived_town: string | null; search_location: string | null; search_keyword: string | null; category: string | null;
  website: string | null; country: string | null; baseline_audit_id: string | null; delivery_checklist: Record<string, unknown> | null;
  website_build: { production_url?: string | null; production_status?: string | null; qa?: { production_checked?: boolean | null } | null } | null;
  contract_total_payments: number | null; status: string | null; amount_paid: number | null; is_archived: boolean | null; service_terminated_at: string | null;
}

/** The Apify account's share of its monthly cap, from the 15-minute snapshot — recomputed from
 *  used/cap, never the stored usage_pct (CLAUDE.md §4). Unreadable → null, which refuses a start. */
async function apifyPct(service: Service): Promise<number | null> {
  const { data, error } = await service.from("apify_account_usage").select("monthly_usage_usd, max_monthly_usage_usd, captured_at").order("captured_at", { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  const used = Number((data as { monthly_usage_usd?: number }).monthly_usage_usd); const cap = Number((data as { max_monthly_usage_usd?: number }).max_monthly_usage_usd);
  return Number.isFinite(used) && Number.isFinite(cap) && cap > 0 ? (used / cap) * 100 : null;
}

async function baselineAskedSet(service: Service, auditId: string): Promise<string[]> {
  const { data: run } = await service.from("ai_audit_runs").select("id").eq("audit_id", auditId).order("run_number", { ascending: true }).limit(1).maybeSingle();
  if (!run?.id) return [];
  const { data } = await service.from("ai_audit_queue").select("question, created_at, id").eq("run_id", run.id).order("created_at").order("id");
  return ((data ?? []) as { question: string }[]).map((r) => r.question);
}

async function run(service: Service, url: string, secret: string, serviceKey: string): Promise<Record<string, unknown>> {
  const now = Date.now();
  const week = weekOf(now);
  const owner = await bookOwnerId(service);
  const { data: leadsData, error: lErr } = await service.from("outreach_leads")
    .select("id, business_name, derived_town, search_location, search_keyword, category, website, country, baseline_audit_id, delivery_checklist, website_build, contract_total_payments, status, amount_paid, is_archived, service_terminated_at")
    .gt("amount_paid", 0).limit(500);
  if (lErr) throw new Error(`leads: ${lErr.message}`);
  const { data: exData } = await service.from("metric_exclusions").select("kind, value").eq("kind", "lead");
  const excluded = new Set(((exData ?? []) as { value: string }[]).map((r) => r.value));
  const clients = ((leadsData ?? []) as ClientLead[]).filter((l) => isPaidLead(l) && !l.is_archived && !l.service_terminated_at && !excluded.has(l.id));
  const ids = clients.map((c) => c.id);
  if (!ids.length) return { week, clients: 0 };

  const [onbRes, oppRes, setRes, runRes] = await Promise.all([
    service.from("onboarding_responses").select("lead_id, plan_tier, website_addon, created_at").in("lead_id", ids),
    service.from("client_opportunities").select("lead_id").in("lead_id", ids).not("implemented_at", "is", null),
    service.from("weekly_check_sets").select("lead_id, questions").in("lead_id", ids),
    service.from("weekly_check_runs").select("id, lead_id, week_start, audit_id, status, estimate_usd, cost_usd, created_at").in("lead_id", ids),
  ]);
  for (const r of [onbRes, oppRes, setRes, runRes]) if (r.error) throw new Error(r.error.message);
  const routeOf = new Map<string, ServiceRoute>();
  for (const o of ((onbRes.data ?? []) as { lead_id: string; plan_tier: string | null; website_addon: boolean | null; created_at: string }[]).sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    const r = serviceRouteFromRow(o); if (r) routeOf.set(o.lead_id, r);
  }
  const implemented = new Map<string, number>();
  for (const o of (oppRes.data ?? []) as { lead_id: string }[]) implemented.set(o.lead_id, (implemented.get(o.lead_id) ?? 0) + 1);
  const sets = new Map(((setRes.data ?? []) as { lead_id: string; questions: string[] }[]).map((s) => [s.lead_id, s.questions]));
  const runs = (runRes.data ?? []) as { id: string; lead_id: string; week_start: string; audit_id: string | null; status: string; estimate_usd: number | null; cost_usd: number | null }[];
  let spentThisWeek = runs.filter((r) => String(r.week_start).slice(0, 10) === week && r.status !== "failed").reduce((s, r) => s + Number(r.cost_usd ?? r.estimate_usd ?? 0), 0);

  const mode = await paidMode(service);
  const pct = await apifyPct(service);
  const outcome: Record<string, string> = {};

  // 4. Fold finished checks first (no spend).
  for (const r of runs.filter((x) => x.status === "started" && x.audit_id)) {
    const { data: aRuns } = await service.from("ai_audit_runs").select("id, status, actor_cost_usd").eq("audit_id", r.audit_id);
    const list = (aRuns ?? []) as { id: string; status: string; actor_cost_usd: number | null }[];
    if (!list.length || !list.every((x) => RUN_DONE.has(String(x.status)))) continue;
    const lead = clients.find((c) => c.id === r.lead_id);
    const questions = sets.get(r.lead_id) ?? [];
    const { data: rows } = await service.from("ai_audit_queue").select("id, run_id, question, status, result").in("run_id", list.map((x) => x.id)).order("id").limit(200);
    const summary = summariseWeek(String(r.week_start).slice(0, 10), questions, (rows ?? []) as QueueRow[], {
      name: lead?.business_name ?? "", location: lead?.derived_town ?? lead?.search_location ?? "", trade: lead?.search_keyword ?? lead?.category ?? undefined,
    });
    const cost = list.reduce((s, x) => s + (Number(x.actor_cost_usd) || 0), 0);
    await service.from("weekly_check_runs").update({ status: "complete", summary, cost_usd: cost || r.estimate_usd, completed_at: new Date().toISOString() }).eq("id", r.id);
    outcome[r.lead_id] = "folded";
  }

  // 1–3. Start this week's checks.
  for (const c of clients) {
    if (outcome[c.id]) continue;
    const route = routeOf.get(c.id) ?? serviceRouteForTotal(c.contract_total_payments) ?? null;
    const start = weeklyStart({ route, websiteBuild: c.website_build, checklist: c.delivery_checklist, implementedOpportunities: implemented.get(c.id) ?? 0 });
    if (!start.ok) { outcome[c.id] = `not started: ${start.reason}`; continue; }
    let questions = sets.get(c.id);
    if (!questions) {
      if (!c.baseline_audit_id) { outcome[c.id] = "no official baseline yet — the weekly set is taken from it"; continue; }
      const biz = { name: c.business_name ?? "", location: c.derived_town ?? c.search_location ?? "", trade: c.search_keyword ?? c.category ?? undefined };
      const [hook, baseline] = await Promise.all([hookQuestionsFor(service, c.id, c.baseline_audit_id, biz), baselineAskedSet(service, c.baseline_audit_id)]);
      const chosen = chooseWeeklySet(hook.questions, baseline);
      if (!chosen) { outcome[c.id] = "too few real questions to monitor"; continue; }
      const { error: sErr } = await service.from("weekly_check_sets").insert({
        lead_id: c.id, questions: chosen.questions, from_hook: chosen.fromHook, from_baseline: chosen.fromBaseline,
        source_baseline_audit_id: c.baseline_audit_id, source_hook_audit_id: hook.audit_id, start_reason: start.reason,
      });
      if (sErr && (sErr as { code?: string }).code !== "23505") { outcome[c.id] = `set not saved: ${sErr.message}`; continue; }
      questions = chosen.questions;
    }
    if (runs.some((r) => r.lead_id === c.id && String(r.week_start).slice(0, 10) === week)) { outcome[c.id] = "this week's check exists"; continue; }
    // Client work continues under "prospecting paused"; the emergency stop halts it.
    if (mode === "all_stop") { outcome[c.id] = "paid calls paused (emergency stop)"; continue; }
    if (pct === null || pct >= APIFY_CRITICAL_PCT) { outcome[c.id] = pct === null ? "Apify usage unreadable — not started" : `Apify account at ${Math.round(pct)}% — not started`; continue; }
    const afford = weeklyAffordable(Math.min(questions.length, WEEKLY_CHECK_QUESTIONS), spentThisWeek);
    if (!afford.ok) { outcome[c.id] = `not started: ${afford.reason}`; continue; }
    // Claim the week first (the unique key makes a second start impossible), then create the audit.
    const { data: claim, error: cErr } = await service.from("weekly_check_runs").insert({ lead_id: c.id, week_start: week, status: "starting", estimate_usd: afford.estimateUsd }).select("id").single();
    if (cErr || !claim) { outcome[c.id] = (cErr as { code?: string } | null)?.code === "23505" ? "this week's check exists" : `claim failed: ${cErr?.message}`; continue; }
    spentThisWeek += afford.estimateUsd;
    const body = {
      ...buildAuditRunRequest({
        business_name: c.business_name ?? "", business_category: c.search_keyword ?? c.category ?? "", primary_location: c.derived_town ?? c.search_location ?? "",
        country: c.country ?? "UK", website: c.website ?? "", services: [], service_areas: [], specialisms: [],
      }, { questionCount: questions.length, purpose: WEEKLY_CHECK_AUDIT_PURPOSE, userId: owner ?? undefined, leadId: c.id, questions }),
      // The set is the client's own frozen questions — their towns were approved with the baseline.
      town_confirmed: true, target_runs: 1, skip_seo: true,
    };
    try {
      const res = await fetch(`${url}/functions/v1/create-ai-audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${serviceKey}`, "x-cron-secret": secret, "x-internal-job": "1" },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      const auditId = payload?.audit_id ?? payload?.audit?.id ?? payload?.id;
      if (!res.ok || !payload?.ok || typeof auditId !== "string") throw new Error(String(payload?.error ?? `status ${res.status}`));
      /* Say so if the engine queued fewer than the frozen set (the first run lost 5 of 10 to a cap). */
      const { data: aRun } = await service.from("ai_audit_runs").select("id").eq("audit_id", auditId).order("run_number").limit(1).maybeSingle();
      const { count: queued } = aRun?.id ? await service.from("ai_audit_queue").select("id", { count: "exact", head: true }).eq("run_id", aRun.id) : { count: null };
      const short = typeof queued === "number" && queued < questions.length ? `only ${queued} of ${questions.length} questions were queued` : null;
      await service.from("weekly_check_runs").update({ status: "started", audit_id: auditId, reason: short }).eq("id", claim.id);
      outcome[c.id] = short ? `started (${short})` : "started";
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await service.from("weekly_check_runs").update({ status: "failed", reason: msg.slice(0, 300) }).eq("id", claim.id);
      spentThisWeek -= afford.estimateUsd;
      outcome[c.id] = `start failed: ${msg}`;
    }
  }
  return { week, clients: clients.length, spentThisWeekUsd: Math.round(spentThisWeek * 1000) / 1000, outcome };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { ...corsHeaders, "x-build": BUILD_ID } });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const secret = Deno.env.get("CRON_SECRET") ?? "";
    const service = createClient(url, serviceKey, { auth: { persistSession: false } });
    if (!isInternalCall(req)) {
      const who = await requireAdmin(req, service);
      if (!who.ok) return json(refusalBody(who), who.status);
    }
    const body = await req.json().catch(() => ({}));
    if (String(body.action ?? "run") !== "run") return json({ ok: false, error: "unknown_action" }, 400);
    const { data: claimed, error: cErr } = await service.rpc("admin_job_claim", { _job: FN, _lease_seconds: RUN_LEASE_SECONDS });
    if (cErr) throw new Error(`lease: ${cErr.message}`);
    if (claimed !== true) return json({ ok: true, build: BUILD_ID, skipped: "another run is in progress" });
    try {
      const result = await run(service, url, secret, serviceKey);
      await service.rpc("admin_job_finish", { _job: FN, _status: "ok", _result: result, _error: null });
      return json({ ok: true, build: BUILD_ID, ...result });
    } catch (e) {
      await service.rpc("admin_job_finish", { _job: FN, _status: "error", _result: null, _error: (e instanceof Error ? e.message : String(e)).slice(0, 500) });
      throw e;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[weekly-visibility]", msg);
    return json({ ok: false, error: "server_error" }, 500);
  }
});
