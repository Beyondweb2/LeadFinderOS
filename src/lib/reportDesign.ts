/* ═══════════════════════════════════════════════════════════════════════════════════════
   REPORT DESIGN — ONE fixed, simple template for the three client-facing report pages.
   (Paul, 2026-11-11, third design: light, big type, mobile first, plain English.)

     renderOpportunityReport  "Searches you could win" — the longer report (a Discovery audit).
     renderHookReport         First contact: who AI recommends instead, three example searches, one button.
     renderBaselineReport     The client's 20 tracked searches: today's result, when we check again.

   The same header, headline, cards, button and footer for every business. No paragraphs: at most two
   short lines of text per section. Words a busy tradesperson understands in five seconds: "searches" not
   "questions"; never "discovery", "baseline", "verdict", "engines", "fragmented", "citations",
   "visibility score" or "GEO" (scripts/report-design.test.ts pins this on the rendered page).

   PRESENTATION ONLY: plain, already-counted input (reportOpportunity.ts builds it). Never a score, never a
   promise of a ranking or of being recommended; the footer says "These are opportunities, not guarantees."
   Pure (no DOM). Imported by the render-audit-report edge function, so relative imports carry .ts.
   ═══════════════════════════════════════════════════════════════════════════════════════ */

import { FINDABLE_CONTACT_WHATSAPP, REMEASURE_WEEKS_STANDARD } from './findableOffer.ts';
import type { OppDirectory, OppFirm, OppQuestion, OppSummary, OppTier } from './reportOpportunity.ts';

export function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** "London Domestic Maintenance Ltd" -> "London Domestic Maintenance". */
export const shortName = (n: string): string => n.replace(/[\s,]+(ltd|limited)\.?$/i, '').trim() || n;

export interface DesignBase {
  businessName: string;
  /** "domestic maintenance" — may be "". */
  trade: string;
  /** "London" — may be "". */
  town: string;
  dateLabel: string;
  shareUrl?: string;
}

/** The three groups, in words a tradesperson reads at a glance. */
const GROUP: Record<OppTier, { label: string; sub: string; chip: string }> = {
  now: { label: 'You could win', sub: 'No one stands out yet', chip: 'You could win' },
  possible: { label: 'Possible with work', sub: 'One firm leads, or work needed', chip: 'Possible with work' },
  hard: { label: 'Hard to win', sub: 'One firm named almost every time', chip: 'Hard to win' },
};

const WA_BUTTON = 'Talk to Paul on WhatsApp';
const waHref = (businessName: string, text: string) =>
  `https://wa.me/${FINDABLE_CONTACT_WHATSAPP}?text=${encodeURIComponent(`Hi, this is ${businessName} - ${text}`)}`;

/* ── Shared look ───────────────────────────────────────────────────────────────────────── */

const CSS = `
:root{color-scheme:light;--bg:#faf9f4;--card:#fff;--line:#e6e3d8;--text:#111;--muted:#57534e;--y:#ffd13f;--y-soft:#fff3c4;--on-y:#111;
  --green:#15803d;--green-bg:#dcfce7;--amber:#92400e;--amber-bg:#fef3c7;--grey:#44403c;--grey-bg:#e7e5e4}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:18px/1.45 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
a{color:inherit}
.wrap{max-width:680px;margin:0 auto;padding:0 16px 40px}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 0 8px}
.logo{font-weight:900;font-size:24px;letter-spacing:-.03em}.logo i{font-style:normal;background:var(--y);border-radius:50%;display:inline-block;width:.32em;height:.32em;margin-left:2px}
.date{font-size:15px;color:var(--muted)}
.biz{font-size:20px;font-weight:800;margin:4px 0 0}
h1{font-size:30px;line-height:1.14;letter-spacing:-.025em;font-weight:900;margin:14px 0 0;padding-left:14px;border-left:8px solid var(--y)}
h2{font-size:23px;line-height:1.2;letter-spacing:-.015em;font-weight:900;margin:0}
.sec{margin-top:30px}
.line{margin:4px 0 0;color:var(--muted);font-size:17px}
.card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px 18px;margin-top:12px}
.nums{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:20px}
.num{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:14px 12px}
.num b{display:block;font-size:40px;line-height:1;font-weight:900;letter-spacing:-.03em}
.num span{display:block;margin-top:8px;font-weight:800;font-size:15px;line-height:1.2}
.num small{display:block;margin-top:4px;color:var(--muted);font-size:13px;line-height:1.25}
.num.win{background:var(--y);border-color:var(--y)}.num.win small{color:#3d3000}
.rows{margin-top:0}
.row{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:13px 0;border-top:1px solid var(--line);font-size:18px}
.row:first-child{border-top:0}
.row b{font-weight:800;overflow-wrap:anywhere}.row span{color:var(--muted);white-space:nowrap;font-size:16px}
.item{padding:14px 0;border-top:1px solid var(--line)}.item:first-child{border-top:0}
.item h3{margin:0;font-size:19px;line-height:1.25;font-weight:800}
.item p{margin:4px 0 0;color:var(--muted);font-size:16px}
.chip{display:inline-block;margin-top:8px;border-radius:999px;padding:3px 12px;font-size:14px;font-weight:800}
.chip.now{background:var(--green-bg);color:var(--green)}.chip.possible{background:var(--amber-bg);color:var(--amber)}.chip.hard{background:var(--grey-bg);color:var(--grey)}
.list{margin:12px 0 0;padding:0;list-style:none}
.list li{position:relative;padding:8px 0 8px 30px;font-size:18px}
.list li:before{content:"";position:absolute;left:0;top:14px;width:16px;height:16px;border-radius:50%;background:var(--y)}
.btn{display:flex;align-items:center;justify-content:center;width:100%;min-height:58px;margin-top:30px;border-radius:16px;background:var(--y);color:var(--on-y);font-weight:900;font-size:20px;text-decoration:none;padding:14px 18px;text-align:center;box-shadow:0 2px 0 rgba(0,0,0,.12)}
details{margin-top:24px;background:var(--card);border:1px solid var(--line);border-radius:18px}
summary{cursor:pointer;list-style:none;padding:16px 18px;font-weight:800;font-size:18px;min-height:56px}
summary::-webkit-details-marker{display:none}
summary:after{content:"+";float:right;font-size:26px;line-height:1;color:#a16207}
details[open] summary:after{content:"\\2212"}
details .inner{padding:0 18px 12px}
.big{font-size:52px;line-height:1;font-weight:900;letter-spacing:-.03em}
.hero{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:18px;margin-top:12px}
.hero .big em{font-style:normal;background:var(--y);padding:0 8px;border-radius:8px}
.tag{display:inline-block;background:var(--y-soft);border-radius:999px;padding:4px 12px;font-size:15px;font-weight:700;margin-top:10px}
.foot{margin-top:34px;padding-top:14px;border-top:1px solid var(--line);color:var(--muted);font-size:15px}
.foot p{margin:2px 0}
@media (min-width:720px){
  body{font-size:19px}.wrap{padding-bottom:64px}
  h1{font-size:38px}h2{font-size:26px}
  .num b{font-size:50px}
}
@media (max-width:380px){.num b{font-size:34px}.num span{font-size:14px}h1{font-size:27px}}
@media print{body{background:#fff}.btn{display:none}}
`;

function shell(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<meta name="robots" content="noindex, nofollow, noarchive"><title>${esc(title)}</title>` +
    `<style>${CSS}</style></head><body><div class="wrap">${bodyHtml}</div></body></html>`;
}

/** 1. Header: logo, date, business name. */
function header(b: DesignBase): string {
  return `<header class="top"><div class="logo">Findable<i></i></div><div class="date">${esc(b.dateLabel)}</div></header>` +
    `<p class="biz">${esc(b.businessName)}</p>`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const where = (d: DesignBase) => `${d.trade || 'a business like yours'}${d.town ? ` in ${d.town}` : ''}`;

/** 2. The one-line headline. */
function headline(d: DesignBase, named: number, answers: number): string {
  const text = named === 0
    ? `When people ask AI for ${where(d)}, it doesn't mention you yet.`
    : `When people ask AI for ${where(d)}, it mentions you in ${named} of ${answers} answers.`;
  return `<h1>${esc(text)}</h1>`;
}

/** 8. The one button. */
function button(d: DesignBase, text: string): string {
  return `<a class="btn" href="${esc(waHref(d.businessName, text))}" target="_blank" rel="noopener noreferrer">${WA_BUTTON}</a>`;
}

function footer(): string {
  return `<footer class="foot"><p>These are opportunities, not guarantees.</p></footer>`;
}

/** 4. "AI recommends these instead": the top businesses and how often. */
function insteadBlock(rivals: OppFirm[], max = 5): string {
  const top = rivals.slice(0, max);
  if (!top.length) return '';
  return `<section class="sec"><h2>AI recommends these instead</h2><p class="line">How often AI named them.</p>` +
    `<div class="card"><div class="rows">${top.map((r) => `<div class="row"><b>${esc(r.name)}</b><span>${plural(r.count, 'time')}</span></div>`).join('')}</div></div></section>`;
}

/** 6. "Get listed on these sites": the top directories AI uses. */
function listedBlock(dirs: OppDirectory[], max = 5): string {
  const top = dirs.slice(0, max);
  if (!top.length) return '';
  return `<section class="sec"><h2>Get listed on these sites</h2><p class="line">AI uses them.</p>` +
    `<div class="card"><div class="rows">${top.map((x) => `<div class="row"><b>${esc(x.name)}</b><span>${plural(x.answers, 'answer')}</span></div>`).join('')}</div></div></section>`;
}

/** 7. "What we'd do": three short bullets — only things Findable does and measures. */
function doBlock(): string {
  return `<section class="sec"><h2>What we'd do</h2><ul class="list">` +
    `<li>Make a clear page for each search.</li>` +
    `<li>Tidy your website and Google profile.</li>` +
    `<li>Check again after ${REMEASURE_WEEKS_STANDARD} weeks and show you.</li></ul></section>`;
}

const groupChip = (t: OppTier) => `<span class="chip ${t}">${GROUP[t].chip}</span>`;

/** "AI names: X, Y" or "AI names nobody". */
function namesLine(q: OppQuestion): string {
  return q.firms.length ? `AI names: ${q.firms.slice(0, 2).map((f) => f.name).join(', ')}` : 'AI names nobody';
}

/* ═══ OPPORTUNITY REPORT ═════════════════════════════════════════════════════════════════ */

export interface OpportunityDesignInput extends DesignBase {
  summary: OppSummary;
  /** Kept for callers that still pass them; the page does not print them. */
  engines?: string;
  asks?: number;
  bestCount?: number;
}

export function renderOpportunityReport(d0: OpportunityDesignInput): string {
  const d = { ...d0, businessName: shortName(d0.businessName) };
  const s = d.summary;
  const named = s.questions.reduce((n, q) => n + q.namedYou, 0);
  const wins = s.best.filter((q) => q.tier === 'now').slice(0, 10);
  const num = (t: OppTier, n: number) =>
    `<div class="num ${t === 'now' ? 'win' : ''}"><b>${n}</b><span>${GROUP[t].label}</span><small>${GROUP[t].sub}</small></div>`;
  const all = (['now', 'possible', 'hard'] as OppTier[]).map((t) => {
    const list = s.questions.filter((q) => q.tier === t);
    if (!list.length) return '';
    return `<p class="line" style="margin-top:14px"><b>${GROUP[t].label} (${list.length})</b></p>` +
      list.map((q) => `<div class="item"><h3>${esc(q.question)}</h3><p>${esc(q.why)}</p></div>`).join('');
  }).join('');
  const body =
    header(d) + headline(d, named, s.answers) +
    `<div class="nums">${num('now', s.now)}${num('possible', s.possible)}${num('hard', s.hard)}</div>` +
    insteadBlock(s.rivals) +
    `<section class="sec"><h2>${s.now > 0 ? `${s.now} searches you could win` : 'Searches you could win'}</h2>` +
    (wins.length
      ? `<p class="line">The first ${wins.length} to go for.</p><div class="card">${wins.map((q) =>
          `<div class="item"><h3>${esc(q.question)}</h3><p>${esc(namesLine(q))}</p><span class="chip now">${esc(q.why)}</span></div>`).join('')}</div>`
      : `<p class="line">None yet. See all searches below.</p>`) + `</section>` +
    listedBlock(s.directories) + doBlock() + button(d, 'I saw my AI report and I would like to talk.') +
    `<details><summary>See all searches</summary><div class="inner">${all}</div></details>` + footer();
  return shell(`${d.businessName} - AI search report`, body);
}

/* ═══ HOOK REPORT (first contact) ════════════════════════════════════════════════════════ */

export interface HookQuestion {
  question: string;
  answers: { engine: string; namedYou: boolean; rivals: string[] }[];
}
export interface HookDesignInput extends DesignBase {
  questions: HookQuestion[];
  /** Businesses AI named across these answers, most first. */
  rivals: OppFirm[];
}

/** The page says "Google AI", not the product name. */
const aiLabel = (e: string) => (/gemini/i.test(e) ? 'Google AI' : e);

export function renderHookReport(d0: HookDesignInput): string {
  const d = { ...d0, businessName: shortName(d0.businessName) };
  const answers = d.questions.reduce((n, q) => n + q.answers.length, 0);
  const named = d.questions.reduce((n, q) => n + q.answers.filter((a) => a.namedYou).length, 0);
  const body =
    header(d) + headline(d, named, answers) +
    insteadBlock(d.rivals) +
    `<section class="sec"><h2>Example searches</h2><p class="line">What AI said.</p><div class="card">` +
    d.questions.slice(0, 3).map((q) =>
      `<div class="item"><h3>${esc(q.question)}</h3>` +
      q.answers.map((a) => `<p><b>${esc(aiLabel(a.engine))}:</b> ${a.namedYou ? 'names you' : (a.rivals.length ? esc(a.rivals.slice(0, 2).join(', ')) : 'names nobody')}</p>`).join('') +
      `</div>`).join('') + `</div></section>` +
    button(d, 'I saw my AI report and I would like a call.') + footer();
  return shell(`${d.businessName} - AI search report`, body);
}

/* ═══ CLIENT REPORT (the 20 searches we track) ═══════════════════════════════════════════ */

export interface BaselineDesignInput extends DesignBase {
  /** The tracked searches, in the order the client sees them. */
  questions: OppQuestion[];
  rivals: OppFirm[];
  /** Answers received across the tracked searches, and how many named the business. */
  answers: number;
  namedYou: number;
  directories?: OppDirectory[];
  /** "9 Dec 2026" — when we check again. Omitted = the line says "in 4 weeks". */
  checkAgainLabel?: string;
  /** Kept for callers that still pass them. */
  asks?: number;
  engines?: string;
}

export function renderBaselineReport(d0: BaselineDesignInput): string {
  const d = { ...d0, businessName: shortName(d0.businessName) };
  const n = d.questions.length;
  const rows = d.questions.map((q, i) =>
    `<div class="item"><h3>${i + 1}. ${esc(q.question)}</h3><p>AI mentioned you: ${q.namedYou} of ${q.answers}</p>${groupChip(q.tier)}</div>`).join('');
  const body =
    header(d) +
    `<section class="sec" style="margin-top:20px"><h2>How often AI mentions you today</h2>` +
    `<div class="hero"><div class="big"><em>${d.namedYou}</em> of ${d.answers}</div><p class="line">AI answers that mentioned you.</p><span class="tag">Checked ${esc(d.dateLabel)}</span></div></section>` +
    `<section class="sec"><h2>The ${n} searches we track</h2><p class="line">Today's result for each.</p><div class="card">${rows}</div></section>` +
    `<section class="sec"><h2>We check again ${d.checkAgainLabel ? `on ${esc(d.checkAgainLabel)}` : `in ${REMEASURE_WEEKS_STANDARD} weeks`}</h2><p class="line">Same ${n} searches. Same AI.</p></section>` +
    doBlock() + button(d, 'a question about my report.') + footer();
  return shell(`${d.businessName} - AI search report`, body);
}

/* ═══ Which design a stored audit gets ═══════════════════════════════════════════════════ */

export type ReportDesignKind = 'opportunity' | 'baseline' | 'hook';

/** Pure choice, so the edge function and the tests share one rule. null = keep the classic report.
 *  A report that is still measuring, or whose business name cannot be judged, always keeps the classic page
 *  (those two states have their own careful wording there). The day-28 re-measure keeps it too. */
export function chooseReportDesign(o: {
  auditPurpose?: string | null;
  paidKind?: 'baseline' | 'remeasure' | null;
  hookComplete: boolean;
  measuring: boolean;
  nameNotJudgeable?: boolean;
  classic?: boolean;
}): ReportDesignKind | null {
  if (o.classic || o.measuring || o.nameNotJudgeable) return null;
  if (o.paidKind === 'remeasure') return null;
  if (o.paidKind === 'baseline') return 'baseline';
  if (String(o.auditPurpose ?? '').trim().toLowerCase() === 'discovery') return 'opportunity';
  if (o.hookComplete) return 'hook';
  return null;
}
