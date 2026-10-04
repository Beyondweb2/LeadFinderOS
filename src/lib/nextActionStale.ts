/* THE STALE-SCREEN RULE FOR A NEXT ACTION (fix workstream 5, 2026-10-04; Session E E-13, master plan M-052).
   Two tabs could silently replace a booked meeting: last writer won. Now every editor sends what it SHOWED when it
   opened (the snapshot); lead_set_follow_up (migration 20261007105000) refuses with `stale_next_action` when the
   stored type, day or time has changed since — unless the save asks for exactly what is stored already. This file
   is that rule in words a test can hold the server to, plus the snapshot every editor takes. Pure; no imports
   beyond the time helper. */
import { hhmmOf } from './salesCrm.ts';

/** The material part of a Next Action: type, day, time. A note-only difference is not a conflict. */
export interface NextActionSnapshot { nextAction: string; date: string | null; time: string | null }

/** The snapshot of a lead row as a screen shows it ("none" with no day or time when nothing is planned). */
export function snapshotOf(lead: { next_action?: string | null; next_action_date?: string | null; next_action_time?: string | null }): NextActionSnapshot {
  const na = lead.next_action && lead.next_action !== 'none' ? lead.next_action : 'none';
  return { nextAction: na, date: na === 'none' ? null : (lead.next_action_date ?? null), time: na === 'none' || !lead.next_action_date ? null : (hhmmOf(lead.next_action_time) ?? null) };
}

const same = (a: NextActionSnapshot, b: NextActionSnapshot) =>
  a.nextAction === b.nextAction && (a.date ?? null) === (b.date ?? null) && (a.time ?? null) === (b.time ?? null);

/** Stale = the stored one differs from what the screen showed, and the save is not simply what is stored now. */
export function isStaleSave(stored: NextActionSnapshot, expected: NextActionSnapshot, wanted: NextActionSnapshot): boolean {
  return !same(stored, expected) && !same(stored, wanted);
}

/** The snapshot as the server's `_expected` argument. */
export const toSnapshotArg = (s: NextActionSnapshot) => ({ next_action: s.nextAction, date: s.date, time: s.time });
