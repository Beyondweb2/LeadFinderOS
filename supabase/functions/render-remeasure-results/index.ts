/* ════════════════════════════════════════════════════════════════════════════════════════════════
   render-remeasure-results — the four-week results document, served for a client (2026-09-13).

   Public and unauthenticated, like render-audit-report, reached through the findable.live proxy
   (findable-site functions/results/[id].ts → findable.live/results/<remeasureAuditId>). The Supabase
   gateway serves this function as text/plain, so the raw URL must never be given to a human.

   ⛔ THE STAMP IS THE PUBLISH SWITCH. The document renders ONLY for a replay whose lead carries
   `remeasure_results_sent_at` — the moment the results email went. Before that, and for any audit
   that is not a pointed-at replay, it answers "not published" without echoing a number: this page
   starts a 14-day refund clock, and a client must not find it before the email that tells them so.

   Same loader as the sender (loadRemeasureBundle), so the email and the page cannot compute
   different numbers.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadRemeasureBundle } from "../_shared/remeasure-results.ts";
import { renderRemeasureResultsHtml } from "../../../src/lib/remeasureResultsHtml.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-robots-tag": "noindex, nofollow, noarchive, nosnippet",
      "cache-control": status === 200 ? "public, max-age=120" : "no-store",
    },
  });
}

function unavailable(msg: string, status = 404): Response {
  return htmlResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>Results unavailable</title>` +
    `<meta name="robots" content="noindex"></head>` +
    `<body style="font-family:system-ui,sans-serif;max-width:640px;margin:80px auto;padding:0 20px;color:#0f172a">` +
    `<h1>Results unavailable</h1><p>${msg}</p></body></html>`,
    status,
  );
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const id = (url.pathname.split("/").filter(Boolean).pop() || "").trim();
    if (!UUID_RE.test(id)) return unavailable("No results specified.");

    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const { bundle } = await loadRemeasureBundle(service, id);
    if (!bundle) return unavailable("These results are not published.");
    if (!bundle.lead.remeasure_results_sent_at) {
      console.log(`[render-remeasure-results] REFUSED ${id}: results not sent yet — the stamp is the publish switch.`);
      return unavailable("These results are not published.");
    }
    const { audit, lead, comparison, baselineRuns, replayRuns, town } = bundle;
    const html = renderRemeasureResultsHtml({
      businessName: (audit.business_name ?? lead.business_name ?? "your business").trim(),
      town,
      comparison,
      beforeDate: baselineRuns[0]?.created_at ?? null,
      afterDate: replayRuns[replayRuns.length - 1]?.created_at ?? null,
      sentAtLabel: new Date(lead.remeasure_results_sent_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
      weeks: bundle.weeks,
    });
    return htmlResponse(html, 200);
  } catch (e) {
    console.error("[render-remeasure-results] error:", e instanceof Error ? e.message : e);
    return unavailable("Something went wrong rendering these results.", 500);
  }
});
