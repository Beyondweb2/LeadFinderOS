// sms-lead-sync — a text's REAL provider outcome onto its lead (2026-10-09). The SMS twin of what leadFailurePatch / the status webhook do
// for WhatsApp, and the one place the SMS state of a lead is written from a provider answer.
//
// ⛔ ONLY A PROVIDER ANSWER CHANGES THIS. Called by twilio-webhook (delivery receipts) and by the sender (a Twilio REST refusal). Never on
//    "we asked Twilio" — accepted is `queued`, not delivered.
// ⛔ ONLY THE NEWEST TEXT TO A LEAD MAY MOVE THE LEAD: an older text's late receipt (delivered after a newer one failed, or the other way
//    round) must not overwrite what the lead's latest text says. Messages keep their own status regardless (advanceSmsStatus).
// ⛔ DELIVERED → CONTACTED, but only from an EARLY status (statusAfterSmsDelivered): never over replied / interested / a client, and never
//    from the WhatsApp drip's own 'queued'. A failed or No-SMS result changes NO pipeline status — those are display pills (smsPillOf).
// ⛔ A delivered cold opener is NOT a genuine conversation: this writes status and the SMS column only; the shared real-contact guard
//    (opener_contact_block) reads logged outcomes and is untouched.
import { classifySmsFailure, leadSmsStatusFor, statusAfterSmsDelivered } from "../../../src/lib/smsStatus.ts";
import { recordOptOut } from "./suppression.ts";

// deno-lint-ignore no-explicit-any
type Service = any;

export interface SyncResult { applied: boolean; smsStatus: string | null; becameContacted: boolean }

export async function syncLeadFromSms(service: Service, a: { leadId: string; messageId: string; providerStatus: string; errorCode?: string | null; phoneE164?: string | null }): Promise<SyncResult> {
  const none: SyncResult = { applied: false, smsStatus: null, becameContacted: false };
  const { data: newest } = await service.from("sms_messages").select("id").eq("lead_id", a.leadId).eq("direction", "outbound")
    .eq("test_mode", false).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!newest || newest.id !== a.messageId) return none; // not the lead's latest text

  const kind = (a.providerStatus === "failed" || a.providerStatus === "undelivered") ? classifySmsFailure(a.errorCode) : null;
  const smsStatus = leadSmsStatusFor(a.providerStatus, a.errorCode);
  const { data: lead } = await service.from("outreach_leads").select("id, status, sms_delivery_status").eq("id", a.leadId).maybeSingle();
  if (!lead) return none;
  // never walk a delivered lead backwards because of a stray late 'sent'/'queued'
  if (lead.sms_delivery_status === "delivered" && (smsStatus === "sent" || smsStatus === "queued")) return none;

  const patch: Record<string, unknown> = { sms_delivery_status: smsStatus };
  let becameContacted = false;
  if (smsStatus === "delivered") {
    const next = statusAfterSmsDelivered(lead.status as string | null);
    if (next) { patch.status = next; becameContacted = true; }
  }
  const { error } = await service.from("outreach_leads").update(patch).eq("id", a.leadId);
  if (error) { console.error("[sms-lead-sync] lead update failed:", (error as { message?: string }).message); return none; }
  if (kind === "opted_out" && a.phoneE164) await recordOptOut(service, { phone: a.phoneE164, leadId: a.leadId }, "twilio_status");
  return { applied: true, smsStatus, becameContacted };
}

/** The lead's SMS state after a SEND-TIME refusal (nothing was ever accepted by Twilio): the failure kind decides. */
export async function markLeadSmsRefused(service: Service, leadId: string, errorCode: string | null, phoneE164?: string | null): Promise<"no_sms" | "opted_out" | "sms_failed"> {
  const kind = classifySmsFailure(errorCode);
  if (kind === "opted_out") { if (phoneE164) await recordOptOut(service, { phone: phoneE164, leadId }, "twilio_send"); return kind; }
  await service.from("outreach_leads").update({ sms_delivery_status: kind }).eq("id", leadId)
    .or("sms_delivery_status.is.null,sms_delivery_status.neq.delivered").then(() => undefined, () => undefined);
  return kind;
}

/** A number that can never be a UK mobile (found BEFORE any send): the lead is No SMS immediately. Never overwrites a delivered text. */
export async function markLeadNoSms(service: Service, leadId: string): Promise<void> {
  await service.from("outreach_leads").update({ sms_delivery_status: "no_sms" }).eq("id", leadId)
    .or("sms_delivery_status.is.null,sms_delivery_status.neq.delivered").then(() => undefined, () => undefined);
}
