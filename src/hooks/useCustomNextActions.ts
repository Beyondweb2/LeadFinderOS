import { useState, useCallback, useEffect } from 'react';

const CUSTOM_ACTIONS_KEY = 'leadfinder_custom_next_actions';
const CUSTOM_ACTION_LEADS_KEY = 'leadfinder_custom_action_leads';

export interface CustomNextAction {
  id: string;
  label: string;
}

/** Get all user-created custom next actions */
export function getCustomNextActions(): CustomNextAction[] {
  try {
    const raw = localStorage.getItem(CUSTOM_ACTIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Get the custom action label assigned to a specific lead */
export function getLeadCustomAction(leadId: string): string | null {
  try {
    const raw = localStorage.getItem(CUSTOM_ACTION_LEADS_KEY);
    const map: Record<string, string> = raw ? JSON.parse(raw) : {};
    return map[leadId] || null;
  } catch {
    return null;
  }
}

/** Assign a custom action label to a lead */
export function setLeadCustomAction(leadId: string, label: string | null) {
  try {
    const raw = localStorage.getItem(CUSTOM_ACTION_LEADS_KEY);
    const map: Record<string, string> = raw ? JSON.parse(raw) : {};
    if (label) {
      map[leadId] = label;
    } else {
      delete map[leadId];
    }
    localStorage.setItem(CUSTOM_ACTION_LEADS_KEY, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function useCustomNextActions() {
  const [actions, setActions] = useState<CustomNextAction[]>(getCustomNextActions);

  const addAction = useCallback((label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    setActions(prev => {
      if (prev.some(a => a.label.toLowerCase() === trimmed.toLowerCase())) return prev;
      const next = [...prev, { id: `custom_${Date.now()}`, label: trimmed }];
      localStorage.setItem(CUSTOM_ACTIONS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const removeAction = useCallback((id: string) => {
    setActions(prev => {
      const next = prev.filter(a => a.id !== id);
      localStorage.setItem(CUSTOM_ACTIONS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Sync across tabs
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === CUSTOM_ACTIONS_KEY) {
        setActions(getCustomNextActions());
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  return { customActions: actions, addAction, removeAction };
}
