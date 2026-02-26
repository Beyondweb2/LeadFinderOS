import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { SearchForm } from '@/components/SearchForm';
import { LeadsTable } from '@/components/LeadsTable';

import { UpgradePromptDialog } from '@/components/UpgradePromptDialog';
import { TrialLimitDialog } from '@/components/TrialLimitDialog';
import { PostFirstSearchModal } from '@/components/PostFirstSearchModal';
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
  
  // Pro access = active, past_due, admin, or trialing (Stripe trial)
  const hasProAccess = isPaidSubscriber || subStatus === 'trialing' || subStatus === 'past_due' || subStatus === 'admin' || isStripeTrialing;
  
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

  // Free search exhausted — after 2nd search completes, block further searches
  const freeSearchesExhausted = isFreeUser && localSearchCount >= 2;

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

        // On 2nd+ search, show paywall after results load
        if (buttonExhausted) {
          setTimeout(() => setShowUpgradeAfterLimit(true), 600);
        }
      }
    }
  }, [isLoading, leads.length, checkTrial, isFreeUser, buttonExhausted]);

  // When server blocks a search (freeSearchExhausted), auto-show upgrade modal
  // Only show for free users after access status is resolved (prevents flash for admins/subscribers)
  useEffect(() => {
    if (freeSearchExhausted && !isAccessLoading && isFreeUser) {
      setShowUpgradeAfterLimit(true);
    }
  }, [freeSearchExhausted, isAccessLoading, isFreeUser]);

  // Count businesses without websites
  const noWebsiteCount = leads.filter(l => l.websiteStatus === 'NO_WEBSITE').length;

  // "Unlock Unlimited" button on search form now opens the modal instead of going to Stripe directly
  const handleUnlockClick = useCallback(() => {
    setShowUpgradeAfterLimit(true);
  }, []);

  // Handle search attempt — always let server decide whether to block
  const handleSearch = useCallback((filters: any) => {
    setLastSearchCountry(filters.country || 'UK');
    search(filters, false, false);
    if (isFreeUser) {
      const newCount = localSearchCount + 1;
      setLocalSearchCount(newCount);
      // On 2nd search: let it run, but flag for blur + paywall
      if (newCount >= 2) {
        setButtonExhausted(true);
      }
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
          searchesRemaining={hasProAccess ? Infinity : Math.max(0, 2 - localSearchCount)}
          dailyLimit={hasProAccess ? Infinity : 2}
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
        <section className={`animate-fade-in relative ${buttonExhausted && isFreeUser ? 'select-none' : ''}`}>
          {/* Blur overlay for paywall teaser */}
          {buttonExhausted && isFreeUser && (
            <div className="absolute inset-0 z-10 backdrop-blur-md bg-background/30 rounded-lg flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-center px-4">
                <Lock className="h-8 w-8 text-primary" />
                <p className="text-sm font-semibold text-foreground">Start your free trial to unlock these leads</p>
                <Button size="sm" onClick={() => setShowUpgradeAfterLimit(true)} className="gap-2">
                  <Sparkles className="h-4 w-4" /> Unlock Access
                </Button>
              </div>
            </div>
          )}
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

      {/* Post-first-search guidance modal */}
      <PostFirstSearchModal />
    </div>
  );
};

export default Index;
