/* ════════════════════════════════════════════════════════════════════════════════════════════
   OUTREACH PROGRESSIVE LOADING — the rules (Paul, 2026-09-28).

   The Outreach page (Admin and Sales, one shared page) shows the NEWEST 1,000 leads as soon as they
   arrive and loads the rest behind them. Everything that decides what the operator may do while the
   list is incomplete lives here, pure, so it is tested directly (scripts/outreach-progressive.test.ts).

   ⛔ POSITIVE MATCH ON "COMPLETE". Anything that needs the whole dataset — select all, every bulk
   action (WhatsApp, audits, product, trade, status, Sales' opener), CSV import/export, the Paid filter,
   the shared-phone count — is allowed ONLY when phase === 'complete'. 'loading', 'partial', 'failed'
   and anything unknown all mean "not yet". The first 1,000 are never silently treated as the whole list.

   Where the rows come from is unchanged: leadSourceFor(role) — the admin's 41-column list from
   outreach_leads, a salesperson's safe sales_leads view (their own assigned prospects only). The exact
   count comes from the same source with the same filter, so a salesperson's count is theirs alone.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

export const OUTREACH_FIRST_BATCH = 1000;

export type LeadLoadPhase = 'loading' | 'partial' | 'complete' | 'failed';

export interface LeadLoadState {
  phase: LeadLoadPhase;
  /** Active leads held so far. */
  loaded: number;
  /** The exact active-lead count from the first request (null until it answers). */
  total: number | null;
  /** Why the background load failed (phase 'failed' only). */
  error: string | null;
}

export const LEAD_LOAD_INITIAL: LeadLoadState = { phase: 'loading', loaded: 0, total: null, error: null };
export const LEAD_LOAD_COMPLETE = (loaded: number): LeadLoadState => ({ phase: 'complete', loaded, total: loaded, error: null });

/** The ONE gate for everything that needs the complete dataset. */
export function datasetComplete(s: LeadLoadState | null | undefined): boolean {
  return !!s && s.phase === 'complete';
}

const n = (x: number) => x.toLocaleString('en-GB');

/** The notice above the table while incomplete; null once complete. */
export function leadLoadNotice(s: LeadLoadState): { tone: 'info' | 'error'; text: string } | null {
  if (datasetComplete(s) || s.phase === 'loading') return null;
  const remaining = s.total != null ? Math.max(0, s.total - s.loaded) : null;
  if (s.phase === 'failed') {
    return {
      tone: 'error',
      text: `The remaining ${remaining != null ? n(remaining) + ' ' : ''}leads failed to load. Showing results so far from the newest ${n(s.loaded)} leads only — select all, bulk actions, CSV, the Paid filter and the shared-phone count stay off until everything loads.`,
    };
  }
  return {
    tone: 'info',
    text: `Showing results so far from the newest ${n(s.loaded)} leads. Loading the remaining ${remaining != null ? n(remaining) : ''} — select all, bulk actions, CSV, the Paid filter and the shared-phone count unlock when it finishes.`,
  };
}

/* ⛔ ONE COUNT WHILE PARTIAL (Paul, 2026-09-28): ACTIVE loaded of ACTIVE total, in the title AND the
   pager. The archived leads (loaded whole up front) are left out of the partial list entirely —
   OutreachTable drops them until complete — so no visible number mixes "1,000 active" with "116
   archived". Once complete, the normal counts (which include archived) come back unchanged. */

/** The count beside the title: the real total once complete, "active loaded of active total" before. */
export function leadCountLabel(s: LeadLoadState, shownCount: number): string {
  if (datasetComplete(s) || s.total == null) return n(shownCount);
  return s.phase === 'failed'
    ? `${n(s.loaded)} of ${n(s.total)} active, incomplete`
    : `${n(s.loaded)} of ${n(s.total)} active, loading`;
}

/** The suffix for "Showing 1 to 15 of N" / filter results while incomplete. */
export function partialResultsSuffix(s: LeadLoadState): string {
  if (datasetComplete(s)) return '';
  return s.total != null
    ? ` — partial results: ${n(s.loaded)} of ${n(s.total)} active leads loaded so far`
    : ` — partial results from the newest ${n(s.loaded)} leads`;
}

/** While incomplete the table shows ACTIVE rows only (unless it is the archive view itself). */
export function visibleWhileLoading<T extends { is_archived?: boolean | null }>(s: LeadLoadState, rows: T[], isArchiveView = false): T[] {
  if (datasetComplete(s) || isArchiveView) return rows;
  return rows.filter((r) => r.is_archived !== true);
}

/* ⛔ WHICH ROWS THE LIST SHOWS BY ARCHIVE STATE (2026-09-28, Paul): Outreach is the ACTIVE working list
   for BOTH roles (Sales first, the admin's too later the same day) — archived leads (a contacted lead
   removed from my leads, a not-interested one) are hidden unless the Archived view under Filters is on.
   Archived rows keep owner, history and contact activity; hiding them changes nothing in the data and
   nothing about the claim rule. 'all' remains for the separate archive view (isArchiveView). */
export type ArchiveView = 'all' | 'active' | 'archived';
export function archiveViewFor(splitArchived: boolean, showArchived: boolean): ArchiveView {
  return splitArchived ? (showArchived ? 'archived' : 'active') : 'all';
}
export function rowsForArchiveView<T extends { is_archived?: boolean | null }>(rows: T[], view: ArchiveView): T[] {
  if (view === 'archived') return rows.filter((r) => r.is_archived === true);
  if (view === 'active') return rows.filter((r) => r.is_archived !== true);
  return rows;
}

type Row = { id: string };

/**
 * Lay the background result over what the operator has done meanwhile.
 *
 * `shown` is the exact row objects first put on screen (active and archived). Every edit replaces a
 * row object (updateLead swaps in the database's reply; local patches spread a new object), so
 * identity says what changed:
 *   • unchanged since shown, or never shown  → the freshly fetched row;
 *   • edited, moved between active/archived, or added locally → the LOCAL row, in the list it is in now;
 *   • shown but gone from both local lists (deleted) → stays gone, never resurrected.
 * Fetched order is kept; local rows the fetch does not have (new ones) go first, as addLead does.
 */
export function mergeAfterBackgroundLoad<T extends Row>(input: {
  shownActive: readonly T[]; shownArchived: readonly T[];
  localActive: readonly T[]; localArchived: readonly T[];
  fetchedActive: readonly T[]; fetchedArchived: readonly T[];
}): { active: T[]; archived: T[] } {
  const shownA = new Map(input.shownActive.map((r) => [r.id, r]));
  const shownR = new Map(input.shownArchived.map((r) => [r.id, r]));
  const localA = new Map(input.localActive.map((r) => [r.id, r]));
  const localR = new Map(input.localArchived.map((r) => [r.id, r]));
  const touched = (id: string): boolean => {
    const la = localA.get(id), lr = localR.get(id), sa = shownA.get(id), sr = shownR.get(id);
    if (!sa && !sr) return !!(la || lr);          // never shown: local only if it exists locally (added)
    if (!la && !lr) return true;                  // shown, now gone → deleted locally
    if (la) return la !== sa;                     // edited in place, or moved INTO active
    return lr !== sr;                             // edited in place, or moved INTO archived
  };
  const side = (fetched: readonly T[], local: Map<string, T>, localList: readonly T[]) => {
    const fetchedIds = new Set(fetched.map((r) => r.id));
    const kept: T[] = [];
    for (const r of fetched) {
      if (!touched(r.id)) { kept.push(r); continue; }
      const mine = local.get(r.id);
      if (mine) kept.push(mine);                  // local edit wins, in place
    }
    const added = localList.filter((r) => touched(r.id) && !fetchedIds.has(r.id));
    return [...added, ...kept];
  };
  return {
    active: side(input.fetchedActive, localA, input.localActive),
    archived: side(input.fetchedArchived, localR, input.localArchived),
  };
}
