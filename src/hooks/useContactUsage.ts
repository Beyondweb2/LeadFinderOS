import { useState, useCallback, useEffect } from 'react';
import { useAuth } from './useAuth';

/**
 * Centralised contact-action usage tracking.
 * Free users can contact up to MAX_FREE_BUSINESSES unique businesses.
 * After that, all contact buttons are locked across Outreach + Track Leads.
 */
const STORAGE_KEY_PREFIX = 'leadfinder_contacted_businesses';
const MAX_FREE_BUSINESSES = 3;

function getStorageKey(userId?: string | null) {
  return userId ? `${STORAGE_KEY_PREFIX}:${userId}` : STORAGE_KEY_PREFIX;
}

function readContactedSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function writeContactedSet(key: string, set: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch {}
}

export function useContactUsage() {
  const { user } = useAuth();
  const key = getStorageKey(user?.id);
  const [contactedBusinesses, setContactedBusinesses] = useState<Set<string>>(() => readContactedSet(key));

  // Re-read when user changes
  useEffect(() => {
    setContactedBusinesses(readContactedSet(key));
  }, [key]);

  const contactedCount = contactedBusinesses.size;
  const isContactLocked = contactedCount >= MAX_FREE_BUSINESSES;

  /** Check if contacting this business is allowed. Returns true if allowed, false if blocked. */
  const tryContact = useCallback((leadId: string): boolean => {
    const current = readContactedSet(key);
    // Already contacted this business — allow (doesn't count again)
    if (current.has(leadId)) return true;
    // Under limit — allow and record
    if (current.size < MAX_FREE_BUSINESSES) {
      current.add(leadId);
      writeContactedSet(key, current);
      setContactedBusinesses(new Set(current));
      return true;
    }
    // Limit reached
    return false;
  }, [key]);

  // Legacy compat
  const hasUsedContact = useCallback((_leadId: string, _channel: 'call' | 'sms' | 'whatsapp'): boolean => {
    return readContactedSet(key).has(_leadId);
  }, [key]);

  const markContactUsed = useCallback((leadId: string, _channel: 'call' | 'sms' | 'whatsapp') => {
    const current = readContactedSet(key);
    current.add(leadId);
    writeContactedSet(key, current);
    setContactedBusinesses(new Set(current));
  }, [key]);

  return { tryContact, isContactLocked, contactedCount, hasUsedContact, markContactUsed, maxFreeBusinesses: MAX_FREE_BUSINESSES };
}
