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
 *  rather than prose. Moved verbatim from auditReport.ts — every entry was put here by a real
 *  answer that arrived looking like this. */
const JUNK_MARKERS = ['mapbox', 'openstreetmap', 'images.openai', 'oaidalleapi', 'staticmap', 'tile.', 'data:image', 'base64', 'googleusercontent', 'gstatic', '�'];

/**
 * True when an answer is not clean human prose — map/image junk, mostly URLs or markup, or too
 * little real language to be worth quoting.
 *
 * ⛔ A TRUE HERE MEANS "DO NOT QUOTE THIS", AND EVERY CALLER MUST TREAT IT THAT WAY RATHER THAN
 * CLEANING HARDER. A map-formatted answer has no sentence in it to rescue; what survives aggressive
 * cleaning is a list of opening hours and star ratings, which reads to a prospect as though we
 * scraped something badly. The honest fallback is to show no quote at all — the question, the names
 * and the result are all still true without one.
 */
export function isJunkAnswer(text: string): boolean {
  const t = (text || '').toLowerCase();
  if (!t) return true;
  if (JUNK_MARKERS.some((m) => t.includes(m))) return true;
  const stripped = (text || '').replace(/https?:\/\/\S+/gi, ' ').replace(/\S+\.(png|jpe?g|svg|webp|gif|bmp)\S*/gi, ' ');
  const words = stripped.trim().split(/\s+/).filter((w) => /[a-z]{2,}/i.test(w));
  if (words.length < 10) return true;                    // too little real prose
  const letters = ((text || '').match(/[a-z]/gi) || []).length;
  if (letters / (text || ' ').length < 0.55) return true; // mostly markup/symbols/urls
  return false;
}

/** Strip UI chrome + markdown out of an engine answer so it reads as clean prose. */
export function cleanAnswerText(text: string): string {
  return (text || '')
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
