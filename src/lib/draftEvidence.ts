/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WHAT A REPLY DRAFT MAY SAY ABOUT THE AUDIT AND THE SITE (2026-10-11, Paul) — one leaf, read by BOTH
   drafters: fn ai-reply-drafts (aiReplyDraft.ts, the switch) and fn warm-lead-reply (warmReply.ts,
   the Inbox's "Draft reply" button).

   Why it exists: the Safety First Electrical draft said "it named a few other businesses" and "found
   some things we could fix" while the audit had recorded nine named rivals and the crawl had called the
   site strong. The warm prompt never passed the names on (it assumed the hook had already gone), and
   nothing refused a vague fault claim. Every rule below closes one of those doors.

   ⛔ NAMES: at most DRAFT_MAX_NAMES, one per business (hookAudit.distinctNames — the report's own
      "two spellings of one firm count once" rule), only names the audit recorded. None readable →
      "a few other businesses", never an invented name.
   ⛔ ENGINE WORDS: said the way the call script says them (hookScore.HOOK_SPOKEN_ENGINE_LABELS,
      lower-cased for a text): "gemini" / "chatgpt", never "google ai" (Paul, 2026-10-13).
   ⛔ ONE ENGINE PER CONVERSATION (conversationEngine, Paul 2026-10-13): once we have sent a message
      that names an AI tool, every later draft names THAT tool; sent messages naming none → the engine
      the rival names came from; sent messages naming different tools, or no engine known → "ai".
   ⛔ SITE: a specific issue only when the stored crawl SAW it. Nothing found / failed / timed out /
      strong site → GENERIC_SITE_LINE, which claims no fault. "found some things" with nothing named
      is refused (vagueSiteClaim).

   Pure and edge-reachable: relative imports with .ts.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { distinctNames } from './hookAudit.ts';
import { HOOK_SPOKEN_ENGINE_LABELS } from './hookScore.ts';
import { TEMPLATE_SINGLE_ENGINE_CLAIM } from './rivalHook.ts';

export const DRAFT_MAX_NAMES = 3;

/** Up to three different businesses, first spelling kept, in the audit's order. */
export function draftNames(names: readonly string[] | null | undefined, town?: string | null): string[] {
  return distinctNames((names ?? []).map((n) => String(n ?? '').trim()).filter(Boolean), town ?? null).slice(0, DRAFT_MAX_NAMES);
}

/** The AI tool as a text says it: the engine the names came from ("gemini", "chatgpt"), else "ai".
 *  Accepts an engine key ("gemini") or a label ("Gemini", "Google AI"). */
export function draftEngineWords(engine: string | null | undefined): string {
  const e = String(engine ?? '').trim().toLowerCase();
  if (!e) return 'ai';
  if (e === 'google ai' || e === 'gemini') return HOOK_SPOKEN_ENGINE_LABELS.gemini.toLowerCase();
  if (e === 'chatgpt') return HOOK_SPOKEN_ENGINE_LABELS.chatgpt.toLowerCase();
  return 'ai';
}

/** "Google AI Overview(s)" is Google Search's own summary, not Gemini: blanked before reading engine words. */
const stripOverview = (t: string) => String(t ?? '').replace(/\b(?:google(?:['’]?s)?\s+)?ai\s+overviews?\b/gi, ' ');
const SAYS_CHATGPT = /\bchat\s?gpt\b/i;
/* "googleAI" (the hook's spelling, 2026-10-27) as well as "google ai". */
const SAYS_GEMINI = /\bgemini\b|\bgoogle(?:['’]?s)?\s*ai\b/i;

/** The one AI tool a message we SENT named: 'chatgpt' / 'gemini', else null (named none, or both — a
 *  "tools like chatgpt and gemini" line claims neither). A template whose text is not on hand falls back
 *  to the tool its approved body claims (rivalHook.TEMPLATE_SINGLE_ENGINE_CLAIM: audit_followup → chatgpt). */
export function engineNamedIn(text: string | null | undefined, templateName?: string | null): 'chatgpt' | 'gemini' | null {
  const t = stripOverview(String(text ?? ''));
  const c = SAYS_CHATGPT.test(t);
  const g = SAYS_GEMINI.test(t);
  if (c !== g) return c ? 'chatgpt' : 'gemini';
  if (c && g) return null;
  const claim = templateName ? TEMPLATE_SINGLE_ENGINE_CLAIM[templateName] : undefined;
  return claim === 'chatgpt' || claim === 'gemini' ? claim : null;
}

export interface ConversationEngine {
  /** As a text says it: "gemini" / "chatgpt" / "ai". */
  words: string;
  /** Why: a message we already sent named it; the audit's names came from it; or not sure → "ai". */
  source: 'sent_message' | 'audit' | 'unsure';
}

/** ONE ENGINE PER CONVERSATION (Paul, 2026-10-13). The AI tool a draft names: the one our sent messages
 *  already named (they must agree); none named → the engine the rival names came from; sent messages
 *  naming different tools, or no engine known → "ai". Never mixes two tools in one conversation. */
export function conversationEngine(
  sent: ReadonlyArray<{ text: string | null | undefined; templateName?: string | null }>,
  auditEngine: string | null | undefined,
): ConversationEngine {
  const named = new Set(sent.map((m) => engineNamedIn(m.text, m.templateName)).filter((e): e is 'chatgpt' | 'gemini' => e !== null));
  if (named.size === 1) return { words: draftEngineWords([...named][0]), source: 'sent_message' };
  if (named.size > 1) return { words: 'ai', source: 'unsure' };
  const w = draftEngineWords(auditEngine);
  return { words: w, source: w === 'ai' ? 'unsure' : 'audit' };
}

/** "aI tools" never: lower-case a line's first letter to carry on a sentence, but leave an acronym
 *  ("AI", "SEO", "HTTPS") and the pronoun "I" alone. Drops one trailing full stop. */
export function carryOn(s: string): string {
  const t = String(s ?? '').trim().replace(/\.$/, '');
  const first = (t.match(/^[^\s,.;:!?]+/)?.[0] ?? '').replace(/['’]s$/, '');
  if (/^I(?:['’][a-z]+)?$/.test(first) || /^[A-Z0-9]{2,}$/.test(first.replace(/[^A-Za-z0-9]/g, ''))) return t;
  return t.charAt(0).toLowerCase() + t.slice(1);
}

export const joinDraftNames = (n: readonly string[]): string =>
  (n.length <= 1 ? (n[0] ?? '') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`);

/** "electrician in Rotherham" → "an electrician in Rotherham" (a leading a / an / the is replaced). */
export function withArticle(search: string): string {
  const s = String(search ?? '').trim().replace(/^(?:an?|the)\s+/i, '');
  return s ? `${/^[aeiou]/i.test(s) ? 'an' : 'a'} ${s}` : s;
}

/** The audit's trade + town as a person says the search: "Electricians" + "Rotherham UK" →
 *  "electrician in Rotherham" (no article; withArticle adds one). Null without a trade. */
export function draftSearch(trade: string | null | undefined, town: string | null | undefined): string | null {
  const raw = String(trade ?? '').trim().toLowerCase().replace(/^(?:an?|the)\s+/i, '');
  if (!raw) return null;
  const t = raw.replace(/ies$/, 'y').replace(/(?<!s)s$/, '');
  const place = String(town ?? '').trim().replace(/,?\s*\b(?:UK|United Kingdom)$/i, '').trim();
  return place ? `${t} in ${place}` : t;
}

/** "i asked google ai for an electrician in rotherham and it recommended A, B and C" — or, with no
 *  readable names, "…and it named a few other businesses". `search` is "electrician in rotherham". */
export function namesLine(engineWords: string, search: string | null, names: readonly string[]): string {
  const what = search ? withArticle(search) : 'your trade in your area';
  return names.length
    ? `i asked ${engineWords} for ${what} and it recommended ${joinDraftNames(names)}`
    : `i asked ${engineWords} for ${what} and it named a few other businesses`;
}

/** The line used when the crawl found nothing to say, failed, timed out, or the site is strong.
 *  It claims no fault. */
export const GENERIC_SITE_LINE =
  "ai tools tend to favour sites that make it really clear who you are, where you work and why people should trust you, and that's what we help with";

/** No website of their own on file: what is true without claiming AI never names them (coldCallPlaybook's rule). */
export const NO_SITE_LINE =
  "without a site of your own there's a lot less for ai tools to go on about what you do and where you work, and that's what we help with";

/** The offer: both routes, never "everyone needs a new site". It follows the GENERAL LINE ("…that's what
 *  we help with"), so "help with that" has something to point at. */
/* v5 (2026-10-16): one plan, a new website. Never offer to work on the site they already have (Optimise is withdrawn). */
export const OFFER_LINE_BOTH = "we can help with that by building you a new website that's properly set up for ai visibility and seo, and you keep your web address";
/** The offer when the line before it named real website issues: it joins on to them, never "do that". */
export const OFFER_LINE_AFTER_ISSUES = "that's the sort of thing we fix, by building you a new website that's properly set up for ai visibility and seo";
export const OFFER_LINE_NEW = "we can build you a site that's properly set up for ai visibility and seo";
/** The offer for what came before it: no site → build one; real issues named → OFFER_LINE_AFTER_ISSUES; else OFFER_LINE_BOTH. */
export function offerLine(hasWebsite: boolean, issuesNamed: boolean): string {
  return !hasWebsite ? OFFER_LINE_NEW : issuesNamed ? OFFER_LINE_AFTER_ISSUES : OFFER_LINE_BOTH;
}

/** The two routes as a draft says them (also warmReply's checks — one copy). */
export const ROUTE_EXISTING_RE = /\b(site|website) you(?:['’]ve| have)? (?:already )?got\b|\b(?:current|existing) (?:web)?site\b|\bsite you already have\b|\byour (?:current )?(?:web)?site as it is\b|\bon (?:the|your) (?:current )?(?:web)?site\b/i;
export const ROUTE_NEW_RE = /\bnew (?:one|site|website)\b|\bbuild (?:you )?(?:a|one|a new)\b|\brebuild\b/i;
/** Does the draft make the offer? v5 (2026-10-16): ONE plan, a new website, whether or not they have a site today
 *  (Findable Optimise, "on the site you've already got", is withdrawn). `hasWebsite` is kept for the callers. */
export function offersRoutes(text: string, _hasWebsite: boolean): boolean {
  return ROUTE_NEW_RE.test(String(text ?? ''));
}

/** "found some things", "spotted a few issues", "some things we could fix" — a fault claim with no fault named. */
const VAGUE_SITE_CLAIM = /\b(?:found|spotted|noticed|saw|seen|picked up(?: on)?)\s+(?:some|a few|a couple of|several|a number of|loads of|lots of|a lot of)\s+(?:things|issues|problems|bits|areas|stuff)\b|\b(?:some|a few|a couple of)\s+(?:things|issues|problems|bits)\s+(?:we|i)\s+(?:could|can|would)\s+(?:fix|improve|sort|tidy)\b/i;
export function vagueSiteClaim(text: string): boolean {
  return VAGUE_SITE_CLAIM.test(String(text ?? '').replace(/[’‘]/g, "'"));
}

const sig = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 5);
/** Does the draft talk about this issue? Two of its longer words appear in the text (both drafters' rule). */
export function issueMentioned(text: string, f: { title: string; said: string }): boolean {
  const t = String(text ?? '').toLowerCase();
  return sig(`${f.title} ${f.said}`).filter((w) => t.includes(w)).length >= 2;
}

/** The draft names a different AI tool from the one this conversation uses (conversationEngine). With
 *  "ai" (not sure), saying it asked one particular tool is the wrong claim. */
export function wrongEngineWords(text: string, engineWords: string): boolean {
  const t = stripOverview(String(text ?? '').toLowerCase());
  if (engineWords === 'gemini' || engineWords === 'google ai') return SAYS_CHATGPT.test(t);
  if (engineWords === 'chatgpt') return SAYS_GEMINI.test(t);
  return /\b(?:asked|checked|tried|searched)\s+(?:on\s+)?(?:chat\s?gpt|gemini|google(?:['’]?s)?\s*ai)\b/.test(t);
}

/** "google ai" for Gemini (not the AI Overview): the old wording — say "gemini" (Paul, 2026-10-13). */
export function saysGoogleAiForGemini(text: string): boolean {
  return /\bgoogle(?:['’]?s)?\s*ai\b/i.test(stripOverview(String(text ?? '')));
}

/** Does the draft name at least one of the businesses it was given? */
export function namesAny(text: string, names: readonly string[]): boolean {
  const t = String(text ?? '').toLowerCase();
  return names.some((n) => n.trim().length >= 3 && t.includes(n.trim().toLowerCase()));
}
