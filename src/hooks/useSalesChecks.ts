/* ════════════════════════════════════════════════════════════════════════════════════════════════
   "CHECK BEFORE CALLING" — the browser half (2026-10-04, fix/07). The batch lives in the database
   (sales_check_batches / _items) and every decision is server-side (fn sales-prospect-check), so a
   refresh, a second tab or a closed laptop never loses it.

   ⛔ THIS HOOK ONLY ASKS. It reads the rep's newest batch; while one is open it asks the server to move
   it on every SALES_CHECK_POLL_MS (start what is queued, resolve what is running). Pressing Check twice
   sends the SAME request id, so the server makes one batch. Nothing here decides who may be checked,
   what it costs or whether a result is reused.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { EdgeFunctionError, edgeErrorMessage, invokeEdge } from '@/lib/edgeInvoke';
import { SALES_CHECK_POLL_MS, type ItemStatus } from '@/lib/salesCheck';
import { OUTREACH_AUDIT_MAP_ROOT } from '@/lib/outreachAuditMap';

export interface SalesCheckItemView {
  id: string;
  lead_id: string;
  position: number;
  status: ItemStatus;
  reason: string | null;
  message: string | null;
  business_name: string | null;
  phone: string | null;
  website: string | null;
  audit_id: string | null;
  run_id: string | null;
  audit_source: string | null;
  crawl_source: string | null;
  result_at: string | null;
}
export interface SalesCheckView {
  batch: {
    id: string; status: 'active' | 'waiting' | 'finished'; created_at: string; total: number; refresh: boolean; cancelled: boolean;
    counts: { total: number; queued: number; running: number; done: number; reused: number; failed: number; skipped: number };
  } | null;
  items: SalesCheckItemView[];
  allowance: { used: number; limit: number; remaining: number } | null;
  max: number;
}

const FN = 'sales-prospect-check';
const isOpen = (v: SalesCheckView | undefined | null) => !!v?.batch && (v.batch.status === 'active' || v.batch.status === 'waiting');

/** A request id for one press. crypto.randomUUID where there is one; never empty. */
function newRequestId(): string {
  try { if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID(); } catch { /* fall through */ }
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export function useSalesChecks(enabled: boolean) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const queryKey = useMemo(() => ['sales-checks', user?.id ?? null] as const, [user?.id]);
  const [starting, setStarting] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  /** The press in flight: a second press while it is out re-sends the same id, never a new batch. */
  const pressRef = useRef<{ id: string; key: string } | null>(null);

  const query = useQuery({
    queryKey,
    enabled: enabled && !!user,
    queryFn: async (): Promise<SalesCheckView> => {
      const prev = qc.getQueryData<SalesCheckView>(queryKey);
      const r = await invokeEdge<{ view: SalesCheckView }>(FN, { action: isOpen(prev) ? 'advance' : 'view' });
      return r.view;
    },
    refetchInterval: (q) => (isOpen(q.state.data) ? SALES_CHECK_POLL_MS : false),
    refetchOnWindowFocus: false,
    retry: 1,
  });

  /* When an item lands (ready, or started), the Outreach rows and the call screen re-read their audits. */
  const view = query.data ?? null;
  const signature = (view?.items ?? []).map((i) => `${i.id}:${i.status}`).join('|');
  const prevSig = useRef(signature);
  useEffect(() => {
    if (prevSig.current !== signature) {
      prevSig.current = signature;
      void qc.invalidateQueries({ queryKey: OUTREACH_AUDIT_MAP_ROOT });
      void qc.invalidateQueries({ queryKey: ['cold-call-playbook'] });
    }
  }, [signature, qc]);

  /** ONE CLICK (2026-10-06): the toolbar press calls this directly — no confirm dialog, no "check again"
   *  option. refresh is always false, so a recent result is reused automatically (free). */
  const start = useCallback(async (leadIds: string[]): Promise<{ ok: boolean; message?: string }> => {
    const key = [...leadIds].sort().join(',');
    if (!pressRef.current || pressRef.current.key !== key) pressRef.current = { id: newRequestId(), key };
    const body = { action: 'start', lead_ids: leadIds, refresh: false, client_request_id: pressRef.current.id };
    setStarting(true); setLastError(null);
    try {
      let r: { view: SalesCheckView } | null = null;
      try {
        r = await invokeEdge<{ view: SalesCheckView }>(FN, body);
      } catch (e) {
        /* A dropped connection is retried ONCE with the same id — the server answers the batch it made. */
        if (e instanceof EdgeFunctionError && e.status !== null) throw e;
        r = await invokeEdge<{ view: SalesCheckView }>(FN, body);
      }
      qc.setQueryData(queryKey, r.view);
      pressRef.current = null;
      return { ok: true };
    } catch (e) {
      const message = edgeErrorMessage(e, 'Couldn\'t start the checks');
      setLastError(message);
      if (e instanceof EdgeFunctionError && e.code === 'batch_active') void qc.invalidateQueries({ queryKey });
      if (e instanceof EdgeFunctionError && e.status !== null) pressRef.current = null; // a real answer: the next press is new
      return { ok: false, message };
    } finally {
      setStarting(false);
    }
  }, [qc, queryKey]);

  const cancel = useCallback(async (batchId: string) => {
    try {
      const r = await invokeEdge<{ view: SalesCheckView }>(FN, { action: 'cancel', batch_id: batchId });
      qc.setQueryData(queryKey, r.view);
    } catch (e) {
      setLastError(edgeErrorMessage(e, 'Couldn\'t stop the checks'));
    }
  }, [qc, queryKey]);

  return {
    view,
    loading: query.isLoading,
    error: query.error ? edgeErrorMessage(query.error, 'Couldn\'t load your checks') : null,
    lastError,
    starting,
    isOpen: isOpen(view),
    start,
    cancel,
    refresh: () => qc.invalidateQueries({ queryKey }),
  };
}
