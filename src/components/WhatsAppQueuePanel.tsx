import { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageSquare, Loader2, Play, Pause, RefreshCw, ChevronDown, ChevronRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { OutreachLead } from '@/types/outreach';

interface QueueStatus {
  testMode: boolean;
  live: boolean;
  sentToday: number;
  cap: number;
  queuedCount: number;
  /** Queued leads the processor will NOT send to because they are archived. Reported so a stalled
   *  queue can be told apart from one holding withdrawn leads. */
  archivedQueuedCount?: number;
  /** Leads queued in the SEPARATE hook_followup lane (marker column, not status='queued'). Optional
   *  so the panel degrades cleanly against an older function deploy that predates this field. */
  hookQueuedCount?: number;
  nextSendAt: string | null;
  /** The real next eligible send, computed server-side in Europe/London. Optional so the panel
   *  degrades cleanly against an older function deploy that has not shipped it yet. */
  nextEligibleSendAt?: string | null;
  windowOpen: boolean;
  paused: boolean;
  ukTime: string;
  /** D2 — completion auto-send template (null = off). */
  auditCompleteTemplate?: string | null;
}

/**
 * Admin queue dashboard for WhatsApp outreach. Live counts/window come from
 * process-whatsapp-queue (mode:'status'); the queued LIST comes from the loaded
 * leads (status='queued', oldest queued_at first = send order). "Run test tick"
 * forces one processor pass for observation (simulated while in TEST_MODE).
 * Self-gating: if the caller isn't an admin the status call fails → renders nothing.
 */
export function WhatsAppQueuePanel({
  leads,
  onUpdateLead,
}: {
  leads: OutreachLead[];
  onUpdateLead: (leadId: string, data: Partial<OutreachLead>) => Promise<unknown> | void;
}) {
  const { toast } = useToast();
  const [status, setStatus] = useState<QueueStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [ticking, setTicking] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Send order = oldest queued first (matches the processor's `order by queued_at`).
  const queued = useMemo(
    () => leads
      .filter((l) => l.status === 'queued')
      .sort((a, b) => (a.queued_at ?? '').localeCompare(b.queued_at ?? '')),
    [leads],
  );

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

  // Pause/resume the whole queue (global). Server flips the shared flag via the
  // service client; the tick then skips all sending while paused. Admin-gated server-side.
  const togglePause = async () => {
    const nextPaused = !status?.paused;
    setPausing(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-whatsapp-queue', {
        body: { mode: nextPaused ? 'pause' : 'resume' },
      });
      if (error) throw error;
      if (data?.ok) setStatus(data as QueueStatus);
      toast({ title: nextPaused ? 'Queue paused' : 'Queue resumed', description: nextPaused ? 'No WhatsApp messages will send until you resume.' : 'Sending continues on the next tick.' });
    } catch (e) {
      toast({ title: "Couldn't change pause state", description: (e as Error)?.message ?? 'Failed', variant: 'destructive' });
    } finally {
      setPausing(false);
    }
  };

  // NOTE: the "On audit done" template select was deliberately REMOVED from this panel — the
  // audit_complete trigger machinery (finaliseSettledRuns hook, processor handling, the
  // set_audit_complete_template mode, the DB column) all remain, dormant while the setting is
  // null. The reply-chain's awaiting_audit path carries its own template and doesn't need it.

  const removeFromQueue = (id: string) => {
    // Restore the pre-queue status (fallback not_contacted); clear the capture + queued_at.
    const prev = leads.find((l) => l.id === id)?.previous_status;
    onUpdateLead(id, { status: prev ?? 'not_contacted', previous_status: null, queued_at: null });
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
          {status.paused && (
            <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[11px] font-bold text-orange-500">PAUSED — no sends</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={refresh} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          <Button
            size="sm"
            variant={status.paused ? 'default' : 'outline'}
            className="h-8 gap-1.5 text-xs"
            onClick={togglePause}
            disabled={pausing}
            title={status.paused
              ? 'Resume the queue — sending continues on the next tick'
              : 'Pause the queue — no WhatsApp messages send (cron ticks AND manual Run tick) until you resume'}
          >
            {pausing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : status.paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            {status.paused ? 'Resume' : 'Pause'}
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={runTick}
            disabled={ticking || status.paused}
            title={status.paused
              ? 'Queue is paused — resume to send. A tick sends nothing while paused.'
              : status.testMode
                ? 'Force one simulated processor pass (TEST_MODE — nothing is sent)'
                : 'Run one processor pass now — a REAL send, subject to the 7am–9:30pm window, daily cap and pacing'}
          >
            {ticking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {status.testMode ? 'Run test tick' : 'Run tick'}
          </Button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        {/* Queued — click to expand the list (send order). */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center justify-between rounded-lg border border-border/40 bg-background/40 px-2.5 py-1.5 text-left transition-colors hover:border-border"
        >
          <span>
            <span className="block text-[10px] uppercase tracking-wide text-muted-foreground/60">Queued</span>
            <span className="font-semibold text-foreground/90">{queued.length}</span>
            {/* The hook_followup lane paces through the SAME cap/window but is a separate marker, so
                the opener count above never includes it. Shown here so a bulk hook-queue is visible
                and doesn't look like it failed. Only when there's a backlog. Display only. */}
            {(status.hookQueuedCount ?? 0) > 0 && (
              <span className="block text-[10px] font-medium text-muted-foreground/70">
                + {status.hookQueuedCount} hook follow-up{status.hookQueuedCount === 1 ? '' : 's'}
              </span>
            )}
          </span>
          {queued.length > 0 && (expanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />)}
        </button>
        <Stat label="Sent today" value={`${status.sentToday} / ${status.cap}`} />
        <Stat label="UK time" value={`${status.ukTime} ${status.windowOpen ? '· open' : '· closed'}`} />
        {/* ⛔ READS nextEligibleSendAt (server, Europe/London), NOT the raw nextSendAt pacing stamp
            which is only written after a send and so reads stale — often on the viewer's clock.
            Formatted with timeZone: 'Europe/London' so it is UK time wherever the operator is, and
            suffixed "UK" to match the "UK time" stat beside it. Falls back to nextSendAt only if an
            older function deploy has not shipped the new field. */}
        <Stat label="Next send" value={(() => {
          const iso = status.nextEligibleSendAt ?? status.nextSendAt;
          if (!iso) return '—';
          return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) + ' UK';
        })()} />
      </div>

      {/* Archived leads still sitting at status='queued'. The processor skips them; saying so here
          stops "the queue looks stuck" being confused with "these were withdrawn". */}
      {(status.archivedQueuedCount ?? 0) > 0 && (
        <p className="mt-2 rounded-md border border-amber-500/20 bg-amber-500/5 px-2.5 py-1.5 text-[11px] text-amber-600 dark:text-amber-400">
          {status.archivedQueuedCount} archived {status.archivedQueuedCount === 1 ? 'lead is' : 'leads are'} still marked queued and will <strong>not</strong> be sent to. Archiving stops contact.
        </p>
      )}

      {expanded && (
        <div className="mt-2 rounded-lg border border-border/40 bg-background/40 p-2">
          <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground/50">In send order (next first)</div>
          {queued.length === 0 ? (
            <p className="px-1 py-1 text-xs text-muted-foreground/60">Queue is empty.</p>
          ) : (
            <ol className="space-y-0.5">
              {queued.map((l, i) => (
                <li key={l.id} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-white/[0.03]">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="w-5 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground/50">{i + 1}</span>
                    <span className="truncate text-foreground/90">{l.business_name}</span>
                    {l.whatsapp_template && <span className="shrink-0 text-[10px] text-muted-foreground/50">{l.whatsapp_template}</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeFromQueue(l.id)}
                    title="Remove from queue"
                    className="shrink-0 rounded p-1 text-muted-foreground/50 transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
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
