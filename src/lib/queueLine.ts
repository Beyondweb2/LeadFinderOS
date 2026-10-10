/* ══ IS THE QUEUE SENDING? — both roles (2026-09-28) ═════════════════════════════════════════════
   process-whatsapp-queue mode 'queue_state': paused / window open, nothing else, readable by Sales.
   ⛔ PAUSED OUTRANKS EVERYTHING. A queued lead while the admin has paused the queue must say so —
   "sends within the daily window" was the wrong promise. An unreadable state says it could not tell,
   never that it will send. */
export type QueueState = {
  paused: boolean; windowOpen: boolean; windowStartHour: number;
  /** The EFFECTIVE "When a prospect replies" rule (off / audit_only / send). Absent = an older deploy; the Inbox then says it cannot tell. */
  replyRule?: 'off' | 'audit_only' | 'send';
};

export const QUEUE_PAUSED_LINE = 'Queue paused by admin — not currently sending.';

/** What a queued lead's line says. undefined = still reading; null = could not read. */
export function queuedLeadLine(state: QueueState | null | undefined, phone?: string | null): { text: string; tone: 'paused' | 'waiting' | 'sending' | 'unknown' } {
  if (state === undefined) return { text: 'In the queue — checking whether it is sending…', tone: 'unknown' };
  if (state === null) return { text: 'In the queue — could not check whether the queue is sending.', tone: 'unknown' };
  if (state.paused) return { text: QUEUE_PAUSED_LINE, tone: 'paused' };
  if (!state.windowOpen) return { text: `In the queue — the sending window is closed; it resumes from ${state.windowStartHour}am UK.`, tone: 'waiting' };
  return { text: 'In the queue — the queue is sending now; it goes out at its paced turn.', tone: 'sending' };
}
