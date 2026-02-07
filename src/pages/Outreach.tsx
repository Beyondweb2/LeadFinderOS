import { useState } from 'react';
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
  } = useOutreach();

  const { subscribed, isLoading: isLoadingSubscription } = useSubscription();
  const [selectedLead, setSelectedLead] = useState<OutreachLead | null>(null);

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
          Copy phone numbers for your bulk message sender. Once you've copied numbers, send them to Archive to track responses.
        </p>
        {/* Chrome Extension Tip */}
        <div className="mt-3 p-3 rounded-lg bg-muted/50 border border-border/50 max-w-lg">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">💡 Tip:</span> Use a WhatsApp bulk sender Chrome extension to message multiple leads at once.{' '}
            <a 
              href="https://chrome.google.com/webstore/category/extensions"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Browse extensions →
            </a>
            <span className="block mt-1 text-[10px] text-muted-foreground/70">
              See <Link to="/terms" className="underline hover:text-foreground">Terms & Conditions</Link> for third-party app disclaimer.
            </span>
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

      {/* Lead Table - readOnly mode hides status and next action editing */}
      <OutreachTable
        leads={leads}
        onLeadClick={isReadOnly ? () => {} : setSelectedLead}
        onStatusChange={updateStatus}
        onNextActionChange={updateNextAction}
        onRemoveAll={deleteAllLeads}
        onArchive={archiveLead}
        onArchiveSelected={archiveMultiple}
        onDeleteSelected={deleteMultiple}
        showArchiveButton={!isReadOnly}
        isArchiveView={false}
        readOnly={true}
      />

      {/* Lead Detail Dialog - readOnly mode */}
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
          readOnly={true}
        />
      )}
    </div>
  );
};

export default Outreach;
