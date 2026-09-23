// crawl-check — a FREE crawlability check for a prospect's site, run before messaging them so the
// outreach can name their actual problem (Paul, 2026-09-16). NOT the Apify SEO scanner (5.6p, off
// for outreach): this costs nothing but a handful of fetches.
//
// It fetches the homepage as each of the four AI SEARCH crawlers (no JS), then robots.txt and the
// sitemap(s), clusters the sitemap URLs to find a templated location-page set, samples a BOUNDED
// number of pages, and hands the raw strings to the pure analysers — src/lib/crawlCheck.ts for the
// paste-ready verdict and src/lib/siteEvidence.ts for the Phase 1 sales findings. The fetch count is
// bounded regardless of site size: a 300-page site costs at most CRAWL_FETCH_BUDGET, never 300.
//
// ⚠️ THE HEADER USED TO SAY "fetches the homepage AS GPTBot, robots.txt and the sitemap" AND BOTH
// HALVES WERE FALSE (corrected 2026-09-22). GPTBot is a TRAINING crawler and is deliberately never
// tested (see SEARCH_CRAWLERS below — testing it was producing false findings, and that is the whole
// reason the search/training split exists); robots.txt was genuinely removed on 2026-09-16 and only
// came back with this phase, for SITEMAP DISCOVERY, never as evidence of a crawler block. A stale
// comment is a load-bearing bug (CLAUDE.md §4) and this one had already been quoted back as fact.
//
// Auth: operator-only (verify_jwt=false + in-handler admin check), the search-leads pattern. Input:
// { url?, lead_id?, town?, deep? } — lead_id resolves the website + town from the lead; `deep`
// governs the EVIDENCE half only (see DEEP CRAWL below) and defaults to true.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  detectClientRendered, hasH1, hasJsonLd, wordCount, looksChallenged,
  extractSitemapLocs, clusterUrls, pageSimilarity, buildVerdict, selectCrawlUrls, crawlPageKind,
  DUP_MIN_CLUSTER, DUP_SIMILARITY, THIN_WORDS, CRAWL_CHECK_VERSION, type CrawlSignals,
} from "../../../src/lib/crawlCheck.ts";
import { extractSiteInfo, SITE_INFO_VERSION, type SiteInfo } from "../../../src/lib/siteInfo.ts";
import {
  buildSiteEvidence, SITE_EVIDENCE_VERSION, MAX_SITEMAP_LOCS,
  type EvidencePage, type SiteEvidence,
} from "../../../src/lib/siteEvidence.ts";
import {
  resolveCrawlMode, profileFor, cleanRequestSource, toServedUrl, isPageUrl, internalPageLinks,
  orderSitemapChildren, selectFullCrawlUrls, leanHtml, buildFullCrawlEvidence, mayReplaceLeadCrawl,
  type FullCrawlEvidence, type FullCrawlInputPage,
} from "../../../src/lib/fullCrawl.ts";
import { CRAWL_FRESH_MS } from "../../../src/lib/crawlCheck.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/* ⛔ THE SEARCH CRAWLERS — the ones that fetch a page when a person ASKS an AI a question, and so
   decide whether a business gets named (Paul, 2026-09-16). We fetch as each and record which are
   BLOCKED. We deliberately do NOT test GPTBot / ClaudeBot / CCBot — those are TRAINING crawlers,
   blocking them is legitimate and common, and testing GPTBot was producing false findings. */
const SEARCH_CRAWLERS: ReadonlyArray<{ label: string; ua: string }> = [
  { label: "OAI-SearchBot", ua: "Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)" },
  { label: "ChatGPT-User", ua: "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot" },
  { label: "Claude-User", ua: "Mozilla/5.0 (compatible; Claude-User/1.0; +https://www.anthropic.com/claude-user)" },
  { label: "PerplexityBot", ua: "Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)" },
];
/* ⛔ THE CRAWL IS BOUNDED THREE WAYS AND ALL THREE ARE LOAD-BEARING — pages, fetches, milliseconds.
   The numbers live in src/lib/fullCrawl.ts as TWO PROFILES (2026-09-23):
     · STANDARD_CRAWL — the budget this function has always had (12 pages, 22 fetches, 35 s, 4
       sitemaps). Every AUTOMATED caller gets it: the audit-finalise crawl across the whole book and
       the report's background populate. Unchanged by the full-crawl work.
     · FULL_CRAWL — a user-initiated "Crawl site" / "Re-crawl site" button, any screen. Operator-only
       and opt-in (`mode: "full"`); an internal caller cannot ask for it.
   Every fetch past the deadline is skipped rather than queued, in both profiles. */
/** ⛔ BYTES READ PER RESPONSE. crawl-check had NO cap at all — a site serving a 40MB HTML file (or a
 *  misconfigured one streaming forever) could take the whole edge runtime down with it. The body is
 *  read incrementally and the stream cancelled at the cap; a truncated page still answers every
 *  question we ask of it, because everything we read lives in the head or the first screenfuls. */
const MAX_BODY_BYTES = 1_000_000;

interface Fetched {
  /** The URL we asked for. */
  url: string;
  /** Where we ended up AFTER redirects — the thing the old code threw away, and the reason a site
   *  serving apex-to-www (or one domain to another) was invisible to every domain comparison. */
  finalUrl: string;
  ok: boolean;
  status: number;
  /** The X-Robots-Tag response header verbatim, or null. A noindex can live here and nowhere in the
   *  markup, so a check that only read the meta tag would miss it entirely. */
  xRobotsTag: string | null;
  html: string;
  blocked: boolean;
  responded: boolean;
}

/** Read a response body up to MAX_BODY_BYTES, then stop. Falls back to res.text() when the body is
 *  not a readable stream (which some runtimes do for empty responses). Never throws. */
async function readCapped(res: Response): Promise<string> {
  if (!res.body) return await res.text().catch(() => "");
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < MAX_BODY_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) { chunks.push(value); total += value.byteLength; }
    }
  } catch { /* a broken stream yields what we already have */ }
  finally { try { await reader.cancel(); } catch { /* already closed */ } }
  const joined = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { joined.set(c.subarray(0, Math.max(0, Math.min(c.byteLength, total - at))), at); at += c.byteLength; }
  try { return new TextDecoder("utf-8", { fatal: false }).decode(joined); } catch { return ""; }
}

/** One GET with a given crawler UA and a hard timeout. Never throws. `blocked` = the site refused
 *  this crawler: a 4xx/5xx, a `cf-mitigated: challenge` header, or a Cloudflare/challenge body even
 *  on a 200. `responded` = we got ANY HTTP status (distinguishes a block from the site being down). */
async function get(url: string, ua: string, timeoutMs: number): Promise<Fetched> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": ua, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
      redirect: "follow",
      signal: controller.signal,
    });
    const html = await readCapped(res).catch(() => "");
    const cfMitigated = (res.headers.get("cf-mitigated") || "").toLowerCase() === "challenge";
    const blocked = res.status >= 400 || cfMitigated || looksChallenged(html);
    return {
      url,
      finalUrl: res.url && /^https?:\/\//i.test(res.url) ? res.url : url,
      ok: res.ok && !blocked,
      status: res.status,
      xRobotsTag: res.headers.get("x-robots-tag"),
      html,
      blocked,
      responded: true,
    };
  } catch {
    return { url, finalUrl: url, ok: false, status: 0, xRobotsTag: null, html: "", blocked: false, responded: false };
  } finally {
    clearTimeout(t);
  }
}

/** Run `fn` over `items` at most `limit` at a time, preserving input order in the result. Replaces a
 *  bare Promise.all over the sample set: with the page budget at 12 that was twelve simultaneous
 *  requests at one small host, which is neither polite nor necessary. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** `Sitemap:` declarations in a robots.txt body. This is the ONLY thing robots.txt is read for —
 *  never as evidence that a crawler is or is not blocked (a site can "Allow" a crawler there and
 *  still refuse it at the edge; only the actual fetch is evidence, Paul 2026-09-16). */
function sitemapsFromRobots(body: string): string[] {
  const out: string[] = [];
  const re = /^\s*sitemap\s*:\s*(\S+)\s*$/gim;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body || "")) !== null) {
    if (/^https?:\/\//i.test(m[1])) out.push(m[1]);
  }
  return [...new Set(out)];
}

/** The origin of the served address, falling back to the requested one when it will not parse. */
function servedOriginOf(servedUrl: string, fallback: string): string {
  try { return new URL(servedUrl).origin; } catch { return fallback; }
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const started = Date.now();
  try {
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    /* Two callers: an OPERATOR (their own admin JWT — the button and the paste-URL box) or an
       INTERNAL job (render-audit-report's background populate, CRON_SECRET + x-internal-job). The
       blank-secret guard means an unset CRON_SECRET can never be matched by a blank header. */
    let userId: string | null = null;
    const internal = req.headers.get("x-internal-job") === "1"
      && (req.headers.get("x-cron-secret") || "") === (Deno.env.get("CRON_SECRET") || " __unset__");
    if (!internal) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) return json({ ok: false, error: "Auth required" }, 401);
      const { data: claims, error: claimsErr } = await service.auth.getClaims(authHeader.replace("Bearer ", ""));
      userId = (claims?.claims?.sub as string | undefined) ?? null;
      if (claimsErr || !userId) return json({ ok: false, error: "Invalid token" }, 401);
      const { data: adminRole } = await service.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
      if (!adminRole) return json({ ok: false, error: "Not authorised" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    let rawUrl: string = (body?.url ?? "").toString().trim();
    let town: string = (body?.town ?? "").toString().trim();
    const leadId: string | null = body?.lead_id ?? null;
    const auditId: string | null = typeof body?.audit_id === "string" ? body.audit_id.trim() : null;
    const runId: string | null = typeof body?.run_id === "string" ? body.run_id.trim() : null;
    /* ⛔ THE DEEP-CRAWL FLAG, AND IT DEFAULTS TO TRUE ON PURPOSE (2026-09-22).
       It governs the EVIDENCE half only — the cheap crawl (fault signals + site info) runs for every
       caller either way, because that is what Paul reads before a conversation and it costs nothing.
       The caller that says `deep: false` is process-ai-audit-queue, for a HOOK audit that did not
       find a visibility gap: a lead named in every question is auto-marked not interested in the
       same block, so paying the extra fetches to build a sales argument for somebody we will not
       contact is waste.
       🔴 DEFAULTING TO TRUE IS THE FAIL-SAFE DIRECTION AND IT IS THE POINT. An absent flag means
       "an ordinary audit" — a paid baseline, a remeasure, a free check, the operator's own button —
       and every one of those keeps the behaviour it has always had. If this defaulted to false, a
       caller that forgot to pass it, or a shape change upstream, would silently switch the evidence
       off for the whole book and nothing would say so for a month (CLAUDE.md §4: an absent value
       must never fall through as a real one, and on a spending path absent means "do not" — but this
       is not a spending path, it is a fetch path, and the absent case here is the ordinary one). */
    const deep: boolean = body?.deep !== false;
    /* ⛔ THE PROFILE. FULL only when an OPERATOR asks for exactly `mode: "full"` (every manual Crawl
       site / Re-crawl site button does); every internal caller, and every absent or unknown value,
       is STANDARD — the budget this function always had. See src/lib/fullCrawl.ts. */
    const mode = resolveCrawlMode(body?.mode, !internal);
    const profile = profileFor(mode);
    const requestedFrom = mode === "full" ? cleanRequestSource(body?.requested_from) : null;

    // lead_id → the lead's website + town (search_location, then address).
    if (leadId && !rawUrl) {
      const { data: lead } = await service
        .from("outreach_leads").select("website, search_location, address").eq("id", leadId).maybeSingle();
      rawUrl = (lead?.website ?? "").toString().trim();
      if (!town) town = (lead?.search_location ?? lead?.address ?? "").toString().trim();
    }
    // Standalone/manual audits have no lead row; use the audit snapshot directly.
    if (auditId && !rawUrl) {
      const { data: audit } = await service
        .from("ai_audits").select("website, location_text").eq("id", auditId).maybeSingle();
      rawUrl = (audit?.website ?? "").toString().trim();
      if (!town) town = (audit?.location_text ?? "").toString().trim();
    }
    if (!rawUrl) return json({ ok: false, error: "No website on this lead — nothing to check." }, 400);

    // Normalise to an origin we can build paths against.
    let origin = "";
    let homeUrl = "";
    try {
      const u = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
      origin = u.origin;
      homeUrl = u.href;
    } catch {
      return json({ ok: false, error: `That doesn't look like a website: ${rawUrl}` }, 400);
    }

    /* THE BUDGET. Every fetch in this handler goes through `budgeted`, so the ceilings hold however
       the branches below are reordered later. A refused fetch returns the same never-throws shape a
       failed one does, so nothing downstream needs a second code path for "we ran out". */
    let fetchesUsed = 0;
    let hitFetchBudget = false, hitDeadline = false;
    const outOfBudget = () => {
      if (fetchesUsed >= profile.fetchBudget) { hitFetchBudget = true; return true; }
      if ((Date.now() - started) >= profile.deadlineMs) { hitDeadline = true; return true; }
      return false;
    };
    const budgeted = async (url: string, ua: string, samplePage = false): Promise<Fetched> => {
      if (outOfBudget()) return { url, finalUrl: url, ok: false, status: 0, xRobotsTag: null, html: "", blocked: false, responded: false };
      fetchesUsed++;
      const r = await get(url, ua, profile.fetchTimeoutMs);
      /* FULL mode keeps only the lean SAMPLE page (scripts/styles/SVG stripped, JSON-LD kept): 60 raw
         Wix pages would be ~40 MB held at once. The homepage probes stay raw in both modes, because
         the client-rendered check reads the scripts. STANDARD keeps every byte exactly as before. */
      return mode === "full" && samplePage && r.html ? { ...r, html: leanHtml(r.html) } : r;
    };

    // Probe the homepage AS EACH SEARCH CRAWLER (parallel): which are blocked, and which lets us read
    // the content. robots.txt is NOT consulted for this — a site can "Allow" a crawler there and
    // still block it at the edge; only the actual fetch is evidence (Paul, 2026-09-16).
    const probes = await Promise.all(SEARCH_CRAWLERS.map((c) => budgeted(homeUrl, c.ua).then((r) => ({ c, r }))));
    const searchBlocked = probes.filter((p) => p.r.blocked).map((p) => p.c.label);
    const respondedAny = probes.some((p) => p.r.responded);
    const readableProbe = probes.find((p) => p.r.ok && p.r.html.trim().length > 0) ?? null;
    const readableUa = readableProbe?.c.ua ?? SEARCH_CRAWLERS[0].ua;
    const home = readableProbe?.r ?? null;

    // Content signals ONLY when a search crawler actually got the page — never diagnose "client-
    // rendered" / "thin" off a block page. Sitemap + samples fetched as the readable crawler.
    let duplicates: CrawlSignals["duplicates"] = null;
    let thinPages = 0;
    let cr: CrawlSignals["clientRendered"] = null;
    let sampleCount = 0;
    let discoveryFetches = 0;
    const checkedPages: Array<{ url: string; kind: ReturnType<typeof crawlPageKind>; words: number; hasH1: boolean; readable: boolean }> = [];
    const thinPageUrls: string[] = [];
    /* Carried out of the block below so the SITE-INFO extraction (services from titles, towns from
       the cluster) can read the same sampled pages and cluster the fault analysis already fetched —
       one crawl, both sections, no extra fetches. */
    let clusterUrlsForInfo: string[] = [];
    const samplePagesForInfo: Array<{ url: string; html: string }> = [];
    /* ⛔ THE RAW SITEMAP URLS, KEPT BEFORE THE SAME-ORIGIN FILTER. The line below used to drop every
       off-origin <loc> on its way to picking pages to sample — and the dropped ones ARE the finding.
       That is precisely how a sitemap listing mclocksmiths.co.uk on a site served from
       mc-locksmiths.com passed through this function in silence. The filtered pool still decides what
       we FETCH; this list decides what we can SAY. */
    const rawSitemapLocs: string[] = [];
    const sitemapDocsRead: string[] = [];
    /* Every response the crawl made, with its final URL, status, X-Robots-Tag and body — the input to
       the evidence analyser. Kept for the homepage too, because a noindexed homepage is the single
       most important instance of that finding. */
    const evidencePages: EvidencePage[] = [];
    /* FULL-mode carriers, filled inside the block below. servedUrl starts as the requested address
       and becomes the homepage's final URL once it has been read. */
    let servedUrl = homeUrl;
    let robotsBody: string | null = null;
    let discoveredAll: string[] = [];
    let pagesQueuedCount = 0;
    const fullPages: FullCrawlInputPage[] = [];
    if (home && home.html) {
      cr = detectClientRendered(home.html);
      const homeWords = wordCount(home.html);
      checkedPages.push({ url: home.url, kind: 'other', words: homeWords, hasH1: hasH1(home.html), readable: true });
      evidencePages.push({
        requestedUrl: home.url, finalUrl: home.finalUrl, status: home.status,
        xRobotsTag: home.xRobotsTag, html: home.html, isHome: true,
      });

      /* ⛔ THE SERVED ADDRESS, NOT THE ONE WE WERE HANDED (2026-09-23). Every same-site decision
         below is made against where the homepage ENDED UP after redirects, with a leading `www.`
         ignored. The old code compared against the requested origin, so a site redirecting apex →
         www (BS4 Electrical: every Wix site) had every sitemap URL and every link discarded as
         "another site" and the crawl read the homepage alone — in BOTH profiles. */
      servedUrl = home.finalUrl || homeUrl;
      const servedOrigin = (() => { try { return new URL(servedUrl).origin; } catch { return origin; } })();

      /* SITEMAP DISCOVERY — robots.txt first, then the conventional path, then index children.
         ⚠️ robots.txt is fetched for its `Sitemap:` lines (and, in FULL mode, recorded as evidence of
         what it says) — NEVER as evidence of a crawler block. Bounded by the profile's
         sitemapFetches so an index of forty children cannot turn into forty requests; a site's own
         PAGES sitemap is read before its generated collections (orderSitemapChildren). */
      const robots = await budgeted(`${servedOrigin}/robots.txt`, readableUa);
      discoveryFetches++;
      robotsBody = robots.ok && robots.html && !/<html/i.test(robots.html.slice(0, 400)) ? robots.html : null;
      const declared = robotsBody ? sitemapsFromRobots(robotsBody) : [];
      const queue: string[] = [...declared.slice(0, profile.sitemapFetches), `${servedOrigin}/sitemap.xml`];
      const tried = new Set<string>();
      let pool: string[] = [];
      let sitemapFetches = 0;
      while (queue.length && sitemapFetches < profile.sitemapFetches && !outOfBudget()) {
        const next = queue.shift()!;
        const nextKey = toServedUrl(next, servedUrl) ?? next;
        if (tried.has(nextKey)) continue;
        tried.add(nextKey);
        const doc = await budgeted(next, readableUa);
        discoveryFetches++;
        sitemapFetches++;
        if (!doc.ok || !doc.html) continue;
        sitemapDocsRead.push(doc.finalUrl || next);
        const parsed = extractSitemapLocs(doc.html);
        if (parsed.isIndex) {
          /* An INDEX's locs are sitemap files, not pages — they are never page evidence. */
          for (const child of orderSitemapChildren(parsed.locs).slice(0, profile.sitemapFetches)) queue.push(child);
          continue;
        }
        for (const loc of parsed.locs) {
          if (rawSitemapLocs.length >= MAX_SITEMAP_LOCS) break;
          rawSitemapLocs.push(loc);
        }
        pool = pool.concat(parsed.locs);
      }
      const homeLinks = internalPageLinks(home.html, servedUrl, servedUrl);
      /* The pool: sitemap pages and the homepage's own links, rewritten onto the served origin,
         same site only, pages only. Standard mode used the links only when there was no sitemap;
         that is kept for standard so its sampling does not change beyond the served-origin fix. */
      const sitemapPages = pool.map((u) => toServedUrl(u, servedUrl)).filter((u): u is string => !!u && isPageUrl(u));
      pool = [...new Set(mode === "full" || !sitemapPages.length ? [...sitemapPages, ...homeLinks] : sitemapPages)];
      const biggest = clusterUrls(pool, town)[0];
      if (biggest) clusterUrlsForInfo = biggest.urls;

      let sampleFetched: Fetched[] = [];
      if (mode === "full") {
        /* FULL: breadth-first waves. The first wave is the navigation plus one page per template
           family; each later wave adds pages linked from what was just read, until the page limit,
           the request budget or the deadline — whichever comes first — and the stats say which. */
        const discovered = new Set<string>(pool);
        const fetchedKeys = new Set<string>();
        for (let wave = 0; wave < 4 && sampleFetched.length < profile.maxPages && !outOfBudget(); wave++) {
          const next = selectFullCrawlUrls({
            homeLinks, discovered: [...discovered], homeUrl: servedUrl, town,
            limit: profile.maxPages - sampleFetched.length, exclude: fetchedKeys,
          });
          if (!next.length) break;
          const got = await mapPool(next, profile.concurrency, (u) => budgeted(u, readableUa, true));
          for (const r of got) {
            fetchedKeys.add(r.url);
            if (r.responded) sampleFetched.push(r);
            if (r.ok && r.html) for (const l of internalPageLinks(r.html, r.finalUrl || r.url, servedUrl)) discovered.add(l);
          }
        }
        discoveredAll = [...discovered];
        pagesQueuedCount = discoveredAll.length;
      } else {
        // STANDARD: one bounded page set, exactly as before (service, location, about and contact
        // pages first, then the rest, capped at the profile's page limit).
        const sampleUrls = selectCrawlUrls([...(biggest?.urls ?? []), ...pool], servedUrl, profile.maxPages);
        sampleFetched = await mapPool(sampleUrls, profile.concurrency, (u) => budgeted(u, readableUa));
        discoveredAll = pool;
        pagesQueuedCount = sampleUrls.length;
      }
      sampleCount = sampleFetched.length;
      for (const r of sampleFetched) {
        const words = r.ok && r.html ? wordCount(r.html) : 0;
        checkedPages.push({ url: r.url, kind: crawlPageKind(r.url), words, hasH1: r.ok && r.html ? hasH1(r.html) : false, readable: r.ok && !!r.html });
        if (r.ok && r.html && words < THIN_WORDS) thinPageUrls.push(r.url);
      }
      for (const r of sampleFetched) if (r.ok && r.html) samplePagesForInfo.push({ url: r.url, html: r.html });
      for (const r of sampleFetched) fullPages.push({ url: r.url, finalUrl: r.finalUrl, status: r.responded ? r.status : 0, xRobotsTag: r.xRobotsTag, html: r.ok ? r.html : "" });
      /* ⛔ ONLY PAGES THAT ACTUALLY ANSWERED become evidence. A page we never reached has no markup,
         no header and no status worth reading, and feeding it in would let "we didn't fetch it" turn
         into a finding about it — the absent-value trap, on the surface where a false finding gets
         read aloud to a prospect. */
      for (const r of sampleFetched) {
        if (!r.responded) continue;
        evidencePages.push({
          requestedUrl: r.url, finalUrl: r.finalUrl, status: r.status,
          xRobotsTag: r.xRobotsTag, html: r.ok ? r.html : "",
        });
      }
      const readableSamples = sampleFetched.filter((r) => r.ok && r.html);
      if (biggest && biggest.urls.length >= DUP_MIN_CLUSTER && readableSamples.length >= 2) {
        const clusterSamples = readableSamples.filter((r) => biggest.urls.includes(r.url));
        if (clusterSamples.length >= 2) {
          const sims: number[] = [];
          for (let i = 0; i < clusterSamples.length; i++)
            for (let j = i + 1; j < clusterSamples.length; j++)
              sims.push(pageSimilarity(clusterSamples[i].html, clusterSamples[j].html, town));
          const med = median(sims);
          if (med >= DUP_SIMILARITY) {
            duplicates = { clusterSize: biggest.urls.length, sampleSize: clusterSamples.length, similarityPct: Math.round(med * 100) };
          }
        }
      }
      thinPages = readableSamples.filter((r) => wordCount(r.html) < THIN_WORDS).length;
      if (!cr.flagged && homeWords < THIN_WORDS) { thinPages++; thinPageUrls.unshift(home.url); }
    }

    const signals: CrawlSignals = {
      homeUrl,
      fetchFailed: !respondedAny,                        // nothing answered at all → site down → section hidden
      searchBlocked,
      readableAs: readableProbe?.c.label ?? null,
      clientRendered: cr,
      missingH1: home?.html ? !hasH1(home.html) : false,
      noJsonLd: home?.html ? !hasJsonLd(home.html) : false,
      duplicates,
      thinPages,
      pagesChecked: checkedPages.length,
      checkedPages,
      thinPageUrls,
    };

    const verdict = buildVerdict(signals);
    const fetches = fetchesUsed;

    /* ── THE DEEP SALES CRAWL, PHASE 1 (2026-09-22) ───────────────────────────────────────────────
       Four findings, all read out of bytes the fetches above already hold: a sitemap listing a
       different web address, a page naming a different site as the main version of itself, business
       markup giving a different address, and a main page asking not to be listed. No extra request
       is made here — the evidence half costs the robots.txt fetch and the extra sitemap children,
       and nothing else.
       ⛔ SEPARATE KEY, SEPARATE VERSION, SEPARATE EVERYTHING. `evidence` never touches `signals`, so
       the report's fault section, the audit_followup_fault gate and every stored row keep behaving
       exactly as they did. Best-effort: an analyser that trips must not fail the crawl the operator
       asked for. */
    let evidence: SiteEvidence | null = null;
    if (deep && evidencePages.length) {
      try {
        evidence = buildSiteEvidence({
          /* The SERVED address is the homepage's FINAL url — after redirects — never the value we
             were handed. A lead row holding the old domain would otherwise make every page on the
             new one look off-domain, which is the finding inverted. */
          servedUrl: evidencePages[0]?.finalUrl || homeUrl,
          pages: evidencePages,
          sitemapLocs: rawSitemapLocs,
          sitemapUrls: sitemapDocsRead,
        });
      } catch (e) {
        console.error(`[crawl-check] evidence build failed for ${homeUrl}:`, (e as Error).message);
      }
    }

    /* SITE INFO — everything else useful in the SAME HTML, for the operator to read before a
       conversation (Paul, 2026-09-17). Extracted from the pages already fetched — no extra requests.
       ⛔ SEPARATE from `signals`: the faults gate audit_followup_fault, this never does. Only what was
       actually found; a missing field is null. When the site couldn't be read at all there is nothing
       to extract, so an empty block is stored (and the popup shows every field missing). */
    let siteInfo: SiteInfo | null = null;
    try {
      siteInfo = home?.html
        ? extractSiteInfo(home.html, { origin: servedOriginOf(servedUrl, origin), samplePages: samplePagesForInfo, clusterUrls: clusterUrlsForInfo })
        : extractSiteInfo("", { origin });
    } catch (e) {
      console.error(`[crawl-check] site-info extraction failed for ${homeUrl}:`, (e as Error).message);
    }

    const checkedAt = new Date().toISOString();

    /* ── THE FULL MANUAL CRAWL'S EVIDENCE (2026-09-23) ─────────────────────────────────────────────
       Built from the same pages every other half read; stored in its OWN column (full_evidence) so
       the Outreach table and the Inbox, which read `result` for every lead, never download it.
       Best-effort: an analyser that trips leaves the rest of the crawl intact and says so. */
    let full: FullCrawlEvidence | null = null;
    const fullWarnings: string[] = [];
    if (mode === "full") {
      try {
        const homePage: FullCrawlInputPage[] = home?.html
          ? [{ url: home.url, finalUrl: home.finalUrl, status: home.status, xRobotsTag: home.xRobotsTag, html: leanHtml(home.html), isHome: true }]
          : [];
        full = buildFullCrawlEvidence({
          requestedUrl: homeUrl, servedUrl, pages: [...homePage, ...fullPages], robotsTxt: robotsBody,
          sitemapDocs: sitemapDocsRead, sitemapLocs: rawSitemapLocs, discoveredUrls: discoveredAll, profile,
          stats: {
            urlsDiscovered: discoveredAll.length, pagesQueued: pagesQueuedCount,
            pagesFetched: fullPages.length + homePage.length,
            pagesOk: fullPages.filter((p) => p.status > 0 && p.status < 400 && p.html).length + homePage.length,
            fetchesUsed, hitPageLimit: fullPages.length >= profile.maxPages && discoveredAll.length > fullPages.length + 1,
            hitFetchBudget, hitDeadline, ms: Date.now() - started,
          },
        });
      } catch (e) {
        fullWarnings.push(`Full-crawl evidence could not be built: ${(e as Error).message}`);
        console.error(`[crawl-check] full evidence failed for ${homeUrl}:`, (e as Error).message);
      }
    }
    /* ⚠️ `evidence` / `evidenceVersion` are OMITTED ENTIRELY when nothing was built, rather than
       written as null. A row with no key is the same shape every pre-Phase-1 row already has, so
       usableSiteEvidence's "no evidence → []" path is the SAME path for an old row and for a
       deliberately shallow one — one behaviour to reason about instead of two. */
    const storedResult = {
      version: CRAWL_CHECK_VERSION, siteInfoVersion: SITE_INFO_VERSION,
      checked_at: checkedAt, url: homeUrl, town: town || null, signals, verdict, siteInfo,
      ...(evidence ? { evidence, evidenceVersion: SITE_EVIDENCE_VERSION } : {}),
    };

    /* PERSIST for the report. render-audit-report reads the LATEST row for the lead and renders the
       "What's stopping AI reading your site" section from these signals (buildFaultLines). One row
       per lead (upsert on lead_id); a URL-only check (no lead) stores nothing. Best-effort — a
       storage failure never fails the check the operator asked for. */
    /* ⛔ ONE CANONICAL ROW PER LEAD, WHICHEVER SCREEN STARTED THE CRAWL. Every entry point — Outreach,
       Inbox, lead detail, Paid Clients, Website Build — lands here with the lead id, so a crawl run
       anywhere is the crawl every screen reads. `requested_from` records the screen; it decides
       nothing.
       ⛔ AN AUTOMATED STANDARD CRAWL NEVER REPLACES A FRESH FULL ONE (mayReplaceLeadCrawl): an audit
       finalising the day after a manual Re-crawl must not swap 60 pages of evidence for 12. It still
       attaches its own result to its run below. */
    let stored: boolean | null = null;
    let preserved = false;
    if (leadId) {
      try {
        const { data: existing } = await service.from("lead_crawl_checks")
          .select("mode, created_at").eq("lead_id", leadId).maybeSingle();
        if (!mayReplaceLeadCrawl(existing as { mode?: string | null; created_at?: string | null } | null, mode, Date.now(), CRAWL_FRESH_MS)) {
          preserved = true;
          stored = false;
        } else {
          const { error: upErr } = await service.from("lead_crawl_checks").upsert({
            lead_id: leadId, url: homeUrl, user_id: userId,
            /* siteInfo is a SEPARATE key from signals — faults and reading-material never mix. */
            result: storedResult,
            created_at: checkedAt,
            mode,
            /* Explicit null on a standard crawl, so a stale full crawl's evidence is never left beside
               a newer, shallower result it no longer describes. */
            full_evidence: full,
            requested_from: requestedFrom,
          }, { onConflict: "lead_id" });
          if (upErr) throw new Error(upErr.message);
          stored = true;
        }
      } catch (e) {
        stored = false;
        console.error(`[crawl-check] persist failed for lead ${leadId}:`, (e as Error).message);
      }
    }

    // Attach the result to the exact audit run as well. This is the report contract for
    // standalone audits and prevents a different audit's lead crawl from being shown here.
    if (runId) {
      try {
        const { data: run } = await service.from("ai_audit_runs").select("results").eq("id", runId).maybeSingle();
        const current = run?.results && typeof run.results === "object" ? run.results : {};
        await service.from("ai_audit_runs").update({
          results: { ...current, crawl_check: { status: signals.fetchFailed ? "unavailable" : "complete", ...storedResult } },
        }).eq("id", runId);
      } catch (e) {
        console.error(`[crawl-check] persist failed for audit run ${runId}:`, (e as Error).message);
      }
    }

    return json({
      ok: true, url: homeUrl, served_url: servedUrl, town: town || null, verdict, signals, siteInfo, evidence, deep,
      mode, checked_at: checkedAt, fetches, ms: Date.now() - started, stored, preserved_full_crawl: preserved,
      /* The full evidence's headline only — the row holds the rest, and every screen reads the row. */
      full: full ? { completeness: full.completeness, stats: full.stats, limits: full.limits, warnings: full.warnings } : null,
      warnings: fullWarnings,
    });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message ?? "crawl-check failed" }, 500);
  }
});
