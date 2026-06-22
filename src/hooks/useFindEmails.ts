import { useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Lead } from '@/types/lead';
import type { OutreachLead } from '@/types/outreach';

/**
 * In-place email scan for the Find Leads (Targeted) results. Runs the FREE website
 * email crawl (extract-email) across the current results and writes each result
 * into the existing search-enrichment store (via onPatch, keyed by place_id) — so
 * the Mail icon appears on the rows through the shared LeadEnrichButtons, and the
 * email carries over when the lead is added to Outreach. No table rewrite.
 *
 * Ported from EmailListBuilder's findEmails loop (same concurrency + cancel + cap).
 * HONEST: only real extracted emails (junk-filtered server-side); not found = none;
 * no website = can't crawl.
 */

const CONCURRENCY = 10;   // website crawl is plain HTTP — safe to parallelise.
const MAX_PER_RUN = 200;  // bound time per run.

export function useFindEmails(
  leads: Lead[],
  onPatch: (placeId: string, patch: Partial<OutreachLead>) => Promise<unknown>,
) {
  const { toast } = useToast();
  const [finding, setFinding] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ found: number; scanned: number } | null>(null);
  const cancelRef = useRef(false);

  const withWebsite = useMemo(() => leads.filter((l) => !!l.websiteUrl), [leads]);

  const findEmails = async () => {
    const targets = withWebsite.slice(0, MAX_PER_RUN);
    if (!targets.length) {
      toast({ title: 'No websites to scan', description: 'None of these results have a website to crawl for an email.' });
      return;
    }
    cancelRef.current = false;
    setFinding(true);
    setResult(null);
    setProgress({ done: 0, total: targets.length });
    let done = 0;
    let found = 0;
    const queue = [...targets];
    const worker = async () => {
      while (queue.length) {
        if (cancelRef.current) return;
        const lead = queue.shift()!;
        let email: string | null = null;
        try {
          const { data } = await supabase.functions.invoke('extract-email', { body: { websiteUrl: lead.websiteUrl } });
          email = (data?.email as string) ?? null;
        } catch { /* leave as none */ }
        // Write into the shared search-enrichment store (merges, keyed by place_id).
        await onPatch(lead.id, {
          email,
          email_status: email ? 'found' : 'none',
          email_method: 'website_scrape',
          ...(email ? { enrichment_source: 'website_scrape' } : {}),
        } as Partial<OutreachLead>);
        if (email) found++;
        done++;
        setProgress({ done, total: targets.length });
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    } finally {
      setFinding(false);
      setProgress(null);
      setResult({ found, scanned: done });
      toast({ title: `Found emails for ${found} of ${done}`, description: 'Emails now show on the rows and carry over when you add to Outreach.' });
    }
  };

  const cancel = () => { cancelRef.current = true; };

  return { findEmails, cancel, finding, progress, result, withWebsiteCount: withWebsite.length };
}
