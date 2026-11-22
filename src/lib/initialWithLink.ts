/* ============================================================
   initial_with_link — the cold opener with a tracked LeadFinderOS link (Paul, 2026-11-22; docs/campaign-performance.md).

   WhatsApp template, English, Marketing, Meta ID 1084953241232593, IN REVIEW when added. Paul: treat it as approved — no
   approval gate; if Meta refuses a send, the normal failed-send error shows (sendErrorMeaning.ts).
   ONE variable: {{1}} = a per-lead tracking code, used by the approved body in https://leadfinderos.com/go/{{1}}.
   - The code is made at send time (create_tracked_link, one per send, stored against the lead + template in tracked_links).
   - leadfinderos.com/go/<code> (repo leadfinderos-waitlist, functions/go/[code].ts) only forwards to the V1 edge function
     track-engagement?go=<code>, which logs the click (bots / previews marked) and redirects to https://leadfinderos.com/.
   - ⛔ LeadFinderOS-style campaigns only (report_style 'leadfinderos', the web-dev / agency campaign): a Findable prospect is
     never sent a LeadFinderOS link (the brands never cross).
   - ⛔ NO OWN WORDING: the approved body text was not supplied, so the app never renders it. The stored transcript is the
     placeholder "[initial_with_link]", which also means it always goes as the TEMPLATE, never as free text in our words
     (inWindowFreeText.ts treats a placeholder as "no wording"). When Paul pastes the exact body, add a renderer.
   ⚠️ Explicit .ts imports only: reached by edge functions.
   ============================================================ */

export const INITIAL_WITH_LINK_TEMPLATE = 'initial_with_link';
export const GO_LINK_ORIGIN = 'https://leadfinderos.com';
/** Where every /go/ click lands. */
export const GO_LINK_DESTINATION = 'https://leadfinderos.com/';

/** The shape of a code we make (create_tracked_link): 8 lower-case letters / digits. */
export const GO_CODE_RE = /^[a-z0-9]{8}$/;

export function goLink(code: string): string {
  return `${GO_LINK_ORIGIN}/go/${code}`;
}
