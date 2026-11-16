// COVERAGE TOWNS (Paul, 2026-11-16, leftovers item 5). Rule and prompt: src/lib/coverageTowns.ts.
//
// Prepare baseline's "Expand into towns": the client's "area they cover" in their own words → the real towns / boroughs
// inside it, as a SUGGESTION Paul edits into "Service areas" before anything is written or run.
// ⛔ ADMIN ONLY (requireAdmin). ⛔ Reads nothing about a client and writes nothing but the spend row (api_usage_log):
//    the screen sends the words, this returns a list. Never messages anyone.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { refusalBody, requireAdmin } from "../_shared/access.ts";
import { logOpenAiUsage } from "../_shared/openai-usage.ts";
import { COVERAGE_MODEL, COVERAGE_SYSTEM_PROMPT, COVERAGE_TEXT_MAX, coverageUserPrompt, parseCoverageTowns } from "../../../src/lib/coverageTowns.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "post_only" }, 405);
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
  const gate = await requireAdmin(req, service);
  if (!gate.ok) return json(refusalBody(gate), gate.status);
  const body = await req.json().catch(() => ({}));
  const coverage = String(body?.coverage_area ?? "").trim();
  if (coverage.length < 3) return json({ ok: false, error: "coverage_missing", detail: "Type the area they cover first." }, 400);
  if (coverage.length > COVERAGE_TEXT_MAX) return json({ ok: false, error: "coverage_too_long", detail: `Keep the area under ${COVERAGE_TEXT_MAX} characters.` }, 400);
  const key = Deno.env.get("OPENAI_API_KEY") ?? "";
  if (!key) return json({ ok: false, error: "openai_not_configured" }, 503);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", signal: controller.signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: COVERAGE_MODEL, temperature: 0, response_format: { type: "json_object" },
        messages: [
          { role: "system", content: COVERAGE_SYSTEM_PROMPT },
          { role: "user", content: coverageUserPrompt({ coverage, primaryTown: String(body?.primary_town ?? "") || null, country: String(body?.country ?? "") || null, trade: String(body?.trade ?? "") || null }) },
        ],
      }),
    });
    const j = await r.json().catch(() => ({}));
    await logOpenAiUsage(service, {
      functionName: "coverage-towns", apiType: "openai_coverage_towns", model: COVERAGE_MODEL, triggerSource: "admin", userId: gate.actor.id,
      promptTokens: Number(j?.usage?.prompt_tokens ?? 0), completionTokens: Number(j?.usage?.completion_tokens ?? 0),
    });
    if (!r.ok) return json({ ok: false, error: "ai_unavailable", detail: "The AI could not answer just now. Try again, or type the towns yourself." }, 502);
    const out = parseCoverageTowns(j?.choices?.[0]?.message?.content ?? "");
    return json({ ok: true, ...out });
  } catch (e) {
    console.error("[coverage-towns]", e instanceof Error ? e.message : String(e));
    return json({ ok: false, error: "ai_unavailable", detail: "The AI could not answer just now. Try again, or type the towns yourself." }, 502);
  } finally {
    clearTimeout(timer);
  }
});
