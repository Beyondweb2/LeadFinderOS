import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getQueueStatus, rememberQueueStatus, QUEUE_STATE_KEY, queuedLeadLine } from '@/lib/queueStatus';
import { MessageSquare, Loader2, Play, Pause, RefreshCw, ChevronDown, ChevronRight, X, Inbox as InboxIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useLeadPermissions } from '@/hooks/useLeadPermissions';
import { useQueueState } from '@/hooks/useQueueState';
import { useWhatsAppQueue } from '@/hooks/useWhatsAppQueue';
import { leadRpc } from '@/lib/leadRpc';
import { notifyLeadChanged } from '@/lib/leadSync';
import { refusalText } from '@/lib/salesCrm';
import { templateLabel } from '@/types/outreach';
import {
  auditStatusFor, AUDIT_STATUS_PRESENTATION,
  type AuditRowForStatus, type QueueAuditStatus,
} from '@/lib/queueAuditStatus';
import { WA_TEMPLATE_REQS } from '@/lib/whatsappTemplates';
import {
  announceQueueChanged, batchHeadline, deriveQueue, QUEUE_BATCH_EVENT, QUEUE_ROW_STATE, readQueueBatch, ukClock,
  type QueueBatch, type QueueRow, type QueueRowState,
} from '@/lib/whatsappQueueView';
import { Callout, EmptyState, ErrorState, IconTile, LoadState, SURFACE, ToneChip } from '@/components/operator/ui';
import { cn } from '@/lib/utils';

/** The admin's team-wide status (process-whatsapp-queue mode 'status' — admin-only on the server). */
interface TeamStatus {
  testMode: boolean;
  live: boolean;
  sentToday: number;
  cap: number;
  nextSendAt: string | null;
  /** The real next eligible send, computed server-side in Europe/London. Optional so the panel
   *  degrades cleanly against an older function deploy that has not shipped it yet. */
  nextEligibleSendAt?: string | null;
  paused: boolean;
}

/**
 * THE WHATSAPP QUEUE — one component, both roles (2026-10-06; src/lib/whatsappQueueView.ts is the rule).
 *
 * Rows: useWhatsAppQueue (the `sales_leads` view — the server decides whose rows). Sending state: queue_state
 * (both roles). Everything a salesperson sees, the admin sees in the same place and the same way.
 * ⛔ ADMIN-ONLY, because they act on or describe the WHOLE team's sending: test / live mode, pause / resume,
 *    Run tick, sent today against the cap, the next paced send, and cancelling a no-reply follow-up (a lane
 *    only the admin queues; the Inbox gates it the same way). The server refuses every one of them to Sales.
 * Remove a waiting opener = fn lead_unqueue for BOTH roles (role + can_work_lead + only a lead still waiting).
 */
export function WhatsAppQueuePanel({ defaultExpanded = true }: { defaultExpanded?: boolean }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const perms = useLeadPermissions();
  const teamControls = perms.queueControls;
  const q = useWhatsAppQueue();
  const view = useMemo(() => deriveQueue(q.data ?? []), [q.data]);
  const state = useQueueState();
  const [team, setTeam] = useState<TeamStatus | null>(null);
  const [teamLoading, setTeamLoading] = useState(false);
  const [ticking, setTicking] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [busy, setBusy] = useState<string | null>(null);
  const [batch, setBatch] = useState<QueueBatch | null>(() => readQueueBatch());
  useEffect(() => {
    const h = () => setBatch(readQueueBatch());
    window.addEventListener(QUEUE_BATCH_EVENT, h);
    return () => window.removeEventListener(QUEUE_BATCH_EVENT, h);
  }, []);

  /* ══ AUDIT STATUS PER QUEUED LEAD ═════════════════════════════════════════════════════════════
     🔴 WHY THIS IS ON SCREEN AT ALL. A lead queued for an audit-class template cannot send until its
     audit completes — the message carries the report link and templateBodyParams refuses to build it
     without one. From the queue a lead WAITING on its audit looked exactly like a stuck one.
     ⚠️ READ ONLY FOR THE LEADS THAT NEED IT (audit-class templates) — a queue of openers issues no request.
     RLS scopes ai_audits: the admin's own, a salesperson's own leads' (my_sales_audit_ids).
     ⚠️ NOT PAGINATED, DELIBERATELY, AND BOUNDED BY CONSTRUCTION: `.in()` over the queued audit-class
     leads only. */
  const auditLeadIds = useMemo(
    () => view.waiting.filter((l) => l.whatsapp_template && WA_TEMPLATE_REQS[l.whatsapp_template]?.needsAudit).map((l) => l.id),
    [view.waiting],
  );
  const [auditRows, setAuditRows] = useState<AuditRowForStatus[]>([]);
  const auditKey = auditLeadIds.join(',');
  useEffect(() => {
    if (!auditLeadIds.length) { setAuditRows([]); return; }
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from('ai_audits')
        .select('lead_id, ai_audit_runs(status)')
        .in('lead_id', auditLeadIds)
        .order('created_at', { ascending: false });
      /* An error leaves the previous rows alone rather than blanking them to "no audit". */
      if (alive && !error) setAuditRows((data ?? []) as unknown as AuditRowForStatus[]);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auditKey]);
  const auditStatusByLead = useMemo(() => {
    const byLead = new Map<string, AuditRowForStatus[]>();
    for (const r of auditRows) {
      if (!r.lead_id) continue;
      const list = byLead.get(r.lead_id) ?? [];
      list.push(r);
      byLead.set(r.lead_id, list);
    }
    const out = new Map<string, QueueAuditStatus>();
    for (const l of view.waiting) out.set(l.id, auditStatusFor(l.whatsapp_template, byLead.get(l.id) ?? []));
    return out;
  }, [auditRows, view.waiting]);

  /* The admin's team numbers (src/lib/queueStatus.ts): on open it joins/reuses a recent read; Refresh and
     the post-tick refresh pass fresh=true. Never requested for Sales — the server refuses 'status' to them. */
  const refreshTeam = useCallback(async (fresh = false) => {
    if (!teamControls) return;
    setTeamLoading(true);
    try {
      const data = await getQueueStatus(qc, fresh);
      if (data?.ok) setTeam(data as unknown as TeamStatus);
    } catch {
      /* unavailable → the team tiles read "—"; the rows still show */
    } finally {
      setTeamLoading(false);
    }
  }, [qc, teamControls]);
  useEffect(() => { void refreshTeam(); }, [refreshTeam]);

  /* ONE refresh, both roles: the rows and the sending state; the admin's team numbers as well. */
  const refreshing = q.isFetching || teamLoading;
  const refresh = async () => {
    await Promise.all([
      q.refetch(),
      qc.invalidateQueries({ queryKey: QUEUE_STATE_KEY }),
      refreshTeam(true),
    ]);
  };

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

  // Pause/resume the whole queue (global, admin-gated server-side). The tick skips all sending while paused.
  const paused = team?.paused ?? state?.paused === true;
  const togglePause = async () => {
    const nextPaused = !paused;
    setPausing(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-whatsapp-queue', {
        body: { mode: nextPaused ? 'pause' : 'resume' },
      });
      if (error) throw error;
      if (data?.ok) setTeam(data as TeamStatus);
      rememberQueueStatus(qc, data);
      void qc.invalidateQueries({ queryKey: QUEUE_STATE_KEY });
      toast({ title: nextPaused ? 'Queue paused' : 'Queue resumed', description: nextPaused ? 'No WhatsApp messages will send until you resume.' : 'Sending continues on the next tick.' });
    } catch (e) {
      toast({ title: "Couldn't change pause state", description: (e as Error)?.message ?? 'Failed', variant: 'destructive' });
    } finally {
      setPausing(false);
    }
  };

  /* Remove ONE waiting opener — both roles, the same server act (lead_unqueue): only a lead the caller may
     work, only while it is still waiting; it goes back to its pre-queue status. */
  const removeFromQueue = async (l: QueueRow) => {
    setBusy(l.id);
    try {
      const r = await leadRpc('lead_unqueue', { _lead_id: l.id });
      if (!r.ok) { toast({ title: 'Not removed', description: refusalText(r.error), variant: 'destructive' }); return; }
      notifyLeadChanged(l.id);
      announceQueueChanged();
      toast({ title: 'Removed from the queue', description: 'It will not be sent. You can queue it again later.' });
    } finally { setBusy(null); }
  };

  /* Cancel ONE no-reply follow-up (admin): clear the lane marker so the drainer skips it, and restore the
     pre-2nd-attempt status (→ Contacted). Sends nothing and suppresses nothing. */
  const removeContactFollowup = async (l: QueueRow) => {
    setBusy(l.id);
    try {
      const { data: cur } = await supabase.from('outreach_leads').select('previous_status').eq('id', l.id).maybeSingle();
      const prev = (cur as { previous_status?: string | null } | null)?.previous_status ?? null;
      const { error } = await supabase.from('outreach_leads')
        .update({ contact_followup_queued_at: null, status: prev ?? 'initial_contact', previous_status: null } as never)
        .eq('id', l.id);
      if (error) { toast({ title: 'Not cancelled', description: error.message, variant: 'destructive' }); return; }
      notifyLeadChanged(l.id);
      announceQueueChanged();
      toast({ title: 'Follow-up cancelled', description: 'The business stays Contacted and contactable.' });
    } finally { setBusy(null); }
  };

  const line = queuedLeadLine(state);

  return (
    <div className={cn(SURFACE, 'p-4')} data-testid="whatsapp-queue" data-scope={teamControls ? 'team' : 'mine'}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <IconTile icon={MessageSquare} tone="blue" size="sm" />
          <span className="text-sm font-bold tracking-tight">WhatsApp queue</span>
          <ToneChip tone="grey" testId="queue-scope">{teamControls ? 'Whole team' : 'Your leads'}</ToneChip>
          {teamControls && team && (team.testMode
            ? <ToneChip tone="amber">TEST MODE — no real sends</ToneChip>
            : <ToneChip tone="red" dot>LIVE — real sends</ToneChip>)}
          {paused && <ToneChip tone="amber" icon={Pause} testId="queue-paused-chip">PAUSED — no sends</ToneChip>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={() => void refresh()} disabled={refreshing} data-testid="queue-refresh">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          {teamControls && <>
            <Button
              size="sm"
              variant={paused ? 'default' : 'outline'}
              className="h-8 gap-1.5 text-xs"
              onClick={togglePause}
              disabled={pausing}
              title={paused
                ? 'Resume the queue — sending continues on the next tick'
                : 'Pause the queue — no WhatsApp messages send (cron ticks AND manual Run tick) until you resume'}
            >
              {pausing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              {paused ? 'Resume' : 'Pause'}
            </Button>
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={runTick}
              disabled={ticking || paused}
              title={paused
                ? 'Queue is paused — resume to send. A tick sends nothing while paused.'
                : team?.testMode
                  ? 'Force one simulated processor pass (TEST_MODE — nothing is sent)'
                  : 'Run one processor pass now — a REAL send, subject to the 7am–9:30pm window, daily cap and pacing'}
            >
              {ticking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              {team?.testMode ? 'Run test tick' : 'Run tick'}
            </Button>
          </>}
        </div>
      </div>

      <p role="status" data-testid="queue-line" className={cn('mt-2 text-sm', line.tone === 'paused' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
        {line.text.replace(/^In the queue — (.)/, (_m, c: string) => c.toUpperCase())}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        {/* Queued — click to show or hide the list (send order). */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          data-testid="queue-toggle"
          className="flex min-w-0 items-center justify-between rounded-xl bg-muted/40 px-2.5 py-1.5 text-left ring-1 ring-inset ring-border/40 transition-colors hover:ring-border"
        >
          <span className="min-w-0">
            <span className="block text-[10px] uppercase tracking-wide text-muted-foreground/60">Queued</span>
            <span className="font-semibold text-foreground/90" data-testid="queue-count">{q.isSuccess ? view.waiting.length : '—'}</span>
            {view.hookCount > 0 && (
              <span className="block text-[10px] font-medium text-muted-foreground/70">
                + {view.hookCount} hook follow-up{view.hookCount === 1 ? '' : 's'}
              </span>
            )}
            {view.followUps.length > 0 && (
              <span className="block text-[10px] font-medium text-sky-600/80 dark:text-sky-400/80">
                + {view.followUps.length} no-reply follow-up{view.followUps.length === 1 ? '' : 's'}
              </span>
            )}
          </span>
          {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />}
        </button>
        <Stat label="UK time" value={`${ukClock()} ${state ? (state.windowOpen ? '· open' : '· closed') : ''}`.trim()} />
        {teamControls && <Stat label="Sent today" value={team ? `${team.sentToday} / ${team.cap}` : '—'} />}
        {/* ⛔ READS nextEligibleSendAt (server, Europe/London), NOT the raw nextSendAt pacing stamp, formatted
            in Europe/London so it is UK time wherever the operator is. Falls back to nextSendAt only if an
            older function deploy has not shipped the new field. */}
        {teamControls && <Stat label="Next send" value={(() => {
          const iso = team?.nextEligibleSendAt ?? team?.nextSendAt;
          if (!iso) return '—';
          return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) + ' UK';
        })()} />}
      </div>

      {/* Archived leads still sitting at status='queued' — the processor skips them; saying so stops "the queue
          looks stuck" being confused with "these were withdrawn". Counted from the rows on screen. */}
      {view.archivedWaiting > 0 && (
        <Callout tone="amber" className="mt-2 px-3 py-2 text-[11px]">
          {view.archivedWaiting} archived {view.archivedWaiting === 1 ? 'lead is' : 'leads are'} still marked queued and will <strong>not</strong> be sent to. Archiving stops contact.
        </Callout>
      )}

      {/* The last batch THIS tab queued — a batch result, never queue rows (whatsappQueueView.ts). */}
      {batch && <BatchNote batch={batch} className="mt-2" />}

      {expanded && (
        <div className="mt-2 rounded-xl bg-muted/30 p-2 ring-1 ring-inset ring-border/40" data-testid="queue-list">
          <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground/50">In send order (next first)</div>
          {q.isPending ? <LoadState compact label="Loading the queue…" />
            : q.isError ? <ErrorState className="py-4" title="Could not load the queue." onRetry={() => void q.refetch()} retryLabel="Try again" />
            : view.waiting.length === 0 && view.followUps.length === 0 ? (
              <EmptyState icon={InboxIcon} title="No messages waiting" className="py-6" testId="queue-empty">
                {view.hookCount > 0 ? 'Only hook follow-ups are waiting (counted above).' : 'Leads you queue for WhatsApp appear here in send order.'}
              </EmptyState>
            ) : (
            /* Fixed-height scroll box so a long list (90+ follow-ups) is a contained panel. Both lanes in one scroller. */
            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {view.waiting.length > 0 && (
                <ol className="space-y-0.5">
                  {view.waiting.map((l, i) => (
                    <QueueItem key={l.id} index={i + 1} row={l} state="waiting" audit={auditStatusByLead.get(l.id)}
                      busy={busy === l.id} disabled={busy !== null}
                      onRemove={() => void removeFromQueue(l)} removeTitle="Remove from queue" />
                  ))}
                </ol>
              )}
              {/* The contact_followup lane, listed after the openers (it drains only once the opener queue is
                  empty each tick). Cancelling one is the admin's (it is the admin's lane). */}
              {view.followUps.length > 0 && (
                <div>
                  {view.waiting.length > 0 && (
                    <div className="px-1 pb-0.5 pt-1 text-[10px] uppercase tracking-wide text-sky-600/70 dark:text-sky-400/70">
                      No-reply follow-ups (after the openers)
                    </div>
                  )}
                  <ol className="space-y-0.5">
                    {view.followUps.map((l, i) => (
                      <QueueItem key={l.id} index={i + 1} row={l} state="follow_up"
                        busy={busy === l.id} disabled={busy !== null}
                        onRemove={teamControls ? () => void removeContactFollowup(l) : undefined}
                        removeTitle="Cancel this follow-up (leaves the business Contacted and contactable)" />
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QueueItem({ index, row, state, audit, busy, disabled, onRemove, removeTitle }: {
  index: number; row: QueueRow; state: QueueRowState; audit?: QueueAuditStatus;
  busy: boolean; disabled: boolean; onRemove?: () => void; removeTitle: string;
}) {
  const s = QUEUE_ROW_STATE[state];
  const name = row.business_name ?? 'Unnamed business';
  const tmpl = state === 'follow_up' ? 'contact_followup' : row.whatsapp_template;
  return (
    <li className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted/50" data-testid="queue-row" data-state={state}>
      <span className="flex min-w-0 items-start gap-2">
        <span className="mt-0.5 w-5 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground/50">{index}</span>
        <span className="min-w-0">
          <span className="block truncate font-medium text-foreground/90">{name}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
            <ToneChip tone={s.tone} title={s.title} testId="queue-row-state">{s.label}</ToneChip>
            {tmpl && <span className="truncate" title={tmpl}>{templateLabel(tmpl)}</span>}
            {audit && audit !== 'not_needed' && (() => {
              const p = AUDIT_STATUS_PRESENTATION[audit];
              return <span className={`shrink-0 text-[10px] ${p.className}`} title={p.title}>{p.label}</span>;
            })()}
          </span>
        </span>
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          title={removeTitle}
          aria-label={`${removeTitle}: ${name}`}
          data-testid="queue-row-remove"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
        </button>
      )}
    </li>
  );
}

/** The last batch, shown as a batch (both the Outreach summary and the queue page use it). */
export function BatchNote({ batch, className }: { batch: QueueBatch; className?: string }) {
  const time = new Date(batch.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
  return (
    <div className={cn('rounded-xl bg-muted/30 px-3 py-2 text-[11px] ring-1 ring-inset ring-border/40', className)} data-testid="queue-last-batch">
      <span className="font-semibold text-foreground/90">Last batch ({time}):</span>{' '}
      <span className="text-muted-foreground">{batchHeadline(batch)}</span>
      {batch.skipped.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-muted-foreground">
          {batch.skipped.map((s) => <li key={s.label}>– {s.n} {s.label}</li>)}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-muted/40 px-2.5 py-1.5 ring-1 ring-inset ring-border/40">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground/60">{label}</div>
      <div className="truncate font-semibold text-foreground/90">{value}</div>
    </div>
  );
}
