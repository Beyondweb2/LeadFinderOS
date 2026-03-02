import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

export interface DemoChecklistState {
  searchDone: boolean;
  addedToCrm: boolean;
  crmAddCount: number;
  firstContactMade: boolean;
  threeContactsMade: boolean;
  contactsMadeCount: number;
  viewedProgress: boolean;
  noteAdded: boolean;
  trackStatusSet: boolean;
  nextActionSet: boolean;
  nextDateSet: boolean;
  cardCollapsed: boolean;
  // Legacy compat fields (unused but kept so old localStorage doesn't break parsing)
  contactAttempted: boolean;
  crmPageOpened: boolean;
  trackPressed: boolean;
  leadTracked: boolean;
}

interface DemoChecklistContextType {
  state: DemoChecklistState;
  completedCount: number;
  totalSteps: number;
  allDone: boolean;
  completeStep: (step: keyof DemoChecklistState) => void;
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  isDemoUser: boolean;
  isReplay: boolean;
  resetWalkthrough: () => void;
}

const DemoChecklistContext = createContext<DemoChecklistContextType | null>(null);

const STORAGE_PREFIX = 'demo_checklist_v4';

function getKey(userId?: string) {
  return userId ? `${STORAGE_PREFIX}_${userId}` : STORAGE_PREFIX;
}

const defaultState: DemoChecklistState = {
  searchDone: false,
  addedToCrm: false,
  crmAddCount: 0,
  firstContactMade: false,
  threeContactsMade: false,
  contactsMadeCount: 0,
  viewedProgress: false,
  noteAdded: false,
  trackStatusSet: false,
  nextActionSet: false,
  nextDateSet: false,
  cardCollapsed: false,
  // Legacy compat
  contactAttempted: false,
  crmPageOpened: false,
  trackPressed: false,
  leadTracked: false,
};

function loadState(userId?: string): DemoChecklistState {
  try {
    const raw = localStorage.getItem(getKey(userId));
    if (raw) return { ...defaultState, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...defaultState };
}

function saveState(state: DemoChecklistState, userId?: string) {
  try {
    localStorage.setItem(getKey(userId), JSON.stringify(state));
  } catch { /* ignore */ }
}

export function DemoChecklistProvider({
  children,
  isDemoUser,
}: {
  children: React.ReactNode;
  isDemoUser: boolean;
}) {
  const { user } = useAuth();
  const location = useLocation();
  const [state, setState] = useState<DemoChecklistState>(() => loadState(user?.id));
  const [isOpen, setIsOpen] = useState(false);
  const [isReplay, setIsReplay] = useState(false);
  const initializedRef = useRef(false);

  useEffect(() => {
    setState(loadState(user?.id));
  }, [user?.id]);

  // Auto-open walkthrough when isDemoUser
  useEffect(() => {
    if (!isDemoUser) return;

    const onStart = () => {
      initializedRef.current = true;
      setIsOpen(true);
    };
    const onSkip = () => {
      initializedRef.current = true;
      allDoneRef.current = true;
      setIsOpen(false);
      setIsReplay(false);
    };
    window.addEventListener('start-walkthrough', onStart);
    window.addEventListener('skip-walkthrough', onSkip);

    if (!initializedRef.current) {
      const timer = setTimeout(() => {
        if (!initializedRef.current && !(window as any).__welcomeModalActive) {
          initializedRef.current = true;
          setIsOpen(true);
        }
      }, 2500);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('start-walkthrough', onStart);
        window.removeEventListener('skip-walkthrough', onSkip);
      };
    }

    return () => {
      window.removeEventListener('start-walkthrough', onStart);
      window.removeEventListener('skip-walkthrough', onSkip);
    };
  }, [isDemoUser]);

  const completeStep = useCallback((step: keyof DemoChecklistState) => {
    setState(prev => {
      if (prev[step]) return prev;
      const next = { ...prev, [step]: true };
      saveState(next, user?.id);
      return next;
    });
  }, [user?.id]);

  const resetWalkthrough = useCallback(() => {
    const fresh = { ...defaultState };
    setState(fresh);
    saveState(fresh, user?.id);
    setIsReplay(true);
    setIsOpen(true);
    allDoneRef.current = false;
    if (user?.id) {
      localStorage.removeItem(`demo_walkthrough_dismissed_${user.id}`);
      localStorage.removeItem(`walkthrough_completed_${user.id}`);
    }
    window.dispatchEvent(new CustomEvent('start-walkthrough'));
  }, [user?.id]);

  // Event listeners
  useEffect(() => {
    if (!isDemoUser && !isReplay) return;

    const onSearch = () => completeStep('searchDone');

    const onCrmAdd = () => {
      setState(prev => {
        const newCount = prev.crmAddCount + 1;
        const next = { ...prev, crmAddCount: newCount, addedToCrm: newCount >= 3 };
        saveState(next, user?.id);
        return next;
      });
    };

    const onCrmPurged = () => {
      setState(prev => {
        const newCount = Math.max(0, prev.crmAddCount - 1);
        const next = { ...prev, crmAddCount: newCount, addedToCrm: newCount >= 3 };
        saveState(next, user?.id);
        return next;
      });
    };

    // Single handler for contact events (used by demo-checklist-contact only)
    const onContact = () => {
      setState(prev => {
        const newCount = prev.contactsMadeCount + 1;
        const next = {
          ...prev,
          contactsMadeCount: newCount,
          firstContactMade: newCount >= 1,
          threeContactsMade: newCount >= 3,
          contactAttempted: true,
        };
        saveState(next, user?.id);
        return next;
      });
    };



    const onNoteSaved = () => completeStep('noteAdded');

    const onTrackStatusChanged = () => completeStep('trackStatusSet');
    const onNextActionSet = () => completeStep('nextActionSet');
    const onNextDateSet = () => completeStep('nextDateSet');

    const onCardCollapsed = () => completeStep('cardCollapsed');

    const onTelClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a[href^="tel:"]');
      if (anchor) onContact();
    };

    // Skip contact steps entirely (user skipped tips dialog)
    const onSkipContactSteps = () => {
      setState(prev => {
        const next = {
          ...prev,
          firstContactMade: true,
          threeContactsMade: true,
          contactsMadeCount: Math.max(prev.contactsMadeCount, 3),
          contactAttempted: true,
        };
        saveState(next, user?.id);
        return next;
      });
    };

    const onTrackPressed = () => completeStep('trackPressed');

    window.addEventListener('demo-checklist-search', onSearch);
    window.addEventListener('crm-lead-added', onCrmAdd);
    window.addEventListener('crm-lead-purged', onCrmPurged);
    window.addEventListener('demo-checklist-contact', onContact);
    
    window.addEventListener('walkthrough-skip-contact-steps', onSkipContactSteps);
    window.addEventListener('demo-checklist-track-note-saved', onNoteSaved);
    window.addEventListener('demo-checklist-track-pressed', onTrackPressed);
    window.addEventListener('demo-checklist-track-status-changed', onTrackStatusChanged);
    window.addEventListener('demo-checklist-next-action-set', onNextActionSet);
    window.addEventListener('demo-checklist-next-date-set', onNextDateSet);
    window.addEventListener('demo-checklist-card-collapsed', onCardCollapsed);
    document.addEventListener('click', onTelClick, true);

    // Hide walkthrough panel while Quick Locations dropdown is open
    let panelWasOpen = false;
    const onQuickLocToggle = (e: Event) => {
      const open = (e as CustomEvent).detail?.open;
      if (open) {
        panelWasOpen = isOpen;
        setIsOpen(false);
      } else {
        if (panelWasOpen) {
          setTimeout(() => setIsOpen(true), 150);
        }
      }
    };
    window.addEventListener('quick-locations-toggle', onQuickLocToggle);

    return () => {
      window.removeEventListener('demo-checklist-search', onSearch);
      window.removeEventListener('crm-lead-added', onCrmAdd);
      window.removeEventListener('crm-lead-purged', onCrmPurged);
      window.removeEventListener('demo-checklist-contact', onContact);
      
      window.removeEventListener('walkthrough-skip-contact-steps', onSkipContactSteps);
      window.removeEventListener('demo-checklist-track-note-saved', onNoteSaved);
      window.removeEventListener('demo-checklist-track-pressed', onTrackPressed);
      window.removeEventListener('demo-checklist-track-status-changed', onTrackStatusChanged);
      window.removeEventListener('demo-checklist-next-action-set', onNextActionSet);
      window.removeEventListener('demo-checklist-next-date-set', onNextDateSet);
      window.removeEventListener('demo-checklist-card-collapsed', onCardCollapsed);
      document.removeEventListener('click', onTelClick, true);
      window.removeEventListener('quick-locations-toggle', onQuickLocToggle);
    };
  }, [isDemoUser, isReplay, completeStep, isOpen]);

  // Step 5: Complete "viewedProgress" when user visits /potential-work
  useEffect(() => {
    if (!isDemoUser && !isReplay) return;
    if (location.pathname === '/potential-work') {
      completeStep('viewedProgress');
      // Legacy compat
      completeStep('leadTracked');
    }
  }, [isDemoUser, isReplay, location.pathname, completeStep]);

  // 10 steps (merged contact steps 3+4 into one)
  const completedCount = [
    state.searchDone,
    state.addedToCrm,
    state.threeContactsMade,
    state.trackPressed,
    state.viewedProgress,
    state.noteAdded,
    state.trackStatusSet,
    state.nextActionSet,
    state.nextDateSet,
    state.cardCollapsed,
  ].filter(Boolean).length;

  const allDone = completedCount === 10;

  const allDoneRef = useRef(false);
  useEffect(() => {
    if (allDone && !allDoneRef.current) {
      allDoneRef.current = true;
      Promise.resolve(supabase.rpc('log_walkthrough_event' as any, {
        p_event_type: 'walkthrough_complete',
        p_meta: { walkthrough_id: 'main' },
      })).catch(() => {});
      if (isReplay) {
        setIsOpen(false);
        setIsReplay(false);
      } else {
        window.dispatchEvent(new CustomEvent('walkthrough-all-done'));
      }
    }
  }, [allDone, isReplay]);

  return (
    <DemoChecklistContext.Provider value={{
      state,
      completedCount,
      totalSteps: 10,
      allDone,
      completeStep,
      isOpen,
      setIsOpen,
      isDemoUser,
      isReplay,
      resetWalkthrough,
    }}>
      {children}
    </DemoChecklistContext.Provider>
  );
}

const fallback: DemoChecklistContextType = {
  state: defaultState,
  completedCount: 0,
  totalSteps: 10,
  allDone: false,
  completeStep: () => {},
  isOpen: false,
  setIsOpen: () => {},
  isDemoUser: false,
  isReplay: false,
  resetWalkthrough: () => {},
};

export function useDemoChecklist() {
  const ctx = useContext(DemoChecklistContext);
  return ctx ?? fallback;
}
