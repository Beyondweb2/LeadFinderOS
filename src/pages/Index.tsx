import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { SearchForm } from '@/components/SearchForm';
import { LeadsTable } from '@/components/LeadsTable';
import { ContactDialog } from '@/components/ContactDialog';
import { UpgradePromptDialog } from '@/components/UpgradePromptDialog';
import { TrialLimitDialog } from '@/components/TrialLimitDialog';
import { DemoUpgradePanel } from '@/components/DemoUpgradePanel';
import { DemoOnboardingModal } from '@/components/DemoOnboardingModal';
import { useLeadSearchContext } from '@/contexts/LeadSearchContext';
import { useContactTracking } from '@/hooks/useContactTracking';
import { useOutreach } from '@/hooks/useOutreach';
import { useCheckedBusinesses } from '@/hooks/useCheckedBusinesses';
import { useTrial } from '@/hooks/useTrial';
import { useSubscription } from '@/hooks/useSubscription';
import { Flame, Target, Zap, Search, CreditCard, AlertTriangle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Lead, Country } from '@/types/lead';

const Index = () => {
  const location = useLocation();
  const { leads, isLoading, search, exportToCsv, trialLimitError, clearTrialLimitError, postAbandonExhausted } = useLeadSearchContext();
  const { 
    markAsContacted, 
    getLatestContact, 
    isLoading: isContactLoading 
  } = useContactTracking();
  const { addLead: addToOutreach, isInOutreach, leads: outreachLeads } = useOutreach();
  const { markAsChecked, isChecked } = useCheckedBusinesses();
  const { searchesUsed, shouldShowUpgradePrompt, checkTrial, isOnTrial, searchesRemaining, dailyLimit, isStripeTrialing, isLoading: isTrialLoading, demoSearchUsed } = useTrial();
  const { subscribed, isLoading: isSubscriptionLoading, status: subStatus } = useSubscription();
  
  // Pro access = active, trialing, past_due, or admin
  const hasProAccess = subStatus === 'active' || subStatus === 'trialing' || subStatus === 'past_due' || subStatus === 'admin';
  console.log('[Index] access check', { userId: 'current', subStatus, hasProAccess, isStripeTrialing, subscribed, demoSearchUsed });
  const [contactDialogLead, setContactDialogLead] = useState<Lead | null>(null);
  const [lastSearchCountry, setLastSearchCountry] = useState<Country>('UK');
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  
  // Determine if still loading access status
  const isAccessLoading = isTrialLoading || isSubscriptionLoading;

  // Demo user who already used their search — show upgrade on next search attempt
  const [showDemoUpgradePanel, setShowDemoUpgradePanel] = useState(false);

  // Check if we should show upgrade prompt after searches (only for free trial users, not Stripe trialing)
  useEffect(() => {
    if (!hasProAccess && shouldShowUpgradePrompt()) {
      setShowUpgradePrompt(true);
    }
  }, [searchesUsed, hasProAccess, shouldShowUpgradePrompt]);

  // Refetch trial data after search completes
  useEffect(() => {
    if (!isLoading && leads.length > 0) {
      checkTrial();
    }
  }, [isLoading, leads.length, checkTrial]);

  // Count businesses without websites
  const noWebsiteCount = leads.filter(l => l.websiteStatus === 'NO_WEBSITE').length;

  // Demo user: no pro access AND hasn't used demo search yet (or just used it)
  // This overrides the old trial system for users who haven't subscribed
  const isDemoUser = !hasProAccess && !isStripeTrialing;
  const demoSearchesRemaining = isDemoUser ? (demoSearchUsed ? 0 : 1) : searchesRemaining;
  const demoDailyLimit = isDemoUser ? 1 : dailyLimit;

  return (
    <div className="space-y-4 md:space-y-8">
      {/* Page Header - Compact on mobile */}
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

      {/* Post-Abandon Exhausted Banner */}
      {postAbandonExhausted && !hasProAccess && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="font-medium">You're one step away from unlimited leads.</span>
          </div>
          <Button asChild size="sm" className="shrink-0">
            <Link to="/subscribe">
              <CreditCard className="mr-2 h-4 w-4" />
              Resume Checkout
            </Link>
          </Button>
        </div>
      )}

      {/* Search Section OR Upgrade Panel */}
      <section>
        {showDemoUpgradePanel ? (
          <DemoUpgradePanel />
        ) : (
          <SearchForm 
            onSearch={(filters) => {
              // Block second search for demo users
              if (isDemoUser && demoSearchUsed) {
                setShowDemoUpgradePanel(true);
                return;
              }
              setLastSearchCountry(filters.country || 'UK');
              search(filters, false, false);
            }} 
            isLoading={isLoading}
            isOnTrial={!isAccessLoading && (isOnTrial || isStripeTrialing)}
            searchesRemaining={demoSearchesRemaining}
            dailyLimit={demoDailyLimit}
            isPaidSubscriber={isAccessLoading || hasProAccess}
            disabled={postAbandonExhausted && !hasProAccess}
            initialRadius={isDemoUser ? 100 : undefined}
          />
        )}
      </section>

      {/* Subtle upgrade banner after first demo search */}
      {isDemoUser && demoSearchUsed && !showDemoUpgradePanel && leads.length > 0 && (
        <div className="flex items-center justify-center gap-2 py-2.5 px-4 bg-primary/5 border border-primary/10 rounded-lg">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm text-muted-foreground">
            You've used your demo search.
            <Link to="/subscribe" className="text-primary font-medium ml-1 hover:underline">
              Get 24 hours unlimited searches - FREE →
            </Link>
          </span>
        </div>
      )}

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
      {leads.length === 0 && !isLoading && !showDemoUpgradePanel && (
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

      {/* Demo Onboarding Modal - only after access status is resolved */}
      <DemoOnboardingModal isDemoUser={!isAccessLoading && isDemoUser} />

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
