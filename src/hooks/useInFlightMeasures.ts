import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { groupInFlight, type AuditRow, type InFlightMeasure, type QueueRow, type RunRow } from '@/lib/inFlightMeasures';

export { inFlightKey, groupInFlight, type InFlightMeasure } from '@/lib/inFlightMeasures';

/* ============================================================
   WHAT IS MEASURING RIGHT NOW — derived from live audit state, never stored.

   Paul's rule, 2026-08-17: after navigating away and back, the Coverage page must still show which
   market is mid-measure. The measure itself always survived navigation (the queue cron owns the
   work; the browser only watches) — what was lost was the WATCHING, because the spinner lived in
   session state. This hook re-derives it from the three tables that ARE the truth:

     ai_audit_runs   status pending/running  → something is in flight
     ai_audits       is_market === true      → it is a MARKET measure, not a business audit or a
                                               paid baseline (those must never appear here)
     ai_audit_queue  per-run row statuses    → how far through

   All three are owner-scoped RLS reads the SPA already makes elsewhere (MeasureMarket polls the
   queue; the AI Audit page reads audits and runs). Free, no server changes.

   ⛔ POLLED EVERY 30s ONLY WHILE NON-EMPTY. An empty list stops the interval dead — a page with
   nothing measuring makes zero background requests. refresh() restarts it, and is called by the
   things that start measures. Nothing is persisted anywhere: a reload re-derives, which is what
   makes the indicator self-healing — a run that finishes, stalls, or was started from the market
   panel instead of Coverage simply shows up as what it now is.
   ============================================================ */

const POLL_MS = 30_000;

export function useInFlightMeasures(): { inFlight: InFlightMeasure[]; refresh: () => Promise<void> } {
  const [inFlight, setInFlight] = useState<InFlightMeasure[]>([]);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const refresh = useCallback(async () => {
    try {
      const { data: runs } = await supabase
        .from('ai_audit_runs')
        .select('id, audit_id, status, created_at')
        .in('status', ['pending', 'running']);
      if (!alive.current) return;
      if (!runs?.length) { setInFlight([]); return; }
      const auditIds = [...new Set(runs.map((r) => r.audit_id))];
      const { data: audits } = await supabase
        .from('ai_audits')
        .select('id, business_type, location_text, is_market')
        .in('id', auditIds);
      /* Through unknown: is_market was added by hand-run SQL, so the GENERATED types do not know
         it and supabase-js types this select as an error. Same pattern as AiAudit.tsx's casts. */
      const marketAudits = ((audits ?? []) as unknown as AuditRow[]).filter((a) => a.is_market === true);
      if (!alive.current) return;
      if (!marketAudits.length) { setInFlight([]); return; }
      const marketIds = new Set(marketAudits.map((a) => a.id));
      const runIds = (runs as RunRow[]).filter((r) => marketIds.has(r.audit_id)).map((r) => r.id);
      const { data: q } = await supabase
        .from('ai_audit_queue')
        .select('run_id, status')
        .in('run_id', runIds);
      if (!alive.current) return;
      setInFlight(groupInFlight(runs as RunRow[], marketAudits, (q ?? []) as QueueRow[], Date.now()));
    } catch {
      /* A failed read keeps the previous list rather than blanking a real measure off the screen;
         the next tick retries. */
    }
  }, []);

  /* Load once on mount; keep a 30s interval ONLY while something is measuring. */
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (inFlight.length === 0) return;
    const t = setInterval(() => { void refresh(); }, POLL_MS);
    return () => clearInterval(t);
  }, [inFlight.length, refresh]);

  return { inFlight, refresh };
}
