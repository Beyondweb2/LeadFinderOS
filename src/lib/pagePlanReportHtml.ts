/* ════════════════════════════════════════════════════════════════════════════════════════════
   PRINTABLE PAGE PLAN — the client-facing (or internal) document for the page-plan queue,
   rendered in the EXACT audit-report template: it imports the SHARED CHROME from
   aiAuditReportHtml.ts (blue band + wordmark + wave, "Prepared for" footer, A4 sheet/print CSS),
   so the two documents are visually identical by construction and cannot drift.

   ⛔ CLIENT vs INTERNAL follows the audit report's leak-safe rule: the internal-only material
   (numeric scores, the clusterer's "why grouped this way" rationale, the itemised score reasons)
   renders ONLY when `internal` is EXPLICITLY true. A caller that forgets renders the CLIENT
   document. Presentation only — no build/hold logic lives here.

   Pure (no document/window): the SPA renders it for preview and hands it to the shared
   print-to-PDF path (downloadHtmlDocAsPdf in aiAuditReportDownload.ts).
   ════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  esc, renderWaveBand, renderSiteFooter,
  REPORT_CHROME_CSS_CORE, REPORT_CHROME_CSS_FOOT, REPORT_CHROME_CSS_PRINT,
} from './aiAuditReportHtml';

export type PlanLabelKind = 'build' | 'gap' | 'defend' | 'locked' | 'authority';

export interface PagePlanReportItem {
  job: string;
  topic: string;                       // the service/hub group
  labelKind: PlanLabelKind;
  label: string;                       // display text, e.g. "Build — Gemini gap"
  winnability: string | null;          // open / contested / named / …
  questions: { text: string; chatgpt: string; gemini: string }[];  // counts pre-formatted "2/3" | "—"
  sources: { domain: string; count: number }[];
  heldReason: string | null;           // client-safe wording, shown in BOTH views
  // internal-only:
  score: number | null;
  rationale: string | null;
  scoreReasons: string[];
}

export interface PagePlanReportData {
  businessName: string;
  businessType: string | null;
  generatedAtLabel: string;
  internal?: boolean;
  waves: { wave: number; items: PagePlanReportItem[] }[];
}

const ITEMS_PER_PAGE = 4; // a card never splits across a break; 4 keeps an A4 uncrowded

const LABEL_CLASS: Record<PlanLabelKind, string> = {
  build: 'pp-build', gap: 'pp-gap', defend: 'pp-defend', locked: 'pp-locked', authority: 'pp-locked',
};

const WAVE_TITLE: Record<number, string> = { 1: 'top priorities', 2: 'next up' };

export function renderPagePlanHtml(d: PagePlanReportData): string {
  const internal = d.internal === true;

  const itemCard = (it: PagePlanReportItem): string => {
    const qLines = it.questions.map((q) =>
      `<div class="pp-q">&ldquo;${esc(q.text)}&rdquo; <span class="pp-counts">&mdash; named: ChatGPT ${esc(q.chatgpt)} &middot; Gemini ${esc(q.gemini)}</span></div>`).join('');
    const srcLine = it.sources.length
      ? `<div class="pp-src"><span class="pp-slabel">Engines currently read:</span> ${it.sources.map((s) =>
          `<span class="pp-chip">${esc(s.domain)}${internal ? ` (${s.count})` : ''}</span>`).join(' ')}</div>`
      : '';
    const held = it.heldReason ? `<div class="pp-held">${esc(it.heldReason)}</div>` : '';
    /* The status pill next to the score, DISPLAY ONLY: on a BUILDING card a bare "named" pill
       contradicts the BUILD chip (Paul, 2026-08-28) — gap builds read "Gemini gap", a non-gap
       named-label build reads "partly named"; "named" stays on held/defend cards. */
    const pill = it.labelKind === 'gap' ? 'Gemini gap'
      : it.labelKind === 'build' && it.winnability === 'named' ? 'partly named'
      : it.winnability ? it.winnability.replace(/_/g, ' ') : null;
    const intBlock = internal
      ? `<div class="pp-int">
          ${it.score != null ? `<span class="pp-int-chip">score ${it.score}</span>` : ''}
          ${pill ? `<span class="pp-int-chip">${esc(pill)}</span>` : ''}
          ${it.rationale ? `<div class="pp-int-line">Grouping: ${esc(it.rationale)}</div>` : ''}
          ${it.scoreReasons.map((r) => `<div class="pp-int-line">&middot; ${esc(r)}</div>`).join('')}
        </div>`
      : '';
    return `<li class="pp-item">
      <div class="pp-head">
        <span class="pp-job">${esc(it.job)}</span>
        <span class="pp-label ${LABEL_CLASS[it.labelKind]}">${esc(it.label)}</span>
      </div>
      <div class="pp-topic">${esc(it.topic)}</div>
      ${qLines}${srcLine}${held}${intBlock}
    </li>`;
  };

  // Sheets: each wave's items chunked so a card never splits; GLOBAL page X of Y in the band,
  // wave name in the header — the audit report's own convention (its band carries the section
  // name and "page N of M").
  const sheets: { meta: string; intro: string; items: PagePlanReportItem[] }[] = [];
  for (const w of d.waves) {
    for (let i = 0; i < w.items.length; i += ITEMS_PER_PAGE) {
      sheets.push({
        meta: `Page Plan &middot; Wave ${w.wave}${WAVE_TITLE[w.wave] ? ` &mdash; ${WAVE_TITLE[w.wave]}` : ''}`,
        intro: i === 0 && w.wave === d.waves[0]?.wave
          ? `<div class="pp-eyebrow">The plan</div>
             <div class="pp-title">The pages we plan for ${esc(d.businessName)}</div>
             <p class="pp-intro">Each page below answers real questions people ask AI engines${d.businessType ? ` about ${esc(d.businessType)}` : ''}. They are grouped so one page does one job, ordered by where the evidence says a page can win, and released in waves &mdash; wave 1 first.</p>`
          : '',
        items: w.items.slice(i, i + ITEMS_PER_PAGE),
      });
    }
  }
  const total = sheets.length;

  const foot = renderSiteFooter({
    businessName: d.businessName,
    metaHtml: `Findable &middot; Page Plan &middot; ${esc(d.generatedAtLabel)}`,
    note: 'The plan updates as we re-measure: pages that win move to &ldquo;defend&rdquo;, and new questions join the queue.',
  });

  const body = sheets.map((sh, i) => `
  <div class="sheet">
    ${renderWaveBand(`${sh.meta} &middot; page ${i + 1} of ${total}`)}
    <section class="pp-wrap">
      ${sh.intro}
      <ul class="pp-list">${sh.items.map(itemCard).join('')}</ul>
    </section>
    ${foot}
  </div>`).join('');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex,nofollow"/>
<title>Page Plan &mdash; ${esc(d.businessName)}</title>
<style>
${REPORT_CHROME_CSS_CORE}
${REPORT_CHROME_CSS_FOOT}
  /* ── plan-specific styles, on top of the shared chrome ─────────────────────────── */
  .pp-wrap{ padding:18px 28px 22px; }
  .pp-eyebrow{ font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:var(--blue-2); font-weight:800; }
  .pp-title{ font-size:22px; font-weight:900; color:var(--ink); margin:2px 0 6px; }
  .pp-intro{ font-size:13.5px; color:var(--muted); max-width:66ch; margin:0 0 14px; }
  .pp-list{ list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:12px; }
  .pp-item{ border:1px solid var(--line); border-radius:10px; padding:12px 14px; }
  .pp-head{ display:flex; align-items:baseline; justify-content:space-between; gap:10px; flex-wrap:wrap; }
  .pp-job{ font-size:15px; font-weight:800; color:var(--ink); }
  .pp-label{ font-size:10.5px; font-weight:800; letter-spacing:.04em; text-transform:uppercase;
    padding:2px 9px; border-radius:999px; white-space:nowrap; }
  .pp-build{ background:var(--green-tint); color:var(--green); }
  .pp-gap{ background:var(--amber-tint-2); color:var(--amber); }
  .pp-defend{ background:var(--blue-tint-2); color:var(--blue-2); }
  .pp-locked{ background:var(--red-tint-2); color:var(--red); }
  .pp-topic{ font-size:11px; letter-spacing:.05em; text-transform:uppercase; color:var(--faint); font-weight:700; margin:2px 0 6px; }
  .pp-q{ font-size:13px; color:var(--ink); margin:3px 0; }
  .pp-counts{ color:var(--muted); font-size:12px; }
  .pp-src{ margin-top:7px; font-size:12px; color:var(--muted); }
  .pp-slabel{ font-weight:700; color:var(--blue); }
  .pp-chip{ display:inline-block; background:var(--panel-tint-2); border:1px solid var(--line); border-radius:999px;
    padding:1px 8px; font-size:11px; color:var(--ink-2); margin:1px 2px 1px 0; }
  .pp-held{ margin-top:7px; font-size:12px; color:var(--amber); font-weight:600; }
  .pp-int{ margin-top:8px; padding:8px 10px; background:var(--gold-tint); border:1px dashed var(--gold-line); border-radius:8px; }
  .pp-int-chip{ display:inline-block; background:var(--paper); border:1px solid var(--gold-line); border-radius:999px;
    padding:1px 8px; font-size:10.5px; font-weight:800; color:var(--on-gold-tint); margin-right:6px; }
  .pp-int-line{ font-size:11.5px; color:var(--on-gold-tint-2); margin-top:4px; }
  @media (max-width:520px){ .pp-wrap{ padding:14px 18px 18px; } }
${REPORT_CHROME_CSS_PRINT}
  @media print{
    .pp-item{ break-inside:avoid; page-break-inside:avoid; }
  }
</style>
</head>
<body>
${body}
</body>
</html>`;
}
