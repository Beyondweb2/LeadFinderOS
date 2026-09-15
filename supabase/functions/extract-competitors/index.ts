import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
/* ⛔ THE SAME TWO PREDICATES THE REPORT USED TO APPLY AT RENDER - now applied HERE, once, before
   storing. Relative imports with the .ts extension because `@/` does not resolve for Deno
   (CLAUDE.md 4); both files are pure and pull in nothing Deno-hostile. */
import { isProvableJunkName } from "../../../src/lib/competitorCleaning.ts";
import { classifyKnownEntity } from "../../../src/lib/knownEntities.ts";

// extract-competitors — AI-judged competitor extraction from a run's ALREADY-STORED answer
// text (no new Apify scrape). For each engine answer on the run, an OpenAI call reads the
// prose and returns only the real COMPETITOR FIRMS the answer recommended — the way a human
// reading it would — replacing the old regex-scraped junk ("Real Time Information",
// "Provider", "Small"). Writes the cleaned competitors back to BOTH stores
// (ai_audit_queue[].result + ai_audit_runs.results.questions[].engines[e].competitors) so the
// report + "AI names these instead" reflect them. Mirrors apply-seo-paste (auth, tool-calling,
// ownership, read-modify-write). ONE model call per re-extract (batches every answer).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MODEL = "gpt-4o";
/* ⛔ THE REAL COST, FROM OpenAI's OWN TOKEN COUNTS — this function has never logged a penny.
   CLAUDE.md §4's rule: name the PRODUCT and the TIER. These are OpenAI's published standard
   (non-batch, non-cached) rates for gpt-4o: $2.50 per 1M input tokens, $10.00 per 1M output.
   Every call's `usage` block is summed and returned, so a backfill reports what it actually
   spent rather than an estimate derived from a comment. */
const USD_PER_1M_INPUT_TOKENS = 2.50;
const USD_PER_1M_OUTPUT_TOKENS = 10.00;
const MAX_ANSWER_CHARS = 4_000;   // truncate each stored answer_text packed into the prompt
const MAX_NAME_LEN = 60;          // reject absurdly long "names" (fragments)
const MAX_PER_ENGINE = 8;         // cap competitors kept per engine

/* ⛔ THE 2026-08-28 FIX: THIS USED TO BE ONE CALL CAPPED AT 60 ITEMS, AND THE CAP WAS SILENT.
 * Solene's 47-question measurement is 137 (question × engine) items. The old loop `break`ed at 60,
 * so 77 answers were NEVER SHOWN TO THE MODEL — and the function still returned {ok:true}, so a
 * run that was ~0% cleaned reported success and shipped 381 raw regex names ("Testosterone",
 * "AAAAABqkCA", "You") as competitor firms. Worse, the 60 it did send were packed into a single
 * ~302,000-character prompt with no output bound, so the tool-call arguments were long enough to
 * truncate and fail JSON.parse — losing the batch as well.
 *
 * Now: items are BATCHED, every batch is its own call, and coverage is REPORTED and STAMPED.
 *  · BATCH_ITEMS small enough that one call's prompt and its tool output both fit comfortably.
 *  · MAX_TOTAL_ITEMS is a real ceiling (a genuine bound on spend), and hitting it is recorded as
 *    incomplete rather than passed off as done.
 *  · One batch failing (rate limit, bad JSON) no longer loses the others.
 * Cost scales with answer volume, not with batch count: ~£0.20 for a 137-item run on gpt-4o. */
const BATCH_ITEMS = 24;
/* Attempts per batch, INCLUDING the first. 3 because the observed failure is the model dropping a
   couple of ids at random rather than anything systematic — one retry clears that nearly always,
   and a second costs a few pence on a run that would otherwise stay dirty for ever. */
const CLEAN_ATTEMPTS = 3;
const MAX_TOTAL_ITEMS = 400;
const MAX_OUTPUT_TOKENS = 4_000;  // stated, not defaulted — a truncated tool call is unparseable

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
type Row = any;

// Answer-text engines only (google_organic has no prose answer to read).
const ANSWER_ENGINES: Record<string, string> = {
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  ai_overview: "Google AI Overview",
};

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** THE FINAL WORD ON WHAT GETS STORED. Trim, drop empties/over-long, drop the audited business
 *  (self), drop known DIRECTORIES and provable junk, dedupe case-insensitively, cap.
 *
 *  🔴 THERE IS NO LONGER A DISPLAY BACKSTOP, AND THAT IS THE POINT (2026-09-02). The report used
 *  to re-filter this list through isRealCompetitor when it rendered, and that filter rejected 151 of
 *  the 2,065 stored names (7%) across the 60 newest audits - every sampled rejection a real firm,
 *  because its "basically the location" clause drops a short name containing the town, which is how
 *  a local trade is normally named ("Keytek Ashby-de-la-Zouch", "LockFit Bournemouth"). On one report
 *  it emptied three engine blocks that sat beside a positive named count.
 *  Measured across those same 2,065 names, what the filter guarded against had already been handled
 *  here: 0 known directories, 0 containing the client's own name, 1 provable junk string.
 *
 *  ⛔ SO WHAT THIS FUNCTION RETURNS IS WHAT THE CLIENT READS. Anything added here must be a fact
 *  about the NAME (it is a directory; it is not a name at all), never a heuristic about towns, word
 *  counts, capitalisation or trade vocabulary - those are what threw real competitors away. */
function cleanNames(names: unknown, businessName: string): { names: string[]; selfMatched: boolean } {
  const self = businessName.trim().toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  /* ⛔ RETURNED, NOT DISCARDED (2026-09-15). The self entry is still never printed as a rival —
     that rule is unchanged and the displayed list is byte-identical. What changed is that the
     DROP is now evidence: if the model listed the audited business among the firms an answer
     recommended, the answer named them. It used to be thrown away, which is why "named" had to
     be decided by a substring test against the raw answer instead. */
  let selfMatched = false;
  for (const raw of Array.isArray(names) ? names : []) {
    const name = str(raw);
    if (!name || name.length > MAX_NAME_LEN) continue;
    const k = name.toLowerCase();
    if (seen.has(k)) continue;
    if (self && (k === self || k.includes(self) || self.includes(k))) { selfMatched = true; continue; } // never list self — but record it
    /* A known DIRECTORY is a SOURCE, not a rival a customer hires instead - Checkatrade printing as
       a client's competitor is the failure this prevents. Known NATIONALS stay: Able Group really is
       a rival (knownEntities.ts). */
    if (classifyKnownEntity(name)?.kind === "directory") continue;
    /* Not a name at all: a single English function word, or a code-like token. Structural, so it
       needs no per-trade vocabulary - the medical-nouns lesson (CLAUDE.md 8). */
    if (isProvableJunkName(name)) continue;
    seen.add(k);
    out.push(name);
    if (out.length >= MAX_PER_ENGINE) break;
  }
  return { names: out, selfMatched };
}

/* Record the cleaning outcome on the run (results.competitor_cleaning) WITHOUT touching the
 * names — used on the total-failure path, where there is nothing cleaned to write but the operator
 * still has to be told. Read-modify-write so a concurrent finalise cannot lose the questions fold.
 * Never throws: a missing receipt must not turn a cleaning failure into a 500 with no reason.
 * ⛔ The SPA does not trust this stamp on its own — src/lib/competitorCleaning.ts re-derives the
 * verdict from the names themselves, because every audit before 2026-08-28 has no stamp at all. */
// deno-lint-ignore no-explicit-any
async function stampCleaning(service: any, runId: string, s: {
  items_total: number; items_cleaned: number; complete: boolean; errors: string[]; self_named_items?: number; self_named_true?: number; usd?: number; prompt_tokens?: number; completion_tokens?: number;
}): Promise<void> {
  try {
    const { data } = await service.from("ai_audit_runs").select("results").eq("id", runId).maybeSingle();
    const cur = data?.results && typeof data.results === "object" ? data.results : {};
    await service.from("ai_audit_runs")
      .update({ results: { ...cur, competitor_cleaning: { at: new Date().toISOString(), model: MODEL, ...s } } })
      .eq("id", runId);
  } catch (e) {
    console.error("[extract-competitors] could not stamp cleaning outcome:", e instanceof Error ? e.message : e);
  }
}

const SYSTEM_PROMPT =
`You read AI-assistant answers and identify the real COMPETITOR BUSINESSES each answer
recommended, for a business's "AI visibility" audit. You return ONLY structured data via the
return_competitors tool — no prose.

For EACH answer item (identified by its "id"), list the actual businesses / FIRMS the answer
presents as options or recommendations a customer could choose or hire — the names a human
reading the answer would write down as "the competitors it named".

INCLUDE only real, specific business / brand names: a company, firm, practice or named
provider a customer could actually hire.

EXCLUDE everything that is not a hireable firm — never return these:
- services or tasks: payroll, bookkeeping, accounting, tax returns, audit, self assessment
- tax terms / forms / schemes: RTI, "Real Time Information", CT600, VAT, PAYE, Corporation
  Tax, IR35, Making Tax Digital, Self Assessment
- government / regulatory bodies: HMRC, Companies House, Gov.uk, The Pensions Regulator
- software / tools / platforms: Xero, Sage, QuickBooks, FreeAgent, and software in general
- generic words or descriptors: Provider, Providers, Small, Online, Cost, Cheap, Best,
  Service(s), Firm, Company, Accountant(s), Software, Cloud, Local, Support
- section headers, list labels, UI / page furniture, or sentence fragments
The AUDITED BUSINESS (given below) is a special case, and it is the one thing this tool is
really for. NEVER list it under competitors — it is not its own competitor. INSTEAD, set
self_named to true for that id when the answer presents the audited business as one of the
businesses a customer could choose, hire or contact: recommended, listed, linked or described
as an option. Otherwise set self_named to false.

JUDGE THE BUSINESS, NOT THE WORDS. Many of these names are made of nothing but a trade and a
place — "Telford Plumbers", "Locksmiths Canterbury", "BS4 Electrical Services Ltd". An answer
about plumbers in Telford is NOT naming "Telford Plumbers" simply because those words appear in
it, and "BS4" appearing as a POSTCODE is not the firm "BS4 Electrical Services Ltd". Set
self_named to true ONLY when the answer is genuinely pointing a customer at THAT BUSINESS as a
business. When the words merely coincide with the subject of the question, it is false.
A close variant of the real firm ("RG Locksmiths" for "RG Locksmiths Ltd") IS the business.

If an answer names NO real competitor firm, return an EMPTY list for that id. NEVER pad with
non-firms to fill space. Precision over recall: when unsure whether something is a genuine
firm, leave it out.

Return exactly one entry per id via return_competitors, each with BOTH competitors and
self_named.`;

const COMPETITORS_TOOL = {
  type: "function",
  function: {
    name: "return_competitors",
    description: "Return the real competitor firms each answer recommended, and whether it named the audited business, per item id.",
    parameters: {
      type: "object",
      properties: {
        results: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "The item id exactly as given." },
              competitors: {
                type: "array",
                items: { type: "string" },
                description: "Real competitor firm names the answer recommended (empty if none).",
              },
              self_named: {
                type: "boolean",
                description:
                  "True if this answer presents the AUDITED BUSINESS itself as a business a customer could choose or hire. False if its name merely shares words with the question's trade or town.",
              },
            },
            required: ["id", "competitors", "self_named"],
            additionalProperties: false,
          },
        },
      },
      required: ["results"],
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

    // --- Auth: a trusted INTERNAL call (process-ai-audit-queue at run finalisation) OR an
    //     authenticated user who owns the run. ---
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
    // Internal-call branch (mirrors enrich-business / generate-barber-site): a matching CRON_SECRET
    // header + x-internal-job, OR the service-role key + x-internal-job. Purely ADDITIVE — external
    // callers can hold neither, so the user path below is unchanged. Trusted internal calls skip the
    // per-user ownership check (the caller already owns the run's lifecycle).
    const isInternal =
      (!!cronSecret && req.headers.get("x-cron-secret") === cronSecret && !!req.headers.get("x-internal-job")) ||
      (!!serviceKey && token === serviceKey && !!req.headers.get("x-internal-job"));

    let userId: string | null = null;
    if (!isInternal) {
      if (!token) return json({ ok: false, error: "unauthorized" }, 401);
      const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
      const { data: u } = await userClient.auth.getUser();
      if (!u?.user) return json({ ok: false, error: "unauthorized" }, 401);
      userId = u.user.id;
    }

    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const body = await req.json().catch(() => ({}));
    const runId: string = typeof body.runId === "string" ? body.runId.trim() : "";
    if (!runId) return json({ ok: false, error: "runId required" }, 400);

    // Load the run + ownership-check (the ownership check is skipped for trusted internal calls).
    const { data: run } = await service
      .from("ai_audit_runs").select("id, audit_id, user_id, results").eq("id", runId).maybeSingle();
    if (!run) return json({ ok: false, error: "run_not_found" }, 404);
    if (!isInternal && run.user_id !== userId) return json({ ok: false, error: "forbidden" }, 403);

    // Business context (for self-exclusion + prompt grounding).
    const { data: audit } = await service
      .from("ai_audits").select("business_name, location_text").eq("id", run.audit_id).maybeSingle();
    const businessName = str(audit?.business_name) || "the business";
    const location = str(audit?.location_text) || "(not given)";

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) return json({ ok: false, error: "openai_not_configured" }, 500);

    // Load the run's queue rows (the per-question stored answers), oldest first — same order
    // the finalizer folds them, so re-folding results.questions stays consistent.
    const { data: rowsData } = await service
      .from("ai_audit_queue").select("id, question, status, result")
      .eq("run_id", runId).order("created_at", { ascending: true });
    const rows: Row[] = Array.isArray(rowsData) ? rowsData : [];

    // Build the batch of (row × engine) answer items to read.
    type Item = { id: string; rowId: string; engine: string; label: string; question: string; answer: string };
    /* What one answer yields: the rivals it recommended, and whether it named the audited
       business. The second half used to be thrown away inside cleanNames. */
    type Extracted = { names: string[]; selfNamed: boolean };
    const items: Item[] = [];
    for (const r of rows) {
      if (r.status !== "done" || !r.result || typeof r.result !== "object") continue;
      for (const [engine, label] of Object.entries(ANSWER_ENGINES)) {
        const er = (r.result as Row)[engine];
        const answer = str(er?.answer_text);
        if (!answer) continue;
        items.push({ id: `${r.id}::${engine}`, rowId: r.id, engine, label, question: str(r.question), answer: answer.slice(0, MAX_ANSWER_CHARS) });
        if (items.length >= MAX_TOTAL_ITEMS) break;
      }
      if (items.length >= MAX_TOTAL_ITEMS) break;
    }
    /* Did the ceiling actually bite? Counted independently of `items` so the stamp can SAY SO — the
       old code could not distinguish "read every answer" from "stopped at 60 and said ok". */
    let answerItemsAvailable = 0;
    for (const r of rows) {
      if (r.status !== "done" || !r.result || typeof r.result !== "object") continue;
      for (const engine of Object.keys(ANSWER_ENGINES)) {
        if (str(((r.result as Row)[engine] as Row)?.answer_text)) answerItemsAvailable++;
      }
    }

    // Nothing to read (no completed answers) — nothing to change.
    if (items.length === 0) return json({ ok: true, changed: 0, note: "no_answer_text" });

    // Summed across every batch AND every retry, so a run that needed three attempts reports all
    // three. Counted even when a batch then fails to parse — the tokens were still billed.
    let usageIn = 0, usageOut = 0;
    const usdSpent = () =>
      Number(((usageIn / 1e6) * USD_PER_1M_INPUT_TOKENS + (usageOut / 1e6) * USD_PER_1M_OUTPUT_TOKENS).toFixed(6));

    /* One OpenAI call for one batch. Returns the ids it cleaned, or throws with a typed reason.
       Kept as a local closure so it can see OPENAI_API_KEY / businessName without threading them. */
    const cleanBatch = async (batch: Item[]): Promise<Map<string, string[]>> => {
      const userPrompt =
`Audited business (never list as a competitor; set self_named for it): ${businessName}
Location: ${location}

Read each answer below and return the real competitor firms it recommended, per id.

${batch.map((it) => `[id: ${it.id}] engine: ${it.label} — question: "${it.question}"
"""
${it.answer}
"""`).join("\n\n")}

Return one entry per id via return_competitors.`;

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          temperature: 0, // deterministic — same stored answers → same competitors
          max_tokens: MAX_OUTPUT_TOKENS,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          tools: [COMPETITORS_TOOL],
          tool_choice: { type: "function", function: { name: "return_competitors" } },
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        /* Surface OpenAI's own words — "You have no credits remaining" is the one failure the
           operator can actually act on, and it used to be invisible (CLAUDE.md §6e). */
        throw new Error(`openai_http_${res.status}: ${txt.slice(0, 200)}`);
      }
      const data = await res.json();
      const u = data.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
      usageIn += Number(u?.prompt_tokens) || 0;
      usageOut += Number(u?.completion_tokens) || 0;
      const raw = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (typeof raw !== "string") throw new Error("model_no_tool_output");
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { throw new Error("model_bad_json"); }
      const out = new Map<string, Extracted>();
      const results = (parsed as Row)?.results;
      for (const r of Array.isArray(results) ? results : []) {
        const id = str(r?.id);
        if (!id) continue;
        const { names, selfMatched } = cleanNames(r?.competitors, businessName);
        /* ⛔ EITHER SIGNAL IS A NAMING, and the OR is deliberate. The model is asked to mark the
           business rather than list it, but if it lists it anyway — against the instruction —
           that is still the model saying this answer points a customer at them. Only an explicit
           `false` with no self entry is a "no". */
        out.set(id, { names, selfNamed: r?.self_named === true || selfMatched });
      }
      return out;
    };

    /* Run the batches SEQUENTIALLY. Deliberate: concurrent calls on a big run are the fastest way
       to a 429, and this path is never user-blocking (the queue fires it after finalisation). */
    const byId = new Map<string, Extracted>();
    const batchErrors: string[] = [];
    for (let i = 0; i < items.length; i += BATCH_ITEMS) {
      const batchNo = i / BATCH_ITEMS + 1;
      /* ⛔ RETRY THE IDS THE MODEL LEFT OUT, RATHER THAN RECORDING A PERMANENT PARTIAL.
         Measured 2026-09-09 over the last 60 completed runs: 55 cleaned perfectly and FIVE came back
         "model omitted N of M ids" — gpt-4o simply not returning every id in its tool call. Nothing
         retried them, and nothing ever would: the cleaner fires once, from the tick that finalises
         the run. So those five runs kept raw competitor names until somebody noticed and pressed the
         manual button, which is exactly the chore Paul asked to stop doing ("extract competitors
         should always run, I shouldn't have to manually do it myself").
         ⚠️ THE RETRY ASKS ONLY FOR WHAT IS MISSING. A smaller ask is likelier to be answered in full,
         and re-sending ids the model already handled would spend money re-deriving names we have.
         ⚠️ Still sequential, so this cannot increase 429 pressure — it trades a little latency on the
         ~8% of runs that need it for not leaving them dirty. */
      let pending = items.slice(i, i + BATCH_ITEMS);
      const batchSize = pending.length;
      let lastError = '';
      for (let attempt = 1; attempt <= CLEAN_ATTEMPTS && pending.length > 0; attempt++) {
        try {
          const got = await cleanBatch(pending);
          for (const [k, v] of got) byId.set(k, v);
          pending = pending.filter((it) => !got.has(it.id));
          lastError = pending.length ? `model omitted ${pending.length} of ${batchSize} ids` : '';
        } catch (e) {
          lastError = e instanceof Error ? e.message : String(e);
          console.error(`[extract-competitors] batch ${batchNo} attempt ${attempt} failed for run ${runId}: ${lastError}`);
          /* ⛔ A HARD OpenAI REFUSAL IS NOT WORTH RETRYING, and retrying it is actively wrong: no
             credit or a bad key will fail identically every time, so the attempts only delay the
             honest receipt. Anything else (a 429, a truncated tool call, a blip) is exactly what a
             retry is for. */
          if (/openai_http_(401|402|403)|credit/i.test(lastError)) break;
        }
      }
      /* Recorded ONLY if it is still unresolved after the retries — the receipt should describe the
         final state, not every wobble on the way to a good one. */
      if (lastError) batchErrors.push(`batch ${batchNo}: ${lastError}`);
    }
    if (items.length > 0 && byId.size === 0) {
      /* NOTHING was cleaned. This must be a hard failure, not {ok:true, changed:0} — the caller
         (and the operator) has to be able to tell "no junk to remove" from "cleaning did not run".
         Stamped first so the flag survives even though the request fails. */
      await stampCleaning(service, runId, {
        items_total: answerItemsAvailable, items_cleaned: 0, complete: false, errors: batchErrors.slice(0, 8),
      usd: usdSpent(), prompt_tokens: usageIn, completion_tokens: usageOut,
      });
      return json({ ok: false, error: "cleaning_failed", itemsTotal: answerItemsAvailable, itemsCleaned: 0, errors: batchErrors.slice(0, 8) }, 502);
    }

    // Rewrite competitors per row×engine in the queue rows (the store the report reads).
    let changed = 0;
    const updatedResults = new Map<string, Row>(); // rowId → new result object
    for (const it of items) {
      if (!byId.has(it.id)) continue;
      const base = updatedResults.get(it.rowId) ?? { ...(rows.find((r) => r.id === it.rowId)!.result as Row) };
      const er = base[it.engine];
      if (er && typeof er === "object") {
        const got = byId.get(it.id)!;
        /* ⛔ `self_named` IS THE NAMING VERDICT NOW (src/lib/namedSignal.ts reads it). The stored
           `named` from nameMatches is left EXACTLY as it was — it is what every un-backfilled
           audit still falls back to, and overwriting it would rewrite two paying clients' frozen
           baselines. The new field sits beside it and wins where it exists. */
        base[it.engine] = { ...er, competitors: got.names, self_named: got.selfNamed };
        updatedResults.set(it.rowId, base);
      }
    }
    for (const [rowId, result] of updatedResults) {
      const { error } = await service.from("ai_audit_queue").update({ result }).eq("id", rowId);
      if (error) return json({ ok: false, error: "store_failed", detail: error.message }, 500);
      changed++;
    }

    // Re-fold results.questions from the (now-updated) rows — same shape/order the finalizer
    // uses — and merge back so the snapshot the playbook reads stays in sync. Read-modify-write.
    const { data: fresh } = await service.from("ai_audit_runs").select("results").eq("id", runId).maybeSingle();
    const cur = fresh?.results && typeof fresh.results === "object" ? fresh.results as Record<string, unknown> : {};
    const questions = rows.map((r) => {
      const result = updatedResults.get(r.id) ?? (r.status === "done" ? r.result : null);
      return { question: r.question, status: r.status, engines: r.status === "done" ? result : null };
    });
    /* ⛔ THE STAMP GOES IN THE SAME WRITE AS THE CLEANED SNAPSHOT. Two writes would leave a window
       where the names are new and the receipt is old. jsonb — no migration. */
    const complete = byId.size >= items.length && items.length >= answerItemsAvailable && batchErrors.length === 0;
    const stamp = {
      at: new Date().toISOString(),
      model: MODEL,
      items_total: answerItemsAvailable,
      items_cleaned: byId.size,
      /* How many answers carry a MODEL naming verdict after this run, and how many of those were
         a yes. Lets a backfill be verified without re-reading every queue row. */
      self_named_items: byId.size,
      self_named_true: [...byId.values()].filter((v) => v.selfNamed).length,
      usd: usdSpent(),
      prompt_tokens: usageIn,
      completion_tokens: usageOut,
      complete,
      errors: batchErrors.slice(0, 8),
    };
    const { error: upErr } = await service
      .from("ai_audit_runs").update({ results: { ...cur, questions, competitor_cleaning: stamp } }).eq("id", runId);
    if (upErr) return json({ ok: false, error: "store_failed", detail: upErr.message }, 500);

    return json({
      ok: true, changed, itemsRead: items.length, itemsTotal: answerItemsAvailable,
      itemsCleaned: byId.size, complete, errors: batchErrors.slice(0, 8),
      selfNamedTrue: [...byId.values()].filter((v) => v.selfNamed).length,
      selfNamedItems: byId.size,
      usd: usdSpent(), promptTokens: usageIn, completionTokens: usageOut,
    });
  } catch (e) {
    console.error("[extract-competitors] error:", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "unknown_error" }, 500);
  }
});
