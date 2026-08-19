/**
 * Did this outbound message actually go out?
 *
 * ⛔ A POSITIVE TEST, NEVER "not failed". whatsapp_messages carries six statuses in production —
 * sent / delivered / read (real sends), received (inbound), failed (Meta rejected the send, e.g.
 * the number is not on WhatsApp) and simulated (old test mode). Written as `!== 'failed'` a future
 * 'pending' or a null would count as sent — the absent-value shape CLAUDE.md records repeatedly.
 *
 * ⛔ WHY THIS EXISTS, MEASURED 2026-08-19: every dashboard counting surface treated "an outbound
 * templated row exists" as "sent", so 38 unarchived leads whose EVERY send failed (37 of them
 * status no_whatsapp) counted as Reached. The funnel read 563 reached / 52% reply rate when the
 * truth was 525 / 56% — the send that provably never happened polluted every denominator.
 *
 * One predicate, imported by useDashboardMetrics (funnel + channel card) and useCampaignStats
 * (reached / per-template rows), so the three surfaces cannot drift on what a send is.
 * scripts/real-send.test.ts pins both directions.
 */
export function isRealSend(status: string | null | undefined): boolean {
  return status === 'sent' || status === 'delivered' || status === 'read';
}
