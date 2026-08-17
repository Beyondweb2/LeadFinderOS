import { useEffect, useState } from 'react';
import { Globe, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { asPence, SEO_SCAN_USD } from '@/lib/marketView';
import { isRenderableSeo } from '@/lib/auditReport';
import { isAggregatorUrl } from '@/lib/aggregators';
import { isRepliedStatus, type OutreachLead } from '@/types/outreach';

/* ============================================================
   SITE CHECK ON ENGAGEMENT — the email lane's SEO economics (Paul, 2026-08-17).

   Up-front audits skip the SEO scan (audit_and_push forces skip_seo); the scan runs when a
   prospect ENGAGES instead — the same shape as WhatsApp's audit-on-reply. This button is the
   manual trigger: it appears on a lead's card only when ALL of
     - the lead has ENGAGED (isRepliedStatus — replied or beyond), so it can never re-invite
       up-front spend across the whole book;
     - they have a real website (aggregator/social links are not a site — the £0.12-on-facebook.com
       lesson);
     - a COMPLETED audit run exists with no renderable SEO on it (the thing a scan would fill).
   Reports render live from stored results, so the report link the prospect already holds grows
   the website section the moment this completes — nothing is re-sent.

   ⛔ PRICED ON ITS FACE from the sync-guarded constant, never hand-typed (§4). ~30–120s actor.
   ============================================================ */

export function LeadSiteCheckButton({ lead }: { lead: OutreachLead }) {
  const { toast } = useToast();
  const [runId, setRunId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [done, setDone] = useState(false);

  const engaged = isRepliedStatus(lead.status);
  const hasRealSite = !!lead.website?.trim() && !isAggregatorUrl(lead.website);

  useEffect(() => {
    if (!engaged || !hasRealSite) return;
    let alive = true;
    void (async () => {
      /* Owner-RLS reads, the MeasureMarket precedent. Latest COMPLETED run for this lead's
         audits; the button only exists if that run has no renderable SEO. */
      const { data: audits } = await supabase
        .from('ai_audits').select('id').eq('lead_id', lead.id);
      if (!alive || !audits?.length) return;
      const { data: runs } = await supabase
        .from('ai_audit_runs')
        .select('id, results, created_at')
        .in('audit_id', audits.map((a) => a.id))
        .eq('status', 'complete')
        .order('created_at', { ascending: false })
        .limit(1);
      if (!alive || !runs?.length) return;
      const r = runs[0] as { id: string; results: { seo?: unknown } | null };
      if (!isRenderableSeo(r.results?.seo)) setRunId(r.id);
    })();
    return () => { alive = false; };
  }, [lead.id, engaged, hasRealSite]);

  if (!engaged || !hasRealSite || !runId || done) return null;

  const scan = async () => {
    if (scanning) return;
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke('run-seo-scan', { body: { runId } });
      if (error || !data?.ok) throw new Error(error?.message ?? data?.error ?? 'scan failed');
      setDone(true);
      toast({ title: 'Site check complete', description: 'Their report now shows the website section — same link they already have.' });
    } catch (e) {
      toast({ title: 'Site check failed', description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    } finally {
      setScanning(false);
    }
  };

  return (
    <button
      onClick={() => void scan()}
      disabled={scanning}
      className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary hover:bg-primary/20 disabled:opacity-60"
      title={`Run the full website check now (~30–120s). Their audit ran without it; the report link they already have gains the section when this finishes.`}
    >
      {scanning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Globe className="h-3 w-3" />}
      {scanning ? 'Checking site…' : `Site check · ~${asPence(SEO_SCAN_USD)}`}
    </button>
  );
}
