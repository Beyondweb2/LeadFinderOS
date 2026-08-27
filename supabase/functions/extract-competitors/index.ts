import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

/** Light final backstop on the AI's names: trim, drop empties/over-long, drop the audited
 *  business (self), dedupe case-insensitively, cap. The AI is the primary judge; this only
 *  guards against obvious slips. (The frontend isRealCompetitor is a further display backstop.) */
function cleanNames(names: unknown, businessName: string): string[] {
  const self = businessName.trim().toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of Array.isArray(names) ? names : []) {
    const name = str(raw);
    if (!name || name.length > MAX_NAME_LEN) continue;
    const k = name.toLowerCase();
    if (seen.has(k)) continue;
    if (self && (k === self || k.includes(self) || self.includes(k))) continue; // never list self
    seen.add(k);
    out.push(name);
    if (out.length >= MAX_PER_ENGINE) break;
  }
  return out;
}

/* Record the cleaning outcome on the run (results.competitor_cleaning) WITHOUT touching the
 * names — used on the total-failure path, where there is nothing cleaned to write but the operator
 * still has to be told. Read-modify-write so a concurrent finalise cannot lose the questions fold.
 * Never throws: a missing receipt must not turn a cleaning failure into a 500 with no reason.
 * ⛔ The SPA does not trust this stamp on its own — src/lib/competitorCleaning.ts re-derives the
 * verdict from the names themselves, because every audit before 2026-08-28 has no stamp at all. */
// deno-lint-ignore no-explicit-any
async function stampCleaning(service: any, runId: string, s: {
  items_total: number; items_cleaned: number; complete: boolean; errors: string[];
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
Also EXCLUDE the audited business itself (given below) — never list it as its own competitor.

If an answer names NO real competitor firm, return an EMPTY list for that id. NEVER pad with
non-firms to fill space. Precision over recall: when unsure whether something is a genuine
firm, leave it out.

Return exactly one entry per id via return_competitors.`;

const COMPETITORS_TOOL = {
  type: "function",
  function: {
    name: "return_competitors",
    description: "Return the real competitor firms each answer recommended, per item id.",
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
            },
            required: ["id", "competitors"],
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

    /* One OpenAI call for one batch. Returns the ids it cleaned, or throws with a typed reason.
       Kept as a local closure so it can see OPENAI_API_KEY / businessName without threading them. */
    const cleanBatch = async (batch: Item[]): Promise<Map<string, string[]>> => {
      const userPrompt =
`Business (exclude from every list): ${businessName}
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
      const raw = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (typeof raw !== "string") throw new Error("model_no_tool_output");
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { throw new Error("model_bad_json"); }
      const out = new Map<string, string[]>();
      const results = (parsed as Row)?.results;
      for (const r of Array.isArray(results) ? results : []) {
        const id = str(r?.id);
        if (id) out.set(id, cleanNames(r?.competitors, businessName));
      }
      return out;
    };

    /* Run the batches SEQUENTIALLY. Deliberate: concurrent calls on a big run are the fastest way
       to a 429, and this path is never user-blocking (the queue fires it after finalisation). */
    const byId = new Map<string, string[]>();
    const batchErrors: string[] = [];
    for (let i = 0; i < items.length; i += BATCH_ITEMS) {
      const batch = items.slice(i, i + BATCH_ITEMS);
      try {
        const got = await cleanBatch(batch);
        for (const [k, v] of got) byId.set(k, v);
        /* A batch the model answered PARTIALLY is recorded, because the ids it omitted keep their
           raw names — the recorded failure mode from 2026-08-19 ("changed=7 of 8 rows"). */
        const missed = batch.filter((it) => !got.has(it.id)).length;
        if (missed > 0) batchErrors.push(`batch ${i / BATCH_ITEMS + 1}: model omitted ${missed} of ${batch.length} ids`);
      } catch (e) {
        const why = e instanceof Error ? e.message : String(e);
        console.error(`[extract-competitors] batch ${i / BATCH_ITEMS + 1} failed for run ${runId}: ${why}`);
        batchErrors.push(`batch ${i / BATCH_ITEMS + 1}: ${why}`);
      }
    }
    if (items.length > 0 && byId.size === 0) {
      /* NOTHING was cleaned. This must be a hard failure, not {ok:true, changed:0} — the caller
         (and the operator) has to be able to tell "no junk to remove" from "cleaning did not run".
         Stamped first so the flag survives even though the request fails. */
      await stampCleaning(service, runId, {
        items_total: answerItemsAvailable, items_cleaned: 0, complete: false, errors: batchErrors.slice(0, 8),
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
        base[it.engine] = { ...er, competitors: byId.get(it.id) };
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
      complete,
      errors: batchErrors.slice(0, 8),
    };
    const { error: upErr } = await service
      .from("ai_audit_runs").update({ results: { ...cur, questions, competitor_cleaning: stamp } }).eq("id", runId);
    if (upErr) return json({ ok: false, error: "store_failed", detail: upErr.message }, 500);

    return json({
      ok: true, changed, itemsRead: items.length, itemsTotal: answerItemsAvailable,
      itemsCleaned: byId.size, complete, errors: batchErrors.slice(0, 8),
    });
  } catch (e) {
    console.error("[extract-competitors] error:", e);
    return json({ ok: false, error: e instanceof Error ? e.message : "unknown_error" }, 500);
  }
});
