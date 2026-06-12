import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLocation } from 'react-router-dom';

export interface DemoChecklistState {
  searchDone: boolean;
  addedToCrm: boolean;
  crmAddCount: number;
  // Simplified: outreach intro popup shown & dismissed
  outreachIntroDone: boolean;
  // After outreach intro, user navigated to Track Leads
  viewedTrackLeads: boolean;
  // Legacy compat fields (unused but kept so old localStorage doesn't break parsing)
  firstContactMade: boolean;
  contactPanelClosed: boolean;
  threeContactsMade: boolean;
  contactsMadeCount: number;
  viewedProgress: boolean;
  noteAdded: boolean;
  trackStatusSet: boolean;
  nextActionSet: boolean;
  nextDateSet: boolean;
  cardCollapsed: boolean;
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

const STORAGE_PREFIX = 'demo_checklist_v5';

function getKey(userId?: string) {
  return userId ? `${STORAGE_PREFIX}_${userId}` : STORAGE_PREFIX;
}

const defaultState: DemoChecklistState = {
  searchDone: false,
  addedToCrm: false,
  crmAddCount: 0,
  outreachIntroDone: false,
  viewedTrackLeads: false,
  // Legacy compat
  firstContactMade: false,
  contactPanelClosed: false,
  threeContactsMade: false,
  contactsMadeCount: 0,
  viewedProgress: false,
  noteAdded: false,
  trackStatusSet: false,
  nextActionSet: false,
  nextDateSet: false,
  cardCollapsed: false,
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

// The simplified walkthrough has 4 steps:
// 1. Search for leads
// 2. Add to CRM
// 3. Outreach intro popup (auto-shown on outreach page)
// 4. Navigate to Track Leads
const TOTAL_STEPS = 4;

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
      if (user?.id) {
        try { localStorage.removeItem(`simulate_new_user_${user.id}`); } catch {}
      }
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
      localStorage.removeItem(`outreach_intro_shown_${user.id}`);
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
        const next = { ...prev, crmAddCount: newCount, addedToCrm: newCount >= 1 };
        saveState(next, user?.id);
        return next;
      });
    };

    const onCrmPurged = () => {
      setState(prev => {
        const newCount = Math.max(0, prev.crmAddCount - 1);
        const next = { ...prev, crmAddCount: newCount, addedToCrm: newCount >= 1 };
        saveState(next, user?.id);
        return next;
      });
    };

    const onOutreachIntroDismissed = () => completeStep('outreachIntroDone');

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

    window.addEventListener('demo-checklist-search', onSearch);
    window.addEventListener('crm-lead-added', onCrmAdd);
    window.addEventListener('crm-lead-purged', onCrmPurged);
    window.addEventListener('outreach-intro-dismissed', onOutreachIntroDismissed);
    window.addEventListener('quick-locations-toggle', onQuickLocToggle);

    return () => {
      window.removeEventListener('demo-checklist-search', onSearch);
      window.removeEventListener('crm-lead-added', onCrmAdd);
      window.removeEventListener('crm-lead-purged', onCrmPurged);
      window.removeEventListener('outreach-intro-dismissed', onOutreachIntroDismissed);
      window.removeEventListener('quick-locations-toggle', onQuickLocToggle);
    };
  }, [isDemoUser, isReplay, completeStep, isOpen]);

  // Complete viewedTrackLeads when user visits /potential-work
  useEffect(() => {
    if (!isDemoUser && !isReplay) return;
    if (location.pathname === '/potential-work') {
      completeStep('viewedTrackLeads');
    }
  }, [isDemoUser, isReplay, location.pathname, completeStep]);

  const completedCount = [
    state.searchDone,
    state.addedToCrm,
    state.outreachIntroDone,
    state.viewedTrackLeads,
  ].filter(Boolean).length;

  const allDone = completedCount === TOTAL_STEPS;

  const allDoneRef = useRef(false);
  // When walkthrough completes, set a pending flag instead of firing immediately
  useEffect(() => {
    if (allDone && !allDoneRef.current) {
      allDoneRef.current = true;
      if (user?.id) {
        try { localStorage.removeItem(`simulate_new_user_${user.id}`); } catch {}
      }
      if (isReplay) {
        setIsOpen(false);
        setIsReplay(false);
      } else {
        // Mark walkthrough as complete
        if (user?.id) {
          try {
            localStorage.setItem(`walkthrough_completed_${user.id}`, 'true');
            localStorage.setItem(`demo_walkthrough_dismissed_${user.id}`, 'true');
            // Set pending flag — completion popup will show on next visit to /find-leads or /outreach
            localStorage.setItem(`walkthrough_completion_pending_${user.id}`, 'true');
          } catch {}
        }
        window.dispatchEvent(new CustomEvent('walkthrough-dismissed'));
      }
    }
  }, [allDone, isReplay, user?.id]);

  // Fire walkthrough-all-done when user navigates to /find-leads or /outreach AFTER completion
  useEffect(() => {
    if (!user?.id) return;
    const pendingKey = `walkthrough_completion_pending_${user.id}`;
    try {
      if (localStorage.getItem(pendingKey) !== 'true') return;
      if (location.pathname === '/find-leads' || location.pathname === '/outreach') {
        localStorage.removeItem(pendingKey);
        // Small delay so the page renders first
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('walkthrough-all-done'));
        }, 600);
      }
    } catch {}
  }, [location.pathname, user?.id]);

  return (
    <DemoChecklistContext.Provider value={{
      state,
      completedCount,
      totalSteps: TOTAL_STEPS,
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
  totalSteps: TOTAL_STEPS,
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
