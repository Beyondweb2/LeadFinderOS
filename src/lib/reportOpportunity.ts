/* ═══════════════════════════════════════════════════════════════════════════════════════
   REPORT OPPORTUNITY — what the stored answers say about each question, as plain counts.

   PRESENTATION INPUT ONLY (2026-11-11, report redesign). It reads answers already collected;
   it never calls a provider and never changes a score, a stored row or the audit method.

   ⛔ NOT A WINNABILITY SCORE. docs/architecture-rules.md bans one (it flips between identical
   inputs). This is a fixed, written rule over COUNTS across every stored answer, so the same data
   always gives the same page:
     • Hard      — one business is named in 5+ of 6 answers, or it is not a service the site shows.
     • Winnable  — no business is named in more than 2 answers, or 3 with 8+ different businesses
                   named, and it is not a "best" / emergency question (those turn on reviews and
                   24/7 cover, which a page alone does not give).
     • Possible  — everything else.
   "Winnable now" means AI has no settled favourite TODAY. It is not a promise that AI will name
   anyone (Master Standard: no outcome promises).

   Pure: no DOM, no Deno-only imports. Imported by the render-audit-report edge function, so
   relative imports carry an explicit .ts.
   ═══════════════════════════════════════════════════════════════════════════════════════ */

export type OppTier = 'now' | 'possible' | 'hard';

export interface OppFirm { name: string; count: number }

/** The shape of one stored answer cell this module reads (a subset of auditReport's EngineCell). */
interface Cell { self_named?: boolean; named?: boolean; competitors?: string[]; citations?: { url?: string }[] }
export interface OppRow { question: string; result: Record<string, unknown> | null }

export interface OppQuestion {
  question: string;
  tier: OppTier;
  /** Answers received from ChatGPT + Gemini (6 for 3 asks). */
  answers: number;
  /** Answers that named no business at all. */
  empty: number;
  distinct: number;
  /** The most any one business was named, in answers. */
  top: number;
  firms: OppFirm[];
  namedYou: number;
  chatgptNamed: number; chatgptAnswers: number; geminiNamed: number; geminiAnswers: number;
  area: string | null;
  /** The service this question is about, in the client's words ("EICR certificates"), or null when the site shows none. */
  service: string | null;
  hasPage: boolean | null;
  reasons: string[];
  help: string;
  intent: 'best' | 'emergency' | null;
  directories: string[];
}

export interface OppContext {
  businessName: string;
  /** Services the website check found, each with whether it has its own page. */
  services: { name: string; dedicated: boolean }[];
  /** Page paths the website check read (used only to see which topics have a page). */
  pageUrls?: string[];
  /** Everything the site says about what it does, lower-cased and joined (business type + name + services). */
  siteText?: string;
}

const ENGINES = ['chatgpt', 'gemini'] as const;

/* A business name as a grouping key: case, punctuation and filler words do not make a new firm. */
const FILLER = /\b(ltd|limited|london|services|service|the|and|&)\b/g;
export const firmKey = (s: string): string => s.toLowerCase().replace(FILLER, '').replace(/[^a-z0-9]/g, '');

const DIRECTORIES: [RegExp, string][] = [
  [/checkatrade\.com/, 'Checkatrade'], [/trustatrader\.com/, 'TrustATrader'], [/yell\.com/, 'Yell'],
  [/trustedtraders\.which\.co\.uk|which\.co\.uk/, 'Which? Trusted Traders'], [/gov\.uk/, 'gov.uk'],
  [/gassaferegister\.co\.uk/, 'Gas Safe Register'], [/mybuilder\.com/, 'MyBuilder'], [/bark\.com/, 'Bark'],
  [/nrla\.org\.uk/, 'NRLA'], [/shelter\.org/, 'Shelter'], [/niceic\.com/, 'NICEIC'], [/hse\.gov\.uk/, 'HSE'],
];

/** Topic → (what the question has to say, what the site has to show, how the client's service is named). */
const TOPICS: { test: RegExp; needs: RegExp; label: string; pageKey: RegExp; confirm?: RegExp; confirmNote?: string }[] = [
  { test: /\beicr\b/, needs: /eicr|electrical/, label: 'EICR certificates', pageKey: /eicr/ },
  { test: /consumer unit/, needs: /electric/, label: 'consumer unit replacement', pageKey: /consumer|electric/ },
  { test: /electrician/, needs: /electric/, label: 'electrician work', pageKey: /electric/ },
  { test: /\bpat\b/, needs: /pat testing/, label: 'PAT testing', pageKey: /pat/ },
  { test: /gas safety/, needs: /gas safety/, label: 'gas safety certificates', pageKey: /gas.?safety/ },
  { test: /landlord certificate/, needs: /landlord certificate/, label: 'landlord certificates', pageKey: /landlord/ },
  { test: /gas engineer/, needs: /gas/, label: 'gas engineer work', pageKey: /gas/ },
  { test: /boiler install/, needs: /boiler|gas and heating/, label: 'boiler installation', pageKey: /install/, confirm: /install/, confirmNote: 'Check first: we did not see boiler installation listed on your website.' },
  { test: /boiler repair/, needs: /boiler|gas and heating/, label: 'boiler repair', pageKey: /repair/ },
  { test: /boiler/, needs: /boiler|gas and heating/, label: 'boiler servicing', pageKey: /boiler/ },
  { test: /handyman/, needs: /maintenance/, label: 'handyman work', pageKey: /handyman/, confirm: /handyman/, confirmNote: 'Check first: handyman jobs are not listed on your website.' },
  { test: /plumb/, needs: /plumb/, label: 'plumbing', pageKey: /plumb/ },
  { test: /maintenance/, needs: /maintenance/, label: 'property maintenance', pageKey: /maintenance/ },
];

function topicFor(question: string): (typeof TOPICS)[number] | null {
  const q = question.toLowerCase();
  if (/block management/.test(q)) return null; // a different customer from the ones the site speaks to
  return TOPICS.find((t) => t.test.test(q)) ?? null;
}

/** "boiler service in Bow" -> "Bow"; "EICR certificate for landlords in London" -> "London". */
export function areaOf(question: string): string | null {
  const m = question.match(/\bin ([A-Z][A-Za-z' -]+)$/);
  return m ? m[1].trim() : null;
}
/** A named patch (a borough or neighbourhood) rather than the whole of London. */
export const isLocalArea = (area: string | null): boolean => !!area && !/^(london|east london)$/i.test(area);

function intentOf(question: string): OppQuestion['intent'] {
  const q = question.toLowerCase();
  if (/\bbest\b/.test(q)) return 'best';
  if (/\bemergency\b/.test(q)) return 'emergency';
  return null;
}

function domainOf(u: string | undefined): string {
  try { return new URL(String(u)).hostname.replace(/^www\./, ''); } catch { return ''; }
}

/** One question's counts, tier and reasons. `rows` are every queue row (any run) for it. */
export function oppQuestion(question: string, rows: OppRow[], ctx: OppContext): OppQuestion {
  const own = rows.filter((r) => r.question.trim() === question.trim());
  const counts = new Map<string, number>();
  const display = new Map<string, string>(); const variants = new Map<string, Map<string, number>>();
  const cites = new Map<string, number>();
  const per = { chatgpt: [0, 0], gemini: [0, 0] } as Record<(typeof ENGINES)[number], [number, number]>;
  let answers = 0, empty = 0, namedYou = 0;
  for (const row of own) {
    for (const e of ENGINES) {
      const cell = (row.result ?? {})[e] as Cell | undefined;
      if (!cell || typeof cell !== 'object') continue;
      answers++; per[e][1]++;
      if (cell.self_named || cell.named) { namedYou++; per[e][0]++; }
      const firms = (cell.competitors ?? []).filter((c) => typeof c === 'string' && c.trim());
      if (!firms.length) empty++;
      for (const k of new Set(firms.map(firmKey))) if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
      for (const f of firms) { const k = firmKey(f); if (k) { const m = variants.get(k) ?? new Map<string, number>(); m.set(f.trim(), (m.get(f.trim()) ?? 0) + 1); variants.set(k, m); } }
      for (const c of cell.citations ?? []) { const d = domainOf(c.url); if (d) cites.set(d, (cites.get(d) ?? 0) + 1); }
    }
  }
  for (const [k, m] of variants) display.set(k, [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0]);
  const firms: OppFirm[] = [...counts.entries()].map(([k, count]) => ({ name: display.get(k) ?? k, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const top = firms[0]?.count ?? 0;
  const distinct = firms.length;
  const area = areaOf(question);
  const topic = topicFor(question);
  const site = (ctx.siteText ?? '').toLowerCase();
  const offered = !!topic && topic.needs.test(site);
  const needsConfirm = !!(offered && topic?.confirm && !topic.confirm.test(site));
  const intent = intentOf(question);
  const pages = (ctx.pageUrls ?? []).join(' ').toLowerCase();
  const hasPage = topic ? (ctx.services.some((s) => topic.pageKey.test(s.name.toLowerCase()) && s.dedicated) || (topic.label === 'EICR certificates' && /eicr/.test(pages))) : null;

  const half = Math.ceil(answers / 2);
  let tier: OppTier;
  if (!offered || top >= Math.max(5, answers - 1)) tier = 'hard';
  else if (!intent && (top <= 2 || (top === 3 && distinct >= 8))) tier = 'now';
  else tier = 'possible';
  if (needsConfirm && tier === 'now') tier = 'possible';
  if (answers === 0) tier = 'possible';

  const directoriesSeen = [...new Set(
    [...cites.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([d]) => DIRECTORIES.find(([re]) => re.test(d))?.[1]).filter((x): x is string => !!x),
  )];

  const areaMixup = area === 'Stratford' && (firms.some((f) => /upon.?avon/i.test(f.name)) || [...cites.keys()].some((d) => /avon/i.test(d)));
  const reasons: string[] = [];
  if (areaMixup) reasons.push('AI is answering for Stratford-upon-Avon, not Stratford E15, so nobody in your patch is being named.');
  if (needsConfirm && topic?.confirmNote) reasons.push(topic.confirmNote);
  if (!offered) reasons.push('Not a service we found on your website.');
  else if (top >= Math.max(5, answers - 1)) reasons.push(`${firms[0].name} is named in ${top} of ${answers} answers.`);
  else {
    if (empty >= half) reasons.push(`AI named no business in ${empty} of ${answers} answers.`);
    if (areaMixup) { /* already said */ }
    else if (distinct >= 8 && top <= 3) reasons.push(`${distinct} different businesses named; none in more than ${top} of ${answers} answers.`);
    else if (distinct >= 8) reasons.push(`${distinct} different businesses named, but ${firms[0].name} appears in ${top} of ${answers}.`);
    else if (distinct >= 3 && empty < half && top <= 3) reasons.push(`${distinct} businesses named; the most-named appears in ${top} of ${answers} answers.`);
    if (top === 4) reasons.push(`One business leads: ${firms[0].name} in 4 of ${answers} answers.`);
    if (directoriesSeen.length >= 2) reasons.push(`Answers lean on directories and guidance pages (${directoriesSeen.slice(0, 3).join(', ')}).`);
    if (intent === 'best') reasons.push('A "best" question: reviews count most here.');
    if (intent === 'emergency') reasons.push('An emergency question: 24/7 cover and reviews count here.');
  }
  if (!reasons.length) reasons.push(`${distinct} businesses named across ${answers} answers.`);

  const label = topic?.label ?? null;
  let help = '';
  if (offered && label) {
    const where = area ? ` for ${area}` : ' for London';
    const art = /^[aeiou]|^eicr/i.test(label) ? 'An' : 'A';
    help = `${hasPage ? art : 'A new'} ${label} page${where}${hasPage && isLocalArea(area) ? ' (your existing pages cover other areas)' : ''}, plus Google reviews.`;
    if (intent === 'emergency') help = `${art} ${label} page${where} that shows call-out cover, plus Google reviews.`;
  }

  return {
    question, tier, answers, empty, distinct, top, firms: firms.slice(0, 5), namedYou,
    chatgptNamed: per.chatgpt[0], chatgptAnswers: per.chatgpt[1], geminiNamed: per.gemini[0], geminiAnswers: per.gemini[1],
    area, service: offered ? label : null, hasPage, reasons, help, intent, directories: directoriesSeen,
  };
}

export interface OppSummary {
  questions: OppQuestion[];
  now: number; possible: number; hard: number;
  answers: number;
  /** Audit-wide: how many answers named each business, most first. */
  rivals: OppFirm[];
  /** The best questions to start with, ranked (Winnable first; their own patch and an existing page count in favour). */
  best: OppQuestion[];
}

/** Ranking for "the best 20": tier first, then patch / service-page / how open the answers are. Deterministic. */
export function bestScore(q: OppQuestion): number {
  if (q.tier === 'hard') return -1000;
  return (q.tier === 'now' ? 100 : 60)
    + (isLocalArea(q.area) ? 15 : 0)
    + (q.hasPage ? 8 : 0)
    + Math.min(q.empty, 4) * 3
    - q.top * 4
    - (q.intent ? 12 : 0);
}

export function summariseOpportunity(rows: OppRow[], ctx: OppContext, bestCount = 20): OppSummary {
  const qs = [...new Set(rows.map((r) => r.question.trim()))];
  const questions = qs.map((q) => oppQuestion(q, rows, ctx)).sort((a, b) => a.question.localeCompare(b.question));
  const counts = new Map<string, number>(); const display = new Map<string, string>(); const variants = new Map<string, Map<string, number>>();
  let answers = 0;
  for (const row of rows) for (const e of ENGINES) {
    const cell = (row.result ?? {})[e] as Cell | undefined;
    if (!cell || typeof cell !== 'object') continue;
    answers++;
    const firms = (cell.competitors ?? []).filter((c) => typeof c === 'string' && c.trim());
    for (const k of new Set(firms.map(firmKey))) if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
    for (const f of firms) { const k = firmKey(f); if (k) { const m = variants.get(k) ?? new Map<string, number>(); m.set(f.trim(), (m.get(f.trim()) ?? 0) + 1); variants.set(k, m); } }
  }
  for (const [k, m] of variants) display.set(k, [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0]);
  const rivals = [...counts.entries()].map(([k, count]) => ({ name: display.get(k) ?? k, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const best = questions.filter((q) => q.tier !== 'hard').sort((a, b) => bestScore(b) - bestScore(a) || a.question.localeCompare(b.question)).slice(0, bestCount);
  return {
    questions, answers, rivals, best,
    now: questions.filter((q) => q.tier === 'now').length,
    possible: questions.filter((q) => q.tier === 'possible').length,
    hard: questions.filter((q) => q.tier === 'hard').length,
  };
}

/** The hook report's view of a few questions: ONE answer per engine (the first stored row for each question),
 *  who each named, and the businesses named across them. Pure; counts only. */
export function hookFromRows(rows: OppRow[], questions: string[]): { questions: { question: string; answers: { engine: string; namedYou: boolean; rivals: string[] }[] }[]; rivals: OppFirm[] } {
  const label: Record<string, string> = { chatgpt: 'ChatGPT', gemini: 'Gemini' };
  const counts = new Map<string, number>(); const display = new Map<string, string>();
  const out = questions.map((question) => {
    const row = rows.find((r) => r.question.trim() === question.trim());
    const answers = ENGINES.flatMap((e) => {
      const cell = (row?.result ?? {})[e] as Cell | undefined;
      if (!cell || typeof cell !== 'object') return [];
      const rivals = (cell.competitors ?? []).filter((c) => typeof c === 'string' && c.trim());
      for (const k of new Set(rivals.map(firmKey))) if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
      for (const f of rivals) { const k = firmKey(f); if (k && !display.has(k)) display.set(k, f.trim()); }
      return [{ engine: label[e], namedYou: !!(cell.self_named || cell.named), rivals }];
    });
    return { question, answers };
  });
  const rivals = [...counts.entries()].map(([k, count]) => ({ name: display.get(k) ?? k, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return { questions: out, rivals };
}
