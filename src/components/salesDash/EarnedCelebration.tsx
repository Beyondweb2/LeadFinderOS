import { useEffect, useRef, useState } from 'react';
import { PartyPopper, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { CommissionLine } from '@/lib/commission';

/* ══ "+£29.70 earned" — ONCE (Sales Experience, 2026-09-28) ═══════════════════════════════════════
   Shown when commission from a REAL payment (a ledger line, status due/paid) is newer than the last
   one this person was shown (user_preferences.commission_seen_at, their own row). Saving the newest
   line's time first means a reload, a second tab or another device never replays it.
   ⛔ Never for a reversal, never for projected, never on someone else's numbers (the admin viewing a
   rep). First visit ever: only commission from the last 7 days celebrates — history is not a surprise.
   Reduced motion: no count-up, no float — the words alone. */
// user_preferences is not in the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;
const FIRST_VISIT_WINDOW_MS = 7 * 86_400_000;

export function EarnedCelebration({ lines, enabled }: { lines: CommissionLine[] | undefined; enabled: boolean }) {
  const { user } = useAuth();
  const [show, setShow] = useState<{ amount: number; count: number } | null>(null);
  const [shown, setShown] = useState(0);
  const done = useRef(false);

  useEffect(() => {
    if (!enabled || !user?.id || !lines || done.current) return;
    done.current = true;
    const earned = lines.filter((l) => l.kind === 'payment' && l.commission > 0 && (l.status === 'due' || l.status === 'paid'));
    if (earned.length === 0) return;
    void (async () => {
      const { data } = await sb.from('user_preferences').select('commission_seen_at').eq('user_id', user.id).maybeSingle();
      const seen = data?.commission_seen_at ? Date.parse(data.commission_seen_at) : Date.now() - FIRST_VISIT_WINDOW_MS;
      const fresh = earned.filter((l) => Date.parse(l.occurredAt) > seen);
      const newest = earned.reduce((m, l) => (l.occurredAt > m ? l.occurredAt : m), earned[0].occurredAt);
      // Claim first: whatever happens next, this commission is never celebrated twice.
      const { error } = await sb.from('user_preferences').upsert({ user_id: user.id, commission_seen_at: newest, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error || fresh.length === 0) return;
      setShow({ amount: Math.round(fresh.reduce((s, l) => s + l.commission, 0) * 100) / 100, count: fresh.length });
    })();
  }, [enabled, user?.id, lines]);

  useEffect(() => {
    if (!show) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setShown(show.amount); return; }
    const start = performance.now(); const dur = 900; let raf = 0;
    const step = (t: number) => { const k = Math.min(1, (t - start) / dur); setShown(Math.round(show.amount * (1 - Math.pow(1 - k, 3)) * 100) / 100); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    const close = window.setTimeout(() => setShow(null), 9000);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(close); };
  }, [show]);

  if (!show) return null;
  return (
    <div role="status" aria-live="polite" className="fixed inset-x-0 top-4 z-[60] flex justify-center px-4 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-4">
      <div className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-700 px-5 py-3.5 text-white shadow-xl ring-1 ring-emerald-300/40">
        <PartyPopper className="h-6 w-6 shrink-0" />
        <div>
          <p className="text-2xl font-bold tabular-nums leading-none">+£{shown.toFixed(2)} earned</p>
          <p className="mt-1 text-xs text-emerald-50/90">{show.count === 1 ? 'A client payment just landed.' : `${show.count} client payments landed.`} It is in your next payout.</p>
        </div>
        <button type="button" onClick={() => setShow(null)} className="ml-1 rounded-md p-1 text-emerald-50/80 hover:bg-white/10 hover:text-white" aria-label="Dismiss"><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}
