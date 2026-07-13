import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// generate-playbook — from an audit run, produce a tailored 8-week Sprint delivery plan
// for THIS business, in ONE structured object rendered as TWO views (internal execution
// checklist + client-safe roadmap). Reads the run's AI-visibility results + results.seo
// (grades/findings/baseline/rawPaste, if present) + business context, calls OpenAI with an
// expert GEO system prompt fused with our Sprint model, validates strictly, and stores the
// result at results.playbook. Mirrors apply-seo-paste (auth, tool-calling, read-modify-write).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Capable model (this is the moat deliverable, not a cheap classify). Low temp for a stable,
// faithful plan that regenerates consistently — a touch above 0 for natural phrasing.
const MODEL = "gpt-4o";
const TEMPERATURE = 0.3;
const MAX_RAW_PASTE_CHARS = 40_000; // bound token cost when packing the stored raw paste

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
type Row = any;

// Our fixed Sprint windows — every action must map to one of these.
const WINDOWS = ["Week 0", "Weeks 1-2", "Weeks 2-4", "Week 4", "Weeks 5-8", "Week 8"] as const;
const WINDOW_SET = new Set<string>(WINDOWS);
// The three engines in scope (never Perplexity / Copilot).
const PLAYBOOK_ENGINES: { key: string; label: string }[] = [
  { key: "chatgpt", label: "ChatGPT" },
  { key: "gemini", label: "Gemini" },
  { key: "ai_overview", label: "Google AI Overview" },
];

/* ── Validated playbook shape ─────────────────────────────────────────────────── */
interface InternalAction { action: string; why: string; pillar: string; dependsOn?: string }
interface PlaybookWeek { window: string; goal: string; internalActions: InternalAction[]; clientSummary: string }
interface DirectoryRec { name: string; why: string }
interface Playbook {
  businessName: string;
  vertical: string;
  summary: string;
  weeks: PlaybookWeek[];
  quickWins: string[];
  directories: DirectoryRec[];
  timelineNote: string;
  guaranteeNote: string;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strArr = (v: unknown, cap: number): string[] =>
  (Array.isArray(v) ? v : []).map(str).filter(Boolean).slice(0, cap);

/**
 * Validate the model's tool output into a clean Playbook. Rejects (returns an error) unless
 * the core contract holds — never stores a half-built plan. Drops individual malformed
 * sub-items (bad actions/directories) rather than failing the whole plan for one bad row.
 */
function buildValidatedPlaybook(raw: unknown, fallbackName: string): { ok: true; playbook: Playbook } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") return { ok: false, error: "not_an_object" };
  const o = raw as Record<string, unknown>;

  const summary = str(o.summary);
  if (summary.length < 20) return { ok: false, error: "missing_summary" };

  const rawWeeks = Array.isArray(o.weeks) ? o.weeks : [];
  const weeks: PlaybookWeek[] = [];
  for (const w of rawWeeks) {
    if (!w || typeof w !== "object") continue;
    const ww = w as Record<string, unknown>;
    const window = str(ww.window);
    const goal = str(ww.goal);
    if (!WINDOW_SET.has(window) || !goal) continue; // must map to a real Sprint window
    const internalActions: InternalAction[] = (Array.isArray(ww.internalActions) ? ww.internalActions : [])
      .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
      .map((a) => ({ action: str(a.action), why: str(a.why), pillar: str(a.pillar), dependsOn: str(a.dependsOn) || undefined }))
      .filter((a) => a.action && a.why && a.pillar)
      .slice(0, 8);
    weeks.push({ window, goal, internalActions, clientSummary: str(ww.clientSummary) });
  }
  // Keep at most one entry per window, ordered by our Sprint sequence.
  const byWindow = new Map<string, PlaybookWeek>();
  for (const w of weeks) if (!byWindow.has(w.window)) byWindow.set(w.window, w);
  const orderedWeeks = WINDOWS.filter((win) => byWindow.has(win)).map((win) => {
    const w = byWindow.get(win)!;
    return { window: w.window, goal: w.goal, internalActions: w.internalActions, clientSummary: w.clientSummary };
  });
  if (orderedWeeks.length < 3) return { ok: false, error: "too_few_weeks" };

  const directories: DirectoryRec[] = (Array.isArray(o.directories) ? o.directories : [])
    .filter((d): d is Record<string, unknown> => !!d && typeof d === "object")
    .map((d) => ({ name: str(d.name), why: str(d.why) }))
    .filter((d) => d.name && d.why)
    .slice(0, 12);
  if (directories.length < 1) return { ok: false, error: "no_directories" };

  const quickWins = strArr(o.quickWins, 8);
  if (quickWins.length < 1) return { ok: false, error: "no_quick_wins" };

  const timelineNote = str(o.timelineNote);
  const guaranteeNote = str(o.guaranteeNote);
  if (!timelineNote || !guaranteeNote) return { ok: false, error: "missing_notes" };

  return {
    ok: true,
    playbook: {
      businessName: str(o.businessName) || fallbackName || "This business",
      vertical: str(o.vertical) || "",
      summary,
      weeks: orderedWeeks,
      quickWins,
      directories,
      timelineNote,
      guaranteeNote,
    },
  };
}

const SYSTEM_PROMPT =
`You are Findable's senior GEO (Generative Engine Optimisation) strategist. You turn an AI-
visibility audit into a tailored 8-WEEK SPRINT delivery plan for ONE specific business,
returned as ONE structured object via the return_playbook tool — no prose outside the tool.

Every plan is grounded in THIS business's real audit data. Never invent specifics; where a
detail is missing, say what to CONFIRM AT ONBOARDING instead of guessing.

════════ ENGINES IN SCOPE ════════
ChatGPT, Gemini, and Google AI Overview ONLY. NEVER mention Perplexity or Copilot.
Reference the SPECIFIC engines that did / didn't name the business, per-engine.

════════ OUR 8-WEEK SPRINT (map EVERY action to the right window) ════════
- "Week 0" — Baseline. Already done (this audit). State plainly where they stand today
  (per-engine visibility, the competitors AI named instead, SEO grade if present).
- "Weeks 1-2" — DATA LAYER: NAP consistency everywhere AI reads; Organization +
  (for local firms) LocalBusiness identity schema; review velocity switched on (ask after
  every job, never filter). Local-map listings (Google Business Profile + Bing Places +
  Apple Business Connect) LEAD here for LOCAL firms — but for NATIONAL firms they are only a
  light entity-verification step, not a lead action (see the National vs Local fork below).
- "Weeks 2-4" — CONTENT LAYER: service + area pages built from real data; FAQ pages that
  match real question phrasing (4-8 FAQs, 40-60 word answers); placement across the
  "best of" / industry directory network; front-load a direct 40-60 word answer on key pages.
- "Week 4" — Mid-scan: re-check which prompts/engines have flipped; report progress.
- "Weeks 5-8" — Iterate on what HASN'T flipped; competitor-gap actions (close the specific
  gaps vs the firms AI named); add more citations / earned mentions.
- "Week 8" — Final scan, before/after per engine, guarantee check.

════════ VERIFIED 2026 GEO METHODOLOGY (the moat — bake these in) ════════
- AI CITES, it doesn't rank. It recommends a business it can READ, VERIFY as a distinct
  entity across multiple independent sources, and TRUST.
- EARNED MEDIA beats owned: ~82% of AI citations are earned media; >80% of AI-cited pages
  don't rank in Google's top 10. The leverage is OFF-SITE — listings, directories, third-
  party mentions — not just their website.
- ENTITY / NAP consistency is foundational: presence on 4+ platforms ≈ 2.8× more likely to
  be cited; entity clarity + schema lifts small-brand appearances ~36%; schema improves LLM
  discoverability ~67% but is NOT sufficient alone.
- INDUSTRY-SPECIFIC AUTHORITY DIRECTORIES are a top lever. Identify the real ones for THIS
  vertical and prioritise tier-1 general → niche industry body → local. Examples:
  accountant → ICAEW, ACCA, Chartered Institute of Taxation, unbiased.co.uk; solicitor →
  Law Society "Find a Solicitor", SRA; dentist → GDC, BDA; plus Bing Places, Apple Business
  Connect, Yell for most UK local firms. Pick the ones that genuinely fit the business.
- FAQ SCHEMA + a front-loaded 40-60 word answer is the highest-leverage on-page add (can
  lift citations up to ~115% for lower-ranked domains).
- COMMUNITY: niche, buyer-intent forum/Reddit threads help AI Overview + ChatGPT (via Bing),
  but for commercial / high-intent queries, category-specific proof (specialist directories,
  niche reviews, vendor pages) beats broad Reddit. Recommend GENUINE niche participation,
  never spam.
- PROPRIETARY DATA / CASE STUDIES are citation magnets — use their real track record (years
  in business, client outcomes) as unique content nobody else has.
- FRESHNESS matters (a ~3-month citation cliff) — content is a living asset, not one-and-done.
- ENGINES DISAGREE and visibility is UNSTABLE: overlap between engines is low and 40-60% of
  cited sources change month to month. Frame visibility HONESTLY, per engine, and set a
  realistic re-audit window (~4-8 weeks; ChatGPT lags, Gemini / AI Overview move faster).

════════ WEBSITE FORK (critical) ════════
- If the business HAS NO website: produce NO on-site actions — no meta/H1/on-site schema,
  no page builds on their site. Focus entirely on Google Business Profile, listings /
  directories, reviews, community, and pages hosted on OUR infrastructure + the directory
  network. Say plainly that a site (or our hosted pages) is where owned content will live.
- If the business HAS a website: include BOTH on-site (schema, FAQ pages, front-loaded
  answers, service/area pages) AND off-site (listings, directories, earned mentions).

════════ NATIONAL vs LOCAL FORK (critical — get the weighting right) ════════
First decide whether this business is NATIONAL or LOCAL:
- NATIONAL / no walk-in premises if the location is a country/region ("UK", "United Kingdom",
  "England", "nationwide", "online", "remote") OR the type implies clients served across the
  country with no physical footfall (e.g. a chartered accountancy / law / consultancy firm
  serving clients UK-wide). ABLM-type firms are NATIONAL.
- LOCAL if the location is a specific town/city AND the business has physical premises /
  walk-in trade (barber, dentist, café, garage, restaurant).

If NATIONAL:
- DE-PRIORITISE local map listings. Google Business Profile, Bing Places and Apple Business
  Connect are ONLY a light one-off entity-verification step in the Data Layer — NEVER a lead
  action and NEVER in quickWins. Do NOT frame the plan around local / "map" / "near me" visibility.
- LEAD instead with industry & authority DIRECTORIES for the vertical, EARNED MEDIA (third-
  party mentions, niche reviews, PR, guest content), and content matched to NATIONAL
  buyer-intent queries ("[service] for [audience] uk"). quickWins for a national firm should
  be directory/earned-media/content moves, not GBP.
If LOCAL:
- Keep the local-first weighting: GBP + Bing Places + Apple Business Connect LEAD (they are
  genuine quick wins), alongside local citations, reviews, and location/area pages.

════════ USE THE ACTUAL DATA ════════
- Name the specific engines that did NOT return the business. The competitor firms supplied
  are PRE-CLEANED real rivals — reference only those by name. If the list says "(none
  identified …)", refer to competitors generically as "other firms" and NEVER name a
  gov/tax body (HMRC, Companies House), a tax term (Corporation Tax, VAT), or software
  (Xero, QuickBooks, Sage) as a competitor.
- Tie actions to their real SEO findings / baseline signals when SEO data is present
  (e.g. "no LocalBusiness schema detected" → schema action). SYNTHESISE from the pasted SEO
  detail; NEVER reproduce chunks of it verbatim.
- Ground everything in their vertical / niche and location. If vertical or niche is unclear,
  infer from the name/type and flag it to confirm at onboarding.

════════ TWO REGISTERS (same plan, two audiences) ════════
- internalActions = what WE do. Specific, technical, our language (schema types, directory
  names, tooling, dependencies). This is our execution checklist.
- clientSummary (one per week) = plain, reassuring, jargon-free, safe to show the client.
  No internal cost/tooling talk. NEVER over-promise. Consistent with an honest, per-engine
  guarantee: the promise is "named in MORE answers at week 8 than on day 0", not "#1" or
  "guaranteed top result".
- pillar (per action) = the layer it belongs to, one of: "Data Layer", "Content Layer",
  "Off-site / Earned", "Reviews", "Community", "Measurement".

Return the whole plan via return_playbook. Include a "Week 0" baseline week, then the Sprint
windows that apply. quickWins = 3-6 highest-leverage first moves. directories = the real,
named authority directories/platforms for THIS vertical with a one-line why each. timelineNote
= the honest re-audit/instability framing. guaranteeNote = the honest week-8 before/after promise.`;

const PLAYBOOK_TOOL = {
  type: "function",
  function: {
    name: "return_playbook",
    description: "Return the tailored 8-week Sprint playbook (internal + client views) for this business.",
    parameters: {
      type: "object",
      properties: {
        businessName: { type: "string" },
        vertical: { type: "string", description: "The business's vertical/niche, e.g. 'accountancy firm'." },
        summary: { type: "string", description: "2-4 sentence where-they-stand-and-what-we'll-do overview, grounded in the audit." },
        weeks: {
          type: "array",
          minItems: 3,
          maxItems: 6,
          items: {
            type: "object",
            properties: {
              window: { type: "string", enum: ["Week 0", "Weeks 1-2", "Weeks 2-4", "Week 4", "Weeks 5-8", "Week 8"] },
              goal: { type: "string" },
              internalActions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    action: { type: "string" },
                    why: { type: "string" },
                    pillar: { type: "string", enum: ["Data Layer", "Content Layer", "Off-site / Earned", "Reviews", "Community", "Measurement"] },
                    dependsOn: { type: "string" },
                  },
                  required: ["action", "why", "pillar"],
                  additionalProperties: false,
                },
              },
              clientSummary: { type: "string" },
            },
            required: ["window", "goal", "internalActions", "clientSummary"],
            additionalProperties: false,
          },
        },
        quickWins: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
        directories: {
          type: "array",
          minItems: 1,
          maxItems: 12,
          items: {
            type: "object",
            properties: { name: { type: "string" }, why: { type: "string" } },
            required: ["name", "why"],
            additionalProperties: false,
          },
        },
        timelineNote: { type: "string" },
        guaranteeNote: { type: "string" },
      },
      required: ["businessName", "vertical", "summary", "weeks", "quickWins", "directories", "timelineNote", "guaranteeNote"],
      additionalProperties: false,
    },
  },
};

/** Pack the run's available data into a compact user message. Handles partial data.
 *  `cleanedCompetitors` is the frontend's already-filtered rival list (isRealCompetitor —
 *  gov/tax/software + fragments removed); we never re-derive competitors from raw here, so
 *  junk like HMRC / Xero / "Corporation Tax" can't reach the model. */
function buildUserPrompt(audit: Row, results: Row, cleanedCompetitors: string[]): string {
  const name = str(audit.business_name) || "the business";
  const type = str(audit.business_type) || "(not given — infer & confirm at onboarding)";
  const loc = str(audit.location_text) || "(not given)";
  const country = str(audit.country);
  const hasWebsite = audit.has_website === true && !!str(audit.website);

  // Per-engine visibility from results.questions.
  const questions: Row[] = Array.isArray(results?.questions) ? results.questions : [];
  const engineLines = PLAYBOOK_ENGINES.map((e) => {
    let named = 0, total = 0;
    for (const q of questions) {
      const er = q?.engines?.[e.key];
      if (er) { total++; if (er.named === true) named++; }
    }
    return `  - ${e.label}: named in ${named} of ${total} answers`;
  }).join("\n");

  // Real competitor firms AI named instead — ALREADY cleaned by the frontend
  // (isRealCompetitor). If none survived cleaning, refer to competitors generically.
  const topComps = (cleanedCompetitors ?? []).map(str).filter(Boolean).slice(0, 10);
  const compLine = topComps.length
    ? topComps.join(", ")
    : "(none identified — refer to competitors generically as \"other firms\"; NEVER name gov/tax bodies or software)";

  const questionList = questions.map((q) => `  - "${str(q?.question)}"`).slice(0, 20).join("\n");

  // SEO block (optional).
  const seo = results?.seo && typeof results.seo === "object" ? results.seo as Row : null;
  const seoGraded = seo && seo.categories && typeof seo.categories === "object";
  let seoBlock = "No website SEO data was added (AI-visibility-only audit).";
  if (seoGraded) {
    const c = seo.categories;
    const findings = Array.isArray(seo.leadFindings)
      ? seo.leadFindings.map((f: Row) => `    - [${str(f?.severity)}] ${str(f?.title)}: ${str(f?.detail)}`).join("\n")
      : "";
    const baseline = seo.baseline && typeof seo.baseline === "object" ? JSON.stringify(seo.baseline).slice(0, 2000) : "(none)";
    const rawPaste = str(seo.rawPaste).slice(0, MAX_RAW_PASTE_CHARS);
    seoBlock =
`Overall SEO grade: ${str(seo.overallGrade)}
  On-Page: ${str(c?.onPage?.grade)} (${c?.onPage?.score}) | Local/Entity Presence: ${str(c?.localPresence?.grade)} (${c?.localPresence?.score}) | Content & Technical: ${str(c?.contentTechnical?.grade)} (${c?.contentTechnical?.score})
  Lead findings:
${findings || "    (none)"}
  Baseline signals (JSON): ${baseline}
  Raw pasted SEO report (SYNTHESISE — never reproduce verbatim):
  """
  ${rawPaste || "(none)"}
  """`;
  }

  return `BUSINESS
  Name: ${name}
  Type / vertical: ${type}
  Location: ${loc}${country ? `\n  Country: ${country}` : ""}
  Website: ${hasWebsite ? str(audit.website) : "NO WEBSITE — apply the no-website fork (off-site only + our hosted pages)"}

AI-VISIBILITY AUDIT (Week 0 baseline)
${engineLines}
  Real competitor firms AI named instead (pre-cleaned — reference only these): ${compLine}
  Questions tested:
${questionList || "  (none)"}

WEBSITE SEO
${seoBlock}

Build the tailored 8-week Sprint playbook for THIS business via return_playbook. Map every
action to a Sprint window, use the real data above, apply the correct website fork, and write
both internalActions (our execution language) and a client-safe clientSummary per week.`;
}

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
    if (!runId) return json({ ok: false, error: "runId required" }, 400);
    // Competitors are cleaned client-side (isRealCompetitor) and passed in — we never
    // re-derive them from raw here, so junk (HMRC/Xero/tax terms) can't reach the model.
    const cleanedCompetitors: string[] = Array.isArray(body.competitors)
      ? body.competitors.filter((c: unknown) => typeof c === "string" && c.trim()).map((c: string) => c.trim()).slice(0, 10)
      : [];

    // Load the run + ownership-check.
    const { data: run } = await service
      .from("ai_audit_runs").select("id, audit_id, user_id, results").eq("id", runId).maybeSingle();
    if (!run) return json({ ok: false, error: "run_not_found" }, 404);
    if (run.user_id !== userId) return json({ ok: false, error: "forbidden" }, 403);

    // Load the audit for business context. (No website gate — playbook works for ANY audit.)
    const { data: audit } = await service
      .from("ai_audits").select("business_name, business_type, location_text, country, has_website, website").eq("id", run.audit_id).maybeSingle();
    if (!audit) return json({ ok: false, error: "audit_not_found" }, 404);

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) return json({ ok: false, error: "openai_not_configured" }, 500);

    const results = run.results && typeof run.results === "object" ? run.results as Row : {};
    const userPrompt = buildUserPrompt(audit, results, cleanedCompetitors);

    let raw: string | undefined;
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          temperature: TEMPERATURE,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          tools: [PLAYBOOK_TOOL],
          tool_choice: { type: "function", function: { name: "return_playbook" } },
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

    const validated = buildValidatedPlaybook(parsed, str(audit.business_name));
    if (!validated.ok) return json({ ok: false, error: `invalid_playbook:${validated.error}` }, 422);

    // Store at results.playbook. Read-modify-write MERGE (re-read immediately before write)
    // so the playbook merges with summary/questions/seo rather than clobbering them.
    const { data: fresh } = await service.from("ai_audit_runs").select("results").eq("id", runId).maybeSingle();
    const cur = fresh?.results && typeof fresh.results === "object" ? fresh.results as Record<string, unknown> : {};
    const { error: upErr } = await service
      .from("ai_audit_runs").update({ results: { ...cur, playbook: validated.playbook } }).eq("id", runId);
    if (upErr) return json({ ok: false, error: "store_failed", detail: upErr.message }, 500);

    return json({ ok: true, playbook: validated.playbook });
  } catch (e) {
    console.error("[generate-playbook] error:", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "unknown_error" }, 500);
  }
});
