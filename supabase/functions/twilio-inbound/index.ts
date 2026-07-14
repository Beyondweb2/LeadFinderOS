import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// twilio-inbound — ONE Twilio webhook for BOTH inbound SMS and delivery status
// callbacks (configure this URL for the number's "A MESSAGE COMES IN" AND as the
// StatusCallback; the handler branches on the payload).
//
//  • Inbound SMS (has Body + From): STOP/STOPALL/UNSUBSCRIBE/CANCEL/END/QUIT →
//    insert into contact_suppressions (channel-agnostic — suppressed on EVERY
//    channel) and mark matching leads 'opted_out'. START/UNSTOP/YES → re-opt-in
//    (remove the suppression + revert the lead). Twilio's own Advanced Opt-Out
//    still auto-sends the carrier STOP confirmation; we ALSO record it our side.
//  • Status callback (has MessageStatus + MessageSid): record delivered/failed/
//    undelivered + error code onto sms_sends (and the lead's sms_delivery_status).
//
// Twilio posts application/x-www-form-urlencoded. Verified with the X-Twilio-Signature
// (HMAC-SHA1 over the URL + sorted params, keyed by the auth token). verify_jwt = false.

const STOP_WORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "STOPP"]);
const START_WORDS = new Set(["START", "UNSTOP", "YES", "UNSUBSCRIBE STOP"]); // START/UNSTOP/YES re-opt-in

function textResponse(xml: string, status = 200): Response {
  return new Response(xml, { status, headers: { "Content-Type": "text/xml" } });
}
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

/** Twilio request signature: base64( HMAC-SHA1( authToken, url + sortedParamKeyValues ) ). */
async function validTwilioSignature(url: string, params: Record<string, string>, header: string | null, authToken: string): Promise<boolean> {
  if (!header) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(authToken), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  // constant-time-ish compare
  if (expected.length !== header.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ header.charCodeAt(i);
  return diff === 0;
}

/** E.164 (+…) canonical form for the suppression key. Matches process-sms-queue's toE164. */
function toE164(raw: string): string {
  const p = (raw || "").replace(/[^\d+]/g, "");
  if (p.startsWith("+")) return p;
  if (p.startsWith("00")) return "+" + p.slice(2);
  if (p.startsWith("0")) return "+44" + p.slice(1);
  if (p.startsWith("44")) return "+" + p;
  return p;
}

// deno-lint-ignore no-explicit-any
async function markLeadsByPhone(service: any, e164: string, patch: Record<string, unknown>, onlyStatus?: string) {
  // Leads store raw phone (07…, +44…, spaced) — prefilter on last 9 digits, confirm with toE164.
  const last9 = e164.replace(/\D/g, "").slice(-9);
  if (last9.length < 6) return 0;
  const { data: leads } = await service.from("outreach_leads").select("id, phone, country, status").ilike("phone", `%${last9}%`);
  let n = 0;
  for (const l of (leads ?? []) as Array<{ id: string; phone: string; country: string | null; status: string }>) {
    if (toE164(l.phone ?? "") !== e164) continue;
    if (onlyStatus && l.status !== onlyStatus) continue;
    await service.from("outreach_leads").update(patch).eq("id", l.id);
    n++;
  }
  return n;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return textResponse(EMPTY_TWIML, 405);

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    const raw = await req.text();
    const form = new URLSearchParams(raw);
    const params: Record<string, string> = {};
    for (const [k, v] of form) params[k] = v;

    // Signature check (when the auth token is configured — it is, Twilio is live).
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
    if (authToken) {
      const ok = await validTwilioSignature(req.url, params, req.headers.get("x-twilio-signature"), authToken);
      if (!ok) {
        console.error("[twilio-inbound] bad signature — rejecting");
        return textResponse(EMPTY_TWIML, 403);
      }
    } else {
      console.warn("[twilio-inbound] TWILIO_AUTH_TOKEN not set — skipping signature check");
    }

    const nowIso = new Date().toISOString();

    // --- Branch 1: delivery STATUS callback (has MessageStatus) ---
    const messageStatus = params.MessageStatus || params.SmsStatus;
    if (messageStatus) {
      const sid = params.MessageSid || params.SmsSid || "";
      const errorCode = params.ErrorCode || null;
      if (sid) {
        await service.from("sms_sends").update({ delivery_status: messageStatus, error_code: errorCode }).eq("message_sid", sid);
        await service.from("outreach_leads").update({ sms_delivery_status: messageStatus }).eq("sms_message_sid", sid);
      }
      console.log(`[twilio-inbound] status ${messageStatus}${errorCode ? ` (err ${errorCode})` : ""} for ${sid || "(no sid)"}`);
      return textResponse(EMPTY_TWIML);
    }

    // --- Branch 2: inbound SMS (has Body + From) → STOP / START keyword ---
    const fromRaw = params.From || "";
    const bodyText = (params.Body || "").trim();
    if (!fromRaw) return textResponse(EMPTY_TWIML);
    const e164 = toE164(fromRaw);
    const keyword = bodyText.toUpperCase().replace(/[^A-Z ]/g, "").trim();

    if (STOP_WORDS.has(keyword)) {
      // Suppress EVERYWHERE (channel-agnostic) + mark matching leads opted_out.
      await service.from("contact_suppressions")
        .upsert({ phone_e164: e164, reason: "sms_stop", source: "twilio_inbound" }, { onConflict: "phone_e164" });
      const marked = await markLeadsByPhone(service, e164, { status: "opted_out", contact_method: null, updated_at: nowIso });
      console.log(`[twilio-inbound] STOP from ${e164} — suppressed, ${marked} lead(s) opted_out`);
      // Twilio Advanced Opt-Out sends the confirmation itself — return empty TwiML.
      return textResponse(EMPTY_TWIML);
    }

    if (START_WORDS.has(keyword)) {
      await service.from("contact_suppressions").delete().eq("phone_e164", e164);
      const restored = await markLeadsByPhone(service, e164, { status: "not_contacted", updated_at: nowIso }, "opted_out");
      console.log(`[twilio-inbound] START from ${e164} — un-suppressed, ${restored} lead(s) restored`);
      return textResponse(EMPTY_TWIML);
    }

    // Any other inbound → no-op here (WhatsApp/inbox handles conversational replies).
    console.log(`[twilio-inbound] inbound from ${e164} (no keyword): ${bodyText.slice(0, 80)}`);
    return textResponse(EMPTY_TWIML);
  } catch (e) {
    console.error("[twilio-inbound] error:", (e as Error).message);
    // 200 so Twilio doesn't hammer retries; we've logged it.
    return textResponse(EMPTY_TWIML);
  }
});
