import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SOURCES } from "../_shared/enrichment/sources.ts";
import { runEnrichSource, recordCostCorrection } from "../_shared/enrichment/runner.ts";
import { startAiSearch, pollAiSearchRun, fetchAiSearchItems, normalizeAiSearch, captureGoogleSerp, toCountryCode } from "../_shared/enrichment/ai-search.ts";
import { abortApifyRun } from "../_shared/enrichment/apify.ts";
import {
  mayFinishWithoutStragglers,
  TARGETING_STRAGGLER_ERROR,
} from "../_shared/targeting-straggler.ts";
import { runSeoScanCore } from "../_shared/enrichment/seo-scan-core.ts";
import { refreshApifyUsage } from "../_shared/enrichment/apify-usage.ts";
import { advanceBaseline, sweepStalledBaselines, ensureBaselinesForPaidOnboardings, fireDueRemeasures } from "../_shared/audit-baseline.ts";
import { maybeSendFreeCheckResult } from "../_shared/free-check-result.ts";
import { maybeSendRemeasureResults } from "../_shared/remeasure-results.ts";
import { toWhatsAppNumber } from "../_shared/whatsapp-send.ts";
import { reconcileFirstReplyAuditIntents } from "../_shared/first-reply-audit.ts";
import { AUDIT_ONLY_STATUS, autoReplyEnvOn, phoneSuppressed } from "../_shared/auto-reply-rules.ts";
import { seoScanAllowed } from "../../../src/lib/auditKind.ts";
import { cellNamed } from "../../../src/lib/namedSignal.ts";
import { CRAWL_CHECK_VERSION } from "../../../src/lib/crawlCheck.ts";
import { advanceHookState, evaluateHookQuestion, isHookState } from "../../../src/lib/hookAudit.ts";
import { RETRY_CLEAN_CAP, runSettlement, shouldInvokeCleaning, finaliseReadiness, markCleaningExhausted } from "../_shared/run-finalise.ts";

// process-ai-audit-queue — cron-driven drain of ai_audit_queue, modelled on
// process-whatsapp-queue. ASYNC start-and-poll: each tick (a) POLLs in-flight Apify runs and
// folds any that SUCCEEDED, then (b) STARTs pending questions in PARALLEL (fan-out). A question
// row carries its Apify runId in result._apify while 'running', so the actor's multi-minute
// scrape is decoupled from the edge function's ~150s wall-clock — slow questions poll across
// ticks instead of aborting. Once a run's rows are all settled, they fold into
// ai_audit_runs.results and mention_rate.
//
// A PER-AUDIT/RUN cost cap (CAP_USD) stops a run that would exceed the cap: its
// remaining rows are dropped and the run is marked 'capped' (rows carry error 'cost_cap'). A full
// queue is NOT a cap: those rows are deferred back to 'pending' and retried next tick. All writes use the
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

   RAISED 8.0 -> 12.0 on 2026-07-30, on Paul's decision. At $8 a busy day left only ~15% margin, and
   the failure mode of tripping is worse than the failure mode of spending: the cap stops a run
   part-drained, which leaves an audit with some questions answered and some 'capped' — broken data on
   the measurement the guarantee is settled against. $12 restores roughly the 55% headroom the original
   $8 was believed to have before the per-question cost was corrected.

   This is a per-USER rolling-24h ceiling this app enforces on ITSELF. It says nothing about the shared
   Apify account's own balance, which is what actually took the audit engine down for five hours — that
   is only visible in the Apify dashboard.
   Note the SEO scan is ~76% of an outreach audit, so days dominated by no-website leads (which skip
   the scan) cost far less. */
const DAILY_CAP_USD = 12.0;      // per-USER rolling-24h ceiling (across audits) via the runner
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

    /* The reply webhook only records durable intent. Reconciliation lives on this existing cron so
       a cold-start/network failure cannot strand a qualifying first reply, and it runs before the
       Apify token guard because creating the queue is separate from consuming it. */
    try {
      const replyRecovery = await reconcileFirstReplyAuditIntents(service);
      if (replyRecovery.checked) console.log(`[first-reply-audit] reconciliation ${JSON.stringify(replyRecovery)}`);
    } catch (e) {
      console.error("[first-reply-audit] reconciliation failed:", e instanceof Error ? e.message : String(e));
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

    // 0a4) DAY-28 REPLAYS — fire and stamp (Paul, 2026-09-12). Reads outreach_leads.remeasure_due_date
    //      and computes nothing; refuses refunded, archived and unpaid; one replay per baseline,
    //      enforced by the claim trigger + partial unique index, not by this tick. One cheap query
    //      when nothing is due, which is every tick but a handful a month.
    try {
      await fireDueRemeasures(service);
    } catch (e) {
      console.error("[process-ai-audit-queue] day-28 replay tick failed:", e instanceof Error ? e.message : String(e));
    }

    // NOTE: the SEO step used to live HERE, before question draining, and it returned from the
    // tick as soon as it scanned one run. That made every website audit cost a whole tick before
    // any question could start: measured on a 6-audit batch (4 with websites), the first question
    // did not start for ~4 minutes and the whole batch took 8-10. It now runs at the END of the
    // tick instead, so questions are always started and polled first. See "SEO STEP LAST" below.

    // Shared helpers ────────────────────────────────────────────────────────────
    // Cache audit lookups (country + business name) per audit_id.
    /* ⚠️ businessType and locationText are fetched for the NAME MATCHER, not for the scrape. They
       let nameMatches try a shortened prefix of the business name when the strict core misses —
       "DK Gas Professional" where the answer says exactly that but the stored core demands more.
       Distinctiveness is judged by stripping the trade and the town, so it needs both. Absent, the
       matcher keeps its strict behaviour. */
    const auditCache = new Map<string, { businessName: string; businessType: string; locationText: string; countryCode: string; userId: string }>();
    async function getAudit(auditId: string) {
      if (auditCache.has(auditId)) return auditCache.get(auditId)!;
      const { data: a } = await service
        .from("ai_audits").select("business_name, business_type, location_text, country, user_id").eq("id", auditId).maybeSingle();
      const v = {
        businessName: a?.business_name ?? "",
        businessType: a?.business_type ?? "",
        locationText: a?.location_text ?? "",
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
          const result = normalizeAiSearch(items, audit.businessName, {
            trade: audit.businessType, town: audit.locationText,
          }) as Record<string, unknown>;
          /* The Google organic results the actor returned for this same question. Stored beside the
             other meta keys, NOT as an engine — see the long note at captureGoogleSerp.
             ⛔ COSTS NOTHING EXTRA: the actor scrapes the SERP as its base output on every question
             whether we keep it or not, and these items are already in memory. No extra run, no extra
             Apify request, no change to the actor input.
             ⚠️ Attached only when the actor actually returned an organic block, so "no capture" and
             "Google returned nothing" stay distinguishable in the stored row. */
          const serp = captureGoogleSerp(items);
          if (serp) result._google_serp = serp;
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
    /* ══ THE BASELINE-PRIORITY CLAIM — Paul's call, 2026-08-17 ═══════════════════════════════════
       Two-phase CANDIDATE SELECTION, same atomic claim. With 5-market Coverage waves now routine
       (~80 rows per wave) and the claim previously strict oldest-first, a paying customer's
       guarantee measurement (RG's ~6 Oct re-measure included) could wait minutes behind
       prospecting. Baseline rows are therefore selected FIRST each tick, then the remainder fills
       oldest-first — when no baseline is pending, the fill query IS the previous behaviour,
       byte-for-byte in effect.
       ⛔ THE CLAIM ITSELF IS UNCHANGED: one update .in(ids).eq(status,'pending').select(), so two
       overlapping ticks still cannot double-claim a row. Only which ids are OFFERED changed.
       ⚠️ Baselines are identified by ai_audits.baseline_target_runs NOT NULL — the same column the
       straggler rule and the finaliser key on. Two reads rather than an embedded join, per the
       house rule (bulk-jobs): a wrong relationship name returns rows with the field silently
       absent, which would read as "no baselines" forever. */
    const { data: baselineAuditRows } = await service
      .from("ai_audits")
      .select("id")
      .not("baseline_target_runs", "is", null);
    const baselineAuditIds = ((baselineAuditRows ?? []) as Row[]).map((r) => r.id);
    const candidateIds: string[] = [];
    if (baselineAuditIds.length > 0) {
      const { data: prio } = await service
        .from("ai_audit_queue")
        .select("id")
        .eq("status", "pending")
        .in("audit_id", baselineAuditIds)
        .order("created_at", { ascending: true })
        .limit(START_BATCH);
      for (const r of (prio ?? []) as Row[]) candidateIds.push(r.id);
    }
    if (candidateIds.length < START_BATCH) {
      const { data: rest } = await service
        .from("ai_audit_queue")
        .select("id")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(START_BATCH);
      for (const r of (rest ?? []) as Row[]) {
        if (candidateIds.length >= START_BATCH) break;
        if (!candidateIds.includes(r.id)) candidateIds.push(r.id);
      }
    }
    if (candidateIds.length > 0) {
      const { data: claimedRows } = await service
        .from("ai_audit_queue")
        .update({ status: "running" })
        .in("id", candidateIds)
        .eq("status", "pending") // atomic: only rows STILL pending are claimed + returned
        .select("id, audit_id, run_id, user_id, question, engines, attempts");
      const claimed = (claimedRows ?? []) as Row[];
      /* ⛔ PRIORITY HOLDS THROUGH THE SLOT HANDOUT TOO. The update returns rows in arbitrary order,
         and the in-flight headroom below is handed out in iteration order — without this sort, a
         baseline row could be DEFERRED while a market row two places later took the last Apify
         slot, which is the exact inversion the two-phase selection exists to prevent. */
      const baselineIdSet = new Set(baselineAuditIds);
      claimed.sort((a, b) => Number(baselineIdSet.has(b.audit_id)) - Number(baselineIdSet.has(a.audit_id)));
      for (const r of claimed) touchedRuns.add(r.run_id);

      /* ══ TWO GATES, AND THEY MEAN OPPOSITE THINGS ═════════════════════════════════════════
         ⛔ THEY USED TO SHARE ONE VARIABLE AND ONE OUTCOME, AND IT COST A BATCH. Both the per-run
         COST budget and the global CONCURRENCY headroom were folded into `remaining`, so a row that
         merely arrived while the queue was full was marked `failed` with error 'capped' — the same
         label a real spend cap writes. Measured 2026-08-08: an audit_and_push job of 25 leads got 15
         through and 10 marked 'capped' with **$0.0000 spent**, rolling 24h spend at $4.67 against a
         $12 cap. Nothing was unaffordable. The batch had simply filled all 24 in-flight slots, and
         the last 10 rows were destroyed rather than retried. Paul went looking at spend because the
         label said cost.

           COST is terminal    — the money for this run is gone; failing the row is correct.
           HEADROOM is transient — the slot is free again in a minute; the row must be DEFERRED.

         ⚠️ The headroom count also moved OUT of the per-run branch. It was computed inside
         `if (remaining === undefined)`, i.e. once per run rather than once per tick, and never
         decremented as rows were selected — so within a single tick every run measured the same
         stale `liveNow` and could collectively overshoot the ceiling. It is now counted once and
         decremented locally as slots are handed out. */
      const toStart: Row[] = [];
      const deferred: Row[] = [];
      const perRunCostBudget = new Map<string, number>();

      /* GLOBAL CEILING: actor runs already live across every audit and every user. Keeps concurrency
         available for directory scrapes rather than letting a big audit batch take everything.
         Counts every 'running' row, NOT just those carrying result._apify.runId — the actor is
         started before that runId is persisted, so a row mid-start already holds an Apify slot, and
         a row whose runId write failed is exactly the leaked run we most want counted. Over-counting
         a stale row is self-healing: the reclaim at the top of each tick releases it after 3 min.
         ⚠️ The rows we just claimed are themselves 'running', so they are inside this count — which
         is why the headroom is measured before any of them is handed a slot. */
      const { count: liveNow } = await service
        .from("ai_audit_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", "running");
      let headroomLeft = Math.max(0, AUDIT_IN_FLIGHT_CEILING - ((liveNow ?? 0) - claimed.length));

      for (const row of claimed) {
        let costLeft = perRunCostBudget.get(row.run_id);
        if (costLeft === undefined) {
          const spent = await accumulatedCost(row.run_id);
          costLeft = Math.max(0, Math.floor((CAP_USD - spent) / estCost + 1e-9));
          perRunCostBudget.set(row.run_id, costLeft);
        }

        /* ⛔ A REAL CAP. This run has spent its budget; the row will never be affordable, so it is
           terminal. 'cost_cap' rather than 'capped' so the reason is legible at a glance and cannot
           be confused with a full queue ever again. */
        if (costLeft <= 0) {
          cappedRuns.add(row.run_id);
          await service.from("ai_audit_queue")
            .update({ status: "failed", result: { error: "cost_cap" } }).eq("id", row.id);
          continue;
        }

        /* ⛔ NOT A CAP AT ALL. The queue is busy. Put the row back to 'pending' and let the next
           tick claim it — it costs nothing, nothing has been started, and the work is still wanted.
           It is deliberately NOT added to cappedRuns: marking the run capped here would finalise an
           audit that has not been attempted. */
        if (headroomLeft <= 0) { deferred.push(row); continue; }

        toStart.push(row);
        perRunCostBudget.set(row.run_id, costLeft - 1);
        headroomLeft--;
      }

      if (deferred.length) {
        /* Back to pending in one write. Guarded on 'running' so a row someone else has already
           moved on is left alone. */
        await service.from("ai_audit_queue")
          .update({ status: "pending" })
          .in("id", deferred.map((r) => r.id))
          .eq("status", "running");
        console.log(`[process-ai-audit-queue] in-flight ceiling ${liveNow ?? 0}/${AUDIT_IN_FLIGHT_CEILING}: DEFERRED ${deferred.length} row(s) back to pending for the next tick (not failed, nothing spent)`);
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
    const finalised = await finaliseSettledRuns(service, [...touchedRuns], estCost, cappedRuns, apifyToken);

    /* 🔴 RETRY THE STUCK CLEANINGS. extract-competitors fires ONCE at finalisation; when gpt-4o
       returns a malformed batch ("model omitted N of M ids") it stamps complete:false and, until
       now, nothing retried — so an audit sat uncleaned for hours and its audit_reply refused with
       "the cleaner hasn't run" (Kia Electrical, 2026-09-16; 19 runs / 15 leads found stuck). A fresh
       invoke clears the flaky omission nearly always. Bounded so a genuinely-unsalvageable run can't
       burn OpenAI for ever: attempts < RETRY_CAP, spaced ≥ RETRY_SPACING_MS apart, few per tick. */
    let cleaningRetries = 0;
    try {
      cleaningRetries = await retryStuckCleanings(service);
    } catch (e) {
      console.error("[process-ai-audit-queue] cleaning retry sweep failed:", e instanceof Error ? e.message : String(e));
    }

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
      .from("ai_audits").select("user_id, has_website, website, location_text, audit_purpose").eq("id", run.audit_id).maybeSingle();
    if (!audit?.has_website || !audit?.website) continue; // no-website audits get no SEO section

    /* ⛔ THE PURPOSE DECIDES, AND IT IS ASKED HERE TOO (2026-09-15). create-ai-audit seeds
       results.seo with the skip marker, and until today that MARKER was the only thing standing
       between an outreach audit and a paid Apify scan — i.e. a flag, set by one caller, that any
       other insert path silently omits. `seoScanAllowed` is the same predicate create-ai-audit
       reads; a null or unknown purpose (every pre-2026-09-12 row, and any future caller that
       forgets) does NOT scan. Nothing is written here: a refused run simply has no SEO section,
       which is exactly what an outreach report should have. */
    if (!seoScanAllowed(audit.audit_purpose as string | null)) continue;

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
/* ⛔ EVERY FINALISED RUN MUST LEAVE A CLEANING RECEIPT, INCLUDING A FAILED ONE. Since 2026-08-28
 * the regex competitor scraper is deleted (ai-search.ts), so a run whose cleaning never happened
 * has an EMPTY competitor list — indistinguishable on screen from "AI named nobody" unless
 * something records the attempt. extract-competitors stamps its own outcome; this covers the case
 * where it could not be reached at all, which is precisely the silent one.
 * Read-modify-write on results (jsonb, no migration) and never throws: a missing receipt must not
 * flip a finalised run back out of complete. */
// deno-lint-ignore no-explicit-any
async function stampCleaningFailure(service: any, runId: string, detail: string): Promise<void> {
  try {
    const { data } = await service.from("ai_audit_runs").select("results").eq("id", runId).maybeSingle();
    const cur = data?.results && typeof data.results === "object" ? data.results : {};
    const attempts = Number((cur as { competitor_cleaning?: { attempts?: unknown } })?.competitor_cleaning?.attempts ?? 0) + 1;
    await service.from("ai_audit_runs").update({
      results: {
        ...cur,
        competitor_cleaning: {
          at: new Date().toISOString(), model: null, attempts, items_total: null, items_cleaned: 0,
          complete: false, errors: [detail],
        },
      },
    }).eq("id", runId);
  } catch (e) {
    console.error(`[process-ai-audit-queue] could not stamp cleaning failure for ${runId}:`, e instanceof Error ? e.message : e);
  }
}

/* ── RETRY STUCK COMPETITOR CLEANINGS ─────────────────────────────────────────────────────────────
   extract-competitors runs ONCE at finalisation; a malformed gpt-4o batch ("model omitted N of M
   ids") stamps competitor_cleaning.complete=false and nothing retried it — so the audit_reply for
   that lead refused ("the cleaner hasn't run") for hours. A fresh invoke clears the flaky omission
   nearly always. This sweep re-invokes extract-competitors for complete-but-incomplete runs, BOUNDED
   so an unsalvageable run can't burn OpenAI for ever: attempts < RETRY_CAP, spaced, few per tick. */
// RETRY_CLEAN_CAP is imported from _shared/run-finalise.ts: ONE cap for this sweep AND the finaliser's hold.
const RETRY_CLEAN_SPACING_MS = 4 * 60_000; // don't hammer the same run every 30s tick
const RETRY_CLEAN_PER_TICK = 5;            // bound cost + tick time
// deno-lint-ignore no-explicit-any
async function retryStuckCleanings(service: any): Promise<number> {
  const { data, error } = await service
    .from("ai_audit_runs").select("id, results")
    .eq("status", "complete")
    .filter("results->competitor_cleaning->>complete", "eq", "false")
    .gte("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString())
    .limit(30);
  if (error || !Array.isArray(data)) return 0;
  const now = Date.now();
  /* ⛔ A run that already has competitors is SENDABLE — resolveAuditReplyVars gates on competitors,
     not on a perfect stamp — so retrying it is pure wasted gpt-4o spend (Kia reached 6 attempts with
     competitors long since extracted). Only retry runs with NO usable competitors yet. */
  const hasCompetitors = (results: unknown): boolean => {
    const qs = (results as { questions?: Array<{ engines?: Record<string, { competitors?: unknown[] }> }> } | null)?.questions;
    if (!Array.isArray(qs)) return false;
    return qs.some((q) => q.engines && Object.values(q.engines).some((e) => Array.isArray(e?.competitors) && e.competitors.length > 0));
  };
  const eligible = (data as Row[]).filter((r) => {
    const c = r.results?.competitor_cleaning;
    if (!c || c.complete === true) return false;
    if (hasCompetitors(r.results)) return false;              // already sendable — don't re-clean
    const attempts = Number(c.attempts ?? 1);
    const atMs = Date.parse(c.at ?? "");
    return attempts < RETRY_CLEAN_CAP && (!Number.isFinite(atMs) || now - atMs > RETRY_CLEAN_SPACING_MS);
  }).slice(0, RETRY_CLEAN_PER_TICK);
  let n = 0;
  for (const r of eligible) {
    try {
      const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/extract-competitors`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cron-secret": Deno.env.get("CRON_SECRET") ?? "", "x-internal-job": "1" },
        body: JSON.stringify({ runId: r.id }),
      });
      if (res.ok) n++;
      else console.error(`[process-ai-audit-queue] cleaning retry failed for run ${r.id}: HTTP ${res.status}`);
    } catch (e) {
      console.error(`[process-ai-audit-queue] cleaning retry error for run ${r.id}:`, e instanceof Error ? e.message : String(e));
    }
  }
  if (n) console.log(`[process-ai-audit-queue] retried ${n} stuck competitor cleanings`);
  return n;
}

// deno-lint-ignore no-explicit-any
async function finaliseSettledRuns(service: any, runIds: string[], estCost: number, cappedRuns?: Set<string>, apifyToken = ""): Promise<number> {
  let ids = runIds;
  if (ids.length === 0) {
    // Discover runs that are still open but may now be fully settled.
    const { data: openRuns } = await service
      .from("ai_audit_runs").select("id").in("status", ["pending", "running", "processing"]).limit(20);
    ids = (openRuns ?? []).map((r: Row) => r.id);
  }
  let finalised = 0;
  // Auto-report kill-switch: ON unless AUTO_REPORT_ENABLED is explicitly "0"/"false"/"off". Default ON.
  const autoReportEnabled = !["0", "false", "off"].includes((Deno.env.get("AUTO_REPORT_ENABLED") ?? "").trim().toLowerCase());
  // Extraction invokes are QUEUED per-run and awaited AFTER the loop, so a slow extract-competitors
  // call never blocks finalising the other runs — but the edge runtime still can't cut them off.
  const extractionInvokes: Promise<void>[] = [];
  /* Site crawl (crawl-check) — fired automatically for the lead of EVERY audit that finalises, so
     every audited lead gets its crawlability faults + site info without the operator pressing the
     button (Paul, 2026-09-17: "it's free, no reason to wait for me to remember"). Free (fetches
     only, never Apify), queued like the extraction calls and awaited after the loop, fail-safe. */
  const crawlInvokes: Promise<void>[] = [];
  const processingRuns: Array<{ runId: string; auditId: string; finalStatus: string; allFailed: boolean }> = [];
  // Automation B: runs that just completed AND came from an outreach lead → send the audit_reply
  // WhatsApp AFTER extraction finishes (so {{2}} competitors are the CLEANED list). Collected in the
  // loop, processed after the extraction await below.
  /* ⛔ ITS OWN LIST, DELIBERATELY. A free-check result must not inherit an unrelated kill
     switch: the visitor asked for this result thirty seconds ago and is waiting for it.
     Same SUCCESS conditions though: COMPLETE and not capped. maybeSendFreeCheckResult does its own
     lane check (enrichment_source = 'free_check'), so every other audit falls straight through. */
  const freeCheckJobs: { runId: string; auditId: string }[] = [];
  // Auto-report: audits that just finalised → generate their public /r/ report AFTER extraction (so
  // the report reflects the cleaned competitor list). Collected in the loop; deduped + fired below.
  const reportJobs: { auditId: string }[] = [];
  // D2 — completion auto-send: audits that just went COMPLETE (never capped) whose lead should be
  // queued an operator-selected template via whatsapp_auto_replies (trigger 'audit_complete').
  // Gated by the SAME master kill-switch as the first-reply rule (AUTO_AUDIT_REPLY_ENABLED) plus a
  // non-null whatsapp_outreach_state.audit_complete_template. The lead_id UNIQUE index gives
  // first-trigger-wins vs the first-reply rule (23505 → skip, one send per lead ever).
  const completionSendJobs: { auditId: string }[] = [];
  /* ⛔ RUNS THAT FINISHED NON-COMPLETE, so a parked auto-reply can be SURFACED instead of stalling.
     The upgrade below only fires for COMPLETE runs, so a reply-triggered pitch parked as
     'awaiting_audit' whose audit ended capped or failed sat on that status forever — invisible, with
     nothing to fire it and nothing saying so. The operator's experience was "the auto-audit just
     doesn't run sometimes", and the only way to see it was querying the table. */
  const stalledAutoReplyJobs: { auditId: string; runStatus: string; reason: string }[] = [];
  // PAID BASELINE: a finished run of a multi-run baseline either triggers the next repeat run
  // or finalises the averaged snapshot. Capped runs count too (they produced partial data and
  // advanceBaseline treats them as usable), so a capped run cannot stall the chain forever.
  const baselineJobs: { auditId: string }[] = [];

  for (const runId of ids) {
    // A cancelled run is terminal — never resurrect it or flip it to 'complete'. Drop any
    // leftover pending/running rows (e.g. one in-flight when the user hit Stop) so they aren't
    // reprocessed, and leave the run marked 'cancelled'.
    const { data: runRow } = await service.from("ai_audit_runs").select("status, audit_id, user_id").eq("id", runId).maybeSingle();
    const prevStatus = runRow?.status ?? null; // status BEFORE this finalise write — drives the once-per-run guard
    if (runRow?.status === "cancelled") {
      await service.from("ai_audit_queue")
        .update({ status: "cancelled" }).eq("run_id", runId).in("status", ["pending", "running"]);
      continue;
    }

    const { data: rows } = await service
      .from("ai_audit_queue")
      .select("id, question, engines, status, result, attempts, updated_at")
      .eq("run_id", runId)
      .order("created_at", { ascending: true });
    if (!rows || rows.length === 0) continue;

    const isCapped = cappedRuns?.has(runId) ?? false;
    const allSettled = runSettlement(rows.map((r: Row) => r.status), isCapped).allSettled;

    /* ── TARGETING AUDITS DO NOT WAIT FOR THEIR LAST QUESTION ──────────────────────────────────
       A market/area audit is the pass that decides which businesses to pitch, and its wall clock
       was being set by a single laggard while 7 of 8 answers sat ready. See
       _shared/targeting-straggler.ts for the measurements and, more importantly, for why this is
       NOT the time cap that caused the retry-storm — nothing here reads how long a question has
       run, only whether it is the last one left in its own batch.
       ⛔ The PAID BASELINE is excluded inside that predicate and must stay excluded. */
    let droppedQuestions = 0;
    if (!allSettled && !isCapped) {
      const outstanding = rows.filter((r: Row) => r.status === "pending" || r.status === "running");
      const settledRows = rows.filter((r: Row) => r.status === "done" || r.status === "failed");
      /* Measured from the SETTLED rows, never from the straggler: that is what keeps a batch which
         is slow ALL OVER from qualifying. 0 when no row carries a timestamp, which never passes. */
      const lastSettledMs = settledRows.reduce((t: number, r: Row) => {
        const ms = r.updated_at ? new Date(r.updated_at).getTime() : 0;
        return Number.isFinite(ms) && ms > t ? ms : t;
      }, 0);
      const auditForRun = runRow?.audit_id
        ? (await service.from("ai_audits")
            .select("is_market, baseline_target_runs").eq("id", runRow.audit_id).maybeSingle()).data
        : null;
      const mayDrop = mayFinishWithoutStragglers({
        isMarket: auditForRun?.is_market,
        baselineTargetRuns: auditForRun?.baseline_target_runs,
        totalQuestions: rows.length,
        settledQuestions: settledRows.length,
        outstandingQuestions: outstanding.length,
        msSinceRestSettled: lastSettledMs > 0 ? Date.now() - lastSettledMs : 0,
      });
      if (!mayDrop) continue; // still in progress — wait, exactly as before

      /* Stop billing on the abandoned scrape, then mark the row TERMINALLY. Deliberately not
         failAttempt(): that puts a row back to 'pending', which would re-open the run the instant
         we finalised it. Same shape as the cost_cap write. 'failed' (not a new status) is also
         what MeasureMarket's settle test and QUESTION_STATE_SCORE already understand — a bespoke
         status would leave the operator's progress bar running forever. */
      for (const r of outstanding) {
        const apifyRunId = (r.result as Row | null)?._apify?.runId;
        if (apifyRunId && apifyToken) await abortApifyRun(String(apifyRunId), apifyToken);
      }
      await service.from("ai_audit_queue")
        .update({ status: "failed", result: { error: TARGETING_STRAGGLER_ERROR } })
        .in("id", outstanding.map((r: Row) => r.id))
        .in("status", ["pending", "running"]);
      for (const r of outstanding) r.status = "failed";
      droppedQuestions = outstanding.length;
      console.log(`[process-ai-audit-queue] run ${runId}: targeting audit finalised on ${settledRows.length} of ${rows.length} questions — ${droppedQuestions} straggler(s) dropped`);
    }

    // If capped, drop any rows that never ran so they aren't reprocessed next tick.
    if (isCapped) {
      const leftover = rows.filter((r: Row) => r.status === "pending" || r.status === "running");
      if (leftover.length) {
        await service.from("ai_audit_queue")
          .update({ status: "failed", result: { error: "cost_cap" } })
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
        /* ⛔ SAME FIX AS src/lib/auditReport.ts, and this is the copy that matters: the report
           PREFERS this stored summary (`summary?.total_datapoints ?? liveTotal`), so a wrong number
           here outlives any client fix. Count engine blocks that actually came back, never the ones
           that were requested. */
        for (const e of engines) {
          if (!result?.[e]) continue;
          total++;
          if (cellNamed(result?.[e])) named++;
        }
      }
      return { question: r.question, status: r.status, engines: result };
    });
    const mentionRate = total > 0 ? Number((named / total).toFixed(4)) : null;

    // Preserve any SEO block the SEO step wrote (order-independent — either step may run
    // first; both merge rather than overwrite).
    const { data: runNow } = await service.from("ai_audit_runs").select("results").eq("id", runId).maybeSingle();
    const existingResults: Row = runNow?.results && typeof runNow.results === "object" ? (runNow.results as Row) : {};

    /* ── ADAPTIVE HOOK STEP (2026-09-20, src/lib/hookAudit.ts) ──────────────────────────────────
       A hook run reaches this point with every queued row settled. The question that just settled
       is the LAST row (rows are ordered by created_at and the plan queues one at a time). Evaluate
       it on the scored engines: a gap or a provider failure stops the hook and the run finalises
       below; the business being named on every answering engine queues the NEXT planned question
       on THIS run and skips finalisation this tick.
       ⛔ EXACTLY-ONCE NEXT QUESTION. Two ticks can both see the run settled. The state write is
       conditional on results->hook->>next_index still holding the value this tick read, so only
       the tick that wins the update inserts the queue row; the loser sees a pending row next tick.
       ⛔ Never a second ai_audit_run, never on a capped run (the cap stops spend). */
    const hookPrev = existingResults.hook;
    if (isHookState(hookPrev) && !hookPrev.stop_reason && !isCapped && rows.length > 0) {
      const lastIdx = rows.length - 1;
      const lastRow = rows[lastIdx] as Row;
      const engineOrder: string[] = Array.isArray(lastRow.engines) && lastRow.engines.length ? lastRow.engines : DEFAULT_ENGINES;
      const evaluation = evaluateHookQuestion(
        lastRow.status === "done" && lastRow.result && typeof lastRow.result === "object" ? lastRow.result as Record<string, unknown> : null,
        engineOrder.filter((e) => DEFAULT_ENGINES.includes(e)),
      );
      const step = advanceHookState(hookPrev, lastIdx, evaluation);
      if (step.action === "next" && step.nextQuestion) {
        const { data: claimed, error: claimErr } = await service.from("ai_audit_runs")
          .update({ results: { ...existingResults, hook: step.state } })
          .eq("id", runId)
          .eq("results->hook->>next_index", String(hookPrev.next_index))
          .in("status", ["pending", "running"])
          .select("id");
        if (claimErr) {
          console.error(`[process-ai-audit-queue] hook step: could not record progress for run ${runId}: ${claimErr.message}`);
          continue;
        }
        if (!Array.isArray(claimed) || claimed.length !== 1) continue; // another tick queued it
        const { error: qErr } = await service.from("ai_audit_queue").insert({
          audit_id: runRow?.audit_id, run_id: runId, user_id: runRow?.user_id ?? null,
          question: step.nextQuestion, engines: engineOrder, status: "pending",
        });
        if (qErr) {
          console.error(`[process-ai-audit-queue] hook step: could not queue Q${lastIdx + 2} for run ${runId}: ${qErr.message}`);
          // Roll the state back so the next tick re-evaluates and retries the insert.
          await service.from("ai_audit_runs").update({ results: { ...existingResults, hook: hookPrev } }).eq("id", runId);
          continue;
        }
        console.log(`[process-ai-audit-queue] hook run ${runId}: Q${lastIdx + 1} named the business on ${engineOrder.join("+")} — queued Q${lastIdx + 2}`);
        continue; // not finalised: the new row keeps the run open
      }
      existingResults.hook = step.state;
      console.log(`[process-ai-audit-queue] hook run ${runId}: stopped after ${step.state.executed} question(s) — ${step.state.stop_reason}${step.state.gap ? ` on ${step.state.gap.engine}` : ""}`);
    }
    const existingSeo = existingResults.seo;

    // MEASURED actor spend for this run: the sum of what Apify charged for each question,
    // not an estimate. null when no question reported a figure (older rows, or all failed).
    let actorCostUsd: number | null = null;
    for (const r of rows) {
      const c = (r.result as Record<string, unknown> | null)?._cost_usd;
      if (typeof c === "number") actorCostUsd = Number(((actorCostUsd ?? 0) + c).toFixed(6));
    }

    /* ⛔ SPREAD WHAT THE ROW ALREADY HOLDS, THEN WRITE THE COMPUTED KEYS OVER IT (2026-09-13).
       This object used to be built from scratch, so every note create-ai-audit wrote INTO
       results at creation was wiped the moment the run finalised: `full_measure` (the flag that
       says a full measure is NOT comparable to the baseline), `money_questions` (which queued
       questions are the buying-moment ones). Neither live measurement run carried its note. The
       computed keys (engines/summary/questions/seo) win; everything else survives — the same
       read-modify-write shape stampCleaningFailure and audit-baseline already use on this column. */
    const results = {
      ...existingResults,
      engines: DEFAULT_ENGINES,
      summary: {
        named_datapoints: named,
        total_datapoints: total,
        mention_rate: mentionRate,
        done_questions: doneQuestions,
        failed_questions: failedQuestions,
        total_questions: rows.length,
        /* How many of failed_questions were ABANDONED rather than broken — a targeting audit that
           finished on 7 of 8. Recorded so a thin run is legible as a deliberate choice instead of
           looking like a partial failure. 0 on every other path, and on every baseline. */
        dropped_questions: droppedQuestions,
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
    /* Re-derived AFTER the straggler/cap writes above flipped rows to 'failed' (_shared/run-finalise.ts). */
    const { allFailed, runStatus } = runSettlement(rows.map((r: Row) => r.status), isCapped);
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
    // Claim the settled run as processing first. Required post-processing (crawl + competitor
    // cleanup) must finish before the run is exposed as terminal; retries return it to pending.
    // actor_cost_usd is written alongside; migration-tolerant retry below if the column is absent.
    const flipRun = (extra: Record<string, unknown>) =>
      service.from("ai_audit_runs")
        .update({ results, mention_rate: mentionRate, status: "processing", ...extra })
        .eq("id", runId)
        .in("status", ["pending", "running"])
        .select("id");
    let flipped: Row[] | null = null;
    let writeErr: Row | null = null;
    if (prevStatus === "processing") {
      flipped = [{ id: runId }];
    } else {
      ({ data: flipped, error: writeErr } = await flipRun({ actor_cost_usd: actorCostUsd }));
    }
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
    if (!Array.isArray(flipped) || flipped.length === 0) continue; // another poller already claimed this run
    finalised++;
    processingRuns.push({ runId, auditId: runRow?.audit_id as string, finalStatus: runStatus, allFailed });

    /* ── AUTOMATIC SITE CRAWL (2026-09-17) ───────────────────────────────────────────────────────
       Every audit that finalises crawls its lead's site — complete, capped OR failed, because the
       crawl is about the SITE and is independent of whether the AI questions answered. Fires ONCE
       per run's completion (this is the atomic transition winner), for a lead that has a website.
       ⛔ DEDUPED so a 3-run baseline doesn't crawl the same site three times in five minutes: skip
       when a CURRENT-version crawl younger than the freshness window already exists — the same
       30d/v2 gate the report and the Crawl-site button apply, so an already-crawled lead is left
       alone and a stale/pre-v2 one is refreshed. Internal auth (CRON_SECRET + x-internal-job), the
       same door extract-competitors uses. Never throws; a crawl problem can't touch the audit. */
    crawlInvokes.push((async () => {
      try {
        const auditId = runRow?.audit_id as string | undefined;
        if (!auditId) return;
        const markUnavailable = async (error: string) => {
          const { data: currentRun } = await service.from("ai_audit_runs").select("results").eq("id", runId).maybeSingle();
          const currentResults = currentRun?.results && typeof currentRun.results === "object" ? currentRun.results : {};
          await service.from("ai_audit_runs").update({
            results: { ...currentResults, crawl_check: { status: "unavailable", error: error.slice(0, 240) } },
          }).eq("id", runId);
        };
        const { data: aud } = await service
          .from("ai_audits").select("lead_id, is_market, website").eq("id", auditId).maybeSingle();
        const cLeadId = (aud as { lead_id?: string | null } | null)?.lead_id ?? null;
        if ((aud as { is_market?: boolean } | null)?.is_market === true) return;
        const { data: lead } = cLeadId
          ? await service.from("outreach_leads").select("website").eq("id", cLeadId).maybeSingle()
          : { data: null };
        const site = String((lead as { website?: string | null } | null)?.website ?? "").trim()
          || String((aud as { website?: string | null } | null)?.website ?? "").trim();
        if (!site) {
          // No website is a valid audit outcome, not a missing/failed crawl. Persist the explicit
          // terminal state so the run, report and Inbox can distinguish it from a crawl that never
          // ran or errored.
          const { data: currentRun } = await service.from("ai_audit_runs").select("results").eq("id", runId).maybeSingle();
          const currentResults = currentRun?.results && typeof currentRun.results === "object" ? currentRun.results : {};
          await service.from("ai_audit_runs").update({
            results: { ...currentResults, crawl_check: { status: "unavailable", reason: "no_website" } },
          }).eq("id", runId);
          return;
        }
        // Already have a current, fresh crawl? Leave it — this is the 3-run-baseline dedup.
        const { data: cc } = cLeadId
          ? await service.from("lead_crawl_checks").select("result, created_at")
              .eq("lead_id", cLeadId).order("created_at", { ascending: false }).limit(1).maybeSingle()
          : { data: null };
        const fresh = !!cc && (Date.now() - new Date((cc as { created_at: string }).created_at).getTime()) < 30 * 86_400_000;
        const currentVer = ((cc as { result?: { version?: number } } | null)?.result?.version ?? 0) >= CRAWL_CHECK_VERSION;
        if (fresh && currentVer) {
          if (runId && cc?.result) {
            const { data: currentRun } = await service.from("ai_audit_runs").select("results").eq("id", runId).maybeSingle();
            const currentResults = currentRun?.results && typeof currentRun.results === "object" ? currentRun.results : {};
            await service.from("ai_audit_runs").update({
              results: { ...currentResults, crawl_check: { status: "complete", ...(cc as { result: Row }).result } },
            }).eq("id", runId);
          }
          return;
        }
        const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/crawl-check`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-cron-secret": Deno.env.get("CRON_SECRET") ?? "",
            "x-internal-job": "1",
          },
          body: JSON.stringify({ lead_id: cLeadId, audit_id: auditId, run_id: runId, url: site }),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          console.error(`[process-ai-audit-queue] auto crawl-check failed for lead ${cLeadId}: HTTP ${res.status} ${txt.slice(0, 200)}`);
          await markUnavailable(`crawl-check HTTP ${res.status}: ${txt}`);
        }
      } catch (e) {
        const why = e instanceof Error ? e.message : String(e);
        console.error(`[process-ai-audit-queue] auto crawl-check invoke error:`, why);
        try {
          const { data: currentRun } = await service.from("ai_audit_runs").select("results").eq("id", runId).maybeSingle();
          const currentResults = currentRun?.results && typeof currentRun.results === "object" ? currentRun.results : {};
          await service.from("ai_audit_runs").update({
            results: { ...currentResults, crawl_check: { status: "unavailable", error: why.slice(0, 240) } },
          }).eq("id", runId);
        } catch (stampError) {
          console.error(`[process-ai-audit-queue] could not stamp crawl failure:`, stampError instanceof Error ? stampError.message : String(stampError));
        }
      }
    })());

    // Auto-invoke extract-competitors ONCE per run, at the transition to terminal (prevStatus was
    // pending/running — never for a run already complete/capped/cancelled on entry). Queued here
    // (not awaited in-loop) so it can't block finalising other runs; strictly AFTER the results/
    // status write above has RESOLVED, so it can't race the fold that extract-competitors re-reads
    // and rewrites. Fail-safe: never throws; a non-2xx is logged (a 401/403 misconfig is visible,
    // not a silent no-op) and can never flip the run back out of complete.
    // Nothing to extract from a run with no answers, so skip the call entirely.
    /* ⛔ CAPPED (2026-09-21, _shared/run-finalise.ts). A run held `pending` for its cleaning comes back
       through here on the next tick with prevStatus "pending", so this used to re-invoke the cleaner
       every 30 seconds for ever — thousands of attempts per run against an OpenAI 429, and a result
       nothing downstream could use. The receipt on the results this tick already read decides: once
       complete, or once RETRY_CLEAN_CAP attempts are spent, nothing is invoked and the readiness check
       below releases the run with its honest receipt. */
    const invokeCleaning = shouldInvokeCleaning(existingResults.competitor_cleaning, allFailed);
    if (!invokeCleaning && !allFailed && (prevStatus === "pending" || prevStatus === "running" || prevStatus === "processing")) {
      console.log(`[process-ai-audit-queue] run ${runId}: competitor cleaning not re-invoked (attempts ${Number((existingResults.competitor_cleaning as Row | undefined)?.attempts ?? 0)}, complete ${String((existingResults.competitor_cleaning as Row | undefined)?.complete)})`);
    }
    if (invokeCleaning && (prevStatus === "pending" || prevStatus === "running" || prevStatus === "processing")) {
      extractionInvokes.push((async () => {
        try {
          /* ⛔ NO Authorization HEADER, ON PURPOSE — and the load-bearing half of the 2026-08-14 fix
             is in config.toml, not here. extract-competitors was MISSING from config.toml, so it was
             deployed with the platform default verify_jwt = TRUE: the platform demanded a JWT-shaped
             bearer before the handler ran. That worked for weeks only because
             SUPABASE_SERVICE_ROLE_KEY used to BE a JWT; the ~2026-08-11 key rotation made it
             sb_secret-shaped, the platform check started failing, and every fold finalised from then
             until 2026-08-14 went uncleaned (measured: 16–51 junk-word markers on every one, zero on
             the weeks before). config.toml now lists the function verify_jwt = false, and this call
             carries no bearer at all: the x-cron-secret + x-internal-job branch is the intended door,
             and a credential that never rotates cannot die the same way twice. */
          const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/extract-competitors`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-cron-secret": Deno.env.get("CRON_SECRET") ?? "",
              "x-internal-job": "1",
            },
            body: JSON.stringify({ runId }),
          });
          if (!res.ok) {
            const txt = await res.text().catch(() => "");
            console.error(`[process-ai-audit-queue] extract-competitors failed for run ${runId}: HTTP ${res.status} ${txt.slice(0, 300)}`);
            /* 400 chars, not 160: the OpenAI error body inside extract-competitors' 502 is what says
               WHICH 429 this is (quota vs rate limit), and 160 cut it off at "You have". */
            await stampCleaningFailure(service, runId, `invoke HTTP ${res.status}: ${txt.slice(0, 400)}`);
          }
        } catch (e) {
          const why = e instanceof Error ? e.message : String(e);
          console.error(`[process-ai-audit-queue] extract-competitors invoke error for run ${runId}:`, why);
          await stampCleaningFailure(service, runId, `invoke error: ${why.slice(0, 160)}`);
        }
      })());
      // Auto-report: queue a public /r/ business report for this finalised audit — processed AFTER
      // extraction (below) so it reflects the cleaned competitors. COMPLETE runs only (not capped):
      // the existing-report SELECT guard makes the FIRST report permanent, so a capped run's
      // partial-data report would block the full report from a later re-run — capped audits stay on
      // the manual button. No lead-id gate; skipped when AUTO_REPORT_ENABLED is off. Existing-report
      // guard + fail-safe wrapping live in the processor below.
      if (autoReportEnabled && !isCapped && !allFailed && runRow?.audit_id) reportJobs.push({ auditId: runRow.audit_id as string });
      /* The free-check result. Success only: a capped run has partial data and a failed one has
         none, and a stranger must never receive either. */
      if (!isCapped && !allFailed && runRow?.audit_id) freeCheckJobs.push({ runId, auditId: runRow.audit_id as string });
      // D2 — completion auto-send candidates (COMPLETE only, like audit_reply/auto-report). The
      // heavier checks (setting, lead, phone, suppression) run once, after the loop.
      if (!isCapped && !allFailed && runRow?.audit_id) completionSendJobs.push({ auditId: runRow.audit_id as string });
      /* The mirror of the line above: this run will NEVER arm its parked pitch, so record it for the
         flag pass after the loop. `dominantError` is the queue's own reason when every question
         failed, so the operator is told WHY rather than just that it stopped. */
      if ((isCapped || allFailed) && runRow?.audit_id) {
        stalledAutoReplyJobs.push({
          auditId: runRow.audit_id as string,
          runStatus,
          reason: allFailed
            ? `auto-audit failed (${String(dominantError ?? "all questions failed")})`
            : `auto-audit capped — ${doneQuestions} of ${rows.length} questions answered`,
        });
      }
      // Baseline chain runs for capped runs as well — see baselineJobs above.
      // An all-failed run must never count toward a paid baseline.
      if (!allFailed && runRow?.audit_id) baselineJobs.push({ auditId: runRow.audit_id as string });
    }
  }
  // Await the queued extraction calls so the edge runtime doesn't cut them off when we return.
  if (extractionInvokes.length) await Promise.allSettled(extractionInvokes);
  // Same for the automatic site crawls — awaited so the runtime doesn't cut them off on return.
  if (crawlInvokes.length) await Promise.allSettled(crawlInvokes);

  // A run is terminal only after the automatic crawl and competitor cleanup have reached a
  // terminal outcome. Crawl unavailability is honest and terminal; missing work is retried.
  const readyRuns = new Set<string>();
  for (const p of processingRuns) {
    const { data: fresh } = await service.from("ai_audit_runs").select("results").eq("id", p.runId).maybeSingle();
    let current = fresh?.results && typeof fresh.results === "object" ? fresh.results as Row : {};
    const qs = Array.isArray(current.questions) ? current.questions as Row[] : [];
    const hasAnswerText = qs.some((q) => q?.engines && Object.values(q.engines as Row).some((e: Row) => typeof e?.answer_text === "string" && e.answer_text.trim()));
    if (!hasAnswerText && !p.allFailed && current.competitor_cleaning == null) {
      current = { ...current, competitor_cleaning: { at: new Date().toISOString(), model: null, attempts: 0, items_total: 0, items_cleaned: 0, complete: true, errors: [] } };
      await service.from("ai_audit_runs").update({ results: current }).eq("id", p.runId).eq("status", "processing");
    }
    const { data: audit } = await service.from("ai_audits").select("website, lead_id").eq("id", p.auditId).maybeSingle();
    let site = String(audit?.website ?? "").trim();
    if (audit?.lead_id && !site) {
      const { data: lead } = await service.from("outreach_leads").select("website").eq("id", audit.lead_id).maybeSingle();
      site = String(lead?.website ?? "").trim();
    }
    const crawl = current.crawl_check as Row | undefined;
    const readiness = finaliseReadiness({ allFailed: p.allFailed, stamp: current.competitor_cleaning, crawlStatus: crawl?.status, hasSite: !!site });
    /* ⛔ AN EXHAUSTED CLEANING IS RELEASED WITH ITS RECEIPT, NOT HELD (2026-09-21). The stamp keeps its
       attempts and errors and gains `gave_up_at` exactly once; the report and resolveAuditReplyVars
       already read `complete: false` as "rival names unavailable", so nothing is fabricated and the
       AI answers themselves are exposed as measured. */
    if (readiness.cleaning === "exhausted") {
      const marked = markCleaningExhausted(current.competitor_cleaning, new Date().toISOString());
      if (marked.changed) {
        current = { ...current, competitor_cleaning: marked.stamp };
        await service.from("ai_audit_runs").update({ results: current }).eq("id", p.runId).eq("status", "processing");
        console.warn(`[process-ai-audit-queue] run ${p.runId}: competitor cleaning gave up at ${RETRY_CLEAN_CAP} attempts — released without cleaned rival names`);
      }
    }
    if (readiness.ready) {
      const { error } = await service.from("ai_audit_runs").update({ status: p.finalStatus }).eq("id", p.runId).eq("status", "processing");
      if (!error) readyRuns.add(p.runId);
    } else {
      await service.from("ai_audit_runs").update({ status: "pending" }).eq("id", p.runId).eq("status", "processing");
      console.warn(`[process-ai-audit-queue] run ${p.runId} held pending: crawlReady=${readiness.crawlReady}, cleaning=${readiness.cleaning}`);
    }
  }
  const auditReady = (auditId: string) => processingRuns.some((p) => p.auditId === auditId && readyRuns.has(p.runId));
  for (let i = reportJobs.length - 1; i >= 0; i--) if (!auditReady(reportJobs[i].auditId)) reportJobs.splice(i, 1);
  for (let i = freeCheckJobs.length - 1; i >= 0; i--) if (!auditReady(freeCheckJobs[i].auditId)) freeCheckJobs.splice(i, 1);
  for (let i = completionSendJobs.length - 1; i >= 0; i--) if (!auditReady(completionSendJobs[i].auditId)) completionSendJobs.splice(i, 1);
  for (let i = baselineJobs.length - 1; i >= 0; i--) if (!auditReady(baselineJobs[i].auditId)) baselineJobs.splice(i, 1);

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
  /* THE FREE-CHECK RESULT — after competitor cleaning, for the same reason the audit_reply and the
     auto-report wait: the prospect's report names rival firms, and sending before the cleaner has
     run would mail a stranger a list of scraped junk. Wrapped like every other send here: a
     failure must never break finalisation. */
  for (const job of freeCheckJobs) {
    try {
      const r = await maybeSendFreeCheckResult(service, job.runId, job.auditId);
      if (r.kind !== "skipped") {
        console.log(`[process-ai-audit-queue] free_check result for audit ${job.auditId}: ${JSON.stringify(r)}`);
      }
    } catch (e) {
      console.error(`[process-ai-audit-queue] free_check result error for audit ${job.auditId}:`, e instanceof Error ? e.message : String(e));
    }
  }

  /* THE FOUR-WEEK RESULTS (2026-09-13) — for every run that just finished, the sender checks
     whether its audit is the lead's own day-28 replay with every run settled, and if so claims,
     sends and stamps (or routes to a task when the number cannot be proven or the copy is not yet
     approved). Runs AFTER advanceBaseline (which finalises the replay) and after the free-check
     sends; same contract as every other send here — a failure never breaks finalisation. Reuses
     freeCheckJobs: the same "finished complete, not capped" set, deduped by audit. */
  for (const auditId of new Set(freeCheckJobs.map((j) => j.auditId))) {
    try {
      const r = await maybeSendRemeasureResults(service, auditId);
      if (r.kind !== "skipped") console.log(`[process-ai-audit-queue] four-week results for audit ${auditId}: ${JSON.stringify(r)}`);
    } catch (e) {
      console.error(`[process-ai-audit-queue] four-week results error for audit ${auditId}:`, e instanceof Error ? e.message : String(e));
    }
  }

  // Auto-report: NOW that competitors are cleaned, generate the public /r/ business report for each
  // finalised audit — but ONLY if one doesn't already exist (SELECT guard on audit_id + report_type
  // 'profile', so re-runs never overwrite). Calls generate-report's internal branch (service key +
  // x-cron-secret + x-internal-job). Wrapped so any failure only logs and NEVER blocks/fails the
  // audit — the manual "Generate listing" button remains the fallback. Sequential so two runs of the
  // same audit in one tick can't both slip past the guard.
  /* ⛔ AUTO-REPORT ONLY FOR AN ENGAGED LEAD (Paul, 2026-09-16). The public /r/ listing is a
     crawlable SEO artifact; it matters for clients and leads who have engaged, NOT for a cold
     prospect who may never reply. It fires at audit finalisation, when a cold outreach lead is
     still not_contacted/queued/initial_contact — so gating here skips exactly those. Measured: 315
     of 750 auto-reports in the last 30d were for leads that never replied, i.e. gpt-4o spent on
     prospects who never answered. This does NOT affect what a prospect can open — their report link
     is served LIVE by render-audit-report and needs no business_reports row — and the manual
     "Generate listing" button remains for every other case. Engaged = replied-or-beyond, or paid. */
  const AUTO_REPORT_ENGAGED_STATUSES = new Set([
    "replied", "awaiting_reply", "report_sent", "interested", "price_given",
    "payment_received", "in_delivery", "completed",
  ]);
  for (const job of reportJobs) {
    try {
      /* ⛔ MARKET AUDITS NEVER GET A REPORT. THE MOST IMPORTANT GUARD IN THIS FILE.
         A market audit has NO business attached — its business_name is a sentinel like
         "[market] locksmiths · Hastings" and its lead_id is null. This auto-report path has no
         lead-id gate (see its comment above), so without this check a market audit finishing
         cleanly would PUBLISH A PUBLIC /r/ REPORT, titled with the sentinel, with no human
         involved. Read from the column, never from the name: a string prefix is not a safety
         guard. The two other completion side effects (audit_reply, D2 completion send) are
         already safe because both require a lead_id. */
      const { data: auditRow } = await service
        .from("ai_audits").select("is_market, business_name, lead_id").eq("id", job.auditId).maybeSingle();
      if (auditRow?.is_market === true) {
        console.log(`[process-ai-audit-queue] auto-report REFUSED for market audit ${job.auditId} ("${auditRow.business_name}"): market audits have no business and must never produce a public report.`);
        continue;
      }
      /* THE ENGAGED-LEAD GATE. Read status + amount_paid off the lead; skip unless engaged or paid.
         No lead (should not happen for a non-market audit) → skip: nothing to be engaged. */
      const reportLeadId = (auditRow as { lead_id?: string | null } | null)?.lead_id ?? null;
      let leadEngaged = false;
      if (reportLeadId) {
        const { data: lr } = await service
          .from("outreach_leads").select("status, amount_paid").eq("id", reportLeadId).maybeSingle();
        const lst = ((lr as { status?: string | null } | null)?.status ?? "").trim();
        const lpaid = Number((lr as { amount_paid?: number | null } | null)?.amount_paid ?? 0) > 0;
        leadEngaged = lpaid || AUTO_REPORT_ENGAGED_STATUSES.has(lst);
      }
      if (!leadEngaged) {
        console.log(`[process-ai-audit-queue] auto-report skipped for audit ${job.auditId}: lead not engaged (cold prospect) — the manual button remains.`);
        continue;
      }
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
      /* No Authorization header — same fix as the extract-competitors invoke above: generate-report
         was also missing from config.toml (verify_jwt defaulted TRUE), so the rotated non-JWT
         service key stopped passing the platform check and auto-reports silently stopped after
         2026-08-10. config.toml now lists it, and the cron-secret branch needs no bearer at all. */
      const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
  /* ⛔ SURFACE THE STALLED PITCHES. A reply-triggered pitch parked as 'awaiting_audit' is only ever
     armed by the COMPLETE-run upgrade below; a capped or failed audit left it on that status forever,
     with nothing to fire it and nothing to say so. Flagging it is the whole fix: the row becomes
     visible with a reason instead of silently waiting for an event that can never happen.
     ⛔ REUSES THE EXISTING `flagged_error` STATUS ON PURPOSE. whatsapp_auto_replies is not defined in
     any migration, so a CHECK constraint on `status` cannot be ruled out from the repo — and a new
     value rejected by one would fail the update silently, leaving exactly the invisible stall this
     removes. flagged_error is already written to this column by the inbound chain, so it is
     guaranteed accepted and needs no SQL. The `reason` carries which it was.
     ⚠️ SCOPED TO 'awaiting_audit' ROWS ONLY. A row that is pending, sent or already flagged is not
     touched, so this can never overwrite a real outcome or re-flag something a human has dealt with.
     ⚠️ NOT gated on autoReplyEnvOn(): the kill-switch governs SENDING. A row already parked must
     still be told the truth even if auto-replies were turned off after it was parked.
     ⚠️ Own try/catch per job — a missing table must never break queue finalisation. */
  for (const job of stalledAutoReplyJobs) {
    try {
      const { data: audit } = await service
        .from("ai_audits").select("lead_id").eq("id", job.auditId).maybeSingle();
      const leadId = (audit?.lead_id as string | null) ?? null;
      if (!leadId) continue; // manual/market audit — no parked pitch to flag
      /* ⛔ AUDIT_ONLY ROWS ARE FLAGGED TOO, AND THIS IS THE ONE PLACE THEY MUST BE TOUCHED. An
         audit_only row says "the audit is running, send it by hand when it lands". If the audit
         ends capped or failed it is never landing, and a row still reading audit_only would sit in
         the Inbox count as a lead ready to quote — the operator opening a thread to send a result
         that does not exist. Flagging is not sending, so widening the scope here cannot put a
         message on the wire; completionSendJobs (the ARMING path) stays scoped to awaiting_audit
         alone, which is what keeps audit_only unsendable. */
      const { data: flagged } = await service.from("whatsapp_auto_replies")
        .update({ status: "flagged_error", reason: job.reason.slice(0, 300), updated_at: new Date().toISOString() })
        .eq("lead_id", leadId).in("status", ["awaiting_audit", AUDIT_ONLY_STATUS])
        .select("id");
      if (Array.isArray(flagged) && flagged.length > 0) {
        console.log(`[auto-send] audit ${job.auditId} ended ${job.runStatus} → flagged the stalled parked pitch for lead ${leadId}: ${job.reason}`);
      }
    } catch (e) {
      console.error(`[auto-send] could not flag stalled pitch for audit ${job.auditId}:`, (e as Error).message);
    }
  }

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
        /* ⛔ The first-reply AUDIT intent is NOT completed here any more (2026-09-20). This block only
           runs when completionSendJobs exist AND autoReplyEnvOn(), so the intent's completion used
           to depend on the reply kill-switch. reconcileFirstReplyAuditIntents settles `queued`
           intents from their own audit's run status on every tick, independent of any reply gate;
           this block owns the REPLY side only (the awaiting_audit → pending upgrade below). */
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

