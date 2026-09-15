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
/* competitor_hook's body prints the SAME plural the parameter carries — see its note below. */
import { pluraliseTrade } from './templateVars';
import { transcriptBusinessName } from './displayName';

// ── Findable, link-bearing ────────────────────────────────────────────────
const onboardingFollowupBody = (b: string, u: string) =>
  `Hi ${b}, following up on your AI visibility report. If you'd like to go ahead, you can get set up here:

${u}

Takes about two minutes and we handle the rest. Any questions, let me know`;

/* ⛔ DISPLAY ONLY — META RENDERS THE REAL MESSAGE FROM ITS OWN REGISTERED COPY. Editing these
   strings changes what the OPERATOR reads in the Inbox transcript and nothing a prospect receives.

   🔴 TWO BODIES, BECAUSE THERE ARE TWO TEMPLATES AND THE OLD ONE'S HISTORY IS REAL.
   `re_engage` was replaced at Meta by `re_engage_49` on 2026-09-12, but 21 rows in
   whatsapp_messages were sent under the OLD template and genuinely contained the OLD words. The
   transcript for those rows must keep showing what was actually sent — mapping them onto the new
   template's copy would falsify the record to save a function.

   ⚠️ AND I BROKE THAT ONCE ALREADY: on 2026-09-12 I rewrote this single body to the £99 wording, a
   version Meta was never given, so those 21 historic rows started displaying a message nobody
   received. The £49.99 text below is restored verbatim from commit 036cfc4f because it is what the
   prospects were actually sent. Do not "update" it — it is history, not copy. */
const reEngageBody = (b: string, u: string) =>
  `Hi ${b}, following up on the AI visibility report we sent over. We're doing the next ten businesses at £49.99 instead of £99, in exchange for honest feedback on the work. A few quick questions and we're up and running: ${u} Happy to answer anything first if you'd rather.`;

/* re_engage_49 — the APPROVED body, pasted by Paul from WhatsApp Manager 2026-09-12 and mirrored
   here character for character. English, Marketing, no header, ONE variable: {{1}} business name.
   ⚠️ It held an explicit "copy not stored" placeholder for a few hours rather than a plausible
   guess, which is the right state for an unknown body — the Inbox showing nothing beats the Inbox
   showing a confident transcript of a message nobody sent. */
const reEngage49Body = (b: string, _u: string) =>
  `Hi ${b || 'your business'}, it's Paul from Findable.

Where did we get to with this? Happy to pick it back up, or leave it if now's not the time.`;

// ── Findable, no link ─────────────────────────────────────────────────────
const initialContactBody = (b: string, _u: string) =>
  `Hi, is this the right number for ${b || 'your business'}? Cheers`;

const auditReplyBody = (b: string, u: string, trade?: string, competitors?: string) =>
  `Hi, thanks for getting back.
We asked AI tools like ChatGPT to recommend a ${trade || 'provider'} in your area, it's naming ${competitors || 'other firms'} - not ${b || 'you'}.
We ran a full report on your business for AI and SEO visibility: ${u}
We could get you showing up in those results - it's mostly stuff we handle at our end.
Want me to explain?`;

/* 🔴 audit_result_hook — HISTORY, NOT COPY. This is the body approved on 2026-09-02 and it is what
   the 135 rows sent under that name actually contained. The template was replaced on 2026-09-12 by
   `video_template`, which carries DIFFERENT approved words (below) and a video header.
   ⛔ I ASSUMED THESE TWO SHARED A BODY AND WROTE THAT DOWN AS A FACT. The rename looked like a
   rename plus a header, so one entry was made to serve both names. Paul then supplied the approved
   copy and it is a different message entirely. The lesson is the file's own rule: a body is the
   record of a send, so it may only ever be written from the registered copy, never inferred from
   what a template used to say. Do not "update" this one — it is what those 135 prospects read. */
const auditResultHookBody = (b: string, u: string, trade?: string, _c?: string, _first?: string, town?: string) =>
  `Hi, is this ${b || 'your business'}? We ran a free AI visibility audit for you.
When people ask ChatGPT or Google's AI for a ${trade || 'provider'} in ${town || 'your area'}, it's naming other firms, not you.
Here's your result: ${u}
More on how we can fix it, and how to get started: https://findable.live`;

/* video_template — the APPROVED body, pasted by Paul from WhatsApp Manager 2026-09-12 and mirrored
   here character for character. English, Marketing, VIDEO header, four variables:
   {{1}} business name, {{2}} trade (bare singular lowercase noun), {{3}} town, {{4}} audit link.
   ⚠️ THE ASTERISKS AND THE EMOJI ARE PART OF THE APPROVED COPY. `*Your free AI visibility audit*`
   is WhatsApp bold markup, not decoration, and 👋 📋 🌐 are in the registered text. Stripping any
   of them makes the operator's transcript differ from what the prospect received.
   ⚠️ DISPLAY ONLY, like every body here — Meta renders the real message from its own registered
   copy. The video header itself is NOT part of this string; it is a payload component built in
   _shared/whatsapp-send.ts from VIDEO_TEMPLATE_HEADER_URL. */
const videoTemplateBody = (b: string, u: string, trade?: string, _c?: string, _first?: string, town?: string) =>
  `Hi ${b || 'your business'} 👋

I ran a quick AI visibility check on your business and found something you'll probably want to see.

When people ask ChatGPT or Gemini for a ${trade || 'provider'} in ${town || 'your area'}, you're not showing up as often as you should be.

I've put the full findings together for you here:

📋 *Your free AI visibility audit*
${u}

🌐 https://findable.live/

It's completely free to look through, no signup or obligation.

Have a read, and if you want I'll explain what's causing it and how we'd fix it.

Paul, Findable.`;

/* competitor_hook - APPROVED AT META 2026-09-14, and this is the REGISTERED body, pasted by Paul
   from WhatsApp Manager. Six variables: {{1}} business name, {{2}} trade as a LOWERCASE PLURAL,
   {{3}} {{4}} {{5}} three competitor names, {{6}} audit link - unchanged from submission, nothing
   renumbered.
   🔴 THE BODY CHANGED DURING SUBMISSION AND THIS FILE'S OWN RULE IS WHY IT WAS REPLACED RATHER THAN
   KEPT: a body here is the record of what a prospect actually READ, so ours was never the authority.
   Three differences from what we submitted, all pasted from Manager:
     · "No signup or obligation." is GONE
     · the "🌐 https://findable.live/" line and the closing question are NEW
     · the sign-off is "Paul." not "Paul, Findable"
   ⛔ Do not restore any of ours. If Meta's reviewer edits so much as a line break in a future
   version, paste theirs over this - keeping ours because it is what we asked for is exactly the
   failure this rule exists to stop, and it is the same one that falsified 21 re_engage transcripts.
   ⚠️ THE TRADE IS PLURALISED HERE TOO, and that is not decoration. Every other body in this map
   prints the RAW stored trade while the send prints the normalised one, so a video_template
   transcript reads "for a Plumbers" where the prospect received "for a plumber" - a small, existing
   lie in the operator's record. This one renders exactly what the parameter carries; the fallback
   to the raw value is display-only and can never reach a send, because the payload builder refuses
   a value pluraliseTrade rejects.
   ⚠️ The video header is NOT in this string - it is a payload component built from
   VIDEO_TEMPLATE_HEADER_URL, because a header is structure and this is text. */
const competitorHookBody = (b: string, u: string, trade?: string, competitors?: string) => {
  const t = pluraliseTrade(trade);
  return `Hi ${b || "your business"},

I asked ChatGPT and Gemini to find ${t.ok ? t.value : (trade || "businesses")} in your area.

They came back with businesses including ${competitors || "other firms"}.

I checked whether your business was being mentioned too.

📋 Here's your free AI visibility audit:
${u}

It shows exactly what AI sees about your business and where you stand.

🌐 https://findable.live/

Find out how we get you into those searches on our website, or I can explain more here if you'd like?

Paul.`;
};

/* audit_reply_warm — the WARM audit message (Meta 1509669747584736, approved 2026-09-07). It is
   video_template MINUS the "is this the right number" opening, because it only ever goes to a
   lead who has already answered the opener, so asking again reads as though we were not listening.
   ⛔ THREE VARIABLES, NOT FOUR, AND THE BUSINESS NAME IS NOT ONE OF THEM. Registered at Meta as
   {{1}} trade, {{2}} town, {{3}} audit link. video_template's {{1}} is the business name; this
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
  re_engage_49: reEngage49Body,
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
  video_template: videoTemplateBody,
  competitor_hook: competitorHookBody,
  /* The 135 rows sent before the 2026-09-12 rename carry the old name and the SAME words. */
  audit_result_hook: auditResultHookBody,
  audit_reply_warm: auditReplyWarmBody,
};

export interface ReadableBodyOpts {
  businessName?: string | null;
  url?: string | null;
  trade?: string | null;
  competitors?: string | null;
  firstName?: string | null;
  /** video_template's {{3}}. Only this body reads it; the rest ignore the extra argument. */
  town?: string | null;
  /* ⛔ WHEN THE MESSAGE WAS SENT — required for the greeting name to be honest.
     The greeting is shortened at send time (src/lib/displayName.ts), but this function re-renders a
     placeholder-bodied row from the lead's name as it is TODAY. Applying the rule blindly would
     rewrite every message sent before it existed to say something the prospect never read — the
     same fault as editing re_engage's historical body to match the registry (CLAUDE.md 19), in the
     other direction. An absent or unreadable timestamp is treated as OLD and keeps the full name. */
  sentAt?: string | null;
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
  /* ⛔ THE BODY LOOKUP DOES **NOT** CANONICALISE, and that is the opposite of the label lookup on
     purpose. A label answers "what kind of message is this" — a renamed template is still the
     same kind. A BODY is the words that were actually sent, and a `re_engage` row from August did
     not contain re_engage_49's copy. Canonicalising here would rewrite history to fit the
     registry. Old keys therefore stay in READABLE_TEMPLATE_BODIES for as long as rows carry them.
     ⚠️ video_template is the exception that needs no exception: its body is unchanged by the
     rename (only a video header was added), so one entry serves both names — which is why
     `audit_result_hook` maps to the same function below. */
  const fn = templateName ? READABLE_TEMPLATE_BODIES[templateName] : undefined;
  if (!fn) return '';
  return fn(
    transcriptBusinessName(opts.businessName, opts.sentAt, { town: opts.town }),
    opts.url ?? '',
    opts.trade ?? undefined,
    opts.competitors ?? undefined,
    opts.firstName ?? undefined,
    opts.town ?? undefined,
  ).trim();
}
