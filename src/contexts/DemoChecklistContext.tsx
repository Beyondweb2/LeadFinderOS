import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useLocation } from 'react-router-dom';

export interface DemoChecklistState {
  searchDone: boolean;
  addedToCrm: boolean;
  crmAddCount: number;
  contactAttempted: boolean;
  statusUpdated: boolean;
  leadTracked: boolean;
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

function loadState(userId?: string): DemoChecklistState {
  try {
    const raw = localStorage.getItem(getKey(userId));
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { searchDone: false, addedToCrm: false, crmAddCount: 0, contactAttempted: false, statusUpdated: false, leadTracked: false, followUpSet: false };
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

  // Re-load when user changes
  useEffect(() => {
    setState(loadState(user?.id));
  }, [user?.id]);

  // Auto-open panel after onboarding modal is dismissed (small delay)
  useEffect(() => {
    if (!isDemoUser || initializedRef.current) return;
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

  // Listen for custom events from existing hooks
  useEffect(() => {
    if (!isDemoUser) return;

    const onSearch = () => completeStep('searchDone');
    const onCrmAdd = () => {
      // Track count — mark complete at 3
      setState(prev => {
        const newCount = prev.crmAddCount + 1;
        const next = { ...prev, crmAddCount: newCount, addedToCrm: newCount >= 3 };
        saveState(next, user?.id);
        return next;
      });
    };
    const onContact = () => completeStep('contactAttempted');
    const onStatus = () => completeStep('statusUpdated');
    const onTrack = () => completeStep('leadTracked');
    const onFollowUp = () => completeStep('followUpSet');

    // Also capture tel: link clicks as contact attempts
    const onTelClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a[href^="tel:"]');
      if (anchor) completeStep('contactAttempted');
    };

    window.addEventListener('demo-checklist-search', onSearch);
    window.addEventListener('crm-lead-added', onCrmAdd);
    window.addEventListener('demo-checklist-contact', onContact);
    window.addEventListener('demo-checklist-status-change', onStatus);
    window.addEventListener('demo-checklist-lead-tracked', onTrack);
    window.addEventListener('demo-checklist-next-action-set', onFollowUp);
    document.addEventListener('click', onTelClick, true);

    return () => {
      window.removeEventListener('demo-checklist-search', onSearch);
      window.removeEventListener('crm-lead-added', onCrmAdd);
      window.removeEventListener('demo-checklist-contact', onContact);
      window.removeEventListener('demo-checklist-status-change', onStatus);
      window.removeEventListener('demo-checklist-lead-tracked', onTrack);
      window.removeEventListener('demo-checklist-next-action-set', onFollowUp);
      document.removeEventListener('click', onTelClick, true);
    };
  }, [isDemoUser, completeStep]);

  // Complete "Open Track Leads page" when user visits /potential-work
  useEffect(() => {
    if (!isDemoUser) return;
    if (location.pathname === '/potential-work') {
      completeStep('leadTracked');
    }
  }, [isDemoUser, location.pathname, completeStep]);

  const completedCount = [state.searchDone, state.addedToCrm, state.contactAttempted, state.statusUpdated, state.leadTracked, state.followUpSet].filter(Boolean).length;

  return (
    <DemoChecklistContext.Provider value={{
      state,
      completedCount,
      totalSteps: 6,
      allDone: completedCount === 6,
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
