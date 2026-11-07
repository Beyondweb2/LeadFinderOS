/* A STALE BUNDLE AFTER A DEPLOY (2026-11-07). A page opened before a deploy still asks for the OLD hashed chunk files;
 * the new deploy no longer has them, so opening a lazy page fails ("error loading dynamically imported module" in
 * Firefox, "Failed to fetch dynamically imported module" in Chrome, "Importing a module script failed" in Safari).
 * The cure is one reload: index.html is served no-cache (public/_headers), so the reload picks up the new bundle.
 *
 * ⛔ ONE reload per RELOAD_GUARD_MS. If the reload did not cure it (a real outage, a broken deploy), we stop and show the
 * error screen with a Reload button instead of looping. Pure: storage, clock and reload are injected. No React. */

export const RELOAD_GUARD_MS = 60_000;
export const STALE_CHUNK_RELOAD_KEY = 'lf-stale-chunk-reload-at';

const PATTERNS = [
  /error loading dynamically imported module/i,
  /failed to fetch dynamically imported module/i,
  /importing a module script failed/i,
  /unable to preload css/i,
  /ChunkLoadError/i,
  /Loading (CSS )?chunk [\w-]+ failed/i,
];

/** Is this error a lazy page / chunk that could not be loaded? Positive match on the known wordings only. */
export function isStaleChunkError(err: unknown): boolean {
  if (err == null) return false;
  const e = err as { message?: unknown; name?: unknown };
  const text = `${typeof e.name === 'string' ? e.name : ''} ${typeof e.message === 'string' ? e.message : typeof err === 'string' ? err : ''}`;
  return PATTERNS.some((p) => p.test(text));
}

interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void }

/** Reload once. Returns true when a reload was started, false when one already happened within the guard window
 *  (or storage is unavailable — then we never reload, so there is no loop). */
export function reloadOnceForStaleChunk(storage: StorageLike | null, now: number, reload: () => void): boolean {
  if (!storage) return false;
  try {
    const last = Number(storage.getItem(STALE_CHUNK_RELOAD_KEY));
    if (Number.isFinite(last) && last > 0 && now - last < RELOAD_GUARD_MS) return false;
    storage.setItem(STALE_CHUNK_RELOAD_KEY, String(now));
  } catch {
    return false;
  }
  reload();
  return true;
}

/** The browser's session storage, or null where it is blocked. */
export function sessionStore(): StorageLike | null {
  try { return typeof window !== 'undefined' ? window.sessionStorage : null; } catch { return null; }
}

/** Wire every way a stale chunk surfaces: Vite's own preload event, a rejected import, a plain error event.
 *  Installed once, before React mounts (src/main.tsx). */
export function installStaleChunkRecovery(win: Window = window): void {
  const tryReload = () => reloadOnceForStaleChunk(sessionStore(), Date.now(), () => win.location.reload());
  win.addEventListener('vite:preloadError', (event) => {
    if (tryReload()) event.preventDefault();
  });
  win.addEventListener('unhandledrejection', (event) => {
    if (isStaleChunkError((event as PromiseRejectionEvent).reason)) tryReload();
  });
  win.addEventListener('error', (event) => {
    if (isStaleChunkError((event as ErrorEvent).error ?? (event as ErrorEvent).message)) tryReload();
  });
}
