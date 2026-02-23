import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLocation } from 'react-router-dom';

export interface DemoChecklistState {
  searchDone: boolean;
  addedToCrm: boolean;
  crmAddCount: number;
  crmPageOpened: boolean;
  contactAttempted: boolean;
  statusChanged: boolean;
  step4ActionSet: boolean;
  step4DateSet: boolean;
  trackPressed: boolean;
  statusUpdated: boolean; // derived: statusChanged && step4ActionSet && trackPressed
  leadTracked: boolean;
  noteAdded: boolean;
  // Legacy fields kept for backwards compat
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
  contactAttempted: false, statusChanged: false, step4ActionSet: false, step4DateSet: false,
  trackPressed: false, statusUpdated: false, leadTracked: false, noteAdded: false,
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

  // Auto-open walkthrough when isDemoUser
  useEffect(() => {
    if (!isDemoUser) return;
    if (initializedRef.current) return;
    initializedRef.current = true;
    const timer = setTimeout(() => setIsOpen(true), 1500);
    return () => clearTimeout(timer);
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
    const onStatus = () => {
      setState(prev => {
        if (prev.statusChanged) return prev;
        const next = { ...prev, statusChanged: true, statusUpdated: prev.step4ActionSet && prev.trackPressed };
        saveState(next, user?.id);
        return next;
      });
    };
    const onStep4Action = () => {
      setState(prev => {
        if (prev.step4ActionSet) return prev;
        const next = { ...prev, step4ActionSet: true, statusUpdated: prev.statusChanged && prev.trackPressed };
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
        const next = { ...prev, trackPressed: true, statusUpdated: prev.statusChanged && prev.step4ActionSet };
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

    const onTelClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a[href^="tel:"]');
      if (anchor) completeStep('contactAttempted');
    };

    window.addEventListener('demo-checklist-search', onSearch);
    window.addEventListener('crm-lead-added', onCrmAdd);
    window.addEventListener('demo-checklist-contact', onContact);
    window.addEventListener('demo-checklist-status-change', onStatus);
    window.addEventListener('demo-checklist-step4-action-set', onStep4Action);
    window.addEventListener('demo-checklist-step4-date-set', onStep4Date);
    window.addEventListener('demo-checklist-track-pressed', onTrack);
    window.addEventListener('demo-checklist-next-action-set', onFollowUpAction);
    window.addEventListener('demo-checklist-next-date-set', onFollowUpDate);
    window.addEventListener('demo-checklist-track-note-saved', onNoteSaved);
    window.addEventListener('demo-checklist-track-status-changed', onFollowUpStatus);
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
      window.removeEventListener('demo-checklist-status-change', onStatus);
      window.removeEventListener('demo-checklist-step4-action-set', onStep4Action);
      window.removeEventListener('demo-checklist-step4-date-set', onStep4Date);
      window.removeEventListener('demo-checklist-track-pressed', onTrack);
      window.removeEventListener('demo-checklist-next-action-set', onFollowUpAction);
      window.removeEventListener('demo-checklist-next-date-set', onFollowUpDate);
      window.removeEventListener('demo-checklist-track-note-saved', onNoteSaved);
      window.removeEventListener('demo-checklist-track-status-changed', onFollowUpStatus);
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

  // 7 steps: searchDone, addedToCrm, crmPageOpened, contactAttempted, statusUpdated, leadTracked, noteAdded
  const completedCount = [
    state.searchDone,
    state.addedToCrm,
    state.crmPageOpened,
    state.contactAttempted,
    state.statusUpdated,
    state.leadTracked,
    state.noteAdded,
  ].filter(Boolean).length;

  return (
    <DemoChecklistContext.Provider value={{
      state,
      completedCount,
      totalSteps: 7,
      allDone: completedCount === 7,
      completeStep,
      isOpen,
      setIsOpen,
      isDemoUser,
    }}>
      {children}
    </DemoChecklistContext.Provider>
  );
}

export function useDemoChecklist() {
  const ctx = useContext(DemoChecklistContext);
  if (!ctx) throw new Error('useDemoChecklist must be used within DemoChecklistProvider');
  return ctx;
}
