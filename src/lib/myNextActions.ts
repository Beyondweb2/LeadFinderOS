/* ═════════════════════════════════════════════════════════════════
   THE DASHBOARD'S "YOUR NEXT ACTIONS" LIST (Paul, 2026-10-26: "next actions I've set myself, when the dates are, how many
   days until I need to take the action, what I need to do, close it from there"). Pure.
   ⛔ READS the one Next Action (outreach_leads.next_action / _date / _time / _note, nextActionView.ts); every change —
   edit, ✓ done — goes through the one write (nextActionWrite.ts → lead_set_follow_up). Nothing here writes or invents one.
   ⛔ "SET BY ME" = the newest History "follow_up_set" row on that lead was written by me. A lead with no such row (set
   before History, or by an import) counts as mine only when it is assigned to me — absence is never "everyone's is mine".
   Days are London calendar days (londonToday); an action with no date says so and sorts last.
   ═════════════════════════════════════════════════════════════════ */
import { nextActionView, nextActionSortKey, type NextActionView } from './nextActionView.ts';
import { londonToday } from './salesCrm.ts';

export interface NextActionLead {
  id: string;
  business_name: string | null;
  next_action: string | null;
  next_action_date: string | null;
  next_action_time: string | null;
  next_action_note: string | null;
  assigned_to_user_id: string | null;
  status?: string | null;
  is_potential_work?: boolean | null;
  amount_paid?: unknown;
  call_booked_at?: string | null;
}

/** The newest follow_up_set History row per lead (who set the current Next Action). */
export interface SetterFact { lead_id: string; actor_user_id: string | null; created_at: string }

export type NextActionScope = 'mine' | 'everyone';

export interface MyNextActionRow {
  lead: NextActionLead;
  view: NextActionView;
  /** Whole London days from today to the action's day: negative = overdue, 0 = today, null = no date. */
  days: number | null;
  /** "3 days overdue", "Due today", "Tomorrow", "In 5 days", "No date set". */
  daysLabel: string;
  setBy: string | null;
  mine: boolean;
}

function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

export function daysUntilLabel(days: number | null, overdue: boolean): string {
  if (days === null) return 'No date set';
  if (days < 0) return `${-days} day${days === -1 ? '' : 's'} overdue`;
  if (days === 0) return overdue ? 'Overdue today' : 'Due today';
  if (days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

/** Newest setter per lead, from any number of History rows. */
export function latestSetters(rows: readonly SetterFact[]): Map<string, string | null> {
  const best = new Map<string, SetterFact>();
  for (const r of rows) {
    const cur = best.get(r.lead_id);
    if (!cur || r.created_at > cur.created_at) best.set(r.lead_id, r);
  }
  return new Map([...best].map(([k, v]) => [k, v.actor_user_id]));
}

export function buildMyNextActions(leads: readonly NextActionLead[], setters: ReadonlyMap<string, string | null>, meId: string | null,
  scope: NextActionScope, today: string = londonToday(), nowMs: number = Date.now()): MyNextActionRow[] {
  const out: { row: MyNextActionRow; key: string }[] = [];
  for (const lead of leads) {
    const view = nextActionView(lead, today, nowMs);
    if (!view) continue;
    const setBy = setters.has(lead.id) ? (setters.get(lead.id) ?? null) : null;
    const mine = !!meId && (setters.has(lead.id) ? setBy === meId : lead.assigned_to_user_id === meId);
    if (scope === 'mine' && !mine) continue;
    const d = (lead.next_action_date ?? '').slice(0, 10);
    const days = /^\d{4}-\d{2}-\d{2}$/.test(d) ? dayDiff(today, d) : null;
    out.push({ row: { lead, view, days, daysLabel: daysUntilLabel(days, view.bucket === 'overdue'), setBy, mine }, key: nextActionSortKey(lead) });
  }
  return out.sort((a, b) => a.key.localeCompare(b.key) || (a.row.lead.business_name ?? '').localeCompare(b.row.lead.business_name ?? '')).map((x) => x.row);
}

/** Header counts: overdue, due today, the next 7 days. */
export function nextActionCounts(rows: readonly MyNextActionRow[]): { overdue: number; today: number; week: number } {
  let overdue = 0, today = 0, week = 0;
  for (const r of rows) {
    if (r.view.bucket === 'overdue') overdue++;
    else if (r.days === 0) today++;
    else if (r.days !== null && r.days > 0 && r.days <= 7) week++;
  }
  return { overdue, today, week };
}
