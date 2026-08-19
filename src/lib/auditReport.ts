// Shared AI-visibility audit REPORT logic — the single source of truth for turning a run's
// queue rows into AiAuditReportData (which renderReportHtml consumes). Pure TypeScript: NO
// React, NO browser/DOM deps, so it runs in BOTH the SPA and a Deno edge function (automation
// B's server-side report renderer). Extracted VERBATIM from src/pages/AiAudit.tsx — logic
// unchanged; only `export` added to the symbols the app + server consume.
/* ⛔ THE REAL GROUPER, NOT A SECOND ONE. market-match.ts already knows that "Chapman’s Valeting"
   and "Chapman's Valeting" are one firm, and a private copy here would drift from the market view
   the first time either changed — the exact failure mode this report already suffered.
   ⚠️ RELATIVE PATH WITH AN EXPLICIT .ts, never "@/": this file is bundled into render-audit-report
   and Deno cannot resolve the Vite alias (CLAUDE.md §4). Verified browser-safe before wiring it —
   the whole chain (market-match -> ai-search -> apify) uses no Deno globals, so the SPA can import
   it too and both sides group names identically. */
import { buildMatchContext, groupNames } from "../../supabase/functions/_shared/market-match.ts";
import { classifyKnownEntity, isUncleanedName } from './knownEntities.ts';
import type { AiAuditReportData, AiAuditSeo, SeoFinding } from './aiAuditReportHtml.ts';

// Engines shown in results (queue targets chatgpt+gemini; the actor also returns
// AI Overview + Google organic, shown for context). mention_rate is over chatgpt+gemini.
export const DISPLAY_ENGINES = ['chatgpt', 'gemini', 'ai_overview', 'google_organic'] as const;
export const SCORED_ENGINES = ['chatgpt', 'gemini'] as const;
export const ENGINE_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT', gemini: 'Gemini', ai_overview: 'AI Overview', google_organic: 'Google',
};
export interface EngineResult {
  named: boolean;
  position: number | null;
  competitors: string[];
  topCompetitors?: { name: string; count: number }[];
  competitorMentions?: number;
  citations: { title: string; url: string }[];
  answer_text: string;
}
export type EngineMap = Record<string, EngineResult>;
export interface QueueRow { id: string; question: string; status: string; result: EngineMap | null; }
export interface RunRow { id: string; audit_id: string; run_number: number; status: string; mention_rate: number | null; results: unknown; created_at?: string }
/* ── Report data hygiene ─────────────────────────────────────────────────────
 * The actor's answer_text and competitor lists are noisy (map/image junk leaks in,
 * and competitor "names" are often generic words or the location). These helpers keep
 * the client report clean: they feed BOTH the scorecard callout and the report. */

// Generic words that are never a real competitor business name on their own.
const COMPETITOR_STOPWORDS = new Set([
  'the', 'best', 'top', 'good', 'great', 'nice', 'popular', 'recommended', 'famous', 'cheap', 'cool', 'fun',
  'near', 'nearby', 'me', 'my', 'you', 'your', 'in', 'on', 'at', 'a', 'an', 'and', 'or', 'of', 'for', 'to', 'with', 'by', 'from',
  'now', 'today', 'tonight', 'open', 'here', 'there', 'this', 'that', 'some', 'any', 'more', 'most',
  'old', 'new', 'city', 'town', 'downtown', 'centre', 'center', 'central', 'district', 'area', 'quarter', 'zone',
  'street', 'road', 'soi', 'lane', 'night', 'nightlife', 'local',
  'bar', 'bars', 'pub', 'pubs', 'club', 'clubs', 'cafe', 'cafes', 'coffee', 'restaurant', 'restaurants', 'eatery',
  'place', 'places', 'spot', 'spots', 'venue', 'venues', 'joint', 'hangout', 'option', 'options', 'list', 'guide',
]);

// Assistant/platform UI strings that leak into "competitor" lists (Gemini/ChatGPT chrome).
const PLATFORM_UI = new Set([
  'apps', 'app', 'activity', 'gemini', 'chatgpt', 'copilot', 'openai', 'google', 'bing', 'ai', 'assistant',
  'search', 'searches', 'result', 'results', 'overview', 'web', 'image', 'images', 'maps', 'map',
  'related', 'questions', 'people', 'also', 'ask', 'history', 'settings', 'account', 'sources', 'source',
]);
// Multi-word UI phrases (belt-and-braces on top of the all-platform-words check).
const UI_PHRASES = ['gemini apps activity', 'apps activity', 'search activity', 'web results', 'ai overview', 'people also ask', 'gemini apps'];
// Plural venue categories → a category/list ("Kava Bars", "Cocktail Bars"), not a single named venue.
const PLURAL_CATEGORIES = new Set([
  'bars', 'pubs', 'clubs', 'cafes', 'restaurants', 'eateries', 'shops', 'stores', 'lounges', 'venues',
  'spots', 'places', 'joints', 'hangouts', 'houses', 'rooms', 'halls', 'gardens', 'kitchens', 'bistros',
  'taverns', 'breweries', 'diners',
]);
// Cuisines, vibe/drink descriptors, singular venue-TYPE words, and area/place-type words —
// none of these is a business NAME. A candidate whose words are ALL generic (e.g. "Thai
// Food", "Cocktail Lounge", "Night Bazaar") is dropped; a plain single generic word ("Thai",
// "Nimman" area, "Cocktail") is dropped. A name with a real proper token survives.
const GENERIC_TERMS = new Set([
  // cuisines / food
  'thai', 'italian', 'mexican', 'japanese', 'indian', 'chinese', 'french', 'korean', 'vietnamese', 'american',
  'spanish', 'greek', 'turkish', 'lebanese', 'mediterranean', 'fusion', 'asian', 'western', 'seafood', 'vegan',
  'vegetarian', 'halal', 'bbq', 'sushi', 'pizza', 'burger', 'noodle', 'noodles', 'food', 'cuisine', 'eats', 'dining', 'tapas',
  // drink / vibe descriptors
  'cocktail', 'cocktails', 'craft', 'beer', 'wine', 'whisky', 'whiskey', 'gin', 'rooftop', 'sports', 'karaoke',
  'live', 'music', 'dance', 'dancing', 'jazz', 'reggae', 'irish', 'tiki', 'speakeasy', 'gastropub', 'microbrewery', 'happy', 'hour',
  // singular venue-type words (category, not a name)
  'lounge', 'hall', 'room', 'house', 'kitchen', 'grill', 'tavern', 'bistro', 'brewery', 'taproom', 'den',
  'saloon', 'cantina', 'parlour', 'parlor', 'garden', 'diner', 'pizzeria', 'trattoria', 'izakaya', 'eatery',
  // area / place-type words (neighbourhoods, districts, landmarks)
  'nimman', 'bazaar', 'market', 'plaza', 'mall', 'square', 'park', 'quarter', 'village', 'zone', 'riverside',
  'beach', 'harbour', 'harbor', 'pier', 'walking', 'district',
]);
// Pronoun / sentence-fragment words that leak in as "competitors" ("It's …", "They …").
const PRONOUNS = new Set([
  'it', 'its', "it's", 'they', 'them', 'their', 'we', 'us', 'our', 'i', 'he', 'she', 'him', 'her',
  'that', 'this', 'these', 'those', 'here', 'there', 'what', 'where', 'when', 'who', 'why', 'how', 'if', 'is', 'are', 'was',
]);
// Business-DOMAIN generic words — describe what a firm IS, never a firm's NAME on their own
// ("Accountants", "Services", "Advisors"). Lets a single generic word be dropped while a real
// brand token survives; a multi-word all-generic phrase ("Tax Advisors") is dropped too.
const DOMAIN_GENERIC = new Set([
  'accountant', 'accountants', 'accounting', 'accountancy', 'bookkeeping', 'bookkeeper', 'bookkeepers',
  'tax', 'taxes', 'audit', 'audits', 'auditor', 'auditors', 'advisor', 'advisors', 'adviser', 'advisers',
  'consultant', 'consultants', 'consultancy', 'finance', 'financial', 'services', 'service', 'solutions',
  'firm', 'firms', 'ltd', 'limited', 'llp', 'plc', 'inc', 'associates', 'partners', 'partnership', 'group',
  'company', 'co', 'agency', 'agencies', 'specialists', 'experts', 'professional', 'professionals',
  /* ⛔ THE TRADES VOCABULARY WAS MISSING ENTIRELY, and that is why junk reached a CLIENT report.
     These sets were built for accountancy and hospitality; nothing here described a trade, so
     "Locksmith" (9×) and "Safe" (14×) passed isRealCompetitor and "Safe" printed as RG Locksmiths'
     third-biggest competitor. Same rule as every entry above: a word that says what a firm DOES,
     never what it is CALLED.
     ⚠️ THIS DOES NOT DROP REAL FIRMS, because `words.every(generic)` needs EVERY word to be
     generic — "Abbey Locksmiths" keeps "abbey", "Cambs Lock & Safe" keeps "cambs", "Safe And
     Secure Locksmiths" keeps "secure". Only a bare category token is lost, and a bare category
     token out of an extractor is a fragment, not a name. */
  'locksmith', 'locksmiths', 'plumber', 'plumbers', 'plumbing', 'electrician', 'electricians',
  'builder', 'builders', 'roofer', 'roofers', 'roofing', 'glazier', 'glaziers', 'glazing',
  'joiner', 'joiners', 'joinery', 'carpenter', 'carpenters', 'carpentry', 'engineer', 'engineers',
  'trades', 'tradesman', 'tradesmen', 'contractor', 'contractors', 'repairs', 'repair',
  'installation', 'installations', 'maintenance', 'callout', 'callouts',
]);
// Ordinary English words (verbs, helpers, guide-speak) that leak in as capitalised SENTENCE
// FRAGMENTS — "Choosing an accountant…", "Company Help", "Finding the right…". Never a firm's
// name. Combined with the "single word ending in -ing → gerund fragment" rule below, this drops
// fragments while keeping real one-word brands (Crunch, Mazuma, Azets, IRIS, TaxAssist).
const FRAGMENT_WORDS = new Set([
  'choosing', 'choose', 'chose', 'finding', 'find', 'looking', 'look', 'getting', 'get',
  'considering', 'consider', 'comparing', 'compare', 'understanding', 'understand', 'knowing', 'know',
  'using', 'use', 'making', 'make', 'hiring', 'hire', 'searching', 'search', 'picking', 'pick',
  'selecting', 'select', 'avoiding', 'avoid', 'ensuring', 'ensure', 'reviewing', 'review', 'reviews',
  'learn', 'learning', 'discover', 'explore', 'help', 'helping', 'need', 'needs', 'want', 'tips',
  'guide', 'guides', 'how', 'why', 'what', 'when', 'where', 'whether', 'first', 'next', 'before', 'after',
]);
// Generic common nouns/adjectives that leak in as fake single-word "competitors" from the
// answer prose ("Cost", "Software", "Pricing", "Cheap") — never a firm's name on their own.
const NOISE_WORDS = new Set([
  'cost', 'costs', 'price', 'prices', 'pricing', 'fee', 'fees', 'value', 'budget', 'cheap', 'affordable',
  'software', 'tool', 'tools', 'platform', 'platforms', 'app', 'apps', 'system', 'systems', 'online', 'digital',
  'support', 'quality', 'feature', 'features', 'options', 'choice', 'choices', 'range', 'expertise', 'experience',
  /* Trade-answer nouns and adjectives that leak in capitalised from the prose — "Emergency
     lockouts…", "Based in Huntingdon…", "Safe and secure…". Measured on RG Locksmiths' own report:
     Safe 14×, Emergency 7×, Based 7×, all printed or counted as competing firms. */
  'safe', 'safes', 'lock', 'locks', 'key', 'keys', 'door', 'doors', 'window', 'windows',
  'emergency', 'based',
  /* ⛔ DELIBERATELY NOT ADDED, AND THE TEST IS WHY: 'secure', 'local', 'mobile', 'trusted',
     'approved', 'certified', 'residential', 'commercial', 'domestic'. Each looks like noise on its
     own, but `words.every(generic)` drops a name only when EVERY word is generic — so adding
     'secure' made "Safe And Secure Locksmiths" a fully generic phrase and rejected a REAL FIRM in
     RG's own results. scripts/report-attribution.test.ts caught it before it shipped and now pins
     that name. Anything added here must be a word no firm would trade under WITH ONLY OTHER
     GENERIC WORDS beside it — which is a much higher bar than "sounds generic". */
]);
// NEVER a competing business: government / tax authorities + statutory terms, and accounting
// SOFTWARE (tools, not rival firms). These leak from answer_text ("Corporation Tax", "HM Revenue",
// "Companies House", "QuickBooks. The") and must be dropped outright.
// Multi-word phrases matched as substrings; single tokens matched only when they dominate a short name.
const NOT_COMPETITOR_PHRASES = [
  'hm revenue', 'hmrc', 'companies house', 'corporation tax', 'value added tax', 'national insurance',
  'self assessment', 'self-assessment', 'income tax', 'capital gains', 'stamp duty', 'tax return',
  'tax returns', 'the pensions regulator', 'pensions regulator', 'pension regulator', 'making tax digital',
];
const NOT_COMPETITOR_TOKENS = new Set([
  'hmrc', 'gov.uk', 'gov', 'vat', 'paye', 'ir35', 'mtd', 'fca', 'ico', 'nino',
  'quickbooks', 'xero', 'sage', 'freeagent', 'kashflow', 'freshbooks', 'clearbooks', 'wave', 'intuit',
  // payroll/bookkeeping PRODUCTS seen in the corpus — vendors, not competing practices
  'moorepay', 'brightpay', 'payfit', 'iris payroll', 'payescape', 'pandle',
  // Tax forms/codes + services/tasks — never a competing FIRM ("CT600", "Payroll", "Customs").
  'ct600', 'sa100', 'sa102', 'sa302', 'sa800', 'p11d', 'p60', 'p45', 'p87', 'r40',
  'payroll', 'bookkeeping', 'customs', 'duty', 'duties', 'compliance',
]);
/** True when the candidate is a gov/tax authority, statutory term, or accounting software —
 *  never a competing firm. `nl` is the lowercased name; `words` its cleaned word tokens. */
function isNotACompetitor(nl: string, words: string[]): boolean {
  if (NOT_COMPETITOR_PHRASES.some((p) => nl === p || nl.includes(p))) return true;
  // A single authority/software token dominating a short name ("VAT", "QuickBooks", "Sage Ltd").
  if (words.length <= 2 && words.some((w) => NOT_COMPETITOR_TOKENS.has(w))) return true;
  return false;
}

/** Niche keywords for the business — its real specialisms + the distinctive part of its
 *  type (drops the generic category word). Used to prefer WINNABLE, specialism-relevant
 *  searches for the gut-punch. "kava bar" → ["kava"]; "kava, pool tables" → ["kava","pool","tables"]. */
function nicheKeywordsFrom(specialisms: string, businessType: string): string[] {
  const out = new Set<string>();
  for (const tok of `${specialisms} ${businessType}`.toLowerCase().split(/[^a-z0-9]+/)) {
    if (tok.length >= 3 && !COMPETITOR_STOPWORDS.has(tok) && !PLATFORM_UI.has(tok)) out.add(tok);
  }
  return [...out];
}

// Map/image/markup junk that sometimes leaks into an engine's answer_text.
const JUNK_MARKERS = ['mapbox', 'openstreetmap', 'images.openai', 'oaidalleapi', 'staticmap', 'tile.', 'data:image', 'base64', 'googleusercontent', '�'];

/** True when answer_text isn't clean human prose (map/image junk, mostly URLs/markup,
 *  or too few real words) — such answers must never be shown as the gut-punch quote. */
function isJunkAnswer(text: string): boolean {
  const t = text.toLowerCase();
  if (JUNK_MARKERS.some((m) => t.includes(m))) return true;
  const stripped = text.replace(/https?:\/\/\S+/gi, ' ').replace(/\S+\.(png|jpe?g|svg|webp|gif|bmp)\S*/gi, ' ');
  const words = stripped.trim().split(/\s+/).filter((w) => /[a-z]{2,}/i.test(w));
  if (words.length < 10) return true;                    // too little real prose
  const letters = (text.match(/[a-z]/gi) || []).length;
  if (letters / text.length < 0.55) return true;         // mostly markup/symbols/urls
  return false;
}

/** "There don't appear to be any kava bars…" style answers — the most damning. */
function looksAbsent(text: string): boolean {
  return /\b(no|not|none|couldn't|can't|cannot|unable|aren't|isn't|don't|doesn't)\b/i.test(text)
    && /\b(appear|aware|find|identify|seem|exist|any|dedicated|specific|listing|results?)\b/i.test(text);
}

/* ── Furniture / franken reject — mirrors the fixed edge extractor's isJunkCandidate
 *  (_shared/enrichment/ai-search.ts). Catches scraped page furniture (social/share widgets,
 *  nav/footer links, cookie text) and concatenated link-label tokens ("CloseThank",
 *  "FacebookGmailX…") that the stopword sets miss because they're proper-noun-shaped. */
const FURNITURE_TERMS = new Set([
  'sharethis', 'share', 'facebook', 'gmail', 'reddit', 'whatsapp', 'twitter', 'linkedin',
  'pinterest', 'telegram', 'messenger', 'tumblr', 'instagram', 'youtube', 'tiktok', 'print',
  'privacy', 'terms', 'contact', 'report', 'signin', 'signup', 'login', 'logout', 'register',
  'subscribe', 'newsletter', 'menu', 'copyright', 'disclaimer', 'sitemap', 'feedback',
  'next', 'previous', 'close', 'thank', 'thanks', 'accept', 'cookie', 'cookies', 'consent',
]);
const FURNITURE_SUBSTR = /sharethis|facebook|whatsapp|reddit|linkedin|pinterest/i;
/** Split a camelCase / fused token into word parts ("CloseThank"→["Close","Thank"],
 *  "TaxAssist"→["Tax","Assist"]). */
const camelParts = (t: string): string[] => t.replace(/([a-zà-ÿ])([A-ZÀ-Þ])/g, '$1 $2').split(/\s+/).filter(Boolean);
/** Count lower→upper transitions in a single (spaceless) token — many = glued link labels. */
function camelHumps(t: string): number {
  let n = 0;
  for (let i = 1; i < t.length; i++) if (/[a-zà-ÿ]/.test(t[i - 1]) && /[A-ZÀ-Þ]/.test(t[i])) n++;
  return n;
}
/** True when a candidate is page furniture or a concatenated link-label franken-word. */
function isFurnitureOrFranken(name: string): boolean {
  const cleaned = name.replace(/[.\s]+$/, '').trim();
  const key = cleaned.toLowerCase();
  if (!key) return true;
  if (FURNITURE_TERMS.has(key) || FURNITURE_TERMS.has(key.split(/\s+/)[0])) return true;
  if (FURNITURE_SUBSTR.test(cleaned)) return true;
  if (!/\s/.test(cleaned)) {
    if (cleaned.length > 25 || camelHumps(cleaned) >= 3) return true;      // mega-fused run
    if (camelParts(cleaned).some((p) => FURNITURE_TERMS.has(p.toLowerCase()))) return true; // fused furniture ("CloseThank")
  }
  return false;
}

/** Keep only things that look like a real business name — drop stopwords, the audit's
 *  location, and short fragments. Bias to precision (better fewer real than lots of noise). */
// WHOLE-VALUE junk: table headers, template placeholders and capitalised prose fragments the
// extractor lifts verbatim out of an answer. Real case that shipped to a prospect: 365 Plumbing's
// gut-punch read "AI recommended Loughborough Emergency Plumbing, Company Name, Key Details and
// others" — "Company Name" and "Key Details" are column headers from a table in Gemini's answer.
//
// The word-by-word `generic` test above cannot catch these: it only drops a phrase when EVERY
// word is generic, and "name"/"details"/"features" were in none of the lists, so "Company Name"
// passed. Matching the WHOLE value (case-insensitive, after the leading-"the"/trailing-punctuation
// strip) is deliberate: a real firm called "Details Ltd" or "Small Business Accounting" contains
// these words but is never equal to one, so it survives untouched. Equally deliberate: single
// real brands (Crunch, Azets, IRIS, Mazuma) are NOT in here and keep working.
//
// Every entry below was observed surviving the filter in the stored corpus (10,515 values).
const PLACEHOLDER_VALUES = new Set([
  // template placeholders / table headers
  'company name', 'business name', 'key details', 'key features', 'name', 'details', 'detail',
  'contact', 'contact details', 'phone', 'phone number', 'telephone', 'website', 'address',
  'services', 'service', 'location', 'locations', 'n/a', 'na', 'example', 'notes', 'note',
  'summary', 'overview', 'rating', 'ratings', 'reviews', 'hours', 'opening hours', 'price',
  'cost', 'other', 'others', 'more', 'more info', 'info', 'information',
  // capitalised prose fragments ("Typical costs are…", "Offers a range of…")
  'typical', 'offers', 'provides', 'provider', 'specialises', 'specializes', 'keep', 'many',
  'usually', 'highly', 'once', 'submit', 'prepare', 'must', 'fully', 'managed', 'full', 'give',
  'check', 'available', 'open', 'closed', 'dedicated', 'established', 'covers', 'only', 'which',
  'nearly', 'daily', 'always', 'ensure', 'verify', 'compare', 'clarify', 'additional', 'most',
  'over', 'low', 'quick', 'rapid', 'fast', 'new', 'they', 'you', 'here', 'once again',
  // market-segment descriptors, never a firm's name alone
  'smes', 'sme', 'small', 'micro', 'medium', 'business', 'businesses', 'contractors', 'self',
  'startups', 'landlords', 'sole traders', 'limited companies',
  // domain nouns lifted from answer prose
  'accounts', 'profit', 'year', 'annual', 'file', 'dividends', 'balance', 'statutory', 'pension',
  'pensions', 'cloud', 'fixed', 'association', 'boiler', 'pipework', 'heating', 'plumbing',
  // professional bodies, standards and statutory forms — credentials, not competing firms
  'acca', 'icaew', 'cima', 'aat', 'ciot', 'ifrs', 'bacs', 'oftec', 'niceic', 'napit', 'elecsa',
  'gas safe', 'p60', 'p60s', 'p45', 'p11d', 'trusted trader', 'cipp', 'nest',
  // second measured pass over the same corpus: more prose fragments and descriptors
  'while', 'because', 'every', 'large', 'assessment', 'deadline', 'turnover', 'sole',
  'freelancers', 'chartered', 'import', 'cross', 'tech', 'bank', 'property', 'standard',
  'uk', 'england', 'scotland', 'wales', 'northern ireland',
]);

export function isRealCompetitor(name: string, locationText: string): boolean {
  if (isFurnitureOrFranken(name)) return false;          // page furniture / fused link labels
  // Strip trailing fragments the extractor leaves on: punctuation, then a dangling article/
  // conjunction ("QuickBooks. The" → "QuickBooks", "Crunch and" → "Crunch"). Also a leading "The ".
  let n = name.trim()
    .replace(/^the\s+/i, '')
    .replace(/[\s.,;:–—-]+$/g, '')                        // trailing punctuation ("QuickBooks." )
    .replace(/\s+(?:the|and|or|a|an|of|for|with|to)$/i, '') // dangling article/conjunction (" The")
    .replace(/[\s.,;:–—-]+$/g, '')                        // punctuation exposed by the strip above
    .trim();
  if (n.length < 3 || n.length > 60) return false;
  if (n.includes('@')) return false;                     // social handle, not a venue ("… (@kava_thailand)")
  const nl = n.toLowerCase();
  if (PLACEHOLDER_VALUES.has(nl)) return false;          // table header / placeholder / prose fragment
  if (UI_PHRASES.some((p) => nl === p || nl.includes(p))) return false;          // "gemini apps activity" etc.
  const words = nl.split(/\s+/).map((w) => w.replace(/[^a-z0-9.&'-]/g, '')).filter(Boolean);
  if (!words.length) return false;
  // Gov/tax authority, statutory term, or accounting software → never a competing firm.
  if (isNotACompetitor(nl, words)) return false;
  /* A single English function word ("always", "ask") is provably not a firm — the same marker test
     the market fold uses (knownEntities.ts), so a report and the panel can never disagree on what
     raw-extractor junk is. Broader than the word sets above for bare function words; adds nothing
     for multi-word names (the marker test is single-token only). */
  if (isUncleanedName(n)) return false;
  /* A known DIRECTORY (Checkatrade, Yell, Trustpilot…) is a source, not a rival firm a customer
     hires instead — it passed every set above and could print as a client's "competitor". Known
     NATIONALS stay: Able Group really is a rival. (knownEntities.ts, 2026-08-19.) */
  if (classifyKnownEntity(n)?.kind === 'directory') return false;
  const generic = (w: string) =>
    COMPETITOR_STOPWORDS.has(w) || PLATFORM_UI.has(w) || GENERIC_TERMS.has(w) || PRONOUNS.has(w)
    || DOMAIN_GENERIC.has(w) || FRAGMENT_WORDS.has(w) || NOISE_WORDS.has(w);
  // Every word is generic (stopword / descriptor / venue-type / domain word) → not a real
  // name: "Thai Food", "Cocktail Lounge", "Tax Advisors", "Accountancy Services".
  if (words.every(generic)) return false;
  // Ends in a PLURAL category word → a category/list, not a single venue ("Kava Bars").
  if (PLURAL_CATEGORIES.has(words[words.length - 1])) return false;
  const locTokens = locationText.toLowerCase().split(/[^a-z]+/).filter((tk) => tk.length > 2);
  if (locTokens.length && locTokens.every((tk) => nl.includes(tk)) && words.length <= locTokens.length + 1) return false; // basically the location
  if (!/[A-Z0-9]/.test(n)) return false;                 // no capital/digit anywhere → a fragment, not a name
  if (words.length === 1) {
    // Single word: keep a proper-noun-shaped brand token ("Crunch", "Mazuma", "Azets", "IRIS",
    // "TaxAssist"). Drop generics/domain words and very short tokens. (We no longer require a
    // .&digit char — that was wrongly dropping real one-word brand names.)
    const w = words[0];
    if (generic(w) || w.length < 4) return false;
    if (!/^[A-Z]/.test(n)) return false;                 // must start capitalised (a proper noun)
    if (/ing$/.test(w) && w.length >= 5) return false;   // gerund fragment ("Choosing", "Finding") — never a firm
  }
  return true;
}

/** Trim to a sentence boundary near `max` chars (avoid cutting mid-word). */
function trimToSentence(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return stop > max * 0.5 ? cut.slice(0, stop + 1).trim() : cut.trim() + '…';
}

/** Strip UI chrome + markdown out of an engine answer so it reads as clean prose. */
function cleanAnswerText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')                 // code fences
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')            // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')          // links → their text
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')               // markdown headings (###)
    .replace(/^\s{0,3}[-*•]\s+/gm, '')                // list bullets (* / -)
    .replace(/^\s{0,3}\d+[.)]\s+/gm, '')              // numbered lists
    .replace(/[*_`>#]+/g, '')                         // stray md symbols (** __ ` > #)
    .replace(/\bgive feedback\b/gi, ' ')              // AI-UI cruft
    .replace(/^\s*feedback\b[:\-\s]*/gi, ' ')
    .replace(/\bshow (?:more|less)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// A sentence is "damning evidence" if it names the competitor, states the business/
// category doesn't exist, or starts the recommendations — i.e. the point, not the preamble.
function isDamningSentence(s: string, rival?: string): boolean {
  const l = s.toLowerCase();
  if (rival && l.includes(rival.toLowerCase())) return true;
  if (/\b(no|not|none|couldn't|don't|doesn't|aren't|isn't|unable|cannot)\b/.test(l)
    && /\b(any|dedicated|specific|bar|bars|kava|find|aware|exist|listing|results?|options?)\b/.test(l)) return true;
  if (/\b(best|top|recommend(?:ed)?|you might|try|options? include|here are|popular|consider|check out|go to|standout|notable)\b/.test(l)) return true;
  return false;
}

/**
 * Extract 1–3 CLEAN, relevant sentences from an engine answer for the gut-punch — the
 * damning bit (competitor named / doesn't exist / recommendations), not the rambling
 * preamble or UI/markdown junk. Returns null if nothing clean + relevant can be pulled
 * (so pickGutPunch can prefer a different question's answer).
 */
function extractGutPunch(raw: string, rival?: string): string | null {
  const clean = cleanAnswerText(raw);
  if (clean.length < 20) return null;
  const parts = clean.split(/(?<=[.!?])\s+(?=[A-Z0-9"“'])/).map((s) => s.trim()).filter(Boolean);
  const sentences = parts.length ? parts : [clean];
  let start = sentences.findIndex((s) => isDamningSentence(s, rival));
  if (start < 0) return null;                          // no relevant sentence → let another question win
  let out = '';
  for (let i = start; i < sentences.length && i < start + 3; i++) {
    const next = out ? `${out} ${sentences[i]}` : sentences[i];
    if (out && next.length > 340) break;
    out = next;
    if (out.length >= 200) break;
  }
  out = out.trim();
  return out.length >= 20 ? trimToSentence(out, 320) : null;
}

// Head words that signal a broad, unwinnable vanity term ("best bar in X").
const HEAD_TERMS = /\b(best|top|good|great|recommended|popular|leading|favou?rite)\b/i;
// "near me" questions resolve to whatever city the AI guesses (often the WRONG one) — they
// undermine the report's credibility, so they're excluded from gut-punch selection entirely.
const NEAR_ME = /\bnear\s*me\b/i;

// The gut-punch to LEAD the report with: a completed question where an engine did NOT name
// the business and gave clean, damning prose. Ranked by (1) RELEVANCE — a question tied to
// the business's real niche (e.g. "kava", "pool") is a winnable, fixable search and ranks
// far above a broad vanity head term ("best bar in X"), which is deprioritised; then (2)
// whether the answer is damning (doesn't exist / names a real competitor); then (3) clarity.
// "near me" questions are skipped outright. Also returns the top REAL competitor named in the
// chosen answer (for the report's "AI recommended X, Y and others" summary), if any.
function pickGutPunch(
  rows: QueueRow[],
  locationText: string,
  specialisms: string,
  businessType: string,
): { question: string; engineLabel: string; rivals: string[] } | null {
  const niche = nicheKeywordsFrom(specialisms, businessType);
  let best: { question: string; engineLabel: string; rivals: string[] } | null = null;
  let bestScore = -Infinity;
  for (const r of rows) {
    if (r.status !== 'done' || !r.result) continue;
    const q = r.question.toLowerCase();
    if (NEAR_ME.test(q)) continue;                       // never lead with a wrong-city "near me" answer
    const hasNiche = niche.some((k) => q.includes(k));
    const isHead = HEAD_TERMS.test(q);
    for (const engine of DISPLAY_ENGINES) {
      const er = r.result[engine];
      if (!er || er.named) continue;
      const text = (er.answer_text || '').trim();
      if (!text || isJunkAnswer(text)) continue;         // skip map/image/URL junk outright
      const rivals = er.competitors.filter((c) => isRealCompetitor(c, locationText));
      const rival = rivals[0];
      // Gate on extraction: only lead with an answer that is genuinely damning (competitor
      // named / business or category absent / recommendations). The report writes its own
      // clean SUMMARY of this answer — it never uses the extracted snippet verbatim.
      const snippet = extractGutPunch(text, rival);
      if (!snippet) continue;
      let score = 0;
      // (1) Relevance / winnability — dominant.
      if (hasNiche) score += 2_000_000;                  // specialism-relevant, winnable
      else if (isHead) score -= 1_500_000;               // broad vanity head term, unwinnable
      // (2) Damning answer.
      if (looksAbsent(text)) score += 400_000;
      if (rival) score += 200_000;                       // names a real competitor
      // (3) Clarity tiebreak.
      score += Math.min(snippet.length, 400) / 100;
      if (score > bestScore) {
        bestScore = score;
        best = { question: r.question, engineLabel: ENGINE_LABELS[engine] ?? engine, rivals };
      }
    }
  }
  return best;
}

/* ── MARKET AUDITS ARE NOT CLIENT REPORTS ─────────────────────────────────────────────────────
   A MARKET audit measures a trade in a town with NO business attached: business_name is a
   sentinel ("[market] locksmiths · Hastings") and lead_id is null. It exists to learn who AI names
   in a market, so its named count is 0 by construction — which is correct, and must never be
   rendered as a business's result. A report titled with that sentinel, or a hero verdict reading
   "AI doesn't know you exist" about it, would be indefensible if it ever reached a customer.

   ONE PREDICATE, USED BY EVERY REPORT PATH — the auto-report in process-ai-audit-queue, the public
   render-audit-report renderer, generate-report, the operator's download and the in-app preview.
   It reads the is_market COLUMN, never the name: a string prefix is not a safety guard, and this is
   the guard that stops a public report publishing itself with no human involved. */
export interface MarketAuditFlag { is_market?: boolean | null }

export function isMarketAudit(audit: MarketAuditFlag | null | undefined): boolean {
  return audit?.is_market === true;
}

/** The refusal every report path gives for a market audit. One sentence, so the five call sites
 *  cannot drift into explaining it differently. */
export const MARKET_AUDIT_NO_REPORT =
  'This is a market audit — a trade and a town with no business attached — so it has no client report.';

/** results.seo is only renderable by the report when it's a GRADED object (overall grade +
 *  the three category grades). The queue writes a failure/cap marker ({error, checked_at})
 *  when the SEO step doesn't produce a grade — passing that to the report crashes its
 *  seoSection (reads .categories.onPage). Gate on shape so markers are dropped, not rendered. */
export function isRenderableSeo(s: unknown): s is AiAuditSeo {
  if (!s || typeof s !== 'object') return false;
  const c = (s as { categories?: unknown }).categories as Record<string, unknown> | undefined;
  return !!c && typeof c === 'object' && !!c.onPage && !!c.contentTechnical;
}

const SEO_SEV_RANK: Record<SeoFinding['severity'], number> = { high: 0, med: 1, low: 2 };

/**
 * Fold per-page SEO findings into one line each.
 *
 * WHY. The scan actor reports issues PER CRAWLED PAGE and embeds the count in the message, so
 * a 3-page crawl emits "14 images without alt text" AND "2 images without alt text" carrying
 * the SAME fixHint. collectIssues (seo-scan-core) dedupes by message, which cannot catch these
 * because the messages differ only by their number — so a paying customer saw what reads as
 * the same defect listed twice with different figures. Observed live on a real report.
 *
 * Aggregating at DISPLAY time rather than in the scanner fixes the payloads already stored
 * (every past scan) as well as new ones, with no backfill.
 *
 * Grouping key is the message with its digit runs masked, plus the detail — so the two alt-text
 * lines collapse while genuinely different issues that happen to share a fixHint do not. Counts
 * are summed and written back into the title. A title with no number, or with more than one, is
 * still deduped but never rewritten: there would be no unambiguous figure to sum.
 *
 * That last case is deliberately LOSSY, and worth knowing about. Measured on stored payloads,
 * it collapses pairs like "Thin content: only 266 words" + "only 16 words" (keeping 266) and
 * "Skipped heading level: 2 -> 4" + "1 -> 3" (keeping the first). One line per issue type is the
 * requirement, the fix we sell is the same either way, and the survivor is chosen by highest
 * severity then the actor's own order — but the per-page specifics of the other instances do go.
 * It errs towards understating a problem we are offering to fix, never towards over-claiming.
 */
export function aggregateSeoFindings(findings: SeoFinding[]): SeoFinding[] {
  const groups = new Map<string, { finding: SeoFinding; total: number; numbered: boolean }>();
  for (const f of findings ?? []) {
    const title = (f?.title ?? '').trim();
    if (!title) continue;
    const detail = (f?.detail ?? '').trim();
    const severity = f?.severity ?? 'low';
    const numbers = title.match(/\d+/g) ?? [];
    const numbered = numbers.length === 1;
    const key = `${title.toLowerCase().replace(/\d+/g, '#')}|${detail.toLowerCase()}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { finding: { title, detail, severity }, total: numbered ? Number(numbers[0]) : 0, numbered });
      continue;
    }
    // Same issue from another page: add its count and keep the worst severity seen.
    if (existing.numbered && numbered) existing.total += Number(numbers[0]);
    if (SEO_SEV_RANK[severity] < SEO_SEV_RANK[existing.finding.severity]) existing.finding.severity = severity;
  }
  return [...groups.values()].map(({ finding, total, numbered }) =>
    numbered && total > 0
      ? { ...finding, title: finding.title.replace(/\d+/, String(total)) }
      : finding
  );
}

// ── Per-term winnability: fragmentation + cross-engine consensus ─────────────
// Reserves 'locked' for a SMALL, CONSISTENT, own-site incumbent set (few firms named on
// BOTH scored engines, ranking on their own sites, with real citations). Fragmented fields
// (many distinct firms, low cross-engine overlap, directory-driven) read as 'open' — the
// OPPOSITE of the old union-count rule, where more rivals wrongly meant more locked. Shared
// by the badge (AiAudit.tsx) and the report (buildReportData) so the two can't drift.
// isAggregatorUrl is dependency-injected: the SPA and edge keep separate copies of the
// domain lists (the '@/' alias can't resolve in a Deno bundle), so the caller passes its own.
export type Winnability = 'open' | 'contested' | 'locked' | 'named' | 'no-local-race';

export interface WinnabilityResult {
  verdict: Winnability;
  score: number | null;   // /10; null for no-local-race
  U: number;              // distinct real firms across scored engines (normalized)
  C: number;              // firms named on BOTH scored engines (normalized intersection)
  overlap: number;        // C / U (0 when U === 0)
  agg: number;            // aggregator/directory share of non-own citations
  cites: number;          // count of non-own citations across scored engines
  clientNamed: boolean;
  namedFirms: string[];   // display names, deduped, isRealCompetitor-filtered
  reason: string;
}

// Corporate suffixes + generic trade words stripped when matching firm names, so
// "Smith Plumbing" and "J Smith Plumbing Ltd" collapse to the same key ("smith"). Accepted
// trade-off: two different firms sharing a surname can merge (rare, usually one family firm).
// Falls back to the full normalized string if every token strips out.
// Corporate suffixes + connectives ("and"/"of", matching the & → space strip below).
const FIRM_SUFFIXES = new Set(['ltd', 'limited', 'llp', 'plc', 'co', 'inc', 'llc', 'group', 'uk', 'the', 'and', 'of']);
const FIRM_TRADE_GENERIC = new Set([
  'plumbing', 'plumber', 'plumbers', 'heating', 'gas', 'electrical', 'electrician', 'electricians',
  'services', 'service', 'solutions', 'company', 'contractors', 'contractor',
]);

function firmKey(name: string): string {
  const toks = name.toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/).filter(Boolean)
    .filter((t) => t.length > 1)                                     // drop single-letter initials ("J")
    .filter((t) => !FIRM_SUFFIXES.has(t) && !FIRM_TRADE_GENERIC.has(t));
  return toks.sort().join(' ') || name.trim().toLowerCase();
}

/** Domain of a URL, lowercased + www-stripped; '' on parse failure. */
function domainOfSafe(url: string): string {
  try { return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return ''; }
}

/**
 * Classify ONE question's winnability from its per-engine data. See the block comment above
 * for the rule. `isAggregatorUrl` is injected so this stays runnable in both the SPA and Deno.
 */
export function classifyWinnability(
  result: EngineMap,
  opts: { businessName: string; locationText: string; ownWebsite?: string; isAggregatorUrl: (url: string) => boolean },
): WinnabilityResult {
  const { locationText, ownWebsite = '', isAggregatorUrl } = opts;
  const ownDomain = ownWebsite ? domainOfSafe(ownWebsite) : '';

  let clientNamed = false;
  let scoredNamed = 0;
  let bestPosition: number | null = null;
  // Client named-signal across ALL display engines (defend if named anywhere).
  for (const engine of DISPLAY_ENGINES) {
    const er = result[engine];
    if (!er) continue;
    if (er.named) {
      clientNamed = true;
      if ((SCORED_ENGINES as readonly string[]).includes(engine)) scoredNamed++;
      if (er.position != null) bestPosition = bestPosition == null ? er.position : Math.min(bestPosition, er.position);
    }
  }

  // Competitors + citations from the SCORED engines only (chatgpt, gemini) — the engines with
  // real AI-named firm lists and where cross-engine agreement is meaningful.
  const perEngineKeys: Set<string>[] = [];    // firmKey sets, one per scored engine that RAN
  const display = new Map<string, string>();  // firmKey → display name (first seen)
  let citTotal = 0;
  let citAggregator = 0;
  for (const engine of SCORED_ENGINES) {
    const er = result[engine];
    if (!er) continue;                          // engine didn't run for this term
    const keys = new Set<string>();
    for (const c of er.competitors) {
      if (!isRealCompetitor(c, locationText)) continue;
      const k = firmKey(c);
      if (!k) continue;
      keys.add(k);
      if (!display.has(k)) display.set(k, c.trim());
    }
    perEngineKeys.push(keys);
    for (const cit of er.citations) {
      const url = cit?.url;
      if (!url) continue;
      if (ownDomain && domainOfSafe(url).endsWith(ownDomain)) continue;   // own-site citation — skip
      citTotal++;
      if (isAggregatorUrl(url)) citAggregator++;
    }
  }

  const enginesRan = perEngineKeys.length;
  const union = new Set<string>();
  for (const s of perEngineKeys) for (const k of s) union.add(k);
  const U = union.size;
  // Cross-engine consensus: firms named on BOTH scored engines. Only defined when both ran.
  const C = enginesRan >= 2 ? [...perEngineKeys[0]].filter((k) => perEngineKeys[1].has(k)).length : 0;
  const overlap = U > 0 ? C / U : 0;
  const agg = citTotal > 0 ? citAggregator / citTotal : 0;
  const cites = citTotal;
  const namedFirms = [...display.values()];
  const top = namedFirms.slice(0, 3);
  const firmList = top.join(', ') + (U - top.length > 0 ? ` +${U - top.length}` : '');

  // 1) Named anywhere → defend.
  if (clientNamed) {
    let score = 8;
    if (scoredNamed >= 2) score += 1;
    if (bestPosition != null && bestPosition <= 3) score += 1;
    score = Math.min(10, score);
    const namedOn = DISPLAY_ENGINES.filter((e) => result[e]?.named).map((e) => ENGINE_LABELS[e] ?? e);
    return { verdict: 'named', score, U, C, overlap, agg, cites, clientNamed: true, namedFirms,
      reason: `You're already named on ${namedOn.join(', ')} — defend this.` };
  }

  // 2) No real firms named anywhere → generic advice, not a local race.
  if (U === 0) {
    return { verdict: 'no-local-race', score: null, U, C, overlap, agg, cites, clientNamed: false, namedFirms: [],
      reason: 'No local firms named — AI gives generic advice, so there is no local race to win here.' };
  }

  // 3) Locked — a small, cross-engine-consistent set of own-site incumbents. Requires BOTH
  //    engines ran (overlap signal) AND cites >= 2, so a thin/no-citation term can never lock.
  if (enginesRan >= 2 && U <= 3 && C >= 2 && overlap >= 0.5 && agg < 0.4 && cites >= 2) {
    const score = overlap >= 0.75 && agg < 0.2 ? 2 : 3;
    return { verdict: 'locked', score, U, C, overlap, agg, cites, clientNamed: false, namedFirms,
      reason: `A small, consistent set of firms (${firmList}) rank across ChatGPT and Gemini on their own sites — well dug in.` };
  }

  // 4) Open — fragmented (many firms), directory-driven, or no cross-engine consensus.
  if (U >= 6 || agg >= 0.6 || (C === 0 && U >= 2)) {
    const score = (U >= 8 || agg >= 0.6) ? 9 : U >= 6 ? 8 : 7;
    const why = U >= 6 ? `AI names ${U} different firms with little overlap`
      : agg >= 0.6 ? 'incumbents rank off directory listings, not their own sites'
      : 'ChatGPT and Gemini name different firms — no agreed incumbent';
    return { verdict: 'open', score, U, C, overlap, agg, cites, clientNamed: false, namedFirms,
      reason: `${why} (${firmList}); you're absent. A fragmented, winnable field — worth targeting.` };
  }

  // 5) Contested — a middling field.
  const score = agg >= 0.4 ? 6 : agg < 0.2 ? 4 : 5;
  return { verdict: 'contested', score, U, C, overlap, agg, cites, clientNamed: false, namedFirms,
    reason: `AI names ${U} firm${U === 1 ? '' : 's'} (${firmList}); you're absent. A contested field — winnable with focus.` };
}

/** Derive the client report's data from a run's queue rows. Pure — used both for the live
 *  report on the results screen and to build a snapshot when opening a past audit's report.
 *  Returns null until at least one question has completed. */
export function buildReportData(
  queueRows: QueueRow[],
  run: RunRow | null,
  ctx: {
    businessName: string; businessType: string; locationText: string; specialisms: string;
    // Injected so the shared winnability rule runs in both the SPA and Deno (see classifyWinnability).
    isAggregatorUrl: (url: string) => boolean;
    ownWebsite?: string;
  },
): AiAuditReportData | null {
  let done = 0;
  let liveNamed = 0;
  let liveTotal = 0;
  for (const r of queueRows) {
    if (r.status === 'done' && r.result) {
      done++;
      /* ⛔ COUNT THE ANSWERS THAT EXIST, NOT THE ONES WE ASKED FOR. liveTotal++ used to be
         unconditional: it assumed both scored engines answered every question, so a single engine
         timing out would put a denominator on the report that was one higher than the truth —
         "out of 6 answers" when 5 came back — on the artefact that sells, with nothing to flag it.
         Measured 2026-08-08 across all 835 completed questions: 1,670 claimed, 1,670 real, so no
         report ever sent carried a wrong figure. This makes it true by construction rather than
         true by luck.
         ⚠️ Twenty lines below, perEngine already counted correctly (`if (r.result?.[engine])`).
         Two counting rules in one file was the actual fault. */
      for (const e of SCORED_ENGINES) {
        if (!r.result[e]) continue;
        liveTotal++;
        if (r.result[e]?.named) liveNamed++;
      }
    }
  }
  if (done === 0) return null;

  /* The two numbers behind the total, so the report can show its working. enginesUsed counts the
     SCORED engines that actually returned something on at least one question — not the ones asked
     for, for the same reason the total is now conditional. */
  const enginesSeen = new Set<string>();
  for (const r of queueRows) {
    if (r.status === "done" && r.result) for (const e of SCORED_ENGINES) if (r.result[e]) enginesSeen.add(e);
  }

  const summary = (run?.results as { summary?: { named_datapoints: number; total_datapoints: number } } | null)?.summary;
  const named = summary?.named_datapoints ?? liveNamed;
  const total = summary?.total_datapoints ?? liveTotal;

  const perEngine = DISPLAY_ENGINES.map((engine) => {
    let n = 0;
    let t = 0;
    for (const r of queueRows) {
      if (r.status === 'done' && r.result?.[engine]) { t++; if (r.result[engine]!.named) n++; }
    }
    return { engine, named: n, total: t };
  }).filter((pe) => pe.total > 0).map((pe) => ({ label: ENGINE_LABELS[pe.engine] ?? pe.engine, named: pe.named, total: pe.total }));

  const counts = new Map<string, { name: string; count: number }>();
  for (const r of queueRows) {
    if (r.status !== 'done' || !r.result) continue;
    for (const engine of DISPLAY_ENGINES) {
      const er = r.result[engine];
      if (!er) continue;
      if (engine === 'google_organic') continue; // organic result TITLES aren't AI-named firms
      for (const c of er.competitors) {
        if (!isRealCompetitor(c, ctx.locationText)) continue;
        const key = c.trim().toLowerCase();
        if (!key) continue;
        const cur = counts.get(key);
        if (cur) cur.count++; else counts.set(key, { name: c.trim(), count: 1 });
      }
    }
  }
  /* ══ WHO AI ACTUALLY RECOMMENDS MOST ══════════════════════════════════════════════════
     ⛔ GROUPING IS A PRECONDITION, NOT A REFINEMENT. Ranking a SPLIT count names the wrong firms
     with more confidence than not ranking at all. Measured on Wilson's Cambridge market
     2026-08-09: "Chapman’s Valeting & Detailing Specialists" (13, curly apostrophe) and
     "Chapman's …" (8, straight) are one firm with 21 — the real leader, ranking below a split of
     itself. Group first, then rank.

     ⚠️ THE DISPLAY NAME IS THE MOST-MENTIONED SPELLING in the group, not the first or the longest.
     It is the form the engines actually use most, which is the one a reader will recognise. */
  const ctxMatch = buildMatchContext(ctx.businessType ?? '', ctx.locationText ?? '');
  const groups = groupNames([...counts.values()].map((c) => c.name), ctxMatch);
  const byGroup = new Map<string, { name: string; count: number; spellings: string[] }>();
  /* ⛔ REVERTED 2026-08-13: THE LABEL IS THE MOST-MENTIONED SPELLING, FULL STOP.
     For one day this preferred the most-mentioned MULTI-WORD spelling, on the reasoning that a bare
     fragment ("Safe") should never wear a group's count. The reasoning was fine and the effect was
     not: a multi-token label is exactly what an extraction fragment looks like, so
     "Checkatrade\n    \n    If" started BEATING clean "Checkatrade" for the label — and that label
     is not only printed, it becomes audit_reply's {{2}} WhatsApp parameter.
     Measured on 60 recent audits, same rows both ways: the parameter went from 0 rejected by Meta
     to 8 (13%), error #132018 "Param text cannot have new-line/tab characters or more than 4
     consecutive spaces". A report cosmetic broke a live send path, because topCompetitors is read
     by _shared/audit-reply.ts as well as by the report.
     ⚠️ THE LESSON, NOT THE PATCH: check who else consumes a list before changing what it contains.
     The fragment problem is real but belongs upstream in the extractor, not in the label chooser.
     ⚠️ The trades stopwords added at the same time are KEPT — they drop "Safe"/"Locksmith" at the
     counting stage, which is where a fragment should die, and they moved no parameter. */
  for (const grp of groups.values()) {
    let total = 0;
    let best = { name: grp.names[0] ?? '', count: -1 };
    for (const n of grp.names) {
      const c = counts.get(n.trim().toLowerCase());
      const got = c?.count ?? 0;
      total += got;
      if (got > best.count) best = { name: n, count: got };
    }
    if (total > 0) byGroup.set(grp.key, { name: best.name, count: total, spellings: grp.names });
  }
  /* Ranked by grouped count, ties broken by name so the order is stable between renders of the
     same audit — a report that reshuffles its competitors on refresh reads as made up. */
  const ranked = [...byGroup.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const competitors = ranked.slice(0, 4).map((x) => x.name);
  /* Carried WITH counts so the document can say how often, which is the part that makes it
     credible: "Ultimate Valet Cambridge (5)" is checkable, "Ultimate Valet Cambridge" is a claim. */
  const topCompetitors = ranked.slice(0, 3).map((x) => ({ name: x.name, count: x.count }));
  const competitorMentions = ranked.reduce((n, x) => n + x.count, 0);

  /* Per-term winnability is NOT built into the customer report's data. The verdict is not
     defensible yet (77.6% of 402 stored questions read "winnable", 0% ever read "locked", and
     17.9% of repeated questions flipped verdict with no work done), so nothing that renders to a
     prospect or client carries it. classifyWinnability stays exported for the operator view in
     AiAudit.tsx, which labels it unreliable. */

  return {
    businessName: ctx.businessName || 'This business',
    businessType: ctx.businessType || '',
    named,
    total,
    questionsAsked: done,          // questions with a completed answer, not questions requested
    enginesUsed: enginesSeen.size, // scored engines that actually returned something
    pct: total > 0 ? Math.round((named / total) * 100) : 0,
    perEngine,
    competitors,
    /* The audit-wide leaders. The report names THESE, not whoever happened to appear in the one
       answer gutPunch quotes — that is what put "Get A Splash, Fresh Car, Clean Me" on Wilson's
       report while Ultimate Valet, the top firm in his own data, went unmentioned. */
    topCompetitors,
    competitorMentions,
    gutPunch: pickGutPunch(queueRows, ctx.locationText, ctx.specialisms, ctx.businessType),
    // The date the AUDIT WAS MEASURED, not the date someone happened to open the link.
    // render-audit-report rebuilds this on every request, so new Date() re-dated a three-week-old
    // report to today every time it was viewed — which also makes it useless as the day-0 artefact
    // the guarantee's before/after is supposed to rest on. Falls back to now only when the caller
    // did not select created_at (older call sites), which is the previous behaviour.
    generatedAtLabel: new Date(run?.created_at ?? Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    // Only carry a GRADED seo; drop failure/cap markers so the report never crashes on them.
    // Findings are folded here, at the one point BOTH the report renderer and the onboarding
    // results screen read them, so the two can't drift and stored payloads are fixed too.
    seo: (() => {
      const s = (run?.results as { seo?: unknown } | null)?.seo;
      if (!isRenderableSeo(s)) return undefined;
      return { ...s, leadFindings: aggregateSeoFindings(s.leadFindings ?? []) };
    })(),
    // No own website → the report offers to build one instead of leaving a gap. Derived from the
    // website the caller passes, which is the same value that decides whether a scan runs at all.
    hasWebsite: !!(ctx.ownWebsite && ctx.ownWebsite.trim()),
  };
}
