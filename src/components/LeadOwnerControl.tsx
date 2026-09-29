import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/hooks/useSubscription';
import { useSalesActions, useTeamDirectory } from '@/hooks/useSalesCrm';
import { OwnerAvatar, OwnerLine } from '@/components/OwnerBadge';
import { refusalText } from '@/lib/salesCrm';
import { leadSourceFor } from '@/lib/outreachLeadColumns';
import { leadPermissions } from '@/lib/access';

/* ONE LEAD'S OWNER — both roles (multi-user, 2026-09-27; shared workflow the same day).
 * The admin assigns, reassigns or unassigns through assign_lead (admin-only in the database; same
 * record, same history, nothing sent, the move logged). A salesperson sees who owns it and cannot
 * change it. The owner is read from the caller's own source (a salesperson reads the sales_leads
 * view, which holds only their own leads).
 * "CRM" (optional) opens the lead's detail, where the CRM panel lives. */
export function LeadOwnerControl({ leadId, onOpenDetail }: { leadId: string; onOpenDetail?: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { role } = useSubscription();
  const canAssign = leadPermissions(role).assignOwner;
  const team = useTeamDirectory();
  const actions = useSalesActions();
  const q = useQuery({
    queryKey: ['sales', 'owner', leadId, role],
    queryFn: async () => {
      const src = leadSourceFor(role);
      const { data, error } = await (supabase as unknown as { from: (t: string) => any })
        .from(src.table).select('assigned_to_user_id').eq('id', leadId).maybeSingle();
      if (error) throw error;
      return ((data as { assigned_to_user_id: string | null } | null)?.assigned_to_user_id) ?? null;
    },
  });
  const ownerId = q.data ?? null;
  const owner = ownerId ? team.byId.get(ownerId) : undefined;
  const members = (team.data ?? []).filter((m) => m.status === 'active' && m.role);
  const crmLink = onOpenDetail
    ? <button type="button" onClick={onOpenDetail} className="text-primary hover:underline">CRM</button>
    : null;

  if (!canAssign) {
    return (
      <div className="inline-flex items-center gap-1.5 text-xs">
        <OwnerLine ownerName={owner?.display_name} avatarUrl={owner?.avatar_url} />
        {crmLink}
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 text-xs">
      {owner ? <OwnerAvatar name={owner.display_name} avatarUrl={owner.avatar_url} /> : null}
      <Select value={ownerId ?? '__none'} onValueChange={async (v) => {
        const to = v === '__none' ? null : v;
        if (to === ownerId) return;
        const r = await actions.assign.mutateAsync({ leadId, to });
        if (!r.ok) { toast({ title: 'Not reassigned', description: refusalText(r.error), variant: 'destructive' }); return; }
        void qc.invalidateQueries({ queryKey: ['sales', 'owner', leadId] });
        window.dispatchEvent(new CustomEvent('lead-row-changed', { detail: { leadId } }));
        toast({ title: to ? `Assigned to ${team.byId.get(to)?.display_name ?? 'them'} — they've been notified` : 'Unassigned' });
      }}>
        <SelectTrigger className="h-7 w-36 text-xs" title="Assign this lead to someone (they are notified)" aria-label="Assign to"><span className="mr-1 text-muted-foreground">Assign:</span><SelectValue placeholder="Owner" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">Unassigned</SelectItem>
          {members.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.display_name}</SelectItem>)}
        </SelectContent>
      </Select>
      {crmLink}
    </div>
  );
}
