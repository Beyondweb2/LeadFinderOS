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
export interface DiscoveryStore { generated_at: string; pool: PoolItem[]; towns_failed?: string[]; audit_id?: string | null; run_started_at?: string | null }

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
  const pool = dedupeByMeaning(interleaved, allTowns).slice(0, DISCOVERY_MAX_QUESTIONS).map((q) => {
    const m = classifyQuestion(q, ctx);
    return { question: q, town: m.town, service: m.service, intent: m.intent };
  });
  return { generated_at: new Date().toISOString(), pool, ...(failed.length ? { towns_failed: failed } : {}), audit_id: null };
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
  pool: Array<PoolItem & { opportunity?: Opportunity | null }>;
  towns_failed: string[];
  audit: { id: string; created_at: string | null; runs_done: number; runs_target: number; complete: boolean } | null;
  estimate_usd: number;
}

/** What the screen shows: the stored pool, and — if a Discovery audit exists for it — its progress
 *  and each question's opportunity. READ ONLY. */
export async function discoveryState(service: Client, store: DiscoveryStore | null, leadId: string, biz: { name: string; location: string; website: string }): Promise<DiscoveryState> {
  const pool: DiscoveryState["pool"] = (store?.pool ?? []).map((p) => ({ ...p }));
  let auditId = store?.audit_id ?? null;
  if (!auditId && store?.generated_at) {
    const { data: a } = await service.from("ai_audits").select("id").eq("lead_id", leadId).eq("audit_purpose", "discovery")
      .gte("created_at", store.generated_at).order("created_at", { ascending: false }).limit(1).maybeSingle();
    auditId = (a?.id as string | undefined) ?? null;
  }
  let audit: DiscoveryState["audit"] = null;
  if (auditId) {
    const [{ data: a }, { data: runs }] = await Promise.all([
      service.from("ai_audits").select("id,created_at,baseline_target_runs,baseline_completed_at").eq("id", auditId).maybeSingle(),
      service.from("ai_audit_runs").select("id,status").eq("audit_id", auditId),
    ]);
    const runIds = ((runs ?? []) as Array<{ id: string }>).map((r) => r.id);
    const done = ((runs ?? []) as Array<{ status: string }>).filter((r) => DISCOVERY_RUN_USABLE.has(String(r.status))).length;
    audit = { id: auditId, created_at: (a?.created_at as string | null) ?? null, runs_done: done, runs_target: Number(a?.baseline_target_runs ?? DISCOVERY_RUNS), complete: !!a?.baseline_completed_at };
    if (runIds.length) {
      const rows: QueueRow[] = [];
      for (let from = 0; ; from += 1000) {
        const { data } = await service.from("ai_audit_queue").select("id,question,status,result").in("run_id", runIds).order("id").range(from, from + 999);
        const batch = (data ?? []) as QueueRow[];
        rows.push(...batch);
        if (batch.length < 1000) break;
      }
      const answered = rows.filter((r) => r.result && typeof r.result === "object");
      const byQ = new Set(answered.map((r) => r.question.trim()));
      for (const p of pool) p.opportunity = byQ.has(p.question.trim())
        ? opportunityFor(p.question, answered, { businessName: biz.name, location: biz.location, website: biz.website, isAggregatorUrl })
        : null;
    }
  }
  return {
    generated_at: store?.generated_at ?? null, pool, towns_failed: store?.towns_failed ?? [], audit,
    estimate_usd: Math.round(pool.length * DISCOVERY_RUNS * DISCOVERY_USD_PER_QUESTION_RUN * 100) / 100,
  };
}
