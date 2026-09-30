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
import { notifyLeadChanged } from '@/lib/leadSync';
import { useAuth } from '@/hooks/useAuth';
import { useState } from 'react';

/* ONE LEAD'S OWNER — both roles (multi-user, 2026-09-27; shared workflow the same day).
 * The admin assigns, reassigns or unassigns through assign_lead (admin-only in the database; same
 * record, same history, nothing sent, the move logged). A salesperson sees who owns it and cannot
 * change it — they may ASK for a transfer (request_lead_transfer: every active admin is told, History
 * records it; Paul, 2026-09-30: "only Admin should approve and execute it"). The owner is read from the
 * caller's own source (a salesperson reads the sales_leads view, which holds only their own leads).
 * ⛔ THE CONFIRMATION SAYS WHAT HAPPENED (2026-09-30). It used to say "they've been notified" for every
 * assignment, but the database (trg_notify_lead_assigned) never notifies the person assigning, nor the
 * admin, who sees every lead. Picking the current owner is a no-op on the server (no History, no notice)
 * and says so.
 * "CRM" (optional) opens the lead's detail, where the CRM panel lives. */
export function LeadOwnerControl({ leadId, onOpenDetail }: { leadId: string; onOpenDetail?: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { role } = useSubscription();
  const { user } = useAuth();
  const [asking, setAsking] = useState(false);
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
        {role === 'sales' && ownerId === user?.id && (
          <button type="button" disabled={asking} className="text-primary hover:underline disabled:opacity-50" title="Ask the admin to move this lead to someone else"
            onClick={async () => {
              const note = window.prompt('Ask the admin to transfer this lead. Why? (optional)');
              if (note === null) return;
              setAsking(true);
              try {
                const { data, error } = await (supabase as unknown as { rpc: (f: string, a: unknown) => Promise<{ data: { ok?: boolean; already?: boolean; error?: string } | null; error: { message?: string } | null }> })
                  .rpc('request_lead_transfer', { _lead_id: leadId, _note: note });
                if (error || !data?.ok) { toast({ title: 'Request not sent', description: refusalText(data?.error ?? error?.message), variant: 'destructive' }); return; }
                toast({ title: data.already ? 'Already asked today' : 'Transfer requested', description: data.already ? 'The admin has your request.' : 'The admin has been notified. The lead stays yours until they move it.' });
                notifyLeadChanged(leadId);
              } finally { setAsking(false); }
            }}>Request transfer</button>
        )}
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
        const r = await actions.assign.mutateAsync({ leadId, to }) as { ok: boolean; error?: string; unchanged?: boolean };
        if (!r.ok) { toast({ title: 'Not reassigned', description: refusalText(r.error), variant: 'destructive' }); return; }
        const name = to ? team.byId.get(to)?.display_name ?? 'them' : null;
        if (r.unchanged) { toast({ title: name ? `Already assigned to ${name}` : 'Already unassigned' }); return; }
        void qc.invalidateQueries({ queryKey: ['sales', 'owner', leadId] });
        notifyLeadChanged(leadId);
        /* Mirrors trg_notify_lead_assigned: a salesperson other than you is told; you and the admin are not. */
        const notified = !!to && to !== user?.id && team.byId.get(to)?.role === 'sales';
        toast({ title: name ? `Assigned to ${name}` : 'Unassigned', description: name ? (notified ? 'They have been notified, and it is in their Inbox and Outreach now.' : 'No notice sent — the admin sees every lead.') : 'It has no owner now.' });
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
