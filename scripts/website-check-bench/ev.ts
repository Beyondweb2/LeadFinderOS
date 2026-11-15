// LOOK THINGS UP IN THE INDEPENDENT READ, for labelling findings by hand (2026-11-15).
//   node --import tsx scripts/website-check-bench/ev.ts <slug> pages
//   … <slug> grep <regex>          the text around every match, page by page
//   … <slug> page <path> [chars]    one page's visible text
//   … <slug> ld [path]              structured data blocks
//   … <slug> links <regex>          links whose text or address matches
//   … <slug> robots | sitemap
import { loadEvidence } from './verify.ts';

const [slug, cmd, a1, a2] = process.argv.slice(2);
const e = loadEvidence(slug);
if (!e) { console.log('no evidence'); process.exit(0); }
const pathOf = (u: string) => { try { return new URL(u).pathname + new URL(u).search; } catch { return u; } };
const pick = (p: string) => Object.entries(e.pages).find(([u]) => pathOf(u).replace(/\/$/, '').toLowerCase() === p.replace(/\/$/, '').toLowerCase());
if (cmd === 'pages') for (const [u, p] of Object.entries(e.pages)) console.log(`${p.status} ${pathOf(u)} | t:${(p.title ?? '').slice(0, 60)} | h1:${p.h1.length}:${(p.h1[0] ?? '').slice(0, 40)} | md:${p.metaDesc ? 'y' : 'n'} | w:${p.words} | rob:${p.robotsMeta ?? ''} | can:${p.canonical ? pathOf(p.canonical) : ''}`);
if (cmd === 'grep') { const re = new RegExp(a1, 'gi'); for (const [u, p] of Object.entries(e.pages)) { const hits = [...p.text.matchAll(re)].slice(0, 4); for (const m of hits) console.log(`${pathOf(u)}: …${p.text.slice(Math.max(0, m.index! - 80), m.index! + 120).replace(/\s+/g, ' ')}…`); } }
if (cmd === 'page') { const x = pick(a1); console.log(x ? x[1].text.slice(0, Number(a2 ?? 3000)) : 'not read'); }
if (cmd === 'ld') for (const [u, p] of Object.entries(e.pages)) { if (a1 && pathOf(u).replace(/\/$/, '') !== a1.replace(/\/$/, '')) continue; p.ld.forEach((s) => console.log(pathOf(u), s.replace(/\s+/g, ' ').slice(0, 1500))); }
if (cmd === 'links') { const re = new RegExp(a1, 'i'); const seen = new Set<string>(); for (const [u, p] of Object.entries(e.pages)) for (const l of p.links) { const k = l.href + '|' + l.text; if ((re.test(l.text) || re.test(l.href)) && !seen.has(k)) { seen.add(k); console.log(`${pathOf(u)}: "${l.text}" → ${l.href}`); } } }
if (cmd === 'robots') console.log(JSON.stringify(e.robots).slice(0, 2000));
if (cmd === 'sitemap') console.log(JSON.stringify({ status: e.sitemap?.status, body: String(e.sitemap?.body ?? e.sitemap?.error).slice(0, 2500) }));
if (cmd === 'raw') {
  // The crawl's own saved answers (cache/<slug>.json.gz): the raw HTML as our crawler received it.
  const { gunzipSync } = await import('node:zlib');
  const { readFileSync } = await import('node:fs');
  const path = await import('node:path');
  const saved = JSON.parse(gunzipSync(readFileSync(path.join(import.meta.dirname, 'cache', `${slug}.json.gz`))).toString('utf8')) as Record<string, { b64: string; status: number }>;
  const re = new RegExp(a1, 'gi');
  for (const [k, s] of Object.entries(saved)) {
    if (a2 && !k.includes(a2)) continue;
    let body = Buffer.from(s.b64, 'base64').toString('utf8');
    if (k.startsWith('RENDER')) { try { body = JSON.parse(body).result ?? body; } catch { /* as is */ } }
    for (const m of [...body.matchAll(re)].slice(0, 3)) console.log(`${k.slice(0, 90)}: …${body.slice(Math.max(0, m.index! - 120), m.index! + 160).replace(/\s+/g, ' ')}…`);
  }
}
