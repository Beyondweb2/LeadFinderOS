/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WHICH OF THE REVIEWED QUESTIONS ACTUALLY RUN — the discovery audit's selection.

   ⛔ WHY SELECTION IS NOT DELETION. The wizard's review step has always let an operator delete a
   question they did not want. For a 1..80 discovery audit that is the wrong tool: deleting loses the
   question, so changing your mind means regenerating the whole set and losing the other 79 too.
   Selection keeps every generated question on screen and decides which ones are queued.

   ⛔ THE IDENTITY IS THE INDEX, NOT THE TEXT. Two questions can be edited into the same string for
   as long as it takes to finish typing, and a selection keyed on text would merge them and
   silently drop one. So the selection is a set of indexes, and it is RECONCILED whenever the list
   changes shape — which is what this module is: the four things the editor can do to the list, and
   what each one means for the selection. Anything it cannot recognise selects everything, because
   the safe failure here is "you are about to run more than you meant" (visible in the count and
   the total, and refused at 81) rather than "we quietly dropped some".

   PURE. No React — the reconciliation is exactly the part worth a test.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Every index of `questions`, selected. */
export function selectAll(questions: readonly string[]): Set<number> {
  return new Set(questions.map((_, i) => i));
}

/** The selected questions, in list order, trimmed, with blanks dropped. This is what gets queued. */
export function selectedQuestions(questions: readonly string[], selected: ReadonlySet<number>): string[] {
  return questions
    .map((q, i) => (selected.has(i) ? (q ?? '').trim() : ''))
    .filter((q) => q.length > 0);
}

/**
 * Carry a selection across a change to the question list.
 *
 * The editor makes exactly four kinds of change, and each has a different consequence:
 *   · an EDIT in place (same length)      → the indexes still mean the same questions; unchanged.
 *   · an APPEND (one longer, prefix same) → the new question is selected, like a question you just
 *                                           typed being one you meant to ask.
 *   · a REMOVE (one shorter)              → every index after the removed one shifts down by one.
 *                                           Getting this wrong would move the selection onto its
 *                                           neighbours, which looks like the checkboxes ticking
 *                                           themselves.
 *   · anything else (a paste, a regenerate, a first fill) → a different list; select all of it.
 */
export function reconcileSelection(
  previous: readonly string[],
  next: readonly string[],
  selected: ReadonlySet<number>,
): Set<number> {
  if (next.length === previous.length) {
    // An in-place edit. Indexes are unchanged, so the selection is too.
    return new Set(selected);
  }
  if (next.length === previous.length + 1) {
    /* An append only if everything before the new tail is untouched — a paste that happens to add
       exactly one question is a different list and falls through to select-all. */
    const appended = previous.every((q, i) => q === next[i]);
    if (appended) return new Set([...selected, previous.length]);
    return selectAll(next);
  }
  if (next.length === previous.length - 1) {
    const at = firstDifference(previous, next);
    /* A removal only if the two lists agree either side of `at` — otherwise it is a paste that
       shortened the list, which is a new set of questions rather than the same ones minus one. */
    const removal = previous.every((q, i) => (i < at ? q === next[i] : i === at ? true : q === next[i - 1]));
    if (!removal) return selectAll(next);
    const out = new Set<number>();
    for (const i of selected) {
      if (i === at) continue;
      out.add(i > at ? i - 1 : i);
    }
    return out;
  }
  return selectAll(next);
}

/** The first index at which the two lists differ; the shorter length when they share a prefix. */
function firstDifference(a: readonly string[], b: readonly string[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return n;
}
