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

/** Paid baseline shape, from the shared question-count policy. */
import { BASELINE_QUESTIONS, BASELINE_RUNS } from "../../../src/lib/auditQuestionCounts.ts";
import { pickAuditTown } from "./place-town.ts";
import { dedupeQuestions } from "../../../src/lib/seedGuard.ts";

/** Towns this is not. Mirrors findable-onboarding: forcing scope='local' needs a real town. */
const NON_TOWN = new Set([
  "uk", "u.k.", "united kingdom", "great britain", "britain", "gb", "england", "scotland",
  "wales", "northern ireland", "ireland", "nationwide", "national", "online", "remote",
  "everywhere", "anywhere", "the local area",
]);

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
/** How many runs beyond the target the chain may burn before giving up (see the spend bound). */
const MAX_EXTRA_ATTEMPTS = 2;

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

    // SPEND BOUND on the sweep itself. A failed run is neither usable nor in flight, so without
    // this the sweep would start a replacement every cycle for as long as runs keep failing —
    // one real Apify run each time, forever. Allow a couple of retries beyond the target, then
    // stop and say so. A baseline that cannot reach its target is an operator problem, not
    // something to keep buying.
    if (usable.length < target && all.length >= target + MAX_EXTRA_ATTEMPTS) {
      await record({
        action: "error",
        detail: `gave up after ${all.length} runs: only ${usable.length}/${target} usable (${all.filter((r) => r.status === "failed").length} failed)`,
        runs_usable: usable.length,
        runs_target: target,
      });
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
    /* Case-insensitive: repeating a run must not repeat two casings of one question. This is the
       week-eight / run-2-3 path, so a duplicate here would be paid for on every subsequent run. */
    const repeat = dedupeQuestions(((qrows ?? []) as Array<{ question: string }>).map((r) => r.question ?? ""));
    const questions: string[] = repeat.questions;
    if (repeat.duplicates.length) {
      console.warn(`[baseline] audit ${auditId}: ${repeat.duplicates.length} case-duplicate question(s) not repeated: ${repeat.duplicates.join(" | ")}`);
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

/**
 * START a paid client's 3-run baseline. Called AFTER PAYMENT, never while the customer waits.
 *
 * WHY IT MOVED. The baseline used to be fired by findable-onboarding on submit, which parked the
 * customer on a "building your report" screen for up to five minutes directly in front of the
 * payment button — friction in the worst possible place, for a measurement they cannot see and
 * do not need before paying. They have already read their report; that link is what brought them.
 *
 * IDEMPOTENT. Returns early if the lead already has an audit with baseline_target_runs > 1, so a
 * Stripe webhook retry, a duplicate event and the queue backstop can all call it freely without
 * buying a second baseline. That guard also replaces the per-lead cap the public submit path used
 * to need — the public endpoint no longer starts any audit at all.
 */
export async function startPaidBaseline(
  service: Client,
  onboardingId: string,
  source: string,
): Promise<{ ok: boolean; audit_id?: string; skipped?: string; error?: string }> {
  try {
    const { data: row, error: rErr } = await service
      .from("onboarding_responses")
      .select("id, lead_id, confirmed_location, services")
      .eq("id", onboardingId).maybeSingle();
    if (rErr) return { ok: false, error: `onboarding read failed: ${rErr.message}` };
    if (!row) return { ok: false, error: "onboarding row not found" };
    const leadId = row.lead_id as string | null;
    if (!leadId) return { ok: false, skipped: "no_lead_id" };

    // Already has one? Nothing to do — this is what makes retries safe.
    const { data: existing, error: eErr } = await service
      .from("ai_audits").select("id, baseline_target_runs").eq("lead_id", leadId);
    if (eErr) return { ok: false, error: `audit lookup failed: ${eErr.message}` };
    const already = ((existing ?? []) as Array<{ id: string; baseline_target_runs: number | null }>)
      .find((a) => Number(a.baseline_target_runs ?? 0) > 1);
    if (already) return { ok: true, audit_id: already.id, skipped: "already_has_baseline" };

    // deno-lint-ignore no-explicit-any
    let lead: any; // eslint-disable-line
    // deno-lint-ignore no-explicit-any
    let lErr: any;
    ({ data: lead, error: lErr } = await service
      .from("outreach_leads")
      .select("id, user_id, business_name, category, search_keyword, country, website, search_location, derived_town")
      .eq("id", leadId).maybeSingle());
    /* MIGRATION-TOLERANT, and this is not theoretical: derived_town is added by a migration Paul
       applies BY HAND, so between this deploy and that SQL the column does not exist and PostgREST
       fails the whole select with a 400. Without this retry the paid baseline — the guarantee path —
       would abort on "lead read failed" for every client in that window. Same pattern
       create-ai-audit already uses for baseline_target_runs. */
    if (lErr && /derived_town/i.test(lErr.message ?? "")) {
      console.warn("[baseline] derived_town column not present yet — reading without it");
      const retry = await service
        .from("outreach_leads")
        .select("id, user_id, business_name, category, search_keyword, country, website, search_location")
        .eq("id", leadId).maybeSingle();
      lead = retry.data;
      lErr = retry.error;
    }
    if (lErr) return { ok: false, error: `lead read failed: ${lErr.message}` };
    if (!lead) return { ok: false, error: "lead not found" };

    const bizType = ((lead.category as string) || (lead.search_keyword as string) || "").trim();
    if (!bizType) return { ok: false, skipped: "no_business_type" };
    /* THE GUARANTEE PATH. This is the measurement the money-back promise is settled against, so the
       town must be the one the business is actually in — a baseline measured on the searched town
       would settle the guarantee against a question no real customer asks.

       Precedence now matches create-ai-audit: confirmed_location || derived_town || search_location.
       derived_town is read rather than fetched here: the outreach audit that preceded this baseline
       already paid for it and cached it on the lead for 30 days, so a paying customer's chain never
       waits on a Google call or fails because one errored. */
    const picked = pickAuditTown({
      confirmedLocation: row.confirmed_location as string | null,
      derivedTown: lead.derived_town as string | null,
      searchLocation: lead.search_location as string | null,
    });
    const locationText = picked.town;
    if (!locationText) return { ok: false, skipped: "no_location" };
    console.log(`[baseline] lead ${leadId}: town "${locationText}" via ${picked.source}`);
    const scopeIsLocal = !NON_TOWN.has(locationText.toLowerCase());

    /* SEED FROM THE AUDIT THE PROSPECT ACTUALLY READ.
       The outreach audit's questions are the report that sold them. Generating ten fresh ones here
       meant the numbers that closed the sale were not the numbers the money-back guarantee is
       measured on — while the pitch says, in writing, that we re-measure the same way at 8 weeks.
       These are a SEED, not the set: create-ai-audit guards each one and generates the rest up to
       BASELINE_QUESTIONS. A lead with no earlier audit sends nothing and gets all ten generated,
       exactly as before.

       Best-effort throughout. A failure here must never stop a paid client's baseline starting; the
       worst case is the old behaviour, which is a working baseline on freshly generated questions. */
    let seedQuestions: string[] = [];
    try {
      const { data: priorAudits } = await service
        .from("ai_audits").select("id, baseline_target_runs, created_at")
        .eq("lead_id", leadId).order("created_at", { ascending: false });
      // <= 1 target run is an ORDINARY audit. Never seed from another baseline: those questions are
      // already a measurement, and copying them would chain one guarantee onto another.
      const outreach = ((priorAudits ?? []) as Array<{ id: string; baseline_target_runs: number | null }>)
        .find((a) => Number(a.baseline_target_runs ?? 0) <= 1);
      if (outreach) {
        const { data: latestRun } = await service
          .from("ai_audit_runs").select("id").eq("audit_id", outreach.id)
          .order("run_number", { ascending: false }).limit(1).maybeSingle();
        if (latestRun) {
          const { data: qRows } = await service
            .from("ai_audit_queue").select("question").eq("run_id", (latestRun as { id: string }).id)
            .order("created_at", { ascending: true });
          const seen = new Set<string>();
          for (const r of qRows ?? []) {
            const q = String((r as { question?: string }).question ?? "").trim();
            const key = q.toLowerCase();
            if (q && !seen.has(key)) { seen.add(key); seedQuestions.push(q); }
          }
        }
      }
      console.log(`[audit-baseline] lead ${leadId}: seeding baseline with ${seedQuestions.length} outreach question(s)`);
    } catch (e) {
      seedQuestions = [];
      console.error(`[audit-baseline] seed lookup failed for lead ${leadId} (non-blocking):`, (e as Error).message);
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
        user_id: lead.user_id,
        lead_id: leadId,
        business_name: lead.business_name,
        business_type: bizType,
        location_text: locationText,
        specialisms: ((row.services as string) ?? "").slice(0, 200),
        country: lead.country ?? null,
        website: lead.website ?? null,
        has_website: !!lead.website,
        ...(scopeIsLocal ? { business_scope: "local" } : {}),
        purpose: "baseline",
        question_count: BASELINE_QUESTIONS,
        baseline_target_runs: BASELINE_RUNS,
        // Omitted entirely when there is nothing to seed, so a lead with no earlier audit takes the
        // untouched generate-all-ten path rather than an empty-array edge case.
        ...(seedQuestions.length ? { questions: seedQuestions } : {}),
      }),
    });
    const body = await res.text();
    let out: { ok?: boolean; audit_id?: string; error?: unknown } = {};
    try { out = JSON.parse(body); } catch { /* non-JSON kept verbatim below */ }
    if (!res.ok || !out?.ok || !out?.audit_id) {
      const why = typeof out?.error === "string" ? out.error : body.slice(0, 200);
      console.error(`[baseline] start failed for onboarding ${onboardingId} (${source}): ${res.status} ${why}`);
      return { ok: false, error: `create-ai-audit refused: ${why}` };
    }
    console.log(`[baseline] started paid baseline ${out.audit_id} for onboarding ${onboardingId} (${source})`);
    await service.from("onboarding_responses")
      .update({ audit_id: out.audit_id, updated_at: new Date().toISOString() })
      .eq("id", onboardingId);
    return { ok: true, audit_id: out.audit_id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[baseline] start threw for onboarding ${onboardingId} (${source}):`, msg);
    return { ok: false, error: `threw: ${msg}` };
  }
}

/**
 * BACKSTOP, so a paying client cannot end up without a baseline.
 *
 * The Stripe webhook starts the baseline on the payment event, but that is one attempt over the
 * network: create-ai-audit could be cold, rate-limited or briefly down. This runs on the queue's
 * existing cron tick and starts a baseline for any PAID onboarding row whose lead still has none.
 * startPaidBaseline is idempotent, so this costs one cheap query when there is nothing to do.
 *
 * Failures are recorded to client_error_reports, but at most once an hour per row, so a sustained
 * outage leaves a visible trail instead of 60 rows a minute.
 */
export async function ensureBaselinesForPaidOnboardings(service: Client, limit = 5): Promise<number> {
  const { data, error } = await service
    .from("onboarding_responses")
    .select("id, lead_id")
    .eq("status", "paid")
    .not("lead_id", "is", null)
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.warn("[baseline] paid-client backstop skipped:", error.message);
    return 0;
  }
  const rows = (data ?? []) as Array<{ id: string; lead_id: string }>;
  if (!rows.length) return 0;

  let started = 0;
  for (const r of rows) {
    const res = await startPaidBaseline(service, r.id, "paid-backstop");
    if (res.ok && !res.skipped) started++;
    if (!res.ok) {
      // Rate-limited failure record: only if nothing was logged for this row in the last hour.
      const since = new Date(Date.now() - 60 * 60_000).toISOString();
      const { data: recent } = await service
        .from("client_error_reports").select("id")
        .eq("error_id", "baseline_start_failed")
        .gte("created_at", since)
        .contains("context", { onboarding_id: r.id })
        .limit(1);
      if (!recent || (recent as unknown[]).length === 0) {
        await service.from("client_error_reports").insert({
          error_id: "baseline_start_failed",
          context: { onboarding_id: r.id, lead_id: r.lead_id, reason: res.error ?? res.skipped, at: new Date().toISOString() },
        });
      }
    }
  }
  if (started) console.log(`[baseline] paid-client backstop started ${started} baseline(s)`);
  return started;
}
