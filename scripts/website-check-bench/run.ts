// THE WEBSITE CHECK BENCH — runs the REAL deep crawl (supabase/functions/_shared/crawl-job.ts, unchanged) over the test set
// and prints what the client report would say about each site (docs/WEBSITE_CHECK_ACCURACY.md).
//
//   node --import tsx scripts/website-check-bench/run.ts --record            fetch every site once, save the answers
//   node --import tsx scripts/website-check-bench/run.ts                     replay the saved answers (no site contacted)
//   … --only <slug>   one site     … --model <name>   ask a different model the service question     … --out <file>
//
// What the report shows is websiteCheckFor() over the lead's stored row: the same call render-audit-report makes.
import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { FakeDb, installCrawlRpcs } from './fake-supabase.ts';
import { BENCH_DIR, savePendingModelCalls, SiteNet, type NetMode } from './net.ts';
import { stopRenderer } from './edge-render.ts';

/* ── the Deno globals the edge code reads ─────────────────────────────────────────────────── */
const ENV: Record<string, string> = {
  SUPABASE_URL: 'https://bench.invalid', SUPABASE_SERVICE_ROLE_KEY: 'bench', CRON_SECRET: 'bench',
  CLOUDFLARE_ACCOUNT_ID: 'bench', CLOUDFLARE_BROWSER_TOKEN: 'bench', OPENAI_API_KEY: 'bench',
};
(globalThis as any).Deno = { env: { get: (k: string) => ENV[k] } };

const store = new AsyncLocalStorage<SiteNet>();
const realFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = ((input: any, init?: any) => {
  const net = store.getStore();
  if (!net) return realFetch(input, init);
  return net.fetch(input, init);
}) as typeof fetch;

const { createCrawlJob, runCrawlTick, crawlGet } = await import('../../supabase/functions/_shared/crawl-job.ts');
const { questionTownForLead } = await import('../../supabase/functions/_shared/question-town.ts');
const { detectClientRendered, hasH1, hasJsonLd, wordCount } = await import('../../src/lib/crawlCheck.ts');
const { crawlStartUrl } = await import('../../src/lib/crawlUrl.ts');
const { SITE_CHECK_READ_AS, SITE_CHECK_UA } = await import('../../src/lib/siteReadIdentity.ts');
const { PROSPECT_CRAWL_PAGE_CAP } = await import('../../src/lib/prospectCrawl.ts');
const { websiteCheckFor, issueLine } = await import('../../src/lib/websiteCheck.ts');
const { classifyFetchError } = await import('../../src/lib/siteAudit.ts');
const { classifyLeadWebsite } = await import('../../src/lib/leadWebsiteKind.ts');
const { clientReportIssues } = await import('../../src/lib/websiteCheckAccuracy.ts').catch(() => ({ clientReportIssues: null as any }));

export interface BenchSite {
  slug: string;
  lead: Record<string, any> & { id: string; website: string };
  audit_town: string | null;
  phone_cache: Record<string, any> | null;
}
export interface BenchIssue { id: string; severity: string; title: string; line: string; saw: string; pages: string[]; count: number; clientShown: boolean }
export interface BenchResult {
  slug: string; state: string; headline: string; pagesRead: number | null; capped: boolean | null;
  issues: BenchIssue[]; misses: number; ms: number; serviceReview: string | null;
}

const arg = (n: string) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };

export async function benchSite(site: BenchSite, mode: NetMode, opts: { model?: string | null } = {}): Promise<BenchResult> {
  const t0 = Date.now();
  const net = new SiteNet(site.slug, mode, { modelOverride: opts.model ?? null, realTime: !process.argv.includes('--fast') });
  return store.run(net, async () => {
    const db = new FakeDb();
    installCrawlRpcs(db);
    db.seed('outreach_leads', [{ user_id: 'bench', amount_paid: null, status: 'awaiting_reply', ...site.lead }]);
    if (site.audit_town) db.seed('ai_audits', [{ lead_id: site.lead.id, location_text: site.audit_town, created_at: '2026-11-01T00:00:00Z' }]);
    if (site.phone_cache) db.seed('phone_cache', [site.phone_cache]);
    const service = db.client();
    const website = site.lead.website;
    let row: any = null;
    const kind = classifyLeadWebsite(website);
    if (kind.source === 'own_site') {
      /* crawl-check's homepage read, once and once more after a pause, under our own name. */
      const homeUrl = crawlStartUrl(new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).href);
      let home = await crawlGet(homeUrl);
      if (!home.ok) { await new Promise((r) => setTimeout(r, mode === 'record' ? 2000 : 0)); const again = await crawlGet(homeUrl); if (again.ok || again.responded || !home.responded) home = again; }
      if (home.ok && home.body.trim()) {
        const town = await questionTownForLead(service, site.lead.id);
        const job = await createCrawlJob(service, {
          leadId: site.lead.id, userId: 'bench', requestedFrom: 'catch_up', pageCap: PROSPECT_CRAWL_PAGE_CAP,
          probe: {
            homeUrl, servedUrl: home.finalUrl || homeUrl, town: town || null, readableUa: SITE_CHECK_UA, readableAs: SITE_CHECK_READ_AS,
            searchBlocked: [], respondedAny: home.responded, clientRendered: detectClientRendered(home.body), missingH1: !hasH1(home.body),
            noJsonLd: !hasJsonLd(home.body), homeWords: wordCount(home.body), homeStatus: home.status, homeXRobots: home.xRobotsTag, homeHtml: home.body,
          },
        });
        for (let i = 0; i < 400; i++) {
          const t = await runCrawlTick(service);
          if (t.finalized || !t.jobId) break;
          // A lease is held for the tick's own length; the bench is the only worker, so it is released at once.
          db.rows('crawl_jobs').forEach((j) => { if (j.id === job.jobId) j.lease_until = null; });
        }
        row = db.rows('lead_crawl_checks').find((r) => r.lead_id === site.lead.id) ?? null;
      } else {
        const hf = { kind: classifyFetchError({ message: home.error ?? null, status: home.responded ? home.status : null, responded: home.responded }), status: home.responded ? home.status : null, detail: home.error ?? null };
        row = { lead_id: site.lead.id, mode: 'standard', created_at: new Date().toISOString(), result: { version: 99, checked_at: new Date().toISOString(), homeFetch: hf, signals: { fetchFailed: true, homeUrl, searchBlocked: [], readableAs: null } } };
      }
    }
    net.save();
    const view = websiteCheckFor(row, { website });
    const shown = clientReportIssues ? new Set(clientReportIssues([...view.serious, ...view.minor]).map((i: any) => i.id)) : null;
    const issues: BenchIssue[] = [...view.serious, ...view.minor].map((i) => ({
      id: i.id, severity: i.severity, title: i.title, line: issueLine(i), saw: i.saw, pages: i.pages ?? [], count: i.count,
      clientShown: shown ? shown.has(i.id) : true,
    }));
    const sr = row?.result?.insights?.serviceReview ?? null;
    return {
      slug: site.slug, state: view.state, headline: view.headline, pagesRead: view.summary?.pagesRead ?? null, capped: view.summary?.capped ?? null,
      issues, misses: net.misses.length, ms: Date.now() - t0, serviceReview: sr ? String(sr.kind ?? sr) : null,
    };
  });
}

export function loadSites(): BenchSite[] {
  return JSON.parse(readFileSync(path.join(BENCH_DIR, 'sites.json'), 'utf8')).sites;
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { for (;;) { const i = next++; if (i >= items.length) return; out[i] = await fn(items[i]); } }));
  return out;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('run.ts')) {
  const mode: NetMode = process.argv.includes('--record') ? 'record' : 'replay';
  const only = arg('--only');
  const model = arg('--model');
  const out = arg('--out') ?? path.join(BENCH_DIR, 'results', `${mode}-${model ?? 'current'}.json`);
  const sites = loadSites().filter((s) => !only || s.slug === only);
  const res = await pool(sites, mode === 'record' ? 4 : 8, async (s) => {
    try { const r = await benchSite(s, mode, { model }); console.log(`${s.slug}: ${r.state}, ${r.pagesRead ?? '-'} pages, ${r.issues.length} issues, ${r.misses} not recorded, ${Math.round(r.ms / 1000)} s`); return r; }
    catch (e) { console.log(`${s.slug}: FAILED ${(e as Error).stack}`); return { slug: s.slug, state: 'bench_error', headline: String((e as Error).message), pagesRead: null, capped: null, issues: [], misses: 0, ms: 0, serviceReview: null } as BenchResult; }
  });
  stopRenderer();
  const pending = savePendingModelCalls();
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(res, null, 1));
  console.log(`wrote ${out}; model calls still to fetch: ${pending}`);
  process.exit(0);
}
