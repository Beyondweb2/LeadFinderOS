import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { useWalkthroughStatus } from '@/hooks/useWalkthroughStatus';
import { supabase } from '@/integrations/supabase/client';
import { Flame, Target, Zap, Search, CreditCard, AlertTriangle, Sparkles, Lock, Loader2, RefreshCw, MapPin, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { Lead, Country } from '@/types/lead';

const FREE_SEARCH_LIMIT = 2;
const PAYWALL_COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
const SEARCH_COUNT_KEY = 'leadfinder_free_search_count';
const BLUR_KEY = 'leadfinder_blur_active';

function getPersistedSearchCount(userId?: string): number {
  try {
    const key = userId ? `${SEARCH_COUNT_KEY}_${userId}` : SEARCH_COUNT_KEY;
    const val = localStorage.getItem(key);
    return val ? parseInt(val, 10) : 0;
  } catch { return 0; }
}

function persistSearchCount(count: number, userId?: string) {
  try {
    const key = userId ? `${SEARCH_COUNT_KEY}_${userId}` : SEARCH_COUNT_KEY;
    localStorage.setItem(key, count.toString());
  } catch {}
}

function isBlurPersisted(userId?: string): boolean {
  try {
    const key = userId ? `${BLUR_KEY}_${userId}` : BLUR_KEY;
    return localStorage.getItem(key) === 'true';
  } catch { return false; }
}

function persistBlur(active: boolean, userId?: string) {
  try {
    const key = userId ? `${BLUR_KEY}_${userId}` : BLUR_KEY;
    if (active) localStorage.setItem(key, 'true');
    else localStorage.removeItem(key);
  } catch {}
}

const Index = () => {
  const location = useLocation();
  const { leads, isLoading, search, retryLastSearch, exportToCsv, trialLimitError, clearTrialLimitError, postAbandonExhausted, freeSearchExhausted, searchError, expanded } = useLeadSearchContext();
  const { addLead: addToOutreach, isInOutreach, leads: outreachLeads } = useOutreach();
  const { markAsChecked, isChecked } = useCheckedBusinesses();
  const { searchesUsed, shouldShowUpgradePrompt, checkTrial, isOnTrial, searchesRemaining, dailyLimit, isStripeTrialing, isLoading: isTrialLoading, demoSearchUsed, freeSearchCount } = useTrial();
  const { subscribed, isLoading: isSubscriptionLoading, status: subStatus, isPaidSubscriber } = useSubscription();
  const { session, user } = useAuth();
  const { walkthroughCompleted } = useWalkthroughStatus();
  const { toast } = useToast();

  // Pro access = active, past_due, admin, or trialing (Stripe trial)
  const hasProAccess = isPaidSubscriber || subStatus === 'trialing' || subStatus === 'past_due' || subStatus === 'admin' || isStripeTrialing;

  // Trigger challenge modal on first search page visit after walkthrough completion (only for subscribed users)
  useEffect(() => {
    if (!hasProAccess) return;
    const key = user?.id ? `challenge_10_pending_${user.id}` : 'challenge_10_pending';
    try {
      if (localStorage.getItem(key) === 'true') {
        localStorage.removeItem(key);
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('trigger-challenge-10-modal'));
        }, 500);
      }
    } catch {}
  }, [user?.id, hasProAccess]);
  
  const [lastSearchCountry, setLastSearchCountry] = useState<Country>('UK');
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [isCheckoutLoading] = useState(false);
  const [showUpgradeAfterLimit, setShowUpgradeAfterLimit] = useState(false);
  const [totalBusinessesFound, setTotalBusinessesFound] = useState(0);
  // Session-level dismissal tracking
  const [paywallDismissedThisSession, setPaywallDismissedThisSession] = useState(false);
  
  // Persisted search count and blur state
  const [localSearchCount, setLocalSearchCount] = useState(() => getPersistedSearchCount(user?.id));
  const [buttonExhausted, setButtonExhausted] = useState(() => isBlurPersisted(user?.id));
  // CTA swap only after results have loaded with blur
  const [ctaSwapped, setCtaSwapped] = useState(() => isBlurPersisted(user?.id));
  
  // Determine if still loading access status
  const isAccessLoading = isTrialLoading || isSubscriptionLoading;

  // Free user = not paid
  const isFreeUser = !hasProAccess;

  // Re-initialize from localStorage when user changes (sign-in/sign-out)
  useEffect(() => {
    const count = getPersistedSearchCount(user?.id);
    const blur = isBlurPersisted(user?.id);
    setLocalSearchCount(count);
    setButtonExhausted(blur);
    setCtaSwapped(blur);
  }, [user?.id]);

  // Initialize search count based on walkthrough completion — only if the user
  // actually performed a search during the walkthrough (freeSearchCount > 0 from DB).
  // If they skipped the walkthrough they should still get their 1 free search.
  useEffect(() => {
    if (walkthroughCompleted && isFreeUser && localSearchCount < 1 && freeSearchCount >= 1) {
      setLocalSearchCount(1);
      persistSearchCount(1, user?.id);
    }
  }, [walkthroughCompleted, isFreeUser, localSearchCount, freeSearchCount, user?.id]);


  // Free search exhausted — after 2nd search completes, block further searches
  const freeSearchesExhausted = isFreeUser && localSearchCount >= 1;

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

        // Swap CTA and show paywall after results load with blur
        if (buttonExhausted) {
          setCtaSwapped(true);
          setTimeout(() => setShowUpgradeAfterLimit(true), 100);
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
  const noWebsiteCount = leads.filter(l => l.websiteStatus === 'NO_WEBSITE' || l.websiteStatus === 'DIRECTORY_ONLY').length;

  // "Unlock Unlimited" button on search form now opens the modal instead of going to Stripe directly
  const handleUnlockClick = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) throw error;
      if (data?.url) window.open(data.url, '_blank');
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to start checkout', variant: 'destructive' });
    }
  }, [session?.access_token, toast]);

  // Handle search attempt
  const handleSearch = useCallback((filters: any) => {
    // If already exhausted, just show paywall
    if (isFreeUser && localSearchCount >= 1) {
      setShowUpgradeAfterLimit(true);
      return;
    }
    setLastSearchCountry(filters.country || 'UK');
    search(filters, false, false);
    if (isFreeUser) {
      const newCount = localSearchCount + 1;
      setLocalSearchCount(newCount);
      persistSearchCount(newCount, user?.id);
      // Flag first search for blur
      if (newCount >= 1) {
        setButtonExhausted(true);
        persistBlur(true, user?.id);
      }
    }
  }, [search, isFreeUser, localSearchCount, user?.id]);

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
            Find businesses without websites in any area. Search by business type and location, then add hot leads to your Outreach.
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
          searchesRemaining={Infinity}
          dailyLimit={Infinity}
          isPaidSubscriber={isAccessLoading || hasProAccess}
          disabled={postAbandonExhausted && !hasProAccess}
          isUpgradeLoading={isCheckoutLoading}
          onUpgrade={handleUnlockClick}
          freeSearchesExhausted={ctaSwapped && isFreeUser}
        />
      </section>

      {/* Search Error + Retry */}
      {searchError && !isLoading && (
        <div className="flex flex-col items-center gap-3 p-5 bg-destructive/10 border border-destructive/20 rounded-lg text-center">
          <p className="text-base font-semibold text-destructive">Search failed</p>
          <p className="text-sm text-muted-foreground">{searchError.message}</p>
          <p className="text-[11px] text-muted-foreground/60 font-mono">Error ID: {searchError.errorId}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={retryLastSearch} className="gap-2">
              <RefreshCw className="h-4 w-4" /> Retry
            </Button>
            <Button size="sm" variant="ghost" onClick={() => window.history.back()} className="gap-2">
              Go back
            </Button>
          </div>
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

      {/* Expanded search indicator */}
      {leads.length > 0 && expanded && noWebsiteCount >= 3 && (
        <div className="flex items-center gap-2 py-2 px-3 sm:px-4 bg-muted/30 border border-border/50 rounded-lg">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs sm:text-sm text-muted-foreground">
            Expanded to nearby areas to find more businesses without websites.
          </span>
        </div>
      )}

      {/* Fallback: expansion couldn't find 3 No Website leads */}
      {leads.length > 0 && expanded && noWebsiteCount < 3 && !isLoading && (
        <div className="flex flex-col gap-3 py-3 px-4 bg-muted/20 border border-border/40 rounded-lg">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <span className="text-xs sm:text-sm text-muted-foreground">
              We couldn't find 3 businesses without websites nearby for this search. Try a broader category for better results.
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {['Electrician', 'Plumber', 'Landscaper'].map((cat) => (
              <Button
                key={cat}
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={() => handleSearch({ keyword: cat, location: '', radius: 50000, country: lastSearchCountry })}
              >
                {cat}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Results Section */}
      {leads.length > 0 && (
        <section data-walkthrough="results-header">
          <div className="relative">
            {buttonExhausted && isFreeUser && (
              <div className="absolute top-[20%] left-0 right-0 z-20 flex justify-center pointer-events-none">
                <div className="flex flex-col items-center gap-3 text-center px-4 pointer-events-auto">
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
              blurred={buttonExhausted && isFreeUser}
            />
          </div>
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


    </div>
  );
};

export default Index;
