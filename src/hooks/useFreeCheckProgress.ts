import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
/** Stable empty — a new array per render would re-run every consumer's memo. */
const EMPTY_ROWS: FreeCheckRow[] = [];

export interface FreeCheckRow extends FreeCheckProgressInput {
  progress: FreeCheckProgress;
}

export function useFreeCheckProgress() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ['free-check-progress', user?.id ?? null] as const, [user?.id]);

  /* ⛔ ON REACT QUERY SINCE 2026-09-10, and this one THROWS on failure where the neighbouring
     hooks return an error field. That is not inconsistency — it is what preserves the rule at
     the top of this file. React Query keeps the last successful `data` alongside `error`, so a
     failed refresh shows the previous rows plus "could not read", which is exactly the three
     states the card needs. Returning an error field here would have replaced good rows with an
     empty array on the first hiccup: "no free checks have ever been submitted", the precise
     thing this card exists to disprove. */
  const query = useQuery({
    queryKey,
    enabled: !!user?.id,
    queryFn: async (): Promise<FreeCheckRow[]> => {
      const { data, error: e } = await supabase.functions.invoke('submissions', {
        body: { action: 'free_check_progress', limit: 15 },
      });
      if (e || !data?.ok) throw new Error(e?.message ?? data?.error ?? 'free_check_progress failed');
      const raw = (data.rows ?? []) as FreeCheckProgressInput[];
      return raw.map((r) => ({ ...r, progress: progressFor(r) }));
    },
    /* ⚠️ THE CONDITIONAL POLL SURVIVES, as a property of the query rather than a useRef timer
       and two effects. Same rule: refresh only while something is genuinely mid-flight, because
       `running` is the only stage that can change on its own — every other one is waiting for a
       person. A card that polls for ever is battery and quota for a screen nobody is watching.
       `refetchIntervalInBackground` is left off, so a hidden tab stops too. */
    refetchInterval: (q) =>
      (q.state.data ?? []).some((r) => r.progress.stage === 'running') ? POLL_MS : false,
  });

  const rows = query.data ?? EMPTY_ROWS;
  const isLoading = !!user?.id && query.isPending;
  const error = query.error ? (query.error as Error).message : null;
  const live = rows.some((r) => r.progress.stage === 'running');

  const refetch = useCallback(
    () => { void queryClient.invalidateQueries({ queryKey }); },
    [queryClient, queryKey],
  );

  /* ⛔ THE RESEND SENDS A REAL EMAIL TO A REAL PROSPECT, so it returns its outcome rather than
     firing and forgetting: the caller confirms first and shows what happened after.
     ⚠️ THE INVALIDATION IS AWAITED, not fired and forgotten — the caller renders the outcome
     immediately after this resolves, and an un-awaited invalidate would let it paint the row's
     OLD resend count next to a message saying the resend succeeded. */
  const resendResult = useCallback(async (auditId: string) => {
    const { data, error: e } = await supabase.functions.invoke('submissions', {
      body: { action: 'resend_free_check_result', audit_id: auditId },
    });
    if (e || !data?.ok) throw new Error(e?.message ?? data?.error ?? 'resend failed');
    await queryClient.invalidateQueries({ queryKey });
    return data.outcome as { kind: string; emailed?: boolean; reason?: string };
  }, [queryClient, queryKey]);

  return { rows, isLoading, error, live, refetch, resendResult };
}
