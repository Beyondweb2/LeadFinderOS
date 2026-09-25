/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SAVE QUEUE — one autosave at a time, "Saved" only when the LATEST state is on the server.

   The Website Build page saves its whole state (one row, one jsonb). Before this, two saves could be
   in flight at once and land out of order: an older save finishing last overwrote a newer one while
   the header already said Saved. Found hardening the BS4 pilot (2026-09-25, F13).

   ⛔ ONE REQUEST AT A TIME. A change made while a save is in flight is sent right after it — never
      alongside it — so the database always ends at the newest state.
   ⛔ "saved" MEANS PERSISTED: reported only when the state last acknowledged by the server IS the
      newest state. A failure reports "error", keeps the newest state (nothing is rolled back or
      reloaded) and leaves it pending, so the next change or a retry sends it.
   Pure — no React, no timers. The page owns the debounce and calls flush().
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error';

export interface SaveQueue<S> {
  /** Record a new state. Does not send — the caller debounces and calls flush(). */
  change(s: S): void;
  /** Send the newest state (waits for any save in flight first). Resolves when nothing is pending or a save failed. */
  flush(): Promise<void>;
  /** A state exists that the server has not acknowledged. */
  pending(): boolean;
  status(): SaveStatus;
  /** Forget everything pending — used when the page loads a fresh copy from the server. */
  reset(loaded: S): void;
}

export function createSaveQueue<S>(send: (s: S) => Promise<unknown>, onStatus: (status: SaveStatus, error?: unknown) => void): SaveQueue<S> {
  let latest: S | null = null;
  let persisted: S | null = null;
  let inflight: Promise<void> | null = null;
  let current: SaveStatus = 'saved';
  const set = (st: SaveStatus, e?: unknown) => { current = st; onStatus(st, e); };

  async function flush(): Promise<void> {
    /* Wait out the save in flight, then send whatever is newest. */
    while (inflight) await inflight;
    const s = latest;
    if (s === null) return;
    if (s === persisted) { set('saved'); return; }
    let failure: unknown = null;
    inflight = (async () => {
      set('saving');
      try { await send(s); persisted = s; } catch (e) { failure = e ?? new Error('Save failed'); }
    })();
    await inflight;
    inflight = null;
    if (failure) { set('error', failure); return; }
    /* A change arrived while this save was in flight: send it now, in order. */
    if (latest !== persisted) return flush();
    set('saved');
  }

  return {
    change(s) { latest = s; if (current !== 'saving') set('dirty'); },
    flush,
    pending: () => latest !== null && latest !== persisted,
    status: () => current,
    reset(loaded) { latest = loaded; persisted = loaded; set('saved'); },
  };
}
