/* ⛔ ONE RULE for "a live lead with no trade stored" (2026-09-30): the dashboard's Needs-your-attention
   count (adminMetrics.ts) and the Outreach list it opens (/outreach?show=no_trade) both read this, so
   the number and the list can never disagree. Pure and edge-safe. */
import { isPaidLead } from './leadPayment.ts';

/** Statuses a trade no longer matters for: dead, or not contactable on WhatsApp, or already queued. */
const NO_TRADE_IGNORED: ReadonlySet<string> = new Set(['not_interested', 'opted_out', 'closed', 'refunded', 'no_whatsapp', 'no_whatsapp_needs_sms', 'queued']);

export function isLiveLeadWithoutTrade(l: { is_archived?: boolean | null; status?: string | null; amount_paid?: number | null; search_keyword?: string | null; category?: string | null }): boolean {
  if (l.is_archived || isPaidLead(l) || NO_TRADE_IGNORED.has(String(l.status ?? ''))) return false;
  return !(l.search_keyword || l.category || '').trim();
}

/** Outreach list presets a link may open (Outreach ?show=). */
export const OUTREACH_PRESETS = { no_trade: 'Live leads with no trade stored' } as const;
export type OutreachPreset = keyof typeof OUTREACH_PRESETS;
export const isOutreachPreset = (v: string | null | undefined): v is OutreachPreset => !!v && v in OUTREACH_PRESETS;
