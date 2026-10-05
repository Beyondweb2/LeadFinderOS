import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { recordLeadEvent } from "../_shared/client-setup.ts";
import { startPaidBaseline } from "../_shared/audit-baseline.ts";
import { isUpstreamOutage } from "../_shared/operator-auth.ts";
import { refusalBody, requireAdmin } from "../_shared/access.ts";
import { BASELINE_QUESTIONS } from "../../../src/lib/auditQuestionCounts.ts";
import { dedupeQuestions } from "../../../src/lib/seedGuard.ts";
import { mergeClientContext, selectClientCrawlContext, verifiedBuildFacts } from "../../../src/lib/clientContext.ts";
import { missingQuestionnaireFields } from "../../../src/lib/questionnaireComplete.ts";
import {
  EDITABLE_BASELINE_STATUS_FILTER,
  START_IN_PROGRESS_SKIP,
  describeStartSkip,
  isFrozenBaselineStatus,
  isStartedBaselineStatus,
  normalizePaidBaselineStatus,
  paidBaselineRunState,
  requireUpdatedRow,
} from "../../../src/lib/paidBaselineState.ts";
import { coverageReport, nearDuplicates } from "../../../src/lib/baselineMix.ts";
import { backlogCandidates, describeDraft, hookProtection, recommendBaseline, type HookReplacement, type RecInput } from "../../../src/lib/baselineRecommendation.ts";
import { normaliseOpportunity } from "../../../src/lib/opportunityBacklog.ts";
import { discoveryScope, discoveryState, generateDiscoveryPool, hookQuestionsFor, mixContext, opportunityCheckResults, startDiscoveryRun, storePoolVersion, DISCOVERY_MAX_QUESTIONS, DISCOVERY_RUNS, DISCOVERY_USD_PER_QUESTION_RUN, type DiscoveryState, type DiscoveryStore } from "../_shared/baseline-discovery.ts";
import { resolveServiceTruth, splitServiceList } from "../../../src/lib/serviceScope.ts";
import { assessBaselineQuality, acceptedOverrides, unresolvedBlocks, QUALITY_OVERRIDE_MIN_REASON, type QualityOverride } from "../../../src/lib/baselineQuality.ts";
import { coreQuestions } from "../../../src/lib/customerQuestion.ts";
import { placeSuffixForCountry } from "../../../src/lib/seedGuard.ts";
import { loadMeasurementHealth, retryMissingCells } from "../_shared/audit-baseline.ts";
import { budgetState } from "../_shared/audit-budget.ts";
import { maybeSendRemeasureResults } from "../_shared/remeasure-results.ts";
import { SOURCES } from "../_shared/enrichment/sources.ts";
import type { MeasurementHealth } from "../../../src/lib/measurementHealth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const errMsg = (e: unknown) => e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e);

function cleanQuestions(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [];
  return dedupeQuestions(raw.filter((q): q is string => typeof q === "string")
    .map((q) => q.trim()).filter(Boolean)).questions;
}

function cleanList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return [...new Set(raw.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean))];
}

/** The compact health line the hub shows (src/lib/measurementHealth.ts). */
const summariseHealth = (h: MeasurementHealth) => ({
  state: h.state, expected: h.expectedCells, answered: h.answeredCells, missing: h.missing.length,
  retryable: h.retryableRowIds.length, label: h.label, action: h.action,
});
/** A written reason for accepting a measurement as partial must say something. */
const PARTIAL_MIN_REASON = 10;

/** Recommendation inputs from the Discovery state: each pool question with its measurement. */
const recInputsOf = (d: DiscoveryState): RecInput[] => d.pool.map((p) => ({ question: p.question, engines: p.opportunity?.engines ?? null, verdict: p.opportunity?.verdict ?? null }));

/** The minimum an exceptional correction's reason must say (reopening an approved, not-yet-started set). */
const CORRECTION_MIN_REASON = 10;
const OPPORTUNITY_COLUMNS = "id,lead_id,question,service,area,intent,source,source_audit_id,visibility,competitors,evidence_gap,suggested_action,action_note,status,what_changed,implemented_at,recheck_due,recheck_audit_id,recheck_result,history,created_at,updated_at";

const MISSING_FIELD_LABEL: Record<string, string> = {
  confirmed_location: "a confirmed primary location",
  services: "at least one service",
};

/**
 * The same gate startPaidBaseline applies before it will spend, asked at APPROVAL so the operator
 * hears it while the context is still editable. Without this, approve succeeded and run was
 * silently deferred ("awaiting_questionnaire_2 (services)") — the row sat at `approved` for ever
 * and the screen showed the frozen questions with nothing to do (MCLocksmiths, 2026-09-22).
 * ⚠️ Reads the ONBOARDING ROW, not the merged context: the engine reads the row.
 */
function contextRefusal(
  row: { confirmed_location?: unknown; services?: unknown; services_list?: unknown },
  details: { business_type: string; location: string },
): { error: string; detail: string } | null {
  const missing = missingQuestionnaireFields({
    confirmed_location: typeof row.confirmed_location === "string" ? row.confirmed_location : null,
    services: typeof row.services === "string" ? row.services : null,
    services_list: row.services_list,
  });
  if (missing.length) {
    const named = missing.map((f) => MISSING_FIELD_LABEL[f] ?? f).join(" and ");
    return {
      error: "baseline_context_incomplete",
      detail: `The baseline records ${named} it is measured on, and the client record has none saved. `
        + `Fill it in section A and press Save client context, then approve.`,
    };
  }
  if (!details.business_type) return { error: "no_business_type", detail: "Add a business category in section A and save it before approving." };
  if (!details.location) return { error: "no_location", detail: "Add a primary location in section A and save it before approving." };
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  try {
    /* The auth service not answering is 503 auth_unavailable, never 401 (_shared/operator-auth.ts). */
    /* ⛔ ADMIN ONLY (2026-09-27, multi-user): paid clients, delivery and money. A sales login is refused
       here whatever the screen shows. requireAdmin resolves the caller with the same operator-auth. */
    const gate = await requireAdmin(req, createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } }));
    if (!gate.ok) return json(refusalBody(gate), gate.status);
    const user = { id: gate.actor.id, email: gate.actor.email };
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "get";
    const onboardingId = typeof body.onboarding_id === "string" ? body.onboarding_id.trim() : "";
    const leadId = typeof body.lead_id === "string" ? body.lead_id.trim() : "";
    if (!onboardingId && !leadId) return json({ ok: false, error: "onboarding_id_or_lead_id_required" }, 400);

    const url = Deno.env.get("SUPABASE_URL")!;
    const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    let q = service.from("onboarding_responses")
      .select("id, lead_id, status, confirmed_location, services, services_list, areas_list, areas_wanted, baseline_status, baseline_questions, baseline_approved_at, baseline_approved_by, audit_id, baseline_discovery, baseline_meta, services_not_offered, top_requests, must_not_say")
      .eq("status", "paid");
    if (onboardingId) q = q.eq("id", onboardingId);
    else q = q.eq("lead_id", leadId).order("updated_at", { ascending: false }).limit(1);
    const { data: rows, error: readErr } = await q;
    if (readErr) throw readErr;
    const row = (rows ?? [])[0] as Record<string, unknown> | undefined;
    if (!row?.id || !row.lead_id) {
      return json({
        ok: false, error: "paid_onboarding_not_found",
        detail: "This client has no onboarding answers yet, so there is nothing to build the baseline from. "
          + "Use Complete onboarding manually on the client page, then prepare the baseline.",
      }, 404);
    }

    const { data: lead, error: leadErr } = await service.from("outreach_leads")
      .select("id, user_id, business_name, category, search_keyword, search_location, derived_town, website, country, services_included, service_areas, website_build, baseline_audit_id, remeasure_audit_id, remeasure_results_sent_at")
      .eq("id", row.lead_id).eq("user_id", user.id).maybeSingle();
    if (leadErr) throw leadErr;
    if (!lead) return json({ ok: false, error: "lead_not_found" }, 404);

    const { data: crawlRow } = await service.from("lead_crawl_checks")
      .select("result, created_at, mode").eq("lead_id", row.lead_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const { data: recentAudits } = await service.from("ai_audits").select("id").eq("lead_id", row.lead_id).order("created_at", { ascending: false }).limit(5);
    const auditIds = (recentAudits ?? []).map((audit: { id?: string }) => audit.id).filter((id): id is string => !!id);
    const { data: recentRuns } = auditIds.length
      ? await service.from("ai_audit_runs").select("results, created_at").in("audit_id", auditIds).order("created_at", { ascending: false }).limit(10)
      : { data: [] };
    /* PRIOR DISCOVERY CONTEXT — the business facts the operator typed into the newest Discovery
       scan of this lead, reused so they are not typed twice. ⛔ ITS QUESTIONS ARE NEVER READ:
       Discovery is separate research and the baseline set is approved on its own (section C). */
    const { data: discoveryAudit } = await service.from("ai_audits")
      .select("id, created_at, business_type, location_text, website, specialism")
      .eq("lead_id", row.lead_id).eq("audit_purpose", "discovery")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    const selectedCrawl = selectClientCrawlContext({
      runCrawls: (recentRuns ?? []).map((run: { results?: { crawl_check?: unknown }; created_at?: string }) => ({ result: run.results?.crawl_check, created_at: run.created_at })),
      leadCrawl: crawlRow as Record<string, unknown> | null,
      website: String(lead.website || ""),
    });
    const crawlInfo = selectedCrawl?.info ?? null;
    /* PRIORITY: onboarding (client or operator-entered) → verified build facts → lead → Discovery;
       the crawl only DETECTS (src/lib/clientContext.ts). */
    const merged = mergeClientContext({
      onboarding: { confirmed_location: row.confirmed_location, services: row.services, services_list: row.services_list, areas_list: row.areas_list, areas_wanted: row.areas_wanted },
      buildFacts: verifiedBuildFacts((lead as { website_build?: unknown }).website_build),
      lead: lead as Record<string, unknown>,
      discovery: discoveryAudit as Record<string, unknown> | null,
      crawl: crawlInfo,
    });
    const status = normalizePaidBaselineStatus(row.baseline_status);
    const questions = cleanQuestions(row.baseline_questions);
    /* DISCOVERY (before the baseline): the stored pool and, when a Discovery audit has answers, each
       question's opportunity. Read only — opening this screen asks no AI engine. */
    /* ⛔ BUSINESS TRUTH (2026-10-04, src/lib/serviceScope.ts). The client's own "we do NOT offer" list
       travels with every Discovery generation and every check below; the services are the winning
       list only (mergeClientContext no longer concatenates sources). */
    const notOffered = splitServiceList((row as { services_not_offered?: unknown }).services_not_offered);
    const discoveryInput = {
      businessName: String(lead.business_name ?? ""), businessCategory: merged.business_category, website: merged.website,
      country: String(lead.country ?? ""), primaryTown: merged.primary_location, areas: merged.service_areas, services: merged.services,
      notOffered, mustNotSay: String((row as { must_not_say?: unknown }).must_not_say ?? "").trim(),
    };
    const scope = discoveryScope(discoveryInput);
    /* The two mandatory core questions for the home town (customerQuestion.ts, C-03). */
    const core = merged.business_category && merged.primary_location
      ? coreQuestions(merged.business_category, merged.primary_location, placeSuffixForCountry(String(lead.country ?? "")))
      : [];
    const store = (row.baseline_discovery && typeof row.baseline_discovery === "object") ? row.baseline_discovery as DiscoveryStore : null;
    const biz = { name: discoveryInput.businessName, location: merged.primary_location, website: merged.website, trade: merged.business_category };
    const [discovery, hook] = await Promise.all([
      discoveryState(service, store, String(row.lead_id), biz),
      hookQuestionsFor(service, String(row.lead_id), (lead as { baseline_audit_id?: string | null }).baseline_audit_id ?? null, biz),
    ]);
    const mixCtx = mixContext(discoveryInput);
    const coverage = coverageReport(questions, mixCtx, BASELINE_QUESTIONS);
    /* THE RECOMMENDED OFFICIAL 20 (src/lib/baselineRecommendation.ts): the Hook Audit's questions
       locked in, the rest balanced from Discovery, opportunity only as a tie-break. Read only —
       computed on every read from the stored pool and answers, never stored. */
    const recArgs = (d: DiscoveryState) => ({ hook: hook.questions, pool: recInputsOf(d), hookMeasures: hook.measures, ctx: mixCtx, trade: merged.business_category, scope, core });
    const recommendation = recommendBaseline({ ...recArgs(discovery), target: BASELINE_QUESTIONS });
    /* THE FINAL-20 CHECKS (src/lib/baselineQuality.ts) — computed on every read for whatever draft is
       stored, and again at approval for the exact set being frozen. */
    const qualityOf = (qs: string[]) => assessBaselineQuality({
      questions: qs, scope, primaryTown: merged.primary_location, areas: mixCtx.areas, businessName: String(lead.business_name ?? ""),
      trade: merged.business_category, hookQuestions: hook.questions, servicesClientConfirmed: merged.services_client_confirmed,
    });
    const quality = qualityOf(questions);
    /* THE MEASUREMENT'S HEALTH (src/lib/measurementHealth.ts) and the BUDGET (src/lib/auditBudget.ts):
       read only, so Paul sees complete / partial / capped / failed and whether client measurement has
       room — never a silent "Baseline running". */
    const pointer = (lead as { baseline_audit_id?: string | null }).baseline_audit_id ?? (typeof row.audit_id === "string" ? row.audit_id : null);
    const replayId = (lead as { remeasure_audit_id?: string | null }).remeasure_audit_id ?? null;
    const [baselineHealth, replayHealth, budget] = await Promise.all([
      pointer ? loadMeasurementHealth(service, pointer) : Promise.resolve(null),
      replayId ? loadMeasurementHealth(service, replayId) : Promise.resolve(null),
      budgetState(service, String((lead as { user_id?: string }).user_id ?? ""), SOURCES.ai_search.estCostUsd).catch(() => null),
    ]);
    const details = {
      onboarding_id: row.id, lead_id: row.lead_id, business_name: merged.business_name,
      business_type: merged.business_category, location: merged.primary_location,
      services: merged.services.join(", "), services_list: merged.services, areas_list: merged.service_areas, website: merged.website,
      context_sources: { service_sources: merged.service_sources, area_sources: merged.area_sources },
      detected: { services: merged.detected_services, areas: merged.detected_areas },
      crawl_context_at: selectedCrawl?.created_at ?? null,
      crawl_context_source: selectedCrawl?.source ?? null,
      discovery_context: discoveryAudit?.id ? { audit_id: String(discoveryAudit.id), created_at: (discoveryAudit.created_at as string | null) ?? null } : null,
      status, questions, approved_at: row.baseline_approved_at || null,
      discovery, coverage, hook, recommendation,
      meta: (row.baseline_meta && typeof row.baseline_meta === "object") ? row.baseline_meta : null,
      canonical_services: mixCtx.services.map((x) => x.label),
      ...(typeof row.audit_id === "string" && row.audit_id ? { audit_id: row.audit_id } : {}),
      /* 2026-10-04 (fix/04): business truth, the final-20 checks, the measurement's health, the budget. */
      services_not_offered: notOffered,
      top_requests: String((row as { top_requests?: unknown }).top_requests ?? ""),
      services_client_confirmed: merged.services_client_confirmed,
      unconfirmed: { services: merged.unconfirmed_services, areas: merged.unconfirmed_areas },
      core_questions: core,
      quality: { blocking: quality.blocking, warnings: quality.warnings, coverage: quality.coverage, override_min_reason: QUALITY_OVERRIDE_MIN_REASON },
      health: baselineHealth ? { audit_id: pointer, ...summariseHealth(baselineHealth.health), frozen_at: baselineHealth.frozenAt, retry_rounds: baselineHealth.retryRounds } : null,
      remeasure: replayId ? {
        audit_id: replayId, results_sent_at: (lead as { remeasure_results_sent_at?: string | null }).remeasure_results_sent_at ?? null,
        health: replayHealth ? { ...summariseHealth(replayHealth.health), frozen_at: replayHealth.frozenAt } : null,
      } : null,
      budget,
    };
    if (action === "get") return json({ ok: true, baseline: details });

    if (["generate", "balanced", "discovery_generate", "discovery_run", "save", "approve", "run", "save_context", "reopen_approved", "opportunities", "opportunity_save", "opportunity_check", "retry_missing", "accept_partial", "send_results"].indexOf(action) < 0) return json({ ok: false, error: "unsupported_action" }, 400);
    const leadOwner = String((lead as { user_id?: string }).user_id ?? user.id);
    const callEnvEarly = { url, secret: Deno.env.get("CRON_SECRET") ?? "", serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", userId: user.id };

    /* ══ THE OPPORTUNITY BACKLOG / ONGOING IMPROVEMENTS (src/lib/opportunityBacklog.ts) ══════════════
       Any baseline status: this is the work AFTER the baseline. ⛔ Never read by the guarantee — the
       before/after is the baseline audit vs the day-28 replay, keyed by audit id. */
    if (action === "opportunities") {
      const { data: items, error } = await service.from("client_opportunities").select(OPPORTUNITY_COLUMNS).eq("lead_id", row.lead_id).order("created_at", { ascending: true });
      if (error) throw error;
      const list = (items ?? []) as Array<Record<string, unknown>>;
      const checks = await opportunityCheckResults(service, list.map((i) => String(i.recheck_audit_id ?? "")), biz);
      return json({ ok: true, baseline: details, opportunities: list, checks, check_usd_per_question: Math.round(DISCOVERY_RUNS * DISCOVERY_USD_PER_QUESTION_RUN * 1000) / 1000 });
    }
    if (action === "opportunity_save") {
      const patch = normaliseOpportunity((body.item && typeof body.item === "object") ? body.item as Record<string, unknown> : {});
      const id = typeof body.id === "string" ? body.id : "";
      const now = new Date().toISOString();
      if (!id) {
        if (!patch.question) return json({ ok: false, error: "opportunity_question_required", detail: "Type the question or intent to track." }, 400);
        const { data: made, error } = await service.from("client_opportunities").insert({
          user_id: leadOwner, lead_id: row.lead_id, source: "manual", status: patch.status ?? "new", ...patch,
          history: [{ at: now, by: user.id, status: patch.status ?? "new", note: "added by hand" }],
        }).select(OPPORTUNITY_COLUMNS).maybeSingle();
        if (error) {
          if ((error as { code?: string }).code === "23505") return json({ ok: false, error: "opportunity_exists", detail: "That question is already in this client's backlog." }, 409);
          throw error;
        }
        return json({ ok: true, baseline: details, item: made });
      }
      const { data: cur, error: curErr } = await service.from("client_opportunities").select("id,status,history").eq("id", id).eq("lead_id", row.lead_id).maybeSingle();
      if (curErr) throw curErr;
      if (!cur) return json({ ok: false, error: "opportunity_not_found" }, 404);
      const history = Array.isArray(cur.history) ? cur.history as unknown[] : [];
      const statusChanged = patch.status && patch.status !== cur.status;
      const update: Record<string, unknown> = { ...patch, updated_at: now };
      if (statusChanged) {
        update.history = [...history, { at: now, by: user.id, from: cur.status, status: patch.status, note: patch.what_changed ?? null }].slice(-50);
        if (patch.status === "implemented") update.implemented_at = now;
      }
      const { data: saved, error } = await service.from("client_opportunities").update(update).eq("id", id).eq("lead_id", row.lead_id).select(OPPORTUNITY_COLUMNS).maybeSingle();
      if (error) throw error;
      return json({ ok: true, baseline: details, item: saved });
    }
    /* A CHECK spends: the chosen questions × DISCOVERY_RUNS on both engines, priced on its button and
       confirmed. It is an ordinary Discovery audit on this lead — never the baseline, never the replay. */
    if (action === "opportunity_check") {
      const ids = Array.isArray(body.ids) ? (body.ids as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 20) : [];
      if (!ids.length) return json({ ok: false, error: "opportunity_ids_required", detail: "Choose at least one opportunity to check." }, 400);
      if (body.confirm_cost !== true) return json({ ok: false, error: "confirm_cost_required", detail: "A check asks ChatGPT and Gemini — confirm the cost on the button." }, 400);
      const { data: items, error } = await service.from("client_opportunities").select("id,question,status,history").eq("lead_id", row.lead_id).in("id", ids);
      if (error) throw error;
      const list = (items ?? []) as Array<{ id: string; question: string; status: string; history: unknown }>;
      if (!list.length) return json({ ok: false, error: "opportunity_not_found" }, 404);
      if (!discoveryInput.primaryTown || !discoveryInput.businessCategory) return json({ ok: false, error: "baseline_context_incomplete", detail: "A check needs a primary town and a business category." }, 422);
      let auditId: string;
      try {
        auditId = await startDiscoveryRun({ ...discoveryInput, leadId: String(row.lead_id) }, list.map((i) => i.question), callEnvEarly);
      } catch (e) {
        return json({ ok: false, error: "opportunity_check_failed", detail: `The check did not start: ${errMsg(e)}. Nothing was measured — try again.` }, 502);
      }
      const now = new Date().toISOString();
      for (const i of list) {
        const history = Array.isArray(i.history) ? i.history as unknown[] : [];
        await service.from("client_opportunities").update({
          recheck_audit_id: auditId, updated_at: now,
          history: [...history, { at: now, by: user.id, check_audit_id: auditId, note: "check started" }].slice(-50),
        }).eq("id", i.id).eq("lead_id", row.lead_id);
      }
      return json({ ok: true, baseline: details, audit_id: auditId, checked: list.length });
    }

    /* ══ EXCEPTIONAL CORRECTION of an APPROVED set that has NOT started (Paul, 2026-09-30) ═══════════
       Approval freezes. The only way back is this: an explicit action, a written reason, the history
       kept on baseline_meta.corrections. ⛔ Once the measurement has begun (starting / running /
       complete) the frozen set can never change — the day-28 replay repeats what was ASKED. */
    if (action === "reopen_approved") {
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (status !== "approved") {
        return json({ ok: false, error: "baseline_not_reopenable", detail: isStartedBaselineStatus(status)
          ? "The baseline has started measuring. Its frozen questions can never change now — the re-measure repeats exactly what was asked."
          : "Only an approved baseline that has not started can be reopened." }, 409);
      }
      if (reason.length < CORRECTION_MIN_REASON) return json({ ok: false, error: "correction_reason_required", detail: "Write why the approved questions must change (a factual or business error)." }, 400);
      const now = new Date().toISOString();
      const prior = (row.baseline_meta && typeof row.baseline_meta === "object") ? row.baseline_meta as Record<string, unknown> : {};
      const corrections = Array.isArray(prior.corrections) ? prior.corrections as unknown[] : [];
      const meta = { ...prior, corrections: [...corrections, { at: now, by: user.id, reason, questions_before: questions, approved_at_before: row.baseline_approved_at ?? null }] };
      const { data: updated, error } = await service.from("onboarding_responses").update({
        baseline_status: "needs_approval", baseline_meta: meta, updated_at: now,
      }).eq("id", row.id).eq("status", "paid").eq("baseline_status", "approved").select("id").maybeSingle();
      if (error) throw error;
      requireUpdatedRow(updated, "baseline_state_changed");
      return json({ ok: true, baseline: { ...details, status: "needs_approval", meta } });
    }
    /* ══ RECOVERY (2026-10-04, fix/04 — Session C C-10 / C-11) ═════════════════════════════════════
       retry_missing  — re-ask ONLY the failed cells of the baseline (or the day-28 replay) inside its
                        existing runs. The claim is the conditional failed → pending update in
                        retryMissingCells: no duplicate cell, no new run, no second pointer, the frozen
                        question text untouched. Refused once the measurement has frozen.
       accept_partial — Paul accepts a measurement whose missing cells cannot be re-asked, with a written
                        reason kept on baseline_meta.partial_accepted; the next tick freezes it, and the
                        snapshot records it as partial. Never fabricates an answer.
       send_results   — the four-week results, through the SAME claim-first sender as the queue
                        (remeasure-results.ts): still held while REMEASURE_RESULTS_COPY_APPROVED is false,
                        still refused for an ended client, never sent twice. */
    if (action === "retry_missing" || action === "accept_partial") {
      const target = body.target === "remeasure" ? "remeasure" : "baseline";
      const auditId = target === "remeasure" ? replayId : pointer;
      if (!auditId) return json({ ok: false, error: "no_measurement", detail: target === "remeasure" ? "There is no re-measure for this client yet." : "This client has no baseline measurement yet." }, 409);
      if (action === "retry_missing") {
        const r = await retryMissingCells(service, auditId, `operator:${user.id}`);
        if (!r.ok) {
          return json({ ok: false, error: r.reason === "frozen" ? "measurement_frozen" : "retry_failed", detail: r.reason === "frozen" ? "This measurement has already frozen — its answers can no longer change." : `Nothing was re-asked: ${r.reason}.` }, 409);
        }
        await recordLeadEvent(service, String(row.lead_id), "baseline_run", { actor: user.id, source: "admin", body: r.requeued ? `Missing answers re-asked (${r.requeued})` : "Retry pressed — nothing was missing", data: { audit_id: auditId, requeued: r.requeued, target } });
        return json({ ok: true, baseline: details, requeued: r.requeued, ...(r.requeued ? {} : { skipped: r.reason ?? "nothing_to_retry" }) });
      }
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      if (reason.length < PARTIAL_MIN_REASON) return json({ ok: false, error: "partial_reason_required", detail: "Write why this measurement should be frozen with answers missing." }, 400);
      const h = target === "remeasure" ? replayHealth : baselineHealth;
      if (!h || h.frozenAt) return json({ ok: false, error: "measurement_frozen", detail: "This measurement has already frozen." }, 409);
      /* Only a measurement whose missing cells CANNOT be re-asked. Retryable cells are retried first —
         accepting them as missing would settle the refund on answers we could still get. */
      if (h.health.retryableRowIds.length > 0) {
        return json({ ok: false, error: "retry_first", detail: `${h.health.retryableRowIds.length} missing question(s) can still be re-asked. Press Retry missing answers first.` }, 409);
      }
      if (h.health.state !== "partial") return json({ ok: false, error: "not_partial", detail: `The measurement is ${h.health.state.replace("_", " ")}, not partial.` }, 409);
      const now = new Date().toISOString();
      const prior = (row.baseline_meta && typeof row.baseline_meta === "object") ? row.baseline_meta as Record<string, unknown> : {};
      const accepted = (prior.partial_accepted && typeof prior.partial_accepted === "object") ? prior.partial_accepted as Record<string, unknown> : {};
      const meta = { ...prior, partial_accepted: { ...accepted, [auditId]: { at: now, by: user.id, reason, answered: h.health.answeredCells, expected: h.health.expectedCells } } };
      const { error } = await service.from("onboarding_responses").update({ baseline_meta: meta, updated_at: now }).eq("id", row.id).eq("status", "paid");
      if (error) throw error;
      await recordLeadEvent(service, String(row.lead_id), "baseline_run", { actor: user.id, source: "admin", body: `Measurement accepted as partial (${h.health.answeredCells} of ${h.health.expectedCells})`, data: { audit_id: auditId, reason, target } });
      return json({ ok: true, baseline: { ...details, meta } });
    }
    if (action === "send_results") {
      if (!replayId) return json({ ok: false, error: "no_remeasure", detail: "There is no re-measure for this client yet." }, 409);
      const outcome = await maybeSendRemeasureResults(service, replayId, { quietHold: false });
      return json({ ok: outcome.kind === "sent", baseline: details, results: outcome, ...(outcome.kind === "sent" ? {} : { error: `results_${outcome.kind}`, detail: outcome.reason }) }, outcome.kind === "sent" ? 200 : 409);
    }

    /* starting / running / complete: the measurement has begun (or is being claimed by another
       starter this second). Every mutation answers with the row as it is — including `run`, so the
       screen that lost the claim shows "Starting baseline" and polls, never a second start. */
    if (isStartedBaselineStatus(status)) return json({ ok: true, baseline: details, skipped: "already_started" });
    /* ⛔ A LEAD THAT ALREADY HAS A BASELINE POINTER IS NEVER RE-DRAFTED (C-26, 2026-10-04). A legacy
       client paid before baseline_status existed (RG, Ronnie) reads as `needs_questions`, and the hub
       only HID the buttons — the server let a new set be generated, saved and approved. The replay is
       safe either way (it reads the pointer), but a second "approved" set beside a frozen baseline is
       a document that contradicts the measurement. */
    if ((lead as { baseline_audit_id?: string | null }).baseline_audit_id
      && ["generate", "balanced", "discovery_generate", "discovery_run", "save", "approve"].includes(action)) {
      return json({ ok: false, error: "baseline_already_measured", detail: "This client already has a baseline measurement. Its questions are frozen; nothing new can be drafted or approved for it." }, 409);
    }

    /* Context is saved on the same lead/onboarding pair the baseline already reads. This is only
       an operator convenience for incomplete manual/onboarding records; it never creates a second
       audit profile and is locked once the measurement has begun. It stays OPEN while the row is
       `approved`: the questions are frozen, the context is not, and a row approved without services
       needs exactly this edit to become startable. */
    if (action === "save_context") {
      /* 🔴 THIS USED TO WRITE THE MERGED LISTS BACK (Session C C-08): a field the screen did not send
         fell back to `details`, i.e. onboarding + build facts + what Sales typed + Discovery, and was
         then stored on the onboarding row as if the client had said it. ⛔ Now only what Paul actually
         SENT is written; a list he did not send keeps the row's own value, never the merged one. */
      const location = typeof body.location === "string" ? body.location.trim() : String(row.confirmed_location ?? "").trim();
      const services = typeof body.services === "string" ? body.services.trim() : String(row.services ?? "").trim();
      const serviceList = cleanList(Array.isArray(body.services_list) ? body.services_list : row.services_list);
      const areas = cleanList(Array.isArray(body.areas_list) ? body.areas_list : row.areas_list);
      const businessType = typeof body.business_type === "string" ? body.business_type.trim() : String(details.business_type ?? "").trim();
      const website = typeof body.website === "string" ? body.website.trim() : String(details.website ?? "").trim();
      /* The client's negatives and top requests (2026-10-04) — written only when sent. */
      const truthPatch: Record<string, unknown> = {};
      if (typeof body.services_not_offered === "string") truthPatch.services_not_offered = body.services_not_offered.trim().slice(0, 2000) || null;
      if (typeof body.top_requests === "string") truthPatch.top_requests = body.top_requests.trim().slice(0, 2000) || null;
      if (!location || !businessType) return json({ ok: false, error: "location_and_business_type_required" }, 400);
      const now = new Date().toISOString();
      const { data: updatedOnboarding, error: onErr } = await service.from("onboarding_responses").update({
        confirmed_location: location, services, services_list: serviceList, areas_list: areas, ...truthPatch, updated_at: now,
      }).eq("id", row.id).eq("status", "paid").select("id").maybeSingle();
      if (onErr) throw onErr;
      requireUpdatedRow(updatedOnboarding, "paid_onboarding_update_conflict");
      const { data: updatedLead, error: leadUpdateErr } = await service.from("outreach_leads").update({
        category: businessType, website: website || null, search_location: location,
      }).eq("id", lead.id).eq("user_id", user.id).select("id").maybeSingle();
      if (leadUpdateErr) throw leadUpdateErr;
      requireUpdatedRow(updatedLead, "lead_update_conflict");
      return json({
        ok: true, baseline: {
          ...details, location, services, services_list: serviceList, areas_list: areas, business_type: businessType, website,
          ...(typeof truthPatch.services_not_offered !== "undefined" ? { services_not_offered: splitServiceList(truthPatch.services_not_offered) } : {}),
          ...(typeof truthPatch.top_requests !== "undefined" ? { top_requests: String(truthPatch.top_requests ?? "") } : {}),
        },
      });
    }

    let next = questions;
    const callEnv = callEnvEarly;

    /* ══ DISCOVERY — generate the pool (one question-writing call per approved town; no AI engine is
       asked). Replaces any earlier pool; never touches the baseline draft. ═════════════════════════ */
    if (action === "discovery_generate") {
      if (isFrozenBaselineStatus(status)) return json({ ok: false, error: "baseline_questions_locked" }, 409);
      if (!discoveryInput.primaryTown || !discoveryInput.businessCategory) return json({ ok: false, error: "baseline_context_incomplete", detail: "Discovery needs a primary town and a business category — complete onboarding first." }, 422);
      /* ⛔ NOT WHILE A JOB IS MEASURING THIS POOL. Replacing the pool mid-run would leave a job
         spending on questions nobody can see, and mix its answers into a pool it never asked. */
      if (discovery.starting || discovery.audit?.progress.status === "running") {
        return json({ ok: false, error: "discovery_running", detail: "Discovery is still measuring the current questions. Wait for it to finish, then regenerate — its results are kept either way." }, 409);
      }
      const fresh = await generateDiscoveryPool(discoveryInput, callEnv);
      if (!fresh.pool.length) return json({ ok: false, error: "question_generation_failed", detail: "No Discovery questions came back. Try again in a moment." }, 502);
      /* The old pool's job is KEPT, attached to the old pool version — its audit and every answer stay
         in ai_audits / ai_audit_queue untouched; the new pool starts unmeasured. */
      const oldVersion = storePoolVersion(store);
      const oldAudit = discovery.audit?.id ?? store?.audit_id ?? null;
      if (store && oldVersion) {
        fresh.history = [{ pool_version: oldVersion, generated_at: store.generated_at, questions: store.pool.length, audit_id: oldAudit }, ...(store.history ?? [])].slice(0, 10);
      }
      const { error: e } = await service.from("onboarding_responses").update({ baseline_discovery: fresh, updated_at: new Date().toISOString() }).eq("id", row.id).eq("status", "paid");
      if (e) throw e;
      const state = await discoveryState(service, fresh, String(row.lead_id), biz);
      return json({ ok: true, baseline: { ...details, discovery: state } });
    }

    /* ══ DISCOVERY — measure the pool (priced on its button; an explicit press only). ═══════════ */
    if (action === "discovery_run") {
      if (isFrozenBaselineStatus(status)) return json({ ok: false, error: "baseline_questions_locked" }, 409);
      const pool = (store?.pool ?? []).map((p) => p.question).slice(0, DISCOVERY_MAX_QUESTIONS);
      if (!pool.length) return json({ ok: false, error: "no_discovery_pool", detail: "Generate the Discovery questions first." }, 409);
      /* ⛔ ONE JOB PER POOL. A pool that already has a job answers with that job — running shows its
         progress, finished says so — and never starts a second, identical, paid measurement. A new
         Discovery means new questions: Regenerate (which keeps the old job in history). */
      if (discovery.starting) return json({ ok: true, baseline: details, skipped: "discovery_starting" });
      if (discovery.audit) {
        if (discovery.audit.progress.status === "running") return json({ ok: true, baseline: details, skipped: "discovery_running" });
        return json({ ok: false, error: "discovery_already_run", detail: "Discovery has already measured these questions — its results are shown below. To measure again, regenerate the Discovery questions first." }, 409);
      }
      if (body.confirm_cost !== true) return json({ ok: false, error: "confirm_cost_required", detail: "Discovery asks ChatGPT and Gemini — confirm the cost on the button." }, 400);
      /* ⛔ THE START CLAIM — the database decides, not a read a second ago (CLAUDE.md §4: a
         correctness decision never reads a copy that races its own write). A compare-and-set on the
         stored pool: same pool (generated_at), no job attached (audit_id null), and the claim we read
         (none, or a stale one). Two presses from two tabs: exactly one update lands; the other gets
         no row back and answers with the job that is starting. */
      const claimAt = new Date().toISOString();
      const prevClaim = store?.run_claimed_at ?? null;
      const version = storePoolVersion(store);
      /* A stored audit id reaching here measured a DIFFERENT question set (discovery.mismatch) — it is
         kept in history, never overwritten silently. */
      const prevAudit = store?.audit_id ?? null;
      const claimedStore: DiscoveryStore = {
        ...(store as DiscoveryStore), pool_version: version ?? undefined, run_claimed_at: claimAt,
        ...(prevAudit && version ? { history: [{ pool_version: store?.audit_pool_version ?? "unknown", generated_at: String(store?.generated_at ?? ""), questions: 0, audit_id: prevAudit }, ...(store?.history ?? [])].slice(0, 10) } : {}),
      };
      let claimQ = service.from("onboarding_responses")
        .update({ baseline_discovery: claimedStore })
        .eq("id", row.id).eq("status", "paid")
        .eq("baseline_discovery->>generated_at", String(store?.generated_at ?? ""));
      claimQ = prevAudit ? claimQ.eq("baseline_discovery->>audit_id", prevAudit) : claimQ.is("baseline_discovery->>audit_id", null);
      claimQ = prevClaim ? claimQ.eq("baseline_discovery->>run_claimed_at", prevClaim) : claimQ.is("baseline_discovery->>run_claimed_at", null);
      const { data: claimed, error: claimErr } = await claimQ.select("id").maybeSingle();
      if (claimErr) throw claimErr;
      if (!claimed) return json({ ok: true, baseline: details, skipped: "discovery_starting" });
      let auditId: string;
      try {
        auditId = await startDiscoveryRun({ ...discoveryInput, leadId: String(row.lead_id) }, pool, callEnv);
      } catch (startErr) {
        /* Nothing was created: release OUR claim so the press can be retried at once. */
        await service.from("onboarding_responses").update({ baseline_discovery: { ...claimedStore, run_claimed_at: null } })
          .eq("id", row.id).eq("baseline_discovery->>run_claimed_at", claimAt);
        return json({ ok: false, error: "discovery_start_failed", detail: `Discovery did not start: ${errMsg(startErr)}. Nothing was measured — try again.` }, 502);
      }
      const nextStore: DiscoveryStore = { ...claimedStore, audit_id: auditId, audit_pool_version: version, run_started_at: new Date().toISOString() };
      /* If this write is lost, discoveryState's fallback still finds the audit (newest Discovery audit
         of the lead after the pool, whose questions belong to the pool), so it cannot be started twice. */
      const { error: e } = await service.from("onboarding_responses").update({ baseline_discovery: nextStore }).eq("id", row.id).eq("status", "paid");
      if (e) throw e;
      const state = await discoveryState(service, nextStore, String(row.lead_id), biz);
      /* History (2026-10-02): Discovery is a manual, paid step — record who ran it and on how much. */
      await recordLeadEvent(service, String(row.lead_id), "discovery_run", { actor: user.id, source: "admin", body: "Discovery run", data: { audit_id: auditId, pool_version: version, questions: pool.length } });
      return json({ ok: true, baseline: { ...details, discovery: state } });
    }

    /* ══ GENERATE = THE BALANCED BASELINE (2026-09-23) ═════════════════════════════════════════════
       From the Discovery pool (generated first if there is none), plus the questions already in the
       draft that Paul added himself (kept first), balanced across services, approved areas and intent
       types, with no near-duplicates (src/lib/baselineMix.ts). ⛔ It never reads winnability. A DRAFT
       only: nothing is frozen until Paul approves. */
    if (action === "generate" || action === "balanced") {
      if (isFrozenBaselineStatus(status)) return json({ ok: false, error: "baseline_questions_locked" }, 409);
      let poolStore = store;
      if (!poolStore?.pool?.length) {
        if (!discoveryInput.primaryTown || !discoveryInput.businessCategory) return json({ ok: false, error: "baseline_context_incomplete", detail: "The baseline needs a primary town and a business category — complete onboarding first." }, 422);
        poolStore = await generateDiscoveryPool(discoveryInput, callEnv);
        if (!poolStore.pool.length) return json({ ok: false, error: "question_generation_failed" }, 502);
        await service.from("onboarding_responses").update({ baseline_discovery: poolStore }).eq("id", row.id).eq("status", "paid");
      }
      /* The RECOMMENDED baseline: the Hook Audit's questions locked in, the rest balanced from the
         Discovery pool with its measurements (src/lib/baselineRecommendation.ts). A draft to review. */
      const poolState = poolStore === store ? discovery : await discoveryState(service, poolStore, String(row.lead_id), biz);
      const rec = recommendBaseline({ ...recArgs(poolState), target: BASELINE_QUESTIONS });
      next = rec.questions.map((r) => r.question);
      if (next.length === 0) return json({ ok: false, error: "no_questions_generated" }, 422);
      const { data: updated, error } = await service.from("onboarding_responses").update({
        baseline_questions: next, baseline_status: "needs_approval", updated_at: new Date().toISOString(),
      }).eq("id", row.id).eq("status", "paid").or(EDITABLE_BASELINE_STATUS_FILTER).select("id").maybeSingle();
      if (error) throw error;
      requireUpdatedRow(updated, "baseline_state_changed");
      return json({ ok: true, baseline: { ...details, status: "needs_approval", questions: next, discovery: poolState, recommendation: rec, coverage: coverageReport(next, mixCtx, BASELINE_QUESTIONS) } });
    }

    if (action === "save") {
      if (isFrozenBaselineStatus(status)) return json({ ok: false, error: "baseline_questions_locked" }, 409);
      next = cleanQuestions(body.questions);
      if (next.length === 0 || next.length > 40) return json({ ok: false, error: "questions_must_be_between_1_and_40" }, 400);
      /* ⛔ The write carries the editable-status filter too: a save racing an approval must not
         overwrite the frozen set and reset it to needs_approval. */
      const { data: updated, error } = await service.from("onboarding_responses").update({ baseline_questions: next, baseline_status: "needs_approval", updated_at: new Date().toISOString() }).eq("id", row.id).eq("status", "paid").or(EDITABLE_BASELINE_STATUS_FILTER).select("id").maybeSingle();
      if (error) throw error;
      requireUpdatedRow(updated, "paid_onboarding_update_conflict");
      return json({ ok: true, baseline: { ...details, status: "needs_approval", questions: next, coverage: coverageReport(next, mixCtx, BASELINE_QUESTIONS) } });
    }

    if (action === "approve") {
      if (status === "approved") return json({ ok: true, baseline: details, skipped: "already_approved" });
      next = cleanQuestions(body.questions);
      if (next.length === 0) return json({ ok: false, error: "questions_required" }, 400);
      /* ⛔ APPROVAL IS WHERE THE METHODOLOGY IS ENFORCED, BECAUSE APPROVAL IS WHAT FREEZES.
         The paid baseline is BASELINE_QUESTIONS questions x BASELINE_RUNS runs, and the day-28
         replay must repeat the ASKED set verbatim — so whatever count is approved here is the
         count the refund is settled on, forever. A draft may hold any number while the operator
         works (save still allows 1..40, and a discovery scan may be 80); approving a different
         number would quietly redefine the guarantee's measuring stick.
         ⚠️ Stated exactly, never "at least": both directions are wrong. Deduping 21 pasted
         questions down to 20 is fine; approving 19 is a shorter baseline than the one sold. */
      if (next.length !== BASELINE_QUESTIONS) {
        return json({
          ok: false,
          error: "baseline_question_count",
          detail: `A paid baseline is exactly ${BASELINE_QUESTIONS} questions, and ${next.length} `
            + `${next.length === 1 ? "was" : "were"} approved. Add or remove `
            + `${Math.abs(BASELINE_QUESTIONS - next.length)} before approving — the approved set is `
            + `frozen and replayed verbatim at day 28.`,
        }, 400);
      }
      /* The engine's own start gate, asked here while the answer can still be given. An approved
         row that cannot start is a dead end the operator cannot see; a refused approval is a
         sentence pointing at the field. */
      const refusal = contextRefusal(row, details);
      if (refusal) return json({ ok: false, ...refusal }, 422);
      /* ⛔ NEAR-DUPLICATES ARE FLAGGED BEFORE THE FREEZE. The same question in two wordings makes the
         frozen measuring stick 19 questions pretending to be 20. Paul can still proceed — knowingly. */
      const dups = nearDuplicates(next, [mixCtx.primaryTown, ...mixCtx.areas]);
      if (dups.length && body.accept_duplicates !== true) {
        return json({
          ok: false, error: "baseline_near_duplicates",
          detail: `${dups.length} pair(s) ask the same thing in different words: ${dups.slice(0, 3).map(([a, b]) => `"${next[a]}" / "${next[b]}"`).join("; ")}. Replace them, or tick "approve anyway".`,
        }, 409);
      }
      /* ⛔ THE HOOK AUDIT'S QUESTIONS ARE LOCKED IN (Paul, 2026-09-30). One may leave only with a
         written reason (a factual / business error); the reason is kept on baseline_meta. */
      const replacements: HookReplacement[] = Array.isArray(body.hook_replacements)
        ? (body.hook_replacements as unknown[]).filter((r): r is HookReplacement => !!r && typeof r === "object" && typeof (r as HookReplacement).question === "string" && typeof (r as HookReplacement).reason === "string")
        : [];
      const hp = hookProtection(next, hook.questions, replacements);
      if (hp.unexplained.length) {
        return json({
          ok: false, error: "hook_question_removed",
          detail: `The Hook Audit question${hp.unexplained.length === 1 ? "" : "s"} ${hp.unexplained.map((q) => `"${q}"`).join(", ")} ${hp.unexplained.length === 1 ? "is" : "are"} not in the set. Keep ${hp.unexplained.length === 1 ? "it" : "them"}, or give a reason for replacing ${hp.unexplained.length === 1 ? "it" : "each"} (a factual or business error).`,
        }, 409);
      }
      /* ⛔ THE CONTENT CHECKS (2026-10-04, C-05 / M-028). A branded question, a service the client does
         not offer or never confirmed, a question naming no approved town, or a set with no core
         question about the home town is REFUSED until each is replaced or carries a written reason
         (≥ QUALITY_OVERRIDE_MIN_REASON characters). The Hook Audit's questions are checked like every
         other one. The reasons and the warnings are kept on baseline_meta with the approval. */
      const qualityNow = qualityOf(next);
      const overrides: QualityOverride[] = Array.isArray(body.quality_overrides)
        ? (body.quality_overrides as unknown[]).filter((o): o is QualityOverride => !!o && typeof o === "object" && typeof (o as QualityOverride).code === "string" && typeof (o as QualityOverride).reason === "string")
        : [];
      const unresolved = unresolvedBlocks(qualityNow.blocking, overrides);
      if (unresolved.length) {
        return json({
          ok: false, error: "baseline_quality_blocked",
          detail: `${unresolved.length} check${unresolved.length === 1 ? "" : "s"} must be fixed or explained before freezing: ${unresolved.slice(0, 3).map((u) => (u.question ? `"${u.question}" — ${u.message}` : u.message)).join(" · ")}${unresolved.length > 3 ? " …" : ""}`,
          blocking: unresolved,
        }, 409);
      }
      const now = new Date().toISOString();
      const prior = (row.baseline_meta && typeof row.baseline_meta === "object") ? row.baseline_meta as Record<string, unknown> : {};
      /* THE APPROVAL RECORD. It describes the frozen set; it never changes what is measured (that is
         baseline_questions, exactly as before). */
      const meta = {
        version: 1, approved_at: now, approved_by: user.id,
        hook_audit_id: hook.audit_id, hook_questions: hook.questions, hook_replacements: hp.explained,
        sources: describeDraft(next, recArgs(discovery)).map((r) => ({ question: r.question, source: r.source })),
        corrections: Array.isArray(prior.corrections) ? prior.corrections : [],
        quality_overrides: acceptedOverrides(qualityNow.blocking, overrides),
        quality_warnings: qualityNow.warnings.map((w) => ({ code: w.code, question: w.question, message: w.message })),
        services_not_offered: notOffered,
        ...(prior.partial_accepted ? { partial_accepted: prior.partial_accepted } : {}),
      };
      const { data: updated, error } = await service.from("onboarding_responses").update({
        baseline_questions: next, baseline_status: "approved", baseline_approved_at: now, baseline_approved_by: user.id, baseline_meta: meta, updated_at: now,
      }).eq("id", row.id).eq("status", "paid").or(EDITABLE_BASELINE_STATUS_FILTER).select("id").maybeSingle();
      if (error) throw error;
      requireUpdatedRow(updated, "baseline_state_changed");
      /* THE DISCOVERY QUESTIONS THAT DID NOT ENTER THE 20 DO NOT DISAPPEAR: they seed the Opportunity
         Backlog (never read by the guarantee). Additive only — an existing row is never touched. A
         failure here never undoes the approval; it is reported. */
      let backlogAdded = 0, backlogError: string | null = null;
      try {
        /* C-19: a question now IN the frozen set is not also "future work". A backlog row seeded by an
           earlier approval (before a reopen) that is still untouched ('new', from Discovery) is moved
           to not_pursuing with a note — kept, never deleted, history appended. */
        const inSet = new Set(next.map((q) => q.trim().toLowerCase()));
        const { data: seeded } = await service.from("client_opportunities").select("id, question, status, source, history").eq("lead_id", row.lead_id).eq("source", "discovery").eq("status", "new");
        for (const s of (seeded ?? []) as Array<{ id: string; question: string; history: unknown }>) {
          if (!inSet.has(String(s.question ?? "").trim().toLowerCase())) continue;
          const history = Array.isArray(s.history) ? s.history as unknown[] : [];
          await service.from("client_opportunities").update({
            status: "not_pursuing", updated_at: now,
            history: [...history, { at: now, by: user.id, from: "new", status: "not_pursuing", note: "now part of the official baseline — measured by the guarantee, not ongoing work" }].slice(-50),
          }).eq("id", s.id).eq("status", "new");
        }
        /* ⛔ Never a question the client does not offer or never confirmed (C-04): the scope decides. */
        const cands = backlogCandidates(next, recInputsOf(discovery), mixCtx, scope);
        if (cands.length) {
          const { data: existing } = await service.from("client_opportunities").select("question").eq("lead_id", row.lead_id);
          const have = new Set(((existing ?? []) as Array<{ question: string }>).map((e) => e.question.trim().toLowerCase()));
          const fresh = cands.filter((c) => !have.has(c.question.trim().toLowerCase()));
          const byQ = new Map(discovery.pool.map((p) => [p.question.trim().toLowerCase(), p]));
          if (fresh.length) {
            const { error: insErr } = await service.from("client_opportunities").insert(fresh.map((c) => {
              const p = byQ.get(c.question.trim().toLowerCase());
              return {
                user_id: leadOwner, lead_id: row.lead_id, question: c.question.trim(), service: c.service, area: c.town, intent: c.intent,
                source: "discovery", source_audit_id: discovery.audit?.id ?? null,
                visibility: c.engines ? { engines: c.engines } : null, competitors: p?.opportunity?.competitors ?? [],
                evidence_gap: p?.opportunity?.reason ?? null, status: "new",
                history: [{ at: now, by: user.id, status: "new", note: "from Discovery, not in the official baseline" }],
              };
            }));
            if (insErr) throw insErr;
            backlogAdded = fresh.length;
          }
        }
      } catch (e) { backlogError = errMsg(e); console.error("[paid-baseline] backlog seed", backlogError); }
      /* History: the exact set was approved and frozen (its wording lives on baseline_questions / baseline_meta). */
      await recordLeadEvent(service, String(row.lead_id), "baseline_approved", { actor: user.id, source: "admin", body: "Baseline questions approved & frozen", data: { questions: next.length, version: (meta as { version?: unknown } | null)?.version ?? null } });
      return json({ ok: true, baseline: { ...details, status: "approved", questions: next, meta }, backlog_added: backlogAdded, backlog_error: backlogError });
    }

    /* RUN. startPaidBaseline is the one starter for every caller (operator, backstop, webhook); it
       claims approved → starting atomically, creates the audit, and writes running. A skip is a
       refusal here — the operator has just pressed Run — so it comes back as an error sentence,
       never as "approved but waiting". The row is never marked failed: the approved set is still
       right, and the engine has already released its claim back to `approved`. */
    if (status !== "approved") {
      return json({ ok: false, error: "baseline_start_refused", detail: describeStartSkip("awaiting_operator_run") }, 409);
    }
    const started = await startPaidBaseline(service, String(row.id), "operator");
    if (!started.ok) {
      const why = started.error || started.skipped || "baseline_start_failed";
      return json({
        ok: false, error: "baseline_start_failed",
        detail: `The baseline did not start: ${why}. The approved questions are kept — fix the cause and press Start again.`,
      }, 502);
    }
    if (started.skipped && !started.audit_id && started.skipped !== START_IN_PROGRESS_SKIP) {
      return json({ ok: false, error: "baseline_start_refused", detail: describeStartSkip(started.skipped) }, 409);
    }
    const runState = paidBaselineRunState(started);
    if (started.audit_id && !started.skipped) await recordLeadEvent(service, String(row.lead_id), "baseline_run", { actor: user.id, source: "admin", body: "Baseline started", data: { audit_id: started.audit_id } });
    return json({ ok: true, baseline: { ...details, ...runState }, skipped: started.skipped || null });
  } catch (e) {
    console.error("[paid-baseline]", errMsg(e));
    const code = errMsg(e);
    if (["baseline_state_changed", "paid_onboarding_update_conflict", "lead_update_conflict"].includes(code)) {
      return json({ ok: false, error: code }, 409);
    }
    /* The API not answering (a Cloudflare 522 page, a fetch failure) is a 503 with a sentence,
       never a 500 that reads as a bug in this function (_shared/operator-auth.ts). */
    if (isUpstreamOutage(e)) {
      return json({ ok: false, error: "upstream_timeout", detail: "The database did not answer in time. Nothing was changed — try again in a moment." }, 503);
    }
    return json({ ok: false, error: "baseline_request_failed", detail: "Could not load or update baseline setup. Please retry." }, 500);
  }
});
