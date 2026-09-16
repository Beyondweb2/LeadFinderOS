import { parsePhoneNumberFromString, type CountryCode } from "https://esm.sh/libphonenumber-js@1.13.8/max";

/**
 * Offline (free, no network) line-type classification — the Tier-1 WhatsApp-
 * capability gate. Uses libphonenumber-js MAX metadata (needed for getType()).
 *
 * IMPORTANT: this is MIRRORED by the client copy at src/lib/lineType.ts — keep the
 * two behaviourally identical (same eligibility rule, same country map). Client and
 * edge can't share a module (npm vs esm.sh imports), same as toWhatsAppNumber.
 *
 * We only classify the carrier line type; we do NOT probe WhatsApp itself. A mobile
 * is the proxy for "WhatsApp-capable". We block ONLY when we're confident the number
 * is NOT a normal mobile (landline / VoIP / toll-free / etc.). Anything we can't
 * parse or can't type stays ELIGIBLE — so no real mobile is ever wrongly blocked and
 * existing send behaviour for mobiles is unchanged.
 */

export type LineType = "mobile" | "landline" | "voip" | "unknown";

export interface LineTypeResult {
  lineType: LineType;
  /** true = may be queued/sent for WhatsApp; false = confidently non-mobile, block. */
  whatsappEligible: boolean;
}

/** Lead `country` enum → ISO-3166 alpha-2 for libphonenumber. Mirrors the map in
 *  src/lib/lineType.ts. */
const COUNTRY_TO_ISO: Record<string, string> = {
  UK: "GB", Australia: "AU", USA: "US", Canada: "CA", Germany: "DE", France: "FR",
  Spain: "ES", Italy: "IT", Netherlands: "NL", Belgium: "BE", Ireland: "IE",
  NewZealand: "NZ", SouthAfrica: "ZA", India: "IN", Singapore: "SG", UAE: "AE",
  Brazil: "BR", Mexico: "MX", Japan: "JP", Sweden: "SE",
};

export function classifyLineType(
  phone: string | null | undefined,
  country?: string | null,
): LineTypeResult {
  const raw = (phone ?? "").trim();
  // No number at all → nothing to classify; leave it eligible so the existing
  // null-phone / bad_number handling downstream decides, not this gate.
  if (!raw) return { lineType: "unknown", whatsappEligible: true };

  const iso = country ? (COUNTRY_TO_ISO[country] as CountryCode | undefined) : undefined;
  // Default to GB when no country is known (UK-first product; matches toWhatsAppNumber).
  const parsed = parsePhoneNumberFromString(raw, iso ?? ("GB" as CountryCode));
  if (!parsed || !parsed.isValid()) return { lineType: "unknown", whatsappEligible: true };

  const type = parsed.getType();
  if (type === "MOBILE" || type === "FIXED_LINE_OR_MOBILE") {
    return { lineType: "mobile", whatsappEligible: true };
  }
  if (type === "FIXED_LINE") return { lineType: "landline", whatsappEligible: false };
  if (type === "VOIP") return { lineType: "voip", whatsappEligible: false };
  // A valid number whose type we can't determine → don't block (stay eligible).
  if (type === undefined) return { lineType: "unknown", whatsappEligible: true };
  // Everything else (TOLL_FREE, PREMIUM_RATE, SHARED_COST, UAN, PAGER, VOICEMAIL,
  // PERSONAL_NUMBER) is confidently not a normal mobile → block; recorded as 'unknown'.
  return { lineType: "unknown", whatsappEligible: false };
}
