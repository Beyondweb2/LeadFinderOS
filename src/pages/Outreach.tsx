import { useState, useMemo, useCallback, useEffect } from 'react';
import { OutreachTable } from '@/components/OutreachTable';

import { OutreachTipsDialog } from '@/components/OutreachTipsDialog';
import { PostContactModal } from '@/components/PostContactModal';
import { Challenge10Widget } from '@/components/Challenge10Widget';
import { Challenge10Modal } from '@/components/Challenge10Modal';
import { TrialConversionModal } from '@/components/TrialConversionModal';
import { useOutreach } from '@/hooks/useOutreach';
import { useChallenge10 } from '@/hooks/useChallenge10';
import { useSubscription } from '@/hooks/useSubscription';
import { useTrial } from '@/hooks/useTrial';
import { useWalkthroughStatus } from '@/hooks/useWalkthroughStatus';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useContactUsage } from '@/hooks/useContactUsage';
import { Loader2, Sparkles, X } from 'lucide-react';
import { createDemoLeads, isDemoLead, isDemoDismissed, dismissDemoLeads } from '@/lib/demoLeads';
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

  
  const { user } = useAuth();
  const { toast } = useToast();
  const challenge = useChallenge10();
  const { subscribed, status: subStatus, isPaidSubscriber } = useSubscription();
  const { isStripeTrialing } = useTrial();
  const { walkthroughOpen } = useWalkthroughStatus();
  const hasProAccess = isPaidSubscriber || subStatus === 'trialing' || subStatus === 'past_due' || subStatus === 'admin' || isStripeTrialing;
  const { hasUsedContact, markContactUsed } = useContactUsage();
  const [showPaywall, setShowPaywall] = useState(false);

  // Demo leads for first-time users
  const [showDemoLeads, setShowDemoLeads] = useState(false);
  const [demoDismissedLocal, setDemoDismissedLocal] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    // Show demo leads only if user has no real leads and hasn't dismissed
    if (leads.length === 0 && archivedLeads.length === 0 && !isDemoDismissed(user.id)) {
      setShowDemoLeads(true);
    } else {
      setShowDemoLeads(false);
    }
  }, [user?.id, leads.length, archivedLeads.length]);

  const handleDismissDemo = useCallback(() => {
    if (user?.id) dismissDemoLeads(user.id);
    setShowDemoLeads(false);
    setDemoDismissedLocal(true);
  }, [user?.id]);

  const demoLeads = useMemo(() => {
    if (!showDemoLeads || !user?.id) return [];
    return createDemoLeads(user.id);
  }, [showDemoLeads, user?.id]);

  // Per-business, per-channel contact gating
  const handleContactGated = useCallback((channel: 'call' | 'sms' | 'whatsapp', leadId?: string): boolean => {
    if (hasProAccess) return true;

    // If leadId provided, check per-business usage
    if (leadId) {
      if (!hasUsedContact(leadId, channel)) {
        markContactUsed(leadId, channel);
        return true;
      }
      setShowPaywall(true);
      return false;
    }

    // Fallback: global per-channel (legacy)
    const contactAttemptsKey = user?.id ? `leadfinder_contact_attempts:${user.id}` : 'leadfinder_contact_attempts';
    const attempts = (() => {
      try {
        const raw = localStorage.getItem(contactAttemptsKey);
        if (!raw) return { call: 0, sms: 0, whatsapp: 0 };
        const parsed = JSON.parse(raw);
        return {
          call: Number(parsed?.call || 0),
          sms: Number(parsed?.sms || 0),
          whatsapp: Number(parsed?.whatsapp || 0),
        };
      } catch {
        return { call: 0, sms: 0, whatsapp: 0 };
      }
    })();

    if (attempts[channel] < 1) {
      try {
        localStorage.setItem(contactAttemptsKey, JSON.stringify({
          ...attempts,
          [channel]: attempts[channel] + 1,
        }));
      } catch {}
      return true;
    }

    setShowPaywall(true);
    return false;
  }, [hasProAccess, hasUsedContact, markContactUsed, user?.id]);

  // Combine active and archived leads into one unified list
  const allLeads = useMemo(() => {
    const real = [...leads, ...archivedLeads];
    if (showDemoLeads && demoLeads.length > 0 && real.length === 0) {
      return [...demoLeads, ...real];
    }
    return real;
  }, [leads, archivedLeads, showDemoLeads, demoLeads]);

  const isReadOnly = false;

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

  // Challenge 10: only count when user actually opens SMS/WhatsApp app
  useEffect(() => {
    const handler = (e: Event) => {
      const { leadId: businessName } = (e as CustomEvent).detail || {};
      if (!businessName) return;
      const lead = allLeads.find(l => l.business_name === businessName);
      if (lead && !isDemoLead(lead.id)) {
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
    if (isDemoLead(leadId)) return;
    await updateLead(leadId, { contact_method: method });
    window.dispatchEvent(new CustomEvent('demo-checklist-contact-method-set'));
  }, [updateLead]);

  const handlePipelineStatusChange = useCallback(async (leadId: string, status: PipelineStatus) => {
    if (isDemoLead(leadId)) return;
    await updateStatus(leadId, status as any);
    window.dispatchEvent(new CustomEvent('demo-checklist-pipeline-status-set'));
    if (status === 'waiting' || status === 'contacted') {
      challenge.recordContact(leadId);
    }
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

      {/* Demo leads onboarding banner */}
      {showDemoLeads && !demoDismissedLocal && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-primary/20 bg-primary/5">
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
          <p className="text-xs sm:text-sm text-muted-foreground flex-1">
            These sample leads show how your outreach pipeline works. Add real leads from <span className="text-foreground font-medium">Find Leads</span> to get started.
          </p>
          <button
            onClick={handleDismissDemo}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
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
        onContactGated={!hasProAccess ? handleContactGated : undefined}
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

      {/* Paywall for free users attempting contact actions */}
      <TrialConversionModal
        open={showPaywall}
        onOpenChange={setShowPaywall}
        noWebsiteCount={allLeads.length}
        contactedCount={0}
      />

    </div>
  );
};

export default Outreach;
