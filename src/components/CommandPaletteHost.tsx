import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';
import { canOpenRoute } from '@/lib/access';
import { goTarget, isPaletteKey, isTypingTarget } from '@/lib/shortcuts';
import { cn } from '@/lib/utils';

/* ══ THE SMALL, ALWAYS-LOADED HALF OF THE COMMAND PALETTE (2026-10-22, perf audit) ═══════════════════
   The palette itself (CommandPalette.tsx) loads the first time it is asked for — Ctrl/Cmd+K, "?", or the Search
   button. This file keeps what must work from the first second: the button, and the safe "g then x" page shortcuts
   (opening pages only — nothing here sends, saves or changes a lead). Ctrl/Cmd+K and "?" are caught here only until the
   palette exists; after that it handles them itself. */
export const OPEN_PALETTE_EVENT = 'open-command-palette';

const LazyCommandPalette = lazy(() => import('@/components/CommandPalette').then((m) => ({ default: m.CommandPalette })));

export function CommandPaletteHost() {
  const navigate = useNavigate();
  const { role } = useSubscription();
  const [want, setWant] = useState<'open' | 'help' | null>(null);
  const wantRef = useRef(want);
  wantRef.current = want;
  const last = useRef<{ key: string | null; at: number }>({ key: null, at: 0 });
  useEffect(() => {
    const onOpen = () => { if (!wantRef.current) setWant('open'); };
    const onKey = (e: KeyboardEvent) => {
      if (isPaletteKey(e)) { if (!wantRef.current) { e.preventDefault(); setWant('open'); } return; }
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '?') { if (!wantRef.current) { e.preventDefault(); setWant('help'); } return; }
      const to = goTarget(last.current.key, last.current.at, e.key, Date.now());
      if (to && canOpenRoute(role, to)) { e.preventDefault(); navigate(to); last.current = { key: null, at: 0 }; return; }
      last.current = { key: e.key.toLowerCase(), at: Date.now() };
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener(OPEN_PALETTE_EVENT, onOpen); };
  }, [role, navigate]);
  if (!want) return null;
  return <Suspense fallback={null}><LazyCommandPalette initial={want} /></Suspense>;
}

/** A button that opens the palette (the phone top bar, the sidebar). */
export function PaletteButton({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))} aria-label="Search leads and pages (Ctrl K)"
      className={cn('inline-flex items-center gap-2 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground', compact ? 'h-10 w-10 justify-center' : 'h-9 w-full border border-border/60 px-2.5', className)}>
      <Search className="h-4 w-4" />{!compact && <><span className="flex-1 text-left">Search…</span><kbd className="rounded border border-border px-1 text-[10px]">Ctrl K</kbd></>}
    </button>
  );
}
