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
      lower-cased for a text): the engine the names were read from. Unknown → "ai".
   ⛔ SITE: a specific issue only when the stored crawl SAW it. Nothing found / failed / timed out /
      strong site → GENERIC_SITE_LINE, which claims no fault. "found some things" with nothing named
      is refused (vagueSiteClaim).

   Pure and edge-reachable: relative imports with .ts.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { distinctNames } from './hookAudit.ts';
import { HOOK_SPOKEN_ENGINE_LABELS } from './hookScore.ts';

export const DRAFT_MAX_NAMES = 3;

/** Up to three different businesses, first spelling kept, in the audit's order. */
export function draftNames(names: readonly string[] | null | undefined, town?: string | null): string[] {
  return distinctNames((names ?? []).map((n) => String(n ?? '').trim()).filter(Boolean), town ?? null).slice(0, DRAFT_MAX_NAMES);
}

/** The AI tool as a text says it: the engine the names came from ("google ai" for Gemini, "chatgpt"),
 *  else "ai". Accepts an engine key ("gemini") or a label ("Gemini", "Google AI"). */
export function draftEngineWords(engine: string | null | undefined): string {
  const e = String(engine ?? '').trim().toLowerCase();
  if (!e) return 'ai';
  if (e === 'google ai' || e === 'gemini') return HOOK_SPOKEN_ENGINE_LABELS.gemini.toLowerCase();
  if (e === 'chatgpt') return HOOK_SPOKEN_ENGINE_LABELS.chatgpt.toLowerCase();
  return 'ai';
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

/** The offer: both routes, never "everyone needs a new site". */
export const OFFER_LINE_BOTH = "we can do that on the site you've already got, or build you a new one that's properly set up for ai visibility and seo";
export const OFFER_LINE_NEW = "we can build you a site that's properly set up for ai visibility and seo";

/** The two routes as a draft says them (also warmReply's checks — one copy). */
export const ROUTE_EXISTING_RE = /\b(site|website) you(?:['’]ve| have)? (?:already )?got\b|\b(?:current|existing) (?:web)?site\b|\bsite you already have\b|\byour (?:current )?(?:web)?site as it is\b|\bon (?:the|your) (?:current )?(?:web)?site\b/i;
export const ROUTE_NEW_RE = /\bnew (?:one|site|website)\b|\bbuild (?:you )?(?:a|one|a new)\b|\brebuild\b/i;
/** Does the draft make the offer: both routes when they have a site, building one when they do not. */
export function offersRoutes(text: string, hasWebsite: boolean): boolean {
  const t = String(text ?? '');
  return hasWebsite ? ROUTE_EXISTING_RE.test(t) && ROUTE_NEW_RE.test(t) : ROUTE_NEW_RE.test(t);
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

/** The draft names a different AI tool from the one the names were read from. */
export function wrongEngineWords(text: string, engineWords: string): boolean {
  const t = String(text ?? '').toLowerCase();
  if (engineWords === 'google ai') return /\bchat ?gpt\b/.test(t);
  if (engineWords === 'chatgpt') return /\b(?:google ai|gemini)\b/.test(t);
  return false;
}

/** Does the draft name at least one of the businesses it was given? */
export function namesAny(text: string, names: readonly string[]): boolean {
  const t = String(text ?? '').toLowerCase();
  return names.some((n) => n.trim().length >= 3 && t.includes(n.trim().toLowerCase()));
}
