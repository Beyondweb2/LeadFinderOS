import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { isOutreachAudit } from '@/lib/auditScore';
import { pooledSummary, type PooledSummary } from '@/lib/auditListSummary';
import { isRecheckPurpose, recheckSkipReason, replacedAuditIds, RECHECK_RUNS } from '@/lib/prospectRecheck';

/* THE LEAD'S RE-CHECKS (2026-11-16, src/lib/prospectRecheck.ts). READ-ONLY, one lead. Reads the lead's audits (RLS scopes
   them: a rep sees the audits of a lead they work), then — once the newest re-check has settled — its answers, and counts
   them with the report's own functions (pooledSummary → buildReportModel → the v4 verdicts), so the line on the lead is
   the line on the report. Polls while a re-check is still asking. Writes nothing, spends nothing. */

const sb = supabase as unknown as SupabaseClient;
const POLL_MS = 15_000;
const IN_FLIGHT = new Set(['pending', 'queued', 'running', 'processing']);

export interface RecheckAuditRow {
  id: string; short_code: string | null; created_at: string; audit_purpose: string | null; is_market: boolean | null;
  business_name: string | null; business_type: string | null; location_text: string | null; website: string | null;
  baseline_target_runs: number | null; is_measurement: boolean | null; baseline_contract: unknown;
  ai_audit_runs: { id: string; status: string | null; run_number: number | null; created_at: string | null; crawl?: unknown; rules?: unknown }[] | null;
}

export type RecheckState =
  | { kind: 'running'; runsDone: number; runsTarget: number }
  | { kind: 'skipped'; reason: string }
  | { kind: 'done'; summary: PooledSummary | null };

export interface LeadRecheckData {
  latest: RecheckAuditRow | null;
  state: RecheckState | null;
  /** Earlier checks a re-check replaced (team screens only): newest first. */
  replaced: RecheckAuditRow[];
}

export const leadRecheckKey = (leadId: string) => ['lead-recheck', leadId] as const;

const AUDIT_SELECT = 'id, short_code, created_at, audit_purpose, is_market, business_name, business_type, location_text, website, baseline_target_runs, is_measurement, baseline_contract, ai_audit_runs(id, status, run_number, created_at, crawl:results_crawl_check, rules:results->report_rules)';

async function load(leadId: string, lead: { website: string | null }): Promise<LeadRecheckData> {
  const { data, error } = await sb.from('ai_audits').select(AUDIT_SELECT).eq('lead_id', leadId).order('created_at', { ascending: false }).limit(20);
  if (error) throw new Error(error.message ?? 'Could not read the checks');
  const audits = (data ?? []) as RecheckAuditRow[];
  const replacedIds = replacedAuditIds(audits.map((a) => ({ id: a.id, created_at: a.created_at, audit_purpose: a.audit_purpose, outreach: isOutreachAudit(a as never) })));
  const replaced = audits.filter((a) => replacedIds.has(a.id));
  const latest = audits.find((a) => isRecheckPurpose(a.audit_purpose)) ?? null;
  if (!latest) return { latest: null, state: null, replaced };

  const runs = latest.ai_audit_runs ?? [];
  const target = Number(latest.baseline_target_runs ?? RECHECK_RUNS) || RECHECK_RUNS;
  const settled = runs.filter((r) => !IN_FLIGHT.has(String(r.status ?? '')));
  const ids = runs.map((r) => r.id);
  const { rows: queue } = ids.length
    ? await fetchAllRows<{ id: string; question: string; status: string; result: Record<string, unknown> | null }>(
        'Re-check answers',
        (from, to) => sb.from('ai_audit_queue').select('id, question, status, result').in('run_id', ids).order('id', { ascending: true }).range(from, to),
      )
    : { rows: [] as { id: string; question: string; status: string; result: Record<string, unknown> | null }[] };

  /* Nothing answered and the rows were refused by a budget: the skip, in words (the queue's stored refusal). */
  const answered = queue.some((r) => r.status === 'done');
  const refusal = queue.map((r) => recheckSkipReason(typeof r.result?.error === 'string' ? r.result.error : null)).find((x) => !!x) ?? null;
  if (!answered && refusal && settled.length === runs.length && runs.length > 0) return { latest, state: { kind: 'skipped', reason: refusal }, replaced };

  const anyInFlight = runs.some((r) => IN_FLIGHT.has(String(r.status ?? '')));
  /* Still asking: fewer runs settled than the target, unless the chain stopped (a run that answered nothing is not repeated). */
  const stopped = !anyInFlight && runs.length > 0 && !answered;
  if (!stopped && (anyInFlight || settled.length < target)) {
    return { latest, state: { kind: 'running', runsDone: settled.length, runsTarget: target }, replaced };
  }
  const summary = pooledSummary({
    audit: {
      business_name: latest.business_name ?? '', business_type: latest.business_type, location_text: latest.location_text,
      website: latest.website, audit_purpose: latest.audit_purpose, created_at: latest.created_at,
    },
    queue: queue.map((r) => ({ question: r.question, status: r.status, result: r.result })),
    runMeta: runs.map((r) => ({ crawl: r.crawl ?? null, rules: r.rules ?? null })),
    lead: { website: lead.website, place_id: null },
  });
  return { latest, state: { kind: 'done', summary }, replaced };
}

export function useLeadRecheck(leadId: string | null | undefined, lead: { website: string | null } | null) {
  return useQuery({
    queryKey: leadRecheckKey(leadId ?? ''),
    enabled: !!leadId && !!lead,
    queryFn: () => load(leadId as string, lead ?? { website: null }),
    refetchInterval: (q) => (q.state.data?.state?.kind === 'running' ? POLL_MS : false),
    staleTime: 20_000,
  });
}
