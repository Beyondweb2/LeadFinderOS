/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE AGENCY CHECK'S CRAWL (2026-10-01): a small, sitemap-guided sample of one website, then the pure
   verdict (src/lib/agencyDetect.ts). No AI, nothing paid. Runs in the edge function (agency-check) and,
   unchanged, under Node for the measurement script — it uses only fetch.

   Per domain, at most AGENCY_MAX_REQUESTS requests:
     1 homepage → 1 robots.txt (for its Sitemap: lines) → up to 2 sitemap reads (the declared or standard
     one, and one child of a sitemap index) → up to AGENCY_MAX_PAGES sample pages (contact, about, a
     service page, then other shallow pages), AGENCY_PAGE_CONCURRENCY at a time.
   Every fetch has its own timeout and the whole check a hard budget; anything that cannot finish ends
   as "unknown" with the reason. Bodies are capped (readCapped); private / loopback addresses refused.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { isPublicHttpUrl, readCapped } from "./safe-fetch.ts";
import { registrableDomain } from "../../../src/lib/siteEvidence.ts";
import { classifyAgency, pageLinks, pageProblem, selectSamplePages, sitemapLocs, type AgencyPage, type AgencyVerdict } from "../../../src/lib/agencyDetect.ts";

/* v2 (Paul, 2026-10-02: "accuracy over shaving a few seconds"): one more sample page (a credits / legal
   page, read for "This website was designed by …"), a slower site given longer to answer, and the
   www / bare-domain twin tried once when the homepage cannot be reached at all. Still bounded. */
export const AGENCY_MAX_REQUESTS = 13;
export const AGENCY_MAX_PAGES = 7;
export const AGENCY_PAGE_CONCURRENCY = 4;
export const AGENCY_FETCH_TIMEOUT_MS = 8_000;
/** The homepage decides everything after it, so a slow one gets longer before it reads Unknown. */
export const AGENCY_HOME_TIMEOUT_MS = 10_000;
export const AGENCY_TOTAL_BUDGET_MS = 35_000;
/* ⛔ AN HONEST CRAWLER NAME (Paul, 2026-10-01): an automated check never presents itself as a person's
   browser. A site that refuses it is "Unknown — the site blocked the check" (measured: ~3 in 50 refuse a named
   bot); that small loss is accepted and preferred to disguising the crawler. */
/* v2 (2026-10-02): the "Mozilla/5.0 (compatible; …)" wrapper is gone. Measured on 60 lead-book sites: 9 UK
   hosts answered 403 to it (a bad-bot rule that matches bots borrowing "Mozilla"), and 8 of those 9 accept
   the bare honest name. Still plainly a named crawler with a contact link — never a browser identity. */
export const AGENCY_CRAWLER_UA = "LeadFinderOS-SiteCheck/1.0 (+https://findable.live)";
const UA = AGENCY_CRAWLER_UA;

export interface AgencyCrawlStats { requests: number; durationMs: number; pagesFetched: number; sitemap: boolean }
export interface AgencyCrawlResult { verdict: AgencyVerdict; stats: AgencyCrawlStats; finalUrl: string | null }

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export async function crawlForAgency(siteUrl: string, fetchImpl: Fetcher = fetch): Promise<AgencyCrawlResult> {
  const started = Date.now();
  let requests = 0;
  let lastError: "timeout" | "unreachable" | null = null;
  const deadline = started + AGENCY_TOTAL_BUDGET_MS;
  const get = async (url: string, accept = "text/html,application/xhtml+xml", timeoutMs = AGENCY_FETCH_TIMEOUT_MS): Promise<{ status: number; body: string; url: string; type: string } | null> => {
    if (requests >= AGENCY_MAX_REQUESTS || Date.now() >= deadline || !isPublicHttpUrl(url)) return null;
    requests += 1;
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), Math.min(timeoutMs, Math.max(500, deadline - Date.now())));
    try {
      const res = await fetchImpl(url, { redirect: "follow", signal: ctl.signal, headers: { "User-Agent": UA, Accept: accept, "Accept-Language": "en-GB,en;q=0.8" } });
      const type = res.headers.get("content-type") ?? "";
      const body = await readCapped(res);
      return { status: res.status, body, url: res.url || url, type };
    } catch (e) {
      lastError = (e as { name?: string })?.name === "AbortError" ? "timeout" : "unreachable";
      return null;
    } finally { clearTimeout(t); }
  };
  const stats = (pagesFetched: number, sitemap: boolean): AgencyCrawlStats => ({ requests, durationMs: Date.now() - started, pagesFetched, sitemap });

  /* The homepage, always: a Places link can be a deep page with tracking codes (one 404'd that way). */
  const given = /^https?:\/\//i.test(siteUrl) ? siteUrl : `https://${siteUrl}`;
  let start = given;
  try { start = `${new URL(given).origin}/`; } catch { /* keep */ }
  let home = await get(start, undefined, AGENCY_HOME_TIMEOUT_MS);
  /* One retry for a timeout or a server error: a brief hiccup should not read as Unknown for a day. */
  if ((!home || home.status >= 500) && Date.now() < deadline - AGENCY_FETCH_TIMEOUT_MS) home = (await get(start, undefined, AGENCY_HOME_TIMEOUT_MS)) ?? home;
  /* v2: no answer at all (never a 4xx — that is an answer) → the same site's www / bare-domain twin, once.
     Many small sites answer on only one of the two; the redirect check below still applies. */
  if (!home && Date.now() < deadline - AGENCY_FETCH_TIMEOUT_MS) {
    try {
      const u = new URL(start);
      u.hostname = u.hostname.startsWith("www.") ? u.hostname.slice(4) : `www.${u.hostname}`;
      const twin = await get(u.href, undefined, AGENCY_HOME_TIMEOUT_MS);
      if (twin) { home = twin; start = u.href; }
    } catch { /* keep */ }
  }
  if (!home) return { verdict: classifyAgency([], start, lastError === "timeout" ? "The site did not answer in time" : "The site could not be reached (it may be offline)"), stats: stats(0, false), finalUrl: null };
  if (!/html/i.test(home.type) && home.body.trim().slice(0, 1) !== "<") return { verdict: classifyAgency([], start, "The address is not a web page"), stats: stats(0, false), finalUrl: home.url };
  /* A redirect to a DIFFERENT domain (an expired domain's sale page, a move) is not this business's site. */
  const fromDom = registrableDomain(start); const toDom = registrableDomain(home.url);
  if (fromDom && toDom && fromDom !== toDom) return { verdict: classifyAgency([], start, "The address now goes to a different website (the domain may have expired or moved)"), stats: stats(0, false), finalUrl: home.url };
  const problem = pageProblem(home.body, home.status);
  if (problem) return { verdict: classifyAgency([], start, problem), stats: stats(0, false), finalUrl: home.url };
  const base = home.url;
  const pages: AgencyPage[] = [{ url: base, html: home.body }];

  // The sitemap: robots.txt's declaration, else the standard place. A sitemap index → its first page-sitemap.
  let origin = base;
  try { origin = new URL(base).origin; } catch { /* keep */ }
  const robots = await get(`${origin}/robots.txt`, "text/plain");
  const declared = robots && robots.status < 400 ? [...robots.body.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]) : [];
  let locs: string[] = [];
  let sitemapRead = false;
  const first = declared[0] ?? `${origin}/sitemap.xml`;
  const sm = await get(first, "application/xml,text/xml");
  if (sm && sm.status < 400 && /<(urlset|sitemapindex)\b/i.test(sm.body)) {
    sitemapRead = true;
    const l = sitemapLocs(sm.body);
    locs = l.pages;
    if (!locs.length && l.children.length) {
      const child = l.children.find((c) => /page|post_type-page|pages/i.test(c)) ?? l.children[0];
      const sm2 = await get(child, "application/xml,text/xml");
      if (sm2 && sm2.status < 400) locs = sitemapLocs(sm2.body).pages;
    }
  }
  const sample = selectSamplePages(base, [...locs, ...pageLinks(home.body, base)], Math.min(AGENCY_MAX_PAGES, AGENCY_MAX_REQUESTS - requests));

  // The sample, a few at a time; a page that fails is simply not counted.
  for (let i = 0; i < sample.length; i += AGENCY_PAGE_CONCURRENCY) {
    const batch = await Promise.all(sample.slice(i, i + AGENCY_PAGE_CONCURRENCY).map((u) => get(u)));
    for (const r of batch) if (r && r.status < 400 && /html/i.test(r.type) && !pageProblem(r.body, r.status)) pages.push({ url: r.url, html: r.body });
    if (Date.now() >= deadline || requests >= AGENCY_MAX_REQUESTS) break;
  }
  return { verdict: classifyAgency(pages, base), stats: stats(pages.length, sitemapRead), finalUrl: base };
}
