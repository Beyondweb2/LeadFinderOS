/* ════════════════════════════════════════════════════════════════════════════════════════════
   NICHE VIEW — the outreach decision engine's shared types + pure helpers (Phase 1, 2026-08-28,
   Paul's spec). A NICHE is one trade folded across every town holding its audits: the automatic,
   repeatable version of the hand-run plumber recon (per-engine named rates, winnability counts,
   directory-vs-own-site source split).

   ⛔ DERIVED ON READ, NEVER STORED (the serveGate rule): the fold runs over the live audit rows in
   the market-view edge fn every time. No niche table, no stored verdict — a stored verdict freezes
   a stale rule.

   ⛔ THE FOLD IS BUSINESS-AUDITS-ONLY for the Phase-1 numbers, deliberately. Market audits carry
   real competitors/citations but their `named` flag was matched against a pseudo-name
   ("[market] Plumbers — Wythenshawe") and is meaningless — folding them in would dilute the named
   rates with structural zeros. They join in Phase 2 as separate intel, never mixed into the rates.

   ⛔ TWO STATISTICS, TWO RELIABILITIES (the sample-size honesty Paul mandated):
   - engine NAMED RATES + SOURCE SPLIT are per-ask counts — robust even from single-run audits;
   - per-question WINNABILITY flips ~18% on a single ask — only multi-run (majority) questions are
     trustworthy; single-run folds are INDICATIVE. Phase 1 reports the split; Phase 2's verdict
     tiers gate the confident wording on it.

   Pure + dependency-free: the edge fn and the SPA both import it. scripts/niche-view.test.ts.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

/** Fold a trade string to its niche key: lowercase, punctuation → space, each token stemmed of a
 *  trailing s — so Plumbers / plumber / plumbing DON'T all merge (plumbing keeps its g), but
 *  Plumbers/plumber/Plumber do. Same light stem the page plan uses. */
export function nicheTradeKey(trade: string | null | undefined): string {
  return String(trade ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((t) => (t.length >= 4 && t.endsWith('s') ? t.slice(0, -1) : t))
    .join(' ');
}

export interface NicheEngineStats {
  engine: string;               // chatgpt | gemini | ai_overview | google_organic
  label: string;
  named: number;                // answered cells where the business was named
  answered: number;             // cells where this engine returned an answer
}

export interface NicheSourceSplit {
  engine: string;
  label: string;
  directory: number;            // isAggregatorUrl (Checkatrade/Yell/MyBuilder…)
  ownSite: number;              // the audited business's OWN domain
  authority: number;            // classifySource 'authority' (gov/NHS/…)
  other: number;                // everything else — mostly OTHER businesses' own sites
  total: number;
}

export interface NicheTopDomain { domain: string; count: number }

export interface NicheTownRow {
  town: string;
  businesses: number;           // distinct audited businesses in this town
  audits: number;
  cells: number;                // answered engine cells
}

export interface NicheAnalysis {
  trade: string;                // display form (most common raw spelling)
  tradeKey: string;
  sample: {
    audits: number;             // business audits with answers
    businesses: number;         // distinct business names
    towns: number;
    questions: number;          // distinct questions (per audit)
    cells: number;              // answered engine cells (all engines)
    multiRunAudits: number;     // baselines (baseline_target_runs > 1)
    multiRunQuestions: number;  // questions whose winnability comes from a majority fold
  };
  engines: NicheEngineStats[];
  winnability: Record<string, number>;   // open/named/contested/locked/no_local_race/unmeasured → question counts
  sources: NicheSourceSplit[];
  topDomains: Record<string, NicheTopDomain[]>;   // per engine, most-cited first
  towns: NicheTownRow[];
  marketAudits: number;         // market audits of this trade (NOT folded into the numbers — Phase 2 intel)
}

export const ENGINE_LABELS_NICHE: Record<string, string> = {
  chatgpt: 'ChatGPT', gemini: 'Gemini', ai_overview: 'Google AI Overview', google_organic: 'Google organic',
};

/** "109 of 476 (22.9%)" — the honest rate line; never a bare percentage without its n. */
export function rateLabel(named: number, answered: number): string {
  if (answered === 0) return 'no answers';
  return `${named} of ${answered} (${(100 * named / answered).toFixed(1)}%)`;
}

/** Percentage share for the source bars; 0 when the denominator is 0, never NaN. */
export function sharePct(part: number, total: number): number {
  return total > 0 ? Math.round((1000 * part) / total) / 10 : 0;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════
   THE VERDICT + THE THREE HONESTY TIERS (Phase 2, 2026-08-28, Paul's spec).

   ⛔ EVERY THRESHOLD BELOW WAS MEASURED OVER THE STORED BOOK BEFORE IT WAS PICKED (§4's constants
   rule), across all 10 niches that have business audits with answers:
     trade              cells  biz towns   Qs  multiRunQ  open%   CG named    GM named  GMdir%
     locksmith           3012  275   129  1100     24      33%   803/1325   209/1325    10%
     plumber             1081   72    17   337     35      77%    109/476     21/476    13%
     accountant           860   48    20   190      0      75%     43/295     19/295     3%
     driving instructor   561   77    28   244      0      49%    128/247     25/247     3%
     online menopause     214    1     1    32     20      78%       6/72       3/72     1%
     electrician           76   12     1    36      0      69%      11/36       0/36     6%
     mobile mechanic       70   11     9    33      0      48%      15/33       2/33     3%
     mobile valeting       59    7     6    21      0      29%      17/24       8/24     9%
     shoe repair            39    1     1    18      0      44%       4/18       9/18     8%
     kava cafe              24    1     1     6      0      17%       9/10       0/10     0%

   THE TWO BARS, and why they differ:
   - RATE SPREAD decides whether the named rates / source split can be read as a NICHE at all.
     Volume alone is not enough: the menopause niche has 214 cells but ONE business in ONE town, so
     its "niche rate" is one business's rate. Requiring ≥5 businesses across ≥2 towns (with ≥50
     cells) admits exactly the 6 real multi-town niches and refuses the 4 single-business/single-town
     ones — a clean split in the observed data, with mobile valeting (59/7/6) the closest pass and
     electrician (76 cells but ONE town) the closest refusal.
   - WINNABILITY CONFIRMATION decides whether the confident verdict SENTENCE is allowed. Single-ask
     winnability flips ~18%, so it needs repeat-run questions to be the MAJORITY of the picture, not
     a footnote. Measured: only 3 niches have ANY multi-run questions, and their shares are 2.2%
     (locksmith), 10.4% (plumber) and 62.5% (menopause). So the share bar is what separates them.

   ⚠️ CONSEQUENCE, STATED PLAINLY RATHER THAN TUNED AWAY: on today's book NO niche reaches MEASURED
   (6 INDICATIVE, 4 UNMEASURED). That is the correct answer, not a broken threshold — the whole book
   is single-ask prospecting audits. MEASURED is the bar Phase 3's 3-run baselines exist to clear,
   and lowering it to make something qualify would be inventing confidence the data does not carry.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

/** Rate-spread bar: below any of these the named rates aren't a niche read at all → UNMEASURED. */
export const NICHE_MIN_CELLS = 50;
export const NICHE_MIN_BUSINESSES = 5;
export const NICHE_MIN_TOWNS = 2;
/** Winnability confirmation bar: repeat-run questions must be the majority of the picture. */
export const NICHE_CONFIRM_MIN_MULTIRUN_Q = 20;
export const NICHE_CONFIRM_MIN_MULTIRUN_SHARE = 0.5;
/** Open-share bands (observed: 17–78%, with a clear gap either side of these). */
export const NICHE_OPEN_STRONG = 0.6;
export const NICHE_OPEN_WEAK = 0.3;
/** An engine the client is absent enough from to be the opportunity / present enough to bank. */
export const NICHE_ABSENT_MAX_RATE = 0.15;
export const NICHE_PRESENT_MIN_RATE = 0.30;
/** Citation mix: directory-led vs own-site-led (observed CG 47% vs GM 13% on plumbers). */
export const NICHE_DIRECTORY_HEAVY = 0.35;
export const NICHE_OWN_SITE_LED = 0.20;
/* ⛔ LOCKED IS A SHARE, NEVER A BINARY — caught by running the verdict over the whole book before
   shipping: `lockedShare > 0` condemned LOCKSMITHS (Paul's biggest niche, 275 businesses) on 2
   locked questions out of 1100 = 0.2%. Observed locked shares are 0% (plumbers) to 0.2%
   (locksmiths), so like authority-lock this bar never fires on today's data and is a safety net for
   a genuinely locked-up niche, not a hair trigger. */
export const NICHE_LOCKED_HEAVY = 0.15;

export type NicheTier = 'measured' | 'indicative' | 'unmeasured';
export type NicheVerdictKind = 'worth_outreach' | 'mixed' | 'avoid' | 'no_verdict';

export interface NicheVerdict {
  tier: NicheTier;
  kind: NicheVerdictKind;
  headline: string;          // the decision sentence — shown FIRST
  engineStory: string;       // the honest per-engine story
  opportunityEngine: string | null;
  reasons: string[];         // itemised evidence, always shown
  tierNote: string;          // the honesty label (+ upgrade path when not MEASURED)
  gaps: string[];            // exactly what is missing to reach MEASURED
}

const rate = (e: NicheEngineStats): number => (e.answered > 0 ? e.named / e.answered : 0);

/** Derive the verdict from a Phase-1 analysis. PURE — nothing stored, recomputed on every read. */
export function nicheVerdict(n: NicheAnalysis): NicheVerdict {
  const s = n.sample;
  const engines = n.engines.filter((e) => e.answered > 0);
  const questions = Object.values(n.winnability).reduce((a, b) => a + b, 0);
  const openShare = questions > 0 ? (n.winnability.open ?? 0) / questions : 0;
  const lockedShare = questions > 0 ? (n.winnability.locked ?? 0) / questions : 0;

  // ── the two bars ──
  const spreadOk = s.cells >= NICHE_MIN_CELLS && s.businesses >= NICHE_MIN_BUSINESSES && s.towns >= NICHE_MIN_TOWNS;
  const mrShare = questions > 0 ? s.multiRunQuestions / questions : 0;
  const winConfirmed = s.multiRunQuestions >= NICHE_CONFIRM_MIN_MULTIRUN_Q && mrShare >= NICHE_CONFIRM_MIN_MULTIRUN_SHARE;
  const tier: NicheTier = !spreadOk ? 'unmeasured' : winConfirmed ? 'measured' : 'indicative';

  const gaps: string[] = [];
  if (s.cells < NICHE_MIN_CELLS) gaps.push(`${s.cells} answers — needs ${NICHE_MIN_CELLS}+`);
  if (s.businesses < NICHE_MIN_BUSINESSES) gaps.push(`${s.businesses} business${s.businesses === 1 ? '' : 'es'} — needs ${NICHE_MIN_BUSINESSES}+`);
  if (s.towns < NICHE_MIN_TOWNS) gaps.push(`${s.towns} town${s.towns === 1 ? '' : 's'} — needs ${NICHE_MIN_TOWNS}+`);
  if (spreadOk && !winConfirmed) {
    gaps.push(`winnability rests on ${s.multiRunQuestions} repeat-run question${s.multiRunQuestions === 1 ? '' : 's'} of ${questions} (${Math.round(100 * mrShare)}%) — needs ${Math.round(100 * NICHE_CONFIRM_MIN_MULTIRUN_SHARE)}%+ and ${NICHE_CONFIRM_MIN_MULTIRUN_Q}+`);
  }

  // ── the engine story: who we're already with, and where the room is ──
  const sorted = [...engines].sort((a, b) => rate(b) - rate(a));
  const strongest = sorted[0] ?? null;
  const dirShare = (engine: string): number => {
    const src = n.sources.find((x) => x.engine === engine);
    return src && src.total > 0 ? src.directory / src.total : 0;
  };
  /* The opportunity engine: client most absent AND that engine reads businesses' own sites, so a
     page on the client's own site is a lever there (§5's measured model).
     ⛔ RESTRICTED TO THE SCORED ENGINES (ChatGPT + Gemini) — caught by running this over the book:
     it was recommending "open on Google organic" for accountants and "Google AI Overview" for
     driving instructors. Those engines are captured but NOT scored, and §5's pages-move-Gemini
     evidence says nothing about them, so pointing outreach at them would be an unevidenced claim. */
  const OPPORTUNITY_ENGINES = ['chatgpt', 'gemini'];
  const opportunity = [...engines]
    .filter((e) => OPPORTUNITY_ENGINES.includes(e.engine))
    .filter((e) => rate(e) <= NICHE_ABSENT_MAX_RATE && dirShare(e.engine) < NICHE_DIRECTORY_HEAVY)
    .sort((a, b) => rate(a) - rate(b))[0] ?? null;

  const storyBits: string[] = [];
  if (strongest && rate(strongest) >= NICHE_PRESENT_MIN_RATE) {
    storyBits.push(dirShare(strongest.engine) >= NICHE_DIRECTORY_HEAVY
      ? `already showing up on ${strongest.label} (${rateLabel(strongest.named, strongest.answered)}) — and that engine is directory-fed (${sharePct(n.sources.find((x) => x.engine === strongest.engine)?.directory ?? 0, n.sources.find((x) => x.engine === strongest.engine)?.total ?? 0)}% of its citations), so listings win that, not pages`
      : `already showing up on ${strongest.label} (${rateLabel(strongest.named, strongest.answered)})`);
  } else if (strongest && opportunity && strongest.engine !== opportunity.engine && rate(strongest) >= 2 * rate(opportunity)) {
    storyBits.push(`${strongest.label} names these businesses ${rateLabel(strongest.named, strongest.answered)} — ${(rate(strongest) / Math.max(rate(opportunity), 0.001)).toFixed(0)}x more often than ${opportunity.label}${dirShare(strongest.engine) >= NICHE_DIRECTORY_HEAVY ? ', off directory listings' : ''}`);
  }
  if (opportunity) {
    const src = n.sources.find((x) => x.engine === opportunity.engine);
    const ownLed = src && src.total > 0 && src.directory / src.total < NICHE_OWN_SITE_LED;
    storyBits.push(`the room is on ${opportunity.label}: these businesses are named just ${rateLabel(opportunity.named, opportunity.answered)}${ownLed ? `, and it reads businesses' own websites (only ${sharePct(src!.directory, src!.total)}% directories)` : ''} — pages on the client's own site are the lever there`);
  }
  const engineStory = storyBits.length ? storyBits.join('; ') + '.' : 'No engine shows a clear gap or a clear presence in this data.';

  // ── the decision ──
  let kind: NicheVerdictKind; let headline: string;
  if (tier === 'unmeasured') {
    kind = 'no_verdict';
    headline = `Not enough spread to judge ${n.trade} as a niche — ${s.businesses} business${s.businesses === 1 ? '' : 'es'} across ${s.towns} town${s.towns === 1 ? '' : 's'}.`;
  } else if (lockedShare >= NICHE_LOCKED_HEAVY) {
    kind = 'avoid';
    headline = `${n.trade}: not worth mass outreach — ${Math.round(100 * lockedShare)}% of questions are locked up by incumbents.`;
  } else if (openShare < NICHE_OPEN_WEAK) {
    kind = 'avoid';
    headline = `${n.trade}: not worth mass outreach — only ${Math.round(100 * openShare)}% of ${questions} questions are open.`;
  } else if (opportunity && openShare >= NICHE_OPEN_STRONG) {
    kind = 'worth_outreach';
    headline = `${n.trade}: worth outreach — open on ${opportunity.label}, and pages are the lever.`;
  } else if (opportunity) {
    kind = 'mixed';
    headline = `${n.trade}: mixed — there's room on ${opportunity.label}, but only ${Math.round(100 * openShare)}% of questions are open.`;
  } else {
    /* No engine clears the absence bar — the niche is not locked, but there is no clear page lever
       either. Say THAT, rather than claiming they are "named everywhere" (which would overstate a
       middling rate like Gemini's 16% on locksmiths). */
    kind = 'mixed';
    const best = strongest ? `${strongest.label} already names them ${rateLabel(strongest.named, strongest.answered)}` : 'no engine shows a gap';
    headline = `${n.trade}: harder — no engine shows a clear gap (${best}), with ${Math.round(100 * openShare)}% of questions open.`;
  }

  const tierNote = tier === 'measured'
    ? `Measured: ${s.businesses} businesses across ${s.towns} towns, and winnability confirmed on repeat runs.`
    : tier === 'indicative'
      ? `Indicative only — single-ask data, so winnability can flip ~18%. The named rates and source split are per-answer counts and hold up; the open/locked split needs confirming. To make this confident: run 3-run baselines on 2-3 businesses in this niche (~30p each).`
      : `No verdict: too thin to read as a niche. Audit more businesses in more towns first.`;

  return { tier, kind, headline, engineStory, opportunityEngine: opportunity?.label ?? null, reasons: [
    `${Math.round(100 * openShare)}% of ${questions} questions are open${n.winnability.locked ? `, ${n.winnability.locked} locked` : ', none locked'}`,
    ...engines.map((e) => `${e.label}: named ${rateLabel(e.named, e.answered)}`),
    ...n.sources.filter((x) => x.total > 0).map((x) => `${x.label} citations: ${sharePct(x.directory, x.total)}% directories, ${sharePct(x.other, x.total)}% other businesses' sites`),
  ], tierNote, gaps };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════
   WHOSE RESULTS ARE THESE? — the guard on the niche panel's per-town "Add all".

   🔴 THE LEAD SEARCH HAS ONE GLOBAL RESULT SET (LeadSearchContext), so every town row in the
   panel is looking at the same `leads` array. A row may therefore only offer "Add all" when the
   SEARCH THAT PRODUCED those results names that row's trade AND town. Test only the town and a
   Plumbers/Wakefield search would arm the Locksmiths/Wakefield row; test neither and searching
   Wakefield then pressing Bedford's button writes Wakefield's businesses against Bedford — the
   wrong-town fault this product has already paid for once (CLAUDE.md §6b, 28 reports).

   ⚠️ IT KEYS ON THE SEARCH, NEVER ON WHICH BUTTON WAS PRESSED LAST. A pressed-button flag would
   still be set after the results were replaced by a search from somewhere else in the app.
   ⚠️ ABSENT MEANS NO. A null lastSearch, or one missing either field, owns nothing.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
export function resultsBelongToTown(
  lastSearch: { keyword?: string | null; location?: string | null } | null | undefined,
  trade: string,
  town: string,
): boolean {
  if (!lastSearch) return false;
  const norm = (v: string | null | undefined) => String(v ?? '').trim().toLowerCase();
  const kw = norm(lastSearch.keyword);
  const loc = norm(lastSearch.location);
  if (!kw || !loc) return false;                    // a search we cannot attribute owns nothing
  return kw === norm(trade) && loc === norm(town);
}
