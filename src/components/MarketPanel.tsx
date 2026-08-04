import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Loader2, MapPin, Plus, RefreshCw, Search, Sparkles, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useMarketView } from '@/hooks/useMarketView';
import { useApifyUsage, apifyTone } from '@/hooks/useApifyUsage';
import { useLeadSearchContext } from '@/contexts/LeadSearchContext';
import { useOutreach } from '@/hooks/useOutreach';
import { shortDate } from '@/lib/auditErrors';
import {
  AUDIT_EST_USD_PER_QUESTION, MARKET_AUDIT_QUESTIONS, MARKET_AUDIT_MAX,
  EVIDENCE_MIN_AUDITS, JUNK_RATIO_PER_AUDIT, MAX_PER_ENGINE_CAP,
  MARKET_SKIP_SEO, SEO_SCAN_USD, marketBatchCost,
  ESTABLISHED_MIN_AUDIT_SHARE, ESTABLISHED_MIN_MENTION_SHARE,
  type MarketPoolRow,
} from '@/lib/marketView';
import type { Lead } from '@/types/lead';

/* ============================================================
   MARKET VIEW — a trade in a town, instead of one business at a time.

   Is this market owned by one firm or spread across many, who does AI already name, and which
   local businesses has it never mentioned. That last list is the prospect list.

   NOTHING ON THIS PAGE SPENDS ON LOAD. The view is folded from audits already paid for and a lead
   pool already cached. The three things that cost money — the lead search, the audit batch, the LLM
   re-extraction — are each a separate button behind its own confirm that states the cost first.
   ============================================================ */

/** Radius sent with the market view's own lead search. Only used for the cache identity and for the
 *  fallback message: the search runs townOnly, so the boundary comes from the town, not this. */
const MARKET_SEARCH_RADIUS_M = 50_000;

/** An audit batch in flight, as bulk_jobs reports it. */
interface AuditJobProgress {
  id: string;
  status: string;
  total: number;
  done_count: number;
  failed_count: number;
  skipped_count: number;
}
/** How often to re-read a live batch. The audit queue cron ticks every 60s, so anything faster
 *  than this just burns reads for the same numbers. */
const JOB_POLL_MS = 8_000;
const JOB_ACTIVE = new Set(['queued', 'running']);
/** Google Places text search, per page of ~20 results, from search-leads' own logging constant. */
const GOOGLE_PAGE_USD = 0.032;

export interface MarketPanelProps {
  /** Trade as typed on Find Leads. Normalised server-side by the same norm() the playbook uses. */
  trade: string;
  /** Town as typed on Find Leads. */
  town: string;
}

/**
 * The market view, rendered inside Find Leads as a search MODE rather than its own page.
 * Inputs come from the page's existing niche and location boxes — there is deliberately no picker
 * here and no restriction to trades that already have audits, because "what do I have for
 * locksmiths in Peterborough, and what would it cost to get the rest" is the question.
 */
export default function MarketPanel({ trade, town }: MarketPanelProps) {
  const { view, loading, error, load, reload } = useMarketView();
  const { usage: apifyUsage } = useApifyUsage();
  const { search, isLoading: searching, townFilterFallback } = useLeadSearchContext();
  const { addLead } = useOutreach();
  const { toast } = useToast();

  const [auditCount, setAuditCount] = useState(5);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditBusy, setAuditBusy] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [reExtractOpen, setReExtractOpen] = useState(false);
  const [reExtractBusy, setReExtractBusy] = useState(false);
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [addedKeys, setAddedKeys] = useState<Set<string>>(new Set());
  /* An ACTIVE bulk job blocks bulk-jobs' create with a 409, and until now that was discovered
     AFTER the CRM rows had been written — so the operator got leads and no audits, silently.
     Checked when the dialog opens, and stated before anything is spent. null = not checked yet. */
  const [activeJob, setActiveJob] = useState<{ job_type: string; status: string } | null>(null);
  const [jobCheckDone, setJobCheckDone] = useState(false);
  /* THE RUNNING BATCH, VISIBLE. Pressing the button used to leave the panel looking inert for
     minutes: bulk-jobs enqueues, then the 1-minute audit-queue cron drains it, so nothing on
     screen changed until the numbers silently appeared. This is polled while a job is live. */
  const [jobProgress, setJobProgress] = useState<AuditJobProgress | null>(null);
  /** Set when a batch we started has finished, so the panel can offer a refresh rather than
   *  quietly going stale. Cleared by reloading. */
  const [finishedJob, setFinishedJob] = useState<AuditJobProgress | null>(null);

  /* The market is whatever is in the two boxes. Reload whenever either changes, and clear the
     per-row "Added" ticks with it so they can never carry across from a different town. */
  const chosen = useMemo(
    () => (trade.trim() && town.trim() ? { trade: trade.trim(), town: town.trim() } : null),
    [trade, town],
  );
  useEffect(() => {
    if (!chosen) return;
    setAddedKeys(new Set());
    void load(chosen.trade, chosen.town);
  }, [chosen, load]);

  /* ── THE LEAD SEARCH. Reuses the Find Leads context call verbatim, so it goes through the same
     search-leads function, writes the same search_history row and fills the same search_cache the
     market view then reads. A second search path would drift from that cache and find nothing. */
  const runSearch = useCallback(async () => {
    if (!chosen) return;
    setSearchOpen(false);
    // townOnly: TRUE. This view compares a measured town against the businesses in that same town —
    // a radius pool returns neighbouring towns the audits never covered, which would put businesses
    // in the prospect list that were never in the market being measured.
    await search({ keyword: chosen.trade, location: chosen.town, radius: MARKET_SEARCH_RADIUS_M, townOnly: true });
    await reload();
  }, [chosen, search, reload]);

  /* ── RE-EXTRACTION. One LLM call per completed run, and nothing meters it — so it is never
     automatic and the run count is stated before the click. */
  const runReExtract = useCallback(async () => {
    if (!view) return;
    setReExtractOpen(false);
    setReExtractBusy(true);
    let ok = 0; let failed = 0;
    try {
      for (const runId of view.concentration.runIds) {
        const { error: fnErr } = await supabase.functions.invoke('extract-competitors', { body: { runId } });
        if (fnErr) failed += 1; else ok += 1;
      }
      toast({
        title: 'Re-extraction finished',
        description: `${ok} run${ok === 1 ? '' : 's'} re-read${failed ? `, ${failed} failed` : ''}. Reloading the market.`,
      });
      await reload();
    } finally {
      setReExtractBusy(false);
    }
  }, [view, reload, toast]);

  /** A pool row as the Lead shape addLead expects. The pool rows came out of search-leads in the
   *  first place, so this is a re-hydration, not an invention. */
  const asLead = useCallback((row: MarketPoolRow): Lead => ({
    id: row.placeIds[0],
    name: row.name,
    googleMapsUrl: row.googleMapsUrl,
    websiteUrl: row.websiteUrl ?? undefined,
    websiteStatus: row.noWebsite ? 'NO_WEBSITE' : 'HAS_OWN_WEBSITE',
    confidence: row.noWebsite ? 0.6 : 0.9,
    reason: row.noWebsite ? 'No website on Google listing' : 'Has own website',
  }), []);

  const addOne = useCallback(async (row: MarketPoolRow) => {
    if (!chosen) return;
    setAddingKey(row.key);
    try {
      const id = await addLead(asLead(row), 'UK', 'no_website', null, null, false, chosen.trade, chosen.town);
      if (id) setAddedKeys((s) => new Set(s).add(row.key));
    } finally {
      setAddingKey(null);
    }
  }, [chosen, addLead, asLead]);

  /* ── A LIVE AUDIT BATCH, POLLED ───────────────────────────────────────────────────────────────
     Reads the caller's own audit jobs (RLS scopes bulk_jobs to them) and keeps polling while one is
     queued or running. On the active -> terminal transition it reloads the market itself, so the
     numbers appear without the operator wondering whether to press Reload. */
  const readJob = useCallback(async (): Promise<AuditJobProgress | null> => {
    try {
      const client = supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (c: string, v: string) => {
              order: (c: string, o: { ascending: boolean }) => {
                limit: (n: number) => Promise<{ data: AuditJobProgress[] | null }>;
              };
            };
          };
        };
      };
      const { data } = await client
        .from('bulk_jobs')
        .select('id, status, total, done_count, failed_count, skipped_count')
        .eq('job_type', 'audit')
        .order('created_at', { ascending: false })
        .limit(1);
      return data?.[0] ?? null;
    } catch {
      return null;   // a failed read must never break the panel; the next tick tries again
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const tick = async () => {
      const job = await readJob();
      if (cancelled) return;
      setJobProgress((prev) => {
        const wasActive = !!prev && JOB_ACTIVE.has(prev.status);
        const nowActive = !!job && JOB_ACTIVE.has(job.status);
        /* FINISHED WHILE WATCHING: reload the fold and say so, rather than leaving the panel
           showing pre-batch numbers with no hint that they moved. */
        if (wasActive && !nowActive && job) {
          setFinishedJob(job);
          void reload();
        }
        return nowActive ? job : null;
      });
      if (!cancelled) timer = window.setTimeout(tick, JOB_POLL_MS);
    };
    void tick();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [readJob, reload]);

  /* ── THE AUDIT BATCH. Adds the businesses to the CRM and then hands them to the EXISTING
     bulk-jobs audit runner, which is keyed on lead ids and refuses anything it does not own. Both
     halves are stated on the confirm before a penny moves. */
  const runAudits = useCallback(async () => {
    if (!view || !chosen) return;
    setAuditBusy(true);
    try {
      const targets = view.pool.filter((p) => !p.isChain).slice(0, auditCount);
      const leadIds: string[] = [];
      for (const row of targets) {
        // addLead returns the CREATED ROW, or null when it was a duplicate or failed. A duplicate
        // is skipped rather than counted: bulk-jobs would reject an id we never got, and quietly
        // auditing fewer businesses than the confirm promised is worse than saying so.
        const created = await addLead(asLead(row), 'UK', 'no_website', null, null, true, chosen.trade, chosen.town);
        if (created?.id) leadIds.push(created.id);
      }
      if (leadIds.length === 0) {
        toast({
          title: 'Nothing to audit',
          description: 'Every business in that selection is already in your CRM under a different entry, so no new leads were created. Add them by hand and run audits from Outreach.',
          variant: 'destructive',
        });
        return;
      }
      const { data, error: fnErr } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>('bulk-jobs', {
        // skip_seo: a market batch measures who AI names, not five strangers' website grades. The
        // scan was ~60% of the bill; create-ai-audit honours the flag per run.
        body: {
          action: 'create', job_type: 'audit', lead_ids: leadIds,
          params: { question_count: MARKET_AUDIT_QUESTIONS, skip_seo: MARKET_SKIP_SEO },
        },
      });
      if (fnErr || data?.ok === false) {
        let real = fnErr?.message ?? data?.error ?? 'Could not start the audit batch.';
        try {
          const ctx = (fnErr as unknown as { context?: Response })?.context;
          if (ctx?.text) { const b = await ctx.text(); const p = b ? JSON.parse(b) as { error?: string } : null; if (p?.error) real = p.error; }
        } catch { /* keep the wrapper message */ }
        /* LEADS WRITTEN, NO AUDITS: say it in full. This is the state the 409 used to leave
           behind silently — CRM rows with nothing measuring them. Names what happened, what it
           cost, and what to do, because "not started" alone left the operator to work out that
           they now had orphaned leads. */
        console.info('[market] audit batch refused after CRM writes', { leadIds, error: real });
        toast({
          title: `${leadIds.length} lead${leadIds.length === 1 ? '' : 's'} added, but NO audits started`,
          description: `${real} The ${leadIds.length} business${leadIds.length === 1 ? '' : 'es'} ${leadIds.length === 1 ? 'is' : 'are'} now in your CRM with nothing measuring them. Run the audits from Outreach when the other job finishes, or delete them.`,
          variant: 'destructive',
        });
        return;
      }
      setAuditOpen(false);
      toast({
        title: `${leadIds.length} audit${leadIds.length === 1 ? '' : 's'} queued`,
        description: 'The panel now tracks them. They drain through the audit queue, roughly a minute per tick.',
      });
      /* Seed the progress strip immediately rather than waiting up to JOB_POLL_MS for the first
         poll — the whole complaint was that nothing visibly happened after the click. */
      setFinishedJob(null);
      setJobProgress({ id: 'pending', status: 'queued', total: leadIds.length, done_count: 0, failed_count: 0, skipped_count: 0 });
      void readJob().then((j) => { if (j && JOB_ACTIVE.has(j.status)) setJobProgress(j); });
      await reload();
    } finally {
      setAuditBusy(false);
    }
  }, [view, chosen, auditCount, addLead, asLead, toast, reload, readJob]);

  /* ── OPENING THE AUDIT CONFIRM ────────────────────────────────────────────────────────────────
     The button is NEVER disabled. A disabled button gives no reason, and "nothing happened" is the
     worst thing this panel can do — it cost a diagnosis session to establish the click was landing
     at all. So: log the counts, open the dialog whatever the state, and let the dialog explain any
     refusal. The toast covers the one case where the dialog itself might not mount. */
  const openAuditDialog = useCallback(() => {
    const pool = view?.pool ?? [];
    const chains = pool.filter((p) => p.isChain);
    const audit = pool.filter((p) => !p.isChain);
    // Deliberately console.info, not debug: this is the proof the click landed, and it must
    // survive a default-filtered console.
    console.info('[market] audit confirm opened', {
      trade: chosen?.trade ?? null, town: chosen?.town ?? null,
      poolEntries: pool.length, auditable: audit.length, chains: chains.length,
      completedRuns: view?.concentration.completeRuns ?? 0,
    });
    if (audit.length === 0) {
      toast({
        title: 'Nothing here can be audited',
        description: pool.length === 0
          ? 'The prospect pool is empty, so there is nothing to audit. Run the lead search first.'
          : `All ${pool.length} ${pool.length === 1 ? 'entry' : 'entries'} in this pool are chain branches. Chains are not prospects, so there is nothing to audit here.`,
        variant: 'destructive',
      });
    }
    setAuditOpen(true);
    // Re-checked every time the dialog opens: a job may have started or finished since the last look.
    setJobCheckDone(false);
    setActiveJob(null);
    void (async () => {
      try {
        // bulk_jobs is not in the generated types; RLS scopes it to the caller's own rows.
        const client = supabase as unknown as { from: (t: string) => { select: (c: string) => { in: (c: string, v: string[]) => { limit: (n: number) => Promise<{ data: { job_type: string; status: string }[] | null }> } } } };
        const { data } = await client.from('bulk_jobs').select('job_type, status').in('status', ['queued', 'running']).limit(1);
        setActiveJob(data?.[0] ?? null);
      } catch {
        /* A failed check must not block the run: the dialog says it could not check rather than
           claiming the path is clear. */
      } finally {
        setJobCheckDone(true);
      }
    })();
  }, [view, chosen, toast]);

  const conc = view?.concentration;
  /* POOL ARITHMETIC, derived here so the panel can show its working.
     poolFound counts Places ROWS; poolEntries counts them after chain collapsing. The difference is
     the branches that folded away, which is what made "5 found, 4 named, 0 left" look wrong. */
  const poolFound = view?.poolState.state === 'ready' ? view.poolState.total : 0;
  const poolEntries = (view?.pool.length ?? 0) + (view?.poolExcluded.length ?? 0);
  const collapsedRows = Math.max(0, poolFound - poolEntries);
  const auditable = view ? view.pool.filter((p) => !p.isChain) : [];
  const chainEntries = view ? view.pool.filter((p) => p.isChain).length : 0;
  const plannedAudits = Math.min(auditCount, auditable.length);
  /* THE TRUE ESTIMATE, ITEMISED. The old figure counted question runs only and read ~4x low
     ($0.19 against a real $0.75-0.80). The targets are the ones that would actually be audited, so
     the website count — and therefore the SEO saving — describes this batch, not an average. */
  const targets = auditable.slice(0, plannedAudits);
  const withWebsite = targets.filter((t) => !t.noWebsite).length;
  const cost = marketBatchCost(plannedAudits, MARKET_AUDIT_QUESTIONS, withWebsite);
  /* MEASURED, NOT MEASURABLE. completeRuns is what produced competitor names; audits alone can be
     pending or failed. With zero completed runs nobody CAN have been named, so the never-named list
     is not a prospect list — it is just the pool. Item 6: the two states must read differently. */
  /** Named but thin — shown as their own group in "Who AI names", and (when they are in the pool)
   *  kept as prospects rather than subtracted. */
  const thinTail = (view?.named ?? []).filter((n) => n.tier === 'thin');
  const completedRuns = view?.concentration.completeRuns ?? 0;
  const auditsExist = (view?.concentration.audits ?? 0) > 0;
  const measured = completedRuns > 0;
  const pendingAudits = Math.max(0, (view?.concentration.audits ?? 0) - completedRuns);
  const pct = apifyUsage?.usagePct ?? null;
  const tone = apifyTone(pct);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Store className="h-4 w-4" />
          {chosen ? <>Market: {chosen.trade} · {chosen.town}</> : <>Market view</>}
        </h2>
        {chosen && (
          <Button variant="outline" size="sm" onClick={() => void reload()} disabled={loading}>
            {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
            Reload
          </Button>
        )}
      </div>

      {!chosen && (
        <p className="text-sm text-muted-foreground">
          Enter a trade and a town above, then press Search.
        </p>
      )}
      {loading && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading what we already have for this market…
        </p>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <span className="font-semibold">Market view failed.</span> {error}
        </div>
      )}

      {/* ── A BATCH IN FLIGHT ────────────────────────────────────────────────────────────────
          Pressing the button used to produce no visible change for minutes. This states what is
          queued, how far it has got, and that the queue moves on a ~1-minute tick. */}
      {jobProgress && (
        <div className="space-y-1.5 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2.5">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Audits {jobProgress.status === 'queued' ? 'queued' : 'running'}:
            {' '}{jobProgress.done_count} of {jobProgress.total} done
            {jobProgress.failed_count > 0 && <span className="text-destructive">· {jobProgress.failed_count} failed</span>}
            {jobProgress.skipped_count > 0 && <span className="text-muted-foreground">· {jobProgress.skipped_count} skipped</span>}
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${jobProgress.total > 0 ? Math.round((jobProgress.done_count / jobProgress.total) * 100) : 0}%` }}
            />
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Each audit is enqueued, then the audit queue drains it on a roughly one-minute tick, so
            the whole batch takes a few minutes. This panel refreshes itself when the batch finishes —
            you can leave the page.
          </p>
        </div>
      )}

      {/* Finished while they were looking at it: the fold has already been reloaded, so this is a
          statement of what changed rather than a prompt to go and check. */}
      {!jobProgress && finishedJob && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-flag-green/40 bg-green-500/5 px-3 py-2.5">
          <Check className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-500" />
          <p className="text-sm">
            <span className="font-semibold">Audit batch {finishedJob.status}</span>
            {' — '}{finishedJob.done_count} of {finishedJob.total} completed
            {finishedJob.failed_count > 0 && <span className="text-destructive"> ({finishedJob.failed_count} failed)</span>}.
            {' '}The market below has been reloaded.
          </p>
          <Button variant="outline" size="sm" className="ml-auto h-7" onClick={() => { setFinishedJob(null); void reload(); }}>
            <RefreshCw className="mr-1.5 h-3 w-3" /> Reload again
          </Button>
        </div>
      )}

      {/* NO AUDITS AT ALL. A market with no data and a market with no competition must never look
          the same, so this REPLACES the concentration card rather than rendering it full of zeros:
          "0 businesses named, top share 0%" reads as "nobody is winning here", which is the
          opposite of the truth. */}
      {view && conc && conc.audits === 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="p-3 pb-2 sm:p-4 sm:pb-2">
            <CardTitle className="text-base">No audits yet for {view.trade} in {view.town}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-3 pt-0 sm:p-4 sm:pt-0">
            <p className="text-sm text-muted-foreground">
              Nothing has been measured in this market, so there is nothing to say about who AI names
              or how concentrated it is. That is not the same as a market where AI names nobody.
            </p>
            {/* THE ARITHMETIC THE BUTTON ACTUALLY USES. This line said "9 found and ready to
                audit" from pool.length while the button counted auditable (chains excluded), so
                the sentence and the control could disagree by the number of chains. */}
            <p className="text-xs text-muted-foreground">
              {view.poolState.state === 'ready'
                ? `${view.pool.length} found, ${auditable.length} auditable${chainEntries > 0 ? `, ${chainEntries} chain ${chainEntries === 1 ? 'entry' : 'entries'} excluded` : ''}.`
                : 'Run the lead search first to find the local businesses, then audit them.'}
            </p>
            <div className="flex flex-wrap gap-2 pt-0.5">
              <Button size="sm" onClick={openAuditDialog}>
                <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Run audits for this town
              </Button>
              <Button size="sm" variant="outline" onClick={() => setSearchOpen(true)} disabled={searching}>
                <Search className="mr-1.5 h-3.5 w-3.5" /> {view.poolState.state === 'ready' ? 'Re-run the lead search' : 'Run the lead search'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {view && conc && conc.audits > 0 && (
        <>
          {/* ── 1. CONCENTRATION ─────────────────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="p-3 pb-2 sm:p-4 sm:pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                How concentrated is {view.trade} in {view.town}?
                {conc.thin && (
                  <Badge variant="outline" className="border-amber-500/40 text-amber-600 dark:text-amber-500">
                    THIN — {conc.audits} of {EVIDENCE_MIN_AUDITS} audits
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-3 pt-0 sm:p-4 sm:pt-0">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Audits behind it" value={String(conc.audits)} sub={`${conc.completeRuns} completed run${conc.completeRuns === 1 ? '' : 's'}`} />
                <Stat label="Businesses named" value={String(conc.distinctBusinesses)} sub={`${conc.totalMentions} mentions`} />
                <Stat label="Most named" value={conc.topName ?? '—'} sub={conc.topName ? `${conc.topSharePct}% of all mentions` : 'nothing named yet'} />
                <Stat label="Top three combined" value={conc.topThreeSharePct ? `${conc.topThreeSharePct}%` : '—'} sub="of all mentions" />
              </div>

              {/* JUNK FLAG. A suspicion with its ratio attached, never a verdict — and the fix is
                  offered, not run, because re-extraction is an unmetered LLM call per run. */}
              {conc.likelyJunk && (
                <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                  <p className="text-xs leading-snug text-amber-700 dark:text-amber-400">
                    <span className="font-semibold">These names are probably not clean.</span>{' '}
                    {conc.distinctPerAudit} distinct names per audit, against a threshold of {JUNK_RATIO_PER_AUDIT}.
                    The AI cleaner never ran on older audits, so this fold may be full of headings and stray words
                    rather than firms. Treat the figures above as unreliable until it is re-read.
                  </p>
                  <Button size="sm" variant="outline" onClick={() => setReExtractOpen(true)} disabled={reExtractBusy || conc.runIds.length === 0}>
                    {reExtractBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                    Re-read {conc.runIds.length} run{conc.runIds.length === 1 ? '' : 's'} with the AI cleaner
                  </Button>
                </div>
              )}

              {conc.truncatedBlocks > 0 && (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  {conc.truncatedBlocks} of {conc.engineBlocks} engine answers came back holding exactly {MAX_PER_ENGINE_CAP} competitors,
                  the per-engine cap — so this market is at least as fragmented as it looks here, and possibly more.
                </p>
              )}
              {/* ONLY THE HIGH END IS MEANINGFUL. The old copy quoted a "clean market sits at
                  4–9" band measured BEFORE spelling variants were merged. Merging lowers the
                  number by design — Wisbech went 48 distinct to 34 — so that band now reads a
                  healthy market as abnormal. The junk threshold is unchanged; only the claim
                  about what normal looks like is gone, because there is no post-merge
                  measurement to support one yet. */}
              {!conc.likelyJunk && conc.distinctPerAudit > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {conc.distinctPerAudit} distinct names per audit. Only the high end means anything:
                  {' '}{JUNK_RATIO_PER_AUDIT}+ suggests the names were never cleaned.
                </p>
              )}
            </CardContent>
          </Card>

          {/* ── 2. WHO AI NAMES ──────────────────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="p-3 pb-2 sm:p-4 sm:pb-2">
              <CardTitle className="text-base">Who AI names ({view.named.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0">
              {view.named.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No completed audit in this market named a single competitor. That is a real finding, not a gap —
                  but with {conc.completeRuns} completed run{conc.completeRuns === 1 ? '' : 's'} behind it, check the audits before acting on it.
                </p>
              ) : (
                <ul className="space-y-1">
                  {view.named.filter((n) => n.tier !== 'thin').map((n) => (
                    <li key={n.key} className="flex flex-wrap items-baseline gap-x-2 border-b border-border/40 py-1 text-[13px] last:border-b-0">
                      <span className="min-w-[3.5rem] shrink-0 tabular-nums text-xs text-muted-foreground">
                        {n.audits} audit{n.audits === 1 ? '' : 's'}
                      </span>
                      <span className="font-medium">{n.name}</span>
                      <span className="text-xs text-muted-foreground">{n.mentions} mention{n.mentions === 1 ? '' : 's'}</span>
                      {/* Every spelling that folded into this firm, so a wrong merge is visible
                          rather than hidden behind a tidy single name. */}
                      {n.variants.length > 1 && (
                        <span className="w-full text-[11px] text-muted-foreground/80">
                          merged from {n.variants.length} spellings: {n.variants.join(' · ')}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {/* ── THE THIN TAIL ────────────────────────────────────────────────────────────
                  Named, but barely: a share of audits or of the leader's mentions below the
                  thresholds in marketView.ts. Kept OUT of the list above (they are not who AI
                  recommends here) and shown separately with their thinness, because "AI mentioned
                  it once" is a completely different fact from "AI recommends it".
                  Entries also cited in OTHER towns of this trade are flagged as likely national
                  brands — that is evidence from citations, not a brand list, and it stops Able
                  Group and Rapid Secure UK reading as Hastings prospects. */}
              {thinTail.length > 0 && (
                <div className="mt-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                  <p className="text-[11px] font-medium text-foreground/80">
                    Barely named ({thinTail.length}) — mentioned, but not who AI recommends here
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                    Under {Math.round(ESTABLISHED_MIN_AUDIT_SHARE * 100)}% of this market's audits, or under{' '}
                    {Math.round(ESTABLISHED_MIN_MENTION_SHARE * 100)}% of the leader's mentions
                    {view.leader ? ` (${view.leader.mentions} for ${view.leader.name})` : ''}.
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {thinTail.map((n) => (
                      <li key={n.key} className="flex flex-wrap items-baseline gap-x-2 text-[11px] leading-snug">
                        <span className="font-medium text-foreground/80">{n.name}</span>
                        <span className="text-muted-foreground">
                          {n.mentions} mention{n.mentions === 1 ? '' : 's'} in {n.audits} of {conc.audits} audits
                          {view.leader ? `, against ${view.leader.mentions} for the leader` : ''}
                        </span>
                        {n.otherTowns > 0 && (
                          <Badge variant="outline" className="border-blue-500/40 text-[10px] text-blue-500">
                            also in {n.otherTowns} other {n.otherTowns === 1 ? 'town' : 'towns'} · likely national
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                  {view.otherTownsCapped && (
                    <p className="mt-1.5 text-[10px] leading-snug text-amber-600 dark:text-amber-500">
                      The other-town check stopped at its read cap, so "also in N other towns" is a floor, not a total.
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── 3. WHO AI HAS NEVER NAMED ─────────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="p-3 pb-2 sm:p-4 sm:pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <MapPin className="h-4 w-4" />
                {measured ? 'Who AI has never named' : 'Local businesses in this pool'}
                {view.poolState.state === 'ready' && <Badge variant="secondary">{view.pool.length}</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-3 pt-0 sm:p-4 sm:pt-0">
              {/* THE THREE STATES, EACH READING DIFFERENTLY. An empty prospect list and a search
                  that was never run are completely different facts about a market. */}
              {view.poolState.state === 'never_searched' && (
                <PoolNotice
                  title="No lead search has been run for this trade and town."
                  body="This is not an empty market — nobody has looked yet. Run the search to see which local businesses exist, then subtract the ones AI already names."
                  onSearch={() => setSearchOpen(true)}
                  busy={searching}
                />
              )}
              {view.poolState.state === 'expired' && (
                <PoolNotice
                  title={`Searched for "${view.poolState.keyword}" on ${shortDate(view.poolState.searchedAt) ?? 'an earlier date'}, but the lead pool has since expired.`}
                  body={`Pools are cached for ${view.poolState.ttlHours} hours. The businesses are still out there — the cached copy is just gone, so it needs running again.`}
                  onSearch={() => setSearchOpen(true)}
                  busy={searching}
                />
              )}
              {view.poolState.state === 'ready' && (
                <>
                  {/* NOTHING MEASURED = NOTHING TO SUBTRACT. With no completed run, every business
                      is "never named" by default, which would dress an unmeasured pool up as a
                      prospect list. This notice comes FIRST and the list below is a pool, not a
                      prospect list, until a run completes. The louder the list, the louder this
                      has to be. */}
                  {!measured && (
                    <div className="rounded-md border-2 border-amber-500/50 bg-amber-500/10 px-3 py-2.5">
                      <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                        {auditsExist
                          ? `Not measured yet: ${pendingAudits} audit${pendingAudits === 1 ? '' : 's'} for this market ${pendingAudits === 1 ? 'has' : 'have'} not completed.`
                          : 'Nothing has been measured in this market yet.'}
                      </p>
                      <p className="mt-1 text-[11px] leading-snug text-amber-700/90 dark:text-amber-400/90">
                        No completed run means no competitor names, so there is nothing to subtract —
                        every business below would look invisible whatever AI actually says. This is
                        the local business pool, not a prospect list. Run audits first, then this
                        becomes "who AI has never named".
                      </p>
                    </div>
                  )}
                  {/* WHAT THIS LIST ACTUALLY IS. Not "the businesses in this town": what Google
                      Places returned inside the geocoded boundary. Two proven mechanisms keep real
                      local firms out of it, so the screen says so rather than implying completeness.
                      Measured 2026-08-04 on Hastings locksmiths: Battle Locksmiths (10 citations
                      across 6 audits) sits 10km north of a 6x11km rectangle, and Surelock Homes,
                      LockFit and LockRite — 40, 31 and 32 citations — have no Places listing in the
                      town at all, so no phrasing or boundary could ever return them. */}
                  <p className="text-[11px] text-muted-foreground">
                    What Google Places returned for &ldquo;{view.poolState.keyword}&rdquo;
                    {' '}{view.poolState.scope === 'town' ? 'inside the town boundary' : `within a ${Math.round(view.poolState.radiusM / 1000)}km radius`}:
                    {' '}{view.poolState.total} business{view.poolState.total === 1 ? '' : 'es'},
                    searched {shortDate(view.poolState.searchedAt) ?? 'recently'}.
                    {measured
                      ? ` ${view.poolMatchedNamed} of them AI already names.`
                      : ' Nothing measured, so none have been subtracted.'}
                  </p>
                  <p className="text-[11px] leading-snug text-amber-700 dark:text-amber-400">
                    This is not a complete list of the town's businesses, and cannot be. Firms just
                    outside the boundary never appear in it (they are listed separately below), and
                    firms with no Google Places listing in the town — franchises and service-area
                    businesses — cannot appear at all, however the search is phrased. AI names several
                    of those in this trade.
                  </p>
                  {/* A radius pool is not a town pool. Say so rather than letting a wider list
                      masquerade as the market that was measured. */}
                  {view.poolState.scope === 'radius' && (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] leading-snug text-amber-700 dark:text-amber-400">
                      <span className="font-semibold">This pool came from a radius search, not a town boundary.</span>{' '}
                      It may include businesses in neighbouring towns that the audits never covered. Re-run the search here to get a town-only pool.
                    </div>
                  )}
                  {view.pool.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Every business in the pool is already named by AI. Nothing to contact here.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {view.pool.map((p) => (
                        <li key={p.key} className="flex flex-wrap items-center gap-2 border-b border-border/40 py-1.5 text-[13px] last:border-b-0">
                          <span className="font-medium">{p.name}</span>
                          {/* NAMED, BUT BARELY. Kept as a prospect deliberately (graded, not
                              binary) and it must carry its thinness: "1 mention in 1 of 6 audits"
                              is the pitch, and hiding it would make this row look never-named. */}
                          {p.thin && (
                            <Badge variant="outline" className="border-amber-500/50 text-[10px] text-amber-600 dark:text-amber-500">
                              barely named · {p.thin.mentions} mention{p.thin.mentions === 1 ? '' : 's'} in {p.thin.audits} of {conc.audits}
                              {view.leader ? `, vs ${view.leader.mentions} for the leader` : ''}
                            </Badge>
                          )}
                          {/* Chains, by repetition alone — no hardcoded list. Ten Timpson branches
                              are one company, not ten prospects. */}
                          {p.isChain && (
                            <Badge variant="outline" className="border-blue-500/40 text-[10px] text-blue-500">
                              CHAIN · {p.branches} branches
                            </Badge>
                          )}
                          {p.noWebsite && <Badge variant="outline" className="text-[10px]">no website</Badge>}
                          <Button
                            size="sm" variant="outline" className="ml-auto h-7"
                            disabled={addingKey === p.key || addedKeys.has(p.key)}
                            onClick={() => void addOne(p)}
                          >
                            {addingKey === p.key
                              ? <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              : addedKeys.has(p.key) ? <Check className="mr-1 h-3 w-3" /> : <Plus className="mr-1 h-3 w-3" />}
                            {addedKeys.has(p.key) ? 'Added' : 'Add to CRM'}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {/* THE SUBTRACTION, SHOWN AND RECONCILED.
                      Was a <details>, collapsed by default, and it rendered as empty rows. This is
                      the audit trail for silent exclusions — burying it behind a click was wrong on
                      its own terms, so it is now always open, and every field has an explicit
                      fallback so a missing value reads as "(name missing)" rather than as blank.
                      A blank row is indistinguishable from no row, which is the whole failure mode
                      this panel exists to catch. */}
                  {(view.poolExcluded.length > 0 || collapsedRows > 0) && (
                    <div className="space-y-1.5 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                      {/* THE MATHS, FOLLOWABLE. "5 found, 4 already named, 0 left" does not add up
                          on its own — the gap is chain collapsing, and it now says so. */}
                      <p className="text-[11px] font-medium text-foreground/80">
                        {poolFound} found
                        {collapsedRows > 0 && <> → {collapsedRows} folded into a chain entry</>}
                        {' → '}{poolEntries} {poolEntries === 1 ? 'entry' : 'entries'}
                        {' − '}{view.poolExcluded.length} already named
                        {' = '}<span className="font-semibold">{view.pool.length} to contact</span>
                      </p>
                      {view.poolExcluded.length > 0 && (
                        <ul className="space-y-1 border-t border-border/40 pt-1.5">
                          {view.poolExcluded.map((x, i) => (
                            <li key={`${x.name || 'unnamed'}-${i}`} className="text-[11px] leading-snug text-muted-foreground">
                              <span className="font-medium text-foreground/80">{x.name || '(name missing)'}</span>
                              {x.branches > 1 && <span className="text-muted-foreground"> +{x.branches - 1} branch{x.branches - 1 === 1 ? '' : 'es'}</span>}
                              {' → already named as '}
                              <span className="font-medium text-foreground/80">{x.matchedNamed || '(match missing)'}</span>
                              {typeof x.matchedMentions === 'number' && typeof x.matchedAudits === 'number'
                                ? ` (${x.matchedMentions} mention${x.matchedMentions === 1 ? '' : 's'} across ${x.matchedAudits} audit${x.matchedAudits === 1 ? '' : 's'})`
                                : ' (counts unavailable)'}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {/* NEARBY, OUTSIDE THE BOUNDARY. Visible and tagged, never merged into the
                      town pool: they are not businesses in this town and the counts above must not
                      pretend they are. No Add button — deciding whether a Bexhill locksmith belongs
                      in a Hastings market is a judgement, not a default. */}
                  {(view.poolNearby?.length ?? 0) > 0 && (
                    <div className="space-y-1.5 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                      <p className="text-[11px] font-medium text-foreground/80">
                        Nearby, outside the town boundary ({view.poolNearby!.length})
                      </p>
                      <p className="text-[11px] leading-snug text-muted-foreground">
                        Found by a radius pass, so you can see who the boundary excluded. Not counted
                        as businesses in {view.town} and not part of the numbers above.
                      </p>
                      <ul className="space-y-1">
                        {view.poolNearby!.map((n) => (
                          <li key={n.key} className="flex flex-wrap items-center gap-2 text-[11px]">
                            <span className="font-medium text-foreground/80">{n.name}</span>
                            {n.isChain && (
                              <Badge variant="outline" className="border-blue-500/40 text-[10px] text-blue-500">
                                CHAIN · {n.branches}
                              </Badge>
                            )}
                            {n.noWebsite && <Badge variant="outline" className="text-[10px]">no website</Badge>}
                            {n.thin && (
                              <span className="text-muted-foreground">
                                AI names it: {n.thin.mentions} mention{n.thin.mentions === 1 ? '' : 's'} in {n.thin.audits} of {conc.audits} audits
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" onClick={openAuditDialog}>
                      <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Run audits for this town
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setSearchOpen(true)} disabled={searching}>
                      <Search className="mr-1.5 h-3.5 w-3.5" /> Re-run the lead search
                    </Button>
                  </div>
                </>
              )}

              {/* The town-only fallback, surfaced the same way the search page does it — a wider
                  pool must never masquerade as a town pool. */}
              {townFilterFallback && (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-500" />
                  <p className="text-[11px] leading-snug text-amber-700 dark:text-amber-400">
                    <span className="font-semibold">&ldquo;This town only&rdquo; did not apply.</span>{' '}
                    {townFilterFallback.reason} The pool above may include nearby towns.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ── LEAD SEARCH CONFIRM ───────────────────────────────────────────────────────────── */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Run the lead search?</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              Searches Google Places for <span className="font-medium">{chosen?.trade}</span> in{' '}
              <span className="font-medium">{chosen?.town}</span>, restricted to the town boundary.
            </p>
            <p className="text-xs text-muted-foreground">
              Up to ~${(4 * GOOGLE_PAGE_USD).toFixed(2)} of Google Places quota — a ceiling, not a bill, and a separate
              budget from Apify. This does not touch your Apify cap.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSearchOpen(false)}>Cancel</Button>
            <Button onClick={() => void runSearch()} disabled={searching}>
              {searching && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Run the search
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── RE-EXTRACT CONFIRM ────────────────────────────────────────────────────────────── */}
      <Dialog open={reExtractOpen} onOpenChange={setReExtractOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Re-read the competitor names?</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              An AI re-reads the answers already stored on {conc?.runIds.length ?? 0} completed run
              {conc?.runIds.length === 1 ? '' : 's'} and replaces the scraped names with real firms. No new
              audits, no Apify, nothing re-measured.
            </p>
            <p className="text-xs text-muted-foreground">
              One LLM call per run. That spend is not metered anywhere in this app, so it is never run automatically.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReExtractOpen(false)}>Cancel</Button>
            <Button onClick={() => void runReExtract()} disabled={reExtractBusy}>
              {reExtractBusy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Re-read them
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── AUDIT BATCH CONFIRM. Cost first, Apify figure beside it, and the CRM side effect said
          out loud — this adds leads as well as spending. */}
      <Dialog open={auditOpen} onOpenChange={setAuditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Run audits for {chosen?.town}?</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {/* THE REFUSAL, WITH ITS REASON. The button no longer disables itself, so any reason
                the batch cannot run has to be stated here instead of being mimed by a greyed
                control. */}
            {auditable.length === 0 && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-[13px] text-destructive">
                <p className="font-semibold">Nothing here can be audited.</p>
                <p className="mt-1 leading-snug">
                  {(view?.pool.length ?? 0) === 0
                    ? 'The pool is empty for this trade and town. Run the lead search first, then come back.'
                    : `All ${view?.pool.length} ${view?.pool.length === 1 ? 'entry' : 'entries'} in this pool are chain branches (${chainEntries} chain ${chainEntries === 1 ? 'entry' : 'entries'}). Chains are not prospects, so there is nothing here worth auditing.`}
                </p>
              </div>
            )}

            {/* AN ACTIVE BULK JOB, CAUGHT BEFORE ANYTHING IS WRITTEN. bulk-jobs allows exactly one
                job per user and 409s otherwise — and that used to be discovered only AFTER the CRM
                rows existed, which is how "choosing 5 did nothing, choosing 1 worked" happened. */}
            {activeJob && (
              <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2.5 text-[13px] text-amber-700 dark:text-amber-400">
                <p className="font-semibold">You already have a bulk job running.</p>
                <p className="mt-1 leading-snug">
                  A {activeJob.job_type} job is {activeJob.status}. Only one runs at a time, so this batch
                  would be refused after the businesses had already been added to your CRM. Wait for it to
                  finish, or cancel it, then run this.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-medium">How many businesses</Label>
              <Select value={String(auditCount)} onValueChange={(v) => setAuditCount(Number(v))}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 3, 5, 10, 15, 20, MARKET_AUDIT_MAX].map((n) => (
                    <SelectItem key={n} value={String(n)} disabled={n > auditable.length}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {auditable.length} never-named business{auditable.length === 1 ? '' : 'es'} available (chains excluded — they are not prospects).
              </p>
            </div>

            {/* THE BILL, ITEMISED. The old line quoted question runs only and read ~4x low. Every
                line the batch actually incurs is listed, so the total can be checked rather than
                trusted. */}
            <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-[13px]">
              <p className="font-semibold">Estimated total ~${cost.total.toFixed(2)}</p>
              <ul className="mt-1.5 space-y-1">
                {cost.lines.map((l) => (
                  <li key={l.label} className="flex items-baseline justify-between gap-3 text-[11px] text-muted-foreground">
                    <span>
                      <span className="font-medium text-foreground/90">{l.label}</span>
                      {' — '}{l.detail}
                      {l.unverified && <span className="text-amber-600 dark:text-amber-500"> (unverified figure)</span>}
                    </span>
                    <span className="shrink-0 tabular-nums text-foreground/80">${l.usd.toFixed(2)}</span>
                  </li>
                ))}
              </ul>
              {MARKET_SKIP_SEO && (
                <p className="mt-1.5 text-[11px] leading-snug text-green-700 dark:text-green-500">
                  Website SEO scans are skipped on a market batch, saving ~${cost.seoSaved.toFixed(2)}
                  {' '}({withWebsite} of these {withWebsite === 1 ? 'has' : 'have'} a website, at ${SEO_SCAN_USD} each).
                  This batch is about who AI names, not website grades.
                </p>
              )}
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Questions at ${AUDIT_EST_USD_PER_QUESTION} each — the same measured figure the AI Audit page uses.
                An estimate, not a bill.
              </p>
              {/* THE CRM SIDE EFFECT, STATED. bulk-jobs audits are keyed on lead ids and refuse
                  anything not in the CRM, so these businesses become leads as part of the run. */}
              <p className="mt-1.5 text-[11px] font-medium text-foreground/90">
                This also adds {plannedAudits} business{plannedAudits === 1 ? '' : 'es'} to your CRM — audits run against leads, so they have to exist there first.
              </p>
            </div>

            {/* The live Apify figure, from the same hook and the same thresholds the AI Audit page
                uses. Deliberately NOT a block: that page does not have one, and two pages
                disagreeing about whether you may spend is worse than neither having a gate. */}
            {apifyUsage?.monthlyUsageUsd != null && apifyUsage.maxMonthlyUsageUsd ? (
              <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-3 py-2 text-[12px] ${
                tone === 'critical' ? 'border-destructive/40 bg-destructive/10 text-destructive'
                  : tone === 'warn' ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-500'
                    : 'border-border/60 bg-card/60 text-muted-foreground'}`}>
                {tone === 'ok' ? <Check className="h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
                <span className="font-semibold">Apify ${apifyUsage.monthlyUsageUsd.toFixed(2)} of ${apifyUsage.maxMonthlyUsageUsd.toFixed(2)}</span>
                <span className="tabular-nums">({((pct ?? 0) * 100).toFixed(1)}%)</span>
                <span>this cycle{shortDate(apifyUsage.cycleEnd) ? `, resets ${shortDate(apifyUsage.cycleEnd)}` : ''}.</span>
                {tone !== 'ok' && <span className="font-medium">At 100% audit questions and SEO scans both stop.</span>}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">Apify usage figure unavailable — check /ai-audit before running a large batch.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAuditOpen(false)}>Cancel</Button>
            {/* Still disabled when the run genuinely cannot proceed — but now every reason is
                written above it, and the check that produced it is stated (or admitted). */}
            <Button onClick={() => void runAudits()} disabled={auditBusy || plannedAudits === 0 || !!activeJob || !jobCheckDone}>
              {(auditBusy || !jobCheckDone) && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {!jobCheckDone ? 'Checking for running jobs' : `Add ${plannedAudits} to CRM and run`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/60 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate text-[15px] font-semibold" title={value}>{value}</p>
      <p className="text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function PoolNotice({ title, body, onSearch, busy }: { title: string; body: string; onSearch: () => void; busy: boolean }) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/40 px-3 py-3">
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs text-muted-foreground">{body}</p>
      <Button size="sm" onClick={onSearch} disabled={busy}>
        {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Search className="mr-1.5 h-3.5 w-3.5" />}
        Run the lead search
      </Button>
    </div>
  );
}
