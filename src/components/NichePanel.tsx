import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Telescope, CheckCircle2, MinusCircle, XCircle, HelpCircle, Search, Store } from 'lucide-react';
import { rateLabel, sharePct, nicheVerdict, resultsBelongToTown, type NicheAnalysis } from '@/lib/nicheView';
import { Link } from 'react-router-dom';
import { marketViewHref } from '@/lib/coverageState';
import { useLeadSearchContext } from '@/contexts/LeadSearchContext';
import { useOutreach } from '@/hooks/useOutreach';
import { useCampaigns } from '@/hooks/useCampaigns';
import { pickCampaignForTrade } from '@/lib/campaignForTrade';
import { useToast } from '@/hooks/use-toast';
import type { SearchFilters } from '@/types/lead';

/* ════════════════════════════════════════════════════════════════════════════════════════════
   NICHE PANEL (Phase 1) — the read-only niche analysis inside Market view: one trade folded
   across every town holding its audits. Loads on an explicit FREE click (Market view never spends
   on open — §6e's absolute rule), renders the four decision inputs:
   per-engine named rates · winnability counts · source split · top domains — plus the sample-size
   honesty line. The plain-English verdict + outreach handoff are Phase 2.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

type State =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'none'; marketAudits: number }
  | { kind: 'error'; message: string }
  | { kind: 'done'; niche: NicheAnalysis };

/* ── the per-town outreach handoff ───────────────────────────────────────────────────────────
 * ⛔ WHY THIS IS NO LONGER A LINK. It was `<a href={findLeadsHref(...)}>`, and two things followed.
 * A raw <a> is a FULL PAGE RELOAD: the SPA is torn down and re-booted — entry chunk, providers,
 * page data — and only THEN does the search start, so it never felt like the Find Leads page,
 * which starts searching on the click. And the search's result landed on another screen, so
 * getting those businesses into the CRM meant a second journey.
 *
 * Now the row runs THE SAME SEARCH IN PLACE, through the same `search()` from LeadSearchContext
 * that Find Leads itself calls (the provider wraps the whole app), then offers "Add all N" over
 * what came back. "View results" is a client-side <Link> with NO `run=search`, so the page shows
 * the results already in the context instead of paying for them again.
 *
 * 🔴 THE GUARD THAT MATTERS: `leads` AND `lastSearch` ARE GLOBAL — ONE SET FOR THE WHOLE APP.
 * There is exactly one result set, so a row may only claim it when `lastSearch` names THAT row's
 * trade AND town. Without that test, searching Wakefield and then looking at the Bedford row would
 * offer "Add all 20" over Wakefield's businesses and write them against Bedford — the wrong-town
 * fault this codebase already paid for once (CLAUDE.md §6b). The comparison is on the SEARCH that
 * produced the results, never on which button was pressed last.
 * ⚠️ `isLoading` is global too, so a search started by one row disables the others and says why.
 */
function TownRow({
  trade, town, businesses, cells, searchingTown, setSearchingTown,
}: {
  trade: string; town: string; businesses: number; cells: number;
  searchingTown: string | null;
  setSearchingTown: (t: string | null) => void;
}) {
  const { toast } = useToast();
  const { leads, isLoading, search, lastSearch } = useLeadSearchContext();
  const { addLead } = useOutreach();
  const { campaigns } = useCampaigns();
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState<{ added: number; dupes: number } | null>(null);

  /* Do the results on screen belong to THIS row? Both halves, always. */
  const mine = resultsBelongToTown(lastSearch, trade, town);
  const searchingHere = searchingTown === town && isLoading;
  const searchingElsewhere = isLoading && !searchingHere;
  const haveResults = mine && !isLoading && leads.length > 0;
  const emptyResults = mine && !isLoading && leads.length === 0 && searchingTown === town;

  const runSearch = async () => {
    setAdded(null);
    setSearchingTown(town);
    try {
      /* The same filter shape SearchForm builds: town-only, 50km, UK. Sent through the context so
         the results land where the Find Leads page reads them (memory + sessionStorage). */
      /* ⚠️ TYPED, NOT CAST. An `as never` here would hide a real mismatch — a renamed or added
         required filter would compile and then behave differently from the Find Leads page, which
         is the exact class of divergence this change exists to remove. */
      const filters: SearchFilters = {
        keyword: trade, location: town, radius: 50_000, country: 'UK', townOnly: true,
      };
      await search(filters);
    } catch (e) {
      toast({ title: `Search failed for ${town}`, description: e instanceof Error ? e.message : 'Try again', variant: 'destructive' });
    }
  };

  const addAll = async () => {
    if (!haveResults || adding) return;
    setAdding(true);
    try {
      const campaignId = pickCampaignForTrade(trade, campaigns, null).campaignId;
      let ok = 0; let dupes = 0;
      /* Same single-add path Find Leads uses (addLead, silent, trade+town stamped on the row), so
         nothing about a lead added here differs from one added on that page. A duplicate returns
         null and is COUNTED, never re-added. */
      for (const lead of leads) {
        const created = await addLead(lead, 'UK', 'no_website', campaignId, null, true, trade, town);
        if (created) ok++; else dupes++;
      }
      setAdded({ added: ok, dupes });
      toast({
        title: `Added ${ok} lead${ok === 1 ? '' : 's'} from ${town}`,
        description: dupes > 0 ? `${dupes} were already in the CRM and were skipped.` : 'All new.',
      });
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 py-0.5">
      <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
        {town} — {businesses} businesses, {cells} answers
      </span>

      <Link to={marketViewHref(trade, town, 'measured')} className="shrink-0 text-[11px] text-primary hover:underline"
        title="Open this town's market view — its target list and Add-all-targets button">
        <Store className="mr-0.5 inline h-3 w-3" />targets
      </Link>

      {searchingHere && (
        <span className="shrink-0 text-[11px] text-primary">
          <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
          Searching {town}… <span className="text-muted-foreground">(20–30s)</span>
        </span>
      )}

      {haveResults && (
        <>
          <Button size="sm" variant="default" className="h-6 shrink-0 px-2 text-[11px]" onClick={addAll} disabled={adding}
            title={`Add all ${leads.length} businesses found in ${town} to the CRM`}>
            {adding ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Store className="mr-1 h-3 w-3" />}
            {adding ? 'Adding…' : `Add all ${leads.length}`}
          </Button>
          {/* ⚠️ NO `run=search` — the whole point. The results are already in the context, so the
              page renders them instead of paying for the same search twice. */}
          <Link to={`/find-leads?mode=leads&keyword=${encodeURIComponent(trade)}&location=${encodeURIComponent(town)}`}
            className="shrink-0 text-[11px] text-primary hover:underline"
            title="Open Find Leads with these results already loaded — no new search">
            <Search className="mr-0.5 inline h-3 w-3" />view results
          </Link>
        </>
      )}

      {added && !haveResults && (
        <span className="shrink-0 text-[11px] text-emerald-600">Added {added.added}{added.dupes ? ` · ${added.dupes} already there` : ''}</span>
      )}
      {emptyResults && <span className="shrink-0 text-[11px] text-muted-foreground">no businesses found</span>}

      {!searchingHere && !haveResults && (
        <Button size="sm" variant="outline" className="h-6 shrink-0 px-2 text-[11px]" onClick={runSearch}
          disabled={searchingElsewhere}
          title={searchingElsewhere
            ? `A search is already running (${searchingTown ?? 'another town'}) — one at a time`
            : `Run the normal lead search for ${trade} in ${town} (~11p of Places quota, free within 72h of the same search)`}>
          <Search className="mr-1 h-3 w-3" />
          {searchingElsewhere ? 'waiting…' : added ? 'search again' : 'find leads'}
        </Button>
      )}
    </div>
  );
}

export default function NichePanel({ trade, autoLoad = false }: { trade: string; autoLoad?: boolean }) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  /* WHICH ROW OWNS THE RUNNING SEARCH. Lives in the panel, not the row: `isLoading` is global, so
     only the panel can tell "this row is searching" from "another row is". */
  const [searchingTown, setSearchingTown] = useState<string | null>(null);
  /* Ticks only while the fold is in flight; cleared on unmount and on completion, so nothing
     keeps running behind a finished panel. */
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (state.kind !== 'busy') { setElapsed(0); return; }
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [state.kind]);

  const load = async () => {
    setState({ kind: 'busy' });
    try {
      const { data: res, error } = await supabase.functions.invoke('market-view', { body: { action: 'niche', trade } });
      if (error) throw new Error(error.message);
      if (!res?.ok) throw new Error(res?.error ?? 'niche fold failed');
      if (!res.niche) { setState({ kind: 'none', marketAudits: res.marketAudits ?? 0 }); return; }
      setState({ kind: 'done', niche: res.niche as NicheAnalysis });
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : 'niche fold failed' });
    }
  };

  /* ⛔ AUTO-LOAD IS SAFE HERE ONLY BECAUSE THE FOLD IS FREE. Coverage's "Niche verdict" button is
     the trade-level entry point, and making the operator press a second "Analyse" button inside the
     panel he just opened is the friction that made this feature undiscoverable in the first place.
     Nothing here reaches Apify or Places — market-view's `niche` action only re-reads stored audits
     (§6e: opening a view never spends), so a click that loads is not a click that costs.
     ⚠️ Fires once per mount, and Coverage remounts it with key={trade}, so switching trade cannot
     leave one trade's numbers under another trade's heading. */
  useEffect(() => {
    if (autoLoad) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoad, trade]);

  if (state.kind === 'idle' || state.kind === 'busy') {
    /* Auto-loading opens straight into a spinner — the invitation card below would flash the
       "Analyse niche" button for a moment and then replace itself, which reads as a misclick. */
    if (autoLoad) {
      /* ⚠️ THE ELAPSED COUNTER IS THE FIX FOR THE ACTUAL COMPLAINT. This fold takes ~11s on a big
         trade (Plumbers: 85 audits, 18 towns, 1,100 answers), and it used to sit behind one static
         line — which reads as hung rather than working. A number that moves is the difference
         between "slow" and "broken", and it costs nothing. */
      return (
        <Card className="border-primary/25">
          <CardContent className="flex flex-wrap items-center gap-x-3 gap-y-1 p-4 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="font-medium">Reading every stored {trade} audit…</span>
            <span className="text-muted-foreground">
              All towns, no new searches{elapsed > 0 ? ` · ${elapsed}s` : ''}
              {elapsed >= 8 ? ' · a big trade takes 10–15s' : ''}
            </span>
          </CardContent>
        </Card>
      );
    }
    return (
      <Card className="border-primary/25">
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <Telescope className="h-4 w-4 text-primary" />
          <div className="min-w-0 flex-1 text-sm">
            <span className="font-medium">Niche analysis — {trade}, all towns.</span>{' '}
            <span className="text-muted-foreground">Is this trade worth mass outreach? Per-engine named rates, winnability, and where the engines read — from every stored audit. Reads only.</span>
          </div>
          <Button size="sm" onClick={load} disabled={state.kind === 'busy'}>
            {state.kind === 'busy' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Telescope className="mr-1.5 h-3.5 w-3.5" />}
            Analyse niche · free
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (state.kind === 'error') {
    /* ⚠️ A RETRY EXISTS BECAUSE AUTO-LOAD REMOVED THE ONE THAT USED TO BE IMPLICIT. Before, a
       failure left the invitation card's own button on screen; opening straight into the fold means
       a transient failure would otherwise leave a dead card with no way forward but a page reload. */
    return (
      <Card className="border-destructive/40 bg-destructive/10">
        <CardContent className="flex flex-wrap items-center gap-3 p-4 text-sm">
          <span className="min-w-0 flex-1 text-destructive">Niche analysis failed: {state.message}</span>
          <Button size="sm" variant="outline" onClick={load}>
            <Telescope className="mr-1.5 h-3.5 w-3.5" /> Try again · free
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (state.kind === 'none') {
    return (
      <Card><CardContent className="p-4 text-sm text-muted-foreground">
        No business audits exist for this trade yet{state.marketAudits > 0 ? ` (${state.marketAudits} market audit${state.marketAudits === 1 ? '' : 's'} only — they carry no named-rate data)` : ''}. Audit some businesses in the trade first, then this analysis has something to read.
      </CardContent></Card>
    );
  }

  const n = state.niche;
  const w = n.winnability;
  const wOrder = ['open', 'contested', 'named', 'locked', 'no_local_race', 'unmeasured'];
  const singleRunQ = n.sample.questions - n.sample.multiRunQuestions;
  /* THE DECISION, DERIVED ON READ — never stored (a stored verdict freezes a stale rule). */
  const v = nicheVerdict(n);
  const VSTYLE = {
    worth_outreach: { cls: 'border-emerald-500/40 bg-emerald-500/5', icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" /> },
    mixed: { cls: 'border-amber-500/40 bg-amber-500/5', icon: <MinusCircle className="h-4 w-4 text-amber-600" /> },
    avoid: { cls: 'border-red-500/40 bg-red-500/5', icon: <XCircle className="h-4 w-4 text-red-600" /> },
    no_verdict: { cls: 'border-border bg-muted/40', icon: <HelpCircle className="h-4 w-4 text-muted-foreground" /> },
  }[v.kind];
  const TIER_LABEL = { measured: 'MEASURED', indicative: 'INDICATIVE', unmeasured: 'UNMEASURED' }[v.tier];
  const TIER_CLS = {
    measured: 'border-emerald-500/40 text-emerald-600',
    indicative: 'border-amber-500/40 text-amber-600',
    unmeasured: 'border-border text-muted-foreground',
  }[v.tier];

  return (
    <Card className="border-primary/25">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex flex-wrap items-center gap-2">
          <Telescope className="h-4 w-4 text-primary" /> Niche analysis — {n.trade}
          <span className="text-xs font-normal text-muted-foreground">
            {n.sample.businesses} businesses · {n.sample.towns} towns · {n.sample.audits} audits · {n.sample.cells} answers
            {n.marketAudits > 0 ? ` · +${n.marketAudits} market audits (not folded in)` : ''}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {/* ⛔ THE DECISION FIRST (Paul's layout call): the worth-outreach / avoid call leads, the
            evidence sits under it. The tier chip gates only the CONFIDENT WORDING — the numbers
            below are always shown, whatever the tier. */}
        <div className={`rounded-lg border p-3 ${VSTYLE.cls}`}>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0">{VSTYLE.icon}</span>
            <div className="min-w-0 space-y-1">
              <p className="text-[15px] font-semibold leading-snug">{v.headline}</p>
              <p className="text-xs text-muted-foreground">{v.engineStory}</p>
            </div>
            <Badge variant="outline" className={`ml-auto shrink-0 text-[10px] font-bold ${TIER_CLS}`}>{TIER_LABEL}</Badge>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">{v.tierNote}</p>
          {v.gaps.length > 0 && (
            <p className="mt-1 text-[11px] text-muted-foreground">To firm this up: {v.gaps.join(' · ')}.</p>
          )}
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Named rate, per engine</p>
          {n.engines.map((e) => (
            <div key={e.engine} className="flex items-center gap-2 py-0.5">
              <span className="w-40 shrink-0">{e.label}</span>
              <div className="h-2 flex-1 overflow-hidden rounded bg-muted">
                <div className="h-full bg-primary" style={{ width: `${Math.min(100, sharePct(e.named, e.answered))}%` }} />
              </div>
              <span className="w-40 shrink-0 text-right text-xs text-muted-foreground">{rateLabel(e.named, e.answered)}</span>
            </div>
          ))}
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Winnability across {n.sample.questions} questions</p>
          <div className="flex flex-wrap gap-1.5">
            {wOrder.filter((k) => w[k]).map((k) => (
              <Badge key={k} variant="outline" className="text-[11px] font-normal">
                {k.replace(/_/g, ' ')}: <b className="ml-1">{w[k]}</b>
              </Badge>
            ))}
          </div>
          {/* The sample-size honesty line — single-ask winnability flips ~18%, so say which part is solid. */}
          <p className="mt-1 text-[11px] text-muted-foreground">
            {n.sample.multiRunQuestions > 0 ? `${n.sample.multiRunQuestions} questions measured across repeat runs (reliable); ` : ''}
            {singleRunQ > 0 ? `${singleRunQ} from single-ask audits — indicative only (single-ask winnability can flip ~18%). ` : ''}
            The named rates and source split are per-answer counts and hold up regardless.
          </p>
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Where each engine reads (citations)</p>
          {n.sources.filter((s) => s.total > 0).map((s) => (
            <p key={s.engine} className="py-0.5 text-xs">
              <span className="inline-block w-40 font-medium text-sm">{s.label}</span>
              directories <b>{sharePct(s.directory, s.total)}%</b> · other businesses&rsquo; sites <b>{sharePct(s.other, s.total)}%</b>
              · authority {sharePct(s.authority, s.total)}% · the audited business&rsquo;s own site {sharePct(s.ownSite, s.total)}%
              <span className="text-muted-foreground"> ({s.total} citations)</span>
            </p>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Top cited domains</p>
            {Object.entries(n.topDomains).filter(([, d]) => d.length).map(([eng, doms]) => (
              <p key={eng} className="text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">{n.engines.find((e) => e.engine === eng)?.label ?? eng}:</span>{' '}
                {doms.slice(0, 5).map((d) => `${d.domain} (${d.count})`).join(', ')}
              </p>
            ))}
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Towns in this niche</p>
            {/* ⛔ THE OUTREACH HANDOFF — reuses the EXISTING CRM bridge verbatim: findLeadsHref
                (the normal prefilled lead search that feeds Add-to-CRM) and marketViewHref (the
                per-town panel that owns "Add all N targets"). No lead-creation code here, and
                'measured' is passed so no arrival spend-confirm is ever attached (§6c). */}
            {n.towns.slice(0, 8).map((t) => (
              <TownRow
                key={t.town}
                trade={trade}
                town={t.town}
                businesses={t.businesses}
                cells={t.cells}
                searchingTown={searchingTown}
                setSearchingTown={setSearchingTown}
              />
            ))}
            {n.towns.length > 8 && <p className="text-[11px] text-muted-foreground">+{n.towns.length - 8} more towns</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
