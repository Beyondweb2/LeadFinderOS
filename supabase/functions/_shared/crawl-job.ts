// THE EXHAUSTIVE MANUAL CRAWL — the job engine (2026-09-23).
//
// createCrawlJob  (called by crawl-check, operator-only) → one crawl_jobs row + its seeded frontier
// runCrawlTick    (called by crawl-worker)               → drains the frontier in batches for one
//                                                          tick, persisting every URL's state
// finalizeCrawlJob                                        → when the frontier is exhausted, builds the
//                                                          summary and writes the lead's ONE
//                                                          lead_crawl_checks row
//
// ⛔ NOTHING LIVES ONLY IN MEMORY. A tick claims a LEASE on the job; if the worker dies (timeout,
// crash, deploy) the lease expires, the next tick re-queues whatever was `processing` and carries on.
// Nothing restarts from page 1. Ticks chain themselves; a one-minute cron (invoke_crawl_worker) is
// the backstop when a chain link is lost.
// ⛔ GET ONLY, PUBLIC PAGES ONLY, robots.txt `User-agent: *` respected (src/lib/crawlUrl.ts).
// ⛔ NO MODEL CALLS — deterministic extraction; the crawl costs fetches, nothing else.
import {
  extractSitemapLocs, clusterUrls, pageSimilarity, buildVerdict, crawlPageKind, THIN_WORDS,
  CRAWL_CHECK_VERSION, type CrawlSignals,
} from "../../../src/lib/crawlCheck.ts";
import { extractSiteInfo, SITE_INFO_VERSION } from "../../../src/lib/siteInfo.ts";
import { buildSiteEvidence, SITE_EVIDENCE_VERSION, MAX_SITEMAP_LOCS, type EvidencePage } from "../../../src/lib/siteEvidence.ts";
import {
  FULL_CRAWL, RUNAWAY_URL_CEILING, leanHtml, orderSitemapChildren, processPage, summariseCrawlRows,
  syntheticHtml, rawLinks, type PageEvidence, type StoredCrawlRow,
} from "../../../src/lib/fullCrawl.ts";
import { classifyCrawlUrl, classifySitemapUrl, parseRobots, type RobotsRules } from "../../../src/lib/crawlUrl.ts";
import { cleanCounts, decideFetchOutcome, frontierExhausted, type JobCounts } from "../../../src/lib/crawlJob.ts";

// deno-lint-ignore no-explicit-any
type Client = any;

export const CRAWL_UA_FALLBACK = "Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)";

export interface Fetched {
  url: string; finalUrl: string; ok: boolean; status: number; responded: boolean;
  contentType: string | null; xRobotsTag: string | null; body: string; error?: string;
}

async function readCapped(res: Response, cap: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array(await res.arrayBuffer().catch(() => new ArrayBuffer(0)));
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < cap) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) { chunks.push(value); total += value.byteLength; }
    }
  } catch { /* a broken stream yields what we have */ }
  finally { try { await reader.cancel(); } catch { /* closed */ } }
  const out = new Uint8Array(Math.min(total, cap));
  let at = 0;
  for (const c of chunks) { const n = Math.min(c.byteLength, out.length - at); if (n <= 0) break; out.set(c.subarray(0, n), at); at += n; }
  return out;
}

/** GET with a hard timeout and body cap; gzip sitemap files are decompressed. Never throws. */
export async function crawlGet(url: string, ua: string): Promise<Fetched> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FULL_CRAWL.fetchTimeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { "User-Agent": ua, "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
      redirect: "follow", signal: controller.signal,
    });
    let bytes = await readCapped(res, FULL_CRAWL.maxBodyBytes);
    if (bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
      try {
        const ds = new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")));
        bytes = await readCapped(ds, FULL_CRAWL.maxBodyBytes * 10);
      } catch { /* leave as is */ }
    }
    const body = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return {
      url, finalUrl: res.url && /^https?:\/\//i.test(res.url) ? res.url : url, ok: res.ok, status: res.status, responded: true,
      contentType: res.headers.get("content-type"), xRobotsTag: res.headers.get("x-robots-tag"), body,
    };
  } catch (e) {
    return { url, finalUrl: url, ok: false, status: 0, responded: false, contentType: null, xRobotsTag: null, body: "", error: (e as Error)?.name === "AbortError" ? "timeout" : String((e as Error)?.message ?? e).slice(0, 200) };
  } finally { clearTimeout(t); }
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) { const i = next++; if (i >= items.length) return; out[i] = await fn(items[i]); }
  }));
  return out;
}

export async function jobCounts(service: Client, jobId: string): Promise<JobCounts> {
  const { data, error } = await service.rpc("crawl_job_counts", { p_job: jobId });
  if (error) throw new Error(`crawl_job_counts: ${error.message}`);
  return cleanCounts(data);
}

interface NewRow { url: string; kind: "page" | "sitemap"; source: string; depth: number; status?: string; skip_reason?: string | null; http_status?: number | null; final_url?: string | null; evidence?: unknown; processed_at?: string | null }

/** Insert discovered URLs; duplicates (job_id, url) are ignored — the table IS the dedupe. The
 *  runaway ceiling is applied here and anything past it is counted on the job, never lost silently. */
async function enqueue(service: Client, jobId: string, rows: NewRow[], counts: { total: number }): Promise<number> {
  const unique = new Map<string, NewRow>();
  for (const r of rows) if (!unique.has(r.url)) unique.set(r.url, r);
  let list = [...unique.values()];
  let dropped = 0;
  const room = RUNAWAY_URL_CEILING - counts.total;
  if (list.length > room) { dropped = list.length - Math.max(0, room); list = list.slice(0, Math.max(0, room)); }
  for (let i = 0; i < list.length; i += 500) {
    /* Every row carries every column: a bulk insert fills a missing key with NULL, and a NULL status
       would violate the column. */
    const chunk = list.slice(i, i + 500).map((r) => ({
      job_id: jobId, url: r.url, kind: r.kind, source: r.source, depth: r.depth,
      status: r.status ?? "queued", skip_reason: r.skip_reason ?? null, http_status: r.http_status ?? null,
      final_url: r.final_url ?? null, evidence: r.evidence ?? null, processed_at: r.processed_at ?? null,
    }));
    /* ON CONFLICT DO NOTHING returns only the rows actually inserted, so the ceiling counts distinct
       URLs, never the thousands of repeat links a site's navigation produces. */
    const { data, error } = await service.from("crawl_urls").upsert(chunk, { onConflict: "job_id,url", ignoreDuplicates: true }).select("id");
    if (error) throw new Error(`enqueue: ${error.message}`);
    counts.total += (data ?? []).length;
  }
  return dropped;
}

async function bumpSummary(service: Client, jobId: string, patch: (s: Record<string, unknown>) => Record<string, unknown>) {
  const { data } = await service.from("crawl_jobs").select("summary").eq("id", jobId).maybeSingle();
  const cur = (data?.summary && typeof data.summary === "object") ? data.summary : {};
  await service.from("crawl_jobs").update({ summary: patch(cur), updated_at: new Date().toISOString() }).eq("id", jobId);
}

/* ── create ───────────────────────────────────────────────────────────────────────────────────── */

export interface HomeProbe {
  homeUrl: string; servedUrl: string; town: string | null; readableUa: string; readableAs: string | null;
  searchBlocked: string[]; respondedAny: boolean; clientRendered: CrawlSignals["clientRendered"];
  missingH1: boolean; noJsonLd: boolean; homeWords: number; homeStatus: number; homeXRobots: string | null; homeHtml: string;
}

/** One running job per lead: a second press returns the job already running. */
export async function activeJobFor(service: Client, leadId: string | null, startUrl: string) {
  let q = service.from("crawl_jobs").select("id,status,started_at").eq("status", "running");
  q = leadId ? q.eq("lead_id", leadId) : q.is("lead_id", null).eq("start_url", startUrl);
  const { data } = await q.order("started_at", { ascending: false }).limit(1).maybeSingle();
  return data ?? null;
}

export async function createCrawlJob(service: Client, input: {
  leadId: string | null; userId: string | null; requestedFrom: string | null; probe: HomeProbe;
}): Promise<{ jobId: string; reused: boolean }> {
  const existing = await activeJobFor(service, input.leadId, input.probe.homeUrl);
  if (existing) return { jobId: existing.id, reused: true };
  const p = input.probe;
  const robotsRes = await crawlGet(new URL("/robots.txt", p.servedUrl).href, p.readableUa);
  const robotsTxt = robotsRes.ok && robotsRes.body && !/<html/i.test(robotsRes.body.slice(0, 400)) ? robotsRes.body.slice(0, 100_000) : null;
  const robots = parseRobots(robotsTxt);
  const { data: job, error } = await service.from("crawl_jobs").insert({
    lead_id: input.leadId, user_id: input.userId, mode: "full", requested_from: input.requestedFrom,
    start_url: p.homeUrl, served_url: p.servedUrl, status: "running", robots_txt: robotsTxt,
    home: {
      town: p.town, readableUa: p.readableUa, readableAs: p.readableAs, searchBlocked: p.searchBlocked,
      respondedAny: p.respondedAny, clientRendered: p.clientRendered, missingH1: p.missingH1, noJsonLd: p.noJsonLd,
      homeWords: p.homeWords, lean: leanHtml(p.homeHtml).slice(0, 600_000), robots,
    },
    summary: { sitemap_url_count: 0, offsite_sitemap_count: 0, offsite_sitemap_samples: [], sitemap_locs_sample: [], runaway_dropped: 0 },
  }).select("id").single();
  if (error) throw new Error(`crawl job insert: ${error.message}`);
  const jobId = job.id as string;
  const counts = { total: 0 };

  // The homepage is already read: it is the first page row, done.
  const homeEv = processPage({ url: p.homeUrl, finalUrl: p.servedUrl, status: p.homeStatus, xRobotsTag: p.homeXRobots, html: p.homeHtml, isHome: true }, p.servedUrl);
  const homeKey = classifyCrawlUrl(p.servedUrl, p.servedUrl, p.servedUrl, null);
  const homeUrlKey = homeKey.ok ? homeKey.url : p.servedUrl;
  await enqueue(service, jobId, [{ url: homeUrlKey, kind: "page", source: "seed", depth: 0, status: "done", http_status: p.homeStatus, final_url: p.servedUrl, evidence: homeEv, processed_at: new Date().toISOString() }], counts);

  // Sitemaps: robots-declared, then the conventional paths.
  const sitemapSeeds = [...robots.sitemaps, "/sitemap.xml", "/sitemap_index.xml", "/wp-sitemap.xml"]
    .map((s) => classifySitemapUrl(s, p.servedUrl)).filter((s): s is string => !!s);
  await enqueue(service, jobId, [...new Set(sitemapSeeds)].map((u, i) => ({ url: u, kind: "sitemap" as const, source: i < robots.sitemaps.length ? "robots" : "seed", depth: 0 })), counts);

  // The homepage's links.
  await enqueue(service, jobId, linkRows(homeEv, rawLinks(p.homeHtml), p.servedUrl, p.servedUrl, robots, 1), counts);

  // ⛔ RE-CRAWL SEEDS: the previous completed job's pages, re-checked (never assumed). One that is
  // now gone is recorded as removed_since_last_crawl, not as a failure of this crawl.
  if (input.leadId) {
    const { data: prev } = await service.from("crawl_jobs").select("id").eq("lead_id", input.leadId)
      .in("status", ["complete", "complete_with_failures"]).neq("id", jobId).order("completed_at", { ascending: false }).limit(1).maybeSingle();
    if (prev?.id) {
      for (let from = 0; ; from += 1000) {
        const { data: rows, error: pe } = await service.from("crawl_urls").select("url").eq("job_id", prev.id).eq("kind", "page").eq("status", "done").order("id").range(from, from + 999);
        if (pe) break;
        const list = (rows ?? []) as Array<{ url: string }>;
        const seeds: NewRow[] = [];
        for (const r of list) { const c = classifyCrawlUrl(r.url, p.servedUrl, p.servedUrl, robots); if (c.ok) seeds.push({ url: c.url, kind: "page", source: "previous", depth: 1 }); }
        await enqueue(service, jobId, seeds, counts);
        if (list.length < 1000) break;
      }
    }
  }
  return { jobId, reused: false };
}

/** A page's links → new frontier rows. Same-site ineligible links are recorded as skipped with their
 *  reason; other websites and non-web links are not the site and are not rows. */
function linkRows(ev: PageEvidence | null, hrefs: string[], base: string, servedUrl: string, robots: RobotsRules | null, depth: number): NewRow[] {
  const out: NewRow[] = [];
  const now = new Date().toISOString();
  const all = [...hrefs, ...(ev?.d.canonical ? [ev.d.canonical] : [])];
  for (let i = 0; i < all.length; i++) {
    const c = classifyCrawlUrl(all[i], base, servedUrl, robots);
    const source = i >= hrefs.length ? "canonical" : "link";
    if (c.ok) out.push({ url: c.url, kind: "page", source, depth });
    else if (c.url && c.reason !== "off_site" && c.reason !== "not_http") out.push({ url: c.url, kind: "page", source, depth, status: "skipped", skip_reason: c.reason, processed_at: now });
  }
  return out;
}

/* ── tick ─────────────────────────────────────────────────────────────────────────────────────── */

export async function kickCrawlWorker(reason: string): Promise<void> {
  const fire = fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/crawl-worker`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-job": "1", "x-cron-secret": Deno.env.get("CRON_SECRET") ?? "" },
    body: JSON.stringify({ action: "tick", triggered_by: reason }),
  }).then(() => {}).catch((e) => console.error("[crawl-job] kick failed:", (e as Error).message));
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt && typeof rt.waitUntil === "function") rt.waitUntil(fire); else await fire;
}

/** One tick: claim a running job's lease, drain batches until the tick budget, persist everything.
 *  Returns what it did; `more` means the job still has work and the caller should chain. */
export async function runCrawlTick(service: Client): Promise<{ jobId: string | null; processed: number; finalized: boolean; more: boolean }> {
  const started = Date.now();
  const nowIso = new Date().toISOString();
  const { data: candidates } = await service.from("crawl_jobs").select("id")
    .eq("status", "running").or(`lease_until.is.null,lease_until.lt.${nowIso}`).order("updated_at", { ascending: true }).limit(5);
  let job: Record<string, any> | null = null;
  for (const c of (candidates ?? []) as Array<{ id: string }>) {
    const { data: claimed } = await service.from("crawl_jobs")
      .update({ lease_until: new Date(Date.now() + FULL_CRAWL.leaseMs).toISOString(), updated_at: nowIso })
      .eq("id", c.id).eq("status", "running").or(`lease_until.is.null,lease_until.lt.${nowIso}`)
      .select("id,lead_id,user_id,start_url,served_url,home,robots_txt,ticks,started_at,requested_from,summary").maybeSingle();
    if (claimed) { job = claimed; break; }
  }
  if (!job) return { jobId: null, processed: 0, finalized: false, more: false };
  const jobId = job.id as string;
  await service.from("crawl_jobs").update({ ticks: (job.ticks ?? 0) + 1 }).eq("id", jobId);

  // Resume: anything a dead worker left in flight goes back on the queue (or fails at max attempts).
  await service.from("crawl_urls").update({ status: "failed", error: "worker died mid-fetch too many times", processed_at: nowIso })
    .eq("job_id", jobId).eq("status", "processing").gte("attempts", FULL_CRAWL.maxAttempts);
  await service.from("crawl_urls").update({ status: "queued" }).eq("job_id", jobId).eq("status", "processing");

  const servedUrl = String(job.served_url || job.start_url);
  const home = (job.home ?? {}) as { readableUa?: string; robots?: RobotsRules; town?: string | null };
  const ua = home.readableUa || CRAWL_UA_FALLBACK;
  const robots = home.robots ?? parseRobots(job.robots_txt);
  const total = await jobCounts(service, jobId);
  const counts = { total: total.discovered + total.sitemaps };
  let processed = 0;
  let sitemapUrlCount = 0, offsiteCount = 0, dropped = 0;
  const offsiteSamples: string[] = [], locSamples: string[] = [];

  // At least one batch per tick (a tick always makes progress), then more until the budget.
  for (let batchNo = 0; batchNo === 0 || (batchNo < FULL_CRAWL.batchesPerTick && Date.now() - started < FULL_CRAWL.tickBudgetMs); batchNo++) {
    // Sitemaps before pages (they discover the most), then shallow before deep, then oldest first.
    const { data: batch, error: be } = await service.from("crawl_urls").select("id,url,kind,source,depth,attempts")
      .eq("job_id", jobId).eq("status", "queued")
      .order("kind", { ascending: false }).order("depth", { ascending: true }).order("id", { ascending: true }).limit(FULL_CRAWL.batchSize);
    if (be) throw new Error(`frontier read: ${be.message}`);
    const rows = (batch ?? []) as Array<{ id: number; url: string; kind: "page" | "sitemap"; source: string | null; depth: number; attempts: number }>;
    if (!rows.length) break;
    await service.from("crawl_urls").update({ status: "processing" }).in("id", rows.map((r) => r.id)).eq("status", "queued");
    for (const r of rows) r.attempts += 1;
    await Promise.all(rows.map((r) => service.from("crawl_urls").update({ attempts: r.attempts }).eq("id", r.id)));

    const results = await mapPool(rows, FULL_CRAWL.concurrency, (r) => crawlGet(r.url, ua));
    const updates: Array<Record<string, unknown>> = [];
    const discovered: NewRow[] = [];
    const now = new Date().toISOString();
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i], f = results[i];
      if (r.kind === "sitemap") {
        if (!f.ok || !f.body || !/<(urlset|sitemapindex)\b/i.test(f.body)) {
          const retry = !f.responded && r.attempts < FULL_CRAWL.maxAttempts;
          updates.push({ id: r.id, status: retry ? "queued" : "failed", http_status: f.status || null, error: f.error ?? (f.ok ? "not a sitemap" : `HTTP ${f.status}`), processed_at: retry ? null : now });
          continue;
        }
        const parsed = extractSitemapLocs(f.body);
        if (parsed.isIndex) {
          for (const child of orderSitemapChildren(parsed.locs)) {
            const c = classifySitemapUrl(child, servedUrl);
            if (c) discovered.push({ url: c, kind: "sitemap", source: "sitemap_index", depth: r.depth + 1 });
          }
        } else {
          sitemapUrlCount += parsed.locs.length;
          for (const loc of parsed.locs) {
            if (locSamples.length < MAX_SITEMAP_LOCS) locSamples.push(loc);
            const c = classifyCrawlUrl(loc, servedUrl, servedUrl, robots);
            if (c.ok) discovered.push({ url: c.url, kind: "page", source: "sitemap", depth: 1 });
            else if (c.reason === "off_site") { offsiteCount++; if (offsiteSamples.length < 50) offsiteSamples.push(loc); }
            else if (c.url && c.reason !== "not_http") discovered.push({ url: c.url, kind: "page", source: "sitemap", depth: 1, status: "skipped", skip_reason: c.reason, processed_at: now });
          }
        }
        updates.push({ id: r.id, status: "done", http_status: f.status, final_url: f.finalUrl, processed_at: now });
        continue;
      }
      const outcome = decideFetchOutcome({ responded: f.responded, status: f.status, contentType: f.contentType, attempts: r.attempts, source: r.source, finalUrl: f.finalUrl, servedUrl, error: f.error });
      const base: Record<string, unknown> = { id: r.id, status: outcome.status, http_status: outcome.http_status, final_url: f.finalUrl, error: outcome.error ?? null, skip_reason: outcome.skip_reason ?? null, processed_at: outcome.status === "queued" ? null : now };
      if (outcome.status === "done") {
        const finalKey = classifyCrawlUrl(f.finalUrl, servedUrl, servedUrl, null);
        if (finalKey.ok && finalKey.url !== r.url) {
          // A redirect: this address is recorded as redirecting; the destination gets its own row.
          discovered.push({ url: finalKey.url, kind: "page", source: "redirect", depth: r.depth });
        } else {
          const html = leanHtml(f.body);
          const ev = processPage({ url: r.url, finalUrl: f.finalUrl, status: f.status, xRobotsTag: f.xRobotsTag, html }, servedUrl);
          base.evidence = ev;
          discovered.push(...linkRows(ev, rawLinks(html), f.finalUrl, servedUrl, robots, r.depth + 1));
        }
      }
      updates.push(base);
    }
    dropped += await enqueue(service, jobId, discovered, counts);
    // One write per row keeps each update independent (a bad row cannot sink its batch).
    await mapPool(updates, 8, async (u) => {
      const { id, ...rest } = u;
      const { error } = await service.from("crawl_urls").update(rest).eq("id", id);
      if (error) console.error(`[crawl-job] row ${id} update failed: ${error.message}`);
    });
    processed += rows.length;
    await service.from("crawl_jobs").update({ lease_until: new Date(Date.now() + FULL_CRAWL.leaseMs).toISOString(), updated_at: new Date().toISOString() }).eq("id", jobId);
  }

  if (sitemapUrlCount || offsiteCount || dropped || locSamples.length) {
    await bumpSummary(service, jobId, (s) => ({
      ...s,
      sitemap_url_count: Number(s.sitemap_url_count ?? 0) + sitemapUrlCount,
      offsite_sitemap_count: Number(s.offsite_sitemap_count ?? 0) + offsiteCount,
      offsite_sitemap_samples: [...(Array.isArray(s.offsite_sitemap_samples) ? s.offsite_sitemap_samples : []), ...offsiteSamples].slice(0, 50),
      sitemap_locs_sample: [...(Array.isArray(s.sitemap_locs_sample) ? s.sitemap_locs_sample : []), ...locSamples].slice(0, MAX_SITEMAP_LOCS),
      runaway_dropped: Number(s.runaway_dropped ?? 0) + dropped,
    }));
  }

  const after = await jobCounts(service, jobId);
  if (frontierExhausted(after)) {
    await finalizeCrawlJob(service, jobId);
    return { jobId, processed, finalized: true, more: false };
  }
  await service.from("crawl_jobs").update({ lease_until: null, updated_at: new Date().toISOString() }).eq("id", jobId);
  return { jobId, processed, finalized: false, more: true };
}

/* ── finalize ─────────────────────────────────────────────────────────────────────────────────── */

const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export async function finalizeCrawlJob(service: Client, jobId: string): Promise<void> {
  const { data: job } = await service.from("crawl_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job) return;
  const servedUrl = String(job.served_url || job.start_url);
  const home = (job.home ?? {}) as Record<string, any>;
  const summaryState = (job.summary ?? {}) as Record<string, any>;

  // Every page row, paged (PostgREST caps at 1,000) — digest + business only, never the text.
  const rows: Array<StoredCrawlRow & { id: number; depth: number }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await service.from("crawl_urls")
      .select("id,url,status,skip_reason,http_status,final_url,source,depth,d:evidence->d,b:evidence->b,nav:evidence->nav,footer:evidence->footer")
      .eq("job_id", jobId).eq("kind", "page").order("id").range(from, from + 999);
    if (error) throw new Error(`finalize read: ${error.message}`);
    const list = (data ?? []) as Array<Record<string, any>>;
    for (const r of list) rows.push({ id: r.id, depth: r.depth, url: r.url, status: r.status, skip_reason: r.skip_reason, http_status: r.http_status, final_url: r.final_url, source: r.source, evidence: r.d ? { d: r.d, b: r.b, nav: r.nav ?? undefined, footer: r.footer ?? undefined } : null });
    if (list.length < 1000) break;
  }
  const { count: sitemapsRead } = await service.from("crawl_urls").select("id", { count: "exact", head: true }).eq("job_id", jobId).eq("kind", "sitemap").eq("status", "done");
  const runawayDropped = Number(summaryState.runaway_dropped ?? 0);
  const ms = Date.now() - Date.parse(job.started_at);

  const full = summariseCrawlRows({
    rows,
    requestedUrl: job.start_url, servedUrl, robotsTxt: job.robots_txt ?? null, sitemapsRead: sitemapsRead ?? 0,
    offSiteSitemapLocs: { count: Number(summaryState.offsite_sitemap_count ?? 0), samples: summaryState.offsite_sitemap_samples ?? [] },
    sitemapUrlCount: Number(summaryState.sitemap_url_count ?? 0), ms, ticks: Number(job.ticks ?? 0), jobId,
  });
  if (runawayDropped) {
    full.stats.skipped += runawayDropped;
    full.stats.skippedByReason.safety_ceiling = (full.stats.skippedByReason.safety_ceiling ?? 0) + runawayDropped;
    full.stats.urlsDiscovered += runawayDropped;
    full.stats.hitRunawayCeiling = true;
    full.completeness = full.completeness === "failed" ? "failed" : "complete_with_failures";
    full.warnings.push(`The site produced more than ${RUNAWAY_URL_CEILING.toLocaleString("en-GB")} distinct addresses — an endless URL space. ${runawayDropped.toLocaleString("en-GB")} further addresses were counted but not crawled.`);
  }

  // The AI-visibility signals, same shape the report and the Inbox have always read.
  const done = rows.filter((r) => r.status === "done" && r.evidence?.d);
  const fetched = rows.filter((r) => r.status === "done" || r.status === "failed");
  const town = (home.town as string | null) ?? null;
  const biggest = clusterUrls(done.map((r) => r.url), town)[0];
  let duplicates: CrawlSignals["duplicates"] = null;
  if (biggest && biggest.urls.length >= 3) {
    const sample = biggest.urls.slice(0, 5);
    const { data: texts } = await service.from("crawl_urls").select("url,t:evidence->t").eq("job_id", jobId).in("url", sample);
    const list = ((texts ?? []) as Array<{ t: string | null }>).map((x) => x.t ?? "").filter(Boolean);
    const sims: number[] = [];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) sims.push(pageSimilarity(list[i], list[j], town));
    const med = median(sims);
    if (list.length >= 2 && med >= 0.9) duplicates = { clusterSize: biggest.urls.length, sampleSize: list.length, similarityPct: Math.round(med * 100) };
  }
  const thin = done.filter((r) => (r.evidence!.d.words ?? 0) < THIN_WORDS);
  const cr = home.clientRendered ?? null;
  const signals: CrawlSignals = {
    homeUrl: job.start_url, fetchFailed: !home.respondedAny, searchBlocked: home.searchBlocked ?? [],
    readableAs: home.readableAs ?? null, clientRendered: cr, missingH1: !!home.missingH1, noJsonLd: !!home.noJsonLd,
    duplicates, thinPages: thin.length, pagesChecked: fetched.length,
    // A display list for the popup; the complete inventory is the job's crawl_urls rows.
    checkedPages: fetched.slice(0, 100).map((r) => ({ url: r.final_url || r.url, kind: crawlPageKind(r.url), words: r.evidence?.d?.words ?? 0, hasH1: (r.evidence?.d?.h1?.length ?? 0) > 0, readable: r.status === "done" })),
    thinPageUrls: thin.slice(0, 50).map((r) => r.final_url || r.url),
  };
  const verdict = buildVerdict(signals);
  const servedOrigin = (() => { try { return new URL(servedUrl).origin; } catch { return servedUrl; } })();
  let siteInfo = null;
  try {
    const shallow = [...done].sort((a, b) => a.depth - b.depth || a.id - b.id).slice(0, 300);
    siteInfo = extractSiteInfo(String(home.lean ?? ""), {
      origin: servedOrigin, clusterUrls: biggest?.urls ?? [],
      samplePages: shallow.map((r) => ({ url: r.final_url || r.url, html: syntheticHtml({ d: r.evidence!.d, j: [] }) })),
    });
  } catch (e) { console.error("[crawl-job] siteInfo failed:", (e as Error).message); }
  let evidence = null;
  try {
    const { data: jrows } = await service.from("crawl_urls").select("url,final_url,http_status,d:evidence->d,j:evidence->j")
      .eq("job_id", jobId).eq("kind", "page").eq("status", "done").order("depth").order("id").limit(1000);
    const pages: EvidencePage[] = ((jrows ?? []) as Array<Record<string, any>>).filter((r) => r.d).map((r, i) => ({
      requestedUrl: r.url, finalUrl: r.final_url || r.url, status: r.http_status ?? 200, xRobotsTag: null,
      html: i === 0 && home.lean ? String(home.lean) : syntheticHtml({ d: r.d, j: r.j ?? [] }), isHome: i === 0,
    }));
    if (pages.length) evidence = buildSiteEvidence({ servedUrl, pages, sitemapLocs: summaryState.sitemap_locs_sample ?? [], sitemapUrls: [] });
  } catch (e) { console.error("[crawl-job] evidence failed:", (e as Error).message); }

  const checkedAt = new Date().toISOString();
  const result = {
    version: CRAWL_CHECK_VERSION, siteInfoVersion: SITE_INFO_VERSION, checked_at: checkedAt, url: job.start_url, town,
    signals, verdict, siteInfo, job_id: jobId,
    ...(evidence ? { evidence, evidenceVersion: SITE_EVIDENCE_VERSION } : {}),
  };
  const status = full.completeness === "complete" ? "complete" : full.completeness === "failed" ? "failed" : "complete_with_failures";
  await service.from("crawl_jobs").update({ status, result, summary: { ...summaryState, full }, completed_at: checkedAt, lease_until: null, updated_at: checkedAt }).eq("id", jobId);
  if (job.lead_id) {
    /* THE LEAD'S ONE CANONICAL ROW now describes this crawl. The previous job's rows stay as
       history; the lead row points only at the newest completed job, so a page that has gone is not
       part of the latest snapshot. */
    const { error } = await service.from("lead_crawl_checks").upsert({
      lead_id: job.lead_id, url: job.start_url, user_id: job.user_id, result, created_at: checkedAt,
      mode: "full", full_evidence: full, requested_from: job.requested_from, job_id: jobId,
    }, { onConflict: "lead_id" });
    if (error) {
      console.error(`[crawl-job] lead row write failed: ${error.message}`);
      await service.from("crawl_jobs").update({ error: `lead row write failed: ${error.message}` }).eq("id", jobId);
    }
  }
}
