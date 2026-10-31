/* ══ ONE STATUS PILL FOR AN INBOX CONVERSATION (2026-10-31, Paul) ═══════════════════════════════════════════════════════════
   The row and the thread header used to draw an attention pill ("Needs you", "Waiting", …) BESIDE the stored status pill
   ("Replied", "Contacted", …), and the two could contradict each other. Now ONE pill. Its label is DERIVED from three things
   that already exist, and nothing new is stored:
       1. the stored pipeline stage, as the pill already reads it (pillStatusOf);
       2. the computed conversation state (src/lib/conversationState.ts: whose turn it is, failed, follow-up due);
       3. the attention kind (src/lib/inboxAttention.ts: needs approval / needs you / send failed / auditing / waiting / queued).
   Priority, first match wins:
       closed outcomes (Opted out, Not interested, Refunded) → money/delivery stages (Won, Paid, In delivery, Completed)
       → Send failed → Reply needed (needs you, needs approval, or they replied and nothing answered)
       → Follow-up due → Call booked → Auditing → Queued → Waiting on them → the stored stage's own words.
   The pill is still the control that sets the stored stage by hand (PipelineStatusSelect); this only changes what it SAYS.
   Pure: no React, no DOM. An absent input never reads as a real state: with nothing known the pill says what the stored
   stage says (New when there is none). */
import type { AttentionKind } from './inboxAttention.ts';

export type StatusPillKey =
  | 'reply_needed' | 'approve_draft' | 'send_failed' | 'follow_up_due' | 'call_booked' | 'auditing' | 'queued' | 'waiting_on_them'
  | 'won' | 'paid' | 'in_delivery' | 'completed' | 'refunded' | 'not_interested' | 'opted_out' | 'stage';

/** warm = needs me, cool = waiting on someone else, good = positive, muted = closed, neutral = a plain stage. */
export type StatusPillTone = 'warm' | 'cool' | 'good' | 'muted' | 'neutral';

export interface StatusPill {
  key: StatusPillKey;
  label: string;
  tone: StatusPillTone;
  title: string;
}

export interface StatusPillInput {
  /** The stored pipeline status after pillStatusOf (so a reached lead already reads Contacted). */
  stage: string | null | undefined;
  /** The stored stage in its own words (pipelineStatusLabel of the pill status), for a conversation with nothing else to say. */
  stageLabel: string;
  attentionKind: AttentionKind | null;
  attentionTitle: string | null;
  /** Their reply is unanswered (conversationState.waitingSinceMs !== null). */
  waitingOnUs: boolean;
  /** Our real send is the newest message (conversationState.waitingOnThem). */
  waitingOnThem: boolean;
  failed: boolean;
  followUpDue: boolean;
  /** salesStateOf(...).state === 'meeting_booked'. */
  meetingBooked: boolean;
}

/** The fixed words, one place, so the screens and the test read the same list. */
export const STATUS_PILL_LABELS: Record<Exclude<StatusPillKey, 'stage'>, string> = {
  reply_needed: 'Reply needed',
  approve_draft: 'Approve draft',
  send_failed: 'Send failed',
  follow_up_due: 'Follow-up due',
  call_booked: 'Call booked',
  auditing: 'Auditing',
  queued: 'Queued',
  waiting_on_them: 'Waiting on them',
  won: 'Won',
  paid: 'Paid',
  in_delivery: 'In delivery',
  completed: 'Completed',
  refunded: 'Refunded',
  not_interested: 'Not interested',
  opted_out: 'Opted out',
};

const STAGE_TO_KEY: Record<string, Exclude<StatusPillKey, 'stage'>> = {
  opted_out: 'opted_out', not_interested: 'not_interested', refunded: 'refunded',
  won_pending_onboarding: 'won', payment_received: 'paid', in_delivery: 'in_delivery', completed: 'completed',
};
const KEY_TONE: Partial<Record<StatusPillKey, StatusPillTone>> = {
  reply_needed: 'warm', approve_draft: 'warm', send_failed: 'warm', follow_up_due: 'warm',
  call_booked: 'good', won: 'good', paid: 'good', in_delivery: 'good', completed: 'good',
  auditing: 'cool', queued: 'cool', waiting_on_them: 'cool',
  not_interested: 'muted', opted_out: 'muted', refunded: 'muted',
};

const pill = (key: Exclude<StatusPillKey, 'stage'>, title: string): StatusPill => ({ key, label: STATUS_PILL_LABELS[key], tone: KEY_TONE[key] ?? 'neutral', title });

export function statusPillFor(i: StatusPillInput): StatusPill {
  const stage = (i.stage ?? '').trim();
  const stageKey = STAGE_TO_KEY[stage];
  const stageWords = i.stageLabel;
  /* Closed and money stages outrank whose turn it is: an opted-out or paid lead is never "Reply needed". */
  if (stageKey) return pill(stageKey, `${stageWords} (stored stage). Click to change it.`);
  if (i.failed || i.attentionKind === 'send_failed') return pill('send_failed', i.attentionTitle ?? 'Our last message failed to send.');
  if (i.attentionKind === 'needs_you') return pill('reply_needed', i.attentionTitle ?? 'A person should answer this one.');
  if (i.attentionKind === 'needs_approval') return pill('approve_draft', i.attentionTitle ?? 'An AI draft is waiting in the thread. Nothing is sent until someone approves it.');
  if (i.waitingOnUs) return pill('reply_needed', i.attentionTitle ?? 'They replied and nothing has answered yet.');
  if (i.followUpDue) return pill('follow_up_due', 'A follow-up you set is due today or earlier.');
  if (i.meetingBooked) return pill('call_booked', 'A call or meeting is booked.');
  if (i.attentionKind === 'auditing') return pill('auditing', i.attentionTitle ?? 'The AI audit or website check is still running.');
  if (i.attentionKind === 'queued') return pill('queued', i.attentionTitle ?? 'A message is queued to send.');
  if (i.waitingOnThem) return pill('waiting_on_them', 'Our message is the newest one. Waiting for them to answer.');
  return { key: 'stage', label: stageWords, tone: 'neutral', title: `${stageWords} (stored stage). Click to change it.` };
}
