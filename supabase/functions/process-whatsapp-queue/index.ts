import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { classifyFailure, leadFailurePatch } from "../_shared/whatsapp-failure.ts";
import { checkSuppressed, suppress } from "../_shared/suppression.ts";
import { isColdOutreachTemplate } from "../../../src/lib/coldOutreach.ts";
import { rivalHookDecision, templateNeedsRivals } from "../../../src/lib/rivalHook.ts";
/* ⚠️ templateBodyParams IS DELIBERATELY NOT IMPORTED ANY MORE. This file used to assemble one
   send payload by hand from it, which is how video_template went out without its video header for
   its entire life. Payloads come from claimTemplatePayload, which reads the registry. */
import { renderTemplateBody, claimTemplatePayload, sendViaGraph, WA_TEMPLATES, TEMPLATES_NEEDING_REAL_NAME, firstNameFrom, type TemplateVar } from "../_shared/whatsapp-send.ts";
import { hookFollowupEligible } from "../_shared/hook-followup-eligibility.ts";
import { contactFollowupEligible } from "../_shared/contact-followup-eligibility.ts";
import { resolveOnboardingFollowupVars } from "../_shared/onboarding-followup.ts";
import { classifyLineType } from "../_shared/line-type.ts";
import {
  runOutreachAuditAhead, decideOutreachAudit, readAuditStates, templateNeedsAudit,
} from "../_shared/outreach-audit.ts";
import { interleaveByCampaign, campaignsRepresented } from "../_shared/campaign-interleave.ts";
import { resolveAuditReplyVars } from "../_shared/audit-reply.ts";
import { AUDIT_ONLY_STATUS, DEFAULT_FIRST_REPLY_TEMPLATE, FIRST_REPLY_MODES, autoReplyEnvOn, autoReplyToggleOn, firstReplyMode, firstReplyTemplate, isDecline, isStaleAutoReply, modeSends, parseFirstReplyMode, phoneSuppressed, pitchEverSent } from "../_shared/auto-reply-rules.ts";
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
        2  re_engage_49         ┘
   The queue itself only managed 48 that day — well under its simulated 77 — so the cap was not
   reached. But a day where the queue runs at pace AND replies run hot is 77 + 37 = 114, which at 100
   would have stopped the QUEUE mid-afternoon while the replies (correctly) carried on. 120 buys back
   that headroom. ⚠️ It does not remove the risk: at 120 the same day is still 114 of 120.
   ⚠️ LOWERING THE CAP ALSO SLOWS THE PACING, WHICH IS THE POINT AND IS EASY TO MISREAD AS A BUG.
   baseGap is minutesUntilWindowEnd() / (DAILY_CAP - sentToday), so 60 gives 870/60 ≈ 14.5 min at
   07:00 where 100 gave 8.7 and 120 gives 7.3 (floored to 10). The gap is derived from the cap by
   construction: the queue spreads whatever the cap is across the window rather than racing to it and
   stopping.
   process-sms-queue has its OWN separate DAILY_CAP; this constant does not affect it.

   ✅ 120 → 200 ON 2026-08-22, AND THE CEILING ABOVE WAS LIFTED THE ONLY WAY IT COULD BE — THE CRON.
   The "~87/day ceiling" and "raising past ~140 does nothing" notes above were TRUE at a 10-minute
   cron and a 10-minute floor. Both were changed together this day so 200 is actually reachable:
     • SEND_GAP_FLOOR_MIN 10 → 4 (below), so the pacing targets ~4–5 min instead of clamping to 10;
     • the cron `whatsapp-queue-run` moved from every-10-minutes to every-4-minutes — DB-ONLY,
       applied by hand in the SQL editor (CLAUDE.md §8). At a 4-minute cron there are ~15 ticks/hour
       × 14.5 h ≈ 217 ticks in the window, one send each, so 200 fits with headroom. baseGap at 07:00
       is 870/199 ≈ 4.37 min, floored at 4.
   ⛔ ALL THREE MOVE TOGETHER OR NOTHING CHANGES. Cap 200 with a 10-minute cron is still ~87/day (the
   grid binds); a 4-minute cron with the floor still 10 is still ~87/day (the floor binds). If you
   step this cap up or down while watching the quality rating, you can do so freely — but if you ever
   want MORE than ~200 you must also speed the cron again, and if you drop the cap low the floor-4
   pacing simply spreads fewer sends wider. Lowering the cap alone is always safe.
   ⚠️ The reply-path-eats-the-budget point below still stands, with more room now (200 not 120). */
/* ✅ 200 → 400 ON 2026-09-14, AND AGAIN ALL THREE NUMBERS MOVE TOGETHER OR NOTHING CHANGES.
   The note above is the second time this was learned; this is the third. Re-simulated 5,000 days
   against the real formula before changing anything, and the model reproduces every figure already
   recorded here (cap 200 / floor 3 / cron 10 → 87.0; floor 10 on a 4-min cron → 73), which is what
   makes the new rows trustworthy:
       cap 400, floor 3, cron 4   → 218/day   the GRID binds (217 ticks), floor irrelevant
       cap 400, floor 1, cron 4   → 218/day   identical — proving the floor was NOT what bound
       cap 400, floor 1, cron 3   → 290/day   grid again
       cap 400, floor 1, cron 2   → 364/day   rounding loss: a jittered 3-min gap waits for +4
       cap 400, floor 1, cron 1   → 399/day   cap reached on 4.7% of days
   ⛔ SO ONLY A ONE-MINUTE CRON REACHES 400. The target gap is 870/399 ≈ 2.18 min, so any grid
   coarser than that is the ceiling no matter what this constant says — raising the cap alone moves
   the number from 175 to 218 and stops. That is the same mistake as raising a cap on something
   stuck at 3, which is why it was simulated rather than argued.
   ⛔ AND THE FLOOR HAD TO GO TO 1. At a 1-minute grid a floor of 2 clamps the 2.18 target upward and
   gives ~334/day; at 1 every integer gap lands exactly on a tick and nothing is lost to rounding.
   The floor must never exceed the target gap, and the grid must never exceed it either.
   ⚠️ THE PACING IS UNTOUCHED AND MUST STAY SO. baseGap = minutesUntilWindowEnd()/(cap - sentToday)
   is what stops the queue dumping a day's sends in an hour; 400 simply makes it aim at 2.18 min
   instead of 4.37. The queue still spreads whatever the cap is across the window.
   🔴 THE CAP IS NOT THE BINDING CONSTRAINT TODAY AND THIS NUMBER WILL NOT CHANGE THAT BY ITSELF.
   Measured over the 14 days to 2026-09-14: 42.4 sends/day on the 7-day mean, best day 109, against
   a cap of 200 the queue never approached. The queue is SUPPLY-limited — eligible leads with a
   completed audit — not cap-limited. 400 raises the ceiling; it does not fill the queue.
   🔴 AND THE APIFY BUDGET IS A HARDER LIMIT THAN META'S. A hook audit costs $0.0329 (measured over
   120 billed runs, purpose='audit', 1 run each), so 400 sends/day ≈ $13.16/day of Apify. On
   2026-09-14 the cycle had $141.42 left with 20 days to run: that is 10.7 days at 400/day, i.e. dry
   nine days before the cycle resets. Budget-neutral for the whole cycle is ~215/day. Paul's call —
   recorded so the number is not rediscovered when audits start failing 402 (the 2026-07-30
   incident). */
const DAILY_CAP = 400;
/* ══ THE SEND GAP ═══════════════════════════════════════════════════════════════════════
   ⚠️ THESE WERE BARE LITERALS INSIDE THE PACING EXPRESSION. The floor in particular — the single
   number that decided real throughput for months — had no name, so nothing could reference it, no
   comment could be attached to it, and the header comment above described it from memory.

   SEND_GAP_FLOOR_MIN: 20 → 10 on 2026-08-08, then 10 → 4 → 3 on 2026-08-22 (with DAILY_CAP → 200 and
   the cron moved to every-4-minutes, all together — see the DAILY_CAP note). At 20 the queue managed
   a measured 2.0 sends/hour and ~29 a day across 377 real sends. The brake came off in stages as the
   quality rating held Green.
   ⛔ THE FLOOR AND THE CRON GRID BIND TOGETHER — NEITHER ALONE. This function wakes on the cron
   schedule and sends AT MOST ONE lead per tick, so a target gap is rounded UP to the next tick. While
   the cron was every-10-minutes the grid dominated any floor below 10 (a +4 target still landed on
   the next +10 tick), which is why the floor could not be dropped usefully without also speeding the
   cron.
   ⛔ 4 → 3 ON 2026-08-22, AND THE REASON IS THE ROUNDING, MEASURED. At a 4-minute floor on a
   4-minute cron the QUEUE lane paced ~8 min, not 4: next_send_at landed at T+4, the +4 cron tick
   fired a hair before it, so the send slipped to the tick after — two grid steps, ~8 min, ~108/day
   queue-only. A floor of 3 puts next_send_at at T+3, comfortably BEFORE the next +4 tick, so that
   tick is eligible and the send lands ~4 min after the last — true ~4-min queue cadence, ~200/day
   without leaning on reply traffic. The floor must sit BELOW the grid for the next tick to catch it;
   going faster still would need the cron faster, not this constant.
   ⚠️ The cron schedule lives ONLY in the database (CLAUDE.md §8) — there is no migration for it, so
   it cannot be read or changed from this repo. Reschedule it by unscheduling `whatsapp-queue-run`
   then re-scheduling it at a 4-minute interval calling public.invoke_whatsapp_queue() (the exact SQL
   was handed to Paul with this change).

   SEND_GAP_JITTER_*: widened from 0.6–1.4 to 0.55–1.65 so consecutive gaps differ by more ticks.
   ⚠️ Jitter cannot hide the grid. Sends happen when the cron fires, so their clock times are
   always near 10-minute marks whatever this band is; what the band varies is HOW MANY ticks are
   skipped between sends, which is what stops a visible fixed cadence. Widening it further would not
   change the first fact. */
/* ⛔ HOW FAR PAST A NOT-READY LEAD THE DRIP MAY LOOK (2026-09-14). The queue is strict FIFO and
   sends ONE lead per tick; before this, a lead whose audit was still running returned the WHOLE
   tick, so every lead behind it waited too — including ones whose audits had finished an hour
   earlier. Measured that day: 40 leads queued, 11 audits run, 6+ complete, and TWO messages sent in
   68 minutes. Throughput was one send per audit-completion, serialised, not one per tick.
   ⚠️ A LOOK-AHEAD, NOT A REORDERING. The queue order never changes: the oldest lead is still
   examined first on every single tick, and the moment its audit is ready it sends. Skipping is what
   this tick does when the head is not ready, not a position the head loses.
   ⚠️ Bounded because each candidate costs a read. Ten is far more than the concurrency cap of 3, so
   there is always a ready lead within reach whenever one exists. */
const QUEUE_LOOKAHEAD = 60;
/* ⛔ HOW MANY QUEUED LEADS ARE READ AND RE-ORDERED BEFORE THE LOOK-AHEAD PICKS FROM THEM
   (2026-09-14). The read is ordered by queued_at — global FIFO — so reading only QUEUE_LOOKAHEAD
   rows meant the window was frequently ONE campaign: measured that day, 95 leads in two campaigns
   and all ten candidates belonged to the older one. The scan is now wide enough to SEE every
   campaign, interleaveByCampaign re-orders it, and the look-ahead picks from the fair order.
   ⛔ 400 IS THE SAME TRUNCATION CEILING AS THE AUDIT HORIZON, FOR THE SAME REASON. readAuditStates
   does one `.in()` over the chosen candidates and gets back one row PER AUDIT, and PostgREST caps a
   result at db-max-rows — measured at exactly 1000 on this project. Leads whose audits fall off the
   end read as "never audited". Fan-out is ~1 audit per lead (1,014 audits over 994 leads; p99 2), so
   the look-ahead's own `.in()` at 60 is trivial and the SCAN at 400 stays well inside the cap.
   ⚠️ IT IS STILL A HORIZON. Past 400 queued, campaigns queued after the 400th lead are invisible
   until the front clears — the same FIFO truncation this fixes, one order of magnitude out. */
const QUEUE_SCAN = 400;

/* ⛔ 3 → 1 ON 2026-09-14, WITH DAILY_CAP → 400 AND THE CRON → EVERY MINUTE. See the DAILY_CAP note
   for the simulation. The rule that decides this constant has not changed since it was written:
   THE FLOOR MUST SIT BELOW THE GRID, or a target gap rounds up to the tick after next and the lane
   paces at two grid steps. At a 1-minute cron a floor of 1 IS the grid, and because gaps are whole
   minutes every one of them lands exactly on a tick — so nothing is lost to rounding, which is why
   1 gets 399/day where 2 gets ~334. ⚠️ 1 is the floor of the floor: pg_cron cannot go below a
   minute, so there is no faster grid to sit under. If more throughput is ever wanted, this is not
   the lever — the WINDOW is (870 minutes today). */
const SEND_GAP_FLOOR_MIN = 1;
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
  // video_template - the outreach hook. MIRRORS whatsapp-send.ts; change both together.
  video_template: { lang: "en", vars: ["name", "trade", "town", "audit_url"] },
  /* competitor_hook - the COMPETITOR-NAMING hook, APPROVED at Meta 2026-09-14. MIRRORS
     whatsapp-send.ts; change both together (scripts/re-engage-vars.test.ts asserts both directions).
     SIX vars: {{1}} name, {{2}} trade as a LOWERCASE PLURAL, {{3}} {{4}} {{5}} competitor names,
     {{6}} audit link. A lead whose audit cannot supply three names is sent video_template instead -
     see rivalHookDecision at the send site below, not here: this map says what a template IS, never
     what to do when it cannot be filled. */
  competitor_hook: { lang: "en", vars: ["name", "trade_plural", "rival_1", "rival_2", "rival_3", "audit_url"] },
  // audit_reply_warm - the WARM audit message. MIRRORS whatsapp-send.ts; change both together.
  // THREE vars and NO name: {{1}} trade, {{2}} town, {{3}} audit link.
  audit_reply_warm: { lang: "en", vars: ["trade", "town", "audit_url"] },
  /* audit_followup — submitted to Meta 2026-09-15. MIRRORS whatsapp-send.ts; change both together.
     {{1}} trade as a LOWERCASE PLURAL, {{2}} town, {{3}} {{4}} {{5}} rivals, {{6}} report link. `audit_url` is what makes it needsAudit; rival_1..3 are what make templateNeedsRivals
     true, so it inherits competitor_hook's three-names-or-fall-back rule with no new code here. */
  audit_followup: { lang: "en", vars: ["trade_plural", "town", "rival_1", "rival_2", "rival_3", "audit_url"] },
  // Follow-up to a warm lead after the 24h window: {{1}} business name, {{2}} onboarding URL.
  onboarding_followup: { lang: "en", vars: ["name", "onboarding_url"] },
  /* Re-engage a lead who went quiet: {{1}} = business name, {{2}} = that lead's onboarding URL.
     ⛔ CORRECTED FROM ONE VARIABLE 2026-08-11 against Meta #132000 (1 param sent, 2 expected). The
     comment that shipped with the guess said this list must be corrected in the same commit as
     WA_TEMPLATES if the count changed — this is that commit. */
  /* ONE variable: {{1}} = business name. MIRRORS whatsapp-send.ts; change both together.
     re_engage_49 replaced re_engage on 2026-09-12 and drops the onboarding link. */
  re_engage_49: { lang: "en", vars: ["name"] },
  // "You said a call works" nudge. ONE variable: {{1}} = business name. No url.
  book_call: { lang: "en", vars: ["name"] },
  /* free_check_result — the free-check result message, sent by process-ai-audit-queue / submissions,
     NOT by this queue. Present here only to keep this map byte-identical to WA_TEMPLATES in
     _shared/whatsapp-send.ts, which scripts/re-engage-vars.test.ts asserts in BOTH directions.
     🔴 IT WAS MISSING ENTIRELY UNTIL 2026-09-12, and the test that exists to catch exactly that had
     been printing "FAILURES" and exiting 0 for days — so the harness reported it green. The gap
     never broke a send (this queue does not send it), but the parity guarantee the other entries
     rely on was simply not holding. FIVE variables: {{1}} name, {{2}} trade, {{3}} town,
     {{4}} audit link, {{5}} onboarding link. */
  free_check_result: { lang: "en", vars: ["name", "trade", "town", "audit_url", "onboarding_url"] },
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
  questionnaire_followup: { lang: "en", vars: ["contact_first_name", "name"] },
  /* Report follow-up — MANUAL sends via send-whatsapp-message ONLY, never queued (absent from the
     SPA picker). {{1}} = owner FIRST NAME, {{2}} = business name. Present here only to keep this map
     byte-identical to WA_TEMPLATES in _shared/whatsapp-send.ts, which scripts/re-engage-vars.test.ts
     asserts in BOTH directions. */
  hook_followup: { lang: "en", vars: ["contact_first_name", "name"] },
  /* Earlier-stage nudge (opener got no reply, before any report). Re-approved at Meta 2026-08-22 to
     "Hi, did you get my last message? Paul" — ZERO variables now, so vars is []. Present here only to
     keep this map byte-identical to WA_TEMPLATES in _shared/whatsapp-send.ts
     (scripts/re-engage-vars.test.ts asserts both directions). */
  contact_followup: { lang: "en", vars: [] },
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

/** The next-send pacing stamp after ANY attempt — the ONE place the spread+jitter formula lives.
 *  baseGap = time-left-in-window / remaining-cap, jittered, floored and ceilinged. Both the opener
 *  lane and the hook_followup lane write this, so the two share one pacing clock and one global rate
 *  (with one send per tick, they interleave at the cap — never a burst). */
function nextPacingStamp(sentTodayCount: number): string {
  const remaining = Math.max(1, DAILY_CAP - (sentTodayCount + 1));
  const minsLeft = minutesUntilWindowEnd();
  const baseGap = minsLeft / remaining;
  const jitter = SEND_GAP_JITTER_LOW + Math.random() * (SEND_GAP_JITTER_HIGH - SEND_GAP_JITTER_LOW);
  const gapMin = Math.min(SEND_GAP_CEILING_MIN, Math.max(SEND_GAP_FLOOR_MIN, Math.round(baseGap * jitter)));
  return new Date(Date.now() + gapMin * 60000).toISOString();
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
    /* The hook_followup lane's depth — leads marked for the report follow-up, awaiting their paced
       turn. Reported so the panel/observer can see the backlog draining. Counted like queuedCount. */
    const { count: hookQueuedCount } = await service
      .from("outreach_leads").select("id", { count: "exact", head: true })
      .not("hook_followup_queued_at", "is", null).eq("is_archived", false);
    /* The contact_followup lane's depth — leads marked for the OPENER follow-up (never replied),
       awaiting their paced turn. Same shape as hookQueuedCount. */
    const { count: contactQueuedCount } = await service
      .from("outreach_leads").select("id", { count: "exact", head: true })
      .not("contact_followup_queued_at", "is", null).eq("is_archived", false);
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
      // Leads queued for the hook_followup lane, awaiting their paced turn.
      hookQueuedCount: hookQueuedCount ?? 0,
      // Leads queued for the contact_followup (opener follow-up) lane, awaiting their paced turn.
      contactQueuedCount: contactQueuedCount ?? 0,
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
      // The reply-trigger template (null = the shared default). Defensive like the others.
      firstReplyTemplate: await firstReplyTemplate(service),
      /* The three-way reply MODE. Absent column / failed read → 'audit_only' (never 'send'), so
         the panel can render before the SQL has been run and never shows a sending state that
         is not real. */
      firstReplyMode: await firstReplyMode(service),
      /* ⛔ HOW MANY LEADS ARE ACTUALLY WAITING FOR THE OPERATOR, not how many rows exist. An
         audit_only row is written the moment the reply lands, while its audit is still running —
         counting rows would tell Paul "3 ready to send" about audits that have not finished. So
         this counts only rows whose lead HAS a completed run, which is the same test the send
         path's resolver uses. Best-effort: any failure returns null and the panel says nothing
         rather than a wrong number. */
      auditOnlyReadyCount: await (async () => {
        try {
          const { data: rows, error: rErr } = await service
            .from("whatsapp_auto_replies").select("lead_id").eq("status", AUDIT_ONLY_STATUS).limit(500);
          if (rErr || !Array.isArray(rows) || rows.length === 0) return rErr ? null : 0;
          const leadIds = [...new Set(rows.map((r: { lead_id: string }) => r.lead_id).filter(Boolean))];
          if (leadIds.length === 0) return 0;
          const { data: auds, error: aErr } = await service
            .from("ai_audits").select("id, lead_id").in("lead_id", leadIds);
          if (aErr || !Array.isArray(auds) || auds.length === 0) return aErr ? null : 0;
          const { data: done, error: dErr } = await service
            .from("ai_audit_runs").select("audit_id")
            .in("audit_id", auds.map((a: { id: string }) => a.id))
            .in("status", ["complete", "capped"]);
          if (dErr || !Array.isArray(done)) return null;
          const doneAuditIds = new Set(done.map((r: { audit_id: string }) => r.audit_id));
          const readyLeads = new Set(
            auds.filter((a: { id: string; lead_id: string }) => doneAuditIds.has(a.id)).map((a: { lead_id: string }) => a.lead_id),
          );
          return readyLeads.size;
        } catch { return null; }
      })(),
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

    /* Set the three-way reply MODE (admin-gated like pause). Validated against the shared list so
       a typo cannot store a value the trigger would then have to guess at — and the guess would be
       'audit_only', which would silently ignore an operator who asked for sending. */
    if (mode === "set_first_reply_mode") {
      const raw = typeof body.value === "string" ? body.value.trim() : "";
      if (!(FIRST_REPLY_MODES as readonly string[]).includes(raw)) {
        return json({ ok: false, error: "unknown_mode", detail: `expected one of ${FIRST_REPLY_MODES.join(", ")}` }, 400);
      }
      const next = parseFirstReplyMode(raw);
      /* ⛔ THE MODE AND THE ON/OFF BOOLEAN MOVE TOGETHER, because the UI is ONE three-way control
         and two fields behind it. 'off' clears the boolean; either working mode sets it. Writing
         only the mode would leave a control that says "Run audit only" over a rule the trigger
         still reads as off — the screen and the behaviour disagreeing, which is the failure this
         whole panel exists to prevent. The chosen behaviour is REMEMBERED across an off period:
         first_reply_mode keeps its value so turning the rule back on restores what it was doing. */
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (next === "off") patch.auto_reply_enabled = false;
      else { patch.auto_reply_enabled = true; patch.first_reply_mode = next; }
      const { error: mErr } = await service.from("whatsapp_outreach_state").update(patch).eq("id", 1);
      if (mErr) return json({ ok: false, error: "mode_failed", detail: mErr.message }, 500);
      return json({
        ok: true, ...statusPayload,
        autoReplyEnabled: next !== "off",
        firstReplyMode: next === "off" ? statusPayload.firstReplyMode : next,
      });
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

    /* ══ mode 'contact_check' — WHICH OF THESE NUMBERS HAVE WE ALREADY CONTACTED? ═══════════════
       Read-only. Exists because the SPA CANNOT ANSWER THIS ITSELF: contact_suppressions has RLS
       enabled with no policies, so an anon-key read returns HTTP 200 and an EMPTY ARRAY (CLAUDE.md
       §8). The enqueue filter in OutreachTable has been 'checking' suppression that way since it was
       written and has therefore never excluded anyone - a silent no-op, exactly the failure that
       section records. whatsapp_messages is readable but only under the operator's own RLS scope,
       and the whole point is to catch a number that belongs to a DIFFERENT lead row.

       ⚠️ IT REPORTS, IT DOES NOT DECIDE. The authoritative refusals stay at send time in the drip
       and in send-whatsapp-message; this makes the queue dialog honest before an operator commits.
       A caller that cannot reach this endpoint must fail towards NOT queueing - see the SPA side. */
    if (mode === "contact_check") {
      const raw: unknown[] = Array.isArray(body.phones) ? body.phones : [];
      const asked: string[] = [];
      for (const x of raw) {
        const d = String(x ?? "").replace(/\D/g, "");
        if (d && !asked.includes(d)) asked.push(d);
      }
      if (asked.length === 0) return json({ ok: true, mode, contacted: [], suppressed: [] });

      /* 🔴 THIS USED TO REFUSE ANY BATCH OVER 500 PHONES, AND THAT BROKE ALL OUTREACH (2026-09-03).
         Queueing 909 leads returned 400 too_many_phones, the SPA fails closed on a non-ok answer, and
         nothing could be queued at all. The cap was mine, added the day before out of caution about a
         long `.in()` URL - measured since: 909 phones is an 11,924-character URL and PostgREST serves
         it without complaint, so the cap was guarding against nothing and blocking everything.

         🔴 BUT REMOVING THE CAP ALONE WOULD HAVE MADE THE CHECK SILENTLY WRONG, WHICH IS WORSE THAN
         BLOCKING. Measured on the same run: `.in()` over 909 phones came back with EXACTLY 1000 rows -
         PostgREST's db-max-rows truncation (CLAUDE.md §6). One phone can carry forty messages, so the
         1000-row budget is exhausted long before every phone is represented, and the phones that fall
         off the end read as NEVER CONTACTED. A guard against double-messaging that quietly returns
         "clean" for a contacted number is the exact bug it exists to prevent.

         ⛔ SO IT NO LONGER FILTERS BY PHONE AT ALL. It reads the DISTINCT set of contacted numbers
         once, paginated to exhaustion, and intersects in memory. Measured today: 2,916 non-failed
         messages = 1,047 distinct phones in 3 reads, and the cost does not grow with the size of the
         batch being queued - only with the message log, which is the thing that actually bounds it.
         A 909-lead queue and a 9-lead queue now do identical work.

         ⚠️ AND AN EXHAUSTED PAGE BUDGET FAILS CLOSED. A partial set is indistinguishable from a clean
         one, so if the log ever outgrows MAX_PAGES this reports an error rather than an answer. */
      const PAGE = 1000;
      const MAX_PAGES = 80;               // 80k messages before this needs revisiting

      /** Every phone with a non-failed message, as bare digits. null = could not be read in full. */
      const readContactedPhones = async (): Promise<Set<string> | null> => {
        const out = new Set<string>();
        for (let page = 0; page < MAX_PAGES; page++) {
          const from = page * PAGE;
          const { data, error } = await service
            .from("whatsapp_messages")
            .select("phone")
            .neq("status", "failed")
            /* ⚠️ ORDERED BY id. Without a stable unique order, paging can repeat or skip rows and the
               set would be quietly incomplete - the same reason fetchAllRows exists in the SPA. */
            .order("id", { ascending: true })
            .range(from, from + PAGE - 1);
          if (error) {
            console.error(`[contact_check] message page ${page} failed: ${error.message}`);
            return null;
          }
          const rows = (data ?? []) as Array<{ phone: string | null }>;
          for (const r of rows) {
            const d = String(r.phone ?? "").replace(/\D/g, "");
            if (d) out.add(d);
          }
          if (rows.length < PAGE) return out;      // a short page is the end
        }
        console.error(`[contact_check] message log exceeded ${MAX_PAGES} pages - refusing rather than answering from a partial set`);
        return null;
      };

      /** Suppressed numbers. Stored as "+447…", compared as bare digits. */
      const readSuppressedPhones = async (): Promise<Set<string> | null> => {
        const out = new Set<string>();
        for (let page = 0; page < MAX_PAGES; page++) {
          const from = page * PAGE;
          const { data, error } = await service
            .from("contact_suppressions")
            .select("phone_e164")
            .order("id", { ascending: true })
            .range(from, from + PAGE - 1);
          if (error) {
            console.error(`[contact_check] suppression page ${page} failed: ${error.message}`);
            return null;
          }
          const rows = (data ?? []) as Array<{ phone_e164: string | null }>;
          for (const r of rows) {
            const d = String(r.phone_e164 ?? "").replace(/\D/g, "");
            if (d) out.add(d);
          }
          if (rows.length < PAGE) return out;
        }
        return null;
      };

      const [contactedAll, suppressedAll] = await Promise.all([readContactedPhones(), readSuppressedPhones()]);
      /* ⛔ FAILS CLOSED, and the SPA refuses to queue on this. A read we could not complete tells us
         nothing about who is contactable, and answering "nobody" would queue the whole book. */
      if (!contactedAll || !suppressedAll) {
        return json({ ok: false, error: "contact_check_failed", detail: "could not read the contact history in full" }, 200);
      }
      /* Only the intersection travels back - the caller asked about these numbers, and returning 1,047
         phones it never mentioned would be both wasteful and a small disclosure. */
      return json({
        ok: true, mode,
        checked: asked.length,
        contacted: asked.filter((d) => contactedAll.has(d)),
        suppressed: asked.filter((d) => suppressedAll.has(d)),
      });
    }

    /* ══ mode 'suppress_lead' — MARKING SOMEONE NOT INTERESTED NOW ACTUALLY STOPS CONTACT ════════
       🔴 THE GAP THIS CLOSES (measured 2026-09-02): the SPA writes lead statuses but has never
       written a single contact_suppressions row - it only ever READ that table, and blindly (see
       above). So `not_interested` set by hand was a label and nothing more. Four numbers marked
       not_interested were sent video_template that afternoon, and the suppression guard had
       nothing to match on. 28 suppression rows existed at the time, every one written by
       whatsapp-inbound's isDecline auto-detection - none by an operator.

       ⚠️ SUPPRESSION IS FOREVER AND CROSS-CHANNEL ('one no anywhere means suppressed everywhere').
       That is why this takes an explicit reason from a closed set rather than mirroring whatever
       status the UI happens to write next: a status is a workflow position and can be corrected, a
       suppression is a promise. Only the two statuses that MEAN 'do not contact this business' may
       write one, and any other value is refused rather than quietly accepted.
       ⚠️ Phone AND email AND lead id all go on the row - the phone is what stops a duplicate lead
       row being messaged, which a lead-id-only suppression would not. */
    if (mode === "suppress_lead") {
      const leadId = typeof body.lead_id === "string" ? body.lead_id.trim() : "";
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (!leadId) return json({ ok: false, error: "lead_id_required" }, 400);
      if (reason !== "not_interested" && reason !== "closed") {
        return json({ ok: false, error: "unsupported_reason", reason }, 400);
      }
      const { data: l, error: lErr } = await service
        .from("outreach_leads").select("id, phone, email, country, business_name").eq("id", leadId).maybeSingle();
      if (lErr) return json({ ok: false, error: "lead_read_failed", detail: lErr.message }, 200);
      if (!l) return json({ ok: false, error: "lead_not_found" }, 404);
      const lead = l as { id: string; phone: string | null; email: string | null; country: string | null; business_name: string | null };
      /* toWhatsAppNumber gives bare digits; suppress() canonicalises to '+' itself via toE164, so the
         row lands on the same key twilio-inbound and checkSuppressed use. */
      const digits = lead.phone ? toWhatsAppNumber(lead.phone, lead.country) : "";
      const wrote = await suppress(service, {
        phone: digits || null, email: lead.email ?? null, leadId: lead.id,
      }, { reason, source: "operator_status" });
      return json({ ok: wrote, mode, lead_id: lead.id, business: lead.business_name, suppressed: wrote });
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
      /* ⛔ THE SECOND LINE ON SENDING, AND IT IS DELIBERATELY REDUNDANT. An audit_only arm writes a
         TERMINAL status this drain never selects, so a send is already impossible — this refuses
         first_reply rows by MODE as well, which covers the rows that predate the mode (there were
         18 such rows when this shipped) and any row a future code path parks as 'pending' without
         consulting the mode. Same shape as the paying-customer guard: refused at arm time AND at
         send time, because the two can be reached independently. */
      const replyMode = await firstReplyMode(service);
      const replyModeSends = modeSends(replyMode);
      let completeTemplateOn = false;
      try {
        const { data: st, error: stErr } = await service
          .from("whatsapp_outreach_state").select("audit_complete_template").eq("id", 1).maybeSingle();
        if (!stErr) completeTemplateOn = !!st?.audit_complete_template;
      } catch { /* column missing → audit_complete rows stay pending */ }

      const nowIso = new Date().toISOString();
      const { data: due, error: dueErr } = await service
        .from("whatsapp_auto_replies")
        // fire_after rides along for the staleness guard below - selecting it is load-bearing:
        // without it every row reads as undated, i.e. stale, and nothing would ever send.
        .select("id, lead_id, phone, created_at, trigger, template_name, fire_after")
        .eq("status", "pending")
        .lt("fire_after", nowIso)
        .order("fire_after", { ascending: true })
        .limit(10);
      if (dueErr) return json({ ok: true, mode, skipped: "table_unavailable", detail: dueErr.message, processed: 0 });

      let processed = 0;
      const results: Record<string, string> = {};
      for (const row of (due ?? []) as Array<{ id: string; lead_id: string; phone: string; created_at: string; trigger?: string | null; template_name?: string | null; fire_after?: string | null }>) {
        // Per-trigger switch (see above). Default trigger (pre-SQL rows / null) = first_reply.
        const trigger = row.trigger || "first_reply";
        if (trigger === "first_reply" && !replyToggleOn) continue;
        /* Mode says audit-only → the first_reply rule sends NOTHING. Left pending rather than
           finished, exactly like the toggle-off case above: the rule is paused, not cancelled, and
           switching to send mode resumes it. */
        if (trigger === "first_reply" && !replyModeSends) continue;
        if (trigger === "audit_complete" && !completeTemplateOn) continue;
        /* ⛔ AND A ROW THAT WENT STALE WHILE THE RULE WAS OFF IS RETIRED, NOT SENT. Measured
           2026-09-08: 18 first_reply rows were parked past their fire_after — four for leads
           already at status `report_sent` — waiting on a toggle. Turning the rule on would have
           sent all of them days late. Retiring them is terminal and says why, so the pile cannot
           rebuild itself over the next long off period. */
        if (isStaleAutoReply(row.fire_after, Date.parse(nowIso))) {
          await service.from("whatsapp_auto_replies")
            .update({
              status: "skipped_stale",
              reason: `parked since ${String(row.fire_after ?? "unknown")} — too old to send automatically`.slice(0, 300),
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id).eq("status", "pending");
          results[row.lead_id] = "skipped_stale";
          continue;
        }
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
            .select("id, user_id, status, business_name, is_archived, amount_paid").eq("id", row.lead_id).maybeSingle();
          if (!lead) { await finish("flagged_error", "lead_missing"); results[row.lead_id] = "flagged_error"; continue; }
          /* ⛔ NEVER AUTO-PITCH A PAYING CUSTOMER. amount_paid > 0 is the money-not-status rule
             (CLAUDE.md §6): a customer who paid (possibly during the ~3-min delay, or armed before
             this guard existed) must never receive the audit sales pitch. Authoritative last line —
             the arm path also refuses, but this catches a lead that became paid after arming. */
          if (((lead.amount_paid as number | null) ?? 0) > 0) {
            await finish("skipped_paid", "paying customer — never auto-pitch");
            results[row.lead_id] = "skipped_paid";
            continue;
          }
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
          const templateName = row.template_name || DEFAULT_FIRST_REPLY_TEMPLATE;
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
            /* ⛔ THE EXTRA IS BUILT FROM WHAT THE TEMPLATE DECLARES, NOT FROM A GUESSED CLASS.
               This branch is entered on `vars.includes("trade") || vars.includes("competitors")` and
               used to hand over `{ trade, competitors }` unconditionally - right while audit_reply
               was its only member. video_template also declares `trade`, so it lands here too and
               would have been sent with `town` and `audit_url` ABSENT: templateBodyParams throws on
               an empty audit_url, so the row would have failed flagged_error for every lead, however
               good its data. Safe, but permanently broken. Keying on the declared vars fills the
               next audit-class template correctly by construction. */
            /* ⛔ NO RIVAL FALLBACK ON THIS LANE, AND THAT IS NOT AN OVERSIGHT — DO NOT "MAKE IT
               CONSISTENT" WITH THE DRIP. This is the FIRST-REPLY lane: the lead has already
               answered us. The fallback target, video_template, is a COLD opener ("is this the
               right number"), and the phone-history seatbelt that would normally stop a cold
               template reaching a number already in conversation runs in the drip, NOT here. So
               falling back here would post a cold opener into a live conversation, with the one
               guard that exists for that specific mistake not in the path.
               A rival-naming template set as the reply template therefore HOLDS instead: the
               payload builder throws `unsafe_template_var:rivals_unavailable:…`, the catch below
               turns it into flagged_unsafe_var with its reason, and the operator sees a lead to
               look at rather than a prospect reading the wrong message. */
            const auditExtra: Record<string, string | string[]> = { trade: vars.trade };
            if (tmpl.vars.includes("competitors")) auditExtra.competitors = vars.competitors;
            if (templateNeedsRivals(tmpl.vars)) auditExtra.rivals = vars.rivals;
            if (tmpl.vars.includes("town")) auditExtra.town = vars.town;
            if (tmpl.vars.includes("audit_url")) auditExtra.auditUrl = vars.link;
            /* ⛔ AN UNSAFE TRADE OR TOWN HOLDS THE LEAD, IT DOES NOT SEND IT WRONG (2026-09-12).
               video_template's body is "for a {{2}} in {{3}}", so a plural trade or a town like
               "Bourne uk" would reach a prospect as visibly broken copy. templateBodyParams throws
               `unsafe_template_var:<reason>:<value>`; catching it HERE turns that into the same
               drop-with-a-reason every other guard on this path uses, so the drip never stalls and
               the row carries why it was held.
               ⚠️ NAMED SEPARATELY from flagged_error on purpose: this is our data being unusable,
               not Meta refusing us, and the two want different fixes. */
            try {
              payload = claimTemplatePayload(templateName, tmpl.lang, vars.business, vars.link, auditExtra);
            } catch (e) {
              const msg = (e as Error).message ?? "";
              if (msg.startsWith("unsafe_template_var:")) {
                console.warn(`[whatsapp] HELD ${row.lead_id} (${templateName}): ${msg}`);
                await finish("flagged_unsafe_var", msg);
                results[row.lead_id] = "flagged_unsafe_var";
                continue;
              }
              throw e;
            }
            renderedBody = renderTemplateBody(templateName, vars.business, vars.link, vars.trade, vars.competitors, undefined, vars.town);
            businessName = vars.business;
            claimUrl = vars.link;
          } else if (tmpl.vars.includes("onboarding_url")) {
            /* ⛔ THIS BRANCH WAS MISSING, AND WITHOUT IT AN onboarding_url TEMPLATE COULD NEVER SEND
               FROM THIS PATH — for any lead, however good its data. The else below resolves `url`
               and nothing resolved `onboarding_url`, so templateBodyParams reached its own guard and
               THREW ("refusing to send a follow-up with no link"). The per-row catch turned that into
               flagged_error, so it refused rather than sending a broken link — right outcome, wrong
               reason, and unfixable by anything on the lead.
               Live for `onboarding_followup` since the day it was registered; re_engage_49 now shares
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
    /* == AUDIT AHEAD OF THE SEND =============================================================
       video_template's {{4}} is the lead's report link, so the audit must exist before the
       message can be built. This starts the audits the drip is about to need, capped at
       OUTREACH_AUDIT_CONCURRENCY in flight, at 3 questions x 1 run.

       ⛔ IT SITS ABOVE THE CAP AND PACING GATES ON PURPOSE. `next_send_at` paces MESSAGES - it
       returns "not_due" on most ticks, so an audit pass below it would almost never run and a batch
       would warm up at one audit per send-interval, taking days. An audit is not a send: it is not
       rate-limited by Meta, does not count against DAILY_CAP, and the prospect never sees it.
       ⚠️ It IS below `paused` and `windowOpen`, because those two mean "we are not contacting
       anyone right now" - starting paid audits for messages that cannot go out for twelve hours is
       spend with no recipient.
       ⚠️ Never fatal: a failure here must not stop a tick sending something it already could. */
    let auditAhead: Awaited<ReturnType<typeof runOutreachAuditAhead>> | null = null;
    try {
      auditAhead = await runOutreachAuditAhead(service, (name) => TEMPLATES[name ?? ""]?.vars);
      if (auditAhead.started || auditAhead.waiting) {
        console.log(`[outreach-audit] started=${auditAhead.started} waiting=${auditAhead.waiting} inFlight=${auditAhead.inFlight} skipped=${auditAhead.skipped} considered=${auditAhead.considered}`);
      }
    } catch (e) {
      console.error("[outreach-audit] audit-ahead pass threw:", e instanceof Error ? e.message : String(e));
    }

    if ((sentToday ?? 0) >= DAILY_CAP) return json({ ok: true, skipped: "cap_reached", ...statusPayload, auditAhead });
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
    const { data: leadRows } = await service
      .from("outreach_leads")
      .select("id, business_name, phone, email, country, whatsapp_template, whatsapp_attempts, whatsapp_delivery_status, whatsapp_ever_delivered, previous_status, user_id, campaign_id, queued_at")
      .eq("status", "queued")
      .eq("is_archived", false)
      .not("phone", "is", null)
      .or(`derived_town.not.is.null,town_fetch_note.is.null,town_fetch_note.not.in.(${[...SETTLED_TOWN_NOTES].join(",")})`)
      .order("queued_at", { ascending: true })
      .limit(QUEUE_SCAN);

    /* ══ WHICH OF THEM SENDS THIS TICK ═══════════════════════════════════════════════════════════
       🔴 THE BLOCK THIS REPLACES. A lead whose audit was not ready returned the entire tick, so a
       40-deep queue drained at one send per audit-completion instead of one per tick — six leads
       with finished audits sat behind one that was still running.

       ⛔ SKIPPING IS NOT DROPPING, and that distinction is the September fix this must not undo.
       A skipped lead is simply NOT CHOSEN this tick: nothing is written, its status stays 'queued',
       its queued_at is untouched, and it is examined again — first, because it is oldest — on the
       very next tick. The only path that changes a lead's status is the existing stale branch
       below, which is reached exactly as often as it was before.

       ⛔ AND SKIPPING CANNOT STARVE THE HEAD, because this is a per-tick fallback rather than a
       reordering. The oldest lead is re-examined at the top of EVERY tick and wins the moment its
       audit completes; it is never marked, deprioritised or remembered as skipped. Its worst case
       is unchanged: `decideOutreachAudit` stops returning wait/start once the audit passes
       OUTREACH_AUDIT_STALE_MS, and it is then dequeued with its reason — the same bound as before.
       ⚠️ WHICH IS WHY THE FALLBACK IS THE HEAD, NOT "nothing". If no candidate is sendable we
       deliberately proceed with the OLDEST lead so the existing branch can decide between waiting
       and dropping it. Returning early here instead would mean a permanently wedged head is never
       re-evaluated and never dequeued — starvation introduced by the fix for starvation. */
    /* ⛔ ROUND-ROBIN ACROSS CAMPAIGNS, THEN TAKE THE LOOK-AHEAD WINDOW FROM THE FAIR ORDER.
       The query above is FIFO, which meant the campaign queued first drained completely before the
       next one sent anything — measured 2026-09-14: the next twelve ticks all belonged to one of two
       queued campaigns, and the other (75 leads) would have waited ~44 minutes. At a 300-lead
       campaign that is ~11 hours, i.e. the whole window. Equal share: every campaign gets one slot
       per round whatever its size, so a small test campaign clears the same day.
       ⚠️ THE PACING, THE CAP, THE WINDOW AND EVERY GUARD ARE UNTOUCHED. This changes WHICH lead is
       chosen, never how many or how fast. Still one send per tick. */
    const scanned = (leadRows ?? []) as Array<Record<string, unknown> & { id: string; campaign_id?: string | null; queued_at?: string | null }>;
    const candidates = interleaveByCampaign(scanned).slice(0, QUEUE_LOOKAHEAD) as Array<Record<string, unknown>>;
    if (scanned.length > candidates.length || campaignsRepresented(scanned) > 1) {
      console.log(`[queue] scanned ${scanned.length} queued lead(s) across ${campaignsRepresented(scanned)} campaign(s); examining the fairest ${candidates.length}`);
    }
    let lead: Record<string, unknown> | null = candidates[0] ?? null;
    let skippedForAudit = 0;
    if (candidates.length > 1) {
      /* ONE batched read for the whole look-ahead, not one per candidate. */
      const states = await readAuditStates(service, candidates.map((c) => String(c.id)));
      for (const c of candidates) {
        const vars = TEMPLATES[String(c.whatsapp_template ?? "")]?.vars;
        if (!templateNeedsAudit(vars)) { lead = c; break; }   // nothing to wait for
        /* ⚠️ THE TEST IS `completedAt` ALONE, NOT decideOutreachAudit. Its completed-audit branch
           returns start:false/wait:false unconditionally, so the answer would be identical — but it
           also reads search_keyword, category, search_location, address and website, none of which
           this query selects. Calling it here would judge a lead on fields that are `undefined`
           because of the SELECT rather than because of the data: the exact trap the prefill note in
           findable-onboarding records. The send path re-derives everything properly for whichever
           lead is chosen. */
        if (states.get(String(c.id))?.completedAt) { lead = c; break; }
        skippedForAudit++;
      }
      if (skippedForAudit > 0) {
        console.log(`[queue] looked past ${skippedForAudit} lead(s) waiting on an audit; they stay queued and are re-examined next tick`);
      }
    }
    /* "empty_queue", "nothing left but archived leads" and "nothing left but unverifiable towns"
       are different facts, so they get different skip codes. Without this, pulling 17 leads out of
       the queue by archiving them would look identical to having genuinely finished the list. */
    if (!lead) {
      /* ══ HOOK FOLLOW-UP LANE ══════════════════════════════════════════════════════════════════
         Openers have priority; the report follow-up drains only when the opener queue is empty this
         tick. It reaches here ONLY after the pause/window/cap/pacing gates above have passed, and it
         sends AT MOST ONE message and writes the shared pacing stamp — so it shares the global cap,
         window and rate exactly, and a queue of 300 drains over days, never in a burst.
         ⛔ SEPARATE from the opener send path on purpose: the opener's already_sent guard would
         refuse every one of these (they all got the report), and its status→initial_contact write
         would corrupt a report-sent lead. This lane re-messages deliberately and leaves the pipeline
         status untouched. Every per-lead guard is re-checked HERE (authoritative), not trusted from
         the client that queued it. */
      const { data: hookLead } = await service
        .from("outreach_leads")
        .select("id, business_name, phone, email, country, contact_name, amount_paid, user_id")
        .not("hook_followup_queued_at", "is", null)
        .eq("is_archived", false)
        .not("phone", "is", null)
        .or(`derived_town.not.is.null,town_fetch_note.is.null,town_fetch_note.not.in.(${[...SETTLED_TOWN_NOTES].join(",")})`)
        .order("hook_followup_queued_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (hookLead) {
        const clearMarker = () => service.from("outreach_leads")
          .update({ hook_followup_queued_at: null }).eq("id", hookLead.id);

        // Re-verify eligibility at send time — de-queue silently if it drifted (e.g. replied since).
        const elig = await hookFollowupEligible(service, {
          id: hookLead.id, phone: hookLead.phone, country: hookLead.country, amount_paid: hookLead.amount_paid,
        });
        if (!elig.eligible) {
          await clearMarker();
          return json({ ok: true, skipped: `hook_ineligible:${elig.reason}`, lane: "hook_followup", lead_id: hookLead.id, business: hookLead.business_name, ...statusPayload });
        }

        const to = toWhatsAppNumber(hookLead.phone as string, hookLead.country as string | null);
        if (!to) { await clearMarker(); return json({ ok: true, skipped: "hook_bad_number", lane: "hook_followup", lead_id: hookLead.id, business: hookLead.business_name, ...statusPayload }); }

        // Suppression: one no = suppressed everywhere. Fails closed (service client bypasses RLS).
        const hSupp = await checkSuppressed(service, { phone: `+${to}`, email: hookLead.email ?? null, leadId: hookLead.id });
        if (hSupp.suppressed) { await clearMarker(); return json({ ok: true, skipped: "hook_suppressed", lane: "hook_followup", lead_id: hookLead.id, business: hookLead.business_name, ...statusPayload }); }

        // {{1}} = owner first name if we have it, else "there" (the template's allowed fallback);
        // {{2}} = business name. Resolved server-side, never trusted from the client.
        const first = firstNameFrom(hookLead.contact_name as string | null);
        const hLang = TEMPLATES["hook_followup"].lang;
        const hVars = TEMPLATES["hook_followup"].vars;

        let hMessageId: string | null = null;
        let hDelivery = "simulated";
        let hOutcome: "sent" | "no_whatsapp" | "temporary" = "sent";
        let hError: string | null = null;
        if (live) {
          const payload = claimTemplatePayload("hook_followup", hLang, (hookLead.business_name as string) ?? "", "", { contactName: first });
          const r = await sendViaGraph(accessToken, phoneNumberId, to, payload);
          if (r.ok) { hMessageId = r.messageId; hDelivery = "sent"; hOutcome = "sent"; }
          else {
            hOutcome = classifyFailure(r.failCode) === "permanent" ? "no_whatsapp" : "temporary";
            hDelivery = hOutcome === "no_whatsapp" ? "no_whatsapp" : "failed_temporary";
            hError = r.error;
            console.error(`[hook_followup] send failed (code ${r.failCode ?? "?"}, ${hOutcome}):`, hError);
          }
        } else {
          console.log(`WOULD SEND: hook_followup to ${to} for ${hookLead.business_name} (first="${first || "there"}")`);
        }

        const hNowIso = new Date().toISOString();
        // Audit row — an attempt was made, so it counts toward the shared daily cap.
        await service.from("whatsapp_sends").insert({
          lead_id: hookLead.id, user_id: null, template: "hook_followup", phone: to,
          business_name: hookLead.business_name, claim_url: "", test_mode: testMode,
          message_id: hMessageId, delivery_status: hDelivery, error: hError,
        });

        if (hOutcome === "sent") {
          // Clear the marker (out of the lane); DO NOT touch the pipeline status — this is a
          // follow-up to an existing conversation, not an opener.
          await clearMarker();
          try {
            await service.from("whatsapp_messages").insert({
              direction: "outbound", user_id: (hookLead.user_id as string | null) ?? null, lead_id: hookLead.id,
              phone: to, body: renderTemplateBody("hook_followup", (hookLead.business_name as string) ?? "", "", undefined, undefined, first),
              message_type: "template", template_name: "hook_followup", wa_message_id: hMessageId,
              status: hDelivery, test_mode: testMode,
            });
          } catch (e) { console.error(`[hook_followup] message-log insert threw (non-blocking, ${hookLead.id}):`, (e as Error).message); }
        } else if (hOutcome === "no_whatsapp") {
          // Permanent — never retry. Drop the marker.
          await clearMarker();
        }
        // temporary: keep the marker so it retries on a future eligible tick.

        // Share the pacing clock, exactly like the opener lane.
        await service.from("whatsapp_outreach_state")
          .update({ next_send_at: nextPacingStamp(sentToday ?? 0), updated_at: hNowIso }).eq("id", 1);

        return json({
          ok: true, sent: hOutcome === "sent", simulated: !live, outcome: hOutcome, lane: "hook_followup",
          lead_id: hookLead.id, business: hookLead.business_name, template: "hook_followup", to,
          message_id: hMessageId, delivery_status: hDelivery, error: hError,
          ...statusPayload, sentToday: (sentToday ?? 0) + 1,
        });
      }

      /* ══ CONTACT FOLLOW-UP LANE ═══════════════════════════════════════════════════════════════
         The OPENER follow-up (never replied to initial_contact). Drains only after the opener queue
         AND the hook lane are empty this tick, so openers and report follow-ups both take priority.
         Same contract as the hook lane: at most one send, shares the global cap/window/pacing, and
         is SEPARATE from the opener path on purpose — the opener's already_sent guard would refuse
         every one of these (they all got the opener) and its status→initial_contact write would
         corrupt the pipeline. Leaves the pipeline status untouched; re-checks eligibility HERE. */
      const { data: contactLead } = await service
        .from("outreach_leads")
        .select("id, business_name, phone, email, country, amount_paid, user_id")
        .not("contact_followup_queued_at", "is", null)
        .eq("is_archived", false)
        .not("phone", "is", null)
        .or(`derived_town.not.is.null,town_fetch_note.is.null,town_fetch_note.not.in.(${[...SETTLED_TOWN_NOTES].join(",")})`)
        .order("contact_followup_queued_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (contactLead) {
        const clearMarker = () => service.from("outreach_leads")
          .update({ contact_followup_queued_at: null }).eq("id", contactLead.id);

        // Re-verify eligibility at send time — de-queue silently if it drifted (e.g. replied since).
        const elig = await contactFollowupEligible(service, {
          id: contactLead.id, phone: contactLead.phone, country: contactLead.country, amount_paid: contactLead.amount_paid,
        });
        if (!elig.eligible) {
          await clearMarker();
          return json({ ok: true, skipped: `contact_ineligible:${elig.reason}`, lane: "contact_followup", lead_id: contactLead.id, business: contactLead.business_name, ...statusPayload });
        }

        const to = toWhatsAppNumber(contactLead.phone as string, contactLead.country as string | null);
        if (!to) { await clearMarker(); return json({ ok: true, skipped: "contact_bad_number", lane: "contact_followup", lead_id: contactLead.id, business: contactLead.business_name, ...statusPayload }); }

        // Suppression: one no = suppressed everywhere. Fails closed (service client bypasses RLS).
        const cSupp = await checkSuppressed(service, { phone: `+${to}`, email: contactLead.email ?? null, leadId: contactLead.id });
        if (cSupp.suppressed) { await clearMarker(); return json({ ok: true, skipped: "contact_suppressed", lane: "contact_followup", lead_id: contactLead.id, business: contactLead.business_name, ...statusPayload }); }

        // {{1}} = business name only (contact_followup has a single variable; it opens "Hi," with no
        // first-name greeting, so no owner name is resolved here).
        const cLang = TEMPLATES["contact_followup"].lang;

        let cMessageId: string | null = null;
        let cDelivery = "simulated";
        let cOutcome: "sent" | "no_whatsapp" | "temporary" = "sent";
        let cError: string | null = null;
        if (live) {
          const payload = claimTemplatePayload("contact_followup", cLang, (contactLead.business_name as string) ?? "", "");
          const r = await sendViaGraph(accessToken, phoneNumberId, to, payload);
          if (r.ok) { cMessageId = r.messageId; cDelivery = "sent"; cOutcome = "sent"; }
          else {
            cOutcome = classifyFailure(r.failCode) === "permanent" ? "no_whatsapp" : "temporary";
            cDelivery = cOutcome === "no_whatsapp" ? "no_whatsapp" : "failed_temporary";
            cError = r.error;
            console.error(`[contact_followup] send failed (code ${r.failCode ?? "?"}, ${cOutcome}):`, cError);
          }
        } else {
          console.log(`WOULD SEND: contact_followup to ${to} for ${contactLead.business_name}`);
        }

        const cNowIso = new Date().toISOString();
        // Audit row — an attempt was made, so it counts toward the shared daily cap.
        await service.from("whatsapp_sends").insert({
          lead_id: contactLead.id, user_id: null, template: "contact_followup", phone: to,
          business_name: contactLead.business_name, claim_url: "", test_mode: testMode,
          message_id: cMessageId, delivery_status: cDelivery, error: cError,
        });

        if (cOutcome === "sent") {
          // Clear the marker (out of the lane); DO NOT touch the pipeline status — this is a
          // follow-up to an existing conversation, not an opener.
          await clearMarker();
          try {
            await service.from("whatsapp_messages").insert({
              direction: "outbound", user_id: (contactLead.user_id as string | null) ?? null, lead_id: contactLead.id,
              phone: to, body: renderTemplateBody("contact_followup", (contactLead.business_name as string) ?? "", ""),
              message_type: "template", template_name: "contact_followup", wa_message_id: cMessageId,
              status: cDelivery, test_mode: testMode,
            });
          } catch (e) { console.error(`[contact_followup] message-log insert threw (non-blocking, ${contactLead.id}):`, (e as Error).message); }
        } else if (cOutcome === "no_whatsapp") {
          // Permanent — never retry. Drop the marker.
          await clearMarker();
        }
        // temporary: keep the marker so it retries on a future eligible tick.

        // Share the pacing clock, exactly like the opener and hook lanes.
        await service.from("whatsapp_outreach_state")
          .update({ next_send_at: nextPacingStamp(sentToday ?? 0), updated_at: cNowIso }).eq("id", 1);

        return json({
          ok: true, sent: cOutcome === "sent", simulated: !live, outcome: cOutcome, lane: "contact_followup",
          lead_id: contactLead.id, business: contactLead.business_name, template: "contact_followup", to,
          message_id: cMessageId, delivery_status: cDelivery, error: cError,
          ...statusPayload, sentToday: (sentToday ?? 0) + 1,
        });
      }

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
    /* ⚠️ `let`, FOR ONE REASON ONLY: a template that names three competitors and cannot get three
       falls back to video_template (rivalHookDecision, applied after the audit resolves below).
       Nothing else reassigns these, and the fallback is one-way. */
    let templateName = requestedTemplate;
    let lang = TEMPLATES[templateName].lang;
    let tvars = TEMPLATES[templateName].vars;
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

    /* ⛔ `auditUrl` AND `town` BELONG HERE TOO, AND LEAVING THEM OUT COST A REAL SEND. This type
       carried only trade/competitors/onboardingUrl, so when video_template (vars: name, trade,
       town, audit_url) came through this path, templateBodyParams found audit_url empty and threw
       "refusing to send a result with no link". Measured live 2026-09-02 13:08 on Nabars Locksmith:
       failed_temporary, nothing delivered.
       🔴 THIS IS THE THIRD SEND PATH AND IT WAS THE ONE THAT MATTERED. The payload build was made
       var-driven in the auto-reply lane and in send-whatsapp-message; THIS drip - the one that
       actually sends outreach - was missed, which is CLAUDE.md's recorded "three callers build it
       themselves" trap landing on a fourth thing. When a template's variables change, grep for
       EVERY builder of its payload and count them before believing you have them all.
       ⚠️ The guard did its job: it refused rather than sending a message with a missing link, and
       failed_temporary means the lead retries rather than being burned. */
    const templateExtra: { trade?: string; competitors?: string; rivals?: string[]; onboardingUrl?: string; town?: string; auditUrl?: string } = {};
    /* Set only when a rival-naming template was swapped for the fallback, so the tick's answer can
       say so. Silence would make a substitution indistinguishable from a normal send. */
    let rivalFallbackReason = "";
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
    if (templateNeedsAudit(tvars)) {
      const ar = await resolveAuditReplyVars(service, lead.id as string);
      if (!ar.ok) {
        /* 🔴 NO COMPLETED AUDIT. THIS USED TO DEQUEUE UNCONDITIONALLY, AND THAT WAS THE BUG.
           `status: "not_contacted"` is right for a lead that can NEVER be audited - a gated lead
           must not stall a one-send-per-tick drip - and wrong for one that simply has not been
           audited YET. Measured 2026-09-02: 16 leads sat queued on video_template with zero
           completed audits, and every one would have been silently un-queued, one per tick, having
           received nothing.
           The two cases are now told apart: an audit in flight (or startable) leaves the lead
           QUEUED and skips this tick; only a lead that genuinely cannot be served is dropped, with
           its reason. decideOutreachAudit owns that distinction and is unit-tested on it.
           ⚠️ The wait is BOUNDED (OUTREACH_AUDIT_STALE_MS) - a wedged audit falls through to the
           old dequeue rather than stalling the queue for everyone behind it. */
        const st = (await readAuditStates(service, [lead.id as string])).get(lead.id as string);
        // deno-lint-ignore no-explicit-any
        const decision = st ? decideOutreachAudit(lead as any, st) : ({ start: false, wait: false, reason: ar.reason } as const);
        if (decision.start || decision.wait) {
          return json({
            ok: true, skipped: "awaiting_audit",
            reason: `${lead.business_name ?? "That lead"} is queued for ${templateName} and its audit is not ready yet - it stays in the queue and sends as soon as the audit completes.`,
            lead_id: lead.id, business: lead.business_name, ...statusPayload, auditAhead,
          });
        }
        await service.from("outreach_leads").update({
          status: "not_contacted", whatsapp_delivery_status: "audit_reply_unavailable", contact_method: null,
        }).eq("id", lead.id);
        return json({
          ok: false, error: "audit_reply_unavailable",
          reason: `${ar.reason} (${decision.reason})`,
          lead_id: lead.id, business: lead.business_name, ...statusPayload, auditAhead,
        }, 200);
      }
      /* ⛔ THREE NAMES OR A DIFFERENT MESSAGE — decided HERE, before anything is built, because it
         changes which template is sent (src/lib/rivalHook.ts). An empty Meta parameter is a rejected
         send and a padded one is a claim we cannot show, so competitor_hook simply does not go to a
         lead whose audit cannot name three rivals; video_template does, and they hear from us today
         instead of waiting for someone to notice.
         ⚠️ EVERY DERIVED VALUE IS RE-READ FROM THE NEW TEMPLATE. Reassigning the name alone would
         leave `tvars` describing competitor_hook while the payload is built for video_template —
         six parameters for a four-variable template, which Meta answers with #132000 and which
         reads, from the outside, exactly like the fallback not working.
         ⚠️ THE ROW KEEPS ITS OPERATOR-CHOSEN TEMPLATE; only this SEND changes. The message log
         records what actually went out (templateName below), so the transcript stays true. */
      const rivalCall = rivalHookDecision(templateName, templateNeedsRivals(tvars), ar.rivals.length);
      if (rivalCall.fellBack) {
        console.warn(`[whatsapp] ${lead.id}: ${rivalCall.reason}`);
        templateName = rivalCall.template;
        lang = TEMPLATES[templateName].lang;
        tvars = TEMPLATES[templateName].vars;
        rivalFallbackReason = rivalCall.reason;
      }
      /* FROM THE TEMPLATE'S DECLARED VARS, matching the other two builders exactly - so a template
         that declares town/audit_url is filled, and one that does not is byte-identical to before. */
      templateExtra.trade = ar.trade;
      if (tvars.includes("competitors")) templateExtra.competitors = ar.competitors;
      if (templateNeedsRivals(tvars)) templateExtra.rivals = ar.rivals;
      if (tvars.includes("town")) templateExtra.town = ar.town;
      if (tvars.includes("audit_url")) templateExtra.auditUrl = ar.link;
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
       🔴 IT WAS `templateName === "initial_contact"` UNTIL 2026-09-02, AND THAT NAME IS WHY IT
            FAILED. When it was written, initial_contact was the only cold opener the queue could carry.
            The audit-first flow then began queueing `video_template`, and a guard keyed to a NAME
            rather than to a PROPERTY stopped applying to the traffic that had replaced it. Nothing was
            deleted or bypassed - 16 hook sends walked past it, 12 to numbers already in conversation,
            9 of those had replied and 4 were marked not_interested.
            `isColdOutreachTemplate` (src/lib/coldOutreach.ts) answers it as a property, treats an
            UNKNOWN template as COLD, and is the same predicate the enqueue filter and
            send-whatsapp-message read - so the three cannot drift apart again.
          - Continuations are exempt because guarding them would make them unsendable to their only
            audience (re_engage_49 exists FOR leads with history). That list lives in the leaf, not here.
       - .neq(status,'failed') mirrors pitchEverSent: a failed attempt is not a conversation, so a
         legitimate retry of THIS lead's own failed opener still passes.
       - Same drop-out-of-the-queue shape as every guard above (the drip must never stall), with
         its own delivery status so the row says WHY — counted in the status payload, never silent. */
    if (isColdOutreachTemplate(templateName)) {
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
            /* 🔴 THIS BUILT THE PAYLOAD INLINE, AND video_template NEVER ONCE REACHED A PHONE.
               templateBodyParams returns the BODY only. video_template is registered at Meta with a
               VIDEO header, so every attempt was rejected:
                 (#132012) "header component parameter should not be empty"
               Attempted 4 times, accepted 0 — over the entire life of the template. The operator's
               best-performing asset had never successfully sent, and `whatsapp_sends` rows are
               written whatever Meta answers, so the row count looked like traffic.
               ⛔ A HEADER IS A PROPERTY OF THE TEMPLATE, SO ONLY THE REGISTRY CAN KNOW IT.
               claimTemplatePayload reads WA_TEMPLATES and adds the header component when the entry
               declares one — its own comment already said "a template registered with a VIDEO
               header and sent with only a body is rejected". Every other send path in the product
               calls it; this one kept a private copy of the assembly, and a copy cannot learn about
               a field added after it was written.
               ⚠️ It supplies `type` AND `template`, so neither is spelled out here any more. */
            ...claimTemplatePayload(templateName, lang, lead.business_name as string, resolvedUrl, templateExtra),
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
          // town is the 6th positional arg (see renderTemplateBody) - without it the operator
          // transcript would read "in your area" while the prospect's message named their town.
          body: renderTemplateBody(templateName, lead.business_name as string, resolvedUrl, templateExtra.trade, templateExtra.competitors, undefined, templateExtra.town),
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

    // Pace the next send after ANY real/simulated attempt (spread quota + jitter — see nextPacingStamp).
    await service.from("whatsapp_outreach_state")
      .update({ next_send_at: nextPacingStamp(sentToday ?? 0), updated_at: nowIso }).eq("id", 1);

    return json({
      ok: true,
      sent: outcome === "sent",
      simulated: !live,
      outcome,
      lead_id: lead.id,
      business: lead.business_name,
      template: templateName,
      /* Present ONLY when a rival-naming template was swapped for the fallback. A substitution that
         reported itself identically to a normal send would be invisible in exactly the place
         somebody would look for it. */
      ...(rivalFallbackReason ? { requested_template: requestedTemplate, fell_back: rivalFallbackReason } : {}),
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
