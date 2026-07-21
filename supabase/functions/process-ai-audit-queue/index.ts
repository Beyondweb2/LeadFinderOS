import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SOURCES } from "../_shared/enrichment/sources.ts";
import { runEnrichSource } from "../_shared/enrichment/runner.ts";
import { runAiSearch, normalizeAiSearch, toCountryCode } from "../_shared/enrichment/ai-search.ts";
import { runSeoScanCore } from "../_shared/enrichment/seo-scan-core.ts";

// process-ai-audit-queue — cron-driven drain of ai_audit_queue, modelled on
// process-whatsapp-queue. Each tick claims a small batch of pending questions, runs
// the multi-engine SERP actor per question (through the runner cache/usage harness),
// normalises the result onto the queue row, and — once a run's rows are all settled —
// folds them into ai_audit_runs.results and computes mention_rate.
//
// A PER-AUDIT/RUN cost cap (CAP_USD) stops a run that would exceed the cap: its
// remaining rows are dropped and the run is marked 'capped'. All writes use the
// service key; user_id is carried explicitly from the queue/audit rows.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BATCH = 2;                 // rows CLAIMED + run CONCURRENTLY per tick (Promise.allSettled) — tune here.
                                 // Lowered 4→2 to cut per-query Apify timeouts ("signal has been aborted"):
                                 // fewer overlapping actor calls → less upstream/Apify rate-limiting, so slow
                                 // multi-engine bundles are likelier to finish under RUN_TIMEOUT_MS. Costs more
                                 // ticks to drain a run (bounded by the cron cadence), which is the intended trade.
const CAP_USD = 3.0;             // per-RUN Apify cost ceiling (this audit run)
const DAILY_CAP_USD = 15.0;      // per-USER rolling-24h ceiling (across audits) via the runner
const MAX_ATTEMPTS = 3;          // per queue row before it's marked failed
// Per actor run. The batch runs CONCURRENTLY (Promise.allSettled), so calls OVERLAP: the
// invocation's wall-clock ≈ the SLOWEST single call, NOT BATCH × timeout. One ~115s call +
// a few seconds of claim/normalise/DB overhead stays under the ~150s edge wall-clock, so we
// can afford 115s (up from 85s) for headroom on genuinely slow multi-engine bundles.
const RUN_TIMEOUT_MS = 115_000;
const STALE_RUNNING_MS = 3 * 60 * 1000; // reclaim rows stuck 'running' longer than this
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

    const apifyToken = Deno.env.get("APIFY_TOKEN") ?? "";
    if (!apifyToken) return json({ ok: true, skipped: "no_apify_token", processed: 0 });

    const estCost = SOURCES.ai_search.estCostUsd;

    // 0) Reclaim rows stranded in 'running' by a killed invocation. A row is flipped to
    //    'running' before its Apify call; if the tick dies mid-run it never settles and the
    //    pending-only query below never re-selects it, wedging the whole run. Reset any
    //    'running' row untouched for > STALE_RUNNING_MS back to 'pending' (attempts+1, or
    //    'failed' once exhausted). Needs ai_audit_queue.updated_at (manual-apply migration);
    //    best-effort — if the column is missing this logs and the tick continues.
    try {
      const staleBefore = new Date(Date.now() - STALE_RUNNING_MS).toISOString();
      const { data: stale } = await service
        .from("ai_audit_queue").select("id, attempts, run_id")
        .eq("status", "running").lt("updated_at", staleBefore);
      const staleRows = (stale ?? []) as Row[];
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

    // 0b) SEO step — website audits get one on-page SEO grade per run, stored at
    //     results.seo. It gets its OWN tick (runs before question draining and returns)
    //     so a second actor call never stacks into the same invocation and blows the
    //     wall-clock. Runs once per run (results.seo is the done-marker), only when the
    //     audit has a website.
    if (await maybeRunSeoStep(service, apifyToken)) {
      return json({ ok: true, seo: "ran" });
    }

    // 1) ATOMICALLY claim up to BATCH pending questions. Two steps, race-safe:
    //    (a) read the oldest pending ids; (b) flip them pending→running in ONE UPDATE
    //    guarded by `status='pending'`, RETURNING the rows actually updated. Postgres
    //    row-locks each UPDATE, so if a concurrent invocation already claimed a row the
    //    guard no longer matches and that row is NOT in our RETURNING set — every returned
    //    row is owned by EXACTLY ONE invocation. This is the PostgREST-expressible
    //    equivalent of SELECT … FOR UPDATE SKIP LOCKED (the JS client can't issue that
    //    directly). `updated_at` is bumped by the BEFORE-UPDATE trigger, so the stale-
    //    'running' reclaim keeps working.
    const { data: candidates } = await service
      .from("ai_audit_queue")
      .select("id")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(BATCH);
    const candidateIds = (candidates ?? []).map((r: Row) => r.id);
    if (candidateIds.length === 0) {
      // Even with nothing pending, finalise any runs left settled by a prior tick.
      const finalised = await finaliseSettledRuns(service, [], estCost);
      return json({ ok: true, processed: 0, finalised });
    }
    const { data: claimedRows } = await service
      .from("ai_audit_queue")
      .update({ status: "running" })
      .in("id", candidateIds)
      .eq("status", "pending") // atomic guard: only rows STILL pending are claimed + returned
      .select("id, audit_id, run_id, user_id, question, engines, attempts, status");
    const claimed = (claimedRows ?? []) as Row[];
    if (claimed.length === 0) {
      // A concurrent invocation grabbed them first — nothing to process this tick.
      const finalised = await finaliseSettledRuns(service, [], estCost);
      return json({ ok: true, processed: 0, finalised });
    }

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

    // Accumulated per-run Apify cost (baseline = attempts already spent this run).
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
    for (const r of claimed) touchedRuns.add(r.run_id);

    // 2) Per-RUN cost gate, decided ONCE — before any concurrent call launches — so the
    //    batch can never overshoot CAP_USD. For each run: affordable = how many more calls
    //    the remaining budget covers = floor((CAP_USD − alreadySpent) / estCost). Launch
    //    only the first `affordable` claimed rows of that run; mark the rest failed 'capped'
    //    immediately (never launched). Because the launch COUNT is bounded here, ahead of
    //    Promise.allSettled, concurrency cannot overshoot. Spend is persisted PER-ROW (via
    //    `attempts`), so there is no shared in-memory counter to lose updates on. Two
    //    overlapping invocations only ever hold DISJOINT rows (atomic claim above); the sole
    //    residual is a bounded ≤ BATCH×estCost cross-invocation window — far under CAP_USD,
    //    and it is acceptable to UNDER-spend (a skipped row is retried next tick).
    const toLaunch: Row[] = [];
    const perRunBudget = new Map<string, number>();
    for (const row of claimed) {
      let remaining = perRunBudget.get(row.run_id);
      if (remaining === undefined) {
        const spent = await accumulatedCost(row.run_id);
        remaining = Math.max(0, Math.floor((CAP_USD - spent) / estCost + 1e-9));
        perRunBudget.set(row.run_id, remaining);
      }
      if (remaining > 0) {
        toLaunch.push(row);
        perRunBudget.set(row.run_id, remaining - 1);
      } else {
        cappedRuns.add(row.run_id);
        await service.from("ai_audit_queue")
          .update({ status: "failed", result: { error: "capped" } }).eq("id", row.id);
      }
    }

    // 3) Process the affordable batch CONCURRENTLY. Promise.allSettled → one question's
    //    abort/failure NEVER rejects the batch; each row settles itself (done / daily_cap /
    //    retry-or-fail with attempts+1), preserving the per-row timeout + 3-attempt retry.
    //    Concurrent calls OVERLAP, so the invocation's wall-clock ≈ the slowest single call.
    async function processRow(row: Row): Promise<boolean> {
      const audit = await getAudit(row.audit_id);
      try {
        const outcome = await runEnrichSource({
          service,
          userId: audit.userId || row.user_id,
          type: "ai_search",
          // Per-QUEUE-ROW cache key: unique per run, so re-runs always fetch fresh data
          // (never reuse an old run's cached answers) while a reprocessed row is idempotent.
          cacheKey: `aiaudit:${row.id}`,
          estCostUsd: estCost,
          // TWO caps apply: the runner enforces a per-USER rolling-24h ceiling
          // (DAILY_CAP_USD, so many audits in a day can't run away), and the explicit
          // per-RUN CAP_USD gate above bounds this single audit run.
          capUsd: DAILY_CAP_USD,
          run: async () => {
            // In-call retry is 429/5xx ONLY — deliberately NOT onAbort, so each row is one
            // ≤RUN_TIMEOUT_MS attempt. A timeout/abort throws → the catch below bumps attempts
            // and re-queues it as 'pending', so timeouts DO retry on the NEXT tick, up to
            // MAX_ATTEMPTS. One question's abort does not affect its concurrent siblings.
            const { items, ms } = await runAiSearch(String(row.question), audit.countryCode, {
              token: apifyToken,
              timeoutMs: RUN_TIMEOUT_MS,
              retry: { on429: true },
            });
            console.log(`[ai-audit] q="${row.question.slice(0, 60)}" took ${ms}ms`);
            return { result: normalizeAiSearch(items, audit.businessName), costUsd: estCost };
          },
        });

        // Runner hit the per-user rolling-24h ceiling → treat like a cap, not an error:
        // stop this run, drop its remaining rows on finalisation. No spend happened.
        if (outcome.capReached) {
          cappedRuns.add(row.run_id);
          await service.from("ai_audit_queue")
            .update({ status: "failed", result: { error: "daily_cap" } }).eq("id", row.id);
          return false;
        }
        if (!outcome.result) throw new Error("empty_actor_result");
        await service.from("ai_audit_queue").update({ status: "done", result: outcome.result }).eq("id", row.id);
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const attempts = (Number(row.attempts) || 0) + 1;
        const failed = attempts >= MAX_ATTEMPTS;
        // Persist the error onto the row so failures are visible in the DB (not just logs).
        // A non-terminal error goes back to 'pending' and retries next tick; the last error
        // is overwritten by the real result if a later attempt succeeds.
        await service.from("ai_audit_queue")
          .update({ status: failed ? "failed" : "pending", attempts, result: { error: msg } }).eq("id", row.id);
        console.error(`[process-ai-audit-queue] question failed (attempt ${attempts}${failed ? ", giving up" : ""}):`, msg);
        return false;
      }
    }

    // allSettled (not all) → a rejected/aborted row can't take the batch down with it.
    const settled = await Promise.allSettled(toLaunch.map((row) => processRow(row)));
    const processed = settled.filter((s) => s.status === "fulfilled" && s.value === true).length;

    // 4) Finalise runs that are now fully settled (all rows done/failed) or capped.
    const finalised = await finaliseSettledRuns(service, [...touchedRuns], estCost, cappedRuns);

    return json({ ok: true, processed, finalised, capped: [...cappedRuns] });
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
 * counts as "done" so it isn't retried). Cost flows through the runner cache/cap harness.
 */
// deno-lint-ignore no-explicit-any
async function maybeRunSeoStep(service: any, apifyToken: string): Promise<boolean> {
  const { data: openRuns } = await service
    .from("ai_audit_runs").select("id, audit_id, results")
    .in("status", ["pending", "running"]).order("created_at", { ascending: true }).limit(10);

  for (const run of (openRuns ?? []) as Row[]) {
    const results = run.results && typeof run.results === "object" ? run.results : {};
    if (results.seo) continue; // already graded (success or failure marker)

    const { data: audit } = await service
      .from("ai_audits").select("user_id, has_website, website, location_text").eq("id", run.audit_id).maybeSingle();
    if (!audit?.has_website || !audit?.website) continue; // no-website audits get no SEO section

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
          return { result: r.seo, costUsd: SOURCES.seo_audit.estCostUsd };
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
  // Extraction invokes are QUEUED per-run and awaited AFTER the loop, so a slow extract-competitors
  // call never blocks finalising the other runs — but the edge runtime still can't cut them off.
  const extractionInvokes: Promise<void>[] = [];

  for (const runId of ids) {
    // A cancelled run is terminal — never resurrect it or flip it to 'complete'. Drop any
    // leftover pending/running rows (e.g. one in-flight when the user hit Stop) so they aren't
    // reprocessed, and leave the run marked 'cancelled'.
    const { data: runRow } = await service.from("ai_audit_runs").select("status").eq("id", runId).maybeSingle();
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

    const results = {
      engines: DEFAULT_ENGINES,
      summary: {
        named_datapoints: named,
        total_datapoints: total,
        mention_rate: mentionRate,
        done_questions: doneQuestions,
        failed_questions: failedQuestions,
        total_questions: rows.length,
      },
      questions,
      ...(existingSeo ? { seo: existingSeo } : {}),
    };
    const runStatus = isCapped ? "capped" : "complete";
    const { error: writeErr } = await service.from("ai_audit_runs")
      .update({ results, mention_rate: mentionRate, status: runStatus })
      .eq("id", runId);
    if (writeErr) {
      console.error(`[process-ai-audit-queue] finalise write failed for run ${runId}:`, writeErr.message);
      continue; // don't fire extraction on a failed write — the run retries next tick
    }
    finalised++;

    // Auto-invoke extract-competitors ONCE per run, at the transition to terminal (prevStatus was
    // pending/running — never for a run already complete/capped/cancelled on entry). Queued here
    // (not awaited in-loop) so it can't block finalising other runs; strictly AFTER the results/
    // status write above has RESOLVED, so it can't race the fold that extract-competitors re-reads
    // and rewrites. Fail-safe: never throws; a non-2xx is logged (a 401/403 misconfig is visible,
    // not a silent no-op) and can never flip the run back out of complete.
    if (prevStatus === "pending" || prevStatus === "running") {
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
    }
  }
  // Await the queued extraction calls so the edge runtime doesn't cut them off when we return.
  if (extractionInvokes.length) await Promise.allSettled(extractionInvokes);
  return finalised;
}
