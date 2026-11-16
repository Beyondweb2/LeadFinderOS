/* ════════════════════════════════════════════════════════════════════════════════════════════════
   FREE OR PAID — THE WORDS A SEND SHOWS BEFORE IT GOES (2026-11-16, Paul).

   Inside their 24 hours a saved template goes as a normal (free) message of the same wording; outside it only the paid
   template can go (src/lib/inWindowFreeText.ts, judged by the sender with the landing margin, freeWindowOpen). These are
   the labels every send shows — the Inbox bulk confirm, the Inbox single send, the Outreach WhatsApp popup — so the screens
   say it the same way.

   ⛔ THE PRICE IS THE CONSTANT, NEVER A NUMBER WRITTEN HERE: CHANNEL_COST_GBP.whatsapp_marketing (channelCosts.ts, an
      estimate rounded up until a billed row agrees). ⛔ ABSENT IS PAID: a send whose shape we do not know is labelled paid,
      so the screen never promises a free message the sender might not send.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { CHANNEL_COST_GBP } from './channelCosts';
import { freeWindowOpen } from './inWindowFreeText';

/** "about £0.06" — from the constant. */
export const PAID_TEMPLATE_COST_WORDS = `about £${CHANNEL_COST_GBP.whatsapp_marketing.toFixed(2)}`;

export const FREE_SEND_LABEL = 'Free (window open)';
export const PAID_SEND_LABEL = `Paid template (window closed, ${PAID_TEMPLATE_COST_WORDS})`;

export type SendCost = 'free' | 'paid';

/** From the sender's own answer (a dry run or a send): 'text' (a video template's in-window version counts as text) is free. */
export function sendCostOf(sentAs: string | null | undefined): SendCost {
  return sentAs === 'text' ? 'free' : 'paid';
}

/** Before asking the server: a quick guess from the conversation's newest inbound time, with the same landing margin. */
export function sendCostFromLastInbound(lastInboundAt: string | number | null | undefined, nowMs: number = Date.now()): SendCost {
  const ms = typeof lastInboundAt === 'number' ? lastInboundAt : lastInboundAt ? new Date(lastInboundAt).getTime() : null;
  return freeWindowOpen(ms, nowMs) ? 'free' : 'paid';
}

export function sendCostLabel(cost: SendCost): string {
  return cost === 'free' ? FREE_SEND_LABEL : PAID_SEND_LABEL;
}

/** The bulk confirm's split line: "3 free (window open) · 2 need a paid template (window closed, about £0.06 each)". */
export function bulkFreePaidLine(free: number, paid: number): string {
  const parts: string[] = [];
  if (free > 0) parts.push(`${free} free (window open)`);
  if (paid > 0) parts.push(`${paid} need${paid === 1 ? 's' : ''} a paid template (window closed, ${PAID_TEMPLATE_COST_WORDS} each)`);
  return parts.join(' · ');
}
