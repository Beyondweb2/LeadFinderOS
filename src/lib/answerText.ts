/* ════════════════════════════════════════════════════════════════════════════════════════════════
   AN ENGINE'S ANSWER, JUDGED AND CLEANED — the one place that decides whether a stored answer is
   quotable, and what it looks like when it is.

   🔴 WHY THIS IS ITS OWN FILE (2026-09-22). Both halves lived privately inside auditReport.ts, where
   the gut-punch card used them to refuse to quote a map-formatted answer. Then the hook's evidence
   card started quoting the engine too — and immediately tried to print
   "https://maps.gstatic.com/…/star.png 5.0 stars Closes 10:00 PM Educational institution" to a
   prospect as though it were Gemini's considered opinion. scripts/hook-competitor-names.test.ts
   caught it on the first run, which is the only reason this is a shared leaf rather than a second
   copy of the same twenty lines with a different bug in it.

   ⛔ SO THE RULE IS: NOWHERE RENDERS AN ENGINE'S RAW ANSWER. Every surface that shows a model's own
   words calls isJunkAnswer() first and cleanAnswerText() second, and both live here so the two cards
   can never disagree about what "quotable" means.

   ⛔ PURE. No DOM, no React, no platform globals — the report renderer and the report builder both
   import it, and neither may pull the other in (auditReport.ts already imports aiAuditReportHtml.ts,
   so a helper shared between them cannot live in either without closing a cycle).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Map/image/markup junk that leaks into an engine's answer_text when the answer was a map card
 *  rather than prose. MOVED VERBATIM from auditReport.ts, and kept that way on purpose: this list
 *  also decides the NON-hook report's gut-punch card, and changing it changes those reports.
 *  ⚠️ CORRECTED 2026-09-23. The first version of this file added 'gstatic' here while its comment
 *  said "verbatim". gstatic appears in at least one stored answer on 668 of 1,421 non-hook audits,
 *  so that one word could alter what hundreds of existing reports show — the opposite of the
 *  promise that non-hook reports are unchanged. The stricter map check the hook card needs now
 *  lives in isMapCardAnswer below, where it touches nothing else. */
const JUNK_MARKERS = ['mapbox', 'openstreetmap', 'images.openai', 'oaidalleapi', 'staticmap', 'tile.', 'data:image', 'base64', 'googleusercontent', '�'];

/** True when answer_text isn't clean human prose (map/image junk, mostly URLs/markup,
 *  or too few real words) — such answers must never be shown as the gut-punch quote.
 *  ⛔ BODY IS BYTE-FOR-BYTE THE ORIGINAL from auditReport.ts. Do not "tidy" it: the non-hook
 *  report's behaviour is exactly this function, and it was promised unchanged. */
export function isJunkAnswer(text: string): boolean {
  const t = text.toLowerCase();
  if (JUNK_MARKERS.some((m) => t.includes(m))) return true;
  const stripped = text.replace(/https?:\/\/\S+/gi, ' ').replace(/\S+\.(png|jpe?g|svg|webp|gif|bmp)\S*/gi, ' ');
  const words = stripped.trim().split(/\s+/).filter((w) => /[a-z]{2,}/i.test(w));
  if (words.length < 10) return true;                    // too little real prose
  const letters = (text.match(/[a-z]/gi) || []).length;
  if (letters / text.length < 0.55) return true;         // mostly markup/symbols/urls
  return false;
}

/**
 * True when an answer is a Gemini MAP CARD — Google's own map and star-rating image assets, which
 * are served from gstatic.com, embedded in the stored text.
 *
 * 🔴 USED BY THE HOOK EVIDENCE CARD ONLY, AND THAT IS DELIBERATE. The hook card quotes the engine
 * under "Gemini replied"; a map card quoted there prints "4.5 stars rating · Closed · Opens 8:00 AM
 * Wed · Click to open side panel" as though it were Gemini's considered opinion. isJunkAnswer does
 * not catch that shape (the prose ratio stays high), and widening isJunkAnswer to catch it would
 * change the non-hook report too. So the hook card asks BOTH questions and the non-hook card keeps
 * asking the one it always asked.
 * ⚠️ Whether the non-hook card should also stop quoting map cards is a product decision for Paul,
 * not something to fold in quietly.
 */
export function isMapCardAnswer(text: string): boolean {
  return /gstatic\.com/i.test(text || '');
}

/** Strip UI chrome + markdown out of an engine answer so it reads as clean prose. */
export function cleanAnswerText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')                 // code fences
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')            // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')          // links → their text
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')               // markdown headings (###)
    .replace(/^\s{0,3}[-*•]\s+/gm, '')                // list bullets (* / -)
    .replace(/^\s{0,3}\d+[.)]\s+/gm, '')              // numbered lists
    .replace(/[*_`>#]+/g, '')                         // stray md symbols (** __ ` > #)
    .replace(/\bgive feedback\b/gi, ' ')              // AI-UI cruft
    .replace(/^\s*feedback\b[:\-\s]*/gi, ' ')
    .replace(/\bshow (?:more|less)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
