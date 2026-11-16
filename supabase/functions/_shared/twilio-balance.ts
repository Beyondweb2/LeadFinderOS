// twilio-balance — "is there enough credit to dial?" (2026-11-16, v1-calling-solid; the rule is src/lib/callRules.ts).
//
// ⛔ A READ of Twilio's Balance resource with the account SID + auth token (Deno.env via resolveTwilioEnv), 2.5 s at
//    most. It never throws, never logs or returns a credential. null = could not read (Twilio is still the authority).
// ⛔ Below TWILIO_BALANCE_ALERT Paul gets ONE bell + email per UTC day (raiseOperatorAlert claims the bell row first, so
//    two reps calling at once still send one email).
import type { TwilioEnv } from "./twilio.ts";
import { raiseOperatorAlert } from "./audit-alerts.ts";
import { TWILIO_BALANCE_ALERT, TWILIO_BALANCE_BLOCK, lowBalanceDedupeKey } from "../../../src/lib/callRules.ts";

export interface TwilioBalance { balance: number | null; currency: string | null; error: string | null }

export async function twilioBalance(env: TwilioEnv, timeoutMs = 2500): Promise<TwilioBalance> {
  if (!/^AC[0-9a-f]{32}$/i.test(env.accountSid) || !env.authToken) return { balance: null, currency: null, error: "not_configured" };
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.accountSid}/Balance.json`, {
      headers: { Authorization: `Basic ${btoa(`${env.accountSid}:${env.authToken}`)}` }, signal: ctl.signal,
    });
    if (!res.ok) return { balance: null, currency: null, error: `http_${res.status}` };
    const j = await res.json().catch(() => ({})) as { balance?: string | number; currency?: string };
    const n = Number(j.balance);
    return { balance: Number.isFinite(n) ? n : null, currency: j.currency ? String(j.currency) : null, error: Number.isFinite(n) ? null : "unreadable" };
  } catch (e) {
    return { balance: null, currency: null, error: (e as Error).name === "AbortError" ? "timeout" : "network" };
  } finally {
    clearTimeout(t);
  }
}

type Service = Parameters<typeof raiseOperatorAlert>[0];

/** Paul's one alert a day when credit is low or gone. Best-effort, never throws. */
export async function alertLowBalance(service: Service, b: TwilioBalance): Promise<void> {
  const amount = b.balance == null ? "unknown" : `${b.balance.toFixed(2)} ${b.currency ?? ""}`.trim();
  const empty = b.balance != null && b.balance <= TWILIO_BALANCE_BLOCK;
  await raiseOperatorAlert(service, "team_update", {
    title: empty ? "Browser calling stopped: Twilio is out of credit" : "Twilio credit is running low",
    body: `Balance ${amount}. ${empty ? "Salespeople cannot call from the app until it is topped up." : `Top up before it drops to ${TWILIO_BALANCE_BLOCK}, when browser calls stop.`}`,
    link: "/admin/api-usage",
    subject: empty ? "Findable: browser calling stopped — Twilio out of credit" : "Findable: Twilio credit is low",
    lines: [
      `Twilio balance: ${amount}.`,
      empty ? "Browser calls are refused until the account is topped up." : `Browser calls stop at ${TWILIO_BALANCE_BLOCK}; you are told below ${TWILIO_BALANCE_ALERT}.`,
      "Top up in the Twilio console: Billing → Add funds (or turn on auto-recharge).",
    ],
    dedupeKey: lowBalanceDedupeKey(),
  }).catch(() => undefined);
}
