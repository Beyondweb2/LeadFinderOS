/* ═══════════════════════════════════════════════════════════════════════════════════════
   REPORT OPPORTUNITY — what the stored answers say about each search, as plain counts. V1 CORE: every report
   (opportunity, first contact, client) and the page plan / market view / Discovery screens read this one rule.

   PRESENTATION INPUT ONLY (2026-11-11). It reads answers already collected; it never calls a provider and never
   changes a score, a stored row or the audit method. Every number comes from the stored answers (never from a
   stored summary such as ai_audit_runs.mention_rate).

   THE ROOM RULE (Paul, 2026-11-11), per search, over its answers (n, 6 for 3 asks x 2 AI). The goal is for the business to
   be NAMED by AI (one of the firms listed), not to be first or to beat anyone, and we always build their site, so no label
   speaks of work needed. A search is graded by how much ROOM there is in the list AI gives:
     • "Lots of room"  — many different firms, the list keeps changing (repeat share under 0.3), a service on their
                         website, a SPECIFIC area (a borough, town or district).
     • "Some room"     — a few firms repeat but other spots change (0.3 to under 0.6); also any search with lots of room
                         that covers a whole city, region or country, or names no place (capped here).
     • "Little room"   — the same small group in nearly every answer (repeat share 0.6 or more, or one firm in 5/6+ of the
                         answers with a share of 0.5 or more).
     • "AI doesn't name firms yet" — most answers (more than half) name no firm.
     • "Keep and grow" — named by this business in half or more of the answers.
     • left out        — "flagged": AI answered for the WRONG PLACE (half or more of the answers: e.g. Stratford-upon-Avon for
                         Stratford; fewer wrong answers are dropped one by one); "not offered": a service not on their site.
   "Regulars" are the firms named in at least half of the search's answers; "repeat share" is the share of all firm mentions
   that the regulars make. Other answer counts scale by fraction. Directories, review sites and bare service phrases
   ("Landlord Certificate London") are never firms.

   ⛔ NOT A SCORE. docs/architecture-rules.md bans winnability SCORING; this is a fixed written rule over COUNTS, so the
   same data always gives the same page. "You could win" is allowed only with its evidence ("6 answers named 9 firms,
   no one more than twice") and the "not guarantees" line; it never promises a ranking, a recommendation or a citation.
   The AI score is a share of stored answers, not a winnability score.

   Pure: no DOM, no Deno-only imports. Imported by the render-audit-report edge function, so relative imports carry .ts.
   ═══════════════════════════════════════════════════════════════════════════════════════ */

export type OppTier = 'lots' | 'some' | 'little' | 'nofirms' | 'named' | 'flagged' | 'notoffered' | 'notonsite';

/** Room thresholds, from the real LDM and ABLM answers (docs/reports.md "Room rule"). */
export const ROOM_LITTLE_AT = 0.6;
export const ROOM_LITTLE_TOP_ALL = 0.5;
export const ROOM_SOME_AT = 0.3;

export interface OppFirm { name: string; count: number }
export interface OppDirectory { name: string; /** answers that name or cite it */ answers: number; /** questions it appears in */ questions: number }

/** The groups, in the words the reports print (plain English, no jargon). */
export const RULE_WORDS: { key: OppTier; label: string; short: string }[] = [
  { key: 'lots', label: 'Lots of room', short: 'AI names different firms each time' },
  { key: 'some', label: 'Some room', short: 'A few firms repeat, other spots change' },
  { key: 'little', label: 'Little room', short: 'The same few firms in nearly every answer' },
  { key: 'nofirms', label: "AI doesn't name firms yet", short: 'Most answers name no firm' },
  { key: 'named', label: 'Keep and grow', short: 'AI already names you' },
  { key: 'flagged', label: 'Check this place', short: 'AI answered for another place, left out' },
  { key: 'notoffered', label: 'Not your service', short: 'You told us you do not offer this' },
  { key: 'notonsite', label: 'Not on your site yet', short: 'Add a page if you offer this' },
];

import { cleanAnswerText, isJunkAnswer, isMapCardAnswer } from './answerText.ts';

/** The shape of one stored answer cell this module reads (a subset of auditReport's EngineCell). */
interface Cell { self_named?: boolean; named?: boolean; competitors?: string[]; citations?: { url?: string }[]; answer_text?: string }
export interface OppRow { question: string; result: Record<string, unknown> | null }

export interface OppQuestion {
  question: string;
  tier: OppTier;
  /** Kept for older callers; always false under the strict rule. */
  easy: boolean;
  /** Answers received from ChatGPT + Gemini (6 for 3 asks). */
  answers: number;
  /** Plain proof line, a few words: "6 answers named 9 firms, no one more than twice". */
  why: string;
  /** Answers that named no business at all. */
  empty: number;
  /** Answers that named at least one business. */
  named: number;
  distinct: number;
  /** The most any one business was named, in answers. */
  top: number;
  firms: OppFirm[];
  namedYou: number;
  chatgptNamed: number; chatgptAnswers: number; geminiNamed: number; geminiAnswers: number;
  area: string | null;
  /** 'specific' (borough/town/district), 'wide' (whole city, region, country) or 'none' (no place in the search). */
  scope: 'specific' | 'wide' | 'none';
  /** The service this search is about, in customer words, or null when the site shows none. */
  service: string | null;
  hasPage: boolean | null;
  reasons: string[];
  help: string;
  intent: 'best' | 'emergency' | null;
  /** Directories and review sites this search's answers name or cite, most first. */
  dirs: { name: string; answers: number }[];
  /** Names dropped from the firm lists because they are service phrases, not businesses. */
  droppedPhrases: string[];
  /** Firms named in at least half of the answers, and the share of all firm mentions they make (0 to 1). */
  regulars: number;
  repeatShare: number;
  /** Answers left out because they are about another place with the same name. */
  wrongPlace: number;
  /** Per AI: answers received, answers naming this business, the firms it named (most first) and a real answer snippet. */
  engines: { chatgpt: EngineFacts; gemini: EngineFacts };
  /** Google's AI Overview for this search (shown for context, not scored): shown or not, named you, the firms it named. */
  overview: { shown: boolean; named: boolean; firms: string[]; snippet: string | null };
}
export interface EngineFacts { answers: number; named: number; firms: OppFirm[]; snippet: string | null }

/** A real answer, cleaned, cut to about `max` characters at a sentence or word end. null when it is empty, junk or a map card. */
export function snippetOf(raw: string | undefined, max = 190): string | null {
  const t = cleanAnswerText(String(raw ?? '')).replace(/[-=_]{3,}/g, ' ').replace(/\|/g, ' ').replace(/\\+/g, '').replace(/\s+/g, ' ').trim();
  if (t.length < 20 || isJunkAnswer(t) || isMapCardAnswer(t)) return null;
  // Map widgets and listings pasted into an answer, and text in another script, are not a quotable answer.
  if (/map data|\bstars?\b|\bcloses\b|\bopens\b|\d\.\d\s*\(\d|search results/i.test(t)) return null;
  const letters = t.replace(/[^\p{L}]/gu, '');
  if (letters.length && letters.replace(/[A-Za-z]/g, '').length / letters.length > 0.12) return null;
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '));
  return stop > 80 ? cut.slice(0, stop + 1) : `${cut.slice(0, cut.lastIndexOf(' '))}…`;
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
  /** The places they work. ABSENT = every search's area counts as theirs (a discovery asks about its own patch). */
  areas?: string[];
  /** The audit's own town or city ("London", "Wisbech"): used to tell a whole city from a town. */
  town?: string;
  /** The report's own "was the business named in this answer" ruler (namedSignal.cellNamed). Default: the stored flags. */
  isNamed?: (cell: Cell) => boolean;
  /** Drops a name that is page furniture, not a business (auditReport.isRealCompetitor). Default: keep all. */
  isRival?: (name: string) => boolean;
  /** Extra directory hosts the caller knows (the shared aggregator list), beyond the built-in list. */
  isDirectoryHost?: (host: string) => boolean;
  /** Words the business's own searches use (built by summariseOpportunity); used to spot service phrases. */
  vocab?: Set<string>;
  /** Services the client said they do NOT offer (onboarding). Only these, or a search clearly outside their trade, are excluded;
   *  a service merely missing from the current site is "Not on your site yet" (we build the new site). */
  notOffered?: string[];
}
const namedOf = (ctx: Pick<OppContext, 'isNamed'>) => (c: Cell): boolean => (ctx.isNamed ? ctx.isNamed(c) : !!(c.self_named || c.named));

const ENGINES = ['chatgpt', 'gemini'] as const;

/* A business name as a grouping key: case, punctuation and filler words do not make a new firm. */
const FILLER = /\b(ltd|limited|london|services|service|the|and|&)\b/g;
export const firmKey = (s: string): string => s.toLowerCase().replace(FILLER, '').replace(/[^a-z0-9]/g, '');

/* ── Directories and review sites ───────────────────────────────────────────────────────────
   A directory is where a customer FINDS or CHECKS a business, not a business competing for the job.
   Matched by the host of a cited source, or by name in the answer text. gov.uk / HSE guidance pages
   are not listings, so they are not here. UK, Ireland and Australia are covered. */
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
  { name: 'ICAEW', host: /(^|\.)icaew\.com$/, text: /\bicaew\b/i },
  { name: 'ACCA', host: /(^|\.)accaglobal\.com$/, text: /\bACCA\b/ },
  { name: 'AAT', host: /(^|\.)aat\.org\.uk$/, text: /\bAAT\b/ },
  { name: 'Unbiased', host: /(^|\.)unbiased\.co\.uk$/, text: /\bunbiased\b/i },
  { name: 'VouchedFor', host: /(^|\.)vouchedfor\.co\.uk$/, text: /\bvouchedfor\b/i },
  { name: 'Chartered Accountants Ireland', host: /(^|\.)charteredaccountants\.ie$/, text: /\bchartered accountants ireland\b/i },
  { name: 'CPA Australia', host: /(^|\.)cpaaustralia\.com\.au$/, text: /\bcpa australia\b/i },
  { name: 'Golden Pages', host: /(^|\.)goldenpages\.ie$/, text: /\bgolden pages\b/i },
  { name: 'Yellow Pages', host: /(^|\.)yellowpages\.com\.au$/, text: /\byellow pages\b/i },
  { name: 'hipages', host: /(^|\.)hipages\.com\.au$/, text: /\bhipages\b/i },
  { name: 'Oneflare', host: /(^|\.)oneflare\.com\.au$/, text: /\boneflare\b/i },
  { name: 'TrueLocal', host: /(^|\.)truelocal\.com\.au$/, text: /\btruelocal\b/i },
  { name: 'ServiceSeeking', host: /(^|\.)serviceseeking\.com\.au$/, text: /\bserviceseeking\b/i },
  { name: 'Google reviews', host: /(^|\.)(maps\.google\.[a-z.]+|g\.page|business\.google\.com)$|^google\.[a-z.]+$/, text: /\bgoogle (reviews?|maps|business profile)\b/i },
  { name: 'Thomson Local', host: /(^|\.)thomsonlocal\.com$/, text: /\bthomson local\b/i },
  { name: 'Cylex', host: /(^|\.)cylex(-uk)?\.co\.uk$/ },
  { name: 'Scoot', host: /(^|\.)scoot\.co\.uk$/ },
  { name: 'Hotfrog', host: /(^|\.)hotfrog\.(co\.uk|com|com\.au|ie)$/ },
  { name: 'Nextdoor', host: /(^|\.)nextdoor\.(co\.uk|com)$/ },
  { name: 'Houzz', host: /(^|\.)houzz\.(co\.uk|com)$/ },
  { name: 'Trade Facilities / Find a Tradesman', host: /(^|\.)(findatradesman\.co\.uk|tradesman\.com)$/ },
];
/** Names that are a directory, not a business — dropped from the competitor lists. */
const DIRECTORY_NAME = /^(checkatrade|trust ?a ?trader|yell|mybuilder|bark|rated ?people|trustpilot|which\??( trusted traders)?|freeindex|trustmark|gas safe( register)?|niceic|icaew|acca|aat|unbiased|vouchedfor|golden pages|yellow pages|hipages|oneflare|truelocal|serviceseeking|google( reviews| maps| business profile)?|thomson local|cylex|scoot|hotfrog|nextdoor|houzz|facebook|instagram|reddit|quora|trustedtraders)\b/i;
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
    if (/\.gov\.[a-z]{2}$|\.gov$/.test(h)) continue;
    if (ctx.isDirectoryHost?.(h) || /(^|[.-])(directory|listings?|reviews?)([.-]|$)/.test(h)) found.add(prettyHost(h));
  }
  return [...found];
}

/* ── Places: specific (borough / town / district) or wide (whole city, region, country) ──────────────── */

const WIDE_PLACES = new Set([
  // countries and big regions (UK, Ireland, Australia)
  'uk', 'u.k.', 'united kingdom', 'great britain', 'britain', 'england', 'scotland', 'wales', 'northern ireland', 'ireland', 'republic of ireland', 'eire',
  'australia', 'new south wales', 'nsw', 'victoria', 'queensland', 'tasmania', 'western australia', 'south australia', 'northern territory',
  'east anglia', 'midlands', 'west midlands', 'east midlands', 'north west', 'north east', 'south east', 'south west', 'yorkshire', 'the north', 'the south',
  'greater london', 'greater manchester', 'merseyside', 'tyne and wear', 'cornwall', 'devon', 'dorset', 'somerset', 'essex', 'kent', 'surrey', 'sussex',
  'norfolk', 'suffolk', 'cumbria', 'rutland', 'middlesex', 'cheshire', 'durham', 'northumberland',
  // cities
  'london', 'birmingham', 'manchester', 'leeds', 'liverpool', 'sheffield', 'bristol', 'newcastle', 'nottingham', 'leicester', 'coventry', 'bradford',
  'cardiff', 'swansea', 'belfast', 'glasgow', 'edinburgh', 'aberdeen', 'dundee', 'plymouth', 'southampton', 'portsmouth', 'brighton', 'oxford',
  'cambridge', 'norwich', 'exeter', 'york', 'bath', 'canterbury', 'peterborough', 'lincoln', 'derby', 'stoke-on-trent', 'wolverhampton', 'sunderland',
  'hull', 'kingston upon hull', 'preston', 'worcester', 'gloucester', 'chester', 'carlisle', 'lancaster', 'salford', 'wakefield', 'chelmsford',
  'colchester', 'ipswich', 'truro', 'winchester', 'salisbury', 'wells', 'ely', 'lichfield', 'hereford', 'ripon', 'st albans', 'inverness', 'stirling',
  'armagh', 'derry', 'londonderry', 'lisburn', 'newry', 'dublin', 'cork', 'galway', 'limerick', 'waterford', 'kilkenny', 'sydney', 'melbourne', 'brisbane',
  'perth', 'adelaide', 'canberra', 'hobart', 'darwin', 'gold coast', 'wollongong', 'geelong', 'townsville', 'cairns',
]);
const DIRECTION = /^(north|south|east|west|north[- ]?east|north[- ]?west|south[- ]?east|south[- ]?west|central|greater|inner|outer|upper|lower)\s+(.+)$/i;

/** A whole city, region or country ("London", "East London", "Yorkshire", "Ireland"), as opposed to a borough or town. */
export function isWidePlace(area: string | null | undefined): boolean {
  if (!area) return false;
  const a = area.trim().toLowerCase().replace(/[.,]+$/, '');
  const county = (x: string) => /^[a-z]+shire$/.test(x);
  if (WIDE_PLACES.has(a) || county(a)) return true;
  const m = a.match(DIRECTION);
  if (m && (WIDE_PLACES.has(m[2]) || county(m[2]))) return true;
  return false;
}

const AREA_RE = /\b([Ii]n|[Nn]ear|[Aa]cross|[Aa]round)\s+(?:the\s+)?([A-Z][\w'’.-]*(?:\s+(?:upon|on|under|le|de|of|and)\s+[A-Z][\w'’.-]*|\s+[A-Z][\w'’.-]*){0,3})/;
/** The place a search names and how it names it ("in Bow" / "across Fenland"), or null when it names none. */
export function areaInfo(question: string): { area: string; prep: string } | null {
  const m = question.match(AREA_RE);
  if (!m) return null;
  const area = m[2].replace(/[.,?!]+$/, '').trim();
  return area ? { area, prep: m[1].toLowerCase() } : null;
}
/** "boiler service in Bow" -> "Bow"; "Accountants for small businesses across Fenland?" -> "Fenland". */
export function areaOf(question: string): string | null { return areaInfo(question)?.area ?? null; }

/* ── WHOLE BIG AREA, for the winnable rule only (Paul, 2026-11-14) ───────────────────────────────────────────
   Narrower than isWidePlace: a BIG city, a region, a county or a country — where AI picks from thousands of firms.
   A compass quarter of a city ("East London") and a smaller city (Canterbury, Bath) are local for this rule. */
const BIG_CITIES = new Set([
  'london', 'birmingham', 'manchester', 'leeds', 'liverpool', 'sheffield', 'bristol', 'glasgow', 'edinburgh', 'cardiff', 'belfast',
  'newcastle', 'nottingham', 'leicester', 'coventry', 'bradford', 'dublin', 'sydney', 'melbourne', 'brisbane', 'perth', 'adelaide',
]);
const REGIONS_AND_COUNTRIES = new Set([
  'uk', 'u.k.', 'united kingdom', 'great britain', 'britain', 'england', 'scotland', 'wales', 'northern ireland', 'ireland', 'republic of ireland', 'eire',
  'australia', 'new south wales', 'nsw', 'victoria', 'queensland', 'tasmania', 'western australia', 'south australia', 'northern territory',
  'east anglia', 'midlands', 'west midlands', 'east midlands', 'north west', 'north east', 'south east', 'south west', 'yorkshire', 'the north', 'the south',
  'greater london', 'greater manchester', 'merseyside', 'tyne and wear', 'cornwall', 'devon', 'dorset', 'somerset', 'essex', 'kent', 'surrey', 'sussex',
  'norfolk', 'suffolk', 'cumbria', 'rutland', 'middlesex', 'cheshire', 'durham', 'northumberland',
]);
export function isBigArea(area: string | null | undefined): boolean {
  if (!area) return false;
  const a = area.trim().toLowerCase().replace(/[.,]+$/, '');
  return BIG_CITIES.has(a) || REGIONS_AND_COUNTRIES.has(a) || /^[a-z]+shire$/.test(a) || /^greater\s+/.test(a);
}
/** Does this search ask about a whole big city, region or country ("best plumber in London")? */
export function isBigAreaSearch(question: string): boolean { return isBigArea(areaInfo(question)?.area); }

/** 'specific' (borough/town/district), 'wide' (whole city, region, country, or "across …") or 'none'. */
export function placeScope(question: string): 'specific' | 'wide' | 'none' {
  const i = areaInfo(question);
  if (!i) return 'none';
  return i.prep === 'across' || isWidePlace(i.area) ? 'wide' : 'specific';
}
/** Kept for older callers: a named patch rather than a whole city / region. */
export const isLocalArea = (area: string | null): boolean => !!area && !isWidePlace(area);

/** Is this search's area one of the places they work? A search with no area, or no known work areas, counts as theirs. */
export function inTheirArea(area: string | null, areas: string[] | undefined): boolean {
  if (!area || !areas) return true;
  const a = area.toLowerCase();
  const mine = areas.map((x) => x.toLowerCase());
  return mine.some((m) => m === a || m.includes(a) || a.includes(m));
}

/* ── Ambiguous places ("Stratford" = Stratford-upon-Avon or Stratford E15?) ──────────────────────────────
   Detected from the stored answers: firm names, cited sites or answer text that say "<place>-upon-…" (or on / under /
   le / next / by …). Evidence only, so a place is flagged because AI actually answered for another place with its name. */
export function placeMixup(area: string | null, firmNames: string[], hosts: string[], texts: string[], minHits = 2): boolean {
  if (!area) return false;
  const a = area.replace(/[^A-Za-z]/g, '');
  if (a.length < 3) return false;
  const base = a.charAt(0).toUpperCase() + a.slice(1);
  /* "<Place> upon/under/le/next/cum <Name>" with a capital name, or "<Place> on <River/Sea/Hill…>". */
  const proper = new RegExp(base + '[\\s-]+(upon|under|le|next|cum)[\\s-]+[A-Z][a-z]{2,}|' + base + '[\\s-]+on[\\s-]+(Thames|Sea|Tees|Trent|Soar|Wye|Avon|Severn|Tyne|Dee|Mersey|Humber|Stour|Cam|Hill|Weald|Wolds|Forest)', 'i');
  const hostRe = new RegExp(a.toLowerCase() + '[\\s-]?(upon|under)[\\s-]?[a-z]{3,}');
  const flat = (s: string) => s.replace(/[^A-Za-z\s-]/g, ' ');
  let hits = 0;
  for (const n of firmNames) if (proper.test(flat(n))) hits++;
  for (const h of hosts) if (hostRe.test(h.replace(/\./g, ' '))) hits++;
  for (const t of texts) if (proper.test(flat(t).slice(0, 4000))) hits++;
  return hits >= minHits;
}

export { isClashingPlace, askPlace } from './placeAsk.ts';

/* ── Heads of searches (the customer's own words) and service phrases ──────────────────────────────────── */

const WH = /^(how|what|when|why|which|should|can|could|do|does|did|is|are|will|would|where|whats)\b/i;
const JUNK_HEAD = new Set(['way', 'ways', 'option', 'options', 'tip', 'tips', 'advice', 'cost', 'price', 'prices', 'thing', 'things', 'one', 'someone', 'anyone']);
/** "best accountants in Chatteris" -> "accountant"; informational searches ("how do I choose…") -> null. */
export function headOf(question: string): string | null {
  let s = question.trim().replace(/[?!.]+$/, '').trim();
  const who = /^who is the (best|top|cheapest|most recommended)\s+/i;
  if (!who.test(s) && WH.test(s)) return null;
  s = s.replace(who, '').replace(/^(best|top|recommended|local|cheap|cheapest|affordable|emergency|24[ -]hour|24\/7|good|reliable|trusted)\s+/i, '');
  const cut = s.search(/\s+(in|near|across|around|for|with|to|that|who|from)\s+/i);
  let head = (cut >= 0 ? s.slice(0, cut) : s).trim();
  head = head.replace(/\s+(in|near|across|around)$/i, '').trim();
  if (!head || head.length > 40) return null;
  const words = head.split(/\s+/);
  if (words.length === 1 && JUNK_HEAD.has(words[0].toLowerCase())) return null;
  return lowerCase(singular(head));
}
/** Customer words in lower case, acronyms kept ("EICR certificate", "accountant"). */
function lowerCase(h: string): string { return h.split(/\s+/).map((w) => (/^[A-Z0-9]{2,}$/.test(w) ? w : w.toLowerCase())).join(' '); }
function singular(h: string): string {
  const w = h.split(/\s+/);
  const last = w[w.length - 1];
  let s = last;
  if (/^[A-Z0-9]+$/.test(last)) s = last;
  else if (/ies$/i.test(last) && last.length > 4) s = last.slice(0, -3) + 'y';
  else if (/[^s]s$/i.test(last) && !/(us|is|ss)$/i.test(last)) s = last.slice(0, -1);
  w[w.length - 1] = s;
  return w.join(' ');
}
/** "a" / "an" for a head: acronyms by their spoken first letter (an EICR, a PAT), words by their first vowel. */
export function articleFor(head: string): string {
  const first = head.trim().split(/\s+/)[0];
  if (/^[A-Z0-9]{2,}$/.test(first)) return /^[AEFHILMNORSX]/.test(first) ? 'an' : 'a';
  return /^[aeiou]/i.test(first) ? 'an' : 'a';
}
const stem = (t: string): string => t.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5);
const DOC_NOUN = /^(certificates?|certification|certifications|assessments?|inspections?|testing|tests?|reports?|surveys?|compliance|checks?|safety)$/i;
const GENERIC_BIZ = new Set(['servic', 'compa', 'group', 'solut', 'exper', 'speci', 'uk', 'the', 'and', 'of', 'best', 'top', 'local', 'near', 'me', 'pro', 'profe', 'certi', 'regis', 'appro', 'emerg', 'cheap', 'affor', 'ltd', 'limit', 'llp', 'plc', 'associ']);

/** Words the business's own searches and services use (stems), so a bare service phrase can be spotted. */
export function buildVocab(questions: string[], services: string[] = [], extra: string[] = []): Set<string> {
  const v = new Set<string>();
  for (const e of extra) for (const t of e.split(/s+/)) if (t.length > 2) v.add(stem(t));
  for (const q of questions) {
    const h = headOf(q);
    for (const t of (h ?? '').split(/\s+/)) if (t.length > 2) v.add(stem(t));
    const a = areaInfo(q)?.area;
    for (const t of (a ?? '').split(/\s+/)) if (t.length > 2) v.add(stem(t));
  }
  for (const s of services) for (const t of s.split(/\s+/)) if (t.length > 2) v.add(stem(t));
  return v;
}
/** A name made only of the searched service and place words AND ending in a document or service noun ("Landlord Certificate
 *  London", "Gas Safety Certificates") is a phrase, not a business. Trade-person names ("Hackney Plumbers", "East End
 *  Plumbers") are kept: AI names them as businesses. A name with a legal suffix (Ltd, Limited, LLP, PLC) is always kept. */
export function isServicePhrase(name: string, vocab: Set<string> | undefined): boolean {
  if (!vocab || !vocab.size) return false;
  const n = name.trim();
  if (/\b(ltd|limited|llp|plc|inc)\.?$/i.test(n)) return false;
  const tokens = n.toLowerCase().replace(/[&]/g, ' and ').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (!tokens.length || tokens.length > 4) return false;
  if (!tokens.some((t) => DOC_NOUN.test(t))) return false;
  return tokens.every((t) => t.length <= 2 || GENERIC_BIZ.has(stem(t)) || vocab.has(stem(t)) || DOC_NOUN.test(t));
}

/* ── Is it a service on their website? ──────────────────────────────────────────────────────────────── */

const TOPICS: { test: RegExp; needs: RegExp; label: string; pageKey: RegExp; confirm?: RegExp; confirmNote?: string }[] = [
  { test: /\beicr\b/, needs: /eicr|electrical/, label: 'EICR certificates', pageKey: /eicr/ },
  { test: /consumer unit/, needs: /electric/, label: 'consumer unit replacement', pageKey: /consumer|electric/ },
  { test: /electrician/, needs: /electric/, label: 'electrician work', pageKey: /electric/ },
  { test: /\bpat\b/, needs: /pat testing/, label: 'PAT testing', pageKey: /pat/ },
  { test: /gas safety/, needs: /gas safety/, label: 'gas safety certificates', pageKey: /gas.?safety/ },
  { test: /landlord certificate/, needs: /landlord certificate/, label: 'landlord certificates', pageKey: /landlord/ },
  { test: /gas engineer/, needs: /gas/, label: 'gas engineer work', pageKey: /gas/ },
  { test: /boiler install/, needs: /boiler|gas and heating/, label: 'boiler installation', pageKey: /install/, confirm: /install/, confirmNote: 'Not listed on your website yet.' },
  { test: /boiler repair/, needs: /boiler|gas and heating/, label: 'boiler repair', pageKey: /repair/ },
  { test: /boiler/, needs: /boiler|gas and heating/, label: 'boiler servicing', pageKey: /boiler/ },
  { test: /handyman/, needs: /maintenance/, label: 'handyman work', pageKey: /handyman/, confirm: /handyman/, confirmNote: 'Not listed on your website yet.' },
  { test: /plumb/, needs: /plumb/, label: 'plumbing', pageKey: /plumb/ },
  { test: /maintenance/, needs: /maintenance/, label: 'property maintenance', pageKey: /maintenance/ },
];

function topicFor(question: string): (typeof TOPICS)[number] | null {
  const q = question.toLowerCase();
  if (/block management/.test(q)) return null; // a different customer from the ones the site speaks to
  return TOPICS.find((t) => t.test.test(q)) ?? null;
}

/** Does their website show the service this search is about? Known trade topics use their synonyms; any other
 *  search needs every word of its head ("accountant", "leak detection") to appear on the site. No site text = yes. */
function serviceCheck(question: string, ctx: OppContext): { offered: boolean; confirmNote: string | null; label: string | null; hasPage: boolean | null } {
  const topic = topicFor(question);
  const head = headOf(question);
  const label = topic?.label ?? head;
  const site = (ctx.siteText ?? '').toLowerCase();
  if (ctx.siteText == null) return { offered: true, confirmNote: null, label, hasPage: null };
  if (topic) {
    const offered = topic.needs.test(site);
    const pages = (ctx.pageUrls ?? []).join(' ').toLowerCase();
    const hasPage = ctx.services.some((s) => topic.pageKey.test(s.name.toLowerCase()) && s.dedicated) || (topic.label === 'EICR certificates' && /eicr/.test(pages));
    return { offered, confirmNote: offered && topic.confirm && !topic.confirm.test(site) ? (topic.confirmNote ?? null) : null, label, hasPage };
  }
  if (!head) return { offered: true, confirmNote: null, label, hasPage: null };
  const toks = head.toLowerCase().split(/\s+/).filter((t) => t.length > 2 && !GENERIC_BIZ.has(stem(t)));
  const offered = toks.length > 0 && toks.every((t) => site.includes(stem(t)));
  const hasPage = ctx.services.some((s) => toks.every((t) => s.name.toLowerCase().includes(stem(t))) && s.dedicated);
  return { offered, confirmNote: null, label, hasPage };
}

function intentOf(question: string): OppQuestion['intent'] {
  const q = question.toLowerCase();
  if (/\bbest\b/.test(q)) return 'best';
  if (/\bemergency\b/.test(q)) return 'emergency';
  return null;
}

/** One search's counts, group and proof line. `rows` are every queue row (any run) for it. */
export function oppQuestion(question: string, rows: OppRow[], ctx: OppContext): OppQuestion {
  const own = rows.filter((r) => r.question.trim() === question.trim());
  const counts = new Map<string, number>();
  const variants = new Map<string, Map<string, number>>();
  const dirCounts = new Map<string, number>();
  const per = { chatgpt: [0, 0], gemini: [0, 0] } as Record<(typeof ENGINES)[number], [number, number]>;
  const texts: string[] = [];
  const dropped = new Set<string>();
  const vocab = ctx.vocab ?? buildVocab([question], ctx.services.map((s) => s.name), [ctx.town ?? '']);
  const info = areaInfo(question);
  const area = info?.area ?? null;
  let answers = 0, empty = 0, namedYou = 0;
  const eng: Record<(typeof ENGINES)[number], { answers: number; named: number; counts: Map<string, number>; names: Map<string, string>; snippet: string | null }> = {
    chatgpt: { answers: 0, named: 0, counts: new Map(), names: new Map(), snippet: null },
    gemini: { answers: 0, named: 0, counts: new Map(), names: new Map(), snippet: null },
  };
  let aioShown = false, aioNamed = false; const aioFirms = new Set<string>(); let aioSnippet: string | null = null;

  /* THE WRONG PLACE, ANSWER BY ANSWER (Paul, 2026-11-11). An answer that is about another place with the same name
     ("Stratford-upon-Avon" for "Stratford") is left out; the search itself is left out only when HALF OR MORE of its
     answers are for the wrong place. A search AI answered for the right place is never left out. */
  const cells: { e: (typeof ENGINES)[number]; cell: Cell; wrong: boolean }[] = [];
  for (const row of own) for (const e of ENGINES) {
    const cell = (row.result ?? {})[e] as Cell | undefined;
    if (!cell || typeof cell !== 'object') continue;
    const names = (cell.competitors ?? []).filter((n): n is string => typeof n === 'string');
    const hosts = (cell.citations ?? []).map((c) => hostOf(c.url)).filter(Boolean);
    const wrong = !!area && placeMixup(area, names, hosts, cell.answer_text ? [String(cell.answer_text)] : [], 1);
    cells.push({ e, cell, wrong });
  }
  const wrongPlace = cells.filter((c) => c.wrong).length;
  const mixup = cells.length > 0 && wrongPlace * 2 >= cells.length;
  const cites = new Set<string>();
  for (const { e, cell } of cells.filter((c) => !c.wrong)) {
    answers++; per[e][1]++;
    if (namedOf(ctx)(cell)) { namedYou++; per[e][0]++; }
    const firms = rivalsOf(cell, ctx, vocab, dropped);
    if (!firms.length) empty++;
    const ef = eng[e];
    ef.answers++; if (namedOf(ctx)(cell)) ef.named++;
    for (const f of firms) { const k = firmKey(f); if (k) { ef.counts.set(k, (ef.counts.get(k) ?? 0) + 1); if (!ef.names.has(k)) ef.names.set(k, f.trim()); } }
    if (!ef.snippet) ef.snippet = snippetOf(cell.answer_text);
    for (const k of new Set(firms.map(firmKey))) if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
    for (const f of firms) { const k = firmKey(f); if (k) { const m = variants.get(k) ?? new Map<string, number>(); m.set(f.trim(), (m.get(f.trim()) ?? 0) + 1); variants.set(k, m); } }
    for (const d of directoriesInAnswer(cell, ctx)) dirCounts.set(d, (dirCounts.get(d) ?? 0) + 1);
    for (const c of cell.citations ?? []) { const h = hostOf(c.url); if (h) cites.add(h); }
    if (cell.answer_text) texts.push(String(cell.answer_text));
  }
  for (const row of own) {
    const ao = (row.result ?? {}).ai_overview as Cell | undefined;
    if (ao && typeof ao === 'object' && String(ao.answer_text ?? '').trim()) {
      aioShown = true;
      if (namedOf(ctx)(ao)) aioNamed = true;
      for (const f of rivalsOf(ao, ctx, vocab)) aioFirms.add(f.trim());
      if (!aioSnippet) aioSnippet = snippetOf(ao.answer_text);
    }
  }
  const display = new Map<string, string>();
  for (const [k, m] of variants) display.set(k, [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0]);
  const firms: OppFirm[] = [...counts.entries()].map(([k, count]) => ({ name: display.get(k) ?? k, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const top = firms[0]?.count ?? 0;
  const distinct = firms.length;
  const named = answers - empty;
  const scope = placeScope(question);
  const svc = serviceCheck(question, ctx);
  const serviceOnSite = svc.offered && !svc.confirmNote;
  const areaOk = inTheirArea(area, ctx.areas);
  const intent = intentOf(question);
  const clientSaidNo = (ctx.notOffered ?? []).some((n) => { const t = n.toLowerCase().split(/\s+/).filter((w) => w.length > 2).map(stem); return t.length > 0 && t.every((w) => question.toLowerCase().includes(w)); });

  /* THE ROOM RULE (Paul, 2026-11-11). The goal is to be NAMED by AI (one of the firms listed), not to be first.
     "Regulars" = firms named in at least half of this search's answers. "Repeat share" = the share of every firm
     mention that the regulars make. Thresholds from the real LDM and ABLM data (docs/reports.md): a closed list
     (the same few firms in most answers) sits at 0.6 and above; a rotating list under 0.3. */
  const regulars = firms.filter((f) => f.count * 2 >= answers);
  const mentions = firms.reduce((n, f) => n + f.count, 0);
  const repeatShare = mentions ? regulars.reduce((n, f) => n + f.count, 0) / mentions : 0;
  const keep = answers > 0 && namedYou * 2 >= answers;
  const nofirms = answers > 0 && empty * 2 > answers;
  const closed = repeatShare >= ROOM_LITTLE_AT || (top * 6 >= answers * 5 && repeatShare >= ROOM_LITTLE_TOP_ALL);
  const roomy = repeatShare < ROOM_SOME_AT;
  let tier: OppTier;
  if (answers === 0 || mixup) tier = 'flagged';
  else if (keep) tier = 'named';
  else if (clientSaidNo) tier = 'notoffered';
  else if (!serviceOnSite) tier = 'notonsite';
  else if (nofirms) tier = 'nofirms';
  else if (closed) tier = 'little';
  else if (roomy && scope === 'specific' && areaOk) tier = 'lots';
  else tier = 'some'; // a rotating list capped at "some room" when the search covers a whole city, region or country, or no place

  const proof = `${named} answers named ${distinct} different firms`;
  let why: string;
  if (answers === 0) why = 'Not answered yet';
  else if (mixup) why = `AI answers for another ${area}`;
  else if (tier === 'named') why = `AI names you in ${namedYou} of ${answers} answers`;
  else if (tier === 'notoffered') why = 'You told us you do not offer this';
  else if (tier === 'notonsite') why = 'Not on your site yet: add a page if you offer this';
  else if (tier === 'nofirms') why = named === 0 ? `AI named no firm in any of the ${answers} answers` : `Only ${named} of ${answers} answers name a firm`;
  else if (tier === 'little') why = `${proof}; the same ${regulars.length} come up in most`;
  else if (tier === 'some') why = regulars.length ? `${proof}; ${regulars.length} come up in most` : `${proof}${scope === 'specific' ? '' : '. Whole-area search'}`;
  else why = proof;

  const reasons = [why];
  const dirs = [...dirCounts.entries()].map(([name, n]) => ({ name, answers: n })).sort((a, b) => b.answers - a.answers || a.name.localeCompare(b.name));
  if (dirs.length >= 2) reasons.push(`Answers lean on directories and review sites (${dirs.slice(0, 3).map((d) => d.name).join(', ')}).`);

  const label = svc.label;
  let help = '';
  if (svc.offered && label) {
    const art = articleFor(label);
    const where = area ? ` for ${area}` : '';
    help = `${svc.hasPage ? (art === 'an' ? 'An' : 'A') : 'A new'} ${label} page${where}, plus Google reviews.`;
  }

  return {
    question, tier, easy: false, why, answers, empty, named, distinct, top, firms: firms.slice(0, 5), namedYou,
    chatgptNamed: per.chatgpt[0], chatgptAnswers: per.chatgpt[1], geminiNamed: per.gemini[0], geminiAnswers: per.gemini[1],
    area, scope, service: svc.offered ? label : null, hasPage: svc.hasPage, reasons, help, intent, dirs, droppedPhrases: [...dropped],
    regulars: regulars.length, repeatShare: Math.round(repeatShare * 100) / 100, wrongPlace,
    engines: {
      chatgpt: engineFacts(eng.chatgpt), gemini: engineFacts(eng.gemini),
    },
    overview: { shown: aioShown, named: aioNamed, firms: [...aioFirms].slice(0, 5), snippet: aioSnippet },
  };
}

function engineFacts(e: { answers: number; named: number; counts: Map<string, number>; names: Map<string, string>; snippet: string | null }): EngineFacts {
  const firms = [...e.counts.entries()].map(([k, count]) => ({ name: e.names.get(k) ?? k, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 5);
  return { answers: e.answers, named: e.named, firms, snippet: e.snippet };
}

/** Competitor names from one answer: real businesses only. A directory, review site or service phrase is NEVER a competitor. */
function rivalsOf(cell: Cell, ctx: Pick<OppContext, 'isRival'>, vocab?: Set<string>, dropped?: Set<string>): string[] {
  const out: string[] = [];
  for (const c of cell.competitors ?? []) {
    if (typeof c !== 'string' || !c.trim() || isDirectoryName(c)) continue;
    if (ctx.isRival && !ctx.isRival(c)) continue;
    if (isServicePhrase(c, vocab)) { dropped?.add(c.trim()); continue; }
    out.push(c);
  }
  return out;
}

export interface OppSummary {
  questions: OppQuestion[];
  /** Counts by group. `flagged` (ambiguous place) searches are left out of every count; `notoffered` (a service not on
   *  their website) are left out of the room counts and the targets. */
  lots: number; some: number; little: number; nofirms: number; named: number; flagged: number; notoffered: number; notonsite: number;
  /** Searches the room counts are over: lots + some + little + nofirms + named. */
  room: number;
  /** Kept for older callers. */
  easy: number;
  /** Answers across the searches that count (flagged searches left out). */
  answers: number;
  /** Audit-wide: how many answers named each business, most first. */
  rivals: OppFirm[];
  /** Directories and review sites, ranked by how many answers cite or name them. */
  directories: OppDirectory[];
  /** The best targets, ranked: lots of room first, then some room, then already named. */
  best: OppQuestion[];
}

/** Directories across a set of searches: answers that name or cite each, and how many searches it shows up in. */
export function directoriesAcross(qs: OppQuestion[]): OppDirectory[] {
  const m = new Map<string, { answers: number; questions: number }>();
  for (const q of qs) for (const d of q.dirs) {
    const cur = m.get(d.name) ?? { answers: 0, questions: 0 };
    cur.answers += d.answers; cur.questions += 1; m.set(d.name, cur);
  }
  return [...m.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.answers - a.answers || b.questions - a.questions || a.name.localeCompare(b.name));
}

/** Ranking for the targets: lots of room first, then some room; within a group the least repeated list, a specific place and the
 *  most answers naming firms first. Deterministic. */
export function bestScore(q: OppQuestion): number {
  const fresh = (1 - q.repeatShare) * 100;
  const base = q.tier === 'lots' ? 1000 : q.tier === 'some' ? 500 : q.tier === 'named' ? 200 : q.tier === 'little' ? 100 : q.tier === 'nofirms' ? 50 : 0;
  return base + fresh + (q.scope === 'specific' ? 20 : 0) + q.named;
}

/** Builds the summary of every search: groups, counts, rivals, directories and the ranked targets. */
export function summariseOpportunity(rows: OppRow[], ctx: OppContext, bestCount = 10): OppSummary {
  const qs = [...new Set(rows.map((r) => r.question.trim()))];
  const vocab = ctx.vocab ?? buildVocab(qs, ctx.services.map((s) => s.name), [ctx.town ?? '']);
  const c2: OppContext = { ...ctx, vocab };
  const questions = qs.map((q) => oppQuestion(q, rows, c2)).sort((a, b) => a.question.localeCompare(b.question));
  const counted = new Set(questions.filter((q) => q.tier !== 'flagged').map((q) => q.question));
  const counts = new Map<string, number>(); const variants = new Map<string, Map<string, number>>();
  let answers = 0;
  for (const row of rows) {
    if (!counted.has(row.question.trim())) continue;
    for (const e of ENGINES) {
      const cell = (row.result ?? {})[e] as Cell | undefined;
      if (!cell || typeof cell !== 'object') continue;
      answers++;
      const firms = rivalsOf(cell, c2, vocab);
      for (const k of new Set(firms.map(firmKey))) if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
      for (const f of firms) { const k = firmKey(f); if (k) { const m = variants.get(k) ?? new Map<string, number>(); m.set(f.trim(), (m.get(f.trim()) ?? 0) + 1); variants.set(k, m); } }
    }
  }
  const display = new Map<string, string>();
  for (const [k, m] of variants) display.set(k, [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0]);
  const rivals = [...counts.entries()].map(([k, count]) => ({ name: display.get(k) ?? k, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const live = questions.filter((q) => q.tier !== 'flagged');
  const best = live.filter((q) => q.tier === 'lots' || q.tier === 'some' || q.tier === 'named').sort((a, b) => bestScore(b) - bestScore(a) || a.question.localeCompare(b.question)).slice(0, bestCount);
  const n = (t: OppTier) => questions.filter((q) => q.tier === t).length;
  return {
    questions, answers, rivals, best, directories: directoriesAcross(live.filter((q) => q.tier !== 'notoffered' && q.tier !== 'notonsite')),
    lots: n('lots'), some: n('some'), little: n('little'), nofirms: n('nofirms'), named: n('named'), flagged: n('flagged'), notoffered: n('notoffered'), notonsite: n('notonsite'),
    room: n('lots') + n('some') + n('little') + n('nofirms') + n('named'), easy: 0,
  };
}

/** The hook report's view of a few searches: ONE answer per AI (the first stored row for each search), who each named,
 *  and the businesses named across them. Pure; counts only. */
export function hookFromRows(rows: OppRow[], questions: string[], ctx: Pick<OppContext, "isNamed" | "isRival" | "vocab" | "town"> = {}): { questions: { question: string; answers: { engine: string; namedYou: boolean; rivals: string[] }[] }[]; rivals: OppFirm[] } {
  const label: Record<string, string> = { chatgpt: 'ChatGPT', gemini: 'Gemini' };
  const counts = new Map<string, number>(); const display = new Map<string, string>();
  const vocab = ctx.vocab ?? buildVocab(questions, [], [(ctx as { town?: string }).town ?? '']);
  const out = questions.map((question) => {
    const row = rows.find((r) => r.question.trim() === question.trim());
    const answers = ENGINES.flatMap((e) => {
      const cell = (row?.result ?? {})[e] as Cell | undefined;
      if (!cell || typeof cell !== 'object') return [];
      const rivals = rivalsOf(cell, ctx, vocab);
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
 *  (…/eicr/camden-town), and — for a Discovery or a baseline cut from one — every area the searches ask about,
 *  because those searches are generated around the business's own patch. Pure. */
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
export type RuleVerdictLabel = 'named' | 'open' | 'contested' | 'locked' | 'no_local_race' | 'unmeasured';
export interface RuleVerdict {
  verdict: RuleVerdictLabel;
  tier: OppTier;
  easy: boolean;
  /** One plain sentence of evidence, from the counts. */
  reason: string;
  /** The businesses named, most first (real businesses only, never directories or service phrases). */
  namedFirms: string[];
  clientNamed: boolean;
  q: OppQuestion;
}

/** THE one rule for one search across all its runs: Lots of room -> 'open', Some room -> 'contested',
 *  Little room -> 'locked', "AI doesn't name firms yet" -> 'no_local_race' (generic advice: the Q&A-page case),
 *  a place left out -> 'unmeasured'. A client named in more than half the runs is 'named'; one run alone never
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
  else if (q.tier === 'flagged' || q.tier === 'notoffered' || q.tier === 'notonsite') verdict = 'unmeasured';
  else if (q.tier === 'lots') verdict = 'open';
  else if (q.tier === 'nofirms') verdict = 'no_local_race';
  else if (q.tier === 'little') verdict = 'locked';
  else verdict = 'contested';
  return { verdict, tier: q.tier, easy: false, reason: q.why, namedFirms: q.firms.map((f) => f.name), clientNamed, q };
}

/* ── What customers actually search for (2026-11-11, Paul) ───────────────────────────────────────────────
   The headline uses the words a customer types ("a plumber or electrician in East London"), taken from the heads of the
   searches asked about the business's own services (any trade, any country), and NEVER a trade label. */

/** { what: "a plumber or electrician", where: "East London" } from the searches asked. Pure. */
export function searchPhrase(questions: string[], town: string): { what: string; where: string } {
  const counts = new Map<string, { n: number; first: number; text: string }>();
  questions.forEach((q, i) => {
    const h = headOf(q);
    if (!h) return;
    const key = h.toLowerCase();
    const cur = counts.get(key);
    if (cur) cur.n++; else counts.set(key, { n: 1, first: i, text: h });
  });
  const ranked = [...counts.values()].sort((a, b) => b.n - a.n || a.first - b.first).slice(0, 2);
  let what = 'a business like yours';
  if (ranked.length === 1) what = `${articleFor(ranked[0].text)} ${ranked[0].text}`;
  else if (ranked.length === 2) what = `${articleFor(ranked[0].text)} ${ranked[0].text} or ${ranked[1].text}`;
  // The widest named region the searches use ("East London"), else the audit's own town, else the commonest place.
  const regions = new Map<string, number>(); const places = new Map<string, number>();
  for (const q of questions) {
    const i = areaInfo(q);
    if (!i) continue;
    places.set(i.area, (places.get(i.area) ?? 0) + 1);
    if (DIRECTION.test(i.area) && isWidePlace(i.area)) regions.set(i.area, (regions.get(i.area) ?? 0) + 1);
  }
  const region = [...regions.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  const commonest = [...places.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  return { what, where: region ?? (town || commonest || 'your area') };
}

/** The AI score's raw counts, from the stored answers only: over the searches that count (flagged ones are left out),
 *  the answers that named any business (a firm, or the business itself), how many of those named this business,
 *  and how many answers named each firm. Never reads a stored summary or mention rate. */
export function scoreAnswers(rows: OppRow[], ctx: OppContext, counted?: Set<string>): { answers: number; denominator: number; named: number; firms: OppFirm[] } {
  const qs = [...new Set(rows.map((r) => r.question.trim()))];
  const vocab = ctx.vocab ?? buildVocab(qs, ctx.services.map((s) => s.name), [ctx.town ?? '']);
  const isNamed = namedOf(ctx);
  const counts = new Map<string, number>(); const variants = new Map<string, Map<string, number>>();
  let answers = 0, denominator = 0, named = 0;
  for (const row of rows) {
    if (counted && !counted.has(row.question.trim())) continue;
    for (const e of ENGINES) {
      const cell = (row.result ?? {})[e] as Cell | undefined;
      if (!cell || typeof cell !== 'object') continue;
      answers++;
      const firms = rivalsOf(cell, ctx, vocab);
      const you = isNamed(cell);
      if (firms.length || you) denominator++;
      if (you) named++;
      for (const k of new Set(firms.map(firmKey))) if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
      for (const f of firms) { const k = firmKey(f); if (k) { const m = variants.get(k) ?? new Map<string, number>(); m.set(f.trim(), (m.get(f.trim()) ?? 0) + 1); variants.set(k, m); } }
    }
  }
  const display = new Map<string, string>();
  for (const [k, m] of variants) display.set(k, [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0]);
  const firms = [...counts.entries()].map(([k, count]) => ({ name: display.get(k) ?? k, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return { answers, denominator, named, firms };
}
