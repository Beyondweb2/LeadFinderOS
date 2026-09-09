import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2, EyeOff, Eye, MapPin, Telescope } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { usePersistedState } from '@/hooks/usePersistedState';
import NichePanel from '@/components/NichePanel';
import { useCoverage } from '@/hooks/useCoverage';
import { TRADES, TOWN_BAND_DEFAULT_MIN, TOWN_BAND_DEFAULT_MAX } from '@/lib/trades';
import {
  COVERAGE_STATES, COVERAGE_LABEL, findLeadsHref, type CoverageState,
} from '@/lib/coverageState';
import { asPence, MARKET_SEARCH_USD } from '@/lib/marketView';
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
  leads: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  untouched: 'bg-muted text-muted-foreground border-transparent',
};

export default function Coverage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { isLoading, error, gradeFor, setSuppressed, regions, applyFilters, summarise, refetch } = useCoverage();

  const [params, setParams] = useSearchParams();
  /* ⛔ THE URL STILL WINS; THE MEMORY ONLY FILLS A BARE ONE — fixed 2026-08-17 after Paul's report.
     The sidebar links to plain /coverage, so "URL is for what I am looking at" (§6c) was resetting
     the trade to the default on every return — and with it hid the row spinner of a mid-measure
     market, because the row match is keyed on the trade. A link carrying ?trade= behaves exactly as
     before; a bare arrival restores the last trade actually looked at. tier 'local' so it survives
     a tab close too. `validate` pins the value to a real trade label: a renamed trade in storage
     falls back to the default rather than rendering an empty page (absence is never an answer). */
  const [savedTrade, setSavedTrade] = usePersistedState<string>(
    'coverage-trade', TRADES[0].label,
    {
      tier: 'local', scope: user?.id,
      validate: (d) => (typeof d === 'string' && TRADES.some((t) => t.label === d) ? d : null),
    },
  );
  const trade = params.get('trade') || savedTrade;
  /* The REGION gets the same memory (Paul's call, 2026-08-17), with one twist the trade does not
     have: "All regions" is a real choice that the URL expresses as NO param — so a bare URL cannot
     distinguish "chose All" from "arrived with no opinion". The memory therefore stores '' for
     "All", and is written at the point of CHOICE (the select's onChange), never inferred from the
     URL's silence. A remembered '' restores nothing, which IS restoring "All". */
  const [savedRegion, setSavedRegion] = usePersistedState<string>(
    'coverage-region', '',
    { tier: 'local', scope: user?.id, validate: (d) => (typeof d === 'string' ? d : null) },
  );
  const region = params.get('region');
  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };
  /* Remember every trade actually looked at — a link with ?trade= counts — and write the restored
     trade and region back into a bare URL (replace, no history entry) so the address bar stays
     linkable. Region restores ONCE per mount: after that the select's own writes decide, so picking
     "All regions" is not fought by a re-restore. Re-runs after the URL write land on every
     condition false; there is no loop. */
  const regionRestored = useRef(false);
  useEffect(() => {
    if (trade !== savedTrade) setSavedTrade(trade);
    const next = new URLSearchParams(params);
    let dirty = false;
    if (!params.get('trade')) { next.set('trade', trade); dirty = true; }
    if (!regionRestored.current && !params.get('region') && savedRegion) {
      next.set('region', savedRegion); dirty = true;
    }
    regionRestored.current = true;
    if (dirty) setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trade, params]);

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

  /* ⛔ WHETHER THE NICHE VERDICT IS OPEN IS CONFIGURATION, NOT AN INTERRUPTION, so it persists —
     §6c's line: a panel you chose to have open is part of how the page is set up, and losing it on
     every navigation is exactly the complaint. It is NOT a dialog (nothing springs over the page
     and nothing blocks the towns underneath), so the never-persist-an-open-dialog rule does not
     apply. 'session' rather than 'local': re-opening it re-reads, and while that read is free it is
     not instant, so a brand-new tab should start on the town table. */
  const [nicheOpen, setNicheOpen] = usePersistedState<boolean>(
    'coverage-niche-open', false, { tier: 'session', scope: user?.id },
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
        {/* ⛔ THE NICHE VERDICT BELONGS TO THE TRADE, SO IT LIVES NEXT TO THE TRADE PICKER.
            It used to be reachable ONLY from inside MarketPanel, which needs a chosen trade AND
            town — so the one question that decides whether a whole trade is worth outreach was
            gated behind picking a single town and pressing a per-town button, and read as if it
            were about that town. The fold itself was always trade-wide (market-view's `niche`
            action takes a trade and no town); only the door was in the wrong place.
            ⚠️ FREE, and the label says so: `niche` re-reads stored audits and touches no paid API. */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Whole trade</label>
          <Button
            variant={nicheOpen ? 'default' : 'outline'}
            size="sm"
            className="h-9"
            onClick={() => setNicheOpen((v) => !v)}
            title={`Is ${trade} worth mass outreach? Reads every stored ${trade} audit across all towns — free, no searches`}
          >
            <Telescope className="mr-1.5 h-3.5 w-3.5" />
            {nicheOpen ? 'Hide niche verdict' : 'Niche verdict · free'}
          </Button>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Region</label>
          <Select value={region ?? '__all'} onValueChange={(v) => { setParam('region', v === '__all' ? null : v); setSavedRegion(v === '__all' ? '' : v); }}>
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

      {/* ⛔ ABOVE THE TOWN TABLE, BECAUSE IT IS THE QUESTION THAT COMES FIRST. "Is this trade worth
          working at all?" is answered before "which town next?", so the verdict sits between the
          trade picker and the towns rather than inside one town's panel.
          ⚠️ key={trade} REMOUNTS ON A TRADE CHANGE, and that is a correctness guard, not a
          preference: without it, switching Plumbers → Locksmiths would leave the plumber fold on
          screen under a Locksmiths heading until the refetch landed — a stale read presented as a
          decision, which is the harm §6c weighs above losing your place. */}
      {nicheOpen && <NichePanel key={trade} trade={trade} autoLoad />}

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
                    {/* ⛔ ONE ACTION NOW, AND THE COST IS ON ITS FACE. This row used to carry three
                        — Find leads, a "smart" Market view button that measured a town, and a View
                        link into the market panel. The panel is gone (2026-09-09: 96 market audits
                        ever, none since 24 August, while 1,352 leads were added by plain search in
                        the same fortnight), so the two market buttons went with it.
                        ⛔ THE PRICE STAYS DERIVED, NEVER HAND-TYPED (Paul, 2026-08-14): an
                        unlabelled button is a scared-to-click button, and a hand-typed pence figure
                        is the constants bug this project has had four times.
                        ⚠️ No longer hidden on a no-pool row. It was, because the "smart" button
                        offered its own Find leads there and two identical labels going to different
                        places is a dead end of its own — with that button gone, this is the only way
                        to search a town and must always be offered. */}
                    <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                      <Link to={findLeadsHref(trade, t.name)} title={`Search Google for ${trade} in ${t.name} and list them. Free instead if this trade and town were searched in the last 72 hours.`}>
                        Find leads · ~{asPence(MARKET_SEARCH_USD)}
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
