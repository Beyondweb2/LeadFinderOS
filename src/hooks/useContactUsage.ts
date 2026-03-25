import { useState, useCallback, useEffect } from 'react';
import { useAuth } from './useAuth';

/**
 * Centralised contact-action usage tracking.
 * Tracks per-lead, per-channel usage in localStorage.
 * Shared across Outreach and Track Leads pages.
 */
const STORAGE_KEY_PREFIX = 'leadfinder_contact_usage';

interface ContactUsageMap {
  [leadId: string]: {
    call?: boolean;
    sms?: boolean;
    whatsapp?: boolean;
  };
}

function getStorageKey(userId?: string | null) {
  return userId ? `${STORAGE_KEY_PREFIX}:${userId}` : STORAGE_KEY_PREFIX;
}

function readUsage(key: string): ContactUsageMap {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeUsage(key: string, usage: ContactUsageMap) {
  try {
    localStorage.setItem(key, JSON.stringify(usage));
  } catch {}
}

export function useContactUsage() {
  const { user } = useAuth();
  const key = getStorageKey(user?.id);
  const [usage, setUsage] = useState<ContactUsageMap>(() => readUsage(key));

  // Re-read when user changes
  useEffect(() => {
    setUsage(readUsage(key));
  }, [key]);

  const hasUsedContact = useCallback((leadId: string, channel: 'call' | 'sms' | 'whatsapp'): boolean => {
    const current = readUsage(key);
    return !!current[leadId]?.[channel];
  }, [key]);

  const markContactUsed = useCallback((leadId: string, channel: 'call' | 'sms' | 'whatsapp') => {
    const current = readUsage(key);
    if (!current[leadId]) current[leadId] = {};
    current[leadId][channel] = true;
    writeUsage(key, current);
    setUsage({ ...current });
  }, [key]);

  return { hasUsedContact, markContactUsed, usage };
}
