/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE ALIGNED PER-QUESTION TABLE — one implementation, both before/after views.

   ⛔ WHY IT IS A COMPONENT AND NOT A SECOND TABLE. This markup lived inline in
   CompareMeasurements, and the AI Audit before/after view (ReportBeforeAfter) had NO per-question
   table at all — it showed the headline, a run picker, and two whole client reports side by side.
   Two independently rendered documents cannot line up row by row, which is exactly what Paul
   reported: "the same questions should align row-by-row and they don't". The fix is one joined
   table on both screens, not a copy of it on the second one.

   ⛔ EVERY NUMBER AND EVERY EXPORT COMES FROM THE SAME `comparison` OBJECT. The order control
   re-sorts (sortMeasurementQuestions is pure) and never re-folds, so what a CSV says and what the
   screen says cannot drift — which matters because the whole point is analysing the numbers
   somewhere else, where a discrepancy would be invisible.

   ⚠️ THE ORDER DEFAULT IS 'asked', DELIBERATELY. Movement order — wins first — is right for a
   client reading their report and wrong for analysis: it changes as the numbers change, so two
   viewings of one audit cannot be read against each other. Both are offered; the analysis one is
   the default.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Copy, Download, FileText } from 'lucide-react';
import {
  MEASUREMENT_ORDERS,
  MEASUREMENT_ORDER_LABELS,
  NOISE_BAND_PP,
  sortMeasurementQuestions,
  type MeasurementComparison,
  type MeasurementOrder,
  type Movement,
} from '@/lib/measurementCompare';
import {
  comparisonToCsv,
  comparisonToPrintableHtml,
  comparisonToTsv,
  exportFilename,
  type ExportMeta,
} from '@/lib/measurementExport';
import { downloadHtmlDocAsPdf } from '@/lib/aiAuditReportDownload';

const CHIP: Record<Movement, { label: string; cls: string }> = {
  improved: { label: 'improved', cls: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
  dropped: { label: 'dropped', cls: 'bg-red-100 text-red-900 border-red-300' },
  within_noise: { label: 'within noise', cls: 'bg-muted text-muted-foreground border-border' },
  unchanged: { label: 'unchanged', cls: 'bg-muted text-muted-foreground border-border' },
  only_before: { label: 'not re-asked', cls: 'bg-muted/50 text-muted-foreground border-border' },
  only_after: { label: 'new question', cls: 'bg-sky-100 text-sky-900 border-sky-300' },
};

function MoveChip({ movement, thin }: { movement: Movement; thin: boolean }) {
  const c = CHIP[movement];
  return (
    <span className="whitespace-nowrap">
      <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium ${c.cls}`}>
        {c.label}
      </span>
      {/* ⛔ THE PER-ROW "unproven" SUFFIX WAS REMOVED. On a real measurement nearly every row
          is thin — it printed on 12 of 12 — so it distinguished nothing and doubled the width of
          a column that already carried a verdict. It is stated ONCE under the table instead,
          and only when it is actually true of the rows on screen. */}
    </span>
  );
}

export function MeasurementCompareTable({
  comparison,
  businessName,
  beforeMeasuredAt,
  afterMeasuredAt,
}: {
  comparison: MeasurementComparison;
  businessName: string;
  /* ⛔ THE DATES COME FROM THE CALLER BECAUSE THE FOLD CANNOT KNOW THEM, AND EVERY EXPORT SAID
     "unknown date" UNTIL THIS WAS FOUND BY RUNNING IT ON REAL DATA. compareMeasurements is handed
     ai_audit_queue rows, and QueueRowLite carries no created_at — the dates live on ai_audit_runs,
     which only the page that picked the runs has. buildBaselineView takes an optional measuredAt
     and the fold never passes one, so comparison.before.measuredAt is structurally null.
     A file that cannot say WHEN it measured is not evidence of a change over time, which is the
     entire claim it exists to support. Optional, and it falls back to the fold's own value so a
     caller that has no dates still produces a valid file. */
  beforeMeasuredAt?: string | null;
  afterMeasuredAt?: string | null;
}) {
  const { toast } = useToast();
  const [order, setOrder] = useState<MeasurementOrder>('asked');
  const rows = useMemo(() => sortMeasurementQuestions(comparison.questions, order), [comparison, order]);

  /* Everything else in the meta comes off the comparison itself, so an export can never be
     stamped with figures that differ from the ones on screen. */
  const meta = (): ExportMeta => ({
    businessName,
    beforeMeasuredAt: beforeMeasuredAt ?? comparison.before.measuredAt,
    afterMeasuredAt: afterMeasuredAt ?? comparison.after.measuredAt,
    exportedAt: new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
  });

  const copyText = async () => {
    const m = meta();
    const text = comparisonToTsv(comparison, m, order);
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: 'Copied',
        description: `${rows.length} question${rows.length === 1 ? '' : 's'} plus the summary — paste straight into a sheet.`,
      });
    } catch {
      /* Clipboard can be refused (permissions, an insecure context). Never leave the operator
         thinking it worked: fall back to a download of the same text. */
      downloadBlob(text, exportFilename(businessName, m.exportedAt, 'txt'), 'text/plain;charset=utf-8');
      toast({
        title: 'Clipboard refused — downloaded instead',
        description: 'The browser blocked clipboard access, so the same text was saved as a .txt file.',
      });
    }
  };

  const downloadCsv = () => {
    const m = meta();
    /* ⛔ THE BOM IS LOAD-BEARING FOR EXCEL. Without it Excel reads the file as the system codepage
       and mangles every curly quote and pound sign in a question. Sheets ignores it. */
    downloadBlob(
      '﻿' + comparisonToCsv(comparison, m, order),
      exportFilename(businessName, m.exportedAt, 'csv'),
      'text/csv;charset=utf-8',
    );
    toast({ title: 'CSV saved', description: 'Rates, counts, denominators and the proven/noise flags.' });
  };

  const downloadPdf = () => {
    const m = meta();
    /* Same print path as the audit report — vector, selectable text, its own pagination. */
    downloadHtmlDocAsPdf(comparisonToPrintableHtml(comparison, m, order), businessName, 'before-after');
  };

  /* ⛔ A COLUMN OF ZEROES IS NOISE, SO IT IS NOT DRAWN. "Own site cited" read "0 → 0" on every
     row of a real measurement, which is a whole column of screen width spent saying nothing.
     ⚠️ IT IS HIDDEN, NOT DELETED, AND THE TEST IS "did anyone cite it", not "is it zero": the
     moment one row has a citation the column comes back for the whole table, so a real signal
     can never be hidden by this. The exports are untouched and always carry it. */
  const anyCited = rows.some((q) => (q.before?.cited ?? 0) > 0 || (q.after?.cited ?? 0) > 0);
  /* True when nothing on screen was answered often enough to stand on its own. Said once,
     under the table, instead of on all twelve rows. */
  const allThin = rows.length > 0 && rows.every(
    (q) => q.thin || q.movement === 'only_before' || q.movement === 'only_after',
  );

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Question by question</h2>
          <p className="mt-1 text-xs text-muted-foreground">Same question, before and after.</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center rounded-md border border-border/60 overflow-hidden">
            {MEASUREMENT_ORDERS.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setOrder(o)}
                title={o === 'asked'
                  ? 'The order the questions were asked — stable, so two exports of the same audit can be read against each other'
                  : 'Biggest movers first — the order a client reads their report in'}
                className={`h-7 px-2 text-[11px] font-medium transition ${
                  order === o ? 'bg-primary text-primary-foreground' : 'bg-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                {MEASUREMENT_ORDER_LABELS[o]}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={copyText}>
            <Copy className="h-3.5 w-3.5" /> Copy
          </Button>
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={downloadCsv}>
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={downloadPdf}>
            <FileText className="h-3.5 w-3.5" /> PDF
          </Button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-3">Question</th>
              <th className="py-2 pr-3 text-right">Before</th>
              <th className="py-2 pr-3 text-right">After</th>
              <th className="py-2 pr-3 text-right">Change</th>
              {anyCited && <th className="py-2 pr-3 text-right">Own site cited</th>}
              <th className="py-2">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((q) => (
              <tr key={q.question} className="border-b last:border-0 align-top">
                <td className="py-2.5 pr-3 max-w-[300px]">{q.question}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums text-muted-foreground">
                  {q.before ? (
                    <>
                      {q.before.named} of {q.before.answered}
                      {q.before.ratePct !== null && (
                        <span className="ml-1 text-xs">({q.before.ratePct.toFixed(0)}%)</span>
                      )}
                    </>
                  ) : '—'}
                </td>
                <td className="py-2.5 pr-3 text-right tabular-nums font-medium">
                  {q.after ? (
                    <>
                      {q.after.named} of {q.after.answered}
                      {q.after.ratePct !== null && (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">({q.after.ratePct.toFixed(0)}%)</span>
                      )}
                    </>
                  ) : '—'}
                </td>
                <td className="py-2.5 pr-3 text-right tabular-nums">
                  {/* ⛔ THE RATE LEADS, NOT THE RAW COUNT. With uneven denominators — 1 of 2
                      before against 6 of 8 after — "+5" is arithmetically true and reads as five
                      times better, when the honest movement is +25 points. The raw counts are
                      still on the row, in the Before and After columns where they belong. */}
                  {q.ratePpDelta === null
                    ? (q.namedDelta === null ? '—' : `${q.namedDelta > 0 ? '+' : ''}${q.namedDelta}`)
                    : `${q.ratePpDelta > 0 ? '+' : ''}${q.ratePpDelta.toFixed(0)}pp`}
                </td>
                {anyCited && (
                  <td className="py-2.5 pr-3 text-right tabular-nums text-muted-foreground">
                    {q.before && q.after ? `${q.before.cited} → ${q.after.cited}` : '—'}
                  </td>
                )}
                <td className="py-2"><MoveChip movement={q.movement} thin={q.thin} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {allThin
          ? `No single question here was answered enough times to prove a change on its own — the claim is the overall figure. `
          : ''}
        Movement under ±{NOISE_BAND_PP} points is not called improvement: repeat measurements with no work done swing
        by about that much. The exports carry the same flags.
      </p>
    </Card>
  );
}

/** Save a string as a file. Browser-only, and the one piece of this feature that touches the DOM
 *  outside the print helper. */
function downloadBlob(text: string, filename: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  /* Revoked on the next tick, not immediately: Safari cancels an in-flight download whose object
     URL is released synchronously. */
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
