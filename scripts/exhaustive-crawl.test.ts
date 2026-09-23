/* ============================================================
   THE EXHAUSTIVE MANUAL CRAWL (2026-09-23).

   Runs the REAL job engine (supabase/functions/_shared/crawl-job.ts: createCrawlJob, runCrawlTick,
   finalizeCrawlJob) against an in-memory database and a fake 1,600-page website served through a
   mocked fetch — a Wix-style sitemap index with 20 child sitemaps, www redirect, pagination,
   calendar/filter traps, 404s, a flaky 503, a page that never answers, and a page on another site.
   Plus source-level checks for the screens and the automated path.

   Run: npx tsx scripts/exhaustive-crawl.test.ts
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { classifyCrawlUrl, parseRobots, robotsAllows, sameSite } from '../src/lib/crawlUrl';
import { FULL_CRAWL, RUNAWAY_URL_CEILING, STANDARD_CRAWL, resolveCrawlMode, summariseCrawlRows } from '../src/lib/fullCrawl';
import { decideFetchOutcome, frontierExhausted, progressLabel } from '../src/lib/crawlJob';
import { summariseLeadCrawl } from '../src/lib/leadCrawlSummary';
import { MAX_CRAWL_PAGES } from '../src/lib/crawlCheck';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let failures = 0;
function ok(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failures++; }

/* ── an in-memory Supabase, just the surface the engine uses ─────────────────────────────────── */
type Row = Record<string, any>;
const db: Record<string, Row[]> = { crawl_jobs: [], crawl_urls: [], lead_crawl_checks: [] };
let serial = 1;
const getPath = (r: Row, p: string): any => {
  const parts = p.split(/->>|->/);
  let v: any = r[parts[0]];
  for (const k of parts.slice(1)) v = v == null ? undefined : v[k];
  if (p.includes('->>') && v != null && typeof v !== 'string') v = String(v);
  return v;
};
function project(r: Row, cols: string): Row {
  if (!cols || cols.trim() === '*') return { ...r };
  const out: Row = {};
  for (const tok of cols.split(',').map((s) => s.trim()).filter(Boolean)) {
    const [alias, p] = tok.includes(':') ? tok.split(':') : [tok.split(/->>|->/).pop()!, tok];
    out[alias] = getPath(r, p) ?? null;
  }
  return out;
}
class Q {
  filters: Array<(r: Row) => boolean> = []; orders: Array<[string, boolean]> = []; lim: number | null = null; rng: [number, number] | null = null;
  mode: 'select' | 'update' | 'insert' | 'upsert' = 'select'; cols = '*'; returning = false; patch: Row | null = null; rows: Row[] = [];
  opts: any = {}; isSingle = false; maybe = false; countMode = false; head = false;
  constructor(public table: string) {}
  select(cols = '*', o?: any) { this.cols = cols; if (this.mode !== 'select') this.returning = true; if (o?.count) this.countMode = true; if (o?.head) this.head = true; return this; }
  update(p: Row) { this.mode = 'update'; this.patch = p; return this; }
  insert(r: Row | Row[]) { this.mode = 'insert'; this.rows = Array.isArray(r) ? r : [r]; return this; }
  upsert(r: Row | Row[], o: any) { this.mode = 'upsert'; this.rows = Array.isArray(r) ? r : [r]; this.opts = o ?? {}; return this; }
  eq(c: string, v: any) { this.filters.push((r) => getPath(r, c) === v); return this; }
  neq(c: string, v: any) { this.filters.push((r) => getPath(r, c) !== v); return this; }
  in(c: string, vs: any[]) { this.filters.push((r) => vs.includes(getPath(r, c))); return this; }
  is(c: string, v: any) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
  gte(c: string, v: any) { this.filters.push((r) => r[c] >= v); return this; }
  lt(c: string, v: any) { this.filters.push((r) => r[c] < v); return this; }
  ilike(c: string, v: string) { const re = new RegExp('^' + v.replace(/%/g, '.*') + '$', 'i'); this.filters.push((r) => re.test(String(r[c] ?? ''))); return this; }
  or(expr: string) {
    const parts = expr.split(',').map((p) => { const [c, op, ...rest] = p.split('.'); return { c, op, v: rest.join('.') }; });
    this.filters.push((r) => parts.some(({ c, op, v }) => op === 'is' ? (r[c] ?? null) === null : op === 'lt' ? (r[c] != null && r[c] < v) : false));
    return this;
  }
  order(c: string, o?: { ascending?: boolean }) { this.orders.push([c, o?.ascending !== false]); return this; }
  limit(n: number) { this.lim = n; return this; }
  range(a: number, b: number) { this.rng = [a, b]; return this; }
  maybeSingle() { this.maybe = true; return this; }
  single() { this.isSingle = true; this.maybe = true; return this; }
  then(res: (v: any) => any, rej?: (e: any) => any) { try { return Promise.resolve(this.run()).then(res, rej); } catch (e) { return Promise.reject(e).then(res, rej); } }
  run(): any {
    const t = (db[this.table] ??= []);
    const match = () => t.filter((r) => this.filters.every((f) => f(r)));
    if (this.mode === 'insert') {
      const made = this.rows.map((r) => {
        const row = this.table === 'crawl_jobs' ? { id: `job-${serial++}`, status: 'running', ticks: 0, started_at: new Date().toISOString(), updated_at: new Date().toISOString(), lease_until: null, ...r }
          : { id: serial++, ...r };
        t.push(row); return row;
      });
      return { data: project(made[0], this.cols), error: null };
    }
    if (this.mode === 'upsert') {
      const keys = String(this.opts.onConflict).split(',');
      const inserted: Row[] = [];
      for (const r of this.rows) {
        const hit = t.find((x) => keys.every((k) => x[k] === r[k]));
        if (hit) { if (!this.opts.ignoreDuplicates) Object.assign(hit, r); continue; }
        const row = this.table === 'crawl_urls' ? { id: serial++, attempts: 0, discovered_at: new Date().toISOString(), ...r } : { id: serial++, ...r };
        t.push(row); inserted.push(row);
      }
      return { data: this.returning ? inserted.map((x) => project(x, this.cols)) : null, error: null };
    }
    if (this.mode === 'update') {
      const hits = match();
      for (const h of hits) Object.assign(h, this.patch);
      const data = hits.map((h) => project(h, this.cols));
      return { data: this.returning ? (this.maybe ? (data[0] ?? null) : data) : null, error: null };
    }
    let rows = match();
    for (const [c, asc] of [...this.orders].reverse()) rows = [...rows].sort((a, b) => (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0) * (asc ? 1 : -1));
    const count = rows.length;
    if (this.rng) rows = rows.slice(this.rng[0], this.rng[1] + 1);
    if (this.lim != null) rows = rows.slice(0, this.lim);
    if (this.head) return { data: null, count, error: null };
    const data = rows.map((r) => project(r, this.cols));
    if (this.maybe) return { data: data[0] ?? null, error: null, count };
    return { data, error: null, count };
  }
}
const service = {
  from: (t: string) => new Q(t),
  rpc: async (fn: string, args: any) => {
    if (fn !== 'crawl_job_counts') throw new Error('rpc ' + fn);
    const rows = db.crawl_urls.filter((r) => r.job_id === args.p_job);
    const pg = rows.filter((r) => r.kind === 'page'), sm = rows.filter((r) => r.kind === 'sitemap');
    const n = (xs: Row[], s: string) => xs.filter((r) => r.status === s).length;
    return { data: { discovered: pg.length, queued: n(pg, 'queued'), processing: n(pg, 'processing'), done: n(pg, 'done'), failed: n(pg, 'failed'), skipped: n(pg, 'skipped'), sitemaps: sm.length, sitemaps_pending: n(sm, 'queued') + n(sm, 'processing') }, error: null };
  },
};

/* ── a fake website ────────────────────────────────────────────────────────────────────────────── */
const ORIGIN = 'https://www.bigsite.example';
const CHILDREN = 20, PER_CHILD = 80;                          // 1,600 sitemap pages
let removedPage = false, addedPage = false;
const fetched: string[] = [];
const flakyHits: Record<string, number> = {};
const nav = () => `<nav><a href="/">Home</a><a href="/about">About</a><a href="/services">Services</a><a href="/contact">Contact</a><a href="/blog?page=2">More</a><a href="/events?date=2026-09">Calendar</a><a href="/shop?sort=price">Shop</a><a href="https://bigsite.example/about?utm_source=x">About (tracked)</a><a href="mailto:a@b.co">Mail</a><a href="https://other.example/x">Other</a><a href="/wp-admin/">Admin</a><a href="/brochure.pdf">PDF</a><a href="/gone">Gone</a><a href="/flaky">Flaky</a><a href="/hangs">Hangs</a>${addedPage ? '<a href="/brand-new">New</a>' : ''}</nav>`;
const page = (title: string, extra = '') => `<html><head><title>${title}</title><meta name="description" content="${title} desc"><link rel="canonical" href="${ORIGIN}${'/'}"></head><body>${nav()}<h1>${title}</h1><p>NICEIC approved electricians in Bath with over 15 years experience. ${'words '.repeat(150)}</p>${extra}</body></html>`;
function site(url: string): { status: number; body: string; ct?: string; final?: string } | 'hang' {
  const u = new URL(url);
  if (u.hostname === 'bigsite.example') return site(ORIGIN + u.pathname + u.search);     // apex → www
  const p = u.pathname + u.search;
  if (p === '/robots.txt') return { status: 200, body: `User-agent: *\nDisallow: /private/\nSitemap: ${ORIGIN}/sitemap.xml`, ct: 'text/plain' };
  if (p === '/sitemap.xml') return { status: 200, ct: 'application/xml', body: `<sitemapindex>${Array.from({ length: CHILDREN }, (_, i) => `<sitemap><loc>https://bigsite.example/dyn-${i}-sitemap.xml</loc></sitemap>`).join('')}<sitemap><loc>${ORIGIN}/pages-sitemap.xml</loc></sitemap></sitemapindex>` };
  const m = /^\/dyn-(\d+)-sitemap\.xml$/.exec(p);
  if (m) return { status: 200, ct: 'application/xml', body: `<urlset>${Array.from({ length: PER_CHILD }, (_, j) => `<url><loc>https://bigsite.example/service-${m[1]}/town-${j}</loc></url>`).join('')}<url><loc>https://elsewhere.example/stray</loc></url></urlset>` };
  if (p === '/pages-sitemap.xml') return { status: 200, ct: 'application/xml', body: `<urlset><url><loc>${ORIGIN}/about</loc></url><url><loc>${ORIGIN}/private/x</loc></url>${removedPage ? '' : `<url><loc>${ORIGIN}/soon-removed</loc></url>`}</urlset>` };
  if (p === '/hangs') return 'hang';
  if (p === '/flaky') { flakyHits[p] = (flakyHits[p] ?? 0) + 1; return flakyHits[p] < 2 ? { status: 503, body: '' } : { status: 200, body: page('Flaky') }; }
  if (p === '/gone' || (removedPage && p === '/soon-removed')) return { status: 404, body: 'nope' };
  if (p.startsWith('/blog')) { const n = Number(u.searchParams.get('page') ?? 1); return { status: 200, body: page(`Blog ${n}`, `<a href="/blog?page=${n + 1}">Next</a>`) }; }
  if (p.startsWith('/events')) return { status: 200, body: page('Events', `<a href="/events?date=${Math.random()}">Next month</a>`) };
  if (p === '/services') return { status: 301, body: '', final: `${ORIGIN}/our-services` };
  return { status: 200, body: page(p) };
}
(globalThis as any).fetch = async (url: string, init: any) => {
  fetched.push(url);
  const r = site(url);
  if (r === 'hang') { const e = new Error('The operation was aborted'); e.name = 'AbortError'; throw e; }
  const status = r.status === 301 ? 200 : r.status;
  const finalUrl = r.final ?? (new URL(url).hostname === 'bigsite.example' ? ORIGIN + new URL(url).pathname + new URL(url).search : url);
  const resp = new Response(r.status === 301 ? page('Our services') : r.body, { status, headers: { 'content-type': r.ct ?? 'text/html; charset=utf-8' } });
  Object.defineProperty(resp, 'url', { value: finalUrl });
  void init;
  return resp;
};

const engine = await import('../supabase/functions/_shared/crawl-job.ts');

async function drain(maxTicks = 5000) {
  let ticks = 0;
  for (; ticks < maxTicks; ticks++) {
    const r = await engine.runCrawlTick(service);
    if (!r.jobId) break;
    if (r.finalized) { ticks++; break; }
  }
  return ticks;
}
const probe = (html: string) => ({
  homeUrl: 'https://bigsite.example/', servedUrl: `${ORIGIN}/`, town: 'Bath', readableUa: 'test-ua', readableAs: 'OAI-SearchBot',
  searchBlocked: [], respondedAny: true, clientRendered: { flagged: false, appShell: false, htmlBytes: html.length, visibleChars: 900 } as any,
  missingH1: false, noJsonLd: true, homeWords: 300, homeStatus: 200, homeXRobots: null, homeHtml: html,
});

console.log('\n── 1/3/6/7. NO PAGE CAP · THE QUEUE PERSISTS ACROSS TICKS · >12 SITEMAPS · >1,000 URLS ──');
FULL_CRAWL.tickBudgetMs = 1;          // each tick does ONE batch, so the crawl must survive many ticks
const deadIds: number[] = [];
const first = await engine.createCrawlJob(service, { leadId: 'lead-1', userId: 'op', requestedFrom: 'paid_client', probe: probe(page('Home')) });
// Simulate a worker that died mid-batch: rows left `processing`, lease expired.
{
  const q = db.crawl_urls.filter((r) => r.job_id === first.jobId && r.status === 'queued' && r.kind === 'page').slice(0, 5);
  deadIds.push(...q.map((r) => r.id));
  for (const r of q) { r.status = 'processing'; r.attempts = 1; }
  const j = db.crawl_jobs.find((x) => x.id === first.jobId)!;
  j.lease_until = new Date(Date.now() - 1000).toISOString();
}
const ticks = await drain();
const job = db.crawl_jobs.find((j) => j.id === first.jobId)!;
const rows = db.crawl_urls.filter((r) => r.job_id === first.jobId);
const pages = rows.filter((r) => r.kind === 'page');
const sitemaps = rows.filter((r) => r.kind === 'sitemap');
const serviceRows = pages.filter((r) => /\/service-\d+\/town-\d+$/.test(r.url));
ok(job.status === 'complete_with_failures' && !!job.completed_at, `the job finished (${job.status}) after ${ticks} ticks`);
ok(ticks > 50, '3. the queue persisted across dozens of ticks (each tick one batch)');
ok(serviceRows.length === CHILDREN * PER_CHILD && serviceRows.every((r) => r.status === 'done'), `1/7. all ${CHILDREN * PER_CHILD} sitemap pages were fetched — no 60-page cap, >1,000 URLs persist`);
ok(sitemaps.filter((s) => s.status === 'done').length === CHILDREN + 2, `6. all ${CHILDREN + 2} sitemap documents were read (old limit: 12)`);
ok(frontierExhausted({ ...{ discovered: 0, done: 0, failed: 0, skipped: 0, sitemaps: 0 }, queued: rows.filter((r) => r.status === 'queued').length, processing: rows.filter((r) => r.status === 'processing').length, sitemaps_pending: 0 } as any), 'the frontier is exhausted: nothing queued or processing');
ok(pages.every((r) => ['done', 'failed', 'skipped'].includes(r.status)), 'every page row reached a terminal state');

console.log('\n── 2. RESUMES AFTER A WORKER DIES ──');
{
  const dead = pages.filter((r) => deadIds.includes(r.id));
  const resumed = dead.filter((r) => r.attempts >= 2 && ['done', 'failed', 'skipped'].includes(r.status));
  ok(dead.length === 5 && resumed.length === 5, `2. the ${resumed.length} rows a dead worker left in flight were re-queued and finished (not restarted from page 1)`);
  const homeFetches = fetched.filter((u) => u === `${ORIGIN}/`).length;
  ok(homeFetches === 0, '2. the homepage (seeded done) was never re-fetched by the job');
}

console.log('\n── 4. DUPLICATES COLLAPSE ──');
{
  const urls = pages.map((r) => r.url);
  ok(new Set(urls).size === urls.length, '4. no URL appears twice in the job');
  ok(pages.filter((r) => r.url === `${ORIGIN}/about`).length === 1, '4. /about via nav, sitemap and a utm-tagged apex link is ONE row');
  const aboutFetches = fetched.filter((u) => /\/about(\?|$)/.test(u)).length;
  ok(aboutFetches === 1, `4. …fetched once (${aboutFetches})`);
}

console.log('\n── 5. www REDIRECTS STAY SAME-SITE ──');
{
  ok(serviceRows.every((r) => r.url.startsWith(ORIGIN)), '5. apex sitemap URLs were normalised onto the served www host');
  ok(sameSite('https://bigsite.example/x', `${ORIGIN}/`) && sameSite('http://www.bigsite.example/x', `${ORIGIN}/`), '5. apex/www and http/https are one site');
  const c = classifyCrawlUrl('http://bigsite.example/a/?utm_source=x&gclid=1#top', `${ORIGIN}/`, `${ORIGIN}/`);
  ok(c.ok && c.url === `${ORIGIN}/a/`, '5. scheme, host, tracking params and fragment normalise away');
  const redir = pages.find((r) => r.url === `${ORIGIN}/services`);
  ok(redir?.status === 'done' && redir.final_url === `${ORIGIN}/our-services` && pages.some((r) => r.url === `${ORIGIN}/our-services` && r.status === 'done'), '5. an internal redirect is recorded and its destination crawled as its own row');
}

console.log('\n── 8. QUERY TRAPS DO NOT RUN FOREVER ──');
{
  const events = pages.filter((r) => r.url.includes('/events'));
  ok(events.every((r) => r.status === 'skipped' && r.skip_reason === 'query_trap'), '8. calendar ?date= links are skipped as traps (the job still finished)');
  ok(pages.some((r) => r.url.includes('/shop?sort') || (r.url.includes('/shop') && r.skip_reason === 'query_trap')), '8. filter/sort permutations are skipped as traps');
  const blog = pages.filter((r) => r.url.includes('/blog?page=') && r.status === 'done').length;
  ok(blog > 5, `8. real pagination is followed (${blog} blog pages)…`);
  ok(!pages.some((r) => /page=(50[1-9]|5[1-9]\d|[6-9]\d\d)/.test(r.url) && r.status === 'done'), '8. …but an endless "next" chain stops at the pagination ceiling');
  ok(classifyCrawlUrl('/a/b/a/b/a/b/a', ORIGIN, `${ORIGIN}/`).ok === false, '8. repeating path segments are a trap');
  ok(!pages.some((r) => r.url.includes('other.example') || r.url.startsWith('mailto')), '8. other websites and mailto links are never rows');
  ok(pages.some((r) => r.url.endsWith('/wp-admin/') && r.skip_reason === 'private_path') && pages.some((r) => r.url.endsWith('.pdf') && r.skip_reason === 'asset'), '8. admin paths and files are skipped with a reason');
  ok(pages.some((r) => r.url.includes('/private/') && r.skip_reason === 'robots_disallow'), '8. robots.txt Disallow for * is respected');
  ok(!!robotsAllows(parseRobots('User-agent: *\nDisallow: /a\nAllow: /a/b'), '/a/b/c') && !robotsAllows(parseRobots('User-agent: *\nDisallow: /a'), '/a/x'), 'robots longest-match rules');
}

console.log('\n── 9. FAILED URLS REACH A TERMINAL STATE ──');
{
  const gone = pages.find((r) => r.url === `${ORIGIN}/gone`);
  ok(gone?.status === 'failed' && gone.http_status === 404, '9. a 404 is failed (terminal), with its status');
  const hang = pages.find((r) => r.url === `${ORIGIN}/hangs`);
  ok(hang?.status === 'failed' && hang.attempts === FULL_CRAWL.maxAttempts, `9. a page that never answers is retried ${FULL_CRAWL.maxAttempts} times, then failed`);
  const flaky = pages.find((r) => r.url === `${ORIGIN}/flaky`);
  ok(flaky?.status === 'done' && flaky.attempts === 2, '9. a flaky 503 is retried and then succeeds');
  ok(decideFetchOutcome({ responded: true, status: 404, contentType: 'text/html', attempts: 1, source: 'previous', finalUrl: `${ORIGIN}/x`, servedUrl: ORIGIN }).skip_reason === 'removed_since_last_crawl', '9. a previously-known page now 404 is "removed", not a failure of this crawl');
}

console.log('\n── THE RESULT — the lead\'s ONE canonical row, honest totals ──');
{
  const lead = db.lead_crawl_checks.find((r) => r.lead_id === 'lead-1')!;
  ok(!!lead && lead.mode === 'full' && lead.job_id === first.jobId && lead.full_evidence?.version === 2, 'finalize wrote the lead row: mode full, job id, evidence v2');
  const st = lead.full_evidence.stats;
  ok(st.urlsDiscovered === pages.length && st.pagesOk === pages.filter((r) => r.status === 'done').length && st.failed === 2 && st.skipped === pages.filter((r) => r.status === 'skipped').length,
    `totals: ${st.urlsDiscovered} discovered · ${st.pagesOk} fetched · ${st.failed} failed · ${st.skipped} skipped`);
  ok(lead.full_evidence.completeness === 'complete_with_failures', 'failed pages make it "complete with failures", never "complete"');
  ok(lead.result.signals.pagesChecked === st.pagesFetched && lead.result.signals.checkedPages.length === 100, 'the AI-visibility signals count every fetched page (display list of 100; inventory holds all)');
  ok(lead.full_evidence.business.credentials.some((c: any) => c.value.startsWith('NICEIC')) && lead.full_evidence.business.pagesWith.credentials > 1000, 'business evidence is gathered across every page');
  ok(lead.full_evidence.sitemaps.offSiteCount === CHILDREN, 'off-site sitemap URLs are counted');
  const s = summariseLeadCrawl(lead);
  ok(s.mode === 'full' && s.status === 'complete_with_failures' && /^Full crawl · complete with failures · /.test(s.label), `Paid Clients label: ${s.label.slice(0, 90)}…`);
}

console.log('\n── 11. RE-CRAWL REDISCOVERS THE SITE ──');
{
  removedPage = true; addedPage = true;
  const second = await engine.createCrawlJob(service, { leadId: 'lead-1', userId: 'op', requestedFrom: 'outreach', probe: probe(page('Home')) });
  ok(second.jobId !== first.jobId, '11. a re-crawl is a NEW job');
  const again = await engine.createCrawlJob(service, { leadId: 'lead-1', userId: 'op', requestedFrom: 'outreach', probe: probe(page('Home')) });
  ok(again.reused && again.jobId === second.jobId, '11. a second press while it runs returns the running job');
  await drain();
  const rows2 = db.crawl_urls.filter((r) => r.job_id === second.jobId && r.kind === 'page');
  ok(rows2.some((r) => r.url === `${ORIGIN}/brand-new` && r.status === 'done'), '11. a newly added page is discovered');
  const removed = rows2.find((r) => r.url === `${ORIGIN}/soon-removed`);
  ok(removed?.status === 'skipped' && removed.skip_reason === 'removed_since_last_crawl', '11. a page that no longer exists is recorded as removed (seeded from the previous crawl, re-checked)');
  const lead = db.lead_crawl_checks.find((r) => r.lead_id === 'lead-1')!;
  ok(lead.job_id === second.jobId, '11. the new crawl becomes the canonical latest crawl');
  ok(db.crawl_urls.some((r) => r.job_id === first.jobId), '11. the previous crawl is kept as history');
}

console.log('\n── 10/12/13/14/15. SCREENS, THE AUTOMATIC PATH, NO AI CALLS ──');
{
  const crawlFn = read('supabase/functions/crawl-check/index.ts');
  const worker = read('supabase/functions/crawl-worker/index.ts');
  const engineSrc = read('supabase/functions/_shared/crawl-job.ts');
  const panel = read('src/components/LeadCrawlPanel.tsx');
  const button = read('src/components/CrawlCheckButton.tsx');
  const hub = read('supabase/functions/paid-client-hub/index.ts');
  const wb = read('src/pages/WebsiteBuild.tsx');
  const mig = read('supabase/migrations/20260923020000_crawl_jobs.sql');
  const queue = read('supabase/functions/process-ai-audit-queue/index.ts');
  const report = read('supabase/functions/render-audit-report/index.ts');
  ok(/if \(mode === "full" && home && home\.html\) \{[\s\S]*?createCrawlJob\([\s\S]*?kickCrawlWorker\("start"\);[\s\S]*?return json\(\{ ok: true, mode: "full", job_id/.test(crawlFn), '10. a manual press creates the job, kicks the worker and returns at once');
  ok(/if \(r\.more\) await kickCrawlWorker\("chain"\)/.test(worker) && /create or replace function public\.invoke_crawl_worker\(\)/.test(mig), '10. the worker chains itself, with a database cron backstop — no browser involved');
  ok(!/runCrawlTick|crawl_urls/.test(panel + button), '10. the screens only WATCH (crawl-check status); closing them cannot stop the crawl');
  ok(/export const CRAWL_POLL_MS = 5_000;/.test(panel) && /useCrawlJobWatch\(watchId/.test(panel), '13. Paid Clients / Website Build poll live progress');
  ok(/latestCrawlJob\(service, leadId\)/.test(hub) && /summariseLeadCrawl\(crawlRow as LeadCrawlRowLike \| null, crawlJob\)/.test(hub), '13. the hub returns the running job with its counts');
  const running = summariseLeadCrawl(null, { id: 'j', status: 'running', counts: { discovered: 1476, queued: 1120, processing: 9, done: 330, failed: 5, skipped: 12, sitemaps: 22, sitemaps_pending: 0 } });
  ok(running.status === 'crawling' && /347 processed · 1,476 discovered · 1,129 remaining/.test(running.label), `13. progress reads "${running.label}"`);
  ok(/if \(action === "crawl_inventory"\)/.test(hub) && /count: "exact"/.test(hub) && /Math\.min\(1000,/.test(hub), '14. the inventory is served page by page with an exact total');
  ok(/const all = async \(\): Promise<InventoryRow\[\]>/.test(panel) && /if \(rows\.length < 1000\) break;/.test(panel), '14. Website Build loads / exports EVERY URL (paged, never truncated)');
  ok(/<CrawlInventory leadId=\{leadId\}/.test(wb), '14. Website Build shows the complete inventory in Architecture');
  ok(resolveCrawlMode('full', false) === 'standard' && resolveCrawlMode(undefined, true) === 'standard', '12. automatic callers cannot get the exhaustive crawl');
  ok(STANDARD_CRAWL.maxPages === MAX_CRAWL_PAGES && STANDARD_CRAWL.fetchBudget === 22 && STANDARD_CRAWL.deadlineMs === 35_000 && /const profile = STANDARD_CRAWL;/.test(crawlFn), '12. the inline automatic crawl keeps its old budget');
  ok(/body: JSON\.stringify\(\{ lead_id: cLeadId, audit_id: auditId, run_id: runId, url: site, deep: deepCrawl \}\)/.test(queue) && /body: JSON\.stringify\(\{ lead_id: leadId \}\)/.test(report), '12. the audit and report crawls send no mode');
  ok(!('maxPages' in FULL_CRAWL) && !('fetchBudget' in FULL_CRAWL) && !('sitemapFetches' in FULL_CRAWL), '1. the full profile has no page, request or sitemap cap at all');
  ok(RUNAWAY_URL_CEILING >= 50_000, `1. the only ceiling is the ${RUNAWAY_URL_CEILING.toLocaleString('en-GB')}-URL runaway guard, reported when hit`);
  const ai = /api\.openai\.com|generativelanguage\.googleapis|api\.anthropic\.com|apify\.com|functions\/v1\/(create-ai-audit|paid-baseline|run-seo-scan|process-ai-audit-queue|extract-competitors)/i;
  ok(!ai.test(engineSrc) && !ai.test(worker), '15. the crawl engine and worker call no AI, audit or SEO service');
  ok(fetched.every((u) => /^https:\/\/(www\.)?bigsite\.example\//.test(u)), `15. every one of the ${fetched.length} requests went to the client's own site`);
  const sumBody = summariseCrawlRows({ rows: [], requestedUrl: ORIGIN, servedUrl: ORIGIN, robotsTxt: null, sitemapsRead: 0, offSiteSitemapLocs: { count: 0, samples: [] }, sitemapUrlCount: 0, ms: 0, ticks: 0 });
  ok(sumBody.completeness === 'failed', 'a crawl that read nothing is failed, never complete');
  ok(progressLabel('complete', { discovered: 3, queued: 0, processing: 0, done: 2, failed: 1, skipped: 0, sitemaps: 1, sitemaps_pending: 0 }).startsWith('Complete 3 processed'), 'a finished job has no "remaining"');
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nAll passed.');
process.exit(failures ? 1 : 0);
