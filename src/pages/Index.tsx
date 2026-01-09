import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SearchForm } from '@/components/SearchForm';
import { LeadsTable } from '@/components/LeadsTable';
import { CallListSheet } from '@/components/CallListSheet';
import { ContactDialog } from '@/components/ContactDialog';
import { UserMenu } from '@/components/UserMenu';
import { useLeadSearch } from '@/hooks/useLeadSearch';
import { useCallList } from '@/hooks/useCallList';
import { useContactTracking } from '@/hooks/useContactTracking';
import { useOutreach } from '@/hooks/useOutreach';
import { Flame, Target, Zap, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Lead } from '@/types/lead';

const Index = () => {
  const { leads, isLoading, search, exportToCsv } = useLeadSearch();
  const { 
    callList, 
    addToCallList, 
    removeFromCallList, 
    clearCallList, 
    isInCallList,
    exportCallListToCsv,
    importCallListFromCsv
  } = useCallList();
  const { 
    markAsContacted, 
    getLatestContact, 
    isLoading: isContactLoading 
  } = useContactTracking();
  const { addLead: addToOutreach, isInOutreach } = useOutreach();
  
  const [contactDialogLead, setContactDialogLead] = useState<Lead | null>(null);

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
                  <Target className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">
                    Lead<span className="text-gradient-primary">Finder</span>
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Find businesses without websites
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-6 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Flame className="h-4 w-4 text-status-hot" />
                    <span>Hot leads = No website</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    <span>AI-powered classification</span>
                  </div>
                </div>
                <Button variant="outline" asChild>
                  <Link to="/outreach">
                    <ClipboardList className="h-4 w-4 mr-2" />
                    Outreach CRM
                  </Link>
                </Button>
                <CallListSheet 
                  callList={callList}
                  onRemove={removeFromCallList}
                  onClear={clearCallList}
                  onExport={exportCallListToCsv}
                  onImport={importCallListFromCsv}
                />
                <UserMenu />
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="container py-8 space-y-8">
          {/* Search Section */}
          <section>
            <SearchForm onSearch={search} isLoading={isLoading} />
          </section>

          {/* Results Section */}
          {leads.length > 0 && (
            <section className="animate-fade-in">
              <LeadsTable 
                leads={leads} 
                onExport={exportToCsv}
                onAddToCallList={addToCallList}
                isInCallList={isInCallList}
                onLogContact={(lead) => setContactDialogLead(lead)}
                getLatestContact={getLatestContact}
                onAddToOutreach={addToOutreach}
                isInOutreach={isInOutreach}
              />
            </section>
          )}

          {/* Empty State */}
          {leads.length === 0 && !isLoading && (
            <section className="text-center py-16">
              <div className="inline-flex p-4 rounded-full bg-muted/50 mb-6">
                <Target className="h-12 w-12 text-muted-foreground" />
              </div>
              <h2 className="text-xl font-semibold text-foreground/80 mb-2">
                Ready to find leads
              </h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                Enter a business type and location above to discover businesses 
                without websites — your ideal prospects for web development services.
              </p>
            </section>
          )}
        </main>

        {/* Contact Dialog */}
        <ContactDialog
          lead={contactDialogLead}
          open={!!contactDialogLead}
          onOpenChange={(open) => !open && setContactDialogLead(null)}
          onSubmit={markAsContacted}
          isLoading={isContactLoading}
        />

        {/* Footer */}
        <footer className="border-t border-border/50 py-6 mt-auto">
          <div className="container text-center text-sm text-muted-foreground">
            <p>
              Powered by Google Places API • AI classification for accurate website detection
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Index;
