import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/* ============================================================
   RUNNING the on-demand directory check. READING it is usePlaybook's job — the fold needs the
   result before it can compute a single counter, so there is exactly one reader and this hook does
   not duplicate it.

   ON DEMAND ONLY, AND NEVER AUTOMATICALLY. There is no effect in this hook. `run` is called from a
   button behind a confirm and from nowhere else: no cron, no bulk, no run-on-mount, no re-run when
   a result already exists. Re-checking is a separate explicit click.
   ============================================================ */

export interface UseDirectoryCheckResult {
  running: boolean;
  /** The REAL error from the last attempt, in plain English. Null when the last run was clean. */
  error: string | null;
  run: () => Promise<void>;
  clearError: () => void;
}

/** @param onDone called after every attempt, clean or not — a refused or errored run still writes a
 *  row the operator should see, so the caller reloads either way. */
export function useDirectoryCheck(
  leadId: string | null | undefined,
  onDone: () => void,
): UseDirectoryCheckResult {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (!leadId || running) return;
    setRunning(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions
        .invoke<{ ok?: boolean; status?: string; error?: string }>(
          'check-directory-listings', { body: { lead_id: leadId } });

      /* THE REAL ERROR, NOT THE WRAPPER STRING. supabase-js sets `error` on ANY non-2xx and its
         .message is the useless "Edge Function returned a non-2xx status code" — the real message is
         in the response body, reachable via error.context. Reading only .message is exactly what
         made the bulk-audit failure unreadable for a day. The function answers 200 with ok:false for
         handled failures, so this branch is mostly genuine transport trouble. */
      if (fnErr) {
        let real = fnErr.message;
        try {
          const ctx = (fnErr as unknown as { context?: Response }).context;
          if (ctx && typeof ctx.text === 'function') {
            const body = await ctx.text();
            const parsed = body ? JSON.parse(body) as { error?: string } : null;
            if (parsed?.error) real = parsed.error;
          }
        } catch { /* keep the wrapper message if the body cannot be read */ }
        setError(real);
        return;
      }
      if (data && data.ok === false) setError(data.error ?? 'The check did not complete.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      onDone();
    }
  }, [leadId, running, onDone]);

  return { running, error, run, clearError: () => setError(null) };
}
