/* FREE OR PAID: THE LABEL ON EVERY TEMPLATE SEND SCREEN (Paul, 2026-11-16; docs/in-window-free-text.md).
   The sender decides how a template goes (inWindowFreeText.ts): window open → its wording as a normal message (free);
   closed → the approved template (paid). These words only SAY that, before the press.
   ⛔ The price is the cost table's estimate (channelCosts.ts, rounded up, "a guess until a billed row agrees"), never typed here.
   A template is costed as marketing (the dearer rate) because the openers are; the table owns the number. Pure leaf. */
import { CHANNEL_COST_GBP } from './channelCosts.ts';
import { splitByWindow } from './inWindowFreeText.ts';

export const PAID_TEMPLATE_COST_GBP = CHANNEL_COST_GBP.whatsapp_marketing;
const money = (n: number) => `£${n.toFixed(2)}`;

export const FREE_SEND_WORDS = 'Free: their 24-hour window is open, so this goes as a normal message (not a paid template)';
export const PAID_SEND_WORDS = `Paid template: their 24-hour window is closed (~${money(PAID_TEMPLATE_COST_GBP)})`;

export function singleSendLabel(windowOpen: boolean): string { return windowOpen ? FREE_SEND_WORDS : PAID_SEND_WORDS; }

/** "3 free (window open) · 12 need a paid template (window closed, ~£0.06 each)". */
export function bulkSplitLine(free: number, paid: number): string {
  return `${free} free (window open) · ${paid} need a paid template (window closed, ~${money(PAID_TEMPLATE_COST_GBP)} each)`;
}

/** The split for a batch, by each lead's number. `openPhones` = digits of numbers whose window is open now. */
export function bulkSendSplit<T>(leads: readonly T[], digitsOf: (t: T) => string | null, openPhones: ReadonlySet<string>) {
  return splitByWindow(leads, (l) => { const d = digitsOf(l); return !!d && openPhones.has(d); });
}
