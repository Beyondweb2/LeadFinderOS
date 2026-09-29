import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useTeamDirectory } from '@/hooks/useSalesCrm';
import { leadRpc } from '@/lib/leadRpc';
import { notifyLeadChanged } from '@/lib/leadSync';
import { refusalText } from '@/lib/salesCrm';

/* ASSIGN THE SELECTED LEADS TO A TEAMMATE — ADMIN ONLY (Paul, 2026-09-29: "I have some interested that
   went cold that I want others to pick up").
   ⛔ The same server function as the popup's owner picker (assign_lead: admin-only in the database,
   one lead_activity row per move, nothing sent to the business). The person is told by the existing
   notification trigger (trg_notify_lead_assigned → "Lead assigned to you", linked to the lead), and the
   lead appears in their Outreach, Focus Mode and WhatsApp. One call per lead, in order, so a refusal
   names the lead it was for. */
export function BulkAssignSelect({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const team = useTeamDirectory();
  const { user } = useAuth();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const members = (team.data ?? []).filter((m) => m.status === 'active' && m.role && m.user_id !== user?.id);
  const run = async (to: string) => {
    if (!ids.length) return;
    const name = team.byId.get(to)?.display_name ?? 'them';
    if (!window.confirm(`Assign ${ids.length} lead${ids.length === 1 ? '' : 's'} to ${name}? They'll get a notification and the lead${ids.length === 1 ? '' : 's'} will show in their Outreach and WhatsApp.`)) return;
    setBusy(true);
    let moved = 0; let unchanged = 0; const refused: string[] = [];
    for (const id of ids) {
      const r = await leadRpc('assign_lead', { _lead_id: id, _to_user_id: to });
      if (r.ok) { if (r.unchanged) unchanged++; else moved++; notifyLeadChanged(id); }
      else refused.push(refusalText(r.error));
    }
    setBusy(false);
    toast({
      title: moved ? `Assigned ${moved} to ${name} — they've been notified` : 'Nothing assigned',
      description: [unchanged ? `${unchanged} already theirs` : '', refused.length ? `${refused.length} not assigned: ${[...new Set(refused)].join('; ')}` : ''].filter(Boolean).join(' · ') || undefined,
      variant: refused.length && !moved ? 'destructive' : undefined,
    });
    onDone();
  };
  return (
    <Select value="" onValueChange={(v) => void run(v)} disabled={busy || members.length === 0}>
      <SelectTrigger className="h-8 w-[170px] bg-background text-xs" aria-label="Assign the selected leads to a teammate" data-testid="bulk-assign">
        {busy ? <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Assigning…</span> : <SelectValue placeholder={`Assign to… (${ids.length})`} />}
      </SelectTrigger>
      <SelectContent>
        {members.map((m) => <SelectItem key={m.user_id} value={m.user_id}>{m.display_name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
