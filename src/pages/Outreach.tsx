import { useCallback, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { OutreachTable } from '@/components/OutreachTable';
import { WhatsAppQueuePanel } from '@/components/WhatsAppQueuePanel';

import { OutreachTipsDialog } from '@/components/OutreachTipsDialog';
import { OutreachIntroModal } from '@/components/OutreachIntroModal';
import { PostContactModal } from '@/components/PostContactModal';
import { useOutreach } from '@/hooks/useOutreach';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useAuth } from '@/hooks/useAuth';
import { useBulkJobs } from '@/hooks/useBulkJobs';
import { CampaignPicker } from '@/components/CampaignPicker';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, X } from 'lucide-react';
import { isDemoLead } from '@/lib/demoLeads';
import { readCampaignFilter, writeCampaignFilter } from '@/lib/outreachPrefs';
import type { ContactMethod, PipelineStatus } from '@/types/outreach';
import { useMemo, useRef, useState } from 'react';

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
    phoneFetchStatus,
    retryPhoneFetch,
  } = useOutreach();

  const { user } = useAuth();

  // Server-side bulk jobs (enrich / site-gen): survive leaving the page. On a
  // watched job finishing, refetch leads (enrich results) and bump the sites
  // token (site-gen results) so OutreachTable re-reads generated_sites.
  const [sitesRefreshToken, setSitesRefreshToken] = useState(0);
  const { activeJob, recentJob, createJob, creating: creatingJob, cancelJob, dismissRecent } = useBulkJobs((job) => {
    fetchLeads();
    if (job.job_type === 'site_gen') setSitesRefreshToken((t) => t + 1);
  });

  // Lead ids of the site-gen items currently in flight → per-row spinner (matches
  // single site-gen). Only 'running' items so we don't spin every queued row.
  const bulkGeneratingIds = useMemo(
    () => new Set(
      (activeJob?.job_type === 'site_gen' ? activeJob.items ?? [] : [])
        .filter((i) => i.status === 'running')
        .map((i) => i.lead_id),
    ),
    [activeJob],
  );

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
  type LaunchIntent = { leadId: string; channel: 'sms' | 'whatsapp' | 'call' | 'open'; templateContent?: string | null; shareLink?: string | null };
  const [launchIntent, setLaunchIntent] = useState<LaunchIntent | null>(
    ((location.state as { launch?: LaunchIntent } | null)?.launch) ?? null,
  );
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

  // Combine active and archived leads into one unified list, filtered by campaign
  const allLeads = useMemo(() => {
    const combined = [...leads, ...archivedLeads];
    if (!campaignFilter) return combined;
    return combined.filter((l) => l.campaign_id === campaignFilter);
  }, [leads, archivedLeads, campaignFilter]);

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
    await updateStatus(leadId, status as any);
    window.dispatchEvent(new CustomEvent('demo-checklist-pipeline-status-set'));
    if (status === 'interested') {
      const lead = allLeads.find(l => l.id === leadId);
      if (lead && !lead.is_potential_work) {
        await updateLead(leadId, { is_potential_work: true });
        window.dispatchEvent(new CustomEvent('track-lead-added'));
      }
    }
  }, [updateStatus, updateLead, allLeads]);

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
            Contact businesses via WhatsApp, SMS or call. Update their status, star the promising ones to track them, and open any row for the full detail.
          </p>
        </div>
        <div className="flex items-center justify-center sm:justify-end gap-2 shrink-0">
          <span className="text-xs text-muted-foreground hidden sm:inline">Campaign</span>
          <CampaignPicker mode="filter" value={campaignFilter} onChange={changeCampaignFilter} />
        </div>
      </div>

      {/* WhatsApp outreach queue (admin-only; self-hides otherwise). */}
      <WhatsAppQueuePanel leads={allLeads} onUpdateLead={updateLead} />

      {/* Server-side bulk job progress — lives in bulk_jobs, so it survives
          leaving the page/browser. Shows a live job, or a finished-while-away
          summary (last 10 min) on return. */}
      {activeJob && (
        <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
          <span className="text-muted-foreground">
            Bulk {activeJob.job_type === 'enrich' ? 'enrich' : 'site generation'} running server-side:{' '}
            <span className="font-medium text-foreground">
              {activeJob.done_count + activeJob.failed_count + activeJob.skipped_count}/{activeJob.total}
            </span>{' '}
            processed
            {activeJob.failed_count > 0 && <> · {activeJob.failed_count} failed</>}
            {' '}— you can leave this page, it keeps running.
          </span>
          <Button variant="ghost" size="sm" className="ml-auto h-7 shrink-0 text-xs" onClick={() => cancelJob(activeJob.id)}>
            Cancel
          </Button>
        </div>
      )}
      {!activeJob && recentJob && (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
          <CheckCircle2 className={`h-4 w-4 shrink-0 ${recentJob.status === 'done' ? 'text-green-500' : 'text-muted-foreground'}`} />
          <span className="text-muted-foreground">
            Bulk {recentJob.job_type === 'enrich' ? 'enrich' : 'site generation'}{' '}
            {recentJob.status === 'done' ? 'finished' : recentJob.status}:{' '}
            <span className="font-medium text-foreground">{recentJob.done_count} done</span>
            {recentJob.failed_count > 0 && <> · {recentJob.failed_count} failed</>}
            {recentJob.skipped_count > 0 && <> · {recentJob.skipped_count} skipped</>}
            {recentJob.error && <> · {recentJob.error}</>}
          </span>
          <Button variant="ghost" size="sm" className="ml-auto h-7 shrink-0 text-xs" onClick={dismissRecent}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <OutreachTable
        leads={allLeads}
        onLeadClick={() => {}}
        onStatusChange={(leadId, status) => {
          if (isDemoLead(leadId)) return;
          return updateStatus(leadId, status);
        }}
        onContactMethodChange={handleContactMethodChange}
        onPipelineStatusChange={handlePipelineStatusChange}
        onNextActionChange={(leadId, action, date) => {
          if (isDemoLead(leadId)) return;
          return updateNextAction(leadId, action, date);
        }}
        onRemoveAll={deleteAllLeads}
        onArchive={(leadId) => {
          if (isDemoLead(leadId)) return;
          return archiveLead(leadId);
        }}
        onArchiveSelected={archiveMultiple}
        onDeleteSelected={deleteMultiple}
        onResetSelected={resetMultiple}
        onResetToFreshSelected={resetToFreshMultiple}
        onMarkAsInterested={markMultipleAsInterested}
        onRefreshLeads={fetchLeads}
        onImportLeads={async (leadsToImport) => {
          await bulkImportLeads(leadsToImport as any, 'UK');
        }}
        onBulkLookupPhones={(ids, onProgress) => bulkLookupPhones(ids, onProgress)}
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
        onBusinessNameChange={(leadId, name) => {
          if (isDemoLead(leadId)) return Promise.resolve(null);
          return updateBusinessName(leadId, name);
        }}
        onImageChange={(leadId, imageUrl) => {
          if (isDemoLead(leadId)) return Promise.resolve(null);
          return updateLead(leadId, { image_url: imageUrl });
        }}
        onAssignCampaign={(leadIds, campaignId) =>
          assignCampaign(leadIds.filter((id) => !isDemoLead(id)), campaignId)
        }
        fetchActivities={fetchActivities}
        campaignDefaultSaleTypeByLead={campaignDefaultSaleTypeByLead}
        campaignNameByLead={campaignNameByLead}
        showCampaignName={campaignFilter === null}
        launchIntent={launchIntent}
        onLaunchConsumed={() => setLaunchIntent(null)}
        onBulkJob={createJob}
        bulkJobActive={!!activeJob || creatingJob}
        sitesRefreshToken={sitesRefreshToken}
        bulkGeneratingIds={bulkGeneratingIds}
      />

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
