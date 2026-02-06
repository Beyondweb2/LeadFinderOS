import { useState } from 'react';
import { OutreachTable } from '@/components/OutreachTable';
import { OutreachLeadDialog } from '@/components/OutreachLeadDialog';
import { useOutreach } from '@/hooks/useOutreach';
 import { Loader2 } from 'lucide-react';
import type { OutreachLead } from '@/types/outreach';

const Outreach = () => {
  const {
    leads,
    isLoading,
    updateStatus,
    updateNextAction,
    updateNotes,
    deleteLead,
    deleteAllLeads,
    fetchActivities,
    archiveLead,
    archiveMultiple,
  } = useOutreach();

  const [selectedLead, setSelectedLead] = useState<OutreachLead | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Outreach CRM</h1>
        <p className="text-muted-foreground">
          Manage your lead pipeline
        </p>
      </div>

      {/* Lead Table - readOnly mode hides status and next action editing */}
      <OutreachTable
        leads={leads}
        onLeadClick={setSelectedLead}
        onStatusChange={updateStatus}
        onNextActionChange={updateNextAction}
        onRemoveAll={deleteAllLeads}
        onArchive={archiveLead}
        onArchiveSelected={archiveMultiple}
        showArchiveButton={true}
        isArchiveView={false}
        readOnly={true}
      />

      {/* Lead Detail Dialog - readOnly mode */}
      <OutreachLeadDialog
        lead={selectedLead}
        open={!!selectedLead}
        onOpenChange={(open) => !open && setSelectedLead(null)}
        onUpdateStatus={updateStatus}
        onUpdateNextAction={updateNextAction}
        onUpdateNotes={updateNotes}
        onDelete={deleteLead}
        fetchActivities={fetchActivities}
        readOnly={true}
      />
    </div>
  );
};

export default Outreach;
