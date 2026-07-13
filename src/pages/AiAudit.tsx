import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, Plus, X, ArrowLeft, Sparkles, RefreshCw, ExternalLink, Search, Check, FileText,
  Building2, Users, TrendingUp, EyeOff, Globe, MapPin,
} from 'lucide-react';
import type { Country } from '@/types/outreach';
import { AiAuditReport } from '@/components/AiAuditReport';
import { downloadReportHtml, type AiAuditReportData, type AiAuditSeo } from '@/lib/aiAuditReportHtml';
import { usePersistedState } from '@/hooks/usePersistedState';

// AI Visibility Audit — a stacked/conversational wizard: answered steps stay visible
// and answering one reveals the next below it (no per-step Next). Generates search
// questions, runs them across AI engines via create-ai-audit + the process-ai-audit-queue
// drain, and polls the run for results.

type Step = 'source' | 'name' | 'type' | 'location' | 'website' | 'review' | 'results';
// The stacked wizard steps, in order. `revealed` is the furthest index shown; every
// step 0..revealed is rendered at once. 'results' is a separate phase (step === 'results').
const WIZARD_STEPS = ['source', 'name', 'type', 'location', 'website', 'specialisms', 'review'] as const;
const REVIEW_INDEX = WIZARD_STEPS.indexOf('review');

// Question-count selector: how many search questions to generate. Range mirrors the
// create-ai-audit clamp (6..12, default 8).
const MIN_QUESTION_COUNT = 6;
const MAX_QUESTION_COUNT = 12;
const DEFAULT_QUESTION_COUNT = 8;
const QUESTION_COUNT_OPTIONS = Array.from(
  { length: MAX_QUESTION_COUNT - MIN_QUESTION_COUNT + 1 },
  (_, i) => MIN_QUESTION_COUNT + i,
);
const clampQuestionCount = (n: number) =>
  Math.min(MAX_QUESTION_COUNT, Math.max(MIN_QUESTION_COUNT, Math.round(n) || DEFAULT_QUESTION_COUNT));

// value = the Country name stored/passed to the audit; the edge toCountryCode /
// COUNTRY_TO_ISO2 map converts every name to lowercase ISO-2 uniformly. label = display.
const COUNTRIES: { value: string; label: string }[] = [
  { value: 'UK', label: 'UK' },
  { value: 'Ireland', label: 'Ireland' },
  { value: 'USA', label: 'USA' },
  { value: 'Canada', label: 'Canada' },
  { value: 'Australia', label: 'Australia' },
  { value: 'NewZealand', label: 'New Zealand' },
  { value: 'Thailand', label: 'Thailand' },
];

// Engines shown in results (queue targets chatgpt+gemini; the actor also returns
// AI Overview + Google organic, shown for context). mention_rate is over chatgpt+gemini.
const DISPLAY_ENGINES = ['chatgpt', 'gemini', 'ai_overview', 'google_organic'] as const;
const SCORED_ENGINES = ['chatgpt', 'gemini'] as const;
const ENGINE_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT', gemini: 'Gemini', ai_overview: 'AI Overview', google_organic: 'Google',
};

interface EngineResult {
  named: boolean;
  position: number | null;
  competitors: string[];
  citations: { title: string; url: string }[];
  answer_text: string;
}
type EngineMap = Record<string, EngineResult>;
interface QueueRow { id: string; question: string; status: string; result: EngineMap | null; }
interface RunRow { id: string; audit_id: string; run_number: number; status: string; mention_rate: number | null; results: unknown }
interface AuditRow { id: string; business_name: string; business_type: string | null; location_text: string | null; country: string | null; has_website: boolean; created_at: string }
interface LeadOption { id: string; business_name: string; category: string | null; country: string | null; website: string | null; address: string | null }

const TERMINAL = new Set(['complete', 'capped', 'failed']);

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

/** Keep only things that look like a real business name — drop stopwords, the audit's
 *  location, and short fragments. Bias to precision (better fewer real than lots of noise). */
function isRealCompetitor(name: string, locationText: string): boolean {
  const n = name.trim();
  if (n.length < 3 || n.length > 60) return false;
  if (n.includes('@')) return false;                     // social handle, not a venue ("… (@kava_thailand)")
  const nl = n.toLowerCase();
  if (UI_PHRASES.some((p) => nl === p || nl.includes(p))) return false;          // "gemini apps activity" etc.
  const words = nl.split(/\s+/).map((w) => w.replace(/[^a-z0-9.&'-]/g, '')).filter(Boolean);
  if (!words.length) return false;
  const generic = (w: string) => COMPETITOR_STOPWORDS.has(w) || PLATFORM_UI.has(w) || GENERIC_TERMS.has(w) || PRONOUNS.has(w);
  // Every word is generic (stopword / cuisine / descriptor / venue-type / area) → not a real
  // name: "Thai Food", "Cocktail Lounge", "Night Bazaar", "Gemini Apps Activity".
  if (words.every(generic)) return false;
  // Ends in a PLURAL category word → a category/list, not a single venue ("Kava Bars").
  if (PLURAL_CATEGORIES.has(words[words.length - 1])) return false;
  const locTokens = locationText.toLowerCase().split(/[^a-z]+/).filter((tk) => tk.length > 2);
  if (locTokens.length && locTokens.every((tk) => nl.includes(tk)) && words.length <= locTokens.length + 1) return false; // basically the location
  if (!/[A-Z0-9]/.test(n)) return false;                 // no capital/digit anywhere → a fragment, not a name
  if (words.length === 1) {
    // Single word: keep ONLY if it's a clear brand token (has . & digit or apostrophe, e.g.
    // "Bar.San", "O'Malley's"). Plain single words — cuisines, neighbourhoods, cities — are
    // dropped ("Thai", "Nimman", "Cocktail", "Leeds").
    const w = words[0];
    if (generic(w) || w.length < 4) return false;
    if (!/[.&0-9']/.test(n)) return false;
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
function isRenderableSeo(s: unknown): s is AiAuditSeo {
  if (!s || typeof s !== 'object') return false;
  const c = (s as { categories?: unknown }).categories as Record<string, unknown> | undefined;
  return !!c && typeof c === 'object' && !!c.onPage && !!c.localPresence && !!c.contentTechnical;
}

/** Derive the client report's data from a run's queue rows. Pure — used both for the live
 *  report on the results screen and to build a snapshot when opening a past audit's report.
 *  Returns null until at least one question has completed. */
function buildReportData(
  queueRows: QueueRow[],
  run: RunRow | null,
  ctx: { businessName: string; businessType: string; locationText: string; specialisms: string },
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

  return {
    businessName: ctx.businessName || 'This business',
    businessType: ctx.businessType || '',
    named,
    total,
    pct: total > 0 ? Math.round((named / total) * 100) : 0,
    perEngine,
    competitors,
    gutPunch: pickGutPunch(queueRows, ctx.locationText, ctx.specialisms, ctx.businessType),
    generatedAtLabel: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    // Only carry a GRADED seo; drop failure/cap markers so the report never crashes on them.
    seo: (() => { const s = (run?.results as { seo?: unknown } | null)?.seo; return isRenderableSeo(s) ? s : undefined; })(),
  };
}

// Wizard state is persisted to sessionStorage so it survives leaving the page and
// coming back (unmount/remount) and a tab refresh, but clears when the tab closes.
// Only the WIZARD fields are persisted — never results/polling state. `revealed` is
// stored so a return shows ALL previously-answered steps stacked, not just a jump.
const WIZARD_KEY = 'leadfinder:ai-audit-wizard';
interface PersistedWizard {
  revealed: number;
  mode: 'new' | 'existing' | null;
  leadId: string | null;
  businessName: string;
  businessType: string;
  locationText: string;
  country: Country | '';
  hasWebsite: boolean | null;
  website: string;
  specialisms: string;
  questionCount: number;
  questions: string[];
  unitCost: number;
  engineCount: number;
}
/** Read persisted wizard state (best-effort; null if absent/unavailable/invalid). */
function loadWizard(): PersistedWizard | null {
  try {
    const raw = sessionStorage.getItem(WIZARD_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<PersistedWizard>;
    return p && typeof p === 'object' ? (p as PersistedWizard) : null;
  } catch {
    return null;
  }
}
function clearWizard() {
  try { sessionStorage.removeItem(WIZARD_KEY); } catch { /* storage unavailable */ }
}
/** Furthest revealed index from persisted state (back-compat: old sessions stored a
 *  `step` name instead of `revealed`). Clamped to the wizard range. */
function initialRevealed(p: PersistedWizard | null): number {
  if (!p) return 0;
  const legacyStep = (p as unknown as { step?: string }).step;
  const raw = typeof p.revealed === 'number' ? p.revealed
    : legacyStep ? WIZARD_STEPS.indexOf(legacyStep as typeof WIZARD_STEPS[number]) : 0;
  return Math.min(Math.max(raw, 0), WIZARD_STEPS.length - 1);
}

const AiAudit = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  // Rehydrate the wizard once from sessionStorage. Nothing is pre-filled on a fresh
  // start. `step` is only the wizard/results discriminator; results is never persisted.
  const [persisted] = useState<PersistedWizard | null>(() => loadWizard());
  const [step, setStep] = useState<Step>('source');
  const [revealed, setRevealed] = useState<number>(() => initialRevealed(persisted));

  // Wizard form state — no defaults on a fresh start (mode/country unselected, website unknown).
  const [mode, setMode] = useState<'new' | 'existing' | null>(persisted?.mode ?? null);
  const [leadId, setLeadId] = useState<string | null>(persisted?.leadId ?? null);
  const [businessName, setBusinessName] = useState(persisted?.businessName ?? '');
  const [businessType, setBusinessType] = useState(persisted?.businessType ?? '');
  const [locationText, setLocationText] = useState(persisted?.locationText ?? '');
  const [country, setCountry] = useState<Country | ''>(persisted?.country ?? '');
  const [hasWebsite, setHasWebsite] = useState<boolean | null>(persisted?.hasWebsite ?? null);
  const [website, setWebsite] = useState(persisted?.website ?? '');
  const [specialisms, setSpecialisms] = useState(persisted?.specialisms ?? ''); // optional — grounds question generation
  const [questionCount, setQuestionCount] = useState<number>(() =>
    clampQuestionCount(persisted?.questionCount ?? DEFAULT_QUESTION_COUNT));

  // Existing-lead picker + saved audits
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [savedAudits, setSavedAudits] = useState<(AuditRow & { latest_mention_rate: number | null; latest_run_id: string | null })[]>([]);

  // Review (questions) state
  const [previewing, setPreviewing] = useState(false);
  const [questions, setQuestions] = useState<string[]>(persisted?.questions ?? []);
  const [unitCost, setUnitCost] = useState(persisted?.unitCost ?? 0);
  const [engineCount, setEngineCount] = useState(persisted?.engineCount ?? SCORED_ENGINES.length);
  const [running, setRunning] = useState(false);

  // Results state
  const [auditId, setAuditId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<RunRow | null>(null);
  const [queueRows, setQueueRows] = useState<QueueRow[]>([]);
  const [resultsBusinessName, setResultsBusinessName] = useState('');
  // Whether the run's audit has a website — gates the "Add SEO data" paste feature.
  const [resultsHasWebsite, setResultsHasWebsite] = useState(false);
  // "Add/Update SEO data" paste panel state.
  const [seoPasteOpen, setSeoPasteOpen] = useState(false);
  const [seoPasteText, setSeoPasteText] = useState('');
  const [seoApplying, setSeoApplying] = useState(false);
  // Which run's report is currently open (null = not viewing a report). Replaces the old
  // boolean so we can open a SPECIFIC run's persisted report snapshot.
  const [reportRunId, setReportRunId] = useState<string | null>(null);
  // Generated report snapshots, keyed by run id. Persisted (per-user, survives navigation
  // AND tab close) so a report that's been generated is shown as-is on return — it is only
  // rebuilt by the explicit Regenerate action, never silently re-derived.
  const [reports, setReports] = usePersistedState<Record<string, AiAuditReportData>>(
    'ai-audit-reports', {}, { tier: 'local', scope: user?.id ?? null, version: 1 },
  );

  // Refs to move focus to a newly-revealed step (accessibility).
  const nameRef = useRef<HTMLInputElement>(null);
  const typeRef = useRef<HTMLInputElement>(null);
  const townRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const specialismsRef = useRef<HTMLInputElement>(null);

  const estimatedCost = Number((questions.length * engineCount * unitCost).toFixed(2));

  // Reveal the next step (monotonic — earlier answers stay revealed/editable).
  const reveal = (i: number) => setRevealed((r) => Math.max(r, i));

  // Persist wizard state on change so it survives unmount/remount + refresh. Once the
  // audit is running (step 'results'), drop the key so the next visit starts clean.
  useEffect(() => {
    if (step === 'results') { clearWizard(); return; }
    try {
      sessionStorage.setItem(WIZARD_KEY, JSON.stringify({
        revealed, mode, leadId, businessName, businessType, locationText, country, hasWebsite, website, specialisms, questionCount, questions, unitCost, engineCount,
      }));
    } catch { /* storage unavailable — persistence is best-effort */ }
  }, [step, revealed, mode, leadId, businessName, businessType, locationText, country, hasWebsite, website, specialisms, questionCount, questions, unitCost, engineCount]);

  // ── Initial load: the user's leads (for the picker) + saved audits ──────────
  const loadSaved = useCallback(async () => {
    if (!user) return;
    const { data: audits } = await supabase
      .from('ai_audits')
      .select('id, business_name, business_type, location_text, country, has_website, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    const auditRows = (audits ?? []) as AuditRow[];
    // Latest run mention_rate per audit (one query, newest first, reduce client-side).
    const ids = auditRows.map((a) => a.id);
    const latestByAudit: Record<string, { rate: number | null; runId: string }> = {};
    if (ids.length) {
      const { data: runs } = await supabase
        .from('ai_audit_runs')
        .select('id, audit_id, mention_rate, run_number')
        .in('audit_id', ids)
        .order('run_number', { ascending: false });
      for (const r of (runs ?? []) as { id: string; audit_id: string; mention_rate: number | null }[]) {
        // newest first → first seen per audit is the latest run
        if (!(r.audit_id in latestByAudit)) latestByAudit[r.audit_id] = { rate: r.mention_rate, runId: r.id };
      }
    }
    setSavedAudits(auditRows.map((a) => ({
      ...a,
      latest_mention_rate: latestByAudit[a.id]?.rate ?? null,
      latest_run_id: latestByAudit[a.id]?.runId ?? null,
    })));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('outreach_leads')
        .select('id, business_name, category, country, website, address')
        .eq('is_archived', false)
        .order('created_at', { ascending: false })
        .limit(500);
      setLeads((data ?? []) as LeadOption[]);
    })();
    loadSaved();
  }, [user, loadSaved]);

  // One-shot fetch of a run's queue rows (used when opening a report for a past audit that
  // has no cached snapshot yet — we need the raw rows to build the report data once).
  const loadRunRows = useCallback(async (rid: string): Promise<QueueRow[]> => {
    const { data: q } = await supabase
      .from('ai_audit_queue')
      .select('id, question, status, result')
      .eq('run_id', rid)
      .order('created_at', { ascending: true });
    return (q ?? []) as QueueRow[];
  }, []);

  // ── Poll the active run while it drains ─────────────────────────────────────
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRun = useCallback(async (rid: string) => {
    const { data: runRow } = await supabase
      .from('ai_audit_runs')
      .select('id, audit_id, run_number, status, mention_rate, results')
      .eq('id', rid)
      .maybeSingle();
    const { data: q } = await supabase
      .from('ai_audit_queue')
      .select('id, question, status, result')
      .eq('run_id', rid)
      .order('created_at', { ascending: true });
    if (runRow) setRun(runRow as RunRow);
    setQueueRows((q ?? []) as QueueRow[]);
    return runRow as RunRow | null;
  }, []);

  useEffect(() => {
    if (step !== 'results' || !runId) return;
    let stop = false;
    const tick = async () => {
      const r = await pollRun(runId);
      if (!stop && r && TERMINAL.has(r.status)) {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        loadSaved(); // refresh the saved-audits rates
      }
    };
    tick();
    pollRef.current = setInterval(tick, 3000);
    return () => { stop = true; if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [step, runId, pollRun, loadSaved]);

  const resetWizard = () => {
    setMode(null); setLeadId(null); setBusinessName(''); setBusinessType('');
    setLocationText(''); setCountry(''); setHasWebsite(null); setWebsite(''); setSpecialisms('');
    setQuestions([]); setUnitCost(0); setEngineCount(SCORED_ENGINES.length);
    setAuditId(null); setRunId(null); setRun(null); setQueueRows([]);
    setRevealed(0); setStep('source');
  };

  const pickLead = (id: string) => {
    const lead = leads.find((l) => l.id === id);
    setLeadId(id);
    if (lead) {
      setBusinessName(lead.business_name ?? '');
      setBusinessType(lead.category ?? '');
      setLocationText(lead.address ?? '');
      if (lead.country) setCountry(lead.country as Country);
      setHasWebsite(!!lead.website);
      setWebsite(lead.website ?? '');
    }
    reveal(WIZARD_STEPS.indexOf('name'));
  };

  // ── Preview questions (generate for the review step) ─────────────────────────
  const runPreview = useCallback(async () => {
    setPreviewing(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-ai-audit', {
        body: {
          preview: true,
          business_name: businessName, business_type: businessType,
          location_text: locationText, country, has_website: hasWebsite,
          website: website || undefined, specialisms: specialisms || undefined,
          question_count: questionCount,
        },
      });
      if (error || !data?.ok) throw new Error(error?.message ?? data?.error ?? 'preview failed');
      setQuestions(Array.isArray(data.questions) ? data.questions : []);
      setUnitCost(typeof data.unit_cost_usd === 'number' ? data.unit_cost_usd : 0);
      setEngineCount(Array.isArray(data.engines) ? data.engines.length : SCORED_ENGINES.length);
    } catch (e) {
      toast({ title: "Couldn't generate questions", description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setPreviewing(false);
    }
  }, [businessName, businessType, locationText, country, hasWebsite, website, specialisms, questionCount, toast]);

  // When the review step is first revealed with no questions yet, generate them.
  // Editing type/location later does NOT auto-wipe/regenerate (only reveal-fresh or the
  // explicit Regenerate button do).
  useEffect(() => {
    if (WIZARD_STEPS[revealed] === 'review' && questions.length === 0 && !previewing) runPreview();
    // Fire only on reveal changes — not on every keystroke/question edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed]);

  // ── Confirm & run ───────────────────────────────────────────────────────────
  const confirmAndRun = async () => {
    const clean = questions.map((q) => q.trim()).filter(Boolean);
    if (clean.length === 0) { toast({ title: 'Add at least one question', variant: 'destructive' }); return; }
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-ai-audit', {
        body: {
          business_name: businessName, business_type: businessType,
          location_text: locationText, country, has_website: hasWebsite,
          website: website || undefined, lead_id: leadId || undefined,
          specialisms: specialisms || undefined,
          question_count: questionCount,
          questions: clean,
        },
      });
      if (error || !data?.ok) throw new Error(error?.message ?? data?.error ?? 'run failed');
      clearWizard(); // audit created successfully → next visit starts clean
      setAuditId(data.audit_id);
      setRunId(data.run_id);
      setResultsBusinessName(data.business_name ?? businessName);
      setResultsHasWebsite(hasWebsite === true);
      setRun(null); setQueueRows([]);
      setSeoPasteOpen(false); setSeoPasteText('');
      setStep('results');
    } catch (e) {
      toast({ title: "Couldn't start the audit", description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  };

  // ── Re-run (new run on the same audit, same questions) ──────────────────────
  const reRun = async () => {
    if (!auditId) return;
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-ai-audit', { body: { audit_id: auditId } });
      if (error || !data?.ok) throw new Error(error?.message ?? data?.error ?? 're-run failed');
      setRunId(data.run_id);
      setRun(null); setQueueRows([]);
    } catch (e) {
      toast({ title: "Couldn't re-run", description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  };

  const reopenAudit = async (audit: AuditRow) => {
    const { data: latest } = await supabase
      .from('ai_audit_runs')
      .select('id, audit_id, run_number, status, mention_rate, results')
      .eq('audit_id', audit.id)
      .order('run_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!latest) { toast({ title: 'No runs yet for this audit', variant: 'destructive' }); return null; }
    setAuditId(audit.id);
    setResultsBusinessName(audit.business_name);
    setResultsHasWebsite(audit.has_website === true);
    setBusinessType(audit.business_type ?? ''); // so the report's "what this means" line is populated for reopened audits
    setLocationText(audit.location_text ?? ''); // so the competitor filter can drop the location for reopened audits
    setRun(latest as RunRow);
    setRunId((latest as RunRow).id);
    setSeoPasteOpen(false); setSeoPasteText('');
    setStep('results');
    return latest as RunRow;
  };

  // Open a past audit's report DIRECTLY from its row. Prefers the stored snapshot (shown
  // as-is, never silently regenerated); only builds one if this run has never had a report
  // generated. Loads the run into results state too, so Regenerate has live data to work from.
  const viewReport = async (audit: AuditRow & { latest_run_id: string | null }) => {
    const latest = await reopenAudit(audit);
    if (!latest) return;
    const rid = latest.id;
    if (reports[rid]) { setReportRunId(rid); return; }   // stored snapshot → show it
    const rows = await loadRunRows(rid);
    setQueueRows(rows);
    const data = buildReportData(rows, latest, {
      businessName: audit.business_name,
      businessType: audit.business_type ?? '',
      locationText: audit.location_text ?? '',
      specialisms: '',
    });
    if (!data) { toast({ title: 'No completed results to report yet', variant: 'destructive' }); return; }
    setReports((prev) => ({ ...prev, [rid]: data }));
    setReportRunId(rid);
  };

  // ── Derived results tallies ─────────────────────────────────────────────────
  const doneCount = queueRows.filter((r) => r.status === 'done' || r.status === 'failed').length;
  const liveTally = queueRows.reduce(
    (acc, r) => {
      if (r.status === 'done' && r.result) {
        acc.done++;
        for (const e of SCORED_ENGINES) { acc.total++; if (r.result[e]?.named) acc.named++; }
      } else if (r.status === 'failed') {
        acc.failed++;
      }
      return acc;
    },
    { named: 0, total: 0, failed: 0, done: 0 },
  );
  const isDraining = !!runId && !(run && TERMINAL.has(run.status));

  // Scorecard: per-engine hit-rate across the completed questions + the competitors AI
  // named most often (from the per-engine "instead" lists). Cheap; recomputed from the
  // live queue rows so it fills in as the run drains.
  const perEngineScore = DISPLAY_ENGINES.map((engine) => {
    let named = 0;
    let total = 0;
    for (const r of queueRows) {
      if (r.status === 'done' && r.result?.[engine]) { total++; if (r.result[engine]!.named) named++; }
    }
    return { engine, named, total };
  });
  const topCompetitors = (() => {
    const counts = new Map<string, { name: string; count: number }>();
    for (const r of queueRows) {
      if (r.status !== 'done' || !r.result) continue;
      for (const engine of DISPLAY_ENGINES) {
        const er = r.result[engine];
        if (!er) continue;
        for (const c of er.competitors) {
          if (!isRealCompetitor(c, locationText)) continue; // drop stopwords / location / fragments
          const key = c.trim().toLowerCase();
          if (!key) continue;
          const cur = counts.get(key);
          if (cur) cur.count++; else counts.set(key, { name: c.trim(), count: 1 });
        }
      }
    }
    // Cap at the top 4 real names — better fewer real ones than lots of noise.
    return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 4).map((x) => x.name);
  })();

  // Live report data derived from the current run's rows (results.seo passed straight
  // through). Recomputed each render; snapshotted into `reports` only on generate/regenerate.
  const liveReportData = buildReportData(queueRows, run, {
    businessName: resultsBusinessName || businessName,
    businessType,
    locationText,
    specialisms,
  });

  // Landing metrics — derived ONLY from data we already have (no invented numbers).
  // Average visibility is over audits that have a scored run; invisible = 0% named.
  const metrics = (() => {
    const total = savedAudits.length;
    const rated = savedAudits.filter((a) => a.latest_mention_rate !== null);
    const avgPct = rated.length
      ? Math.round((rated.reduce((s, a) => s + (a.latest_mention_rate as number), 0) / rated.length) * 100)
      : null;
    const invisible = savedAudits.filter((a) => a.latest_mention_rate === 0).length;
    const withSite = savedAudits.filter((a) => a.has_website).length;
    return { total, avgPct, invisible, withSite, presence: total - withSite };
  })();

  const shown = (name: typeof WIZARD_STEPS[number]) => revealed >= WIZARD_STEPS.indexOf(name);

  // The business-details form is shown as one settled block once a path is chosen
  // (new business, or an existing lead has been picked). No progressive field reveal.
  const showForm = mode === 'new' || (mode === 'existing' && !!leadId);
  // All required fields present → questions can be generated. Website URL is required
  // only when "has website" is Yes (preserves the has_website behaviour). Specialisms
  // are optional.
  const canGenerate = !!businessName.trim() && !!businessType.trim() && !!locationText.trim()
    && !!country && hasWebsite !== null && (hasWebsite === false || !!website.trim());

  // Open a report: prefer the stored snapshot for that run (shown as-is), else the live
  // build. Regenerate is enabled only when we have live data for THIS run loaded.
  const rawOpenReportData = reportRunId ? (reports[reportRunId] ?? (reportRunId === runId ? liveReportData : null)) : null;
  // Defensive: a snapshot cached before the seo-guard shipped could still hold a failure
  // marker — strip it so opening a persisted report can't crash the generator.
  const openReportData = rawOpenReportData && rawOpenReportData.seo && !isRenderableSeo(rawOpenReportData.seo)
    ? { ...rawOpenReportData, seo: undefined }
    : rawOpenReportData;
  const canRegenerate = !!reportRunId && reportRunId === runId && !!liveReportData;

  // Snapshot the current run's live report and open it (used by the results screen). If a
  // snapshot already exists it is kept — opening never silently rebuilds it.
  const openReportForCurrentRun = () => {
    if (!runId) return;
    if (!reports[runId] && liveReportData) setReports((prev) => ({ ...prev, [runId]: liveReportData }));
    setReportRunId(runId);
  };
  const regenerateReport = () => {
    if (!reportRunId || !liveReportData) return;
    setReports((prev) => ({ ...prev, [reportRunId]: liveReportData }));
  };

  // Does this run already have a graded SEO block? Drives the button label + panel copy.
  const hasSeo = isRenderableSeo((run?.results as { seo?: unknown } | null)?.seo);

  // Submit pasted SEO text → apply-seo-paste (AI extract + grade) → store at results.seo.
  // On success: refresh the run so results.seo is live, and INVALIDATE this run's cached
  // report snapshot so the SEO section shows immediately (not a stale pre-SEO snapshot).
  const applySeoPaste = async () => {
    if (!runId || !seoPasteText.trim()) return;
    setSeoApplying(true);
    try {
      const { data, error } = await supabase.functions.invoke('apply-seo-paste', {
        body: { runId, pastedText: seoPasteText },
      });
      if (error || !data?.ok) throw new Error(error?.message ?? data?.error ?? 'apply failed');
      await pollRun(runId);                                   // refresh run.results (now has seo)
      setReports((prev) => {                                  // drop stale snapshot for this run
        if (!(runId in prev)) return prev;
        const next = { ...prev }; delete next[runId]; return next;
      });
      setSeoPasteOpen(false);
      setSeoPasteText('');
      toast({ title: 'SEO data added', description: 'The report now includes the SEO section.' });
    } catch (e) {
      toast({ title: "Couldn't read that SEO data", description: e instanceof Error ? e.message : 'Try pasting the full report text again', variant: 'destructive' });
    } finally {
      setSeoApplying(false);
    }
  };

  // Client-facing report is a separate view (replaces results while open).
  if (reportRunId && openReportData) {
    return (
      <AiAuditReport
        data={openReportData}
        onBack={() => setReportRunId(null)}
        onDownload={() => downloadReportHtml(openReportData)}
        onRegenerate={canRegenerate ? regenerateReport : undefined}
      />
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 sm:space-y-7">
      <div className="text-center sm:text-left">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2 justify-center sm:justify-start">
          <Sparkles className="h-5 w-5 text-primary" /> AI Visibility Audit
        </h1>
        <p className="text-sm text-muted-foreground">
          See whether AI assistants (ChatGPT, Gemini, Google AI Overview) name a business when customers ask.
        </p>
      </div>

      {/* Stacked wizard — answered steps stay visible; each answer reveals the next. */}
      {step !== 'results' && (
        <div className="space-y-4">
          {/* Metrics strip — a quick read on the whole audit book (only when there are audits) */}
          {metrics.total > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <MetricCard icon={<FileText className="h-4 w-4" />} label="Audits" value={String(metrics.total)} />
              {metrics.avgPct !== null && (
                <MetricCard
                  icon={<TrendingUp className="h-4 w-4" />}
                  label="Avg visibility"
                  value={`${metrics.avgPct}%`}
                  tone={metrics.avgPct >= 50 ? 'good' : metrics.avgPct > 0 ? 'mid' : 'bad'}
                />
              )}
              <MetricCard
                icon={<EyeOff className="h-4 w-4" />}
                label="Invisible"
                value={String(metrics.invisible)}
                tone={metrics.invisible > 0 ? 'bad' : 'good'}
              />
              <MetricCard
                icon={<Globe className="h-4 w-4" />}
                label="Site · presence"
                value={`${metrics.withSite} · ${metrics.presence}`}
              />
            </div>
          )}

          {/* Step 1 — source */}
          <StepCard>
            <StepHeader title="Audit a new business, or an existing lead?" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ChoiceButton active={mode === 'new'} onClick={() => { setMode('new'); setLeadId(null); reveal(WIZARD_STEPS.indexOf('name')); }} icon={<Building2 className="h-4 w-4" />} label="New business" hint="Enter the details yourself" />
              <ChoiceButton active={mode === 'existing'} onClick={() => setMode('existing')} icon={<Users className="h-4 w-4" />} label="Existing lead" hint="Pick from your CRM" />
            </div>
            {mode === 'existing' && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Choose a lead</Label>
                <Select value={leadId ?? undefined} onValueChange={pickLead}>
                  <SelectTrigger><SelectValue placeholder="Select a lead…" /></SelectTrigger>
                  <SelectContent>
                    {leads.map((l) => (
                      <SelectItem key={l.id} value={l.id}>{l.business_name}{l.address ? ` — ${l.address}` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="pt-4 mt-2 border-t border-border/60 space-y-2">
              <Label className="text-xs text-muted-foreground">Past audits</Label>
              {savedAudits.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 bg-card/40 px-4 py-6 text-center">
                  <Sparkles className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
                  <div className="text-sm font-medium">No audits yet</div>
                  <div className="text-[11px] text-muted-foreground">Run your first audit above to see how AI answers for a business.</div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {savedAudits.map((a) => (
                    <div key={a.id}
                      className="group flex items-center gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-2 transition-colors hover:bg-card">
                      <button onClick={() => reopenAudit(a)} className="min-w-0 flex-1 text-left" title="Open results">
                        <div className="flex items-center gap-1.5 text-sm font-medium truncate">
                          {a.has_website ? <Globe className="h-3 w-3 shrink-0 text-muted-foreground" /> : <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />}
                          <span className="truncate">{a.business_name}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate">{a.business_type || '—'}{a.location_text ? ` · ${a.location_text}` : ''}</div>
                      </button>
                      <MentionPill rate={a.latest_mention_rate} />
                      {a.latest_run_id && (
                        <Button variant="ghost" size="sm" className="h-7 px-2 shrink-0" onClick={() => viewReport(a)} title="View report">
                          <FileText className="h-3.5 w-3.5 sm:mr-1.5" /><span className="hidden sm:inline">View report</span>
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </StepCard>

          {/* Business details — one settled form, all fields visible at once */}
          {showForm && (
            <StepCard>
              <StepHeader title="Business details" />
              <div className="space-y-4">
                {/* Name */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Business name</Label>
                  <Input ref={nameRef} value={businessName} onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="e.g. Joe's Barbers" />
                </div>

                {/* Type */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Business type</Label>
                  <Input ref={typeRef} value={businessType} onChange={(e) => setBusinessType(e.target.value)}
                    placeholder="e.g. barber, plumber, dentist" />
                </div>

                {/* Location + country */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Town / city</Label>
                    <Input ref={townRef} value={locationText} onChange={(e) => setLocationText(e.target.value)}
                      placeholder="e.g. Leeds" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Country</Label>
                    <Select value={country || undefined} onValueChange={(v) => setCountry(v as Country)}>
                      <SelectTrigger><SelectValue placeholder="Country" /></SelectTrigger>
                      <SelectContent>{COUNTRIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Website (URL box appears only when "Yes" — drives has_website / SEO step) */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Does it have a website?</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <ChoiceButton active={hasWebsite === true} onClick={() => { setHasWebsite(true); setTimeout(() => urlRef.current?.focus(), 0); }} label="Yes" hint="Enter the URL" />
                    <ChoiceButton active={hasWebsite === false} onClick={() => { setHasWebsite(false); setWebsite(''); }} label="No" hint="Presence-led audit" />
                  </div>
                  {hasWebsite === true && (
                    <Input ref={urlRef} value={website} onChange={(e) => setWebsite(e.target.value)}
                      placeholder="https://…" />
                  )}
                </div>

                {/* Specialisms (optional) */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">What are they known for? (optional)</Label>
                  <Input ref={specialismsRef} value={specialisms} onChange={(e) => setSpecialisms(e.target.value)}
                    placeholder="e.g. kava, pool tables, vinyl" />
                  <p className="text-[11px] text-muted-foreground">Optional — helps ground the questions.</p>
                </div>

                {/* Number of questions to generate (6–12, default 8) */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">How many questions?</Label>
                  <div className="flex items-center gap-3">
                    <Select value={String(questionCount)} onValueChange={(v) => setQuestionCount(clampQuestionCount(Number(v)))}>
                      <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>{QUESTION_COUNT_OPTIONS.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                    </Select>
                    <span className="text-[11px] text-muted-foreground">
                      We'll generate {questionCount} search question{questionCount === 1 ? '' : 's'}
                      {unitCost > 0 ? ` · est. cost ~$${(questionCount * engineCount * unitCost).toFixed(2)}` : ''}.
                    </span>
                  </div>
                </div>

                {/* Generate → reveals the review step, which generates the questions */}
                <div className="pt-1">
                  <Button onClick={() => reveal(REVIEW_INDEX)} disabled={!canGenerate}>
                    <Sparkles className="mr-2 h-4 w-4" /> Generate questions
                  </Button>
                  {!canGenerate && (
                    <p className="text-[11px] text-muted-foreground mt-1.5">Fill in name, type, location, country and the website choice to continue.</p>
                  )}
                </div>
              </div>
            </StepCard>
          )}

          {/* Step 7 — review questions + cost */}
          {shown('review') && (
            <StepCard>
              <div className="flex items-center justify-between gap-2">
                <StepHeader title="Review the questions" />
                <Button variant="ghost" size="sm" onClick={runPreview} disabled={previewing} title="Regenerate questions">
                  <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${previewing ? 'animate-spin' : ''}`} /> Regenerate
                </Button>
              </div>
              <p className="text-xs text-muted-foreground -mt-1">
                These are the searches we'll run across {SCORED_ENGINES.map((e) => ENGINE_LABELS[e]).join(' + ')} (plus AI Overview & Google). Edit, add or remove any.
              </p>
              {previewing ? (
                <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" /> Generating questions…
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {questions.map((q, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input value={q} onChange={(e) => setQuestions((prev) => prev.map((x, xi) => xi === i ? e.target.value : x))} />
                        <Button variant="ghost" size="icon" onClick={() => setQuestions((prev) => prev.filter((_, xi) => xi !== i))} title="Remove">
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => setQuestions((prev) => [...prev, ''])}>
                      <Plus className="mr-1 h-4 w-4" /> Add question
                    </Button>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <span className="text-xs text-muted-foreground">
                      {questions.length} question{questions.length === 1 ? '' : 's'} · est. cost ~${estimatedCost.toFixed(2)}
                    </span>
                    <Button onClick={confirmAndRun} disabled={running || questions.length === 0}>
                      {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                      Confirm & run
                    </Button>
                  </div>
                </>
              )}
            </StepCard>
          )}
        </div>
      )}

      {step === 'results' && (
        <div className="space-y-4">
          {/* Scorecard */}
          <Card>
            <CardContent className="p-4 sm:p-5 space-y-4">
              {/* Back + actions */}
              <div className="flex items-center justify-between gap-2">
                <Button variant="ghost" size="sm" className="-ml-2" onClick={() => setStep('source')}>
                  <ArrowLeft className="mr-1.5 h-4 w-4" /> Back
                </Button>
                <div className="flex items-center gap-2">
                  {/* SEO paste — website audits only. Toggles the paste panel below. */}
                  {!isDraining && resultsHasWebsite && (
                    <Button variant="outline" size="sm" onClick={() => setSeoPasteOpen((o) => !o)}>
                      <Globe className="mr-2 h-4 w-4" /> {hasSeo ? 'Update SEO data' : 'Add SEO data'}
                    </Button>
                  )}
                  {!isDraining && liveTally.done > 0 && (
                    <Button variant="outline" size="sm" onClick={openReportForCurrentRun}>
                      <FileText className="mr-2 h-4 w-4" /> {runId && reports[runId] ? 'View report' : 'Create report'}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={resetWizard}>New audit</Button>
                  <Button size="sm" onClick={reRun} disabled={running || isDraining}>
                    {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Re-run
                  </Button>
                </div>
              </div>

              {/* SEO paste panel — paste a SEOptimer report; AI extracts + grades it. */}
              {seoPasteOpen && resultsHasWebsite && (
                <div className="rounded-lg border border-border/60 bg-card/60 p-3 space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {hasSeo ? 'Update SEO data' : 'Add SEO data'}
                  </div>
                  <p className="text-xs text-muted-foreground">Paste the full SEOptimer report text. We extract the signals and grade them into the report's SEO section.</p>
                  <textarea
                    value={seoPasteText}
                    onChange={(e) => setSeoPasteText(e.target.value)}
                    disabled={seoApplying}
                    placeholder="Paste the SEO report here…"
                    className="w-full min-h-[140px] rounded-md border border-border/60 bg-background p-2 text-sm font-mono resize-y focus:outline-none focus:ring-1 focus:ring-primary/40"
                  />
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => { setSeoPasteOpen(false); setSeoPasteText(''); }} disabled={seoApplying}>Cancel</Button>
                    <Button size="sm" onClick={applySeoPaste} disabled={seoApplying || seoPasteText.trim().length < 20}>
                      {seoApplying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                      {seoApplying ? 'Grading…' : hasSeo ? 'Update SEO' : 'Grade & add'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Headline */}
              <div>
                <div className="text-sm text-muted-foreground">{resultsBusinessName}</div>
                <ResultsHeadline run={run} live={liveTally} draining={isDraining} />
              </div>

              {/* Progress while draining */}
              {isDraining && (
                <div className="space-y-1.5">
                  <Progress value={queueRows.length ? (doneCount / queueRows.length) * 100 : 0} />
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Running searches… {doneCount}/{queueRows.length || '…'}
                    {run?.status === 'capped' && <span className="text-amber-500">· cost cap reached</span>}
                  </div>
                </div>
              )}

              {/* Per-engine breakdown — named vs not, as a tick/cross + simple bar */}
              {!isDraining && liveTally.done > 0 && (
                <div className="space-y-2 pt-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Where AI named them</div>
                  {perEngineScore.filter((pe) => pe.total > 0).map((pe) => (
                    <div key={pe.engine} className="flex items-center gap-3">
                      <span className="w-24 shrink-0 text-xs font-medium">{ENGINE_LABELS[pe.engine] ?? pe.engine}</span>
                      {pe.named > 0
                        ? <Check className="h-4 w-4 shrink-0 text-[hsl(var(--badge-interested))]" />
                        : <X className="h-4 w-4 shrink-0 text-muted-foreground" />}
                      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-[hsl(var(--badge-interested))]" style={{ width: `${Math.round((pe.named / pe.total) * 100)}%` }} />
                      </div>
                      <span className="w-16 shrink-0 text-right text-[11px] text-muted-foreground">{pe.named}/{pe.total}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Competitor callout */}
              {!isDraining && topCompetitors.length > 0 && (
                <div className="rounded-lg border border-border/60 bg-card/60 p-3">
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">AI names these instead</div>
                  <div className="flex flex-wrap gap-1.5">
                    {topCompetitors.map((c) => <Badge key={c} variant="secondary">{c}</Badge>)}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Per-question results */}
          {queueRows.length === 0 && !isDraining && (
            <p className="text-sm text-muted-foreground">No results yet.</p>
          )}
          {queueRows.map((row) => (
            <QuestionCard key={row.id} row={row} businessName={resultsBusinessName} />
          ))}
        </div>
      )}
    </div>
  );
};

/* ── Small presentational helpers ─────────────────────────────────────────── */

function StepCard({ children }: { children: React.ReactNode }) {
  return <Card><CardContent className="p-4 sm:p-5 space-y-4">{children}</CardContent></Card>;
}
function StepHeader({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <div className="flex items-center gap-2">
      {onBack && (
        <Button variant="ghost" size="icon" className="h-7 w-7 -ml-1" onClick={onBack} title="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
      )}
      <h2 className="text-base font-semibold">{title}</h2>
    </div>
  );
}
function ChoiceButton({ active, onClick, label, hint, icon }: { active: boolean; onClick: () => void; label: string; hint: string; icon?: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`group rounded-xl border p-3.5 text-left transition-all ${active ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border/60 bg-card/60 hover:border-primary/40 hover:bg-card hover:shadow-sm'}`}>
      <div className="flex items-center gap-2.5">
        {icon && (
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${active ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'}`}>
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            {label}{active && <Check className="h-3.5 w-3.5 text-primary" />}
          </div>
          <div className="text-[11px] text-muted-foreground">{hint}</div>
        </div>
      </div>
    </button>
  );
}
// Score badge: colour by band — red for invisible (0%), amber mid, green high.
function MentionPill({ rate }: { rate: number | null }) {
  if (rate === null || rate === undefined) return <Badge variant="secondary" className="shrink-0">—</Badge>;
  const pct = Math.round(rate * 100);
  const cls = pct >= 50 ? 'bg-[hsl(var(--badge-closed))] text-[hsl(var(--badge-closed-fg))]'
    : pct > 0 ? 'bg-[hsl(var(--badge-waiting))] text-[hsl(var(--badge-waiting-fg))]'
    : 'bg-[hsl(var(--badge-not-interested))] text-[hsl(var(--badge-not-interested-fg))]';
  return <Badge className={`shrink-0 border-transparent ${cls}`}>{pct}% named</Badge>;
}
// Small stat tile for the landing metrics strip. `tone` tints the value only.
function MetricCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: 'good' | 'mid' | 'bad' }) {
  const valCls = tone === 'good' ? 'text-[hsl(var(--badge-closed))]'
    : tone === 'mid' ? 'text-[hsl(var(--badge-waiting))]'
    : tone === 'bad' ? 'text-[hsl(var(--badge-not-interested))]'
    : 'text-foreground';
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <span className="text-muted-foreground">{icon}</span>{label}
      </div>
      <div className={`mt-1 text-2xl font-bold tracking-tight ${valCls}`}>{value}</div>
    </div>
  );
}
function ResultsHeadline({ run, live, draining }: { run: RunRow | null; live: { named: number; total: number; failed: number; done: number }; draining: boolean }) {
  // Prefer the folded summary once complete; otherwise the live tally as it drains.
  const summary = (run?.results as { summary?: { named_datapoints: number; total_datapoints: number; failed_questions?: number; done_questions?: number } } | null)?.summary;
  const named = summary?.named_datapoints ?? live.named;
  const total = summary?.total_datapoints ?? live.total;
  const failed = summary?.failed_questions ?? live.failed;
  // Finished with zero completed searches → make "everything failed" explicit rather
  // than a bare "Named in 0 of 0" (which reads like a real zero-visibility result).
  if (!draining && total === 0) {
    return (
      <div className="text-lg font-bold tracking-tight">
        {failed > 0 ? `All ${failed} ${failed === 1 ? 'search' : 'searches'} failed` : 'No searches completed'}
      </div>
    );
  }
  return (
    <div className="text-lg font-bold tracking-tight">
      Named in {named} of {total} AI answers
      {!draining && total > 0 && <span className="text-muted-foreground font-normal text-sm"> ({Math.round((named / total) * 100)}%)</span>}
      {failed > 0 && <span className="text-amber-500 font-normal text-sm"> · {failed} failed</span>}
    </div>
  );
}

function QuestionCard({ row, businessName }: { row: QueueRow; businessName: string }) {
  const pending = row.status === 'pending' || row.status === 'running';
  // Failed rows store { error } (not an engine map); surface it instead of engines.
  const failure = row.status === 'failed' ? (row.result as unknown as { error?: string } | null)?.error ?? null : null;
  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="text-sm font-medium">{row.question}</div>
          {pending ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
            : row.status === 'failed' ? <Badge variant="secondary" className="shrink-0">failed</Badge>
            : null}
        </div>
        {row.status === 'failed' && (
          <p className="text-[11px] text-amber-500">Search failed{failure ? ` — ${failure}` : ''}. It'll retry, or you can re-run the audit.</p>
        )}
        {row.status === 'done' && row.result && (
          <div className="space-y-2.5">
            {DISPLAY_ENGINES.map((e) => {
              const er = row.result?.[e];
              if (!er) return null;
              return <EngineRow key={e} engine={e} er={er} businessName={businessName} />;
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EngineRow({ engine, er, businessName }: { engine: string; er: EngineResult; businessName: string }) {
  return (
    <div className="rounded-lg border border-border/50 p-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold w-24 shrink-0">{ENGINE_LABELS[engine] ?? engine}</span>
        {er.named
          ? <Badge className="border-transparent bg-[hsl(var(--badge-interested))] text-[hsl(var(--badge-interested-fg))]">Named{er.position ? ` · #${er.position}` : ''}</Badge>
          : <Badge className="border-transparent bg-[hsl(var(--badge-gray))] text-[hsl(var(--badge-gray-fg))]">Not named</Badge>}
        {er.competitors.length > 0 && (
          <span className="text-[11px] text-muted-foreground">
            instead: {er.competitors.slice(0, 5).join(', ')}
          </span>
        )}
      </div>
      {/* The gut-punch: show what the AI actually said when the business is absent. */}
      {!er.named && er.answer_text && (
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground italic line-clamp-4">
          "{er.answer_text.slice(0, 320)}{er.answer_text.length > 320 ? '…' : ''}"
        </p>
      )}
      {er.citations.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {er.citations.slice(0, 6).map((c, i) => (
            <a key={i} href={c.url} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-primary/90 hover:underline max-w-[220px] truncate">
              <ExternalLink className="h-3 w-3 shrink-0" />{c.title || c.url}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export default AiAudit;
