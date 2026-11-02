import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import { AutosaveQueue, type AutosaveStatus } from '@/lib/autosaveQueue';
import { cn } from '@/lib/utils';

/* AUTOSAVE FOR A FORM (src/lib/autosaveQueue.ts has the rules). The form keeps its own text; this says when to save it.
   - set(key, value) on every keystroke, flush(key) on blur. Leaving the screen or the tab saves what is left.
   - `incoming` is what the server last said: a field the person is not typing in takes it (so a change in another tab appears), and a
     field with unsaved text keeps the person's text. Nothing typed is ever overwritten by a reply. */

const storageOf = () => { try { return window.localStorage; } catch { return null; } };
/** A server refusal it means (not a network failure or a 5xx, which are worth retrying). */
const isRefusal = (e: unknown) => { const s = (e as { status?: unknown } | null)?.status; return typeof s === 'number' && s >= 400 && s < 500 && s !== 408 && s !== 429; };

export function useAutosaveFields(opts: { save: (key: string, value: string) => Promise<void>; storageKey: string | null; onRestore?: (values: Record<string, string>) => void }) {
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const saveRef = useRef(opts.save);
  saveRef.current = opts.save;
  const queue = useMemo(() => new AutosaveQueue({
    save: (k, v) => saveRef.current(k, v), isRefusal, storageKey: opts.storageKey ? `autosave:${opts.storageKey}` : null, storage: storageOf(), onChange: tick,
  // eslint-disable-next-line react-hooks/exhaustive-deps -- one queue per form instance and key
  }), [opts.storageKey]);
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const left = queue.restore();
    if (!Object.keys(left).length) return;
    opts.onRestore?.(left);
    for (const [k, v] of Object.entries(left)) queue.set(k, v);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on open
  }, [queue]);
  /* Leaving: within the app the unmount flush finishes the request. Closing the tab may cut it off, so local storage holds the text
     and the browser asks first while something is still unsaved. */
  useEffect(() => {
    const flush = () => queue.flush();
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    const warn = (e: BeforeUnloadEvent) => { if (queue.hasUnsaved()) { flush(); e.preventDefault(); e.returnValue = ''; } };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', warn);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', warn);
      flush();
    };
  }, [queue]);
  const set = useCallback((k: string, v: string) => queue.set(k, v), [queue]);
  const flush = useCallback((k?: string) => queue.flush(k), [queue]);
  const baseline = useCallback((k: string, v: string) => queue.baseline(k, v), [queue]);
  const isDirty = useCallback((k: string) => queue.isDirty(k), [queue]);
  return { set, flush, baseline, isDirty, status: queue.status() };
}

/** The small Saved / Saving / Failed, retrying line. Nothing until the first save. */
export function AutosaveIndicator({ status, className }: { status: AutosaveStatus; className?: string }) {
  if (status === 'idle') return <span className={cn('text-xs text-muted-foreground', className)} data-testid="autosave-status" data-status="idle">Saves as you type</span>;
  const view = status === 'saving' ? { icon: <Loader2 className="h-3 w-3 animate-spin" />, text: 'Saving', cls: 'text-muted-foreground' }
    : status === 'saved' ? { icon: <Check className="h-3 w-3" />, text: 'Saved', cls: 'text-emerald-700 dark:text-emerald-400' }
    : status === 'retrying' ? { icon: <AlertTriangle className="h-3 w-3" />, text: 'Failed, retrying', cls: 'text-amber-700 dark:text-amber-400' }
    : { icon: <AlertTriangle className="h-3 w-3" />, text: 'Not saved: this can no longer be changed here', cls: 'text-destructive' };
  return <span className={cn('inline-flex items-center gap-1 text-xs font-medium', view.cls, className)} role="status" aria-live="polite" data-testid="autosave-status" data-status={status}>{view.icon}{view.text}</span>;
}
