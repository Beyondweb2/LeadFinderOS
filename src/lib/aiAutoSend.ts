/* ════════════════════════════════════════════════════════════════════════════════════════════════
   AI SENDS ITS OWN REPLY — LEVEL 2 (Paul, 2026-10-21). Record: docs/ai-handles-replies.md "Level 2".

   ONE RULE, read twice: when the worker writes a draft (fn ai-reply-drafts, the tick) and again just before the queued
   message goes (fn inbox-scheduled-send). Both call `autoSendVerdict` with the facts they hold; anything but `send: true`
   leaves the draft waiting for a person, exactly as before Level 2.

   ⛔ POSITIVE, EVERY CHECK MUST PASS. The Inbox mode is Auto (2026-10-21: src/lib/inboxReplyMode.ts; Draft for approval and
      Manual never send) AND that reply type's own switch, a type on
      `AUTO_SEND_CHOICES` (nothing else can ever be switched on), a clean draft (no checker warning, not the rule-built
      fallback), the audit AND website check complete when it was written, the first-reply pitch only on a plain "yes" /
      "how can I help", no Needs you / stop / Auto-reply label, no price / guarantee / proof words, a UK mobile, not a client,
      no stop / angry / complaint / not-interested anywhere in the thread, nobody typing or sending in the last
      `PERSON_ACTIVE_MS`, under the daily cap, and an admin to send as. Absent or unreadable = do not send.
   ⛔ IT NEVER SENDS. The send is an ordinary inbox_scheduled_sends row (the lead's send hours, the drain's opt-out / newer
      message / 24-hour checks), sent by send-whatsapp-message like any queued Inbox reply.
   Pure and edge-reachable: relative imports with .ts, no Deno, no DOM.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { pickMove, isAngry, type MoveInput, type MovePlan } from './replyMove.ts';
import { PLAYBOOK, NEEDS_YOU_INTENTS, type PlaybookIntent } from './replyPlaybook.ts';
import { isOptOut } from './replyTriage.ts';
import { mobileMarketOf } from './outreachMarkets.ts';
import { isClientLead } from './roleRules.ts';

/** The reply types an admin MAY switch on, in the order the switches show. Everything else is never sent automatically.
 *  ⛔ Never add a price / guarantee / proof / pay-on-results line, a Needs you intent, a line that promises a person's
 *  action ("Sending it now", "I'll ring you") or a soft no — scripts/ai-auto-send.test.ts refuses each. */
export const AUTO_SEND_CHOICES: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'first_reply_pitch', label: 'First reply pitch (a plain "yes" or "how can I help")' },
  { key: 'pitch_next', label: 'Agency question after the pitch' },
  { key: 'straight_answer_then_pitch', label: 'Straight answer, then the pitch' },
  { key: 'they_chased', label: 'They chased us (sorry + pitch)' },
  { key: 'agency', label: 'They have an agency' },
  { key: 'tied_no_date', label: 'Tied in, no end date' },
  { key: 'in_contract', label: 'In a contract until a date' },
  { key: 'free_to_leave', label: 'Free to leave the agency' },
  { key: 'self_managed', label: 'They run the site themselves' },
  { key: 'friend_built', label: 'A friend built the site' },
  { key: 'website_given', label: 'They sent their website' },
  { key: 'no_website', label: 'No website' },
  { key: 'facebook_only', label: 'Facebook page only' },
  { key: 'new_site_being_built', label: 'New site being built' },
  { key: 'go_on', label: '"Go on then" / "ok"' },
  { key: 'interested', label: 'Interested' },
  { key: 'call_yes', label: 'Yes to a call (asks a time)' },
  { key: 'busy', label: 'Busy, call later (asks a time)' },
  { key: 'not_now', label: 'Not now (asks when)' },
  { key: 'think_about_it', label: 'Wants to think about it' },
  { key: 'not_owner', label: 'Not the owner' },
  { key: 'who_are_you', label: 'Who are you?' },
  { key: 'what_we_do', label: 'What do you do?' },
  { key: 'explain_here', label: 'Explain it here' },
  { key: 'thinks_customer', label: 'Thinks we are a customer' },
  { key: 'moved_area', label: 'Moved area' },
  { key: 'already_show_up', label: 'Says they already show up' },
  { key: 'ads_question', label: 'Asks if we do ads' },
  { key: 'acknowledge_wait', label: '"Will ring you later"' },
];
const CHOICE_KEYS: ReadonlySet<string> = new Set(AUTO_SEND_CHOICES.map((c) => c.key));
export const autoSendLabel = (key: string): string => AUTO_SEND_CHOICES.find((c) => c.key === key)?.label ?? key;

/** Never auto-sent, whatever is switched on: the price family, the guarantee, pay-on-results, proof, a person's promise,
 *  soft noes and the privacy / bot answers. (Belt and braces: none of these is on AUTO_SEND_CHOICES either.) */
export const NEVER_AUTO_KEYS: ReadonlySet<string> = new Set([
  'how_much', 'catch', 'definitely', 'too_expensive', 'own_site', 'pay_on_results', 'examples', 'proof_request', 'how_long',
  'voice_yes', 'call_now', 'number_sent', 'send_email', 'closed_retired', 'fully_booked', 'word_of_mouth', 'do_it_myself',
  'sorry_wrong_day', 'dont_need', 'does_ai_matter', 'wrong_trade', 'is_bot', 'privacy', 'which_tool', 'where_based', 'not_sure_who',
  'stop', 'auto_reply', 'close_politely', 'escalate', 'unknown_question', 'unsure', 'media', 'link', 'other_language', 'answer_fact',
]);

/** A Needs you reason seen ANYWHERE in the thread makes the whole conversation a person's, for good. */
export const HARD_THREAD_REASONS: ReadonlySet<string> = new Set([
  'opt_out', 'angry', 'do_not_contact', 'not_interested', 'complaint', 'legal', 'payment', 'commercial_ask', 'wrong_person', 'privacy',
]);
/** Soft noes: a thread that ever read as one is never answered automatically again. */
const SOFT_NO_INTENTS: ReadonlySet<string> = new Set(['closed_retired', 'fully_booked', 'word_of_mouth', 'do_it_myself', 'sorry_wrong_day', 'dont_need']);

/** Money, the guarantee, pay-on-results, proof: their words in the reply mean a person answers. */
export const PRICE_OR_PROOF = /(£|\bprice|\bpricing|\bcost|\bcharge|\bfee\b|\bfees\b|how much|\bpay\b|\bpaying|\bpayment|\bguarantee|money.?back|refund|no win|results? first|after (the )?results|\bproof\b|\bprove\b|\bexamples?\b|case stud|\breviews?\b|testimonial|\bcontract\b.*\bsign|\bcancel)/i;

/** Extra stop / hostile wording the shared triage does not read as a stop (2026-10-21: "F off", "leave me alone"). Here
 *  it only keeps the AI out of the conversation for good; the drafter's own rules are unchanged. */
export const HOSTILE_WORDS = /(\bf+\s*off\b|\bfk\s*off\b|\bsod\s*off\b|\bbugger\s*off\b|\bget\s*lost\b|\bdo\s*one\b|\bleave\s*me\s*alone\b|\bdon'?t\s*(text|message|contact)\b|\bblock(ed|ing)?\s*(you|your|this|the\s*number)\b|\breport(ed|ing)?\s*(you|this)\b|\bscam(mer)?\b|\bspam\b|\bharass)/i;

export const AUTO_SEND_DEFAULT_DAILY_CAP = 30;
export const AUTO_SEND_MAX_DAILY_CAP = 200;
/** The human-looking wait before an automatic reply goes (and after the send hours open). */
export const AUTO_SEND_MIN_DELAY_MS = 3 * 60_000;
export const AUTO_SEND_MAX_DELAY_MS = 8 * 60_000;
/** A person typed in, or sent into, the conversation this recently: the AI keeps out. */
export const PERSON_ACTIVE_MS = 10 * 60_000;
/** The Inbox reply box marks "a person is typing here" at most this often per conversation (well inside PERSON_ACTIVE_MS). */
export const TYPING_MARK_EVERY_MS = 30_000;
/** It must reach them with this much of WhatsApp's 24 hours left, or it stays a draft. */
export const AUTO_SEND_WINDOW_MARGIN_MS = 15 * 60_000;
/** The thread label on a message the AI sent by itself. */
export const SENT_BY_AI_LABEL = 'Sent by AI';

/* THE FIRST REPLY PITCH GOES BY ITSELF ONLY ON A SIMPLE CONFIRMATION OR THE "HOW CAN I HELP" FAMILY (Paul, 2026-10-21).
   pickMove also pitches on a name, "hello?", "what's this about", "interested"… — those wait for approval. Every message
   they sent since our last one must be one of these (a lone "?" / "." adds nothing and is skipped). */
const GREET = '(?:hi|hiya|hello|hey|morning|afternoon|evening|good (?:morning|afternoon|evening))';
const CONFIRM = "(?:yes|yeah|yea|yep|yup|ya|yh|aye|ok|okay|correct|speaking|it is|yes it is|yeah it is|that'?s (?:right|correct|me|us|it|him|her)|this is (?:he|she|him|her|me|us))";
const HELP = '(?:how (?:can|may) (?:i|we) (?:help|assist)(?: you)?|(?:can|may) (?:i|we) help(?: you)?|what can (?:i|we) do for you|what can (?:i|we) help (?:you )?with)';
const TAIL = '(?:thanks|thank you|mate|pal|please)';
export const SIMPLE_FIRST_REPLY = new RegExp(`^(?:${GREET} )?(?:${CONFIRM} )*(?:${CONFIRM}|${HELP})(?: ${HELP})?(?: ${TAIL})?$`);
/** Lowercase, emojis and punctuation out (apostrophes kept), spaces collapsed. */
const plainWords = (s: string): string => String(s ?? '').toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z' ]+/g, ' ').replace(/\s+/g, ' ').trim();
export function isSimpleFirstReply(theirMessages: readonly string[]): boolean {
  const said = theirMessages.map(plainWords).filter((w) => w.length > 0);
  return said.length > 0 && said.every((w) => SIMPLE_FIRST_REPLY.test(w));
}

/** The audit AND the website check are complete — not merely final (draftEvidenceWait.ts): the audit has a complete run and
 *  the site was read (issues / clean), or there is none to read (no website / only a profile). A failed audit, a site we
 *  could not read or a failed crawl is NOT complete. Absent = not complete. */
export const COMPLETE_SITE_STATES: ReadonlySet<string> = new Set(['issues', 'clean', 'no_website', 'profile']);
export function evidenceComplete(audit: string | null | undefined, siteState: string | null | undefined): boolean {
  return audit === 'done' && COMPLETE_SITE_STATES.has(String(siteState ?? ''));
}

/** The reply type of a plan: the playbook intent, else the move (the same key the draft outcome log uses). */
export const autoSendKey = (p: Pick<MovePlan, 'intent' | 'move'>): string => String(p.intent || p.move || '');

/** 3 to 8 minutes, uniformly. `rand` is injectable for tests. */
export function autoSendDelayMs(rand: () => number = Math.random): number {
  const r = Math.min(Math.max(Number(rand()) || 0, 0), 1);
  return Math.round(AUTO_SEND_MIN_DELAY_MS + r * (AUTO_SEND_MAX_DELAY_MS - AUTO_SEND_MIN_DELAY_MS));
}

/** Only known choices, once each, in the switches' order. Anything else is dropped (never stored, never honoured). */
export function cleanAutoSendKeys(v: unknown): string[] {
  const asked = new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  return AUTO_SEND_CHOICES.map((c) => c.key).filter((k) => asked.has(k));
}

export function cleanDailyCap(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  if (!Number.isInteger(n) || n < 0 || n > AUTO_SEND_MAX_DAILY_CAP) return null;
  return n;
}

/** Can this type EVER be sent automatically (independent of the switches)? Positive: on the list and no risky flag. */
export function autoSendable(key: string): boolean {
  if (!CHOICE_KEYS.has(key) || NEVER_AUTO_KEYS.has(key)) return false;
  if ((NEEDS_YOU_INTENTS as readonly string[]).includes(key)) return false;
  const e = (PLAYBOOK as Record<string, (typeof PLAYBOOK)[PlaybookIntent] | undefined>)[key];
  if (e && (e.factual || e.allowPrice || e.confidence || e.timingOk || e.linkOk)) return false;
  return true;
}

/** The first reason in the WHOLE thread that makes it a person's conversation for good, or null. Every prospect message
 *  is read as the newest one (pickMove on the thread up to it) plus the opt-out / anger phrases on its own words. */
export function threadHardReason(input: MoveInput): string | null {
  for (let k = 0; k < input.thread.length; k++) {
    const m = input.thread[k];
    if (m.from !== 'them') continue;
    const text = String(m.text ?? '');
    if (isOptOut(text)) return 'opt_out';
    if (isAngry(text) || HOSTILE_WORDS.test(text)) return 'angry';
    const p = pickMove({ ...input, thread: input.thread.slice(0, k + 1), aiSentSinceWin: 0 });
    if (p.stop) return p.needsYou?.reason ?? 'opt_out';
    if (p.needsYou && HARD_THREAD_REASONS.has(p.needsYou.reason)) return p.needsYou.reason;
    if (p.intent && SOFT_NO_INTENTS.has(p.intent)) return 'not_interested';
  }
  return null;
}

/** What the draft itself is, from the plan (at draft time) or the stored "why" (at send time). */
export interface DraftFacts {
  key: string;
  kind: string;                 // ai_reply_drafts.kind ('draft' only)
  text: string | null;
  needsYou: boolean;
  stop: boolean;
  noDraft: boolean;
  label: string | null;         // 'Auto-reply' never goes
  confidence: boolean;
  allowPrice: boolean;
  problems: readonly string[];  // the checker's warnings
  usedFallback: boolean;
  /** The audit and the website check were complete when it was written (evidenceComplete). Absent = false. */
  evidenceComplete: boolean;
}

export interface AutoSendFacts {
  /** The Inbox reply mode is Auto (src/lib/inboxReplyMode.ts). Draft for approval and Manual never send by themselves. */
  masterOn: boolean;
  /** Every message they sent since our last one, oldest first (the first-reply pitch's simple-confirmation rule). */
  theirMessages: readonly string[];
  intentsOn: readonly string[];
  dailyCap: number;
  /** Automatic sends already counted today (London day): at draft time queued + sent, at send time sent. */
  usedToday: number;
  draft: DraftFacts;
  latestInbound: string;
  /** threadHardReason at draft time; the stored one (or a re-read) at send time. */
  threadHard: string | null;
  /** WhatsApp digits we would send to. */
  digits: string;
  lead: { amount_paid?: unknown; status?: unknown; is_archived?: unknown } | null;
  suppressed: boolean;
  /** The newest moment a person typed in or sent into this conversation, or null. Unreadable = pass `nowMs` (active). */
  personActiveAt: string | number | null;
  /** The account the message is sent as is an admin today. */
  senderIsAdmin: boolean;
  nowMs: number;
}

export type AutoSendRefusal =
  | 'master_off' | 'intent_off' | 'not_auto_type' | 'not_a_draft' | 'no_text' | 'needs_you' | 'stop' | 'auto_reply_label'
  | 'price_or_proof' | 'checker_warned' | 'fallback' | 'non_uk' | 'client' | 'archived' | 'thread_flagged' | 'suppressed'
  | 'person_active' | 'daily_cap' | 'no_sender' | 'evidence_incomplete' | 'not_simple_first_reply' | 'has_link';

export type AutoSendVerdict = { send: true; key: string } | { send: false; reason: AutoSendRefusal };

export const AUTO_SEND_REFUSAL_LABELS: Record<AutoSendRefusal, string> = {
  master_off: 'The Inbox mode is not Auto',
  evidence_incomplete: 'The audit or website check was not complete',
  not_simple_first_reply: 'Their first reply was not a plain "yes" or "how can I help"',
  has_link: 'The draft carries a link (the report link is approve-to-send only)',
  intent_off: 'This reply type is not switched on',
  not_auto_type: 'This reply type is never sent automatically',
  not_a_draft: 'Not a plain draft',
  no_text: 'No draft text',
  needs_you: 'Needs you',
  stop: 'They asked to stop',
  auto_reply_label: 'An automatic reply from them',
  price_or_proof: 'Price, guarantee or proof in their message',
  checker_warned: 'The checker warned on the draft',
  fallback: 'The model was unavailable (rule-built draft)',
  non_uk: 'Not a UK mobile',
  client: 'A client',
  archived: 'Archived lead',
  thread_flagged: 'This conversation had a stop, complaint or no earlier',
  suppressed: 'On the opt-out / Do Not Contact list',
  person_active: 'Someone typed or sent here in the last 10 minutes',
  daily_cap: 'Daily limit reached',
  no_sender: 'No admin to send as',
};

const ms = (v: string | number | null): number => (typeof v === 'number' ? v : v ? Date.parse(v) : NaN);

/** Any web address in a draft: https://, www., a findable.live/r/ style bare link, or our bare site name (the service-question
 *  line, 2026-10-26: WhatsApp makes "findable.live" a link, so that draft is approve-to-send too). */
const DRAFT_LINK = /https?:\/\/|\bwww\.|\b[a-z0-9-]+\.(?:live|co\.uk|com|uk|net|org|io)\/\S|\bfindable\.live\b/i;

/** THE RULE. The order only decides which reason is reported; every check must pass for `send: true`. */
export function autoSendVerdict(f: AutoSendFacts): AutoSendVerdict {
  const d = f.draft;
  const no = (reason: AutoSendRefusal): AutoSendVerdict => ({ send: false, reason });
  if (f.masterOn !== true) return no('master_off');
  if (d.stop) return no('stop');
  if (f.suppressed !== false) return no('suppressed');
  if (!autoSendable(d.key)) return no('not_auto_type');
  if (!f.intentsOn.includes(d.key)) return no('intent_off');
  if (d.kind !== 'draft' || d.noDraft) return no('not_a_draft');
  if (d.needsYou) return no('needs_you');
  if (d.label === 'Auto-reply') return no('auto_reply_label');
  if (!String(d.text ?? '').trim()) return no('no_text');
  /* ⛔ A draft with a link (the report link) is approve-to-send only, never sent by itself (Paul, 2026-10-26). */
  if (DRAFT_LINK.test(String(d.text ?? ''))) return no('has_link');
  if (d.confidence || d.allowPrice || PRICE_OR_PROOF.test(String(f.latestInbound ?? ''))) return no('price_or_proof');
  if (HOSTILE_WORDS.test(String(f.latestInbound ?? ''))) return no('thread_flagged');
  if (d.problems.length > 0) return no('checker_warned');
  if (d.usedFallback) return no('fallback');
  if (d.evidenceComplete !== true) return no('evidence_incomplete');
  if (d.key === 'first_reply_pitch' && !isSimpleFirstReply(f.theirMessages ?? [])) return no('not_simple_first_reply');
  if (mobileMarketOf(f.digits) !== 'UK') return no('non_uk');
  if (!f.lead) return no('client');
  if (isClientLead(f.lead)) return no('client');
  if (f.lead.is_archived === true) return no('archived');
  if (f.threadHard !== null) return no('thread_flagged');
  const active = ms(f.personActiveAt);
  if (f.personActiveAt !== null && (!Number.isFinite(active) || f.nowMs - active < PERSON_ACTIVE_MS)) return no('person_active');
  if (!Number.isInteger(f.dailyCap) || f.dailyCap <= 0 || !Number.isFinite(f.usedToday) || f.usedToday >= f.dailyCap) return no('daily_cap');
  if (f.senderIsAdmin !== true) return no('no_sender');
  return { send: true, key: d.key };
}

/** The draft's facts from pickMove's plan and the written draft (the tick). */
export function draftFactsFromPlan(plan: MovePlan, w: { kind: string; text: string | null; problems: readonly string[]; usedFallback: boolean; evidenceComplete: boolean }): DraftFacts {
  return {
    key: autoSendKey(plan), kind: w.kind, text: w.text, needsYou: !!plan.needsYou, stop: plan.stop === true, noDraft: plan.noDraft === true,
    label: plan.label ?? null, confidence: plan.confidence === true, allowPrice: plan.allowPrice === true, problems: w.problems, usedFallback: w.usedFallback,
    evidenceComplete: w.evidenceComplete === true,
  };
}

/** Their messages since our last one, oldest first (a thread in pickMove's shape). */
export function theirMessagesSinceUs(thread: ReadonlyArray<{ from: 'us' | 'them'; text?: string | null }>): string[] {
  const out: string[] = [];
  for (let k = thread.length - 1; k >= 0 && thread[k].from === 'them'; k--) out.unshift(String(thread[k].text ?? ''));
  return out;
}

/** The draft's facts from the stored row (the drain, just before sending). Missing fields read as the unsafe value. */
export function draftFactsFromRow(row: { kind?: unknown; draft_text?: unknown; why?: Record<string, unknown> | null }): DraftFacts {
  const w = row.why ?? {};
  const key = String((typeof w.intent === 'string' && w.intent) || (typeof w.move === 'string' && w.move) || '');
  return {
    key, kind: String(row.kind ?? ''), text: typeof row.draft_text === 'string' ? row.draft_text : null,
    needsYou: w.needsYou !== null && w.needsYou !== undefined && w.needsYou !== false,
    stop: w.stop !== false, noDraft: w.noDraft === true,
    label: typeof w.label === 'string' ? w.label : null,
    confidence: w.confidence !== null && w.confidence !== undefined && w.confidence !== false,
    allowPrice: false,
    problems: Array.isArray(w.problems) ? (w.problems as string[]) : ['unreadable'],
    usedFallback: w.usedFallback !== false,
    evidenceComplete: (w.evidence as { complete?: unknown } | null | undefined)?.complete === true,
  };
}

/** When the reply should go: a 3–8 minute wait from now, or from the moment their send hours open. Null when that would
 *  leave less than `AUTO_SEND_WINDOW_MARGIN_MS` of WhatsApp's 24 hours (it stays a draft). */
export function autoSendAt(a: { nowMs: number; inboundAtMs: number; windowOpenNow: boolean; nextOpenMs: number; delayMs: number }): number | null {
  const base = a.windowOpenNow ? a.nowMs : Math.max(a.nowMs, a.nextOpenMs);
  const at = base + a.delayMs;
  if (!Number.isFinite(a.inboundAtMs) || at > a.inboundAtMs + 24 * 3_600_000 - AUTO_SEND_WINDOW_MARGIN_MS) return null;
  return at;
}
