import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { leadAccess, refusalBody, resolveActor } from "../_shared/access.ts";
import { sendSmsToLead } from "../_shared/twilio-sms.ts";
import { replyWindowForDest } from "../_shared/inbox-schedule.ts";
import { checkSuppressed } from "../_shared/suppression.ts";
import { qaEmailHold } from "../_shared/qa-guard.ts";
import { guardAction } from "../_shared/protection.ts";
import { resolveLeadReportAudit, type ResolvableAudit } from "../../../src/lib/auditReportResolver.ts";
import { RUN_USABLE } from "../../../src/lib/queueAuditStatus.ts";
import { shortReportUrl } from "../../../src/lib/reportSlug.ts";
import { isReportLinkUrl } from "../../../src/lib/smsMessages.ts";
import { reportStyleOf } from "../../../src/lib/reportBrand.ts";
import { isHookStateV2, scoreHookRun, type HookScoreRow } from "../../../src/lib/hookScore.ts";
import { scoringMethodFor } from "../../../src/lib/aiOverview.ts";
import { prospectOnlyLead, PROSPECT_ONLY_DETAIL } from "../../../src/lib/prospectOnly.ts";
import { hhmm, replyWindowOpen } from "../../../src/lib/inboxSendWindow.ts";
import { toWhatsAppDigits } from "../../../src/lib/waNumber.ts";
import { isUkColdDestination } from "../../../src/lib/ukColdDestination.ts";
import { smsSize } from "../../../src/lib/channelCosts.ts";
import {
  cleanPriceLine, DEFAULT_MORE_INFO_PRICE_LINE, isMoreInfoChannel, MORE_INFO_EMAIL_MAX, MORE_INFO_SMS_MAX, MORE_INFO_SUBJECT_MAX,
  moreInfoBlock, moreInfoEmailBody, moreInfoEmailSubject, moreInfoHistoryLine, moreInfoSmsBody, moreInfoTextRefusal, moreInfoTrade,
  moreInfoWarning, senderFirstName, type MoreInfoVars, type NamedFacts,
  MORE_INFO_CONSENT_REQUIRED, moreInfoCallConsentGiven, moreInfoConsentLine, moreInfoConsentRecord,
} from "../../../src/lib/moreInfoMessage.ts";
import { EMAIL_BOUNCED_DETAIL, emailBounced } from "../_shared/email-bounce.ts";

// send-more-info — "Send more info" on the prospect page (Paul, 2026-11-16, docs/send-more-info.md).
//
// Modes: preview · send · settings (read the price line) · save_settings (admin only)
// ⛔ The LEAD decides everything that matters: the browser sends a lead id, a channel and the (edited) words — never an address,
//    a number or a link. The report link is resolved HERE, and an edited message may carry only that link and findable.live.
// ⛔ SMS goes through the ONE text sender (_shared/twilio-sms.ts sendSmsToLead): access, UK mobile, opt-out / do-not-contact,
//    QA, the usage guard. The conversation gate is replaced (this message only) by the required call-consent tick. Outside the lead's texting hours it is REFUSED here (never queued).
// ⛔ Email: Resend from the Findable sending domain (the alerts' domain), reply-to = the salesperson's own email, plain text.
//    Suppression (opt-out / do-not-contact) and the QA sink are checked first; the usage guard (email_send) counts it.
// ⛔ No WhatsApp. Nothing here writes a Next Action: the salesperson's screen saves the 2-day follow-up through the one human
//    write (lead_set_follow_up) after a send succeeds.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
/** The Findable sending domain (verified in Resend: the alerts and Quick Close emails send from it). */
const FROM_ADDRESS = "hello@findable.live";
const REPORT_SITE_ORIGIN = "https://findable.live";

// deno-lint-ignore no-explicit-any
type Service = any;
type Obj = Record<string, unknown>;

async function loadPriceLine(service: Service): Promise<string> {
  const { data } = await service.from("more_info_settings").select("price_line").eq("id", true).maybeSingle();
  return cleanPriceLine((data as { price_line?: string } | null)?.price_line ?? DEFAULT_MORE_INFO_PRICE_LINE);
}

/** What the report shows about them being named: the report's own displayed score (a quick check), else the run's mention rate. */
async function namedFactsFor(service: Service, audit: Obj, run: Obj): Promise<NamedFacts> {
  const hook = (run.results as { hook?: unknown } | null | undefined)?.hook;
  if (isHookStateV2(hook)) {
    const { data: rows } = await service.from("ai_audit_queue").select("id, question, status, result").eq("run_id", run.id);
    const s = scoreHookRun(hook, (rows ?? []) as HookScoreRow[], {
      named: { businessName: String(audit.business_name ?? ""), trade: (audit.business_type as string) || null, town: (audit.location_text as string) || null },
      scoringMethod: scoringMethodFor((audit.created_at as string | null) ?? null),
    });
    if (!s.complete) return { kind: "unknown" };
    if (s.allNamed || (s.scored.expected > 0 && s.scored.named >= s.scored.expected)) return { kind: "all", total: s.scored.expected };
    return s.scored.named > 0 ? { kind: "some", named: s.scored.named, total: s.scored.expected } : { kind: "none" };
  }
  const rate = Number(run.mention_rate);
  if (run.mention_rate == null || !Number.isFinite(rate)) return { kind: "unknown" };
  if (rate <= 0) return { kind: "none" };
  /* mention_rate is a share (0–1) on every writer; a value above 1 is read as a percentage. */
  const share = rate > 1 ? rate / 100 : rate;
  if (share >= 1) return { kind: "all", total: 0 };
  return { kind: "some", named: Math.round(share * 100), total: 100 };
}

type Built =
  | { ok: true; lead: Obj; vars: MoreInfoVars; email: { to: string | null; subject: string; body: string; bounced: boolean; refusal: string | null }; sms: { to: string | null; body: string; segments: number; refusal: string | null }; warning: string | null }
  | { ok: false; error: string; detail: string; status?: number };

async function build(service: Service, actorId: string, leadId: string): Promise<Built> {
  const { data: lead, error } = await service.from("outreach_leads")
    .select("id, business_name, category, email, phone, country, address, campaign_id, is_archived").eq("id", leadId).maybeSingle();
  if (error || !lead) return { ok: false, error: "lookup_failed", detail: "Could not read the lead.", status: 503 };
  if (lead.is_archived === true) return { ok: false, error: "archived", detail: "That lead is archived." };
  /* Australia (and any prospect-only country): no price or guarantee may be sent. */
  if (prospectOnlyLead(lead as { country?: string | null; address?: string | null })) return { ok: false, error: "prospect_only", detail: PROSPECT_ONLY_DETAIL };
  /* A LeadFinderOS-style (web-developer) campaign: its report wears no Findable name, price or guarantee, so this message cannot go. */
  if (lead.campaign_id) {
    const { data: camp } = await service.from("campaigns").select("report_style").eq("id", lead.campaign_id).maybeSingle();
    if (reportStyleOf(camp as { report_style?: string | null } | null) === "leadfinderos") {
      return { ok: false, error: "lfos_campaign", detail: "This lead is in a LeadFinderOS campaign. Send more info is for Findable prospects, so nothing can be sent." };
    }
  }

  // The report: the same rule the Inbox and the report pill use (newest eligible audit with a usable run, never a measurement).
  const { data: audits } = await service.from("ai_audits")
    .select("id, lead_id, short_code, created_at, business_name, business_type, location_text, baseline_target_runs, is_measurement, baseline_contract, audit_purpose, ai_audit_runs(id, run_number, status, mention_rate, results)")
    .eq("lead_id", leadId).order("created_at", { ascending: false }).limit(30);
  const audit = resolveLeadReportAudit((audits ?? []) as ResolvableAudit[], leadId) as (ResolvableAudit & Obj) | null;
  const runs = ((audit?.ai_audit_runs ?? []) as Obj[]).filter((r) => RUN_USABLE.has(String(r.status)))
    .sort((a, b) => Number(b.run_number ?? 0) - Number(a.run_number ?? 0));
  const run = runs[0] ?? null;
  const reportLink = audit && run
    ? (audit.short_code ? shortReportUrl(String(audit.short_code)) : `${REPORT_SITE_ORIGIN}/report/${audit.id}`)
    : null;

  const [{ data: me }, priceLine] = await Promise.all([
    service.from("team_members").select("display_name").eq("user_id", actorId).maybeSingle(),
    loadPriceLine(service),
  ]);
  const senderName = senderFirstName((me as { display_name?: string } | null)?.display_name ?? "");
  const businessName = String(lead.business_name ?? "").replace(/\s+/g, " ").trim();
  const trade = moreInfoTrade((audit?.business_type as string | null) || (lead.category as string | null)) ?? "";
  const named = audit && run ? await namedFactsFor(service, audit, run) : { kind: "unknown" as const };
  const block = moreInfoBlock({ businessName, reportLink, trade, named, senderName });
  if (block) return { ok: false, error: reportLink ? "cannot_build" : "no_report", detail: block };
  if (!isReportLinkUrl(reportLink)) return { ok: false, error: "link_not_approved", detail: "The report link could not be made for this lead. Nothing can be sent." };

  const vars: MoreInfoVars = { businessName, reportLink: reportLink!, trade, priceLine, senderName, named };
  const smsBody = moreInfoSmsBody(vars);
  const digits = toWhatsAppDigits(String(lead.phone ?? ""), (lead.country as string | null) ?? null);
  const email = String(lead.email ?? "").trim();
  const emailTo = EMAIL_RE.test(email) ? email : null;
  /* ⛔ A BOUNCED ADDRESS (_shared/email-bounce.ts): shown as "Email bounced" and never sent to. Unreadable = refused (fail closed). */
  let bounced = false;
  let emailRefusal: string | null = null;
  if (emailTo) {
    try { bounced = await emailBounced(service, leadId, emailTo); } catch { emailRefusal = "Could not check whether this address has bounced, so email is off for now. Try again in a moment, or send a text."; }
    if (bounced) emailRefusal = EMAIL_BOUNCED_DETAIL;
  }
  return {
    ok: true, lead, vars,
    email: { to: emailTo, subject: moreInfoEmailSubject(vars), body: moreInfoEmailBody(vars), bounced, refusal: emailRefusal },
    sms: { to: digits ? `+${digits}` : null, body: smsBody, segments: smsSize(smsBody).segments, refusal: digits && isUkColdDestination(digits) ? null : "Texts go to UK mobiles only, and this lead has no UK mobile. Use email." },
    warning: moreInfoWarning(named),
  };
}

/** The History row: "More info sent by Valentin via SMS. Asked for info on a call, confirmed by Valentin", with the consent
 *  (who, when, channel) in data.consent. */
async function logSent(service: Service, leadId: string, actorId: string, senderName: string, channel: "email" | "sms", data: Obj) {
  const consent = moreInfoConsentRecord({ userId: actorId, name: senderName, channel, at: new Date() });
  await service.from("lead_activity").insert({
    lead_id: leadId, actor_user_id: actorId, kind: "more_info_sent",
    body: `${moreInfoHistoryLine(senderName, channel)}. ${moreInfoConsentLine(senderName)}`, data: { channel, consent, ...data },
  }).then(() => undefined, (e: unknown) => console.error("[send-more-info] history write failed:", e instanceof Error ? e.message : e));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
  try {
    const who = await resolveActor(req, service);
    if (!who.ok) return json(refusalBody(who), who.status);
    const actor = who.actor;
    const body = await req.json().catch(() => ({})) as Obj;
    const mode = String(body.mode ?? "preview");

    if (mode === "settings") return json({ ok: true, price_line: await loadPriceLine(service), can_edit: actor.role === "admin" });
    if (mode === "save_settings") {
      if (actor.role !== "admin") return json({ ok: false, error: "admin_only", detail: "Only Paul can change the price line." }, 403);
      const line = cleanPriceLine(body.price_line);
      const { error } = await service.from("more_info_settings").upsert({ id: true, price_line: line, updated_at: new Date().toISOString(), updated_by: actor.id });
      if (error) return json({ ok: false, error: "save_failed", detail: "The price line could not be saved. Try again." }, 500);
      return json({ ok: true, price_line: line, can_edit: true });
    }
    if (mode !== "preview" && mode !== "send") return json({ ok: false, error: "unknown_mode" }, 400);

    const leadId = String(body.lead_id ?? "");
    if (!UUID_RE.test(leadId)) return json({ ok: false, error: "bad_request", detail: "Missing lead." }, 400);
    const access = await leadAccess(service, actor, leadId);
    if (!access.ok) return json({ ok: false, error: access.error, detail: "That lead is not available to you." }, access.error === "lookup_failed" ? 503 : 404);

    const b = await build(service, actor.id, leadId);
    if (!b.ok) return json({ ok: false, error: b.error, detail: b.detail }, b.status ?? 200);

    if (mode === "preview") {
      return json({
        ok: true, mode: "preview", report_link: b.vars.reportLink, named: b.vars.named, warning: b.warning, sender_name: b.vars.senderName,
        email: b.email, sms: b.sms, price_line: b.vars.priceLine, can_edit_price: actor.role === "admin",
      });
    }

    // ── send ──
    const channel = body.channel;
    if (!isMoreInfoChannel(channel)) return json({ ok: false, error: "bad_request", detail: "Choose email or text." }, 400);
    const key = String(body.idempotency_key ?? "");
    if (key.length < 8 || key.length > 120) return json({ ok: false, error: "bad_request", detail: "Missing send key." }, 400);
    const text = String(body.text ?? "").replace(/\r\n/g, "\n").trim();
    /* ⛔ THE CALL CONSENT (2026-11-16): "They asked for this info on a call" must be ticked, for a text AND an email. It replaces the
       text's conversation gate for this message only; it is recorded on History with the send. */
    if (!moreInfoCallConsentGiven(body.call_consent)) return json({ ok: false, error: "consent_required", detail: MORE_INFO_CONSENT_REQUIRED }, 400);

    if (channel === "sms") {
      if (b.sms.refusal) return json({ ok: false, error: "no_uk_mobile", detail: b.sms.refusal });
      if (text.length > MORE_INFO_SMS_MAX) return json({ ok: false, error: "too_long", detail: `Texts must be at most ${MORE_INFO_SMS_MAX} characters.` }, 400);
      const why = moreInfoTextRefusal(text, b.vars.reportLink);
      if (why) return json({ ok: false, error: "link_not_allowed", detail: why }, 400);
      const r = await sendSmsToLead(service, {
        actor, leadId, moreInfo: { body: text, reportLink: b.vars.reportLink, callConsent: true }, idempotencyKey: key,
        /* ⛔ THE LEAD'S TEXTING HOURS: outside them nothing is sent (and nothing is queued — the salesperson can email instead). */
        queueOutsideWindow: async ({ digits }) => {
          const w = await replyWindowForDest(service, "sms", digits, { leadId });
          if (replyWindowOpen(w)) return null;
          return { ok: false, error: "outside_hours", detail: `It's outside their texting hours (${hhmm(w.startMin)} to ${hhmm(w.endMin)}, ${w.label} time), so nothing was sent. Send it by email, or text after ${hhmm(w.startMin)}.` };
        },
      });
      if (!r.ok) return json({ ok: false, error: r.error, detail: r.detail }, r.status && r.status >= 500 ? r.status : 200);
      if (!r.duplicate) await logSent(service, leadId, actor.id, b.vars.senderName, "sms", { sms_id: r.message.id, simulated: r.simulated, status: r.message.status });
      return json({ ok: true, channel, simulated: r.simulated, duplicate: r.duplicate, to: b.sms.to });
    }

    // email
    const to = b.email.to;
    if (!to) return json({ ok: false, error: "no_email", detail: "There is no email address for them. Add it on the lead first, or send a text." });
    if (b.email.refusal) return json({ ok: false, error: b.email.bounced ? "email_bounced" : "bounce_check_failed", detail: b.email.refusal }, b.email.bounced ? 200 : 503);
    const subject = String(body.subject ?? "").replace(/\s+/g, " ").trim();
    if (!subject || subject.length > MORE_INFO_SUBJECT_MAX) return json({ ok: false, error: "bad_request", detail: `The subject must be 1 to ${MORE_INFO_SUBJECT_MAX} characters.` }, 400);
    if (text.length > MORE_INFO_EMAIL_MAX) return json({ ok: false, error: "too_long", detail: `The email must be at most ${MORE_INFO_EMAIL_MAX} characters.` }, 400);
    const why = moreInfoTextRefusal(text, b.vars.reportLink) ?? (moreInfoTextRefusal(`${subject} ${b.vars.reportLink}`, b.vars.reportLink) ? "The subject cannot carry a link." : null);
    if (why) return json({ ok: false, error: "link_not_allowed", detail: why }, 400);

    const sup = await checkSuppressed(service, { email: to, phone: (b.lead.phone as string | null) ?? null, leadId });
    if (sup.suppressed) {
      if (sup.matchedOn === "lookup_failed") return json({ ok: false, error: "suppression_unreadable", detail: "Could not check the do-not-contact list, so nothing was sent. Try again in a moment." }, 503);
      return json({ ok: false, error: "suppressed", detail: "They asked not to be contacted (or are on the do-not-contact list), so nothing was sent." });
    }
    let qaRefusal: string | null;
    try { qaRefusal = await qaEmailHold(service, leadId, to); } catch { return json({ ok: false, error: "qa_guard_unavailable", detail: "Could not run the safety check, so nothing was sent. Try again in a moment." }, 503); }
    if (qaRefusal) return json({ ok: false, error: "qa_email_sink_only", detail: qaRefusal });

    const g = await guardAction(service, actor.id, "email_send", { fn: "send-more-info", leadId, role: actor.role });
    if (!g.ok) return json(g.body, g.status);

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) return json({ ok: false, error: "email_unconfigured", detail: "Email is not set up." }, 500);
    const { data: u } = await service.auth.admin.getUserById(actor.id);
    const replyTo = String(u?.user?.email ?? "").trim();
    if (!EMAIL_RE.test(replyTo)) return json({ ok: false, error: "no_reply_to", detail: "Your own email address could not be read, so replies would not reach you. Nothing was sent." });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      /* Resend's Idempotency-Key: a double press (same key) sends once. */
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json", "Idempotency-Key": `more-info-${key}` },
      body: JSON.stringify({ from: `${b.vars.senderName} at Findable <${FROM_ADDRESS}>`, to: [to], reply_to: replyTo, subject, text }),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      await service.from("client_error_reports").insert({ error_id: "more_info_email_failed", context: { lead_id: leadId, status: res.status, detail } })
        .then(() => undefined, () => undefined);
      return json({ ok: false, error: "email_failed", detail: "The email did not send. Try again in a moment, or send a text." }, 502);
    }
    const sent = await res.json().catch(() => ({})) as { id?: string };
    await logSent(service, leadId, actor.id, b.vars.senderName, "email", { to, resend_id: sent.id ?? null });
    return json({ ok: true, channel, simulated: false, duplicate: false, to });
  } catch (e) {
    console.error("[send-more-info] error:", (e as Error).message);
    return json({ ok: false, error: "internal" }, 500);
  }
});
