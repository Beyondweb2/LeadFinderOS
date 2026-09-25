/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WARM REPLY — the draft Paul reviews before answering a prospect who replied (2026-09-25).

   ⛔ THIS NEVER SENDS. It produces TEXT for the Inbox composer. Paul edits it and presses Send, and
      the send goes through `send-whatsapp-message` exactly as a typed reply does — same 24-hour
      window check, same daily cap, same ownership check. Nothing here can reach Meta.

   THE ORDER OF A REPLY (the brief's §3, and the reason the latest inbound is quoted first in the
   prompt): answer THEIR message → the strongest relevant findings → one simple next step. A pitch
   that ignores the question they just asked is the failure this file exists to prevent.

   ⛔ THE OFFER IS READ FROM findableOffer.ts, NEVER RETYPED. The model is handed
      FINDABLE_OFFER_SUMMARY and FINDABLE_GUARANTEE verbatim, and `checkReply` refuses a draft that
      names any other price. Change the offer there and every draft follows.

   ⛔ SALES FACTS ARE WHAT THE PROSPECT SAID, NOT WHAT WE GUESS. A fact is kept only when its quote is
      found, verbatim, in one of THEIR inbound messages. Facts live on the research row and are never
      written onto the lead, the onboarding record or anything a client-facing surface reads.

   Pure and edge-reachable (relative `.ts` imports only).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  FINDABLE_OFFER_SUMMARY, FINDABLE_GUARANTEE, FINDABLE_SETUP_PRICE_GBP, FINDABLE_MONTHLY_GBP,
  FINDABLE_CONTRACT_TOTAL_GBP, REPORT_PUBLIC_ORIGIN,
} from './findableOffer.ts';
import {
  normaliseForMatch, MIN_QUOTE_CHARS, MIN_SALES_STRENGTH, rankFindings, findingScore,
  type AuditContext, type ResearchFinding, type WarmLeadResearch,
} from './warmLeadResearch.ts';

export const REPLY_MODEL = 'gpt-4o-mini';
/** Messages of history the model sees (oldest dropped first). */
export const REPLY_THREAD_MESSAGES = 20;
/** Characters per historic message in the prompt. */
export const REPLY_MESSAGE_CHARS = 900;
/** A draft longer than this gets an operator warning — WhatsApp, not an audit report. */
export const REPLY_SOFT_MAX_CHARS = 900;
/** The public page a reply points at for "full details". */
export const FINDABLE_DETAILS_URL = `${REPORT_PUBLIC_ORIGIN}/`;

/* ─────────────────────────────── the thread ─────────────────────────────── */

export interface ThreadMessage {
  id: string | null;
  direction: 'inbound' | 'outbound';
  text: string;
  at: string;
}

/** Their newest message that carries words. A photo with no caption still counts as "they replied",
 *  but there is nothing to answer, so it is described rather than skipped. */
export function latestInbound(thread: ThreadMessage[]): ThreadMessage | null {
  const inbound = thread.filter((m) => m.direction === 'inbound').sort((a, b) => b.at.localeCompare(a.at));
  return inbound[0] ?? null;
}

/* ─────────────────────────────── what they asked ─────────────────────────────── */

export type WarmQuestionType =
  | 'not_interested' | 'price' | 'existing_provider' | 'show_changes' | 'how_it_works'
  | 'call_request' | 'ownership_answer' | 'tell_me_more' | 'other';
export const WARM_QUESTION_TYPES: readonly WarmQuestionType[] = [
  'not_interested', 'price', 'existing_provider', 'show_changes', 'how_it_works',
  'call_request', 'ownership_answer', 'tell_me_more', 'other',
];

const Q_RULES: ReadonlyArray<[WarmQuestionType, RegExp]> = [
  ['not_interested', /\b(not interested|no thanks|no thank you|not for us|not for me|stop messaging|unsubscribe|remove me|don'?t (?:message|contact|text) me|leave me alone)\b|^\s*stop\s*$/i],
  ['price', /\b(how much|price|prices|pricing|cost|costs|costing|charge|charges|fee|fees|monthly|per month|a month|what do you charge|quote me)\b|£/i],
  ['existing_provider', /\b(already|currently)\b.{0,40}\b(seo|someone|somebody|a company|an agency|a guy|web ?designer|marketing|google ads)\b|\b(i|we)\s+(?:have|'ve got|got|use|pay)\s+(?:someone|somebody|a (?:company|guy|firm|bloke|lad)|an agency)\b/i],
  ['show_changes', /\b(what (?:would|will|do) you (?:change|do|fix)|show me|an example|what'?s wrong|what is wrong|what did you (?:find|see|notice)|what problems?|which (?:bits|parts))\b/i],
  ['how_it_works', /\b(how (?:does|do|would|will) (?:it|this|that|you) work|what (?:is|does) (?:this|it|findable)|what do you (?:actually )?do|explain|what'?s involved|what is involved)\b/i],
  ['call_request', /\b(call me|ring me|give me a (?:call|ring|bell)|phone me|can you (?:call|ring)|rather (?:talk|speak) on the phone|have a chat)\b/i],
  ['ownership_answer', /\b(?:i|we)\s+(?:do\s+)?(?:own|control)\b|\b(?:it'?s|its|the (?:web)?site is)\s+(?:mine|ours|my own)\b|\b(?:built|managed|hosted|done|looked after)\s+by\s+(?:a|an|the|my|our)\b/i],
  ['tell_me_more', /\b(tell me more|more info|more information|more details|go on|sounds (?:good|interesting)|interested|send (?:me )?(?:more|details|info|it)|yes please|keen)\b/i],
];

/** Keyword rules for what their message is about — a HINT for the model and the basis of the
 *  checks below, never the reply itself. `primary` follows the order above: a refusal outranks a
 *  price question in the same message. */
export function classifyInbound(text: string | null | undefined): { primary: WarmQuestionType; all: WarmQuestionType[] } {
  const t = (text ?? '').trim();
  const all = Q_RULES.filter(([, re]) => re.test(t)).map(([k]) => k);
  // "not interested" contains "interested": the refusal wins and the positive is dropped.
  const cleaned = all.includes('not_interested') ? all.filter((k) => k !== 'tell_me_more') : all;
  return { primary: cleaned[0] ?? 'other', all: cleaned.length ? cleaned : ['other'] };
}

/** May this reply carry the report link? Only when they asked for it, or asked what we found /
 *  what we'd change (the report is the evidence). A price question never gets it by default. */
export function reportUrlAllowed(text: string | null | undefined, types: WarmQuestionType[]): boolean {
  if (/\b(report|results?|the link|your link|send (?:it|me it)|resend|check|the audit|what you found)\b/i.test(text ?? '')) return true;
  return types.includes('show_changes');
}

/* ─────────────────────────────── sales memory ─────────────────────────────── */

export type SalesFactKey = 'owns_website' | 'has_existing_provider' | 'interested_in_rebuild' | 'requested_price' | 'prefers_call' | 'not_interested';
export const SALES_FACT_KEYS: readonly SalesFactKey[] = ['owns_website', 'has_existing_provider', 'interested_in_rebuild', 'requested_price', 'prefers_call', 'not_interested'];
export const SALES_FACT_LABELS: Record<SalesFactKey, string> = {
  owns_website: 'Owns / controls the website',
  has_existing_provider: 'Has an existing provider',
  interested_in_rebuild: 'Interested in a rebuild',
  requested_price: 'Asked the price',
  prefers_call: 'Prefers a call',
  not_interested: 'Said not interested',
};

export interface SalesFact {
  value: 'yes' | 'no';
  /** Their words, verbatim, that the fact rests on. */
  quote: string;
  messageId: string | null;
  at: string;
  source: 'rule' | 'model';
}
export type SalesFacts = Partial<Record<SalesFactKey, SalesFact>>;

export interface SalesFactProposal { key: string; value: string; quote: string; messageId?: string | null; source: 'rule' | 'model' }

const FACT_RULES: ReadonlyArray<{ key: SalesFactKey; value: 'yes' | 'no'; re: RegExp }> = [
  { key: 'owns_website', value: 'no', re: /\b(?:i|we)\s+(?:don'?t|do not|dont)\s+(?:own|control)\s+(?:the|my|our|it)\b[^.?!]*/i },
  { key: 'owns_website', value: 'yes', re: /\b(?:i|we)\s+(?:do\s+)?(?:own|control)\s+(?:the|my|our)\s+(?:web\s*site|site)\b[^.?!]*|\b(?:it'?s|its|the (?:web)?site is)\s+(?:mine|ours|my own)\b[^.?!]*/i },
  { key: 'has_existing_provider', value: 'yes', re: /\b(?:already|currently)\b.{0,40}\b(?:seo|someone|somebody|a company|an agency|a guy|web ?designer|marketing)\b[^.?!]*|\b(?:i|we)\s+(?:have|'ve got|got|use|pay)\s+(?:someone|somebody|a (?:company|guy|firm|bloke|lad)|an agency)\b[^.?!]*/i },
  { key: 'prefers_call', value: 'yes', re: /\b(?:call me|ring me|give me a (?:call|ring|bell)|phone me|can you (?:call|ring)|rather (?:talk|speak) on the phone)\b[^.?!]*/i },
  { key: 'not_interested', value: 'yes', re: /\b(?:not interested|no thanks|no thank you|not for us|stop messaging|unsubscribe|remove me)\b[^.?!]*/i },
];

/** Facts stated plainly enough for a keyword rule, one proposal per match, with the matched words
 *  as the quote. The price request is the classifier's price rule. */
export function ruleSalesFacts(inbound: ThreadMessage[]): SalesFactProposal[] {
  const out: SalesFactProposal[] = [];
  for (const m of inbound) {
    if (m.direction !== 'inbound' || !m.text) continue;
    const taken = new Set<SalesFactKey>();
    for (const r of FACT_RULES) {
      if (taken.has(r.key)) continue;
      const hit = m.text.match(r.re);
      if (hit) { out.push({ key: r.key, value: r.value, quote: hit[0].trim(), messageId: m.id, source: 'rule' }); taken.add(r.key); }
    }
    const price = m.text.match(/\b(?:how much|price|pricing|cost|costs|what do you charge)\b[^.?!]*/i);
    if (price) out.push({ key: 'requested_price', value: 'yes', quote: price[0].trim(), messageId: m.id, source: 'rule' });
  }
  return out;
}

/**
 * Merge proposed facts into what we already hold. A proposal survives only when:
 *   · its key is one we keep and its value is yes/no;
 *   · its quote (normalised, at least MIN_QUOTE_CHARS) appears in an INBOUND message — the message it
 *     names if it names one, otherwise any — so a fact can never rest on our own words or on nothing;
 *   · it is not older than the fact it would replace (a later "actually I don't own it" wins).
 * Rejections are returned so the operator can see what was not believed.
 */
export function mergeSalesFacts(existing: SalesFacts | null | undefined, proposals: SalesFactProposal[], inbound: ThreadMessage[]): { facts: SalesFacts; changed: SalesFactKey[]; rejected: string[] } {
  const facts: SalesFacts = { ...(existing ?? {}) };
  const changed: SalesFactKey[] = [];
  const rejected: string[] = [];
  const theirs = inbound.filter((m) => m.direction === 'inbound' && m.text);
  for (const p of proposals) {
    const key = p.key as SalesFactKey;
    if (!SALES_FACT_KEYS.includes(key) || (p.value !== 'yes' && p.value !== 'no')) { rejected.push(`${p.key}: not a fact we keep`); continue; }
    const q = normaliseForMatch(p.quote ?? '');
    if (q.length < MIN_QUOTE_CHARS) { rejected.push(`${key}: quote too short to rely on ("${p.quote}")`); continue; }
    const pool = p.messageId ? theirs.filter((m) => m.id === p.messageId) : theirs;
    const msg = pool.find((m) => normaliseForMatch(m.text).includes(q)) ?? (p.messageId ? theirs.find((m) => normaliseForMatch(m.text).includes(q)) : undefined);
    if (!msg) { rejected.push(`${key}: "${p.quote}" is not in anything they sent`); continue; }
    const prev = facts[key];
    if (prev && prev.at > msg.at) continue;
    if (prev && prev.at === msg.at && prev.source === 'rule' && p.source === 'model') continue;
    if (prev && prev.value === p.value && prev.messageId === msg.id) continue;
    facts[key] = { value: p.value, quote: p.quote.trim().slice(0, 240), messageId: msg.id, at: msg.at, source: p.source };
    changed.push(key);
  }
  return { facts, changed, rejected };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 THE PRIMARY FINDING (Paul, 2026-09-25). The live drafts proved that a list of findings "you may
   use" is a list the model may ignore: it wrote "the opening hours aren't consistent" with
   "9AM–9PM / 9AM–9AM / Open 24 hours" in front of it. So, before the model writes:
     · every finding the research holds is pooled, de-duplicated and RANKED (findingScore —
       severity, sales relevance, specificity, confidence), whatever it came from: the live site,
       the full crawl, the crawl check or a model reading;
     · the best one is the PRIMARY finding — the model is told it MUST refer to it, with its concrete
       details — and up to two SECONDARY findings are offered as support;
     · `checkReply` then checks the draft actually says it (findingMentioned), and a draft that
       doesn't is sent back once and, failing again, shown to Paul as CHECK THIS DRAFT.
   ⛔ NOT a website finding, so never primary: the audit's AI-visibility result (it is the context
      the reply explains, carried in the AI VISIBILITY block) and the "built/hosted by" credit (a
      reason to ask about ownership, not a flaw in their site).
   ⛔ A finding Paul already put to them since the hook is not asked for again — the next best leads.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** A finding must score at least this to LEAD a reply. Below it (a vague title, one old copyright
 *  year) there is nothing specific enough to insist on, and the reply is not forced to use one. */
export const PRIMARY_MIN_SCORE = 17;
/** …and at least this to be offered as support. */
export const SECONDARY_MIN_SCORE = 14;
export const MAX_SECONDARY_FINDINGS = 2;
/** The questions where the strongest website finding must feature. A refusal, a request for a call
 *  or a plain "yes I own it" is answered on its own terms. */
export const PRIMARY_QUESTION_TYPES: ReadonlySet<WarmQuestionType> = new Set(['price', 'how_it_works', 'tell_me_more', 'show_changes', 'existing_provider', 'other']);
/** The words the operator sees when the primary finding is missing — the brief's own wording. */
export const PRIMARY_MISSING_PROBLEM = 'Strong website finding was not used.';
export const PRIMARY_REWRITE_INSTRUCTION = 'The previous response ignored the strongest evidence. Rewrite it while keeping it conversational and explicitly include the primary website finding, with its concrete details.';

const NOT_PRIMARY: ReadonlySet<string> = new Set(['ai_visibility', 'provider_attribution']);

export interface ReplySelection {
  primary: ResearchFinding | null;
  secondary: ResearchFinding[];
  /** Other findings strong enough to have led — shown to Paul as "Strong findings not used". */
  strongNotUsed: ResearchFinding[];
  /** Findings Paul has already put to them since the hook (skipped for the lead). */
  alreadyMentioned: ResearchFinding[];
}

/** Every finding the saved research holds, once each. */
export function pooledFindings(r: WarmLeadResearch | null | undefined): ResearchFinding[] {
  if (!r) return [];
  const seen = new Set<string>();
  return [...r.strongestFindings, ...r.technicalFindings, ...r.contentFindings, ...r.localVisibilityFindings]
    .filter((f) => { if (!f || seen.has(f.id)) return false; seen.add(f.id); return true; });
}

/** The details to keep: keyDetails, else evidence cut to something sayable. */
export function sayableDetails(f: ResearchFinding): string[] {
  const src = f.keyDetails?.length ? f.keyDetails : f.evidence;
  return src.filter((e) => !/^crawl check /.test(e)).map((e) => (e.length > 90 ? `${e.slice(0, 87).replace(/\s+\S*$/, '')}…` : e)).slice(0, 4);
}

const STOP = new Set(['about', 'their', 'there', 'which', 'would', 'could', 'pages', 'website', 'services', 'service', 'business', 'other', 'these', 'those', 'where', 'while', 'being']);
const flat = (s: string) => normaliseForMatch(s).replace(/\s+/g, '');

/**
 * Does this text clearly communicate the SUBSTANCE of the finding? Not word for word — but the
 * concrete part must be there: an actual time for the hours, "nationwide" plus the town for the
 * positioning, the page/noindex/other-site idea for the technical ones. "A few inconsistencies"
 * satisfies none of them, which is the point.
 */
export function findingMentioned(text: string, f: ResearchFinding, town?: string | null): boolean {
  const t = normaliseForMatch(text);
  const tf = flat(text);
  const details = f.keyDetails?.length ? f.keyDetails : f.evidence;
  switch (f.kind) {
    case 'hours_conflict': {
      const times = details.flatMap((d) => d.match(/\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)|24\s*(?:\/\s*7|hours)/gi) ?? []).map(flat);
      return /\b(hours|open|opening)\b/.test(t) && times.some((x) => tf.includes(x));
    }
    case 'positioning_conflict': {
      const wide = /\b(nationwide|national|across (the )?(uk|england|britain|country)|whole (country|of england)|all over|anywhere in the uk|uk wide)\b/.test(t);
      const localTown = town ? t.includes(normaliseForMatch(town)) : false;
      return wide && (localTown || /\b(local|based)\b/.test(t));
    }
    case 'missing_core_service_pages':
      return /\bpages?\b/.test(t) && /\b(plumb\w*|boiler\w*|emergenc\w*|heating|electric\w*|rewir\w*|locks?\w*|roof\w*|core services?|main services?|services? pages?)\b/.test(t);
    case 'contact_conflict':
      return /\b(numbers?)\b/.test(t) && /\b(different|several|multiple|three|four|3|4|two|2|don t match|do not match)\b/.test(t);
    case 'thin_or_duplicate':
      return /\b(very little|thin|few lines|not much|barely|same|identical|duplicate\w*|copies)\b/.test(t);
    case 'title_h1':
      return /\b(title|heading)\b/.test(t);
    case 'crawl_indexing': {
      const id = f.id;
      if (/noindex/.test(id)) return /\b(noindex|not to be (listed|shown|included)|left out|leave (it|them) out|hidden|excluded|out of (the )?(search )?results|not (listed|showing) in)\b/.test(t);
      if (/canonical/.test(id)) return /\b((another|different|other) (web ?site|site|domain|address)|main version|canonical)\b/.test(t);
      if (/sitemap/.test(id)) return /\bsitemap\b/.test(t);
      if (/robots|blocked|crawler/.test(id) || /block/i.test(f.title)) return /\b(block\w*|robots|shut out|locked out|keep\w* out|can t (get in|reach|read))\b/.test(t);
      if (/client_rendered|unreadable/.test(id) || /javascript/i.test(f.title)) return /\b(javascript|nearly empty|blank|no text|almost nothing)\b/.test(t);
      if (/broken/.test(id)) return /\b(broken|error|dead end|404|doesn t load|don t load)\b/.test(t);
      break;
    }
    default:
      break;
  }
  // Anything else (model findings, off-trade content, evidence): two of its significant words.
  const words = [...new Set(details.concat(f.title).flatMap((d) => normaliseForMatch(d).split(' ')).filter((w) => w.length >= 5 && !STOP.has(w)))];
  const hits = words.filter((w) => t.includes(w)).length;
  return words.length > 0 && hits >= Math.min(2, words.length);
}

/**
 * The deterministic choice made BEFORE the model writes. `thread` is used only to skip a finding
 * Paul has already put to them since the hook, so the next reply moves on rather than repeating.
 */
export function selectReplyFindings(r: WarmLeadResearch | null | undefined, thread: ThreadMessage[], town?: string | null, hookAt?: string | null): ReplySelection {
  const empty: ReplySelection = { primary: null, secondary: [], strongNotUsed: [], alreadyMentioned: [] };
  if (!r || r.status === 'failed' || r.status === 'no_website') return empty;
  const said = thread.filter((m) => m.direction === 'outbound' && (!hookAt || m.at > hookAt)).map((m) => m.text).join('\n');
  const eligible = rankFindings(pooledFindings(r).filter((f) => f.verified && f.strength >= MIN_SALES_STRENGTH && !NOT_PRIMARY.has(f.kind)));
  const alreadyMentioned = said ? eligible.filter((f) => findingMentioned(said, f, town)) : [];
  const fresh = eligible.filter((f) => !alreadyMentioned.includes(f));
  const primary = fresh.find((f) => findingScore(f) >= PRIMARY_MIN_SCORE) ?? null;
  const secondary: ResearchFinding[] = [];
  const kinds = new Set(primary ? [primary.kind] : []);
  for (const f of fresh) {
    if (secondary.length >= MAX_SECONDARY_FINDINGS || f === primary) continue;
    if (findingScore(f) < SECONDARY_MIN_SCORE || (kinds.has(f.kind) && f.kind !== 'crawl_indexing')) continue;
    if (!primary) break; // nothing strong enough to lead → nothing to support
    secondary.push(f); kinds.add(f.kind);
  }
  const strongNotUsed = fresh.filter((f) => f !== primary && !secondary.includes(f) && findingScore(f) >= PRIMARY_MIN_SCORE);
  return { primary, secondary, strongNotUsed, alreadyMentioned };
}

/** Where a finding came from, in Paul's words. */
export function findingSourceLabel(f: ResearchFinding): string {
  if (f.source === 'rule') return 'Live website';
  if (f.source === 'model') return 'Live website (read by AI, quote-checked)';
  if (f.source === 'audit') return 'AI audit';
  return f.id.startsWith('full:') ? 'Existing full crawl' : 'Existing crawl check';
}

/* ─────────────────────────────── what the reply should do ─────────────────────────────── */

/** Ask "do you own/control the site?" only when the research gives a reason AND they have not
 *  already answered it. No reason → never ask; answered → never ask again. */
export function shouldAskOwnership(research: WarmLeadResearch | null | undefined, facts: SalesFacts | null | undefined): boolean {
  if (facts?.owns_website) return false;
  return (research?.ownershipClues?.length ?? 0) > 0;
}

export interface ReplyContext {
  businessName: string | null;
  contactFirstName: string | null;
  trade: string | null;
  town: string | null;
  website: string | null;
  latest: ThreadMessage;
  thread: ThreadMessage[];
  question: { primary: WarmQuestionType; all: WarmQuestionType[] };
  research: WarmLeadResearch | null;
  audit: AuditContext | null;
  salesFacts: SalesFacts;
  askOwnership: boolean;
  reportUrl: string | null;
  allowReportUrl: boolean;
  /** The audit/competitor hook already sent (warmStage) — the reply must build on it, never resend it. */
  hookTemplate: string | null;
  /** Regenerate: 0 for the first draft, then 1, 2… with the previous draft to differ from. */
  variant: number;
  /** Paul has already sent something AFTER their latest message (derived, never passed in). */
  alreadyAnswered: boolean;
  /** When the hook went out (warmStage) — findings Paul raised after it are not asked for again. */
  hookAt?: string | null;
  /** The primary / secondary findings, chosen before the model writes (derived, never passed in). */
  selection: ReplySelection;
  /** Must this reply use the primary finding? (a primary exists AND the question calls for it) */
  primaryRequired: boolean;
  avoidText: string | null;
}

export function buildReplyContext(i: Omit<ReplyContext, 'question' | 'askOwnership' | 'allowReportUrl' | 'alreadyAnswered' | 'selection' | 'primaryRequired'>): ReplyContext {
  const question = classifyInbound(i.latest.text);
  const selection = selectReplyFindings(i.research, i.thread, i.town, i.hookAt ?? null);
  return {
    ...i,
    question,
    selection,
    primaryRequired: !!selection.primary && PRIMARY_QUESTION_TYPES.has(question.primary),
    alreadyAnswered: i.thread.some((m) => m.direction === 'outbound' && m.at > i.latest.at),
    askOwnership: shouldAskOwnership(i.research, i.salesFacts),
    allowReportUrl: !!i.reportUrl && reportUrlAllowed(i.latest.text, question.all),
  };
}

/* ─────────────────────────────── the prompt ─────────────────────────────── */

export const REPLY_SYSTEM_PROMPT = `You write WhatsApp replies for Paul, who runs Findable. A UK local business owner replied to Paul's cold WhatsApp message and Paul wants a draft reply. Paul reads and edits every draft before sending — you never send anything. Return ONLY structured data via the return_reply tool.

WHAT FINDABLE IS (use these facts, never contradict them):
- Findable measures how often AI assistants such as ChatGPT and Gemini name a business when people ask for that trade in that area, then works on what those tools read — the business's own website pages and its presence in the sources that get cited for that trade — and re-measures on the same questions after four weeks.
- There are two ways to work together: (A) Findable improves the client's EXISTING website, which stays theirs; or (B) Findable builds and hosts a NEW website under its website-build agreement. Never suggest Findable can take over, take down or own a client's existing site.
- PRICE, exactly: ${FINDABLE_OFFER_SUMMARY}
- GUARANTEE, exactly what it covers: ${FINDABLE_GUARANTEE} In plain words: if their measured AI visibility has not gone up at the four-week re-measure, they can claim back the first £${FINDABLE_SETUP_PRICE_GBP}.
- Full details live at ${FINDABLE_DETAILS_URL}

NEVER:
- promise or imply guaranteed rankings, recommendations, citations, leads, calls or customers;
- name any price other than £${FINDABLE_SETUP_PRICE_GBP} to start and £${FINDABLE_MONTHLY_GBP} a month (the £${FINDABLE_CONTRACT_TOTAL_GBP.toLocaleString('en-GB')} total only if they ask what it comes to);
- say "cancel any time", "no contract" or "no minimum" — there is a real 12-month minimum;
- add a hedge next to the guarantee ("the engines decide", "no one can promise");
- claim to know how an AI model decides ("AI can't see", "AI ignores", "AI reads it as"). Say "can make it harder", "may mean", "gives it less to go on";
- mention a website problem that is not in the FINDINGS list you are given, or state a finding more strongly than its detail does;
- resend or re-word the competitor/AI-check message Paul already sent, or list those competitors again — they have seen it and replied to it; this reply moves the conversation on;
- name a competitor who is not in the AI VISIBILITY block;
- call Paul a founder, CEO or agency; no signature, no "Kind regards".

HOW PAUL WRITES:
- Short, direct, normal British English. Friendly, not corporate. An occasional "mate" is fine; never gushing, never salesy.
- Usually 2 to 5 short paragraphs separated by a blank line. No bullet lists unless they explicitly asked for detail. No emojis, or one at most.
- ANSWER THEIR ACTUAL MESSAGE FIRST, in the first line. "How much?" gets the price in the first sentence. "How does it work?" gets what Findable does. "I already have someone doing SEO" gets a straight answer to that — what Findable measures is different from ranking work, and it can sit alongside it. "What would you change?" gets the findings.
- Then, only where it helps, two or three of the strongest FINDINGS that fit what they asked, in plain words, as something Paul noticed himself ("I had a look through your site as well…"). If no findings are provided, do not invent any — just answer them well.
- If the site research says the site is technically fine, do not suggest it is broken; talk about AI visibility and content instead.
- End with one simple next step or question. Do not ask something the conversation has already answered.
- If they said they are not interested: a short, polite, no-pressure close. Nothing else.
- Do not repeat what Paul already said earlier in the conversation word for word.

SALES FACTS: if their messages EXPLICITLY state one of these, return it in sales_facts with their exact words as the quote: owns_website, has_existing_provider, interested_in_rebuild, requested_price, prefers_call, not_interested. Values are "yes" or "no". Never guess; if it is not explicit, leave it out.`;

export const REPLY_TOOL = {
  type: 'function',
  function: {
    name: 'return_reply',
    description: 'Return the drafted WhatsApp reply and what it is based on.',
    parameters: {
      type: 'object',
      properties: {
        question_type: { type: 'string', enum: WARM_QUESTION_TYPES as unknown as string[] },
        question_summary: { type: 'string', description: 'One short line: what their latest message asks or says.' },
        reply: { type: 'string', description: 'The WhatsApp reply, ready for Paul to edit. Paragraphs separated by a blank line.' },
        findings_used: { type: 'array', items: { type: 'string' }, description: 'The ids of the FINDINGS the reply mentions.' },
        asked_ownership: { type: 'boolean' },
        included_report_url: { type: 'boolean' },
        sales_facts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string', enum: SALES_FACT_KEYS as unknown as string[] },
              value: { type: 'string', enum: ['yes', 'no'] },
              quote: { type: 'string' },
            },
            required: ['key', 'value', 'quote'],
            additionalProperties: false,
          },
        },
        operator_note: { type: 'string', description: 'Anything Paul should know before sending. Empty if nothing.' },
      },
      required: ['question_type', 'question_summary', 'reply', 'findings_used', 'asked_ownership', 'included_report_url', 'sales_facts', 'operator_note'],
      additionalProperties: false,
    },
  },
} as const;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
const hhmm = (iso: string) => { try { return new Date(iso).toISOString().slice(0, 16).replace('T', ' '); } catch { return iso; } };

export function buildReplyPrompt(ctx: ReplyContext): string {
  const r = ctx.research;
  const history = ctx.thread.slice(-REPLY_THREAD_MESSAGES)
    .map((m) => `[${m.direction === 'inbound' ? 'THEM' : 'PAUL'} ${hhmm(m.at)}] ${clip(m.text || '(no text)', REPLY_MESSAGE_CHARS)}`).join('\n');
  const facts = SALES_FACT_KEYS.filter((k) => ctx.salesFacts[k])
    .map((k) => `- ${k} = ${ctx.salesFacts[k]!.value} (they said: "${clip(ctx.salesFacts[k]!.quote, 160)}")`).join('\n') || '- (none yet)';

  let research: string;
  if (!r) {
    research = 'No website research is available. Do NOT mention anything about their website. Answer their message using the facts above.';
  } else if (r.status === 'no_website') {
    research = 'They have NO website on record. Do not critique a website. If it fits, mention Findable can build one (route B).';
  } else if (r.status === 'failed') {
    research = 'Their website could NOT be read. Do NOT mention any website problem. Answer their message using the facts above.';
  } else {
    const { primary, secondary } = ctx.selection;
    const concrete = (f: ResearchFinding) => sayableDetails(f).map((d) => `"${d}"`).join(' / ');
    research = [
      `Researched ${hhmm(r.generatedAt)} (${r.status}). ${r.businessSummary ?? ''}`.trim(),
      r.technicallyClean ? 'The site is technically fine — no technical fault was found. Do not say or suggest it is broken.' : '',
      primary
        ? [
          `PRIMARY FINDING — YOU MUST REFER TO THIS IN THE RESPONSE, keeping its concrete details:\n- [${primary.id}] ${primary.title}: ${primary.detail}\n  Concrete details to keep: ${concrete(primary)}`,
          secondary.length ? `SUPPORTING FINDINGS (optional, at most two, only if they fit):\n${secondary.map((f) => `- [${f.id}] ${f.title}: ${f.detail}\n  Concrete details: ${concrete(f)}`).join('\n')}` : '',
          'Say the finding the way Paul would, but keep the specifics (the actual times, the actual wording, the actual pages). Never water it down to "a few inconsistencies", "a few things we\'d improve" or "your site could be clearer".',
        ].filter(Boolean).join('\n')
        : 'No website finding is specific enough to lead with. Do NOT invent one. If it helps, explain the gap using the AI VISIBILITY result instead.',
      ctx.selection.alreadyMentioned.length ? `Paul has ALREADY told them about: ${ctx.selection.alreadyMentioned.map((f) => f.title).join('; ')} — do not repeat it.` : '',
      r.ownershipClues.length ? `Ownership clues: ${r.ownershipClues.join(' ')}` : '',
    ].filter(Boolean).join('\n');
  }

  let visibility = 'No AI-visibility check is available.';
  const a = ctx.audit;
  if (a?.namedEverywhere) visibility = 'Our check named them on every AI engine it tried. Do NOT say AI is missing them.';
  else if (a && a.totalDatapoints) {
    visibility = `Our AI check (${a.createdAt ? hhmm(a.createdAt) : 'date unknown'}): named in ${a.namedDatapoints ?? 0} of ${a.totalDatapoints} answers for ${a.trade ?? 'their trade'}${a.town ? ` in ${a.town}` : ''}.${a.competitors.length ? ` Also named: ${a.competitors.slice(0, 3).join(', ')}.` : ''}`;
  }

  const instructions = [
    ctx.hookTemplate
      ? 'STAGE: Paul has already sent them the AI check naming the businesses AI mentioned, and they have replied to it. Do NOT repeat that message or list those businesses again.'
      : '',
    ctx.askOwnership
      ? 'OWNERSHIP: the research suggests another company may build/host/manage their site. Ask, naturally, whether they own/control the current website or whether it is owned/managed by the company that built it.'
      : ctx.salesFacts.owns_website
        ? `OWNERSHIP: already answered (owns_website = ${ctx.salesFacts.owns_website.value}). Do NOT ask about it again; build on the answer.`
        : 'OWNERSHIP: no reason to ask. Do not ask who owns the site.',
    ctx.allowReportUrl && ctx.reportUrl
      ? `REPORT LINK: they asked for it or for what we found — you may include ${ctx.reportUrl}`
      : 'REPORT LINK: do NOT include the audit/report link in this reply.',
    ctx.question.primary === 'price' ? 'PRICE: their message asks about price — the FIRST sentence must give it, with both figures; then the four-week first-payment guarantee; and include the Full details link.' : '',
    ctx.primaryRequired && ctx.question.primary === 'price'
      ? 'ORDER: price → guarantee → "I had a look through your site as well. The biggest thing I noticed is …" (the PRIMARY FINDING, concretely) → optionally one supporting finding → the link / a question. Never open with the website issue.'
      : ctx.primaryRequired
        ? 'ORDER: answer their message in a line, then make the PRIMARY FINDING the centre of the reply ("For yours, one of the clearest issues I found is …", concretely), then what Findable would change about it, then a simple question.'
        : '',
    ctx.alreadyAnswered ? 'ALREADY ANSWERED: Paul has already replied after their latest message (see the conversation). Do not repeat what he said; write a short, natural follow-up that adds something new.' : '',
    ctx.variant > 0 && ctx.avoidText
      ? `ALTERNATIVE: this is regenerate #${ctx.variant}. Write a genuinely different version (different opening and wording, same facts) from:\n"""${clip(ctx.avoidText, 1500)}"""`
      : '',
  ].filter(Boolean).join('\n');

  return `THEIR LATEST MESSAGE — answer this first:
"""${clip(ctx.latest.text || '(they sent a photo or file with no text)', 1500)}"""
Keyword hint (may be wrong): ${ctx.question.all.join(', ')}

CONVERSATION SO FAR (oldest first):
${history || '(no history)'}

LEAD: ${ctx.businessName ?? '(unknown business)'}${ctx.contactFirstName ? `, contact first name ${ctx.contactFirstName}` : ''}; trade ${ctx.trade ?? 'unknown'}; town ${ctx.town ?? 'unknown'}; website ${ctx.website ?? 'none on record'}

KNOWN FROM THE CONVERSATION:
${facts}

WEBSITE RESEARCH:
${research}

AI VISIBILITY:
${visibility}

FOR THIS REPLY:
${instructions}

Return via return_reply.`;
}

/* ─────────────────────────────── checking a draft ─────────────────────────────── */

export interface ReplyCheck {
  /** Serious enough to regenerate once; still shown to Paul if the retry fails too. */
  problems: string[];
  /** Worth Paul's eye; never blocks. */
  warnings: string[];
}

const GUARANTEE_OVERREACH = /\b(guarantee[ds]?|promise[ds]?|guaranteed)\b[^.?!\n]{0,50}\b(rank(?:ing|ed)?s?|top|first page|number one|#1|recommend(?:ed|ation)?s?|cit(?:ed|ation)s?|leads|customers|calls|enquiries|more work)\b/i;
const TOP_CLAIM = /\bwe(?:'ll| will| can)\s+(?:get|put|make)\s+you\s+(?:to\s+)?(?:the\s+)?(?:top|number one|#1|first)\b/i;
const NO_MINIMUM = /\b(cancel (?:any ?time|whenever)|stop (?:any ?time|whenever)|no contract|no minimum|no tie[- ]in)\b/i;
const AI_ABSOLUTE = /\b(?:AI|ChatGPT|Gemini|Google)\s+(?:can(?:['\u2019]|no)?t|cannot|doesn['\u2019]?t|does not|won['\u2019]?t|will not|never)\s+(?:see|read|find|understand|index|crawl|trust)\b|\b(?:AI|ChatGPT|Gemini)\s+(?:ignores|reads (?:it|them|those) as)\b/i;
const OWNERSHIP_Q = /\b(own|control|manage[sd]?|built|host(?:s|ed)?)\b[^?\n]{0,80}\?/i;
const LIST_LINE = /^\s*(?:[-•*]|\d+[.)])\s+/m;

export function checkReply(reply: string, ctx: ReplyContext): ReplyCheck {
  const problems: string[] = [];
  const warnings: string[] = [];
  const text = (reply ?? '').trim();
  if (!text) return { problems: ['The draft is empty.'], warnings };

  if (GUARANTEE_OVERREACH.test(text) || TOP_CLAIM.test(text)) problems.push('It implies guaranteed rankings, recommendations or leads.');
  if (NO_MINIMUM.test(text)) problems.push('It says they can cancel any time — there is a 12-month minimum.');
  if (/\bfounder\b|\bCEO\b/i.test(text)) problems.push('It calls Paul a founder/CEO.');
  const allowed = new Set([String(FINDABLE_SETUP_PRICE_GBP), String(FINDABLE_MONTHLY_GBP), String(FINDABLE_CONTRACT_TOTAL_GBP), FINDABLE_CONTRACT_TOTAL_GBP.toLocaleString('en-GB')]);
  const prices = [...text.matchAll(/£\s?([\d,]+(?:\.\d{2})?)/g)].map((m) => m[1].replace(/\.00$/, ''));
  const wrong = prices.filter((p) => !allowed.has(p) && !allowed.has(p.replace(/,/g, '')));
  if (wrong.length) problems.push(`It names a price that is not the offer: £${wrong.join(', £')}.`);
  if (ctx.question.primary === 'price') {
    const firstPara = text.split(/\n\s*\n/)[0] ?? '';
    if (!new RegExp(`£\\s?${FINDABLE_SETUP_PRICE_GBP}\\b`).test(firstPara)) problems.push('They asked the price and the first paragraph does not give it.');
    if (!/\bmonth/i.test(text)) problems.push('It names the start price without the monthly.');
    /* Measured on the first live draft (Adcock Heat, 2026-09-25): price and findings, but no guarantee
       and no link. A price answer without the four-week first-payment guarantee undersells the one
       thing that makes the setup fee low-risk, so it is a problem, not a note. */
    // "refund", "money back", "claim/get/have … back" ("you can get your first … back", live 2026-09-25).
    if (!/\b(refund|money back|guarantee|(?:claim|get|have|give)[^.?!\n]{0,40}\bback)\b/i.test(text)) problems.push('They asked the price and it leaves out the four-week first-payment guarantee.');
    if (!text.includes('findable.live')) problems.push(`They asked the price and it leaves out ${FINDABLE_DETAILS_URL}.`);
  }
  if (ctx.reportUrl && !ctx.allowReportUrl && (text.includes(ctx.reportUrl) || /findable\.live\/(?:r|report)\//i.test(text))) {
    problems.push('It includes the report link when nothing in their message called for it.');
  }
  if (ctx.salesFacts.owns_website && OWNERSHIP_Q.test(text)) problems.push('It asks about website ownership again, which they already answered.');
  if (!ctx.askOwnership && !ctx.salesFacts.owns_website && OWNERSHIP_Q.test(text) && /\bown|control\b/i.test(text)) warnings.push('It asks who owns the site without a reason in the research.');
  const rivals = (ctx.audit?.competitors ?? []).filter((c) => c.trim().length >= 4);
  if (ctx.hookTemplate && rivals.filter((c) => normaliseForMatch(text).includes(normaliseForMatch(c))).length >= 2) {
    problems.push('It repeats the competitor hook they have already had (lists the same businesses again).');
  }
  if (ctx.primaryRequired && ctx.selection.primary && !findingMentioned(text, ctx.selection.primary, ctx.town)) problems.push(PRIMARY_MISSING_PROBLEM);
  if (AI_ABSOLUTE.test(text)) problems.push('It claims to know how an AI model decides — hedge it ("can make it harder").');
  if ((!ctx.research || ctx.research.status === 'failed' || ctx.research.status === 'no_website') && /\b(your|the) (web)?site\b[^.?!]{0,60}\b(problem|issue|wrong|broken|missing|doesn'?t|isn'?t)\b/i.test(text)) {
    problems.push('It describes a website problem, but the site was not researched.');
  }

  if (text.length > REPLY_SOFT_MAX_CHARS) warnings.push(`It is long for WhatsApp (${text.length} characters).`);
  const paras = text.split(/\n\s*\n/).filter((p) => p.trim()).length;
  if (paras > 5) warnings.push(`It has ${paras} paragraphs.`);
  if (LIST_LINE.test(text) && !/\b(detail|list|breakdown|everything)\b/i.test(ctx.latest.text)) warnings.push('It uses a list they did not ask for.');
  if (!/\?/.test(text) && ctx.question.primary !== 'not_interested') warnings.push('It ends without a question or next step.');
  if (ctx.question.primary === 'how_it_works' && !text.includes('findable.live')) warnings.push(`No link to ${FINDABLE_DETAILS_URL}.`);
  if (ctx.alreadyAnswered) warnings.push('You have already replied since their last message — this draft answers it again. Check it adds something new.');
  if (ctx.askOwnership && !OWNERSHIP_Q.test(text)) warnings.push('The research suggests asking who owns the site, and the draft does not.');
  return { problems, warnings };
}

/* ─────────────────────────────── when the model is unavailable ─────────────────────────────── */

/** A plain, rule-built reply for the questions it can answer without a model — price, how it works,
 *  tell me more. Anything else returns null and the operator is told the model is unavailable. */
export function fallbackReply(ctx: ReplyContext): string | null {
  const t = ctx.question.primary;
  if (t !== 'price' && t !== 'how_it_works' && t !== 'tell_me_more') return null;
  const paras: string[] = [];
  if (t === 'price') {
    paras.push(FINDABLE_OFFER_SUMMARY);
  } else {
    paras.push('We measure how often AI tools like ChatGPT and Gemini name you when people ask for your trade locally, then work on what they read — your site’s pages and the places that get cited for your trade — and re-measure after four weeks.');
    paras.push(FINDABLE_OFFER_SUMMARY);
  }
  paras.push(`If your measured AI visibility hasn’t gone up at the four-week re-measure, you can claim the first £${FINDABLE_SETUP_PRICE_GBP} back.`);
  const f = ctx.research && ctx.research.status !== 'failed' ? ctx.research.strongestFindings[0] : undefined;
  if (f) paras.push(`I had a look through your site as well. ${f.detail.split(/(?<=\.)\s/)[0]}`);
  paras.push(`Full details: ${FINDABLE_DETAILS_URL}`);
  paras.push(ctx.askOwnership
    ? 'Do you own and control the current website, or is it owned or managed by the company that built it?'
    : 'Want me to send over what I’d change first?');
  return paras.join('\n\n');
}

/* ─────────────────────────────── reading the model's answer ─────────────────────────────── */

export interface ModelReply {
  questionType: WarmQuestionType;
  questionSummary: string;
  reply: string;
  findingsUsed: string[];
  askedOwnership: boolean;
  includedReportUrl: boolean;
  salesFacts: SalesFactProposal[];
  operatorNote: string;
}

/** Parse the tool arguments defensively. An absent reply is a failure, never an empty draft. */
export function parseModelReply(raw: unknown, validFindingIds: string[]): ModelReply | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const reply = typeof o.reply === 'string' ? o.reply.trim() : '';
  if (!reply) return null;
  const qt = WARM_QUESTION_TYPES.includes(o.question_type as WarmQuestionType) ? (o.question_type as WarmQuestionType) : 'other';
  const ids = Array.isArray(o.findings_used) ? o.findings_used.filter((x): x is string => typeof x === 'string' && validFindingIds.includes(x)) : [];
  const facts = Array.isArray(o.sales_facts)
    ? o.sales_facts.map((f) => (f ?? {}) as Record<string, unknown>)
      .filter((f) => typeof f.key === 'string' && typeof f.value === 'string' && typeof f.quote === 'string')
      .map((f) => ({ key: f.key as string, value: f.value as string, quote: f.quote as string, source: 'model' as const }))
    : [];
  return {
    questionType: qt,
    questionSummary: typeof o.question_summary === 'string' ? o.question_summary.trim().slice(0, 200) : '',
    reply: reply.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n'),
    findingsUsed: ids,
    askedOwnership: o.asked_ownership === true,
    includedReportUrl: o.included_report_url === true,
    salesFacts: facts,
    operatorNote: typeof o.operator_note === 'string' ? o.operator_note.trim().slice(0, 400) : '',
  };
}
