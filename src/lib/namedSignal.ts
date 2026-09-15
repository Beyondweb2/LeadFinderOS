/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WAS THE CLIENT NAMED IN THIS ANSWER? ONE PREDICATE, READ BY EVERY SURFACE THAT COUNTS.

   🔴 THE FAULT THIS REPLACES. `named` was written at scan time by
   `nameMatches(answer_text, businessName)` — a string test against the RAW answer. So a business
   whose name is made of its own trade and town scores on an answer that has never heard of it:
   "BS4 Electrical Services Ltd" reads 6 of 6 because the answer about electricians in Bristol
   contains "BS4" and "electrical" anyway. Measured 2026-09-15: 147 of 1,099 lead-linked audits
   (13%) carry such a name, and it breaks BOTH ways — "Burnley Locksmiths" was told AI already
   names it everywhere, "CJ Plumbing Services" was told AI never names it at all.

   ⛔ THE SIGNAL IS NOW THE MODEL'S, NOT A SUBSTRING'S. `extract-competitors` already reads every
   answer with gpt-4o to pull out the competitor firms; it is now also asked, per answer, whether
   the AUDITED BUSINESS is one of the businesses that answer presents. That verdict is stored on
   the cell as `self_named`, and this file is the only place anything decides what it means.

   ⛔ WHY THE MODEL IS TRUSTED FOR THIS, MEASURED RATHER THAN ASSUMED (2026-09-15). Across the
   5,957 distinct names gpt-4o has written into this field, ZERO are bare postcodes. Across the
   19,046 the old regex scraper wrote, 203 are — `PE29`, `BS5`, `DN14`, `LE2`. The model does not
   mistake a postcode for a business; the string test cannot tell the difference at all.

   ⛔ ABSENCE FALLS BACK, IT DOES NOT SCORE ZERO. A cell with no `self_named` is one the extractor
   has not read (every audit before this change, and any run whose cleaning failed). Reading that
   as "not named" would silently zero the whole book, including two paying clients' frozen
   baselines. It falls back to the stored string match — the number that has always been shown —
   and `namedEvidence` is how a caller that needs to know the difference asks.

   ⚠️ A `self_named` of false is a REAL ANSWER and overrides the string match. That is the entire
   point: it is what corrects "Burnley Locksmiths, 6 of 6" down to what AI actually said.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** The shape every caller has: one engine's stored result on one queue row. */
export type NamedCell = {
  named?: unknown;
  self_named?: unknown;
  answer_text?: unknown;
} | null | undefined;

/** How this cell's naming verdict was reached. */
export type NamedEvidence = 'model' | 'string_match' | 'none';

export function namedEvidence(cell: NamedCell): NamedEvidence {
  if (!cell || typeof cell !== 'object') return 'none';
  if (typeof (cell as { self_named?: unknown }).self_named === 'boolean') return 'model';
  return 'string_match';
}

/** ⛔ THE ONE QUESTION. The model's verdict when there is one, the legacy string match otherwise. */
export function cellNamed(cell: NamedCell): boolean {
  if (!cell || typeof cell !== 'object') return false;
  const c = cell as { named?: unknown; self_named?: unknown };
  if (typeof c.self_named === 'boolean') return c.self_named;
  return c.named === true;
}

/** Has the extractor read this cell? Used to decide whether an unjudgeable NAME still needs the
 *  hand-check refusal on the client report. */
export function hasModelNamedEvidence(cell: NamedCell): boolean {
  return namedEvidence(cell) === 'model';
}

/* ⛔ A COMPARISON MUST USE ONE MEASURE ON BOTH SIDES, AND THIS IS WHY THE MODE EXISTS.
   A day-28 replay read by the model against a day-0 baseline read by the string match is not a
   before-and-after: a client whose name flatters the string test would "fall" purely because the
   ruler changed, and that number decides a refund. So a comparison asks this first, and drops to
   the legacy measure on BOTH sides unless BOTH have been read by the model. */
export type NamedMode = 'auto' | 'legacy';

export function namedInMode(cell: NamedCell, mode: NamedMode): boolean {
  if (mode === 'legacy') {
    if (!cell || typeof cell !== 'object') return false;
    return (cell as { named?: unknown }).named === true;
  }
  return cellNamed(cell);
}

/** True when EVERY answered cell given has been read by the model. Fed both sides of a comparison;
 *  anything less returns false and the comparison stays on the legacy measure. */
export function allCellsModelRead(cells: NamedCell[]): boolean {
  let answered = 0;
  for (const c of cells) {
    if (!c || typeof c !== 'object') continue;
    answered++;
    if (!hasModelNamedEvidence(c)) return false;
  }
  return answered > 0;
}
