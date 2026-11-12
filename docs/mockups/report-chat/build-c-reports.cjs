/* Concept C, one template for all four reports (hook, discovery, baseline, welcome pack).
   MOCKUP ONLY: not wired to the app. `render(kind, model)` is pure and never throws on odd input (edge cases: edge-cases.cjs).
   Run directly to write the four HTML files from the stored LDM / ABLM answers (scratchpad mock-data.json). */
const fs = require('fs');
const path = require('path');

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`;
const WORDS = {
  lots: ['Lots of room', 'AI names different firms each time', 'lots'],
  some: ['Some room', 'A few firms repeat, other spots change', 'some'],
  little: ['Little room', 'The same few firms in nearly every answer', 'little'],
  nofirms: ["AI doesn't name firms yet", 'Most answers name no firm', 'nofirms'],
  named: ['Keep and grow', 'AI already names you', 'named'],
  notonsite: ['Not on your site yet', 'Add a page if you offer this', 'notonsite'],
};
const ENGINES = [['chatgpt', 'ChatGPT', 'g1'], ['gemini', 'Gemini', 'g2'], ['google', 'Google AI', 'g3']];

/* Dark, modern look to match findable.live: near-black page, amber accent, bold headline with one amber word,
   eyebrow label, rounded cards. Black header and footer with the Findable wordmark. */
const CSS = `
:root{--bg:#0a0b0f;--card:#13151b;--line:#23262f;--ink:#f4f5f7;--mut:#9aa0ad;--amb:#f5b400;--ambbg:rgba(245,180,0,.12);--red:#ff7a7a;--redbg:rgba(255,90,90,.13);--grn:#3ddc84;--grnbg:rgba(61,220,132,.14)}
*{box-sizing:border-box}html{background:#000}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
.hd{background:#000;border-bottom:1px solid var(--line)}
.hd .in,.ft .in,.main{max-width:720px;margin:0 auto;padding-left:20px;padding-right:20px}
.hd .in{display:flex;align-items:center;justify-content:space-between;height:60px}
.wm{font-weight:900;font-size:22px;letter-spacing:-.03em;color:#fff}.wm i{color:var(--amb);font-style:normal}
.pill-h{font-size:12px;font-weight:700;color:var(--ink);border:1px solid var(--line);border-radius:99px;padding:5px 12px}
.main{padding-top:34px;padding-bottom:44px}
.eyebrow{display:flex;align-items:center;gap:10px;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--mut)}
.eyebrow:before{content:"";width:22px;height:2px;background:var(--amb)}
h1{font-size:clamp(30px,8vw,44px);line-height:1.08;letter-spacing:-.03em;margin:14px 0 10px;font-weight:900}
h1 em{font-style:normal;color:var(--amb)}
h2{font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--mut);margin:40px 0 14px;display:flex;align-items:center;gap:10px}
h2:before{content:"";width:22px;height:2px;background:var(--amb)}
.lead{color:var(--mut);font-size:15px;margin:0 0 6px}
.card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px;margin:0 0 12px}
.q{display:inline-block;max-width:100%;background:var(--amb);color:#111;font-weight:700;font-size:15px;border-radius:16px 16px 16px 4px;padding:8px 14px;margin:0 0 12px}
.fr,.me{display:inline-block;border-radius:99px;padding:4px 12px;font-size:13.5px;font-weight:700;margin:3px 6px 3px 0}
.fr{color:var(--red);background:var(--redbg)}.me{color:var(--grn);background:var(--grnbg)}
.none{color:var(--mut);font-size:14px;white-space:nowrap;display:inline-block;margin:3px 0}
.chips{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 10px}
.chip{border-radius:99px;font-size:11.5px;font-weight:800;padding:3px 10px;background:#23262f;color:var(--mut)}
.chip.lots{background:var(--grnbg);color:var(--grn)}.chip.some{background:var(--ambbg);color:var(--amb)}.chip.little{background:var(--redbg);color:var(--red)}
.chip.nofirms{background:#23262f;color:var(--mut)}.chip.named{background:var(--grnbg);color:var(--grn)}.chip.notonsite{background:rgba(110,160,255,.15);color:#8fb4ff}.chip.main{background:var(--amb);color:#111}
.score{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.slot{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px}
.slot b{display:block;font-size:11.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--mut)}
.slot span{display:block;font-size:34px;font-weight:900;letter-spacing:-.03em;margin-top:4px}
.slot em{display:block;font-style:normal;font-size:12.5px;color:var(--mut)}
.slot.empty span{font-size:19px;color:var(--mut);margin-top:12px;margin-bottom:6px}
.row{display:flex;gap:10px;align-items:flex-start;padding:11px 0;border-top:1px solid var(--line);font-size:15px}.row:first-child{border-top:0}
.sev{font-size:11px;font-weight:800;border-radius:99px;padding:2px 9px;white-space:nowrap;margin-top:3px}
.sev.s{background:var(--redbg);color:var(--red)}.sev.m{background:#23262f;color:var(--mut)}
.note{font-size:13px;color:var(--mut);margin:8px 0 0}
.ft{background:#000;border-top:1px solid var(--line);padding:28px 0 36px}
.ft .in{display:block}.ft p{margin:10px 0 0;color:var(--mut);font-size:13px}.ft a{color:var(--amb);text-decoration:none}
.ft h3{margin:0 0 14px;font-size:clamp(24px,6vw,30px);font-weight:900;letter-spacing:-.03em;color:#fff}
.btns{display:flex;flex-wrap:wrap;gap:10px}
.ft .btn{display:inline-flex;align-items:center;justify-content:center;border-radius:99px;padding:12px 20px;font-weight:800;font-size:15px;border:1px solid #3a3e4a;color:#fff}
.ft .btn.amb{background:var(--amb);border-color:var(--amb);color:#111}.ft .btn.wa{border-color:#25d366;color:#25d366}
.ft .site{display:inline-block;margin:14px 0 0;font-weight:700;font-size:14px}
.fcard{background:rgba(255,255,255,.04);border:1px solid var(--line);border-radius:14px;padding:12px 14px;min-width:0}
.fcard.g{margin-top:18px}.fcard.g p{color:var(--ink);font-size:14px;margin:4px 0 0}
.fk{display:block;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--mut)}
.fv{display:block;font-size:14.5px;font-weight:700;color:#fff;margin-top:2px}
.fgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:22px 0 0}
.fbrand{display:flex;justify-content:space-between;align-items:baseline;margin-top:20px;padding-top:16px;border-top:1px solid var(--line)}
@media(max-width:600px){.fgrid{grid-template-columns:1fr}.ft .btn{width:100%}}
.page{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:22px 18px;margin:0 0 16px}
.page h1{font-size:clamp(26px,7vw,34px);margin-top:12px}
.pn{font-size:12px;color:var(--mut);text-align:right;margin-top:14px}
.stub{border:1px dashed #3a3e4a;border-radius:12px;padding:12px 14px;margin:10px 0;color:var(--mut);font-size:13.5px}
.new{background:var(--amb);color:#111;font-size:10.5px;font-weight:900;border-radius:99px;padding:2px 9px;letter-spacing:.06em;text-transform:uppercase;margin-left:8px}
ul.cl{margin:10px 0;padding-left:20px;color:var(--ink)}ul.cl li{margin:4px 0}
`;

/* ---------- small pieces (all defensive: any field may be missing) ---------- */
function unionFirms(s) {
  const seen = new Set(), out = [];
  for (const k of ['chatgpt', 'gemini', 'google']) for (const f of ((s[k] && s[k].firms) || [])) if (f && !seen.has(f)) { seen.add(f); out.push(f); }
  return out;
}
function namedAny(s) { return ['chatgpt', 'gemini', 'google'].some((k) => s[k] && s[k].named); }
function firmsRow(s, biz, max) {
  const list = unionFirms(s);
  const show = list.slice(0, max), more = Math.max(0, list.length - max);
  const html = (namedAny(s) ? `<span class="me">${esc(biz)}</span>` : '') + show.map((f) => `<span class="fr">${esc(f)}</span>`).join('') + (more ? `<span class="none">+${more} more</span>` : '');
  return html || '<span class="none">AI named no firm.</span>';
}
function searchCard(s, biz, o) {
  const tier = WORDS[s.tier];
  const chips = [];
  if (o.room && tier) chips.push(`<span class="chip ${tier[2]}">${esc(tier[0])}</span>`);
  if (o.room && s.main) chips.push('<span class="chip main">Main search · harder</span>');
  return `<div class="card">${chips.length ? `<div class="chips">${chips.join('')}</div>` : ''}<div class="q">${esc(s.question)}</div><div>${firmsRow(s, biz, o.max || 5)}</div>${o.proof && s.why ? `<p class="note">${esc(s.why)}</p>` : ''}</div>`;
}
function scoreOf(searches) {
  let named = 0, total = 0;
  for (const s of searches) for (const k of ['chatgpt', 'gemini']) { const e = s[k]; if (e && e.answers > 0) { total += e.answers; named += Math.min(e.named || 0, e.answers); } }
  return { named, total, pct: total ? Math.round((named / total) * 100) : null };
}
function rivalsOf(searches, max) {
  const seen = new Map();
  for (const s of searches) for (const k of ['chatgpt', 'gemini', 'google']) for (const f of ((s[k] && s[k].firms) || [])) if (f) seen.set(f, (seen.get(f) || 0) + 1);
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]).slice(0, max);
}
const honestLine = (m) => `Real answers from our check on ${esc(m.date)}.`;
function hero(m, eyebrow, searches) {
  const sc = scoreOf(searches);
  const h = sc.pct === null ? `We couldn’t score ${esc(m.business)} yet.` : `AI named ${esc(m.business)} in <em>${sc.pct}%</em> of answers.`;
  return `<div class="eyebrow">${esc(eyebrow)}</div><h1>${h}</h1><p class="lead">${honestLine(m)}</p>`;
}
/* The website issues our crawl found (what stops AI reading the site), in plain English. Never a score. The deeper SEO
   check runs on the baseline only. */
function websiteBlock(m, kind) {
  const w = m.website || { state: 'not_checked', issues: [] };
  let inner;
  if (w.state === 'no_website') inner = '<p><b>No website AI can read yet.</b> A site AI can read is the first thing we’d build.</p>';
  else if (w.state === 'not_checked') inner = kind === 'hook' ? '<p><b>We haven’t checked your website yet.</b> It’s the first thing we’d look at.</p>' : '<p><b>Not checked yet.</b> The baseline runs the website check first if there is no fresh one.</p>';
  else if (w.state === 'clean' || !(w.issues || []).length) inner = '<p><b>We found nothing serious to fix.</b></p>';
  else {
    const serious = w.issues.filter((i) => i.serious).length;
    inner = `<p class="lead" style="margin:0 0 6px">${serious ? plural(serious, 'serious problem') + ' to fix first.' : plural(w.issues.length, 'thing') + ' to improve.'}</p>` + w.issues.slice(0, 6).map((i) => `<div class="row"><span class="sev ${i.serious ? 's' : 'm'}">${i.serious ? 'Serious' : 'Minor'}</span><span>${esc(i.title)}</span></div>`).join('');
  }
  return `<h2>Your website</h2><div class="card">${inner}${w.checkedOn ? `<p class="note">Checked on ${esc(w.checkedOn)}.</p>` : ''}</div>`;
}
const head = (title, tag) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body><header class="hd"><div class="in"><div class="wm">Findable<i>.</i></div><span class="pill-h">${esc(tag)}</span></div></header><main class="main">`;
/* The old reports' closing band, restyled: the buttons (Get started / Request a call / WhatsApp), the site link, the locked
   guarantee sentence (prospect reports only), then Prepared for / Report date / Measured on, the wordmark and the honest note.
   A client's own report (baseline, welcome pack) carries no sales pitch: just "Questions about your report?" and the contact buttons. */
const GUARANTEE = 'Your guarantee is judged on a full 20-question measurement we run after you join, not on this quick check. If that number has not gone up, email us within 7 days of the date we send your four-week audit results and we’ll refund everything you have paid us.';
const foot = (m, o = {}) => {
  const pitch = o.pitch !== false;
  const cta = pitch
    ? `<h3>Want to be the one AI names?</h3><div class="btns"><a class="btn amb" href="#">Get started</a><a class="btn" href="#">Request a call</a><a class="btn wa" href="#">Ask me anything on WhatsApp</a></div><a class="site" href="https://findable.live">See how it works at findable.live →</a><div class="fcard g"><span class="fk">Your guarantee</span><p>${GUARANTEE}</p></div>`
    : `<h3>Questions about your report?</h3><div class="btns"><a class="btn wa" href="#">Talk to Paul on WhatsApp</a><a class="btn" href="#">Request a call</a></div>`;
  return `</main><footer class="ft"><div class="in">${cta}<div class="fgrid"><div class="fcard"><span class="fk">Prepared for</span><span class="fv">${esc(m.business)}</span></div><div class="fcard"><span class="fk">Report date</span><span class="fv">${esc(m.date)}</span></div><div class="fcard"><span class="fk">Measured on</span><span class="fv">ChatGPT and Gemini · Google AI (not scored)</span></div></div><div class="fbrand"><div class="wm">Findable<i>.</i></div><a href="https://findable.live">findable.live</a></div><p>${honestLine(m || { date: '' })} Not guarantees: AI answers change, and nobody can promise to be named.</p></div></footer></body></html>`;
};

/* ---------- the four reports ---------- */
function hook(m) {
  const searches = (m.searches || []).slice(0, 4);
  return head('AI check', 'AI check') + hero(m, 'Your AI check', searches) +
    '<h2>What AI said</h2>' + (searches.length ? searches.map((s) => searchCard(s, m.business, { room: false, max: 5 })).join('') : '<p class="lead">No searches to show yet.</p>') + websiteBlock(m, 'hook') + foot(m);
}
function discovery(m) {
  const all = m.searches || [];
  const rest = all.filter((s) => s.tier !== 'notonsite');
  const open = all.filter((s) => s.tier === 'lots' || s.tier === 'some' || s.tier === 'notonsite').slice(0, 8);
  return head('Discovery report', 'Discovery') + hero(m, 'Where you can get named', rest) +
    '<h2>Searches where you can get named</h2>' + (open.length ? open.map((s) => searchCard(s, m.business, { room: true, max: 3, proof: true })).join('') : '<p class="lead">AI names the same few firms for most of these searches right now, so none stands out as open yet.</p>') + foot(m);
}
function baselineBody(m) {
  const all = (m.searches || []).slice(0, 20);
  const main = all.filter((s) => s.main), other = all.filter((s) => !s.main);
  const sc = scoreOf(all);
  const slots = `<div class="score"><div class="slot"><b>Today</b><span>${sc.pct === null ? 'n/a' : sc.pct + '%'}</span><em>${esc(m.date)}</em></div><div class="slot empty"><b>After 4 weeks</b><span>Not measured yet</span><em>Re-check due ${esc(m.recheck || 'in 4 weeks')}</em></div></div>`;
  return slots + `<h2>Your ${all.length} targeted searches</h2><p class="lead">Frozen today. The same searches are asked again at the 4-week check.${main.length ? ' Main searches are harder: AI repeats the same firms.' : ''}</p>` +
    (all.length ? [...main, ...other].map((s) => searchCard(s, m.business, { room: true, max: 4 })).join('') : '<p class="lead">No searches frozen yet.</p>') + websiteBlock(m);
}
function baseline(m) {
  return head('Baseline report', 'Your baseline') + hero(m, 'Your starting point', (m.searches || []).slice(0, 20)) + baselineBody(m) + foot(m, { pitch: false });
}
function welcome(m) {
  const pg = (n, eyebrow, title, inner) => `<section class="page"><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1>${inner}<div class="pn">Page ${n}</div></section>`;
  const all = (m.searches || []).slice(0, 20);
  return head('Welcome pack', 'Welcome pack') +
    pg(1, 'Welcome', 'Welcome to Findable.', `<p class="lead">Welcome, ${esc(m.business)}. Everything you need is in this pack.</p><ul class="cl"><li>Your plan and how it works</li><li>Access to your Google Business Profile</li><li>Get more Google reviews</li><li>Your agreement</li><li><b>Where you stand today</b><span class="new">New</span></li><li>What happens next</li></ul>`) +
    pg(2, 'Your plan', 'Your Findable plan', '<div class="stub">Unchanged: the plan, how it works and the guarantee as written today (pages 2 to 5).</div>') +
    `<section class="page"><div class="eyebrow">Your baseline<span class="new">New</span></div><h1>Where you stand today.</h1><p class="lead">${honestLine(m)}</p>` +
    baselineBody(m) +
    `<h2>Your re-check</h2><div class="card"><p style="margin:0"><b>${esc(m.recheck || 'In 4 weeks')}</b></p><p class="note">We ask the same ${plural(all.length, 'search', 'searches')} again on the same AI tools and show the two side by side. Nothing here promises a result.</p></div><div class="pn">Page 6</div></section>` +
    pg(7, 'What happens next', 'From today to your before and after', '<div class="stub">Unchanged: the steps from the baseline to the re-measure.</div>') + foot(m, { pitch: false });
}
function render(kind, model) {
  const m = { business: 'Your business', date: '', searches: [], dirs: [], website: { state: 'not_checked', issues: [] }, ...(model || {}) };
  if (!Array.isArray(m.searches)) m.searches = [];
  const fn = { hook, discovery, baseline, welcome }[kind];
  if (!fn) throw new Error('unknown report kind ' + kind);
  return fn(m);
}
module.exports = { render, scoreOf, rivalsOf, esc };

/* ---------- build the four files from the stored answers ---------- */
if (require.main === module) {
  const SP = process.argv[2];
  const data = JSON.parse(fs.readFileSync(path.join(SP, 'mock-data.json'), 'utf8'));
  const out = __dirname;
  const toSearch = (q, extra) => ({ question: q.question, tier: q.tier, why: q.why, chatgpt: q.chatgpt, gemini: q.gemini, google: q.google, ...extra });
  const dirsOf = (d) => [...new Set(d.questions.flatMap((q) => q.dirs))].slice(0, 6);

  const L = data.ldm, A = data.ablm;
  const hookQs = ['plumber in Tower Hamlets', 'emergency plumber in Hackney', 'electrician in East London'].map((t) => L.questions.find((q) => q.question.startsWith(t))).filter(Boolean);
  const ldmHook = { business: L.businessName, date: '11 Nov 2026', searches: hookQs.map((q) => toSearch(q)), website: { state: 'issues', issues: [{ title: 'No dedicated service pages found', serious: true }, { title: 'No business structured data', serious: true }, { title: 'No reviews or testimonials found on the site', serious: false }] } };
  const notOn = new Set(['EICR certificate in Tower Hamlets', 'fire safety certificate for landlords in London']);
  const ldmDisc = { business: L.businessName, date: '11 Nov 2026', dirs: dirsOf(L), searches: L.questions.filter((q) => q.tier !== 'flagged').map((q) => toSearch(q, notOn.has(q.question) ? { tier: 'notonsite' } : {})) };
  const littleIdx = A.questions.filter((q) => q.tier === 'little').slice(0, 4).map((q) => q.question);
  const ablm = {
    business: A.businessName, date: '11 Nov 2026', recheck: '9 Dec 2026 (4 weeks)', dirs: dirsOf(A),
    searches: A.questions.map((q) => toSearch(q, { main: littleIdx.includes(q.question) })),
    website: { state: 'issues', checkedOn: '11 Nov 2026', issues: [
      { title: 'No dedicated service pages found', serious: true }, { title: 'No business structured data', serious: true },
      { title: 'Missing meta description', serious: false }, { title: 'No reviews or testimonials found on the site', serious: false }, { title: 'Pages were slow to load', serious: false }] },
  };
  fs.writeFileSync(path.join(out, 'c-hook-report.html'), render('hook', ldmHook));
  fs.writeFileSync(path.join(out, 'c-discovery-report.html'), render('discovery', ldmDisc));
  fs.writeFileSync(path.join(out, 'c-baseline-report.html'), render('baseline', ablm));
  fs.writeFileSync(path.join(out, 'c-welcome-pack.html'), render('welcome', ablm));
  console.log('written', hookQs.length, ldmDisc.searches.length, ablm.searches.length);
}
