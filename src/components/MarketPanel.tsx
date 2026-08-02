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
        body: { action: 'create', job_type: 'audit', lead_ids: leadIds, params: { question_count: MARKET_AUDIT_QUESTIONS } },
      });
      if (fnErr || data?.ok === false) {
        let real = fnErr?.message ?? data?.error ?? 'Could not start the audit batch.';
        try {
          const ctx = (fnErr as unknown as { context?: Response })?.context;
          if (ctx?.text) { const b = await ctx.text(); const p = b ? JSON.parse(b) as { error?: string } : null; if (p?.error) real = p.error; }
        } catch { /* keep the wrapper message */ }
        toast({ title: 'Audit batch not started', description: `${real} The ${leadIds.length} businesses were still added to your CRM.`, variant: 'destructive' });
        return;
      }
      setAuditOpen(false);
      toast({
        title: `${leadIds.length} audit${leadIds.length === 1 ? '' : 's'} queued`,
        description: 'They drain through the usual audit queue. Reload this market in a few minutes to see them counted.',
      });
      await reload();
    } finally {
      setAuditBusy(false);
    }
  }, [view, chosen, auditCount, addLead, asLead, toast, reload]);

  const conc = view?.concentration;
  const auditable = view ? view.pool.filter((p) => !p.isChain) : [];
  const plannedAudits = Math.min(auditCount, auditable.length);
  const auditCost = plannedAudits * MARKET_AUDIT_QUESTIONS * AUDIT_EST_USD_PER_QUESTION;
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
            <p className="text-xs text-muted-foreground">
              {view.poolState.state === 'ready'
                ? `${view.pool.length} local business${view.pool.length === 1 ? '' : 'es'} found and ready to audit.`
                : 'Run the lead search first to find the local businesses, then audit them.'}
            </p>
            <div className="flex flex-wrap gap-2 pt-0.5">
              <Button size="sm" onClick={() => setAuditOpen(true)} disabled={auditable.length === 0}>
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
                    {conc.distinctPerAudit} distinct names per audit — clean markets sit at 4–9, raw regex output at 30+.
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
              {!conc.likelyJunk && conc.distinctPerAudit > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {conc.distinctPerAudit} distinct names per audit (a clean market sits at 4–9; {JUNK_RATIO_PER_AUDIT}+ suggests uncleaned data).
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
                  {view.named.map((n) => (
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
            </CardContent>
          </Card>

          {/* ── 3. WHO AI HAS NEVER NAMED ─────────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="p-3 pb-2 sm:p-4 sm:pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <MapPin className="h-4 w-4" /> Who AI has never named
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
                  <p className="text-[11px] text-muted-foreground">
                    From {view.poolState.total} businesses found for &ldquo;{view.poolState.keyword}&rdquo;
                    {' '}({view.poolState.scope === 'town' ? 'town boundary' : `${Math.round(view.poolState.radiusM / 1000)}km radius`}),
                    searched {shortDate(view.poolState.searchedAt) ?? 'recently'}. {view.poolMatchedNamed} of them AI already names.
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
                  {/* THE SUBTRACTION, SHOWN. Every business removed from the prospect list names
                      the entry it matched and how heavily that entry is named. A silent exclusion
                      is how a real prospect disappears — this is where a wrong merge is caught,
                      and it is the check that would have caught the Anglia Locksmiths bug. */}
                  {view.poolExcluded.length > 0 && (
                    <details className="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                      <summary className="cursor-pointer text-[11px] font-medium text-muted-foreground">
                        {view.poolExcluded.length} excluded — AI already names {view.poolExcluded.length === 1 ? 'it' : 'them'} (check the matches)
                      </summary>
                      <ul className="mt-1.5 space-y-1">
                        {view.poolExcluded.map((x) => (
                          <li key={x.name} className="text-[11px] leading-snug text-muted-foreground">
                            <span className="font-medium text-foreground/80">{x.name}</span>
                            {' → matched '}
                            <span className="font-medium text-foreground/80">{x.matchedNamed}</span>
                            {` (${x.matchedMentions} mention${x.matchedMentions === 1 ? '' : 's'} across ${x.matchedAudits} audit${x.matchedAudits === 1 ? '' : 's'})`}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" onClick={() => setAuditOpen(true)} disabled={auditable.length === 0}>
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

            <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-[13px]">
              <p className="font-semibold">
                {plannedAudits} audit{plannedAudits === 1 ? '' : 's'} × {MARKET_AUDIT_QUESTIONS} questions
                {' '}= ~${auditCost.toFixed(2)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                At ${AUDIT_EST_USD_PER_QUESTION} per question — the same estimate the AI Audit page uses. An estimate, not a bill.
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
            <Button onClick={() => void runAudits()} disabled={auditBusy || plannedAudits === 0}>
              {auditBusy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Add {plannedAudits} to CRM and run
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
