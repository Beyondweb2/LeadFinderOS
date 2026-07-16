import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runApifyActor } from "../_shared/enrichment/apify.ts";
import { isAggregatorUrl } from "../_shared/aggregators.ts";

// run-seo-scan — STAGE 1 (isolation): given an audit's website, run the Apify actor
// smart-digital/complete-seo-audit-tool and RETURN the parsed SEO data. It does NOT store
// anything, does NOT map into the report/playbook (AiAuditSeo) shape, and does NOT touch the
// manual paste — those come in a later session. This proves: URL in → accurate parsed SEO out.
//
// Reuses the product's existing Apify integration: runApifyActor (run-sync-get-dataset-items,
// Bearer APIFY_TOKEN, AbortController timeout) — the SAME path ai-search.ts / seo-audit.ts use.
// Auth mirrors apply-seo-paste: verify_jwt=false + in-handler Bearer (any authenticated user).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Actor id — Apify API paths use `~` (mirrors AI_SEARCH_ACTOR / SEO_AUDIT_ACTOR).
const SEO_SCAN_ACTOR = "smart-digital~complete-seo-audit-tool";
const MAX_PAGES = 5;              // actor default; "a few pages"
const ACTOR_TIMEOUT_MS = 140_000; // multi-page run-sync; kept under the ~150s edge wall-clock
const MAX_ISSUES = 40;           // cap issues surfaced per page

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/** Normalise a free-typed URL to an absolute https one (a stored value like "ablm.co.uk" isn't
 *  a valid start URL). Already-valid http(s) URLs are kept; empty → "". */
function normaliseUrl(raw: string): string {
  const u = (raw || "").trim();
  if (!u) return "";
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

const rec = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const strOf = (v: unknown): string => (typeof v === "string" ? v : "");
const numOf = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Strip a URL to host+path (lowercased, no scheme, no trailing slash) for matching pageUrl
 *  against the start URL regardless of www/scheme/redirect differences. */
function urlKey(u: string): string {
  try {
    const p = new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`);
    return (p.host + p.pathname).toLowerCase().replace(/\/+$/, "").replace(/^www\./, "");
  } catch {
    return (u || "").toLowerCase().replace(/\/+$/, "");
  }
}

interface ParsedPage {
  pageUrl: string;
  title: string;
  httpStatus: number | null;
  audit: Record<string, unknown> | null; // pass-through: overallScore, categoryScores, issues, metaTags, headings, technical, …
}

/** Best-effort convenience checks so the caller can eyeball accuracy without knowing the exact
 *  nested field names. Defensive: any value we can't confidently read comes back null (unknown),
 *  and the full `audit` object is returned alongside so nothing is hidden. */
function deriveChecks(audit: Record<string, unknown> | null, title: string) {
  if (!audit) return { titleLength: title.length, hasMetaDescription: null, overallScore: null, hasSchema: null, hasH1: null };
  const meta = rec(audit.metaTags);
  const tech = rec(audit.technical);
  const headings = rec(audit.headings);
  const cats = rec(audit.categoryScores);
  const metaDesc = meta ? strOf(meta.description) : "";
  // schema: technical.structuredData, a schema categoryScore > 0, or an audit.schema block.
  const schemaScore = cats ? numOf(cats.schema) : null;
  const structured = tech ? tech.structuredData : undefined;
  const hasSchema = structured != null
    ? (Array.isArray(structured) ? structured.length > 0 : !!structured)
    : (schemaScore != null ? schemaScore > 0 : (rec(audit.schema) ? true : null));
  // H1: probe common shapes (headings.h1 / h1Count / counts.h1).
  const h1 = headings ? (headings.h1 ?? (rec(headings.counts)?.h1) ?? headings.h1Count) : undefined;
  const hasH1 = h1 == null ? null : (Array.isArray(h1) ? h1.length > 0 : (typeof h1 === "number" ? h1 > 0 : !!h1));
  return {
    titleLength: title.length,
    hasMetaDescription: meta ? metaDesc.trim().length > 0 : null,
    overallScore: numOf(audit.overallScore),
    hasSchema,
    hasH1,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    // --- Auth: any authenticated user (mirrors apply-seo-paste). ---
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json({ ok: false, error: "unauthorized" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ ok: false, error: "unauthorized" }, 401);

    // --- Input ---
    const body = await req.json().catch(() => ({}));
    const websiteRaw: string = typeof body.website === "string" ? body.website.trim() : "";
    // audit_id / runId accepted for parity with the other audit fns; UNUSED this stage (no storage).
    if (!websiteRaw) return json({ ok: false, error: "website required" }, 400);
    if (isAggregatorUrl(websiteRaw)) {
      return json({ ok: false, error: "That URL is a booking platform / social / directory page, not an own website." }, 400);
    }
    const url = normaliseUrl(websiteRaw);

    const apifyToken = Deno.env.get("APIFY_TOKEN") ?? "";
    if (!apifyToken) return json({ ok: false, error: "apify_not_configured" }, 500);

    // --- Run the actor (run-sync-get-dataset-items via the shared runApifyActor) ---
    let items: unknown[];
    let ms: number;
    try {
      const out = await runApifyActor(
        SEO_SCAN_ACTOR,
        { startUrls: [url], maxPages: MAX_PAGES, crawlPages: true },
        { token: apifyToken, timeoutMs: ACTOR_TIMEOUT_MS, retry: { on429: true } },
      );
      items = out.items;
      ms = out.ms;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const aborted = (e as Error)?.name === "AbortError";
      return json({ ok: false, error: aborted ? "actor_timeout" : "actor_failed", detail: msg.slice(0, 300) }, 502);
    }

    if (!Array.isArray(items) || items.length === 0) {
      return json({ ok: false, error: "no_results", detail: "The actor returned no items." }, 502);
    }

    // --- Parse: split page items (have a per-page audit + pageUrl) from a site summary ---
    const pages: ParsedPage[] = [];
    let summary: Record<string, unknown> | null = null;
    for (const raw of items) {
      const it = rec(raw);
      if (!it) continue;
      const audit = rec(it.audit);
      const pageUrl = strOf(it.pageUrl);
      if (audit && pageUrl) {
        pages.push({ pageUrl, title: strOf(it.title), httpStatus: numOf(it.httpStatus), audit });
      } else if (/summary|site|overview/i.test(strOf(it.type)) || (!audit && !pageUrl)) {
        // A site-level summary item (no per-page audit). Keep the first one seen.
        if (!summary) summary = it;
      }
    }

    if (pages.length === 0) {
      // Nothing parseable — return the raw items so we can see what the actor actually sent.
      return json({ ok: false, error: "no_page_audit", detail: "No page items with an audit block.", rawSample: items.slice(0, 2) }, 502);
    }

    // Primary = the page matching the start URL (ignoring www/scheme/trailing slash), else the first.
    const startKey = urlKey(url);
    const primary = pages.find((p) => urlKey(p.pageUrl) === startKey) ?? pages[0];

    // Cap issues so the payload stays reasonable (pass everything else through).
    const primaryAudit = primary.audit ? { ...primary.audit } : null;
    if (primaryAudit && Array.isArray(primaryAudit.issues)) {
      primaryAudit.issues = (primaryAudit.issues as unknown[]).slice(0, MAX_ISSUES);
    }

    return json({
      ok: true,
      scannedUrl: url,
      durationMs: ms,
      pageCount: pages.length,
      pageUrls: pages.map((p) => p.pageUrl),
      primary: {
        pageUrl: primary.pageUrl,
        title: primary.title,
        httpStatus: primary.httpStatus,
        audit: primaryAudit, // pass-through: overallScore, categoryScores, issues, metaTags, headings, technical, links, images, accessibility
      },
      summary, // site summary item if the actor returned one, else null
      checks: deriveChecks(primary.audit, primary.title), // convenience: titleLength / hasMetaDescription / overallScore / hasSchema / hasH1
    });
  } catch (e) {
    console.error("run-seo-scan error:", e);
    return json({ ok: false, error: "internal_error", detail: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
