import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { bookOwnerId, refusalBody, resolveActor } from "../_shared/access.ts";
import { nicheTradeKey } from "../../../src/lib/nicheView.ts";
import {
  NICHE_PLACES_USD_PER_TOWN, NICHE_SAMPLE_FRESH_DAYS, NICHE_SAMPLE_METHOD, NICHE_SAMPLE_QUESTIONS_PER_TOWN,
  NICHE_SAMPLE_RUNS, NICHE_SAMPLE_TOWNS, NICHE_SAMPLE_USD, bandOf, nicheQuestions, nicheSampleVerdict, pickSampleTowns,
  type NicheAnswer, type NicheTownInput, type PlacesCandidate, type SampleTown, type TownRow,
} from "../../../src/lib/nicheSample.ts";

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE NICHE CHECK RUNNER (2026-09-28). The method, the questions and the verdict are
   src/lib/nicheSample.ts; this only plans, starts and reads.

     plan   (admin) — draws the three towns (uk_towns, one per size band, distinct regions, random),
                      builds the four questions per town, prices it. SPENDS NOTHING. Also says
                      whether a fresh compatible sample already exists (reuse, no spend).
     start  (admin) — takes the plan it was shown BACK (like the hook preview → run) and re-validates
                      every town against uk_towns and its band; then per town: ONE Google Places
                      text search (the real local market) and ONE audit through create-ai-audit —
                      purpose discovery, the four questions verbatim, 3 runs, no SEO scan, no lead,
                      niche_sample → is_market (no public report, out of every business path).
     status (both)  — progress while running; the verdict once every town's runs have settled.
                      Derived on read, never stored.
     list   (both)  — the samples for a niche, newest first.

   ⛔ ONE AUDIT ENGINE. No question is asked here: create-ai-audit queues them and
   process-ai-audit-queue asks them, with the same spend caps, retries and failure handling as every
   other audit. A failed question is a failed queue row there, and an answer that is not present is
   counted as missing here — never as "named nobody".
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
// deno-lint-ignore no-explicit-any
type Client = any;

/** A sample still waiting on a run after this long is read with what it has. */
const NICHE_SAMPLE_SETTLE_MS = 2 * 60 * 60 * 1000;

type Plan = { trade: string; towns: Array<SampleTown & { questions: string[] }> };

async function allTowns(service: Client): Promise<TownRow[]> {
  const out: TownRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await service.from("uk_towns").select("name, ons_code, population, region, suppressed_at")
      .order("id", { ascending: true }).range(from, from + 999);
    if (error) throw new Error(`uk_towns: ${error.message}`);
    out.push(...((data ?? []) as TownRow[]));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

function cleanTrade(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, 60) : "";
}

/** One Places text search — the town's genuine local providers (20, one page). null = it failed. */
async function placesSearch(trade: string, town: SampleTown & { lat?: number | null; lng?: number | null }): Promise<PlacesCandidate[] | null> {
  const key = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!key) return null;
  const body: Record<string, unknown> = { textQuery: `${trade} in ${town.name}, UK`, pageSize: 20, regionCode: "GB" };
  if (typeof town.lat === "number" && typeof town.lng === "number") {
    body.locationBias = { circle: { center: { latitude: town.lat, longitude: town.lng }, radius: 10000 } };
  }
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        /* Enterprise tier (websiteUri) — the same tier search-leads is billed at. No rating or review
           field: the market check reads who exists, never who is "best". */
        "X-Goog-FieldMask": "places.id,places.displayName,places.websiteUri,places.primaryType",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) { console.error(`[niche-sample] places ${town.name} HTTP ${res.status}`); return null; }
    const j = await res.json() as { places?: Array<{ displayName?: { text?: string }; websiteUri?: string; primaryType?: string }> };
    return (j.places ?? []).map((p) => ({ name: String(p.displayName?.text ?? "").trim(), website: p.websiteUri ?? null, primaryType: p.primaryType ?? null })).filter((p) => p.name);
  } catch (e) {
    console.error(`[niche-sample] places ${town.name} threw: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

async function samplesFor(service: Client, tradeKey: string): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await service.from("niche_samples").select("*").eq("trade_key", tradeKey)
    .order("created_at", { ascending: false }).limit(20);
  if (error) throw new Error(`niche_samples: ${error.message}`);
  return (data ?? []) as Array<Record<string, unknown>>;
}

/** Progress + (when settled) the verdict, read from the audits the sample started. */
async function readSample(service: Client, s: Record<string, unknown>) {
  const plan = s.plan as Plan;
  const auditIds = (s.audit_ids ?? {}) as Record<string, string>;
  const places = (s.places ?? {}) as Record<string, PlacesCandidate[] | null>;
  const ids = Object.values(auditIds).filter(Boolean);
  const { data: runs, error: runErr } = ids.length
    ? await service.from("ai_audit_runs").select("id, audit_id, run_number, status").in("audit_id", ids)
    : { data: [], error: null };
  if (runErr) throw new Error(`runs: ${runErr.message}`);
  const runRows = (runs ?? []) as Array<{ id: string; audit_id: string; run_number: number | null; status: string }>;
  const settledRuns = runRows.filter((r) => ["complete", "capped", "failed", "cancelled"].includes(r.status));
  const runById = new Map(runRows.map((r) => [r.id, r]));
  const rows: Array<{ run_id: string; question: string; status: string; result: unknown }> = [];
  if (runRows.length) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await service.from("ai_audit_queue").select("run_id, question, status, result:result_niche")
        .in("run_id", runRows.map((r) => r.id)).order("id", { ascending: true }).range(from, from + 999);
      if (error) throw new Error(`queue: ${error.message}`);
      rows.push(...((data ?? []) as typeof rows));
      if ((data ?? []).length < 1000) break;
    }
  }
  const expected = plan.towns.length * NICHE_SAMPLE_QUESTIONS_PER_TOWN * NICHE_SAMPLE_RUNS;
  const answered = rows.filter((r) => r.status === "done" || r.status === "failed").length;
  const usableRuns = (auditId: string) => runRows.filter((r) => r.audit_id === auditId && (r.status === "complete" || r.status === "capped"))
    .sort((x, y) => Number(x.run_number ?? 0) - Number(y.run_number ?? 0)).slice(0, NICHE_SAMPLE_RUNS);
  const perTownRuns = (auditId: string) => usableRuns(auditId).length;
  /* A town is finished when it has its three usable runs — or nothing is in flight and the audit engine
     has spent its retries (runs beyond the target), so the missing answers are read as missing. */
  const townSettled = (auditId: string) => perTownRuns(auditId) >= NICHE_SAMPLE_RUNS ||
    (!runRows.some((r) => r.audit_id === auditId && ["pending", "queued", "running", "processing"].includes(r.status)) &&
      settledRuns.filter((r) => r.audit_id === auditId).length >= NICHE_SAMPLE_RUNS + 2);
  const keepRun = new Set(Object.values(auditIds).flatMap((aid) => usableRuns(aid).map((r) => r.id)));
  /* Settled = every town has its three runs settled — or the sample is older than NICHE_SAMPLE_SETTLE_MS, when a
     run that never came is read as missing answers (NEED MORE DATA), never waited on forever. */
  const overdue = Date.now() - Date.parse(String(s.created_at)) > NICHE_SAMPLE_SETTLE_MS;
  const inFlight = runRows.some((r) => ["pending", "queued", "running", "processing"].includes(r.status));
  const done = plan.towns.every((t) => auditIds[t.ons_code] && townSettled(auditIds[t.ons_code])) || (overdue && !inFlight && ids.length > 0);
  const progress = { answered, expected, towns: plan.towns.map((t) => ({ name: t.name, runsSettled: auditIds[t.ons_code] ? perTownRuns(auditIds[t.ons_code]) : 0, runs: NICHE_SAMPLE_RUNS })) };
  if (!done) return { id: s.id, trade: s.trade, created_at: s.created_at, status: s.status === "failed" ? "failed" : "running", error: s.error ?? null, plan, progress, verdict: null };

  const inputs: NicheTownInput[] = plan.towns.map((t) => {
    const aid = auditIds[t.ons_code];
    const answers: NicheAnswer[] = [];
    for (const r of rows) {
      const run = runById.get(r.run_id);
      if (!run || run.audit_id !== aid || !keepRun.has(run.id)) continue;
      const res = (r.result ?? {}) as Record<string, { answer_present?: boolean; competitors?: unknown[]; citations?: Array<{ url?: string }> }>;
      for (const engine of ["gemini", "chatgpt"] as const) {
        const er = res[engine];
        answers.push({
          question: r.question, run: Number(run.run_number ?? 1), engine,
          present: r.status === "done" && !!er && er.answer_present === true,
          competitors: Array.isArray(er?.competitors) ? er!.competitors!.map((c) => String(c)) : [],
          citations: Array.isArray(er?.citations) ? er!.citations!.map((c) => String(c?.url ?? "")).filter(Boolean) : [],
        });
      }
    }
    return { town: t, answers, places: Array.isArray(places[t.ons_code]) ? places[t.ons_code] as PlacesCandidate[] : null };
  });
  return { id: s.id, trade: s.trade, created_at: s.created_at, status: "ready", error: null, plan, progress, verdict: nicheSampleVerdict(String(s.trade), inputs) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);
  try {
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const who = await resolveActor(req, service);
    if (!who.ok) return json(refusalBody(who), who.status);
    const isAdmin = who.actor.role === "admin";
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "";
    const trade = cleanTrade(body.trade);
    const tradeKey = nicheTradeKey(trade);

    if (action === "list") {
      if (!tradeKey) return json({ ok: false, error: "trade_required" }, 400);
      const samples = await samplesFor(service, tradeKey);
      return json({ ok: true, samples: await Promise.all(samples.map((s) => readSample(service, s))) });
    }
    if (action === "status") {
      const id = typeof body.sample_id === "string" ? body.sample_id : "";
      const { data: s, error } = await service.from("niche_samples").select("*").eq("id", id).maybeSingle();
      if (error) return json({ ok: false, error: "read_failed" }, 503);
      if (!s) return json({ ok: false, error: "not_found" }, 404);
      return json({ ok: true, sample: await readSample(service, s) });
    }

    /* Spending actions — the admin only (the check costs real money on two vendors). */
    if (!isAdmin) return json({ ok: false, error: "admin_only" }, 403);

    if (action === "plan") {
      if (!tradeKey) return json({ ok: false, error: "trade_required" }, 400);
      const probe = nicheQuestions(trade, "Leeds");
      if (!probe.ok) return json({ ok: false, error: "trade_not_a_business", detail: probe.reason }, 400);
      const previous = await samplesFor(service, tradeKey);
      const avoid = new Set<string>(previous.flatMap((s) => ((s.plan as Plan)?.towns ?? []).map((t) => t.ons_code)));
      const fresh = previous.find((s) => s.method_version === NICHE_SAMPLE_METHOD && s.status !== "failed"
        && Date.now() - Date.parse(String(s.created_at)) < NICHE_SAMPLE_FRESH_DAYS * 86_400_000) ?? null;
      const towns = pickSampleTowns(await allTowns(service), { random: Math.random, avoid });
      if (!towns) return json({ ok: false, error: "no_towns", detail: "The towns list cannot fill all three size bands." }, 503);
      const plan: Plan = { trade, towns: towns.map((t) => ({ ...t, questions: (nicheQuestions(trade, t.name) as { questions: string[] }).questions })) };
      return json({
        ok: true, plan,
        method: { towns: NICHE_SAMPLE_TOWNS, questionsPerTown: NICHE_SAMPLE_QUESTIONS_PER_TOWN, runs: NICHE_SAMPLE_RUNS, engines: ["Gemini (decides)", "ChatGPT (context)"], marketSearchPerTown: 1 },
        estimateUsd: NICHE_SAMPLE_USD,
        freshSampleId: fresh ? fresh.id : null,
      });
    }

    if (action === "start") {
      const plan = body.plan as Plan | undefined;
      if (!plan || !Array.isArray(plan.towns) || plan.towns.length !== NICHE_SAMPLE_TOWNS || cleanTrade(plan.trade) !== trade || !tradeKey) {
        return json({ ok: false, error: "plan_invalid", detail: "Plan the check again — the plan sent back does not match." }, 400);
      }
      /* ⛔ THE PLAN IS RE-VALIDATED, NOT TRUSTED: every town must be a real, unsuppressed uk_towns row in
         the band it claims, the regions distinct, and the questions exactly the four this trade and town
         produce. A browser cannot turn this into a 40-question audit of anything. */
      const byCode = new Map((await allTowns(service)).map((t) => [t.ons_code, t]));
      const regions = new Set<string>();
      for (const t of plan.towns) {
        const row = byCode.get(t.ons_code);
        const q = nicheQuestions(trade, t.name);
        if (!row || row.suppressed_at || row.name.trim() !== t.name || bandOf(row.population) !== t.band || regions.has(String(row.region))
          || !q.ok || JSON.stringify(q.questions) !== JSON.stringify(t.questions)) {
          return json({ ok: false, error: "plan_invalid", detail: `Plan the check again — ${t.name} no longer matches the towns list.` }, 400);
        }
        regions.add(String(row.region));
      }
      const owner = await bookOwnerId(service);
      if (!owner) return json({ ok: false, error: "no_book_owner" }, 503);
      const { data: sample, error: insErr } = await service.from("niche_samples").insert({
        trade, trade_key: tradeKey, method_version: NICHE_SAMPLE_METHOD, plan, status: "starting",
        created_by: who.actor.id, user_id: owner,
      }).select("id").single();
      if (insErr || !sample?.id) return json({ ok: false, error: "sample_insert_failed", detail: insErr?.message }, 503);

      const { data: coords } = await service.from("uk_towns").select("ons_code, lat, lng").in("ons_code", plan.towns.map((t) => t.ons_code));
      const at = new Map(((coords ?? []) as Array<{ ons_code: string; lat: number | null; lng: number | null }>).map((c) => [c.ons_code, c]));
      const auditIds: Record<string, string> = {};
      const places: Record<string, PlacesCandidate[] | null> = {};
      const errors: string[] = [];
      let searches = 0;
      await Promise.all(plan.towns.map(async (t) => {
        const c = at.get(t.ons_code);
        const found = await placesSearch(trade, { ...t, lat: c?.lat ?? null, lng: c?.lng ?? null });
        places[t.ons_code] = found;
        searches++;
        const r = await fetch(`${Deno.env.get("SUPABASE_URL") ?? ""}/functions/v1/create-ai-audit`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`,
            "x-cron-secret": Deno.env.get("CRON_SECRET") ?? "",
            "x-internal-job": "1",
          },
          body: JSON.stringify({
            user_id: owner, purpose: "discovery", niche_sample: true,
            business_name: `${trade} in ${t.name} (niche check)`, business_type: trade, location_text: t.name, country: "UK",
            questions: t.questions, question_count: t.questions.length, run_count: NICHE_SAMPLE_RUNS,
            skip_seo: true, has_website: false, business_scope: "local",
          }),
        });
        const p = await r.json().catch(() => ({})) as { ok?: boolean; audit_id?: string; error?: string; detail?: string };
        if (!r.ok || !p.ok || !p.audit_id) errors.push(`${t.name}: ${p.error ?? `HTTP ${r.status}`}${p.detail ? ` (${p.detail})` : ""}`);
        else auditIds[t.ons_code] = p.audit_id;
      }));
      const placesCost = searches * NICHE_PLACES_USD_PER_TOWN;
      try {
        await service.from("api_usage_log").insert({ user_id: who.actor.id, function_name: "niche-sample", api_type: "text_search", calls_made: searches, cache_hit: false, estimated_cost_usd: placesCost });
      } catch { /* the cost log is best-effort, as in search-leads */ }
      const status = errors.length ? "failed" : "running";
      await service.from("niche_samples").update({ audit_ids: auditIds, places, places_cost_usd: placesCost, status, error: errors.length ? errors.join(" · ").slice(0, 1000) : null, updated_at: new Date().toISOString() }).eq("id", sample.id);
      if (errors.length) return json({ ok: false, error: "start_partial", sample_id: sample.id, detail: errors.join(" · ") }, 502);
      return json({ ok: true, sample_id: sample.id });
    }

    return json({ ok: false, error: action ? `unknown action "${action}"` : "action required" }, 400);
  } catch (e) {
    console.error("[niche-sample]", e instanceof Error ? e.message : String(e));
    return json({ ok: false, error: "server_error", detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});
