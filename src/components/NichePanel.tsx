import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Telescope, CheckCircle2, MinusCircle, XCircle, HelpCircle, Search, Store } from 'lucide-react';
import { rateLabel, sharePct, nicheVerdict, type NicheAnalysis } from '@/lib/nicheView';
import { findLeadsHref, marketViewHref } from '@/lib/coverageState';

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

export default function NichePanel({ trade }: { trade: string }) {
  const [state, setState] = useState<State>({ kind: 'idle' });

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

  if (state.kind === 'idle' || state.kind === 'busy') {
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
    return <Card className="border-destructive/40 bg-destructive/10"><CardContent className="p-4 text-sm text-destructive">Niche analysis failed: {state.message}</CardContent></Card>;
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
              <div key={t.town} className="flex items-center gap-1.5 py-0.5">
                <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{t.town} — {t.businesses} businesses, {t.cells} answers</span>
                <a href={marketViewHref(trade, t.town, 'measured')} className="shrink-0 text-[11px] text-primary hover:underline" title="Open this town's market view — its target list and Add-all-targets button">
                  <Store className="mr-0.5 inline h-3 w-3" />targets
                </a>
                <a href={findLeadsHref(trade, t.town)} className="shrink-0 text-[11px] text-primary hover:underline" title="Find leads in this town — the normal prefilled search (~11p of Places quota, free within 72h of the last identical search)">
                  <Search className="mr-0.5 inline h-3 w-3" />find leads
                </a>
              </div>
            ))}
            {n.towns.length > 8 && <p className="text-[11px] text-muted-foreground">+{n.towns.length - 8} more towns</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
