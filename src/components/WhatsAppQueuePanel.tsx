import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCountrySettings } from '@/hooks/useCountrySettings';
import { localDayStartUtc, marketsOn, windowForMarket, type Market } from '@/lib/outreachMarkets';
import { heldCountryOff } from '@/lib/countryHold';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getQueueStatus, rememberQueueStatus, QUEUE_STATE_KEY, queuedLeadLine } from '@/lib/queueStatus';
import { MessageSquare, Loader2, Play, Pause, RefreshCw, X, Trash2, Settings as SettingsIcon, Inbox as InboxIcon } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { displayBusinessName, nameStyleFor } from '@/lib/displayName';
import {
  auditStatusFor, AUDIT_STATUS_PRESENTATION,
  type AuditRowForStatus, type QueueAuditStatus,
} from '@/lib/queueAuditStatus';
import { WA_TEMPLATE_REQS } from '@/lib/whatsappTemplates';
import {
  announceQueueChanged, batchHeadline, countryOffChip, countryOffNote, deriveQueue, NEEDS_STATE_CHIP, QUEUE_ROW_STATE, rowCountryOff, rowNeedsState,
  type QueueBatch, type QueueRow, type QueueRowState,
} from '@/lib/whatsappQueueView';
import { nextSendWords, QUEUE_TABS, splitByTab, TAB_CALLING_CODE, TAB_LABEL, tabClock } from '@/lib/queueByCountry';
import { Callout, EmptyState, ErrorState, IconTile, LoadState, SURFACE, ToneChip } from '@/components/operator/ui';
import { cn } from '@/lib/utils';
import { WhatsAppPaceSettings, type PaceStatus } from '@/components/WhatsAppPaceSettings';
import { CountrySendingSettings } from '@/components/CountrySendingSettings';
import { RecentSendFailures } from '@/components/RecentSendFailures';
import { pauseChangeLine, type PauseChange } from '@/lib/queuePauseChange';

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
  /** Queued leads held by a test account — never sent, by design. Absent on an older deploy; null = unreadable. */
  testHeldQueuedCount?: number | null;
  /* 2026-10-14: the admin-set cap / pace, the auto-pause note, sent today per person (WhatsAppPaceSettings). */
  pace?: PaceStatus['pace'];
  numberHealth?: PaceStatus['numberHealth'];
  autoPausedAt?: PaceStatus['autoPausedAt'];
  autoPauseReason?: PaceStatus['autoPauseReason'];
  perPersonToday?: PaceStatus['perPersonToday'];
  personLimits?: PaceStatus['personLimits'];
  /** 2026-10-15: who last paused / resumed the queue, and when. Absent on an older deploy. */
  pauseChange?: PauseChange | null;
}

/** Template messages the queue (and Inbox) sent to one country since that country's local midnight. Admin only, one cheap
 *  head count for the tab on screen. Failed sends and test-mode sends are left out. null = could not be read. */
function useSentToday(market: Market, enabled: boolean) {
  const { settings } = useCountrySettings();
  return useQuery({
    queryKey: ['whatsapp-queue-sent-today', market],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<number | null> => {
      const tz = windowForMarket(market, settings, { tz: 'Europe/London', startMin: 0, endMin: 0 }).tz;
      const since = localDayStartUtc(tz).toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count, error } = await (supabase as any).from('whatsapp_messages').select('id', { count: 'exact', head: true })
        .eq('direction', 'outbound').eq('test_mode', false).not('template_name', 'is', null)
        .or('status.is.null,status.neq.failed')
        .like('phone', `${TAB_CALLING_CODE[market]}%`).gte('created_at', since);
      return error ? null : (count ?? 0);
    },
  });
}

/**
 * THE WHATSAPP QUEUE — one component, both roles (2026-10-06; src/lib/whatsappQueueView.ts is the rule).
 * 2026-10-22: ONE TAB PER COUNTRY (src/lib/queueByCountry.ts); every limit, switch, window, rating and failed-send list
 * lives in the Settings popup. A screen job only: no sending behaviour changed.
 *
 * Rows: useWhatsAppQueue (the `sales_leads` view — the server decides whose rows). Sending state: queue_state
 * (both roles). Everything a salesperson sees, the admin sees in the same place and the same way.
 * ⛔ ADMIN-ONLY, because they act on or describe the WHOLE team's sending: test / live mode, pause / resume,
 *    Run tick, sent today against the cap, the next paced send, and cancelling a no-reply follow-up (a lane
 *    only the admin queues; the Inbox gates it the same way). The server refuses every one of them to Sales.
 * ⛔ Pause and Run tick are the WHOLE queue's: the server has one pause flag and a tick takes no country. They are
 *    labelled so; a per-country pause or tick is a sending change and has not been made.
 * Remove a waiting opener = fn lead_unqueue for BOTH roles (role + can_work_lead + only a lead still waiting).
 */
export function WhatsAppQueuePanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const perms = useLeadPermissions();
  const teamControls = perms.queueControls;
  const q = useWhatsAppQueue();
  const { settings: countrySettings } = useCountrySettings();
  const markets = useMemo(() => marketsOn(countrySettings, 'whatsapp'), [countrySettings]);
  const [tab, setTab] = useState<Market>('UK');
  const byTab = useMemo(() => splitByTab(q.data ?? []), [q.data]);
  const views = useMemo(() => ({
    UK: deriveQueue(byTab.UK, markets), MY: deriveQueue(byTab.MY, markets),
    SG: deriveQueue(byTab.SG, markets), AU: deriveQueue(byTab.AU, markets),
  }), [byTab, markets]);
  const view = views[tab];
  const state = useQueueState();
  const [team, setTeam] = useState<TeamStatus | null>(null);
  const [teamLoading, setTeamLoading] = useState(false);
  const [ticking, setTicking] = useState(false);
  const [pausing, setPausing] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const sentToday = useSentToday(tab, teamControls);

  /* ══ AUDIT STATUS PER QUEUED LEAD ═════════════════════════════════════════════════════════════
     🔴 WHY THIS IS ON SCREEN AT ALL. A lead queued for an audit-class template cannot send until its
     audit completes — the message carries the report link and templateBodyParams refuses to build it
     without one. From the queue a lead WAITING on its audit looked exactly like a stuck one.
     ⚠️ READ ONLY FOR THE LEADS THAT NEED IT (audit-class templates) — a queue of openers issues no request.
     Only the tab on screen is read (2026-10-22), so the screen asks for less.
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
      qc.invalidateQueries({ queryKey: ['whatsapp-queue-sent-today'] }),
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
      toast({ title: nextPaused ? 'Queue paused' : 'Queue resumed', description: nextPaused ? 'No WhatsApp messages will send, in any country, until you resume.' : 'Sending continues on the next tick.' });
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

  /* Clear the waiting openers of the COUNTRY ON SCREEN (2026-10-22). The server's lead_unqueue_all empties every country,
     so this removes this tab's leads one by one through the same per-lead act (lead_unqueue), a few at a time. Each lead
     goes back to its pre-queue status; a lead the caller may not work, or that already left the queue, is simply counted
     as not removed. Sends nothing; no-reply follow-ups and the pause setting are not touched. */
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const CLEAR_PARALLEL = 5;
  const clearAll = async () => {
    const ids = view.waiting.map((l) => l.id);
    setClearing(true);
    try {
      let removed = 0;
      for (let i = 0; i < ids.length; i += CLEAR_PARALLEL) {
        const results = await Promise.all(ids.slice(i, i + CLEAR_PARALLEL).map(async (id) => {
          const r = await leadRpc('lead_unqueue', { _lead_id: id });
          if (r.ok) notifyLeadChanged(id);
          return r.ok;
        }));
        removed += results.filter(Boolean).length;
      }
      announceQueueChanged();
      const n = removed;
      const left = ids.length - n;
      toast({
        title: `Removed ${n} ${n === 1 ? 'lead' : 'leads'} from the ${TAB_LABEL[tab]} queue`,
        description: left > 0 ? `${left} could not be removed (already sent on, or not yours). Nothing was sent.` : 'Nothing was sent. You can queue them again later.',
        ...(left > 0 ? { variant: 'destructive' as const } : {}),
      });
    } finally { setClearing(false); setConfirmClear(false); }
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
  const clock = tabClock(tab, countrySettings);
  const tabCap = tab === 'UK' ? team?.cap ?? null : countrySettings[tab].whatsapp_daily_cap ?? null;
  const total = q.isSuccess ? QUEUE_TABS.reduce((n, m) => n + views[m].waiting.length, 0) : null;
  const offNote = countryOffNote(tab, countrySettings[tab], view.waiting.length);

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
          {teamControls && pauseChangeLine(team?.pauseChange, paused) && (
            <span className="text-[11px] text-muted-foreground" data-testid="queue-pause-change">{pauseChangeLine(team?.pauseChange, paused)}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={() => void refresh()} disabled={refreshing} data-testid="queue-refresh">
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </Button>
          {teamControls && (
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setSettingsOpen(true)} data-testid="queue-settings">
              <SettingsIcon className="h-3.5 w-3.5" /> Settings
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setConfirmClear(true)}
            disabled={clearing || !q.isSuccess || view.waiting.length === 0}
            data-testid="queue-clear-all"
            title={`Remove every waiting ${TAB_LABEL[tab]} lead from the queue. Nothing is sent.`}
          >
            {clearing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Clear queue
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
                : 'Pause the WHOLE queue, every country — no WhatsApp messages send (cron ticks AND manual Run tick) until you resume'}
            >
              {pausing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              {paused ? 'Resume all' : 'Pause all'}
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
                  : 'Run one processor pass now, for the whole queue — a REAL send, subject to the send window, daily cap and pacing'}
            >
              {ticking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              {team?.testMode ? 'Run test tick' : 'Run tick'}
            </Button>
          </>}
        </div>
      </div>

      <AlertDialog open={confirmClear} onOpenChange={(o) => { if (!clearing) setConfirmClear(o); }}>
        <AlertDialogContent data-testid="queue-clear-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {view.waiting.length} {view.waiting.length === 1 ? 'lead' : 'leads'} from the {TAB_LABEL[tab]} queue?</AlertDialogTitle>
            <AlertDialogDescription>
              {teamControls ? `This empties the ${TAB_LABEL[tab]} queue for the whole team.` : `This empties your queued ${TAB_LABEL[tab]} leads only.`} Other countries are not touched. Each lead goes back to the
              status it had before it was queued. Nothing is sent. No-reply follow-ups are not touched.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>Keep them queued</AlertDialogCancel>
            <AlertDialogAction disabled={clearing} onClick={(e) => { e.preventDefault(); void clearAll(); }} data-testid="queue-clear-confirm-go">
              {clearing ? 'Removing…' : `Remove ${view.waiting.length}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {teamControls && (
        <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
          <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto" data-testid="queue-settings-dialog">
            <DialogHeader>
              <DialogTitle>WhatsApp queue settings</DialogTitle>
              <DialogDescription>Limits, country switches, send hours, the number&apos;s quality rating and failed sends. Changes apply from the next queue tick.</DialogDescription>
            </DialogHeader>
            {/* The cap, pace, per-person limits, quality rating and tier, sent today per person; the auto-pause note (2026-10-14). Admin only. */}
            {teamControls && <WhatsAppPaceSettings team={team} onSaved={() => refreshTeam(true)} />}
            {/* 2026-10-14: sending by country — UK / Malaysia / Singapore / Australia switches, caps and local hours (admin only). */}
            {teamControls && <CountrySendingSettings />}
            {/* 2026-10-15: every failed send of the last 7 days with Meta's real error code and what it means (admin only). */}
            {teamControls && <RecentSendFailures />}
          </DialogContent>
        </Dialog>
      )}

      <p role="status" data-testid="queue-line" className={cn('mt-2 text-sm', line.tone === 'paused' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground')}>
        {line.text.replace(/^In the queue — (.)/, (_m, c: string) => c.toUpperCase())}
      </p>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Market)} className="mt-3">
        <TabsList className="h-auto max-w-full flex-wrap justify-start gap-0.5 rounded-2xl" data-testid="queue-country-tabs">
          {QUEUE_TABS.map((m) => (
            <TabsTrigger key={m} value={m} className="gap-1.5 rounded-full px-3 py-1.5 text-xs" data-testid={`queue-tab-${m}`}>
              {TAB_LABEL[m]}
              {heldCountryOff(countrySettings, m) && <span className="text-[10px] font-semibold uppercase text-amber-600 dark:text-amber-400" data-testid={`queue-tab-off-${m}`}>off</span>}
              <span className="tabular-nums text-[11px] text-muted-foreground/70" data-testid={`queue-tab-count-${m}`}>{q.isSuccess ? views[m].waiting.length : '—'}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4" data-testid="queue-numbers" data-tab={tab}>
        <div className="min-w-0 rounded-xl bg-muted/40 px-2.5 py-1.5 ring-1 ring-inset ring-border/40">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground/60">Queued</div>
          <div className="font-semibold text-foreground/90" data-testid="queue-count">{q.isSuccess ? view.waiting.length : '—'}</div>
          {view.hookCount > 0 && (
            <div className="text-[10px] font-medium text-muted-foreground/70">+ {view.hookCount} hook follow-up{view.hookCount === 1 ? '' : 's'}</div>
          )}
          {view.followUps.length > 0 && (
            <div className="text-[10px] font-medium text-sky-600/80 dark:text-sky-400/80">+ {view.followUps.length} no-reply follow-up{view.followUps.length === 1 ? '' : 's'}</div>
          )}
        </div>
        {teamControls && <Stat label="Sent today" value={sentToday.data == null ? '—' : tabCap != null ? `${sentToday.data} / ${tabCap}` : String(sentToday.data)} />}
        {/* ⛔ READS nextEligibleSendAt (server), NOT the raw nextSendAt pacing stamp, shown in THIS country's own time
            (nextSendWords). The server has one next-send for the whole queue, so a country shows it only while it could be
            the one sending; otherwise it says Off / Paused / Opens HH:MM. Falls back to nextSendAt on an older deploy. */}
        {teamControls && <Stat label="Next send" value={nextSendWords(tab, countrySettings, team?.nextEligibleSendAt ?? team?.nextSendAt,
          { paused, ukWindowOpen: state?.windowOpen ?? null, ukStartHour: state?.windowStartHour ?? null })} />}
        <Stat label={clock.perLead ? 'Local time' : `${TAB_LABEL[tab]} time`}
          value={clock.perLead ? 'Each lead’s own' : `${clock.time}${tab === 'UK' && state ? (state.windowOpen ? ' · open' : ' · closed') : ''}`} />
      </div>

      {/* 2026-10-22: this country is OFF (by hand or automatically). Its leads are HELD by the sender, not released: say so,
          with why and when (src/lib/whatsappQueueView.ts countryOffNote). */}
      {offNote && (
        <Callout tone="amber" className="mt-2 px-3 py-2 text-[11px]" testId="queue-country-off">
          <strong>{offNote.title}</strong> {offNote.why}
          {offNote.detail && <span className="block text-muted-foreground" data-testid="queue-country-off-detail">{offNote.detail}</span>}
        </Callout>
      )}

      {/* Archived leads still sitting at status='queued' — the processor skips them; saying so stops "the queue
          looks stuck" being confused with "these were withdrawn". Counted from this tab's rows. */}
      {view.archivedWaiting > 0 && (
        <Callout tone="amber" className="mt-2 px-3 py-2 text-[11px]">
          {view.archivedWaiting} archived {view.archivedWaiting === 1 ? 'lead is' : 'leads are'} still marked queued and will <strong>not</strong> be sent to. Archiving stops contact.
        </Callout>
      )}

      {/* Held by a TEST ACCOUNT: the sender never chooses these (src/lib/qaSafety.ts), so "Waiting" would be a lie.
          Server count for the whole queue, admin only (the same status read that gives Sent today). */}
      {teamControls && (team?.testHeldQueuedCount ?? 0) > 0 && (
        <Callout tone="amber" className="mt-2 px-3 py-2 text-[11px]" data-testid="queue-test-held">
          {team?.testHeldQueuedCount} queued {team?.testHeldQueuedCount === 1 ? 'lead is' : 'leads are'} held by a test account and will <strong>not</strong> be sent to. Reassign {team?.testHeldQueuedCount === 1 ? 'it' : 'them'} to a real owner, or remove {team?.testHeldQueuedCount === 1 ? 'it' : 'them'} from the queue.
        </Callout>
      )}
      {/* Queued with no number WhatsApp can reach (none, a landline, not a mobile of a country we message): the sender
          flags these No WhatsApp when it reaches them. Counted from the rows on screen. 2026-10-22: the old "(cold
          WhatsApp is UK mobiles only)" was stale since Malaysia / Singapore / Australia. */}
      {view.unsendable > 0 && (
        <Callout tone="amber" className="mt-2 px-3 py-2 text-[11px]" data-testid="queue-unsendable">
          {view.unsendable} queued {view.unsendable === 1 ? 'lead has' : 'leads have'} no number WhatsApp can reach (a landline, no number, or not a UK, Malaysian, Singapore or Australian mobile). {view.unsendable === 1 ? 'It' : 'They'} will be flagged No mobile, not sent. Open a lead to see exactly why.
        </Callout>
      )}

      {/* Australian leads with no state (src/lib/auLeadZone.ts): held, never sent in a guessed time zone. */}
      {view.needsState > 0 && (
        <Callout tone="amber" className="mt-2 px-3 py-2 text-[11px]" data-testid="queue-needs-state">
          {view.needsState} Australian {view.needsState === 1 ? 'lead is' : 'leads are'} held: <strong>Needs state</strong>. Their address or town names no state, so their local time is unknown and nothing is sent until one is added.
        </Callout>
      )}

      <div className="mt-2 rounded-xl bg-muted/30 p-2 ring-1 ring-inset ring-border/40" data-testid="queue-list">
        <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-muted-foreground/50">{TAB_LABEL[tab]} — in send order (next first)</div>
        {q.isPending ? <LoadState compact label="Loading the queue…" />
          : q.isError ? <ErrorState className="py-4" title="Could not load the queue." onRetry={() => void q.refetch()} retryLabel="Try again" />
          : view.waiting.length === 0 && view.followUps.length === 0 ? (
            <EmptyState icon={InboxIcon} title={`No ${TAB_LABEL[tab]} messages waiting`} className="py-6" testId="queue-empty">
              {view.hookCount > 0 ? 'Only hook follow-ups are waiting (counted above).'
                : total ? 'Pick another country above to see what is waiting there.' : 'Leads you queue for WhatsApp appear here in send order.'}
            </EmptyState>
          ) : (
          /* Fixed-height scroll box so a long list (90+ follow-ups) is a contained panel. Both lanes in one scroller. */
          <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {view.waiting.length > 0 && (
              <ol className="space-y-0.5">
                {view.waiting.map((l, i) => (
                  <QueueItem key={l.id} index={i + 1} row={l} state="waiting" audit={auditStatusByLead.get(l.id)} offMarket={rowCountryOff(l, countrySettings)}
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
    </div>
  );
}

/** How many rows at the top of the queue show the cleaned name a message will carry. */
const CLEAN_PREVIEW_ROWS = 5;

function QueueItem({ index, row, state, audit, offMarket, busy, disabled, onRemove, removeTitle }: {
  index: number; row: QueueRow; state: QueueRowState; audit?: QueueAuditStatus;
  /** The row's country when it is switched off: the row waits ("Waiting: Australia is off"). */
  offMarket?: Market | null;
  busy: boolean; disabled: boolean; onRemove?: () => void; removeTitle: string;
}) {
  const s = offMarket ? countryOffChip(offMarket) : QUEUE_ROW_STATE[state];
  const name = row.business_name ?? 'Unnamed business';
  const tmpl = state === 'follow_up' ? 'contact_followup' : row.whatsapp_template;
  /* ⛔ THE NAME THE MESSAGE WILL CARRY, for the first few rows of a template that cleans its name
     (initial_contact_short): the stored name above is untouched, this is only what {{1}} will say. */
  const sendsAs = state !== 'follow_up' && index <= CLEAN_PREVIEW_ROWS && nameStyleFor(row.whatsapp_template) === 'clean'
    ? displayBusinessName(row.business_name, { style: 'clean' })
    : '';
  return (
    <li className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted/50" data-testid="queue-row" data-state={state}>
      <span className="flex min-w-0 items-start gap-2">
        <span className="mt-0.5 w-5 shrink-0 text-right text-[10px] tabular-nums text-muted-foreground/50">{index}</span>
        <span className="min-w-0">
          <span className="block truncate font-medium text-foreground/90">{name}</span>
          {sendsAs && <span className="block truncate text-[11px] text-muted-foreground" data-testid="queue-row-clean-name">Will say: “{sendsAs}”</span>}
          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
            <ToneChip tone={s.tone} title={s.title} testId="queue-row-state">{s.label}</ToneChip>
            {rowNeedsState(row) && <ToneChip tone={NEEDS_STATE_CHIP.tone} title={NEEDS_STATE_CHIP.title} testId="queue-row-needs-state">{NEEDS_STATE_CHIP.label}</ToneChip>}
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
          {batch.skipped.map((s) => (
            <li key={s.label}>– {s.n} {s.label}{s.names?.length ? <span className="text-muted-foreground/70"> ({s.names.join(', ')}{s.n > s.names.length ? ', …' : ''})</span> : null}</li>
          ))}
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
