/* ═══════════════════════════════════════════════════════════════════════════════════════
   REPORT OPPORTUNITY — what the stored answers say about each question, as plain counts.

   PRESENTATION INPUT ONLY (2026-11-11, report redesign). It reads answers already collected;
   it never calls a provider and never changes a score, a stored row or the audit method.

   THE RULE (Paul, 2026-11-11, third version — the one the simple reports use; RULE_WORDS below):
     • "You could win"      — no single business is named in HALF OR MORE of the answers (under 3 of 6), AND it is
                              a service on their website, in their area.
     • "Possible with work" — one business is named in 3 or 4 of 6 (half up to just under 5/6), OR it is a service
                              not on their website (or outside their area).
     • "Hard to win"        — one business is named in 5 or 6 of 6 (5/6 or more), whatever the service.
   Other answer counts scale the same way (top / answers). ⛔ Many different businesses named is never enough on
   its own: the service has to be on their website.

   ⛔ NOT A SCORE. docs/architecture-rules.md bans winnability SCORING (it flips between identical inputs).
   This is a fixed, written rule over COUNTS across every stored answer, so the same data always gives the
   same page. "Winnable" is allowed only with the evidence shown beside it and the "not a promise" line;
   it never promises a ranking, a recommendation or a citation.

   DIRECTORIES (Paul, 2026-11-11): directories and review sites are counted from the stored answers —
   named in the text, or cited as a source — per question and overall. They are NEVER competitors.

   Pure: no DOM, no Deno-only imports. Imported by the render-audit-report edge function, so
   relative imports carry an explicit .ts.
   ═══════════════════════════════════════════════════════════════════════════════════════ */

export type OppTier = 'now' | 'possible' | 'hard';

export interface OppFirm { name: string; count: number }
export interface OppDirectory { name: string; /** answers that name or cite it */ answers: number; /** questions it appears in */ questions: number }

/** The three groups, in the words the reports print (plain English, no jargon). */
export const RULE_WORDS: { key: OppTier; label: string; short: string }[] = [
  { key: 'now', label: 'You could win', short: 'No one stands out yet' },
  { key: 'possible', label: 'Possible with work', short: 'One firm leads, or work needed' },
  { key: 'hard', label: 'Hard to win', short: 'One firm named almost every time' },
];

/** The shape of one stored answer cell this module reads (a subset of auditReport's EngineCell). */
interface Cell { self_named?: boolean; named?: boolean; competitors?: string[]; citations?: { url?: string }[]; answer_text?: string }
export interface OppRow { question: string; result: Record<string, unknown> | null }

export interface OppQuestion {
  question: string;
  tier: OppTier;
  /** Winnable because no business was named at all (shown "Winnable (easy)"). */
  easy: boolean;
  /** Answers received from ChatGPT + Gemini (6 for 3 asks). */
  answers: number;
  /** At most 5 words: why this search is in its group ("AI names nobody"). Plain English. */
  why: string;
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
  /** Directories and review sites this question's answers name or cite, most first. */
  dirs: { name: string; answers: number }[];
}

export interface OppContext {
  businessName: string;
  /** Services the website check found, each with whether it has its own page. */
  services: { name: string; dedicated: boolean }[];
  /** Page paths the website check read (used only to see which topics have a page). */
  pageUrls?: string[];
  /** Everything the site says about what it does, lower-cased and joined (business type + name + services).
   *  ABSENT = the site was not read, so nothing is judged "not a service on your site". */
  siteText?: string;
  /** The places they work: where the site, the lead and the discovery put them. ABSENT = every question's
   *  area counts as theirs (a discovery asks about the business's own patch). */
  areas?: string[];
  /** The report's own "was the business named in this answer" ruler (namedSignal.cellNamed). Default: the stored flags. */
  isNamed?: (cell: Cell) => boolean;
  /** Drops a name that is page furniture, not a business (auditReport.isRealCompetitor). Default: keep all. */
  isRival?: (name: string) => boolean;
  /** Extra directory hosts the caller knows (the shared aggregator list), beyond the built-in list. */
  isDirectoryHost?: (host: string) => boolean;
}
const namedOf = (ctx: Pick<OppContext, 'isNamed'>) => (c: Cell): boolean => (ctx.isNamed ? ctx.isNamed(c) : !!(c.self_named || c.named));

const ENGINES = ['chatgpt', 'gemini'] as const;

/* A business name as a grouping key: case, punctuation and filler words do not make a new firm. */
const FILLER = /\b(ltd|limited|london|services|service|the|and|&)\b/g;
export const firmKey = (s: string): string => s.toLowerCase().replace(FILLER, '').replace(/[^a-z0-9]/g, '');

/* ── Directories and review sites ───────────────────────────────────────────────────────────
   A directory is where a customer FINDS or CHECKS a business, not a business competing for the job.
   Matched by the host of a cited source, or by name in the answer text. gov.uk / HSE guidance pages
   are not listings, so they are not here. */
const DIRECTORIES: { name: string; host: RegExp; text?: RegExp }[] = [
  { name: 'Checkatrade', host: /(^|\.)checkatrade\.com$/, text: /\bcheckatrade\b/i },
  { name: 'TrustATrader', host: /(^|\.)trustatrader\.com$/, text: /\btrust ?a ?trader\b/i },
  { name: 'Yell', host: /(^|\.)yell\.com$/, text: /\byell\.com\b|\bYell\b(?= (listing|profile|directory)| \()/ },
  { name: 'MyBuilder', host: /(^|\.)mybuilder\.com$/, text: /\bmybuilder\b/i },
  { name: 'Bark', host: /(^|\.)bark\.com$/, text: /\bbark\.com\b/i },
  { name: 'Rated People', host: /(^|\.)ratedpeople\.com$/, text: /\brated ?people\b/i },
  { name: 'Trustpilot', host: /(^|\.)trustpilot\.(com|co\.uk)$/, text: /\btrustpilot\b/i },
  { name: 'Which? Trusted Traders', host: /(^|\.)trustedtraders\.which\.co\.uk$/, text: /\bwhich\??\s+trusted traders\b/i },
  { name: 'FreeIndex', host: /(^|\.)freeindex\.co\.uk$/, text: /\bfreeindex\b/i },
  { name: 'TrustMark', host: /(^|\.)trustmark\.org\.uk$/, text: /\btrustmark\b/i },
  { name: 'Gas Safe Register', host: /(^|\.)gassaferegister\.co\.uk$/, text: /\bgas safe register\b/i },
  { name: 'NICEIC', host: /(^|\.)niceic\.com$/, text: /\bniceic\b/i },
  { name: 'Google reviews', host: /(^|\.)(maps\.google\.[a-z.]+|g\.page|business\.google\.com)$|^google\.[a-z.]+$/, text: /\bgoogle (reviews?|maps|business profile)\b/i },
  { name: 'Thomson Local', host: /(^|\.)thomsonlocal\.com$/, text: /\bthomson local\b/i },
  { name: 'Cylex', host: /(^|\.)cylex(-uk)?\.co\.uk$/ },
  { name: 'Scoot', host: /(^|\.)scoot\.co\.uk$/ },
  { name: 'Hotfrog', host: /(^|\.)hotfrog\.(co\.uk|com)$/ },
  { name: 'Nextdoor', host: /(^|\.)nextdoor\.(co\.uk|com)$/ },
  { name: 'Houzz', host: /(^|\.)houzz\.(co\.uk|com)$/ },
  { name: 'Trade Facilities / Find a Tradesman', host: /(^|\.)(findatradesman\.co\.uk|tradesman\.com)$/ },
];
/** Names that are a directory, not a business — dropped from the competitor lists. */
const DIRECTORY_NAME = /^(checkatrade|trust ?a ?trader|yell|mybuilder|bark|rated ?people|trustpilot|which\??( trusted traders)?|freeindex|trustmark|gas safe( register)?|niceic|google( reviews| maps| business profile)?|thomson local|cylex|scoot|hotfrog|nextdoor|houzz|facebook|instagram|reddit|quora|trustedtraders)\b/i;
export const isDirectoryName = (name: string): boolean => DIRECTORY_NAME.test(name.trim());

function hostOf(u: string | undefined): string {
  try { return new URL(String(u)).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
}
const prettyHost = (h: string): string => h.replace(/^(www|m)\./, '');

/** Which directories ONE answer names (in its text) or cites (as a source). Each counts once per answer. */
export function directoriesInAnswer(cell: Cell, ctx: Pick<OppContext, 'isDirectoryHost'> = {}): string[] {
  const found = new Set<string>();
  const text = String(cell.answer_text ?? '');
  const hosts = (cell.citations ?? []).map((c) => hostOf(c.url)).filter(Boolean);
  for (const d of DIRECTORIES) {
    if (hosts.some((h) => d.host.test(h)) || (d.text && d.text.test(text))) found.add(d.name);
  }
  // Others found: a cited host the shared directory list (or a directory-shaped name) recognises.
  for (const h of hosts) {
    if (DIRECTORIES.some((d) => d.host.test(h))) continue;
    if (/\.gov\.uk$/.test(h)) continue;
    if (ctx.isDirectoryHost?.(h) || /(^|[.-])(directory|listings?|reviews?)([.-]|$)/.test(h)) found.add(prettyHost(h));
  }
  return [...found];
}

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

/** Is this question's area one of the places they work? A question with no area, or no known work areas, counts as theirs. */
export function inTheirArea(area: string | null, areas: string[] | undefined): boolean {
  if (!area || !areas) return true;
  const a = area.toLowerCase();
  const mine = areas.map((x) => x.toLowerCase());
  return mine.some((m) => m === a || m.includes(a) || a.includes(m));
}

function intentOf(question: string): OppQuestion['intent'] {
  const q = question.toLowerCase();
  if (/\bbest\b/.test(q)) return 'best';
  if (/\bemergency\b/.test(q)) return 'emergency';
  return null;
}

/** One question's counts, tier and reasons. `rows` are every queue row (any run) for it. */
export function oppQuestion(question: string, rows: OppRow[], ctx: OppContext): OppQuestion {
  const own = rows.filter((r) => r.question.trim() === question.trim());
  const counts = new Map<string, number>();
  const variants = new Map<string, Map<string, number>>();
  const dirCounts = new Map<string, number>();
  const per = { chatgpt: [0, 0], gemini: [0, 0] } as Record<(typeof ENGINES)[number], [number, number]>;
  const cites = new Set<string>();
  let answers = 0, empty = 0, namedYou = 0;
  for (const row of own) {
    for (const e of ENGINES) {
      const cell = (row.result ?? {})[e] as Cell | undefined;
      if (!cell || typeof cell !== 'object') continue;
      answers++; per[e][1]++;
      if (namedOf(ctx)(cell)) { namedYou++; per[e][0]++; }
      const firms = rivalsOf(cell, ctx);
      if (!firms.length) empty++;
      for (const k of new Set(firms.map(firmKey))) if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
      for (const f of firms) { const k = firmKey(f); if (k) { const m = variants.get(k) ?? new Map<string, number>(); m.set(f.trim(), (m.get(f.trim()) ?? 0) + 1); variants.set(k, m); } }
      for (const d of directoriesInAnswer(cell, ctx)) dirCounts.set(d, (dirCounts.get(d) ?? 0) + 1);
      for (const c of cell.citations ?? []) { const h = hostOf(c.url); if (h) cites.add(h); }
    }
  }
  const display = new Map<string, string>();
  for (const [k, m] of variants) display.set(k, [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0]);
  const firms: OppFirm[] = [...counts.entries()].map(([k, count]) => ({ name: display.get(k) ?? k, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const top = firms[0]?.count ?? 0;
  const distinct = firms.length;
  const area = areaOf(question);
  const topic = topicFor(question);
  const siteKnown = ctx.siteText != null;
  const site = (ctx.siteText ?? '').toLowerCase();
  const offered = siteKnown ? (!!topic && topic.needs.test(site)) : true;
  const needsConfirm = !!(siteKnown && offered && topic?.confirm && !topic.confirm.test(site));
  const serviceOnSite = offered && !needsConfirm;
  const areaOk = inTheirArea(area, ctx.areas);
  const intent = intentOf(question);
  const pages = (ctx.pageUrls ?? []).join(' ').toLowerCase();
  const hasPage = topic ? (ctx.services.some((s) => topic.pageKey.test(s.name.toLowerCase()) && s.dedicated) || (topic.label === 'EICR certificates' && /eicr/.test(pages))) : null;

  /* THE RULE (Paul, 2026-11-11): Hard = one business in 5 or 6 of 6 (top/answers >= 5/6); Possible = 3 or 4 of 6 (half or
     more), or a service not on their website / outside their area; otherwise "you could win". */
  const dominant = answers > 0 && top * 6 >= answers * 5;
  const leads = answers > 0 && top * 2 >= answers;
  let tier: OppTier;
  const easy = false;
  if (answers === 0) tier = 'possible';
  else if (dominant) tier = 'hard';
  else if (leads) tier = 'possible';
  else if (serviceOnSite && areaOk) tier = 'now';
  else tier = 'possible';

  const areaMixup = area === 'Stratford' && (firms.some((f) => /upon.?avon/i.test(f.name)) || [...cites].some((d) => /avon/i.test(d)));
  const reasons: string[] = [];
  if (areaMixup) reasons.push('AI is answering for Stratford-upon-Avon, not Stratford E15, so nobody in your patch is being named.');
  if (dominant) reasons.push(`${firms[0].name} is named in ${top} of ${answers} answers.`);
  else if (leads) reasons.push(`${firms[0].name} is named in ${top} of ${answers} answers.`);
  else if (tier === 'possible' && answers > 0) {
    if (needsConfirm && topic?.confirmNote) reasons.push(topic.confirmNote);
    else if (!serviceOnSite) reasons.push('Not a service we found on your website.');
    if (!areaOk) reasons.push(`${area} is outside the areas your website covers.`);
  }
  if (!leads && answers > 0) {
    if (top === 0) reasons.push(`AI named no business in any of the ${answers} answers.`);
    else {
      if (empty * 2 >= answers && empty > 0) reasons.push(`AI named no business in ${empty} of ${answers} answers.`);
      if (!areaMixup) {
        if (distinct >= 8) reasons.push(`${distinct} different businesses named; none in more than ${top} of ${answers} answers.`);
        else if (distinct >= 2 && empty * 2 < answers) reasons.push(`${distinct} businesses named; the most-named appears in ${top} of ${answers} answers.`);
      }
    }
  }
  const dirs = [...dirCounts.entries()].map(([name, n]) => ({ name, answers: n })).sort((a, b) => b.answers - a.answers || a.name.localeCompare(b.name));
  if (dirs.length >= 2) reasons.push(`Answers lean on directories and review sites (${dirs.slice(0, 3).map((d) => d.name).join(', ')}).`);
  if (intent === 'best') reasons.push('A "best" question: reviews count most here.');
  if (intent === 'emergency') reasons.push('An emergency question: 24/7 cover and reviews count here.');
  if (!reasons.length) reasons.push(`${distinct} businesses named across ${answers} answers.`);

  const why = areaMixup ? 'AI mixes up two Stratfords'
    : dominant ? 'One firm named almost every time'
    : leads ? 'One firm leads'
    : !serviceOnSite ? 'Not on your website yet'
    : !areaOk ? 'Outside your areas'
    : top === 0 ? 'AI names nobody'
    : empty * 2 >= answers ? 'Most answers name no one'
    : 'No one stands out yet';
  const label = topic?.label ?? null;
  let help = '';
  if (offered && label) {
    const art = /^[aeiou]|^eicr/i.test(label) ? 'An' : 'A';
    const where = area ? ` for ${area}` : ' for London';
    help = `${hasPage ? art : 'A new'} ${label} page${where}${hasPage && isLocalArea(area) ? ' (your existing pages cover other areas)' : ''}, plus Google reviews.`;
    if (intent === 'emergency') help = `${art} ${label} page${where} that shows call-out cover, plus Google reviews.`;
  }

  return {
    question, tier, easy, why, answers, empty, distinct, top, firms: firms.slice(0, 5), namedYou,
    chatgptNamed: per.chatgpt[0], chatgptAnswers: per.chatgpt[1], geminiNamed: per.gemini[0], geminiAnswers: per.gemini[1],
    area, service: offered ? label : null, hasPage, reasons, help, intent, dirs,
  };
}

/** Competitor names from one answer: real businesses only. A directory or review site is NEVER a competitor. */
function rivalsOf(cell: Cell, ctx: Pick<OppContext, 'isRival'>): string[] {
  return (cell.competitors ?? []).filter((c) => typeof c === 'string' && c.trim() && !isDirectoryName(c) && (!ctx.isRival || ctx.isRival(c)));
}

export interface OppSummary {
  questions: OppQuestion[];
  now: number; possible: number; hard: number;
  /** Of the Winnable questions, how many are "easy" (no business named at all). */
  easy: number;
  answers: number;
  /** Audit-wide: how many answers named each business, most first. */
  rivals: OppFirm[];
  /** Directories and review sites, ranked by how many answers cite or name them. */
  directories: OppDirectory[];
  /** The best questions to start with, ranked (Winnable first; their own patch and an existing page count in favour). */
  best: OppQuestion[];
}

/** Directories across a set of questions: answers that name or cite each, and how many questions it shows up in. */
export function directoriesAcross(qs: OppQuestion[]): OppDirectory[] {
  const m = new Map<string, { answers: number; questions: number }>();
  for (const q of qs) for (const d of q.dirs) {
    const cur = m.get(d.name) ?? { answers: 0, questions: 0 };
    cur.answers += d.answers; cur.questions += 1; m.set(d.name, cur);
  }
  return [...m.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.answers - a.answers || b.questions - a.questions || a.name.localeCompare(b.name));
}

/** Ranking for "the best 20": tier first, then patch / service-page / how open the answers are. Deterministic. */
export function bestScore(q: OppQuestion): number {
  if (q.tier === 'hard') return -1000;
  return (q.tier === 'now' ? 100 : 60)
    + (q.easy ? 10 : 0)
    + (isLocalArea(q.area) ? 15 : 0)
    + (q.hasPage ? 8 : 0)
    + Math.min(q.empty, 4) * 3
    - q.top * 4;
}

export function summariseOpportunity(rows: OppRow[], ctx: OppContext, bestCount = 20): OppSummary {
  const qs = [...new Set(rows.map((r) => r.question.trim()))];
  const questions = qs.map((q) => oppQuestion(q, rows, ctx)).sort((a, b) => a.question.localeCompare(b.question));
  const counts = new Map<string, number>(); const variants = new Map<string, Map<string, number>>();
  let answers = 0;
  for (const row of rows) for (const e of ENGINES) {
    const cell = (row.result ?? {})[e] as Cell | undefined;
    if (!cell || typeof cell !== 'object') continue;
    answers++;
    const firms = rivalsOf(cell, ctx);
    for (const k of new Set(firms.map(firmKey))) if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
    for (const f of firms) { const k = firmKey(f); if (k) { const m = variants.get(k) ?? new Map<string, number>(); m.set(f.trim(), (m.get(f.trim()) ?? 0) + 1); variants.set(k, m); } }
  }
  const display = new Map<string, string>();
  for (const [k, m] of variants) display.set(k, [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0]);
  const rivals = [...counts.entries()].map(([k, count]) => ({ name: display.get(k) ?? k, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const best = questions.filter((q) => q.tier !== 'hard').sort((a, b) => bestScore(b) - bestScore(a) || a.question.localeCompare(b.question)).slice(0, bestCount);
  return {
    questions, answers, rivals, best, directories: directoriesAcross(questions),
    now: questions.filter((q) => q.tier === 'now').length,
    possible: questions.filter((q) => q.tier === 'possible').length,
    hard: questions.filter((q) => q.tier === 'hard').length,
    easy: questions.filter((q) => q.easy).length,
  };
}

/** The hook report's view of a few questions: ONE answer per engine (the first stored row for each question),
 *  who each named, and the businesses named across them. Pure; counts only. */
export function hookFromRows(rows: OppRow[], questions: string[], ctx: Pick<OppContext, 'isNamed' | 'isRival'> = {}): { questions: { question: string; answers: { engine: string; namedYou: boolean; rivals: string[] }[] }[]; rivals: OppFirm[] } {
  const label: Record<string, string> = { chatgpt: 'ChatGPT', gemini: 'Gemini' };
  const counts = new Map<string, number>(); const display = new Map<string, string>();
  const out = questions.map((question) => {
    const row = rows.find((r) => r.question.trim() === question.trim());
    const answers = ENGINES.flatMap((e) => {
      const cell = (row?.result ?? {})[e] as Cell | undefined;
      if (!cell || typeof cell !== 'object') return [];
      const rivals = rivalsOf(cell, ctx);
      for (const k of new Set(rivals.map(firmKey))) if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
      for (const f of rivals) { const k = firmKey(f); if (k && !display.has(k)) display.set(k, f.trim()); }
      return [{ engine: label[e], namedYou: namedOf(ctx)(cell), rivals }];
    });
    return { question, answers };
  });
  const rivals = [...counts.entries()].map(([k, count]) => ({ name: display.get(k) ?? k, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return { questions: out, rivals };
}

/** Where they work, for the "in their area" test: the audit's own town, the areas their website has pages for
 *  (…/eicr/camden-town), and — for a Discovery or a baseline cut from one — every area the questions ask about,
 *  because those questions are generated around the business's own patch. Pure. */
export function theirAreas(o: { locationText?: string | null; pageUrls?: string[]; questions?: string[]; fromDiscovery?: boolean }): string[] {
  const out = new Set<string>();
  const add = (s: string | null | undefined) => { const t = String(s ?? '').trim(); if (t) out.add(t); };
  add(o.locationText);
  for (const u of o.pageUrls ?? []) {
    const m = u.match(/\/(?:certificates|areas?|locations?|services?)\/[^/]+\/([a-z0-9-]+)\/?$/i);
    if (m) add(m[1].replace(/-/g, ' '));
  }
  if (o.fromDiscovery) for (const q of o.questions ?? []) add(areaOf(q));
  return [...out];
}

/** The verdict vocabulary the page plan, the market view and the Discovery screens already speak. */
export type RuleVerdictLabel = 'named' | 'open' | 'contested' | 'locked' | 'unmeasured';
export interface RuleVerdict {
  verdict: RuleVerdictLabel;
  tier: OppTier;
  easy: boolean;
  /** One plain sentence of evidence, from the counts. */
  reason: string;
  /** The businesses named, most first (real businesses only, never directories). */
  namedFirms: string[];
  clientNamed: boolean;
  q: OppQuestion;
}

/** THE one winnable rule for one question across all its runs: Winnable -> 'open', Possible -> 'contested', Hard -> 'locked'.
 *  Replaces the per-run classifier and its "majority of runs" fold: the rule reads every answer at once, so it cannot
 *  flip between identical inputs. A client named in MORE THAN HALF of the runs is 'named' (defend); one run alone never
 *  establishes presence ('unmeasured'), exactly as before. `results` = one stored result map per run. */
export function ruleVerdict(question: string, results: Record<string, unknown>[], ctx: OppContext): RuleVerdict {
  const rows: OppRow[] = results.map((result) => ({ question, result }));
  const q = oppQuestion(question, rows, ctx);
  const isNamed = namedOf(ctx);
  let runs = 0, namedRuns = 0;
  for (const r of results) {
    let any = false, here = false;
    for (const e of ENGINES) {
      const cell = (r ?? {})[e] as Cell | undefined;
      if (!cell || typeof cell !== 'object') continue;
      any = true; here = here || isNamed(cell);
    }
    if (any) { runs++; if (here) namedRuns++; }
  }
  const clientNamed = runs >= 2 && namedRuns * 2 > runs;
  let verdict: RuleVerdictLabel;
  if (runs === 0) verdict = 'unmeasured';
  else if (clientNamed) verdict = 'named';
  else if (runs === 1 && namedRuns === 1) verdict = 'unmeasured';
  else verdict = q.tier === 'now' ? 'open' : q.tier === 'possible' ? 'contested' : 'locked';
  return { verdict, tier: q.tier, easy: q.easy, reason: q.reasons[0] ?? '', namedFirms: q.firms.map((f) => f.name), clientNamed, q };
}

/* ── What customers actually search for (2026-11-11, Paul) ───────────────────────────────────────────────
   The headline uses the words a customer types ("a gas engineer or electrician in East London"), taken from the
   searches asked about the business's own main services, and NEVER the trade label ("domestic maintenance"). */
const SEARCH_NOUNS: { test: RegExp; art: string; word: string }[] = [
  { test: /electrician|\beicr\b|consumer unit|\bpat\b|electrical/i, art: 'an', word: 'electrician' },
  { test: /plumb|leak detection/i, art: 'a', word: 'plumber' },
  { test: /gas engineer|boiler|gas safety/i, art: 'a', word: 'gas engineer' },
  { test: /handyman/i, art: 'a', word: 'handyman' },
  { test: /landlord certificate/i, art: '', word: 'landlord certificates' },
  { test: /property maintenance|maintenance company/i, art: 'a', word: 'property maintenance company' },
];

/** { what: "a gas engineer or electrician", where: "East London" } from the searches asked. Pure. */
export function searchPhrase(questions: string[], town: string): { what: string; where: string } {
  const score = new Map<number, number>();
  for (const q of questions) {
    const i = SEARCH_NOUNS.findIndex((n) => n.test.test(q));
    if (i >= 0) score.set(i, (score.get(i) ?? 0) + 1);
  }
  const ranked = [...score.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 2).map(([i]) => SEARCH_NOUNS[i]);
  let what = 'a business like yours';
  if (ranked.length === 1) what = ranked[0].art ? `${ranked[0].art} ${ranked[0].word}` : ranked[0].word;
  else if (ranked.length === 2) what = `${ranked[0].art ? `${ranked[0].art} ` : ''}${ranked[0].word} or ${ranked[1].word}`;
  // The widest named region the searches use ("East London"), else the audit's own town.
  const regions = new Map<string, number>();
  for (const q of questions) { const a = areaOf(q); if (a && /london$/i.test(a) && a.toLowerCase() !== 'london') regions.set(a, (regions.get(a) ?? 0) + 1); }
  const region = [...regions.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  return { what, where: region ?? (town || 'your area') };
}
