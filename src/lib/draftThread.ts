/**
 * The conversation as the reply drafter reads it (fn ai-reply-drafts → pickMove, src/lib/replyMove.ts).
 *
 * ⛔ ONLY WHAT REACHED THEM IS OURS. A draft, a refused send, a queued send that failed, a 'failed' row — none of them is a
 *    message of ours, so none of them can end "the pitch is owed" (replyMove pitchOwed). The pitch stays owed until a
 *    pitch was actually SENT (Paul, 2026-10-22).
 * ⛔ A 'failed' ROW WHOSE OWN RECEIPT SAYS DELIVERED / READ DID REACH THEM (Robina's Motoring School, 2026-10-21): Meta's
 *    'failed' webhook landed first, whatsapp-status's per-message ratchet never lets a later 'read' replace 'failed', but
 *    whatsapp_sends.delivery_status (the receipt row for the same wamid) moved on to 'read', and she replied. Dropping the
 *    opener left her "Yes, how can I help?" with nothing of ours before it, so it was never read as the first reply and got
 *    the go-on line instead of the first-reply pitch. Only delivered / read count as proof: a receipt still 'sent' or
 *    'failed' leaves the row out.
 */
import { isRealSend } from './realSend.ts';
import type { MoveThreadMsg } from './replyMove.ts';

export interface DraftThreadRow {
  id: string; created_at: string; direction: string; body: string | null; message_type: string | null; template_name: string | null;
  status: string | null; lead_id: string | null; wa_message_id?: string | null; template_snapshot?: { body?: unknown } | null; reply_kind?: string | null;
  /** Set by the loader from the receipt row (reachedThem). Absent = not proven. */
  reached?: boolean;
}

/** Did this outbound row reach them? Its own status, or — for a row stuck at 'failed' — a delivered / read receipt. */
export function reachedThem(status: string | null | undefined, receipt: string | null | undefined): boolean {
  return isRealSend(status) || (status === 'failed' && (receipt === 'delivered' || receipt === 'read'));
}

/** The 'failed' outbound rows whose receipt is worth reading (they carry Meta's message id). */
export function failedWamids(rows: readonly DraftThreadRow[]): string[] {
  return rows.filter((m) => m.direction !== 'inbound' && m.status === 'failed' && !!m.wa_message_id).map((m) => m.wa_message_id as string);
}

/** Mark each 'failed' row whose receipt proves it arrived. `receipts` = wamid → whatsapp_sends.delivery_status. */
export function withReceipts<T extends DraftThreadRow>(rows: readonly T[], receipts: ReadonlyMap<string, string | null>): T[] {
  return rows.map((m) => (m.direction !== 'inbound' && m.status === 'failed' && m.wa_message_id && reachedThem(m.status, receipts.get(m.wa_message_id))
    ? { ...m, reached: true } : m));
}

/** What a sent row SAID: a template's stored rendered body (template_snapshot), else its body. */
export const sentText = (m: DraftThreadRow): string =>
  (m.template_snapshot && typeof m.template_snapshot.body === 'string' && m.template_snapshot.body.trim()) ? m.template_snapshot.body.trim() : (m.body ?? '');

/** A message of ours that reached them (positive test: sent / delivered / read, the old simulated, or a receipt-proven 'failed'). */
export const isOurs = (m: DraftThreadRow): boolean => m.direction !== 'inbound' && (isRealSend(m.status) || m.status === 'simulated' || m.reached === true);

/** The thread up to and including this inbound, as the move picker reads it. */
export function moveThread(thread: readonly DraftThreadRow[], inbound: { created_at: string }): MoveThreadMsg[] {
  return thread.filter((m) => m.created_at <= inbound.created_at && (m.direction === 'inbound' || isOurs(m)))
    .map((m) => ({ from: m.direction === 'inbound' ? 'them' as const : 'us' as const, text: (m.direction === 'inbound' ? m.body ?? '' : sentText(m)) || (m.template_name ? `[${m.template_name}]` : ''), messageType: m.message_type, templateName: m.template_name, at: m.created_at }));
}
