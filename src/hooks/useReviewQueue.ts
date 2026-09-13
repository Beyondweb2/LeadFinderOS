/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE REVIEW QUEUE'S READS. The decision itself is pure and lives in src/lib/reviewQueue.ts; this
   only fetches, in three steps, and computes nothing it could get wrong.

   ⛔ IT DOES NOT GO THROUGH useOutreach, DELIBERATELY. That hook is 1,600 lines on the screen Paul
   works in all day and is the one hook still not on React Query (§6c) — mounting it in AppLayout,
   which wraps EVERY route, would put its whole lead load and its 38 optimistic updates behind every
   page in the app. This reads seven columns of its own instead.

   ⛔ AND IT NEVER SPENDS. Three plain selects, RLS-scoped to the operator. Nothing here starts an
   audit, and the house rule that a view never spends on arrival (§6e) is why the tab can appear on
   every screen without anyone having to think about it.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from "@/hooks/useAuth";
import { fetchAllRows } from '@/lib/fetchAllRows';
import { buildBaselineView, type BaselineView, type QueueRowLite } from '@/lib/baselineView';
import { reviewQueue, type AuditFact, type ReviewEntry, type ReviewLead } from '@/lib/reviewQueue';

export interface ReviewItem extends ReviewEntry {
  /** The winnable-questions numbers: named % and the five band counts. Null while still loading. */
  view: BaselineView | null;
}

/* ⚠️ THE COLUMN LIST IS EXACTLY WHAT reviewQueue READS, PLUS status. isPaidLead needs `status` or it
   falls back to "paid" for a refunded client — its own doc warns that a caller which forgets the
   column gets the old behaviour, and this is a caller that must not. */
const LEAD_COLUMNS =
  'id, business_name, status, amount_paid, is_archived, baseline_audit_id, full_measure_audit_id, delivery_checklist';

export function useReviewQueue() {
  const { user } = useAuth();
  const client = supabase as unknown as SupabaseClient;

  /* Step 1 — the candidate leads. Narrowed server-side to rows that carry BOTH pointers, which is
     the cheapest possible filter and already excludes every legacy client. */
  const leads = useQuery({
    queryKey: ['review-queue-leads', user?.id ?? null],
    enabled: !!user,
    staleTime: 60_000,
    queryFn: async (): Promise<ReviewLead[]> => {
      const { data, error } = await client
        .from('outreach_leads')
        .select(LEAD_COLUMNS)
        .not('baseline_audit_id', 'is', null)
        .not('full_measure_audit_id', 'is', null)
        .eq('is_archived', false)
        .gt('amount_paid', 0);
      if (error) throw error;
      return (data ?? []) as unknown as ReviewLead[];
    },
  });

  const pointerIds = useMemo(
    () => [...new Set((leads.data ?? []).flatMap((l) => [l.baseline_audit_id, l.full_measure_audit_id])
      .filter((v): v is string => !!v))].sort(),
    [leads.data],
  );

  /* Step 2 — are both audits frozen? One column, baseline_completed_at, read for both pointers.
     That column is the single definition of done in this codebase; asking anything else here would
     be inventing a second one. */
  const audits = useQuery({
    queryKey: ['review-queue-audits', user?.id ?? null, pointerIds.join(',')],
    enabled: !!user && pointerIds.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, AuditFact>> => {
      const { data, error } = await client
        .from('ai_audits').select('id, baseline_completed_at').in('id', pointerIds);
      if (error) throw error;
      const out: Record<string, AuditFact> = {};
      for (const a of (data ?? []) as Array<{ id: string; baseline_completed_at: string | null }>) {
        out[a.id] = { id: a.id, frozenAt: a.baseline_completed_at };
      }
      return out;
    },
  });

  const entries = useMemo(
    () => reviewQueue(leads.data ?? [], audits.data ?? {}),
    [leads.data, audits.data],
  );

  const measureIds = useMemo(() => entries.map((e) => e.fullMeasureAuditId).sort(), [entries]);

  /* Step 3 — the numbers, from the FULL MEASURE's queue rows. Only for clients already in the
     queue, so a client who is not waiting on Paul costs nothing to display.
     ⛔ PAGINATED. ai_audit_queue is questions x runs — 20 x 3 per client — and it is the table
     likeliest to cross the 1000-row cap PostgREST truncates at silently. A truncated read here
     would shrink a denominator and make a market look more winnable than it is, in front of a
     refund decision. */
  const views = useQuery({
    queryKey: ['review-queue-views', user?.id ?? null, measureIds.join(',')],
    enabled: !!user && measureIds.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, BaselineView>> => {
      const out: Record<string, BaselineView> = {};
      for (const auditId of measureIds) {
        const { rows } = await fetchAllRows<QueueRowLite>('Review queue (queue rows)', (from, to) =>
          client.from('ai_audit_queue')
            .select('run_id, question, engines, status, result')
            .eq('audit_id', auditId)
            .order('id', { ascending: true })
            .range(from, to));
        out[auditId] = buildBaselineView(rows);
      }
      return out;
    },
  });

  const items: ReviewItem[] = useMemo(
    () => entries.map((e) => ({ ...e, view: views.data?.[e.fullMeasureAuditId] ?? null })),
    [entries, views.data],
  );

  return {
    items,
    /* ⚠️ A FAILED READ IS NOT AN EMPTY QUEUE. The tab must be able to tell "nobody is waiting" from
       "we could not find out", or an RLS surprise or a dropped connection would silently look like
       an empty in-tray — the 200-with-[] trap (§8) on the surface whose whole job is to tell Paul
       somebody is waiting. */
    error: (leads.error ?? audits.error ?? views.error) as Error | null,
    isLoading: leads.isLoading || (pointerIds.length > 0 && audits.isLoading),
  };
}
