import { lazy, Suspense, useEffect, useState } from 'react';
import { MessageSquarePlus, Sparkles } from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';
import { cn } from '@/lib/utils';

/* ══ THE SMALL, ALWAYS-LOADED HALF OF FEEDBACK + WHAT'S NEW (2026-10-22, perf audit) ═══════════════
   The dialogs (FeedbackAndNews.tsx) and the What's New text (src/lib/whatsNew.ts, ~234 KB of source) used to be in
   the first download of every page. They now load when someone opens one of them: the host below listens for the two
   window events, loads the dialog code, and opens it on arrival. The two menu buttons stay here, tiny; the "new" dot
   learns the newest entry from the What's New chunk after the page has painted. */
export const OPEN_FEEDBACK_EVENT = 'open-feedback';
export const OPEN_WHATS_NEW_EVENT = 'open-whats-new';
export const SEEN_KEY = 'lf-whats-new-seen';
export const seenId = () => { try { return localStorage.getItem(SEEN_KEY); } catch { return null; } };

const LazyFeedbackAndNews = lazy(() => import('@/components/FeedbackAndNews').then((m) => ({ default: m.FeedbackAndNews })));

/** In the shell, once. Renders nothing until the first open; then the real dialogs take over their own events. */
export function FeedbackAndNewsHost() {
  const [want, setWant] = useState<'feedback' | 'news' | null>(null);
  useEffect(() => {
    if (want) return;
    const f = () => setWant('feedback'); const n = () => setWant('news');
    window.addEventListener(OPEN_FEEDBACK_EVENT, f); window.addEventListener(OPEN_WHATS_NEW_EVENT, n);
    return () => { window.removeEventListener(OPEN_FEEDBACK_EVENT, f); window.removeEventListener(OPEN_WHATS_NEW_EVENT, n); };
  }, [want]);
  if (!want) return null;
  return <Suspense fallback={null}><LazyFeedbackAndNews initial={want} /></Suspense>;
}

/** The two menu entries (sidebar footer). The dot shows until the newest What's New entry is seen. */
export function FeedbackNewsButtons({ className }: { className?: string }) {
  const { role } = useSubscription();
  const [seen, setSeen] = useState(seenId);
  const [newest, setNewest] = useState<string | undefined>(undefined);
  useEffect(() => { const f = () => setSeen(seenId()); window.addEventListener('whats-new-seen', f); return () => window.removeEventListener('whats-new-seen', f); }, []);
  useEffect(() => {
    let on = true;
    void import('@/lib/whatsNew').then((m) => { if (on) setNewest(m.whatsNewFor(role)[0]?.id); }).catch(() => { /* no dot */ });
    return () => { on = false; };
  }, [role]);
  return (
    <div className={cn('grid grid-cols-2 gap-1.5', className)}>
      <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_FEEDBACK_EVENT))} className="flex items-center justify-center gap-1.5 rounded-lg border border-border/60 px-2 py-1.5 text-xs font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent/60"><MessageSquarePlus className="h-3.5 w-3.5" />Feedback</button>
      <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_WHATS_NEW_EVENT))} className="relative flex items-center justify-center gap-1.5 rounded-lg border border-border/60 px-2 py-1.5 text-xs font-medium text-sidebar-foreground/80 hover:bg-sidebar-accent/60">
        <Sparkles className="h-3.5 w-3.5" />What's new{newest && seen !== newest && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-violet-500" aria-label="New" />}
      </button>
    </div>
  );
}
