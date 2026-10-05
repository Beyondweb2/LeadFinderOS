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
   Pure and edge-safe (no imports). Commission itself is NOT decided here.
   Resolution and its audit trail: docs/pre-sales-certification/attribution-review-admin.md. */

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

/* ══ WHO A SALE'S REVENUE IS CREDITED TO, on a performance view (2026-10-05, attribution-review-admin) ══
   BUSINESS REVENUE ≠ SALESPERSON-ATTRIBUTED REVENUE. A payment under an open review is real money for the
   business, but no person's performance until Paul resolves the review — never the book owner's, never the
   current owner's, never the claimed seller's. NOT CREDITED stays business revenue and is nobody's, ever.
   CONFIRMED is the stamped seller's (the resolver stamps it on the lead and the ledger rows).

   The answer, in order:
     1. a review that HOLDS (open / not_credited / unknown status) → 'awaiting_attribution' or 'not_credited',
        whatever a row's seller says (the commission engine reads the hold the same way);
     2. a seller on the ledger row or the lead → that seller;
     3. no seller, but the lead's attribution WAS decided (sold_at set) → 'awaiting_attribution': the database
        held it without a seller, and the review row was not read — never handed to a fallback;
     4. no seller and never decided (older rows, before the stamp existed) → 'unstamped': the CALLER's
        historical fallback applies unchanged (the book owner on the admin table, the holder on a rep's own).
   One rule, used by the admin team table (adminMetrics), the rep performance fold (salesPerformance) and the
   Paid Clients list (fn paid-client-hub). Commission keeps its own engine (commission.ts). */
export type SaleCredit =
  | { kind: 'seller'; userId: string }
  | { kind: 'awaiting_attribution' }
  | { kind: 'not_credited' }
  | { kind: 'unstamped' };

export function saleCreditOf(x: {
  /** The payment row's seller snapshot (payment_ledger.sold_by_user_id), when the caller has one. */
  ledgerSeller?: string | null;
  /** outreach_leads.sold_by_user_id. */
  leadSeller?: string | null;
  /** outreach_leads.sold_at — set when attribution was decided, with or without a seller. */
  leadSoldAt?: string | null;
  /** The lead's review status (sale_attribution_holds.review_status). null/undefined = no review row known. */
  reviewStatus?: string | null;
}): SaleCredit {
  if (isAttributionHeld(x.reviewStatus)) return x.reviewStatus === 'not_credited' ? { kind: 'not_credited' } : { kind: 'awaiting_attribution' };
  const seller = x.ledgerSeller || x.leadSeller || null;
  if (seller) return { kind: 'seller', userId: seller };
  if (x.leadSoldAt) return { kind: 'awaiting_attribution' };
  return { kind: 'unstamped' };
}

/* ══ RESOLVING A REVIEW (admin only; public.resolve_sale_attribution_with_seller is the authority) ══════
   CONFIRM SELLER picks a person. Someone the frozen evidence names (public.sale_attribution_candidates) is an
   EVIDENCE confirmation; anyone else is an explicit ADMIN OVERRIDE and needs a written reason of at least
   this many characters (the SQL refuses shorter: override_reason_required). */
export const ATTRIBUTION_OVERRIDE_REASON_MIN = 10;
export const ATTRIBUTION_NOTE_MAX = 500;

/** Why a candidate is on the list — each is a fact in the review's frozen evidence. */
export type CandidateSource = 'signup_creator' | 'claimed_seller' | 'link_creator' | 'owner_at_payment';
export const CANDIDATE_SOURCE_LABEL: Record<CandidateSource, string> = {
  signup_creator: 'created the sign-up this client paid through',
  claimed_seller: 'claimed seller',
  link_creator: 'made a sign-up link for this client',
  owner_at_payment: 'owned the lead when it was paid',
};

export type ResolveCheck = { ok: true; basis: 'evidence' | 'admin_override' | null } | { ok: false; error: string };

/** The browser's copy of the server's checks, for the button state only — the SQL decides. */
export function checkResolution(input: {
  decision: 'confirmed' | 'not_credited'; sellerId: string | null; candidateIds: readonly string[];
  overrideReason: string; note: string;
}): ResolveCheck {
  if (input.note.trim().length > ATTRIBUTION_NOTE_MAX || input.overrideReason.trim().length > ATTRIBUTION_NOTE_MAX) return { ok: false, error: 'too_long' };
  if (input.decision === 'not_credited') return { ok: true, basis: null };
  if (!input.sellerId) return { ok: false, error: 'no_seller' };
  if (input.candidateIds.includes(input.sellerId)) return { ok: true, basis: 'evidence' };
  if (input.overrideReason.trim().length < ATTRIBUTION_OVERRIDE_REASON_MIN) return { ok: false, error: 'override_reason_required' };
  return { ok: true, basis: 'admin_override' };
}
