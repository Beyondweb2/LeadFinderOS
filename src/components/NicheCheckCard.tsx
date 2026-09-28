import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Telescope, PlayCircle, RefreshCw, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useLeadPermissions } from '@/hooks/useLeadPermissions';
import { edgeErrorMessage, invokeEdge } from '@/lib/edgeInvoke';
import { asPence } from '@/lib/marketView';
import { NICHE_SAMPLE_BANDS, type NicheSampleVerdict, type SampleTown } from '@/lib/nicheSample';

/* ══ THE NICHE CHECK (2026-09-28) — the ONE niche verdict on Coverage ═══════════════════════════
   Normal use: the niche (the Coverage trade, or any typed niche) → its latest check is shown, free →
   or "Plan a check" shows exactly what would be tested and what it costs → Run → progress → the
   verdict. The method and every threshold are src/lib/nicheSample.ts; the runner is fn niche-sample.
   ⛔ OPENING SPENDS NOTHING: list/status only read. Planning spends nothing either. Only "Run", on a
   button that prices itself, spends — and only the admin has it. */

type Plan = { trade: string; towns: Array<SampleTown & { questions: string[] }> };
type Sample = {
  id: string; trade: string; created_at: string; status: 'running' | 'ready' | 'failed'; error: string | null;
  plan: Plan; progress: { answered: number; expected: number; towns: Array<{ name: string; runsSettled: number; runs: number }> };
  verdict: NicheSampleVerdict | null;
};

const VERDICT_CLS: Record<NicheSampleVerdict['verdict'], string> = {
  WORKABLE: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/40',
  'HARDER NICHE': 'bg-red-500/10 text-red-600 border-red-500/40',
  'PROMISING — NEEDS MORE DATA': 'bg-amber-500/15 text-amber-600 border-amber-500/40',
  'NEED MORE DATA': 'bg-muted text-muted-foreground border-border',
};
const bandLabel = (b: string) => NICHE_SAMPLE_BANDS.find((x) => x.key === b)?.label ?? b;
const pct = (x: number) => `${Math.round(x * 100)}%`;

export function NicheCheckCard({ trade: initialTrade }: { trade: string }) {
  const perms = useLeadPermissions();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [trade, setTrade] = useState(initialTrade);
  const [draft, setDraft] = useState(initialTrade);
  useEffect(() => { setTrade(initialTrade); setDraft(initialTrade); }, [initialTrade]);
  const [plan, setPlan] = useState<{ plan: Plan; estimateUsd: number; freshSampleId: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showDetail, setShowDetail] = useState(false);

  const list = useQuery({
    queryKey: ['niche-samples', trade.toLowerCase()],
    enabled: !!trade.trim(),
    queryFn: async () => (await invokeEdge<{ ok: boolean; samples?: Sample[]; error?: string }>('niche-sample', { action: 'list', trade })).samples ?? [],
    refetchInterval: (q) => ((q.state.data ?? []).some((s) => s.status === 'running') ? 20_000 : false),
  });
  const latest = list.data?.[0] ?? null;

  const planIt = async () => {
    setBusy(true);
    try {
      const r = await invokeEdge<{ ok: boolean; plan?: Plan; estimateUsd?: number; freshSampleId?: string | null; error?: string; detail?: string }>('niche-sample', { action: 'plan', trade });
      if (!r.ok || !r.plan) { toast({ title: "Couldn't plan the check", description: r.detail ?? r.error ?? 'Try again', variant: 'destructive' }); return; }
      setPlan({ plan: r.plan, estimateUsd: r.estimateUsd ?? 0, freshSampleId: r.freshSampleId ?? null });
    } catch (e) {
      toast({ title: "Couldn't plan the check", description: edgeErrorMessage(e, 'Try again'), variant: 'destructive' });
    } finally { setBusy(false); }
  };
  const run = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      const r = await invokeEdge<{ ok: boolean; sample_id?: string; error?: string; detail?: string }>('niche-sample', { action: 'start', trade, plan: plan.plan });
      if (!r.ok) { toast({ title: 'The check did not start cleanly', description: r.detail ?? r.error ?? 'Try again', variant: 'destructive' }); }
      else toast({ title: 'Niche check started', description: 'It runs on the server — about 15–25 minutes. You can leave this page.' });
      setPlan(null);
      await qc.invalidateQueries({ queryKey: ['niche-samples', trade.toLowerCase()] });
    } catch (e) {
      toast({ title: "Couldn't start the check", description: edgeErrorMessage(e, 'Try again'), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const v = latest?.verdict ?? null;
  return (
    <Card className="border-primary/25" data-testid="niche-check">
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <Telescope className="h-4 w-4 text-primary" /> Niche check — is it worth selling Findable into?
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); setPlan(null); setTrade(draft.trim()); }}>
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} className="h-9 w-full max-w-xs" placeholder="Any niche, e.g. roofers" aria-label="Niche" />
          <Button type="submit" size="sm" variant="outline" className="h-9">Show</Button>
          {perms.auditAdmin && (
            <Button type="button" size="sm" className="h-9 gap-1.5" disabled={busy || !trade.trim()} onClick={() => void planIt()}>
              {busy && !plan ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}Plan a new check
            </Button>
          )}
        </form>

        {plan && (
          <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3" data-testid="niche-plan">
            <div className="font-medium">About to test “{plan.plan.trade}” — {asPence(plan.estimateUsd)}</div>
            {plan.freshSampleId && <p className="text-xs text-amber-600">A check of this niche ran in the last 30 days — its result is below. Run another only to add three more towns.</p>}
            <ul className="space-y-1.5">
              {plan.plan.towns.map((t) => (
                <li key={t.ons_code}>
                  <span className="font-medium">{t.name}</span> <span className="text-xs text-muted-foreground">— {bandLabel(t.band).toLowerCase()}, {t.region}, {t.population.toLocaleString('en-GB')} people</span>
                  <ol className="ml-5 list-decimal text-xs text-muted-foreground">{t.questions.map((q) => <li key={q}>{q}</li>)}</ol>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">Each question is asked 3 times on Gemini (which decides) and ChatGPT (context), plus one Google search per town to see the real local market. Nothing is sent to anyone.</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={busy} onClick={() => setPlan(null)}>Cancel</Button>
              <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" disabled={busy} onClick={() => void planIt()}><RefreshCw className="h-3.5 w-3.5" />Different towns</Button>
              <Button size="sm" className="h-8 gap-1 text-xs" disabled={busy} onClick={() => void run()} data-testid="niche-run">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}Run · {asPence(plan.estimateUsd)}
              </Button>
            </div>
          </div>
        )}

        {list.isLoading && <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Reading earlier checks…</p>}
        {list.isError && <p className="text-destructive">Couldn't read earlier checks: {edgeErrorMessage(list.error, 'try again')}</p>}
        {list.data && !latest && !plan && (
          <p className="text-muted-foreground">No check has been run for “{trade}” yet.{perms.auditAdmin ? ' Plan one to see what it would test — planning is free.' : ' The admin can run one.'}</p>
        )}
        {latest && latest.status === 'running' && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2" data-testid="niche-progress">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span>Checking “{latest.trade}”: {latest.progress.answered} of {latest.progress.expected} questions answered · {latest.progress.towns.map((t) => `${t.name} ${t.runsSettled}/${t.runs} runs`).join(' · ')}</span>
          </div>
        )}
        {latest && latest.status === 'failed' && !v && (
          <p className="text-destructive">The last check did not start cleanly: {latest.error ?? 'unknown error'}. Plan it again.</p>
        )}
        {v && (
          <div className="space-y-2" data-testid="niche-verdict">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={`text-xs font-semibold ${VERDICT_CLS[v.verdict]}`}>{v.verdict}</Badge>
              <span className="text-xs text-muted-foreground">Confidence: {v.confidence} · checked {new Date(latest!.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
            </div>
            <p><span className="font-medium">Why: </span>{v.why}</p>
            <p>{v.gemini}</p>
            <p className="text-muted-foreground">{v.chatgpt}</p>
            <p className="text-xs text-muted-foreground"><span className="font-medium">Markets tested: </span>{v.markets}</p>
            <p><span className="font-medium">Next step: </span>{v.nextStep}</p>
            <button type="button" className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => setShowDetail((x) => !x)} aria-expanded={showDetail}>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showDetail ? 'rotate-180' : ''}`} />{showDetail ? 'Hide the detail' : 'Show the detail'}
            </button>
            {showDetail && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-xs">
                  <thead className="text-muted-foreground"><tr className="text-left">
                    <th className="py-1 pr-2 font-medium">Town</th><th className="pr-2 font-medium">Gemini answers</th><th className="pr-2 font-medium">Local firms / answer</th>
                    <th className="pr-2 font-medium">Different firms</th><th className="pr-2 font-medium">Top 3 share</th><th className="pr-2 font-medium">Named every run</th>
                    <th className="pr-2 font-medium">Directories / nationals</th><th className="font-medium">Google lists · Gemini named</th>
                  </tr></thead>
                  <tbody>{v.towns.map((t) => (
                    <tr key={t.town.ons_code} className="border-t border-border/60">
                      <td className="py-1 pr-2">{t.town.name}</td>
                      <td className="pr-2">{t.gemini.answers}/{t.gemini.planned}</td>
                      <td className="pr-2">{t.gemini.localPerAnswer.toFixed(1)}</td>
                      <td className="pr-2">{t.gemini.distinctLocal}</td>
                      <td className="pr-2">{pct(t.gemini.top3Share)}</td>
                      <td className="pr-2">{pct(t.gemini.heldShare)}</td>
                      <td className="pr-2">{pct(t.gemini.dirNatShare)}</td>
                      <td>{t.placesFailed ? 'search failed' : `${t.gemini.placesListed} · ${t.gemini.placesNamed}`}</td>
                    </tr>
                  ))}</tbody>
                </table>
                <p className="mt-1 text-[11px] text-muted-foreground">Google lists = the local providers one Google search returns (up to 20) — a market-size check, not a ranking. Valid Gemini answers overall: {pct(v.validGeminiShare)}.</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
