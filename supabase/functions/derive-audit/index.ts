import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { townGated, TOWN_GATE_REASON } from "../../../src/lib/townVerdict.ts";
import { nameMatches } from "../_shared/enrichment/ai-search.ts";
import { canDeriveReport, explainRefusal } from "../_shared/derivable.ts";
import { normaliseTownName } from "../_shared/town-distance.ts";
import { canonicalTrade } from "../../../src/lib/trades.ts";

/* ════════════════════════════════════════════════════════════════════════════════════════════
   A PROSPECT'S REPORT FROM THE TOWN'S MARKET AUDIT — WITHOUT PAYING TWICE.

   ⛔ THE MEASUREMENT WAS ALREADY BOUGHT. A business audit asks 3–5 questions about a trade in a
   town and checks whether that business appears in the answers. A market audit asks 8 about the
   SAME trade in the SAME town. Measured across 925 questions: ZERO carry anything identifying the
   business — every apparent hit at three levels of tightening was a generic trade noun. So the two
   are the same measurement, and the second one is bought again per prospect at ~8p.
   One market audit is ~12p for the whole town. On 138 accountants that is £11 against 12p.

   ⛔ WHY THIS COPIES THE ANSWERS INTO A REAL AUDIT ROW rather than rendering from the market audit
   directly. Every downstream reader keys off an audit and a run: render-audit-report, the founder
   price in offer-price.ts, resolveAuditReplyVars' email variables, the playbook. A derived report
   that lived outside that shape would need each of them taught about it, and each would be a place
   to forget. The questions really were asked and the answers really are those, so a row saying so
   is honest — what must NOT be copied is the verdict.

   ⛔ `named` IS RECOMPUTED, NEVER COPIED. The stored flag was set at scan time by
   nameMatches(answer_text, <the market audit's own name>) — which for a market audit is a
   placeholder, not a business. Copying it would mark every prospect exactly as un-named as the
   placeholder was, which is a fabricated result that looks like a measured one. It is recomputed
   per prospect with the SAME function on the SAME answer text, so no new class of matching risk is
   introduced: the per-business path has always decided `named` this way.

   ⚠️ AND IT REFUSES RATHER THAN GUESSES. derivable.ts decides whether a NEGATIVE finding is
   publishable for this business at all — "Chichester Accountants Ltd" strips to nothing, so a zero
   would mean "we could not tell" rather than "you are invisible". Those must never print the same
   sentence, and the cost of refusing is one 8p audit.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

/** Engines whose `named` flag is scored. Mirrors SCORED_ENGINES in src/lib/auditReport.ts — stated
 *  here rather than imported to keep this bundle off the SPA's report module. */
const SCORED = ["chatgpt", "gemini"] as const;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-job, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface EngineResult {
  answer_text?: string;
  citations?: unknown;
  competitors?: string[];
  named?: boolean;
  position?: number | null;
}
type QueueResult = Record<string, EngineResult | unknown>;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ ok: false, error: "Auth required" }, 401);
    const token = authHeader.slice(7);
    const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));

    /* Internal callers (a future bulk path) present CRON_SECRET and name their actor, exactly as
       instantly-push does. Same gate, same reasoning: one credential, read only inside the branch. */
    const isInternal = CRON_SECRET.length > 0
      && req.headers.get("x-cron-secret") === CRON_SECRET
      && req.headers.get("x-internal-job") === "1";
    let userId: string;
    if (isInternal) {
      const acting = typeof body.acting_user_id === "string" ? body.acting_user_id.trim() : "";
      if (!acting) return json({ ok: false, error: "internal call requires acting_user_id" }, 401);
      userId = acting;
    } else {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
      const { data: u, error: uErr } = await userClient.auth.getUser(token);
      if (uErr || !u?.user) return json({ ok: false, error: "Auth required" }, 401);
      userId = u.user.id;
    }

    const leadId = typeof body.lead_id === "string" ? body.lead_id.trim() : "";
    if (!leadId) return json({ ok: false, error: "lead_id required" }, 400);
    const dryRun = body.dry_run === true;

    /* ── THE PROSPECT ─────────────────────────────────────────────────────────────────────── */
    const { data: lead } = await service.from("outreach_leads")
      .select("id, user_id, business_name, search_keyword, category, search_location, derived_town, town_fetch_note, address, website, country")
      .eq("id", leadId).eq("user_id", userId).maybeSingle();
    if (!lead) return json({ ok: false, error: "lead_not_found" }, 404);

    /* ⛔ THE TOWN GATE — Paul's rule, 2026-08-14. This function's own town line below falls back to
       search_location, and for a settled-unverifiable lead that is the searched town: a derived
       report would claim a market the business may not be in (the Wilson's fault, verbatim).
       Unchecked passes — absence is never an answer; only Google-confirmed-unverifiable holds. */
    if (townGated(lead)) {
      return json({ ok: false, error: "town_unverified", message: TOWN_GATE_REASON }, 409);
    }

    const businessName = String(lead.business_name ?? "").trim();
    const trade = String(lead.search_keyword || lead.category || "").trim();
    /* The town the prospect is IN, preferring the derived one — the same precedence pickAuditTown
       applies, because a derived report must be about their market and not the one we searched. */
    const town = String(lead.derived_town || lead.search_location || "").trim();
    if (!trade || !town) {
      return json({ ok: false, error: "no_trade_or_town", message: "This lead has no trade or town stored, so there is no market to derive from." }, 409);
    }

    /* ── THE TOWN'S MARKET AUDIT ──────────────────────────────────────────────────────────── */
    const { data: markets } = await service.from("ai_audits")
      .select("id, business_type, location_text, created_at")
      .eq("user_id", userId).eq("is_market", true)
      .order("created_at", { ascending: false }).limit(200);

    const wantTrade = canonicalTrade(trade)?.slug ?? null;
    const wantTown = normaliseTownName(town);
    /* ⛔ MATCHED ON THE CANONICAL TRADE, NOT THE RAW STRING. business_type is stored as typed, so
       "accountant" and "accountants" are one trade and must find each other's market audit — that
       is exactly what trades.ts exists for. An UNMAPPED trade matches only itself: guessing which
       market an unrecognised trade belongs to is how a plumber gets an accountant's report. */
    const candidates = (markets ?? []).filter((m) => {
      const mt = canonicalTrade(String(m.business_type ?? ""))?.slug ?? null;
      const tradeSame = wantTrade && mt ? wantTrade === mt
        : normaliseTownName(String(m.business_type ?? "")) === normaliseTownName(trade);
      return tradeSame && normaliseTownName(String(m.location_text ?? "")) === wantTown;
    });
    if (candidates.length === 0) {
      return json({
        ok: false, error: "no_market_audit",
        message: `No market audit for ${trade} in ${town}. Run one for the town first — it covers every prospect in it.`,
      }, 409);
    }

    /* Every completed run across those audits. More answers is strictly better here: the whole
       argument for deriving is that 8 questions give more chances to appear than 3. */
    const auditIds = candidates.map((m) => String(m.id));
    const { data: runs } = await service.from("ai_audit_runs")
      .select("id, audit_id, status").in("audit_id", auditIds).in("status", ["complete", "capped"]);
    const runIds = (runs ?? []).map((r) => String(r.id));
    if (runIds.length === 0) {
      return json({ ok: false, error: "market_audit_unfinished", message: `The ${trade} / ${town} market audit has no completed run yet.` }, 409);
    }

    const { data: qrows } = await service.from("ai_audit_queue")
      .select("id, run_id, question, status, result, engines").in("run_id", runIds);
    const answered = (qrows ?? []).filter((q) => q.status === "done" && q.result);

    /* Datapoints = engine answers that actually came back, not questions asked. Same rule as
       buildReportData's liveTotal: count the answers that exist. */
    let datapoints = 0;
    for (const q of answered) {
      const res = (q.result ?? {}) as QueueResult;
      for (const e of SCORED) if ((res[e] as EngineResult | undefined)?.answer_text) datapoints++;
    }

    /* ── THE GATE ─────────────────────────────────────────────────────────────────────────── */
    const verdict = canDeriveReport({ businessName, trade, town, answeredDatapoints: datapoints });
    if (!verdict.ok) {
      return json({
        ok: false, error: "not_derivable", reason: verdict.reason,
        message: explainRefusal(verdict),
        answered_datapoints: datapoints,
      }, 409);
    }

    /* ── RECOMPUTE `named`, PER PROSPECT ──────────────────────────────────────────────────── */
    let namedDatapoints = 0;
    const derivedRows = answered.map((q) => {
      const src = (q.result ?? {}) as QueueResult;
      const out: QueueResult = {};
      for (const key of Object.keys(src)) {
        const er = src[key];
        if (!er || typeof er !== "object") { out[key] = er; continue; }
        const e = er as EngineResult;
        const text = String(e.answer_text ?? "");
        /* ⛔ THE ONE LINE THIS WHOLE FUNCTION EXISTS FOR. Same matcher, same answer text, this
           prospect's name. Copying e.named would report the market placeholder's result as theirs. */
        /* Same context the live scan passes, so a derived verdict and a paid one are decided by
           exactly the same reading of exactly the same text. */
        const named = text ? nameMatches(text, businessName, { trade, town }) : false;
        if ((SCORED as readonly string[]).includes(key) && text && named) namedDatapoints++;
        out[key] = { ...e, named };
      }
      return { question: String(q.question ?? ""), engines: q.engines ?? null, result: out };
    });

    const summary = {
      mention_rate: datapoints > 0 ? Number((namedDatapoints / datapoints).toFixed(4)) : 0,
      /* ⛔ ZERO, AND IT MATTERS. Nothing was spent deriving this. A non-zero figure here would
         double-count the market audit's bill every time a prospect was derived from it, and the
         cost queries in CLAUDE.md §8 read actor_cost_usd directly. */
      actor_cost_usd: 0,
      done_questions: derivedRows.length,
      total_questions: derivedRows.length,
      failed_questions: 0,
      named_datapoints: namedDatapoints,
      total_datapoints: datapoints,
    };

    if (dryRun) {
      return json({
        ok: true, dry_run: true, business_name: businessName, trade, town,
        market_audits: candidates.length, questions: derivedRows.length,
        named_datapoints: namedDatapoints, total_datapoints: datapoints,
      });
    }

    /* ── WRITE IT AS A REAL AUDIT ─────────────────────────────────────────────────────────── */
    const { data: audit, error: aErr } = await service.from("ai_audits").insert({
      user_id: userId, lead_id: leadId,
      business_name: businessName, business_type: trade, location_text: town,
      country: lead.country ?? null,
      has_website: !!String(lead.website ?? "").trim(),
      website: String(lead.website ?? "").trim() || null,
      is_market: false,
      /* Says out loud where the town came from, exactly as a paid audit does. */
      location_source: lead.derived_town ? "derived" : "search",
    }).select("id").single();
    if (aErr || !audit) return json({ ok: false, error: aErr?.message ?? "audit insert failed" }, 500);

    const { data: run, error: rErr } = await service.from("ai_audit_runs").insert({
      audit_id: audit.id, user_id: userId, run_number: 1, status: "complete",
      mention_rate: summary.mention_rate,
      actor_cost_usd: 0,
      results: {
        summary,
        /* ⚠️ THE PROVENANCE, STORED. Without it a derived audit is indistinguishable from a paid
           one six months from now, and the difference matters: these answers were measured for the
           TOWN, not for this business, and two prospects in one town share them. */
        derived_from_run_ids: runIds,
        derived_at: new Date().toISOString(),
        /* No SEO scan is derivable — it is per-website and the market audit never ran one. Marked
           rather than absent so the report omits the section instead of rendering an empty grade. */
        seo: { skipped: "derived_report" },
      },
    }).select("id").single();
    if (rErr || !run) return json({ ok: false, error: rErr?.message ?? "run insert failed" }, 500);

    const queueInsert = derivedRows.map((r) => ({
      audit_id: audit.id, run_id: run.id, user_id: userId,
      question: r.question, engines: r.engines, status: "done", attempts: 1, result: r.result,
    }));
    const { error: qErr } = await service.from("ai_audit_queue").insert(queueInsert);
    if (qErr) return json({ ok: false, error: qErr.message }, 500);

    console.log(
      `[derive-audit] lead ${leadId} "${businessName}": derived from ${runIds.length} market run(s) `
      + `— ${namedDatapoints}/${datapoints} named, ${derivedRows.length} questions, $0 spent`,
    );
    return json({
      ok: true, audit_id: audit.id, run_id: run.id,
      named_datapoints: namedDatapoints, total_datapoints: datapoints,
      questions: derivedRows.length, derived_from_run_ids: runIds,
    });
  } catch (e) {
    console.error("[derive-audit] error:", (e as Error).message);
    return json({ ok: false, error: "internal", detail: (e as Error).message }, 500);
  }
});
