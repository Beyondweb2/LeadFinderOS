/* ════════════════════════════════════════════════════════════════════════════════════════════════
   AI REPLY DRAFTS — the rules (2026-10-11, Paul; reworked 2026-10-20). WhatsApp only. NOTHING AUTO-SENDS.

   fn `ai-reply-drafts` (cron, every minute) writes ONE row per new inbound message into `ai_reply_drafts`:
     · needs_you      — a flag with a reason (replyMove.ts NEEDS_YOU_LABELS): a stop, an angry reply, a question the fact
                        sheet does not answer, an unsure reply, a loop guard … It may carry a draft once someone presses
                        "Draft reply" (a stop never does).
     · draft          — a suggested next message ("Needs approving"). Written by the worker only while the switch
                        "AI handles replies" is on; otherwise only when a person presses "Draft reply".
     · needs_template — the 24-hour window is closed, so no free text is possible
     · skipped        — nothing to flag (an auto-responder, an emoji, a client, not our outreach, or a draftable reply
                        while the switch is off — "Draft reply" writes it on demand)
   The flags are written whatever the switch says (rules only, no model call, no spend). The switch only decides whether
   the worker also spends on a draft.

   ⛔ NOTHING HERE SENDS. A draft leaves only when a person presses "Approve & send" (claim once → the Inbox's own send).
   ⛔ CODE PICKS THE MOVE (replyMove.ts pickMove), THE MODEL ONLY PHRASES IT, from the fact sheet (offerFactSheet.ts) and
      the stored audit, crawl and chat. Capitals are fixed in code (tidyCaps). The checker WARNS, it never blocks.
   ⛔ ONE ROW PER INBOUND (a unique index on inbound_message_id) and ONE OPEN ROW PER CONVERSATION.

   Pure and edge-reachable: relative imports with .ts, no Deno, no DOM.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { usesDash } from './warmReply.ts';
import { salesStyleProblems, SALES_STYLE_RULES } from './salesStyle.ts';
import { serviceWindowState } from './serviceWindow.ts';
import { isClientLead } from './roleRules.ts';
import { issueMentioned, saysGoogleAiForGemini, vagueSiteClaim, wrongEngineWords } from './draftEvidence.ts';
import { ENGINE_WORDING, FACT_SHEET_VERSION, GUARANTEE_LINE, SHEET_MONEY, factFor, usableCaseStudies } from './offerFactSheet.ts';
import { mayClaimNamedInstead } from './namedShareRule.ts';
import { engineName, siteOf, tidyCaps, NEEDS_YOU_LABELS, PITCH_NO_SITE_LINE, type MoveEvidence, type MovePlan, type NeedsYouReason } from './replyMove.ts';

/* ── cost ─────────────────────────────────────────────────────────────────────────────────────── */

export const AI_REPLY_MODEL = 'gpt-4o-mini';
/** gpt-4o-mini, USD per 1M tokens — the rate _shared/openai-usage.ts bills by (CLAUDE.md §4: verified). */
export const AI_REPLY_USD_PER_M_INPUT = 0.15;
export const AI_REPLY_USD_PER_M_OUTPUT = 0.60;
/** The most one draft may cost, every model call included (a retry, a Regenerate is its own draft budget). */
export const AI_REPLY_DRAFT_MAX_USD = 0.005;
/** The model's answer is capped at this many tokens (a WhatsApp reply is ~60). */
export const AI_REPLY_MAX_OUTPUT_TOKENS = 300;
/** The prompt is cut to this many characters before it is sent (~4 chars per token). */
export const AI_REPLY_MAX_PROMPT_CHARS = 12_000;
/** A person may ask for another version of one draft at most this many times. */
export const AI_REPLY_MAX_REGENERATIONS = 5;
/** Wait this long after an inbound before drafting, so a burst of three messages gets one draft. */
export const AI_REPLY_SETTLE_MS = 30_000;

/** The models the ADMIN dry run may compare (fixtures only). ⚠️ The non-mini rates are list prices used only to cap a test
 *  run; no billed row has confirmed them (CLAUDE.md §4). Production drafts use AI_REPLY_MODEL. */
export const DRY_RUN_MODELS: Record<string, { in: number; out: number }> = {
  'gpt-4o-mini': { in: 0.15, out: 0.60 },
  'gpt-4.1-mini': { in: 0.40, out: 1.60 },
  'gpt-4.1': { in: 2.00, out: 8.00 },
  'gpt-4o': { in: 2.50, out: 10.00 },
};
/** A dry run's cap per draft (a stronger model costs more; still tiny). */
export const DRY_RUN_DRAFT_MAX_USD = 0.05;

/** The worst case a call can cost, BEFORE it is made: every prompt character a token, the full output. */
export function worstCaseCallUsd(promptChars: number, maxOutputTokens: number = AI_REPLY_MAX_OUTPUT_TOKENS, model: string = AI_REPLY_MODEL): number {
  const r = DRY_RUN_MODELS[model] ?? { in: AI_REPLY_USD_PER_M_INPUT, out: AI_REPLY_USD_PER_M_OUTPUT };
  return (promptChars / 1e6) * r.in + (maxOutputTokens / 1e6) * r.out;
}
/** What a finished call cost, from its token counts. */
export function callUsd(promptTokens: number, completionTokens: number, model: string = AI_REPLY_MODEL): number {
  const r = DRY_RUN_MODELS[model] ?? { in: AI_REPLY_USD_PER_M_INPUT, out: AI_REPLY_USD_PER_M_OUTPUT };
  return Number(((promptTokens / 1e6) * r.in + (completionTokens / 1e6) * r.out).toFixed(6));
}
/** May another call be made inside the per-draft cap, given what this draft has already spent? */
export function mayCallWithin(spentUsd: number, promptChars: number, capUsd: number = AI_REPLY_DRAFT_MAX_USD, model: string = AI_REPLY_MODEL): boolean {
  return spentUsd + worstCaseCallUsd(promptChars, AI_REPLY_MAX_OUTPUT_TOKENS, model) <= capUsd;
}

/* ── what to do with one inbound message ──────────────────────────────────────────────────────── */

export type AiReplyKind = 'draft' | 'needs_you' | 'needs_template' | 'skipped';
export type AiReplyStatus = 'generating' | 'pending' | 'sending' | 'sent' | 'discarded' | 'superseded' | 'resolved' | 'failed';
/** The statuses that still want a person: shown in the Inbox. */
export const AI_REPLY_OPEN_STATUSES: readonly AiReplyStatus[] = ['generating', 'pending', 'sending'];

export type SkipReason = 'off' | 'no_lead' | 'client' | 'not_outreach' | 'automated' | 'acknowledgement' | 'archived' | 'awaiting_person';
/** Kept for older rows and the panel: the hand-over labels are replyMove's. */
export const HANDOVER_LABELS: Record<NeedsYouReason, string> = NEEDS_YOU_LABELS;

export interface AiReplyDecisionInput {
  /** The newest inbound message (only its time is read here; replyMove reads the words). */
  inboundAt: string;
  lead: { amount_paid?: unknown; status?: unknown; is_archived?: unknown } | null;
  /** We sent them a real WhatsApp message before this reply: it is a reply to OUR outreach. */
  hadOutreach: boolean;
  /** pickMove's answer for this conversation. */
  plan: MovePlan;
  nowMs?: number;
}
export type AiReplyDecision =
  | { kind: 'draft' }
  | { kind: 'needs_template' }
  | { kind: 'needs_you'; reason: NeedsYouReason; label: string; stop: boolean }
  | { kind: 'skipped'; reason: SkipReason };

/**
 * The one rule. Order matters and is the point:
 *   no lead / client / archived / not our outreach → nothing (prospect automation only)
 *   → a stop / Do Not Contact / anything pickMove flags → Needs you (a stop wins over the window: it is acted on regardless)
 *   → an auto-responder or a bare "ok" → nothing · window closed → needs a template · else draftable.
 * ⛔ POSITIVE: draftable only when every flag test failed AND the window is open.
 */
export function aiReplyDecision(i: AiReplyDecisionInput): AiReplyDecision {
  if (!i.lead) return { kind: 'skipped', reason: 'no_lead' };
  if (isClientLead(i.lead)) return { kind: 'skipped', reason: 'client' };
  if (i.lead.is_archived === true) return { kind: 'skipped', reason: 'archived' };
  if (i.hadOutreach !== true) return { kind: 'skipped', reason: 'not_outreach' };
  const p = i.plan;
  if (p.stop && p.needsYou) return { kind: 'needs_you', reason: p.needsYou.reason, label: p.needsYou.label, stop: true };
  /* An auto-reply (even a repeated one) is never answered and never flagged: nothing for a person to do. */
  if (p.move === 'auto_reply') return { kind: 'skipped', reason: 'automated' };
  if (p.needsYou) return { kind: 'needs_you', reason: p.needsYou.reason, label: p.needsYou.label, stop: false };
  if (p.move === 'ack') return { kind: 'skipped', reason: 'acknowledgement' };
  if (!serviceWindowState(i.inboundAt, i.nowMs ?? Date.now()).open) return { kind: 'needs_template' };
  return { kind: 'draft' };
}

/* ── the Inbox's view of one conversation ─────────────────────────────────────────────────────── */

export interface AiReplyRow {
  id: string;
  phone: string;
  lead_id: string | null;
  kind: AiReplyKind;
  status: AiReplyStatus;
  inbound_at: string;
  reason?: string | null;
  reason_label?: string | null;
  draft_text?: string | null;
  why?: AiReplyWhy | null;
  error?: string | null;
  regenerations?: number | null;
}
export type AiChip = { label: 'Needs approving' | 'Needs you' | 'Needs a template' | 'Sending…' | 'Drafting…'; tone: 'violet' | 'red' | 'amber' | 'grey' };

/** What the conversation shows, or null when there is nothing open. A Needs you flag stays a flag whatever the window
 *  (it is about the person, not the clock); a pending DRAFT whose window has closed reads "Needs a template". */
export function aiChipFor(row: AiReplyRow | null | undefined, nowMs: number = Date.now()): AiChip | null {
  if (!row || !(AI_REPLY_OPEN_STATUSES as readonly string[]).includes(row.status)) return null;
  if (row.kind === 'skipped') return null;
  if (row.status === 'generating') return { label: 'Drafting…', tone: 'grey' };
  if (row.status === 'sending') return { label: 'Sending…', tone: 'grey' };
  if (row.kind === 'needs_you') return { label: 'Needs you', tone: 'red' };
  if (row.kind === 'needs_template' || !serviceWindowState(row.inbound_at, nowMs).open) return { label: 'Needs a template', tone: 'amber' };
  return { label: 'Needs approving', tone: 'violet' };
}
export const needsApproving = (row: AiReplyRow | null | undefined, nowMs: number = Date.now()) => aiChipFor(row, nowMs)?.label === 'Needs approving';
export const needsYou = (row: AiReplyRow | null | undefined, nowMs: number = Date.now()) => aiChipFor(row, nowMs)?.label === 'Needs you';
/** A row that can be approved and sent: a written draft, pending, in the window, and never a stop. */
export function rowSendable(row: AiReplyRow | null | undefined, nowMs: number = Date.now()): boolean {
  if (!row || row.status !== 'pending' || !row.draft_text?.trim()) return false;
  if (row.kind !== 'draft' && row.kind !== 'needs_you') return false;
  if (row.why?.stop === true) return false;
  return serviceWindowState(row.inbound_at, nowMs).open;
}
/** The stop reasons: no draft, the one-tap Mark opted out instead. */
export const STOP_REASONS: ReadonlySet<string> = new Set(['opt_out', 'angry', 'do_not_contact']);

/* ── the draft ────────────────────────────────────────────────────────────────────────────────── */

export interface AiReplyContext {
  businessName: string;
  latestInbound: string;
  /** Oldest first, ours and theirs, already readable (templates as their body). */
  thread: Array<{ from: 'us' | 'them'; text: string }>;
  plan: MovePlan;
  evidence: MoveEvidence;
  /** The lead row's contact first name — used ONLY to warn when a draft greets by a name the site does not state. */
  contactFirstName?: string | null;
}

export interface AiReplyWhy {
  move: string;
  read: string;
  points: string[];
  question: string | null;
  needsYou: { reason: string; label: string } | null;
  stop?: boolean;
  optedOut?: 'recorded' | 'already' | 'failed' | null;
  label?: string | null;
  search: string | null;
  competitors: string[];
  named: { named: number; valid: number } | null;
  engineWords?: string | null;
  hookAlreadySent: boolean;
  findings: string[];
  findingsNote: string | null;
  factSheetVersion: string;
  /** The checker's WARNINGS (it never blocks). */
  problems: string[];
  usedFallback: boolean;
  model?: string;
  costUsd: number;
  calls: number;
  styleSource: string;
  /** How the message ends ('emotional' closer, 'agency' / 'site' next step, 'question', or null) and the confidence line used. */
  closer?: string | null;
  confidence?: string | null;
  /** The website issues the draft could name, each with its stored pages (evidence). */
  siteIssues?: Array<{ title: string; pages: string[] }> | null;
  /** The AI auto-reply switch when the draft was written (the bot answer follows it). */
  aiAutoReplies?: boolean;
}

/** Paul's own hand-typed messages (inbox analysis 2026-10-19, names removed). The FEEL to copy, not the spelling. */
export const PAUL_EXAMPLES: readonly string[] = [
  'What time is best to call tomorrow?',
  'Okay mate ill call you around then on my personal number',
  'Fair enough. Out of interest, what did they actually type in?',
  'No worries, thanks for your time',
  'Sure mate no problem, i will get back in touch with you in 2 weeks time',
  'Im happy to jump on a call with you if youd prefer?',
  "No worries mate, enjoy the wedding 👍 I'll drop you a message another time.",
  'I see you started the onboarding mate, can i answer any questions?',
  'I can be in 10 mins if thats okay with you?',
];
export const BEST_TEMPLATE_STYLE_NOTE = "Paul's own hand-typed messages (median 52 characters), inbox analysis 2026-10-19";

export const AI_REPLY_SYSTEM_PROMPT = `You write the NEXT WhatsApp message from Paul at Findable to a UK local business owner who has just replied. Paul helps local businesses show up when people ask AI tools for their trade in their area. A person reads, edits and approves every message before it is sent. Return ONLY the return_reply tool.

YOUR ONLY JOB IS WORDING. The decision is already made. You are given POINTS (what to say, in order) and a QUESTION (how to end). Say the points in Paul's voice, then the question. Add nothing else.

RULES:
- At most 3 short lines. Usually 1 or 2. Paul's typical message is about 50 characters.
- At most ONE question mark, and only the QUESTION given. If no question is given, ask none.
- Answer what they said first, in a few words, if the points do not already do it.
- Use only the facts in POINTS. Never add a competitor, a number, a price, a website issue, a name, a promise or a compliment that is not there.
- When a point says "word for word", copy that sentence exactly.
- No links. No sign-up talk. No price unless a point gives it.
- No guarantee, ranking, "first page" or "recommend you" promises. Never say how an AI decides or that something caused a result.
- Casual and kind, like a tradesperson texting: "mate" is fine sometimes, "no worries" is fine. No headings, lists, bold, dashes or exclamation marks. No sign off.
- If asked whether you are a bot or AI, never deny it.
- Never mention past results, other clients or success stories.
- Never say when something will be sent or done (no "now", "shortly", "today"). Never say "100%" or "if I fail".

${SALES_STYLE_RULES}

PAUL'S REAL MESSAGES (match this feel and length; do not copy them or their spelling mistakes):
${PAUL_EXAMPLES.map((e) => `- "${e}"`).join('\n')}`;

export const AI_REPLY_TOOL = {
  type: 'function',
  function: {
    name: 'return_reply',
    description: 'The draft WhatsApp reply.',
    parameters: { type: 'object', properties: { reply: { type: 'string' } }, required: ['reply'] },
  },
} as const;

export function buildAiReplyPrompt(c: AiReplyContext): string {
  const lines: string[] = [];
  lines.push(`THEIR LATEST MESSAGE:\n"""${c.latestInbound.slice(0, 600)}"""`);
  lines.push(`BUSINESS: ${c.businessName}`);
  lines.push(`POINTS (say these, in this order, nothing else):\n${c.plan.points.map((p, i) => `${i + 1}. ${p}`).join('\n') || '1. One short friendly line.'}`);
  lines.push(c.plan.question ? `QUESTION (end with exactly this one question, in your words): ${c.plan.question}` : 'QUESTION: none. Do not ask anything.');
  if (c.evidence.ownerName) lines.push(`NAME: you may greet them as ${c.evidence.ownerName}.`);
  else lines.push('NAME: do not use a first name.');
  const thread = c.thread.slice(-8).map((m) => `${m.from === 'us' ? 'PAUL' : 'THEM'}: ${m.text.replace(/\s+/g, ' ').slice(0, 400)}`).join('\n');
  lines.push(`CONVERSATION SO FAR (oldest first, for context only; never repeat what Paul already said):\n${thread}`);
  const out = lines.join('\n\n');
  return out.length > AI_REPLY_MAX_PROMPT_CHARS ? out.slice(out.length - AI_REPLY_MAX_PROMPT_CHARS) : out;
}

/** What the draft becomes after the model: capitals fixed in code, spaces tidied. Templates never pass through here. */
export function finishDraft(text: string, names: readonly (string | null | undefined)[] = []): string {
  let s = tidyCaps(String(text ?? '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim());
  /* A town, business or rival the evidence spells is written the evidence's way ("leeds" → "Leeds"). Whole words only. */
  for (const n of names) {
    const name = String(n ?? '').trim();
    if (name.length < 3) continue;
    s = s.replace(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), name);
  }
  return s;
}
/** The names finishDraft spells the evidence's way. */
export const evidenceNames = (e: MoveEvidence): string[] => [e.town, e.businessName, ...e.competitors].filter((x): x is string => !!x);

/* ── the checker: WARNINGS only ───────────────────────────────────────────────────────────────── */

const LINK = /https?:\/\/|www\.|\b[a-z0-9-]+\.(?:co\.uk|com|live|uk|net|org)\b/i;
const MONEY = /£\s?\d[\d,]*(?:\.\d+)?/g;
const PRICE_WORDS = /£|\bper month\b|\ba month\b|\bmonthly\b|\bprice\b|\bcosts?\b/i;
const RANKING = /\b(first\s+page|page\s+one|top\s+of\s+google|number\s+one|#\s?1\b|top\s+spot|rank(?:ing|ed)?\s+(?:you|first|top|higher)|get\s+you\s+(?:to|on)\s+(?:the\s+)?top|guaranteed?\s+(?:to|you|results|ranking|leads|customers)|recommend\s+you\s+every\s+time)\b/i;
const GUARANTEE_WORD = /\b(guarantee[sd]?|money\s+back|refund)\b/i;
const TERM_DRIFT = /\b(12|twelve)\s*[- ]?\s*months?\b|(?<!\bnot\s+a\s+)\bcancel\s+any\s*time\b|\bno\s+(contract|commitment|tie[- ]?in)\b|\bunlimited\b|\bmonthly\s+(audits?|reports?|improvements?)\b|\bevery\s+month\s+we\b/i;
const INSTEAD_CLAIM = /\b(instead|not\s+you|ahead\s+of\s+you|named\s+(?:other|others)|other\s+(?:businesses|firms|companies)\s+(?:came\s+up|were\s+named|got\s+named))\b/i;
const BOT_DENIAL = /\b(not\s+a\s+bot|i'?m\s+(?:a\s+)?(?:real|human)\b(?!.*\bai\b)|no(?:,)?\s+(?:it'?s\s+)?not\s+(?:a\s+)?bot|not\s+automated|this\s+is\s+not\s+ai|no\s+ai\b)/i;
const SITE_FAULT = /\b(broken|missing|slow|placeholder|headings?|h1|links?\s+(?:go|point)|sitemap|https|ssl|not\s+secure|blocked|crawl\w*|schema|not\s+mentioned|doesn'?t\s+mention|title\s+tags?|loads?\s+slowly|mobile\s+version|duplicate|near(?:ly)?\s+(?:the\s+)?same)\b/i;
const NAME_GREETING = /^\s*(?:[Hh]i|[Hh]ey|[Hh]ello|[Tt]hanks|[Cc]heers|[Mm]orning|[Aa]fternoon),?\s+([A-Z][a-z]{2,})\b/;
const PLACE_PHRASE = /\b(?:in|around|near|across)\s+([A-Z][a-z]+(?:[\s-][A-Z][a-z]+){0,2})/g;
const NAME_SEQ = /\b([A-Z][\w'&]*(?:\s+(?:&\s+)?[A-Z][\w'&]*)+)\b/g;
const COMMON_CAPS = new Set(['I', "I'm", "I'll", "I've", "I'd", 'AI', 'ChatGPT', 'Gemini', 'Google', 'Paul', 'Findable', 'Hi', 'Hey', 'Thanks', 'No', 'Yes', 'Sure', 'Okay', 'Ok', 'Great', 'Fair', 'Like', 'When', 'Shall', 'Want', 'What', 'Would', 'Happy', 'Sorry', 'Brilliant', 'Cheers', 'Business', 'Profile', 'Maps', 'WhatsApp', 'UK', 'The', 'It', 'If', 'That', 'Is', 'Can', 'Just', 'We', 'You', 'Your', 'My', 'Me', 'Morning', 'Afternoon', 'Worth', 'Good', 'Nice', 'Mate', 'And', 'So', 'Or', 'Not', 'All', 'English', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);

/** A promise of WHEN something comes ("I'll send it now", "recording it shortly"). Paul, 2026-10-20: never. */
const TIMING_PROMISE = /\b(send|sending|sent|record|recording|do|doing|get)\b[^.?!\n]{0,40}\b(now|right\s+away|straight\s+away|shortly|in\s+a\s+(minute|min|sec|second|moment|bit)|later\s+today|today|tonight|this\s+(morning|afternoon|evening)|in\s+\d+\s*(mins?|minutes|hours?))\b/i;
/** The first-reply pitch is code-built and may run to five lines (Paul, 2026-10-20). */
const lineCap = (p: MovePlan) => (p.move === 'first_reply_pitch' ? 5 : 3);
const charCap = (p: MovePlan) => (p.move === 'first_reply_pitch' ? 640 : p.confidence ? 480 : 320);
/** A claim about past results or other clients (Paul, 2026-10-20): only through an APPROVED case study (none today). */
const PAST_RESULTS = /\b(success(?:es|ful)?|(?<!\b(?:your|the)\s)results?|clients?\s+(?:loved|love|are\s+(?:happy|delighted))|case\s+stud(?:y|ies)|(?:other|our|happy|past)\s+(?:clients|customers)|we'?ve\s+helped|helped\s+(?:loads|lots|many|plenty|other))\b/i;
/** Never an absolute promise around the guarantee (Paul, 2026-10-20). */
const ABSOLUTE = /\b100\s?%|\bif\s+i\s+fail\b|\bhundred\s+per\s*cent\b/i;

const lower = (s: string | null | undefined) => String(s ?? '').toLowerCase();

/** The checks a draft is held to. Each is a WARNING shown to the person ("Check this draft"); nothing is blocked. */
export function checkAiReply(reply: string, c: AiReplyContext): string[] {
  const out: string[] = [];
  const r = reply.trim();
  if (!r) return ['Empty draft.'];
  const e = c.evidence; const p = c.plan;
  const lines = r.split('\n').filter((l) => l.trim());
  if (lines.length > lineCap(p)) out.push(`More than ${lineCap(p)} lines.`);
  if (r.length > charCap(p)) out.push(`Long for a reply (over ${charCap(p)} characters).`);
  if (TIMING_PROMISE.test(r) && p.move !== 'set_call') out.push('Promises when something will come ("now", "shortly"). Never promise timing.');
  if (/\bi\s+was\s+looking\s+for\b/i.test(r)) out.push('Says "I was looking for"; say "I asked".');
  const qs = (r.match(/\?/g) ?? []).length;
  if (qs > 1) out.push('Asks more than one question.');
  if (usesDash(r)) out.push('Uses a dash.');
  if (LINK.test(r)) out.push('Has a link. Never send the sign-up link from a draft.');
  if (/\bsign[\s-]?up\b|\bonboarding\s+link\b|\bagreement\s+link\b/i.test(r)) out.push('Talks about the sign-up link.');
  /* Money and terms must match the sheet, and only after a price question or a clear yes. */
  if (PRICE_WORDS.test(r) && !p.allowPrice) out.push('Mentions a price before they asked or said a clear yes.');
  for (const m of r.match(MONEY) ?? []) if (!SHEET_MONEY.includes(m.replace(/\s/g, '').replace(/\.00$/, ''))) out.push(`Names ${m}, which is not on the fact sheet.`);
  if (TERM_DRIFT.test(r)) out.push('A term or promise that is not on the fact sheet (12 months, cancel any time, unlimited, monthly audits).');
  if (RANKING.test(r)) out.push('Promises a ranking, first page or recommendation.');
  if (PAST_RESULTS.test(r) && !usableCaseStudies().length) out.push('Claims past results or other clients, but no case study is approved on the fact sheet.');
  if (ABSOLUTE.test(r)) out.push('Says "100%" or "if I fail". Use the guarantee line only.');
  if (GUARANTEE_WORD.test(r) && !lower(r).includes(lower(GUARANTEE_LINE)) && !r.includes(factFor('cancel')?.say ?? '\u0000')) {
    out.push(`Mentions the guarantee in words that are not the sheet's ("${GUARANTEE_LINE}").`);
  }
  /* Evidence. */
  if (INSTEAD_CLAIM.test(r) && !(e.named && mayClaimNamedInstead(e.named.named, e.named.valid))) {
    out.push('Says AI named others instead, but they were named in more than a third of answers (or no counts are on record).');
  }
  const allowedNames = [e.businessName, ...e.competitors, e.town ?? '', e.ownerName ?? ''].map(lower).filter(Boolean);
  for (const m of r.matchAll(NAME_SEQ)) {
    const words = m[1].split(/\s+/).filter((w) => w !== '&' && !COMMON_CAPS.has(w));
    if (words.length < 2) continue;
    const name = words.join(' ');
    if (!allowedNames.some((a) => a.includes(lower(name)) || lower(name).includes(a))) out.push(`Names "${name}", which is not in the audit.`);
  }
  for (const m of r.matchAll(PLACE_PHRASE)) {
    const place = m[1];
    if (COMMON_CAPS.has(place) || /^(ChatGPT|Gemini|Google|Findable)/.test(place)) continue;
    if (!e.town || !lower(e.town).includes(lower(place)) && !lower(place).includes(lower(e.town))) out.push(`Mentions ${place}, which is not the audit's town${e.town ? ` (${e.town})` : ''}.`);
  }
  if (SITE_FAULT.test(r) || vagueSiteClaim(r)) {
    /* The crawl's findings, or the website check's own serious-issue titles quoted as they are (the pitch). */
    const backed = (e.findings.length > 0 && e.findings.some((f) => issueMentioned(r, f)))
      || siteOf(e).issues.some((t) => lower(r).includes(lower(t)));
    if (!backed) out.push('Talks about a website issue the stored crawl does not record.');
  }
  const greet = r.match(NAME_GREETING)?.[1] ?? null;
  const contact = (c.contactFirstName ?? '').trim();
  if (greet && greet !== e.ownerName) out.push(`Calls them "${greet}", but the site does not state that name as the owner or founder.`);
  else if (contact && contact.length >= 3 && new RegExp(`\\b${contact.replace(/[^A-Za-z]/g, '')}\\b`, 'i').test(r) && contact !== e.ownerName) {
    out.push(`Uses the name "${contact}", which the site does not state as the owner or founder.`);
  }
  if (BOT_DENIAL.test(r)) out.push('Denies being AI-assisted. Never deny it.');
  /* ⛔ With the AI auto-reply switch ON, replies may be automated: never claim a person sends every one (Paul, 2026-10-20). */
  if (e.aiAutoReplies === true && /\b(send|read|write|check)\w*\s+(?:and\s+\w+\s+)?every\s+(?:one|message|reply)\b|\bevery\s+(?:one|message|reply)\s+(?:is\s+)?(?:sent|read|written)\s+by\s+me\b/i.test(r)) {
    out.push('Says you send every message yourself, but AI auto-replies are switched on. Say replies may be automated.');
  }
  /* The sheet's engine wording and Paul's no-website line name the tools on purpose: read around them. */
  const forEngine = r.split(ENGINE_WORDING).join(' ').split(PITCH_NO_SITE_LINE).join(' ');
  if (e.engineWords && wrongEngineWords(forEngine, e.engineWords)) out.push(`Names a different AI tool from the one this conversation uses (${engineName(e.engineWords)}).`);
  if (saysGoogleAiForGemini(r.split(PITCH_NO_SITE_LINE).join(' '))) out.push('Says "Google AI"; say "Gemini".');
  if (p.question === null && qs > 0) out.push('Asks a question where none was planned.');
  out.push(...salesStyleProblems(r, [...e.competitors, e.businessName]));
  return [...new Set(out)];
}

/** The rule-built draft when the model is unavailable or over budget: the points, then the question. Built only from facts. */
export function fallbackAiReply(c: AiReplyContext): string {
  const strip = (s: string) => {
    const quoted = s.match(/word for word: "([\s\S]+)"$/);
    if (quoted) return quoted[1];
    return s.replace(/^(Say|Agree with what is true:|Confirm|Thank them and say|In English: say|Be honest:)\s*/i, '');
  };
  if (c.plan.fixedText) return finishDraft(c.plan.fixedText, evidenceNames(c.evidence));
  if (c.plan.move === 'auto_reply') return finishDraft('No rush, speak soon.');
  const parts: string[] = [];
  for (const pt of c.plan.points) {
    if (/^(Say who you are|One short friendly line|Answer briefly|No worries|Great|They have not replied|That was their automatic reply|Confirm you will call)/i.test(pt)) {
      parts.push(pt.startsWith('Say who you are') ? "It's Paul from Findable, I help local businesses show up when people ask AI for their trade."
        : pt.startsWith('No worries') ? 'No worries, thanks for your time.'
        : pt.startsWith('Great') ? 'Great stuff.'
        : pt.startsWith('Confirm you will call') ? "Perfect, I'll call you then."
        : pt.startsWith('That was their automatic reply') ? 'No rush, speak soon.'
        : '');
      continue;
    }
    if (/^(When I asked|Like I said|One thing I saw)/.test(pt) || /word for word/.test(pt)) { parts.push(strip(pt)); continue; }
    if (c.plan.move === 'is_bot') continue; // its answer is the word-for-word point above (it follows the AI switch)
    if (c.plan.move === 'objection_provider') { parts.push('No problem, they can carry on looking after it.'); continue; }
    if (c.plan.move === 'close_politely') { parts.push('Sorry about that, I won\'t message again.'); continue; }
    if (c.plan.move === 'media') { parts.push("Sorry, I can't play voice notes or open files on here."); continue; }
    if (c.plan.move === 'privacy') { parts.push(c.evidence.foundOnGoogle ? 'I found your business and number on your Google listing.' : 'I found your business online.'); continue; }
  }
  const text = [...new Set(parts.filter(Boolean))].slice(0, 2).join(' ');
  return finishDraft([text, c.plan.question ?? ''].filter(Boolean).join('\n'));
}

export { FACT_SHEET_VERSION };
