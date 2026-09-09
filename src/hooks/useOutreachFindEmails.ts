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
/* ⛔ DON'T RE-CRAWL WHAT WE ALREADY CHECKED. A miss WRITES email_last_checked_at (and
   email_status 'none'), but the target rule only ever tested `!email` — so every lead already
   proven to have no findable email was re-crawled on EVERY run, permanently occupying the
   200-per-run cap and pushing genuinely-unchecked leads out of the batch.
   30 days matches extract-email's own domain cache, so a shorter window would mostly re-read that
   cache and change nothing anyway. Selecting a lead overrides this — see targetsFor. */
import { pushCrawlTargets, RECHECK_AFTER_DAYS } from '@/lib/pushCrawlTargets';

/** What the Push-to-Instantly pre-crawl reports back, so the dialog can state it rather than guess. */
export interface PushCrawlResult {
  /** Emails actually found and written. */
  found: number;
  /** Leads crawled this run (<= candidates, because of MAX_PER_RUN). */
  scanned: number;
  /** Leads that needed a crawl at all. Zero means nothing to do, not a failure. */
  candidates: number;
  /** Candidates left over after the per-run cap — stated, never silently dropped. */
  remaining: number;
}

export function useOutreachFindEmails(
  leads: OutreachLead[],
  updateLead: (leadId: string, data: Partial<OutreachLead>) => Promise<unknown>,
  /** Which lead statuses to crawl. Defaults to the two that make sense; the caller can widen it. */
  statuses: readonly LeadStatus[] = CRAWLABLE_STATUSES_DEFAULT,
  /** ⛔ TICKED ROWS WIN. An explicit tick is a clearer instruction than a default filter, so a
   *  selection crawls exactly those leads: no status allow-list, no 30-day skip. Empty/absent →
   *  the filtered-view behaviour, unchanged. Resolved against the leads passed in by the caller. */
  selectedIds?: ReadonlySet<string>,
) {
  const { toast } = useToast();
  const [finding, setFinding] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ found: number; scanned: number } | null>(null);
  const cancelRef = useRef(false);

  const allowed = useMemo(() => new Set(statuses), [statuses]);
  const hasSelection = !!selectedIds && selectedIds.size > 0;
  /* ⛔ TWO RULES, AND WHICH ONE APPLIES IS DECIDED BY WHETHER ANYTHING IS TICKED.
       SELECTED  → exactly those leads. The status allow-list and the 30-day skip are BOTH
                   overridden: the operator has pointed at these rows, which outranks a default.
       NO SELECTION → the filtered view, on the allow-list, and skipping anything checked within
                   RECHECK_AFTER_DAYS.
     ⛔ TWO CONDITIONS SURVIVE IN BOTH, AND DELIBERATELY:
       · is_archived — archiving means stop contacting, and it implies suppressed. A tick must not
         be able to re-open a lead that was deliberately closed.
       · !email — a crawl WRITES its result, and a MISS writes null. Re-crawling a lead that already
         has an address could therefore ERASE a good email, which is data loss from a button whose
         job is to find emails. A lead with an email needs no crawling; if a stale one ever needs
         replacing, that is a deliberate edit, not a side effect of a bulk action. */
  const targets = useMemo(() => {
    const base = leads.filter((l) => !!l.website?.trim() && !l.email?.trim() && !l.is_archived);
    if (hasSelection) return base.filter((l) => selectedIds!.has(l.id));
    const cutoff = Date.now() - RECHECK_AFTER_DAYS * 24 * 60 * 60 * 1000;
    return base.filter((l) => {
      if (!allowed.has(l.status as LeadStatus)) return false;
      /* Never checked → crawl. Unparseable stamp → crawl (absence is never an answer: a bad date
         must not silently exclude a lead from ever being crawled again). */
      const t = Date.parse(l.email_last_checked_at ?? '');
      return !Number.isFinite(t) || t < cutoff;
    });
  }, [leads, allowed, hasSelection, selectedIds]);

  /* ⛔ ONE CRAWL LOOP, TWO ENTRY POINTS. The button and the Push-to-Instantly pre-crawl differ ONLY
     in how they choose their targets; the crawling, the concurrency, the cancel and the write are
     identical. A second copy would be the drift this codebase has paid for four times — and here it
     would drift on the write, where a MISS writes null over an email. */
  const runCrawl = async (batch: OutreachLead[]): Promise<{ found: number; scanned: number }> => {
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
    }
    return { found, scanned: done };
  };

  const findEmails = async () => {
    const batch = targets.slice(0, MAX_PER_RUN);
    if (!batch.length) {
      toast({ title: 'No websites to scan', description: 'No leads with a website and no email yet.' });
      return;
    }
    const { found, scanned } = await runCrawl(batch);
    toast({ title: `Found emails for ${found} of ${scanned}`, description: 'Emails now show on the rows and can be pushed to Instantly.' });
  };

  /* ⛔ THE PUSH-TO-INSTANTLY PRE-CRAWL (Paul, 2026-09-09: "when I try push to instantly it should run
     an email crawl on ones it hasn't crawled already"). It takes an EXPLICIT id list — the leads
     being pushed — and is deliberately NOT the `selectedIds` path above.
     ⚠️ THE DIFFERENCE IS THE 30-DAY SKIP, AND IT IS THE WHOLE POINT OF THE REQUEST. Ticking rows and
     pressing Find emails is an instruction to crawl THOSE rows, so it overrides the skip on purpose.
     Pushing is not that instruction: "ones it hasn't crawled already" means a lead proven last week
     to have no findable email must not be crawled again every time he opens the dialog. Same
     unconditional guards either way — a website, no email already, not archived.
     ⚠️ Resolved against the `leads` array this hook was given, so a lead the current filter hides is
     still crawled if it is in the push. */
  const crawlForPush = async (leadIds: readonly string[]): Promise<PushCrawlResult> => {
    const candidates = pushCrawlTargets(leads, leadIds);
    if (!candidates.length) return { found: 0, scanned: 0, candidates: 0, remaining: 0 };
    const batch = candidates.slice(0, MAX_PER_RUN);
    const { found, scanned } = await runCrawl(batch);
    /* ⚠️ `remaining` is NAMED rather than silently dropped. A cap that quietly crawls 200 of 743 and
       then pushes reads as "these leads have no email", which is the opposite of true. */
    return { found, scanned, candidates: candidates.length, remaining: Math.max(0, candidates.length - scanned) };
  };

  const cancel = () => { cancelRef.current = true; };

  /* `usingSelection` lets the button say WHICH set it is about to crawl — the ambiguity that made
     "why didn't it crawl my lead" hard to answer. The count and the flag come from the same memo as
     the crawl itself, so the label and the action cannot disagree. */
  return { findEmails, crawlForPush, cancel, finding, progress, result, withWebsiteCount: targets.length, usingSelection: hasSelection };
}
