/**
 * Origin that serves the public barber sites (the `/p/:slug` route).
 *
 * Points at the branded yoursites.uk domain so every "view your site" link uses
 * it instead of the LeadFinder app origin. This is the ONE value to change if the
 * public-site domain ever changes. Keeps the `/p/` path (the app route is
 * `/p/:slug`); if you later move to bare `yoursites.uk/<slug>`, change only the
 * helpers below (+ a Worker rewrite).
 */
import { bookingUrl, BOOKING_HOST } from "@/lib/subdomain";

export const PUBLIC_SITE_ORIGIN = "https://yoursites.uk";

/** Full public URL for a site by its slug (site_name) — e.g. for links/copy. */
export const publicSiteUrl = (slug: string) => `${PUBLIC_SITE_ORIGIN}/p/${slug}`;

/** Display label without the scheme — e.g. "yoursites.uk/p/<slug>". */
export const publicSiteLabel = (slug: string) =>
  `${PUBLIC_SITE_ORIGIN.replace(/^https?:\/\//, "")}/p/${slug}`;

/**
 * The unguessable, permanent link sent to the barber to view + claim their site
 * (the `/s/:token` route). Re-openable forever; only the claim is one-time.
 */
export const barberSiteUrl = (shareToken: string) => `${PUBLIC_SITE_ORIGIN}/s/${shareToken}`;

/**
 * Operator-only PREVIEW of the barber's /s/ link. Identical route + token, but
 * with ?preview=1 — which makes SiteByToken skip the `open` tracking event and
 * hide the claim splash. Use this for "view their site" buttons inside the CRM so
 * our own testing never inflates Opened. The barber NEVER receives this URL; the
 * plain barberSiteUrl (no param) is what they get and is unchanged.
 */
export const barberSitePreviewUrl = (shareToken: string) => `${barberSiteUrl(shareToken)}?preview=1`;

/**
 * Booking-aware live URL/label for a barber's OWN site link (dashboard, welcome,
 * settings, pickers). A booking_only site has NO marketing page — it lives at
 * bookmybarber.uk/<slug>, so every owner-facing "your site" link must point there,
 * never yoursites.uk/p/<slug>.
 */
export const liveSiteUrl = (slug: string, bookingOnly?: boolean | null) =>
  bookingOnly ? bookingUrl(slug) : publicSiteUrl(slug);
export const liveSiteLabel = (slug: string, bookingOnly?: boolean | null) =>
  bookingOnly ? `${BOOKING_HOST}/${slug}` : publicSiteLabel(slug);
