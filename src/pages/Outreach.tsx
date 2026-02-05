import { useState } from 'react';
import { OutreachTable } from '@/components/OutreachTable';
import { OutreachLeadDialog } from '@/components/OutreachLeadDialog';
import { useOutreach } from '@/hooks/useOutreach';
import { Loader2, Archive, Users, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
    deleteAllLeads,
    fetchActivities,
    archiveLead,
    unarchiveLead,
    archiveMultiple,
    unarchiveMultiple,
    searchArchivedByPhone,
  } = useOutreach();

  const [selectedLead, setSelectedLead] = useState<OutreachLead | null>(null);
  const [viewMode, setViewMode] = useState<'active' | 'archive'>('active');
  const [archiveSearchQuery, setArchiveSearchQuery] = useState('');
  const [archiveSearchResults, setArchiveSearchResults] = useState<OutreachLead[] | null>(null);

  // Handle archive search
  const handleArchiveSearch = async () => {
    if (!archiveSearchQuery.trim()) {
      setArchiveSearchResults(null);
      return;
    }
    const results = await searchArchivedByPhone(archiveSearchQuery);
    setArchiveSearchResults(results);
  };

  // Clear archive search
  const clearArchiveSearch = () => {
    setArchiveSearchQuery('');
    setArchiveSearchResults(null);
  };

  // Get leads to display based on view mode and search
  const displayedLeads = viewMode === 'active' 
    ? leads 
    : archiveSearchResults !== null 
      ? archiveSearchResults 
      : archivedLeads;

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

      {/* View Toggle */}
      <div className="flex items-center gap-4">
        <div className="flex gap-2">
          <Button
            variant={viewMode === 'active' ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setViewMode('active');
              clearArchiveSearch();
            }}
          >
            <Users className="h-4 w-4 mr-2" />
            Active ({leads.length})
          </Button>
          <Button
            variant={viewMode === 'archive' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('archive')}
          >
            <Archive className="h-4 w-4 mr-2" />
            Archive ({archivedLeads.length})
          </Button>
        </div>

        {/* Archive Search */}
        {viewMode === 'archive' && (
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by phone number..."
                value={archiveSearchQuery}
                onChange={(e) => setArchiveSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleArchiveSearch()}
                className="pl-9"
              />
            </div>
            <Button size="sm" onClick={handleArchiveSearch}>
              Search
            </Button>
            {archiveSearchResults !== null && (
              <Button size="sm" variant="ghost" onClick={clearArchiveSearch}>
                Clear
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Search Results Info */}
      {viewMode === 'archive' && archiveSearchResults !== null && (
        <p className="text-sm text-muted-foreground">
          Found {archiveSearchResults.length} result{archiveSearchResults.length !== 1 ? 's' : ''} for "{archiveSearchQuery}"
        </p>
      )}

      {/* Lead Table */}
      <OutreachTable
        leads={displayedLeads}
        onLeadClick={setSelectedLead}
        onStatusChange={updateStatus}
        onNextActionChange={updateNextAction}
        onRemoveAll={deleteAllLeads}
        onArchive={viewMode === 'active' ? archiveLead : unarchiveLead}
        onArchiveSelected={viewMode === 'active' ? archiveMultiple : unarchiveMultiple}
        showArchiveButton={true}
        isArchiveView={viewMode === 'archive'}
      />

      {/* Lead Detail Dialog */}
      <OutreachLeadDialog
        lead={selectedLead}
        open={!!selectedLead}
        onOpenChange={(open) => !open && setSelectedLead(null)}
        onUpdateStatus={updateStatus}
        onUpdateNextAction={updateNextAction}
        onUpdateNotes={updateNotes}
        onDelete={deleteLead}
        fetchActivities={fetchActivities}
      />
    </div>
  );
};

export default Outreach;
