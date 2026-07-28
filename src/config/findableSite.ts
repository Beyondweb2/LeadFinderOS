import { slugifyBusinessName } from "@/lib/reportSlug";
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
/**
 * The name segment is COSMETIC and the ?lead= value is byte-identical to what it always was, so a
 * wrong, odd or absent name cannot change who a payment is attributed to. findable-site serves
 * /onboarding/ for any segment via a Pages 200 rewrite and never reads the segment at all — the
 * alternative (putting a code in the lead param itself) was declined because it would have put new
 * failure modes on the checkout path.
 *
 * No name → the bare /onboarding/?lead=<uuid> form, i.e. exactly the URL sent until now.
 * slugifyBusinessName is the SAME helper the report URLs use, so apostrophes, ampersands and emoji
 * are handled once rather than twice.
 */
export const onboardingUrl = (leadId: string, businessName?: string | null) => {
  const slug = slugifyBusinessName(businessName ?? '');
  // 'business' is slugifyBusinessName's fallback for an empty/emoji-only name — no point putting
  // that in a URL, so drop the segment entirely and fall back to the previous shape.
  const segment = businessName && slug !== 'business' ? `${slug}/` : '';
  return `${FINDABLE_SITE_ORIGIN}/onboarding/${segment}?lead=${leadId}`;
};

/** Same link without the scheme, for showing on screen where the https:// is just noise. */
export const onboardingUrlLabel = (leadId: string, businessName?: string | null) =>
  onboardingUrl(leadId, businessName).replace(/^https?:\/\//, "");
