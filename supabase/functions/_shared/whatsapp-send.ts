// Shared WhatsApp Cloud API send mechanism — extracted VERBATIM from
// process-whatsapp-queue so the Inbox reply sender reuses the exact same proven
// transport (Graph POST), phone normalisation, test-mode gate and claim-template
// shape. process-whatsapp-queue itself is intentionally NOT modified in this build;
// it can adopt this helper in a later cleanup.

export const GRAPH_VERSION = "v21.0";

/** UK phone → E.164 digits (no '+', as Meta wants). Mirrors send-reminders /
 *  process-whatsapp-queue exactly. Returns null when nothing usable. */
export function toWhatsAppNumber(raw: string, country?: string | null): string | null {
  let s = (raw || "").replace(/[^\d+]/g, "");
  if (!s) return null;
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (s.startsWith("+")) return s.slice(1).replace(/\D/g, "") || null;
  const cc = (country || "UK").toUpperCase();
  if (s.startsWith("0")) {
    if (cc === "UK" || cc === "GB") return "44" + s.slice(1);
    return s.replace(/\D/g, "");
  }
  return s.replace(/\D/g, "") || null;
}

/** Resolve the WhatsApp env + test/live gate, IDENTICAL to process-whatsapp-queue:
 *  live sends happen ONLY when WHATSAPP_TEST_MODE === "off" AND both secrets exist. */
export function resolveWhatsAppEnv() {
  const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN") ?? "";
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID") ?? "";
  const testMode = (Deno.env.get("WHATSAPP_TEST_MODE") ?? "on").toLowerCase() !== "off";
  const live = !testMode && !!accessToken && !!phoneNumberId;
  return { accessToken, phoneNumberId, testMode, live };
}

// A template's body variables, IN ORDER. 'name' = the business/barber name, 'url' =
// the claim/site link. Each template declares its own order so a new template with a
// different variable layout (e.g. URL first) can't be silently sent with the values
// swapped — the builder fills {{1}},{{2}},… strictly in this order.
// 'onboarding_url' is DISTINCT from 'url' on purpose. 'url' means the claim/site link and the
// campaign path gates those templates on the lead having a share_token; the onboarding link is built
// from the lead id alone and must NOT be blocked by a missing site. Reusing 'url' would have made
// onboarding_followup unsendable to exactly the leads it is for.
export type TemplateVar = "name" | "url" | "trade" | "competitors" | "onboarding_url" | "contact_first_name" | "town" | "audit_url";

/** Approved template allowlist — mirrors process-whatsapp-queue. `vars` is the BODY
 *  variable order for THIS template ({{1}} = vars[0], {{2}} = vars[1], …). The four
 *  original templates are {{1}}=name, {{2}}=url; keep that order for them (they're
 *  live). `lang` MUST match the template's registered language in Meta exactly. */
export const WA_TEMPLATES: Record<string, { lang: string; vars: TemplateVar[] }> = {
  booking_page_intro: { lang: "en", vars: ["name", "url"] },
  no_website_barbers: { lang: "en", vars: ["name", "url"] },
  barber_poor_website: { lang: "en", vars: ["name", "url"] },
  booking_switch_barbers: { lang: "en", vars: ["name", "url"] },
  // NEW: {{1}} = site URL, {{2}} = business name (the REVERSE of the others). "In
  // review" at Meta — sends fail until approved; the code is correct on approval.
  barber_fresha_booksy: { lang: "en", vars: ["url", "name"] },
  // Opener — ONE variable: {{1}} = business name. NO url. vars MUST stay ["name"] so
  // templateBodyParams sends exactly one param (Meta rejects a param-count mismatch).
  initial_contact: { lang: "en", vars: ["name"] },
  // Reply-to-a-reply: 4 vars — {{1}} trade, {{2}} competitors, {{3}} business name, {{4}} report link.
  // Vars resolved server-side per-lead from the lead's own completed audit (see resolveAuditReplyVars).
  audit_reply: { lang: "en", vars: ["trade", "competitors", "name", "url"] },
  // Follow-up once the 24h window has closed: points a warm lead at the onboarding flow.
  // {{1}} business name, {{2}} that lead's onboarding URL. Vars resolved server-side per-lead by
  // resolveOnboardingFollowupVars — never from a caller-supplied link.
  onboarding_followup: { lang: "en", vars: ["name", "onboarding_url"] },
  // Follow-up to a warm lead who said a call works and then went quiet. ONE variable:
  // {{1}} = business name. No url, so nothing to resolve and nothing to gate on a site.
  book_call: { lang: "en", vars: ["name"] },
  /* Re-engage a lead who went quiet, pointing at the founder offer. TWO variables:
     {{1}} = business name, {{2}} = that lead's onboarding URL.
     ⛔ CORRECTED FROM ONE VARIABLE 2026-08-11, against a real Meta rejection: #132000
     "number of localizable_params (1) does not match the expected number of params (2)". The
     one-variable guess was flagged as a guess when it shipped and this is the flag being cashed —
     the registration is the authority, not the shape of a similar template.
     ⚠️ `onboarding_url`, NOT `url`. They are distinct on purpose: `url` means the claim/site link and
     gates the send on the lead having a generated site, which re_engage must not require. The
     onboarding link is built from the lead id alone, resolved per-lead by
     resolveOnboardingFollowupVars, which REFUSES rather than returning a partial. */
  re_engage: { lang: "en", vars: ["name", "onboarding_url"] },
  /* ⛔ THE NAME IS MISSPELLED AT META AND THAT SPELLING IS LOAD-BEARING: "recieved", i before e.
     Meta matches the registered name exactly, so "payment_received" would fail template-not-found.
     Do NOT "fix" it here — it can only be corrected by re-registering at Meta and changing both
     copies of this map in the same commit.
     Payment confirmation, sent by stripe-webhook the moment a Findable payment lands. ONE variable:
     {{1}} = business name. No url, so nothing to resolve and nothing to gate on a site.
     ⚠️ NOT IN THE SPA's WHATSAPP_TEMPLATES PICKER, deliberately. It is triggered by a payment, not
     chosen by an operator, and offering it in the bulk/lead picker would let a confirmation be sent
     to somebody who has not paid. It lives here (and in the queue's mirror) only because the two
     registries are asserted identical by scripts/re-engage-vars.test.ts. */
  payment_recieved: { lang: "en", vars: ["name"] },
  /* Nudge to a lead who submitted the pre-pay questionnaire and stalled at payment. TWO variables:
     {{1}} = the OWNER's first name (first word of outreach_leads.contact_name — a PERSON, the only
     template that greets one), {{2}} = business name. Registered at Meta by Paul 2026-08-17 as
     Marketing, locale "en" (plain English — confirmed by Paul against Manager 2026-08-22; it was
     briefly coded as en_GB, which would have silently failed to send). `lang` must match Meta
     exactly — do not "correct" it to en_GB.
     ⛔ MANUAL SENDS ONLY, ONE PER LEAD, NO OVERRIDE. send-whatsapp-message enforces pitchEverSent
     with no allow_resend escape — unlike audit_reply, a second "just the payment step left" nudge
     to the same person is pressure, never service. Paul's rule 2026-08-17. */
  questionnaire_followup: { lang: "en", vars: ["contact_first_name", "name"] },
  /* Report follow-up — MANUAL sends via send-whatsapp-message ONLY, never queued (absent from the
     SPA picker). Sent to a lead who received their audit_reply report and went quiet. Same shape as
     questionnaire_followup: {{1}} = the OWNER's first name (first word of outreach_leads.contact_name),
     {{2}} = business name. Registered at Meta by Paul 2026-08-22 as Marketing, locale "en" (plain
     English — NOT en_GB). `lang` must match Meta exactly.
     ⛔ ONE PER LEAD, NO OVERRIDE. Because its vars include "contact_first_name", send-whatsapp-message's
     generic needsContactName branch gives it pitchEverSent (keyed by THIS template name) with no
     allow_resend escape — a second report nudge is pressure, never service. */
  hook_followup: { lang: "en", vars: ["contact_first_name", "name"] },
  /* Earlier-stage nudge — sent to a lead who got the initial_contact opener and NEVER replied
     (before any report). RE-EDITED + RE-APPROVED AT META 2026-08-22 to "Hi, did you get my last
     message? Paul" — ZERO variables now (the {{1}} business name is gone), so vars is []. It MUST
     stay [] to match Meta, or the send is rejected #132000 (param count mismatch); the mirror in
     process-whatsapp-queue carries the same []. locale "en" (NOT en_GB) — `lang` must match Meta.
     ⛔ ONE PER LEAD. send-whatsapp-message enforces pitchEverSent for it in the name-only branch. */
  contact_followup: { lang: "en", vars: [] },
  /* ⛔ THE FREE-CHECK RESULT. Submitted to Meta 2026-09-02, IN REVIEW at the time of writing.
     {{1}} business name · {{2}} trade · {{3}} town · {{4}} report link · {{5}} onboarding link.
     ⚠️ REGISTERED HERE BEFORE APPROVAL ON PURPOSE. If the name were absent, the send would fail
     `unknown_template` in OUR code and approval alone would not start it — Paul's requirement is
     that it begins sending with no code change. Registered, the send reaches Meta, which refuses an
     unapproved template with its own error; free-check-result.ts reports that as a pending state
     and still sends the email. The day Meta approves it, the same call succeeds. Nothing to flip.
     ⚠️ NOT in TEMPLATES_NEEDING_REAL_NAME: the caller already refuses a nameless lead before it
     gets here, and this one is sent to someone who typed their own business name into a form. */
  free_check_result: { lang: "en", vars: ["name", "trade", "town", "audit_url", "onboarding_url"] },
};
export const WA_DEFAULT_TEMPLATE = "booking_page_intro";

/* TEMPLATES WHOSE COPY BREAKS WITHOUT A REAL NAME.
   The "name" variable normally degrades to "your business", which reads acceptably mid-sentence
   ("is this the right number for your business?"). It does NOT read acceptably as a salutation:
   "Hi your business, Paul here from findable" is worse than sending nothing, because it is
   visibly automated in a message whose whole purpose is to sound like a person. For these,
   an empty name refuses rather than degrades. */
export const TEMPLATES_NEEDING_REAL_NAME = new Set(["book_call", "re_engage"]);

/* TEMPLATES WHOSE contact_first_name GREETING MAY DEGRADE TO "there".
   The mirror of TEMPLATES_NEEDING_REAL_NAME, one level down: for most personal-greeting templates a
   blank first name refuses (questionnaire_followup — the operator is expected to know who they are
   nudging about a payment). But hook_followup goes to cold report leads we often have no name for,
   and "Hi there, following up on the report I sent for <business>" reads perfectly — so a blank name
   is ALLOWED and {{1}} falls back to "there" (matching hookFollowupBody's own `firstName || "there"`,
   so the Meta param and the stored transcript agree). Paul's call 2026-08-22.
   ⛔ questionnaire_followup is deliberately NOT in this set — its blank-name refusal is unchanged. */
export const TEMPLATES_ALLOWING_NO_FIRST_NAME = new Set(["hook_followup"]);
/** The value sent for {{1}} when a name is absent but allowed — same fallback the body renderer uses. */
const NO_FIRST_NAME_FALLBACK = "there";

/* firstNameFrom + the questionnaire_followup body live in src/lib/questionnaireFollowup.ts — a
   Deno-free module the SPA's preview imports too, so what the operator confirms and what this file
   sends cannot drift. Re-exported so existing edge imports keep one door. */
import { firstNameFrom, questionnaireFollowupBody, hookFollowupBody, contactFollowupBody } from "../../../src/lib/questionnaireFollowup.ts";
export { firstNameFrom, questionnaireFollowupBody, hookFollowupBody, contactFollowupBody };

// Human-readable copies of the Meta-registered template BODIES, purely so the Inbox
// can show what the barber actually receives (the real wording lives in Meta and is
// never returned by the API). These are DISPLAY-ONLY — the actual send still uses the
// approved template + {{1}}/{{2}} variables. ⚠️ Keep these in sync with the exact Meta
// template text; drift affects only the preview, never what is sent.
const bookingPageIntroBody = (b: string, u: string) =>
  `Hi, I came across ${b || "your business"} and built you an online booking page so customers can book appointments directly

Here it is: ${u}

You can edit it yourself - services, prices, hours

Have a look and let me know what you think`;

const noWebsiteBody = (b: string, u: string) =>
  `Hi, I noticed ${b || "your business"} doesn't have a website, so I built you one - it's live and free. You can edit it yourself: photos, text, services, colours.

Here it is: ${u}

It's yours to keep, free - let me know what you think.`;

const poorWebsiteBody = (b: string, u: string) =>
  `Hi ${b || "your business"}, here's an updated version of your website - it's free 🙂\n\n${u}\n\nIt's fresh, mobile-friendly and easy to customise yourself - photos, text and colours in a couple of taps.\n\nHave a look and let me know what you think.`;

const bookingSwitchBarbersBody = (b: string, u: string) =>
  `Hi ${b || "your business"}, tired of paying commission on your own clients? I've set you up with online booking and your own website - no commission, keep more of what you earn:\n\n${u}\n\nSMS reminders and your own domain included, flat £29.99 a month. Have a look and let me know what you think.`;

// NOTE: this template's body leads with the URL (its {{1}}), then the name ({{2}}) —
// matching its reversed `vars: ["url", "name"]`. The (b, u) arg order of the render
// fn is unchanged; only where they appear in the copy differs.
const barberFreshaBooksyBody = (b: string, u: string) =>
  `made you this 👇\n${u}\n\nHey ${b || "your business"}, right now people can only book you through fresha/booksy - who take a cut of every booking and keep your customers on their app, not yours (bit cheeky). That's your shops own booking site up there - fully yours to customize too - colours, photos, prices, whatever you fancy. free if you want it, no stress if not`;

// Opener — ONE variable ({{1}} = business name). The claimUrl arg is ignored (this template
// has no url). Display-only preview; the real send uses Meta's body + the single name param.
const initialContactBody = (b: string, _u: string) =>
  `Hi, is this the right number for ${b || "your business"}? Cheers`;

// audit_reply — reply to a lead who replied. b={{3}} business, u={{4}} report link,
// trade={{1}}, competitors={{2}}. Keep in sync with the Meta-registered audit_reply body.
const auditReplyBody = (b: string, u: string, trade?: string, competitors?: string) =>
  `Hi, thanks for getting back.
We asked AI tools like ChatGPT to recommend a ${trade || "provider"} in your area, it's naming ${competitors || "other firms"} - not ${b || "you"}.
We ran a full report on your business for AI and SEO visibility: ${u}
We could get you showing up in those results - it's mostly stuff we handle at our end.
Want me to explain?`;

/* onboarding_followup - the APPROVED wording, supplied 2026-07-28. Display-only, like every body
   in this map: Meta renders what the customer actually reads from the approved template, so the
   whitespace here cannot affect a send. It only decides what the Inbox thread shows for a
   follow-up sent from the Inbox. (A campaign send displays via the whatsapp_sends trigger instead,
   which shows "[onboarding_followup]" until that separate work is done.)
   No "there" fallback on the name: resolveOnboardingFollowupVars refuses outright when the lead has
   no business name, so an empty {{1}} cannot reach this function. */
const onboardingFollowupBody = (b: string, u: string) =>
  `Hi ${b}, following up on your AI visibility report. If you'd like to go ahead, you can get set up here:

${u}

Takes about two minutes and we handle the rest. Any questions, let me know`;

/* book_call - the wording Meta approved, line breaks included, so the Inbox preview matches what
   the customer actually reads. Display-only like every body here: Meta renders the real message from
   its own copy of the template, so nothing in this string can change a send.
   Trailing spaces shown in the Meta editor are not reproduced - invisible, cannot affect the send,
   and any linter would strip them. No link, so the claimUrl arg is unused.

   NAME NOTE: `book_call` also exists as a next-action label in LeadDetailDialog (dbValue 'call').
   Different namespace - template names never mix with next-action values - but a grep for book_call
   now hits both. */
const bookCallBody = (b: string, _u: string) =>
  `Hi ${b},
Paul here from Findable.

You mentioned a call would work - what time suits you best?

Happy to fit around you.`;

/* re_engage — the wording Meta approved, supplied by Paul 2026-08-11 and reproduced exactly.
   b = {{1}} business name, u = {{2}} that lead's onboarding URL (passed in the claimUrl slot by
   every caller, same convention as onboarding_followup). Display-only: Meta renders the real message
   from its own copy, so nothing in this string can change a send — but it IS what the operator reads
   in the Inbox as a record of what went out, so it is kept character-for-character.
   ⛔ AND IT IS THE THIRD PLACE THE PRICE NOW LIVES. This body hardcodes "£49.99 instead of £99";
   FINDABLE_SETUP_PRICE_GBP is the constant, and scripts/check-cross-repo-sync.mjs enforces it
   against findable-site — but it cannot reach a string inside a Meta-registered template, exactly
   like the Stripe payment-link description in §6. Change the price and this template has to be
   re-registered at Meta BY HAND, and this copy updated with it.
   ✅ £19.99 → £49.99 ON 2026-08-12; RE-REGISTRATION AT META CONFIRMED BY PAUL 2026-08-17 — the
   registered body is the £49.99 version and re_engage is cleared for sends.
   ✅ SYNCED 2026-08-17 to the registered body Paul pasted character-for-character from WhatsApp
   Manager — including its single-paragraph shape (no line breaks). If Meta's editor actually
   shows line breaks that the paste flattened, correct THIS string from the editor, never from
   memory. */
const reEngageBody = (b: string, u: string) =>
  `Hi ${b}, following up on the AI visibility report we sent over. We're doing the next ten businesses at £49.99 instead of £99, in exchange for honest feedback on the work. A few quick questions and we're up and running: ${u} Happy to answer anything first if you'd rather.`;

/* payment_recieved — the registered body, pasted character-for-character by Paul from WhatsApp
   Manager 2026-08-17 (the first time this wording has existed anywhere in the repo). The template
   KEY keeps Meta's load-bearing misspelling; see the WA_TEMPLATES note. {{1}} = business name;
   no url, so the claimUrl arg is unused. Sent only by stripe-webhook on payment — deliberately
   absent from every operator picker. */
const paymentRecievedBody = (b: string, _u: string) =>
  `Hi ${b}, payment received, thanks. You're in.

We'll get started and be back to you within a few days to get your Google profile sorted and share your page plan.

Anything in the meantime, just reply here.`;

export const WA_TEMPLATE_BODIES: Record<string, (businessName: string, claimUrl: string, trade?: string, competitors?: string, contactFirstName?: string) => string> = {
  book_call: bookCallBody,
  re_engage: reEngageBody,
  payment_recieved: paymentRecievedBody,
  /* Body lives in src/lib/questionnaireFollowup.ts (the SPA preview imports the same function);
     this adapter maps the bodies-map calling convention onto it. */
  questionnaire_followup: (b, _u, _t, _c, first) => questionnaireFollowupBody(first ?? "", b),
  /* Same adapter shape: {{1}} first name, {{2}} business name, from the shared Deno-free module. */
  hook_followup: (b, _u, _t, _c, first) => hookFollowupBody(first ?? "", b),
  /* ONE variable: {{1}} = business name. */
  contact_followup: (b) => contactFollowupBody(b),
  onboarding_followup: onboardingFollowupBody,
  booking_page_intro: bookingPageIntroBody,
  // The "no website" template — registered in Meta as no_website_barbers (the SEND name).
  no_website_barbers: noWebsiteBody,
  // The "you have a website but here's an updated free version" angle.
  barber_poor_website: poorWebsiteBody,
  // The "switch from Booksy — no commission, £29.99/mo" angle.
  booking_switch_barbers: bookingSwitchBarbersBody,
  // The "fresha/booksy take a cut" angle — URL-first body.
  barber_fresha_booksy: barberFreshaBooksyBody,
  initial_contact: initialContactBody,
  audit_reply: auditReplyBody,
};

/** Render the display copy of a template body with its variables filled. `trade`/`competitors`
 *  are used only by audit_reply; the other (2-var) bodies ignore them. */
export function renderTemplateBody(templateName: string, businessName: string, claimUrl: string, trade?: string, competitors?: string, contactFirstName?: string): string {
  const fn = WA_TEMPLATE_BODIES[templateName];
  return fn ? fn(businessName, claimUrl, trade, competitors, contactFirstName) : `[${templateName}]`;
}

/** Body params for a template, filled STRICTLY in the template's declared `vars`
 *  order: parameters[i] = the value for {{i+1}}. 'url' → the claim/site link (raw);
 *  'name' → the business name (with the "your business" fallback). For the original
 *  templates (vars ["name","url"]) this returns EXACTLY the previous shape — {{1}}=name,
 *  {{2}}=url — so their live sends are unchanged. */
export function templateBodyParams(
  vars: TemplateVar[],
  businessName: string,
  claimUrl: string,
  extra?: { trade?: string; competitors?: string; onboardingUrl?: string; templateName?: string; contactName?: string; town?: string; auditUrl?: string },
) {
  /* Last line of defence for a template whose copy needs a real name. Callers check first and
     return a readable refusal; this throws so a new caller that forgets cannot quietly send
     "Hi your business, Paul here". Same shape as the onboarding_url guard below. */
  if (extra?.templateName && TEMPLATES_NEEDING_REAL_NAME.has(extra.templateName) && !businessName.trim()) {
    throw new Error(`${extra.templateName} needs a real business name — refusing to send a greeting with a placeholder`);
  }
  const resolve = (v: TemplateVar) => {
    switch (v) {
      case "url": return claimUrl;
      case "trade": return extra?.trade ?? "";
      case "competitors": return extra?.competitors ?? "";
      /* The one variable that names a PERSON. For most templates a blank first name throws (same
         contract as onboarding_url below — callers refuse readably first, this stops a forgetful new
         caller). For a template in TEMPLATES_ALLOWING_NO_FIRST_NAME (hook_followup) a blank degrades
         to "there" instead — the greeting still reads naturally to a lead we have no name for. */
      case "contact_first_name": {
        const first = firstNameFrom(extra?.contactName);
        if (first) return first;
        if (extra?.templateName && TEMPLATES_ALLOWING_NO_FIRST_NAME.has(extra.templateName)) return NO_FIRST_NAME_FALLBACK;
        throw new Error("contact_first_name is empty — refusing to send a personal greeting with a placeholder");
      }
      // Resolved per-lead by resolveOnboardingFollowupVars, which refuses rather than returning a
      // partial — so an empty value here should be unreachable. Throwing rather than sending an
      // empty {{2}} because the entire message is that link: a follow-up without it is spam.
      case "onboarding_url": {
        const u = (extra?.onboardingUrl ?? "").trim();
        if (!u) throw new Error("onboarding_url variable is empty — refusing to send a follow-up with no link");
        return u;
      }
      /* free_check_result's town. Blank is allowed to degrade rather than throw: the sentence still
         reads without it, and a free-check submitter who left the town vague is not a reason to
         withhold their result. */
      case "town": return (extra?.town ?? "").trim();
      /* free_check_result's report link — findable.live/report/<auditId>, built by reportPublicUrl.
         It said "/a/<auditId>" until 2026-09-02: a path that is now a deliberate 404 on
         findable.live, and on a leftover barber domain before that. The caller was fixed and this
         comment was not, which is how a comment starts asserting something false.
         Same contract as onboarding_url: the whole
         message is "here is your result", so sending it with an empty link is worse than not
         sending. Throws rather than degrading. */
      case "audit_url": {
        const u = (extra?.auditUrl ?? "").trim();
        if (!u) throw new Error("audit_url variable is empty — refusing to send a result with no link");
        return u;
      }
      default: return businessName || "your business"; // "name"
    }
  };
  /* ⛔ THE LAST GATE BEFORE META SEES A PARAMETER, AND IT COVERS EVERY TEMPLATE.
     Meta rejects the WHOLE send with #132018 if any parameter contains a newline, a tab, or 4+
     consecutive spaces — "Param text cannot have new-line/tab characters or more than 4 consecutive
     spaces". Four audit_reply sends died that way on 2026-08-12 on a competitor name carrying two
     newlines ("Checkatrade\n    \n    If"), and a lead who had just replied got nothing.
     formatCompetitors now collapses the competitor list at source, but that guard only covers ONE
     variable of ONE template. This covers all of them — business names, trades, links, anything a
     future template adds — because every variable a template sends is resolved right here.
     ⚠️ COLLAPSE, NOT REJECT: a value with a stray newline is still the right value, and refusing to
     send would lose a real message over a formatting artefact. The only thing that changes is
     whitespace Meta was never going to accept.
     ⚠️ NOT A SUBSTITUTE FOR THE EXTRACTOR FIX. Names should not arrive multi-line; this makes sure
     that when they do, it costs nothing. */
  const forMeta = (s: string) => (s ?? "").replace(/\s+/g, " ").trim();
  /* A template with NO variables (e.g. contact_followup since 2026-08-22) must be sent with NO body
     component at all — an empty `parameters: []` body is malformed and Meta rejects the send. Return
     no components so the payload carries just name + language. */
  if (vars.length === 0) return [];
  return [{
    type: "body",
    parameters: vars.map((v) => ({ type: "text", text: forMeta(resolve(v)) })),
  }];
}

/** A free-form text payload (only deliverable inside the 24h customer-service window). */
export function textPayload(body: string) {
  return { type: "text", text: { body, preview_url: false } };
}

/** A claim-template payload (deliverable any time). Variable order comes from the
 *  template's own `vars` in WA_TEMPLATES (falls back to the original name→url order
 *  for any unknown template, so nothing regresses). */
export function claimTemplatePayload(
  templateName: string,
  lang: string,
  businessName: string,
  claimUrl: string,
  extra?: { trade?: string; competitors?: string; onboardingUrl?: string; contactName?: string; town?: string; auditUrl?: string },
) {
  /* THROWS on an unrecognised template rather than assuming ["name","url"].
     That assumption was a quieter version of the queue's template fallback: an unregistered name got
     a guessed variable SHAPE, so it either sent with the wrong parameters filled in or was rejected
     by Meta for a parameter-count mismatch — both indistinguishable from a bug at a glance.
     Every caller already resolves the template from WA_TEMPLATES first, so this is unreachable in
     normal operation and exists to keep it that way. */
  const entry = WA_TEMPLATES[templateName];
  if (!entry) throw new Error(`unknown_template:${templateName} — not registered in WA_TEMPLATES, refusing to guess its variables`);
  const vars = entry.vars;
  return {
    type: "template",
    template: { name: templateName, language: { code: lang }, components: templateBodyParams(vars, businessName, claimUrl, { ...extra, templateName }) },
  };
}

export interface WaSendResult {
  ok: boolean;
  messageId: string | null;
  failCode?: number;
  error: string | null;
}

/** Low-level Graph POST — the same call process-whatsapp-queue makes. The caller
 *  supplies the message payload (text or template) and only calls this when live. */
export async function sendViaGraph(
  accessToken: string,
  phoneNumberId: string,
  to: string,
  payload: Record<string, unknown>,
): Promise<WaSendResult> {
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ messaging_product: "whatsapp", to, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.messages?.[0]?.id) {
      return { ok: true, messageId: data.messages[0].id, error: null };
    }
    const failCode = typeof data?.error?.code === "number" ? data.error.code : undefined;
    return { ok: false, messageId: null, failCode, error: JSON.stringify(data?.error ?? data).slice(0, 500) };
  } catch (e) {
    return { ok: false, messageId: null, error: (e as Error).message };
  }
}
