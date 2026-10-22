/* ══ ONE PILL FOR WHAT NEEDS DOING NOW (2026-10-22, Paul) ════════════════════════════════════════════════════════════════
   The Inbox list row and the thread header used to carry up to five chips for one conversation (the AI chip, the state chip,
   "Auto-reply" / "Only confirmed", the Needs you reason line, the Queued pill). Now ONE pill, the single highest-priority
   state, in this fixed order:
       Needs approval → Needs you → Send failed → Auditing → Waiting → Queued (sends at …)
   Everything the old chips said that still matters is in the pill's hover text (the Needs you reason, how long a reply has
   waited, "only confirmed who they are", the provider's error). The lead status, the star and the next action are separate
   and unchanged. Pure: no React, no DOM. */
import { aiChipFor, type AiReplyRow } from './aiReplyDraft';
import { formatWaiting, type ConversationState } from './conversationState';
import { queuedLabel, HOLD_LABELS, type ScheduledSendRow } from './inboxSendWindow';
import { sendErrorLine, type SendChannel } from './sendErrorMeaning';

export const ATTENTION_ORDER = ['needs_approval', 'needs_you', 'send_failed', 'auditing', 'waiting', 'queued'] as const;
export type AttentionKind = typeof ATTENTION_ORDER[number];

export const ATTENTION_LABELS: Record<AttentionKind, string> = {
  needs_approval: 'Needs approval',
  needs_you: 'Needs you',
  send_failed: 'Send failed',
  auditing: 'Auditing',
  waiting: 'Waiting',
  queued: 'Queued',
};

export type AttentionTone = 'violet' | 'red' | 'sky' | 'blue' | 'grey';
export const ATTENTION_TONE: Record<AttentionKind, AttentionTone> = {
  needs_approval: 'violet', needs_you: 'red', send_failed: 'red', auditing: 'sky', waiting: 'blue', queued: 'grey',
};

export interface Attention {
  kind: AttentionKind;
  /** The pill's words ("Queued (sends 07:00)" carries the time; the rest are the fixed labels). */
  label: string;
  /** The hover: why, and anything the old chips said that still matters. */
  title: string;
}

/** "Auto-reply" / "Only confirmed" (replyMove.inboundLabel): their last message is not a real reply. Hover text only. */
export const INBOUND_LABEL_TITLES: Record<'Auto-reply' | 'Only confirmed', string> = {
  'Auto-reply': 'Their last message was an automatic reply from their business. Not counted as Replied.',
  'Only confirmed': 'Their last message only confirmed who they are (for example "yes it is"). Not counted as Replied.',
};

export interface AttentionInput {
  ai: AiReplyRow | null | undefined;
  state: ConversationState | null | undefined;
  /** An audit for this lead is running (useInbox auditRunningLeadIds, or one just started from the thread). */
  auditing: boolean;
  /** This conversation's Inbox sends queued for their send hours. */
  scheduled: readonly Pick<ScheduledSendRow, 'status' | 'send_at' | 'tz' | 'hold_reason'>[];
  inboundLabel?: 'Auto-reply' | 'Only confirmed' | null;
  channel: SendChannel;
  nowMs?: number;
}

/** "07:00" from queuedLabel's words ("Queued, sends at 07:00 their time" / "Queued, sends Mon 09:00 their time"). */
function sendsAt(r: Pick<ScheduledSendRow, 'send_at' | 'tz'>): string {
  const words = queuedLabel(r.send_at, r.tz);
  const m = /sends (?:at )?(.+?) their time/.exec(words);
  return m ? m[1] : '';
}

/** Every state that applies, highest priority first. attentionFor returns the first. */
export function attentionsFor(input: AttentionInput): Attention[] {
  const now = input.nowMs ?? Date.now();
  const out: Attention[] = [];
  const chip = aiChipFor(input.ai ?? null, now);
  const st = input.state ?? null;
  const note = input.inboundLabel ? ` ${INBOUND_LABEL_TITLES[input.inboundLabel]}` : '';
  if (chip?.label === 'Needs approving') {
    out.push({ kind: 'needs_approval', label: ATTENTION_LABELS.needs_approval, title: `An AI draft is waiting in the thread. Nothing is sent until someone approves it.${note}` });
  }
  if (chip?.label === 'Needs you') {
    out.push({ kind: 'needs_you', label: ATTENTION_LABELS.needs_you, title: `${input.ai?.reason_label ?? 'A person should answer this one'}.${note}` });
  } else if (chip?.label === 'Needs a template') {
    out.push({ kind: 'needs_you', label: ATTENTION_LABELS.needs_you, title: `Their last message is more than 24 hours old: only an approved template can be sent.${note}` });
  }
  const held = input.scheduled.find((r) => r.status === 'held');
  if (held) {
    const why = HOLD_LABELS[held.hold_reason as keyof typeof HOLD_LABELS] ?? 'check before sending';
    out.push({ kind: 'needs_you', label: ATTENTION_LABELS.needs_you, title: `A queued message is held: ${why}.` });
  }
  if (st?.failed) {
    out.push({ kind: 'send_failed', label: ATTENTION_LABELS.send_failed, title: sendErrorLine(input.channel, st.failedError) ?? 'Our last message failed to send.' });
  }
  if (input.auditing) {
    out.push({ kind: 'auditing', label: ATTENTION_LABELS.auditing, title: 'The AI audit or website check is still running. A first-reply pitch waits for both.' });
  }
  if (st && st.waitingSinceMs !== null) {
    out.push({ kind: 'waiting', label: ATTENTION_LABELS.waiting, title: `They replied ${formatWaiting(now - st.waitingSinceMs) === 'now' ? 'just now' : `${formatWaiting(now - st.waitingSinceMs)} ago`} and nothing has answered yet.${note}` });
  }
  const next = [...input.scheduled].filter((r) => r.status === 'scheduled' || r.status === 'sending')
    .sort((a, b) => Date.parse(a.send_at) - Date.parse(b.send_at))[0];
  if (next) {
    const at = sendsAt(next);
    out.push({ kind: 'queued', label: at ? `${ATTENTION_LABELS.queued} (sends ${at})` : ATTENTION_LABELS.queued, title: `${queuedLabel(next.send_at, next.tz)}. Edit or cancel it in the thread.` });
  } else if (st?.queued) {
    out.push({ kind: 'queued', label: ATTENTION_LABELS.queued, title: 'In the outreach drip queue.' });
  }
  return out.sort((a, b) => ATTENTION_ORDER.indexOf(a.kind) - ATTENTION_ORDER.indexOf(b.kind));
}

/** ⛔ THE ONE PILL: the single highest-priority state, or null for a quiet conversation. */
export function attentionFor(input: AttentionInput): Attention | null {
  const all = attentionsFor(input);
  if (!all.length) return null;
  const [top, ...rest] = all;
  // The hover also lists what else applies, so nothing the old chips showed is lost.
  const others = [...new Set(rest.map((r) => r.label))].filter((l) => l !== top.label);
  return others.length ? { ...top, title: `${top.title} Also: ${others.join(', ')}.` } : top;
}
