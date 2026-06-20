/**
 * WhatsApp-capability signal via HLR line-type (Twilio Lookup v2,
 * line_type_intelligence). LEGAL + ToS-safe: we look up the carrier line type
 * (mobile / landline / voip), we do NOT probe WhatsApp itself. A 'mobile' number
 * is the proxy for "WhatsApp-capable". Reuses the existing TWILIO_ACCOUNT_SID /
 * TWILIO_AUTH_TOKEN secrets — no new provider.
 */

/** Map our lead `country` enum to an ISO-3166 alpha-2 for Twilio's CountryCode. */
const COUNTRY_TO_ISO: Record<string, string> = {
  UK: "GB", Australia: "AU", USA: "US", Canada: "CA", Germany: "DE", France: "FR",
  Spain: "ES", Italy: "IT", Netherlands: "NL", Belgium: "BE", Ireland: "IE",
  NewZealand: "NZ", SouthAfrica: "ZA", India: "IN", Singapore: "SG", UAE: "AE",
  Brazil: "BR", Mexico: "MX", Japan: "JP", Sweden: "SE",
};

export type LineType = "mobile" | "landline" | "voip" | "unknown";

export async function lookupLineType(
  phone: string,
  opts: { sid: string; token: string; country?: string | null; timeoutMs?: number },
): Promise<LineType> {
  const raw = (phone ?? "").trim();
  if (!raw) return "unknown";

  // Build the Lookup URL. If already E.164 (+...), pass as-is; otherwise pass the
  // national number plus CountryCode so Twilio can normalise it.
  const e164ish = raw.replace(/[^\d+]/g, "");
  const iso = opts.country ? COUNTRY_TO_ISO[opts.country] : undefined;
  const params = new URLSearchParams({ Fields: "line_type_intelligence" });
  if (!e164ish.startsWith("+") && iso) params.set("CountryCode", iso);

  const url = `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(e164ish)}?${params.toString()}`;
  const auth = btoa(`${opts.sid}:${opts.token}`);

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
      signal: controller.signal,
    });
    if (!res.ok) return "unknown";
    const data = await res.json();
    const type = data?.line_type_intelligence?.type as string | undefined;
    if (type === "mobile") return "mobile";
    if (type === "landline" || type === "fixedLine") return "landline";
    if (type && /voip/i.test(type)) return "voip";
    return "unknown";
  } catch (_e) {
    return "unknown";
  } finally {
    clearTimeout(t);
  }
}
