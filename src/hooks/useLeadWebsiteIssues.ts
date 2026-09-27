import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { newestUsableAudit } from '@/lib/auditReportResolver';
import { selectFindings, type FindingsOutcome } from '@/lib/coldCallPlaybook';
import { classifyLeadWebsite, type SiteSource } from '@/lib/leadWebsiteKind';
import type { CrawlStoredResult } from '@/lib/crawlResult';
import { PLAYBOOK_AUDIT_COLUMNS, runCrawlSources, type PlaybookAuditRow } from '@/hooks/useColdCallPlaybook';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WEBSITE / ONLINE-PRESENCE ISSUES for the Inbox AI visibility details (2026-09-27).

   ⛔ READS ONLY, and only while the details are open: the lead's website, its audits' stored crawl
      checks and its newest lead-level crawl — the same three sources, in the same order, as the Cold
      Call Playbook (useColdCallPlaybook), through the SAME selector (selectFindings). So the Inbox and
      the Call Script can never name different website issues. No crawl is started, nothing is spent.
   ⛔ A PROFILE IS NOT THEIR WEBSITE (leadWebsiteKind.ts): a TradeHQ page is reported as "no standalone
      website found, only a TradeHQ profile", never mined for "website issues".
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

// Several of these tables are not in the generated types; RLS still enforces access.
const sb = supabase as unknown as { from: (t: string) => any };

export interface LeadWebsiteIssues {
  website: string | null;
  site: { source: SiteSource; label: string | null };
  outcome: FindingsOutcome;
}

/** Every finding the crawl supports; the block shows the first few and keeps the rest behind a toggle. */
const ALL_FINDINGS = 20;

async function load(leadId: string): Promise<LeadWebsiteIssues | null> {
  const [leadRes, auditsRes, crawlRes] = await Promise.all([
    sb.from('outreach_leads').select('id, website').eq('id', leadId).maybeSingle(),
    sb.from('ai_audits').select(PLAYBOOK_AUDIT_COLUMNS).eq('lead_id', leadId).order('created_at', { ascending: false }).limit(20),
    sb.from('lead_crawl_checks').select('result, created_at').eq('lead_id', leadId).order('created_at', { ascending: false }).limit(1),
  ]);
  if (leadRes.error) throw leadRes.error;
  if (auditsRes.error) throw auditsRes.error;
  if (crawlRes.error) throw crawlRes.error;
  const lead = leadRes.data as { id: string; website: string | null } | null;
  if (!lead) return null;
  const audits = (auditsRes.data ?? []) as PlaybookAuditRow[];
  const newestCrawl = (crawlRes.data ?? [])[0] as { result: CrawlStoredResult | null; created_at: string } | undefined;
  const kind = classifyLeadWebsite(lead.website);
  const outcome = selectFindings({
    lead: { website: lead.website } as never,
    runCrawls: runCrawlSources(newestUsableAudit(audits, leadId) as PlaybookAuditRow | null),
    leadCrawl: newestCrawl ? { result: newestCrawl.result, createdAtMs: new Date(newestCrawl.created_at).getTime() } : null,
    nowMs: Date.now(),
  }, ALL_FINDINGS);
  return { website: (lead.website ?? '').trim() || null, site: { source: kind.source, label: kind.label }, outcome };
}

export function useLeadWebsiteIssues(leadId: string | null | undefined) {
  return useQuery({
    queryKey: ['lead-website-issues', leadId ?? null],
    queryFn: () => load(leadId as string),
    enabled: !!leadId,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}
