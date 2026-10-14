/* ══ THE PER-COUNTRY SENDING SWITCHES, READ BY THE SENDERS (2026-10-14, feat/my-sg-support) ══════════════════════
   One loader for public.outreach_country_settings + the one per-country daily-cap count. The rules themselves live in
   src/lib/outreachMarkets.ts (pure, shared with the browser).
   ⛔ FAILS TOWARDS SENDING LESS: an unreadable table answers the defaults — the UK on exactly as before, Malaysia and
   Singapore OFF — and an unreadable country count answers "at its cap". Never the other way round. */
import {
  countrySettingsFrom, DEFAULT_COUNTRY_SETTINGS, localDayStartUtc, windowForMarket,
  type CountrySettings, type Market,
} from "../../../src/lib/outreachMarkets.ts";

// deno-lint-ignore no-explicit-any
type Service = any;

export async function loadCountrySettings(service: Service): Promise<CountrySettings> {
  try {
    const { data, error } = await service.from("outreach_country_settings").select("*");
    if (error) return DEFAULT_COUNTRY_SETTINGS;
    return countrySettingsFrom((data ?? []) as never);
  } catch {
    return DEFAULT_COUNTRY_SETTINGS;
  }
}

/** The digits prefix a market's numbers start with, as stored by each sender ("60…" WhatsApp, "+60…" SMS). */
const CALLING_CODE: Record<Exclude<Market, "UK">, string> = { MY: "60", SG: "65" };

/** Has `market` reached its own daily cap on this channel today (its own local day)? The UK has no country cap (the
 *  team cap is its cap) → false. A NULL cap → false. A failed count → true (send less, never more). */
export async function marketAtDailyCap(service: Service, settings: CountrySettings, market: Market,
                                       channel: "whatsapp" | "sms", now: Date = new Date()): Promise<boolean> {
  if (market === "UK") return false;
  const s = settings[market];
  const cap = channel === "whatsapp" ? s.whatsapp_daily_cap : s.sms_daily_cap;
  if (cap === null || cap === undefined) return false;
  const tz = windowForMarket(market, settings, { tz: "Europe/London", startMin: 0, endMin: 0 }).tz;
  const since = localDayStartUtc(tz, now).toISOString();
  try {
    const q = channel === "whatsapp"
      ? service.from("whatsapp_sends").select("id", { count: "exact", head: true })
          .is("user_id", null).eq("test_mode", false).like("phone", `${CALLING_CODE[market]}%`).gte("created_at", since)
      : service.from("sms_messages").select("id", { count: "exact", head: true })
          .eq("direction", "outbound").like("phone", `+${CALLING_CODE[market]}%`).gte("created_at", since)
          .not("status", "in", "(failed,undelivered,simulated)");
    const { count, error } = await q;
    if (error) return true;
    return (count ?? 0) >= cap;
  } catch {
    return true;
  }
}
