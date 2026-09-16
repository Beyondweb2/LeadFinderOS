// crawl-check — a FREE crawlability check for a prospect's site, run before messaging them so the
// outreach can name their actual problem (Paul, 2026-09-16). NOT the Apify SEO scanner (5.6p, off
// for outreach): this costs nothing but a handful of fetches.
//
// It fetches the homepage AS GPTBot (no JS), robots.txt and the sitemap, clusters the sitemap URLs
// to find a templated location-page set, samples a BOUNDED number of them, and hands the raw strings
// to the pure analyser (src/lib/crawlCheck.ts) which returns a paste-ready verdict. The fetch count
// is fixed regardless of site size — a 160-page site still costs ~11 fetches, never 160.
//
// Auth: operator-only (verify_jwt=false + in-handler admin check), the search-leads pattern. Input:
// { url?, lead_id?, town? } — lead_id resolves the website + town from the lead.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  detectClientRendered, hasH1, hasJsonLd, wordCount, parseRobotsAIBlocks,
  extractSitemapLocs, clusterUrls, pageSimilarity, buildVerdict,
  DUP_MIN_CLUSTER, DUP_SIMILARITY, THIN_WORDS, type CrawlSignals,
} from "../../../src/lib/crawlCheck.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/** As GPTBot, so we see exactly what ChatGPT's crawler sees — the whole point of the client-render
 *  check. Real openai.com/gptbot UA string. */
const GPTBOT_UA = "Mozilla/5.0 (compatible; GPTBot/1.1; +https://openai.com/gptbot)";
const FETCH_TIMEOUT_MS = 6_000;
const MAX_SAMPLE = 8;          // hard cap on templated-page fetches — the 160-page guard

interface Fetched { url: string; ok: boolean; status: number; html: string; blockedByBot: boolean }

/** One GET with the GPTBot UA and a hard timeout. Never throws — a dead site is a result, not a
 *  crash. A 403/503 (or a Cloudflare challenge body) is reported as blockedByBot: a real site we
 *  cannot read as a crawler, which is itself worth telling the prospect. */
async function get(url: string): Promise<Fetched> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": GPTBOT_UA, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
      redirect: "follow",
      signal: controller.signal,
    });
    const html = await res.text().catch(() => "");
    const blockedByBot = res.status === 403 || res.status === 503 || /just a moment|cf-browser-verification|attention required/i.test(html.slice(0, 2000));
    return { url, ok: res.ok, status: res.status, html, blockedByBot };
  } catch {
    return { url, ok: false, status: 0, html: "", blockedByBot: false };
  } finally {
    clearTimeout(t);
  }
}

/** Same-origin absolute URLs from a page's <a href> tags — the sitemap fallback. */
function internalLinks(html: string, origin: string): string[] {
  const out = new Set<string>();
  const re = /<a\b[^>]*href=["']([^"'#]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const u = new URL(m[1], origin);
      if (u.origin === origin && /^https?:$/.test(u.protocol)) out.add(u.origin + u.pathname);
    } catch { /* skip */ }
  }
  return [...out];
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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ ok: false, error: "Auth required" }, 401);
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: claims, error: claimsErr } = await service.auth.getClaims(authHeader.replace("Bearer ", ""));
    const userId = claims?.claims?.sub as string | undefined;
    if (claimsErr || !userId) return json({ ok: false, error: "Invalid token" }, 401);
    const { data: adminRole } = await service.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
    if (!adminRole) return json({ ok: false, error: "Not authorised" }, 403);

    const body = await req.json().catch(() => ({}));
    let rawUrl: string = (body?.url ?? "").toString().trim();
    let town: string = (body?.town ?? "").toString().trim();
    const leadId: string | null = body?.lead_id ?? null;

    // lead_id → the lead's website + town (search_location, then address).
    if (leadId && !rawUrl) {
      const { data: lead } = await service
        .from("outreach_leads").select("website, search_location, address").eq("id", leadId).maybeSingle();
      rawUrl = (lead?.website ?? "").toString().trim();
      if (!town) town = (lead?.search_location ?? lead?.address ?? "").toString().trim();
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

    // Round 1, in parallel: homepage, robots.txt, sitemap.xml.
    const [home, robots, sitemap] = await Promise.all([
      get(homeUrl), get(`${origin}/robots.txt`), get(`${origin}/sitemap.xml`),
    ]);

    // Sitemap → URL pool (follow ONE child if it's an index); fall back to homepage links.
    let pool: string[] = [];
    if (sitemap.ok && sitemap.html) {
      const parsed = extractSitemapLocs(sitemap.html);
      if (parsed.isIndex && parsed.locs.length) {
        const child = await get(parsed.locs[0]);
        pool = child.ok ? extractSitemapLocs(child.html).locs : [];
      } else {
        pool = parsed.locs;
      }
    }
    if (!pool.length && home.ok) pool = internalLinks(home.html, origin);
    pool = pool.filter((u) => { try { return new URL(u).origin === origin; } catch { return false; } });

    // Cluster → the biggest templated set → sample a BOUNDED number of them (never the whole site).
    const clusters = clusterUrls(pool, town);
    const biggest = clusters[0];
    let duplicates: CrawlSignals["duplicates"] = null;
    const sampleFetched: Fetched[] = [];
    if (biggest && biggest.urls.length >= 2) {
      const sampleUrls = biggest.urls.filter((u) => u !== homeUrl).slice(0, MAX_SAMPLE);
      const results = await Promise.all(sampleUrls.map(get));
      for (const r of results) if (r.ok && r.html) sampleFetched.push(r);
      if (sampleFetched.length >= 2) {
        const sims: number[] = [];
        for (let i = 0; i < sampleFetched.length; i++)
          for (let j = i + 1; j < sampleFetched.length; j++)
            sims.push(pageSimilarity(sampleFetched[i].html, sampleFetched[j].html, town));
        const med = median(sims);
        if (biggest.urls.length >= DUP_MIN_CLUSTER && med >= DUP_SIMILARITY) {
          duplicates = { clusterSize: biggest.urls.length, sampleSize: sampleFetched.length, similarityPct: Math.round(med * 100) };
        }
      }
    }

    // Thin pages: sampled service pages under the word threshold (+ the homepage if it is thin but not client-rendered).
    const cr = home.ok ? detectClientRendered(home.html) : null;
    let thinPages = sampleFetched.filter((r) => wordCount(r.html) < THIN_WORDS).length;
    if (home.ok && !cr?.flagged && wordCount(home.html) < THIN_WORDS) thinPages++;

    const signals: CrawlSignals = {
      homeUrl,
      fetchFailed: !home.ok && !home.blockedByBot,
      blockedByBot: home.blockedByBot,
      clientRendered: cr,
      missingH1: home.ok ? !hasH1(home.html) : false,
      noJsonLd: home.ok ? !hasJsonLd(home.html) : false,
      aiBlocked: robots.ok ? parseRobotsAIBlocks(robots.html) : [],
      duplicates,
      thinPages,
    };

    const verdict = buildVerdict(signals);
    const fetches = 3 + (biggest && biggest.urls.length >= 2 ? Math.min(biggest.urls.length, MAX_SAMPLE) : 0);
    return json({ ok: true, url: homeUrl, town: town || null, verdict, signals, fetches, ms: Date.now() - started });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message ?? "crawl-check failed" }, 500);
  }
});
