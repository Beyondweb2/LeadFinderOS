/* ════════════════════════════════════════════════════════════════════════════════════════════════
   REPLY TRIAGE — who needs to act on an inbound WhatsApp (Admin control centre, release 2, 2026-09-30).
   Paul: "A reply alone is NOT an admin task." This decides, per inbound message, whether it needs the
   ADMIN, a SALESPERSON, NOBODY, or a human REVIEW — and why.

   ⛔ ORDER OF AUTHORITY (Paul's rules, not to be re-asked):
   1. DETERMINISTIC RULES FIRST. Fixed phrases decide everything they can read. The AI is asked only
      about a human message no rule recognised.
   2. OPT-OUT IS PHRASES ONLY. A clear opt-out in ANY inbound reply suppresses future automated
      outreach (Paul, 2026-09-30). The AI can never suppress: an AI "opt-out" goes to REVIEW.
   3. THE AI NEVER CHANGES MONEY, PAYMENT OR CLIENT STATE, and never a lead's status. It files a row.
   4. LOW CONFIDENCE GOES TO REVIEW — nothing quietly disappears.
   5. Wrong number stays its own flow (the Wrong number mark, admin-cleared) — never auto-marked here.
   Pure and edge-safe: fn conversation-triage runs it; scripts/reply-triage.test.ts pins it.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { looksAutomated } from './inboundClassify.ts';
import { classifyInbound } from './warmReply.ts';

/** Bump when a rule changes: every stored row names the version that filed it. */
export const TRIAGE_RULES_VERSION = 'triage-rules-v1';
export const TRIAGE_PROMPT_VERSION = 'triage-prompt-v1';
export const TRIAGE_MODEL = 'gpt-4o-mini';
/** Below this the AI's answer is filed as REVIEW, whatever it said. */
export const TRIAGE_MIN_CONFIDENCE = 0.7;
/** Only replies this recent are surfaced on the dashboard (older ones are filed, not shown). */
export const TRIAGE_SURFACE_DAYS = 14;
/** A high-intent reply a salesperson holds is escalated to Paul after this long unanswered. */
export const REP_ESCALATE_HOURS = 24;

export type TriageBucket = 'urgent_admin' | 'admin_action' | 'rep_action' | 'no_action' | 'review';
export type TriageCategory =
  | 'opt_out' | 'escalation' | 'payment_issue' | 'complaint'
  | 'automated' | 'not_interested' | 'already_sorted' | 'wrong_person' | 'acknowledgement' | 'irrelevant'
  | 'confirmed_contact' | 'interested' | 'price' | 'call_request' | 'booking' | 'question' | 'media'
  | 'client_message' | 'unclear';
export const TRIAGE_CATEGORIES: readonly TriageCategory[] = [
  'opt_out', 'escalation', 'payment_issue', 'complaint', 'automated', 'not_interested', 'already_sorted', 'wrong_person',
  'acknowledgement', 'irrelevant', 'confirmed_contact', 'interested', 'price', 'call_request', 'booking', 'question', 'media', 'client_message', 'unclear',
];
export const TRIAGE_CATEGORY_LABEL: Record<TriageCategory, string> = {
  opt_out: 'Asked to stop', escalation: 'Complaint / legal / harassment', payment_issue: 'Payment issue', complaint: 'Complaint',
  automated: 'Automated reply', not_interested: 'Not interested', already_sorted: 'Already sorted', wrong_person: 'Wrong person',
  acknowledgement: 'Acknowledgement', irrelevant: 'Irrelevant', confirmed_contact: "Confirmed it's them", interested: 'Interested', price: 'Asked the price',
  call_request: 'Wants a call', booking: 'Wants to book', question: 'Asked a question', media: 'Sent a photo / voice note',
  client_message: 'Message from a paying client', unclear: 'Unclear',
};
/** The categories that are a live sale in motion — the only rep work Paul's page ever shows. */
export const HIGH_INTENT: ReadonlySet<TriageCategory> = new Set(['interested', 'price', 'call_request', 'booking']);

/* ── The fixed phrases ─────────────────────────────────────────────────────────────────────────── */

/** ⛔ OPT-OUT: clear requests to stop being contacted. Each one alone suppresses. Kept narrow on
 *  purpose — "stop" inside a sentence ("one-stop shop", "can't stop the leak") is NOT an opt-out;
 *  only "stop" as the whole message, or "stop" + messaging/contacting. */
const OPT_OUT: readonly RegExp[] = [
  /^\W*(stop|unsubscribe|opt[\s-]?out|remove(\s+(me|us))?|stop\s+(it|now|please|pls)|please\s+stop)\W*$/i,
  /\bunsubscribe\b/i,
  /\b(stop|quit|cease)\s+(messaging|texting|contacting|sending|spamming|emailing|whatsapp(ing)?|bothering|pestering|harass\w*)\b/i,
  /\b(do\s*not|don'?t|dont|never|no\s+more)\s+(message|messages|contact|text|texts|whatsapp|email|call|bother|spam)\s+(me|us|this\s+number)\b/i,
  /\bremove\s+(me|us|my\s+number|this\s+number|my\s+details|our\s+number)\b/i,
  /\btake\s+(me|us|my\s+number|this\s+number)\s+off\b/i,
  /\bopt(ing)?[\s-]?out\b/i,
  /\bleave\s+(me|us)\s+alone\b/i,
];
const ESCALATION: readonly RegExp[] = [
  /\bharass(ment|ing|ed)?\b/i,
  // "I'll report you" / "reporting you" — never "the report you provide" (a real false match, 2026-09-30).
  /\b(i'?ll|i\s+will|i\s+am\s+going\s+to|i'?m\s+going\s+to|we'?ll|we\s+will|going\s+to)\s+report\s+(you|this|your)\b|\breport(ed|ing)\s+(you|this\s+number|your\s+number)\b/i,
  /\bsolicitor|\blawyer|\blegal\s+action|\bsue\s+you\b|\btake\s+you\s+to\s+court\b/i,
  /\bpolice\b/i, /\bscam(mer|mers|ming)?\b/i, /\bfraud(ulent|ster)?\b/i, /\bgdpr\b|\bico\b|\btrading\s+standards\b|\bombudsman\b|\bdata\s+protection\b/i,
];
const PAYMENT: readonly RegExp[] = [
  /\brefund\b/i, /\bcharge\s*back\b/i, /\bmoney\s+back\b/i, /\bdispute\b/i, /\bovercharg/i, /\bcharged\s+(me|us|twice)\b/i,
  /\bcancel\s+(my|the|our)\s+(subscription|payment|direct\s+debit|plan|account|contract)\b/i, /\bpayment\s+(failed|didn'?t|not\s+gone|declined)\b/i,
];
const COMPLAINT: readonly RegExp[] = [/\bcomplain(t|ing)?\b/i, /\bdisgust(ing|ed)\b/i, /\bappalling\b/i, /\bunacceptable\b/i, /\bshocking\s+service\b/i];
const ALREADY_SORTED: readonly RegExp[] = [
  /\b(already|currently)\s+(have|got|use|using|with)\b/i, /\b(i|we)('ve| have)?\s+got\s+(someone|somebody|a\s+(guy|company|website|web\s*site))\b/i,
  /\b(all|we'?re|we\s+are|i'?m|i\s+am)\s+(sorted|covered|fine|good|ok)\b/i, /\bno\s+need\b/i, /\bnot\s+needed\b/i, /\b(busy|booked)\s+(enough|up|solid)\b/i,
  /\b(retired|closed\s+down|ceased\s+trading|no\s+longer\s+trading|sold\s+the\s+business)\b/i,
];
const WRONG_PERSON: readonly RegExp[] = [/\bwrong\s+(number|person|business)\b/i, /\bnot\s+the\s+(owner|right\s+person)\b/i, /\bno\s+longer\s+(own|run|work)\b/i, /\bdon'?t\s+(own|run)\s+(it|the|this)\b/i];
const ACK = /^\W*(ok(ay)?|k|kk|thanks?|thank\s*you|thanks\s+mate|thank\s+you\s+very\s+much|thx|ty|cheers(\s+mate)?|ta|great|cool|nice|lovely|brilliant|perfect|noted|received|got\s+it|will\s+do|no\s+problem|np|👍+|🙏+|👌+|😊+|🙂+|✅)(\s+(mate|bud|pal|thanks|thank\s+you))?\W*$/iu;
/** Only emoji / symbols — a reaction, nothing to answer. */
const EMOJI_ONLY = /^[\p{Extended_Pictographic}\p{Emoji_Component}\s‍️.!?]+$/u;
/** A bare "no". classifyInbound misses "No, thank you" (the comma); these are the same answer. */
const PLAIN_NO = /^\W*(no|nope|nah|no\s*,?\s*thanks?|no\s*,?\s*thank\s*you|not\s+for\s+(me|us)|not\s+interested)\W*(mate|pal|bud)?\W*$/i;
const DONT_NEED = /\b(do\s*not|don'?t|dont)\s+(need|want|require)\b/i;
/** More auto-responders than the shared list knows (working-hours notices). Local to triage on purpose:
 *  the shared list (inboundClassify.ts) also drives the live first-reply automation. */
const AUTOMATED_EXTRA: readonly RegExp[] = [/\bmy\s+working\s+hours\s+are\b/i, /\b(office|opening)\s+hours\s+are\b/i, /\bthis\s+is\s+an\s+automated\b/i, /^\W*dear\s+customer\b/i];
/** "Not interested" said the long way: a negation within a few words of "interested", or "not this
 *  time / not at the moment". Measured 2026-09-30 on real replies ("i ain't interested", "not something
 *  I'm interested in", "wouldn't be interested in spending"). */
const NEGATED_INTEREST = /\b(not|ain'?t|isn'?t|wouldn'?t|won'?t|never|no\s+longer)\s+([\w'’]+\s+){0,3}interested\b|\bnot\s+(this\s+time|right\s+now|at\s+the\s+moment|for\s+now)\b/i;
/** ⛔ THE OPENER ASKS "IS THIS <BUSINESS>?" — so "Yes", "Yes it is", "Speaking", "How can I help?" confirm
 *  WHO THEY ARE. Measured 2026-09-30: 480+ of 1,843 real replies are exactly this. It is a conversation
 *  to continue, never "interested". Greeting words are stripped first; what is left must be only these. */
const CONFIRM_TOKEN = String.raw`(hi|hello|hey|hiya|hi there|good (morning|afternoon|evening)|morning|afternoon|evening|yes|yeah|yea|yep|yup|ye|ya|yh|aye|sure|mate|buddy|pal|bud|it is|it certainly is|it is indeed|indeed|certainly|speaking|correct|that'?s (me|right|correct)|that is (me|right|correct)|it'?s (me|us)|this is (he|she|me|us|him|her)|how (can|may) (i|we) help( you)?|what can (i|we) do for you|can (i|we) help( you)?|who is (this|it)|who'?s this|who are you|thanks?|thank you)`;
const CONFIRM_ONLY = new RegExp(`^${CONFIRM_TOKEN}( ${CONFIRM_TOKEN})*$`, 'i');
function isConfirmOnly(t: string): boolean {
  const norm = t.toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z'\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return !!norm && CONFIRM_ONLY.test(norm);
}
/** Interest in words — never a bare "yes" (that answers the opener's identity question). */
const INTERESTED = /\b(yes\s+please|yes\s+send|yes\s+(i'?m|we'?re|i\s+am|we\s+are)\s+interested|go\s+on\s+then|go\s+ahead|interested|sounds\s+(good|great|interesting)|keen|let'?s\s+do\s+it|sign\s+me\s+up|how\s+do\s+i\s+(sign\s+up|start|pay|get\s+started)|i'?m\s+in|count\s+me\s+in|send\s+(it|me\s+(it|the|more|details|info))|tell\s+me\s+more|more\s+info)\b/i;
const BOOKING = /\b(book\s+(a|in)|meeting|appointment|zoom|teams\s+call|google\s+meet|(are|is)\s+you\s+(free|available)|available\s+(on|at|tomorrow|today)|what\s+time)\b/i;
const CALL = /\b(call|ring|phone)\s+(me|us|back)\b|\bcall\s*back\b|\bgive\s+(me|us)\s+a\s+(call|ring|bell)\b/i;
const QUESTION_START = /^\s*(who|what|how|why|where|when|which|can|could|would|will|do|does|did|is|are|have|has)\b/i;

export interface TriageContext {
  /** The lead is a paying client (isPaidLead) — every human message from them is Paul's to see. */
  isClient: boolean;
  /** The message has words (a caption counts). A bare photo / voice note has none. */
  messageType?: string | null;
}
export interface TriageDecision {
  category: TriageCategory;
  bucket: TriageBucket;
  reason: string;
  /** 1 for a rule; the model's stated confidence for AI. */
  confidence: number;
  method: 'rule' | 'ai' | 'needs_ai';
  ruleId: string | null;
  /** The only side effect triage may cause: suppress future automated outreach. Rules only. */
  suppress: boolean;
}

const hit = (list: readonly RegExp[], t: string) => list.find((re) => re.test(t)) ?? null;
const rule = (category: TriageCategory, bucket: TriageBucket, ruleId: string, reason: string, suppress = false): TriageDecision =>
  ({ category, bucket, reason, confidence: 1, method: 'rule', ruleId, suppress });

/** The deterministic pass. Returns method 'needs_ai' when no rule recognised a human message. */
export function triageByRules(text: string | null | undefined, ctx: TriageContext): TriageDecision {
  // Phones type curly apostrophes ("don’t"); every rule is written with the straight one.
  const t = String(text ?? '').replace(/[’‘ʼ]/g, "'").replace(/\s+/g, ' ').trim();
  const media = !!ctx.messageType && ctx.messageType !== 'text' && ctx.messageType !== 'button' && ctx.messageType !== 'interactive';
  if (!t || /^\[[a-z_]+\]$/i.test(t)) {
    return media
      ? rule('media', ctx.isClient ? 'admin_action' : 'rep_action', 'media_no_text', 'Sent a photo, file or voice note with no words — someone needs to look or listen')
      : rule('irrelevant', 'no_action', 'empty', 'No words to act on');
  }
  // 1. Opt-out — phrases only. A paying client's "stop" is Paul's to read, never auto-suppressed:
  //    stopping outreach must not silently stop their service messages (results, onboarding).
  const opt = hit(OPT_OUT, t);
  if (opt) {
    return ctx.isClient
      ? rule('opt_out', 'urgent_admin', 'opt_out_client', 'A paying client asked to stop — read it yourself; not suppressed automatically')
      : rule('opt_out', 'no_action', 'opt_out', 'Asked to stop — future automated outreach is suppressed', true);
  }
  // 2. Things only the admin should handle.
  if (hit(ESCALATION, t)) return rule('escalation', 'urgent_admin', 'escalation', 'Mentions harassment, reporting, legal action, a scam or data protection');
  if (hit(PAYMENT, t)) return rule('payment_issue', ctx.isClient ? 'urgent_admin' : 'admin_action', 'payment', 'Mentions a refund, dispute, cancellation or a payment problem');
  if (hit(COMPLAINT, t)) return rule('complaint', 'urgent_admin', 'complaint', 'Reads as a complaint');
  // 3. Nobody needs to act.
  if (looksAutomated(t) || hit(AUTOMATED_EXTRA, t)) return rule('automated', 'no_action', 'automated', 'An automated reply (out of office, booking bot)');
  if (EMOJI_ONLY.test(t)) return ctx.isClient ? rule('acknowledgement', 'no_action', 'emoji_client', 'An emoji reaction') : rule('acknowledgement', 'no_action', 'emoji', 'An emoji reaction — nothing to answer');
  const q = classifyInbound(t);
  if (q.primary === 'not_interested' || PLAIN_NO.test(t)) return rule('not_interested', 'no_action', 'not_interested', 'Said no');
  if (DONT_NEED.test(t) && !q.all.includes('price')) return rule('not_interested', 'no_action', 'dont_need', "Said they don't need it");
  if (NEGATED_INTEREST.test(t) && !q.all.includes('price') && !/\bbut\b.{0,80}\binterested\b/i.test(t)) return rule('not_interested', 'no_action', 'negated_interest', 'Said not interested (in their own words)');
  if (hit(WRONG_PERSON, t)) return rule('wrong_person', 'no_action', 'wrong_person', 'Says it is the wrong number or person — mark Wrong number on the lead if confirmed');
  if (q.primary === 'existing_provider' || hit(ALREADY_SORTED, t)) {
    // "Already have someone … how much are you?" is still a price question.
    if (!q.all.includes('price') && !INTERESTED.test(t)) return rule('already_sorted', 'no_action', 'already_sorted', 'Already has someone / no need');
  }
  // 4. A paying client: every other human message is Paul's to see.
  if (ctx.isClient) return ACK.test(t) ? rule('acknowledgement', 'no_action', 'ack_client', 'A short thanks / OK') : rule('client_message', 'admin_action', 'client', 'A message from a paying client');
  if (ACK.test(t)) return rule('acknowledgement', 'no_action', 'ack', 'A short thanks / OK — nothing to answer');
  // 5. They answered the opener's "is this <business>?" — a conversation to continue, not interest.
  if (isConfirmOnly(t)) return rule('confirmed_contact', 'rep_action', 'confirmed', "Confirmed it's them — carry on the conversation");
  // 6. A sale in motion — the salesperson's (routing decides whether Paul sees it).
  if (q.all.includes('price')) return rule('price', 'rep_action', 'price', 'Asked the price');
  if (CALL.test(t) || q.all.includes('call_request')) return rule('call_request', 'rep_action', 'call', 'Asked for a call');
  if (BOOKING.test(t)) return rule('booking', 'rep_action', 'booking', 'Wants to book a time');
  if (INTERESTED.test(t) || q.all.includes('tell_me_more')) return rule('interested', 'rep_action', 'interested', 'Sounds interested / wants more');
  if (t.includes('?') || QUESTION_START.test(t) || q.primary === 'how_it_works' || q.primary === 'show_changes') return rule('question', 'rep_action', 'question', 'Asked a question');
  return { category: 'unclear', bucket: 'review', reason: 'No rule recognised it', confidence: 0, method: 'needs_ai', ruleId: null, suppress: false };
}

/** Is this whole message an opt-out? The one question the suppression path asks — exported so the
 *  test pins it and nobody writes a second copy. */
export const isOptOut = (text: string | null | undefined): boolean => !!hit(OPT_OUT, String(text ?? '').replace(/[’‘ʼ]/g, "'").replace(/\s+/g, ' ').trim());

/* ── The AI pass (only for 'needs_ai') ──────────────────────────────────────────────────────────── */

export interface AiTriageAnswer { category: string; confidence: number; reason: string }

/** Turn the model's answer into a decision. ⛔ Its category is only ever FILED: an AI opt-out or an
 *  unknown category is REVIEW; below TRIAGE_MIN_CONFIDENCE is REVIEW; the model can never suppress. */
export function decisionFromAi(a: AiTriageAnswer | null, ctx: TriageContext): TriageDecision {
  const base = { method: 'ai' as const, ruleId: null, suppress: false };
  if (!a || !(TRIAGE_CATEGORIES as readonly string[]).includes(a.category)) {
    return { ...base, category: 'unclear', bucket: 'review', reason: 'The model gave no usable answer', confidence: 0 };
  }
  const category = a.category as TriageCategory;
  const confidence = Math.max(0, Math.min(1, Number(a.confidence) || 0));
  const reason = String(a.reason ?? '').slice(0, 200) || TRIAGE_CATEGORY_LABEL[category];
  if (category === 'opt_out') return { ...base, category, bucket: 'review', confidence, reason: `Model thinks they asked to stop — confirm and suppress by hand if so. ${reason}` };
  if (confidence < TRIAGE_MIN_CONFIDENCE) return { ...base, category, bucket: 'review', confidence, reason: `Low confidence (${Math.round(confidence * 100)}%): ${reason}` };
  return { ...base, category, bucket: bucketFor(category, ctx), confidence, reason };
}

export function bucketFor(c: TriageCategory, ctx: TriageContext): TriageBucket {
  if (c === 'escalation' || c === 'complaint') return 'urgent_admin';
  if (c === 'payment_issue') return ctx.isClient ? 'urgent_admin' : 'admin_action';
  if (c === 'client_message') return 'admin_action';
  if (c === 'unclear') return 'review';
  if (c === 'automated' || c === 'not_interested' || c === 'already_sorted' || c === 'wrong_person' || c === 'acknowledgement' || c === 'irrelevant' || c === 'opt_out') return 'no_action';
  return ctx.isClient ? 'admin_action' : 'rep_action';
}

/** The model's instructions. Grounded: it sees the conversation and three facts, and must pick one
 *  category from the list — it is never asked for numbers, advice or a reply. */
export function triagePrompt(input: { thread: { direction: string; text: string }[]; isClient: boolean; state: string }): { system: string; user: string } {
  const cats = TRIAGE_CATEGORIES.map((c) => `${c} (${TRIAGE_CATEGORY_LABEL[c]})`).join('; ');
  return {
    system: [
      'You sort replies from UK small-business owners to a sales outreach on WhatsApp. You never write a reply.',
      'Pick ONE category for the LAST inbound message, using the conversation for context.',
      `Categories: ${cats}.`,
      'Use opt_out only for a clear request to stop being contacted. Use escalation for threats, harassment claims, legal, police, scam or data-protection talk.',
      'Use unclear when you genuinely cannot tell. Give an honest confidence from 0 to 1. The reason is at most 20 words, factual, quoting their words where you can.',
    ].join(' '),
    user: JSON.stringify({ lead_state: input.state, paying_client: input.isClient, conversation: input.thread.slice(-8) }),
  };
}

/* ── Is it still open? (derived at read time, never stored) ───────────────────────────────────── */

export interface OpenInput {
  messageAt: string;
  /** A person replied after it (a human outbound, or any free-form outbound). */
  answeredAfter: boolean;
  /** Someone set a Next Action / booked a call / logged a contact after it. */
  actedAfter: boolean;
  /** The lead is now a client, won or not interested — the conversation has moved on. */
  settled: boolean;
  resolvedAt: string | null;
  nowMs: number;
}
export function triageIsOpen(i: OpenInput): boolean {
  if (i.resolvedAt || i.answeredAfter || i.actedAfter || i.settled) return false;
  return Date.parse(i.messageAt) >= i.nowMs - TRIAGE_SURFACE_DAYS * 86_400_000;
}
