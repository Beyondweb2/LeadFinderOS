/* ════════════════════════════════════════════════════════════════════════════════════════════════
   GETTING THE BEFORE/AFTER DATA OUT — CSV, clipboard text, and the analysis PDF.

   ⛔ ONE SET OF ROWS FEEDS ALL THREE, AND THAT IS THE POINT. `exportRows` is built once from the
   comparison and the CSV, the TSV and the PDF all render it. Three renderers reading the same
   comparison independently is how a spreadsheet ends up disagreeing with the screen it was
   exported from — and the whole reason Paul wants this is to analyse the numbers away from the
   app, where a discrepancy would be invisible.

   🔴 THE QUALIFICATIONS TRAVEL WITH THE NUMBERS. A CSV of bare counts is exactly where a ±5-point
   sampling swing gets read as improvement, and per-question movement is almost never provable at
   all (two engines × one run = 2 cells; the measured swing was established over 60). So every row
   carries `verdict` AND `proven` AND both denominators, the header block carries the noise band
   and the uneven-sampling warning, and nothing is rounded to a shape that implies more precision
   than the measurement has. Strip those columns and the file stops being evidence — say so rather
   than quietly emitting a tidier sheet.

   ⚠️ RATES ARE THE HONEST FIGURE, COUNTS ARE NOT, because the two sides routinely have different
   denominators (measured on ABLM: 8 cells per question before, 2 after). Both are exported —
   counts because they are what a person recognises, rates because they are what compares — and
   the denominator sits beside each count so a reader cannot take "0 → 2" for a doubling.

   PURE. No document, no window, no Supabase: strings in, strings out, so the whole thing is
   drivable from a test. The browser-only parts (clipboard, file download, print) live in the
   component that calls this.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  sortMeasurementQuestions,
  type MeasurementComparison,
  type MeasurementOrder,
  type Movement,
  type QuestionMovement,
  type SideCounts,
} from './measurementCompare';

/** What each verdict means in a file that has no colour and no tooltips. */
export const MOVEMENT_EXPORT_LABELS: Record<Movement, string> = {
  improved: 'improved',
  dropped: 'dropped',
  within_noise: 'within noise - not proven',
  unchanged: 'unchanged',
  only_before: 'not re-asked',
  only_after: 'new question',
};

export interface ExportMeta {
  businessName: string;
  /** Absolute, so a file read in six months still says what it measured. */
  beforeMeasuredAt: string | null;
  afterMeasuredAt: string | null;
  exportedAt: string;
}

/** One row per question, already flattened to strings-or-numbers. */
export interface ExportRow {
  question: string;
  beforeNamed: number | null;
  beforeAnswered: number | null;
  beforeRatePct: number | null;
  afterNamed: number | null;
  afterAnswered: number | null;
  afterRatePct: number | null;
  namedDelta: number | null;
  ratePpDelta: number | null;
  citedBefore: number | null;
  citedAfter: number | null;
  verdict: string;
  /** False when either side is too thin to support a per-question claim. */
  proven: boolean;
  /** True when the two sides sampled this question a different number of times. */
  unevenSampling: boolean;
}

const COLUMNS: Array<{ key: keyof ExportRow; head: string }> = [
  { key: 'question', head: 'Question' },
  { key: 'beforeNamed', head: 'Before named' },
  { key: 'beforeAnswered', head: 'Before answers' },
  { key: 'beforeRatePct', head: 'Before rate %' },
  { key: 'afterNamed', head: 'After named' },
  { key: 'afterAnswered', head: 'After answers' },
  { key: 'afterRatePct', head: 'After rate %' },
  { key: 'namedDelta', head: 'Named change' },
  { key: 'ratePpDelta', head: 'Rate change (pp)' },
  { key: 'citedBefore', head: 'Own site cited before' },
  { key: 'citedAfter', head: 'Own site cited after' },
  { key: 'verdict', head: 'Verdict' },
  { key: 'proven', head: 'Proven' },
  { key: 'unevenSampling', head: 'Uneven sampling' },
];

/** One decimal on a rate. Percentages are derived from small denominators; more digits would
 *  imply precision the measurement does not have, and integers would hide 1-of-3 vs 1-of-4. */
const rate = (v: number | null): number | null => (v === null ? null : Math.round(v * 10) / 10);

const side = (s: SideCounts | null) => ({
  named: s ? s.named : null,
  answered: s ? s.answered : null,
  ratePct: rate(s ? s.ratePct : null),
  cited: s ? s.cited : null,
});

/** Flatten a comparison into export rows, in the requested order. */
export function exportRows(
  comparison: MeasurementComparison,
  order: MeasurementOrder = 'asked',
): ExportRow[] {
  return sortMeasurementQuestions(comparison.questions, order).map((q: QuestionMovement) => {
    const b = side(q.before);
    const a = side(q.after);
    return {
      question: q.question,
      beforeNamed: b.named,
      beforeAnswered: b.answered,
      beforeRatePct: b.ratePct,
      afterNamed: a.named,
      afterAnswered: a.answered,
      afterRatePct: a.ratePct,
      namedDelta: q.namedDelta,
      ratePpDelta: rate(q.ratePpDelta),
      citedBefore: b.cited,
      citedAfter: a.cited,
      verdict: MOVEMENT_EXPORT_LABELS[q.movement],
      /* An unmatched question is not "unproven" through thinness — it simply has nothing to
         compare. Both read as not proven, which is correct, and the verdict column says which. */
      proven: !q.thin && q.before !== null && q.after !== null,
      unevenSampling: !!(q.before && q.after && q.before.cells !== q.after.cells),
    };
  });
}

/* ── THE HEADER BLOCK ────────────────────────────────────────────────────────────────────────
   ⛔ NOT DECORATION. A sheet of per-question deltas with no overall figure invites reading the
   biggest row as the result, when the claim only ever lives in the overall rate (CLAUDE.md §5
   reports ABLM as "0 → 3 of 18", never a single question). So the overall figures, the headline
   with its qualification, and the noise band ride at the top of every export. */
export function exportHeaderLines(comparison: MeasurementComparison, meta: ExportMeta): string[] {
  const c = comparison;
  const fmtRate = (v: number | null) => (v === null ? 'n/a' : `${rate(v)}%`);
  const when = (iso: string | null) => (iso ? iso.slice(0, 10) : 'unknown date');
  const lines = [
    `AI visibility - before and after`,
    `Business: ${meta.businessName || 'unknown'}`,
    `Before: ${when(meta.beforeMeasuredAt)} - ${c.before.runs} run(s), ${c.before.questions} question(s), named ${c.before.named} of ${c.before.answered} answers (${fmtRate(c.before.ratePct)})`,
    `After: ${when(meta.afterMeasuredAt)} - ${c.after.runs} run(s), ${c.after.questions} question(s), named ${c.after.named} of ${c.after.answered} answers (${fmtRate(c.after.ratePct)})`,
    `Overall change: ${c.ratePpDelta === null ? 'n/a' : `${c.ratePpDelta > 0 ? '+' : ''}${rate(c.ratePpDelta)} points`} (${c.namedCellsDelta > 0 ? '+' : ''}${c.namedCellsDelta} named cells)`,
    `Verdict: ${c.movement === 'incomparable' ? 'incomparable - no question was asked both times' : MOVEMENT_EXPORT_LABELS[c.movement]}`,
    `Sampling swing between repeat measurements with no work done: +/-${c.noiseBandPp} points. Movement inside that band is NOT proven.`,
    `Questions asked both times: ${c.matchedCount}. Not re-asked: ${c.onlyBefore.length}. New this time: ${c.onlyAfter.length}.`,
  ];
  if (c.unevenRuns) {
    lines.push(
      'WARNING: the two sides asked their questions a different number of times, so the RATE columns compare and the raw counts do not.',
    );
  }
  lines.push(`Exported: ${meta.exportedAt}`);
  return lines;
}

/** A CSV field: quoted when it has to be, and never a formula. */
function csvField(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = String(typeof v === 'boolean' ? (v ? 'yes' : 'no') : v);
  /* ⛔ A LEADING =, +, - or @ MAKES EXCEL EXECUTE THE CELL. Prospect names and questions are
     free text from search results, so this is not hypothetical. Prefixed with an apostrophe,
     which Excel and Sheets both read as "this is text". */
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * The CSV. Header block as leading comment lines, then the table.
 *
 * ⚠️ THE `#` PREFIX IS DELIBERATE. Sheets and Excel both import those lines as ordinary text
 * rows, which is fine — they are meant to be read. What must not happen is the qualification
 * living only in a filename or a covering message, where it parts company with the numbers.
 */
export function comparisonToCsv(
  comparison: MeasurementComparison,
  meta: ExportMeta,
  order: MeasurementOrder = 'asked',
): string {
  const head = exportHeaderLines(comparison, meta).map((l) => `# ${l}`);
  const cols = COLUMNS.map((c) => csvField(c.head)).join(',');
  const body = exportRows(comparison, order).map((r) => COLUMNS.map((c) => csvField(r[c.key])).join(','));
  return [...head, '', cols, ...body].join('\r\n');
}

/**
 * The clipboard version: tab-separated, so it pastes straight into a spreadsheet cell grid.
 *
 * ⚠️ Tabs and newlines are stripped from fields rather than quoted — a clipboard paste has no
 * escaping convention, and a quoted field would arrive as literal quote marks. Questions are one
 * line of text, so there is nothing real to lose.
 */
export function comparisonToTsv(
  comparison: MeasurementComparison,
  meta: ExportMeta,
  order: MeasurementOrder = 'asked',
): string {
  const clean = (v: unknown) => {
    if (v === null || v === undefined) return '';
    const s = String(typeof v === 'boolean' ? (v ? 'yes' : 'no') : v);
    return s.replace(/[\t\r\n]+/g, ' ').trim();
  };
  const head = exportHeaderLines(comparison, meta);
  const cols = COLUMNS.map((c) => c.head).join('\t');
  const body = exportRows(comparison, order).map((r) => COLUMNS.map((c) => clean(r[c.key])).join('\t'));
  return [...head, '', cols, ...body].join('\n');
}

/* ── THE ANALYSIS PDF ────────────────────────────────────────────────────────────────────────
   Summary + the aligned table, as a self-contained printable document. Deliberately NOT the two
   client reports side by side: those are two independently laid-out documents whose questions
   cannot line up, which is the problem this whole piece of work exists to solve. Each client
   report already prints properly from its own page when a client needs to see one.
   ⚠️ Rendered through the SAME print path as the audit report (downloadHtmlDocAsPdf), so
   pagination, filename behaviour and vector output are the ones already proven there. */

const escHtml = (s: string): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const VERDICT_CLASS: Record<Movement, string> = {
  improved: 'v-up', dropped: 'v-down', within_noise: 'v-noise',
  unchanged: 'v-flat', only_before: 'v-none', only_after: 'v-new',
};

export function comparisonToPrintableHtml(
  comparison: MeasurementComparison,
  meta: ExportMeta,
  order: MeasurementOrder = 'asked',
): string {
  const c = comparison;
  const rows = sortMeasurementQuestions(c.questions, order);
  const num = (v: number | null, suffix = '') => (v === null ? '—' : `${rate(v)}${suffix}`);
  const signed = (v: number | null, suffix = '') =>
    v === null ? '—' : `${v > 0 ? '+' : ''}${rate(v)}${suffix}`;
  const when = (iso: string | null) => (iso ? iso.slice(0, 10) : 'unknown date');

  const summaryCard = (label: string, s: typeof c.before, iso: string | null) => `
    <div class="card">
      <div class="card-h">${escHtml(label)}</div>
      <div class="big">${s.named} <span class="of">of ${s.answered}</span></div>
      <div class="sub">${s.ratePct === null ? 'no answers' : `${rate(s.ratePct)}% of answers name them`}</div>
      <div class="meta">${escHtml(when(iso))} · ${s.runs} run${s.runs === 1 ? '' : 's'} · ${s.questions} question${s.questions === 1 ? '' : 's'}</div>
    </div>`;

  const body = rows.map((q) => `
    <tr>
      <td class="q">${escHtml(q.question)}</td>
      <td class="n">${q.before ? `${q.before.named} of ${q.before.answered}` : '—'}</td>
      <td class="n">${q.before ? num(q.before.ratePct, '%') : '—'}</td>
      <td class="n b">${q.after ? `${q.after.named} of ${q.after.answered}` : '—'}</td>
      <td class="n b">${q.after ? num(q.after.ratePct, '%') : '—'}</td>
      <td class="n">${signed(q.namedDelta)}</td>
      <td class="n">${signed(q.ratePpDelta, 'pp')}</td>
      <td class="n">${q.before && q.after ? `${q.before.cited} → ${q.after.cited}` : '—'}</td>
      <td><span class="chip ${VERDICT_CLASS[q.movement]}">${escHtml(MOVEMENT_EXPORT_LABELS[q.movement])}</span>${q.thin && q.before && q.after ? '<span class="thin">unproven on its own</span>' : ''}</td>
    </tr>`).join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Before and after</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font: 12px/1.45 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #14161a; margin: 0; }
  h1 { font-size: 19px; margin: 0 0 2px; }
  .who { color: #5a6069; font-size: 12px; margin: 0 0 14px; }
  .cards { display: flex; gap: 10px; margin-bottom: 12px; }
  .card { flex: 1; border: 1px solid #dfe3e8; border-radius: 8px; padding: 9px 11px; }
  .card-h { font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #6b7280; }
  .big { font-size: 22px; font-weight: 700; margin-top: 2px; }
  .big .of { font-size: 13px; font-weight: 400; color: #6b7280; }
  .sub { font-size: 11px; color: #14161a; }
  .meta { font-size: 10px; color: #6b7280; margin-top: 3px; }
  .headline { border-left: 3px solid #14161a; padding: 7px 11px; background: #f6f7f9; font-size: 12.5px; font-weight: 600; margin-bottom: 8px; }
  .warn { border-left: 3px solid #b45309; background: #fffbeb; padding: 6px 11px; font-size: 11px; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 9.5px; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; border-bottom: 1px solid #c9cfd6; padding: 0 6px 4px 0; }
  td { border-bottom: 1px solid #eceff2; padding: 5px 6px 5px 0; vertical-align: top; }
  /* Keep a question's row on one page - a split row is unreadable in a comparison. */
  tr { break-inside: avoid; }
  thead { display: table-header-group; }
  .q { max-width: 300px; }
  .n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .b { font-weight: 600; }
  .chip { display: inline-block; font-size: 9.5px; padding: 1px 5px; border-radius: 999px; border: 1px solid #c9cfd6; white-space: nowrap; }
  .v-up { background: #ecfdf5; border-color: #6ee7b7; }
  .v-down { background: #fef2f2; border-color: #fca5a5; }
  .v-noise, .v-flat { background: #f6f7f9; }
  .v-new { background: #eff6ff; border-color: #93c5fd; }
  .v-none { background: #fafafa; color: #6b7280; }
  .thin { display: block; font-size: 9px; color: #6b7280; margin-top: 1px; }
  .foot { margin-top: 12px; font-size: 10px; color: #6b7280; }
</style></head><body>
  <h1>AI visibility — before and after</h1>
  <p class="who">${escHtml(meta.businessName || 'Unknown business')} · exported ${escHtml(meta.exportedAt)} · rows in ${order === 'asked' ? 'the order the questions were asked' : 'biggest-movers order'}</p>
  <div class="cards">
    ${summaryCard('Before', c.before, meta.beforeMeasuredAt)}
    ${summaryCard('After', c.after, meta.afterMeasuredAt)}
    <div class="card">
      <div class="card-h">Change</div>
      <div class="big">${signed(c.ratePpDelta, 'pp')}</div>
      <div class="sub">${c.namedCellsDelta > 0 ? '+' : ''}${c.namedCellsDelta} named answers</div>
      <div class="meta">${escHtml(MOVEMENT_EXPORT_LABELS[c.movement as Movement] ?? String(c.movement))}</div>
    </div>
  </div>
  <div class="headline">${escHtml(c.headline)}</div>
  ${c.unevenRuns ? '<div class="warn">The two sides asked their questions a different number of times, so the RATE columns compare like-for-like and the raw counts do not.</div>' : ''}
  <table>
    <thead><tr>
      <th>Question</th><th class="n">Before named</th><th class="n">Before rate</th>
      <th class="n">After named</th><th class="n">After rate</th>
      <th class="n">Named change</th><th class="n">Rate change</th>
      <th class="n">Own site cited</th><th>Verdict</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table>
  <p class="foot">
    Movement smaller than ±${c.noiseBandPp} points is not presented as improvement: repeat measurements with no work
    done between them swing by about that much. A single question answered only a few times cannot prove a change on
    its own — those rows are marked unproven, and the claim lives in the overall figure above.
    ${c.matchedCount} question${c.matchedCount === 1 ? '' : 's'} asked both times;
    ${c.onlyBefore.length} not re-asked; ${c.onlyAfter.length} new this time.
  </p>
</body></html>`;
}

/** A filename stem: "RG-Locksmiths-before-after-2026-09-08". */
export function exportFilename(businessName: string, exportedAtIso: string, ext: string): string {
  const base = (businessName || 'business').trim()
    .replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'business';
  return `${base}-before-after-${exportedAtIso.slice(0, 10)}.${ext}`;
}
