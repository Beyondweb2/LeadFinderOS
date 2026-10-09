/* SMS STATUS — THE SMS EQUIVALENT OF WHATSAPP'S Queued / Contacted / Failed / No WhatsApp (2026-10-09, Paul). Pure, edge-reachable.

   What Paul asked for: queued → Queued · delivered → Contacted · failed → SMS failed · a number that can never receive SMS → No SMS.
   And: status must come from the PROVIDER'S delivery callbacks, never be assumed on send.

   HOW IT IS STORED (and why it does not touch WhatsApp's statuses):
     · outreach_leads.sms_queued_at         the queue LANE marker (set by queue_sms_openers, cleared when the drip is done with the lead)
     · outreach_leads.sms_delivery_status   the SMS state: 'queued' | 'sent' | 'delivered' | 'sms_failed' | 'no_sms' (plus a refusal reason
                                            the drip leaves, which maps to 'sms_failed' for display)
     · outreach_leads.status                moves to 'initial_contact' (Contacted) ONLY when Twilio's callback says `delivered` — the same
                                            effect a WhatsApp send has — and only from a status that is still "early" (never over replied,
                                            interested, client…, and never from the WhatsApp drip's own 'queued').
   ⛔ The lead's STATUS is never set to 'queued': that value is the WhatsApp drip's marker and it would pick the lead up and send it a
      WhatsApp. SMS "Queued" / "SMS failed" / "No SMS" are therefore DISPLAY pills derived from the two columns above (smsPillOf), drawn only
      over an early status, so they can never hide a reply, a client or an interested lead.
   ⛔ A SENT/DELIVERED COLD OPENER IS NOT A GENUINE CONVERSATION. Delivered moves the lead to Contacted (a send), but the shared real-contact
      guard (opener_contact_block / lead_reached_contact) reads logged outcomes only and is untouched: a delivered opener never stops a
      second opener by itself being judged as a conversation — only a reply or a logged call does.

   THE ERROR-CODE MAP (Twilio; https://www.twilio.com/docs/api/errors) — what makes "No SMS" and what is only "SMS failed":
     NO SMS (the number cannot receive SMS — stop texting it):
       30005  Unknown destination handset      — the number does not exist / is not in service
       30006  Landline or unreachable carrier  — a landline (or a carrier that cannot receive), definitive for our UK-mobile use
       21211  Invalid 'To' phone number        — not a number at all (send-time)
       21614  'To' number is not a valid mobile — not a mobile (send-time)
     OPTED OUT (recorded as an opt-out, shown as Opted out, never re-texted):
       21610  Recipient has unsubscribed (STOP) — handled by the sender, not mapped here
     SMS FAILED (this attempt failed; the NUMBER may still be fine — a retry or another route is the rep's call):
       30003  Unreachable destination handset  — switched off / out of coverage: NOT proof there is no mobile (Paul's rule)
       30004  Message blocked · 30007 carrier filtering · 30008 unknown error · 30001 queue overflow · 30002 account suspended · anything else. */

export type SmsPill = 'sms_queued' | 'sms_failed' | 'no_sms';

/** Codes that definitively mean this number cannot receive SMS. Everything else that fails is "SMS failed". */
export const NO_SMS_ERROR_CODES: ReadonlySet<string> = new Set(['30005', '30006', '21211', '21614']);
/** Twilio's "recipient unsubscribed" — an opt-out, not a delivery problem. */
export const OPTED_OUT_ERROR_CODE = '21610';

export type SmsFailureKind = 'no_sms' | 'opted_out' | 'sms_failed';

/** Map a Twilio error code to what it means for the LEAD. A missing/unknown code is a plain failure, never "No SMS". */
export function classifySmsFailure(code: string | number | null | undefined): SmsFailureKind {
  const c = String(code ?? '').trim();
  if (c === OPTED_OUT_ERROR_CODE) return 'opted_out';
  return NO_SMS_ERROR_CODES.has(c) ? 'no_sms' : 'sms_failed';
}

/** The value stored in outreach_leads.sms_delivery_status for a provider status (+ error code). Unknown stays 'queued', never 'delivered'. */
export function leadSmsStatusFor(providerStatus: string | null | undefined, errorCode?: string | number | null): string {
  switch (String(providerStatus ?? '').toLowerCase()) {
    case 'delivered': return 'delivered';
    case 'sent': return 'sent';
    case 'undelivered':
    case 'failed': { const k = classifySmsFailure(errorCode); return k === 'opted_out' ? 'sms_failed' : k; }
    default: return 'queued';
  }
}

/** Pipeline statuses that are still "early": the only ones an SMS result may change or be drawn over. */
const EARLY: ReadonlySet<string> = new Set(['', 'not_contacted', 'no_whatsapp', 'no_whatsapp_needs_sms', 'whatsapp_failed']);
export const isEarlyStatus = (s: string | null | undefined): boolean => EARLY.has(String(s ?? '').trim());

/** What status a DELIVERED text moves the lead to (null = leave it). Only an early status becomes Contacted (initial_contact). */
export function statusAfterSmsDelivered(current: string | null | undefined): string | null {
  return isEarlyStatus(current) ? 'initial_contact' : null;
}

/** Refusals the drip / sender can leave in sms_delivery_status. They are NOT delivery problems — a rule said no — so they draw no pill. */
export const SMS_RULE_REFUSALS: ReadonlySet<string> = new Set([
  'opted_out', 'wrong_number', 'already_texted', 'in_whatsapp_conversation', 'contacted_logged', 'contacted_by_phone',
  'qa_refused', 'needs_real_name', 'sms_gate_closed', 'already_sent_recently', 'link_unavailable', 'link_not_approved',
]);
/** Refusals that mean the number itself can never be texted (the drip's pre-send check): No SMS. */
export const SMS_NO_NUMBER_REFUSALS: ReadonlySet<string> = new Set(['not_uk_mobile', 'not_a_uk_mobile', 'no_phone']);

/** The display pill for a lead's SMS state (null = none). Queued wins while the lane marker is set or the text is with the provider;
 *  then the two failure states. `delivered` has no pill of its own: the stored status is Contacted. A rule refusal draws none. */
export function smsPillOf(l: { sms_queued_at?: string | null; sms_delivery_status?: string | null } | null | undefined): SmsPill | null {
  if (!l) return null;
  if (l.sms_queued_at) return 'sms_queued';
  const s = String(l.sms_delivery_status ?? '').trim();
  if (!s || s === 'delivered' || s === 'simulated') return null;
  if (s === 'queued' || s === 'sent') return 'sms_queued';
  if (s === 'no_sms' || SMS_NO_NUMBER_REFUSALS.has(s)) return 'no_sms';
  if (s === 'sms_failed') return 'sms_failed';
  if (SMS_RULE_REFUSALS.has(s)) return null;
  return 'sms_failed'; // any other reason the drip left (send_failed, bad_template, usage_paused …) is a failed attempt, and it shows
}

export const SMS_PILL_LABEL: Record<SmsPill, string> = { sms_queued: 'Queued', sms_failed: 'SMS Failed', no_sms: 'No SMS' };

/** A number that is plausibly a UK MOBILE: 07… / +447… / 00447… with the right length. A landline (01/02/03), a foreign number or junk is not. */
export function isPlausibleUkMobile(raw: string | null | undefined): boolean {
  const d = String(raw ?? '').replace(/[^\d+]/g, '');
  if (!d) return false;
  const digits = d.startsWith('+') ? d.slice(1) : d.startsWith('00') ? d.slice(2) : d;
  if (/^447\d{9}$/.test(digits)) return true;
  return /^07\d{9}$/.test(digits) && !d.startsWith('+');
}
