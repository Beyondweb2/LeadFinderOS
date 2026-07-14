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
// The wizard lets the caller pick how many questions to generate. Range 6..12,
// default 8. Always clamped server-side (the count is untrusted client input).
const MIN_QUESTION_COUNT = 6;
const MAX_QUESTION_COUNT = 12;
const DEFAULT_QUESTION_COUNT = 8;

/** Clamp an untrusted question-count to 6..12, defaulting to 8. */
function clampCount(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : DEFAULT_QUESTION_COUNT;
  return Math.min(MAX_QUESTION_COUNT, Math.max(MIN_QUESTION_COUNT, v));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Country / region / remote tokens that mark a business as NATIONAL scope. Mirrors the
// classification the OpenAI prompt is told to do, so the deterministic fallback produces
// the right SHAPE of questions too.
const NATIONAL_LOC_TERMS = new Set([
  "uk", "u.k.", "united kingdom", "great britain", "britain", "gb", "england", "scotland",
  "wales", "northern ireland", "ireland", "eire", "republic of ireland",
  "usa", "u.s.a.", "us", "u.s.", "united states", "united states of america", "america",
  "canada", "australia", "new zealand", "nz", "thailand",
  "nationwide", "national", "online", "remote", "everywhere", "anywhere",
]);
// Location tokens that are national but NOT a usable country/region qualifier for a phrase.
const NON_GEO_NATIONAL = new Set(["nationwide", "national", "online", "remote", "everywhere", "anywhere"]);

/** True when the business serves a whole country/region or works remotely (NATIONAL scope),
 *  vs a specific town/city (LOCAL). Empty location → treated as national. */
function isNationalScope(loc: string, specialisms: string): boolean {
  const l = loc.trim().toLowerCase();
  if (!l || l === "the local area") return true;                       // no town given → national
  if (NATIONAL_LOC_TERMS.has(l)) return true;                          // location IS a country/region/"online"
  if (/\b(nationwide|national|online|remote|whole of|across the|no physical office|serves? clients nationally)\b/.test(l)) return true;
  if (/\b(nationwide|national|remote|online|no physical office|clients? (?:across|nationally))\b/.test(specialisms.toLowerCase())) return true;
  return false;
}

/** Deterministic template questions — the fallback when OpenAI is unavailable or returns
 *  something that doesn't validate. Scope-aware: LOCAL uses "[service] in [town]" plus a
 *  single "near me"; NATIONAL uses audience-qualified "[service] for [audience] [country]"
 *  with NO "near me" and NO broad best/top head-terms. Grounded in "known for" when given.
 *  Sliced to `count`. */
function fallbackQuestions(type: string, loc: string, hasWebsite: boolean, specialisms: string, count: number): string[] {
  const t = type || "business";
  const niches = specialisms
    ? specialisms.split(/[,;/]|\band\b/i).map((x) => x.trim().toLowerCase()).filter((x) => x.length > 1)
    : [];

  let base: string[];
  if (isNationalScope(loc, specialisms)) {
    const l = loc.trim().toLowerCase();
    // Use the real country/region from the location when it is one; else default to "uk".
    const region = l && NATIONAL_LOC_TERMS.has(l) && !NON_GEO_NATIONAL.has(l) ? ` ${l}` : " uk";
    base = [
      ...niches.map((nk) => `${nk} ${t}${region}`),                    // niche-grounded, national
      `${t} for small businesses${region}`,
      `${t} for startups${region}`,
      `specialist ${t}${region}`,
      `${t} for sole traders${region}`,
      `${t} for limited companies${region}`,
      `remote ${t}${region}`,
      `${t} for contractors${region}`,
      `${t} for ecommerce businesses${region}`,
      `${t} for landlords${region}`,
      `${t} for charities${region}`,
      `${t} for freelancers${region}`,
      `${t} for property investors${region}`,
    ];
  } else {
    const where = loc ? ` in ${loc}` : "";
    base = [
      ...niches.map((nk) => `${nk} ${t}${where}`),                     // niche-grounded, local
      `best ${t}${where}`,
      `top rated ${t}${where}`,
      `which ${t}${where} do people recommend`,
      hasWebsite ? `${t}${where} with online booking` : `${t}${where} that is easy to contact`,
      `${t} near me${loc ? ` (${loc})` : ""}`,                         // the single allowed near-me
      `affordable ${t}${where}`,
      `${t}${where} with great reviews`,
      `where to find a good ${t}${where}`,
      `most popular ${t}${where}`,
      `highly rated ${t}${where}`,
    ];
  }

  // De-dupe (a niche can echo a template) and slice to the requested count.
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of base) {
    const k = q.trim();
    if (k && !seen.has(k)) { seen.add(k); out.push(k); }
  }
  return out.slice(0, Math.min(out.length, Math.max(1, count)));
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
    // How many questions to generate (6..12, default 8). Also the cap for an edited
    // list the client submits, so a user who picked 12 can enqueue 12.
    const questionCount = clampCount(body.question_count ?? body.questionCount);
    const MAX_QUESTIONS = MAX_QUESTION_COUNT;
    const providedQuestions: string[] | null = Array.isArray(body.questions)
      ? body.questions.filter((s: unknown) => typeof s === "string" && s.trim()).map((s: string) => s.trim()).slice(0, MAX_QUESTIONS)
      : null;
    // Optional free-text specialisms ("kava, pool tables"). Weights the niche/differentiator
    // questions; blank → the generator infers the specialism from the name + type.
    const specialisms: string = typeof body.specialisms === "string" ? body.specialisms.trim().slice(0, 200) : "";
    // Explicit client-engagement scope from the wizard. Only the three known values are stored;
    // anything else (incl. absent) → null, so the downstream heuristic still applies.
    const VALID_SCOPES = new Set(["national", "local", "hybrid"]);
    const businessScope: string | null = typeof body.business_scope === "string" && VALID_SCOPES.has(body.business_scope)
      ? body.business_scope : null;

    if (!businessName && !reuseAuditId) return json({ ok: false, error: "business_name required" }, 400);

    const estCost = SOURCES.ai_search.estCostUsd;
    const estimate = (n: number) => Number((n * AUDIT_ENGINES.length * estCost).toFixed(4));

    // Preview: return questions + cost estimate only (no DB writes).
    if (preview) {
      const qs = providedQuestions && providedQuestions.length
        ? providedQuestions
        : await generateQuestions(businessName, businessType, locationText, hasWebsite, specialisms, questionCount);
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
      if (questions.length < MIN_QUESTION_COUNT) {
        questions = await generateQuestions(audit.business_name ?? "", audit.business_type ?? "", audit.location_text ?? "", audit.has_website === true, specialisms, questionCount);
      }
    } else {
      // New audit: use the edited questions if provided, else generate them.
      questions = providedQuestions && providedQuestions.length
        ? providedQuestions
        : await generateQuestions(businessName, businessType, locationText, hasWebsite, specialisms, questionCount);
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
          specialism: specialisms || null,
          business_scope: businessScope,
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
 * Generate `count` audit questions via OpenAI (gpt-4o-mini, tool-calling). `count` is
 * clamped to 6..12 (default 8). Model output is untrusted — validated to at least
 * `count` non-empty strings then sliced to exactly `count`; ANY failure (config,
 * network, non-OK, parse, validation) falls back to the deterministic template set so
 * the audit always has questions.
 */
async function generateQuestions(
  businessName: string,
  businessType: string,
  locationText: string,
  hasWebsite: boolean,
  specialisms: string,
  count: number,
): Promise<string[]> {
  const n = clampCount(count);
  const fallback = fallbackQuestions(businessType, locationText, hasWebsite, specialisms, n);
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

  const systemPrompt = `You generate the exact search phrases a REAL PERSON would type into an AI assistant (ChatGPT, Gemini) to find a business like this one. Output nothing but the phrases, via the return_questions tool.

Business name: ${name}
Business type: ${type}
Location as given: ${loc}

${specialismLine}

STEP 1 — CLASSIFY THE SCOPE (decide this first, silently, from the location and "known for"):
- NATIONAL if the location names a country, nation, or large region (e.g. "UK", "United Kingdom", "England", "Britain", "Scotland", "Wales", "Ireland", "USA", "Australia"), OR is empty / says "nationwide" / "national" / "online" / "remote", OR the "known for" text says the business serves clients nationally, works remotely, or has no physical office.
- LOCAL if the location names a specific town, city, or local area (e.g. "Leeds", "Chiang Mai", "Camden").

STEP 2 — GENERATE under the matching rule set.

RULES THAT ALWAYS APPLY (both scopes):
- EXACTLY ONE intent per question. Never combine two services or needs. No "and" joining two things (NOT "tax returns and payroll", NOT "bar with kava and pool").
- Natural phrasing a real person would type or ask an AI — short, terse, plain lowercase.
- Ground EVERY question in the business's ACTUAL services and the "known for" field. NEVER invent a service it doesn't offer.
- SPREAD the questions across the business's main services / niches — no near-duplicates.
- Do NOT include the business's own name or any brand name (the customer is trying to DISCOVER it). No quotes.

IF LOCAL:
- Local framing is good: "[service] in ${loc}".
- Broad head-terms are allowed here (a small local pool is winnable): e.g. "best [service] in ${loc}", "top [service] in ${loc}".
- At most ONE "near me" question in total.

IF NATIONAL:
- NEVER use "near me".
- NEVER use broad head-terms like "best [service] in [country]", "top [service] in [country]", or "leading [service] in [country]". These are dominated by directories and comparison sites, are unwinnable for a single firm, and prove nothing — do not produce any.
- EVERY question must be a SPECIFIC service or problem, qualified by AUDIENCE and national scope. Use the pattern "[specific service] for [audience] [country]" or "[niche] [service] [country]" — e.g. "[service] for small businesses uk", "[niche] [service] uk". Use the real country/region from the location; if the location gives no country, use "uk". Prioritise the differentiators / niches in the "known for" field.

Return EXACTLY ${n} questions (lowercase), spread across the business's services/niches under the matching rule set. ${framing}

Return via the return_questions tool.`;

  const userPrompt = `Business name: ${name}\nBusiness type: ${type}\nLocation as given: ${loc}\nHas website: ${hasWebsite ? "yes" : "no"}${specialisms ? `\nKnown for: ${specialisms}` : ""}\n\nFirst classify this business as NATIONAL or LOCAL from the location, then generate ${n} short, single-intent search phrases under the matching rules — one intent each, grounded in its real services, no "and", no invented services.`;

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
            description: `Return exactly ${n} customer search questions`,
            parameters: {
              type: "object",
              properties: {
                questions: { type: "array", items: { type: "string" }, minItems: n, maxItems: n },
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
    return cleaned.length >= n ? cleaned.slice(0, n) : fallback;
  } catch (_e) {
    return fallback;
  }
}
