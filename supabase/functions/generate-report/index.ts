import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logOpenAiUsage } from "../_shared/openai-usage.ts";

// generate-report — admin-triggered. Reads a business's audit + linked-lead data, has OpenAI
// (DIRECT api.openai.com, gpt-4o, tool-calling) write an AI-search-optimised, HONEST business
// profile, and inserts a PUBLISHED business_reports row served at yoursites.uk/r/<slug> by
// functions/r/[slug].ts. Auth + service client mirror scrape-directory; the LLM call mirrors
// generate-playbook (direct OpenAI, NOT the Lovable gateway). No fabricated claims — the prompt
// binds the model to the supplied data only.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODEL = "gpt-4o";

// deno-lint-ignore no-explicit-any
type Row = any;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** business name → clean lowercase-hyphenated slug (mirrors generate-barber-site.slugify).
 *  Uniqueness is enforced by business_reports.slug UNIQUE; the caller appends -2, -3 … on conflict. */
function slugify(name: string, fallback = "business"): string {
  return (
    (name || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/, "") || fallback
  );
}

const REPORT_TOOL = {
  type: "function",
  function: {
    name: "return_report",
    description: "Return the AI-search-optimised business profile report for this one business.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "SEO page title: business name + what they do + scope/location (~60 chars)." },
        metaDescription: { type: "string", description: "Factual meta description, 150-160 characters, no hype." },
        htmlContent: { type: "string", description: "Report body as clean SEMANTIC HTML (h2/h3/p/ul/li). NO inline styles, NO html/head/body/script tags." },
        jsonLd: { type: "string", description: "Valid JSON-LD string (JSON.parse-able): an Article about this business PLUS the business as Organization/most-specific relevant type, with REAL name/address/phone/url/services from the data only." },
      },
      required: ["title", "metaDescription", "htmlContent", "jsonLd"],
      additionalProperties: false,
    },
  },
};

const SYSTEM_PROMPT = `You are an expert business-profile writer producing an editorial-quality profile of ONE business, optimised to be CITED by AI search engines (chatgpt, gemini, google ai overview) when people ask about businesses like this one. The result is published as a polished web page, so write with the depth and clarity of a good trade-magazine business profile — richer WRITING, never invented FACTS.

THE HONESTY RULE (never break it):
- Use ONLY facts present in the provided data. NEVER invent reviews, ratings, star scores, client numbers, years in business, awards, testimonials, prices, guarantees, or ANY claim not in the data. If the data is thin, write a shorter, honest profile — depth of PROSE is allowed and encouraged; fabricated FACTS are not. When unsure whether something is supported, leave it out.

VOICE & STYLE:
- ANSWER-FIRST and useful. Lead each section with what a prospective customer actually needs to know, then explain. Substantive full sentences and short paragraphs — not thin bullet stubs, not marketing fluff, no empty superlatives.
- British English. Write engine / software brand names in lowercase where natural (chatgpt, gemini, xero); keep proper business names, professional bodies (ICAEW, ACCA, CIPP, …) and place names in their normal form.

STRUCTURE htmlContent with clear H2 sections using semantic tags (<h2>, plus <h3>/<p>/<ul>/<li>), in this order where the data supports it:
  1. Overview — open with a substantial 2-3 sentence introduction: who the business is, what they do, who they serve, and how they operate (scope/location). Make it read as a genuine opening paragraph, not a label.
  2. Credentials & regulation — place this EARLY as a prominent trust signal. Surface any professional qualifications, chartered/registered status, professional-body memberships, regulation, or accreditation PRESENT IN THE DATA (e.g. ICAEW/ACCA membership, chartered status, a listing category that implies a regulated profession). IMPORTANT: when the data includes a "Professional credentials/regulation" line, you MUST surface it prominently and EARLY — weave it into the opening Overview AND give it its own "Credentials & Regulation" section — because a regulated/chartered status is usually the business's single strongest trust signal for AI answers. State ONLY what the credentials data literally says — do not embellish, upgrade, or infer credentials beyond the exact wording provided (e.g. don't turn "ACCA member" into "award-winning"). If the data shows no credentials at all, OMIT this section entirely rather than implying qualifications.
  3. Services — for each service, write a sentence of real explanation of what it involves and who it helps, not just a bare list. Group with <h3>/<p> or an annotated <ul> where that reads better. Include operator-confirmed prices only if given in the data.
  4. Who they're best for — be specific and grounded in the data (business type, specialism, scope, the buyer questions provided). Describe the customer this business genuinely fits.
  5. How they work — only if the data supports it: describe delivery model (e.g. remote / UK-wide / cloud-based / local in-person), tools, or process implied by the data. Omit if unsupported.
  6. FAQ — 5-6 real, useful question-and-answer pairs a prospective customer would ask, grounded in the data and shaped by the buyer questions provided. Answer-first: open each answer with the direct answer, then a sentence of detail. Never invent specifics (prices, turnaround, guarantees) to answer — if the data doesn't support a precise answer, answer at the level the data allows.
OMIT any section you have no data for — never fabricate to fill it.

OUTPUT FORMAT:
- htmlContent = clean SEMANTIC HTML only (<h2>/<h3>/<p>/<ul>/<li>/<strong>). NO inline styles, NO class attributes, NO <html>/<head>/<body> tags, NO <script>, NO images — the page template supplies all layout, typography, and imagery.
- title = an SEO title: business name + what they do + scope/location (~60 chars).
- metaDescription = 150-160 characters, factual, no hype.
- jsonLd = a VALID JSON-LD string that JSON.parse succeeds on: an Article (about this business) PLUS the business as an Organization (or the most specific relevant @type) carrying the REAL name / address / telephone / url / services from the data. Include only fields the data supports; omit unknown fields rather than guessing.

Return everything via the return_report tool — output nothing outside the tool.`;

/** Build a null-safe plain-text data summary from the audit + latest-run results + linked lead.
 *  Only includes facts that actually exist — the model is told to use ONLY what's here. */
function composeDataSummary(audit: Row, results: Row, lead: Row | null): string {
  const lines: string[] = [];
  const push = (label: string, val: unknown) => { const s = str(val); if (s) lines.push(`${label}: ${s}`); };

  lines.push("BUSINESS DATA (use ONLY these facts — invent nothing not listed here):");
  push("Business name", audit.business_name);
  push("Type / vertical", audit.business_type);
  push("Specialism / known for", audit.specialism);
  // Professional credentials / regulation (e.g. "ACCA regulated, Chartered Tax Adviser") — often the
  // strongest trust signal. Only present when the operator filled the ai_audits.credentials field.
  push("Professional credentials/regulation", audit.credentials);
  push("Engagement scope", audit.business_scope); // national | local | hybrid
  push("Location", audit.location_text);
  push("Country", audit.country);
  push("Website", audit.website ?? lead?.website);
  push("Phone", audit.business_phone ?? lead?.phone);
  push("Address", audit.business_address ?? lead?.address);
  push("Email", audit.business_email ?? lead?.email);
  push("Google Maps", lead?.google_maps_url);
  push("Listing category", lead?.category);

  // Services — prefer operator-confirmed (with prices), else the plain list.
  const confirmed = Array.isArray(lead?.confirmed_services) ? lead!.confirmed_services : [];
  if (confirmed.length) {
    const svc = confirmed
      .map((s: Row) => { const n = str(s?.name); const p = str(s?.price); return n ? (p ? `${n} (${p})` : n) : ""; })
      .filter(Boolean);
    if (svc.length) lines.push(`Services (operator-confirmed): ${svc.join(", ")}`);
  } else if (Array.isArray(lead?.services_included) && lead!.services_included.length) {
    const svc = (lead!.services_included as unknown[]).map(str).filter(Boolean);
    if (svc.length) lines.push(`Services: ${svc.join(", ")}`);
  }

  // AI-visibility results (optional) — mention rate + the real buyer questions tested (useful
  // for grounding the FAQ / "who they're best for" sections). Competitor names are deliberately
  // NOT fed in: this is a profile of THIS business, not a comparison.
  const summary = results?.summary && typeof results.summary === "object" ? results.summary as Row : null;
  if (summary) {
    const named = typeof summary.named_datapoints === "number" ? summary.named_datapoints : null;
    const total = typeof summary.total_datapoints === "number" ? summary.total_datapoints : null;
    const rate = typeof summary.mention_rate === "number" ? summary.mention_rate : null;
    if (total && total > 0) {
      lines.push(`AI visibility: currently named in ${named ?? 0} of ${total} AI answers tested${rate != null ? ` (${Math.round(rate * 100)}% mention rate)` : ""}.`);
    }
  }
  const questions = Array.isArray(results?.questions) ? results.questions : [];
  if (questions.length) {
    const asked = questions.map((q: Row) => str(q?.question)).filter(Boolean).slice(0, 12);
    if (asked.length) lines.push(`Buyer questions customers ask AI (use to shape services/FAQ): ${asked.join("; ")}.`);
  }

  // SEO grade (optional).
  const seo = results?.seo && typeof results.seo === "object" ? results.seo as Row : null;
  if (seo && str(seo.overallGrade)) {
    lines.push(`Website SEO grade: ${str(seo.overallGrade)}.`);
  }

  lines.push("");
  lines.push("Write the profile from ONLY the facts above. Where a fact is absent, leave it out — never guess or embellish.");
  return lines.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    // --- Auth: a trusted INTERNAL call (the auto-report trigger in process-ai-audit-queue) OR an
    //     authenticated ADMIN user. Internal branch mirrors extract-competitors: a matching CRON_SECRET
    //     header + x-internal-job, OR the service-role key + x-internal-job. Purely ADDITIVE — an
    //     external caller can hold neither, so the admin-JWT path is byte-for-byte unchanged. ---
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const isInternal =
      (!!cronSecret && req.headers.get("x-cron-secret") === cronSecret && !!req.headers.get("x-internal-job")) ||
      (!!serviceKey && token === serviceKey && !!req.headers.get("x-internal-job"));
    if (!isInternal) {
      if (!token) return json({ ok: false, error: "unauthorized" }, 401);
      const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
      const { data: u } = await userClient.auth.getUser();
      if (!u?.user) return json({ ok: false, error: "unauthorized" }, 401);
      const { data: roleRow } = await service
        .from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
      if (!roleRow) return json({ ok: false, error: "forbidden" }, 403);
    }

    // --- Body ---
    const body = await req.json().catch(() => ({}));
    const auditId: string = typeof body.auditId === "string" ? body.auditId.trim() : "";
    if (!auditId) return json({ ok: false, error: "auditId required" }, 400);

    // --- Load the audit (business context). ---
    const { data: audit } = await service
      .from("ai_audits")
      .select("id, lead_id, business_name, business_type, location_text, country, has_website, website, business_scope, specialism, credentials, business_phone, business_address, business_email, is_market")
      .eq("id", auditId).maybeSingle();
    if (!audit) return json({ ok: false, error: "audit_not_found" }, 404);
    /* ⛔ MARKET AUDITS HAVE NO CLIENT REPORT. Belt-and-braces behind the auto-report guard in
       process-ai-audit-queue: this function is also reachable by hand and from the operator UI, and
       a report titled "[market] locksmiths · Hastings" must be impossible from every direction.
       Reads the column, never the name. */
    if ((audit as { is_market?: boolean }).is_market === true) {
      console.log(`[generate-report] REFUSED for market audit ${auditId}: no business attached.`);
      return json({ ok: false, error: "market_audit_has_no_report" }, 400);
    }

    // --- Latest run for this audit → results (AI-visibility questions + SEO). Optional. ---
    const { data: latestRun } = await service
      .from("ai_audit_runs").select("results, mention_rate, status, run_number")
      .eq("audit_id", auditId).order("run_number", { ascending: false }).limit(1).maybeSingle();
    const results = latestRun?.results && typeof latestRun.results === "object" ? latestRun.results as Row : {};

    // --- Linked lead (services + contact), if the audit is tied to one. Optional. ---
    let lead: Row | null = null;
    if (audit.lead_id) {
      const { data: l } = await service
        .from("outreach_leads")
        .select("services_included, confirmed_services, website, phone, email, address, category, google_maps_url")
        .eq("id", audit.lead_id).maybeSingle();
      lead = l ?? null;
    }

    const dataSummary = composeDataSummary(audit, results, lead);

    // --- LLM: DIRECT to OpenAI (gpt-4o, tool-calling). NOT the Lovable gateway. ---
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) return json({ ok: false, error: "openai_not_configured" }, 500);

    let raw: string | undefined;
    let usageIn = 0, usageOut = 0;
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0.3,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: dataSummary },
          ],
          tools: [REPORT_TOOL],
          tool_choice: { type: "function", function: { name: "return_report" } },
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        return json({ ok: false, error: `openai_http_${res.status}`, detail: txt.slice(0, 300) }, 502);
      }
      const data = await res.json();
      raw = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      const u = data.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
      usageIn = Number(u?.prompt_tokens) || 0;
      usageOut = Number(u?.completion_tokens) || 0;
    } catch (e) {
      return json({ ok: false, error: "openai_request_failed", detail: e instanceof Error ? e.message : String(e) }, 502);
    }

    /* Record the gpt-4o spend (change 3, 2026-09-16): auto-report is the biggest automatic OpenAI
       caller after the cleaner and logged nothing. Non-blocking. */
    await logOpenAiUsage(service, {
      functionName: "generate-report", apiType: "openai_generate_report", model: MODEL,
      promptTokens: usageIn, completionTokens: usageOut, calls: 1,
      triggerSource: isInternal ? "auto" : "admin",
    });
    if (typeof raw !== "string") return json({ ok: false, error: "model_no_tool_output" }, 422);
    let report: Row;
    try { report = JSON.parse(raw); } catch { return json({ ok: false, error: "model_bad_json" }, 422); }

    const title = str(report.title);
    const metaDescription = str(report.metaDescription);
    const htmlContent = str(report.htmlContent);
    const jsonLd = str(report.jsonLd);
    if (!title || !htmlContent) return json({ ok: false, error: "model_incomplete_report" }, 422);

    // --- Insert business_reports with a unique slug (dedupe via UNIQUE + -N retry on 23505). ---
    const businessName = str(audit.business_name) || "This business";
    const baseSlug = slugify(businessName);

    let saved: { id: string; slug: string } | null = null;
    let insertError: { code?: string; message?: string } | null = null;
    let slug = baseSlug;
    for (let attempt = 1; attempt <= 50; attempt++) {
      slug = attempt === 1 ? baseSlug : `${baseSlug}-${attempt}`;
      const res = await service.from("business_reports").insert({
        slug,
        business_name: businessName,
        lead_id: audit.lead_id ?? null,
        audit_id: auditId,
        title,
        meta_description: metaDescription || null,
        html_content: htmlContent,
        json_ld: jsonLd || null,
        status: "published",
      }).select("id, slug").single();
      if (!res.error) { saved = res.data as { id: string; slug: string }; insertError = null; break; }
      insertError = res.error;
      if (res.error.code !== "23505") break; // not a slug clash → stop (real error)
    }
    if (!saved) return json({ ok: false, error: "store_failed", detail: insertError?.message ?? "insert_failed" }, 500);

    return json({ ok: true, slug: saved.slug, url: `https://yoursites.uk/r/${saved.slug}`, reportId: saved.id });
  } catch (e) {
    console.error("generate-report error:", e);
    return json({ ok: false, error: "internal_error", detail: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
