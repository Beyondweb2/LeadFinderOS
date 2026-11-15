// THE WEBSITE CHECK BENCH'S MODEL DOOR (2026-11-15, docs/WEBSITE_CHECK_ACCURACY.md).
//
// The bench (scripts/website-check-bench/) runs the real crawl on a laptop, where there is no OpenAI key. This function asks
// the service-review question for it, with a model the bench names, so models can be compared on the same inputs and the
// key never leaves Supabase.
//
// ⛔ INTERNAL ONLY: the shared CRON_SECRET (isInternalCall), never a browser. ⛔ NARROW: it sends only the service-review
// system prompt (SERVICE_REVIEW_PROMPT, the crawl's own copy) — a request with any other system message is refused, so this is
// not a general model proxy. Every call's spend is logged (api_usage_log, openai_bench).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isInternalCall } from "../_shared/access.ts";
import { logOpenAiUsage } from "../_shared/openai-usage.ts";
import { SERVICE_REVIEW_PROMPT } from "../_shared/service-review.ts";

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });
const MODEL_NAME = /^(gpt-[a-z0-9.-]{1,30}|o[0-9][a-z0-9.-]{0,20})$/;
const MAX_USER_CHARS = 60_000;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "post_only" }, 405);
  if (!isInternalCall(req)) return json({ ok: false, error: "internal_only" }, 403);
  const key = Deno.env.get("OPENAI_API_KEY") ?? "";
  if (!key) return json({ ok: false, error: "no_key" }, 503);
  const body = await req.json().catch(() => ({}));

  if (body?.action === "models") {
    const r = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` } });
    const j = await r.json().catch(() => ({}));
    const ids = ((j?.data ?? []) as Array<{ id?: string }>).map((m) => String(m.id ?? "")).filter((id) => MODEL_NAME.test(id)).sort();
    return json({ ok: r.ok, ids });
  }

  if (body?.action === "review") {
    const model = String(body?.model ?? "");
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    if (!MODEL_NAME.test(model)) return json({ ok: false, error: "bad_model" }, 400);
    if (messages.length !== 2 || messages[0]?.role !== "system" || messages[0]?.content !== SERVICE_REVIEW_PROMPT
      || messages[1]?.role !== "user" || typeof messages[1]?.content !== "string" || messages[1].content.length > MAX_USER_CHARS) {
      return json({ ok: false, error: "service_review_only" }, 400);
    }
    /* Reasoning models take no temperature; they get the least reasoning that still answers. */
    const reasoning = /^(o[0-9]|gpt-5)/.test(model);
    const t0 = Date.now();
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, messages, response_format: { type: "json_object" },
        ...(reasoning ? { reasoning_effort: typeof body?.reasoning_effort === "string" ? body.reasoning_effort : "low" } : { temperature: 0 }),
      }),
    });
    const j = await r.json().catch(() => ({}));
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    await logOpenAiUsage(service, {
      functionName: "website-check-bench", apiType: "openai_bench", model, triggerSource: "internal",
      promptTokens: Number(j?.usage?.prompt_tokens ?? 0), completionTokens: Number(j?.usage?.completion_tokens ?? 0),
    });
    return json({ ok: r.ok, status: r.status, ms: Date.now() - t0, answer: r.ok ? j : null, error: r.ok ? null : j?.error?.message ?? null });
  }

  return json({ ok: false, error: "unknown_action" }, 400);
});
