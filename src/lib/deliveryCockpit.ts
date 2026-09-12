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

export interface DeliveryChecklistItem { key: string; label: string; hint: string }

/* The five MAIN milestones — grouped, not per-directory. Manual tick-to-complete (v1). Order is
   the delivery order. Adding an item here is safe: unknown keys in a stored checklist are ignored,
   and a new key simply starts unticked. */
export const DELIVERY_CHECKLIST_ITEMS: DeliveryChecklistItem[] = [
  { key: 'directories', label: 'Directories', hint: 'Listed on the directories the evidence says matter for this trade' },
  { key: 'pages', label: 'Pages', hint: 'Service + area pages published on their own site' },
  { key: 'gbp', label: 'GBP profile', hint: 'Google Business Profile claimed, verified and consistent with the pages' },
  { key: 'website', label: 'Website', hint: 'Site built or fixed where there was none / it was blocking' },
  { key: 'remeasure', label: 'Re-measure taken', hint: 'The four-week re-measurement has been run and evidenced (RG Locksmiths: eight weeks, by his contract)' },
];

export type DeliveryChecklist = Record<string, boolean>;

/** How many of the five milestones are ticked (unknown keys ignored). */
export function checklistDone(cl: DeliveryChecklist | null | undefined): number {
  if (!cl) return 0;
  return DELIVERY_CHECKLIST_ITEMS.filter((i) => cl[i.key] === true).length;
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
