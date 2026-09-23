import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { startPaidBaseline } from "../_shared/audit-baseline.ts";
import { isUpstreamOutage, resolveOperator } from "../_shared/operator-auth.ts";
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
import { buildBalancedBaseline, coverageReport, nearDuplicates, type Candidate } from "../../../src/lib/baselineMix.ts";
import { discoveryState, generateDiscoveryPool, mixContext, startDiscoveryRun, storePoolVersion, DISCOVERY_MAX_QUESTIONS, type DiscoveryStore } from "../_shared/baseline-discovery.ts";

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
    const who = await resolveOperator(req);
    if (!who.ok) return json({ ok: false, error: who.error, detail: who.detail }, who.status);
    const user = who.user;
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "get";
    const onboardingId = typeof body.onboarding_id === "string" ? body.onboarding_id.trim() : "";
    const leadId = typeof body.lead_id === "string" ? body.lead_id.trim() : "";
    if (!onboardingId && !leadId) return json({ ok: false, error: "onboarding_id_or_lead_id_required" }, 400);

    const url = Deno.env.get("SUPABASE_URL")!;
    const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    let q = service.from("onboarding_responses")
      .select("id, lead_id, status, confirmed_location, services, services_list, areas_list, areas_wanted, baseline_status, baseline_questions, baseline_approved_at, baseline_approved_by, audit_id, baseline_discovery")
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
      .select("id, user_id, business_name, category, search_keyword, search_location, derived_town, website, country, services_included, website_build")
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
    const discoveryInput = {
      businessName: String(lead.business_name ?? ""), businessCategory: merged.business_category, website: merged.website,
      country: String(lead.country ?? ""), primaryTown: merged.primary_location, areas: merged.service_areas, services: merged.services,
    };
    const store = (row.baseline_discovery && typeof row.baseline_discovery === "object") ? row.baseline_discovery as DiscoveryStore : null;
    const discovery = await discoveryState(service, store, String(row.lead_id), { name: discoveryInput.businessName, location: merged.primary_location, website: merged.website });
    const mixCtx = mixContext(discoveryInput);
    const coverage = coverageReport(questions, mixCtx, BASELINE_QUESTIONS);
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
      discovery, coverage,
      canonical_services: mixCtx.services.map((x) => x.label),
      ...(typeof row.audit_id === "string" && row.audit_id ? { audit_id: row.audit_id } : {}),
    };
    if (action === "get") return json({ ok: true, baseline: details });

    if (["generate", "balanced", "discovery_generate", "discovery_run", "save", "approve", "run", "save_context"].indexOf(action) < 0) return json({ ok: false, error: "unsupported_action" }, 400);
    /* starting / running / complete: the measurement has begun (or is being claimed by another
       starter this second). Every mutation answers with the row as it is — including `run`, so the
       screen that lost the claim shows "Starting baseline" and polls, never a second start. */
    if (isStartedBaselineStatus(status)) return json({ ok: true, baseline: details, skipped: "already_started" });

    /* Context is saved on the same lead/onboarding pair the baseline already reads. This is only
       an operator convenience for incomplete manual/onboarding records; it never creates a second
       audit profile and is locked once the measurement has begun. It stays OPEN while the row is
       `approved`: the questions are frozen, the context is not, and a row approved without services
       needs exactly this edit to become startable. */
    if (action === "save_context") {
      const location = typeof body.location === "string" ? body.location.trim() : String(details.location ?? "").trim();
      const services = typeof body.services === "string" ? body.services.trim() : String(details.services ?? "").trim();
      const serviceList = cleanList(Array.isArray(body.services_list) ? body.services_list : details.services_list);
      const areas = cleanList(Array.isArray(body.areas_list) ? body.areas_list : details.areas_list);
      const businessType = typeof body.business_type === "string" ? body.business_type.trim() : String(details.business_type ?? "").trim();
      const website = typeof body.website === "string" ? body.website.trim() : String(details.website ?? "").trim();
      if (!location || !businessType) return json({ ok: false, error: "location_and_business_type_required" }, 400);
      const now = new Date().toISOString();
      const { data: updatedOnboarding, error: onErr } = await service.from("onboarding_responses").update({
        confirmed_location: location, services, services_list: serviceList, areas_list: areas, updated_at: now,
      }).eq("id", row.id).eq("status", "paid").select("id").maybeSingle();
      if (onErr) throw onErr;
      requireUpdatedRow(updatedOnboarding, "paid_onboarding_update_conflict");
      const { data: updatedLead, error: leadUpdateErr } = await service.from("outreach_leads").update({
        category: businessType, website: website || null, search_location: location,
      }).eq("id", lead.id).eq("user_id", user.id).select("id").maybeSingle();
      if (leadUpdateErr) throw leadUpdateErr;
      requireUpdatedRow(updatedLead, "lead_update_conflict");
      return json({ ok: true, baseline: { ...details, location, services, services_list: serviceList, areas_list: areas, business_type: businessType, website } });
    }

    let next = questions;
    const callEnv = { url, secret: Deno.env.get("CRON_SECRET") ?? "", serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", userId: user.id };

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
      const state = await discoveryState(service, fresh, String(row.lead_id), { name: discoveryInput.businessName, location: merged.primary_location, website: merged.website });
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
      const state = await discoveryState(service, nextStore, String(row.lead_id), { name: discoveryInput.businessName, location: merged.primary_location, website: merged.website });
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
      const keep = body.keep_current === true ? cleanQuestions(body.questions) : [];
      const candidates: Candidate[] = [
        ...keep.map((q) => ({ question: q, source: "manual" as const })),
        ...poolStore.pool.map((p) => ({ question: p.question, source: "discovery" as const })),
      ];
      next = buildBalancedBaseline(candidates, mixCtx, BASELINE_QUESTIONS);
      if (next.length === 0) return json({ ok: false, error: "no_questions_generated" }, 422);
      const { data: updated, error } = await service.from("onboarding_responses").update({
        baseline_questions: next, baseline_status: "needs_approval", updated_at: new Date().toISOString(),
      }).eq("id", row.id).eq("status", "paid").or(EDITABLE_BASELINE_STATUS_FILTER).select("id").maybeSingle();
      if (error) throw error;
      requireUpdatedRow(updated, "baseline_state_changed");
      const state = poolStore === store ? discovery : await discoveryState(service, poolStore, String(row.lead_id), { name: discoveryInput.businessName, location: merged.primary_location, website: merged.website });
      return json({ ok: true, baseline: { ...details, status: "needs_approval", questions: next, discovery: state, coverage: coverageReport(next, mixCtx, BASELINE_QUESTIONS) } });
    }

    if (action === "save") {
      if (isFrozenBaselineStatus(status)) return json({ ok: false, error: "baseline_questions_locked" }, 409);
      next = cleanQuestions(body.questions);
      if (next.length === 0 || next.length > 40) return json({ ok: false, error: "questions_must_be_between_1_and_40" }, 400);
      const { data: updated, error } = await service.from("onboarding_responses").update({ baseline_questions: next, baseline_status: "needs_approval", updated_at: new Date().toISOString() }).eq("id", row.id).eq("status", "paid").select("id").maybeSingle();
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
      const { data: updated, error } = await service.from("onboarding_responses").update({
        baseline_questions: next, baseline_status: "approved", baseline_approved_at: new Date().toISOString(), baseline_approved_by: user.id, updated_at: new Date().toISOString(),
      }).eq("id", row.id).eq("status", "paid").or(EDITABLE_BASELINE_STATUS_FILTER).select("id").maybeSingle();
      if (error) throw error;
      requireUpdatedRow(updated, "baseline_state_changed");
      return json({ ok: true, baseline: { ...details, status: "approved", questions: next } });
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
