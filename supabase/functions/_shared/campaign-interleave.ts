/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ROUND-ROBIN ACROSS CAMPAIGNS — one campaign must not drain before the next one starts.

   🔴 WHAT THIS FIXES, MEASURED LIVE 2026-09-14. Both outreach lanes ordered strictly by `queued_at`
   ascending, which is global FIFO across every campaign. The queue that afternoon was 95 leads in
   two campaigns — 20 queued at 06:49 and 75 queued at 15:53 — and the next TWELVE ticks all belonged
   to the first one. The 75-lead campaign would have sent nothing for ~44 minutes. Reverse the sizes
   and it is ~11 hours, which is the whole 07:00-21:30 window: one campaign a day.

   ⛔ IT IS TWO LANES, NOT ONE, AND FIXING EITHER ALONE DOES NOTHING. The SEND lane picks who goes
   out; the AUDIT-AHEAD lane (outreach-audit.ts) decides whose audit is started, and an audit-class
   template cannot send without one. Order the sender fairly while the auditor still works FIFO and
   the second campaign is simply held by the `needsAudit` guard instead — the same starvation, one
   layer down. Both lanes import THIS function. Do not inline a second copy: "one rule written out
   in N places" is the failure this codebase has recorded five times.

   ⛔ EQUAL SHARE, NOT PROPORTIONAL (Paul's call, 2026-09-14). Every campaign gets one slot per
   round whatever its size, so a small campaign clears fast: "if I queue 20 electricians to try
   competitor_hook, I want those results today, not smeared across the same window as 300 plumbers."
   ⚠️ The alternative was proportional — slots split by campaign size so every campaign FINISHES
   together. It is the same single sort key and it is the better answer to a different question. If
   it is ever wanted, rank by `i / bucket.length` instead of `i`; nothing else here changes.

   ⛔ STATELESS, AND THAT IS LOAD-BEARING. The order is derived fresh from the queue on every tick —
   no cursor, no stored round number, no "last campaign sent" column. The lane runs up to 870 times
   a day and restarts whenever the function is redeployed; anything persisted would be one more
   thing to drift, and a stale cursor would silently re-starve the campaign it was meant to protect.

   ⚠️ A NULL campaign_id IS ITS OWN BUCKET, NEVER DROPPED AND NEVER MERGED INTO A REAL CAMPAIGN.
   Six of 1,000 unarchived leads have one. Dropping them would be a silent shrink of the queue, and
   folding them into some other campaign would make that campaign's share wrong. They round-robin
   like everybody else, under a sentinel key that cannot collide with a uuid.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** The bucket key for a lead with no campaign. Cannot collide with a uuid. */
export const NO_CAMPAIGN_KEY = "(no campaign)";

/** The fields this needs. Deliberately minimal so both lanes' own SELECTs satisfy it. */
export interface InterleavableLead {
  id: string;
  campaign_id?: string | null;
  queued_at?: string | null;
}

/**
 * Re-order queued leads so campaigns take turns: A0, B0, A1, B1, A2, …
 *
 * Within a campaign the original FIFO order is preserved exactly — this changes which campaign is
 * served next, never which of that campaign's leads is next. The input is not mutated.
 *
 * ⚠️ TIE-BREAKING IS FULLY DETERMINISTIC, BY THREE KEYS. Rank first (the round), then `queued_at`
 * (the campaign waiting longest goes first within a round), then `id`. The last one is not
 * decoration: `queued_at` is identical to the second across a bulk queue — all 75 leads in the
 * 2026-09-14 campaign share one timestamp — so without a unique final key the order would depend on
 * whatever order Postgres happened to return, and two ticks could disagree about who is next.
 */
export function interleaveByCampaign<T extends InterleavableLead>(leads: readonly T[]): T[] {
  if (leads.length < 2) return [...leads];

  /* Bucket in arrival order. A Map preserves insertion order, so campaigns first seen earlier keep
     a stable relative position before the sort ever runs. */
  const buckets = new Map<string, T[]>();
  for (const l of leads) {
    const key = l.campaign_id ?? NO_CAMPAIGN_KEY;
    const b = buckets.get(key);
    if (b) b.push(l); else buckets.set(key, [l]);
  }

  const ranked: Array<{ lead: T; rank: number; queuedAt: string; id: string }> = [];
  for (const bucket of buckets.values()) {
    /* Sort WITHIN the campaign by queued_at so rank 0 really is that campaign's oldest lead, even
       if the caller handed them over unsorted. Same three-key determinism. */
    const inOrder = [...bucket].sort((a, b) => {
      const qa = a.queued_at ?? "";
      const qb = b.queued_at ?? "";
      return qa === qb ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : qa < qb ? -1 : 1;
    });
    inOrder.forEach((lead, i) => ranked.push({ lead, rank: i, queuedAt: lead.queued_at ?? "", id: lead.id }));
  }

  ranked.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.queuedAt !== b.queuedAt) return a.queuedAt < b.queuedAt ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return ranked.map((r) => r.lead);
}

/** How many distinct campaigns are represented — for the tick's log line, so an operator can see
 *  the round-robin is actually spanning something rather than trust that it is. */
export function campaignsRepresented(leads: readonly InterleavableLead[]): number {
  const s = new Set<string>();
  for (const l of leads) s.add(l.campaign_id ?? NO_CAMPAIGN_KEY);
  return s.size;
}
