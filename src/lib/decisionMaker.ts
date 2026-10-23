/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WHO RUNS THIS BUSINESS? — the decision-maker identification step (2026-09-30, Paul: "identify the
   person BEFORE searching LinkedIn").

   Input: public text we already hold or may fetch for free — the business's own web pages, their
   schema.org JSON-LD, Companies House officers (UK), a contact name on the lead row. Output: the
   people named WITH A ROLE, each carrying the quote and the URL it was read on.

   ⛔ NEVER INVENT A PERSON. A name is only taken when the same sentence (or the same team-card block)
      ties it to a decision role: "run by Dave Hughes", "Sarah Jones, Owner", "founded by …",
      schema `founder`, an active Companies House director. A capitalised pair with no role beside it
      is not a decision maker — it is a customer in a testimonial, a street, a brand.
   ⛔ A FIRST NAME ALONE ("run by Dave") is kept but flagged `partial` — it can guide a salesperson and
      it can never be the basis of a CONFIRMED LinkedIn match (linkedinMatch.ts).
   ⛔ DETERMINISTIC, NO MODEL CALLS, NO NETWORK. The fetching lives in the edge service
      (_shared/linkedin-discovery.ts); this file only reads what it is given, so every rule is tested.
   ⛔ COUNTRY-NEUTRAL: nothing here reads a postcode or a UK-only address shape. Companies House is one
      optional source for UK companies; US/AU leads rely on their website and the lead row.

   IMPORTED BY EDGE FUNCTIONS: relative imports with an explicit .ts extension only (CLAUDE.md §4).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export type DecisionRole =
  | 'owner' | 'founder' | 'co_founder' | 'managing_director' | 'director' | 'partner'
  | 'principal' | 'proprietor' | 'practice_manager' | 'ceo' | 'president' | 'general_manager';

export type PersonSource =
  | 'website_text'      // a sentence or team card on the business's own site
  | 'website_schema'    // schema.org founder / employee / Person on the business's own site
  | 'companies_house'   // an active officer of the matched UK company
  | 'lead_contact'      // outreach_leads.contact_name (a person typed it, or the questionnaire)
  | 'manual';           // a salesperson typed the person in

export interface PersonEvidence {
  source: PersonSource;
  /** Where it was read. null only for lead_contact / manual. */
  url: string | null;
  /** The words that name the person and their role, clipped. */
  quote: string;
}

export interface DecisionMakerCandidate {
  /** As written, tidied ("Sarah Jones"). */
  name: string;
  /** Only a first name was found ("run by Dave"). Never CONFIRMED-able. */
  partial: boolean;
  role: DecisionRole | null;
  /** The human label for the role ("Managing Director"). */
  roleLabel: string | null;
  evidence: PersonEvidence[];
  /** Higher = more likely the decision maker. Role weight + independent sources. Ordering only. */
  rank: number;
}

export type IdentifyOutcome =
  | { status: 'identified'; people: DecisionMakerCandidate[] }
  | { status: 'none'; people: []; reason: string };

/* ── Roles ──────────────────────────────────────────────────────────────────────────────────────── */

/** Longest first: "managing director" must win over "director", "co-founder" over "founder". */
const ROLE_PHRASES: Array<{ re: RegExp; role: DecisionRole; label: string; weight: number }> = [
  { re: /\bmanaging\s+director\b|\bm\.?d\.?\b(?=\s*(?:[,|)–-]|$))/i, role: 'managing_director', label: 'Managing Director', weight: 10 },
  { re: /\bco[- ]?founder\b/i, role: 'co_founder', label: 'Co-founder', weight: 9 },
  { re: /\bfounder\b|\bfounded\s+by\b|\bestablished\s+by\b|\bstarted\s+by\b|\bset\s+up\s+by\b/i, role: 'founder', label: 'Founder', weight: 10 },
  { re: /\b(?:business\s+)?owner\b|\bowned\s+by\b|\brun\s+by\b|\bowner[- ]operator\b/i, role: 'owner', label: 'Owner', weight: 10 },
  { re: /\bproprietor\b/i, role: 'proprietor', label: 'Proprietor', weight: 10 },
  { re: /\bchief\s+executive(?:\s+officer)?\b|\bceo\b/i, role: 'ceo', label: 'CEO', weight: 9 },
  { re: /\bpresident\b/i, role: 'president', label: 'President', weight: 8 },
  { re: /\bprincipal\b/i, role: 'principal', label: 'Principal', weight: 8 },
  { re: /\b(?:senior\s+|managing\s+|founding\s+)?partner\b/i, role: 'partner', label: 'Partner', weight: 8 },
  { re: /\bdirector\b/i, role: 'director', label: 'Director', weight: 8 },
  { re: /\bpractice\s+manager\b/i, role: 'practice_manager', label: 'Practice Manager', weight: 6 },
  { re: /\bgeneral\s+manager\b/i, role: 'general_manager', label: 'General Manager', weight: 6 },
];

/** Non-decision "director" titles: an Art Director or a Funeral Director is not the boss by title. */
const NOT_A_DECISION_TITLE = /\b(?:art|creative|funeral|musical|music|technical|sales|marketing|design|film|casting|nursing|clinical)\s+director\b/i;

export function roleFromText(s: string): { role: DecisionRole; label: string; weight: number } | null {
  if (!s) return null;
  const text = s.replace(NOT_A_DECISION_TITLE, ' ');
  for (const r of ROLE_PHRASES) if (r.re.test(text)) return { role: r.role, label: r.label, weight: r.weight };
  return null;
}

export function roleWeight(role: DecisionRole | null): number {
  if (!role) return 0;
  return ROLE_PHRASES.find((r) => r.role === role)?.weight ?? 0;
}

/* ── Names ──────────────────────────────────────────────────────────────────────────────────────── */

/** A capitalised name word: Sarah, O'Brien, McDonald, Smith-Jones, Zoë, D'Souza. */
const NAME_WORD = "(?:[A-Z][a-z]?['’][A-Z][a-z]+|Ma?c[A-Z][a-z]+|[A-Z][a-zà-ÿ]+(?:-[A-Z][a-zà-ÿ]+)?)";
const INITIAL = '(?:[A-Z]\\.?)';
/** First [Middle|Initial] Last — two or three words. */
const FULL_NAME = `${NAME_WORD}(?:\\s+(?:${INITIAL}|${NAME_WORD}))?\\s+${NAME_WORD}`;

/** Words that are capitalised in business copy but are never a person's first or last name. */
const NOT_NAME_WORDS = new Set([
  'the', 'our', 'we', 'us', 'my', 'your', 'about', 'team', 'meet', 'contact', 'home', 'services', 'service',
  'limited', 'ltd', 'llp', 'llc', 'inc', 'corp', 'pty', 'plc', 'company', 'group', 'and', 'with', 'from',
  'owner', 'founder', 'director', 'manager', 'partner', 'principal', 'proprietor', 'managing', 'ceo',
  'plumbing', 'heating', 'gas', 'electrical', 'electric', 'locksmith', 'locksmiths', 'roofing', 'building',
  'builders', 'cleaning', 'dental', 'accountants', 'accountancy', 'solicitors', 'garage', 'motors', 'repairs',
  'london', 'england', 'scotland', 'wales', 'ireland', 'uk', 'usa', 'australia', 'sydney', 'melbourne',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october',
  'november', 'december', 'google', 'facebook', 'instagram', 'linkedin', 'twitter', 'trustpilot',
  'checkatrade', 'gas', 'safe', 'register', 'niceic', 'city', 'guilds', 'street', 'road', 'lane', 'avenue',
  'call', 'email', 'phone', 'free', 'quote', 'read', 'more', 'click', 'here', 'welcome', 'hello', 'hi',
  'family', 'local', 'emergency', 'professional', 'qualified', 'registered', 'certified', 'est', 'since',
]);

function titleCaseWord(w: string): string {
  return w;
}

/** Tidy a name as it will be shown and searched: collapse spaces, drop honorifics, keep the case. */
export function tidyPersonName(raw: string): string {
  return (raw || '')
    .replace(/\s+/g, ' ')
    .replace(/^(?:mr|mrs|ms|miss|dr|prof)\.?\s+/i, '')
    .trim()
    .split(' ')
    .map(titleCaseWord)
    .join(' ');
}

/** Is this string plausibly a person's name (not a brand, a street, a trade)? */
export function looksLikePersonName(name: string, businessName?: string | null): boolean {
  const words = tidyPersonName(name).split(' ').filter(Boolean);
  if (words.length < 1 || words.length > 4) return false;
  for (const w of words) {
    const bare = w.replace(/\.$/, '').toLowerCase();
    if (NOT_NAME_WORDS.has(bare)) return false;
  }
  if (businessName) {
    // "Hughes Plumbing" names Dave Hughes' business, but "Hughes Plumbing" itself is not a person —
    // reject a candidate that is ENTIRELY words of the business name.
    const biz = new Set(businessName.toLowerCase().split(/[^a-z'’-]+/).filter(Boolean));
    if (words.every((w) => biz.has(w.toLowerCase()))) return false;
  }
  return true;
}

/** Stable key for merging the same person across sources: first + last, lowercase, no accents. */
export function personKey(name: string): string {
  const words = foldAccents(tidyPersonName(name)).toLowerCase().replace(/[^a-z\s'-]/g, '').split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  if (words.length === 1) return words[0];
  return `${words[0]} ${words[words.length - 1]}`;
}

export function foldAccents(s: string): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/* ── Page text ──────────────────────────────────────────────────────────────────────────────────── */

/** HTML → text that KEEPS block boundaries as " | " so a team card ("<h3>Sarah Jones</h3><p>Owner</p>")
 *  still reads as one unit, and decodes apostrophes (O&#39;Brien must stay one word). */
export function pageTextWithBlocks(html: string): string {
  return (html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/?(?:p|div|h[1-6]|li|ul|ol|br|tr|td|th|section|article|header|footer|figcaption|figure|span class="?role|strong|b)\b[^>]*>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&(?:#39|#x27|apos|rsquo|#8217);/gi, "'")
    .replace(/&(?:lt|gt|quot|#34|ldquo|rdquo|#8220|#8221);/gi, ' ')
    .replace(/&(?:ndash|mdash|#8211|#8212);/gi, ' – ')
    .replace(/\s+/g, ' ')
    .replace(/(?:\s*\|\s*)+/g, ' | ')
    .trim();
}

const clip = (s: string, n = 180) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

interface RawHit { name: string; partial: boolean; roleText: string; quote: string }

/* The sentence shapes that TIE a name to a role. Each is anchored on the role, never on a bare name.
   Group 1 is always the name. */
const ROLE_WORDS =
  'managing director|co[- ]?founder|founder|business owner|owner[- ]operator|owner|proprietor|director|principal|' +
  'senior partner|managing partner|partner|practice manager|general manager|chief executive(?: officer)?|ceo|president';
const PATTERNS_FULL: RegExp[] = [
  // "run by Dave Hughes", "founded by Sarah Jones", "owned and run by …"
  new RegExp(`\\b(?:(?:owned|run|founded|established|started|set up|managed|led)(?: and (?:run|operated|managed))? by)\\s+(${FULL_NAME})`, 'g'),
  // "Sarah Jones, Owner" / "Sarah Jones – Founder" / "Sarah Jones | Managing Director" / "Sarah Jones (Director)"
  new RegExp(`(${FULL_NAME})\\s*(?:,|–|-|\\||\\(|:)\\s*(?:the\\s+|our\\s+)?(?:${ROLE_WORDS})\\b`, 'gi'),
  // "Owner: Sarah Jones" / "Founder – Sarah Jones" / "Director | Sarah Jones"
  new RegExp(`\\b(?:${ROLE_WORDS})\\s*(?::|–|-|\\|)\\s*(${FULL_NAME})`, 'gi'),
  // "Sarah Jones is the owner" / "Sarah Jones, the founder of" / "Sarah Jones founded"
  new RegExp(`(${FULL_NAME}),?\\s+(?:is|was|has been)\\s+(?:the\\s+|our\\s+)?(?:${ROLE_WORDS})\\b`, 'gi'),
  new RegExp(`(${FULL_NAME})\\s+(?:founded|established|started|set up|owns|runs)\\s+(?:the\\s+)?(?:business|company|firm|practice|shop|agency)`, 'g'),
  // "my name is Sarah Jones and I own / run / founded"
  new RegExp(`\\bmy name is\\s+(${FULL_NAME})\\b[^|.]{0,40}\\b(?:i\\s+(?:own|run|founded|started|set up)|owner|founder|director)`, 'gi'),
  // "our owner Sarah Jones" / "our founder, Sarah Jones"
  new RegExp(`\\b(?:our|the)\\s+(?:${ROLE_WORDS}),?\\s+(${FULL_NAME})`, 'gi'),
];
/** First name only: "run by Dave", "I'm Dave, the owner". */
const PATTERNS_FIRST: RegExp[] = [
  new RegExp(`\\b(?:owned|run|founded|established|started|set up) by\\s+(${NAME_WORD})\\b(?!\\s+${NAME_WORD})`, 'g'),
  new RegExp(`\\b(?:i'?m|i am|my name is)\\s+(${NAME_WORD}),?\\s+(?:the\\s+)?(?:owner|founder|director|proprietor)\\b`, 'gi'),
];

function hitsFor(text: string, patterns: RegExp[], partial: boolean): RawHit[] {
  const out: RawHit[] = [];
  for (const re of patterns) {
    re.lastIndex = 0;
    for (const m of text.matchAll(re)) {
      const name = tidyPersonName(m[1] ?? '');
      if (!name) continue;
      const at = m.index ?? 0;
      // The role phrase is inside the match itself — read it from there, never from the neighbourhood.
      const quote = clip(text.slice(Math.max(0, at - 30), at + m[0].length + 30).replace(/\s*\|\s*/g, ' · ').trim());
      out.push({ name, partial, roleText: m[0], quote });
    }
  }
  return out;
}

/** People named with a role in one page's text. */
export function extractPeopleFromText(text: string, url: string | null, businessName?: string | null): DecisionMakerCandidate[] {
  if (!text) return [];
  const hits = [...hitsFor(text, PATTERNS_FULL, false), ...hitsFor(text, PATTERNS_FIRST, true)];
  const out: DecisionMakerCandidate[] = [];
  for (const h of hits) {
    if (!looksLikePersonName(h.name, businessName)) continue;
    if (h.partial && h.name.includes(' ')) continue;
    const r = roleFromText(h.roleText);
    if (!r) continue; // no decision role in the matched words → not taken (⛔ never invent)
    out.push({
      name: h.name, partial: h.partial, role: r.role, roleLabel: r.label,
      evidence: [{ source: 'website_text', url, quote: h.quote }], rank: 0,
    });
  }
  return out;
}

/* ── schema.org ─────────────────────────────────────────────────────────────────────────────────── */

// deno-lint-ignore no-explicit-any
type Json = any;

/** Every JSON-LD node on a page (walks @graph and arrays). Bad JSON is skipped, never thrown. */
export function jsonLdNodes(html: string): Json[] {
  const out: Json[] = [];
  const walk = (n: Json) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    out.push(n);
    if (n['@graph']) walk(n['@graph']);
  };
  for (const m of (html || '').matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1].trim())); } catch { /* malformed block — skip */ }
  }
  return out;
}

const typesOf = (n: Json): string[] => (Array.isArray(n?.['@type']) ? n['@type'] : n?.['@type'] ? [n['@type']] : []).map(String);

/** founder / employee / member Person entries, and standalone Person nodes with a decision jobTitle. */
export function extractPeopleFromJsonLd(nodes: Json[], url: string | null, businessName?: string | null): DecisionMakerCandidate[] {
  const out: DecisionMakerCandidate[] = [];
  const push = (name: unknown, roleText: string, quoteBits: string) => {
    const n = typeof name === 'string' ? tidyPersonName(name) : '';
    if (!n || !n.includes(' ') || !looksLikePersonName(n, businessName)) return;
    const r = roleFromText(roleText);
    if (!r) return;
    out.push({ name: n, partial: false, role: r.role, roleLabel: r.label, evidence: [{ source: 'website_schema', url, quote: clip(quoteBits) }], rank: 0 });
  };
  for (const n of nodes) {
    const types = typesOf(n);
    for (const f of Array.isArray(n.founder) ? n.founder : n.founder ? [n.founder] : []) {
      const name = typeof f === 'string' ? f : f?.name;
      push(name, `founder ${typeof f === 'object' ? String(f?.jobTitle ?? '') : ''}`, `schema founder: ${name}`);
    }
    for (const key of ['employee', 'member', 'employees', 'members']) {
      for (const p of Array.isArray(n[key]) ? n[key] : n[key] ? [n[key]] : []) {
        if (p && typeof p === 'object') push(p.name, String(p.jobTitle ?? p.roleName ?? ''), `schema ${key}: ${p.name} — ${p.jobTitle ?? ''}`);
      }
    }
    if (types.some((t) => /^Person$/i.test(t))) push(n.name, String(n.jobTitle ?? ''), `schema Person: ${n.name} — ${n.jobTitle ?? ''}`);
  }
  return out;
}

/** Personal LinkedIn links on the business's OWN site, read from schema sameAs and <a href>. */
export function linkedInLinksOnPage(html: string, nodes: Json[] = jsonLdNodes(html)): string[] {
  const out = new Set<string>();
  for (const m of (html || '').matchAll(/href=["'](https?:\/\/[^"']*linkedin\.com\/[^"']+)["']/gi)) out.add(m[1]);
  for (const n of nodes) {
    for (const s of Array.isArray(n.sameAs) ? n.sameAs : n.sameAs ? [n.sameAs] : []) {
      if (typeof s === 'string' && /linkedin\.com\//i.test(s)) out.add(s);
    }
  }
  return [...out];
}

/* ── Companies House (UK, optional) ─────────────────────────────────────────────────────────────── */

export interface CompaniesHouseOfficer {
  name?: string;              // "SMITH, Sarah Jane"
  officer_role?: string;      // director | llp-designated-member | llp-member | secretary | corporate-director …
  resigned_on?: string | null;
  appointed_on?: string | null;
}

/** "SMITH, Sarah Jane" → "Sarah Jane Smith". A name with no comma is returned tidied as-is. */
export function companiesHouseName(raw: string): string {
  const s = (raw || '').trim();
  const m = /^([^,]+),\s*(.+)$/.exec(s);
  const cap = (w: string) => w.toLowerCase().replace(/(^|[\s'’-])([a-zà-ÿ])/g, (_x, a, b) => a + b.toUpperCase()).replace(/\bMc([a-z])/g, (_x, c) => `Mc${c.toUpperCase()}`);
  if (!m) return tidyPersonName(cap(s));
  const given = m[2].replace(/\b(?:Mr|Mrs|Ms|Miss|Dr|Sir|Dame)\b\.?/gi, '').trim();
  return tidyPersonName(`${cap(given)} ${cap(m[1])}`);
}

/** Active natural-person directors / LLP members of the matched company. Corporate officers and
 *  secretaries are not decision makers for our purpose. */
export function peopleFromCompaniesHouse(officers: CompaniesHouseOfficer[], companyUrl: string): DecisionMakerCandidate[] {
  const out: DecisionMakerCandidate[] = [];
  for (const o of officers ?? []) {
    if (o.resigned_on) continue;
    const role = String(o.officer_role ?? '').toLowerCase();
    const isDirector = role === 'director';
    const isMember = role === 'llp-designated-member' || role === 'llp-member';
    if (!isDirector && !isMember) continue;
    const name = companiesHouseName(String(o.name ?? ''));
    if (!name.includes(' ')) continue;
    out.push({
      name, partial: false,
      role: isDirector ? 'director' : 'partner',
      roleLabel: isDirector ? 'Director' : 'Partner (LLP member)',
      evidence: [{ source: 'companies_house', url: companyUrl, quote: clip(`${o.name} — ${o.officer_role}${o.appointed_on ? `, appointed ${o.appointed_on}` : ''}`) }],
      rank: 0,
    });
  }
  return out;
}

/* ── Merge + rank ───────────────────────────────────────────────────────────────────────────────── */

/** Independent-source bonus: the same person named by the site AND Companies House is stronger than
 *  the same sentence repeated in the footer of every page. */
const SOURCE_BONUS: Record<PersonSource, number> = {
  manual: 20, lead_contact: 4, companies_house: 4, website_schema: 3, website_text: 3,
};

/** Merge one person seen several times (key: first + last), keep the strongest role, rank, and cap.
 *  A partial first-name hit folds into a full name with the same first name when one exists. */
export function rankDecisionMakers(all: DecisionMakerCandidate[], max = 3): IdentifyOutcome {
  const byKey = new Map<string, DecisionMakerCandidate>();
  const full = all.filter((c) => !c.partial);
  const partial = all.filter((c) => c.partial);
  const add = (key: string, c: DecisionMakerCandidate) => {
    const prev = byKey.get(key);
    if (!prev) { byKey.set(key, { ...c, evidence: [...c.evidence] }); return; }
    if (roleWeight(c.role) > roleWeight(prev.role)) { prev.role = c.role; prev.roleLabel = c.roleLabel; }
    if (!prev.partial && c.name.split(' ').length > prev.name.split(' ').length && personKey(c.name) === personKey(prev.name)) prev.name = c.name;
    for (const e of c.evidence) {
      if (!prev.evidence.some((x) => x.source === e.source && x.url === e.url && x.quote === e.quote)) prev.evidence.push(e);
    }
  };
  for (const c of full) add(personKey(c.name), c);
  for (const c of partial) {
    const first = personKey(c.name);
    const owner = [...byKey.entries()].find(([k, v]) => !v.partial && k.split(' ')[0] === first);
    if (owner) add(owner[0], { ...c, partial: false, name: owner[1].name });
    else add(`first:${first}`, c);
  }
  const people = [...byKey.values()].map((p) => {
    const sources = new Set(p.evidence.map((e) => e.source));
    let rank = roleWeight(p.role);
    for (const s of sources) rank += SOURCE_BONUS[s];
    if (p.partial) rank -= 5;
    return { ...p, rank, evidence: p.evidence.slice(0, 6) };
  }).sort((a, b) => b.rank - a.rank || a.name.localeCompare(b.name));
  if (!people.length) return { status: 'none', people: [], reason: 'No person was named with an owner, founder or director role in the sources checked.' };
  return { status: 'identified', people: people.slice(0, max) };
}
