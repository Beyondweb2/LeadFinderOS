import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, EyeOff, Eye, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useCoverage } from '@/hooks/useCoverage';
import { TRADES, TOWN_BAND_DEFAULT_MIN, TOWN_BAND_DEFAULT_MAX } from '@/lib/trades';
import {
  COVERAGE_STATES, COVERAGE_LABEL, type CoverageState,
} from '@/lib/coverageState';

/* ══ WHERE HAVE I BEEN? ═══════════════════════════════════════════════════════════════════════
   ⛔ WHAT THIS REPLACES: asking someone for town names. Every candidate town for a trade, with the
   ones already measured or worked marked, so "locksmiths in the East of England: 6 of 87 done"
   reads in one look.

   ⚠️ THE TRADE AND THE REGION ARE IN THE URL, the size band and the show-suppressed toggle are not.
   That is §6c's line: the URL is for WHAT I AM LOOKING AT — a trade's coverage is a view you would
   link to or come back to — and usePersistedState is for HOW THE PAGE IS CONFIGURED. A size band is
   a configuration. Nothing here persists an open dialog. */

const STATE_STYLE: Record<CoverageState, string> = {
  worked: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  measured: 'bg-sky-500/15 text-sky-600 border-sky-500/30',
  leads: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  untouched: 'bg-muted text-muted-foreground border-transparent',
};

export default function Coverage() {
  const { toast } = useToast();
  const { isLoading, error, gradeFor, setSuppressed, regions, applyFilters, summarise, refetch } = useCoverage();

  const [params, setParams] = useSearchParams();
  const trade = params.get('trade') || TRADES[0].label;
  const region = params.get('region');
  const setParam = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };

  const [minPop, setMinPop] = useState(TOWN_BAND_DEFAULT_MIN);
  const [maxPop, setMaxPop] = useState(TOWN_BAND_DEFAULT_MAX);
  const [showSuppressed, setShowSuppressed] = useState(false);
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
            <Input type="number" value={minPop} onChange={(e) => setMinPop(Number(e.target.value) || 0)} className="h-9 w-[100px]" />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="number" value={maxPop} onChange={(e) => setMaxPop(Number(e.target.value) || 0)} className="h-9 w-[100px]" />
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

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Reading your audits, leads and messages&hellip;
        </div>
      ) : error ? (
        <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={refetch}>Retry</Button>
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
                    <Badge variant="outline" className={`text-xs ${STATE_STYLE[t.state]}`}>
                      {COVERAGE_LABEL[t.state]}
                    </Badge>
                  </td>
                  <td className="px-3 py-1.5 text-right">
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
