import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, MessageSquareText, Pause, Play, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SURFACE, IconTile, ToneChip, EmptyState, LoadState, ErrorState } from '@/components/operator/ui';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/hooks/useSubscription';
import { SMS_QUEUE_DAILY_CAP, SMS_QUEUE_WINDOW, smsWindowOpen } from '@/lib/smsMessages';
import { notifyLeadChanged } from '@/lib/leadSync';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

/* THE TEXT QUEUE (2026-10-09) — sits under the WhatsApp queue on the same page, for both roles: what is waiting, in send order,
   how many have gone today, and Remove. The rows come from my_sms_queue (a salesperson sees their own leads, admin all); the
   Pause switch is the admin's (sms_queue_set_paused). Removing a lead sends nothing and changes nothing else on it. */
const mask = (p: string | null) => { const d = String(p ?? '').replace(/\D/g, ''); return d.length >= 4 ? `…${d.slice(-4)}` : ''; };

export function SmsQueuePanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { role } = useSubscription();
  const [busy, setBusy] = useState<string | null>(null);
  const rows = useQuery({
    queryKey: ['sms-queue', 'rows'], refetchInterval: 30_000,
    queryFn: async () => { const { data, error } = await sb.rpc('my_sms_queue'); if (error) throw error; return (data ?? []) as Array<{ id: string; business_name: string | null; phone: string | null; queued_at: string }>; },
  });
  const info = useQuery({
    queryKey: ['sms-queue', 'info'], refetchInterval: 30_000,
    queryFn: async () => { const { data, error } = await sb.rpc('sms_queue_info'); if (error) throw error; return (data ?? null) as { paused: boolean; sent_today: number } | null; },
  });
  const remove = async (id: string) => {
    setBusy(id);
    try {
      const { data, error } = await sb.rpc('unqueue_sms', { _lead_id: id });
      if (error || !(data as { ok?: boolean })?.ok) { toast({ title: 'Not removed', description: 'Could not remove it from the text queue.', variant: 'destructive' }); return; }
      notifyLeadChanged(id);
      void qc.invalidateQueries({ queryKey: ['sms-queue'] });
      toast({ title: 'Removed from the text queue', description: 'Nothing was sent.' });
    } finally { setBusy(null); }
  };
  const setPaused = async (paused: boolean) => {
    setBusy('pause');
    try {
      const { error } = await sb.rpc('sms_queue_set_paused', { _paused: paused });
      if (error) { toast({ title: 'Not changed', description: error.message, variant: 'destructive' }); return; }
      void qc.invalidateQueries({ queryKey: ['sms-queue', 'info'] });
    } finally { setBusy(null); }
  };
  const list = rows.data ?? [];
  const open = smsWindowOpen();
  return (
    <div className={cn(SURFACE, 'p-4')} data-testid="sms-queue">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <IconTile icon={MessageSquareText} tone="blue" size="sm" />
          <span className="text-sm font-bold tracking-tight">Text queue</span>
          <ToneChip tone="grey">{role === 'admin' ? 'Whole team' : 'Your leads'}</ToneChip>
          {info.data?.paused && <ToneChip tone="amber" icon={Pause} testId="sms-queue-paused">PAUSED — no texts</ToneChip>}
          {!open && <ToneChip tone="grey">Closed until {SMS_QUEUE_WINDOW.startHour}am UK</ToneChip>}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span data-testid="sms-queue-today">{info.data ? `${info.data.sent_today} / ${SMS_QUEUE_DAILY_CAP} sent today` : ''}</span>
          {role === 'admin' && info.data && (
            <Button size="sm" variant={info.data.paused ? 'default' : 'outline'} className="h-8 gap-1.5 text-xs" disabled={busy === 'pause'} onClick={() => void setPaused(!info.data!.paused)} data-testid="sms-queue-pause">
              {info.data.paused ? <><Play className="h-3.5 w-3.5" />Resume</> : <><Pause className="h-3.5 w-3.5" />Pause</>}
            </Button>
          )}
        </div>
      </div>
      <div className="mt-2 rounded-xl bg-muted/30 p-2 ring-1 ring-inset ring-border/40">
        {rows.isPending ? <LoadState compact label="Loading the text queue…" />
          : rows.isError ? <ErrorState className="py-4" title="Could not load the text queue." onRetry={() => void rows.refetch()} retryLabel="Try again" />
          : list.length === 0 ? <EmptyState icon={MessageSquareText} title="No texts waiting" className="py-6" testId="sms-queue-empty">Select leads in Outreach and press Queue text to line up the intro text.</EmptyState>
          : (
            <ol className="max-h-[320px] space-y-0.5 overflow-y-auto pr-1">
              {list.map((l, i) => (
                <li key={l.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted/50" data-testid="sms-queue-row">
                  <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{l.business_name || 'Unnamed lead'}</span>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{mask(l.phone)}</span>
                  <ToneChip tone="blue" className="shrink-0">Waiting</ToneChip>
                  <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => void remove(l.id)} disabled={busy !== null} aria-label={`Remove ${l.business_name ?? 'lead'} from the text queue`} title="Remove from the text queue">
                    {busy === l.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                  </Button>
                </li>
              ))}
            </ol>
          )}
      </div>
    </div>
  );
}
