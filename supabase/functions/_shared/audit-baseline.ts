// audit-baseline — the PAID CLIENT baseline: several runs of the SAME questions, averaged.
//
// WHY THIS EXISTS. A single run is not a defensible measuring stick for the money-back
// guarantee. Measured on real data in this database:
//   • Sinners and Saints, 5 runs, no intervention between them: mention rate went
//     0 → 0.5 → 0 → 0.5 → 0.6. A single-run baseline could "pass" or "fail" the guarantee
//     purely on which run you happened to take.
//   • PHB Services, same audit and questions 7.5h apart: 2 of 5 questions returned a
//     completely different firm list (different COUNTRY, even).
//   • ABLM Associates, 18 runs of the same 9-10 questions: the number of questions that
//     came back with an answer at all swung between 40% and 100%.
// So: average several runs, and when comparing to a later measurement only count questions
// that returned an answer on BOTH sides. Never compare 9-of-10 against 4-of-9.
//
// The chain is driven from process-ai-audit-queue's completion hook: run 1 finishes, this
// fires run 2 with the SAME questions, and so on until baseline_target_runs is reached, at
// which point the average is written to ai_audits.baseline. Sequential by design — each run
// takes minutes and there is no reason to hammer Apify in parallel.

/** The engines whose named/answered signal counts toward the baseline. Mirrors the report. */
const SCORED_ENGINES = ["chatgpt", "gemini"] as const;

export interface BaselineQuestionStat {
  /** How many runs returned an answer for this question on this engine. */
  answered: number;
  /** How many of those named the client. */
  named: number;
}
export interface BaselineSnapshot {
  runs: string[];                 // run ids that make up the baseline
  runs_counted: number;
  questions: Record<string, Record<string, BaselineQuestionStat>>; // question → engine → stat
  summary: {
    questions: number;
    answered_cells: number;       // question×engine×run cells that returned an answer
    named_cells: number;          // of those, how many named the client
    named_rate: number;           // named_cells / answered_cells (0 when nothing answered)
  };
  measured_at: string;
}

// deno-lint-ignore no-explicit-any
type Client = any;

/** Aggregate a set of runs into per-question/per-engine answered+named counts. */
export async function aggregateRuns(service: Client, runIds: string[]): Promise<BaselineSnapshot> {
  const questions: BaselineSnapshot["questions"] = {};
  let answeredCells = 0;
  let namedCells = 0;

  if (runIds.length) {
    const { data: rows } = await service
      .from("ai_audit_queue")
      .select("run_id, question, status, result")
      .in("run_id", runIds);
    for (const row of (rows ?? []) as Array<{ question: string; status: string; result: Record<string, unknown> | null }>) {
      const q = (row.question ?? "").trim();
      if (!q) continue;
      const perEngine = (questions[q] ??= {});
      for (const engine of SCORED_ENGINES) {
        const stat = (perEngine[engine] ??= { answered: 0, named: 0 });
        const er = (row.result ?? {})[engine] as { named?: boolean } | undefined;
        if (!er) continue;           // engine returned nothing this run — not an answered cell
        stat.answered += 1;
        answeredCells += 1;
        if (er.named === true) { stat.named += 1; namedCells += 1; }
      }
    }
  }

  return {
    runs: runIds,
    runs_counted: runIds.length,
    questions,
    summary: {
      questions: Object.keys(questions).length,
      answered_cells: answeredCells,
      named_cells: namedCells,
      named_rate: answeredCells > 0 ? Number((namedCells / answeredCells).toFixed(4)) : 0,
    },
    measured_at: new Date().toISOString(),
  };
}

export interface BaselineComparison {
  /** Questions present AND answered on both sides — the only ones compared. */
  compared_questions: number;
  skipped_questions: string[];
  baseline: { answered_cells: number; named_cells: number; named_rate: number };
  later: { answered_cells: number; named_cells: number; named_rate: number };
  /** later.named_rate - baseline.named_rate, on the common set only. */
  delta_named_rate: number;
  improved: boolean;
}

/**
 * Compare a later measurement to the stored baseline, LIKE FOR LIKE. Only questions that
 * returned at least one answer on both sides are counted, so a run where the engines simply
 * answered fewer questions can never look like a regression (or an improvement).
 */
export function compareToBaseline(baseline: BaselineSnapshot, later: BaselineSnapshot): BaselineComparison {
  const skipped: string[] = [];
  let bAns = 0, bNamed = 0, lAns = 0, lNamed = 0, compared = 0;

  const allQuestions = new Set([...Object.keys(baseline.questions), ...Object.keys(later.questions)]);
  for (const q of allQuestions) {
    const b = baseline.questions[q];
    const l = later.questions[q];
    const bTotal = b ? SCORED_ENGINES.reduce((n, e) => n + (b[e]?.answered ?? 0), 0) : 0;
    const lTotal = l ? SCORED_ENGINES.reduce((n, e) => n + (l[e]?.answered ?? 0), 0) : 0;
    if (bTotal === 0 || lTotal === 0) { skipped.push(q); continue; }  // the denominator fix
    compared += 1;
    for (const e of SCORED_ENGINES) {
      bAns += b![e]?.answered ?? 0; bNamed += b![e]?.named ?? 0;
      lAns += l![e]?.answered ?? 0; lNamed += l![e]?.named ?? 0;
    }
  }

  const bRate = bAns > 0 ? bNamed / bAns : 0;
  const lRate = lAns > 0 ? lNamed / lAns : 0;
  return {
    compared_questions: compared,
    skipped_questions: skipped,
    baseline: { answered_cells: bAns, named_cells: bNamed, named_rate: Number(bRate.toFixed(4)) },
    later: { answered_cells: lAns, named_cells: lNamed, named_rate: Number(lRate.toFixed(4)) },
    delta_named_rate: Number((lRate - bRate).toFixed(4)),
    improved: lRate > bRate,
  };
}

/** What the last advance attempt did. Persisted so a stalled chain is diagnosable from a
 *  query — the first stall cost a day of guessing because console output isn't reachable. */
export interface BaselineAdvanceOutcome {
  at: string;
  source: string;                 // "finalise" (the completion hook) or "sweep" (the safety net)
  action: "finalised" | "started_run" | "waiting_in_flight" | "waiting_no_data" | "error";
  detail?: string;
  runs_usable?: number;
  runs_target?: number;
  http_status?: number;
}

const MAX_DETAIL_LEN = 400;

/**
 * Record the outcome ON THE AUDIT, so "why is this baseline stuck" is one query.
 * Migration-tolerant: when baseline_error / baseline_last_attempt_at are not there yet, fall
 * back to the latest run's results jsonb, which always exists. A stalled paid baseline must
 * never be invisible just because a migration is pending.
 */
async function recordOutcome(service: Client, auditId: string, outcome: BaselineAdvanceOutcome): Promise<void> {
  const summary = `${outcome.action}${outcome.detail ? `: ${outcome.detail}` : ""}`.slice(0, MAX_DETAIL_LEN);
  const { error } = await service
    .from("ai_audits")
    .update({
      // Cleared on any non-error outcome so a fixed chain doesn't keep showing an old failure.
      baseline_error: outcome.action === "error" ? summary : null,
      baseline_last_attempt_at: outcome.at,
    })
    .eq("id", auditId);
  if (!error) return;
  console.warn(`[baseline] outcome columns unavailable (${error.message}); recording on the run instead`);
  const { data: run } = await service
    .from("ai_audit_runs").select("id, results").eq("audit_id", auditId)
    .order("run_number", { ascending: false }).limit(1).maybeSingle();
  if (!run) return;
  const prev = run.results && typeof run.results === "object" ? run.results as Record<string, unknown> : {};
  await service.from("ai_audit_runs").update({ results: { ...prev, baseline_advance: outcome } }).eq("id", run.id);
}

/**
 * Called when a run finishes AND by the periodic sweep. If this audit is a multi-run baseline
 * and runs remain, fire the next one with the SAME questions; once the target is met, write the
 * averaged snapshot to ai_audits.baseline. Fully defensive: any missing column/table or failed
 * call is recorded and swallowed, because this must never break run finalisation.
 *
 * SAFE TO CALL REPEATEDLY. It starts a repeat only when nothing is already pending or running
 * for the audit, which is what lets the sweep run on every cron tick without fanning out a new
 * run each time.
 */
export async function advanceBaseline(service: Client, auditId: string, source = "finalise"): Promise<void> {
  const at = new Date().toISOString();
  const record = (o: Omit<BaselineAdvanceOutcome, "at" | "source">) =>
    recordOutcome(service, auditId, { at, source, ...o })
      .catch((e) => console.error("[baseline] could not record outcome:", e instanceof Error ? e.message : e));
  try {
    const { data: audit, error: aErr } = await service
      .from("ai_audits")
      .select("id, user_id, lead_id, business_name, business_type, location_text, country, has_website, website, specialism, business_scope, baseline_target_runs, baseline")
      .eq("id", auditId).maybeSingle();
    // Column missing (migration not run) or no audit → nothing to advance.
    if (aErr) {
      console.warn("[baseline] skipped:", aErr.message);
      await record({ action: "error", detail: `audit read failed: ${aErr.message}` });
      return;
    }
    const target = Number(audit?.baseline_target_runs ?? 0);
    if (!audit || !(target > 1)) return;          // not a paid baseline audit
    if (audit.baseline) return;                    // already finalised

    // Runs that actually produced data.
    const { data: runs } = await service
      .from("ai_audit_runs").select("id, run_number, status")
      .eq("audit_id", auditId).order("run_number", { ascending: true });
    const all = (runs ?? []) as Array<{ id: string; status: string }>;
    const usable = all.filter((r) => r.status === "complete" || r.status === "capped");
    const inFlight = all.filter((r) => r.status === "pending" || r.status === "running");

    if (usable.length < target && inFlight.length > 0) {
      // IDEMPOTENCY. This is what makes the periodic sweep safe: a repeat is already queued or
      // draining, so starting another would fan out a fresh run on every cron tick.
      await record({ action: "waiting_in_flight", detail: `${inFlight.length} run(s) still going`, runs_usable: usable.length, runs_target: target });
      return;
    }
    if (usable.length === 0) {
      await record({ action: "waiting_no_data", detail: "no complete or capped run yet", runs_usable: 0, runs_target: target });
      return;
    }

    if (usable.length >= target) {
      // Enough runs: average the FIRST `target` of them and store the snapshot.
      const snapshot = await aggregateRuns(service, usable.slice(0, target).map((r) => r.id));
      const { error: upErr } = await service
        .from("ai_audits")
        .update({ baseline: snapshot, baseline_completed_at: new Date().toISOString() })
        .eq("id", auditId);
      if (upErr) {
        console.warn("[baseline] snapshot write failed:", upErr.message);
        await record({ action: "error", detail: `snapshot write failed: ${upErr.message}`, runs_usable: usable.length, runs_target: target });
      } else {
        console.log(`[baseline] audit ${auditId}: baseline finalised over ${snapshot.runs_counted} runs — ` +
          `${snapshot.summary.named_cells}/${snapshot.summary.answered_cells} named cells ` +
          `(${(snapshot.summary.named_rate * 100).toFixed(1)}%) across ${snapshot.summary.questions} questions`);
        await record({ action: "finalised", detail: `${snapshot.runs_counted} runs averaged`, runs_usable: usable.length, runs_target: target });
      }
      return;
    }

    // Runs remain: fire the next one with the SAME questions so the runs are like-for-like.
    const latest = usable[usable.length - 1];
    const { data: qrows } = await service
      .from("ai_audit_queue").select("question").eq("run_id", latest.id).order("created_at", { ascending: true });
    const seen = new Set<string>();
    const questions: string[] = [];
    for (const r of (qrows ?? []) as Array<{ question: string }>) {
      const q = (r.question ?? "").trim();
      if (q && !seen.has(q)) { seen.add(q); questions.push(q); }
    }
    if (!questions.length) {
      console.warn(`[baseline] audit ${auditId}: no questions to repeat`);
      await record({ action: "error", detail: `run ${latest.id} has no questions to repeat`, runs_usable: usable.length, runs_target: target });
      return;
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const res = await fetch(`${supabaseUrl}/functions/v1/create-ai-audit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`,
        "x-cron-secret": Deno.env.get("CRON_SECRET") ?? "",
        "x-internal-job": "1",
      },
      body: JSON.stringify({
        user_id: audit.user_id,
        audit_id: auditId,           // re-run path: same audit, next run_number
        questions,                   // verbatim repeat — the whole point
        purpose: "baseline",         // keeps the wider provided-question cap
        question_count: questions.length,
        business_scope: audit.business_scope ?? undefined,
        // MUST accompany business_scope. Sending scope='local' without it is what killed every
        // repeat run: create-ai-audit's local-scope guard reads the REQUEST's location, so the
        // call was refused 400 local_scope_needs_town and the chain died at run 1. The guard now
        // skips re-runs too, but sending the town the audit already has removes the dependency
        // on that branch entirely.
        location_text: audit.location_text ?? undefined,
      }),
    });
    const rawBody = await res.text();
    let out: { ok?: boolean; error?: unknown } = {};
    try { out = JSON.parse(rawBody); } catch { /* non-JSON body — kept verbatim in the record */ }
    if (!res.ok || !out?.ok) {
      // The whole reason this record exists: the previous version logged this to a console we
      // cannot read, so a refused chain looked identical to a chain that never ran.
      const why = typeof out?.error === "string" ? out.error : rawBody.slice(0, 200);
      console.error(`[baseline] audit ${auditId}: repeat run ${usable.length + 1}/${target} failed:`, res.status, why);
      await record({
        action: "error",
        detail: `repeat run ${usable.length + 1}/${target} refused: ${why}`,
        http_status: res.status,
        runs_usable: usable.length,
        runs_target: target,
      });
      return;
    }
    console.log(`[baseline] audit ${auditId}: started repeat run ${usable.length + 1}/${target} with ${questions.length} questions`);
    await record({
      action: "started_run",
      detail: `run ${usable.length + 1}/${target}, ${questions.length} questions`,
      runs_usable: usable.length,
      runs_target: target,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[baseline] advance error:", msg);
    await record({ action: "error", detail: `threw: ${msg}` });
  }
}

/**
 * SAFETY NET. advanceBaseline used to be called only at a run's finalisation transition — a
 * single shot. Any transient failure there (a cold start, a 500, a network blip) stranded a
 * PAID baseline at one run forever, with the results screen still promising a 3-run average.
 * Measured: two baselines created on 2026-07-26 sat at 1 run indefinitely.
 *
 * This sweep runs on the queue's existing cron tick and re-drives any baseline below its target.
 * advanceBaseline is idempotent (it refuses to start a repeat while one is in flight), so calling
 * it every tick costs one cheap query and cannot fan out duplicate runs. Bounded per tick so a
 * backlog can never monopolise an invocation.
 */
export async function sweepStalledBaselines(service: Client, limit = 5): Promise<number> {
  const { data, error } = await service
    .from("ai_audits").select("id, baseline_target_runs")
    .not("baseline_target_runs", "is", null)
    .is("baseline", null)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) {
    // Columns pending migration → nothing to sweep, and the queue carries on regardless.
    console.warn("[baseline] sweep skipped:", error.message);
    return 0;
  }
  const pending = ((data ?? []) as Array<{ id: string; baseline_target_runs: number | null }>)
    .filter((a) => Number(a.baseline_target_runs ?? 0) > 1);
  for (const a of pending) await advanceBaseline(service, a.id, "sweep");
  if (pending.length) console.log(`[baseline] sweep drove ${pending.length} unfinished baseline(s)`);
  return pending.length;
}
