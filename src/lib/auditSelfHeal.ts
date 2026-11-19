/* ════════════════════════════════════════════════════════════════════════════════════════════════
   AUDITS HEAL THEMSELVES (Paul, 2026-11-19, v1-audits-self-healing).

   The case: 19 Nov, 7 audits came back "Audit incomplete" (Gemini's runs refused while the Apify plan was full) and
   stayed that way until someone pressed Run again. The one automatic retry before this (v1-quickcheck-retry, 16 Nov) only
   covered a Quick check whose EVERY ask failed — an audit that came back with ChatGPT but not Gemini was never retried.

   The rule:
     • An ordinary audit (purpose "audit", one run, 1–12 asks, not a baseline / measurement / market) that finished
       INCOMPLETE because the AI search did not answer (a provider failure, never a budget refusal) is re-run
       automatically: HEAL_DELAYS_MS after it settled — 30 minutes, then 2 hours, then 6 hours.
     • Only the MISSING answers are asked again: an ask that failed outright is asked again; an ask that came back with
       ChatGPT but not Gemini asks Gemini alone, and the ChatGPT answer already in hand is kept untouched.
     • Same audit, same run: it is never charged to the rep again (no new audit, no allowance, no per-lead limit) and the
       re-run's Apify cost books to the audit's own budget pool like any start. It never sends anything: a healed run
       arms no auto-send, free-check result or pitch (the operator sees the updated report).
     • After the third re-run it gives up and says so in plain words (giveUpReason), stored on the run.
     • Not when the rep already pressed Run again (a newer audit on the lead), never for a failure older than
       HEAL_GRACE_MS past its due time, and never twice for the same round (the run's self_heal stamp is the claim).
     • A round already done by the old one-retry (results.late_retry) counts as round 1.

   Pure. Reached by edge functions: relative imports with .ts.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { isIncomplete, unmeasuredAnswers, type AlertRow } from './auditAlerts.ts';

/** Wait before each re-run, measured from when the audit last settled. */
export const HEAL_DELAYS_MS: readonly number[] = [30 * 60_000, 2 * 60 * 60_000, 6 * 60 * 60_000];
export const HEAL_ROUNDS = HEAL_DELAYS_MS.length;
/** A round more than this late (the sweep was down) is not started: no resurrecting yesterday's audit. */
export const HEAL_GRACE_MS = 12 * 60 * 60_000;
/** Most audits re-opened per sweep. */
export const HEAL_PER_SWEEP = 10;
/** Asks in an audit the heal covers. */
export const HEAL_MAX_ASKS = 12;
/** ai_audit_runs.results key: { rounds: [{ at, round, missing }], gave_up?: { at, reason } }. */
export const HEAL_META_KEY = 'self_heal';
/** ai_audit_queue.result key on an ask being healed: the result already in hand (its answered engines are kept). */
export const HEAL_BASE_KEY = '_heal_base';
/** Marker on a healed ask's result: which round, what was asked again, what came back. */
export const HEAL_ROW_KEY = '_heal';

export const SCORED_ENGINES = ['chatgpt', 'gemini'] as const;
export type ScoredEngine = typeof SCORED_ENGINES[number];

/** Row errors that mean "the provider did not answer" (process-ai-audit-queue's own words for it). */
export const PROVIDER_FAILURE_ERRORS: ReadonlySet<string> = new Set([
  'run_age_exceeded', 'apify_TIMED-OUT', 'apify_FAILED', 'apify_ABORTED', 'stuck_running_reclaimed', 'deadline_exceeded', 'no_items',
  'start_failed', 'waiting_for_slot',
]);

export interface HealAudit { audit_purpose: string | null; baseline_target_runs: number | null; is_market?: boolean | null; is_measurement?: boolean | null }
export interface HealRun { status: string | null; results?: Record<string, unknown> | null }
export interface HealRow { id?: string; status: string; result: Record<string, unknown> | null; updated_at?: string | null }

export interface HealStamp { rounds: { at: string; round: number; missing: string[] }[]; gave_up?: { at: string; reason: string } }

const ENGINE_WORDS: Record<string, string> = { chatgpt: 'ChatGPT', gemini: 'Gemini' };

/** An ordinary audit: purpose "audit", one run, 1–12 asks. */
export function isHealable(audit: HealAudit, runCount: number, askCount: number): boolean {
  return audit.audit_purpose === 'audit' && audit.baseline_target_runs == null && audit.is_market !== true && audit.is_measurement !== true
    && runCount === 1 && askCount >= 1 && askCount <= HEAL_MAX_ASKS;
}

/** An engine cell with answer text in it. */
export function hasAnswer(cell: unknown): boolean {
  if (!cell || typeof cell !== 'object') return false;
  const c = cell as { answer_text?: unknown; error?: unknown };
  return typeof c.answer_text === 'string' && c.answer_text.trim().length > 0 && !c.error;
}

/** What an ask is missing: the scored engines to ask again, "blocked" (failed for a budget / refusal — never healed), or
 *  [] (nothing missing). */
export function rowMissing(row: HealRow): ScoredEngine[] | 'blocked' {
  if (row.status === 'failed') {
    const err = String((row.result ?? {}).error ?? '').trim();
    return PROVIDER_FAILURE_ERRORS.has(err) ? [...SCORED_ENGINES] : 'blocked';
  }
  if (row.status !== 'done') return [];
  const r = row.result ?? {};
  return SCORED_ENGINES.filter((e) => !hasAnswer((r as Record<string, unknown>)[e]));
}

export function healStamp(run: HealRun): HealStamp {
  const s = ((run.results ?? {}) as Record<string, unknown>)[HEAL_META_KEY];
  if (s && typeof s === 'object' && Array.isArray((s as HealStamp).rounds)) return s as HealStamp;
  return { rounds: [] };
}

/** Rounds already run (the old one-retry stamp counts as round 1). */
export function healRoundsDone(run: HealRun): number {
  const n = healStamp(run).rounds.length;
  if (n) return n;
  const lr = ((run.results ?? {}) as Record<string, unknown>).late_retry;
  return lr && typeof lr === 'object' ? 1 : 0;
}

/** A run that has been re-opened by the heal (or the old one-retry): its finalising sends nothing. */
export function isHealRun(results: Record<string, unknown> | null | undefined): boolean {
  return healRoundsDone({ status: null, results: results ?? null }) > 0;
}

/** When the run's last ask settled. null = unknown. */
export function settledAt(rows: HealRow[]): number | null {
  const t = rows.map((r) => Date.parse(String(r.updated_at ?? ''))).filter(Number.isFinite);
  return t.length ? Math.max(...t) : null;
}

export type HealVerdict =
  | { kind: 'retry_now'; round: number }
  | { kind: 'retry_later'; atMs: number; round: number }
  | { kind: 'final'; why: 'not_quick' | 'not_settled' | 'not_provider' | 'nothing_missing' | 'not_incomplete' | 'newer_audit' | 'too_old' | 'gave_up' | 'give_up_now' };

/** The one decision: the sweep (retry_now; give_up_now writes the reason), the incomplete alert (held while a re-run is
 *  coming) and the public link (waiting vs failed). */
export function healVerdict(o: { audit: HealAudit; runs: HealRun[]; rows: HealRow[]; newerAudit: boolean; nowMs: number }): HealVerdict {
  if (!isHealable(o.audit, o.runs.length, o.rows.length)) return { kind: 'final', why: 'not_quick' };
  const run = o.runs[0];
  if (run.status !== 'failed' && run.status !== 'complete') return { kind: 'final', why: 'not_settled' };
  if (healStamp(run).gave_up) return { kind: 'final', why: 'gave_up' };
  if (o.rows.some((r) => r.status !== 'done' && r.status !== 'failed')) return { kind: 'final', why: 'not_settled' };
  const missing = o.rows.map(rowMissing);
  const toAsk = missing.filter((m): m is ScoredEngine[] => Array.isArray(m) && m.length > 0);
  if (!toAsk.length) return { kind: 'final', why: missing.includes('blocked') ? 'not_provider' : 'nothing_missing' };
  if (!isIncomplete(unmeasuredAnswers(o.rows as AlertRow[]))) return { kind: 'final', why: 'not_incomplete' };
  if (o.newerAudit) return { kind: 'final', why: 'newer_audit' };
  const done = healRoundsDone(run);
  if (done >= HEAL_ROUNDS) return { kind: 'final', why: 'give_up_now' };
  const at = settledAt(o.rows);
  if (at == null) return { kind: 'final', why: 'too_old' };
  const due = at + HEAL_DELAYS_MS[done];
  if (o.nowMs > due + HEAL_GRACE_MS) return { kind: 'final', why: 'too_old' };
  return o.nowMs >= due ? { kind: 'retry_now', round: done + 1 } : { kind: 'retry_later', atMs: due, round: done + 1 };
}

/** The engines still missing across an audit's asks, in words. */
export function missingEngines(rows: HealRow[]): ScoredEngine[] {
  const out = new Set<ScoredEngine>();
  for (const r of rows) { const m = rowMissing(r); if (Array.isArray(m)) m.forEach((e) => out.add(e)); }
  return SCORED_ENGINES.filter((e) => out.has(e));
}

function listWords(xs: string[]): string {
  return xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

/** The plain reason stored when the heal gives up. */
export function giveUpReason(engines: string[]): string {
  const who = listWords(engines.map((e) => ENGINE_WORDS[e] ?? e)) || 'The AI search';
  return `${who} didn't answer after ${HEAL_ROUNDS} automatic re-runs (30 minutes, 2 hours and 6 hours later). Run the audit again later.`;
}

/** One line for the lead workspace while a re-run is coming or after the heal gave up. null = nothing to say. */
export function healLine(v: HealVerdict, stamp: HealStamp, fmtTime: (ms: number) => string): string | null {
  if (stamp.gave_up) return stamp.gave_up.reason;
  if (v.kind === 'retry_later') return `Re-running the missing answers automatically at ${fmtTime(v.atMs)} (try ${v.round} of ${HEAL_ROUNDS}).`;
  if (v.kind === 'retry_now') return `Re-running the missing answers automatically now (try ${v.round} of ${HEAL_ROUNDS}).`;
  return null;
}

/** A result without its bulky / per-try meta keys: what a healed ask keeps as its base. */
function baseOf(result: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(result)) {
    if (k === '_lanes' || k === '_apify' || k === '_cycle_started_at' || k === HEAL_BASE_KEY) continue;
    out[k] = v;
  }
  return out;
}

/** The writes that re-open a run for a heal round. Rows: an ask that failed outright → pending with one start left; an
 *  ask that came back partial → running with ONLY its missing engines as pending lanes (the answered ones kept, done)
 *  and its result kept as the base. Asks with nothing missing are untouched. */
export function healReopenPlan(run: HealRun, rows: HealRow[], round: number, nowIso: string, maxAttempts: number) {
  const prev = { ...((run.results ?? {}) as Record<string, unknown>) };
  delete prev.error;
  /* The firm reading must read the new answers: dropped, so the finaliser invokes it again. */
  delete prev.competitor_cleaning;
  const hook = prev.hook;
  if (hook && typeof hook === 'object' && (hook as Record<string, unknown>).stop_reason === 'provider_failure') {
    const h = { ...(hook as Record<string, unknown>) };
    delete h.stop_reason;
    prev.hook = h;
  }
  const stamp = healStamp(run);
  const missingAll = missingEngines(rows);
  const rowPatches: { id: string; from: string; patch: Record<string, unknown> }[] = [];
  for (const r of rows) {
    const m = rowMissing(r);
    if (!r.id || !Array.isArray(m) || !m.length) continue;
    if (r.status === 'failed') {
      rowPatches.push({ id: r.id, from: 'failed', patch: { status: 'pending', attempts: Math.max(0, maxAttempts - 1), result: null } });
      continue;
    }
    const base = baseOf(r.result ?? {});
    const lanes: Record<string, unknown> = {};
    for (const e of SCORED_ENGINES) lanes[e] = m.includes(e) ? { state: 'pending', tries: 0 } : { state: 'done', tries: 0, item: null, kept: true };
    rowPatches.push({
      id: r.id, from: 'done',
      patch: {
        status: 'running', attempts: 1,
        result: { _lanes: lanes, [HEAL_BASE_KEY]: base, _failures: Array.isArray(base._failures) ? base._failures : [], _cycle_started_at: nowIso, [HEAL_ROW_KEY]: { round, asked: m } },
      },
    });
  }
  return {
    run: {
      status: 'running',
      results: { ...prev, [HEAL_META_KEY]: { ...stamp, rounds: [...stamp.rounds, { at: nowIso, round, missing: missingAll }] } },
    },
    rows: rowPatches,
  };
}

/** The stamp written when the heal gives up. */
export function giveUpPatch(run: HealRun, rows: HealRow[], nowIso: string) {
  const stamp = healStamp(run);
  return { ...((run.results ?? {}) as Record<string, unknown>), [HEAL_META_KEY]: { ...stamp, gave_up: { at: nowIso, reason: giveUpReason(missingEngines(rows)) } } };
}

/** A healed ask's final result: the base, with each re-asked engine's new cell where it came back. The base's other
 *  engines and meta are untouched; `_missing_engines` is what is still missing. */
export function healMerge(base: Record<string, unknown>, fresh: Record<string, unknown> | null, asked: string[], round: number): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  const healed: string[] = [];
  for (const e of asked) {
    if (fresh && hasAnswer(fresh[e])) { out[e] = fresh[e]; healed.push(e); }
  }
  const prevMissing = Array.isArray(base._missing_engines) ? (base._missing_engines as string[]) : [];
  const still = [...new Set([...prevMissing, ...asked])]
    .filter((e) => ((SCORED_ENGINES as readonly string[]).includes(e) ? !hasAnswer(out[e]) : true));
  if (still.length) out._missing_engines = still; else delete out._missing_engines;
  out[HEAL_ROW_KEY] = { round, asked, healed };
  return out;
}
