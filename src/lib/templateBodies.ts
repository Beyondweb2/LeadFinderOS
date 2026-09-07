/* ============================================================
   Readable WhatsApp template bodies for the SPA (Deno-free).

   WHY THIS EXISTS: the inbox reads message rows from `whatsapp_messages`, and campaign / opener
   sends land there via a DATABASE TRIGGER on `whatsapp_sends` that stores only the bracketed slug
   — e.g. `[initial_contact]` — never the real words (see supabase/functions/_shared/whatsapp-send.ts
   line ~197). The real approved copy lives in that file's WA_TEMPLATE_BODIES, but that module has
   top-level Deno.env reads, so the SPA CANNOT import it (same reason questionnaireFollowup.ts exists).

   So this file mirrors the approved bodies for DISPLAY ONLY. It changes nothing about sending — Meta
   renders what the prospect receives from its own registered template. It only decides what the
   operator reads in the Inbox for rows that were stored as a bare slug.

   ⛔ NO DRIFT: the three ACTIVE Findable templates (hook/contact/questionnaire) are re-exported from
   questionnaireFollowup.ts — one true copy. The others are replicated character-for-character from
   WA_TEMPLATE_BODIES and PINNED by scripts/template-bodies-parity.test.ts, which imports both this
   file and whatsapp-send.ts and asserts identical output for every template. If you change a body in
   whatsapp-send.ts, that test fails until you match it here.

   ⚠️ Keep this file free of imports of Deno/browser globals. It may import other Deno-free src/lib
   modules only (questionnaireFollowup.ts is the only one).
   ============================================================ */

import { hookFollowupBody, contactFollowupBody, questionnaireFollowupBody } from './questionnaireFollowup';

// ── Findable, link-bearing ────────────────────────────────────────────────
const onboardingFollowupBody = (b: string, u: string) =>
  `Hi ${b}, following up on your AI visibility report. If you'd like to go ahead, you can get set up here:

${u}

Takes about two minutes and we handle the rest. Any questions, let me know`;

const reEngageBody = (b: string, u: string) =>
  `Hi ${b}, following up on the AI visibility report we sent over. We're doing the next ten businesses at £49.99 instead of £99, in exchange for honest feedback on the work. A few quick questions and we're up and running: ${u} Happy to answer anything first if you'd rather.`;

// ── Findable, no link ─────────────────────────────────────────────────────
const initialContactBody = (b: string, _u: string) =>
  `Hi, is this the right number for ${b || 'your business'}? Cheers`;

const auditReplyBody = (b: string, u: string, trade?: string, competitors?: string) =>
  `Hi, thanks for getting back.
We asked AI tools like ChatGPT to recommend a ${trade || 'provider'} in your area, it's naming ${competitors || 'other firms'} - not ${b || 'you'}.
We ran a full report on your business for AI and SEO visibility: ${u}
We could get you showing up in those results - it's mostly stuff we handle at our end.
Want me to explain?`;

/* audit_result_hook - the outreach hook (approved 2026-09-02). Mirrors the Deno-side body in
   _shared/whatsapp-send.ts; both are DISPLAY ONLY, since Meta renders what the prospect reads.
   Only reached for a legacy row whose body was never stored - a real send stores its own text. */
const auditResultHookBody = (b: string, u: string, trade?: string, _c?: string, _first?: string, town?: string) =>
  `Hi, is this ${b || 'your business'}? We ran a free AI visibility audit for you.
When people ask ChatGPT or Google's AI for a ${trade || 'provider'} in ${town || 'your area'}, it's naming other firms, not you.
Here's your result: ${u}
More on how we can fix it, and how to get started: https://findable.live`;

/* audit_reply_warm — the WARM audit message (Meta 1509669747584736, approved 2026-09-07). It is
   audit_result_hook MINUS the "is this the right number" opening, because it only ever goes to a
   lead who has already answered the opener, so asking again reads as though we were not listening.
   ⛔ THREE VARIABLES, NOT FOUR, AND THE BUSINESS NAME IS NOT ONE OF THEM. Registered at Meta as
   {{1}} trade, {{2}} town, {{3}} audit link. audit_result_hook's {{1}} is the business name; this
   body never says it. Copying the hook's var list across would have shifted every parameter by one
   and sent the trade where Meta expects a name.
   ⚠️ DISPLAY ONLY, like every body here — Meta renders what the prospect reads from its own
   registered copy. This decides what the OPERATOR sees in the Inbox transcript. */
const auditReplyWarmBody = (_b: string, u: string, trade?: string, _c?: string, _first?: string, town?: string) =>
  `We ran a free AI visibility audit for you. When people ask ChatGPT or Google's AI for a ${trade || 'provider'} in ${town || 'your area'}, it's naming other firms, not you.
Here's your result: ${u}
More on how we can fix it, and how to get started: https://findable.live`;

const bookCallBody = (b: string, _u: string) =>
  `Hi ${b},
Paul here from Findable.

You mentioned a call would work - what time suits you best?

Happy to fit around you.`;

const paymentRecievedBody = (b: string, _u: string) =>
  `Hi ${b}, payment received, thanks. You're in.

We'll get started and be back to you within a few days to get your Google profile sorted and share your page plan.

Anything in the meantime, just reply here.`;

// ── Legacy barber / website-generation product line (link-bearing) ────────
const bookingPageIntroBody = (b: string, u: string) =>
  `Hi, I came across ${b || 'your business'} and built you an online booking page so customers can book appointments directly

Here it is: ${u}

You can edit it yourself - services, prices, hours

Have a look and let me know what you think`;

const noWebsiteBody = (b: string, u: string) =>
  `Hi, I noticed ${b || 'your business'} doesn't have a website, so I built you one - it's live and free. You can edit it yourself: photos, text, services, colours.

Here it is: ${u}

It's yours to keep, free - let me know what you think.`;

const poorWebsiteBody = (b: string, u: string) =>
  `Hi ${b || 'your business'}, here's an updated version of your website - it's free 🙂\n\n${u}\n\nIt's fresh, mobile-friendly and easy to customise yourself - photos, text and colours in a couple of taps.\n\nHave a look and let me know what you think.`;

const bookingSwitchBarbersBody = (b: string, u: string) =>
  `Hi ${b || 'your business'}, tired of paying commission on your own clients? I've set you up with online booking and your own website - no commission, keep more of what you earn:\n\n${u}\n\nSMS reminders and your own domain included, flat £29.99 a month. Have a look and let me know what you think.`;

const barberFreshaBooksyBody = (b: string, u: string) =>
  `made you this 👇\n${u}\n\nHey ${b || 'your business'}, right now people can only book you through fresha/booksy - who take a cut of every booking and keep your customers on their app, not yours (bit cheeky). That's your shops own booking site up there - fully yours to customize too - colours, photos, prices, whatever you fancy. free if you want it, no stress if not`;

/** DISPLAY-ONLY body renderers keyed by template name. Same signature as whatsapp-send.ts's
 *  WA_TEMPLATE_BODIES so the parity test can compare them one-to-one. */
export const READABLE_TEMPLATE_BODIES: Record<
  string,
  (businessName: string, claimUrl: string, trade?: string, competitors?: string, contactFirstName?: string, town?: string) => string
> = {
  book_call: bookCallBody,
  re_engage: reEngageBody,
  payment_recieved: paymentRecievedBody,
  questionnaire_followup: (b, _u, _t, _c, first) => questionnaireFollowupBody(first ?? '', b),
  hook_followup: (b, _u, _t, _c, first) => hookFollowupBody(first ?? '', b),
  contact_followup: (b) => contactFollowupBody(b),
  onboarding_followup: onboardingFollowupBody,
  booking_page_intro: bookingPageIntroBody,
  no_website_barbers: noWebsiteBody,
  barber_poor_website: poorWebsiteBody,
  booking_switch_barbers: bookingSwitchBarbersBody,
  barber_fresha_booksy: barberFreshaBooksyBody,
  initial_contact: initialContactBody,
  audit_reply: auditReplyBody,
  audit_result_hook: auditResultHookBody,
  audit_reply_warm: auditReplyWarmBody,
};

export interface ReadableBodyOpts {
  businessName?: string | null;
  url?: string | null;
  trade?: string | null;
  competitors?: string | null;
  firstName?: string | null;
  /** audit_result_hook's {{3}}. Only this body reads it; the rest ignore the extra argument. */
  town?: string | null;
}

/** True when a stored body is NOT real filled text: empty, a bracketed slug like
 *  `[initial_contact]`, or a bare snake_case template name. These are the rows written by the
 *  whatsapp_sends DB trigger (or a template with no renderer at send time). */
export function isPlaceholderBody(body: string | null | undefined): boolean {
  const b = (body ?? '').trim();
  if (!b) return true;
  if (/^\[[a-z0-9_]+\]$/.test(b)) return true;             // "[initial_contact]"
  if (/^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(b)) return true;   // "initial_contact"
  return false;
}

/** The readable text for a message. If the stored body is already real filled text, it is
 *  returned unchanged. Otherwise the approved template copy is rendered from the template name +
 *  what the caller knows (business name, and — where the template uses them — link / trade /
 *  competitors / first name). Returns '' if there is nothing to show (caller falls back to a label). */
export function readableTemplateBody(
  body: string | null | undefined,
  templateName: string | null | undefined,
  opts: ReadableBodyOpts = {},
): string {
  if (!isPlaceholderBody(body)) return (body ?? '').trim();
  const fn = templateName ? READABLE_TEMPLATE_BODIES[templateName] : undefined;
  if (!fn) return '';
  return fn(
    opts.businessName ?? '',
    opts.url ?? '',
    opts.trade ?? undefined,
    opts.competitors ?? undefined,
    opts.firstName ?? undefined,
    opts.town ?? undefined,
  ).trim();
}
