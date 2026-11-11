/* ═══════════════════════════════════════════════════════════════════════════════════════
   REPORT DESIGN — ONE fixed template for the three client-facing report pages, in Findable's own look.
   (Paul, 2026-11-11, fourth design: the audit example on the LeadFinderOS waitlist page + the Findable site.)

     renderOpportunityReport  "Searches you could win" — the longer report (a Discovery audit).
     renderHookReport         First contact: who AI recommends instead, three example searches, one button.
     renderBaselineReport     The client's 20 tracked searches: today's result, when we check again.

   LOOK, COPIED FROM THE TWO SOURCES (read-only, C:\Users\paulj\leadfinderos-waitlist and \findable-site-current):
     • the waitlist's example audit: one dark rounded card, a small caps label + business name on top, coloured
       score tiles (green / amber / rose gradient, a coloured dot in the label), gold "named instead" chips,
       numbered markers on the card's sections;
     • Findable's tokens (findable-site-current/src/styles/global.css): near-black #0A0A0C / #17181C / #1E1F24,
       yellow #F5B301 for the button and #FFD13F for chips, the wordmark "Findable" + yellow dot, and its SYSTEM font
       stack at weight 900 with tight tracking (no webfont, so nothing is fetched).
   Plain English, at most two short lines per section; never "discovery", "baseline", "verdict", "engines",
   "fragmented", "citations", "visibility score" or "GEO" (scripts/report-design.test.ts pins this).

   PRESENTATION ONLY: plain, already-counted input (reportOpportunity.ts builds it). Never a score, never a promise of
   a ranking or of being recommended; the footer says "These are opportunities, not guarantees."
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
  /** The trade label ("domestic maintenance"). NEVER used in the headline; kept for callers. */
  trade: string;
  /** The audit's town ("London"); the headline prefers the widest region the searches use ("East London"). */
  town: string;
  dateLabel: string;
  shareUrl?: string;
  /** What customers type: "a gas engineer or electrician" (searchPhrase in reportOpportunity.ts). */
  searchWhat?: string;
  /** Where: "East London". */
  searchWhere?: string;
}

/** The three groups, in words a tradesperson reads at a glance. */
const GROUP: Record<OppTier, { label: string; sub: string; tone: 'g' | 'a' | 'r' }> = {
  now: { label: 'You could win', sub: 'No one stands out yet', tone: 'g' },
  possible: { label: 'Possible with work', sub: 'One firm leads, or work needed', tone: 'a' },
  hard: { label: 'Hard to win', sub: 'One firm named almost every time', tone: 'r' },
};

const WA_BUTTON = 'Talk to Paul on WhatsApp';
const waHref = (businessName: string, text: string) =>
  `https://wa.me/${FINDABLE_CONTACT_WHATSAPP}?text=${encodeURIComponent(`Hi, this is ${businessName} - ${text}`)}`;

/* ── The look ──────────────────────────────────────────────────────────────────────────── */

const CSS = `
:root{color-scheme:dark;--page:#0a0a0c;--card:#17181c;--tile:#1e1f24;--line:#2c2d34;--text:#f7f8fa;--mist:#c3c6cd;--muted:#8f939d;
  --y:#f5b301;--gold:#ffd13f;--on-gold:#2a2100;--green:#4ade80;--amber:#fbbf24;--rose:#fb7185;
  --sys:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;background:var(--page)}
body{margin:0;background:var(--page);color:var(--text);font:16px/1.5 var(--sys);-webkit-font-smoothing:antialiased;overflow-x:hidden}
body::before{content:"";position:fixed;inset:0;pointer-events:none;z-index:-1;
  background:radial-gradient(52rem 34rem at 88% -8%,rgba(245,179,1,.13),transparent 62%),radial-gradient(40rem 30rem at -8% 30%,rgba(42,82,160,.10),transparent 60%)}
a{color:inherit}
h1,h2,h3{font-family:var(--sys);font-weight:900;letter-spacing:-.02em;margin:0;color:#fff}
p{margin:0}
.wrap{max-width:720px;margin:0 auto;padding:0 14px 40px}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 2px 14px}
.wm{font-weight:900;font-size:22px;letter-spacing:-.02em;line-height:1}.wm i{font-style:normal;color:var(--y);font-size:1.35em;line-height:0}
.date{font-size:14px;color:var(--muted)}
h1{font-size:clamp(28px,7.4vw,46px);line-height:1.06;letter-spacing:-.03em;margin:6px 2px 18px}
h1 .hl{color:var(--gold)}
.rp{position:relative;display:grid;gap:22px;padding:18px 16px 20px;border-radius:24px;background:var(--card);border:1px solid var(--line);box-shadow:0 30px 70px -30px #000,0 0 0 1px rgba(255,255,255,.03) inset}
.rp-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:6px 14px}
.k{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.k u{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--gold)}
.rp-head b{display:block;font-weight:900;font-size:20px;letter-spacing:-.02em;color:#fff;text-align:right}
.rp-head small{display:block;font-size:13px;font-weight:500;color:var(--muted);text-align:right}
.blk{position:relative;display:grid;gap:10px}
.mk{flex:none;display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:var(--gold);color:#111;font-weight:900;font-size:13px;font-style:normal;box-shadow:0 0 0 4px rgba(255,209,63,.22)}
.mk.c{position:absolute;left:-8px;top:-8px;z-index:2}
.blk h2{display:flex;align-items:center;gap:12px;font-size:21px;line-height:1.15}
.blk .line{color:var(--mist);font-size:14.5px;margin:-4px 0 0 38px}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.t{display:grid;gap:3px;align-content:start;padding:12px 11px;border-radius:14px;background:var(--tile);border:1px solid var(--line)}
.t .k{font-size:10px;letter-spacing:.08em}
.t b{font-weight:900;font-size:36px;line-height:1.05;letter-spacing:-.03em}
.t span{font-size:12px;color:var(--mist);line-height:1.3}
.t.g{background:linear-gradient(160deg,rgba(74,222,128,.14),#17181c 70%);border-color:rgba(74,222,128,.38)}.t.g b{color:var(--green)}.t.g .k u{background:var(--green)}
.t.a{background:linear-gradient(160deg,rgba(251,191,36,.13),#17181c 70%);border-color:rgba(251,191,36,.34)}.t.a b{color:var(--amber)}.t.a .k u{background:var(--amber)}
.t.r{background:linear-gradient(160deg,rgba(251,113,133,.13),#17181c 70%);border-color:rgba(251,113,133,.34)}.t.r b{color:var(--rose)}.t.r .k u{background:var(--rose)}
.pn{display:grid;gap:0;padding:4px 14px;border-radius:14px;background:var(--tile);border:1px solid var(--line)}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chips b{display:inline-flex;align-items:center;gap:8px;font-weight:800;font-size:14px;color:var(--on-gold);background:var(--gold);border-radius:999px;padding:7px 8px 7px 13px}
.chips b i{font-style:normal;font-size:12px;font-weight:800;background:rgba(0,0,0,.16);border-radius:999px;padding:1px 8px}
.row{display:flex;justify-content:space-between;align-items:baseline;gap:12px;padding:12px 0;border-top:1px solid var(--line);font-size:16px}
.row:first-child{border-top:0}
.row b{font-weight:800;color:#fff;overflow-wrap:anywhere}.row span{color:var(--mist);white-space:nowrap;font-size:14px}
.it{padding:13px 0;border-top:1px solid var(--line)}.it:first-child{border-top:0}
.it h3{font-size:17px;line-height:1.25;font-weight:800;letter-spacing:-.01em}
.it p{margin-top:3px;color:var(--mist);font-size:14.5px}
.pill{display:inline-block;margin-top:8px;font-size:11.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;border-radius:999px;padding:4px 10px}
.pill.g{color:var(--green);background:rgba(74,222,128,.14);border:1px solid rgba(74,222,128,.35)}
.pill.a{color:var(--amber);background:rgba(251,191,36,.13);border:1px solid rgba(251,191,36,.34)}
.pill.r{color:var(--rose);background:rgba(251,113,133,.13);border:1px solid rgba(251,113,133,.34)}
.dots{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.dots li{position:relative;padding-left:26px;font-size:16.5px;color:#fff}
.dots li:before{content:"";position:absolute;left:0;top:.42em;width:12px;height:12px;border-radius:50%;background:var(--gold)}
.btn{display:flex;align-items:center;justify-content:center;width:100%;min-height:56px;border-radius:999px;background:var(--y);color:#0a0a0c;font-weight:800;font-size:18px;text-decoration:none;padding:14px 20px;text-align:center;box-shadow:0 8px 24px -8px rgba(245,179,1,.55)}
details{border-radius:14px;background:var(--tile);border:1px solid var(--line)}
summary{cursor:pointer;list-style:none;padding:15px 16px;font-weight:800;min-height:52px;color:#fff}
summary::-webkit-details-marker{display:none}
summary:after{content:"+";float:right;font-size:24px;line-height:1;color:var(--gold)}
details[open] summary:after{content:"\\2212"}
details .in{padding:0 16px 10px}
.grp{margin:14px 0 2px;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.hero{display:grid;gap:4px;padding:16px;border-radius:14px;background:linear-gradient(160deg,rgba(251,113,133,.13),#17181c 70%);border:1px solid rgba(251,113,133,.34)}
.hero b{font-weight:900;font-size:clamp(40px,12vw,56px);line-height:1;letter-spacing:-.03em;color:var(--rose)}
.hero b em{font-style:normal;color:#fff}
.hero span{font-size:14px;color:var(--mist)}
.tag{width:fit-content;margin-top:8px;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--gold);background:rgba(255,209,63,.1);border:1px solid rgba(255,209,63,.3);border-radius:999px;padding:4px 10px}
.foot{display:grid;gap:6px;justify-items:center;margin-top:26px;color:var(--muted);font-size:13px;text-align:center}
.foot .wm{font-size:18px;color:#fff}
@media (min-width:760px){
  .wrap{max-width:780px;padding-bottom:64px}
  .rp{padding:26px 26px 28px;gap:28px}
  .t b{font-size:46px}.t span{font-size:13px}.t .k{font-size:11px}
  .blk h2{font-size:24px}
}
@media (max-width:380px){.t b{font-size:30px}.t{padding:10px 9px}}
@media print{body::before{display:none}}
`;

/** The page: Findable wordmark + date on the dark page, the headline, then the one report card. */
function page(title: string, d: DesignBase, h1: string, rpBody: string, foot: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<meta name="robots" content="noindex, nofollow, noarchive"><title>${esc(title)}</title>` +
    `<style>${CSS}</style></head><body><div class="wrap">` +
    `<header class="top"><div class="wm">Findable<i>.</i></div></header>` +
    h1 +
    `<main class="rp"><div class="rp-head"><span class="k"><u></u>AI search report</span><div><b>${esc(d.businessName)}</b><small>${esc(d.dateLabel)}</small></div></div>${rpBody}</main>` +
    foot + `</div></body></html>`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "a gas engineer or electrician in East London" — what customers type, never the trade label. */
const where = (d: DesignBase) => `${d.searchWhat || 'a business like yours'} in ${d.searchWhere || d.town || 'your area'}`;

/** 2. The one-line headline. */
function headline(d: DesignBase, named: number, answers: number): string {
  return named === 0
    ? `<h1>When people ask AI for ${esc(where(d))}, <span class="hl">it doesn't mention you yet.</span></h1>`
    : `<h1>When people ask AI for ${esc(where(d))}, <span class="hl">it mentions you in ${named} of ${answers} answers.</span></h1>`;
}

/** A numbered section of the card: marker, heading, one short line, body. */
function blk(n: number, title: string, line: string, body: string): string {
  return `<section class="blk"><h2><i class="mk">${n}</i><span>${esc(title)}</span></h2>${line ? `<p class="line">${esc(line)}</p>` : ''}${body}</section>`;
}

/** 8. The one button. */
function button(d: DesignBase, text: string): string {
  return `<a class="btn" href="${esc(waHref(d.businessName, text))}" target="_blank" rel="noopener noreferrer">${WA_BUTTON}</a>`;
}

function footer(): string {
  return `<footer class="foot"><div class="wm">Findable<i>.</i></div><p>These are opportunities, not guarantees.</p></footer>`;
}

/** "AI recommends these instead": the top businesses and how often, as the example's gold chips. */
function insteadBlock(n: number, rivals: OppFirm[], max = 5): string {
  const top = rivals.slice(0, max);
  if (!top.length) return '';
  return blk(n, 'AI recommends these instead', 'How often AI named them.',
    `<div class="chips">${top.map((r) => `<b>${esc(r.name)}<i>${r.count}&times;</i></b>`).join('')}</div>`);
}

/** "Get listed on these sites": the top directories AI uses. */
function listedBlock(n: number, dirs: OppDirectory[], max = 5): string {
  const top = dirs.slice(0, max);
  if (!top.length) return '';
  return blk(n, 'Get listed on these sites', 'AI uses them.',
    `<div class="pn">${top.map((x) => `<div class="row"><b>${esc(x.name)}</b><span>${plural(x.answers, 'answer')}</span></div>`).join('')}</div>`);
}

/** "What we'd do": three short bullets — only things Findable does and measures. */
function doBlock(n: number): string {
  return blk(n, "What we'd do", '', `<ul class="dots"><li>Make a clear page for each search.</li><li>Tidy your website and Google profile.</li><li>Check again after ${REMEASURE_WEEKS_STANDARD} weeks and show you.</li></ul>`);
}

const pill = (t: OppTier) => `<span class="pill ${GROUP[t].tone}">${GROUP[t].label}</span>`;

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
  const tile = (t: OppTier, n: number) =>
    `<div class="t ${GROUP[t].tone}"><span class="k"><u></u>${GROUP[t].label}</span><b>${n}</b><span>${GROUP[t].sub}</span></div>`;
  const all = (['now', 'possible', 'hard'] as OppTier[]).map((t) => {
    const list = s.questions.filter((q) => q.tier === t);
    if (!list.length) return '';
    return `<p class="grp">${GROUP[t].label} (${list.length})</p>` +
      list.map((q) => `<div class="it"><h3>${esc(q.question)}</h3><p>${esc(q.why)}</p></div>`).join('');
  }).join('');
  const body =
    `<div class="blk"><i class="mk c">1</i><div class="tiles">${tile('now', s.now)}${tile('possible', s.possible)}${tile('hard', s.hard)}</div></div>` +
    insteadBlock(2, s.rivals) +
    blk(3, s.now > 0 ? `${s.now} searches you could win` : 'Searches you could win', wins.length ? `The first ${wins.length} to go for.` : 'None yet. See all searches below.',
      wins.length ? `<div class="pn">${wins.map((q) =>
        `<div class="it"><h3>${esc(q.question)}</h3><p>${esc(namesLine(q))}</p><span class="pill g">${esc(q.why)}</span></div>`).join('')}</div>` : '') +
    listedBlock(4, s.directories) + doBlock(5) +
    button(d, 'I saw my AI report and I would like to talk.') +
    `<details><summary>See all searches</summary><div class="in">${all}</div></details>`;
  return page(`${d.businessName} - AI search report`, d, headline(d, named, s.answers), body, footer());
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
    insteadBlock(1, d.rivals) +
    blk(2, 'Example searches', 'What AI said.', `<div class="pn">` + d.questions.slice(0, 3).map((q) =>
      `<div class="it"><h3>${esc(q.question)}</h3>` +
      q.answers.map((a) => `<p><b style="color:#fff">${esc(aiLabel(a.engine))}:</b> ${a.namedYou ? 'names you' : (a.rivals.length ? esc(a.rivals.slice(0, 2).join(', ')) : 'names nobody')}</p>`).join('') +
      `</div>`).join('') + `</div>`) +
    button(d, 'I saw my AI report and I would like a call.');
  return page(`${d.businessName} - AI search report`, d, headline(d, named, answers), body, footer());
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
    `<div class="it"><h3>${i + 1}. ${esc(q.question)}</h3><p>AI mentioned you: ${q.namedYou} of ${q.answers}</p>${pill(q.tier)}</div>`).join('');
  const body =
    blk(1, 'How often AI mentions you today', '',
      `<div class="hero"><b><em>${d.namedYou}</em> of ${d.answers}</b><span>AI answers that mentioned you.</span><span class="tag">Checked ${esc(d.dateLabel)}</span></div>`) +
    blk(2, `The ${n} searches we track`, "Today's result for each.", `<div class="pn">${rows}</div>`) +
    blk(3, `We check again ${d.checkAgainLabel ? `on ${d.checkAgainLabel}` : `in ${REMEASURE_WEEKS_STANDARD} weeks`}`, `Same ${n} searches. Same AI.`, '') +
    doBlock(4) + button(d, 'a question about my report.');
  return page(`${d.businessName} - AI search report`, d, '', body, footer());
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
