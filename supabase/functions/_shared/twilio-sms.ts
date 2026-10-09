// twilio-sms — sending ONE text to ONE lead, with every guard in one place (2026-10-09).
//
// Called by twilio-sms-send (the Inbox composer / follow-ups / website link) AND by quick-close (the setup and
// agreement links it generates). There is no other way to send an SMS: the guards below cannot be skipped by a
// second caller because there is no second caller.
//
// ⛔ ORDER (every step fails closed; absent is never a yes):
//   1. lead access (admin: their book; sales: assigned, not a client) — the lead decides the number, NEVER the browser.
//   2. UK mobile only (the digits we would send to; the same property as cold WhatsApp's gate).
//   3. the text: an approved template filled by us, or free text with no link in it. A link-bearing template needs an
//      approved findable.live URL generated server-side by the authoritative flow (isApprovedSmsLink).
//   4. suppression (opt-out / wrong number / unreadable → refuse).
//   5. the conversation gate: a first text only follows a logged conversation or a message from them.
//   6. QA safety (a fixture is SIMULATED, a test-account-held real lead is REFUSED).
//   7. the abuse guard (sms_send: per-minute / hour / day, suspended reps, all-stop).
//   8. idempotency: the row is inserted FIRST under a unique key; a second press with the same key is a no-op that
//      returns the first result. A link of the same kind sent in the last 10 minutes needs allow_resend.
//   9. only then Twilio (or the simulation). "queued" from Twilio is NOT delivered; the status webhook says that.
import {
  isApprovedSmsLink, isColdSmsTemplate, isSmsTemplate, smsTextFromWhatsAppBody, SMS_LINK_TEMPLATE, SMS_TEMPLATES_NEEDING_REAL_NAME,
  type SmsLinkVariant, type SmsTemplateName,
} from "../../../src/lib/smsMessages.ts";
import { renderTemplateBody } from "./whatsapp-send.ts";
import { resolveSignupLinkVars } from "./link-template-vars.ts";
import { smsGateOpen } from "../../../src/lib/contactRouting.ts";
import { smsSize, CHANNEL_COST_GBP } from "../../../src/lib/channelCosts.ts";
import { isUkColdDestination } from "../../../src/lib/ukColdDestination.ts";
import { toWhatsAppDigits } from "../../../src/lib/waNumber.ts";
import { leadAccess, type Actor } from "./access.ts";
import { checkSuppressed } from "./suppression.ts";
import { guardAction } from "./protection.ts";
import { loadQaExclusions } from "./qa-guard.ts";
import { qaSendVerdict } from "../../../src/lib/qaSafety.ts";
import { resolveTwilioEnv, twilioSendSms } from "./twilio.ts";
import { markLeadNoSms, markLeadSmsRefused } from "./sms-lead-sync.ts";

// deno-lint-ignore no-explicit-any
type Service = any;

export interface SendSmsArgs {
  actor: Actor;
  leadId: string;
  /** A WHATSAPP template name SMS may carry (src/lib/smsMessages.ts). Exactly one of template / text. The wording is the
   *  WhatsApp body, rendered by the same function the WhatsApp sender uses. */
  template?: SmsTemplateName;
  /** For findable_signup_link only: which link (the agreement, or the full setup). Resolved from the lead's own records. */
  linkVariant?: SmsLinkVariant;
  /** Free text — never contains a link; only to a conversation whose gate is open. */
  text?: string | null;
  idempotencyKey: string;
  allowResend?: boolean;
  /** 'queue' = the SMS drip (process-sms-queue) sending as the person who queued it. Changes nothing about the guards. */
  source?: 'manual' | 'queue';
}

export type SendSmsResult =
  | { ok: true; duplicate: boolean; simulated: boolean; message: { id: string; status: string; body: string; segments: number | null } }
  | { ok: false; error: string; detail: string; status?: number };

const fail = (error: string, detail: string, status = 200): SendSmsResult => ({ ok: false, error, detail, status });
const URL_IN_TEXT = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|co\.uk|uk|net|org|io|live|me|ly)\b)/i;

export async function sendSmsToLead(service: Service, a: SendSmsArgs): Promise<SendSmsResult> {
  const env = resolveTwilioEnv();
  if (!env.testMode && !env.smsConfigured) return fail("not_configured", "SMS is not set up yet — the Twilio settings are missing.", 200);
  if (!a.idempotencyKey || a.idempotencyKey.length < 8 || a.idempotencyKey.length > 120) return fail("bad_request", "Missing send key.", 400);
  if (!!a.template === !!a.text) return fail("bad_request", "Send a template or a message, not both.", 400);

  // 1. the lead, through the one access rule
  const access = await leadAccess(service, a.actor, a.leadId);
  if (!access.ok) return fail(access.error === "lookup_failed" ? "lookup_failed" : "lead_not_found", "That lead is not available to you.", access.error === "lookup_failed" ? 503 : 404);
  const { data: lead, error: lErr } = await service.from("outreach_leads")
    .select("id, business_name, phone, country, email, user_id, assigned_to_user_id, status, is_archived, derived_town").eq("id", a.leadId).maybeSingle();
  if (lErr || !lead) return fail("lookup_failed", "Could not read the lead.", 503);
  if (lead.is_archived === true) return fail("archived", "That lead is archived.", 409);

  // 2. UK mobile only, from the lead's own stored number
  const digits = toWhatsAppDigits(lead.phone as string, (lead.country as string | null) ?? null);
  if (!isUkColdDestination(digits)) {
    /* ⛔ A NUMBER THAT CAN NEVER BE A UK MOBILE is No SMS the moment we find out — before anything is queued or sent (the SMS twin of
       WhatsApp's "not on WhatsApp"). A landline (+44 151 …), a foreign number, junk: nothing leaves, and the lead says so. */
    await markLeadNoSms(service, lead.id as string);
    return fail("not_uk_mobile", "SMS goes to UK mobile numbers only, and this lead's number is not one — it is marked No SMS.");
  }
  const e164 = `+${digits}`;

  // 3. the text
  let body: string | null;
  let linkKind: SmsLinkVariant | null = null;
  if (a.template) {
    if (!isSmsTemplate(a.template)) return fail("bad_request", "That template is not available by text.", 400);
    /* ⛔ THE WORDS ARE WHATSAPP'S: the same renderTemplateBody the WhatsApp sender calls, with the same arguments it passes
       (send-whatsapp-message: the sign-up link template is filled from link-template-vars; the openers and continuations from the
       lead's name and town). Nothing is added: the SMS is the WhatsApp body word for word (smsTextFromWhatsAppBody). */
    const business = String(lead.business_name ?? "").trim();
    if (SMS_TEMPLATES_NEEDING_REAL_NAME.has(a.template) && !business) return fail("needs_real_name", "This template needs the business name, and the lead has none.");
    try {
      if (a.template === SMS_LINK_TEMPLATE) {
        const variant: SmsLinkVariant = a.linkVariant === "setup" ? "setup" : "agreement";
        const v = await resolveSignupLinkVars(service, lead.id as string, variant);
        if (!v.ok) return fail("link_unavailable", v.reason, 409);
        if (!isApprovedSmsLink(v.url)) return fail("link_not_approved", "That link is not one we send by text.", 400);
        linkKind = variant;
        body = smsTextFromWhatsAppBody(a.template, renderTemplateBody(a.template, v.greeting, v.url));
      } else {
        body = smsTextFromWhatsAppBody(a.template, renderTemplateBody(a.template, business, "", undefined, undefined, undefined, (lead.derived_town as string | null) ?? undefined));
      }
    } catch (e) {
      return fail("template_unsafe", String((e as Error).message ?? "The text could not be built.").slice(0, 200), 400);
    }
    if (!body || /^\[[a-z0-9_]+\]$/.test(body)) return fail("bad_request", "The text could not be built.", 400);
  } else {
    body = String(a.text ?? "").trim();
    if (!body || body.length > 600) return fail("bad_request", "Messages must be 1–600 characters.", 400);
    if (URL_IN_TEXT.test(body)) return fail("link_not_allowed", "Links go through Quick Close or the link buttons — not typed into a text.", 400);
  }

  // 4. suppression — fail closed
  const sup = await checkSuppressed(service, { phone: e164, email: lead.email as string | null, leadId: lead.id as string });
  if (sup.suppressed) {
    if (sup.matchedOn === "lookup_failed") return fail("suppression_unreadable", "Could not check whether they have opted out, so nothing was sent.", 503);
    return fail(sup.wrongNumber ? "wrong_number" : "opted_out", sup.wrongNumber ? "This number is marked wrong." : "They have asked not to be contacted.");
  }

  // 5. the conversation gate
  const isCold = isColdSmsTemplate(a.template);
  const [{ data: block }, { data: inSms }, { data: inWa }, { data: priorOut }, { data: waAny }] = await Promise.all([
    service.rpc("opener_contact_block", { _lead_id: lead.id }),
    service.from("sms_messages").select("id").eq("phone", digits).eq("direction", "inbound").limit(1),
    service.from("whatsapp_messages").select("id").eq("lead_id", lead.id).eq("direction", "inbound").limit(1),
    service.from("sms_messages").select("id").eq("phone", digits).eq("direction", "outbound").not("status", "in", "(failed,undelivered,simulated)").limit(1),
    service.from("whatsapp_messages").select("id").eq("phone", digits).or("status.is.null,status.not.in.(failed,failed_temporary,simulated)").limit(1),
  ]);
  /* ⛔ A COLD TEXT (the two WhatsApp openers) is the one text that needs no conversation — and so it has the WhatsApp cold rule instead:
     never to a number we have already texted, never into a WhatsApp conversation, never after a logged conversation. It is
     the same check for the Outreach row button and for the queue. */
  if (isCold) {
    if (Array.isArray(priorOut) && priorOut.length > 0) return fail("already_texted", "That number has already been texted.");
    if (Array.isArray(waAny) && waAny.length > 0) return fail("in_whatsapp_conversation", "They are already in a WhatsApp conversation, so a cold text is not sent.");
    if (typeof block === "string" && block.length > 0) return fail("contacted_logged", "You have already spoken to them, so a cold text is not sent.");
  }
  const gate = isCold || smsGateOpen({
    loggedConversation: typeof block === "string" && block.length > 0,
    inboundSms: Array.isArray(inSms) && inSms.length > 0,
    inboundWhatsapp: Array.isArray(inWa) && inWa.length > 0,
    isAdmin: a.actor.role === "admin",
  });
  if (!gate) return fail("sms_gate_closed", "Texts follow a conversation. Log the call (spoke to them / interested) first, or wait for them to message you.");

  // 6. QA safety
  const ex = await loadQaExclusions(service);
  const qa = qaSendVerdict(ex, { leadId: lead.id as string, phones: [lead.phone as string, digits], holderUserId: (lead.assigned_to_user_id as string | null) ?? null, actorUserId: a.actor.id });
  if (qa.kind === "refuse") return fail("qa_refused", "This is a real business held by a test account, so nothing was sent.");
  const simulated = env.testMode || qa.kind === "simulate";

  // 7. abuse guard
  const g = await guardAction(service, a.actor.id, "sms_send", { fn: "twilio-sms", leadId: lead.id as string, role: a.actor.role });
  if (!g.ok) return { ok: false, error: g.body.error, detail: g.body.detail, status: g.status };

  // 8. idempotency + duplicate-link guard
  if (linkKind && !a.allowResend) {
    const since = new Date(Date.now() - 10 * 60_000).toISOString();
    const { data: recent } = await service.from("sms_messages").select("id, status").eq("lead_id", lead.id).eq("link_kind", linkKind)
      .eq("direction", "outbound").gte("created_at", since).not("status", "in", "(failed,undelivered)").limit(1);
    if (Array.isArray(recent) && recent.length > 0) return fail("already_sent_recently", "That link was texted a few minutes ago. Resend only if they say it did not arrive.");
  }
  const size = smsSize(body);
  const { data: row, error: insErr } = await service.from("sms_messages").insert({
    direction: "outbound", user_id: lead.user_id, lead_id: lead.id, phone: digits, body, status: "queued",
    segments: size.segments, template_key: a.template ?? null, link_kind: linkKind, sent_by_user_id: a.actor.id,
    idempotency_key: a.idempotencyKey, test_mode: simulated, est_cost_gbp: simulated ? 0 : size.segments * CHANNEL_COST_GBP.sms,
  }).select("id, status, body, segments").single();
  if (insErr) {
    if ((insErr as { code?: string }).code === "23505") {
      const { data: first } = await service.from("sms_messages").select("id, status, body, segments, test_mode").eq("idempotency_key", a.idempotencyKey).maybeSingle();
      if (first) return { ok: true, duplicate: true, simulated: first.test_mode === true, message: { id: first.id, status: first.status, body: first.body, segments: first.segments } };
    }
    return fail("log_failed", "Could not record the text, so it was not sent.", 500);
  }

  // 9. send
  let status = "simulated";
  let sid: string | null = null;
  let errCode: string | null = null;
  let errText: string | null = null;
  if (!simulated) {
    const r = await twilioSendSms(env, e164, body);
    if (r.ok) { status = "queued"; sid = r.sid; } else { status = "failed"; sid = r.sid; errCode = r.errorCode; errText = r.error; }
    /* A Twilio REFUSAL at send time (never accepted): the code decides — 21211 / 21614 mean the number cannot receive SMS (No SMS); 21610 means
       they unsubscribed (an opt-out, recorded); anything else is a failed attempt (SMS Failed). Smsstatus.ts has the full map. */
    if (!r.ok) await markLeadSmsRefused(service, lead.id as string, r.errorCode, e164);
  }
  await service.from("sms_messages").update({ status, twilio_sid: sid, error_code: errCode, error: errText }).eq("id", row.id);
  if (!simulated && status !== "failed") {
    /* A real text is a real contact and the latest route wins: the lead's Contact Method becomes Text (the Inbox opens it on the SMS
       tab), and the legacy send stamp records it for the claim rule. A simulated or failed text changes neither. */
    await service.from("outreach_leads").update({ contact_method: "sms", sms_sent_at: new Date().toISOString(), sms_delivery_status: status, sms_message_sid: sid }).eq("id", lead.id)
      .then(() => undefined, () => undefined);
  }
  await service.from("lead_activity").insert({
    lead_id: lead.id, actor_user_id: a.actor.id, kind: "sms_sent",
    data: { template: a.template ?? "free_text", link_kind: linkKind, status, sms_id: row.id, simulated },
  }).then(() => undefined, () => undefined);

  if (status === "failed") return fail("send_failed", `The text could not be sent${errCode ? ` (code ${errCode})` : ""}. Try another way.`, 200);
  return { ok: true, duplicate: false, simulated, message: { id: row.id, status, body, segments: size.segments } };
}
