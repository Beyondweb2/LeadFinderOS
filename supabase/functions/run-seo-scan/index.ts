import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isAggregatorUrl } from "../_shared/aggregators.ts";
import { runSeoScanCore } from "../_shared/enrichment/seo-scan-core.ts";

// run-seo-scan — run the Apify actor smart-digital/complete-seo-audit-tool for an audit's
// website, MAP its 9-category output into the report's existing AiAuditSeo shape (3 grades),
// store the full scan detail alongside for the in-depth view, and write it to
// ai_audit_runs.results.seo. Replaces the manual apply-seo-paste path (same {runId} contract,
// same storage location + AiAuditSeo shape → the report renders identically).
//
// The deterministic scan+map core lives in _shared/enrichment/seo-scan-core.ts so the queue
// (process-ai-audit-queue) can call the exact same logic. This function owns ONLY auth, loading
// the run+audit, and persisting the result. Auth mirrors apply-seo-paste (verify_jwt=false +
// Bearer getUser + run ownership). Mapping is DETERMINISTIC in code — no LLM.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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

    const apifyToken = Deno.env.get("APIFY_TOKEN") ?? "";
    if (!apifyToken) return json({ ok: false, error: "apify_not_configured" }, 500);

    // --- Run the shared scan+map core (actor → AiAuditSeo). DB write stays here. ---
    const r = await runSeoScanCore(String(audit.website), { token: apifyToken });
    if (!r.ok) return json(r, 502);

    // --- Store (merge, mirrors apply-seo-paste / maybeRunSeoStep) ---
    const { data: fresh } = await service.from("ai_audit_runs").select("results").eq("id", runId).maybeSingle();
    const cur = fresh?.results && typeof fresh.results === "object" ? fresh.results as Record<string, unknown> : {};
    const { error: upErr } = await service.from("ai_audit_runs").update({ results: { ...cur, seo: r.seo } }).eq("id", runId);
    if (upErr) return json({ ok: false, error: "store_failed", detail: upErr.message }, 500);

    return json({ ok: true, seo: r.seo });
  } catch (e) {
    console.error("run-seo-scan error:", e);
    return json({ ok: false, error: "internal_error", detail: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
