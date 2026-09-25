/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WARM REPLY — the draft Paul reviews before answering a prospect who replied (2026-09-25).

   ⛔ THIS NEVER SENDS. It produces TEXT for the Inbox composer. Paul edits it and presses Send, and
      the send goes through `send-whatsapp-message` exactly as a typed reply does — same 24-hour
      window check, same daily cap, same ownership check. Nothing here can reach Meta.

   THE ORDER OF A REPLY (the brief's §3, and the reason the latest inbound is quoted first in the
   prompt): answer THEIR message → the strongest relevant findings → one simple next step. A pitch
   that ignores the question they just asked is the failure this file exists to prevent.

   ⛔ NO PRICE AT THIS STAGE (Paul, 2026-09-25, superseding the first version that answered "how
      much" with the offer). See "WHAT THIS REPLY IS FOR" below; the offer stays in findableOffer.ts.

   ⛔ SALES FACTS ARE WHAT THE PROSPECT SAID, NOT WHAT WE GUESS. A fact is kept only when its quote is
      found, verbatim, in one of THEIR inbound messages. Facts live on the research row and are never
      written onto the lead, the onboarding record or anything a client-facing surface reads.

   Pure and edge-reachable (relative `.ts` imports only).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
/* ⛔ The offer constants (findableOffer.ts) are deliberately NOT imported: this stage carries no price
   (Paul, 2026-09-25). A later sales stage will use them; the canonical data is untouched. */
import { REPORT_PUBLIC_ORIGIN } from './findableOffer.ts';
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
  { key: 'has_existing_provider', value: 'yes', re: /\b(?:my|our|an|the|a)\s+(?:agency|developer|web ?designer|web guy|it company|website company|web company)\s+(?:manages|looks after|runs|does|handles|built|hosts|sorts)\b[^.?!]*/i },
  { key: 'has_existing_provider', value: 'yes', re: /\b(?:someone|somebody|a (?:company|guy|lad|bloke|firm|mate))\s+(?:else\s+)?(?:manages|looks after|runs|does|handles|built|hosts|sorts)\s+(?:the|my|our)\s+(?:web\s*)?site\b[^.?!]*/i },
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
export const PRIMARY_QUESTION_TYPES: ReadonlySet<WarmQuestionType> = new Set(['price', 'how_it_works', 'tell_me_more', 'show_changes', 'existing_provider', 'ownership_answer', 'other']);
/** The words the operator sees when the primary finding is missing — the brief's own wording. */
export const PRIMARY_MISSING_PROBLEM = 'Strong website finding was not used.';
export const PRIMARY_REWRITE_INSTRUCTION = 'The previous response ignored the strongest evidence. Rewrite it while keeping it conversational and explicitly include the primary website finding, with its concrete details.';

const NOT_PRIMARY: ReadonlySet<string> = new Set(['ai_visibility', 'provider_attribution']);
/** Kinds a MODEL reading may raise. Conflicts (hours, locations, phones), missing pages, blocking /
 *  indexing, titles and credits are judged by the rules, precisely; a model's version of those is a
 *  judgement call it got wrong live ("cover areas across Hertfordshire" read as a conflict). */
export const MODEL_MAY_AUTHOR: ReadonlySet<string> = new Set(['off_trade_content', 'weak_evidence', 'thin_or_duplicate', 'outdated_content', 'other']);

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
      if (/robots|blocked|crawler/.test(id) || /block/i.test(f.title)) {
        const blockedIdea = /\b(block\w*|robots|shut out|locked out|keep\w* out|can t (get in|reach|read))\b/.test(t);
        // When the crawlers are known, at least one must be named: "crawlers are blocked" alone is generic.
        const names = (f.keyDetails ?? []).map(flat).filter((n) => n.length >= 4);
        return blockedIdea && (names.length === 0 || names.some((n) => tf.includes(n)));
      }
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
  if (!r || r.status === 'no_website') return empty;
  /* ⛔ A FAILED READ TODAY DOES NOT ERASE WHAT AN EARLIER CRAWL MEASURED. E.E.S Electrical (live,
     2026-09-25): today's fetch got HTTP 429, while the crawl check an hour earlier had all four AI
     crawlers blocked — and the drafter, seeing "failed", used nothing. Only crawl-measured findings
     survive a failed read; nothing read (or not read) today is used. */
  const failedRead = r.status === 'failed';
  const said = thread.filter((m) => m.direction === 'outbound' && (!hookAt || m.at > hookAt)).map((m) => m.text).join('\n');
  const eligible = rankFindings(pooledFindings(r).filter((f) => f.verified && f.strength >= MIN_SALES_STRENGTH && !NOT_PRIMARY.has(f.kind)
    && !(f.source === 'model' && !MODEL_MAY_AUTHOR.has(f.kind))
    && (!failedRead || f.source === 'crawl')));
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

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   🔴 WHAT THIS REPLY IS FOR (Paul, 2026-09-25, third pass). It goes AFTER opener → reply → the AI /
   competitor hook → their reply to it. Its job is exactly three things:
        PROVE THERE IS A REAL ISSUE → SAY WHAT WE CAN DO ABOUT IT → FIND OUT WHO CONTROLS THE WEBSITE
   ⛔ NO PRICE AT THIS STAGE. No figure, no monthly, no payments, no guarantee, no pricing link — even
      when they ask "how much" (the reply says it depends on which route suits them, which is what
      the ownership question finds out). The canonical offer in findableOffer.ts is untouched; a
      later stage uses it. `checkReply` refuses any of it.
   ⛔ IT ENDS WITH THE WEBSITE QUESTION ("are you with an agency or do you manage the site
      yourself?") unless they have ALREADY told us (sales facts) — then it is never asked again.
   It always leads from the AI search that started the conversation, uses the strongest finding with
   its specifics, offers BOTH routes (fix the current site / build a new one — research leans which
   way), and sounds like Paul typed it on WhatsApp.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Has the prospect already told us who controls the site? Either answer closes the question. */
export function websiteControlKnown(facts: SalesFacts | null | undefined): boolean {
  return !!facts?.owns_website || facts?.has_existing_provider?.value === 'yes';
}

/** The ownership / agency question ends the reply unless they have already answered it. */
export function shouldAskOwnership(_research: WarmLeadResearch | null | undefined, facts: SalesFacts | null | undefined): boolean {
  return !websiteControlKnown(facts);
}

export type RouteLean = 'fix_existing' | 'consider_new' | 'new_only';

/** Which of the two routes the research points to. Both are always offered; this only says which
 *  sounds more natural. A site with no website gets the build route alone. */
export function routeLean(r: WarmLeadResearch | null | undefined): RouteLean {
  if (!r || r.status === 'no_website') return r?.status === 'no_website' ? 'new_only' : 'fix_existing';
  const all = [...r.technicalFindings, ...r.contentFindings];
  const broken = all.some((f) => /client_rendered|unreadable/.test(f.id) || /nearly empty without javascript/i.test(f.title));
  const agencyHosted = r.ownershipClues.some((c) => /host|manage/i.test(c));
  const noCore = all.some((f) => f.kind === 'missing_core_service_pages');
  return broken || (agencyHosted && noCore) ? 'consider_new' : 'fix_existing';
}

export const ROUTE_LABELS: Record<RouteLean, string> = {
  fix_existing: 'optimise the existing site (a Findable rebuild offered as the other route)',
  consider_new: 'optimise the existing site or a Findable rebuild (research leans rebuild)',
  new_only: 'Findable builds a new site (no website on record)',
};

/** "electrician in Addlestone" — what AI was asked, in the lead's own terms. */
export function aiSearchContext(ctx: { audit: AuditContext | null; trade: string | null; town: string | null }): string | null {
  const raw = (ctx.audit?.trade || ctx.trade || '').trim().toLowerCase();
  const town = (ctx.audit?.town || ctx.town || '').trim();
  if (!raw) return null;
  const trade = raw.replace(/ies$/, 'y').replace(/(?<!s)s$/, '');
  return town ? `${trade} in ${town}` : trade;
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
  /** Which route the research leans to (derived). */
  route: RouteLean;
  /** "electrician in Addlestone" (derived). */
  searchContext: string | null;
  /** Where their number came from, stated only when the lead row proves it (a Google listing). */
  numberSource?: string | null;
  avoidText: string | null;
}

export function buildReplyContext(i: Omit<ReplyContext, 'question' | 'askOwnership' | 'allowReportUrl' | 'alreadyAnswered' | 'selection' | 'primaryRequired' | 'route' | 'searchContext'>): ReplyContext {
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
    route: routeLean(i.research),
    searchContext: aiSearchContext(i),
  };
}

/* ─────────────────────────────── the prompt ─────────────────────────────── */

export const REPLY_SYSTEM_PROMPT = `You draft WhatsApp replies for Paul, who helps UK local businesses show up when people ask AI tools (google ai, chatgpt, gemini, perplexity) for their trade in their area. Paul reads and edits every draft before sending; you never send anything. Return ONLY structured data via the return_reply tool.

WHERE THIS CONVERSATION IS: Paul messaged them cold, they replied, Paul sent a message saying he asked AI for their trade in their area and it named other businesses, and now they have replied to that. This reply has exactly three jobs:
1. PROVE THERE IS A REAL ISSUE: AI was asked for their service in their area, it recommended their competitors, not them, and (where the research found one) here is a specific reason on their website.
2. SAY WHAT WE CAN DO ABOUT IT: we can fix it on the site they already have, OR build them a new site properly set up for ai visibility and seo. Offer both routes; never imply everyone needs a new site.
3. FIND OUT WHO CONTROLS THE WEBSITE: end by asking whether they are with an agency or own/manage the site themselves (unless FOR THIS REPLY says they already told us).

THE SHAPE (normally 3 or 4 short paragraphs):
- respond naturally to what they just said (if they misread the hook, e.g. "do you need an electrician?", put them right in a friendly way: "nah mate, i was checking what google ai recommends when someone's looking for an electrician in addlestone")
- the AI search: what was asked and that it brought up their competitors instead of them. Do not list the competitors again; they have just seen them.
- the specific issue from the PRIMARY FINDING, with its real details, and what it means in plain english ("so a lot of the ai tools can't properly access and understand the site")
- what we'd do: "that's the sort of thing we fix, either on the site you've already got or we can build you a new one that's properly set up for ai visibility and seo"
- the website question last: "are you currently with an agency or do you own/manage the website yourself?"

NO PRICE AT THIS STAGE. Do not mention any price, figure, monthly fee, number of payments, guarantee, refund or pricing link. If they asked how much, say it depends on which route makes sense for them, which is why you're asking about the website, and carry on.

HOW PAUL WRITES ON WHATSAPP:
- conversational, short, simple sentences. lowercase is fine and natural. "mate" where it fits.
- product names in normal lowercase is fine: google ai, chatgpt, claude, perplexity.
- no headings, no bullet points, no bold, no emojis, no dashes of any kind (no "—" or "–"): use a comma or a new sentence.
- never: "i'd love to", "great question", "thanks for getting back to me", "ai-powered", "solutions", "leverage", "boost", "online presence", "seamless", "unlock", "don't hesitate", fake urgency, exaggerated claims.
- it should read like Paul checked THEIR business himself and found something worth fixing, not like a sales script.

NEVER:
- invent a website problem. Use ONLY the findings you are given, and state them no more strongly than their detail does;
- water a specific finding down to "a few technical issues" or "your website could be better optimised";
- promise or imply rankings, recommendations, citations, customers or leads;
- claim to know how an AI model decides ("ai ignores", "ai reads it as"). Say what is on the site and that it "can make it harder" / means ai "can't properly access" when access is actually blocked;
- repeat or re-word the competitor message Paul already sent;
- say Findable can take over, take down or own their existing site;
- call Paul a founder, CEO or agency; no sign-off.

SALES FACTS: if their messages EXPLICITLY state one of these, return it in sales_facts with their exact words as the quote: owns_website, has_existing_provider (an agency, developer or someone else manages the site or their marketing), interested_in_rebuild, requested_price, prefers_call, not_interested. Values are "yes" or "no". Never guess.`;

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
    research = 'No website research is available. Do NOT mention anything specific about their website. Lead with the AI search result instead.';
  } else if (r.status === 'no_website') {
    research = 'They have NO website on record. Do not critique a website. The route is: we can build them one that is properly set up for ai visibility and seo.';
  } else if (r.status === 'failed' && !ctx.selection.primary) {
    research = 'Their website could NOT be read today and nothing measured earlier applies. Do NOT mention any website problem. Lead with the AI search result instead.';
  } else {
    const { primary, secondary } = ctx.selection;
    const concrete = (f: ResearchFinding) => sayableDetails(f).map((d) => `"${d}"`).join(' / ');
    research = [
      r.status === 'failed'
        ? 'Their site could not be read today, but an earlier crawl check MEASURED the finding below. Use ONLY that finding; say nothing else about the site.'
        : `Researched ${hhmm(r.generatedAt)} (${r.status}). ${r.businessSummary ?? ''}`.trim(),
      primary
        ? [
          `PRIMARY FINDING — YOU MUST USE THIS AS THE SPECIFIC ISSUE, keeping its concrete details:\n- [${primary.id}] ${primary.title}: ${primary.detail}\n  Concrete details to keep: ${concrete(primary)}`,
          secondary.length ? `SUPPORTING FINDINGS (use at most ONE, and only if it genuinely strengthens the point):\n${secondary.map((f) => `- [${f.id}] ${f.title}: ${f.detail}\n  Concrete details: ${concrete(f)}`).join('\n')}` : '',
          'Specificity beats quantity: one clear issue with its real details, not a mini audit.',
        ].filter(Boolean).join('\n')
        : `No website finding is strong enough to use. Do NOT invent one. ${r.technicallyClean ? 'The site itself is not badly built: say so honestly, then ' : ''}use the strongest true point you have: AI still isn't linking them strongly enough with ${ctx.searchContext ?? 'their trade in their area'}, while it is with those other businesses, and we would make their services, areas and business evidence much clearer so google and the ai tools understand exactly what they do and where.`,
      ctx.selection.alreadyMentioned.length ? `Paul has ALREADY told them about: ${ctx.selection.alreadyMentioned.map((f) => f.title).join('; ')}. Do not repeat it.` : '',
    ].filter(Boolean).join('\n');
  }

  let visibility = 'No AI check result is available beyond the hook Paul sent.';
  const a = ctx.audit;
  if (a?.namedEverywhere) visibility = 'Our check named them on every AI engine it tried. Do NOT say AI is recommending competitors instead of them.';
  else if (a && a.totalDatapoints) {
    visibility = `When we asked AI for ${ctx.searchContext ?? 'their trade'}, they were named in ${a.namedDatapoints ?? 0} of ${a.totalDatapoints} answers. (The competitors were in Paul's hook; do not list them again.)`;
  }

  const lean = ctx.route === 'new_only'
    ? 'ROUTE: they have no website, so the route is building them one properly set up for ai visibility and seo.'
    : `ROUTES: offer both, fixing it on the site they've already got or building a new one properly set up for ai visibility and seo. ${ctx.route === 'consider_new' ? 'The research suggests the current setup may not be worth working with, so the new-site route can sound the more natural of the two.' : 'Fixing the current site is the natural first route here.'}`;
  const known = ctx.salesFacts.owns_website ?? (ctx.salesFacts.has_existing_provider?.value === 'yes' ? ctx.salesFacts.has_existing_provider : null);
  const instructions = [
    ctx.searchContext ? `AI SEARCH CONTEXT: AI was asked for "${ctx.searchContext}".` : '',
    ctx.hookTemplate ? 'STAGE: Paul has already sent them the AI check naming the businesses AI mentioned, and they have replied to it. Do NOT repeat that message or list those businesses again.' : '',
    ctx.primaryRequired ? 'ISSUE: the PRIMARY FINDING is the specific issue in this reply, with its real details.' : '',
    lean,
    ctx.askOwnership
      ? (ctx.route === 'new_only'
        ? 'LAST LINE: ask, naturally, whether they have a website at the moment or have been going without one.'
        : 'LAST LINE: end with the website question, naturally, e.g. "are you currently with an agency or do you own/manage the website yourself?"')
      : `WEBSITE QUESTION: they have ALREADY told us (they said: "${clip(known?.quote ?? '', 160)}"). Do NOT ask who owns or manages the site again. Build on what they said and end with one simple next step instead.`,
    /\bhow (?:did|do) you (?:get|find)\b|\bwhere did you get\b/i.test(ctx.latest.text)
      ? (ctx.numberSource ? `THEY ASKED HOW YOU GOT THEIR DETAILS: answer it plainly and first: ${ctx.numberSource}.` : 'THEY ASKED HOW YOU GOT THEIR DETAILS: we do not have a recorded source for this lead, so do not state one; leave it for Paul to answer.')
      : '',
    ctx.question.all.includes('price') ? 'THEY ASKED THE PRICE: do not give one at this stage. Say it depends which route makes sense for them, which is why you are asking about the website.' : '',
    ctx.allowReportUrl && ctx.reportUrl
      ? `REPORT LINK: they asked for it or for what we found, so you may include ${ctx.reportUrl}`
      : 'REPORT LINK: do NOT include any link.',
    ctx.alreadyAnswered ? 'ALREADY ANSWERED: Paul has already replied after their latest message (see the conversation). Do not repeat what he said; write a short follow-up that adds something new.' : '',
    ctx.variant > 0 && ctx.avoidText
      ? `ALTERNATIVE: this is regenerate #${ctx.variant}. Write a genuinely different version (different opening and wording, same facts) from:\n"""${clip(ctx.avoidText, 1500)}"""`
      : '',
  ].filter(Boolean).join('\n');

  return `THEIR LATEST MESSAGE, respond to this naturally first:
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
const TOP_CLAIM = /\bwe(?:['’]ll| will| can)\s+(?:get|put|make)\s+you\s+(?:to\s+)?(?:the\s+)?(?:top|number one|#1|first)\b/i;
const AI_ABSOLUTE = /\b(?:AI|ChatGPT|Gemini|Google)\s+(?:can(?:['’]|no)?t|cannot|doesn['’]?t|does not|won['’]?t|will not|never)\s+(?:see|read|find|understand|index|crawl|trust)\b|\b(?:AI|ChatGPT|Gemini)\s+(?:ignores|reads (?:it|them|those) as)\b/i;
/** Price talk of any kind — this stage carries none (Paul, 2026-09-25). */
const PRICE_TALK = /£\s?\d|\b\d+\s?(?:quid|pounds?)\b|\bper month\b|\ba month\b|\/\s?month|\bmonthly\b|\b\d+\s+payments?\b|\bpayments? in total\b|\brefund\w*\b|\bmoney back\b|\bguarantee\w*\b|\bminimum term\b/i;
/** The website question, in its natural forms. */
const WEBSITE_Q = /\b(agency|agencies|developer|web (?:guy|designer|company|person)|own|owns|manage|manages|control|look(?:s|ing)? after|built|runs?|in charge of|have a (?:web)?site|got a (?:web)?site)\b[^?]{0,140}\?/i;
const ROUTE_EXISTING = /\b(site|website) you(?:['’]ve| have)? (?:already )?got\b|\b(?:current|existing) (?:web)?site\b|\bsite you already have\b|\byour (?:current )?(?:web)?site as it is\b|\bon (?:the|your) (?:current )?(?:web)?site\b/i;
const ROUTE_NEW = /\bnew (?:one|site|website)\b|\bbuild (?:you )?(?:a|one|a new)\b|\brebuild\b/i;
/* ⛔ The AI search must be SAID ("i asked google ai…", "ai brought up…"). A passing "harder for AI tools
   to connect you with local searches" passed the first version (Adcock Heat, live 2026-09-25). */
const AI_SEARCH_STRICT = /\b(?:asked|asking|checked|checking|searched|searching|looked|looking|tried|typed|put)\b[^.?!\n]{0,60}\b(?:ai|chatgpt|gemini|perplexity|claude|google)\b|\b(?:ai|chatgpt|gemini|perplexity|claude|google ai)\b[^.?!\n]{0,40}\b(?:recommend\w*|brought up|brings up|came up with|comes up with|mention\w*|suggest\w*|named|listed|picked)\b/i;
/** An em/en dash, or a spaced hyphen used as one. A hyphen inside a quoted time range ("9AM - 9PM")
 *  is the site's own wording, not Paul's punctuation, so it is allowed. */
export function usesDash(text: string): boolean {
  if (/[—–]/.test(text)) return true;
  return [...text.matchAll(/\s-\s/g)].some((m) => {
    const before = text.slice(Math.max(0, (m.index ?? 0) - 8), m.index ?? 0);
    const after = text.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 3);
    return !(/\d\s*(?:am|pm)?$/i.test(before) && /^\d/.test(after));
  });
}
const SALESY = /\b(i['’]?d love to|great question|thanks for (?:getting back|your reply|reaching out|coming back)|ai[- ]powered|solutions|leverage|cutting[- ]edge|game[- ]changer|boost(?:ing)? your|online presence|seamless\w*|unlock\w*|elevate|don['’]?t hesitate|act now|limited time|spaces are limited)\b/i;
const HEADING = /^\s*(?:#{1,6}\s|\*\*[^*]+\*\*\s*$|[A-Z][A-Za-z ]{2,30}:\s*$)/m;
const LIST_LINE = /^\s*(?:[-•*]|\d+[.)])\s+/m;
export const REPLY_STAGE_SOFT_MAX_CHARS = 750;

export function checkReply(reply: string, ctx: ReplyContext): ReplyCheck {
  const problems: string[] = [];
  const warnings: string[] = [];
  const text = (reply ?? '').trim();
  if (!text) return { problems: ['The draft is empty.'], warnings };
  const refusal = ctx.question.primary === 'not_interested';
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const last = paras[paras.length - 1] ?? '';

  if (GUARANTEE_OVERREACH.test(text) || TOP_CLAIM.test(text)) problems.push('It implies guaranteed rankings, recommendations or leads.');
  if (/\bfounder\b|\bCEO\b/i.test(text)) problems.push('It calls Paul a founder/CEO.');
  if (PRICE_TALK.test(text)) problems.push('It talks about price, payments or the guarantee. This stage carries no price.');
  if (/findable\.live(?!\/(?:r|report)\/)/i.test(text)) problems.push('It links the pricing/details page. This stage carries no price.');
  if (ctx.reportUrl && !ctx.allowReportUrl && (text.includes(ctx.reportUrl) || /findable\.live\/(?:r|report)\//i.test(text))) {
    problems.push('It includes the report link when nothing in their message called for it.');
  }
  const rivals = (ctx.audit?.competitors ?? []).filter((c) => c.trim().length >= 4);
  if (ctx.hookTemplate && rivals.filter((c) => normaliseForMatch(text).includes(normaliseForMatch(c))).length >= 2) {
    problems.push('It repeats the competitor hook they have already had (lists the same businesses again).');
  }
  if (ctx.primaryRequired && ctx.selection.primary && !findingMentioned(text, ctx.selection.primary, ctx.town)) problems.push(PRIMARY_MISSING_PROBLEM);
  if (AI_ABSOLUTE.test(text) && !(ctx.selection.primary && /block|robots|javascript/i.test(`${ctx.selection.primary.id} ${ctx.selection.primary.title}`))) {
    problems.push('It claims to know how an AI model decides — hedge it ("can make it harder").');
  }
  const accessFinding = [ctx.selection.primary, ...ctx.selection.secondary].some((x) => !!x && /block|robots|javascript|client_rendered|unreadable|noindex/i.test(`${x.id} ${x.title}`));
  if (!accessFinding && /\b(?:can['\u2019]?t|cannot|unable to|struggl\w* to|not able to)\s+(?:properly\s+|fully\s+|really\s+)?(?:access|read|reach|get into|crawl|see)\b|\bblock(?:ed|ing|s)?\b/i.test(text)) {
    problems.push('It says the AI tools cannot access the site, but no finding shows that.');
  }
  if (!ctx.selection.primary && (!ctx.research || ctx.research.status === 'failed' || ctx.research.status === 'no_website') && /\b(your|the) (web)?site\b[^.?!]{0,60}\b(problem|issue|wrong|broken|missing|doesn'?t|isn'?t)\b/i.test(text)) {
    problems.push('It describes a website problem, but the site was not researched.');
  }

  if (!refusal) {
    if (!AI_SEARCH_STRICT.test(text)) problems.push('It does not mention the AI search that started this conversation.');
    if (ctx.route === 'new_only') {
      if (!ROUTE_NEW.test(text)) problems.push('It does not say we can build them a site.');
    } else if (!ROUTE_EXISTING.test(text) || !ROUTE_NEW.test(text)) {
      problems.push('It does not offer both routes (fix the site they have, or build a new one).');
    }
    if (ctx.askOwnership && !WEBSITE_Q.test(last)) problems.push('It does not end with the website question (agency, or do they own/manage it).');
  }
  if (!ctx.askOwnership && WEBSITE_Q.test(text) && /\b(agency|own|owns|manage|manages|control)\b/i.test(text)) {
    problems.push('It asks who owns/manages the website again, which they already told us.');
  }
  if (usesDash(text)) problems.push('It uses a dash (— or –). Paul writes with commas and full stops.');
  if (SALESY.test(text)) problems.push(`It uses sales-script wording ("${text.match(SALESY)![0]}").`);
  if (HEADING.test(text)) problems.push('It has a heading. WhatsApp messages from Paul have none.');
  if (LIST_LINE.test(text)) problems.push('It uses a bullet or numbered list.');

  if (text.length > REPLY_STAGE_SOFT_MAX_CHARS) warnings.push(`It is long for WhatsApp (${text.length} characters).`);
  if (paras.length > 5) warnings.push(`It has ${paras.length} paragraphs.`);
  if (ctx.alreadyAnswered) warnings.push('You have already replied since their last message — this draft answers it again. Check it adds something new.');
  if (!ctx.selection.primary && ctx.research && ctx.research.status !== 'failed' && ctx.research.status !== 'no_website') {
    warnings.push('No website finding was strong enough to use, so the draft leans on the AI search result. Nothing was invented.');
  }
  return { problems, warnings };
}

/* ─────────────────────────────── when the model is unavailable ─────────────────────────────── */

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** A plain, rule-built reply in the same shape, for when the model is unavailable. Not for a
 *  refusal (Paul answers that himself). */
export function fallbackReply(ctx: ReplyContext): string | null {
  if (ctx.question.primary === 'not_interested') return null;
  const search = ctx.searchContext ?? 'your trade in your area';
  const paras: string[] = [];
  paras.push(`i was checking what ai recommends when someone is looking for ${/^[aeiou]/i.test(search) ? 'an' : 'a'} ${search} and it brought up your competitors instead of you.`);
  const f = ctx.selection.primary;
  if (f) {
    const details = sayableDetails(f).join(', ');
    const first = f.detail.split(/(?<=\.)\s/)[0].replace(/\.$/, '');
    paras.push(`i checked your site to see why and one of the main issues is ${lowerFirst(first)}${details && !first.includes(details) ? ` (${details})` : ''}.`);
  } else if (ctx.research && ctx.research.status !== 'failed' && ctx.research.status !== 'no_website') {
    paras.push(`your site itself isn't badly built, but ai still isn't linking you strongly enough with ${search} searches, while it is with those other businesses.`);
  }
  paras.push(ctx.route === 'new_only'
    ? `that's the sort of thing we sort out, we can build you a site that's properly set up for ai visibility and seo.`
    : `that's the sort of thing we fix, either on the site you've already got or we can build you a new one that's properly set up for ai visibility and seo.`);
  if (ctx.askOwnership) {
    paras.push(ctx.route === 'new_only' ? 'have you got a website at the moment or have you been going without one?' : 'are you currently with an agency or do you own/manage the website yourself?');
  } else {
    paras.push('happy to go through what we’d change on here or on a quick call, whichever suits?');
  }
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
