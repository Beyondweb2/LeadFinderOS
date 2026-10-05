/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WHOSE LEADS OUTREACH IS SHOWING — THE ONE RULE  (2026-10-05, docs/pre-sales-certification/outreach-ownership-safety.md)

   Who works a lead is `outreach_leads.assigned_to_user_id` (docs/multi-user.md). Before this, the admin's
   Outreach opened on "Any owner": every rep's leads sat in Paul's working list, so Select all → Queue WhatsApp
   could message another salesperson's prospects without anyone choosing to.

   ⛔ THE SCOPE IS APPLIED BEFORE THE TABLE SEES A LEAD (src/pages/Outreach.tsx → OutreachTable `leads`). The
   count, Select all, every bulk action, CSV and Previous / Next only ever see the scoped list — a hidden lead
   cannot be selected because it is not there.
   ⛔ DEFAULT = MY LEADS, AND IT IS NOT REMEMBERED. Every visit opens on 'mine'; a team view is chosen on purpose
   each time. An unknown or stale value (a member who left, an old saved state) falls back to 'mine' — absence
   is never "everyone".
   ⛔ SALES IS SERVER-SCOPED. A salesperson's rows come from the `sales_leads` view (assigned to them only); this
   rule adds a second, client-side cut to their own id and never offers them another scope.
   ⛔ 'mine' FOR THE ADMIN = assigned to them OR UNASSIGNED. An unassigned lead belongs to nobody else: it is the
   book's unworked pool (the admin's own Find Leads adds land there), and the first real message assigns it to
   the sender or the book owner (trg_whatsapp_messages_assign). Hiding it would hide Paul's own new leads.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** 'mine' | 'unassigned' | 'team' | a team member's user id. */
export type OwnerScope = string;

export const OWNER_SCOPE_MINE = 'mine';
export const OWNER_SCOPE_UNASSIGNED = 'unassigned';
export const OWNER_SCOPE_TEAM = 'team';
export const DEFAULT_OWNER_SCOPE: OwnerScope = OWNER_SCOPE_MINE;

export type ScopeRole = 'admin' | 'sales' | null | undefined;

interface OwnedLead { assigned_to_user_id?: string | null }

/** A scope value the viewer may hold right now; anything else is 'mine'. Sales only ever holds 'mine'. */
export function normaliseOwnerScope(value: unknown, role: ScopeRole, memberIds: readonly string[]): OwnerScope {
  if (role !== 'admin') return OWNER_SCOPE_MINE;
  if (value === OWNER_SCOPE_MINE || value === OWNER_SCOPE_UNASSIGNED || value === OWNER_SCOPE_TEAM) return value;
  if (typeof value === 'string' && memberIds.includes(value)) return value;
  return OWNER_SCOPE_MINE;
}

/** Is this lead inside the viewer's chosen scope? No signed-in id → nothing (fails closed). */
export function leadInOwnerScope(lead: OwnedLead, scope: OwnerScope, role: ScopeRole, selfId: string | null | undefined): boolean {
  if (!selfId) return false;
  const owner = lead.assigned_to_user_id ?? null;
  if (role === 'sales') return owner === selfId;
  if (role !== 'admin') return false;
  if (scope === OWNER_SCOPE_TEAM) return true;
  if (scope === OWNER_SCOPE_UNASSIGNED) return owner === null;
  if (scope === OWNER_SCOPE_MINE) return owner === selfId || owner === null;
  return owner === scope;
}

export function scopeLeads<T extends OwnedLead>(leads: readonly T[], scope: OwnerScope, role: ScopeRole, selfId: string | null | undefined): T[] {
  return leads.filter((l) => leadInOwnerScope(l, scope, role, selfId));
}

/* ── CROSS-OWNER CONTACT ─────────────────────────────────────────────────────────────────────────
   Whose leads a CONTACT action (queueing WhatsApp today; any future call / message queue) would reach.
   The viewer's own leads and the unassigned pool are ONE group ("you") — the same line as 'mine'. Every other
   owner is its own group. More than one group = the admin must confirm, naming the owners and the counts. */

export interface OwnerGroup { ownerId: string | null; self: boolean; count: number }

export function ownerGroupsOf(leads: readonly OwnedLead[], selfId: string | null | undefined): OwnerGroup[] {
  const groups = new Map<string, OwnerGroup>();
  for (const l of leads) {
    const owner = l.assigned_to_user_id ?? null;
    const self = owner === null || (!!selfId && owner === selfId);
    const key = self ? '\u0000self' : owner!;
    const g = groups.get(key) ?? { ownerId: self ? (selfId ?? null) : owner, self, count: 0 };
    g.count += 1;
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => (a.self === b.self ? b.count - a.count : a.self ? -1 : 1));
}

export interface ContactScopeCheck {
  /** How many owner groups the leads span (the viewer + unassigned count as one). */
  owners: number;
  groups: OwnerGroup[];
  /** The admin must say "Queue across team" before anything is queued. */
  needsConfirm: boolean;
  /** A salesperson's batch holding anything not theirs: refused outright, never a warning. */
  refuse: boolean;
}

export function contactScopeCheck(leads: readonly OwnedLead[], role: ScopeRole, selfId: string | null | undefined): ContactScopeCheck {
  const groups = ownerGroupsOf(leads, selfId);
  if (role === 'sales') {
    const foreign = leads.some((l) => !selfId || l.assigned_to_user_id !== selfId);
    return { owners: groups.length, groups, needsConfirm: false, refuse: foreign };
  }
  if (role !== 'admin') return { owners: groups.length, groups, needsConfirm: false, refuse: true };
  return { owners: groups.length, groups, needsConfirm: groups.length > 1, refuse: false };
}

/** "You're about to queue WhatsApp for 37 leads across 3 owners." */
export function crossOwnerHeadline(action: string, total: number, owners: number): string {
  return `You're about to ${action} for ${total.toLocaleString()} lead${total === 1 ? '' : 's'} across ${owners} owners.`;
}

/** "You 30 · test1 5 · Test 2" — the viewer's group first, then the biggest. */
export function ownerGroupsLine(groups: readonly OwnerGroup[], nameOf: (id: string) => string | null | undefined): string {
  return groups.map((g) => `${g.self ? 'You (incl. unassigned)' : (g.ownerId && nameOf(g.ownerId)) || 'Another owner'} ${g.count.toLocaleString()}`).join(' · ');
}

/** The label for a scope value, for the select and the page subtitle. */
export function ownerScopeLabel(scope: OwnerScope, nameOf: (id: string) => string | null | undefined): string {
  if (scope === OWNER_SCOPE_MINE) return 'My leads';
  if (scope === OWNER_SCOPE_UNASSIGNED) return 'Unassigned';
  if (scope === OWNER_SCOPE_TEAM) return 'All team';
  return nameOf(scope) || 'Another owner';
}

/** The scope that SHOWS a given lead — used when the admin opens a lead by link (Inbox, notification) that
 *  sits outside the current scope: the view moves to that lead's owner rather than failing to open it. */
export function scopeShowingLead(lead: OwnedLead, selfId: string | null | undefined): OwnerScope {
  const owner = lead.assigned_to_user_id ?? null;
  return owner === null || owner === selfId ? OWNER_SCOPE_MINE : owner;
}
