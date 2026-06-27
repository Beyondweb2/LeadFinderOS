import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
//   • 7am–7pm Europe/London window (DST-correct via Intl, not the cron schedule)
//   • 10 sends/day GLOBAL cap (one WABA number) — counted from whatsapp_sends
//   • randomised spacing via whatsapp_outreach_state.next_send_at
//   • only status='queued' leads; never re-messages contacted/replied
//
// verify_jwt = false (auth verified in-handler).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GRAPH_VERSION = "v21.0";
const DAILY_CAP = 10;
const WINDOW_START = 7;   // 07:00 Europe/London (inclusive)
const WINDOW_END = 19;    // 19:00 Europe/London (exclusive)
const CLAIM_ORIGIN = "https://yoursites.uk"; // claim links live at /s/<share_token>
const TZ = "Europe/London";

// Approved templates allowlist. Both carry {{1}}=business name, {{2}}=claim URL in
// the BODY. lang MUST match the template's registered language in Meta exactly —
// VERIFY before the live cutover (TEST_MODE protects you until then). If a template
// is later changed to put the claim URL in a URL BUTTON, adjust templateComponents.
const TEMPLATES: Record<string, { lang: string }> = {
  booking_page_intro: { lang: "en_GB" },
  free_website_intro: { lang: "en_GB" },
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
  return Math.max(0, WINDOW_END * 60 - (n.hour * 60 + n.minute));
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

/** Body params for a template: {{1}} business name, {{2}} claim URL. */
function templateComponents(businessName: string, claimUrl: string) {
  return [{
    type: "body",
    parameters: [
      { type: "text", text: businessName || "your business" },
      { type: "text", text: claimUrl },
    ],
  }];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    // --- Auth: service-role bearer (cron) OR an admin JWT (manual tick) ---
    const authHeader = req.headers.get("Authorization") ?? "";
    const isCron = !!serviceKey && authHeader === `Bearer ${serviceKey}`;
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

    // TEST_MODE: ON unless WHATSAPP_TEST_MODE is exactly "off" AND a token exists.
    const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
    const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
    const testMode = (Deno.env.get("WHATSAPP_TEST_MODE") ?? "on").toLowerCase() !== "off";
    const live = !testMode && !!accessToken && !!phoneNumberId;
    // force only ever bypasses window/spacing for ADMIN observation while in TEST_MODE.
    const force = forceReq && testMode && isAdmin;

    // --- Shared status numbers ---
    const dayStart = londonDayStartUtcIso();
    const { count: sentToday } = await service
      .from("whatsapp_sends").select("id", { count: "exact", head: true }).gte("created_at", dayStart);
    const { count: queuedCount } = await service
      .from("outreach_leads").select("id", { count: "exact", head: true }).eq("status", "queued");
    const { data: stateRow } = await service
      .from("whatsapp_outreach_state").select("next_send_at").eq("id", 1).maybeSingle();
    const nextSendAt: string | null = stateRow?.next_send_at ?? null;
    const uk = londonNow();
    const windowOpen = uk.hour >= WINDOW_START && uk.hour < WINDOW_END;

    const statusPayload = {
      testMode, live, sentToday: sentToday ?? 0, cap: DAILY_CAP,
      queuedCount: queuedCount ?? 0, nextSendAt, windowOpen,
      ukTime: `${String(uk.hour).padStart(2, "0")}:${String(uk.minute).padStart(2, "0")}`,
    };

    // Status-only probe (the dashboard panel).
    if (mode === "status") return json({ ok: true, ...statusPayload });

    // --- Tick: decide whether to send one ---
    if (!windowOpen && !force) return json({ ok: true, skipped: "outside_window", ...statusPayload });
    if ((sentToday ?? 0) >= DAILY_CAP) return json({ ok: true, skipped: "cap_reached", ...statusPayload });
    if (nextSendAt && new Date(nextSendAt) > new Date() && !force) {
      return json({ ok: true, skipped: "not_due", ...statusPayload });
    }

    // Oldest queued lead with a phone.
    const { data: lead } = await service
      .from("outreach_leads")
      .select("id, business_name, phone, country, whatsapp_template")
      .eq("status", "queued")
      .not("phone", "is", null)
      .order("queued_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!lead) return json({ ok: true, skipped: "empty_queue", ...statusPayload });

    // Resolve the lead's claim link (the {{2}} variable).
    const { data: site } = await service
      .from("generated_sites")
      .select("share_token")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const shareToken: string | null = site?.share_token ?? null;
    if (!shareToken) {
      // Can't send the claim link → drop it out of the queue so it can't block,
      // and surface why. Operator can re-queue once the site exists.
      await service.from("outreach_leads").update({
        status: "not_contacted", whatsapp_delivery_status: "no_claim_link",
      }).eq("id", lead.id);
      return json({ ok: true, skipped: "no_claim_link", lead_id: lead.id, business: lead.business_name, ...statusPayload });
    }

    const claimUrl = `${CLAIM_ORIGIN}/s/${shareToken}`;
    const templateName = lead.whatsapp_template && TEMPLATES[lead.whatsapp_template] ? lead.whatsapp_template : DEFAULT_TEMPLATE;
    const lang = TEMPLATES[templateName].lang;
    const toNumber = toWhatsAppNumber(lead.phone as string, lead.country as string | null);
    if (!toNumber) {
      await service.from("outreach_leads").update({
        status: "not_contacted", whatsapp_delivery_status: "bad_number",
      }).eq("id", lead.id);
      return json({ ok: true, skipped: "bad_number", lead_id: lead.id, business: lead.business_name, ...statusPayload });
    }

    // --- Send (or simulate) ---
    let messageId: string | null = null;
    let deliveryStatus = "simulated";
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
            template: { name: templateName, language: { code: lang }, components: templateComponents(lead.business_name as string, claimUrl) },
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data?.messages?.[0]?.id) {
          messageId = data.messages[0].id;
          deliveryStatus = "sent";
        } else {
          deliveryStatus = "failed";
          sendError = JSON.stringify(data?.error ?? data).slice(0, 500);
          console.error("[whatsapp] send failed:", sendError);
        }
      } catch (e) {
        deliveryStatus = "failed";
        sendError = (e as Error).message;
        console.error("[whatsapp] send threw:", sendError);
      }
    } else {
      console.log(`WOULD SEND: template ${templateName} to ${toNumber} for ${lead.business_name} (claim ${claimUrl})`);
    }

    const nowIso = new Date().toISOString();
    const succeeded = live ? deliveryStatus === "sent" : true; // simulation always "succeeds"

    // Audit row (counts toward the daily cap — simulated sends included, by design).
    await service.from("whatsapp_sends").insert({
      lead_id: lead.id, user_id: null, template: templateName, phone: toNumber,
      business_name: lead.business_name, claim_url: claimUrl, test_mode: testMode,
      message_id: messageId, delivery_status: deliveryStatus, error: sendError,
    });

    // Only advance the lead to Contacted when the send (or simulation) succeeded.
    if (succeeded) {
      await service.from("outreach_leads").update({
        status: "initial_contact",
        whatsapp_sent_at: nowIso,
        whatsapp_template: templateName,
        whatsapp_message_id: messageId,
        whatsapp_delivery_status: deliveryStatus,
      }).eq("id", lead.id);
    } else {
      // Real send failed → leave it queued for the next tick, record the status.
      await service.from("outreach_leads").update({ whatsapp_delivery_status: deliveryStatus }).eq("id", lead.id);
    }

    // Schedule the next send: spread remaining quota across the rest of the window,
    // with jitter so it's never clockwork.
    if (succeeded) {
      const remaining = Math.max(1, DAILY_CAP - ((sentToday ?? 0) + 1));
      const minsLeft = minutesUntilWindowEnd();
      const baseGap = minsLeft / remaining;
      const gapMin = Math.min(180, Math.max(20, Math.round(baseGap * (0.6 + Math.random() * 0.8))));
      const next = new Date(Date.now() + gapMin * 60000).toISOString();
      await service.from("whatsapp_outreach_state").update({ next_send_at: next, updated_at: nowIso }).eq("id", 1);
    }

    return json({
      ok: true,
      sent: succeeded,
      simulated: !live,
      lead_id: lead.id,
      business: lead.business_name,
      template: templateName,
      to: toNumber,
      claim_url: claimUrl,
      message_id: messageId,
      delivery_status: deliveryStatus,
      error: sendError,
      ...statusPayload,
      sentToday: (sentToday ?? 0) + (succeeded ? 1 : 0),
    });
  } catch (e) {
    console.error("process-whatsapp-queue error:", e);
    return json({ ok: false, error: "internal" }, 500);
  }
});
