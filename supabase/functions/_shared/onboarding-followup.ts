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
   findable-site lives at https://findable.live (its raw pages.dev domain still serves, for links
   sent before the move), and the base is read from the environment. Deliberately NO hardcoded
   default: a wrong-but-plausible fallback would send working-looking links to the wrong host,
   which is precisely the silent misfire this task exists to remove. Unset = refuse, with a reason
   that names the variable.
   ⚠️ THE SPA CARRIES ITS OWN COPY (src/config/findableSite.ts — Vite cannot read Supabase
   secrets). The two drifted once — secret moved 2026-08-03, constant left on pages.dev — and every
   Inbox-copied link went out unbranded for a fortnight. check-cross-repo-sync.mjs now locks the
   constant to findable-site's SITE_URL; when the domain ever moves again, change the secret AND
   run that script.

   FINDABLE_SITE_ORIGIN is preferred; FINDABLE_ALLOWED_ORIGINS is accepted as a second source.

   🔴 AND THAT FALLBACK PUT A PREVIEW DOMAIN IN FRONT OF PROSPECTS. Measured 2026-09-03 across all
   47 onboarding links ever sent: 27 used `findable-site.pages.dev` and every single one of them was
   SERVER-BUILT (re_engage x19, onboarding_followup x3, plus 5 others); the 20 that read
   `findable.live` were all `type=text`, typed by the operator by hand. The most recent server-built
   link, a re_engage to a real prospect on 2026-08-31, went out on pages.dev.

   ⛔ THE CAUSE IS A CATEGORY ERROR, NOT A TYPO. FINDABLE_ALLOWED_ORIGINS is findable-checkout's
   CORS ALLOWLIST - it answers "who may call us", and it legitimately contains preview and staging
   hosts. Taking its FIRST ENTRY as "where the site lives" reads an answer out of a list that was
   never asked that question, and the order of a CORS allowlist is nobody's deliberate decision.
   The comment that used to sit here called that entry "canonical", which is exactly the belief that
   cost us this.

   ⛔ SO THE FALLBACK NOW SKIPS HOSTS THAT CANNOT BE A PUBLIC HOME (see NON_CANONICAL_HOST) and
   REFUSES rather than guessing when nothing in the list qualifies. A refusal is loud - the senders
   already report "The onboarding link base is not configured" and decline to send - whereas a
   plausible-looking preview URL is silent and reaches a customer. Absence of a known-good origin
   must never resolve to whatever happens to be first. */
export const ORIGIN_ENV = "FINDABLE_SITE_ORIGIN";
export const ORIGIN_ENV_FALLBACK = "FINDABLE_ALLOWED_ORIGINS";

/** Hosts that can never be the product's public home, so they are never taken from the CORS
 *  allowlist. Deliberately narrow: a Cloudflare Pages preview (the one that actually shipped),
 *  local development, and Supabase's own function host. Anything else in the list is trusted -
 *  this is a guard against a known accident, not an attempt to validate a domain. */
const NON_CANONICAL_HOST = /(^|\.)pages\.dev$|(^|\.)workers\.dev$|(^|\.)supabase\.co$|^localhost(:\d+)?$|^127\.0\.0\.1(:\d+)?$/i;

/** True for an absolute http(s) origin whose host could be a real public home. */
function usableOrigin(raw: string): string | null {
  const origin = raw.trim().replace(/\/+$/, "");
  // Must be an absolute http(s) origin: a bare host would produce a relative link in WhatsApp,
  // which is not clickable and not fixable after the fact.
  if (!/^https?:\/\/[^\s/]+$/i.test(origin)) return null;
  const host = origin.replace(/^https?:\/\//i, "");
  if (NON_CANONICAL_HOST.test(host)) return null;
  return origin;
}

/** The configured site origin, with any trailing slashes removed so joining is unambiguous.
 *  null when nothing configured can be a public home - see the note above. */
export function resolveSiteOrigin(): string | null {
  /* ⚠️ THE PRIMARY IS TRUSTED AS SET, INCLUDING ITS HOST. If an operator deliberately points
     FINDABLE_SITE_ORIGIN at a preview to test something, that is a decision, and overriding it
     would make the variable a lie. The host filter exists for the list we INFER from. */
  const primary = (Deno.env.get(ORIGIN_ENV) ?? "").trim().replace(/\/+$/, "");
  if (primary) return /^https?:\/\/[^\s/]+$/i.test(primary) ? primary : null;
  /* The fallback is a CORS allowlist, so take the first entry that could be a public home rather
     than the first entry full stop. Nothing qualifying → null, and the callers refuse to send. */
  for (const part of (Deno.env.get(ORIGIN_ENV_FALLBACK) ?? "").split(",")) {
    const ok = usableOrigin(part);
    if (ok) return ok;
  }
  return null;
}

/** The onboarding link for a lead. Kept separate so the URL shape lives in exactly one place.
 *  businessName is TAKEN AS AN ARGUMENT, matching src/config/findableSite.ts and findable-checkout.
 *  It was previously read from a free variable that does not exist in this scope, which made every
 *  call throw ReferenceError and stopped onboarding_followup sending entirely. */
export function onboardingUrl(origin: string, leadId: string, businessName?: string | null): string {
  // Trailing slash on /onboarding/ matches the built site's canonical path (it 308-redirects
  // /onboarding), so the payer does not eat a redirect on the most important link in the product.
  /* Cosmetic name segment; the ?lead= value is unchanged, and findable-site serves /onboarding/ for
     any segment via a Pages rewrite without reading it. Same slugifier as the report URLs. An empty
     or emoji-only name falls back to the bare /onboarding/?lead= form rather than a "business" slug. */
  const name = (businessName ?? "").trim();
  const slug = slugifyBusinessName(name);
  const segment = name && slug !== "business" ? `${slug}/` : "";
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
      reason: `The onboarding link base is not configured. Set ${ORIGIN_ENV} (https://findable.live, no trailing slash).`,
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
     a guarantee whose evidence is the four-week re-measurement has been sold with nothing to
     measure it against, and that only surfaces at week 8, in front of the customer.

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

  return { ok: true, business, url: onboardingUrl(origin, id, business) };
}
