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

   🔴 ONE PROSPECT WAS QUOTED SOMETHING ELSE, AND IT IS A DIFFERENT PROMISE AS WELL AS A DIFFERENT
   PRICE. RG Locksmiths cambs (lead 800425fe-00cc-46bf-a281-df57de6f8d4e, status `interested`, audit
   9f78ce36) was quoted £49.99 on a SEPARATE Stripe payment link carrying the OLD OUTCOME-based
   guarantee. That lead has a completed audit and has not paid, so it is eligible here: going through
   the flow today he would be charged £19.99 against the WORK-based guarantee.
   Cheaper for him, so there is no harm in the price. The promise is the part worth knowing: the old
   wording guaranteed an outcome and the current one guarantees the audit, the work and the
   re-measurement. If he ever refers back to what he was sold, those are not the same document.
   Recorded here rather than left to be discovered, because this is the file that decides what he
   pays and nothing else in the system knows the old quote existed.
   ============================================================ */
import { FINDABLE_SETUP_PRICE_GBP } from "../../../src/lib/findableOffer.ts";

/** ⚠️ MIRRORS FOUNDER_OFFER_LIVE and FOUNDER_OFFER_PRICE_LABEL in src/lib/founderOffer.ts. Stated
 *  here rather than imported so this file stays inside the edge bundle's dependency budget, exactly
 *  as create-ai-audit states MARKET_MAX_QUESTION_COUNT. Change one, change the other — and the
 *  report's label is only what it SAYS, this is what it CHARGES. */
export const FOUNDER_PRICE_GBP = 49.99;
export const FOUNDER_OFFER_LIVE = true;

export interface OfferPrice {
  /** What Stripe will be told to charge, in pounds. */
  gbp: number;
  /** What to show. Rendered by the flow, never computed there. */
  label: string;
  /** True when the founder price applies to this lead. */
  isFounder: boolean;
  /** Why, in one word, for the log and for a human reading a refusal. */
  reason: "founder_eligible" | "offer_closed" | "no_lead" | "already_paid" | "no_completed_audit"
    | "audit_never_ran" | "lookup_failed";
}

const full = (reason: OfferPrice["reason"]): OfferPrice => ({
  gbp: FINDABLE_SETUP_PRICE_GBP,
  label: `£${FINDABLE_SETUP_PRICE_GBP}`,
  isFounder: false,
  reason,
});

/* A minimal structural type. This file is imported by two edge functions and must not drag in
   supabase-js generics, which are what put three pre-existing errors in generate-barber-site.
   Chainable and recursive, which is what PostgREST's builder actually is — the previous shape
   hardcoded one exact call order and had to be widened the moment a second query shape was needed.
   ⚠️ It is also what makes this function testable: a plain object satisfies it, so the REAL
   function can be driven against fake rows rather than a restatement of it. */
interface Filterable {
  eq: (c: string, v: unknown) => Filterable;
  in: (c: string, v: unknown[]) => Filterable;
  limit: (n: number) => Promise<{ data: Record<string, unknown>[] | null }>;
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null }>;
}
export interface Queryable {
  from: (t: string) => { select: (c: string) => Filterable };
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

    /* 2. HAS AN AUDIT THAT PRODUCED ANSWERS. The non-forgeable half: the offer lives at the bottom
       of a report, and a report only exists because an audit ran. Not merely an audit ROW, so a
       queued audit somebody triggered a second ago does not unlock the price.

       ⛔ 'capped' COUNTS — BUT ONLY WHEN IT ANSWERED SOMETHING, AND THE DIFFERENCE IS THE WHOLE
       POINT. This used to accept `status = complete` alone, which put it out of step with every
       other reader: resolveAuditReplyVars, bulk-jobs' triage, useInbox and the audit pills all treat
       a capped run as usable, because a capped run normally has real answers and just fewer than
       asked for. Ten leads sat with a readable report and a £99 plan card because of it — two
       surfaces disagreeing about one lead.
       ⚠️ BUT ALIGNING ON THE TOKEN WOULD HAVE BEEN WRONG. 'capped' spans two different realities,
       and on 2026-08-08 those same ten leads were the OTHER one: capped with ZERO questions answered,
       because the queue was full rather than because money ran out. There is no report at the end of
       that, so the premise of the offer — you have seen what AI says about you — is simply false.
       Accepting the token blindly would hand the founder price to someone who has seen nothing.
       So the rule is what the rest of the system MEANS by capped-is-usable, not what it says:
       complete, OR capped with at least one answered question. Same absent-value discipline as
       everywhere else — assert on the state you want, never on the label that usually implies it. */
    const { data: audits } = await service.from("ai_audits").select("id").eq("lead_id", leadId).limit(50);
    const auditIds = (audits ?? []).map((a) => String(a.id)).filter(Boolean);
    if (auditIds.length === 0) return full("no_completed_audit");

    const { data: runRows } = await service.from("ai_audit_runs")
      .select("id, status").in("audit_id", auditIds).limit(100);
    const runs = runRows ?? [];
    const founder: OfferPrice = {
      gbp: FOUNDER_PRICE_GBP, label: `£${FOUNDER_PRICE_GBP}`, isFounder: true, reason: "founder_eligible",
    };

    /* The fast path, and the one that carries almost everything: a complete run needs no checking. */
    if (runs.some((r) => r.status === "complete")) return founder;

    const cappedIds = runs.filter((r) => r.status === "capped").map((r) => String(r.id)).filter(Boolean);
    if (cappedIds.length === 0) return full("no_completed_audit");

    /* One extra query, and only for a lead whose best run is capped — rare. A single answered
       question is enough: that is a report with something in it, which is all the offer claims. */
    const { data: qRows } = await service.from("ai_audit_queue")
      .select("run_id, status").in("run_id", cappedIds).limit(500);
    if ((qRows ?? []).some((q) => q.status === "done")) return founder;

    /* Capped and empty. Named separately from no_completed_audit so the log says which it was —
       "there is no audit" and "the audit never got to run" send you to different places. */
    return full("audit_never_ran");
  } catch (e) {
    /* ⛔ FAIL CLOSED. A lookup that throws charges the standard price. Anything else would let a
       transient database error hand out a 80% discount, silently, to everyone. */
    console.warn(`[offer-price] lookup failed for lead ${leadId}, charging full price:`, e instanceof Error ? e.message : e);
    return full("lookup_failed");
  }
}
