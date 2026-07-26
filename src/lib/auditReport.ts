// Shared AI-visibility audit REPORT logic — the single source of truth for turning a run's
// queue rows into AiAuditReportData (which renderReportHtml consumes). Pure TypeScript: NO
// React, NO browser/DOM deps, so it runs in BOTH the SPA and a Deno edge function (automation
// B's server-side report renderer). Extracted VERBATIM from src/pages/AiAudit.tsx — logic
// unchanged; only `export` added to the symbols the app + server consume.
import type { AiAuditReportData, AiAuditSeo } from './aiAuditReportHtml.ts';

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
  citations: { title: string; url: string }[];
  answer_text: string;
}
export type EngineMap = Record<string, EngineResult>;
export interface QueueRow { id: string; question: string; status: string; result: EngineMap | null; }
export interface RunRow { id: string; audit_id: string; run_number: number; status: string; mention_rate: number | null; results: unknown }
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

/** results.seo is only renderable by the report when it's a GRADED object (overall grade +
 *  the three category grades). The queue writes a failure/cap marker ({error, checked_at})
 *  when the SEO step doesn't produce a grade — passing that to the report crashes its
 *  seoSection (reads .categories.onPage). Gate on shape so markers are dropped, not rendered. */
export function isRenderableSeo(s: unknown): s is AiAuditSeo {
  if (!s || typeof s !== 'object') return false;
  const c = (s as { categories?: unknown }).categories as Record<string, unknown> | undefined;
  return !!c && typeof c === 'object' && !!c.onPage && !!c.contentTechnical;
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
      for (const e of SCORED_ENGINES) { liveTotal++; if (r.result[e]?.named) liveNamed++; }
    }
  }
  if (done === 0) return null;

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
  const competitors = [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 4).map((x) => x.name);

  // Per-term winnability — the SHARED fragmentation + cross-engine-consensus rule (same helper
  // the badge uses, so report and badge can't drift). rivalCount = U (distinct firms across the
  // scored engines) for backward-compat with the report data shape.
  const winnability = queueRows
    .filter((r) => r.status === 'done' && r.result)
    .map((r) => {
      const w = classifyWinnability(r.result!, {
        businessName: ctx.businessName,
        locationText: ctx.locationText,
        ownWebsite: ctx.ownWebsite,
        isAggregatorUrl: ctx.isAggregatorUrl,
      });
      return { question: r.question, verdict: w.verdict, rivalCount: w.U };
    });

  return {
    businessName: ctx.businessName || 'This business',
    businessType: ctx.businessType || '',
    named,
    total,
    pct: total > 0 ? Math.round((named / total) * 100) : 0,
    perEngine,
    competitors,
    winnability,
    gutPunch: pickGutPunch(queueRows, ctx.locationText, ctx.specialisms, ctx.businessType),
    generatedAtLabel: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    // Only carry a GRADED seo; drop failure/cap markers so the report never crashes on them.
    seo: (() => { const s = (run?.results as { seo?: unknown } | null)?.seo; return isRenderableSeo(s) ? s : undefined; })(),
    // No own website → the report offers to build one instead of leaving a gap. Derived from the
    // website the caller passes, which is the same value that decides whether a scan runs at all.
    hasWebsite: !!(ctx.ownWebsite && ctx.ownWebsite.trim()),
  };
}
