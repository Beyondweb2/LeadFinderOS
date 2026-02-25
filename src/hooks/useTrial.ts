import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useSubscription } from './useSubscription';

interface TrialState {
  planStatus: 'trial' | 'active' | 'expired' | 'cancelled' | null;
  isOnTrial: boolean;
  trialDaysRemaining: number;
  trialExpired: boolean;
  trialStartDate: string | null;
  trialEndDate: string | null;
  searchesToday: number;
  searchesUsed: number;
  isLoading: boolean;
  dailyLimit: number;
  searchesRemaining: number;
  isStripeTrialing: boolean;
  trialUsed: boolean;
  demoSearchUsed: boolean;
  freeSearchCount: number;
}

const SEARCHES_BEFORE_PROMPT = 3;
const DAILY_TRIAL_LIMIT = 2;

export function useTrial() {
  const { user } = useAuth();
  const { status: stripeStatus, isLoading: isSubscriptionLoading, subscribed, isPaidSubscriber, isAdmin } = useSubscription();
  
  // Pro access includes trialing users and admins — they get unlimited searches
  const isStripeTrialing = stripeStatus === 'trialing';
  const hasProAccess = isPaidSubscriber || isStripeTrialing || isAdmin;
  // Pro access includes trialing users and admins — they get unlimited searches
  
  const [state, setState] = useState<TrialState>({
    planStatus: null,
    isOnTrial: false,
    trialDaysRemaining: 0,
    trialExpired: false,
    trialStartDate: null,
    trialEndDate: null,
    searchesToday: 0,
    searchesUsed: 0,
    isLoading: true,
    dailyLimit: DAILY_TRIAL_LIMIT,
    searchesRemaining: DAILY_TRIAL_LIMIT,
    isStripeTrialing: false,
    trialUsed: false,
    demoSearchUsed: false,
    freeSearchCount: 0,
  });
  
  const hasAttemptedEnsure = useRef(false);

  const ensureTrialRecord = useCallback(async (): Promise<boolean> => {
    if (!user?.id || hasAttemptedEnsure.current) return false;
    hasAttemptedEnsure.current = true;
    
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) return false;

      // Retrieve affiliate code and ref source from localStorage
      const affiliateCode = localStorage.getItem('leadfinder_affiliate_code') || undefined;
      const refSource = localStorage.getItem('leadfinder_ref_source') || undefined;

      const response = await supabase.functions.invoke('ensure-trial', {
        headers: {
          Authorization: `Bearer ${session.session.access_token}`,
        },
        body: { affiliate_code: affiliateCode, ref_source: refSource },
      });

      if (response.error) {
        console.error('Error ensuring trial:', response.error);
        return false;
      }

      return response.data?.created === true;
    } catch (err) {
      console.error('Failed to ensure trial:', err);
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
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching trial:', error);
        setState(prev => ({ ...prev, isLoading: false }));
        return;
      }

      if (!data) {
        // No trial record - attempt to create one
        const created = await ensureTrialRecord();
        if (created) {
          // Refetch after creation
          const { data: newData } = await supabase
            .from('user_trials')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();
          
          if (newData) {
            const now = new Date();
            const trialEnd = new Date(newData.trial_end_date);
            // Calculate days remaining - include current day (so day 1 shows as 7 days left)
            const msRemaining = trialEnd.getTime() - now.getTime();
            const daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
            
            setState({
              planStatus: 'trial',
              isOnTrial: true,
              trialDaysRemaining: daysRemaining,
              trialExpired: false,
              trialStartDate: newData.trial_started_at,
              trialEndDate: newData.trial_end_date,
              searchesToday: newData.searches_today,
              searchesUsed: newData.searches_used,
              isLoading: false,
              dailyLimit: DAILY_TRIAL_LIMIT,
              searchesRemaining: Math.max(0, DAILY_TRIAL_LIMIT - newData.searches_today),
              isStripeTrialing: false,
              trialUsed: newData.trial_used === true,
              demoSearchUsed: (newData as any).demo_search_used === true,
              freeSearchCount: (newData as any).free_search_count ?? 0,
            });
            return;
          }
        }
        
        // Still no data after attempt - treat as expired
        setState({
          planStatus: 'expired',
          isOnTrial: false,
          trialDaysRemaining: 0,
          trialExpired: true,
          trialStartDate: null,
          trialEndDate: null,
          searchesToday: 0,
          searchesUsed: 0,
          isLoading: false,
          dailyLimit: DAILY_TRIAL_LIMIT,
          searchesRemaining: 0,
          isStripeTrialing: false,
          trialUsed: false,
          demoSearchUsed: false,
          freeSearchCount: 0,
        });
        return;
      }

      const now = new Date();
      const trialEnd = new Date(data.trial_end_date);
      const daysRemaining = Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      const expired = now > trialEnd;
      const planStatus = expired ? 'expired' : (data.plan_status as TrialState['planStatus']);

      const searchesRemaining = Math.max(0, DAILY_TRIAL_LIMIT - data.searches_today);

      setState({
        planStatus,
        isOnTrial: planStatus === 'trial' && !expired,
        trialDaysRemaining: daysRemaining,
        trialExpired: expired,
        trialStartDate: data.trial_started_at,
        trialEndDate: data.trial_end_date,
        searchesToday: data.searches_today,
        searchesUsed: data.searches_used,
        isLoading: false,
        dailyLimit: DAILY_TRIAL_LIMIT,
        searchesRemaining,
        isStripeTrialing: false,
        trialUsed: data.trial_used === true,
        demoSearchUsed: (data as any).demo_search_used === true,
        freeSearchCount: (data as any).free_search_count ?? 0,
      });
    } catch (err) {
      console.error('Trial check failed:', err);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [user?.id, ensureTrialRecord]);

  // Stabilize user ID to prevent effect re-runs
  const userIdRef = useRef<string | null>(null);

  useEffect(() => {
    const newUserId = user?.id ?? null;
    
    // Only trigger if user ID actually changed
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

  const shouldShowUpgradePrompt = useCallback(() => {
    return state.searchesUsed > 0 && state.searchesUsed % SEARCHES_BEFORE_PROMPT === 0;
  }, [state.searchesUsed]);

  const incrementSearchCount = useCallback(async () => {
    if (!user?.id) return;
    
    // We can't update directly due to RLS, so we'll track this via edge function
    // For now, just refetch to get updated count from server
    await checkTrial();
  }, [user?.id, checkTrial]);

  // Pro access users (active, past_due, OR trialing) get unlimited searches
  if (hasProAccess) {
    return {
      ...state,
      isOnTrial: false,
      isStripeTrialing,
      searchesRemaining: Infinity,
      dailyLimit: Infinity,
      freeSearchCount: state.freeSearchCount ?? 0,
      isLoading: isSubscriptionLoading,
      checkTrial,
      shouldShowUpgradePrompt: () => false,
      incrementSearchCount,
      SEARCHES_BEFORE_PROMPT,
    };
  }

  // Still loading subscription status - don't show trial UI yet
  if (isSubscriptionLoading) {
    return {
      ...state,
      isOnTrial: false,
      isLoading: true,
      searchesRemaining: state.searchesRemaining,
      dailyLimit: state.dailyLimit,
      isStripeTrialing: false,
      checkTrial,
      shouldShowUpgradePrompt: () => false,
      incrementSearchCount,
      SEARCHES_BEFORE_PROMPT,
    };
  }

  return {
    ...state,
    isStripeTrialing: false,
    checkTrial,
    shouldShowUpgradePrompt,
    incrementSearchCount,
    SEARCHES_BEFORE_PROMPT,
  };
}
