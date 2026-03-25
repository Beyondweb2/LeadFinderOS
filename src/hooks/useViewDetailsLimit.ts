import { useState, useCallback, useEffect } from 'react';
import { useAuth } from './useAuth';

const STORAGE_KEY_PREFIX = 'leadfinder_view_details_count';
const FREE_LIMIT = 5;

function getKey(userId?: string | null) {
  return userId ? `${STORAGE_KEY_PREFIX}:${userId}` : STORAGE_KEY_PREFIX;
}

export function useViewDetailsLimit(hasProAccess: boolean) {
  const { user } = useAuth();
  const key = getKey(user?.id);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (hasProAccess) return;
    try {
      setCount(parseInt(localStorage.getItem(key) || '0', 10));
    } catch {
      setCount(0);
    }
  }, [key, hasProAccess]);

  // Clear when user becomes pro
  useEffect(() => {
    if (hasProAccess) {
      try { localStorage.removeItem(key); } catch {}
      setCount(0);
    }
  }, [hasProAccess, key]);

  const canViewDetails = hasProAccess || count < FREE_LIMIT;

  const recordView = useCallback(() => {
    if (hasProAccess) return true;
    const current = parseInt(localStorage.getItem(key) || '0', 10);
    if (current >= FREE_LIMIT) return false;
    const next = current + 1;
    try {
      localStorage.setItem(key, String(next));
    } catch {}
    setCount(next);
    return true;
  }, [key, hasProAccess]);

  const isExhausted = !hasProAccess && count >= FREE_LIMIT;

  return { canViewDetails, recordView, isExhausted, count, limit: FREE_LIMIT };
}
