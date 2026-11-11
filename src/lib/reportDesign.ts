/* ═══════════════════════════════════════════════════════════════════════════════════════
   REPORT DESIGN — the three client-facing report pages in the new Findable look.
   Black and Findable yellow, competitors named up front, works on a phone. 2026-11-11.

   PRESENTATION ONLY. These renderers take plain, already-counted input (reportOpportunity.ts
   builds it from the stored answers). They change no score, no stored row and no audit method,
   and they never promise a ranking or a recommendation (Master Standard): every sentence says
   what was measured or what a step is, never what AI will do.

     renderOpportunityReport  Discovery: "N questions you could win", reasons, who AI names today.
     renderHookReport         First contact: who AI recommends instead of you, one next step.
     renderBaselineReport     Client baseline: the locked 20, where they stand, the plan, the 4-week slot.

   ⛔ Operator-only content never goes through here: no winnability labels beyond the three plain
   tiers, no costs, no internal ids. Pure (no DOM); imported by the render-audit-report edge function,
   so relative imports carry an explicit .ts.
   ═══════════════════════════════════════════════════════════════════════════════════════ */

import { FINDABLE_CONTACT_EMAIL, FINDABLE_CONTACT_WHATSAPP, FINDABLE_GUARANTEE, REMEASURE_WEEKS_STANDARD } from './findableOffer.ts';
import { RULE_WORDS, type OppDirectory, type OppFirm, type OppQuestion, type OppSummary, type OppTier } from './reportOpportunity.ts';

export function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export interface DesignBase {
  businessName: string;
  /** "domestic maintenance" — used in sentences, may be "". */
  trade: string;
  /** "London" — may be "". */
  town: string;
  dateLabel: string;
  /** Public link for the footer, e.g. https://findable.live/r/w9ebxk. Optional. */
  shareUrl?: string;
}

/** "London Domestic Maintenance Ltd" -> "London Domestic Maintenance": the legal suffix reads badly in a headline. */
export const shortName = (n: string): string => n.replace(/[\s,]+(ltd|limited)\.?$/i, '').trim() || n;

/** The two engines every discovery and baseline asks. */
const ENGINES_TEXT = 'ChatGPT and Gemini';
const TIER_LABEL: Record<OppTier, string> = { now: 'Winnable', possible: 'Possible', hard: 'Hard' };
const tierLabel = (q: OppQuestion): string => (q.easy ? 'Winnable (easy)' : TIER_LABEL[q.tier]);

const waHref = (businessName: string, text: string) =>
  `https://wa.me/${FINDABLE_CONTACT_WHATSAPP}?text=${encodeURIComponent(`Hi, this is ${businessName} - ${text}`)}`;
const mailHref = (businessName: string, subject: string) =>
  `mailto:${FINDABLE_CONTACT_EMAIL}?subject=${encodeURIComponent(`${subject} - ${businessName}`)}`;

/* ── Shared chrome ─────────────────────────────────────────────────────────────────────── */

const CSS = `
:root{color-scheme:dark;--bg:#0a0b0d;--card:#111317;--card2:#16191f;--line:#242830;--text:#f4f5f7;--muted:#98a0ac;--faint:#6b7280;
  --y:#ffd13f;--on-y:#1a1400;--green:#4ade80;--red:#fb7185;--amber:#fbbf24;--blue:#7dd3fc}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  background-image:radial-gradient(900px 420px at 85% -80px,rgba(255,209,63,.10),transparent 70%)}
a{color:inherit}
.wrap{max-width:980px;margin:0 auto;padding:0 16px 56px}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 0}
.mark{font-weight:800;font-size:20px;letter-spacing:-.02em}.mark i{color:var(--y);font-style:normal}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:999px;padding:11px 18px;font-weight:700;font-size:15px;text-decoration:none;border:1px solid var(--line);color:var(--text);background:var(--card2);min-height:44px}
.btn.y{background:var(--y);color:var(--on-y);border-color:var(--y)}
.btn.sm{padding:8px 14px;min-height:38px;font-size:14px}
.eyebrow{font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
h1{font-size:clamp(28px,6.2vw,46px);line-height:1.08;letter-spacing:-.03em;margin:10px 0 12px;font-weight:800}
h1 em{font-style:normal;color:var(--y)}
h2{font-size:clamp(21px,4.4vw,28px);letter-spacing:-.02em;margin:0 0 6px;font-weight:800}
h3{margin:0;font-size:17px;line-height:1.3;font-weight:700}
.lede{color:var(--muted);font-size:17px;max-width:62ch;margin:0}
.card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:20px}
.hero{padding:8px 0 4px}
.section{margin-top:34px}
.sub{color:var(--muted);margin:0 0 16px;max-width:64ch}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:22px}
.tile{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px}
.tile .n{font-size:clamp(30px,7vw,44px);font-weight:800;letter-spacing:-.03em;line-height:1}
.tile .l{font-size:13px;color:var(--muted);margin-top:6px}
.tile.now{border-color:rgba(74,222,128,.45);background:linear-gradient(180deg,rgba(74,222,128,.10),transparent 70%),var(--card)}.tile.now .n{color:var(--green)}
.tile.possible .n{color:var(--amber)}.tile.hard .n{color:var(--muted)}
.chip{display:inline-flex;align-items:center;border-radius:999px;padding:3px 11px;font-size:12.5px;font-weight:700;white-space:nowrap;border:1px solid var(--line);background:var(--card2);color:var(--muted)}
.chip.now{color:var(--green);border-color:rgba(74,222,128,.5);background:rgba(74,222,128,.10)}
.chip.possible{color:var(--amber);border-color:rgba(251,191,36,.5);background:rgba(251,191,36,.10)}
.chip.hard{color:var(--muted)}
.chip.firm{background:rgba(255,209,63,.12);border-color:rgba(255,209,63,.45);color:var(--y)}
.chip.firm b{color:#fff;margin-left:6px;font-weight:700}
.chip.you{color:var(--green);border-color:rgba(74,222,128,.5);background:rgba(74,222,128,.10)}
.rivals{display:grid;grid-template-columns:minmax(0,1fr);gap:8px}
.rv{display:grid;grid-template-columns:28px minmax(0,1.5fr) minmax(0,1fr) 54px;align-items:center;gap:12px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px}
.rv .pos{color:var(--faint);font-weight:700}
.rv .nm{font-weight:700;overflow-wrap:anywhere}
.bar{height:8px;border-radius:99px;background:#20242c;overflow:hidden}.bar>span{display:block;height:100%;background:var(--y);border-radius:99px}
.rv .ct{text-align:right;font-weight:800}
.note{margin-top:12px;border:1px solid rgba(255,209,63,.35);background:rgba(255,209,63,.07);border-radius:14px;padding:13px 16px}
.qs{display:grid;grid-template-columns:minmax(0,1fr);gap:12px}
.q{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px 18px}
.q-head{display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:12px;align-items:start}
.rank{width:34px;height:34px;border-radius:10px;background:var(--card2);border:1px solid var(--line);display:grid;place-items:center;font-weight:800;color:var(--y)}
.q .why{margin:10px 0 0 46px;color:var(--text)}
.q .why span{display:block;color:var(--muted);font-size:14.5px}
.q .who{margin:10px 0 0 46px;display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.q .who .lab,.q .help .lab{font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);margin-right:4px}
.q .help{margin:10px 0 0 46px;font-size:14.5px;color:#d7dae0}
details.more{margin-top:14px;background:var(--card);border:1px solid var(--line);border-radius:16px}
details.more>summary{cursor:pointer;list-style:none;padding:16px 18px;font-weight:700;min-height:44px}
details.more>summary::-webkit-details-marker{display:none}
details.more>summary:after{content:"+";float:right;color:var(--y);font-size:20px;line-height:1}
details.more[open]>summary:after{content:"\\2212"}
.grp{padding:0 18px 14px}.grp h4{margin:14px 0 6px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 12px;padding:9px 0;border-top:1px solid var(--line);font-size:15px}
.li small{grid-column:1/-1;color:var(--muted);font-size:13.5px}
.cta{margin-top:36px;border-radius:20px;border:1px solid rgba(255,209,63,.45);background:linear-gradient(135deg,rgba(255,209,63,.16),rgba(255,209,63,.03));padding:24px}
.cta p{color:#d7dae0;margin:6px 0 16px;max-width:60ch}.cta .row{display:flex;flex-wrap:wrap;gap:10px}
.foot{margin-top:30px;color:var(--faint);font-size:13px;border-top:1px solid var(--line);padding-top:16px}
.foot p{margin:4px 0}
.rule{margin-top:14px;border:1px solid var(--line);border-radius:14px;background:var(--card);padding:6px 16px}
.rule div{display:grid;grid-template-columns:130px minmax(0,1fr);gap:10px;padding:9px 0;border-top:1px solid var(--line);font-size:14.5px}
.rule div:first-child{border-top:0}.rule b{font-weight:700}
.rule .e{color:var(--green)}.rule .n{color:var(--green)}.rule .p{color:var(--amber)}.rule .h{color:var(--muted)}
.dl{display:grid;gap:8px}.dl .it{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:12px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px}
.dl .it small{display:block;color:var(--muted);font-size:13px}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.step{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px}
.step .no{color:var(--y);font-weight:800;font-size:13px;letter-spacing:.1em}.step h3{margin:6px 0 6px}.step p{margin:0;color:var(--muted);font-size:14.5px}
.cmp{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.cmp .slot{border:1px dashed #3a3f49;border-radius:16px;padding:18px;color:var(--muted)}
.cmp .slot b{display:block;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);margin-bottom:6px}
.cmp .big{font-size:clamp(26px,6vw,38px);font-weight:800;letter-spacing:-.03em;color:var(--text)}
table.bl{width:100%;border-collapse:collapse;font-size:14.5px}
table.bl th{font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);text-align:left;padding:8px 10px;border-bottom:1px solid var(--line)}
table.bl td{padding:11px 10px;border-bottom:1px solid var(--line);vertical-align:top}
table.bl td.nowrap{white-space:nowrap}
.dash{color:var(--faint)}
.hq{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px 18px;display:grid;gap:10px}
.hq .eng{display:grid;grid-template-columns:86px minmax(0,1fr);gap:10px;align-items:start;font-size:15px}
.hq .eng .e{color:var(--muted);font-weight:700;font-size:13px;padding-top:4px;letter-spacing:.04em;text-transform:uppercase}
.hq .eng .names{display:flex;flex-wrap:wrap;gap:6px}
.verdict{margin-top:22px;border-radius:18px;border:1px solid rgba(251,113,133,.45);background:linear-gradient(180deg,rgba(251,113,133,.10),transparent),var(--card);padding:20px}
.verdict.ok{border-color:rgba(74,222,128,.45);background:linear-gradient(180deg,rgba(74,222,128,.10),transparent),var(--card)}
.verdict p{margin:0;font-size:clamp(18px,4vw,22px);font-weight:700;line-height:1.35}
@media (max-width:640px){
  .tiles{grid-template-columns:1fr 1fr 1fr;gap:8px}.tile{padding:12px}
  .rv{grid-template-columns:22px minmax(0,1fr) 44px;grid-template-areas:"p n c" "b b b"}
  .rv .pos{grid-area:p}.rv .nm{grid-area:n}.rv .ct{grid-area:c}.rv .bar{grid-area:b}
  .q-head{grid-template-columns:34px minmax(0,1fr)}.q-head .chip{grid-column:2;justify-self:start}
  .q .why,.q .who,.q .help{margin-left:0}
  .steps,.cmp{grid-template-columns:1fr}
  .rule div{grid-template-columns:1fr;gap:2px}
  .hq .eng{grid-template-columns:1fr;gap:2px}
  table.bl thead{display:none}table.bl,table.bl tbody,table.bl tr,table.bl td{display:block;width:100%}
  table.bl tr{border-bottom:1px solid var(--line);padding:10px 0}table.bl td{border:0;padding:3px 0}
  .top .btn{padding:9px 14px}
}
@media print{body{background:#fff;color:#111}.btn{display:none}}
`;

function shell(title: string, bodyHtml: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<meta name="robots" content="noindex, nofollow, noarchive"><title>${esc(title)}</title>` +
    `<style>${CSS}</style></head><body><div class="wrap">${bodyHtml}</div></body></html>`;
}

function topBar(b: DesignBase, ctaLabel: string, ctaText: string): string {
  return `<header class="top"><div class="mark">Findable<i>.</i></div>` +
    `<a class="btn y sm" href="${esc(waHref(b.businessName, ctaText))}" target="_blank" rel="noopener noreferrer">${esc(ctaLabel)}</a></header>`;
}

function ctaBand(b: DesignBase, heading: string, body: string, wa: string, waText: string, mailSubject: string): string {
  return `<section class="cta"><h2>${esc(heading)}</h2><p>${esc(body)}</p><div class="row">` +
    `<a class="btn y" href="${esc(waHref(b.businessName, waText))}" target="_blank" rel="noopener noreferrer">${esc(wa)}</a>` +
    `<a class="btn" href="${esc(mailHref(b.businessName, mailSubject))}">Email us</a></div></section>`;
}

function footer(b: DesignBase, extra: string[] = []): string {
  return `<footer class="foot">${extra.map((l) => `<p>${esc(l)}</p>`).join('')}` +
    `<p>AI answers change over time: this is a snapshot taken on ${esc(b.dateLabel)}. Prepared for ${esc(b.businessName)} by Findable` +
    `${b.shareUrl ? ` &middot; <a href="${esc(b.shareUrl)}">${esc(b.shareUrl.replace(/^https?:\/\//, ''))}</a>` : ''} &middot; findable.live</p></footer>`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function rivalBars(rivals: OppFirm[], total: number, max = 6): string {
  const top = rivals.slice(0, max);
  if (!top.length) return '';
  const peak = top[0].count || 1;
  return `<div class="rivals">${top.map((r, i) =>
    `<div class="rv"><span class="pos">${i + 1}</span><span class="nm">${esc(r.name)}</span>` +
    `<span class="bar"><span style="width:${Math.max(6, Math.round((r.count / peak) * 100))}%"></span></span>` +
    `<span class="ct">${r.count}</span></div>`).join('')}</div>` +
    `<p class="sub" style="margin-top:10px;font-size:13.5px">Number of the ${total} AI answers that named each business.</p>`;
}

function firmChips(q: OppQuestion, n = 3): string {
  const answers = q.answers;
  if (!q.firms.length) return `<span class="chip">No business named</span>`;
  return q.firms.slice(0, n).map((f) => `<span class="chip firm">${esc(f.name)}<b>${f.count}/${answers}</b></span>`).join('');
}

/** The winnable rule in plain words, printed on every report that sorts questions. */
function ruleBox(): string {
  const cls: Record<string, string> = { easy: 'e', now: 'n', possible: 'p', hard: 'h' };
  return `<div class="rule">${RULE_WORDS.map((r) => `<div><b class="${cls[r.key]}">${esc(r.label)}</b><span>${esc(r.text)}</span></div>`).join('')}</div>` +
    `<p class="sub" style="margin-top:8px;font-size:13.5px">Fragmented answers alone are never enough for Winnable. This is not a promise that AI will name you.</p>`;
}

/** "Get listed here first": the directories and review sites AI cites, most first. Never a competitor list. */
function listedBox(dirs: OppDirectory[], answers: number, max = 6): string {
  const top = dirs.slice(0, max);
  if (!top.length) return '';
  return `<section class="section"><h2>Get listed here first</h2><p class="sub">Directories and review sites AI named or cited as a source, most often first. They are where customers find and check businesses, not competitors.</p>` +
    `<div class="dl">${top.map((x, i) => `<div class="it"><span style="color:var(--faint);font-weight:700">${i + 1}</span><span><b>${esc(x.name)}</b><small>in ${plural(x.questions, 'question')}</small></span><span style="font-weight:800">${x.answers} of ${answers}</span></div>`).join('')}</div>` +
    `<p class="sub" style="margin-top:10px;font-size:13.5px">Number of the ${answers} AI answers that named or cited each one.</p></section>`;
}

/* ═══ 1. DISCOVERY / OPPORTUNITY ═════════════════════════════════════════════════════════ */

export interface OpportunityDesignInput extends DesignBase {
  summary: OppSummary;
  /** "ChatGPT and Gemini" */
  engines?: string;
  asks: number;
  /** How many of the best to list up front. */
  bestCount?: number;
}

function qCard(q: OppQuestion, i: number): string {
  return `<article class="q"><div class="q-head"><span class="rank">${i + 1}</span><h3>${esc(q.question)}</h3>` +
    `<span class="chip ${q.tier}">${tierLabel(q)}</span></div>` +
    `<p class="why">${esc(q.reasons[0] ?? '')}${q.reasons.slice(1, 3).map((r) => `<span>${esc(r)}</span>`).join('')}</p>` +
    `<div class="who"><span class="lab">AI names today</span>${firmChips(q)}</div>` +
    (q.help ? `<p class="help"><span class="lab">Most likely to help</span>${esc(q.help)}</p>` : '') + `</article>`;
}

export function renderOpportunityReport(d0: OpportunityDesignInput): string {
  const d = { ...d0, businessName: shortName(d0.businessName) };
  const engines = (d0 as { engines?: string }).engines ?? ENGINES_TEXT;
  const s = d.summary;
  const total = s.questions.length;
  const bestN = Math.min(d.bestCount ?? 20, s.best.length);
  const best = s.best.slice(0, bestN);
  const bestSet = new Set(best.map((q) => q.question));
  const rest = s.questions.filter((q) => !bestSet.has(q.question));
  const grp = (tier: OppTier) => {
    const list = rest.filter((q) => q.tier === tier);
    if (!list.length) return '';
    return `<h4>${TIER_LABEL[tier]} (${list.length})</h4>` + list.map((q) =>
      `<div class="li"><span>${esc(q.question)}</span><span class="chip ${q.tier}">${tierLabel(q)}</span><small>${esc(q.reasons[0] ?? '')}</small></div>`).join('');
  };
  const leaders = s.rivals[0];
  const topNote = leaders
    ? `No single business owns these answers: the most-named, ${leaders.name}, appears in ${leaders.count} of ${s.answers}.`
    : '';
  const where = d.trade ? `${d.trade}${d.town ? ` in ${d.town}` : ''}` : (d.town || '');

  const body =
    topBar(d, 'WhatsApp Paul', 'I saw my AI opportunity report and would like to talk it through.') +
    `<section class="hero"><div class="eyebrow">AI visibility &middot; opportunity report &middot; ${esc(d.dateLabel)}</div>` +
    `<h1><em>${s.now}</em> questions ${esc(d.businessName)} could win</h1>` +
    `<p class="lede">We asked ${esc(engines)} ${total} questions customers might ask${where ? ` about ${esc(where)}` : ''}, ${d.asks} times each. On these ${s.now}, no single business is named in most answers, and they are services you offer in your area.</p>` +
    `<div class="tiles"><div class="tile now"><div class="n">${s.now}</div><div class="l">Winnable</div></div>` +
    `<div class="tile possible"><div class="n">${s.possible}</div><div class="l">Possible</div></div>` +
    `<div class="tile hard"><div class="n">${s.hard}</div><div class="l">Hard</div></div></div>` +
    `<p class="sub" style="margin-top:12px;font-size:13.5px">${total} questions &middot; ${s.answers} AI answers. The evidence is shown beside each question. Winnable is not a promise that AI will name you.</p>` +
    `<div class="section" style="margin-top:20px"><h2 style="font-size:20px">How we sort the questions</h2>${ruleBox()}</div></section>` +

    (s.rivals.length
      ? `<section class="section"><h2>AI names these businesses instead</h2><p class="sub">Across every answer, these are the businesses AI named most.</p>` +
        rivalBars(s.rivals, s.answers) + (topNote ? `<div class="note">${esc(topNote)}</div>` : '') + `</section>`
      : '') +

    `<section class="section"><h2>The ${bestN} to start with</h2><p class="sub">Ranked: Winnable first, then questions in your own patch and on services your website already shows.</p>` +
    `<div class="qs">${best.map(qCard).join('')}</div>` +
    (rest.length
      ? `<details class="more"><summary>The other ${rest.length} questions we asked</summary><div class="grp">${grp('now')}${grp('possible')}${grp('hard')}</div></details>`
      : '') + `</section>` +

    listedBox(s.directories, s.answers) +
    ctaBand(d, 'Next step', `Talk it through with us. We will go through the ${bestN} questions, what each one needs, and which to measure first.`,
      'WhatsApp Paul', 'I saw my AI opportunity report and would like to talk it through.', 'AI opportunity report') +
    footer(d, [`Method: ${total} questions, each asked ${d.asks} times to ${engines}, ${s.answers} answers in total. A business is counted when an answer names it.`]);
  return shell(`${d.businessName} - AI opportunity report`, body);
}

/* ═══ 2. HOOK (first contact) ═════════════════════════════════════════════════════════════ */

export interface HookQuestion {
  question: string;
  answers: { engine: string; namedYou: boolean; rivals: string[] }[];
}
export interface HookDesignInput extends DesignBase {
  questions: HookQuestion[];
  /** Businesses AI named across these answers, most first. */
  rivals: OppFirm[];
}

export function renderHookReport(d0: HookDesignInput): string {
  const d = { ...d0, businessName: shortName(d0.businessName) };
  const engines = (d0 as { engines?: string }).engines ?? ENGINES_TEXT;
  const answers = d.questions.reduce((n, q) => n + q.answers.length, 0);
  const named = d.questions.reduce((n, q) => n + q.answers.filter((a) => a.namedYou).length, 0);
  const where = d.trade ? `${d.trade}${d.town ? ` in ${d.town}` : ''}` : (d.town || 'your area');
  const rivalTop = d.rivals.slice(0, 5);
  const verdict = named === 0
    ? `When customers ask AI these questions, it sends them to other businesses. ${d.businessName} was not named in any of these ${answers} answers.`
    : `${d.businessName} was named in ${named} of these ${answers} answers. In the rest, AI named other businesses.`;
  const body =
    topBar(d, 'WhatsApp Paul', 'I saw my AI report and would like a call.') +
    `<section class="hero"><div class="eyebrow">AI visibility check &middot; ${esc(d.dateLabel)}</div>` +
    `<h1>AI recommends these businesses <em>instead of ${esc(d.businessName)}</em></h1>` +
    `<p class="lede">We asked ChatGPT and Gemini ${plural(d.questions.length, 'question')} a customer might ask about ${esc(where)}. This is who they named.</p></section>` +
    (rivalTop.length
      ? `<section class="section" style="margin-top:22px"><div class="card"><div class="eyebrow" style="margin-bottom:10px">Named instead of you</div><div style="display:flex;flex-wrap:wrap;gap:8px">` +
        rivalTop.map((r) => `<span class="chip firm" style="font-size:15px;padding:6px 14px">${esc(r.name)}<b>${r.count}&times;</b></span>`).join('') +
        `</div></div></section>`
      : '') +
    `<div class="verdict${named === 0 ? '' : ' ok'}"><p>${esc(verdict)}</p></div>` +
    `<section class="section"><h2>The questions we asked</h2><div class="qs">` +
    d.questions.map((q) =>
      `<div class="hq"><h3>${esc(q.question)}</h3>` +
      q.answers.map((a) =>
        `<div class="eng"><span class="e">${esc(a.engine)}</span><span class="names">` +
        (a.namedYou ? `<span class="chip you">${esc(d.businessName)}</span>` : '') +
        (a.rivals.length ? a.rivals.slice(0, 4).map((r) => `<span class="chip firm">${esc(r)}</span>`).join('') : (a.namedYou ? '' : `<span class="chip">No business named</span>`)) +
        `</span></div>`).join('') + `</div>`).join('') + `</div></section>` +
    ctaBand(d, 'One next step', 'We can show you which of these questions you could win, and what it would take. Message Paul on WhatsApp or book a call.',
      'WhatsApp Paul', 'I saw my AI report and would like a call.', 'AI report - call') +
    footer(d);
  return shell(`${d.businessName} - who AI recommends`, body);
}

/* ═══ 3. BASELINE (client) ════════════════════════════════════════════════════════════════ */

export interface BaselineDesignInput extends DesignBase {
  /** The locked questions, in the order the client sees them. */
  questions: OppQuestion[];
  rivals: OppFirm[];
  asks: number;
  engines?: string;
  /** Answers received across the locked questions, and how many named the business. */
  answers: number;
  namedYou: number;
  /** Directories and review sites across the locked questions, ranked. */
  directories: OppDirectory[];
}

export function renderBaselineReport(d0: BaselineDesignInput): string {
  const d = { ...d0, businessName: shortName(d0.businessName) };
  const engines = (d0 as { engines?: string }).engines ?? ENGINES_TEXT;
  const n = d.questions.length;
  const now = d.questions.filter((q) => q.tier === 'now').length;
  const poss = d.questions.filter((q) => q.tier === 'possible').length;
  const hard = d.questions.filter((q) => q.tier === 'hard').length;
  const namedQs = d.questions.filter((q) => q.namedYou > 0).length;
  const rows = d.questions.map((q, i) =>
    `<tr><td class="nowrap dash">${i + 1}</td><td><b>${esc(q.question)}</b>` +
    `<div style="color:var(--muted);font-size:13.5px;margin-top:3px">${esc(q.reasons[0] ?? '')}</div></td>` +
    `<td class="nowrap">ChatGPT ${q.chatgptNamed}/${q.chatgptAnswers}<br>Gemini ${q.geminiNamed}/${q.geminiAnswers}</td>` +
    `<td><span class="chip ${q.tier}">${tierLabel(q)}</span></td>` +
    `<td class="dash nowrap">&mdash;</td></tr>`).join('');
  const body =
    topBar(d, 'WhatsApp Paul', 'a question about my baseline report.') +
    `<section class="hero"><div class="eyebrow">AI visibility baseline &middot; ${esc(d.dateLabel)}</div>` +
    `<h1>${esc(d.businessName)}: where you start, and where we aim first</h1>` +
    `<p class="lede">${n} questions, locked. We measure them now, work on them, then ask the same ${n} again after ${REMEASURE_WEEKS_STANDARD} weeks.</p>` +
    `<div class="tiles"><div class="tile now"><div class="n">${now}</div><div class="l">Winnable</div></div>` +
    `<div class="tile possible"><div class="n">${poss}</div><div class="l">Possible</div></div>` +
    `<div class="tile hard"><div class="n">${hard}</div><div class="l">Hard</div></div></div>` +
    `<p class="sub" style="margin-top:12px;font-size:13.5px">The evidence is shown beside each question. Winnable is not a promise that AI will name you.</p>` +
    `<div class="section" style="margin-top:20px"><h2 style="font-size:20px">How we sort the questions</h2>${ruleBox()}</div></section>` +
    (d.rivals.length
      ? `<section class="section"><h2>Who AI names instead of you today</h2><p class="sub">Across these ${n} questions, ${engines}, ${d.asks} asks each.</p>${rivalBars(d.rivals, d.answers)}</section>`
      : '') +
    `<section class="section"><h2>Your ${n} questions</h2>` +
    `<p class="sub">Where you stand now: AI named ${esc(d.businessName)} in ${d.namedYou} of ${d.answers} answers (${namedQs} of ${n} questions). The last column is filled in after ${REMEASURE_WEEKS_STANDARD} weeks.</p>` +
    `<div class="card" style="padding:6px 10px"><table class="bl"><thead><tr><th>#</th><th>Question and why</th><th>Named you now</th><th>Opportunity</th><th>After ${REMEASURE_WEEKS_STANDARD} wks</th></tr></thead><tbody>${rows}</tbody></table></div></section>` +
    `<section class="section"><h2>The plan</h2><div class="steps">` +
    `<div class="step"><span class="no">STEP 1</span><h3>Lock the baseline</h3><p>These ${n} questions, asked of ${esc(engines)} ${d.asks} times each. They do not change.</p></div>` +
    `<div class="step"><span class="no">STEP 2</span><h3>Work on the pages</h3><p>The pages and fixes each question needs, starting with the Winnable ones: a page for the service in your area, backed by reviews.</p></div>` +
    `<div class="step"><span class="no">STEP 3</span><h3>Measure again</h3><p>After ${REMEASURE_WEEKS_STANDARD} weeks we ask the same questions of the same engines and show the two side by side.</p></div></div></section>` +
    `<section class="section"><h2>${REMEASURE_WEEKS_STANDARD}-week comparison</h2><div class="cmp">` +
    `<div class="slot"><b>Baseline</b><div class="big">${d.namedYou} of ${d.answers}</div>answers named ${esc(d.businessName)}</div>` +
    `<div class="slot"><b>After ${REMEASURE_WEEKS_STANDARD} weeks</b><div class="big dash">Not measured yet</div>Same ${n} questions, same engines, same number of asks.</div></div></section>` +
    listedBox(d.directories, d.answers) +
    ctaBand(d, 'Questions?', 'Message Paul and we will go through any question on this page.', 'WhatsApp Paul', 'a question about my baseline report.', 'Baseline report question') +
    footer(d, [FINDABLE_GUARANTEE]);
  return shell(`${d.businessName} - AI visibility baseline`, body);
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
