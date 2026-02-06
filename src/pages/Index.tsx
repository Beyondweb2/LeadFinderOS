import { useState, useEffect, useRef } from 'react';
import { SearchForm } from '@/components/SearchForm';
import { LeadsTable } from '@/components/LeadsTable';
import { ContactDialog } from '@/components/ContactDialog';
import { UpgradePromptDialog } from '@/components/UpgradePromptDialog';
import { TrialLimitDialog } from '@/components/TrialLimitDialog';
import { useLeadSearchContext } from '@/contexts/LeadSearchContext';
import { useContactTracking } from '@/hooks/useContactTracking';
import { useOutreach } from '@/hooks/useOutreach';
import { useCheckedBusinesses } from '@/hooks/useCheckedBusinesses';
import { useTrial } from '@/hooks/useTrial';
import { useSubscription } from '@/hooks/useSubscription';
import { useFirstTimeUser } from '@/hooks/useFirstTimeUser';
import { Flame, Target, Zap, Search } from 'lucide-react';
import type { Lead, Country } from '@/types/lead';

const Index = () => {
  const { leads, isLoading, search, exportToCsv, trialLimitError, clearTrialLimitError } = useLeadSearchContext();
  const { 
    markAsContacted, 
    getLatestContact, 
    isLoading: isContactLoading 
  } = useContactTracking();
  const { addLead: addToOutreach, isInOutreach, leads: outreachLeads } = useOutreach();
  const { markAsChecked, isChecked } = useCheckedBusinesses();
  const { searchesUsed, shouldShowUpgradePrompt, checkTrial, isOnTrial, searchesRemaining, dailyLimit } = useTrial();
  const { subscribed } = useSubscription();
  const { isFirstTime, hasChecked: hasCheckedFirstTime, markFirstLoginComplete } = useFirstTimeUser();
  const [contactDialogLead, setContactDialogLead] = useState<Lead | null>(null);
  const [lastSearchCountry, setLastSearchCountry] = useState<Country>('UK');
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const hasRunAutoSearch = useRef(false);

  // Auto-search for first-time users (doesn't count toward trial limit)
  useEffect(() => {
    if (hasCheckedFirstTime && isFirstTime && !hasRunAutoSearch.current && !isLoading) {
      hasRunAutoSearch.current = true;
      
      // Run automatic search with defaults - skip trial count since this is a demo
      search({
        keyword: 'Electrician',
        location: 'London, UK',
        radius: 10000, // 10km in meters
        requirePhone: true,
        country: 'UK' as Country,
        deepSearch: false,
      }, true); // skipTrialCount = true for auto-search
      
      // Mark first login as complete
      markFirstLoginComplete();
    }
  }, [hasCheckedFirstTime, isFirstTime, isLoading, search, markFirstLoginComplete]);

  // Check if we should show upgrade prompt after searches
  useEffect(() => {
    if (!subscribed && shouldShowUpgradePrompt()) {
      setShowUpgradePrompt(true);
    }
  }, [searchesUsed, subscribed, shouldShowUpgradePrompt]);

  // Refetch trial data after search completes
  useEffect(() => {
    if (!isLoading && leads.length > 0) {
      checkTrial();
    }
  }, [isLoading, leads.length, checkTrial]);

  // Count businesses without websites
  const noWebsiteCount = leads.filter(l => l.websiteStatus === 'NO_WEBSITE').length;

  return (
    <div className="space-y-6 md:space-y-8">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-center sm:text-left">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Find Leads</h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-lg">
            Find businesses without websites in any area. Search by business type and location, then add hot leads to your CRM.
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
          isOnTrial={isOnTrial}
          searchesRemaining={searchesRemaining}
          dailyLimit={dailyLimit}
          subscribed={subscribed}
        />
      </section>

      {/* Outcome-focused Results Header */}
      {leads.length > 0 && noWebsiteCount > 0 && (
        <div className="flex items-center justify-center gap-2 py-3 px-4 bg-primary/5 border border-primary/10 rounded-lg">
          <Target className="h-5 w-5 text-primary" />
          <span className="text-base font-medium text-foreground">
            <span className="text-primary font-bold">{noWebsiteCount}</span> business{noWebsiteCount !== 1 ? 'es' : ''} here need{noWebsiteCount === 1 ? 's' : ''} a website
          </span>
        </div>
      )}

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
            <Search className="h-12 w-12 text-muted-foreground" />
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

      {/* Upgrade Prompt Dialog (after every 5 searches) */}
      <UpgradePromptDialog
        open={showUpgradePrompt}
        onOpenChange={setShowUpgradePrompt}
        searchesUsed={searchesUsed}
      />

      {/* Trial Limit Dialog (when daily limit reached) */}
      <TrialLimitDialog
        open={!!trialLimitError}
        onOpenChange={(open) => !open && clearTrialLimitError()}
        searchesToday={trialLimitError?.searchesToday || 3}
        dailyLimit={trialLimitError?.limit || 3}
      />
    </div>
  );
};

export default Index;
