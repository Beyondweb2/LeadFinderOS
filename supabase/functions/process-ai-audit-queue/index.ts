import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SOURCES } from "../_shared/enrichment/sources.ts";
import { runEnrichSource, recordCostCorrection } from "../_shared/enrichment/runner.ts";
import { startAiSearch, pollAiSearchRun, fetchAiSearchItems, normalizeAiSearch, toCountryCode } from "../_shared/enrichment/ai-search.ts";
import { abortApifyRun } from "../_shared/enrichment/apify.ts";
import { runSeoScanCore } from "../_shared/enrichment/seo-scan-core.ts";
import { refreshApifyUsage } from "../_shared/enrichment/apify-usage.ts";
import { advanceBaseline, sweepStalledBaselines, ensureBaselinesForPaidOnboardings } from "../_shared/audit-baseline.ts";
import { resolveWhatsAppEnv, toWhatsAppNumber, sendViaGraph } from "../_shared/whatsapp-send.ts";
import { autoReplyEnvOn, phoneSuppressed } from "../_shared/auto-reply-rules.ts";
// Automation B: reuse the SHARED report aggregation (same buildReportData the SPA + public
// renderer use) so the WhatsApp {{2}} competitor list matches the report exactly.
import { buildReportData, type QueueRow, type RunRow } from "../../../src/lib/auditReport.ts";
import { buildReportSlug } from "../../../src/lib/reportSlug.ts";
import { isAggregatorUrl } from "../_shared/aggregators.ts";

// process-ai-audit-queue — cron-driven drain of ai_audit_queue, modelled on
// process-whatsapp-queue. ASYNC start-and-poll: each tick (a) POLLs in-flight Apify runs and
// folds any that SUCCEEDED, then (b) STARTs pending questions in PARALLEL (fan-out). A question
// row carries its Apify runId in result._apify while 'running', so the actor's multi-minute
// scrape is decoupled from the edge function's ~150s wall-clock — slow questions poll across
// ticks instead of aborting. Once a run's rows are all settled, they fold into
// ai_audit_runs.results and mention_rate.
//
// A PER-AUDIT/RUN cost cap (CAP_USD) stops a run that would exceed the cap: its
// remaining rows are dropped and the run is marked 'capped'. All writes use the
// service key; user_id is carried explicitly from the queue/audit rows.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ASYNC model: starts are just ~1s POST /runs calls, so we fan OUT — start many questions per
// tick and let them scrape concurrently on Apify (Phase-1 confirmed plan concurrency = 32).
/* GLOBAL IN-FLIGHT CEILING, so the audit queue cannot consume the whole Apify concurrency
   allowance. Directory scrapes share that allowance and starved on 2026-07-26 while a 6-audit
   batch was draining: this queue previously started rows up to START_BATCH per tick with no regard
   for how many actor runs were already live, so a big batch could hold 18+ concurrent runs.

   MEASURED FROM THE ACCOUNT (Apify STARTER): maxConcurrentActorRuns = 32, memory pool = 64GB.
   Question actors take 1024MB each and run ~155s; the other actors we use take 4096MB.

   24 for audits leaves 8 free. 8 is comfortably more than directory scrapes and enrichment need at
   once (a scrape is typically a single crawler run), and 24 is also the largest ceiling that keeps
   the MEMORY pool safe in the pessimistic mix: 24x1024MB + one 4096MB scan + 8x4096MB of scrapes =
   61,440MB of 65,536MB. Note that a SMALLER audit ceiling is worse here, not better - reserving 16
   slots for 4096MB actors would need 86,016MB and overcommit the pool. */
const AUDIT_IN_FLIGHT_CEILING = 24;
/* How much of a tick may already be spent before the (slow) SEO scan is deferred to the next one.
   Its actor allows up to 110s, and the cron now fires every 30s, so keep this well under the
   platform's invocation limit: draining + a scan must still finish comfortably. */
const SEO_TICK_BUDGET_MS = 20_000;
const START_BATCH = 12;          // max pending rows to START (claim) per tick — parallel fan-out,
                                 // kept well under the 32 concurrency ceiling to leave headroom for
                                 // other actors (SEO/maps). Total drain time ≈ the SLOWEST question,
                                 // not the sum — the key to sub-10-min audits.
const POLL_BATCH = 32;           // max in-flight 'running' rows to POLL per tick (across all runs).
/* SPEND CAPS. Re-costed 2026-07-30 against BILLED spend (ai_audit_runs.actor_cost_usd), not a price
   list: $0.0125 per question — see SOURCES.ai_search, measured at $0.01155 and rounded up — plus
   $0.12 per SEO scan. The previous arithmetic here used $0.0025 per question, which was ~4.6x low, so
   every figure below moved. VALUES ARE UNCHANGED; only the sums they were justified by are corrected.

   CAP_USD: the worst LEGITIMATE run is 12 questions plus one SEO scan = $0.15 + $0.12 = $0.27
   (previously believed $0.15). $1.00 leaves ~3.7x headroom, not the ~7x this comment used to claim.
   A paid baseline run is 10 questions = $0.125, or $0.245 with a scan, so it still cannot be
   truncated by the cap — the guarantee path is unaffected. A runaway run stops at $1. */
const CAP_USD = 1.0;             // per-RUN Apify cost ceiling (this audit run)
/* DAILY_CAP_USD: recomputed at the measured rate. A normal day of ~30 outreach audits (3 questions +
   a scan = $0.1575 each) is $4.73, plus three paid baselines (3 runs x (10 questions + scan) =
   $0.735 each) at $2.21 — a busy day lands near $6.94.

   ⚠️ $8 no longer "clears that comfortably": the margin is ~15%, where the old (wrong) arithmetic
   put a busy day at $5.15 and made $8 look like 55% headroom. Left at 8.0 deliberately rather than
   raised, because raising a safety ceiling is Paul's call and a cap that occasionally trips is a
   better failure than a shared Apify account exhausted — that took the audit engine down for five
   hours once. If genuinely busy days start hitting it, $12 restores the original intent.
   Note the SEO scan is ~76% of the outreach figure, so days dominated by no-website leads (which
   skip the scan) cost far less. */
const DAILY_CAP_USD = 8.0;       // per-USER rolling-24h ceiling (across audits) via the runner
const MAX_ATTEMPTS = 3;          // per queue row (= actor runs STARTED) before it's marked failed
// Async guards (RUN_TIMEOUT_MS is gone — nothing blocks on the scrape any more):
const MAX_RUN_AGE_MS = 12 * 60 * 1000;  // a started run must reach terminal within 12 min, else the
                                        // poll treats it as a failed attempt (and aborts it on Apify).
                                        // MUST sit ABOVE the actor's real max runtime: runs legitimately
                                        // take up to ~9 min (some ~12 min still succeed). At 5 min the guard
                                        // was culling healthy-but-slow runs → serial retry-storm (a 5-question
                                        // audit burned 8 Apify runs / 16.4 min). 12 min only catches
                                        // genuinely-hung runs, letting normal-slow ones finish on attempt 1.
const STALE_RUNNING_MS = 3 * 60 * 1000; // reclaim rows stuck 'running' with NO runId (a tick died
                                        // between claim and start) — rows WITH a runId are governed by
                                        // MAX_RUN_AGE_MS in the poll path, never by this reclaim.
const SEO_TIMEOUT_MS = 60_000;   // single-page SEO audit — well under the wall-clock (its own tick)
// mention_rate is scored over the engines the audit targeted (the queue row's list).
const DEFAULT_ENGINES = ["chatgpt", "gemini"];

// Automation B — audit-complete → WhatsApp follow-up with the public report link.
// audit_reply is sent via a DIRECT Graph call (4 positional vars), NOT the queue allowlist
// (WA_TEMPLATES only models the 2-var name/url templates). Name + lang MUST match the
// Meta-approved template exactly before live send (it's in Meta review; sends stay test-gated).
const AUDIT_REPLY_TEMPLATE = "audit_reply";
const AUDIT_REPLY_LANG = "en";
// Canonical public report URL (matches renderReportHtml's "View online" footer). NOTE: /a/<slug>
// must be wired (a Pages route → render-audit-report) before this link resolves; test-mode gated.
const REPORT_SITE_ORIGIN = "https://yoursites.uk";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
type Row = any;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    // --- Auth: internal cron (x-cron-secret or service-role bearer) OR admin JWT ---
    const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
    const authHeader = req.headers.get("Authorization") ?? "";
    const isCron =
      (!!cronSecret && req.headers.get("x-cron-secret") === cronSecret) ||
      (!!serviceKey && authHeader === `Bearer ${serviceKey}`);
    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    if (!isCron) {
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
      if (!token) return json({ ok: false, error: "unauthorized" }, 401);
      const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
      const { data: u } = await userClient.auth.getUser();
      if (!u?.user) return json({ ok: false, error: "unauthorized" }, 401);
      const { data: roleRow } = await service
        .from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
      if (!roleRow) return json({ ok: false, error: "forbidden" }, 403);
    }

    const apifyToken = Deno.env.get("APIFY_TOKEN") ?? "";
    if (!apifyToken) return json({ ok: true, skipped: "no_apify_token", processed: 0 });

    const estCost = SOURCES.ai_search.estCostUsd;

    // 0) Reclaim rows stranded in 'running' WITHOUT an Apify runId — i.e. a tick died between the
    //    pending→running claim and the start call, so the row never got a runId and would otherwise
    //    wedge the run. Reset those back to 'pending' (attempts+1, or 'failed' once exhausted).
    //    CRITICAL (async): a 'running' row that DOES carry result._apify.runId is legitimately
    //    long-lived (the actor scrapes for minutes) — it is governed by MAX_RUN_AGE_MS in the poll
    //    path, NOT here. Reclaiming it would strand a live actor run and start a duplicate, so we
    //    skip any row with a runId. Needs ai_audit_queue.updated_at; best-effort.
    try {
      const staleBefore = new Date(Date.now() - STALE_RUNNING_MS).toISOString();
      const { data: stale } = await service
        .from("ai_audit_queue").select("id, attempts, run_id, result")
        .eq("status", "running").lt("updated_at", staleBefore);
      const staleRows = ((stale ?? []) as Row[]).filter((r) => !r.result?._apify?.runId); // skip live async runs
      // Don't reclaim rows that belong to a cancelled run — re-queueing them would resurrect a
      // run the user stopped. Leave them; the cancelled path (finalise) cleans them up.
      const cancelledStaleRuns = new Set<string>();
      const staleRunIds = [...new Set(staleRows.map((r) => r.run_id))];
      if (staleRunIds.length) {
        const { data: cRuns } = await service
          .from("ai_audit_runs").select("id").in("id", staleRunIds).eq("status", "cancelled");
        for (const cr of (cRuns ?? []) as Row[]) cancelledStaleRuns.add(cr.id);
      }
      for (const r of staleRows) {
        if (cancelledStaleRuns.has(r.run_id)) continue; // cancelled run → don't re-queue
        const attempts = (Number(r.attempts) || 0) + 1;
        const failed = attempts >= MAX_ATTEMPTS;
        await service.from("ai_audit_queue").update({
          status: failed ? "failed" : "pending",
          attempts,
          ...(failed ? { result: { error: "stuck_running_reclaimed" } } : {}),
        }).eq("id", r.id);
      }
    } catch (e) {
      console.error("[process-ai-audit-queue] reclaim skipped (updated_at column missing?):", e instanceof Error ? e.message : e);
    }

    // 0a2) PAID BASELINE safety net. MUST stay above the SEO step: that step returns early on
    //      its own tick, so anything after it is skipped on those ticks. The completion hook
    //      below is one-shot, and when its single attempt failed a paid baseline stayed at one
    //      run forever while the customer was promised a 3-run average. This re-drives any
    //      baseline below its target. advanceBaseline refuses to start a repeat while one is in
    //      flight, so running it every tick is one cheap query, not a fan-out.
    try {
      await sweepStalledBaselines(service);
    } catch (e) {
      console.error("[process-ai-audit-queue] baseline sweep failed:", e instanceof Error ? e.message : String(e));
    }

    // Wall-clock budget for this invocation. The SEO step at the end is the only genuinely slow
    // thing in a tick (its actor allows up to 110s), so it is skipped when the draining work has
    // already used most of the budget. Skipping costs nothing: the next tick picks it up, and the
    // scan is idempotent (results.seo is the done-marker).
    const tickStartedAt = Date.now();

    /* 0a1) APIFY ACCOUNT USAGE. Reads the real monthly figure and records it where we can see it,
            throttled to once per 15 min, so the warning arrives before Apify stops serving rather
            than after. One unbilled API call; never fatal. */
    let apifyUsage: Awaited<ReturnType<typeof refreshApifyUsage>> = null;
    try {
      apifyUsage = await refreshApifyUsage(service, apifyToken);
    } catch (e) {
      console.warn("[process-ai-audit-queue] apify usage refresh failed:", e instanceof Error ? e.message : String(e));
    }

    // 0a3) PAID CLIENT baseline backstop. The stripe webhook starts the baseline on the payment
    //      event, but that is a single network attempt. This guarantees the outcome: any PAID
    //      onboarding row whose lead has no baseline gets one started here, every tick, until it
    //      does. startPaidBaseline is idempotent, so this is one cheap query when there is nothing
    //      to do. Must also stay ABOVE the SEO step, which returns early on its own ticks.
    try {
      await ensureBaselinesForPaidOnboardings(service);
    } catch (e) {
      console.error("[process-ai-audit-queue] paid-baseline backstop failed:", e instanceof Error ? e.message : String(e));
    }

    // NOTE: the SEO step used to live HERE, before question draining, and it returned from the
    // tick as soon as it scanned one run. That made every website audit cost a whole tick before
    // any question could start: measured on a 6-audit batch (4 with websites), the first question
    // did not start for ~4 minutes and the whole batch took 8-10. It now runs at the END of the
    // tick instead, so questions are always started and polled first. See "SEO STEP LAST" below.

    // Shared helpers ────────────────────────────────────────────────────────────
    // Cache audit lookups (country + business name) per audit_id.
    const auditCache = new Map<string, { businessName: string; countryCode: string; userId: string }>();
    async function getAudit(auditId: string) {
      if (auditCache.has(auditId)) return auditCache.get(auditId)!;
      const { data: a } = await service
        .from("ai_audits").select("business_name, country, user_id").eq("id", auditId).maybeSingle();
      const v = {
        businessName: a?.business_name ?? "",
        countryCode: toCountryCode(a?.country ?? null),
        userId: a?.user_id ?? "",
      };
      auditCache.set(auditId, v);
      return v;
    }
    // Accumulated per-run Apify cost. `attempts` = number of actor runs STARTED for a row, so
    // sum(attempts)*estCost is the run's spend so far (async: cost is incurred at start).
    const runCost = new Map<string, number>();
    async function accumulatedCost(runId: string): Promise<number> {
      if (runCost.has(runId)) return runCost.get(runId)!;
      const { data: rows } = await service.from("ai_audit_queue").select("attempts").eq("run_id", runId);
      const spent = (rows ?? []).reduce((s: number, r: Row) => s + (Number(r.attempts) || 0) * estCost, 0);
      runCost.set(runId, spent);
      return spent;
    }
    const cappedRuns = new Set<string>();
    const touchedRuns = new Set<string>();

    // ── PHASE A: POLL in-flight Apify runs ────────────────────────────────────────
    // Every 'running' row carrying result._apify.runId is a scrape in progress. Poll them ALL
    // concurrently (across every active audit) so parallel runs advance together. Each poll is a
    // SHORT HTTP call — it never blocks on the scrape, so many can run inside one tick.
    const { data: inflight } = await service
      .from("ai_audit_queue")
      .select("id, run_id, audit_id, attempts, result")
      .eq("status", "running")
      .limit(POLL_BATCH);
    const waiting = ((inflight ?? []) as Row[]).filter((r) => r.result?._apify?.runId);
    for (const r of waiting) touchedRuns.add(r.run_id);

    async function pollRow(row: Row): Promise<void> {
      const runId: string = row.result._apify.runId;
      const startedAtTick: string | undefined = row.result._apify.startedAtTick;
      const attempts = Number(row.attempts) || 0;
      // A failed actor run → retry (back to 'pending', clear _apify so the next tick starts a FRESH
      // run) or give up ('failed') once we've started MAX_ATTEMPTS runs.
      const failAttempt = async (reason: string) => {
        const giveUp = attempts >= MAX_ATTEMPTS;
        await service.from("ai_audit_queue").update({
          status: giveUp ? "failed" : "pending",
          result: giveUp ? { error: reason } : null, // null clears _apify → re-claimable + re-started
        }).eq("id", row.id);
      };
      try {
        const { status, usageTotalUsd, computeUnits } = await pollAiSearchRun(runId, apifyToken);
        if (status === "SUCCEEDED") {
          const items = await fetchAiSearchItems(runId, apifyToken);
          const audit = await getAudit(row.audit_id);
          const result = normalizeAiSearch(items, audit.businessName) as Record<string, unknown>;
          // What Apify says this question actually cost. Stored under a leading-underscore meta
          // key (same convention as _apify) so nothing that walks the engine keys trips on it.
          if (usageTotalUsd != null || computeUnits != null) {
            result._cost_usd = usageTotalUsd;
            // The cap counted estCost when this row STARTED; book the difference now that Apify has
            // told us the real figure, so the rolling 24h sum reflects money actually spent.
            if (usageTotalUsd != null) {
              const audit = await getAudit(row.audit_id);
              await recordCostCorrection(service, {
                userId: audit.userId || row.user_id || null,
                type: "ai_search",
                estimatedUsd: estCost,
                actualUsd: usageTotalUsd,
                note: "ai_search_poll_reconcile",
              });
            }
            result._compute_units = computeUnits;
          }
          await service.from("ai_audit_queue").update({ status: "done", result }).eq("id", row.id);
          return;
        }
        if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
          await failAttempt(`apify_${status}`);
          return;
        }
        // Still READY/RUNNING. MAX_RUN_AGE guard: a run that won't finish in time is treated as a
        // failed attempt (and aborted on Apify to stop billing) — this REPLACES the stale-reclaim's
        // role for async rows. Otherwise leave it to poll again next tick.
        const ageMs = startedAtTick ? Date.now() - new Date(startedAtTick).getTime() : 0;
        if (ageMs > MAX_RUN_AGE_MS) {
          await abortApifyRun(runId, apifyToken); // best-effort — stop billing on the stuck run
          await failAttempt("run_age_exceeded");
        }
      } catch (e) {
        // A transient poll/fetch HTTP error must NOT fail the row — leave it 'running' and re-poll
        // next tick. Only a terminal status or the age guard converts a run to a failed attempt.
        console.error(`[process-ai-audit-queue] poll error run=${runId}:`, e instanceof Error ? e.message : e);
      }
    }
    await Promise.allSettled(waiting.map(pollRow));

    // ── PHASE B: START pending questions (PARALLEL fan-out) ───────────────────────
    // Claim up to START_BATCH oldest pending rows (atomic pending→running guard, same race-safety as
    // before) and START an Apify run for each CONCURRENTLY. Starts are ~1s POST calls, so firing many
    // at once makes all questions scrape simultaneously on Apify (ceiling 32) → total drain ≈ the
    // slowest question, not the sum. The per-RUN CAP_USD gate still bounds starts per run.
    let started = 0;
    const { data: candidates } = await service
      .from("ai_audit_queue")
      .select("id")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(START_BATCH);
    const candidateIds = (candidates ?? []).map((r: Row) => r.id);
    if (candidateIds.length > 0) {
      const { data: claimedRows } = await service
        .from("ai_audit_queue")
        .update({ status: "running" })
        .in("id", candidateIds)
        .eq("status", "pending") // atomic: only rows STILL pending are claimed + returned
        .select("id, audit_id, run_id, user_id, question, engines, attempts");
      const claimed = (claimedRows ?? []) as Row[];
      for (const r of claimed) touchedRuns.add(r.run_id);

      // Per-RUN cost gate: only start as many rows per run as CAP_USD covers; mark the rest 'capped'.
      const toStart: Row[] = [];
      const perRunBudget = new Map<string, number>();
      for (const row of claimed) {
        let remaining = perRunBudget.get(row.run_id);
        if (remaining === undefined) {
          const spent = await accumulatedCost(row.run_id);
          remaining = Math.max(0, Math.floor((CAP_USD - spent) / estCost + 1e-9));

      // GLOBAL CEILING: count actor runs already live across every audit and every user, and
      // never start more than the headroom allows. This is what keeps concurrency available for
      // directory scrapes rather than letting a big audit batch take everything.
      // Counts every 'running' row, NOT just those carrying result._apify.runId. The actor is
      // started before that runId is persisted, so a row mid-start is already holding an Apify
      // slot - and a row whose runId write failed is exactly the leaked run we most want counted.
      // Filtering on the runId would undercount precisely the dangerous cases. Over-counting a
      // stale row is self-healing: the reclaim at the top of each tick releases it after 3 min.
      const { count: liveNow } = await service
        .from("ai_audit_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "running");
      const headroom = Math.max(0, AUDIT_IN_FLIGHT_CEILING - (liveNow ?? 0));
      if (headroom < remaining) {
        console.log(`[process-ai-audit-queue] in-flight ceiling: ${liveNow ?? 0}/${AUDIT_IN_FLIGHT_CEILING} actor runs live, starting at most ${headroom} this tick (headroom reserved for directory scrapes)`);
        remaining = headroom;
      }
          perRunBudget.set(row.run_id, remaining);
        }
        if (remaining > 0) {
          toStart.push(row);
          perRunBudget.set(row.run_id, remaining - 1);
        } else {
          cappedRuns.add(row.run_id);
          await service.from("ai_audit_queue")
            .update({ status: "failed", result: { error: "capped" } }).eq("id", row.id);
        }
      }

      // START one row: daily-cap check + cost/usage recording via runEnrichSource (the billable event
      // is the START), then persist the runId so PHASE A polls it on later ticks. attempts+1 = one
      // actor run started. noCacheWrite: a cached start-marker would replay a dead runId on retry.
      async function startRow(row: Row): Promise<boolean> {
        const audit = await getAudit(row.audit_id);
        try {
          const outcome = await runEnrichSource<{ runId: string; datasetId: string | null }>({
            service,
            userId: audit.userId || row.user_id,
            type: "ai_search",
            cacheKey: `aiaudit:${row.id}`,
            estCostUsd: estCost,
            capUsd: DAILY_CAP_USD,
            noCacheWrite: () => true, // never cache the start marker (would poison retries)
            run: async () => {
              const { runId, datasetId } = await startAiSearch(String(row.question), audit.countryCode, apifyToken);
              return { result: { runId, datasetId }, costUsd: estCost };
            },
          });
          if (outcome.capReached) {
            cappedRuns.add(row.run_id);
            await service.from("ai_audit_queue")
              .update({ status: "failed", result: { error: "daily_cap" } }).eq("id", row.id);
            return false;
          }
          if (!outcome.result?.runId) throw new Error("no_run_id");
          await service.from("ai_audit_queue").update({
            status: "running",
            attempts: (Number(row.attempts) || 0) + 1,
            result: { _apify: { runId: outcome.result.runId, datasetId: outcome.result.datasetId ?? null, startedAtTick: new Date().toISOString() } },
          }).eq("id", row.id);
          console.log(`[ai-audit] started q="${String(row.question).slice(0, 60)}" run=${outcome.result.runId}`);
          return true;
        } catch (e) {
          // Start failed (no runId stored) — bump attempts and re-queue inline (or fail at MAX).
          const attempts = (Number(row.attempts) || 0) + 1;
          const failed = attempts >= MAX_ATTEMPTS;
          await service.from("ai_audit_queue").update({
            status: failed ? "failed" : "pending",
            attempts,
            result: failed ? { error: e instanceof Error ? e.message : String(e) } : null,
          }).eq("id", row.id);
          console.error(`[process-ai-audit-queue] start failed (attempt ${attempts}${failed ? ", giving up" : ""}):`, e instanceof Error ? e.message : e);
          return false;
        }
      }
      const startResults = await Promise.allSettled(toStart.map(startRow));
      started = startResults.filter((s) => s.status === "fulfilled" && s.value === true).length;
    }

    // Finalise runs whose rows are now ALL settled (done/failed) or capped. A still-'running'
    // (polling) row keeps its run open — so a run never finalises while a question is in flight.
    const finalised = await finaliseSettledRuns(service, [...touchedRuns], estCost, cappedRuns);

    /* SEO STEP LAST. One scan per tick, after every question has been started, polled and
       finalised, so a website audit never delays its own questions. Skipped when this invocation
       has already spent most of its budget - the scan can wait a tick, questions cannot, and
       results.seo being the done-marker makes the deferral free. */
    let seoRan = false;
    const elapsedMs = Date.now() - tickStartedAt;
    if (elapsedMs < SEO_TICK_BUDGET_MS) {
      try {
        seoRan = await maybeRunSeoStep(service, apifyToken);
      } catch (e) {
        console.error("[process-ai-audit-queue] SEO step failed:", e instanceof Error ? e.message : String(e));
      }
    } else {
      console.log(`[process-ai-audit-queue] skipping the SEO step this tick - ${Math.round(elapsedMs / 1000)}s already spent draining (budget ${SEO_TICK_BUDGET_MS / 1000}s)`);
    }

    return json({
      ok: true, started, polled: waiting.length, finalised, capped: [...cappedRuns],
      seo: seoRan ? "ran" : "skipped",
      // Present only on the tick that refreshed it (every ~15 min), so the figure is visible
      // wherever the cron's response is inspected without another query.
      ...(apifyUsage
        ? { apify_spend: { used: apifyUsage.monthlyUsageUsd, cap: apifyUsage.maxMonthlyUsageUsd, pct: apifyUsage.usagePct, cycle_ends: apifyUsage.cycleEnd } }
        : {}),
    });
  } catch (e) {
    console.error("[process-ai-audit-queue] error:", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "unknown_error" }, 500);
  }
});

/**
 * Run ONE on-page SEO audit per tick for a website audit that hasn't been graded yet.
 * Returns true if it ran (the caller then ends the tick so a second actor call never
 * stacks). Eligibility: an open run (pending/running) whose audit has a website and whose
 * results.seo is not yet set. On success/failure it writes results.seo (a failure marker
 * counts as "done" FOR THAT RUN so it isn't retried within it). Cost flows through the
 * runner cache/cap harness.
 *
 * ONE SCAN PER AUDIT, NOT PER RUN. A paid baseline is three runs of the same questions
 * minutes apart, and the website cannot have changed in between, so re-scanning it each
 * time cost $0.36 per client (82% of the total) for no extra information. A run now
 * inherits a usable scan from a sibling run of the SAME audit when one exists, and only
 * scans when there is nothing to inherit. Single-run outreach audits have no siblings, so
 * they behave exactly as before.
 */
/** How long a sibling run's scan stays reusable. Comfortably covers a baseline's runs (minutes
 *  apart) while a genuine re-audit weeks later still gets a fresh look at the site. */
const SEO_REUSE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** A scan worth inheriting: graded, not a failure marker. Mirrors isRenderableSeo in
 *  src/lib/auditReport.ts — the same test the report uses to decide it can render an SEO block.
 *  Failure markers ({error, checked_at}, ~2 of 55 stored scans) deliberately fail this, so a
 *  failed scan never blocks the next run from trying again. */
function isReusableSeo(seo: unknown): boolean {
  if (!seo || typeof seo !== "object") return false;
  const o = seo as Record<string, unknown>;
  if (o.error) return false;
  const c = o.categories as Record<string, unknown> | undefined;
  return !!c && typeof c === "object" && !!c.onPage && !!c.contentTechnical;
}

// deno-lint-ignore no-explicit-any
async function maybeRunSeoStep(service: any, apifyToken: string): Promise<boolean> {
  const { data: openRuns } = await service
    .from("ai_audit_runs").select("id, audit_id, results")
    .in("status", ["pending", "running"]).order("created_at", { ascending: true }).limit(10);

  const openList = (openRuns ?? []) as Row[];
  for (const [openIdx, run] of openList.entries()) {
    const results = run.results && typeof run.results === "object" ? run.results : {};
    if (results.seo) continue; // already graded (success or failure marker)

    const { data: audit } = await service
      .from("ai_audits").select("user_id, has_website, website, location_text").eq("id", run.audit_id).maybeSingle();
    if (!audit?.has_website || !audit?.website) continue; // no-website audits get no SEO section

    // INHERIT before scanning. Any OTHER run of this same audit, recent enough, that holds a
    // GRADED scan (failure markers excluded by isReusableSeo, so a failed scan still retries)
    // is copied onto this run instead of paying for the same site again. Returns nothing —
    // copying costs no actor call, so the tick carries on to the next run.
    const { data: siblings } = await service
      .from("ai_audit_runs")
      .select("id, results")
      .eq("audit_id", run.audit_id)
      .neq("id", run.id)
      .gte("created_at", new Date(Date.now() - SEO_REUSE_MAX_AGE_MS).toISOString())
      .order("created_at", { ascending: false })
      .limit(5);
    const inherited = ((siblings ?? []) as Row[])
      .map((sib) => (sib.results && typeof sib.results === "object" ? (sib.results as Row).seo : undefined))
      .find(isReusableSeo);
    if (inherited) {
      const { data: freshRow } = await service.from("ai_audit_runs").select("results").eq("id", run.id).maybeSingle();
      const curResults = freshRow?.results && typeof freshRow.results === "object" ? freshRow.results : {};
      await service.from("ai_audit_runs").update({ results: { ...curResults, seo: inherited } }).eq("id", run.id);
      console.log(`[process-ai-audit-queue] run ${run.id}: reused this audit's existing SEO scan (no re-scan)`);
      continue;
    }

    // This tick belongs to the scan: the step returns straight after, so no questions drain.
    // Say so out loud. A batch of website audits created together therefore sits pending for
    // roughly one tick per run, which reads exactly like a stalled queue if nothing explains it.
    console.log(
      `[process-ai-audit-queue] SEO scan for run ${run.id} (${openIdx + 1} of ${openList.length} open runs) - deferring question draining this tick`,
    );

    const website = String(audit.website);
    let seo: unknown;
    try {
      const outcome = await runEnrichSource({
        service,
        userId: audit.user_id ?? null,
        type: "seo_audit",
        cacheKey: `seo:${run.id}`,             // unique per run → re-runs fetch fresh
        estCostUsd: SOURCES.seo_audit.estCostUsd,
        capUsd: DAILY_CAP_USD,
        run: async () => {
          const r = await runSeoScanCore(website, { token: apifyToken });
          if (!r.ok) throw new Error(r.error + (r.detail ? `: ${r.detail}` : ""));
          // REAL cost when the lookup found the run, estimate only as a fallback. This is the most
          // expensive actor we run ($0.12-ish a scan), so recording the estimate here was the
          // single biggest contributor to the cap measuring $1.36 against a $73.55 bill.
          const seoActual = (r as { usageTotalUsd?: number | null }).usageTotalUsd;
          return { result: r.seo, costUsd: typeof seoActual === "number" ? seoActual : SOURCES.seo_audit.estCostUsd };
        },
      });
      seo = outcome.capReached
        ? { error: "daily_cap", checked_at: new Date().toISOString() }
        : (outcome.result ?? { error: "empty", checked_at: new Date().toISOString() });
    } catch (e) {
      seo = { error: e instanceof Error ? e.message : "seo_failed", checked_at: new Date().toISOString() };
      console.error("[process-ai-audit-queue] SEO audit failed:", seo);
    }

    // Read-modify-write so the SEO block merges with whatever else is on results.
    const { data: fresh } = await service.from("ai_audit_runs").select("results").eq("id", run.id).maybeSingle();
    const cur = fresh?.results && typeof fresh.results === "object" ? fresh.results : {};
    await service.from("ai_audit_runs").update({ results: { ...cur, seo } }).eq("id", run.id);
    return true;
  }
  return false;
}

/**
 * For each candidate run, if all its queue rows are settled (done/failed) — or it hit
 * the cap — fold the per-question results into ai_audit_runs.results and compute
 * mention_rate = (named engine-datapoints) / (total engine-datapoints). Returns the
 * number of runs finalised. When runIds is empty, scans runs still marked running/pending
 * that have no unsettled rows left (self-healing after a prior tick).
 */
// deno-lint-ignore no-explicit-any
async function finaliseSettledRuns(service: any, runIds: string[], estCost: number, cappedRuns?: Set<string>): Promise<number> {
  let ids = runIds;
  if (ids.length === 0) {
    // Discover runs that are still open but may now be fully settled.
    const { data: openRuns } = await service
      .from("ai_audit_runs").select("id").in("status", ["pending", "running"]).limit(20);
    ids = (openRuns ?? []).map((r: Row) => r.id);
  }
  let finalised = 0;
  // Auto-report kill-switch: ON unless AUTO_REPORT_ENABLED is explicitly "0"/"false"/"off". Default ON.
  const autoReportEnabled = !["0", "false", "off"].includes((Deno.env.get("AUTO_REPORT_ENABLED") ?? "").trim().toLowerCase());
  // Extraction invokes are QUEUED per-run and awaited AFTER the loop, so a slow extract-competitors
  // call never blocks finalising the other runs — but the edge runtime still can't cut them off.
  const extractionInvokes: Promise<void>[] = [];
  // Automation B: runs that just completed AND came from an outreach lead → send the audit_reply
  // WhatsApp AFTER extraction finishes (so {{2}} competitors are the CLEANED list). Collected in the
  // loop, processed after the extraction await below.
  const auditReplyJobs: { runId: string; auditId: string }[] = [];
  // Auto-report: audits that just finalised → generate their public /r/ report AFTER extraction (so
  // the report reflects the cleaned competitor list). Collected in the loop; deduped + fired below.
  const reportJobs: { auditId: string }[] = [];
  // D2 — completion auto-send: audits that just went COMPLETE (never capped) whose lead should be
  // queued an operator-selected template via whatsapp_auto_replies (trigger 'audit_complete').
  // Gated by the SAME master kill-switch as the first-reply rule (AUTO_AUDIT_REPLY_ENABLED) plus a
  // non-null whatsapp_outreach_state.audit_complete_template. The lead_id UNIQUE index gives
  // first-trigger-wins vs the first-reply rule (23505 → skip, one send per lead ever).
  const completionSendJobs: { auditId: string }[] = [];
  // PAID BASELINE: a finished run of a multi-run baseline either triggers the next repeat run
  // or finalises the averaged snapshot. Capped runs count too (they produced partial data and
  // advanceBaseline treats them as usable), so a capped run cannot stall the chain forever.
  const baselineJobs: { auditId: string }[] = [];

  for (const runId of ids) {
    // A cancelled run is terminal — never resurrect it or flip it to 'complete'. Drop any
    // leftover pending/running rows (e.g. one in-flight when the user hit Stop) so they aren't
    // reprocessed, and leave the run marked 'cancelled'.
    const { data: runRow } = await service.from("ai_audit_runs").select("status, audit_id").eq("id", runId).maybeSingle();
    const prevStatus = runRow?.status ?? null; // status BEFORE this finalise write — drives the once-per-run guard
    if (runRow?.status === "cancelled") {
      await service.from("ai_audit_queue")
        .update({ status: "cancelled" }).eq("run_id", runId).in("status", ["pending", "running"]);
      continue;
    }

    const { data: rows } = await service
      .from("ai_audit_queue")
      .select("question, engines, status, result, attempts")
      .eq("run_id", runId)
      .order("created_at", { ascending: true });
    if (!rows || rows.length === 0) continue;

    const isCapped = cappedRuns?.has(runId) ?? false;
    const allSettled = rows.every((r: Row) => r.status === "done" || r.status === "failed");
    if (!allSettled && !isCapped) continue; // still in progress

    // If capped, drop any rows that never ran so they aren't reprocessed next tick.
    if (isCapped) {
      const leftover = rows.filter((r: Row) => r.status === "pending" || r.status === "running");
      if (leftover.length) {
        await service.from("ai_audit_queue")
          .update({ status: "failed", result: { error: "capped" } })
          .eq("run_id", runId).in("status", ["pending", "running"]);
        for (const r of leftover) r.status = "failed";
      }
    }

    // Fold per-question results + score mention_rate over the targeted engines. Track
    // failed/done question counts so the UI can distinguish "everything failed" from
    // "genuinely not named anywhere". mention_rate is computed ONLY over done rows.
    let named = 0;
    let total = 0;
    let doneQuestions = 0;
    let failedQuestions = 0;
    const questions = rows.map((r: Row) => {
      const engines: string[] = Array.isArray(r.engines) && r.engines.length ? r.engines : DEFAULT_ENGINES;
      const result = r.status === "done" ? (r.result ?? null) : null;
      if (r.status === "failed") failedQuestions++;
      if (result) {
        doneQuestions++;
        for (const e of engines) {
          total++;
          if (result?.[e]?.named === true) named++;
        }
      }
      return { question: r.question, status: r.status, engines: result };
    });
    const mentionRate = total > 0 ? Number((named / total).toFixed(4)) : null;

    // Preserve any SEO block the SEO step wrote (order-independent — either step may run
    // first; both merge rather than overwrite).
    const { data: runNow } = await service.from("ai_audit_runs").select("results").eq("id", runId).maybeSingle();
    const existingSeo = runNow?.results && typeof runNow.results === "object" ? (runNow.results as Row).seo : undefined;

    // MEASURED actor spend for this run: the sum of what Apify charged for each question,
    // not an estimate. null when no question reported a figure (older rows, or all failed).
    let actorCostUsd: number | null = null;
    for (const r of rows) {
      const c = (r.result as Record<string, unknown> | null)?._cost_usd;
      if (typeof c === "number") actorCostUsd = Number(((actorCostUsd ?? 0) + c).toFixed(6));
    }

    const results = {
      engines: DEFAULT_ENGINES,
      summary: {
        named_datapoints: named,
        total_datapoints: total,
        mention_rate: mentionRate,
        done_questions: doneQuestions,
        failed_questions: failedQuestions,
        total_questions: rows.length,
        actor_cost_usd: actorCostUsd,
      },
      questions,
      ...(existingSeo ? { seo: existingSeo } : {}),
    };
    // A run where EVERY question failed is NOT a complete audit. Marking it "complete" is how
    // an Apify outage looked like working software: on 2026-07-26 the account started returning
    // HTTP 402 (out of credit) at 08:17, every question failed, and six runs across four
    // businesses were still stored as complete with mention_rate 0 — indistinguishable from a
    // real "you are invisible" result. It also poisons everything downstream: an empty public
    // report gets published, and a 3-run paid baseline would happily average three outages into
    // the measuring stick behind the money-back guarantee. Fail loudly instead.
    const allFailed = rows.length > 0 && doneQuestions === 0 && failedQuestions === rows.length;
    // Surface WHY, so an operator sees "402" rather than an empty audit.
    const errorCounts = new Map<string, number>();
    if (allFailed) {
      for (const r of rows) {
        const err = String((r.result as Row | null)?.error ?? "").trim();
        if (err) errorCounts.set(err, (errorCounts.get(err) ?? 0) + 1);
      }
    }
    const dominantError = [...errorCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    if (allFailed && dominantError) {
      (results as Record<string, unknown>).error = dominantError;
      console.error(`[process-ai-audit-queue] run ${runId}: ALL ${rows.length} questions failed — ${dominantError}`);
    }
    const runStatus = isCapped ? "capped" : allFailed ? "failed" : "complete";
    // ATOMIC completion flip: gate on .in(status,[pending,running]) + .select() so only the tick that
    // actually transitions the run pending/running → terminal "wins". Overlapping pollers can't both
    // flip the same run, so every completion side-effect (extract-competitors, audit_reply, auto-report)
    // fires EXACTLY ONCE — for the winner. A later tick that re-sees a settled run updates 0 rows and
    // skips, which also stops it clobbering extract-competitors' cleaned results.
    // actor_cost_usd is written alongside; migration-tolerant retry below if the column is absent.
    const flipRun = (extra: Record<string, unknown>) =>
      service.from("ai_audit_runs")
        .update({ results, mention_rate: mentionRate, status: runStatus, ...extra })
        .eq("id", runId)
        .in("status", ["pending", "running"])
        .select("id");
    let { data: flipped, error: writeErr } = await flipRun({ actor_cost_usd: actorCostUsd });
    // This IS the atomic completion flip, so a missing column must never stall a run: if the
    // actor_cost_usd migration has not been applied, flip without it rather than retrying
    // forever and leaving every audit stuck in 'running'.
    if (writeErr && /actor_cost_usd/i.test(writeErr.message ?? "")) {
      console.warn("[process-ai-audit-queue] actor_cost_usd column missing — finalising without the cost figure");
      ({ data: flipped, error: writeErr } = await flipRun({}));
    }
    if (writeErr) {
      console.error(`[process-ai-audit-queue] finalise write failed for run ${runId}:`, writeErr.message);
      continue; // don't fire side-effects on a failed write — the run retries next tick
    }
    if (!Array.isArray(flipped) || flipped.length === 0) continue; // another poller already finalised this run
    finalised++;

    // Auto-invoke extract-competitors ONCE per run, at the transition to terminal (prevStatus was
    // pending/running — never for a run already complete/capped/cancelled on entry). Queued here
    // (not awaited in-loop) so it can't block finalising other runs; strictly AFTER the results/
    // status write above has RESOLVED, so it can't race the fold that extract-competitors re-reads
    // and rewrites. Fail-safe: never throws; a non-2xx is logged (a 401/403 misconfig is visible,
    // not a silent no-op) and can never flip the run back out of complete.
    // Nothing to extract from a run with no answers, so skip the call entirely.
    if (!allFailed && (prevStatus === "pending" || prevStatus === "running")) {
      extractionInvokes.push((async () => {
        try {
          const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/extract-competitors`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`,
              "x-cron-secret": Deno.env.get("CRON_SECRET") ?? "",
              "x-internal-job": "1",
            },
            body: JSON.stringify({ runId }),
          });
          if (!res.ok) {
            const txt = await res.text().catch(() => "");
            console.error(`[process-ai-audit-queue] extract-competitors failed for run ${runId}: HTTP ${res.status} ${txt.slice(0, 300)}`);
          }
        } catch (e) {
          console.error(`[process-ai-audit-queue] extract-competitors invoke error for run ${runId}:`, e instanceof Error ? e.message : String(e));
        }
      })());
      // Automation B: queue the audit_reply send for AFTER extraction. Only for a genuinely
      // COMPLETE run (not capped — a capped run has partial data, don't message a lead about it).
      // The lead_id gate + idempotency are enforced inside maybeSendAuditReply.
      // Gated OFF by default (same flag as reply→audit). When off, no report row is published and
      // no audit_reply is sent. Set AUTO_REPLY_FLOW_ENABLED=1 to re-enable (no code change).
      if (Deno.env.get("AUTO_REPLY_FLOW_ENABLED") === "1" && !isCapped && !allFailed && runRow?.audit_id) auditReplyJobs.push({ runId, auditId: runRow.audit_id as string });
      // Auto-report: queue a public /r/ business report for this finalised audit — processed AFTER
      // extraction (below) so it reflects the cleaned competitors. COMPLETE runs only (not capped):
      // the existing-report SELECT guard makes the FIRST report permanent, so a capped run's
      // partial-data report would block the full report from a later re-run — capped audits stay on
      // the manual button. No lead-id gate; skipped when AUTO_REPORT_ENABLED is off. Existing-report
      // guard + fail-safe wrapping live in the processor below.
      if (autoReportEnabled && !isCapped && !allFailed && runRow?.audit_id) reportJobs.push({ auditId: runRow.audit_id as string });
      // D2 — completion auto-send candidates (COMPLETE only, like audit_reply/auto-report). The
      // heavier checks (setting, lead, phone, suppression) run once, after the loop.
      if (!isCapped && !allFailed && runRow?.audit_id) completionSendJobs.push({ auditId: runRow.audit_id as string });
      // Baseline chain runs for capped runs as well — see baselineJobs above.
      // An all-failed run must never count toward a paid baseline.
      if (!allFailed && runRow?.audit_id) baselineJobs.push({ auditId: runRow.audit_id as string });
    }
  }
  // Await the queued extraction calls so the edge runtime doesn't cut them off when we return.
  if (extractionInvokes.length) await Promise.allSettled(extractionInvokes);

  // PAID BASELINE chain. After extraction so a finalised snapshot reflects the cleaned
  // competitor data. Deduped per audit, and each call is wrapped: a baseline problem must
  // never break finalisation, the report, or the auto-send below.
  for (const auditId of new Set(baselineJobs.map((j) => j.auditId))) {
    try {
      await advanceBaseline(service, auditId);
    } catch (e) {
      console.error(`[process-ai-audit-queue] baseline advance failed for audit ${auditId}:`, e instanceof Error ? e.message : String(e));
    }
  }
  // Automation B: NOW that competitors are cleaned, send the audit_reply follow-ups. Each is
  // fully guarded + wrapped so a send failure can never break finalisation.
  for (const job of auditReplyJobs) {
    try {
      await maybeSendAuditReply(service, job.runId, job.auditId);
    } catch (e) {
      console.error(`[process-ai-audit-queue] audit_reply error for audit ${job.auditId}:`, e instanceof Error ? e.message : String(e));
    }
  }

  // Auto-report: NOW that competitors are cleaned, generate the public /r/ business report for each
  // finalised audit — but ONLY if one doesn't already exist (SELECT guard on audit_id + report_type
  // 'profile', so re-runs never overwrite). Calls generate-report's internal branch (service key +
  // x-cron-secret + x-internal-job). Wrapped so any failure only logs and NEVER blocks/fails the
  // audit — the manual "Generate listing" button remains the fallback. Sequential so two runs of the
  // same audit in one tick can't both slip past the guard.
  for (const job of reportJobs) {
    try {
      const { data: existing } = await service
        .from("business_reports")
        .select("id")
        .eq("audit_id", job.auditId)
        .eq("report_type", "profile")
        .limit(1)
        .maybeSingle();
      if (existing) {
        console.log(`[process-ai-audit-queue] auto-report skipped for audit ${job.auditId}: a profile report already exists.`);
        continue;
      }
      const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`,
          "x-cron-secret": Deno.env.get("CRON_SECRET") ?? "",
          "x-internal-job": "1",
        },
        body: JSON.stringify({ auditId: job.auditId }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        console.error(`[process-ai-audit-queue] auto-report failed for audit ${job.auditId}: HTTP ${res.status} ${txt.slice(0, 300)}`);
      } else {
        console.log(`[process-ai-audit-queue] auto-report generated for audit ${job.auditId}.`);
      }
    } catch (e) {
      console.error(`[process-ai-audit-queue] auto-report error for audit ${job.auditId}:`, e instanceof Error ? e.message : String(e));
    }
  }

  // D2 — completion auto-send: queue the operator-selected template for each COMPLETE audit's lead
  // via whatsapp_auto_replies (processed ≥3 min later by process-whatsapp-queue mode 'auto_replies',
  // which applies the send-time guards: decline-since, opted_out/not_interested, suppression, and
  // flagged_no_link for url-templates without a claim link). Everything here is defensive: missing
  // column/table (SQL not run yet) or a null setting → the whole feature is dormant, nothing throws.
  if (completionSendJobs.length && autoReplyEnvOn()) {
    let completeTemplate: string | null = null;
    try {
      const { data: st, error: stErr } = await service
        .from("whatsapp_outreach_state").select("audit_complete_template").eq("id", 1).maybeSingle();
      if (!stErr) completeTemplate = (st?.audit_complete_template as string | null) ?? null;
    } catch { /* column missing → the insert path below stays dormant */ }
    for (const job of completionSendJobs) {
      try {
        const { data: audit } = await service
          .from("ai_audits").select("lead_id").eq("id", job.auditId).maybeSingle();
        const leadId = (audit?.lead_id as string | null) ?? null;
        if (!leadId) continue; // manual audit — nobody to message

        // AUTO-CHAIN UPGRADE (runs regardless of the completion-template setting): a reply that
        // arrived BEFORE the audit completed parked its pitch as 'awaiting_audit' (carrying the
        // reply template). Now the audit is COMPLETE, arm it — an UPDATE, so the lead_id unique
        // index is never violated and first-trigger-wins is preserved. Capped/failed runs never
        // reach here (completionSendJobs is complete-only), so their rows stay visible for a human.
        // The processor re-checks declines-since-queue-time at fire time, so a "no thanks" sent
        // during the audit run still cancels the pitch.
        try {
          const { data: upgraded } = await service.from("whatsapp_auto_replies")
            .update({ status: "pending", fire_after: new Date(Date.now() + 3 * 60_000).toISOString(), updated_at: new Date().toISOString() })
            .eq("lead_id", leadId).eq("status", "awaiting_audit")
            .select("id");
          if (Array.isArray(upgraded) && upgraded.length > 0) {
            console.log(`[auto-send] audit ${job.auditId} complete → armed the awaiting_audit pitch for lead ${leadId}.`);
            continue; // the reply-triggered row owns this lead — no completion insert
          }
        } catch { /* table/column missing → fall through to the insert path's own guards */ }

        if (!completeTemplate) continue; // completion auto-send off → only the upgrade path above
        const { data: lead } = await service
          .from("outreach_leads").select("phone, country, status, is_archived").eq("id", leadId).maybeSingle();
        /* Archived → arm NOTHING. Deliberately a `continue` and not a skipped_* row: lead_id is
           UNIQUE on whatsapp_auto_replies, so ANY row is a permanent once-ever claim. Writing a skip
           row here would look tidy and would quietly mean that un-archiving the lead later could
           never pitch them — the slot would already be spent. The send-point guard in
           process-whatsapp-queue stays as the second line for a lead archived AFTER arming; this one
           stops the row existing in the first place. */
        if (lead?.is_archived === true) {
          console.log(`[auto-send] audit ${job.auditId}: lead ${leadId} is archived — not arming an audit_complete pitch (no row written, once-ever slot left intact).`);
          continue;
        }
        const to = toWhatsAppNumber((lead?.phone as string) ?? "", (lead?.country as string | null) ?? null);
        if (!to) continue; // no usable phone — nothing to queue
        // Queue-time suppression/refusal parity with the first-reply trigger: a suppressed or
        // declined lead burns the once-ever slot with skipped_suppressed instead of pending.
        const refused = ["opted_out", "not_interested"].includes((lead?.status as string) ?? "") ||
          (await phoneSuppressed(service, to));
        const { error: qErr } = await service.from("whatsapp_auto_replies").insert({
          lead_id: leadId,
          phone: to,
          trigger: "audit_complete",
          template_name: completeTemplate,
          status: refused ? "skipped_suppressed" : "pending",
          fire_after: new Date(Date.now() + 3 * 60_000).toISOString(),
        });
        if (qErr && (qErr as { code?: string }).code !== "23505") {
          console.error(`[auto-send] completion queue insert failed for lead ${leadId}:`, (qErr as { message?: string }).message);
        } else if (!qErr) {
          console.log(`[auto-send] audit ${job.auditId} complete → queued '${completeTemplate}' for lead ${leadId}${refused ? " (skipped_suppressed)" : ""}.`);
        } // 23505 = the first-reply trigger already owns this lead — first trigger wins.
      } catch (e) {
        console.error(`[auto-send] completion queue error for audit ${job.auditId}:`, e instanceof Error ? e.message : String(e));
      }
    }
  }
  return finalised;
}

/** business name → clean lowercase-hyphenated slug (mirrors generate-report.slugify). */
function slugify(name: string): string {
  return (name || "").toLowerCase().normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "") || "business";
}

/** Top competitor names → a readable list ("LeeP, Linda Carr and Stonehouse"). Caps at 3
 *  so the WhatsApp line stays tight. Empty string when there are none. */
function formatCompetitors(list: string[]): string {
  const top = (list ?? []).map((s) => (s ?? "").trim()).filter(Boolean).slice(0, 3);
  if (top.length === 0) return "";
  if (top.length === 1) return top[0];
  return `${top.slice(0, -1).join(", ")} and ${top[top.length - 1]}`;
}

/** Insert the PUBLIC audit-report mapping row (slug → audit). Unique slug via -N retry on 23505.
 *  Returns the slug, or null on failure. This row is BOTH the link source (served by
 *  render-audit-report) and the once-per-audit idempotency marker. */
// deno-lint-ignore no-explicit-any
async function insertAuditReportRow(service: any, businessName: string, auditId: string, leadId: string): Promise<string | null> {
  /* buildReportSlug appends the 8-hex audit code. The name alone no longer resolves, so the code is
     what makes the link work — see src/lib/reportSlug.ts. The -N retry below is kept as a belt on an
     essentially-impossible collision (same name AND same code). */
  const base = buildReportSlug(businessName, auditId);
  for (let attempt = 1; attempt <= 50; attempt++) {
    const slug = attempt === 1 ? base : `${base}-${attempt}`;
    const { data, error } = await service.from("business_reports").insert({
      slug, business_name: businessName || "This business", audit_id: auditId, lead_id: leadId,
      status: "published", report_type: "audit",
    }).select("slug").single();
    if (!error && data) return data.slug as string;
    if ((error as { code?: string })?.code !== "23505") {
      console.error(`[audit-reply] report row insert failed for audit ${auditId}:`, error?.message);
      return null;
    }
  }
  return null;
}

/**
 * Automation B — when a lead's audit completes, publish its report page and WhatsApp the lead
 * the link via the audit_reply template. GATED: only for audits tied to an outreach lead
 * (ai_audits.lead_id), and only ONCE per audit (guarded by an existing report_type='audit' row).
 * Runs AFTER extract-competitors so {{2}} is the cleaned competitor list. Never throws to the caller.
 */
// deno-lint-ignore no-explicit-any
async function maybeSendAuditReply(service: any, runId: string, auditId: string): Promise<void> {
  // 1) Lead gate — a manually-run audit (no lead) has nobody to message.
  const { data: audit } = await service.from("ai_audits")
    .select("id, lead_id, business_name, business_type, location_text, specialism")
    .eq("id", auditId).maybeSingle();
  if (!audit?.lead_id) return;

  // 2) Idempotency — one audit-report row per audit. If it exists, we've already published+sent.
  const { data: existing } = await service.from("business_reports")
    .select("id").eq("audit_id", auditId).eq("report_type", "audit").limit(1).maybeSingle();
  if (existing) return;

  // 3) Build the report data with the SHARED aggregation (competitors for {{2}} == the report's list).
  const { data: run } = await service.from("ai_audit_runs")
    .select("id, audit_id, run_number, status, mention_rate, results, created_at").eq("id", runId).maybeSingle();
  const { data: qrows } = await service.from("ai_audit_queue")
    .select("id, question, status, result").eq("run_id", runId).order("created_at", { ascending: true });
  const data = buildReportData((qrows ?? []) as QueueRow[], (run ?? null) as RunRow | null, {
    businessName: audit.business_name ?? "",
    businessType: audit.business_type ?? "",
    locationText: audit.location_text ?? "",
    specialisms: audit.specialism ?? "",
    isAggregatorUrl,
  });
  if (!data) return; // no completed questions (e.g. all-failed) → nothing to report/send

  // 4) Publish the report row (the link + idempotency marker). Created BEFORE the send so the link
  //    exists even when the send is skipped (test mode / no competitors / no phone).
  const slug = await insertAuditReportRow(service, audit.business_name ?? "", auditId, audit.lead_id as string);
  if (!slug) return;
  const link = `${REPORT_SITE_ORIGIN}/a/${slug}`;

  // 5) Template vars.
  const trade = (audit.business_type ?? "").trim();
  const business = (audit.business_name ?? "").trim();
  const competitors = formatCompetitors(data.competitors);

  // {{2}} REQUIRED but empty → do NOT fabricate a competitor line, and do NOT send (a template
  // send with an empty required var would fail at Meta anyway). The report link is still published
  // above, so the lead can still be reached manually.
  if (!competitors) {
    console.log(`[audit-reply] audit_reply send skipped: no named competitors for {{2}} (report published: ${slug}).`);
    return;
  }

  // 6) Lead phone — and whether the operator has withdrawn this business.
  const { data: lead } = await service.from("outreach_leads")
    .select("phone, country, is_archived").eq("id", audit.lead_id).maybeSingle();
  /* This path is a DIRECT Graph send: it does not go through whatsapp_auto_replies, so the
     send-time archived guard in process-whatsapp-queue cannot cover it. Checked here instead.
     Gated by AUTO_REPLY_FLOW_ENABLED, which is currently unset — so this is pre-emptive, exactly
     like the process-sms-queue guard: it has to be in place BEFORE the flag is turned on. */
  if (lead?.is_archived === true) {
    console.log(`[audit-reply] audit ${auditId}: lead ${audit.lead_id} is archived — report published (${slug}) but send skipped.`);
    return;
  }
  const to = toWhatsAppNumber(lead?.phone ?? "", lead?.country ?? null);
  if (!to) {
    console.log(`[audit-reply] audit ${auditId}: report published (${slug}) but lead ${audit.lead_id} has no usable phone — send skipped.`);
    return;
  }

  // 7) DIRECT Graph send of audit_reply (4 positional vars). Test-mode gated — never sends live
  //    until WHATSAPP_TEST_MODE === "off" AND the secrets exist.
  const payload = {
    type: "template",
    template: {
      name: AUDIT_REPLY_TEMPLATE,
      language: { code: AUDIT_REPLY_LANG },
      components: [{ type: "body", parameters: [trade, competitors, business, link].map((t) => ({ type: "text", text: t })) }],
    },
  };
  const env = resolveWhatsAppEnv();
  if (!env.live) {
    console.log(`[audit-reply] WOULD SEND audit_reply → ${to} | {{1}}="${trade}" {{2}}="${competitors}" {{3}}="${business}" {{4}}="${link}" (test mode / secrets missing — not sent)`);
    return;
  }
  const res = await sendViaGraph(env.accessToken, env.phoneNumberId, to, payload);
  if (res.ok) console.log(`[audit-reply] sent audit_reply to ${to} (msg ${res.messageId}) for audit ${auditId}`);
  else console.error(`[audit-reply] send failed for audit ${auditId}: ${res.error}`);
}
