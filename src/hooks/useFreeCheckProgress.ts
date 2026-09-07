import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { progressFor, type FreeCheckProgressInput, type FreeCheckProgress } from '@/lib/freeCheckProgress';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   FREE-CHECK PROGRESS — what happened to each submission, refreshed while you watch.

   ⛔ THROUGH THE submissions ENDPOINT, NEVER A DIRECT READ. onboarding_responses has RLS enabled
   with NO policies, so a browser read returns 200 with an empty array — which on THIS card would
   render as "no free checks have ever been submitted", the precise thing it exists to disprove.
   That failure has already cost three features in this project.

   ⚠️ POLLING IS CONDITIONAL, AND THAT IS DELIBERATE. It refreshes every 20s ONLY while something is
   actually mid-flight, and stops when nothing is. A dashboard card that polls for ever is a battery
   and quota cost for a screen nobody is watching; the whole point here is the minutes after a test
   submission, and outside those minutes the data is static.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

const POLL_MS = 20_000;

export interface FreeCheckRow extends FreeCheckProgressInput {
  progress: FreeCheckProgress;
}

export function useFreeCheckProgress() {
  const { user } = useAuth();
  const [rows, setRows] = useState<FreeCheckRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  /* ⛔ THREE STATES, NOT TWO. A failed fetch must never render as "no submissions": the card says
     it could not read rather than inventing an empty history. */
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data, error: e } = await supabase.functions.invoke('submissions', {
        body: { action: 'free_check_progress', limit: 15 },
      });
      if (e || !data?.ok) throw new Error(e?.message ?? data?.error ?? 'free_check_progress failed');
      const raw = (data.rows ?? []) as FreeCheckProgressInput[];
      setRows(raw.map((r) => ({ ...r, progress: progressFor(r) })));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  /* Keep polling only while a submission is mid-flight. `running` is the only stage that can change
     on its own — every other one is waiting for a person, so refreshing it teaches nothing. */
  const live = rows.some((r) => r.progress.stage === 'running');
  useEffect(() => {
    if (!live) { if (timer.current) { window.clearInterval(timer.current); timer.current = null; } return; }
    timer.current = window.setInterval(() => { void fetchData(); }, POLL_MS);
    return () => { if (timer.current) { window.clearInterval(timer.current); timer.current = null; } };
  }, [live, fetchData]);

  return { rows, isLoading, error, live, refetch: fetchData };
}
