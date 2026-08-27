import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Telescope, CheckCircle2, MinusCircle, XCircle, HelpCircle, Search, Store } from 'lucide-react';
import { rateLabel, sharePct, nicheVerdict, type NicheAnalysis } from '@/lib/nicheView';
import { useNavigate } from 'react-router-dom';
import { useLeadSearchContext } from '@/contexts/LeadSearchContext';
import { useOutreach } from '@/hooks/useOutreach';
import { useCampaigns } from '@/hooks/useCampaigns';
import { pickCampaignForTrade } from '@/lib/campaignForTrade';
import { useToast } from '@/hooks/use-toast';
import { useTownLeadSearch, type TownSearchState } from '@/hooks/useTownLeadSearch';

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
 * ⛔ EACH ROW OWNS ITS OWN SEARCH, AND THAT IS THE WHOLE POINT. It first ran through
 * LeadSearchContext.search() — the Find Leads page's search — which is single-flight by design:
 * its first act is `abortRef.current.abort()`, and it writes into ONE global leads/lastSearch. So
 * pressing a second town CANCELLED the first, and only the last finisher had results. Rows now use
 * `useTownLeadSearch`, which keeps a status and a result set PER TRADE+TOWN, so several towns
 * search at once and each offers "Add all" the moment IT finishes.
 *
 * ⛔ THE WRONG-TOWN GUARD IS NOW STRUCTURAL RATHER THAN A COMPARISON. Results are keyed by
 * trade+town, so a row can only ever render its own — there is no shared array to mis-attribute,
 * which is a stronger guarantee than the `resultsBelongToTown` comparison it replaces. That
 * predicate now has NO CALLER (it stays in nicheView.ts, tested, as the record of the hazard —
 * anything that routes rows back through one shared result set needs it again).
 *
 * "View" hands this row's already-fetched results to the Find Leads page via `adoptResults` and
 * navigates with NO `run=search`, so the page shows them without paying for the same search twice.
 *
 * ⚠️ The per-row "Market view" / targets link is GONE (Paul, 2026-08-28: never used, and the
 * niche verdict button at the top of Coverage is the market read now).
 */
function TownRow({
  trade, town, businesses, cells, state, onSearch, onAdded,
}: {
  trade: string; town: string; businesses: number; cells: number;
  state: TownSearchState;
  onSearch: () => void;
  onAdded: (added: number, dupes: number) => void;
}) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { adoptResults } = useLeadSearchContext();
  const { addLead } = useOutreach();
  const { campaigns } = useCampaigns();
  const [adding, setAdding] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  /* Ticks only while THIS row is searching. A number that moves is what separates "working" from
     "hung" — the complaint that started this. */
  const searching = state.kind === 'searching';
  useEffect(() => {
    if (!searching) { setElapsed(0); return; }
    const t0 = state.kind === 'searching' ? state.startedAt : Date.now();
    const id = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching]);

  const rowLeads = state.kind === 'done' || state.kind === 'added' ? state.leads : [];

  const addAll = async () => {
    if (!rowLeads.length || adding) return;
    setAdding(true);
    try {
      const campaignId = pickCampaignForTrade(trade, campaigns, null).campaignId;
      let ok = 0; let dupes = 0;
      /* The SAME single-add path Find Leads uses: addLead, silent, with the trade and town stamped
         on the row so the lead is auditable (no trade = no audit, and addLead blocks that anyway).
         A duplicate returns null and is COUNTED, never re-added. */
      for (const lead of rowLeads) {
        const created = await addLead(lead, 'UK', 'no_website', campaignId, null, true, trade, town);
        if (created) ok++; else dupes++;
      }
      onAdded(ok, dupes);
      toast({
        title: `${town}: added ${ok} lead${ok === 1 ? '' : 's'}`,
        description: dupes > 0 ? `${dupes} were already in the CRM and were skipped.` : 'All new.',
      });
    } finally {
      setAdding(false);
    }
  };

  /* Hand the page this row's results, then navigate. No run=search, so nothing is re-fetched. */
  const openInFindLeads = () => {
    adoptResults(rowLeads, { keyword: trade, location: town, country: 'UK' });
    navigate(`/find-leads?mode=leads&keyword=${encodeURIComponent(trade)}&location=${encodeURIComponent(town)}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 py-0.5">
      <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
        {town} — {businesses} businesses, {cells} answers
      </span>

      {state.kind === 'searching' && (
        <span className="shrink-0 text-[11px] text-primary">
          <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
          Searching {town}… {elapsed > 0 ? `${elapsed}s` : ''}
        </span>
      )}

      {state.kind === 'error' && (
        <>
          <span className="shrink-0 text-[11px] text-destructive" title={state.message}>search failed</span>
          <Button size="sm" variant="outline" className="h-6 shrink-0 px-2 text-[11px]" onClick={onSearch}>
            <Search className="mr-1 h-3 w-3" />try again
          </Button>
        </>
      )}

      {state.kind === 'added' && (
        <span className="shrink-0 text-[11px] text-emerald-600">
          Added {state.added}{state.dupes ? ` · ${state.dupes} already there` : ''}
        </span>
      )}

      {(state.kind === 'done' || state.kind === 'added') && rowLeads.length > 0 && (
        <>
          {state.kind === 'done' && (
            <Button size="sm" variant="default" className="h-6 shrink-0 px-2 text-[11px]" onClick={addAll} disabled={adding}
              title={`Add all ${rowLeads.length} businesses found in ${town} to the CRM`}>
              {adding ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Store className="mr-1 h-3 w-3" />}
              {adding ? 'Adding…' : `Add all ${rowLeads.length} to CRM`}
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-6 shrink-0 px-2 text-[11px]" onClick={openInFindLeads}
            title={`Open Find Leads showing these ${rowLeads.length} results — no new search`}>
            <Search className="mr-1 h-3 w-3" />View
          </Button>
        </>
      )}

      {state.kind === 'done' && rowLeads.length === 0 && (
        <span className="shrink-0 text-[11px] text-muted-foreground">no businesses found</span>
      )}

      {(state.kind === 'idle' || state.kind === 'added') && (
        <Button size="sm" variant="outline" className="h-6 shrink-0 px-2 text-[11px]" onClick={onSearch}
          title={`Run the lead search for ${trade} in ${town} in the background (~11p of Places quota, free within 72h of the same search)`}>
          <Search className="mr-1 h-3 w-3" />
          {state.kind === 'added' ? 'search again' : 'find leads'}
        </Button>
      )}
    </div>
  );
}

export default function NichePanel({ trade, autoLoad = false }: { trade: string; autoLoad?: boolean }) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  /* ⛔ THE SEARCHES LIVE IN THE PANEL, KEYED BY TOWN, so they survive a row re-render and several
     can be in flight at once. `isLeadExcluded` comes from the context so a row drops exactly the
     businesses the Find Leads page would drop — one rule, not a copy. */
  const { isLeadExcluded } = useLeadSearchContext();
  const { stateFor, start, markAdded, searchingCount } = useTownLeadSearch(isLeadExcluded);
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
            <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Towns in this niche
              {/* Several towns can search at once, so say how many are running — otherwise the only
                  signal is per-row and you cannot see the batch you kicked off. */}
              {searchingCount > 0 && (
                <span className="inline-flex items-center gap-1 font-normal normal-case text-primary">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {searchingCount} searching
                </span>
              )}
            </p>
            {/* ⛔ THE OUTREACH HANDOFF — each row searches INDEPENDENTLY (useTownLeadSearch), so
                several towns run at once and each offers "Add all N to CRM" as it finishes. The
                add goes through the SAME addLead the Find Leads page uses; View hands the results
                to that page rather than re-fetching them. The per-town "Market view" link was
                removed 2026-08-28 — the niche verdict at the top of Coverage is the market read. */}
            {n.towns.slice(0, 8).map((t) => (
              <TownRow
                key={t.town}
                trade={trade}
                town={t.town}
                businesses={t.businesses}
                cells={t.cells}
                state={stateFor(trade, t.town)}
                onSearch={() => start(trade, t.town)}
                onAdded={(added, dupes) => markAdded(trade, t.town, added, dupes)}
              />
            ))}
            {n.towns.length > 8 && <p className="text-[11px] text-muted-foreground">+{n.towns.length - 8} more towns</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
