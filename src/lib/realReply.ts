/* ============================================================
   A REAL REPLY — the campaign performance table's rule (Paul, 2026-11-22; docs/campaign-performance.md).

   An inbound message is a REAL reply unless it is an auto-reply:
   - its words match a common auto-reply (looksAutomated — the SAME list the auto-pitch rule and the dashboards use), or
   - it arrived within AUTO_REPLY_WINDOW_MS of our previous real send (a WhatsApp Business greeting / away message fires
     the instant our message lands; a person rarely reads and answers inside a minute).
   ⚠️ The time rule will also drop some genuinely quick humans (2026-09-05 measure: the fastest tenth of credited
   replies came within about a minute). That is why the table shows RAW and REAL side by side — the gap is visible,
   never hidden.
   Other screens (Admin intelligence, Sales dashboard, Inbox) keep their own looksAutomated-only rule; this one is
   for the campaign table.
   ⚠️ Explicit .ts imports: reached by the campaign-performance edge function.
   ============================================================ */
import { looksAutomated } from './inboundClassify.ts';
import { isRealSend } from './realSend.ts';

export const AUTO_REPLY_WINDOW_MS = 60_000;

export interface ReplyMsg { direction: string | null; status: string | null; created_at: string; body: string | null }

/** Is msgs[index] (an inbound) a real reply? `msgs` = that lead's messages, oldest first. */
export function isRealReplyAt(msgs: ReadonlyArray<ReplyMsg>, index: number): boolean {
  const m = msgs[index];
  if (!m || m.direction !== 'inbound') return false;
  if (looksAutomated(m.body ?? '')) return false;
  const at = Date.parse(m.created_at);
  if (Number.isNaN(at)) return false;
  for (let i = index - 1; i >= 0; i--) {
    const p = msgs[i];
    if (p.direction !== 'outbound' || !isRealSend(p.status)) continue;
    const sent = Date.parse(p.created_at);
    return Number.isNaN(sent) || at - sent >= AUTO_REPLY_WINDOW_MS;
  }
  return true; // nothing of ours before it: not a reaction to a send
}
