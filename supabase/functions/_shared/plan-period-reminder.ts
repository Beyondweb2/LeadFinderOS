// _shared/plan-period-reminder.ts — the v6 clause 9A.5 reminder on the server (2026-10-29).
//
// The rules (who, when, the words) are src/lib/planPeriodReminder.ts. This file only reads the facts, asks those, and
// (in run / drill) claims → sends → records. The same shape as _shared/month12-reminder.ts (the v5 reminder).
//
// ⛔ ONCE PER CLIENT, EVER: the plan_period_reminders row (primary key lead_id) is CLAIMED before the send — two runs at
//    once cannot both send. A failed send stays 'failed' and is never retried blind: Paul is emailed and decides.
// ⛔ KILL SWITCH: plan_period_reminder_settings.enabled. Off = 'run' sends nothing (the cron invoker does not even post).
// ⛔ DRY RUN writes NOTHING. ⛔ QA: the scheduled run never reaches a QA lead; only the drill does, and qaEmailHold
//    allows only the QA sink address.
import { loadTimelineFacts, appendTermsEvent, sendAccessDateEmail } from "./client-terms.ts";
import { loadQaExclusions, qaEmailHold } from "./qa-guard.ts";
import { sendOperatorAlert } from "./operator-alert.ts";
import { isQaLead } from "../../../src/lib/qaSafety.ts";
import { addDays, ukDay } from "../../../src/lib/clientTimeline.ts";
import { isPaymentPlan } from "../../../src/lib/paymentPlans.ts";
import {
  PLAN_PERIOD_DRY_RUN_HORIZON_DAYS, PLAN_PERIOD_SKIP_WORDS, planPeriodReminderEmail, planPeriodReminderVerdict, type PlanPeriodVerdict,
} from "../../../src/lib/planPeriodReminder.ts";

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Service = any;

export interface ClientFacts {
  leadId: string;
  businessName: string;
  isQa: boolean;
  acceptanceId: string | null;
  input: Parameters<typeof planPeriodReminderVerdict>[0];
}

async function loadClient(service: Service, leadId: string, recorded: Set<string>, ex: Awaited<ReturnType<typeof loadQaExclusions>>): Promise<ClientFacts | null> {
  const loaded = await loadTimelineFacts(service, leadId);
  if (!loaded) return null;
  const accId = loaded.terms.agreement_acceptance_id;
  let agreedText: string | null = null; let email: string | null = null; let plan: unknown = null;
  if (accId) {
    const { data, error } = await service.from("client_agreement_acceptances").select("agreed_text,email,payment_plan").eq("id", accId).maybeSingle();
    if (error) throw error;
    agreedText = (data?.agreed_text as string | null) ?? null;
    email = (data?.email as string | null) ?? null;
    plan = data?.payment_plan ?? null;
  }
  const { data: lead, error: lErr } = await service.from("outreach_leads").select("id,phone,assigned_to_user_id,subscription_status,site_first_live_at").eq("id", leadId).maybeSingle();
  if (lErr) throw lErr;
  return {
    leadId,
    businessName: String(loaded.lead.business_name ?? "").trim() || "your business",
    isQa: lead ? isQaLead(ex, lead as { id: string; phone: string | null; assigned_to_user_id: string | null }) : false,
    acceptanceId: accId,
    input: {
      facts: loaded.facts, plan: isPaymentPlan(plan) ? plan : null, agreedText, notifyEmail: email,
      subscriptionStatus: (lead?.subscription_status as string | null) ?? null,
      siteFirstLiveAt: (lead?.site_first_live_at as string | null) ?? null,
      alreadyRecorded: recorded.has(leadId),
    },
  };
}

async function recordedLeads(service: Service): Promise<Set<string>> {
  const { data, error } = await service.from("plan_period_reminders").select("lead_id").limit(5000);
  if (error) throw error;
  return new Set(((data ?? []) as { lead_id: string }[]).map((r) => r.lead_id));
}

async function termsLeadIds(service: Service): Promise<string[]> {
  const { data, error } = await service.from("client_service_terms").select("lead_id").order("lead_id").limit(1000);
  if (error) throw error;
  return ((data ?? []) as { lead_id: string }[]).map((r) => r.lead_id);
}

export async function remindersEnabled(service: Service): Promise<boolean> {
  const { data, error } = await service.from("plan_period_reminder_settings").select("enabled").eq("id", true).maybeSingle();
  if (error) throw error;
  return data?.enabled === true;
}

/* ── DRY RUN ─────────────────────────────────────────────────────────────────────────────────── */
export interface DryRunRow {
  lead_id: string; business_name: string; is_qa: boolean; plan: string | null; period_end_day: string | null;
  send_on: string | null; would_send: boolean; reason: string | null; to_masked: string | null;
}
const mask = (e: string | null) => {
  const s = String(e ?? "").trim(); const at = s.indexOf("@");
  return at > 1 ? `${s[0]}***${s.slice(at)}` : s ? "***" : null;
};

/** Who would be reminded on any day from today to today + horizon. Reads only. */
export async function dryRun(service: Service, todayIso: string, horizonDays = PLAN_PERIOD_DRY_RUN_HORIZON_DAYS): Promise<{ today: string; horizon_days: number; enabled: boolean; clients: number; would_send: DryRunRow[]; real_clients_would_send: number; skipped: DryRunRow[] }> {
  const today = ukDay(todayIso)!;
  const end = addDays(today, horizonDays);
  const recorded = await recordedLeads(service);
  const ex = await loadQaExclusions(service);
  const ids = await termsLeadIds(service);
  const would: DryRunRow[] = []; const skipped: DryRunRow[] = [];
  for (const id of ids) {
    const c = await loadClient(service, id, recorded, ex);
    if (!c) continue;
    const v0 = planPeriodReminderVerdict(c.input, today);
    let sendOn: string | null = null; let v: PlanPeriodVerdict = v0;
    if (v0.send) sendOn = today;
    else if (v0.reason === "too_early" && v0.end && v0.end.reminderFromDay <= end) {
      const vd = planPeriodReminderVerdict(c.input, v0.end.reminderFromDay);
      v = vd; if (vd.send) sendOn = v0.end.reminderFromDay;
    }
    const row: DryRunRow = {
      lead_id: id, business_name: c.businessName, is_qa: c.isQa, plan: c.input.plan,
      period_end_day: v.end?.endDay ?? null, send_on: sendOn, would_send: !!sendOn,
      reason: v.send ? null : PLAN_PERIOD_SKIP_WORDS[v.reason], to_masked: mask(c.input.notifyEmail),
    };
    (sendOn ? would : skipped).push(row);
  }
  return { today, horizon_days: horizonDays, enabled: await remindersEnabled(service), clients: ids.length, would_send: would, real_clients_would_send: would.filter((r) => !r.is_qa).length, skipped };
}

/* ── RUN / DRILL ─────────────────────────────────────────────────────────────────────────────── */
export interface SendOutcome { lead_id: string; outcome: "sent" | "simulated" | "failed" | "skipped" | "refused"; reason?: string }

async function sendOne(service: Service, c: ClientFacts, v: Extract<PlanPeriodVerdict, { send: true }>, opts: { simulate: boolean; triggeredBy: string }): Promise<SendOutcome> {
  // QA safety: a QA lead's email may only go to the sink. Throws on a failed read → nothing sent.
  const hold = await qaEmailHold(service, c.leadId, v.to);
  if (hold) return { lead_id: c.leadId, outcome: "refused", reason: hold };
  const { data: claimed, error: cErr } = await service.from("plan_period_reminders").insert({
    lead_id: c.leadId, agreement_acceptance_id: c.acceptanceId, payment_plan: v.end.plan, period_end_day: v.end.endDay,
    sent_to: v.to, status: "claimed", triggered_by: opts.triggeredBy,
  }).select("lead_id");
  if (cErr) {
    if ((cErr as { code?: string }).code === "23505") return { lead_id: c.leadId, outcome: "skipped", reason: "already_sent" };
    throw cErr;
  }
  if (!claimed?.length) return { lead_id: c.leadId, outcome: "skipped", reason: "already_sent" };
  const mail = planPeriodReminderEmail({ businessName: c.businessName, plan: v.end.plan, endDay: v.end.endDay });
  const res = opts.simulate ? { ok: true, detail: "simulated" } : await sendAccessDateEmail(v.to, mail);
  const status = !res.ok ? "failed" : opts.simulate ? "simulated" : "sent";
  const nowIso = new Date().toISOString();
  await service.from("plan_period_reminders").update({
    status, sent_at: res.ok ? nowIso : null, provider_id: res.ok ? res.detail.slice(0, 200) : null,
    detail: { subject: mail.subject, error: res.ok ? null : res.detail.slice(0, 300) },
  }).eq("lead_id", c.leadId);
  if (res.ok && !opts.simulate) {
    // Paul's timeline prompt for this reminder clears (clientTimeline.timelineActions reads it).
    await service.from("client_service_terms").update({ continuing_reminder_sent_at: nowIso }).eq("lead_id", c.leadId).is("continuing_reminder_sent_at", null);
    await appendTermsEvent(service, c.leadId, "continuing_reminder_sent", null, { clause: "9A.5", agreement: v.end.plan === "complete" ? "v7" : "v6 or v7", plan: v.end.plan, period_end_day: v.end.endDay, channel: "email", automatic: true });
  }
  await sendOperatorAlert(
    status === "failed" ? `Plan Period reminder FAILED — ${c.businessName}` : `Plan Period reminder ${status} — ${c.businessName}`,
    [
      `${c.businessName}: the v6 clause 9A.5 reminder (opt in to Hosting and Maintenance) was ${status === "failed" ? "NOT sent" : status}.`,
      `Plan: ${v.end.plan}. Plan Period ends ${v.end.endDay}. To: ${v.to}.`,
      status === "failed" ? `Error: ${res.detail.slice(0, 200)}. It will not be retried automatically — send it by hand and record it.` : "",
    ].filter(Boolean),
  ).catch(() => null);
  return { lead_id: c.leadId, outcome: status === "failed" ? "failed" : (status as "sent" | "simulated"), reason: res.ok ? undefined : res.detail.slice(0, 200) };
}

/** The scheduled run: every real (non-QA) client due today. Sends nothing while the switch is off. */
export async function runDue(service: Service, nowIso: string, triggeredBy: string): Promise<{ enabled: boolean; checked: number; results: SendOutcome[] }> {
  if (!(await remindersEnabled(service))) return { enabled: false, checked: 0, results: [] };
  const recorded = await recordedLeads(service);
  const ex = await loadQaExclusions(service);
  const ids = await termsLeadIds(service);
  const results: SendOutcome[] = [];
  for (const id of ids) {
    const c = await loadClient(service, id, recorded, ex);
    if (!c || c.isQa) continue;
    const v = planPeriodReminderVerdict(c.input, nowIso);
    if (!v.send) continue;
    results.push(await sendOne(service, c, v, { simulate: false, triggeredBy }));
  }
  return { enabled: true, checked: ids.length, results };
}

/** The QA drill: ONE fixture lead, a fast-forwarded day, the real claim / send / record (or simulated). */
export async function drill(service: Service, leadId: string, todayIso: string, simulate: boolean): Promise<{ verdict: string; result: SendOutcome | null; period_end_day: string | null }> {
  const ex = await loadQaExclusions(service);
  const recorded = await recordedLeads(service);
  const c = await loadClient(service, leadId, recorded, ex);
  if (!c) return { verdict: "no_terms_row", result: null, period_end_day: null };
  if (!c.isQa) return { verdict: "not_a_qa_lead", result: null, period_end_day: null };
  const v = planPeriodReminderVerdict(c.input, todayIso);
  if (!v.send) return { verdict: v.reason, result: null, period_end_day: v.end?.endDay ?? null };
  return { verdict: "send", result: await sendOne(service, c, v, { simulate, triggeredBy: "qa_drill" }), period_end_day: v.end.endDay };
}
