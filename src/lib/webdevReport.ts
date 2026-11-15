/* webdev_report — Paul, 2026-11-15. WhatsApp template, English, Marketing. A FOLLOW-UP to a web developer / SEO person who has
   already replied or been messaged: it pitches the app (leadfinderos.com) and shows them their OWN audit report as the example.
   ⛔ NEVER A FIRST MESSAGE: it is a continuation (coldOutreach.ts CONTINUATION_TEMPLATES) and NEEDS_PRIOR_WHATSAPP refuses it at
      both senders for a number never messaged — the same setup as initial_question.
   ⛔ TWO VARIABLES, IN THIS ORDER: {{1}} the lead's business name, {{2}} the lead's latest audit report link (findable.live/r/<code>).
      Both are resolved SERVER-SIDE from the lead's own newest completed audit (_shared/audit-reply.ts, link-only mode). A lead with
      no report is refused with NO_REPORT_REASON — Meta never gets a blank link.
   ⛔ LINK-ONLY: the body makes no claim about who AI named, so the competitor / "named others instead" / trade refusals that guard
      the audit pitches do not apply to it. It needs only a finished audit with a report.
   Reachable from edge functions (relative .ts imports only); its one import, reportBrand.ts, imports only the app address. */
import { LFOS_EXAMPLE_URL } from './reportBrand.ts';

export const WEBDEV_REPORT_TEMPLATE = 'webdev_report';

/** Audit templates whose only audit-derived value is the report link. The resolver returns as soon as it has the audit and its
 *  link, skipping every competitor/absence rule (those exist for bodies that state who AI named; these state nothing). */
export const REPORT_LINK_ONLY_TEMPLATES: ReadonlySet<string> = new Set([WEBDEV_REPORT_TEMPLATE]);

/** What the operator reads when the lead has no report yet. */
export const NO_REPORT_REASON = 'Run an audit first: this lead has no report yet, so there is no link to send. Nothing was sent.';

/** The registered body, byte for byte as submitted to Meta (2026-11-15). b = {{1}} business name, u = {{2}} report link. */
export function webdevReportBody(b: string, u: string): string {
  return `Cool, if you've got space for more clients this might help

The AI visibility angle is very unsaturated atm. When a business finds out AI names their competitors instead, it gets their attention

I use this, it finds local businesses, runs SEO and AI audits on them, then lets you SMS, WhatsApp or call them in the app and send them their report

Then pitch an AI optimised website and run monthly audits to show the difference

I ran one on ${b || 'your business'} so you can see what it looks like: ${u}

Free to try if you wanna test it out :)

https://leadfinderos.com

Paul✌️`;
}

/* webdev_hook — Paul, 2026-11-15. WhatsApp template, English, Marketing, NO VARIABLES. The same app pitch to a web developer /
   SEO person as webdev_report, without their report link. Set up exactly like webdev_report:
   ⛔ NEVER A FIRST MESSAGE: a continuation (coldOutreach.ts CONTINUATION_TEMPLATES) that NEEDS_PRIOR_WHATSAPP refuses at both
      senders for a number never messaged. Meta's live status is read first at both senders. Treated as approved.
   ⛔ vars [] — no parameters go to Meta. */
export const WEBDEV_HOOK_TEMPLATE = 'webdev_hook';

/* ── WEB-DEV AUDIT QUESTIONS (Paul, 2026-11-15: "Audit questions for web-dev leads are about their trade (web design, SEO,
   websites) in their area.") A lead whose trade is web design / development / SEO / a web or digital agency gets these three
   hook searches, in this order, instead of generated ones: the generator could drift onto a client's trade or a generic
   "marketing" search. Question 1 keeps the shape every hook has used ("Who is the best web designer in <place>?"). */
const WEBDEV_TRADE_RE = /\b(web\s*-?\s*(design|develop|agenc|studio)|website|seo\b|search engine optimi[sz]|digital (marketing|agenc)|marketing agenc|wordpress|shopify)/i;
export function isWebdevTrade(trade: string | null | undefined): boolean {
  return WEBDEV_TRADE_RE.test(String(trade ?? ''));
}
/** The three hook searches for a web-dev lead. `place` is the hook place (town, with the UK disambiguation the hook uses). */
export function webdevHookQuestions(place: string): string[] {
  const p = String(place ?? '').trim();
  return [
    `Who is the best web designer in ${p}?`,
    `Who is the best SEO agency in ${p}?`,
    `Who can build a website for a small business in ${p}?`,
  ];
}

/** The registered body, byte for byte as submitted to Meta (2026-11-15). No variables. */
export function webdevHookBody(): string {
  return `Cool, if you've got space for more clients this might help

I've found going in from the AI visibility angle is very unsaturated atm

When a business finds out AI names their competitors instead, it gets their attention

I use this - It finds local businesses, runs SEO and AI visibility audits on them, then lets you SMS, whatsapp or call them on the app and send them their AI audit report

Then you can pitch an "AI optimised website" and run monthly Audits on them to measure the difference

Just passing it on incase you wanna test it out while its free :)

https://leadfinderos.com

Paul✌️`;
}

/* webdev_example — Paul, 2026-11-15. WhatsApp template, English, Marketing, NO VARIABLES. The same pitch with a link to the
   permanent SAMPLE report (app.leadfinderos.com/r/example, LFOS_EXAMPLE_URL; made-up business, no lead, no opens counted).
   Set up exactly like webdev_report: a continuation that NEEDS_PRIOR_WHATSAPP refuses at both senders for a number never
   messaged; Meta's live status is read first at both senders; treated as approved. vars [] — the link is fixed text. */
export const WEBDEV_EXAMPLE_TEMPLATE = 'webdev_example';

/** The registered body, byte for byte as submitted to Meta (2026-11-15). No variables. */
export function webdevExampleBody(): string {
  return `Cool, if you've got space for more clients this might help

The AI visibility angle is very unsaturated atm. When a business finds out AI names their competitors instead, it gets their attention

I use this, it finds local businesses, runs SEO and AI audits on them, then lets you SMS, WhatsApp or call them in the app and send them their report

Then pitch an AI optimised website and run monthly audits to show the difference

Here's an example report so you can see what your clients would get: ${LFOS_EXAMPLE_URL}

Free to try if you wanna test it out :)

https://leadfinderos.com

Paul✌️`;
}
