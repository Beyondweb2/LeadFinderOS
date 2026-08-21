import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { classifyFailure, leadFailurePatch } from "../_shared/whatsapp-failure.ts";
import { checkSuppressed, suppress } from "../_shared/suppression.ts";
import { renderTemplateBody, templateBodyParams, claimTemplatePayload, sendViaGraph, WA_TEMPLATES, TEMPLATES_NEEDING_REAL_NAME, type TemplateVar } from "../_shared/whatsapp-send.ts";
import { resolveOnboardingFollowupVars } from "../_shared/onboarding-followup.ts";
import { classifyLineType } from "../_shared/line-type.ts";
import { resolveAuditReplyVars } from "../_shared/audit-reply.ts";
import { autoReplyEnvOn, autoReplyToggleOn, firstReplyTemplate, isDecline, phoneSuppressed, pitchEverSent } from "../_shared/auto-reply-rules.ts";
import { SETTLED_TOWN_NOTES } from "../_shared/place-details.ts";

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
//   • DAILY_CAP sends/day GLOBAL cap (one WABA number) — counted from whatsapp_sends.
//     ⛔ THIS SAID "40" WHILE THE CONSTANT WAS 100, and Paul believed his cap was 40 because of it.
//     Never write the number here twice: name the constant, which cannot go stale.
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

   ⛔ 120 — AND IT PACES RATHER THAN STOPS, WHICH IS THE THING TO UNDERSTAND. While the
   floor sat at 20 minutes this number could be anything above ~43 and change nothing: the floor
   bound everything. Halving the floor to 10 (2026-08-08) makes it matter, and Paul's advisor's
   guidance was 60 while ramping; raised to 100 on 2026-08-09 on Paul's call, reply rates good and
   the rating Green. Raised to 120 on 2026-08-12, same reason: rating still Green, ramping on.
   ⚠️ RAISED FROM 60 AFTER ONE DAY AT 60, WHICH IS FASTER THAN THE ADVICE THE
   NUMBER ENCODES. Recorded here rather than argued away: the trigger to drop it back is the quality
   rating leaving Green, and there is nothing automatic that will do that — it is a thing Paul
   watches.
   ⚠️ IT IS NEVER ACTUALLY REACHED. Simulated over 5,000 days at the real jitter: the cap stops a
   day 0% of the time. It binds through the PACING formula instead — baseGap is
   minutesUntilWindowEnd() / (DAILY_CAP - sentToday), so the cap sets the target rate and the day
   lands just under it. Measured effect of this constant, everything else equal:
       DAILY_CAP 60  -> ~54 sends/day (p10 53, p90 56), median gap 20 min, 3.0/hour
       DAILY_CAP 100 -> ~77 sends/day,                  median gap 10 min
   So raising it is how you go faster, and it should only be raised while the rating is Green.

   🔴 120 BUYS ABOUT +9%, NOT +20%, AND THERE IS A HARD CEILING JUST ABOVE IT. Re-simulated
   2026-08-12 over 5,000 days on the REAL grid (ticks every 10 min — measured, see below — one send
   per tick, jitter and floor exactly as coded). The model reproduces BOTH figures already recorded
   above (60 → 54.4, 100 → 77.4), which is why its new rows are trustworthy:
       DAILY_CAP 100 -> 77.4 sends/day (p10 76, p90 79), median gap 10 min, cap reached 0% of days
       DAILY_CAP 120 -> 84.4 sends/day (p10 83, p90 86), median gap 10 min, cap reached 0% of days
       DAILY_CAP 140 -> 87.0 sends/day — AND 200 GIVES 87.0 TOO. That is the grid, not the cap.
   ⛔ SO ~87/DAY IS THE CEILING AT THE CURRENT FLOOR AND SCHEDULE, AND 120 REACHES 84 OF IT. Raising
   this constant past ~140 changes literally nothing. Above 60 the target gap early in the day is
   already below SEND_GAP_FLOOR_MIN (870/119 ≈ 7.3 min at 120), so the FLOOR sets the rate and the
   cap only decides how long into the evening the floor keeps being hit.
   ⚠️ SO THIS IS NEARLY THE END OF THIS LEVER. To go faster afterwards the order is
   SEND_GAP_FLOOR_MIN first, then the cron schedule (DB-only — CLAUDE.md §8). Do not reach for the
   cap again and wonder why nothing happened.
   🔴 AND THE REAL ARGUMENT FOR 120 IS NOT SPEED AT ALL — IT IS THAT REPLIES EAT THIS ALLOWANCE
   WITHOUT BEING LIMITED BY IT. `send-whatsapp-message` deliberately does NOT enforce the cap
   (in-window replies are exempt), but it DOES write a whatsapp_sends row, and `sentToday` counts
   every row. So the reply path spends the queue's budget and cannot be throttled by it.
   Measured 2026-08-12 on the busiest real day, **2026-08-11: 85 sends against a cap of 100** —
       48  initial_contact   (the queue: 52 of the 85 landed on the +0 cron grid)
       30  audit_reply       ┐
        5  free text         ├ 37 reply-path sends, unpaced, any hour of day
        2  re_engage         ┘
   The queue itself only managed 48 that day — well under its simulated 77 — so the cap was not
   reached. But a day where the queue runs at pace AND replies run hot is 77 + 37 = 114, which at 100
   would have stopped the QUEUE mid-afternoon while the replies (correctly) carried on. 120 buys back
   that headroom. ⚠️ It does not remove the risk: at 120 the same day is still 114 of 120.
   ⚠️ LOWERING THE CAP ALSO SLOWS THE PACING, WHICH IS THE POINT AND IS EASY TO MISREAD AS A BUG.
   baseGap is minutesUntilWindowEnd() / (DAILY_CAP - sentToday), so 60 gives 870/60 ≈ 14.5 min at
   07:00 where 100 gave 8.7 and 120 gives 7.3 (floored to 10). The gap is derived from the cap by
   construction: the queue spreads whatever the cap is across the window rather than racing to it and
   stopping.
   process-sms-queue has its OWN separate DAILY_CAP; this constant does not affect it. */
const DAILY_CAP = 120;
/* ══ THE SEND GAP ═══════════════════════════════════════════════════════════════════════
   ⚠️ THESE WERE BARE LITERALS INSIDE THE PACING EXPRESSION. The floor in particular — the single
   number that decided real throughput for months — had no name, so nothing could reference it, no
   comment could be attached to it, and the header comment above described it from memory.

   SEND_GAP_FLOOR_MIN: 20 → 10 on 2026-08-08. At 20 the queue managed a measured 2.0 sends/hour and
   ~29 a day across 377 real sends. Paul's engagement and quality rating are fine, so the brake came
   off.
   ⛔ BUT THE FLOOR IS NOT WHAT BINDS AFTERWARDS — THE CRON TICK IS. This function wakes on a fixed
   ~10-minute schedule and sends AT MOST ONE lead per tick, so a target gap is rounded UP to the next
   tick. That is why the measured median under a 20-minute floor was 29.9 minutes and not 20: the
   +20 mark is missed by a hair and the send lands on +30. Under a 10-minute floor the same effect
   puts most gaps at 20 rather than 10. Halving the floor therefore roughly halves the gap — it does
   not deliver one send every ten minutes. Sends can only ever occur on the cron's grid; going faster
   than ~3/hour needs the SCHEDULE changed, not this constant.
   ⚠️ The cron schedule lives ONLY in the database (CLAUDE.md §8) — there is no migration for it,
   so it cannot be read or changed from this repo.

   SEND_GAP_JITTER_*: widened from 0.6–1.4 to 0.55–1.65 so consecutive gaps differ by more ticks.
   ⚠️ Jitter cannot hide the grid. Sends happen when the cron fires, so their clock times are
   always near 10-minute marks whatever this band is; what the band varies is HOW MANY ticks are
   skipped between sends, which is what stops a visible fixed cadence. Widening it further would not
   change the first fact. */
const SEND_GAP_FLOOR_MIN = 10;
const SEND_GAP_CEILING_MIN = 180;
const SEND_GAP_JITTER_LOW = 0.55;
const SEND_GAP_JITTER_HIGH = 1.65;

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
  /* Re-engage a lead who went quiet: {{1}} = business name, {{2}} = that lead's onboarding URL.
     ⛔ CORRECTED FROM ONE VARIABLE 2026-08-11 against Meta #132000 (1 param sent, 2 expected). The
     comment that shipped with the guess said this list must be corrected in the same commit as
     WA_TEMPLATES if the count changed — this is that commit. */
  re_engage: { lang: "en", vars: ["name", "onboarding_url"] },
  // "You said a call works" nudge. ONE variable: {{1}} = business name. No url.
  book_call: { lang: "en", vars: ["name"] },
  /* Payment confirmation — sent by stripe-webhook when a Findable payment lands, NOT by this queue.
     ⛔ MISSPELLED AT META ON PURPOSE ("recieved"): the registered name is what Meta matches, so the
     typo is the correct string. Present here only to keep this map byte-identical to WA_TEMPLATES in
     _shared/whatsapp-send.ts, which scripts/re-engage-vars.test.ts asserts in BOTH directions.
     ⚠️ Nothing queues it: it is absent from the SPA's WHATSAPP_TEMPLATES picker, so no operator can
     select it for a lead. ONE variable: {{1}} = business name. */
  payment_recieved: { lang: "en", vars: ["name"] },
  /* Questionnaire-stall nudge — MANUAL sends via send-whatsapp-message ONLY, never queued (absent
     from the SPA picker). {{1}} = owner FIRST NAME (from outreach_leads.contact_name), {{2}} =
     business name. Present here only to keep this map byte-identical to WA_TEMPLATES in
     _shared/whatsapp-send.ts, which scripts/re-engage-vars.test.ts asserts in BOTH directions. */
  questionnaire_followup: { lang: "en_GB", vars: ["contact_first_name", "name"] },
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

/** The REAL next eligible send time, as a UTC ISO instant — for DISPLAY ONLY.
 *
 *  ⛔ THIS DECIDES NOTHING. The send gates (windowOpen, cap, next_send_at pacing at the bottom of a
 *  tick) are untouched; this only tells the dashboard what those gates will do next, because the
 *  stored `next_send_at` is written only AFTER a send and so reads stale (or Bangkok-clock) the rest
 *  of the time. Mirrors the SAME window and cap the gates use, in Europe/London.
 *
 *  Logic, matching the gate order:
 *   - inside the window AND under the cap → now + the pending pacing gap (storedNextSendAt if it is
 *     still in the future, else now: a due queue sends on the next tick).
 *   - outside the window, OR cap reached → the next 07:00 Europe/London. Cap-hit today rolls to
 *     tomorrow; before 07:00 today rolls to 07:00 today; after 21:30 today rolls to tomorrow.
 *  DST-correct because londonInstant round-trips through the London offset. */
function nextEligibleSendAt(sentToday: number, storedNextSendAt: string | null): string {
  const n = londonNow();
  const nowMin = n.hour * 60 + n.minute;
  const inWindow = nowMin >= WINDOW_START * 60 && nowMin < WINDOW_END_MIN;
  const underCap = sentToday < DAILY_CAP;

  if (inWindow && underCap) {
    // The pacing wait already in flight, if it is still ahead of now; otherwise it is due now.
    const stored = storedNextSendAt ? new Date(storedNextSendAt) : null;
    return stored && stored.getTime() > Date.now() ? stored.toISOString() : new Date().toISOString();
  }

  // Next 07:00 Europe/London: today if we are before the window AND still under the cap, else tomorrow.
  const beforeWindowToday = nowMin < WINDOW_START * 60;
  const openToday = beforeWindowToday && underCap;
  const base = londonInstant(n.y, n.mo, n.da, WINDOW_START, 0);
  return (openToday ? base : new Date(base.getTime() + 24 * 60 * 60 * 1000)).toISOString();
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
    /* Queue depth counts what this processor will ACTUALLY send: archived leads are excluded here
       for the same reason they are excluded from the selection below. The archived-but-queued count
       is reported alongside it rather than silently dropped, so "nothing to send" and "skipping N
       archived" are distinguishable from the outside. */
    const { count: queuedCount } = await service
      .from("outreach_leads").select("id", { count: "exact", head: true })
      .eq("status", "queued").eq("is_archived", false);
    const { count: archivedQueuedCount } = await service
      .from("outreach_leads").select("id", { count: "exact", head: true })
      .eq("status", "queued").eq("is_archived", true);
    /* ⛔ THE TOWN GATE'S SKIP COUNT — reported, never a silent shrink (Paul's rule, 2026-08-14:
       money and messages never move on an unverified town, and this gate is BLANKET by his call —
       it holds the plain opener too). Counted the same way archived-but-queued is, so "nothing to
       send" and "N held back as unverifiable" are distinguishable from the outside. The predicate
       is townVerdict's: settled note + no town; unchecked leads are NOT counted and NOT gated. */
    const { count: unverifiedQueuedCount } = await service
      .from("outreach_leads").select("id", { count: "exact", head: true })
      .eq("status", "queued").eq("is_archived", false)
      .is("derived_town", null).in("town_fetch_note", [...SETTLED_TOWN_NOTES]);
    /* The phone-history seatbelt's tally — how many rows it has bounced, ever. Its own count so a
       skip is never silent (Paul's rule from the duplicate-openers incident, 2026-08-18). */
    const { count: phoneHistorySkippedCount } = await service
      .from("outreach_leads").select("id", { count: "exact", head: true })
      .eq("whatsapp_delivery_status", "phone_already_contacted");
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
      queuedCount: queuedCount ?? 0, archivedQueuedCount: archivedQueuedCount ?? 0,
      // Queued leads held back because their town is settled-unverifiable (the town gate).
      unverifiedQueuedCount: unverifiedQueuedCount ?? 0,
      // Rows the phone-history seatbelt has bounced (opener refused: number already has a thread).
      phoneHistorySkippedCount: phoneHistorySkippedCount ?? 0,
      nextSendAt, windowOpen, paused,
      /* The real next eligible send, Europe/London, computed live — what the dashboard shows.
         `nextSendAt` (the raw stored pacing stamp) stays in the payload for back-compat, but the
         panel reads THIS. Display only; changes no gate. */
      nextEligibleSendAt: nextEligibleSendAt(sentToday ?? 0, nextSendAt),
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
            /* ⛔ A DECLINE NOW WRITES A SUPPRESSION ROW, not just a cancelled send. Before this the
               only automatic writer was twilio-inbound on an SMS "STOP"; a WhatsApp "not interested"
               cancelled the pending pitch and NOTHING else — no status change, no suppression — so
               the same person stayed fully reachable by email, by the audit batch, and by any future
               channel. It suppressed only if Paul read the reply and acted.
               The lead id goes on the row as well as the phone, so this one "no" also covers the
               EMAIL channel for a lead whose address we have not crawled yet. */
            const { data: dl } = await service.from("outreach_leads")
              .select("email").eq("id", row.lead_id).maybeSingle();
            await suppress(service,
              { phone: row.phone, email: dl?.email ?? null, leadId: row.lead_id },
              { reason: "replied_no", source: "whatsapp_decline" });
            await finish("cancelled_decline");
            results[row.lead_id] = "cancelled_decline";
            continue;
          }
          // 2) Send-time status + suppression (checked HERE, not just at queue time).
          const { data: lead } = await service.from("outreach_leads")
            .select("id, user_id, status, business_name, is_archived").eq("id", row.lead_id).maybeSingle();
          if (!lead) { await finish("flagged_error", "lead_missing"); results[row.lead_id] = "flagged_error"; continue; }
          /* Archived at send time — e.g. armed by a reply, then archived during the ~3 minute delay,
             which is exactly the window an operator would use to stop it. Recorded rather than
             dropped so the row shows WHY it never sent. Not "cancelled_decline": the business did
             not decline, the operator withdrew. */
          if (lead.is_archived === true) {
            await finish("skipped_archived", "lead archived before send");
            results[row.lead_id] = "skipped_archived";
            continue;
          }
          /* The SHARED check now — phone, email AND lead id, failing closed. phoneSuppressed()
             was phone-only and returned "not suppressed" when the lookup threw. */
          const sendSupp = await checkSuppressed(service, { phone: row.phone, leadId: row.lead_id });
          if (["opted_out", "not_interested"].includes(lead.status as string) || sendSupp.suppressed) {
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
          } else if (tmpl.vars.includes("onboarding_url")) {
            /* ⛔ THIS BRANCH WAS MISSING, AND WITHOUT IT AN onboarding_url TEMPLATE COULD NEVER SEND
               FROM THIS PATH — for any lead, however good its data. The else below resolves `url`
               and nothing resolved `onboarding_url`, so templateBodyParams reached its own guard and
               THREW ("refusing to send a follow-up with no link"). The per-row catch turned that into
               flagged_error, so it refused rather than sending a broken link — right outcome, wrong
               reason, and unfixable by anything on the lead.
               Live for `onboarding_followup` since the day it was registered; re_engage now shares
               the variable, and set_first_reply_template validates against WA_TEMPLATES, so the
               reply rule can be pointed at either one — which is what makes this reachable.
               ⚠️ SAME RESOLVER AS THE INBOX PATH, so both refuse on the same facts: no lead, no
               business name ({{1}}), no trade, already paid, or no configured site origin. */
            const f = await resolveOnboardingFollowupVars(service, row.lead_id);
            if (!f.ok) { await finish("flagged_no_link", f.reason); results[row.lead_id] = "flagged_no_link"; continue; }
            /* No `templateName` in `extra`: claimTemplatePayload stamps it in itself before calling
               templateBodyParams, so the TEMPLATES_NEEDING_REAL_NAME guard still fires here — and
               passing it explicitly is a type error deno check catches but tsc never sees, because
               tsc does not cover supabase/functions at all. */
            payload = claimTemplatePayload(templateName, tmpl.lang, f.business, "", { onboardingUrl: f.url });
            renderedBody = renderTemplateBody(templateName, f.business, f.url);
            businessName = f.business;
            claimUrl = f.url;   // the outbound URL for this send, recorded like any other
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

    /* Oldest queued, UNARCHIVED lead with a phone. Archiving is the operator saying "stop
       contacting this business"; before this filter it only hid the lead from the SPA's lists while
       this query happily sent to it. Note the archived rows keep status='queued' — archiving
       deliberately writes is_archived and nothing else — so the status filter alone never excluded
       them. Un-archiving restores the lead to the queue exactly where its queued_at puts it. */
    /* ⛔ TOWN-UNVERIFIABLE LEADS ARE EXCLUDED IN THE QUERY, exactly as archived leads are — a gated
       lead at the head of the queue must never stall the one-send-per-tick drip. The pass
       condition is townVerdict's, inverted for SQL: a lead may send when it HAS a derived town, OR
       has never been checked (null note), OR its note is transient. Only settled-unverifiable is
       held. It stays status='queued' (like archived), visible via the count above and the row
       badge, and re-enters the drip the moment its town verifies. */
    const { data: lead } = await service
      .from("outreach_leads")
      .select("id, business_name, phone, email, country, whatsapp_template, whatsapp_attempts, whatsapp_delivery_status, whatsapp_ever_delivered, previous_status, user_id")
      .eq("status", "queued")
      .eq("is_archived", false)
      .not("phone", "is", null)
      .or(`derived_town.not.is.null,town_fetch_note.is.null,town_fetch_note.not.in.(${[...SETTLED_TOWN_NOTES].join(",")})`)
      .order("queued_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    /* "empty_queue", "nothing left but archived leads" and "nothing left but unverifiable towns"
       are different facts, so they get different skip codes. Without this, pulling 17 leads out of
       the queue by archiving them would look identical to having genuinely finished the list. */
    if (!lead) {
      return json({
        ok: true,
        skipped: (archivedQueuedCount ?? 0) > 0
          ? "empty_queue_archived_skipped"
          : (unverifiedQueuedCount ?? 0) > 0
            ? "empty_queue_unverified_town_skipped"
            : "empty_queue",
        ...statusPayload,
      });
    }

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
    /* The SHARED check. This was the LAST inline copy of the rule — phone-only, and it swallowed a
       failed lookup as "not suppressed". Now matches on phone, email and lead id, and fails closed. */
    const mainSupp = await checkSuppressed(service, { phone: `+${toNumber}`, email: lead.email ?? null, leadId: lead.id });
    if (mainSupp.suppressed) {
      await service.from("outreach_leads").update({
        status: "opted_out", whatsapp_delivery_status: "suppressed", contact_method: null,
      }).eq("id", lead.id);
      return json({ ok: true, skipped: "suppressed", lead_id: lead.id, business: lead.business_name, ...statusPayload });
    }

    /* ⛔ THE PHONE-HISTORY SEATBELT — built 2026-08-18 after 25 duplicate openers went out
       (15–17 Aug). The add path created second lead rows for phones already in the CRM (its dedupe
       raced an in-memory cache), and every per-LEAD guard here correctly saw a fresh lead. This
       gate is per-PHONE, at the last exit: a cold opener NEVER goes to a number that already has a
       WhatsApp conversation — whatever lead row it arrives on. 11 of the 25 had already REPLIED.
       - initial_contact only: every other template is a follow-up whose own guards key on history.
       - .neq(status,'failed') mirrors pitchEverSent: a failed attempt is not a conversation, so a
         legitimate retry of THIS lead's own failed opener still passes.
       - Same drop-out-of-the-queue shape as every guard above (the drip must never stall), with
         its own delivery status so the row says WHY — counted in the status payload, never silent. */
    if (templateName === "initial_contact") {
      const { data: prior } = await service
        .from("whatsapp_messages")
        .select("id, lead_id")
        .eq("phone", toNumber)
        .neq("status", "failed")
        .limit(1);
      if (Array.isArray(prior) && prior.length > 0) {
        await service.from("outreach_leads").update({
          status: "not_contacted", whatsapp_delivery_status: "phone_already_contacted", contact_method: null,
        }).eq("id", lead.id);
        return json({
          ok: true,
          skipped: "phone_already_contacted",
          reason: `${lead.business_name ?? "That lead"}'s number (+${toNumber}) already has a WhatsApp conversation${(prior[0] as { lead_id?: string | null }).lead_id && (prior[0] as { lead_id?: string | null }).lead_id !== lead.id ? " on another lead row" : ""}. A cold opener never goes to a number we have already messaged — this row is probably a duplicate of the lead that owns the thread.`,
          lead_id: lead.id, business: lead.business_name, ...statusPayload,
        }, 200);
      }
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
      const jitter = SEND_GAP_JITTER_LOW + Math.random() * (SEND_GAP_JITTER_HIGH - SEND_GAP_JITTER_LOW);
      const gapMin = Math.min(
        SEND_GAP_CEILING_MIN,
        Math.max(SEND_GAP_FLOOR_MIN, Math.round(baseGap * jitter)),
      );
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
