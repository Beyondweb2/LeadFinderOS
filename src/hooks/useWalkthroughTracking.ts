import { useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useLocation } from 'react-router-dom';

/**
 * Debounced walkthrough event tracker.
 * Only logs one event per user per step per 10-minute window.
 */
export function useWalkthroughTracking(isReplay: boolean) {
  const { user } = useAuth();
  const location = useLocation();
  const seenStepsRef = useRef<Map<number, number>>(new Map()); // step -> timestamp
  const DEBOUNCE_MS = 10 * 60 * 1000; // 10 minutes

  const logStepView = useCallback((step: number) => {
    if (!user?.id) return;
    const now = Date.now();
    const lastSeen = seenStepsRef.current.get(step);
    if (lastSeen && now - lastSeen < DEBOUNCE_MS) return;
    seenStepsRef.current.set(step, now);

    supabase.rpc('log_walkthrough_event' as any, {
      p_event_type: 'walkthrough_step_view',
      p_meta: {
        step,
        walkthrough_id: 'main',
        page: location.pathname,
        source: isReplay ? 'manual_restart' : 'auto',
      },
    }).then(({ error }: any) => {
      if (error) console.warn('[walkthrough-track] step view error:', error.message);
    });
  }, [user?.id, location.pathname, isReplay]);

  const logComplete = useCallback(() => {
    if (!user?.id) return;
    supabase.rpc('log_walkthrough_event' as any, {
      p_event_type: 'walkthrough_complete',
      p_meta: { walkthrough_id: 'main' },
    }).then(({ error }: any) => {
      if (error) console.warn('[walkthrough-track] complete error:', error.message);
    });
  }, [user?.id]);

  const logExit = useCallback((currentStep: number) => {
    if (!user?.id) return;
    supabase.rpc('log_walkthrough_event' as any, {
      p_event_type: 'walkthrough_exit',
      p_meta: { step: currentStep, walkthrough_id: 'main' },
    }).then(({ error }: any) => {
      if (error) console.warn('[walkthrough-track] exit error:', error.message);
    });
  }, [user?.id]);

  const resetTracking = useCallback(() => {
    seenStepsRef.current.clear();
  }, []);

  return { logStepView, logComplete, logExit, resetTracking };
}
