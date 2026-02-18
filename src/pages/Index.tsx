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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import type { Lead, Country } from '@/types/lead';

const Index = () => {
  const location = useLocation();
  const { leads, isLoading, search, exportToCsv, trialLimitError, clearTrialLimitError, postAbandonExhausted } = useLeadSearchContext();
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
  const [showPaywall, setShowPaywall] = useState(false);
  const [isCheckoutLoading, setIsCheckoutLoading] = useState(false);
  
  // Determine if still loading access status
  const isAccessLoading = isTrialLoading || isSubscriptionLoading;

  // Refetch trial data after search completes
  useEffect(() => {
    if (!isLoading && leads.length > 0) {
      checkTrial();
    }
  }, [isLoading, leads.length, checkTrial]);

  // Count businesses without websites
  const noWebsiteCount = leads.filter(l => l.websiteStatus === 'NO_WEBSITE').length;

  // Free user = not paid
  const isFreeUser = !hasProAccess;

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
          onSearch={(filters) => {
            // Block search if free searches exhausted and not paid
            if (isFreeUser && (freeSearchCount ?? 0) >= 5) {
              setShowPaywall(true);
              return;
            }
            setLastSearchCountry(filters.country || 'UK');
            search(filters, false, false);
          }} 
          isLoading={isLoading}
          isOnTrial={false}
          searchesRemaining={hasProAccess ? Infinity : Math.max(0, 5 - (freeSearchCount ?? 0))}
          dailyLimit={hasProAccess ? Infinity : 5}
          isPaidSubscriber={isAccessLoading || hasProAccess}
          disabled={postAbandonExhausted && !hasProAccess}
          isUpgradeLoading={isCheckoutLoading}
          onUpgrade={() => {
            const win = window.open('', '_blank');
            setIsCheckoutLoading(true);
            (async () => {
              try {
                const { data, error } = await supabase.functions.invoke('create-checkout', {
                  headers: { Authorization: `Bearer ${session?.access_token}` },
                });
                if (error) throw error;
                if (data?.url) {
                  if (win) win.location.href = data.url;
                  else window.location.href = data.url;
                  window.dispatchEvent(new CustomEvent('checkout-opened'));
                } else {
                  win?.close();
                }
              } catch (e) {
                win?.close();
                toast({ title: 'Error', description: 'Failed to start checkout', variant: 'destructive' });
              } finally {
                setIsCheckoutLoading(false);
              }
            })();
          }}
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


      {/* Paywall Dialog - shown when free searches exhausted */}
      <Dialog open={showPaywall} onOpenChange={setShowPaywall}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader className="text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Lock className="h-6 w-6 text-primary" />
            </div>
            <DialogTitle className="text-xl font-bold">Unlock unlimited access</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Upgrade to continue unlimited searches and keep building your pipeline.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col gap-2 sm:flex-col">
            <Button
              size="lg"
              className="w-full"
              disabled={isCheckoutLoading}
              onClick={() => {
                const win = window.open('', '_blank');
                setIsCheckoutLoading(true);
                (async () => {
                  try {
                    const { data, error } = await supabase.functions.invoke('create-checkout', {
                      headers: { Authorization: `Bearer ${session?.access_token}` },
                    });
                    if (error) throw error;
                    if (data?.url) {
                      if (win) win.location.href = data.url;
                      else window.location.href = data.url;
                      window.dispatchEvent(new CustomEvent('checkout-opened'));
                    } else {
                      win?.close();
                    }
                  } catch (e) {
                    win?.close();
                    toast({ title: 'Error', description: 'Failed to start checkout', variant: 'destructive' });
                  } finally {
                    setIsCheckoutLoading(false);
                  }
                })();
              }}
            >
              {isCheckoutLoading ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Starting...</>
              ) : (
                'Unlock unlimited — £19.99/month'
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center">Cancel anytime</p>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
