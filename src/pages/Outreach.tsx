import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { OutreachTable } from '@/components/OutreachTable';
import { OutreachLeadDialog } from '@/components/OutreachLeadDialog';
import { useOutreach } from '@/hooks/useOutreach';
import { useSubscription } from '@/hooks/useSubscription';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Loader2, Lock } from 'lucide-react';
import type { OutreachLead } from '@/types/outreach';

const Outreach = () => {
  const {
    leads,
    archivedLeads,
    isLoading,
    updateStatus,
    updateNextAction,
    updateNotes,
    deleteLead,
    deleteMultiple,
    deleteAllLeads,
    fetchActivities,
    archiveLead,
    archiveMultiple,
    markMultipleAsInterested,
    fetchLeads,
  } = useOutreach();

  const { subscribed, isLoading: isLoadingSubscription } = useSubscription();
  const [selectedLead, setSelectedLead] = useState<OutreachLead | null>(null);

  // Combine active and archived leads into one unified list
  const allLeads = useMemo(() => {
    return [...leads, ...archivedLeads];
  }, [leads, archivedLeads]);

  // Non-subscribers can view but not interact
  const isReadOnly = !subscribed && !isLoadingSubscription;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Page Header */}
      <div className="text-center sm:text-left">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Outreach CRM</h1>
        <p className="text-sm sm:text-base text-muted-foreground max-w-lg">
          Cold call businesses or copy phone numbers for texting. Mark leads as "Contacted" once you've reached out, then move interested ones to your Interested list.
        </p>
        {/* Workflow Tip */}
        <div className="mt-3 p-3 rounded-lg bg-muted/50 border border-border/50 max-w-lg">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">💡 Workflow:</span> Select leads → Copy numbers or call directly → Mark as Contacted → Move interested leads to{' '}
            <Link to="/potential-work" className="text-primary hover:underline">Interested</Link>
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
          onDelete={deleteLead}
          fetchActivities={fetchActivities}
          readOnly={false}
        />
      )}
    </div>
  );
};

export default Outreach;
