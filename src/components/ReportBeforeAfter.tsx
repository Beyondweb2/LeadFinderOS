/* ============================================================
   THE CLIENT REPORT, BEFORE AND AFTER, SIDE BY SIDE.

   A mode on the client report view, not a separate screen: the single report stays the default and
   this is reached by a toggle in its toolbar, so the before/after lives where the report the
   operator actually sends lives.

   ⛔ BOTH SIDES ARE THE REAL DOCUMENT, RENDERED SMALL — not a summary of it. Each column is the
   SAME renderReportHtml output the client receives, in its own iframe at the design width (760px
   sheet), uniformly scaled down. Rendering a narrow variant instead would let the two sides differ
   by LAYOUT, so a difference you could see might not be a difference in the measurement. Identical
   scale on both sides means every visible difference is a content difference.

   ⛔ AND THE NOISE BAND TRAVELS WITH IT. compareMeasurements' headline sits above the two columns,
   so the movement is stated with its ±NOISE_BAND_PP qualification in the same glance as the two
   documents. A pair of reports side by side is extremely persuasive on its own; without the band a
   3-point drift would read as proof. This is the one thing not to remove.

   ⚠️ The comparison and the two reports are built from the SAME rows and the SAME split, so the
   headline can never describe a different pair of runs from the documents underneath it.
   ============================================================ */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Loader2, ArrowUp, ArrowDown, Minus, CircleHelp, SlidersHorizontal } from 'lucide-react';
import { renderReportHtml, type AiAuditReportData } from '@/lib/aiAuditReportHtml';
import type { QueueRow, RunRow } from '@/lib/auditReport';
import type { QueueRowLite } from '@/lib/baselineView';
import { compareMeasurements, type MeasurementComparison, type Movement } from '@/lib/measurementCompare';

/** The sheet's own design width plus its 24px auto margins — see aiAuditReportHtml's `.sheet`. */
const DESIGN_WIDTH = 812;

/** One fetch feeds BOTH the comparison (needs run_id + engines) and buildReportData (needs id). */
type Row = QueueRow & QueueRowLite & { run_id: string };

interface RunLite {
  id: string;
  run_number: number;
  status: string;
  created_at: string;
  audit_id: string;
  mention_rate: number | null;
  results: unknown;
  questions: number;
}

const dayOf = (iso: string) => iso.slice(0, 10);
const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/* Cancelled and failed runs hold no answers, so including one would shrink a denominator and
   flatter the result. Same rule as the operator comparison view. */
const isUsable = (r: { status: string }) => r.status === 'complete' || r.status === 'capped';

const MOVE_STYLE: Record<Movement, { label: string; cls: string; icon: typeof ArrowUp }> = {
  improved:     { label: 'Improved',     cls: 'bg-emerald-100 text-emerald-900 border-emerald-300', icon: ArrowUp },
  dropped:      { label: 'Dropped',      cls: 'bg-red-100 text-red-900 border-red-300',             icon: ArrowDown },
  within_noise: { label: 'Within noise', cls: 'bg-amber-100 text-amber-900 border-amber-300',       icon: CircleHelp },
  unchanged:    { label: 'No change',    cls: 'bg-muted text-muted-foreground border-border',       icon: Minus },
  only_after:   { label: 'New question', cls: 'bg-sky-100 text-sky-900 border-sky-300',             icon: CircleHelp },
  only_before:  { label: 'Not re-asked', cls: 'bg-muted text-muted-foreground border-border',       icon: CircleHelp },
};

/**
 * One report, rendered at its true design width and scaled to fit the column.
 * ⚠️ Scale comes from the CONTAINER, measured — not a hardcoded factor — so the two columns are
 * always the same size as each other whatever the window does.
 */
function ScaledReport({ html, label, tone }: { html: string; label: string; tone: 'before' | 'after' }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(0.5);
  const [docHeight, setDocHeight] = useState(1400);

  const measure = useCallback(() => {
    const w = wrapRef.current?.clientWidth ?? 0;
    if (w > 0) setScale(w / DESIGN_WIDTH);
    const doc = frameRef.current?.contentWindow?.document;
    if (doc) setDocHeight(doc.documentElement.scrollHeight);
  }, []);

  useEffect(() => {
    measure();
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, html]);

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-baseline gap-2">
        <span className={`rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] ${
          tone === 'before' ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'
        }`}>{tone}</span>
        <span className="truncate text-xs text-muted-foreground">{label}</span>
      </div>
      {/* The wrapper owns the visible box; the iframe inside is full-size and scaled into it. */}
      <div
        ref={wrapRef}
        className="overflow-hidden rounded-lg border border-border bg-white"
        style={{ height: docHeight * scale }}
      >
        <iframe
          ref={frameRef}
          title={`AI Visibility Report — ${tone}`}
          srcDoc={html}
          onLoad={measure}
          scrolling="no"
          style={{
            width: DESIGN_WIDTH,
            height: docHeight,
            border: 0,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        />
      </div>
    </div>
  );
}

export function ReportBeforeAfter({
  auditId, businessName, ownWebsite, buildData, onBack,
}: {
  auditId: string;
  businessName: string;
  ownWebsite: string;
  /** Injected by the parent so BOTH sides are built with the SAME options the single report uses —
   *  the opts live in one place and cannot drift between the three views. */
  buildData: (rows: QueueRow[], run: RunRow | null) => AiAuditReportData | null;
  onBack: () => void;
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunLite[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [beforeIds, setBeforeIds] = useState<Set<string>>(new Set());
  const [afterIds, setAfterIds] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const client = supabase as unknown as typeof supabase;
      /* EVERY AUDIT OF THIS BUSINESS. A re-measure is usually a NEW audit row (reAuditFromSource
         mints a copy), so restricting to this audit_id would hide the runs the operator wants as
         the "after". */
      const { data: sibs } = await client.from('ai_audits').select('id').eq('business_name', businessName);
      const auditIds = Array.from(new Set([auditId, ...((sibs ?? []) as Array<{ id: string }>).map((s) => s.id)]));

      const { data: runData, error: rErr } = await client
        .from('ai_audit_runs')
        .select('id, run_number, status, created_at, audit_id, mention_rate, results')
        .in('audit_id', auditIds)
        .order('created_at', { ascending: true });
      if (rErr) throw rErr;

      /* Paginated: ai_audit_queue is questions x runs and PostgREST truncates at 1000 silently. A
         truncated page would shrink a denominator and make the after look better than it is. */
      const { rows: qRows } = await fetchAllRows<Row>('Report before/after (queue)', (from, to) =>
        client.from('ai_audit_queue')
          .select('id, run_id, question, engines, status, result')
          .in('audit_id', auditIds)
          .order('id', { ascending: true })
          .range(from, to));

      const perRun = new Map<string, number>();
      for (const r of qRows) perRun.set(r.run_id, (perRun.get(r.run_id) ?? 0) + 1);
      const runList: RunLite[] = ((runData ?? []) as Array<Omit<RunLite, 'questions'>>)
        .map((r) => ({ ...r, questions: perRun.get(r.id) ?? 0 }));
      setRuns(runList);
      setRows(qRows);

      /* Default: the oldest measured day against the newest, usable runs only. Explainable rather
         than clever, and stated on screen — the operator reassigns freely. */
      const usable = runList.filter(isUsable);
      const days = Array.from(new Set(usable.map((r) => dayOf(r.created_at)))).sort();
      if (days.length >= 2) {
        const first = days[0];
        const last = days[days.length - 1];
        setBeforeIds(new Set(usable.filter((r) => dayOf(r.created_at) === first).map((r) => r.id)));
        setAfterIds(new Set(usable.filter((r) => dayOf(r.created_at) === last).map((r) => r.id)));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the runs for this business.');
    } finally {
      setIsLoading(false);
    }
  }, [auditId, businessName]);

  useEffect(() => { load(); }, [load]);

  const assign = (id: string, side: 'before' | 'after' | 'none') => {
    setBeforeIds((prev) => { const n = new Set(prev); if (side === 'before') n.add(id); else n.delete(id); return n; });
    setAfterIds((prev) => { const n = new Set(prev); if (side === 'after') n.add(id); else n.delete(id); return n; });
  };

  const split = useMemo(() => {
    const before = rows.filter((r) => beforeIds.has(r.run_id));
    const after = rows.filter((r) => afterIds.has(r.run_id));
    const newestOf = (ids: Set<string>) => runs
      .filter((r) => ids.has(r.id))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .slice(-1)[0] ?? null;
    return { before, after, beforeRun: newestOf(beforeIds), afterRun: newestOf(afterIds) };
  }, [rows, runs, beforeIds, afterIds]);

  const comparison: MeasurementComparison | null = useMemo(() => {
    if (!split.before.length || !split.after.length) return null;
    return compareMeasurements(split.before, split.after, { businessName, ownWebsite });
  }, [split, businessName, ownWebsite]);

  /* ⛔ CLIENT VERSION ON BOTH SIDES. `internal: false` is forced here rather than inherited: the
     internal build carries winnability annotations, and this is the view most likely to be turned
     towards a client. The single-report view keeps its own Client/Internal toggle. */
  const beforeHtml = useMemo(() => {
    const d = split.before.length ? buildData(split.before, split.beforeRun as RunRow | null) : null;
    return d ? renderReportHtml({ ...d, internal: false }) : null;
  }, [split, buildData]);
  const afterHtml = useMemo(() => {
    const d = split.after.length ? buildData(split.after, split.afterRun as RunRow | null) : null;
    return d ? renderReportHtml({ ...d, internal: false }) : null;
  }, [split, buildData]);

  if (isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const usableRuns = runs.filter(isUsable);
  const dateLabel = (ids: Set<string>) => {
    const sel = usableRuns.filter((r) => ids.has(r.id));
    if (!sel.length) return 'nothing selected';
    const days = Array.from(new Set(sel.map((r) => dayOf(r.created_at)))).sort();
    const span = days.length === 1 ? fmtDay(sel[0].created_at) : `${fmtDay(sel[0].created_at)} – ${fmtDay(sel[sel.length - 1].created_at)}`;
    return `${span} · ${sel.length} run${sel.length === 1 ? '' : 's'}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={onBack}>
          <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to the report
        </Button>
        <Button variant="outline" size="sm" onClick={() => setPickerOpen((v) => !v)}>
          <SlidersHorizontal className="mr-2 h-4 w-4" /> {pickerOpen ? 'Hide runs' : 'Choose runs'}
        </Button>
      </div>

      {error && (
        <Card className="p-4 text-sm text-muted-foreground">
          {error} <Button variant="outline" size="sm" className="ml-2" onClick={load}>Try again</Button>
        </Card>
      )}

      {/* ── THE MOVEMENT, WITH ITS QUALIFICATION ─────────────────────────────── */}
      {comparison && (
        <Card className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-3">
            {comparison.movement === 'incomparable' ? (
              <span className="rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-900">
                Cannot compare
              </span>
            ) : (() => {
              const s = MOVE_STYLE[comparison.movement];
              const Icon = s.icon;
              return (
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${s.cls}`}>
                  <Icon className="h-3 w-3" /> {s.label}
                </span>
              );
            })()}
            <span className="text-xs text-muted-foreground">
              Sampling swing between repeat measurements: ±{comparison.noiseBandPp} points
            </span>
          </div>
          <p className="mt-2.5 text-[1.02rem] font-medium leading-relaxed">{comparison.headline}</p>
          {comparison.unevenRuns && (
            <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
              The two sides were measured a different number of times, so the honest figure is the
              <span className="font-semibold"> rate</span>, not the raw count.
            </p>
          )}
          {(comparison.onlyBefore.length > 0 || comparison.onlyAfter.length > 0) && (
            <p className="mt-2 text-xs text-muted-foreground">
              {comparison.matchedCount} question{comparison.matchedCount === 1 ? '' : 's'} asked both times.
              {comparison.onlyBefore.length > 0 && ` ${comparison.onlyBefore.length} not re-asked.`}
              {comparison.onlyAfter.length > 0 && ` ${comparison.onlyAfter.length} new this time.`}
              {' '}Only questions asked both times can move.
            </p>
          )}
        </Card>
      )}

      {/* ── RUN PICKER (collapsed by default — the documents are the point) ───── */}
      {pickerOpen && (
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">
            Defaults to the oldest measured day against the newest. Cancelled and failed runs are not
            listed — they hold no answers.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
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
                {usableRuns.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-medium">
                      #{r.run_number}
                      {r.audit_id !== auditId && <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">(other audit)</span>}
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{fmtDay(r.created_at)}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.questions}</td>
                    <td className="py-2 pr-3">
                      <input type="checkbox" className="h-4 w-4" checked={beforeIds.has(r.id)}
                        onChange={(e) => assign(r.id, e.target.checked ? 'before' : 'none')} />
                    </td>
                    <td className="py-2 pr-3">
                      <input type="checkbox" className="h-4 w-4" checked={afterIds.has(r.id)}
                        onChange={(e) => assign(r.id, e.target.checked ? 'after' : 'none')} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!comparison && !error && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Pick at least one run as <span className="font-medium text-foreground">Before</span> and one as{' '}
          <span className="font-medium text-foreground">After</span> under “Choose runs”.
        </Card>
      )}

      {/* ── THE TWO DOCUMENTS ────────────────────────────────────────────────── */}
      {(beforeHtml || afterHtml) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {beforeHtml
            ? <ScaledReport html={beforeHtml} tone="before" label={dateLabel(beforeIds)} />
            : <Card className="p-6 text-center text-sm text-muted-foreground">No before report to build.</Card>}
          {afterHtml
            ? <ScaledReport html={afterHtml} tone="after" label={dateLabel(afterIds)} />
            : <Card className="p-6 text-center text-sm text-muted-foreground">No after report to build.</Card>}
        </div>
      )}

      <p className="pb-6 text-center text-xs text-muted-foreground">
        Both sides are the client report at the same reduced scale, so every visible difference is a
        difference in the measurement. Movement smaller than the swing band above is not presented as
        improvement.
      </p>
    </div>
  );
}
