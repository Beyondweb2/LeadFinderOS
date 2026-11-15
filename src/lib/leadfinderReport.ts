/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE LEADFINDEROS REPORT PAGE (Paul, 2026-11-15) — what a web developer / agency lead sees at app.leadfinderos.com/r/<code>.

   We send these audits to web devs to sell LeadFinderOS, so the page must not look like Findable:
   ⛔ NO "Findable" ANYWHERE (text, logo, footer, meta, PDF), NO organisation name ("Prepared by …"), NO guarantee, NO price, NO
      sign-up to a Findable plan. The only call to action is LFOS_CTA_LINE → leadfinderos.com.
   ⛔ SAME HONEST CONTENT RULES AS THE FINDABLE PAGES: every number comes from the stored answers in the ReportModel (the same model
      reportDesign.ts renders); the goal is being NAMED, never a ranking or a promise; no winnability score; the "not guarantees"
      line is on the page. A search whose name match cannot be judged says so instead of "Not named".
   THE LOOK is ported from V2's current report style (leadfinderos-v2 apps/web/src/addons/ai_audits/report/report.css): dark sheet,
   Plus Jakarta Sans headings + Inter body, indigo accent, one lane per AI, rival chips, an inverted closing band. The code is not
   shared with V2; only the look.
   Pure (no DOM). IMPORTED BY render-audit-report: relative imports with .ts.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import type { ReportModel } from './reportModel.ts';
import type { OppQuestion } from './reportOpportunity.ts';
import { LFOS_CTA_LINE, LFOS_SITE_URL } from './reportBrand.ts';

export function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const shortName = (n: string): string => n.replace(/[\s,]+(ltd|limited)\.?$/i, '').trim() || n;

/** The LeadFinderOS mark: an indigo rounded square with a location pin cut by a search ring. Inline SVG, no external file. */
export const LFOS_MARK = `<svg class="lf-mark" viewBox="0 0 32 32" width="30" height="30" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#6366f1"/><circle cx="14" cy="14" r="6.5" fill="none" stroke="#fff" stroke-width="3"/><path d="M19 19l6 6" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/></svg>`;
const LOGO = `<span class="lf-logo">${LFOS_MARK}<span class="lf-word">LeadFinder<b>OS</b></span></span>`;

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>` +
  `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@700;800&display=swap" rel="stylesheet">`;

const CSS = `
:root{--bg:#101114;--page:#0a0b0d;--box:#18191d;--box2:#1f2025;--well:#0c0d0f;--border:#2b2c32;--ring:#2b2c32;--fg:#e9e6df;--strong:#f7f5f1;--muted:#9a9890;--you:#22c55e;--rival:#f0596b;--warn:#f5b301;--a:#6366f1;--a-ink:#fff;--gpt:#10a37f;--gem:#4f8df5}
*{box-sizing:border-box}html,body{margin:0;padding:0}
body{background:var(--page);color:var(--fg);font:15px/1.5 Inter,system-ui,-apple-system,Segoe UI,sans-serif;-webkit-font-smoothing:antialiased}
h1,h2,h3,.lf-num{font-family:'Plus Jakarta Sans',Inter,system-ui,sans-serif;color:var(--strong);letter-spacing:-.025em;margin:0}
a{color:inherit}
.lf-wrap{max-width:1040px;margin:0 auto;padding:16px}
.lf-sheet{background:var(--bg);border:1px solid var(--border);border-radius:18px;overflow:hidden}
.lf-body{padding:16px}
.lf-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px;border-bottom:1px solid var(--border)}
.lf-logo{display:inline-flex;align-items:center;gap:9px}.lf-mark{display:block;flex:none}
.lf-word{font:800 17px 'Plus Jakarta Sans',Inter,sans-serif;color:var(--strong);letter-spacing:-.02em}.lf-word b{color:#a5a7ff;font-weight:800}
.lf-headr{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--muted);text-align:right}
.lf-pdf{background:var(--well);border:1px solid var(--border);color:var(--fg);border-radius:999px;padding:6px 12px;font:600 12px Inter,sans-serif;cursor:pointer}
.lf-hero{position:relative;overflow:hidden;border-radius:22px;padding:22px 18px;border:1px solid var(--border);background:radial-gradient(110% 80% at 100% 0%,color-mix(in srgb,var(--a) 28%,transparent),transparent 62%),var(--box);display:grid;gap:18px}
.lf-hero::after{content:'';position:absolute;left:0;right:0;top:0;height:4px;background:linear-gradient(90deg,var(--a),color-mix(in srgb,var(--a) 45%,#fff))}
.lf-eyebrow{font-size:12px;letter-spacing:.09em;text-transform:uppercase;color:#a5a7ff;font-weight:700}
.lf-hero h1{font-size:28px;line-height:1.12;font-weight:800;margin-top:6px}
.lf-place{color:var(--muted);margin-top:6px}
.lf-lead{margin:12px 0 0;max-width:60ch}
.lf-scorebox{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
.lf-ring{--p:0;width:112px;height:112px;flex:none;border-radius:50%;background:conic-gradient(var(--you) calc(var(--p)*1%),var(--ring) 0);display:grid;place-items:center}
.lf-ring>div{width:88px;height:88px;border-radius:50%;background:var(--box);display:grid;place-items:center;text-align:center}
.lf-ring b{font:900 30px 'Plus Jakarta Sans',sans-serif;color:var(--strong);line-height:1}
.lf-ring small{display:block;font-size:10.5px;color:var(--muted);margin-top:2px}
.lf-scoretext{font-size:14px}
.lf-pills{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.lf-pill{display:inline-flex;align-items:center;gap:8px;background:var(--well);border:1px solid var(--border);border-radius:999px;padding:5px 12px 5px 5px;font-size:13px}
.lf-eng{width:22px;height:22px;border-radius:50%;color:#fff;font-size:11px;font-weight:800;display:inline-grid;place-items:center;flex:none}
.lf-eng-chatgpt{background:var(--gpt)}.lf-eng-gemini{background:var(--gem)}
.lf-sec{margin-top:28px}
.lf-sec>h2{font-size:20px;font-weight:800}
.lf-sub{color:var(--muted);margin:4px 0 14px;font-size:14px}
.lf-card{background:var(--box);border:1px solid var(--border);border-radius:18px;padding:16px;break-inside:avoid;page-break-inside:avoid}
.lf-cards{display:grid;gap:12px}
.lf-q{font:800 16px 'Plus Jakarta Sans',sans-serif;color:var(--strong);margin:0 0 12px}
.lf-q i{font-style:normal;color:#a5a7ff}
.lf-lanes{display:grid;gap:10px}
.lf-lane{background:var(--box2);border-radius:14px;padding:12px}
.lf-lanehead{display:flex;align-items:center;justify-content:space-between;gap:8px;font-weight:700;font-size:13.5px}
.lf-lanename{display:inline-flex;align-items:center;gap:8px}
.lf-r1{font-size:12.5px;background:var(--well);border-radius:12px;padding:5px 10px;font-weight:700;color:var(--muted);white-space:nowrap}
.lf-r1-on{background:color-mix(in srgb,var(--you) 14%,var(--well));color:var(--you)}
.lf-r1-off{background:color-mix(in srgb,var(--rival) 12%,var(--well));color:var(--rival)}
.lf-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.lf-chip{font-size:12.5px;padding:4px 10px;border-radius:999px;background:color-mix(in srgb,var(--rival) 13%,transparent);border:1px solid color-mix(in srgb,var(--rival) 38%,transparent);color:var(--fg)}
.lf-chip small{color:var(--muted);margin-left:4px}
.lf-quote{margin:10px 0 0;font-size:13px;color:var(--muted);border-left:2px solid var(--border);padding-left:10px}
.lf-none{font-size:13px;color:var(--muted);margin-top:8px}
.lf-issues{display:grid;gap:8px}
.lf-issue{display:flex;gap:12px;align-items:flex-start;background:var(--box2);border:1px solid var(--border);border-radius:14px;padding:12px 14px}
.lf-dot{width:10px;height:10px;border-radius:50%;background:var(--warn);flex:none;margin-top:6px}
.lf-serious .lf-dot{background:var(--rival);box-shadow:0 0 0 4px color-mix(in srgb,var(--rival) 20%,transparent)}
.lf-tag{display:block;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--warn)}
.lf-serious .lf-tag{color:var(--rival)}
.lf-pair{display:grid;gap:12px}
.lf-pair h3{font-size:16px;font-weight:800;margin-bottom:10px}
.lf-notes{margin:0;padding-left:18px;font-size:14px}.lf-notes li{margin:4px 0}
.lf-try{display:inline-flex;align-items:center;gap:6px;background:var(--a);color:#fff;border-radius:999px;padding:7px 14px;font:800 12.5px 'Plus Jakarta Sans',Inter,sans-serif;text-decoration:none;white-space:nowrap;box-shadow:0 6px 18px -6px color-mix(in srgb,var(--a) 70%,transparent)}
.lf-end{margin-top:32px;border-radius:24px;padding:26px 20px;position:relative;overflow:hidden;border:1px solid color-mix(in srgb,var(--a) 45%,var(--border));background:radial-gradient(120% 90% at 100% 0%,color-mix(in srgb,var(--a) 42%,transparent),transparent 60%),radial-gradient(90% 70% at 0% 100%,color-mix(in srgb,#22d3ee 16%,transparent),transparent 60%),#14152a;break-inside:avoid;page-break-inside:avoid}
.lf-end::before{content:'';position:absolute;left:0;right:0;top:0;height:4px;background:linear-gradient(90deg,var(--a),#a5a7ff,#22d3ee)}
.lf-endtop{display:grid;gap:18px;align-items:center}
.lf-end .lf-eyebrow{display:inline-flex;align-items:center;gap:8px}
.lf-end h2{color:#fff;font-size:28px;line-height:1.1;font-weight:800;margin-top:8px}
.lf-end h2 span{background:linear-gradient(90deg,#a5a7ff,#67e8f9);-webkit-background-clip:text;background-clip:text;color:transparent}
.lf-endsub{margin:10px 0 0;color:#c9c8d6;font-size:15px;max-width:52ch}
.lf-steps{list-style:none;margin:22px 0 0;padding:0;display:grid;gap:10px;counter-reset:s}
.lf-steps li{counter-increment:s;display:flex;gap:12px;align-items:flex-start;background:color-mix(in srgb,#fff 5%,transparent);border:1px solid color-mix(in srgb,#fff 10%,transparent);border-radius:16px;padding:13px 14px}
.lf-steps li::before{content:counter(s);flex:none;width:28px;height:28px;border-radius:9px;background:var(--a);color:#fff;font:800 14px 'Plus Jakarta Sans',sans-serif;display:grid;place-items:center}
.lf-steps b{display:block;color:#fff;font:800 15px 'Plus Jakarta Sans',Inter,sans-serif}
.lf-steps span{display:block;color:#b9b8c6;font-size:13.5px;margin-top:2px}
.lf-ctabox{display:grid;gap:8px;justify-items:stretch}
.lf-btn{display:block;background:linear-gradient(180deg,#7c7ff7,var(--a));color:#fff;font:800 17px 'Plus Jakarta Sans',sans-serif;border-radius:16px;padding:17px 22px;text-decoration:none;text-align:center;box-shadow:0 12px 30px -10px color-mix(in srgb,var(--a) 80%,transparent),inset 0 1px 0 rgba(255,255,255,.25)}
.lf-btn:hover{filter:brightness(1.08)}
.lf-ctanote{text-align:center;font-size:12.5px;color:#a9a8b8}
.lf-proof{margin-top:18px;padding-top:16px;border-top:1px solid color-mix(in srgb,#fff 10%,transparent);display:flex;gap:10px;align-items:center;color:#c9c8d6;font-size:13.5px}
.lf-proof .lf-mark{width:24px;height:24px}
.lf-printurl{display:none;font-weight:800;color:#fff;font-size:16px}
.lf-sticky{position:fixed;left:12px;right:12px;bottom:12px;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:10px;background:#14152a;border:1px solid color-mix(in srgb,var(--a) 50%,var(--border));border-radius:16px;padding:10px 10px 10px 14px;box-shadow:0 12px 32px -8px rgba(0,0,0,.6);font-size:13px;color:#e6e5f0}
.lf-sticky a{background:var(--a);color:#fff;text-decoration:none;font:800 13px 'Plus Jakarta Sans',sans-serif;border-radius:11px;padding:10px 14px;white-space:nowrap}
.lf-sticky b{color:#fff}
body.lf-has-sticky{padding-bottom:84px}
.lf-foot{display:grid;gap:6px;border-top:1px solid var(--border);margin-top:28px;padding-top:16px;font-size:11.5px;color:var(--muted)}
.lf-foot .lf-mark{width:20px;height:20px}
.lf-footrow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.lf-wait{text-align:center;padding:48px 16px}
.lf-wait h1{font-size:26px;margin-bottom:10px}
.lf-pulse{animation:lfp 1.4s ease-in-out infinite}@keyframes lfp{50%{opacity:.45}}
@media (max-width:559px){.lf-headr>span{display:none}.lf-head{padding:12px 14px}.lf-word{font-size:16px}}
@media (min-width:640px){.lf-wrap{padding:32px}}
@media (min-width:760px){
  .lf-body{padding:32px}.lf-head{padding:18px 32px}
  .lf-hero{grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);padding:30px 32px;align-items:center}
  .lf-hero h1{font-size:40px}
  .lf-ring{width:160px;height:160px}.lf-ring>div{width:128px;height:128px}.lf-ring b{font-size:44px}
  .lf-lanes{grid-template-columns:1fr 1fr}
  .lf-pair{grid-template-columns:1fr 1fr}
  .lf-end{padding:36px 38px}
  .lf-endtop{grid-template-columns:minmax(0,1.4fr) minmax(260px,1fr)}
  .lf-end h2{font-size:36px}
  .lf-steps{grid-template-columns:1fr 1fr}
  .lf-sticky{display:none}
  body.lf-has-sticky{padding-bottom:0}
}
@media print{
  @page{size:A4;margin:0}
  html,body{background:var(--bg)!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{font-size:12px}
  .lf-wrap{max-width:none;padding:0}
  .lf-sheet{border:0;border-radius:0;min-height:296mm}
  .lf-head,.lf-body{padding-left:14mm;padding-right:14mm}
  .lf-hero{grid-template-columns:minmax(0,1.35fr) minmax(0,1fr)}
  .lf-hero h1{font-size:30px}
  .lf-ring{width:120px;height:120px}.lf-ring>div{width:96px;height:96px}.lf-ring b{font-size:32px}
  .lf-lanes,.lf-pair{grid-template-columns:1fr 1fr}
  .lf-endtop{grid-template-columns:minmax(0,1.4fr) minmax(0,1fr)}
  .lf-steps{grid-template-columns:1fr 1fr}
  .lf-pdf,.lf-btn,.lf-try,.lf-sticky,.lf-ctanote{display:none!important}
  body.lf-has-sticky{padding-bottom:0}
  .lf-printurl{display:block}
  .lf-card,.lf-issue,.lf-end{break-inside:avoid;page-break-inside:avoid}
}`;

/* ⛔ THE PAGE'S OWN ICON (Paul, 2026-11-15: "make sure it doesnt use lovable favicon"). Without a <link rel="icon"> a browser
   asks the host for /favicon.ico, and on the app's host that was the old Lovable icon. The LeadFinderOS mark, inline. */
export const LFOS_FAVICON = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="#6366f1"/><circle cx="14" cy="14" r="6.5" fill="none" stroke="#fff" stroke-width="3"/><path d="M19 19l6 6" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/></svg>')}`;

function page(title: string, inner: string, opts: { print?: boolean; sticky?: boolean } = {}): string {
  const auto = opts.print ? `<script>addEventListener('load',function(){setTimeout(function(){window.print()},500)})</script>` : '';
  /* Phone only: a slim bar that keeps the one action in reach while they read (hidden on desktop and in the PDF). */
  const sticky = opts.sticky
    ? `<div class="lf-sticky"><span><b>Like this report?</b> Run them for your clients.</span><a href="${LFOS_SITE_URL}" target="_blank" rel="noopener">Start free →</a></div>`
    : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">` +
    `<meta name="description" content="AI visibility report made with LeadFinderOS.">` +
    `<meta name="theme-color" content="#101114">` +
    `<meta property="og:site_name" content="LeadFinderOS"><meta property="og:title" content="${esc(title)}">` +
    `<link rel="icon" type="image/svg+xml" href="${LFOS_FAVICON}"><link rel="apple-touch-icon" href="${LFOS_FAVICON}">` +
    `<title>${esc(title)}</title>${FONTS}<style>${CSS}</style></head>` +
    `<body${opts.sticky ? ' class="lf-has-sticky"' : ''}><div class="lf-wrap"><div class="lf-sheet">${inner}</div></div>${sticky}${auto}</body></html>`;
}

function header(dateLabel: string): string {
  return `<header class="lf-head">${LOGO}<div class="lf-headr"><span>AI visibility report<br>${esc(dateLabel)}</span>` +
    `<a class="lf-try" href="${LFOS_SITE_URL}" target="_blank" rel="noopener">Try it free</a>` +
    `<button class="lf-pdf" type="button" onclick="window.print()">PDF</button></div></header>`;
}

function footer(dateLabel: string, asks: number): string {
  return `<footer class="lf-foot"><div class="lf-footrow">${LFOS_MARK}<span>Made with LeadFinderOS · <a href="${LFOS_SITE_URL}">leadfinderos.com</a></span></div>` +
    `<div>Measured on ChatGPT and Gemini${asks > 1 ? `, each search asked ${asks} times` : ''}.</div>` +
    `<div>AI answers change from day to day. AI visibility can be improved; it cannot be guaranteed. These are measurements, not guarantees. Snapshot taken ${esc(dateLabel)}.</div></footer>`;
}

/* THE CLOSING SECTION (Paul, 2026-11-15: "make conversion better"). LeadFinderOS-themed, not an off-brand cream band: the CTA
   line as the headline, what the app does in four steps (only what it really does: the same claims as the webdev_report /
   webdev_hook templates), one big button, and "this report was made with it" as the proof. No price, no terms, no promise. */
const STEPS: [string, string][] = [
  ['Find local businesses', 'Search any trade in any town and get a list of businesses to pitch.'],
  ['Audit them', 'Run SEO and AI visibility audits like this one on each business.'],
  ['Reach out from the app', 'SMS, WhatsApp or call them, and send them their own report.'],
  ['Show the difference', 'Pitch an AI-optimised website, then re-run the audit monthly to measure it.'],
];
function closing(): string {
  /* LFOS_CTA_LINE, word for word: the headline and the line under it. */
  const [ctaHead, ...ctaRest] = LFOS_CTA_LINE.split('. ');
  return `<section class="lf-end" aria-label="${esc(LFOS_CTA_LINE)}"><div class="lf-endtop"><div>` +
    `<div class="lf-eyebrow">For web designers, SEOs and agencies</div>` +
    `<h2>${esc(ctaHead.replace(/ for your clients$/, ''))} <span>for your clients</span>.</h2>` +
    `<p class="lf-endsub">${esc(ctaRest.join('. '))}. Find local businesses, audit them and send them a report like this one, all in one app.</p></div>` +
    `<div class="lf-ctabox"><a class="lf-btn" href="${LFOS_SITE_URL}" target="_blank" rel="noopener">Start free at leadfinderos.com →</a>` +
    `<span class="lf-ctanote">Free to try</span><p class="lf-printurl">Start free at leadfinderos.com</p></div></div>` +
    `<ol class="lf-steps">${STEPS.map(([t, d]) => `<li><div><b>${esc(t)}</b><span>${esc(d)}</span></div></li>`).join('')}</ol>` +
    `<div class="lf-proof">${LFOS_MARK}<span>This report was made with LeadFinderOS.</span></div></section>`;
}

const ENGINES: { key: 'chatgpt' | 'gemini'; label: string; mark: string }[] = [
  { key: 'chatgpt', label: 'ChatGPT', mark: 'C' },
  { key: 'gemini', label: 'Gemini', mark: 'G' },
];

function sameAsBusiness(name: string, business: string): boolean {
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  const b = shortName(business).toLowerCase().replace(/[^a-z0-9]/g, '');
  return !!n && !!b && (n === b || n.includes(b) || b.includes(n));
}

function lane(q: OppQuestion, k: 'chatgpt' | 'gemini', label: string, mark: string, business: string, judgeable: boolean): string {
  const e = q.engines[k];
  const status = !e.answers
    ? `<span class="lf-r1">No answer</span>`
    : !judgeable
      ? `<span class="lf-r1">Answer recorded</span>`
      : e.named > 0
        ? `<span class="lf-r1 lf-r1-on">✓ Named you${e.answers > 1 ? ` ${e.named}/${e.answers}` : ''}</span>`
        : `<span class="lf-r1 lf-r1-off">✕ Not named</span>`;
  const firms = e.firms.filter((f) => !sameAsBusiness(f.name, business)).slice(0, 6);
  const chips = firms.length
    ? `<div class="lf-chips">${firms.map((f) => `<span class="lf-chip">${esc(f.name)}</span>`).join('')}</div>`
    : e.answers ? `<p class="lf-none">No other business named.</p>` : '';
  const quote = e.snippet ? `<p class="lf-quote">“${esc(e.snippet)}”</p>` : '';
  return `<div class="lf-lane"><div class="lf-lanehead"><span class="lf-lanename"><span class="lf-eng lf-eng-${k}">${mark}</span>${label}</span>${status}</div>${chips}${quote}</div>`;
}

function searchCard(q: OppQuestion, business: string, judgeable: boolean): string {
  return `<article class="lf-card"><p class="lf-q"><i>“</i>${esc(q.question)}<i>”</i></p>` +
    `<div class="lf-lanes">${ENGINES.map((x) => lane(q, x.key, x.label, x.mark, business, judgeable)).join('')}</div></article>`;
}

function websiteBlock(m: ReportModel): string {
  const w = m.website;
  let inner: string;
  if (w.state === 'no_website') inner = `<p class="lf-none">We could not find a website for this business, so AI has no site of theirs to read.</p>`;
  else if (w.state === 'not_checked') inner = `<p class="lf-none">The website has not been checked yet.</p>`;
  else if (w.state === 'clean' || !w.issues.length) inner = `<p class="lf-none">The website check found nothing serious stopping AI reading the site.</p>`;
  else inner = `<div class="lf-issues">${w.issues.slice(0, 6).map((i) => `<div class="lf-issue${i.serious ? ' lf-serious' : ''}"><span class="lf-dot"></span><div><span class="lf-tag">${i.serious ? 'Serious' : 'Worth fixing'}</span>${esc(i.title)}</div></div>`).join('')}</div>`;
  return `<div class="lf-card"><h3>What we found on the website</h3>${inner}</div>`;
}

function rivalsBlock(m: ReportModel): string {
  const rivals = m.rivals.filter((f) => !sameAsBusiness(f.name, m.businessName)).slice(0, 8);
  const body = rivals.length
    ? `<div class="lf-chips">${rivals.map((f) => `<span class="lf-chip">${esc(f.name)}<small>${f.count} ${f.count === 1 ? 'answer' : 'answers'}</small></span>`).join('')}</div>`
    : `<p class="lf-none">The answers did not name another business.</p>`;
  return `<div class="lf-card"><h3>Named instead</h3>${body}</div>`;
}

export interface LfosRenderOpts {
  print?: boolean;
  /** The name match could not be judged (auditReport nameNotJudgeable): no "Named you" / "Not named" verdicts are shown. */
  nameNotJudgeable?: boolean;
}

/** The LeadFinderOS report for one audit, from the same ReportModel the Findable pages use. */
export function renderLeadfinderReport(m: ReportModel, opts: LfosRenderOpts = {}): string {
  const biz = shortName(m.businessName);
  const judgeable = opts.nameNotJudgeable !== true;
  const place = m.place || m.where;
  const sc = m.score;
  const pct = judgeable && sc.value !== null ? sc.value : null;
  const ring = `<div class="lf-ring" style="--p:${pct ?? 0}"><div><span><b class="lf-num">${pct === null ? '–' : `${pct}%`}</b><small>named</small></span></div></div>`;
  const scoreText = !judgeable
    ? `We recorded every answer, but could not tell from them whether AI meant ${esc(biz)}.`
    : sc.value === null
      ? `None of the ${sc.answers} answers named any business.`
      : `Named in ${sc.named} of the ${sc.denominator} answers that named a business.`;
  const pills = judgeable
    ? `<div class="lf-pills">${ENGINES.map((x) => { const e = m.engines[x.key]; return `<span class="lf-pill"><span class="lf-eng lf-eng-${x.key}">${x.mark}</span>${x.label}: named in ${e.named} of ${e.answers}</span>`; }).join('')}</div>`
    : '';
  const hero = `<section class="lf-hero"><div><div class="lf-eyebrow">AI visibility check</div><h1>Is AI naming ${esc(biz)}?</h1>` +
    (place ? `<div class="lf-place">${esc(place)}</div>` : '') +
    `<p class="lf-lead">We asked ChatGPT and Gemini the searches a customer makes when looking for ${esc(m.what || 'a business like this')}${m.where ? ` in ${esc(m.where)}` : ''}, and recorded who each answer named.</p></div>` +
    `<div class="lf-scorebox">${ring}<div class="lf-scoretext">${scoreText}${pills}</div></div></section>`;
  const searches = m.all.slice(0, 8);
  const searchSec = `<section class="lf-sec"><h2>${judgeable ? 'Who AI named instead of you' : 'What AI said'}</h2>` +
    `<p class="lf-sub">The exact search, asked of each AI. Green means the answer named ${esc(biz)}.</p>` +
    (searches.length ? `<div class="lf-cards">${searches.map((q) => searchCard(q, m.businessName, judgeable)).join('')}</div>` : `<p class="lf-none">No answers were recorded.</p>`) +
    `</section>`;
  const pair = `<section class="lf-sec lf-pair">${websiteBlock(m)}${rivalsBlock(m)}</section>`;
  const notes = `<section class="lf-sec"><div class="lf-card"><h3>How to read this</h3><ul class="lf-notes">` +
    `<li>Every result above is a real answer from ChatGPT or Gemini, recorded on ${esc(m.dateLabel)}.</li>` +
    `<li>The aim is to be named in the answer. This is not a ranking, and nobody can promise one.</li>` +
    `<li>AI answers change from day to day. These are measurements, not guarantees.</li></ul></div></section>`;
  const inner = header(m.dateLabel) + `<div class="lf-body">${hero}${searchSec}${pair}${notes}${closing()}${footer(m.dateLabel, m.asks)}</div>`;
  return page(`${biz} - AI visibility report | LeadFinderOS`, inner, { print: opts.print, sticky: !opts.print });
}

/** While the audit is still running: no figures, LeadFinderOS-branded, no-store (the caller sets the header). */
export function renderLeadfinderMeasuring(businessName: string, dateLabel: string, runsDone: number, runsTarget: number): string {
  const biz = shortName(businessName);
  const inner = header(dateLabel) + `<div class="lf-body"><div class="lf-wait"><div class="lf-eyebrow lf-pulse">Asking AI…</div>` +
    `<h1>The report for ${esc(biz)} is still being made</h1>` +
    `<p class="lf-sub">${runsTarget > 1 ? `${runsDone} of ${runsTarget} rounds done. ` : ''}No figures are shown until every answer is in. Check back in a few minutes.</p></div>` +
    `${closing()}${footer(dateLabel, 1)}</div>`;
  return page(`${biz} - AI visibility report | LeadFinderOS`, inner);
}

/** The LeadFinderOS address's own "not here" page (never names another brand). */
export function renderLeadfinderUnavailable(msg: string): string {
  const inner = `<header class="lf-head">${LOGO}</header><div class="lf-body"><div class="lf-wait"><h1>Report unavailable</h1><p class="lf-sub">${esc(msg)}</p></div></div>`;
  return page('Report unavailable | LeadFinderOS', inner);
}
