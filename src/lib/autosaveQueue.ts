/* ══ AUTOSAVE, NO SUBMIT (Paul, 2026-11-02, docs/commission-owed.md) ═════════════════════════════════════════════════════════════
   One queue per form. Typing in a field schedules ONE save of THAT field, about AUTOSAVE_DEBOUNCE_MS after the typing stops, and at once on
   blur or before leaving. Rules that keep typed text safe:
   - ONE request per field at a time. A newer value waits for the one in flight, so a slow old reply can never overwrite newer text.
   - A failed save keeps the value and keeps retrying (backing off to AUTOSAVE_RETRY_MAX_MS). Only a refusal the server means (not your
     sale) stops the retries, and it says so.
   - Every unsaved value is also kept in local storage until the server has it. A crash, a closed tab or a dead connection loses nothing:
     the next open restores it and saves it.
   Pure apart from the injected timers and storage, so scripts/autosave-queue.test.ts drives it on a fake clock. */

export const AUTOSAVE_DEBOUNCE_MS = 800;
export const AUTOSAVE_RETRY_FIRST_MS = 1_000;
export const AUTOSAVE_RETRY_MAX_MS = 30_000;

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'retrying' | 'refused';

export interface AutosaveStorage { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
export interface AutosaveDeps {
  /** Save one field. Resolve = stored. Reject = retry, unless isRefusal says the server means it. */
  save: (key: string, value: string) => Promise<void>;
  isRefusal?: (e: unknown) => boolean;
  /** Local storage key for this form (for example the lead id), or null for none. */
  storageKey?: string | null;
  storage?: AutosaveStorage | null;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
  onChange?: () => void;
}

interface Slot { latest: string; sent: string; inFlight: boolean; timer: unknown; retryMs: number; retrying: boolean; refused: boolean }

export class AutosaveQueue {
  private slots = new Map<string, Slot>();
  private everSaved = false;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (t: unknown) => void;
  constructor(private readonly deps: AutosaveDeps) {
    this.setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = deps.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>));
  }
  private slot(key: string): Slot {
    let s = this.slots.get(key);
    if (!s) { s = { latest: '', sent: '', inFlight: false, timer: null, retryMs: AUTOSAVE_RETRY_FIRST_MS, retrying: false, refused: false }; this.slots.set(key, s); }
    return s;
  }
  private changed() { this.deps.onChange?.(); }
  private backup() {
    const { storage, storageKey } = this.deps;
    if (!storage || !storageKey) return;
    const open: Record<string, string> = {};
    for (const [k, s] of this.slots) if (s.sent !== s.latest && !s.refused) open[k] = s.latest;
    try {
      if (Object.keys(open).length) storage.setItem(storageKey, JSON.stringify(open));
      else storage.removeItem(storageKey);
    } catch { /* Private window or full storage: the value is still held in memory and still being saved. */ }
  }
  /** Values left unsaved by an earlier page, to put back in the form. Calling set() on each saves them. */
  restore(): Record<string, string> {
    const { storage, storageKey } = this.deps;
    if (!storage || !storageKey) return {};
    try {
      const raw = storage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) as unknown : null;
      if (!parsed || typeof parsed !== 'object') return {};
      return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string'));
    } catch { return {}; }
  }
  /** A field's value as the server has it (a form opening). Nothing to save. */
  baseline(key: string, value: string) {
    const s = this.slot(key);
    if (!this.isDirty(key)) { s.latest = value; s.sent = value; s.refused = false; }
  }
  /** The person typed. */
  set(key: string, value: string) {
    const s = this.slot(key);
    if (s.latest === value && s.sent === value) return;
    s.latest = value; s.refused = false;
    if (s.timer) { this.clearTimer(s.timer); s.timer = null; }
    s.retryMs = AUTOSAVE_RETRY_FIRST_MS;
    this.backup();
    s.timer = this.setTimer(() => { s.timer = null; void this.pump(key); }, AUTOSAVE_DEBOUNCE_MS);
    this.changed();
  }
  /** Blur, or about to leave: save now. */
  flush(key?: string) {
    for (const k of key ? [key] : [...this.slots.keys()]) {
      const s = this.slots.get(k);
      if (!s || s.refused) continue;
      if (s.timer) { this.clearTimer(s.timer); s.timer = null; }
      if (s.sent !== s.latest) void this.pump(k);
    }
  }
  /** Has text the server does not have yet. */
  isDirty(key: string): boolean {
    const s = this.slots.get(key);
    return !!s && !s.refused && (s.sent !== s.latest || s.inFlight);
  }
  hasUnsaved(): boolean { return [...this.slots.keys()].some((k) => this.isDirty(k)); }
  status(): AutosaveStatus {
    const all = [...this.slots.values()];
    if (all.some((s) => s.refused)) return 'refused';
    if (all.some((s) => s.retrying && s.sent !== s.latest)) return 'retrying';
    if (all.some((s) => s.sent !== s.latest || s.inFlight)) return 'saving';
    return this.everSaved ? 'saved' : 'idle';
  }
  private async pump(key: string): Promise<void> {
    const s = this.slot(key);
    if (s.inFlight || s.sent === s.latest || s.refused) return;
    const value = s.latest;
    s.inFlight = true;
    this.changed();
    try {
      await this.deps.save(key, value);
      s.sent = value; s.retrying = false; s.retryMs = AUTOSAVE_RETRY_FIRST_MS; this.everSaved = true;
      s.inFlight = false;
      this.backup();
      this.changed();
      /* Typed more while that was in flight: go again unless the debounce already has it. */
      if (s.sent !== s.latest && !s.timer) void this.pump(key);
    } catch (e) {
      s.inFlight = false;
      if (this.deps.isRefusal?.(e)) { s.refused = true; s.retrying = false; this.backup(); this.changed(); return; }
      s.retrying = true;
      this.changed();
      if (!s.timer) {
        s.timer = this.setTimer(() => { s.timer = null; void this.pump(key); }, s.retryMs);
        s.retryMs = Math.min(s.retryMs * 2, AUTOSAVE_RETRY_MAX_MS);
      }
    }
  }
}

/** A one-tap answer (a button, not typing): up to three retries over a bad connection, then the caller says it failed. A server refusal
 *  (any 4xx except timeout and rate limit) is not retried: it means it. */
export async function withSaveRetry<T>(fn: () => Promise<T>, onRetrying?: (on: boolean) => void, waits: readonly number[] = [1_000, 2_000, 4_000], sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<T> {
  for (let i = 0; ; i++) {
    try { const r = await fn(); onRetrying?.(false); return r; }
    catch (e) {
      const status = (e as { status?: unknown } | null)?.status;
      const refused = typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 429;
      if (refused || i >= waits.length) { onRetrying?.(false); throw e; }
      onRetrying?.(true);
      await sleep(waits[i]);
    }
  }
}
