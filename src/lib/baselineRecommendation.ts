/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE RECOMMENDED OFFICIAL BASELINE (Paul, 2026-09-30, docs/baseline-workflow.md).

   The official paid baseline is FIXED: BASELINE_QUESTIONS approved questions × BASELINE_RUNS runs ×
   ChatGPT + Gemini, frozen, replayed word for word at re-measure. This module only RECOMMENDS which
   20 — Paul reviews, edits and approves; nothing here freezes anything.

     official 20 = the Hook Audit's own questions (up to 3, LOCKED IN, verbatim)
                 + the rest chosen from Discovery

   HOW THE REST ARE CHOSEN
     1. Every Discovery question gets a verdict first:
          NOT RECOMMENDED — names none of the approved towns; the business is already named in
                            every answer on both engines (nothing can go up); or AI names no local
                            business at all (no local race — it cannot show local visibility).
          otherwise eligible.
     2. The eligible questions go through buildBalancedBaseline (baselineMix.ts) with the Hook
        questions locked in first: intent mix, service rotation, town rotation, no near-duplicates.
        ⛔ BALANCE DECIDES. The opportunity is only a TIE-BREAK between candidates that balance the
        set equally — questions where the business is not yet named go first. That is "favour
        opportunities" without "the 20 easiest questions": a rank cannot outvote the spread.
     3. Eligible but not chosen = KEEP AS FUTURE OPPORTUNITY (with why), and at approval it goes to
        the Opportunity Backlog (client_opportunities), which the guarantee never reads.

   ⛔ NOTHING IS INVENTED. Towns are the approved towns, services the approved services, questions
   only ever the Hook Audit's or the Discovery pool's (or Paul's own typing, in review).

   Pure and deterministic. IMPORTED BY AN EDGE FUNCTION (paid-baseline): relative .ts imports only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { buildBalancedBaseline, classifyQuestion, INTENT_LABELS, normTown, sameIntent, type IntentType, type MixContext } from './baselineMix.ts';
import type { EngineTally } from './discoveryOpportunity.ts';
import { describeScope, inScope, questionScope, type ServiceScope } from './serviceScope.ts';
import { MAX_QUESTIONS_PER_SERVICE } from './baselineQuality.ts';

/* ══ 2026-10-04 (fix/04-ai-measurement, Session C C-03 / C-04) ═══════════════════════════════════════
   · BUSINESS TRUTH FIRST: with a `scope` (serviceScope.ts), a question about a service the client does
     not offer or never confirmed is NOT RECOMMENDED, and never goes to the backlog.
   · THE CORE QUESTIONS ARE MANDATORY: `core` (customerQuestion.coreQuestions) is admitted right after
     the Hook Audit's questions, so the 20 always asks the plain "a good <trade> in <home town>".
   · ONE SERVICE CANNOT BE A GRID: at most MAX_QUESTIONS_PER_SERVICE per service in the balanced fill.
   · "Core" is said only of a genuinely core question — an unmatched service is no longer explained
     to Paul as "core locksmiths query in Faversham". */

export type RecVerdict = 'recommended' | 'future' | 'not_recommended';
export const REC_LABELS: Record<RecVerdict, string> = {
  recommended: 'Recommended for baseline',
  future: 'Keep as future opportunity',
  not_recommended: 'Not recommended',
};
export type QuestionSource = 'hook' | 'core' | 'discovery' | 'manual';
export const SOURCE_LABELS: Record<QuestionSource, string> = { hook: 'Hook Audit', core: 'Core question', discovery: 'Discovery', manual: 'Added by hand' };

const ENGINE_NAME: Record<string, string> = { chatgpt: 'ChatGPT', gemini: 'Gemini' };

/** A Discovery (or Hook) question with what its measurement found, when it has been measured. */
export interface RecInput {
  question: string;
  /** Per-engine answers received / answers naming the business. Absent = not measured. */
  engines?: EngineTally[] | null;
  /** The classifier's verdict (discoveryOpportunity.ts): named / open / contested / locked / no-local-race. */
  verdict?: string | null;
}

export interface RecRow {
  question: string; source: QuestionSource; town: string | null; service: string | null; intent: IntentType;
  reason: string; engines: EngineTally[] | null;
}
export interface PoolRec {
  question: string; verdict: RecVerdict; reason: string; town: string | null; service: string | null; intent: IntentType;
  engines: EngineTally[] | null;
}
export interface RecSummary {
  total: number; target: number; fromHook: number; fromCore: number; fromDiscovery: number; manual: number;
  intents: Record<IntentType, number>;
  services: { covered: number; total: number };
  towns: { covered: number; total: number; home: number };
  opportunity: { absent: number; partial: number; named: number; unmeasured: number };
  /** Plain-English lines computed from the actual 20 — never hardcoded text. */
  why: string[];
}
export interface Recommendation {
  questions: RecRow[];
  pool: PoolRec[];
  hook: string[];
  summary: RecSummary;
  /** How many short of the target the pool left us (0 when full). */
  short: number;
}

/* ── the measurement words (Paul, 2026-09-30: "3/3" alone must never read as success) ──────────── */

const measured = (e: EngineTally[] | null | undefined) => !!e && e.some((x) => x.complete > 0);
/** Named in every answer, on every engine that answered, with both engines answered. */
export const consistentlyNamed = (e: EngineTally[] | null | undefined) =>
  !!e && e.filter((x) => x.complete > 0).length >= 2 && e.every((x) => x.complete > 0 && x.named === x.complete);
/** Answered, and named in none of the answers. */
export const absentEverywhere = (e: EngineTally[] | null | undefined) => measured(e) && e!.every((x) => x.named === 0);

/** "ChatGPT 3/3 complete · Gemini 2/3 complete" — how many answers came back. Never a naming. */
export function measurementsLine(e: EngineTally[] | null | undefined, target: number): string {
  if (!e?.length) return 'Not measured yet';
  return e.map((x) => `${ENGINE_NAME[x.engine] ?? x.engine} ${x.complete}/${target} complete`).join(' · ');
}
/** "ChatGPT 0/3 · Gemini 1/3" — of the answers that came back, how many named the business. */
export function namedLine(e: EngineTally[] | null | undefined): string {
  if (!measured(e)) return '—';
  return e!.map((x) => `${ENGINE_NAME[x.engine] ?? x.engine} ${x.named}/${x.complete}`).join(' · ');
}

const norm = (q: string) => q.trim().replace(/\s+/g, ' ').toLowerCase();

/** Tie-break only (see header): not named anywhere → 0; partly named or unmeasured → 1; else 2. */
function opportunityRank(i: RecInput | undefined): number {
  if (!i || !measured(i.engines)) return 1;
  if (absentEverywhere(i.engines)) return 0;
  return consistentlyNamed(i.engines) ? 2 : 1;
}

function visibilityPhrase(i: RecInput | undefined): string {
  if (!i || !measured(i.engines)) return 'not measured yet';
  if (absentEverywhere(i.engines)) return `business not named in any answer (${namedLine(i.engines)})`;
  if (consistentlyNamed(i.engines)) return `already named in every answer (${namedLine(i.engines)})`;
  return `named in some answers (${namedLine(i.engines)}) — room to grow`;
}

function subjectPhrase(m: { town: string | null; service: string | null; intent: IntentType }, trade: string, q?: string, scope?: ServiceScope): string {
  const where = m.town ?? 'no approved town';
  const s = q && scope ? questionScope(q, scope) : null;
  if (m.intent === 'emergency') return `emergency / problem intent in ${where}${s?.service ? ` (${s.service})` : ''}`;
  if (m.service) return `${m.service} in ${where}`;
  if (s?.verdict === 'service' && s.service) return `${s.service} in ${where}`;
  /* ⛔ "core" only for a question that IS about the business in general (C-03). Without a scope the
     old reading stands; with one, anything else is called what it is. */
  if (!s || s.verdict === 'core') return `core ${(trade || 'business').toLowerCase()} question in ${where}`;
  return `${describeScope(s)} (${where})`;
}

/** The verdict for a question before selection: null = eligible. */
function exclusion(q: string, input: RecInput | undefined, m: { town: string | null }, scope?: ServiceScope): string | null {
  if (scope) {
    const s = questionScope(q, scope);
    if (!inScope(s)) return `${describeScope(s)} It cannot be part of the measurement without a reason.`;
  }
  if (!m.town) return 'Names none of the approved towns — it would measure an area the business has not confirmed it serves.';
  if (input && consistentlyNamed(input.engines)) return `Business already named in every answer (${namedLine(input.engines)}) — there is no room to improve, so it cannot show progress.`;
  if (input?.verdict === 'no-local-race') return 'AI names no local business for this question, so it cannot show local visibility either way.';
  return null;
}

export interface RecommendArgs {
  /** The Hook Audit's questions, verbatim and in their order (0–3). */
  hook: string[];
  /** The Discovery pool, with measurements where it has them. */
  pool: RecInput[];
  /** Measurements for the Hook questions themselves (from the Hook Audit's own run), when known. */
  hookMeasures?: RecInput[];
  ctx: MixContext;
  trade: string;
  target: number;
  /** The client's service scope (serviceScope.ts). Absent = no service check (legacy callers only). */
  scope?: ServiceScope;
  /** The mandatory core questions (customerQuestion.coreQuestions), admitted after the Hook ones. */
  core?: string[];
}

export function recommendBaseline(a: RecommendArgs): Recommendation {
  const towns = [a.ctx.primaryTown, ...a.ctx.areas].filter(Boolean);
  const byQ = new Map<string, RecInput>();
  for (const i of a.pool) byQ.set(norm(i.question), i);
  const hookByQ = new Map<string, RecInput>();
  for (const i of a.hookMeasures ?? []) hookByQ.set(norm(i.question), i);
  const hook = a.hook.map((q) => q.trim()).filter(Boolean).filter((q, i, arr) => arr.findIndex((x) => norm(x) === norm(q)) === i);

  const core = (a.core ?? []).map((q) => q.trim()).filter(Boolean).filter((q) => !hook.some((h) => norm(h) === norm(q)));
  const isCore = (q: string) => core.some((c) => norm(c) === norm(q));
  const excluded = new Map<string, string>();
  const eligible: RecInput[] = [];
  for (const i of a.pool) {
    const m = classifyQuestion(i.question.trim(), a.ctx);
    if (hook.some((h) => norm(h) === norm(i.question))) continue;            // already locked in
    if (isCore(i.question)) continue;                                        // admitted as core
    const why = exclusion(i.question, i, m, a.scope);
    if (why) excluded.set(norm(i.question), why); else eligible.push(i);
  }
  const chosen = buildBalancedBaseline(
    [
      ...hook.map((q) => ({ question: q, source: 'locked' as const })),
      ...core.map((q) => ({ question: q, source: 'core' as const })),
      ...eligible.map((i) => ({ question: i.question, source: 'discovery' as const })),
    ],
    a.ctx, a.target, {
      rank: (q) => opportunityRank(byQ.get(norm(q))), serviceCap: MAX_QUESTIONS_PER_SERVICE, hardServiceCap: true,
      ...(a.scope ? { serviceOf: (q: string) => questionScope(q, a.scope!).service } : {}),
    },
  );
  const chosenSet = new Set(chosen.map(norm));

  const rows: RecRow[] = chosen.map((q) => {
    const m = classifyQuestion(q, a.ctx);
    const isHook = hook.some((h) => norm(h) === norm(q));
    const input = isHook ? (byQ.get(norm(q)) ?? hookByQ.get(norm(q))) : byQ.get(norm(q));
    const reason = isHook
      ? `The Hook Audit asked this — kept for continuity from the first check to the re-measure; ${visibilityPhrase(input)}.`
      : isCore(q)
        ? `Core question — the plain question customers ask most, always in the baseline; ${visibilityPhrase(input)}.`
        : `${INTENT_LABELS[m.intent]}: ${subjectPhrase(m, a.trade, q, a.scope)}; ${visibilityPhrase(input)}.`;
    return { question: q, source: isHook ? 'hook' : isCore(q) ? 'core' : 'discovery', town: m.town, service: m.service, intent: m.intent, reason, engines: input?.engines ?? null };
  });

  const pool: PoolRec[] = a.pool.map((i) => {
    const m = classifyQuestion(i.question.trim(), a.ctx);
    const k = norm(i.question);
    const base = { question: i.question, town: m.town, service: m.service, intent: m.intent, engines: i.engines ?? null };
    if (chosenSet.has(k)) {
      const row = rows.find((r) => norm(r.question) === k)!;
      return { ...base, verdict: 'recommended' as const, reason: row.reason };
    }
    const ex = excluded.get(k);
    if (ex) return { ...base, verdict: 'not_recommended' as const, reason: ex };
    const twin = chosen.find((c) => sameIntent(c, i.question, towns));
    if (twin) return { ...base, verdict: 'future' as const, reason: `Useful, but the same intent is already in the baseline: “${twin}”.` };
    const serviceCount = m.service ? rows.filter((r) => r.service === m.service).length : 0;
    const townCount = m.town ? rows.filter((r) => r.town && normTown(r.town) === normTown(m.town!)).length : 0;
    const full = serviceCount >= 2 ? `${m.service} already has ${serviceCount} questions in the baseline`
      : townCount >= 2 ? `${m.town} already has ${townCount} questions in the baseline`
      : 'the baseline is full';
    return { ...base, verdict: 'future' as const, reason: `Useful, but ${full} — kept for ongoing improvement work (${visibilityPhrase(i)}).` };
  });

  return { questions: rows, pool, hook, summary: summarise(rows, a), short: Math.max(0, a.target - rows.length) };
}

/** The composition, counted from the rows — the words are computed, never canned. */
export function summarise(rows: Array<Pick<RecRow, 'source' | 'town' | 'service' | 'intent' | 'engines'>>, a: Pick<RecommendArgs, 'ctx' | 'target'>): RecSummary {
  const intents: Record<IntentType, number> = { broad: 0, service: 0, location: 0, emergency: 0 };
  for (const r of rows) intents[r.intent]++;
  const services = new Set(rows.map((r) => r.service).filter(Boolean));
  const towns = new Set(rows.map((r) => r.town && normTown(r.town)).filter(Boolean));
  const home = rows.filter((r) => r.town && normTown(r.town) === normTown(a.ctx.primaryTown)).length;
  const opportunity = { absent: 0, partial: 0, named: 0, unmeasured: 0 };
  for (const r of rows) {
    if (!measured(r.engines)) opportunity.unmeasured++;
    else if (absentEverywhere(r.engines)) opportunity.absent++;
    else if (consistentlyNamed(r.engines)) opportunity.named++;
    else opportunity.partial++;
  }
  const totalTowns = 1 + a.ctx.areas.length;
  const why: string[] = [];
  const add = (n: number, text: string) => { if (n) why.push(`${n} ${text}`); };
  add(intents.broad, `broad / core business question${intents.broad === 1 ? '' : 's'}`);
  add(intents.service, `service question${intents.service === 1 ? '' : 's'} in ${a.ctx.primaryTown || 'the home town'}`);
  add(intents.location, `service question${intents.location === 1 ? '' : 's'} in other approved areas`);
  add(intents.emergency, `emergency / problem question${intents.emergency === 1 ? '' : 's'}`);
  if (a.ctx.services.length) why.push(`${services.size} of ${a.ctx.services.length} approved services represented`);
  why.push(`${towns.size} of ${totalTowns} approved town${totalTowns === 1 ? '' : 's'} represented (${home} in ${a.ctx.primaryTown || 'the home town'})`);
  const opp = [
    opportunity.absent && `${opportunity.absent} where the business is not named yet`,
    opportunity.partial && `${opportunity.partial} partly named`,
    opportunity.named && `${opportunity.named} already named`,
    opportunity.unmeasured && `${opportunity.unmeasured} not measured yet`,
  ].filter(Boolean);
  if (opp.length) why.push(opp.join(' · '));
  return {
    total: rows.length, target: a.target,
    fromHook: rows.filter((r) => r.source === 'hook').length,
    fromCore: rows.filter((r) => r.source === 'core').length,
    fromDiscovery: rows.filter((r) => r.source === 'discovery').length,
    manual: rows.filter((r) => r.source === 'manual').length,
    intents, services: { covered: services.size, total: a.ctx.services.length },
    towns: { covered: towns.size, total: totalTowns, home }, opportunity, why,
  };
}

/** Describe a DRAFT (whatever is on screen) row by row: where each question came from and what it
 *  measured. Source is DERIVED from the hook list and the pool, never stored. */
export function describeDraft(questions: string[], a: Omit<RecommendArgs, 'target'>): RecRow[] {
  const byQ = new Map<string, RecInput>();
  for (const i of a.pool) byQ.set(norm(i.question), i);
  for (const i of a.hookMeasures ?? []) if (!byQ.has(norm(i.question))) byQ.set(norm(i.question), i);
  return questions.map((q) => q.trim()).filter(Boolean).map((q) => {
    const m = classifyQuestion(q, a.ctx);
    const isHook = a.hook.some((h) => norm(h) === norm(q));
    const isCore = (a.core ?? []).some((c) => norm(c) === norm(q));
    const inPool = a.pool.some((p) => norm(p.question) === norm(q));
    const input = byQ.get(norm(q));
    const source: QuestionSource = isHook ? 'hook' : isCore ? 'core' : inPool ? 'discovery' : 'manual';
    const reason = source === 'hook' ? `From the Hook Audit — ${visibilityPhrase(input)}.`
      : source === 'core' ? `Core question — the plain question customers ask most; ${visibilityPhrase(input)}.`
      : source === 'discovery' ? `${INTENT_LABELS[m.intent]}: ${subjectPhrase(m, a.trade, q, a.scope)}; ${visibilityPhrase(input)}.`
      : `Added by hand: ${subjectPhrase(m, a.trade, q, a.scope)}.`;
    return { question: q, source, town: m.town, service: m.service, intent: m.intent, reason, engines: input?.engines ?? null };
  });
}

/* ── the Hook Audit questions are protected ────────────────────────────────────────────────────── */

/** A replacement reason must say something: at least this many characters of text. */
export const HOOK_REPLACEMENT_MIN_REASON = 10;
export interface HookReplacement { question: string; reason: string }

/**
 * Which Hook Audit questions an approval would drop, and which of those have no admin reason.
 * ⛔ Not dropped silently (Paul, 2026-09-30): a Hook question may leave the official baseline only
 * when it is genuinely invalid (a factual / business error), with the reason written down. The
 * server refuses an approval whose `unexplained` is not empty (paid-baseline, approve).
 */
export function hookProtection(approved: string[], hook: string[], replacements: HookReplacement[] = []): { missing: string[]; unexplained: string[]; explained: HookReplacement[] } {
  const inSet = new Set(approved.map(norm));
  const missing = hook.filter((h) => h.trim() && !inSet.has(norm(h)));
  const explained: HookReplacement[] = [];
  const unexplained: string[] = [];
  for (const h of missing) {
    const r = replacements.find((x) => norm(x.question ?? '') === norm(h));
    const reason = (r?.reason ?? '').trim();
    if (reason.length >= HOOK_REPLACEMENT_MIN_REASON) explained.push({ question: h, reason }); else unexplained.push(h);
  }
  return { missing, unexplained, explained };
}

/**
 * The Discovery questions that go to the Opportunity Backlog when a baseline is approved: every pool
 * question NOT in the approved set, except the ones that cannot be an opportunity (no approved town,
 * already named everywhere, no local race). Duplicates of a baseline question DO go — "useful, but
 * similar intent already represented" is exactly what the backlog is for.
 */
/* ⛔ AND NEVER A SERVICE THE CLIENT DOES NOT OFFER (C-04): with a scope, a not-offered or unconfirmed
   question is not seeded — Session C's "car keys" reached the backlog as a "useful" future page. */
export function backlogCandidates(approved: string[], pool: RecInput[], ctx: MixContext, scope?: ServiceScope): Array<RecInput & { town: string | null; service: string | null; intent: IntentType }> {
  const inSet = new Set(approved.map(norm));
  const out: Array<RecInput & { town: string | null; service: string | null; intent: IntentType }> = [];
  for (const i of pool) {
    if (inSet.has(norm(i.question))) continue;
    const m = classifyQuestion(i.question.trim(), ctx);
    if (exclusion(i.question, i, m, scope)) continue;
    if (out.some((o) => norm(o.question) === norm(i.question))) continue;
    out.push({ ...i, town: m.town, service: m.service, intent: m.intent });
  }
  return out;
}
