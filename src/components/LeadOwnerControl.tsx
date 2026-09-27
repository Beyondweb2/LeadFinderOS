import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useSalesActions, useTeamDirectory } from '@/hooks/useSalesCrm';
import { OwnerAvatar } from '@/components/OwnerBadge';
import { refusalText } from '@/lib/salesCrm';

/* THE ADMIN'S OWNER CONTROL for one lead (multi-user, 2026-09-27) — self-contained so the Inbox only
 * gains one line. Shows the owner and lets the admin assign, reassign or unassign through the
 * assign_lead function (admin-only in the database; same record, nothing sent, the move logged).
 * "CRM" opens the lead's notes / follow-up / call / activity page. */
export function LeadOwnerControl({ leadId }: { leadId: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const team = useTeamDirectory();
  const actions = useSalesActions();
  const q = useQuery({
    queryKey: ['sales', 'owner', leadId],
    queryFn: async () => {
      const { data, error } = await supabase.from('outreach_leads').select('assigned_to_user_id' as never).eq('id', leadId).maybeSingle();
      if (error) throw error;
      return ((data as unknown as { assigned_to_user_id: string | null } | null)?.assigned_to_user_id) ?? null;
    },
  });
  const ownerId = q.data ?? null;
  const owner = ownerId ? team.byId.get(ownerId) : undefined;
  const members = (team.data ?? []).filter((m) => m.status === 'active' && m.role);

  return (
    <div className="inline-flex items-center gap-1.5 text-xs">
      {owner ? <OwnerAvatar name={owner.display_name} avatarUrl={owner.avatar_url} /> : null}
      <Select value={ownerId ?? '__none'} onValueChange={async (v) => {
        const to = v === '__none' ? null : v;
        if (to === ownerId) return;
        const r = await actions.assign.mutateAsync({ leadId, to });
        if (!r.ok) { toast({ title: 'Not reassigned', description: refusalText(r.error), variant: 'destructive' }); return; }
        void qc.invalidateQueries({ queryKey: ['sales', 'owner', leadId] });
        toast({ title: to ? `Assigned to ${team.byId.get(to)?.display_name ?? 'them'}` : 'Unassigned' });
      }}>
        <SelectTrigger className="h-7 w-32 text-xs" title="Owner"><SelectValue placeholder="Owner" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">Unassigned</SelectItem>
          {members.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.display_name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Link to={`/sales/lead/${leadId}`} className="text-primary hover:underline">CRM</Link>
    </div>
  );
}
