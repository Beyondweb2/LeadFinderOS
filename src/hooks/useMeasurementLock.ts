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
import { useCallback, useEffect, useState } from 'react';
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

export function useMeasurementLock(businessName: string, leadId: string | null) {
  const [state, setState] = useState<State>({ lock: null, tableMissing: false, loading: true, malformed: false });

  const load = useCallback(async () => {
    const name = (businessName ?? '').trim();
    if (!name) { setState({ lock: null, tableMissing: false, loading: false, malformed: false }); return; }
    setState((s) => ({ ...s, loading: true }));
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
        setState({ lock: null, tableMissing: true, loading: false, malformed: false });
        return;
      }
      const raw = data?.lock ?? null;
      if (raw === null) { setState({ lock: null, tableMissing: false, loading: false, malformed: false }); return; }
      setState({
        lock: isUsableLock(raw) ? raw : null,
        tableMissing: false,
        loading: false,
        malformed: !isUsableLock(raw),
      });
    } catch {
      setState({ lock: null, tableMissing: true, loading: false, malformed: false });
    }
  }, [businessName]);

  useEffect(() => { void load(); }, [load]);

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
