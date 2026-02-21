import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { SearchForm } from '@/components/SearchForm';
import { LeadsTable } from '@/components/LeadsTable';

import { UpgradePromptDialog } from '@/components/UpgradePromptDialog';
import { TrialLimitDialog } from '@/components/TrialLimitDialog';
import { useLeadSearchContext } from '@/contexts/LeadSearchContext';

import { useOutreach } from '@/hooks/useOutreach';
import { useCheckedBusinesses } from '@/hooks/useCheckedBusinesses';
import { useTrial } from '@/hooks/useTrial';
import { useSubscription } from '@/hooks/useSubscription';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Flame, Target, Zap, Search, CreditCard, AlertTriangle, Sparkles, Lock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { Lead, Country } from '@/types/lead';

const FREE_SEARCH_LIMIT = 1;
const PAYWALL_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

const Index = () => {
  const location = useLocation();
  const { leads, isLoading, search, exportToCsv, trialLimitError, clearTrialLimitError, postAbandonExhausted, freeSearchExhausted } = useLeadSearchContext();
  const { addLead: addToOutreach, isInOutreach, leads: outreachLeads } = useOutreach();
  const { markAsChecked, isChecked } = useCheckedBusinesses();
  const { searchesUsed, shouldShowUpgradePrompt, checkTrial, isOnTrial, searchesRemaining, dailyLimit, isStripeTrialing, isLoading: isTrialLoading, demoSearchUsed, freeSearchCount } = useTrial();
  const { subscribed, isLoading: isSubscriptionLoading, status: subStatus, isPaidSubscriber } = useSubscription();
  const { session } = useAuth();
  const { toast } = useToast();
  
  // Pro access = active, past_due, or admin (trialing kept for legacy)
  const hasProAccess = isPaidSubscriber || subStatus === 'trialing' || subStatus === 'past_due' || subStatus === 'admin';
  
  const [lastSearchCountry, setLastSearchCountry] = useState<Country>('UK');
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [isCheckoutLoading] = useState(false);
  const [showUpgradeAfterLimit, setShowUpgradeAfterLimit] = useState(false);
  const [totalBusinessesFound, setTotalBusinessesFound] = useState(0);
  // Session-level dismissal tracking
  const [paywallDismissedThisSession, setPaywallDismissedThisSession] = useState(false);
  // Client-side search click counter for button state transition
  const [localSearchCount, setLocalSearchCount] = useState(0);
  const [buttonExhausted, setButtonExhausted] = useState(false);
  
  // Determine if still loading access status
  const isAccessLoading = isTrialLoading || isSubscriptionLoading;

  // Free user = not paid
  const isFreeUser = !hasProAccess;

  // Free search exhausted — driven by client-side click counter, not server
  const freeSearchesExhausted = isFreeUser && buttonExhausted;

  // Check if paywall was dismissed within cooldown period
  const isWithinCooldown = useCallback(() => {
    try {
      const dismissed = localStorage.getItem('paywallDismissedAt');
      if (!dismissed) return false;
      return Date.now() - parseInt(dismissed, 10) < PAYWALL_COOLDOWN_MS;
    } catch {
      return false;
    }
  }, []);

  // Refetch trial data and fire tip event after search completes
  useEffect(() => {
    if (!isLoading && leads.length > 0) {
      checkTrial();
      if (isFreeUser) {
        setTimeout(() => window.dispatchEvent(new CustomEvent('post-search-tip')), 300);
        
        // Track cumulative businesses found
        setTotalBusinessesFound(prev => prev + leads.length);
      }
    }
  }, [isLoading, leads.length, checkTrial, isFreeUser]);

  // When server blocks a search (freeSearchExhausted), auto-show upgrade modal
  useEffect(() => {
    if (freeSearchExhausted) {
      setShowUpgradeAfterLimit(true);
    }
  }, [freeSearchExhausted]);

  // Count businesses without websites
  const noWebsiteCount = leads.filter(l => l.websiteStatus === 'NO_WEBSITE').length;

  // "Unlock Unlimited" button on search form now opens the modal instead of going to Stripe directly
  const handleUnlockClick = useCallback(() => {
    setShowUpgradeAfterLimit(true);
  }, []);

  // Handle search attempt — always let server decide whether to block
  const handleSearch = useCallback((filters: any) => {
    // If free user has already done 1 search, intercept second click
    if (isFreeUser && localSearchCount >= 1) {
      setButtonExhausted(true);
      setShowUpgradeAfterLimit(true);
      return; // Do NOT execute search
    }
    setLastSearchCountry(filters.country || 'UK');
    search(filters, false, false);
    if (isFreeUser) {
      setLocalSearchCount(prev => prev + 1);
    }
  }, [search, isFreeUser, localSearchCount]);

  // Handle paywall dismissal
  const handlePaywallDismiss = useCallback((open: boolean) => {
    if (!open) {
      setShowUpgradeAfterLimit(false);
      setPaywallDismissedThisSession(true);
      try {
        localStorage.setItem('paywallDismissedAt', Date.now().toString());
      } catch {}
    }
  }, []);

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

      {/* Search Section */}
      <section>
        <SearchForm 
          onSearch={handleSearch} 
          isLoading={isLoading}
          isOnTrial={false}
          searchesRemaining={hasProAccess ? Infinity : (buttonExhausted ? 0 : Math.max(0, FREE_SEARCH_LIMIT - localSearchCount))}
          dailyLimit={hasProAccess ? Infinity : FREE_SEARCH_LIMIT}
          isPaidSubscriber={isAccessLoading || hasProAccess}
          disabled={postAbandonExhausted && !hasProAccess}
          isUpgradeLoading={isCheckoutLoading}
          onUpgrade={handleUnlockClick}
          freeSearchesExhausted={freeSearchesExhausted}
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
      {leads.length === 0 && !isLoading && !freeSearchesExhausted && (
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

      {/* Trial Limit Dialog (when daily limit reached) */}
      <TrialLimitDialog
        open={!!trialLimitError}
        onOpenChange={(open) => !open && clearTrialLimitError()}
        searchesToday={trialLimitError?.searchesToday || 3}
        dailyLimit={trialLimitError?.limit || 3}
        totalBusinessesFound={totalBusinessesFound}
        noWebsiteCount={noWebsiteCount}
      />

      {/* Upgrade After Limit Popup — action-triggered only */}
      <TrialLimitDialog
        open={showUpgradeAfterLimit}
        onOpenChange={handlePaywallDismiss}
        searchesToday={FREE_SEARCH_LIMIT}
        dailyLimit={FREE_SEARCH_LIMIT}
        totalBusinessesFound={totalBusinessesFound}
        noWebsiteCount={noWebsiteCount}
      />
    </div>
  );
};

export default Index;
