/* ═══════════════════════════════════════════════════════════════════════════════════════
   REPORT MODEL — everything a report page shows, built from ONE business's own stored data. (2026-11-11)

   A TEMPLATE, not a document: nothing here (or in reportDesign.ts) is specific to any business. Every word, number,
   service, area and competitor comes from the rows, the website check and the dates passed in. The same model feeds
   the three report types (opportunity, first contact, client): the order of sections is identical.

   Pure (no DOM, no provider calls); imported by the render-audit-report edge function, so relative imports carry .ts.
   ═══════════════════════════════════════════════════════════════════════════════════════ */

import {
  hookFromRows, scoreAnswers, searchPhrase, summariseOpportunity, buildVocab, type OppContext, type OppDirectory, type OppFirm, type OppQuestion, type OppRow,
} from './reportOpportunity.ts';

export type ReportKind = 'opportunity' | 'hook' | 'baseline';

/** The business's website check, in plain terms. `not_checked` = no stored check yet. */
export interface WebsiteSection {
  state: 'issues' | 'clean' | 'no_website' | 'not_checked';
  /** Serious first, then the rest; plain English titles from the stored check. */
  issues: { title: string; serious: boolean }[];
}

export interface HookExample { question: string; answers: { engine: string; namedYou: boolean; rivals: string[] }[] }

export interface ReportModel {
  kind: ReportKind;
  businessName: string;
  dateLabel: string;
  shareUrl?: string;
  /** What customers type: "a plumber or electrician", and where: "East London". */
  what: string;
  where: string;
  /** The AI score: share of the answers that named any business that named THIS business. null = no answer named a business. */
  score: { value: number | null; named: number; denominator: number; answers: number };
  /** none = never named; some = named but under half the answers that named a business; high = half or more. */
  band: 'none' | 'some' | 'high';
  /** The firm named in the most answers, and everyone AI recommends instead (most first). */
  top: OppFirm | null;
  rivals: OppFirm[];
  website: WebsiteSection;
  counts: { lots: number; some: number; little: number; nofirms: number; named: number; flagged: number; notoffered: number; notonsite: number; /** lots + some + little + nofirms + named */ room: number; searches: number };
  /** The two AI the score is built from, over the searches that count. */
  engines: { chatgpt: { named: number; answers: number }; gemini: { named: number; answers: number } };
  /** Google's AI Overview, for context (never scored): searches asked, searches where it showed, and where it named you. */
  overview: { asked: number; shown: number; named: number };
  /** How many times each search was asked of each AI. */
  asks: number;
  /** The search shown as a chat example: the first-contact report's pick, or the top target of the opportunity report. */
  featured: OppQuestion | null;
  /** Every search that counts, in the order shown (client: the tracked order; others: best first). */
  all: OppQuestion[];
  /** Section 4: the best targets (opportunity), every tracked search (client), or [] (first contact uses `examples`). */
  targets: OppQuestion[];
  examples: HookExample[];
  directories: OppDirectory[];
  /** Searches left out of every count because the place is ambiguous. */
  flagged: string[];
  /** "9 Dec 2026" — client reports only. */
  checkAgainLabel?: string;
  /** Baseline: the main money searches that have little room, shown as "Main search, harder to get named" (up to 4). */
  mainQuestions: string[];
}

export interface ReportModelInput {
  kind: ReportKind;
  businessName: string;
  /** The audit's own town or city ("London", "Wisbech"). */
  town: string;
  dateLabel: string;
  shareUrl?: string;
  website: WebsiteSection;
  checkAgainLabel?: string;
  /** Opportunity: how many targets to list (default 10). */
  bestCount?: number;
  /** Client: the order the client sees the tracked searches in. */
  order?: string[];
  /** First contact: the searches to show as examples (default: the first three). */
  hookQuestions?: string[];
}

/** The main money searches of a baseline: the plain "best / recommend a good <trade> in <home town>" ones (up to 4), in the baseline's order.
 *  Only the ones with little room are labelled (the others need no excuse). */
export function mainSearches(qs: OppQuestion[], town: string): string[] {
  const home = town.trim().toLowerCase();
  return qs.filter((q) => q.tier === 'little' && !!q.area && q.area.trim().toLowerCase() === home && (q.intent === 'best' || /\b(recommend|good|reviews?)\b/i.test(q.question))).slice(0, 4).map((q) => q.question);
}

export function buildReportModel(rows: OppRow[], ctx0: OppContext, o: ReportModelInput): ReportModel {
  const questions = [...new Set(rows.map((r) => r.question.trim()))];
  const vocab = ctx0.vocab ?? buildVocab(questions, ctx0.services.map((s) => s.name), [ctx0.town ?? o.town]);
  const ctx: OppContext = { ...ctx0, town: ctx0.town ?? o.town, vocab };
  const s = summariseOpportunity(rows, ctx, o.bestCount ?? 10);
  const counted = new Set(s.questions.filter((q) => q.tier !== 'flagged').map((q) => q.question));
  const sc = scoreAnswers(rows, ctx, counted);
  const value = sc.denominator > 0 ? (sc.named > 0 ? Math.max(1, Math.round((100 * sc.named) / sc.denominator)) : 0) : null;
  const band: ReportModel['band'] = !sc.named ? 'none' : value !== null && value >= 50 ? 'high' : 'some';

  // What customers type: from the searches about services they offer (a service not on their site is not "their" service).
  const byQ = new Map(s.questions.map((q) => [q.question, q]));
  const phraseQs = questions.filter((q) => { const x = byQ.get(q); return !!x && x.tier !== 'flagged' && x.service !== null; });
  const phrase = searchPhrase(phraseQs.length ? phraseQs : questions, o.town);

  let targets: OppQuestion[] = [];
  let examples: HookExample[] = [];
  if (o.kind === 'opportunity') {
    // Searches with lots of room first, then some room; a business that is already named a lot leads with where to keep and grow.
    const pool = s.questions.filter((q) => q.tier === 'lots' || q.tier === 'some' || q.tier === 'named');
    const rank = (q: OppQuestion) => (q.tier === 'lots' ? 2 : q.tier === 'some' ? 1 : 0) + (band === 'high' && q.tier === 'named' ? 5 : 0);
    const order = new Map(s.best.map((q, i) => [q.question, i]));
    const sorted = [...pool].sort((x, y) => rank(y) - rank(x) || (order.get(x.question) ?? 999) - (order.get(y.question) ?? 999) || x.question.localeCompare(y.question));
    targets = sorted.slice(0, o.bestCount ?? 10);
    // Services missing from the current site are not hidden: they show last as "Not on your site yet" (we build the new site).
    targets.push(...s.questions.filter((q) => q.tier === 'notonsite').sort((a, b) => a.question.localeCompare(b.question)).slice(0, 3));
  } else if (o.kind === 'baseline') {
    const order = new Map((o.order ?? questions).map((q, i) => [q.trim(), i]));
    targets = s.questions.filter((q) => q.tier !== 'flagged').sort((a, b) => (order.get(a.question) ?? 999) - (order.get(b.question) ?? 999));
  } else {
    const hq = (o.hookQuestions ?? questions).slice(0, 3);
    examples = hookFromRows(rows, hq, ctx).questions;
  }

  const live = s.questions.filter((q) => q.tier !== 'flagged');
  const eng = (k: 'chatgpt' | 'gemini') => ({ named: live.reduce((n, q) => n + q.engines[k].named, 0), answers: live.reduce((n, q) => n + q.engines[k].answers, 0) });
  const overview = { asked: live.length, shown: live.filter((q) => q.overview.shown).length, named: live.filter((q) => q.overview.named).length };
  const asks = live.length ? Math.max(1, Math.round(sc.answers / (live.length * 2))) : 1;
  const byQuestion = new Map(s.questions.map((q) => [q.question, q]));
  const exampleQs = examples.map((e) => byQuestion.get(e.question.trim())).filter((q): q is OppQuestion => !!q);
  const featured = o.kind === 'hook'
    ? (exampleQs.find((q) => q.firms.length && q.namedYou === 0) ?? exampleQs.find((q) => q.firms.length) ?? exampleQs[0] ?? null)
    : (targets.find((q) => q.firms.length) ?? targets[0] ?? null);
  const all = o.kind === 'hook' ? exampleQs : o.kind === 'baseline' ? targets : [...live].sort((a, b) => a.question.localeCompare(b.question));
  return {
    engines: { chatgpt: eng('chatgpt'), gemini: eng('gemini') }, overview, asks, featured, all,
    kind: o.kind, businessName: o.businessName, dateLabel: o.dateLabel, shareUrl: o.shareUrl,
    what: phrase.what, where: phrase.where,
    score: { value, named: sc.named, denominator: sc.denominator, answers: sc.answers }, band,
    top: sc.firms[0] ?? null, rivals: sc.firms,
    website: o.website,
    counts: { lots: s.lots, some: s.some, little: s.little, nofirms: s.nofirms, named: s.named, flagged: s.flagged, notoffered: s.notoffered, notonsite: s.notonsite, room: s.room, searches: s.questions.length - s.flagged },
    targets, examples, directories: s.directories,
    flagged: s.questions.filter((q) => q.tier === 'flagged').map((q) => q.question),
    checkAgainLabel: o.checkAgainLabel,
    mainQuestions: o.kind === 'baseline' ? mainSearches(targets, o.town) : [],
  };
}

/** The stored website check (websiteCheck.ts WebsiteCheckView) as the report's plain section. Serious first; no score. */
export function websiteSectionFromCheck(v: { state: string; serious: { title?: string }[]; minor: { title?: string }[] } | null | undefined): WebsiteSection {
  if (!v) return { state: 'not_checked', issues: [] };
  if (v.state === 'no_website') return { state: 'no_website', issues: [] };
  if (v.state === 'clean') return { state: 'clean', issues: [] };
  if (v.state === 'issues') {
    const issues = [
      ...v.serious.filter((i) => i.title).map((i) => ({ title: String(i.title), serious: true })),
      ...v.minor.filter((i) => i.title).map((i) => ({ title: String(i.title), serious: false })),
    ];
    return issues.length ? { state: 'issues', issues } : { state: 'clean', issues: [] };
  }
  return { state: 'not_checked', issues: [] };
}
