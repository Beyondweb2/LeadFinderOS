import { useEffect, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  INLINE_MS, dismissInline, getInlineNotices, noteAction, subscribeNotices, type InlineNotice,
} from '@/lib/actionNotices';

/* ══ INLINE NOTICES (Paul, 2026-11-15): no bottom-right pop-ups ═════════════════════════════════════
   An error (or an Undo) shows right beside the control the person just used; with no such control on
   the page, as a slim bar under the top of the page. Successes go to the bell only (src/lib/actionNotices.ts).
   Mounted once in App.tsx, where the Toaster used to be. */

const CONTROL = 'button,a,[role="button"],[role="menuitem"],[role="tab"],[role="switch"],[role="checkbox"],input,select,textarea,label';

/** Track the last control used, so a notice raised by its handler can sit beside it. */
function useActionTracker() {
  useEffect(() => {
    const onDown = (e: Event) => {
      const t = e.target instanceof Element ? e.target : null;
      noteAction(t?.closest(CONTROL) ?? t);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') noteAction(document.activeElement);
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('pointerdown', onDown, true); document.removeEventListener('keydown', onKey, true); };
  }, []);
}

/** A toast's action (a Radix ToastAction, which only works inside a Toast) redrawn as a plain button. */
function ActionButton({ action, onDone }: { action: unknown; onDone: () => void }) {
  const p = (action && typeof action === 'object' && 'props' in action ? (action as { props: { onClick?: () => void; children?: ReactNode; altText?: string } }).props : null);
  if (!p) return null;
  return (
    <button type="button" onClick={() => { p.onClick?.(); onDone(); }} aria-label={p.altText}
      className="rounded border border-current/40 px-2 py-0.5 text-xs font-semibold hover:bg-muted">{p.children}</button>
  );
}

function Body({ n }: { n: InlineNotice }) {
  return (
    <div className="flex items-start gap-2">
      {n.error ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <Info className="mt-0.5 h-4 w-4 shrink-0" />}
      <div className="min-w-0 flex-1 text-xs leading-snug">
        {n.title ? <div className="font-semibold">{n.title as ReactNode}</div> : null}
        {n.description ? <div className="mt-0.5 opacity-90">{n.description as ReactNode}</div> : null}
        {n.action ? <div className="mt-1.5"><ActionButton action={n.action} onDone={() => dismissInline(n.id)} /></div> : null}
      </div>
      <button type="button" onClick={() => dismissInline(n.id)} className="rounded p-0.5 opacity-70 hover:opacity-100" aria-label="Close">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

const tone = (error: boolean) => error
  ? 'border-destructive/40 bg-background text-destructive shadow-md dark:bg-zinc-900'
  : 'border-border bg-background text-foreground shadow-md dark:bg-zinc-900';

/** One notice pinned under its control; it follows the control on scroll and goes when the control does. */
function Anchored({ n }: { n: InlineNotice }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    let raf = 0;
    const place = () => {
      const el = n.anchor as Element | null;
      if (!el || !el.isConnected) { dismissInline(n.id); return; }
      const r = el.getBoundingClientRect();
      const w = Math.min(340, window.innerWidth - 16);
      setPos({ top: Math.min(r.bottom + 6, window.innerHeight - 80), left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) });
    };
    const tick = () => { place(); raf = requestAnimationFrame(tick); };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [n]);
  if (!pos) return null;
  return (
    <div role={n.error ? 'alert' : 'status'} data-inline-notice={n.error ? 'error' : 'info'}
      className={cn('fixed z-[200] w-[min(340px,calc(100vw-16px))] rounded-md border px-3 py-2', tone(n.error))}
      style={{ top: pos.top, left: pos.left }}>
      <Body n={n} />
    </div>
  );
}

export function ActionNotices() {
  useActionTracker();
  const list = useSyncExternalStore(subscribeNotices, getInlineNotices, getInlineNotices);
  // Each notice closes itself after a while.
  useEffect(() => {
    const timers = list.map((n) => window.setTimeout(() => dismissInline(n.id), Math.max(0, n.at + (n.error ? INLINE_MS.error : INLINE_MS.other) - Date.now())));
    return () => { for (const t of timers) window.clearTimeout(t); };
  }, [list]);
  if (typeof document === 'undefined' || !list.length) return null;
  const top = list.filter((n) => !n.anchor);
  return createPortal(
    <>
      {list.filter((n) => n.anchor).map((n) => <Anchored key={n.id} n={n} />)}
      {top.length > 0 && (
        <div className="fixed inset-x-0 top-2 z-[200] mx-auto flex w-[min(560px,calc(100vw-16px))] flex-col gap-1.5">
          {top.map((n) => (
            <div key={n.id} role={n.error ? 'alert' : 'status'} data-inline-notice={n.error ? 'error' : 'info'} className={cn('rounded-md border px-3 py-2', tone(n.error))}>
              <Body n={n} />
            </div>
          ))}
        </div>
      )}
    </>,
    document.body,
  );
}
