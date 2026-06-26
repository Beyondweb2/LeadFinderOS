// Canonical rules for barber custom subdomains (<label>.yoursites.uk).
//
// IMPORTANT: the Cloudflare Pages middleware (functions/_middleware.ts) and the
// connect-subdomain edge function (supabase/functions/connect-subdomain) keep
// their OWN copies of RESERVED_SUBDOMAINS + the label regex (neither can import
// from src/). If you change the list or the rules here, update those two too.

export const ROOT_DOMAIN = "yoursites.uk";

// Labels that MUST keep serving the operator app / infra — never a barber site.
export const RESERVED_SUBDOMAINS = new Set<string>([
  "www", "app", "api", "admin", "claim", "auth", "mail", "ftp",
  "barber", "barbers", "find-leads", "outreach", "dashboard", "settings",
  "login", "signup", "register", "account", "billing", "support", "help",
  "status", "blog", "docs", "dev", "staging", "test", "demo", "root",
  "ns1", "ns2", "smtp", "webmail", "email", "pages", "cdn", "assets",
  "static", "img", "images", "cloudflare", "yoursites", "leadfinder",
  "leadfinderos", "guide", "start", "terms", "feedback", "s", "p",
]);

// DNS label: 3–63 chars, lowercase a–z 0–9 and hyphens, no leading/trailing hyphen.
export const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/;

export function validateSubdomain(raw: string): { ok: boolean; error?: string } {
  const s = (raw || "").trim().toLowerCase();
  if (s.length < 3) return { ok: false, error: "At least 3 characters." };
  if (s.length > 63) return { ok: false, error: "63 characters max." };
  if (!SUBDOMAIN_RE.test(s)) return { ok: false, error: "Lowercase letters, numbers and hyphens only (not at the start or end)." };
  if (RESERVED_SUBDOMAINS.has(s)) return { ok: false, error: "That name is reserved — pick another." };
  return { ok: true };
}

/**
 * The barber-subdomain label for a host, or null when the request should keep
 * hitting the operator app: the apex (yoursites.uk), a reserved label, a
 * non-yoursites.uk host (*.pages.dev, localhost), or anything malformed/multi-level.
 */
export function getBarberSubdomainLabel(host: string): string | null {
  const h = (host || "").toLowerCase().split(":")[0].trim();
  const suffix = `.${ROOT_DOMAIN}`;
  if (!h.endsWith(suffix)) return null;          // apex / pages.dev / localhost → operator
  const label = h.slice(0, -suffix.length);
  if (!label || label.includes(".")) return null; // multi-level (a.b.yoursites.uk) → operator
  if (RESERVED_SUBDOMAINS.has(label)) return null; // reserved → operator
  if (!SUBDOMAIN_RE.test(label)) return null;      // malformed → operator
  return label;
}

/** Full https URL for a barber's subdomain. */
export function subdomainUrl(label: string): string {
  return `https://${label}.${ROOT_DOMAIN}`;
}

// ── Booking-only pages (bookmybarber.uk) ────────────────────────────────────
// A separate domain attached to the same Pages project. bookmybarber.uk/<slug>
// renders ONLY the booking flow (no marketing site). KEEP host string in sync
// with functions/_middleware.ts.
export const BOOKING_HOST = "bookmybarber.uk";

/** True when the request host is the booking domain (apex or www). */
export function isBookingHost(host: string): boolean {
  const h = (host || "").toLowerCase().split(":")[0].trim();
  return h === BOOKING_HOST || h === `www.${BOOKING_HOST}`;
}

/** The booking page URL for a slug. */
export function bookingUrl(slug: string): string {
  return `https://${BOOKING_HOST}/${slug}`;
}
