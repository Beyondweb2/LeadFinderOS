import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useHookVisibility } from '@/hooks/useHookVisibility';
import { useLeadPermissions } from '@/hooks/useLeadPermissions';
import { useSubscription } from '@/hooks/useSubscription';
import { readLeadRow } from '@/lib/leadRead';
import { edgeErrorMessage, invokeEdge } from '@/lib/edgeInvoke';
import { crawlJobStatus, startFullLeadCrawl, useCrawlJobWatch } from '@/components/LeadCrawlPanel';
import type { StoredCrawlForAudit } from '@/lib/siteAudit';
import { callPoint, websiteState, type WebsiteState } from '@/lib/prospectAuditView';
import { PROSPECT_AUDIT_CONTENT_CLASS, ProspectAuditFrame, ProspectAuditView } from '@/components/ProspectAuditView';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE DETAILED PROSPECT AUDIT (2026-10-05, docs/pre-sales-certification/prospect-full-crawl-audit-results.md)

   One large window — full screen on a phone, 92% of the screen on a desktop — with ONE scroll: the
   body. Nothing inside it scrolls on its own (the old 40vh overlay inside a 90vh dialog inside a
   scrolling page is what this replaces). Three sections, skimmable during a call:
     1. FOR THIS CALL — are they showing up in AI · what is wrong with the website · the strongest point,
        with the evidence it rests on;
     2. AI VISIBILITY — ChatGPT and Google AI side by side: named / not named per question, who was named
        instead, the sources cited, the answer;
     3. WEBSITE EVIDENCE — coverage (full / capped / quick, saved or fresh), then the grouped findings by
        category, worst first; every repeated issue is ONE row with its page count and the full list.
   ⛔ STORED EVIDENCE ONLY. Opening it reads; it never crawls and never runs an audit. "Crawl site" /
   "Re-crawl" are buttons that say so, and a recent crawl is reused by the server (prospectCrawl.ts).
   ⛔ It never sends and never changes the lead.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

const LEAD_COLUMNS = 'id,business_name,website,place_id,derived_town,search_location';
const CRAWL_COLUMNS = 'url,created_at,mode,job_id,result,full_evidence';

interface LeadLite { id: string; business_name?: string | null; website?: string | null; place_id?: string | null; derived_town?: string | null; search_location?: string | null }
type CrawlRowLite = StoredCrawlForAudit & { created_at?: string | null; job_id?: string | null };

export function prospectAuditQueryKey(leadId: string | null | undefined) {
  // Under 'lead-crawls' so every crawl button's existing invalidation refreshes this view too.
  return ['lead-crawls', 'prospect-audit', leadId ?? null] as const;
}

async function loadProspectAudit(leadId: string) {
  const [leadRes, crawlRes, jobRes] = await Promise.all([
    readLeadRow<LeadLite>(leadId, LEAD_COLUMNS),
    (supabase as unknown as { from: (t: string) => any }).from('lead_crawl_checks').select(CRAWL_COLUMNS).eq('lead_id', leadId).maybeSingle(),
    crawlJobStatus({ lead_id: leadId }).catch(() => ({ job: null })),
  ]);
  if (leadRes.error) throw new Error((leadRes.error as { message?: string })?.message ?? 'Could not read the lead');
  if (crawlRes.error) throw new Error(crawlRes.error.message ?? 'Could not read the crawl');
  const job = (jobRes as { job: { id: string; status: string; label?: string | null } | null }).job;
  return { lead: leadRes.data, row: (crawlRes.data ?? null) as CrawlRowLite | null, running: job && job.status === 'running' ? job : null };
}

export function ProspectAuditDialog({ leadId, open, onOpenChange, businessName }: {
  leadId: string | null | undefined; open: boolean; onOpenChange: (open: boolean) => void; businessName?: string | null;
}) {
  return (
    <Dialog open={open && !!leadId} onOpenChange={onOpenChange}>
      <DialogContent
        className={PROSPECT_AUDIT_CONTENT_CLASS}
        data-testid="prospect-audit-dialog"
      >
        {open && leadId ? <ProspectAuditBody leadId={leadId} businessName={businessName ?? null} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ProspectAuditBody({ leadId, businessName }: { leadId: string; businessName: string | null }) {
  const queryClient = useQueryClient();
  const perms = useLeadPermissions();
  const role = useSubscription().role;
  const hook = useHookVisibility(leadId);
  const q = useQuery({ queryKey: prospectAuditQueryKey(leadId), queryFn: () => loadProspectAudit(leadId), staleTime: 15_000 });
  const [startedJob, setStartedJob] = useState<string | null>(null);
  const [justRan, setJustRan] = useState(false);
  const [crawlError, setCrawlError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const watchId = startedJob ?? q.data?.running?.id ?? null;
  const job = useCrawlJobWatch(watchId, async () => {
    setStartedJob(null);
    setJustRan(true);
    await queryClient.invalidateQueries({ queryKey: ['lead-crawls'] });
    void queryClient.invalidateQueries({ queryKey: ['inbox'] });
  });

  const startCrawl = async (force: boolean) => {
    setStarting(true); setCrawlError(null);
    try {
      const res = await startFullLeadCrawlWithForce(leadId, force);
      if (!res?.ok) throw new Error(res?.error || 'The crawl could not start.');
      if (res.cached) { setJustRan(false); await q.refetch(); return; }
      if (res.job_id) { setStartedJob(String(res.job_id)); return; }
      setJustRan(true); await q.refetch();
    } catch (e) {
      setCrawlError(edgeErrorMessage(e));
    } finally { setStarting(false); }
  };

  const running = watchId ? { label: job?.label ?? q.data?.running?.label ?? null } : null;
  const site = useMemo<WebsiteState | null>(() => (q.data ? websiteState({ lead: q.data.lead, row: q.data.row, running, justRan }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q.data, running?.label, watchId, justRan]);
  const score = hook.data?.card?.score ?? null;
  const rivalsWithheld = hook.data?.card?.rivalsWithheld ?? false;
  const point = site ? callPoint({ score: score && score.expected > 0 ? score : null, rivalsWithheld, site }) : null;
  const name = q.data?.lead?.business_name ?? businessName ?? 'This business';
  const website = q.data?.lead?.website ?? null;
  const canCrawl = perms.crawlOwnLead;

  return (
    <>
      <ProspectAuditFrame name={name} website={website}>
        {q.isLoading || hook.isLoading ? (
          <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading stored results…</p>
        ) : q.isError ? (
          <p className="py-8 text-sm text-destructive">Could not load this lead’s results: {(q.error as Error)?.message}. <button type="button" className="underline" onClick={() => void q.refetch()}>Try again</button></p>
        ) : (
          <ProspectAuditView
            score={score} rivalsWithheld={rivalsWithheld} aiInFlight={!!hook.data?.inFlight}
            site={site!} point={point!}
            crawl={{ canCrawl, role, starting, error: crawlError, onCrawl: (force) => void startCrawl(force) }}
          />
        )}
      </ProspectAuditFrame>
    </>
  );
}

/** startFullLeadCrawl plus the `force` flag (a deliberate re-crawl of a saved result). */
async function startFullLeadCrawlWithForce(leadId: string, force: boolean) {
  if (!force) return startFullLeadCrawl(leadId, 'lead_detail');
  return invokeEdge<Record<string, any>>('crawl-check', { lead_id: leadId, mode: 'full', requested_from: 'lead_detail', force: true });
}

