/* The pooled result of ONE audit for the Past audits list: read-only, lazy, cached.
   Fetches the audit's runs (website check + rules stamp only), their queue answers, and the lead's website / place id,
   then asks the same functions the public report uses (src/lib/auditListSummary.ts). Three requests at a time, so a
   page of rows does not open forty at once. Nothing is written. */
import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { pooledSummary, type PooledSummary } from '@/lib/auditListSummary';
import { AUDIT_RULES_VERSION } from '@/lib/auditVerdict';
import type { AuditLite } from '@/types/auditBook';

/* CACHED ON THIS DEVICE (Paul, 2026-11-15): a settled audit's answers never change (a re-score makes a NEW audit), so its
   pooled numbers are counted once and kept, keyed by audit id, run count and rules version. Visiting the page again reads
   them back instead of re-fetching every answer. Browser storage can be blocked or empty: every access is guarded and
   the page then simply counts as before. */
/* v2 (2026-11-15): the crowding rule and the three-way split; a v1 entry holds the old counts and no split. */
const cacheKey = (a: AuditLite) => `fos.auditPooled.v2:${AUDIT_RULES_VERSION}:${a.id}:${a.runs.length}`;
function readCache(a: AuditLite): PooledSummary | undefined {
  try { const v = localStorage.getItem(cacheKey(a)); return v ? (JSON.parse(v) as PooledSummary) : undefined; } catch { return undefined; }
}
function writeCache(a: AuditLite, v: PooledSummary) {
  try { localStorage.setItem(cacheKey(a), JSON.stringify(v)); } catch { /* storage full or blocked: count again next time */ }
}

const MAX_AT_ONCE = 3;
let active = 0;
const waiting: Array<() => void> = [];
async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_AT_ONCE) await new Promise<void>((res) => waiting.push(res));
  active++;
  try { return await fn(); } finally { active--; waiting.shift()?.(); }
}

export function useAuditPooled(audit: AuditLite | null, enabled = true) {
  const sb = supabase as unknown as SupabaseClient;
  const settled = !!audit && audit.runs.length > 0 && audit.runs.every((r) => r.status !== 'pending' && r.status !== 'running');
  return useQuery<PooledSummary | null>({
    queryKey: ['audit-pooled', audit?.id ?? null, audit?.runs.length ?? 0, settled],
    enabled: enabled && !!audit && settled,
    staleTime: Infinity,
    initialData: () => (audit && settled ? readCache(audit) : undefined),
    queryFn: async () => {
      if (!audit) return null;
      const cached = readCache(audit);
      if (cached) return cached;
      return slot(async () => {
        const { data: runs } = await sb.from('ai_audit_runs')
          .select('id, crawl:results_crawl_check, rules:results->report_rules').eq('audit_id', audit.id);
        const runRows = (runs ?? []) as Array<{ id: string; crawl: unknown; rules: unknown }>;
        if (!runRows.length) return null;
        const ids = runRows.map((r) => r.id);
        const { rows: queue } = await fetchAllRows<{ id: string; question: string; status: string; result: Record<string, unknown> | null }>(
          'AuditList (pooled queue)',
          (from, to) => sb.from('ai_audit_queue').select('id, question, status, result').in('run_id', ids).order('id', { ascending: true }).range(from, to),
        );
        let lead: { website: string | null; place_id: string | null } | null = null;
        if (audit.lead_id) {
          const { data } = await sb.from('outreach_leads').select('website, place_id').eq('id', audit.lead_id).maybeSingle();
          lead = (data as typeof lead) ?? null;
        }
        const out = pooledSummary({
          audit: {
            business_name: audit.business_name, business_type: audit.business_type, location_text: audit.location_text,
            website: audit.website ?? null, audit_purpose: audit.audit_purpose ?? null, created_at: audit.created_at,
          },
          queue, runMeta: runRows.map((r) => ({ crawl: r.crawl, rules: r.rules })), lead,
        });
        writeCache(audit, out);
        return out;
      });
    },
  });
}
