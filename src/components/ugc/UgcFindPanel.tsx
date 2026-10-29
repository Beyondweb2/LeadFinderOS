import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, Loader2, Play, RefreshCw, Search, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Callout, SubSection, ToneChip } from '@/components/operator/ui';
import { useToast } from '@/hooks/use-toast';
import { edgeErrorMessage, EdgeFunctionError } from '@/lib/edgeInvoke';
import { useUgcActions, useUgcRuns, type SearchRequest, type UgcRun } from '@/hooks/useUgc';
import {
  ENRICH_DEFAULT_TOP, ENRICH_MAX_TOP, THAILAND_AREAS, THAILAND_PLACE_TYPES, UGC_COUNTRIES, UGC_DEFAULT_ITEM_CAP, UGC_MAX_CONTACT_BRANDS,
  UGC_MAX_ITEM_CAP, UGC_NICHES, UGC_REFUSAL_TEXT, UGC_SOURCE_LABEL, formatUsd, type UgcSource,
} from '@/lib/ugc/config';

type Source = SearchRequest['source'];
const SOURCES: Source[] = ['fb_ads', 'creator_collabs', 'google_search', 'places'];
const refusalText = (code: string | null | undefined) => (code ? UGC_REFUSAL_TEXT[code] ?? code : null);
const errCode = (e: unknown) => (e instanceof EdgeFunctionError ? e.code : null);

function RunRow({ r, onPoll }: { r: UgcRun; onPoll: (id: string) => void }) {
  const tone = r.status === 'succeeded' ? 'green' : r.status === 'running' ? 'blue' : 'red';
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-xs">
      <span className="min-w-0 truncate"><b>{UGC_SOURCE_LABEL[r.source as UgcSource] ?? r.source}</b> · cap {r.item_cap} · {new Date(r.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
      <span className="flex items-center gap-1.5">
        <span className="text-muted-foreground">est {formatUsd(r.est_cost_usd)} · actual {formatUsd(r.actual_cost_usd)}</span>
        {r.status === 'succeeded' && <span className="text-muted-foreground">{r.brands_added ?? 0} new · {r.brands_updated ?? 0} updated</span>}
        <ToneChip tone={tone} dot>{r.status === 'running' ? (r.apify_status ?? 'Running') : r.status}</ToneChip>
        {r.status === 'running' && <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => onPoll(r.id)}><RefreshCw className="h-3 w-3" /></Button>}
      </span>
    </li>
  );
}

export function UgcFindPanel({ selectedIds, budget }: { selectedIds: string[]; budget: { budgetUsd: number; spentThisMonthUsd: number } | null }) {
  const actions = useUgcActions();
  const runs = useUgcRuns();
  const { toast } = useToast();
  const [source, setSource] = useState<Source>('fb_ads');
  const [niche, setNiche] = useState<string>('beauty');
  const [country, setCountry] = useState<string>('GB');
  const [keyword, setKeyword] = useState('');
  const [creators, setCreators] = useState('');
  const [area, setArea] = useState<string>(THAILAND_AREAS[0]);
  const [types, setTypes] = useState<string[]>([...THAILAND_PLACE_TYPES]);
  const [cap, setCap] = useState(UGC_DEFAULT_ITEM_CAP);
  const [est, setEst] = useState<{ estUsd: number; refusal: string | null } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [top, setTop] = useState(ENRICH_DEFAULT_TOP);
  const [enrichEst, setEnrichEst] = useState<{ estUsd: number; extraUsd?: number; brands?: number; refusal?: string | null } | null>(null);
  const [contactEst, setContactEst] = useState<{ estUsd: number; sites?: number; refusal?: string | null } | null>(null);

  const req = (): SearchRequest => ({ source, niche, country, itemCap: cap, keyword: keyword || undefined, creators: creators.split(/[\n,]/).map((s) => s.trim()).filter(Boolean), placeTypes: types, area });
  /* Any change to the search clears the shown estimate: a run always starts from the estimate it shows. */
  useEffect(() => setEst(null), [source, niche, country, keyword, creators, area, types, cap]);
  const selectedKey = selectedIds.join(',');
  useEffect(() => setContactEst(null), [selectedKey]);
  useEffect(() => setEnrichEst(null), [top]);

  const poll = async (id: string) => {
    try { const r = await actions.poll(id); if (r.run.status === 'succeeded') toast({ title: `Done: ${r.run.brands_added ?? 0} new brands, ${r.run.brands_updated ?? 0} updated` }); }
    catch (e) { toast({ title: 'Could not check the run', description: edgeErrorMessage(e), variant: 'destructive' }); }
  };
  /* While a run is going, check it every 10 s (Apify runs take one to a few minutes). */
  const running = (runs.data ?? []).filter((r) => r.status === 'running').map((r) => r.id).join(',');
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!running) return;
    timer.current = window.setInterval(() => { for (const id of running.split(',')) void actions.poll(id).catch(() => undefined); }, 10_000);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [running, actions]);

  const go = async (key: string, fn: () => Promise<void>) => { setBusy(key); try { await fn(); } catch (e) { toast({ title: 'Not started', description: refusalText(errCode(e)) ?? edgeErrorMessage(e), variant: 'destructive' }); } finally { setBusy(null); } };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card><CardContent className="space-y-4 p-4 text-sm">
        <SubSection title="Find brands" icon={Search} tone="blue">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Source">
            {SOURCES.map((s) => <Button key={s} size="sm" variant={source === s ? 'default' : 'outline'} onClick={() => setSource(s)} role="radio" aria-checked={source === s}>{UGC_SOURCE_LABEL[s]}</Button>)}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {(source === 'fb_ads' || source === 'google_search' || source === 'creator_collabs') && (
              <label className="text-xs font-medium">Niche
                <select className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={niche} onChange={(e) => setNiche(e.target.value)}>
                  {UGC_NICHES.map((n) => <option key={n} value={n}>{n[0].toUpperCase() + n.slice(1)}</option>)}
                </select></label>
            )}
            {(source === 'fb_ads' || source === 'google_search') && (
              <label className="text-xs font-medium">Country
                <select className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={country} onChange={(e) => setCountry(e.target.value)}>
                  {UGC_COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
                </select></label>
            )}
            {(source === 'fb_ads' || source === 'google_search') && (
              <label className="text-xs font-medium sm:col-span-2">Keyword (optional — otherwise the niche's words)
                <Input className="mt-1" value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="e.g. collagen" /></label>
            )}
            {source === 'creator_collabs' && (
              <label className="text-xs font-medium sm:col-span-2">UGC creators (Instagram handles, one per line)
                <textarea className="mt-1 min-h-[70px] w-full rounded-md border bg-background p-2 text-sm" value={creators} onChange={(e) => setCreators(e.target.value)} placeholder="@creatorname" /></label>
            )}
            {source === 'places' && (<>
              <label className="text-xs font-medium">Area
                <select className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm" value={area} onChange={(e) => setArea(e.target.value)}>
                  {THAILAND_AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select></label>
              <div className="text-xs font-medium">Types
                <div className="mt-1 flex flex-wrap gap-1">{THAILAND_PLACE_TYPES.map((t) => (
                  <Button key={t} size="sm" variant={types.includes(t) ? 'default' : 'outline'} className="h-7 px-2" onClick={() => setTypes((x) => x.includes(t) ? x.filter((y) => y !== t) : [...x, t])}>{t}</Button>
                ))}</div></div>
              <p className="text-[11px] text-muted-foreground sm:col-span-2">Local track: these go to the Local list (CM collab DM v4), kept apart from paid brand pitches.</p>
            </>)}
            <label className="text-xs font-medium">Item cap (max {UGC_MAX_ITEM_CAP})
              <Input className="mt-1" type="number" min={1} max={UGC_MAX_ITEM_CAP} value={cap} onChange={(e) => setCap(Math.max(1, Math.min(UGC_MAX_ITEM_CAP, Number(e.target.value) || 1)))} /></label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button variant="outline" disabled={!!busy} onClick={() => void go('est', async () => { const r = await actions.estimate(req()); setEst({ estUsd: r.estUsd, refusal: r.refusal }); })}>
              {busy === 'est' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}Show cost</Button>
            {est && <span className="text-sm" data-testid="ugc-estimate">Up to <b>{formatUsd(est.estUsd)}</b> for at most {cap} results</span>}
            <Button disabled={!est || !!est.refusal || !!busy} onClick={() => void go('run', async () => { await actions.start(req()); toast({ title: 'Search started — results land in a minute or two' }); setEst(null); })}>
              {busy === 'run' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />}Run search</Button>
          </div>
          {est?.refusal && <Callout tone="amber" className="mt-2">{refusalText(est.refusal)}</Callout>}
          <p className="mt-2 text-[11px] text-muted-foreground">The cost is a ceiling at Apify's highest list price; Apify is told to stop the run there. The real cost is recorded when it finishes.</p>
        </SubSection>
      </CardContent></Card>

      <div className="space-y-4">
        <Card><CardContent className="space-y-4 p-4 text-sm">
          <SubSection title="Contacts" icon={Users} tone="green">
            <p className="text-xs text-muted-foreground">Reads up to 3 pages per website (and its Linktree) for emails, Instagram and WhatsApp chat buttons.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" disabled={!selectedIds.length || !!busy} onClick={() => void go('cest', async () => { const r = await actions.contacts(selectedIds.slice(0, UGC_MAX_CONTACT_BRANDS), true); setContactEst(r); })}>
                Show cost for {Math.min(selectedIds.length, UGC_MAX_CONTACT_BRANDS)} selected</Button>
              {contactEst && <span>Up to <b>{formatUsd(contactEst.estUsd)}</b> ({contactEst.sites} sites)</span>}
              <Button size="sm" disabled={!contactEst || !!contactEst.refusal || !!busy} onClick={() => void go('crun', async () => { await actions.contacts(selectedIds.slice(0, UGC_MAX_CONTACT_BRANDS)); setContactEst(null); toast({ title: 'Finding contacts…' }); })}>Find contacts</Button>
            </div>
            {contactEst?.refusal && <Callout tone="amber" className="mt-2">{refusalText(contactEst.refusal)}</Callout>}
          </SubSection>
          <SubSection title="Named marketing contacts" icon={BadgeCheck} tone="green">
            <p className="text-xs text-muted-foreground">Named people in marketing, partnerships, social or brand roles, emails verified — for your top-ranked brands only (by tier).</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="text-xs font-medium">Top <Input className="ml-1 inline-block h-8 w-20" type="number" min={1} max={ENRICH_MAX_TOP} value={top} onChange={(e) => setTop(Math.max(1, Math.min(ENRICH_MAX_TOP, Number(e.target.value) || 1)))} /> brands</label>
              <Button variant="outline" size="sm" disabled={!!busy} onClick={() => void go('eest', async () => setEnrichEst(await actions.namedContacts(top, true)))}>Show cost</Button>
              {enrichEst && <span data-testid="ugc-enrich-estimate">Up to <b>{formatUsd(enrichEst.estUsd)}</b> for {enrichEst.brands} brands — of which <b>{formatUsd(enrichEst.extraUsd)}</b> is the named-contact extra</span>}
              <Button size="sm" disabled={!enrichEst || !!enrichEst.refusal || !!busy} onClick={() => void go('erun', async () => { await actions.namedContacts(top); setEnrichEst(null); toast({ title: 'Finding named contacts…' }); })}>Find named contacts</Button>
            </div>
            {enrichEst?.refusal && <Callout tone="amber" className="mt-2">{refusalText(enrichEst.refusal)}</Callout>}
          </SubSection>
          {budget && <p className="text-xs text-muted-foreground">This month: {formatUsd(budget.spentThisMonthUsd)} of your {formatUsd(budget.budgetUsd)} search budget.</p>}
        </CardContent></Card>

        <Card><CardContent className="p-4">
          <p className="mb-1 text-sm font-semibold">Recent runs</p>
          {runs.isLoading ? <p className="text-xs text-muted-foreground">Loading…</p> : (
            <ul className="divide-y">{(runs.data ?? []).map((r) => <RunRow key={r.id} r={r} onPoll={(id) => void poll(id)} />)}
              {(runs.data ?? []).length === 0 && <li className="py-2 text-xs text-muted-foreground">No runs yet.</li>}</ul>
          )}
        </CardContent></Card>
      </div>
    </div>
  );
}
