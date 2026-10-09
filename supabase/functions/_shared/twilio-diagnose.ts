// twilio-diagnose — "is Twilio set up and wired correctly?" (2026-10-09). READ-ONLY, ADMIN-ONLY, NEVER RETURNS A SECRET.
//
// Runs INSIDE the function (the only place the secrets exist) and reports, per setting: present? well-formed? — as
// booleans and plain words. It then makes a few Twilio READ calls (the account, the API key, the sender number's
// webhooks, the TwiML App's webhooks) to prove the values really work.
// ⛔ It never sends an SMS, never places a call, never changes anything in Twilio, and never echoes a secret. Webhook
//    URLs are shown (they are not secrets) with any user:password part removed. Called only by twilio-sms-send
//    mode "diagnose", which is admin-only.
import type { TwilioEnv } from "./twilio.ts";

export const EXPECTED_SENDER = "+447400420187";

export interface DiagCheck { name: string; ok: boolean; say: string }
export interface Diagnosis { checks: DiagCheck[]; testMode: boolean; smsConfigured: boolean; voiceConfigured: boolean; readyForControlledTest: boolean }

const stripAuth = (u: string): string => { try { const x = new URL(u); x.username = ""; x.password = ""; return x.toString(); } catch { return "(not a valid URL)"; } };

async function twGet(path: string, user: string, pass: string): Promise<{ status: number; json: Record<string, unknown> }> {
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/${path}`, { headers: { Authorization: `Basic ${btoa(`${user}:${pass}`)}` } });
    return { status: res.status, json: await res.json().catch(() => ({})) as Record<string, unknown> };
  } catch { return { status: 0, json: {} }; }
}

const SID = (p: string) => new RegExp(`^${p}[0-9a-f]{32}$`, "i");
const methodOf = (v: unknown) => String(v ?? "").toUpperCase();

export async function diagnoseTwilio(env: TwilioEnv): Promise<Diagnosis> {
  const checks: DiagCheck[] = [];
  const add = (name: string, ok: boolean, say: string) => checks.push({ name, ok, say });
  const sid = (name: string, v: string, prefix: string, what: string) =>
    add(name, SID(prefix).test(v), !v ? "MISSING" : SID(prefix).test(v) ? `present, starts ${prefix}, right length` : `present but not a valid ${what} (should start ${prefix} followed by 32 characters)`);

  sid("TWILIO_ACCOUNT_SID", env.accountSid, "AC", "Account SID");
  add("TWILIO_AUTH_TOKEN", env.authToken.length === 32, !env.authToken ? "MISSING" : env.authToken.length === 32 ? "present, 32 characters" : `present but ${env.authToken.length} characters (should be 32)`);
  add("TWILIO_SMS_FROM", /^\+447\d{9}$/.test(env.smsFrom),
    !env.smsFrom ? "MISSING" : !/^\+447\d{9}$/.test(env.smsFrom) ? "present but not in the form +447XXXXXXXXX"
      : env.smsFrom === EXPECTED_SENDER ? "present and is the expected UK number" : "present, a UK mobile — but NOT the expected +447400420187");
  sid("TWILIO_API_KEY_SID", env.apiKeySid, "SK", "API Key SID");
  add("TWILIO_API_KEY_SECRET", env.apiKeySecret.length >= 16, !env.apiKeySecret ? "MISSING" : env.apiKeySecret.length >= 16 ? `present, ${env.apiKeySecret.length} characters` : "present but too short");
  sid("TWILIO_TWIML_APP_SID", env.twimlAppSid, "AP", "TwiML App SID");
  add("TWILIO_TEST_MODE", env.testMode, env.testMode ? "ON — nothing real is sent or dialled (as required for now)" : "OFF — real messages and calls are live");

  // Read-only proof against Twilio, only where the pieces exist.
  const haveAccount = SID("AC").test(env.accountSid) && !!env.authToken;
  if (haveAccount) {
    const a = await twGet(`Accounts/${env.accountSid}.json`, env.accountSid, env.authToken);
    add("Auth token works", a.status === 200,
      a.status === 200 ? `accepted by Twilio; account is ${String(a.json.status ?? "unknown")}${a.json.type === "Trial" ? " (a TRIAL account: Twilio only lets a trial account text numbers you have verified)" : ""}`
        : a.status === 401 ? "REJECTED by Twilio (wrong Account SID or Auth Token)" : `could not check (HTTP ${a.status})`);
  }
  if (SID("AC").test(env.accountSid) && SID("SK").test(env.apiKeySid) && env.apiKeySecret) {
    // ⛔ A STANDARD key may not read the Account resource itself (Twilio: Standard keys cover everything except Accounts and Keys),
    //    so proving the key on that URL rejects a perfectly good key. Prove it on the TwiML App (which the browser calls need anyway),
    //    else on the phone-number list.
    const keyPath = SID("AP").test(env.twimlAppSid) ? `Accounts/${env.accountSid}/Applications/${env.twimlAppSid}.json` : `Accounts/${env.accountSid}/IncomingPhoneNumbers.json?PageSize=1`;
    const k = await twGet(keyPath, env.apiKeySid, env.apiKeySecret);
    add("API key + secret work", k.status === 200,
      k.status === 200 ? "accepted by Twilio (the key belongs to this account)"
        : k.status === 401 ? "REJECTED by Twilio (wrong API Key SID or secret, or the key is from a different account)" : `could not check (HTTP ${k.status})`);
  }
  const base = env.webhookBase;
  const url = (name: string, got: unknown, method: unknown, want: string) => {
    const g = String(got ?? "");
    const right = g === want;
    add(name, right && methodOf(method) === "POST",
      right ? (methodOf(method) === "POST" ? "correct (POST)" : `right address but the method is ${methodOf(method) || "unset"} — it must be POST`)
        : `WRONG — it is set to ${g ? stripAuth(g) : "(nothing)"}`);
  };
  if (haveAccount) {
    const n = await twGet(`Accounts/${env.accountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(EXPECTED_SENDER)}`, env.accountSid, env.authToken);
    const num = ((n.json.incoming_phone_numbers ?? []) as Array<Record<string, unknown>>)[0];
    if (!num) add(`Number ${EXPECTED_SENDER} is in this Twilio account`, false, n.status === 200 ? "NOT FOUND in this account" : `could not check (HTTP ${n.status})`);
    else {
      const caps = (num.capabilities ?? {}) as Record<string, boolean>;
      add(`Number ${EXPECTED_SENDER} is in this Twilio account`, !!caps.sms && !!caps.voice, `found; SMS ${caps.sms ? "yes" : "NO"}, voice ${caps.voice ? "yes" : "NO"}`);
      url("Inbound SMS webhook (number)", num.sms_url, num.sms_method, `${base}?type=sms-in`);
      url("Inbound voice webhook (number)", num.voice_url, num.voice_method, `${base}?type=voice-in`);
    }
    if (SID("AP").test(env.twimlAppSid)) {
      const app = await twGet(`Accounts/${env.accountSid}/Applications/${env.twimlAppSid}.json`, env.accountSid, env.authToken);
      if (app.status !== 200) add("TwiML App exists", false, app.status === 404 ? "NOT FOUND in this account (wrong TWILIO_TWIML_APP_SID)" : `could not check (HTTP ${app.status})`);
      else {
        add("TwiML App exists", true, "found");
        url("TwiML App voice request URL", app.json.voice_url, app.json.voice_method, `${base}?type=voice-twiml`);
        url("TwiML App status callback URL", app.json.status_callback, app.json.status_callback_method, `${base}?type=voice-status`);
      }
    }
  }
  const allGood = checks.every((c) => c.name === "TWILIO_TEST_MODE" || c.ok);
  return { checks, testMode: env.testMode, smsConfigured: env.smsConfigured, voiceConfigured: env.voiceConfigured, readyForControlledTest: allGood && env.smsConfigured && env.voiceConfigured };
}
