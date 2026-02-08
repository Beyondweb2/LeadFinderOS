import { useEffect, useMemo } from "react";

const STORAGE_PREFIX = "leadfinder_last_route";

function safeRead(key: string): string | null {
  try {
    return localStorage.getItem(key) || sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
    sessionStorage.setItem(key, value);
  } catch {
    // ignore quota / privacy mode issues
  }
}

export function makeLastRouteKey(userId?: string | null) {
  return userId ? `${STORAGE_PREFIX}:${userId}` : STORAGE_PREFIX;
}

export function isSafeAppRoute(path: string) {
  if (!path.startsWith("/")) return false;
  // Never resume into public-only routes
  if (path.startsWith("/landing")) return false;
  if (path.startsWith("/auth")) return false;
  if (path.startsWith("/terms")) return true; // still safe, but not in-app; keep allowed
  return true;
}

/**
 * Persist the user's last visited route (pathname+search+hash) redundantly.
 */
export function usePersistLastRoute(params: {
  userId?: string | null;
  path: string;
  enabled: boolean;
}) {
  const key = useMemo(() => makeLastRouteKey(params.userId), [params.userId]);

  useEffect(() => {
    if (!params.enabled) return;
    if (!isSafeAppRoute(params.path)) return;
    safeWrite(key, params.path);
  }, [key, params.enabled, params.path]);
}

export function readLastRoute(userId?: string | null): string | null {
  const key = makeLastRouteKey(userId);
  const stored = safeRead(key);
  if (!stored) return null;
  return isSafeAppRoute(stored) ? stored : null;
}
