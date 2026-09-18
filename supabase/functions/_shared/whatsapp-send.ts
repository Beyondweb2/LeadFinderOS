// Shared WhatsApp Cloud API send mechanism — extracted VERBATIM from
// process-whatsapp-queue so the Inbox reply sender reuses the exact same proven
// transport (Graph POST), phone normalisation, test-mode gate and claim-template
// shape. process-whatsapp-queue itself is intentionally NOT modified in this build;
// it can adopt this helper in a later cleanup.

import { articleTrade, normaliseTrade, normaliseTown, pluraliseTrade } from "../../../src/lib/templateVars.ts";
import { RIVAL_VARS, RIVALS_REQUIRED } from "../../../src/lib/rivalHook.ts";
import { displayBusinessName, IDENTIFY_NAME_TEMPLATES } from "../../../src/lib/displayName.ts";

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
/* ⚠️ `trade` AND `trade_plural` ARE DIFFERENT VARIABLES BECAUSE THEY ARE DIFFERENT SENTENCES.
   `trade` is singular and article-safe ("for a {{2}}", video_template); `trade_plural` is the bare
   plural ("find {{2}} in your area", competitor_hook). One variable with a flag would let a caller
   ask for the wrong grammar, and the failure would be a prospect reading "for a accountants".
   `rival_1|2|3` are the three competitor names competitor_hook sends as SEPARATE parameters — see
   src/lib/rivalHook.ts for why they are never padded and never degrade. */
export type TemplateVar = "name" | "url" | "trade" | "trade_plural" | "trade_article" | "competitors" | "rival_1" | "rival_2" | "rival_3" | "onboarding_url" | "contact_first_name" | "town" | "audit_url" | "site_fault";

/* ⛔ THE VIDEO HEADER'S URL, IN ONE PLACE (Paul, 2026-09-12).
   `video_template` is registered at Meta with a VIDEO header, which means the send MUST carry a
   header component or Meta rejects it outright — a body-only payload is not "a message without the
   video", it is an error.

   ⛔ A PUBLIC LINK, NOT A MEDIA ID, AND THAT IS PAUL'S CALL RATHER THAN A DEFAULT. An uploaded
   media id expires after 30 days, so it would need a re-upload path, a stored id, an expiry check
   and a failure mode for the day it lapses — machinery whose only job is to keep working. A link is
   fetched by Meta at send time and simply keeps working. The cost is that the URL must stay
   publicly reachable: if the file 404s, every send of this template fails.

   ⚠️ META'S REQUIREMENTS FOR THE FILE, so the upload is right first time: MP4 (H.264 video, AAC
   audio), **16MB or under**, publicly reachable over HTTPS with no redirect and no auth. Anything
   larger is rejected at send time, not at registration.
   ⚠️ IT IS SERVED FROM findable-site's `public/` DIRECTORY, so `public/media/findable-hook.mp4`
   becomes this URL. That repo's 404 fallback does not apply to real files in public/. */
export const VIDEO_TEMPLATE_HEADER_URL = "https://findable.live/media/findable-hook.mp4";

/** Approved template allowlist — mirrors process-whatsapp-queue. `vars` is the BODY
 *  variable order for THIS template ({{1}} = vars[0], {{2}} = vars[1], …). The four
 *  original templates are {{1}}=name, {{2}}=url; keep that order for them (they're
 *  live). `lang` MUST match the template's registered language in Meta exactly.
 *  `headerVideoUrl` is set ONLY for a template registered with a VIDEO header. */
export const WA_TEMPLATES: Record<string, { lang: string; vars: TemplateVar[]; headerVideoUrl?: string }> = {
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
  /* video_template — the OUTREACH hook, approved at Meta 2026-09-02. Registered from the
     variable order in WhatsApp Manager, NOT inferred: {{1}} business name, {{2}} trade, {{3}} town,
     {{4}} audit link.
     ⛔ ITS SAMPLE IN WHATSAPP MANAGER SHOWS {{4}} AS findable.live/a/<id> AND THAT PATH IS DEAD —
     a deliberate 404 on findable.live. The sample is illustrative text at Meta and does not
     constrain what we send; every caller fills {{4}} from resolveAuditReplyVars' `link`, which is
     findable.live/report/<auditId>. Do not "match the sample".
     ⚠️ It shares `trade` with audit_reply, which is what both send paths used to KEY ON to decide
     the payload shape - see the var-driven build in each. */
  video_template: { lang: "en", vars: ["name", "trade", "town", "audit_url"], headerVideoUrl: VIDEO_TEMPLATE_HEADER_URL },
  /* competitor_hook — the COMPETITOR-NAMING outreach hook. APPROVED AT META 2026-09-14.
     ⚠️ The BODY changed during submission (see templateBodies.ts for the three differences); the
     VARIABLES did not — six, same order, same meanings, nothing renumbered. A body edit at Meta
     cannot be assumed to leave the parameters alone, so both were re-checked against Manager.
     ⛔ SIX VARIABLES, IN THIS ORDER: {{1}} business name, {{2}} trade (LOWERCASE PLURAL — the body
     says "find {{2}} in your area" with no article), {{3}} {{4}} {{5}} three competitor names,
     {{6}} audit link. Registered from the body Paul submits, never inferred from video_template:
     that one leads {{1}} name, {{2}} singular trade, {{3}} town, {{4}} link, so borrowing its var
     list would shift every parameter and send a message that returns 200 and reads as gibberish
     (the mistake audit_reply_warm's comment records).
     ⛔ IT CARRIES THE SAME VIDEO HEADER, DELIBERATELY. Registering it without one would change the
     copy AND remove the video in the same step, so whatever happened next would say nothing about
     either — and a header can only be set AT REGISTRATION, so leaving it off is the expensive half
     to reverse. Against video_template (same header, different words) this isolates the copy.
     ⚠️ NO TOWN VARIABLE. The body says "in your area", so normaliseTown never runs for it — the
     five audits whose location_text is unusable ("Bourne uk", "GF3a") are sendable here.
     ⚠️ A lead whose audit cannot supply three rivals is sent video_template instead, decided in
     src/lib/rivalHook.ts and applied by the senders. */
  competitor_hook: { lang: "en", vars: ["name", "trade_plural", "rival_1", "rival_2", "rival_3", "audit_url"], headerVideoUrl: VIDEO_TEMPLATE_HEADER_URL },
  /* audit_reply_warm — the WARM audit message, approved at Meta 2026-09-07 (id 1509669747584736).
     Same job as video_template but for a lead who has ALREADY answered the opener, so it drops
     the "is this the right number" line.
     ⛔ THREE VARS AND NO `name`, TAKEN FROM WHATSAPP MANAGER RATHER THAN INFERRED FROM ITS SIBLING:
     {{1}} trade, {{2}} town, {{3}} audit link. video_template leads with the business name and
     this one does not, so reusing its var list would put the trade in {{1}} where Meta expects a
     name and shift every parameter by one — a message that sends "200 OK" and reads as gibberish.
     ⚠️ {{3}} is findable.live/report/<auditId>, from resolveAuditReplyVars' `link`, exactly as the
     hook's {{4}} is. Never /a/<id> (a deliberate 404) and never yoursites.uk. */
  audit_reply_warm: { lang: "en", vars: ["trade", "town", "audit_url"] },
/* audit_followup — SUBMITTED TO META 2026-09-15, registered here before approval for the same
     reason free_check_result was: an absent name fails `unknown_template` in OUR code, so approval
     alone would not start it and Paul's requirement is that it begins sending with no code change.
     Registered, the send reaches Meta, which refuses an unapproved template with its own error.
     SIX vars: {{1}} trade as a SINGULAR lowercase noun, {{2}} town, {{3}} {{4}} {{5}} rivals,
     {{6}} report link. No header, no buttons. MIRRORS process-whatsapp-queue; change both together
     (scripts/re-engage-vars.test.ts asserts both directions).
     ⛔ `audit_url` in this list is what makes it needsAudit — the queue reads the PROPERTY, never a
     name. ⛔ And rival_1..3 are what make templateNeedsRivals true, which is what gives it
     competitor_hook's three-names-or-fall-back-to-video_template rule with no new code.
     ⛔ NOT in CONTINUATION_TEMPLATES, so it is COLD by default and the phone-history seatbelt
     applies. Despite the name it opens a conversation rather than continuing one ("Ran you a free
     audit... Want me to explain?"). If it is ever meant for leads who have already replied, it must
     be named in CONTINUATION_TEMPLATES or it will be dropped as phone_already_contacted for every
     lead it is written for — the audit_reply_warm trap. */
  audit_followup: { lang: "en", vars: ["trade_plural", "town", "rival_1", "rival_2", "rival_3", "audit_url"] },
  /* audit_followup_call — SUBMITTED TO META 2026-09-16. audit_followup's sibling, and the
     difference is what it ASKS FOR: no report link at all, just "happy to explain it here or jump
     on a quick call".
     ⛔ FIVE VARS, AND {{1}} CARRIES ITS OWN ARTICLE: {{1}} trade as "a plumber" / "an electrician",
     {{2}} town, {{3}} {{4}} {{5}} three rivals. Taken from the body Paul submitted, never inferred
     from audit_followup — that one opens with a PLURAL trade and ends with a link, so borrowing its
     six-var list would send one parameter too many (#132000) and shift the rivals by one.
     🟢 trade_article IS A NEW VARIABLE AND IT EXISTS TO DODGE THE VOWEL BLOCK RATHER THAN BE
     EXEMPTED FROM IT. Meta's registered text here reads "looking for {{1}} in {{2}}" with NO
     article, so the value supplies it and "an electrician" is simply written correctly. See the
     long note above articleTrade in src/lib/templateVars.ts.
     ⛔ NO audit_url, AND IT IS STILL needsAudit. The RIVALS come from the lead's completed audit,
     so it must wait for one exactly as its sibling does — templateNeedsAudit reads
     AUDIT_DERIVED_VARS for that reason, and named three variables (none of them a rival) until
     2026-09-16.
     ⛔ A CONTINUATION, SO IT HOLDS RATHER THAN FALLING BACK when the audit cannot name three
     rivals: video_template is a cold opener and this message is sent into a live thread. The rule
     is in src/lib/rivalHook.ts, keyed on the property, not on this name.
     No header, no buttons. MIRRORS process-whatsapp-queue; change both together. */
  audit_followup_call: { lang: "en", vars: ["trade_article", "town", "rival_1", "rival_2", "rival_3"] },
  /* audit_followup_fault — SUBMITTED TO META 2026-09-17. audit_followup_call PLUS a site fault and a
     report link: {{1}} trade WITH ITS OWN ARTICLE, {{2}} town, {{3}} {{4}} {{5}} three rivals,
     {{6}} ONE sentence naming the site's main crawl fault, {{7}} the SHORT report URL.
     ⛔ {{6}} CANNOT BE EMPTY — Meta rejects a blank parameter and the whole send dies. So this
     template is only ever OFFERED when the lead's crawl check found a fault (the picker gates on
     hasSiteFault; getTemplateSendability), and the send FAILS CLOSED if it somehow arrives without
     one (the site_fault case below throws unsafe_template_var). A clean-site lead gets
     audit_followup_call instead — this NEVER falls back to it, and it never falls back FROM it.
     ⛔ audit_url makes it needsAudit AND carries the report link ({{7}}); rival_1..3 make it
     templateNeedsRivals, so a lead short of three rivals HOLDS (it is a CONTINUATION, no cold
     fallback) exactly like audit_followup_call. site_fault is resolved in the audit branch from the
     lead's crawl check (resolveAuditReplyVars.siteFault), so it lives beside the rivals it ships
     with. No header, no buttons. MIRRORS process-whatsapp-queue; change both together. */
  audit_followup_fault: { lang: "en", vars: ["trade_article", "town", "rival_1", "rival_2", "rival_3", "site_fault", "audit_url"] },
  /* explain_offer — SUBMITTED TO META 2026-09-15. The full pitch: what we do, both figures, the
     guarantee, and the sign-up link, over the SAME video header video_template carries.
     THREE vars: {{1}} trade as a LOWERCASE PLURAL, {{2}} town, {{3}} onboarding link.
     ⛔ `onboarding_url` in this list is what routes it to send-whatsapp-message's onboarding
     branch — a PROPERTY, never a name — so it inherits resolveOnboardingFollowupVars' refusals,
     including "already paid" (this message asks someone to pay; a customer must never see it).
     ⛔ NOT needsAudit: {{3}} is the SIGN-UP link, not a report link, so nothing here waits on an
     audit. It is the only rival-free, audit-free template in the outreach set.
     ⛔ NOT in CONTINUATION_TEMPLATES by accident — it IS one, deliberately: Inbox only, sent into
     a live conversation. MIRRORS process-whatsapp-queue; change both together. */
  explain_offer: { lang: "en", vars: ["trade_plural", "town", "onboarding_url"], headerVideoUrl: VIDEO_TEMPLATE_HEADER_URL },
  /* explain_offer_v2 — SUBMITTED TO META 2026-09-16. THE SAME SHAPE AS explain_offer: three vars in
     the same order ({{1}} trade as a LOWERCASE PLURAL, {{2}} town, {{3}} onboarding link), the same
     video header, no buttons. Two paragraphs were added to the BODY — what a searcher does with the
     answer ("they call whoever gets named"), and the proof (941 audits; a locksmith named once in
     twelve questions, then three times). Registered as a NEW name rather than a re-approval because
     Paul chooses between the two per lead; both stay sendable and explain_offer is untouched.
     Everything said of explain_offer above holds here: the onboarding branch by the onboarding_url
     PROPERTY, not needsAudit, a CONTINUATION (Inbox only). MIRRORS process-whatsapp-queue; change
     both together. */
  explain_offer_v2: { lang: "en", vars: ["trade_plural", "town", "onboarding_url"], headerVideoUrl: VIDEO_TEMPLATE_HEADER_URL },
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
     gates the send on the lead having a generated site, which re_engage_49 must not require. The
     onboarding link is built from the lead id alone, resolved per-lead by
     resolveOnboardingFollowupVars, which REFUSES rather than returning a partial. */
  /* ⛔ ONE VARIABLE AGAIN, AND THE HISTORY OF THIS LINE IS WHY IT NEEDS A COMMENT. It was one var,
     was CORRECTED to two on 2026-08-11 against a real Meta rejection (#132000, "1 param sent, 2
     expected"), and is one again because `re_engage_49` is a DIFFERENT registered template from
     the `re_engage` it replaced: Paul re-registered it on 2026-09-12 carrying {{1}} business name
     and no link. Sending the old two against it is the same #132000 in the other direction.
     ⚠️ The onboarding URL is GONE from this message, so nothing here needs resolveOnboarding*. */
  re_engage_49: { lang: "en", vars: ["name"] },
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
export const TEMPLATES_NEEDING_REAL_NAME = new Set(["book_call", "re_engage_49"]);

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

/* Opener — ONE variable ({{1}} = business name). The claimUrl arg is ignored (this template has no
   url). Display-only preview; the real send uses Meta's body + the single name param.
   🔴 THE BODY CHANGED AT META 2026-09-15 and this is the new registered wording. The previous copy
   ("Hi, is this the right number for X? Cheers") is NOT deleted — it is what 238+ already-sent rows
   actually contained, and it is preserved in src/lib/templateBodies.ts under the superseded-bodies
   map so those transcripts keep saying what the prospect read. Same law as re_engage: a body is the
   record of what went out, never what the registry says today.
   ⚠️ {{1}} IS THE GREETING NAME, so this is the template the trimming exists for — "Hi, is this
   N Hammond Gas Plumbing & Heating Engineer Ltd?" is precisely the sentence that reads automated.
   The shortening happens in renderTemplateBody / templateBodyParams, not here. */
const initialContactBody = (b: string, _u: string) =>
  `Hi, is this ${b || "your business"}?\n\nCheers`;

// audit_reply — reply to a lead who replied. b={{3}} business, u={{4}} report link,
// trade={{1}}, competitors={{2}}. Keep in sync with the Meta-registered audit_reply body.
const auditReplyBody = (b: string, u: string, trade?: string, competitors?: string) =>
  `Hi, thanks for getting back.
We asked AI tools like ChatGPT to recommend a ${trade || "provider"} in your area, it's naming ${competitors || "other firms"} - not ${b || "you"}.
We ran a full report on your business for AI and SEO visibility: ${u}
We could get you showing up in those results - it's mostly stuff we handle at our end.
Want me to explain?`;

/* 🔴 audit_result_hook - HISTORY, NOT COPY. The body approved 2026-09-02, and what the 135 rows
   sent under that name actually contained. Replaced at Meta on 2026-09-12 by `video_template`,
   which carries DIFFERENT approved words (below) plus a video header.
   ⛔ The rename was assumed to be name-plus-header, so one body was made to serve both. It is not:
   the approved copy is a different message. A body is the record of a send and may only be written
   from the registered copy, never inferred. Do not "update" this one. */
const auditResultHookBody = (b: string, u: string, trade?: string, _c?: string, _first?: string, town?: string) =>
  `Hi, is this ${b || "your business"}? We ran a free AI visibility audit for you.
When people ask ChatGPT or Google's AI for a ${trade || "provider"} in ${town || "your area"}, it's naming other firms, not you.
Here's your result: ${u}
More on how we can fix it, and how to get started: https://findable.live`;

/* video_template - the APPROVED body, pasted from WhatsApp Manager 2026-09-12, character for
   character. English, Marketing, VIDEO header, four variables: {{1}} business name, {{2}} trade
   (bare singular lowercase noun), {{3}} town, {{4}} audit link.
   ⚠️ THE ASTERISKS AND EMOJI ARE PART OF THE APPROVED COPY - the asterisks are WhatsApp bold
   markup, not decoration. Stripping any of them makes the operator transcript differ from what the
   prospect received. MIRRORED in src/lib/templateBodies.ts; the parity test asserts they match.
   ⚠️ The video header is NOT in this string - it is a payload component built from
   VIDEO_TEMPLATE_HEADER_URL, because a header is structure and this is text. */
const videoTemplateBody = (b: string, u: string, trade?: string, _c?: string, _first?: string, town?: string) =>
  `Hi ${b || "your business"} 👋

I ran a quick AI visibility check on your business and found something you'll probably want to see.

When people ask ChatGPT or Gemini for a ${trade || "provider"} in ${town || "your area"}, you're not showing up as often as you should be.

I've put the full findings together for you here:

📋 *Your free AI visibility audit*
${u}

🌐 https://findable.live/

It's completely free to look through, no signup or obligation.

Have a read, and if you want I'll explain what's causing it and how we'd fix it.

Paul, Findable.`;

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

/* re_engage_49 — the wording Meta approved, supplied by Paul 2026-08-11 and reproduced exactly.
   b = {{1}} business name, u = {{2}} that lead's onboarding URL (passed in the claimUrl slot by
   every caller, same convention as onboarding_followup). Display-only: Meta renders the real message
   from its own copy, so nothing in this string can change a send — but it IS what the operator reads
   in the Inbox as a record of what went out, so it is kept character-for-character.
   ⛔ AND IT IS THE THIRD PLACE THE PRICE NOW LIVES. This body hardcodes "£49.99 instead of £99";
   FINDABLE_SETUP_PRICE_GBP is the constant, and scripts/check-cross-repo-sync.mjs enforces it
   against findable-site — but it cannot reach a string inside a Meta-registered template, exactly
   like the Stripe payment-link description in §6. Change the price and this template has to be
   re-registered at Meta BY HAND, and this copy updated with it.
   ✅ £19.99 → £49.99 ON 2026-08-12; RE-REGISTRATION AT META CONFIRMED BY PAUL 2026-08-17.
   ✅ SYNCED 2026-08-17 to the registered body Paul pasted character-for-character from WhatsApp
   Manager — including its single-paragraph shape (no line breaks). If Meta's editor actually
   shows line breaks that the paste flattened, correct THIS string from the editor, never from
   memory.
   🔴 SUPERSEDED 2026-09-12 (LATER THE SAME DAY): THE TEMPLATE WAS RE-REGISTERED AS re_engage_49.
   This body is now HISTORY — it is what the 21 rows sent under the old `re_engage` actually
   contained, restored verbatim from commit 036cfc4f so the Inbox transcript for those rows keeps
   showing the message that was really sent.
   ⛔ DO NOT "UPDATE" IT. Earlier that day I rewrote this single body to the £99 wording, a version
   Meta was never given, which made 21 historic rows display a message nobody received. A body here
   is a record of a send, not copy to be maintained. */
const reEngageBody = (b: string, u: string) =>
  `Hi ${b}, following up on the AI visibility report we sent over. We're doing the next ten businesses at £49.99 instead of £99, in exchange for honest feedback on the work. A few quick questions and we're up and running: ${u} Happy to answer anything first if you'd rather.`;

/* re_engage_49 - the APPROVED body, pasted from WhatsApp Manager 2026-09-12, character for
   character. English, Marketing, no header, ONE variable: {{1}} business name.
   MIRRORED in src/lib/templateBodies.ts; the parity test asserts the two are identical. */
const reEngage49Body = (b: string, _u: string) =>
  `Hi ${b || "your business"}, it's Paul from Findable.

Where did we get to with this? Happy to pick it back up, or leave it if now's not the time.`;

/* payment_recieved — the registered body, pasted character-for-character by Paul from WhatsApp
   Manager 2026-08-17 (the first time this wording has existed anywhere in the repo). The template
   KEY keeps Meta's load-bearing misspelling; see the WA_TEMPLATES note. {{1}} = business name;
   no url, so the claimUrl arg is unused. Sent only by stripe-webhook on payment — deliberately
   absent from every operator picker. */
const paymentRecievedBody = (b: string, _u: string) =>
  `Hi ${b}, payment received, thanks. You're in.

We'll get started and be back to you within a few days to get your Google profile sorted and share your page plan.

Anything in the meantime, just reply here.`;

/* competitor_hook - APPROVED AT META 2026-09-14, and this is the REGISTERED body, pasted by Paul
   from WhatsApp Manager. Six variables: {{1}} business name, {{2}} trade as a LOWERCASE PLURAL,
   {{3}} {{4}} {{5}} three competitor names, {{6}} audit link - unchanged from submission, nothing
   renumbered.
   🔴 THE BODY CHANGED DURING SUBMISSION AND WAS REPLACED RATHER THAN KEPT, which is this file's own
   rule: a body here is the record of what a prospect actually READ, so ours was never the authority.
   "No signup or obligation." is gone; the findable.live line and the closing question are new; the
   sign-off is "Paul." not "Paul, Findable". ⛔ Do not restore any of ours, and paste Meta's over
   this again if a future version is edited - keeping ours because it is what we asked for is the
   failure that falsified 21 re_engage transcripts.
   ⚠️ MIRRORED CHARACTER FOR CHARACTER IN src/lib/templateBodies.ts; scripts/template-bodies-parity
   asserts the two produce identical output, so they move together or the build fails.
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

/* explain_offer — SUBMITTED TO META 2026-09-15. THE FULL PITCH, with the video header.
   {{1}} trade as a LOWERCASE PLURAL, {{2}} town, {{3}} that lead's onboarding link. No buttons.

   ⛔ {{3}} IS THE FIRST TIME A SIGN-UP LINK CARRIES THE WHOLE MESSAGE, AND IT CANNOT GO BLANK.
   Two layers, both pre-existing: resolveOnboardingFollowupVars refuses with a NAMED reason (no
   lead, unconfigured origin, lead unreadable, lead gone, no business name, already paid, no
   trade), and templateBodyParams THROWS on an empty onboarding_url rather than sending it. An
   empty Meta parameter is rejected outright and takes the whole send with it.
   ⚠️ {{2}} NEEDED THE SAME TREATMENT AND DID NOT HAVE IT — the town case returns "" for a blank
   instead of throwing (free_check_result's deliberate carve-out). send-whatsapp-message refuses a
   blank town for any template that DECLARES one; see the note there for why it is not in the
   resolver.

   ⛔ THE PRICES ARE LITERAL BECAUSE META'S COPY IS LITERAL. This string is a MIRROR of the
   registered body, not a source of truth, so interpolating FINDABLE_SETUP_PRICE_GBP would make the
   Inbox show a number Meta is not sending the moment the constant moves. `scripts/explain-offer.test.ts`
   asserts the two figures still MATCH the constants, so a price change fails the build and forces
   the re-registration instead of letting the two drift silently. */
const explainOfferBody = (_b: string, u: string, trade?: string, _c?: string, _first?: string, town?: string) => {
  const t = pluraliseTrade(trade);
  return `Nobody's doing this yet, which is the point.

People ask ChatGPT and Gemini for ${t.ok ? t.value : (trade || "businesses")} in ${town || "your area"} instead of googling. I get you named in those answers.

Keep your website and I'll optimise it so AI can read you. Or if you can't give me access, or want a new one, I'll build it. No extra cost.

£99 to start. I run a full baseline check and send it over, then measure again four weeks later so you can see exactly what's changed.

Not showing up more, you get your money back.

After that £29.99 a month. More ways to be found, your reviews replied to, and I watch how each page performs and adjust. Stop any time.

Here's the sign up:
${u}

Short explainer video attached. Happy to answer any questions.

https://findable.live/`;
};

/* explain_offer_v2 — SUBMITTED TO META 2026-09-16. explain_offer with two paragraphs added: what a
   searcher does with the answer, and the proof. Same three variables in the same order, same header.
   ⛔ "chatgpt" AND "gemini" ARE LOWERCASE ON PURPOSE (Paul's wording, as in audit_followup) AND MUST
   NOT BE "CORRECTED". explain_offer's body capitalises them and that is ALSO what ITS registration
   says — each mirror follows its own registration, never its sibling's.
   ⛔ THE PROOF LINE IS LITERAL, LIKE THE PRICES. "941" and "once in twelve … three times" are what
   Meta registered, not values this code computes. If the figures move (CLAUDE.md §27: re-derive,
   never inherit), the template is re-registered at Meta and this mirror follows — never the reverse.
   ⚠️ Everything explainOfferBody's note says about {{3}} never going blank and a blank {{2}} being
   refused at the send branch applies unchanged: same resolver, same branch, same guards. */
const explainOfferV2Body = (_b: string, u: string, trade?: string, _c?: string, _first?: string, town?: string) => {
  const t = pluraliseTrade(trade);
  return `Nobody's doing this yet, which is the point.

People ask chatgpt and gemini for ${t.ok ? t.value : (trade || "businesses")} in ${town || "your area"} instead of googling, and they call whoever gets named. Right now that's not you.

I've audited 941 UK businesses to work out what actually gets a firm named. A locksmith I did this for went from named once in twelve questions to named three times, in four weeks, on the pages I built.

Keep your website and I'll optimise it so AI can read you. Or if you can't give me access, or want a new one, I'll build it. No extra cost.

£99 to start. I run a full baseline check and send it over, then measure again four weeks later so you can see exactly what's changed.

Not showing up more, you get your money back.

After that £29.99 a month. More ways to be found, your reviews replied to, and I watch how each page performs and adjust. Stop any time.

Here's the sign up:
${u}

Short explainer video attached. Happy to answer any questions.

https://findable.live/`;
};

/* audit_followup_call — SUBMITTED TO META 2026-09-16. Five variables: {{1}} trade WITH ITS OWN
   ARTICLE ("a plumber", "an electrician"), {{2}} town, {{3}} {{4}} {{5}} three rivals. No link, no
   header, no buttons.
   ⛔ "i" IS LOWERCASE IN THREE PLACES AND MUST NOT BE "CORRECTED" — Paul's wording, the same rule
   as "chatgpt" in its sibling. It reads as something a person typed on a phone, which is the whole
   point of a message that offers a call.
   ⛔ AND THE ARTICLE IS IN THE VALUE, NOT THE SENTENCE. That is what makes this the first outreach
   template an accountant or an electrician can receive without a map workaround — 179 of 1,066
   lead-linked audits (16.8%) are held on video_template's hardcoded "for a {{2}}".
   ⚠️ Rivals render as ONE joined string here where Meta sends three parameters, exactly as
   audit_followup does: the Inbox has no audit to read them from, so they degrade to "other firms".
   The words the prospect received are on Meta's side. */
const auditFollowupCallBody = (_b: string, u: string, trade?: string, competitors?: string, _first?: string, town?: string) => {
  const t = articleTrade(trade);
  return `Hi mate, i was looking for ${t.ok ? t.value : (trade || "a local business")} in ${town || "your area"} so i asked AI and it mentioned ${competitors || "other firms"}

I know how to get you showing up more in those answers so people are more likely to find you

Happy to explain it here or jump on a quick call if you'd rather

Paul✌️`;
};

/* audit_followup_fault — SUBMITTED TO META 2026-09-17. audit_followup_call PLUS {{6}} the site's
   main fault and {{7}} the SHORT report link. Seven vars: {{1}} trade WITH ITS OWN ARTICLE, {{2}}
   town, {{3}} {{4}} {{5}} rivals, {{6}} fault sentence, {{7}} report link.
   ⛔ "i" IS LOWERCASE — Paul's wording, same as its siblings. Do not "correct" it.
   ⚠️ DISPLAY ONLY: the Inbox has no audit to read rivals from and no fault sentence threaded to this
   builder, so {{3}}-{{5}} degrade to "other firms" and {{6}} to a generic line here, exactly as
   audit_followup_call degrades its rivals. What the prospect actually received is on Meta's side,
   filled from the resolved parameters. {{7}} (u) is the real report link. */
const auditFollowupFaultBody = (_b: string, u: string, trade?: string, competitors?: string, _first?: string, town?: string, siteFault?: string) => {
  const t = articleTrade(trade);
  return `Hi mate, i was looking for ${t.ok ? t.value : (trade || "a local business")} in ${town || "your area"} so i asked AI and it mentioned ${competitors || "other firms"}

Here's the main thing holding you back.

${siteFault}

I know how to get you showing up more in those answers so people are more likely to find you

Here's the proof: ${u}

Happy to explain more here or jump on a quick call if you'd rather

Paul✌️`;
};

/* audit_followup — SUBMITTED TO META 2026-09-15, re-registered the same day with the article
   removed. Six variables: {{1}} trade as a LOWERCASE PLURAL, {{2}} town, {{3}} {{4}} {{5}} three
   rivals, {{6}} report link. No header, no buttons.
   ⛔ "chatgpt" IS LOWERCASE ON PURPOSE (Paul's wording) AND MUST NOT BE "CORRECTED". It reads as
   something a person typed, which is the entire point of this message.
   ⛔ THE TRADE IS PLURAL, AND THAT IS WHAT MAKES THIS TEMPLATE USABLE AT ALL. It was singular
   ("for a {{1}}") until Meta re-registration on 2026-09-15, which put it under normaliseTrade's
   article check — and that held 179 of the 1,066 lead-linked audits (16.8%), almost all of them
   ACCOUNTANTS and ELECTRICIANS, because "a accountant" must never send. Deleting one word took the
   block to 1 (0.1%), the survivor being "shoe repairs & watch battery replacement", which is
   genuinely not a trade name. pluraliseTrade has no article check and still refuses uncountables
   ("find plumbing in your area" is as wrong as "a plumbing"), so nothing was loosened except the
   article.
   ⚠️ IT ALSO REPAIRED AN INCOHERENCE: "I asked chatgpt for A plumber… It came back with X, Y and Z"
   asked for one and listed three. The plural makes the second line follow from the first.
   ⚠️ Rivals render on ONE line here where Meta's registered layout breaks {{3}}, onto its own line.
   Whitespace only — the words are identical — and the Inbox degrades rivals to "other firms"
   anyway, because it has no audit to read them from. */
const auditFollowupBody = (_b: string, u: string, trade?: string, competitors?: string, _first?: string, town?: string) => {
  const t = pluraliseTrade(trade);
  return `I asked chatgpt for ${t.ok ? t.value : (trade || "businesses")} in ${town || "your area"} this morning.

It came back with ${competitors || "other firms"}.

Ran you a free audit, you can see the results here:
${u}

45% of people now use AI to find local businesses. Same on Gemini, and I know how to get you showing up in those searches.

Want me to explain?`;
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

export const WA_TEMPLATE_BODIES: Record<string, (businessName: string, claimUrl: string, trade?: string, competitors?: string, contactFirstName?: string, town?: string, siteFault?: string) => string> = {
  book_call: bookCallBody,
  re_engage: reEngageBody,
  re_engage_49: reEngage49Body,
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
  video_template: videoTemplateBody,
  competitor_hook: competitorHookBody,
  /* The 135 rows sent before the 2026-09-12 rename carry the old name and its OWN, different words. */
  audit_result_hook: auditResultHookBody,
  audit_reply_warm: auditReplyWarmBody,
  audit_followup: auditFollowupBody,
  audit_followup_call: auditFollowupCallBody,
  audit_followup_fault: auditFollowupFaultBody,
  explain_offer: explainOfferBody,
  explain_offer_v2: explainOfferV2Body,
};

/** Render the display copy of a template body with its variables filled. `trade`/`competitors`
 *  are used only by audit_reply; the other (2-var) bodies ignore them. */
export function renderTemplateBody(templateName: string, businessName: string, claimUrl: string, trade?: string, competitors?: string, contactFirstName?: string, town?: string, siteFault?: string): string {
  const fn = WA_TEMPLATE_BODIES[templateName];
  if (templateName === "audit_followup_fault" && !siteFault?.trim()) {
    throw new Error("unsafe_template_var:no_site_fault:the crawl check found no fault to name — use the call version");
  }
  /* ⛔ THE STORED BODY IS SHORTENED HERE, IN THE SAME FUNCTION THE META PARAMETER IS BUILT BESIDE,
     so the transcript and the message cannot diverge. Doing it at the ~15 call sites instead would
     be "one rule written out in N places" — the failure this codebase has recorded five times, and
     the one that put a wrong body in the Inbox mirror for competitor_hook. src/lib/displayName.ts
     is the rule; nothing is written back to outreach_leads.business_name. */
  businessName = displayBusinessName(businessName, {
    town,
    style: IDENTIFY_NAME_TEMPLATES.has(templateName) ? "identify" : "greet",
  });
  /* `town` is a 6th positional rather than a new object: every existing body function ignores extra
     arguments, so adding it cannot change a single stored transcript. video_template is the only
     body that reads it - without it the transcript would say "in your area" while the message the
     prospect received named their town, which is the display drift 11 already records for re_engage_49. */
  return fn ? fn(businessName, claimUrl, trade, competitors, contactFirstName, town, siteFault?.trim()) : `[${templateName}]`;
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
  extra?: { trade?: string; competitors?: string; rivals?: string[]; onboardingUrl?: string; templateName?: string; contactName?: string; town?: string; auditUrl?: string; siteFault?: string },
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
      /* ⛔ NORMALISED AND GUARDED, BECAUSE video_template's body reads "for a {{2}} in {{3}}".
         `ai_audits.business_type` is what the operator typed — 78% of the 968 stored values are not
         lowercase and the four commonest are PLURAL, so the untouched value rendered "for a
         Locksmiths in Huntingdon" on most sends. normaliseTrade maps the known trades and
         singularises the rest; a value it cannot make safe THROWS rather than sending wrong.
         ⚠️ The throw is caught at both send sites and recorded as a skip with its reason, so a
         blocked lead is visible rather than silently unsent. See src/lib/templateVars.ts. */
      case "trade": {
        const t = normaliseTrade(extra?.trade);
        if (!t.ok) throw new Error(`unsafe_template_var:${t.reason}:${t.detail}`);
        return t.value;
      }
      case "competitors": return extra?.competitors ?? "";
      /* ⛔ THE PLURAL SLOT. competitor_hook's body is "find {{2}} in your area" — no article — so it
         wants "plumbers", not "plumber". pluraliseTrade blocks the same unusable values
         normaliseTrade blocks (digits, multi-clause lists, uncountable activity nouns) and does NOT
         apply the vowel rule, which exists only because video_template's registered text hardcodes
         "a". That single difference is what makes this template sendable to the 113 audits (12%)
         held on that rule today. See src/lib/templateVars.ts. */
      case "trade_plural": {
        const t = pluraliseTrade(extra?.trade);
        if (!t.ok) throw new Error(`unsafe_template_var:${t.reason}:${t.detail}`);
        return t.value;
      }
      /* ⛔ THE ARTICLE SLOT. audit_followup_call's body is "looking for {{1}} in {{2}}" — the
         article is NOT in Meta's registered text, so the VALUE carries it ("a plumber", "an
         electrician"). Same map and same refusals as the other two slots; the ONLY difference is
         that a vowel-initial trade is written correctly here instead of being held, because there
         is no hardcoded "a" for it to disagree with. See src/lib/templateVars.ts. */
      case "trade_article": {
        const t = articleTrade(extra?.trade);
        if (!t.ok) throw new Error(`unsafe_template_var:${t.reason}:${t.detail}`);
        return t.value;
      }
      /* ⛔ A MISSING RIVAL THROWS; IT NEVER DEGRADES AND IT NEVER PADS. Meta rejects an empty
         parameter outright, and a filler ("other firms", a repeated name) turns a checkable claim
         about three named businesses into one a prospect cannot verify — in the first message they
         ever get from us. The senders decide what to do about it BEFORE building the payload
         (rivalHookDecision → send video_template instead); this is the last line of defence for a
         caller that forgets, and it uses the `unsafe_template_var:` prefix so the existing catch at
         every send site turns it into a visible hold rather than a 500. */
      case "rival_1":
      case "rival_2":
      case "rival_3": {
        const i = RIVAL_VARS.indexOf(v as typeof RIVAL_VARS[number]);
        const name = (extra?.rivals?.[i] ?? "").trim();
        if (!name) {
          throw new Error(
            `unsafe_template_var:rivals_unavailable:only ${(extra?.rivals ?? []).length} of ${RIVALS_REQUIRED} competitor names`,
          );
        }
        return name;
      }
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
      case "town": {
        const raw = (extra?.town ?? "").trim();
        /* ⚠️ BLANK STILL DEGRADES, and that carve-out is deliberate rather than an oversight: the
           comment above is free_check_result's contract, and a free-check submitter who left their
           town vague must still get their result. Only a NON-BLANK town that is not a place name is
           blocked — "Bourne uk" (4 audits) and "GF3a" (1), which would otherwise render verbatim. */
        if (!raw) return "";
        const t = normaliseTown(raw);
        if (!t.ok) throw new Error(`unsafe_template_var:${t.reason}:${t.detail}`);
        return t.value;
      }
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
      /* audit_followup_fault's {{6}} — the ONE sentence naming the site's main crawl fault. It is
         the whole reason that template exists (a specific, checkable problem), and Meta rejects an
         empty parameter outright, so a blank THROWS with the unsafe_template_var: prefix the send
         sites already turn into a visible hold. This is the fail-closed backstop; the picker gates
         the template out for a clean site before it ever gets here. */
      case "site_fault": {
        const f = (extra?.siteFault ?? "").trim();
        if (!f) throw new Error("unsafe_template_var:no_site_fault:the crawl check found no fault to name — use the call version");
        return f;
      }
      /* ⛔ THE GREETING NAME. `business_name` is the Google Maps listing, so untouched it opens
         "Hi N Hammond Gas Plumbing & Heating Engineer" at a man who calls himself N Hammond —
         81.2% of the book carries a trade word and 26.4% carries Ltd/Limited/LLP. displayName.ts
         shortens it where it can prove a clean boundary and returns the FULL listing otherwise, so
         the worst case here is exactly what we send today. The town lets it refuse "Spalding
         Plumbers" -> "Spalding". DISPLAY ONLY — the column is never written. */
      default: return displayBusinessName(businessName, {
        town: extra?.town,
        /* ⛔ THE FRAME DECIDES, AND THE TEMPLATE NAME IS ONLY HOW WE LOOK IT UP. "Hi, is this X?"
           needs enough to identify; "Hi X," wants the short form. Absent templateName falls to
           "greet", which is what every caller got before this existed. */
        style: extra?.templateName && IDENTIFY_NAME_TEMPLATES.has(extra.templateName) ? "identify" : "greet",
      }) || "your business"; // "name"
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
  extra?: { trade?: string; competitors?: string; rivals?: string[]; onboardingUrl?: string; contactName?: string; town?: string; auditUrl?: string; siteFault?: string },
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
  /* ⛔ THE HEADER COMPONENT COMES FIRST, and Meta requires the ORDER header-then-body. A template
     registered with a VIDEO header and sent with only a body is rejected; the reverse — sending a
     header for a template that has none — is rejected too. So this is driven by the registry entry
     rather than by the caller: the one place that knows a template's shape decides its payload. */
  const components: Record<string, unknown>[] = [];
  if (entry.headerVideoUrl) {
    components.push({
      type: "header",
      parameters: [{ type: "video", video: { link: entry.headerVideoUrl } }],
    });
  }
  components.push(...templateBodyParams(vars, businessName, claimUrl, { ...extra, templateName }));
  return {
    type: "template",
    template: { name: templateName, language: { code: lang }, components },
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
