// twilio — the ONE place Twilio's configuration and REST calls live (2026-10-09).
//
// ⛔ SECRETS ARE READ HERE, SERVER-SIDE, FROM Deno.env — NEVER FROM THE REQUEST, NEVER LOGGED, NEVER RETURNED.
//    TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN      REST auth + webhook signature check
//    TWILIO_SMS_FROM                           the sending number, E.164 (+447400420187)
//    TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET  signs browser access tokens (never the auth token)
//    TWILIO_TWIML_APP_SID                      the TwiML App the browser dials through
//    TWILIO_TEST_MODE                          anything but exactly "off" SIMULATES: no SMS leaves, no call is placed
//    TWILIO_WEBHOOK_BASE                       optional; defaults to <SUPABASE_URL>/functions/v1/twilio-webhook
// ⛔ TEST MODE IS THE DEFAULT (the WHATSAPP_TEST_MODE pattern): an unset or mistyped variable simulates; a real
//    message or call needs a deliberate TWILIO_TEST_MODE=off.
// ⛔ `smsConfigured` / `voiceConfigured` are POSITIVE: every required secret present and well-formed. Absent = not set up.

export interface TwilioEnv {
  accountSid: string;
  authToken: string;
  smsFrom: string;
  apiKeySid: string;
  apiKeySecret: string;
  twimlAppSid: string;
  testMode: boolean;
  webhookBase: string;
  /** Can a REAL text be sent (all REST secrets present)? Test mode simulates regardless. */
  smsConfigured: boolean;
  /** Can a REAL browser call be placed (token secrets + TwiML App)? */
  voiceConfigured: boolean;
}

export function resolveTwilioEnv(): TwilioEnv {
  const g = (k: string) => (Deno.env.get(k) ?? "").trim();
  const accountSid = g("TWILIO_ACCOUNT_SID");
  const authToken = g("TWILIO_AUTH_TOKEN");
  const smsFrom = g("TWILIO_SMS_FROM");
  const apiKeySid = g("TWILIO_API_KEY_SID");
  const apiKeySecret = g("TWILIO_API_KEY_SECRET");
  const twimlAppSid = g("TWILIO_TWIML_APP_SID");
  const base = g("TWILIO_WEBHOOK_BASE") || `${g("SUPABASE_URL")}/functions/v1/twilio-webhook`;
  const sidOk = /^AC[0-9a-f]{32}$/i.test(accountSid);
  const fromOk = /^\+447\d{9}$/.test(smsFrom);
  return {
    accountSid, authToken, smsFrom, apiKeySid, apiKeySecret, twimlAppSid,
    testMode: g("TWILIO_TEST_MODE").toLowerCase() !== "off",
    webhookBase: base,
    smsConfigured: sidOk && authToken.length >= 16 && fromOk,
    voiceConfigured: sidOk && fromOk && /^SK[0-9a-f]{32}$/i.test(apiKeySid) && apiKeySecret.length >= 16 && /^AP[0-9a-f]{32}$/i.test(twimlAppSid),
  };
}

/** The exact URL Twilio signed for an inbound webhook: our configured base + the request's own query string. */
export function webhookUrlFor(env: TwilioEnv, reqUrl: string): string {
  let search = "";
  try { search = new URL(reqUrl).search; } catch { /* no query */ }
  return `${env.webhookBase}${search}`;
}

export interface TwilioSendResult { ok: boolean; sid: string | null; status: string | null; errorCode: string | null; error: string | null }

/** Send one SMS through Twilio's Messages API. Never throws; never returns the credentials. */
export async function twilioSendSms(env: TwilioEnv, toE164: string, body: string): Promise<TwilioSendResult> {
  try {
    const form = new URLSearchParams({
      To: toE164, From: env.smsFrom, Body: body,
      StatusCallback: `${env.webhookBase}?type=sms-status`,
    });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.accountSid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${btoa(`${env.accountSid}:${env.authToken}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });
    const j = await res.json().catch(() => ({})) as { sid?: string; status?: string; code?: number; message?: string };
    if (res.ok && j.sid) return { ok: true, sid: j.sid, status: j.status ?? "queued", errorCode: null, error: null };
    return { ok: false, sid: j.sid ?? null, status: "failed", errorCode: j.code != null ? String(j.code) : String(res.status), error: String(j.message ?? `HTTP ${res.status}`).slice(0, 300) };
  } catch (e) {
    return { ok: false, sid: null, status: "failed", errorCode: "network", error: (e as Error).message.slice(0, 300) };
  }
}

/** TwiML helpers — text only, XML-escaped. */
export const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
export const twiml = (inner: string) => new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, { status: 200, headers: { "Content-Type": "text/xml" } });
