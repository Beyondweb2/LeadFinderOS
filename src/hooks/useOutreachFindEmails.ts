import { useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { OutreachLead, LeadStatus } from '@/types/outreach';
/* Re-exported so existing call sites keep importing them from here; they LIVE in types/outreach
   because a Deno test cannot resolve this file's '@/hooks/use-toast' import — and a constant no
   test can reach is the constant that goes wrong. */
export { CRAWLABLE_STATUSES_DEFAULT, CRAWL_STATUS_OPTIONS } from '@/types/outreach';
import { CRAWLABLE_STATUSES_DEFAULT } from '@/types/outreach';

/**
 * Bulk "Find emails" for the Outreach CRM — the Outreach-side twin of useFindEmails
 * (Find Leads). Same free website crawl (extract-email edge fn), same concurrency +
 * cancel + cap, BUT it persists each result straight to outreach_leads via updateLead
 * (keyed by the outreach lead id) instead of the search-enrichment store.
 *
 * Scope: leads with a non-empty website AND no existing email (skips ones already
 * emailed/enriched — extract-email's 30-day domain cache makes any overlap cheap
 * anyway). HONEST: only real extracted emails (junk-filtered server-side); not found
 * = 'none'; no website = not scanned.
 *
 * Reuses extract-email verbatim — no crawl logic here. Leaves the per-lead
 * EmailSection, useEnrichLead / enrich-lead, and Find Leads' useFindEmails untouched.
 */

const CONCURRENCY = 10;   // website crawl is plain HTTP — safe to parallelise.
const MAX_PER_RUN = 200;  // bound time per run.

export function useOutreachFindEmails(
  leads: OutreachLead[],
  updateLead: (leadId: string, data: Partial<OutreachLead>) => Promise<unknown>,
  /** Which lead statuses to crawl. Defaults to the two that make sense; the caller can widen it. */
  statuses: readonly LeadStatus[] = CRAWLABLE_STATUSES_DEFAULT,
) {
  const { toast } = useToast();
  const [finding, setFinding] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ found: number; scanned: number } | null>(null);
  const cancelRef = useRef(false);

  /* Target: a real website, no email yet, AND a status on the allow-list. is_archived is excluded
     unconditionally — archiving means stop contacting, and it now implies suppressed. */
  const allowed = useMemo(() => new Set(statuses), [statuses]);
  const targets = useMemo(
    () => leads.filter((l) =>
      !!l.website?.trim() && !l.email?.trim()
      && !l.is_archived
      && allowed.has(l.status as LeadStatus)),
    [leads, allowed],
  );

  const findEmails = async () => {
    const batch = targets.slice(0, MAX_PER_RUN);
    if (!batch.length) {
      toast({ title: 'No websites to scan', description: 'No leads with a website and no email yet.' });
      return;
    }
    cancelRef.current = false;
    setFinding(true);
    setResult(null);
    setProgress({ done: 0, total: batch.length });
    let done = 0;
    let found = 0;
    const queue = [...batch];
    const worker = async () => {
      while (queue.length) {
        if (cancelRef.current) return;
        const lead = queue.shift()!;
        let email: string | null = null;
        try {
          const { data } = await supabase.functions.invoke('extract-email', { body: { websiteUrl: lead.website } });
          email = (data?.email as string) ?? null;
        } catch { /* leave as none */ }
        // Persist to outreach_leads.email (mirrors the free website path in enrich-lead).
        await updateLead(lead.id, {
          email,
          email_status: email ? 'found' : 'none',
          email_method: 'website_scrape',
          email_last_checked_at: new Date().toISOString(),
          ...(email ? { enrichment_source: 'website_scrape' } : {}),
        } as Partial<OutreachLead>);
        if (email) found++;
        done++;
        setProgress({ done, total: batch.length });
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    } finally {
      setFinding(false);
      setProgress(null);
      setResult({ found, scanned: done });
      toast({ title: `Found emails for ${found} of ${done}`, description: 'Emails now show on the rows and can be pushed to Instantly.' });
    }
  };

  const cancel = () => { cancelRef.current = true; };

  return { findEmails, cancel, finding, progress, result, withWebsiteCount: targets.length };
}
