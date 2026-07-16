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
  Building2, Users, TrendingUp, EyeOff, Globe, MapPin, Map as MapIcon, Download, ChevronDown,
  Copy, Save, Trash2, CircleStop,
} from 'lucide-react';
// NOTE: lucide's `Map` is imported AS `MapIcon` — importing it as `Map` shadows the global
// Map constructor, and this module uses `new Map()` (e.g. topCompetitors), which crashed
// the page on load ("Map is not a constructor").
import type { Country } from '@/types/outreach';
import { AiAuditReport } from '@/components/AiAuditReport';
import { downloadReportHtml, type AiAuditReportData, type AiAuditSeo } from '@/lib/aiAuditReportHtml';
import { renderPlaybookHtml, downloadPlaybookHtml, type PlaybookData, type PlaybookView } from '@/lib/playbookHtml';
import { buildSchema, normalizeUrl } from '@/lib/schemaType';
import { usePersistedState } from '@/hooks/usePersistedState';

// AI Visibility Audit — a stacked/conversational wizard: answered steps stay visible
// and answering one reveals the next below it (no per-step Next). Generates search
// questions, runs them across AI engines via create-ai-audit + the process-ai-audit-queue
// drain, and polls the run for results.

type Step = 'source' | 'name' | 'type' | 'location' | 'website' | 'review' | 'results';
// The stacked wizard steps, in order. `revealed` is the furthest index shown; every
// step 0..revealed is rendered at once. 'results' is a separate phase (step === 'results').
const WIZARD_STEPS = ['source', 'name', 'type', 'location', 'website', 'scope', 'specialisms', 'review'] as const;
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
function isRealCompetitor(name: string, locationText: string): boolean {
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
  businessScope: 'national' | 'local' | 'hybrid' | null;
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
  // How the client engages — sets business scope explicitly (overrides the downstream guess).
  // Optional: null when the user skips it (then we send null and the heuristic still applies).
  const [businessScope, setBusinessScope] = useState<'national' | 'local' | 'hybrid' | null>(persisted?.businessScope ?? null);
  const [specialisms, setSpecialisms] = useState(persisted?.specialisms ?? ''); // optional — grounds question generation
  const [questionCount, setQuestionCount] = useState<number>(() =>
    clampQuestionCount(persisted?.questionCount ?? DEFAULT_QUESTION_COUNT));

  // Existing-lead picker + saved audits
  const [leads, setLeads] = useState<LeadOption[]>([]);
  const [savedAudits, setSavedAudits] = useState<(AuditRow & { latest_mention_rate: number | null; latest_run_id: string | null; latest_has_playbook: boolean; latest_status: string | null; is_running: boolean })[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null); // audit being deleted (disables its row buttons)
  const [cancellingId, setCancellingId] = useState<string | null>(null); // audit whose run is being cancelled

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
  const [regenerating, setRegenerating] = useState(false); // Regenerate-button loading state
  const [reextracting, setReextracting] = useState(false); // Re-extract-competitors loading state
  // Which run's report is currently open (null = not viewing a report). Replaces the old
  // boolean so we can open a SPECIFIC run's persisted report snapshot.
  const [reportRunId, setReportRunId] = useState<string | null>(null);
  // Generated report snapshots, keyed by run id. Persisted (per-user, survives navigation
  // AND tab close) so a report that's been generated is shown as-is on return — it is only
  // rebuilt by the explicit Regenerate action, never silently re-derived.
  const [reports, setReports] = usePersistedState<Record<string, AiAuditReportData>>(
    'ai-audit-reports', {}, { tier: 'local', scope: user?.id ?? null, version: 1 },
  );

  // ── Delivery playbook (8-week Sprint plan) — same persistence pattern as the report. ──
  const [playbookRunId, setPlaybookRunId] = useState<string | null>(null);   // which run's playbook is open
  const [playbookView, setPlaybookView] = useState<PlaybookView>('internal'); // Internal | Client toggle
  const [playbookGenerating, setPlaybookGenerating] = useState(false);
  const [playbooks, setPlaybooks] = usePersistedState<Record<string, PlaybookData>>(
    'ai-audit-playbooks', {}, { tier: 'local', scope: user?.id ?? null, version: 1 },
  );

  // Detailed per-question results are collapsed by default — the opened audit reads as a
  // command centre, not a raw dump. Toggled open on demand.
  const [showDetails, setShowDetails] = useState(false);

  // "Schema markup" section — collapsible JSON-LD generator with editable NAP + specialism.
  // The four fields + the website URL are loaded from ai_audits (not in the wizard state on a
  // reopened audit) and saved back on demand, so they pre-fill next visit.
  const [showSchema, setShowSchema] = useState(false);
  const [schemaNap, setSchemaNap] = useState({ phone: '', address: '', email: '', specialism: '' });
  const [schemaWebsite, setSchemaWebsite] = useState('');
  // The audit's explicit stored engagement scope (null when unset) — preferred over the
  // playbook-derived scope when building the JSON-LD schema.
  const [schemaScope, setSchemaScope] = useState<'national' | 'local' | 'hybrid' | null>(null);
  const [schemaCopied, setSchemaCopied] = useState(false);
  const [schemaSaving, setSchemaSaving] = useState(false);
  // "Link hub" section — collapsible list of the client's own URLs (label + url), loaded from
  // ai_audits.client_links and saved back per audit. Mirrors the Schema markup section.
  const [showLinks, setShowLinks] = useState(false);
  const [clientLinks, setClientLinks] = useState<{ label: string; url: string }[]>([]);
  const [linksSaving, setLinksSaving] = useState(false);
  const [linkCopiedIdx, setLinkCopiedIdx] = useState<number | null>(null);
  // The run whose opened-audit view we're on. Persisted (per-tab) so navigating away to the
  // report/playbook sub-views — or off the page entirely — and back returns to THIS audit
  // instead of resetting to the list. Cleared by "New audit" and "Back" (to the list).
  const [openRunId, setOpenRunId] = usePersistedState<string | null>(
    'ai-audit-open-run', null, { tier: 'session', scope: user?.id ?? null, version: 1 },
  );
  // Delivery-checklist tick state, keyed runId → { itemKey: boolean }. Persisted locally
  // (survives refresh/navigation); no DB migration needed.
  const [checklist, setChecklist] = usePersistedState<Record<string, Record<string, boolean>>>(
    'ai-audit-checklist', {}, { tier: 'local', scope: user?.id ?? null, version: 1 },
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
        revealed, mode, leadId, businessName, businessType, locationText, country, hasWebsite, website, businessScope, specialisms, questionCount, questions, unitCost, engineCount,
      }));
    } catch { /* storage unavailable — persistence is best-effort */ }
  }, [step, revealed, mode, leadId, businessName, businessType, locationText, country, hasWebsite, website, businessScope, specialisms, questionCount, questions, unitCost, engineCount]);

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
    const latestByAudit: Record<string, { rate: number | null; runId: string; status: string | null }> = {};
    if (ids.length) {
      const { data: runs } = await supabase
        .from('ai_audit_runs')
        .select('id, audit_id, mention_rate, run_number, status')
        .in('audit_id', ids)
        .order('run_number', { ascending: false });
      for (const r of (runs ?? []) as { id: string; audit_id: string; mention_rate: number | null; status: string | null }[]) {
        // newest first → first seen per audit is the latest run
        if (!(r.audit_id in latestByAudit)) latestByAudit[r.audit_id] = { rate: r.mention_rate, runId: r.id, status: r.status };
      }
    }
    // Best-effort: which latest runs already have a playbook (light scalar existence check —
    // results.playbook.summary; no big JSONB pulled). If the JSON-path select isn't supported
    // it returns null/error and we fall back to the localStorage `playbooks` map at render.
    const latestRunIds = Object.values(latestByAudit).map((x) => x.runId);
    const playbookRuns = new Set<string>();
    if (latestRunIds.length) {
      const { data: flags } = await supabase
        .from('ai_audit_runs')
        .select('id, pb_summary:results->playbook->>summary')
        .in('id', latestRunIds);
      for (const f of (flags ?? []) as { id: string; pb_summary: string | null }[]) {
        if (f.pb_summary) playbookRuns.add(f.id);
      }
    }
    setSavedAudits(auditRows.map((a) => {
      const runId = latestByAudit[a.id]?.runId ?? null;
      const status = latestByAudit[a.id]?.status ?? null;
      return {
        ...a,
        latest_mention_rate: latestByAudit[a.id]?.rate ?? null,
        latest_run_id: runId,
        latest_has_playbook: !!runId && playbookRuns.has(runId),
        latest_status: status,
        // Still in flight (drainable by the queue) — gates the Stop button.
        is_running: status === 'pending' || status === 'running',
      };
    }));
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

  // Restore an opened audit by run id after a remount (route change / refresh) so the user
  // returns to the audit they were on, not the list. Fetches the run + its audit, restores
  // the results state, and lets the poll effect refill the queue rows. Returns false if the
  // run/audit no longer exists (so the caller can clear the stale pointer).
  const rehydrateOpenRun = useCallback(async (rid: string): Promise<boolean> => {
    const { data: latest } = await supabase
      .from('ai_audit_runs')
      .select('id, audit_id, run_number, status, mention_rate, results')
      .eq('id', rid)
      .maybeSingle();
    if (!latest) return false;
    const { data: audit } = await supabase
      .from('ai_audits')
      .select('id, business_name, business_type, location_text, has_website, website')
      .eq('id', (latest as RunRow).audit_id)
      .maybeSingle();
    if (!audit) return false;
    setAuditId(audit.id);
    setResultsBusinessName(audit.business_name);
    setResultsHasWebsite(audit.has_website === true);
    setBusinessType(audit.business_type ?? '');
    setLocationText(audit.location_text ?? '');
    setRun(latest as RunRow);
    setRunId((latest as RunRow).id);
    const serverPb = (latest as { results?: { playbook?: unknown } } | null)?.results?.playbook;
    if (serverPb && typeof serverPb === 'object') {
      setPlaybooks((prev) => (prev[rid] ? prev : { ...prev, [rid]: serverPb as PlaybookData }));
    }
    setStep('results');
    return true;
  }, [setPlaybooks]);

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

  // On mount, if a previously-opened audit was persisted (page was left and returned to),
  // restore it so the user lands back on that audit rather than the list. Runs once; skipped
  // if a session is already active. A stale pointer (deleted run) clears itself.
  const rehydratedRef = useRef(false);
  useEffect(() => {
    if (!user || rehydratedRef.current) return;
    if (!openRunId || runId || step === 'results') return;
    rehydratedRef.current = true;
    rehydrateOpenRun(openRunId).then((ok) => { if (!ok) setOpenRunId(null); });
  }, [user, openRunId, runId, step, rehydrateOpenRun, setOpenRunId]);

  const resetWizard = () => {
    setMode(null); setLeadId(null); setBusinessName(''); setBusinessType('');
    setLocationText(''); setCountry(''); setHasWebsite(null); setWebsite(''); setSpecialisms('');
    setQuestions([]); setUnitCost(0); setEngineCount(SCORED_ENGINES.length);
    setAuditId(null); setRunId(null); setRun(null); setQueueRows([]);
    setOpenRunId(null); setShowDetails(false);
    setRevealed(0); setStep('source');
  };

  // Delete an audit + all its children (ai_audit_runs / ai_audit_queue cascade from the FK).
  // Owner RLS lets the browser delete its own row. Mirrors AdminSitesList: confirm → delete →
  // optimistic filter → toast. If the deleted audit is the one open in the results view, reset.
  const deleteAudit = async (a: AuditRow) => {
    if (deletingId) return;
    if (!window.confirm(`Delete "${a.business_name}"? This can't be undone.`)) return;
    setDeletingId(a.id);
    try {
      const { error } = await supabase.from('ai_audits').delete().eq('id', a.id);
      if (error) throw new Error(error.message);
      setSavedAudits((prev) => prev.filter((x) => x.id !== a.id));
      if (auditId === a.id) resetWizard(); // don't leave a stale open view of a deleted audit
      toast({ title: 'Audit deleted' });
    } catch (e) {
      toast({ title: 'Delete failed', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  // Cancel a still-running audit: mark the latest run + its unsettled queue rows 'cancelled'.
  // The queue processor claims only status='pending', so this stops all unclaimed work at once;
  // the processor's cancelled-handling finalises the run as cancelled. Owner RLS covers both.
  const cancelAudit = async (a: AuditRow & { latest_run_id: string | null }) => {
    if (cancellingId || !a.latest_run_id) return;
    if (!window.confirm(`Stop the audit for "${a.business_name}"? It won't finish.`)) return;
    setCancellingId(a.id);
    try {
      const runId = a.latest_run_id;
      const { error: qErr } = await supabase.from('ai_audit_queue')
        .update({ status: 'cancelled' }).eq('run_id', runId).in('status', ['pending', 'running']);
      if (qErr) throw new Error(qErr.message);
      const { error: rErr } = await supabase.from('ai_audit_runs')
        .update({ status: 'cancelled' }).eq('id', runId);
      if (rErr) throw new Error(rErr.message);
      setSavedAudits((prev) => prev.map((x) => x.id === a.id ? { ...x, latest_status: 'cancelled', is_running: false } : x));
      toast({ title: 'Audit stopped' });
    } catch (e) {
      toast({ title: "Couldn't stop the audit", description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setCancellingId(null);
    }
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
          website: website || undefined, business_scope: businessScope || undefined,
          specialisms: specialisms || undefined,
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
  }, [businessName, businessType, locationText, country, hasWebsite, website, businessScope, specialisms, questionCount, toast]);

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
          business_scope: businessScope || undefined,
          specialisms: specialisms || undefined,
          question_count: questionCount,
          questions: clean,
        },
      });
      if (error || !data?.ok) throw new Error(error?.message ?? data?.error ?? 'run failed');
      clearWizard(); // audit created successfully → next visit starts clean
      setAuditId(data.audit_id);
      setRunId(data.run_id);
      setOpenRunId(data.run_id);
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
      setOpenRunId(data.run_id);
      setRun(null); setQueueRows([]);
    } catch (e) {
      toast({ title: "Couldn't re-run", description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  };

  // Re-extract competitors for THIS run from its already-stored answer text — FREE-ish /
  // instant, NO Apify re-scrape. Calls the extract-competitors edge fn, which has an AI read
  // each engine's stored answer_text and return the real competitor firms it recommended (the
  // way a human would), then writes the cleaned competitors back to BOTH stores
  // (ai_audit_queue rows that drive the report/display + the run.results.questions snapshot the
  // playbook reads). We then reload from those stores and drop the cached report snapshot so
  // the report + "AI names these instead" rebuild clean on view/Regenerate. isRealCompetitor
  // still filters at display as a light final backstop.
  const reextractCompetitors = async () => {
    if (!runId || reextracting) return;
    setReextracting(true);
    try {
      const { data, error } = await supabase.functions.invoke('extract-competitors', { body: { runId } });
      if (error || !data?.ok) throw new Error(error?.message ?? data?.error ?? 'extraction failed');
      // Refresh in-memory state from the updated stores.
      const rows = await loadRunRows(runId);
      setQueueRows(rows);
      const { data: fresh } = await supabase.from('ai_audit_runs').select('results').eq('id', runId).maybeSingle();
      if (fresh?.results) setRun((prev) => (prev ? { ...prev, results: fresh.results } : prev));
      // Invalidate the cached report snapshot so it rebuilds from the cleaned rows.
      setReports((prev) => { const n = { ...prev }; delete n[runId]; return n; });
      toast({ title: 'Competitors re-extracted', description: 'AI re-read the stored answers — no new search run.' });
    } catch (e) {
      toast({ title: "Couldn't re-extract competitors", description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setReextracting(false);
    }
  };

  // Load the audit's stored NAP + specialism + website for the Schema section whenever the
  // opened audit changes (these aren't in the wizard/results state on a reopened audit).
  useEffect(() => {
    if (!auditId) { setSchemaNap({ phone: '', address: '', email: '', specialism: '' }); setSchemaWebsite(''); setSchemaScope(null); setClientLinks([]); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('ai_audits')
        .select('website, business_phone, business_address, business_email, specialism, business_scope, client_links')
        .eq('id', auditId)
        .maybeSingle();
      if (cancelled || !data) return;
      const d = data as { website: string | null; business_phone: string | null; business_address: string | null; business_email: string | null; specialism: string | null; business_scope: string | null; client_links: unknown };
      setSchemaWebsite(d.website ?? '');
      setSchemaNap({ phone: d.business_phone ?? '', address: d.business_address ?? '', email: d.business_email ?? '', specialism: d.specialism ?? '' });
      setSchemaScope(d.business_scope === 'national' || d.business_scope === 'local' || d.business_scope === 'hybrid' ? d.business_scope : null);
      // Guard: only accept an array of {label,url}; anything else falls back to [].
      const links = Array.isArray(d.client_links)
        ? (d.client_links as unknown[]).map((l) => {
            const o = (l ?? {}) as { label?: unknown; url?: unknown };
            return { label: typeof o.label === 'string' ? o.label : '', url: typeof o.url === 'string' ? o.url : '' };
          })
        : [];
      setClientLinks(links);
    })();
    return () => { cancelled = true; };
  }, [auditId]);

  // Copy the JSON-LD block (existing inline clipboard convention).
  const copySchema = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setSchemaCopied(true);
      setTimeout(() => setSchemaCopied(false), 2000);
    } catch {
      toast({ title: 'Copy failed', variant: 'destructive' });
    }
  };

  // Persist the four schema fields back to ai_audits so they pre-fill next visit.
  const saveSchemaDetails = async () => {
    if (!auditId || schemaSaving) return;
    setSchemaSaving(true);
    try {
      const { error } = await supabase.from('ai_audits').update({
        business_phone: schemaNap.phone.trim() || null,
        business_address: schemaNap.address.trim() || null,
        business_email: schemaNap.email.trim() || null,
        specialism: schemaNap.specialism.trim() || null,
      }).eq('id', auditId);
      if (error) throw new Error(error.message);
      toast({ title: 'Details saved' });
    } catch (e) {
      toast({ title: "Couldn't save details", description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setSchemaSaving(false);
    }
  };

  // Persist the link hub to ai_audits.client_links: trim, drop rows blank in BOTH fields, and
  // normalise each url with the shared schemaType helper. Mirrors saveSchemaDetails.
  const saveClientLinks = async () => {
    if (!auditId || linksSaving) return;
    setLinksSaving(true);
    try {
      const cleaned = clientLinks
        .map((l) => ({ label: l.label.trim(), url: normalizeUrl(l.url) }))
        .filter((l) => l.label || l.url);
      const { error } = await supabase.from('ai_audits').update({ client_links: cleaned }).eq('id', auditId);
      if (error) throw new Error(error.message);
      setClientLinks(cleaned);
      toast({ title: 'Links saved' });
    } catch (e) {
      toast({ title: "Couldn't save links", description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setLinksSaving(false);
    }
  };

  // Copy a single link's URL (reuses the inline clipboard convention from copySchema).
  const copyLink = async (url: string, idx: number) => {
    try {
      await navigator.clipboard.writeText(normalizeUrl(url));
      setLinkCopiedIdx(idx);
      setTimeout(() => setLinkCopiedIdx((i) => (i === idx ? null : i)), 2000);
    } catch {
      toast({ title: 'Copy failed', variant: 'destructive' });
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
    setOpenRunId((latest as RunRow).id);
    setSeoPasteOpen(false); setSeoPasteText('');
    // Hydrate the local playbook cache from the server so the opened-audit + row playbook
    // buttons and the delivery checklist reflect a playbook made on any device.
    const serverPb = (latest as { results?: { playbook?: unknown } } | null)?.results?.playbook;
    if (serverPb && typeof serverPb === 'object') {
      const rid = (latest as RunRow).id;
      setPlaybooks((prev) => (prev[rid] ? prev : { ...prev, [rid]: serverPb as PlaybookData }));
    }
    setStep('results');
    return latest as RunRow;
  };

  // Open a past audit's PLAYBOOK directly from its row: reopen (loads the run + hydrates the
  // playbook from results.playbook), then show the existing playbook view. No new viewer.
  const viewPlaybookFromRow = async (audit: AuditRow & { latest_run_id: string | null }) => {
    const latest = await reopenAudit(audit);
    if (!latest) return;
    const rid = latest.id;
    const pb = playbooks[rid] ?? (latest as { results?: { playbook?: unknown } }).results?.playbook;
    if (!pb || typeof pb !== 'object') { toast({ title: 'No playbook yet for this audit', variant: 'destructive' }); return; }
    if (!playbooks[rid]) setPlaybooks((prev) => ({ ...prev, [rid]: pb as PlaybookData }));
    setPlaybookRunId(rid);
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
  // Regenerate is available whenever the current run's report is open. It re-fetches live
  // data itself, so it doesn't depend on liveReportData already being in state.
  const canRegenerate = !!reportRunId && reportRunId === runId;

  // Snapshot the current run's live report and open it (used by the results screen). If a
  // snapshot already exists it is kept — opening never silently rebuilds it.
  const openReportForCurrentRun = () => {
    if (!runId) return;
    if (!reports[runId] && liveReportData) setReports((prev) => ({ ...prev, [runId]: liveReportData }));
    setReportRunId(runId);
  };
  // Rebuild the open report from the LATEST run data: re-fetch the run + its rows, rebuild
  // via buildReportData, overwrite the persisted snapshot, and surface feedback. (The old
  // version just re-stored the identical in-memory snapshot with no refresh and no feedback,
  // so clicking it did nothing visible.)
  const regenerateReport = async () => {
    if (!reportRunId || regenerating) return;
    const rid = reportRunId;
    setRegenerating(true);
    try {
      const freshRun = await pollRun(rid);          // refresh run + queueRows state, returns the run
      const rows = await loadRunRows(rid);          // authoritative rows to rebuild from
      const data = buildReportData(rows, freshRun ?? run, {
        businessName: resultsBusinessName || businessName,
        businessType,
        locationText,
        specialisms,
      });
      if (!data) {
        toast({ title: 'Nothing to rebuild yet', description: 'This run has no completed results.', variant: 'destructive' });
        return;
      }
      setReports((prev) => ({ ...prev, [rid]: data }));
      toast({ title: 'Report regenerated', description: 'Rebuilt from the latest run data.' });
    } catch (e) {
      toast({ title: "Couldn't regenerate", description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setRegenerating(false);
    }
  };

  // Does this run already have a graded SEO block? Drives the button label + panel copy.
  const hasSeo = isRenderableSeo((run?.results as { seo?: unknown } | null)?.seo);

  // Opened-audit header tiles. AI visibility = named datapoints (folded summary, else live
  // tally); SEO = the graded overall letter. Same sources the headline/report already use —
  // no new metric invented.
  const vizSummary = (run?.results as { summary?: { named_datapoints: number; total_datapoints: number } } | null)?.summary;
  const vizNamed = vizSummary?.named_datapoints ?? liveTally.named;
  const vizTotal = vizSummary?.total_datapoints ?? liveTally.total;
  const vizPct = vizTotal > 0 ? Math.round((vizNamed / vizTotal) * 100) : 0;
  const vizTone: TileTone = vizTotal === 0 ? 'muted' : vizPct >= 50 ? 'green' : vizPct > 0 ? 'amber' : 'red';
  const seoGrade = hasSeo ? String((run?.results as { seo?: { overallGrade?: string } } | null)?.seo?.overallGrade ?? '') : '';

  // Live JSON-LD schema for the "Schema markup" section — rebuilt each render as the NAP /
  // specialism inputs change. businessScope precedence: explicit stored scope > the generated
  // playbook's scope > undefined (buildSchema then falls back to its own heuristic).
  const playbookScope = (run?.results as { playbook?: { businessScope?: 'national' | 'local' | 'hybrid' } } | null)?.playbook?.businessScope;
  const schemaBusinessScope = schemaScope ?? playbookScope;
  const schemaCode = `<script type="application/ld+json">\n${JSON.stringify(buildSchema({
    name: resultsBusinessName || businessName,
    url: schemaWebsite || (resultsHasWebsite ? website : ''),
    businessType,
    businessScope: schemaBusinessScope,
    locationText,
    country,
    phone: schemaNap.phone,
    address: schemaNap.address,
    email: schemaNap.email,
    specialism: schemaNap.specialism,
  }), null, 2)}\n</script>`;

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

  // ── Playbook: generate/open/regenerate (mirrors the report's working pattern) ──
  const openPlaybookData: PlaybookData | null = playbookRunId ? (playbooks[playbookRunId] ?? null) : null;
  // Generate the playbook via the edge fn, snapshot it, and open. If a snapshot already
  // exists and this isn't an explicit regenerate, just open it (no re-generation).
  const generatePlaybook = async (regenerate = false) => {
    if (!runId || playbookGenerating) return;
    if (!regenerate && playbooks[runId]) { setPlaybookRunId(runId); return; }
    const rid = runId;
    setPlaybookGenerating(true);
    try {
      // Pass the already-cleaned competitor list (isRealCompetitor) so the playbook never
      // sees junk rivals (HMRC, Xero, tax terms); the edge fn uses this verbatim.
      const { data, error } = await supabase.functions.invoke('generate-playbook', { body: { runId: rid, competitors: topCompetitors } });
      if (error || !data?.ok || !data.playbook) throw new Error(error?.message ?? data?.error ?? 'generation failed');
      setPlaybooks((prev) => ({ ...prev, [rid]: data.playbook as PlaybookData }));
      setPlaybookRunId(rid);
      toast({ title: regenerate ? 'Playbook regenerated' : 'Playbook ready', description: 'Tailored 8-week Sprint plan built from this audit.' });
    } catch (e) {
      toast({ title: "Couldn't generate the playbook", description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setPlaybookGenerating(false);
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
        regenerating={regenerating}
      />
    );
  }

  // Delivery playbook is a separate view (iframe preview + Download + Regenerate + view toggle).
  if (playbookRunId && openPlaybookData) {
    const pbHtml = renderPlaybookHtml(openPlaybookData, playbookView);
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="ghost" size="sm" className="-ml-2" onClick={() => setPlaybookRunId(null)}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to results
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            {/* Internal | Client view toggle — re-renders from the SAME stored data, no re-gen */}
            <div className="inline-flex rounded-lg border border-border/60 p-0.5">
              <button onClick={() => setPlaybookView('internal')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${playbookView === 'internal' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                Internal
              </button>
              <button onClick={() => setPlaybookView('client')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${playbookView === 'client' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
                Client
              </button>
            </div>
            <Button variant="outline" size="sm" onClick={() => generatePlaybook(true)} disabled={playbookGenerating} title="Rebuild the playbook from the latest audit data">
              {playbookGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              {playbookGenerating ? 'Regenerating…' : 'Regenerate'}
            </Button>
            <Button size="sm" onClick={() => downloadPlaybookHtml(openPlaybookData, playbookView)}>
              <Download className="mr-2 h-4 w-4" /> Download PDF
            </Button>
          </div>
        </div>
        <iframe
          title="Delivery Playbook preview"
          srcDoc={pbHtml}
          onLoad={(e) => { const el = e.currentTarget; const doc = el.contentWindow?.document; if (doc) el.style.height = `${doc.documentElement.scrollHeight}px`; }}
          className="w-full rounded-xl border border-border bg-white"
          style={{ height: 1200 }}
        />
      </div>
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
                      {/* Report — shown when the audit is complete (finalised = mention_rate set) */}
                      {a.latest_mention_rate !== null && (
                        <Button variant="ghost" size="sm" className="h-7 px-2 shrink-0" onClick={() => viewReport(a)} title="View report">
                          <FileText className="h-3.5 w-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Report</span>
                        </Button>
                      )}
                      {/* Playbook — shown ONLY when one exists (server flag, or generated in this browser) */}
                      {(a.latest_has_playbook || (!!a.latest_run_id && !!playbooks[a.latest_run_id])) && (
                        <Button variant="ghost" size="sm" className="h-7 px-2 shrink-0" onClick={() => viewPlaybookFromRow(a)} title="View playbook">
                          <MapIcon className="h-3.5 w-3.5 sm:mr-1.5" /><span className="hidden sm:inline">Playbook</span>
                        </Button>
                      )}
                      {/* Stop — only while the latest run is still in flight (pending/running) */}
                      {a.is_running && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => cancelAudit(a)} disabled={cancellingId === a.id} title="Stop this audit">
                          {cancellingId === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CircleStop className="h-3.5 w-3.5" />}
                        </Button>
                      )}
                      {/* Delete — always available (cascades to runs + queue) */}
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => deleteAudit(a)} disabled={deletingId === a.id} title="Delete this audit">
                        {deletingId === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </Button>
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

                {/* Engagement scope — sets business_scope explicitly (overrides the downstream guess) */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">How do clients work with you?</Label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <ChoiceButton active={businessScope === 'local'} onClick={() => setBusinessScope('local')} label="They come to my premises" hint="Local" />
                    <ChoiceButton active={businessScope === 'national'} onClick={() => setBusinessScope('national')} label="I work remotely / across the country" hint="National" />
                    <ChoiceButton active={businessScope === 'hybrid'} onClick={() => setBusinessScope('hybrid')} label="A mix of both" hint="Hybrid" />
                  </div>
                  <p className="text-[11px] text-muted-foreground">This shapes whether we focus on local listings or national directories.</p>
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
          {/* ── Command-centre header: business + two score tiles + actions ── */}
          <Card>
            <CardContent className="p-4 sm:p-5 space-y-4">
              {/* Top bar: back to the list + tidy action buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button variant="ghost" size="sm" className="-ml-2" onClick={() => { setStep('source'); setOpenRunId(null); }}>
                  <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to audits
                </Button>
                <div className="flex flex-wrap items-center gap-2">
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
                  {/* Generate playbook — shown until one exists; flips to "View playbook" below.
                      Exact inverse condition, so exactly one of the two ever shows. */}
                  {!isDraining && liveTally.done > 0 && runId && !playbooks[runId] && (
                    <Button variant="outline" size="sm" onClick={() => generatePlaybook(false)} disabled={playbookGenerating}>
                      {playbookGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MapIcon className="mr-2 h-4 w-4" />}
                      {playbookGenerating ? 'Generating…' : 'Generate playbook'}
                    </Button>
                  )}
                  {/* View playbook — only when one exists; generation lives in the checklist below. */}
                  {!isDraining && liveTally.done > 0 && runId && playbooks[runId] && (
                    <Button variant="outline" size="sm" onClick={() => generatePlaybook(false)}>
                      <MapIcon className="mr-2 h-4 w-4" /> View playbook
                    </Button>
                  )}
                  {/* Re-extract competitors — FREE/instant: recompute from stored answers, no re-scrape. */}
                  {!isDraining && liveTally.done > 0 && (
                    <Button variant="outline" size="sm" onClick={reextractCompetitors} disabled={reextracting}
                      title="Recompute competitor names from the stored answers — free, no new search">
                      {reextracting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
                      {reextracting ? 'Re-extracting…' : 'Re-extract competitors'}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={resetWizard}>New audit</Button>
                  <Button size="sm" onClick={reRun} disabled={running || isDraining}>
                    {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    Re-run
                  </Button>
                </div>
              </div>

              {/* Business name — large + bold */}
              <div>
                <h2 className="text-2xl font-bold tracking-tight leading-tight">{resultsBusinessName || 'Audit'}</h2>
                {(businessType || locationText) && (
                  <div className="mt-0.5 text-sm text-muted-foreground">{[businessType, locationText].filter(Boolean).join(' · ')}</div>
                )}
              </div>

              {/* While draining: progress. Once complete: two score tiles side-by-side. */}
              {isDraining ? (
                <div className="space-y-1.5">
                  <Progress value={queueRows.length ? (doneCount / queueRows.length) * 100 : 0} />
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Running searches… {doneCount}/{queueRows.length || '…'}
                    {run?.status === 'capped' && <span className="text-amber-500">· cost cap reached</span>}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ScoreTile
                    label="AI Visibility"
                    value={vizTotal > 0 ? `${vizNamed}/${vizTotal}` : '—'}
                    sub={vizTotal > 0 ? `${vizPct}% of AI answers name them` : 'No searches completed'}
                    tone={vizTone}
                  />
                  {hasSeo ? (
                    <ScoreTile label="SEO grade" value={seoGrade || '—'} sub="Website SEO health" tone={gradeTone(seoGrade)} />
                  ) : resultsHasWebsite ? (
                    <ScoreTile label="SEO grade" value="Add data" sub="Paste an SEO report to grade it" tone="muted" onClick={() => setSeoPasteOpen(true)} />
                  ) : (
                    <ScoreTile label="SEO grade" value="N/A" sub="No website for this business" tone="muted" />
                  )}
                </div>
              )}

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

              {/* At-a-glance signals: where AI named them + who it names instead. */}
              {!isDraining && liveTally.done > 0 && (perEngineScore.some((pe) => pe.total > 0) || topCompetitors.length > 0) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1">
                  {perEngineScore.some((pe) => pe.total > 0) && (
                    <div className="space-y-2">
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
                  {topCompetitors.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">AI names these instead</div>
                      <div className="flex flex-wrap gap-1.5">
                        {topCompetitors.map((c) => <Badge key={c} variant="secondary">{c}</Badge>)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Delivery checklist — progressive, ordered, derived from the playbook */}
          {!isDraining && runId && (
            <DeliveryChecklist
              playbook={playbooks[runId] ?? ((run?.results as { playbook?: PlaybookData } | null)?.playbook ?? null)}
              hasWebsite={resultsHasWebsite}
              hasSeo={hasSeo}
              state={checklist[runId] ?? {}}
              onToggle={(key) => setChecklist((prev) => {
                const cur = prev[runId] ?? {};
                return { ...prev, [runId]: { ...cur, [key]: !(cur[key] ?? false) } };
              })}
              onGeneratePlaybook={() => generatePlaybook(false)}
              generating={playbookGenerating}
            />
          )}

          {/* Schema markup — copy-paste JSON-LD, collapsed by default (mirrors Detailed results). */}
          {!isDraining && liveTally.done > 0 && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowSchema((s) => !s)}
                className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/50"
              >
                <span className="text-sm font-semibold">
                  Schema markup
                  <span className="ml-1.5 font-normal text-muted-foreground">· JSON-LD for the site &lt;head&gt;</span>
                </span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showSchema ? 'rotate-180' : ''}`} />
              </button>
              {showSchema && (
                <Card>
                  <CardContent className="p-4 sm:p-5 space-y-3">
                    <p className="text-sm text-muted-foreground">Structured data that helps AI engines read this business. Fill in the details below, then copy the code into the site's &lt;head&gt;.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Phone</Label>
                        <Input value={schemaNap.phone} onChange={(e) => setSchemaNap((p) => ({ ...p, phone: e.target.value }))} placeholder="+44 …" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Email</Label>
                        <Input value={schemaNap.email} onChange={(e) => setSchemaNap((p) => ({ ...p, email: e.target.value }))} placeholder="hello@example.co.uk" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Address</Label>
                        <Input value={schemaNap.address} onChange={(e) => setSchemaNap((p) => ({ ...p, address: e.target.value }))} placeholder="Street, town, postcode" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Specialism</Label>
                        <Input value={schemaNap.specialism} onChange={(e) => setSchemaNap((p) => ({ ...p, specialism: e.target.value }))} placeholder="e.g. CIS / construction" />
                      </div>
                    </div>
                    <pre className="overflow-x-auto rounded-lg border border-border bg-muted/40 p-3 text-[11px] leading-relaxed"><code>{schemaCode}</code></pre>
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => copySchema(schemaCode)}>
                        {schemaCopied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                        {schemaCopied ? 'Copied' : 'Copy code'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={saveSchemaDetails} disabled={schemaSaving}>
                        {schemaSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        {schemaSaving ? 'Saving…' : 'Save details'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Link hub — the client's own URLs, collapsed by default (mirrors Schema markup). */}
          {!isDraining && liveTally.done > 0 && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowLinks((s) => !s)}
                className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/50"
              >
                <span className="text-sm font-semibold">
                  Link hub
                  <span className="ml-1.5 font-normal text-muted-foreground">· {clientLinks.length} {clientLinks.length === 1 ? 'link' : 'links'}</span>
                </span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showLinks ? 'rotate-180' : ''}`} />
              </button>
              {showLinks && (
                <Card>
                  <CardContent className="p-4 sm:p-5 space-y-3">
                    <p className="text-sm text-muted-foreground">Store this client's own links — Wix login, Companies House, Google Business Profile, live site — so they're always to hand.</p>
                    <div className="space-y-2">
                      {clientLinks.map((link, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <Input
                            className="sm:max-w-[12rem]"
                            value={link.label}
                            placeholder="Label"
                            onChange={(e) => setClientLinks((prev) => prev.map((x, xi) => xi === i ? { ...x, label: e.target.value } : x))}
                          />
                          <Input
                            value={link.url}
                            placeholder="https://…"
                            onChange={(e) => setClientLinks((prev) => prev.map((x, xi) => xi === i ? { ...x, url: e.target.value } : x))}
                          />
                          <Button variant="ghost" size="icon" onClick={() => copyLink(link.url, i)} title="Copy URL" disabled={!link.url.trim()}>
                            {linkCopiedIdx === i ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => setClientLinks((prev) => prev.filter((_, xi) => xi !== i))} title="Remove">
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <Button variant="outline" size="sm" onClick={() => setClientLinks((prev) => [...prev, { label: '', url: '' }])}>
                        <Plus className="mr-1 h-4 w-4" /> Add link
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={saveClientLinks} disabled={linksSaving}>
                        {linksSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        {linksSaving ? 'Saving…' : 'Save links'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Detailed per-question results — collapsed by default behind one toggle. */}
          {!isDraining && queueRows.length > 0 && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowDetails((s) => !s)}
                className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-muted/50"
              >
                <span className="text-sm font-semibold">
                  Detailed results
                  <span className="ml-1.5 font-normal text-muted-foreground">· {queueRows.length} {queueRows.length === 1 ? 'question' : 'questions'}</span>
                </span>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${showDetails ? 'rotate-180' : ''}`} />
              </button>
              {showDetails && queueRows.map((row) => (
                <QuestionCard key={row.id} row={row} businessName={resultsBusinessName} />
              ))}
            </div>
          )}
          {queueRows.length === 0 && !isDraining && (
            <p className="text-sm text-muted-foreground">No results yet.</p>
          )}
        </div>
      )}
    </div>
  );
};

/* ── Delivery checklist — one ordered, tickable action list from the playbook ──────
 * A system "Setup" group (audit run; SEO added when the business has a website), then the
 * playbook's single ordered action list — shown ALL AT ONCE (no week-by-week gating), already
 * sorted highest-leverage first (slow-burn start-now work at the top of each tier). Each item
 * ticks independently; progress = ticked / total. */
type ChecklistItem = { key: string; text: string; autoDone?: boolean; priority?: 'high' | 'medium' | 'low'; leadTime?: 'fast' | 'medium' | 'slow' };

function DeliveryChecklist({ playbook, hasWebsite, hasSeo, state, onToggle, onGeneratePlaybook, generating }: {
  playbook: PlaybookData | null;
  hasWebsite: boolean;
  hasSeo: boolean;
  state: Record<string, boolean>;
  onToggle: (key: string) => void;
  onGeneratePlaybook: () => void;
  generating: boolean;
}) {
  // Setup group (system-known items). "SEO data added" only when the business has a website;
  // audit-run + SEO auto-tick from known state (autoDone) until the user overrides them.
  const setupItems: ChecklistItem[] = [{ key: 'sys:auditrun', text: 'AI visibility audit run', autoDone: true }];
  if (hasWebsite) setupItems.push({ key: 'sys:seo', text: 'Website SEO data added', autoDone: hasSeo });

  // The single ordered action list (code-sorted by the generator: priority then leadTime).
  const actionItems: ChecklistItem[] = (playbook?.actions ?? []).map((a, i) => ({
    key: `act:${i}`, text: a.action, priority: a.priority, leadTime: a.leadTime,
  }));

  const isTicked = (it: ChecklistItem) => state[it.key] ?? it.autoDone ?? false;
  const allItems = [...setupItems, ...actionItems];
  const doneCount = allItems.filter(isTicked).length;
  const allDone = !!playbook && allItems.length > 0 && doneCount === allItems.length;

  const leadLabel: Record<string, string> = { fast: 'Fast', medium: 'Weeks', slow: 'Slow-burn · start now' };
  const renderRow = (it: ChecklistItem, showTags: boolean) => {
    const done = isTicked(it);
    return (
      <button key={it.key} onClick={() => onToggle(it.key)}
        className="w-full flex items-start gap-2.5 text-left rounded-md px-1 py-1 hover:bg-muted/50 transition-colors">
        <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${done ? 'bg-[hsl(var(--badge-closed))] border-transparent' : 'border-border'}`}>
          {done && <Check className="h-3 w-3 text-white" />}
        </span>
        <span className={`flex-1 text-sm ${done ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{it.text}</span>
        {showTags && (it.leadTime === 'slow' || it.priority === 'high') && (
          <span className="mt-0.5 flex shrink-0 items-center gap-1">
            {it.leadTime === 'slow' && (
              <span className="rounded-full bg-[hsl(var(--badge-waiting))]/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[hsl(var(--badge-waiting))] whitespace-nowrap">{leadLabel.slow}</span>
            )}
            {it.priority === 'high' && (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary">High</span>
            )}
          </span>
        )}
      </button>
    );
  };

  return (
    <Card>
      <CardContent className="p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Delivery</div>
          {playbook && <div className="text-[11px] text-muted-foreground">{doneCount}/{allItems.length} done</div>}
        </div>

        {/* Setup (baseline) — always shown */}
        <div className="rounded-lg border border-border/60 bg-card/60 px-3 py-3 space-y-2">
          <div className="text-sm font-semibold">Setup<span className="text-muted-foreground font-normal"> · Baseline captured</span></div>
          <div className="space-y-1">{setupItems.map((it) => renderRow(it, false))}</div>
        </div>

        {/* Ordered delivery actions — ALL shown at once, highest-leverage first */}
        {playbook && actionItems.length > 0 && (
          <div className="rounded-lg border border-primary/50 bg-card/60 px-3 py-3 space-y-2">
            <div>
              <div className="text-sm font-semibold">Delivery plan</div>
              <div className="text-[11px] text-muted-foreground">Ordered by leverage — highest-impact first</div>
            </div>
            <div className="space-y-1">{actionItems.map((it) => renderRow(it, true))}</div>
          </div>
        )}

        {!playbook && (
          <div className="rounded-lg border border-dashed border-border/60 bg-card/40 px-4 py-4 text-center space-y-2">
            <div className="text-sm font-medium">Generate the playbook to build the delivery checklist</div>
            <div className="text-[11px] text-muted-foreground">The prioritised action list becomes your tickable delivery steps.</div>
            <Button size="sm" onClick={onGeneratePlaybook} disabled={generating}>
              {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MapIcon className="mr-2 h-4 w-4" />}
              {generating ? 'Generating…' : 'Generate playbook'}
            </Button>
          </div>
        )}

        {allDone && (
          <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-2">
            <Check className="h-4 w-4 text-[hsl(var(--badge-closed))]" />
            <span className="text-sm font-medium">All delivery actions complete.</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

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
// A single score tile for the opened-audit header. Colour-toned by outcome; optionally
// clickable (used for the "Add SEO data" empty state).
type TileTone = 'green' | 'amber' | 'red' | 'muted';
const TILE_TONE: Record<TileTone, string> = {
  green: 'border-[hsl(var(--badge-closed))]/30 bg-[hsl(var(--badge-closed))]/10 text-[hsl(var(--badge-closed))]',
  amber: 'border-[hsl(var(--badge-waiting))]/30 bg-[hsl(var(--badge-waiting))]/10 text-[hsl(var(--badge-waiting))]',
  red: 'border-[hsl(var(--badge-not-interested))]/30 bg-[hsl(var(--badge-not-interested))]/10 text-[hsl(var(--badge-not-interested))]',
  muted: 'border-border bg-muted/40 text-muted-foreground',
};
function ScoreTile({ label, value, sub, tone, onClick }: {
  label: string; value: string; sub?: string; tone: TileTone; onClick?: () => void;
}) {
  const cls = `rounded-lg border p-3.5 ${TILE_TONE[tone]} ${onClick ? 'text-left w-full transition-colors hover:bg-muted/60 cursor-pointer' : ''}`;
  const body = (
    <>
      <div className="text-[11px] font-semibold uppercase tracking-wider opacity-80">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums leading-none">{value}</div>
      {sub && <div className="mt-1.5 text-xs opacity-80">{sub}</div>}
    </>
  );
  return onClick ? <button type="button" onClick={onClick} className={cls}>{body}</button> : <div className={cls}>{body}</div>;
}

// Grade → tone for the SEO tile. A/B are strong, C is middling, D/E/F are weak.
function gradeTone(grade: string): TileTone {
  const g = (grade || '').trim().charAt(0).toUpperCase();
  if (g === 'A' || g === 'B') return 'green';
  if (g === 'C') return 'amber';
  if (g === 'D' || g === 'E' || g === 'F') return 'red';
  return 'muted';
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
