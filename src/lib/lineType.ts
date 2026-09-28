import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max';
import type { Country } from '@/types/outreach';

/**
 * Offline (free, no network) line-type classification — the Tier-1 WhatsApp-
 * capability gate. Uses libphonenumber-js MAX metadata (needed for getType()).
 *
 * IMPORTANT: this is MIRRORED by the edge copy at
 * supabase/functions/_shared/line-type.ts — keep the two behaviourally identical
 * (same eligibility rule, same country map). Client and edge can't share a module
 * (npm vs esm.sh imports), same as toWhatsAppNumber / normalizeWaNumber.
 *
 * We only classify the carrier line type; we do NOT probe WhatsApp itself. A mobile
 * is the proxy for "WhatsApp-capable". We block ONLY when we're confident the number
 * is NOT a normal mobile (landline / VoIP / toll-free / etc.). Anything we can't
 * parse or can't type stays ELIGIBLE — so no real mobile is ever wrongly blocked and
 * existing send behaviour for mobiles is unchanged.
 */

export type LineType = 'mobile' | 'landline' | 'voip' | 'unknown';

export interface LineTypeResult {
  lineType: LineType;
  /** true = may be queued for WhatsApp; false = confidently non-mobile, block it. */
  whatsappEligible: boolean;
}

/** Lead `country` enum → ISO-3166 alpha-2 for libphonenumber. Mirrors the map in
 *  supabase/functions/_shared/line-type.ts. */
const COUNTRY_TO_ISO: Record<string, string> = {
  UK: 'GB', Australia: 'AU', USA: 'US', Canada: 'CA', Germany: 'DE', France: 'FR',
  Spain: 'ES', Italy: 'IT', Netherlands: 'NL', Belgium: 'BE', Ireland: 'IE',
  NewZealand: 'NZ', SouthAfrica: 'ZA', India: 'IN', Singapore: 'SG', UAE: 'AE',
  Brazil: 'BR', Mexico: 'MX', Japan: 'JP', Sweden: 'SE',
};

export function classifyLineType(
  phone: string | null | undefined,
  country?: Country | string | null,
): LineTypeResult {
  const raw = (phone ?? '').trim();
  // No number at all → nothing to classify; leave it eligible so the existing
  // null-phone / bad_number handling downstream decides, not this gate.
  if (!raw) return { lineType: 'unknown', whatsappEligible: true };

  const iso = country ? (COUNTRY_TO_ISO[country] as CountryCode | undefined) : undefined;
  // Default to GB when no country is known (this is a UK-first product, and matches
  // toWhatsAppNumber's UK-default) so national 0… numbers still parse.
  const parsed = parsePhoneNumberFromString(raw, iso ?? ('GB' as CountryCode));
  if (!parsed || !parsed.isValid()) return { lineType: 'unknown', whatsappEligible: true };

  const type = parsed.getType();
  if (type === 'MOBILE' || type === 'FIXED_LINE_OR_MOBILE') {
    return { lineType: 'mobile', whatsappEligible: true };
  }
  if (type === 'FIXED_LINE') return { lineType: 'landline', whatsappEligible: false };
  if (type === 'VOIP') return { lineType: 'voip', whatsappEligible: false };
  // A valid number whose type we can't determine → don't block (stay eligible).
  if (type === undefined) return { lineType: 'unknown', whatsappEligible: true };
  // Everything else (TOLL_FREE, PREMIUM_RATE, SHARED_COST, UAN, PAGER, VOICEMAIL,
  // PERSONAL_NUMBER) is confidently not a normal mobile → block, but we don't have a
  // dedicated bucket for it, so record it as 'unknown'.
  return { lineType: 'unknown', whatsappEligible: false };
}

/** Convenience: true when the number may be queued for WhatsApp. */
export function isWhatsAppEligible(
  phone: string | null | undefined,
  country?: Country | string | null,
): boolean {
  return classifyLineType(phone, country).whatsappEligible;
}

/**
 * A hand-typed number in the international form Google Places stores ("+91 98765 43210"), for a lead
 * in `country` — or null when it is not a valid number there.
 *
 * ⛔ WHY (2026-09-28). Every WhatsApp path turns a leading 0 into 44 for UK leads and leaves any other
 * national form as bare digits: "98765 43210" would be sent to +98 (Iran), "098765 43210" is refused by
 * Meta, and one client helper rewrites it to a UK 44… number. Find Leads never has this problem (Google
 * returns "+91 …"); a salesperson TYPING a number does. So a non-UK typed number is stored the way
 * Google would have stored it, and every downstream path then sees an explicit country code.
 * ⚠️ UK callers do not use this: a UK number stays exactly as typed (07…), as it always has.
 */
export function internationalPhone(
  phone: string | null | undefined,
  country: Country | string | null | undefined,
): string | null {
  const raw = (phone ?? '').trim();
  const iso = country ? (COUNTRY_TO_ISO[country] as CountryCode | undefined) : undefined;
  if (!raw || !iso) return null;
  const parsed = parsePhoneNumberFromString(raw, iso);
  if (!parsed || !parsed.isValid() || parsed.country !== iso) return null;
  return parsed.formatInternational();
}
