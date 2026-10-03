import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { edgeErrorMessage, invokeEdge } from '@/lib/edgeInvoke';
import type { ServiceEndView } from '@/lib/serviceEnd';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   A PAID CLIENT WHOSE ENGAGEMENT HAS ENDED (2026-10-03) — the card that replaces the setup checklist,
   and the one control that records a CLIENT ending it early. The record and its rule: src/lib/serviceEnd.ts;
   the write: paid-client-hub `terminate_service` (reason client_ended_early). Nothing here moves money,
   marks a delivery stage done, or touches the payment / commission history.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

const day = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' }) : '';

export function EngagementEndedCard({ view, at, note }: { view: ServiceEndView; at: string | null | undefined; note: string | null | undefined }) {
  return <Card id="hub-setup" data-testid="engagement-ended">
    <CardContent className="space-y-2 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className="bg-slate-600 text-xs text-white hover:bg-slate-600" data-testid="engagement-state">{view.stateLabel}</Badge>
        <span className="flex items-center gap-1 text-sm font-semibold"><CheckCircle2 className="h-4 w-4 text-emerald-600" />Nothing further to do</span>
        {at && <span className="text-xs text-muted-foreground">since {day(at)}</span>}
      </div>
      <p className="text-sm text-muted-foreground">{view.summary}</p>
      {note && <p className="text-sm"><span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Note · </span>{note}</p>}
    </CardContent>
  </Card>;
}

/** "Mark completed — client ended early": a note is required; the server records it once. */
export function EndEngagementButton({ leadId, onChanged }: { leadId: string; onChanged: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const r = await invokeEdge<{ ok: boolean; subscription_live?: boolean; already?: boolean }>('paid-client-hub', { action: 'terminate_service', lead_id: leadId, reason: 'client_ended_early', note: note.trim(), confirm: true });
      toast({ title: r.already ? 'Already ended' : 'Marked completed', description: r.subscription_live ? 'A subscription is still live: cancel it in Stripe (we emailed you the details).' : 'No live subscription is recorded. Nothing was charged or refunded.' });
      setOpen(false); onChanged();
    } catch (e) { toast({ title: 'Not saved', description: edgeErrorMessage(e, 'Try again'), variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={(v) => { if (!busy) setOpen(v); }}>
    <DialogTrigger asChild><Button size="sm" variant="outline" data-testid="end-engagement">Mark completed (client ended early)…</Button></DialogTrigger>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Mark this client completed</DialogTitle>
        <DialogDescription>For a client who chose to stop before their payments ran out. What they paid is kept and stays in the history (and any commission earned on it). Re-measure, results, monthly updates and delivery stop; no stage is marked done. Nothing is charged or refunded here: if a subscription is live you cancel it in Stripe.</DialogDescription>
      </DialogHeader>
      <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why it ended (kept on the record)" className="text-sm" />
      <DialogFooter>
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
        <Button onClick={() => void save()} disabled={busy || note.trim().length < 10}>{busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Mark completed</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
