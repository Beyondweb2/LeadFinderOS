// render-audit-report — PUBLIC (no-auth) server-rendered AI-visibility audit report page.
//
// Given ?slug=<slug>, it resolves the mapping row in business_reports, loads that audit's latest
// run + queue rows with the SERVICE ROLE (ai_audit_runs is owner-only RLS — anon can't read it),
// and renders the report LIVE via the SHARED report logic:
//   ai_audit_queue rows + run → buildReportData()  (src/lib/auditReport.ts, the Stage-1 module)
//                             → renderReportHtml()  (src/lib/aiAuditReportHtml.ts, the pure renderer)
// Returns the COMPLETE self-contained HTML document directly (NOT via functions/r/[slug].ts, which
// would double-wrap it). Rendering live means the page always reflects the newest report logic.
//
// Reuses the SAME TS the SPA uses (single source of truth) by importing src/lib across the repo —
// those modules are pure (no React/DOM), so Deno runs them (proven by `deno check`).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildReportData, type QueueRow, type RunRow } from "../../../src/lib/auditReport.ts";
import { isAggregatorUrl } from "../_shared/aggregators.ts";
import { renderReportHtml } from "../../../src/lib/aiAuditReportHtml.ts";

// The public origin the clean URL will live at (Stage 3 can front this fn at /a/<slug>); used for
// the report's canonical "View online" footer link.
const SITE_ORIGIN = "https://yoursites.uk";

function htmlResponse(html: string, status = 200): Response {
  // Return the HTML as a STRING body (Deno encodes string bodies as UTF-8) with an explicit
  // text/html; charset=utf-8 header. IMPORTANT: a Uint8Array / TextEncoder().encode() body made the
  // Supabase edge runtime serve the response as `text/plain` (dropping our content-type), so the
  // browser Latin-1-decoded the correct UTF-8 bytes -> mojibake on every non-ASCII char (accents,
  // em/en-dashes) in the DYNAMIC data. A string body lets the content-type stick; bytes stay UTF-8.
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Short cache: the page renders live, but a few minutes of CDN/edge caching is fine.
      "cache-control": status === 200 ? "public, max-age=120" : "public, max-age=0, must-revalidate",
    },
  });
}

/** Minimal, crawlable, noindex fallback for a missing / not-yet-ready report. */
function unavailable(msg: string): Response {
  return htmlResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>Report unavailable</title>` +
    `<meta name="robots" content="noindex"></head>` +
    `<body style="font-family:system-ui,sans-serif;max-width:640px;margin:80px auto;padding:0 20px;color:#0f172a">` +
    `<h1>Report unavailable</h1><p>${msg}</p></body></html>`,
    404,
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Link-unfurlers / crawlers that fetch the URL without a human opening it — WhatsApp + Meta
// preview it the moment the pitch sends, so counting them would inflate every "opened" to 1
// instantly. Case-insensitive substring match on the User-Agent. Residual imprecision accepted.
const BOT_UA_RE = /facebookexternalhit|whatsapp|telegrambot|slackbot|bot|crawler|preview|spider/i;

/** Record a genuine human open against the AUDIT (stable /a/<auditId> identity, survives re-runs):
 *  first_opened_at set once, open_count incremented atomically via the bump_audit_open() RPC.
 *  NEVER throws and NEVER blocks rendering — a bot UA, a missing migration (RPC 404 until the SQL
 *  is run), or any DB error is swallowed. Fire-and-forget from the render path. */
// deno-lint-ignore no-explicit-any
async function recordAuditOpen(service: any, auditId: string, userAgent: string): Promise<void> {
  try {
    if (BOT_UA_RE.test(userAgent)) return;                 // preview/crawler fetch — not a human open
    const { error } = await service.rpc("bump_audit_open", { p_audit_id: auditId });
    if (error) console.warn("[render-audit-report] open-tracking skipped:", error.message);
  } catch (e) {
    console.warn("[render-audit-report] open-tracking error (non-fatal):", e instanceof Error ? e.message : e);
  }
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    // Accept ?slug=… or a trailing path segment (…/render-audit-report/<slug>).
    const slug = (url.searchParams.get("slug") || url.pathname.split("/").filter(Boolean).pop() || "").trim();
    if (!slug) return unavailable("No report specified.");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // 1) Resolve the audit id. A UUID path segment IS the audit id — the report is built LIVE from
    //    the linked audit, no stored business_reports row required (this is what the Inbox report
    //    pill uses: /a/<auditId>). A non-UUID slug is a published business_reports mapping row
    //    (backward compat for older published reports + the audit_reply link's slug).
    let auditId: string;
    if (UUID_RE.test(slug)) {
      auditId = slug;
    } else {
      const { data: rep } = await service
        .from("business_reports")
        .select("audit_id, status")
        .eq("slug", slug).eq("status", "published").maybeSingle();
      if (!rep || !rep.audit_id) return unavailable("This report doesn’t exist or isn’t published.");
      auditId = rep.audit_id as string;
    }

    // 2) audit_id → ai_audits (business context for the report copy).
    const { data: audit } = await service
      .from("ai_audits")
      .select("id, business_name, business_type, location_text, specialism, website")
      .eq("id", auditId).maybeSingle();
    if (!audit) return unavailable("Audit not found.");

    // 3) latest run for the audit.
    const { data: run } = await service
      .from("ai_audit_runs")
      .select("id, audit_id, run_number, status, mention_rate, results")
      .eq("audit_id", audit.id).order("run_number", { ascending: false }).limit(1).maybeSingle();
    if (!run) return unavailable("No audit run yet for this business.");

    // 4) the run's queue rows (the per-question engine data buildReportData folds).
    const { data: qrows } = await service
      .from("ai_audit_queue")
      .select("id, question, status, result")
      .eq("run_id", run.id).order("created_at", { ascending: true });
    const queueRows = (qrows ?? []) as QueueRow[];

    // 5) build the report data with the SHARED logic (identical to the in-app report), then render.
    const data = buildReportData(queueRows, run as RunRow, {
      businessName: audit.business_name ?? "",
      businessType: audit.business_type ?? "",
      locationText: audit.location_text ?? "",
      specialisms: audit.specialism ?? "",
      isAggregatorUrl,
      ownWebsite: audit.website ?? "",
    });
    if (!data) return unavailable("This audit hasn’t completed yet — check back shortly.");

    data.shareUrl = `${SITE_ORIGIN}/a/${slug}`; // canonical public URL → "View online" footer
    // Genuine render succeeded → record the open (non-bot only). Awaited but fully guarded, so a
    // tracking failure can never break the report the visitor came for.
    await recordAuditOpen(service, audit.id, req.headers.get("user-agent") ?? "");
    return htmlResponse(renderReportHtml(data));
  } catch (e) {
    console.error("[render-audit-report] error:", e instanceof Error ? e.message : e);
    return unavailable("Something went wrong rendering this report.");
  }
});
