/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SALES INSIGHTS FROM THE INLINE (STANDARD) CRAWL (2026-10-07, branch improve/site-crawl-sales-insights).

   The standard crawl (supabase/functions/crawl-check, the one a salesperson's "Check before calling" and
   every audit finalise run) fetches the homepage and up to MAX_CRAWL_PAGES sampled pages and holds their
   HTML in memory. This turns those same bytes into the same SalesInsights the background (prospect) crawl
   produces — through the SAME page processor (fullCrawl.processPage) and the SAME analysis
   (salesInsights.buildSalesInsights), so the two crawls cannot disagree about a site. No extra request.

   ⛔ A SAMPLE IS NOT THE SITE. `capped` is true whenever the sitemap/links knew of more pages than were
   sampled, so every "not found" is said of the pages read, and a service whose page was not sampled is
   `unknown`, never "no page".
   IMPORTED BY EDGE FUNCTIONS: relative imports with an explicit .ts only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { leanHtml, processPage } from './fullCrawl.ts';
import type { SiteAuditPage } from './siteAudit.ts';
import { buildSalesInsights, type InsightLead, type SalesInsights } from './salesInsights.ts';

export interface InlineFetchedPage { url: string; finalUrl: string; status: number; xRobotsTag: string | null; html: string }

export function insightsFromFetchedPages(input: {
  servedUrl: string;
  home: InlineFetchedPage;
  samples: InlineFetchedPage[];
  /** Every same-site address the sitemap and the homepage's links named (read or not). */
  knownUrls: readonly string[];
  lead?: InsightLead | null;
}): SalesInsights {
  const rows: SiteAuditPage[] = [];
  let nav: Array<{ label: string; url: string }> = [];
  const take = (p: InlineFetchedPage, isHome: boolean) => {
    if (!p.html) return;
    const ev = processPage({ url: p.url, finalUrl: p.finalUrl || p.url, status: p.status, xRobotsTag: p.xRobotsTag, html: leanHtml(p.html), isHome }, input.servedUrl);
    if (isHome) nav = ev.nav ?? [];
    rows.push({ url: p.url, finalUrl: p.finalUrl || p.url, status: 'done', httpStatus: p.status, d: ev.d, b: ev.b, l: ev.l ?? [] });
  };
  take(input.home, true);
  const seen = new Set(rows.map((r) => r.url));
  for (const s of input.samples) { if (!seen.has(s.url)) { seen.add(s.url); take(s, false); } }
  const norm = (u: string) => u.replace(/\/+$/, '').toLowerCase();
  const readSet = new Set(rows.map((r) => norm(r.finalUrl || r.url)));
  const unread = input.knownUrls.filter((u) => !readSet.has(norm(u)));
  return buildSalesInsights({ servedUrl: input.servedUrl, pages: rows, nav, knownUrls: input.knownUrls, lead: input.lead ?? null, capped: unread.length > 0 });
}
