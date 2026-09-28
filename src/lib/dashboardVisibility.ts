/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WHAT THIS PERSON CHOOSES TO SEE ON THEIR SALES DASHBOARD (2026-09-28). DISPLAY ONLY.

   ⛔ It never touches a number. The fold (src/lib/salesPerformance.ts) counts everything exactly as
   before; this only filters which campaign / template ROWS are drawn. The funnel, the totals and every
   metric stay whole — a hidden campaign still counts in "Contacted", and still collects data.
   ⛔ The saved list is what is HIDDEN, never what is shown, so a new campaign or template — one that
   did not exist when the list was saved — is visible by default.
   ⛔ One row per person (table user_preferences, own-row-only RLS): one salesperson's choice never
   affects another's, and the admin has their own.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export interface DashboardHidden { campaigns: string[]; templates: string[] }
export const EMPTY_HIDDEN: DashboardHidden = { campaigns: [], templates: [] };

/** A row with no campaign is keyed "none" (the fold's "No campaign" row). */
export const campaignKey = (r: { campaignId: string | null }) => r.campaignId ?? 'none';
export const templateKey = (r: { template: string }) => r.template;

/** Anything stored, read defensively: a malformed row hides nothing. */
export function parseHidden(raw: unknown): DashboardHidden {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0))] : []);
  return { campaigns: list(o.campaigns), templates: list(o.templates) };
}

export function visibleRows<T>(rows: T[], hidden: string[], key: (r: T) => string): T[] {
  if (hidden.length === 0) return rows;
  const h = new Set(hidden);
  return rows.filter((r) => !h.has(key(r)));
}

export function toggleHidden(hidden: string[], k: string, hide: boolean): string[] {
  const set = new Set(hidden);
  if (hide) set.add(k); else set.delete(k);
  return [...set];
}

/** Nothing sent or logged in this long counts as inactive for the "Hide inactive" shortcut. */
export const INACTIVE_DAYS = 60;

/** Keys of rows with no activity in INACTIVE_DAYS, or none at all. Only what the data can say reliably. */
export function inactiveKeys<T extends { lastActivityAt: string | null }>(rows: T[], key: (r: T) => string, nowMs = Date.now()): string[] {
  const cutoff = nowMs - INACTIVE_DAYS * 86_400_000;
  return rows.filter((r) => !r.lastActivityAt || Date.parse(r.lastActivityAt) < cutoff).map(key);
}
