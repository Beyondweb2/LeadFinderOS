import { runApifyActor } from "./apify.ts";

// seo-scan-core — the deterministic core of the automated SEO scan, extracted VERBATIM from
// run-seo-scan/index.ts so both the edge function AND the queue (process-ai-audit-queue) can
// call the exact same logic without duplicating it. This module runs the Apify actor
// smart-digital/complete-seo-audit-tool and MAPS its 9-category output into the report's
// AiAuditSeo shape (2 scored grades + baseline + scanDetail + rawPaste). It does NO DB
// read/write and NO auth — the caller owns those. Pure mapping, no LLM.

export const SEO_SCAN_ACTOR = "smart-digital~complete-seo-audit-tool"; // Apify API path uses `~`
export const MAX_PAGES = 5;
export const ACTOR_TIMEOUT_MS = 140_000; // multi-page run-sync; under the ~150s edge wall-clock
export const MAX_DETAIL_ISSUES = 40;     // issues kept for the in-depth view
export const MAX_LEAD_FINDINGS = 5;      // findings shown in the overview
export const MAX_RAW_PASTE_CHARS = 50_000;

export const rec = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
export const strOf = (v: unknown): string => (typeof v === "string" ? v : "");
export const numOf = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
export const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export function normaliseUrl(raw: string): string {
  const u = (raw || "").trim();
  if (!u) return "";
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

/** Resolve the canonical URL by following redirects once (HEAD, fall back to GET).
 *  Fixes the case where a stored non-www URL redirects to www and the crawler only
 *  audits the redirect landing page. Returns the final URL, or the input unchanged
 *  if the request fails - never throws. */
export async function resolveCanonicalUrl(input: string): Promise<string> {
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
export function urlKey(u: string): string {
  try {
    const p = new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`);
    return (p.host + p.pathname).toLowerCase().replace(/\/+$/, "").replace(/^www\./, "");
  } catch { return (u || "").toLowerCase().replace(/\/+$/, ""); }
}

/* Grading. Letter thresholds unchanged from apply-seo-paste. Weights now span only the two
   SCORED buckets; Local Presence carries no score from an on-page crawl, so it is excluded
   from the overall rather than faked. */
export const GRADE_WEIGHTS = { onPage: 0.60, contentTechnical: 0.40 };
export function letter(score: number): string {
  const s = clamp(score);
  return s >= 95 ? "A+" : s >= 85 ? "A" : s >= 70 ? "B" : s >= 55 ? "C" : s >= 40 ? "D" : "F";
}

// The actor's 9 category scores -> the report's 2 SCORED buckets. Local Presence is NOT scored
// by an on-page crawl (see the mapping block) so it is not built from these.
//   On-Page SEO    = metaTags + headings + content + images + accessibility (authoring quality)
//   Content & Tech = technical + performance + links + schema (technical health + entity signal)
export const ONPAGE_KEYS = ["metaTags", "headings", "content", "images", "accessibility"];
export const CONTENTTECH_KEYS = ["technical", "performance", "links", "schema"];

/** Average the PRESENT numeric category scores for a bucket (missing categories are skipped). */
export function avgScores(cats: Record<string, unknown>, keys: string[]): number {
  const vals = keys.map((k) => numOf(cats[k])).filter((n): n is number => n != null);
  if (!vals.length) return 0;
  return clamp(vals.reduce((a, b) => a + b, 0) / vals.length);
}

export const CATEGORY_KEYS = ["metaTags", "headings", "content", "technical", "schema", "performance", "links", "images", "accessibility"];

/** Site-level category scores: prefer the actor's site-summary.categoryAverages (mean over every
 *  crawled page); fall back to averaging the page-level categoryScores. Using the site average,
 *  not one page, so a strong homepage can't mask weak inner pages. */
export function siteCategoryScores(items: unknown[], pages: Record<string, unknown>[]): Record<string, number> {
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
export function schemaPageCount(pages: Record<string, unknown>[]): number {
  return pages.filter((p) => rec(rec(rec(p.audit)?.technical)?.structuredData)?.jsonLd === true).length;
}

interface Finding { title: string; detail: string; severity: "high" | "med" | "low" }
const SEV_RANK: Record<Finding["severity"], number> = { high: 0, med: 1, low: 2 };

export function severityOf(v: unknown): Finding["severity"] {
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
export function collectIssues(pages: Record<string, unknown>[], cap: number): Finding[] {
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

export type SeoScanCoreResult =
  | { ok: true; seo: Record<string, unknown> }
  | { ok: false; error: string; detail?: string };

/** Core of the automated SEO scan: resolve the canonical URL, run the actor, and MAP its output
 *  into the AiAuditSeo shape. Returns the seo object (caller persists it) or a structured error.
 *  Contains run-seo-scan's former inline logic VERBATIM; DB read/write stays in the caller. */
export async function runSeoScanCore(website: string, opts: { token: string }): Promise<SeoScanCoreResult> {
  const rawUrl = normaliseUrl(website);
  const url = await resolveCanonicalUrl(rawUrl);
  console.log(`[run-seo-scan] start url: raw=${rawUrl} resolved=${url}`);

  // --- Run the actor (run-sync-get-dataset-items via the shared runApifyActor) ---
  let items: unknown[];
  try {
    const out = await runApifyActor(
      SEO_SCAN_ACTOR,
      { startUrls: [url], maxPages: MAX_PAGES, crawlPages: true },
      { token: opts.token, timeoutMs: ACTOR_TIMEOUT_MS, retry: { on429: true } },
    );
    items = out.items;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const aborted = (e as Error)?.name === "AbortError";
    return { ok: false, error: aborted ? "actor_timeout" : "actor_failed", detail: msg.slice(0, 300) };
  }
  if (!Array.isArray(items) || items.length === 0) return { ok: false, error: "no_results" };

  // --- Page items (audit block + pageUrl). A type:"site-summary" item is used for site scores. ---
  const pages = items.map(rec).filter((it): it is Record<string, unknown> => !!it && !!rec(it.audit) && !!strOf(it.pageUrl));
  if (pages.length === 0) return { ok: false, error: "no_page_audit" };
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

  return { ok: true, seo };
}
