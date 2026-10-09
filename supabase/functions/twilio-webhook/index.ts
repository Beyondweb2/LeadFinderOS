import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validTwilioSignature } from "../../../src/lib/twilioAuth.ts";
import { advanceSmsStatus, isStopMessage, mapTwilioStatus } from "../../../src/lib/smsMessages.ts";
import { recordOptOut } from "../_shared/suppression.ts";
import { bookOwnerId } from "../_shared/access.ts";
import { resolveTwilioEnv, twiml, webhookUrlFor, xmlEscape } from "../_shared/twilio.ts";
import { syncLeadFromSms } from "../_shared/sms-lead-sync.ts";

// twilio-webhook — everything Twilio calls us about (2026-10-09). PUBLIC (verify_jwt = false): the handler
// authenticates every request by Twilio's signature instead.
//
//   ?type=sms-in        a text arrived on our number         (Messaging → "A message comes in")
//   ?type=sms-status    delivery receipt for a text we sent   (set per message by us, as StatusCallback)
//   ?type=voice-twiml   the browser started a call            (TwiML App → Voice Request URL)
//   ?type=voice-status  call progress / completion            (TwiML App → Status Callback URL, and each dialled leg)
//   ?type=voice-in      someone phoned our number             (Phone number → "A call comes in")
//
// ⛔ SIGNATURE FIRST, FAIL CLOSED: no auth token configured, no header, or a mismatch = 403 and nothing is read.
//    The signed URL is our configured TWILIO_WEBHOOK_BASE plus the request's own query string.
// ⛔ THE NUMBER A BROWSER CALL DIALS COMES FROM OUR call_logs ROW (written by twilio-voice-token for one rep and one
//    lead), never from a parameter the browser sent. A row dials once: it is claimed initiated → dialing atomically.
// ⛔ "DELIVERED" ONLY FROM A DELIVERED RECEIPT; a late/out-of-order receipt never moves a text backwards.
// ⛔ A STOP reply is recorded in contact_suppressions (one no = suppressed everywhere); Twilio sends its own confirmation.
// ⛔ Idempotent: a repeated webhook (Twilio retries) is a no-op — twilio_sid is unique, a call is claimed once.
// ⛔ Nothing here marks a lead Contacted because a call connected: the rep logs the outcome. A call only writes its
//    own call_logs row and one `call_made` History line when it ends.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const empty = () => new Response("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response/>", { status: 200, headers: { "Content-Type": "text/xml" } });
const FINAL_CALL = new Set(["completed", "busy", "no-answer", "failed", "canceled"]);
/** A reply from these statuses is a first reply: the lead moves to Replied (forward-only; nothing further along is touched). */
const REPLIABLE = ["not_contacted", "queued", "initial_contact", "second_attempt", "report_sent", "site_sent", "no_whatsapp", "no_whatsapp_needs_sms", "whatsapp_failed"];

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const env = resolveTwilioEnv();
  const raw = await req.text();
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw)) params[k] = v;

  const ok = await validTwilioSignature(env.authToken, webhookUrlFor(env, req.url), params, req.headers.get("x-twilio-signature"));
  if (!ok) return new Response("forbidden", { status: 403 });

  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
  const type = new URL(req.url).searchParams.get("type") ?? "";
  try {
    switch (type) {
      case "sms-in": return await smsIn(service, env, params);
      case "sms-status": return await smsStatus(service, params);
      case "voice-twiml": return await voiceTwiml(service, env, params);
      case "voice-status": return await voiceStatus(service, params);
      case "voice-in": return await voiceIn(service, env, params);
      default: return empty();
    }
  } catch (e) {
    console.error(`[twilio-webhook] ${type} failed:`, (e as Error).message);
    return empty(); // 200 so Twilio does not retry a request we cannot fix; the error is in the logs
  }
});

// deno-lint-ignore no-explicit-any
type Service = any;
const digitsOf = (e164: string) => String(e164 ?? "").replace(/\D/g, "");

/** Which lead is this number? The lead we last texted from it, else the only live candidate, else none (never a guess). */
async function matchLead(service: Service, digits: string): Promise<{ leadId: string | null; userId: string | null }> {
  const { data: last } = await service.from("sms_messages").select("lead_id, user_id").eq("phone", digits).eq("direction", "outbound")
    .not("lead_id", "is", null).order("created_at", { ascending: false }).limit(1);
  if (Array.isArray(last) && last[0]?.lead_id) return { leadId: last[0].lead_id, userId: last[0].user_id ?? null };
  const { data: cands } = await service.rpc("inbound_lead_candidates", { _phone: digits });
  const live = ((cands ?? []) as Array<{ id: string; user_id: string; is_archived: boolean }>).filter((c) => !c.is_archived);
  if (live.length === 1) return { leadId: live[0].id, userId: live[0].user_id };
  return { leadId: null, userId: null };
}

async function smsIn(service: Service, env: ReturnType<typeof resolveTwilioEnv>, p: Record<string, string>): Promise<Response> {
  const from = digitsOf(p.From);
  if (!from || !p.MessageSid) return empty();
  if (env.smsFrom && digitsOf(p.To) !== digitsOf(env.smsFrom)) return empty(); // not our number
  const m = await matchLead(service, from);
  const userId = m.userId ?? (await bookOwnerId(service));
  const body = String(p.Body ?? "").slice(0, 1600);
  const { error } = await service.from("sms_messages").insert({
    direction: "inbound", user_id: userId, lead_id: m.leadId, phone: from, body, twilio_sid: p.MessageSid, status: "received",
  });
  if (error) {
    if ((error as { code?: string }).code === "23505") return empty(); // a retried webhook
    throw new Error(`insert: ${error.message}`);
  }
  if (isStopMessage(body)) {
    await recordOptOut(service, { phone: `+${from}`, leadId: m.leadId }, "twilio_inbound");
    if (m.leadId) await service.from("lead_activity").insert({ lead_id: m.leadId, kind: "opted_out", data: { channel: "sms" } }).then(() => undefined, () => undefined);
  } else if (m.leadId) {
    await service.from("outreach_leads").update({ status: "replied" }).eq("id", m.leadId).in("status", REPLIABLE);
  }
  return empty();
}

async function smsStatus(service: Service, p: Record<string, string>): Promise<Response> {
  if (!p.MessageSid) return empty();
  const { data: row } = await service.from("sms_messages").select("id, status, lead_id, phone").eq("twilio_sid", p.MessageSid).maybeSingle();
  if (!row) return empty();
  const next = advanceSmsStatus(row.status, mapTwilioStatus(p.MessageStatus));
  if (next === row.status && !p.ErrorCode) return empty();
  await service.from("sms_messages").update({ status: next, ...(p.ErrorCode ? { error_code: String(p.ErrorCode) } : {}) }).eq("id", row.id);
  /* ⛔ THE LEAD FOLLOWS THE PROVIDER (2026-10-09): delivered → Contacted, failed → SMS Failed / No SMS by the error code. Only the lead's
     newest text moves it, and only a real receipt (never "accepted") — see _shared/sms-lead-sync.ts. */
  if (row.lead_id) await syncLeadFromSms(service, { leadId: row.lead_id, messageId: row.id, providerStatus: next, errorCode: p.ErrorCode ? String(p.ErrorCode) : null, phoneE164: `+${row.phone}` });
  return empty();
}

async function voiceTwiml(service: Service, env: ReturnType<typeof resolveTwilioEnv>, p: Record<string, string>): Promise<Response> {
  const hangup = (say: string) => twiml(`<Say language="en-GB">${xmlEscape(say)}</Say><Hangup/>`);
  const callId = String(p.callId ?? "");
  const identity = String(p.From ?? "").replace(/^client:/, "");
  if (!UUID_RE.test(callId) || !UUID_RE.test(identity) || !p.CallSid) return hangup("This call could not be set up.");
  // Claim the row ONCE, and only for the rep it was minted for, and only while fresh.
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: claimed } = await service.from("call_logs").update({ call_sid: p.CallSid, status: "dialing" })
    .eq("id", callId).eq("user_id", identity).eq("status", "initiated").gte("created_at", since).select("phone").maybeSingle();
  if (!claimed?.phone || !/^44[1237]\d{8,9}$/.test(claimed.phone)) return hangup("This call could not be set up.");
  const cb = `${env.webhookBase}?type=voice-status`;
  return twiml(
    `<Dial callerId="${xmlEscape(env.smsFrom)}" answerOnBridge="true" timeout="40">` +
    `<Number statusCallbackEvent="ringing answered completed" statusCallback="${xmlEscape(cb)}" statusCallbackMethod="POST">+${claimed.phone}</Number></Dial>`,
  );
}

async function voiceStatus(service: Service, p: Record<string, string>): Promise<Response> {
  const isChild = !!p.ParentCallSid;
  const sid = p.ParentCallSid || p.CallSid;
  if (!sid) return empty();
  const { data: row } = await service.from("call_logs").select("id, lead_id, user_id, status, answered_at, duration_s").eq("call_sid", sid).maybeSingle();
  if (!row || FINAL_CALL.has(row.status) || row.status === "simulated") return empty();
  const s = String(p.CallStatus ?? "").toLowerCase();
  const patch: Record<string, unknown> = {};
  if (s === "ringing") patch.status = "ringing";
  else if (s === "in-progress") { patch.status = "in-progress"; patch.answered_at = row.answered_at ?? new Date().toISOString(); }
  else if (FINAL_CALL.has(s)) {
    if (isChild && s === "completed") {
      // The dialled leg finished: talk time is its duration. The parent leg's own completion finalises the row.
      if (p.CallDuration) patch.duration_s = Number(p.CallDuration) || 0;
    } else if (!isChild && s === "completed" && !row.answered_at) {
      patch.status = "no-answer"; patch.ended_at = new Date().toISOString(); // the browser leg ended and nobody answered
    } else {
      patch.status = s; patch.ended_at = new Date().toISOString();
      if (!isChild && p.CallDuration && row.duration_s == null) patch.duration_s = Number(p.CallDuration) || 0;
      if (p.ErrorCode) patch.error_code = String(p.ErrorCode);
    }
  }
  if (!Object.keys(patch).length) return empty();
  const { data: upd } = await service.from("call_logs").update(patch).eq("id", row.id).not("status", "in", "(completed,busy,no-answer,failed,canceled,simulated)").select("status, duration_s, answered_at").maybeSingle();
  const done = upd && FINAL_CALL.has(String(patch.status ?? ""));
  if (done && row.lead_id) {
    await service.from("lead_activity").insert({
      lead_id: row.lead_id, actor_user_id: row.user_id, kind: "call_made",
      data: { call_id: row.id, status: patch.status, duration_s: upd.duration_s ?? null, answered: !!upd.answered_at },
    }).then(() => undefined, () => undefined);
  }
  return empty();
}

async function voiceIn(service: Service, env: ReturnType<typeof resolveTwilioEnv>, p: Record<string, string>): Promise<Response> {
  const from = digitsOf(p.From);
  if (from && p.CallSid) {
    const m = await matchLead(service, from);
    const userId = m.userId ?? (await bookOwnerId(service));
    const { data: log } = !userId ? { data: null } : await service.from("call_logs").insert({
      lead_id: m.leadId, user_id: userId, phone: from, direction: "inbound", call_sid: p.CallSid,
      status: "no-answer", ended_at: new Date().toISOString(), test_mode: false,
    }).select("id").maybeSingle();
    if (m.leadId && log) {
      const { data: owner } = await service.rpc("lead_recipient", { _lead: m.leadId });
      const { data: lead } = await service.from("outreach_leads").select("business_name").eq("id", m.leadId).maybeSingle();
      if (owner) await service.rpc("notify_person", {
        _user: owner, _kind: "missed_call", _title: `Missed call · ${lead?.business_name ?? "a prospect"}`,
        _body: "They phoned the Findable number. Call them back from their lead.", _link: `/outreach?lead=${m.leadId}`,
        _lead: m.leadId, _dedupe: `missed_call:${log.id}`, _priority: 2,
      }).then(() => undefined, () => undefined);
    }
  }
  void env;
  return twiml(`<Say language="en-GB">Thanks for calling Findable. We cannot take calls on this number. Please send us a text message and we will get back to you.</Say><Hangup/>`);
}
