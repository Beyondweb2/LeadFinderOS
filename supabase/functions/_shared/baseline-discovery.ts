// PAID-CLIENT DISCOVERY — the research step BEFORE the paid baseline is frozen (2026-09-23).
//
//   generate  → a Discovery POOL: the existing question generator (create-ai-audit, preview,
//               purpose 'discovery') asked ONCE PER APPROVED TOWN — the home town and every approved
//               service area — so each town's questions are pinned to that town by the generator's
//               own town gate, then merged and de-duplicated by meaning (src/lib/baselineMix.ts).
//               Costs one small question-writing model call per town; asks no AI engine.
//   run       → OPTIONAL, priced on its button: the pool measured as a Discovery audit (× runs),
//               the ordinary Discovery engine. Never the baseline; never frozen.
//   state     → the pool, the Discovery audit's progress, and — once it has answers — each
//               question's opportunity from the existing classifier (src/lib/discoveryOpportunity.ts).
//
// ⛔ DISCOVERY NEVER FREEZES ANYTHING and never writes baseline_questions; Paul adds questions to the
// draft himself, or asks for a balanced draft, and approves it separately.
import { buildAuditPreviewRequest, buildAuditRunRequest } from "../../../src/lib/auditQuestionContext.ts";
import { canonicalServices, classifyQuestion, dedupeByMeaning, type MixContext } from "../../../src/lib/baselineMix.ts";
import { opportunityFor, type Opportunity } from "../../../src/lib/discoveryOpportunity.ts";
import { isAggregatorUrl } from "./aggregators.ts";
import type { QueueRow } from "../../../src/lib/auditReport.ts";
import { discoveryProgress, poolMatchesJob, poolVersion, type DiscoveryProgress, type ProgressRow, type ProgressRun, type QuestionProgress } from "../../../src/lib/discoveryProgress.ts";
/** = src/lib/queueAuditStatus.ts RUN_USABLE (that module is not edge-safe). balanced-baseline.test.ts
 *  fails if the two ever differ. */
export const DISCOVERY_RUN_USABLE = new Set(["complete", "capped"]);

// deno-lint-ignore no-explicit-any
type Client = any;

export const DISCOVERY_RUNS = 3;
/** The Discovery engine's own ceiling (create-ai-audit refuses more). */
export const DISCOVERY_MAX_QUESTIONS = 80;
export const DISCOVERY_USD_PER_QUESTION_RUN = 0.0104;   // = AI_SEARCH_USD_PER_QUESTION (billed rows)

export interface PoolItem { question: string; town: string | null; service: string | null; intent: string }
/** Stored on onboarding_responses.baseline_discovery. `pool_version` identifies the pool (a stable
 *  hash of its questions); `audit_id` + `audit_pool_version` are the ONE Discovery job measuring it;
 *  `run_claimed_at` is the start claim (paid-baseline, discovery_run); `history` keeps earlier
 *  pools' jobs when the pool is regenerated, so no measurement is ever detached silently. */
export interface DiscoveryStore {
  generated_at: string; pool: PoolItem[]; towns_failed?: string[];
  pool_version?: string;
  audit_id?: string | null; audit_pool_version?: string | null; run_started_at?: string | null;
  run_claimed_at?: string | null;
  history?: Array<{ pool_version: string; generated_at: string; questions: number; audit_id: string | null }>;
}
/** A claim older than this with no audit written is a start that died mid-way; it may be retaken.
 *  The fallback audit lookup in discoveryState still finds any audit that start DID create. */
export const DISCOVERY_CLAIM_STALE_MS = 5 * 60 * 1000;
export const storePoolVersion = (store: Pick<DiscoveryStore, "pool" | "pool_version"> | null): string | null =>
  store?.pool?.length ? (store.pool_version ?? poolVersion(store.pool.map((p) => p.question))) : null;

export interface DiscoveryInput {
  businessName: string; businessCategory: string; website: string; country: string;
  primaryTown: string; areas: string[]; services: string[];
}

export function mixContext(i: Pick<DiscoveryInput, 'primaryTown' | 'areas' | 'services'>): MixContext {
  const towns = [i.primaryTown, ...i.areas].filter(Boolean);
  return { primaryTown: i.primaryTown, areas: i.areas.filter((a) => a.trim().toLowerCase() !== i.primaryTown.trim().toLowerCase()), services: canonicalServices(i.services, towns) };
}

/** How many questions to ask the generator for, per town. The home town gets more weight, never
 *  the whole pool; the total stays inside the Discovery engine's ceiling. */
export function perTownCounts(areaCount: number): { primary: number; area: number } {
  if (areaCount === 0) return { primary: 40, area: 0 };
  const area = areaCount <= 3 ? 8 : areaCount <= 6 ? 6 : 4;
  return { primary: Math.min(24, Math.max(12, DISCOVERY_MAX_QUESTIONS - area * areaCount - 8)), area };
}

export async function generateDiscoveryPool(input: DiscoveryInput, call: { url: string; secret: string; serviceKey: string; userId: string }): Promise<DiscoveryStore> {
  const ctx = mixContext(input);
  const services = ctx.services.map((s) => s.label);
  const counts = perTownCounts(ctx.areas.length);
  const towns = [{ town: input.primaryTown, n: counts.primary }, ...ctx.areas.map((town) => ({ town, n: counts.area }))];
  const failed: string[] = [];
  const perTown = await Promise.all(towns.map(async ({ town, n }) => {
    /* ⛔ NO lead_id: with one, create-ai-audit replaces the town with the client's confirmed home
       town (pickAuditTown). Each call must be about ITS town. The areas are Paul-approved, so the
       per-lead distance block does not apply. */
    const body = buildAuditPreviewRequest({
      business_name: input.businessName, business_category: input.businessCategory, primary_location: town,
      country: input.country, website: input.website, services, service_areas: [], specialisms: [],
    }, { questionCount: n, purpose: "discovery", userId: call.userId });
    try {
      const res = await fetch(`${call.url}/functions/v1/create-ai-audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${call.serviceKey}`, "x-cron-secret": call.secret, "x-internal-job": "1" },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.ok || !Array.isArray(payload.questions)) { failed.push(town); return [] as string[]; }
      return (payload.questions as unknown[]).filter((q): q is string => typeof q === "string");
    } catch { failed.push(town); return [] as string[]; }
  }));
  // Interleave the towns (so trimming to the ceiling keeps every town), then de-duplicate by meaning.
  const interleaved: string[] = [];
  for (let i = 0; i < Math.max(...perTown.map((l) => l.length), 0); i++) for (const l of perTown) if (l[i]) interleaved.push(l[i]);
  const allTowns = [input.primaryTown, ...ctx.areas];
  /* THE CORE QUERY PER TOWN. The generator writes mostly service questions; for the other areas it
     often writes no plain "[trade] in [town]" at all, which is the broadest genuine thing a customer
     asks. Added only where that town has no broad question, from the APPROVED category — nothing
     invented (BS4, 2026-09-23: 2 broad questions in a pool of 41). */
  const trade = input.businessCategory.trim().toLowerCase();
  if (trade) {
    for (const t of allTowns) {
      const hasBroad = interleaved.some((q) => { const m = classifyQuestion(q, ctx); return m.town === t && m.intent === "broad"; });
      if (!hasBroad) interleaved.push(`${trade} in ${t} UK`);
    }
  }
  const pool = dedupeByMeaning(interleaved, allTowns).slice(0, DISCOVERY_MAX_QUESTIONS).map((q) => {
    const m = classifyQuestion(q, ctx);
    return { question: q, town: m.town, service: m.service, intent: m.intent };
  });
  return { generated_at: new Date().toISOString(), pool, pool_version: poolVersion(pool.map((p) => p.question)), ...(failed.length ? { towns_failed: failed } : {}), audit_id: null };
}

/** Measure the pool as a Discovery audit (runs = DISCOVERY_RUNS). Returns the audit id. */
export async function startDiscoveryRun(input: DiscoveryInput & { leadId: string }, questions: string[], call: { url: string; secret: string; serviceKey: string; userId: string }): Promise<string> {
  const ctx = mixContext(input);
  const body = buildAuditRunRequest({
    business_name: input.businessName, business_category: input.businessCategory, primary_location: input.primaryTown,
    country: input.country, website: input.website, services: ctx.services.map((s) => s.label), service_areas: ctx.areas, specialisms: [],
  }, { questionCount: questions.length, purpose: "discovery", runCount: DISCOVERY_RUNS, userId: call.userId, leadId: input.leadId, questions });
  const res = await fetch(`${call.url}/functions/v1/create-ai-audit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${call.serviceKey}`, "x-cron-secret": call.secret, "x-internal-job": "1" },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  const id = payload?.audit_id ?? payload?.audit?.id ?? payload?.id;
  if (!res.ok || !payload?.ok || typeof id !== "string") throw new Error(`discovery_start_failed: ${String(payload?.error ?? res.status)}`);
  return id;
}

export interface DiscoveryState {
  generated_at: string | null;
  pool_version: string | null;
  pool: Array<PoolItem & { opportunity?: Opportunity | null; progress?: Omit<QuestionProgress, "question"> | null }>;
  towns_failed: string[];
  /** The ONE Discovery job measuring this pool, and its measurement-level progress. */
  audit: { id: string; created_at: string | null; runs_done: number; runs_target: number; complete: boolean; progress: Omit<DiscoveryProgress, "by_question"> } | null;
  /** A Discovery audit exists for this lead but measured a DIFFERENT question set — never attached. */
  mismatch: { audit_id: string } | null;
  /** A start is claimed and its audit not written yet (a press in the last few seconds). */
  starting: boolean;
  estimate_usd: number;
}

/** What the screen shows: the stored pool, and — if a Discovery audit exists for it — its progress
 *  and each question's opportunity. READ ONLY: it asks no engine and writes nothing, so opening,
 *  reopening or polling the screen can never start or repeat a measurement. */
export async function discoveryState(service: Client, store: DiscoveryStore | null, leadId: string, biz: { name: string; location: string; website: string }): Promise<DiscoveryState> {
  const pool: DiscoveryState["pool"] = (store?.pool ?? []).map((p) => ({ ...p }));
  const version = storePoolVersion(store);
  let auditId = store?.audit_id ?? null;
  /* A job recorded against a different pool version is not this pool's (defence in depth — the pool
     cannot be regenerated while a job runs, and a regenerate moves the old job to history). */
  let mismatch: DiscoveryState["mismatch"] = null;
  if (auditId && store?.audit_pool_version && version && store.audit_pool_version !== version) { mismatch = { audit_id: auditId }; auditId = null; }
  /* The fallback for a start whose audit id was never written back: the newest Discovery audit of
     this lead created after the pool. Attached only if its questions belong to this pool (below). */
  if (!auditId && !mismatch && store?.generated_at) {
    const { data: a } = await service.from("ai_audits").select("id").eq("lead_id", leadId).eq("audit_purpose", "discovery")
      .gte("created_at", store.generated_at).order("created_at", { ascending: false }).limit(1).maybeSingle();
    auditId = (a?.id as string | undefined) ?? null;
  }
  let audit: DiscoveryState["audit"] = null;
  if (auditId) {
    const [{ data: a }, { data: runs }] = await Promise.all([
      service.from("ai_audits").select("id,created_at,baseline_target_runs,baseline_completed_at,baseline_error").eq("id", auditId).maybeSingle(),
      service.from("ai_audit_runs").select("id,run_number,status,created_at,results").eq("audit_id", auditId).order("run_number"),
    ]);
    const runList = (runs ?? []) as Array<ProgressRun & { results?: { discovery_config?: { engines?: unknown } } | null }>;
    const runIds = runList.map((r) => r.id);
    const rows: Array<QueueRow & ProgressRow> = [];
    if (runIds.length) {
      for (let from = 0; ; from += 1000) {
        const { data } = await service.from("ai_audit_queue").select("id,run_id,question,status,result,updated_at").in("run_id", runIds).order("id").range(from, from + 999);
        const batch = (data ?? []) as Array<QueueRow & ProgressRow>;
        rows.push(...batch);
        if (batch.length < 1000) break;
      }
    }
    /* The job's own questions are run 1's rows — what was actually queued, after create-ai-audit's
       own dedupe — never the pool on screen. */
    const first = runList[0];
    const jobQuestions = first ? rows.filter((r) => r.run_id === first.id).map((r) => r.question) : [];
    if (!poolMatchesJob(pool.map((p) => p.question), jobQuestions)) {
      mismatch = { audit_id: auditId };
    } else {
      const cfgEngines = first?.results?.discovery_config?.engines;
      const engines = Array.isArray(cfgEngines) && cfgEngines.length && cfgEngines.every((e) => typeof e === "string") ? cfgEngines as string[] : ["chatgpt", "gemini"];
      const targetRuns = Number(a?.baseline_target_runs ?? DISCOVERY_RUNS) || DISCOVERY_RUNS;
      const { by_question, ...progress } = discoveryProgress({
        questions: jobQuestions, engines, targetRuns, runs: runList, rows,
        startedAt: (a?.created_at as string | null) ?? null, completedAt: (a?.baseline_completed_at as string | null) ?? null,
        error: (a?.baseline_error as string | null) ?? null,
      });
      const usableRuns = runList.filter((r) => DISCOVERY_RUN_USABLE.has(String(r.status))).length;
      audit = { id: auditId, created_at: (a?.created_at as string | null) ?? null, runs_done: usableRuns, runs_target: targetRuns, complete: !!a?.baseline_completed_at, progress };
      const byQ = new Map(by_question.map((q) => [q.question.trim().toLowerCase(), q]));
      const answeredRows = rows.filter((r) => r.status === "done" && r.result && typeof r.result === "object");
      const hasAnswer = new Set(answeredRows.map((r) => r.question.trim()));
      for (const p of pool) {
        const qp = byQ.get(p.question.trim().toLowerCase());
        p.progress = qp ? { state: qp.state, engines: qp.engines, done: qp.done, failed: qp.failed, total: qp.total } : null;
        p.opportunity = hasAnswer.has(p.question.trim())
          ? opportunityFor(p.question, answeredRows, { businessName: biz.name, location: biz.location, website: biz.website, isAggregatorUrl })
          : null;
      }
    }
  }
  const claimedMs = store?.run_claimed_at ? new Date(store.run_claimed_at).getTime() : NaN;
  return {
    generated_at: store?.generated_at ?? null, pool_version: version, pool, towns_failed: store?.towns_failed ?? [], audit, mismatch,
    starting: !audit && Number.isFinite(claimedMs) && Date.now() - claimedMs < DISCOVERY_CLAIM_STALE_MS,
    estimate_usd: Math.round(pool.length * DISCOVERY_RUNS * DISCOVERY_USD_PER_QUESTION_RUN * 100) / 100,
  };
}
