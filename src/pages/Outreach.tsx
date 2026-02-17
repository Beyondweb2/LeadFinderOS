import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { OutreachTable } from '@/components/OutreachTable';
import { OutreachLeadDialog } from '@/components/OutreachLeadDialog';
import { useOutreach } from '@/hooks/useOutreach';
import { useSubscription } from '@/hooks/useSubscription';
import { useTrial } from '@/hooks/useTrial';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Loader2, Lock, Lightbulb } from 'lucide-react';
import type { OutreachLead } from '@/types/outreach';

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
  } = useOutreach();

  const { subscribed, isLoading: isLoadingSubscription } = useSubscription();
  const { isOnTrial, isLoading: isLoadingTrial } = useTrial();
  const [selectedLead, setSelectedLead] = useState<OutreachLead | null>(null);

  // Combine active and archived leads into one unified list
  const allLeads = useMemo(() => {
    return [...leads, ...archivedLeads];
  }, [leads, archivedLeads]);

  // Non-subscribers AND non-trial users can view but not interact
  const isStillLoading = isLoadingSubscription || isLoadingTrial;
  const hasAccess = subscribed || isOnTrial;
  const isReadOnly = !hasAccess && !isStillLoading;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Pro Tip */}
      <Alert className="border-primary/20 bg-primary/5">
        <Lightbulb className="h-4 w-4 text-primary" />
        <AlertDescription className="text-xs sm:text-sm text-muted-foreground">
          <strong className="text-foreground">Pro Tip:</strong> Spread outreach across WhatsApp, SMS and calls, and rotate templates for better response rates.
        </AlertDescription>
      </Alert>
      {/* Page Header - Compact on mobile */}
      <div className="text-center sm:text-left">
        <h1 className="text-lg sm:text-2xl font-bold tracking-tight">Outreach CRM</h1>
        <p className="text-xs sm:text-base text-muted-foreground max-w-lg">
          Contact businesses via WhatsApp, SMS or call. Update their status, then track promising ones in Track Leads.
        </p>
        {/* Workflow Tip - More compact on mobile */}
        <div className="mt-2 sm:mt-3 p-2 sm:p-3 rounded-lg bg-muted/50 border border-border/50 max-w-lg">
          <p className="text-[10px] sm:text-xs text-muted-foreground">
            <span className="font-medium text-foreground">💡 Workflow:</span> Contact leads via WhatsApp, SMS or call → Update status → Positive response? Track in{' '}
            <Link to="/potential-work" className="text-primary hover:underline">Track Leads</Link>
          </p>
        </div>
      </div>

      {/* Subscribe banner for non-subscribers */}
      {isReadOnly && (
        <Alert className="border-primary/30 bg-primary/5">
          <Lock className="h-4 w-4 text-primary" />
          <AlertDescription className="flex items-center justify-between gap-4 flex-wrap">
            <span>Subscribe for full access to manage your leads.</span>
            <Button asChild size="sm" className="bg-primary">
              <Link to="/subscribe">Subscribe Now</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Lead Table - now shows all leads with status management */}
      <OutreachTable
        leads={allLeads}
        onLeadClick={isReadOnly ? () => {} : setSelectedLead}
        onStatusChange={updateStatus}
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
    </div>
  );
};

export default Outreach;
