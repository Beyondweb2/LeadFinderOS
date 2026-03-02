import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';

const CUSTOM_ACTIONS_KEY_PREFIX = 'leadfinder_custom_next_actions_';
const CUSTOM_ACTION_LEADS_KEY_PREFIX = 'leadfinder_custom_action_leads_';

// Fallback for non-hook contexts — tries to find a user-scoped key first
let _activeUserId: string | null = null;

export interface CustomNextAction {
  id: string;
  label: string;
}

function getActionsKey(userId?: string | null): string | null {
  const uid = userId || _activeUserId;
  return uid ? `${CUSTOM_ACTIONS_KEY_PREFIX}${uid}` : null;
}

function getLeadsKey(userId?: string | null): string | null {
  const uid = userId || _activeUserId;
  return uid ? `${CUSTOM_ACTION_LEADS_KEY_PREFIX}${uid}` : null;
}

/** Get all user-created custom next actions */
export function getCustomNextActions(userId?: string | null): CustomNextAction[] {
  try {
    const key = getActionsKey(userId);
    if (!key) return [];
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Get the custom action label assigned to a specific lead */
export function getLeadCustomAction(leadId: string, userId?: string | null): string | null {
  try {
    const key = getLeadsKey(userId);
    if (!key) return null;
    const raw = localStorage.getItem(key);
    const map: Record<string, string> = raw ? JSON.parse(raw) : {};
    return map[leadId] || null;
  } catch {
    return null;
  }
}

/** Assign a custom action label to a lead */
export function setLeadCustomAction(leadId: string, label: string | null, userId?: string | null) {
  try {
    const key = getLeadsKey(userId);
    if (!key) return;
    const raw = localStorage.getItem(key);
    const map: Record<string, string> = raw ? JSON.parse(raw) : {};
    if (label) {
      map[leadId] = label;
    } else {
      delete map[leadId];
    }
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    // ignore
  }
}

export function useCustomNextActions() {
  const { user } = useAuth();
  const userId = user?.id || null;

  // Keep the module-level fallback in sync
  useEffect(() => {
    _activeUserId = userId;
  }, [userId]);

  const [actions, setActions] = useState<CustomNextAction[]>(() => getCustomNextActions(userId));

  // Re-load when userId changes
  useEffect(() => {
    setActions(getCustomNextActions(userId));
  }, [userId]);

  const addAction = useCallback((label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    setActions(prev => {
      if (prev.some(a => a.label.toLowerCase() === trimmed.toLowerCase())) return prev;
      const next = [...prev, { id: `custom_${Date.now()}`, label: trimmed }];
      const key = getActionsKey(userId);
      if (key) localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  }, [userId]);

  const removeAction = useCallback((id: string) => {
    setActions(prev => {
      const next = prev.filter(a => a.id !== id);
      const key = getActionsKey(userId);
      if (key) localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  }, [userId]);

  // Sync across tabs
  useEffect(() => {
    const key = getActionsKey(userId);
    const handler = (e: StorageEvent) => {
      if (e.key === key) {
        setActions(getCustomNextActions(userId));
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [userId]);

  return { customActions: actions, addAction, removeAction };
}
