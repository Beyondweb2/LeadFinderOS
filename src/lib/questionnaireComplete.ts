/* ════════════════════════════════════════════════════════════════════════════════════════════════
   HAS THIS CLIENT FINISHED THE POST-PAYMENT QUESTIONNAIRE? — asked in one place.

   🔴 WHY THIS LEAF EXISTS (2026-09-14). The same question was written out independently in FOUR
   places. On 2026-08-22 `business_address` left the questionnaire — a paying customer was trapped
   on mobile hand-typing a full address, and the address is collected at delivery instead. Two of
   the four copies were relaxed to match. Two were not:

     • stripe-webhook's PAID email kept requiring the address, so every real first payment was
       reported as "details not yet collected" AND subject-tagged "(NOT LINKED)" — a customer who
       had given everything that matters, described to Paul as a broken payment.
     • LeadQuestionnaireSection's `q2Done` kept requiring it too, so a finished paying client read
       "Paid — awaiting details" on the lead card FOR EVER.

   ⛔ EACH COPY WAS CORRECT-LOOKING ON ITS OWN, WHICH IS WHY NOTHING CAUGHT IT. A static check for
   "a column nothing writes" cannot help: the column is still written whenever a value arrives, the
   form still sends it, the input still exists. It simply became optional. That was proven against
   the pre-fix tree before this file was written, rather than assumed.

   ⛔ SO THE FIX IS STRUCTURAL, NOT ANOTHER CHECK. One predicate, four importers: there is no second
   copy left to go stale, which makes the class impossible rather than merely watched for. Same
   pattern as leadPayment, auditKind, coldOutreach and measuringState.

   ⚠️ ZERO IMPORTS AND NO Deno — two edge functions read it, so it must stay a leaf, and every edge
   import of it needs the explicit `.ts` extension (CLAUDE.md §4).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** The two answers that decide it. Anything else on the row is irrelevant to this question. */
export interface QuestionnaireAnswers {
  confirmed_location?: string | null;
  services?: string | null;
  services_list?: unknown;
}

/* ⛔ THESE TWO, AND THE REASON IS NOT TASTE. They are exactly what `startPaidBaseline` waits for
   before it will run the measurement the guarantee is settled against — so "complete" here means
   "the baseline can run", which is the only definition that pays for itself. Adding a third field
   would make a client complete on one screen and outstanding on another, which is the bug this
   file was extracted to end. */
export const QUESTIONNAIRE_REQUIRED_FIELDS = ['confirmed_location', 'services'] as const;

/** Absent, null, empty and whitespace are all "not given" — the house rule for a held value. */
const given = (v: string | null | undefined): boolean => !!String(v ?? '').trim();

/**
 * Which required answers are still missing. Empty means finished.
 *
 * Returned as names rather than a boolean because two callers need to SAY which one is absent —
 * `startPaidBaseline`'s skip reason and findable-onboarding's 400 both name the field, and a
 * caller that had to re-derive that would be a fifth copy of this rule in all but name.
 */
export function missingQuestionnaireFields(row: QuestionnaireAnswers | null | undefined): string[] {
  return QUESTIONNAIRE_REQUIRED_FIELDS.filter((field) => field === 'services'
    ? effectiveQuestionnaireServices(row).length === 0
    : !given(row?.[field]));
}

/** One service representation for every caller: the legacy string and structured list are peers. */
export function effectiveQuestionnaireServices(row: QuestionnaireAnswers | null | undefined): string[] {
  const raw = [
    ...(Array.isArray(row?.services_list) ? row.services_list : []),
    ...String(row?.services ?? '').split(','),
  ];
  const seen = new Set<string>();
  return raw.flatMap((value) => typeof value === 'string' ? [value.trim()] : []).filter((value) => {
    const key = value.toLocaleLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * True when the post-payment questionnaire has everything the baseline needs.
 *
 * ⚠️ THIS SAYS NOTHING ABOUT PAYMENT. A row that was never paid for is not "outstanding" — it has
 * nothing outstanding, because nobody has asked it anything yet. Callers that care about money
 * (needsQ2, the PAID email) test that separately and deliberately, so this predicate stays about
 * the one thing its name claims.
 */
export function questionnaireComplete(row: QuestionnaireAnswers | null | undefined): boolean {
  return missingQuestionnaireFields(row).length === 0;
}
