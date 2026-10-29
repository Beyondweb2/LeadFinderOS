/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE WELCOME PACK ON WHATSAPP (Paul, 2026-10-29) — the message, the template name, and the ONE decision of how
   (or whether) it may go. Sending stays manual: paid-client-hub `welcome_pack_send` runs this only when Paul
   presses Send, then hands a free-text send to fn send-whatsapp-message, whose own rules decide last.

   In order, every route positive:
     1. no phone / no WhatsApp / landline / opted out (or the opt-out check failed) / wrong number → NOTHING
        (Copy WhatsApp message, or Email instead);
     2. they messaged us inside the last 24 hours → FREE TEXT, but only inside their send hours;
     3. otherwise the welcome_pack_ready TEMPLATE (wired 2026-10-29, registered in _shared/whatsapp-send.ts as a
        CONTINUATION). Meta's LIVE status decides: approved (or unreadable — Meta decides on the send) goes; in review,
        rejected, paused or not found refuses with the reason, nothing is recorded, and Copy WhatsApp message stays.
   ⛔ The template's three variables are resolved by fn send-whatsapp-message from the lead's own records
      (_shared/welcome-pack-vars.ts), never taken from the caller.
   ⛔ NOT COLD, NOT MARKETING: a message to a paying client about what they bought. Free text carries no template, so
      the sender's cold-template rules (isColdOutreachTemplate) never see it; the number-health RED pause lives only in
      the outreach queue, which this never enters.
   Pure, no Deno: imported by the edge function (relative path, explicit .ts) and the screen.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { GBP_MANAGER_EMAIL } from './findableOffer.ts';
import { windowOpenAt } from './paymentLinkRoute.ts';
import { displayBusinessName, nameStyleFor } from './displayName.ts';

/** ⛔ THE SETTINGS: the Meta template's name and language. The sender's registry entry in _shared/whatsapp-send.ts
 *  (WA_TEMPLATES) must carry the same two literals — scripts/welcome-pack-send.test.ts fails if they differ.
 *  The language is the FALLBACK: when Meta's status can be read, the send uses the language Meta registered. */
export const WELCOME_PACK_TEMPLATE_NAME = 'welcome_pack_ready';
export const WELCOME_PACK_TEMPLATE_LANG = 'en_GB';
/** Registered in the sender (2026-10-29). */
export const WELCOME_PACK_TEMPLATE_WIRED = true;

/** The pack link {{3}} may carry: findable.live/w/<short code>, nothing else. */
export const isWelcomePackUrl = (u: string | null | undefined): boolean => /^https:\/\/findable\.live\/w\/[23456789abcdefghjkmnpqrstuvwxyz]{6}$/i.test(String(u ?? ''));
/** {{1}}: the first name, else "there" (the same rule as the free-text message). */
export const welcomePackGreeting = (contactName: string | null | undefined): string => (contactName ?? '').trim().split(/\s+/)[0] || 'there';

/** Paul's wording, exactly. No first name → "Hi there". */
export function welcomePackWhatsAppText(a: { contactName?: string | null; businessName: string; url: string }): string {
  const first = welcomePackGreeting(a.contactName);
  /* The SAME name style the template's {{2}} renders with (displayName.ts nameStyleFor → "identify"), so both routes read alike. */
  const business = displayBusinessName(a.businessName || '', { style: nameStyleFor(WELCOME_PACK_TEMPLATE_NAME) }) || (a.businessName || '').trim() || 'your business';
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
  /* APPROVED goes; UNKNOWN (Meta could not be asked) is attempted and Meta decides — a refusal is reported, never hidden. */
  if (f.templateStatus !== 'APPROVED' && f.templateStatus !== 'UNKNOWN') return none('template_not_approved', false);
  if (f.templateWired !== true) return none('template_not_wired', false);
  return { route: 'template', reason: 'ok_template', say: SAY.ok_template, emailFallback: false };
}
