import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runApifyActor } from "../_shared/enrichment/apify.ts";
import { isAggregatorUrl } from "../_shared/aggregators.ts";

// run-seo-scan — run the Apify actor smart-digital/complete-seo-audit-tool for an audit's
// website, MAP its 9-category output into the report's existing AiAuditSeo shape (3 grades),
// store the full scan detail alongside for the in-depth view, and write it to
// ai_audit_runs.results.seo. Replaces the manual apply-seo-paste path (same {runId} contract,
// same storage location + AiAuditSeo shape → the report renders identically).
//
// Reuses the product's Apify integration (runApifyActor: run-sync-get-dataset-items, Bearer
// APIFY_TOKEN, AbortController). Auth mirrors apply-seo-paste (verify_jwt=false + Bearer getUser
// + run ownership). Mapping is DETERMINISTIC in code — no LLM.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SEO_SCAN_ACTOR = "smart-digital~complete-seo-audit-tool"; // Apify API path uses `~`
const MAX_PAGES = 5;
const ACTOR_TIMEOUT_MS = 140_000; // multi-page run-sync; under the ~150s edge wall-clock
const MAX_DETAIL_ISSUES = 40;     // issues kept for the in-depth view
const MAX_LEAD_FINDINGS = 5;      // findings shown in the overview
const MAX_RAW_PASTE_CHARS = 50_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const rec = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const strOf = (v: unknown): string => (typeof v === "string" ? v : "");
const numOf = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function normaliseUrl(raw: string): string {
  const u = (raw || "").trim();
  if (!u) return "";
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

/** Resolve the canonical URL by following redirects once (HEAD, fall back to GET).
 *  Fixes the case where a stored non-www URL redirects to www and the crawler only
 *  audits the redirect landing page. Returns the final URL, or the input unchanged
 *  if the request fails - never throws. */
async function resolveCanonicalUrl(input: string): Promise<string> {
  if (!input) return input;
  try {
    const res = await fetch(input, { method: "HEAD", redirect: "follow" });
    if (res.url && /^https?:\/\//i.test(res.url)) return res.url;
  } catch (_) { /* fall through */ }
  try {
    const res = await fetch(input, { method: "GET", redirect: "follow" });
    if (res.url && /^https?:\/\//i.test(res.url)) return res.url;
  } catch (_) { /* fall through */ }
  return input;
}
function urlKey(u: string): string {
  try {
    const p = new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`);
    return (p.host + p.pathname).toLowerCase().replace(/\/+$/, "").replace(/^www\./, "");
  } catch { return (u || "").toLowerCase().replace(/\/+$/, ""); }
}

/* Grading. Letter thresholds unchanged from apply-seo-paste. Weights now span only the two
   SCORED buckets; Local Presence carries no score from an on-page crawl, so it is excluded
   from the overall rather than faked. */
const GRADE_WEIGHTS = { onPage: 0.60, contentTechnical: 0.40 };
function letter(score: number): string {
  const s = clamp(score);
  return s >= 95 ? "A+" : s >= 85 ? "A" : s >= 70 ? "B" : s >= 55 ? "C" : s >= 40 ? "D" : "F";
}

// The actor's 9 category scores -> the report's 2 SCORED buckets. Local Presence is NOT scored
// by an on-page crawl (see the mapping block) so it is not built from these.
//   On-Page SEO    = metaTags + headings + content + images + accessibility (authoring quality)
//   Content & Tech = technical + performance + links + schema (technical health + entity signal)
const ONPAGE_KEYS = ["metaTags", "headings", "content", "images", "accessibility"];
const CONTENTTECH_KEYS = ["technical", "performance", "links", "schema"];

/** Average the PRESENT numeric category scores for a bucket (missing categories are skipped). */
function avgScores(cats: Record<string, unknown>, keys: string[]): number {
  const vals = keys.map((k) => numOf(cats[k])).filter((n): n is number => n != null);
  if (!vals.length) return 0;
  return clamp(vals.reduce((a, b) => a + b, 0) / vals.length);
}

const CATEGORY_KEYS = ["metaTags", "headings", "content", "technical", "schema", "performance", "links", "images", "accessibility"];

/** Site-level category scores: prefer the actor's site-summary.categoryAverages (mean over every
 *  crawled page); fall back to averaging the page-level categoryScores. Using the site average,
 *  not one page, so a strong homepage can't mask weak inner pages. */
function siteCategoryScores(items: unknown[], pages: Record<string, unknown>[]): Record<string, number> {
  const summary = items.map(rec).find((it) => it && strOf(it.type) === "site-summary");
  const avgs = summary ? rec(summary.categoryAverages) : null;
  if (avgs && Object.keys(avgs).length) {
    const out: Record<string, number> = {};
    for (const k of CATEGORY_KEYS) { const n = numOf(avgs[k]); if (n != null) out[k] = clamp(n); }
    if (Object.keys(out).length) return out;
  }
  const out: Record<string, number> = {};
  for (const k of CATEGORY_KEYS) {
    const vals = pages.map((p) => numOf(rec(rec(p.audit)?.categoryScores)?.[k])).filter((n): n is number => n != null);
    if (vals.length) out[k] = clamp(vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  return out;
}

/** Count crawled pages carrying real JSON-LD (the honest schema signal). */
function schemaPageCount(pages: Record<string, unknown>[]): number {
  return pages.filter((p) => rec(rec(rec(p.audit)?.technical)?.structuredData)?.jsonLd === true).length;
}

interface Finding { title: string; detail: string; severity: "high" | "med" | "low" }
const SEV_RANK: Record<Finding["severity"], number> = { high: 0, med: 1, low: 2 };

function severityOf(v: unknown): Finding["severity"] {
  const s = strOf(v).toLowerCase();
  if (/high|critical|error|severe/.test(s)) return "high";
  if (/low|minor|info|notice/.test(s)) return "low";
  return "med";
}

/** Collect + dedupe the actor's structured issue objects across ALL crawled pages.
 *  Verified shape: audit.issues.structured.{critical|warnings|info}[] =
 *  { id, message, category, priority, estimatedImpact, fixHint, pagesAffected }.
 *  title<-message, detail<-fixHint, severity<-estimatedImpact. Dedupe by message so a site-wide
 *  issue shows once; keep the highest severity and sum affected pages. */
function collectIssues(pages: Record<string, unknown>[], cap: number): Finding[] {
  const byKey = new Map<string, Finding & { affected: number }>();
  for (const p of pages) {
    const structured = rec(rec(rec(p.audit)?.issues)?.structured) ?? {};
    for (const bucket of ["critical", "warnings", "info"]) {
      const arr = Array.isArray(structured[bucket]) ? structured[bucket] as unknown[] : [];
      for (const raw of arr) {
        const it = rec(raw) ?? {};
        const title = strOf(it.message).trim();
        if (!title) continue;
        const key = title.toLowerCase();
        const severity = severityOf(it.estimatedImpact ?? bucket);
        const affected = Array.isArray(it.pagesAffected) ? (it.pagesAffected as unknown[]).length : 1;
        const existing = byKey.get(key);
        if (existing) {
          existing.affected += affected;
          if (SEV_RANK[severity] < SEV_RANK[existing.severity]) existing.severity = severity;
        } else {
          byKey.set(key, { title: title.slice(0, 140), detail: strOf(it.fixHint).trim().slice(0, 400), severity, affected });
        }
      }
    }
  }
  return [...byKey.values()]
    .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity] || b.affected - a.affected)
    .slice(0, cap)
    .map(({ title, detail, severity }) => ({ title, detail, severity }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    // --- Auth: any authenticated user; the run must belong to them (mirrors apply-seo-paste). ---
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json({ ok: false, error: "unauthorized" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ ok: false, error: "unauthorized" }, 401);
    const userId = u.user.id;

    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const body = await req.json().catch(() => ({}));
    const runId: string = typeof body.runId === "string" ? body.runId.trim() : "";
    if (!runId) return json({ ok: false, error: "runId required" }, 400);

    const { data: run } = await service
      .from("ai_audit_runs").select("id, audit_id, user_id, results").eq("id", runId).maybeSingle();
    if (!run) return json({ ok: false, error: "run_not_found" }, 404);
    if (run.user_id !== userId) return json({ ok: false, error: "forbidden" }, 403);

    const { data: audit } = await service
      .from("ai_audits").select("has_website, website").eq("id", run.audit_id).maybeSingle();
    if (!audit) return json({ ok: false, error: "audit_not_found" }, 404);
    if (!audit.has_website || !audit.website) return json({ ok: false, error: "no_website" }, 400);
    if (isAggregatorUrl(String(audit.website))) {
      return json({ ok: false, error: "That website is a booking platform / social / directory page, not an own site." }, 400);
    }
    const rawUrl = normaliseUrl(String(audit.website));
    const url = await resolveCanonicalUrl(rawUrl);
    console.log(`[run-seo-scan] start url: raw=${rawUrl} resolved=${url}`);

    const apifyToken = Deno.env.get("APIFY_TOKEN") ?? "";
    if (!apifyToken) return json({ ok: false, error: "apify_not_configured" }, 500);

    // --- Run the actor (run-sync-get-dataset-items via the shared runApifyActor) ---
    let items: unknown[];
    try {
      const out = await runApifyActor(
        SEO_SCAN_ACTOR,
        { startUrls: [url], maxPages: MAX_PAGES, crawlPages: true },
        { token: apifyToken, timeoutMs: ACTOR_TIMEOUT_MS, retry: { on429: true } },
      );
      items = out.items;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const aborted = (e as Error)?.name === "AbortError";
      return json({ ok: false, error: aborted ? "actor_timeout" : "actor_failed", detail: msg.slice(0, 300) }, 502);
    }
    if (!Array.isArray(items) || items.length === 0) return json({ ok: false, error: "no_results" }, 502);

    // --- Page items (audit block + pageUrl). A type:"site-summary" item is used for site scores. ---
    const pages = items.map(rec).filter((it): it is Record<string, unknown> => !!it && !!rec(it.audit) && !!strOf(it.pageUrl));
    if (pages.length === 0) return json({ ok: false, error: "no_page_audit", rawSample: items.slice(0, 2) }, 502);
    const siteSummary = items.map(rec).find((it): it is Record<string, unknown> => !!it && strOf(it.type) === "site-summary");
    const siteAverage = siteSummary ? numOf(siteSummary.averageScore) : null;

    // Representative page for page-level detail (title/meta/headings): scanned URL, else first.
    const startKey = urlKey(url);
    const primary = pages.find((p) => urlKey(strOf(p.pageUrl)) === startKey) ?? pages[0];
    const primaryAudit = rec(primary.audit) ?? {};

    // --- Bucket scores from SITE-LEVEL category scores (not one page) ---
    const cats = siteCategoryScores(items, pages);
    const onPageScore = avgScores(cats, ONPAGE_KEYS);
    const contentTechScore = avgScores(cats, CONTENTTECH_KEYS);
    const overallScore = clamp(onPageScore * GRADE_WEIGHTS.onPage + contentTechScore * GRADE_WEIGHTS.contentTechnical);

    const leadFindings = collectIssues(pages, MAX_LEAD_FINDINGS);
    const detailIssues = collectIssues(pages, MAX_DETAIL_ISSUES);
    const schemaPages = schemaPageCount(pages);

    const seo = {
      overallGrade: letter(overallScore),
      categories: {
        onPage: { grade: letter(onPageScore), score: onPageScore },
        contentTechnical: { grade: letter(contentTechScore), score: contentTechScore },
      },
      leadFindings,
      baseline: {
        source: "run-seo-scan",
        actorSiteAverage: siteAverage,
        categoryScores: cats,
        pagesCrawled: pages.length,
        structuredDataPages: schemaPages,
        hasStructuredData: schemaPages > 0,
        structuredDataAllPages: schemaPages === pages.length,
      },
      scanDetail: {
        scannedUrl: url,
        pageUrl: strOf(primary.pageUrl),
        httpStatus: numOf(primary.httpStatus),
        title: strOf(primary.title),
        actorSiteAverage: siteAverage,
        categoryScores: cats,
        metaTags: rec(primaryAudit.metaTags),
        headings: rec(primaryAudit.headings),
        technical: rec(primaryAudit.technical),
        structuredDataPages: schemaPages,
        pagesCrawled: pages.length,
        issues: detailIssues,
        checkedAt: new Date().toISOString(),
      },
      rawPaste: [
        `SEO scan of ${url} (site average ${siteAverage ?? "?"}/100 across ${pages.length} pages).`,
        `Category scores (site): ${Object.entries(cats).map(([k, v]) => `${k} ${numOf(v) ?? "?"}`).join(", ")}.`,
        `Structured data on ${schemaPages}/${pages.length} pages.`,
        `Issues: ${detailIssues.map((i) => `[${i.severity}] ${i.title}${i.detail ? ` - ${i.detail}` : ""}`).join(" | ")}`,
      ].join("\n").slice(0, MAX_RAW_PASTE_CHARS),
    };

    // --- Store (merge, mirrors apply-seo-paste / maybeRunSeoStep) ---
    const { data: fresh } = await service.from("ai_audit_runs").select("results").eq("id", runId).maybeSingle();
    const cur = fresh?.results && typeof fresh.results === "object" ? fresh.results as Record<string, unknown> : {};
    const { error: upErr } = await service.from("ai_audit_runs").update({ results: { ...cur, seo } }).eq("id", runId);
    if (upErr) return json({ ok: false, error: "store_failed", detail: upErr.message }, 500);

    return json({ ok: true, seo });
  } catch (e) {
    console.error("run-seo-scan error:", e);
    return json({ ok: false, error: "internal_error", detail: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
