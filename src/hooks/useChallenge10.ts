import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface Challenge10State {
  enabled: boolean;
  started_at: string | null;
  completed_at: string | null;
  count: number;
  completed: boolean;
  skipped: boolean;
  modal_shown: boolean;
}

const DEFAULT_STATE: Challenge10State = {
  enabled: false,
  started_at: null,
  completed_at: null,
  count: 0,
  completed: false,
  skipped: false,
  modal_shown: false,
};

// Feature flag — can be toggled server-side in future
const CHALLENGE_10_ENABLED = true;

export function useChallenge10() {
  const { user } = useAuth();
  const [state, setState] = useState<Challenge10State>(DEFAULT_STATE);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);
  const fetchedRef = useRef(false);
  const incrementLockRef = useRef(false);

  // Fetch challenge state from DB
  const fetchState = useCallback(async () => {
    if (!user?.id || !CHALLENGE_10_ENABLED) {
      setIsLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('user_challenges_10_outreach')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (data) {
      setState(data as Challenge10State);
    }
    // If no row exists, that's fine — user hasn't been offered the challenge yet
    setIsLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchState();
  }, [fetchState]);

  // Reset on user change
  useEffect(() => {
    if (!user?.id) {
    setState(DEFAULT_STATE);
    fetchedRef.current = false;
    setIsLoading(false);
    }
  }, [user?.id]);

  // Show the challenge modal (called externally when walkthrough completes for the first time)
  const triggerModal = useCallback(async () => {
    if (!user?.id || !CHALLENGE_10_ENABLED) return;
    if (state.modal_shown) return; // Already shown once

    // Upsert the row to mark modal_shown
    const { error } = await supabase
      .from('user_challenges_10_outreach')
      .upsert({
        user_id: user.id,
        modal_shown: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (!error) {
      setState(prev => ({ ...prev, modal_shown: true }));
      setShowModal(true);
    }
  }, [user?.id, state.modal_shown]);

  // Start the challenge
  const startChallenge = useCallback(async () => {
    if (!user?.id) return;

    const now = new Date().toISOString();
    const { error } = await supabase
      .from('user_challenges_10_outreach')
      .upsert({
        user_id: user.id,
        enabled: true,
        started_at: now,
        skipped: false,
        modal_shown: true,
        updated_at: now,
      }, { onConflict: 'user_id' });

    if (!error) {
      setState(prev => ({
        ...prev,
        enabled: true,
        started_at: now,
        skipped: false,
        modal_shown: true,
      }));
    }
    setShowModal(false);
  }, [user?.id]);

  // Skip the challenge
  const skipChallenge = useCallback(async () => {
    if (!user?.id) return;

    const now = new Date().toISOString();
    const { error } = await supabase
      .from('user_challenges_10_outreach')
      .upsert({
        user_id: user.id,
        skipped: true,
        modal_shown: true,
        updated_at: now,
      }, { onConflict: 'user_id' });

    if (!error) {
      setState(prev => ({ ...prev, skipped: true, modal_shown: true }));
    }
    setShowModal(false);
  }, [user?.id]);

  // Record a contact — server-side dedupe + atomic increment
  const recordContact = useCallback(async (leadId: string) => {
    if (!user?.id || !CHALLENGE_10_ENABLED) return;
    if (!state.enabled || !state.started_at || state.completed) return;
    if (incrementLockRef.current) return; // Prevent rapid double-taps

    incrementLockRef.current = true;

    try {
      const { data, error } = await supabase.rpc('challenge_10_record_contact', {
        p_lead_id: leadId,
      });

      if (!error && data) {
        const result = data as { incremented: boolean; count: number; completed: boolean };
        setState(prev => ({
          ...prev,
          count: result.count,
          completed: result.completed,
          completed_at: result.completed ? new Date().toISOString() : prev.completed_at,
        }));

        if (result.completed && !state.completed) {
          setJustCompleted(true);
        }
      }
    } catch (err) {
      console.error('Challenge record contact failed:', err);
    } finally {
      incrementLockRef.current = false;
    }
  }, [user?.id, state.enabled, state.started_at, state.completed]);

  const dismissCompletion = useCallback(() => {
    setJustCompleted(false);
  }, []);

  const dismissModal = useCallback(() => {
    setShowModal(false);
  }, []);

  return {
    // State
    isActive: CHALLENGE_10_ENABLED && state.enabled && !!state.started_at && !state.completed,
    isCompleted: state.completed,
    isSkipped: state.skipped && !state.enabled,
    count: state.count,
    modalShown: state.modal_shown,
    isLoading,
    featureEnabled: CHALLENGE_10_ENABLED,

    // Modal
    showModal,
    triggerModal,
    dismissModal,

    // Actions
    startChallenge,
    skipChallenge,
    recordContact,

    // Completion
    justCompleted,
    dismissCompletion,
  };
}
