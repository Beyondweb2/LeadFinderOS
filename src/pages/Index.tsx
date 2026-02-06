import { useState } from 'react';
import { SearchForm } from '@/components/SearchForm';
import { LeadsTable } from '@/components/LeadsTable';
import { ContactDialog } from '@/components/ContactDialog';
 import { useLeadSearchContext } from '@/contexts/LeadSearchContext';
import { useContactTracking } from '@/hooks/useContactTracking';
import { useOutreach } from '@/hooks/useOutreach';
import { useCheckedBusinesses } from '@/hooks/useCheckedBusinesses';
import { Flame, Target, Zap } from 'lucide-react';
import type { Lead, Country } from '@/types/lead';

const Index = () => {
  const { leads, isLoading, search, exportToCsv } = useLeadSearchContext();
  const { 
    markAsContacted, 
    getLatestContact, 
    isLoading: isContactLoading 
  } = useContactTracking();
  const { addLead: addToOutreach, isInOutreach, leads: outreachLeads } = useOutreach();
  const { markAsChecked, isChecked } = useCheckedBusinesses();
  const [contactDialogLead, setContactDialogLead] = useState<Lead | null>(null);
  const [lastSearchCountry, setLastSearchCountry] = useState<Country>('UK');

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-center sm:text-left">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Find Leads</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Search for businesses without websites
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center sm:justify-end gap-3 sm:gap-4 text-xs sm:text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Flame className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-status-hot" />
            <span>Hot = No website</span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Zap className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
            <span>AI-powered</span>
          </div>
        </div>
      </div>

      {/* Search Section */}
      <section>
        <SearchForm 
          onSearch={(filters) => {
            setLastSearchCountry(filters.country || 'UK');
            search(filters);
          }} 
          isLoading={isLoading} 
        />
      </section>

      {/* Results Section */}
      {leads.length > 0 && (
        <section className="animate-fade-in">
          <LeadsTable 
            leads={leads} 
            onExport={exportToCsv}
            onLogContact={(lead) => setContactDialogLead(lead)}
            getLatestContact={getLatestContact}
            onAddToOutreach={(lead) => addToOutreach(lead, lastSearchCountry, 'no_website')}
            isInOutreach={isInOutreach}
            onMapLinkClick={markAsChecked}
            isChecked={isChecked}
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

      {/* Contact Dialog */}
      <ContactDialog
        lead={contactDialogLead}
        open={!!contactDialogLead}
        onOpenChange={(open) => !open && setContactDialogLead(null)}
        onSubmit={markAsContacted}
        isLoading={isContactLoading}
      />
    </div>
  );
};

export default Index;
