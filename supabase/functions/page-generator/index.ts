import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildPagePlan, stuffingCheck, enforceNaturalness, MAX_TOWN_MENTIONS, MAX_SERVICE_PHRASE_REPEATS, MAX_SINGLE_WORD_PCT, type PagePlan, type PlannedPage, type StuffingVerdict } from "../../../src/lib/pagePlan.ts";
import { classifyWinnability, unwrapCitationUrl, SCORED_ENGINES, DISPLAY_ENGINES, type EngineMap } from "../../../src/lib/auditReport.ts";
import { sourceMix, classifySource } from "../../../src/lib/sourceType.ts";
import { isAggregatorUrl } from "../_shared/aggregators.ts";
import { preMergeQuestions, validateClusters, buildQueue, topSources, enforceTownSplit, majorityVerdict, AUTHORITY_LOCK_SHARE, AUTHORITY_LOCK_MIN_CITES, type ClusterProposal, type QuestionSignals, type WinnVerdict } from "../../../src/lib/pagePlanQueue.ts";

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
  business_address: string | null; confirmed_phone: string | null; contact_name: string | null;
}

/* supabase-js errors are PLAIN OBJECTS, not Error instances — String(e) gives "[object Object]",
   which both hid the real message from the 500 payload AND broke the tables-missing regex
   (diagnosed live 2026-08-28: a missing column surfaced as "unknown_error"). Always read .message. */
const errMsg = (e: unknown): string => {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message?: unknown }).message ?? "");
  return String(e);
};

const normTown = (s: string): string => String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const escHtml = (s: string): string =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const httpUrl = (s: string): string => (/^https?:\/\//i.test(String(s ?? "").trim()) ? String(s).trim() : "");

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

function systemPrompt(mustNotSay: string, town: string, localAreas: string[]): string {
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
${localAreas.length
  ? `- You MAY mention these specific nearby areas the business genuinely covers, and ONLY these, ONCE, woven in naturally (e.g. "…including ${localAreas.slice(0, 2).join(" and ")}"): ${localAreas.join(", ")}. Do NOT invent any other place names and do NOT turn them into a list.`
  : `- Do NOT name any specific neighbourhoods, districts or nearby areas — none were given, so refer only to "the area" / "the surrounding area".`}
- Do NOT write any phone number, email, address, opening hours or links yourself — a contact section
  with the business's REAL details is added automatically AFTER your copy. Write the informational
  body only; you may end with a short, natural lead-in to getting in touch (with no number).
- Structure FREELY — do NOT reuse the same section shape or headings every time. A short opening,
  then 2-3 h2 sections a customer would actually want (what happens when you call someone out, what
  it typically involves, why people use a nearby firm), optionally ONE short ul. Vary the headings
  and their order. End with a low-key invitation to get in touch.
${mustNotSay ? `- THE CLIENT'S OWN HARD RULE — things this business must NEVER claim or imply: "${mustNotSay}". Respect this absolutely.` : ""}`;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════
   ARTICLE / Q&A MODE — informational pages for national / regulated clients (e.g. Solene, a
   menopause clinic). The SAFETY MODEL IS STRUCTURAL, not a prompt promise: the model returns ONLY
   generic framing + related questions + LABELS for the facts an expert must supply. The page is then
   ASSEMBLED IN CODE, with every specific fact rendered as a [CLIENT INPUT: …] blank. The model cannot
   emit a price/dose/eligibility/medical claim, because those slots are written by code as blanks, not
   by the model. The failure mode is a visible blank on the page, never a wrong fact.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
const QA_TOOL = {
  type: "function",
  function: {
    name: "return_qa",
    description: "Return ONLY the safe scaffolding for a Q&A page — never any answer, fact or figure.",
    parameters: {
      type: "object",
      properties: {
        intro: { type: "string", description: "1-2 GENERIC framing sentences introducing the topic. NO facts, numbers, prices, doses, dates, statistics or claims." },
        subQuestions: { type: "array", items: { type: "string" }, description: "3-5 related questions a reader would also ask. Questions ONLY, never answers." },
        factSlots: { type: "array", items: { type: "string" }, description: "2-5 short LABELS naming the specific facts an expert must supply to answer the main question (e.g. 'exact current UK price'). Labels, not values." },
        meta: { type: "string", description: "Generic meta description <=155 chars, NO specific facts; use the literal token [CLIENT INPUT: ...] if a fact is essential." },
      },
      required: ["intro", "subQuestions", "factSlots", "meta"],
      additionalProperties: false,
    },
  },
};

function systemPromptQA(businessType: string, mustNotSay: string): string {
  return `You draft the STRUCTURE ONLY of an informational Q&A page for ${businessType || "a UK business"}'s own website. A qualified expert fills in every fact afterwards — you never do.

⛔ ABSOLUTE SAFETY RULE: NEVER state any specific fact, figure, price, dose, eligibility rule, date, statistic, brand claim, or medical/clinical assertion — not even an approximate or "typical" one. Anything specific is a factSlot LABEL for the expert, never something you write. When in any doubt, make it a factSlot.

Return ONLY via return_qa:
- intro: 1-2 short GENERIC framing sentences about the topic — no digits, no prices, no claims; safe framing a compliance lawyer would clear.
- subQuestions: 3-5 related questions a reader would also ask. Questions ONLY.
- factSlots: 2-5 short labels naming the specific facts the expert must supply for the main answer.
- meta: a generic meta description (<=155 chars) with NO specific facts.
${mustNotSay ? `\nThe business must NEVER claim or imply: "${mustNotSay}".` : ""}`;
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

    /* ══ ARTICLE / Q&A MODE + PAGE-PLAN QUEUE — audit-based (works for lead-less national clients),
       self-contained so the service+area path below is untouched. ═════════════════════════════ */
    const AUDIT_ACTIONS = ["qa_clients", "qa_plan", "qa_generate", "plan_build", "plan_get", "plan_update"];
    if (AUDIT_ACTIONS.includes(action)) {
      const { data: auds } = await service
        .from("ai_audits")
        .select("id, lead_id, business_name, business_type, business_scope, location_text, baseline_target_runs, created_at")
        .gt("baseline_target_runs", 1)
        .eq("user_id", userId)
        .neq("is_market", true)
        .order("created_at", { ascending: false });
      const audits = (auds ?? []) as Array<{ id: string; lead_id: string | null; business_name: string; business_type: string | null; business_scope: string | null; location_text: string | null; baseline_target_runs: number; created_at: string }>;

      if (action === "qa_clients") {
        const seen = new Set<string>();
        const clients = audits
          .filter((a) => { const k = (a.business_name ?? "").toLowerCase(); if (!k || seen.has(k)) return false; seen.add(k); return true; })
          .map((a) => ({ audit_id: a.id, business_name: a.business_name, business_type: a.business_type, baseline_at: a.created_at }));
        return json({ ok: true, clients });
      }

      /* ── plan_update: edit ONE queue row (reorder / wave / hold / remove / job / merge). Keyed by
         page id; ownership = the row's user_id, so it needs no audit_id. ──────────────────────── */
      if (action === "plan_update") {
        try {
          const pageId = typeof body.page_id === "string" ? body.page_id : "";
          if (!pageId) return json({ ok: false, error: "page_id required" }, 400);
          const { data: row, error: readErr } = await service.from("client_pages")
            .select("id, user_id, baseline_audit_id").eq("id", pageId).maybeSingle();
          if (readErr) throw readErr;
          if (!row || (row as { user_id: string }).user_id !== userId) return json({ ok: false, error: "not_found" }, 404);

          const mergeInto = typeof body.merge_into === "string" ? body.merge_into : "";
          if (mergeInto) {
            const { data: target } = await service.from("client_pages").select("id, user_id").eq("id", mergeInto).maybeSingle();
            if (!target || (target as { user_id: string }).user_id !== userId) return json({ ok: false, error: "merge_target_not_found" }, 404);
            // Move question variants across (skip ones the target already has), then mark merged.
            const { data: srcQs } = await service.from("client_page_questions").select("question_text, baseline_audit_id, named_rate").eq("page_id", pageId);
            const { data: tgtQs } = await service.from("client_page_questions").select("question_text").eq("page_id", mergeInto);
            const have = new Set((tgtQs ?? []).map((q) => (q as { question_text: string }).question_text));
            const toMove = (srcQs ?? []).filter((q) => !have.has((q as { question_text: string }).question_text));
            if (toMove.length) await service.from("client_page_questions").insert(toMove.map((q) => ({ ...(q as object), page_id: mergeInto })));
            await service.from("client_pages").update({ status: "merged", held_reason: "merged by operator", near_dup_of: mergeInto, updated_at: new Date().toISOString() }).eq("id", pageId);
            return json({ ok: true });
          }

          const set = (body.set ?? {}) as Record<string, unknown>;
          const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
          if (Number.isInteger(set.wave) && (set.wave as number) >= 1 && (set.wave as number) <= 9) patch.wave = set.wave;
          if (Number.isInteger(set.position) && (set.position as number) >= 0) patch.position = set.position;
          if (typeof set.status === "string" && ["planned", "held", "removed"].includes(set.status)) {
            patch.status = set.status;
            patch.held_reason = set.status === "held" ? (typeof set.held_reason === "string" ? set.held_reason : "held by operator") : null;
          }
          if (typeof set.job === "string" && set.job.trim()) patch.job = set.job.trim();
          if (Object.keys(patch).length === 1) return json({ ok: false, error: "nothing_to_update" }, 400);
          const { error: updErr } = await service.from("client_pages").update(patch).eq("id", pageId);
          if (updErr) throw updErr;
          return json({ ok: true });
        } catch (e) {
          const msg = errMsg(e);
          if (/client_pages|client_page_questions/.test(msg) && /does not exist|schema cache/i.test(msg)) return json({ ok: false, error: "plan_tables_missing" }, 200);
          throw e;
        }
      }

      const auditId = typeof body.audit_id === "string" ? body.audit_id.trim() : "";
      const qaAudit = audits.find((a) => a.id === auditId);
      if (!qaAudit) return json({ ok: false, error: "no_audit_for_client" }, 404);

      /* ── plan_get: the stored queue for a client, waves + questions, pure read. ─────────────── */
      if (action === "plan_get") {
        try {
          const { data: pages, error: pErr } = await service.from("client_pages")
            .select("*").eq("baseline_audit_id", auditId).eq("user_id", userId)
            .order("wave", { ascending: true }).order("position", { ascending: true });
          if (pErr) throw pErr;
          const ids = (pages ?? []).map((p) => (p as { id: string }).id);
          const { data: qs } = ids.length
            ? await service.from("client_page_questions").select("page_id, question_text, named_rate").in("page_id", ids)
            : { data: [] };
          const byPage = new Map<string, unknown[]>();
          for (const q of qs ?? []) {
            const pid = (q as { page_id: string }).page_id;
            (byPage.get(pid) ?? byPage.set(pid, []).get(pid)!).push(q);
          }
          return json({ ok: true, pages: (pages ?? []).map((p) => ({ ...(p as object), questions: byPage.get((p as { id: string }).id) ?? [] })) });
        } catch (e) {
          const msg = errMsg(e);
          if (/client_pages|client_page_questions/.test(msg) && /does not exist|schema cache/i.test(msg)) return json({ ok: false, error: "plan_tables_missing" }, 200);
          throw e;
        }
      }

      const { data: qaRuns } = await service.from("ai_audit_runs")
        .select("id").eq("audit_id", auditId).in("status", ["complete", "capped"])
        .order("created_at", { ascending: false }).limit(qaAudit.baseline_target_runs);
      const qaRunIds = (qaRuns ?? []).map((r) => String((r as { id: string }).id));
      const { data: qaQRows } = qaRunIds.length
        ? await service.from("ai_audit_queue").select("question").in("run_id", qaRunIds).order("created_at", { ascending: true })
        : { data: [] as Array<{ question: string }> };
      const qaQuestions = [...new Set((qaQRows ?? []).map((r) => String((r as { question: string }).question ?? "").trim()).filter(Boolean))];

      if (action === "qa_plan") {
        return json({ ok: true, client: { audit_id: auditId, business_name: qaAudit.business_name, business_type: qaAudit.business_type, scope: qaAudit.business_scope }, questions: qaQuestions });
      }

      /* ── plan_build: cluster (AI proposes, code verifies) → score → waves → persist (or dry-run).
         One priced AI call; everything else is deterministic and tested (pagePlanQueue.ts). ────── */
      if (action === "plan_build") {
        const dryRun = body.dry_run === true;

        /* The town list — for LOCAL clients (a lead with a questionnaire), each town is a distinct
           provider-selection job and MUST split clusters. National clients (no lead/questionnaire,
           e.g. Solene) get an empty list and are untouched. Also fetch the lead's website so
           classifyWinnability can skip own-site citations. */
        let towns: string[] = [];
        let ownWebsite = "";
        if (qaAudit.lead_id) {
          const { data: obTown } = await service.from("onboarding_responses")
            .select("confirmed_location, areas_list").eq("lead_id", qaAudit.lead_id)
            .order("created_at", { ascending: false }).limit(1).maybeSingle();
          const o = obTown as { confirmed_location: string | null; areas_list: string[] | null } | null;
          towns = [...new Set([(o?.confirmed_location ?? "").trim(), ...(Array.isArray(o?.areas_list) ? o!.areas_list : []).map((a) => String(a ?? "").trim())].filter(Boolean))];
          const { data: leadW } = await service.from("outreach_leads").select("website").eq("id", qaAudit.lead_id).maybeSingle();
          ownWebsite = String((leadW as { website?: string } | null)?.website ?? "");
        }

        /* Signals per distinct question, from the SAME latest runs the question list came from.
           Winnability = classifyWinnability PER RUN (the audit page's own vocabulary and rule),
           folded by majorityVerdict — single-run winnability is noise (measured 17.9% flip).
           Named = counts per engine (named-in-N-of-M-runs) so holds can print verifiable numbers. */
        const { data: resRows } = await service.from("ai_audit_queue")
          .select("question, result").in("run_id", qaRunIds).eq("status", "done");
        const runsByQ = new Map<string, EngineMap[]>();
        const domainsByQ = new Map<string, string[]>();
        const namedByQ = new Map<string, { chatgpt: [number, number]; gemini: [number, number] }>();
        /* Per-question AUTHORITY-LOCK evidence: how many RUNS met the test (client absent, ≥3
           citations, ≥70% authority share, ZERO commercial sites — the defining clause: one
           commercial citation means a slot is winnable, so the question stays open), plus the
           authority domains those runs cited, for the hold wording. */
        const authByQ = new Map<string, { runs: number; domains: string[] }>();
        const locText = qaAudit.location_text ?? "";
        const hostOf = (u: string): string => { try { return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
        for (const r of resRows ?? []) {
          const q = String((r as { question: string }).question ?? "").trim();
          const result = ((r as { result: unknown }).result ?? {}) as EngineMap;
          if (!q) continue;
          (runsByQ.get(q) ?? runsByQ.set(q, []).get(q)!).push(result);
          const doms = domainsByQ.get(q) ?? [];
          const named = namedByQ.get(q) ?? { chatgpt: [0, 0] as [number, number], gemini: [0, 0] as [number, number] };
          const rowDoms: string[] = [];
          for (const eng of SCORED_ENGINES) {
            const er = result[eng];
            if (!er) continue;
            for (const cit of er.citations ?? []) { const h = hostOf(unwrapCitationUrl(cit?.url ?? "")); if (h) { doms.push(h); rowDoms.push(h); } }
            named[eng][1]++; if (er.named) named[eng][0]++;
          }
          const namedAnywhere = DISPLAY_ENGINES.some((e) => result[e]?.named);
          const mixR = sourceMix(rowDoms);
          if (!namedAnywhere && mixR.total >= AUTHORITY_LOCK_MIN_CITES && mixR.business === 0
            && mixR.authority / mixR.total >= AUTHORITY_LOCK_SHARE) {
            const a = authByQ.get(q) ?? { runs: 0, domains: [] };
            a.runs++;
            a.domains.push(...rowDoms.filter((d) => classifySource(d) === "authority"));
            authByQ.set(q, a);
          }
          domainsByQ.set(q, doms); namedByQ.set(q, named);
        }
        const toVerdict = (v: string): WinnVerdict =>
          v === "no-local-race" ? "no_local_race"
          : v === "named" || v === "open" || v === "contested" || v === "locked" ? v : "unmeasured";
        const signals = new Map<string, QuestionSignals>();
        for (const q of qaQuestions) {
          const perRun = (runsByQ.get(q) ?? []).map((result) =>
            classifyWinnability(result, { businessName: qaAudit.business_name, locationText: locText, ownWebsite, isAggregatorUrl }));
          const labels = perRun.map((v) => toVerdict(v.verdict));
          const wv = majorityVerdict(labels);
          const majRun = perRun.find((v) => toVerdict(v.verdict) === wv);
          const nr = namedByQ.get(q) ?? { chatgpt: [0, 0] as [number, number], gemini: [0, 0] as [number, number] };
          signals.set(q, {
            question: q,
            winnability: wv,
            winnabilityReason: majRun?.reason ?? "",
            incumbents: (majRun?.namedFirms ?? []).slice(0, 5),
            authorityLockRuns: authByQ.get(q)?.runs ?? 0,
            authorityDomains: [...new Set(authByQ.get(q)?.domains ?? [])].slice(0, 5),
            named: {
              chatgpt: nr.chatgpt[1] > 0 ? { named: nr.chatgpt[0], runs: nr.chatgpt[1] } : null,
              gemini: nr.gemini[1] > 0 ? { named: nr.gemini[0], runs: nr.gemini[1] } : null,
            },
            businessSources: sourceMix(domainsByQ.get(q) ?? []).business >= 1,
          });
        }

        // Deterministic pre-merge, then ONE clustering call over the kept questions.
        const { kept, mergedInto } = preMergeQuestions(qaQuestions);
        const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
        if (!OPENAI_API_KEY) return json({ ok: false, error: "openai_not_configured" }, 500);
        const numbered = kept.map((q, i) => `${i}: ${q}`).join("\n");
        const clusterRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: MODEL, temperature: 0.3,
            messages: [
              { role: "system", content: `You cluster a business's customer questions into DISTINCT CUSTOMER JOBS — one cluster per page. MERGE questions that one page genuinely answers (same job, phrased differently). SPLIT when the honest answer materially changes. ⛔ NEVER merge questions about DIFFERENT towns/places — for a local business each town is a separate provider-selection job, so "X in TownA" and "X in TownB" are ALWAYS separate clusters. Also group clusters under a short TOPIC (a hub theme; related clusters share a topic). Every JOB label must be UNIQUE across clusters and name the SPECIFIC service and place — never a generic label two clusters could share. Return indices into the numbered list via return_clusters — every index EXACTLY once, none invented.` },
              { role: "user", content: `Business: ${qaAudit.business_name}${qaAudit.business_type ? ` (${qaAudit.business_type})` : ""}.\nQuestions:\n${numbered}\nReturn via return_clusters.` },
            ],
            tools: [{
              type: "function",
              function: {
                name: "return_clusters",
                description: "The clustering: a perfect partition of the question indices.",
                parameters: {
                  type: "object",
                  properties: {
                    clusters: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          job: { type: "string", description: "the distinct customer job, short" },
                          topic: { type: "string", description: "short hub theme grouping related clusters" },
                          primary_index: { type: "integer" },
                          question_indices: { type: "array", items: { type: "integer" } },
                          rationale: { type: "string", description: "one line: why merged / kept apart" },
                        },
                        required: ["job", "topic", "primary_index", "question_indices", "rationale"],
                        additionalProperties: false,
                      },
                    },
                  },
                  required: ["clusters"], additionalProperties: false,
                },
              },
            }],
            tool_choice: { type: "function", function: { name: "return_clusters" } },
          }),
        });
        if (!clusterRes.ok) {
          const txt = await clusterRes.text().catch(() => "");
          if (clusterRes.status === 429 || /insufficient_quota|credit_balance_exhausted|no credits/i.test(txt)) return json({ ok: false, error: "no_credits" }, 200);
          return json({ ok: false, error: `openai_http_${clusterRes.status}`, detail: txt.slice(0, 200) }, 502);
        }
        const cData = await clusterRes.json();
        let proposals: ClusterProposal[] = [];
        try {
          const raw = JSON.parse(cData.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? "{}") as { clusters?: Array<Record<string, unknown>> };
          proposals = (raw.clusters ?? []).map((c) => ({
            job: String(c.job ?? "").trim() || "untitled job",
            topic: String(c.topic ?? "").trim() || "general",
            primaryIndex: Number(c.primary_index),
            questionIndices: Array.isArray(c.question_indices) ? c.question_indices.map(Number) : [],
            rationale: String(c.rationale ?? "").trim(),
          }));
        } catch { proposals = []; }

        const { partitionOk, clusters: validated, problems } = validateClusters(kept, proposals);
        /* ⛔ TOWN HARD SPLIT — whatever the model proposed, a cluster is never allowed to span
           towns (code disposes). Splits are reported, never silent. */
        const { clusters, splits: townSplits } = enforceTownSplit(kept, validated, towns);
        const pages = buildQueue(kept, clusters, signals);
        // Re-attach pre-merged exact duplicates to the page holding their keeper.
        for (const [dup, keeper] of mergedInto) {
          const pg = pages.find((p) => p.questions.includes(keeper));
          if (pg && !pg.questions.includes(dup)) pg.questions.push(dup);
        }
        /* "Where the engines are looking" — the top recurring cited domains across the page's
           questions, from citations the audit already captured. Shows where to get listed. */
        for (const p of pages) {
          p.topSources = topSources(p.questions.flatMap((q) => domainsByQ.get(q) ?? []));
        }

        if (dryRun) return json({ ok: true, dryRun: true, partitionOk, problems, townSplits, pages, questionCount: qaQuestions.length });

        // Persist: rebuild REPLACES this client's plan (the UI's confirm says so).
        try {
          const slugOf = (job: string, i: number): string => {
            const s = job.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
            return s || `page-${i}`;
          };
          await service.from("client_pages").delete().eq("baseline_audit_id", auditId).eq("user_id", userId);
          const inserted: string[] = [];
          for (let i = 0; i < pages.length; i++) {
            const p = pages[i];
            const rowObj: Record<string, unknown> = {
              user_id: userId, baseline_audit_id: auditId, lead_id: qaAudit.lead_id,
              page_type: "qa", job: p.job, topic: p.topic, primary_question: p.primaryQuestion,
              slug: slugOf(p.job, i), rationale: p.rationale, winnability: p.winnability,
              score: p.score, score_reasons: p.scoreReasons, wave: p.wave, position: p.position,
              status: p.status, held_reason: p.heldReason, top_sources: p.topSources ?? [],
            };
            let { data: row, error: insErr } = await service.from("client_pages").insert(rowObj).select("id").single();
            // A DB created before the top_sources migration must still take the plan — shed the
            // column and retry once (the findable-onboarding column-shedding lesson).
            if (insErr && /top_sources/i.test(insErr.message ?? "")) {
              delete rowObj.top_sources;
              ({ data: row, error: insErr } = await service.from("client_pages").insert(rowObj).select("id").single());
            }
            if (insErr || !row) throw insErr ?? new Error("insert failed");
            inserted.push((row as { id: string }).id);
            const qRows = p.questions.map((q) => ({
              page_id: (row as { id: string }).id, baseline_audit_id: auditId, question_text: q,
              named_rate: signals.get(q)?.named ?? null,
            }));
            if (qRows.length) { const { error: qErr } = await service.from("client_page_questions").insert(qRows); if (qErr) throw qErr; }
          }
          // near-dup links now that ids exist
          for (let i = 0; i < pages.length; i++) {
            const nd = pages[i].nearDupOf;
            if (!nd) continue;
            const j = pages.findIndex((p) => p.primaryQuestion === nd);
            if (j >= 0) await service.from("client_pages").update({ near_dup_of: inserted[j] }).eq("id", inserted[i]);
          }
          return json({ ok: true, partitionOk, problems, townSplits, built: pages.length, questionCount: qaQuestions.length });
        } catch (e) {
          const msg = errMsg(e);
          if (/client_pages|client_page_questions/.test(msg) && /does not exist|schema cache/i.test(msg)) return json({ ok: false, error: "plan_tables_missing" }, 200);
          throw e;
        }
      }

      // ── qa_generate: scaffold ONE Q&A page for a question (from the list OR free-typed). ──
      const question = typeof body.question === "string" ? body.question.trim() : "";
      if (!question) return json({ ok: false, error: "question_required" }, 400);
      const qaContactUrl = httpUrl(typeof body.contact_url === "string" ? body.contact_url : "");

      const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
      if (!OPENAI_API_KEY) return json({ ok: false, error: "openai_not_configured" }, 500);

      const callQA = async () => {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: MODEL, temperature: 0.5,
            messages: [
              { role: "system", content: systemPromptQA(qaAudit.business_type ?? "", "") },
              { role: "user", content: `The question this page answers: "${question}". Business: ${qaAudit.business_name}${qaAudit.business_type ? ` (${qaAudit.business_type})` : ""}. Return the scaffolding via return_qa.` },
            ],
            tools: [QA_TOOL], tool_choice: { type: "function", function: { name: "return_qa" } },
          }),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          if (res.status === 429 || /insufficient_quota|credit_balance_exhausted|no credits/i.test(txt)) return { kind: "no_credits" as const };
          return { kind: "error" as const, error: `openai_http_${res.status}`, detail: txt.slice(0, 200) };
        }
        const data = await res.json();
        const raw = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
        if (typeof raw !== "string") return { kind: "error" as const, error: "model_no_tool_output" };
        try {
          const p = JSON.parse(raw) as { intro?: unknown; subQuestions?: unknown; factSlots?: unknown; meta?: unknown };
          return {
            kind: "qa" as const,
            intro: typeof p.intro === "string" ? p.intro.trim() : "",
            subQuestions: Array.isArray(p.subQuestions) ? p.subQuestions.map((s) => String(s ?? "").trim()).filter(Boolean) : [],
            factSlots: Array.isArray(p.factSlots) ? p.factSlots.map((s) => String(s ?? "").trim()).filter(Boolean) : [],
            meta: typeof p.meta === "string" ? p.meta.trim() : "",
          };
        } catch { return { kind: "error" as const, error: "model_bad_json" }; }
      };

      let qaOut = await callQA();
      if (qaOut.kind === "no_credits") return json({ ok: false, error: "no_credits" }, 200);
      if (qaOut.kind === "error") return json({ ok: false, error: qaOut.error, detail: (qaOut as { detail?: string }).detail }, 502);
      if (qaOut.kind === "qa" && qaOut.subQuestions.length < 3) { // anti-thin: one retry for more sub-questions
        const retry = await callQA();
        if (retry.kind === "qa" && retry.subQuestions.length > qaOut.subQuestions.length) qaOut = retry;
      }
      const qa = qaOut as { intro: string; subQuestions: string[]; factSlots: string[]; meta: string };

      /* ASSEMBLE — every specific fact is a [CLIENT INPUT] blank placed BY CODE. The model's only prose
         (intro, meta) is digit-guarded: anything with a number/currency/% is dropped for a safe template,
         since invented specifics almost always carry a figure. */
      const factFree = (s: string) => (/[0-9£$%]/.test(s) ? "" : s.trim());
      const ci = (label: string) => `[CLIENT INPUT: ${label}]`;
      const introSafe = factFree(qa.intro) || `Many people ask this, and the right answer depends on your circumstances. The verified details below are provided by ${qaAudit.business_name}.`;
      const slots = (qa.factSlots.length ? qa.factSlots : ["the specific facts needed to answer this question"]).slice(0, 5);
      const subs = qa.subQuestions.slice(0, 5);

      const body_parts = [
        `<!-- DRAFT FOR CLIENT REVIEW — fill EVERY [CLIENT INPUT] blank with verified information before publishing. Do NOT publish unverified medical or factual claims. -->`,
        `<p>${escHtml(introSafe)}</p>`,
        `<h2>The short answer</h2>`,
        `<p><strong>${escHtml(ci(`a direct, verified answer to "${question}"`))}</strong></p>`,
        `<ul>${slots.map((s) => `<li>${escHtml(ci(s))}</li>`).join("")}</ul>`,
      ];
      if (subs.length) {
        body_parts.push(`<h2>Related questions</h2>`);
        for (const sq of subs) body_parts.push(`<h3>${escHtml(sq)}</h3><p>${escHtml(ci(`verified answer to: ${sq}`))}</p>`);
      }
      body_parts.push(`<h2>Sources</h2><p>${escHtml(ci("cite the sources for the facts above (e.g. NHS, NICE, product information)"))}</p>`);
      body_parts.push(`<p><em>Reviewed by ${escHtml(ci("name of the qualified expert who checked this, and the date"))}</em></p>`);
      body_parts.push(`<h2>Speak to the team</h2><p>For advice specific to your situation, get in touch${qaContactUrl ? ` — <a href="${escHtml(qaContactUrl)}">book a consultation</a>` : ""}.</p>`);

      const title = question.length <= 60 ? question : (() => {
        let t = ""; for (const w of question.split(/\s+/)) { if (`${t} ${w}`.trim().length > 60) break; t = `${t} ${w}`.trim(); } return t || question.slice(0, 60);
      })();
      const metaSafe = (factFree(qa.meta) || `${qaAudit.business_name} answers "${question}". ${ci("one-line verified summary")}`).slice(0, 200);
      const slug = question.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);

      return json({
        ok: true,
        page: {
          key: `qa:${slug}`, question, queries: [question], slug,
          title, meta_description: metaSafe, h1: question, body_html: body_parts.join("\n"), draft: true,
        },
        qa: { subQuestionCount: subs.length, factSlotCount: slots.length, introFromModel: !!factFree(qa.intro) },
      });
    }

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
      .select("lead_id, created_at, services_list, areas_list, confirmed_location, website_platform, accreditations, must_not_say, business_address, confirmed_phone, contact_name")
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

    /* ── The client's REAL contact data — for the CTA + NAP + internal links. Phone: the client's
       confirmed answer first, else the enriched lead phone. Address: the Google-formatted lead
       address first (cleaner), else the questionnaire's. Name for the CTA: contact_name, else the
       business name. NEVER invented — a missing field simply drops from the block. ─────────────── */
    const { data: leadRow } = await service
      .from("outreach_leads")
      .select("phone, website, address")
      .eq("id", leadId)
      .maybeSingle();
    const lead = (leadRow ?? {}) as { phone: string | null; website: string | null; address: string | null };
    const phone = (ob.confirmed_phone ?? lead.phone ?? "").trim();
    const address = (lead.address ?? ob.business_address ?? "").trim();
    const contactName = (ob.contact_name ?? "").trim() || audit.business_name;
    const siteRoot = (() => { const w = httpUrl(lead.website ?? ""); return w ? w.replace(/\/+$/, "") + "/" : ""; })();
    const contactDefault = siteRoot ? `${siteRoot}contact/` : "";

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
          website: siteRoot || null, contactDefault: contactDefault || null,
          hasPhone: !!phone, hasAddress: !!address,
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

    /* Optional operator-supplied inputs. local_areas: REAL nearby areas the operator entered from the
       client's own knowledge (no verified source of neighbourhoods exists to derive them — the audit
       holds competitors, not geography). contact_url: the client's real contact page, defaulting to
       {site}/contact/. Both are validated; anything malformed is dropped, never guessed. */
    const rawAreas = typeof body.local_areas === "string"
      ? body.local_areas
      : Array.isArray(body.local_areas) ? body.local_areas.join(",") : "";
    const localAreas = rawAreas.split(",").map((s) => s.trim())
      .filter((s) => s && s.length <= 40 && !/[<>]/.test(s)).slice(0, 8);
    const contactUrl = httpUrl(typeof body.contact_url === "string" ? body.contact_url : "") || contactDefault;
    const isHomeTown = normTown(page.town) === normTown(homeTown);

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
            { role: "system", content: systemPrompt((ob.must_not_say ?? "").trim(), page.town, localAreas) },
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

    /* ⛔ REAL CONTACT + INTERNAL LINKS — appended AFTER enforceNaturalness so these guaranteed-correct
       details are never trimmed or mangled by the town-cap / other-town backstop. Everything here is
       the client's REAL data (verbatim from their record); a missing field simply drops. The street
       address appears ONLY on the home-town page — on an away-town page it would name the home town
       and break the single-town rule. Links live in href attributes, so they don't affect density. */
    const linkParts: string[] = [];
    if (contactUrl) linkParts.push(`drop us a message on our <a href="${escHtml(contactUrl)}">contact page</a>`);
    if (siteRoot) linkParts.push(`see the rest of what we do on our <a href="${escHtml(siteRoot)}">home page</a>`);
    let cta = `<h2>Get in touch</h2><p>`;
    cta += phone
      ? `Call ${escHtml(contactName)} on <strong>${escHtml(phone)}</strong> and we'll talk through what you need`
      : `Get in touch and we'll talk through what you need`;
    if (isHomeTown && address) cta += `. You'll find us at ${escHtml(address)}`;
    cta += `.`;
    if (linkParts.length) cta += ` Or ${linkParts.join(", or ")}.`;
    cta += `</p>`;
    const finalBody = `${enforced.html}\n${cta}`;

    /* SEO TITLE TAG — built deterministically (not the model's) so the client's REAL phone is always
       present, in the "[Service] in [Town] | [Name] [phone]" pattern their existing titles use, and
       ALWAYS ≤ 60 chars. Phone shows in local UK form (07762…) as searchers expect. Fitting order:
       full name+phone, then trim trailing name words (never to a lone initial), then drop the name
       keeping the phone, then just service+town — the phone is the last thing to go, never truncated. */
    const seoTitle = (() => {
      const svc = page.service.replace(/\b\w/g, (c) => c.toUpperCase());
      const base = `${svc} in ${page.town}`;
      const tel = phone.replace(/^\+44\s?/, "0").trim();
      const words = audit.business_name.trim().split(/\s+/).filter(Boolean);
      for (let n = words.length; n >= 1; n--) {
        if (n < words.length && n < 2) break; // don't truncate a name down to a single initial
        const nm = words.slice(0, n).join(" ");
        const t = tel ? `${base} | ${nm} ${tel}` : `${base} | ${nm}`;
        if (t.length <= 60) return t;
      }
      if (tel && `${base} | ${tel}`.length <= 60) return `${base} | ${tel}`;
      return base.length <= 60 ? base : base.slice(0, 60).trim();
    })();

    return json({
      ok: true,
      page: {
        key: page.key, service: page.service, town: page.town, queries: page.queries, slug: page.slug,
        title: seoTitle, meta_description: out.meta, h1: out.h1, body_html: finalBody,
      },
      naturalness: {
        ...enforced.check, attempts, regenerated: attempts > 1,
        mechanicallyEnforced: enforced.townTrimmed || enforced.otherTownsStripped,
      },
      // What the mechanical block actually applied — so the UI can show it plainly.
      applied: { phone: !!phone, address: isHomeTown && !!address, links: linkParts.length, areas: localAreas },
    });
  } catch (e) {
    console.error("[page-generator] error:", e);
    return json({ ok: false, error: errMsg(e) || "unknown_error" }, 500);
  }
});
