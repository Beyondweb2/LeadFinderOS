/**
 * Phone-based barber auth via a SYNTHETIC EMAIL (Phase 1).
 *
 * Supabase phone auth needs the Phone provider enabled, which needs Twilio creds
 * we don't have yet. So the barber only ever enters a PHONE, and under the hood we
 * derive a deterministic synthetic email from it and run account creation + login
 * through the email path (which already works via admin.createUser). The barber
 * never sees this email.
 *
 * ⚠️ The normalisation here MUST stay byte-identical to the copy in
 * supabase/functions/claim-site/index.ts (and mirrors lib/leadUtils
 * formatPhoneForWhatsApp), or a barber created on one side can't log in on the
 * other. Change both together.
 *
 * ── MIGRATION NOTE ──────────────────────────────────────────────────────────
 * These are stop-gap accounts keyed by `<e164digits>@claimed.yoursites.uk`. Once
 * the Move37 Twilio is set up and the Supabase Phone provider is enabled, migrate
 * each account's identity to its REAL phone number (update auth.users.phone +
 * phone_confirmed_at, then drop the synthetic email) so barbers can use native
 * phone auth. Do NOT build that migration now — this comment is the breadcrumb.
 */

export const SYNTHETIC_EMAIL_DOMAIN = "claimed.yoursites.uk";

/** Phone → E.164 digits (no `+`). UK-default: a leading 0 becomes 44. */
export function toE164Digits(phone: string): string {
  let cleaned = (phone || "").replace(/[^\d+]/g, "");
  cleaned = cleaned.replace(/^\+/, "");
  if (cleaned.startsWith("0")) cleaned = "44" + cleaned.slice(1);
  return cleaned;
}

/** Loose validity gate — enough digits to be a real number (UK mobile = 12). */
export function isLikelyPhone(phone: string): boolean {
  return toE164Digits(phone).length >= 10;
}

/** The hidden auth identifier for a given phone. Never shown to the barber. */
export function phoneToSyntheticEmail(phone: string): string {
  return `${toE164Digits(phone)}@${SYNTHETIC_EMAIL_DOMAIN}`;
}
