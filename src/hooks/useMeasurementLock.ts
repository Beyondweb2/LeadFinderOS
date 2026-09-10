/* ════════════════════════════════════════════════════════════════════════════════════════════════
   READ AND WRITE THE LOCKED BASELINE.

   ⛔ A MISSING TABLE LEAVES THE FEATURE DORMANT, NEVER BROKEN. The SQL is hand-run (CLAUDE.md §6),
   so this code will exist before the table does on at least one deploy. A failed read therefore
   sets `tableMissing` and the lock reads as absent — and the UI says "run the SQL" rather than
   throwing, which is the convention the page-plan queue already uses.

   ⛔ AND "NO LOCK" IS DISTINGUISHED FROM "COULD NOT TELL". They are different facts and only one
   of them means it is safe to say a re-measure is like-for-like. §8 records three features that
   silently did nothing because an RLS-denied read returns HTTP 200 with [] — the same shape as an
   empty table — so this hook reports which it saw rather than folding both into null.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { isUsableLock, type MeasurementLock } from '@/lib/measurementLock';

interface State {
  lock: MeasurementLock | null;
  /** True when the read failed in a way that looks like the table not existing yet. */
  tableMissing: boolean;
  loading: boolean;
  /** Set when a stored value existed but did not validate — a real problem, not an absence. */
  malformed: boolean;
}

/** Stable resting state, so a nameless render and a genuinely empty result share one identity. */
const NO_LOCK: State = { lock: null, tableMissing: false, loading: false, malformed: false };

export function useMeasurementLock(businessName: string, leadId: string | null) {
  const queryClient = useQueryClient();
  const name = (businessName ?? '').trim();
  const queryKey = useMemo(() => ['measurement-lock', name.toLowerCase()] as const, [name]);

  /* ⛔ ON REACT QUERY SINCE 2026-09-10. It re-read the lock every time the audit's re-audit
     dialog mounted, which is on every visit to a results screen.
     ⚠️ THE THREE OUTCOMES STAY THREE, and they are the reason this returns a state object
     rather than throwing. `tableMissing` (we cannot tell whether a lock exists), `malformed` (a
     stored lock we refuse to trust) and a plain absent lock are DIFFERENT answers, and the one
     thing none of them may collapse into is "there is no lock" — a validated-but-empty lock
     would make every future diff report "identical" and sign off the exact drift the feature
     exists to catch (CLAUDE.md §17). Throwing would flatten all three into one error channel. */
  const query = useQuery({
    queryKey,
    enabled: !!name,
    queryFn: async (): Promise<State> => {
      try {
        const client = supabase as unknown as typeof supabase;
        const { data, error } = await (client as never as {
          from: (t: string) => {
            select: (c: string) => {
              ilike: (c: string, v: string) => {
                maybeSingle: () => Promise<{ data: { lock: unknown } | null; error: { message?: string } | null }>;
              };
            };
          };
        }).from('measurement_locks').select('lock').ilike('business_name', name).maybeSingle();

        if (error) {
          /* A missing relation and a permission refusal look different in the message but mean the
             same thing here: we cannot tell whether a lock exists, so we must not claim one does
             not. Either way the feature is dormant and the UI says so. */
          return { lock: null, tableMissing: true, loading: false, malformed: false };
        }
        const raw = data?.lock ?? null;
        if (raw === null) return NO_LOCK;
        return {
          lock: isUsableLock(raw) ? raw : null,
          tableMissing: false,
          loading: false,
          malformed: !isUsableLock(raw),
        };
      } catch {
        return { lock: null, tableMissing: true, loading: false, malformed: false };
      }
    },
  });

  /* A blank business name is a resting state, not a load: there is nothing to look up. */
  const state: State = name
    ? (query.data ?? { lock: null, tableMissing: false, loading: query.isPending, malformed: false })
    : NO_LOCK;

  const load = useCallback(
    async () => { await queryClient.invalidateQueries({ queryKey }); },
    [queryClient, queryKey],
  );

  /** Write (or replace) the lock for this business. Returns an error string, or null on success. */
  const save = useCallback(async (lock: MeasurementLock): Promise<string | null> => {
    if (!isUsableLock(lock)) return 'That question set cannot be locked — it has no usable questions.';
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) return 'Not signed in.';
    try {
      const client = supabase as unknown as {
        from: (t: string) => {
          upsert: (v: Record<string, unknown>, o: { onConflict: string }) => Promise<{ error: { message?: string } | null }>;
        };
      };
      const { error } = await client.from('measurement_locks').upsert({
        user_id: userId,
        business_name: (businessName ?? '').trim(),
        lead_id: leadId,
        source_audit_id: lock.sourceAuditId,
        lock,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,business_name' });
      if (error) return error.message ?? 'Could not save the lock (has the SQL been run?)';
      await load();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Could not save the lock.';
    }
  }, [businessName, leadId, load]);

  return { ...state, reload: load, save };
}
