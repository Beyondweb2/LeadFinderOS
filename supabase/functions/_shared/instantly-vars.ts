/* ════════════════════════════════════════════════════════════════════════════════════════════
   THE INSTANTLY MERGE FIELDS, WITHOUT AN AUDIT.

   Paul, 2026-09-09: "I'm dropping {{competitors}} from the email, so no audit is needed. Add leads
   straight to the campaign — no audit, no audit cost." The four fields the email now merges are
   business name, trade, town and email, and every one of them is already on the LEAD ROW.

   ⛔ WHY THIS EXISTS AT ALL, RATHER THAN JUST DELETING THE RESOLVER CALL. resolveAuditReplyVars did
   two jobs at once: it produced the variables AND it refused a lead whose variables would be
   broken. Dropping it wholesale would have taken the refusal with it, and the refusal is the half
   that matters — the comment it lives under records exactly what happens otherwise: a variable that
   "would have rendered as nothing, mid-sentence, in a real email."

   ⛔ SO A MISSING TRADE OR TOWN STILL REFUSES, it just no longer needs an audit to be known. The
   audit was never the source of truth for either; it was simply where they had been copied to.
   `search_keyword || category` is how the wizard, the bulk audit and the triage ladder have always
   sourced a trade, and `derived_town || search_location` is the town rule from the wrong-town
   incident: the derived one is resolved from the Places address and is the truthful one, the typed
   one can be a neighbouring town.

   ⚠️ THE VARIABLE NAMES ARE THE CONTRACT. Instantly fills {{business_name}} by EXACT name against
   what was uploaded; a rename here renders as an empty string in a sent email rather than erroring.
   Change these only alongside the campaign's templates.
   ⚠️ `competitors` and `report_url` are DELIBERATELY ABSENT from this shape. Sending them empty
   would be the mid-sentence hole above; not sending them at all means a template still referencing
   one renders it empty too — which is the intended end state, because the template is losing them.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

/** The lead columns this needs. A subset of what instantly-push already selects. */
export interface InstantlyLeadRow {
  id: string;
  business_name?: string | null;
  email?: string | null;
  category?: string | null;
  search_keyword?: string | null;
  search_location?: string | null;
  derived_town?: string | null;
}

/** Exactly what gets uploaded per lead. Keys are the merge-field names. */
export interface InstantlyVars {
  business_name: string;
  trade: string;
  city: string;
}

export type InstantlyVarsResult =
  | { ok: true; vars: InstantlyVars }
  | { ok: false; reason: string };

const clean = (v: unknown): string => String(v ?? '').replace(/\s+/g, ' ').trim();

/**
 * Build the merge fields for one lead, or say why it cannot be emailed.
 *
 * ⚠️ WHITESPACE-ONLY COUNTS AS MISSING, and that is not pedantry — a trade of " " passes a bare
 * truthiness test, uploads happily, and renders as a gap in the sentence. Same reasoning as
 * clientHeld.ts: absence is a value, and it has to be tested for rather than assumed away.
 */
export function instantlyVarsFor(row: InstantlyLeadRow): InstantlyVarsResult {
  const business_name = clean(row.business_name);
  if (!business_name) return { ok: false, reason: 'no business name stored — {{business_name}} would render empty' };

  /* The trade, sourced exactly as every other caller sources it. */
  const trade = clean(row.search_keyword) || clean(row.category);
  if (!trade) return { ok: false, reason: 'no trade stored — {{trade}} would render empty. Add the trade on the lead.' };

  /* The town. derived_town first: it is resolved from the Places address, and search_location is
     what was TYPED — which the wrong-town incident showed can be a neighbouring town entirely. */
  const city = clean(row.derived_town) || clean(row.search_location);
  if (!city) return { ok: false, reason: 'no town stored — {{city}} would render empty' };

  return { ok: true, vars: { business_name, trade, city } };
}
