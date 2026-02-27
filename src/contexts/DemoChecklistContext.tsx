import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLocation } from 'react-router-dom';

export interface DemoChecklistState {
  searchDone: boolean;
  addedToCrm: boolean;
  crmAddCount: number;
  crmPageOpened: boolean;
  contactAttempted: boolean;
  contactMethodSet: boolean;
  pipelineStatusSet: boolean;
  statusChanged: boolean;
  step4ActionSet: boolean;
  step4DateSet: boolean;
  trackPressed: boolean;
  statusUpdated: boolean; // derived: contactMethodSet && pipelineStatusSet && step4ActionSet
  leadTracked: boolean;
  noteAdded: boolean;
  trackStatusChanged: boolean;
  cardCollapsed: boolean;
  followUpActionSet: boolean;
  followUpDateSet: boolean;
  followUpNoteAdded: boolean;
  followUpStatusChanged: boolean;
  followUpSet: boolean;
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
}

const DemoChecklistContext = createContext<DemoChecklistContextType | null>(null);

const STORAGE_PREFIX = 'demo_checklist_v3';

function getKey(userId?: string) {
  return userId ? `${STORAGE_PREFIX}_${userId}` : STORAGE_PREFIX;
}

const defaultState: DemoChecklistState = {
  searchDone: false, addedToCrm: false, crmAddCount: 0, crmPageOpened: false,
  contactAttempted: false, contactMethodSet: false, pipelineStatusSet: false,
  statusChanged: false, step4ActionSet: false, step4DateSet: false,
  trackPressed: false, statusUpdated: false, leadTracked: false, noteAdded: false,
  trackStatusChanged: false, cardCollapsed: false,
  // Legacy fields kept for backwards compat
  followUpActionSet: false, followUpDateSet: false, followUpNoteAdded: false,
  followUpStatusChanged: false, followUpSet: false,
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
  const initializedRef = useRef(false);

  useEffect(() => {
    setState(loadState(user?.id));
  }, [user?.id]);

  // Auto-open walkthrough when isDemoUser — but defer if welcome modal might show
  // Listen for explicit 'start-walkthrough' event from welcome modal
  useEffect(() => {
    if (!isDemoUser) return;

    const onStart = () => {
      initializedRef.current = true;
      setIsOpen(true);
    };
    const onSkip = () => {
      initializedRef.current = true;
      setIsOpen(false);
    };
    window.addEventListener('start-walkthrough', onStart);
    window.addEventListener('skip-walkthrough', onSkip);

    // For returning users who already saw the prompt, auto-open after delay
    // (the welcome modal won't render for them)
    if (!initializedRef.current) {
      const timer = setTimeout(() => {
        // Don't auto-open if welcome modal is active
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

  // Event listeners
  useEffect(() => {
    if (!isDemoUser) return;

    const onSearch = () => completeStep('searchDone');
    const onCrmAdd = () => {
      setState(prev => {
        const newCount = prev.crmAddCount + 1;
        const next = { ...prev, crmAddCount: newCount, addedToCrm: newCount >= 3 };
        saveState(next, user?.id);
        return next;
      });
    };
    const onContact = () => completeStep('contactAttempted');
    const onContactMethod = () => {
      setState(prev => {
        if (prev.contactMethodSet) return prev;
        const next = { ...prev, contactMethodSet: true, statusUpdated: prev.pipelineStatusSet && prev.step4ActionSet };
        saveState(next, user?.id);
        return next;
      });
    };
    const onPipelineStatus = () => {
      setState(prev => {
        if (prev.pipelineStatusSet) return prev;
        const next = { ...prev, pipelineStatusSet: true, statusUpdated: prev.contactMethodSet && prev.step4ActionSet };
        saveState(next, user?.id);
        return next;
      });
    };
    const onStatus = () => {
      setState(prev => {
        if (prev.statusChanged) return prev;
        const next = { ...prev, statusChanged: true, statusUpdated: prev.contactMethodSet && prev.pipelineStatusSet && prev.step4ActionSet };
        saveState(next, user?.id);
        return next;
      });
    };
    const onStep4Action = () => {
      setState(prev => {
        if (prev.step4ActionSet) return prev;
        const next = { ...prev, step4ActionSet: true, statusUpdated: prev.contactMethodSet && prev.pipelineStatusSet };
        saveState(next, user?.id);
        return next;
      });
    };
    const onStep4Date = () => {
      setState(prev => {
        if (prev.step4DateSet) return prev;
        const next = { ...prev, step4DateSet: true };
        saveState(next, user?.id);
        return next;
      });
    };
    const onTrack = () => {
      setState(prev => {
        if (prev.trackPressed) return prev;
        const next = { ...prev, trackPressed: true };
        saveState(next, user?.id);
        return next;
      });
    };
    const onOpenTrackLeads = () => completeStep('leadTracked');
    const onFollowUpAction = () => {
      setState(prev => {
        if (prev.followUpActionSet) return prev;
        const next = { ...prev, followUpActionSet: true, followUpSet: prev.followUpDateSet };
        saveState(next, user?.id);
        return next;
      });
    };
    const onFollowUpDate = () => {
      setState(prev => {
        if (prev.followUpDateSet) return prev;
        const next = { ...prev, followUpDateSet: true, followUpSet: prev.followUpActionSet };
        saveState(next, user?.id);
        return next;
      });
    };
    const onFollowUpNote = () => {
      setState(prev => {
        if (prev.followUpNoteAdded) return prev;
        const next = { ...prev, followUpNoteAdded: true };
        saveState(next, user?.id);
        return next;
      });
    };
    const onFollowUpStatus = () => {
      setState(prev => {
        if (prev.followUpStatusChanged) return prev;
        const next = { ...prev, followUpStatusChanged: true };
        saveState(next, user?.id);
        return next;
      });
    };
    const onNoteSaved = () => {
      completeStep('noteAdded');
    };
    const onTrackStatusChanged = () => {
      completeStep('trackStatusChanged');
    };

    const onTelClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a[href^="tel:"]');
      if (anchor) completeStep('contactAttempted');
    };

    window.addEventListener('demo-checklist-search', onSearch);
    window.addEventListener('crm-lead-added', onCrmAdd);
    window.addEventListener('demo-checklist-contact', onContact);
    window.addEventListener('demo-checklist-contact-method-set', onContactMethod);
    window.addEventListener('demo-checklist-pipeline-status-set', onPipelineStatus);
    window.addEventListener('demo-checklist-status-change', onStatus);
    window.addEventListener('demo-checklist-step4-action-set', onStep4Action);
    window.addEventListener('demo-checklist-step4-date-set', onStep4Date);
    window.addEventListener('demo-checklist-track-pressed', onTrack);
    window.addEventListener('demo-checklist-next-action-set', onFollowUpAction);
    window.addEventListener('demo-checklist-next-date-set', onFollowUpDate);
    window.addEventListener('demo-checklist-track-note-saved', onNoteSaved);
    window.addEventListener('demo-checklist-track-status-changed', onFollowUpStatus);
    window.addEventListener('demo-checklist-track-status-update', onTrackStatusChanged);
    const onCardCollapsed = () => completeStep('cardCollapsed');
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
      window.removeEventListener('demo-checklist-contact', onContact);
      window.removeEventListener('demo-checklist-contact-method-set', onContactMethod);
      window.removeEventListener('demo-checklist-pipeline-status-set', onPipelineStatus);
      window.removeEventListener('demo-checklist-status-change', onStatus);
      window.removeEventListener('demo-checklist-step4-action-set', onStep4Action);
      window.removeEventListener('demo-checklist-step4-date-set', onStep4Date);
      window.removeEventListener('demo-checklist-track-pressed', onTrack);
      window.removeEventListener('demo-checklist-next-action-set', onFollowUpAction);
      window.removeEventListener('demo-checklist-next-date-set', onFollowUpDate);
      window.removeEventListener('demo-checklist-track-note-saved', onNoteSaved);
      window.removeEventListener('demo-checklist-track-status-changed', onFollowUpStatus);
      window.removeEventListener('demo-checklist-track-status-update', onTrackStatusChanged);
      window.removeEventListener('demo-checklist-card-collapsed', onCardCollapsed);
      document.removeEventListener('click', onTelClick, true);
      window.removeEventListener('quick-locations-toggle', onQuickLocToggle);
    };
  }, [isDemoUser, completeStep, isOpen]);

  // Complete "CRM page opened" when user visits /outreach
  useEffect(() => {
    if (!isDemoUser) return;
    if (state.addedToCrm && location.pathname === '/outreach') {
      completeStep('crmPageOpened');
    }
  }, [isDemoUser, location.pathname, state.addedToCrm, completeStep]);

  // Complete "Open Track Leads page" when user visits /potential-work
  useEffect(() => {
    if (!isDemoUser) return;
    if (location.pathname === '/potential-work') {
      completeStep('leadTracked');
    }
  }, [isDemoUser, location.pathname, completeStep]);

  // 8 steps: searchDone, addedToCrm, crmPageOpened, contactAttempted, trackPressed, leadTracked, noteAdded, cardCollapsed
  const completedCount = [
    state.searchDone,
    state.addedToCrm,
    state.crmPageOpened,
    state.contactAttempted,
    state.trackPressed,
    state.leadTracked,
    state.noteAdded,
    state.cardCollapsed,
  ].filter(Boolean).length;

  const allDone = completedCount === 8;

  // Dispatch event when all steps are completed for the first time
  const allDoneRef = useRef(false);
  useEffect(() => {
    if (allDone && !allDoneRef.current) {
      allDoneRef.current = true;
      window.dispatchEvent(new CustomEvent('walkthrough-all-done'));
    }
  }, [allDone]);

  return (
    <DemoChecklistContext.Provider value={{
      state,
      completedCount,
      totalSteps: 8,
      allDone,
      completeStep,
      isOpen,
      setIsOpen,
      isDemoUser,
    }}>
      {children}
    </DemoChecklistContext.Provider>
  );
}

const fallback: DemoChecklistContextType = {
  state: defaultState,
  completedCount: 0,
  totalSteps: 8,
  allDone: false,
  completeStep: () => {},
  isOpen: false,
  setIsOpen: () => {},
  isDemoUser: false,
};

export function useDemoChecklist() {
  const ctx = useContext(DemoChecklistContext);
  return ctx ?? fallback;
}
