/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE FOUR-WEEK RESULTS DOCUMENT — the client-facing before-and-after (2026-09-13).

   Server-rendered by render-remeasure-results and linked from the results email; a client reaches
   it at findable.live/results/<remeasureAuditId>. The SPA's before/after panel is operator-only and
   unreachable by a client, which is why this exists.

   Same chrome as every other customer document (aiAuditReportHtml's band, footer and CSS), the same
   pooled comparison the product uses (compareMeasurements), and the same words as the email
   (remeasureResults.ts) — one source for the "what this means" paragraphs and the byte-locked claim
   sentence. Client-facing: listed in scripts/client-copy-claims.test.ts.

   ⚠️ It shows COUNTS the client can check against the questions — named of answered, before and
   after, per question — and never a score. No competitor names: this is their document, and the
   working detail stays on the operator screens.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  esc, renderWaveBand, renderSiteFooter,
  REPORT_CHROME_CSS_CORE, REPORT_CHROME_CSS_FOOT, REPORT_CHROME_CSS_PRINT,
} from './aiAuditReportHtml.ts';
import type { MeasurementComparison } from './measurementCompare.ts';
import { numberWentUp, resultsDocumentMeaning, weeksWord } from './remeasureResults.ts';

export interface RemeasureResultsDoc {
  businessName: string;
  town: string | null;
  comparison: MeasurementComparison;
  beforeDate: string | null;   // ISO
  afterDate: string | null;    // ISO
  sentAtLabel: string;         // e.g. "13 Sep 2026"
  /** The client's re-measure clock (remeasureWeeksFor): 4, or 8 for a site we build on a brand-new domain. */
  weeks?: number | null;
}

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'date not recorded');
const pct = (n: number, d: number) => (d > 0 ? `${Math.round((100 * n) / d)}%` : '—');

export function renderRemeasureResultsHtml(d: RemeasureResultsDoc): string {
  const c = d.comparison;
  const up = numberWentUp(c);
  const meaning = resultsDocumentMeaning({
    businessName: d.businessName, town: d.town,
    beforeNamed: c.before.named, beforeAnswered: c.before.answered,
    afterNamed: c.after.named, afterAnswered: c.after.answered,
    questions: c.matchedCount, wentUp: up, withinNoise: c.withinNoise, documentUrl: '', weeks: d.weeks,
  });
  const w = weeksWord(d.weeks);
  const W = w.charAt(0).toUpperCase() + w.slice(1);
  const matched = c.questions.filter((q) => q.before && q.after);

  const card = (label: string, named: number, answered: number, iso: string | null, runs: number) => `
    <div class="rr-card">
      <div class="rr-card-h">${esc(label)}</div>
      <div class="rr-big">${named} <span class="rr-of">of ${answered}</span></div>
      <div class="rr-sub">${answered ? `${pct(named, answered)} of answers named ${esc(d.businessName)}` : 'no answers recorded'}</div>
      <div class="rr-meta">${esc(day(iso))} &middot; asked ${runs} time${runs === 1 ? '' : 's'}</div>
    </div>`;

  const rows = matched.map((q) => `
    <tr>
      <td class="rr-q">${esc(q.question)}</td>
      <td class="rr-n">${q.before!.named} of ${q.before!.answered}</td>
      <td class="rr-n">${q.after!.named} of ${q.after!.answered}</td>
    </tr>`).join('');

  const foot = renderSiteFooter({
    businessName: d.businessName,
    metaHtml: `Findable &middot; ${W}-week results &middot; ${esc(d.sentAtLabel)}`,
    note: 'Both measurements asked the same questions on the same engines, ChatGPT and Gemini, and counted the answers that named you.',
  });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex,nofollow"/>
<title>${W}-week results &mdash; ${esc(d.businessName)}</title>
<style>
${REPORT_CHROME_CSS_CORE}
${REPORT_CHROME_CSS_FOOT}
  .rr-wrap{ padding:18px 28px 22px; }
  .rr-eyebrow{ font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:var(--blue-2); font-weight:800; }
  .rr-title{ font-size:22px; font-weight:900; color:var(--ink); margin:2px 0 6px; }
  .rr-intro{ font-size:13.5px; color:var(--muted); max-width:66ch; margin:0 0 14px; }
  .rr-cards{ display:grid; grid-template-columns:1fr 1fr; gap:12px; margin:0 0 16px; }
  .rr-card{ border:1px solid var(--line); border-radius:10px; padding:12px 14px; }
  .rr-card-h{ font-size:11px; letter-spacing:.06em; text-transform:uppercase; color:var(--faint); font-weight:800; }
  .rr-big{ font-size:30px; font-weight:900; color:var(--ink); line-height:1.1; margin-top:4px; }
  .rr-of{ font-size:14px; color:var(--muted); font-weight:700; }
  .rr-sub{ font-size:12.5px; color:var(--ink-2); margin-top:4px; }
  .rr-meta{ font-size:11px; color:var(--faint); margin-top:6px; }
  .rr-verdict{ border-left:4px solid ${up ? 'var(--green)' : 'var(--amber)'}; padding:10px 14px; margin:0 0 16px; background:var(--panel-tint-2); border-radius:8px; }
  .rr-verdict p{ margin:0 0 6px; font-size:13.5px; color:var(--ink); }
  .rr-verdict p:last-child{ margin-bottom:0; }
  table.rr{ width:100%; border-collapse:collapse; font-size:12.5px; }
  table.rr th{ text-align:left; font-size:10.5px; letter-spacing:.06em; text-transform:uppercase; color:var(--faint); padding:6px 8px; border-bottom:1px solid var(--line); }
  table.rr td{ padding:7px 8px; border-bottom:1px solid var(--line); vertical-align:top; }
  .rr-q{ color:var(--ink); }
  .rr-n{ text-align:right; white-space:nowrap; color:var(--ink-2); font-variant-numeric:tabular-nums; }
  @media (max-width:520px){ .rr-wrap{ padding:14px 18px 18px; } .rr-cards{ grid-template-columns:1fr; } }
${REPORT_CHROME_CSS_PRINT}
  @media print{ table.rr tr{ break-inside:avoid; } .rr-card{ break-inside:avoid; } }
</style>
</head>
<body>
  <div class="sheet">
    ${renderWaveBand(`${W}-week results &middot; page 1 of 1`)}
    <section class="rr-wrap">
      <div class="rr-eyebrow">Before and after</div>
      <div class="rr-title">${esc(d.businessName)}${d.town ? ` in ${esc(d.town)}` : ''}</div>
      <p class="rr-intro">${W} weeks ago we asked ChatGPT and Gemini the ${c.matchedCount} questions your customers ask and counted how many answers named you. We have just asked the same questions again, on the same engines. Here are both sets of numbers.</p>
      <div class="rr-cards">
        ${card('Before', c.before.named, c.before.answered, d.beforeDate, c.before.runs)}
        ${card('After', c.after.named, c.after.answered, d.afterDate, c.after.runs)}
      </div>
      <div class="rr-verdict">${meaning.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
      <table class="rr">
        <thead><tr><th>Question</th><th style="text-align:right">Before</th><th style="text-align:right">After</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
    ${foot}
  </div>
</body>
</html>`;
}
