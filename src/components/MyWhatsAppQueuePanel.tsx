import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Loader2, MessageSquare, PauseCircle, RefreshCw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueueState } from '@/hooks/useQueueState';
import { leadRpc } from '@/lib/leadRpc';
import { notifyLeadChanged } from '@/lib/leadSync';
import { QUEUE_PAUSED_LINE, queuedLeadLine } from '@/lib/queueStatus';
import { refusalText } from '@/lib/salesCrm';
import { templateLabel } from '@/types/outreach';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   A SALESPERSON'S WHATSAPP QUEUE (2026-10-03) — the useful half of the admin's queue panel.

   The admin panel (WhatsAppQueuePanel) shows the WHOLE queue and its controls: pause / resume, a test tick,
   sent today against the cap. A salesperson used to get none of it — only a banner when the queue was
   paused — so after queueing they could not see their leads waiting, in what order, or take one back out.

   ⛔ THEIR LEADS ONLY, DECIDED BY THE SERVER: the list is read from the `sales_leads` view, which returns a
      salesperson only leads assigned to them (never the admin's, another rep's, or a client). Nothing here
      filters by owner in the browser.
   ⛔ NO QUEUE CONTROLS, NO TEAM NUMBERS: pause, tick, cap and sent-today stay the admin's. Whether the queue is
      sending comes from process-whatsapp-queue `queue_state` (paused / window), readable by both roles.
   Remove = fn lead_unqueue (only a lead still waiting; the same act as the admin's ✕).
   Fresh: re-read on every lead change notice (leadSync), on campaign launch / stop, on focus, and every
   QUEUE_POLL_MS while anything waits — Sales does not receive outreach_leads realtime.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export const MY_QUEUE_KEY = ['my-whatsapp-queue'] as const;
/** Fired by every queue path (bulk queue, the lead popup, campaign launch / stop): the panel re-reads at once. */
export const QUEUE_CHANGED_EVENT = 'whatsapp-queue-changed';
export function announceQueueChanged(): void { if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(QUEUE_CHANGED_EVENT)); }
const QUEUE_POLL_MS = 30_000;

interface QueuedRow { id: string; business_name: string | null; queued_at: string | null; whatsapp_template: string | null; phone: string | null }

export function useMyWhatsAppQueue() {
  return useQuery({
    queryKey: MY_QUEUE_KEY,
    queryFn: async (): Promise<QueuedRow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).from('sales_leads')
        .select('id, business_name, queued_at, whatsapp_template, phone')
        .eq('status', 'queued').eq('is_archived', false)
        .order('queued_at', { ascending: true }).order('id', { ascending: true }).limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as QueuedRow[];
    },
    refetchInterval: (q) => ((q.state.data?.length ?? 0) > 0 ? QUEUE_POLL_MS : false),
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });
}

export function MyWhatsAppQueuePanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const q = useMyWhatsAppQueue();
  const rows = q.data ?? [];
  const state = useQueueState(rows.length > 0);
  const [expanded, setExpanded] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  useEffect(() => {
    const h = () => { void qc.invalidateQueries({ queryKey: MY_QUEUE_KEY }); setExpanded(true); };
    window.addEventListener(QUEUE_CHANGED_EVENT, h);
    return () => window.removeEventListener(QUEUE_CHANGED_EVENT, h);
  }, [qc]);

  /* Nothing waiting and nothing wrong: the card stays out of the way (it appears the moment a lead is queued). */
  if (q.isSuccess && rows.length === 0) return null;
  if (q.isPending) return null;

  const line = queuedLeadLine(state);
  const remove = async (id: string) => {
    setRemoving(id);
    try {
      const r = await leadRpc('lead_unqueue', { _lead_id: id });
      if (!r.ok) { toast({ title: 'Not removed', description: refusalText(r.error), variant: 'destructive' }); return; }
      notifyLeadChanged(id);
      await qc.invalidateQueries({ queryKey: MY_QUEUE_KEY });
      toast({ title: 'Removed from the queue', description: 'It will not be sent. You can queue it again later.' });
    } finally { setRemoving(null); }
  };

  return <div className="rounded-xl border border-border/60 bg-card/60 p-4 shadow-sm" data-testid="my-whatsapp-queue">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-green-500" />
        <span className="text-sm font-semibold">WhatsApp queue</span>
        {state?.paused && <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[11px] font-bold text-orange-500">PAUSED — no sends</span>}
      </div>
      <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={() => void q.refetch()} disabled={q.isFetching}>
        <RefreshCw className={`h-3.5 w-3.5 ${q.isFetching ? 'animate-spin' : ''}`} /> Refresh
      </Button>
    </div>
    {q.isError
      ? <p className="mt-2 text-sm text-destructive">Could not load your queue. <button type="button" className="underline" onClick={() => void q.refetch()}>Try again</button></p>
      : <>
          {state?.paused
            ? <p role="status" data-testid="queue-paused-banner" className="mt-2 flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400"><PauseCircle className="h-4 w-4 shrink-0" /><span><span className="font-medium">{QUEUE_PAUSED_LINE}</span> {rows.length === 1 ? '1 of your leads is' : `${rows.length} of your leads are`} waiting in the queue.</span></p>
            : <p className="mt-2 text-sm text-muted-foreground" data-testid="my-queue-line">{line.text.replace(/^In the queue — /, '')}</p>}
          <button type="button" onClick={() => setExpanded((v) => !v)} data-testid="my-queue-toggle"
            className="mt-3 flex w-full items-center justify-between rounded-lg border border-border/40 bg-background/40 px-2.5 py-1.5 text-left text-xs transition-colors hover:border-border sm:w-64">
            <span><span className="block text-[10px] uppercase tracking-wide text-muted-foreground/60">Your leads queued</span><span className="font-semibold text-foreground/90" data-testid="my-queue-count">{rows.length}</span></span>
            {expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />}
          </button>
          {expanded && <div className="mt-2 rounded-lg border border-border/40 bg-background/40 p-2">
            <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground/50">In send order (next first) · sent a few at a time in the send window</div>
            <ul className="divide-y divide-border/30">
              {rows.map((l) => <li key={l.id} className="flex items-center justify-between gap-2 px-1 py-1.5 text-xs">
                <span className="min-w-0"><span className="block truncate font-medium">{l.business_name ?? 'Unnamed business'}</span><span className="block truncate text-muted-foreground">{l.whatsapp_template ? templateLabel(l.whatsapp_template) : 'First message'}</span></span>
                <button type="button" onClick={() => void remove(l.id)} disabled={removing !== null} title="Remove from queue" aria-label={`Remove ${l.business_name ?? 'lead'} from the queue`}
                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40">
                  {removing === l.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                </button>
              </li>)}
            </ul>
          </div>}
        </>}
  </div>;
}
