import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { SearchForm } from '@/components/SearchForm';
import { LeadsTable } from '@/components/LeadsTable';

import { TrialLimitDialog } from '@/components/TrialLimitDialog';
import { TrialConversionModal } from '@/components/TrialConversionModal';

import { useLeadSearchContext } from '@/contexts/LeadSearchContext';

import { useOutreach } from '@/hooks/useOutreach';
import { useCheckedBusinesses } from '@/hooks/useCheckedBusinesses';
import { useTrial } from '@/hooks/useTrial';
import { useSubscription } from '@/hooks/useSubscription';
import { useAuth } from '@/hooks/useAuth';
import { useWalkthroughStatus } from '@/hooks/useWalkthroughStatus';
import { supabase } from '@/integrations/supabase/client';
import { Flame, Target, Zap, Search, AlertTriangle, MapPin, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import type { Lead, Country } from '@/types/lead';

const Index = () => {
  const location = useLocation();
  const { leads, isLoading, search, retryLastSearch, exportToCsv, trialLimitError, clearTrialLimitError, postAbandonExhausted, freeSearchExhausted, searchError, expanded, gated } = useLeadSearchContext();
  const { addLead: addToOutreach, isInOutreach, leads: outreachLeads } = useOutreach();
  const { markAsChecked, isChecked } = useCheckedBusinesses();
  const { checkTrial, isStripeTrialing, isLoading: isTrialLoading, freeSearchCount } = useTrial();
  const { subscribed, isLoading: isSubscriptionLoading, status: subStatus, isPaidSubscriber } = useSubscription();
  const { session, user } = useAuth();
  const { walkthroughCompleted } = useWalkthroughStatus();
  const { toast } = useToast();

  // Pro access = active, past_due, admin, or trialing (Stripe trial)
  const hasProAccess = isPaidSubscriber || subStatus === 'trialing' || subStatus === 'past_due' || subStatus === 'admin' || isStripeTrialing;
  const isFreeUser = !hasProAccess;

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
  const [totalBusinessesFound, setTotalBusinessesFound] = useState(0);
  const [showConversionModal, setShowConversionModal] = useState(false);
  const [conversionModalShownThisSession, setConversionModalShownThisSession] = useState(false);

  // Ad-entry users without auth are always gated for actions (same as unsubscribed users)
  const isAdEntryGuest = !user && !hasProAccess;
  const effectiveGated = gated || isAdEntryGuest;

  // Guest search cap reached? Persist so it survives re-renders/navigation
  const GUEST_CAP_KEY = 'leadfinder_guest_cap_reached';
  const guestSearchesExhausted = useMemo(() => {
    if (!isAdEntryGuest) return false;
    if (trialLimitError) {
      try { localStorage.setItem(GUEST_CAP_KEY, '1'); } catch {}
      return true;
    }
    try { return localStorage.getItem(GUEST_CAP_KEY) === '1'; } catch { return false; }
  }, [isAdEntryGuest, trialLimitError]);

  // Count businesses without websites
  const noWebsiteCount = leads.filter(l => l.websiteStatus === 'NO_WEBSITE' || l.websiteStatus === 'DIRECTORY_ONLY').length;

  // Show conversion modal after first gated search results load
  useEffect(() => {
    if (!isLoading && leads.length > 0 && gated && !conversionModalShownThisSession) {
      checkTrial();
      setTotalBusinessesFound(prev => prev + leads.length);
      // Short delay so user sees results first
      const timer = setTimeout(() => {
        setShowConversionModal(true);
        setConversionModalShownThisSession(true);
      }, 4000);
      return () => clearTimeout(timer);
    }
    if (!isLoading && leads.length > 0 && !gated) {
      checkTrial();
      setTimeout(() => window.dispatchEvent(new CustomEvent('post-search-tip')), 300);
    }
  }, [isLoading, leads.length, gated, checkTrial, conversionModalShownThisSession]);

  // On mount/refresh: if cached leads exist and user is gated, show conversion modal
  useEffect(() => {
    if (leads.length > 0 && gated && isFreeUser && !conversionModalShownThisSession && !isSubscriptionLoading) {
      const timer = setTimeout(() => {
        setShowConversionModal(true);
        setConversionModalShownThisSession(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [leads.length, gated, isFreeUser, isSubscriptionLoading, conversionModalShownThisSession]);

  // Handle search attempt — unlimited for all users
  const handleSearch = useCallback((filters: any) => {
    setLastSearchCountry(filters.country || 'UK');
    search(filters, false, false);
  }, [search]);

  return (
    <div className="space-y-4 md:space-y-8">
      {/* Page Header */}
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
        </div>
      )}

      {/* Search Section */}
      <section>
        <SearchForm 
          onSearch={handleSearch} 
          isLoading={isLoading}
          isOnTrial={false}
          searchesRemaining={hasProAccess ? Infinity : 0}
          dailyLimit={hasProAccess ? Infinity : 0}
          isPaidSubscriber={hasProAccess}
          disabled={false}
          freeSearchesExhausted={guestSearchesExhausted}
          onUpgrade={() => setShowConversionModal(true)}
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
              Retry
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
          <LeadsTable 
            leads={leads} 
            onExport={exportToCsv}
            onAddToOutreach={(lead) => {
              if (!user && !effectiveGated) {
                setShowConversionModal(true);
                return;
              }
              return addToOutreach(lead, lastSearchCountry, 'no_website');
            }}
            isInOutreach={isInOutreach}
            onMapLinkClick={markAsChecked}
            isChecked={isChecked}
            gated={effectiveGated}
            onGatedAction={() => setShowConversionModal(true)}
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
        </section>
      )}

      {/* Trial Limit Dialog — only for authenticated users; guests use TrialConversionModal */}
      <TrialLimitDialog
        open={!!trialLimitError && !isAdEntryGuest}
        onOpenChange={(open) => !open && clearTrialLimitError()}
        searchesToday={trialLimitError?.searchesToday || 3}
        dailyLimit={trialLimitError?.limit || 3}
        totalBusinessesFound={totalBusinessesFound}
        noWebsiteCount={noWebsiteCount}
      />

      {/* Conversion Modal for gated users + guest search cap */}
      <TrialConversionModal
        open={showConversionModal}
        onOpenChange={(open) => {
          setShowConversionModal(open);
        }}
        noWebsiteCount={noWebsiteCount}
        contactedCount={0}
      />
    </div>
  );
};

export default Index;
