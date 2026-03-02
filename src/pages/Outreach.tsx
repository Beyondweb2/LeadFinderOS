import { useState, useMemo, useCallback, useEffect } from 'react';
import { OutreachTable } from '@/components/OutreachTable';

import { OutreachTipsDialog } from '@/components/OutreachTipsDialog';
import { PostContactModal } from '@/components/PostContactModal';
import { Challenge10Widget } from '@/components/Challenge10Widget';
import { Challenge10Modal } from '@/components/Challenge10Modal';
import { useOutreach } from '@/hooks/useOutreach';
import { useChallenge10 } from '@/hooks/useChallenge10';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { WhatsAppReturnCheck } from '@/components/WhatsAppReturnCheck';
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

  
  const { toast } = useToast();
  const challenge = useChallenge10();
  // Combine active and archived leads into one unified list
  const allLeads = useMemo(() => {
    return [...leads, ...archivedLeads];
  }, [leads, archivedLeads]);

  const isReadOnly = false;

  // CRM Automation: auto-set contact_method on contact button click
  useEffect(() => {
    const handler = (e: Event) => {
      const { leadId, method } = (e as CustomEvent).detail || {};
      if (!leadId) return;
      if (!method) return;
      const updates: Record<string, any> = {
        contact_method: method,
      };
      updateLead(leadId, updates);
    };
    window.addEventListener('crm-contact-action', handler);
    return () => window.removeEventListener('crm-contact-action', handler);
  }, [updateLead]);

  // Listen for WhatsApp status updates from the prompt dialog
  useEffect(() => {
    const handler = (e: Event) => {
      const { leadId, status, checkedAt } = (e as CustomEvent).detail || {};
      if (!leadId) return;
      // Update local lead state immediately (DB already updated by the dialog)
      updateLead(leadId, { whatsapp_status: status, whatsapp_checked_at: checkedAt });
    };
    window.addEventListener('whatsapp-status-updated', handler);
    return () => window.removeEventListener('whatsapp-status-updated', handler);
  }, [updateLead]);

  // Challenge 10: only count when user actually opens SMS/WhatsApp app
  useEffect(() => {
    const handler = (e: Event) => {
      const { leadId: businessName } = (e as CustomEvent).detail || {};
      if (!businessName) return;
      // Resolve lead ID from business name
      const lead = allLeads.find(l => l.business_name === businessName);
      if (lead) {
        challenge.recordContact(lead.id);
      }
    };
    window.addEventListener('challenge-contact-sent', handler);
    return () => window.removeEventListener('challenge-contact-sent', handler);
  }, [challenge.recordContact, allLeads]);

  // Show challenge completion toast
  useEffect(() => {
    if (challenge.justCompleted) {
      toast({
        title: 'Challenge Complete ✅',
        description: 'You contacted 10 businesses! Consistency is the hardest part — keep going.',
      });
      challenge.dismissCompletion();
    }
  }, [challenge.justCompleted, toast, challenge.dismissCompletion]);

  const handleContactMethodChange = useCallback(async (leadId: string, method: ContactMethod) => {
    await updateLead(leadId, { contact_method: method });
    window.dispatchEvent(new CustomEvent('demo-checklist-contact-method-set'));
  }, [updateLead]);

  const handlePipelineStatusChange = useCallback(async (leadId: string, status: PipelineStatus) => {
    await updateStatus(leadId, status as any);
    window.dispatchEvent(new CustomEvent('demo-checklist-pipeline-status-set'));
    // Auto-track when setting to Interested
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
      {/* Challenge Widget */}
      <Challenge10Widget
        isActive={challenge.isActive}
        isCompleted={challenge.isCompleted}
        isSkipped={challenge.isSkipped}
        count={challenge.count}
        featureEnabled={challenge.featureEnabled}
        onStart={challenge.startChallenge}
      />

      {/* Page Header */}
      <div className="text-center sm:text-left">
        <h1 className="text-lg sm:text-2xl font-bold tracking-tight">Outreach CRM</h1>
        <p className="text-xs sm:text-base text-muted-foreground max-w-lg">
          Contact businesses via WhatsApp, SMS or call. Update their status, then track promising ones in Track Leads.
        </p>
      </div>

      <OutreachTable
        leads={allLeads}
        onLeadClick={() => {}}
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




      {/* First-time outreach tips */}
      <OutreachTipsDialog />

      {/* Post-contact guidance modal */}
      <PostContactModal />

      {/* Challenge Modal */}
      <Challenge10Modal
        open={challenge.showModal}
        onStart={challenge.startChallenge}
        onSkip={challenge.skipChallenge}
      />

      {/* WhatsApp return-to-app confirmation */}
      <WhatsAppReturnCheck />
    </div>
  );
};

export default Outreach;
