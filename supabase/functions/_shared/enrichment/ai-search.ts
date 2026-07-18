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
import { runApifyActor } from "./apify.ts";

/** apify/google-search-scraper — actor id uses `~` in the API path. */
export const AI_SEARCH_ACTOR = "apify~google-search-scraper";

/** Engines we normalise. Active set = ChatGPT + Gemini + AI Overview + Google organic.
 *  The queue targets [chatgpt,gemini]; AI Overview + organic come free in the same run.
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

export type AiSearchResult = Record<AiEngineKey, AiEngineResult>;

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
    // AI-engine add-ons (nested-object form the actor expects) + Google organic (always)
    // + AI Overview. Engine set = ChatGPT + Gemini + AI Overview. Copilot / AI Mode off.
    // light mode - AI Overview isn't scored (only chatgpt+gemini), and full-page scrape was
    // blowing the 115s timeout. Light still returns the overview text+sources we consume.
    aiOverview: { scrapeFullAiOverview: false },
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
function emptyEngine(): AiEngineResult {
  return { named: false, position: null, competitors: [], citations: [], answer_text: "" };
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
  const self = norm(businessName);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const key = norm(n);
    if (!key || seen.has(key)) continue;
    if (self && (key === self || key.includes(self) || self.includes(key))) continue;
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

  // named: in the answer text, OR a source title that is the business.
  const srcIndex = sources.findIndex((s) => contains(citationOf(s).title, businessName));
  const named = contains(answer_text, businessName) || srcIndex >= 0;
  // position: 1-based source index where the business first appears (else null).
  const position = srcIndex >= 0 ? srcIndex + 1 : null;
  const competitors = competitorsForEngine(answer_text, organicNames, businessName);
  return { named, position, competitors, citations, answer_text };
}

/** Google organic: an array of {title,url,position}. No answer, so competitors are the
 *  other organic-title names; named = the business appears in a result; position = rank. */
function normalizeOrganic(
  item: Record<string, unknown>,
  organicNames: string[],
  businessName: string,
): AiEngineResult {
  const raw = item["organicResults"] ?? item["results"];
  const results = Array.isArray(raw) ? raw : [];
  const citations: AiCitation[] = results.map(citationOf).filter((c) => c.title || c.url).slice(0, MAX_CITATIONS);
  let position: number | null = null;
  let named = false;
  for (let i = 0; i < results.length; i++) {
    const r = asRecord(results[i]) ?? {};
    if (contains(asStr(r.title), businessName) || contains(asStr(firstKey(r, ["url", "link", "displayedUrl"])), businessName)) {
      named = true;
      const p = r["position"];
      position = typeof p === "number" ? p : i + 1;
      break;
    }
  }
  return { named, position, competitors: dedupExcludingSelf(organicNames, businessName), citations, answer_text: "" };
}

/**
 * Normalise the actor's dataset (items[0] for a single-query run) into the per-engine
 * shape. Missing engines come back as empty results (named:false) rather than absent,
 * so downstream scoring can count total datapoints consistently.
 */
export function normalizeAiSearch(items: unknown[], businessName: string): AiSearchResult {
  const item = asRecord(Array.isArray(items) ? items[0] : items) ?? {};
  const organicNames = extractOrganicNames(item);
  const out = {} as AiSearchResult;
  for (const engine of AI_ENGINES) {
    if (engine === "google_organic") {
      out.google_organic = normalizeOrganic(item, organicNames, businessName);
      continue;
    }
    const block = asRecord(firstKey(item, ENGINE_BLOCK_KEYS[engine]));
    out[engine] = block ? normalizeEngineBlock(block, organicNames, businessName) : emptyEngine();
  }
  return out;
}
