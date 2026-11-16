import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { fetchAllRowsParallel } from '@/lib/fetchAllRows';
import type { ScoredAudit } from '@/lib/auditScore';
import { oppAuditByLead, type OppAuditInput } from '@/lib/oppAuditInputs';
import { fetchSuppressedLeadIds } from '@/lib/leadSuppression';
import { LEAD_CRAWL_LIST_SELECT, type LeadCrawlListRow } from '@/hooks/useLeadCrawls';
import type { CrawlRow } from '@/lib/crawlResult';

/* THE OPPORTUNITY SCORE'S TWO EXTRA READS (2026-11-16, docs/OPPORTUNITY_SCORE.md). The website check rides the lists'
   existing crawl read (useLeadCrawls); this adds:
     1. each lead's STORED audit score (ai_audit_runs.hook_score, the one ruler in auditScore.ts) — small columns only,
        ⛔ never `results` (docs/rules/engineering.md: never read a small key out of results in bulk);
     2. the opt-out / Do Not Contact list through the role-checked leads_suppressed (never contact_suppressions).
   A failed read = that input missing → the score says "Incomplete" / the suppression is unknown; never a guess. */

export const OPP_AUDIT_SELECT = 'id, lead_id, created_at, verdict_counts, is_market, audit_purpose, baseline_target_runs, is_measurement, baseline_contract, ai_audit_runs(id, status, run_number, created_at, hook_score, score_dirty_at)';
export const OPP_INPUTS_STALE_MS = 5 * 60_000;

/** A lead's audit score plus its newest Discovery's stored verdict counts (ai_audits.verdict_counts, small jsonb), and the
 *  prospect re-check that replaced its hook, if any (opportunityForLead.oppAuditByLead). */
export type OppLeadAudit = OppAuditInput;

const withVerdicts = (rows: readonly ScoredAudit[]): Map<string, OppLeadAudit> => oppAuditByLead(rows);

async function fetchAuditScores(leadIds?: readonly string[]): Promise<Map<string, OppLeadAudit>> {
  const sb = supabase as unknown as SupabaseClient;
  if (leadIds) {
    const out: ScoredAudit[] = [];
    for (let i = 0; i < leadIds.length; i += 200) {
      const { data, error } = await sb.from('ai_audits').select(OPP_AUDIT_SELECT).in('lead_id', leadIds.slice(i, i + 200)).order('created_at', { ascending: false });
      if (error) throw error;
      out.push(...((data ?? []) as unknown as ScoredAudit[]));
    }
    return withVerdicts(out);
  }
  const { rows } = await fetchAllRowsParallel<{ id: string }>('Opportunity (audit scores)', (from, to) => sb
    .from('ai_audits').select(OPP_AUDIT_SELECT)
    .order('created_at', { ascending: false }).order('id', { ascending: true }).range(from, to), (a) => a.id);
  return withVerdicts(rows as unknown as ScoredAudit[]);
}

/** Every lead's audit score (Outreach) — or only these leads' (Find Leads: `leadIds`). */
export function useOpportunityAuditScores(opts: { enabled?: boolean; leadIds?: readonly string[] } = {}) {
  const { user } = useAuth();
  const key = opts.leadIds ? [...opts.leadIds].sort().join(',') : 'all';
  const q = useQuery({
    queryKey: ['opportunity-audit-scores', user?.id ?? null, key],
    queryFn: () => fetchAuditScores(opts.leadIds),
    enabled: !!user?.id && opts.enabled !== false && (!opts.leadIds || opts.leadIds.length > 0),
    staleTime: OPP_INPUTS_STALE_MS,
  });
  return { auditByLead: q.data ?? null, isError: q.isError };
}

/** The suppressed lead ids among `leadIds`. null = not known (still loading or the read failed). */
export function useSuppressedLeadIds(leadIds: readonly string[], enabled = true) {
  const { user } = useAuth();
  const ids = useMemo(() => [...new Set(leadIds)].sort(), [leadIds]);
  const q = useQuery({
    queryKey: ['opportunity-suppressed', user?.id ?? null, ids.length, ids[0] ?? '', ids[ids.length - 1] ?? ''],
    queryFn: () => fetchSuppressedLeadIds(ids),
    enabled: !!user?.id && enabled && ids.length > 0,
    staleTime: OPP_INPUTS_STALE_MS,
  });
  return q.data ?? null;
}

/** Find Leads: the stored website checks of the results already in the CRM (only these ids; never the whole table).
 *  Same small columns as the lists' read (LEAD_CRAWL_LIST_SELECT), RLS-scoped. */
export function useLeadCrawlsFor(leadIds: readonly string[]) {
  const { user } = useAuth();
  const ids = useMemo(() => [...new Set(leadIds)].sort(), [leadIds]);
  const q = useQuery({
    queryKey: ['lead-crawls', 'for', user?.id ?? null, ids.join(',')],
    enabled: !!user?.id && ids.length > 0,
    staleTime: OPP_INPUTS_STALE_MS,
    queryFn: async (): Promise<Map<string, CrawlRow>> => {
      const sb = supabase as unknown as SupabaseClient;
      const m = new Map<string, CrawlRow>();
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await sb.from('lead_crawl_checks').select(LEAD_CRAWL_LIST_SELECT).in('lead_id', ids.slice(i, i + 200));
        if (error) throw error;
        for (const c of (data ?? []) as unknown as LeadCrawlListRow[]) {
          if (!c.lead_id) continue;
          const prev = m.get(c.lead_id);
          if (prev && Date.parse(prev.created_at) >= Date.parse(c.created_at)) continue;
          m.set(c.lead_id, { result: c.result, created_at: c.created_at, siteScore: { site_score: c.site_score, site_score_state: c.site_score_state, site_score_version: c.site_score_version, site_score_reasons: c.site_score_reasons, site_score_detail: c.site_score_detail } });
        }
      }
      return m;
    },
  });
  return q.data ?? null;
}
