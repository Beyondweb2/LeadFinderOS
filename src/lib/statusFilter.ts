import { statusesForFilter, type LeadStatus, type StatusFilterValue } from '@/types/outreach';
import { isStarred, pillStatusOf, type SalesStateView } from '@/lib/leadState';

/* ⛔ THE ONE STATUS-FILTER MATCH (2026-10-02, Paul): a status filter keeps a row when the status its pill
   SHOWS is in the option — the Outreach rule since 2026-10-01, now shared with the Inbox, which matched the
   STORED status (a business reached by phone showed a Contacted pill but sat outside the Contacted filter).
   "Interested" is the star and only the star (isStarred), whatever the status.
   Not here: Outreach's "Paid (money in)" (it reads the money: isPaidLead) and the Inbox's always-visible
   buckets (unassigned / paying) — each caller keeps those before calling this. */
export function shownStatusMatches(
  filter: string,
  lead: { status?: string | null; is_potential_work?: boolean | null },
  stage: SalesStateView | null | undefined,
): boolean {
  if (filter === 'interested') return isStarred(lead);
  return statusesForFilter(filter as StatusFilterValue).includes(pillStatusOf(lead.status, stage) as LeadStatus);
}
