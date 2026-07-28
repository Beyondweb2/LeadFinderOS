import { slugifyBusinessName } from "../../../src/lib/reportSlug.ts";
// Per-lead resolution of the onboarding_followup template's variables — the SINGLE source used by
// any sender, mirroring _shared/audit-reply.ts's contract exactly:
//   {{1}} = the lead's business name
//   {{2}} = that lead's onboarding URL, https://<origin>/onboarding/?lead=<leadId>
//
// Returns { ok:false, reason } rather than throwing, and NEVER returns a partial. A follow-up whose
// link is missing or wrong is worse than one that does not go out: the whole message is a pointer to
// that URL, so a broken one spends the warm lead for nothing.

/* THE ORIGIN IS CONFIGURATION, NOT CODE.
   findable-site currently lives on a pages.dev subdomain and moves to the real domain shortly, so
   the base is read from the environment. Deliberately NO hardcoded default: a wrong-but-plausible
   fallback would send working-looking links to the wrong host, which is precisely the silent
   misfire this task exists to remove. Unset = refuse, with a reason that names the variable.

   FINDABLE_SITE_ORIGIN is preferred; FINDABLE_ALLOWED_ORIGINS (already read by findable-checkout for
   its Stripe return URLs, first entry canonical) is accepted as a second source so the two cannot
   disagree about where the site lives once it is set. */
export const ORIGIN_ENV = "FINDABLE_SITE_ORIGIN";
export const ORIGIN_ENV_FALLBACK = "FINDABLE_ALLOWED_ORIGINS";

/** The configured site origin, with any trailing slashes removed so joining is unambiguous.
 *  null when neither variable is set or the value is not an http(s) origin. */
export function resolveSiteOrigin(): string | null {
  const raw = (Deno.env.get(ORIGIN_ENV) ?? "").trim() ||
    (Deno.env.get(ORIGIN_ENV_FALLBACK) ?? "").split(",")[0].trim();
  if (!raw) return null;
  const origin = raw.replace(/\/+$/, "");
  // Must be an absolute http(s) origin: a bare host would produce a relative link in WhatsApp,
  // which is not clickable and not fixable after the fact.
  if (!/^https?:\/\/[^\s/]+$/i.test(origin)) return null;
  return origin;
}

/** The onboarding link for a lead. Kept separate so the URL shape lives in exactly one place. */
export function onboardingUrl(origin: string, leadId: string): string {
  // Trailing slash on /onboarding/ matches the built site's canonical path (it 308-redirects
  // /onboarding), so the payer does not eat a redirect on the most important link in the product.
  /* Cosmetic name segment; the ?lead= value is unchanged, and findable-site serves /onboarding/ for
     any segment via a Pages rewrite without reading it. Same slugifier as the report URLs. An empty
     or emoji-only name falls back to the bare /onboarding/?lead= form rather than a "business" slug. */
  const slug = slugifyBusinessName(business);
  const segment = business && slug !== "business" ? `${slug}/` : "";
  return `${origin}/onboarding/${segment}?lead=${leadId}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type OnboardingFollowupVars =
  | { ok: true; business: string; url: string }
  | { ok: false; reason: string };

/**
 * Resolve onboarding_followup's 2 vars for a lead, STRICTLY from that lead's own row. Never throws.
 * Refuses when the lead id is missing/malformed, the lead does not exist, it has no business name,
 * it is already a paying client, or the site origin is not configured.
 */
// deno-lint-ignore no-explicit-any
export async function resolveOnboardingFollowupVars(service: any, leadId: string | null): Promise<OnboardingFollowupVars> {
  const id = (leadId ?? "").trim();
  if (!id || !UUID_RE.test(id)) {
    return { ok: false, reason: "No lead on this conversation — the follow-up link is built from the lead id." };
  }

  const origin = resolveSiteOrigin();
  if (!origin) {
    return {
      ok: false,
      reason: `The onboarding link base is not configured. Set ${ORIGIN_ENV} (e.g. https://findable-site.pages.dev, no trailing slash).`,
    };
  }

  const { data: lead, error } = await service
    .from("outreach_leads")
    .select("id, business_name, status, amount_paid, category, search_keyword")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, reason: `Could not read that lead: ${error.message}` };
  if (!lead) return { ok: false, reason: "That lead no longer exists." };

  const business = ((lead.business_name as string) ?? "").trim();
  // {{1}} is a REQUIRED Meta variable. An empty parameter is rejected at send time, and "your
  // business" in a follow-up to a named prospect reads like a mailmerge failure — refuse instead.
  if (!business) return { ok: false, reason: "That lead has no business name, which is {{1}} of the template." };

  // Pointing an existing client at a payment flow they have already completed. Mirrors the
  // already_client guard the checkout and onboarding endpoints apply.
  const PAID_OR_BEYOND = new Set(["payment_received", "in_delivery", "completed"]);
  if (PAID_OR_BEYOND.has((lead.status as string) ?? "") || (((lead.amount_paid as number) ?? 0) > 0)) {
    return { ok: false, reason: "That lead has already paid — the onboarding follow-up would send them back to checkout." };
  }

  /* NO TRADE, NO SEND — the worst failure in the funnel, so it is refused rather than warned about.
     This template's whole job is to walk someone into paying. If they pay without a trade on the
     lead, startPaidBaseline returns skipped:"no_business_type" and no baseline is ever created — so
     an 8-week money-back guarantee has been sold with nothing to measure it against, and that only
     surfaces at week 8, in front of the customer.

     The expression MIRRORS audit-baseline.ts's own bizType line exactly:
       ((lead.category) || (lead.search_keyword) || "").trim()
     deliberately, not something equivalent-looking. Nominally the trade is `category`, but that
     column has never once been populated in 628 leads, so a check on `category` alone would pass
     nothing and a check on the wrong field would refuse sends the baseline would actually have
     handled. If the baseline's expression ever changes, this must change with it.

     NOT inferred from the business name. "Grays Plumbing and Heating" is obviously a plumber to a
     human, but guessing here would measure the guarantee against searches the customer never chose,
     which is a worse outcome than a refusal an operator can fix in ten seconds. */
  const bizType = ((lead.category as string) || (lead.search_keyword as string) || "").trim();
  if (!bizType) {
    return {
      ok: false,
      reason: "That lead has no trade stored, so no baseline could run if they paid — add the trade on the lead and try again.",
    };
  }

  return { ok: true, business, url: onboardingUrl(origin, id) };
}
