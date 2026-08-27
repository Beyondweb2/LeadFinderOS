import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronRight, Loader2, MapPin, Plus, RefreshCw, Search, Sparkles, Store } from 'lucide-react';
import NichePanel from '@/components/NichePanel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useMarketView } from '@/hooks/useMarketView';
import MeasureMarket from '@/components/MeasureMarket';
import { useApifyUsage, apifyTone } from '@/hooks/useApifyUsage';
import { useLeadSearchContext } from '@/contexts/LeadSearchContext';
import { useCampaigns } from '@/hooks/useCampaigns';
import { pickCampaignForTrade, describeCampaignPick } from '@/lib/campaignForTrade';
import { useOutreach } from '@/hooks/useOutreach';
import { shortDate } from '@/lib/auditErrors';
import {
  AUDIT_EST_USD_PER_QUESTION, MARKET_AUDIT_QUESTIONS, MARKET_AUDIT_MAX,
  EVIDENCE_MIN_AUDITS, JUNK_RATIO_PER_AUDIT, MAX_PER_ENGINE_CAP,
  MARKET_SKIP_SEO, SEO_SCAN_USD, marketBatchCost,
  ESTABLISHED_MIN_AUDIT_SHARE, ESTABLISHED_MIN_MENTION_SHARE,
  marketShape, marketPlainRead, invisibilityPhrase, MARKET_AUDIT_QUESTION_COUNT,
  MARKET_AUDIT_MIN_AUDITS, marketAuditProgressPhrase, shouldAutoClean, CLEANER_USD_PER_RUN, asPence,
  MARKET_SEARCH_USD, poolShowsBusinesses,
  auditsInView, openArrivalSearchConfirm, marketNamesUncleaned, TARGET_MAX_NAMED_SHARE,
  MARKET_ONE_AUDIT_USD, PLACE_DETAILS_USD, auditableTargets, poolRowToLead,
  type MarketPoolRow,
  type MarketViewResult,
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
/** Google Places text search, per page of ~20 results, from search-leads' own logging constant.
 *  ⛔ Was 0.032, the Text Search (Pro) rate, on a call that bills at Text Search (Enterprise) because
 *  its field mask requests websiteUri. $35 per 1,000. Corrected with search-leads 2026-08-06. */
const GOOGLE_PAGE_USD = 0.035;

export interface MarketPanelProps {
  /** Trade as typed on Find Leads. Normalised server-side by the same norm() the playbook uses. */
  trade: string;
  /** Town as typed on Find Leads. */
  town: string;
  /**
   * Arrive with the lead-search confirm already open — set by the Coverage page's "Find leads"
   * button, which knows the trade and town and exists to stop them being retyped.
   *
   * ⛔ IT OPENS THE CONFIRM, IT DOES NOT RUN THE SEARCH. The search costs ~$0.11 against a stale
   * pool, and a town reached from Coverage is untouched almost by definition, so the pool is stale
   * almost every time. A link that spent money on arrival would be a dialog-free payment on a click
   * that reads like navigation.
   *
   * ⚠️ AND IT IS THE ONE LEGITIMATE CASE OF AN AUTO-OPENING MODAL. §6c bans PERSISTING an open
   * dialog, because a modal springing open on return is something you did not ask for. This one is
   * asked for, by the click that navigated here — which is why it comes from the URL (an intent
   * that arrives once) and never from stored state, and why it is consumed below.
   */
  openSearchConfirm?: boolean;
  /** The campaign the operator has selected on Find Leads — the FALLBACK only, never the default.
   *  A lead's own trade decides first; this is what gets used, and named, when nothing matches. */
  selectedCampaignId?: string | null;
}

/**
 * The market view, rendered inside Find Leads as a search MODE rather than its own page.
 * Inputs come from the page's existing niche and location boxes — there is deliberately no picker
 * here and no restriction to trades that already have audits, because "what do I have for
 * locksmiths in Peterborough, and what would it cost to get the rest" is the question.
 */
export default function MarketPanel({ trade, town, openSearchConfirm, selectedCampaignId = null }: MarketPanelProps) {
  const { view, loading, error, load, reload } = useMarketView();
  const { usage: apifyUsage } = useApifyUsage();
  const { search, isLoading: searching, townFilterFallback, leads, resolvedLocation, locationCandidates } = useLeadSearchContext();
  /* A ref, not the value: measureSearch awaits the search and then reads the result, and a captured
     `leads` would be the array from before the call. */
  const leadsRef = useRef(leads);
  useEffect(() => { leadsRef.current = leads; }, [leads]);
  const { addLead } = useOutreach();
  const { campaigns } = useCampaigns();

  /* ⛔ THE FIX. Both add paths below passed campaignId `null`, so every lead added from Coverage or
     the market view landed with NO campaign — invisible to a campaign filter. The measure path is
     the worse half: it adds silently, so it had been happening on every market measure with nothing
     on screen saying so. Resolved from the lead's trade via campaigns.trade_slug, falling back to
     the selected campaign and SAYING WHICH — never creating one. */
  const campaignPick = useMemo(
    () => pickCampaignForTrade(trade, campaigns, selectedCampaignId),
    [trade, campaigns, selectedCampaignId],
  );
  const { toast } = useToast();

  const [auditCount, setAuditCount] = useState(5);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditBusy, setAuditBusy] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  /** Set when the arrival intent was REFUSED because the market already has audits. Carries its own
   *  override button, so the click that navigated here is answered rather than ignored. */
  const [arrivalNote, setArrivalNote] = useState<string | null>(null);
  const [reExtractOpen, setReExtractOpen] = useState(false);
  const [reExtractBusy, setReExtractBusy] = useState(false);
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [addedKeys, setAddedKeys] = useState<Set<string>>(new Set());
  /* ── ADD ALL TARGETS — Paul's batch-add, 2026-08-15. One click adds every ≤40% target to
     Outreach, worst-named first. The list is `auditable`, which is structurally pure: winners
     (>40%) never enter view.pool at all, wrong-trade rows carry offTrade and are filtered, chains
     are filtered — the same deterministic set the fragmentation verdict counts. Adds ONLY: leads
     land as not_contacted; queueing for WhatsApp stays the operator's separate action. */
  const [addAllOpen, setAddAllOpen] = useState(false);
  const [addAllBusy, setAddAllBusy] = useState(false);
  /* THE NUMBERS ARE COLLAPSED BY DEFAULT. The screen has to be readable on a video call in about
     ten seconds; the concentration percentages, the named lists, the exclusions and the nearby
     group are all kept, one click away. Remembered for the session so it does not re-collapse on
     every navigation. The verdict's JUSTIFICATION is never inside this - see the summary block. */
  /* THE MARKET AUDIT: one audit of the trade and town, no business, NO CRM ROWS. This replaces
     add-to-CRM-then-audit as the way to populate a market — that generated leads the operator had
     not chosen to contact, in a town they were only assessing. */
  const [marketAuditOpen, setMarketAuditOpen] = useState(false);
  const [activeMarketAudit, setActiveMarketAudit] = useState(false);
  /* THE CLOCK BEHIND "started 4 minutes ago", and behind a still-running audit turning into a
     stalled one. Without it the operator would have to guess when to reload, which is the whole
     failure being fixed: a market audit's state must arrive on screen, not be hunted for. */
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [showNumbers, setShowNumbers] = useState<boolean>(() => {
    try { return sessionStorage.getItem('leadfinder_market_numbers') === '1'; } catch { return false; }
  });
  const toggleNumbers = useCallback(() => {
    setShowNumbers((prev) => {
      const next = !prev;
      try { sessionStorage.setItem('leadfinder_market_numbers', next ? '1' : '0'); } catch { /* private mode */ }
      return next;
    });
  }, []);
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
  /* ⛔ ONCE, AND ONLY WITH A MARKET TO SEARCH. The ref is what makes it once: without it, dismissing
     the dialog and then changing either box would re-open it, so a confirm you had already declined
     would come back on an action that had nothing to do with it. Guarded on `chosen` too — an open
     "Run the lead search?" with no trade or town is a dialog whose button cannot do anything. */
  const searchConfirmShown = useRef(false);

  /* ⛔ THE ARRIVAL DECISION IS MADE ON THE VIEW `load` RETURNED, AND IN THE SAME EFFECT AS THE LOAD.
     It used to be its own effect firing the moment `chosen` existed — i.e. BEFORE any market data
     had arrived — so it could not consult the one fact that decides it, and every town clicked from
     Coverage got the modal. Reading `view` here instead would be the auto-clean bug again: a closure
     cannot see a state update it has just triggered. load() returns the market it fetched for these
     exact arguments, which is both fresher and unambiguously the RIGHT market — no comparing our
     trade/town against the server's normalised ones.
     ⚠️ `stale` guards the market changing mid-flight: the confirm for a town you have navigated
     away from must not open over the one you are now looking at, and must not burn the once-only
     ref either. */
  useEffect(() => {
    if (!chosen) return;
    setAddedKeys(new Set());
    let stale = false;
    void (async () => {
      const fresh = await load(chosen.trade, chosen.town);
      if (stale || !openSearchConfirm || searchConfirmShown.current) return;
      searchConfirmShown.current = true;
      const audits = auditsInView(fresh);
      if (openArrivalSearchConfirm(true, audits)) { setSearchOpen(true); return; }
      /* REFUSED, AND SAID SO, WITH THE OVERRIDE BESIDE IT. Silently dropping the intent would make
         Find leads a link that visibly does nothing — the worst thing this panel can do, and the
         reason the audit button stopped disabling itself. Same shape as MeasureMarket's gate: the
         refusal first, the way past it after, never a checkbox armed in advance. */
      setArrivalNote(
        `${chosen.trade} in ${chosen.town} already has ${audits} audit${audits === 1 ? '' : 's'}, so the `
        + 'lead search confirm was not opened over them. Nothing has been spent.',
      );
    })();
    return () => { stale = true; };
  }, [chosen, load, openSearchConfirm]);

  /* ── THE LEAD SEARCH. Reuses the Find Leads context call verbatim, so it goes through the same
     search-leads function, writes the same search_history row and fills the same search_cache the
     market view then reads. A second search path would drift from that cache and find nothing. */
  /* ⛔ THE COUNT IS THE GATE'S ONLY INPUT, and LeadSearchContext.search() resolves to void — so the
     number has to come from the context's own `leads` after it settles, not from the call. Returning
     0 on a failure is deliberate: a search that errored has not proved a town exists either, and the
     gate stopping is the safe direction. */
  const measureSearch = useCallback(async (): Promise<number> => {
    if (!chosen) return 0;
    await search({ keyword: chosen.trade, location: chosen.town, radius: MARKET_SEARCH_RADIUS_M, townOnly: true });
    await reload();
    return leadsRef.current.length;
  }, [chosen, search, reload]);

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

  /* ⛔ AUTO-CLEAN, AND ONLY WHEN THE FIGURES CANNOT BE TRUSTED. Runs after a MEASUREMENT finishes,
     never after a refresh. 6p against an 8.3p audit is a 72% surcharge, so it is not paid on every
     market — but a market whose extraction produced junk is a market whose numbers are wrong, and
     that is worth 6p to fix rather than leaving behind a button that gets forgotten.
     ⚠️ THE FRESH VIEW ARRIVES AS AN ARGUMENT. The run ids and the junk ratio must come from the
     view as it is AFTER the measurement; deciding from the pre-run state cleans nothing. */
  const autoCleanIfDirty = useCallback(async (fresh: MarketViewResult | null) => {
    /* ⛔ THE FRESH VIEW IS PASSED IN, NEVER READ FROM THE CLOSURE.
       This used to read `view` — React state — immediately after `await onReload()`, and a closure
       cannot see a state update that has not re-rendered yet. So it always judged the market as it
       was BEFORE the measurement. On the first measurement of a market that means runIds: [], and
       shouldAutoClean requires runs > 0, so it returned false every single time and the auto-clean
       could not fire at all. Wisbech driving instructors: 125.5 distinct names per audit against a
       threshold of 15, and the operator was still handed the manual button.
       ⚠️ The old comment above claimed "IT RE-READS THE VIEW FIRST". It did re-read it — into state
       nobody here could see. A comment asserting a guarantee the code does not provide is worse
       than no comment: it is why this was not spotted in review. */
    const c = fresh?.concentration;
    if (!c || !shouldAutoClean(marketNamesUncleaned(c), c.runIds.length)) return;
    console.info('[market] auto-cleaning', { uncleaned: c.uncleanedCount, examples: c.uncleanedExamples, runs: c.runIds.length });
    toast({
      title: 'Cleaning up the names',
      /* ⛔ QUOTES THE PROOF, NOT A RATIO. "125.5 distinct names per audit is above 15" told the
         operator a number about a threshold; "the list contains \"always\", \"here\"" tells them
         what is wrong with their data in words they can check against the answers themselves. */
      description: `The extracted names include ${(c.uncleanedExamples ?? []).slice(0, 3).map((e) => `"${e}"`).join(', ')}`
        + `, so the answers are being re-read. About ${asPence(c.runIds.length * CLEANER_USD_PER_RUN)}.`,
    });
    /* Shares the manual button's busy flag so the two paths cannot run over each other. */
    setReExtractBusy(true);
    try {
      for (const runId of c.runIds) {
        try { await supabase.functions.invoke('extract-competitors', { body: { runId } }); } catch { /* one bad run must not stop the rest */ }
      }
      await reload();
    } finally {
      setReExtractBusy(false);
    }
  }, [reload, toast]);

  /** A pool row as the Lead shape addLead expects. The pool rows came out of search-leads in the
   *  first place, so this is a re-hydration, not an invention. */
  /* Delegates to the SHARED mapping (marketView.ts) so Coverage's row add and this panel cannot
     drift — Paul's rule, 2026-08-16. */
  const asLead = useCallback((row: MarketPoolRow): Lead => poolRowToLead(row), []);

  const addOne = useCallback(async (row: MarketPoolRow) => {
    if (!chosen) return;
    setAddingKey(row.key);
    try {
      const id = await addLead(asLead(row), 'UK', 'no_website', campaignPick.campaignId, null, false, chosen.trade, chosen.town);
      if (id) {
        setAddedKeys((s) => new Set(s).add(row.key));
        /* Names the campaign every time, not only on the fallback. "Added" alone is what let a
           campaign-less lead look like a success for months. */
        toast({ title: row.name, description: describeCampaignPick(campaignPick) });
      }
    } finally {
      setAddingKey(null);
    }
  }, [chosen, addLead, asLead, campaignPick, toast]);

  /* The batch version of addOne, over the whole target list. Same addLead, same campaign
     resolution, same dedupe (a duplicate returns null and is counted, never double-added). Server
     order is worst-named first, so the most invisible businesses land at the top of Outreach.
     ⛔ ADDS ONLY. No WhatsApp queueing, no sends — leads arrive as not_contacted and queueing
     stays the operator's explicit next action, stated in the toast so nobody assumes otherwise. */
  const addAllTargets = useCallback(async (targets: MarketPoolRow[]) => {
    if (!chosen || targets.length === 0) return;
    setAddAllOpen(false);
    setAddAllBusy(true);
    let added = 0, already = 0;
    try {
      for (const row of targets) {
        const created = await addLead(asLead(row), 'UK', 'no_website', campaignPick.campaignId, null, true, chosen.trade, chosen.town);
        if (created?.id) {
          added++;
          setAddedKeys((s) => new Set(s).add(row.key));
        } else {
          already++;
        }
      }
      toast({
        title: `${added} target${added === 1 ? '' : 's'} added to Outreach`,
        description: `${already > 0 ? `${already} already in the CRM (skipped, not duplicated). ` : ''}`
          + `${describeCampaignPick(campaignPick, added)} They are in Outreach as not contacted — `
          + 'nothing has been queued or sent; queue them for WhatsApp from the Outreach page when ready.',
      });
    } finally {
      setAddAllBusy(false);
    }
  }, [chosen, addLead, asLead, campaignPick, toast]);

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

  /* ── THE MARKET AUDIT ─────────────────────────────────────────────────────────────────────
     ONE audit of a trade in a town: no business attached, no lead created, no CRM row. Questions
     are generated for the market itself, the SEO scan is unreachable (no website), and the named
     count stays 0 by construction — which is correct here and flagged everywhere it renders.
     ~8p against ~22p for the five-business batch, and nothing added to the CRM. */
  const runMarketAudit = useCallback(async () => {
    if (!chosen) return;
    setActiveMarketAudit(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke<{ ok?: boolean; audit_id?: string; error?: string }>('create-ai-audit', {
        body: {
          market_only: true,
          purpose: 'market',
          business_type: chosen.trade,
          location_text: chosen.town,
          question_count: MARKET_AUDIT_QUESTION_COUNT,
          business_scope: 'local',
          has_website: false,
        },
      });
      if (fnErr || data?.ok === false || !data?.audit_id) {
        let real = fnErr?.message ?? data?.error ?? 'Could not start the market audit.';
        try {
          const ctx = (fnErr as unknown as { context?: Response })?.context;
          if (ctx?.text) { const b = await ctx.text(); const parsed = b ? JSON.parse(b) as { error?: string } : null; if (parsed?.error) real = parsed.error; }
        } catch { /* keep the wrapper message */ }
        toast({ title: 'Market audit not started', description: real, variant: 'destructive' });
        return;
      }
      setMarketAuditOpen(false);
      toast({
        title: 'Market audit queued',
        description: `${MARKET_AUDIT_QUESTION_COUNT} questions about ${chosen.trade} in ${chosen.town}. No businesses were added to your CRM.`,
      });
      await reload();
    } finally {
      setActiveMarketAudit(false);
    }
  }, [chosen, toast, reload]);

  /* ── THE PER-BUSINESS BATCH. Adds the businesses to the CRM and then hands them to the EXISTING
     bulk-jobs audit runner, which is keyed on lead ids and refuses anything it does not own. Both
     halves are stated on the confirm before a penny moves. */
  const runAudits = useCallback(async () => {
    if (!view || !chosen) return;
    setAuditBusy(true);
    try {
      /* The SHARED target filter — worst-first ordering comes from the server, so a batch of 5
         audits the five most invisible. */
      const targets = auditableTargets(view.pool).slice(0, auditCount);
      const leadIds: string[] = [];
      for (const row of targets) {
        // addLead returns the CREATED ROW, or null when it was a duplicate or failed. A duplicate
        // is skipped rather than counted: bulk-jobs would reject an id we never got, and quietly
        // auditing fewer businesses than the confirm promised is worse than saying so.
        const created = await addLead(asLead(row), 'UK', 'no_website', campaignPick.campaignId, null, true, chosen.trade, chosen.town);
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
          description: `${real} ${describeCampaignPick(campaignPick, leadIds.length)} They are in your CRM with nothing measuring them. Run the audits from Outreach when the other job finishes, or delete them.`,
          variant: 'destructive',
        });
        return;
      }
      setAuditOpen(false);
      toast({
        title: `${leadIds.length} audit${leadIds.length === 1 ? '' : 's'} queued`,
        /* ⛔ NAMES THE CAMPAIGN, same sentence as the single-add toast. This is the path that adds
           SILENTLY: it had been creating campaign-less leads on every market measure with nothing on
           screen saying so, which is why the summary now has to speak for it. */
        description: `${describeCampaignPick(campaignPick, leadIds.length)} The panel now tracks them. They drain through the audit queue, roughly a minute per tick.`,
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
    const offTrade = pool.filter((p) => !p.isChain && !!p.offTrade);
    const audit = auditableTargets(pool);
    // Deliberately console.info, not debug: this is the proof the click landed, and it must
    // survive a default-filtered console.
    console.info('[market] audit confirm opened', {
      trade: chosen?.trade ?? null, town: chosen?.town ?? null,
      poolEntries: pool.length, auditable: audit.length, chains: chains.length, offTrade: offTrade.length,
      completedRuns: view?.concentration.completeRuns ?? 0,
    });
    if (audit.length === 0) {
      toast({
        title: 'Nothing here can be audited',
        description: pool.length === 0
          ? 'The prospect pool is empty, so there is nothing to audit. Run the lead search first.'
          : `All ${pool.length} ${pool.length === 1 ? 'entry' : 'entries'} in this pool are chain branches or filed under another trade by Google. Neither is a target, so there is nothing to audit here.`,
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
  /* A POOL THE OPERATOR CAN SEE. `ready` is fresh; `stale` is the same businesses with an old
     search date — shown, badged, and NEVER satisfying a freshness gate (those all key on 'ready').
     Hiding stale pools was how 113 of 123 measured markets displayed no prospect at all. */
  /* One predicate, in marketView.ts, so the panel and its test cannot disagree about which pool
     states have businesses to show. */
  const poolVisible = poolShowsBusinesses(view?.poolState.state);
  const poolStale = view?.poolState.state === 'stale';
  /* POOL ARITHMETIC, derived here so the panel can show its working.
     poolFound counts Places ROWS; poolEntries counts them after chain collapsing. The difference is
     the branches that folded away, which is what made "5 found, 4 named, 0 left" look wrong. */
  const poolFound = view && (view.poolState.state === 'ready' || view.poolState.state === 'stale') ? view.poolState.total : 0;
  const poolEntries = (view?.pool.length ?? 0) + (view?.poolExcluded.length ?? 0);
  const collapsedRows = Math.max(0, poolFound - poolEntries);
  /* ⛔ TARGETS ARE RIGHT-TRADE, NON-CHAIN ROWS — Paul's rule, 2026-08-14. Wrong-trade entries are
     NOT hidden: they get their own itemised group below, because Google's categories are imperfect
     and a silently-cut real locksmith is the failure this panel exists to catch. They are simply
     never counted as targets and never fed to the audit batch. */
  const auditable = view ? auditableTargets(view.pool) : [];
  const wrongTrade = view ? view.pool.filter((p) => !p.isChain && !!p.offTrade) : [];
  const chainEntries = view ? view.pool.filter((p) => p.isChain).length : 0;
  /* THE SPLIT. Both halves come out of `auditable`, so the two lists together are exactly the
     prospect count the summary sentence quotes - the sentence and the rows cannot disagree, which is
     the failure this panel has already had twice. */
  const noWebsiteProspects = auditable.filter((p) => p.noWebsite);
  const withWebsiteProspects = auditable.filter((p) => !p.noWebsite);
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
  /* THE VERDICT. A read on top of numbers that already exist - it changes no grading, no pool and
     no subtraction. Contactable = the prospect list as rendered (never-named plus thinly-named,
     chains excluded), which is exactly what the operator would work. */
  const shape = view
    ? marketShape({
      audits: view.concentration.audits,
      completeRuns: view.concentration.completeRuns,
      leader: view.leader ?? null,
      leaderRow: view.leader
        ? (view.named.find((n) => n.name === view.leader!.name) ?? null)
        : null,
      /* ⛔ SORTED BY MENTIONS HERE, NOT TRUSTED TO ARRIVE THAT WAY. `view.named` is sorted by AUDIT
         count first (that is what the list on screen wants), so passing it raw would hand the
         national test the most-widespread firm rather than the most-named one. */
      topNamed: [...view.named].sort((a, b) => b.mentions - a.mentions),
      citationHosts: view.citationHosts ?? [],
      citationTotal: view.citationTotal ?? 0,
      distinctBusinesses: view.concentration.distinctBusinesses,
      /* ⛔ THE COMPLETED COUNTS, NOT THE AUDIT COUNTS. Ipswich had 2 market audits and 1 completed
         run, and the old line passed 2 — clearing the two-audit bar on one audit's data, which is
         the degeneracy the bar exists to prevent. */
      marketAuditsComplete: view.concentration.marketAuditsComplete ?? 0,
      businessAuditsComplete: view.concentration.businessAuditsComplete ?? 0,
      /* ⛔ REFUSE TO GRADE A SHAPE ON A LIST THAT WAS NEVER CLEANED. Read through
         marketNamesUncleaned so an older cached view — which carries no uncleanedCount — passes
         false and behaves exactly as before, rather than blanking every verdict on the app. */
      namesUncleaned: marketNamesUncleaned(view.concentration),
      uncleanedExamples: view.concentration.uncleanedExamples ?? [],
      runsToClean: view.concentration.runIds.length,
    })
    : null;
  /* THE PLAIN READ. Same decision as the verdict, rendered as two sentences. Presentation only:
     no new logic, no new thresholds, every figure from the fold. */
  const plain = view && shape
    ? marketPlainRead(
      shape, view.concentration, view.trade, view.town, view.leader ?? null,
      /* A stale pool counts as SEARCHED for the sentences — the businesses are real and on
         screen; the staleness is badged beside the list, not hidden inside a "never searched"
         claim that would be false. Freshness gates elsewhere still key on 'ready' alone. */
      view.citationHosts ?? [], auditable.length, poolVisible,
      poolFound,
      view.pool.length + view.poolExcluded.length,
      chainEntries, completedRuns, pendingAudits, noWebsiteProspects.length,
    )
    : null;
  /* ⛔ NO AUTO-CLEAN ON OPEN — REMOVED 2026-08-14, THE DAY AFTER IT SHIPPED, Paul's call.
     Opening a market must NEVER spend and must never look like it is scanning: the on-open clean
     fired a "Cleaning up the names… ~14p" toast plus a minute of spinner on every visit to a
     dirty market — which after the cleaner outage was EVERY recent market — and read exactly like
     "Market view starts a new scan". Worse, its once-per-session ref lived in this component,
     which remounts on every navigation (§6c), so it re-fired on every arrival.
     The two cleaning paths that remain are both tied to things already paid for or explicitly
     pressed: run-finalisation (process-ai-audit-queue, automatic, part of the measurement) and
     the manual "Clean the names" button under the refusal. autoCleanIfDirty below is the
     MEASURE-COMPLETION hook only — it fires when a measurement the operator just started
     finishes while they watch, never on load. */

  /* WHILE AN AUDIT IS UNFINISHED, THE PANEL WATCHES IT. Ticks the clock every 15s so the age is
     honest, and refetches the view every 45s so a finished audit appears and a stalled one is
     caught. Stops dead the moment marketProgress is empty — nothing polls a settled market. */
  const unfinishedCount = (view?.marketProgress ?? []).length;
  useEffect(() => {
    if (unfinishedCount === 0) return;
    const tick = setInterval(() => setNowMs(Date.now()), 15_000);
    const poll = setInterval(() => { void reload(); }, 45_000);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, [unfinishedCount, reload]);

  const pct = apifyUsage?.usagePct ?? null;
  const tone = apifyTone(pct);

  return (
    <div className="space-y-4">
      {/* ⛔ NICHE ANALYSIS FIRST — the outreach DECISION comes before the per-town detail: is this
          trade worth mass outreach at all? Folded across every town holding the trade's audits.
          Free, explicit click (Market view never spends on open — §6e). Per-town machinery below
          is unchanged, and still owns the add-to-CRM bridge. */}
      {chosen?.trade && <NichePanel trade={chosen.trade} />}
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

      {/* ⛔ THE REFUSED ARRIVAL INTENT. A quiet line, not a warning — nothing has gone wrong, a modal
          simply did not open over a market that had already been measured. It carries the way past
          itself, so the Find leads click is answered either way. */}
      {arrivalNote && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <p className="flex-1 text-xs text-muted-foreground">{arrivalNote}</p>
          <Button
            size="sm" variant="outline" className="h-7 text-xs"
            onClick={() => { setArrivalNote(null); setSearchOpen(true); }}
          >
            Run the lead search anyway
          </Button>
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
      {/* ══ THE TEN-SECOND READ ══════════════════════════════════════════════════════════════
          Two sentences, the justification under them, then the list with its Add buttons. Sized to
          be read over a video call by someone non-technical. Everything else - concentration
          percentages, the established list, the thin tail, exclusions, nearby, the per-business
          batch - is behind "Show the numbers" below, kept in full.
          THE JUSTIFICATION IS NOT COLLAPSIBLE. A verdict that cannot be audited is exactly what
          this panel exists not to be, so the bullets with the figures in them sit here, always
          visible, next to the sentence they support. */}
      {view && plain && shape && (
        <div className={`space-y-3 rounded-xl border-2 p-4 sm:p-5 ${
          shape.kind === 'local_leader'
            ? 'border-flag-green/50 bg-green-500/5'
            : shape.kind === 'national_led'
              ? 'border-destructive/40 bg-destructive/5'
              : shape.kind === 'thin_market' || shape.kind === 'names_uncleaned'
                ? 'border-amber-500/50 bg-amber-500/10'
                : 'border-border bg-muted/30'
        }`}>
          {/* ══ THE FRAGMENTATION VERDICT — the one-line mass-outreach signal (Paul, 2026-08-15) ══
              Junk-immune: computed from the deterministic pool scores alone, so it renders whether
              or not the extracted names were ever cleaned. Guarded on a VISIBLE pool — a market
              whose cached pool was deleted must not print "POOL TOO SMALL" about data that is
              merely absent. Every number the word rests on is printed beside it. */}
          {view.fragmentation && poolVisible && (() => {
            const f = view.fragmentation;
            const pct = Math.round(f.targetShare * 100);
            const top3 = Math.round(f.top3Share * 100);
            const chip = f.kind === 'fragmented'
              ? { cls: 'border-flag-green/60 bg-green-500/10 text-green-700 dark:text-green-400', word: 'FRAGMENTED · worth mass outreach' }
              : f.kind === 'concentrated'
                ? { cls: 'border-destructive/50 bg-destructive/10 text-destructive', word: 'CONCENTRATED · a few winners dominate' }
                : f.kind === 'pool_too_small'
                  ? { cls: 'border-border bg-muted/40 text-muted-foreground', word: 'POOL TOO SMALL to grade' }
                  : { cls: 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400', word: 'NOT MEASURED yet' };
            return (
              <div className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border px-3 py-2 ${chip.cls}`}>
                <span className="text-[15px] font-bold tracking-wide">{chip.word}</span>
                <span className="text-[12px] opacity-90">
                  {f.kind === 'pool_too_small'
                    ? `only ${f.gradeable} real ${view.trade} in the Places pool — too few to call a market shape`
                    : f.kind === 'unmeasured'
                      ? 'no completed answers to score against — measure the market first'
                      : `${f.targets} of ${f.gradeable} real businesses rarely or never named (${pct}%) · top-3 named in ${top3}% of answers`}
                </span>
                {/* Confidence on the face: how many scored answers the shares rest on. */}
                {f.answersTotal > 0 && (
                  <span className="text-[11px] opacity-70">from {f.answersTotal} scored answers</span>
                )}
                {/* Deepen: one MORE market audit through the EXISTING confirm (cost stated there
                    too). Never automatic — a third audit is the operator's call, not the flow's. */}
                {f.kind !== 'unmeasured' && (
                  <Button
                    size="sm" variant="outline" className="ml-auto h-7 text-[11px]"
                    onClick={() => setMarketAuditOpen(true)}
                    title={`One more 8-question market audit sharpens these shares. ~${asPence(MARKET_ONE_AUDIT_USD)}, no CRM rows.`}
                  >
                    Deepen · +1 audit · ~{asPence(MARKET_ONE_AUDIT_USD)}
                  </Button>
                )}
              </div>
            );
          })()}
          <p className="text-[17px] font-semibold leading-snug sm:text-xl">{plain.market}</p>
          <p className="text-[15px] leading-snug text-foreground/85 sm:text-lg">{plain.contact}</p>

          {/* ⛔ THE FIX, IN THE STATE THAT NEEDS IT. A refusal with the remedy three clicks away
              under "Show the numbers" is how a market stays ungraded for a month. The verdict is
              withheld and the button that restores it sits directly under the sentence. */}
          {shape.kind === 'names_uncleaned' && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-2">
              <Button
                size="sm"
                onClick={() => setReExtractOpen(true)}
                disabled={reExtractBusy || (conc?.runIds.length ?? 0) === 0}
              >
                {reExtractBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                Clean the names · ~{asPence((conc?.runIds.length ?? 0) * CLEANER_USD_PER_RUN)}
              </Button>
              <span className="text-[11px] text-muted-foreground">
                Re-reads {conc?.runIds.length ?? 0} stored run{(conc?.runIds.length ?? 0) === 1 ? '' : 's'}. No re-auditing, no Apify, nothing re-measured.
              </span>
            </div>
          )}

          {/* ══ AUDITS THAT HAVE NOT FINISHED ══════════════════════════════════════════════════
              A market audit that fails is money spent AND a market the operator believes is
              measured. Two Ipswich audits showing "1 completed run" said nothing about the second
              one — in that case it was healthy and 4 minutes old, but nothing on screen could have
              told you that, and nothing would have told you if it had died either.
              The RAW error is printed. A wrapper string ("term too broad to complete") is what sent
              the last diagnosis off rewriting working questions while an Apify 402 sat unread. */}
          {(view.marketProgress ?? []).length > 0 && (
            <ul className="space-y-1.5 border-t border-border/50 pt-2">
              {(view.marketProgress ?? []).map((mp) => {
                const said = marketAuditProgressPhrase(mp, nowMs);
                return (
                  <li
                    key={mp.auditId}
                    className={`flex items-start gap-2 rounded-md border px-2.5 py-2 text-[13px] leading-snug ${
                      said.severity === 'failed'
                        ? 'border-destructive/50 bg-destructive/10 text-destructive'
                        : said.severity === 'stalled'
                          ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                          : 'border-border bg-muted/50 text-muted-foreground'
                    }`}
                  >
                    {said.severity === 'running'
                      ? <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin" />
                      : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                    <span className="break-words">{said.text}</span>
                  </li>
                );
              })}
            </ul>
          )}

          {/* the numbers the verdict rests on — small, but never hidden */}
          <ul className="space-y-0.5 border-t border-border/50 pt-2">
            {shape.reasoning.map((r) => (
              <li key={r} className="text-[11px] leading-snug text-muted-foreground">{r}</li>
            ))}
          </ul>

          {/* THE LIST. Plain words for how invisible each one is, and the Add buttons that already
              existed, so the operator picks who and how many. */}
          {/* CHAINS ARE NOT PROSPECTS AND ARE NOT LISTED HERE. A Timpson branch will never be
              pitched, and rendering one in the list while excluding it from the count is how the
              sentence and the rows came to disagree (2 vs 3). They stay visible under the numbers. */}
          {/* AND THE LIST ITSELF WAITS FOR A MEASUREMENT. Rendering rows with Add buttons under a
              sentence that says nothing has been measured would invite contacting them anyway. */}
          {/* ── TWO LISTS, NOT ONE ───────────────────────────────────────────────────────────────
              A business with no website is not a weaker prospect, it is a DIFFERENT one. AI has
              nothing of theirs to read, so Gemini cannot name them at all (measured: MK Plumbing,
              0/10 on Gemini, 3/3 on ChatGPT through directories) — which makes the AI-visibility
              pitch the wrong opening. For delivery they are our BEST case: we build the site on our
              hosting, nothing to migrate (serveGate.ts serves `no_website` outright).
              So they stay visible and stay addable. They are simply not in the same list, and the
              heading says which pitch each list wants. */}
          {measured && poolVisible && (auditable.length > 0 || wrongTrade.length > 0 || view.poolExcluded.length > 0) && (
            <div className="space-y-3 border-t border-border/50 pt-2">
              {/* A STALE POOL IS SHOWN, AND SAYS SO. Places listings do not churn in days; hiding
                  a 5-day-old business list was how never-named prospects vanished from the app. The
                  freshness gates are untouched — this is display, with the age on it. */}
              {poolStale && (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] leading-snug text-amber-700 dark:text-amber-400">
                  <span className="font-semibold">This business list is from an older search
                  {view.poolState.state === 'stale' ? ` (${shortDate(view.poolState.searchedAt) ?? 'earlier'})` : ''}.</span>{' '}
                  Businesses rarely vanish in days, so it is still shown — re-run the lead search below for a current list.
                </p>
              )}
              {([
                { rows: withWebsiteProspects, title: 'Worth contacting', note: `The AI-visibility pitch. Named in ${Math.round(TARGET_MAX_NAMED_SHARE * 100)}% of AI answers or fewer, worst first.` },
                { rows: noWebsiteProspects, title: 'No website - different pitch', note: 'Site first, visibility second. Our best delivery case, the wrong opening line.' },
              ] as const).filter((g) => g.rows.length > 0).map((g) => (
                <div key={g.title}>
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[13px] font-semibold">{g.title}</span>
                    <span className="text-[13px] text-muted-foreground">{g.rows.length}</span>
                    <span className="text-[11px] text-muted-foreground">{g.note}</span>
                  </div>
                  <ul className="space-y-1">
                    {g.rows.map((pr) => (
                      <li key={pr.key} className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border/40 py-2 last:border-b-0">
                        <span className="text-[15px] font-medium">{pr.name}</span>
                        <span className="text-[13px] text-muted-foreground">{invisibilityPhrase(pr)}</span>
                        {/* The badge stays on the row as well as in the heading: the lists can be
                            scrolled apart on a phone, and a row must say what it is on its own. */}
                        {pr.noWebsite && <Badge variant="outline" className="text-[10px]">no website</Badge>}
                        <Button
                          size="sm" variant="outline" className="ml-auto h-8"
                          disabled={addingKey === pr.key || addedKeys.has(pr.key)}
                          onClick={() => void addOne(pr)}
                        >
                          {addingKey === pr.key
                            ? <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            : addedKeys.has(pr.key) ? <Check className="mr-1 h-3 w-3" /> : <Plus className="mr-1 h-3 w-3" />}
                          {addedKeys.has(pr.key) ? 'Added' : 'Add to CRM'}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {/* ── ADD ALL TARGETS — the batch of the per-row Add buttons above, nothing more.
                  Only renders on a MEASURED market (this whole block is gated on `measured`), so a
                  whole unmeasured town can never be let in on no data. Face carries the derived
                  cost: each add runs the same Places phone/address lookup the single add does. */}
              {auditable.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-2">
                  <Button
                    size="sm"
                    disabled={addAllBusy || auditable.every((r) => addedKeys.has(r.key))}
                    onClick={() => setAddAllOpen(true)}
                  >
                    {addAllBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
                    Add all {auditable.length} target{auditable.length === 1 ? '' : 's'} · ~{asPence(auditable.length * PLACE_DETAILS_USD)}
                  </Button>
                  <span className="text-[11px] text-muted-foreground">
                    Into Outreach as not contacted, worst-named first. Nothing is queued or sent.
                  </span>
                </div>
              )}

              {/* ── THE TWO EXCLUSION GROUPS — VISIBLE, ITEMISED, NEVER SILENT (Paul, 2026-08-14) ──
                  Google's categories are imperfect and the 40% line is a first guess, so both cuts
                  show their working: every excluded business, its score, and (for wrong-trade) the
                  category Google actually gave it. A real locksmith wrongly filed under "Services"
                  is caught by reading this list, and it keeps its Add button for exactly that. */}
              {wrongTrade.length > 0 && (
                <details className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                  <summary className="cursor-pointer text-[12px] font-medium text-muted-foreground hover:text-foreground">
                    Excluded: {wrongTrade.length} (wrong trade — Google files {wrongTrade.length === 1 ? 'it' : 'them'} as something else)
                  </summary>
                  <ul className="mt-1.5 space-y-1">
                    {wrongTrade.map((pr) => (
                      <li key={pr.key} className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border/40 py-1.5 text-[13px] last:border-b-0">
                        <span className="font-medium">{pr.name}</span>
                        <span className="text-muted-foreground">{invisibilityPhrase(pr)}</span>
                        {pr.offTrade && (
                          <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                            Google: {pr.offTrade.label.toLowerCase()}
                          </Badge>
                        )}
                        {pr.noWebsite && <Badge variant="outline" className="text-[10px]">no website</Badge>}
                        <Button
                          size="sm" variant="outline" className="ml-auto h-7"
                          disabled={addingKey === pr.key || addedKeys.has(pr.key)}
                          onClick={() => void addOne(pr)}
                        >
                          {addingKey === pr.key
                            ? <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            : addedKeys.has(pr.key) ? <Check className="mr-1 h-3 w-3" /> : <Plus className="mr-1 h-3 w-3" />}
                          {addedKeys.has(pr.key) ? 'Added' : 'Add anyway'}
                        </Button>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {view.poolExcluded.length > 0 && (
                <details className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                  <summary className="cursor-pointer text-[12px] font-medium text-muted-foreground hover:text-foreground">
                    Excluded: {view.poolExcluded.length} already winning — named in more than {Math.round(TARGET_MAX_NAMED_SHARE * 100)}% of AI answers
                  </summary>
                  <ul className="mt-1.5 space-y-1">
                    {view.poolExcluded.map((x, i) => (
                      <li key={`${x.name || 'unnamed'}-${i}`} className="text-[13px] leading-snug">
                        <span className="font-medium">{x.name || '(name missing)'}</span>
                        {x.branches > 1 && <span className="text-muted-foreground"> +{x.branches - 1} branch{x.branches - 1 === 1 ? '' : 'es'}</span>}
                        <span className="text-muted-foreground">
                          {' — named in '}{x.answersNamed} of {x.answersTotal} answers
                          {x.answersTotal > 0 ? ` (${Math.round((x.answersNamed / x.answersTotal) * 100)}%)` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {/* ⛔ ONE BUTTON. Trade, town, go — search, then two market audits, then results, with a
              real bar throughout. The manual controls still exist, under Advanced at the foot of the
              panel; they are no longer the path.
              TWO audits, not one, because the view refuses to call a shape below two completed and
              landing on "not enough measured yet" after pressing the only button there is was the
              single worst thing the old flow did. */}
          <div className="border-t border-border/50 pt-3">
            <MeasureMarket
              trade={chosen?.trade ?? view.trade}
              town={chosen?.town ?? view.town}
              completedMarketAudits={view.concentration.marketAuditsComplete ?? 0}
              marketProgress={view.marketProgress}
              poolSearchedAt={view.poolState.state === 'ready' ? view.poolState.searchedAt : null}
              /* The gate's input. Only a READY pool has a trustworthy count; expired or
                 never-searched sends null, which never blocks. */
              poolCount={view.poolState.state === 'ready' ? view.poolState.total : null}
              /* WHICH PLACE THE SEARCH RESOLVED TO, and whether Google had a choice. Straight from
                 the context, so it is the same resolution the pool was built from — deriving it
                 separately here is how the panel and the pool would come to disagree. */
              resolvedLocation={resolvedLocation}
              locationCandidates={locationCandidates}
              onSearch={measureSearch}
              onReload={reload}
              onMeasureComplete={autoCleanIfDirty}
            />
            {/* ⛔ THE FIND-LEADS ACTION SITS WITH THE OTHER PRIMARY BUTTONS, not only in the pool
                card 700px further down. Paul, 2026-08-20, on a measured Burnley with no pool: "there
                is NO button to add leads — just Refresh this market and Add another audit". The pool
                card's button WAS on screen and he quoted its title, so being present was not enough:
                the way out has to be where the eye already is, next to the actions that are.
                ⛔ AND IT SAYS WHY REFRESH IS NOT IT. "Refresh this market" re-audits; it does not
                fetch businesses. Two buttons whose names both sound like "get me the data" need the
                difference stated, or the wrong one gets pressed and spends ~7p an audit to answer a
                question it cannot answer.
                Same handler as the pool card (runSearch) — one press, no second confirm, and reload()
                brings the businesses into this same view when it returns. */}
            {!poolVisible && (
              <div className="mt-3 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2.5">
                <p className="text-xs text-muted-foreground">
                  No businesses have been fetched for this town yet, so there is nothing to add or
                  target below. <span className="font-medium text-foreground">Refresh this market</span> re-audits
                  what AI says; it does not fetch businesses.
                </p>
                <Button
                  size="sm"
                  className="mt-2"
                  onClick={() => void runSearch()}
                  disabled={searching}
                  title="Runs the town-only Places search and then shows the businesses in this view. Usually 15-40 seconds. Free again for 72 hours."
                >
                  {searching
                    ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> finding leads…</>
                    : <><Search className="mr-1.5 h-3.5 w-3.5" /> Find leads · ~{asPence(MARKET_SEARCH_USD)}</>}
                </Button>
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" className="ml-auto" onClick={toggleNumbers}>
                {showNumbers ? <ChevronDown className="mr-1.5 h-3.5 w-3.5" /> : <ChevronRight className="mr-1.5 h-3.5 w-3.5" />}
                {showNumbers ? 'Hide the numbers' : 'Show the numbers'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ⛔ THE BUTTON IS NOT REPEATED HERE. This card renders when a market has no audits at all —
          but the primary block above renders in EVERY state, because marketShape returns
          kind:"unmeasured" rather than null. Both carried a MeasureMarket, so a zero-audit market
          showed two identical buttons stacked. The card keeps its explanation and points at the one
          above rather than growing a second. */}
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
            <p className="pt-0.5 text-xs text-muted-foreground">
              Press <span className="font-medium text-foreground">Measure this market</span> above and
              it will do the lead search and both audits.
            </p>
          </CardContent>
        </Card>
      )}

      {showNumbers && view && conc && conc.audits > 0 && (
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
              {/* ── THE VERDICT ────────────────────────────────────────────────────────────────
                  Names the shape and says what it means for working the town, with every number it
                  rests on listed underneath — so the operator can disagree with the sentence by
                  reading the figures beside it. Deliberately NOT a black box: nothing here tells
                  anyone to skip a market without showing its working. Below the evidence minimum it
                  refuses to name a shape at all. */}
              {/* The verdict and its justification are rendered ONCE, in the summary block at the
                  top of this panel. They used to appear here as well, which meant reading the same
                  three bullets twice. */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Audits behind it" value={String(conc.audits)} sub={`${conc.completeRuns} completed run${conc.completeRuns === 1 ? '' : 's'}`} />
                <Stat label="Businesses named" value={String(conc.distinctBusinesses)} sub={`${conc.totalMentions} mentions`} />
                <Stat label="Most named" value={conc.topName ?? '—'} sub={conc.topName ? `${conc.topSharePct}% of all mentions` : 'nothing named yet'} />
                <Stat label="Top three combined" value={conc.topThreeSharePct ? `${conc.topThreeSharePct}%` : '—'} sub="of all mentions" />
              </div>

              {/* JUNK FLAG. A suspicion with its ratio attached, never a verdict — and the fix is
                  offered, not run, because re-extraction is an unmetered LLM call per run. */}
              {/* ⛔ THE FLAG IS NOW A QUOTE FROM THE DATA, NOT A RATIO AGAINST A THRESHOLD. It used
                  to say "125.5 distinct names per audit, against a threshold of 15" — a number the
                  operator had to take on trust, computed on a denominator that moves with the
                  question count. It now names the words that prove it, which can be checked against
                  the stored answers. `likelyJunk` is still honoured so a market flagged by the old
                  ratio alone still says something. */}
              {(marketNamesUncleaned(conc) || conc.likelyJunk) && (
                <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2">
                  <p className="text-xs leading-snug text-amber-700 dark:text-amber-400">
                    <span className="font-semibold">These names are not clean.</span>{' '}
                    {marketNamesUncleaned(conc)
                      ? <>The extracted list contains {(conc.uncleanedExamples ?? []).map((e) => `"${e}"`).join(', ')}
                        {(conc.uncleanedCount ?? 0) > (conc.uncleanedExamples ?? []).length
                          && ` and ${(conc.uncleanedCount ?? 0) - (conc.uncleanedExamples ?? []).length} more like them`}
                        {' '}— words rather than firms, which is raw scraper output. </>
                      : <>{conc.distinctPerAudit} distinct names per audit, above the old ratio flag of {JUNK_RATIO_PER_AUDIT}. </>}
                    The AI cleaner never ran on older audits. Treat every figure above as unreliable until it is re-read.
                  </p>
                  <Button size="sm" variant="outline" onClick={() => setReExtractOpen(true)} disabled={reExtractBusy || conc.runIds.length === 0}>
                    {reExtractBusy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1.5 h-3.5 w-3.5" />}
                    Re-read {conc.runIds.length} run{conc.runIds.length === 1 ? '' : 's'} with the AI cleaner
                    <span className="ml-1.5 opacity-80">· ~{asPence(conc.runIds.length * CLEANER_USD_PER_RUN)}</span>
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
              {/* ⛔ PER QUESTION, AND WITH NO CLAIM ATTACHED. An audit is 3 questions or 8 depending
                  on how it was started, so the per-audit figure moves with the question count — which
                  is why the per-audit threshold never separated anything. Measured across all 20
                  markets: clean ones run 2.1–4.8 per question, and the marker-word test above is what
                  decides cleanliness, not this number. */}
              {!marketNamesUncleaned(conc) && !conc.likelyJunk && (conc.distinctPerQuestion ?? 0) > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {conc.distinctPerQuestion} distinct names per question across {conc.questions} question
                  {conc.questions === 1 ? '' : 's'}. Measured clean markets run 2.1–4.8; this is a fragmentation
                  signal, not a cleanliness one.
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
                      {/* Curated classification (knownEntities.ts) — a known national operator or a
                          directory/platform is said out loud, so it can't read as a local rival.
                          Absent on unclassified names and on older cached payloads. */}
                      {n.known === 'national' && (
                        <Badge variant="outline" className="border-blue-500/40 text-[10px] text-blue-500">national chain</Badge>
                      )}
                      {n.known === 'directory' && (
                        <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-600 dark:text-amber-500">directory, not a firm</Badge>
                      )}
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
                        {n.known === 'national' && n.otherTowns === 0 && (
                          <Badge variant="outline" className="border-blue-500/40 text-[10px] text-blue-500">national chain</Badge>
                        )}
                        {n.known === 'directory' && (
                          <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-600 dark:text-amber-500">directory, not a firm</Badge>
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
                {poolVisible && <Badge variant="secondary">{view.pool.length}</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-3 pt-0 sm:p-4 sm:pt-0">
              {/* THE THREE STATES, EACH READING DIFFERENTLY. An empty prospect list and a search
                  that was never run are completely different facts about a market. */}
              {view.poolState.state === 'never_searched' && (
                <PoolNotice
                  title="No lead search has been run for this trade and town."
                  body="This is not an empty market — nobody has looked yet. Run the search to see which local businesses exist, then subtract the ones AI already names."
                  onSearch={() => void runSearch()}
                  busy={searching}
                />
              )}
              {view.poolState.state === 'expired' && (
                <PoolNotice
                  title={`Searched for "${view.poolState.keyword}" on ${shortDate(view.poolState.searchedAt) ?? 'an earlier date'}, but the lead pool has since expired.`}
                  body={`Pools are cached for ${view.poolState.ttlHours} hours. The businesses are still out there — the cached copy is just gone, so it needs running again.`}
                  onSearch={() => void runSearch()}
                  busy={searching}
                />
              )}
              {(view.poolState.state === 'ready' || view.poolState.state === 'stale') && (
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
                    {/* THE WHOLE POOL, RECONCILED OUT LOUD: excluded-as-winning + barely-named +
                        never-named must cover every entry, so any future disagreement is visible on
                        screen rather than inferable only by counting rows. All three figures come
                        from the same nameMatches scores the rows display. */}
                    {measured ? (() => {
                      const barely = view.pool.filter((r) => r.answersNamed > 0).length;
                      const never = view.pool.filter((r) => r.answersNamed === 0).length;
                      return ` AI names ${view.poolMatchedNamed} of them in more than ${Math.round(TARGET_MAX_NAMED_SHARE * 100)}% of answers (excluded as already winning)`
                        + `, names ${barely} rarely (kept as targets)`
                        + `, and has never named the other ${never}.`;
                    })() : ' Nothing measured, so none have been subtracted.'}
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
                  {/* ⛔ TWO DIFFERENT ZEROES, AND THEY MEAN OPPOSITE THINGS. An empty prospect list
                      because every business is named is a closed market; an empty prospect list
                      because Places returned nothing is an empty SEARCH — and "every business is
                      already named" is a claim about a set that does not exist. Keyed on
                      poolState.total, what Places actually returned, never on pool.length, which is
                      the list AFTER subtraction and reads the same in both cases. */}
                  {view.pool.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      {view.poolState.total === 0
                        ? `Places found no ${view.trade} inside the ${view.town} boundary, so there is no pool here — nothing to contact, and nothing the audits were measured against. The firms named above are from other towns.`
                        : `Every business in the pool is already named by AI in more than ${Math.round(TARGET_MAX_NAMED_SHARE * 100)}% of answers. Nothing to contact here.`}
                    </p>
                  )}
                  {/* The prospect rows themselves live in the summary block at the top of this
                      panel, with their Add buttons - listing them twice would invite adding the
                      same business from two places. What stays here is the AUDIT TRAIL: the
                      arithmetic, the itemised exclusions and the nearby group. */}
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
                        {chainEntries > 0 && <> − {chainEntries} chain {chainEntries === 1 ? 'entry' : 'entries'}</>}
                        {/* ONE SOURCE. This said view.pool.length, which counts chain entries the
                            summary excludes — 14 here against 13 there, from the same data. Both
                            now read `auditable`, the list the Add buttons are drawn from. */}
                        {' = '}<span className="font-semibold">{auditable.length} to contact</span>
                      </p>
                      {view.poolExcluded.length > 0 && (
                        <ul className="space-y-1 border-t border-border/40 pt-1.5">
                          {view.poolExcluded.map((x, i) => (
                            <li key={`${x.name || 'unnamed'}-${i}`} className="text-[11px] leading-snug text-muted-foreground">
                              <span className="font-medium text-foreground/80">{x.name || '(name missing)'}</span>
                              {x.branches > 1 && <span className="text-muted-foreground"> +{x.branches - 1} branch{x.branches - 1 === 1 ? '' : 'es'}</span>}
                              {typeof x.answersNamed === 'number' && typeof x.answersTotal === 'number' && x.answersTotal > 0
                                ? ` → named in ${x.answersNamed} of ${x.answersTotal} answers (${Math.round((x.answersNamed / x.answersTotal) * 100)}%), above the ${Math.round(TARGET_MAX_NAMED_SHARE * 100)}% line`
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
                            {n.offTrade && (
                              <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
                                Google: {n.offTrade.label.toLowerCase()}
                              </Badge>
                            )}
                            <span className="text-muted-foreground">{invisibilityPhrase(n)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* ⛔ BEHIND A DISCLOSURE, NOT ON THE PAGE. These two were supposed to move when the
                      one button shipped and did not — I replaced two of the four button clusters and
                      missed this one, so the old per-business dialog stayed one click away and got
                      pressed. They still work and are still here; they are simply no longer the
                      path. "Run audits for this town" is the per-business batch, which is a different
                      job from measuring the market and is labelled as such. */}
                  <details className="pt-1">
                    <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                      Advanced
                    </summary>
                    <div className="flex flex-wrap gap-2 pt-2">
                      <Button size="sm" variant="outline" onClick={openAuditDialog}>
                        <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Audit the businesses, one by one
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setSearchOpen(true)} disabled={searching}>
                        <Search className="mr-1.5 h-3.5 w-3.5" /> Re-run the lead search only
                      </Button>
                    </div>
                  </details>
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

      {/* ── ADD-ALL CONFIRM. Count and cost first; says out loud what it does NOT do. */}
      <Dialog open={addAllOpen} onOpenChange={setAddAllOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Add all {auditable.length} targets to Outreach?</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              Every business in this market named in {Math.round(TARGET_MAX_NAMED_SHARE * 100)}% of AI answers
              or fewer — the same list shown above, worst-named first. Winners, wrong-trade entries and
              chains are never included.
            </p>
            <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-[13px]">
              <p className="font-semibold">~{asPence(auditable.length * PLACE_DETAILS_USD)} total</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Each add runs the same Google lookup a single add does (~${PLACE_DETAILS_USD} — phone, address,
                verified town). Businesses already in your CRM are skipped, never duplicated.
              </p>
            </div>
            <p className="text-[11px] font-medium text-foreground/90">
              {describeCampaignPick(campaignPick, auditable.length)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              They land as <span className="font-medium">not contacted</span>. Nothing is queued for WhatsApp
              and nothing is sent — that stays your separate action on the Outreach page.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddAllOpen(false)}>Cancel</Button>
            <Button onClick={() => void addAllTargets(auditable)} disabled={addAllBusy}>
              {addAllBusy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Add {auditable.length}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── MARKET AUDIT CONFIRM. Cost first, and the thing that makes it the default: no CRM rows. */}
      <Dialog open={marketAuditOpen} onOpenChange={setMarketAuditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Audit {chosen?.trade} in {chosen?.town}?</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              One audit of the market itself: {MARKET_AUDIT_QUESTION_COUNT} questions about
              {' '}<span className="font-medium">{chosen?.trade}</span> in{' '}
              <span className="font-medium">{chosen?.town}</span>, asked across the engines.
            </p>
            <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-[13px]">
              <p className="font-semibold">
                ~${(MARKET_AUDIT_QUESTION_COUNT * AUDIT_EST_USD_PER_QUESTION).toFixed(2)}
                {' '}· {MARKET_AUDIT_QUESTION_COUNT} questions at ${AUDIT_EST_USD_PER_QUESTION}
              </p>
              <p className="mt-1 text-[11px] font-medium text-foreground/90">
                No businesses are added to your CRM, and no website is graded — this measures the
                market, not a business.
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground">
              It has no business attached, so nobody is measured as named or not named. What it
              produces is who AI names in this town.
            </p>
            {/* THE DIALOG AND THE VIEW MUST NOT CONTRADICT EACH OTHER. This read as a complete
                measurement and then the view said it was not enough to judge. It now says what one
                buys and why a second is worth it - repeat market audits ask NEW intents because of
                the coverage directive, so the second widens the picture rather than confirming the
                first. */}
            <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-[11px] leading-snug text-muted-foreground">
              <p>
                <span className="font-medium text-foreground/90">
                  One audit gives you the names; {MARKET_AUDIT_MIN_AUDITS} gives you the shape.
                </span>{' '}
                With a single audit every firm appears in 100% of audits, so the view cannot tell a
                market leader from a one-off mention and will not call the market worth working or not.
              </p>
              <p className="mt-1">
                A second audit of the same town asks {MARKET_AUDIT_QUESTION_COUNT} <em>different</em>{' '}
                questions, not the same ones again - generation is told what has already been asked
                here - so it widens the picture as well as confirming it. Two audits is
                ~${(2 * MARKET_AUDIT_QUESTION_COUNT * AUDIT_EST_USD_PER_QUESTION).toFixed(2)}.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMarketAuditOpen(false)}>Cancel</Button>
            <Button onClick={() => void runMarketAudit()} disabled={activeMarketAudit}>
              {activeMarketAudit && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Run the market audit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                    : `All ${view?.pool.length} ${view?.pool.length === 1 ? 'entry' : 'entries'} in this pool are chain branches (${chainEntries}) or filed under another trade by Google (${wrongTrade.length}). Neither is a target, so there is nothing here worth auditing.`}
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
                {auditable.length} target{auditable.length === 1 ? '' : 's'} available, worst first (chains and wrong-trade entries excluded — they are not targets).
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

/* ⛔ THE BUTTON EXISTED AND STILL READ AS A DEAD END (Paul, 2026-08-20). Burnley and Rugby were
   measured with no pool, and in the panel he saw "only Refresh this market and Add another audit" —
   yet this notice, with a working search button, was on screen and he quoted its title. Three things
   made it invisible as an action:
     * it said "Run the lead search", not "Find leads" — the label he now knows from the Coverage row;
     * it carried NO PRICE, while every other spending button on this site states one, so it did not
       look like the same class of thing;
     * it opened a SECOND confirm dialog, where the row does it in one press.
   A button nobody reads as a button is not a way forward. So this now matches the row exactly: same
   words, same price on the face, one press.
   ⚠️ The price is derived from MARKET_SEARCH_USD, never hand-typed (§4's constants rule). */
function PoolNotice({ title, body, onSearch, busy }: { title: string; body: string; onSearch: () => void; busy: boolean }) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/40 px-3 py-3">
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs text-muted-foreground">{body}</p>
      <Button
        size="sm"
        onClick={onSearch}
        disabled={busy}
        title="Runs the town-only Places search and then shows the businesses here. Usually 15-40 seconds. Free again for 72 hours."
      >
        {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Search className="mr-1.5 h-3.5 w-3.5" />}
        {busy ? 'finding leads…' : `Find leads · ~${asPence(MARKET_SEARCH_USD)}`}
      </Button>
    </div>
  );
}
