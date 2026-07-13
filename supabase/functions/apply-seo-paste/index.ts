import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// apply-seo-paste — turn a pasted SEOptimer (or similar) report into the AI Visibility
// report's SEO section. The operator pastes the raw report text for a website audit; we
// call OpenAI (structured tool-call) to EXTRACT + GRADE it against a pinned rubric, then
// validate strictly and store the result at ai_audit_runs.results.seo. The report already
// renders this shape (AiAuditSeo) — this function only produces + stores the data.
//
// Grading is deterministic-by-code: the model returns per-category SCORES (0–100) + lead
// findings + raw baseline; the SERVER recomputes every letter grade and the weighted
// overallGrade from the pinned thresholds/weights, so the rubric is enforced in code, not
// just prompted. Malformed/partial model output is rejected — we never store garbage.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Accuracy matters (client-facing grade) → use a more capable model than gpt-4o-mini.
const MODEL = "gpt-4o";
const MAX_PASTE_CHARS = 24_000; // bound token cost; a SEOptimer report is well under this

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

/* ── Pinned rubric (thresholds + weights enforced in code) ────────────────────── */
const GRADE_WEIGHTS = { onPage: 0.30, localPresence: 0.50, contentTechnical: 0.20 };
/** Letter grade from a 0–100 score. Pinned thresholds — applied to each category AND overall. */
function letter(score: number): string {
  const s = Math.max(0, Math.min(100, Math.round(score)));
  return s >= 95 ? "A+" : s >= 85 ? "A" : s >= 70 ? "B" : s >= 55 ? "C" : s >= 40 ? "D" : "F";
}

/* ── AiAuditSeo shape (mirrors src/lib/aiAuditReportHtml.ts — the canonical type; the edge
 *    runtime can't import from src/, so it's duplicated here for validation). ───────────── */
interface SeoCat { grade: string; score: number }
interface Finding { title: string; detail: string; severity: "high" | "med" | "low" }
interface AiAuditSeo {
  overallGrade: string;
  categories: { onPage: SeoCat; localPresence: SeoCat; contentTechnical: SeoCat };
  leadFindings: Finding[];
  baseline?: Record<string, unknown>;
}

const SEVERITIES = new Set(["high", "med", "low"]);
function isNum(v: unknown): v is number { return typeof v === "number" && Number.isFinite(v); }
function clampScore(v: unknown): number { return Math.max(0, Math.min(100, Math.round(Number(v)))); }

/**
 * Validate the model's tool output and normalise into a clean AiAuditSeo. Scores are the
 * source of truth: every letter grade + the weighted overall are RECOMPUTED here so the
 * pinned rubric holds regardless of what letters the model emitted. Returns an error string
 * (never a partial object) if the required numeric/shape contract isn't met.
 */
function buildValidatedSeo(raw: unknown): { ok: true; seo: AiAuditSeo } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "not_an_object" };
  const o = raw as Record<string, unknown>;

  const cats = o.categories as Record<string, unknown> | undefined;
  if (!cats || typeof cats !== "object") return { ok: false, error: "missing_categories" };
  const keys = ["onPage", "localPresence", "contentTechnical"] as const;
  const scores: Record<string, number> = {};
  for (const k of keys) {
    const c = cats[k] as Record<string, unknown> | undefined;
    if (!c || typeof c !== "object" || !isNum(c.score)) return { ok: false, error: `missing_score_${k}` };
    scores[k] = clampScore(c.score);
  }

  const rawFindings = Array.isArray(o.leadFindings) ? o.leadFindings : [];
  const leadFindings: Finding[] = rawFindings
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    .map((f) => ({
      title: typeof f.title === "string" ? f.title.trim() : "",
      detail: typeof f.detail === "string" ? f.detail.trim() : "",
      severity: (SEVERITIES.has(f.severity as string) ? f.severity : "med") as Finding["severity"],
    }))
    .filter((f) => f.title && f.detail)
    .slice(0, 5);
  if (leadFindings.length < 1) return { ok: false, error: "no_valid_findings" };

  const baseline = (o.baseline && typeof o.baseline === "object" && !Array.isArray(o.baseline))
    ? (o.baseline as Record<string, unknown>)
    : undefined;

  // Deterministic grading: letters from scores, overall from the weighted average.
  const overallScore = Math.round(
    scores.onPage * GRADE_WEIGHTS.onPage +
    scores.localPresence * GRADE_WEIGHTS.localPresence +
    scores.contentTechnical * GRADE_WEIGHTS.contentTechnical,
  );
  const seo: AiAuditSeo = {
    overallGrade: letter(overallScore),
    categories: {
      onPage: { grade: letter(scores.onPage), score: scores.onPage },
      localPresence: { grade: letter(scores.localPresence), score: scores.localPresence },
      contentTechnical: { grade: letter(scores.contentTechnical), score: scores.contentTechnical },
    },
    leadFindings,
    ...(baseline ? { baseline } : {}),
  };

  // Final belt-and-braces: must satisfy the report's isRenderableSeo guard.
  const c = seo.categories;
  if (!c.onPage || !c.localPresence || !c.contentTechnical) return { ok: false, error: "guard_failed" };
  return { ok: true, seo };
}

const SYSTEM_PROMPT =
`You extract and GRADE a website's SEO from a pasted SEO report (e.g. SEOptimer), for a
client-facing "AI Visibility" audit. You return ONLY structured data via the return_seo
tool — no prose.

The report you output feeds three grade circles, a radar, and a short findings list. Be
accurate and honest: this grade is shown to a real business.

════════ SCORING RUBRIC (follow EXACTLY) ════════
Give each category a SCORE 0–100. Start each at 100 and DEDUCT for each failing/weak signal
below. (Letter grades and the overall are computed downstream from your scores — you still
return grades, but the scores are what matter, so make them faithful.)

1) ON-PAGE (weight 30%). Signals:
   - Title tag present AND good length (~50–60 chars). Missing/too-short/generic → deduct hard.
   - Meta description present (and not empty). Missing → deduct.
   - Exactly ONE H1. None or multiple → deduct.
   - Image ALT coverage (share of images with alt text). Low coverage → deduct.
   - Content volume — thin content (<400 words) → deduct.
   - Keyword distribution / relevance in headings + body. Weak → deduct.

2) LOCAL / ENTITY PRESENCE (weight 50% — the heaviest). Signals:
   - NAP: business address AND phone present on the site.
   - LocalBusiness schema (JSON-LD).
   - Organization / identity schema (who this entity is).
   - Presence on directories / listings / citations.
   - Google Business Profile (GBP) presence.
   A firm missing ALL of these must score near 0 (grade F). That is CORRECT, not harsh —
   it means AI and search can't establish who or where the business is.

3) CONTENT & TECHNICAL (weight 20%). TRADITIONAL technical health only:
   - SSL/HTTPS, robots.txt, XML sitemap, canonical tag (the passing basics LIFT this score).
   - Mobile performance (PageSpeed / LCP).
   - Analytics installed.
   - JS errors.
   Keep this SEPARATE from AI-readability — do not let identity/schema gaps drag this down.

════════ EXTRACTION RULES ════════
- Pull only MEANINGFUL signals. IGNORE noise entirely — it must NOT affect any score:
  backlinks (often spam), DMARC/SPF, Facebook Pixel, AMP, Flash, inline styles.
- SEPARATELY capture (for findings + baseline, NOT the technical score): LLM/AI readability
  or rendered-without-JS percentage, and identity/organization schema presence. These drive
  the AI-visibility findings.
- If a signal isn't mentioned in the paste, treat it as ABSENT (don't invent a pass).

════════ LEAD FINDINGS (3–5, client-facing) ════════
Plain English, confident, no jargon, no filler. Order by impact:
  1st: what makes the business INVISIBLE TO AI (no identity schema, low render %, listed
       nowhere) — these come first.
  then: core on-page gaps (missing meta/H1, weak title, thin content).
Each finding: a short punchy "title", a one-line "detail", and severity "high" | "med" | "low".

════════ CALIBRATION ANCHOR ════════
For a firm like ABLM Associates with equivalent signals, the correct output is:
  overall C; onPage ~D (score ~38); localPresence ~F (score ~8); contentTechnical ~B (score ~76);
  findings such as:
    - high  "AI can't read your site" — only ~1% loads without scripts, and there's no identity schema
    - high  "You're placed nowhere" — no address/phone or business schema, and you're not on directories
    - med   "Core basics missing" — no meta description, no H1, a generic 22-character title
    - low   "Social links point to Wix, not you"
Match THAT quality and calibration for equivalent input.

════════ BASELINE ════════
Also return "baseline": the raw extracted signals you scored from (NOT shown to the client),
e.g. { titleLength, metaDescription (bool), h1 (bool), imageAltCoverage, wordCount,
addressPhoneOnSite (bool), localBusinessSchema (bool), identitySchema (bool),
llmReadabilityPct, mobileLcpSec, listingsCount }. Include whatever you could extract.

Return via the return_seo tool.`;

const SEO_TOOL = {
  type: "function",
  function: {
    name: "return_seo",
    description: "Return the extracted + graded SEO for the report (AiAuditSeo shape).",
    parameters: {
      type: "object",
      properties: {
        overallGrade: { type: "string", description: "A+, A, B, C, D or F" },
        categories: {
          type: "object",
          properties: {
            onPage: { type: "object", properties: { grade: { type: "string" }, score: { type: "number" } }, required: ["grade", "score"], additionalProperties: false },
            localPresence: { type: "object", properties: { grade: { type: "string" }, score: { type: "number" } }, required: ["grade", "score"], additionalProperties: false },
            contentTechnical: { type: "object", properties: { grade: { type: "string" }, score: { type: "number" } }, required: ["grade", "score"], additionalProperties: false },
          },
          required: ["onPage", "localPresence", "contentTechnical"],
          additionalProperties: false,
        },
        leadFindings: {
          type: "array",
          minItems: 3,
          maxItems: 5,
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              detail: { type: "string" },
              severity: { type: "string", enum: ["high", "med", "low"] },
            },
            required: ["title", "detail", "severity"],
            additionalProperties: false,
          },
        },
        baseline: { type: "object", description: "Raw extracted signals (not shown to client)." },
      },
      required: ["overallGrade", "categories", "leadFindings", "baseline"],
      additionalProperties: false,
    },
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    // --- Auth: any authenticated user (the run must belong to them). ---
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
    const pastedText: string = typeof body.pastedText === "string" ? body.pastedText : "";
    if (!runId) return json({ ok: false, error: "runId required" }, 400);
    if (pastedText.trim().length < 20) return json({ ok: false, error: "paste_too_short" }, 400);

    // Load the run + ownership-check.
    const { data: run } = await service
      .from("ai_audit_runs").select("id, audit_id, user_id, results").eq("id", runId).maybeSingle();
    if (!run) return json({ ok: false, error: "run_not_found" }, 404);
    if (run.user_id !== userId) return json({ ok: false, error: "forbidden" }, 403);

    // Load the audit for context + the website gate (SEO is website-only).
    const { data: audit } = await service
      .from("ai_audits").select("business_name, has_website, website, location_text").eq("id", run.audit_id).maybeSingle();
    if (!audit) return json({ ok: false, error: "audit_not_found" }, 404);
    if (!audit.has_website || !audit.website) return json({ ok: false, error: "no_website" }, 400);

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) return json({ ok: false, error: "openai_not_configured" }, 500);

    const userPrompt =
`Business: ${audit.business_name || "the business"}
Website: ${audit.website}
Location: ${audit.location_text || "(not given)"}

Pasted SEO report text:
"""
${pastedText.slice(0, MAX_PASTE_CHARS)}
"""

Extract + grade per the rubric. Return via return_seo.`;

    let raw: string | undefined;
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0, // deterministic — same paste → same grade
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          tools: [SEO_TOOL],
          tool_choice: { type: "function", function: { name: "return_seo" } },
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        return json({ ok: false, error: `openai_http_${res.status}`, detail: txt.slice(0, 300) }, 502);
      }
      const data = await res.json();
      raw = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    } catch (e) {
      return json({ ok: false, error: "openai_request_failed", detail: e instanceof Error ? e.message : String(e) }, 502);
    }

    if (typeof raw !== "string") return json({ ok: false, error: "model_no_tool_output" }, 422);
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { return json({ ok: false, error: "model_bad_json" }, 422); }

    const validated = buildValidatedSeo(parsed);
    if (!validated.ok) return json({ ok: false, error: `invalid_seo:${validated.error}` }, 422);

    // Store at results.seo. Read-modify-write MERGE (re-read immediately before write) so
    // the SEO block merges with summary/questions rather than clobbering them. (jsonb_set
    // proper would need a DB RPC/migration — out of scope; this matches maybeRunSeoStep.)
    const { data: fresh } = await service.from("ai_audit_runs").select("results").eq("id", runId).maybeSingle();
    const cur = fresh?.results && typeof fresh.results === "object" ? fresh.results as Record<string, unknown> : {};
    const { error: upErr } = await service
      .from("ai_audit_runs").update({ results: { ...cur, seo: validated.seo } }).eq("id", runId);
    if (upErr) return json({ ok: false, error: "store_failed", detail: upErr.message }, 500);

    return json({ ok: true, seo: validated.seo });
  } catch (e) {
    console.error("[apply-seo-paste] error:", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "unknown_error" }, 500);
  }
});
