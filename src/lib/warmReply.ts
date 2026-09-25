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
import { normaliseForMatch, MIN_QUOTE_CHARS, type AuditContext, type ResearchFinding, type WarmLeadResearch } from './warmLeadResearch.ts';

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
  avoidText: string | null;
}

export function buildReplyContext(i: Omit<ReplyContext, 'question' | 'askOwnership' | 'allowReportUrl'>): ReplyContext {
  const question = classifyInbound(i.latest.text);
  return {
    ...i,
    question,
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

function findingLines(fs: ResearchFinding[]): string {
  return fs.map((f) => `- [${f.id}] ${f.title}: ${f.detail}`).join('\n');
}

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
    const strongest = r.strongestFindings;
    research = [
      `Researched ${hhmm(r.generatedAt)} (${r.status}). ${r.businessSummary ?? ''}`.trim(),
      r.technicallyClean ? 'The site is technically fine — no technical fault was found. Do not say or suggest it is broken.' : '',
      strongest.length ? `FINDINGS you may use (strongest first; use at most three, only those relevant):\n${findingLines(strongest)}` : 'FINDINGS: none strong enough to mention. Do not invent any.',
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
    ctx.question.primary === 'price' ? 'PRICE: their message asks about price — the FIRST sentence must give it, with both figures.' : '',
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
const AI_ABSOLUTE = /\b(?:AI|ChatGPT|Gemini|Google)\s+(?:can(?:'|no)?t|cannot|doesn'?t|does not|won'?t|will not|never)\s+(?:see|read|find|understand|index|crawl|trust)\b|\b(?:AI|ChatGPT|Gemini)\s+(?:ignores|reads (?:it|them|those) as)\b/i;
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
  if (AI_ABSOLUTE.test(text)) problems.push('It claims to know how an AI model decides — hedge it ("can make it harder").');
  if ((!ctx.research || ctx.research.status === 'failed' || ctx.research.status === 'no_website') && /\b(your|the) (web)?site\b[^.?!]{0,60}\b(problem|issue|wrong|broken|missing|doesn'?t|isn'?t)\b/i.test(text)) {
    problems.push('It describes a website problem, but the site was not researched.');
  }

  if (text.length > REPLY_SOFT_MAX_CHARS) warnings.push(`It is long for WhatsApp (${text.length} characters).`);
  const paras = text.split(/\n\s*\n/).filter((p) => p.trim()).length;
  if (paras > 5) warnings.push(`It has ${paras} paragraphs.`);
  if (LIST_LINE.test(text) && !/\b(detail|list|breakdown|everything)\b/i.test(ctx.latest.text)) warnings.push('It uses a list they did not ask for.');
  if (!/\?/.test(text) && ctx.question.primary !== 'not_interested') warnings.push('It ends without a question or next step.');
  if ((ctx.question.primary === 'price' || ctx.question.primary === 'how_it_works') && !text.includes('findable.live')) warnings.push(`No link to ${FINDABLE_DETAILS_URL}.`);
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
