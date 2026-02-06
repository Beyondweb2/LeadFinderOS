import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

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
}

const SEARCHES_BEFORE_PROMPT = 5;
const DAILY_TRIAL_LIMIT = 3;

export function useTrial() {
  const { user } = useAuth();
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
  });

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
        // No trial record - user might have been created before trial system
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
      });
    } catch (err) {
      console.error('Trial check failed:', err);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [user?.id]);

  useEffect(() => {
    checkTrial();
  }, [checkTrial]);

  const shouldShowUpgradePrompt = useCallback(() => {
    return state.searchesUsed > 0 && state.searchesUsed % SEARCHES_BEFORE_PROMPT === 0;
  }, [state.searchesUsed]);

  const incrementSearchCount = useCallback(async () => {
    if (!user?.id) return;
    
    // We can't update directly due to RLS, so we'll track this via edge function
    // For now, just refetch to get updated count from server
    await checkTrial();
  }, [user?.id, checkTrial]);

  return {
    ...state,
    checkTrial,
    shouldShowUpgradePrompt,
    incrementSearchCount,
    SEARCHES_BEFORE_PROMPT,
  };
}
