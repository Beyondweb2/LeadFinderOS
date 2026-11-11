/* ═══════════════════════════════════════════════════════════════════════════════════════
   REPORT DESIGN — ONE template for the three client-facing report pages, in Findable's own look. (2026-11-11)

     opportunity  the longer report (a Discovery audit): your best 10 targets.
     hook         first contact: three example searches.
     baseline     the client's tracked searches, and when we check again.

   SAME ORDER FOR ALL THREE:  1 AI score + headline · 2 AI recommends these instead · 3 Your website check ·
   4 targets (or example / tracked searches) · 5 Get listed on these sites · 6 What we'd do + one button.

   A TEMPLATE: nothing here is specific to a business. Everything shown comes from the ReportModel (reportModel.ts),
   built from that business's own stored answers, website check and dates. Every section handles the edge cases
   (already named a lot, no website, nothing winnable yet, few or no competitors, no listing sites, no website
   check yet, fewer than 10 searches, any trade, any country) with plain wording, and is never an empty box.

   LOOK: the approved Findable look (waitlist audit example layout + Findable tokens): one dark rounded card, numbered
   yellow markers, coloured tiles, gold chips, near-black #0A0A0C/#17181C/#1E1F24, yellow #F5B301 button, the
   "Findable." wordmark, system font stack at weight 900. Plain English, at most two short lines per section; never
   "discovery", "baseline", "verdict", "engines", "fragmented", "citations", "visibility score" or "GEO".

   PRESENTATION ONLY. No website score number (team-only by rule), no promise of a ranking or of being recommended:
   the footer says "These are opportunities, not guarantees."  Pure (no DOM); relative imports carry .ts.
   ═══════════════════════════════════════════════════════════════════════════════════════ */

import { FINDABLE_CONTACT_WHATSAPP, REMEASURE_WEEKS_STANDARD } from './findableOffer.ts';
import type { OppDirectory, OppFirm, OppQuestion, OppTier } from './reportOpportunity.ts';
import type { ReportKind, ReportModel } from './reportModel.ts';

export function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** "London Domestic Maintenance Ltd" -> "London Domestic Maintenance". */
export const shortName = (n: string): string => n.replace(/[\s,]+(ltd|limited)\.?$/i, '').trim() || n;

const GROUP: Record<OppTier, { label: string; tone: 'g' | 'a' | 'r' | 'm' | 'b' }> = {
  now: { label: 'You could win', tone: 'g' },
  possible: { label: 'Possible with work', tone: 'a' },
  hard: { label: 'Hard to win', tone: 'r' },
  nofirms: { label: "AI doesn't name firms yet", tone: 'm' },
  named: { label: 'Keep and grow', tone: 'b' },
  flagged: { label: 'Check this place', tone: 'm' },
};

const WA_BUTTON = 'Talk to Paul on WhatsApp';
const waHref = (businessName: string, text: string) =>
  `https://wa.me/${FINDABLE_CONTACT_WHATSAPP}?text=${encodeURIComponent(`Hi, this is ${businessName} - ${text}`)}`;

/* ── The look ──────────────────────────────────────────────────────────────────────────── */

const CSS = `
:root{color-scheme:dark;--page:#0a0a0c;--card:#17181c;--tile:#1e1f24;--line:#2c2d34;--text:#f7f8fa;--mist:#c3c6cd;--muted:#8f939d;
  --y:#f5b301;--gold:#ffd13f;--on-gold:#2a2100;--green:#4ade80;--amber:#fbbf24;--rose:#fb7185;--blue:#7dd3fc;
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
.rp{position:relative;display:grid;gap:26px;padding:18px 16px 22px;border-radius:24px;background:var(--card);border:1px solid var(--line);box-shadow:0 30px 70px -30px #000,0 0 0 1px rgba(255,255,255,.03) inset}
.rp-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:6px 14px}
.k{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.k u{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--gold)}
.rp-head b{display:block;font-weight:900;font-size:20px;letter-spacing:-.02em;color:#fff;text-align:right}
.rp-head small{display:block;font-size:13px;font-weight:500;color:var(--muted);text-align:right}
.blk{position:relative;display:grid;gap:10px}
.mk{flex:none;display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:var(--gold);color:#111;font-weight:900;font-size:13px;font-style:normal;box-shadow:0 0 0 4px rgba(255,209,63,.22)}
.blk h2{display:flex;align-items:center;gap:12px;font-size:21px;line-height:1.15}
.blk .line{color:var(--mist);font-size:14.5px;margin:-4px 0 0 38px}
.score{display:grid;gap:4px;padding:16px;border-radius:16px;background:linear-gradient(160deg,rgba(251,113,133,.14),#17181c 72%);border:1px solid rgba(251,113,133,.36)}
.score.a{background:linear-gradient(160deg,rgba(251,191,36,.14),#17181c 72%);border-color:rgba(251,191,36,.36)}
.score.g{background:linear-gradient(160deg,rgba(74,222,128,.15),#17181c 72%);border-color:rgba(74,222,128,.4)}
.score.m{background:linear-gradient(160deg,rgba(143,147,157,.14),#17181c 72%);border-color:var(--line)}
.score b{font-weight:900;font-size:clamp(64px,19vw,92px);line-height:.95;letter-spacing:-.04em;color:var(--rose)}
.score.a b{color:var(--amber)}.score.g b{color:var(--green)}.score.m b{color:var(--mist);font-size:clamp(40px,12vw,56px)}
.score b small{font-size:.32em;font-weight:800;letter-spacing:-.01em;color:var(--mist);margin-left:6px}
.score span{font-size:15.5px;color:#fff;font-weight:700}
.score span em{font-style:normal;color:var(--gold)}
h1{font-size:clamp(24px,6.2vw,34px);line-height:1.12;letter-spacing:-.025em;margin:0}
h1 .hl{color:var(--gold)}
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
.pill{display:inline-block;margin-top:8px;font-size:11.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;border-radius:999px;padding:4px 10px}
.pill.g{color:var(--green);background:rgba(74,222,128,.14);border:1px solid rgba(74,222,128,.35)}
.pill.a{color:var(--amber);background:rgba(251,191,36,.13);border:1px solid rgba(251,191,36,.34)}
.pill.r{color:var(--rose);background:rgba(251,113,133,.13);border:1px solid rgba(251,113,133,.34)}
.pill.m{color:var(--mist);background:rgba(143,147,157,.14);border:1px solid var(--line)}
.pill.b{color:var(--blue);background:rgba(125,211,252,.12);border:1px solid rgba(125,211,252,.32)}
.sub{margin-top:2px;font-size:13px;color:var(--muted)}
.wc{display:grid;gap:0}
.wc .it h3{font-size:16px;font-weight:700;letter-spacing:0}
.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:9px;background:var(--amber)}.dot.s{background:var(--rose)}.dot.ok{background:var(--green)}
.dots{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.dots li{position:relative;padding-left:26px;font-size:16.5px;color:#fff}
.dots li:before{content:"";position:absolute;left:0;top:.42em;width:12px;height:12px;border-radius:50%;background:var(--gold)}
.btn{display:flex;align-items:center;justify-content:center;width:100%;min-height:56px;border-radius:999px;background:var(--y);color:#0a0a0c;font-weight:800;font-size:18px;text-decoration:none;padding:14px 20px;text-align:center;box-shadow:0 8px 24px -8px rgba(245,179,1,.55)}
.foot{display:grid;gap:6px;justify-items:center;margin-top:26px;color:var(--muted);font-size:13px;text-align:center}
.foot .wm{font-size:18px;color:#fff}
@media (min-width:760px){
  .wrap{max-width:780px;padding-bottom:64px}
  .rp{padding:26px 26px 30px;gap:32px}
  h1{font-size:38px}.blk h2{font-size:24px}
}
@media print{body::before{display:none}}
`;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function page(title: string, m: ReportModel, rpBody: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<meta name="robots" content="noindex, nofollow, noarchive"><title>${esc(title)}</title>` +
    `<style>${CSS}</style></head><body><div class="wrap">` +
    `<header class="top"><div class="wm">Findable<i>.</i></div></header>` +
    `<main class="rp"><div class="rp-head"><span class="k"><u></u>AI search report</span><div><b>${esc(shortName(m.businessName))}</b><small>${esc(m.dateLabel)}</small></div></div>${rpBody}</main>` +
    `<footer class="foot"><div class="wm">Findable<i>.</i></div><p>These are opportunities, not guarantees.</p></footer></div></body></html>`;
}

/** A numbered section: marker, heading, one short line, body. Never empty: the caller always passes a body or a line. */
function blk(n: number, title: string, line: string, body: string): string {
  return `<section class="blk"><h2><i class="mk">${n}</i><span>${esc(title)}</span></h2>${line ? `<p class="line">${esc(line)}</p>` : ''}${body}</section>`;
}

/* ── 1. The AI score and the headline ───────────────────────────────────────────────────── */

function scoreBlock(m: ReportModel): string {
  const s = m.score;
  const topLine = m.top ? ` ${esc(m.top.name)}: ${m.top.count}.` : '';
  let tile: string;
  if (s.value === null) {
    tile = `<div class="score m"><b>No score yet</b><span>AI didn't name any business in these answers.</span></div>`;
  } else {
    const tone = m.band === 'high' ? 'g' : m.band === 'some' ? 'a' : '';
    tile = `<div class="score ${tone}"><b>${s.value}<small>/ 100</small></b><span>AI named you <em>${s.named}</em> ${s.named === 1 ? 'time' : 'times'}.${topLine}</span></div>`;
  }
  const where = `${esc(m.what)} in ${esc(m.where)}`;
  let h1: string;
  if (s.value === null) h1 = `<h1>When people ask AI for ${where}, <span class="hl">it names no firms yet.</span></h1>`;
  else if (m.band === 'none') h1 = `<h1>When people ask AI for ${where}, <span class="hl">it doesn't mention you yet.</span></h1>`;
  else if (m.band === 'some') h1 = `<h1>When people ask AI for ${where}, <span class="hl">it mentions you in ${s.named} of ${s.denominator} answers.</span></h1>`;
  else h1 = `<h1>When people ask AI for ${where}, <span class="hl">it names you in ${s.named} of ${s.denominator} answers. Keep it up and grow it.</span></h1>`;
  return `<section class="blk"><h2><i class="mk">1</i><span>Your AI score</span></h2>${tile}${h1}</section>`;
}

/* ── 2. AI recommends these instead ─────────────────────────────────────────────────────── */

function insteadBlock(m: ReportModel, max = 5): string {
  const top = m.rivals.slice(0, max);
  const title = m.band === 'high' ? 'AI also recommends' : 'AI recommends these instead';
  if (!top.length) return blk(2, title, 'AI named no other business in these answers.', '');
  return blk(2, title, 'How often AI named them.', `<div class="chips">${top.map((r) => `<b>${esc(r.name)}<i>${r.count}&times;</i></b>`).join('')}</div>`);
}

/* ── 3. Your website check ──────────────────────────────────────────────────────────────── */

function websiteBlock(m: ReportModel): string {
  const w = m.website;
  if (w.state === 'no_website') return blk(3, 'Your website check', "You don't have a website AI can read yet.", `<p class="sub" style="margin-left:38px">A site AI can read is the first thing we'd build.</p>`);
  if (w.state === 'not_checked') return blk(3, 'Your website check', "We haven't checked your website yet.", `<p class="sub" style="margin-left:38px">It's the first thing we'd look at.</p>`);
  if (w.state === 'clean' || !w.issues.length) return blk(3, 'Your website check', 'We found nothing serious to fix.', '');
  const shown = w.issues.slice(0, 5);
  const serious = w.issues.filter((i) => i.serious).length;
  return blk(3, 'Your website check', serious ? `${plural(serious, 'serious problem')} to fix first.` : `${plural(w.issues.length, 'thing')} to improve.`,
    `<div class="pn wc">${shown.map((i) => `<div class="it"><h3><span class="dot ${i.serious ? 's' : ''}"></span>${esc(i.title)}</h3></div>`).join('')}</div>`);
}

/* ── 4. Targets / example searches / tracked searches ───────────────────────────────────── */

function namesLine(q: OppQuestion): string {
  if (q.tier === 'named') return `AI names you in ${q.namedYou} of ${q.answers} answers`;
  return q.firms.length ? `AI names: ${q.firms.slice(0, 2).map((f) => f.name).join(', ')}` : 'AI names no firm';
}

/** "13 you could win · 22 possible with work · 5 hard to win · 8 where AI names no firms yet" — only the groups that exist. */
export function countsLine(c: ReportModel['counts']): string {
  const parts = [`${c.now} you could win`];
  if (c.possible) parts.push(`${c.possible} possible with work`);
  if (c.hard) parts.push(`${c.hard} hard to win`);
  if (c.nofirms) parts.push(`${c.nofirms} where AI names no firms yet`);
  if (c.named) parts.push(`${c.named} to keep and grow`);
  return parts.join(' · ');
}

function itemHtml(q: OppQuestion, n?: number): string {
  const g = GROUP[q.tier];
  return `<div class="it"><h3>${n ? `${n}. ` : ''}${esc(q.question)}</h3><p>${esc(namesLine(q))}</p><span class="pill ${g.tone}">${esc(q.tier === 'now' || q.tier === 'named' ? q.why : g.label)}</span>${q.tier === 'now' || q.tier === 'named' ? '' : `<p class="sub">${esc(q.why)}</p>`}</div>`;
}

function targetsBlock(m: ReportModel): string {
  const c = m.counts;
  const flagNote = c.flagged ? ` ${plural(c.flagged, 'search')} left out: the place name is unclear.` : '';
  if (m.kind === 'hook') {
    const body = `<div class="pn">${m.examples.slice(0, 3).map((q) =>
      `<div class="it"><h3>${esc(q.question)}</h3>${q.answers.map((a) => `<p><b style="color:#fff">${esc(/gemini/i.test(a.engine) ? 'Google AI' : a.engine)}:</b> ${a.namedYou ? 'names you' : (a.rivals.length ? esc(a.rivals.slice(0, 2).join(', ')) : 'names no firm')}</p>`).join('')}</div>`).join('')}</div>`;
    return blk(4, 'Example searches', 'What AI said.', body);
  }
  if (!m.targets.length) return blk(4, m.kind === 'baseline' ? 'Your searches' : 'Your targets', 'No searches to show yet.', '');
  if (m.kind === 'baseline') {
    return blk(4, `Your ${m.targets.length} searches`, `${countsLine(c)}.${flagNote}`.trim(), `<div class="pn">${m.targets.map((q, i) => itemHtml(q, i + 1)).join('')}</div>`);
  }
  const high = m.band === 'high';
  const title = high ? 'Where to keep and grow' : c.now > 0 ? `${plural(c.now, 'search', 'searches')} you could win` : 'The closest searches to win';
  const line = `${countsLine(c)}.${flagNote}`.trim();
  const note = !high && c.now === 0 ? `<p class="sub" style="margin-left:38px">None you could win yet. These are the closest.</p>` : '';
  return blk(4, title, line, `${note}<div class="pn">${m.targets.map((q) => itemHtml(q)).join('')}</div>`);
}

/* ── 5. Get listed on these sites ───────────────────────────────────────────────────────── */

function listedBlock(m: ReportModel, max = 5): string {
  const top = m.directories.slice(0, max);
  if (!top.length) return blk(5, 'Get listed on these sites', 'No listing sites showed up in these answers yet.', '');
  return blk(5, 'Get listed on these sites', 'AI uses them.',
    `<div class="pn">${top.map((x) => `<div class="row"><b>${esc(x.name)}</b><span>${plural(x.answers, 'answer')}</span></div>`).join('')}</div>`);
}

/* ── 6. What we'd do + one button ───────────────────────────────────────────────────────── */

const BUTTON_TEXT: Record<ReportKind, string> = {
  opportunity: 'I saw my AI report and I would like to talk.',
  hook: 'I saw my AI report and I would like a call.',
  baseline: 'a question about my report.',
};

function doBlock(m: ReportModel): string {
  const w = m.website;
  const first = m.band === 'high' ? 'Keep your best pages strong and add one for each search below.' : m.counts.now > 0 ? 'Make a clear page for each search you could win.' : 'Make a clear page for each of your closest searches.';
  const second = w.state === 'no_website' ? 'Build a website AI can read.' : w.state === 'issues' && w.issues.length ? 'Fix what stops AI reading your website.' : 'Tidy your website and Google profile.';
  const third = m.kind === 'baseline' ? `Check again ${m.checkAgainLabel ? `on ${m.checkAgainLabel}` : `in ${REMEASURE_WEEKS_STANDARD} weeks`} and show you.` : `Check again after ${REMEASURE_WEEKS_STANDARD} weeks and show you.`;
  return `<section class="blk"><h2><i class="mk">6</i><span>What we'd do</span></h2><ul class="dots"><li>${esc(first)}</li><li>${esc(second)}</li><li>${esc(third)}</li></ul>` +
    `<a class="btn" style="margin-top:10px" href="${esc(waHref(shortName(m.businessName), BUTTON_TEXT[m.kind]))}" target="_blank" rel="noopener noreferrer">${WA_BUTTON}</a></section>`;
}

/* ═══ The three reports: one template ═══════════════════════════════════════════════════════ */

export function renderReport(m: ReportModel): string {
  const body = scoreBlock(m) + insteadBlock(m) + websiteBlock(m) + targetsBlock(m) + listedBlock(m) + doBlock(m);
  return page(`${shortName(m.businessName)} - AI search report`, m, body);
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
