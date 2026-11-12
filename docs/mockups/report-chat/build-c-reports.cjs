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

const CSS = `
:root{--ink:#0f0f12;--cream:#f6f3ec;--card:#fff;--line:#e7e2d6;--mut:#6b6c72;--y:#ffd23f;--red:#c1272d;--redbg:#fde8e8;--grn:#127a3a;--grnbg:#dcf5e3;--amb:#8a5a00;--ambbg:#fff1cc}
*{box-sizing:border-box}body{margin:0;background:var(--cream);color:var(--ink);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.wrap{max-width:640px;margin:0 auto;padding:0 16px 56px}
.top{background:var(--ink);color:#fff;padding:18px 20px 16px;border-radius:0 0 20px 20px;margin:0 -16px 16px}
.wm{font-weight:900;font-size:22px;letter-spacing:-.03em}.wm i{color:var(--y);font-style:normal}
.top p{margin:6px 0 0;color:#b9bac0;font-size:13px}
.tag{display:inline-block;background:var(--y);color:var(--ink);font-weight:800;font-size:11px;letter-spacing:.05em;text-transform:uppercase;border-radius:99px;padding:3px 10px;margin-bottom:6px}
h1{font-size:23px;line-height:1.2;letter-spacing:-.02em;margin:6px 0 4px}
h2{font-size:18px;letter-spacing:-.01em;margin:26px 0 4px}
.sub{color:var(--mut);font-size:13px;margin:0 0 12px}
.legend{display:flex;gap:10px;flex-wrap:wrap;font-size:12.5px;margin:0 0 14px;color:var(--mut)}
.fr{color:var(--red);font-weight:700;background:var(--redbg);border-radius:99px;padding:2px 10px;font-size:13px;display:inline-block;margin:2px 4px 2px 0}
.me{color:var(--grn);font-weight:800;background:var(--grnbg);border-radius:99px;padding:2px 10px;font-size:13px;display:inline-block;margin:2px 4px 2px 0}
.none{color:var(--mut);font-size:13px;font-style:italic}
.score{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:14px 16px;margin:0 0 14px}
.score big{display:block;font-size:34px;font-weight:900;letter-spacing:-.03em;line-height:1.1}
.score .l{font-size:14px;margin-top:2px}
.slots{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
.slot{border:1px solid var(--line);border-radius:12px;padding:10px 12px;background:#faf8f3}
.slot b{display:block;font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--mut)}
.slot span{display:block;font-size:20px;font-weight:900;margin-top:2px}.slot em{display:block;font-style:normal;font-size:12px;color:var(--mut)}
.slot.empty span{color:#b7b2a3}
.card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:14px;margin:0 0 14px}
.chips{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 8px}
.chip{border-radius:99px;font-size:11.5px;font-weight:800;padding:2px 9px;background:#eee;color:var(--mut)}
.chip.lots{background:var(--grnbg);color:var(--grn)}.chip.some{background:var(--ambbg);color:var(--amb)}.chip.little{background:var(--redbg);color:var(--red)}
.chip.nofirms{background:#eee;color:var(--mut)}.chip.named{background:var(--grnbg);color:var(--grn)}.chip.notonsite{background:#e6efff;color:#1d4fa8}.chip.main{background:var(--y);color:var(--ink)}
.u{margin-left:auto;max-width:92%;width:fit-content;background:var(--ink);color:#fff;border-radius:16px 16px 4px 16px;padding:9px 13px;font-size:14.5px;margin-bottom:10px}
.er{display:flex;gap:9px;align-items:flex-start;padding:8px 0;border-top:1px solid var(--line)}
.er:first-of-type{border-top:0}
.en{flex:0 0 78px;font-weight:800;font-size:13px;display:flex;gap:6px;align-items:center;padding-top:3px}
.dot{width:9px;height:9px;border-radius:50%;flex:none}.g1{background:#10a37f}.g2{background:#7c5cff}.g3{background:#4285f4}
.eb{flex:1;min-width:0}
.proof{font-size:12.5px;color:var(--mut);margin:6px 0 0}
.sec{margin-top:6px}
.row{display:flex;gap:8px;align-items:flex-start;padding:8px 0;border-top:1px solid var(--line);font-size:14px}
.row:first-child{border-top:0}
.sev{font-size:11px;font-weight:800;border-radius:99px;padding:1px 8px;white-space:nowrap}
.sev.s{background:var(--redbg);color:var(--red)}.sev.m{background:#eee;color:var(--mut)}
.note{font-size:12.5px;color:var(--mut);margin:8px 0 0}
.foot{margin-top:26px;color:var(--mut);font-size:12.5px}
.page{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:20px 18px;margin:0 0 18px;box-shadow:0 2px 8px rgba(0,0,0,.05)}
.page .eyebrow{font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;font-weight:800;color:var(--mut)}
.page .pn{font-size:11.5px;color:var(--mut);text-align:right;margin-top:10px}
.stub{border:1px dashed var(--line);border-radius:10px;padding:10px 12px;margin:8px 0;color:var(--mut);font-size:13px}
.kept{outline:2px dashed #1d4fa8;outline-offset:3px;border-radius:8px;position:relative}
.newb{position:absolute;top:-10px;right:8px;background:#1d4fa8;color:#fff;font-size:10.5px;font-weight:800;border-radius:99px;padding:1px 9px;letter-spacing:.04em}
ul.cl{margin:6px 0;padding-left:18px}ul.cl li{margin:2px 0}
`;

/* ---------- small pieces (all defensive: any field may be missing) ---------- */
function names(list, max) {
  const l = Array.isArray(list) ? list.filter(Boolean) : [];
  return { show: l.slice(0, max), more: Math.max(0, l.length - max) };
}
function engineBody(e, key, biz) {
  if (!e) return '<span class="none">No answer came back.</span>';
  if (key === 'google' && e.shown === false) return '<span class="none">Google showed no AI answer for this search.</span>';
  if (key !== 'google' && !(e.answers > 0)) return '<span class="none">No answer came back.</span>';
  const { show, more } = names(e.firms, 6);
  const own = e.named ? `<span class="me">${esc(biz)}</span>` : '';
  const rivals = show.map((f) => `<span class="fr">${esc(f)}</span>`).join('') + (more ? `<span class="none"> and ${more} more</span>` : '');
  if (!own && !rivals) return '<span class="none">AI named no firm.</span>';
  return own + rivals;
}
function searchCard(s, biz, o) {
  const tier = WORDS[s.tier];
  const chips = [];
  if (o.room && tier) chips.push(`<span class="chip ${tier[2]}">${esc(tier[0])}</span>`);
  if (o.room && s.main) chips.push('<span class="chip main">Main search · harder</span>');
  const rows = ENGINES.map(([k, n, c]) => `<div class="er"><div class="en"><span class="dot ${c}"></span>${n}</div><div class="eb">${engineBody(s[k], k, biz)}</div></div>`).join('');
  const proof = o.room && s.why ? `<p class="proof">${esc(s.why)}</p>` : '';
  return `<div class="card">${chips.length ? `<div class="chips">${chips.join('')}</div>` : ''}<div class="u">${esc(s.question)}</div>${rows}${proof}</div>`;
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
function scoreBox(m, withSlots) {
  const sc = scoreOf(m.searches);
  const big = sc.pct === null ? 'No score yet' : `${sc.pct}%`;
  const line = sc.pct === null ? 'There are no ChatGPT or Gemini answers to score yet.' : `AI named ${esc(m.business)} in ${sc.pct}% of answers`;
  const slots = withSlots ? `<div class="slots"><div class="slot"><b>Today</b><span>${sc.pct === null ? 'n/a' : sc.pct + '%'}</span><em>${esc(m.date)}</em></div><div class="slot empty"><b>After 4 weeks</b><span>Not measured yet</span><em>Re-check due ${esc(m.recheck || 'in 4 weeks')}</em></div></div>` : '';
  return `<div class="score"><big>${big}</big><div class="l">${line}</div>${slots}<p class="note">The score counts ChatGPT and Gemini. Google AI is shown for context only.</p></div>`;
}
function insteadBlock(m, title) {
  const r = rivalsOf(m.searches, 10);
  return `<h2>${esc(title)}</h2>` + (r.length ? `<p class="sub">Businesses AI named in these answers.</p><div class="card">${r.map((f) => `<span class="fr">${esc(f)}</span>`).join('')}</div>` : '<p class="sub">AI named no other business in these answers.</p>');
}
function websiteBlock(m) {
  const w = m.website || { state: 'not_checked', issues: [] };
  let inner;
  if (w.state === 'no_website') inner = '<p><b>You don’t have a website AI can read yet.</b></p><p class="note">A site AI can read is the first thing we’d build.</p>';
  else if (w.state === 'not_checked') inner = '<p><b>We haven’t checked your website yet.</b></p><p class="note">The baseline runs the website check first if there is no fresh one.</p>';
  else if (w.state === 'clean' || !(w.issues || []).length) inner = '<p><b>We found nothing serious to fix.</b></p>';
  else {
    const serious = w.issues.filter((i) => i.serious).length;
    inner = `<p>${serious ? plural(serious, 'serious problem') + ' to fix first.' : plural(w.issues.length, 'thing') + ' to improve.'}</p>` + w.issues.slice(0, 6).map((i) => `<div class="row"><span class="sev ${i.serious ? 's' : 'm'}">${i.serious ? 'Serious' : 'Minor'}</span><span>${esc(i.title)}</span></div>`).join('');
  }
  const when = w.checkedOn ? `<p class="note">Website checked on ${esc(w.checkedOn)}.</p>` : '';
  return `<h2>What we found on your website</h2><div class="card">${inner}${when}</div>`;
}
function listedBlock(m) {
  const d = (m.dirs || []).filter(Boolean).slice(0, 6);
  return '<h2>Get listed on these sites</h2>' + (d.length ? `<p class="sub">AI uses them.</p><div class="card">${d.map((x) => `<div class="row"><b>${esc(x)}</b></div>`).join('')}</div>` : '<p class="sub">No listing sites showed up in these answers yet.</p>');
}
const legend = '<div class="legend"><span><span class="fr">Red</span> a business AI named instead</span><span><span class="me">Green</span> your business, when AI named it</span></div>';
const honest = (m) => `<p class="sub">Real answers from our check on ${esc(m.date)}. These are not guarantees: AI answers change, and nobody can promise to be named.</p>`;
const head = (title, tag) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body><div class="wrap"><div class="top"><div class="wm">Findable<i>.</i></div><p><span class="tag">${esc(tag)}</span></p></div>`;
const foot = (txt) => `<p class="foot">${esc(txt)}</p></div></body></html>`;

/* ---------- the four reports ---------- */
function hook(m) {
  const searches = (m.searches || []).slice(0, 4);
  const mm = { ...m, searches };
  return head('Hook report', 'Hook report') + `<h1>What AI says when customers ask</h1>${honest(m)}${legend}` + scoreBox(mm, false) +
    '<h2>The searches we asked</h2>' + (searches.length ? searches.map((s) => searchCard(s, m.business, { room: false })).join('') : '<p class="sub">No searches to show yet.</p>') +
    insteadBlock(mm, 'Who AI named instead') + foot('Mockup on real stored answers. Concept only: not live, not scored.');
}
function discovery(m) {
  const all = m.searches || [];
  const notOn = all.filter((s) => s.tier === 'notonsite');
  const rest = all.filter((s) => s.tier !== 'notonsite');
  const open = rest.filter((s) => s.tier === 'lots' || s.tier === 'some').slice(0, 6);
  const sc = { ...m, searches: rest };
  const counts = ['lots', 'some', 'little', 'nofirms', 'named'].map((t) => [t, rest.filter((s) => s.tier === t).length]).filter((x) => x[1]);
  return head('Discovery report', 'Discovery report') + `<h1>Where AI could name ${esc(m.business)}</h1>${honest(m)}${legend}` + scoreBox(sc, false) +
    (counts.length ? `<div class="chips">${counts.map(([t, n]) => `<span class="chip ${t}">${n} ${esc(WORDS[t][0])}</span>`).join('')}</div>` : '') +
    '<h2>Searches where you can get named</h2>' + (open.length ? `<p class="sub">Each is graded by the room AI leaves, with its proof. Being named is the goal, never a ranking.</p>${open.map((s) => searchCard(s, m.business, { room: true })).join('')}` : '<p class="sub">AI names the same few firms for most of these searches right now, so none stands out as open yet.</p>') +
    (notOn.length ? `<h2>Not on your site yet</h2><p class="sub">Add a page if you offer these.</p>${notOn.map((s) => searchCard(s, m.business, { room: true })).join('')}` : '') +
    insteadBlock(sc, 'Who AI named instead') + listedBlock(m) + foot('Mockup on real stored answers. Concept only: not live, not scored.');
}
function baselineBody(m) {
  const all = (m.searches || []).slice(0, 20);
  const main = all.filter((s) => s.main), other = all.filter((s) => !s.main);
  return scoreBox({ ...m, searches: all }, true) + insteadBlock({ ...m, searches: all }, 'Who AI named instead') +
    `<h2>Your ${all.length} targeted searches</h2><p class="sub">Frozen today. The same ${plural(all.length, 'search', 'searches')} are asked again at the 4-week check.${main.length ? ' Main searches are marked: they are harder because AI repeats the same firms.' : ''}</p>` +
    (all.length ? [...main, ...other].map((s) => searchCard(s, m.business, { room: true })).join('') : '<p class="sub">No searches frozen yet.</p>') +
    websiteBlock(m) + listedBlock(m);
}
function baseline(m) {
  return head('Baseline report', 'Baseline report (client)') + `<h1>Your starting point</h1>${honest(m)}${legend}` + baselineBody(m) + foot('Mockup on real stored answers. Concept only: not live, not scored.');
}
function welcome(m) {
  const pg = (n, eyebrow, title, inner, kept) => `<section class="page${kept ? '' : ''}"><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1>${inner}<div class="pn">Page ${n}</div></section>`;
  const sc = scoreOf(m.searches || []);
  const all = (m.searches || []).slice(0, 20);
  return head('Welcome pack', 'Welcome pack (PDF)') +
    pg(1, 'Welcome', 'Welcome to Findable', `<p>Welcome, ${esc(m.business)}. Here is everything in one place.</p><p class="sub">What’s inside</p><ul class="cl"><li>Your plan and how it works</li><li>Get access to your Google Business Profile</li><li>Get more Google reviews</li><li>Your agreement</li><li><b>Your baseline: where you stand today</b> <span class="chip main">new</span></li><li>What happens next</li></ul>`) +
    pg(2, 'Plan', 'Your Findable plan', '<div class="stub">Unchanged: what we do in one line, the plan, the guarantee as written today (pages 2 to 5 stay as they are).</div>') +
    `<section class="page"><div class="eyebrow">Your baseline <span class="chip main">new</span></div><h1>Where you stand today</h1><p class="sub">Real answers from our check on ${esc(m.date)}. Not guarantees: AI answers change.</p>` +
    baselineBody(m).replace('<div class="score">', '<div class="score">').replace(/<h2>Your /, '<h2>Your ') +
    `<h2>Your re-check</h2><div class="card"><p><b>${esc(m.recheck || 'In 4 weeks')}</b></p><p class="note">We ask the same ${plural(all.length, 'search', 'searches')} again, on the same AI tools, and show the two side by side. Nothing here promises a result.</p></div><div class="pn">Page 6</div></section>` +
    pg(7, 'What happens next', 'From today to your before and after', '<div class="stub">Unchanged: the steps from the baseline to the re-measure.</div>') +
    foot('Mockup. The grey dashed boxes stand for pages that stay as they are today; the baseline page is the addition. Concept only: not live.');
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
  const ldmHook = { business: L.businessName, date: '11 Nov 2026', searches: hookQs.map((q) => toSearch(q)) };
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
