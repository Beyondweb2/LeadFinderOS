/* ════════════════════════════════════════════════════════════════════════════════════════════════
   AI HANDLES REPLIES — the rules (2026-10-11, Paul). WhatsApp only, APPROVE-TO-SEND only.

   When the switch is on and a prospect replies on WhatsApp to our outreach, fn `ai-reply-drafts`
   (cron, every minute) writes ONE row per inbound message into `ai_reply_drafts`:
     · draft          — a suggested next message, pre-filled in the Inbox reply box ("Needs approving")
     · needs_you      — a hand-over: stop / not interested / a call or price / angry / legal /
                        Do Not Contact / a photo or voice note / the draft could not be written
     · needs_template — the 24-hour window is closed, so no free text is possible
     · skipped        — nothing to answer (an auto-responder, an emoji, a client, not our outreach)

   ⛔ NOTHING HERE SENDS. A draft leaves only when a person presses "Approve & send", which claims the
      row (pending → sending, one winner) and then sends through the Inbox's own existing send path
      (send-whatsapp-message, unchanged). There is no auto-send in this feature.
   ⛔ ONE ROW PER INBOUND (a unique index on inbound_message_id) and ONE OPEN ROW PER CONVERSATION:
      a newer inbound supersedes the older pending draft.
   ⛔ NOTHING INVENTED: the AI part comes only from a completed audit (the search, the names it gave),
      the site part only from the crawl through the call script's own rule (coldCallPlaybook
      selectFindings — the 1–3 issues actually found). Absent → that part is left out, never guessed.

   Pure and edge-reachable: relative imports with .ts, no Deno, no DOM.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { triageByRules } from './replyTriage.ts';
import { usesDash } from './warmReply.ts';
import { salesStyleProblems, SALES_STYLE_RULES } from './salesStyle.ts';
import { serviceWindowState } from './serviceWindow.ts';
import { isClientLead } from './roleRules.ts';
import {
  GENERIC_SITE_LINE, NO_SITE_LINE, carryOn, draftSearch, issueMentioned, namesLine, offerLine, offersRoutes, saysGoogleAiForGemini, vagueSiteClaim, withArticle, wrongEngineWords,
} from './draftEvidence.ts';

/* ── cost ─────────────────────────────────────────────────────────────────────────────────────── */

export const AI_REPLY_MODEL = 'gpt-4o-mini';
/** gpt-4o-mini, USD per 1M tokens — the rate _shared/openai-usage.ts bills by (CLAUDE.md §4: verified). */
export const AI_REPLY_USD_PER_M_INPUT = 0.15;
export const AI_REPLY_USD_PER_M_OUTPUT = 0.60;
/** The most one draft may cost, every model call included (a retry, a Regenerate is its own draft budget). */
export const AI_REPLY_DRAFT_MAX_USD = 0.005;
/** The model's answer is capped at this many tokens (a WhatsApp reply is ~120). */
export const AI_REPLY_MAX_OUTPUT_TOKENS = 400;
/** The prompt is cut to this many characters before it is sent (~4 chars per token). */
export const AI_REPLY_MAX_PROMPT_CHARS = 12_000;
/** A person may ask for another version of one draft at most this many times. */
export const AI_REPLY_MAX_REGENERATIONS = 5;
/** Wait this long after an inbound before drafting, so a burst of three messages gets one draft. */
export const AI_REPLY_SETTLE_MS = 30_000;

/** The worst case a call can cost, BEFORE it is made: every prompt character a token, the full output. */
export function worstCaseCallUsd(promptChars: number, maxOutputTokens: number = AI_REPLY_MAX_OUTPUT_TOKENS): number {
  return (promptChars / 1e6) * AI_REPLY_USD_PER_M_INPUT + (maxOutputTokens / 1e6) * AI_REPLY_USD_PER_M_OUTPUT;
}
/** What a finished call cost, from its token counts. */
export function callUsd(promptTokens: number, completionTokens: number): number {
  return Number(((promptTokens / 1e6) * AI_REPLY_USD_PER_M_INPUT + (completionTokens / 1e6) * AI_REPLY_USD_PER_M_OUTPUT).toFixed(6));
}
/** May another call be made inside the per-draft cap, given what this draft has already spent? */
export function mayCallWithin(spentUsd: number, promptChars: number, capUsd: number = AI_REPLY_DRAFT_MAX_USD): boolean {
  return spentUsd + worstCaseCallUsd(promptChars) <= capUsd;
}

/* ── what to do with one inbound message ──────────────────────────────────────────────────────── */

export type AiReplyKind = 'draft' | 'needs_you' | 'needs_template' | 'skipped';
export type AiReplyStatus = 'generating' | 'pending' | 'sending' | 'sent' | 'discarded' | 'superseded' | 'resolved' | 'failed';
/** The statuses that still want a person: shown in the Inbox. */
export const AI_REPLY_OPEN_STATUSES: readonly AiReplyStatus[] = ['generating', 'pending', 'sending'];

export type HandoverReason =
  | 'opt_out' | 'not_interested' | 'wrong_person' | 'already_sorted' | 'legal' | 'complaint' | 'payment'
  | 'angry' | 'price' | 'call_request' | 'booking' | 'media' | 'do_not_contact' | 'draft_failed' | 'paused';
export type SkipReason = 'off' | 'no_lead' | 'client' | 'not_outreach' | 'automated' | 'acknowledgement' | 'archived';

export const HANDOVER_LABELS: Record<HandoverReason, string> = {
  opt_out: 'Asked to stop',
  not_interested: 'Said not interested',
  wrong_person: 'Says wrong number / wrong person',
  already_sorted: 'Says they are already sorted',
  legal: 'Mentions legal action, a complaint body or a scam',
  complaint: 'Reads as a complaint',
  payment: 'Mentions money or a refund',
  angry: 'Sounds angry',
  price: 'Asked the price',
  call_request: 'Asked for a call',
  booking: 'Wants to book a time',
  media: 'Sent a photo, file or voice note',
  do_not_contact: 'On the Do Not Contact / opt-out list',
  draft_failed: 'The draft could not be written',
  paused: 'Paid AI is paused',
};

/** Anger the triage rules do not count as a complaint: swearing at us, "spam", "how dare". */
const ANGRY = /\b(f+u+c+k\w*|fck\w*|shit\w*|bollocks|piss\s*off|sod\s*off|wanker|twat|prick|arsehole|asshole|bastard\w*|wtf|stfu|spam(?:ming|mer)?|how\s+dare|pathetic|joke\s+of\s+a|waste\s+of\s+(?:my|our)\s+time)\b/i;

export interface AiReplyDecisionInput {
  enabled: boolean;
  /** The newest inbound message's text (bodyFor's "[image]" placeholder for media). */
  body: string | null;
  messageType?: string | null;
  inboundAt: string;
  lead: { amount_paid?: unknown; status?: unknown; is_archived?: unknown } | null;
  /** Any suppression on any channel (contact_suppressions) — the Do Not Contact list. Fails closed upstream. */
  suppressed: boolean;
  /** We sent them a real WhatsApp message before this reply: it is a reply to OUR outreach. */
  hadOutreach: boolean;
  nowMs?: number;
}
export type AiReplyDecision =
  | { kind: 'draft' }
  | { kind: 'needs_template' }
  | { kind: 'needs_you'; reason: HandoverReason; label: string }
  | { kind: 'skipped'; reason: SkipReason };

const handover = (reason: HandoverReason): AiReplyDecision => ({ kind: 'needs_you', reason, label: HANDOVER_LABELS[reason] });

/**
 * The one rule. Order matters and is the point:
 *   off → nothing · no lead / client / archived / not our outreach → nothing (prospect automation only)
 *   → Do Not Contact → hand over · stop / no / legal / angry / call / price / media → hand over
 *   → an auto-responder or a bare "ok" → nothing · window closed → needs a template · else a draft.
 * ⛔ POSITIVE: a draft is written only when every hand-over test failed AND the window is open.
 */
export function aiReplyDecision(i: AiReplyDecisionInput): AiReplyDecision {
  if (i.enabled !== true) return { kind: 'skipped', reason: 'off' };
  if (!i.lead) return { kind: 'skipped', reason: 'no_lead' };
  if (isClientLead(i.lead)) return { kind: 'skipped', reason: 'client' };
  if (i.lead.is_archived === true) return { kind: 'skipped', reason: 'archived' };
  if (i.hadOutreach !== true) return { kind: 'skipped', reason: 'not_outreach' };
  if (i.suppressed !== false) return handover('do_not_contact');
  const text = String(i.body ?? '');
  const t = triageByRules(text, { isClient: false, messageType: i.messageType ?? 'text' });
  switch (t.category) {
    case 'opt_out': return handover('opt_out');
    case 'not_interested': return handover('not_interested');
    case 'wrong_person': return handover('wrong_person');
    case 'already_sorted': return handover('already_sorted');
    case 'escalation': return handover('legal');
    case 'complaint': return handover('complaint');
    case 'payment_issue': return handover('payment');
    case 'media': return handover('media');
    default: break;
  }
  if (ANGRY.test(text.replace(/[’‘ʼ]/g, "'"))) return handover('angry');
  if (t.category === 'price') return handover('price');
  if (t.category === 'call_request') return handover('call_request');
  if (t.category === 'booking') return handover('booking');
  if (t.category === 'automated') return { kind: 'skipped', reason: 'automated' };
  if (t.category === 'acknowledgement' || t.category === 'irrelevant') return { kind: 'skipped', reason: 'acknowledgement' };
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

/** What the conversation shows, or null when there is nothing open. A pending draft whose window has
 *  closed since it was written can no longer be sent as free text: it reads "Needs a template". */
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

/* ── the draft ────────────────────────────────────────────────────────────────────────────────── */

export interface AiReplyFinding { title: string; said: string }
export interface AiReplyContext {
  firstName: string | null;
  businessName: string;
  latestInbound: string;
  /** Oldest first, ours and theirs, already readable (templates as their body). */
  thread: Array<{ from: 'us' | 'them'; text: string }>;
  /** From the completed audit only: the search as a person says it, and who AI named. */
  search: { trade: string; town: string } | null;
  /** At most three, one per business (draftEvidence.draftNames). Empty = no names could be read. */
  competitors: string[];
  /** The AI tool this conversation names, as a text says it ("gemini", "chatgpt", else "ai"):
   *  draftEvidence.conversationEngine — what our sent messages already said, else the audit's engine. */
  engineWords: string;
  /** They have a website of their own on file (decides the offer: both routes, or build one). */
  hasWebsite: boolean;
  /** The audit named them on every answer: say nothing about anyone named "instead". */
  namedEverywhere: boolean;
  /** The audit / competitor hook has already gone out: refer back, never re-list the names. */
  hookAlreadySent: boolean;
  /** The 1–2 strongest real crawl issues (coldCallPlaybook.selectFindings). Empty = the generic line. */
  findings: AiReplyFinding[];
  /** They already told us who runs the site — the question is not asked again. */
  ownershipKnown: boolean;
}

export interface AiReplyWhy {
  search: string | null;
  competitors: string[];
  /** Which AI tool the draft was told to name, and why (the engine the names came from). */
  engineWords?: string | null;
  hookAlreadySent: boolean;
  findings: string[];
  findingsNote: string | null;
  /** 'issues' = the crawl's own findings were offered; 'generic' = nothing to claim, the general line. */
  siteLine?: 'issues' | 'generic';
  askedOwnership: boolean;
  styleSource: string;
  problems: string[];
  usedFallback: boolean;
  costUsd: number;
  calls: number;
}

/** The best-replied follow-up template (whatsapp_messages, 90 days to 2026-10-11: audit_followup_call
 *  95 replies from 258 sends = 37%, the highest of the after-reply templates; audit_reply 32%,
 *  competitor_hook 15%). Its TONE is the example — never pasted in as the message. */
export const BEST_TEMPLATE_STYLE_NOTE = 'audit_followup_call (37% reply rate, the best after-reply template, 90 days to 2026-10-11)';
export const BEST_TEMPLATE_TONE_EXAMPLE =
  "Hi mate, i was looking for a plumber in Rugby so i asked AI and it mentioned A1 Plumbing, Rugby Heating and Smith & Sons\n\n" +
  "I know how to get you showing up more in those answers so people are more likely to find you\n\n" +
  "Happy to explain it here or jump on a quick call if you'd rather";

export const OWNERSHIP_QUESTION = 'are you with an agency for the website at the moment or do you look after it yourself?';

export const AI_REPLY_SYSTEM_PROMPT = `You draft the NEXT WhatsApp message from Paul at Findable to a UK local business that has just replied to him. Paul helps local businesses show up when people ask AI tools for their trade in their area. A person reads, edits and approves every draft before anything is sent. Return ONLY the return_reply tool.

THE SHAPE (in this order, each part only if its facts are given):
1. Answer their latest message in one short line if it asked or said something that needs answering.
2. What was searched and who it recommended, using the AI TOOL words given ("i asked gemini for an electrician in rotherham and it recommended A, B and C"). Name ONLY the businesses listed under AI NAMED INSTEAD, at most three. If it says no names could be read, say "it named a few other businesses" and never make a name up. If the hook has ALREADY been sent, do not list the names again; refer back to it in a few words. If no search is given, leave this part out.
3. The website: if WEBSITE ISSUES are listed, say the strongest 1 or 2 in plain everyday words (no jargon), only those. If none are listed, use the GENERAL LINE given instead and claim no fault. Never say you "found some things" or "a few issues" without saying exactly what they are.
4. The offer, in one short line, as given under OFFER.
5. End with ONE question: ${OWNERSHIP_QUESTION} If they have already said who runs the site, end instead with one simple question about a quick call.
The goal is a call. One question only, at the very end.

RULES:
- Casual, like a tradesperson texting: lowercase is fine, "mate" is fine, short lines, no headings, no bullet points, no bold, no emojis, no dashes, no exclamation marks, no sign off.
- Under 600 characters.
- No price, no money, no links, no guarantee, no promises about results.
- Never say how an AI decides or that a website issue caused the result; say it "could be holding you back".
- Use only the facts given. Never invent a competitor, a number, an issue, a service or a compliment.

${SALES_STYLE_RULES}

TONE EXAMPLE (the best-replied message we send; match its feel, never copy it):
"""${BEST_TEMPLATE_TONE_EXAMPLE}"""`;

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
  lines.push(`THEIR LATEST MESSAGE (answer this first if it needs an answer):\n"""${c.latestInbound.slice(0, 600)}"""`);
  lines.push(`BUSINESS: ${c.businessName}${c.firstName ? ` (first name: ${c.firstName})` : ''}`);
  if (c.search) {
    lines.push(`SEARCH: i asked ${c.engineWords} for ${withArticle(draftSearch(c.search.trade, c.search.town) ?? c.search.trade)}`);
    lines.push(c.engineWords === 'ai'
      ? 'AI TOOL: say it as "ai". Do not name ChatGPT or Gemini as the tool you asked.'
      : `AI TOOL: say it as "${c.engineWords}" (the tool this conversation has used). Do not name a different AI tool.`);
    if (c.namedEverywhere) lines.push('AI NAMED: them, on every answer. Do not say anyone was named instead.');
    else if (c.competitors.length) lines.push(`AI NAMED INSTEAD (name these, at most three, spelt exactly like this): ${c.competitors.join(', ')}`);
    else lines.push('AI NAMED INSTEAD: no names could be read. Say "it named a few other businesses". Never make a name up.');
    lines.push(c.hookAlreadySent ? 'HOOK: already sent (they have seen the search and the names). Refer back briefly, do not list the names again.' : 'HOOK: not sent yet. Say the search and the names.');
  } else {
    lines.push('SEARCH: none on record. Leave the AI part out.');
  }
  lines.push(c.findings.length
    ? `WEBSITE ISSUES (actually found by our crawl, strongest first; say 1 or 2 in plain words):\n${c.findings.map((f, i) => `${i + 1}. ${f.title}: ${f.said}`).join('\n')}`
    : `WEBSITE ISSUES: none to mention. Do not claim any fault. GENERAL LINE (say this in your own casual words): ${c.hasWebsite ? GENERIC_SITE_LINE : NO_SITE_LINE}`);
  lines.push(`OFFER: ${offerLine(c.hasWebsite, c.findings.length > 0)} (it follows the website part, so join it on to that; never a bare "do that")`);
  lines.push(c.ownershipKnown ? 'WEBSITE OWNERSHIP: they already told us. Do not ask again; end with a quick question about a call.' : `END WITH: ${OWNERSHIP_QUESTION}`);
  const thread = c.thread.slice(-12).map((m) => `${m.from === 'us' ? 'PAUL' : 'THEM'}: ${m.text.replace(/\s+/g, ' ').slice(0, 500)}`).join('\n');
  lines.push(`CONVERSATION SO FAR (oldest first):\n${thread}`);
  const out = lines.join('\n\n');
  return out.length > AI_REPLY_MAX_PROMPT_CHARS ? out.slice(out.length - AI_REPLY_MAX_PROMPT_CHARS) : out;
}

const PRICE_OR_LINK = /£|\$|\bper month\b|\bmonthly\b|\bprice\b|\bcosts?\b|https?:\/\/|www\.|\.(?:co\.uk|com|live|uk)\b/i;

/** The checks a draft is held to. Each problem is shown to the person as "Check this draft". */
export function checkAiReply(reply: string, c: AiReplyContext): string[] {
  const out: string[] = [];
  const r = reply.trim();
  if (!r) return ['Empty draft.'];
  if (r.length > 700) out.push('Too long for WhatsApp (over 700 characters).');
  if (usesDash(r)) out.push('Uses a dash.');
  if (PRICE_OR_LINK.test(r)) out.push('Mentions a price or a link.');
  const qs = (r.match(/\?/g) ?? []).length;
  if (qs === 0) out.push('Does not end with a question.');
  if (qs > 1) out.push('Asks more than one question.');
  if (!c.ownershipKnown && !/\bagency\b/i.test(r)) out.push('Does not ask whether they use an agency or run the site themselves.');
  if (c.findings.length && !c.findings.some((f) => issueMentioned(r, f))) {
    out.push('Does not mention any of the website issues found.');
  }
  if (c.search && !c.hookAlreadySent && !c.namedEverywhere && c.competitors.length && !c.competitors.some((n) => r.toLowerCase().includes(n.toLowerCase()))) {
    out.push('Does not name who AI recommended instead.');
  }
  if (!c.findings.length && /\b(your (?:web)?site|website)\b.{0,60}\b(issue|problem|wrong|missing|broken)/i.test(r)) out.push('Mentions website problems when none were found.');
  if (vagueSiteClaim(r) && !c.findings.length) out.push('Says it found things on the website without saying what (none were found).');
  if (c.search && wrongEngineWords(r, c.engineWords)) out.push(`Names a different AI tool from the one this conversation uses ("${c.engineWords}").`);
  if (saysGoogleAiForGemini(r)) out.push('Says "google ai"; say "gemini".');
  if (!offersRoutes(r, c.hasWebsite)) out.push(c.hasWebsite ? 'Does not offer both routes (improve the current site, or build a new one).' : 'Does not offer to build them a site.');
  out.push(...salesStyleProblems(r, [...c.competitors, c.businessName]));
  return out;
}

/** The rule-built draft when the model is unavailable or over budget. Built only from the facts. */
export function fallbackAiReply(c: AiReplyContext): string {
  const parts: string[] = [];
  parts.push(c.firstName ? `Hi ${c.firstName}` : 'Hi mate');
  if (c.search && !c.namedEverywhere) {
    const search = draftSearch(c.search.trade, c.search.town) ?? c.search.trade;
    if (c.hookAlreadySent) parts.push(`like i said, when i asked ${c.engineWords} for ${withArticle(search)} you weren't the one it put forward`);
    else parts.push(namesLine(c.engineWords, search, c.competitors));
  }
  parts.push(c.findings.length
    ? `i had a look at your website too and ${c.findings.slice(0, 2).map((f) => carryOn(f.said)).join(', and ')}`
    : (c.hasWebsite ? GENERIC_SITE_LINE : NO_SITE_LINE));
  parts.push(offerLine(c.hasWebsite, c.findings.length > 0));
  parts.push(c.ownershipKnown ? 'would a quick call this week work?' : OWNERSHIP_QUESTION);
  return parts.join('\n\n');
}
