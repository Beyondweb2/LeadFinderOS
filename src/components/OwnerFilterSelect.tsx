import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTeamDirectory } from '@/hooks/useSalesCrm';
import { cn } from '@/lib/utils';

/* The admin's Outreach owner filter (2026-09-30): any owner / mine / unassigned / each active member.
   Its own file so the team members' ids never read like a lead column inside OutreachTable
   (scripts/outreach-list-columns.test.ts). The value is 'all' | 'mine' | 'unassigned' | a member id. */
export function OwnerFilterSelect({ value, onChange, selfId }: { value: string; onChange: (v: string) => void; selfId: string | undefined }) {
  const team = useTeamDirectory();
  const members = (team.data ?? []).filter((m) => m.status === 'active' && m.role && m.user_id !== selfId);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn('w-[120px] sm:w-[140px] bg-background h-8 text-xs', value !== 'all' && 'border-primary/50 text-primary')} aria-label="Owner"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Any owner</SelectItem>
        <SelectItem value="mine">Mine</SelectItem>
        <SelectItem value="unassigned">Unassigned</SelectItem>
        {members.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.display_name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
