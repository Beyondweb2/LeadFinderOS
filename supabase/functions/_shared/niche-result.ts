/* ════════════════════════════════════════════════════════════════════════════════════════════
   THE NICHE FOLD'S VIEW OF A QUEUE RESULT (2026-09-28).

   market-view's niche lookup reads ai_audit_queue.result_niche — the trimmed copy the parts trigger
   keeps equal to public.niche_result_slim(result) (migration 20260928090000; backfilled and verified
   at 0 differences over 8,251 rows) — instead of the full result, whose answer text is ~65% of it and
   which the fold never reads. result stays the source of truth.

   The trimmed copy stores `answer_present` (the JavaScript truthiness of answer_text) instead of the
   text. This turns it back into the shape the fold has always read, so NOT ONE LINE of the fold,
   classifyWinnability, cellNamed or runIsModelRead changes:
     • per engine: named, self_named, position, competitors, citations ([{url}]) as stored;
     • answer_text: `true` when answer_present, absent otherwise. ⚠️ A boolean, deliberately not a
       made-up string: runIsModelRead only tests its truthiness, and cellNamed's text judge requires a
       STRING — so no code can ever name-match against a placeholder. The niche calls cellNamed with no
       text context, so it never reads the text anyway.
   A null / non-object value becomes {} — exactly the fold's own `r.result ?? {}`.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
export function nicheFoldResult(slim: unknown): Record<string, unknown> {
  if (!slim || typeof slim !== "object" || Array.isArray(slim)) return {};
  const out: Record<string, unknown> = {};
  for (const [engine, value] of Object.entries(slim as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) { out[engine] = value; continue; }
    const { answer_present, ...fields } = value as Record<string, unknown>;
    out[engine] = answer_present === true ? { ...fields, answer_text: true } : fields;
  }
  return out;
}
