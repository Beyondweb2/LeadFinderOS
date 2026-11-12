/* ═══════════════════════════════════════════════════════════════════════════════════════
   REPORT DESIGN — the three client-facing report pages, in the report look of the LeadFinderOS example audit. (2026-11-11)

     hook         first contact: the quick audit. A featured search shown as the ChatGPT and Gemini answer boxes with the
                  businesses "named instead of you", every search in a table, website findings, why it matters.
     opportunity  the longer report: your best opportunity as the same answer boxes, the next targets, who AI recommends
                  instead, website, listing sites.
     baseline     the client's tracked searches: today's score beside a slot for the 4-week check, every search in a table.

   ONE LOOK, THREE BODIES. The look is the example audit's (V2 AuditReport.tsx, read-only): a near-black top with the score
   cards, a warm cream page, white cards, the businesses named instead as yellow pills, a slim Google AI Overview row
   "shown for context, not scored", chips for named / not named, yellow "why this matters" tiles, a soft rose website card
   and a near-black footer. Findable's own wordmark, colours (near-black #101114, gold #FFD13F, button #F5B301) and system
   font stack. No blue. Each report type has its own body so a prospect, a prospect-in-depth and a client each get a page
   built for them.

   A TEMPLATE: nothing here is specific to a business. Everything shown comes from the ReportModel (reportModel.ts) built
   from that business's own stored answers, website check and dates. Every section handles the edge cases (already named a
   lot, no website, nothing winnable yet, few or no competitors, no listing sites, no website check yet, fewer than 10
   searches, any trade, any country) with plain wording, and is never an empty box.

   Plain English, short lines; never "discovery", "baseline", "verdict", "engines", "fragmented", "citations", "visibility
   score" or "GEO". PRESENTATION ONLY: no website score number (team-only), no promise of a ranking or of being recommended;
   the page says "These are opportunities, not guarantees."  Pure (no DOM); relative imports carry .ts.
   ═══════════════════════════════════════════════════════════════════════════════════════ */

import { FINDABLE_CONTACT_WHATSAPP, REMEASURE_WEEKS_STANDARD } from './findableOffer.ts';
import type { EngineFacts, OppFirm, OppQuestion, OppTier } from './reportOpportunity.ts';
import type { ReportKind, ReportModel } from './reportModel.ts';

export function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** "London Domestic Maintenance Ltd" -> "London Domestic Maintenance". */
export const shortName = (n: string): string => n.replace(/[\s,]+(ltd|limited)\.?$/i, '').trim() || n;

const GROUP: Record<OppTier, { label: string; kind: 'y' | 'a' | 'n' | 'na' | 'b' }> = {
  lots: { label: 'Lots of room', kind: 'y' },
  some: { label: 'Some room', kind: 'a' },
  little: { label: 'Little room', kind: 'na' },
  nofirms: { label: "AI doesn't name firms yet", kind: 'na' },
  named: { label: 'Keep and grow', kind: 'b' },
  flagged: { label: 'Check this place', kind: 'na' },
  notoffered: { label: 'Not your service', kind: 'na' },
  notonsite: { label: 'Not on your site yet', kind: 'na' },
};

const WA_BUTTON = 'Talk to Paul on WhatsApp';
const waHref = (businessName: string, text: string) =>
  `https://wa.me/${FINDABLE_CONTACT_WHATSAPP}?text=${encodeURIComponent(`Hi, this is ${businessName} - ${text}`)}`;
const BUTTON_TEXT: Record<ReportKind, string> = {
  opportunity: 'I saw my AI report and I would like to talk.',
  hook: 'I saw my AI report and I would like a call.',
  baseline: 'a question about my report.',
};

/* ── The look (the example audit's stylesheet, in Findable's tokens) ───────────────────────── */

const CSS = `
:root{color-scheme:light;--ink:#101114;--cream:#f7f5f1;--y:#ffd13f;--btn:#f5b301}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--cream);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;line-height:1.45}
h1,h2,h3,p{margin:0}a{color:inherit}
.rp-sheet{max-width:960px;margin:0 auto;background:var(--cream)}
.rp-head{background:var(--ink);color:#fff;padding:24px 32px 18px;display:flex;justify-content:space-between;align-items:flex-start;gap:16px 28px;flex-wrap:wrap}
.rp-wm{font-size:28px;font-weight:900;letter-spacing:-.03em;line-height:1.05;color:#fff}.rp-wm i{font-style:normal;color:var(--btn);font-size:1.3em;line-height:0}
.rp-sub{margin-top:8px;font-size:10.5px;font-weight:700;letter-spacing:.24em;text-transform:uppercase;color:#a3a5ab}
.rp-meta{text-align:right;min-width:0;max-width:100%}
.rp-meta-top{display:flex;justify-content:flex-end;gap:18px;font-size:10.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#a3a5ab}
.rp-date{color:#d4d5d9}
.rp-biz{font-size:20px;font-weight:800;color:#fff;margin-top:4px;letter-spacing:-.01em;overflow-wrap:anywhere}
.rp-where{font-size:13px;color:#bdbec3;margin-top:2px}
.rp-method{margin-top:6px;font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--y)}
.rp-score{background:var(--ink);padding:4px 24px 22px}
.rp-score-in{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:14px;align-items:stretch}
.rp-overall{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:18px;padding:18px 22px}
.rp-k{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#dcdde0}
.rp-k i{width:10px;height:10px;border-radius:3px;background:var(--y);display:inline-block}
.rp-big{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;margin-top:10px;color:#fff}
.rp-big-n{font-size:56px;font-weight:900;letter-spacing:-.05em;line-height:.95;white-space:nowrap}
.rp-big-w{font-size:22px;font-weight:800;color:#bdbec3}
.rp-overall-s{display:block;font-size:14px;color:#ebebed;margin-top:8px;line-height:1.35}
.rp-t-red{color:#ff6b75}.rp-t-amber{color:#ffbe3d}.rp-t-green{color:#4ade80}.rp-t-grey{color:#dcdde0}
.rp-eng{border-radius:18px;padding:16px 18px;border:1px solid rgba(255,255,255,.09);display:flex;flex-direction:column;justify-content:center;min-width:0}
.rp-eng--gpt{background:linear-gradient(160deg,rgba(74,222,128,.10),rgba(255,255,255,.03))}
.rp-eng--gem{background:linear-gradient(160deg,rgba(167,139,250,.16),rgba(255,255,255,.03))}
.rp-eng-h{display:flex;align-items:center;gap:9px;font-size:14px;font-weight:700;color:#fff}
.rp-eng-v{font-size:40px;font-weight:900;letter-spacing:-.04em;line-height:1;margin-top:12px}
.rp-eng-s{font-size:13px;color:#bdbec3;margin-top:6px}
.rp-dot{display:inline-block;width:10px;height:10px;border-radius:50%;flex:none}
.rp-dot--gpt{background:#4ade80}.rp-dot--gem{background:#a78bfa}.rp-dot--aio{background:#a3a5ab}
.rp-aio-line{margin-top:14px;display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;font-size:13px;color:#d4d5d9;padding:10px 14px;border:1px dashed rgba(255,255,255,.18);border-radius:12px}
.rp-aio-line b{color:#fff}.rp-aio-line em{margin-left:auto;font-size:12px;color:#a3a5ab}
.rp-body{background:var(--cream);padding:22px 24px 8px}
.rp-line{font-size:24px;font-weight:900;letter-spacing:-.025em;line-height:1.15;margin:0 2px 8px}
.rp-line em{font-style:normal;background:var(--y);padding:0 6px;border-radius:6px;box-decoration-break:clone;-webkit-box-decoration-break:clone}
.rp-intro{font-size:15px;line-height:1.55;color:#3a3b40;margin:0 2px 18px;max-width:70ch}
.rp-feat,.rp-panel{background:#fff;border:1px solid #e9e5dc;border-radius:20px;padding:22px 24px;margin-bottom:18px;min-width:0}
.rp-panel{padding:18px 20px 16px}
.rp-pill{display:inline-block;background:var(--y);color:var(--ink);font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;padding:6px 12px;border-radius:8px}
.rp-feat-q{margin:14px 0 6px;font-size:26px;font-weight:850;letter-spacing:-.02em;line-height:1.2}
.rp-feat-sub{margin:0 0 16px;font-size:14.5px;color:#55565c}
.rp-ans-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.rp-ans{background:#fff;border:1px solid #e4e0d6;border-radius:16px;padding:16px 18px;min-width:0;display:flex;flex-direction:column}
.rp-ans-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap}
.rp-eng-name{display:inline-flex;align-items:center;gap:9px;font-size:14.5px;font-weight:800}
.rp-inst-k{font-size:10.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#6b6c72;margin:0 0 8px}
.rp-names{display:flex;flex-wrap:wrap;gap:7px;margin:0 0 12px}
.rp-name{display:inline-flex;align-items:center;gap:7px;background:var(--y);color:#000;font-weight:800;font-size:14px;line-height:1.25;padding:7px 12px;border-radius:999px;max-width:100%;overflow-wrap:anywhere}
.rp-name b{font-size:11.5px;background:rgba(0,0,0,.12);border-radius:999px;padding:1px 7px}
.rp-name-more{display:inline-flex;align-items:center;font-size:12.5px;font-weight:700;color:#6b6c72;padding:0 4px}
.rp-ans-k{font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#8a8b90;margin:0 0 4px}
.rp-snip{font-size:13.5px;line-height:1.55;color:#3a3b40;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;line-clamp:3;overflow:hidden;overflow-wrap:anywhere}
.rp-snip--none{display:block;color:#55565c}
.rp-aio{margin-top:12px;background:#fbfaf7;border:1px dashed #dcd7cc;border-radius:14px;padding:11px 16px}
.rp-aio-head{display:flex;align-items:center;gap:8px 12px;flex-wrap:wrap}
.rp-aio-ctx{font-size:12px;color:#7a7b80;font-style:italic;flex:1 1 auto}
.rp-chip{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:5px 11px;border-radius:999px;white-space:nowrap;border:1px solid}
.rp-chip--y{background:#e6f5eb;color:#13703a;border-color:#c5e6d1}
.rp-chip--n{background:#fdebec;color:#c21d2b;border-color:#f6c9cd}
.rp-chip--a{background:#fdf0d8;color:#8a5200;border-color:#f3dcae}
.rp-chip--na{background:#efeeea;color:#5d5e63;border-color:#dedbd3}
.rp-chip--b{background:#e3f1f7;color:#14566f;border-color:#bfdde9}
.rp-ans-head .rp-chip--y{background:#13703a;color:#fff;border-color:#13703a}
.rp-h{display:flex;align-items:center;gap:10px;margin:0 0 12px;font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}
.rp-h::before{content:"";width:18px;height:4px;border-radius:2px;background:var(--y)}
.rp-h-sub{margin:-6px 0 12px;font-size:14px;color:#55565c}
.rp-tbl{width:100%;border-collapse:collapse;table-layout:fixed}
.rp-tbl th{font-size:10.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#6b6c72;text-align:left;padding:4px 10px 10px;border-bottom:1px solid #ebe8e0}
.rp-tbl th.rp-te{width:150px;color:var(--ink)}.rp-tbl th .rp-dot{margin-right:7px}
.rp-tbl td{padding:11px 10px;border-bottom:1px solid #f1eee7;font-size:14.5px;vertical-align:top}
.rp-tbl tr:last-child td{border-bottom:0}
.rp-tq{overflow-wrap:anywhere}.rp-qn{color:#8a8b90}
.rp-tq small{display:block;margin-top:5px}
.rp-cell{display:flex;flex-direction:column;align-items:flex-start;gap:6px;min-width:0}
.rp-np{display:inline-block;max-width:100%;font-size:11.5px;font-weight:800;line-height:1.3;padding:3px 9px;border-radius:999px;background:var(--y);color:#000;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rp-np-more{font-size:11.5px;font-weight:700;color:#6b6c72;white-space:nowrap}
.rp-after{color:#8a8b90;font-size:13px}
.rp-pair{display:grid;grid-template-columns:1.1fr 1fr;gap:18px}
.rp-panel--site{background:#fffafa;border-color:#f3e3e3}
.rp-rows>div+div{border-top:1px solid rgba(16,17,20,.07)}
.rp-issue{display:grid;grid-template-columns:34px 1fr;gap:12px;align-items:center;padding:9px 0}
.rp-ic{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:15px}
.rp-ic--high{background:#fde4e6;color:#c21d2b}.rp-ic--low{background:#fdf0d8;color:#b86e00}
.rp-issue-t{font-size:14.5px;font-weight:800;line-height:1.35}
.rp-sev{display:inline-block;margin-left:6px;font-size:9.5px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;padding:2px 7px;border-radius:999px;vertical-align:2px}
.rp-sev--high{background:#fde4e6;color:#c21d2b}.rp-sev--low{background:#fdf0d8;color:#8a5200}
.rp-issue-p{margin:3px 0 0;font-size:13px;color:#4f5056;line-height:1.45}
.rp-tiles{display:grid;gap:10px}
.rp-tile{display:grid;grid-template-columns:minmax(76px,auto) 1fr;align-items:center;gap:12px;background:var(--y);border-radius:16px;padding:12px 16px}
.rp-tile b{font-size:30px;font-weight:900;letter-spacing:-.04em;line-height:1;text-align:center}
.rp-tile span{font-size:14.5px;font-weight:750;line-height:1.35}
.rp-why{margin-top:12px;font-size:14px;line-height:1.55;color:#3a3b40}
.rp-row{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:11px 0;border-top:1px solid #f1eee7;font-size:15px}
.rp-row:first-child{border-top:0}.rp-row b{font-weight:800;overflow-wrap:anywhere}.rp-row span{color:#6b6c72;white-space:nowrap;font-size:13.5px}
.rp-target{padding:13px 0;border-top:1px solid #f1eee7}.rp-target:first-child{border-top:0}
.rp-target h3{font-size:16.5px;font-weight:800;line-height:1.3}
.rp-target p{margin:4px 0 0;font-size:13.5px;color:#55565c}
.rp-target .rp-names{margin:8px 0 6px}.rp-target .rp-name{font-size:12.5px;padding:5px 10px}
.rp-today{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.rp-today .rp-card{border-radius:16px;padding:16px 18px;background:#fff;border:1px solid #e4e0d6}
.rp-today .rp-card--next{background:#fbfaf7;border-style:dashed;border-color:#dcd7cc}
.rp-today .rp-bigdark{font-size:44px;font-weight:900;letter-spacing:-.04em;line-height:1}
.rp-foot{background:var(--ink);color:#d4d5d9;padding:26px 28px 22px}
.rp-foot h3{margin:0 0 10px;font-size:24px;font-weight:900;letter-spacing:-.02em;color:#fff}
.rp-do{list-style:none;margin:0 0 16px;padding:0;display:grid;gap:8px}
.rp-do li{position:relative;padding-left:24px;font-size:15.5px;color:#fff}
.rp-do li:before{content:"";position:absolute;left:0;top:.45em;width:11px;height:11px;border-radius:50%;background:var(--y)}
.rp-btn{display:inline-flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;padding:13px 24px;border-radius:999px;text-decoration:none;line-height:1.2;background:var(--btn);color:#101114;margin-bottom:18px;min-height:48px}
.rp-foot-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:0 0 18px}
.rp-foot-card{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:14px;padding:12px 16px;min-width:0}
.rp-fk{display:block;font-size:10.5px;letter-spacing:.11em;text-transform:uppercase;color:#9c9da3}
.rp-fv{display:block;margin-top:3px;font-size:13.5px;font-weight:600;color:#fff;overflow-wrap:anywhere}
.rp-foot-brand{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap;padding-top:14px;border-top:1px solid rgba(255,255,255,.10)}
.rp-foot-name{font-size:19px;font-weight:900;letter-spacing:-.02em;color:#fff}.rp-foot-name i{font-style:normal;color:var(--btn)}
.rp-foot-note{margin-top:10px;font-size:12px;line-height:1.5;color:#9c9da3}
@media (max-width:760px){.rp-score-in{grid-template-columns:1fr 1fr}.rp-overall{grid-column:1/-1}}
@media (max-width:640px){
  .rp-head{padding:18px 16px 14px;flex-direction:column;gap:12px}.rp-wm{font-size:24px}.rp-meta{text-align:left;width:100%}.rp-meta-top{justify-content:space-between}
  .rp-score{padding:2px 12px 16px}.rp-score-in{gap:10px}.rp-overall{padding:16px}.rp-big-n{font-size:46px}.rp-eng{padding:13px 14px}.rp-eng-v{font-size:30px;margin-top:8px}.rp-aio-line em{margin-left:0}
  .rp-body{padding:16px 12px 4px}.rp-line{font-size:21px}
  .rp-feat{padding:18px 14px;border-radius:18px}.rp-feat-q{font-size:21px}.rp-ans-grid{grid-template-columns:1fr}.rp-ans{padding:14px}.rp-name{font-size:13px;padding:6px 11px}
  .rp-panel{padding:16px 14px 12px;border-radius:18px}
  .rp-tbl,.rp-tbl tbody{display:block}.rp-tbl thead{display:none}
  .rp-tbl tr{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 10px;border-bottom:1px solid #f1eee7;padding:12px 0}.rp-tbl tr:last-child{border-bottom:0}
  .rp-tbl td{border:0;padding:0;min-width:0}.rp-tbl td.rp-tq{grid-column:1/-1;font-weight:650}
  .rp-tbl td.rp-tr::before{content:attr(data-eng);display:block;font-size:11px;color:#6b6c72;font-weight:600;margin-bottom:4px}
  .rp-pair,.rp-today{grid-template-columns:1fr;gap:0}.rp-today .rp-card+.rp-card{margin-top:10px}
  .rp-tile{grid-template-columns:minmax(62px,auto) 1fr;padding:11px 14px}.rp-tile b{font-size:26px}
  .rp-foot{padding:22px 16px 18px}.rp-foot h3{font-size:21px}.rp-btn{display:flex;width:100%}.rp-foot-grid{grid-template-columns:1fr}
}
@media print{body{background:#fff}.rp-btn{display:none}}
`;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const ENGINE_LABEL = { chatgpt: 'ChatGPT', gemini: 'Gemini' } as const;
const ENGINE_KEY = { chatgpt: 'gpt', gemini: 'gem' } as const;
type Eng = 'chatgpt' | 'gemini';
const ENGS: Eng[] = ['chatgpt', 'gemini'];

const chip = (kind: 'y' | 'a' | 'n' | 'na' | 'b', text: string) => `<span class="rp-chip rp-chip--${kind}">${esc(text)}</span>`;
/* ⛔ NO "N×" TALLIES (Paul, 2026-11-12): how often a firm was named is not shown. `_counts` is kept for callers. */
const pills = (firms: OppFirm[], max = 4, _counts = false) => {
  const shown = firms.slice(0, max);
  return `<div class="rp-names">${shown.map((f) => `<span class="rp-name">${esc(f.name)}</span>`).join('')}${firms.length > shown.length ? `<span class="rp-name-more">+${firms.length - shown.length} more</span>` : ''}</div>`;
};

/* ── Header and score (shared by all three) ─────────────────────────────────────────────── */

const TYPE_LABEL: Record<ReportKind, string> = { hook: 'AI search quick audit', opportunity: 'AI search opportunity report', baseline: 'AI search report · your tracked searches' };

function whereText(m: ReportModel): string { return `${m.what} in ${m.where}`; }

function headlineText(m: ReportModel): string {
  const s = m.score;
  const w = whereText(m);
  if (s.value === null) return `When people ask AI for ${w}, <em>it names no firms yet.</em>`;
  if (m.band === 'none') return `When people ask AI for ${w}, <em>it doesn't mention you yet.</em>`;
  if (m.band === 'some') return `When people ask AI for ${w}, <em>it mentions you in ${s.named} of ${s.denominator} answers.</em>`;
  return `When people ask AI for ${w}, <em>it names you in ${s.named} of ${s.denominator} answers. Keep it up and grow it.</em>`;
}

function engineTone(n: number, a: number): string { return !a ? 'grey' : n === 0 ? 'red' : n / a < 0.5 ? 'amber' : 'green'; }

function headBlock(m: ReportModel): string {
  const searches = m.counts.searches;
  return `<header class="rp-head"><div class="rp-brand"><div class="rp-wm">Findable<i>.</i></div><div class="rp-sub">${TYPE_LABEL[m.kind]}</div></div>` +
    `<div class="rp-meta"><div class="rp-meta-top"><span>Report for</span><span class="rp-date">${esc(m.dateLabel)}</span></div>` +
    `<h1 class="rp-biz">${esc(shortName(m.businessName))}</h1><div class="rp-where">${esc(m.where)}</div>` +
    `<div class="rp-method">${plural(searches, 'search', 'searches')} &times; 2 AI${m.asks > 1 ? ` &times; ${m.asks} asks` : ''} &middot; ${plural(m.score.answers, 'answer')}${m.overview.shown ? ' &middot; plus Google AI, shown for context' : ''}</div></div></header>`;
}

function scoreBlock(m: ReportModel): string {
  const s = m.score;
  const tone = s.value === null ? 'grey' : m.band === 'none' ? 'red' : m.band === 'some' ? 'amber' : 'green';
  const big = s.value === null
    ? `<p class="rp-big rp-t-grey"><span class="rp-big-n" style="font-size:36px">No score yet</span></p>`
    : `<p class="rp-big rp-t-${tone}"><span class="rp-big-n">${s.value}%</span><span class="rp-big-w">of answers</span></p>`;
  const line = s.value === null ? "AI didn't name any business in these answers." : `${s.named} of ${s.denominator} answers that named a business named you.${m.top ? ` ${esc(m.top.name)}: ${m.top.count}.` : ''}`;
  const card = (e: Eng) => {
    const c = m.engines[e];
    const pct = c.answers ? Math.round((c.named / c.answers) * 100) : 0;
    return `<div class="rp-eng rp-eng--${ENGINE_KEY[e]}"><div class="rp-eng-h"><span class="rp-dot rp-dot--${ENGINE_KEY[e]}"></span>${ENGINE_LABEL[e]}</div>` +
      `<b class="rp-eng-v rp-t-${engineTone(c.named, c.answers)}">${c.named} of ${c.answers}</b><span class="rp-eng-s">${pct}% &middot; ${c.named === 0 ? 'named nowhere' : `named in ${plural(c.named, 'answer')}`}</span></div>`;
  };
  const o = m.overview;
  const aio = o.shown
    ? `<p class="rp-aio-line"><span class="rp-dot rp-dot--aio"></span><b>Google AI</b><span>shown on ${o.shown} of ${plural(o.asked, 'search', 'searches')}, named in ${o.named}</span><em>Shown for context, not scored</em></p>` : '';
  return `<section class="rp-score"><div class="rp-score-in"><div class="rp-overall"><span class="rp-k"><i></i>AI named you in</span>${big}<span class="rp-overall-s">${line}</span></div>${card('chatgpt')}${card('gemini')}</div>${aio}</section>`;
}

/* ── The answer boxes (the example's chat cards) ────────────────────────────────────────── */

function answerCard(e: Eng, f: EngineFacts, business: string): string {
  const named = f.named > 0;
  const head = `<div class="rp-ans-head"><span class="rp-eng-name"><span class="rp-dot rp-dot--${ENGINE_KEY[e]}"></span>${ENGINE_LABEL[e]}</span>${named ? chip('y', `✓ Named in ${f.named} of ${f.answers}`) : chip('n', `✕ Not named${f.answers > 1 ? ` in ${f.answers} answers` : ''}`)}</div>`;
  const inst = f.firms.length ? `<div class="rp-inst-k">Named instead of you</div>${pills(f.firms, 4, f.answers > 1)}` : '';
  const snip = f.snippet
    ? `<p class="rp-ans-k">Real answer from ${ENGINE_LABEL[e]}</p><p class="rp-snip">${esc(f.snippet)}</p>`
    : `<p class="rp-snip rp-snip--none">${named ? `${ENGINE_LABEL[e]} named ${esc(business)}.` : `${ENGINE_LABEL[e]} answered without naming ${esc(business)}.`}</p>`;
  return `<article class="rp-ans">${head}${inst}${snip}</article>`;
}

function featuredBlock(m: ReportModel, label: string, sub: string, extra = ''): string {
  const q = m.featured;
  if (!q) return '';
  const business = shortName(m.businessName);
  const aio = q.overview.shown
    ? `<div class="rp-aio"><div class="rp-aio-head"><span class="rp-eng-name"><span class="rp-dot rp-dot--aio"></span>Google AI</span><span class="rp-aio-ctx">Shown for context, not scored</span>${q.overview.named ? chip('y', '✓ Named') : q.overview.firms.length ? chip('n', '✕ Not named') : chip('na', 'Names no firm')}</div>${q.overview.firms.length ? pills(q.overview.firms.map((n) => ({ name: n, count: 1 })), 4) : ''}</div>` : '';
  return `<section class="rp-feat"><span class="rp-pill">${esc(label)}</span><h2 class="rp-feat-q">“${esc(q.question)}”</h2><p class="rp-feat-sub">${esc(sub)}</p>${extra}` +
    `<div class="rp-ans-grid">${ENGS.map((e) => answerCard(e, q.engines[e], business)).join('')}</div>${aio}</section>`;
}

/* ── The search tables ──────────────────────────────────────────────────────────────────── */

function resultCell(f: EngineFacts): string {
  if (!f.answers) return chip('na', 'No answer');
  const c = f.named > 0 ? chip('y', `✓ ${f.named} of ${f.answers}`) : chip('n', `✕ ${f.named} of ${f.answers}`);
  const top = f.firms[0];
  return c + (f.named < f.answers && top ? `<span class="rp-np" title="${esc(top.name)}">${esc(top.name)}</span>${f.firms.length > 1 ? `<span class="rp-np-more">+${f.firms.length - 1} more</span>` : ''}` : '');
}

function tableBlock(m: ReportModel, qs: OppQuestion[], title: string, sub: string, withGroup: boolean, withAfter: boolean): string {
  if (!qs.length) return `<section class="rp-panel"><h2 class="rp-h">${esc(title)}</h2><p class="rp-h-sub">No searches to show yet.</p></section>`;
  const head = `<tr><th>Search</th>${ENGS.map((e) => `<th class="rp-te"><span class="rp-dot rp-dot--${ENGINE_KEY[e]}"></span>${ENGINE_LABEL[e]}</th>`).join('')}${withAfter ? '<th class="rp-te">After 4 weeks</th>' : ''}</tr>`;
  const body = qs.map((q, i) => {
    const g = GROUP[q.tier];
    const label = m.mainQuestions.includes(q.question) ? 'Main search, harder to get named' : g.label;
    return `<tr><td class="rp-tq"><span class="rp-qn">${i + 1}.</span> ${esc(q.question)}${withGroup ? `<small>${chip(g.kind, label)}</small>` : ''}</td>` +
      ENGS.map((e) => `<td class="rp-tr" data-eng="${ENGINE_LABEL[e]}"><div class="rp-cell">${resultCell(q.engines[e])}</div></td>`).join('') +
      (withAfter ? `<td class="rp-tr" data-eng="After 4 weeks"><div class="rp-cell"><span class="rp-after">Not checked yet</span></div></td>` : '') + `</tr>`;
  }).join('');
  return `<section class="rp-panel"><h2 class="rp-h">${esc(title)}</h2>${sub ? `<p class="rp-h-sub">${esc(sub)}</p>` : ''}<table class="rp-tbl"><thead>${head}</thead><tbody>${body}</tbody></table></section>`;
}

/* ── Website findings, listing sites, why it matters ────────────────────────────────────── */

function websitePanel(m: ReportModel): string {
  const w = m.website;
  const wrap = (inner: string) => `<section class="rp-panel rp-panel--site"><h2 class="rp-h">What we found on your website</h2>${inner}</section>`;
  if (w.state === 'no_website') return wrap(`<p class="rp-issue-t">You don't have a website AI can read yet.</p><p class="rp-issue-p">A site AI can read is the first thing we'd build.</p>`);
  if (w.state === 'not_checked') return wrap(`<p class="rp-issue-t">We haven't checked your website yet.</p><p class="rp-issue-p">It's the first thing we'd look at.</p>`);
  if (w.state === 'clean' || !w.issues.length) return wrap(`<p class="rp-issue-t">We found nothing serious to fix.</p>`);
  const serious = w.issues.filter((i) => i.serious).length;
  return wrap(`<p class="rp-issue-p">${serious ? `${plural(serious, 'serious problem')} to fix first.` : `${plural(w.issues.length, 'thing')} to improve.`}</p><div class="rp-rows">${w.issues.slice(0, 5).map((i) =>
    `<div class="rp-issue"><span class="rp-ic rp-ic--${i.serious ? 'high' : 'low'}">!</span><div class="rp-issue-t">${esc(i.title)} <span class="rp-sev rp-sev--${i.serious ? 'high' : 'low'}">${i.serious ? 'Serious' : 'Minor'}</span></div></div>`).join('')}</div>`);
}

function listedPanel(m: ReportModel, max = 5): string {
  const top = m.directories.slice(0, max);
  return `<section class="rp-panel"><h2 class="rp-h">Get listed on these sites</h2>` + (top.length
    ? `<p class="rp-h-sub">AI uses them.</p>${top.map((x) => `<div class="rp-row"><b>${esc(x.name)}</b><span>${plural(x.answers, 'answer')}</span></div>`).join('')}`
    : `<p class="rp-h-sub">No listing sites showed up in these answers yet.</p>`) + `</section>`;
}

function insteadPanel(m: ReportModel, max = 6): string {
  const title = m.band === 'high' ? 'AI also recommends' : 'AI recommends these instead';
  return `<section class="rp-panel"><h2 class="rp-h">${title}</h2>` + (m.rivals.length
    ? `<p class="rp-h-sub">How often AI named them.</p>${pills(m.rivals, max, true)}`
    : `<p class="rp-h-sub">AI named no other business in these answers.</p>`) + `</section>`;
}

function whyPanel(m: ReportModel): string {
  const misses = Math.max(0, m.score.denominator - m.score.named);
  const rivals = m.rivals.length;
  const tiles: string[] = [];
  if (m.score.value === null) tiles.push(`<div class="rp-tile"><b>0</b><span>businesses named in these answers</span></div>`);
  else if (misses > 0) tiles.push(`<div class="rp-tile"><b>${misses}/${m.score.denominator}</b><span>answers that named a business did not name ${esc(shortName(m.businessName))}</span></div>`);
  else tiles.push(`<div class="rp-tile"><b>${m.score.named}/${m.score.denominator}</b><span>answers named ${esc(shortName(m.businessName))}</span></div>`);
  if (misses > 0 && rivals > 0) tiles.push(`<div class="rp-tile"><b>${rivals}</b><span>different ${rivals === 1 ? 'business' : 'businesses'} named instead</span></div>`);
  return `<section class="rp-panel"><h2 class="rp-h">Why this matters</h2><div class="rp-tiles">${tiles.join('')}</div></section>`;
}

/** "AI names different firms each time for 12 of your 31 searches. There's room for you to be one of them." — built from the real counts. */
export function countsLine(c: ReportModel['counts']): string {
  const first = c.lots > 0
    ? `AI names different firms each time for ${c.lots} of your ${plural(c.room, 'search', 'searches')}. There's room for you to be one of them.`
    : c.some > 0
      ? `AI repeats a few firms but changes the rest for ${c.some} of your ${plural(c.room, 'search', 'searches')}. There's still room for you to be one of them.`
      : c.room > 0 ? `AI names the same few firms for most of your ${plural(c.room, 'search', 'searches')}.` : 'No searches to count yet.';
  const rest: string[] = [];
  if (c.lots > 0 && c.some > 0) rest.push(`${c.some} with some room`);
  if (c.little) rest.push(`${c.little} with little room`);
  if (c.nofirms) rest.push(`${c.nofirms} where AI names no firms yet`);
  if (c.named) rest.push(`${c.named} to keep and grow`);
  if (c.notonsite) rest.push(`${c.notonsite} not on your site yet (add a page if you offer them)`);
  return rest.length ? `${first} ${rest.join(' · ')}` : first;
}

/* ── The footer: what we'd do + the one button ──────────────────────────────────────────── */

function footBlock(m: ReportModel): string {
  const w = m.website;
  const first = m.band === 'high' ? 'Keep your best pages strong and add one for each search below.' : m.counts.lots + m.counts.some > 0 ? 'Make a clear page for each search where you can get named.' : 'Make a clear page for each of your searches.';
  const second = w.state === 'no_website' ? 'Build a website AI can read.' : w.state === 'issues' && w.issues.length ? 'Fix what stops AI reading your website.' : 'Tidy your website and Google profile.';
  const third = m.kind === 'baseline' ? `Check again ${m.checkAgainLabel ? `on ${m.checkAgainLabel}` : `in ${REMEASURE_WEEKS_STANDARD} weeks`} and show you.` : `Check again after ${REMEASURE_WEEKS_STANDARD} weeks and show you.`;
  return `<footer class="rp-foot"><h3>What we'd do</h3><ul class="rp-do"><li>${esc(first)}</li><li>${esc(second)}</li><li>${esc(third)}</li></ul>` +
    `<a class="rp-btn" href="${esc(waHref(shortName(m.businessName), BUTTON_TEXT[m.kind]))}" target="_blank" rel="noopener noreferrer">${WA_BUTTON}</a>` +
    `<div class="rp-foot-grid"><div class="rp-foot-card"><span class="rp-fk">Prepared for</span><span class="rp-fv">${esc(shortName(m.businessName))}</span></div>` +
    `<div class="rp-foot-card"><span class="rp-fk">Report date</span><span class="rp-fv">${esc(m.dateLabel)}</span></div>` +
    `<div class="rp-foot-card"><span class="rp-fk">Measured on</span><span class="rp-fv">ChatGPT and Gemini${m.overview.shown ? ' · Google AI (not scored)' : ''}</span></div></div>` +
    `<div class="rp-foot-brand"><span class="rp-foot-name">Findable<i>.</i></span><span class="rp-fk">findable.live</span></div>` +
    `<div class="rp-foot-note"><p>These are opportunities, not guarantees.</p></div></footer>`;
}

/* ═══ The three bodies ═══════════════════════════════════════════════════════════════════════ */

function hookBody(m: ReportModel): string {
  const intro = `We asked AI assistants the searches people make when they look for ${m.what} in ${m.where}, and recorded whether ${esc(shortName(m.businessName))} was named in each answer.`;
  return `<p class="rp-line">${headlineText(m)}</p><p class="rp-intro">${intro}</p>` +
    featuredBlock(m, 'Featured search', 'We asked each AI the same search. Here is what each one said.') +
    websitePanel(m);
}

function opportunityBody(m: ReportModel): string {
  const c = m.counts;
  const high = m.band === 'high';
  const room = c.lots + c.some;
  const label = high ? 'Where to keep and grow' : 'Your best opportunity';
  const sub = 'Here is what each AI said.';
  /* ⛔ A DISCOVERY LISTS ITS WINNABLE SEARCHES AND NOTHING ELSE (Paul, 2026-11-12): no featured block, no "AI recommends
     these instead", no website, no listing sites, no "why this matters". The best search leads the list. */
  const rest = m.targets;
  const flagNote = c.flagged ? ` ${plural(c.flagged, 'search', 'searches')} left out: AI answered for another place.` : '';
  const line = esc(`${countsLine(c)}${flagNote}`);
  const targets = rest.length
    ? `<section class="rp-panel"><h2 class="rp-h">Searches where you can get named</h2><p class="rp-h-sub">${line}</p>${rest.map((q) => {
        const g = GROUP[q.tier];
        const firms = q.firms.slice(0, 3);
        return `<div class="rp-target"><h3>${esc(q.question)}</h3>${firms.length ? pills(firms, 3) : ''}<p>${chip(g.kind, g.label)} ${esc(q.why)}</p></div>`;
      }).join('')}</section>`
    : `<section class="rp-panel"><h2 class="rp-h">Searches where you can get named</h2><p class="rp-h-sub">${line}${room ? '' : ' None with room yet.'}</p></section>`;
  const proof = m.featured ? `<p class="rp-feat-sub" style="margin-top:-8px">${chip(GROUP[m.featured.tier].kind, GROUP[m.featured.tier].label)} ${esc(m.featured.why)}</p>` : '';
  void label; void sub; void proof; void high;
  return `<p class="rp-line">${headlineText(m)}</p>` + targets;
}

function baselineBody(m: ReportModel): string {
  const s = m.score;
  const tone = s.value === null ? 'grey' : m.band === 'none' ? 'red' : m.band === 'some' ? 'amber' : 'green';
  const today = `<section class="rp-panel"><h2 class="rp-h">Today and after ${REMEASURE_WEEKS_STANDARD} weeks</h2><div class="rp-today">` +
    `<div class="rp-card"><span class="rp-k" style="color:#6b6c72"><i></i>AI named you in &middot; ${esc(m.dateLabel)}</span><p class="rp-bigdark rp-t-${tone}" style="margin-top:10px;${tone === 'grey' ? 'color:#5d5e63' : ''}">${s.value === null ? 'No score yet' : `${s.value}%<span style="font-size:18px;color:#6b6c72"> of answers</span>`}</p><p class="rp-h-sub" style="margin:6px 0 0">AI named you ${s.named} ${s.named === 1 ? 'time' : 'times'}.${m.top ? ` ${esc(m.top.name)}: ${m.top.count}.` : ''}</p></div>` +
    `<div class="rp-card rp-card--next"><span class="rp-k" style="color:#6b6c72"><i></i>${m.checkAgainLabel ? `We check again on ${esc(m.checkAgainLabel)}` : `We check again in ${REMEASURE_WEEKS_STANDARD} weeks`}</span><p class="rp-bigdark" style="margin-top:10px;color:#a3a5ab">&mdash;</p><p class="rp-h-sub" style="margin:6px 0 0">Same ${plural(m.counts.searches, 'search', 'searches')}. Same AI.</p></div></div></section>`;
  const c = m.counts;
  const flagNote = c.flagged ? ` ${plural(c.flagged, 'search', 'searches')} left out: AI answered for another place.` : '';
  return `<p class="rp-line">${headlineText(m)}</p>` + today +
    tableBlock(m, m.all, 'Your targeted searches', `We chose searches where you have the best chance of being named, plus your main ones. ${countsLine(c)}.${flagNote}`, true, true) +
    websitePanel(m);
}

/* ═══ The page ═══════════════════════════════════════════════════════════════════════════════ */

export function renderReport(m: ReportModel): string {
  const body = m.kind === 'hook' ? hookBody(m) : m.kind === 'baseline' ? baselineBody(m) : opportunityBody(m);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<meta name="robots" content="noindex, nofollow, noarchive"><title>${esc(shortName(m.businessName))} - AI search report</title>` +
    `<style>${CSS}</style></head><body><div class="rp-sheet">${headBlock(m)}${scoreBlock(m)}<div class="rp-body">${body}</div>${footBlock(m)}</div></body></html>`;
}
export const renderOpportunityReport = (m: ReportModel): string => renderReport({ ...m, kind: 'opportunity' });
export const renderHookReport = (m: ReportModel): string => renderReport({ ...m, kind: 'hook' });
export const renderBaselineReport = (m: ReportModel): string => renderReport({ ...m, kind: 'baseline' });

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
