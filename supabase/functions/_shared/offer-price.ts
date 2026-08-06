/* ============================================================
   WHAT THIS CUSTOMER PAYS — one function, server-side, used by BOTH the display and the charge.

   ⛔ THE CLIENT NEVER SENDS A PRICE, AND THERE IS NO URL PARAMETER. Anything the browser can set,
   anybody can set. The founder price is derived here from data the customer cannot fabricate.

   ⛔ THE ELIGIBILITY RULE IS "THIS LEAD HAS A COMPLETED AUDIT AND HAS NOT PAID". You cannot fake
   having an audit. It also happens to be exactly the distinction we want, for free: a prospect
   arriving from their own report HAS an audit by definition, and somebody landing on findable.live
   cold does not. 121 of the leads on file qualify today.

   ⛔ THE SAME FUNCTION FEEDS THE PLAN CARD AND THE STRIPE SESSION. That is worth more than the
   routing it was built for: display and charge cannot diverge, because there is only one answer.
   Before this, findable-site's own SETUP_PRICE_GBP displayed the price and findable-checkout charged
   FINDABLE_SETUP_PRICE_GBP — two constants in two repos, a mirror that has already drifted once.

   ⚠️ FAILING CLOSED MEANS FULL PRICE. Every error path here returns the standard price. A lookup
   that throws must never hand out a discount, and a customer charged the price the site showed them
   is never the emergency — the reverse is.
   ============================================================ */
import { FINDABLE_SETUP_PRICE_GBP } from "../../../src/lib/findableOffer.ts";

/** ⚠️ MIRRORS FOUNDER_OFFER_LIVE and FOUNDER_OFFER_PRICE_LABEL in src/lib/founderOffer.ts. Stated
 *  here rather than imported so this file stays inside the edge bundle's dependency budget, exactly
 *  as create-ai-audit states MARKET_MAX_QUESTION_COUNT. Change one, change the other — and the
 *  report's label is only what it SAYS, this is what it CHARGES. */
export const FOUNDER_PRICE_GBP = 19.99;
export const FOUNDER_OFFER_LIVE = true;

export interface OfferPrice {
  /** What Stripe will be told to charge, in pounds. */
  gbp: number;
  /** What to show. Rendered by the flow, never computed there. */
  label: string;
  /** True when the founder price applies to this lead. */
  isFounder: boolean;
  /** Why, in one word, for the log and for a human reading a refusal. */
  reason: "founder_eligible" | "offer_closed" | "no_lead" | "already_paid" | "no_completed_audit" | "lookup_failed";
}

const full = (reason: OfferPrice["reason"]): OfferPrice => ({
  gbp: FINDABLE_SETUP_PRICE_GBP,
  label: `£${FINDABLE_SETUP_PRICE_GBP}`,
  isFounder: false,
  reason,
});

/* A minimal structural type. This file is imported by two edge functions and must not drag in
   supabase-js generics, which are what put three pre-existing errors in generate-barber-site. */
interface Queryable {
  from: (t: string) => {
    select: (c: string) => {
      eq: (c: string, v: unknown) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null }>;
        limit: (n: number) => Promise<{ data: Record<string, unknown>[] | null }>;
        in: (c: string, v: unknown[]) => { limit: (n: number) => Promise<{ data: Record<string, unknown>[] | null }> };
      };
    };
  };
}

/**
 * The price for this lead. Both the plan card and the Stripe session call this.
 *
 * ⛔ Never pass a price in from a caller. The signature takes a lead id and a database handle and
 * nothing else, so there is no parameter through which a discount could be requested.
 */
export async function offerPriceForLead(service: Queryable, leadId: string | null): Promise<OfferPrice> {
  if (!FOUNDER_OFFER_LIVE) return full("offer_closed");
  if (!leadId) return full("no_lead");

  try {
    /* 1. NOT ALREADY A CUSTOMER. Same definition of paid the rest of the app uses (CLAUDE.md §6). */
    const { data: lead } = await service.from("outreach_leads").select("amount_paid").eq("id", leadId).maybeSingle();
    if (!lead) return full("no_lead");
    if ((Number(lead.amount_paid) || 0) > 0) return full("already_paid");

    /* 2. HAS A COMPLETED AUDIT. The non-forgeable half: the offer lives at the bottom of a report,
       and a report only exists because an audit ran. `status = complete` and not just an audit row,
       so a queued audit somebody triggered a second ago does not unlock the price. */
    const { data: audits } = await service.from("ai_audits").select("id").eq("lead_id", leadId).limit(50);
    const auditIds = (audits ?? []).map((a) => String(a.id)).filter(Boolean);
    if (auditIds.length === 0) return full("no_completed_audit");

    const { data: runs } = await service.from("ai_audit_runs").select("id").eq("status", "complete").in("audit_id", auditIds).limit(1);
    if (!runs || runs.length === 0) return full("no_completed_audit");

    return { gbp: FOUNDER_PRICE_GBP, label: `£${FOUNDER_PRICE_GBP}`, isFounder: true, reason: "founder_eligible" };
  } catch (e) {
    /* ⛔ FAIL CLOSED. A lookup that throws charges the standard price. Anything else would let a
       transient database error hand out a 80% discount, silently, to everyone. */
    console.warn(`[offer-price] lookup failed for lead ${leadId}, charging full price:`, e instanceof Error ? e.message : e);
    return full("lookup_failed");
  }
}
