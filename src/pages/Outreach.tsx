import { useState } from 'react';
import { Link } from 'react-router-dom';
import { OutreachTable } from '@/components/OutreachTable';
import { OutreachLeadDialog } from '@/components/OutreachLeadDialog';
import { UserMenu } from '@/components/UserMenu';
import { useOutreach } from '@/hooks/useOutreach';
import { ClipboardList, Search, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

  return (
    <div className="min-h-screen bg-background">
      {/* Background glow effect */}
      <div
        className="fixed inset-0 pointer-events-none opacity-30"
        style={{ background: 'var(--gradient-glow)' }}
      />

      <div className="relative z-10">
        {/* Header */}
        <header className="border-b border-border/50 bg-card/50 backdrop-blur-xl">
          <div className="container py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                  <ClipboardList className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">
                    Outreach<span className="text-gradient-primary">CRM</span>
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Manage your lead pipeline
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <Button variant="outline" asChild>
                  <Link to="/">
                    <Search className="h-4 w-4 mr-2" />
                    Find Leads
                  </Link>
                </Button>
                <UserMenu />
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="container py-8">
          <Tabs value={activeList} onValueChange={(v) => setActiveList(v as ListType)} className="space-y-6">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="no_website">
                No Website ({leads.filter((l) => l.list_type === 'no_website').length})
              </TabsTrigger>
              <TabsTrigger value="broken_website">
                Broken Website ({leads.filter((l) => l.list_type === 'broken_website').length})
              </TabsTrigger>
            </TabsList>

            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <>
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
              </>
            )}
          </Tabs>
        </main>

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

        {/* Footer */}
        <footer className="border-t border-border/50 py-6 mt-auto">
          <div className="container text-center text-sm text-muted-foreground">
            <p>Track your outreach • Never lose a lead</p>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Outreach;
