import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SOURCES } from "../_shared/enrichment/sources.ts";

// create-ai-audit — fast, NO Apify. Generates the audit's search questions with
// OpenAI (gpt-4o-mini, tool-calling, mirrors admin-ai-opener), creates the audit +
// run + one queue row per question, and returns the questions + a cost estimate.
// The actual multi-engine SERP runs happen later in process-ai-audit-queue.
//
// user_id is set EXPLICITLY on every row (no DB default). Writes use the service key
// after the caller's JWT is verified; a provided lead_id is ownership-checked.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// The engines each question is checked against. The actor also returns AI Overview +
// Google organic in the same run; those are captured/shown but not queue engines.
// (Perplexity dropped — kept dormant in ai-search.ts in case it's re-added.)
const AUDIT_ENGINES = ["chatgpt", "gemini"];
const QUESTION_COUNT = 6;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/** Deterministic template questions — the fallback when OpenAI is unavailable or
 *  returns something that doesn't validate. Deliberately plain. */
function fallbackQuestions(type: string, loc: string, hasWebsite: boolean): string[] {
  const t = type || "business";
  const where = loc ? ` in ${loc}` : "";
  return [
    `best ${t}${where}`,
    `top rated ${t}${where}`,
    `who is the best ${t}${where} for quality`,
    `which ${t}${where} do people recommend`,
    hasWebsite ? `${t}${where} with the best website and online booking` : `${t}${where} that is easy to contact`,
    `${t} near me${loc ? ` (${loc})` : ""}`,
  ];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    // --- Auth: identify the caller from their JWT (any authenticated user). ---
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json({ ok: false, error: "unauthorized" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ ok: false, error: "unauthorized" }, 401);
    const userId = u.user.id;

    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const body = await req.json().catch(() => ({}));
    const businessName: string = typeof body.business_name === "string" ? body.business_name.trim() : "";
    const businessType: string = typeof body.business_type === "string" ? body.business_type.trim() : "";
    const locationText: string = typeof body.location_text === "string" ? body.location_text.trim() : "";
    const country: string | null = typeof body.country === "string" ? body.country : null;
    const website: string | null = typeof body.website === "string" && body.website.trim() ? body.website.trim() : null;
    const hasWebsite: boolean = body.has_website === true;
    const leadId: string | null = typeof body.lead_id === "string" && body.lead_id ? body.lead_id : null;
    // Optional: re-run an EXISTING audit (Phase 4 "re-run" hook). Reuses the audit's
    // business + its previous questions so before/after compares like-for-like.
    const reuseAuditId: string | null = typeof body.audit_id === "string" && body.audit_id ? body.audit_id : null;
    // preview: generate (or price) the questions WITHOUT creating any rows — powers the
    // wizard's editable review screen. questions[]: an explicit override (edited list)
    // used instead of generating; capped so a client can't enqueue an unbounded run.
    const preview: boolean = body.preview === true;
    const MAX_QUESTIONS = 10;
    const providedQuestions: string[] | null = Array.isArray(body.questions)
      ? body.questions.filter((s: unknown) => typeof s === "string" && s.trim()).map((s: string) => s.trim()).slice(0, MAX_QUESTIONS)
      : null;
    // Optional free-text specialisms ("kava, pool tables"). Weights the niche/differentiator
    // questions; blank → the generator infers the specialism from the name + type.
    const specialisms: string = typeof body.specialisms === "string" ? body.specialisms.trim().slice(0, 200) : "";

    if (!businessName && !reuseAuditId) return json({ ok: false, error: "business_name required" }, 400);

    const estCost = SOURCES.ai_search.estCostUsd;
    const estimate = (n: number) => Number((n * AUDIT_ENGINES.length * estCost).toFixed(4));

    // Preview: return questions + cost estimate only (no DB writes).
    if (preview) {
      const qs = providedQuestions && providedQuestions.length
        ? providedQuestions
        : await generateQuestions(businessName, businessType, locationText, hasWebsite, specialisms);
      return json({
        ok: true,
        preview: true,
        questions: qs,
        estimated_cost_usd: estimate(qs.length),
        unit_cost_usd: estCost,
        engines: AUDIT_ENGINES,
      });
    }

    // If a lead_id is provided, it MUST belong to the caller (don't let an audit attach
    // to someone else's lead).
    if (leadId) {
      const { data: lead } = await service.from("outreach_leads").select("user_id").eq("id", leadId).maybeSingle();
      if (!lead || lead.user_id !== userId) return json({ ok: false, error: "lead_not_found" }, 403);
    }

    // ── Resolve the audit row + the question set ──────────────────────────────
    let auditId: string;
    let auditBusinessName = businessName;
    let questions: string[] = [];

    if (reuseAuditId) {
      // Re-run: load + ownership-check the existing audit, reuse its questions.
      const { data: audit } = await service
        .from("ai_audits")
        .select("id, user_id, business_name, business_type, location_text, country, has_website")
        .eq("id", reuseAuditId)
        .maybeSingle();
      if (!audit || audit.user_id !== userId) return json({ ok: false, error: "audit_not_found" }, 403);
      auditId = audit.id;
      auditBusinessName = audit.business_name;
      // Reuse the questions from the audit's latest run (like-for-like re-run).
      const { data: latestRun } = await service
        .from("ai_audit_runs").select("id").eq("audit_id", auditId)
        .order("run_number", { ascending: false }).limit(1).maybeSingle();
      if (latestRun) {
        const { data: prevQ } = await service
          .from("ai_audit_queue").select("question").eq("run_id", latestRun.id).order("created_at", { ascending: true });
        const seen = new Set<string>();
        for (const r of prevQ ?? []) {
          const q = String(r.question ?? "").trim();
          if (q && !seen.has(q)) { seen.add(q); questions.push(q); }
        }
      }
      if (questions.length < QUESTION_COUNT) {
        questions = await generateQuestions(audit.business_name ?? "", audit.business_type ?? "", audit.location_text ?? "", audit.has_website === true, specialisms);
      }
    } else {
      // New audit: use the edited questions if provided, else generate them.
      questions = providedQuestions && providedQuestions.length
        ? providedQuestions
        : await generateQuestions(businessName, businessType, locationText, hasWebsite, specialisms);
      const { data: audit, error: insErr } = await service
        .from("ai_audits")
        .insert({
          user_id: userId,
          lead_id: leadId,
          business_name: businessName,
          business_type: businessType || null,
          location_text: locationText || null,
          country,
          has_website: hasWebsite,
          website,
        })
        .select("id, business_name")
        .single();
      if (insErr || !audit) return json({ ok: false, error: insErr?.message ?? "audit_insert_failed" }, 500);
      auditId = audit.id;
      auditBusinessName = audit.business_name;
    }

    // ── Create the run (run_number = max existing + 1, default 1) ──────────────
    const { data: lastRun } = await service
      .from("ai_audit_runs").select("run_number").eq("audit_id", auditId)
      .order("run_number", { ascending: false }).limit(1).maybeSingle();
    const runNumber = (lastRun?.run_number ?? 0) + 1;

    const { data: run, error: runErr } = await service
      .from("ai_audit_runs")
      .insert({ audit_id: auditId, user_id: userId, run_number: runNumber, status: "pending", results: {} })
      .select("id")
      .single();
    if (runErr || !run) return json({ ok: false, error: runErr?.message ?? "run_insert_failed" }, 500);
    const runId = run.id;

    // ── Enqueue one row per question ──────────────────────────────────────────
    const queueRows = questions.map((q) => ({
      audit_id: auditId,
      run_id: runId,
      user_id: userId,
      question: q,
      engines: AUDIT_ENGINES,
      status: "pending",
    }));
    const { error: qErr } = await service.from("ai_audit_queue").insert(queueRows);
    if (qErr) return json({ ok: false, error: qErr.message }, 500);

    return json({
      ok: true,
      audit_id: auditId,
      run_id: runId,
      run_number: runNumber,
      business_name: auditBusinessName,
      questions,
      // Estimate: question_count × engines × per-question source cost (see sources.ts).
      estimated_cost_usd: estimate(questions.length),
      unit_cost_usd: estCost,
      engines: AUDIT_ENGINES,
    });
  } catch (e) {
    console.error("[create-ai-audit] error:", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "unknown_error" }, 500);
  }
});

/**
 * Generate 6 audit questions via OpenAI (gpt-4o-mini, tool-calling). Model output is
 * untrusted — validated to exactly 6 non-empty strings; ANY failure (config, network,
 * non-OK, parse, validation) falls back to the deterministic template set so the audit
 * always has questions.
 */
async function generateQuestions(
  businessName: string,
  businessType: string,
  locationText: string,
  hasWebsite: boolean,
  specialisms: string,
): Promise<string[]> {
  const fallback = fallbackQuestions(businessType, locationText, hasWebsite).slice(0, QUESTION_COUNT);
  const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
  if (!OPENAI_API_KEY) return fallback;

  const name = businessName || "the business";
  const type = businessType || "local business";
  const loc = locationText || "the local area";
  // has_website branches the framing: website/service-page angles vs presence/directory.
  const framing = hasWebsite
    ? "The business HAS a website, so it's fine to include questions about services, service pages, online booking, or comparing providers' websites."
    : "The business has NO website, so lean on presence/discovery angles: directories, reviews, recommendations, and being found without a site.";
  // Ground the questions in the REAL specialism: use the operator's stated specialisms if
  // given, else infer it from the name + type (names often carry the whole point).
  const specialismLine = specialisms
    ? `Known for: ${specialisms}. Treat these as SEPARATE specialisms — give each its own single-intent question; NEVER combine two in one query.`
    : `No specialisms were given — INFER the single main specialism from the NAME and type. The name often carries the whole point (e.g. "X Kava Bar" → kava; "Y Vinyl Cafe" → records). Build the specialism questions around it, one intent each.`;

  const systemPrompt = `You generate the search phrases a REAL PERSON would actually type into an AI assistant (ChatGPT, Gemini) to find a ${type} in ${loc}.

Business name: ${name}
Business type: ${type}
Location: ${loc}

${specialismLine}

HOW REAL PEOPLE SEARCH — follow this exactly:
- ONE intent per question. Never combine two specialisms or features in a single query (NOT "bar with pool tables and live music", NOT "nearest bar with kava and pool").
- Short, natural, conversational — often terse/keyword-like, not full polite sentences. Prefer "best kava bar in ${loc}" or "where to play pool in ${loc}" over long multi-clause questions.
- If there are multiple specialisms, SPREAD them across separate questions — one specialism per question.

Return EXACTLY 6 questions covering this mix (lowercase is fine):
- 2 BROAD: best / top ${type} in ${loc} (e.g. "best bars in ${loc}")
- ~3 SPECIALISM: one question per specialism, single-intent, grounded in the real specialism (from the name/type or the list above). If there are fewer specialisms than slots, add another single-intent angle for the strongest one rather than combining.
- 1 NEAR-ME: a short "near me" / very local phrasing

${framing}

Rules: ONE intent per question, no combining. Questions must NOT contain the business's own name or any brand name (the customer is trying to DISCOVER it). No quotes. Do NOT invent features (live music, food, happy hour) unless clearly implied by the name/type/specialisms. Each question is one short line. Return via the return_questions tool.`;

  const userPrompt = `Business name: ${name}\nBusiness type: ${type}\nLocation: ${loc}\nHas website: ${hasWebsite ? "yes" : "no"}${specialisms ? `\nKnown for / specialisms: ${specialisms}` : ""}\n\nGenerate 6 short, single-intent search phrases — one intent each, never combine specialisms.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.7,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_questions",
            description: "Return exactly 6 customer search questions",
            parameters: {
              type: "object",
              properties: {
                questions: { type: "array", items: { type: "string" }, minItems: QUESTION_COUNT, maxItems: QUESTION_COUNT },
              },
              required: ["questions"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_questions" } },
      }),
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    const rawArgs = toolCall?.function?.arguments ?? data.choices?.[0]?.message?.content;
    if (typeof rawArgs !== "string") return fallback;
    const parsed = JSON.parse(rawArgs);
    const arr = Array.isArray(parsed?.questions) ? parsed.questions : null;
    if (!arr) return fallback;
    const cleaned = arr.filter((s: unknown) => typeof s === "string" && s.trim()).map((s: string) => s.trim());
    return cleaned.length >= QUESTION_COUNT ? cleaned.slice(0, QUESTION_COUNT) : fallback;
  } catch (_e) {
    return fallback;
  }
}
