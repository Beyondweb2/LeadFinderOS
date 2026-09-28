/* ══ IS THE QUEUE SENDING? — both roles (2026-09-28) ═════════════════════════════════════════════
   process-whatsapp-queue mode 'queue_state': paused / window open, nothing else, readable by Sales.
   ⛔ PAUSED OUTRANKS EVERYTHING. A queued lead while the admin has paused the queue must say so —
   "sends within the daily window" was the wrong promise. An unreadable state says it could not tell,
   never that it will send. */
export type QueueState = {
  paused: boolean; windowOpen: boolean; windowStartHour: number;
  /** The India window (10:00–19:00 IST, src/lib/sendWindow.ts). Absent from an old deploy. */
  indiaWindowOpen?: boolean;
};

/** A +91 destination (WhatsApp digits or a stored "+91 …" phone) is sent in India's own hours. */
const isIndianNumber = (phone: string | null | undefined) => /^\+?91\d{10}$/.test(String(phone ?? '').replace(/[^\d+]/g, ''));

export const QUEUE_PAUSED_LINE = 'Queue paused by admin — not currently sending.';

/** What a queued lead's line says. undefined = still reading; null = could not read. */
export function queuedLeadLine(state: QueueState | null | undefined, phone?: string | null): { text: string; tone: 'paused' | 'waiting' | 'sending' | 'unknown' } {
  if (state === undefined) return { text: 'In the queue — checking whether it is sending…', tone: 'unknown' };
  if (state === null) return { text: 'In the queue — could not check whether the queue is sending.', tone: 'unknown' };
  if (state.paused) return { text: QUEUE_PAUSED_LINE, tone: 'paused' };
  /* ⛔ AN INDIAN NUMBER IS ANSWERED IN INDIA'S HOURS (2026-09-28) — the queue holds it outside them. An
     old deploy that does not report the India window cannot say, so it never claims "sending now". */
  if (isIndianNumber(phone)) {
    if (state.indiaWindowOpen === undefined) return { text: 'In the queue — it sends in India business hours (10am–7pm IST).', tone: 'waiting' };
    if (!state.indiaWindowOpen) return { text: 'In the queue — outside India business hours; it resumes from 10am IST.', tone: 'waiting' };
    return { text: 'In the queue — the queue is sending now; it goes out at its paced turn.', tone: 'sending' };
  }
  if (!state.windowOpen) return { text: `In the queue — the sending window is closed; it resumes from ${state.windowStartHour}am UK.`, tone: 'waiting' };
  return { text: 'In the queue — the queue is sending now; it goes out at its paced turn.', tone: 'sending' };
}
