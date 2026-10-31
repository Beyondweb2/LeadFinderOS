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
   ⛔ A PROPERTY, NEVER A LIST OF NAMES: a template whose payload carries a VIDEO header (a link) goes as
      an ordinary VIDEO message with the same wording as its caption (2026-10-31b, Paul) — WhatsApp shows the
      caption under the video, so "the video above" still reads true. Any other header, a caption over
      Meta's limit, no real rendered wording, or wording that still carries a {{marker}} → the template.
   Pure; no imports (edge + browser).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export type FreeTextVersion =
  /** videoUrl: the template's own header video, sent as a normal video message with `text` as its caption. */
  | { ok: true; text: string; videoUrl?: string }
  | { ok: false; why: 'has_header' | 'no_wording' | 'unfilled_marker' | 'caption_too_long' };

/** Meta's limit on a media message's caption. Longer words cannot ride under the video, so the send stays the template. */
export const VIDEO_CAPTION_MAX = 1024;

export const NO_FREE_TEXT_WORDS: Record<Extract<FreeTextVersion, { ok: false }>['why'], string> = {
  has_header: 'it has a header a normal message cannot carry',
  caption_too_long: `its wording is longer than a video caption can be (${VIDEO_CAPTION_MAX} characters)`,
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
  type Param = { type?: string; video?: { link?: unknown } };
  const components = (payload as { template?: { components?: Array<{ type?: string; parameters?: Param[] }> } } | null)?.template?.components ?? [];
  const headers = components.filter((c) => c?.type === 'header');
  let videoUrl: string | undefined;
  if (headers.length) {
    /* Exactly one header carrying exactly one video LINK (claimTemplatePayload's shape) — anything else has no faithful version. */
    const params = headers.length === 1 ? headers[0].parameters ?? [] : [];
    const link = params.length === 1 && params[0]?.type === 'video' ? params[0].video?.link : null;
    if (typeof link !== 'string' || !/^https:\/\/\S+$/.test(link)) return { ok: false, why: 'has_header' };
    videoUrl = link;
  }
  const text = String(words ?? '').trim();
  if (!text || PLACEHOLDER.test(text)) return { ok: false, why: 'no_wording' };
  if (MARKER.test(text)) return { ok: false, why: 'unfilled_marker' };
  if (videoUrl && text.length > VIDEO_CAPTION_MAX) return { ok: false, why: 'caption_too_long' };
  return videoUrl ? { ok: true, text, videoUrl } : { ok: true, text };
}

/** Where a template send came from decides whether it may be turned into free text. */
export type SendOrigin = 'inbox' | 'scheduled' | 'other';

export type InWindowShape =
  | { as: 'template' }
  | { as: 'template'; noFreeText: string }
  | { as: 'text'; text: string; videoUrl?: string }
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
  if (v.ok === true) return v.videoUrl ? { as: 'text', text: v.text, videoUrl: v.videoUrl } : { as: 'text', text: v.text };
  const why = NO_FREE_TEXT_WORDS[(v as Extract<FreeTextVersion, { ok: false }>).why];
  return a.typed
    ? { as: 'refuse', error: 'no_free_text_version', reason: `This template can't go as a normal message: ${why}. Send it as the template instead.` }
    : { as: 'template', noFreeText: `Goes as the template: ${why}.` };
}

/* ⛔ A QUEUED SEND WHOSE WORDS CANNOT BE READ BACK (2026-10-31b). A queued row keeps only the words and the template's name.
   needs_from_you rebuilds its {{2}} from the stored transcript line — but a send that went into the queue as the person's own
   (possibly edited) wording has no such line. When it runs: window open → those words go as a normal message (the shape above);
   closed → it could only go as the template, which cannot be rebuilt from their words, so it is REFUSED with this reason. The
   drain stores it on the row and the Inbox shows it ("Not sent — …"). Never a silent failure, never the template's own wording
   swapped in for the person's edit. */
export const QUEUED_WORDS_UNREADABLE_REASON =
  'Their 24 hours had run out by the time it was due, and an edited message can only go as a normal message — the approved template can’t be rebuilt from your words. Nothing was sent. Pick the template again to send it.';
