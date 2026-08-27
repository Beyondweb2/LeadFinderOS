/* ════════════════════════════════════════════════════════════════════════════════════════════
   PASTE-A-LIST — turn a pasted block of questions into clean rows for the re-audit editor
   (2026-08-28, Paul's spec). Pure; scripts/question-paste.test.ts drives it.

   One question per line. Blank lines dropped, whitespace trimmed, and a leading list marker
   stripped so the stored question text is exactly the question — the strings are RE-ASKED
   VERBATIM by create-ai-audit and become the join key for every future comparison, so "1. " left
   on the front would silently become part of the measured question.

   ⛔ STRIP ONLY A LEADING MARKER, NEVER MID-TEXT DIGITS. "2) Who fixes a boiler?" → "Who fixes a
   boiler?", but "How much does 24/7 cover cost?" and "Top 10 plumbers in Wisbech?" keep every
   character — a question is allowed to contain numbers.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

/* Leading list markers, anchored to the START of the trimmed line:
   "1." "1)" "(1)" "12 -" "•" "-" "*" "–" "—" "→" and a trailing separator/space run.
   A bare number needs a following separator (., ), -, :) or whitespace so a question that simply
   begins with a figure ("2026 boiler rules?") is not decapitated. */
const LIST_MARKER = /^\s*(?:\(\d{1,3}\)|\d{1,3}\s*[.)\]:-]|[-*•·–—→▪‣]|[a-z]\s*[.)])\s+/i;
/* The one ambiguous case, handled explicitly: "1. " style where the separator is glued to the
   number and followed immediately by text ("1.Who fixes boilers?"). */
const GLUED_NUMBER = /^\s*(?:\(\d{1,3}\)|\d{1,3}\s*[.)\]])(?=\S)/;

/** Strip a single leading list marker from one line. Idempotent-safe: only one marker is removed,
 *  so "- 1. thing" becomes "1. thing" rather than losing real content silently. */
export function stripListMarker(line: string): string {
  const t = line.trim();
  const m = t.replace(LIST_MARKER, '');
  if (m !== t) return m.trim();
  const g = t.replace(GLUED_NUMBER, '');
  return (g !== t ? g : t).trim();
}

/** How many lines the operator actually pasted — the denominator in "N clean questions from M
 *  lines", so the cleanup is visible rather than silent. */
export function pasteLineCount(raw: string): number {
  return String(raw ?? '').split(/\r?\n/).length;
}

/** Parse a pasted block into clean question strings: one per non-blank line, marker stripped,
 *  trimmed, exact duplicates collapsed (a pasted list often repeats a line by accident — and the
 *  audit would otherwise pay to ask the same question twice). Order is preserved. */
export function parseQuestionPaste(raw: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of String(raw ?? '').split(/\r?\n/)) {
    const q = stripListMarker(line);
    if (!q) continue;                       // blank lines vanish
    /* ⛔ A QUESTION MUST CONTAIN A LETTER. Caught by the tests: a marker-only line ("1." on its
       own, or a stray "-") leaves a residue the marker regexes can't strip (they require text
       after the marker), which would otherwise become a junk row that costs money to ask. */
    if (!/[a-z]/i.test(q)) continue;
    const key = q.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}
