/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SALES INSIGHTS — what a careful person reading a prospect's website would actually tell a salesperson
   (2026-10-07, branch improve/site-crawl-sales-insights; docs/site-crawl-sales-insights.md).

   WHY THIS EXISTS. The call script used to read only eight TECHNICAL finding kinds (siteFindings.ts: a
   sitemap on the wrong domain, a crawler blocked, near-identical town pages…). Everything a person
   notices first — "all your services are on one page", "nothing says where you work", "no phone number" —
   was in the crawl's stored pages and was never looked at. This module looks at it.

   WHAT IT CHECKS (deterministic, from the pages the crawl already read; no fetch, no model call):
     · SERVICE COVERAGE  — which services the site names (nav, services-page headings, homepage headings, the
                           lead's own list) and whether each has a dedicated page.
     · ENTITY CLARITY    — the business name and a phone number stated where a crawler reads them.
     · LOCATION          — the home town stated in the title, headings or opening text.
     · INTERNAL LINKING  — service pages that the homepage and the menu never link to.
     · PROOF             — reviews, credentials, past work, a guarantee, years trading.

   ⛔ NEVER INVENT A PROBLEM. A finding exists only with the page it was read on and the words that were
   read. "Not found" is only ever said of the pages READ (`capped`), never of the website. A page being
   short is not a finding. A service name that only a generic heading suggests is a MEDIUM-confidence
   candidate and a lone one is never reported.
   ⛔ A STRONG SITE IS A RESULT. When nothing real is found the state is `strong_site`, and the script says
   so. The one honest opportunity (more dedicated service pages, deeper service pages, more proof, area
   pages) is offered only when the pages read actually support it; when none does, there is none.
   ⛔ NO SEO JARGON IN WHAT IS SAID, NO SCORE, NO PROMISE ABOUT AI. Findable is said to improve what Google
   and AI systems can find, read and check — never that they will recommend, cite or rank anyone. No
   keyword density. No llms.txt. No GPTBot. No schema stuffing. No clone town pages.
   ⛔ ONE RULE, ONE PLACE: this file decides what a finding is and how findings are ranked, the page
   builders (crawl-check, crawl-job) only feed it pages, and callScript/coldCallPlaybook only read it.

   PURE. No React, no fetch, no clock. IMPORTED BY EDGE FUNCTIONS: relative imports, explicit .ts only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import type { SiteAuditPage } from './siteAudit.ts';
import { significantWords, statesAll } from './siteAudit.ts';

export const SALES_INSIGHTS_VERSION = 1;
/** The strongest findings kept on a crawl. More than this is an audit, not a sales insight. */
export const MAX_INSIGHT_FINDINGS = 5;
/** What the script may say aloud — one or two hooks, never a list. */
export const MAX_SPOKEN_POINTS = 2;
/** Examples kept per finding (addresses, quotes). */
const EVIDENCE_URLS = 5;
const EVIDENCE_QUOTES = 3;
/** A service the site names, listed with fewer than this many others, is not "all crammed on one page". */
const MIN_SERVICES_FOR_PAGE_CLAIMS = 3;
/** A services/area page that lists at least this many distinct services is a shared page. */
const MIN_SERVICES_ON_SHARED_PAGE = 3;
/** A finding below this weight is kept for the evidence screens and never said on a call: it is true as far as the pages
 *  read go, but not a reason to ring someone. (2026-10-07, after running real sites: name matching and "service pages
 *  don't say the town" were too fuzzy to put in a salesperson's mouth.) */
export const SPEAK_MIN_PRIORITY = 50;
/** Read this many pages before an absence of proof or contact details is worth saying. */
const MIN_PAGES_FOR_ABSENCE = 3;
/** A service page is "light" under this many words — used only for the deepen-pages opportunity, never as a fault. */
export const LIGHT_SERVICE_WORDS = 250;

export type InsightKind =
  | 'no_service_pages' | 'services_on_one_page' | 'service_page_gaps'
  | 'no_contact_details' | 'location_unclear' | 'name_unclear' | 'internal_linking' | 'no_proof';
export type OpportunityKind = 'service_pages' | 'deepen_services';
export type InsightConfidence = 'high' | 'medium';
/** Findings about the same thing say it once. The legacy technical kinds map onto these. */
export type InsightTheme = 'services' | 'contact' | 'location' | 'name' | 'linking' | 'proof' | 'indexing' | 'crawler' | 'sitemap' | 'canonical' | 'schema' | 'duplicates' | 'thin' | 'readability';

export interface InsightEvidence {
  /** The pages the finding was read on. */
  urls: string[];
  /** The words that were read (a heading, a nav label, a line of text). */
  quotes: string[];
  /** What was detected, in one short machine-ish phrase — "services listed on /services: Lock changes, …". */
  signal: string;
}

export interface SalesFinding {
  id: string;
  kind: InsightKind;
  theme: InsightTheme;
  /** Operator title. */
  title: string;
  /** What was seen — a fact. */
  observed: string;
  /** Why it matters — plain English, hedged, never a claim about how an AI decides. */
  why: string;
  /** What Findable would do about it. */
  improvement: string;
  /** Said on the call: the observation and the reason, two short sentences, no jargon. */
  spoken: string;
  confidence: InsightConfidence;
  /** Ranking weight (higher = more worth saying). Fixed per kind — never computed from a score. */
  priority: number;
  evidence: InsightEvidence;
}

export interface SalesOpportunity {
  kind: OpportunityKind;
  /** The honest positive: said when the site has no fault worth calling out. */
  spoken: string;
  observed: string;
  improvement: string;
  /** The service names the line may use, when known. */
  services: string[];
  evidence: InsightEvidence;
}

export type ServiceCoverage = 'dedicated' | 'shared' | 'none' | 'unknown';
export interface ServiceStatus { name: string; coverage: ServiceCoverage; confidence: InsightConfidence; url: string | null; seenOn: string[] }

export type InsightsState = 'issues' | 'strong_site' | 'unreadable';

export interface SalesInsights {
  version: number;
  state: InsightsState;
  /** Strongest first, at most MAX_INSIGHT_FINDINGS. */
  findings: SalesFinding[];
  /** The positive fallback — present only when `state` is `strong_site`. */
  opportunity: SalesOpportunity | null;
  /** Verified strengths, so the rep can say what is good too. */
  strengths: string[];
  services: ServiceStatus[];
  basis: { pagesRead: number; capped: boolean };
}

export interface InsightLead {
  name?: string | null;
  town?: string | null;
  /** "locksmith", "plumber"… — a single service-name that is only the trade is not a service. */
  trade?: string | null;
  /** The lead's own recorded services (outreach_leads.services_included). */
  services?: readonly string[] | null;
}

export interface InsightInput {
  servedUrl: string;
  /** Every page row the crawl holds: only `status: 'done'` pages with a digest are read. */
  pages: SiteAuditPage[];
  /** Homepage navigation (label + address). */
  nav?: ReadonlyArray<{ label: string; url: string }> | null;
  /** Every same-site address the crawl knows exists, read or not (a capped crawl's found-but-unread pages). */
  knownUrls?: readonly string[] | null;
  lead?: InsightLead | null;
  /** The crawl stopped at its page limit: absences are said of the pages read only, and unread pages are not judged. */
  capped?: boolean;
}

/* ── tiny helpers ─────────────────────────────────────────────────────────────────────────────── */

const clip = (s: string, n: number) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
const pathOf = (u: string) => { try { return new URL(u).pathname.replace(/\/+$/, '').toLowerCase() || '/'; } catch { return String(u).toLowerCase(); } };
const slugWords = (u: string) => pathOf(u).split(/[^a-z0-9]+/).filter(Boolean);
const uniq = <T,>(xs: T[]) => [...new Set(xs)];
const joinList = (xs: readonly string[]) => (xs.length <= 1 ? (xs[0] ?? '') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);

/** Light stemming so "repairs", "repairing" and "repair" meet, and "change" meets "changes". */
export function stem(raw: string): string {
  let w = String(raw ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (w.length > 5) w = w.replace(/(?:ing|ers|ies)$/, (m) => (m === 'ies' ? 'y' : ''));
  if (w.length > 4) w = w.replace(/(?:es|er|ed|s)$/, '');
  if (w.length > 4) w = w.replace(/e$/, '');
  return w;
}
const FILLER = new Set(['service', 'services', 'our', 'your', 'the', 'and', 'for', 'in', 'of', 'near', 'local', 'best', 'expert', 'experts', 'professional', 'quality', 'affordable', 'cheap', 'trusted', 'reliable', 'all', 'types', 'type', 'with', 'from', 'to', 'a', 'an', 'we', 'you', 'are', 'is']);
function tokensOf(s: string, drop: Set<string>): string[] {
  return uniq(String(s ?? '').toLowerCase().replace(/&/g, ' and ').split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !FILLER.has(w)).map(stem).filter((w) => w && !drop.has(w)));
}

/** Headings and menu labels that are not a service. */
const NOT_A_SERVICE = new RegExp('^(?:'
  + 'home|homepage|about|about us|contact|contact us|blog|news|gallery|portfolio|projects?|our work|case stud(?:y|ies)|reviews?|testimonials?|faqs?|'
  + 'areas?|areas we (?:cover|serve)|locations?|coverage|careers?|jobs|shop|store|basket|cart|login|account|privacy(?: policy)?|cookies?(?: policy)?|terms.*|sitemap|'
  + 'offers?|pricing|prices|rates|team|our team|meet the team|get (?:a )?(?:free )?quote|free quote|quote|book(?: now| online)?|enquir.*|call us|call now|menu|search|'
  + 'services?|our services|what we do|products?|why .*|how .*|useful .*|links|follow us|opening hours|resources|guides?|accessibility|help|support|free .*|request .*|'
  + 'get in touch|emergency|24 ?[/-]? ?7|domestic|commercial|residential|landlords?|homeowners?|customers?|businesses|business|our customers|who we (?:are|help|serve)|'
  + 'trusted by .*|welcome.*|meet .*|latest .*|recent .*|related .*|share .*|leave a .*|our (?:promise|guarantee|process|story|values|mission)|testimonials? and reviews?'
  + ')$', 'i');
/** Words that make a heading a slogan, a call to action, a person or a utility block — never a service. Matched on
 *  every word of the label (2026-10-07: found on real sites — "Get Fast, Reliable Plumbing Help Today", "Quick Links",
 *  "PAYMENT OPTIONS", "Dr. Barbara Orion", "What My Clients are Saying" were all being read as services). */
const NOT_SERVICE_TOKENS = new Set(['faq', 'faqs', 'frequently', 'asked', 'questions', 'info', 'information', 'guarantee', 'guarantees', 'helpful', 'useful', 'area', 'areas', 'quick', 'links',
  'contact', 'clients', 'customers', 'customer', 'payment', 'payments', 'insurance', 'award', 'winning', 'awarded', 'dr', 'mr', 'mrs', 'ms', 'saying', 'say', 'exercises', 'mindset', 'free',
  'today', 'now', 'trusted', 'reliable', 'specialists', 'specialist', 'fast', 'call', 'get', 'enquire', 'enquiry', 'book', 'request', 'find', 'see', 'view', 'read', 'learn', 'discover',
  'meet', 'join', 'why', 'what', 'how', 'who', 'when', 'where', 'welcome', 'properly', 'friendly', 'honest', 'leading', 'team', 'about', 'becoming', 'testimonials',
  'testimonial', 'reviews', 'review', 'hours', 'follow', 'subscribe', 'newsletter', 'download', 'login', 'privacy', 'cookie', 'cookies', 'terms', 'conditions', 'copyright',
  'rights', 'reserved', 'powered', 'designed', 'blog', 'news', 'latest', 'recent', 'popular', 'related', 'share', 'email', 'address', 'telephone', 'whatsapp',
  'facebook', 'instagram', 'twitter', 'linkedin', 'youtube', 'map', 'directions', 'dentists', 'dentist', 'is', 'are', 'was', 'can', 'will', 'has', 'have', 'does', 'should', 'must',
  'need', 'needs', 'registered', 'based', 'straightforward', 'easy', 'simple', 'careers', 'career', 'jobs', 'vacancies', 'recruitment', 'accreditation', 'accreditations',
  'membership', 'memberships', 'accredited']);
/** A heading only counts as a service when it contains a word for something a business DOES or FIXES. Missing a
 *  service this list does not know is the safe direction — nothing is claimed; inventing one is not. */
const SERVICE_NOUN_PREFIXES = ['locksmith', 'lock', 'plumb', 'boiler', 'heat', 'drain', 'leak', 'toilet', 'shower', 'bathroom', 'kitchen', 'radiat', 'electr', 'rewir', 'light', 'socket',
  'charg', 'roof', 'gutter', 'fascia', 'chimney', 'window', 'door', 'upvc', 'glaz', 'garage', 'fenc', 'patio', 'driveway', 'paving', 'landscap', 'garden', 'tree', 'lawn', 'paint',
  'decorat', 'plaster', 'tile', 'floor', 'carpet', 'carpent', 'joiner', 'build', 'extens', 'loft', 'convers', 'damp', 'insulat', 'render', 'brick', 'scaffold', 'clean', 'pest', 'remov',
  'skip', 'waste', 'repair', 'instal', 'fitting', 'fitter', 'replac', 'maintenan', 'inspect', 'certif', 'survey', 'alarm', 'cctv', 'secur', 'valet', 'tyre', 'vehicle', 'tooth', 'teeth',
  'dental', 'whiten', 'veneer', 'brace', 'implant', 'hair', 'nail', 'beaut', 'massag', 'physio', 'therap', 'accountan', 'bookkeep', 'payroll', 'conveyanc', 'probate', 'mortgag',
  'photograph', 'wedding', 'cater', 'tutor', 'lesson', 'coach', 'design', 'print', 'cutting', 'engrav', 'shoe', 'watch', 'batter', 'safe', 'boil', 'sweep', 'heating', 'unblock'];
const SERVICE_NOUN_EXACT = new Set(['gas', 'tap', 'taps', 'tv', 'mot', 'dj', 'tax', 'vat', 'key', 'keys', 'car', 'cars', 'ev', 'pat']);
const hasServiceNoun = (label: string) => String(label ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  .some((w) => SERVICE_NOUN_EXACT.has(w) || SERVICE_NOUN_PREFIXES.some((p) => stem(w).startsWith(p) || w.startsWith(p)));
const isServiceLabel = (label: string) => {
  const t = String(label ?? '').replace(/\s+/g, ' ').trim();
  if (t.length < 3 || t.length > 48) return false;
  if (/[?!:]|[£$]\d|\d{3,}|@|https?:/i.test(t)) return false;
  const words = t.split(' ');
  if (words.length > 6) return false;
  if (/\b(?:we|our|you|your|us|i)\b/i.test(t) && words.length > 3) return false;
  if (t.toLowerCase().split(/[^a-z0-9]+/).some((w) => NOT_SERVICE_TOKENS.has(w))) return false;
  return !NOT_A_SERVICE.test(t);
};
const EXCLUDED_DEDICATED_FAMILIES = new Set(['homepage', 'blog', 'faq', 'reviews', 'gallery', 'legal', 'contact', 'about', 'location']);

type CandSource = 'lead' | 'nav' | 'index' | 'home';
interface Candidate { name: string; tokens: string[]; key: string; sources: Set<CandSource>; navUrl: string | null; seenOn: string[] }
const safePath = (u: string, base: string): string | null => { try { return new URL(u, base).pathname.replace(/\/+$/, '').toLowerCase() || '/'; } catch { return null; } };

/** Is the business NAME written in `hay`? The words that make a name THIS business's (not the trade it is
 *  in) must all be there — "RG Locksmiths" is not stated by a page that says "Locksmith Services". A name
 *  made only of trade words falls back to all its words, which errs toward "stated": the safe direction. */
export function nameStated(hay: string, name: string, tradeStems: ReadonlySet<string>): boolean {
  /* The BRAND is the part before any "& Key Cutting" / "- Heating Engineers" tail ("Ronnie's Shoe Repairs & Key
     Cutting" is stated by a page that says "Ronnies Shoe Repairs"). Apostrophes are ignored on both sides. */
  const brand = String(name ?? '').split(/\s+(?:&|and|\||–|—|-)\s+|,/i)[0];
  const words = brand.toLowerCase().replace(/['’]/g, '').replace(/&/g, ' ').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
    .filter((w) => w.length >= 2 && !NAME_STOP.has(w));
  const distinctive = words.filter((w) => !tradeStems.has(stem(w)));
  const need = distinctive.length ? distinctive : words;
  if (!need.length) return false;
  const h = new Set(String(hay ?? '').toLowerCase().replace(/['’]/g, '').replace(/&/g, ' ').replace(/[^a-z0-9]+/g, ' ').split(' ').filter(Boolean));
  return need.every((w) => h.has(w) || h.has(w + 's') || h.has(w.replace(/s$/, '')));
}
/** Do enough of a service's words appear in a page's headline words? Short names need every word; a longer one
 *  ("Laser Teeth Whitening" on a page titled "Teeth Whitening") needs most of them. */
function matchesTokens(tokens: readonly string[], hay: ReadonlySet<string>): boolean {
  if (!tokens.length) return false;
  const need = tokens.length <= 2 ? tokens.length : Math.ceil(tokens.length * 0.6);
  return tokens.filter((t) => hay.has(t)).length >= need;
}
const NAME_STOP = new Set(['the', 'and', 'ltd', 'limited', 'llp', 'plc', 'co', 'company', 'services', 'service', 'uk', 'of', 'in', 'group', 'solutions', 'mr', 'mrs']);

/* ── the builder ──────────────────────────────────────────────────────────────────────────────── */

export function buildSalesInsights(input: InsightInput): SalesInsights {
  const capped = input.capped === true;
  const scope = capped ? ' in the pages read' : '';
  const done = input.pages.filter((p) => p.status === 'done' && p.d);
  const ok = done.filter((p) => (p.d!.status ?? 200) > 0 && (p.d!.status ?? 200) < 400 && !p.d!.noindex);
  const urlOf = (p: SiteAuditPage) => p.d?.finalUrl || p.finalUrl || p.url;
  const fam = (p: SiteAuditPage) => p.d?.family ?? 'other';
  const home = ok.find((p) => fam(p) === 'homepage') ?? null;
  const basis = { pagesRead: ok.length, capped };
  if (!home) return { version: SALES_INSIGHTS_VERSION, state: 'unreadable', findings: [], opportunity: null, strengths: [], services: [], basis };

  const lead = input.lead ?? {};
  const town = String(lead.town ?? '').trim();
  const leadName = String(lead.name ?? '').trim();
  const tradeStems = new Set(tokensOf(String(lead.trade ?? ''), new Set()));
  const townStems = new Set(significantWords(town).map(stem));
  const dropForService = new Set<string>([...townStems]);

  const hayOf = (p: SiteAuditPage) => new Set(tokensOf([...(p.d!.h1 ?? []), p.d!.title ?? '', slugWords(urlOf(p)).join(' ')].join(' '), new Set()));
  const known = uniq([...ok.map(urlOf), ...(input.knownUrls ?? [])]);
  const strengths: string[] = [];
  const findings: SalesFinding[] = [];

  /* ── 1. the services the site names ───────────────────────────────────────────────────────────── */
  const cands = new Map<string, Candidate>();
  const addCand = (rawName: string, source: CandSource, extra?: { navUrl?: string; on?: string }) => {
    const name = clip(rawName, 60);
    if (!isServiceLabel(name)) return;
    if (source !== 'lead' && !hasServiceNoun(name)) return;
    const tokens = tokensOf(name, dropForService);
    if (!tokens.length) return;
    if (tokens.length === 1 && tradeStems.has(tokens[0])) return;          // "Locksmith" is the trade, not a service
    const key = [...tokens].sort().join('+');
    const c = cands.get(key) ?? { name, tokens, key, sources: new Set(), navUrl: null, seenOn: [] };
    c.sources.add(source);
    if (extra?.navUrl && !c.navUrl) c.navUrl = extra.navUrl;
    if (extra?.on && !c.seenOn.includes(extra.on)) c.seenOn.push(extra.on);
    cands.set(key, c);
  };
  for (const s of lead.services ?? []) addCand(String(s), 'lead');
  const homePath = pathOf(urlOf(home));
  for (const n of input.nav ?? []) {
    const np = safePath(n.url, input.servedUrl);
    if (np === null || np === homePath || /^#/.test(n.url)) continue;
    addCand(n.label, 'nav', { navUrl: n.url, on: urlOf(home) });
  }
  for (const h of [...(home.d!.h2 ?? []), ...(home.d!.h3 ?? [])]) addCand(h, 'home', { on: urlOf(home) });
  /* A page that lists several services (a "Services" page) — the same detection, on every non-home page
     whose headings name at least MIN_SERVICES_ON_SHARED_PAGE services. */
  const headingServices = (p: SiteAuditPage) => [...(p.d!.h2 ?? []), ...(p.d!.h3 ?? [])].filter(isServiceLabel).map((h) => clip(h, 60));
  const sharedPages: Array<{ page: SiteAuditPage; names: string[] }> = [];
  for (const p of ok) {
    if (fam(p) === 'homepage' || fam(p) === 'blog' || fam(p) === 'legal') continue;
    const names = headingServices(p);
    const distinct = uniq(names.map((h) => tokensOf(h, dropForService).sort().join('+')).filter(Boolean));
    if (distinct.length >= MIN_SERVICES_ON_SHARED_PAGE) { sharedPages.push({ page: p, names }); for (const h of names) addCand(h, 'index', { on: urlOf(p) }); }
  }
  // A candidate whose words are wholly inside another's ("Locks" inside "Lock changes") is the same service.
  const list = [...cands.values()];
  const services0 = list.filter((c) => !list.some((o) => o !== c && o.tokens.length > c.tokens.length && c.tokens.every((t) => o.tokens.includes(t))));
  /* A heading that only appears on the homepage is the weakest evidence; keep it, but at MEDIUM. */
  const confOf = (c: Candidate): InsightConfidence => (c.sources.has('lead') || c.sources.has('nav') || c.sources.has('index') ? 'high' : 'medium');

  /* ── coverage: does each service have its own page? ───────────────────────────────────────────── */
  const dedicatedPool = ok.filter((p) => !EXCLUDED_DEDICATED_FAMILIES.has(fam(p)) && !sharedPages.some((s) => s.page === p));
  const statuses: ServiceStatus[] = services0.map((c) => {
    const navPath = c.navUrl ? safePath(c.navUrl, input.servedUrl) : null;
    const navTarget = navPath ? ok.find((p) => pathOf(urlOf(p)) === navPath) : null;
    const navIsOwn = navTarget && dedicatedPool.includes(navTarget);
    const byContent = dedicatedPool.find((p) => matchesTokens(c.tokens, hayOf(p)));
    const own = navIsOwn ? navTarget! : byContent ?? null;
    if (own) return { name: c.name, coverage: 'dedicated', confidence: confOf(c), url: urlOf(own), seenOn: c.seenOn };
    // A page we know exists (found, not read) whose address names the service: covered, just unread.
    const unreadMatch = known.find((u) => !ok.some((p) => urlOf(p) === u) && (() => { const sw = new Set(tokensOf(slugWords(u).join(' '), new Set())); return matchesTokens(c.tokens, sw); })());
    if (unreadMatch) return { name: c.name, coverage: 'dedicated', confidence: confOf(c), url: unreadMatch, seenOn: c.seenOn };
    // A menu item pointing at a page we did not read: not judgeable on a capped crawl.
    if (c.navUrl && capped && !navTarget && !/^#/.test(c.navUrl)) return { name: c.name, coverage: 'unknown', confidence: confOf(c), url: c.navUrl, seenOn: c.seenOn };
    const sharedOn = sharedPages.find((s) => s.names.some((n) => tokensOf(n, dropForService).sort().join('+') === c.key));
    if (sharedOn) return { name: c.name, coverage: 'shared', confidence: confOf(c), url: urlOf(sharedOn.page), seenOn: c.seenOn };
    return { name: c.name, coverage: 'none', confidence: confOf(c), url: null, seenOn: c.seenOn };
  });
  const judged = statuses.filter((s) => s.coverage !== 'unknown');
  const dedicated = judged.filter((s) => s.coverage === 'dedicated');
  /* Named in a sentence a rep will say: the services the site itself puts in its menu, services page or the lead's own list
     come first; a service only seen as a homepage heading is the weakest and is named last. */
  const lacking = judged.filter((s) => s.coverage === 'shared' || s.coverage === 'none').sort((a, b) => (a.confidence === b.confidence ? 0 : a.confidence === 'high' ? -1 : 1));
  const shared = judged.filter((s) => s.coverage === 'shared').sort((a, b) => (a.confidence === b.confidence ? 0 : a.confidence === 'high' ? -1 : 1));
  const homeOnlyEvidence = home.d!.excerpt ?? '';

  if (judged.length >= MIN_SERVICES_FOR_PAGE_CLAIMS && dedicated.length === 0) {
    const list3 = lacking.slice(0, 4).map((s) => s.name);
    const named = lacking.slice(0, 4);
    const sharedTarget = shared.length >= MIN_SERVICES_FOR_PAGE_CLAIMS ? shared[0].url : null;
    if (sharedTarget) {
      findings.push({
        id: 'services_on_one_page', kind: 'services_on_one_page', theme: 'services', confidence: named.every((s) => s.confidence === 'high') ? 'high' : 'medium', priority: 82,
        title: 'Several different services share one page',
        observed: `${joinList(list3)} are all described on one page (${sharedTarget}); none of them has a page of its own${scope}.`,
        why: 'A customer searching for one job lands on a page about everything, and Google and AI tools have no page that is clearly about that one service.',
        improvement: 'Give each main service its own page that says what it is, who needs it, what is included and where you do it.',
        spoken: `On your site, ${joinList(list3)} are all described together on one page, rather than each having a page of its own. That makes it harder for Google and AI tools to see exactly what you offer for each job.`,
        evidence: { urls: [sharedTarget], quotes: lacking.slice(0, EVIDENCE_QUOTES).map((s) => `“${s.name}” (heading on ${s.url ?? 'the page'})`), signal: `${shared.length} services listed on ${sharedTarget}, no dedicated page found for any` },
      });
    } else {
      findings.push({
        id: 'no_service_pages', kind: 'no_service_pages', theme: 'services', confidence: named.every((s) => s.confidence === 'high') ? 'high' : 'medium', priority: 85,
        title: 'Services are listed but none has its own page',
        observed: `The site names ${joinList(list3)}, but no page about any one of them${scope}.`,
        why: 'Without a page for each job, Google and AI tools have nothing specific to match to what a customer is asking for.',
        improvement: 'Build a clear page for each main service: what it is, who needs it, what is included, where you offer it.',
        spoken: `Your site lists ${joinList(list3)}, but there isn't a page for any of them. That makes it harder for Google and AI tools to see what you do for each job.`,
        evidence: { urls: [urlOf(home)], quotes: lacking.slice(0, EVIDENCE_QUOTES).map((s) => `“${s.name}” (${s.seenOn[0] ?? urlOf(home)})`), signal: `${lacking.length} services named, 0 dedicated pages found` },
      });
    }
  } else if (judged.length >= MIN_SERVICES_FOR_PAGE_CLAIMS && dedicated.length >= 1 && lacking.filter((s) => s.confidence === 'high').length >= 2) {
    const names = lacking.filter((s) => s.confidence === 'high').slice(0, 4).map((s) => s.name);
    findings.push({
      id: 'service_page_gaps', kind: 'service_page_gaps', theme: 'services', confidence: 'high', priority: 68,
      title: 'Some services have no page of their own',
      observed: `${dedicated.length} of ${judged.length} services named on the site have their own page; ${joinList(names)} do not${scope}.`,
      why: 'The services without a page are the ones Google and AI tools have least to go on.',
      improvement: 'Add a page for each of the missing services, written about that job and where you do it.',
      spoken: `You've got pages for some of your services, but not ${joinList(names)}. Those are the ones Google and AI tools have least to go on.`,
      evidence: { urls: dedicated.slice(0, 2).map((s) => s.url!).filter(Boolean), quotes: lacking.slice(0, EVIDENCE_QUOTES).map((s) => `“${s.name}”`), signal: `${dedicated.length}/${judged.length} services with a dedicated page` },
    });
  }
  if (dedicated.length >= 2) strengths.push(`Dedicated pages for ${dedicated.length} services (${dedicated.slice(0, 3).map((s) => s.name).join(', ')})`);

  /* ── 2. entity clarity ────────────────────────────────────────────────────────────────────────── */
  const allBiz = (k: 'phones' | 'reviews' | 'credentials' | 'guarantees' | 'experience' | 'people' | 'addresses') =>
    ok.flatMap((p) => (((p.b as unknown as Record<string, unknown> | null | undefined)?.[k] as string[] | undefined) ?? []).map((v) => ({ v: String(v), url: urlOf(p) })));
  const phones = allBiz('phones');
  if (ok.length >= MIN_PAGES_FOR_ABSENCE && phones.length === 0) {
    findings.push({
      id: 'no_contact_details', kind: 'no_contact_details', theme: 'contact', confidence: 'high', priority: 66,
      title: 'No phone number found on the site',
      observed: `No phone number appears${capped ? ` in the ${ok.length} pages read` : ` on any of the ${ok.length} pages read`}.`,
      why: 'A phone number written on the page is one of the things that ties the website to the business’s listings, and what a customer looks for first.',
      improvement: 'State the phone number clearly in the header, footer and contact page, matching the listings.',
      spoken: "I couldn't find a phone number written on your site. That's one of the main things that ties the website to your business listings.",
      evidence: { urls: [urlOf(home)], quotes: [], signal: `0 phone numbers across ${ok.length} pages read` },
    });
  } else if (phones.length) strengths.push(`Phone number shown (${phones[0].v})`);
  if (leadName && significantWords(leadName).length) {
    const head = [home.d!.title, ...(home.d!.h1 ?? []), ...(((home.b as { names?: string[] } | null)?.names) ?? [])].join(' ');
    const inHead = nameStated(head, leadName, tradeStems);
    const inText = nameStated(`${head} ${home.d!.excerpt ?? ''} ${home.d!.description ?? ''}`, leadName, tradeStems);
    const textRead = (home.d!.words ?? 0) >= 60;
    if (inHead) strengths.push('Business name clear in the homepage title or heading');
    else if (!inText && textRead && !nameStated(ok.map((p) => `${p.d!.title} ${(p.d!.h1 ?? []).join(' ')}`).join(' '), leadName, tradeStems)) {
      findings.push({
        id: 'name_unclear', kind: 'name_unclear', theme: 'name', confidence: 'medium', priority: 48,
        title: 'Business name not stated on the homepage',
        observed: `“${leadName}” does not appear in the homepage title, headings or opening text (title: “${clip(home.d!.title || 'none', 80)}”).`,
        why: 'When the business name is not written plainly, it is harder for Google and AI tools to be sure the website belongs to the business they see in listings.',
        improvement: 'Put the exact business name in the homepage title and main heading, the same way it appears in your listings.',
        spoken: `Your business name doesn't actually appear on the front of your website — it's hard for Google and AI tools to be sure the site is yours.`,
        evidence: { urls: [urlOf(home)], quotes: [`title: “${clip(home.d!.title || 'none', 100)}”`, ...(home.d!.h1 ?? []).slice(0, 1).map((h) => `heading: “${clip(h, 100)}”`)], signal: 'name not found in homepage title, h1, markup or opening text' },
      });
    }
  }

  /* ── 3. where the business works ──────────────────────────────────────────────────────────────── */
  if (town && townStems.size) {
    const mentions = (p: SiteAuditPage) => statesAll(`${p.d!.title} ${(p.d!.h1 ?? []).join(' ')} ${(p.d!.h2 ?? []).join(' ')} ${p.d!.excerpt ?? ''}`, town);
    const homeSays = mentions(home);
    const mentioning = ok.filter(mentions);
    const servicePagesRead = ok.filter((p) => fam(p) === 'service' || dedicated.some((d) => d.url === urlOf(p)));
    if (!homeSays && mentioning.length === 0 && ok.length >= 2) {
      findings.push({
        id: 'location_unclear', kind: 'location_unclear', theme: 'location', confidence: 'high', priority: 64,
        title: `${town} is not mentioned on the site`,
        observed: `${town} does not appear in the title, headings or opening text of any of the ${ok.length} pages read.`,
        why: 'People search for local businesses by place. If the site never says where you work, Google and AI tools have little to match you to a local search.',
        improvement: `Say clearly where you are based and which areas you cover, on the homepage and the main service pages.`,
        spoken: `Your site doesn't actually say you're in ${town} anywhere I could see. That makes it harder for Google and AI tools to connect you with local searches.`,
        evidence: { urls: [urlOf(home)], quotes: [], signal: `“${town}” absent from ${ok.length} pages read` },
      });
    } else if (homeSays && servicePagesRead.length >= 2 && !servicePagesRead.some(mentions)) {
      findings.push({
        id: 'location_unclear', kind: 'location_unclear', theme: 'location', confidence: 'medium', priority: 44,
        title: `Service pages don't say where they are offered`,
        observed: `${town} is on the homepage, but none of the ${servicePagesRead.length} service pages read mentions it.`,
        why: 'Each service page stands on its own in a search, so one that never says where it is offered is less clearly local.',
        improvement: `Make it clear on each service page that you do the work in ${town} and the areas around it — written naturally, without copying the page for every town.`,
        spoken: `Your homepage says you're in ${town}, but your individual service pages don't — so each of those pages on its own doesn't say where you do the work.`,
        evidence: { urls: servicePagesRead.slice(0, EVIDENCE_URLS).map(urlOf), quotes: [], signal: `“${town}” on homepage, absent from ${servicePagesRead.length} service pages` },
      });
    } else if (homeSays) strengths.push(`${town} stated on the homepage`);
  }

  /* ── 4. internal linking ──────────────────────────────────────────────────────────────────────── */
  const homeLinks = Array.isArray(home.l) ? new Set(home.l.map((l) => safePath(l, input.servedUrl) ?? l.toLowerCase())) : null;
  const navPaths = new Set((input.nav ?? []).map((n) => safePath(n.url, input.servedUrl) ?? ''));
  const ownServicePages = dedicated.filter((d) => d.url && ok.some((p) => urlOf(p) === d.url)).map((d) => d.url!);
  if (homeLinks && ownServicePages.length >= 2) {
    const unlinked = ownServicePages.filter((u) => !homeLinks.has(pathOf(u)) && !navPaths.has(pathOf(u)));
    if (unlinked.length === ownServicePages.length || unlinked.length >= Math.ceil(ownServicePages.length * 0.6)) {
      findings.push({
        id: 'internal_linking', kind: 'internal_linking', theme: 'linking', confidence: 'high', priority: 54,
        title: 'Service pages are not linked from the homepage or menu',
        observed: `${unlinked.length} of ${ownServicePages.length} service pages are not linked from the homepage or the main menu${scope}.`,
        why: 'Pages nothing important links to look less important to Google and AI tools, and customers browsing the site cannot find them.',
        improvement: 'Link each main service from the menu and the homepage so the site clearly shows what the business offers.',
        spoken: "Your service pages aren't linked from your homepage or menu, so the pages that explain what you do are hard for people — and Google — to find.",
        evidence: { urls: unlinked.slice(0, EVIDENCE_URLS), quotes: [], signal: `${unlinked.length}/${ownServicePages.length} service pages with no link from homepage/menu` },
      });
    }
  }

  /* ── 5. proof ─────────────────────────────────────────────────────────────────────────────────── */
  const reviews = allBiz('reviews'), creds = allBiz('credentials'), guarantees = allBiz('guarantees'), experience = allBiz('experience');
  const workPages = ok.filter((p) => fam(p) === 'gallery' || fam(p) === 'reviews');
  const proofCount = reviews.length + creds.length + guarantees.length + experience.length + workPages.length;
  if (creds.length) strengths.push(`Credentials stated (${uniq(creds.map((c) => c.v.split(' — ')[0])).slice(0, 3).join(', ')})`);
  if (reviews.length) strengths.push('Customer reviews or testimonials shown');
  if (workPages.length) strengths.push('Past work or reviews have their own page');
  if (experience.length) strengths.push('Years in business stated');
  if (ok.length >= MIN_PAGES_FOR_ABSENCE + 1 && proofCount === 0) {
    findings.push({
      id: 'no_proof', kind: 'no_proof', theme: 'proof', confidence: 'medium', priority: 40,
      title: 'No reviews, credentials or examples of work found',
      observed: `None of the ${ok.length} pages read shows a customer review, an accreditation, a guarantee, years in business or examples of past work (a reviews widget loaded by script would not be visible to us).`,
      why: 'Evidence that a business is real and good is what customers — and Google and AI tools checking a business — look for.',
      improvement: 'Show real reviews, accreditations, years trading and examples of work on the main pages.',
      spoken: "I couldn't see any customer reviews, accreditations or examples of your work on the site. That's the kind of proof people — and Google — look for.",
      evidence: { urls: [urlOf(home)], quotes: [], signal: `0 proof items across ${ok.length} pages read` },
    });
  }

  /* ── ranking → the strongest few ──────────────────────────────────────────────────────────────── */
  const ranked = rankFindings(findings).slice(0, MAX_INSIGHT_FINDINGS);

  /* ── the honest opportunity, for when there is no fault worth raising ─────────────────────────── */
  const speakable = ranked.some((f) => f.priority >= SPEAK_MIN_PRIORITY);
  const opportunity = speakable ? null : pickOpportunity({ ok, home, urlOf, fam, statuses: judged, dedicated, town, leadServices: lead.services ?? [], proofCount, workPages, knownUrls: known });
  return {
    version: SALES_INSIGHTS_VERSION,
    state: speakable ? 'issues' : 'strong_site',
    findings: ranked, opportunity, strengths: strengths.slice(0, 6),
    services: statuses.slice(0, 12), basis,
  };
}

/** Strongest first; a tie goes to the finding with more evidence. Pure, stable. */
export function rankFindings<T extends { priority: number; confidence?: InsightConfidence; evidence?: { urls: string[] } }>(fs: T[]): T[] {
  return [...fs].map((f, i) => ({ f, i })).sort((a, b) =>
    b.f.priority - a.f.priority
    || (a.f.confidence === b.f.confidence ? 0 : a.f.confidence === 'high' ? -1 : 1)
    || (b.f.evidence?.urls.length ?? 0) - (a.f.evidence?.urls.length ?? 0) || a.i - b.i).map((x) => x.f);
}

/* ── the opportunity chain ────────────────────────────────────────────────────────────────────── */

export const SERVICE_PAGES_OPPORTUNITY_LINE = "Your site's actually in decent shape. What we'd mainly do is build stronger dedicated pages around each of your services, so Google and AI systems have a much clearer understanding of everything you offer and where you offer it.";
export const STRONG_SITE_LINE = "Your website's in good shape — I couldn't find anything wrong with it that I'd call out. So the work for you isn't really the site; it's the wider information about you that Google and AI systems read around the web, and keeping an eye on how you show up.";

/** The service-pages fallback, adapted to the services the site names when it names at least two. */
export function servicePagesLine(names: readonly string[]): string {
  return names.length >= 2
    ? `Your site's actually in decent shape. What we'd mainly do is build stronger dedicated pages around each of your services, like ${joinList(names.slice(0, 3))}, so Google and AI systems have a much clearer understanding of everything you offer and where you offer it.`
    : SERVICE_PAGES_OPPORTUNITY_LINE;
}

function pickOpportunity(c: {
  ok: SiteAuditPage[]; home: SiteAuditPage; urlOf: (p: SiteAuditPage) => string; fam: (p: SiteAuditPage) => string;
  statuses: ServiceStatus[]; dedicated: ServiceStatus[]; town: string; leadServices: readonly string[];
  proofCount: number; workPages: SiteAuditPage[]; knownUrls: string[];
}): SalesOpportunity | null {
  const names = c.dedicated.filter((s) => s.confidence === 'high').slice(0, 3).map((s) => s.name);
  const servicePages = c.ok.filter((p) => c.fam(p) === 'service' || c.dedicated.some((d) => d.url === c.urlOf(p)));
  const own = (p: SiteAuditPage) => c.urlOf(p);
  // 1. Few or no service pages and we cannot show each service has one → the genuine "build the pages" opportunity.
  if (c.dedicated.length < 3 && servicePages.length < 3) {
    return {
      kind: 'service_pages', services: names,
      observed: servicePages.length ? `${servicePages.length} service page${servicePages.length === 1 ? '' : 's'} found in the ${c.ok.length} pages read.` : `No dedicated service pages found in the ${c.ok.length} pages read.`,
      improvement: 'Build out clearer, better optimised pages for each of the main services.',
      spoken: servicePagesLine(names),
      evidence: { urls: servicePages.slice(0, EVIDENCE_URLS).map(own), quotes: [], signal: `${servicePages.length} service pages read` },
    };
  }
  // 2. They already have the pages → don't claim we need to create them. Are they light?
  const light = servicePages.filter((p) => (p.d!.words ?? 0) < LIGHT_SERVICE_WORDS);
  if (servicePages.length >= 3 && light.length >= Math.ceil(servicePages.length / 2)) {
    return {
      kind: 'deepen_services', services: names,
      observed: `${light.length} of ${servicePages.length} service pages read carry under ${LIGHT_SERVICE_WORDS} words.`,
      improvement: 'Deepen the service pages: what is included, who it is for, how it works and where it is offered.',
      spoken: "Your site's actually in decent shape, and you've already got a page for each of your main services. What we'd work on is making those pages more detailed — what's included, who it's for and where you cover — so Google and AI systems have more to go on.",
      evidence: { urls: light.slice(0, EVIDENCE_URLS).map(own), quotes: light.slice(0, 3).map((p) => `${own(p)} — ${p.d!.words ?? 0} words`), signal: `${light.length}/${servicePages.length} service pages light` },
    };
  }
  /* Nothing else is offered. ⛔ "Add more proof" was tried here and removed: a reviews widget loaded by script is
     invisible to a crawl, so it could be said of a business that has plenty. Where nothing real is found the site is
     simply strong (STRONG_SITE_LINE) — no manufactured opportunity. */
  return null;
}

/* ── what the script reads ────────────────────────────────────────────────────────────────────── */

/** Legacy technical kinds (siteFindings.ts) → their theme and ranking weight, so ONE ranking orders every
 *  point and the same issue is never said twice. A kind missing from this table is ranked low, never high. */
export const LEGACY_POINT: Record<string, { theme: InsightTheme; priority: number }> = {
  noindex_important_page: { theme: 'indexing', priority: 98 },
  sitemap_wrong_domain: { theme: 'sitemap', priority: 96 },
  canonical_off_domain: { theme: 'canonical', priority: 95 },
  crawler_blocked: { theme: 'crawler', priority: 92 },
  unreadable_homepage: { theme: 'readability', priority: 88 },
  schema_wrong_domain: { theme: 'schema', priority: 70 },
  duplicate_pages: { theme: 'duplicates', priority: 60 },
  thin_pages: { theme: 'thin', priority: 50 },
};

export interface RankablePoint { kind: string; theme: InsightTheme; priority: number; confidence: InsightConfidence }

/** One ordered list of what is worth saying: the technical findings the crawl already produced and the
 *  content findings above, one per theme, strongest first. Returns the picks as indices into each source
 *  so the caller keeps its own wording and its own proof. */
export function mergePoints(legacy: ReadonlyArray<{ kind: string }>, insights: SalesInsights | null | undefined, max: number = MAX_SPOKEN_POINTS): Array<{ from: 'legacy' | 'insight'; index: number }> {
  type Item = RankablePoint & { from: 'legacy' | 'insight'; index: number };
  const items: Item[] = [];
  legacy.forEach((f, index) => {
    const m = LEGACY_POINT[f.kind] ?? { theme: 'thin' as InsightTheme, priority: 10 };
    items.push({ kind: f.kind, theme: m.theme, priority: m.priority, confidence: 'high', from: 'legacy', index });
  });
  (insights?.findings ?? []).forEach((f, index) => { if (f.priority >= SPEAK_MIN_PRIORITY) items.push({ kind: f.kind, theme: f.theme, priority: f.priority, confidence: f.confidence, from: 'insight', index }); });
  const seen = new Set<InsightTheme>();
  const out: Array<{ from: 'legacy' | 'insight'; index: number }> = [];
  for (const it of [...items].map((x, i) => ({ x, i })).sort((a, b) => b.x.priority - a.x.priority || a.i - b.i).map((s) => s.x)) {
    if (seen.has(it.theme)) continue;
    seen.add(it.theme);
    out.push({ from: it.from, index: it.index });
    if (out.length >= max) break;
  }
  return out;
}

/** A stored `result.insights` that is current and well-formed — anything else is "no insights", never half of one. */
export function usableInsights(raw: unknown): SalesInsights | null {
  const r = raw as Partial<SalesInsights> | null | undefined;
  if (!r || typeof r !== 'object' || r.version !== SALES_INSIGHTS_VERSION) return null;
  if (r.state !== 'issues' && r.state !== 'strong_site' && r.state !== 'unreadable') return null;
  if (!Array.isArray(r.findings)) return null;
  return r as SalesInsights;
}
