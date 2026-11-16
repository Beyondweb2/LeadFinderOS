// AUDIT WATCH (Paul, 2026-11-16, leftovers items 1 and 3). Two small team-only jobs on one pg_cron (invoke_audit_watch,
// every 5 minutes, which posts only when one of them has work):
//
// 1. STORED VERDICT COUNTS (rule: src/lib/auditVerdictCounts.ts). Each FINISHED Discovery on rules v3/v4 gets its split —
//    Already named / Winnable / Not winnable / AI doesn't name businesses / Couldn't measure — in ai_audits.verdict_counts,
//    worked out by the report's own functions on the stored answers. A run re-scored after the counts were stored
//    (ai_audit_runs.scored_at newer than verdict_counts.at) is counted again. Read by the Opportunity score.
// 2. APIFY PAST 80% (rule: src/lib/apifyUsageAlert.ts). The newest apify_account_usage reading at or over the line → ONE
//    bell row + ONE email to Paul per Apify billing cycle (raiseOperatorAlert: the bell row is the claim).
// 3. AUDITS INCOMPLETE SUMMARY (v1-incomplete-fix, 2026-11-16; src/lib/auditAlerts.ts): the finaliser adds each incomplete
//    audit to one bell row per cause per hour; this job sends that row's ONE email a few minutes after it opened, so a
//    burst of twelve is one email ("12 audits incomplete since 12:08"), never twelve.
//
// ⛔ INTERNAL ONLY (CRON_SECRET, isInternalCall), or an admin (requireAdmin) for a manual backfill.
// ⛔ Reads stored answers and usage readings; writes one jsonb column and the operator alert. Asks no AI, starts no audit,
//    never messages a prospect or a client.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isInternalCall, requireAdmin } from "../_shared/access.ts";
import { verdictCountsOf } from "../../../src/lib/auditVerdictCounts.ts";
import { AUDIT_RULES_V2_FROM } from "../../../src/lib/auditVerdict.ts";
import { apifyUsageAlert, type ApifyUsageRow } from "../../../src/lib/apifyUsageAlert.ts";
import { raiseOperatorAlert, sendDueIncompleteSummaries } from "../_shared/audit-alerts.ts";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
const MAX_AUDITS = 40;
const BUDGET_MS = 60_000;
/** A run still working (the same test the Past audits list and the alert check use). */
const WORKING = new Set(["pending", "running", "processing"]);

// deno-lint-ignore no-explicit-any
type Row = any;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "post_only" }, 405);
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  if (!isInternalCall(req)) {
    const actor = await requireAdmin(req, service);
    if (!actor.ok) return json({ ok: false, error: actor.error }, actor.status);
  }
  const body = await req.json().catch(() => ({}));
  const force = body?.force === true;
  const only: string[] = Array.isArray(body?.auditIds) ? body.auditIds.map(String).slice(0, MAX_AUDITS) : [];
  const t0 = Date.now();

  // 2. Apify past 80% — first, so a slow count never delays it. Best-effort.
  let apify: string = "under";
  try {
    const { data: u } = await service.from("apify_account_usage")
      .select("monthly_usage_usd, max_monthly_usage_usd, cycle_start, cycle_end, captured_at")
      .order("captured_at", { ascending: false }).limit(1).maybeSingle();
    const alert = apifyUsageAlert((u ?? null) as ApifyUsageRow | null);
    if (alert) apify = await raiseOperatorAlert(service, "team_update", alert);
  } catch (e) {
    apify = "failed";
    console.error("[audit-watch] apify check failed:", e instanceof Error ? e.message : String(e));
  }

  // 3. The incomplete summaries due an email. Best-effort, never blocks the counts.
  const summaries = await sendDueIncompleteSummaries(service);

  // 1. Verdict counts.

  let q = service.from("ai_audits")
    .select("id, lead_id, business_name, business_type, location_text, website, audit_purpose, baseline_target_runs, created_at, verdict_counts, ai_audit_runs(id, status, created_at, scored_at)")
    /* Since v2's start, not v3's: the v3/v4 RE-SCORED copies were made earlier and carry the rule only as a run stamp.
       verdictCountsOf decides the rules (auditRulesFor, stamps first); a v2 Discovery gets the "none" mark once.
       The prospect re-check (2026-11-16, src/lib/prospectRecheck.ts) is counted the same way: the Opportunity score
       reads its counts once it replaces a hook. */
    .in("audit_purpose", ["discovery", "recheck"]).gte("created_at", AUDIT_RULES_V2_FROM)
    .order("created_at", { ascending: false }).limit(only.length ? only.length : 500);
  if (only.length) q = q.in("id", only);
  const { data: audits, error } = await q;
  if (error) return json({ ok: false, apify, summaries, error: error.message }, 500);

  const out = { checked: 0, stored: 0, none: 0, unsettled: 0, current: 0, failed: 0, left: false };
  for (const a of (audits ?? []) as Row[]) {
    if (out.stored + out.none + out.failed >= MAX_AUDITS || Date.now() - t0 > BUDGET_MS) { out.left = true; break; }
    out.checked++;
    const runs = (a.ai_audit_runs ?? []) as Array<{ id: string; status: string | null; created_at: string; scored_at: string | null }>;
    if (!runs.length || runs.some((r) => WORKING.has(String(r.status ?? "")))) { out.unsettled++; continue; }
    /* A re-check's runs 2 and 3 start staggered after run 1: never count it from fewer runs than it asks, unless the
       chain has stopped (no new run for 30 minutes — e.g. run 1 was refused by the budget), so it never waits for ever. */
    const targetRuns = Number((a as { baseline_target_runs?: number | null }).baseline_target_runs ?? 0);
    const newestRunAt = Math.max(...runs.map((r) => Date.parse(r.created_at) || 0));
    if (a.audit_purpose === "recheck" && runs.length < targetRuns && Date.now() - newestRunAt < 30 * 60_000) { out.unsettled++; continue; }
    const prevAt = Date.parse(String((a.verdict_counts as { at?: unknown } | null)?.at ?? "")) || 0;
    const newestInput = Math.max(...runs.map((r) => Date.parse(r.scored_at ?? r.created_at) || 0));
    if (!force && prevAt && prevAt >= newestInput) { out.current++; continue; }
    try {
      const { data: meta, error: mErr } = await service.from("ai_audit_runs")
        .select("id, crawl:results->crawl_check, rules:results->report_rules").eq("audit_id", a.id);
      if (mErr) throw mErr;
      const ids = ((meta ?? []) as Row[]).map((r) => r.id);
      const queue: Row[] = [];
      for (let from = 0; ; from += 1000) {
        const { data: page, error: qErr } = await service.from("ai_audit_queue").select("id, question, status, result")
          .in("run_id", ids).order("id", { ascending: true }).range(from, from + 999);
        if (qErr) throw qErr;
        queue.push(...(page ?? []));
        if (!page || page.length < 1000) break;
      }
      let lead: { website: string | null; place_id: string | null } | null = null;
      if (a.lead_id) {
        const { data } = await service.from("outreach_leads").select("website, place_id").eq("id", a.lead_id).maybeSingle();
        lead = (data as typeof lead) ?? null;
      }
      const counts = verdictCountsOf({
        audit: { business_name: a.business_name ?? "", business_type: a.business_type, location_text: a.location_text, website: a.website, audit_purpose: a.audit_purpose, created_at: a.created_at },
        queue, runMeta: ((meta ?? []) as Row[]).map((r) => ({ crawl: r.crawl, rules: r.rules })), lead,
      }, new Date().toISOString());
      /* No counts (e.g. a copy stamped with an older rule): a "none" mark with its time, so it is not re-read every tick.
         parseVerdictCounts reads the mark as null, so nothing scores from it. */
      const stored = counts ?? { v: 0, none: true, at: new Date().toISOString() };
      const { error: uErr } = await service.from("ai_audits").update({ verdict_counts: stored }).eq("id", a.id);
      if (uErr) throw uErr;
      if (counts) out.stored++; else out.none++;
    } catch (e) {
      out.failed++;
      console.error(`[audit-watch] ${a.id}:`, e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e));
    }
  }
  return json({ ok: true, apify, summaries, ...out });
});
