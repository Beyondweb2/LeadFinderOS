import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2, EyeOff, Eye, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { usePersistedState } from '@/hooks/usePersistedState';
import { useCoverage } from '@/hooks/useCoverage';
import { TRADES, TOWN_BAND_DEFAULT_MIN, TOWN_BAND_DEFAULT_MAX } from '@/lib/trades';
import {
  COVERAGE_STATES, COVERAGE_LABEL, findLeadsHref, marketViewHref, type CoverageState,
} from '@/lib/coverageState';
import {
  asPence, MARKET_SEARCH_USD, MEASURE_BATCH_CAP, MARKET_AUDIT_QUESTION_COUNT, MARKET_AUDIT_MIN_AUDITS,
  measureAction, auditsToRun, measureRunCost, auditableTargets, poolRowToLead, PLACE_DETAILS_USD,
  MEASURE_CONCURRENCY_CAP, measureSlotsLeft,
  type MarketPoolRow,
} from '@/lib/marketView';
import { useOutreach } from '@/hooks/useOutreach';
import { useInFlightMeasures, inFlightKey } from '@/hooks/useInFlightMeasures';
import { useCampaigns } from '@/hooks/useCampaigns';
import { pickCampaignForTrade, describeCampaignPick } from '@/lib/campaignForTrade';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/* ══ WHERE HAVE I BEEN? ═══════════════════════════════════════════════════════════════════════
   ⛔ WHAT THIS REPLACES: asking someone for town names. Every candidate town for a trade, with the
   ones already measured or worked marked, so "locksmiths in the East of England: 6 of 87 done"
   reads in one look.

   ⚠️ THE TRADE AND THE REGION ARE IN THE URL; the size band and the show-suppressed toggle are in
   usePersistedState. That is §6c's line, and BOTH halves of it now hold: the URL is for WHAT I AM
   LOOKING AT — a trade's coverage is a view you would link to or come back to — and
   usePersistedState is for HOW THE PAGE IS CONFIGURED. A band and a toggle are configuration; you
   would not send someone a link to them, and losing them on every navigation is the complaint.
   ⛔ NOTHING ELSE MOVES. `busyId` is which row is mid-request — happening, not configuration — and
   nothing here persists an open dialog. The sort is fixed, so there is no sort to keep. */

const STATE_STYLE: Record<CoverageState, string> = {
  worked: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  measured: 'bg-sky-500/15 text-sky-600 border-sky-500/30',
  leads: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  untouched: 'bg-muted text-muted-foreground border-transparent',
};

export default function Coverage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { isLoading, error, gradeFor, setSuppressed, regions, applyFilters, summarise, refetch } = useCoverage();

  const [params, setParams] = useSearchParams();
  const trade = params.get('trade') || TRADES[0].label;
  const region = params.get('region');
  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };

  /* ⛔ THE BAND IS ONE SETTING, SO IT PERSISTS AS ONE VALUE. Two keys could restore a half-band
     (a new min against a stale max) and silently show the wrong rows. `validate` rejects any stored
     shape that is not two finite numbers, so a corrupted or older payload falls back to the default
     rather than rendering NaN — the page filters on these, and NaN comparisons are all false, which
     would read as "no towns match" and look like missing data. */
  const [band, setBand] = usePersistedState<{ min: number; max: number }>(
    'coverage-population-band',
    { min: TOWN_BAND_DEFAULT_MIN, max: TOWN_BAND_DEFAULT_MAX },
    {
      tier: 'session',
      scope: user?.id,
      validate: (d) => {
        const v = d as { min?: unknown; max?: unknown } | null;
        return v && Number.isFinite(v.min) && Number.isFinite(v.max)
          ? { min: Number(v.min), max: Number(v.max) }
          : null;
      },
    },
  );
  const minPop = band.min;
  const maxPop = band.max;

  const [showSuppressed, setShowSuppressed] = usePersistedState<boolean>(
    'coverage-show-suppressed', false, { tier: 'session', scope: user?.id },
  );

  /* ⛔ STAYS useState, DELIBERATELY. This is which row is mid-request, not how the page is
     configured — persisting it would restore a permanently disabled button for a request that
     finished on another visit. §6c: persist what you were LOOKING AT, never what was happening. */
  const [busyId, setBusyId] = useState<string | null>(null);

  const rows = useMemo(
    () => applyFilters(gradeFor(trade, showSuppressed), { region, minPopulation: minPop, maxPopulation: maxPop }),
    [gradeFor, trade, showSuppressed, region, minPop, maxPop, applyFilters],
  );
  const summary = useMemo(() => summarise(rows), [rows, summarise]);

  const sorted = useMemo(
    () => [...rows].sort((a, b) => (b.population ?? 0) - (a.population ?? 0)),
    [rows],
  );

  /* == BATCH MEASURE -- Paul's spec, 2026-08-15: explicit, priced, capped, NEVER automatic ======
     The free-on-click rule stays absolute: this runs ONLY from its own button behind its own
     confirm. Each town goes through the SAME gates as the panel's one-button measure --
     measureAction first (already-measured resolves to refresh = 0 audits and is SKIPPED, free),
     then the fresh-pool check (a fresh pool skips the paid search), the ambiguity gate and the
     zero-businesses gate (the Soham rule: an empty town is never audited; in a batch a gate SKIPS
     rather than offering an override -- overrides live on the market panel where one town has the
     operator's attention). Towns are processed strictly one after another because the two audits
     per market must be created sequentially (the coverage directive reads the first audit's rows --
     see marketView.ts) -- and a mid-batch navigation simply stops the remaining towns, spending
     nothing on them. */
  const [measureConfirmOpen, setMeasureConfirmOpen] = useState(false);
  const [measureBusy, setMeasureBusy] = useState(false);
  const [measureNote, setMeasureNote] = useState<string | null>(null);
  /* ── WHAT IS MEASURING RIGHT NOW — derived from live audit state, never stored (Paul's rule,
     2026-08-17). The hook re-derives on mount and polls every 30s ONLY while non-empty, so the
     spinner survives navigation, reloads, and measures started from the market panel. The
     concurrency guard reads THIS list, which makes it truthful across reloads — and lets the
     disabled button NAME the running markets instead of greying out silently. Declared up here
     because the batch list below draws from the same slot pool. */
  const { inFlight, refresh: refreshInFlight } = useInFlightMeasures();
  /* ⛔ A CAP, NOT A ONE-LOCK — Paul's spec, 2026-08-17: up to MEASURE_CONCURRENCY_CAP markets may
     measure at once (his own morning wave of five proved the queue absorbs it; the
     baseline-priority claim in process-ai-audit-queue is the seatbelt for paying customers). Not a
     spend guard — each measure still has its own confirm. Free reveals are never blocked. */
  const slotsLeft = measureSlotsLeft(inFlight.length);
  const atMeasureCap = slotsLeft === 0;
  /* The batch draws from the SAME slot pool as the row buttons (one rule, no drift): a press takes
     min(MEASURE_BATCH_CAP, free slots) towns. With the cap full it offers nothing. */
  const unmeasuredBatch = useMemo(
    () => sorted
      .filter((t) => !t.suppressed_at && (t.state === 'untouched' || t.state === 'leads'))
      .slice(0, Math.min(MEASURE_BATCH_CAP, measureSlotsLeft(inFlight.length))),
    [sorted, inFlight.length],
  );

  /* ── THE MARKET-VIEW FETCH, one place. Free: market-view reads stored data only. ── */
  const fetchMarketView = async (townName: string) => {
    const { data } = await supabase.functions.invoke<{
      concentration?: { marketAuditsComplete?: number; completeRuns?: number };
      marketProgress?: unknown[];
      poolState?: { state?: string; total?: number };
      pool?: MarketPoolRow[];
      fragmentation?: { answersTotal?: number };
    }>('market-view', { body: { action: 'view', trade, town: townName } });
    return data ?? null;
  };

  /* The server's own error string, dug out of supabase-js's wrapper -- the same shape every other
     caller uses; "non-2xx status code" is what makes a cooldown look like a crash. */
  const realFnError = async (fnErr: unknown, data: { error?: string } | null): Promise<string> => {
    if (data?.error) return data.error;
    try {
      const ctx = (fnErr as { context?: Response } | null)?.context;
      if (ctx?.text) {
        const body = await ctx.text();
        const parsed = body ? JSON.parse(body) as { error?: string } : null;
        if (parsed?.error) return parsed.error;
      }
    } catch { /* keep the fallback */ }
    return (fnErr as Error | null)?.message ?? 'unknown error';
  };

  /* ── ONE measure-start flow, TWO callers (the batch button and the per-row button) — Paul's
     no-second-implementation rule. Same gates in the same order as the panel's one-button measure:
     measureAction first (already-measured = 0 audits, free), fresh-pool search skip, the ambiguity
     gate, the zero-businesses gate (the Soham rule). Gates SKIP with a reason; a row or batch
     action never overrides a gate — overrides live on the market panel. This STARTS audits; it
     never waits for them (the batch reports "queued", the row flow polls). */
  type MeasureStart =
    | { kind: 'already_measured' }
    | { kind: 'blocked'; reason: string }
    | { kind: 'started'; started: number; wanted: number; stop?: string };

  const startMarketMeasure = async (townName: string): Promise<MeasureStart> => {
    /* 1. The free re-check. Coverage's rung can be stale; market-view is the live answer, and
       measureAction is the SAME gate the panel button uses. */
    const view = await fetchMarketView(townName);
    const completed = view?.concentration?.marketAuditsComplete ?? 0;
    const inFlight = (view?.marketProgress ?? []).length;
    const audits = auditsToRun(measureAction(completed, inFlight));
    if (audits === 0) return { kind: 'already_measured' };

    /* 2. The pool. Fresh (state 'ready') = the count is known and the search is free. Anything
       else runs the paid town-only search -- the same call, the same cache, the same history row
       as Find Leads, so the market panel reads exactly what this wrote. */
    let businesses: number | null = null;
    if (view?.poolState?.state === 'ready') {
      businesses = view.poolState.total ?? null;
    } else {
      const { data: sr, error: se } = await supabase.functions.invoke<{
        leads?: unknown[]; locationCandidates?: string[]; resolvedLocation?: string | null;
      }>('search-leads', { body: { keyword: trade, location: townName, radius: 50000, townOnly: true } });
      if (se || !sr) return { kind: 'blocked', reason: `search failed (${await realFnError(se, null)}) -- nothing audited` };
      if ((sr.locationCandidates?.length ?? 0) > 1) {
        return {
          kind: 'blocked',
          reason: `ambiguous -- Google returns ${sr.locationCandidates!.length} places named ${townName} (it picked ${sr.resolvedLocation ?? 'one'}). Nothing audited; open View and measure from the panel, where the override lives.`,
        };
      }
      businesses = Array.isArray(sr.leads) ? sr.leads.length : null;
    }
    if (businesses === 0) return { kind: 'blocked', reason: `Places found no ${trade} here -- nothing audited (probably a misspelling). Open View to override from the panel.` };

    /* 3. The audits, strictly sequential (the coverage directive is load-bearing). */
    let started = 0;
    let stop = '';
    for (let a = 0; a < audits; a++) {
      const { data: ca, error: ce } = await supabase.functions.invoke<{ ok?: boolean; error?: string; audit_id?: string }>(
        'create-ai-audit',
        {
          body: {
            market_only: true, purpose: 'market',
            business_type: trade, location_text: townName,
            question_count: MARKET_AUDIT_QUESTION_COUNT,
            business_scope: 'local', has_website: false,
          },
        },
      );
      if (ce || ca?.ok === false || !ca?.audit_id) { stop = await realFnError(ce, ca ?? null); break; }
      started++;
    }
    return { kind: 'started', started, wanted: audits, ...(started < audits ? { stop } : {}) };
  };

  const runBatchMeasure = async () => {
    setMeasureConfirmOpen(false);
    setMeasureBusy(true);
    const results: string[] = [];
    try {
      for (let i = 0; i < unmeasuredBatch.length; i++) {
        const townRow = unmeasuredBatch[i];
        setMeasureNote(`Measuring ${i + 1} of ${unmeasuredBatch.length}: ${trade} in ${townRow.name}...`);
        const r = await startMarketMeasure(townRow.name);
        results.push(
          r.kind === 'already_measured' ? `${townRow.name}: already measured -- skipped, free`
            : r.kind === 'blocked' ? `${townRow.name}: ${r.reason}`
              : r.started === r.wanted ? `${townRow.name}: ${r.started} audit${r.started === 1 ? '' : 's'} queued`
                : r.started > 0
                  ? `${townRow.name}: started ${r.started} of ${r.wanted} (${r.stop ?? ''}) -- finish it from the market panel`
                  : `${townRow.name}: refused (${r.stop ?? ''})`,
        );
      }
    } finally {
      setMeasureBusy(false);
      setMeasureNote(null);
      toast({ title: 'Batch measure finished', description: results.join(' | ') });
      void refetch();
    }
  };

  /* ══ THE PER-ROW STATE MACHINE — Paul's spec, 2026-08-16 ═══════════════════════════════════════
     idle -> press "Market view" -> FREE fetch -> already measured ? loaded (free, instantly)
                                              -> in flight        ? measuring (re-attach, poll)
                                              -> unmeasured       ? priced confirm -> measuring -> loaded
     Everything spend-bearing sits behind its own confirm; a stray click fetches (free) at most.
     State is per-session and derived from the DB on every press, so navigation loses nothing:
     re-pressing re-derives, and audits started here continue server-side regardless. */
  type RowFlow =
    | { phase: 'loading' }
    | { phase: 'confirm'; audits: number; estUsd: number }
    | { phase: 'blocked'; reason: string }
    | { phase: 'loaded'; targets: MarketPoolRow[]; poolState: string }
    | { phase: 'adding' }
    | { phase: 'added'; added: number; already: number };
  const [rowFlow, setRowFlow] = useState<Record<string, RowFlow>>({});
  const setFlow = (id: string, f: RowFlow | null) =>
    setRowFlow((m) => { const n = { ...m }; if (f) n[id] = f; else delete n[id]; return n; });
  const inFlightForRow = (townName: string) => inFlight.find((m) => m.key === inFlightKey(trade, townName));

  /* ── COMPLETION: when a market LEAVES the in-flight list, its row reveals "Add all" on its own
     (one free market-view read), and the rung badges catch up. Diffed against the previous list so
     each finish fires exactly once. */
  const prevInFlightKeys = useRef<Set<string>>(new Set());
  useEffect(() => {
    const current = new Set(inFlight.map((m) => m.key));
    const finished = [...prevInFlightKeys.current].filter((k) => !current.has(k));
    prevInFlightKeys.current = current;
    if (!finished.length) return;
    void refetch();
    for (const key of finished) {
      const row = sorted.find((t) => inFlightKey(trade, t.name) === key);
      if (!row) continue;
      void (async () => {
        const view = await fetchMarketView(row.name);
        if (view) revealLoaded(row.id, view);
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inFlight]);

  const { addLead } = useOutreach();
  const { campaigns } = useCampaigns();
  const campaignPick = useMemo(() => pickCampaignForTrade(trade, campaigns, null), [trade, campaigns]);
  /* Which row's add-all confirm is open, if any. */
  const [addConfirmId, setAddConfirmId] = useState<string | null>(null);

  const revealLoaded = (id: string, view: Awaited<ReturnType<typeof fetchMarketView>>) => {
    const pool = (view?.pool ?? []) as MarketPoolRow[];
    setFlow(id, {
      phase: 'loaded',
      targets: auditableTargets(pool),
      poolState: view?.poolState?.state ?? 'never_searched',
    });
  };

  const onMarketView = async (id: string, townName: string) => {
    setFlow(id, { phase: 'loading' });
    const view = await fetchMarketView(townName);
    if (!view) { setFlow(id, { phase: 'blocked', reason: 'could not read this market -- try again or open View' }); return; }
    const completed = view.concentration?.marketAuditsComplete ?? 0;
    const inFlightHere = (view.marketProgress ?? []).length;
    const audits = auditsToRun(measureAction(completed, inFlightHere));
    if (audits === 0 && inFlightHere > 0 && completed < MARKET_AUDIT_MIN_AUDITS) {
      /* Audits already running (started elsewhere or on a previous visit): the in-flight hook owns
         the spinner from here -- refresh it and clear the transient loading state. */
      setFlow(id, null);
      void refreshInFlight();
      return;
    }
    if (audits === 0) { revealLoaded(id, view); return; }   // measured: free, instantly
    const poolFresh = view.poolState?.state === 'ready';
    setFlow(id, { phase: 'confirm', audits, estUsd: measureRunCost(poolFresh, audits) });
  };

  const onConfirmRowMeasure = async (id: string, townName: string) => {
    setFlow(id, { phase: 'loading' });
    const r = await startMarketMeasure(townName);
    if (r.kind === 'already_measured') {
      const view = await fetchMarketView(townName);
      if (view) revealLoaded(id, view); else setFlow(id, null);
      return;
    }
    if (r.kind === 'blocked') { setFlow(id, { phase: 'blocked', reason: r.reason }); return; }
    if (r.started === 0) { setFlow(id, { phase: 'blocked', reason: `refused (${r.stop ?? 'unknown'})` }); return; }
    /* Audits are away. The in-flight hook owns the spinner and the completion reveal from here --
       one watcher for every measure, whether it was started on this row, the batch button, the
       market panel, or a previous visit. */
    setFlow(id, null);
    await refreshInFlight();
  };

  /* ── FINISHED-WHILE-AWAY REVEAL — Paul's spec item 3, 2026-08-17. Measures that completed in
     the last two hours greet you with "Add all N targets" on return instead of an idle button.
     Derived (complete market runs minus in-flight), bounded to a handful of FREE market-view
     reads, and it reveals only rows that are otherwise idle — it never overwrites a press. Reset
     per trade so switching trades re-reveals that trade's recent finishes. NOT auto-measuring:
     reads only, and only for markets that are already measured. */
  const RECENT_COMPLETED_MS = 2 * 60 * 60 * 1000;
  const RECENT_REVEAL_MAX = 6;
  const revealedRecentFor = useRef<string | null>(null);
  useEffect(() => {
    if (isLoading || sorted.length === 0) return;
    if (revealedRecentFor.current === trade) return;
    revealedRecentFor.current = trade;
    void (async () => {
      const since = new Date(Date.now() - RECENT_COMPLETED_MS).toISOString();
      const { data: runs } = await supabase
        .from('ai_audit_runs').select('audit_id, status, created_at')
        .eq('status', 'complete').gte('created_at', since);
      if (!runs?.length) return;
      const ids = [...new Set(runs.map((r) => r.audit_id))];
      const { data: audits } = await supabase
        .from('ai_audits').select('id, business_type, location_text, is_market').in('id', ids);
      /* Through unknown: is_market is a hand-migrated column the generated types do not know. */
      const markets = ((audits ?? []) as unknown as Array<{ id: string; business_type: string | null; location_text: string | null; is_market: boolean | null }>)
        .filter((a) => a.is_market === true);
      if (!markets.length) return;
      const completedKeys = new Set(markets.map((a) => inFlightKey(a.business_type ?? '', a.location_text ?? '')));
      const inFlightKeys = new Set(inFlight.map((m) => m.key));
      let budget = RECENT_REVEAL_MAX;
      for (const t of sorted) {
        if (budget <= 0) break;
        const k = inFlightKey(trade, t.name);
        if (!completedKeys.has(k) || inFlightKeys.has(k) || rowFlow[t.id]) continue;
        budget--;
        void (async () => {
          const view = await fetchMarketView(t.name);
          if (view) revealLoaded(t.id, view);
        })();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, sorted.length, trade]);

  /* The SAME add loop as the panel's Add-all: same addLead, same campaign resolution, same shared
     poolRowToLead mapping. Adds ONLY -- leads land not_contacted; nothing queued, nothing sent. */
  const onRowAddAll = async (id: string, targets: MarketPoolRow[], townName: string) => {
    setAddConfirmId(null);
    setFlow(id, { phase: 'adding' });
    let added = 0, already = 0;
    for (const row of targets) {
      const created = await addLead(poolRowToLead(row), 'UK', 'no_website', campaignPick.campaignId, null, true, trade, townName);
      if (created?.id) added++; else already++;
    }
    setFlow(id, { phase: 'added', added, already });
    toast({
      title: `${added} target${added === 1 ? '' : 's'} added to Outreach`,
      description: `${already > 0 ? `${already} already in the CRM (skipped). ` : ''}${describeCampaignPick(campaignPick, added)} `
        + 'They are in Outreach as not contacted -- nothing queued or sent; queue them for WhatsApp from the Outreach page.',
    });
  };

  const toggle = async (id: string, name: string, currentlySuppressed: boolean) => {
    setBusyId(id);
    try {
      const reason = currentlySuppressed ? undefined
        : (window.prompt(`Why is ${name} coming off the list? (optional, but "why is Salford missing" gets asked later)`) ?? undefined);
      await setSuppressed(id, !currentlySuppressed, reason);
    } catch (e) {
      toast({ title: 'Could not update', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Coverage</h1>
        <p className="text-sm text-muted-foreground">
          Every candidate town for a trade, and how far you have taken it. Nothing here is ticked by
          hand &mdash; the state is read from your audits, leads and messages.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Trade</label>
          <Select value={trade} onValueChange={(v) => setParam('trade', v)}>
            <SelectTrigger className="w-[220px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TRADES.map((t) => <SelectItem key={t.slug} value={t.label}>{t.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Region</label>
          <Select value={region ?? '__all'} onValueChange={(v) => setParam('region', v === '__all' ? null : v)}>
            <SelectTrigger className="w-[200px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All regions</SelectItem>
              {regions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Population</label>
          <div className="flex items-center gap-1.5">
            <Input type="number" value={minPop} onChange={(e) => setBand((b) => ({ ...b, min: Number(e.target.value) || 0 }))} className="h-9 w-[100px]" />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="number" value={maxPop} onChange={(e) => setBand((b) => ({ ...b, max: Number(e.target.value) || 0 }))} className="h-9 w-[100px]" />
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-9" onClick={() => setShowSuppressed((v) => !v)}>
          {showSuppressed ? <Eye className="h-3.5 w-3.5 mr-1.5" /> : <EyeOff className="h-3.5 w-3.5 mr-1.5" />}
          {showSuppressed ? 'Hiding none' : 'Show suppressed'}
        </Button>
      </div>

      {/* ⛔ THE HEADLINE IS THE POINT OF THE PAGE. "6 of 87 done" in one look, with the breakdown
          beside it. The counts sum to the total because a town shows at its furthest rung only. */}
      {!isLoading && !error && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
          <span className="text-sm">
            <span className="font-semibold">{trade}</span>
            {region ? <> in <span className="font-semibold">{region}</span></> : ' across all regions'}:{' '}
            <span className="font-semibold text-foreground">{summary.started} of {summary.total}</span> started
          </span>
          <span className="flex flex-wrap gap-1.5">
            {COVERAGE_STATES.map((s) => (
              <Badge key={s} variant="outline" className={`text-xs ${STATE_STYLE[s]}`}>
                {summary.counts[s]} {COVERAGE_LABEL[s].toLowerCase()}
              </Badge>
            ))}
          </span>
        </div>
      )}

      {/* == BATCH MEASURE: explicit and priced, never automatic. The free-on-click rule holds:
          Market view stays free, Find leads carries its own price, and this button is the ONLY
          thing on the page that can start measurements -- behind its own confirm. */}
      {!isLoading && !error && unmeasuredBatch.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm" variant="outline" className="h-8 text-xs"
            disabled={measureBusy}
            onClick={() => setMeasureConfirmOpen(true)}
          >
            {measureBusy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5 mr-1.5" />}
            Measure next {unmeasuredBatch.length} unmeasured &middot; up to ~{asPence(unmeasuredBatch.length * measureRunCost(false, MARKET_AUDIT_MIN_AUDITS))}
          </Button>
          {measureNote && <span className="text-xs text-muted-foreground">{measureNote}</span>}
        </div>
      )}

      {/* ── MEASURING NOW — derived from live audit state, shown even when the measuring row is
          filtered out of view (another region, another trade, or started from the market panel).
          Nothing here is stored; leaving and returning re-derives it, which is the whole point. */}
      {inFlight.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-sky-500/40 bg-sky-500/5 px-3 py-2">
          <span className="text-xs font-semibold text-sky-700 dark:text-sky-400">Measuring now:</span>
          {inFlight.map((m) => {
            const mins = Math.max(0, Math.round((Date.now() - m.startedMs) / 60000));
            return (
              <span key={m.key} className={`text-xs ${m.stalled ? 'text-amber-600' : 'text-foreground/80'}`}>
                {m.trade} in {m.town} — {m.questionsDone}/{m.questionsTotal} questions, started {mins}m ago
                {m.stalled ? ' · stalled — open View for the raw state' : ''}
              </span>
            );
          })}
          <span className="text-[10px] text-muted-foreground">carries on server-side even if you leave this page</span>
        </div>
      )}

      <Dialog open={measureConfirmOpen} onOpenChange={setMeasureConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Measure {unmeasuredBatch.length} market{unmeasuredBatch.length === 1 ? '' : 's'}?</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              The next {unmeasuredBatch.length} unmeasured town{unmeasuredBatch.length === 1 ? '' : 's'} for{' '}
              <span className="font-medium">{trade}</span>, biggest first:{' '}
              <span className="font-medium">{unmeasuredBatch.map((t) => t.name).join(', ')}</span>.
            </p>
            <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-[13px]">
              <p className="font-semibold">Up to ~{asPence(unmeasuredBatch.length * measureRunCost(false, MARKET_AUDIT_MIN_AUDITS))} total</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                ~{asPence(measureRunCost(false, MARKET_AUDIT_MIN_AUDITS))} per market: one town-only lead search plus{' '}
                {MARKET_AUDIT_MIN_AUDITS} market audits of {MARKET_AUDIT_QUESTION_COUNT} questions each. Less when a market
                turns out to be already measured (skipped, free) or its pool is fresh (search free). A town whose
                search finds nothing, or whose name is ambiguous, is skipped before any audit is bought.
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Towns run one after another; results land on this page and each market panel as they finish.
              Capped at {MEASURE_BATCH_CAP} per press, minus anything already measuring
              ({MEASURE_CONCURRENCY_CAP} markets can measure at once).
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMeasureConfirmOpen(false)}>Cancel</Button>
            <Button onClick={() => void runBatchMeasure()} disabled={measureBusy}>
              {measureBusy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Measure {unmeasuredBatch.length}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── ROW MEASURE CONFIRM: the one spend gate for the per-row Market view press. ── */}
      {(() => {
        const entry = Object.entries(rowFlow).find(([, f]) => f.phase === 'confirm');
        if (!entry) return null;
        const [rid, f] = entry as [string, Extract<RowFlow, { phase: 'confirm' }>];
        const townRow = sorted.find((t) => t.id === rid);
        if (!townRow) return null;
        return (
          <Dialog open onOpenChange={(open) => { if (!open) setFlow(rid, null); }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle>Measure {trade} in {townRow.name}?</DialogTitle></DialogHeader>
              <div className="space-y-2 text-sm">
                <p>
                  This market has no stored verdict yet. Measuring runs{' '}
                  {f.audits === 1 ? 'one market audit' : `${f.audits} market audits`} of {MARKET_AUDIT_QUESTION_COUNT} questions
                  {f.audits > 1 ? ' (plus a town-only lead search if the pool is not fresh)' : ''} — the button stays
                  here on Coverage with a progress spinner; usually about 6 minutes.
                </p>
                <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-[13px]">
                  <p className="font-semibold">~{asPence(f.estUsd)}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    A town whose search finds nothing, or whose name is ambiguous, is skipped before any audit is
                    bought. Already-measured markets never reach this dialog — they open free.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setFlow(rid, null)}>Cancel</Button>
                <Button onClick={() => void onConfirmRowMeasure(rid, townRow.name)} disabled={atMeasureCap || measureBusy}>
                  {atMeasureCap
                    ? `${MEASURE_CONCURRENCY_CAP} already measuring (${inFlight.map((m) => m.town).join(', ')}) — wait for one to finish`
                    : `Measure · ~${asPence(f.estUsd)}`}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* ── ROW ADD-ALL CONFIRM: same wording contract as the panel's. Adds only, never sends. ── */}
      {(() => {
        if (!addConfirmId) return null;
        const f = rowFlow[addConfirmId];
        const townRow = sorted.find((t) => t.id === addConfirmId);
        if (!f || f.phase !== 'loaded' || !townRow) return null;
        return (
          <Dialog open onOpenChange={(open) => { if (!open) setAddConfirmId(null); }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle>Add all {f.targets.length} targets in {townRow.name}?</DialogTitle></DialogHeader>
              <div className="space-y-2 text-sm">
                <p>
                  Every business in this market named in 40% of AI answers or fewer, worst-named first —
                  winners, wrong-trade entries and chains are never included. Same list as the market panel.
                </p>
                <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-[13px]">
                  <p className="font-semibold">~{asPence(f.targets.length * PLACE_DETAILS_USD)} total</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Each add runs the same Google lookup a single add does (phone, address, verified town).
                    Businesses already in your CRM are skipped, never duplicated.
                  </p>
                </div>
                <p className="text-[11px] font-medium text-foreground/90">{describeCampaignPick(campaignPick, f.targets.length)}</p>
                <p className="text-[11px] text-muted-foreground">
                  They land as <span className="font-medium">not contacted</span>. Nothing is queued for WhatsApp and
                  nothing is sent — that stays your separate action on the Outreach page.
                </p>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setAddConfirmId(null)}>Cancel</Button>
                <Button onClick={() => void onRowAddAll(addConfirmId, f.targets, townRow.name)}>
                  Add {f.targets.length}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading your audits, leads and messages&hellip;
        </div>
      ) : error ? (
        <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
          <p className="text-sm text-destructive">{error}</p>
          {/* ⛔ WRAPPED, NOT PASSED. onClick={refetch} hands React Query the click event as its
              RefetchOptions — the same shape as the confirmAndRun bug, where the event arrived as a
              boolean override and permanently disabled a guard. tsc caught this one. */}
          <Button variant="outline" size="sm" onClick={() => { void refetch(); }}>Retry</Button>
        </div>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No towns match those filters. The table holds 12,000&ndash;250,000; widen the population
          range to see the edges.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Town</th>
                <th className="px-3 py-2 text-left font-medium">Region</th>
                <th className="px-3 py-2 text-right font-medium">Population</th>
                <th className="px-3 py-2 text-left font-medium">{trade}</th>
                <th className="px-3 py-2 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) => (
                <tr key={t.id} className={`border-t border-border ${t.suppressed_at ? 'opacity-50' : ''}`}>
                  <td className="px-3 py-1.5">
                    <span className="font-medium">{t.name}</span>
                    {t.suppressed_at && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        suppressed{t.suppressed_reason ? ` — ${t.suppressed_reason}` : ''}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">{t.region ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                    {t.population?.toLocaleString() ?? '—'}
                  </td>
                  <td className="px-3 py-1.5">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className={`text-xs ${STATE_STYLE[t.state]}`}>
                        {COVERAGE_LABEL[t.state]}
                      </Badge>
                      {/* ⛔ THE COUNT IS A SECOND MARKER, NOT A FIFTH RUNG. The ladder is exclusive —
                          a town shows at its furthest rung only — so "Measured" or "Worked" said
                          nothing about whether leads had ever been pulled there, which is exactly
                          the question ("which towns have I pulled leads from, without clicking in").
                          Same Badge, same outline variant, same colour vocabulary as the `leads`
                          rung, so it reads as the existing language rather than a new control.
                          Rendered ONLY when there are leads: a "0 leads" badge on 700 untouched
                          towns is noise, and the Untouched rung already says it. */}
                      {t.leadCount > 0 && (
                        <Badge
                          variant="outline"
                          className={`text-xs ${STATE_STYLE.leads}`}
                          title={`${t.leadCount} lead${t.leadCount === 1 ? '' : 's'} in your CRM for ${trade} in ${t.name}`}
                        >
                          {t.leadCount} lead{t.leadCount === 1 ? '' : 's'}
                        </Badge>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {/* ⛔ TWO ACTIONS, BECAUSE THERE WERE ALWAYS TWO JOBS. One button labelled "Find
                        leads" carried mode=market, so it never ran a lead search — it opened the
                        market read, and on an untouched town it opened a spend confirm over that.
                        Both hrefs are built by coverageState so the page cannot drift from the test
                        that asserts Find leads carries neither mode=market nor confirm=search.
                        ⚠️ Find leads RUNS the search on arrival (~$0.11, free inside the 72h cache);
                        Market view keeps its own confirm, on the rungs with nothing measured. */}
                    {/* ⛔ THE COST IS ON THE FACE, DERIVED, NEVER HAND-TYPED — Paul, 2026-08-14:
                        an unlabelled button is a scared-to-click button. Find leads runs a paid
                        Places search on arrival, so its face carries the same derived figure the
                        measure button uses (asPence(MARKET_SEARCH_USD)); the 72h free-cache case
                        lives in the tooltip. Market view reads stored audits and the cached pool —
                        it spends nothing, starts nothing, and its face says so. */}
                    <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                      <Link to={findLeadsHref(trade, t.name)} title={`Search Google for ${trade} in ${t.name} and list them. Free instead if this trade and town were searched in the last 72 hours.`}>
                        Find leads · ~{asPence(MARKET_SEARCH_USD)}
                      </Link>
                    </Button>
                    {/* ── THE SMART ROW BUTTON — Paul's spec, 2026-08-16. Press = one FREE read;
                        measured markets reveal Add-all instantly; unmeasured ones get a priced
                        confirm; the spinner stays in place, no navigation. A stray click never
                        spends. */}
                    {(() => {
                      /* ── THE DERIVED SPINNER FIRST. If this market is in the live in-flight list,
                          that is the truth whatever session state says -- it survives navigation
                          and reloads because it is read from the audits themselves. */
                      const live = inFlightForRow(t.name);
                      if (live) {
                        const mins = Math.max(0, Math.round((Date.now() - live.startedMs) / 60000));
                        return (
                          <Button variant="ghost" size="sm" className={`h-7 text-xs ${live.stalled ? 'text-amber-600' : ''}`} disabled title={live.stalled ? 'This measure has stopped moving -- open View for the raw state' : 'Measuring -- carries on server-side even if you leave this page'}>
                            <Loader2 className={`h-3 w-3 mr-1 ${live.stalled ? '' : 'animate-spin'}`} />
                            {live.stalled ? `stalled at ${live.questionsDone}/${live.questionsTotal}` : `measuring ${live.questionsDone}/${live.questionsTotal} · ${mins}m`}
                          </Button>
                        );
                      }
                      const f = rowFlow[t.id];
                      if (!f) {
                        return (
                          <Button
                            variant="ghost" size="sm" className="h-7 text-xs"
                            disabled={measureBusy}
                            title={`Check ${trade} in ${t.name}: free read; measured markets show their targets instantly, unmeasured ones ask before spending`}
                            onClick={() => void onMarketView(t.id, t.name)}
                          >
                            Market view
                          </Button>
                        );
                      }
                      if (f.phase === 'loading') return <Button variant="ghost" size="sm" className="h-7 text-xs" disabled><Loader2 className="h-3 w-3 animate-spin mr-1" /> reading…</Button>;
                      if (f.phase === 'adding') return <Button variant="ghost" size="sm" className="h-7 text-xs" disabled><Loader2 className="h-3 w-3 animate-spin mr-1" /> adding…</Button>;
                      if (f.phase === 'added') return <span className="text-xs text-emerald-600 px-2">✓ {f.added} added{f.already ? `, ${f.already} existing` : ''}</span>;
                      if (f.phase === 'blocked') {
                        return (
                          <span className="inline-flex items-center gap-1">
                            <span className="max-w-[260px] truncate text-[11px] text-amber-600" title={f.reason}>{f.reason}</span>
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setFlow(t.id, null)}>reset</Button>
                          </span>
                        );
                      }
                      if (f.phase === 'confirm') return null; /* the dialog below is open for this row */
                      /* loaded */
                      return f.targets.length > 0
                        ? (
                          <Button
                            variant="ghost" size="sm" className="h-7 text-xs text-emerald-700"
                            title={`Add all ${f.targets.length} ≤40%-named targets to Outreach as not contacted — winners, wrong-trade and chains excluded. Nothing is queued or sent.`}
                            onClick={() => setAddConfirmId(t.id)}
                          >
                            Add all {f.targets.length} · ~{asPence(f.targets.length * PLACE_DETAILS_USD)}
                          </Button>
                        )
                        : (
                          <span className="px-2 text-[11px] text-muted-foreground" title={f.poolState === 'ready' || f.poolState === 'stale' ? 'Every pool business is already winning, wrong-trade or a chain' : 'No lead pool for this town — run Find leads first'}>
                            {f.poolState === 'ready' || f.poolState === 'stale' ? '0 targets' : 'no pool — Find leads first'}
                          </span>
                        );
                    })()}
                    <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                      <Link to={marketViewHref(trade, t.name, t.state)} title={`Open the full market panel for ${trade} in ${t.name} — stored results, free`}>
                        View
                      </Link>
                    </Button>
                    <Button
                      variant="ghost" size="sm" className="h-7 text-xs"
                      disabled={busyId === t.id}
                      onClick={() => toggle(t.id, t.name, !!t.suppressed_at)}
                    >
                      {busyId === t.id ? <Loader2 className="h-3 w-3 animate-spin" />
                        : t.suppressed_at ? 'Restore' : 'Suppress'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Required by the Open Government Licence wherever the list is shown. */}
      <p className="text-xs text-muted-foreground">
        <MapPin className="mr-1 inline h-3 w-3" />
        Towns are ONS Built-Up Areas 2022. Contains OS data &copy; Crown copyright and database right
        2024. Source: Office for National Statistics licensed under the Open Government Licence v3.0.
      </p>
    </div>
  );
}
