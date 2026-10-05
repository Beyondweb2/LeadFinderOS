/* ══ SALE ATTRIBUTION — the interface for the commission rules (2026-10-05) ═══════════════════════════
   docs/salesperson-onboarding.md §3a. SALE CREATOR ≠ CURRENT LEAD OWNER: the seller of a sale is the
   authorised person who CREATED the sign-up link the client paid through (public.sale_creations), stamped
   once into outreach_leads.sold_by_user_id by the database and frozen. When no authorised creator is on
   record, NO seller is stamped and a review opens (public.sale_attribution_reviews) for Paul to resolve.

   ⛔ THE HOLD (what Session F — commission — must honour):
      HELD  ⇔ the lead's review status is 'open' or 'not_credited'  →  NO salesperson commission.
      'confirmed' (Paul: CONFIRM SELLER) → not held; the preserved seller follows the normal rules.
      No review row → not held.
   The database is the authority: public.sale_attribution_held(lead_id uuid) → boolean (one lead), or
   view public.sale_attribution_holds (lead_id, review_status, held, …; one row per reviewed lead). Both
   service-role only. This file mirrors the rule for TypeScript callers; the tests pin it to the SQL.
   Pure and edge-safe (no imports). Commission itself is NOT decided here. */

export const ATTRIBUTION_REVIEW_STATUSES = ['open', 'confirmed', 'not_credited'] as const;
export type AttributionReviewStatus = typeof ATTRIBUTION_REVIEW_STATUSES[number];

/** The statuses that HOLD a sale (no salesperson commission). Mirrors public.sale_attribution_held(). */
export const ATTRIBUTION_HELD_STATUSES: readonly AttributionReviewStatus[] = ['open', 'not_credited'];

/** Is this sale's attribution held? `null` / `undefined` = the lead has no review (not held). An unknown
 *  status string is treated as HELD — never pay on a value nobody recognises. */
export function isAttributionHeld(reviewStatus: string | null | undefined): boolean {
  if (reviewStatus === null || reviewStatus === undefined) return false;
  if (!(ATTRIBUTION_REVIEW_STATUSES as readonly string[]).includes(reviewStatus)) return true;
  return (ATTRIBUTION_HELD_STATUSES as readonly string[]).includes(reviewStatus);
}
