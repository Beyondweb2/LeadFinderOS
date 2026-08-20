// notify-onboarding-submit — email the operator when someone fills in the questionnaire and does
// NOT pay. Swept by cron once a minute; each row is only ever considered once.
//
// THE CASE THIS EXISTS FOR: a prospect who completed the questionnaire and stopped at the payment
// screen is the warmest lead there is — they did the work and balked at the price — and until now
// they were invisible. onboarding_responses is not surfaced anywhere, so the only way to find one
// was to run SQL, and the Next Actions chase task does not appear until the NEXT DAY
// (dashboardTasks: daysSince(created_at) >= 1). This fills that gap.
//
// WHY A DELAY RATHER THAN AN IMMEDIATE SEND: the row is written when the questionnaire is submitted,
// which is BEFORE checkout. Emailing immediately would report someone still typing their card number
// as having bailed. The 20 minutes is not just a wait — payment state is re-read at send time, so a
// prospect who pays inside the window is marked notified and NO email goes out. They are covered by
// the payment notification instead, which means one email per prospect rather than two.
//
// SAFETY: every send is best-effort and non-blocking. This function is invoked only by cron and
// touches nothing on the payment path.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
/* The SAME decision function findable-checkout refuses payment with, so this email and that block
   can never disagree about who could be served. Relative path with the .ts extension — Deno cannot
   resolve the Vite "@/" alias. */
import { serveDecision, serveInputFromRow, platformLabel, type ServeGateRow } from "../../../src/lib/serveGate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret, x-internal-job",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** ONE address for anything this system sends the operator. The three older functions each
 *  hardcode their own (paul@yoursites.uk, paul@move37.fun, beyondwebcraft@outlook.com); they are
 *  deliberately left alone here — claim-site emails CUSTOMERS and is not worth the risk. */
const ADMIN_EMAIL = "paul@move37.fun";

/** How long after submission before we conclude they did not pay. See the note above. */
const DELAY_MINUTES = 20;
/** Rows per sweep. Cron runs every minute, so a backlog drains quickly without a long request. */
const BATCH = 20;
/* ⛔ THE RETRY CEILING. A send that never left used to be indistinguishable from one that arrived:
   the row was claimed before the attempt, the failure went to a console log nobody reads, and
   nothing ever tried again. Three attempts, one a minute, recovers a transient Resend blip while
   still making a dead provider stop rather than becoming an email loop — the property the
   claim-before-send design was protecting, kept.
   ⚠️ AT THE CEILING WITH notify_sent_at NULL IS A REAL STATE SOMEBODY MUST LOOK AT. It is not a
   quiet success, and the dashboard card reads it for exactly that reason. */
const MAX_SEND_ATTEMPTS = 3;

const PAID_STATUSES = new Set(["payment_received", "in_delivery", "completed"]);

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface Row {
  id: string;
  lead_id: string | null;
  business_name: string | null;
  status: string | null;
  contact_email: string | null;
  confirmed_location: string | null;
  created_at: string;
  /* THE THREE WEBSITE ANSWERS. A prospect who was BLOCKED from paying looks, to the query above,
     exactly like one who changed their mind — and those two need completely different responses
     from Paul. The verdict is derived from these, never stored. */
  website_platform: string | null;
  website_platform_other: string | null;
  website_manager: string | null;
  willing_to_migrate: string | null;
  /* ⛔ THE FOUR ANSWERS THAT NEED PAUL, IN THE EMAIL RATHER THAN THE DATABASE. "A column I have to
     run SQL to see is a column I will never look at" — so the two that need action and the two that
     shape the work are carried here.
     gbp_status "no_access" and a non-empty must_not_say are the ones that need a reply; gbp_exists
     and photos_status change what the delivery looks like before it starts. */
  gbp_exists: string | null;
  gbp_status: string | null;
  /* ⛔ CARRIED HERE FOR THE SAME REASON AS THE OTHERS — and it is the one most likely to change what
     you do first. An unverified profile is invisible on Maps and Search, so profile work publishes
     to nobody; a column nobody reads is the gbp_manager_email mistake, which this table already
     records once. */
  gbp_verified: string | null;
  must_not_say: string | null;
  photos_status: string | null;
  /** An escape-hatch bail-out. Its answers are partial, so it is never given a verdict. */
  incomplete: boolean | null;
  /** Where the submission came from. NULL = the onboarding flow (every row before 2026-08-19).
   *  'free_check' = the findable.live free-check form, which is a completely different email. */
  source: string | null;
  /** The trade, as the visitor typed it. ⛔ THE FREE-CHECK EMAIL WAS MISSING THE TRADE ENTIRELY
   *  because this column was not in the SELECT and the trade line read only off a LINKED lead —
   *  which a generic submission does not have at the moment the row is written. */
  services: string | null;
  /** Attempts already made. Read so the claim below can be conditional on it. */
  notify_attempts: number | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const cronSecret = Deno.env.get("CRON_SECRET") ?? "";

    /* Cron-only. Same shape the other scheduled functions use: the secret AND the internal marker.
       There is nothing here a public caller should be able to trigger — it sends email. */
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const internal = !!req.headers.get("x-internal-job");
    const allowed =
      (!!cronSecret && req.headers.get("x-cron-secret") === cronSecret && internal) ||
      (!!serviceKey && token === serviceKey && internal);
    if (!allowed) return json({ ok: false, error: "unauthorized" }, 401);

    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const cutoff = new Date(Date.now() - DELAY_MINUTES * 60_000).toISOString();

    /* Candidates: submitted long enough ago, never notified. `notified_at` is the marker; if the
       column is missing this select errors and the sweep reports it rather than emailing twice. */
    const { data, error } = await service
      .from("onboarding_responses")
      // ONE STRING LITERAL, not a concatenation. supabase-js types the select on the literal, so
      // splitting it across two lines makes `data` GenericStringError[] and the cast below a TS2352.
      .select("id, lead_id, business_name, status, contact_email, confirmed_location, created_at, website_platform, website_platform_other, website_manager, willing_to_migrate, gbp_exists, gbp_status, gbp_verified, must_not_say, photos_status, incomplete, notify_attempts, source, services")
      /* ⛔ THE GATE IS notify_sent_at, NOT notified_at. notified_at is the CLAIM stamp, written
         before the attempt — gating on it is what made a failed send permanent and invisible.
         Gating on delivery, bounded by attempts, is what lets a failure come back. */
      .is("notify_sent_at", null)
      .lt("notify_attempts", MAX_SEND_ATTEMPTS)
      /* ⛔ THE DELAY EXISTS FOR ONE REASON THAT DOES NOT APPLY TO A FREE CHECK. It stops us
         reporting someone still typing their card number as having bailed — but a free-check
         visitor is never shown a payment screen, so there is nothing to wait for and the 20 minutes
         is pure lag on the warmest lead in the funnel. Free-check rows are therefore picked on the
         NEXT cron tick (within a minute); everything else keeps the delay exactly as it was.
         One .or() rather than two queries, so the batch/ordering semantics are untouched. */
      .or(`source.eq.free_check,created_at.lte.${cutoff}`)
      .order("created_at", { ascending: true })
      .limit(BATCH);

    if (error) {
      console.error("[notify-onboarding-submit] candidate query failed:", error.message);
      return json({ ok: false, error: "query_failed", detail: error.message }, 500);
    }

    const rows = (data ?? []) as Row[];
    let sent = 0, skippedPaid = 0, lostRace = 0, failed = 0;

    for (const row of rows) {
      /* CLAIM FIRST, ATOMICALLY. The conditional update is what makes double-sending impossible:
         two overlapping sweeps both issue it, the database serialises them, and only one gets a row
         back. Claiming BEFORE sending also means a crash mid-send costs one missed email rather than
         a loop that emails forever. */
      /* ⛔ CLAIMED BY INCREMENTING THE ATTEMPT COUNT, CONDITIONAL ON ITS CURRENT VALUE. The old
         claim was `.is("notified_at", null)`, which is unrepeatable by construction — correct when
         one attempt was all there would ever be, and the reason a failure could never come back.
         Optimistic concurrency on the counter keeps double-sending impossible (two overlapping
         sweeps both issue this; the database serialises them and only one matches the old value)
         while still permitting attempt 2 and 3. */
      const attempts = row.notify_attempts ?? 0;
      const { data: claimed } = await service
        .from("onboarding_responses")
        .update({ notified_at: new Date().toISOString(), notify_attempts: attempts + 1 })
        .eq("id", row.id).eq("notify_attempts", attempts)
        .select("id");
      if (!Array.isArray(claimed) || claimed.length === 0) { lostRace += 1; continue; }

      /** Terminal states. Recorded so nothing re-picks the row, and so the reason survives. */
      const finish = (patch: Record<string, unknown>) =>
        service.from("onboarding_responses").update(patch).eq("id", row.id);

      /* RE-CHECK PAYMENT AT SEND TIME — the point of the delay. Someone who paid inside the window
         must not be reported as having bailed. They stay claimed, so this never runs again for them,
         and the payment notification is what tells you about them. */
      const isFreeCheck = row.source === "free_check";
      let paid = row.status === "paid";
      let phone: string | null = null;
      /* THE ROW'S OWN `services` IS THE FALLBACK, AND FOR A FREE CHECK IT IS THE ONLY SOURCE.
         This used to read the trade exclusively off a linked lead, so a generic submission — which
         has no lead at the moment the row is written — produced an email with no trade in it at
         all. The lead still wins when there is one: its category/search_keyword is operator-curated
         and beats a self-typed word. */
      let trade: string | null = (row.services ?? "").trim() || null;
      if (row.lead_id) {
        const { data: lead } = await service
          .from("outreach_leads")
          .select("phone, category, search_keyword, status, amount_paid, search_location")
          .eq("id", row.lead_id).maybeSingle();
        if (lead) {
          const l = lead as Record<string, unknown>;
          paid = paid || Number(l.amount_paid ?? 0) > 0 || PAID_STATUSES.has(String(l.status ?? ""));
          phone = (l.phone as string | null) ?? null;
          trade = ((l.category as string) || (l.search_keyword as string) || "").trim() || trade;
        }
      }
      /* ⛔ RETIRED EXPLICITLY, NOT LEFT TO THE CLAIM. Under the old gate this row simply never came
         back, because being claimed was permanent. The gate is now delivery, so a paid row would be
         re-picked every minute until it burned all three attempts on an email nobody wants. It is
         given a terminal state instead, and the reason is stored rather than inferred: no email was
         sent and none is needed, which is not the same as a failure. */
      if (paid) {
        skippedPaid += 1;
        await finish({
          notify_attempts: MAX_SEND_ATTEMPTS,
          notify_error: "not sent: they paid inside the delay window, so the payment notification covers them",
        });
        continue;
      }

      const name = (row.business_name ?? "").trim() || "A prospect";
      const town = (row.confirmed_location ?? "").trim();
      const mins = Math.max(DELAY_MINUTES, Math.round((Date.now() - new Date(row.created_at).getTime()) / 60_000));
      const line = (k: string, v: string | null) => (v ? `  ${k.padEnd(7)} ${v}\n` : "");

      /* ══ WHY THEY DID NOT PAY ═══════════════════════════════════════════════════════════════
         KEYED OFF THE SUBMITTED ROW, NOT THE CHECKOUT. Someone the gate blocks sees the "this
         wouldn't work for you" screen and never clicks pay, so a notification triggered by the
         checkout refusal would miss nearly all of them — exactly the silent failure this exists to
         prevent. Derived from the same serveGate the checkout refuses with.
         NEVER on an escape-hatch bail-out: its answers are partial, and reporting a half-filled
         questionnaire as a rejection would be wrong about the one thing that matters here. */
      const gate = row.incomplete === true ? null : serveDecision(serveInputFromRow(row as ServeGateRow));
      const verdictLabel = gate?.verdict === "block"
        ? "COULD NOT PAY — we cannot serve them as things stand"
        : gate?.verdict === "flag"
          ? "WORTH A CONVERSATION"
          : null;
      const siteLine = gate ? platformLabel(
        serveInputFromRow(row as ServeGateRow).platform, row.website_platform_other,
      ) : null;
      /* PLAIN ENGLISH, and NEVER a raw enum in an email Paul reads at a glance. An unrecognised
         value falls through to the raw string rather than to blank — a new option added to the flow
         must never render an empty line that looks like "not answered". */
      const GBP_EXISTS_LABEL: Record<string, string> = {
        yes: "Has one, and can get into it",
        not_claimed: "Profile exists but is unclaimed",
        no: "No profile at all",
        not_sure: "Not sure",
      };
      const GBP_STATUS_LABEL: Record<string, string> = {
        done: "Already added us as a manager",
        will_do: "Says they will add us",
        no_access: "CANNOT GET INTO THEIR PROFILE",
      };
      const GBP_VERIFIED_LABEL: Record<string, string> = {
        yes: "Profile is verified",
        pending: "Verification in progress — chase, do not start profile work yet",
        no: "PROFILE IS NOT VERIFIED — nothing on it shows on Maps or Search",
        not_sure: "Does not know if it is verified — check this yourself",
      };
      const PHOTOS_LABEL: Record<string, string> = {
        phone: "Has photos on their phone",
        online: "Has photos on their site or social",
        none: "Has no photos of their work",
      };
      const label = (m: Record<string, string>, v: string | null) => (v ? (m[v] ?? v) : null);
      const gbpExistsLine = label(GBP_EXISTS_LABEL, row.gbp_exists);
      const gbpStatusLine = label(GBP_STATUS_LABEL, row.gbp_status);
      const gbpVerifiedLine = label(GBP_VERIFIED_LABEL, row.gbp_verified);
      const photosLine = label(PHOTOS_LABEL, row.photos_status);
      const mustNotSay = (row.must_not_say ?? "").trim() || null;

      /* ⛔ TWO ANSWERS NEED A REPLY RATHER THAN A READ, and they are pulled out of the list so they
         cannot be skimmed past: someone locked out of their profile cannot start at all, and a
         must-not-say note is the only thing here that can embarrass us in public once published. */
      const needsYou: string[] = [];
      /* ⛔ ONLY "no". "pending" resolves itself and "not_sure" we answer ourselves — neither needs a
         reply, and padding this list is how the two that do get skimmed past. Verification is not
         something you can clear alone: it needs the client to take a postcard or a video call, and
         it takes days, so it belongs in front of you in week one rather than week three. */
      if (row.gbp_verified === "no") needsYou.push("Their Google Business Profile is NOT verified, so nothing on it shows on Maps or Search. Profile work would publish to nobody. Verification needs them (postcard or video call) and takes days — start it before anything else.");
      if (row.gbp_status === "no_access") needsYou.push("They cannot get into their Google Business Profile. They cannot add us, so nothing on the profile can start until this is sorted.");
      if (mustNotSay) needsYou.push(`They told us something we must not say: "${mustNotSay}"`);

      /* ⛔ THE FREE-CHECK TAIL IS A DIFFERENT SENTENCE BECAUSE IT IS A DIFFERENT EVENT. They asked
         for a check and are waiting on it; they have not gone cold, and there is no payment screen
         they stopped at. That distinction is the difference between a queue of work and a list of
         people who lost interest. */
      const tail = isFreeCheck
        ? "They asked for a free AI check on findable.live. They are waiting on a report from you, and nothing has been sent to them automatically. Their lead is in Outreach; add them to the WhatsApp queue when you are ready."
        : gate?.verdict === "block"
        ? "They were blocked before Stripe, so no payment was possible. They saw the honest refusal screen with your email address on it. Some of these are worth a call anyway."
        : "They reached the payment screen and stopped. Nothing has been sent to them automatically.";

      /* ⛔ A FREE CHECK IS NOT A BAILED CHECKOUT AND MUST NOT BE DESCRIBED AS ONE. The old line
         reported every unpaid row as having "filled in the questionnaire N minutes ago and has
         not paid" — false in both halves for a visitor who asked for a free check and was never
         shown a price. The elapsed minutes go too: they measure a delay this row does not have. */
      const opening = isFreeCheck
        ? `${name} just asked for a free AI check.\n\n`
        : `${name} filled in the questionnaire ${mins} minutes ago and has not paid.\n\n`;
      const text =
        opening +
        (verdictLabel ? `  ${verdictLabel}\n  ${gate!.reason}\n\n` : "") +
        line("Trade:", trade) + line("Town:", town) + line("Phone:", phone) + line("Email:", row.contact_email) +
        (gate ? line("Site:", siteLine) : "") +
        line("Profile:", gbpExistsLine) + line("Verified:", gbpVerifiedLine) + line("Added us:", gbpStatusLine) + line("Photos:", photosLine) +
        (mustNotSay ? line("Must not say:", mustNotSay) : "") +
        (needsYou.length ? `\n  NEEDS YOU:\n${needsYou.map((x) => `  - ${x}`).join("\n")}\n` : "") +
        `\n${tail}\n`;
      const html =
        `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.6;color:#1e293b">` +
        `<h2 style="margin:0 0 12px">${
          isFreeCheck
            ? "Free check requested"
            : gate?.verdict === "block"
            ? "Could not be served"
            : "Questionnaire submitted, not paid"
        }</h2>` +
        (isFreeCheck
          ? `<p style="margin:0 0 10px"><strong>${escapeHtml(name)}</strong> just asked for a free AI check.</p>`
          : `<p style="margin:0 0 10px"><strong>${escapeHtml(name)}</strong> filled in the questionnaire ${mins} minutes ago and has not paid.</p>`) +
        (verdictLabel
          ? `<p style="margin:0 0 12px;padding:10px 12px;border-radius:8px;background:${
            gate!.verdict === "block" ? "#fef2f2" : "#fffbeb"
          };color:${gate!.verdict === "block" ? "#991b1b" : "#92400e"}">` +
            `<strong>${escapeHtml(verdictLabel)}</strong><br>${escapeHtml(gate!.reason)}</p>`
          : "") +
        (trade ? `<p style="margin:0 0 2px"><strong>Trade:</strong> ${escapeHtml(trade)}</p>` : "") +
        (town ? `<p style="margin:0 0 2px"><strong>Town:</strong> ${escapeHtml(town)}</p>` : "") +
        (phone ? `<p style="margin:0 0 2px"><strong>Phone:</strong> ${escapeHtml(phone)}</p>` : "") +
        (row.contact_email ? `<p style="margin:0 0 2px"><strong>Email:</strong> ${escapeHtml(row.contact_email)}</p>` : "") +
        (siteLine ? `<p style="margin:0 0 2px"><strong>Site:</strong> ${escapeHtml(siteLine)}</p>` : "") +
        (gbpExistsLine ? `<p style="margin:0 0 2px"><strong>Profile:</strong> ${escapeHtml(gbpExistsLine)}</p>` : "") +
        (gbpVerifiedLine ? `<p style="margin:0 0 2px"><strong>Verified:</strong> ${escapeHtml(gbpVerifiedLine)}</p>` : "") +
        (gbpStatusLine ? `<p style="margin:0 0 2px"><strong>Added us:</strong> ${escapeHtml(gbpStatusLine)}</p>` : "") +
        (photosLine ? `<p style="margin:0 0 2px"><strong>Photos:</strong> ${escapeHtml(photosLine)}</p>` : "") +
        (mustNotSay ? `<p style="margin:0 0 2px"><strong>Must not say:</strong> ${escapeHtml(mustNotSay)}</p>` : "") +
        (needsYou.length
          ? `<div style="margin:12px 0 0;padding:10px 12px;border-radius:8px;background:#fef2f2;color:#991b1b">` +
            `<strong>Needs you</strong><ul style="margin:6px 0 0;padding-left:18px">` +
            needsYou.map((x) => `<li>${escapeHtml(x)}</li>`).join("") + `</ul></div>`
          : "") +
        `<p style="margin:10px 0 0;color:#475569">${escapeHtml(tail)}</p>` +
        `</div>`;

      /* NON-BLOCKING. A Resend outage must never affect anything else, and the row is already
         claimed, so a failure costs exactly one email — it is logged loudly rather than retried,
         because a retry loop against a dead provider is worse than a missed notification. */
      const resendKey = Deno.env.get("RESEND_API_KEY");
      /* ⛔ A MISSING KEY IS RECORDED, NOT SHRUGGED OFF. This branch used to increment a counter and
         `continue` on an already-claimed row, so an unset key would have dropped EVERY submission
         silently and for ever — the worst version of the fault this whole change exists to fix, and
         it needed no outage to happen. It now fails like any other failure: stored, and retried. */
      if (!resendKey) {
        console.error("[notify-onboarding-submit] RESEND_API_KEY not set");
        failed += 1;
        await finish({ notify_error: "RESEND_API_KEY is not set on the function" });
        continue;
      }
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "LeadFinder Pro <noreply@lead-finder-app.com>",
            to: [ADMIN_EMAIL],
            subject: isFreeCheck
              ? `FREE CHECK — ${name}`
              : gate?.verdict === "block"
            ? `Could not be served — ${name}`
            : `Questionnaire submitted, not paid — ${name}`,
            text, html,
          }),
        });
        if (!res.ok) {
          failed += 1;
          /* THE RAW PROVIDER RESPONSE, not a friendly summary. A catch-all error message is worse
             than none — CLAUDE.md §4, from the audit page that explained every failure as "term too
             broad" while the real error sat unread. */
          const body = (await res.text()).slice(0, 400);
          console.error(`[notify-onboarding-submit] resend ${res.status} for ${row.id}: ${body}`);
          await finish({ notify_error: `resend HTTP ${res.status}: ${body}` });
        } else {
          sent += 1;
          console.log(`[notify-onboarding-submit] emailed about ${name} (${row.id})`);
          /* THE ONLY PLACE notify_sent_at IS EVER WRITTEN: the provider accepted it. The error is
             cleared so a row that succeeded on attempt 2 does not keep showing attempt 1's failure. */
          await finish({ notify_sent_at: new Date().toISOString(), notify_error: null });
        }
      } catch (e) {
        failed += 1;
        const msg = (e as Error).message;
        console.error(`[notify-onboarding-submit] send failed for ${row.id} (non-blocking):`, msg);
        await finish({ notify_error: `send threw: ${msg}` });
      }
    }

    /* ⚠️ NO "stuck" COUNT HERE, DELIBERATELY. A count of rows at the ceiling with no delivery reads
       as "N notifications lost", and it is not: deliberately retired rows (paid inside the window,
       and the pre-2026-08-10 backfill) sit in exactly that state on purpose. Telling them apart
       needs the REASON, so the dashboard card lists the rows with their notify_error rather than
       reducing them to a number that would be wrong in both directions. */
    return json({ ok: true, considered: rows.length, sent, skipped_paid: skippedPaid, lost_race: lostRace, failed });
  } catch (e) {
    // Never throw out of a cron target: a 500 loop is noise, and nothing here is load-bearing.
    console.error("[notify-onboarding-submit] error:", e instanceof Error ? e.message : e);
    return json({ ok: false, error: "internal" }, 500);
  }
});
