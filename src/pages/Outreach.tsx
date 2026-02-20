import { useState, useMemo } from 'react';
import { OutreachTable } from '@/components/OutreachTable';
import { OutreachLeadDialog } from '@/components/OutreachLeadDialog';
import { OutreachTipsDialog } from '@/components/OutreachTipsDialog';
import { useOutreach } from '@/hooks/useOutreach';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Lightbulb } from 'lucide-react';
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
    phoneFetchStatus,
    retryPhoneFetch,
  } = useOutreach();

  const [selectedLead, setSelectedLead] = useState<OutreachLead | null>(null);

  // Combine active and archived leads into one unified list
  const allLeads = useMemo(() => {
    return [...leads, ...archivedLeads];
  }, [leads, archivedLeads]);

  // All users get full CRM access — search limits are enforced at the search level
  const isReadOnly = false;

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
      </div>


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
    </div>
  );
};

export default Outreach;
