import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Map as MapIcon, MapPin, Search, Telescope } from 'lucide-react';
import { EmptyState, ErrorState, LoadState, PageHeader, ToneChip, type Tone } from '@/components/operator/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { usePersistedState } from '@/hooks/usePersistedState';
import NichePanel from '@/components/NichePanel';
import { NicheCheckCard } from '@/components/NicheCheckCard';
import { useCoverage } from '@/hooks/useCoverage';
import { TRADES, TOWN_BAND_DEFAULT_MIN, TOWN_BAND_DEFAULT_MAX, tradeSearchWord } from '@/lib/trades';
import {
  COVERAGE_STATES, COVERAGE_LABEL, findLeadsHref, type CoverageState,
} from '@/lib/coverageState';
import { CoverageWorkers } from '@/components/CoverageWorkers';
import { CoverageFoundAdded } from '@/components/CoverageFoundAdded';
import { manyTownsHref } from '@/lib/manyTowns';
import { Checkbox } from '@/components/ui/checkbox';
import { CollapsibleBlock } from '@/components/CollapsibleSection';
import { UNCLEAR_WORDS } from '@/lib/malaysiaPlaces';
import { useSubscription } from '@/hooks/useSubscription';
import {
  COVERAGE_COUNTRIES, COVERAGE_COUNTRY_LABEL, DEFAULT_COVERAGE_COUNTRY, normaliseCoverageCountry, type CoverageCountry,
} from '@/lib/coverageCountries';
import { quickLocationValue } from '@/lib/locationPicker';
import { AU_BAND_DEFAULT_MAX, AU_BAND_DEFAULT_MIN } from '@/lib/australiaTowns';
import {
  filterByPopulationBand, populationFilterShown, populationSourcesFor, townPopulation,
} from '@/lib/abroadTownPopulation';
import { defaultSearchDepth, usableSearchDepth, THOROUGH_SEARCH_ENABLED, THOROUGH_MAX_TOWNS_PER_PRESS, type SearchDepth } from '@/lib/townSearchArea';
import { depthButtonSuffix, depthNote } from '@/lib/searchDepthWords';
import { SearchDepthToggle } from '@/components/SearchDepthToggle';

/* ══ WHERE HAVE I BEEN? ═══════════════════════════════════════════════════════════════════════
   ⛔ WHAT THIS REPLACES: asking someone for town names. Every candidate town for a trade, with the
   ones already measured or worked marked, so "locksmiths in the East of England: 6 of 87 done"
   reads in one look.

   ⚠️ THE TRADE AND THE REGION ARE IN THE URL; the size band and the niche panel are in
   usePersistedState. That is §6c's line, and BOTH halves of it now hold: the URL is for WHAT I AM
   LOOKING AT — a trade's coverage is a view you would link to or come back to — and
   usePersistedState is for HOW THE PAGE IS CONFIGURED. A band is configuration; you would not send
   someone a link to it, and losing it on every navigation is the complaint.
   ⛔ NOTHING ELSE MOVES. Nothing here persists an open dialog. The sort is fixed, so there is no
   sort to keep. (The Suppress button and its show-suppressed toggle went on 2026-09-28.) */

/* The rung's colour, from the shared tones: contacted = done (green), added-not-contacted = waiting (amber). */
const STATE_TONE: Record<CoverageState, Tone> = {
  worked: 'green',
  leads: 'amber',
  untouched: 'grey',
};

export default function Coverage() {
  const { user } = useAuth();
  const { isAdmin } = useSubscription();
  const [params, setParams] = useSearchParams();
  /* ⛔ THE COUNTRY (2026-10-14: UK, Malaysia, Singapore). In the URL like the trade — it is WHAT you are looking at —
     but only when it is not the UK, so every UK link reads exactly as before. A bare URL restores the last country
     chosen (local memory, like the trade). */
  const [savedCountry, setSavedCountry] = usePersistedState<CoverageCountry>(
    'coverage-country', DEFAULT_COVERAGE_COUNTRY,
    { tier: 'local', scope: user?.id, validate: (d) => (COVERAGE_COUNTRIES.includes(d as CoverageCountry) ? (d as CoverageCountry) : null) },
  );
  const country: CoverageCountry = normaliseCoverageCountry(params.get('country') || savedCountry);
  const isUk = country === 'UK';
  const { isLoading, error, gradeFor, regions, applyFilters, summarise, refetch, unclearPlaces } = useCoverage(country);

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
    if (country !== savedCountry) setSavedCountry(country);
    const next = new URLSearchParams(params);
    let dirty = false;
    if (!params.get('trade')) { next.set('trade', trade); dirty = true; }
    if (!params.get('country') && !isUk) { next.set('country', country); dirty = true; }
    if (!regionRestored.current && !params.get('region') && savedRegion) {
      next.set('region', savedRegion); dirty = true;
    }
    regionRestored.current = true;
    if (dirty) setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trade, country, params]);

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
  /* Malaysia's band is its own setting (its towns run to two million; the UK band would hide most of them). Blank
     inputs = no bound, so every town shows until a bound is typed. Singapore has none (populationFilterShown). */
  const [myBand, setMyBand] = usePersistedState<{ min: number | null; max: number | null }>(
    'coverage-population-band-my', { min: null, max: null },
    {
      tier: 'session', scope: user?.id,
      validate: (d) => {
        const v = d as { min?: unknown; max?: unknown } | null;
        const ok = (x: unknown) => x === null || Number.isFinite(x);
        return v && ok(v.min) && ok(v.max) ? { min: v.min as number | null, max: v.max as number | null } : null;
      },
    },
  );
  /* Australia's band is its own setting too, and it STARTS at 10,000–250,000 (AU_BAND_DEFAULT_*, australiaTowns.ts):
     the mid-size urban centres, leaving out the small places and the eleven metropolitan areas. Clear it to see all. */
  const [auBand, setAuBand] = usePersistedState<{ min: number | null; max: number | null }>(
    'coverage-population-band-au', { min: AU_BAND_DEFAULT_MIN, max: AU_BAND_DEFAULT_MAX },
    {
      tier: 'session', scope: user?.id,
      validate: (d) => {
        const v = d as { min?: unknown; max?: unknown } | null;
        const ok = (x: unknown) => x === null || Number.isFinite(x);
        return v && ok(v.min) && ok(v.max) ? { min: v.min as number | null, max: v.max as number | null } : null;
      },
    },
  );
  const isAu = country === 'Australia';
  const abroadBand = isAu ? auBand : myBand;
  const setAbroadBand = isAu ? setAuBand : setMyBand;
  /* Malaysia / Singapore figures are approximate (a council or planning area); Australia's are the ABS Census count. */
  const approxPop = country === 'Malaysia' || country === 'Singapore';
  const showPopFilter = populationFilterShown(country);

  /* ⛔ WHETHER THE NICHE VERDICT IS OPEN IS CONFIGURATION, NOT AN INTERRUPTION, so it persists —
     §6c's line: a panel you chose to have open is part of how the page is set up, and losing it on
     every navigation is exactly the complaint. It is NOT a dialog (nothing springs over the page
     and nothing blocks the towns underneath), so the never-persist-an-open-dialog rule does not
     apply. 'session' rather than 'local': re-opening it re-reads, and while that read is free it is
     not instant, so a brand-new tab should start on the town table. */
  const [nicheOpen, setNicheOpen] = usePersistedState<boolean>(
    'coverage-niche-open', false, { tier: 'session', scope: user?.id },
  );
  /* The older stored-audit fold — background, opened on purpose (never persisted). */
  const [storedOpen, setStoredOpen] = useState(false);

  /* Suppressed towns (none today) stay off the list; the page no longer offers a way to show them. */
  /* The UK keeps its population band exactly as before. Malaysia has approximate figures (abroadTownPopulation.ts)
     and its own band; Singapore filters by region only. */
  const rows = useMemo(
    () => {
      if (isUk) return applyFilters(gradeFor(trade, false), { region, minPopulation: minPop, maxPopulation: maxPop });
      const inRegion = gradeFor(trade, false).filter((r) => !region || r.region === region);
      return country === 'Malaysia' || country === 'Australia' ? filterByPopulationBand(inRegion, abroadBand) : inRegion;
    },
    [gradeFor, trade, region, minPop, maxPop, applyFilters, isUk, country, abroadBand],
  );
  const summary = useMemo(() => summarise(rows), [rows, summarise]);

  const sorted = useMemo(
    () => [...rows].sort((a, b) => (b.population ?? 0) - (a.population ?? 0)),
    [rows],
  );

  /* The text a town is searched as — the one-town link and the multi-town search use the SAME words. */
  const townLocation = (name: string) => (isUk || name === 'Singapore' ? name : quickLocationValue(name, country));

  /* ⛔ MULTI-TOWN SELECTION (2026-10-15). Which towns are ticked is a choice for THIS list, never persisted; a new
     country or trade is a different list, so it starts empty. Only ticked towns still on screen are sent, in
     the table's order (largest first). Since 2026-10-16 they open in Find Leads' Many towns mode (src/lib/manyTowns.ts). */
  const [pickedTowns, setPickedTowns] = useState<Set<string>>(new Set());
  useEffect(() => { setPickedTowns(new Set()); }, [country, trade]);
  /* ⛔ STANDARD / THOROUGH (2026-10-23, src/lib/townSearchArea.ts). A choice for THIS look at the list, never
     persisted (Thorough costs more and must never be carried silently): it starts on the country's default —
     Thorough for Australia — and a new country goes back to its default. Every Find leads link carries it, and
     each button says its price (admins) or that it is Thorough (sales never sees a cost). */
  const [depthPick, setDepthPick] = useState<SearchDepth | null>(null);
  useEffect(() => { setDepthPick(null); }, [country]);
  const depth: SearchDepth = usableSearchDepth(depthPick ?? defaultSearchDepth(country));
  const selectedTowns = useMemo(
    () => sorted.filter((t) => pickedTowns.has(t.name)).map((t) => ({ town: t.name, location: townLocation(t.name), country })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sorted, pickedTowns, country, isUk],
  );
  const navigate = useNavigate();
  const listAllPicked = sorted.length > 0 && sorted.every((t) => pickedTowns.has(t.name));
  const listSomePicked = sorted.some((t) => pickedTowns.has(t.name));

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHeader icon={MapIcon} tone="blue" title="Coverage"
        subtitle={<>
          Every candidate town for a trade, and how far you have taken it. Nothing here is ticked by
          hand &mdash; the state is read from your audits, leads and messages.
        </>} />

      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Country</label>
          <Select value={country} onValueChange={(v) => {
            /* A new country has different regions, so the region goes back to All. */
            const next = new URLSearchParams(params);
            if (v === 'UK') next.delete('country'); else next.set('country', v);
            next.delete('region');
            setParams(next, { replace: true });
            setSavedCountry(normaliseCoverageCountry(v));
            setSavedRegion('');
          }}>
            <SelectTrigger className="w-[170px] max-w-full h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {COVERAGE_COUNTRIES.map((c) => <SelectItem key={c} value={c}>{COVERAGE_COUNTRY_LABEL[c]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Trade</label>
          <Select value={trade} onValueChange={(v) => setParam('trade', v)}>
            <SelectTrigger className="w-[220px] max-w-full h-9"><SelectValue /></SelectTrigger>
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
        {/* The niche check samples UK towns, so it is offered on the UK view only. */}
        {isUk && <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Whole trade</label>
          <Button
            variant={nicheOpen ? 'default' : 'outline'}
            size="sm"
            className="h-9"
            onClick={() => setNicheOpen((v) => !v)}
            title={`Is ${trade} worth selling Findable into? Opening shows the latest niche check — free; running a new one is priced on its own button`}
          >
            <Telescope className="mr-1.5 h-3.5 w-3.5" />
            {nicheOpen ? 'Hide niche verdict' : 'Niche verdict'}
          </Button>
        </div>}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Region</label>
          <Select value={region ?? '__all'} onValueChange={(v) => { setParam('region', v === '__all' ? null : v); setSavedRegion(v === '__all' ? '' : v); }}>
            <SelectTrigger className="w-[200px] max-w-full h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All regions</SelectItem>
              {regions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {isUk && <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Population</label>
          <div className="flex items-center gap-1.5">
            <Input type="number" value={minPop} onChange={(e) => setBand((b) => ({ ...b, min: Number(e.target.value) || 0 }))} className="h-9 w-[100px]" />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="number" value={maxPop} onChange={(e) => setBand((b) => ({ ...b, max: Number(e.target.value) || 0 }))} className="h-9 w-[100px]" />
          </div>
        </div>}
        {THOROUGH_SEARCH_ENABLED && <div className="space-y-1" data-testid="coverage-search-depth">
          <label className="text-xs font-medium text-muted-foreground">Search</label>
          <SearchDepthToggle value={depth} onChange={setDepthPick} showMoney={isAdmin} showNote={false} />
        </div>}
        {!isUk && showPopFilter && <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{approxPop ? 'Population (approx.)' : 'Population'}</label>
          <div className="flex items-center gap-1.5">
            <Input type="number" placeholder="Any" value={abroadBand.min ?? ''}
              onChange={(e) => setAbroadBand((b) => ({ ...b, min: e.target.value === '' ? null : Number(e.target.value) || 0 }))} className="h-9 w-[110px]" />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="number" placeholder="Any" value={abroadBand.max ?? ''}
              onChange={(e) => setAbroadBand((b) => ({ ...b, max: e.target.value === '' ? null : Number(e.target.value) || 0 }))} className="h-9 w-[110px]" />
          </div>
        </div>}
      </div>

      {/* ⛔ ABOVE THE TOWN TABLE, BECAUSE IT IS THE QUESTION THAT COMES FIRST. "Is this trade worth
          working at all?" is answered before "which town next?", so the verdict sits between the
          trade picker and the towns rather than inside one town's panel.
          ⚠️ key={trade} REMOUNTS ON A TRADE CHANGE, and that is a correctness guard, not a
          preference: without it, switching Plumbers → Locksmiths would leave the plumber fold on
          screen under a Locksmiths heading until the refetch landed — a stale read presented as a
          decision, which is the harm §6c weighs above losing your place. */}
      {/* ⛔ THE NICHE CHECK IS THE VERDICT (2026-09-28): a deliberate 3-town, Gemini-first sample
          (src/lib/nicheSample.ts). The older fold over whatever audits happen to be stored is a
          different method — mixed purposes, single runs, no chosen towns — so it is background only,
          behind its own button and never shown as the verdict. */}
      {isUk && nicheOpen && (
        <div className="space-y-2">
          <NicheCheckCard key={trade} trade={tradeSearchWord(trade)} />
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => setStoredOpen((v) => !v)} aria-expanded={storedOpen}>
            {storedOpen ? 'Hide the older stored-audit reading' : 'Show the older stored-audit reading (a different method — background only)'}
          </Button>
          {storedOpen && <NichePanel key={`stored-${trade}`} trade={tradeSearchWord(trade)} autoLoad />}
        </div>
      )}

      {/* ⛔ THE HEADLINE IS THE POINT OF THE PAGE. "6 of 87 done" in one look, with the breakdown
          beside it. The counts sum to the total because a town shows at its furthest rung only. */}
      {!isLoading && !error && (
        <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-2xl bg-muted/40 px-3.5 py-2.5 ring-1 ring-inset ring-border/40">
          <span className="text-sm">
            <span className="font-semibold">{trade}</span>
            {region ? <> in <span className="font-semibold">{region}</span></> : ' across all regions'}
            {!isUk && <> of <span className="font-semibold">{COVERAGE_COUNTRY_LABEL[country]}</span></>}:{' '}
            <span className="font-semibold text-foreground">{summary.started} of {summary.total}</span> started
          </span>
          <span className="flex flex-wrap gap-1.5">
            {COVERAGE_STATES.map((s) => (
              <ToneChip key={s} tone={STATE_TONE[s]} dot className="text-xs">
                {summary.counts[s]} {COVERAGE_LABEL[s].toLowerCase()}
              </ToneChip>
            ))}
          </span>
        </div>
      )}

      {/* ⛔ MANY TOWNS → FIND LEADS (Paul, 2026-10-16: V2's "Many towns" mode). ONE button: Find Leads opens in Many
          towns mode with these towns selected, with the same trade words, town words and country as each row's link.
          Nothing is searched here, and nothing on arrival — the person presses Find leads there (up to ten a press). */}
      {depth === 'thorough' && (
        <p className="text-xs text-muted-foreground" data-testid="coverage-depth-note">
          {depthNote(depth, isAdmin)} Up to {THOROUGH_MAX_TOWNS_PER_PRESS} towns a press; the rest stay ticked for the next.
        </p>
      )}

      {selectedTowns.length > 0 && (() => {
        const href = manyTownsHref(tradeSearchWord(trade), selectedTowns.map((t) => t.location), country, depth);
        /* The price is for what ONE press searches: on Thorough, at most THOROUGH_MAX_TOWNS_PER_PRESS towns. */
        const pressTowns = depth === 'thorough' ? Math.min(selectedTowns.length, THOROUGH_MAX_TOWNS_PER_PRESS) : selectedTowns.length;
        const label = (selectedTowns.length === 1 ? 'Find leads in ' + selectedTowns[0].town : 'Find leads in these ' + selectedTowns.length + ' towns')
          + depthButtonSuffix(depth, pressTowns, isAdmin);
        return (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-blue-500/30 bg-blue-500/[0.06] px-3 py-2 text-sm" data-testid="coverage-open-many">
            <span className="font-semibold">{selectedTowns.length} town{selectedTowns.length === 1 ? '' : 's'} ticked</span>
            <span className="min-w-0 truncate text-xs text-muted-foreground">{selectedTowns.map((t) => t.town).join(', ')}</span>
            <span className="ml-auto flex flex-wrap items-center gap-2">
              <Button size="sm" className="h-8 gap-1" disabled={!href} onClick={() => href && navigate(href)} data-testid="coverage-open-many-go">
                <Search className="h-3.5 w-3.5" />{label}
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setPickedTowns(new Set())}>Clear</Button>
            </span>
          </div>
        );
      })()}

      {isLoading ? (
        <LoadState label={<>Reading your audits, leads and messages&hellip;</>} />
      ) : error ? (
        /* ⛔ WRAPPED, NOT PASSED. onRetry={refetch} would hand React Query the click event as its
            RefetchOptions — the same shape as the confirmAndRun bug, where the event arrived as a
            boolean override and permanently disabled a guard. tsc caught this one. */
        <ErrorState title="Couldn’t load coverage" detail={error} onRetry={() => { void refetch(); }} retryLabel="Retry" />
      ) : sorted.length === 0 ? (
        <EmptyState icon={MapPin} title="No towns match those filters.">
          {isUk ? <>The table holds 12,000&ndash;250,000; widen the population
          range to see the edges.</> : <>Choose All regions{country === 'Malaysia' || isAu ? ' and clear the population range' : ''} to see every town.</>}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="w-9 px-3 py-2 text-left">
                  <Checkbox aria-label="Select all towns in this list" title="Select all towns in this list" data-testid="coverage-select-all-towns"
                    checked={listAllPicked ? true : listSomePicked ? 'indeterminate' : false}
                    onCheckedChange={(v) => setPickedTowns(v === true ? new Set(sorted.map((t) => t.name)) : new Set())} />
                </th>
                <th className="px-3 py-2 text-left font-medium">Town</th>
                <th className="px-3 py-2 text-left font-medium">{country === 'Malaysia' || isAu ? 'State' : 'Region'}</th>
                <th className="px-3 py-2 text-right font-medium">{approxPop ? 'Population (approx.)' : 'Population'}</th>
                <th className="px-3 py-2 text-left font-medium">{trade}</th>
                <th className="px-3 py-2 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="px-3 py-1.5">
                    <Checkbox aria-label={`Select ${t.name}`} checked={pickedTowns.has(t.name)}
                      onCheckedChange={(v) => setPickedTowns((p) => { const n = new Set(p); if (v === true) n.add(t.name); else n.delete(t.name); return n; })} />
                  </td>
                  <td className="px-3 py-1.5">
                    <span className="font-medium">{t.name}</span>
                    {t.aka && <span className="ml-1.5 text-xs text-muted-foreground">{t.aka}</span>}
                    {t.fromLeads && <span className="ml-1.5 text-xs text-muted-foreground" title="Not on the town list: a lead or a search named this place.">from your leads</span>}
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">{t.region ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground"
                    title={isUk ? undefined : (townPopulation(country, t.name, t.region).basis ?? 'No source figure')}>
                    {/* ⛔ A blank figure is a dash, never 0. Abroad figures are approximate, so prefixed "≈". */}
                    {t.population === null || t.population === undefined ? '—' : `${approxPop ? '≈ ' : ''}${t.population.toLocaleString()}`}
                  </td>
                  <td className="px-3 py-1.5">
                    {/* 🔴 FOUND vs ADDED (Paul, 2026-09-29) replaced the "Worked" rung badge and the "N leads" count:
                        four numbers from the search runs — what discovery returned and what was then added to
                        the CRM, each with / without a website. "Contacted" (and who) stays, as a plain marker. */}
                    <span className="flex flex-col gap-1">
                      <CoverageFoundAdded fa={t.foundAdded} trade={trade} town={t.name} />
                      {t.state === 'worked' && (
                        <span className="flex flex-wrap items-center gap-1.5 text-xs">
                          <ToneChip tone={STATE_TONE.worked} dot>{COVERAGE_LABEL.worked}</ToneChip>
                          {t.workers.length > 0 && <CoverageWorkers workers={t.workers} trade={trade} town={t.name} />}
                        </span>
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
                    {/* ⛔ NO PRICE ON THE BUTTON AND NO SUPPRESS (Paul, 2026-09-28, every role). The
                        "~9p" estimate is still what search-leads costs and is still accounted for
                        server-side; it is just not printed here. Suppress (hide a town for the whole
                        team, admin-only on the server) is no longer a button: 0 of 733 towns were
                        suppressed when it went, the server action and uk_towns.suppressed_at stay, and a
                        suppressed town would still be left off this list.
                        2026-10-23 (Paul): THOROUGH shows its ceiling on the button ("up to 45p", admins; "Thorough"
                        for sales, who never see a cost). Standard stays unpriced, as above. */}
                    <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                      <Link to={findLeadsHref(tradeSearchWord(trade), townLocation(t.name), country, depth)} title={`Search Google for ${tradeSearchWord(trade)} in ${t.name} and list them.`}>
                        Find leads{depthButtonSuffix(depth, 1, isAdmin)}
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ⛔ UNCLEAR PLACES (Malaysia, 2026-10-19, src/lib/malaysiaPlaces.ts): imported place text that is not one town — a
          state, a region, several places. Those leads count under no town; they are listed here with how many leads
          carry each, folded by default. Nothing here changes a lead. */}
      {country === 'Malaysia' && !isLoading && !error && unclearPlaces.length > 0 && (
        <CollapsibleBlock persistKey="coverage-unclear-places" defaultOpen={false}
          className="rounded-lg border border-border px-3 py-2" titleClassName="text-sm font-medium"
          title={`Unclear places (${unclearPlaces.length})`}
          summary={<span className="text-xs text-muted-foreground">{unclearPlaces.reduce((n, u) => n + u.leads, 0)} leads, all trades &mdash; not counted under any town</span>}>
          <ul className="mt-2 space-y-1 text-sm" data-testid="coverage-unclear-places">
            {unclearPlaces.map((u) => (
              <li key={u.text} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{u.text}</span>
                <span className="text-xs text-muted-foreground">{UNCLEAR_WORDS[u.reason]}{u.state && u.reason !== 'state' ? ` · ${u.state}` : ''}</span>
                <span className="ml-auto tabular-nums text-xs text-muted-foreground">{u.leads} lead{u.leads === 1 ? '' : 's'}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">These leads keep the place their file gave them. Set a lead&rsquo;s town on the lead to count it under that town.</p>
        </CollapsibleBlock>
      )}

      {/* Required by the Open Government Licence wherever the list is shown. */}
      {isUk ? <p className="text-xs text-muted-foreground">
        <MapPin className="mr-1 inline h-3 w-3" />
        Towns are ONS Built-Up Areas 2022 (England and Wales) and London&rsquo;s boroughs (Census 2021); Scotland&rsquo;s
        are National Records of Scotland settlements (mid-2020 estimates) and Northern Ireland&rsquo;s NISRA settlements
        (Census 2021). Contains OS data &copy; Crown copyright and database right 2024. Source: Office for National
        Statistics licensed under the Open Government Licence v3.0. Copyright National Records of Scotland, contains
        public sector information licensed under the Open Government Licence v3.0. Source: NISRA (www.nisra.gov.uk).
      </p> : isAu ? <p className="text-xs text-muted-foreground" data-testid="coverage-au-note">
        <MapPin className="mr-1 inline h-3 w-3" />
        Towns are the ABS Urban Centres of 1,000+ people, named with their state so towns of the same name in two states
        stay apart (Perth WA, Perth TAS). Population is the Census 2021 count for the whole urban centre. Australia is
        prospect-only: find, audit and call &mdash; no price and no sign-up link. Source:{' '}
        {populationSourcesFor(country).map((s) => (
          <span key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="underline">{s.label}</a> ({s.year})</span>
        ))}.
      </p> : <p className="text-xs text-muted-foreground">
        <MapPin className="mr-1 inline h-3 w-3" />
        Towns are the places Find Leads suggests for {COVERAGE_COUNTRY_LABEL[country]}, plus any place your leads or
        searches name. A lead counts here by its own country. Populations are approximate, fixed figures
        {country === 'Malaysia'
          ? ' for the council area (or district) the town sits in, wider than the town itself, or, where that has none, GeoNames’ figure for the place itself; '
          : ' for residents of each planning area (business districts read small); Singapore as a whole has no figure; '}
        a dash means no source figure. Source:{' '}
        {populationSourcesFor(country).map((s, i) => (
          <span key={s.url}>{i > 0 && '; '}<a href={s.url} target="_blank" rel="noreferrer" className="underline">{s.label}</a> ({s.year})</span>
        ))}.
      </p>}
    </div>
  );
}
