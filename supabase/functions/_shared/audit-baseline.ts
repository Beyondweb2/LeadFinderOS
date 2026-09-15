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

/* ⛔ HOW LONG AFTER ONE RUN STARTS BEFORE THE NEXT ONE DOES (2026-09-13, Paul's call).
   Three minutes, and the number is measured rather than picked: the runs were already ~4 minutes
   apart in practice (median of 242 gaps) and the ±5-point noise band was measured on runs 5-29
   minutes apart, so 3 sits inside the range the band actually describes. CLAUDE.md §25.
   ⚠️ RAISING IT COSTS WALL CLOCK, LOWERING IT LEAVES THE EVIDENCE. Below ~1 minute there is no
   measured behaviour at all to appeal to — 2 of 242 observed gaps, on runs that share too few
   questions to compare. Do not set it to 0 without new data. */
export const RUN_STAGGER_MS = 3 * 60 * 1000;

/* The skip reason names the missing answer in the words the operator uses, not the column name.
   ⚠️ A field with no entry here falls back to its column name rather than being dropped: a skip
   reason that silently omitted the one thing being waited for would be the absent-value shape on a
   diagnostic. The RULE for which fields are required lives in src/lib/questionnaireComplete.ts. */
const MISSING_LABEL = (field: string): string =>
  ({ confirmed_location: "no confirmed town", services: "no services" } as Record<string, string>)[field]
  ?? `no ${field}`;

/** The engines whose named/answered signal counts toward the baseline. Mirrors the report. */
const SCORED_ENGINES = ["chatgpt", "gemini"] as const;

/** Paid baseline shape, from the shared question-count policy. */
import { BASELINE_QUESTIONS, BASELINE_RUNS, FULL_MEASURE_QUESTIONS } from "../../../src/lib/auditQuestionCounts.ts";
import { findPaidBaseline, findAmbiguousMultiRun, FREE_CHECK_AUDIT_PURPOSE } from "../../../src/lib/auditKind.ts";
import { type BaselineContract } from "../../../src/lib/baselineContract.ts";
import { cellNamed } from "../../../src/lib/namedSignal.ts";
import { fullMeasureAllocation } from "../../../src/lib/fullMeasure.ts";
import { isRemeasureDue, utcDateISO } from "../../../src/lib/remeasureDue.ts";
import { remeasureDueFill, workIncompleteFor } from "../../../src/lib/remeasureFill.ts";
import { planReplay } from "../../../src/lib/baselineReplay.ts";
import { REFUNDED_STATUS } from "../../../src/lib/leadPayment.ts";
import { missingQuestionnaireFields } from "../../../src/lib/questionnaireComplete.ts";
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
        if (cellNamed(er)) { stat.named += 1; namedCells += 1; }
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

/** What the last advance attempt did. Persisted so a stalled chain is diagnosable from a
 *  query — the first stall cost a day of guessing because console output isn't reachable. */
export interface BaselineAdvanceOutcome {
  at: string;
  source: string;                 // "finalise" (the completion hook) or "sweep" (the safety net)
  action: "finalised" | "started_run" | "waiting_in_flight" | "waiting_stagger" | "waiting_no_data" | "error";
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
    /* ⛔ `is_measurement` IS READ HERE FOR THE REPEAT'S PURPOSE — see the purpose branch below.
       MIGRATION-TOLERANT, the same way startPaidBaseline reads it: it is a hand-added column, so a
       select that fails ON THAT NAME is retried without it and every row then reads as
       non-measurement, which is exactly the behaviour this function had before. Failing closed that
       way keeps paid baselines correct on a DB that has not got the column. */
    const AUDIT_COLS_BASE =
      "id, user_id, lead_id, business_name, business_type, location_text, country, has_website, website, specialism, business_scope, baseline_target_runs, baseline, audit_purpose, created_at";
    // deno-lint-ignore no-explicit-any
    let audit: any = null;
    let aErr: { message?: string } | null = null;
    ({ data: audit, error: aErr } = await service
      .from("ai_audits")
      .select(`${AUDIT_COLS_BASE}, is_measurement`)
      .eq("id", auditId).maybeSingle());
    if (aErr && /is_measurement/i.test(aErr.message ?? "")) {
      console.warn("[baseline] is_measurement column not present — reading without it (repeats stay on the baseline cap)");
      ({ data: audit, error: aErr } = await service
        .from("ai_audits")
        .select(AUDIT_COLS_BASE)
        .eq("id", auditId).maybeSingle());
    }
    // Column missing (migration not run) or no audit → nothing to advance.
    if (aErr) {
      console.warn("[baseline] skipped:", aErr.message);
      await record({ action: "error", detail: `audit read failed: ${aErr.message}` });
      return;
    }
    const target = Number(audit?.baseline_target_runs ?? 0);
    /* Read ONCE, next to the target, so the purpose sent on the repeat below cannot drift from the
       audit it belongs to. A missing column (see the tolerant select above) reads as false. */
    const isMeasurementAudit = (audit as { is_measurement?: boolean | null } | null)?.is_measurement === true;
    /* ⛔ THE REPEAT CARRIES THE AUDIT'S OWN PURPOSE (2026-09-13). A free check's runs 2 and 3 used
       to be posted as "baseline" — harmless on the reuse path (create-ai-audit never UPDATEs the
       audit row) but it meant the request described a different audit from the one it extended.
       Sending 'free_check' back keeps create-ai-audit's per-purpose rules (the forced SEO skip)
       applying to every run. Baselines and measurements are unchanged. */
    const storedPurpose = typeof (audit as { audit_purpose?: unknown } | null)?.audit_purpose === "string"
      ? String((audit as { audit_purpose?: string }).audit_purpose) : "";
    const repeatPurpose = storedPurpose === FREE_CHECK_AUDIT_PURPOSE
      ? FREE_CHECK_AUDIT_PURPOSE
      : isMeasurementAudit ? "measurement" : "baseline";
    if (!audit || !(target > 1)) return;          // not a paid baseline audit
    if (audit.baseline) return;                    // already finalised

    // Runs that actually produced data. `results` is read for run 1's SEO marker (see the repeat).
    const { data: runs } = await service
      /* ⛔ created_at IS LOAD-BEARING SINCE THE STAGGER. Without it every run reads as having no
         start time, `sinceNewest` becomes Infinity and the stagger fires on EVERY tick — the guard
         would look present and do nothing. Caught before shipping; do not slim this select. */
      .from("ai_audit_runs").select("id, run_number, status, results, created_at")
      .eq("audit_id", auditId).order("run_number", { ascending: true });
    const all = (runs ?? []) as Array<{ id: string; status: string; results?: unknown }>;
    const usable = all.filter((r) => r.status === "complete" || r.status === "capped");
    const inFlight = all.filter((r) => r.status === "pending" || r.status === "running");
    /* Did run 1 decline the SEO scan? create-ai-audit stamps `results.seo = { skipped: … }` at run
       creation when skip_seo was set, so the marker exists before the run does — readable here even
       while run 1 is still going. Anything else (a graded scan, a failure marker, nothing yet) reads
       as "did not skip", and the repeat is posted without the flag exactly as before. */
    const firstRunResults = (all[0]?.results && typeof all[0].results === "object")
      ? all[0].results as Record<string, unknown> : {};
    const firstRunSeo = firstRunResults.seo as { skipped?: unknown } | undefined;
    const firstRunSkippedSeo = !!(firstRunSeo && typeof firstRunSeo === "object" && firstRunSeo.skipped);

    /* ⛔ THE STAGGER (2026-09-13). The next run starts RUN_STAGGER_MS after the newest one STARTED,
       not when it finished. Three minutes keeps a real interval between samples — inside the range
       the noise band was actually measured over — while overlapping the runs, which is where the
       wall clock saving comes from. §25 has the measurements.
       ⛔ NOT ZERO, DELIBERATELY. Firing all three at one instant buys ~2 more minutes and takes the
       sampling outside anything ever measured; the flip-rate evidence is far too thin to support it.
       ⛔ AND THE RACE IS RESOLVED BY THE DATABASE, NOT BY THIS TEST. advanceBaseline runs from two
       places on every 30-second tick and both can pass this at once. `run_number` is a
       read-then-write; uq_ai_audit_runs_audit_run_number is what makes exactly one insert land, and
       create-ai-audit answers the loser's 23505 with a quiet 200 skip. Without that index this
       predicate would silently buy a fourth run. */
    if (usable.length < target && all.length >= target) {
      // Every run has been STARTED; we are only waiting for them to land. Nothing to post.
      await record({ action: "waiting_in_flight", detail: `${inFlight.length} run(s) still going`, runs_usable: usable.length, runs_target: target });
      return;
    }
    const starts = all
      .map((r) => new Date((r as { created_at?: string }).created_at ?? "").getTime())
      .filter((t) => Number.isFinite(t));
    const sinceNewest = starts.length ? Date.now() - Math.max(...starts) : Number.POSITIVE_INFINITY;
    if (usable.length < target && all.length > 0 && sinceNewest < RUN_STAGGER_MS) {
      await record({
        action: "waiting_stagger",
        detail: `next run due in ${Math.max(0, Math.ceil((RUN_STAGGER_MS - sinceNewest) / 1000))}s`,
        runs_usable: usable.length,
        runs_target: target,
      });
      return;
    }
    /* 🔴 THIS CHECK USED TO BLOCK THE STAGGER, AND THE TEST CAUGHT IT BEFORE IT SHIPPED.
       It predates the change and was harmless while runs were sequential: with a run in flight the
       in-flight branch above always fired first, so `usable === 0` was only ever reached by an audit
       with nothing running. Under the stagger the common case is exactly run 1 started three minutes
       ago and not yet landed — usable 0, one run in flight — and returning here would have meant run
       2 still waited for run 1 to finish. The predicate would have looked changed and done nothing.
       ⛔ SO IT GUARDS EXACTLY ONE THING NOW: an audit with NO runs at all, which this function
       cannot extend (run 1 is startPaidBaseline's job). The all-started case it used to cover is
       already caught by the in-flight branch above, and starting a staggered run reads no results,
       so it belongs above this line rather than below it.
       ⚠️ THE FIRST NARROWING WAS `all.length >= target`, WHICH LET A ZERO-RUN AUDIT FALL THROUGH TO
       START A REPEAT. Harmless (create-ai-audit now refuses a repeat with no previous run) but not
       intended; `=== 0` says what is actually meant. */
    if (usable.length === 0 && all.length === 0) {
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
      /* ⛔ CONDITIONAL, AND THE WINNER IS THE ONLY ONE THAT HANDS OFF. `advanceBaseline` runs from
         two places every 30s tick (finalisation and the sweep), so two ticks can both read
         `baseline IS NULL` and both arrive here. `.is("baseline", null)` makes exactly one write
         land; `.select()` tells us whether it was ours. Everything that must happen ONCE when a
         baseline is frozen — starting the full measure, filling the day-28 date — hangs off
         `won`, never off "this code ran". */
      const { data: finalisedRows, error: upErr } = await service
        .from("ai_audits")
        .update({ baseline: snapshot, baseline_completed_at: new Date().toISOString() })
        .eq("id", auditId)
        .is("baseline", null)
        .select("id");
      const won = !upErr && Array.isArray(finalisedRows) && finalisedRows.length === 1;
      if (upErr) {
        console.warn("[baseline] snapshot write failed:", upErr.message);
        await record({ action: "error", detail: `snapshot write failed: ${upErr.message}`, runs_usable: usable.length, runs_target: target });
      } else {
        console.log(`[baseline] audit ${auditId}: baseline finalised over ${snapshot.runs_counted} runs — ` +
          `${snapshot.summary.named_cells}/${snapshot.summary.answered_cells} named cells ` +
          `(${(snapshot.summary.named_rate * 100).toFixed(1)}%) across ${snapshot.summary.questions} questions`);
        await record({ action: "finalised", detail: `${snapshot.runs_counted} runs averaged`, runs_usable: usable.length, runs_target: target });
        if (won) await onBaselineFrozen(service, audit as FrozenBaseline);
        else console.log(`[baseline] audit ${auditId}: another tick finalised it first — no hand-off from this one`);
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
        /* ⛔ THE REPEAT MUST BE GRADED AS WHAT IT IS. This said `purpose: "baseline"` for every
           repeat, which sent a MEASUREMENT's runs 2 and 3 through create-ai-audit's BASELINE ceiling
           (BASELINE_MAX_QUESTION_COUNT = 20) — so a 47-question measurement ran 47 / 20 / 20 and a
           25-question one ran 25 / 20 / 20. Twenty-seven of Solene's questions were measured ONCE,
           which is precisely the single-run unreliability a 3-run measurement exists to avoid.
           The comment at create-ai-audit:306 warns about this exact failure for baselines; the
           measurement path re-introduced it because the purpose was hardcoded here.

           ⚠️ PAID BASELINES ARE UNCHANGED — they are not measurements, so they still send
           "baseline" and still clamp at 20, deliberately: the guarantee's cost ceiling.
           ⚠️ AND THE MEASUREMENT PATH GETS ITS SEO SKIP BACK ON THE REPEATS. create-ai-audit:361 is
           `skipSeo = body.skip_seo === true || isMeasurement`, so a repeat sent as "baseline" was not
           structurally skipping the scan the way run 1 does. Sending the true purpose makes runs 2
           and 3 behave like run 1 in both respects, which is the whole point of a repeat.
           ⚠️ Safe on the reuse path: create-ai-audit honours an EXPLICIT body.audit_id regardless of
           purpose (the !isMeasurement guard at :476 only blocks AUTO-discovering a reuse target),
           and it never UPDATEs ai_audits, so a repeat cannot rewrite the audit's own markers. */
        purpose: repeatPurpose,
        question_count: questions.length,
        /* ⛔ A REPEAT SKIPS THE SCAN IF RUN 1 DID (2026-09-13). This post carried no skip_seo, so a
           free check — run 1 posted with skip_seo:true — bought the ~4p scan on run 2 for any
           business with a website, and the report the visitor opened (rendered off the LAST run)
           grew a website section run 1 was designed not to have. The flag is read off the FIRST
           run's own marker rather than typed per purpose, so whatever run 1 decided, runs 2 and 3
           decide the same. (A paid baseline's run 1 scans, so its repeats keep inheriting it.) */
        ...(firstRunSkippedSeo ? { skip_seo: true } : {}),
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

/** The columns onBaselineFrozen needs, as advanceBaseline selects them. */
export interface FrozenBaseline {
  id: string;
  user_id: string;
  lead_id: string | null;
  business_name: string | null;
  business_type: string | null;
  location_text: string | null;
  country: string | null;
  has_website: boolean | null;
  website: string | null;
  specialism: string | null;
  business_scope: string | null;
  audit_purpose?: string | null;
  created_at?: string | null;
}

/**
 * ⛔ EVERYTHING THAT HAPPENS EXACTLY ONCE WHEN A BASELINE FREEZES. Called by advanceBaseline only
 * from the tick whose conditional write finalised the audit (`won`), so a second tick that read
 * the same state a moment earlier cannot run this twice. Order is structural here: the full
 * measure cannot exist before the baseline it must be disjoint from, because this is the only
 * place that starts it.
 */
export async function onBaselineFrozen(service: Client, audit: FrozenBaseline): Promise<void> {
  if (audit.audit_purpose !== "baseline" || !audit.lead_id) return;
  /* ⛔ THE ONE-TIME FILL OF THE DAY-28 DATE — WHERE remeasure_due_date IS NULL, and nowhere else.
     The value comes from remeasureFill.ts (the only +REMEASURE_OFFSET_DAYS in the system); the
     write is conditional in the database as well, so a stored date — RG's hand-set 2026-10-06,
     Ronnie's 2026-10-13 — cannot be touched even if the read above raced an operator's edit.
     The tick that fires the replay (fireDueRemeasures) READS this column and computes nothing. */
  try {
    const { data: lr } = await service
      .from("outreach_leads").select("remeasure_due_date").eq("id", audit.lead_id).maybeSingle();
    const fill = remeasureDueFill((lr as { remeasure_due_date?: string | null } | null)?.remeasure_due_date, new Date().toISOString());
    if (fill) {
      const { data: written } = await service
        .from("outreach_leads").update({ remeasure_due_date: fill })
        .eq("id", audit.lead_id).is("remeasure_due_date", null).select("id");
      console.log(`[baseline] lead ${audit.lead_id}: remeasure_due_date ${(written ?? []).length ? `set to ${fill}` : "already set — left alone"}`);
    } else {
      console.log(`[baseline] lead ${audit.lead_id}: remeasure_due_date already stored — left alone`);
    }
  } catch (e) {
    console.error(`[baseline] remeasure_due_date fill threw for lead ${audit.lead_id}:`, e instanceof Error ? e.message : e);
  }
  try {
    await startFullMeasure(service, audit);
  } catch (e) {
    console.error(`[baseline] full measure start threw for audit ${audit.id}:`, e instanceof Error ? e.message : e);
  }
}

/**
 * THE FULL MEASURE — FULL_MEASURE_QUESTIONS x MEASUREMENT_RUNS across the home town and the
 * client's picked areas, AFTER the baseline is frozen. Never compared to anything; finds which
 * questions and towns are winnable so we know where to build pages.
 *
 * ⛔ THE BASELINE'S ASKED SET IS EXCLUDED SERVER-SIDE. create-ai-audit reads
 * outreach_leads.baseline_audit_id itself for any measurement with a lead_id, so this caller
 * cannot forget to pass it and no caller can pass a different one.
 * ⛔ ONE PER BASELINE. A measurement audit created after the baseline already exists → skip.
 * The conditional finalisation upstream makes the double-call itself rare; this makes it inert.
 */
export async function startFullMeasure(service: Client, audit: FrozenBaseline): Promise<{ ok: boolean; audit_id?: string; skipped?: string; error?: string }> {
  const leadId = audit.lead_id as string;
  const { data: existing } = await service
    .from("ai_audits").select("id, created_at")
    .eq("lead_id", leadId).eq("audit_purpose", "measurement")
    .gte("created_at", audit.created_at ?? "1970-01-01")
    .limit(1);
  if ((existing ?? []).length) {
    console.log(`[baseline] lead ${leadId}: full measure already exists (${(existing as Array<{ id: string }>)[0].id}) — not starting another`);
    return { ok: true, skipped: "already_has_full_measure" };
  }
  /* The picked towns, from the newest PAID questionnaire for this lead. Absent → home town only. */
  const { data: onb } = await service
    .from("onboarding_responses").select("areas_list")
    .eq("lead_id", leadId).eq("status", "paid")
    .order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const areas = Array.isArray((onb as { areas_list?: unknown } | null)?.areas_list)
    ? ((onb as { areas_list: unknown[] }).areas_list.filter((a): a is string => typeof a === "string"))
    : [];
  const home = (audit.location_text ?? "").trim();
  if (!home) return { ok: false, error: "baseline has no town" };
  const { allocation, dropped } = fullMeasureAllocation(home, areas);
  if (dropped.length) console.warn(`[baseline] lead ${leadId}: full measure cannot fit ${dropped.length} area(s) at ${FULL_MEASURE_QUESTIONS}: ${dropped.join(", ")}`);

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
      lead_id: leadId,
      business_name: audit.business_name,
      business_type: audit.business_type,
      location_text: home,
      specialisms: audit.specialism ?? "",
      country: audit.country ?? null,
      website: audit.website ?? null,
      has_website: audit.has_website === true,
      ...(audit.business_scope ? { business_scope: audit.business_scope } : {}),
      purpose: "measurement",
      question_count: FULL_MEASURE_QUESTIONS,
      skip_seo: true,
      /* The town came from the client's own questionnaire via the baseline — the same evidence the
         baseline's own exemption rests on. Without this a client Google cannot resolve is gated. */
      town_confirmed: true,
      ...(allocation.length > 1 ? { areas: allocation } : {}),
    }),
  });
  const body = await res.text();
  let out: { ok?: boolean; audit_id?: string; error?: unknown } = {};
  try { out = JSON.parse(body); } catch { /* kept verbatim below */ }
  if (!res.ok || !out?.ok || !out?.audit_id) {
    const why = typeof out?.error === "string" ? out.error : body.slice(0, 200);
    console.error(`[baseline] full measure start failed for lead ${leadId}: ${res.status} ${why}`);
    try {
      await service.from("client_error_reports").insert({
        error_id: "full_measure_start_failed",
        message: why.slice(0, 1000),
        context: { lead_id: leadId, baseline_audit_id: audit.id, http_status: res.status },
      });
    } catch { /* reporting must never mask the original failure */ }
    return { ok: false, error: `create-ai-audit refused: ${why}` };
  }
  console.log(`[baseline] full measure ${out.audit_id} started for lead ${leadId}: ${allocation.map((a) => `${a.town}:${a.questions}`).join(" ")}`);
  return { ok: true, audit_id: out.audit_id };
}

/** Write one client_error_reports row per (error_id, lead) per hour, so a persistent refusal leaves
 *  a readable trail rather than 120 rows an hour at the 30-second tick. */
export async function reportOnceAnHour(service: Client, errorId: string, leadId: string, message: string, context: Record<string, unknown>): Promise<void> {
  try {
    const since = new Date(Date.now() - 60 * 60_000).toISOString();
    const { data: recent } = await service
      .from("client_error_reports").select("id")
      .eq("error_id", errorId).gte("created_at", since)
      .contains("context", { lead_id: leadId }).limit(1);
    if (recent && (recent as unknown[]).length) return;
    await service.from("client_error_reports").insert({ error_id: errorId, message: message.slice(0, 1000), context: { lead_id: leadId, ...context, at: new Date().toISOString() } });
  } catch (e) {
    console.error(`[remeasure] could not record ${errorId}:`, e instanceof Error ? e.message : e);
  }
}

/**
 * THE DAY-28 REPLAY — fire and stamp. Runs every queue tick beside ensureBaselinesForPaidOnboardings.
 *
 * ⛔ IT READS THE STORED DATE AND COMPUTES NOTHING. isRemeasureDue (remeasureDue.ts) has no date
 * arithmetic by test; the DB filter below mirrors it. RG Locksmiths' stored 2026-10-06 is what
 * fires him, never the +28 his baseline would have implied (2026-09-08). SC Plumbing is refunded
 * with a NULL date and must never fire; both the query and the predicate refuse him.
 *
 * ⛔ THE POINTER IS THE IDEMPOTENCY, NOT THIS FUNCTION. At 2,880 ticks a day the read gate
 * (`remeasure_audit_id IS NULL`) is necessary and not sufficient. The claim trigger sets the pointer
 * in the replay audit's own insert transaction, and the partial unique index on
 * ai_audits(lead_id) WHERE audit_purpose = 'remeasure' refuses a second insert at the database.
 * create-ai-audit turns that 23505 into 409 already_remeasured.
 *
 * ⛔ WORK UNFINISHED DOES NOT DELAY IT. The promise is calendar-based; an unticked delivery
 * checklist is STAMPED on the replay (results.remeasure.work_incomplete) so the number tells the
 * truth about our own delivery.
 */
export async function fireDueRemeasures(service: Client, limit = 3): Promise<number> {
  const today = utcDateISO(Date.now());
  const { data, error } = await service
    .from("outreach_leads")
    .select("id, user_id, business_name, baseline_audit_id, remeasure_audit_id, remeasure_due_date, status, is_archived, amount_paid, delivery_checklist")
    .not("baseline_audit_id", "is", null)
    .is("remeasure_audit_id", null)
    .lte("remeasure_due_date", today)
    .eq("is_archived", false)
    .neq("status", "refunded")
    .gt("amount_paid", 0)
    .order("remeasure_due_date", { ascending: true })
    .limit(limit);
  if (error) {
    console.warn("[remeasure] due-replay read skipped:", error.message);
    return 0;
  }
  const rows = (data ?? []) as Array<{
    id: string; user_id: string; business_name: string | null; baseline_audit_id: string | null; remeasure_audit_id: string | null;
    remeasure_due_date: string | null; status: string | null; is_archived: boolean | null; amount_paid: number | null;
    delivery_checklist: Record<string, boolean> | null;
  }>;
  let fired = 0;
  for (const lead of rows) {
    /* Belt and braces: the pure predicate is what the test pins; the query above only narrows. */
    const verdict = isRemeasureDue(lead, today);
    if (!verdict.due) { console.log(`[remeasure] lead ${lead.id}: not due (${verdict.reason}) despite matching the query`); continue; }
    const pointer = lead.baseline_audit_id as string;

    const { data: base } = await service
      .from("ai_audits")
      .select("id, user_id, business_name, business_type, location_text, country, has_website, website, specialism, business_scope, baseline_completed_at")
      .eq("id", pointer).maybeSingle();
    const b = base as {
      id: string; user_id: string; business_name: string | null; business_type: string | null; location_text: string | null;
      country: string | null; has_website: boolean | null; website: string | null; specialism: string | null; business_scope: string | null;
      baseline_completed_at: string | null;
    } | null;
    if (b && !b.baseline_completed_at) {
      await reportOnceAnHour(service, "remeasure_baseline_not_frozen", lead.id, "The day-28 date arrived but the baseline has not finished measuring.", { baseline_audit_id: pointer, due: lead.remeasure_due_date });
      continue;
    }
    let asked: string[] = [];
    if (b) {
      const { data: firstRun } = await service
        .from("ai_audit_runs").select("id").eq("audit_id", pointer)
        .order("run_number", { ascending: true }).limit(1).maybeSingle();
      if (firstRun?.id) {
        const { data: qs } = await service
          .from("ai_audit_queue").select("question").eq("run_id", (firstRun as { id: string }).id).order("created_at", { ascending: true });
        asked = ((qs ?? []) as Array<{ question: string }>).map((r) => (r.question ?? "").trim()).filter(Boolean);
      }
    }
    const plan = planReplay({ pointer, auditExists: !!b, askedQuestions: asked });
    if (!plan.ok) {
      await reportOnceAnHour(service, "remeasure_refused", lead.id, plan.summary, { baseline_audit_id: pointer, reason: plan.reason, due: lead.remeasure_due_date });
      continue;
    }
    const work = workIncompleteFor(lead.delivery_checklist);

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
        user_id: b!.user_id ?? lead.user_id,
        lead_id: lead.id,
        business_name: b!.business_name ?? lead.business_name,
        business_type: b!.business_type,
        location_text: b!.location_text,
        specialisms: b!.specialism ?? "",
        country: b!.country ?? null,
        website: b!.website ?? null,
        has_website: b!.has_website === true,
        ...(b!.business_scope ? { business_scope: b!.business_scope } : {}),
        purpose: "remeasure",
        questions: plan.questions,           // the baseline's ASKED set, verbatim
        question_count: plan.asked,
        skip_seo: true,
        town_confirmed: true,
        remeasure_context: {
          due_date: lead.remeasure_due_date,
          replay: plan.summary,
          asked: plan.asked,
          intended: plan.intended,
          short: plan.short,
          work_incomplete: work.incomplete,
          missing_checklist: work.missing,
          fired_at: new Date().toISOString(),
        },
      }),
    });
    const text = await res.text();
    let out: { ok?: boolean; audit_id?: string; error?: unknown; detail?: unknown } = {};
    try { out = JSON.parse(text); } catch { /* kept verbatim below */ }
    if (!res.ok || !out?.ok || !out?.audit_id) {
      const why = typeof out?.error === "string" ? `${out.error}${out.detail ? ` — ${String(out.detail).slice(0, 200)}` : ""}` : text.slice(0, 200);
      /* already_remeasured is the race resolving correctly, not a failure — logged, not reported. */
      if (typeof out?.error === "string" && out.error === "already_remeasured") {
        console.log(`[remeasure] lead ${lead.id}: replay already exists — another tick won`);
        continue;
      }
      await reportOnceAnHour(service, "remeasure_start_failed", lead.id, why, { baseline_audit_id: pointer, http_status: res.status, due: lead.remeasure_due_date });
      continue;
    }
    fired++;
    console.log(`[remeasure] lead ${lead.id} (${lead.business_name ?? "?"}): day-28 replay ${out.audit_id} started — ${plan.summary}${work.incomplete ? ` — WORK INCOMPLETE: ${work.missing.join(", ")}` : ""}`);
  }
  if (fired) console.log(`[remeasure] fired ${fired} day-28 replay(s)`);
  return fired;
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
      .select("id, lead_id, confirmed_location, services, areas_list")
      .eq("id", onboardingId).maybeSingle();
    if (rErr) return { ok: false, error: `onboarding read failed: ${rErr.message}` };
    if (!row) return { ok: false, error: "onboarding row not found" };
    const leadId = row.lead_id as string | null;
    if (!leadId) return { ok: false, skipped: "no_lead_id" };

    /* Already has one? Nothing to do — this is what makes retries safe.

       🔴 THE COMMENT THAT USED TO BE HERE WAS FALSE, AND IT COST ~£3.70 AND TEN DUPLICATE BASELINES
       ON ONE PAYMENT (2026-09-12). It said "a real paid baseline never has is_measurement" — true
       when it was written, false from the day create-ai-audit widened that flag to every multi-run
       audit. The guard below tested `is_measurement !== true`, the paid baseline marked itself
       `is_measurement`, so this could never see the audit it had just created and the queue backstop
       bought another every tick. It also sent a later session to the wrong answer when asked how to
       identify a baseline, because the comment read as a specification.

       ⛔ THE TEST IS POSITIVE NOW: a baseline is recognised by the marker it CARRIES (its frozen
       contract), not by the absence of a flag that belongs to something else. Both halves of the
       rule live in src/lib/auditKind.ts with create-ai-audit's writer, because two guards in two
       files agreeing only by comment is exactly the shape that failed.

       ⛔ AND AMBIGUITY NOW STOPS THE SPEND INSTEAD OF BUYING ANOTHER. A multi-run audit with no
       contract is either a 3-run FREE CHECK or a baseline whose contract write failed — and those
       are indistinguishable on the row. The old guard resolved that by creating a baseline, which
       is the EXPENSIVE direction and silent with it. It now refuses and says so: a held baseline is
       a line in the operator's error list, which is recoverable; ten baselines is money gone. */
    let existing:
      | Array<{ id: string; baseline_target_runs: number | null; is_measurement?: boolean | null; baseline_contract?: unknown; audit_purpose?: string | null }>
      | null = null;
    let eErr: { message?: string } | null = null;
    /* `audit_purpose` is what tells a free check ('free_check') from a baseline ('baseline') since
       2026-09-13 — read it, so a prospect who took the free check and then paid gets measured
       instead of held. Shed with the other two if the column is not there. */
    ({ data: existing, error: eErr } = await service
      .from("ai_audits").select("id, baseline_target_runs, is_measurement, baseline_contract, audit_purpose").eq("lead_id", leadId));
    if (eErr && /is_measurement|baseline_contract|audit_purpose/i.test(eErr.message ?? "")) {
      /* ⚠️ MIGRATION-TOLERANT, AND IT FAILS CLOSED NOW. Without these columns nothing can tell a
         baseline from a free check, so every multi-run audit reads as ambiguous and the baseline is
         HELD rather than duplicated. The pre-guard behaviour was to create one, which is the
         failure this whole change exists to invert. */
      console.warn("[baseline] kind columns not present yet — every multi-run audit will read as ambiguous");
      ({ data: existing, error: eErr } = await service
        .from("ai_audits").select("id, baseline_target_runs").eq("lead_id", leadId));
    }
    if (eErr) return { ok: false, error: `audit lookup failed: ${eErr.message}` };
    const already = findPaidBaseline(existing);
    if (already) return { ok: true, audit_id: already.id, skipped: "already_has_baseline" };
    const ambiguous = findAmbiguousMultiRun(existing);
    if (ambiguous) {
      /* Recorded, not merely returned: the backstop calls this every tick and its return value is
         only logged. Without a row in client_error_reports this is invisible exactly as the loop
         was — and the CLI has no `functions logs` (§4). Best-effort so a failed report can never
         turn a refusal-to-spend into an error that retries.
         ⛔ ONCE PER LEAD PER HOUR (2026-09-13). It used to insert on every tick — a row every 30
         seconds for as long as the paid row sat there, which is not a report, it is noise that
         buries the next real one. reportOnceAnHour keys on lead_id, so a held lead leaves one line
         an hour: still visible, still recoverable, no longer a flood.
         ⚠️ Since 2026-09-13 a FREE CHECK no longer lands here: it is written as
         audit_purpose = 'free_check' and auditKind ignores it. What still does is a baseline whose
         contract write failed, or a legacy multi-run audit from before the purpose column existed. */
      const detail = `lead ${leadId}: multi-run audit ${ambiguous.id} claims to be a baseline (or predates `
        + `audit_purpose) and has no baseline contract, so NO baseline was started. `
        + `Delete or contract-stamp that audit, or start the baseline by hand.`;
      console.warn(`[baseline] ambiguous multi-run audit — ${detail}`);
      await reportOnceAnHour(service, "baseline_ambiguous_multi_run", leadId, detail,
        { onboarding_id: onboardingId, audit_id: ambiguous.id, source });
      return { ok: true, skipped: `ambiguous_multi_run_audit:${ambiguous.id}` };
    }

    /* ⛔ THE BASELINE WAITS FOR THE ANSWERS IT IS MEASURED ON. This is the guarantee path: week
       eight is compared against this run, so it must be scoped to the town the customer confirmed
       and the services they named — not to whatever can be inferred without them.
       Without this gate the fallbacks below quietly rescue a missing answer: the town precedence is
       confirmed_location || derived_town || search_location, and specialisms become "". That would
       put the wrong-town fault (31 of 44 measurable audits were >10km out) directly on the one
       measurement a refund depends on.
       ⚠️ ok: true, NOT an error. A deferred baseline is the normal state between paying and
       finishing the second questionnaire; returning !ok would file a payment failure on every
       customer. process-ai-audit-queue's ensureBaselinesForPaidOnboardings already re-attempts
       every tick for any paid row whose lead has no baseline, so the moment the answers land the
       baseline starts on its own. Nothing new schedules it.
       ⚠️ AND IT IS CORRECT UNDER THE CURRENT ONE-QUESTIONNAIRE FLOW TOO — there both answers exist
       at payment, so this passes on the first attempt and nothing changes. */
    const q2Missing = missingQuestionnaireFields(row);
    if (q2Missing.length > 0) {
      return {
        ok: true,
        skipped: `awaiting_questionnaire_2 (${q2Missing.map(MISSING_LABEL).join(", ")})`,
      };
    }

    // deno-lint-ignore no-explicit-any
    let lead: any; // eslint-disable-line
    // deno-lint-ignore no-explicit-any
    let lErr: any;
    ({ data: lead, error: lErr } = await service
      .from("outreach_leads")
      .select("id, user_id, business_name, category, search_keyword, country, website, search_location, derived_town, status")
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
        .select("id, user_id, business_name, category, search_keyword, country, website, search_location, status")
        .eq("id", leadId).maybeSingle();
      lead = retry.data;
      lErr = retry.error;
    }
    if (lErr) return { ok: false, error: `lead read failed: ${lErr.message}` };
    if (!lead) return { ok: false, error: "lead not found" };

    /* ⛔ A REFUNDED CLIENT NEVER GETS ANOTHER BASELINE, AND THIS IS THE ONLY PLACE THAT CAN SAY SO
       FOR EVERY CALLER (2026-09-13). The refund leaves `onboarding_responses.status = 'paid'` alone
       deliberately — it is the record of what they bought — and
       `ensureBaselinesForPaidOnboardings` selects exactly that, every 30-second tick, with no idea
       what the LEAD's status is. What stopped it buying a fresh audit for someone just refunded was
       nothing but the pointer already existing: clear a wrong pointer, or delete the audit
       (ON DELETE SET NULL does it for you), and the backstop would have started paying again.
       ⛔ THE CHECK BELONGS HERE, NOT IN THE BACKSTOP. There are TWO callers — the backstop and the
       Stripe webhook — so guarding the one where the fault was noticed is the
       guard-written-as-today's-instance mistake this file records four times over. Put at the
       property and every future caller inherits it.
       ⚠️ POSITIVE TEST ON THE REFUNDED STATUS, never `!== 'paid'`: a paying client legitimately
       moves through payment_received, in_delivery and completed, and a negative test would refuse
       the baseline for all of them. Absence and an unknown status both pass, which is the safe
       direction here — the money has already been taken. */
    if (String(lead.status ?? "") === REFUNDED_STATUS) {
      return { ok: true, skipped: "lead_refunded" };
    }

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

    /* ── HOME TOWN ONLY, GENERATED FRESH (Paul, 2026-09-12) ─────────────────────────────────────
       The baseline is BASELINE_QUESTIONS questions about the town the client trades from, and
       nothing else. It is the refund's measuring stick, frozen and replayed verbatim at day 28.
       ⛔ NOT SEEDED from the outreach hook: the hook is throwaway and never compared, so carrying
       its questions forward tied the judged set to a 3-question prospecting audit.
       ⛔ NOT SPREAD ACROSS THE PICKED TOWNS: at two questions a town the extras diluted the refund
       set with the questions the client was least likely to win. The towns are recorded on the
       contract and measured by the FULL MEASURE that starts the moment this baseline freezes
       (onBaselineFrozen), where winnability decides which towns get pages. */
    const rawAreas = Array.isArray((row as { areas_list?: unknown }).areas_list)
      ? ((row as { areas_list: unknown[] }).areas_list.filter((a): a is string => typeof a === "string"))
      : [];

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
        // No `areas`, no `questions`: single town, generated fresh. See the block above.
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
    /* ── FREEZE THE CONTRACT (v2) ──────────────────────────────────────────────────────────────
       Written ONCE, immediately after the audit exists. Since 2026-09-12 the document records
       intent and provenance, not the refund test: the judged set is the ASKED set on this audit's
       first run, read through outreach_leads.baseline_audit_id (baselineReplay.ts), never a field
       here. What v2 protects is the record of WHAT WAS DECIDED — home town only, these areas
       deferred to the full measure, these money questions flagged — so a later reader is not left
       guessing why a client with four towns has a one-town baseline.
       Best-effort and migration-tolerant: if baseline_contract cannot be written the baseline
       still runs exactly the same. */
    try {
      const queued = await service
        .from("ai_audit_queue").select("question")
        .eq("audit_id", out.audit_id).order("created_at", { ascending: true });
      const askedAll = ((queued.data ?? []) as Array<{ question: string }>)
        .map((q) => (q.question ?? "").trim()).filter(Boolean);
      const askedKeys = new Map(askedAll.map((q) => [q.trim().toLowerCase(), q]));
      /* THE MONEY QUESTIONS, intersected with what was actually queued so the list can never name
         a question the guards rejected. Recorded so the before/after can be computed on all
         questions OR standard-only — a choice deliberately NOT made here. */
      const moneyAsked = Array.isArray((out as { money_questions?: unknown }).money_questions)
        ? ((out as { money_questions: unknown[] }).money_questions
            .map((q) => (typeof q === "string" ? askedKeys.get(q.trim().toLowerCase()) : undefined))
            .filter((q): q is string => !!q))
        : [];
      const contract: BaselineContract = {
        version: 2,
        mainTown: locationText,
        areasRequested: rawAreas,
        allocation: [{ town: locationText, questions: BASELINE_QUESTIONS, isMain: true }],
        areasDropped: rawAreas,
        areasMeasuredInFullMeasure: rawAreas,
        ceiling: BASELINE_QUESTIONS,
        ...(moneyAsked.length ? { moneyQuestions: moneyAsked } : {}),
        createdAt: new Date().toISOString(),
      };
      const { error: cErr } = await service.from("ai_audits")
        .update({ baseline_contract: contract }).eq("id", out.audit_id);
      if (cErr) console.warn(`[baseline] baseline_contract not stored (${cErr.message}) — baseline unaffected`);
      else console.log(`[baseline] contract v2 frozen for audit ${out.audit_id}: "${locationText}" x ${BASELINE_QUESTIONS}, ${rawAreas.length} area(s) deferred to the full measure, ${moneyAsked.length} money question(s) flagged`);
    } catch (e) {
      console.warn(`[baseline] contract write threw (non-blocking):`, e instanceof Error ? e.message : e);
    }

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
