/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE ROW SCORES — "ChatGPT 1/3 · Gemini 0/3" for the rows ON SCREEN (2026-10-05,
   improve/outreach-compact-audit-rows; rules in src/lib/outreachRowCheck.ts).

   ⛔ READS ONLY, THROUGH THE PERSON'S OWN SESSION (RLS). A salesperson's reads return only their own
      leads' audits — the same reads the call screen makes (useColdCallPlaybook loadCallCardSummaries).
   ⛔ PER PAGE, NEVER THE BOOK. Only the rows on the current page with a finished check are asked for,
      so a list of thousands costs one page of reads. Keyed by lead id AND its newest audit run, so a
      check that finishes re-reads that page and nothing else.
   ⛔ THE SAME AUDIT AND THE SAME RULER AS THE CALL SCREEN: resolveLeadReportAudit picks the audit,
      buildReportData folds it (cellNamed()), perEngine is what the row prints. Only the numbers leave
      this file — no answer text, no rival names, no crawl.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { resolveLeadReportAudit, type ResolvableAudit } from '@/lib/auditReportResolver';
import { buildReportData, type QueueRow, type RunRow } from '@/lib/auditReport';
import { isAggregatorUrl } from '@/lib/aggregators';
import { rowScoreFromPerEngine, type RowScore } from '@/lib/outreachRowCheck';

// ai_audit_queue / runs are not all in the generated types; RLS still enforces access.
const sb = supabase as unknown as { from: (t: string) => any };

interface ScoreAuditRow extends ResolvableAudit {
  business_name: string | null;
  business_type: string | null;
  location_text: string | null;
}
/** The call screen's audit columns without the crawl (the row never shows the website). */
const SCORE_AUDIT_COLUMNS = 'id, short_code, lead_id, created_at, business_name, business_type, location_text, audit_purpose, baseline_target_runs, is_measurement, baseline_contract, ai_audit_runs(id, status, run_number, created_at)';

export interface RowScoreLead { id: string; business_name: string | null; website: string | null }

export async function loadOutreachRowScores(leads: RowScoreLead[]): Promise<Record<string, RowScore | null>> {
  const ids = leads.map((l) => l.id);
  if (!ids.length) return {};
  const audits = (await fetchAllRows<ScoreAuditRow>('Outreach (row scores: audits)', (from, to) =>
    sb.from('ai_audits').select(SCORE_AUDIT_COLUMNS).in('lead_id', ids)
      .order('created_at', { ascending: false }).order('id', { ascending: true }).range(from, to))).rows;
  const reportAudits = new Map<string, ScoreAuditRow>();
  for (const id of ids) { const a = resolveLeadReportAudit(audits, id); if (a) reportAudits.set(id, a); }
  const reportIds = [...new Set([...reportAudits.values()].map((a) => a.id))];
  const runsByAudit = new Map<string, RunRow & { run_number?: number | null }>();
  const rowsByAudit = new Map<string, QueueRow[]>();
  if (reportIds.length) {
    const [runRes, rowsRes] = await Promise.all([
      fetchAllRows<RunRow & { audit_id: string; run_number?: number | null }>('Outreach (row scores: runs)', (from, to) =>
        sb.from('ai_audit_runs').select('id, audit_id, run_number, status, mention_rate, results, created_at').in('audit_id', reportIds)
          .order('run_number', { ascending: false }).order('id', { ascending: true }).range(from, to)),
      fetchAllRows<QueueRow & { audit_id: string }>('Outreach (row scores: answers)', (from, to) =>
        sb.from('ai_audit_queue').select('id, audit_id, question, status, result').in('audit_id', reportIds)
          .order('created_at', { ascending: true }).order('id', { ascending: true }).range(from, to)),
    ]);
    for (const r of runRes.rows) {
      const cur = runsByAudit.get(r.audit_id);
      if (!cur || Number(r.run_number ?? 0) > Number(cur.run_number ?? 0)) runsByAudit.set(r.audit_id, r);
    }
    for (const q of rowsRes.rows) (rowsByAudit.get(q.audit_id) ?? rowsByAudit.set(q.audit_id, []).get(q.audit_id)!).push(q);
  }
  const out: Record<string, RowScore | null> = {};
  for (const l of leads) {
    const a = reportAudits.get(l.id);
    if (!a) { out[l.id] = null; continue; }
    const website = (l.website ?? '').trim();
    const report = buildReportData(rowsByAudit.get(a.id) ?? [], runsByAudit.get(a.id) ?? null, {
      businessName: a.business_name ?? l.business_name ?? '', businessType: a.business_type ?? '',
      locationText: a.location_text ?? '', specialisms: '', isAggregatorUrl, ownWebsite: website || undefined,
    });
    out[l.id] = rowScoreFromPerEngine(report?.perEngine ?? null);
  }
  return out;
}

/** Scores for the given rows. `version` is each lead's newest run id (the audit map), so a finished
 *  check re-reads; the same page and the same runs reuse the cached answer. */
export function useOutreachRowScores(leads: RowScoreLead[], version: string) {
  const key = leads.map((l) => l.id).sort().join(',');
  return useQuery({
    queryKey: ['outreach-row-scores', key, version],
    queryFn: () => loadOutreachRowScores(leads),
    enabled: leads.length > 0,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
