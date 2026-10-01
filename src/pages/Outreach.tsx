import { useCallback, useEffect, useMemo } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { OutreachTable } from '@/components/OutreachTable';
import { WhatsAppQueuePanel } from '@/components/WhatsAppQueuePanel';

import { OutreachTipsDialog } from '@/components/OutreachTipsDialog';
import { OutreachIntroModal } from '@/components/OutreachIntroModal';
import { PostContactModal } from '@/components/PostContactModal';
import { useOutreach } from '@/hooks/useOutreach';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useAuth } from '@/hooks/useAuth';
import { useBulkJobs } from '@/hooks/useBulkJobs';
import { bulkJobProgress } from '@/lib/bulkJobProgress';
import { CampaignPicker } from '@/components/CampaignPicker';
import { CrawlCheckUrlButton } from '@/components/CrawlCheckButton';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, X } from 'lucide-react';
import { isDemoLead } from '@/lib/demoLeads';
import { readCampaignFilter, writeCampaignFilter } from '@/lib/outreachPrefs';
import type { ContactMethod, PipelineStatus } from '@/types/outreach';
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { datasetComplete, leadLoadNotice } from '@/lib/outreachLoad';
import { isOutreachPreset } from '@/lib/leadTrade';
import { prefetchOutreachAuditMap } from '@/lib/outreachAuditMap';
import { getQueueStatus, QUEUE_PAUSED_LINE } from '@/lib/queueStatus';
import { useQueueState } from '@/hooks/useQueueState';
import { useLeadPermissions } from '@/hooks/useLeadPermissions';
import { AddLeadDialog } from '@/components/AddLeadDialog';
import { PauseCircle, UserPlus } from 'lucide-react';

const Outreach = () => {
  const {
    leads,
    archivedLeads,
    isLoading,
    updateStatus,
    updateNextAction,
    updateLead,
    updateNotes,
    updateBusinessName,
    assignCampaign,
    removeFromMyLeads,
    fetchActivities,
    deleteMultiple,
    resetMultiple,
    resetToFreshMultiple,
    deleteAllLeads,
    archiveLead,
    archiveMultiple,
    markMultipleAsInterested,
    bulkImportLeads,
    bulkLookupPhones,
    fetchLeads,
    leadLoad,
    retryLeadLoad,
    phoneFetchStatus,
    retryPhoneFetch,
  } = useOutreach({ history: false, progressive: true });
  /* ⚡ PROGRESSIVE (2026-09-28, src/lib/outreachLoad.ts): the table appears with the newest 1,000 and
     the rest load behind it. Everything that needs the whole list gates on this ONE value. */
  const listComplete = datasetComplete(leadLoad);
  const loadNotice = leadLoadNotice(leadLoad);

  const { user } = useAuth();
  /* ⛔ ONE OUTREACH, BOTH ROLES (2026-09-27). A salesperson opens this same page with the same table;
     `perms` (src/lib/access.ts) withholds only admin/system/enrichment/delivery controls. Their rows
     are their own assigned prospects, read from the safe view.
     ⛔ NO "AVAILABLE TO CLAIM" TAB (Paul, 2026-09-28): the claim-from-the-pool workflow is gone from
     Sales. The database pieces stay (claim_lead serves Find Leads' "Claim lead"; the contact rule
     serves Remove from my leads); sales_pool is kept, unused. */
  const perms = useLeadPermissions();
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  /* ⚡ START THE TABLE'S OWN READS NOW (2026-09-27, site-wide speed pass). The table and the queue
     panel mount only after every lead has arrived, so the audit map and the queue status used to
     start 2–4 s late. Started here they run alongside the leads; the table and panel join the same
     cached reads. Measured live: audit buttons and queue ready at 2.3–3.0 s instead of 3.8–6.7 s. */
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!user?.id) return;
    void prefetchOutreachAuditMap(queryClient, user.id);
    /* The queue status is queue configuration — admin-only on the server; a salesperson has no panel. */
    if (perms.queueControls) getQueueStatus(queryClient).catch(() => { /* the panel reads it itself and reports failures */ });
  }, [user?.id, queryClient, perms.queueControls]);

  // Server-side bulk jobs (enrich / audit / audit-and-push): survive leaving the page.
  // On a watched job finishing, refetch leads so its results show.
  const { activeJob, recentJob, createJob, creating: creatingJob, cancelJob, dismissRecent } = useBulkJobs(() => {
    fetchLeads();
  });

  // Campaign filter (null = all campaigns). Persisted per-user so it survives
  // navigation + reload + re-login (restored in an effect once campaigns load).
  const [campaignFilter, setCampaignFilter] = useState<string | null>(null);
  const restoredRef = useRef(false);

  // Wrap setter so every user-initiated change is persisted immediately.
  const changeCampaignFilter = useCallback((next: string | null) => {
    // An explicit choice (incl. a just-created campaign) is authoritative — mark
    // restore done so the async "restore saved filter" effect can never snap it back.
    restoredRef.current = true;
    setCampaignFilter(next);
    writeCampaignFilter(user?.id, next);
  }, [user?.id]);

  // Launch-pad intent carried from the Manage page via router state. Consumed once
  // (cleared from history so a refresh/back won't reopen the composer).
  const location = useLocation();
  type LaunchIntent = { leadId: string; channel: 'whatsapp' | 'call' | 'open'; templateContent?: string | null; shareLink?: string | null };
  /* ⛔ /outreach?lead=<id> (salesLinks.ts outreachLeadLink, 2026-09-30) is the addressable form: it
     stays in the URL while the lead's workspace is open, so a refresh reopens it and Back returns to
     where the click came from; closing the workspace removes it. Router state is still read for an
     old in-flight history entry. */
  const [searchParams, setSearchParams] = useSearchParams();
  const urlLead = searchParams.get('lead');
  const [launchIntent, setLaunchIntent] = useState<LaunchIntent | null>(
    urlLead ? { leadId: urlLead, channel: 'open' } : ((location.state as { launch?: LaunchIntent } | null)?.launch) ?? null,
  );
  useEffect(() => {
    if (urlLead && launchIntent?.leadId !== urlLead) { setCampaignFilter(null); setLaunchIntent({ leadId: urlLead, channel: 'open' }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlLead]);
  /* ?show=<preset> — a list a link opened (the dashboard's "no trade stored"). It stays in the URL (a
     refresh keeps it) until its pill is cleared. */
  const showParam = searchParams.get('show');
  const preset = isOutreachPreset(showParam) ? showParam : null;
  const clearPreset = useCallback(() => {
    const next = new URLSearchParams(searchParams); next.delete('show');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  const clearUrlLead = useCallback(() => {
    if (!searchParams.get('lead')) return;
    const next = new URLSearchParams(searchParams); next.delete('lead');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);
  // A launch (e.g. from Manage) wins over the restored campaign so the launched
  // lead is never hidden; we DON'T persist this temporary All view.
  const hadInitialLaunchRef = useRef(launchIntent != null);
  useEffect(() => {
    if (launchIntent) {
      // Ensure the launched lead isn't hidden by an active campaign filter.
      setCampaignFilter(null);
      // Drop the router state so a manual refresh doesn't relaunch.
      window.history.replaceState({}, document.title);
    }
    // run once on mount for the initial intent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Combine active and archived leads into one unified list, filtered by campaign. Which of them the
  // table SHOWS (active by default, Filters → Archived) is OutreachTable's rowsForArchiveView.
  const allLeads = useMemo(() => {
    const combined = [...leads, ...archivedLeads];
    if (!campaignFilter) return combined;
    return combined.filter((l) => l.campaign_id === campaignFilter);
  }, [leads, archivedLeads, campaignFilter]);
  /* Sales cannot see the queue panel; when the admin has paused the queue, their queued leads say so. */
  const queuedMine = !perms.queueControls ? leads.filter((l) => l.status === 'queued').length : 0;
  const queueState = useQueueState(queuedMine > 0);

  const isReadOnly = false;

  // Campaign default sale types → map keyed by lead id, for the lead detail modal.
  const { campaigns, isLoading: campaignsLoading } = useCampaigns();

  // Restore the persisted campaign once campaigns have loaded (so we can validate
  // it still exists). Runs once. A launch intent on this visit takes precedence.
  useEffect(() => {
    if (restoredRef.current || campaignsLoading || !user?.id) return;
    if (hadInitialLaunchRef.current) { restoredRef.current = true; return; } // launch set All; don't restore
    const stored = readCampaignFilter(user.id);
    if (!stored) { restoredRef.current = true; return; } // nothing to restore
    // Only consider the restore "done" once we've actually applied the saved
    // campaign. If it isn't in the list yet (the page-level useCampaigns can be
    // mid-load or momentarily stale), DON'T give up — leave restoredRef false so a
    // later campaigns update restores it instead of silently snapping to "All".
    if (campaigns.some((c) => c.id === stored)) {
      setCampaignFilter(stored); // restore-only — no re-persist
      restoredRef.current = true;
    }
  }, [campaignsLoading, campaigns, user?.id]);
  const campaignDefaultSaleTypeByLead = useMemo(() => {
    const byCampaign: Record<string, string | null> = {};
    for (const c of campaigns) byCampaign[c.id] = c.default_sale_type;
    const map: Record<string, string | null> = {};
    for (const l of allLeads) {
      map[l.id] = l.campaign_id ? byCampaign[l.campaign_id] ?? null : null;
    }
    return map;
  }, [campaigns, allLeads]);

  // Per-lead campaign NAME (mirrors campaignDefaultSaleTypeByLead) — for the muted
  // sub-line under a lead's business name in the "All campaigns" view, so each row
  // shows which campaign it belongs to. Built once from the campaigns list.
  const campaignNameByLead = useMemo(() => {
    const byCampaign: Record<string, string> = {};
    for (const c of campaigns) byCampaign[c.id] = c.name;
    const map: Record<string, string | null> = {};
    for (const l of allLeads) {
      map[l.id] = l.campaign_id ? byCampaign[l.campaign_id] ?? null : null;
    }
    return map;
  }, [campaigns, allLeads]);

  // Listen for WhatsApp status updates from the prompt dialog
  useEffect(() => {
    const handler = (e: Event) => {
      const { leadId, status, checkedAt } = (e as CustomEvent).detail || {};
      if (!leadId || isDemoLead(leadId)) return;
      updateLead(leadId, { whatsapp_status: status, whatsapp_checked_at: checkedAt });
    };
    window.addEventListener('whatsapp-status-updated', handler);
    return () => window.removeEventListener('whatsapp-status-updated', handler);
  }, [updateLead]);

  // A deleted campaign unassigns its leads in the DB (FK ON DELETE SET NULL) — refetch
  // so those leads show "No campaign" immediately, without a manual refresh.
  useEffect(() => {
    const handler = () => { fetchLeads(); };
    window.addEventListener('campaign-deleted', handler);
    return () => window.removeEventListener('campaign-deleted', handler);
  }, [fetchLeads]);

  const handleContactMethodChange = useCallback(async (leadId: string, method: ContactMethod) => {
    if (isDemoLead(leadId)) return;
    await updateLead(leadId, { contact_method: method });
    window.dispatchEvent(new CustomEvent('demo-checklist-contact-method-set'));
  }, [updateLead]);

  const handlePipelineStatusChange = useCallback(async (leadId: string, status: PipelineStatus) => {
    if (isDemoLead(leadId)) return;
    // Interested is a separate operator marker, not a pipeline stage. Keep the current status and
    // add the tracked/starred flag so the lead can continue through the real pipeline stages.
    /* ⛔ The one write for the star, for both roles: markMultipleAsInterested → lead_mark_interested (History
       "Starred"). Every "Interested" in a status menu (row, phone card, workspace, bulk) arrives here. */
    if (status === 'interested') {
      const lead = allLeads.find(l => l.id === leadId);
      if (lead && !lead.is_potential_work) await markMultipleAsInterested([leadId]);
      return;
    }
    await updateStatus(leadId, status as any);
    window.dispatchEvent(new CustomEvent('demo-checklist-pipeline-status-set'));
  }, [updateStatus, markMultipleAsInterested, allLeads]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="text-center sm:text-left">
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight">Outreach CRM</h1>
          <p className="text-xs sm:text-base text-muted-foreground max-w-lg">
            {perms.queueControls
              ? 'Contact businesses via WhatsApp or call. Update their status, star the promising ones to track them, and open any row for the full detail.'
              : 'Your leads. Contact them via WhatsApp or call, update their status, star the promising ones, and open any row for the full detail.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 sm:shrink-0">
          {/* A lead found outside the app (LinkedIn, referral…) — both roles, server-deduped. */}
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => setAddLeadOpen(true)}><UserPlus className="h-3.5 w-3.5" />Add a lead</Button>
          {/* Added → its workspace opens at once (the launch waits until the new row is in the list),
              so services / areas, the AI check and the crawl are the next click, not a search. */}
          <AddLeadDialog open={addLeadOpen} onOpenChange={setAddLeadOpen} onAdded={(id) => setLaunchIntent({ leadId: id, channel: 'open' })} />
          {/* Paste-a-URL crawlability check — for a site sent to Paul before it's a lead (b). Admin:
              crawl-check refuses anyone else. */}
          {perms.crawlSite && <CrawlCheckUrlButton />}
          {/* ⛔ THE PAGE-LEVEL CAMPAIGN FILTER, BOTH ROLES (2026-09-28). A VIEW control only — it never
              moves a lead (that is "Move to campaign" on a selection). Sales picks from the existing
              campaigns (hideCreate); their rows are still only their own. */}
          <span className="text-xs text-muted-foreground hidden sm:inline">Campaign</span>
          <CampaignPicker mode="filter" value={campaignFilter} onChange={changeCampaignFilter} hideCreate={!perms.campaigns} />
        </div>
      </div>

      {/* WhatsApp outreach queue (admin-only). */}
      {perms.queueControls && <WhatsAppQueuePanel leads={allLeads} onUpdateLead={updateLead} listComplete={listComplete} />}
      {!perms.queueControls && queuedMine > 0 && queueState?.paused && (
        <div role="status" data-testid="queue-paused-banner" className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
          <PauseCircle className="h-4 w-4 shrink-0" />
          <span><span className="font-medium">{QUEUE_PAUSED_LINE}</span> {queuedMine === 1 ? '1 of your leads is' : `${queuedMine} of your leads are`} waiting in the queue.</span>
        </div>
      )}

      {/* Server-side bulk job progress — lives in bulk_jobs, so it survives
          leaving the page/browser. Shows a live job, or a finished-while-away
          summary (last 10 min) on return. */}
      {activeJob && (() => {
        /* ⚠️ LABEL AND PHASE COME FROM bulkJobProgress, not from an inline ternary. The old line
           branched on 'enrich' and called EVERYTHING ELSE "site generation", so every bulk audit
           announced itself as the wrong job. See the header of src/lib/bulkJobProgress.ts. */
        const p = bulkJobProgress(activeJob);
        return (
          <div className="space-y-1.5 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
            <div className="flex items-center gap-3">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
              <span className="text-muted-foreground">
                {p.label} running server-side{p.phase && <>, <span className="text-foreground">{p.phase}</span></>}:{' '}
                <span className="font-medium text-foreground">{p.settled}/{p.total}</span> processed
                {activeJob.failed_count > 0 && <> · {activeJob.failed_count} failed</>}
                {' '}— you can leave this page, it keeps running.
              </span>
              <Button variant="ghost" size="sm" className="ml-auto h-7 shrink-0 text-xs" onClick={() => cancelJob(activeJob.id)}>
                Cancel
              </Button>
            </div>
            {/* A real bar. Phase A can sit on one number for nine minutes; a fraction alone reads as
                a hang, and the operator's only recourse then is to press something. */}
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-primary/15">
              <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${p.pct}%` }} />
            </div>
          </div>
        );
      })()}
      {!activeJob && recentJob && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
          <CheckCircle2 className={`h-4 w-4 shrink-0 ${recentJob.status === 'done' ? 'text-green-500' : 'text-muted-foreground'}`} />
          <span className="text-muted-foreground">
            {bulkJobProgress(recentJob).label}{' '}
            {recentJob.status === 'done' ? 'finished' : recentJob.status}:{' '}
            <span className="font-medium text-foreground">
              {recentJob.done_count} {bulkJobProgress(recentJob).doneWord}
            </span>
            {recentJob.failed_count > 0 && <> · {recentJob.failed_count} failed</>}
            {recentJob.skipped_count > 0 && <> · {recentJob.skipped_count} skipped</>}
            {recentJob.error && <> · {recentJob.error}</>}
          </span>
          <Button variant="ghost" size="sm" className="ml-auto h-7 shrink-0 text-xs" onClick={dismissRecent}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {/* ⛔ NEVER A SILENT PARTIAL LIST: while the rest load (or after they failed) the page says so. */}
      {loadNotice && (
        <div role="status" aria-live="polite" data-testid="lead-load-notice"
          className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${loadNotice.tone === 'error' ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-primary/30 bg-primary/5 text-muted-foreground'}`}>
          {loadNotice.tone === 'info' && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />}
          <span>{loadNotice.text}</span>
          {loadNotice.tone === 'error' && (
            <Button variant="outline" size="sm" className="ml-auto h-7 text-xs" onClick={() => { void retryLeadLoad(); }}>Retry</Button>
          )}
        </div>
      )}

      {<OutreachTable
        leadLoad={leadLoad}
        leads={allLeads}
        onLeadClick={() => {}}
        onStatusChange={(leadId, status) => {
          if (isDemoLead(leadId)) return;
          if (status === 'interested') return handlePipelineStatusChange(leadId, status);
          return updateStatus(leadId, status);
        }}
        onContactMethodChange={perms.editLeadRecord ? handleContactMethodChange : undefined}
        onPipelineStatusChange={handlePipelineStatusChange}
        onNextActionChange={(leadId, action, date) => {
          if (isDemoLead(leadId)) return;
          return updateNextAction(leadId, action, date);
        }}
        onRemoveAll={perms.removeLeads ? deleteAllLeads : () => undefined}
        onArchive={(leadId) => {
          if (isDemoLead(leadId)) return;
          return archiveLead(leadId);
        }}
        onArchiveSelected={archiveMultiple}
        onDeleteSelected={perms.removeLeads ? deleteMultiple : undefined}
        onResetSelected={perms.removeLeads ? resetMultiple : undefined}
        onResetToFreshSelected={perms.removeLeads ? resetToFreshMultiple : undefined}
        onMarkAsInterested={markMultipleAsInterested}
        onRefreshLeads={fetchLeads}
        onImportLeads={perms.importLeads ? async (leadsToImport) => {
          await bulkImportLeads(leadsToImport as any, 'UK');
        } : undefined}
        onBulkLookupPhones={perms.enrichLeads ? (ids, onProgress) => bulkLookupPhones(ids, onProgress) : undefined}
        showArchiveButton={false}
        isArchiveView={false}
        readOnly={isReadOnly}
        phoneFetchStatus={phoneFetchStatus}
        onRetryPhoneFetch={retryPhoneFetch}
        onUpdateLead={(leadId, data) => {
          if (isDemoLead(leadId)) return Promise.resolve(null);
          return updateLead(leadId, data);
        }}
        onNotesChange={(leadId, notes) => {
          if (isDemoLead(leadId)) return Promise.resolve(null);
          return updateNotes(leadId, notes);
        }}
        onBusinessNameChange={perms.editLeadRecord ? (leadId, name) => {
          if (isDemoLead(leadId)) return Promise.resolve(null);
          return updateBusinessName(leadId, name);
        } : undefined}
        onImageChange={perms.editLeadRecord ? (leadId, imageUrl) => {
          if (isDemoLead(leadId)) return Promise.resolve(null);
          return updateLead(leadId, { image_url: imageUrl });
        } : undefined}
        onAssignCampaign={perms.moveToCampaign ? (leadIds, campaignId) =>
          assignCampaign(leadIds.filter((id) => !isDemoLead(id)), campaignId, campaigns.find((c) => c.id === campaignId)?.name ?? null)
        : undefined}
        onRemoveFromMyLeads={perms.removeFromMyLeads ? (leadIds) =>
          removeFromMyLeads(leadIds.filter((id) => !isDemoLead(id)))
        : undefined}
        fetchActivities={perms.editLeadRecord ? fetchActivities : undefined}
        campaignDefaultSaleTypeByLead={campaignDefaultSaleTypeByLead}
        campaignNameByLead={campaignNameByLead}
        showCampaignName={campaignFilter === null}
        launchIntent={launchIntent}
        onLaunchConsumed={() => setLaunchIntent(null)}
        onDetailClosed={clearUrlLead}
        preset={preset}
        onClearPreset={clearPreset}
        onBulkJob={perms.bulkAudits ? createJob : undefined}
        bulkJobActive={!!activeJob || creatingJob}
      />}

      {/* First-time outreach tips */}
      <OutreachTipsDialog />

      {/* Outreach intro popup */}
      <OutreachIntroModal />

      {/* Post-contact guidance modal */}
      <PostContactModal />

    </div>
  );
};

export default Outreach;
