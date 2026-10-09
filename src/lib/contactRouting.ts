/* ══ "BEST WAY TO CONTACT" — THE ONE ROUTING DECISION (2026-10-09) ═════════════════════════════════
   One pure function that every screen asks (the Call workspace, Quick Close, the Inbox composer) so they
   cannot disagree. It RECOMMENDS; it never sends, and a rep may override where the channel is available.

   ⛔ ABSENT IS NEVER A YES (CLAUDE.md §6). A channel is recommended only on positive evidence:
     · WhatsApp  — Meta confirmed a delivery to this number (whatsAppCapabilityOf = 'verified') or they replied
                   to us and the 24-hour window is open. A MOBILE NUMBER IS NOT PROOF OF WHATSAPP: an untried
                   mobile is offered as "can try", never recommended, and there is no number-checking tool here.
     · SMS       — a valid UK mobile, SMS configured, not opted out / wrong number, and the SMS gate is open
                   (smsAllowed: the rep has a logged conversation with them, or they have messaged us).
                   SMS is never assumed to arrive: delivery is only "delivered" when the carrier receipt says so.
     · Email     — a stored address that has not bounced.
     · Call      — any usable UK number. A cold prospect's default is the Twilio browser call; the WhatsApp app call
                   is a clearly labelled free alternative that needs the rep's own phone — NEVER an automatic
                   fallback in either direction (a chargeable call is never started instead of a free one).
   ⛔ NOTHING IS SENT TWICE ACROSS CHANNELS. `alreadySent` (a link already out by another channel) turns the
   others into "send again?" choices; this function never lists two channels as "send both".
   ⛔ FAILURES CHANGE THE ANSWER. A channel that just failed for this link is marked failed and the next best is
   recommended instead, with the reason — the rep reviews it and presses send; nothing resends by itself.
   ⛔ COST ONLY BREAKS TIES between channels that are both likely to land. Free WhatsApp (verified, in window)
   beats SMS; a verified WhatsApp that needs a PAID template is compared against SMS on delivery confidence first.
   Pure; relative imports with .ts only (edge-reachable). */
import { CHANNEL_COST_GBP, costWords } from './channelCosts.ts';
import { isUkColdDestination } from './ukColdDestination.ts';
import { toWhatsAppDigits } from './waNumber.ts';
import { whatsAppCapabilityOf, type WhatsAppCapabilityInput } from './whatsAppCapability.ts';

export type RouteChannel = 'whatsapp' | 'sms' | 'email' | 'call' | 'whatsapp_app_call';
export type RoutePurpose = 'link' | 'message' | 'call';

export interface RoutingFacts extends WhatsAppCapabilityInput {
  phone: string | null;
  country?: string | null;
  email: string | null;
  /** The address has bounced (resend-webhook). */
  emailBounced?: boolean;
  /** contact_suppressions: opted out (all channels) / marked a wrong number (phone channels). */
  optedOut?: boolean;
  wrongNumber?: boolean;
  /** WhatsApp: they replied to us and Meta's 24-hour window is open right now (paymentLinkRoute.replyRouteOpen). */
  whatsappWindowOpen?: boolean;
  /** SMS gate: the rep has a logged conversation with them, or they have texted/WhatsApped us. */
  smsAllowed?: boolean;
  /** Twilio is configured on the server (the SMS/voice functions say so). */
  smsConfigured?: boolean;
  voiceConfigured?: boolean;
  /** Channels that already failed for THIS thing we are trying to deliver (a bounced email, an undelivered SMS). */
  failed?: ReadonlyArray<RouteChannel>;
  /** Channels that already carried it (so a second one is an explicit resend, not a default). */
  alreadySent?: ReadonlyArray<RouteChannel>;
}

export interface RouteOption {
  channel: RouteChannel;
  /** Can the rep use it right now? */
  available: boolean;
  recommended: boolean;
  /** One plain sentence: why it is recommended / why it is not available. */
  reason: string;
  /** Rough cost of one use, GBP (an estimate — channelCosts.ts). */
  costGbp: number;
  costWords: string;
  /** The channel already carried this / failed for it. */
  state?: 'already_sent' | 'failed';
}

export interface RouteDecision {
  purpose: RoutePurpose;
  /** The recommended channel, or null when nothing can reach them (then `action` says what to do). */
  best: RouteChannel | null;
  headline: string;
  options: RouteOption[];
  /** When nothing is usable: what the rep should do next. */
  action: 'update_details' | null;
}

export const ROUTE_LABEL: Record<RouteChannel, string> = {
  whatsapp: 'WhatsApp', sms: 'SMS', email: 'Email', call: 'Call in browser', whatsapp_app_call: 'Call on WhatsApp (your phone)',
};

type Phone = { digits: string | null; ukMobile: boolean; uk: boolean };
function phoneOf(f: RoutingFacts): Phone {
  const digits = f.phone ? toWhatsAppDigits(f.phone, f.country ?? null) : null;
  return { digits, ukMobile: isUkColdDestination(digits), uk: !!digits && /^44[1-9]\d{8,9}$/.test(digits) };
}

function option(channel: RouteChannel, available: boolean, reason: string, cost: number, f: RoutingFacts): RouteOption {
  const state = f.failed?.includes(channel) ? 'failed' : f.alreadySent?.includes(channel) ? 'already_sent' : undefined;
  const unit = channel === 'call' ? ' a minute' : channel === 'sms' ? ' a text' : '';
  return { channel, available, recommended: false, reason, costGbp: cost, costWords: cost > 0 ? costWords(cost) + unit : costWords(cost), ...(state ? { state } : {}) };
}

export function decideContactRoute(f: RoutingFacts, purpose: RoutePurpose = 'link'): RouteDecision {
  const p = phoneOf(f);
  const phoneBlocked = !!f.optedOut || !!f.wrongNumber;
  const wa = whatsAppCapabilityOf(f);
  const emailOk = !!(f.email && f.email.includes('@')) && !f.emailBounced && !f.optedOut;

  /* ── per channel: available? and why ───────────────────────────────────────────────────────────── */
  const whatsappOk = !phoneBlocked && p.ukMobile && wa !== 'not_on_whatsapp' && wa !== 'not_mobile';
  const whatsappProven = whatsappOk && (wa === 'verified' || f.whatsappWindowOpen === true);
  const waOption = option('whatsapp', whatsappOk,
    phoneBlocked ? 'They asked not to be contacted, or the number is marked wrong.'
      : !p.digits ? 'No usable phone number.'
      : wa === 'not_on_whatsapp' ? 'Meta rejected a message to this number — it is not on WhatsApp.'
      : !p.ukMobile ? 'Not a UK mobile (cold WhatsApp is UK mobiles only).'
      : f.whatsappWindowOpen ? 'They replied on WhatsApp — a free reply is open.'
      : wa === 'verified' ? 'WhatsApp is confirmed for this number (a message was delivered).'
      : 'A mobile — WhatsApp is not confirmed. You can try it, but it may not arrive.',
    f.whatsappWindowOpen ? CHANNEL_COST_GBP.whatsapp_service : CHANNEL_COST_GBP.whatsapp_utility, f);

  const smsGateOpen = f.smsAllowed === true;
  const smsOk = !phoneBlocked && p.ukMobile && f.smsConfigured !== false && smsGateOpen;
  const smsOption = option('sms', smsOk,
    phoneBlocked ? 'They asked not to be contacted, or the number is marked wrong.'
      : !p.digits ? 'No usable phone number.'
      : !p.ukMobile ? 'SMS goes to UK mobiles only.'
      : f.smsConfigured === false ? 'SMS is not set up yet.'
      : !smsGateOpen ? 'SMS opens once you have spoken to them (log the call) or they have messaged us.'
      : 'A UK mobile — a text usually arrives within seconds, but delivery is only confirmed when the carrier says so.',
    CHANNEL_COST_GBP.sms, f);

  const emailOption = option('email', emailOk,
    f.optedOut ? 'They asked not to be contacted.'
      : !f.email ? 'No email address on file.'
      : f.emailBounced ? 'That address bounced.'
      : 'An email address is on file.',
    CHANNEL_COST_GBP.email, f);

  const callOk = !phoneBlocked && p.uk && f.voiceConfigured !== false;
  const callOption = option('call', callOk,
    phoneBlocked ? 'They asked not to be contacted, or the number is marked wrong.'
      : !p.uk ? 'No usable UK phone number to call.'
      : f.voiceConfigured === false ? 'Calling is not set up yet.'
      : 'Calls from your browser — nothing to install, not recorded.',
    p.ukMobile ? CHANNEL_COST_GBP.call_mobile : CHANNEL_COST_GBP.call_landline, f);

  const appCallOk = !phoneBlocked && p.ukMobile && wa !== 'not_on_whatsapp';
  const appCall = option('whatsapp_app_call', appCallOk,
    appCallOk ? 'Free, from your own phone — only works if they have WhatsApp. Never used automatically.' : 'Needs a UK mobile that has WhatsApp.', 0, f);

  /* ── the recommendation, in priority order, per purpose ───────────────────────────────────────── */
  let order: RouteChannel[];
  if (purpose === 'call') order = ['call', 'whatsapp_app_call'];
  else if (purpose === 'message') order = ['whatsapp', 'sms', 'email'];
  else order = ['whatsapp', 'sms', 'email', 'call']; // 'link': a landline-only prospect is offered a call, not a link

  const all: Record<RouteChannel, RouteOption> = { whatsapp: waOption, sms: smsOption, email: emailOption, call: callOption, whatsapp_app_call: appCall };

  // WhatsApp only wins when there is PROOF; an untried mobile is available but not recommended.
  const recommendable = (c: RouteChannel): boolean => {
    const o = all[c];
    if (!o.available || o.state === 'failed') return false;
    if (c === 'whatsapp') return whatsappProven;
    if (c === 'whatsapp_app_call') return false; // never the default; always the labelled alternative
    return true;
  };
  let best = order.find(recommendable) ?? null;
  // A link already out by the best channel: do not default to a second one — name the best as a resend.
  const options = order.map((c) => ({ ...all[c] }));
  for (const o of options) o.recommended = o.channel === best;

  let headline: string;
  let action: RouteDecision['action'] = null;
  if (best) {
    const o = all[best];
    headline = o.state === 'already_sent'
      ? `Already sent by ${ROUTE_LABEL[best]} — only resend if they say it did not arrive.`
      : purpose === 'link' && best === 'call'
        ? 'Landline only — call them and read the link out, or get a mobile or email.'
        : `Best way to contact: ${ROUTE_LABEL[best]} (${o.costWords})`;
  } else if (purpose === 'link' && !p.ukMobile && p.uk && callOk) {
    best = 'call'; options.find((o) => o.channel === 'call')!.recommended = true;
    headline = 'Landline only — call them and read the link out, or get a mobile or email.';
  } else {
    action = 'update_details';
    headline = f.optedOut || f.wrongNumber ? 'Do not contact — they opted out or the number is wrong.' : 'No usable contact details — get a mobile or an email first.';
  }
  return { purpose, best, headline, options, action };
}

/** SMS gate (server and UI use this one rule): a first text only ever follows a real conversation, and an admin may
 *  always text a lead they own. Cold SMS openers do not exist. */
export function smsGateOpen(facts: { loggedConversation: boolean; inboundSms: boolean; inboundWhatsapp: boolean; isAdmin: boolean }): boolean {
  return facts.loggedConversation || facts.inboundSms || facts.inboundWhatsapp || facts.isAdmin;
}
