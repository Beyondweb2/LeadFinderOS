import { useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { OutreachTable } from '@/components/OutreachTable';

import { OutreachTipsDialog } from '@/components/OutreachTipsDialog';
import { OutreachIntroModal } from '@/components/OutreachIntroModal';
import { PostContactModal } from '@/components/PostContactModal';
import { useOutreach } from '@/hooks/useOutreach';
import { useCampaigns } from '@/hooks/useCampaigns';
import { CampaignPicker } from '@/components/CampaignPicker';
import { Loader2 } from 'lucide-react';
import { isDemoLead } from '@/lib/demoLeads';
import type { ContactMethod, PipelineStatus } from '@/types/outreach';
import { useMemo, useState } from 'react';

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
    fetchActivities,
    deleteMultiple,
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

  // Campaign filter (null = all campaigns)
  const [campaignFilter, setCampaignFilter] = useState<string | null>(null);

  // Launch-pad intent carried from the Manage page via router state. Consumed once
  // (cleared from history so a refresh/back won't reopen the composer).
  const location = useLocation();
  type LaunchIntent = { leadId: string; channel: 'sms' | 'whatsapp' | 'call'; templateContent?: string | null; shareLink?: string | null };
  const [launchIntent, setLaunchIntent] = useState<LaunchIntent | null>(
    ((location.state as { launch?: LaunchIntent } | null)?.launch) ?? null,
  );
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
  const { campaigns } = useCampaigns();
  const campaignDefaultSaleTypeByLead = useMemo(() => {
    const byCampaign: Record<string, string | null> = {};
    for (const c of campaigns) byCampaign[c.id] = c.default_sale_type;
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
          <CampaignPicker mode="filter" value={campaignFilter} onChange={setCampaignFilter} />
        </div>
      </div>

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
        fetchActivities={fetchActivities}
        campaignDefaultSaleTypeByLead={campaignDefaultSaleTypeByLead}
        launchIntent={launchIntent}
        onLaunchConsumed={() => setLaunchIntent(null)}
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
