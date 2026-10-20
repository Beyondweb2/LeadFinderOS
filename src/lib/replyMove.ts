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
import { factFor, CONFIDENCE_LINE, GUARANTEE_REFUND, type FactTopic } from './offerFactSheet.ts';
import { mayClaimNamedInstead } from './namedShareRule.ts';
import { carryOn } from './draftEvidence.ts';

export type MoveId =
  | 'stop' | 'intro_hook' | 'first_reply_pitch' | 'pitch_next' | 'site_followup' | 'offer_voice_note' | 'set_call' | 'answer_fact' | 'objection_provider' | 'objection_rank'
  | 'close_politely' | 'is_bot' | 'media' | 'ack' | 'auto_reply' | 'privacy' | 'other_language' | 'link'
  | 'escalate' | 'unknown_question' | 'unsure';

export type NeedsYouReason =
  | 'opt_out' | 'angry' | 'do_not_contact' | 'not_interested' | 'wrong_person' | 'legal' | 'complaint' | 'payment'
  | 'media' | 'privacy' | 'other_language' | 'link' | 'question_not_on_sheet' | 'paul_looks' | 'unsure'
  | 'already_replied' | 'ai_limit' | 'repeat_auto_reply' | 'draft_failed' | 'paused';

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
};

export interface MoveThreadMsg {
  from: 'us' | 'them';
  text: string;
  messageType?: string | null;
  templateName?: string | null;
  /** When it arrived (ISO). Absent on fixtures: then no burst is read (each message stands alone). */
  at?: string | null;
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
   *  (plainIssueTitle), worst first. Absent = read from hasWebsite / findings (older callers, fixtures). */
  site?: { state: SiteState; issues: string[]; evidence?: Array<{ title: string; pages: string[] }> } | null;
  /** The "AI handles replies" switch (whatsapp_outreach_state.ai_handles_replies). ON: never say "I read and send every
   *  one myself" — replies may be automated. Absent = off. */
  aiAutoReplies?: boolean;
}
export type SiteState = 'issues' | 'clean' | 'not_checked' | 'unreadable' | 'no_website' | 'profile';

export interface MoveInput {
  /** Oldest first; the newest prospect message is the LAST 'them' row. */
  thread: MoveThreadMsg[];
  suppressed: boolean;
  /** AI drafts sent since the last win event (a voice note we sent, a booked call). */
  aiSentSinceWin: number;
  evidence: MoveEvidence;
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
  /** The confidence line (offerFactSheet CONFIDENCE_LINE) is one of the points, recorded on the draft. */
  confidence?: boolean;
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
const VOICE_REQUEST = /\bvoice\s*(note|message|memo)\b|\bsend\s+(me\s+)?a\s+(voice|vn)\b/i;
/** A time they named: "after 5", "tomorrow", "10am", "monday" … */
const NAMED_TIME = /\b(\d{1,2}(:\d{2})?\s*(am|pm)?|after\s+\d|before\s+\d|tomorrow|today|tonight|this\s+(morning|afternoon|evening)|morning|afternoon|evening|lunch(time)?|mon(day)?|tue(s(day)?)?|wed(nesday)?|thu(rs(day)?)?|fri(day)?|sat(urday)?|sun(day)?|now|later|in\s+\d+\s*(mins?|minutes|hours?))\b/i;
const MALAY = /\b(boleh|saya|tak|tidak|berminat|terima\s+kasih|siapa|apa|ini|kami|nak|ya\s+saya|encik|puan|maaf)\b/i;
const ENGLISH_HINT = /\b(the|you|is|it|and|yes|no|what|who|how|thanks|please|mate|me|my|i|we)\b/i;
const PROVIDER = /\b(i\s+pay\s+(him|her|them|someone|a\s+guy)|(my|our)\s+(web\s*)?(guy|guys|designer|developer|nephew|son|daughter|brother|mate|friend|agency|web\s*(person|man|company))|someone('?s)?\s+(on\s+it|does\s+(it|that|my|our))|(got|have)\s+(someone|somebody|a\s+(guy|company|designer|developer|agency))|leave\s+(the\s+)?(website|site|web)\s+(stuff\s+)?to\s+them|they\s+(do|look\s+after|manage)\s+(it|the\s+site|my\s+site|the\s+website))\b/i;
const RANKS = /\b(i\s+(already\s+)?(come\s+up|show\s+up|rank|appear)|already\s+(rank|show|come\s+up|appear|on\s+(the\s+)?first)|first\s+(page|on\s+google)|top\s+of\s+google|number\s+one|(my|our)\s+reviews|five\s+star|5\s*star|\d+\s+reviews)\b/i;
const CLEAR_YES = /\b(yes\s+please|yes\s+send|go\s+on\s+then|go\s+ahead|i'?m\s+interested|we'?re\s+interested|i\s+am\s+interested|interested|sounds\s+(good|great|interesting)|keen|let'?s\s+do\s+it|sign\s+me\s+up|i'?m\s+in|count\s+me\s+in|tell\s+me\s+more|send\s+(me\s+)?(over\s+)?(the\s+|some\s+)?(details|detials|deets|info|more))\b/i;
const NEGATED = /\b(not|n'?t|never|no)\s+([\w']+\s+){0,2}interested\b/i;

/** Which fact-sheet topic a question asks about, or null. Order matters: the specific before the general. */
export function questionTopic(text: string): FactTopic | null {
  const t = norm(text).toLowerCase();
  if (/\b(cancel|get\s+out|leave\s+early|stop\s+paying|exit)\b/.test(t)) return 'cancel';
  if (/\b(guarantee|guaranteed|money\s+back|what\s+if\s+it\s+(does\s*n'?t|doesnt|don'?t)\s+work|refund)\b/.test(t) || WORKS.test(t)) return 'guarantee';
  if (/\b(after\s+(the\s+)?(12|twelve)|after\s+(the\s+)?(first\s+)?year|when\s+it\s+ends|end\s+of\s+the\s+(term|contract))\b/.test(t)) return 'after_term';
  if (/\b(how\s+long\s+(is|for)\s+the\s+(contract|term)|contract|minimum|tied\s+in|commit(ment)?|how\s+many\s+(months|payments))\b/.test(t)) return 'term';
  if (/\b(how\s+much|price|cost|costs|charge|fee|£|pricing|what\s+do\s+you\s+charge|rates?)\b/.test(t)) return 'price';
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
  if (/^initial_/.test(m.templateName ?? '')) return true;
  return /\bis\s+this\b.{0,60}\?/i.test(m.text) && m.text.length < 160;
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
export function isAutoReply(text: string | null | undefined, messageType?: string | null): boolean {
  const t = String(text ?? '');
  const notAQuestion = !/\?\s*$/.test(t.trim());
  return triageByRules(t, { isClient: false, messageType: messageType ?? 'text' }).category === 'automated'
    || (notAQuestion && (AUTO_EXTRA.test(t) || AUTO_GREETING.test(t))) || FOREIGN_AUTO.test(t);
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
  const own = thread.map((m) => m.from === 'them' && isAutoReply(m.text, m.messageType));
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
const withA = (s: string) => (/^[aeiou]/i.test(s) ? `an ${s}` : `a ${s}`);
const listNames = (n: string[]) => (n.length <= 1 ? n.join('') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`);
/** Issue titles as one list: semicolons when a title has its own comma, so the list still reads. */
const listIssues = (n: string[]) => (n.some((x) => x.includes(',')) && n.length > 1 ? `${n.slice(0, -1).join('; ')}; and ${n[n.length - 1]}`
  /* Each title is a whole sentence (websiteCheck PLAIN_LINE); three or more take ", and" so a title holding "and" stays apart. */
  : n.length >= 3 ? `${n.slice(0, -1).join(', ')}, and ${n[n.length - 1]}` : listNames(n));
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
/** "I asked Gemini <the missed search>": the engine and question where they were NOT named (Paul, 2026-10-20). ⛔ Never
 *  name an engine that DID name them, and never two tools in one conversation: when a message we already sent named a
 *  different tool, the missed search is said as "AI". No missed search on record: trade + town on the conversation's tool. */
export function askedPhrase(e: MoveEvidence): string | null {
  if (!e.trade || !e.town) return null;
  const m = e.missed;
  if (m && m.question.trim()) return `I asked ${m.engine === e.engineWords ? engineName(e.engineWords) : 'AI'} ${spokenSearch(m.question, e.trade)}`;
  return `I asked ${engineName(e.engineWords)} for ${withA(tradeWord(e.trade))} in ${e.town}`;
}
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** One true sentence from the audit, or null. "Named others instead" only under the one-third rule, counted over EVERY
 *  answer in the score. ⛔ Never "named you in X of Y answers" or "a gap in the rest" (Paul, 2026-10-20): above a third
 *  it says what the missed search showed, nothing more. */
export function auditLine(e: MoveEvidence): string | null {
  const asked = askedPhrase(e);
  if (!asked || !e.named || e.named.valid <= 0) return null;
  const { named, valid } = e.named;
  if (named >= valid) return `When ${lowerFirst(asked)} it named you every time, which is great.`;
  if (mayClaimNamedInstead(named, valid)) {
    if (e.hookAlreadySent) return `Like I said, when ${lowerFirst(asked)} it put other businesses forward.`;
    return e.competitors.length
      ? `${asked} and it mentioned ${listNames(e.competitors.slice(0, 3))}.`
      : `${asked} and it mentioned other businesses, not you.`;
  }
  /* The soft version: what that ONE missed answer said, with no "instead", no "not you", no closer. */
  return e.competitors.length ? `${asked} and it mentioned ${listNames(e.competitors.slice(0, 3))}.` : `${asked} and it didn't mention you.`;
}

/* ── the first-reply pitch (Paul, 2026-10-20, wording A): every word built here ───────────────────── */

/** Their answer to the agency question when they run the site themselves: ask, never assume (Paul, 2026-10-20). */
export const PITCH_SELF_MANAGED_REPLY = 'Nice one. Ok if I send a quick voice note on what I found?';
/** "Is this a bot?" — the answer depends on the AI auto-reply switch (Paul, 2026-10-20). */
export const BOT_ANSWER_SWITCH_OFF = "It's Paul from Findable. I use AI to help write some messages, but I read and send every one myself.";
export const BOT_ANSWER_SWITCH_ON = "It's Paul from Findable. I use AI to help with messages, and some replies on here may be automated.";
/** THE ONE QUESTION the pitch ends on (a website on record): the agency question and the voice note offer. */
export const PITCH_AGENCY_VOICE = 'Are you with an agency, or do you manage the website yourself? Either way I can send a quick voice note on what I found.';
/** The pitch's question when no website is on record (never the agency question). */
export const PITCH_SITE_Q = "Do you have a website I've missed?";
/** After "no, I haven't got one": the voice note offer. */
export const PITCH_VOICE_Q = 'Ok if I send a quick voice note on what I found?';
export const PITCH_INSTEAD_LINE = 'AI is recommending your competitors instead.';
export const PITCH_WHY_LEAD = 'I looked into why this might be happening and';
/** What we do, said once, with no promise of a result (Paul, 2026-10-20). */
export const PITCH_SPECIALISE_LINE = 'I specialise in helping local businesses get recommended by AI, so those customers come to you instead.';
/** Paul's no-website words for the pitch. It names both tools on purpose; the checker reads around it. */
export const PITCH_NO_SITE_LINE = "I couldn't find a website for you, so Gemini and Google AI have nothing of yours to read.";
export const PITCH_INTRO_LINE = "It's Paul from Findable. I help local businesses show up when people ask AI tools for their trade in their area.";
/** Site issues named in the pitch, most serious first. */
export const PITCH_MAX_ISSUES = 3;

/** The website check's state for a move: the stored one, else read from what older callers hand over. */
export function siteOf(e: MoveEvidence): { state: SiteState; issues: string[] } {
  if (e.site) return { state: e.site.state, issues: [...new Set(e.site.issues.map((t) => t.trim()).filter(Boolean))] };
  if (!e.hasWebsite) return { state: 'no_website', issues: [] };
  return e.findings.length ? { state: 'issues', issues: e.findings.map((f) => f.title) } : { state: 'not_checked', issues: [] };
}
const noSiteOf = (e: MoveEvidence) => { const s = siteOf(e).state; return s === 'no_website' || s === 'profile'; };

/** "Hi Kylie," only when the site's own crawl states a person as owner / founder (MoveEvidence.ownerName). First name only;
 *  never guessed from the business name. No name → no greeting line. */
export function pitchGreeting(e: MoveEvidence): string | null {
  const first = String(e.ownerName ?? '').trim().split(/\s+/)[0] ?? '';
  return /^[A-Z][a-z]+(?:['’-][A-Za-z]+)?$/.test(first) ? `Hi ${first},` : null;
}

/** THE FIRST-REPLY PITCH (Paul, 2026-10-20, wording A):
 *    [Hi <first name>,]
 *    I asked <worst engine> "<its question>" and it mentioned <that answer's names>.
 *    AI is recommending your competitors instead. I looked into why this might be happening and found <issues>.
 *    I specialise in helping local businesses get recommended by AI, so those customers come to you instead.
 *    <the agency question> (no website: "Do you have a website I've missed?") — the ONLY question.
 *  ⛔ "AI is recommending your competitors instead" only under the one-third rule; above it (the soft version) the same shape
 *     without that sentence. ⛔ No closer question, no "pointed to them", no guarantee, no price, no past results here; the
 *     confidence line stays on price / does-it-work / catch / who-are-you / guarantee replies. Nothing absent is invented. */
export function firstReplyPitch(e: MoveEvidence): { lines: string[]; question: string; closer: 'agency' | 'site' } {
  const noSite = noSiteOf(e);
  const next = noSite ? { question: PITCH_SITE_Q, closer: 'site' as const } : { question: PITCH_AGENCY_VOICE, closer: 'agency' as const };
  const hi = pitchGreeting(e);
  const withHi = (lines: string[]) => (hi ? [hi, ...lines] : lines);
  const counts = e.named && e.named.valid > 0 ? e.named : null;
  if (!e.trade || !e.town || !counts) return { lines: withHi([PITCH_INTRO_LINE, ...(noSite ? [PITCH_NO_SITE_LINE] : [])]), ...next };
  const full = mayClaimNamedInstead(counts.named, counts.valid);
  const site = siteOf(e);
  const asked = askedPhrase(e) as string;
  const rivals = e.competitors.slice(0, 3);
  const issues = site.state === 'issues' ? site.issues.slice(0, PITCH_MAX_ISSUES) : [];
  const first = rivals.length ? `${asked} and it mentioned ${listNames(rivals)}.` : full ? `${asked} and it mentioned other businesses, not you.` : `${asked} and it didn't mention you.`;
  const why = noSite
    ? `${PITCH_WHY_LEAD} ${PITCH_NO_SITE_LINE}`
    : issues.length ? `${PITCH_WHY_LEAD} found ${issues.length > 1 ? 'a few things' : 'one thing'} on your website: ${listIssues(issues.map(carryOn))}.` : null;
  const second = [full ? PITCH_INSTEAD_LINE : null, why].filter(Boolean).join(' ');
  return { lines: withHi([first, ...(second ? [second] : []), PITCH_SPECIALISE_LINE]), ...next };
}
/** The pitch as one message: each line its own paragraph, the question last. */
export const pitchText = (p: { lines: string[]; question: string; closer: string }): string => [...p.lines, p.question].join('\n\n');

/** Our previous message was a step of the pitch: which question it ended on. */
type PitchStep = 'emotional' | 'emotional_no_site' | 'agency' | 'site';
function pitchAsked(m: MoveThreadMsg | null): PitchStep | null {
  const t = norm(m?.text ?? '');
  if (/\bwould\s+you\s+rather\s+those\s+customers\s+came\s+to\s+you\b/i.test(t)) return /couldn'?t\s+find\s+a\s+website/i.test(t) ? 'emotional_no_site' : 'emotional';
  if (/\bagency\b[^?]{0,80}\byourself\b[^?]*\?/i.test(t)) return 'agency';
  if (/\bwebsite\s+i'?ve\s+missed\b/i.test(t)) return 'site';
  return null;
}
/** An answer to "agency or yourself?". */
const SITE_ANSWER = /\b(agency|agencies|myself|my\s+self|me|i\s+do|we\s+do|i\s+manage|we\s+manage|i\s+look\s+after|we\s+look\s+after|in[- ]?house|freelancer?|designer|developer|web\s*(guy|company|person|man|team)|nephew|son|daughter|brother|sister|wife|husband|partner|mate|friend|someone|somebody|wix|squarespace|wordpress|go\s*daddy|yell|both|neither)\b/i;
const BARE_YES = /^\W*(yes|yeah|yep|yup|yh|ya|ye)\W*$/i;
/** "I do it myself", "we manage it", "in house": they run the site themselves. */
const SELF_MANAGED = /\b(myself|my\s+self|ourselves|i\s+do(\s+it)?|we\s+do(\s+it)?|i\s+manage|we\s+manage|i\s+look\s+after|we\s+look\s+after|in[- ]?house|me)\b/i;
const BARE_NO = /^\W*(no|nope|nah|na)\b/i;
const NO_SITE_ANSWER = /^\W*(no|nope|nah|na)\b|\b(don'?t|do\s+not|haven'?t|have\s+not)\s+(have|got)\s+(one|a\s+(web)?site)|\bno\s+(web)?site\b/i;
const CLEAR_NO = /\b(not\s+interested|no\s+thanks?|no\s+thank\s+you|not\s+for\s+(me|us)|(we'?re|i'?m)\s+(ok|fine|good|alright|sorted|busy\s+enough))\b/i;
/** "Does it actually work?", "is it legit?", "how do I know it'll work?" — the guarantee answer, with the confidence line. */
const WORKS = /\b(does\s+(it|this|that)\s+(actually\s+|really\s+)?work|will\s+(it|this|that)\s+(actually\s+|really\s+)?work|is\s+(it|this)\s+legit|how\s+do\s+(i|we)\s+know\s+(it'?ll|it\s+will|it\s+works))\b/i;

/* ── the one rule ─────────────────────────────────────────────────────────────────────────────── */

const VOICE_Q = 'Shall I send you a quick voice note explaining it?';
const CALL_Q = 'What time suits you for a quick call?';

function plan(p: Partial<MovePlan> & { move: MoveId; read: string }): MovePlan {
  return { topic: null, needsYou: null, stop: false, autoDraft: true, points: [], question: null, allowPrice: false, label: null, ...p };
}
const flag = (reason: NeedsYouReason) => ({ reason, label: NEEDS_YOU_LABELS[reason] });

export function pickMove(i: MoveInput): MovePlan {
  const { latest, prevOurs, idx } = latestPair(i.thread);
  const e = i.evidence;
  const autoFlags = autoReplyFlags(i.thread);
  /* An auto-responder's "Are you interested in …?" is never their yes. */
  const theirs = i.thread.filter((m, k) => m.from === 'them' && !autoFlags[k]);
  const clearYesEarlier = theirs.some((m) => CLEAR_YES.test(norm(m.text)) && !NEGATED.test(norm(m.text)));
  const offeredVoice = i.thread.some((m) => m.from === 'us' && VOICE_REQUEST.test(m.text));
  const asked = pitchAsked(prevOurs);
  const lastIsOurs = idx >= 0 && idx < i.thread.length - 1 && i.thread.slice(idx + 1).some((m) => m.from === 'us');

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
    const start = burstStart(i.thread, idx);
    let prevTheirs = -1;
    for (let j = start - 1; j >= 0; j--) if (i.thread[j].from === 'them') { prevTheirs = j; break; }
    const repeat = prevTheirs >= 0 && autoFlags[prevTheirs];
    /* ⛔ THEY HAVE NOT REALLY CONFIRMED WHO THEY ARE (Paul, 2026-10-20, Ven): an auto-reply to the opener, with nothing real
       from them before it, gets the usual FIRST-REPLY PITCH as its draft, never a generic line. Still labelled Auto-reply
       (not a real reply, never counted as Replied). A repeat or a loop guard keeps the old rule: nothing drafted. */
    let prevUs: MoveThreadMsg | null = null;
    for (let j = start - 1; j >= 0; j--) if (i.thread[j].from === 'us') { prevUs = i.thread[j]; break; }
    const realBefore = i.thread.slice(0, start).some((m, k) => m.from === 'them' && !autoFlags[k]);
    if (!repeat && !guard && !realBefore && prevUs && wasOpener(prevUs)) {
      const pitch = firstReplyPitch(e);
      return plan({ move: 'auto_reply', read: 'automated', label: 'Auto-reply',
        points: pitch.lines.map((l) => `Use this line, word for word: "${l}"`), question: pitch.question, fixedText: pitchText(pitch), closer: pitch.closer });
    }
    return plan({ move: 'auto_reply', read: 'automated', autoDraft: false, label: 'Auto-reply', needsYou: repeat ? flag('repeat_auto_reply') : null,
      points: ['Say: "No rush, speak soon." Do not mention their automatic reply. No pitch.'] });
  }

  /* A loop guard wins the reason: it is why nothing should be drafted on its own. */
  const g = (p: MovePlan): MovePlan => (guard ? { ...p, autoDraft: false, needsYou: flag(guard) } : p);

  /* 4. Hand to Paul, with a holding draft. */
  if (t.category === 'escalation') return g(plan({ move: 'escalate', read: 'legal', autoDraft: false, needsYou: flag('legal'), points: ['Say sorry for any trouble and that you will not message again unless they want you to.'] }));
  if (t.category === 'complaint') return g(plan({ move: 'escalate', read: 'complaint', autoDraft: false, needsYou: flag('complaint'), points: ['Say sorry, no excuses, no pitch.'] }));
  if (t.category === 'payment_issue' && questionTopic(text) !== 'guarantee' && questionTopic(text) !== 'cancel') return g(plan({ move: 'escalate', read: 'payment', autoDraft: false, needsYou: flag('payment'), points: ['Say thanks, you will look into it and come back to them today.'] }));
  if (PRIVACY.test(text)) return g(plan({ move: 'privacy', read: 'privacy', autoDraft: false, needsYou: flag('privacy'),
    points: [e.foundOnGoogle ? 'Say you found the business and number on its Google listing.' : 'Say you found the business online.', 'Say sorry if it is not a good time and you will leave them be if they would rather.'] }));
  /* 4b. Their answer to a pitch step. After the closer: the agency question + voice note offer (or "a website I've missed?"),
     word for word. After that: the voice note. A clear no, a link, a question about the offer or a wrong number keeps its
     own rule below. */
  if (asked && !LINK.test(text) && !CLEAR_NO.test(text) && !NEGATED.test(text) && !questionTopic(text) && t.category !== 'wrong_person') {
    if (asked === 'emotional' || asked === 'emotional_no_site') {
      if (!BARE_NO.test(text) && t.category !== 'not_interested' && t.category !== 'already_sorted') {
        const site = asked === 'emotional_no_site' || noSiteOf(e);
        const q = site ? PITCH_SITE_Q : PITCH_AGENCY_VOICE;
        return g(plan({ move: 'pitch_next', read: 'answered_closer', points: [`Use this line, word for word: "${q}"`], question: q, fixedText: q, closer: site ? 'site' : 'agency' }));
      }
    } else if (asked === 'site' && BARE_YES.test(text)) {
      return g(plan({ move: 'site_followup', read: 'has_website', points: ['Thank them.'], question: "What's the web address so I can take a look?" }));
    } else if (asked === 'site' && NO_SITE_ANSWER.test(text)) {
      return g(plan({ move: 'offer_voice_note', read: 'answered_pitch', points: ['No worries, thank them.'], question: offeredVoice ? CALL_Q : PITCH_VOICE_Q }));
    } else if (asked === 'agency' && (SITE_ANSWER.test(text) || BARE_YES.test(text) || BARE_NO.test(text))) {
      /* Ask before sending the voice note, never assume (Paul, 2026-10-20). Running it themselves: his words exactly. */
      if (SELF_MANAGED.test(text)) {
        return g(plan({ move: 'offer_voice_note', read: 'answered_agency_self', points: [`Use this line, word for word: "${PITCH_SELF_MANAGED_REPLY}"`], question: PITCH_VOICE_Q, fixedText: PITCH_SELF_MANAGED_REPLY }));
      }
      return g(plan({ move: 'offer_voice_note', read: 'answered_agency',
        points: ['Thank them for letting you know, in a few words, using their own word for whoever looks after the site. Do not offer a new website and do not ask about the website again.'],
        question: PITCH_VOICE_Q }));
    }
  }
  if (t.category === 'wrong_person') return g(plan({ move: 'close_politely', read: 'wrong_person', autoDraft: false, needsYou: flag('wrong_person'), points: ['Say sorry, your mistake, and you will not message again.'] }));
  if (t.category === 'not_interested' || (t.category === 'already_sorted' && !PROVIDER.test(text) && !RANKS.test(text))) {
    return g(plan({ move: 'close_politely', read: 'not_interested', autoDraft: false, needsYou: flag('not_interested'), points: ['No worries, thank them for their time. No pitch, no question.'] }));
  }
  if (latest.messageType && !['text', 'button', 'interactive'].includes(latest.messageType) && (!text || /^\[[a-z_]+\]$/i.test(text))) {
    return g(plan({ move: 'media', read: 'media', autoDraft: false, needsYou: flag('media'),
      points: ['Say sorry, you cannot play voice notes or open files on here.'], question: 'Can you type it, or shall I give you a quick call?' }));
  }
  if (LINK.test(text)) return g(plan({ move: 'link', read: 'link', autoDraft: false, needsYou: flag('link'), points: ['Thank them and say you will take a look.'] }));
  if (MALAY.test(text) && !ENGLISH_HINT.test(text)) {
    return g(plan({ move: 'other_language', read: 'other_language', autoDraft: false, needsYou: flag('other_language'), points: ['In English: say sorry, you only speak English.'], question: 'Is it ok to carry on in English?' }));
  }

  /* 5. Things code can answer. */
  if (BOT.test(text)) {
    /* ⛔ "I read and send every one myself" only while the AI auto-reply switch is OFF (Paul, 2026-10-20). */
    const answer = e.aiAutoReplies === true ? BOT_ANSWER_SWITCH_ON : BOT_ANSWER_SWITCH_OFF;
    return g(plan({ move: 'is_bot', read: 'is_bot', points: [`Use this line, word for word: "${answer}"`, 'Never say you are not using AI.'], question: offeredVoice ? null : VOICE_Q }));
  }
  if (VOICE_REQUEST.test(text) && !/\b(can'?t|cannot)\b/i.test(text)) {
    return g(plan({ move: 'offer_voice_note', read: 'asked_voice_note', points: ['Say yes, you will record them a short voice note. Never say when it will come: no "now", "shortly" or "today".'], question: null, allowPrice: clearYesEarlier }));
  }
  const topic = questionTopic(text);
  if (t.category === 'call_request' || t.category === 'booking' || (/\b(call|ring|phone)\b/i.test(text) && NAMED_TIME.test(text) && !topicOf(text))) {
    const timeNamed = NAMED_TIME.test(text);
    return g(plan({ move: 'set_call', read: t.category, allowPrice: clearYesEarlier,
      points: timeNamed ? ['Confirm you will call them at the time they said, using their words for the time.'] : ['Say happy to have a quick call.'],
      question: timeNamed ? null : CALL_Q }));
  }
  if (topic) {
    const fact = factFor(topic);
    if (!fact) return g(plan({ move: 'unknown_question', read: `question:${topic}`, autoDraft: false, needsYou: flag('question_not_on_sheet'), points: ["Say it's a good question and you'd rather explain it properly."], question: VOICE_Q }));
    const priceFamily = topic === 'price' || topic === 'term' || topic === 'monthly_start' || topic === 'cancel' || topic === 'after_term' || topic === 'guarantee';
    /* THE CONFIDENCE LINE (Paul, 2026-10-20): a price question, "does it work" / the guarantee, "what's the catch".
       The guarantee answer IS the line plus the refund (never said twice). */
    const confidence = topic === 'price' || topic === 'guarantee' || topic === 'what_we_do';
    const say = topic === 'guarantee' ? `${CONFIDENCE_LINE} ${GUARANTEE_REFUND}` : fact.say;
    return g(plan({ move: 'answer_fact', read: `question:${topic}`, topic, allowPrice: priceFamily || clearYesEarlier,
      needsYou: fact.paulLooks ? flag('paul_looks') : null, autoDraft: !fact.paulLooks, confidence,
      points: [`Use this answer, word for word: "${say}"`, ...(confidence && topic !== 'guarantee' ? [`Then this line, word for word: "${CONFIDENCE_LINE}"`] : [])], question: offeredVoice ? 'Want me to give you a quick call to explain the rest?' : VOICE_Q }));
  }
  if (PROVIDER.test(text)) {
    return g(plan({ move: 'objection_provider', read: 'provider', points: ['Say no problem, whoever looks after their site now can carry on doing it (use their own word for that person, e.g. "him" or "your nephew"). Do not offer a new website.'], question: offeredVoice ? 'Would a quick 2 minute call be ok so I can show you what I found?' : 'Want me to send you a quick voice note showing what I found?' }));
  }
  if (RANKS.test(text)) {
    const line = auditLine(e);
    return g(plan({ move: 'objection_rank', read: 'already_ranks', points: ['Agree with what is true: fair enough, that is good.', ...(line ? [line] : [])], question: offeredVoice ? 'Worth a quick 2 minute call so I can show you?' : 'Want me to send you a quick voice note showing what I found?' }));
  }
  if (t.category === 'interested' || CLEAR_YES.test(text)) {
    return g(plan({ move: 'offer_voice_note', read: 'interested', allowPrice: true, points: ['Great, thank them. Do not pitch again.'], question: 'Shall I send you a quick voice note explaining how it works, or would you rather a quick call?' }));
  }
  if (LAUGH_ONLY.test(text)) return g(plan({ move: 'unsure', read: 'laughing', autoDraft: false, needsYou: flag('unsure'), points: ['Keep it light and short, no pitch.'], question: null }));
  const whoOnly = WHO_ONLY.test(text);
  if (whoOnly || t.category === 'confirmed_contact' || /^\W*(yes|yeah|yep|yh|ye|ya)\W*$/i.test(text)) {
    /* A bare confirmation to the opener: THE FULL PITCH, code-built word for word (Paul, 2026-10-20). */
    if (!whoOnly && wasOpener(prevOurs)) {
      const pitch = firstReplyPitch(e);
      return g(plan({ move: 'first_reply_pitch', read: 'confirmed', label: 'Only confirmed',
        points: pitch.lines.map((l) => `Use this line, word for word: "${l}"`), question: pitch.question, fixedText: pitchText(pitch), closer: pitch.closer }));
    }
    if (whoOnly) {
      const line = auditLine(e);
      const points = ["Say who you are: Paul from Findable. You help local businesses show up when people ask AI tools for their trade in their area."];
      if (line) points.push(line);
      /* No audit line: at most ONE real crawl finding, in the crawl's own words, hedged. Nothing when the crawl is empty. */
      else if (e.hasWebsite && e.findings[0]) points.push(`One thing I saw on your website: ${e.findings[0].said.replace(/\s+/g, ' ').trim().replace(/\.?$/, '.')} That could be making it harder for AI to put you forward.`);
      /* "Who is this?": who we are, then the confidence line (Paul, 2026-10-20). */
      points.push(`Then this line, word for word: "${CONFIDENCE_LINE}"`);
      return g(plan({ move: 'intro_hook', read: 'confirmed', label: 'Only confirmed', confidence: true, points, question: offeredVoice ? 'Happy to explain it here or on a quick call, which suits?' : VOICE_Q }));
    }
    // A bare yes to our offer of a voice note / call / explanation: a yes to THAT, never a sign-up or a price.
    return g(plan({ move: 'offer_voice_note', read: 'yes_to_offer', points: ['Great, thank them. Say you will record them a quick voice note. Never say when it will come: no "now", "shortly" or "today".'], question: null }));
  }
  if (t.category === 'acknowledgement' || t.category === 'irrelevant') {
    return g(plan({ move: 'ack', read: 'ack', autoDraft: false, points: ['One short friendly line.'], question: offeredVoice ? null : VOICE_Q }));
  }
  if (t.category === 'question') {
    return g(plan({ move: 'unknown_question', read: 'question', autoDraft: false, needsYou: flag('question_not_on_sheet'), points: ["Say it's a good question and you'd rather explain it properly."], question: VOICE_Q }));
  }
  return g(plan({ move: 'unsure', read: 'unclear', autoDraft: false, needsYou: flag('unsure'), confidence: true,
    points: ['Answer briefly and warmly, no pitch. Do not explain why anything happened and give no reason or claim of your own.', `Then this line, word for word: "${CONFIDENCE_LINE}"`], question: VOICE_Q }));
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
