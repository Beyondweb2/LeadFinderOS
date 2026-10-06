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

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE QUICK REPORT'S ANSWER EXCERPT (2026-10-06, Paul — Concept 4).

   🔴 CLEAN THE CHROME, KEEP THE ANSWER. isMapCardAnswer refuses a whole answer because it carries map
   markup, and measured on the 20 six-answer hooks that refused 36 of 60 Google AI answers — most of
   them a real paragraph about real businesses wrapped in listing chrome. This layer removes the
   chrome line by line (map pins, star ratings, open/closed lines, "Click to open side panel",
   images, ChatGPT's "Map data is currently unavailable" strip, citation markers) and keeps every
   line of real text in the AI's own order and words.

   ⛔ IT NEVER WRITES A WORD. Lines are dropped or have markup removed; nothing is reworded, merged
   into a sentence the AI did not write, or reordered. A listing's title line is dropped only when
   the very next line opens with the same name (Gemini's "Name" card title followed by "Name is a …").
   ⛔ isMapCardAnswer / isJunkAnswer / cleanAnswerText ARE UNTOUCHED — the other cards still use them
   and their behaviour was promised unchanged. Only the six-answer quick report reads this.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** One block of a cleaned answer, in the AI's own order. */
export interface AnswerBlock { kind: 'p' | 'li' | 'h'; text: string; /** list nesting, 0-2 */ depth?: number }

/** Whole lines that are listing/UI chrome, never the answer. Tested on the trimmed, de-marked line. */
const CHROME_LINE: RegExp[] = [
  /map data is currently unavailable/i,              // ChatGPT's map strip (55 of 60 ChatGPT answers)
  /^\d(?:\.\d)?\s*stars?\b/i,                       // "4.9 stars rating 4.9"
  /\bstars? rating\b/i,
  /^📍/u,                                            // Gemini's category pin line
  /^★\s*\d(?:\.\d)?\b/u,                            // ChatGPT's "★ 4.9 · Gym · Open" listing line
  /^(?:(?:directions|website|call|save|share|menu|reviews|order|book)\s*){2,}$/i, // listing buttons
  /^(?:open|closed|opens|closes|open now|open 24 hours|temporarily closed|permanently closed)\b(?![^.!?]*[.!?]\s*\S)[^.!?]{0,48}$/i, // "Closed · Opens 9:00 AM Thu"
  /^(?:give feedback|feedback|show (?:more|less)|sources?|view (?:all|more)|more (?:results|places))$/i,
  /^\|?\s*:?-{3,}/,                                 // markdown table rule
];

/** Source chips Gemini prints under an item: a bare domain ("0161roofing.com") or a page title
 *  ("Roofers Manchester | Trusted Roofing Company | 0161Roofing"). Chrome ONLY when the line is not
 *  a list item — a bulleted, bolded "0161Roofing.com" is the business the AI is naming. */
const SOURCE_CHIP: RegExp[] = [
  /^(?:https?:\/\/)?[\w.-]+\.(?:com|co\.uk|org|org\.uk|net|uk|io)(?:\/\S*)?(?:\s*\+\d+)?$/i,
  /^[^|.!?]+(?:\s\|\s[^|.!?]+)+$/,
];

/** Remove markup from one line, keeping its words. */
function demark(line: string): string {
  return line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')                    // images
    .replace(/\[([^\]]+)\]\((?:https?:)?[^)]*\)/g, '$1')       // links → their text
    .replace(/\\\[\d+\\\]|\[\d+\]|【[^】]*】/g, ' ')             // citation markers [1] \[1\] 【…】
    .replace(/\\([\\`*_{}[\]()#+\-.!|>])/g, '$1')              // markdown escapes (1\. → 1.)
    .replace(/\bclick to open side panel for more information\b/gi, ' ')
    .replace(/[*_`]+/g, '')                                    // bold / italic / code markers
    .replace(/⭐️?/gu, '')
    .replace(/[-]/gu, '')                          // private-use icon glyphs (Gemini's U+E000/U+E800) — no font draws them
    .replace(/^\|\s*|\s*\|$/g, '').replace(/\s*\|\s*/g, ' · ') // table row → a · b
    .replace(/\s+/g, ' ')
    .trim();
}

/** Clean a stored answer into blocks. Pure; never adds a word. [] when there is nothing left. */
export function cleanAnswerBlocks(raw: string): AnswerBlock[] {
  const lines = String(raw || '').replace(/\r\n?/g, '\n').replace(/```[\s\S]*?```/g, ' ').split('\n');
  const out: AnswerBlock[] = [];
  for (const rawLine of lines) {
    const t = rawLine.trim();
    if (!t) continue;
    const indent = (rawLine.match(/^\s*/)?.[0] ?? '').replace(/\t/g, '    ').length;
    let kind: AnswerBlock['kind'] = 'p';
    let body = t;
    if (/^#{1,6}\s/.test(body)) { kind = 'h'; body = body.replace(/^#{1,6}\s*/, ''); }
    else if (/^[-*•]\s+/.test(body)) { kind = 'li'; body = body.replace(/^[-*•]\s+/, ''); }
    else if (/^\d+\\?[.)]\s+/.test(body)) { kind = 'li'; body = body.replace(/^\d+\\?[.)]\s+/, ''); }
    const text = demark(body);
    if (!/[a-z]{2,}/i.test(text)) continue;
    if (CHROME_LINE.some((re) => re.test(text))) continue;
    /* Tested on the line BEFORE demark turns "a | b" into "a · b" (a real table row starts with "|"). */
    const plain = body.replace(/[*_`]+/g, '').trim();
    if (kind !== 'li' && !t.startsWith('|') && SOURCE_CHIP.some((re) => re.test(plain))) continue;
    out.push(kind === 'li' ? { kind, text, depth: Math.min(2, Math.floor(indent / 4)) } : { kind, text });
  }
  /* De-duplicate: an identical consecutive block (the same paragraph stored twice), and a short
     title line that the next block opens with (a listing card's name above "Name is a …"). */
  return out.filter((b, i) => {
    const prev = out[i - 1];
    if (prev && prev.text.toLowerCase() === b.text.toLowerCase()) return false;
    const next = out[i + 1];
    const short = b.text.split(' ').length <= 8 && !/[.!?:]$/.test(b.text);
    const lower = b.text.toLowerCase();
    if (short && b.kind === 'p' && next && next.text.toLowerCase().includes(lower) && next.text.length > b.text.length) return false;
    if (short && next && next.text.toLowerCase().startsWith(lower) && next.text.length > b.text.length) return false;
    /* A citation chip repeating a name the AI gave in the last few lines ("Daniel Roofing And
       Guttering" printed again under its own item). Never a list item: the item IS the naming. */
    if (short && b.kind === 'p' && out.slice(Math.max(0, i - 3), i).some((o) => o.text.toLowerCase().includes(lower))) return false;
    return true;
  });
}

/** The longest prefix of `s` that ends at a sentence boundary and fits `max`, or "" if none ends
 *  late enough to be worth keeping (under 40% of the budget). */
function cutAtSentence(s: string, max: number): string {
  if (s.length <= max) return s;
  const window = s.slice(0, max + 1);
  let best = -1;
  for (const m of window.matchAll(/[.!?](?=\s|$)/g)) if (m.index! + 1 <= max) best = m.index! + 1;
  return best >= max * 0.4 ? s.slice(0, best) : '';
}

/** A cleaned excerpt of about `max` characters, cut at a block or sentence boundary, with
 *  `truncated` set when the AI said more. null when nothing readable survives the cleaning — the
 *  caller then shows the question, the result and the names only. Never a placeholder. */
export function answerExcerpt(raw: string, max = 500, focus: string[] = []): { blocks: AnswerBlock[]; truncated: boolean; lead: boolean } | null {
  let blocks = cleanAnswerBlocks(raw);
  /* FOCUS (2026-10-06): an answer that NAMED the client but mentions them only after the opening
     window would show a "Named" badge over text about somebody else. When a focus name is given and
     its first mention falls outside the default window, the excerpt starts AT that block — the AI's
     own words, a later passage, marked with a leading "…" (`lead`). Nothing is reordered or written. */
  let lead = false;
  const needles = focus.flatMap((n) => {
    const t = String(n || '').trim().toLowerCase();
    const short = t.replace(/\s+(?:ltd|limited)\.?$/, '').trim();
    return [t, short].filter((x) => x.length >= 3);
  });
  if (needles.length) {
    const k = blocks.findIndex((b) => needles.some((x) => b.text.toLowerCase().includes(x)));
    const before = k > 0 ? blocks.slice(0, k + 1).reduce((t, b) => t + b.text.length, 0) : 0;
    if (k > 0 && before > max) { blocks = blocks.slice(k); lead = true; }
  }
  const picked: AnswerBlock[] = [];
  let used = 0;
  let truncated = false;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (used + b.text.length <= max) { picked.push(b); used += b.text.length; continue; }
    truncated = true;
    const room = max - used;
    const cut = room >= 80 ? cutAtSentence(b.text, room) : '';
    if (cut) picked.push({ ...b, text: cut });
    else if (!picked.length) {
      /* The very first block is one long sentence: cut at a word boundary. The ellipsis the renderer
         adds says the AI's sentence continues — nothing is invented to finish it. */
      picked.push({ ...b, text: b.text.slice(0, max).replace(/\s+\S*$/, '').replace(/[,;:\s—–-]+$/, '') });
    }
    break;
  }
  while (picked.length && picked[picked.length - 1].kind === 'h') { picked.pop(); truncated = true; }
  const joined = picked.map((b) => b.text).join(' ');
  const words = joined.split(/\s+/).filter((w) => /[a-z]{2,}/i.test(w));
  /* Readability over non-space characters: a real list of firms with phone numbers and "24/7" is
     digit-heavy but still the AI's answer (3 of the 120 real cells), so digits do not disqualify it
     on their own — half the visible characters must still be letters. */
  const letters = (joined.match(/[a-z]/gi) || []).length;
  const visible = joined.replace(/\s+/g, '').length;
  if (words.length < 12 || letters / Math.max(1, visible) < 0.5 || /https?:\/\//i.test(joined)) return null;
  return { blocks: picked, truncated, lead };
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
