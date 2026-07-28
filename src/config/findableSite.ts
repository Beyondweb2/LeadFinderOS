/**
 * Origin that serves the FINDABLE sign-up flow (the /onboarding/ route on findable-site).
 *
 * This is the ONE value in the SPA to change when the domain moves off pages.dev — same
 * convention as PUBLIC_SITE_ORIGIN in publicSite.ts.
 *
 * ⚠️ THERE IS A SECOND PLACE. The edge functions read the same origin from the Supabase secret
 * FINDABLE_SITE_ORIGIN (see _shared/onboarding-followup.ts, which builds the identical URL for the
 * onboarding_followup WhatsApp template). The SPA cannot read Supabase secrets — they are
 * server-side only and Vite inlines its own env at build time — so the value genuinely has to
 * exist in both places. When the real domain lands, change BOTH:
 *   1. this constant, and
 *   2. npx supabase secrets set FINDABLE_SITE_ORIGIN=https://<new-domain>
 * A mismatch is survivable rather than dangerous: the two produce links to different hosts, so the
 * symptom is a link that 404s, not a payment attached to the wrong lead.
 *
 * No trailing slash — the helpers below add the path.
 */
export const FINDABLE_SITE_ORIGIN = "https://findable-site.pages.dev";

/**
 * The sign-up link for ONE lead. `?lead=<uuid>` is what makes the flow recognise them: it drives
 * the prefill, attaches the onboarding row to the lead, and is what lets a paid signup get a
 * baseline at all. A typo'd or missing id turns a known prospect into an anonymous one — the flow
 * still works but the guarantee cannot be measured, which is why this is a button and not a
 * hand-typed URL.
 *
 * Trailing slash on /onboarding/ matches the built site's canonical path (it 308-redirects
 * /onboarding), so the prospect does not eat a redirect on the most important link in the product.
 */
export const onboardingUrl = (leadId: string) => `${FINDABLE_SITE_ORIGIN}/onboarding/?lead=${leadId}`;

/** Same link without the scheme, for showing on screen where the https:// is just noise. */
export const onboardingUrlLabel = (leadId: string) =>
  onboardingUrl(leadId).replace(/^https?:\/\//, "");
