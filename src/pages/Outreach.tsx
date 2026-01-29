import { useState } from 'react';
import { OutreachTable } from '@/components/OutreachTable';
import { OutreachLeadDialog } from '@/components/OutreachLeadDialog';
import { useOutreach } from '@/hooks/useOutreach';
import { Loader2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { OutreachLead, ListType } from '@/types/outreach';

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
  } = useOutreach();

  const [selectedLead, setSelectedLead] = useState<OutreachLead | null>(null);
  const [activeList, setActiveList] = useState<ListType>('no_website');

  const filteredLeads = leads.filter((lead) => lead.list_type === activeList);

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

      {/* Tabs */}
      <Tabs value={activeList} onValueChange={(v) => setActiveList(v as ListType)} className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="no_website">
            No Website ({leads.filter((l) => l.list_type === 'no_website').length})
          </TabsTrigger>
          <TabsTrigger value="broken_website">
            Broken Website ({leads.filter((l) => l.list_type === 'broken_website').length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="no_website">
          <OutreachTable
            leads={filteredLeads}
            onLeadClick={setSelectedLead}
            onStatusChange={updateStatus}
            onNextActionChange={updateNextAction}
            onRemoveAll={deleteAllLeads}
          />
        </TabsContent>
        <TabsContent value="broken_website">
          <OutreachTable
            leads={filteredLeads}
            onLeadClick={setSelectedLead}
            onStatusChange={updateStatus}
            onNextActionChange={updateNextAction}
            onRemoveAll={deleteAllLeads}
          />
        </TabsContent>
      </Tabs>

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
