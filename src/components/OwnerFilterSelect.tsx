import { useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTeamDirectory } from '@/hooks/useSalesCrm';
import { cn } from '@/lib/utils';
import { OWNER_SCOPE_MINE, OWNER_SCOPE_TEAM, OWNER_SCOPE_UNASSIGNED } from '@/lib/outreachOwnerScope';

/* The admin's Outreach OWNER SCOPE (2026-10-05, src/lib/outreachOwnerScope.ts): My leads (default, owned by you) /
   Unassigned (owned by nobody) / each salesperson / All team (every OWNED lead; unassigned is not in it). It decides which leads the page holds at all — not a filter over the whole book —
   so Select all and every bulk action stay inside it. A salesperson never sees this control.
   Its own file so the team members' ids never read like a lead column inside OutreachTable
   (scripts/outreach-list-columns.test.ts). */
/** The owner ids a scope may name: the team directory's members plus anyone holding one of these leads. Here, not
 *  in the page, so a team member's id never reads like a lead column (scripts/outreach-list-columns.test.ts). */
export function useOwnerScopeMemberIds(ownerIds: readonly (string | null | undefined)[]): string[] {
  const team = useTeamDirectory();
  return useMemo(() => {
    const ids = new Set<string>((team.data ?? []).map((m) => m.user_id));
    for (const id of ownerIds) if (id) ids.add(id);
    return [...ids];
  }, [team.data, ownerIds]);
}

export function OwnerFilterSelect({ value, onChange, selfId }: { value: string; onChange: (v: string) => void; selfId: string | undefined }) {
  const team = useTeamDirectory();
  const members = (team.data ?? []).filter((m) => m.status === 'active' && m.role && m.user_id !== selfId);
  const wide = value !== OWNER_SCOPE_MINE;
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        data-testid="owner-scope"
        className={cn('w-[150px] sm:w-[160px] bg-background h-8 text-xs', wide && 'border-amber-500/70 text-amber-700 dark:text-amber-400')}
        aria-label="Whose leads"
        title={value === OWNER_SCOPE_MINE ? 'Leads you own. Choose Unassigned, a salesperson or All team to look wider.' : 'You are looking beyond your own leads — Select all and bulk actions apply to this view only.'}
      ><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={OWNER_SCOPE_MINE}>My leads</SelectItem>
        <SelectItem value={OWNER_SCOPE_UNASSIGNED}>Unassigned</SelectItem>
        {members.length > 0 && <SelectSeparator />}
        {members.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.display_name}</SelectItem>)}
        <SelectSeparator />
        <SelectItem value={OWNER_SCOPE_TEAM}>All team (owned)</SelectItem>
      </SelectContent>
    </Select>
  );
}
