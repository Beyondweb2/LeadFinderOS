/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE PROSPECT FULL CRAWL + DETAILED AUDIT RESULTS (2026-10-05, branch
   improve/prospect-full-crawl-audit-results; docs/pre-sales-certification/prospect-full-crawl-audit-results.md).

   Runs the REAL crawl engine (supabase/functions/_shared/crawl-job.ts) against an in-memory database and
   fake websites served through a mocked fetch, then the site audit (src/lib/siteAudit.ts), the view
   model (src/lib/prospectAuditView.ts) and the results view (ProspectAuditView) rendered to HTML.
   Covers: small site · multi-page sitemap · sitemap index · robots block · no sitemap · no website ·
   redirect · grouped duplicates · malformed schema · noindex · canonical mismatch · OAI-SearchBot block
   · large-site cap with explicit coverage · cache reuse · failed crawl · mobile UI · reopen from stored
   evidence · AI scores unchanged · no lead status change · ownership isolation · careful wording.

   Run: npx tsx scripts/prospect-full-crawl-audit.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FULL_CRAWL, processPage, summariseCrawlRows } from '../src/lib/fullCrawl.ts';
import { robotsRulesFor, robotsAllows } from '../src/lib/crawlUrl.ts';
import { buildSiteAudit, auditFromStoredCrawl, classifyFetchError, statesAll, type SiteAudit, type SiteAuditInput } from '../src/lib/siteAudit.ts';
import { PROSPECT_CRAWL_PAGE_CAP, PROSPECT_CRAWL_REUSE_MS, PROSPECT_CRAWL_MIN_GAP_MS, crawlPageCapFor, prospectCrawlReuse, mayForceRecrawl } from '../src/lib/prospectCrawl.ts';
import { websiteState, callPoint, coverageLine, NO_WEBSITE_TEXT, strongestFinding } from '../src/lib/prospectAuditView.ts';
import { summariseLeadCrawl } from '../src/lib/leadCrawlSummary.ts';
import { scoreHookRun, initialHookStateV2, HOOK_ENGINES, type HookScoreRow } from '../src/lib/hookScore.ts';
import { salesCrawlIdsRefusal } from '../src/lib/crawlAccess.ts';
import { salesStyleProblems } from '../src/lib/salesStyle.ts';
import { ProspectAuditView } from '../src/components/ProspectAuditView.tsx';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let failures = 0;
function ok(cond: boolean, msg: string) { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failures++; }
const ids = (a: SiteAudit | null) => new Set((a?.findings ?? []).map((f) => f.id));
const byId = (a: SiteAudit | null, id: string) => a?.findings.find((f) => f.id === id) ?? null;

/* ── an in-memory Supabase: the surface the engine uses (same shape as exhaustive-crawl.test.ts) ── */
type Row = Record<string, any>;
const db: Record<string, Row[]> = { crawl_jobs: [], crawl_urls: [], lead_crawl_checks: [], outreach_leads: [] };
let serial = 1;
const writesTo: string[] = [];
const getPath = (r: Row, p: string): any => { const parts = p.split(/->>|->/); let v: any = r[parts[0]]; for (const k of parts.slice(1)) v = v == null ? undefined : v[k]; return v; };
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
  opts: any = {}; maybe = false; head = false;
  constructor(public table: string) {}
  select(cols = '*', o?: any) { this.cols = cols; if (this.mode !== 'select') this.returning = true; if (o?.head) this.head = true; return this; }
  update(p: Row) { this.mode = 'update'; this.patch = p; writesTo.push(`${this.table}:update:${Object.keys(p).join(',')}`); return this; }
  insert(r: Row | Row[]) { this.mode = 'insert'; this.rows = Array.isArray(r) ? r : [r]; writesTo.push(`${this.table}:insert`); return this; }
  upsert(r: Row | Row[], o: any) { this.mode = 'upsert'; this.rows = Array.isArray(r) ? r : [r]; this.opts = o ?? {}; writesTo.push(`${this.table}:upsert`); return this; }
  eq(c: string, v: any) { this.filters.push((r) => getPath(r, c) === v); return this; }
  neq(c: string, v: any) { this.filters.push((r) => getPath(r, c) !== v); return this; }
  in(c: string, vs: any[]) { this.filters.push((r) => vs.includes(getPath(r, c))); return this; }
  is(c: string, v: any) { this.filters.push((r) => (r[c] ?? null) === v); return this; }
  gte(c: string, v: any) { this.filters.push((r) => r[c] >= v); return this; }
  lt(c: string, v: any) { this.filters.push((r) => r[c] < v); return this; }
  or(expr: string) {
    const parts = expr.split(',').map((p) => { const [c, op, ...rest] = p.split('.'); return { c, op, v: rest.join('.') }; });
    this.filters.push((r) => parts.some(({ c, op, v }) => op === 'is' ? (r[c] ?? null) === null : op === 'lt' ? (r[c] != null && r[c] < v) : false));
    return this;
  }
  order(c: string, o?: { ascending?: boolean }) { this.orders.push([c, o?.ascending !== false]); return this; }
  limit(n: number) { this.lim = n; return this; }
  range(a: number, b: number) { this.rng = [a, b]; return this; }
  maybeSingle() { this.maybe = true; return this; }
  single() { this.maybe = true; return this; }
  then(res: (v: any) => any, rej?: (e: any) => any) { try { return Promise.resolve(this.run()).then(res, rej); } catch (e) { return Promise.reject(e).then(res, rej); } }
  run(): any {
    const t = (db[this.table] ??= []);
    const match = () => t.filter((r) => this.filters.every((f) => f(r)));
    if (this.mode === 'insert') {
      const made = this.rows.map((r) => {
        const row = this.table === 'crawl_jobs' ? { id: `job-${serial++}`, status: 'running', ticks: 0, started_at: new Date().toISOString(), updated_at: new Date().toISOString(), lease_until: null, ...r } : { id: serial++, ...r };
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
        const row = this.table === 'crawl_urls' ? { id: serial++, attempts: 0, ...r } : { id: serial++, ...r };
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

/* ── fake websites: a map of host → (path → response) ─────────────────────────────────────────── */
type Resp = { status: number; body: string; ct?: string; final?: string };
const sites = new Map<string, (p: string) => Resp | null>();
(globalThis as any).fetch = async (url: string) => {
  const u = new URL(url);
  const handler = sites.get(u.hostname);
  const r = handler ? handler(u.pathname + u.search) : null;
  if (!r) { const resp = new Response('not found', { status: 404, headers: { 'content-type': 'text/html' } }); Object.defineProperty(resp, 'url', { value: url }); return resp; }
  const resp = new Response(r.body, { status: r.status, headers: { 'content-type': r.ct ?? 'text/html; charset=utf-8' } });
  Object.defineProperty(resp, 'url', { value: r.final ?? url });
  return resp;
};
const words = (n: number) => 'useful local plumbing detail '.repeat(Math.ceil(n / 4));
const html = (o: { title?: string; desc?: string | null; h1?: string | null; body?: string; head?: string; links?: string[]; canonical?: string; viewport?: boolean }) =>
  `<html><head>${o.title !== undefined ? `<title>${o.title}</title>` : ''}${o.desc === null ? '' : `<meta name="description" content="${o.desc ?? (o.title ?? '') + ' desc'}">`}${o.viewport === false ? '' : '<meta name="viewport" content="width=device-width">'}${o.canonical ? `<link rel="canonical" href="${o.canonical}">` : ''}${o.head ?? ''}</head>`
  + `<body><nav>${(o.links ?? []).map((l) => `<a href="${l}">${l}</a>`).join('')}</nav>${o.h1 === null ? '' : `<h1>${o.h1 ?? o.title ?? 'Page'}</h1>`}<p>${o.body ?? words(200)}</p></body></html>`;

const engine = await import('../supabase/functions/_shared/crawl-job.ts');
FULL_CRAWL.tickBudgetMs = 1;
async function crawl(leadId: string, origin: string, home: string, pageCap: number | null) {
  db.outreach_leads.push({ id: leadId, business_name: 'Bath Plumbing Co', derived_town: 'Bath' });
  const job = await engine.createCrawlJob(service, {
    leadId, userId: 'owner', requestedFrom: 'lead_detail', pageCap,
    probe: { homeUrl: origin + '/', servedUrl: origin + '/', town: 'Bath', readableUa: 'test', readableAs: 'OAI-SearchBot', searchBlocked: [], respondedAny: true,
      clientRendered: { flagged: false, appShell: false, htmlBytes: home.length, visibleChars: 900 } as any, missingH1: false, noJsonLd: true, homeWords: 300, homeStatus: 200, homeXRobots: null, homeHtml: home },
  });
  for (let i = 0; i < 20000; i++) { const r = await engine.runCrawlTick(service); if (!r.jobId || r.finalized) break; }
  const jobRow = db.crawl_jobs.find((j) => j.id === job.jobId)!;
  const leadRow = db.lead_crawl_checks.find((r) => r.lead_id === leadId)!;
  return { jobRow, leadRow, audit: leadRow?.full_evidence?.audit as SiteAudit | undefined };
}

/* ═══ 1. A NORMAL SMALL SITE (multi-page sitemap) ═══════════════════════════════════════════════ */
console.log('\n── 1/2. normal small site · multi-page sitemap ──');
{
  const O = 'https://small.example';
  const nav = ['/', '/services/boiler-repair', '/services/leak-repair', '/about', '/contact', '/areas/bath'];
  const pages: Record<string, string> = {
    '/': html({ title: 'Bath Plumbing Co | Plumber in Bath', h1: 'Bath Plumbing Co — plumbers in Bath', links: nav, head: '<script type="application/ld+json">{"@type":"Plumber","name":"Bath Plumbing Co","telephone":"01225 123456"}</script>', body: `Call 01225 123456. Gas Safe registered. ${words(200)} "Highly recommended" — Jane` }),
    '/services/boiler-repair': html({ title: 'Boiler repair in Bath', links: nav, body: `</p><h2>How much does a boiler repair cost?</h2><p>${words(200)}` }),
    '/services/leak-repair': html({ title: 'Leak repair in Bath', links: nav }),
    '/about': html({ title: 'About us', links: nav, body: `Run by owner Sam since 2009. ${words(200)}` }),
    '/contact': html({ title: 'Contact', links: nav, body: 'Call 01225 123456 or email hi@small.example BA1 1AA' }),
    '/areas/bath': html({ title: 'Plumber in Bath', links: nav }),
  };
  sites.set('small.example', (p) => {
    if (p === '/robots.txt') return { status: 200, ct: 'text/plain', body: `User-agent: *\nDisallow: /wp-admin/\nSitemap: ${O}/sitemap.xml` };
    if (p === '/sitemap.xml') return { status: 200, ct: 'application/xml', body: `<urlset>${Object.keys(pages).map((k) => `<url><loc>${O}${k}</loc></url>`).join('')}</urlset>` };
    return pages[p] ? { status: 200, body: pages[p] } : null;
  });
  const { jobRow, leadRow, audit } = await crawl('lead-small', O, pages['/'], PROSPECT_CRAWL_PAGE_CAP);
  ok(jobRow.status === 'complete', `1. small site finishes "complete" (got ${jobRow.status})`);
  ok(leadRow?.mode === 'full' && !!audit, '1. the lead row holds the full evidence AND the grouped audit');
  ok(audit?.basis === 'full' && audit.coverage?.capped === false && audit.coverage.pagesCrawled === 6, `1. coverage: full, not capped, 6 pages read (got ${audit?.coverage?.pagesCrawled})`);
  ok(ids(audit).has('sitemap_ok') && byId(audit, 'sitemap_ok')!.saw.includes('6 addresses'), '2. the multi-page sitemap is read and counted');
  ok(ids(audit).has('service_pages') && byId(audit, 'service_pages')!.count === 2, '1. service pages found and counted');
  ok(ids(audit).has('name_clear') && ids(audit).has('town_stated'), '1. business name and town checked against the lead (name + town stated)');
  ok(ids(audit).has('credentials') && byId(audit, 'credentials')!.saw.includes('Gas Safe'), '1. credentials quoted from the page');
  ok(ids(audit).has('answers_questions'), '1. a question-style heading/answer is recognised');
  ok(ids(audit).has('oai_searchbot_ok') && ids(audit).has('https_ok'), '1. verified strengths are reported as GOOD');
  ok(!ids(audit).has('sitemap_only_pages') && !ids(audit).has('deep_pages'), '1. every page linked from the nav: no orphan / deep-page findings');
  ok(!(audit?.notChecked ?? []).some((n) => /Click depth/.test(n)), '1. the link graph WAS checked on an uncapped crawl with links');
  ok(summariseLeadCrawl(leadRow).status === 'complete' && /Full crawl/.test(summariseLeadCrawl(leadRow).label), '1. the one-line summary says Full crawl · complete');
}

/* ═══ 3. A SITEMAP INDEX ═════════════════════════════════════════════════════════════════════════ */
console.log('\n── 3. sitemap index ──');
{
  const O = 'https://index.example';
  sites.set('index.example', (p) => {
    if (p === '/robots.txt') return { status: 200, ct: 'text/plain', body: `Sitemap: ${O}/sitemap_index.xml` };
    if (p === '/sitemap_index.xml') return { status: 200, ct: 'application/xml', body: `<sitemapindex><sitemap><loc>${O}/page-sitemap.xml</loc></sitemap><sitemap><loc>${O}/post-sitemap.xml</loc></sitemap></sitemapindex>` };
    if (p === '/page-sitemap.xml') return { status: 200, ct: 'application/xml', body: `<urlset><url><loc>${O}/a</loc></url><url><loc>${O}/b</loc></url></urlset>` };
    if (p === '/post-sitemap.xml') return { status: 200, ct: 'application/xml', body: `<urlset><url><loc>${O}/blog/c</loc></url></urlset>` };
    if (['/', '/a', '/b', '/blog/c'].includes(p)) return { status: 200, body: html({ title: `Index ${p}` }) };
    return null;
  });
  const { audit, leadRow } = await crawl('lead-index', O, html({ title: 'Index home' }), PROSPECT_CRAWL_PAGE_CAP);
  ok(leadRow.full_evidence.sitemaps.read === 3, `3. the index and both children are read (got ${leadRow.full_evidence.sitemaps.read})`);
  ok(audit!.coverage!.pagesCrawled === 4, `3. every page the children list is crawled (got ${audit!.coverage!.pagesCrawled})`);
  ok(ids(audit).has('sitemap_only_pages') && byId(audit, 'sitemap_only_pages')!.count === 3, '3. sitemap pages nothing links to are reported, grouped (3 pages, one finding)');
}

/* ═══ 13. LARGE SITE: THE PROSPECT CAP, WITH EXPLICIT COVERAGE ═══════════════════════════════════ */
console.log('\n── 13. large-site cap with explicit coverage ──');
{
  const O = 'https://huge.example';
  const N = 260, CAP = 40;
  sites.set('huge.example', (p) => {
    if (p === '/robots.txt') return { status: 200, ct: 'text/plain', body: `Sitemap: ${O}/sitemap.xml` };
    if (p === '/sitemap.xml') return { status: 200, ct: 'application/xml', body: `<urlset>${Array.from({ length: N }, (_, i) => `<url><loc>${O}/p-${i}</loc></url>`).join('')}</urlset>` };
    if (p === '/' || /^\/p-\d+$/.test(p)) return { status: 200, body: html({ title: `Huge ${p}`, desc: null }) };
    return null;
  });
  const { jobRow, leadRow, audit } = await crawl('lead-huge', O, html({ title: 'Huge home', desc: null }), CAP);
  const c = audit!.coverage!;
  ok(c.capped === true && c.pageCap === CAP, '13. coverage says capped, with the cap');
  ok(c.pagesCrawled === CAP, `13. exactly the cap was read (got ${c.pagesCrawled})`);
  ok(c.notCrawled === N + 1 - CAP, `13. every other address is counted as not read (got ${c.notCrawled}, want ${N + 1 - CAP})`);
  ok(db.crawl_urls.filter((r) => r.job_id === jobRow.id && r.skip_reason === 'coverage_cap').length === c.notCrawled, '13. each not-read address is a recorded row (skip reason coverage_cap) — nothing dropped silently');
  ok(audit!.basis === 'capped' && /Capped crawl/.test(coverageLine(audit!)) && /Not the whole site/.test(coverageLine(audit!)), '13. the view says "Capped crawl … Not the whole site"');
  ok(summariseLeadCrawl(leadRow).status === 'partial' && /not the whole site/.test(summariseLeadCrawl(leadRow).label), '13. every screen\'s one-line summary says partial / not the whole site');
  ok((leadRow.full_evidence.warnings as string[]).some((w) => /Capped crawl/.test(w)), '13. the stored warnings say capped');
  ok(audit!.notChecked.some((n) => /capped crawl/.test(n)), '13. orphan / depth checks are NOT judged on a capped crawl, and it says so');
  const md = byId(audit!, 'missing_description');
  ok(!!md && md.count === CAP && md.urls.length === CAP, `13. a repeated issue across the pages read is ONE finding with its count (${md?.count})`);
  ok(crawlPageCapFor({ isClient: false, requestedFrom: 'outreach' }) === PROSPECT_CRAWL_PAGE_CAP && crawlPageCapFor({ isClient: false, requestedFrom: null }) === PROSPECT_CRAWL_PAGE_CAP, '13. a prospect (or an unknown source) gets the cap');
  ok(crawlPageCapFor({ isClient: true, requestedFrom: 'outreach' }) === null && crawlPageCapFor({ isClient: false, requestedFrom: 'website_build' }) === null && crawlPageCapFor({ isClient: false, requestedFrom: 'paid_client' }) === null, '13. a paying client / Website Build / Paid Clients crawl stays exhaustive');
}

/* ═══ 21–25. SALES INSIGHTS, END TO END (2026-10-07, improve/site-crawl-sales-insights) ═══════════
   The REAL crawl engine against fake websites → the insights it stores on the lead's row → the playbook and
   call script built from that stored row. Pinned: crawl limits and junk exclusion; a specific finding with
   its evidence reaching the script; a strong site that is NOT given an invented fault; the service-page
   fallback only where it is true; no unsupported AI claim in anything said. */
const rich = (o: { title: string; h1?: string; h2?: string[]; nav?: Array<[string, string]>; body?: string; links?: string[]; head?: string }) =>
  '<html><head><title>' + o.title + '</title><meta name="description" content="d"><meta name="viewport" content="width=device-width">' + (o.head ?? '') + '</head><body>'
  + '<nav>' + (o.nav ?? []).map(([l, h]) => '<a href="' + h + '">' + l + '</a>').join('') + '</nav><h1>' + (o.h1 ?? o.title) + '</h1>'
  + (o.h2 ?? []).map((h) => '<h2>' + h + '</h2><p>' + words(60) + '</p>').join('') + '<p>' + (o.body ?? words(420)) + '</p>' + (o.links ?? []).map((l) => '<a href="' + l + '">x</a>').join('') + '</body></html>';
const siteOf = (origin: string, host: string, pages: Record<string, string>) => sites.set(host, (p) => {
  if (p === '/robots.txt') return { status: 200, ct: 'text/plain', body: 'User-agent: *\nDisallow:\nSitemap: ' + origin + '/sitemap.xml' };
  if (p === '/sitemap.xml') return { status: 200, ct: 'application/xml', body: '<urlset>' + Object.keys(pages).map((k) => '<url><loc>' + origin + k + '</loc></url>').join('') + '</urlset>' };
  return pages[p] ? { status: 200, body: pages[p] } : null;
});
const { buildColdCallPlaybook } = await import('../src/lib/coldCallPlaybook.ts');
const { spokenScriptText, MAX_SPOKEN_FINDINGS, FIX_TAIL } = await import('../src/lib/callScript.ts');
const { STRONG_SITE_LINE, SERVICE_PAGES_OPPORTUNITY_LINE, usableInsights } = await import('../src/lib/salesInsights.ts');
const { isLowValuePage, crawlPriority, planCappedBatch } = await import('../src/lib/prospectCrawl.ts');
const NOW = Date.now();
function playbookFor(leadRow: Record<string, any>, web: string) {
  return buildColdCallPlaybook({
    lead: { id: leadRow.lead_id, business_name: 'Bath Plumbing Co', phone: '01225 123456', website: web, category: 'Plumber', derived_town: 'Bath', status: 'contacted' },
    reportAudit: { id: 'a1', short_code: 'abcdef', created_at: new Date(NOW - 86_400_000).toISOString(), business_name: 'Bath Plumbing Co', business_type: 'Plumbers', location_text: 'Bath' },
    report: { hook: { questionsTested: 3, gap: { question: 'plumber in Bath', engineLabel: 'Gemini', namedInstead: ['Bath Boilers', 'Avon Heating'], answerExcerpt: 'Try Bath Boilers.' }, tested: [] } },
    runCrawls: [], leadCrawl: { result: leadRow.result, createdAtMs: NOW - 3_600_000 }, messages: [], nowMs: NOW, callerName: 'Paul',
  });
}
const UNSUPPORTED = /guarantee|will (rank|recommend|cite|name|show)|number one|#1|top of (google|the)|ranked|page one|keyword|SEO score|llms?\.txt|GPTBot|your seo|isn't optimi[sz]ed|AI can't (find|understand)|google can't find/i;

console.log('\n── 21. crawl limits and junk exclusion ──');
{
  const O = 'https://blogheavy.example';
  const posts = Array.from({ length: 150 }, (_, i) => '/blog/post-' + i);
  const key: Record<string, string> = {
    '/': rich({ title: 'Bath Plumbing Co | Plumber in Bath', nav: [['Services', '/services'], ['About', '/about'], ['Contact', '/contact'], ['Blog', '/blog']], links: ['/privacy-policy', '/cookie-policy', '/terms-and-conditions', ...posts.slice(0, 20)] }),
    '/services': rich({ title: 'Services' }), '/services/boiler-repair': rich({ title: 'Boiler repair in Bath' }), '/services/leak-repair': rich({ title: 'Leak repair in Bath' }),
    '/about': rich({ title: 'About' }), '/contact': rich({ title: 'Contact' }), '/gallery': rich({ title: 'Our work' }),
    '/privacy-policy': rich({ title: 'Privacy' }), '/cookie-policy': rich({ title: 'Cookies' }), '/terms-and-conditions': rich({ title: 'Terms' }),
    '/tag/boilers': rich({ title: 'Tag' }), '/category/news': rich({ title: 'Cat' }), '/blog/page/2': rich({ title: 'Page 2' }),
  };
  for (const p of posts) key[p] = rich({ title: 'Post ' + p });
  siteOf(O, 'blogheavy.example', key);
  const { jobRow, leadRow, audit } = await crawl('lead-blogheavy', O, key['/'], PROSPECT_CRAWL_PAGE_CAP);
  const rows = db.crawl_urls.filter((r) => r.job_id === jobRow.id && r.kind === 'page');
  const read = rows.filter((r) => r.status === 'done' || r.status === 'failed').map((r) => new URL(r.url).pathname);
  ok(PROSPECT_CRAWL_PAGE_CAP === 60 && audit!.coverage!.pagesCrawled === 60 && audit!.coverage!.capped, '21. the prospect limit is 60 pages and a bigger site is reported as capped (read ' + audit!.coverage!.pagesCrawled + ')');
  ok(['/services', '/services/boiler-repair', '/services/leak-repair', '/about', '/contact', '/gallery'].every((p) => read.includes(p)), '21. every service, about, contact and proof page was read BEFORE the blog filled the budget');
  ok(read.filter((p) => p.startsWith('/blog/post-')).length <= 60 - 7, '21. the blog only got what the main pages left (' + read.filter((p) => p.startsWith('/blog/post-')).length + ' posts)');
  const skippedLow = rows.filter((r) => r.skip_reason === 'low_value').map((r) => new URL(r.url).pathname);
  ok(['/privacy-policy', '/cookie-policy', '/terms-and-conditions', '/tag/boilers', '/category/news', '/blog/page/2'].every((p) => skippedLow.includes(p)), '21. privacy, cookies, terms, tag, category and pagination pages are recorded as skipped low_value (' + skippedLow.length + ')');
  ok(!read.some((p) => skippedLow.includes(p)) && read.length === 60, '21. …never read, and never counted against the limit');
  ok(isLowValuePage(O + '/privacy-policy') && isLowValuePage(O + '/2026/09/post') && isLowValuePage(O + '/blog/page/3') && !isLowValuePage(O + '/services/boiler-repair') && !isLowValuePage(O + '/about-us'), '21. the junk test names junk and nothing else');
  ok(crawlPriority(O + '/services/x', 1, O + '/') < crawlPriority(O + '/about', 1, O + '/') && crawlPriority(O + '/about', 1, O + '/') < crawlPriority(O + '/blog/post-1', 1, O + '/') && crawlPriority(O + '/a', 1, O + '/') < crawlPriority(O + '/a', 3, O + '/'), '21. priority: services, then about, then the blog; shallower first');
  const plan = planCappedBatch([{ url: O + '/blog/x', kind: 'page', depth: 1 }, { url: O + '/sitemap.xml', kind: 'sitemap', depth: 0 }, { url: O + '/privacy', kind: 'page', depth: 1 }, { url: O + '/services', kind: 'page', depth: 1 }], O + '/');
  ok(plan.read.map((r) => r.url.replace(O, '')).join() === '/sitemap.xml,/services,/blog/x' && plan.lowValue.length === 1, '21. a capped batch reads sitemaps, then services, then the blog; low-value split out');
  ok(typeof leadRow.result.insights === 'object' && JSON.stringify(leadRow.result.insights).length < 9000, '21. the insights are stored on the row\'s result and stay small');
}

console.log('\n── 22. a specific finding, with its evidence, reaches the script ──');
{
  const O = 'https://crammed.example';
  const nav: Array<[string, string]> = [['Home', '/'], ['Services', '/services'], ['About', '/about'], ['Contact', '/contact']];
  const pages: Record<string, string> = {
    '/': rich({ title: 'Bath Plumbing Co | Plumber in Bath', h1: 'Bath Plumbing Co — plumbers in Bath', nav, links: ['/services'], body: 'Call 01225 123456. Gas Safe registered. ' + words(300) + ' "Highly recommended" — Jane' }),
    '/services': rich({ title: 'Our Services', h2: ['Boiler Repair', 'Leak Repair', 'Bathroom Fitting'], nav }),
    '/about': rich({ title: 'About Bath Plumbing Co', nav, body: 'Run by owner Sam since 2009. ' + words(300) }),
    '/contact': rich({ title: 'Contact Bath Plumbing Co', nav, body: 'Call 01225 123456 BA1 1AA' }),
  };
  siteOf(O, 'crammed.example', pages);
  const { leadRow, audit } = await crawl('lead-crammed', O, pages['/'], PROSPECT_CRAWL_PAGE_CAP);
  const ins = usableInsights(leadRow.result.insights);
  ok(!!ins && ins.state === 'issues' && ins.findings[0].id === 'services_on_one_page', '22. the crawl stores the insight "services on one page" as the strongest (' + ins?.findings.map((f) => f.id).join() + ')');
  ok(JSON.stringify(audit!.insights) === JSON.stringify(leadRow.result.insights), '22. the detailed audit and the call script read the SAME insights');
  const pb = playbookFor(leadRow, O);
  const line = pb.script.found.lines.join(' ');
  ok(pb.script.found.lines.length <= MAX_SPOKEN_FINDINGS && /Boiler Repair/.test(line) && /Leak Repair/.test(line) && /Bathroom Fitting/.test(line), '22. the script says the SPECIFIC services that are crammed together, not generic filler (' + line.slice(0, 120) + '…)');
  ok(pb.script.found.lines[pb.script.found.lines.length - 1].endsWith(FIX_TAIL), '22. it ends on how we would fix it, once');
  const src = pb.script.found.sources[0];
  ok(!!src && src.evidence!.urls.includes(O + '/services') && src.evidence!.quotes.some((q) => /Leak Repair/.test(q)) && /services listed on/.test(src.evidence!.signal ?? '') && !!src.improvement, '22. the page, the headings read and the Findable improvement survive to the script layer');
  ok(pb.findings[0].kind === 'services_on_one_page' && pb.findings[0].proof.some((p) => p === 'Page: ' + O + '/services'), '22. the operator view keeps the proof lines (Page: …)');
  ok(!UNSUPPORTED.test([...pb.script.opener, ...pb.script.found.lines, ...pb.script.bridge].join(' ')), '22. nothing said about the site makes an unsupported AI or ranking claim');
  ok(pb.script.opener[1].includes('found') && !/\b(?:schema|canonical|noindex|sitemap|robots)\b/i.test(pb.script.found.lines.join(' ')), '22. plain words, no SEO jargon');
}

console.log('\n── 23. a strong site is a result, not a gap ──');
{
  const O = 'https://strong.example';
  const nav: Array<[string, string]> = [['Home', '/'], ['Boiler Repair', '/boiler-repair'], ['Leak Repair', '/leak-repair'], ['Bathroom Fitting', '/bathroom-fitting'], ['About', '/about'], ['Contact', '/contact']];
  const pages: Record<string, string> = {
    '/': rich({ title: 'Bath Plumbing Co | Plumber in Bath', h1: 'Bath Plumbing Co — plumbers in Bath', nav, links: ['/boiler-repair', '/leak-repair', '/bathroom-fitting'], body: 'Call 01225 123456. Gas Safe registered. ' + words(400) + ' "Highly recommended" — Jane' }),
    '/boiler-repair': rich({ title: 'Boiler Repair in Bath', nav, body: words(420) }), '/leak-repair': rich({ title: 'Leak Repair in Bath', nav, body: words(420) }),
    '/bathroom-fitting': rich({ title: 'Bathroom Fitting in Bath', nav, body: words(420) }),
    '/about': rich({ title: 'About Bath Plumbing Co', nav, body: 'Run by owner Sam since 2009. ' + words(300) }), '/contact': rich({ title: 'Contact Bath Plumbing Co', nav, body: 'Call 01225 123456 BA1 1AA' }),
  };
  siteOf(O, 'strong.example', pages);
  const { leadRow } = await crawl('lead-strong', O, pages['/'], PROSPECT_CRAWL_PAGE_CAP);
  const ins = usableInsights(leadRow.result.insights);
  ok(ins?.state === 'strong_site' && ins.findings.length === 0, '23. nothing real wrong → state strong_site with NO finding (' + ins?.state + ': ' + ins?.findings.map((f) => f.id).join() + ')');
  ok(ins?.opportunity === null && ins!.services.filter((s) => s.coverage === 'dedicated').length === 3, '23. all three services already have a dedicated page → we do NOT claim they need creating');
  const pb = playbookFor(leadRow, O);
  const outcomeNote = pb.findingsNote ?? '';
  ok(pb.findings.length === 0 && pb.script.found.lines.length === 1 && pb.script.found.lines[0] === STRONG_SITE_LINE, '23. the script says the site is in good shape and invents no criticism (' + pb.script.found.lines.join(' | ').slice(0, 90) + ')');
  ok(!/need to create|missing|isn't|doesn't|couldn't find a/.test(pb.script.found.lines[0]) || /couldn't find anything wrong/.test(pb.script.found.lines[0]), '23. no manufactured fault in the fallback');
  ok(/do not invent/i.test(pb.script.found.note ?? ''), '23. the rep is told not to invent one (' + (pb.script.found.note ?? '').slice(0, 60) + ')');
  ok(!UNSUPPORTED.test([...pb.script.opener, ...pb.script.found.lines, ...pb.script.bridge].join(' ')) && outcomeNote !== undefined, '23. nothing unsupported said about AI');
}
{
  const O = 'https://fewpages.example';
  const nav: Array<[string, string]> = [['Home', '/'], ['Boiler Repair', '/boiler-repair'], ['About', '/about'], ['Contact', '/contact']];
  const pages: Record<string, string> = {
    '/': rich({ title: 'Bath Plumbing Co | Plumber in Bath', h1: 'Bath Plumbing Co — plumbers in Bath', nav, links: ['/boiler-repair'], body: 'Call 01225 123456. Gas Safe registered. ' + words(400) + ' "Highly recommended" — Jane' }),
    '/boiler-repair': rich({ title: 'Boiler Repair in Bath', nav, body: words(420) }),
    '/about': rich({ title: 'About Bath Plumbing Co', nav, body: 'Run by owner Sam since 2009. ' + words(300) }), '/contact': rich({ title: 'Contact Bath Plumbing Co', nav, body: 'Call 01225 123456 BA1 1AA' }),
  };
  siteOf(O, 'fewpages.example', pages);
  const { leadRow } = await crawl('lead-few', O, pages['/'], PROSPECT_CRAWL_PAGE_CAP);
  const ins = usableInsights(leadRow.result.insights);
  ok(ins?.state === 'strong_site' && ins.opportunity?.kind === 'service_pages', '23. a clean site with one service page → the service-page opportunity (' + ins?.opportunity?.kind + ')');
  const pb = playbookFor(leadRow, O);
  ok(pb.script.found.lines[0] === SERVICE_PAGES_OPPORTUNITY_LINE && /Your site's actually in decent shape\. What we'd mainly do is build stronger dedicated pages around each of your services, so Google and AI systems have a much clearer understanding of everything you offer and where you offer it\.$/.test(pb.script.found.lines[0]), '23. the exact fallback line when there is no fault (Paul\'s words)');
}

console.log('\n── 24. technical issues still lead, with their evidence ──');
{
  const O = 'https://blocked.example';
  const nav: Array<[string, string]> = [['Home', '/'], ['Services', '/services'], ['About', '/about']];
  const pages: Record<string, string> = {
    '/': rich({ title: 'Bath Plumbing Co | Plumber in Bath', nav, links: ['/services', '/hidden'], head: '<meta name="robots" content="index">' }),
    '/services': rich({ title: 'Services', h2: ['Boiler Repair', 'Leak Repair', 'Bathroom Fitting'], nav }),
    '/about': rich({ title: 'About', nav, head: '<meta name="robots" content="noindex">', body: 'Call 01225 123456 ' + words(300) }),
    '/hidden': rich({ title: 'Hidden', nav }),
  };
  siteOf(O, 'blocked.example', pages);
  const { leadRow, audit } = await crawl('lead-blocked', O, pages['/'], PROSPECT_CRAWL_PAGE_CAP);
  const pb = playbookFor(leadRow, O);
  const kinds = pb.findings.map((f) => f.kind);
  ok(audit!.findings.some((f) => f.id === 'noindex_pages' && f.urls.includes(O + '/about') && f.evidence === undefined || f.id === 'noindex_pages'), '24. the crawl found the noindex page, with its address');
  ok(kinds.length <= 3 && kinds.includes('services_on_one_page'), '24. the content finding is merged into the same ordered list as the technical ones (' + kinds.join() + ')');
  ok(pb.script.found.lines.length <= MAX_SPOKEN_FINDINGS, '24. but only one or two points are ever said');
}

console.log('\n── 25. an older crawl without insights still works ──');
{
  const row = { result: { version: 2, signals: { homeUrl: 'https://old.example/', fetchFailed: false, searchBlocked: [], readableAs: 'OAI-SearchBot', clientRendered: { flagged: false, visibleChars: 4000, htmlBytes: 30000, appShell: false }, missingH1: false, noJsonLd: false, duplicates: null, thinPages: 2, thinPageUrls: ['https://old.example/a'], checkedPages: [] } } };
  const pb = playbookFor({ lead_id: 'x', result: row.result }, 'https://old.example');
  ok(pb.script.found.lines.length === 1 && /light on detail/.test(pb.script.found.lines[0]) && !pb.script.found.lines[0].endsWith(FIX_TAIL), '25. a crawl stored before insights existed still gives its technical point, unchanged');
  const clean = { result: { ...row.result, signals: { ...row.result.signals, thinPages: 0, thinPageUrls: [] } } };
  const pc = playbookFor({ lead_id: 'x', result: clean.result }, 'https://old.example');
  ok(pc.script.found.lines.length === 1 && /couldn't see one huge technical problem/.test(pc.script.found.lines[0]), '25. …and a clean old crawl keeps the old honest line (no insights to say more)');
  ok(usableInsights({ version: 1, state: 'issues', findings: 'x' }) === null, '25. a malformed stored insight is ignored, never half-used');
}

/* ═══ pure audit fixtures (robots, noindex, canonical, schema, redirect, grouping) ══════════════ */
const O = 'https://fix.example';
function page(p: string, over: Partial<ReturnType<typeof processPage>['d']> = {}, extra: Partial<SiteAuditInput['pages'][number]> = {}) {
  const ev = processPage({ url: O + p, finalUrl: O + p, status: 200, xRobotsTag: null, html: html({ title: `Fix ${p}`, links: ['/', '/a', '/b'] }), isHome: p === '/' }, O + '/');
  return { url: O + p, finalUrl: O + p, status: 'done', httpStatus: 200, source: 'link', depth: 1, d: { ...ev.d, ...over }, b: ev.b, l: ev.l, ...extra };
}
const baseInput = (pages: SiteAuditInput['pages'], over: Partial<SiteAuditInput> = {}): SiteAuditInput => ({
  servedUrl: O + '/', requestedUrl: O + '/', robotsTxt: 'User-agent: *\nDisallow:', pages, sitemapsRead: 1, sitemapUrlCount: pages.length,
  offSiteSitemap: { count: 0, samples: [] }, coverage: { pageCap: 500, capped: false, pagesCrawled: pages.length, urlsDiscovered: pages.length, notCrawled: 0, sitemapUrls: pages.length },
  probe: { searchBlocked: [], readableAs: 'OAI-SearchBot', clientRendered: null }, duplicates: null, lead: { name: 'Fix Plumbing', town: 'Bath' }, ...over,
});

console.log('\n── 4/12. robots blocks · OAI-SearchBot block · GPTBot never a finding ──');
{
  const pages = [page('/'), page('/a', { family: 'service' })];
  const all = buildSiteAudit(baseInput(pages, { robotsTxt: 'User-agent: *\nDisallow: /' }));
  ok(byId(all, 'robots_blocks_all')?.severity === 'high', '4. "User-agent: * / Disallow: /" → one HIGH finding');
  ok(!ids(all).has('robots_blocks_oai-searchbot') && !ids(all).has('robots_blocks_googlebot'), '4. … said once, not repeated per crawler');
  const oai = buildSiteAudit(baseInput(pages, { robotsTxt: 'User-agent: OAI-SearchBot\nDisallow: /\n\nUser-agent: *\nDisallow:' }));
  const f = byId(oai, 'robots_blocks_oai-searchbot');
  ok(f?.severity === 'high' && f.evidence!.includes('User-agent: OAI-SearchBot'), '12. an OAI-SearchBot block is HIGH, quoting its robots.txt group');
  ok(!ids(oai).has('oai_searchbot_ok'), '12. … and the "ChatGPT can read it" strength is not shown');
  ok(!ids(oai).has('robots_blocks_googlebot'), '12. other crawlers falling back to "*" are not flagged');
  const gpt = buildSiteAudit(baseInput(pages, { robotsTxt: 'User-agent: GPTBot\nDisallow: /' }));
  ok(!gpt.findings.some((x) => /gptbot/i.test(x.id + x.title + x.saw)) && ids(gpt).has('oai_searchbot_ok'), '4. a GPTBot (training) block is never a finding; OAI-SearchBot still verified');
  const partial = buildSiteAudit(baseInput(pages, { robotsTxt: 'User-agent: Googlebot\nDisallow: /a' }));
  ok(byId(partial, 'robots_blocks_pages_googlebot')?.count === 1, '4. a block on an important page (service) for one crawler is MEDIUM, with the page');
  const fetchBlock = buildSiteAudit(baseInput(pages, { probe: { searchBlocked: ['OAI-SearchBot', 'PerplexityBot'], readableAs: 'ChatGPT-User', clientRendered: null } }));
  ok(byId(fetchBlock, 'search_crawler_refused')?.severity === 'high', '12. a real fetch refused as OAI-SearchBot (403 / challenge) is HIGH');
  ok(robotsRulesFor('User-agent: Bingbot\nUser-agent: Googlebot\nDisallow: /x', 'Googlebot').rules.disallow[0] === '/x' && robotsAllows(robotsRulesFor('User-agent: *\nDisallow: /', 'Googlebot').rules, '/') === false, '4. robots groups: shared groups and * fallback read the standard way');
}

console.log('\n── 5. no sitemap ──');
{
  const a = buildSiteAudit(baseInput([page('/')], { sitemapsRead: 0, sitemapUrlCount: 0, robotsTxt: null }));
  ok(byId(a, 'no_sitemap')?.severity === 'medium' && byId(a, 'no_robots')?.severity === 'low', '5. no sitemap = MEDIUM; no robots.txt = LOW (allowed by default)');
}

console.log('\n── 7. redirect ──');
{
  const pages = [page('/'), { url: O + '/old', finalUrl: O + '/new', status: 'done', httpStatus: 200, source: 'link', depth: 1, d: null, b: null, l: null }];
  const a = buildSiteAudit(baseInput(pages as any, { requestedUrl: 'https://old-domain.example/' }));
  ok(byId(a, 'internal_redirects')?.urls[0] === `${O}/old → ${O}/new`, '7. an internal redirect is listed as "from → to"');
  ok(byId(a, 'redirects_to_other_domain')?.severity === 'low', '7. the address on file redirecting to another domain is reported (LOW)');
}

console.log('\n── 8. duplicate findings grouped ──');
{
  const pages = [page('/'), ...Array.from({ length: 81 }, (_, i) => page(`/s-${i}`, { description: '' }))];
  const a = buildSiteAudit(baseInput(pages));
  const md = a.findings.filter((f) => f.id === 'missing_description');
  ok(md.length === 1 && md[0].count === 81 && md[0].urls.length === 81 && md[0].urlsComplete, '8. "Missing meta description" × 81 is ONE finding: count 81, all 81 addresses kept');
  const html81 = renderToStaticMarkup(createElement(ProspectAuditView, viewProps({ kind: 'audited', url: O, audit: a, checkedAt: new Date().toISOString(), source: 'saved' })));
  ok((html81.match(/data-finding="missing_description"/g) ?? []).length === 1 && /81 pages affected/.test(html81), '8. rendered once, with "81 pages affected"');
  ok(/Show all 81/.test(html81) && (html81.match(/fix\.example\/s-\d+/g) ?? []).length <= 10, '8. five examples shown, the rest behind "Show all 81"');
}

console.log('\n── 9/10/11. malformed schema · noindex · canonical mismatch ──');
{
  const bad = processPage({ url: O + '/', finalUrl: O + '/', status: 200, xRobotsTag: null, html: html({ title: 'x', head: '<script type="application/ld+json">{"@type": "Plumber", "name": }</script><meta name="robots" content="noindex">' }), isHome: true }, O + '/');
  ok(bad.d.jsonLdInvalid === 1 && bad.d.noindex === true && bad.d.viewport === true, '9/10. the page digest records invalid JSON-LD, noindex and the viewport');
  const a = buildSiteAudit(baseInput([
    { ...page('/'), d: bad.d },
    page('/a', { noindex: true, robots: 'noindex', family: 'service' }),
    page('/b', { canonical: O + '/' }), page('/c', { canonical: O + '/' }), page('/d', { canonical: O + '/' }),
    page('/e', { canonical: 'https://other.example/e' }),
    page('/f', { canonical: O + '/f/' }),
  ]));
  ok(byId(a, 'schema_malformed')?.severity === 'medium', '9. broken JSON-LD → MEDIUM "Broken structured data"');
  ok(byId(a, 'noindex_home')?.severity === 'high' && byId(a, 'noindex_pages')?.severity === 'medium', '10. noindex homepage HIGH; noindex service page MEDIUM');
  ok(byId(a, 'canonical_mismatch')?.count === 3, '11. three pages pointing their canonical at the homepage → one finding, count 3');
  ok(!byId(a, 'canonical_mismatch')!.urls.some((u) => u.endsWith('/f')), '11. a canonical differing only by a trailing slash is the same page (not a mismatch)');
  ok(byId(a, 'canonical_off_site')?.severity === 'high', '11. a canonical on another domain is HIGH');
  const np = buildSiteAudit(baseInput([page('/', { viewport: false, family: 'homepage' })]));
  ok(byId(np, 'no_viewport')?.severity === 'medium', 'mobile: no viewport on the homepage → MEDIUM');
  const old = buildSiteAudit(baseInput([page('/', { viewport: undefined, jsonLdInvalid: undefined })]));
  ok(!ids(old).has('no_viewport') && !ids(old).has('schema_malformed') && old.notChecked.some((n) => /viewport/i.test(n)), 'an older page digest (no viewport field) is "not checked", never "missing"');
}

/* ═══ 6. NO WEBSITE · 15. FAILED CRAWL · 17. REOPEN FROM STORED ══════════════════════════════════ */
console.log('\n── 6. no website ──');
{
  const s1 = websiteState({ lead: { website: '', place_id: 'ChIJx' }, row: null, running: null });
  ok(s1.kind === 'no_website' && s1.confirmed, '6. blank website + a Google place id = confirmed no website');
  const s2 = websiteState({ lead: { website: null, place_id: null }, row: null, running: null });
  ok(s2.kind === 'no_website' && !s2.confirmed, '6. blank website, hand-added lead = "none on file", never asserted');
  const html6 = renderToStaticMarkup(createElement(ProspectAuditView, viewProps(s1)));
  ok(html6.includes(NO_WEBSITE_TEXT) && !/could not be crawled|crawl failed/i.test(html6), '6. the truthful no-website text, never a crawl error');
  ok(!/https?:\/\/[a-z0-9-]+\.(co\.uk|com)/i.test(html6.replace(/https:\/\/www\.yext[^"]*/g, '')), '6. no domain is invented');
  ok(callPoint({ score: null, site: s1 }).site?.headline === NO_WEBSITE_TEXT, '6. the call point uses the no-website fact');
  ok(websiteState({ lead: { website: 'https://www.yell.com/biz/x' }, row: null, running: null }).kind === 'directory_only', '6. a directory listing on file is not crawled as their site');
}

console.log('\n── 15. failed crawl ──');
{
  ok(classifyFetchError({ message: 'The operation was aborted' }) === 'timeout' && classifyFetchError({ message: 'invalid peer certificate: Expired' }) === 'tls'
    && classifyFetchError({ message: 'dns error: failed to lookup address' }) === 'dns' && classifyFetchError({ message: 'maximum number of redirects exceeded' }) === 'redirect_loop'
    && classifyFetchError({ message: 'Connection refused (os error 111)' }) === 'refused' && classifyFetchError({ blocked: true }) === 'blocked'
    && classifyFetchError({ responded: true, status: 503 }) === 'http_error' && classifyFetchError({ responded: true, status: 200 }) === 'empty', '15. down / TLS / DNS / redirect loop / refused / blocked / error status / empty are told apart');
  const row = { url: 'https://down.example/', created_at: new Date().toISOString(), mode: 'standard', result: { checked_at: new Date().toISOString(), signals: { fetchFailed: true }, homeFetch: { kind: 'tls' as const, status: null } }, full_evidence: null };
  const st = websiteState({ lead: { website: 'https://down.example' }, row, running: null });
  ok(st.kind === 'failed' && /certificate/.test(st.reason), '15. a failed crawl shows WHY (the certificate error)');
  ok(auditFromStoredCrawl(row) === null, '15. a failed crawl produces no findings (nothing is fabricated)');
  const html15 = renderToStaticMarkup(createElement(ProspectAuditView, viewProps(st)));
  ok(/could not be crawled/.test(html15) && /Nothing below is a finding/.test(html15) && !/data-testid="pa-finding"/.test(html15), '15. the view says it could not be crawled and lists no findings');
  const engineSrc = read('supabase/functions/crawl-check/index.ts');
  ok(/homeFetch = \{ kind, status/.test(engineSrc) && /\.\.\.\(homeFetch \? \{ homeFetch \} : \{\}\)/.test(engineSrc), '15. crawl-check stores the classified reason on the crawl row');
}

console.log('\n── 17. detailed results reopen from stored evidence ──');
{
  const leadRow = db.lead_crawl_checks.find((r) => r.lead_id === 'lead-small')!;
  const reopened = auditFromStoredCrawl(leadRow);
  ok(!!reopened && reopened === leadRow.full_evidence.audit, '17. the stored audit is returned as stored — no re-crawl, no recompute');
  const st = websiteState({ lead: { website: 'https://small.example' }, row: leadRow, running: null });
  ok(st.kind === 'audited' && st.source === 'saved', '17. reopening labels it a SAVED result');
  ok(websiteState({ lead: { website: 'https://small.example' }, row: leadRow, running: null, justRan: true }).kind === 'audited' && (websiteState({ lead: { website: 'https://small.example' }, row: leadRow, running: null, justRan: true }) as any).source === 'fresh', '17. … and a crawl this view just watched as FRESH');
  const legacyFull = { mode: 'full', created_at: '2026-09-23T10:00:00Z', url: 'https://bs4.example', full_evidence: { version: 2, completeness: 'complete', servedUrl: 'https://bs4.example/', technical: [{ kind: 'missing_description', detail: 'Page has no meta description.', count: 81, urls: ['https://bs4.example/a'] }], robots: { found: true, sitemaps: [], disallowsAll: false, excerpt: '' }, business: { credentials: [], reviews: [], phones: [] } as any } } as any;
  const la = auditFromStoredCrawl(legacyFull)!;
  ok(la.basis === 'full_legacy' && byId(la, 'missing_description')!.count === 81 && byId(la, 'missing_description')!.urlsComplete === false, '17. an older full crawl reopens with its counts, examples-only lists marked incomplete');
  const quick = { mode: 'standard', created_at: '2026-10-01T10:00:00Z', result: { signals: { fetchFailed: false, searchBlocked: [], pagesChecked: 12, missingH1: true, noJsonLd: true, thinPageUrls: ['https://q.example/x'] } } } as any;
  const qa = auditFromStoredCrawl(quick)!;
  ok(qa.basis === 'quick' && /quick check of up to 12 pages/i.test(qa.notChecked.join(' ')) && /Quick check/.test(coverageLine(qa)), '17. a quick 12-page check reopens labelled quick — never as a full crawl');
}

/* ═══ 14. CACHE REUSE ═══════════════════════════════════════════════════════════════════════════ */
console.log('\n── 14. cache reuse ──');
{
  const now = Date.parse('2026-10-05T12:00:00Z');
  const row = (ageMs: number, extra: any = {}) => ({ url: 'https://small.example/', created_at: new Date(now - ageMs).toISOString(), mode: 'full', job_id: 'job-x', full_evidence: { version: 2, completeness: 'complete' }, result: { signals: { fetchFailed: false } }, ...extra });
  const r1 = prospectCrawlReuse(row(3600_000), { nowMs: now, websiteUrl: 'small.example', force: false, role: 'sales' });
  ok(r1.reuse === true && (r1 as any).jobId === 'job-x', '14. a full crawl an hour old is reused (same job, nothing fetched)');
  ok(prospectCrawlReuse(row(PROSPECT_CRAWL_REUSE_MS + 1), { nowMs: now, websiteUrl: 'small.example', force: false, role: 'sales' }).reuse === false, '14. older than the reuse window → crawled again');
  ok(prospectCrawlReuse(row(3600_000, { full_evidence: { version: 2, completeness: 'failed' } }), { nowMs: now, websiteUrl: 'small.example', force: false, role: 'sales' }).reuse === false, '14. a failed crawl is never reused');
  ok(prospectCrawlReuse(row(3600_000, { mode: 'standard', full_evidence: null }), { nowMs: now, websiteUrl: 'small.example', force: false, role: 'sales' }).reuse === false, '14. a quick (standard) check is not reused as a full crawl');
  ok(prospectCrawlReuse(row(3600_000), { nowMs: now, websiteUrl: 'another.example', force: false, role: 'sales' }).reuse === false, '14. a different website on the lead → crawled again');
  ok(prospectCrawlReuse(row(3600_000), { nowMs: now, websiteUrl: 'small.example', force: true, role: 'sales' }).reuse === true, '14. a rep forcing within a day still gets the saved crawl');
  ok(prospectCrawlReuse(row(PROSPECT_CRAWL_MIN_GAP_MS + 1), { nowMs: now, websiteUrl: 'small.example', force: true, role: 'sales' }).reuse === false, '14. a rep may force once the saved crawl is a day old');
  ok(prospectCrawlReuse(row(60_000), { nowMs: now, websiteUrl: 'small.example', force: true, role: 'admin' }).reuse === false, '14. an admin may force any time');
  ok(mayForceRecrawl('sales', 3600_000) === false && mayForceRecrawl('admin', 0) === true, '14. the Re-crawl button follows the same rule');
  const src = read('supabase/functions/crawl-check/index.ts');
  const reuseAt = src.indexOf('prospectCrawlReuse(savedRow'), probeAt = src.indexOf('const probes = await Promise.all');
  ok(reuseAt > 0 && reuseAt < probeAt, '14. crawl-check decides reuse BEFORE fetching anything');
  ok(/cached: true, job_id: reuse\.jobId/.test(src) && /activeJobFor\(service, leadId, homeUrl\)/.test(src), '14. a reuse answers cached with the saved job; a running job always wins');
  ok(!/sales_check|guardAction|guard_action|auditBudget|create-ai-audit/.test((read('src/lib/prospectCrawl.ts') + read('src/lib/siteAudit.ts')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), '14. crawling touches no AI-check allowance, audit budget or guard');
}

/* ═══ 16. MOBILE RESULTS UI · ONE SCROLL ═════════════════════════════════════════════════════════ */
console.log('\n── 16. mobile results UI ──');
function viewProps(site: any) {
  return { score: null, rivalsWithheld: false, aiInFlight: false, site, point: callPoint({ score: null, site }), crawl: { canCrawl: true, role: 'sales', starting: false, error: null, onCrawl: () => {} } };
}
{
  const dialog = read('src/components/ProspectAuditDialog.tsx');
  const view = read('src/components/ProspectAuditView.tsx');
  const frameAt = view.indexOf('export function ProspectAuditFrame'), frameEnd = view.indexOf('\n}\n', frameAt);
  const frame = view.slice(frameAt, frameEnd), rest = view.slice(0, frameAt).replace(/PROSPECT_AUDIT_CONTENT_CLASS = '[^']*'/, '') + view.slice(frameEnd);
  ok((frame.match(/overflow-y-auto/g) ?? []).length === 1 && !/overflow-y-auto|overflow-auto|max-h-\[/.test(rest) && !/overflow-y-auto|max-h-\[/.test(dialog), '16. ONE scroll container (the window body); nothing else scrolls on its own');
  ok(/className=\{PROSPECT_AUDIT_CONTENT_CLASS\}/.test(dialog) && /h-\[100dvh\][^']*sm:h-\[92vh\][^']*sm:max-w-5xl/.test(view), '16. full screen on a phone, a large window on a desktop');
  ok(/break-all underline/.test(frame) && /break-words text-base/.test(frame), '16. the header\'s long name and website wrap on a phone');
  ok(!/\bw-\[(?:[4-9]\d\d|\d{4,})px\]|min-w-\[(?:[4-9]\d\d|\d{4,})px\]/.test(view), '16. no fixed width wider than a 390px phone');
  ok(/break-all/.test(view) && /overflow-wrap:anywhere/.test(view), '16. long URLs and evidence wrap instead of overflowing sideways');
  ok(/grid gap-3 md:grid-cols-3/.test(view) && /lg:grid-cols-2/.test(view), '16. cards stack on a phone and sit side by side on a desktop');
  ok(!/HookAuditDialog|OutreachTable|OutreachMobileCard/.test(dialog + view), '16. the compact Outreach row is not touched by the view');
}

/* ═══ 18. EXISTING AI AUDIT SCORES UNCHANGED (+ citations shown) ════════════════════════════════ */
console.log('\n── 18. AI scores unchanged · mixed ChatGPT / Google AI ──');
{
  const state = initialHookStateV2(['plumber in bath', 'emergency plumber bath', 'boiler repair bath']);
  const cell = (named: boolean, comp: string[] = [], cites: any[] = []) => ({ answer_text: named ? 'Fix Plumbing is a good choice.' : 'Try Rival A or Rival B.', named, self_named: named, competitors: comp, citations: cites });
  const rows: HookScoreRow[] = [
    { question: 'plumber in bath', status: 'done', result: { chatgpt: cell(true, [], [{ title: 'Checkatrade', url: 'https://www.checkatrade.com/x' }]), gemini: cell(false, ['Rival A', 'Rival B'], [{ title: 'Rival', url: 'https://rival.example/' }]) } },
    { question: 'emergency plumber bath', status: 'done', result: { chatgpt: cell(false, ['Rival C']), gemini: cell(false, ['Rival A']) } },
    { question: 'boiler repair bath', status: 'done', result: { chatgpt: cell(true), gemini: cell(false, ['Rival D']) } },
  ];
  const s = scoreHookRun(state, rows, { named: { businessName: 'Fix Plumbing', trade: 'plumber', town: 'Bath' } as any });
  ok(s.complete && s.named === 2 && s.expected === 6 && s.percent === 33, `18. the score is the same 2 / 6 (33%) it always was (got ${s.named}/${s.expected}, ${s.percent}%)`);
  ok(s.perEngine.find((t) => t.engine === 'chatgpt')!.named === 2 && s.perEngine.find((t) => t.engine === 'gemini')!.named === 0, '18. mixed results: ChatGPT 2/3, Google AI 0/3');
  ok(s.results[0].citations?.[0]?.url === 'https://www.checkatrade.com/x' && s.results[1].citations?.[0]?.url === 'https://rival.example/', '18. each cell carries ITS OWN cited sources (display only)');
  const stripped = JSON.stringify(s, (k, v) => (k === 'citations' ? undefined : v));
  const again = JSON.stringify(scoreHookRun(state, rows.map((r) => ({ ...r, result: Object.fromEntries(Object.entries(r.result as any).map(([e, c]: any) => [e, { ...c, citations: undefined }])) })), { named: { businessName: 'Fix Plumbing', trade: 'plumber', town: 'Bath' } as any }), (k, v) => (k === 'citations' ? undefined : v));
  ok(stripped === again, '18. citations change nothing else in the score (same output with or without them)');
  ok(HOOK_ENGINES.length === 2, '18. two engines, as before');
  const site = { kind: 'audited', url: O, audit: buildSiteAudit(baseInput([page('/')], { robotsTxt: 'User-agent: OAI-SearchBot\nDisallow: /' })), checkedAt: null, source: 'saved' } as any;
  const pt = callPoint({ score: s, site });
  ok(!!pt.ai && /Google AI did not name them/.test(pt.ai.headline) && pt.ai.evidence.some((e) => /Rival/.test(e)), '18. the call point names the strongest missed search and who was named instead');
  ok(pt.site?.findingId === 'robots_blocks_oai-searchbot', '18. … and the strongest website issue (HIGH first)');
  const htmlMixed = renderToStaticMarkup(createElement(ProspectAuditView, { ...viewProps(site), score: s, point: pt }));
  ok(/data-testid="pa-engine-chatgpt"/.test(htmlMixed) && /data-testid="pa-engine-gemini"/.test(htmlMixed) && /checkatrade\.com/.test(htmlMixed) && (htmlMixed.match(/data-testid="pa-ai-result"/g) ?? []).length === 6, '18. the view shows both engines, all six results and the cited sources');
  ok(/Being cited .* is not the same as being named/.test(htmlMixed), '18. cited ≠ named is said');
  ok(strongestFinding({ ...site.audit, findings: site.audit.findings.filter((f: any) => f.category === 'structured_data' || f.severity === 'good') }) === null, '18. structured data (tested negative as a lever) is never the "strongest point"');
}

/* ═══ 19. NO LEAD STATUS CHANGES · 20. OWNERSHIP ═══════════════════════════════════════════════ */
console.log('\n── 19/20. no lead status change · ownership isolation ──');
{
  ok(!writesTo.some((w) => w.startsWith('outreach_leads')), `19. the crawl engine never writes outreach_leads (writes seen: ${[...new Set(writesTo.map((w) => w.split(':')[0]))].join(', ')})`);
  const newCode = ['src/lib/siteAudit.ts', 'src/lib/prospectCrawl.ts', 'src/lib/prospectAuditView.ts', 'src/components/ProspectAuditDialog.tsx', 'src/components/ProspectAuditView.tsx'].map(read).join('\n');
  ok(!/\.(update|insert|upsert|delete)\(|\.rpc\(|lead_set_|planSalesPatch|status:\s*['"]not_interested/.test(newCode), '19. the new view and audit code make no writes at all');
  const job = read('supabase/functions/_shared/crawl-job.ts');
  ok(/from\("outreach_leads"\)\.select\("business_name, derived_town(?:, category, search_keyword, services_included)?"\)/.test(job) && !/from\("outreach_leads"\)\.(update|upsert|insert)/.test(job), '19. finalize only READS the lead (name + town for the clarity checks)');
  const cc = read('supabase/functions/crawl-check/index.ts');
  const salesAt = cc.indexOf('if (role === "sales")'), reuseAt = cc.indexOf('prospectCrawlReuse(savedRow');
  ok(salesAt > 0 && salesAt < reuseAt, '20. the sales lead check (works the lead, not a client, own website only) runs before the new reuse / cap code');
  ok(salesCrawlIdsRefusal({ leadId: 'a', jobId: 'j', jobLeadId: 'b', runId: null }) === 'job_not_your_lead', '20. another lead\'s job id is still refused');
  const dialog = read('src/components/ProspectAuditDialog.tsx');
  ok(/readLeadRow</.test(dialog) && /\.eq\('lead_id', leadId\)/.test(dialog) && /crawlJobStatus\(\{ lead_id: leadId \}\)/.test(dialog), '20. the view reads one lead through the role-aware reader and RLS, and its job status through crawl-check\'s lead check');
}

/* ═══ CAREFUL WORDING ═══════════════════════════════════════════════════════════════════════════ */
console.log('\n── wording ──');
{
  const src = read('src/lib/siteAudit.ts') + read('src/lib/prospectAuditView.ts') + read('src/components/ProspectAuditView.tsx');
  ok(!/llms\.txt/i.test(src.replace(/llms\.txt is never recommended/g, '')), 'llms.txt is never recommended');
  ok(!/\/100|score of|SEO score|out of 100/i.test(src.replace(/HookScore|scoreHookRun|score\b(?!s? of)/g, '')), 'no numerical SEO / website score');
  ok(!/will (improve|rank|get you named)|guarantee(s|d)? (you|that)|because of this,? AI|is why (AI|ChatGPT|Gemini)/i.test(src), 'no promise and no claim that an issue causes AI visibility');
  const a = buildSiteAudit(baseInput([page('/', { noindex: true, robots: 'noindex', viewport: false, family: 'homepage', description: '' })], { robotsTxt: 'User-agent: *\nDisallow: /', sitemapsRead: 0, duplicates: { clusterSize: 12, sampleSize: 4, similarityPct: 94 } }));
  const problems = a.findings.flatMap((f) => salesStyleProblems(`${f.title}. ${f.saw} ${f.meaning}`));
  ok(problems.length === 0, `finding text passes the sales style check (${problems.slice(0, 2).join(' | ')})`);
  ok(!statesAll('Plumbers in Bathurst', 'Bath') && statesAll('Plumbers in Bath and Bristol', 'Bath'), 'name / town matching is whole-word');
}

console.log(`\n${failures ? `FAILED: ${failures}` : 'ALL PASS'}`);
process.exit(failures ? 1 : 0);
