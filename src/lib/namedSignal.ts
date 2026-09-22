/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WAS THE CLIENT NAMED IN THIS ANSWER? ONE PREDICATE, READ BY EVERY SURFACE THAT COUNTS.

   🔴 THE FIRST FAULT THIS REPLACED (2026-09-15). `named` was written at scan time by
   `nameMatches(answer_text, businessName)` — a string test against the RAW answer. So a business
   whose name is made of its own trade and town scores on an answer that has never heard of it:
   "BS4 Electrical Services Ltd" reads 6 of 6 because the answer about electricians in Bristol
   contains "BS4" and "electrical" anyway. Measured: 147 of 1,099 lead-linked audits (13%) carry
   such a name, and it breaks BOTH ways. The model's per-answer verdict (`self_named`, written by
   extract-competitors) became the signal, with the string flag as the fallback.

   🔴 THE SECOND FAULT (2026-09-22, MCLocksmiths' frozen baseline). The model verdict is itself
   wrong on the evidence: on 120 stored answers it said "not named" for five answers that plainly
   list "MC Locksmiths" in prose and "named" for two that never mention the business at all. And
   the string fallback could not see "MC Locksmiths" as "MCLocksmiths centre". The raw answer text
   is the evidence; a verdict about it is not allowed to contradict it.

   ⛔ THE RULE NOW, IN ORDER (Paul, 2026-09-22):
     1. THE ANSWER TEXT, when the caller supplies the business and its trade/town and the name is
        text-judgeable (something survives once trade, town and legal forms are removed — see
        nameIsTextJudgeable). Deterministic: nameMatches over the answer's PROSE (URLs and cited
        domains stripped first, so a source address is never a naming), spelling-tolerant for
        joined/split/punctuated forms of the same name, never fuzzy.
     2. THE MODEL'S VERDICT (`self_named`) when the text cannot decide — a trade-and-town name, no
        answer text stored, or no context supplied.
     3. THE STORED STRING FLAG (`named`) when the model has not read the answer either.
   Absence still falls back, it does not score zero: every audit before the extractor existed, and
   every caller that has no context, behaves exactly as before.

   ⚠️ IMPORTED BY EDGE FUNCTIONS: relative imports with explicit `.ts` only. nameMatch.ts is itself
   a dependency-free leaf.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { answerProse, nameIsTextJudgeable, nameMatches } from './nameMatch.ts';

export type NamedCell = {
  named?: unknown;
  self_named?: unknown;
  answer_text?: unknown;
} | null | undefined;

/** Who the client is, so the answer text can be read. Trade or town is required for the text to
 *  count (without them a trade-and-town name cannot be told from the trade). */
export type NamedContext = {
  businessName?: string | null;
  trade?: string | null;
  town?: string | null;
};

export type NamedEvidence = 'text' | 'model' | 'string_match' | 'none';

function textCanJudge(cell: NamedCell, ctx: NamedContext | undefined): ctx is NamedContext & { businessName: string } {
  if (!ctx || !cell || typeof cell !== 'object') return false;
  const name = typeof ctx.businessName === 'string' ? ctx.businessName.trim() : '';
  if (!name) return false;
  const text = (cell as { answer_text?: unknown }).answer_text;
  if (typeof text !== 'string' || !text.trim()) return false;
  return nameIsTextJudgeable(name, { trade: ctx.trade ?? null, town: ctx.town ?? null });
}

export function namedEvidence(cell: NamedCell, ctx?: NamedContext): NamedEvidence {
  if (!cell || typeof cell !== 'object') return 'none';
  if (textCanJudge(cell, ctx)) return 'text';
  if (typeof (cell as { self_named?: unknown }).self_named === 'boolean') return 'model';
  return 'string_match';
}

export function cellNamed(cell: NamedCell, ctx?: NamedContext): boolean {
  if (!cell || typeof cell !== 'object') return false;
  const c = cell as { named?: unknown; self_named?: unknown; answer_text?: unknown };
  if (textCanJudge(cell, ctx)) {
    return nameMatches(answerProse(String(c.answer_text)), ctx.businessName, { trade: ctx.trade ?? null, town: ctx.town ?? null });
  }
  if (typeof c.self_named === 'boolean') return c.self_named;
  return c.named === true;
}

export function hasModelNamedEvidence(cell: NamedCell): boolean {
  return !!cell && typeof cell === 'object' && typeof (cell as { self_named?: unknown }).self_named === 'boolean';
}

/* ⛔ A COMPARISON MUST USE ONE RULER ON BOTH SIDES (measurementCompare.ts).
   A day-28 replay read by the model against a day-0 baseline read by the string match is not a
   before-and-after: a client whose name flatters the string test would "fall" purely because the
   ruler changed, and that number decides a refund. So a comparison asks this first, and drops to
   the legacy measure on BOTH sides unless BOTH have been read by the model. With a NamedContext the
   text is the ruler on both sides regardless, which is the one ruler that cannot drift between
   day 0 and day 28. */
export type NamedMode = 'auto' | 'legacy';

export function namedInMode(cell: NamedCell, mode: NamedMode, ctx?: NamedContext): boolean {
  if (textCanJudge(cell, ctx)) return cellNamed(cell, ctx);
  if (mode === 'legacy') {
    if (!cell || typeof cell !== 'object') return false;
    return (cell as { named?: unknown }).named === true;
  }
  return cellNamed(cell);
}

export function allCellsModelRead(cells: NamedCell[]): boolean {
  let answered = 0;
  for (const c of cells) {
    if (!c || typeof c !== 'object') continue;
    answered++;
    if (!hasModelNamedEvidence(c)) return false;
  }
  return answered > 0;
}
