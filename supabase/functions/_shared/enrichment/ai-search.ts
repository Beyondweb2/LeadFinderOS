/**
 * AI Visibility Audit — Apify source (apify/google-search-scraper).
 *
 * One actor run per QUESTION returns, in a single dataset item, the answer from
 * multiple engines: ChatGPT, Perplexity, Gemini, Google's AI Overview, plus the
 * Google organic list. We normalise each engine into a common shape so the audit
 * can score "is the business named, and who are the competitors" per engine.
 *
 * Runs via the shared runApifyActor (./apify.ts); cost-capped by ./runner.ts in the
 * caller (process-ai-audit-queue).
 *
 * ── Actor contract ──────────────────────────────────────────────────────────
 *  INPUT:  countryCode = lowercase ISO-3166 alpha-2 ("gb" for UK). AI engines are
 *          NESTED objects: chatGptSearch.enableChatGpt, perplexitySearch.enablePerplexity,
 *          geminiSearch.enableGemini, aiOverview.scrapeFullAiOverview.
 *  OUTPUT (confirmed from a real dataset item — note OUTPUT keys differ from INPUT keys):
 *          organicResults[]        { title, url, position, ... }
 *          chatGptSearchResult     { text, sources[] }            (sources often empty)
 *          perplexitySearchResult  { text, sources[{title,url,snippet}], citationUrls[] }
 *          geminiSearchResult      { text, sources[{title,url,description}] }
 *          AI Overview key not yet confirmed from a live run → still probed (see below).
 *
 * Competitor detection is BEST-EFFORT from unstructured text (this actor has no
 * structured brand field): candidate names come from organicResults titles + the
 * engine's answer_text. It's approximate by design — easy to refine below.
 */
import { runApifyActor, startApifyRun, getApifyRun, getApifyRunItems } from "./apify.ts";

/** apify/google-search-scraper — actor id uses `~` in the API path. */
export const AI_SEARCH_ACTOR = "apify~google-search-scraper";

/** Engines we normalise. Active set = ChatGPT + Gemini + Google organic (organic comes free
 *  in the same run; the queue scores [chatgpt,gemini]). ai_overview stays in the loop but is
 *  no longer scraped (see buildAiSearchInput) — normalizeAiSearch finds no block and simply
 *  omits it, so re-enabling the toggle is all it takes to bring it back.
 *  'perplexity' stays in the type (dormant — not enabled, not looped) so it's a one-line
 *  re-add: put it back in AI_ENGINES and re-enable perplexitySearch in the input. */
export type AiEngineKey = "chatgpt" | "perplexity" | "gemini" | "ai_overview" | "google_organic";
export const AI_ENGINES: AiEngineKey[] = ["chatgpt", "gemini", "ai_overview", "google_organic"];

export interface AiCitation {
  title: string;
  url: string;
}

/** Normalised per-engine result — the common shape the audit scores on. */
export interface AiEngineResult {
  /** Business name appears in this engine's answer_text or in a source title. */
  named: boolean;
  /** Rank the business appears at (organic position / source index), else null. */
  position: number | null;
  /** Best-effort competitor names mentioned by this engine (excludes self). Approximate
   *  — extracted from unstructured text, not a structured field. */
  competitors: string[];
  citations: AiCitation[];
  answer_text: string;
}

/** Only engines the actor actually scraped are present. A dropped/disabled engine
 *  (e.g. ai_overview) is ABSENT, not present-with-zeros, so downstream surfaces don't
 *  count it as a real "0 named" datapoint. */
export type AiSearchResult = Partial<Record<AiEngineKey, AiEngineResult>>;

/** Lead `country` enum → lowercase ISO-3166 alpha-2 for the actor's countryCode. */
const COUNTRY_TO_ISO2: Record<string, string> = {
  UK: "gb", Australia: "au", USA: "us", Canada: "ca", Germany: "de", France: "fr",
  Spain: "es", Italy: "it", Netherlands: "nl", Belgium: "be", Ireland: "ie",
  NewZealand: "nz", SouthAfrica: "za", India: "in", Singapore: "sg", UAE: "ae",
  Brazil: "br", Mexico: "mx", Japan: "jp", Sweden: "se", Thailand: "th",
};

/** Map a lead country (enum or raw) to the actor's lowercase countryCode. Defaults
 *  to "gb" (UK-first product) so a missing/unknown country still targets a sane market. */
export function toCountryCode(country?: string | null): string {
  if (!country) return "gb";
  return COUNTRY_TO_ISO2[country] ?? (country.length === 2 ? country.toLowerCase() : "gb");
}

/** Build the actor input for ONE question. countryCode should already be lowercase
 *  ISO-2 (use toCountryCode); we lowercase defensively. */
export function buildAiSearchInput(query: string, countryCode: string): Record<string, unknown> {
  return {
    queries: query,
    countryCode: (countryCode || "gb").toLowerCase(),
    maxPagesPerQuery: 1,
    languageCode: "en",
    // AI-engine add-ons (nested-object form the actor expects). Scored engine set = ChatGPT + Gemini.
    // NOTE: google-search-scraper ALWAYS returns Google organic as its BASE output — there is no
    // input toggle to disable it (organic IS the search; the AI engines ride on top). So
    // google_organic is DROPPED at the normalization layer (see normalizeAiSearch), not here: it's
    // not in SCORED_ENGINES and is no longer emitted, so it's ABSENT downstream (not zero-scored).
    // AI Overview DROPPED to cut per-call latency and 115s aborts — it's DISPLAY-ONLY (not in
    // SCORED_ENGINES). Re-enable if needed by restoring:  aiOverview: { scrapeFullAiOverview: false },
    chatGptSearch: { enableChatGpt: true },
    geminiSearch: { enableGemini: true },
    // Perplexity dropped (kept dormant — flip enablePerplexity:true to re-add):
    // perplexitySearch: { enablePerplexity: true },
  };
}

/** Run the actor for one question. Thin wrapper over runApifyActor (Bearer token,
 *  timeout, opt-in retry all handled there). Returns raw dataset items + duration. */
export async function runAiSearch(
  query: string,
  countryCode: string,
  opts: { token: string; timeoutMs?: number; retry?: { on429?: boolean; onAbort?: boolean } },
): Promise<{ items: unknown[]; ms: number }> {
  return await runApifyActor(AI_SEARCH_ACTOR, buildAiSearchInput(query, countryCode), opts);
}

/* ── Async AI-search (start / poll / fetch) ───────────────────────────────────
 * Non-blocking alternative to runAiSearch: START a run per question (~1s), POLL it on later
 * ticks, FETCH its dataset once SUCCEEDED. Decouples the 2–9min scrape from the edge
 * wall-clock so slow questions can't abort. Items shape is IDENTICAL to run-sync (Phase-1
 * validated), so normalizeAiSearch consumes fetchAiSearchItems output unchanged. */

/** START a run for ONE question. Returns the runId to poll on later ticks. */
export async function startAiSearch(
  query: string,
  countryCode: string,
  token: string,
): Promise<{ runId: string; datasetId: string | null; status: string }> {
  return await startApifyRun(AI_SEARCH_ACTOR, buildAiSearchInput(query, countryCode), token);
}

/** POLL a started run's status (READY/RUNNING/SUCCEEDED/FAILED/ABORTED/TIMED-OUT). */
export async function pollAiSearchRun(
  runId: string,
  token: string,
): Promise<{ status: string; datasetId: string | null; runTimeSecs: number | null }> {
  return await getApifyRun(runId, token);
}

/** FETCH a SUCCEEDED run's dataset items — feed straight to normalizeAiSearch. */
export async function fetchAiSearchItems(runId: string, token: string): Promise<unknown[]> {
  return await getApifyRunItems(runId, token);
}

/* ───────────────────────────── normalisation ────────────────────────────── */

// The real OUTPUT keys for each AI engine block. chatgpt/perplexity/gemini are exact
// (confirmed from a live run). AI Overview isn't confirmed yet, so it keeps a probe —
// update this to the exact key once you've seen it in a real dataset item.
const ENGINE_BLOCK_KEYS: Record<Exclude<AiEngineKey, "google_organic">, string[]> = {
  chatgpt: ["chatGptSearchResult"],
  perplexity: ["perplexitySearchResult"], // DORMANT — not in AI_ENGINES; parsing kept for easy re-add
  gemini: ["geminiSearchResult"],
  ai_overview: ["aiOverviewResult", "aiOverview", "aiOverviewSearchResult"], // probe until confirmed
};
const TEXT_KEYS = ["text", "answer", "content", "answer_text", "response"];
const SOURCES_KEYS = ["sources", "citations", "references"];
const MAX_CITATIONS = 20;
// Splits a SERP title's leading business name from its marketing tail, e.g.
// "Joe's Barbers - Best in Leeds | Book Now" → "Joe's Barbers".
const TITLE_DELIMS = /[|\-–—:·•]/;

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function firstKey(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) if (obj[k] != null) return obj[k];
  return undefined;
}
function asStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function norm(s: string): string {
  return s.trim().toLowerCase();
}
function contains(hay: string, needle: string): boolean {
  const n = norm(needle);
  return n.length > 0 && norm(hay).includes(n);
}

/* ── name matching (connector/shortening-robust) ──────────────────────────────
 * The old full-string contains() failed on ordinary brand variance: stored
 * "Sinners and Saints pool bar and kava cafe" vs AI's "Sinners N Saints …" (and/N,
 * plus AI shortening to the leading brand), so clear namings read "not named". These
 * helpers match a DISTINCTIVE CORE robustly — punctuation-stripped, connectors (&/and/n)
 * canonicalised, accents folded — with a strength guard so a weak/generic core can't
 * over-match. Deliberately NO phonetic/spelling folding (e.g. cafe↔kafe) — too risky. */
const NAME_CONNECTORS = new Set(["and", "n"]);                    // &/and/n → one canonical token
const NAME_STOPWORDS = new Set(["the", "a", "an", "of", "for"]);  // ignored when judging core strength
// Generic venue/trade/legal descriptors — the brand CORE is whatever LEADS before the first of
// these. Conservative by design (extend as needed); only used to find the distinctive segment.
const GENERIC_NAME_TOKENS = new Set([
  "pool", "bar", "cafe", "kava", "restaurant", "grill", "kitchen", "lounge", "club", "pub", "bistro",
  "diner", "eatery", "salon", "barbers", "barber", "spa", "clinic", "dental", "dentist", "plumbing",
  "plumber", "electrical", "electrician", "builders", "building", "roofing", "garage", "motors",
  "cars", "accountants", "accountant", "accountancy", "solicitors", "solicitor", "law", "legal",
  "consulting", "consultants", "services", "service", "group", "associates", "partners",
  "partnership", "studio", "gym", "fitness", "hotel", "shop", "store", "boutique",
  "ltd", "limited", "llp", "llc", "inc", "co", "company", "plc", "gmbh", "corp", "corporation",
]);

/** Canonical token stream for name matching: lowercase, fold accents (café→cafe), ampersand→"and",
 *  strip punctuation/apostrophes, collapse whitespace, and canonicalise connector tokens
 *  (&/and/n all become "and"). No phonetic folding — matching stays exact per token. */
function normalizeForMatch(s: string): string {
  return norm(s)
    .normalize("NFD").replace(/\p{Diacritic}/gu, "") // fold accents so café == cafe
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]+/g, " ")                     // drop punctuation/apostrophes
    .split(/\s+/).filter(Boolean)
    .map((t) => (NAME_CONNECTORS.has(t) ? "and" : t))
    .join(" ");
}

/** Distinctive leading brand segment (normalised) — everything before the first generic
 *  descriptor. "Sinners N Saints Pool Bar and Kava Cafe" → "sinners and saints". */
function businessCore(businessName: string): string {
  const tokens = normalizeForMatch(businessName).split(/\s+/).filter(Boolean);
  const core: string[] = [];
  for (const t of tokens) {
    if (GENERIC_NAME_TOKENS.has(t)) break;
    core.push(t);
  }
  while (core.length && NAME_CONNECTORS.has(core[core.length - 1])) core.pop(); // trim trailing connector
  return core.join(" ");
}

/** Exact contiguous run of `needle` tokens inside `hay` tokens (word-level — connectors and
 *  punctuation are already canonical, so no mid-word false hits). */
function tokensContain(hay: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > hay.length) return false;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) { ok = false; break; }
    if (ok) return true;
  }
  return false;
}

/** Does `haystack` NAME the business? Matches the distinctive core when it's strong enough
 *  (≥2 meaningful words, OR one word ≥6 chars); else falls back to the FULL normalised name so a
 *  weak/generic core (e.g. "the") can't over-match on a fragment. */
function nameMatches(haystack: string, businessName: string): boolean {
  const hay = normalizeForMatch(haystack).split(/\s+/).filter(Boolean);
  if (!hay.length) return false;
  const coreTokens = businessCore(businessName).split(/\s+/).filter(Boolean);
  const meaningful = coreTokens.filter((t) => !NAME_CONNECTORS.has(t) && !NAME_STOPWORDS.has(t));
  const strong = meaningful.length >= 2 || meaningful.some((t) => t.length >= 6);
  const needle = strong && coreTokens.length
    ? coreTokens
    : normalizeForMatch(businessName).split(/\s+/).filter(Boolean);
  return tokensContain(hay, needle);
}

/** True when a competitor CANDIDATE is really the audited business under name variance — it either
 *  names the business (core match) or is a fragment of the business's full name. Keeps the firm off
 *  its own competitor list (shares the same matcher as named-detection, per the recon caveat). */
function isSelfName(candidate: string, businessName: string): boolean {
  if (nameMatches(candidate, businessName)) return true;
  const cand = normalizeForMatch(candidate).split(/\s+/).filter(Boolean);
  const full = normalizeForMatch(businessName).split(/\s+/).filter(Boolean);
  return cand.length > 0 && tokensContain(full, cand);
}

function citationOf(src: unknown): AiCitation {
  const r = asRecord(src) ?? {};
  return { title: asStr(firstKey(r, ["title", "name"])), url: asStr(firstKey(r, ["url", "link"])) };
}

/* ── competitors: best-effort, unstructured. Refine here. ─────────────────────
 * There is NO structured brand field in this actor's output. We build a candidate
 * name pool from (a) organicResults titles (leading segment before a delimiter) and
 * (b) proper-noun-ish sequences in the engine's answer_text, then drop the audited
 * business and dedup. This is approximate — it can miss names or catch a stray
 * capitalised phrase — kept deliberately simple so it's easy to tune. */

/* ── junk guard ───────────────────────────────────────────────────────────────
 * The AI-Overview full-page scrape mixes rendered page FURNITURE into answer_text:
 * social/share widgets, nav/footer links and cookie notices. Those capitalise like
 * names, so the raw candidate pool picks up "ShareThis", "Report", "Privacy Policy.
 * Share". Worse, adjacent inline share-button labels are scraped with the spaces
 * already lost and get swallowed as one franken-token ("FacebookGmailXRedditWhatsApp
 * Thank"). This predicate rejects both classes at the source so they never become a
 * stored competitor. Conservative: prefer dropping a borderline candidate to keeping
 * furniture — the downstream isRealCompetitor filter is a second line of defence. */
const FURNITURE_TERMS = new Set<string>([
  // social / share widgets
  "sharethis", "share", "share this", "facebook", "gmail", "reddit", "whatsapp",
  "twitter", "linkedin", "pinterest", "telegram", "messenger", "tumblr", "instagram",
  "youtube", "tiktok", "email", "print", "copy link", "copy",
  // nav / footer / action labels
  "privacy", "privacy policy", "terms", "terms of service", "terms and conditions",
  "terms of use", "contact", "contact us", "about", "about us", "report", "sign in",
  "sign up", "signin", "signup", "log in", "logout", "login", "register", "subscribe",
  "newsletter", "home", "menu", "search", "read more", "learn more", "more",
  "back to top", "copyright", "all rights reserved", "disclaimer", "sitemap",
  "feedback", "help", "support", "faq", "advertise", "careers", "jobs", "press",
  "follow us", "share on", "next", "previous", "close",
  // cookie / consent
  "cookie", "cookies", "cookie policy", "cookie settings", "accept", "accept all",
  "manage cookies", "we use cookies", "consent", "preferences", "settings",
]);
// Social-brand substrings that mark a token as a share-row fragment even when glued
// to other text (e.g. "ShareThis", "…WhatsAppThank").
const FURNITURE_SUBSTR = /sharethis|facebook|whatsapp|reddit|linkedin|pinterest/i;

/** Count lower→upper transitions inside a single (whitespace-free) token. Real brands
 *  rarely have 3+ internal camel humps; concatenated link labels have many. */
function camelHumps(token: string): number {
  let n = 0;
  for (let i = 1; i < token.length; i++) {
    if (/[a-zà-ÿ]/.test(token[i - 1]) && /[A-ZÀ-Þ]/.test(token[i])) n++;
  }
  return n;
}

/** True if a candidate name is page furniture or a concatenated link-label franken-word,
 *  not a real business/brand. Applied at the dedup chokepoint so BOTH the answer-text and
 *  organic-title paths are covered. */
function isJunkCandidate(name: string): boolean {
  const cleaned = name.replace(/[.\s]+$/, "").trim(); // drop trailing period/space ("Policy." )
  const key = norm(cleaned);
  if (!key) return true;
  if (FURNITURE_TERMS.has(key)) return true;              // whole candidate is furniture
  if (FURNITURE_TERMS.has(key.split(/\s+/)[0])) return true; // leads with furniture ("Privacy Policy. Share")
  if (FURNITURE_SUBSTR.test(cleaned)) return true;        // social share-row fragment
  // Concatenation franken-word: a spaceless token that's either very long or has many
  // camel humps is glued link labels, not one brand.
  if (!/\s/.test(cleaned) && (cleaned.length > 25 || camelHumps(cleaned) >= 3)) return true;
  return false;
}

/** Leading business-name segment of a SERP/result title. */
function organicTitleName(title: string): string {
  return asStr(title).split(TITLE_DELIMS)[0].trim();
}

/** Candidate names from the item's organicResults titles. */
function extractOrganicNames(item: Record<string, unknown>): string[] {
  const raw = item["organicResults"] ?? item["results"];
  const results = Array.isArray(raw) ? raw : [];
  return results
    .map((r) => organicTitleName(asStr((asRecord(r) ?? {}).title)))
    .filter((n) => n.length >= 3);
}

/** ROUGH proper-noun extraction from free text — sequences of 1–4 capitalised words.
 *  Noisy by nature (may catch place names / marketing phrases); refine as needed. */
function extractTextNames(text: string): string[] {
  const matches = asStr(text).match(/[A-Z][\wÀ-ÿ&'’.]+(?:\s+[A-Z][\wÀ-ÿ&'’.]+){0,3}/g) ?? [];
  const out: string[] = [];
  for (const m of matches) {
    // A period+space is a sentence/element boundary the "." in the char class wrongly bridges
    // (so a real firm gets fused to trailing furniture: "…Accountants. ShareThis"). Split on
    // it so the real name survives on its own and only the furniture half is rejected later.
    for (const part of m.split(/\.\s+/)) {
      const s = part.replace(/\.$/, "").trim();
      if (s.length >= 3) out.push(s);
    }
  }
  return out;
}

/** Dedup names case-insensitively (first-seen casing), dropping the audited business
 *  (and any candidate that is a sub/superstring of it, to strip self-mentions). */
function dedupExcludingSelf(names: string[], businessName: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const key = norm(n);
    if (!key || seen.has(key)) continue;
    if (isSelfName(n, businessName)) continue; // drop the audited business (name-variance aware)
    if (isJunkCandidate(n)) continue; // drop page furniture + concatenated link-label franken-words
    seen.add(key);
    out.push(n);
  }
  return out;
}

/** Competitors an engine mentions: organic-title names that appear in its answer_text,
 *  plus rough names pulled straight from the answer_text. Best-effort. */
function competitorsForEngine(answerText: string, organicNames: string[], businessName: string): string[] {
  const fromOrganic = organicNames.filter((n) => contains(answerText, n));
  const fromText = extractTextNames(answerText);
  return dedupExcludingSelf([...fromOrganic, ...fromText], businessName);
}

/* ── AI Overview furniture strip ─────────────────────────────────────────────
 * Google's full-page AI Overview scrape appends UI chrome AFTER the real answer —
 * the share row, feedback widget, "AI responses may include mistakes" disclaimer, and
 * voice-input controls — which pollutes named-detection and competitor extraction.
 * Truncate at the EARLIEST of a few SPECIFIC, unambiguous MULTI-WORD markers so the whole
 * trailing furniture block is removed in one cut. Deliberately NOT generic single words
 * (share/report/thank/close): only these exact phrases, so it can only ever cut the trailing
 * chrome, never real mid-answer content. No marker present → text returned unchanged. */
const AIO_FURNITURE_MARKERS = [
  "AI responses may include mistakes",
  "AI can make mistakes",
  "ShareThis public link",
  "Your feedback helps Google improve",
  "Report a problem",
];
function stripAiOverviewFurniture(text: string): string {
  const hay = text.toLowerCase();
  let cut = -1;
  for (const m of AIO_FURNITURE_MARKERS) {
    const i = hay.indexOf(m.toLowerCase());
    if (i >= 0 && (cut === -1 || i < cut)) cut = i;
  }
  return cut >= 0 ? text.slice(0, cut).trim() : text;
}

/** An AI engine block: {text, sources[]}. named = name in answer OR in a source title. */
function normalizeEngineBlock(
  block: Record<string, unknown>,
  organicNames: string[],
  businessName: string,
): AiEngineResult {
  // Clean once at the top so named-detection, competitorsForEngine, AND the stored answer_text
  // all get the furniture-stripped value.
  const answer_text = stripAiOverviewFurniture(asStr(firstKey(block, TEXT_KEYS)));
  const rawSources = firstKey(block, SOURCES_KEYS);
  const sources = Array.isArray(rawSources) ? rawSources : [];
  const citations = sources.map(citationOf).filter((c) => c.title || c.url).slice(0, MAX_CITATIONS);

  // named: business is named in the answer text, OR in a source title. Uses the core-aware
  // nameMatches (robust to &/and/n + AI shortening) instead of a brittle full-string contains.
  const srcIndex = sources.findIndex((s) => nameMatches(citationOf(s).title, businessName));
  const named = nameMatches(answer_text, businessName) || srcIndex >= 0;
  // position: 1-based source index where the business first appears (else null).
  const position = srcIndex >= 0 ? srcIndex + 1 : null;
  const competitors = competitorsForEngine(answer_text, organicNames, businessName);
  return { named, position, competitors, citations, answer_text };
}

/**
 * Normalise the actor's dataset (items[0] for a single-query run) into the per-engine
 * shape. Only engines the actor actually scraped are emitted — an engine that returned no
 * block (e.g. ai_overview, no longer scraped) is left ABSENT rather than backfilled with an
 * empty result, so it can't masquerade as a real "0 named" datapoint on the scorecard /
 * playbook prompt. A genuinely-scraped-but-not-named engine still carries answer_text /
 * citations and is kept.
 */
export function normalizeAiSearch(items: unknown[], businessName: string): AiSearchResult {
  const item = asRecord(Array.isArray(items) ? items[0] : items) ?? {};
  const organicNames = extractOrganicNames(item);
  const out: AiSearchResult = {};
  for (const engine of AI_ENGINES) {
    // google_organic DROPPED: raw SERP titles aren't a scored engine and aren't AI naming firms, so
    // it's no longer emitted → ABSENT downstream (not zero-scored). organicNames is still extracted
    // above and feeds competitor detection for chatgpt/gemini. Re-enable by restoring normalizeOrganic
    // and: out.google_organic = normalizeOrganic(item, organicNames, businessName).
    if (engine === "google_organic") continue;
    const block = asRecord(firstKey(item, ENGINE_BLOCK_KEYS[engine]));
    if (block) out[engine] = normalizeEngineBlock(block, organicNames, businessName);
  }
  return out;
}
