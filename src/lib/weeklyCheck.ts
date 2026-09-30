/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE WEEKLY VISIBILITY CHECK (Admin control centre, release 4, 2026-09-30).
   Paul's decisions (not to be re-asked):
   - A light, fresh check ONCE A WEEK for each PAID client, to show whether visibility seems to be
     moving. ⛔ COMPLETELY SEPARATE from the official baseline, the guarantee and the official four-week
     re-measurement: its own audit purpose ('weekly_check', auditKind.ts), its own tables, never read by
     any guarantee code, never shown to the client.
   - START: Build → once the NEW SITE IS LIVE. Optimise → once the first REAL website / evidence changes
     are live (a delivery milestone ticked, or an opportunity marked implemented). NOT because the
     baseline froze.
   - A SMALL STABLE SET: chosen ONCE, then FROZEN, so week-to-week comparisons mean something. Never a
     different, easier set each week.
   - COST: ~$0.12 per client per week; hard caps WEEKLY_CLIENT_CAP_USD per client per week and
     WEEKLY_TOTAL_CAP_USD across everyone per week.
   METHOD (chosen, recorded in docs/admin-control-centre.md): WEEKLY_CHECK_QUESTIONS questions — the
   Hook Audit's own questions first (the journey reads hook → baseline → today), then the official
   baseline's asked set in its approved order — × ChatGPT + Gemini × ONE run. One run is noisy, so the
   trend word only moves when an engine changes by WEEKLY_MOVE_MIN questions or more; anything smaller is
   "flat (within week-to-week noise)". No score.
   Pure and edge-safe.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { engineTallies } from './discoveryOpportunity.ts';
import type { QueueRow } from './auditReport.ts';
import { londonDay, mondayOf } from './reportingPeriod.ts';

export const WEEKLY_CHECK_QUESTIONS = 10;
export const WEEKLY_CHECK_HOOK_MAX = 3;
/** Fewer questions than this is not worth monitoring — the set is refused, not padded. */
export const WEEKLY_CHECK_MIN_QUESTIONS = 5;
/** The ESTIMATE used for the caps: the observed billed cost per question per run incl. Apify's
 *  corrections (baseline-discovery.ts DISCOVERY_USD_PER_QUESTION_RUN, 2026-09-28). The actual cost is
 *  read back from ai_audit_runs.actor_cost_usd after the run. */
export const WEEKLY_USD_PER_QUESTION = 0.014;
export const WEEKLY_CLIENT_CAP_USD = 0.25;
export const WEEKLY_TOTAL_CAP_USD = 2.0;
/** Questions an engine must gain or lose before the trend word moves (one run is noisy). */
export const WEEKLY_MOVE_MIN = 2;
export const WEEKLY_ENGINES = ['chatgpt', 'gemini'] as const;
export type WeeklyEngine = typeof WEEKLY_ENGINES[number];

/** The London Monday (YYYY-MM-DD) of the week an instant falls in — one check per client per week. */
export const weekOf = (ms: number): string => mondayOf(londonDay(ms));

/** Choose the frozen set. Deterministic: the same inputs always give the same set. Null when there
 *  are not enough real questions (never padded with invented ones). */
export function chooseWeeklySet(hook: readonly string[], baseline: readonly string[]): { questions: string[]; fromHook: number; fromBaseline: number } | null {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (q: string) => { const t = q.trim(); const k = t.toLowerCase(); if (!t || seen.has(k) || out.length >= WEEKLY_CHECK_QUESTIONS) return false; seen.add(k); out.push(t); return true; };
  let fromHook = 0, fromBaseline = 0;
  for (const q of hook.slice(0, WEEKLY_CHECK_HOOK_MAX)) if (add(q)) fromHook += 1;
  for (const q of baseline) if (add(q)) fromBaseline += 1;
  return out.length >= WEEKLY_CHECK_MIN_QUESTIONS ? { questions: out, fromHook, fromBaseline } : null;
}

/** The delivery milestones that count as "improvements live" (remeasureFill.ts WORK_MILESTONES). */
export const LIVE_MILESTONES = ['directories', 'pages', 'gbp', 'website'] as const;

export interface StartInput {
  route: 'build' | 'optimise' | null;
  websiteBuild: { production_url?: string | null; production_status?: string | null; qa?: { production_checked?: boolean | null } | null } | null;
  checklist: Record<string, unknown> | null;
  implementedOpportunities: number;
}
export interface StartDecision { ok: boolean; reason: string }

/** May the weekly check start for this client? ⛔ Positive tests only — absent means "not yet". */
export function weeklyStart(i: StartInput): StartDecision {
  if (i.route === 'build') {
    const live = !!i.websiteBuild?.production_url && (i.websiteBuild?.qa?.production_checked === true || i.websiteBuild?.production_status === 'verified');
    return live ? { ok: true, reason: 'The new site is live' } : { ok: false, reason: 'Waiting for the new site to go live' };
  }
  // Optimise — and a client with no route on record (legacy), who keeps their own site.
  const ticked = LIVE_MILESTONES.filter((k) => i.checklist?.[k] === true);
  if (ticked.length || i.implementedOpportunities > 0) {
    const parts = [...ticked.map((k) => (k === 'gbp' ? 'Google profile' : k)), ...(i.implementedOpportunities ? [`${i.implementedOpportunities} improvement${i.implementedOpportunities === 1 ? '' : 's'} implemented`] : [])];
    return { ok: true, reason: `First improvements live: ${parts.join(', ')}` };
  }
  return { ok: false, reason: 'Waiting for the first improvements to be marked live' };
}

export interface WeekSummary {
  week: string;
  questions: number;
  named: Record<WeeklyEngine, number>;
  answered: Record<WeeklyEngine, number>;
  perQuestion: { question: string; named: Record<WeeklyEngine, boolean | null> }[];
  /** Rival names the engines gave most often this week (internal only — never on a client surface). */
  competitors: { name: string; count: number }[];
}

/** Fold one week's answers. `rows` are the weekly audit's queue rows. */
export function summariseWeek(week: string, questions: readonly string[], rows: QueueRow[], biz: { name: string; location: string; trade?: string }): WeekSummary {
  const done = rows.filter((r) => r.status === 'done' && r.result && typeof r.result === 'object');
  const named = { chatgpt: 0, gemini: 0 }; const answered = { chatgpt: 0, gemini: 0 };
  const perQuestion = questions.map((q) => {
    const t = engineTallies(q, done, { businessName: biz.name, location: biz.location, trade: biz.trade });
    const cell: Record<WeeklyEngine, boolean | null> = { chatgpt: null, gemini: null };
    for (const e of WEEKLY_ENGINES) {
      const x = t.find((y) => y.engine === e);
      if (!x || x.complete === 0) continue;
      answered[e] += 1;
      cell[e] = x.named > 0;
      if (x.named > 0) named[e] += 1;
    }
    return { question: q, named: cell };
  });
  const comp = new Map<string, number>();
  for (const r of done) for (const e of WEEKLY_ENGINES) {
    const list = ((r.result as Record<string, { competitors?: unknown }>)[e]?.competitors);
    if (!Array.isArray(list)) continue;
    for (const c of list) { const n = String(typeof c === 'string' ? c : (c as { name?: unknown })?.name ?? '').trim(); if (n) comp.set(n, (comp.get(n) ?? 0) + 1); }
  }
  return { week, questions: questions.length, named, answered, perQuestion, competitors: [...comp].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5) };
}

export type WeeklyTrend = 'first_week' | 'improving' | 'slipping' | 'flat' | 'mixed';
export interface WeekComparison {
  trend: WeeklyTrend;
  delta: Record<WeeklyEngine, number | null>;
  nowNamed: string[];
  noLongerNamed: string[];
  stillAbsent: string[];
}

/** This week against last week, on the SAME frozen questions. No score: a word, the deltas, and which
 *  questions moved. The word moves only on a change of WEEKLY_MOVE_MIN or more on an engine. */
export function compareWeeks(thisWeek: WeekSummary, lastWeek: WeekSummary | null): WeekComparison {
  const anyNamed = (n: Record<WeeklyEngine, boolean | null>) => WEEKLY_ENGINES.some((e) => n[e] === true);
  const stillAbsent = thisWeek.perQuestion.filter((q) => !anyNamed(q.named) && WEEKLY_ENGINES.some((e) => q.named[e] === false)).map((q) => q.question);
  if (!lastWeek) return { trend: 'first_week', delta: { chatgpt: null, gemini: null }, nowNamed: [], noLongerNamed: [], stillAbsent };
  const before = new Map(lastWeek.perQuestion.map((q) => [q.question.toLowerCase(), q.named]));
  const nowNamed: string[] = []; const noLongerNamed: string[] = [];
  for (const q of thisWeek.perQuestion) {
    const b = before.get(q.question.toLowerCase());
    if (!b) continue;
    if (anyNamed(q.named) && !anyNamed(b)) nowNamed.push(q.question);
    if (!anyNamed(q.named) && anyNamed(b)) noLongerNamed.push(q.question);
  }
  const delta = { chatgpt: thisWeek.named.chatgpt - lastWeek.named.chatgpt, gemini: thisWeek.named.gemini - lastWeek.named.gemini };
  const up = WEEKLY_ENGINES.some((e) => delta[e] >= WEEKLY_MOVE_MIN);
  const down = WEEKLY_ENGINES.some((e) => delta[e] <= -WEEKLY_MOVE_MIN);
  const trend: WeeklyTrend = up && down ? 'mixed' : up ? 'improving' : down ? 'slipping' : 'flat';
  return { trend, delta, nowNamed, noLongerNamed, stillAbsent };
}

export const WEEKLY_TREND_LABEL: Record<WeeklyTrend, string> = {
  first_week: 'First week — nothing to compare yet',
  improving: '↑ improving',
  slipping: '↓ slipping',
  flat: 'flat (within week-to-week noise)',
  mixed: 'mixed — one engine up, one down',
};

/** Can this week's check be afforded? Estimates only; ⛔ an unknown spend is "no". */
export function weeklyAffordable(questions: number, spentThisWeekUsd: number | null): { ok: boolean; estimateUsd: number; reason: string | null } {
  const estimateUsd = Math.round(questions * WEEKLY_USD_PER_QUESTION * 1000) / 1000;
  if (spentThisWeekUsd === null || !Number.isFinite(spentThisWeekUsd)) return { ok: false, estimateUsd, reason: "This week's spend could not be read" };
  if (estimateUsd > WEEKLY_CLIENT_CAP_USD) return { ok: false, estimateUsd, reason: `Estimate $${estimateUsd.toFixed(2)} is over the $${WEEKLY_CLIENT_CAP_USD.toFixed(2)} per-client cap` };
  if (spentThisWeekUsd + estimateUsd > WEEKLY_TOTAL_CAP_USD) return { ok: false, estimateUsd, reason: `The $${WEEKLY_TOTAL_CAP_USD.toFixed(2)} weekly cap would be passed` };
  return { ok: true, estimateUsd, reason: null };
}
