/**
 * PUBLIC REPORT URL SHAPE — /a/<slugified-business-name>-<8 hex of the audit id>
 *
 * e.g. /a/purcell-accountancy-services-limited-e8d4a0b0
 *
 * The name is COSMETIC. Everything resolves on the 8-hex code, which has two consequences worth
 * knowing before you touch this:
 *
 *  1. A name-only URL cannot resolve. Before this shape existed, `business_reports.slug` was the
 *     bare slugified name and render-audit-report looked it up by exact string — so
 *     /a/dan-electrician served Dan Electrician's report to anyone who could guess a company name.
 *     67 reports were readable that way. Resolution now requires the code, so guessing a name gets
 *     you the "Report unavailable" page.
 *  2. Renaming a business does not break links already sent. The stored slug keeps the old name,
 *     but the code never changes, and the resolver matches on the code suffix — so the link in
 *     someone's WhatsApp thread from three months ago still opens.
 *
 * Full-UUID links (/a/<audit uuid>) remain valid and are resolved directly: all 64 pitch links ever
 * sent are that form, and they must never stop working.
 *
 * Shared between the SPA and the edge functions, imported edge-side as
 * "../../../src/lib/reportSlug.ts" — the same convention auditQuestionCounts.ts uses.
 */

/** Hex characters of the audit id used as the code. 8 → 4.29e9 values; see collision note below. */
export const AUDIT_CODE_LEN = 8;

/** business name → clean lowercase-hyphenated slug. Mirrors generate-report's slugify. */
export function slugifyBusinessName(name: string): string {
  return (name || '').toLowerCase().normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '') || 'business';
}

/**
 * The public slug for an audit. Deterministic from (name, auditId), so callers can build it without
 * a database round-trip — but note the RESOLVER matches only the code, so a caller whose name string
 * differs from the stored one still produces a working link.
 */
export function buildReportSlug(businessName: string, auditId: string): string {
  const code = (auditId || '').replace(/-/g, '').slice(0, AUDIT_CODE_LEN).toLowerCase();
  const base = slugifyBusinessName(businessName);
  return code ? `${base}-${code}` : base;
}

/**
 * The code from a slug, or null when there isn't one — which is exactly how a guessable bare-name
 * slug is rejected. Anchored to the END so a business whose name happens to contain 8 hex-ish
 * characters mid-string cannot be mistaken for a code.
 */
export function auditCodeFromSlug(slug: string): string | null {
  const m = /-([0-9a-f]{8})$/i.exec((slug || '').trim());
  return m ? m[1].toLowerCase() : null;
}

/* COLLISION — 8 hex is 16^8 = 4,294,967,296 values. At 70 audits the chance that ANY two share a
   code is n(n-1)/2N ≈ 5.6e-7; at 10,000 audits it is ≈ 1.2%. So it is not impossible at scale, which
   is why the resolver treats "more than one match" as UNRESOLVABLE and serves the unavailable page
   rather than picking one. Serving a stranger their competitor's report would be far worse than a
   dead link. If volume ever makes that a real nuisance, lengthen the code — old links keep working
   because the resolver matches a suffix, so a longer code is additive, not a migration. */
