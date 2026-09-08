/* ============================================================
   BEFORE / AFTER — the side-by-side re-measurement view.

   The operator picks which runs are the BEFORE and which are the AFTER, and this renders the
   comparison compareMeasurements computes. It replaces reading run numbers out of the database by
   hand, which is how every before/after has been done until now.

   ⛔ THE NOISE BAND IS ON SCREEN, NOT IN A FOOTNOTE. Repeat measurements with no work done between
   them swing by about ±5 percentage points (measured — see measurementCompare.ts). Any movement
   inside that band is labelled "within noise, not proven", in the headline and on every row, because
   this is the document a client is shown as evidence and a sub-noise change presented as
   improvement would be a promise the measurement cannot keep.

   ⛔ AND PER-QUESTION ROWS ARE MARKED UNPROVEN WHEN THEY ARE THIN. A question answered twice cannot
   demonstrate anything on its own; the claim lives in the overall figure. The rows are there to be
   READ — "which questions moved" — not to be quoted individually.
   ============================================================ */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft, ArrowUp, ArrowDown, Minus, CircleHelp } from 'lucide-react';
import type { QueueRowLite } from '@/lib/baselineView';
import {
  compareMeasurements, NOISE_BAND_PP, type MeasurementComparison, type Movement,
} from '@/lib/measurementCompare';
import { MeasurementCompareTable } from '@/components/MeasurementCompareTable';

interface RunLite {
  id: string;
  run_number: number;
  status: string | null;
  created_at: string;
  audit_id: string;
  /** Question count, folded from the queue rows we already load. */
  questions: number;
}

const dayOf = (iso: string) => iso.slice(0, 10);
const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/* A run with no usable data must not be selectable: `cancelled` and `failed` runs carry no answers,
   and including one would shrink a denominator and flatter the result. */
const isUsable = (r: RunLite) => r.status === 'complete' || r.status === 'capped';

const MOVE_STYLE: Record<Movement, { label: string; cls: string; icon: typeof ArrowUp }> = {
  improved:     { label: 'Improved',      cls: 'bg-emerald-100 text-emerald-900 border-emerald-300', icon: ArrowUp },
  dropped:      { label: 'Dropped',       cls: 'bg-red-100 text-red-900 border-red-300',             icon: ArrowDown },
  within_noise: { label: 'Within noise',  cls: 'bg-amber-100 text-amber-900 border-amber-300',       icon: CircleHelp },
  unchanged:    { label: 'No change',     cls: 'bg-muted text-muted-foreground border-border',       icon: Minus },
  only_after:   { label: 'New question',  cls: 'bg-sky-100 text-sky-900 border-sky-300',             icon: CircleHelp },
  only_before:  { label: 'Not re-asked',  cls: 'bg-muted text-muted-foreground border-border',       icon: CircleHelp },
};

function MoveChip({ movement, thin }: { movement: Movement; thin?: boolean }) {
  const s = MOVE_STYLE[movement];
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}>
      <Icon className="h-3 w-3" />
      {s.label}
      {/* A thin row says so on its face — the alternative is a green chip on two answer cells. */}
      {thin && movement !== 'only_before' && movement !== 'only_after' && <span className="opacity-70">· unproven</span>}
    </span>
  );
}

export default function CompareMeasurements() {
  const { auditId } = useParams<{ auditId: string }>();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState('');
  const [website, setWebsite] = useState('');
  const [runs, setRuns] = useState<RunLite[]>([]);
  const [rows, setRows] = useState<Array<QueueRowLite & { run_id: string }>>([]);
  const [beforeIds, setBeforeIds] = useState<Set<string>>(new Set());
  const [afterIds, setAfterIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!auditId) return;
    setIsLoading(true);
    setError(null);
    try {
      const client = supabase as unknown as typeof supabase;
      const { data: a, error: aErr } = await client
        .from('ai_audits')
        .select('id, business_name, website')
        .eq('id', auditId).maybeSingle();
      if (aErr) throw aErr;
      if (!a) { setError('No audit with that id.'); return; }
      const audit = a as { business_name: string; website: string | null };
      setBusinessName(audit.business_name ?? '');
      setWebsite(audit.website ?? '');

      /* EVERY AUDIT OF THIS BUSINESS, not just this one. A re-measure is often a NEW audit row (a
         re-audit copy), so restricting to one audit_id would hide exactly the runs the operator
         wants as the "after". Matched on the business name, which is what the copy carries. */
      const { data: sibs } = await client
        .from('ai_audits')
        .select('id')
        .eq('business_name', audit.business_name);
      const auditIds = Array.from(new Set([auditId, ...((sibs ?? []) as Array<{ id: string }>).map((s) => s.id)]));

      const { data: runData, error: rErr } = await client
        .from('ai_audit_runs')
        .select('id, run_number, status, created_at, audit_id')
        .in('audit_id', auditIds)
        .order('created_at', { ascending: true });
      if (rErr) throw rErr;

      /* Paginated for the same reason Baseline.tsx is: ai_audit_queue is questions x runs and
         PostgREST truncates at 1000 silently — a truncated page would shrink a denominator. */
      const { rows: qRows } = await fetchAllRows<QueueRowLite & { run_id: string }>('Compare (queue)', (from, to) =>
        client.from('ai_audit_queue')
          .select('run_id, question, engines, status, result')
          .in('audit_id', auditIds)
          .order('id', { ascending: true })
          .range(from, to));

      const perRun = new Map<string, number>();
      for (const r of qRows) perRun.set(r.run_id, (perRun.get(r.run_id) ?? 0) + 1);
      const runList: RunLite[] = ((runData ?? []) as Array<Omit<RunLite, 'questions'>>)
        .map((r) => ({ ...r, questions: perRun.get(r.id) ?? 0 }));

      setRuns(runList);
      setRows(qRows);

      /* THE DEFAULT IS EXPLAINABLE, NOT CLEVER: the oldest measured day against the newest measured
         day, counting usable runs only. Stated on screen so it is never mistaken for a judgement
         about which comparison is the right one — the operator reassigns freely. */
      const usable = runList.filter(isUsable);
      if (usable.length >= 2) {
        const days = Array.from(new Set(usable.map((r) => dayOf(r.created_at)))).sort();
        const first = days[0];
        const last = days[days.length - 1];
        if (first !== last) {
          setBeforeIds(new Set(usable.filter((r) => dayOf(r.created_at) === first).map((r) => r.id)));
          setAfterIds(new Set(usable.filter((r) => dayOf(r.created_at) === last).map((r) => r.id)));
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load that audit.');
    } finally {
      setIsLoading(false);
    }
  }, [auditId]);

  useEffect(() => { load(); }, [load]);

  const assign = (id: string, side: 'before' | 'after' | 'none') => {
    setBeforeIds((prev) => { const n = new Set(prev); side === 'before' ? n.add(id) : n.delete(id); return n; });
    setAfterIds((prev) => { const n = new Set(prev); side === 'after' ? n.add(id) : n.delete(id); return n; });
  };

  /* Earliest run on a side = when that measurement was taken. The fold cannot know this: it is
     handed queue rows, which carry no date. See MeasurementCompareTable's props. */
  const measuredAtOf = (ids: Set<string>): string | null => {
    const picked = runs.filter((r) => ids.has(r.id)).map((r) => r.created_at).sort();
    return picked[0] ?? null;
  };

  const comparison: MeasurementComparison | null = useMemo(() => {
    if (!beforeIds.size || !afterIds.size) return null;
    const before = rows.filter((r) => beforeIds.has(r.run_id));
    const after = rows.filter((r) => afterIds.has(r.run_id));
    return compareMeasurements(before, after, { businessName, ownWebsite: website });
  }, [rows, beforeIds, afterIds, businessName, website]);

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (error) {
    return (
      <div className="mx-auto max-w-2xl py-12 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" className="mt-4" onClick={load}>Try again</Button>
      </div>
    );
  }

  const usableRuns = runs.filter(isUsable);
  const skipped = runs.length - usableRuns.length;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to={`/baseline/${auditId}`}><ArrowLeft className="mr-1.5 h-4 w-4" /> Baseline</Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Before and after</h1>
          <p className="text-sm text-muted-foreground">{businessName || 'This business'}</p>
        </div>
      </div>

      {/* ── RUN PICKER ─────────────────────────────────────────────────────────── */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Which runs to compare</h2>
          <p className="text-xs text-muted-foreground">
            Defaults to the oldest measured day against the newest. Change it if that is not the comparison you want.
          </p>
        </div>
        {skipped > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {skipped} run{skipped === 1 ? '' : 's'} not listed — cancelled or failed runs hold no answers, so including
            one would shrink a denominator and flatter the result.
          </p>
        )}
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3">Run</th>
                <th className="py-2 pr-3">Measured</th>
                <th className="py-2 pr-3">Questions</th>
                <th className="py-2 pr-3">Before</th>
                <th className="py-2 pr-3">After</th>
              </tr>
            </thead>
            <tbody>
              {usableRuns.map((r) => {
                const inB = beforeIds.has(r.id);
                const inA = afterIds.has(r.id);
                return (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium">
                      #{r.run_number}
                      {r.audit_id !== auditId && (
                        <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">(other audit)</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{fmtDay(r.created_at)}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.questions}</td>
                    <td className="py-2 pr-3">
                      <input type="checkbox" className="h-4 w-4" checked={inB}
                        onChange={(e) => assign(r.id, e.target.checked ? 'before' : 'none')} />
                    </td>
                    <td className="py-2 pr-3">
                      <input type="checkbox" className="h-4 w-4" checked={inA}
                        onChange={(e) => assign(r.id, e.target.checked ? 'after' : 'none')} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {!comparison && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Tick at least one run as <span className="font-medium text-foreground">Before</span> and one as{' '}
          <span className="font-medium text-foreground">After</span>.
        </Card>
      )}

      {comparison && (
        <>
          {/* ── HEADLINE ─────────────────────────────────────────────────────────── */}
          <Card className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center gap-3">
              {comparison.movement === 'incomparable'
                ? <Badge variant="destructive">Cannot compare</Badge>
                : <MoveChip movement={comparison.movement} />}
              <span className="text-xs text-muted-foreground">
                Sampling swing between repeat measurements: ±{comparison.noiseBandPp} points
              </span>
            </div>
            <p className="mt-3 text-[1.05rem] font-medium leading-relaxed text-foreground">{comparison.headline}</p>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {([['Before', comparison.before], ['After', comparison.after]] as const).map(([label, side]) => (
                <div key={label} className="rounded-lg border bg-muted/30 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
                  <p className="mt-1.5 text-2xl font-bold tabular-nums">
                    {side.named} <span className="text-base font-medium text-muted-foreground">of {side.answered}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {side.ratePct === null ? 'nothing answered' : `${side.ratePct.toFixed(1)}% of answers`}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {side.questions} question{side.questions === 1 ? '' : 's'} · {side.runs} run{side.runs === 1 ? '' : 's'} ·
                    {' '}own site cited in {side.cited}
                  </p>
                </div>
              ))}
            </div>

            {comparison.unevenRuns && (
              <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                The two sides were measured a different number of times, so the honest figure is the
                <span className="font-semibold"> rate</span>, not the raw count. Both denominators are shown above and on every row.
              </p>
            )}
            {(comparison.onlyBefore.length > 0 || comparison.onlyAfter.length > 0) && (
              <p className="mt-3 text-xs text-muted-foreground">
                {comparison.matchedCount} question{comparison.matchedCount === 1 ? '' : 's'} asked both times.
                {comparison.onlyBefore.length > 0 && ` ${comparison.onlyBefore.length} not re-asked.`}
                {comparison.onlyAfter.length > 0 && ` ${comparison.onlyAfter.length} new this time.`}
                {' '}Only questions asked both times can move.
              </p>
            )}
          </Card>

          {/* ── SIDE BY SIDE, PER QUESTION ───────────────────────────────────────── */}
          {/* THE ALIGNED TABLE — shared with the AI Audit before/after view. It used to be
              written out inline here, which is why the other view had no table at all. */}
          <MeasurementCompareTable
            comparison={comparison}
            businessName={businessName}
            beforeMeasuredAt={measuredAtOf(beforeIds)}
            afterMeasuredAt={measuredAtOf(afterIds)}
          />

          <p className="pb-6 text-center text-xs text-muted-foreground">
            Movement smaller than ±{NOISE_BAND_PP} points is not presented as improvement. Repeat measurements with no
            work done between them swing by about that much.
          </p>
        </>
      )}
    </div>
  );
}
