import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { classifyFailure, leadFailurePatch } from "../_shared/whatsapp-failure.ts";
import { renderTemplateBody, templateBodyParams, type TemplateVar } from "../_shared/whatsapp-send.ts";

// process-whatsapp-queue — the WhatsApp outreach processor.
//
// SAFETY-FIRST. TEST_MODE is ON by default: it logs "WOULD SEND …" and updates
// status exactly as a real send would, but calls NOTHING at Meta. A real send
// happens ONLY when WHATSAPP_TEST_MODE === "off" (exactly) AND a token exists.
//
// One send per invocation. Triggered every 10 min by pg_cron (service-role), or
// manually by an admin (a "Run test tick" button) — admins may pass {force:true}
// to bypass the window + spacing FOR OBSERVATION, but only while TEST_MODE is on;
// when live, force is ignored and the window/cap/spacing are always enforced.
//
// Guards (server-side, never UI-only):
//   • 7am–9:30pm Europe/London window (DST-correct via Intl, not the cron schedule)
//   • 40 sends/day GLOBAL cap (one WABA number) — counted from whatsapp_sends
//   • randomised spacing via whatsapp_outreach_state.next_send_at
//   • only status='queued' leads; never re-messages contacted/replied
//
// verify_jwt = false (auth verified in-handler).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GRAPH_VERSION = "v21.0";
const DAILY_CAP = 40;
const WINDOW_START = 7;              // 07:00 Europe/London (inclusive)
const WINDOW_END_MIN = 21 * 60 + 30; // 21:30 Europe/London (exclusive) — minutes-from-midnight so the :30 is honoured
const CLAIM_ORIGIN = "https://yoursites.uk"; // claim links live at /s/<share_token>
const TZ = "Europe/London";

// Approved templates allowlist. `vars` is the BODY variable order for THIS template
// ({{1}} = vars[0], {{2}} = vars[1]); the send fills them strictly in that order, so a
// template with a different layout (e.g. URL first) is never sent with the values
// swapped. The four original templates are {{1}}=name, {{2}}=url — keep that order
// (they're live). `lang` MUST match the template's registered language in Meta exactly.
// A name missing from this list SILENTLY falls back to DEFAULT_TEMPLATE — so every new
// template MUST be added here (and to _shared/whatsapp-send.ts's WA_TEMPLATES).
const TEMPLATES: Record<string, { lang: string; vars: TemplateVar[] }> = {
  booking_page_intro: { lang: "en", vars: ["name", "url"] },
  no_website_barbers: { lang: "en", vars: ["name", "url"] }, // renamed from free_website_intro to match Meta
  barber_poor_website: { lang: "en", vars: ["name", "url"] },
  booking_switch_barbers: { lang: "en", vars: ["name", "url"] }, // "switch from Booksy" — no-commission angle
  // NEW: {{1}} = site URL, {{2}} = business name (REVERSE of the others). "In review"
  // at Meta — sends fail until approved; the code is correct on approval.
  barber_fresha_booksy: { lang: "en", vars: ["url", "name"] },
};
const DEFAULT_TEMPLATE = "booking_page_intro";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Europe/London helpers (DST-correct) ──────────────────────────────────────
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
/** Current Europe/London parts. */
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

/** UK phone → E.164 digits (no '+', as Meta wants). Mirrors send-reminders. */
function toWhatsAppNumber(raw: string, country?: string | null): string | null {
  let s = (raw || "").replace(/[^\d+]/g, "");
  if (!s) return null;
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (s.startsWith("+")) return s.slice(1).replace(/\D/g, "") || null;
  // National formats → assume UK unless clearly another country code already present.
  const cc = (country || "UK").toUpperCase();
  if (s.startsWith("0")) {
    if (cc === "UK" || cc === "GB") return "44" + s.slice(1);
    return s.replace(/\D/g, ""); // unknown national format → best effort
  }
  return s.replace(/\D/g, "") || null;
}

// Body params come from the shared, vars-aware builder (templateBodyParams), filled in
// each template's declared order. See TEMPLATES above + _shared/whatsapp-send.ts.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    // --- Auth: internal cron (CRON_SECRET header, or legacy service-role bearer) OR an admin JWT (manual tick) ---
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
    // send_now: admin "Send now" from the Inbox. Skips ONLY the pacing (not_due) wait and
    // works in LIVE (unlike `force`, which is test-mode-only). It deliberately does NOT
    // bypass pause, the daily cap, or the sending window — those guards get no !sendNow.
    const sendNowReq = body.send_now === true;

    // TEST_MODE: ON unless WHATSAPP_TEST_MODE is exactly "off" AND a token exists.
    const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
    const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
    const testMode = (Deno.env.get("WHATSAPP_TEST_MODE") ?? "on").toLowerCase() !== "off";
    const live = !testMode && !!accessToken && !!phoneNumberId;
    // force only ever bypasses window/spacing for ADMIN observation while in TEST_MODE.
    const force = forceReq && testMode && isAdmin;
    // send_now works in LIVE too (admin-gated), but skips ONLY pacing (see the not_due guard).
    const sendNow = sendNowReq && isAdmin;

    // --- Shared status numbers ---
    const dayStart = londonDayStartUtcIso();
    const { count: sentToday } = await service
      .from("whatsapp_sends").select("id", { count: "exact", head: true }).gte("created_at", dayStart);
    const { count: queuedCount } = await service
      .from("outreach_leads").select("id", { count: "exact", head: true }).eq("status", "queued");
    const { data: stateRow } = await service
      .from("whatsapp_outreach_state").select("next_send_at, paused").eq("id", 1).maybeSingle();
    const nextSendAt: string | null = stateRow?.next_send_at ?? null;
    const paused: boolean = stateRow?.paused === true;
    const uk = londonNow();
    // Minute-granular so the 21:30 end is honoured (a whole-hour compare would run to 21:59).
    const nowMin = uk.hour * 60 + uk.minute;
    const windowOpen = nowMin >= WINDOW_START * 60 && nowMin < WINDOW_END_MIN;

    const statusPayload = {
      testMode, live, sentToday: sentToday ?? 0, cap: DAILY_CAP,
      queuedCount: queuedCount ?? 0, nextSendAt, windowOpen, paused,
      ukTime: `${String(uk.hour).padStart(2, "0")}:${String(uk.minute).padStart(2, "0")}`,
    };

    // Status-only probe (the dashboard panel).
    if (mode === "status") return json({ ok: true, ...statusPayload });

    // Pause / resume (admin-gated, same as this whole handler). Flip the shared flag via
    // the service client (whatsapp_outreach_state is service-role-only RLS). Return the
    // refreshed status with the NEW paused value so the panel reflects it immediately.
    if (mode === "pause" || mode === "resume") {
      const nextPaused = mode === "pause";
      await service.from("whatsapp_outreach_state")
        .update({ paused: nextPaused, updated_at: new Date().toISOString() })
        .eq("id", 1);
      return json({ ok: true, ...statusPayload, paused: nextPaused });
    }

    // --- Tick: decide whether to send one ---
    // Pause guard FIRST — a paused queue sends nothing, even on a forced manual tick.
    if (paused) return json({ ok: true, skipped: "paused", ...statusPayload });
    if (!windowOpen && !force) return json({ ok: true, skipped: "outside_window", ...statusPayload });
    if ((sentToday ?? 0) >= DAILY_CAP) return json({ ok: true, skipped: "cap_reached", ...statusPayload });
    if (nextSendAt && new Date(nextSendAt) > new Date() && !force && !sendNow) {
      return json({ ok: true, skipped: "not_due", ...statusPayload });
    }

    // Oldest queued lead with a phone.
    const { data: lead } = await service
      .from("outreach_leads")
      .select("id, business_name, phone, country, whatsapp_template, whatsapp_attempts, whatsapp_delivery_status, whatsapp_ever_delivered, user_id")
      .eq("status", "queued")
      .not("phone", "is", null)
      .order("queued_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!lead) return json({ ok: true, skipped: "empty_queue", ...statusPayload });

    // Resolve the lead's claim link (the {{2}} variable). Also pull first_opened_at
    // (no extra round-trip) as durable proof-of-reach for the no_whatsapp guard below.
    const { data: site } = await service
      .from("generated_sites")
      .select("share_token, first_opened_at")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const shareToken: string | null = site?.share_token ?? null;
    if (!shareToken) {
      // Can't send the claim link → drop it out of the queue so it can't block,
      // and surface why. Operator can re-queue once the site exists.
      await service.from("outreach_leads").update({
        status: "not_contacted", whatsapp_delivery_status: "no_claim_link", contact_method: null,
      }).eq("id", lead.id);
      return json({ ok: true, skipped: "no_claim_link", lead_id: lead.id, business: lead.business_name, ...statusPayload });
    }

    const claimUrl = `${CLAIM_ORIGIN}/s/${shareToken}`;
    const templateName = lead.whatsapp_template && TEMPLATES[lead.whatsapp_template] ? lead.whatsapp_template : DEFAULT_TEMPLATE;
    const lang = TEMPLATES[templateName].lang;
    const toNumber = toWhatsAppNumber(lead.phone as string, lead.country as string | null);
    if (!toNumber) {
      await service.from("outreach_leads").update({
        status: "not_contacted", whatsapp_delivery_status: "bad_number", contact_method: null,
      }).eq("id", lead.id);
      return json({ ok: true, skipped: "bad_number", lead_id: lead.id, business: lead.business_name, ...statusPayload });
    }

    // --- Send (or simulate) ---
    // outcome drives lead routing: 'sent' (delivered to Meta), 'no_whatsapp'
    // (permanent — not a WhatsApp number), 'temporary' (retryable failure).
    let messageId: string | null = null;
    let outcome: "sent" | "no_whatsapp" | "temporary" = "sent"; // simulation = sent
    let deliveryStatus = "simulated";
    let failCode: number | undefined;
    let sendError: string | null = null;

    if (live) {
      try {
        const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: toNumber,
            type: "template",
            template: { name: templateName, language: { code: lang }, components: templateBodyParams(TEMPLATES[templateName].vars, lead.business_name as string, claimUrl) },
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.messages?.[0]?.id) {
          messageId = data.messages[0].id;
          outcome = "sent";
          deliveryStatus = "sent";
        } else {
          failCode = typeof data?.error?.code === "number" ? data.error.code : undefined;
          sendError = JSON.stringify(data?.error ?? data).slice(0, 500);
          outcome = classifyFailure(failCode) === "permanent" ? "no_whatsapp" : "temporary";
          deliveryStatus = outcome === "no_whatsapp" ? "no_whatsapp" : "failed_temporary";
          console.error(`[whatsapp] send failed (code ${failCode ?? "?"}, ${outcome}):`, sendError);
        }
      } catch (e) {
        // Network/throw → treat as temporary (retryable), never as not-on-WhatsApp.
        outcome = "temporary";
        deliveryStatus = "failed_temporary";
        sendError = (e as Error).message;
        console.error("[whatsapp] send threw (temporary):", sendError);
      }
    } else {
      console.log(`WOULD SEND: template ${templateName} to ${toNumber} for ${lead.business_name} (claim ${claimUrl})`);
    }

    const nowIso = new Date().toISOString();
    const attempts = ((lead.whatsapp_attempts as number) ?? 0) + 1;

    // Audit row (an attempt was made → counts toward the daily cap).
    await service.from("whatsapp_sends").insert({
      lead_id: lead.id, user_id: null, template: templateName, phone: toNumber,
      business_name: lead.business_name, claim_url: claimUrl, test_mode: testMode,
      message_id: messageId, delivery_status: deliveryStatus, error: sendError,
    });

    // Route the lead by outcome:
    if (outcome === "sent") {
      // Delivered to Meta (or simulated) → Contacted, out of the queue.
      await service.from("outreach_leads").update({
        status: "initial_contact",
        whatsapp_sent_at: nowIso,
        whatsapp_template: templateName,
        whatsapp_message_id: messageId,
        whatsapp_delivery_status: deliveryStatus,
        whatsapp_attempts: attempts,
      }).eq("id", lead.id);

      // Log the outbound row in whatsapp_messages so this send shows in the Inbox
      // thread AND resolveOwner's most-recent-outbound match can attribute a future
      // reply to the exact lead (+ its campaign, derived via lead_id). Mirrors
      // send-whatsapp-message's shape. Campaign is NOT stored (no such column —
      // derived via lead_id). NON-BLOCKING: the WhatsApp message is already sent by
      // now; a failed log must never throw / retry / double-send — log and move on.
      try {
        const { error: msgErr } = await service.from("whatsapp_messages").insert({
          direction: "outbound",
          user_id: (lead.user_id as string | null) ?? null, // the lead's owner (inbox ownership + reply attribution)
          lead_id: lead.id,
          phone: toNumber,                                   // the number actually messaged (E.164 digits)
          body: renderTemplateBody(templateName, lead.business_name as string, claimUrl),
          message_type: "template",
          template_name: templateName,
          wa_message_id: messageId,                          // null on a simulated (TEST_MODE) send
          status: deliveryStatus,                            // 'sent' | 'simulated'
          test_mode: testMode,
        });
        if (msgErr) console.error(`[whatsapp] outbound message-log insert failed (non-blocking, ${lead.id}):`, (msgErr as { message?: string }).message);
      } catch (e) {
        console.error(`[whatsapp] outbound message-log insert threw (non-blocking, ${lead.id}):`, (e as Error).message);
      }
    } else {
      // Failure (permanent no_whatsapp OR temporary retry). Shared routing so the
      // processor and the status webhook behave identically: 131026 → no_whatsapp
      // (dequeued); otherwise retry to the back of the queue up to the cap, then
      // 'whatsapp_failed'. Guard: a permanent failure on a lead with PROOF of prior
      // reach (ever delivered/read, site opened, or a current delivered/read status)
      // must NOT flip it to no_whatsapp — this is a spurious/follow-up failure. A
      // brand-new lead failing on its first send has none of these → still no_whatsapp.
      const hasPriorSuccess =
        lead.whatsapp_ever_delivered === true ||
        !!site?.first_opened_at ||
        ["delivered", "read"].includes((lead.whatsapp_delivery_status as string) ?? "");
      await service.from("outreach_leads")
        .update(leadFailurePatch(failCode, (lead.whatsapp_attempts as number) ?? 0, nowIso, hasPriorSuccess))
        .eq("id", lead.id);
    }

    // Pace the next send after ANY real/simulated attempt (spread quota + jitter).
    {
      const remaining = Math.max(1, DAILY_CAP - ((sentToday ?? 0) + 1));
      const minsLeft = minutesUntilWindowEnd();
      const baseGap = minsLeft / remaining;
      const gapMin = Math.min(180, Math.max(20, Math.round(baseGap * (0.6 + Math.random() * 0.8))));
      const next = new Date(Date.now() + gapMin * 60000).toISOString();
      await service.from("whatsapp_outreach_state").update({ next_send_at: next, updated_at: nowIso }).eq("id", 1);
    }

    return json({
      ok: true,
      sent: outcome === "sent",
      simulated: !live,
      outcome,
      lead_id: lead.id,
      business: lead.business_name,
      template: templateName,
      to: toNumber,
      claim_url: claimUrl,
      message_id: messageId,
      delivery_status: deliveryStatus,
      fail_code: failCode,
      error: sendError,
      ...statusPayload,
      sentToday: (sentToday ?? 0) + 1,
    });
  } catch (e) {
    console.error("process-whatsapp-queue error:", e);
    return json({ ok: false, error: "internal" }, 500);
  }
});
