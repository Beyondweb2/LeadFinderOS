// sales-check — the ENGINE of a salesperson's "Check before calling" batch (2026-10-04, fix/07;
// master plan M-034 / WS-7). The rules are src/lib/salesCheck.ts; fn sales-prospect-check is the door;
// docs/pre-sales-certification/fixes-07-sales-bulk-audit.md is the record.
//
// ⛔ EVERYTHING THAT TOUCHES THE OUTSIDE WORLD IS INJECTED (SalesCheckDeps): the usage guard, the
// prospecting pool, the suppression check, the create-ai-audit call, the crawl. The tables are read and
// written through `service` — so scripts/sales-prospect-check.test.ts drives THIS code against an
// in-memory database with the real decisions and fake providers, and nothing here can spend in a test.
//
// ⛔ THE ORDER INSIDE ONE ITEM IS THE SAFETY CASE:
//   1. claim the item (queued → starting, a conditional update: a second advance gets nothing);
//   2. re-read the lead NOW and re-judge it (yours, active, not a client, not suppressed, has the data);
//   3. reuse: an AI check in flight → wait for it; a recent result → reuse it (free). Nothing below runs;
//   4. only for a NEW check, serialised so parallel items cannot overshoot: the rep's allowance (counted
//      in fresh checks), the prospecting pool + Apify reserve, then the usage guard (one ledger row
//      naming the rep — the per-rep attribution);
//   5. create-ai-audit — the hook the rep's own button makes, filed under the book's owner, on THIS
//      lead id only. The result is the lead's audit; the item only points at it.
// ⛔ NOTHING HERE SENDS. No WhatsApp, no email, no auto-reply row, no status write on the lead. The
//   only lead-level writes are lead_activity history rows (who ran the check).
import {
  AUDIT_RUN_IN_FLIGHT, SALES_CHECK_BATCH_MAX, SALES_CHECK_CONCURRENCY, SALES_CHECK_MAX_START_ATTEMPTS,
  SALES_CHECK_STARTING_STALE_MS, allowance, batchStatusFor, leadTrade, guardRefusalReason, isRequestId,
  itemCounts, leadEligibility, normalizeLeadIds, perRepDailyAllowance, planItem, reasonText, runOutcome,
  startRefusalReason, stillWorkable, type Allowance, type BatchStatus, type CheckAuditRow, type CheckCrawlRow,
  type CheckLead, type CheckRunRow, type ItemReason, type ItemStatus,
} from "../../../src/lib/salesCheck.ts";
import { budgetDecision, type ApifyUsage } from "../../../src/lib/auditBudget.ts";
import { isAggregatorUrl } from "./aggregators.ts";

// deno-lint-ignore no-explicit-any
type Client = any;

export interface SalesActor { id: string; role: string }

export interface StartAuditResult {
  ok: boolean;
  status: number;
  audit_id?: string;
  run_id?: string;
  error?: string;
  detail?: string;
  message?: string;
}

export interface SalesCheckDeps {
  service: Client;
  now(): number;
  /** One fresh check's estimated cost (USD) — booked on the guard row and the item, never shown to a rep. */
  estUsd: number;
  /** Questions per check — the hook's count. */
  questionCount: number;
  /** Has this business asked not to be contacted? Throwing counts as YES (fail closed). */
  suppressed(lead: CheckLead & { phone?: string | null; email?: string | null }): Promise<boolean>;
  /** Google could not confirm the lead's town (townVerdict.ts). */
  townGated(lead: CheckLead): boolean;
  /** The usage guard for one fresh check by this rep (public.guard_action, action 'sales_check'). */
  guard(actorId: string, leadId: string): Promise<{ ok: boolean; reason?: string | null }>;
  /** The prospecting pool's rolling spend for the book owner and the Apify reading; null = unreadable. */
  prospecting(ownerId: string): Promise<{ poolSpentUsd: number; apify: ApifyUsage | null } | null>;
  /** create-ai-audit, internal door, with the body auditRequestBody builds. */
  startAudit(body: Record<string, unknown>): Promise<StartAuditResult>;
  /** crawl-check, internal door, standard profile, the lead's own website. Free. */
  runCrawl(leadId: string, url: string): Promise<{ ok: boolean }>;
  /** Best-effort record of an unexpected failure (client_error_reports). */
  reportError?(errorId: string, context: Record<string, unknown>): Promise<void>;
}

/** Stop starting new waves after this much of one request. A crawl started in the last wave can add
 *  its own standard deadline; the platform's limit is well above the sum. */
export const ADVANCE_BUDGET_MS = 30_000;
/** One advance holds its batch this long (refreshed by finishing). Two tabs cannot both work it. */
export const BATCH_LOCK_MS = 90_000;
/** Batches older than this are no longer moved on (their items have long resolved or timed out). */
const ACTIVE_LOOKBACK_MS = 2 * 86_400_000;

export const LEAD_COLUMNS = "id, user_id, assigned_to_user_id, amount_paid, status, is_archived, business_name, search_keyword, category, search_location, address, derived_town, town_fetch_note, country, website, phone, email, services_included, service_areas";

type Lead = CheckLead & { phone?: string | null; email?: string | null; town_fetch_note?: string | null };

export interface ItemRow {
  id: string;
  batch_id: string;
  actor_user_id: string;
  lead_id: string;
  position: number;
  status: ItemStatus;
  reason: string | null;
  detail: string | null;
  audit_id: string | null;
  run_id: string | null;
  audit_source: string | null;
  crawl_source: string | null;
  result_at: string | null;
  est_cost_usd: number | string | null;
  attempts: number | null;
  started_at: string | null;
  finished_at: string | null;
  created_at?: string | null;
}
export interface BatchRow {
  id: string;
  actor_user_id: string;
  client_request_id: string;
  status: BatchStatus;
  refresh: boolean;
  total: number;
  cancelled_at: string | null;
  locked_until: string | null;
  created_at: string;
  finished_at: string | null;
}

const iso = (ms: number) => new Date(ms).toISOString();
const ownWebsite = (raw: string | null | undefined): string | null => {
  const w = (raw ?? "").trim();
  return w && !isAggregatorUrl(w) ? w : null;
};

const clean = (s: unknown) => (typeof s === "string" ? s.trim() : "");

/* ═══ The create-ai-audit request: the rep's own single-lead check, field for field ═══ */

/** The body create-ai-audit receives for one lead — the SAME fields the rep's "Run the AI check"
 *  button sends (LeadCrmPanel hookInputs): the hook marker, a fresh audit, three questions, the town
 *  the button uses, the lead's own website only. Plus `user_id` (the book owner — every audit is
 *  filed under the data account) for the internal door. Never `queue_pitch_on_complete`, never a
 *  purpose, never questions supplied by a person. */
export function auditRequestBody(lead: CheckLead, ownWebsite: string | null, questionCount: number): Record<string, unknown> {
  const services = (lead.services_included ?? []).filter((s) => typeof s === 'string' && s.trim());
  const areas = (lead.service_areas ?? []).filter((s) => typeof s === 'string' && s.trim());
  return {
    user_id: lead.user_id,
    lead_id: lead.id,
    business_name: clean(lead.business_name),
    business_type: leadTrade(lead),
    location_text: clean(lead.derived_town) || clean(lead.search_location) || clean(lead.address),
    country: lead.country ?? null,
    website: ownWebsite ?? undefined,
    has_website: !!ownWebsite,
    question_count: questionCount,
    hook_audit: true,
    fresh_audit: true,
    ...(services.length ? { specialisms: services.join(', ') } : {}),
    ...(areas.length ? { service_areas: areas } : {}),
  };
}


/* ═══ Reads ═════════════════════════════════════════════════════════════════════════════════════ */

async function readLead(service: Client, leadId: string): Promise<Lead | null> {
  const { data, error } = await service.from("outreach_leads").select(LEAD_COLUMNS).eq("id", leadId).maybeSingle();
  if (error) throw new Error(`lead read failed: ${error.message}`);
  return (data as Lead | null) ?? null;
}

async function readLeads(service: Client, ids: string[]): Promise<Map<string, Lead>> {
  const out = new Map<string, Lead>();
  if (!ids.length) return out;
  const { data, error } = await service.from("outreach_leads").select(LEAD_COLUMNS).in("id", ids);
  if (error) throw new Error(`leads read failed: ${error.message}`);
  for (const l of (data ?? []) as Lead[]) out.set(l.id, l);
  return out;
}

/** A lead's audits and their runs; a capped run carries how many questions it really answered. */
async function readAudits(service: Client, leadId: string): Promise<{ audits: CheckAuditRow[]; runs: CheckRunRow[] }> {
  const { data: a, error: aErr } = await service.from("ai_audits")
    .select("id, lead_id, created_at, audit_purpose, baseline_target_runs, is_measurement, baseline_contract")
    .eq("lead_id", leadId);
  if (aErr) throw new Error(`audit read failed: ${aErr.message}`);
  const audits = (a ?? []) as CheckAuditRow[];
  if (!audits.length) return { audits, runs: [] };
  const { data: r, error: rErr } = await service.from("ai_audit_runs")
    .select("id, audit_id, status, run_number, created_at").in("audit_id", audits.map((x) => x.id));
  if (rErr) throw new Error(`run read failed: ${rErr.message}`);
  const runs = (r ?? []) as CheckRunRow[];
  await countAnswered(service, runs);
  return { audits, runs };
}

/** For capped runs only: the number of questions that genuinely answered (bulk-jobs' zero-answer lesson). */
async function countAnswered(service: Client, runs: CheckRunRow[]): Promise<void> {
  const capped = runs.filter((r) => r.status === "capped").map((r) => r.id);
  if (!capped.length) return;
  const { data, error } = await service.from("ai_audit_queue").select("run_id, status").in("run_id", capped);
  if (error) throw new Error(`queue read failed: ${error.message}`);
  const n = new Map<string, number>();
  for (const q of (data ?? []) as Array<{ run_id: string; status: string }>) if (q.status === "done") n.set(q.run_id, (n.get(q.run_id) ?? 0) + 1);
  for (const r of runs) if (r.status === "capped") r.answered = n.get(r.id) ?? 0;
}

async function readCrawl(service: Client, leadId: string): Promise<CheckCrawlRow | null> {
  const { data, error } = await service.from("lead_crawl_checks").select("result, created_at").eq("lead_id", leadId);
  if (error) throw new Error(`crawl read failed: ${error.message}`);
  const rows = (data ?? []) as CheckCrawlRow[];
  return rows.sort((x, y) => Date.parse(y.created_at ?? "") - Date.parse(x.created_at ?? ""))[0] ?? null;
}

/** An automatic pitch parked on this lead, waiting for ANY audit to complete. Unreadable = yes. */
async function pitchWaiting(service: Client, leadId: string): Promise<boolean> {
  const { data, error } = await service.from("whatsapp_auto_replies").select("id").eq("lead_id", leadId).eq("status", "awaiting_audit");
  if (error) return true;
  return Array.isArray(data) && data.length > 0;
}

/** Does finishing an audit currently queue a WhatsApp (process-ai-audit-queue's completion send)?
 *  Unreadable = yes: on a path that could contact someone, absence means "do not". */
export async function autoMessageOn(service: Client): Promise<boolean> {
  const { data, error } = await service.from("whatsapp_outreach_state").select("audit_complete_template").eq("id", 1).maybeSingle();
  if (error) return true;
  const t = (data as { audit_complete_template?: unknown } | null)?.audit_complete_template;
  return typeof t === "string" && t.trim() !== "";
}

/** The rep's allowance today: fresh checks started in the last 24 h against the live per-day limit.
 *  null when the count cannot be read (fail closed — nothing new starts). */
export async function readAllowance(deps: SalesCheckDeps, actorId: string): Promise<Allowance | null> {
  const since = iso(deps.now() - 86_400_000);
  const [{ data: s }, used] = await Promise.all([
    deps.service.from("protection_settings").select("limits").eq("id", 1).maybeSingle(),
    deps.service.from("sales_check_items").select("id").eq("actor_user_id", actorId).eq("audit_source", "new").gte("started_at", since),
  ]);
  if (used.error) return null;
  return allowance(((used.data ?? []) as unknown[]).length, perRepDailyAllowance((s as { limits?: unknown } | null)?.limits));
}

/* ═══ Writes ════════════════════════════════════════════════════════════════════════════════════ */

async function patchItem(deps: SalesCheckDeps, id: string, patch: Partial<ItemRow>): Promise<void> {
  const { error } = await deps.service.from("sales_check_items").update({ ...patch, updated_at: iso(deps.now()) }).eq("id", id);
  if (error) throw new Error(`item write failed: ${error.message}`);
}

async function finishItem(deps: SalesCheckDeps, id: string, status: "done" | "reused" | "failed" | "skipped", reason: ItemReason | null, extra: Partial<ItemRow> = {}): Promise<void> {
  await patchItem(deps, id, { status, reason, finished_at: iso(deps.now()), ...extra });
}

async function history(deps: SalesCheckDeps, leadId: string, actorId: string, kind: "audit_run" | "crawl_run", data: Record<string, unknown>): Promise<void> {
  try {
    await deps.service.from("lead_activity").insert({ lead_id: leadId, actor_user_id: actorId, kind, data: { source: "sales_check", ...data } });
  } catch { /* history is best-effort; the check itself stands */ }
}

/* ═══ One item ══════════════════════════════════════════════════════════════════════════════════ */

interface AdvanceCtx {
  actor: SalesActor;
  batch: BatchRow;
  autoMessageOn: boolean;
  /** Serialises the allowance → pool → guard → reserve section so parallel items cannot overshoot. */
  spendChain: Promise<unknown>;
}

function serial<T>(ctx: AdvanceCtx, fn: () => Promise<T>): Promise<T> {
  const next = ctx.spendChain.then(fn, fn);
  ctx.spendChain = next.catch(() => undefined);
  return next;
}

type Gate = { ok: true } | { ok: false; reason: ItemReason };

/** Allowance, pool, guard — then reserve the slot (audit_source 'new' counts toward the allowance). */
async function gateFreshCheck(deps: SalesCheckDeps, ctx: AdvanceCtx, item: ItemRow, lead: Lead): Promise<Gate> {
  const allow = await readAllowance(deps, ctx.actor.id);
  if (!allow) return { ok: false, reason: "budget_unknown" };
  if (allow.remaining <= 0) return { ok: false, reason: "allowance_used" };
  const owner = typeof lead.user_id === "string" ? lead.user_id : "";
  const pool = owner ? await deps.prospecting(owner).catch(() => null) : null;
  if (!pool) return { ok: false, reason: "budget_unknown" };
  const decision = budgetDecision({ pool: "prospecting", poolSpentUsd: pool.poolSpentUsd, estCostUsd: deps.estUsd, apify: pool.apify });
  if (!decision.allowed) return { ok: false, reason: "budget_used" };
  const g = await deps.guard(ctx.actor.id, lead.id).catch(() => ({ ok: false, reason: "guard_unavailable" }));
  if (!g.ok) return { ok: false, reason: guardRefusalReason(g.reason) };
  await patchItem(deps, item.id, { audit_source: "new", est_cost_usd: deps.estUsd, started_at: iso(deps.now()) });
  return { ok: true };
}

async function processItem(deps: SalesCheckDeps, ctx: AdvanceCtx, item: ItemRow): Promise<void> {
  const now = deps.now();
  // 1. Claim. A second advance (another tab, a retry) matches nothing and walks away.
  const { data: claimed, error: claimErr } = await deps.service.from("sales_check_items")
    .update({ status: "starting", started_at: iso(now), attempts: (item.attempts ?? 0) + 1, updated_at: iso(now) })
    .eq("id", item.id).eq("status", "queued").select("id");
  if (claimErr || !Array.isArray(claimed) || claimed.length === 0) return;

  // 2. The lead, as it is NOW.
  const lead = await readLead(deps.service, item.lead_id);
  const el = leadEligibility(ctx.actor.id, lead);
  if (!el.ok) return finishItem(deps, item.id, "skipped", el.reason);
  const l = lead as Lead;
  const isSuppressed = await deps.suppressed(l).catch(() => true);
  if (isSuppressed) return finishItem(deps, item.id, "skipped", "suppressed");

  // 3. Reuse first.
  const site = ownWebsite(l.website);
  const [{ audits, runs }, crawl, waiting] = await Promise.all([
    readAudits(deps.service, l.id), readCrawl(deps.service, l.id), pitchWaiting(deps.service, l.id),
  ]);
  const plan = planItem({
    leadId: l.id, audits, runs, crawl, ownWebsite: site, refresh: ctx.batch.refresh, nowMs: now,
    townGated: deps.townGated(l), pitchWaiting: waiting, autoMessageOn: ctx.autoMessageOn,
  });

  if (plan.audit.kind === "refuse") return finishItem(deps, item.id, "skipped", plan.audit.reason);

  if (plan.audit.kind === "attach") {
    await patchItem(deps, item.id, {
      status: "running", audit_id: plan.audit.auditId, run_id: plan.audit.runId, audit_source: "in_flight",
      crawl_source: site ? "with_audit" : "none",
    });
    return;
  }

  if (plan.audit.kind === "reuse") {
    let crawlSource: ItemRow["crawl_source"] = plan.crawl === "reuse" ? "reused" : "none";
    if (plan.crawl === "run" && site) {
      const c = await deps.runCrawl(l.id, site).catch(() => ({ ok: false }));
      crawlSource = c.ok ? "new" : "failed";
      if (c.ok) await history(deps, l.id, ctx.actor.id, "crawl_run", { batch_id: ctx.batch.id, url: site });
    }
    return finishItem(deps, item.id, "reused", null, {
      audit_id: plan.audit.auditId, run_id: plan.audit.runId, audit_source: "reused", crawl_source: crawlSource,
      result_at: plan.audit.resultAt,
    });
  }

  // 4. A new, paid check — gated in series.
  const gate = await serial(ctx, () => gateFreshCheck(deps, ctx, item, l));
  if (!gate.ok) return finishItem(deps, item.id, "skipped", gate.reason);

  // 5. The hook check, on this lead only.
  const res = await deps.startAudit(auditRequestBody(l, site, deps.questionCount)).catch((e) => ({
    ok: false, status: 0, error: e instanceof Error ? e.message : String(e),
  } as StartAuditResult));
  if (res.ok && typeof res.audit_id === "string" && res.audit_id) {
    await patchItem(deps, item.id, {
      status: "running", audit_id: res.audit_id, run_id: typeof res.run_id === "string" ? res.run_id : null,
      crawl_source: site ? "with_audit" : "none",
    });
    await history(deps, l.id, ctx.actor.id, "audit_run", { batch_id: ctx.batch.id, audit_id: res.audit_id });
    return;
  }
  const r = startRefusalReason(res);
  // Nothing started: release the reserved allowance slot.
  return finishItem(deps, item.id, r.status, r.reason, {
    audit_source: null, est_cost_usd: 0,
    detail: r.reason === "not_in_town" ? String(res.detail ?? res.message ?? "").slice(0, 300) || null : null,
  });
}

/* ═══ Started checks, later ════════════════════════════════════════════════════════════════════ */

/** Move running items on from their run; a lead that stopped being the rep's is hidden, nothing more
 *  is started for it. Interrupted starts are recovered exactly once. */
async function resolveItems(deps: SalesCheckDeps, actor: SalesActor, items: ItemRow[]): Promise<void> {
  const now = deps.now();
  const running = items.filter((i) => i.status === "running");
  const stale = items.filter((i) => i.status === "starting" && now - Date.parse(i.started_at ?? "") > SALES_CHECK_STARTING_STALE_MS);
  if (!running.length && !stale.length) return;

  const leads = await readLeads(deps.service, [...new Set([...running, ...stale].map((i) => i.lead_id))]);

  if (running.length) {
    const runIds = running.map((i) => i.run_id).filter((x): x is string => !!x);
    const runs: CheckRunRow[] = [];
    if (runIds.length) {
      const { data, error } = await deps.service.from("ai_audit_runs").select("id, audit_id, status, run_number, created_at").in("id", runIds);
      if (error) throw new Error(`run read failed: ${error.message}`);
      runs.push(...((data ?? []) as CheckRunRow[]));
      await countAnswered(deps.service, runs);
    }
    const byId = new Map(runs.map((r) => [r.id, r]));
    for (const it of running) {
      const w = stillWorkable(actor.id, leads.get(it.lead_id));
      if (!w.ok) { await finishItem(deps, it.id, "skipped", w.reason); continue; }
      const run = it.run_id ? byId.get(it.run_id) ?? null : null;
      const out = runOutcome(run, Date.parse(it.started_at ?? it.created_at ?? "") || now, now);
      if (out.kind === "usable") {
        await finishItem(deps, it.id, it.audit_source === "new" ? "done" : "reused", null, { result_at: run?.created_at ?? null });
      } else if (out.kind === "failed") {
        await finishItem(deps, it.id, "failed", out.reason);
      }
    }
  }

  for (const it of stale) {
    // Did the interrupted call get as far as creating the audit? Then it is that audit's item.
    const { data: made } = await deps.service.from("ai_audits").select("id, created_at, audit_purpose").eq("lead_id", it.lead_id).gte("created_at", it.started_at);
    const audit = ((made ?? []) as Array<{ id: string; created_at: string; audit_purpose: string | null }>)
      .filter((a) => a.audit_purpose === "audit").sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))[0];
    if (audit && it.audit_source === "new") {
      const { data: r } = await deps.service.from("ai_audit_runs").select("id, created_at").eq("audit_id", audit.id);
      const run = ((r ?? []) as Array<{ id: string; created_at: string }>).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))[0];
      await patchItem(deps, it.id, { status: "running", audit_id: audit.id, run_id: run?.id ?? null, crawl_source: ownWebsite(leads.get(it.lead_id)?.website) ? "with_audit" : "none" });
    } else if ((it.attempts ?? 0) >= SALES_CHECK_MAX_START_ATTEMPTS) {
      await finishItem(deps, it.id, "failed", "start_failed", { audit_source: null, est_cost_usd: 0 });
    } else {
      // Back in line; the claim makes the retry exactly-once.
      const { error } = await deps.service.from("sales_check_items").update({ status: "queued", audit_source: null, est_cost_usd: 0, updated_at: iso(now) }).eq("id", it.id).eq("status", "starting");
      if (error) throw new Error(`item requeue failed: ${error.message}`);
    }
  }
}

/* ═══ Batches ═══════════════════════════════════════════════════════════════════════════════════ */

async function itemsOf(service: Client, batchId: string): Promise<ItemRow[]> {
  const { data, error } = await service.from("sales_check_items").select("*").eq("batch_id", batchId);
  if (error) throw new Error(`items read failed: ${error.message}`);
  return ((data ?? []) as ItemRow[]).sort((a, b) => a.position - b.position);
}

async function settleBatchStatus(deps: SalesCheckDeps, batch: BatchRow): Promise<BatchStatus> {
  const items = await itemsOf(deps.service, batch.id);
  const status = batchStatusFor(items);
  if (status !== batch.status) {
    const patch: Record<string, unknown> = { status, updated_at: iso(deps.now()) };
    if (status === "finished") patch.finished_at = iso(deps.now());
    await deps.service.from("sales_check_batches").update(patch).eq("id", batch.id);
    batch.status = status;
  }
  return status;
}

/** Hold the batch for this advance. Another tab's advance (or a retry) gets false and only reads. */
async function lockBatch(deps: SalesCheckDeps, batchId: string): Promise<boolean> {
  const now = deps.now();
  const { data } = await deps.service.from("sales_check_batches")
    .update({ locked_until: iso(now + BATCH_LOCK_MS), updated_at: iso(now) })
    .eq("id", batchId).in("status", ["active", "waiting"])
    .or(`locked_until.is.null,locked_until.lt.${iso(now)}`)
    .select("id");
  return Array.isArray(data) && data.length > 0;
}
async function unlockBatch(deps: SalesCheckDeps, batchId: string): Promise<void> {
  await deps.service.from("sales_check_batches").update({ locked_until: null }).eq("id", batchId);
}

async function openBatches(deps: SalesCheckDeps, actorId: string): Promise<BatchRow[]> {
  const { data, error } = await deps.service.from("sales_check_batches").select("*")
    .eq("actor_user_id", actorId).in("status", ["active", "waiting"]).gte("created_at", iso(deps.now() - ACTIVE_LOOKBACK_MS));
  if (error) throw new Error(`batch read failed: ${error.message}`);
  return ((data ?? []) as BatchRow[]).sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}

/** Move every open batch of this rep on: start what is queued (within the time budget), resolve what is
 *  running, settle the status. Safe to call from two tabs at once — the lock and the item claims. */
export async function advance(deps: SalesCheckDeps, actor: SalesActor): Promise<void> {
  const started = deps.now();
  const batches = await openBatches(deps, actor.id);
  for (const batch of batches) {
    if (!(await lockBatch(deps, batch.id))) continue;
    try {
      const ctx: AdvanceCtx = { actor, batch, autoMessageOn: await autoMessageOn(deps.service), spendChain: Promise.resolve() };
      await resolveItems(deps, actor, await itemsOf(deps.service, batch.id));
      while (deps.now() - started < ADVANCE_BUDGET_MS) {
        const queued = (await itemsOf(deps.service, batch.id)).filter((i) => i.status === "queued");
        if (!queued.length) break;
        const wave = queued.slice(0, SALES_CHECK_CONCURRENCY);
        const results = await Promise.allSettled(wave.map((it) => processItem(deps, ctx, it)));
        for (let k = 0; k < results.length; k++) {
          const r = results[k];
          if (r.status === "rejected") {
            const why = r.reason instanceof Error ? r.reason.message : String(r.reason);
            await deps.reportError?.("sales_check_item_failed", { batch_id: batch.id, item_id: wave[k].id, message: why.slice(0, 500) });
            // Leave a claimed item for the stale-start recovery; never mark a success that did not happen.
          }
        }
      }
      await resolveItems(deps, actor, (await itemsOf(deps.service, batch.id)).filter((i) => i.status === "running"));
      await settleBatchStatus(deps, batch);
    } finally {
      await unlockBatch(deps, batch.id);
    }
  }
}

export type StartOutcome =
  | { status: 200; body: { ok: true; batch_id: string; replayed?: boolean; invalid?: number; duplicates?: number } }
  | { status: 400 | 403 | 409 | 500; body: { ok: false; error: string; detail: string; batch_id?: string; max?: number; count?: number } };

/** Create one batch for one press. Idempotent on the client's request id; one active batch per rep. */
export async function startBatch(deps: SalesCheckDeps, actor: SalesActor, body: Record<string, unknown>): Promise<StartOutcome> {
  if (actor.role !== "sales") return { status: 403, body: { ok: false, error: "sales_only", detail: "Check before calling is the salesperson's tool." } };
  const rid = body.client_request_id;
  if (!isRequestId(rid)) return { status: 400, body: { ok: false, error: "bad_request_id", detail: "Refresh the page and try again." } };

  const replay = await deps.service.from("sales_check_batches").select("id").eq("actor_user_id", actor.id).eq("client_request_id", rid).maybeSingle();
  if (replay.error) return { status: 500, body: { ok: false, error: "lookup_failed", detail: "Couldn't start the checks — try again." } };
  if (replay.data?.id) return { status: 200, body: { ok: true, batch_id: replay.data.id, replayed: true } };

  const ids = normalizeLeadIds(body.lead_ids, SALES_CHECK_BATCH_MAX);
  if (!ids.ok) {
    return ids.error === "too_many"
      ? { status: 400, body: { ok: false, error: "too_many", detail: `Select at most ${ids.max} leads per check — you selected ${ids.count}.`, max: ids.max, count: ids.count } }
      : { status: 400, body: { ok: false, error: "no_leads", detail: "Select at least one lead.", max: ids.max, count: 0 } };
  }

  const now = iso(deps.now());
  const ins = await deps.service.from("sales_check_batches").insert({
    actor_user_id: actor.id, client_request_id: rid, status: "active", refresh: body.refresh === true,
    total: ids.ids.length, created_at: now, updated_at: now,
  }).select("id").maybeSingle();
  if (ins.error) {
    if ((ins.error as { code?: string }).code === "23505") {
      const again = await deps.service.from("sales_check_batches").select("id").eq("actor_user_id", actor.id).eq("client_request_id", rid).maybeSingle();
      if (again.data?.id) return { status: 200, body: { ok: true, batch_id: again.data.id, replayed: true } };
      const active = await deps.service.from("sales_check_batches").select("id").eq("actor_user_id", actor.id).eq("status", "active").maybeSingle();
      return { status: 409, body: { ok: false, error: "batch_active", detail: "Your last checks are still starting — wait for them, or stop them first.", batch_id: active.data?.id } };
    }
    return { status: 500, body: { ok: false, error: "insert_failed", detail: "Couldn't start the checks — try again." } };
  }
  const batchId = (Array.isArray(ins.data) ? ins.data[0] : ins.data as { id: string } | null)?.id as string;
  const items = ids.ids.map((lead_id, position) => ({
    batch_id: batchId, actor_user_id: actor.id, lead_id, position, status: "queued", created_at: now, updated_at: now,
  }));
  const itemsIns = await deps.service.from("sales_check_items").insert(items);
  if (itemsIns.error) {
    // Never let a half-made batch hold the rep's one active slot.
    await deps.service.from("sales_check_batches").delete().eq("id", batchId);
    return { status: 500, body: { ok: false, error: "insert_failed", detail: "Couldn't start the checks — try again." } };
  }
  return { status: 200, body: { ok: true, batch_id: batchId, invalid: ids.invalid, duplicates: ids.duplicates } };
}

/** Stop a batch: anything not yet started is skipped ("Stopped before it started"). Started checks are
 *  already paid and finish on their own. Own active batch only. */
export async function cancelBatch(deps: SalesCheckDeps, actor: SalesActor, batchId: string): Promise<{ ok: boolean }> {
  const { data: b } = await deps.service.from("sales_check_batches").select("*").eq("id", batchId).eq("actor_user_id", actor.id).maybeSingle();
  if (!b) return { ok: false };
  const now = iso(deps.now());
  await deps.service.from("sales_check_items").update({ status: "skipped", reason: "cancelled", finished_at: now, updated_at: now })
    .eq("batch_id", batchId).eq("status", "queued");
  await deps.service.from("sales_check_batches").update({ cancelled_at: now, updated_at: now }).eq("id", batchId);
  await settleBatchStatus(deps, b as BatchRow);
  return { ok: true };
}

/* ═══ What the rep sees ════════════════════════════════════════════════════════════════════════ */

export interface ItemView {
  id: string;
  lead_id: string;
  position: number;
  status: ItemStatus;
  reason: string | null;
  message: string | null;
  business_name: string | null;
  phone: string | null;
  website: string | null;
  audit_id: string | null;
  run_id: string | null;
  audit_source: string | null;
  crawl_source: string | null;
  result_at: string | null;
}
export interface BatchView {
  batch: { id: string; status: BatchStatus; created_at: string; total: number; refresh: boolean; cancelled: boolean; counts: ReturnType<typeof itemCounts> } | null;
  items: ItemView[];
  allowance: Allowance | null;
  max: number;
}

/** The rep's newest batch (or the one named, if it is theirs), with every item judged AGAIN for the
 *  viewer: a lead that is no longer theirs shows no name, no phone and no audit id. */
export async function batchView(deps: SalesCheckDeps, actor: SalesActor, batchId?: string | null): Promise<BatchView> {
  let q = deps.service.from("sales_check_batches").select("*").eq("actor_user_id", actor.id);
  if (batchId) q = q.eq("id", batchId);
  const { data, error } = await q.gte("created_at", iso(deps.now() - 14 * 86_400_000));
  if (error) throw new Error(`batch read failed: ${error.message}`);
  const batch = ((data ?? []) as BatchRow[]).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] ?? null;
  const allowanceNow = await readAllowance(deps, actor.id).catch(() => null);
  if (!batch) return { batch: null, items: [], allowance: allowanceNow, max: SALES_CHECK_BATCH_MAX };
  const items = await itemsOf(deps.service, batch.id);
  const leads = await readLeads(deps.service, items.map((i) => i.lead_id));
  const view: ItemView[] = items.map((it) => {
    const lead = leads.get(it.lead_id);
    const w = stillWorkable(actor.id, lead);
    const mine = w.ok;
    /* The name is shown for the rep's own leads (an archived one is still theirs, in their Archived list);
       never for another person's lead, a client, or an id that is not a lead. */
    const nameVisible = w.ok || w.reason === "archived";
    const hidden = !mine && it.status !== "skipped";
    const status: ItemStatus = hidden ? "skipped" : it.status;
    const reason = hidden ? "no_longer_yours" : it.reason;
    const showIds = mine && (status === "running" || status === "done" || status === "reused");
    return {
      id: it.id, lead_id: it.lead_id, position: it.position, status, reason,
      message: reason === "not_in_town" && it.detail ? it.detail : reasonText(reason),
      business_name: nameVisible ? (lead?.business_name ?? null) : null,
      phone: mine ? (lead?.phone ?? null) : null,
      website: mine ? (lead?.website ?? null) : null,
      audit_id: showIds ? it.audit_id : null,
      run_id: showIds ? it.run_id : null,
      audit_source: it.audit_source, crawl_source: it.crawl_source, result_at: showIds ? it.result_at : null,
    };
  });
  return {
    batch: { id: batch.id, status: batch.status, created_at: batch.created_at, total: batch.total, refresh: batch.refresh, cancelled: !!batch.cancelled_at, counts: itemCounts(view) },
    items: view,
    allowance: allowanceNow,
    max: SALES_CHECK_BATCH_MAX,
  };
}

/* ═══ What the admin sees ══════════════════════════════════════════════════════════════════════ */

export interface AdminBatchRow {
  id: string; actor_user_id: string; actor_name: string | null; created_at: string; status: string; refresh: boolean;
  counts: ReturnType<typeof itemCounts>; fresh: number; est_usd: number; actual_usd: number | null;
}
export interface AdminOverview {
  since: string;
  batches: AdminBatchRow[];
  reps: Array<{ actor_user_id: string; actor_name: string | null; batches: number; leads: number; fresh: number; reused: number; failed: number; skipped: number; est_usd: number; actual_usd: number }>;
  problems: Array<{ at: string; actor_name: string | null; business_name: string | null; status: string; reason: string | null; message: string | null }>;
}

/** Every rep's batches in the window: leads, fresh vs reused, failures, the estimate booked and the real
 *  Apify cost of the fresh runs (ai_audit_runs.actor_cost_usd). Admin only (the door checks). */
export async function adminOverview(deps: SalesCheckDeps, days: number): Promise<AdminOverview> {
  const since = iso(deps.now() - Math.max(1, Math.min(31, days)) * 86_400_000);
  const { data: b, error } = await deps.service.from("sales_check_batches").select("*").gte("created_at", since);
  if (error) throw new Error(`batch read failed: ${error.message}`);
  const batches = ((b ?? []) as BatchRow[]).sort((x, y) => Date.parse(y.created_at) - Date.parse(x.created_at)).slice(0, 200);
  const ids = batches.map((x) => x.id);
  const items: ItemRow[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const { data, error: e } = await deps.service.from("sales_check_items").select("*").in("batch_id", ids.slice(i, i + 50));
    if (e) throw new Error(`items read failed: ${e.message}`);
    items.push(...((data ?? []) as ItemRow[]));
  }
  const freshRunIds = [...new Set(items.filter((i) => i.audit_source === "new" && i.run_id).map((i) => i.run_id as string))];
  const cost = new Map<string, number>();
  for (let i = 0; i < freshRunIds.length; i += 100) {
    const { data } = await deps.service.from("ai_audit_runs").select("id, actor_cost_usd").in("id", freshRunIds.slice(i, i + 100));
    for (const r of (data ?? []) as Array<{ id: string; actor_cost_usd: number | string | null }>) {
      if (r.actor_cost_usd !== null && r.actor_cost_usd !== undefined) cost.set(r.id, Number(r.actor_cost_usd));
    }
  }
  const actorIds = [...new Set(batches.map((x) => x.actor_user_id))];
  const names = new Map<string, string | null>();
  if (actorIds.length) {
    const { data } = await deps.service.from("team_members").select("user_id, display_name").in("user_id", actorIds);
    for (const t of (data ?? []) as Array<{ user_id: string; display_name: string | null }>) names.set(t.user_id, t.display_name);
  }
  const leadNames = await readLeads(deps.service, [...new Set(items.filter((i) => i.status === "failed" || i.status === "skipped").map((i) => i.lead_id))].slice(0, 200)).catch(() => new Map<string, Lead>());

  const byBatch = new Map<string, ItemRow[]>();
  for (const it of items) (byBatch.get(it.batch_id) ?? byBatch.set(it.batch_id, []).get(it.batch_id)!).push(it);
  const round = (n: number) => Math.round(n * 10000) / 10000;
  const rows: AdminBatchRow[] = batches.map((bt) => {
    const its = byBatch.get(bt.id) ?? [];
    const fresh = its.filter((i) => i.audit_source === "new");
    const actual = fresh.filter((i) => i.run_id && cost.has(i.run_id)).reduce((s, i) => s + (cost.get(i.run_id as string) ?? 0), 0);
    return {
      id: bt.id, actor_user_id: bt.actor_user_id, actor_name: names.get(bt.actor_user_id) ?? null, created_at: bt.created_at,
      status: bt.status, refresh: bt.refresh, counts: itemCounts(its), fresh: fresh.length,
      est_usd: round(fresh.reduce((s, i) => s + Number(i.est_cost_usd ?? 0), 0)),
      actual_usd: fresh.some((i) => i.run_id && cost.has(i.run_id)) ? round(actual) : null,
    };
  });
  const reps = actorIds.map((a) => {
    const mine = rows.filter((r) => r.actor_user_id === a);
    return {
      actor_user_id: a, actor_name: names.get(a) ?? null, batches: mine.length,
      leads: mine.reduce((s, r) => s + r.counts.total, 0), fresh: mine.reduce((s, r) => s + r.fresh, 0),
      reused: mine.reduce((s, r) => s + r.counts.reused, 0), failed: mine.reduce((s, r) => s + r.counts.failed, 0),
      skipped: mine.reduce((s, r) => s + r.counts.skipped, 0),
      est_usd: round(mine.reduce((s, r) => s + r.est_usd, 0)), actual_usd: round(mine.reduce((s, r) => s + (r.actual_usd ?? 0), 0)),
    };
  });
  const problems = items.filter((i) => i.status === "failed" || (i.status === "skipped" && i.reason !== "cancelled"))
    .sort((x, y) => Date.parse(y.finished_at ?? y.created_at ?? "") - Date.parse(x.finished_at ?? x.created_at ?? ""))
    .slice(0, 40)
    .map((i) => ({
      at: i.finished_at ?? i.created_at ?? "", actor_name: names.get(i.actor_user_id) ?? null,
      business_name: leadNames.get(i.lead_id)?.business_name ?? null, status: i.status, reason: i.reason,
      message: i.reason === "not_in_town" && i.detail ? i.detail : reasonText(i.reason),
    }));
  return { since, batches: rows, reps, problems };
}

export { AUDIT_RUN_IN_FLIGHT };
