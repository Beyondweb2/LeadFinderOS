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
): Promise<{
  status: string;
  datasetId: string | null;
  runTimeSecs: number | null;
  /** Apify's own cost figure for this run, available on the SAME poll we already make. */
  usageTotalUsd: number | null;
  computeUnits: number | null;
}> {
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

/* ⛔ THE MATCHER LIVES IN src/lib/nameMatch.ts AND IS RE-EXPORTED HERE.
   Moved 2026-08-29 so the report renderer (which runs in the SPA as well as Deno) can derive
   "recommended in the prose" from stored answer_text. Every existing importer of this module keeps
   working unchanged — the names below are the same ones it exported before. ONE implementation:
   do not copy any of it back into this file. */
export {
  normalizeForMatch, businessCore, tokensContain, nameMatches, type NameMatchContext,
} from "../../../../src/lib/nameMatch.ts";
import { normalizeForMatch, tokensContain, nameMatches, type NameMatchContext } from "../../../../src/lib/nameMatch.ts";

/** True when a competitor CANDIDATE is really the audited business under name variance — it either
 *  names the business (core match) or is a fragment of the business's full name. Keeps the firm off
 *  its own competitor list (shares the same matcher as named-detection, per the recon caveat). */
function isSelfName(candidate: string, businessName: string): boolean {
  if (nameMatches(candidate, businessName)) return true;
  const cand = normalizeForMatch(candidate).split(/\s+/).filter(Boolean);
  const full = normalizeForMatch(businessName).split(/\s+/).filter(Boolean);
  return cand.length > 0 && tokensContain(full, cand);
}

/* ══ GOOGLE ORGANIC CAPTURE — STORED DATA, NOT AN ENGINE (2026-09-15) ═══════════════════════════
 * Restores the organic results the actor has been returning and we have been discarding since
 * 2026-07-21 (commit f2214648, which deleted normalizeOrganic).
 *
 * ⛔ ZERO ADDITIONAL THIRD-PARTY COST, AND THAT IS WHY IT IS SAFE TO TURN BACK ON.
 * `buildAiSearchInput` is untouched, so the actor input is byte-identical: same single query, same
 * maxPagesPerQuery: 1, same two AI toggles. Google organic is this actor's BASE output — the file
 * header above records that there is no input flag to disable it, because organic IS the search and
 * the AI engines ride on top of it. So the SERP is scraped on every question today whether we keep
 * it or not. Runs, Apify API requests and compute units are all unchanged; the dataset is already
 * fetched in full by fetchAiSearchItems and this reads it from memory. The only cost is jsonb bytes
 * in ai_audit_queue.result (~1KB a row).
 *
 * ⛔ IT IS NOT RE-EMITTED AS `google_organic`, AND THAT IS THE WHOLE DESIGN. `google_organic` is a
 * member of DISPLAY_ENGINES, so restoring the old key would silently change four things nobody
 * asked for: a "Google" row would appear on the CLIENT REPORT's per-engine table
 * (auditReport.ts perEngine), `namedOn` would start saying a business is "named on Google",
 * page-generator's `namedAnywhere` would count a SERP appearance as being named and change which
 * pages are held, and market-view's niche fold would gain a fifth engine. An organic listing is not
 * an AI engine naming a firm — that is exactly why it was dropped — so it is stored as DATA under a
 * LEADING-UNDERSCORE META KEY, the convention `_apify` and `_cost_usd` already use at the write
 * site precisely "so nothing that walks the engine keys trips on it".
 *
 * ⛔ NOTHING IS MATCHED AT CAPTURE TIME, DELIBERATELY. The deleted normalizeOrganic decided `named`
 * with a strict `contains()` substring while the AI engines are scored with `nameMatches`, so the
 * two sides were never measured on equal terms. Storing the ordered results and matching at
 * ANALYSIS time means the matcher can improve without re-collecting anything, and no weak
 * comparison gets baked into the record.
 *
 * ⚠️ ABSENT AND EMPTY ARE DIFFERENT, and both are true answers: no organic block at all returns
 * null (we did not get the data), while a block holding zero results stores count 0 (Google
 * returned nothing for that query). Do not collapse them. */

/** Top-N organic results kept per question. 10 = Google's first page, which is what a top-3 /
 *  top-10 / outside-top-10 analysis needs; more would be bytes nothing reads. */
const MAX_SERP_RESULTS = 10;

export interface GoogleSerpResult {
  /** The actor's own `position` when it gives one (a real Google rank), else the 1-based index. */
  position: number;
  url: string;
  title: string;
}
export interface GoogleSerpCapture {
  /** First page, in the actor's order, capped at MAX_SERP_RESULTS. */
  results: GoogleSerpResult[];
  /** How many organic results the actor returned BEFORE the cap — so "we kept 10 of 87" is legible
   *  and a truncated capture can never be read as a short SERP. */
  count: number;
}

/**
 * Pull the organic results out of one actor dataset item. Pure; never throws.
 * Returns null when the item carries no organic block at all.
 */
export function captureGoogleSerp(items: unknown[]): GoogleSerpCapture | null {
  const item = asRecord(Array.isArray(items) ? items[0] : items) ?? {};
  /* The same two source keys the deleted normalizeOrganic read — kept verbatim rather than guessed,
     because they are the proven accessor for this actor's output shape. */
  const raw = item["organicResults"] ?? item["results"];
  if (!Array.isArray(raw)) return null;
  const results: GoogleSerpResult[] = [];
  for (let i = 0; i < raw.length && results.length < MAX_SERP_RESULTS; i++) {
    const r = asRecord(raw[i]) ?? {};
    const { title, url } = citationOf(r);
    if (!title && !url) continue;
    const p = r["position"];
    results.push({ position: typeof p === "number" ? p : i + 1, url, title });
  }
  return { results, count: raw.length };
}

function citationOf(src: unknown): AiCitation {
  const r = asRecord(src) ?? {};
  return { title: asStr(firstKey(r, ["title", "name"])), url: asStr(firstKey(r, ["url", "link"])) };
}

/* ══ COMPETITORS ARE NO LONGER EXTRACTED HERE. THE REGEX SCRAPER IS DELETED. ═════════════════
 * 2026-08-28, Paul's call, and it is a deletion rather than a filter on purpose.
 *
 * WHAT USED TO BE HERE: a "best-effort" scraper that took every sequence of 1–4 capitalised
 * words out of answer_text (plus organicResults titles), dropped page furniture, and STORED the
 * result as this engine's `competitors`. Its output was the DEFAULT state of the field, and
 * extract-competitors (the LLM) only ever overwrote it afterwards. So any answer the cleaner did
 * not reach kept scraper output, and that output was indistinguishable from real firms to every
 * consumer downstream.
 *
 * WHAT IT COST: Solene's 47-question measurement, 2026-08-27. 381 stored strings that were not
 * businesses — "Testosterone" 33x and "Hormone Replacement Therapy" 43x led the client report's
 * "who AI named instead", alongside 48 scraped tracking ids ("AAAAABqkCA", "Xdaj6AH7genL7KP9o").
 * The scraper cannot be fixed by a better word list, because deciding whether a capitalised
 * phrase is a hireable FIRM is a judgement about meaning: the display filters carry
 * accountancy/trades/hospitality vocabulary, so medical nouns walked straight through, and a
 * medical list would only have moved the hole to the next trade.
 *
 * ⛔ SO THE FIELD NOW STARTS EMPTY AND extract-competitors IS ITS ONLY WRITER. The failure mode
 * changes from "junk that reads as real firms" to "no names yet", which is honest, visible, and
 * what the operator asked for. src/lib/competitorCleaning.ts + the cleaning stamp say WHICH of
 * those two an empty list is, so blank can never be mistaken for "AI named nobody".
 *
 * ⚠️ answer_text is untouched and is the cleaner's whole input, so the extraction stays
 * re-runnable over stored answers with no Apify spend — that is how Solene was repaired.
 * ⚠️ The self-mention exclusion moved with it: extract-competitors is told the audited business
 * and drops it. `named` is unaffected either way — nameMatches reads answer_text, never this list.
 * ══════════════════════════════════════════════════════════════════════════════════════════════ */

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
  businessName: string,
  /* Optional, and absent means the strict match only — see the block above nameMatches. */
  ctx?: NameMatchContext,
): AiEngineResult {
  // Clean once at the top so named-detection AND the stored answer_text both get the
  // furniture-stripped value. (It was also the scraper's input until that was deleted above.)
  const answer_text = stripAiOverviewFurniture(asStr(firstKey(block, TEXT_KEYS)));
  const rawSources = firstKey(block, SOURCES_KEYS);
  const sources = Array.isArray(rawSources) ? rawSources : [];
  const citations = sources.map(citationOf).filter((c) => c.title || c.url).slice(0, MAX_CITATIONS);

  // named: business is named in the answer text, OR in a source title. Uses the core-aware
  // nameMatches (robust to &/and/n + AI shortening) instead of a brittle full-string contains.
  const srcIndex = sources.findIndex((s) => nameMatches(citationOf(s).title, businessName));
  const named = nameMatches(answer_text, businessName, ctx) || srcIndex >= 0;
  // position: 1-based source index where the business first appears (else null).
  const position = srcIndex >= 0 ? srcIndex + 1 : null;
  /* ⛔ ALWAYS EMPTY AT SCAN TIME — see the block above. extract-competitors fills this in from
     answer_text at run finalisation; until it does, "no names yet" is the truthful state. */
  const competitors: string[] = [];
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
export function normalizeAiSearch(items: unknown[], businessName: string, ctx?: NameMatchContext): AiSearchResult {
  const item = asRecord(Array.isArray(items) ? items[0] : items) ?? {};
  const out: AiSearchResult = {};
  for (const engine of AI_ENGINES) {
    /* google_organic DROPPED: raw SERP titles aren't a scored engine and aren't AI naming firms, so
       it's no longer emitted → ABSENT downstream (not zero-scored). Re-enable by restoring
       normalizeOrganic and: out.google_organic = normalizeOrganic(item, organicNames, businessName).
       ⚠️ That would need `organicNames` back too — it was extracted here to feed the regex
       competitor scraper, which is deleted (see the block above), so nothing reads it now. */
    if (engine === "google_organic") continue;
    const block = asRecord(firstKey(item, ENGINE_BLOCK_KEYS[engine]));
    if (block) out[engine] = normalizeEngineBlock(block, businessName, ctx);
  }
  return out;
}
