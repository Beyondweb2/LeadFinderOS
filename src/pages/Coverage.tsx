import { useMemo, useState } from 'react';
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
import { asPence, MARKET_SEARCH_USD, MEASURE_BATCH_CAP, MARKET_AUDIT_QUESTION_COUNT, MARKET_AUDIT_MIN_AUDITS, measureAction, auditsToRun, measureRunCost } from '@/lib/marketView';
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
  const unmeasuredBatch = useMemo(
    () => sorted.filter((t) => !t.suppressed_at && (t.state === 'untouched' || t.state === 'leads')).slice(0, MEASURE_BATCH_CAP),
    [sorted],
  );

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

  const runBatchMeasure = async () => {
    setMeasureConfirmOpen(false);
    setMeasureBusy(true);
    const results: string[] = [];
    try {
      for (let i = 0; i < unmeasuredBatch.length; i++) {
        const townRow = unmeasuredBatch[i];
        setMeasureNote(`Measuring ${i + 1} of ${unmeasuredBatch.length}: ${trade} in ${townRow.name}...`);

        /* 1. The free re-check. Coverage's rung can be stale; market-view is the live answer, and
           measureAction is the SAME gate the panel button uses, so an already-measured market
           resolves to refresh (0 audits) and is skipped without spending. */
        const { data: view } = await supabase.functions.invoke<{
          concentration?: { marketAuditsComplete?: number };
          marketProgress?: unknown[];
          poolState?: { state?: string; total?: number };
        }>('market-view', { body: { action: 'view', trade, town: townRow.name } });
        const completed = view?.concentration?.marketAuditsComplete ?? 0;
        const inFlight = (view?.marketProgress ?? []).length;
        const audits = auditsToRun(measureAction(completed, inFlight));
        if (audits === 0) { results.push(`${townRow.name}: already measured -- skipped, free`); continue; }

        /* 2. The pool. Fresh (state 'ready') = the count is known and the search is free. Anything
           else runs the paid town-only search -- the same call, the same cache, the same history row
           as Find Leads, so the market panel reads exactly what this wrote. */
        let businesses: number | null = null;
        if (view?.poolState?.state === 'ready') {
          businesses = view.poolState.total ?? null;
        } else {
          const { data: sr, error: se } = await supabase.functions.invoke<{
            leads?: unknown[]; locationCandidates?: string[]; resolvedLocation?: string | null;
          }>('search-leads', { body: { keyword: trade, location: townRow.name, radius: 50000, townOnly: true } });
          if (se || !sr) { results.push(`${townRow.name}: search failed (${await realFnError(se, null)}) -- skipped, no audits`); continue; }
          if ((sr.locationCandidates?.length ?? 0) > 1) {
            results.push(`${townRow.name}: ambiguous -- Google returns ${sr.locationCandidates!.length} places with that name (it picked ${sr.resolvedLocation ?? 'one'}) -- skipped, no audits. Measure it from the market panel with the county in the name.`);
            continue;
          }
          businesses = Array.isArray(sr.leads) ? sr.leads.length : null;
        }
        if (businesses === 0) { results.push(`${townRow.name}: Places found no ${trade} -- skipped, no audits (probably a misspelling)`); continue; }

        /* 3. The audits, strictly sequential (the coverage directive is load-bearing). */
        let started = 0;
        let stop = '';
        for (let a = 0; a < audits; a++) {
          const { data: ca, error: ce } = await supabase.functions.invoke<{ ok?: boolean; error?: string; audit_id?: string }>(
            'create-ai-audit',
            {
              body: {
                market_only: true, purpose: 'market',
                business_type: trade, location_text: townRow.name,
                question_count: MARKET_AUDIT_QUESTION_COUNT,
                business_scope: 'local', has_website: false,
              },
            },
          );
          if (ce || ca?.ok === false || !ca?.audit_id) { stop = await realFnError(ce, ca ?? null); break; }
          started++;
        }
        results.push(started === audits
          ? `${townRow.name}: ${started} audit${started === 1 ? '' : 's'} queued`
          : started > 0
            ? `${townRow.name}: started ${started} of ${audits} (${stop}) -- finish it from the market panel`
            : `${townRow.name}: refused (${stop})`);
      }
    } finally {
      setMeasureBusy(false);
      setMeasureNote(null);
      toast({ title: 'Batch measure finished', description: results.join(' | ') });
      void refetch();
    }
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
              Capped at {MEASURE_BATCH_CAP} per press.
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
                    <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                      <Link to={marketViewHref(trade, t.name, t.state)} title={`What we already know about ${trade} in ${t.name} — stored results only, nothing runs and nothing is spent`}>
                        Market view · free
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
