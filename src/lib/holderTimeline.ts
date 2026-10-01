/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WHO HELD A LEAD AT A GIVEN MOMENT (2026-10-01).
   Paul: "keep the historical records as they are … All activity from the reassignment onward should
   attribute normally to the current user." An event that names no person (a queue-sent opener, an
   inbound reply, an automatic suppression) used to be credited to whoever holds the lead NOW, so moving
   a lead silently moved its whole past with it (the 82 leads moved from the Test account to Paul on
   2026-09-30 would have made last week's openers Paul's). It is credited to whoever held the lead WHEN
   it happened, read from the lead's own History (lead_assigned / lead_unassigned / lead_claimed).
   - Before the first recorded move: that move's `from` (who had it then); a claim → nobody before it.
   - No recorded move at all: the current holder (rows assigned by the 2026-09-27 backfill have none).
   - An event that names its person (sent_by_user_id, actor_user_id) is never re-read — this is only the
     fallback for events that name no one.
   ⛔ ONE rule for every attribution fold (adminMetrics, salesPerformance). Pure and edge-safe.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export interface HolderEvent { kind: string; actor_user_id?: string | null; data?: Record<string, unknown> | null; created_at: string }

const MOVE_KINDS: ReadonlySet<string> = new Set(['lead_assigned', 'lead_unassigned', 'lead_claimed']);
const ms = (iso: string) => { const n = Date.parse(iso); return Number.isFinite(n) ? n : 0; };
const idOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

/** A function: the lead's holder at time `t` (ms). `current` is assigned_to_user_id now. */
export function holderTimeline(current: string | null, events: readonly HolderEvent[]): (t: number) => string | null {
  const moves = events.filter((e) => MOVE_KINDS.has(e.kind)).map((e) => ({
    at: ms(e.created_at),
    from: e.kind === 'lead_claimed' ? null : idOrNull(e.data?.from),
    to: e.kind === 'lead_claimed' ? idOrNull(e.actor_user_id) : e.kind === 'lead_unassigned' ? null : idOrNull(e.data?.to),
  })).sort((a, b) => a.at - b.at);
  if (!moves.length) return () => current;
  return (t: number) => {
    let holder: string | null = moves[0].from;
    for (const m of moves) { if (m.at <= t) holder = m.to; else break; }
    return holder;
  };
}
