/* ════════════════════════════════════════════════════════════════════════════════════════════════
   A TOWN REFUSAL, IN PLAIN WORDS (2026-10-16).

   create-ai-audit answers "town_unverified: Google could not confirm the town…" (409) or "local_scope_needs_town" (400) when a
   lead's town cannot be used. Those are codes. The audit popup shows THIS instead, with the fix (Confirm town) beside it.
   Pure, no imports. The fix itself is lead_confirm_town (supabase/migrations/20261101090000_town_confirmed_import.sql).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

const TOWN_REFUSAL_MARKERS = [
  'town_unverified', 'no_usable_town', 'local_scope_needs_town', 'no usable town', 'could not confirm the town', "couldn't confirm which town",
];

/** True when an error (a code, a message, or both joined) is the audit refusing because the town cannot be used. */
export function isTownRefusal(raw: unknown): boolean {
  const t = String(raw ?? '').toLowerCase();
  return !!t && TOWN_REFUSAL_MARKERS.some((m) => t.includes(m));
}

/** What the popup says. `town` is what is on the lead now ('' when blank). */
export function townRefusalWords(town: string | null | undefined): { headline: string; detail: string } {
  const t = String(town ?? '').trim();
  return {
    headline: "We couldn't confirm which town this business is in",
    detail: t
      ? `The lead says "${t}". If that is right, confirm it below and the audit will run on it. If it is wrong, type the right town.`
      : 'There is no town on the lead. Type the town the business is in and confirm it; the audit will run on it.',
  };
}
