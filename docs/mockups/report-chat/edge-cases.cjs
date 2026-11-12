/* Edge cases for the Concept C template: every report kind must render, escape names, and never say something untrue. Run: node edge-cases.cjs */
const { render } = require('./build-c-reports.cjs');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else console.log('ok  ', m); };
const eng = (firms, named, answers = 3) => ({ firms, named, answers });
const s = (q, o = {}) => ({ question: q, tier: 'some', why: 'x', chatgpt: eng(['A Plumbing'], 0), gemini: eng(['B Plumbing'], 0), google: { shown: true, named: false, firms: [] }, ...o });
const KINDS = ['hook', 'discovery', 'baseline', 'welcome'];
const noNumbers = (h) => !/\b\d+\s?(×|x)\b|named\s+\d+\s+times|\d+\s+times/i.test(h.replace(/asked again|each time/g, ''));

for (const k of KINDS) {
  // 1. nothing at all
  let h = render(k, {});
  ok(/<html/.test(h) && !/undefined|NaN|\[object/.test(h), `${k}: empty model renders, no undefined/NaN`);
  // 2. bad kind input does not throw for valid kinds with null model
  ok(typeof render(k, null) === 'string', `${k}: null model`);
  // 3. escapes names
  h = render(k, { business: 'Joe’s <b>Plumbing</b> & Sons', date: '1 Jan', searches: [s('plumber <script>alert(1)</script>', { chatgpt: eng(['<img src=x onerror=1>'], 1) })] });
  ok(!/<script>alert|<img src=x/.test(h), `${k}: HTML in names is escaped`);
  // 4. business named everywhere
  h = render(k, { business: 'Top Firm', date: '1 Jan', searches: [s('q1', { chatgpt: eng([], 3), gemini: eng([], 3), google: { shown: true, named: true, firms: [] } })] });
  ok(/100%/.test(h), `${k}: named everywhere shows 100%`);
  // 5. nobody named, no competitors at all
  h = render(k, { business: 'Quiet Co', date: '1 Jan', searches: [s('q1', { chatgpt: eng([], 0), gemini: eng([], 0), google: { shown: false, firms: [] } })] });
  ok(/AI named no firm/.test(h), `${k}: no firms says so in words`);
  // 6. no answers from an engine
  h = render(k, { business: 'Q', date: '1 Jan', searches: [s('q1', { chatgpt: eng([], 0, 0) })] });
  ok(!/undefined|NaN/.test(h), `${k}: an engine with zero answers still renders cleanly`);
  // 7. missing engines entirely
  h = render(k, { business: 'Q', date: '1 Jan', searches: [{ question: 'bare', tier: 'lots' }] });
  ok(/bare/.test(h) && !/undefined/.test(h), `${k}: a search with no engine data still renders`);
  // 8. many firms are capped
  h = render(k, { business: 'Q', date: '1 Jan', searches: [s('q1', { chatgpt: eng(Array.from({ length: 20 }, (_, i) => 'Firm' + i), 0) })] });
  ok(/[+][0-9]+ more/.test(h) && !/Firm19/.test(h), `${k}: long firm list is capped with "+N more"`);
  // 9. no "N times" tallies anywhere
  ok(noNumbers(h), `${k}: no "named N times" tallies`);
  // 10. honest line
  ok(/Real answers from our check on/.test(render(k, { business: 'Q', date: '3 Mar 2027', searches: [] })), `${k}: has the "Real answers from our check on [date]" line`);
  ok(!/guarantee(d)? (a )?(ranking|top|first)|will rank|number one/i.test(h), `${k}: no ranking promise`);
}
// kind-specific rules
let h = render('hook', { business: 'Q', date: 'd', searches: [s('a', { tier: 'lots', why: 'PROOF' }), s('b'), s('c'), s('d'), s('e'), s('f')], website: { state: 'issues', issues: [{ title: 'WEBISSUE', serious: true }] } });
ok(!/Lots of room|Some room|Little room|PROOF|WEBISSUE|targeted|Searches where you can get named/.test(h), 'hook: no room labels, no proof lines, no website, no winnable list');
ok((h.match(/class="q"/g) || []).length === 4, 'hook: at most 4 hook searches');
h = render('discovery', { business: 'Q', date: 'd', searches: [s('a', { tier: 'lots', why: 'PROOF' }), s('n', { tier: 'notonsite' })], dirs: ['Checkatrade'], website: { state: 'issues', issues: [{ title: 'WEBISSUE', serious: true }] } });
ok(/Lots of room/.test(h) && /PROOF/.test(h) && /Not on your site yet/.test(h) && !/WEBISSUE|Get listed|website/i.test(h.replace(/<style>[^]*?<[/]style>/,'')), 'discovery: only winnable searches, with room label and proof; no website, no listing sites');
h = render('discovery', { business: 'Q', date: 'd', searches: [s('a', { tier: 'little' })] });
ok(/none stands out as open yet/.test(h), 'discovery: nothing open says so honestly');
h = render('baseline', { business: 'Q', date: 'd', recheck: '9 Dec', searches: Array.from({ length: 20 }, (_, i) => s('q' + i, { main: i < 4 })), website: { state: 'issues', issues: [{ title: 'WEBISSUE', serious: true }, { title: 'minor', serious: false }] } });
ok((h.match(/class="q"/g) || []).length === 20 && (h.match(/Main search · harder/g) || []).length === 4, 'baseline: 20 searches, 4 marked main/harder');
ok(/After 4 weeks/.test(h) && /Not measured yet/.test(h) && /9 Dec/.test(h) && /WEBISSUE/.test(h) && /1 serious problem/.test(h), 'baseline: 4-week slot, re-check date, website results');
ok(!/website score|SEO score|\/100/i.test(h), 'baseline: no team website score number');
for (const st of ['not_checked', 'no_website', 'clean']) ok(/Your website/.test(render('baseline', { business: 'Q', date: 'd', searches: [], website: { state: st, issues: [] } })), 'baseline: website state ' + st);
h = render('baseline', { business: 'Q', date: 'd', searches: Array.from({ length: 3 }, (_, i) => s('q' + i)) });
ok(/Your 3 targeted searches/.test(h) && !/Main searches are marked/.test(h), 'baseline: fewer than 20 searches and no main searches handled');
h = render('welcome', { business: 'Q', date: 'd', recheck: '9 Dec', searches: Array.from({ length: 20 }, (_, i) => s('q' + i, { main: i < 4 })), website: { state: 'clean', issues: [] } });
ok(/Where you stand today/.test(h) && /Main search · harder/.test(h) && /We found nothing serious/.test(h) && /9 Dec/.test(h) && /Nothing here promises a result/.test(h), 'welcome pack: baseline page with score, searches, website, re-check and honest wording');
try { render('nope', {}); ok(false, 'unknown kind should throw'); } catch { ok(true, 'unknown kind throws'); }
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails ? 1 : 0);
