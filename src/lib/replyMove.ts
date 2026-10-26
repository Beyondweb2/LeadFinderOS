/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE NEXT MOVE — code decides, the model only phrases it (Paul, 2026-10-20). Record: docs/ai-handles-replies.md.

   pickMove reads the prospect's newest message, the thread and the stored evidence (audit + crawl) and returns:
     · move        — what the reply does (introduce + hook, offer a voice note, set a call, answer from the fact sheet …)
     · points      — the facts the reply may say, in order, built ONLY from the fact sheet and the stored evidence
     · question    — the ONE question it ends on (or none)
     · needsYou    — a flag with a reason when Paul should look (an unsure or unknown reply is always Needs you)
     · stop        — an opt-out or an angry reply: no draft, one-tap "Mark opted out", queued follow-ups cancelled
     · autoDraft   — may the worker draft without a person asking (the loop guards say no)
     · label       — "Auto-reply" / "Only confirmed": not a real reply, never counted as Replied

   ⛔ THE FIRST REPLY THAT ONLY CONFIRMS WHO THEY ARE gets the FULL PITCH (Paul, 2026-10-20, firstReplyPitch): the AI result,
      what the crawl found on their site, then "agency or yourself?". Every word is code-built (fixedText), never the model's.
      The voice note is offered on the NEXT reply, the call after that. No draft says it is sending anything "now".
   ⛔ NOTHING HERE SENDS. ⛔ Voice note first, call after. ⛔ No sign-up link, ever; prices only after a price question or a
      clear yes. ⛔ "AI named others instead" only when named in at most a third (namedShareRule.ts).
   Pure and edge-reachable: relative imports with .ts, no Deno, no DOM.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { triageByRules } from './replyTriage.ts';
import { factFor, CONFIDENCE_LINE, GUARANTEE_REFUND, ENGINE_WORDING, type FactTopic } from './offerFactSheet.ts';
import { mayClaimNamedInstead } from './namedShareRule.ts';
import { carryOn } from './draftEvidence.ts';
import { GOOGLE_LISTING_NO_LINK, PITCH_MAX_LIST, PITCH_MIN_LIST, PITCH_MAX_WORDS, UNREADABLE_PITCH_LINE as UNREADABLE_LINE, wordCount } from './pitchIssueWords.ts';
import {
  PLAYBOOK, RE, splitQuestion, readEndDate, nameFromReply, nearSameName, rivalsExcludingSelf, DONT_NEED_SOFT, DOES_AI_MATTER_SOFT,
  DONT_NEED_NO_AUDIT, DOES_AI_MATTER_NO_AUDIT, PRIVACY_NOT_GOOGLE, GO_ON_KNOWN, NOT_NOW_WITH_TIME, WEBSITE_GIVEN_KNOWN,
  EXAMPLES_NO_AUDIT, PROOF_NO_AUDIT, ALREADY_SHOW_UP_TRUE, ALREADY_SHOW_UP_NO_AUDIT, NEW_SITE_CHECK_BACK, VOICE_NOTE_FROM_THEM,
  type PlaybookIntent, type FollowUpNote,
} from './replyPlaybook.ts';
import { REMEASURE_WEEKS_STANDARD } from './findableOffer.ts';
/* ⛔ THE PLAYBOOK (Paul, 2026-10-20, replyPlaybook.ts, docs/reply-playbook.md): the FIRST reply to our opener gets the pitch
   unless it is a no / stop / angry, a wrong person or a direct question; from then on one intent per reply, one question per
   message, the agency → contract → call / voice note order. Anything unmatched is Needs you with NO draft. */

export type MoveId =
  | 'stop' | 'intro_hook' | 'first_reply_pitch' | 'pitch_next' | 'site_followup' | 'offer_voice_note' | 'set_call' | 'answer_fact' | 'objection_provider' | 'objection_rank'
  | 'close_politely' | 'is_bot' | 'media' | 'ack' | 'auto_reply' | 'privacy' | 'other_language' | 'link'
  | 'escalate' | 'unknown_question' | 'unsure' | 'playbook' | 'site_shared';

export type NeedsYouReason =
  | 'opt_out' | 'angry' | 'do_not_contact' | 'not_interested' | 'wrong_person' | 'legal' | 'complaint' | 'payment'
  | 'media' | 'privacy' | 'other_language' | 'link' | 'question_not_on_sheet' | 'paul_looks' | 'unsure'
  | 'already_replied' | 'ai_limit' | 'repeat_auto_reply' | 'draft_failed' | 'paused' | 'email_given' | 'off_topic'
  | 'commercial_ask' | 'call_now' | 'wrong_trade' | 'cant_send' | 'third_party' | 'chased' | 'prospect_only' | 'site_not_checked';

export const NEEDS_YOU_LABELS: Record<NeedsYouReason, string> = {
  opt_out: 'Asked to stop',
  angry: 'Sounds angry',
  do_not_contact: 'On the Do Not Contact / opt-out list',
  not_interested: 'Said no',
  wrong_person: 'Says wrong number or wrong person',
  legal: 'Mentions legal action, a complaint body or a scam',
  complaint: 'Reads as a complaint',
  payment: 'Mentions money back, a refund or cancelling',
  media: 'Sent a voice note, photo or file: listen or look first',
  privacy: 'Asked how we got their number',
  other_language: 'Not written in English',
  link: 'Sent a link: look at it first',
  question_not_on_sheet: 'Asked something the fact sheet does not answer',
  paul_looks: 'A contract question: check the answer before it goes',
  unsure: 'Not sure what they mean',
  already_replied: 'We already replied and they have not answered',
  ai_limit: 'Three AI replies with no call or voice note yet',
  repeat_auto_reply: 'Another auto-reply',
  draft_failed: 'The draft could not be written',
  paused: 'Paid AI is paused',
  email_given: 'Gave an email address: send it yourself',
  off_topic: 'No playbook reply fits: answer it yourself',
  commercial_ask: 'Asks for a different deal (pay on results, free first): check the suggested reply',
  call_now: 'Wants to talk now: only you know if you are free',
  wrong_trade: 'Says we have the wrong trade: fix the trade on the lead first',
  cant_send: "Asks for something we can't send (a reference, testimonial or case study)",
  third_party: 'Gave another business or person: run the check on that one',
  chased: 'They chased us: answer their earlier message',
  prospect_only: 'Australian prospect asked about price: prospect-only, no price here',
  site_not_checked: 'Sent their website: add it to the lead, press Crawl site, then Regenerate',
};

export interface MoveThreadMsg {
  from: 'us' | 'them';
  text: string;
  messageType?: string | null;
  templateName?: string | null;
  /** When it arrived (ISO). Absent on fixtures: then no burst is read (each message stands alone). */
  at?: string | null;
  /** Set by mergeBursts: one of the merged messages was an auto-reply on its own wording (the whole turn then reads as one). */
  autoPart?: boolean;
}

/** Messages from the same prospect with nothing of ours between them and no more than this apart are ONE turn ("Yes" then
 *  "How can I help?"). Measured: 75% of follow-on messages arrive within 5 minutes (reply recon 2026-10-20). */
export const MERGE_WINDOW_MS = 300_000;
/** One turn per burst of prospect messages (Paul, 2026-10-21). Chained: each message within MERGE_WINDOW_MS of the one before. No
 *  timestamp on either side = not merged. Identical repeats are dropped. Text joins with ". " unless the part already ends in
 *  punctuation. The turn's time is its newest message. */
export function mergeBursts(thread: MoveThreadMsg[]): MoveThreadMsg[] {
  const out: MoveThreadMsg[] = [];
  let run: MoveThreadMsg[] = [];
  const flush = () => {
    if (!run.length) return;
    if (run.length === 1) { out.push(run[0]); run = []; return; }
    /* An auto-reply then a person's own confirmation in the same burst ("Thank you for contacting Brill… / Yeah"): the person's
       words are the reply, read on their own (reply recon R002, R004, R041). Ven's three auto messages stay one auto-reply. */
    const autoAt = run.map((m) => m.autoPart ?? isAutoReply(m.text, m.messageType));
    const lastAuto = autoAt.lastIndexOf(true);
    const human = lastAuto >= 0 ? run.slice(lastAuto + 1) : [];
    const humanConfirms = human.some((m) => HUMAN_CONFIRM.test(String(m.text ?? '').trim()));
    if (humanConfirms) run = human;
    if (run.length === 1) { out.push({ ...run[0], autoPart: false }); run = []; return; }
    const parts: string[] = []; const seen = new Set<string>();
    for (const m of run) {
      const t = String(m.text ?? '').replace(/\s+/g, ' ').trim();
      const key = t.toLowerCase();
      /* A lone "?" or "." sent as its own message adds nothing ("Yes / How can I help you? / ?"). */
      if (!t || !/[\p{L}\p{N}\p{Extended_Pictographic}]/u.test(t) || seen.has(key)) continue;
      seen.add(key); parts.push(t);
    }
    const text = parts.reduce((acc, p) => (acc ? `${acc}${/[.!?:;,]$/.test(acc) ? ' ' : '. '}${p}` : p), '');
    const real = run.filter((m) => (m.messageType ?? 'text') === 'text' && !/^\[[a-z_]+\]$/i.test(String(m.text ?? '').trim()));
    const last = run[run.length - 1];
    out.push({ from: 'them', text, messageType: real.length ? 'text' : last.messageType ?? 'text', templateName: last.templateName ?? null, at: last.at ?? null,
      autoPart: !humanConfirms && run.some((m) => m.autoPart ?? isAutoReply(m.text, m.messageType)) });
    run = [];
  };
  for (const m of thread) {
    if (m.from !== 'them') { flush(); out.push(m); continue; }
    const prev = run[run.length - 1];
    if (prev) {
      const a = Date.parse(prev.at ?? ''); const b = Date.parse(m.at ?? '');
      if (!(Number.isFinite(a) && Number.isFinite(b) && b - a >= 0 && b - a <= MERGE_WINDOW_MS)) flush();
    }
    run.push(m);
  }
  flush();
  return out;
}

export interface MoveEvidence {
  businessName: string;
  trade: string | null;
  town: string | null;
  /** The AI tool this conversation names: 'chatgpt' | 'gemini' | 'ai' (draftEvidence.conversationEngine). */
  engineWords: string;
  /** Named / total answers IN THE SCORE the audit shows: every engine scored, Google AI included where it is scored
   *  (hookScore `scored`, Paul 2026-10-20: Nola is 1 of 3, never 1 of 2). null = no counts on record (then no "instead" claim). */
  named: { named: number; valid: number } | null;
  /** THE BEST MISSED SEARCH: the engine + question where the business was NOT named (the hook pick); `competitors` are
   *  that answer's names. Absent = the search is said as trade + town. */
  missed?: { engine: string; question: string } | null;
  /** At most three, from the audit only. */
  competitors: string[];
  hookAlreadySent: boolean;
  /** The crawl's own findings (observed wording). Empty = say nothing about the site. */
  findings: Array<{ title: string; said: string }>;
  hasWebsite: boolean;
  /** Only a name the business's own site states as owner / founder, or the prospect gave. */
  ownerName: string | null;
  /** The lead was found on Google (a place id) — the honest answer to "how did you get my number". */
  foundOnGoogle: boolean;
  /** THE ONE WEBSITE CHECK (websiteCheck.ts websiteCheckFor): its state and the SERIOUS issues' plain titles
   *  (plainIssueTitle), worst first; `pitch` = the same issues in the pitch's plain words (pitchIssueWords.ts), any
   *  with no plain words left out. Absent = read from hasWebsite / findings (older callers, fixtures). */
  site?: { state: SiteState; issues: string[]; pitch?: string[]; evidence?: Array<{ title: string; pages: string[] }> } | null;
  /** The "AI handles replies" switch (whatsapp_outreach_state.ai_handles_replies). ON: never say "I read and send every
   *  one myself" — replies may be automated. Absent = off. */
  aiAutoReplies?: boolean;
  /** The website the check above was run on (the lead's website), for the site-shared reply. */
  websiteUrl?: string | null;
  /** A prospect-only country (prospectOnly.ts, Australia): never a price, the guarantee or a sign-up in a draft. */
  prospectOnly?: boolean;
  /** The lead's own report link (findable.live/r/<code>), set ONLY when its audit has a finished run (loadAuditContext).
   *  Absent = the audit is not ready: the pitch carries no link and the draft is flagged audit pending. */
  reportUrl?: string | null;
}
export type SiteState = 'issues' | 'clean' | 'not_checked' | 'unreadable' | 'no_website' | 'profile';

export interface MoveInput {
  /** Oldest first; the newest prospect message is the LAST 'them' row. */
  thread: MoveThreadMsg[];
  suppressed: boolean;
  /** AI drafts sent since the last win event (a voice note we sent, a booked call). */
  aiSentSinceWin: number;
  evidence: MoveEvidence;
  /** Today, for reading an end date ("until March"). Absent = now. */
  nowMs?: number;
}

export interface MovePlan {
  move: MoveId;
  topic: FactTopic | null;
  needsYou: { reason: NeedsYouReason; label: string } | null;
  stop: boolean;
  autoDraft: boolean;
  /** What the reply says, in order. Facts only; the model phrases them. */
  points: string[];
  /** The one question to end on, or null for none. */
  question: string | null;
  /** May the draft state a price (a price question, or a clear yes earlier in the thread). */
  allowPrice: boolean;
  label: 'Auto-reply' | 'Only confirmed' | null;
  /** The inbound class code read, for the "why" panel. */
  read: string;
  /** Set only when CODE wrote every word (the first-reply pitch): the draft is this text, the model is not asked. */
  fixedText?: string | null;
  /** How the message ends, recorded on the draft (Paul, 2026-10-20): the pitch's 'emotional' closer, or the next step. */
  closer?: 'emotional' | 'agency' | 'site' | null;
  /** How a code-built pitch / site-shared reply was built (why.structure), so reply rates can be compared by structure. */
  structure?: PitchStructure | null;
  /** Their first reply to our opener (the pitch is still owed): written in the first-message style, "AI" in capitals. */
  firstReply?: boolean;
  /** The confidence line (offerFactSheet CONFIDENCE_LINE) is one of the points, recorded on the draft. */
  confidence?: boolean;
  /** No draft at all, not even on "Draft reply": a person answers (Paul, 2026-10-20: stop, not interested, off-topic, unmatched). */
  noDraft?: boolean;
  /** The playbook intent code read (replyPlaybook.ts), for the "why" panel. */
  intent?: PlaybookIntent | null;
  /** The playbook line in full: the model's guide and the rule-built fallback. */
  guide?: string | null;
  /** Paul's own timing words are allowed ("Sending it now"). */
  timingOk?: boolean;
  /** A first name THEY gave in this conversation ("Dom here"): the greeting may use it. */
  greetName?: string | null;
  /** They asked WHICH AI tool (RE.whichTool): the only draft that may name one (Paul, 2026-10-21). Absent = no brand names. */
  brandsAllowed?: boolean;
  /** Tied into a contract until a day we could read: noted on the draft. ⛔ Never written to the lead (Next Action is
   *  human-set): the person sets it when they send. */
  followUp?: FollowUpNote | null;
  /** A win for the loop guard once this draft is sent (a call time agreed). */
  win?: 'call_time_agreed' | null;
  /** A note for the person ("They gave a new website: run Crawl site on it"). */
  note?: string | null;
  /** The line carries our own links only (replyPlaybook FINDABLE_SITE_WORDS / BUILT_SITE_EXAMPLE_URL): the checker allows those. */
  linkOk?: boolean;
  /** A first-reply pitch written with no report link because the lead's audit is not finished (Paul, 2026-10-23). */
  auditPending?: boolean;
}

/* ── reading words ────────────────────────────────────────────────────────────────────────────── */

const norm = (t: string) => String(t ?? '').replace(/[’‘ʼ]/g, "'").replace(/\s+/g, ' ').trim();

/** Swearing at us, "bugger off", "spam" — an angry reply (Paul: a stop or angry reply opts them out). */
const ANGRY = /\b(f+u+c+k\w*|f\W{0,3}k\s*off|fck\w*|shit\w*|bollocks|piss\s*off|sod\s*off|bugger\s*off|jog\s*on|do\s+one|get\s+lost|go\s+away|wanker|twat|prick|arsehole|asshole|bastard\w*|wtf|stfu|spam(?:ming|mer)?|how\s+dare|pathetic|joke\s+of\s+a|waste\s+of\s+(?:my|our)\s+time)\b/i;
const STARRED_OFF = /(?:^|\s)f[*#@!\W]{2,4}k?\s*off\b/i;
export const isAngry = (t: string) => ANGRY.test(norm(t)) || STARRED_OFF.test(norm(t));
/** Stop phrases the shared triage list misses ("scrub me off your list"). Narrow: a list / number removal only. */
const STOP_EXTRA = /\b(scrub|take|remove|delete|strike|cross)\s+(me|us|my\s+number|this\s+number)\s+(off|from)\b|\boff\s+(your|the)\s+(list|database|system)\b/i;

const BOT = /\b(are\s+(you|u)\s+(a\s+)?(bot|robot|real|human|ai|automated|a\s+real\s+person)|(is\s+this|this\s+is)\s+(a\s+)?(bot|robot|automated|ai|real)|r\s+u\s+(human|real|a\s+bot)|bot\??$|wind\s*(me\s+)?up|is\s+this\s+(a\s+)?(joke|prank|real))/i;
/** "?", "who", "who's this": they want to know who is messaging. Answered like the opener's yes (who I am + the search). */
const WHO_ONLY = /^\W*(\?+|who\??|who'?s\s+this\??|who\s+is\s+this\??|who\s+are\s+(you|u)\??)\W*$/i;
/** Laughing at us, and nothing else: not interest, maybe mockery. A person looks. */
const LAUGH_ONLY = /^[\s\u{1F923}\u{1F602}\u{1F606}\u{1F604}\u{1F601}\u{1F639}]+$|^\W*(lol|lmao|haha+|hehe+)\W*$/iu;
const PRIVACY = /\b(who\s+gave\s+(you|u)\s+(my|this)\s+(number|details)|where\s+did\s+(you|u)\s+get\s+(my|this)\s+(number|details)|how\s+did\s+(you|u)\s+get\s+(my|this)\s+(number|details))\b/i;
const LINK = /https?:\/\/|www\.|\b[a-z0-9-]+\.(?:co\.uk|com|uk|net|org|io)\b/i;
/** Our message said we found no website: the no-website pitch, its question, or the playbook's no-website lines. */
const SAID_NO_SITE = /\bcouldn'?t\s+find\s+(a\s+website|one\s+for\s+you)|\bwebsite\s+i'?ve\s+missed\b|\bnothing\s+of\s+yours\s+to\s+read\b/i;
/** "How can I get up on the AI search?", "what do I need to do?", "how can you help?", "how do I fix it?" (never "how can I help"). */
const HOW_TO_GET_NAMED = /\bhow\s+(?:can|do|would|could|should)\s+(?:i|we)\s+(?:get|be|show|come|appear|rank|improve|fix|sort|change)\b|\bhow\s+(?:can|could|would)\s+(?:you|u)\s+help\b|\bwhat\s+(?:do|would|should)\s+(?:i|we)\s+(?:need\s+to\s+)?do\b|\bhow\s+do\s+(?:i|we|you|u)\s+fix\b/i;
/** The "how" answer (Paul, 2026-10-23): three short lines, no price, the one either/or question last. */
export function howToGetNamedLine(theyRunIt: boolean): string {
  return `${theyRunIt ? 'Good, that makes it easier.' : 'Good question.'} The main thing I work on is a website AI can read properly, with clear pages for what you do and where you do it.\n`
    + 'I build that for you, and check how often AI names you before and after.\n'
    + 'Easiest to explain properly. Voice note, or a quick call?';
}
const hostOf = (u: string | null | undefined): string | null => {
  const s = String(u ?? '').trim().toLowerCase();
  if (!s) return null;
  const m = /^(?:https?:\/\/)?(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})(?:[/:?#]|$)/.exec(s);
  return m ? m[1].replace(/\.$/, '') : null;
};
/** The first link in their message that is a business website (not a map pin, social profile or directory). */
function siteLinkHost(text: string): string | null {
  for (const m of text.matchAll(/(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:co\.uk|com\.au|org\.uk|com|uk|net|org|io|au)\b[^\s,]*/gi)) {
    const link = m[0];
    if (NOT_THEIR_SITE.test(link) || /\b(facebook|fb)\.(com|me)\b/i.test(link) || /@/.test(text.slice(Math.max(0, (m.index ?? 0) - 1), m.index ?? 0))) continue;
    const h = hostOf(link);
    if (h) return h;
  }
  return null;
}
/** The shared link and the lead's website are the same site (host, www ignored). */
const sameSite = (host: string, url: string | null | undefined): boolean => !!url && hostOf(url) === host;
const VOICE_REQUEST = /\bvoice\s*(note|message|memo)\b|\bsend\s+(me\s+)?a\s+(voice|vn)\b/i;
/** A time they named: "after 5", "tomorrow", "10am", "monday" … */
const NAMED_TIME = /\b(\d{1,2}(:\d{2})?\s*(am|pm)?|after\s+\d|before\s+\d|tomorrow|today|tonight|this\s+(morning|afternoon|evening)|morning|afternoon|evening|lunch(time)?|mon(day)?|tue(s(day)?)?|wed(nesday)?|thu(rs(day)?)?|fri(day)?|sat(urday)?|sun(day)?|now|later|in\s+\d+\s*(mins?|minutes|hours?))\b/i;
const MALAY = /\b(boleh|saya|tak|tidak|berminat|terima\s+kasih|siapa|apa|ini|kami|nak|ya\s+saya|encik|puan|maaf)\b/i;
const ENGLISH_HINT = /\b(the|you|is|it|and|yes|no|what|who|how|thanks|please|mate|me|my|i|we)\b/i;
const PROVIDER = /\b(i\s+pay\s+(him|her|them|someone|a\s+guy)|(my|our)\s+(web\s*)?(guy|guys|designer|developer|nephew|son|daughter|brother|mate|friend|agency|web\s*(person|man|company))|someone('?s)?\s+(on\s+it|does\s+(it|that|my|our))|(got|have)\s+(someone|somebody|a\s+(guy|company|designer|developer|agency))|leave\s+(the\s+)?(website|site|web)\s+(stuff\s+)?to\s+them|they\s+(do|look\s+after|manage)\s+(it|the\s+site|my\s+site|the\s+website))\b/i;
const RANKS = /\b(i\s+(already\s+)?(come\s+up|show\s+up|rank|appear)|already\s+(rank|show|come\s+up|appear|on\s+(the\s+)?first)|first\s+(page|on\s+google)|top\s+of\s+google|number\s+one|(my|our)\s+reviews|five\s+star|5\s*star|\d+\s+reviews)\b/i;
const CLEAR_YES = /\b(yes\s+please|yes\s+send|go\s+on\s+then|go\s+ahead|i'?m\s+interested|we'?re\s+interested|i\s+am\s+interested|interested|sounds\s+(good|great|interesting)|keen|let'?s\s+do\s+it|sign\s+me\s+up|i'?m\s+in(?=\s*(?:[.!,)]|$))|count\s+me\s+in|tell\s+me\s+more|send\s+(me\s+)?(over\s+)?(the\s+|some\s+)?(details|detials|deets|info|more))\b/i;
const NEGATED = /\b(not|n'?t|never|no)\s+([\w']+\s+){0,2}interested\b/i;

/** Which fact-sheet topic a question asks about, or null. Order matters: the specific before the general. */
export function questionTopic(text: string): FactTopic | null {
  const t = norm(text).toLowerCase();
  if (/\b(cancel|get\s+out|leave\s+early|stop\s+paying|exit)\b/.test(t)) return 'cancel';
  if (/\b(guarantee|guaranteed|money\s+back|what\s+if\s+it\s+(does\s*n'?t|doesnt|don'?t)\s+work|refund)\b/.test(t) || WORKS.test(t)) return 'guarantee';
  if (/\b(after\s+(the\s+)?(12|twelve)|after\s+(the\s+)?(first\s+)?year|when\s+it\s+ends|end\s+of\s+the\s+(term|contract))\b/.test(t)) return 'after_term';
  if (/\b(how\s+long\s+(is|for)\s+the\s+(contract|term)|contract|minimum|tied\s+in|commit(ment)?|how\s+many\s+(months|payments))\b/.test(t)) return 'term';
  if (/\b(how\s+much|prices?|cost|costs|charge|fee|£|pricing|what\s+do\s+you\s+charge|rates?)\b/.test(t)) return 'price';
  if (/\b(when\s+do\s+(i|we)\s+pay|monthly\s+start|first\s+payment)\b/.test(t)) return 'monthly_start';
  if (/\b(domain|web\s*address|my\s+url|keep\s+my\s+(address|site\s+name))\b/.test(t)) return 'domain';
  if (/\b(who\s+owns|do\s+i\s+own|will\s+i\s+own|own\s+the\s+(site|website)|whose\s+(site|website))\b/.test(t)) return 'ownership';
  if (/\b(how\s+long\s+(does\s+it|will\s+it|to)\s+(take|build)|how\s+quick|how\s+fast|when\s+would\s+it\s+be\s+(ready|live|done))\b/.test(t)) return 'build_time';
  if (/\b(what\s+do\s+you\s+need|what\s+would\s+you\s+need|what\s+do\s+i\s+(need\s+to|have\s+to)\s+do|what'?s\s+involved)\b/.test(t)) return 'client_needs';
  if (/\b(changes?|update\s+the\s+site|edit\s+(it|the\s+site))\b/.test(t) && /\b(make|want|need|can|how)\b/.test(t)) return 'changes';
  if (/\b(how\s+do\s+you\s+(measure|check|know)|which\s+ai|what\s+ai)\b/.test(t)) return 'measurement';
  if (/\b(what\s+do\s+you\s+do|how\s+does\s+(it|this)\s+work|what\s+is\s+(it|this|findable)|what'?s\s+(this|it)\s+about|what'?s\s+the\s+catch|what\s+exactly)\b/.test(t)) return 'what_we_do';
  return null;
}

const topicOf = (t: string) => questionTopic(t);

/** The newest prospect message and what we sent just before it. */
function latestPair(thread: MoveThreadMsg[]): { latest: MoveThreadMsg | null; prevOurs: MoveThreadMsg | null; idx: number } {
  for (let i = thread.length - 1; i >= 0; i--) {
    if (thread[i].from === 'them') {
      let prev: MoveThreadMsg | null = null;
      for (let j = i - 1; j >= 0; j--) if (thread[j].from === 'us') { prev = thread[j]; break; }
      return { latest: thread[i], prevOurs: prev, idx: i };
    }
  }
  return { latest: null, prevOurs: null, idx: -1 };
}

/** Our message asked "is this <business>?" (the opener), so a bare yes only confirms who they are. */
function wasOpener(m: MoveThreadMsg | null): boolean {
  if (!m) return true;
  /* Every opener template is initial_* (initial_contact, initial_contact_short, initial_opener_v2). A template row with no
     stored text reads "[initial_contact_short]", so the name decides (KSM, 2026-10-20: that miss drafted "voice note now"). */
  /* contact_followup ("Hi, did you get my last message? Paul") only nudges the opener: the pitch is still owed (recon R015-R017). */
  if (/^(?:initial_|contact_followup$)/.test(m.templateName ?? '')) return true;
  if (/^\W*hi,?\s+did\s+you\s+get\s+my\s+last\s+message\?/i.test(m.text ?? '')) return true;
  return /\bis\s+this\b.{0,60}\?/i.test(m.text) && m.text.length < 160;
}
/** A name they gave in an earlier message of theirs before thread[idx] ("Dom here", then "how can I help"). */
function earliestReplyName(thread: MoveThreadMsg[], idx: number, businessName: string): string | null {
  for (const m of thread.slice(0, idx)) if (m.from === 'them') { const n = nameFromReply(m.text, businessName); if (n) return n; }
  return null;
}
/** A message that only confirms who they are or offers help ("Yes", "Yes it is", "How can I help?", "Hi yes, how can I help you"):
 *  never "No playbook reply fits" (Paul, 2026-10-21) — the pitch when it is owed, else the go-on step. */
const HOW_HELP = /^\W*(?:(?:hi|hello|hey|yes|yeah|yep|yup|yh|ok|okay|it\s+is|this\s+is\s+\w+|speaking)\W+)*(?:how\s+(?:can|may)\s+(?:i|we)\s+help(?:\s+you)?|(?:can|may)\s+(?:i|we)\s+help(?:\s+you)?|what\s+can\s+(?:i|we)\s+do\s+for\s+you)(?:\s+today)?\W*$/i;
const HUMAN_CONFIRM_ONLY = /^\W*(?:(?:hi|hello|hey)\W+)?(?:yes|yeah|yea|yep|yup|yh|ya|ye|correct|speaking|it\s+is|it'?s\s+me|that'?s\s+(?:right|correct|us|me))(?:\W+(?:yes|it\s+is|that'?s\s+(?:right|correct|us|me)|correct|speaking|thanks?|thank\s+you))*\W*$/i;
export function isPlainConfirm(text: string, category: string | null | undefined): boolean {
  const t = String(text ?? '').trim();
  if (!t) return false;
  return category === 'confirmed_contact' || HOW_HELP.test(t) || HUMAN_CONFIRM_ONLY.test(t);
}
/** Nothing of ours before thread[idx] but the opener and its nudge: the pitch has not been sent yet. */
function pitchOwed(thread: MoveThreadMsg[], idx: number): boolean {
  const ours = thread.slice(0, idx).filter((m) => m.from === 'us');
  return ours.length > 0 && ours.every((m) => wasOpener(m));
}

/** Inbound label for the Inbox: an auto-responder or a bare identity confirmation is not a real reply. */
/** Auto-responder wording the shared triage list misses ("Thanks for your message, we are away until Monday"). Local on
 *  purpose: the shared list also drives the live first-reply automation. Never a question from a person. */
const AUTO_EXTRA = /\bthank(?:s|\s+you)\s+for\s+(?:your|the)\s+(?:message|enquiry|inquiry)\b[^?]*\b(?:away|out\s+of\s+(?:the\s+)?office|on\s+holiday|get\s+back|reply|respond|be\s+in\s+touch|shortly|as\s+soon\s+as)\b/i;
/** A WhatsApp Business greeting message: "Thanks for contacting Ven Language Services", "Welcome to …" (Ven, 2026-10-19).
 *  People do not thank you for contacting them; a question at the end means a person, so that is left alone. */
const AUTO_GREETING = /\b(?:thanks|thank\s+you)\s+for\s+(?:contacting|messaging|choosing|calling)\b|^\W*(?:hi|hello)?\W*welcome\s+to\s+\w/i;
/** An auto-responder in another language (Spanish, French, Portuguese, Italian, German): "Gracias por contactarnos, le
 *  responderemos lo antes posible". Auto-reply wording only, never a person simply writing in another language. */
const FOREIGN_AUTO = new RegExp([
  /\bgracias\s+por\s+(?:contactar\w*|comunicar\w*|escribir\w*|su\s+mensaje|tu\s+mensaje|elegir\w*)/.source,
  /\b(?:te|le|les|os)\s+(?:responderemos|contestaremos|atenderemos)\b/.source, /\blo\s+antes\s+posible\b/.source,
  /\bfuera\s+de\s+(?:la\s+)?oficina\b/.source, /\bhorario\s+de\s+atenci[oó]n\b/.source,
  /\bmerci\s+(?:pour|de)\s+votre\s+(?:message|demande)/.source, /\bnous\s+vous\s+r[eé]pondrons\b/.source, /\bdans\s+les\s+plus\s+brefs\s+d[eé]lais\b/.source,
  /\bobrigad[oa]\s+(?:pelo|por)\s+(?:o\s+|a\s+)?(?:seu\s+|sua\s+)?(?:contato|contacto|mensagem)/.source, /\bresponderemos\b/.source,
  /\bgrazie\s+per\s+(?:averci\s+contattat\w|il\s+(?:tuo|suo)\s+messaggio)/.source, /\brisponderemo\b/.source,
  /\bdanke\s+f[uü]r\s+(?:ihre|deine)\s+nachricht/.source, /\bwir\s+melden\s+uns\b/.source,
].join('|'), 'i');
/** B8 (reply recon): a business's auto-reply that asks for a form or quotes a consultation fee. Read BEFORE the link, price and
 *  what-we-do rules, so "fill out our form [link]" is not their website and "consultation fee £75" is not a price question. */
const AUTO_FORM = /\bthank(?:s|\s+you)\s+for\s+(?:your\s+)?(?:message|enquiry|inquiry|contacting\b[^.!?]*)[^?]*\b(?:fill\s+(?:in|out)|complete)\s+(?:our|the)\s+(?:\w+\s+)?form\b|\bconsultation\s+fee\b[^?]*\b(?:we'?ll|we\s+will)\s+(?:reply|respond|get\s+back|be\s+in\s+touch)\b|\b(?:we'?ll|we\s+will)\s+(?:reply|respond|get\s+back)\b[^?]*\bconsultation\s+fee\b/i;
/** A person, never an auto-responder: a commercial ask in the first person ("I would only agree if payment is made after…").
 *  The shared list reads "thanks for reaching out" as automated (R090). */
/** A chatbot answering our message (2026-10-26 review): "I'm sorry, I didn't quite catch that. Could you please rephrase
 *  your message…". Automated: never a price line, never the pitch, never counted as a reply. */
export const CHATBOT = /\b(?:sorry,?\s+)?i\s+(?:didn'?t|did\s+not|couldn'?t|could\s+not|don'?t|do\s+not)\s+(?:quite\s+)?(?:catch|understand|recogni[sz]e)\s+(?:that|your\s+(?:message|request|question))\b|\b(?:could|can)\s+you\s+(?:please\s+)?rephrase\b|\bplease\s+rephrase\b|\bplease\s+(?:reply|choose|select|type)\s+(?:with\s+)?(?:a\s+|one\s+of\s+the\s+)?(?:number|option)s?\b/i;
const HUMAN_ONLY =/\bi\s+would\s+only\s+(?:agree|pay|work)\b|\b(?:i'?m|i\s+am)\s+interested\s+in\s+your\b|\bhappy\s+to\s+work\s+with\s+you\b/i;
/** A person's own confirmation after an auto-reply in the same burst ("Yeah", "Yes, it is located in Liverpool"). */
const HUMAN_CONFIRM = /^\W*(?:(?:hi|hello|hey)\W+)?(?:yes|yeah|yea|yep|yup|yh|ya|ye|it\s+is|it'?s\s+me|that'?s\s+(?:right|correct|us|me)|correct|speaking)\b/i;
export function isAutoReply(text: string | null | undefined, messageType?: string | null): boolean {
  const t = String(text ?? '');
  if (HUMAN_ONLY.test(t)) return false;
  const notAQuestion = !/\?\s*$/.test(t.trim());
  return triageByRules(t, { isClient: false, messageType: messageType ?? 'text' }).category === 'automated'
    || (notAQuestion && (AUTO_EXTRA.test(t) || AUTO_GREETING.test(t))) || FOREIGN_AUTO.test(t) || AUTO_FORM.test(t) || CHATBOT.test(t);
}

/** Messages an auto-responder sends together arrive within this long of each other (Ven: three in 72 seconds). */
export const AUTO_BURST_MS = 120_000;
/** Where the burst holding thread[idx] starts: the prospect messages just before it with nothing of ours between, all
 *  timed and all within AUTO_BURST_MS of it. No timestamps → the message stands alone. */
function burstStart(thread: MoveThreadMsg[], idx: number): number {
  const at = Date.parse(thread[idx]?.at ?? '');
  if (!Number.isFinite(at)) return idx;
  let s = idx;
  for (let j = idx - 1; j >= 0; j--) {
    if (thread[j].from !== 'them') break;
    const t = Date.parse(thread[j].at ?? '');
    if (!Number.isFinite(t) || at - t > AUTO_BURST_MS) break;
    s = j;
  }
  return s;
}
/** THE AUTO-REPLY READING, per message (Paul, 2026-10-20). A message is an auto-reply on its own wording (isAutoReply),
 *  or as part of a MULTI-MESSAGE BURST that holds one: Ven's "Buenas noches" / "Thanks for contacting Ven Language
 *  Services" / "Are you interested in Spanish lessons?..." arrived together, so none of the three is a real reply. */
export function autoReplyFlags(thread: MoveThreadMsg[]): boolean[] {
  const own = thread.map((m) => m.from === 'them' && (m.autoPart ?? isAutoReply(m.text, m.messageType)));
  const out = [...own];
  for (let i = 0; i < thread.length; i++) {
    if (thread[i].from !== 'them') continue;
    const s = burstStart(thread, i);
    if (s < i && own.slice(s, i + 1).some(Boolean)) for (let k = s; k <= i; k++) out[k] = true;
  }
  return out;
}

export function inboundLabel(text: string | null | undefined, messageType?: string | null): 'Auto-reply' | 'Only confirmed' | null {
  if (isAutoReply(text, messageType)) return 'Auto-reply';
  const c = triageByRules(text ?? '', { isClient: false, messageType: messageType ?? 'text' }).category;
  if (c === 'confirmed_contact') return 'Only confirmed';
  return null;
}

/* ── the evidence line (code-built, never the model's) ────────────────────────────────────────── */

export const engineName = (w: string) => (w === 'chatgpt' ? 'ChatGPT' : w === 'gemini' ? 'Gemini' : 'AI');
/** The tool by name for the which-tool answer only: null when the engine is not one we can name honestly. */
const toolByName = (w: string | null | undefined): string | null => {
  const k = String(w ?? '').trim().toLowerCase();
  if (k === 'chatgpt') return 'ChatGPT';
  if (k === 'gemini' || k === 'google ai') return 'Gemini';
  if (k === 'ai_overview') return "Google's AI answer at the top of the search";
  return null;
};
/** "Which AI did you use?" (Paul, 2026-10-21): the missed search's own engine, then the tools we check. The ONLY draft that
 *  names an AI tool. */
export function whichToolLine(e: MoveEvidence): string {
  const tool = toolByName(e.missed?.engine) ?? toolByName(e.engineWords);
  const base = PLAYBOOK.which_tool.line;
  return tool && e.named && e.named.valid > 0 ? `That one was ${tool}. ${base}` : base;
}
const withA = (s: string) => (/^[aeiou]/i.test(s) ? `an ${s}` : `a ${s}`);
const listNames = (n: string[]) => (n.length <= 1 ? n.join('') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`);
/** "Driving instructors" → "driving instructor" (an audit stores the trade capitalised; an acronym such as MOT stays). */
const tradeWord = (t: string) => t.trim().replace(/s$/i, '').replace(/^([A-Z])(?=[a-z])/, (c) => c.toLowerCase());

/** The best missed search as a person says it. A question is quoted ("Who is the best driving instructor for beginners
 *  in Halstead?"); a search phrase follows "for". The audit's country marker (", UK") is dropped; the trade is lower case. */
export function spokenSearch(question: string, trade: string | null): string {
  let q = norm(question).replace(/\?+\s*$/, '').replace(/,?\s+(?:UK|U\.K\.|United\s+Kingdom)$/i, '').trim();
  const tr = String(trade ?? '').trim();
  if (tr) q = q.replace(new RegExp(`\\b${tr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), (m) => m.toLowerCase());
  if (/^(who|what|which|where|can|could|is|are|how|any|do|does|should|would|recommend)\b/i.test(q)) return `"${q.charAt(0).toUpperCase()}${q.slice(1)}?"`;
  return `for ${q}`;
}
/** "I asked AI <the missed search>": the question where they were NOT named (the worst-engine pick, Paul 2026-10-20).
 *  ⛔ NEVER AN AI BRAND (Paul, 2026-10-21): always "AI"; the engine stays in the evidence ("why" panel) and is named only
 *  when they ask which tool (whichToolLine). No missed search on record: trade + town. */
export function askedPhrase(e: MoveEvidence): string | null {
  if (!e.trade || !e.town) return null;
  const m = e.missed;
  if (m && m.question.trim()) return `I asked AI ${spokenSearch(m.question, e.trade)}`;
  return `I asked AI for ${withA(tradeWord(e.trade))} in ${e.town}`;
}
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** One true sentence from the audit, or null. "Named others instead" only under the one-third rule, counted over EVERY
 *  answer in the score. ⛔ Never "named you in X of Y answers" or "a gap in the rest" (Paul, 2026-10-20): above a third
 *  it says what the missed search showed, nothing more. */
export function auditLine(e: MoveEvidence): string | null {
  const asked = askedPhrase(e);
  if (!asked || !e.named || e.named.valid <= 0) return null;
  const { named, valid } = e.named;
  const rivals = rivalsExcludingSelf(e.competitors, e.businessName);
  if (named >= valid) return `When ${lowerFirst(asked)} it named you every time, which is great.`;
  if (mayClaimNamedInstead(named, valid)) {
    if (e.hookAlreadySent) return `Like I said, when ${lowerFirst(asked)} it put other businesses forward.`;
    return rivals.length
      ? `${asked} and it mentioned ${listNames(rivals.slice(0, 3))}.`
      : `${asked} and it mentioned other businesses, not you.`;
  }
  /* The soft version: what that ONE missed answer said, with no "instead", no "not you", no closer. */
  return rivals.length ? `${asked} and it mentioned ${listNames(rivals.slice(0, 3))}.` : `${asked} and it didn't mention you.`;
}

/* ── the first-reply pitch (Paul, 2026-10-20, wording A): every word built here ───────────────────── */

/** Their answer to the agency question when they run the site themselves: ask, never assume (Paul, 2026-10-20). */
export const PITCH_SELF_MANAGED_REPLY = PLAYBOOK.self_managed.line;
/** "Is this a bot?" — Paul's one answer (2026-10-20, the playbook): true whatever the AI auto-reply switch says. */
export const BOT_ANSWER = PLAYBOOK.is_bot.line;
/** THE ONE QUESTION the pitch ends on (a website on record). ⛔ No voice-note line in the first pitch (Paul, 2026-10-23):
 *  the voice note and the call are offered in the NEXT message. */
export const PITCH_AGENCY_Q = 'Are you with an agency, or do you manage the website yourself?';
/** The pitch's question when no website is on record (never the agency question). */
export const PITCH_SITE_Q = "Do you have a website I've missed, or is that something you'd want sorted?";
/** After "no, I haven't got one": the voice note offer. */
export const PITCH_VOICE_Q = 'Ok if I send a quick voice note on what I found?';
export const PITCH_INSTEAD_LINE = 'AI is recommending your competitors instead.';
/** The list lead-in (Paul, 2026-10-23), then one "• " line per real issue. */
export const PITCH_LIST_LEAD = 'I looked into why and a few things could be holding you back:';
/** One real issue: one sentence, no list. */
export const PITCH_ONE_LEAD = 'I looked into why and found';
/** What we do, said once, with no promise of a result (Paul, 2026-10-21). */
export const PITCH_SPECIALISE_LINE = 'I specialise in getting local businesses to show up in those results, so the customers go to you instead.';
/** Paul's no-website words (2026-10-23, Option 2): "tends to", never how AI decides. */
export const PITCH_NO_SITE_LINE = "AI tends to lean on websites when it names businesses, and I couldn't find one for you. Without a well-built one, it tends to name businesses that have one instead.";
export const PITCH_INTRO_LINE = "It's Paul from Findable. I help local businesses show up when people ask AI tools for their trade in their area.";
/** How the pitch was built, stored on the draft (why.structure) so reply rates can be compared by structure. */
export type PitchStructure = 'pitch_list' | 'pitch_sentence' | 'pitch_plain' | 'pitch_no_site' | 'pitch_intro'
  | 'site_shared_list' | 'site_shared_sentence' | 'site_shared_plain';
/** Issue lines as a bullet list, one per line. */
export const bulletList = (lines: string[]): string => lines.map((l) => `• ${l}`).join('\n');

/** The website check's state for a move: the stored one, else read from what older callers hand over. `issues` are the
 *  pitch's plain lines (pitchIssueWords.ts) when the caller sent them, else the plain titles. */
export function siteOf(e: MoveEvidence): { state: SiteState; issues: string[] } {
  if (e.site) return { state: e.site.state, issues: [...new Set((e.site.pitch ?? e.site.issues).map((t) => t.trim()).filter(Boolean))] };
  if (!e.hasWebsite) return { state: 'no_website', issues: [] };
  return e.findings.length ? { state: 'issues', issues: e.findings.map((f) => f.title) } : { state: 'not_checked', issues: [] };
}
const noSiteOf = (e: MoveEvidence) => { const s = siteOf(e).state; return s === 'no_website' || s === 'profile'; };

/** No name found (Paul, 2026-10-21): the pitch opens "Hi mate,". */
export const PITCH_NO_NAME_GREETING = 'Hi mate,';
/** "Hi Kylie," when they gave a name in their reply or the site's own crawl states a person as owner / founder
 *  (MoveEvidence.ownerName). First name only; never guessed from the business name. No name → "Hi mate,". */
export function pitchGreeting(e: MoveEvidence, theirName: string | null = null): string {
  const first = String(theirName || e.ownerName || '').trim().split(/\s+/)[0] ?? '';
  return /^[A-Z][a-z]+(?:['’-][A-Za-z]+)?$/.test(first) ? `Hi ${first},` : PITCH_NO_NAME_GREETING;
}

/** The "why" paragraph for a list of real issue lines: none → null; one → one sentence; two or more → the bullet list. */
function issuesParagraph(issues: string[], lead: string | null): { text: string | null; kind: 'list' | 'sentence' | 'plain' } {
  if (!issues.length) return { text: null, kind: 'plain' };
  if (issues.length === 1) return { text: `${[lead, PITCH_ONE_LEAD].filter(Boolean).join(' ')} ${carryOn(issues[0])}.`, kind: 'sentence' };
  return { text: `${[lead, PITCH_LIST_LEAD].filter(Boolean).join(' ')}\n${bulletList(issues)}`, kind: 'list' };
}

/** THE FIRST-REPLY PITCH (Paul, 2026-10-20 wording A; lean, 2026-10-23):
 *    Hi <first name>, / Hi mate,
 *    I asked AI "<the worst engine's missed question>" and it mentioned <that answer's names>.
 *    AI is recommending your competitors instead. I looked into why and a few things could be holding you back:
 *    • <up to four real issues, plain words, worst first>     (one issue: "…I looked into why and found <it>.")
 *    I specialise in getting local businesses to show up in those results, so the customers go to you instead.
 *    <the agency question> (no website: PITCH_NO_SITE_LINE, then "Do you have a website I've missed, or …?") — the ONLY question.
 *  ⛔ "AI is recommending your competitors instead" only under the one-third rule; above it (the soft version) the same shape
 *     without that sentence. ⛔ No voice-note line, no guarantee, no price, no past results here. Nothing absent is invented.
 *  ⛔ The length rule: past PITCH_MAX_WORDS the lowest issue goes, never below PITCH_MIN_LIST. */
export function firstReplyPitch(e: MoveEvidence, theirName: string | null = null): { lines: string[]; question: string; closer: 'agency' | 'site'; structure: PitchStructure } {
  const p = firstReplyPitchBase(e, theirName);
  const link = reportLinkLine(e);
  return link ? { ...p, lines: [...p.lines, link] } : p;
}
/** The lead-in is a few words; the link is the lead's own report, only once its audit is finished (never a sign-up link). */
export const PITCH_REPORT_LEAD = "Here's the full report:";
const REPORT_URL_RE = /^https:\/\/findable\.live\/r\/[A-Za-z0-9]{4,12}$/;
/** The one short report line before the question, or null when there is no ready, well-formed report link. */
export const reportLinkLine = (e: Pick<MoveEvidence, 'reportUrl'>): string | null =>
  e.reportUrl && REPORT_URL_RE.test(e.reportUrl) ? `${PITCH_REPORT_LEAD} ${e.reportUrl}` : null;
/** Marks a code-built pitch: its report link is allowed through the link check; no link means the audit is pending. */
function markReportLink(p: MovePlan, e: Pick<MoveEvidence, 'reportUrl'>): MovePlan {
  if (!p.fixedText || (p.move !== 'first_reply_pitch' && p.move !== 'auto_reply')) return p;
  const link = reportLinkLine(e);
  if (link && p.fixedText.includes(link)) return { ...p, linkOk: true };
  return { ...p, auditPending: true, note: p.note ?? 'Audit pending: no report link in this draft.' };
}
function firstReplyPitchBase(e: MoveEvidence, theirName: string | null = null): { lines: string[]; question: string; closer: 'agency' | 'site'; structure: PitchStructure } {
  const noSite = noSiteOf(e);
  const next = noSite ? { question: PITCH_SITE_Q, closer: 'site' as const } : { question: PITCH_AGENCY_Q, closer: 'agency' as const };
  const hi = pitchGreeting(e, theirName);
  const withHi = (lines: string[]) => [hi, ...lines];
  const counts = e.named && e.named.valid > 0 ? e.named : null;
  if (!e.trade || !e.town || !counts) return { lines: withHi([PITCH_INTRO_LINE, ...(noSite ? [PITCH_NO_SITE_LINE] : [])]), ...next, structure: 'pitch_intro' };
  const full = mayClaimNamedInstead(counts.named, counts.valid);
  const site = siteOf(e);
  const asked = askedPhrase(e) as string;
  /* ⛔ Never a rival with (nearly) their own name (Paul, 2026-10-20). */
  const rivals = rivalsExcludingSelf(e.competitors, e.businessName).slice(0, 3);
  const first = rivals.length ? `${asked} and it mentioned ${listNames(rivals)}.` : full ? `${asked} and it mentioned other businesses, not you.` : `${asked} and it didn't mention you.`;
  const instead = full ? PITCH_INSTEAD_LINE : null;
  if (noSite) {
    return { lines: withHi([first, ...(instead ? [instead] : []), PITCH_NO_SITE_LINE, PITCH_SPECIALISE_LINE]), ...next, structure: 'pitch_no_site' };
  }
  let issues = site.state === 'issues' ? site.issues.slice(0, PITCH_MAX_LIST) : [];
  const build = (list: string[]) => {
    const why = issuesParagraph(list, instead);
    const middle = why.text ?? instead;
    return { lines: withHi([first, ...(middle ? [middle] : []), PITCH_SPECIALISE_LINE]), kind: why.kind };
  };
  let b = build(issues);
  while (issues.length > PITCH_MIN_LIST && wordCount(pitchText({ lines: b.lines, question: next.question })) > PITCH_MAX_WORDS) {
    issues = issues.slice(0, -1);
    b = build(issues);
  }
  return { lines: b.lines, ...next, structure: b.kind === 'list' ? 'pitch_list' : b.kind === 'sentence' ? 'pitch_sentence' : 'pitch_plain' };
}
/** The pitch as one message: each line its own paragraph, the question last. */
export const pitchText = (p: { lines: string[]; question: string }): string => [...p.lines, p.question].join('\n\n');

/* ── "site shared" (Paul, 2026-10-23, from the Quick Drive reply that worked) ───────────────────────── */

export const SITE_SHARED_OPEN = 'Ah thanks, I missed that one.';
export const SITE_SHARED_LIST_LEAD = 'Had a proper look and a few things could be holding you back with AI:';
export const SITE_SHARED_NONE = "Had a proper look and nothing obvious is wrong with it.";
/** Said without a crawl: our pitch said we couldn't find a website (their Google listing had none), then they sent one.
 *  The same words as the website check's own listing issue (pitchIssueWords.ts), so the list never says it twice. */
export { GOOGLE_LISTING_NO_LINK };
/** The next step once we already know who runs the site. */
export const SITE_SHARED_KNOWN_Q = 'Quick call, or shall I send a voice note on what I found?';

/** THE SITE-SHARED REPLY: only issues the website check really found (plus the Google-listing line when it is true), worst
 *  first, up to four; one issue is one sentence; none is said plainly. Never invented. */
export function siteSharedReply(issues: string[], o: { googleNoLink: boolean; whoKnown: boolean }): { text: string; question: string; structure: PitchStructure } {
  /* The website check's own listing line (it read Google's record) wins over the guess from "we said we couldn't find a site". */
  const checkSaysListing = issues.some((l) => /^Your Google listing\b/.test(l));
  const lines = [...new Set([...(o.googleNoLink && !checkSaysListing ? [GOOGLE_LISTING_NO_LINK] : []), ...issues])].slice(0, PITCH_MAX_LIST);
  const question = o.whoKnown ? SITE_SHARED_KNOWN_Q : PITCH_AGENCY_Q;
  const body = lines.length >= 2 ? `${SITE_SHARED_OPEN} ${SITE_SHARED_LIST_LEAD}\n${bulletList(lines)}`
    : lines.length === 1 ? `${SITE_SHARED_OPEN} Had a proper look and one thing could be holding you back: ${carryOn(lines[0])}.`
    : `${SITE_SHARED_OPEN} ${SITE_SHARED_NONE}`;
  return { text: `${body}\n\n${question}`, question, structure: lines.length >= 2 ? 'site_shared_list' : lines.length === 1 ? 'site_shared_sentence' : 'site_shared_plain' };
}

/* ── the reply recon's code-built lines (Paul, 2026-10-21) ─────────────────────────────────────── */

const pluralTrade = (t: string) => { const w = tradeWord(t); return /(s|sh|ch|x)$/i.test(w) ? `${w}es` : `${w}s`; };
/** "Are you looking for lessons?": Paul's correction. "lessons" for a driving school, else "a <trade>"; the lead's trade + town. */
export function thinksCustomerLine(e: MoveEvidence): string {
  const tr = String(e.trade ?? '').trim();
  const driving = /\b(driving|instructor|lesson)/i.test(tr) || (!tr && /\bdriving\b/i.test(e.businessName));
  const base = PLAYBOOK.thinks_customer.line.replace('{thing}', driving ? 'lessons' : tr ? withA(tradeWord(tr)) : 'anything');
  if (!tr || !e.town) return base.replace('how AI recommends {trades} in {town}', 'how AI recommends businesses like yours');
  return base.replace('{trades}', pluralTrade(tr)).replace('{town}', e.town);
}
/** "What are you selling?" / "Why?" before the pitch went: a straight answer, then the pitch's own lines and its one question.
 *  Same greeting rule as the pitch (their name, the site's owner, else "Hi mate,"). Nothing on record: who we are, no claim. */
export function straightAnswerPitch(e: MoveEvidence, theirName: string | null = null): { lines: string[]; question: string; closer: 'agency' | 'site'; structure: PitchStructure } {
  const p = firstReplyPitch(e, theirName);
  const [hi, ...rest] = p.lines;
  const answer = PLAYBOOK.straight_answer_then_pitch.line;
  if (rest[0] === PITCH_INTRO_LINE) {
    const short = answer.replace(/\s*Here's why I got in touch:$/, '');
    return { ...p, lines: [hi, short, 'I help local businesses show up when people ask AI tools for their trade in their area.', ...rest.slice(1)] };
  }
  return { ...p, lines: [hi, answer, ...rest] };
}
/** They chased us before the pitch went: say sorry once, then the pitch (Paul: "Sorry for the slow reply." + the pitch). */
export function chasedPitch(e: MoveEvidence, theirName: string | null = null): { lines: string[]; question: string; closer: 'agency' | 'site'; structure: PitchStructure } {
  const p = firstReplyPitch(e, theirName);
  const [hi, ...rest] = p.lines;
  return { ...p, lines: [hi, PLAYBOOK.they_chased.line, ...rest] };
}

/** What our previous message asked, read from its words (our drafts are edited by a person, so loosely). */
type OurAsk = 'emotional' | 'emotional_no_site' | 'agency' | 'site' | 'contract' | 'end_date' | 'pay_monthly' | 'happy_change'
  | 'email' | 'best_person' | 'call_time' | 'better_time' | 'offer' | 'new_site';
/** "away until the 18th": a date readEndDate can read, or the next 18th (their day of the month, no month said). Check back the day AFTER they are
 *  back (not 14 days before, which is the contract rule). null when no day can be read. */
function awayUntil(text: string, nowMs: number): FollowUpNote | null {
  const t = norm(text).toLowerCase();
  const now = new Date(nowMs);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const next = (end: Date, said: string): FollowUpNote => ({ said, endsOn: ymd(end), checkBackOn: ymd(new Date(end.getTime() + 86_400_000)) });
  const dated = readEndDate(text, nowMs);
  if (dated) return next(new Date(`${dated.endsOn}T00:00:00Z`), dated.said);
  const dom = t.match(/\b(?:until|till|til|back\s+(?:on\s+)?)\s*(?:the\s+)?(\d{1,2})(st|nd|rd|th)\b/);
  if (dom) {
    const d = Number(dom[1]);
    if (d >= 1 && d <= 31) {
      let c = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), d));
      if (c <= today) c = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, d));
      return next(c, `the ${dom[1]}${dom[2]}`);
    }
  }
  return null;
}
function ourAsk(m: MoveThreadMsg | null): OurAsk | null {
  const t = norm(m?.text ?? '');
  /* An offer said without a question mark ("Happy to explain it here or jump on a quick call") is still an offer. */
  if (!t.includes('?')) return /\b(happy\s+to\s+explain|jump\s+on\s+a\s+(quick\s+)?call|send\s+(you\s+)?a\s+(quick\s+)?voice\s+note)\b/i.test(t) ? 'offer' : null;
  if (/\bwould\s+you\s+rather\s+those\s+customers\s+came\s+to\s+you\b/i.test(t)) return /couldn'?t\s+find\s+a\s+website/i.test(t) ? 'emotional_no_site' : 'emotional';
  if (/\bwhen\s+does\s+(the|your)\s+contract\s+(end|finish|run\s+out)\b/i.test(t)) return 'end_date';
  if (/\b(tied\s+into|tied\s+in|in\s+a\s+contract)\b[^?]*\?/i.test(t) || /\bfree\s+to\s+leave\b[^?]*\?/i.test(t)) return 'contract';
  if (/\bpay\s+anyone\s+monthly\b/i.test(t)) return 'pay_monthly';
  if (/\bhappy\s+to\s+change\b/i.test(t)) return 'happy_change';
  if (/\bbest\s+e-?mail\b/i.test(t)) return 'email';
  if (/\bbest\s+person\s+to\s+speak\s+to\b/i.test(t)) return 'best_person';
  if (/\bwhen\s+would\s+be\s+a\s+better\s+time\b/i.test(t)) return 'better_time';
  /* B6: Paul's real asks ("what time works for you?", "can we do any earlier?", "are you free to call?"). */
  if (/\b(what\s+(day\s+and\s+)?time\s+(suits|works|is\s+best|would\s+(work|suit|be\s+good))|give\s+me\s+a\s+uk\s+time|good\s+time\s+(today|to\s+(call|ring))|when\s+suits|are\s+you\s+free\s+to\s+(call|talk|chat)|any\s+(earlier|later)|what\s+time\s+(are|r)\s+(you|u)\s+free)\b/i.test(t)) return 'call_time';
  if (/\bis\s+it\s+with\s+an\s+agency,?\s+or\s+are\s+you\s+building\s+it\s+yourself\b/i.test(t)) return 'new_site';
  if (/\bagency\b/i.test(t) && /\byourself\b/i.test(t)) return 'agency';
  if (/\bwebsite\s+i'?ve\s+missed\b/i.test(t)) return 'site';
  if (/\b(voice\s+note|call|ring)\b[^?]*\?/i.test(t)) return 'offer';
  return null;
}
const BARE_YES = /^\W*(yes|yeah|yep|yup|yh|ya|ye)\W*$/i;
const BARE_NO = /^\W*(no|nope|nah|na)\b/i;
const NO_SITE_ANSWER = /^\W*(no|nope|nah|na)\b|\b(don'?t|do\s+not|haven'?t|have\s+not)\s+(have|got)\s+(one|a\s+(web)?site)|\bno\s+(web)?site\b/i;
const CLEAR_NO = /\b(not\s+interested|no\s+thanks?|no\s+thank\s+you|not\s+for\s+(me|us)|(we'?re|i'?m)\s+(ok|fine|good|alright|sorted))\b/i;
/** "Does it actually work?", "is it legit?", "how do I know it'll work?" — the guarantee answer, with the confidence line. */
const WORKS = /\b(does\s+(it|this|that)\s+(actually\s+|really\s+)?work|will\s+(it|this|that)\s+(actually\s+|really\s+)?work|is\s+(it|this)\s+legit|how\s+do\s+(i|we)\s+know\s+(it'?ll|it\s+will|it\s+works))\b/i;
/** "Keep it with them" after "happy to change?": they stay. */
const KEEP_THEM = /\b(keep\s+(it\s+)?with\s+them|stay\s+with\s+them|keep\s+(him|her|them)|stick\s+with\s+(him|her|them)|not\s+changing|happy\s+with\s+(him|her|them|it))\b/i;
/** Links that are not a business website (maps, social, directories). */
const NOT_THEIR_SITE = /\b(maps\.app\.goo\.gl|goo\.gl|g\.page|maps\.google|google\.[a-z.]+\/maps|instagram\.com|tiktok\.com|youtube\.com|youtu\.be|wa\.me|checkatrade\.com|yell\.com|trustatrader\.com|mybuilder\.com|bark\.com|linkedin\.com|x\.com|twitter\.com)\b/i;
/** A "scam?" question with none of the legal / police / report words: the privacy answer, not a hand-over. */
const SCAM_ONLY = /\bscam(mer|mers|ming)?\b/i;
const LEGAL_WORDS = /\bharass|\breport(ed|ing)?\s+(you|this|your)|\bsolicitor|\blawyer|\blegal\s+action|\bsue\s+you\b|\bcourt\b|\bpolice\b|\bfraud|\bgdpr\b|\bico\b|\btrading\s+standards\b|\bombudsman\b|\bdata\s+protection\b/i;

/* ── the one rule ─────────────────────────────────────────────────────────────────────────────── */

const VOICE_Q = 'Shall I send you a quick voice note explaining it?';

function plan(p: Partial<MovePlan> & { move: MoveId; read: string }): MovePlan {
  return { topic: null, needsYou: null, stop: false, autoDraft: true, points: [], question: null, allowPrice: false, label: null, ...p };
}
const flag = (reason: NeedsYouReason) => ({ reason, label: NEEDS_YOU_LABELS[reason] });

/** A playbook intent as a plan: the line is the guide (word for word when it carries a fact), its last "?" the question. */
function fromPlaybook(intent: PlaybookIntent, extra: Partial<MovePlan> = {}, line?: string): MovePlan {
  const entry = PLAYBOOK[intent];
  const text = line ?? entry.line;
  const { body, question } = splitQuestion(text);
  const points = entry.factual
    ? [`Use this answer, word for word: "${body}"`]
    : [`Say this in Paul's voice, close to these words (keep every fact; you may change the first few words so it answers what they said): "${body}"`];
  return plan({ move: 'playbook', read: intent, intent, guide: text, points, question, allowPrice: !!entry.allowPrice, confidence: !!entry.confidence,
    timingOk: !!entry.timingOk, fixedText: entry.fixed ? text : null, linkOk: !!entry.linkOk, ...extra });
}
/** Needs you, and NO draft (Paul, 2026-10-20). */
const noDraft = (reason: NeedsYouReason, read: string, move: MoveId = 'unsure'): MovePlan =>
  plan({ move, read, autoDraft: false, noDraft: true, needsYou: flag(reason) });

/** The topics whose answer carries a price, a term or the guarantee. */
const PRICE_FAMILY: ReadonlySet<FactTopic> = new Set<FactTopic>(['price', 'term', 'cancel', 'monthly_start', 'after_term', 'guarantee']);
/** Words that make a reply a price / guarantee / sign-up answer, wherever the plan carries them. */
const OFFER_WORDS = /£|\bmoney\s+back\b|\bguarantee|\bsign[\s-]?up\b|\bpayments?\b|\ba\s+month\b/i;
/** ⛔ PROSPECT-ONLY (Australia, prospectOnly.ts; Paul 2026-10-23): a plan that would say a price, the guarantee or a sign-up
 *  is Needs you with NO draft; any other plan may not state a price. Judged on what the plan would SAY (its guide, its
 *  fixed text, its points) and its topic, never on a list of intents, so a new price line is caught too. */
export function prospectOnlyPlan(p: MovePlan, e: Pick<MoveEvidence, 'prospectOnly'>): MovePlan {
  if (!e.prospectOnly) return p;
  const says = [p.guide ?? '', p.fixedText ?? '', ...p.points].join(' ');
  if (OFFER_WORDS.test(says) || (p.topic && PRICE_FAMILY.has(p.topic)) || p.confidence) {
    return { ...p, autoDraft: false, noDraft: true, fixedText: null, needsYou: flag('prospect_only'),
      note: 'Australian prospect asked about price or the guarantee. Prospect-only: no price, guarantee or sign-up here.' };
  }
  return { ...p, allowPrice: false };
}

/** Did we already learn who runs their site (agency / themselves / a friend), so the agency question is done? */
function whoRunsKnown(thread: MoveThreadMsg[]): boolean {
  let prev: MoveThreadMsg | null = null;
  for (const m of thread) {
    if (m.from === 'us') {
      const a = ourAsk(m);
      if (a === 'contract' || a === 'end_date' || a === 'pay_monthly' || a === 'happy_change' || /\bmakes\s+(changes\s+easy|it\s+easier)\b/i.test(m.text)) return true;
      prev = m; continue;
    }
    if (ourAsk(prev) === 'agency' && (RE.agency.test(m.text) || RE.self.test(m.text) || RE.friend.test(m.text) || BARE_NO.test(m.text))) return true;
  }
  return false;
}

export function pickMove(i: MoveInput): MovePlan {
  const thread = mergeBursts(i.thread);
  const { latest, prevOurs, idx } = latestPair(thread);
  const e = i.evidence;
  const nowMs = i.nowMs ?? Date.now();
  const autoFlags = autoReplyFlags(thread);
  const lastIsOurs = idx >= 0 && idx < thread.length - 1 && thread.slice(idx + 1).some((m) => m.from === 'us');

  if (!latest) return plan({ move: 'unsure', read: 'no reply', autoDraft: false, needsYou: flag('unsure'), points: ['They have not replied yet. Do not chase with a pitch.'] });
  const text = norm(latest.text);
  const t = triageByRules(text, { isClient: false, messageType: latest.messageType ?? 'text' });

  /* 1. Stops first: Do Not Contact, an opt-out, an angry reply. No draft. */
  if (i.suppressed) return plan({ move: 'stop', read: 'suppressed', stop: true, autoDraft: false, needsYou: flag('do_not_contact') });
  if (t.category === 'opt_out' || STOP_EXTRA.test(text)) return plan({ move: 'stop', read: 'opt_out', stop: true, autoDraft: false, needsYou: flag('opt_out') });
  if (isAngry(text)) return plan({ move: 'stop', read: 'angry', stop: true, autoDraft: false, needsYou: flag('angry') });

  /* 2. Loop guards: never twice without a prospect message; at most three AI replies with no win; no reply to repeated auto-replies. */
  let guard: NeedsYouReason | null = null;
  if (lastIsOurs) guard = 'already_replied';
  else if (i.aiSentSinceWin >= 3) guard = 'ai_limit';

  /* 3. Not a real reply: its own wording, or a multi-message burst holding one (autoReplyFlags). */
  if (autoFlags[idx]) {
    const start = burstStart(thread, idx);
    let prevTheirs = -1;
    for (let j = start - 1; j >= 0; j--) if (thread[j].from === 'them') { prevTheirs = j; break; }
    const repeat = prevTheirs >= 0 && autoFlags[prevTheirs];
    /* ⛔ THEY HAVE NOT REALLY CONFIRMED WHO THEY ARE (Paul, 2026-10-20, Ven): an auto-reply to the opener, with nothing real
       from them before it, gets the usual FIRST-REPLY PITCH as its draft, never a generic line. Still labelled Auto-reply
       (not a real reply, never counted as Replied). A repeat or a loop guard keeps the old rule: nothing drafted. */
    let prevUs: MoveThreadMsg | null = null;
    for (let j = start - 1; j >= 0; j--) if (thread[j].from === 'us') { prevUs = thread[j]; break; }
    const realBefore = thread.slice(0, start).some((m, k) => m.from === 'them' && !autoFlags[k]);
    /* ⛔ A chatbot ("didn't quite catch that, please rephrase") gets nothing: no pitch, no price, no line (2026-10-26). */
    const chatbot = thread.slice(start, idx + 1).some((m) => m.from === 'them' && CHATBOT.test(m.text ?? ''));
    if (chatbot) return plan({ move: 'auto_reply', read: 'chatbot', autoDraft: false, noDraft: true, label: 'Auto-reply' });
    if (!repeat && !guard && !realBefore && prevUs && wasOpener(prevUs)) {
      const pitch = firstReplyPitch(e);
      return markReportLink(plan({ move: 'auto_reply', read: 'automated', label: 'Auto-reply',
        points: pitch.lines.map((l) => `Use this line, word for word: "${l}"`), question: pitch.question, fixedText: pitchText(pitch), closer: pitch.closer, structure: pitch.structure }), e);
    }
    return plan({ move: 'auto_reply', read: 'automated', autoDraft: false, label: 'Auto-reply', needsYou: repeat ? flag('repeat_auto_reply') : null,
      points: ['Say: "No rush, speak soon." Do not mention their automatic reply. No pitch.'] });
  }

  /* A loop guard wins the reason: it is why nothing should be drafted on its own. Every plan below passes through here:
     the first reply is marked (its "AI" keeps its capitals, Paul 2026-10-23), and a prospect-only lead never gets a price. */
  const g = (p0: MovePlan): MovePlan => {
    const p = markReportLink(prospectOnlyPlan({ ...p0, firstReply: first }, e), e);
    return guard ? { ...p, autoDraft: false, needsYou: flag(guard) } : p;
  };

  /* The FIRST reply to our opener (Paul, 2026-10-20): the pitch, unless it is a no / stop / angry, a wrong person or a
     direct question. A name they give in it ("Dom here") may open the pitch.
     ⛔ "FIRST" = NO PITCH SENT SINCE THEIR FIRST REPLY, never a time window (Paul, 2026-10-21, GSI Driving School: "Yes", then
     "How can I help" an hour later — beyond the 5-minute burst merge — read as a second reply and got "No playbook reply fits").
     Nothing of ours since the opener (and its nudge) = the pitch is still owed, however many messages they sent. The burst
     merge (MERGE_WINDOW_MS) still only joins messages into one turn. */
  const first = !!prevOurs && wasOpener(prevOurs) && pitchOwed(thread, idx);
  const theirName = first ? (nameFromReply(latest.text, e.businessName) ?? earliestReplyName(thread, idx, e.businessName)) : null;
  const pitchPlan = (): MovePlan => {
    const pitch = firstReplyPitch(e, theirName);
    return plan({ move: 'first_reply_pitch', read: 'first_reply', label: t.category === 'confirmed_contact' ? 'Only confirmed' : null, greetName: theirName,
      points: pitch.lines.map((l) => `Use this line, word for word: "${l}"`), question: pitch.question, fixedText: pitchText(pitch), closer: pitch.closer, structure: pitch.structure });
  };

  /* 4. Hand to Paul, no draft: legal, a complaint, a payment problem. "Is this a scam?" alone is the privacy answer. */
  const scamQuestion = t.category === 'escalation' && SCAM_ONLY.test(text) && !LEGAL_WORDS.test(text);
  if (t.category === 'escalation' && !scamQuestion) return g(noDraft('legal', 'legal', 'escalate'));
  if (t.category === 'complaint') return g(noDraft('complaint', 'complaint', 'escalate'));
  if (t.category === 'payment_issue' && questionTopic(text) !== 'guarantee' && questionTopic(text) !== 'cancel') return g(noDraft('payment', 'payment', 'escalate'));
  if (PRIVACY.test(text) || scamQuestion) return g(fromPlaybook('privacy', {}, e.foundOnGoogle ? undefined : PRIVACY_NOT_GOOGLE));
  /* "Which AI did you use?" (Paul, 2026-10-21): the one reply that may name the tool. */
  if (RE.whichTool.test(text)) return g(fromPlaybook('which_tool', { brandsAllowed: true }, whichToolLine(e)));
  /* B10 (reply recon): rude, underhand, an attack on the message. A complaint: no draft, a person decides. */
  if (RE.complaint.test(text)) return g(noDraft('complaint', 'complaint', 'escalate'));

  /* B11: a body that is only "[audio]", "[image]" … is media, whatever type it was stored as ("[audio]" after our offer once
     read as a yes to the voice note). A voice note from them gets Paul's line as the suggested text (Paul, 2026-10-21). */
  const bareMedia = /^\[([a-z_]+)\]$/i.exec(text)?.[1]?.toLowerCase() ?? null;
  const typedMedia = !!latest.messageType && !['text', 'button', 'interactive'].includes(latest.messageType) && (!text || !!bareMedia);
  /* A sticker or a reaction is an acknowledgement (2026-10-26 review): never the "can't play voice notes" line. */
  const mediaKind = bareMedia ?? String(latest.messageType ?? '').toLowerCase();
  if (/^(reaction|sticker)$/.test(mediaKind)) return g(plan({ move: 'ack', read: mediaKind, autoDraft: false, noDraft: true }));
  if (bareMedia || typedMedia) {
    const kind = bareMedia ?? String(latest.messageType ?? '').toLowerCase();
    if (/^(audio|voice|ptt)$/.test(kind)) {
      return g(plan({ move: 'media', read: 'voice_note', autoDraft: false, needsYou: flag('media'), guide: VOICE_NOTE_FROM_THEM, fixedText: VOICE_NOTE_FROM_THEM,
        points: [`Use this line, word for word: "${VOICE_NOTE_FROM_THEM}"`], question: splitQuestion(VOICE_NOTE_FROM_THEM).question, note: 'They sent a voice note: listen to it on your phone first.' }));
    }
    return g(plan({ move: 'media', read: 'media', autoDraft: false, needsYou: flag('media'),
      points: ['Say sorry, you cannot play voice notes or open files on here.'], question: 'Can you type it, or shall I give you a quick call?' }));
  }

  /* 4b. THE REPLY RECON'S INTENTS (Paul, 2026-10-21, docs/reply-playbook.md). Read before an answer to our last question: what
     they said beats what we asked. Order is the point: the soft exits, the commercial asks, a clear no (B9: a reason after a no
     is still a no), then the rest. */
  const ask = ourAsk(prevOurs);
  const auditedHere = !!e.named && e.named.valid > 0;
  const owed = pitchOwed(thread, idx);
  const earliestName = () => { for (const m of thread.slice(0, idx)) if (m.from === 'them') { const n = nameFromReply(m.text, e.businessName); if (n) return n; } return null; };
  const codePitch = (intent: PlaybookIntent, p: { lines: string[]; question: string; closer: 'agency' | 'site'; structure: PitchStructure }, name: string | null) =>
    plan({ move: 'first_reply_pitch', read: intent, intent, greetName: name, points: p.lines.map((l) => `Use this line, word for word: "${l}"`), question: p.question,
      fixedText: pitchText(p), closer: p.closer, structure: p.structure, guide: PLAYBOOK[intent].line });
  if (RE.payOnResults.test(text)) {
    return g(fromPlaybook('pay_on_results', { needsYou: flag('commercial_ask'), autoDraft: false, topic: 'price', note: 'A commercial ask (pay on results / free first). The suggested reply restates the offer word for word.' }));
  }
  if (RE.topAsk.test(text)) return g(fromPlaybook('definitely'));
  /* ⛔ B9 (Paul, 2026-10-21): a decline with a reason after it is still a no. No draft, before every soft exit below. */
  if (RE.decline.test(text) || CLEAR_NO.test(text)) return g(noDraft('not_interested', 'not_interested', 'close_politely'));
  if (RE.closedRetired.test(text)) return g(fromPlaybook('closed_retired', { note: 'They have closed down or retired: mark the lead closed.' }));
  if (RE.fullyBooked.test(text) && !/\?/.test(text)) return g(fromPlaybook('fully_booked'));
  if (RE.wordOfMouth.test(text) && !/\?/.test(text)) return g(fromPlaybook('word_of_mouth'));
  /* "Yes this is the number for No Shut Sure Lock" confirms their OWN business (R017); "…the number for Leon's locks" gives another. */
  const forWhom = /\bthis\s+is\s+the\s+number\s+for\s+([^.!?,]+)/i.exec(text)?.[1] ?? '';
  const confirmsOwn = /\b(?:yes|yeah|yep|yh),?\s+(?:it\s+is,?\s+)?this\s+is\s+the\s+number\s+for\b/i.test(text) || (!!forWhom && nearSameName(forWhom, e.businessName));
  if (RE.thirdParty.test(text) && !confirmsOwn) {
    return g(plan({ move: 'unsure', read: 'third_party', autoDraft: false, noDraft: true, needsYou: flag('third_party'), note: 'They gave another business or person: run the check on that one.' }));
  }
  if (RE.callNow.test(text)) return g(fromPlaybook('call_now', { needsYou: flag('call_now'), autoDraft: false, note: 'They want to talk now. Only you know if you are free.' }));
  /* "Will ring later" (Paul, 2026-10-21): they will call us, so never the busy "I'll call then" line. */
  if (RE.willRing.test(text) && !/\?/.test(text)) return g(fromPlaybook('acknowledge_wait', { note: 'They said they will call you.' }));
  const checkBack = (): MovePlan => {
    const today = new Date(nowMs);
    const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + REMEASURE_WEEKS_STANDARD * 7));
    const day = end.toISOString().slice(0, 10);
    return fromPlaybook('new_site_being_built', { followUp: { said: `about ${REMEASURE_WEEKS_STANDARD} weeks`, endsOn: day, checkBackOn: day },
      note: `New site on the way. Check back on ${day} and re-run the same searches. Set the Next Action when you send.` }, NEW_SITE_CHECK_BACK);
  };
  if (ask === 'new_site' && !first && !/\?/.test(text)) return g(checkBack());
  if (RE.newSite.test(text)) {
    const whoKnown = RE.agency.test(text) || RE.agencyStrong.test(text) || RE.self.test(text) || RE.friend.test(text);
    return g(whoKnown ? checkBack() : fromPlaybook('new_site_being_built'));
  }
  if (RE.thinksCustomer.test(text)) return g(fromPlaybook('thinks_customer', {}, thinksCustomerLine(e)));
  if (RE.wrongTrade.test(text)) {
    return g(fromPlaybook('wrong_trade', { needsYou: flag('wrong_trade'), autoDraft: false, note: 'They say we have the wrong trade. Fix the trade on the lead before any re-check.' }));
  }
  if (RE.movedArea.test(text)) return g(fromPlaybook('moved_area', { note: 'They have moved area: fix the town on the lead before any re-check.' }));
  if (RE.sorryWrongDay.test(text)) return g(fromPlaybook('sorry_wrong_day'));
  if (RE.doItMyself.test(text)) return g(fromPlaybook('do_it_myself'));
  if (RE.alreadyShowUp.test(text)) {
    const all = !!e.named && e.named.valid > 0 && e.named.named >= e.named.valid;
    return g(fromPlaybook('already_show_up', {}, all ? ALREADY_SHOW_UP_TRUE : auditedHere ? undefined : ALREADY_SHOW_UP_NO_AUDIT));
  }
  /* A price question beside a proof ask is answered as the price (zz-real-15: "the full report, exact fixes, total price"). */
  if ((RE.proofRequest.test(text) || RE.proofCantSend.test(text)) && questionTopic(text) !== 'price') {
    const cant = RE.proofCantSend.test(text);
    return g(fromPlaybook('proof_request', cant ? { needsYou: flag('cant_send'), autoDraft: false, note: "They asked for something we can't send. Check the suggested text first." } : {},
      auditedHere ? undefined : PROOF_NO_AUDIT));
  }
  if (RE.explainHere.test(text) && !RE.sendEmail.test(text)) return g(fromPlaybook('explain_here'));
  if (RE.ads.test(text)) return g(fromPlaybook('ads_question'));
  if (RE.whereBased.test(text)) return g(fromPlaybook('where_based'));
  if (RE.straightAsk.test(text)) return g(owed ? codePitch('straight_answer_then_pitch', straightAnswerPitch(e, theirName), theirName) : fromPlaybook('what_we_do', { topic: 'what_we_do' }));
  /* They chased us: their turn follows their own earlier turn with nothing of ours between (mergeBursts kept them apart). */
  if (idx > 0 && thread[idx - 1].from === 'them' && !autoFlags[idx - 1] && RE.chase.test(text)) {
    if (owed) { const n = earliestName(); return g(codePitch('they_chased', chasedPitch(e, n), n)); }
    return g(noDraft('chased', 'chased'));
  }
  /* "How can I get up on the AI search?" after the pitch / the issues list (Paul, 2026-10-23, Quick Drive): answer the HOW in
     three short lines, no price, then the voice note or the call. It answers the agency question too when they said
     they run the site themselves ("I manage it myself… how can I get up on the ai search?"). */
  if (!owed && HOW_TO_GET_NAMED.test(text)) {
    const self = ask === 'agency' && RE.self.test(text) && !RE.agency.test(text);
    return g(fromPlaybook('how_to_get_named', {}, howToGetNamedLine(self)));
  }
  /* SITE SHARED (Paul, 2026-10-23): we said we couldn't find a website and they sent one (a map pin or a social link beside
     it is fine). Read across EVERYTHING they sent since our last message: Quick Drive sent the site, then a map pin, then
     a Facebook link six minutes later (two turns), and the last turn alone read as "facebook only". The reply lists only
     what the website check really found on THAT site; not checked yet → Needs you, no draft (never an auto-crawl, Paul).
     Before the answer-to-our-question rules below. */
  if (!first) {
    let since = idx; while (since > 0 && thread[since - 1].from === 'them') since--;
    const theirsSince = thread.slice(since, idx + 1).map((m) => m.text).join('\n');
    const sharedSite = LINK.test(theirsSince) ? siteLinkHost(theirsSince) : null;
    /* A question in their latest turn ("how much?") is answered by the rules below, never skipped for the site. */
    if (sharedSite && (LINK.test(text) || !/\?/.test(text)) && thread.slice(0, since).some((m) => m.from === 'us' && SAID_NO_SITE.test(m.text))) {
      const st = e.site?.state ?? null;
      const checked = sameSite(sharedSite, e.websiteUrl) && (st === 'issues' || st === 'clean' || st === 'unreadable');
      if (!checked) {
        return g(plan({ move: 'site_shared', read: 'site_shared', intent: 'site_shared', autoDraft: false, noDraft: true, needsYou: flag('site_not_checked'),
          note: 'They sent their website. Add it to the lead, press Crawl site, then Regenerate.' }));
      }
      const issues = st === 'issues' ? siteOf(e).issues : st === 'unreadable' ? [UNREADABLE_LINE] : [];
      const r = siteSharedReply(issues, { googleNoLink: e.foundOnGoogle, whoKnown: whoRunsKnown(thread) });
      return g(plan({ move: 'site_shared', read: 'site_shared', intent: 'site_shared', points: [`Use this reply, word for word: "${r.text}"`], question: r.question,
        fixedText: r.text, structure: r.structure, closer: r.question === PITCH_AGENCY_Q ? 'agency' : null }));
    }
  }

  /* 5. An answer to the question our last message asked. */
  const ownTopic = questionTopic(text);
  const asksItsOwn = (!!ownTopic && (ownTopic !== 'term' || /\?/.test(text))) || (RE.howMuch.test(text) && /\?/.test(text));
  const contract = (): MovePlan => {
    const note = readEndDate(text, nowMs);
    if (note) return fromPlaybook('in_contract', { followUp: note, note: `Tied into a contract until ${note.said} (${note.endsOn}). Set the Next Action for ${note.checkBackOn} when you send.` });
    return fromPlaybook('tied_no_date');
  };
  const known = whoRunsKnown(thread);
  if (ask && !first && !CLEAR_NO.test(text) && !NEGATED.test(text) && !asksItsOwn && t.category !== 'wrong_person' && !RE.emailAddr.test(text)) {
    let p: MovePlan | null = null;
    if (ask === 'emotional' || ask === 'emotional_no_site') {
      if (!BARE_NO.test(text) && t.category !== 'not_interested' && t.category !== 'already_sorted') {
        const site = ask === 'emotional_no_site' || noSiteOf(e);
        const q = site ? PITCH_SITE_Q : PITCH_AGENCY_Q;
        p = plan({ move: 'pitch_next', read: 'answered_closer', points: [`Use this line, word for word: "${q}"`], question: q, fixedText: q, closer: site ? 'site' : 'agency' });
      }
    } else if (ask === 'agency') {
      if (RE.tied.test(text)) p = contract();
      else if (RE.free.test(text)) p = fromPlaybook('free_to_leave');
      else if (RE.notSure.test(text)) p = fromPlaybook('not_sure_who');
      else if (RE.friend.test(text)) p = fromPlaybook('friend_built');
      else if (RE.agency.test(text) || /\bboth\b/i.test(text)) p = fromPlaybook('agency');
      else if (RE.self.test(text) || BARE_NO.test(text)) p = fromPlaybook('self_managed');
      else if (BARE_YES.test(text)) p = fromPlaybook('not_sure_who');
    } else if (ask === 'contract' || ask === 'end_date') {
      if (RE.free.test(text) || BARE_NO.test(text)) p = fromPlaybook('free_to_leave');
      else if (readEndDate(text, nowMs)) p = contract();
      else if (RE.tied.test(text) || BARE_YES.test(text)) p = ask === 'end_date' ? null : fromPlaybook('tied_no_date');
    } else if (ask === 'pay_monthly') {
      if (BARE_NO.test(text) && !RE.tied.test(text)) p = fromPlaybook('free_to_leave');
      else if (RE.tied.test(text)) p = contract();
      else if (RE.yesish.test(text) || /\byes\b|£|\bmonth\b/i.test(text)) p = fromPlaybook('agency');
    } else if (ask === 'happy_change') {
      if (KEEP_THEM.test(text) || BARE_NO.test(text)) p = noDraft('not_interested', 'keeps_provider');
      else if (RE.yesish.test(text) || /\b(happy\s+to|would\s+change|open\s+to|yes)\b/i.test(text)) p = fromPlaybook('free_to_leave');
    } else if (ask === 'site') {
      if (RE.facebook.test(text) && !/https?:\/\/(?!(www\.|m\.)?facebook\.)/i.test(text)) p = fromPlaybook('facebook_only');
      else if (LINK.test(text)) p = null; // the website-given rule below
      else if (BARE_YES.test(text)) p = plan({ move: 'site_followup', read: 'has_website', points: ['Thank them.'], question: "What's the web address so I can take a look?" });
      else if (NO_SITE_ANSWER.test(text)) p = fromPlaybook('no_website');
    } else if (ask === 'offer') {
      if (RE.voiceWord.test(text) && !/\b(can'?t|cannot|no)\b/i.test(text)) p = fromPlaybook('voice_yes', { note: 'They said yes to the voice note: record it with the voice-note script.' });
      else if (RE.callWord.test(text) || RE.namedTime.test(text)) p = null; // the call rules below
      else if (RE.yesish.test(text) || BARE_YES.test(text)) p = fromPlaybook('voice_yes', { note: 'They said yes to the voice note: record it with the voice-note script.' });
    } else if (ask === 'call_time' || ask === 'better_time') {
      const note = readEndDate(text, nowMs);
      /* B6: a bare hour after we asked a time ("Yes 6", "5ish") is the time. */
      const bareHour = /^\W*(?:(?:yes|yeah|yep|ok|okay|sure|go\s+on)\W+)?(?:at\s+|about\s+|around\s+)?(?:[1-9]|1[0-2])(?::[0-5]\d)?\s*(?:am|pm|ish|o'?clock)?\W*$/i.test(text);
      if (ask === 'call_time' && (RE.namedTime.test(text) || bareHour)) {
        p = plan({ move: 'set_call', read: 'call_time_agreed', win: 'call_time_agreed', points: ['Confirm you will call them at the time they said, using their words for the time. One short line.'], question: null });
      } else if (ask === 'better_time' && (note || RE.namedTime.test(text) || RE.monthYear.test(text))) {
        p = plan({ move: 'playbook', read: 'not_now_time', intent: 'not_now', guide: NOT_NOW_WITH_TIME, points: [`Say this, close to these words, using their words for the time: "${NOT_NOW_WITH_TIME}"`], question: null,
          followUp: note, note: note ? `Check back on ${note.checkBackOn} (they said ${note.said}). Set the Next Action when you send.` : 'They named a time to check back: set the Next Action when you send.' });
      }
    }
    if (p) return g(p);
  }

  /* 6. What they said, one intent each (the playbook). Order matters: the specific before the general. */
  if (RE.emailAddr.test(text)) return g(noDraft('email_given', 'email_given'));
  if (RE.phoneNumber.test(text) && text.length < 80) return g(fromPlaybook('number_sent'));
  if (RE.facebookOnly.test(text)) return g(fromPlaybook('facebook_only'));
  /* A map pin, a social profile or a directory page is not their website: a person looks first. */
  if (LINK.test(text) && NOT_THEIR_SITE.test(text) && !RE.facebookOnly.test(text)) return g(plan({ move: 'link', read: 'link', autoDraft: false, needsYou: flag('link'), points: ['Thank them and say you will take a look.'] }));
  if (LINK.test(text)) {
    /* The first reply: a link only changes the pitch when we have no website on record for them. */
    if (!first || noSiteOf(e)) {
      return g(fromPlaybook('website_given', { note: 'They gave a website. Run Crawl site on it from the lead (the draft does not crawl).' }, whoRunsKnown(thread) ? WEBSITE_GIVEN_KNOWN : undefined));
    }
  }
  if (RE.notOwner.test(text)) return g(fromPlaybook('not_owner'));
  if (t.category === 'wrong_person') return g(plan({ move: 'close_politely', read: 'wrong_person', autoDraft: false, needsYou: flag('wrong_person'), points: ['Say sorry, your mistake, and you will not message again.'] }));
  if (RE.tooExpensive.test(text) && !CLEAR_NO.test(text)) return g(fromPlaybook('too_expensive'));
  /* ⛔ "I'm away until the 18th", "on annual leave", "out of action for a couple of months" (Paul, 2026-10-21; recon: 8 first replies were
     pitched with "Hi Away,"): parked with the not-now wording, never the pitch. Their date is noted, never written. */
  if (RE.away.test(text) && !/\binterested\b/i.test(text) && !CLEAR_NO.test(text) && !RE.phoneNumber.test(text) && !RE.emailAddr.test(text)) {
    const back = awayUntil(text, nowMs);
    return g(plan({ move: 'playbook', read: 'away', intent: 'not_now', guide: NOT_NOW_WITH_TIME, points: [`Say this, close to these words: "${NOT_NOW_WITH_TIME}"`], question: null,
      followUp: back, note: back ? `They are away until ${back.said}. Check back on ${back.checkBackOn}: set the Next Action when you send.` : 'They said they are away: set the Next Action for when they are back when you send.' }));
  }
  if ((RE.notNow.test(text) || RE.startLater.test(text)) && !/\binterested\b/i.test(text) && !CLEAR_NO.test(text)) {
    const note = readEndDate(text, nowMs);
    if (note || RE.monthYear.test(text)) {
      return g(plan({ move: 'playbook', read: 'not_now_time', intent: 'not_now', guide: NOT_NOW_WITH_TIME, points: [`Say this, close to these words, using their words for the time: "${NOT_NOW_WITH_TIME}"`], question: null,
        followUp: note, note: note ? `Check back on ${note.checkBackOn} (they said ${note.said}). Set the Next Action when you send.` : 'They named a time to check back: set the Next Action when you send.' }));
    }
    return g(fromPlaybook('not_now'));
  }
  const rule = mayClaimNamedInstead(e.named?.named ?? 0, e.named?.valid ?? 0) && !!e.named && e.named.valid > 0;
  const audited = !!e.named && e.named.valid > 0;
  if (RE.dontNeed.test(text) && !CLEAR_NO.test(text)) return g(fromPlaybook('dont_need', {}, rule ? undefined : audited ? DONT_NEED_SOFT : DONT_NEED_NO_AUDIT));
  if (t.category === 'not_interested' || CLEAR_NO.test(text) || (t.category === 'already_sorted' && !PROVIDER.test(text) && !RANKS.test(text))) {
    return g(noDraft('not_interested', 'not_interested', 'close_politely'));
  }
  if (MALAY.test(text) && !ENGLISH_HINT.test(text)) {
    return g(plan({ move: 'other_language', read: 'other_language', autoDraft: false, needsYou: flag('other_language'), points: ['In English: say sorry, you only speak English.'], question: 'Is it ok to carry on in English?' }));
  }
  if (BOT.test(text)) return g(fromPlaybook('is_bot', { move: 'is_bot' }));
  if (VOICE_REQUEST.test(text) && !/\b(can'?t|cannot)\b/i.test(text)) return g(fromPlaybook('voice_yes', { note: 'They asked for a voice note: record it with the voice-note script.' }));
  if (RE.sendEmail.test(text)) return g(fromPlaybook('send_email'));
  /* "We're in a contract until June", said without being asked: noted, never answered as a contract question. */
  if (!first && RE.tied.test(text) && /\b(contract|tied|locked)\b/i.test(text) && !/\?/.test(text)) return g(contract());
  const topic = questionTopic(text);
  if (t.category === 'call_request' || t.category === 'booking' || (/\b(call|ring|phone)\b/i.test(text) && (RE.namedTime.test(text) || NAMED_TIME.test(text)) && !topic)) {
    if (RE.namedTime.test(text)) return g(plan({ move: 'set_call', read: 'call_time_agreed', win: 'call_time_agreed', points: ['Confirm you will call them at the time they said, using their words for the time. One short line.'], question: null }));
    return g(fromPlaybook(RE.busy.test(text) || /\blater\b/i.test(text) ? 'busy' : 'call_yes'));
  }
  /* "Bit busy at the moment" with no ask to call later: not now (recon R087). "Busy, call me later" stays busy (the call rule above). */
  if (RE.busy.test(text) && !/\?/.test(text)) return g(fromPlaybook(/\b(call|ring|phone|bell|later)\b/i.test(text) ? 'busy' : 'not_now'));
  if (RE.thinkAboutIt.test(text)) return g(fromPlaybook('think_about_it'));
  if (RE.doesAiMatter.test(text)) return g(fromPlaybook('does_ai_matter', {}, rule ? undefined : audited ? DOES_AI_MATTER_SOFT : DOES_AI_MATTER_NO_AUDIT));
  if (RE.examples.test(text)) return g(fromPlaybook('examples', {}, audited ? undefined : EXAMPLES_NO_AUDIT));
  if (RE.definitely.test(text)) return g(fromPlaybook('definitely'));
  if (RE.catch.test(text)) return g(fromPlaybook('catch'));
  if (topic === 'price' || (RE.howMuch.test(text) && !topic)) return g(fromPlaybook('how_much', { topic: 'price' }));
  if (topic === 'ownership' || topic === 'domain' || RE.ownSite.test(text)) return g(fromPlaybook('own_site', { topic: topic ?? 'ownership' }));
  if (topic === 'build_time' || RE.howLong.test(text)) return g(fromPlaybook('how_long', { topic: 'build_time' }));
  if (RE.whoAreYou.test(text) || WHO_ONLY.test(text)) return g(fromPlaybook('who_are_you'));
  /* "What's this about?" on the first reply: the pitch IS the answer. */
  if (first && RE.whatsThisAbout.test(text)) return g(pitchPlan());
  if (RE.whatWeDo.test(text) || topic === 'what_we_do') return g(fromPlaybook('what_we_do', { topic: 'what_we_do' }));
  if (topic) {
    /* The fact sheet's other answers (term, cancel, monthly start, after the term, the guarantee, measurement, what we
       need, changes): word for word from the sheet. */
    const fact = factFor(topic);
    if (!fact) return g(noDraft('question_not_on_sheet', `question:${topic}`, 'unknown_question'));
    const priceFamily = topic === 'term' || topic === 'monthly_start' || topic === 'cancel' || topic === 'after_term' || topic === 'guarantee';
    const confidence = topic === 'guarantee';
    /* ⛔ No AI brand unless they asked which tool (caught above): the measurement answer says "the main AI tools". */
    const say = topic === 'guarantee' ? `${CONFIDENCE_LINE} ${GUARANTEE_REFUND}` : fact.say.split(ENGINE_WORDING).join('the main AI tools');
    return g(plan({ move: 'answer_fact', read: `question:${topic}`, topic, allowPrice: priceFamily, confidence,
      needsYou: fact.paulLooks ? flag('paul_looks') : null, autoDraft: !fact.paulLooks,
      points: [`Use this answer, word for word: "${say}"`], question: VOICE_Q }));
  }
  /* The first reply, when nothing above matched: THE PITCH ("yes", "that's correct", "how can I help", a name, "hello?",
     even "interested"). Only an unanswerable question goes to a person. */
  /* ⛔ A plain confirm or "how can I help" is never "No playbook reply fits" (Paul, 2026-10-21): the pitch while it is owed
     (checked BEFORE the first-reply question rule — "How can I help?" is a question to triage), else the go-on step below. */
  const plain = isPlainConfirm(text, t.category);
  if (plain && first) return g(pitchPlan());
  if (first) {
    if (t.category === 'question' && !RE.whatsThisAbout.test(text)) return g(noDraft('question_not_on_sheet', 'question', 'unknown_question'));
    if (LAUGH_ONLY.test(text)) return g(noDraft('unsure', 'laughing'));
    return g(pitchPlan());
  }
  /* Who runs the site, said without being asked. */
  if (RE.tied.test(text) && /\b(contract|tied|locked)\b/i.test(text)) return g(contract());
  if (RE.friend.test(text) && /\b(site|website|web|does|did|built|made|look)\b/i.test(text)) return g(fromPlaybook('friend_built'));
  if (PROVIDER.test(text) || (RE.agency.test(text) && /\b(site|website|web|does|do|look|with|use|pay)\b/i.test(text))) return g(fromPlaybook('agency'));
  if (RANKS.test(text)) {
    const line = auditLine(e);
    return g(plan({ move: 'objection_rank', read: 'already_ranks', points: ['Agree with what is true: fair enough, that is good.', ...(line ? [line] : [])], question: 'Want me to send you a quick voice note showing what I found?' }));
  }
  if (RE.interested.test(text) || ((t.category === 'interested' || CLEAR_YES.test(text)) && !RE.goOn.test(text))) return g(fromPlaybook('interested', { allowPrice: true }));
  if (RE.goOn.test(text) || BARE_YES.test(text) || RE.yesish.test(text) || plain) {
    /* "go on then" / "ok": the agency question, or (no website) the website question, or the call / voice note once known. */
    if (known) return g(fromPlaybook('go_on', {}, GO_ON_KNOWN));
    if (noSiteOf(e)) return g(fromPlaybook('go_on', {}, PITCH_SITE_Q));
    return g(fromPlaybook('go_on'));
  }
  if (LAUGH_ONLY.test(text)) return g(noDraft('unsure', 'laughing'));
  if (t.category === 'acknowledgement' || t.category === 'irrelevant') {
    return g(plan({ move: 'ack', read: 'ack', autoDraft: false, noDraft: true, points: [], question: null }));
  }
  /* Anything unmatched: Needs you, no draft (Paul, 2026-10-20). */
  if (t.category === 'question') return g(noDraft('question_not_on_sheet', 'question', 'unknown_question'));
  return g(noDraft('off_topic', 'unclear'));
}

/* ── capitals, done in code (never trusted to the model) ──────────────────────────────────────── */

/* A link, an email or a bare domain — never the full stop after it (that ends the sentence). */
const PROTECTED = /(https?:\/\/[^\s]*[^\s.,!?;:]|www\.[^\s]*[^\s.,!?;:]|[\w.+-]+@[\w-]+(?:\.[\w-]+)+|\b[a-z0-9-]+\.(?:co\.uk|com|uk|live|net|org|io)\b(?:\/[^\s]*[^\s.,!?;:])?)/gi;
const ILL_VERBS = 'call|send|give|get|be|do|have|let|ring|drop|check|look|pop|text|message|sort|speak|try|explain|show|chat|come|see|leave|pass|put|run|take|keep|make|go';
/** A private-use character marks a protected link / email while the capitals are fixed (never typed by anyone). */
const MARK = String.fromCharCode(0xe000);

/** Capital at the start of every sentence and line; I, I'm, I'll, I've, I'd; ChatGPT / Gemini. Links, emails and numbers untouched. */
export function tidyCaps(text: string): string {
  const stash: string[] = [];
  let s = String(text ?? '').replace(PROTECTED, (m) => { stash.push(m); return MARK + String(stash.length - 1) + MARK; });
  s = s.replace(/\bi'(m|ll|ve|d)\b/gi, (_m, x: string) => `I'${x.toLowerCase()}`)
    .replace(/\bim\b/gi, (m) => (m === 'IM' ? m : "I'm"))
    .replace(new RegExp(`\\bill\\b(?=\\s+(?:${ILL_VERBS})\\b)`, 'gi'), "I'll")
    .replace(/\bive\b(?=\s+(?:got|had|been|seen|checked|looked|sent|done)\b)/gi, "I've")
    .replace(/\bi\b/g, 'I')
    .replace(/\bchat\s?gpt\b/gi, 'ChatGPT')
    .replace(/\bgemini\b/gi, 'Gemini');
  s = s.split('\n').map((line) => line.replace(/(^\s*|[.!?]\s+)([a-z])/g, (_m, pre: string, ch: string) => pre + ch.toUpperCase())).join('\n');
  return s.replace(new RegExp(MARK + '([0-9]+)' + MARK, 'g'), (_m, n: string) => stash[Number(n)]);
}
