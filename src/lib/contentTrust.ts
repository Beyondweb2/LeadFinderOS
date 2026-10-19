/* ════════════════════════════════════════════════════════════════════════════════════════════════
   CONTENT & TRUST CHECKS — what a person notices reading a site, read off the pages the crawl already
   fetched (Paul, 2026-10-11; branch feat/crawl-content-trust-checks).

   WHY. The crawl found the TECHNICAL faults (a blocked crawler, an empty homepage, town-swap pages,
   thin pages, a missing H1) and nothing else, so a site with vague headings, unnamed accreditations,
   empty "Project 1 / 2 / 3" blocks, two different "years in business" figures and logos captioned
   with the wrong company read as CLEAN (electelectrical.com, hand-checked 2026-10-11). This module adds
   the content and trust half, in line with the Findable AI Visibility Master Standard (9 Oct 2026).

   TWO STEPS, SO BOTH CRAWLS SHARE ONE RULE:
     pageObservations(html, url, homeUrl) → a SMALL per-page record (PageObs). The quick crawl
       (crawl-check) builds it in memory; the full crawl's worker stores it on each crawl_urls row
       (evidence.ct) because the raw HTML is gone by the time the job finalises.
     buildContentTrust({ pages, … }) → ranked ContentIssue[]. One builder, both crawls.

   EVERY ISSUE CARRIES: a plain-English title · why it may matter to AI · severity (high / medium /
   low) · the Master Standard evidence class (A platform-confirmed, B supported best practice,
   C experimental) · the actual evidence (a quote, a file name or an address) · what the business
   would need to supply · one spoken line for a call.

   ⛔ THE MASTER STANDARD RULES, ENFORCED BY scripts/content-trust.test.ts:
     · An absence is said as "We couldn't find …", never "You don't have …" — a crawl can miss things.
     · Never suggest inventing facts, awards, reviews, accreditations or office locations: the business
       supplies only what is genuinely true.
     · Area advice says "only where genuinely true and useful" and never asks for town-swap pages.
     · Never llms.txt, never a promise of rankings, citations or being recommended, and never "change
       the dates to look fresh".
     · Never a claim about how an AI decides (CLAUDE.md §6): "may", "can make it harder", "gives … less".
   ⛔ PURE. No fetch, no DOM, no I/O, no model call. Edge functions import it with relative `.ts` paths.
   ⛔ SEPARATE KEY, SEPARATE VERSION. Stored at result.contentTrust with CONTENT_TRUST_VERSION; it never
     touches `signals`, so the audit_followup_fault gate and every stored row behave exactly as before.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { visibleText } from './crawlCheck.ts';
import { CREDENTIALS, fullPageFamily, jsonLdNodes, type FullPageFamily } from './fullCrawl.ts';
import { robotsAllows, robotsRulesFor } from './crawlUrl.ts';

/** Bump when the MEANING of a stored issue changes. Rows with an older (or no) version show nothing new. */
export const CONTENT_TRUST_VERSION = 1;

/** ⛔ A PAGE IS BROKEN ONLY WHEN THE SITE SAYS IT IS NOT THERE (404 / 410) OR ITS SERVER FAILED (5xx) — 2026-10-15.
 *  401 / 403 / 429 and the rest mean the site refused or rate-limited OUR crawler (a live site answered 13 pages 429 to a
 *  fast crawl): that is not a broken page for a customer, so it is never an issue — it is said as "not checked". */
export function isBrokenPageStatus(status: number | null | undefined): boolean {
  return status === 404 || status === 410 || (typeof status === 'number' && status >= 500 && status < 600);
}
/** The crawler-refusal statuses: said as not checked, never as broken. */
export function isCrawlerRefusedStatus(status: number | null | undefined): boolean {
  return status === 401 || status === 403 || status === 429;
}

export type IssueSeverity = 'high' | 'medium' | 'low';
/** The Findable AI Visibility Master Standard's evidence classes (9 Oct 2026). */
export type EvidenceClass = 'A' | 'B' | 'C';
export const EVIDENCE_CLASS_LABELS: Record<EvidenceClass, string> = {
  A: 'A · platform-confirmed',
  B: 'B · supported best practice',
  C: 'C · experimental',
};

export type ContentTrustKind =
  | 'robots_blocks_ai' | 'no_https' | 'placeholder_content' | 'broken_links' | 'schema_mismatch'
  | 'conflicting_facts' | 'no_proof' | 'accreditations_unnamed' | 'vague_headings' | 'area_coverage'
  | 'ai_images' | 'link_mismatch' | 'no_viewport' | 'logo_alt_mismatch' | 'image_alt' | 'identical_dates'
  | 'generic_copy' | 'mixed_audience' | 'missing_entity_facts' | 'no_people' | 'no_accreditations'
  | 'schema_incomplete' | 'schema_unverified' | 'dead_links' | 'orphan_pages' | 'no_sitemap';

/** Where a kind sits in the operator's grouped audit (siteAudit categories). */
export type ContentTrustCategory = 'discovery' | 'ai_access' | 'entity' | 'content' | 'structured_data' | 'technical' | 'local_evidence';

/** Fixed per kind: its evidence class, its audit group, and its place among equal severities (lower
 *  first). Severity is decided per finding (an "approved" claim with no scheme is medium; no claim at
 *  all is low) but never computed into a score. */
export const CONTENT_TRUST_KINDS: Record<ContentTrustKind, { evidenceClass: EvidenceClass; category: ContentTrustCategory; priority: number }> = {
  robots_blocks_ai: { evidenceClass: 'A', category: 'ai_access', priority: 1 },
  no_https: { evidenceClass: 'A', category: 'discovery', priority: 2 },
  placeholder_content: { evidenceClass: 'B', category: 'local_evidence', priority: 3 },
  schema_mismatch: { evidenceClass: 'A', category: 'structured_data', priority: 4 },
  conflicting_facts: { evidenceClass: 'B', category: 'entity', priority: 5 },
  no_proof: { evidenceClass: 'B', category: 'local_evidence', priority: 6 },
  accreditations_unnamed: { evidenceClass: 'B', category: 'local_evidence', priority: 7 },
  vague_headings: { evidenceClass: 'B', category: 'content', priority: 8 },
  area_coverage: { evidenceClass: 'B', category: 'local_evidence', priority: 9 },
  ai_images: { evidenceClass: 'B', category: 'local_evidence', priority: 10 },
  link_mismatch: { evidenceClass: 'B', category: 'discovery', priority: 11 },
  broken_links: { evidenceClass: 'A', category: 'discovery', priority: 12 },
  no_viewport: { evidenceClass: 'A', category: 'technical', priority: 13 },
  logo_alt_mismatch: { evidenceClass: 'B', category: 'content', priority: 14 },
  image_alt: { evidenceClass: 'A', category: 'technical', priority: 15 },
  identical_dates: { evidenceClass: 'B', category: 'content', priority: 16 },
  generic_copy: { evidenceClass: 'B', category: 'content', priority: 17 },
  mixed_audience: { evidenceClass: 'B', category: 'content', priority: 18 },
  missing_entity_facts: { evidenceClass: 'B', category: 'entity', priority: 19 },
  no_people: { evidenceClass: 'B', category: 'entity', priority: 20 },
  no_accreditations: { evidenceClass: 'B', category: 'local_evidence', priority: 21 },
  schema_incomplete: { evidenceClass: 'A', category: 'structured_data', priority: 22 },
  schema_unverified: { evidenceClass: 'A', category: 'structured_data', priority: 23 },
  dead_links: { evidenceClass: 'B', category: 'discovery', priority: 24 },
  orphan_pages: { evidenceClass: 'A', category: 'discovery', priority: 25 },
  no_sitemap: { evidenceClass: 'A', category: 'discovery', priority: 26 },
};

export interface ContentIssue {
  kind: ContentTrustKind;
  severity: IssueSeverity;
  evidenceClass: EvidenceClass;
  /** Plain English, prospect-safe. An absence starts "We couldn't find". */
  title: string;
  /** Why it may matter to AI — hedged, never a claim about how an AI decides. */
  why: string;
  /** The actual evidence: quotes, file names, "label → address". Verbatim where it was read. */
  evidence: string[];
  /** The pages it was seen on (or that are affected). */
  urls: string[];
  /** What the business would need to supply. Never asks for anything invented. */
  needs: string;
  /** One line a salesperson can say on a call. */
  spoken: string;
  /** True for a "we couldn't find" issue: only as true as the pages read. */
  absence?: boolean;
}

export interface ContentTrust {
  version: number;
  issues: ContentIssue[];
  /** Things the evidence confirmed are fine — said, so a clean check reads as checked. */
  verified: string[];
  /** Checks that could not be made on this evidence. */
  notChecked: string[];
  pagesRead: number;
}

/* ── one page → its observations ──────────────────────────────────────────────────────────────── */

export interface PageObs {
  url: string;
  family: FullPageFamily;
  status: number;
  title: string;
  h1: string[];
  words: number;
  viewport: boolean;
  /** Company-level "N years" claims (a person's own career is excluded). */
  years: Array<{ n: number; q: string }>;
  founded: Array<{ y: number; q: string }>;
  companyNo: string | null;
  /** Named schemes found in the text or in an image's name / alt text. */
  creds: string[];
  /** An "accredited / approved" claim that names no scheme. */
  vagueCreds: string[];
  reviews: string[];
  cases: string[];
  people: boolean;
  /** "Project 1" → "#", lorem ipsum, "your text here". */
  placeholders: string[];
  /** Other links that go nowhere (href "#", javascript:). */
  deadLinks: string[];
  /** Short internal link labels and the path each points to. */
  links: Array<{ t: string; p: string }>;
  /** A phone number linked as an email, an email linked as a phone. */
  contactMix: string[];
  /** `photos`: one key per photo (its file name; "!" first when it has no alt text), so the site total counts each once. */
  img: { n: number; noAlt: number; ai: string[]; altBad: string[]; logos: number; photos?: string[] };
  /** Post dates on this page, as YYYY-MM-DD, keyed by the post address they belong to. */
  dates: Array<{ p: string; d: string }>;
  places: string[];
  schema: { blocks: number; bad: number; biz: Array<{ name: string; tel: string; pc: string; url: string }> };
  phones: string[];
  postcodes: string[];
  generic: string[];
  specifics: number;
  audience: { com: boolean; dom: boolean };
}

/* Small text helpers — local on purpose (siteAudit imports THIS file; importing it back would cycle). */
function decode(s: string): string {
  return String(s || '')
    .replace(/&amp;/gi, '&').replace(/&nbsp;/gi, ' ').replace(/&#0?39;|&apos;|&rsquo;|&lsquo;|&#x27;/gi, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/gi, '"').replace(/&ndash;|&mdash;/gi, '-').replace(/&pound;/gi, '£')
    .replace(/&#(\d+);/g, (m, d) => { try { return String.fromCodePoint(Number(d)); } catch { return m; } })
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return m; } })
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&rarr;/gi, '→');
}
const tagText = (s: string) => decode(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim();
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const uniq = <T,>(xs: T[]) => [...new Set(xs)];
const pathOf = (u: string) => { try { return new URL(u).pathname.replace(/\/+$/, '') || '/'; } catch { return u; } };
const attr = (tag: string, name: string) => decode(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag)?.slice(1).find((x) => x !== undefined) ?? '').trim();
const hasAttr = (tag: string, name: string) => new RegExp(`\\s${name}(?:\\s*=|\\s|>|/)`, 'i').test(tag);
/** A short verbatim quote around a match, cut at whole words (never "ustrial specialists"). */
const quote = (text: string, index: number, len: number, around = 70) => {
  let a = Math.max(0, index - around), b = Math.min(text.length, index + len + around);
  if (a > 0) { const sp = text.indexOf(' ', a); a = sp >= 0 && sp < index ? sp + 1 : index; }
  if (b < text.length) { const sp = text.lastIndexOf(' ', b); b = sp > index + len ? sp : index + len; }
  return clip(`${a > 0 ? '…' : ''}${text.slice(a, b).replace(/\s+/g, ' ').trim()}${b < text.length ? '…' : ''}`, 220);
};
const STOP = new Set(['the', 'and', 'ltd', 'limited', 'llp', 'plc', 'co', 'company', 'uk', 'of', 'in', 'group', 'mr', 'mrs', 'amp', 'for', 'a', 'an', 'to', 'our', 'your', 'we', 'you', 'with', 'at', 'by', 'on', 'is', 'are']);
export function words(s: string | null | undefined): string[] {
  return String(s ?? '').toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9\s'-]/g, ' ').split(/[\s-]+/)
    .map((w) => w.replace(/^'+|'+$/g, '').replace(/'s$/, '')).filter((w) => w.length >= 2 && !STOP.has(w));
}
/** A file name as words: decoded, extension and CDN hash prefixes dropped. */
export function fileWords(src: string): string {
  let base = String(src || '').split(/[?#]/)[0].split('/').pop() ?? '';
  try { base = decodeURIComponent(base); } catch { /* keep raw */ }
  return base.replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/^[0-9a-f]{16,}_/i, '')          // Webflow: <24 hex>_name
    .replace(/-p-\d+$/i, '')                  // Webflow responsive suffix
    .replace(/[_\-.,]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Claimed "N years" that belong to the BUSINESS. A sentence about one person's career is not the
 *  company's age ("Rob has spent 20 years…"), so it never makes a conflict. */
const YEARS_RE = /\b(?:(more than|over|almost|nearly|around|about)\s+)?(\d{1,2})\s*(\+)?\s*(?:years?|yrs)['’]?\s+(?:of\s+)?(?:experience|in business|trading|in the (?:trade|industry)|serving)/gi;
const PERSONAL_RE = /\b(?:he|she|his|her|has spent|has worked|have worked|started (?:his|her)|career|apprentice|i have|i've|myself)\b/i;
const FOUNDED_RE = /\b(?:established|est\.?|founded|trading since|since|started in)\s+(?:in\s+)?((?:19|20)\d{2})\b/gi;
const COMPANY_NO_RE = /\b(?:company|registration|reg\.?|registered)\s*(?:no\.?|number|num\.?)?\s*[:.]?\s*((?:SC|NI|OC)?\d{6,8})\b|\bregistered in (?:england|scotland|wales|northern ireland)[^.]{0,60}?\b((?:SC|NI|OC)?\d{8})\b/i;
const VAGUE_CRED_RE = /\b(?:accredited|fully accredited|approved (?:electrician|contractor|installer|engineer|tradesm[ae]n|plumber|gas engineer)s?|certified (?:electrician|installer|engineer|contractor)s?|registered (?:installer|electrician|contractor|engineer)s?|industry[- ]approved|fully (?:qualified|certified))\b/gi;
const REVIEW_RE = /\b(?:testimonials?|what (?:our|my) (?:customers|clients) say|customer reviews?|google reviews?|reviews? from|rated \d(?:\.\d)? (?:out of|\/) ?5|\d(?:\.\d)? ?(?:stars?|★)|five[- ]star|5[- ]star|would (?:highly )?recommend|highly recommended|trustpilot|checkatrade|trustatrader|rated people|mybuilder)\b|★{3,}/i;
/** Only an explicit case study counts — "the result" or "recent projects" in a blog post is not proof of work. */
const CASE_RE = /\bcase stud(?:y|ies)\b/i;
const PEOPLE_RE = /\b(?:owner|founder|co-founder|director|managing director|proprietor|my name is|i'm [A-Z][a-z]+|run by|family[- ]run|meet the team|our team)\b/i;
const PLACEHOLDER_TEXT_RE = /\blorem ipsum\b|\byour (?:title|text|heading|content|description) here\b|\b(?:click|double[- ]click) (?:here )?to (?:add|edit)\b|\binsert (?:text|image|title)\b|\bsample (?:text|page)\b/i;
const PLACEHOLDER_LABEL_RE = /^(?:project|case study|item|post|blog post|title|heading|button|link|card|image|service|testimonial|review|feature)\s*\d+$/i;
const AI_FILE_RE = /\b(?:chatgpt\s*image|dall\s*e|midjourney|stable\s*diffusion|firefly|ai\s*generated|gemini\s*generated|leonardo\s*ai|openai)\b/i;
const PHONE_RE = /(?:\+44\s?\(?0?\)?\s?|\b0)(?:\d[\s-]?){9,10}\b/g;
const POSTCODE_RE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/g;
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MON = '(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
const DATE_RES = [
  new RegExp(`\\b${MON}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+((?:19|20)\\d{2})\\b`, 'i'),
  new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MON}\\.?,?\\s+((?:19|20)\\d{2})\\b`, 'i'),
];
const humanDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  const mon = MONTHS[m - 1] ?? '';
  return `${d} ${mon.charAt(0).toUpperCase()}${mon.slice(1)} ${y}`;
};
function isoDate(text: string): string | null {
  for (const [i, re] of DATE_RES.entries()) {
    const m = re.exec(text);
    if (!m) continue;
    const mon = i === 0 ? m[1] : m[2];
    const day = Number(i === 0 ? m[2] : m[1]);
    const mi = MONTHS.findIndex((x) => x.startsWith(mon.toLowerCase().slice(0, 3)));
    if (mi < 0 || day < 1 || day > 31) continue;
    return `${m[3]}-${String(mi + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return null;
}
/** Words that only ever pad a heading or a link label. */
const FILLER = new Set(['explore', 'learn', 'more', 'read', 'view', 'see', 'find', 'out', 'discover', 'all', 'go', 'click', 'here', 'back',
  'about', 'us', 'home', 'welcome', 'news', 'blog', 'post', 'posts', 'articles', 'article', 'contact', 'services', 'service', 'projects', 'project',
  'work', 'how', 'it', 'get', 'touch', 'quote', 'free', 'now', 'today', 'page', 'next', 'previous', 'prev', 'menu', 'call', 'email', 'book', 'started',
  'clients', 'client', 'privacy', 'policy', 'terms', 'cookies', 'faq', 'faqs', 'gallery', 'team', 'careers', 'jobs', 'shop', 'help', 'support']);
/** Words that name a trade only in general — a heading made of these and the business's own name says nothing specific. */
const GENERIC_TRADE = new Set(['electrical', 'electrician', 'electricians', 'electric', 'electrics', 'contractor', 'contractors', 'contracting',
  'services', 'service', 'solutions', 'specialists', 'specialist', 'experts', 'expert', 'professional', 'professionals', 'local', 'company',
  'plumber', 'plumbers', 'plumbing', 'builder', 'builders', 'building', 'roofer', 'roofers', 'roofing', 'locksmith', 'locksmiths',
  'trades', 'trade', 'engineers', 'engineer', 'engineering', 'maintenance', 'general', 'quality', 'reliable', 'trusted', 'best', 'leading']);
/** Service words across the trades we sell to. A homepage heading naming one of these is about something. */
const SERVICE_WORDS = /\b(?:electric\w*|rewir\w*|wiring|lighting|lights?|ev|charg\w*|solar|pv|battery|batteries|fuse ?boards?|consumer units?|eicr|testing|inspections?|alarms?|cctv|security|data|plumb\w*|boilers?|heating|gas|bathrooms?|kitchens?|drain\w*|blocked|leaks?|pipes?|water|roof\w*|gutter\w*|chimneys?|fascias?|flat roofs?|tiling|tiler|locks?|locksmith\w*|doors?|windows?|glaz\w*|upvc|build\w*|extensions?|lofts?|conversions?|renovations?|plaster\w*|decorat\w*|painters?|carpent\w*|joiner\w*|fencing|landscap\w*|gardens?|paving|driveways?|cleaning|cleaners?|pest|removals?|accountan\w*|tax|bookkeep\w*|dentist\w*|dental|solicitors?|legal|garage|mot|servicing|repairs?|installations?|install\w*|air con\w*|hvac|refrigerat\w*|commercial|industrial|domestic|residential)\b/i;
/** Stock phrases must be DENSE to call a page generic: at least one per this many words (a long page with three is not). */
const GENERIC_PER_WORDS = 300;
const GENERIC_PHRASES = [
  'clear communication', 'accountable delivery', 'technical capability', 'high quality', 'highest standards', 'high standards',
  'attention to detail', 'peace of mind', 'second to none', 'one-stop shop', 'one stop shop', 'no job too small', 'competitive prices',
  'competitive rates', 'customer satisfaction', 'reliable and professional', 'professional and reliable', 'we pride ourselves', 'pride ourselves',
  'committed to', 'tailored solutions', 'tailored to your', 'bespoke solutions', 'seamless', 'cutting-edge', 'cutting edge', 'industry-leading',
  'industry leading', 'state-of-the-art', 'state of the art', 'end-to-end', 'end to end', 'from start to finish', 'from conversation to completion',
  'trusted partner', 'value for money', 'friendly and professional', 'look no further', 'every step of the way', 'hassle-free',
  'hassle free', 'excellence', 'diligent planning', 'hands-on knowledge', 'trusted working relationships', 'proven track record',
];
const COMMERCIAL_RE = /\b(?:commercial|industrial|c&i|b2b|businesses|factories|warehouses?|offices|facilities management|contractors?)\b/i;
const DOMESTIC_RE = /\b(?:domestic|residential|homeowners?|households?|your home|home ?owners?|elect home|homes)\b/i;
const PLACE_PREP_RE = /\b(?:in|across|throughout|covering|cover|covers|serving|serve|serves|around|near|based in|areas? of)\s+((?:the\s+)?[A-Z][a-zA-Z'’]+(?:[ -](?:upon|on|under|le|de|in|by)?[ -]?[A-Z][a-zA-Z'’]+){0,2})/g;
const NOT_PLACE = new Set(['the', 'our', 'your', 'we', 'all', 'each', 'every', 'any', 'this', 'that', 'these', 'business', 'businesses', 'commercial', 'industrial',
  'domestic', 'residential', 'addition', 'order', 'touch', 'case', 'line', 'time', 'place', 'practice', 'person', 'house', 'stock', 'charge', 'total',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december', 'monday', 'tuesday',
  'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'google', 'ai', 'chatgpt', 'gemini', 'english', 'british', 'general', 'particular', 'short',
  'summary', 'advance', 'mind', 'scope', 'future', 'project', 'projects', 'complex', 'existing', 'new', 'one', 'two', 'three', 'plan', 'phase', 'phases', 'site', 'sites']);

/** Everything the content checks need from ONE page, kept small enough to store per crawled page. */
export function pageObservations(html: string, pageUrl: string, homeUrl: string, status = 200): PageObs {
  const raw = String(html || '');
  const url = pageUrl;
  const text = decode(visibleText(raw)).replace(/[​-‍﻿]/g, '').replace(/\s+/g, ' ').trim();
  const head = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(raw)?.[1] ?? raw.slice(0, 60_000);
  const h1 = [...raw.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => clip(tagText(m[1]), 160)).filter(Boolean).slice(0, 5);
  const obs: PageObs = {
    url, family: fullPageFamily(url, homeUrl), status,
    title: clip(tagText(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1] ?? ''), 200),
    h1, words: text ? text.split(/\s+/).filter(Boolean).length : 0,
    viewport: /<meta\b[^>]*name=["']viewport["']/i.test(head),
    years: [], founded: [], companyNo: null, creds: [], vagueCreds: [], reviews: [], cases: [], people: false,
    placeholders: [], deadLinks: [], links: [], contactMix: [],
    img: { n: 0, noAlt: 0, ai: [], altBad: [], logos: 0, photos: [] },
    dates: [], places: [], schema: { blocks: 0, bad: 0, biz: [] }, phones: [], postcodes: [], generic: [], specifics: 0,
    audience: { com: false, dom: false },
  };

  // Years in business — the company's claim, never one person's career.
  for (const m of text.matchAll(YEARS_RE)) {
    const before = text.slice(Math.max(0, (m.index ?? 0) - 120), m.index ?? 0);
    const sentenceStart = Math.max(before.lastIndexOf('. '), before.lastIndexOf('! '), before.lastIndexOf('? '));
    const sentence = before.slice(sentenceStart + 1) + m[0];
    if (PERSONAL_RE.test(sentence)) continue;
    const n = Number(m[2]);
    if (n >= 2 && n <= 99 && obs.years.length < 6) obs.years.push({ n, q: quote(text, m.index ?? 0, m[0].length, 40) });
  }
  for (const m of text.matchAll(FOUNDED_RE)) {
    const y = Number(m[1]);
    if (y >= 1850 && y <= new Date().getUTCFullYear() && obs.founded.length < 4) obs.founded.push({ y, q: quote(text, m.index ?? 0, m[0].length, 40) });
  }
  const cn = COMPANY_NO_RE.exec(text);
  if (cn) obs.companyNo = cn[1] || cn[2] || null;

  // Images: alt text, AI-generated file names, logos captioned with another company's name.
  const seenSrc = new Set<string>();
  const imgText: string[] = [];
  const re = /<a\b([^>]*)>((?:(?!<a\b)[\s\S])*?)<\/a>|<img\b[^>]*>/gi;
  for (const m of raw.matchAll(re)) {
    const isLink = m[0].toLowerCase().startsWith('<a');
    const imgs = isLink ? [...(m[2] ?? '').matchAll(/<img\b[^>]*>/gi)].map((x) => x[0]) : [m[0]];
    const href = isLink ? attr(`<a ${m[1]}>`, 'href') : '';
    for (const tag of imgs) {
      const src = attr(tag, 'src') || attr(tag, 'data-src');
      if (!src || src.startsWith('data:') || seenSrc.has(src)) continue;
      seenSrc.add(src);
      const alt = hasAttr(tag, 'alt') ? attr(tag, 'alt') : '';
      const fw = fileWords(src);
      imgText.push(`${alt} ${fw}`);
      /* Icons are decorative and rightly have no alt — svg / icon / arrow names are not counted. */
      const icon = /\.svg(?:$|\?)/i.test(src) && !/logo/i.test(alt) || /\b(?:icon|arrow|chevron|close|menu|hamburger|spinner|loader|pixel|tracking|spacer)\b/i.test(fw);
      /* Photos and pictures only: icons are decorative, and a logo's caption has its own check below. */
      if (!icon && !/\blogo$/i.test(alt)) { obs.img.n++; if (!alt) obs.img.noAlt++; if ((obs.img.photos?.length ?? 0) < 40) obs.img.photos?.push(`${alt ? '' : '!'}${clip(fw || src, 80)}`); }
      if (AI_FILE_RE.test(fw) && obs.img.ai.length < 6) obs.img.ai.push(clip(fw, 90));
      const logoAlt = /^(.{2,60}?)\s+logo$/i.exec(alt);
      if (logoAlt) {
        obs.img.logos++;
        const altW = words(logoAlt[1]).filter((w) => w.length >= 3 && !/^\d+$/.test(w));
        let host = '';
        try { host = href && /^https?:/i.test(href) ? new URL(href).hostname.replace(/^www\./, '') : ''; } catch { /* no host */ }
        const fileW = words(fw).filter((w) => w !== 'logo' && w !== 'logos' && w.length >= 3 && !/^\d+$/.test(w));
        const hay = `${fw} ${host}`.toLowerCase().replace(/[^a-z0-9]/g, '');
        /* Only when the image's own file (or the site it links to) clearly names something, and the
           caption's name is nowhere in it. A caption naming nothing checkable is never judged. */
        if (altW.length && (fileW.length || host) && !altW.some((w) => hay.includes(w)) && obs.img.altBad.length < 20) {
          obs.img.altBad.push(`“${alt}” on ${clip(fw || src, 60)}${host ? ` (links to ${host})` : ''}`);
        }
      }
    }
  }

  // Accreditations: named schemes anywhere in the text or in an image's alt / file name (logos).
  const credHay = `${text} ${imgText.join(' ')}`;
  for (const c of CREDENTIALS) {
    if (/^(?:Fully insured|DBS checked)$/.test(c.name)) continue;
    if (c.re.test(credHay)) obs.creds.push(c.name);
  }
  for (const m of text.matchAll(VAGUE_CRED_RE)) {
    if (obs.vagueCreds.length >= 4) break;
    obs.vagueCreds.push(quote(text, m.index ?? 0, m[0].length, 30));
  }

  // Proof: reviews / testimonials / case studies; review markup counts too.
  const nodes = jsonLdNodes(raw);
  const typesOf = (n: Record<string, unknown>): string[] => (Array.isArray(n?.['@type']) ? n['@type'] as unknown[] : n?.['@type'] ? [n['@type']] : []).map(String);
  if (nodes.some((n) => typesOf(n).some((t) => /^(?:Review|AggregateRating)$/i.test(t)))) obs.reviews.push('Review markup in the page code');
  const rm = REVIEW_RE.exec(text);
  if (rm) obs.reviews.push(quote(text, rm.index, rm[0].length, 50));
  if (/trustpilot-widget|trustbox|reviews?-widget|google-reviews|trustindex|reviews\.io|feefo|yotpo|elfsight[^"'>]{0,40}review/i.test(raw)) obs.reviews.push('A reviews widget is on the page');
  const cm = CASE_RE.exec(text);
  if (cm || obs.family === 'gallery') obs.cases.push(cm ? quote(text, cm.index, cm[0].length, 50) : `Projects page: ${pathOf(url)}`);
  obs.people = PEOPLE_RE.test(text);

  // Links: placeholders, links to nowhere, label vs destination, phone ↔ email mix-ups.
  const labelSeen = new Set<string>();
  for (const m of raw.matchAll(/<a\b([^>]*)>((?:(?!<a\b)[\s\S])*?)<\/a>/gi)) {
    const href = attr(`<a ${m[1]}>`, 'href');
    const label = tagText(m[2]).replace(/[→>›»]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!label || !hasAttr(`<a ${m[1]}>`, 'href')) continue;   // an <a> with no href is not a link at all
    const nowhere = href === '#' || href === '' && hasAttr(`<a ${m[1]}>`, 'href') || /^javascript:/i.test(href);
    /* A menu parent that opens a submenu ("#" + a toggle, or a list straight after it) is UI, not a dead link. */
    const opensMenu = /dropdown|toggle|aria-haspopup|aria-expanded|data-(?:bs-)?toggle|submenu|has-children/i.test(m[1])
      || /^\s*(?:<\/?(?:span|i|svg|b)\b[^>]*>\s*)*<(?:ul|div)\b/i.test(raw.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 200));
    if (nowhere && opensMenu) continue;
    if (nowhere) {
      if (PLACEHOLDER_LABEL_RE.test(label)) { if (obs.placeholders.length < 8) obs.placeholders.push(`“${label}” links to “${href || '#'}”`); }
      else if (obs.deadLinks.length < 8 && !obs.deadLinks.includes(label) && !/^(?:menu|close|open|toggle|search|skip|top|back to top)$/i.test(label)) obs.deadLinks.push(label);
      continue;
    }
    const digits = label.replace(/\D/g, '');
    if (/^mailto:/i.test(href) && digits.length >= 10 && /^[+\d\s()-]+$/.test(label) && obs.contactMix.length < 4) {
      obs.contactMix.push(`The phone number “${label}” is linked as an email (${clip(href, 60)})`);
    } else if (/^tel:/i.test(href) && /@/.test(label) && obs.contactMix.length < 4) {
      obs.contactMix.push(`The email “${label}” is linked as a phone number (${clip(href, 60)})`);
    }
    let abs: URL | null = null;
    try { abs = new URL(href, url); } catch { abs = null; }
    if (!abs || !/^https?:$/.test(abs.protocol)) continue;
    let same = false;
    try { same = abs.hostname.replace(/^www\./, '') === new URL(homeUrl).hostname.replace(/^www\./, ''); } catch { same = false; }
    if (!same || abs.hash && abs.pathname === new URL(url).pathname) continue;
    const words4 = label.split(/\s+/).filter(Boolean);
    if (words4.length > 4 || label.length > 40) continue;
    const key = `${label.toLowerCase()}→${abs.pathname}`;
    if (labelSeen.has(key) || obs.links.length >= 60) continue;
    labelSeen.add(key);
    obs.links.push({ t: label, p: abs.pathname.replace(/\/+$/, '') || '/' });
  }
  const ph = PLACEHOLDER_TEXT_RE.exec(text);
  if (ph) obs.placeholders.push(`“${quote(text, ph.index, ph[0].length, 30)}”`);

  // Dates: a post listing ties each date to the post it links to; a post page carries its own.
  for (const m of raw.matchAll(/<a\b([^>]*)>((?:(?!<a\b)[\s\S])*?)<\/a>/gi)) {
    const href = attr(`<a ${m[1]}>`, 'href');
    if (!/\/(?:post|posts|blog|news|article|articles)\/|\/20\d\d\//i.test(href)) continue;
    const d = isoDate(tagText(m[2]));
    if (d && obs.dates.length < 40) obs.dates.push({ p: pathOf(new URL(href, url).href), d });
  }
  if (obs.family === 'blog' && pathOf(url).split('/').filter(Boolean).length >= 2) {
    const t = /<time\b[^>]*datetime=["'](\d{4}-\d{2}-\d{2})/i.exec(raw)?.[1]
      ?? nodes.map((n) => String(n?.datePublished ?? '')).find((x) => /^\d{4}-\d{2}-\d{2}/.test(x))?.slice(0, 10)
      ?? isoDate(text.slice(0, 1500));
    if (t) obs.dates.push({ p: pathOf(url), d: t });
  }

  // Places named (for the area check): after "in / across / serving …", an areas list, markup.
  const places = new Set<string>();
  const addPlace = (p: string) => {
    /* The page's text runs headings into sentences ("in Wirral We cover…"): drop trailing words that are never
       part of a place before judging what is left. */
    const parts = p.replace(/^the\s+/i, '').replace(/[’']s$/, '').trim().split(/\s+/);
    while (parts.length > 1) {
      const last = parts[parts.length - 1].toLowerCase();
      if (NOT_PLACE.has(last) || FILLER.has(last) || STOP.has(last) || GENERIC_TRADE.has(last) || SERVICE_WORDS.test(last)) parts.pop(); else break;
    }
    const clean = parts.join(' ');
    const first = clean.split(/[\s-]+/)[0]?.toLowerCase() ?? '';
    if (clean.length < 3 || clean.length > 40 || NOT_PLACE.has(first) || !/^[A-Z]/.test(clean)) return;
    /* Never a service or trade word ("Electric Vehicle Charging" is not a town). */
    if (clean.toLowerCase().split(/[\s-]+/).some((w) => SERVICE_WORDS.test(w) || GENERIC_TRADE.has(w) || FILLER.has(w) || NOT_PLACE.has(w))) return;
    places.add(clean);
  };
  for (const m of text.matchAll(PLACE_PREP_RE)) addPlace(m[1]);
  const areasHead = /<h[2-4]\b[^>]*>[^<]*\b(?:areas?|locations?)\b[^<]*(?:cover|serve|work)?[^<]*<\/h[2-4]>([\s\S]{0,3000})/i.exec(raw);
  if (areasHead) {
    for (const item of tagText(areasHead[1].replace(/<\/(?:li|p|div|span|a)>/gi, ', ')).slice(0, 500).split(/[,•|·\n]|\band\b/)) {
      const t = item.trim();
      if (/^[A-Z][a-zA-Z'’-]+(?:\s[A-Z][a-zA-Z'’-]+){0,2}$/.test(t)) addPlace(t);
    }
  }
  for (const n of nodes) {
    const as = Array.isArray(n?.areaServed) ? n.areaServed : n?.areaServed ? [n.areaServed] : [];
    for (const a of as) addPlace(typeof a === 'string' ? a : String(a?.name ?? ''));
    const loc = (n?.address as Record<string, unknown> | undefined)?.addressLocality;
    if (typeof loc === 'string') addPlace(loc);
  }
  obs.places = [...places].slice(0, 30);

  // Business markup: what it says, to compare with what the page shows.
  const blocks = [...raw.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1].trim());
  obs.schema.blocks = blocks.length;
  obs.schema.bad = blocks.filter((b) => { try { JSON.parse(b); return false; } catch { return true; } }).length;
  for (const n of nodes) {
    const types = typesOf(n).join(' ');
    /* The BUSINESS's own node only — a "Service" node names a service, not the business. */
    if (!/LocalBusiness|Organi[sz]ation|Corporation|Contractor|Electrician|Plumber|Locksmith|Roofing|HomeAndConstruction|HVAC|Store|Dentist|AccountingService|LegalService|ProfessionalService|AutoRepair|MovingCompany/i.test(types)) continue;
    if (obs.schema.biz.length >= 3) break;
    const addr = n?.address as Record<string, unknown> | string | undefined;
    const pc = typeof addr === 'string' ? (addr.match(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i)?.[0] ?? '') : String(addr?.postalCode ?? '');
    obs.schema.biz.push({ name: String(n?.name ?? '').trim(), tel: String(n?.telephone ?? '').trim(), pc: pc.trim(), url: String(n?.url ?? '').trim() });
  }
  obs.phones = uniq((text.match(PHONE_RE) ?? []).map((p) => p.replace(/\D/g, '').replace(/^44/, '0'))).filter((d) => d.length >= 10).slice(0, 6);
  obs.postcodes = uniq([...text.matchAll(POSTCODE_RE)].map((m) => `${m[1]} ${m[2]}`.toUpperCase())).slice(0, 6);

  // How general the copy reads: stock phrases against concrete detail.
  const lower = text.toLowerCase();
  obs.generic = GENERIC_PHRASES.filter((g) => lower.includes(g)).slice(0, 12);
  obs.specifics = (text.match(/£\s?\d|\b\d+(?:\.\d+)?\s?(?:kw|kva|kwh|amps?|mm|metres?|m²|sq ?ft|hours?|days?|weeks?)\b|\b(?:BS ?7671|EICR|Part P|G98|G99|DNO|IP\d\d)\b/gi) ?? []).length
    + obs.postcodes.length;
  const audienceHay = `${obs.title} ${h1.join(' ')} ${pathOf(url).replace(/[-/]/g, ' ')}`;
  obs.audience = { com: COMMERCIAL_RE.test(audienceHay), dom: DOMESTIC_RE.test(audienceHay) };
  return obs;
}

/* ── the site's issues ────────────────────────────────────────────────────────────────────────── */

export interface ContentTrustInput {
  /** Every page read, homepage first. */
  pages: PageObs[];
  servedUrl: string;
  /** Every same-site address the crawl knew about (sitemap + links), to find area pages and link targets. */
  knownUrls: string[];
  robotsTxt?: string | null;
  /** Sitemap files read. null = not known (an older full crawl); 0 = looked and found none. */
  sitemapsRead?: number | null;
  /** Pages that answered with an error, as "url (status)". */
  brokenPages?: Array<{ url: string; status: number }>;
  /** Pages listed in the sitemap that no page read links to — full crawls only (null = not judged). */
  sitemapOnly?: string[] | null;
  lead?: { name?: string | null; town?: string | null; trade?: string | null } | null;
  /** The crawl did not read every page (quick check, or a capped crawl). */
  partial: boolean;
}

/** The crawlers whose robots.txt rule matters for AI answers. GPTBot (training) is never required. */
const AI_ROBOT_TOKENS = ['OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'Claude-SearchBot', 'Googlebot', 'Bingbot'];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** The page an evidence line is about: "the homepage" or its path. */
const whereOn = (homePath: string) => (u: string) => (pathOf(u) === homePath ? 'the homepage' : pathOf(u));
const list = (xs: string[], n = 3) => xs.slice(0, n).map((x) => `“${x}”`).join(', ');

function tokenMatch(a: string, b: string): boolean {
  if (a === b) return true;
  /* Plural / -ing / -al forms only ("repairs" ~ "repair", "electrical" ~ "electric"), never "workplaces" ~ "work". */
  return Math.min(a.length, b.length) >= 4 && Math.abs(a.length - b.length) <= 3 && (a.startsWith(b) || b.startsWith(a));
}
const slugTokens = (p: string) => p.toLowerCase().split(/[/_\-.]+/).filter((t) => t.length >= 2);

export function buildContentTrust(input: ContentTrustInput): ContentTrust {
  const pages = input.pages.filter((p) => p && p.status > 0 && p.status < 400);
  const out: ContentIssue[] = [];
  const verified: string[] = [];
  const notChecked: string[] = [];
  const scope = input.partial ? ` in the ${plural(pages.length, 'page')} we read` : '';
  const home = pages.find((p) => p.family === 'homepage') ?? pages[0] ?? null;
  const where = whereOn(home ? pathOf(home.url) : '/');
  const bizWords = new Set(words(input.lead?.name));
  const trade = (input.lead?.trade || '').toLowerCase();
  const add = (i: Omit<ContentIssue, 'evidenceClass'>) => out.push({ ...i, evidenceClass: CONTENT_TRUST_KINDS[i.kind].evidenceClass, evidence: uniq(i.evidence).slice(0, 8), urls: uniq(i.urls).slice(0, 20) });
  if (!pages.length) return { version: CONTENT_TRUST_VERSION, issues: [], verified, notChecked: ['No page could be read.'], pagesRead: 0 };

  /* ── AI & search access (robots.txt) and the technical basics ─────────────────────────────────── */
  if (input.robotsTxt) {
    const blocked = AI_ROBOT_TOKENS.filter((t) => !robotsAllows(robotsRulesFor(input.robotsTxt, t).rules, '/'));
    if (blocked.length) add({ kind: 'robots_blocks_ai', severity: 'high',
      title: 'robots.txt asks AI and search crawlers to stay away',
      why: `Your robots.txt file tells ${blocked.join(', ')} not to read the site. Those are the crawlers search engines and AI assistants use to find pages to show, so a site that turns them away can be left out.`,
      evidence: blocked.map((t) => `User-agent: ${t} → Disallow: /`), urls: [], needs: 'Nothing to supply — your web person can change one file.',
      spoken: `Your robots.txt file asks ${blocked[0]} not to read the site, so that crawler is being turned away.` });
    else verified.push('robots.txt does not block the AI search crawlers.');
  }
  try {
    if (new URL(input.servedUrl).protocol === 'http:') add({ kind: 'no_https', severity: 'high',
      title: 'The site is not served securely (no HTTPS)',
      why: 'Browsers mark the site “Not secure”, and search engines treat HTTPS as a basic trust signal for the pages they show.',
      evidence: [`Served at ${input.servedUrl}`], urls: [input.servedUrl], needs: 'Nothing to supply — a certificate your host can switch on.',
      spoken: 'Your site isn’t served securely, so browsers flag it as “Not secure”.' });
  } catch { /* unparseable: no finding */ }
  if (home && home.viewport === false) add({ kind: 'no_viewport', severity: 'medium',
    title: 'The homepage isn’t set up for phones',
    why: 'The page has no mobile viewport setting, so phones show a shrunken desktop page. Search engines judge pages on how they work on a phone.',
    evidence: ['No <meta name="viewport"> on the homepage'], urls: [home.url], needs: 'Nothing to supply — a one-line change to the site template.',
    spoken: 'Your homepage isn’t set up for phones, so it shows as a shrunken desktop page.' });
  if (input.sitemapsRead === 0) add({ kind: 'no_sitemap', severity: 'low', absence: true,
    title: 'We couldn’t find an XML sitemap',
    why: 'A sitemap is the simplest way to tell search engines and AI crawlers every page that exists; without one they rely on following links.',
    evidence: ['Nothing at /sitemap.xml, and none declared in robots.txt'], urls: [], needs: 'Nothing to supply — most site builders can produce one.',
    spoken: 'We couldn’t find a sitemap, the file that lists your pages for search engines.' });
  const broken = (input.brokenPages ?? []).filter((b) => isBrokenPageStatus(b.status));
  if (broken.length) add({ kind: 'broken_links', severity: 'medium',
    title: 'Pages on your site that don’t load',
    why: 'Visitors and crawlers following those addresses reach an error instead of a page, so whatever was meant to be there cannot be read.',
    evidence: broken.slice(0, 5).map((b) => `${b.url} (${b.status})`), urls: broken.map((b) => b.url), needs: 'Nothing to supply — fix or remove the links.',
    spoken: `${plural(broken.length, 'page')} on your site come${broken.length === 1 ? 's' : ''} up with an error.` });
  if (input.sitemapOnly && input.sitemapOnly.length) add({ kind: 'orphan_pages', severity: 'low',
    title: 'Pages nothing on the site links to',
    why: 'Pages listed in the sitemap but not linked from any page look less important to crawlers, and visitors cannot reach them by browsing.',
    evidence: input.sitemapOnly.slice(0, 5), urls: input.sitemapOnly, needs: 'Nothing to supply — link to them from a relevant page, or remove them.',
    spoken: `${plural(input.sitemapOnly.length, 'page')} can only be found through the sitemap — nothing on the site links to them.` });
  else if (input.sitemapOnly === null || input.sitemapOnly === undefined) notChecked.push('Pages nothing links to — only judged on a full crawl.');

  /* ── Unfinished content: placeholders and links to nowhere ────────────────────────────────────── */
  const placeholders = pages.flatMap((p) => p.placeholders.map((x) => ({ x, url: p.url })));
  if (placeholders.length) add({ kind: 'placeholder_content', severity: 'high',
    title: 'Unfinished placeholder blocks are live on the site',
    why: 'Empty template blocks (like “Project 1” linking nowhere) make the site look unfinished, and give people and AI tools nothing real to read about your work.',
    evidence: placeholders.map((p) => `${p.x} on ${where(p.url)}`), urls: placeholders.map((p) => p.url),
    needs: 'Real projects you have done (what, where, photos) — or the empty blocks removed. Nothing should be made up to fill them.',
    spoken: `On your site there are blocks like ${placeholders[0].x.split(' links')[0]} that link nowhere — it reads as unfinished.` });
  const dead = pages.flatMap((p) => p.deadLinks.map((x) => ({ x, url: p.url })));
  if (dead.length) add({ kind: 'dead_links', severity: 'low',
    title: 'Links that go nowhere',
    why: 'Links pointing to “#” lead visitors and crawlers nowhere, so the page they were meant to reach is never found.',
    evidence: uniq(dead.map((d) => d.x)).map((label) => {
      const on = uniq(dead.filter((d) => d.x === label).map((d) => where(d.url)));
      return `“${label}” → # on ${on.length === 1 ? on[0] : `${on.length} pages (e.g. ${on[0]})`}`;
    }), urls: dead.map((d) => d.url), needs: 'Nothing to supply — point each link at its real page.',
    spoken: `Some links on your site, like “${dead[0].x}”, don’t go anywhere.` });

  /* ── Conflicting or missing facts about the business ──────────────────────────────────────────── */
  const years = pages.flatMap((p) => p.years.map((y) => ({ ...y, url: p.url })));
  const yearValues = uniq(years.map((y) => y.n)).sort((a, b) => a - b);
  const founded = pages.flatMap((p) => p.founded.map((y) => ({ ...y, url: p.url })));
  const foundedValues = uniq(founded.map((y) => y.y));
  if (yearValues.length >= 2 || foundedValues.length >= 2) {
    const ev = [...yearValues.map((n) => years.find((y) => y.n === n)!), ...foundedValues.map((y) => founded.find((f) => f.y === y)!)]
      .map((x) => `“${x.q}” (${where(x.url)})`);
    add({ kind: 'conflicting_facts', severity: 'medium',
      title: 'Your site gives different figures for how long you’ve been trading',
      why: 'When a site states two different facts about itself, people and AI tools cannot tell which is right, which makes the business harder to describe with confidence.',
      evidence: ev, urls: [...years, ...founded].map((x) => x.url),
      needs: 'The one true figure — the year the business started, so every page can say the same thing.',
      spoken: yearValues.length >= 2
        ? `Your site says ${yearValues[0]} years in one place and ${yearValues[yearValues.length - 1]} years in another — it doesn’t agree with itself.`
        : `Your site gives two different years for when the business started.` });
  }
  const companyNo = pages.find((p) => p.companyNo)?.companyNo ?? null;
  if (!foundedValues.length && !companyNo) add({ kind: 'missing_entity_facts', severity: 'low', absence: true,
    title: 'We couldn’t find a founding year or company number',
    why: 'Checkable facts like the year a business started and its company number help people and AI tools confirm it is a real, established business and match it to official records.',
    evidence: [`Neither found${scope || ' on any page read'}${yearValues.length ? ` — the site gives years of experience (${yearValues.join(' and ')}) but no start year` : ''}`], urls: [],
    needs: 'The year you started, and your company number if you are a limited company — only what is genuinely true.',
    spoken: 'We couldn’t see when the business started or a company number anywhere on the site.' });
  else verified.push(companyNo ? `Company number shown (${companyNo}).` : `Founding year shown (${foundedValues[0]}).`);
  if (!pages.some((p) => p.people)) add({ kind: 'no_people', severity: 'low', absence: true,
    title: 'We couldn’t find who runs the business',
    why: 'A named owner or team is one of the first things people check, and gives the business a real identity beyond its name.',
    evidence: [`No owner, director or team named${scope || ' on any page read'}`], urls: [],
    needs: 'The real names (and roles) of the people behind the business, if you are happy to show them.',
    spoken: 'We couldn’t see who actually runs the business anywhere on the site.' });

  /* ── Proof: reviews, testimonials, case studies ───────────────────────────────────────────────── */
  const reviews = pages.filter((p) => p.reviews.length);
  const cases = pages.filter((p) => p.cases.length);
  const logos = pages.reduce((n, p) => Math.max(n, p.img.logos), 0);
  if (!reviews.length && !cases.length) add({ kind: 'no_proof', severity: 'medium', absence: true,
    title: 'We couldn’t find reviews, testimonials or case studies',
    why: 'Proof of real work for real customers is what people look for before they get in touch, and gives AI tools something concrete to say about you. (A reviews widget that only loads with JavaScript would not be visible to us.)',
    evidence: [`None found${scope || ' on any page read'}`, ...(logos >= 5 ? [`About ${logos} client logos are shown, but with no story about the work behind them`] : [])], urls: [],
    needs: 'Genuine reviews or testimonials (with permission) and real jobs you have done — never written for you.',
    spoken: logos >= 5 ? `You show about ${logos} client logos, but there are no reviews or stories about the work — nothing that says what you actually did for them.`
      : 'We couldn’t find any reviews, testimonials or examples of your work on the site.' });
  else verified.push(reviews.length ? `Reviews or testimonials seen on ${plural(reviews.length, 'page')}.` : `Case studies or projects seen on ${plural(cases.length, 'page')}.`);

  /* ── Accreditations ───────────────────────────────────────────────────────────────────────────── */
  const named = uniq(pages.flatMap((p) => p.creds));
  const vague = pages.flatMap((p) => p.vagueCreds.map((q) => ({ q, url: p.url })));
  if (named.length) verified.push(`Named accreditations or memberships: ${named.join(', ')}.`);
  else if (vague.length) add({ kind: 'accreditations_unnamed', severity: 'medium',
    title: 'Your site claims accreditation or qualifications but names no scheme',
    why: 'A claim like “accredited” or “approved” can only be checked when the scheme is named. Named, checkable credentials are trust signals people and AI tools can verify.',
    evidence: uniq(vague.map((v) => `“${v.q}”`)), urls: vague.map((v) => v.url),
    needs: 'The names (and membership numbers) of the schemes you genuinely belong to. Never a scheme you are not in.',
    spoken: `Your site uses words like ${uniq(vague.map((v) => new RegExp(VAGUE_CRED_RE.source, 'i').exec(v.q)?.[0] ?? '').filter(Boolean).map((x) => x.toLowerCase())).slice(0, 2).map((x) => `“${x}”`).join(' and ')}, but it never names the scheme — so nobody can check it.` });
  else add({ kind: 'no_accreditations', severity: 'low', absence: true,
    title: 'We couldn’t find any named accreditations or memberships',
    why: 'Named, checkable credentials (trade bodies, registration schemes) are trust signals people and AI tools can verify. If you hold any, they are worth showing.',
    evidence: [`None named${scope || ' on any page read'}, in text or logo images`], urls: [],
    needs: 'Any schemes or memberships you genuinely hold — never one you are not in.',
    spoken: 'We couldn’t see any accreditations or memberships named on the site.' });

  /* ── Headings that say nothing specific ───────────────────────────────────────────────────────── */
  const townW = words(input.lead?.town);
  const placeWords = new Set([...townW, ...pages.flatMap((p) => p.places.flatMap((x) => words(x)))]);
  const serviceSlugWords = new Set(input.knownUrls.flatMap((u) => slugTokens(pathOf(u))).filter((t) => !FILLER.has(t)));
  const vagueH1: Array<{ h: string; url: string; home: boolean }> = [];
  for (const p of pages) {
    if (!p.h1.length || !['homepage', 'service', 'location', 'other'].includes(p.family)) continue;
    if (p.family === 'other' && !/service|install|repair|contractor|electric|plumb|roof|drain|heating|lock/i.test(pathOf(p.url))) continue;
    /* A hub page ("/services" → "Our Services") is an index: its heading is meant to be general. */
    if (/^\/(?:our-)?(?:services?|what-we-do|areas?|areas-we-cover|locations?)$/i.test(pathOf(p.url))) continue;
    const h = p.h1[0];
    const w = words(h).filter((x) => !bizWords.has(x) && !['welcome', 'to', 'hello', 'hi'].includes(x));
    /* ⛔ A PLACE OR A SERVICE IN THE HEADING COUNTS EVEN WHEN THE BUSINESS NAME HOLDS THE SAME WORD (2026-10-19): a lead
       named "Driving Lessons Canterbury" had "Driving Lessons in Canterbury" called vague, because the name's words were
       taken out first. The name filter only decides whether ANYTHING ELSE is said ("specific"). */
    const all = words(h);
    const hasPlace = all.some((x) => placeWords.has(x));
    const specific = w.filter((x) => !GENERIC_TRADE.has(x));
    const names = SERVICE_WORDS.test(all.join(' ')) || all.some((x) => serviceSlugWords.has(x) && !GENERIC_TRADE.has(x)) || (!!trade && all.some((x) => trade.includes(x.slice(0, 5))));
    const isVague = p.family === 'homepage' ? (!names && !hasPlace) : (!specific.length && !hasPlace);
    if (isVague) vagueH1.push({ h, url: p.url, home: p.family === 'homepage' });
  }
  if (vagueH1.length) add({ kind: 'vague_headings', severity: 'medium',
    title: 'Main headings don’t say what you do or where',
    why: 'The main heading is the plainest statement of what a page is about. A heading that names no service or place gives search engines and AI tools less to match the page to a real search.',
    evidence: vagueH1.map((v) => `${v.home ? 'Homepage' : pathOf(v.url)}: “${v.h}”`), urls: vagueH1.map((v) => v.url),
    needs: 'Nothing new — just which service and which area each page is really about.',
    spoken: `Your ${vagueH1[0].home ? 'homepage' : 'page'}’s main heading is “${vagueH1[0].h}” — it doesn’t say what you do or where.` });

  /* ── Areas covered ────────────────────────────────────────────────────────────────────────────── */
  const allPlaces = uniq(pages.flatMap((p) => p.places))
    .filter((p) => !/^(?:UK|United Kingdom|England|Britain|Great Britain|Wales|Scotland|United States|USA|America|Europe|EU|Ireland|Northern Ireland)$/i.test(p));
  const placeTokens = new Set(allPlaces.flatMap((p) => words(p)).filter((t) => t.length >= 4));
  const areaPages = uniq(input.knownUrls.map(pathOf)).filter((path) => {
    const toks = slugTokens(path);
    return toks.some((t) => /^(?:areas?|locations?|towns?|coverage|near)$/.test(t)) || toks.some((t) => placeTokens.has(t));
  });
  const national = pages.some((p) => p.places.some((x) => /^(?:UK|United Kingdom)$/i.test(x))) || pages.some((p) => /across the uk|nationwide|uk-wide/i.test(p.title + ' ' + p.h1.join(' ')));
  if (!areaPages.length) {
    /* Medium only when the site barely says where it works at all — its home town in no title or main heading
       either. A local business whose pages already say its town gets the gentler (low) note. */
    const townInHeads = townW.length > 0 && pages.some((p) => { const hw = new Set(words(`${p.title} ${p.h1.join(' ')}`)); return townW.every((t) => hw.has(t)); });
    const thin = allPlaces.length <= 2 && !townInHeads;
    add({ kind: 'area_coverage', severity: thin ? 'medium' : 'low', absence: true,
      title: allPlaces.length <= 2 ? 'We couldn’t find much about the areas you cover' : 'We couldn’t find a page for each area you cover',
      why: 'When someone asks for a business in a particular town, a page that genuinely covers work there gives search engines and AI tools something specific to match — only where it is genuinely true and useful, never copies of one page with the town name swapped.',
      evidence: [
        allPlaces.length ? `Places named on the site: ${allPlaces.slice(0, 8).join(', ')}${national ? ' (and “across the UK”)' : ''}` : `No town or area named${scope}`,
        `No area pages among the ${plural(uniq(input.knownUrls.map(pathOf)).length, 'address', 'addresses')} we know of`,
      ], urls: [],
      needs: 'Which towns you genuinely serve, and real jobs you have done there. Only where it is genuinely true and useful — never a new office location or a town-swap page.',
      spoken: !allPlaces.length ? 'Your site doesn’t really say which areas you cover.'
        : allPlaces.length <= 2 ? `The only places your site really mentions are ${allPlaces.slice(0, 2).join(' and ')} — there’s nothing about the other areas you work in.`
        : `Your site lists areas like ${allPlaces.slice(1, 3).join(' and ')}, but there’s no page about your work in any of them.` });
  }

  /* ── Images ───────────────────────────────────────────────────────────────────────────────────── */
  const ai = uniq(pages.flatMap((p) => p.img.ai));
  if (ai.length) add({ kind: 'ai_images', severity: 'medium',
    title: 'Some images look AI-generated',
    why: 'Image file names suggest pictures made with an AI image tool. Stock or generated pictures — especially of people — can make a business look less real to anyone who notices, where real photos of your team and work are proof.',
    evidence: ai.map((f) => `File: ${f}`), urls: pages.filter((p) => p.img.ai.length).map((p) => p.url),
    needs: 'Real photos of your team and your jobs.',
    spoken: 'Some of the photos on your site have file names like “ChatGPT Image” — they look AI-generated rather than real photos of you.'.replace('“ChatGPT Image”', `“${ai[0].split(' ').slice(0, 2).join(' ')}”`) });
  const altBad = uniq(pages.flatMap((p) => p.img.altBad));
  if (altBad.length) add({ kind: 'logo_alt_mismatch', severity: altBad.length >= 3 ? 'medium' : 'low',
    title: 'Logo images are captioned with the wrong company names',
    why: 'Each image’s description (alt text) is what search engines and AI tools read in place of the picture. A caption naming a different company tells them the wrong thing about who you have worked with.',
    evidence: altBad, urls: pages.filter((p) => p.img.altBad.length).map((p) => p.url),
    needs: 'Nothing new — the correct name for each logo you show (and only clients you really worked for).',
    spoken: `Your client logos are captioned with the wrong names — for example ${altBad[0].split(' on ')[0]} is on a different company’s logo.` });
  /* Each photo once across the site (headers and footers repeat on every page). */
  const photoKeys = new Map<string, boolean>();
  for (const p of pages) for (const k of p.img.photos ?? []) { const bare = k.replace(/^!/, ''); photoKeys.set(bare, (photoKeys.get(bare) ?? false) || !k.startsWith('!')); }
  const imgN = photoKeys.size;
  const noAlt = [...photoKeys.values()].filter((hasAlt) => !hasAlt).length;
  if (imgN >= 4 && noAlt / imgN >= 0.5) add({ kind: 'image_alt', severity: 'low',
    title: 'Most images have no description (alt text)',
    why: 'Alt text is how search engines and AI tools understand an image. Purely decorative images are fine without it; photos of your work and team are not.',
    evidence: [`${noAlt} of ${imgN} photos and pictures have no alt text (icons and logos not counted)`], urls: pages.filter((p) => p.img.noAlt).map((p) => p.url),
    needs: 'Nothing new — a short, true description of what each photo shows.',
    spoken: `${noAlt} of the ${imgN} images on the pages we read have no description, so there’s nothing for search tools to read about them.` });

  /* ── Links whose label doesn't match where they go; phone ↔ email mix-ups ─────────────────────── */
  const allLinks = pages.flatMap((p) => p.links.map((l) => ({ ...l, from: p.url })));
  const labelFreq = new Map<string, number>();
  /* A brand prefix ("Elect C&I", "Elect EV", "Elect PV", "Elect Home") is the first word of 3+ different labels: never a topic. */
  for (const l of uniq(allLinks.map((l) => l.t.toLowerCase()))) { const f = words(l)[0]; if (f) labelFreq.set(f, (labelFreq.get(f) ?? 0) + 1); }
  const knownPaths = uniq([...input.knownUrls.map(pathOf), ...allLinks.map((l) => l.p)]);
  const mismatched: string[] = [];
  const mismatchUrls: string[] = [];
  /* A post or archive is never "the page about it" — only a real page is. */
  const realPaths = knownPaths.filter((kp) => !/\/(?:post|posts|blog|news|article|articles|category|tag|author)\//i.test(`${kp}/`));
  for (const l of allLinks) {
    const all = uniq(words(l.t)).filter((t) => !FILLER.has(t));
    const topic = all.filter((t) => (labelFreq.get(t) ?? 0) < 3);
    const dest = slugTokens(l.p);
    if (!topic.length || !dest.length) continue;
    // ANY word of the label in the destination means it is about the right thing ("Commercial Workplaces" → /commercial-…).
    if (all.some((t) => dest.some((d) => tokenMatch(t, d)))) continue;
    const elsewhere = realPaths.find((kp) => kp !== l.p && topic.every((t) => slugTokens(kp).some((d) => tokenMatch(t, d))));
    if (!elsewhere) continue;
    const line = `“${l.t}” goes to ${l.p} (a page about it is at ${elsewhere})`;
    if (!mismatched.includes(line)) { mismatched.push(line); mismatchUrls.push(l.from); }
  }
  const mix = uniq(pages.flatMap((p) => p.contactMix));
  if (mismatched.length || mix.length) add({ kind: 'link_mismatch', severity: mix.length || mismatched.length >= 2 ? 'medium' : 'low',
    title: 'Some links go to the wrong place',
    why: 'A button or link that says one thing and opens another sends visitors — and crawlers following links to understand the site — to the wrong page or the wrong contact method.',
    evidence: [...mix, ...mismatched].slice(0, 6), urls: [...mismatchUrls, ...pages.filter((p) => p.contactMix.length).map((p) => p.url)],
    needs: 'Nothing to supply — point each link at its real page.',
    spoken: mix.length ? `${mix[0].replace(/ \(.*\)$/, '')} — tapping it opens an email instead of calling you.`
      : `Some of your buttons go to the wrong page — “${mismatched[0].split('” goes')[0].slice(1)}” opens a different service.` });

  /* ── Identical dates on every post ────────────────────────────────────────────────────────────── */
  const postDates = new Map<string, string>();
  for (const p of pages) for (const d of p.dates) if (!postDates.has(d.p)) postDates.set(d.p, d.d);
  if (postDates.size >= 3) {
    const counts = new Map<string, number>();
    for (const d of postDates.values()) counts.set(d, (counts.get(d) ?? 0) + 1);
    const [topDate, topN] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topN >= 3 && topN / postDates.size >= 0.75) add({ kind: 'identical_dates', severity: 'low',
      title: topN === postDates.size ? `All ${topN} posts carry the same date` : `${topN} of ${postDates.size} posts carry the same date`,
      why: 'Posts all dated the same day can read as added in bulk. Dates are one of the ways readers and search tools judge how current information is — so they should simply be the real ones.',
      evidence: [`${topN} posts dated ${humanDate(topDate)}`, ...[...postDates.entries()].filter(([, d]) => d === topDate).slice(0, 3).map(([p]) => p)],
      urls: [...postDates.keys()].map((p) => { try { return new URL(p, input.servedUrl).href; } catch { return p; } }),
      needs: 'Nothing to invent — just the real date each post was written. Never change dates to look fresh.',
      spoken: `All your blog posts have the same date on them, which reads as if they were put up in one go.` });
  }

  /* ── Generic copy on the pages that should be specific ────────────────────────────────────────── */
  const genericPages = pages.filter((p) => ['homepage', 'service', 'location', 'other'].includes(p.family) && p.family !== 'other' && p.words >= 300 && p.generic.length >= 3 && p.generic.length * GENERIC_PER_WORDS >= p.words && p.specifics <= 2);
  if (genericPages.length) add({ kind: 'generic_copy', severity: 'low',
    title: 'Pages read as general copy, with few specifics',
    why: 'Stock phrases could describe any business. Specific, checkable detail — real jobs, places, timescales, the equipment you use — gives people and AI tools something to quote about you in particular.',
    evidence: genericPages.slice(0, 3).map((p) => `${p.family === 'homepage' ? 'Homepage' : pathOf(p.url)} (${p.words} words): ${list(p.generic, 3)}`), urls: genericPages.map((p) => p.url),
    needs: 'Specifics only you know: real jobs, places, timescales, and prices you are happy to publish.',
    spoken: 'A lot of the wording on your pages could be about any business — phrases like ' + list(genericPages[0].generic, 2) + ' — rather than what you actually do.' });

  /* ── Mixed audience with no clear split ───────────────────────────────────────────────────────── */
  const com = pages.filter((p) => p.family !== 'blog' && p.family !== 'legal' && p.audience.com && !p.audience.dom);
  const dom = pages.filter((p) => p.family !== 'blog' && p.family !== 'legal' && p.audience.dom && !p.audience.com);
  if ((com.length >= 3 && dom.length === 1) || (dom.length >= 3 && com.length === 1)) {
    const lone = com.length === 1 ? com[0] : dom[0];
    const main = com.length === 1 ? 'home customers' : 'commercial work';
    const other = com.length === 1 ? 'commercial work' : 'home customers';
    add({ kind: 'mixed_audience', severity: 'low',
      title: `One page for ${other} sits inside a site built around ${main}`,
      why: 'When most of a site speaks to one kind of customer, a single page for another can be hard to find and harder to understand. A clear split helps people and AI tools see who each service is for.',
      evidence: [`${pathOf(lone.url)}: “${lone.h1[0] ?? lone.title}”`, `${(com.length === 1 ? dom : com).length} pages about ${main}`], urls: [lone.url],
      needs: 'Which kind of customer each service is genuinely for.',
      spoken: `Your site is mostly about ${main}, with one page for ${other} dropped in — it’s not clear who it’s for.` });
  }

  /* ── Business markup (JSON-LD) against what the pages show ────────────────────────────────────── */
  const blocks = pages.reduce((n, p) => n + p.schema.blocks, 0);
  const bad = pages.reduce((n, p) => n + p.schema.bad, 0);
  const biz = pages.flatMap((p) => p.schema.biz.map((b) => ({ ...b, pageUrl: p.url })));
  if (blocks && bad === blocks) add({ kind: 'schema_unverified', severity: 'low',
    title: 'We could not verify your structured data',
    why: 'The business details written into the page code could not be read (they are not valid JSON), so we cannot say whether they match what the pages show.',
    evidence: [`${bad} block${bad === 1 ? '' : 's'} of structured data that do not parse`], urls: pages.filter((p) => p.schema.bad).map((p) => p.url),
    needs: 'Nothing to supply — your web person can fix the markup.',
    spoken: 'The business details hidden in your site’s code are broken, so they can’t be read.' });
  if (biz.length) {
    const shownPhones = new Set(pages.flatMap((p) => p.phones));
    const shownPcs = new Set(pages.flatMap((p) => p.postcodes));
    const mism: string[] = [];
    for (const b of biz) {
      const tel = b.tel.replace(/\D/g, '').replace(/^44/, '0');
      if (tel.length >= 10 && shownPhones.size && !shownPhones.has(tel)) mism.push(`The markup gives the phone ${b.tel}; the pages show ${[...shownPhones][0]}`);
      const pc = b.pc.toUpperCase().replace(/\s+/g, ' ').trim();
      if (pc && shownPcs.size && ![...shownPcs].some((s) => s.replace(/\s/g, '') === pc.replace(/\s/g, ''))) mism.push(`The markup gives the postcode ${pc}; the pages show ${[...shownPcs][0]}`);
      if (b.name && bizWords.size && !words(b.name).some((w) => bizWords.has(w))) mism.push(`The markup names the business “${b.name}”`);
    }
    if (mism.length) add({ kind: 'schema_mismatch', severity: 'medium',
      title: 'The business details in your page code don’t match the page',
      why: 'Search engines ask that structured data matches what visitors see. Details that disagree make it harder to be sure which is right.',
      evidence: uniq(mism), urls: biz.map((b) => b.pageUrl), needs: 'Nothing new — your correct phone number, address and business name, the same everywhere.',
      spoken: `The business details hidden in your site’s code don’t match what the page shows — ${mism[0].charAt(0).toLowerCase()}${mism[0].slice(1)}.` });
    else verified.push('Business structured data read from the page code, and its phone and postcode match what the pages show.');
    const relUrl = biz.find((b) => b.url && !/^https?:\/\//i.test(b.url));
    if (relUrl) add({ kind: 'schema_incomplete', severity: 'low',
      title: 'Your business markup has an incomplete web address',
      why: 'The web address in the business details is not a full address, so it cannot be used to tie the details to your website.',
      evidence: [`"url": "${relUrl.url}" (on ${where(relUrl.pageUrl)})`], urls: [relUrl.pageUrl],
      needs: 'Nothing to supply — your web person can put the full address in.',
      spoken: 'The web address in the business details in your site’s code is incomplete.' });
  } else if (!blocks) notChecked.push('Business structured data — none found in the page code we read, so there was nothing to compare.');

  out.sort(compareIssues);
  return { version: CONTENT_TRUST_VERSION, issues: out, verified, notChecked, pagesRead: pages.length };
}

const SEVERITY_RANK: Record<IssueSeverity, number> = { high: 0, medium: 1, low: 2 };
export function compareIssues(a: Pick<ContentIssue, 'severity' | 'kind'>, b: Pick<ContentIssue, 'severity' | 'kind'>): number {
  return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || CONTENT_TRUST_KINDS[a.kind].priority - CONTENT_TRUST_KINDS[b.kind].priority;
}

/** A stored block, if it may be believed: the current version only. Anything else → null (old rows unchanged). */
export function usableContentTrust(v: unknown): ContentTrust | null {
  const c = v as ContentTrust | null | undefined;
  if (!c || typeof c !== 'object' || Number(c.version) !== CONTENT_TRUST_VERSION || !Array.isArray(c.issues)) return null;
  return c;
}

/* ── the report's view ────────────────────────────────────────────────────────────────────────── */

/** What the public report prints for one issue: the words and ONE line of evidence. */
export interface ReportContentIssue {
  kind: ContentTrustKind;
  severity: IssueSeverity;
  title: string;
  why: string;
  evidence: string | null;
}

/** A stored block → the issues the report may print, worst first. Old or missing rows → []. */
export function reportContentIssues(stored: unknown): ReportContentIssue[] {
  const ct = usableContentTrust(stored);
  if (!ct) return [];
  return [...ct.issues].sort(compareIssues).map((i) => ({
    kind: i.kind, severity: i.severity, title: i.title, why: i.why, evidence: i.evidence[0] ?? null,
  }));
}
