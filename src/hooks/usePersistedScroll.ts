import { RefObject, useEffect, useMemo } from "react";

const STORAGE_PREFIX = "leadfinder_scroll";

function safeRead(key: string): number | null {
  try {
    const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: number) {
  try {
    const raw = String(value);
    localStorage.setItem(key, raw);
    sessionStorage.setItem(key, raw);
  } catch {
    // ignore
  }
}

function makeKey(userId: string | null | undefined, routeKey: string) {
  const uid = userId || "anon";
  return `${STORAGE_PREFIX}:${uid}:${routeKey}`;
}

/**
 * Persist and restore scrollTop for a scroll container.
 * Designed for "position loss" after tab discard / refresh.
 */
export function usePersistedScroll(params: {
  containerRef: RefObject<HTMLElement>;
  userId?: string | null;
  routeKey: string;
  enabled: boolean;
}) {
  const storageKey = useMemo(
    () => makeKey(params.userId, params.routeKey),
    [params.userId, params.routeKey]
  );

  // Restore once
  useEffect(() => {
    if (!params.enabled) return;
    const el = params.containerRef.current;
    if (!el) return;

    const stored = safeRead(storageKey);
    if (stored === null) return;

    // Defer until after paint so layout is stable
    requestAnimationFrame(() => {
      try {
        el.scrollTop = stored;
      } catch {
        // ignore
      }
    });
  }, [params.enabled, params.containerRef, storageKey]);

  // Persist on scroll (raf-throttled)
  useEffect(() => {
    if (!params.enabled) return;
    const el = params.containerRef.current;
    if (!el) return;

    let raf = 0;
    const onScroll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        safeWrite(storageKey, el.scrollTop);
      });
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      el.removeEventListener("scroll", onScroll);
    };
  }, [params.enabled, params.containerRef, storageKey]);
}
