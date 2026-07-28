import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { classifyFailure, leadFailurePatch } from "../_shared/whatsapp-failure.ts";
import { renderTemplateBody, templateBodyParams, claimTemplatePayload, sendViaGraph, WA_TEMPLATES, TEMPLATES_NEEDING_REAL_NAME, type TemplateVar } from "../_shared/whatsapp-send.ts";
import { resolveOnboardingFollowupVars } from "../_shared/onboarding-followup.ts";
import { classifyLineType } from "../_shared/line-type.ts";
import { resolveAuditReplyVars } from "../_shared/audit-reply.ts";
import { autoReplyEnvOn, autoReplyToggleOn, firstReplyTemplate, isDecline, phoneSuppressed, pitchEverSent } from "../_shared/auto-reply-rules.ts";

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
/* THE DAILY BRAKE. Change this one number to change the cap — it is read in three places (the
   status payload, the tick's cap check, and the pacing calculation below) and nowhere else.
   Counted as a CALENDAR DAY IN EUROPE/LONDON, not a rolling 24 hours and not the operator's local
   time: `sentToday` counts whatsapp_sends rows since londonDayStartUtcIso(). It resets at London
   midnight, which is 07:00 in Bangkok.
   It counts EVERY row in whatsapp_sends, which since the send-logging fix includes Inbox replies and
   auto-replies, not just this campaign. On 2026-07-27 that mattered: 40 sends hit the cap exactly,
   13 of them automated audit_reply pitches rather than campaign sends.

   ⚠️ RAISING THIS DOES NOT RAISE THROUGHPUT ONE-FOR-ONE. The pacing gap below is
   minutesUntilWindowEnd() / (DAILY_CAP - sentToday), clamped to a 20-minute FLOOR. Past roughly 43
   the floor binds before the cap does, so the real ceiling is the window length divided by 20
   minutes — about 43 sends across the 07:00–21:30 London window. The cap is a brake, not a target.
   process-sms-queue has its OWN separate DAILY_CAP; this constant does not affect it. */
const DAILY_CAP = 100;
const WINDOW_START = 7;              // 07:00 Europe/London (inclusive)
const WINDOW_END_MIN = 21 * 60 + 30; // 21:30 Europe/London (exclusive) — minutes-from-midnight so the :30 is honoured
const CLAIM_ORIGIN = "https://yoursites.uk"; // claim links live at /s/<share_token>
const TZ = "Europe/London";

// Approved templates allowlist. `vars` is the BODY variable order for THIS template
// ({{1}} = vars[0], {{2}} = vars[1]); the send fills them strictly in that order, so a
// template with a different layout (e.g. URL first) is never sent with the values
// swapped. The four original templates are {{1}}=name, {{2}}=url — keep that order
// (they're live). `lang` MUST match the template's registered language in Meta exactly.
// A name missing from this list now REFUSES THE SEND with error "unknown_template" and drops the
// lead out of the queue with that reason — it no longer falls back to another template. Every new
// template MUST still be added here (and to _shared/whatsapp-send.ts's WA_TEMPLATES), the
// difference being that forgetting is now visible instead of silently sending the wrong pitch.
const TEMPLATES: Record<string, { lang: string; vars: TemplateVar[] }> = {
  booking_page_intro: { lang: "en", vars: ["name", "url"] },
  no_website_barbers: { lang: "en", vars: ["name", "url"] }, // renamed from free_website_intro to match Meta
  barber_poor_website: { lang: "en", vars: ["name", "url"] },
  booking_switch_barbers: { lang: "en", vars: ["name", "url"] }, // "switch from Booksy" — no-commission angle
  // NEW: {{1}} = site URL, {{2}} = business name (REVERSE of the others). "In review"
  // at Meta — sends fail until approved; the code is correct on approval.
  barber_fresha_booksy: { lang: "en", vars: ["url", "name"] },
  // Opener — ONE variable: {{1}} = business name, NO url. vars MUST stay ["name"] (one param).
  initial_contact: { lang: "en", vars: ["name"] },
  // Was MISSING while being selectable in the bulk picker, so a lead set to audit_reply silently
  // received booking_page_intro — a barber booking pitch. No lead was ever queued with it, so
  // nothing mis-sent, but the gap was live.
  audit_reply: { lang: "en", vars: ["trade", "competitors", "name", "url"] },
  // Follow-up to a warm lead after the 24h window: {{1}} business name, {{2}} onboarding URL.
  onboarding_followup: { lang: "en", vars: ["name", "onboarding_url"] },
  // "You said a call works" nudge. ONE variable: {{1}} = business name. No url.
  book_call: { lang: "en", vars: ["name"] },
};
/* NO DEFAULT_TEMPLATE.
   It used to be booking_page_intro, applied whenever a lead's whatsapp_template was unset or
   unrecognised. That turned a registration slip into a wrong message: a plumber could receive a
   barber booking pitch, and nothing in the logs or the UI said so. A prospect getting the wrong
   message is unrecoverable; a send that fails visibly is a five-minute fix. So an unresolvable
   template now refuses and says why. */

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
      // Auto audit_reply rule state: BOTH must be on for the rule to run. Toggle read is
      // defensive (missing column → false), so status works before the SQL has been run.
      autoReplyEnvOn: autoReplyEnvOn(),
      autoReplyEnabled: await autoReplyToggleOn(service),
      // D2 — the completion auto-send template (null = off). Defensive read: missing column → null.
      auditCompleteTemplate: await (async () => {
        try {
          const { data: st, error: stErr } = await service
            .from("whatsapp_outreach_state").select("audit_complete_template").eq("id", 1).maybeSingle();
          return stErr ? null : ((st?.audit_complete_template as string | null) ?? null);
        } catch { return null; }
      })(),
      // The reply-trigger template (null = default audit_reply). Defensive like the others.
      firstReplyTemplate: await firstReplyTemplate(service),
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

    // Flip the auto audit_reply UI toggle (admin-gated like pause). The env kill-switch
    // AUTO_AUDIT_REPLY_ENABLED still gates actual sends — both must be on.
    if (mode === "set_auto_reply") {
      const enabled = body.enabled === true;
      const { error: tErr } = await service.from("whatsapp_outreach_state")
        .update({ auto_reply_enabled: enabled, updated_at: new Date().toISOString() })
        .eq("id", 1);
      if (tErr) return json({ ok: false, error: "toggle_failed", detail: tErr.message }, 500);
      return json({ ok: true, ...statusPayload, autoReplyEnabled: enabled });
    }

    // D2 — set the completion auto-send template (admin-gated like pause). Pass template: null (or
    // "") to turn the feature off. Validated against the shared allowlist so a typo can't queue
    // unsendable rows. The AUTO_AUDIT_REPLY_ENABLED master switch still gates actual sends.
    if (mode === "set_audit_complete_template") {
      const raw = typeof body.template === "string" ? body.template.trim() : "";
      const next: string | null = raw ? raw : null;
      if (next && !WA_TEMPLATES[next]) return json({ ok: false, error: "unknown_template" }, 400);
      const { error: sErr } = await service.from("whatsapp_outreach_state")
        .update({ audit_complete_template: next, updated_at: new Date().toISOString() })
        .eq("id", 1);
      if (sErr) return json({ ok: false, error: "setting_failed", detail: sErr.message }, 500);
      return json({ ok: true, ...statusPayload, auditCompleteTemplate: next });
    }

    // Set the REPLY-trigger template (admin-gated). template: null/"" → default audit_reply.
    // Validated against the shared allowlist so a typo can't queue unsendable rows.
    if (mode === "set_first_reply_template") {
      const raw = typeof body.template === "string" ? body.template.trim() : "";
      const next: string | null = raw ? raw : null;
      if (next && !WA_TEMPLATES[next]) return json({ ok: false, error: "unknown_template" }, 400);
      const { error: sErr } = await service.from("whatsapp_outreach_state")
        .update({ first_reply_template: next, updated_at: new Date().toISOString() })
        .eq("id", 1);
      if (sErr) return json({ ok: false, error: "setting_failed", detail: sErr.message }, 500);
      return json({ ok: true, ...statusPayload, firstReplyTemplate: next });
    }

    // ── mode 'auto_replies': drain due whatsapp_auto_replies rows (its own every-minute cron) ──
    // DELIBERATELY exempt from the outreach pause/window/cap/spacing below: these are replies to
    // leads who messaged US (template send, deliverable any time), not cold outreach. Controls are
    // the env kill-switch + the Inbox UI toggle, both re-checked here (send time), not queue time.
    if (mode === "auto_replies") {
      // Master kill-switch gates EVERYTHING (both triggers). Per-trigger switches are checked
      // per row below: first_reply rows need the Inbox toggle; audit_complete rows need the
      // audit_complete_template setting to still be non-null. A row whose own switch is off is
      // LEFT pending (rule paused, resumes if re-enabled) — never silently dropped.
      if (!autoReplyEnvOn()) return json({ ok: true, mode, skipped: "env_off", processed: 0 });
      const replyToggleOn = await autoReplyToggleOn(service);
      let completeTemplateOn = false;
      try {
        const { data: st, error: stErr } = await service
          .from("whatsapp_outreach_state").select("audit_complete_template").eq("id", 1).maybeSingle();
        if (!stErr) completeTemplateOn = !!st?.audit_complete_template;
      } catch { /* column missing → audit_complete rows stay pending */ }

      const nowIso = new Date().toISOString();
      const { data: due, error: dueErr } = await service
        .from("whatsapp_auto_replies")
        .select("id, lead_id, phone, created_at, trigger, template_name")
        .eq("status", "pending")
        .lt("fire_after", nowIso)
        .order("fire_after", { ascending: true })
        .limit(10);
      if (dueErr) return json({ ok: true, mode, skipped: "table_unavailable", detail: dueErr.message, processed: 0 });

      let processed = 0;
      const results: Record<string, string> = {};
      for (const row of (due ?? []) as Array<{ id: string; lead_id: string; phone: string; created_at: string; trigger?: string | null; template_name?: string | null }>) {
        // Per-trigger switch (see above). Default trigger (pre-SQL rows / null) = first_reply.
        const trigger = row.trigger || "first_reply";
        if (trigger === "first_reply" && !replyToggleOn) continue;
        if (trigger === "audit_complete" && !completeTemplateOn) continue;
        // Atomic per-row claim — overlapping ticks can't double-send. (A crash after claiming
        // leaves the row 'processing', which fails SAFE — it never sends — and is visible in the
        // table for a manual nudge; volumes are tiny by design.)
        const { data: claimed } = await service.from("whatsapp_auto_replies")
          .update({ status: "processing", updated_at: nowIso })
          .eq("id", row.id).eq("status", "pending").select("id");
        if (!Array.isArray(claimed) || claimed.length === 0) continue;
        const finish = (status: string, reason?: string) =>
          service.from("whatsapp_auto_replies")
            .update({ status, reason: reason ? reason.slice(0, 300) : null, updated_at: new Date().toISOString() })
            .eq("id", row.id);
        try {
          // 1) A decline arriving AFTER queueing cancels the send — the whole point of the delay.
          const { data: newer } = await service.from("whatsapp_messages")
            .select("body").eq("lead_id", row.lead_id).eq("direction", "inbound")
            .gt("created_at", row.created_at);
          if (((newer ?? []) as Array<{ body?: string }>).some((m) => isDecline(m.body ?? ""))) {
            await finish("cancelled_decline");
            results[row.lead_id] = "cancelled_decline";
            continue;
          }
          // 2) Send-time status + suppression (checked HERE, not just at queue time).
          const { data: lead } = await service.from("outreach_leads")
            .select("id, user_id, status, business_name").eq("id", row.lead_id).maybeSingle();
          if (!lead) { await finish("flagged_error", "lead_missing"); results[row.lead_id] = "flagged_error"; continue; }
          if (["opted_out", "not_interested"].includes(lead.status as string) || (await phoneSuppressed(service, row.phone))) {
            await finish("skipped_suppressed");
            results[row.lead_id] = "skipped_suppressed";
            continue;
          }
          // 3) Resolve the template + its variables. Default (and the whole first_reply rule) is
          //    audit_reply via the per-lead-safe resolver the Inbox uses; audit_complete rows may
          //    carry any allowlisted template. url-templates need the lead's claim link — missing
          //    → flagged_no_link, NEVER a broken send.
          const templateName = row.template_name || "audit_reply";
          // DURABLE once-ever (send time): the MESSAGE LOG is the authoritative "this pitch
          // already went out" marker — it survives queue-row deletion and covers pitches sent
          // OUTSIDE this machinery (manual Inbox sends). This is exactly the Jack/Ben duplicate:
          // a manual audit_reply landed while this row sat pending, then the drainer re-sent it.
          if (await pitchEverSent(service, row.lead_id, templateName)) {
            await finish("skipped_already_sent");
            results[row.lead_id] = "skipped_already_sent";
            continue;
          }
          const tmpl = WA_TEMPLATES[templateName];
          if (!tmpl) { await finish("flagged_error", `unknown_template:${templateName}`); results[row.lead_id] = "flagged_error"; continue; }
          let payload: Record<string, unknown>;
          let renderedBody: string;
          // Hoisted for the send-audit row below: the name and the outbound link actually used.
          // For audit_reply-class the link IS the report link — the same "outbound URL" column.
          let businessName = ((lead.business_name as string) ?? "").trim();
          let claimUrl = "";
          if (tmpl.vars.includes("trade") || tmpl.vars.includes("competitors")) {
            // audit_reply-class: needs the lead's own completed audit.
            const vars = await resolveAuditReplyVars(service, row.lead_id);
            if (!vars.ok) { await finish("flagged_no_audit", vars.reason); results[row.lead_id] = "flagged_no_audit"; continue; }
            payload = claimTemplatePayload(templateName, tmpl.lang, vars.business, vars.link, { trade: vars.trade, competitors: vars.competitors });
            renderedBody = renderTemplateBody(templateName, vars.business, vars.link, vars.trade, vars.competitors);
            businessName = vars.business;
            claimUrl = vars.link;
          } else {
            if (tmpl.vars.includes("url")) {
              const { data: site } = await service.from("generated_sites")
                .select("share_token").eq("lead_id", row.lead_id)
                .order("created_at", { ascending: false }).limit(1).maybeSingle();
              const shareToken = (site?.share_token as string | null) ?? null;
              if (!shareToken) { await finish("flagged_no_link", "no claim link for a url template"); results[row.lead_id] = "flagged_no_link"; continue; }
              claimUrl = `${CLAIM_ORIGIN}/s/${shareToken}`;
            }
            payload = claimTemplatePayload(templateName, tmpl.lang, businessName, claimUrl);
            renderedBody = renderTemplateBody(templateName, businessName, claimUrl);
          }
          let sendStatus = "simulated";
          let messageId: string | null = null;
          let sendErr: string | null = null;
          if (live) {
            const r = await sendViaGraph(accessToken, phoneNumberId, row.phone, payload);
            if (r.ok) { sendStatus = "sent"; messageId = r.messageId; } else { sendStatus = "failed"; sendErr = r.error; }
          } else {
            console.log(`[auto-reply] WOULD SEND audit_reply to ${row.phone} (test mode): ${renderedBody.slice(0, 120)}…`);
          }
          // Log the outbound row so the send lands in the lead's Inbox thread.
          await service.from("whatsapp_messages").insert({
            direction: "outbound", user_id: (lead.user_id as string | null) ?? null, lead_id: row.lead_id,
            phone: row.phone, body: renderedBody, message_type: "template", template_name: templateName,
            wa_message_id: messageId, status: sendStatus, test_mode: !live, error: sendErr,
          });
          /* And the send-audit row. This branch wrote only the message log, so auto-replies were
             invisible to whatsapp_sends — including to the DAILY CAP counted a few hundred lines
             up, which meant automated pitches never counted against the day's Meta volume.
             Non-blocking: the send already happened. */
          try {
            const { error: sendLogErr } = await service.from("whatsapp_sends").insert({
              lead_id: row.lead_id, user_id: null, template: templateName, phone: row.phone,
              business_name: businessName || null, claim_url: claimUrl, test_mode: !live,
              message_id: messageId, delivery_status: sendStatus, error: sendErr,
            });
            if (sendLogErr) console.error(`[auto-reply] send-audit insert failed (non-blocking, ${row.lead_id}):`, sendLogErr.message);
          } catch (e) {
            console.error(`[auto-reply] send-audit insert threw (non-blocking, ${row.lead_id}):`, (e as Error).message);
          }
          if (sendStatus === "failed") {
            await finish("flagged_error", sendErr ?? "send_failed");
            results[row.lead_id] = "failed";
          } else {
            await finish("sent");
            processed++;
            results[row.lead_id] = sendStatus;
            // The automated pitch went out (LIVE sends only — simulated test sends don't move the
            // pipeline). Forward-only, mirroring the webhook's pattern: never overwrite the
            // interested/paid-class statuses; replied → report_sent is the intended transition.
            if (sendStatus === "sent") {
              try {
                await service.from("outreach_leads")
                  .update({ status: "report_sent" })
                  .eq("id", row.lead_id)
                  .not("status", "in", "(interested,price_given,payment_received,in_delivery,completed)");
              } catch (e) {
                console.error(`[auto-reply] report_sent status write failed for lead ${row.lead_id}:`, (e as Error).message);
              }
            }
          }
        } catch (e) {
          await finish("flagged_error", (e as Error).message);
          results[row.lead_id] = "flagged_error";
        }
      }
      return json({ ok: true, mode, processed, results });
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
      .select("id, business_name, phone, country, whatsapp_template, whatsapp_attempts, whatsapp_delivery_status, whatsapp_ever_delivered, previous_status, user_id")
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
    // Resolve the template FIRST so the claim-link requirement can be conditional. A url-less
    // opener (e.g. initial_contact, vars ["name"]) is sent BEFORE any site exists, so it must NOT
    // be gated on a share_token; only templates that actually use a url var need the link.
    /* STRICT template resolution — no substitution, ever. Same drop-out-of-the-queue shape as the
       no_claim_link and bad_number guards below, so an operator sees it in the same place: the lead
       leaves 'queued' (it must never block the single-lead-per-tick drip) and carries a delivery
       status naming the cause. Re-queue once the template is set or registered.
       An UNSET template is refused as well as an unrecognised one: defaulting an unset value is how
       a wrong message got sent in the first place, and no currently-queued lead relies on it. */
    const requestedTemplate = ((lead.whatsapp_template as string | null) ?? "").trim();
    if (!requestedTemplate) {
      await service.from("outreach_leads").update({
        status: "not_contacted", whatsapp_delivery_status: "no_template", contact_method: null,
      }).eq("id", lead.id);
      return json({
        ok: false,
        error: "no_template",
        reason: `${lead.business_name ?? "That lead"} has no WhatsApp template set, so there is nothing to send. Pick one on the lead and re-queue it.`,
        lead_id: lead.id,
        business: lead.business_name,
        ...statusPayload,
      }, 200);
    }
    if (!TEMPLATES[requestedTemplate]) {
      await service.from("outreach_leads").update({
        status: "not_contacted", whatsapp_delivery_status: "unknown_template", contact_method: null,
      }).eq("id", lead.id);
      return json({
        ok: false,
        error: "unknown_template",
        reason: `Template "${requestedTemplate}" is not registered in the queue's allowlist, so nothing was sent to ${lead.business_name ?? "that lead"}. Nothing else was sent in its place. Register it in process-whatsapp-queue's TEMPLATES (and _shared/whatsapp-send.ts) before re-queueing.`,
        lead_id: lead.id,
        business: lead.business_name,
        ...statusPayload,
      }, 200);
    }
    const templateName = requestedTemplate;
    const lang = TEMPLATES[templateName].lang;
    const tvars = TEMPLATES[templateName].vars;
    /* Only templates whose url IS the claim link need a share_token. audit_reply also declares a
       "url" var, but its link is the lead's AUDIT REPORT, resolved below — gating it on a generated
       site would refuse a report pitch to any lead that never had a site built, which is most of
       them. onboarding_followup uses its own var and is never gated here. */
    const urlIsClaimLink = tvars.includes("url") && !tvars.includes("trade") && !tvars.includes("competitors");
    const needsUrl = urlIsClaimLink;
    if (needsUrl && !shareToken) {
      // A url template with no claim link → drop it out of the queue so it can't block, and
      // surface why. Operator can re-queue once the site exists. (Unchanged for name+url templates.)
      await service.from("outreach_leads").update({
        status: "not_contacted", whatsapp_delivery_status: "no_claim_link", contact_method: null,
      }).eq("id", lead.id);
      return json({ ok: true, skipped: "no_claim_link", lead_id: lead.id, business: lead.business_name, ...statusPayload });
    }

    // "" when there's no token — safe because templateBodyParams only fills the url param for
    // templates whose vars include "url" (url-less templates never reference it).
    const claimUrl = shareToken ? `${CLAIM_ORIGIN}/s/${shareToken}` : "";

    /* PER-LEAD VARIABLES for templates whose content is resolved rather than templated from the
       lead row. Same refuse-with-a-reason contract as the guards above: a template that cannot be
       filled correctly does not go out at all, and never goes out as something else.
       audit_reply and onboarding_followup are both reachable here now that they are registered, so
       both are resolved before the send rather than sent with empty parameters. */
    /* A template whose copy opens with the name cannot go out without one. Same drop-out-of-the-queue
       shape as the guards above, so it surfaces where the operator already looks. */
    if (TEMPLATES_NEEDING_REAL_NAME.has(templateName) && !((lead.business_name as string) ?? "").trim()) {
      await service.from("outreach_leads").update({
        status: "not_contacted", whatsapp_delivery_status: "no_business_name", contact_method: null,
      }).eq("id", lead.id);
      return json({
        ok: false, error: "no_business_name",
        reason: `Template "${templateName}" opens with the business name and this lead has none, so nothing was sent. Add the name on the lead and re-queue it.`,
        lead_id: lead.id, business: lead.business_name, ...statusPayload,
      }, 200);
    }

    const templateExtra: { trade?: string; competitors?: string; onboardingUrl?: string } = {};
    // The url actually sent: the claim link by default, overridden by a resolver that owns it.
    let resolvedUrl = claimUrl;
    if (tvars.includes("onboarding_url")) {
      const ob = await resolveOnboardingFollowupVars(service, lead.id as string);
      if (!ob.ok) {
        await service.from("outreach_leads").update({
          status: "not_contacted", whatsapp_delivery_status: "followup_unavailable", contact_method: null,
        }).eq("id", lead.id);
        return json({
          ok: false, error: "followup_unavailable", reason: ob.reason,
          lead_id: lead.id, business: lead.business_name, ...statusPayload,
        }, 200);
      }
      templateExtra.onboardingUrl = ob.url;
    }
    if (tvars.includes("trade") || tvars.includes("competitors")) {
      const ar = await resolveAuditReplyVars(service, lead.id as string);
      if (!ar.ok) {
        await service.from("outreach_leads").update({
          status: "not_contacted", whatsapp_delivery_status: "audit_reply_unavailable", contact_method: null,
        }).eq("id", lead.id);
        return json({
          ok: false, error: "audit_reply_unavailable", reason: ar.reason,
          lead_id: lead.id, business: lead.business_name, ...statusPayload,
        }, 200);
      }
      templateExtra.trade = ar.trade;
      templateExtra.competitors = ar.competitors;
      // Its "url" var is the AUDIT REPORT link, so it replaces the claim link for this send.
      // Sending the site claim link under audit_reply's copy ("we ran a full report … <link>")
      // would point the prospect at the wrong page entirely.
      resolvedUrl = ar.link;
    }
    const toNumber = toWhatsAppNumber(lead.phone as string, lead.country as string | null);
    if (!toNumber) {
      await service.from("outreach_leads").update({
        status: "not_contacted", whatsapp_delivery_status: "bad_number", contact_method: null,
      }).eq("id", lead.id);
      return json({ ok: true, skipped: "bad_number", lead_id: lead.id, business: lead.business_name, ...statusPayload });
    }

    // Cross-channel suppression: "one no = suppressed everywhere". If this number opted
    // out (e.g. an SMS STOP recorded by twilio-inbound), NEVER message it on WhatsApp
    // either. contact_suppressions is keyed by canonical E.164 (+…); toNumber is digits.
    const { data: suppressed } = await service
      .from("contact_suppressions").select("id").eq("phone_e164", `+${toNumber}`).maybeSingle();
    if (suppressed) {
      await service.from("outreach_leads").update({
        status: "opted_out", whatsapp_delivery_status: "suppressed", contact_method: null,
      }).eq("id", lead.id);
      return json({ ok: true, skipped: "suppressed", lead_id: lead.id, business: lead.business_name, ...statusPayload });
    }

    // Already-contacted guard: NEVER re-send to a lead that already got a SUCCESSFUL WhatsApp. A UI
    // re-queue (status forced back to 'queued') must not double-send — this is the AUTHORITATIVE server
    // chokepoint (no queue-insert path exists; enqueue is a client UPDATE). Blocks on a REAL prior send
    // only: whatsapp_ever_delivered, a lead-linked outbound whatsapp_messages 'sent', or a non-test
    // whatsapp_sends row. Simulated/test and failed-only history do NOT block (retry stays open). On a
    // hit: drop the lead from the queue, restore its post-send status, and skip. Best-effort reads
    // (maybeSingle never throws); a transient read error just falls through to the normal send path.
    let alreadySent = lead.whatsapp_ever_delivered === true;
    if (!alreadySent) {
      const { data: priorMsg } = await service
        .from("whatsapp_messages").select("id")
        .eq("lead_id", lead.id).eq("direction", "outbound").eq("status", "sent").limit(1).maybeSingle();
      alreadySent = !!priorMsg;
    }
    if (!alreadySent) {
      const { data: priorSend } = await service
        .from("whatsapp_sends").select("id")
        .eq("lead_id", lead.id).eq("test_mode", false).limit(1).maybeSingle();
      alreadySent = !!priorSend;
    }
    if (alreadySent) {
      const CONTACTED = ["initial_contact", "site_sent", "replied", "interested", "closed"];
      const restore = CONTACTED.includes(lead.previous_status ?? "") ? (lead.previous_status as string) : "initial_contact";
      await service.from("outreach_leads").update({
        status: restore, queued_at: null, whatsapp_delivery_status: "already_sent", contact_method: "whatsapp",
      }).eq("id", lead.id);
      console.log(`[process-whatsapp-queue] already_sent guard: lead ${lead.id} (${lead.business_name}) had a prior successful send — skipped, restored to ${restore}.`);
      return json({ ok: true, skipped: "already_sent", lead_id: lead.id, business: lead.business_name, ...statusPayload });
    }

    // Tier-1 offline line-type backstop: the enqueue UI already blocks non-mobiles,
    // but a number could have been queued before this shipped, or via a bypassed path.
    // Re-check here so we NEVER spend a send at a landline/VoIP — flag it for SMS and
    // pull it from the queue instead. Offline + free, no Meta call, no cap usage.
    const lineType = classifyLineType(lead.phone as string, lead.country as string | null);
    if (!lineType.whatsappEligible) {
      await service.from("outreach_leads").update({
        status: "no_whatsapp_needs_sms",
        whatsapp_delivery_status: "non_mobile",
        line_type: lineType.lineType,
        line_type_checked_at: new Date().toISOString(),
        contact_method: null,
      }).eq("id", lead.id);
      return json({ ok: true, skipped: "non_mobile", line_type: lineType.lineType, lead_id: lead.id, business: lead.business_name, ...statusPayload });
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
            template: { name: templateName, language: { code: lang }, components: templateBodyParams(tvars, lead.business_name as string, resolvedUrl, templateExtra) },
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
          body: renderTemplateBody(templateName, lead.business_name as string, resolvedUrl, templateExtra.trade, templateExtra.competitors),
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
