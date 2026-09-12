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
import { useToast } from '@/hooks/use-toast';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Loader2, ArrowUp, ArrowDown, Minus, CircleHelp, SlidersHorizontal } from 'lucide-react';
import { renderReportHtml, type AiAuditReportData } from '@/lib/aiAuditReportHtml';
import type { QueueRow, RunRow } from '@/lib/auditReport';
import type { QueueRowLite } from '@/lib/baselineView';
import { compareMeasurements, type MeasurementComparison, type Movement } from '@/lib/measurementCompare';
import { MeasurementCompareTable } from '@/components/MeasurementCompareTable';
import { usePersistedState } from '@/hooks/usePersistedState';
import {
  defaultSelection,
  groupMeasurementRuns,
  pruneSelection,
  sideCellsPerQuestion,
  sideProvable,
} from '@/lib/measurementRunGroups';

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
  const [auditRows, setAuditRows] = useState<Array<{ id: string; baseline_target_runs: number | null }>>([]);
  const [rows, setRows] = useState<Row[]>([]);
  /* ⛔ THE SELECTION SURVIVES LEAVING THE PAGE. AppLayout remounts on every navigation
     (CLAUDE.md §6c), so this Set state was rebuilt from the day-split default on every visit and
     the operator re-picked runs each time.
     ⚠️ ONE RECORD KEYED BY AUDIT, not one storage key per audit: usePersistedState binds its
     key ONCE for the hook's lifetime, so a key built from a changing auditId would keep writing
     into the first audit's slot. tier 'both' (localStorage) because re-picking six runs is exactly
     the work a closed tab should not cost. Arrays, not Sets - a Set does not survive JSON. */
  const [savedPicks, setSavedPicks] = usePersistedState<Record<string, { before: string[]; after: string[] }>>(
    'before-after-picks', {}, { tier: 'both', version: 1 },
  );
  const [beforeIds, setBeforeIds] = useState<Set<string>>(new Set());
  const [afterIds, setAfterIds] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  /* Shown on screen: an operator should be able to see that the runs on display came from their
     last visit rather than from the default, or they cannot tell the feature is working. State,
     not a ref - a ref would not re-render. */
  const [restoredSelection, setRestoredSelection] = useState(false);
  /* Which rule pre-ticked these runs. Shown in the picker: a default nobody can explain is one
     nobody trusts, and this one deliberately skips the oldest day. */
  const [defaultNote, setDefaultNote] = useState<string | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const client = supabase as unknown as typeof supabase;
      /* EVERY AUDIT OF THIS BUSINESS. A re-measure is usually a NEW audit row (reAuditFromSource
         mints a copy), so restricting to this audit_id would hide the runs the operator wants as
         the "after". */
      /* baseline_target_runs + is_measurement ride along so the picker can say "3 of 3 runs" and
         flag a group that holds FEWER runs than its audit was configured for. Without the target
         a 1-run side is indistinguishable from a complete measurement in the list. */
      /* ⚠️ is_measurement EXISTS IN THE DATABASE BUT NOT IN THE GENERATED TYPES, so selecting it
         fails typecheck. baseline_target_runs > 1 is the same signal for this purpose (a paid
         baseline repeats too, and the grouper infers isMeasurement from the target), so the
         picker asks only for what the types know about rather than casting through unknown. */
      const { data: sibs } = await client.from('ai_audits')
        .select('id, baseline_target_runs').eq('business_name', businessName);
      const sibRows = (sibs ?? []) as Array<{ id: string; baseline_target_runs: number | null }>;
      setAuditRows(sibRows);
      const auditIds = Array.from(new Set([auditId, ...sibRows.map((s) => s.id)]));

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

      /* ⛔ A SAVED SELECTION WINS OVER THE DEFAULT, AND IS PRUNED AGAINST WHAT ACTUALLY LOADED.
         A stale run id — deleted, or belonging to an audit no longer returned — is DROPPED, never
         kept: keeping it would build a side out of fewer runs than the screen shows ticked, which
         is the "3-run comparison that is really a 2-run one" this whole feature exists to expose.
         When anything was dropped the picker is opened, so the operator sees what is really
         selected rather than trusting a restored state that quietly changed underneath them. */
      const live = new Set(usable.map((r) => r.id));
      const saved = savedPicks[auditId];
      const savedBefore = saved ? pruneSelection(saved.before, live) : [];
      const savedAfter = saved ? pruneSelection(saved.after, live) : [];
      if (savedBefore.length > 0 || savedAfter.length > 0) {
        setBeforeIds(new Set(savedBefore));
        setAfterIds(new Set(savedAfter));
        setRestoredSelection(true);
        const dropped = (saved.before.length + saved.after.length) - (savedBefore.length + savedAfter.length);
        if (dropped > 0) setPickerOpen(true);
        return;
      }

      /* ⛔ DEFAULT TO THE COMPLETE MEASUREMENTS, NOT THE OLDEST AND NEWEST DAYS. RG is the proof:
         his oldest day is a 1-run, 3-QUESTION prospecting probe and his newest is a single run
         appended to a measurement audit, so the old default compared a 3-question probe against
         one run and could prove nothing — while the two real 12-question 3-run measurements sat in
         the middle, never picked. defaultSelection prefers groups that repeated as their audit
         intended, and returns a note naming the rule it used. */
      const preset = defaultSelection(groupMeasurementRuns(usable, sibRows));
      setBeforeIds(new Set(preset.before));
      setAfterIds(new Set(preset.after));
      setDefaultNote(preset.before.length > 0 ? preset.note : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the runs for this business.');
    } finally {
      setIsLoading(false);
    }
    /* savedPicks is a dependency because the restore READS it. Omitting it would restore from
       whatever the first render happened to hold - the stale-closure shape CLAUDE.md records. */
  }, [auditId, businessName, savedPicks]);

  useEffect(() => { load(); }, [load]);

  /* ⚠️ PERSISTED FROM THE NEXT STATE, NOT FROM THE CURRENT ONE. Reading beforeIds/afterIds here
     would save the values from before this click - React state is async, and the same
     stale-closure trap the questionnaire's consent button already documents. Both sides are
     computed locally and then written once. */
  const persist = (b: Set<string>, a: Set<string>) => {
    setSavedPicks((prev) => ({ ...prev, [auditId]: { before: [...b], after: [...a] } }));
  };

  const assign = (id: string, side: 'before' | 'after' | 'none') => {
    const b = new Set(beforeIds); const a = new Set(afterIds);
    if (side === 'before') { b.add(id); a.delete(id); }
    else if (side === 'after') { a.add(id); b.delete(id); }
    else { b.delete(id); a.delete(id); }
    setBeforeIds(b); setAfterIds(a); persist(b, a);
  };

  /* Tick a whole measurement in one press - the reason the groups exist. */
  const assignGroup = (runIds: string[], side: 'before' | 'after' | 'none') => {
    const b = new Set(beforeIds); const a = new Set(afterIds);
    for (const id of runIds) {
      if (side === 'before') { b.add(id); a.delete(id); }
      else if (side === 'after') { a.add(id); b.delete(id); }
      else { b.delete(id); a.delete(id); }
    }
    setBeforeIds(b); setAfterIds(a); persist(b, a);
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

  /* Runs grouped into measurements (audit × DAY - see measurementRunGroups for why not by audit
     alone: RG's measurement audit holds five runs across three dates). */
  const groups = useMemo(() => groupMeasurementRuns(usableRuns, auditRows), [usableRuns, auditRows]);
  const sideOfGroup = (runIds: string[]): 'before' | 'after' | 'mixed' | 'none' => {
    const b = runIds.filter((id) => beforeIds.has(id)).length;
    const a = runIds.filter((id) => afterIds.has(id)).length;
    if (b === runIds.length) return 'before';
    if (a === runIds.length) return 'after';
    return b + a === 0 ? 'none' : 'mixed';
  };
  /* Answer cells per question a side currently contributes - the number that decides whether a
     per-question claim is possible at all. Counted from the TICKED runs, not from whole groups,
     so a half-ticked group is reported honestly. */
  const cellsFor = (side: 'before' | 'after'): number => {
    const ids = side === 'before' ? beforeIds : afterIds;
    return sideCellsPerQuestion(groups.map((g) => ({
      ...g, cellsPerQuestion: g.runIds.filter((id) => ids.has(id)).length * 2,
    })));
  };
  /* The EARLIEST run on a side is when that measurement was taken — a side spanning two days
     (real: ABLM's before is four runs over several days) is dated by when it started, and the run
     count beside it in the export header says it was more than one. */
  const measuredAtOf = (ids: Set<string>): string | null => {
    const picked = runs.filter((r) => ids.has(r.id)).map((r) => r.created_at).sort();
    return picked[0] ?? null;
  };

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

      {/* ── MEASUREMENT PICKER (collapsed by default — the documents are the point) ─────
          ⛔ GROUPED, WITH RUN COUNTS ON THE FACE. It used to list runs flat as #1 #2 #3 with no
          indication of which belonged to one measurement or how many runs an audit was configured
          for — so a 3-run day and a single appended run looked identical, and comparing them
          produced "within noise — not proven" that read as a broken run-count setting. Each group
          is one measurement (audit × day) and ticks in a single press. */}
      {pickerOpen && (
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">
            Each row is one measurement — all the runs of one audit on one day. Tick a whole
            measurement as Before or After.{' '}
            {restoredSelection
              ? 'Showing the selection you left last time.'
              : (defaultNote ?? 'Nothing pre-selected.')}{' '}
            Cancelled and failed runs are not listed, because they hold no answers.
          </p>

          {/* The two numbers that decide whether the comparison can prove anything. */}
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {(['before', 'after'] as const).map((side) => {
              const cells = cellsFor(side);
              const runsPicked = cells / 2;
              const provable = sideProvable(cells);
              return (
                <span
                  key={side}
                  className={`rounded-md border px-2 py-1 ${provable ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-amber-300 bg-amber-50 text-amber-900'}`}
                  title={provable
                    ? 'Enough answer cells for per-question movement to be provable on this side'
                    : 'Under 4 answer cells per question — every row will read "unproven" whatever it shows, because one run of one question is only two cells'}
                >
                  <span className="font-medium capitalize">{side}</span>: {runsPicked} run{runsPicked === 1 ? '' : 's'} · {cells} cell{cells === 1 ? '' : 's'}/question
                  {!provable && ' — too thin to prove a question'}
                </span>
              );
            })}
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3">Measurement</th>
                  <th className="py-2 pr-3">Runs</th>
                  <th className="py-2 pr-3">Questions</th>
                  <th className="py-2 pr-3">Side</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  const side = sideOfGroup(g.runIds);
                  return (
                    <tr key={g.key} className="border-b last:border-0 align-top">
                      <td className="py-2.5 pr-3">
                        <div className="font-medium">{fmtDay(g.firstAt)}</div>
                        <div className="text-[11px] text-muted-foreground">
                          run{g.runNumbers.length === 1 ? '' : 's'} #{g.runNumbers.join(', #')}
                          {g.auditId !== auditId && ' · another audit of this business'}
                          {g.isMeasurement && ' · measurement'}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3">
                        <span className={`tabular-nums font-medium ${g.runCount >= 3 ? '' : 'text-amber-700'}`}>
                          {g.runCount}
                        </span>
                        {g.targetRuns !== null && (
                          <span className="ml-1 text-[11px] text-muted-foreground">of {g.targetRuns}</span>
                        )}
                        {/* ⛔ THE WARNING THAT WOULD HAVE SAVED A WEEK: this group holds fewer runs
                            than its own audit was configured to make. */}
                        {g.shortfall && (
                          <div className="text-[11px] text-amber-700">short of its {g.targetRuns}-run config</div>
                        )}
                        <div className="text-[11px] text-muted-foreground">{g.cellsPerQuestion} cells/question</div>
                      </td>
                      <td className="py-2.5 pr-3 tabular-nums text-muted-foreground">{g.questions || '—'}</td>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center rounded-md border border-border/60 overflow-hidden w-fit">
                          {([['before', 'Before'], ['after', 'After'], ['none', 'Neither']] as const).map(([v, label]) => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => assignGroup(g.runIds, v)}
                              className={`h-7 px-2 text-[11px] font-medium transition ${
                                side === v
                                  ? (v === 'before' ? 'bg-slate-700 text-white' : v === 'after' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground')
                                  : 'bg-transparent text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        {side === 'mixed' && (
                          <div className="mt-1 text-[11px] text-amber-700">
                            some of these runs are on the other side — press one of the three to make it whole
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Your selection is remembered per audit, so leaving this page and coming back keeps it.
            Ticking several measurements on one side pools their runs — two 1-run days make a 4-cell
            side, which is enough to prove a question.
          </p>
        </Card>
      )}

      {!comparison && !error && (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Pick at least one run as <span className="font-medium text-foreground">Before</span> and one as{' '}
          <span className="font-medium text-foreground">After</span> under “Choose runs”.
        </Card>
      )}

      {/* ── THE ALIGNED PER-QUESTION TABLE ───────────────────────────────────────
          ⛔ THIS VIEW HAD NO PER-QUESTION TABLE AT ALL. It showed the headline, the run picker
          and then the two client reports side by side - two independently laid-out documents,
          whose question lists therefore could not line up row by row. That is what made
          like-for-like reading impossible. The joined table goes ABOVE the documents because it
          is the thing being compared; the documents stay for eyeballing the client's-eye view. */}
      {comparison && comparison.questions.length > 0 && (
        <MeasurementCompareTable
          comparison={comparison}
          businessName={businessName}
          beforeMeasuredAt={measuredAtOf(beforeIds)}
          afterMeasuredAt={measuredAtOf(afterIds)}
        />
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
