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
export type TemplateVar = "name" | "url" | "trade" | "competitors" | "onboarding_url";

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
};
export const WA_DEFAULT_TEMPLATE = "booking_page_intro";

/* TEMPLATES WHOSE COPY BREAKS WITHOUT A REAL NAME.
   The "name" variable normally degrades to "your business", which reads acceptably mid-sentence
   ("is this the right number for your business?"). It does NOT read acceptably as a salutation:
   "Hi your business, Paul here from findable" is worse than sending nothing, because it is
   visibly automated in a message whose whole purpose is to sound like a person. For these,
   an empty name refuses rather than degrades. */
export const TEMPLATES_NEEDING_REAL_NAME = new Set(["book_call", "re_engage"]);

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
   ⛔ AND IT IS THE THIRD PLACE THE PRICE NOW LIVES. This body hardcodes "£19.99 instead of £99";
   FINDABLE_SETUP_PRICE_GBP is the constant, and scripts/check-cross-repo-sync.mjs enforces it
   against findable-site — but it cannot reach a string inside a Meta-registered template, exactly
   like the Stripe payment-link description in §6. Change the price and this template has to be
   re-registered at Meta BY HAND, and this copy updated with it. */
const reEngageBody = (b: string, u: string) =>
  `Hi ${b}, following up on the AI visibility report we sent over.
We're doing the next ten businesses at £19.99 instead of £99 - we want honest feedback on the work, so that's the trade.
Five quick questions and we're started: ${u}
Happy to answer anything first if you'd rather.`;

export const WA_TEMPLATE_BODIES: Record<string, (businessName: string, claimUrl: string, trade?: string, competitors?: string) => string> = {
  book_call: bookCallBody,
  re_engage: reEngageBody,
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
export function renderTemplateBody(templateName: string, businessName: string, claimUrl: string, trade?: string, competitors?: string): string {
  const fn = WA_TEMPLATE_BODIES[templateName];
  return fn ? fn(businessName, claimUrl, trade, competitors) : `[${templateName}]`;
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
  extra?: { trade?: string; competitors?: string; onboardingUrl?: string; templateName?: string },
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
      // Resolved per-lead by resolveOnboardingFollowupVars, which refuses rather than returning a
      // partial — so an empty value here should be unreachable. Throwing rather than sending an
      // empty {{2}} because the entire message is that link: a follow-up without it is spam.
      case "onboarding_url": {
        const u = (extra?.onboardingUrl ?? "").trim();
        if (!u) throw new Error("onboarding_url variable is empty — refusing to send a follow-up with no link");
        return u;
      }
      default: return businessName || "your business"; // "name"
    }
  };
  return [{
    type: "body",
    parameters: vars.map((v) => ({ type: "text", text: resolve(v) })),
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
  extra?: { trade?: string; competitors?: string; onboardingUrl?: string },
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
