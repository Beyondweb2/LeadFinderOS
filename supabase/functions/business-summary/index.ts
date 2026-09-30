import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isInternalCall, refusalBody, requireAdmin } from "../_shared/access.ts";
import { loadAdminOverview } from "../_shared/admin-overview-load.ts";
import { callModel } from "../_shared/site-research.ts";
import { logOpenAiUsage, openAiUsd } from "../_shared/openai-usage.ts";
import { paidMode } from "../_shared/protection.ts";
import { addDays, londonDay, mondayOf, resolvePeriod } from "../../../src/lib/reportingPeriod.ts";
import {
  allowedNumbers, buildSummaryFacts, fallbackLookAt, summaryPrompt, validateNumbers,
  SUMMARY_MIN_INTERVAL_MINUTES, SUMMARY_MODEL, SUMMARY_PROMPT_VERSION, SUMMARY_TOOL, type OverviewLike,
} from "../../../src/lib/businessSummary.ts";

// business-summary — the admin-only AI business briefing (Admin control centre, release 6, 2026-09-30;
// docs/admin-control-centre.md §AI business summary).
// Callers: the cron (Mondays; kind "weekly": last full London week vs the week before) and the admin
// (kind "on_demand": the last 7 days vs the 7 before, at most once per SUMMARY_MIN_INTERVAL_MINUTES).
// ⛔ Grounded: the model sees only the dashboard's own numbers (the shared loader) and every number in
// its draft must be one of them — otherwise one retry, then the draft is stored as 'rejected' and never
// shown (src/lib/businessSummary.ts). It writes one admin_summaries row and nothing else; it never
// changes a lead, money or client state. Honours the emergency stop.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret, x-internal-job",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const BUILD_ID = "business-summary-2026-09-30b";
const FN = "business-summary";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { ...corsHeaders, "x-build": BUILD_ID } });
  try {
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const internal = isInternalCall(req) && req.headers.get("x-internal-job") === "1";
    let actorId: string | null = null;
    if (!internal) {
      const who = await requireAdmin(req, service);
      if (!who.ok) return json(refusalBody(who), who.status);
      actorId = who.actor.id;
    }
    const body = await req.json().catch(() => ({}));
    const kind = internal && body.kind === "weekly" ? "weekly" : "on_demand";

    if (kind === "on_demand") {
      const { data: last } = await service.from("admin_summaries").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle();
      const ageMin = last?.created_at ? (Date.now() - Date.parse(last.created_at)) / 60_000 : Infinity;
      if (ageMin < SUMMARY_MIN_INTERVAL_MINUTES) return json({ ok: true, skipped: `The last summary is ${Math.floor(ageMin)} minutes old — refresh again after ${SUMMARY_MIN_INTERVAL_MINUTES} minutes.` });
    }
    if ((await paidMode(service)) === "all_stop") return json({ ok: false, error: "paused", detail: "Paid calls are paused (emergency stop)." });

    const { data: claimed, error: cErr } = await service.rpc("admin_job_claim", { _job: FN, _lease_seconds: 300 });
    if (cErr) throw new Error(`lease: ${cErr.message}`);
    if (claimed !== true) return json({ ok: true, skipped: "A summary is already being written." });

    try {
      const nowMs = Date.now();
      const today = londonDay(nowMs);
      // Weekly: the last FULL London week (Mon–Sun) vs the one before. On demand: last 7 days vs the 7 before.
      const [curFrom, curTo] = kind === "weekly" ? [addDays(mondayOf(today), -7), addDays(mondayOf(today), -1)] : [addDays(today, -6), today];
      const [prevFrom, prevTo] = [addDays(curFrom, -7), addDays(curFrom, -1)];
      const cur = resolvePeriod("custom", nowMs, { from: curFrom, to: curTo });
      const prev = resolvePeriod("custom", nowMs, { from: prevFrom, to: prevTo });
      const label = kind === "weekly" ? `Week of ${curFrom}` : "Last 7 days";
      const [now, before] = await Promise.all([loadAdminOverview(service, { ...cur, label }, nowMs), loadAdminOverview(service, prev, nowMs)]);
      const facts = buildSummaryFacts(now as unknown as OverviewLike, before as unknown as OverviewLike);
      const allowed = allowedNumbers(facts);

      let summary: string | null = null; let lookAt: string[] = []; let status: "ok" | "rejected" | "error" = "error"; let reason: string | null = null; let cost = 0;
      let retryNote: string | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        const p = summaryPrompt(facts, retryNote);
        const res = await callModel(SUMMARY_MODEL, p.system, p.user, SUMMARY_TOOL, 0.2);
        if (!res.ok) { status = "error"; reason = `model: ${res.error}`; break; }
        cost += openAiUsd(SUMMARY_MODEL, res.promptTokens, res.completionTokens);
        await logOpenAiUsage(service, { functionName: FN, apiType: "openai_business_summary", model: SUMMARY_MODEL, promptTokens: res.promptTokens, completionTokens: res.completionTokens, userId: actorId, triggerSource: internal ? "internal" : "admin" });
        const a = res.args as { summary?: unknown; look_at?: unknown };
        const s = typeof a.summary === "string" ? a.summary.trim() : "";
        const l = Array.isArray(a.look_at) ? (a.look_at as unknown[]).filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, 6) : [];
        const unknown = validateNumbers([s, ...l].join("\n"), allowed);
        if (s && !unknown.length) { summary = s; lookAt = l; status = "ok"; reason = null; break; }
        status = "rejected"; reason = unknown.length ? `numbers not in the data: ${unknown.join(", ")}` : "empty draft"; summary = s; lookAt = l;
        retryNote = `Your previous draft used numbers that are NOT in FACTS: ${unknown.join(", ")}. Use only numbers present in FACTS.`;
      }
      if (status !== "ok") lookAt = fallbackLookAt(facts);
      const { data: row, error: iErr } = await service.from("admin_summaries").insert({
        kind, period_label: label, period_from: curFrom, period_to: curTo, model: SUMMARY_MODEL, prompt_version: SUMMARY_PROMPT_VERSION,
        facts, summary: status === "ok" ? summary : null, look_at: lookAt, status, reason, cost_usd: Math.round(cost * 10000) / 10000, requested_by: actorId,
      }).select("id").single();
      if (iErr) throw new Error(`store: ${iErr.message}`);
      const result = { id: row.id, status, reason, cost_usd: cost };
      await service.rpc("admin_job_finish", { _job: FN, _status: status, _result: result, _error: status === "error" ? reason : null });
      return json({ ok: true, build: BUILD_ID, ...result });
    } catch (e) {
      await service.rpc("admin_job_finish", { _job: FN, _status: "error", _result: null, _error: (e instanceof Error ? e.message : String(e)).slice(0, 500) });
      throw e;
    }
  } catch (e) {
    console.error("[business-summary]", e instanceof Error ? e.message : e);
    return json({ ok: false, error: "server_error" }, 500);
  }
});
