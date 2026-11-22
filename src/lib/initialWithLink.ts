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
   - ⛔ DISPLAY ONLY: initialWithLinkBody below is Meta's approved wording (Paul pasted it 2026-11-22), used ONLY by the SPA's
     readable mirror (templateBodies.ts) so the Inbox / previews show the words instead of "[initial_with_link]". The SENDERS
     still store the placeholder "[initial_with_link]" (whatsapp-send.ts has no renderer for it, on purpose), so it always goes
     as the TEMPLATE, never as free text in our words (inWindowFreeText.ts treats a placeholder as "no wording").
     ⚠️ The SPA does not know which code a sent row carried (it is in tracked_links), so the display shows TRACKING_CODE_SHOWN.
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

/** What the display shows in place of {{1}} when the real code is not known. */
export const TRACKING_CODE_SHOWN = '<tracking code>';

/** Meta's approved body, byte for byte (line breaks kept); {{1}} = the per-lead go code. DISPLAY ONLY — see the header. */
export function initialWithLinkBody(code: string = TRACKING_CODE_SHOWN): string {
  return `Hey ✌️, fellow web dev here

If you sell websites, SEO or AI visibility you might wanna check this out

${goLink(code || TRACKING_CODE_SHOWN)}

All the best
Paul`;
}
