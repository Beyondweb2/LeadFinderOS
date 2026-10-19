/* ══ WHAT STATE IS A WHATSAPP CONVERSATION IN? (Sales Experience, 2026-09-28) ═══════════════════════
   One pure rule, read by the Inbox list, the thread header, the Sales Dashboard fold (server) and the
   notification wording. docs/sales-experience.md §2 states the same in words.

   ⛔ EVERY STATE IS A FACT WE STORED, NEVER A GUESS:
   - UNREAD: the newest inbound message is newer than the last time THIS person opened the thread
     (whatsapp_conversation_reads). Never opened → counted from UNREAD_TRACKING_START, so history
     before the feature is never "unread".
   - WAITING ON US: a human reply (looksAutomated excluded) that nothing has answered — no real send
     after it. The timer runs from the FIRST unanswered human reply, not the latest. A clear "no"
     (isDecline, the rule the reply automation uses) is not waiting on anyone.
   - WAITING ON THEM: our real send is the newest message.
   - TEMPLATE REQUIRED: the 24-hour window is closed (serviceWindow.ts — the one window rule).
   - FAILED: our newest send failed and nothing we sent after it succeeded.
   - QUEUED: the lead is in the drip queue (status 'queued').
   - FOLLOW-UP DUE: a person set a Next Action dated today or earlier. Never set automatically.
   ⛔ The tone is chosen by a fixed order (failed → waiting on us → follow-up due → template → rest),
   so a row shows ONE colour and the most urgent one. */
import { isDecline, looksAutomated } from './inboundClassify.ts';
import { isRealSend } from './realSend.ts';
import { serviceWindowState } from './serviceWindow.ts';
import { partsFromStoredError, type SendErrorParts } from './sendErrorMeaning.ts';

/** Mirrors public.whatsapp_unread_since() in migration 20260929120000 — keep them the same. */
export const UNREAD_TRACKING_START = '2026-09-28T00:00:00Z';

export interface ConvMessage {
  direction: string | null;
  status: string | null;
  created_at: string;
  body: string | null;
  /* 2026-10-15: the provider's raw error on a failed send (Meta for WhatsApp, Twilio for a text). Rows from before the
     error columns keep only the JSON text in `error`, read back by partsFromStoredError. */
  error_code?: number | string | null;
  error_title?: string | null;
  error_details?: string | null;
  error?: string | null;
}

export type ConvTone = 'red' | 'blue' | 'amber' | 'grey' | 'green';

/** The raw error of a failed message: its own columns first, else read back out of the stored error text. */
export function messageErrorParts(m: ConvMessage | null | undefined): SendErrorParts | null {
  if (!m) return null;
  const n = m.error_code == null || m.error_code === '' ? null : Number(m.error_code);
  const code = n != null && Number.isFinite(n) ? n : null;
  const stored = partsFromStoredError(m.error ?? null);
  const parts: SendErrorParts = { code: code ?? stored.code, title: m.error_title ?? stored.title, details: m.error_details ?? stored.details };
  return parts.code == null && !parts.title && !parts.details ? null : parts;
}

export interface ConversationState {
  unread: boolean;
  /** When the first unanswered human reply arrived (ms), or null when nothing is waiting on us. */
  waitingSinceMs: number | null;
  waitingOnThem: boolean;
  windowOpen: boolean;
  templateRequired: boolean;
  failed: boolean;
  queued: boolean;
  followUpDue: boolean;
  /** The one colour for this row (see the order above). */
  tone: ConvTone;
  /** The one short label beside the colour, or null for a quiet row. */
  label: string | null;
  /** The provider's raw error on the failed last send (code / title / details), or null. */
  failedError: SendErrorParts | null;
}

export interface ConvStateInput {
  /** Chronological (oldest first) — the order the Inbox already keeps. */
  messages: readonly ConvMessage[];
  lastReadAt: string | null | undefined;
  leadStatus?: string | null;
  isPotentialWork?: boolean | null;
  nextAction?: string | null;
  /** YYYY-MM-DD, a stored day. */
  nextActionDate?: string | null;
  nowMs?: number;
}

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);

/** Today as a stored day in London (a Next Action date is a UK calendar day). */
export function londonToday(nowMs: number = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(nowMs));
}

export function isFollowUpDue(nextAction: string | null | undefined, nextActionDate: string | null | undefined, nowMs: number = Date.now()): boolean {
  if (!nextAction || nextAction === 'none' || !nextActionDate) return false;
  return nextActionDate <= londonToday(nowMs);
}

export function conversationState(input: ConvStateInput): ConversationState {
  const now = input.nowMs ?? Date.now();
  const msgs = input.messages;
  let lastInboundMs = NaN;
  let lastRealSendMs = NaN;
  let lastOutbound: ConvMessage | null = null;
  for (const m of msgs) {
    const t = ms(m.created_at);
    if (m.direction === 'inbound') { if (!(t <= lastInboundMs)) lastInboundMs = t; }
    else if (m.direction === 'outbound') {
      lastOutbound = m;
      if (isRealSend(m.status) && !(t <= lastRealSendMs)) lastRealSendMs = t;
    }
  }
  // The first HUMAN reply after our last real send.
  let waitingSinceMs: number | null = null;
  let lastUnansweredBody: string | null = null;
  for (const m of msgs) {
    if (m.direction !== 'inbound') continue;
    const t = ms(m.created_at);
    if (Number.isFinite(lastRealSendMs) && t <= lastRealSendMs) continue;
    if (looksAutomated(m.body ?? '')) continue;
    if (waitingSinceMs === null) waitingSinceMs = t;
    lastUnansweredBody = m.body ?? '';
  }
  // Their latest word is a clear no: nothing is owed.
  if (waitingSinceMs !== null && lastUnansweredBody !== null && isDecline(lastUnansweredBody)) waitingSinceMs = null;
  const readFloor = Math.max(ms(UNREAD_TRACKING_START), Number.isFinite(ms(input.lastReadAt)) ? ms(input.lastReadAt) : -Infinity);
  const unread = Number.isFinite(lastInboundMs) && lastInboundMs > readFloor;
  const win = serviceWindowState(Number.isFinite(lastInboundMs) ? new Date(lastInboundMs).toISOString() : null, now);
  const failed = !!lastOutbound && lastOutbound.status === 'failed';
  const waitingOnThem = waitingSinceMs === null && Number.isFinite(lastRealSendMs) && !(lastInboundMs > lastRealSendMs);
  const queued = input.leadStatus === 'queued';
  const followUpDue = isFollowUpDue(input.nextAction, input.nextActionDate, now);

  let tone: ConvTone = 'grey';
  let label: string | null = null;
  if (failed) { tone = 'red'; label = 'Send failed'; }
  else if (waitingSinceMs !== null) { tone = 'blue'; label = `Waiting ${formatWaiting(now - waitingSinceMs)}`; }
  else if (followUpDue) { tone = 'amber'; label = 'Follow-up due'; }
  else if (queued) { tone = 'grey'; label = 'Queued'; }
  else if (!win.open && msgs.length > 0) { tone = 'grey'; label = null; }
  else if (input.isPotentialWork || input.leadStatus === 'interested') { tone = 'green'; label = null; }
  return {
    unread, waitingSinceMs, waitingOnThem, windowOpen: win.open, templateRequired: !win.open,
    failed, queued, followUpDue, tone, label,
    failedError: failed ? messageErrorParts(lastOutbound) : null,
  };
}

/** "12m", "2h", "3d" — how long a reply has waited. Under a minute reads "now". */
export function formatWaiting(deltaMs: number): string {
  if (!Number.isFinite(deltaMs) || deltaMs < 60_000) return 'now';
  const m = Math.floor(deltaMs / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** The Inbox's quick filters (both roles). */
export const INBOX_QUICK_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'waiting', label: 'Waiting on us' },
  /* 2026-09-30: the other side of the same fact — we wrote last and they have not answered. */
  { value: 'waiting_them', label: 'Waiting on them' },
  /* 2026-10-11: AI handles replies (src/lib/aiReplyDraft.ts) — a WhatsApp conversation with an AI draft waiting for approval. */
  { value: 'needs_approving', label: 'Needs approving' },
  /* 2026-10-20: a reply the drafter flagged for a person (src/lib/replyMove.ts NEEDS_YOU_LABELS). WhatsApp only. */
  { value: 'needs_you', label: 'Needs you' },
] as const;
export type InboxQuickFilter = typeof INBOX_QUICK_FILTERS[number]['value'];

export function passesQuickFilter(f: InboxQuickFilter | string | null | undefined, s: Pick<ConversationState, 'unread' | 'waitingSinceMs'> & { waitingOnThem?: boolean; needsApproving?: boolean; needsYou?: boolean }): boolean {
  if (f === 'unread') return s.unread;
  if (f === 'waiting') return s.waitingSinceMs !== null;
  if (f === 'waiting_them') return s.waitingOnThem === true;
  if (f === 'needs_approving') return s.needsApproving === true;
  if (f === 'needs_you') return s.needsYou === true;
  return true;
}

/** The exact-conversation deep link: every notification, dashboard action and lead button uses it. */
export const whatsAppLinkForLead = (leadId: string) => `/inbox?lead=${encodeURIComponent(leadId)}`;
