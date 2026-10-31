/* ════════════════════════════════════════════════════════════════════════════════════════════════
   INSIDE THE 24-HOUR WINDOW, A SAVED TEMPLATE GOES AS FREE TEXT (2026-10-31, Paul).

   A lead who has written to us in the last 24 hours can be sent an ordinary message. Meta now charges
   for a utility template even inside that window, and a template reads as a broadcast in the middle of
   a conversation, so the Inbox sends the template's OWN WORDING as free text instead. Templates stay
   for a closed window (the cold opener, a lead who has gone quiet).

   ⛔ ONE RULE, here, read by send-whatsapp-message (the sender and its dry run) — the Inbox learns
      the answer from the dry run, so the screen and the sender cannot disagree.
   ⛔ IT IS STILL THAT TEMPLATE. The sender runs the template's whole build (every guard, every
      resolver) and only swaps the payload, so the row keeps template_name: pitchEverSent, the
      once-per-lead guards, report_sent and the snapshot all see it exactly as before.
   ⛔ A PROPERTY, NEVER A LIST OF NAMES: a template whose payload carries a HEADER (today the video
      header) has no faithful plain-text version — the words say "the video above" — so it goes as the
      template. So does one with no real rendered wording, or wording that still carries a {{marker}}.
   Pure; no imports (edge + browser).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export type FreeTextVersion =
  | { ok: true; text: string }
  | { ok: false; why: 'has_header' | 'no_wording' | 'unfilled_marker' };

export const NO_FREE_TEXT_WORDS: Record<Extract<FreeTextVersion, { ok: false }>['why'], string> = {
  has_header: 'it carries a video, which a normal message cannot',
  no_wording: 'there is no plain wording for it',
  unfilled_marker: 'its wording still has a blank to fill',
};

/** A {{marker}} left in the words (the same pattern leadUtils.unresolvedTokens refuses on). */
const MARKER = /\{\{\s*[a-z0-9_ ]+?\s*\}\}/i;
/** A bare template name or "[name]" — the placeholder a template with no renderer stores. */
const PLACEHOLDER = /^(?:\[[a-z0-9_]+\]|[a-z0-9]+(?:_[a-z0-9]+)+)$/;

/** The free-text version of a built template send: its payload (as claimTemplatePayload made it) and the words to send —
 *  the person's own edited text when they typed it, else the stored rendering. */
export function freeTextVersionOf(payload: unknown, words: string | null | undefined): FreeTextVersion {
  const components = (payload as { template?: { components?: Array<{ type?: string }> } } | null)?.template?.components ?? [];
  if (components.some((c) => c?.type === 'header')) return { ok: false, why: 'has_header' };
  const text = String(words ?? '').trim();
  if (!text || PLACEHOLDER.test(text)) return { ok: false, why: 'no_wording' };
  if (MARKER.test(text)) return { ok: false, why: 'unfilled_marker' };
  return { ok: true, text };
}

/** Where a template send came from decides whether it may be turned into free text. */
export type SendOrigin = 'inbox' | 'scheduled' | 'other';

export type InWindowShape =
  | { as: 'template' }
  | { as: 'template'; noFreeText: string }
  | { as: 'text'; text: string }
  | { as: 'refuse'; error: 'window_closed' | 'no_free_text_version'; reason: string };

/**
 * How a TEMPLATE send goes out.
 *  · Inbox, or a queued Inbox send now running: window open → free text of the same wording (or the person's own edit);
 *    window closed → the template (a queued send), or a refusal when the person asked for their typed words (`typed`).
 *  · Anywhere else (the bulk queue, the lead popup, the dashboard, the welcome pack, Quick Close) → the template, untouched.
 * `windowOpen` is judged by the sender from the lead's own last inbound; `allowClosedText` is test mode (nothing reaches Meta).
 * A queued send passes typed:false (the sender still uses its stored words), so closed when it runs → the template (Paul's rule).
 */
export function inWindowShape(a: {
  origin: SendOrigin;
  windowOpen: boolean;
  allowClosedText: boolean;
  /** The Inbox composer sent its own text for this template (as_free_text). */
  typed: boolean;
  version: FreeTextVersion;
}): InWindowShape {
  if (a.origin === 'other') return { as: 'template' };
  /* Closed: a template stays a template. Only words the person TYPED can go as text, and only in test mode (simulated, as any
     free text is there); live, they are refused rather than silently swapped for the template's own wording. */
  if (!a.windowOpen) {
    if (!a.typed) return { as: 'template' };
    if (!a.allowClosedText) return { as: 'refuse', error: 'window_closed', reason: 'Their 24 hours have run out, so this can only go as the approved template. Pick it again to send the template.' };
  }
  const v = a.version;
  if (v.ok === true) return { as: 'text', text: v.text };
  const why = NO_FREE_TEXT_WORDS[(v as Extract<FreeTextVersion, { ok: false }>).why];
  return a.typed
    ? { as: 'refuse', error: 'no_free_text_version', reason: `This template can't go as a normal message: ${why}. Send it as the template instead.` }
    : { as: 'template', noFreeText: `Goes as the template: ${why}.` };
}
