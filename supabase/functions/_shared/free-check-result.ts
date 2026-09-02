/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE FREE-CHECK RESULT: what a stranger receives, and the four reasons they might not.

   🔴 A STRANGER MUST NEVER RECEIVE A BLANK OR BROKEN AUDIT. That is the whole design constraint and
   every branch here serves it. The order is deliberate: identify the lane, prove the result is
   real, claim the send, and only then send. If any step cannot be proven, NOTHING goes to the
   prospect and the operator is told instead. Silence towards a stranger is always recoverable; a
   broken audit in their inbox is not.

   ⛔ VALIDITY IS PROVEN BY buildReportData, NOT BY THE RUN'S STATUS. A run can finalise "complete"
   and still have nothing worth sending — every question failed, or the answers came back empty.
   buildReportData returns null in exactly that case, and it is the SAME function render-audit-report
   uses to decide it can serve the page at all. So if it returns null the link would 404-in-spirit
   anyway ("this audit hasn't completed yet"), and mailing that link is the failure this guards.

   ⛔ ONE SEND PER AUDIT, CLAIMED BEFORE SENDING. The stamp goes in ai_audit_runs.results (jsonb, no
   migration — the same schema-free mechanism `measurement` and `money_questions` already use) and
   it is written BEFORE the email leaves. A stamp written afterwards means a crash between send and
   stamp re-sends on the next tick, and the queue ticks every 30 seconds. Better to owe someone an
   email than to send them four.

   ⚠️ THE WHATSAPP IS GUARDED, NOT ASSUMED. `free_check_result` was submitted to Meta on
   2026-09-02 and is IN REVIEW. The template is already registered in WA_TEMPLATES and the send
   already reaches Meta, which refuses an unapproved template with its own error — this treats that
   as an EXPECTED pending state: the email still goes and the operator is told the text is waiting
   on approval. THE DAY META APPROVES IT THE SAME CALL SUCCEEDS, with no code change and nothing to
   flip. Registering it only on approval would have been the "one-line flip" version; registering it
   now is the no-change version, which is what was asked for.
   ⚠️ AND A COLD TEXT MUST BE A TEMPLATE. Free-form text is refused outside a 24h customer-service
   window (send-whatsapp-message:267) and a free-check submitter has never messaged us, so there is
   no window and never will be before we write first. Do not "simplify" this to a text send.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { buildReportData, seoStyleForAudit, type QueueRow, type RunRow } from "../../../src/lib/auditReport.ts";
import { isAggregatorUrl } from "./aggregators.ts";
import { onboardingUrl, resolveSiteOrigin } from "./onboarding-followup.ts";
import { resolveWhatsAppEnv, toWhatsAppNumber, claimTemplatePayload, sendViaGraph, WA_TEMPLATES } from "./whatsapp-send.ts";
import { checkSuppressed } from "./suppression.ts";

/** The Meta template carrying the result. 5 vars, in this order:
 *  {{1}} business name · {{2}} trade · {{3}} town · {{4}} audit link · {{5}} onboarding link. */
/** How long to wait for an in-flight run before sending with what completed. Well beyond
 *  MAX_RUN_AGE_MS (12 min) plus a retry, so it only ever releases a genuinely abandoned run. */
export const FREE_CHECK_RESULT_MAX_WAIT_MS = 45 * 60 * 1000;

export const FREE_CHECK_TEMPLATE = "free_check_result";

/** Where the prospect's report is served from. /a/<auditId> is rendered LIVE by
 *  render-audit-report straight off the audit — no stored business_reports row is needed, which is
 *  why the email can go the moment the audit finalises. Same origin the WhatsApp lane already uses. */
const REPORT_ORIGIN = "https://yoursites.uk";

const ADMIN_EMAIL = "paul@move37.fun";

// deno-lint-ignore no-explicit-any
type Client = any;

export type ResultOutcome =
  | { kind: "sent"; emailed: boolean; texted: boolean; textPending: string | null }
  | { kind: "skipped"; reason: string }
  | { kind: "flagged"; reason: string };

/** Tell the operator, and never the prospect. Best-effort: a failed flag must not throw into the
 *  queue's finalisation loop. */
async function flagToOperator(subject: string, lines: string[]): Promise<void> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) { console.error(`[free-check-result] cannot flag (no RESEND_API_KEY): ${subject}`); return; }
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "LeadFinder Pro <noreply@lead-finder-app.com>",
        to: [ADMIN_EMAIL],
        subject,
        html: lines.map((l) => `<p>${l}</p>`).join(""),
      }),
    });
  } catch (e) {
    console.error("[free-check-result] flag email failed:", e instanceof Error ? e.message : String(e));
  }
}

/**
 * Send a free-check prospect their result, if and only if there is a real one.
 *
 * Called from process-ai-audit-queue's finalisation loop for runs that finished COMPLETE and not
 * capped. Never throws.
 */
export async function maybeSendFreeCheckResult(
  service: Client,
  runId: string,
  auditId: string,
): Promise<ResultOutcome> {
  /* 1 — THE LANE. enrichment_source is stamped by createFreeCheckLead and is the only thing that
     makes this audit ours; every other audit in the system must fall straight through. */
  let { data: audit } = await service
    .from("ai_audits")
    .select("id, lead_id, business_name, business_type, location_text, specialism, website, baseline_target_runs, free_check_result")
    .eq("id", auditId).maybeSingle();
  /* ⚠️ free_check_result may not exist yet (SQL pending). PostgREST fails the WHOLE select on an
     unknown column, so retry without it rather than reading "no audit" and never sending. */
  if (!audit) {
    const { data: legacy } = await service
      .from("ai_audits")
      .select("id, lead_id, business_name, business_type, location_text, specialism, website, baseline_target_runs")
      .eq("id", auditId).maybeSingle();
    audit = legacy as typeof audit;
  }
  if (!audit?.lead_id) return { kind: "skipped", reason: "no lead on this audit" };

  const { data: lead } = await service
    .from("outreach_leads")
    .select("id, enrichment_source, contact_email, phone, country, business_name, search_keyword, search_location")
    .eq("id", audit.lead_id).maybeSingle();
  if (!lead) return { kind: "skipped", reason: "lead row missing" };
  if (lead.enrichment_source !== "free_check") return { kind: "skipped", reason: "not a free-check lead" };

  /* == 2 - IS THE MEASUREMENT ACTUALLY FINISHED? ==============================================
     🔴 THIS USED TO BE A PER-RUN STAMP, AND AT THREE RUNS IT WOULD HAVE MESSAGED A STRANGER
     THREE TIMES. process-ai-audit-queue pushes a free-check job on EVERY run finalisation, and the
     guard read `results.free_check_result` on THAT run - so each of the three runs found its own
     slate clean and sent its own email and WhatsApp, ~6 minutes apart, each carrying a partial
     result. The per-run stamp was correct while a free check was one run; the moment
     FREE_CHECK_RUNS went above 1 it became a spam bug. Found before shipping 5x3, not after.

     ⛔ SO: WAIT FOR THE LAST RUN, AND CLAIM ON THE AUDIT. Two separate properties and both are
     needed - waiting alone still double-sends if two runs finalise in one tick, and an audit-level
     stamp alone would send a 1-run result and then correctly refuse the fuller ones. */
  const { data: allRuns } = await service
    .from("ai_audit_runs")
    .select("id, audit_id, run_number, status, mention_rate, results, created_at")
    .eq("audit_id", auditId).order("run_number", { ascending: true });
  const runs = (allRuns ?? []) as Array<
    RunRow & { id: string; status: string; run_number: number | null; created_at: string; results: unknown }
  >;
  const thisRun = runs.find((r) => r.id === runId);
  if (!thisRun) return { kind: "skipped", reason: "run row missing" };

  /* ⛔ SETTLED IS A POSITIVE LIST, and anything unrecognised counts as STILL IN FLIGHT. Measured
     over 847 live runs the statuses are complete / failed / cancelled / capped, plus the transient
     pending / running. Treating an unknown status as settled would send early on exactly the state
     we could not identify; treating it as in-flight means we wait, which is recoverable. */
  const SETTLED = new Set(["complete", "failed", "cancelled", "capped"]);
  const target = Math.max(1, Number(audit.baseline_target_runs ?? 1) || 1);
  const completed = runs.filter((r) => r.status === "complete");
  const inFlight = runs.filter((r) => !SETTLED.has(String(r.status)));

  /* ⚠️ THE STALE RELEASE EXISTS SO ONE STUCK RUN CANNOT SILENCE THE RESULT FOREVER. Waiting on
     in-flight runs is right, but a run wedged in `running` would mean the prospect never hears back
     at all. Set well beyond MAX_RUN_AGE_MS (12 min) and its retry, so it only fires on a genuinely
     abandoned run - the queue's own stall sweep normally settles these first. */
  const oldestInFlightMs = inFlight.length
    ? Math.max(...inFlight.map((r) => Date.now() - new Date(r.created_at).getTime()))
    : 0;
  const stalled = oldestInFlightMs > FREE_CHECK_RESULT_MAX_WAIT_MS;
  if (completed.length < target && inFlight.length > 0 && !stalled) {
    return {
      kind: "skipped",
      reason: `waiting for the measurement to finish (${completed.length} of ${target} runs done)`,
    };
  }
  if (!completed.length) return { kind: "skipped", reason: "no run completed - nothing to send" };

  /* ⛔ REPORT ON THE LAST COMPLETED RUN, not on whichever run happened to trigger this tick. With
     three runs the trigger can be run 2 finalising after run 3, and the email must never describe
     an earlier ask than the best one we hold. */
  const run = completed[completed.length - 1];

  /* THE AUDIT-LEVEL STAMP. Tried on `ai_audits.free_check_result` first; if that column is not there
     yet the claim falls back to the FIRST run's results, which is still exactly one location per
     audit. Column-shed tolerance is the house pattern (findable-onboarding, plan_build) and is what
     lets this deploy before the SQL runs instead of failing every send until it does.
     ⚠️ BOTH LOCATIONS ARE READ before sending, or the upgrade itself would re-send once for every
     audit that had already been claimed on a run. */
  const claimRun = runs.find((r) => (r.run_number ?? 1) === 1) ?? runs[0] ?? thisRun;
  const claimRunResults = (claimRun?.results && typeof claimRun.results === "object"
    ? claimRun.results
    : {}) as Record<string, unknown>;
  const auditStamped = (audit as { free_check_result?: unknown }).free_check_result;
  if (auditStamped || claimRunResults.free_check_result) {
    return { kind: "skipped", reason: "already sent for this audit" };
  }

  /* 3 — IS THERE ACTUALLY A RESULT? The same test render-audit-report applies before serving the
     page. Null means every question failed or nothing was answered. */
  const { data: qrows } = await service
    .from("ai_audit_queue").select("id, question, status, result")
    .eq("run_id", runId).order("created_at", { ascending: true });
  const data = buildReportData((qrows ?? []) as QueueRow[], run as RunRow, {
    businessName: audit.business_name ?? "",
    businessType: audit.business_type ?? "",
    locationText: audit.location_text ?? "",
    specialisms: audit.specialism ?? "",
    isAggregatorUrl,
    ownWebsite: audit.website ?? "",
    /* ⛔ THE LANE DECIDES THIS, NOT THE RUN COUNT. seoStyleForAudit returns 'graded' for anything
       above one run, so turning FREE_CHECK_RUNS up to 3 would silently have flipped every free
       check back to the graded website block that was deliberately split off the hook lane. A free
       check is always the issues list: it is the same document whether it took one ask or three. */
    seoStyle: "issues",
  });
  if (!data) {
    await flagToOperator(
      `FREE CHECK — audit produced nothing for ${audit.business_name ?? "(unnamed)"}`,
      [
        `The audit finalised but buildReportData returned null, so <b>nothing was sent to the prospect</b>.`,
        `Audit <code>${auditId}</code>, run <code>${runId}</code>.`,
        `Lead <code>${lead.id}</code>${lead.contact_email ? `, they gave ${lead.contact_email}` : ""}.`,
        `Every question probably failed. Their report link would have shown "hasn't completed yet".`,
      ],
    );
    return { kind: "flagged", reason: "buildReportData returned null — nothing sent" };
  }

  const email = (lead.contact_email ?? "").trim();
  if (!email) {
    await flagToOperator(
      `FREE CHECK — no email to send to for ${audit.business_name ?? "(unnamed)"}`,
      [`The audit is good but the lead has no contact_email, so nothing could be sent.`,
       `Audit <code>${auditId}</code>, lead <code>${lead.id}</code>.`],
    );
    return { kind: "flagged", reason: "no contact email on the lead" };
  }

  /* Claim it now. A stamp written AFTER the send re-sends on the next 30-second tick if anything in
     between crashes, so the claim goes first: a crash then costs a missing email rather than a
     duplicate one, the same trade-off every send in this project makes.
     ⛔ ON THE AUDIT, so it is one claim per measurement however many runs it has. */
  const stamp = {
    at: new Date().toISOString(),
    email,
    template: FREE_CHECK_TEMPLATE,
    runs_completed: completed.length,
    runs_target: target,
  };
  let claimErr: { message?: string } | null = null;
  ({ error: claimErr } = await service
    .from("ai_audits").update({ free_check_result: stamp }).eq("id", auditId));
  if (claimErr && /free_check_result/i.test(claimErr.message ?? "")) {
    /* The column is not there yet. Fall back to run 1's results - still ONE location per audit, so
       the send-once property holds; the read above already checks both places. */
    console.warn("[free-check-result] ai_audits.free_check_result missing - claiming on run 1");
    ({ error: claimErr } = await service
      .from("ai_audit_runs")
      .update({ results: { ...claimRunResults, free_check_result: stamp } })
      .eq("id", claimRun.id));
  }
  if (claimErr) return { kind: "skipped", reason: `could not claim the send: ${claimErr.message}` };

  /* 4 — THE LINKS. The onboarding link MUST carry ?lead= — offerPriceForLead returns the FULL £99
     for `no_lead`, so a bare /onboarding/ URL would quietly charge this prospect the standard price
     instead of the founder price. onboardingUrl builds the only correct shape. */
  const reportLink = `${REPORT_ORIGIN}/a/${auditId}`;
  const origin = resolveSiteOrigin();
  const onboardLink = origin ? onboardingUrl(origin, lead.id, audit.business_name ?? null) : null;
  if (!onboardLink) {
    await flagToOperator(
      `FREE CHECK — FINDABLE_SITE_ORIGIN is not set`,
      [`Could not build the onboarding link for lead <code>${lead.id}</code>, so the result email was NOT sent.`,
       `Set FINDABLE_SITE_ORIGIN (or FINDABLE_ALLOWED_ORIGINS) on the function and re-run.`],
    );
    return { kind: "flagged", reason: "no site origin — cannot build the founder-price link" };
  }

  /* ⛔ NO `?? lead.search_keyword` HERE EITHER. That fallback is the other half of the 2026-09-02
     bug: on a matched lead it reaches the old prospecting trade, which is the literal string
     ("Locksmiths") a real prospect was emailed. audit.business_type IS the submitted trade now -
     fireFreeCheckAudit is handed it - and if it were somehow blank the sentence says "business"
     rather than naming a trade nobody claimed. */
  const trade = (audit.business_type ?? "").trim();
  const town = (audit.location_text ?? lead.search_location ?? "").trim();
  const name = (audit.business_name ?? lead.business_name ?? "your business").trim();

  /* 5 — EMAIL. Plain, short, and it states what was measured rather than selling. */
  let emailed = false;
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.error("[free-check-result] RESEND_API_KEY not set — cannot email the prospect");
  } else {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Findable <noreply@lead-finder-app.com>",
          to: [email],
          subject: `Your AI visibility check — ${name}`,
          html: [
            `<p>Hi,</p>`,
            `<p>We asked ChatGPT and Gemini the questions your customers ask when they're looking for a ${trade || "business"}${town ? ` in ${town}` : ""}, and recorded who came up.</p>`,
            `<p><a href="${reportLink}">Read your report</a></p>`,
            `<p>It shows how often ${name} was named, who was named instead, and what we would change.</p>`,
            `<p>If you want us to do the work, this link is set up for you: <a href="${onboardLink}">get started</a>.</p>`,
            `<p>Paul, findable</p>`,
          ].join(""),
        }),
      });
      emailed = res.ok;
      if (!res.ok) console.error(`[free-check-result] resend HTTP ${res.status} for ${email}`);
    } catch (e) {
      console.error("[free-check-result] email failed:", e instanceof Error ? e.message : String(e));
    }
  }

  /* 6 — WHATSAPP, GUARDED, AND IT SENDS ITSELF RATHER THAN VIA send-whatsapp-message.
     ⛔ WHY NOT REUSE THAT FUNCTION: it resolves a template's variables SERVER-SIDE from the lead's
     own data (trade and competitors off the lead's completed audit, the claim link off
     generated_sites). free_check_result's five values are all things THIS module has already
     computed, so routing through it would mean teaching the live send function a new resolution
     branch — more code, in the one function that actually sends WhatsApp, for no gain.
     ⚠️ SO THIS MODULE OWES WHAT THAT FUNCTION PROVIDES, and both are done below: the
     whatsapp_messages + whatsapp_sends rows (without them the send is invisible to the Inbox and to
     every count — CLAUDE.md: counts come from whatsapp_messages, never from lead status), and the
     suppression check, which lives in the QUEUES rather than in the send path.
     ⛔ SUPPRESSION IS CHECKED EVEN THOUGH THEY JUST ASKED US FOR THIS. Filling the form is consent
     for this reply; it is NOT consent that overrides an earlier "do not contact me" from another
     campaign. One no is forever, and this is the one path that messages someone we have never
     spoken to. */
  let texted = false;
  let textPending: string | null = null;
  const phone = (lead.phone ?? "").trim();
  const wa = resolveWhatsAppEnv();
  const to = phone ? toWhatsAppNumber(phone, lead.country ?? null) : null;
  if (!phone) {
    textPending = "no phone on the lead";
  } else if (!to) {
    textPending = `phone not sendable as WhatsApp: ${phone}`;
  } else if (!WA_TEMPLATES[FREE_CHECK_TEMPLATE]) {
    textPending = `${FREE_CHECK_TEMPLATE} is not registered in WA_TEMPLATES`;
  } else if (!wa.live) {
    textPending = "WhatsApp is in test mode or unconfigured";
  } else {
    try {
      const supp = await checkSuppressed(service, { leadId: lead.id, phone, email });
      if (supp.suppressed) {
        textPending = `suppressed (${supp.reason ?? "no reason recorded"}) — not messaged`;
      } else {
        const payload = claimTemplatePayload(FREE_CHECK_TEMPLATE, WA_TEMPLATES[FREE_CHECK_TEMPLATE].lang, name, "", {
          trade, town, auditUrl: reportLink, onboardingUrl: onboardLink,
        });
        const sent = await sendViaGraph(wa.accessToken, wa.phoneNumberId, to, payload);
        if (sent.ok) {
          texted = true;
          /* THE THREAD AND THE AUDIT ROW. Written only on a real send, and never allowed to fail the
             outcome: the message HAS gone, so throwing here would misreport it as unsent. */
          try {
            await service.from("whatsapp_messages").insert({
              lead_id: lead.id, user_id: lead.user_id ?? null, direction: "outbound", phone: to,
              body: `Your AI visibility check for ${name}: ${reportLink}`,
              message_type: "template", template_name: FREE_CHECK_TEMPLATE,
              status: "sent", wa_message_id: sent.messageId,
            });
            await service.from("whatsapp_sends").insert({
              lead_id: lead.id, user_id: lead.user_id ?? null, template_name: FREE_CHECK_TEMPLATE, phone: to,
            });
          } catch (e) {
            console.error("[free-check-result] send logged badly:", e instanceof Error ? e.message : String(e));
          }
        } else {
          /* THE EXPECTED STATE UNTIL META APPROVES IT. Meta refuses an unapproved template with its
             own error; that is a pending state, not a bug, and it is reported either way. */
          textPending = `Meta refused: ${sent.error ?? "no reason given"}${sent.failCode ? ` (#${sent.failCode})` : ""}`;
        }
      }
    } catch (e) {
      textPending = `send threw: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  if (!emailed) {
    await flagToOperator(
      `FREE CHECK — result email FAILED for ${name}`,
      [`The audit was good but the email did not send, so the prospect has nothing.`,
       `Audit <code>${auditId}</code>, lead <code>${lead.id}</code>, address ${email}.`,
       `The send is stamped, so it will NOT retry automatically — send it by hand: ${reportLink}`],
    );
  } else if (textPending) {
    await flagToOperator(
      `FREE CHECK — emailed ${name}, text not sent`,
      [`The result email went to ${email}. The WhatsApp did not: <b>${textPending}</b>.`,
       `Nothing is broken — the email is the channel that matters today. This is the flag you asked`,
       `for so the text is never silently dropped.`,
       `Audit <code>${auditId}</code>, lead <code>${lead.id}</code>.`],
    );
  }

  console.log(`[free-check-result] audit ${auditId}: emailed=${emailed} texted=${texted}${textPending ? ` pending=${textPending}` : ""}`);
  return { kind: "sent", emailed, texted, textPending };
}
