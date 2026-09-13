/* ============================================================
   DELIVERY COCKPIT — pure logic for the client cockpit in LeadDetailDialog (2026-08-18).

   Kept free of React/Supabase so the date maths and the re-measure clock are unit-tested in
   scripts/delivery-cockpit.test.ts. The re-measure date is the guarantee clock — the whole
   business turns on it not being missed — so its arithmetic and its amber/red thresholds are pinned
   by tests, not eyeballed.
   ============================================================ */

/** 4 weeks. The re-measure is due this many days after the baseline was taken.
 *
 *  🔴 WAS 56 (8 weeks) UNTIL 2026-09-03. The product moved to a 4-week cycle and the site now says
 *  so everywhere, including the guarantee sentence a customer agrees to at checkout — so this had
 *  to move with it or the operator tool would schedule a date the customer was never promised.
 *
 *  ⛔ IT ONLY SETS THE DEFAULT FOR A LEAD WITH NO STORED remeasure_due_date, WHICH IS WHY RG
 *  LOCKSMITHS NEEDED PINNING BY HAND. Ronnie's row already carries 2026-10-13, so his date is
 *  unaffected. RG's was null and therefore DERIVED, so this change would have silently moved his
 *  re-measure four weeks earlier — and he is the one LEGACY OUTCOME-GUARANTEE client, sold on
 *  "named in more AI answers after 8 weeks than today". Moving his date would change what he was
 *  sold. His +56 date is stored explicitly instead (SQL handed to Paul 2026-09-03).
 *
 *  ⚠️ SO A PROMISE ALREADY MADE LIVES IN THE COLUMN, NOT IN THIS CONSTANT. Anyone changing this
 *  again must check for paying customers whose date is still null before assuming it is only a
 *  default. */
export const REMEASURE_OFFSET_DAYS = 28;
/** Amber this many days out or fewer (still upcoming); red once overdue. Paul's spec 2026-08-18. */
export const REMEASURE_AMBER_DAYS = 7;

/** How an item is rendered and stored:
 *    tick      — a manual tick in outreach_leads.delivery_checklist (the JSON map)
 *    pages     — DERIVED, one line per client_pages row; a page is "built" when its status is live.
 *                Nothing is stored under this key any more (an old `pages: true` is ignored).
 *    remeasure — the week-four clock (remeasure_due_date) beside a manual "checked" tick */
/*    stamp     — DERIVED from a timestamp the SYSTEM writes (outreach_leads.remeasure_results_sent_at,
 *                written once by the results sender). Never a manual tick: the stamp starts the
 *                client's 14-day claim window, so a person must not be able to fake or undo it. */
export type DeliveryItemKind = 'tick' | 'pages' | 'remeasure' | 'stamp';
export interface DeliveryChecklistItem { key: string; label: string; hint: string; kind: DeliveryItemKind }

/* ⛔ ONE LIST, TWO SCREENS (2026-09-13, Paul's brief). The lead card's cockpit and the Dashboard's
   client delivery card BOTH render this list through the same component, so a milestone cannot
   exist on one and not the other. Order is Paul's delivery order. Adding an item is safe: unknown
   keys in a stored checklist are ignored and a new key starts unticked — which is how the three
   new ticks (baseline checked / baseline sent / results sent) landed on RG's existing map without
   touching it.
   ⚠️ "Baseline checked" is a deliberate human gate: the baseline is the document a refund is
   measured against, three copy faults were found in reports on the day this was built, and it
   must never auto-send. "Results sent" is a manual tick until the four-week sender exists (CLAUDE.md
   §19 open item 1); when it does, it should STAMP this rather than a person ticking it. */
export const DELIVERY_CHECKLIST_ITEMS: DeliveryChecklistItem[] = [
  { key: 'baseline_checked', label: 'Baseline done — checked', hint: 'The baseline has finished and you have read it. It is the document the refund is measured against, so it is checked by a person before anything is sent', kind: 'tick' },
  { key: 'baseline_sent', label: 'Baseline sent', hint: 'The client has been sent their baseline. Nothing sends it automatically', kind: 'tick' },
  { key: 'directories', label: 'Directories added', hint: 'Listed on the directories the evidence says matter for this trade', kind: 'tick' },
  { key: 'gbp', label: 'Google Business Profile sorted', hint: 'Claimed, verified and consistent with the pages', kind: 'tick' },
  { key: 'pages', label: 'Pages built', hint: 'One line per planned page (the page-plan queue). Tick a page when it is live on their site', kind: 'pages' },
  { key: 'website', label: 'Website', hint: 'Site built or fixed where there was none / it was blocking', kind: 'tick' },
  { key: 'remeasure', label: 'Week-four re-measure', hint: 'Fires itself on the stored due date (RG Locksmiths: eight weeks, by his contract). Tick once you have checked the replay', kind: 'remeasure' },
  { key: 'results_sent', label: 'Results sent', hint: 'Stamped by the system when the four-week results email goes out (outreach_leads.remeasure_results_sent_at). Starts the client\'s 14-day claim window. Not a tick.', kind: 'stamp' },
];

/** The items a person ticks — everything except the derived pages line and the system stamp. */
export const TICKABLE_ITEMS: DeliveryChecklistItem[] = DELIVERY_CHECKLIST_ITEMS.filter((i) => i.kind === 'tick' || i.kind === 'remeasure');

export type DeliveryChecklist = Record<string, boolean>;

/** How many tickable milestones are ticked (unknown keys and the derived pages key ignored). */
export function checklistDone(cl: DeliveryChecklist | null | undefined): number {
  if (!cl) return 0;
  return TICKABLE_ITEMS.filter((i) => cl[i.key] === true).length;
}

/* ── PAGES, derived from client_pages ────────────────────────────────────────────────────────────
   A row is a page LINE when it is still a page the client will get: planned / held (the queue's
   statuses) and the legacy capture statuses draft / approved / live. merged and removed are not
   pages; archived is not a page any more. A line is BUILT when its status is live. */
const PAGE_LINE_STATUSES = new Set(['planned', 'held', 'draft', 'approved', 'live']);
export const isPageLine = (status: string | null | undefined): boolean => PAGE_LINE_STATUSES.has(String(status ?? ''));
export const isPageBuilt = (status: string | null | undefined): boolean => String(status ?? '') === 'live';
/** The status a page moves to when its tick flips. Un-ticking a live page returns it to planned. */
export const pageStatusFor = (built: boolean): 'live' | 'planned' => (built ? 'live' : 'planned');

export function pagesProgress(rows: ReadonlyArray<{ status: string | null | undefined }> | null | undefined): { built: number; total: number } {
  const lines = (rows ?? []).filter((r) => isPageLine(r.status));
  return { built: lines.filter((r) => isPageBuilt(r.status)).length, total: lines.length };
}

/** Add whole days to a YYYY-MM-DD (or full ISO) date, returning YYYY-MM-DD. UTC maths so a
 *  BST/GMT boundary can never shift the day (the end-of-day-UTC → next-day bug, CLAUDE.md §4). */
export function addDaysISO(dateStr: string, days: number): string {
  const base = dateStr.length <= 10 ? `${dateStr}T00:00:00Z` : dateStr;
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The default re-measure due date: baseline + REMEASURE_OFFSET_DAYS (28). Written ONCE, where
 *  remeasure_due_date IS NULL (remeasureFill.ts); a stored date is never touched. */
export function defaultRemeasureDue(baselineDate: string): string {
  return addDaysISO(baselineDate, REMEASURE_OFFSET_DAYS);
}

export type RemeasureState = 'none' | 'ok' | 'amber' | 'red';
export interface RemeasureStatus {
  state: RemeasureState;
  daysUntil: number | null;   // negative = overdue
  label: string;
}

/* The traffic light. `nowMs` is passed in (never read from the clock here) so the test is
   deterministic. amber ≤ REMEASURE_AMBER_DAYS out, red once the due day has passed. Day-grained:
   both sides floored to the UTC day so "due today" is amber, not already red. */
export function remeasureStatus(dueISO: string | null | undefined, nowMs: number): RemeasureStatus {
  if (!dueISO) return { state: 'none', daysUntil: null, label: 'not set' };
  const dueMs = new Date(dueISO.length <= 10 ? `${dueISO}T00:00:00Z` : dueISO).getTime();
  const dayMs = 86_400_000;
  const todayDay = Math.floor(nowMs / dayMs);
  const dueDay = Math.floor(dueMs / dayMs);
  const daysUntil = dueDay - todayDay;
  if (daysUntil < 0) {
    const n = Math.abs(daysUntil);
    return { state: 'red', daysUntil, label: `overdue by ${n} day${n === 1 ? '' : 's'}` };
  }
  if (daysUntil <= REMEASURE_AMBER_DAYS) {
    return { state: 'amber', daysUntil, label: daysUntil === 0 ? 'due today' : `due in ${daysUntil} day${daysUntil === 1 ? '' : 's'}` };
  }
  return { state: 'ok', daysUntil, label: `due in ${daysUntil} days` };
}

/* The non-secret reference fields. NO password field, ever — Postgres columns are readable via the
   service key, the dashboard and backups, so real secrets stay in a password manager. The UI shows
   a "don't paste passwords here" hint keyed on this being reference-only. */
export interface DeliveryRefField { key: string; label: string; placeholder: string }
export const DELIVERY_REF_FIELDS: DeliveryRefField[] = [
  { key: 'login_email', label: 'Login email', placeholder: 'e.g. the WordPress / host admin email' },
  { key: 'host', label: 'Host / platform', placeholder: 'e.g. 20i · WordPress + Elementor' },
  { key: 'access_notes', label: 'Access notes', placeholder: 'e.g. GBP access via Kieran; site login from Sam' },
];
