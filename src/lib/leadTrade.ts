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

/* ⛔ THE AUDIT TRADE — ONE ORDER, EVERY AUDIT PATH (2026-11-24; docs/reports/whatsapp-followup-report-2026-11-24.md §5).
   The trade an audit asks about is the SEARCH KEYWORD (the trade we searched for and the campaign is about) before the
   lead's `category` (whatever Google Maps tagged the place). The old order — category first — sent 30 Australian driving
   instructors an audit for "best educational institution in [town]", because Google files many driving schools as
   "Educational Institution". Callers: first-reply-audit, audit-baseline, findable-onboarding, site-research, quick-close.
   ⚠️ ONE EXCEPTION, AND ONLY ONE: a trade the CUSTOMER typed at signup ("Not right?" on findable-onboarding) is written
   to `category` (never over search_keyword — that is the provenance) together with a notes line
   `trade corrected by the customer at signup: "<was>" -> "<now>"`. When the latest such line's <now> still equals
   `category`, the customer's word wins. A Google category never carries that line, so it never wins over a keyword.
   Pass `notes` where you have it (the paid baseline does); without it the keyword-first order applies. */
export const CUSTOMER_TRADE_NOTE = 'trade corrected by the customer at signup';

export function customerCorrectedTrade(notes: string | null | undefined): string | null {
  const re = /trade corrected by the customer at signup: "[^"\n]*" -> "([^"\n]+)"/g;
  let last: string | null = null;
  for (const m of String(notes ?? '').matchAll(re)) last = m[1].trim();
  return last || null;
}

export function auditTradeOf(l: { search_keyword?: string | null; category?: string | null; notes?: string | null }): string {
  const cat = String(l.category ?? '').trim();
  const kw = String(l.search_keyword ?? '').trim();
  const fix = customerCorrectedTrade(l.notes);
  if (cat && fix && fix.toLowerCase() === cat.toLowerCase()) return cat;
  return kw || cat;
}
