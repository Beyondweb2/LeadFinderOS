import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useSubscription } from './useSubscription';

const FREE_SEARCH_LIMIT = 5;

interface FreeAccessState {
  freeSearchCount: number;
  freeSearchLimit: number;
  isLoading: boolean;
  isFreeLimitReached: boolean;
}

export function useTrial() {
  const { user } = useAuth();
  const { status: stripeStatus, isLoading: isSubscriptionLoading, isPaidSubscriber, isAdmin } = useSubscription();
  
  const isStripeTrialing = stripeStatus === 'trialing';
  const hasProAccess = isPaidSubscriber || isStripeTrialing || isAdmin;
  
  const [state, setState] = useState<FreeAccessState>({
    freeSearchCount: 0,
    freeSearchLimit: FREE_SEARCH_LIMIT,
    isLoading: true,
    isFreeLimitReached: false,
  });
  
  const hasAttemptedEnsure = useRef(false);

  const ensureTrialRecord = useCallback(async (): Promise<boolean> => {
    if (!user?.id || hasAttemptedEnsure.current) return false;
    hasAttemptedEnsure.current = true;
    
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) return false;

      const affiliateCode = localStorage.getItem('leadfinder_affiliate_code') || undefined;
      const refSource = localStorage.getItem('leadfinder_ref_source') || undefined;

      const response = await supabase.functions.invoke('ensure-trial', {
        headers: { Authorization: `Bearer ${session.session.access_token}` },
        body: { affiliate_code: affiliateCode, ref_source: refSource },
      });

      if (response.error) {
        console.error('Error ensuring user record:', response.error);
        return false;
      }

      return response.data?.created === true;
    } catch (err) {
      console.error('Failed to ensure user record:', err);
      return false;
    }
  }, [user?.id]);

  const checkTrial = useCallback(async () => {
    if (!user?.id) {
      setState(prev => ({ ...prev, isLoading: false }));
      return;
    }

    try {
      const { data, error } = await supabase
        .from('user_trials')
        .select('free_search_count')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching user data:', error);
        setState(prev => ({ ...prev, isLoading: false }));
        return;
      }

      if (!data) {
        const created = await ensureTrialRecord();
        if (created) {
          setState({
            freeSearchCount: 0,
            freeSearchLimit: FREE_SEARCH_LIMIT,
            isLoading: false,
            isFreeLimitReached: false,
          });
          return;
        }
        
        setState({
          freeSearchCount: 0,
          freeSearchLimit: FREE_SEARCH_LIMIT,
          isLoading: false,
          isFreeLimitReached: false,
        });
        return;
      }

      const count = (data as any).free_search_count ?? 0;
      setState({
        freeSearchCount: count,
        freeSearchLimit: FREE_SEARCH_LIMIT,
        isLoading: false,
        isFreeLimitReached: count >= FREE_SEARCH_LIMIT,
      });
    } catch (err) {
      console.error('User data check failed:', err);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [user?.id, ensureTrialRecord]);

  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    const newUserId = user?.id ?? null;
    
    if (newUserId !== userIdRef.current) {
      userIdRef.current = newUserId;
      hasAttemptedEnsure.current = false;
      
      if (newUserId) {
        checkTrial();
      } else {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    }
  }, [user?.id, checkTrial]);

  const incrementSearchCount = useCallback(async () => {
    if (!user?.id) return;
    await checkTrial();
  }, [user?.id, checkTrial]);

  // Pro access users get unlimited searches — no limits shown
  if (hasProAccess) {
    return {
      ...state,
      isLoading: isSubscriptionLoading,
      isFreeLimitReached: false,
      freeSearchCount: 0,
      isStripeTrialing,
      checkTrial,
      incrementSearchCount,
      // Legacy compat — these are no longer used but prevent breakage
      isOnTrial: false,
      searchesRemaining: Infinity,
      dailyLimit: Infinity,
      searchesToday: 0,
      searchesUsed: 0,
      trialUsed: false,
      demoSearchUsed: false,
      shouldShowUpgradePrompt: () => false,
      SEARCHES_BEFORE_PROMPT: 5,
    };
  }

  if (isSubscriptionLoading) {
    return {
      ...state,
      isLoading: true,
      isStripeTrialing: false,
      checkTrial,
      incrementSearchCount,
      isOnTrial: false,
      searchesRemaining: Infinity,
      dailyLimit: Infinity,
      searchesToday: 0,
      searchesUsed: 0,
      trialUsed: false,
      demoSearchUsed: false,
      shouldShowUpgradePrompt: () => false,
      SEARCHES_BEFORE_PROMPT: 5,
    };
  }

  return {
    ...state,
    isStripeTrialing: false,
    checkTrial,
    incrementSearchCount,
    // Legacy compat
    isOnTrial: false,
    searchesRemaining: Infinity,
    dailyLimit: Infinity,
    searchesToday: 0,
    searchesUsed: 0,
    trialUsed: false,
    demoSearchUsed: false,
    shouldShowUpgradePrompt: () => false,
    SEARCHES_BEFORE_PROMPT: 5,
  };
}
