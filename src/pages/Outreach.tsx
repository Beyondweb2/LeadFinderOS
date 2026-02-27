import { useState, useMemo, useCallback, useEffect } from 'react';
import { OutreachTable } from '@/components/OutreachTable';
import { OutreachLeadDialog } from '@/components/OutreachLeadDialog';
import { OutreachTipsDialog } from '@/components/OutreachTipsDialog';
import { PostContactModal } from '@/components/PostContactModal';
import { useOutreach } from '@/hooks/useOutreach';
import { Loader2 } from 'lucide-react';
import { addDays, format } from 'date-fns';
import type { OutreachLead, ContactMethod, PipelineStatus } from '@/types/outreach';

const Outreach = () => {
  const {
    leads,
    archivedLeads,
    isLoading,
    updateStatus,
    updateNextAction,
    updateNotes,
    updateLead,
    deleteLead,
    deleteMultiple,
    deleteAllLeads,
    fetchActivities,
    archiveLead,
    archiveMultiple,
    markMultipleAsInterested,
    bulkImportLeads,
    fetchLeads,
    phoneFetchStatus,
    retryPhoneFetch,
  } = useOutreach();

  const [selectedLead, setSelectedLead] = useState<OutreachLead | null>(null);

  // Combine active and archived leads into one unified list
  const allLeads = useMemo(() => {
    return [...leads, ...archivedLeads];
  }, [leads, archivedLeads]);

  const isReadOnly = false;

  // CRM Automation: auto-set "waiting" status + follow-up date on contact
  useEffect(() => {
    const handler = (e: Event) => {
      const { leadId, method } = (e as CustomEvent).detail || {};
      if (!leadId) return;
      const followUpDate = format(addDays(new Date(), 2), 'yyyy-MM-dd');
      const updates: Record<string, any> = {
        status: 'waiting',
        next_action: 'follow_up',
        next_action_date: followUpDate,
      };
      if (method) {
        updates.contact_method = method;
      }
      updateLead(leadId, updates);
    };
    window.addEventListener('crm-contact-action', handler);
    return () => window.removeEventListener('crm-contact-action', handler);
  }, [updateLead]);

  const handleContactMethodChange = useCallback(async (leadId: string, method: ContactMethod) => {
    await updateLead(leadId, { contact_method: method });
    window.dispatchEvent(new CustomEvent('demo-checklist-contact-method-set'));
  }, [updateLead]);

  const handlePipelineStatusChange = useCallback(async (leadId: string, status: PipelineStatus) => {
    await updateStatus(leadId, status as any);
    window.dispatchEvent(new CustomEvent('demo-checklist-pipeline-status-set'));
  }, [updateStatus]);

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
      <div className="text-center sm:text-left">
        <h1 className="text-lg sm:text-2xl font-bold tracking-tight">Outreach CRM</h1>
        <p className="text-xs sm:text-base text-muted-foreground max-w-lg">
          Contact businesses via WhatsApp, SMS or call. Update their status, then track promising ones in Track Leads.
        </p>
      </div>

      <OutreachTable
        leads={allLeads}
        onLeadClick={isReadOnly ? () => {} : setSelectedLead}
        onStatusChange={updateStatus}
        onContactMethodChange={handleContactMethodChange}
        onPipelineStatusChange={handlePipelineStatusChange}
        onNextActionChange={updateNextAction}
        onRemoveAll={deleteAllLeads}
        onArchive={archiveLead}
        onArchiveSelected={archiveMultiple}
        onDeleteSelected={deleteMultiple}
        onMarkAsInterested={markMultipleAsInterested}
        onRefreshLeads={fetchLeads}
        onImportLeads={async (leadsToImport) => {
          await bulkImportLeads(leadsToImport as any, 'UK');
        }}
        showArchiveButton={false}
        isArchiveView={false}
        readOnly={isReadOnly}
        phoneFetchStatus={phoneFetchStatus}
        onRetryPhoneFetch={retryPhoneFetch}
      />

      {/* Lead Detail Dialog */}
      {!isReadOnly && (
        <OutreachLeadDialog
          lead={selectedLead}
          open={!!selectedLead}
          onOpenChange={(open) => !open && setSelectedLead(null)}
          onUpdateStatus={updateStatus}
          onUpdateNextAction={updateNextAction}
          onUpdateNotes={updateNotes}
          onUpdateLead={updateLead}
          onDelete={deleteLead}
          fetchActivities={fetchActivities}
          readOnly={false}
        />
      )}

      {/* First-time outreach tips */}
      <OutreachTipsDialog />

      {/* Post-contact guidance modal */}
      <PostContactModal />
    </div>
  );
};

export default Outreach;
