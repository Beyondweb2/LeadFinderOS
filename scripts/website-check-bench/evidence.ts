// THE INDEPENDENT READ (2026-11-15, docs/WEBSITE_CHECK_ACCURACY.md). Ground truth for the bench comes from a different
// reader than the crawl: a real browser (headless Edge) that runs each page's scripts, and the browser's own DOM — not our
// regexes. For each site: the homepage, the pages its menu and links point at (contact / about / reviews / services /
// areas / FAQ first, up to PAGES_PER_SITE), every page a finding names, and robots.txt and the sitemap as served.
//
//   node --import tsx scripts/website-check-bench/evidence.ts [--only <slug>] [--results <bench results file>]
// Writes scripts/website-check-bench/evidence/<slug>.json.gz. Run once; the labels in truth.json were made from it.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { inBrowser, stopRenderer } from './edge-render.ts';
import { BENCH_DIR } from './net.ts';
import { SITE_CHECK_UA, SITE_CHECK_HEADERS } from '../../src/lib/siteReadIdentity.ts';

const PAGES_PER_SITE = 25;
const EV_DIR = path.join(BENCH_DIR, 'evidence');

/* Runs in the page. Plain DOM reads only. */
const EXTRACT = `(() => {
  const q = (s) => Array.from(document.querySelectorAll(s));
  const meta = (n) => (document.querySelector('meta[name="' + n + '" i]') || {}).content || null;
  const text = (document.body ? document.body.innerText : '') || '';
  return {
    title: document.title || null,
    metaDesc: meta('description'), viewport: meta('viewport'), robotsMeta: meta('robots'),
    canonical: (document.querySelector('link[rel="canonical"]') || {}).href || null,
    h1: q('h1').map((e) => (e.innerText || e.textContent || '').trim()).filter(Boolean),
    h2: q('h2,h3').map((e) => (e.innerText || '').trim()).filter(Boolean).slice(0, 80),
    ld: q('script[type="application/ld+json"]').map((e) => e.textContent || '').slice(0, 20),
    links: q('a[href]').map((a) => ({ href: a.href, text: (a.innerText || a.getAttribute('aria-label') || '').trim().slice(0, 80) })).slice(0, 600),
    nav: q('nav a[href], header a[href]').map((a) => a.href).slice(0, 120),
    tel: q('a[href^="tel:"]').map((a) => a.getAttribute('href')),
    mailto: q('a[href^="mailto:"]').map((a) => a.getAttribute('href')),
    imgs: { total: q('img').length, noAlt: q('img').filter((i) => !(i.getAttribute('alt') || '').trim()).length },
    forms: q('form').filter((f) => f.querySelector('input,textarea')).length,
    iframes: q('iframe[src]').map((f) => f.src).slice(0, 20),
    words: (text.match(/[A-Za-z][A-Za-z'’-]*/g) || []).length,
    text: text.slice(0, 40000),
  };
})()`;

const WEIGHT: Array<[RegExp, number]> = [
  [/contact|get-in-touch|enquir|quote/i, 10], [/about|who-we-are|our-story|team|meet/i, 9], [/review|testimonial|feedback/i, 9],
  [/faq|question/i, 8], [/area|location|cover|where-we/i, 8], [/service|what-we-do/i, 7], [/gallery|project|portfolio|our-work/i, 4],
];
const weight = (u: string, inNav: boolean) => WEIGHT.reduce((s, [re, w]) => (re.test(u) ? Math.max(s, w) : s), 0) + (inNav ? 3 : 0);

async function plainGet(url: string): Promise<{ status: number; body: string; finalUrl: string } | { error: string }> {
  try {
    const c = new AbortController(); const t = setTimeout(() => c.abort(), 15_000);
    const r = await fetch(url, { headers: SITE_CHECK_HEADERS, redirect: 'follow', signal: c.signal });
    clearTimeout(t);
    return { status: r.status, body: (await r.text()).slice(0, 400_000), finalUrl: r.url };
  } catch (e) { return { error: String((e as Error).message).slice(0, 200) }; }
}

export async function collect(slug: string, website: string, cited: string[]): Promise<void> {
  const homeUrl = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).origin + '/';
  const pages: Record<string, unknown> = {};
  const home = await inBrowser(homeUrl, SITE_CHECK_UA, EXTRACT);
  if (home) pages[home.finalUrl] = { status: home.status, requested: homeUrl, ...home.value };
  const origin = home ? new URL(home.finalUrl).origin : new URL(homeUrl).origin;
  const host = new URL(origin).hostname.replace(/^www\./, '');
  const same = (u: string) => { try { const x = new URL(u); return x.hostname.replace(/^www\./, '') === host && /^https?:$/.test(x.protocol) && !/\.(pdf|jpe?g|png|gif|webp|zip|docx?)$/i.test(x.pathname); } catch { return false; } };
  const clean = (u: string) => { const x = new URL(u); x.hash = ''; return x.href; };
  const nav = new Set((home?.value?.nav ?? []).filter(same).map(clean));
  const cand = new Map<string, number>();
  for (const l of (home?.value?.links ?? []) as Array<{ href: string }>) if (same(l.href)) { const u = clean(l.href); cand.set(u, Math.max(cand.get(u) ?? 0, weight(u, nav.has(u)))); }
  const order = [...cand.entries()].filter(([u]) => u !== clean(home?.finalUrl ?? homeUrl)).sort((a, b) => b[1] - a[1]).map(([u]) => u);
  const want = [...new Set([...cited.filter(same).map(clean), ...order])].slice(0, PAGES_PER_SITE + cited.length);
  for (const u of want) {
    if (pages[u]) continue;
    const r = await inBrowser(u, SITE_CHECK_UA, EXTRACT);
    if (r) pages[r.finalUrl] = { status: r.status, requested: u, ...r.value };
  }
  const robots = await plainGet(origin + '/robots.txt');
  const sitemap = await plainGet(origin + '/sitemap.xml');
  mkdirSync(EV_DIR, { recursive: true });
  writeFileSync(path.join(EV_DIR, `${slug}.json.gz`), gzipSync(Buffer.from(JSON.stringify({ slug, homeUrl, read: new Date().toISOString(), pages, robots, sitemap }))));
  console.log(`${slug}: ${Object.keys(pages).length} pages`);
}

if (process.argv[1]?.endsWith('evidence.ts')) {
  const arg = (n: string) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
  const only = arg('--only');
  const resultsFile = arg('--results');
  const results: Array<{ slug: string; issues: Array<{ pages: string[] }> }> = resultsFile && existsSync(resultsFile) ? JSON.parse(readFileSync(resultsFile, 'utf8')) : [];
  const sites = JSON.parse(readFileSync(path.join(BENCH_DIR, 'sites.json'), 'utf8')).sites as Array<{ slug: string; lead: { website: string } }>;
  const todo = sites.filter((s) => (!only || s.slug === only) && !/facebook\.com/.test(s.lead.website));
  let next = 0;
  await Promise.all(Array.from({ length: 3 }, async () => {
    for (;;) {
      const s = todo[next++]; if (!s) return;
      const cited = (results.find((r) => r.slug === s.slug)?.issues ?? []).flatMap((i) => i.pages ?? []).map((p) => { try { return new URL(p, s.lead.website).href; } catch { return ''; } }).filter(Boolean);
      try { await collect(s.slug, s.lead.website, cited); } catch (e) { console.log(`${s.slug}: FAILED ${(e as Error).message}`); }
    }
  }));
  stopRenderer();
  process.exit(0);
}
