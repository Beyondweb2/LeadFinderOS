/* webdev_report — Paul, 2026-11-15. WhatsApp template, English, Marketing. A FOLLOW-UP to a web developer / SEO person who has
   already replied or been messaged: it pitches the app (leadfinderos.com) and shows them their OWN audit report as the example.
   ⛔ NEVER A FIRST MESSAGE: it is a continuation (coldOutreach.ts CONTINUATION_TEMPLATES) and NEEDS_PRIOR_WHATSAPP refuses it at
      both senders for a number never messaged — the same setup as initial_question.
   ⛔ TWO VARIABLES, IN THIS ORDER: {{1}} the lead's business name, {{2}} the lead's latest audit report link (findable.live/r/<code>).
      Both are resolved SERVER-SIDE from the lead's own newest completed audit (_shared/audit-reply.ts, link-only mode). A lead with
      no report is refused with NO_REPORT_REASON — Meta never gets a blank link.
   ⛔ LINK-ONLY: the body makes no claim about who AI named, so the competitor / "named others instead" / trade refusals that guard
      the audit pitches do not apply to it. It needs only a finished audit with a report.
   Leaf module: no imports, reachable from edge functions (relative .ts imports only). */

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
