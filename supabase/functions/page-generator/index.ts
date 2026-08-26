import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildPagePlan, stuffingCheck, enforceNaturalness, MAX_TOWN_MENTIONS, MAX_SERVICE_PHRASE_REPEATS, MAX_SINGLE_WORD_PCT, type PagePlan, type PlannedPage, type StuffingVerdict } from "../../../src/lib/pagePlan.ts";

// page-generator — service-plus-town delivery pages, from the OVERLAP of the client's
// questionnaire (services_list x areas_list) and their baseline audit's exact measured queries.
// Built 2026-08-19, Paul's spec. Output is PASTE-READY per page; nothing publishes anywhere.
//
// Actions (operator JWT only):
//   clients            -> the leads that have a paid baseline (the only clients this can serve)
//   plan {lead_id}     -> inputs + the page plan, inclusions AND exclusions itemised
//   generate {lead_id, page_key} -> ONE page via gpt-4o, anti-stuffing checked server-side
//
// ⛔ THE BASELINE QUESTIONS ARE READ FROM THE LATEST baseline_target_runs RUNS ONLY. Ronnie's
// baseline audit carries his replaced wrong-category locksmith runs; the latest-runs rule drops
// them, and buildPagePlan's overlap is the second guard (no matching service -> no page).
//
// ⚠️ OpenAI can be out of credits (it is, at build time): generation returns the typed
// "no_credits" the page renders as a friendly banner. Works when topped up, no redeploy.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const MODEL = "gpt-4o";

interface OnboardingRow {
  lead_id: string; created_at: string;
  services_list: string[] | null; areas_list: string[] | null; confirmed_location: string | null;
  website_platform: string | null; accreditations: string | null; must_not_say: string | null;
}

const PAGE_TOOL = {
  type: "function",
  function: {
    name: "return_page",
    description: "Return the finished page as structured parts.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Title tag, <= 60 chars, natural — service and town without stuffing." },
        meta_description: { type: "string", description: "Meta description, 120-155 chars, plain and specific." },
        h1: { type: "string", description: "The page H1 — service and town phrased the way a person would say it." },
        body_html: { type: "string", description: "The page body as clean semantic HTML: h2, p, ul/li, strong only. NO h1, NO inline styles, NO scripts. 350-500 words." },
      },
      required: ["title", "meta_description", "h1", "body_html"],
      additionalProperties: false,
    },
  },
};

function systemPrompt(mustNotSay: string, town: string): string {
  return `You write ONE service-plus-town page for a small UK trade business's own website. The page
exists so AI assistants (ChatGPT, Gemini) that read the site can learn this business does THIS
service in ${town}. You return ONLY structured parts via the return_page tool.

STYLE — this is the part that matters most. The page must read like the owner wrote it on a good
day: plain, warm, specific, useful. The FAILURE MODE you must avoid is the keyword-stuffed doorway
page: the town hammered into every sentence, the service repeated like a chant, interchangeable
template copy. Pages exactly like that were REMOVED from a client's site because they read as spam
and AI refused to cite them.

HARD RULES:
- UK English. 350-500 words in body_html. Clean HTML only: h2, p, ul/li, strong.
- Name the town "${town}" AT MOST TWICE in the whole body. Everywhere else say "here", "locally",
  "the area" or "in the area" — do NOT keep writing the town name.
- Use the SERVICE phrase about ONCE. Do NOT repeat the service phrase, and do NOT repeat its core
  keywords over and over — vary the language the way a person would (say it a different way, use
  the specific thing being done, or just "the work" / "the job"). The page must never read like a
  keyword list. Aim for keyword density comfortably UNDER 3%.
- ⛔ WRITE ONLY ABOUT ${town}. Do NOT name, list or mention ANY other town, city, village or area —
  not even to say the business "also covers" them. This page is about ${town} and nothing else.
- NEVER promise outcomes: no "you'll rank", no "AI will recommend you", no "guaranteed".
- INVENT NOTHING: no prices, no response times, no opening hours, no years-in-business, no reviews,
  no testimonials, no certifications beyond the accreditations given, and NO local landmarks, street
  names or area facts you were not given. If a fact was not given, do not state it.
- Do not fabricate phone numbers, emails or forms — refer to "get in touch" generically; the
  business's own site template carries the real contact details.
- Structure FREELY — do NOT reuse the same section shape or headings every time. A short opening,
  then 2-3 h2 sections a customer would actually want (what happens when you call someone out, what
  it typically involves, why people use a nearby firm), optionally ONE short ul. Vary the headings
  and their order. End with a low-key invitation to get in touch.
${mustNotSay ? `- THE CLIENT'S OWN HARD RULE — things this business must NEVER claim or imply: "${mustNotSay}". Respect this absolutely.` : ""}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ ok: false, error: "unauthorized" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ ok: false, error: "unauthorized" }, 401);
    const userId = u.user.id;

    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "";

    /* ── THE CLIENTS: leads with a paid baseline, owned by the caller. ─────────────────────── */
    const { data: baselines } = await service
      .from("ai_audits")
      .select("id, lead_id, business_name, business_type, baseline_target_runs, created_at")
      .gt("baseline_target_runs", 1)
      .not("lead_id", "is", null)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    const baselineAudits = (baselines ?? []) as Array<{
      id: string; lead_id: string; business_name: string; business_type: string | null;
      baseline_target_runs: number; created_at: string;
    }>;

    if (action === "clients") {
      /* Newest baseline per lead. */
      const seen = new Set<string>();
      const clients = baselineAudits.filter((a) => {
        if (seen.has(a.lead_id)) return false;
        seen.add(a.lead_id);
        return true;
      }).map((a) => ({ lead_id: a.lead_id, business_name: a.business_name, baseline_at: a.created_at }));
      return json({ ok: true, clients });
    }

    const leadId = typeof body.lead_id === "string" ? body.lead_id.trim() : "";
    if (!leadId) return json({ ok: false, error: "lead_id required" }, 400);
    const audit = baselineAudits.find((a) => a.lead_id === leadId);
    if (!audit) return json({ ok: false, error: "no_baseline_for_lead" }, 404);

    /* ── INPUT 1: the newest questionnaire row. ────────────────────────────────────────────── */
    const { data: obRow } = await service
      .from("onboarding_responses")
      .select("lead_id, created_at, services_list, areas_list, confirmed_location, website_platform, accreditations, must_not_say")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const ob = obRow as OnboardingRow | null;
    if (!ob) return json({ ok: false, error: "no_questionnaire_for_lead" }, 404);
    const services = Array.isArray(ob.services_list) ? ob.services_list : [];
    const areas = Array.isArray(ob.areas_list) ? ob.areas_list : [];
    const homeTown = (ob.confirmed_location ?? "").trim();
    if (services.length === 0 || !homeTown) {
      return json({ ok: false, error: "questionnaire_incomplete", detail: "services_list or confirmed_location missing" }, 422);
    }

    /* ── INPUT 2: the baseline questions — LATEST baseline_target_runs runs only. ──────────── */
    const { data: runs } = await service
      .from("ai_audit_runs")
      .select("id, created_at")
      .eq("audit_id", audit.id)
      .in("status", ["complete", "capped"])
      .order("created_at", { ascending: false })
      .limit(audit.baseline_target_runs);
    const runIds = (runs ?? []).map((r) => String((r as { id: string }).id));
    if (runIds.length === 0) return json({ ok: false, error: "baseline_has_no_complete_runs" }, 422);
    const { data: qRows } = await service
      .from("ai_audit_queue")
      .select("question")
      .in("run_id", runIds)
      .order("created_at", { ascending: true });
    const questions = [...new Set((qRows ?? []).map((r) => String((r as { question: string }).question ?? "").trim()).filter(Boolean))];

    const plan: PagePlan = buildPagePlan({ services, areas, homeTown, questions });

    if (action === "plan") {
      return json({
        ok: true,
        client: { lead_id: leadId, business_name: audit.business_name, trade: audit.business_type },
        inputs: {
          services, areas, homeTown,
          accreditations: ob.accreditations, mustNotSay: ob.must_not_say,
          hostingDefault: ob.website_platform,           // null today for both clients — the dropdown decides
          questionnaireAt: ob.created_at,
          baselineAuditId: audit.id, baselineRuns: runIds.length, questionCount: questions.length,
        },
        plan,
      });
    }

    if (action !== "generate") return json({ ok: false, error: `unknown action "${action}"` }, 400);

    /* ── GENERATE ONE PAGE. The pair is re-derived server-side: a page_key not in the freshly
       computed plan is refused — the client never dictates a pair the overlap did not produce. ── */
    const pageKey = typeof body.page_key === "string" ? body.page_key : "";
    const page: PlannedPage | undefined = plan.pages.find((p) => p.key === pageKey);
    if (!page) return json({ ok: false, error: "page_not_in_plan" }, 400);

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) return json({ ok: false, error: "openai_not_configured" }, 500);

    /* The home town is DELIBERATELY not named in the prompt: on a page for a DIFFERENT town, "based
       in {homeTown}" would name another town and contaminate the controlled experiment. The backstop
       also strips it (homeTown is in otherTowns below). The business reads as "a local firm serving
       {town}" without naming where it is based. */
    const userPrompt = (feedback?: string) =>
`Business: ${audit.business_name}${audit.business_type ? ` (${audit.business_type})` : ""}. A local firm serving ${page.town} and the surrounding area.
Write the page for: ${page.service} — ${page.town}.
The exact search queries this page must genuinely answer (a reader asking these should find this page useful):
${page.queries.map((q) => `- ${q}`).join("\n")}
Other services this business offers (CONTEXT ONLY — do not list them and do not turn them into their own pages): ${services.filter((s) => s !== page.service).join(", ") || "(none listed)"}.
Accreditations you may state (ONLY these): ${ob.accreditations || "(none — state none)"}.
${feedback ? `\n${feedback}` : ""}
Return via return_page.`;

    const callOpenAI = async (prompt: string) => {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0.6,
          messages: [
            { role: "system", content: systemPrompt((ob.must_not_say ?? "").trim(), page.town) },
            { role: "user", content: prompt },
          ],
          tools: [PAGE_TOOL],
          tool_choice: { type: "function", function: { name: "return_page" } },
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        const quota = res.status === 429 || /insufficient_quota|credit_balance_exhausted|no credits/i.test(txt);
        if (quota) return { kind: "no_credits" as const };
        return { kind: "error" as const, error: `openai_http_${res.status}`, detail: txt.slice(0, 200) };
      }
      const data = await res.json();
      const raw = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (typeof raw !== "string") return { kind: "error" as const, error: "model_no_tool_output" };
      try {
        const p = JSON.parse(raw) as { title?: unknown; meta_description?: unknown; h1?: unknown; body_html?: unknown };
        const title = typeof p.title === "string" ? p.title.trim() : "";
        const meta = typeof p.meta_description === "string" ? p.meta_description.trim() : "";
        const h1 = typeof p.h1 === "string" ? p.h1.trim() : "";
        const bodyHtml = typeof p.body_html === "string" ? p.body_html.trim() : "";
        if (!title || !h1 || !bodyHtml) return { kind: "error" as const, error: "model_incomplete_page" };
        return { kind: "page" as const, title, meta, h1, bodyHtml };
      } catch {
        return { kind: "error" as const, error: "model_bad_json" };
      }
    };

    let out = await callOpenAI(userPrompt());
    if (out.kind === "no_credits") return json({ ok: false, error: "no_credits" }, 200);
    if (out.kind === "error") return json({ ok: false, error: out.error, detail: (out as { detail?: string }).detail }, 502);

    /* Escalating strictness on failure — up to 3 attempts, each with genuinely stricter instructions.
       Keep the FIRST that PASSES; else keep the draft CLOSEST to passing (lowest stuffScore), so a
       mid-loop error never leaves us with a worse draft than one we already had. */
    const stuffScore = (c: StuffingVerdict): number =>
      Math.max(0, c.townCount - MAX_TOWN_MENTIONS)
      + Math.max(0, c.phraseCount - MAX_SERVICE_PHRASE_REPEATS)
      + Math.max(0, c.topWordPct - MAX_SINGLE_WORD_PCT);
    const strictFeedback = (c: StuffingVerdict, level: number): string => {
      const rules = [
        `name the town "${page.town}" at most TWICE — say "here"/"locally"/"the area" everywhere else`,
        `never repeat the exact phrase "${page.service}"; use it once at most and vary the wording elsewhere`,
        `do not lean on any single word — vary your vocabulary so nothing is hammered`,
        `do NOT name any other town, city or area`,
      ];
      if (level >= 2) rules.push(`name the town "${page.town}" only ONCE, and use the phrase "${page.service}" only ONCE in the whole page`);
      return `YOUR PREVIOUS DRAFT READ AS KEYWORD-STUFFED (${c.detail}). Rewrite it to read like a human wrote it:\n- ${rules.join("\n- ")}`;
    };

    let check = stuffingCheck(`${out.h1} ${out.bodyHtml}`, page.service, page.town);
    let best = { out, check };
    let attempts = 1;
    while (check.verdict === "stuffed" && attempts < 3) {
      const retry = await callOpenAI(userPrompt(strictFeedback(check, attempts)));
      attempts++;
      if (retry.kind !== "page") break; // no_credits / error mid-loop → stop, use best so far
      const rc = stuffingCheck(`${retry.h1} ${retry.bodyHtml}`, page.service, page.town);
      if (stuffScore(rc) < stuffScore(best.check)) best = { out: retry, check: rc };
      out = retry; check = rc;
      if (rc.verdict === "ok") { best = { out: retry, check: rc }; break; }
    }
    out = best.out;

    /* ⛔ MECHANICAL BACKSTOP — the page handed over is GUARANTEED under the town cap and to name NO
       other towns. Regeneration above does the natural writing (and, with the fixed metric, natural
       copy passes on its own); this only guarantees the town count and no-other-towns. */
    const otherTowns = [homeTown, ...areas].filter((a) => a && a.toLowerCase() !== page.town.toLowerCase());
    const enforced = enforceNaturalness(out.bodyHtml, page.service, page.town, otherTowns, out.h1);

    return json({
      ok: true,
      page: {
        key: page.key, service: page.service, town: page.town, queries: page.queries, slug: page.slug,
        title: out.title, meta_description: out.meta, h1: out.h1, body_html: enforced.html,
      },
      naturalness: {
        ...enforced.check, attempts, regenerated: attempts > 1,
        mechanicallyEnforced: enforced.townTrimmed || enforced.otherTownsStripped,
      },
    });
  } catch (e) {
    console.error("[page-generator] error:", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "unknown_error" }, 500);
  }
});
