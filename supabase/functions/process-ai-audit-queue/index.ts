import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SOURCES } from "../_shared/enrichment/sources.ts";
import { runEnrichSource } from "../_shared/enrichment/runner.ts";
import { runAiSearch, normalizeAiSearch, toCountryCode } from "../_shared/enrichment/ai-search.ts";

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

const BATCH = 1;                 // ONE row per tick → a tick can't exceed the edge wall-clock
const CAP_USD = 3.0;             // per-RUN Apify cost ceiling (this audit run)
const DAILY_CAP_USD = 15.0;      // per-USER rolling-24h ceiling (across audits) via the runner
const MAX_ATTEMPTS = 3;          // per queue row before it's marked failed
const RUN_TIMEOUT_MS = 110_000;  // per actor run — heavy multi-engine run often needs >80s; BATCH=1 keeps one attempt under the edge wall-clock
const STALE_RUNNING_MS = 3 * 60 * 1000; // reclaim rows stuck 'running' longer than this
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
        .from("ai_audit_queue").select("id, attempts")
        .eq("status", "running").lt("updated_at", staleBefore);
      for (const r of (stale ?? []) as Row[]) {
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

    // 1) Claim a batch of pending questions (oldest first — uses the status,created_at index).
    const { data: pending } = await service
      .from("ai_audit_queue")
      .select("id, audit_id, run_id, user_id, question, engines, attempts, status")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(BATCH);
    if (!pending || pending.length === 0) {
      // Even with nothing pending, finalise any runs left settled by a prior tick.
      const finalised = await finaliseSettledRuns(service, [], estCost);
      return json({ ok: true, processed: 0, finalised });
    }

    // Mark them running so an overlapping tick can't re-grab them.
    await service.from("ai_audit_queue").update({ status: "running" }).in("id", pending.map((r: Row) => r.id));

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

    let processed = 0;
    const touchedRuns = new Set<string>();

    for (const row of pending as Row[]) {
      touchedRuns.add(row.run_id);
      const audit = await getAudit(row.audit_id);

      // Per-run cost cap — never spend past CAP_USD.
      const spent = await accumulatedCost(row.run_id);
      if (cappedRuns.has(row.run_id) || spent + estCost > CAP_USD) {
        cappedRuns.add(row.run_id);
        await service.from("ai_audit_queue")
          .update({ status: "failed", result: { error: "capped" } }).eq("id", row.id);
        continue;
      }

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
          // per-RUN CAP_USD check above bounds this single audit run.
          capUsd: DAILY_CAP_USD,
          run: async () => {
            // In-call retry is 429/5xx ONLY — deliberately NOT onAbort, so a single tick
            // stays one ≤RUN_TIMEOUT_MS attempt (well under the edge wall-clock). A timeout/
            // abort throws → the catch below bumps attempts and re-queues it as 'pending',
            // so timeouts DO retry, just on the NEXT tick, up to MAX_ATTEMPTS.
            const { items } = await runAiSearch(String(row.question), audit.countryCode, {
              token: apifyToken,
              timeoutMs: RUN_TIMEOUT_MS,
              retry: { on429: true },
            });
            return { result: normalizeAiSearch(items, audit.businessName), costUsd: estCost };
          },
        });

        // Runner hit the per-user rolling-24h ceiling → treat like a cap, not an error:
        // stop this run, drop its remaining rows below. No spend happened.
        if (outcome.capReached) {
          cappedRuns.add(row.run_id);
          await service.from("ai_audit_queue")
            .update({ status: "failed", result: { error: "daily_cap" } }).eq("id", row.id);
          continue;
        }
        if (!outcome.result) throw new Error("empty_actor_result");
        await service.from("ai_audit_queue").update({ status: "done", result: outcome.result }).eq("id", row.id);
        runCost.set(row.run_id, spent + (outcome.costUsd || estCost));
        processed++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const attempts = (Number(row.attempts) || 0) + 1;
        const failed = attempts >= MAX_ATTEMPTS;
        // Persist the error onto the row so failures are visible in the DB (not just logs).
        // A non-terminal error goes back to 'pending' and retries next tick; the last error
        // is overwritten by the real result if a later attempt succeeds.
        await service.from("ai_audit_queue")
          .update({ status: failed ? "failed" : "pending", attempts, result: { error: msg } }).eq("id", row.id);
        // A retry consumed a run too → count it toward the cap.
        runCost.set(row.run_id, spent + estCost);
        console.error(`[process-ai-audit-queue] question failed (attempt ${attempts}${failed ? ", giving up" : ""}):`, msg);
      }
    }

    // 2) Finalise runs that are now fully settled (all rows done/failed) or capped.
    const finalised = await finaliseSettledRuns(service, [...touchedRuns], estCost, cappedRuns);

    return json({ ok: true, processed, finalised, capped: [...cappedRuns] });
  } catch (e) {
    console.error("[process-ai-audit-queue] error:", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "unknown_error" }, 500);
  }
});

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

  for (const runId of ids) {
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
    };
    const runStatus = isCapped ? "capped" : "complete";
    await service.from("ai_audit_runs")
      .update({ results, mention_rate: mentionRate, status: runStatus })
      .eq("id", runId);
    finalised++;
  }
  return finalised;
}
