/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE WELCOME PACK ON WHATSAPP (Paul, 2026-10-29) — the message, the template name, and the ONE decision of how
   (or whether) it may go. Sending stays manual: paid-client-hub `welcome_pack_send` runs this only when Paul
   presses Send, then hands a free-text send to fn send-whatsapp-message, whose own rules decide last.

   In order, every route positive:
     1. no phone / no WhatsApp / landline / opted out (or the opt-out check failed) / wrong number → NOTHING
        (Copy WhatsApp message, or Email instead);
     2. they messaged us inside the last 24 hours → FREE TEXT, but only inside their send hours;
     3. otherwise the approved template — and until it is approved at Meta AND wired into the sender, NOTHING:
        a clear sentence and Copy WhatsApp message.
   ⛔ THE TEMPLATE IS NOT WIRED YET (WELCOME_PACK_TEMPLATE_WIRED = false). Registering a template touches
      _shared/whatsapp-send.ts, reached by 17 functions (stripe-webhook and the held whatsapp-status among them),
      so it is done in its own change once Meta has approved the wording in docs/welcome-pack-whatsapp-template.md.
      The gate goes FIRST: an approved-but-unwired template still refuses — never "try it".
   ⛔ NOT COLD, NOT MARKETING: a message to a paying client about what they bought. Free text carries no template, so
      the sender's cold-template rules (isColdOutreachTemplate) never see it; the number-health RED pause lives only in
      the outreach queue, which this never enters.
   Pure, no Deno: imported by the edge function (relative path, explicit .ts) and the screen.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { GBP_MANAGER_EMAIL } from './findableOffer.ts';
import { windowOpenAt } from './paymentLinkRoute.ts';

/** ⛔ THE SETTING: the Meta template's name, in ONE place. Change it here if Meta needs a different name. */
export const WELCOME_PACK_TEMPLATE_NAME = 'welcome_pack_ready';
/** The sender cannot send this template until it is registered there (see the header). */
export const WELCOME_PACK_TEMPLATE_WIRED = false;

const firstName = (name: string | null | undefined): string => (name ?? '').trim().split(/\s+/)[0] || '';

/** Paul's wording, exactly. No first name → "Hi there". */
export function welcomePackWhatsAppText(a: { contactName?: string | null; businessName: string; url: string }): string {
  const first = firstName(a.contactName) || 'there';
  const business = (a.businessName || '').trim() || 'your business';
  return `Hi ${first}, welcome to Findable! Your welcome pack for ${business} is ready: ${a.url}. One thing I need from you: please add ${GBP_MANAGER_EMAIL} as a Manager of your Google Business Profile (the steps are on the first page of the pack). Any questions, just reply here. Paul`;
}

/** The template body to submit at Meta: {{1}} first name, {{2}} business name, {{3}} the pack link. */
export const WELCOME_PACK_TEMPLATE_BODY =
  'Hi {{1}}, welcome to Findable! Your welcome pack for {{2}} is ready: {{3}}. One thing I need from you: please add ' +
  `${GBP_MANAGER_EMAIL} as a Manager of your Google Business Profile (the steps are on the first page of the pack). ` +
  'Any questions, just reply here. Paul';

export type WelcomePackWaReason =
  | 'ok_text' | 'ok_template' | 'no_phone' | 'no_whatsapp' | 'opted_out' | 'optout_unknown' | 'wrong_number'
  | 'outside_hours' | 'template_not_approved' | 'template_not_wired';

export interface WelcomePackWaFacts {
  hasPhone: boolean;
  /** whatsAppCapabilityOf: 'not_on_whatsapp' / 'not_mobile' mean no WhatsApp at all. */
  capability: string;
  /** checkOptedOut: true / false / null when the lookup failed (fails closed). */
  optedOut: boolean | null;
  wrongNumber: boolean;
  /** Their latest inbound WhatsApp (ISO), if any. */
  lastInboundAt: string | null;
  /** Inside their send hours now (the Inbox send-window rule). */
  sendHoursOpen: boolean;
  /** Meta's live status of WELCOME_PACK_TEMPLATE_NAME ('APPROVED', 'PENDING', 'NOT_FOUND', …). */
  templateStatus: string;
  templateWired?: boolean;
}

export interface WelcomePackWaDecision { route: 'text' | 'template' | 'none'; reason: WelcomePackWaReason; say: string; emailFallback: boolean }

const SAY: Record<WelcomePackWaReason, string> = {
  ok_text: 'They messaged you in the last 24 hours, so it goes as a normal WhatsApp message.',
  ok_template: 'Sent with the approved welcome_pack_ready template.',
  no_phone: 'No phone number on file, so it cannot go on WhatsApp. Email it instead, or copy the message.',
  no_whatsapp: 'This number has no WhatsApp (or is a landline). Email it instead, or copy the message.',
  opted_out: 'This client opted out of WhatsApp messages, so nothing is sent on WhatsApp. Email it instead, or copy the message.',
  optout_unknown: "Couldn't check whether this client opted out, so nothing is sent. Try again in a minute, or copy the message.",
  wrong_number: 'This number is marked Wrong number, so nothing is sent on WhatsApp. Email it instead, or copy the message.',
  outside_hours: "It's outside their send hours, so nothing is sent now. Press Send again inside their hours, or copy the message.",
  template_not_approved: "They haven't messaged you in the last 24 hours, so this needs the welcome_pack_ready WhatsApp template, and Meta hasn't approved it yet. Copy the WhatsApp message and send it by hand.",
  template_not_wired: "They haven't messaged you in the last 24 hours. The welcome_pack_ready template is approved at Meta, but the app is not wired to send it yet. Copy the WhatsApp message and send it by hand.",
};

/** ⛔ Positive: every route is a match on all its conditions; anything else is 'none'. */
export function decideWelcomePackWhatsApp(f: WelcomePackWaFacts, nowMs: number = Date.now()): WelcomePackWaDecision {
  const none = (reason: WelcomePackWaReason, emailFallback: boolean): WelcomePackWaDecision => ({ route: 'none', reason, say: SAY[reason], emailFallback });
  if (!f.hasPhone) return none('no_phone', true);
  if (f.capability === 'not_on_whatsapp' || f.capability === 'not_mobile') return none('no_whatsapp', true);
  if (f.optedOut === null) return none('optout_unknown', false);
  if (f.optedOut === true) return none('opted_out', true);
  if (f.wrongNumber) return none('wrong_number', true);
  if (!f.sendHoursOpen) return none('outside_hours', false);
  if (windowOpenAt(f.lastInboundAt, nowMs)) return { route: 'text', reason: 'ok_text', say: SAY.ok_text, emailFallback: false };
  if (f.templateStatus !== 'APPROVED') return none('template_not_approved', false);
  if (f.templateWired !== true) return none('template_not_wired', false);
  return { route: 'template', reason: 'ok_template', say: SAY.ok_template, emailFallback: false };
}
