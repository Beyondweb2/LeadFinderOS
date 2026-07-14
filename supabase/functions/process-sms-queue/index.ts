import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderTemplateBody, WA_TEMPLATES, WA_DEFAULT_TEMPLATE } from "../_shared/whatsapp-send.ts";
import { classifyLineType } from "../_shared/line-type.ts";

// process-sms-queue — the SMS fallback processor. Mirrors process-whatsapp-queue.
//
// SAFETY-FIRST. SMS_TEST_MODE is ON by default: it logs "WOULD SEND SMS …" and
// updates status exactly as a real send would, but calls NOTHING at Twilio. A real
// send happens ONLY when SMS_TEST_MODE === "off" (exactly) AND Twilio creds exist.
//
// Audience (agreed): leads the WhatsApp path exhausted — status IN
// ('no_whatsapp','whatsapp_failed','sms_queued') — MOBILE line-type re-verified, has a
// phone, NOT in contact_suppressions, NOT already SMS'd. Non-mobile
// ('no_whatsapp_needs_sms') is EXCLUDED (can't receive SMS).
//
// Reuses the SAME message template the WhatsApp attempt used (renderTemplateBody) and
// appends ONE minimal opt-out line. One send per invocation. Guards mirror WhatsApp:
// 7am–9:30pm Europe/London window, daily cap, randomised spacing, pause flag.
//
// verify_jwt = false (auth verified in-handler).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DAILY_CAP = 40;
const WINDOW_START = 7;               // 07:00 Europe/London (inclusive)
const WINDOW_END_MIN = 21 * 60 + 30;  // 21:30 Europe/London (exclusive)
const CLAIM_ORIGIN = "https://yoursites.uk";
const TZ = "Europe/London";
const MAX_SMS_ATTEMPTS = 3;
const STOP_LINE = "Txt STOP to opt out"; // ONE short opt-out line, appended to the body
const PROJECT_REF = "ruusxpkkmwtljxxulhbq";
const STATUS_CALLBACK_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/twilio-inbound`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// ── Europe/London helpers (DST-correct) — mirror process-whatsapp-queue ──────
function londonOffsetMinutes(d: Date): number {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });
  const m: Record<string, string> = {};
  for (const p of dtf.formatToParts(d)) m[p.type] = p.value;
  const asUTC = Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour % 24, +m.minute, +m.second);
  return Math.round((asUTC - d.getTime()) / 60000);
}
function londonInstant(y: number, mo: number, da: number, h: number, mi: number): Date {
  const utcGuess = Date.UTC(y, mo - 1, da, h, mi);
  const off = londonOffsetMinutes(new Date(utcGuess));
  return new Date(utcGuess - off * 60000);
}
function londonNow(): { y: number; mo: number; da: number; hour: number; minute: number } {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const m: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date())) m[p.type] = p.value;
  return { y: +m.year, mo: +m.month, da: +m.day, hour: +m.hour % 24, minute: +m.minute };
}
function londonDayStartUtcIso(): string {
  const n = londonNow();
  return londonInstant(n.y, n.mo, n.da, 0, 0).toISOString();
}
function minutesUntilWindowEnd(): number {
  const n = londonNow();
  return Math.max(0, WINDOW_END_MIN - (n.hour * 60 + n.minute));
}

/** UK phone → E.164 WITH '+' for Twilio (and the canonical suppression key). Mirrors
 *  send-reminders' toE164 exactly. */
function toE164(raw: string): string {
  const p = (raw || "").replace(/[^\d+]/g, "");
  if (p.startsWith("+")) return p;
  if (p.startsWith("00")) return "+" + p.slice(2);
  if (p.startsWith("0")) return "+44" + p.slice(1);
  if (p.startsWith("44")) return "+" + p;
  return p;
}

/** SMS segment count. Emoji / non-GSM-7 chars force UCS-2 (70/single, 67/multipart);
 *  GSM-7 is 160/single, 153/multipart. Used to FLAG multi-segment sends. */
const GSM7 = /^[@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡A-ZÄÖÑÜ§¿a-zäöñüà€^{}\\\[~\]|]*$/;
function smsSegments(body: string): number {
  const len = [...body].length;
  const unicode = !GSM7.test(body);
  if (unicode) return len <= 70 ? 1 : Math.ceil(len / 67);
  return len <= 160 ? 1 : Math.ceil(len / 153);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    // --- Auth: internal cron (CRON_SECRET header, or service-role bearer) OR an admin JWT ---
    const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
    const authHeader = req.headers.get("Authorization") ?? "";
    const isCron =
      (!!cronSecret && req.headers.get("x-cron-secret") === cronSecret) ||
      (!!serviceKey && authHeader === `Bearer ${serviceKey}`);
    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    let isAdmin = false;
    if (!isCron) {
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
      if (!token) return json({ ok: false, error: "unauthorized" }, 401);
      const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
      const { data: u } = await userClient.auth.getUser();
      if (!u?.user) return json({ ok: false, error: "unauthorized" }, 401);
      const { data: roleRow } = await service
        .from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
      if (!roleRow) return json({ ok: false, error: "forbidden" }, 403);
      isAdmin = true;
    }

    const body = await req.json().catch(() => ({}));
    const mode: string = typeof body.mode === "string" ? body.mode : "tick";
    const forceReq = body.force === true;

    // TEST_MODE: ON unless SMS_TEST_MODE is exactly "off" AND Twilio creds exist.
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
    const sender = Deno.env.get("TWILIO_SENDER") ?? "";
    const testMode = (Deno.env.get("SMS_TEST_MODE") ?? "on").toLowerCase() !== "off";
    const live = !testMode && !!accountSid && !!authToken && !!sender;
    const force = forceReq && testMode && isAdmin; // observation-only, test-mode-only

    // --- Shared status numbers ---
    const dayStart = londonDayStartUtcIso();
    const { count: sentToday } = await service
      .from("sms_sends").select("id", { count: "exact", head: true }).gte("created_at", dayStart);
    const { data: stateRow } = await service
      .from("sms_outreach_state").select("next_send_at, paused").eq("id", 1).maybeSingle();
    const nextSendAt: string | null = stateRow?.next_send_at ?? null;
    const paused: boolean = stateRow?.paused === true;
    const uk = londonNow();
    const nowMin = uk.hour * 60 + uk.minute;
    const windowOpen = nowMin >= WINDOW_START * 60 && nowMin < WINDOW_END_MIN;

    const statusPayload = {
      testMode, live, sentToday: sentToday ?? 0, cap: DAILY_CAP,
      nextSendAt, windowOpen, paused,
      ukTime: `${String(uk.hour).padStart(2, "0")}:${String(uk.minute).padStart(2, "0")}`,
    };

    if (mode === "status") return json({ ok: true, ...statusPayload });
    if (mode === "pause" || mode === "resume") {
      const nextPaused = mode === "pause";
      await service.from("sms_outreach_state").update({ paused: nextPaused, updated_at: new Date().toISOString() }).eq("id", 1);
      return json({ ok: true, ...statusPayload, paused: nextPaused });
    }

    // --- Tick guards (mirror WhatsApp): pause → window → cap → spacing ---
    if (paused) return json({ ok: true, skipped: "paused", ...statusPayload });
    if (!windowOpen && !force) return json({ ok: true, skipped: "outside_window", ...statusPayload });
    if ((sentToday ?? 0) >= DAILY_CAP) return json({ ok: true, skipped: "cap_reached", ...statusPayload });
    if (nextSendAt && new Date(nextSendAt) > new Date() && !force) {
      return json({ ok: true, skipped: "not_due", ...statusPayload });
    }

    // Oldest SMS-eligible lead: WhatsApp path exhausted, has a phone, not yet SMS'd,
    // under the retry cap. Ordered by when it entered the SMS queue (fallback: created).
    const { data: lead } = await service
      .from("outreach_leads")
      .select("id, business_name, phone, country, whatsapp_template, sms_attempts, user_id, status")
      .in("status", ["no_whatsapp", "whatsapp_failed", "sms_queued"])
      .not("phone", "is", null)
      .is("sms_sent_at", null)
      .lt("sms_attempts", MAX_SMS_ATTEMPTS)
      .order("sms_queued_at", { ascending: true, nullsFirst: true })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!lead) return json({ ok: true, skipped: "empty_queue", ...statusPayload });

    const e164 = toE164(lead.phone as string);
    if (!e164 || e164.replace(/\D/g, "").length < 8) {
      await service.from("outreach_leads").update({ sms_delivery_status: "bad_number", status: "sms_failed" }).eq("id", lead.id);
      return json({ ok: true, skipped: "bad_number", lead_id: lead.id, business: lead.business_name, ...statusPayload });
    }

    // Cross-channel suppression: if this number opted out (on ANY channel), NEVER send.
    const { data: suppressed } = await service
      .from("contact_suppressions").select("id").eq("phone_e164", e164).maybeSingle();
    if (suppressed) {
      await service.from("outreach_leads").update({ status: "opted_out", sms_delivery_status: "suppressed", contact_method: null }).eq("id", lead.id);
      return json({ ok: true, skipped: "suppressed", lead_id: lead.id, business: lead.business_name, ...statusPayload });
    }

    // Re-verify line-type: SMS needs a MOBILE. Landline/VoIP → dequeue, never spend a send.
    const lineType = classifyLineType(lead.phone as string, lead.country as string | null);
    if (!lineType.whatsappEligible) {
      await service.from("outreach_leads").update({ status: "no_whatsapp_needs_sms", sms_delivery_status: "non_mobile" }).eq("id", lead.id);
      return json({ ok: true, skipped: "non_mobile", line_type: lineType.lineType, lead_id: lead.id, business: lead.business_name, ...statusPayload });
    }

    // Claim link (the {url} in the template).
    const { data: site } = await service
      .from("generated_sites").select("share_token").eq("lead_id", lead.id)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    const shareToken: string | null = site?.share_token ?? null;
    if (!shareToken) {
      await service.from("outreach_leads").update({ status: "not_contacted", sms_delivery_status: "no_claim_link", contact_method: null }).eq("id", lead.id);
      return json({ ok: true, skipped: "no_claim_link", lead_id: lead.id, business: lead.business_name, ...statusPayload });
    }
    const claimUrl = `${CLAIM_ORIGIN}/s/${shareToken}`;

    // SAME template the WhatsApp attempt used + ONE minimal opt-out line.
    const templateName = lead.whatsapp_template && WA_TEMPLATES[lead.whatsapp_template as string] ? (lead.whatsapp_template as string) : WA_DEFAULT_TEMPLATE;
    const messageBody = `${renderTemplateBody(templateName, lead.business_name as string, claimUrl)}\n\n${STOP_LINE}`;
    const segments = smsSegments(messageBody);

    // --- Send (or simulate) ---
    let messageSid: string | null = null;
    let deliveryStatus = "simulated";
    let errorCode: string | null = null;
    let sendError: string | null = null;
    let ok = true;

    if (live) {
      try {
        const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
        const res = await fetch(twilioUrl, {
          method: "POST",
          headers: { Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ To: e164, From: sender, Body: messageBody, StatusCallback: STATUS_CALLBACK_URL }).toString(),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.sid) {
          messageSid = data.sid;
          deliveryStatus = typeof data.status === "string" ? data.status : "queued"; // queued|accepted|sending
        } else {
          ok = false;
          errorCode = data?.code != null ? String(data.code) : String(res.status);
          sendError = JSON.stringify(data ?? {}).slice(0, 500);
          deliveryStatus = "failed";
          console.error(`[sms] send failed (code ${errorCode}):`, sendError);
        }
      } catch (e) {
        ok = false;
        deliveryStatus = "failed";
        sendError = (e as Error).message;
        console.error("[sms] send threw:", sendError);
      }
    } else {
      console.log(`WOULD SEND SMS: template ${templateName} to ${e164} for ${lead.business_name} (${segments} segment${segments === 1 ? "" : "s"})\n----- BODY -----\n${messageBody}\n----------------`);
    }

    const nowIso = new Date().toISOString();
    const attempts = ((lead.sms_attempts as number) ?? 0) + 1;

    // Audit row (an attempt was made → counts toward the daily cap).
    await service.from("sms_sends").insert({
      lead_id: lead.id, user_id: (lead.user_id as string | null) ?? null, template: templateName,
      phone: e164, business_name: lead.business_name, claim_url: claimUrl, body: messageBody,
      segments, test_mode: testMode, message_sid: messageSid, delivery_status: deliveryStatus,
      error_code: errorCode, error: sendError,
    });

    // Route the lead by outcome.
    if (ok) {
      await service.from("outreach_leads").update({
        status: "initial_contact", contact_method: "sms",
        sms_sent_at: nowIso, sms_message_sid: messageSid, sms_delivery_status: deliveryStatus, sms_attempts: attempts,
      }).eq("id", lead.id);
    } else {
      // Failed send → retry to the back of the SMS queue up to the cap, then 'sms_failed'.
      const patch: Record<string, unknown> = { sms_attempts: attempts, sms_delivery_status: "failed", sms_queued_at: nowIso };
      if (attempts >= MAX_SMS_ATTEMPTS) patch.status = "sms_failed";
      await service.from("outreach_leads").update(patch).eq("id", lead.id);
    }

    // Pace the next send (spread quota + jitter) — mirror WhatsApp.
    {
      const remaining = Math.max(1, DAILY_CAP - ((sentToday ?? 0) + 1));
      const minsLeft = minutesUntilWindowEnd();
      const baseGap = minsLeft / remaining;
      const gapMin = Math.min(180, Math.max(20, Math.round(baseGap * (0.6 + Math.random() * 0.8))));
      const next = new Date(Date.now() + gapMin * 60000).toISOString();
      await service.from("sms_outreach_state").update({ next_send_at: next, updated_at: nowIso }).eq("id", 1);
    }

    return json({
      ok: true, sent: ok, simulated: !live, lead_id: lead.id, business: lead.business_name,
      template: templateName, to: e164, segments, message_sid: messageSid,
      delivery_status: deliveryStatus, error_code: errorCode, error: sendError,
      ...statusPayload, sentToday: (sentToday ?? 0) + 1,
    });
  } catch (e) {
    console.error("process-sms-queue error:", e);
    return json({ ok: false, error: "internal" }, 500);
  }
});
