/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SEND THE FOUR-WEEK RESULTS — claim first, send, stamp (2026-09-13). Same pattern as
   free-check-result.ts, for the document that starts the 14-day refund clock.

   Called from process-ai-audit-queue's finalisation loop for every run that finished COMPLETE. It
   does its own lane check: the audit must be a day-28 replay (purpose `remeasure`) that the lead's
   own pointer names (`outreach_leads.remeasure_audit_id`), with every run settled. Everything else
   falls straight through as `skipped`.

   ⛔ THE STAMP IS `outreach_leads.remeasure_results_sent_at`, WRITTEN ONCE, BY A CONDITIONAL UPDATE
   (`.is(null).select()`): only the tick that wins may send, so two overlapping ticks cannot email
   twice. It is the start of the client's 14-day window; the close is derived on read
   (remeasureResults.ts) and never stored. A send that Resend refuses CLEARS the stamp again and
   flags the operator — a failed email must not start a clock the client cannot see.

   ⛔ IT DOES NOT SEND WHEN THE NUMBER CANNOT BE PROVEN, OR THE COPY IS NOT APPROVED. Both route to a
   TASK: a `client_error_reports` row (`remeasure_results_held`, once per lead per hour) that the
   Deliver card reads as "results held — needs you", plus an operator email. Reasons are the
   product's own: replay gave up, no shared question, a matched question thinner than
   MIN_CELLS_FOR_QUESTION_CLAIM on either side (remeasureResultsDecision).

   The recipient is the onboarding contact_email (newest paid row first), else the lead's email.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { compareMeasurements, type MeasurementComparison } from "../../../src/lib/measurementCompare.ts";
import type { QueueRowLite } from "../../../src/lib/baselineView.ts";
import {
  remeasureResultsDecision, numberWentUp, resultsEmailSubject, resultsEmailParagraphs, REMEASURE_CLAIM_WINDOW_DAYS,
  currentTermsVerdict, type CurrentTermsVerdict,
} from "../../../src/lib/remeasureResults.ts";
import { REPORT_PUBLIC_ORIGIN } from "../../../src/lib/findableOffer.ts";
import { reportOnceAnHour } from "./audit-baseline.ts";
import { createDelayedSubscription } from "./delayed-subscription.ts";
import { monthlyStartIso } from "../../../src/lib/remeasureResults.ts";

// deno-lint-ignore no-explicit-any
type Client = any;

const ADMIN_EMAIL = "paul@move37.fun";
/* The client-facing sender, the same address the free-check result uses (verified on this Resend
   account); the operator alert address for holds. */
const FROM_CLIENT = "Findable <reports@findable.live>";
const FROM_OPERATOR = "Findable alerts <alerts@findable.live>";

/** findable.live/results/<remeasureAuditId> — the Pages Function proxy in findable-site
 *  (functions/results/[id].ts). Never the raw function URL: the gateway serves it as text/plain. */
export const resultsPublicUrl = (remeasureAuditId: string) => `${REPORT_PUBLIC_ORIGIN}/results/${remeasureAuditId}`;

export interface RemeasureBundle {
  audit: { id: string; lead_id: string | null; business_name: string | null; website: string | null; location_text: string | null; audit_purpose: string | null; baseline_target_runs: number | null; baseline_completed_at: string | null; created_at: string };
  lead: { id: string; business_name: string | null; email: string | null; website: string | null; baseline_audit_id: string | null; remeasure_audit_id: string | null; remeasure_results_sent_at: string | null; search_location: string | null; derived_town: string | null; amount_paid: number | string | null; remeasure_due_date: string | null; stripe_customer_id: string | null; stripe_subscription_id: string | null };
  baselineRuns: Array<{ id: string; status: string | null; created_at: string }>;
  replayRuns: Array<{ id: string; status: string | null; created_at: string }>;
  comparison: MeasurementComparison;
  town: string | null;
  /** Whether this client is provably on the terms this document describes. */
  terms: CurrentTermsVerdict;
}

/** Load everything the sender and the public renderer need. Null (with a reason) when this audit is
 *  not a pointed-at replay. Shared so the email and the page cannot compute different numbers. */
export async function loadRemeasureBundle(service: Client, remeasureAuditId: string): Promise<{ bundle: RemeasureBundle | null; reason: string | null }> {
  const { data: a } = await service.from("ai_audits")
    .select("id, lead_id, business_name, website, location_text, audit_purpose, baseline_target_runs, baseline_completed_at, created_at")
    .eq("id", remeasureAuditId).maybeSingle();
  const audit = a as RemeasureBundle["audit"] | null;
  if (!audit) return { bundle: null, reason: "no such audit" };
  if (String(audit.audit_purpose ?? "").toLowerCase() !== "remeasure") return { bundle: null, reason: `audit_purpose is '${audit.audit_purpose ?? "null"}', not remeasure` };
  if (!audit.lead_id) return { bundle: null, reason: "replay has no lead" };
  const { data: l } = await service.from("outreach_leads")
    .select("id, business_name, email, website, baseline_audit_id, remeasure_audit_id, remeasure_results_sent_at, search_location, derived_town, amount_paid, remeasure_due_date, stripe_customer_id, stripe_subscription_id")
    .eq("id", audit.lead_id).maybeSingle();
  const lead = l as RemeasureBundle["lead"] | null;
  if (!lead) return { bundle: null, reason: "lead not found" };
  if (lead.remeasure_audit_id !== audit.id) return { bundle: null, reason: "the lead's remeasure pointer names a different audit" };
  if (!lead.baseline_audit_id) return { bundle: null, reason: "the lead has no baseline pointer" };

  /* ⛔ THE TERMS COME FROM THE BASELINE AUDIT, NEVER THE REPLAY. The contract is written once, when
     the baseline is created; the replay carries none. Read here so the sender and the public page
     cannot disagree about whether this client is on today's offer. */
  const { data: bl } = await service.from("ai_audits")
    .select("baseline_contract, baseline_completed_at")
    .eq("id", lead.baseline_audit_id).maybeSingle();
  const terms = currentTermsVerdict({
    contract: (bl as { baseline_contract?: unknown } | null)?.baseline_contract ?? null,
    amountPaid: lead.amount_paid,
    baselineFrozenAt: (bl as { baseline_completed_at?: string | null } | null)?.baseline_completed_at ?? null,
    remeasureDueDate: lead.remeasure_due_date,
  });

  const runsOf = async (auditId: string) => ((await service.from("ai_audit_runs").select("id, status, created_at").eq("audit_id", auditId).order("run_number", { ascending: true })).data ?? []) as Array<{ id: string; status: string | null; created_at: string }>;
  const rowsOf = async (auditId: string) => ((await service.from("ai_audit_queue").select("run_id, question, engines, status, result").eq("audit_id", auditId).order("id", { ascending: true })).data ?? []) as QueueRowLite[];
  const [baselineRuns, replayRuns, baselineRows, replayRows] = await Promise.all([
    runsOf(lead.baseline_audit_id), runsOf(audit.id), rowsOf(lead.baseline_audit_id), rowsOf(audit.id),
  ]);
  const businessName = (audit.business_name ?? lead.business_name ?? "").trim();
  const comparison = compareMeasurements(baselineRows, replayRows, { businessName, ownWebsite: audit.website ?? lead.website ?? "" });
  const town = (audit.location_text ?? lead.derived_town ?? lead.search_location ?? "").trim() || null;
  return { bundle: { audit, lead, baselineRuns, replayRuns, comparison, town, terms }, reason: null };
}

/** Did this client tick "build my site"? The onboarding row is the record of what they bought, and
 *  the tick decides whether hosting joins the monthly. Absent or unreadable reads as NOT ticked:
 *  billing someone for hosting they did not ask for is the failure that cannot be undone. */
/** "11 October 2026" — what a person reads. UTC so a late-evening stamp cannot print yesterday. */
function prettyDate(iso: string | null): string | null {
  if (!iso) return null;
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? null : t.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** The tier and legacy hosting the client bought, from their onboarding row. `plan_tier` decides the
 *  billing shape (keep vs new_site); a null tier is a LEGACY row, billed the old way with hosting if
 *  the old website tick was set. Fails safe to the keep-flow default (no tier, no hosting) — the
 *  direction that undercharges rather than over. */
async function planFor(service: Client, leadId: string): Promise<{ tier: "keep" | "new_site" | null; wantsHostingLegacy: boolean }> {
  try {
    const { data } = await service.from("onboarding_responses")
      .select("plan_tier, website_addon, status, created_at").eq("lead_id", leadId)
      .order("created_at", { ascending: false }).limit(10);
    const rows = (data ?? []) as Array<{ plan_tier?: unknown; website_addon?: unknown; status?: string | null }>;
    const paid = rows.find((r) => ["paid", "payment_received", "in_delivery", "completed"].includes(String(r.status ?? "")));
    const row = paid ?? rows[0];
    const rawTier = String(row?.plan_tier ?? "");
    const tier = rawTier === "new_site" ? "new_site" : rawTier === "keep" ? "keep" : null;
    return { tier, wantsHostingLegacy: row?.website_addon === true };
  } catch { return { tier: null, wantsHostingLegacy: false }; }
}

async function emailOperator(subject: string, lines: string[]): Promise<void> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) { console.error(`[remeasure-results] cannot flag (no RESEND_API_KEY): ${subject}`); return; }
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_OPERATOR, to: [ADMIN_EMAIL], subject, html: lines.map((l) => `<p>${l}</p>`).join("") }),
    });
  } catch (e) { console.error("[remeasure-results] flag email failed:", e instanceof Error ? e.message : String(e)); }
}

export type RemeasureSendOutcome =
  | { kind: "sent"; to: string; providerMessageId: string | null }
  | { kind: "held"; reason: string }
  | { kind: "skipped"; reason: string };

export async function maybeSendRemeasureResults(service: Client, auditId: string): Promise<RemeasureSendOutcome> {
  const { bundle, reason } = await loadRemeasureBundle(service, auditId);
  if (!bundle) return { kind: "skipped", reason: reason ?? "not a pointed-at replay" };
  const { audit, lead, replayRuns, comparison, town } = bundle;
  if (lead.remeasure_results_sent_at) return { kind: "skipped", reason: `already sent ${lead.remeasure_results_sent_at}` };
  /* All runs settled? A run still pending/running means the next tick will look again. */
  const unsettled = replayRuns.filter((r) => r.status === "pending" || r.status === "running").length;
  if (unsettled > 0) return { kind: "skipped", reason: `${unsettled} replay run(s) still in flight` };

  const decision = remeasureResultsDecision({ replayRuns, replayTarget: audit.baseline_target_runs, comparison, terms: bundle.terms });
  const businessName = (audit.business_name ?? lead.business_name ?? "your business").trim();
  if (!decision.send) {
    await reportOnceAnHour(service, "remeasure_results_held", lead.id, decision.reason, { remeasure_audit_id: audit.id, kind: decision.kind, matched: comparison.matchedCount, before: comparison.before, after: comparison.after, movement: comparison.movement });
    /* A terms refusal gets its OWN subject. It is not a transient hold that clears itself next
       tick: it means this client is not on the offer the document describes, and only Paul can
       answer it. Filed under the same subject as a thin question, it would be skimmed past. */
    const subject = decision.kind === "terms_differ"
      ? `FOUR-WEEK RESULTS — SEND BY HAND — ${businessName}`
      : `FOUR-WEEK RESULTS HELD — ${businessName}`;
    await emailOperator(subject, [
      `The day-28 replay for <b>${businessName}</b> has finished but the results were NOT sent.`,
      `Reason: ${decision.reason}.`,
      `Pooled: ${comparison.before.named} of ${comparison.before.answered} before → ${comparison.after.named} of ${comparison.after.answered} after (${comparison.movement}).`,
      `Open the client on the Dashboard to decide what to do. Nothing has gone to the client.`,
    ]);
    return { kind: "held", reason: decision.reason };
  }

  /* THE ADDRESS, before the claim: no address means a hold, not a stamp with no email behind it. */
  let to: string | null = null;
  const { data: obRows } = await service.from("onboarding_responses")
    .select("contact_email, status, created_at").eq("lead_id", lead.id).not("contact_email", "is", null)
    .order("created_at", { ascending: false }).limit(10);
  const rows = (obRows ?? []) as Array<{ contact_email: string | null; status: string | null }>;
  const paidRow = rows.find((r) => ["paid", "payment_received", "in_delivery", "completed"].includes(String(r.status ?? "")));
  to = ((paidRow ?? rows[0])?.contact_email ?? "").trim().toLowerCase() || ((lead.email ?? "").trim().toLowerCase() || null);
  if (!to || !to.includes("@")) {
    await reportOnceAnHour(service, "remeasure_results_held", lead.id, "no contact email on the onboarding rows or the lead", { remeasure_audit_id: audit.id, kind: "no_address" });
    await emailOperator(`FOUR-WEEK RESULTS HELD — ${businessName}`, [`No contact email for <b>${businessName}</b> (lead ${lead.id}). The results were NOT sent.`]);
    return { kind: "held", reason: "no contact email" };
  }

  /* CLAIM FIRST. The conditional update is the once-only guarantee. A missing column (the SQL not
     yet run) surfaces here as a hold, never as a send with no stamp. */
  const nowIso = new Date().toISOString();
  const { data: claimed, error: claimErr } = await service.from("outreach_leads")
    .update({ remeasure_results_sent_at: nowIso })
    .eq("id", lead.id).is("remeasure_results_sent_at", null).select("id");
  if (claimErr) {
    await reportOnceAnHour(service, "remeasure_results_held", lead.id, `could not claim the send: ${claimErr.message}`, { remeasure_audit_id: audit.id, kind: "claim_failed" });
    await emailOperator(`FOUR-WEEK RESULTS HELD — ${businessName}`, [`Could not claim the send for <b>${businessName}</b>: ${claimErr.message}. If this says the column is missing, run the remeasure_results_sent_at SQL.`]);
    return { kind: "held", reason: `claim failed: ${claimErr.message}` };
  }
  if (!Array.isArray(claimed) || claimed.length === 0) return { kind: "skipped", reason: "another tick claimed the send" };

  const copy = {
    businessName, town,
    beforeNamed: comparison.before.named, beforeAnswered: comparison.before.answered,
    afterNamed: comparison.after.named, afterAnswered: comparison.after.answered,
    questions: comparison.matchedCount, wentUp: numberWentUp(comparison), withinNoise: comparison.withinNoise,
    documentUrl: resultsPublicUrl(audit.id),
    /* The date the monthly starts, named in the email BEFORE the subscription is created below.
       Derived from the same stamp and the same function, so the email cannot promise one date and
       Stripe bill on another. A client with no retained card gets no line (see the builder). */
    monthlyStartsOn: lead.stripe_customer_id && !lead.stripe_subscription_id ? prettyDate(monthlyStartIso(nowIso)) : null,
  };
  const paragraphs = resultsEmailParagraphs(copy);
  const key = Deno.env.get("RESEND_API_KEY");
  let providerMessageId: string | null = null;
  let error: string | null = key ? null : "RESEND_API_KEY not set";
  if (key) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: FROM_CLIENT, to: [to], reply_to: ADMIN_EMAIL,
          subject: resultsEmailSubject(copy),
          text: paragraphs.join("\n\n"),
          html: paragraphs.map((p) => `<p>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/(https?:\/\/\S+)/g, '<a href="$1">$1</a>')}</p>`).join(""),
        }),
      });
      const body = await res.text().catch(() => "");
      if (!res.ok) error = `resend HTTP ${res.status}: ${body.slice(0, 300)}`;
      else { try { providerMessageId = (JSON.parse(body) as { id?: string }).id ?? null; } catch { /* id stays null */ } }
    } catch (e) { error = e instanceof Error ? e.message : String(e); }
  }

  /* The outcome lives on the replay audit's first run results (jsonb, no migration), like the
     free-check stamp: what was sent, to whom, when, the provider id, and the window close. */
  const stamp = { at: nowIso, to, provider_message_id: providerMessageId, error, window_days: REMEASURE_CLAIM_WINDOW_DAYS, went_up: copy.wentUp, within_noise: copy.withinNoise, before: comparison.before, after: comparison.after };
  const firstRun = replayRuns[0];
  if (firstRun) {
    const { data: rr } = await service.from("ai_audit_runs").select("results").eq("id", firstRun.id).maybeSingle();
    const cur = (rr as { results?: Record<string, unknown> } | null)?.results ?? {};
    await service.from("ai_audit_runs").update({ results: { ...cur, remeasure_results: stamp } }).eq("id", firstRun.id);
  }
  if (error) {
    /* A refused send must not start the clock. Clear the stamp and hand it to the operator. */
    await service.from("outreach_leads").update({ remeasure_results_sent_at: null }).eq("id", lead.id).eq("remeasure_results_sent_at", nowIso);
    await reportOnceAnHour(service, "remeasure_results_held", lead.id, `email failed: ${error}`, { remeasure_audit_id: audit.id, kind: "email_failed", to });
    await emailOperator(`FOUR-WEEK RESULTS HELD — ${businessName}`, [`Resend refused the results email to ${to}: ${error}. The stamp was cleared; nothing has gone to the client.`]);
    return { kind: "held", reason: `email failed: ${error}` };
  }
  /* ══ AND ONLY NOW DOES A SUBSCRIPTION EXIST ═══════════════════════════════════════════════════
     ⛔ THIS LINE IS THE ANSWER TO "what if results never send". Everything above can hold, clear the
     stamp and return — a replay that gave up, a thin question, a client on legacy terms, no address,
     a Resend refusal. Every one of those paths returns BEFORE this point, so no subscription is
     created and the client is never billed. There is no state from which billing can start without
     a results email having provably gone out, because the call site is downstream of the send.
     ⛔ NON-FATAL, ALWAYS. The client is reading their results; a Stripe problem must not un-send
     them. A failure flags Paul and leaves the client unbilled. */
  const sub = await createDelayedSubscription(service, lead, nowIso, await planFor(service, lead.id));
  if (sub.kind === "failed") {
    await reportOnceAnHour(service, "delayed_subscription_failed", lead.id, sub.reason, { remeasure_audit_id: audit.id, sent_at: nowIso });
    await emailOperator(`MONTHLY NOT STARTED — ${businessName}`, [
      `The four-week results for <b>${businessName}</b> WERE sent, and the client has them.`,
      `Their monthly subscription could NOT be created: ${sub.reason}.`,
      `Nothing is wrong from the client's side — they simply will not be billed until you set it up by hand.`,
    ]);
  }

  await service.from("client_error_reports").insert({ error_id: "remeasure_results_sent", context: { lead_id: lead.id, remeasure_audit_id: audit.id, to, provider_message_id: providerMessageId, at: nowIso, went_up: copy.wentUp, subscription: sub } });
  return { kind: "sent", to, providerMessageId };
}
