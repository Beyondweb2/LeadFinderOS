import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * usePersistedState — opt-in, per-page state persistence backed by web storage.
 *
 * A drop-in replacement for useState for the SMALL bits of UI state that are annoying
 * to lose on navigation (search inputs, filters, a wizard position). Deliberately NOT a
 * global auto-persist: each call site chooses exactly what to persist.
 *
 *   const [filters, setFilters, clearFilters] =
 *     usePersistedState('inbox-filters', { campaign: null, status: null },
 *                       { tier: 'session', scope: user?.id });
 *
 * Guarantees:
 *  - Every storage touch is try/catch-guarded — blocked/full/absent storage silently
 *    degrades to plain in-memory state (never throws, never breaks the page).
 *  - Lazy rehydrate: the stored value (if any) seeds initial state once, on mount.
 *  - `version` + `validate` reject stale/corrupt shapes so a changed payload can't crash.
 *  - `scope` (e.g. a user id) isolates state per user — important on shared machines.
 *    Pages that use this are auth-gated, so `scope` is resolved at mount; the key is
 *    bound once for the hook's lifetime (a mid-life scope change is not re-read).
 *
 * Tiers:
 *  - 'session' (default): sessionStorage only — survives navigation + refresh, dies with
 *    the tab. The right default for ephemeral UI state.
 *  - 'local': localStorage — survives a tab close.
 *  - 'both': write both, read local||session — survives a tab close (matches the app's
 *    existing prefs helpers).
 */

export type PersistTier = 'session' | 'local' | 'both';

export interface PersistOptions<T> {
  tier?: PersistTier;                        // default 'session'
  scope?: string | null;                     // e.g. user.id — per-user isolation
  version?: number;                          // bump to invalidate an old stored shape
  validate?: (data: unknown) => T | null;    // reject/migrate bad shapes (null → ignore)
}

const PREFIX = 'leadfinder:';

/** Access a store defensively — returns null if storage is unavailable/blocked. */
function pick(which: 'local' | 'session'): Storage | null {
  try {
    return which === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function writeStores(tier: PersistTier): ('local' | 'session')[] {
  return tier === 'both' ? ['local', 'session'] : tier === 'local' ? ['local'] : ['session'];
}

function readStores(tier: PersistTier): ('local' | 'session')[] {
  return tier === 'both' ? ['local', 'session'] : writeStores(tier);
}

function readPersisted<T>(key: string, tier: PersistTier, version: number, validate?: (d: unknown) => T | null): T | undefined {
  for (const which of readStores(tier)) {
    try {
      const raw = pick(which)?.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { v?: number; d?: unknown };
      if (!parsed || typeof parsed !== 'object' || parsed.v !== version) continue; // shape/version mismatch → ignore
      const val = validate ? validate(parsed.d) : (parsed.d as T);
      if (val === null || val === undefined) continue;
      return val as T;
    } catch {
      /* corrupt entry in this store — try the next */
    }
  }
  return undefined;
}

function writePersisted<T>(key: string, tier: PersistTier, version: number, value: T): void {
  let payload: string;
  try {
    payload = JSON.stringify({ v: version, d: value });
  } catch {
    return; // unserialisable value — skip persistence
  }
  for (const which of writeStores(tier)) {
    try {
      pick(which)?.setItem(key, payload);
    } catch {
      /* quota/blocked — best-effort */
    }
  }
}

function removePersisted(key: string, tier: PersistTier): void {
  for (const which of writeStores(tier)) {
    try {
      pick(which)?.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

export function usePersistedState<T>(
  key: string,
  initial: T | (() => T),
  opts: PersistOptions<T> = {},
): [T, Dispatch<SetStateAction<T>>, () => void] {
  const { tier = 'session', scope = null, version = 1, validate } = opts;

  // Bind the storage key + initial value ONCE for this hook's lifetime.
  const keyRef = useRef<string | null>(null);
  if (keyRef.current === null) keyRef.current = scope ? `${PREFIX}${key}:${scope}` : `${PREFIX}${key}`;
  const storageKey = keyRef.current;

  const initialRef = useRef<{ v: T } | null>(null);
  if (initialRef.current === null) {
    initialRef.current = { v: typeof initial === 'function' ? (initial as () => T)() : initial };
  }

  const [value, setValue] = useState<T>(() => {
    const loaded = readPersisted<T>(storageKey, tier, version, validate);
    return loaded === undefined ? initialRef.current!.v : loaded;
  });

  // Persist on change (best-effort).
  useEffect(() => {
    writePersisted(storageKey, tier, version, value);
  }, [storageKey, tier, version, value]);

  const clear = useCallback(() => {
    removePersisted(storageKey, tier);
    setValue(initialRef.current!.v);
  }, [storageKey, tier]);

  return [value, setValue, clear];
}
