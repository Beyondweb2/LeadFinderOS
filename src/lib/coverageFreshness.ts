/* ════════════════════════════════════════════════════════════════════════════════════════════
   WHEN DOES THE COVERAGE CACHE STOP BEING TRUE?

   Coverage's counts come from an edge function, cached by React Query with staleTime 5 minutes and
   refetchOnWindowFocus off. Nothing invalidated it, so adding a lead on Find Leads and returning to
   Coverage inside five minutes served the PRE-ADD payload — and only a hard refresh (which throws the
   in-memory cache away) showed the new count. That is the whole bug.

   ⛔ NINE WRITES CHANGE WHAT THAT ENDPOINT COUNTS, not one: addLead, deleteLead, removeFreshLead,
   archiveLeadInternal, archiveAll, archiveMultiple, unarchiveLead, unarchiveMultiple, and the
   inline auto-archive. Nine remembered `invalidateQueries` calls is a rule the tenth writer breaks,
   and this codebase's recurring failure is precisely a guard the new case never reaches.

   So the trigger is DERIVED from the same lead state the screen renders: if the list the operator
   sees changed, the coverage cache is stale. The two become one event by construction, and a future
   write cannot forget to announce itself — a write that does not move this state does not move the
   screen either.

   ⚠️ THIS IS A CHANGE DETECTOR, NEVER A GRADING RULE, and the distinction is what makes it safe to
   mirror the endpoint's own "contacted" test here. The numbers on Coverage always come from the
   server; this only decides WHEN to go and ask again. If it ever drifts from the endpoint the worst
   case is a refetch too many or a refetch too late — never a wrong figure on screen. A second copy
   of a rule that decided a NUMBER would be the drift CLAUDE.md keeps recording; a second copy of a
   rule that decides a CACHE READ is a different kind of thing.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The React Query key for the coverage view.
 *
 * ⛔ IT LIVES HERE, IN NEITHER CONSUMER. The READER (useCoverage) and the WRITER (useOutreach, which
 * invalidates it) both need it, and a key defined inside one hook and imported by the other is a hook
 * importing a hook for a constant — plus it drags the Supabase client into anything that wants to
 * test the key. One neutral module, one definition, testable.
 *
 * ⛔ SCOPED TO THE USER. Every fact behind the view is owner-filtered server-side, so a cache shared
 * across sign-ins would show one operator another's coverage until it went stale — and one
 * operator's write must never invalidate another's cache.
 */
export const coverageQueryKey = (userId: string | undefined) => ['coverage', userId] as const;

/**
 * The key for the STATIC town list, split from the dynamic pairs above (2026-08-19).
 *
 * ⛔ A SEPARATE KEY SO A LEAD-ADD DOES NOT REFETCH 733 TOWNS. useOutreach invalidates
 * `coverageQueryKey` (the pairs) when the lead list changes; the towns are ONS data that only move on
 * a reseed or a suppression, so they hard-cache (staleTime Infinity) and returning to Coverage after
 * adding a lead re-reads only the small pairs. Suppression writes patch THIS cache directly.
 */
export const coverageTownsQueryKey = (userId: string | undefined) => ['coverage-towns', userId] as const;

/** Only the fields that can move a town between coverage rungs. */
export interface CoverageRelevantLead {
  is_archived?: boolean | null;
  status?: string | null;
  whatsapp_sent_at?: string | null;
  instantly_pushed_at?: string | null;
  last_outreach_attempt_at?: string | null;
}

/**
 * Mirrors the coverage endpoint's own `contacted` test: a POSITIVE test on evidence of a send, never
 * "status is not new". `report_sent` counts because a report going out IS the outreach on the email
 * path.
 */
function isContacted(l: CoverageRelevantLead): boolean {
  return !!l.whatsapp_sent_at || !!l.instantly_pushed_at || !!l.last_outreach_attempt_at
    || String(l.status ?? "") === "report_sent";
}

/**
 * A short string that changes exactly when the coverage facts could have changed.
 *
 * Three numbers, because three things move a rung: how many active leads exist (the `leads` rung and
 * every count), how many are archived (the endpoint filters `is_archived = false`, so archiving
 * REMOVES a lead from a town), and how many have been contacted (the `worked` rung).
 *
 * ⚠️ DELIBERATELY NOT A HASH OF EVERY FIELD. Editing a note or a phone number cannot change a rung,
 * and making it invalidate would refetch 733 towns plus every lead and audit for nothing — on a page
 * whose slowness was itself a complaint.
 */
export function coverageSignature(
  active: readonly CoverageRelevantLead[],
  archived: readonly CoverageRelevantLead[],
): string {
  let contacted = 0;
  for (const l of active) if (isContacted(l)) contacted += 1;
  return `${active.length}|${archived.length}|${contacted}`;
}
