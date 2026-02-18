import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { SearchForm } from '@/components/SearchForm';
import { LeadsTable } from '@/components/LeadsTable';
import { FreeAccessPaywall } from '@/components/FreeAccessPaywall';
import { useLeadSearchContext } from '@/contexts/LeadSearchContext';
import { useOutreach } from '@/hooks/useOutreach';
import { useCheckedBusinesses } from '@/hooks/useCheckedBusinesses';
import { useTrial } from '@/hooks/useTrial';
import { useSubscription } from '@/hooks/useSubscription';
import { Flame, Target, Zap, Search } from 'lucide-react';
import type { Lead, Country } from '@/types/lead';

const Index = () => {
  const location = useLocation();
  const { leads, isLoading, search, exportToCsv, trialLimitError, clearTrialLimitError, postAbandonExhausted } = useLeadSearchContext();
  const { addLead: addToOutreach, isInOutreach, leads: outreachLeads } = useOutreach();
  const { markAsChecked, isChecked } = useCheckedBusinesses();
  const { checkTrial, isLoading: isTrialLoading, isFreeLimitReached } = useTrial();
  const { subscribed, isLoading: isSubscriptionLoading, status: subStatus } = useSubscription();
  
  const hasProAccess = subStatus === 'active' || subStatus === 'trialing' || subStatus === 'past_due' || subStatus === 'admin';
  
  const [lastSearchCountry, setLastSearchCountry] = useState<Country>('UK');
  const [showPaywall, setShowPaywall] = useState(false);
  
  const isAccessLoading = isTrialLoading || isSubscriptionLoading;
  const searchSectionRef = useRef<HTMLElement>(null);
  const [pulseSearch, setPulseSearch] = useState(false);

  // Listen for walkthrough completion focus event
  useEffect(() => {
    const handler = () => {
      searchSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const input = searchSectionRef.current?.querySelector('input');
      if (input) {
        setTimeout(() => input.focus(), 400);
      }
      setPulseSearch(true);
      setTimeout(() => setPulseSearch(false), 2000);
    };
    window.addEventListener('focus-search-input', handler);
    return () => window.removeEventListener('focus-search-input', handler);
  }, []);

  // Show paywall when free limit error comes back from server
  useEffect(() => {
    if (trialLimitError) {
      setShowPaywall(true);
      clearTrialLimitError();
    }
  }, [trialLimitError, clearTrialLimitError]);

  // Refetch after search completes
  useEffect(() => {
    if (!isLoading && leads.length > 0) {
      checkTrial();
    }
  }, [isLoading, leads.length, checkTrial]);

  const noWebsiteCount = leads.filter(l => l.websiteStatus === 'NO_WEBSITE').length;

  return (
    <div className="space-y-4 md:space-y-8">
      {/* Page Header */}
      <div className="flex flex-col gap-2 sm:gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-center sm:text-left">
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight">Find Leads</h1>
          <p className="text-xs sm:text-base text-muted-foreground max-w-lg">
            Find businesses without websites in any area. Search by business type and location, then add hot leads to your CRM.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2 sm:gap-4 text-[10px] sm:text-sm text-muted-foreground">
          <div className="flex items-center gap-1 sm:gap-2">
            <Flame className="h-3 w-3 sm:h-4 sm:w-4 text-status-hot" />
            <span>Hot = No website</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <Zap className="h-3 w-3 sm:h-4 sm:w-4 text-primary" />
            <span>AI-powered</span>
          </div>
        </div>
      </div>

      {/* Search Section */}
      <section ref={searchSectionRef} className={pulseSearch ? 'animate-pulse rounded-lg ring-2 ring-primary/30 transition-all duration-1000' : ''}>
        <SearchForm
          onSearch={(filters) => {
            setLastSearchCountry(filters.country || 'UK');
            search(filters, false, false);
          }} 
          isLoading={isLoading}
          isPaidSubscriber={isAccessLoading || hasProAccess}
        />
      </section>

      {/* Outcome-focused Results Header */}
      {leads.length > 0 && noWebsiteCount > 0 && (
        <div className="flex items-center justify-center gap-1.5 sm:gap-2 py-2 sm:py-3 px-3 sm:px-4 bg-primary/5 border border-primary/10 rounded-lg">
          <Target className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
          <span className="text-sm sm:text-base font-medium text-foreground">
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

      {/* Paywall modal — shown when free search limit reached */}
      <FreeAccessPaywall
        open={showPaywall}
        onOpenChange={setShowPaywall}
      />
    </div>
  );
};

export default Index;
