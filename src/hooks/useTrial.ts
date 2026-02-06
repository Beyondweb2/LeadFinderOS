import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface TrialState {
  isOnTrial: boolean;
  trialDaysRemaining: number;
  trialExpired: boolean;
  searchesUsed: number;
  isLoading: boolean;
}

const SEARCHES_BEFORE_PROMPT = 5;

export function useTrial() {
  const { user } = useAuth();
  const [state, setState] = useState<TrialState>({
    isOnTrial: false,
    trialDaysRemaining: 0,
    trialExpired: false,
    searchesUsed: 0,
    isLoading: true,
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
          isOnTrial: false,
          trialDaysRemaining: 0,
          trialExpired: true,
          searchesUsed: 0,
          isLoading: false,
        });
        return;
      }

      const trialStart = new Date(data.trial_started_at);
      const trialEnd = new Date(trialStart);
      trialEnd.setDate(trialEnd.getDate() + data.trial_days);
      
      const now = new Date();
      const daysRemaining = Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
      const expired = now > trialEnd;

      setState({
        isOnTrial: !expired,
        trialDaysRemaining: daysRemaining,
        trialExpired: expired,
        searchesUsed: data.searches_used,
        isLoading: false,
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
