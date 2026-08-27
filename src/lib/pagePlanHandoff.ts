/* ════════════════════════════════════════════════════════════════════════════════════════════
   PAGE-PLAN → PAGE-GENERATOR HANDOFF — the "Build this page" resolution (Stage 2/3 bridge,
   2026-08-28, Paul's spec). Pure: the queue button and the tests drive the same function.

   ⛔ MODE IS DERIVED, NEVER ASKED — and never read from the row's page_type (hardcoded 'qa' at
   insert, untrustworthy). The rule:
     lead exists AND some of the row's verbatim questions sit in a real generator service page's
     queries[]  → Service+Area, seeded with that page's key
     otherwise  → Q&A, seeded with the row's primary question verbatim
   The join is EXACT STRING on the measured question (both sides store the same verbatim baseline
   strings), which sidesteps town-casing and job-text parsing entirely, and makes N-rows→1-page
   composites resolve naturally (each row's question is in the same page's queries[]).

   ⛔ NEVER A SILENT FAIL, NEVER THE WRONG PAGE. A lead client whose question maps to NO service
   page (trade-level "best locksmiths…" → homepage; measured-but-not-offered services) falls back
   to Q&A **with the generator's own exclusion reason** carried as `note`, so the operator is told
   why. `genPages === null` means the generator plan could NOT be read — that is a hard 'unresolved'
   (the caller must show it and not navigate), distinct from an empty-but-read plan.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

export interface HandoffRow {
  lead_id: string | null;
  baseline_audit_id: string;
  primary_question: string;
  /** Every variant question on the row, verbatim (primary included). */
  questions: string[];
}

export interface GenPlanPage { key: string; queries: string[] }
export interface GenExcluded { question: string; reason: string }

export type HandoffTarget =
  | { mode: 'service'; clientId: string; pageKey: string }
  | { mode: 'qa'; clientId: string; question: string; note?: string }
  | { mode: 'unresolved'; reason: string };

export function resolveHandoff(
  row: HandoffRow,
  genPages: GenPlanPage[] | null,      // null = generator plan could not be read (lead clients only)
  genExcluded: GenExcluded[] | null,
): HandoffTarget {
  const question = (row.primary_question ?? '').trim();
  if (!question) return { mode: 'unresolved', reason: 'this row has no primary question' };

  // National / lead-less client → Q&A, always.
  if (!row.lead_id) return { mode: 'qa', clientId: row.baseline_audit_id, question };

  // Lead client but the generator plan was unreadable → honest unresolved, never a guess.
  if (genPages === null) {
    return { mode: 'unresolved', reason: "couldn't read this client's generator plan — open the page generator manually" };
  }

  // Exact-question join, primary first then variants (a composite page carries all its questions).
  const candidates = [question, ...row.questions.filter((q) => q !== question)];
  for (const q of candidates) {
    const page = genPages.find((p) => p.queries.includes(q));
    if (page) return { mode: 'service', clientId: row.lead_id, pageKey: page.key };
  }

  // No service page — fall back to Q&A, carrying the generator's OWN reason when it has one.
  const ex = (genExcluded ?? []).find((e) => candidates.includes(e.question));
  return {
    mode: 'qa', clientId: row.baseline_audit_id, question,
    note: ex ? `No service page for this — ${ex.reason}. Opening as a Q&A article instead.`
      : 'No service page matches this question — opening as a Q&A article instead.',
  };
}

/** The generator URL for a resolved target — one place builds it so the seed params can't drift. */
export function handoffUrl(t: HandoffTarget): string | null {
  if (t.mode === 'service') return `/page-generator?mode=service&client=${encodeURIComponent(t.clientId)}&page_key=${encodeURIComponent(t.pageKey)}`;
  if (t.mode === 'qa') return `/page-generator?mode=qa&client=${encodeURIComponent(t.clientId)}&question=${encodeURIComponent(t.question)}`;
  return null;
}
