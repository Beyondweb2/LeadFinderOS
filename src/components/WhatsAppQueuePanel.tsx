import { useCallback, useEffect, useState } from 'react';
import { MessageSquare, Loader2, Play, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface QueueStatus {
  testMode: boolean;
  live: boolean;
  sentToday: number;
  cap: number;
  queuedCount: number;
  nextSendAt: string | null;
  windowOpen: boolean;
  ukTime: string;
}

/**
 * Admin queue dashboard for WhatsApp outreach. Reads live status from
 * process-whatsapp-queue (mode:'status') and offers a "Run test tick" that forces
 * one processor pass for observation. In TEST_MODE the tick simulates (nothing real
 * sent); when live it behaves like the cron tick. Self-gating: if the caller isn't
 * an admin the status call fails and the panel renders nothing.
 */
export function WhatsAppQueuePanel() {
  const { toast } = useToast();
  const [status, setStatus] = useState<QueueStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [ticking, setTicking] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-whatsapp-queue', { body: { mode: 'status' } });
      if (error) throw error;
      if (data?.ok) setStatus(data as QueueStatus);
    } catch {
      /* non-admin / unavailable → leave null (panel hides) */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const runTick = async () => {
    setTicking(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-whatsapp-queue', { body: { mode: 'tick', force: true } });
      if (error) throw error;
      if (data?.sent) {
        toast({
          title: data.simulated ? 'Simulated send ✓' : 'Sent ✓',
          description: `${data.business} · ${data.template}${data.simulated ? ' — TEST_MODE, nothing real sent' : ''}`,
        });
      } else {
        toast({ title: 'No send this tick', description: `Skipped: ${data?.skipped ?? 'unknown'}` });
      }
      await refresh();
    } catch (e) {
      toast({ title: "Couldn't run the tick", description: (e as Error)?.message ?? 'Failed', variant: 'destructive' });
    } finally {
      setTicking(false);
    }
  };

  if (!status) return null; // admin-only; hidden otherwise

  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-green-500" />
          <span className="text-sm font-semibold">WhatsApp queue</span>
          {status.testMode ? (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-500">TEST MODE — no real sends</span>
          ) : (
            <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-bold text-red-500">LIVE — real sends</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={runTick} disabled={ticking}>
            {ticking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Run test tick
          </Button>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Stat label="Queued" value={String(status.queuedCount)} />
        <Stat label="Sent today" value={`${status.sentToday} / ${status.cap}`} />
        <Stat label="UK time" value={`${status.ukTime} ${status.windowOpen ? '· open' : '· closed'}`} />
        <Stat label="Next send" value={status.nextSendAt ? new Date(status.nextSendAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-background/40 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground/60">{label}</div>
      <div className="font-semibold text-foreground/90">{value}</div>
    </div>
  );
}
