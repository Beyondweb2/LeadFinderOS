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

/* ════════════════════════════════════════════════════════════════════════════════════════════
   UNMOUNT-SAFE WRITE-THROUGH — update a persisted key's STORAGE directly, outside React.

   ⛔ WHY THIS EXISTS. PageGenerator's generate() awaits a PAID OpenAI call and then setCache()s the
   result. Navigate away mid-call and the response still arrives — but setState on an unmounted
   component is a no-op, so the finished page was silently discarded and the spend wasted. This
   writes the result into the SAME storage entry usePersistedState reads on next mount, so the work
   survives whether or not the component is still there. The caller should ALSO set component state
   (when mounted the two agree; when unmounted the setState is inert and this write is what counts).

   ⚠️ USE ONLY FOR COMPLETED RESULTS WORTH MONEY. This bypasses React — a mounted component does NOT
   see the write until remount — so it is a write-through companion to a setState, never a
   replacement for one. The read-modify-write is safe from interleaving because JS continuations run
   one at a time; two resolving generations each read-then-write sequentially.
   ⚠️ Key/tier/version/scope MUST match the hook call it mirrors, or it writes an entry nobody reads.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
export function updatePersistedValue<T>(
  key: string,
  opts: { tier?: PersistTier; scope?: string | null; version?: number },
  updater: (current: T | undefined) => T,
): void {
  const { tier = 'session', scope = null, version = 1 } = opts;
  const storageKey = scope ? `${PREFIX}${key}:${scope}` : `${PREFIX}${key}`;
  try {
    const current = readPersisted<T>(storageKey, tier, version);
    writePersisted(storageKey, tier, version, updater(current));
  } catch {
    /* best-effort — a blocked store loses the write-through, exactly as the hook itself would */
  }
}
