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

/* ─── SHORT PUBLIC CODE — /r/<code> ──────────────────────────────────────────────────────────────
   The SHORT report link a prospect actually receives: findable.live/r/k4m2p9. It resolves on
   `ai_audits.short_code` (a random, unique code assigned by a DB trigger on insert, backfilled onto
   every existing audit), NOT on the audit id or the business name, so it is unguessable — these
   reports are public and carry a business's competitor data, so a sequential or name-derived code
   would let one prospect read another's report.

   ⛔ THE ALPHABET AND LENGTH MUST MATCH THE DATABASE GENERATOR CHARACTER FOR CHARACTER
   (gen_audit_short_code() in the migration; scripts/report-short-code.test.ts pins both sides). It
   excludes 0/O/1/l/i so a code read aloud, written down or squinted at cannot be mistyped. 31 chars,
   6 long → 31^6 ≈ 8.9e8 values; the unique index is the hard backstop, the trigger retries on the
   astronomically rare in-generator collision.

   The UUID and legacy name+8-hex slug forms both keep resolving forever (render-audit-report), so
   every link already sent stays live. A short code is exactly 6 alphabet characters with no hyphen,
   so it can never be confused with a UUID or a `name-<8hex>` slug. */
export const SHORT_CODE_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
export const SHORT_CODE_LEN = 6;
const SHORT_CODE_RE = /^[23456789abcdefghjkmnpqrstuvwxyz]{6}$/i;

/** True when the whole string is a short code (6 unambiguous chars, no hyphen). Case-insensitive;
 *  codes are stored lowercase, so callers lowercase before the DB lookup. */
export function isShortCode(s: string): boolean {
  return SHORT_CODE_RE.test((s || '').trim());
}

/* ⛔ findable.live, the one report origin (scripts/report-origin.test.ts pins it). Hardcoded rather
   than imported from findableOffer so this leaf stays inside its 6-function edge closure instead of
   dragging findableOffer's 12. */
export const REPORT_SHORT_ORIGIN = 'https://findable.live';

/** The short public report URL for a code. */
export function shortReportUrl(code: string): string {
  return `${REPORT_SHORT_ORIGIN}/r/${code}`;
}

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
