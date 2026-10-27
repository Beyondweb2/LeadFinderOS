import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PenLine } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Panel } from '@/components/salesDash/ui';

/* NAMES WAITING FOR APPROVAL (2026-10-27, migration 20261128100000). A salesperson's name goes on their messages only once
 * Paul approves it here. Approve = the waiting name becomes their name; Reject = it is dropped (they are asked again only if
 * they have no name at all). review_message_name refuses anyone but an admin. Shown only while something is waiting. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

interface Waiting { user_id: string; message_name: string | null; message_name_pending: string; message_name_pending_at: string | null }

export function MessageNameApprovals({ nameOf }: { nameOf: (userId: string) => string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['team', 'message-names-waiting'],
    queryFn: async (): Promise<Waiting[]> => {
      const { data, error } = await sb.from('profiles').select('user_id, message_name, message_name_pending, message_name_pending_at')
        .not('message_name_pending', 'is', null).order('message_name_pending_at', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as Waiting[];
    },
  });
  if (!q.data?.length) return null;
  const review = async (w: Waiting, approve: boolean) => {
    const { data, error } = await sb.rpc('review_message_name', { _user_id: w.user_id, _approve: approve });
    if (error || !data?.ok) {
      toast({ title: 'Not saved', description: error?.message ?? (data?.error === 'nothing_waiting' ? 'Nothing is waiting for them any more.' : 'Try again.'), variant: 'destructive' });
    } else {
      toast({ title: approve ? 'Approved' : 'Rejected', description: approve ? `${nameOf(w.user_id)}'s messages are now signed “${w.message_name_pending}”.` : `“${w.message_name_pending}” was not approved.` });
    }
    void qc.invalidateQueries({ queryKey: ['team', 'message-names-waiting'] });
  };
  return (
    <Panel title="Message names waiting for your approval" icon={PenLine} tone="amber"
      hint="The name a salesperson typed goes on their messages only after you approve it.">
      <ul className="divide-y divide-border" data-testid="message-name-approvals">
        {q.data.map((w) => (
          <li key={w.user_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0 text-sm">
              <span className="font-medium">{nameOf(w.user_id)}</span>
              <span className="text-muted-foreground"> wants to sign messages </span>
              <span className="font-medium">“{w.message_name_pending}”</span>
              {w.message_name && <span className="block text-xs text-muted-foreground">Now signed “{w.message_name}”</span>}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => void review(w, false)} data-testid="message-name-reject">Reject</Button>
              <Button size="sm" onClick={() => void review(w, true)} data-testid="message-name-approve">Approve</Button>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
