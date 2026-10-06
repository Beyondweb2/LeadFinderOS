// client-intake — THE PAID CLIENT AUTO-INTAKE, DATABASE HALF (2026-10-06,
// docs/pre-sales-certification/paid-client-auto-intake-final-sales-check.md). The rules are
// src/lib/clientIntake.ts; this file only READS the sources, runs ONE claimed intake, and builds the view
// the client page draws.
//
// Callers: fn client-intake (the queue — the paid trigger and the cron), fn paid-client-hub (`get` reads the
// view; `intake_run` re-runs; `intake_fact` records Paul's decision).
//
// ⛔ ONE INTAKE PER CLIENT AT A TIME: a run starts only by a CONDITIONAL claim on client_intake (queued, or a
//    lease that ran out). Two ticks, a duplicate webhook, a refresh or a retry cannot run it twice.
// ⛔ EVERY SOURCE IS OPTIONAL: each read is its own step; a failure marks that step and the rest carry on.
// ⛔ NO PAID API, NO MESSAGE: the only outward request is the client's own public website, through the
//    existing crawler (crawl-check → crawl-worker), and at most ONE crawl per intake. Google Places, Companies
//    House and the hook audit are READ from what is stored; a fresh Places lookup is Paul's button.
// ⛔ AUTOMATIC FILLING writes only blank lead fields, only from client- or sales-grade answers
//    (autoApplyCandidates), through the seller allowlist (cleanSellerClientInfo). Never a website find.
import { gatherKnown, missingInformation, patchForCandidate } from "../../../src/lib/clientMissingInfo.ts";
import { loadClientSetup, pickOnboarding, recordLeadEvent } from "./client-setup.ts";
import {
  INTAKE_CRAWL_POLL_MS, INTAKE_LEASE_MS, INTAKE_MAX_ATTEMPTS, STEP_LABEL, autoApplyCandidates, cleanOverrides, contentReuse,
  crawlPlan, finishedStatus, intakeCandidates, intakeNoticeBody, intakeNoticeTitle, intakeStatusLine, intakeSummary, mergeClientProfile,
  type ContentReuse, type CrawlPlan, type IntakeRows, type IntakeStatus, type IntakeStep, type IntakeSummary, type ProfileField,
} from "../../../src/lib/clientIntake.ts";
import { isPaidClient } from "../../../src/lib/paidClient.ts";
import { clientClosed } from "../../../src/lib/paymentState.ts";
import { serviceRouteForTotal, serviceRouteFromRow } from "../../../src/lib/findableOffer.ts";
import { cleanAnswers as cleanQuickClose, quickCloseAnswerPairs } from "../../../src/lib/quickClose.ts";
import { handoffSummaryLines } from "../../../src/lib/salesHandoff.ts";
import { HOOK_ENGINES, hookEngineLabel, scoreHookRun, type HookScoreRow } from "../../../src/lib/hookScore.ts";
import { assessCompetitorCleanliness, collectCompetitorNames, countAnsweredCells, isProvableJunkName } from "../../../src/lib/competitorCleaning.ts";
import { excludeSelfRivals } from "../../../src/lib/rivalHook.ts";
import { nameMatches } from "../../../src/lib/nameMatch.ts";

// deno-lint-ignore no-explicit-any
type Service = any;
type Row = Record<string, unknown>;
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** The lead columns the intake reads (every one exists live — read back 2026-10-06). */
export const INTAKE_LEAD_COLUMNS =
  "id,user_id,business_name,phone,email,website,address,derived_town,search_location,search_keyword,category,contact_name,place_id,google_maps_url," +
  "rating,review_count,services_included,service_areas,website_control,website_control_note,amount_paid,status,payment_date,service_terminated_at," +
  "sales_handoff,sold_by_user_id,assigned_to_user_id,contract_total_payments,domain_control";
const ONBOARDING_COLUMNS =
  "id,lead_id,status,source,updated_at,created_at,business_name,business_website,confirmed_location,business_address,services,services_list,areas_list,areas_wanted," +
  "contact_name,contact_email,confirmed_phone,standout,accreditations,must_not_say,website_platform,website_manager,website_route,domain_status,gbp_status,gbp_exists," +
  "plan_tier,website_addon,quick_close,site_rights,services_not_offered,client_source";
const AGREEMENT_COLUMNS = "id,lead_id,onboarding_id,agreement_version,service_route,legal_business_name,business_name,company_number,typed_name,typed_role,business_address,email,phone,website_domain,accepted_at";
const CRAWL_COLUMNS =
  "url,created_at,mode,job_id,requested_from,site:result->siteInfo,fetch_failed:result->signals->fetchFailed," +
  "business:full_evidence->business,completeness:full_evidence->completeness,stats:full_evidence->stats,coverage:full_evidence->coverage," +
  "families:full_evidence->families,audit:full_evidence->audit,technical:full_evidence->technical";
const PROSPECT_AUDIT_OR = "audit_purpose.is.null,audit_purpose.eq.audit,audit_purpose.eq.free_check";

export interface IntakeRecord {
  lead_id: string; status: IntakeStatus; trigger_source: string; queued_at: string; started_at: string | null; finished_at: string | null;
  last_run_at: string | null; lease_until: string | null; attempts: number; crawl_job_id: string | null; crawl_started_at: string | null;
  steps: IntakeStep[]; summary: IntakeSummary | null; overrides: unknown; ready_notified_at: string | null; error: string | null;
}

/* ══ COLLECT ══════════════════════════════════════════════════════════════════════════════════════ */

export interface HookSummary {
  audit_id: string; short_code: string | null; created_at: string | null; complete: boolean; named: number; expected: number;
  /** The audit's own trade / town (inferred context for the profile — never a confirmed fact). */
  trade: string | null; town: string | null;
  per_engine: { engine: string; label: string; named: number; valid: number; expected: number }[];
  questions: { question: string; results: { engine: string; label: string; status: string; competitors: string[] }[] }[];
  rivals_withheld: boolean;
}
export interface CrawlFacts {
  url: string | null; created_at: string | null; mode: string | null; job_id: string | null; completeness: string | null; fetch_failed: boolean;
  pages_ok: number | null; urls_discovered: number | null; capped: boolean;
  platform: string | null; built_by: string | null;
  families: { family: string; count: number }[];
  findings: { id: string; severity: string; title: string; count: number }[];
  logo: string | null; og_image: string | null; reviews_on_site: { value: string; url: string }[]; prices_seen: number;
}
export interface Loaded {
  rows: IntakeRows;
  lead: Row;
  onboardingAll: Row[];
  crawlRow: Row | null;
  crawlJob: { id: string; status: string; started_at: string | null; completed_at: string | null } | null;
  hook: HookSummary | null;
  handoffSend: Row | null;
  steps: IntakeStep[];
}

/** Each source in its own try: a failed read is a failed STEP, never a failed intake. */
async function step<T>(steps: IntakeStep[], key: string, run: () => Promise<{ value: T; status: IntakeStep["status"]; detail?: string | null }>, fallback: T): Promise<T> {
  try {
    const r = await run();
    steps.push({ key, label: STEP_LABEL[key] ?? key, status: r.status, detail: r.detail ?? null, cost: "none" });
    return r.value;
  } catch (e) {
    const msg = (e as { message?: string })?.message ?? String(e);
    console.error(`[client-intake] ${key} failed:`, msg);
    steps.push({ key, label: STEP_LABEL[key] ?? key, status: "failed", detail: msg.slice(0, 200), cost: "none" });
    return fallback;
  }
}

export async function loadIntakeSources(service: Service, leadId: string): Promise<Loaded | null> {
  const { data: lead, error } = await service.from("outreach_leads").select(INTAKE_LEAD_COLUMNS).eq("id", leadId).maybeSingle();
  if (error) throw error;
  if (!lead) return null;
  const L = lead as Row;
  const steps: IntakeStep[] = [{ key: "lead", label: STEP_LABEL.lead, status: "done", detail: null, cost: "none" }];
  const placeId = text(L.place_id);

  const [onboardingAll, agreement, handoffSend, placeCache, companiesHouse, crawlRow, crawlJob, socials, hook] = await Promise.all([
    step<Row[]>(steps, "onboarding", async () => {
      const { data, error: e } = await service.from("onboarding_responses").select(ONBOARDING_COLUMNS).eq("lead_id", leadId).order("updated_at", { ascending: false }).limit(10);
      if (e) throw e;
      const rows = (data ?? []) as Row[];
      const counted = pickOnboarding(rows);
      return { value: rows, status: counted ? "done" : "not_found", detail: counted ? (counted.status === "paid" ? "Their sign-up / onboarding answers" : "An unfinished form") : "The client has not filled in onboarding yet" };
    }, []),
    step<Row | null>(steps, "agreement", async () => {
      const { data, error: e } = await service.from("client_agreement_acceptances").select(AGREEMENT_COLUMNS).eq("lead_id", leadId).order("accepted_at", { ascending: false }).limit(1).maybeSingle();
      if (e) throw e;
      return { value: (data ?? null) as Row | null, status: data ? "done" : "not_found", detail: data ? `Signed ${text((data as Row).agreement_version)}` : "No signed agreement on file" };
    }, null),
    step<Row | null>(steps, "handoff", async () => {
      const { data, error: e } = await service.from("client_handoff_sends").select("sent_at,sent_by_name,sent_by_role,paid_when_sent,onboarding_id").eq("lead_id", leadId).maybeSingle();
      if (e) throw e;
      const h = L.sales_handoff as Row | null;
      return { value: (data ?? null) as Row | null, status: h && Object.keys(h).length ? "done" : "not_found",
        detail: data ? `Sent to Paul by ${text((data as Row).sent_by_name) || "the salesperson"}` : h?.completed_at ? "Complete, not yet sent" : h ? "Partly answered" : "No handoff" };
    }, null),
    step<Row | null>(steps, "places", async () => {
      if (!placeId) return { value: null, status: "not_found", detail: "No Google place on file" };
      const { data, error: e } = await service.from("phone_cache").select("phone,website,address,category,rating,review_count,derived_town,google_maps_uri,created_at").eq("place_id", placeId).maybeSingle();
      if (e) throw e;
      return { value: (data ?? null) as Row | null, status: "reused", detail: data ? "Stored Google details reused — no new lookup" : "The lead's stored Google details" };
    }, null),
    step<Row | null>(steps, "companies_house", async () => {
      if (!placeId) return { value: null, status: "not_found", detail: "No Google place to match on" };
      const { data, error: e } = await service.from("companies_house_checks").select("match,company_number,company_name,company_status,incorporated_on").eq("place_id", placeId).maybeSingle();
      if (e) throw e;
      const strong = data && (data as Row).match === "strong";
      return { value: strong ? data as Row : null, status: strong ? "reused" : "not_found", detail: strong ? "A strong Companies House match on file" : "No confident match on file" };
    }, null),
    step<Row | null>(steps, "crawl", async () => {
      const { data, error: e } = await service.from("lead_crawl_checks").select(CRAWL_COLUMNS).eq("lead_id", leadId).maybeSingle();
      if (e) throw e;
      return { value: (data ?? null) as Row | null, status: data ? "reused" : "not_found", detail: data ? null : "No crawl on file" };
    }, null),
    (async () => {
      try {
        const { data } = await service.from("crawl_jobs").select("id,status,started_at,completed_at").eq("lead_id", leadId).order("started_at", { ascending: false }).limit(1).maybeSingle();
        return (data ?? null) as Loaded["crawlJob"];
      } catch { return null; }
    })(),
    step<{ platform: string; url: string }[]>(steps, "socials", async () => {
      const { data, error: e } = await service.from("lead_social_profiles").select("platform,url,state,is_canonical").eq("lead_id", leadId).eq("is_canonical", true);
      if (e) throw e;
      const rows = ((data ?? []) as Row[]).map((r) => ({ platform: text(r.platform), url: text(r.url) })).filter((r) => r.url);
      return { value: rows, status: rows.length ? "reused" : "not_found", detail: rows.length ? `${rows.length} profile${rows.length === 1 ? "" : "s"} on file` : "None on file" };
    }, []),
    step<HookSummary | null>(steps, "hook_audit", async () => {
      const h = await loadHookSummary(service, leadId);
      return { value: h, status: h ? "reused" : "not_found", detail: h ? (h.complete ? `Named in ${h.named} of ${h.expected} answers` : "Hook audit not complete") : "No hook audit" };
    }, null),
  ]);

  const counted = pickOnboarding(onboardingAll);
  const handoff = (L.sales_handoff ?? null) as Row | null;
  const qc = cleanQuickClose((counted?.quick_close as { answers?: unknown } | null)?.answers);
  if (Object.keys(qc).length) steps.push({ key: "quick_close", label: STEP_LABEL.quick_close, status: "done", detail: `${Object.keys(qc).length} answers`, cost: "none" });
  /* The crawl is used only when it is of THIS client's site (the lead's, else the client's own answer). */
  const site = text(L.website) || text(counted?.business_website);
  const crawlSiteOk = !!crawlRow && !!text(crawlRow.url) && !!site && sameHost(text(crawlRow.url), site);
  const rows: IntakeRows = {
    lead: L, onboarding: counted, agreement, handoff, quickClose: qc as Row, placeCache, companiesHouse,
    crawl: crawlSiteOk ? { url: text(crawlRow!.url), siteInfo: (crawlRow!.site ?? null) as Row | null, business: (crawlRow!.business ?? null) as Row | null } : null,
    hookAudit: hook ? { business_type: hook.trade, location_text: hook.town } : null,
    socials,
  };
  return { rows, lead: L, onboardingAll, crawlRow: crawlSiteOk ? crawlRow : null, crawlJob, hook, handoffSend, steps };
}

function sameHost(a: string, b: string): boolean {
  const h = (u: string) => { try { return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).hostname.toLowerCase().replace(/^www\./, ""); } catch { return u.toLowerCase(); } };
  return h(a) === h(b);
}

/** The newest PROSPECT hook audit (never a baseline / measurement / Discovery), scored with the card's ruler. */
async function loadHookSummary(service: Service, leadId: string): Promise<HookSummary | null> {
  const { data: audits, error } = await service.from("ai_audits").select("id,short_code,created_at,business_name,business_type,location_text,is_market,audit_purpose")
    .eq("lead_id", leadId).or(PROSPECT_AUDIT_OR).order("created_at", { ascending: false }).limit(5);
  if (error) throw error;
  const audit = ((audits ?? []) as Row[]).find((a) => a.is_market !== true);
  if (!audit) return null;
  const { data: run } = await service.from("ai_audit_runs").select("id,status,hook:results->hook,results").eq("audit_id", audit.id).order("run_number", { ascending: false }).limit(1).maybeSingle();
  if (!run) return null;
  const { data: q, error: qErr } = await service.from("ai_audit_queue").select("question,status,result,engines").eq("run_id", run.id).order("id");
  if (qErr) throw qErr;
  const rows = (q ?? []) as HookScoreRow[];
  const business = text(audit.business_name);
  const cleanliness = assessCompetitorCleanliness(collectCompetitorNames(rows as never), run.results, { answeredCells: countAnsweredCells(rows as never) });
  const withheld = !!cleanliness.suppressNames;
  const score = scoreHookRun(run.hook, rows, {
    named: { businessName: business, trade: text(audit.business_type) || null, town: text(audit.location_text) || null },
    town: text(audit.location_text) || null, trade: text(audit.business_type) || null,
    cleanCompetitors: (names) => withheld ? [] : excludeSelfRivals(names.filter((n) => !isProvableJunkName(n)), business, nameMatches),
  });
  const byQ = new Map<string, HookSummary["questions"][number]>();
  for (const r of score.results) {
    const e = byQ.get(r.question) ?? { question: r.question, results: [] };
    e.results.push({ engine: r.engine, label: r.label || hookEngineLabel(r.engine), status: r.status, competitors: r.competitors.slice(0, 3) });
    byQ.set(r.question, e);
  }
  return {
    audit_id: String(audit.id), short_code: (audit.short_code as string | null) ?? null, created_at: (audit.created_at as string | null) ?? null,
    complete: score.complete, named: score.named, expected: score.expected,
    trade: text(audit.business_type) || null, town: text(audit.location_text) || null,
    per_engine: score.perEngine.filter((p) => (HOOK_ENGINES as readonly string[]).includes(p.engine)).map((p) => ({ engine: p.engine, label: p.label, named: p.named, valid: p.valid, expected: p.expected })),
    questions: [...byQ.values()], rivals_withheld: withheld,
  };
}

function crawlFacts(row: Row | null): CrawlFacts | null {
  if (!row) return null;
  const site = (row.site ?? {}) as Row;
  const builtBy = (site.builtBy ?? {}) as Row;
  const business = (row.business ?? {}) as Row;
  const stats = (row.stats ?? {}) as Row;
  const coverage = (row.coverage ?? null) as Row | null;
  const audit = (row.audit ?? null) as { findings?: Array<Row> } | null;
  const rank: Record<string, number> = { high: 0, medium: 1, low: 2, good: 3 };
  const findings = (audit?.findings ?? []).filter((f) => f.severity !== "good")
    .sort((a, b) => (rank[text(a.severity)] ?? 9) - (rank[text(b.severity)] ?? 9)).slice(0, 6)
    .map((f) => ({ id: text(f.id), severity: text(f.severity), title: text(f.title), count: Number(f.count ?? 0) || 0 }));
  return {
    url: text(row.url) || null, created_at: (row.created_at as string | null) ?? null, mode: (row.mode as string | null) ?? null, job_id: (row.job_id as string | null) ?? null,
    completeness: (row.completeness as string | null) ?? null, fetch_failed: row.fetch_failed === true,
    pages_ok: Number.isFinite(Number(stats.pagesOk)) ? Number(stats.pagesOk) : null,
    urls_discovered: Number.isFinite(Number(stats.urlsDiscovered)) ? Number(stats.urlsDiscovered) : null,
    capped: coverage?.capped === true,
    platform: text(builtBy.platform) || null, built_by: text(builtBy.credit) || null,
    families: (Array.isArray(row.families) ? row.families as Row[] : []).slice(0, 8).map((f) => ({ family: text(f.family), count: Number(f.count ?? 0) || 0 })),
    findings,
    logo: text(business.logo) || null, og_image: text(business.ogImage) || null,
    reviews_on_site: (Array.isArray(business.reviews) ? business.reviews as Row[] : []).slice(0, 3).map((r) => ({ value: text(r.value).slice(0, 200), url: text(r.url) })),
    prices_seen: Array.isArray(business.prices) ? (business.prices as unknown[]).length : 0,
  };
}

/* ══ START THE ONE CRAWL (crawl-check's internal intake door) ═══════════════════════════════════════ */

/** Starts an exhaustive crawl of the client's own site through the existing crawler. crawl-check accepts
 *  an internal full crawl ONLY for requested_from = client_intake on a paid client (resolveIntakeCrawl). */
export async function startIntakeCrawl(service: Service, leadId: string): Promise<{ ok: true; jobId: string | null; cached: boolean } | { ok: false; error: string }> {
  try {
    let keys = { service_key: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", anon_key: Deno.env.get("SUPABASE_ANON_KEY") ?? "" };
    try {
      const { data } = await service.rpc("edge_internal_keys");
      const row = Array.isArray(data) ? data[0] : data;
      if (row?.service_key) keys = { service_key: String(row.service_key), anon_key: String(row.anon_key ?? keys.anon_key) };
    } catch { /* the injected keys are the fallback */ }
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/crawl-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${keys.service_key}`, apikey: keys.anon_key, "x-internal-job": "1", "x-cron-secret": Deno.env.get("CRON_SECRET") ?? "" },
      body: JSON.stringify({ lead_id: leadId, mode: "full", requested_from: "client_intake" }),
    });
    const body = await r.json().catch(() => ({})) as Row;
    if (!r.ok || body.ok === false) return { ok: false, error: text(body.error) || `crawl-check answered ${r.status}` };
    if (body.mode !== "full") return { ok: false, error: "The website could not be read by any search crawler — no full crawl started." };
    return { ok: true, jobId: (body.job_id as string | null) ?? null, cached: body.cached === true };
  } catch (e) {
    return { ok: false, error: (e as Error)?.message ?? String(e) };
  }
}

/* ══ ONE RUN ══════════════════════════════════════════════════════════════════════════════════════ */

export type RunOutcome =
  | { ran: false; reason: "not_due" | "not_found" }
  | { ran: true; status: IntakeStatus; summary: IntakeSummary | null };

/** Queue (or re-queue) an intake. A re-run lets the intake start ONE more crawl if none is fresh. */
export async function queueIntake(service: Service, leadId: string, source: "rerun" | "backfill"): Promise<void> {
  const { error } = await service.from("client_intake").upsert({
    lead_id: leadId, status: "queued", trigger_source: source, queued_at: new Date().toISOString(), attempts: 0, lease_until: null,
    crawl_job_id: null, crawl_started_at: null, error: null, updated_at: new Date().toISOString(),
  }, { onConflict: "lead_id" });
  if (error) throw error;
}

export async function runClientIntake(service: Service, leadId: string, nowMs = Date.now()): Promise<RunOutcome> {
  const nowIso = new Date(nowMs).toISOString();
  const { data: cur, error: curErr } = await service.from("client_intake").select("*").eq("lead_id", leadId).maybeSingle();
  if (curErr) throw curErr;
  if (!cur) return { ran: false, reason: "not_found" };
  const prev = cur as IntakeRecord;
  const leaseOver = !prev.lease_until || Date.parse(prev.lease_until) < nowMs;
  if (!(prev.status === "queued" || ((prev.status === "running" || prev.status === "crawling") && leaseOver))) return { ran: false, reason: "not_due" };
  /* THE CLAIM — the one conditional write only one caller can win: it matches only the state just read. */
  let claimQ = service.from("client_intake")
    .update({ status: "running", lease_until: new Date(nowMs + INTAKE_LEASE_MS).toISOString(), last_run_at: nowIso, updated_at: nowIso })
    .eq("lead_id", leadId).eq("status", prev.status);
  claimQ = prev.lease_until ? claimQ.eq("lease_until", prev.lease_until) : claimQ.is("lease_until", null);
  const { data: claimed, error: claimErr } = await claimQ.select("*");
  if (claimErr) throw claimErr;
  const rec = (Array.isArray(claimed) ? claimed[0] : null) as IntakeRecord | null;
  if (!rec) return { ran: false, reason: "not_due" };
  /* A poll while the crawl runs is not an attempt; a fresh start or a crashed run is. */
  const attempts = (prev.attempts ?? 0) + (prev.status === "crawling" ? 0 : 1);
  const base = { attempts, started_at: rec.started_at ?? nowIso };
  const finish = async (patch: Row) => {
    const { error } = await service.from("client_intake").update({ ...base, ...patch, updated_at: new Date().toISOString() }).eq("lead_id", leadId);
    if (error) console.error("[client-intake] could not store the run:", error.message);
  };
  if (attempts > INTAKE_MAX_ATTEMPTS) {
    await finish({ status: "needs_attention", lease_until: null, finished_at: nowIso, error: "Stopped after repeated attempts — press Refresh research." });
    return { ran: true, status: "needs_attention", summary: rec.summary };
  }
  try {
    const loaded = await loadIntakeSources(service, leadId);
    if (!loaded) { await finish({ status: "needs_attention", lease_until: null, finished_at: nowIso, error: "The lead no longer exists." }); return { ran: false, reason: "not_found" }; }
    const L = loaded.lead;
    if (!isPaidClient(L as never) || clientClosed(L as never)) {
      await finish({ status: "needs_attention", lease_until: null, finished_at: nowIso, error: clientClosed(L as never) ? "This client's engagement has ended." : "Not a paid client." });
      return { ran: true, status: "needs_attention", summary: rec.summary };
    }

    /* AUTO-FILL: "Find what we already have", applied for Paul from client / sales answers only. */
    await autoFill(service, leadId, loaded);

    /* THE CRAWL: reuse, wait, start once, or carry on without it. */
    const counted = loaded.rows.onboarding;
    const plan = crawlPlan({
      website: text(L.website) || text(counted?.business_website) || null,
      crawl: loaded.crawlRow ? { url: text(loaded.crawlRow.url), created_at: loaded.crawlRow.created_at as string, mode: loaded.crawlRow.mode as string, completeness: (loaded.crawlRow.completeness as string | null) ?? null, job_id: (loaded.crawlRow.job_id as string | null) ?? null } : null,
      job: loaded.crawlJob, intakeJobId: rec.crawl_job_id, intakeCrawlStartedAt: rec.crawl_started_at, nowMs,
    });
    let crawlPatch: Row = {};
    let crawlStep = crawlStepFor(plan);
    if (plan.action === "start") {
      /* ⛔ The lead's own website is what crawl-check reads; a client who gave a site only on the form is
         crawled once it is on the lead (auto-fill above puts it there when the lead had none). */
      const started = text(L.website) ? await startIntakeCrawl(service, leadId) : { ok: false as const, error: "The website is only on the client's form — it will be crawled once it is on the lead." };
      if (started.ok && !started.cached) {
        crawlPatch = { crawl_job_id: started.jobId, crawl_started_at: nowIso };
        crawlStep = { ...crawlStep, status: "running", detail: "Crawling their website…" };
      } else if (started.ok) crawlStep = { ...crawlStep, status: "reused", detail: "Reused a recent crawl" };
      else crawlStep = { ...crawlStep, status: "failed", detail: started.error.slice(0, 200) };
    }
    const steps = [...loaded.steps.filter((s) => s.key !== "crawl"), crawlStep];
    const fresh = await loadIntakeSources(service, leadId) ?? loaded;
    const { data: ovRow } = await service.from("client_intake").select("overrides").eq("lead_id", leadId).maybeSingle();
    const profile = mergeClientProfile(intakeCandidates(fresh.rows), cleanOverrides(ovRow?.overrides));
    const route = routeOf(fresh);
    const summary = intakeSummary(profile, steps, route);
    const crawling = crawlStep.status === "running";
    if (crawling) {
      await finish({ status: "crawling", lease_until: new Date(nowMs + INTAKE_CRAWL_POLL_MS).toISOString(), steps, summary, error: null, ...crawlPatch });
      return { ran: true, status: "crawling", summary };
    }
    const status = finishedStatus(summary);
    await finish({ status, lease_until: null, finished_at: new Date().toISOString(), steps, summary, error: null, ...crawlPatch });
    await announceFinished(service, leadId, text(L.business_name), status, summary);
    return { ran: true, status, summary };
  } catch (e) {
    const msg = (e as { message?: string })?.message ?? String(e);
    console.error("[client-intake] run failed:", msg);
    /* Released for a later tick (the lease), up to INTAKE_MAX_ATTEMPTS — never a tight retry loop. */
    await finish({ status: "queued", lease_until: new Date(nowMs + INTAKE_CRAWL_POLL_MS).toISOString(), error: msg.slice(0, 300) });
    return { ran: true, status: "queued", summary: rec.summary };
  }
}

function crawlStepFor(plan: CrawlPlan): IntakeStep {
  const status: IntakeStep["status"] = plan.action === "not_needed" ? "not_needed" : plan.action === "reuse" ? "reused" : plan.action === "wait" ? "running" : plan.action === "give_up" ? "failed" : "running";
  return { key: "crawl", label: STEP_LABEL.crawl, status, detail: plan.reason, cost: "none" };
}

function routeOf(l: Loaded): "build" | "optimise" | null {
  return serviceRouteForTotal((l.lead.contract_total_payments as number | null) ?? null) ?? serviceRouteFromRow(l.rows.onboarding as never) ?? null;
}

async function autoFill(service: Service, leadId: string, loaded: Loaded): Promise<void> {
  const setup = await loadClientSetup(service, leadId);
  if (!setup) return;
  const missing = missingInformation(setup.setup.readiness).map((x) => x.key);
  if (!missing.length) return;
  const counted = setup.setup.onboarding;
  const known = gatherKnown({
    missing, lead: setup.lead as { website?: string | null; website_control?: string | null },
    onboardingRows: loaded.onboardingAll, countedOnboardingId: (counted?.id as string | undefined) ?? null,
    crawl: null,
    handoffSiteSituation: ((setup.lead.sales_handoff as { site_situation?: string } | null)?.site_situation) ?? null,
    quickCloseManager: ((counted?.quick_close as { answers?: { manager?: string } } | null)?.answers?.manager) ?? null,
  });
  const applied: string[] = [];
  for (const cand of autoApplyCandidates(known)) {
    const patch = patchForCandidate(cand, setup.lead as { website?: string | null });
    if (!patch) continue;
    /* Only blank fields: the filter is on the UPDATE itself, so a value someone saved a moment ago is never replaced. */
    let q = service.from("outreach_leads").update(patch).eq("id", leadId);
    if (patch.services_included) q = q.or("services_included.is.null,services_included.eq.{}");
    if (patch.service_areas) q = q.or("service_areas.is.null,service_areas.eq.{}");
    if (patch.website) q = q.or("website.is.null,website.eq.");
    if (patch.website_control) q = q.or("website_control.is.null,website_control.eq.,website_control.eq.unknown");
    const { data: won, error } = await q.select("id");
    if (error) { console.error("[client-intake] auto-fill not saved:", error.message); continue; }
    if (!Array.isArray(won) || !won.length) continue;
    applied.push(cand.label);
    await service.from("lead_activity").insert({
      lead_id: leadId, actor_user_id: null, kind: "details_set",
      data: { ...patch, source: "system", from: cand.source, from_label: cand.label, auto_intake: true },
    });
  }
  loaded.steps.push({ key: "autofill", label: STEP_LABEL.autofill, status: applied.length ? "done" : "not_found", detail: applied.length ? `Filled from: ${[...new Set(applied)].join(", ")}` : "Nothing to fill", cost: "none" });
}

/** History once ("intake ready" — the partial unique index), and ONE notification per client. */
async function announceFinished(service: Service, leadId: string, business: string, status: "ready" | "needs_attention", s: IntakeSummary): Promise<void> {
  const { data: claim } = await service.from("client_intake").update({ ready_notified_at: new Date().toISOString() })
    .eq("lead_id", leadId).is("ready_notified_at", null).select("lead_id");
  if (!Array.isArray(claim) || !claim.length) return;
  await recordLeadEvent(service, leadId, "client_intake", {
    source: "system", body: status === "ready" ? "Automatic client intake complete — ready for Paul" : "Automatic client intake complete — needs Paul's attention",
    data: { event: "ready", status, summary: s },
  });
  try {
    const { data: owner } = await service.from("team_members").select("user_id").eq("is_book_owner", true).limit(1).maybeSingle();
    if (owner?.user_id) {
      await service.rpc("notify_person", {
        _user: owner.user_id, _kind: "client_intake", _title: intakeNoticeTitle(business, status), _body: intakeNoticeBody(s),
        _link: `/paid-clients/${leadId}`, _lead: leadId, _dedupe: `client_intake:${leadId}`, _priority: status === "ready" ? 1 : 2,
      });
    }
  } catch (e) { console.error("[client-intake] notification failed (non-blocking):", (e as Error)?.message ?? e); }
}

/** The queue: every due intake, oldest first, a few per tick (each claimed on its own). */
export async function processDueIntakes(service: Service, limit = 5): Promise<{ processed: number; results: Array<{ lead_id: string } & RunOutcome> }> {
  const nowIso = new Date().toISOString();
  const { data, error } = await service.from("client_intake").select("lead_id")
    .or(`status.eq.queued,and(status.in.(running,crawling),lease_until.lt."${nowIso}"),and(status.in.(running,crawling),lease_until.is.null)`)
    .order("queued_at").limit(limit);
  if (error) throw error;
  const results: Array<{ lead_id: string } & RunOutcome> = [];
  for (const r of (data ?? []) as Array<{ lead_id: string }>) {
    try { results.push({ lead_id: r.lead_id, ...(await runClientIntake(service, r.lead_id)) }); }
    catch (e) { console.error("[client-intake] tick failed for", r.lead_id, (e as Error)?.message ?? e); }
  }
  return { processed: results.length, results };
}

/* ══ THE VIEW (paid-client-hub get) ═══════════════════════════════════════════════════════════════ */

export interface IntakeView {
  status: IntakeStatus | null;
  status_line: string;
  trigger_source: string | null;
  queued_at: string | null; finished_at: string | null; last_run_at: string | null; error: string | null;
  steps: IntakeStep[];
  summary: IntakeSummary;
  profile: ProfileField[];
  route: "build" | "optimise" | null;
  sales: {
    handoff_lines: string[]; sent: { at: string; by: string | null; paid_when_sent: boolean } | null;
    quick_close: { key: string; label: string; answer: string }[];
    website_control: string | null; domain_control: string | null;
  };
  client: { onboarding_status: string | null; source: string | null; answers: { label: string; value: string }[]; agreement: { version: string | null; signed_at: string | null; signer: string | null; role: string | null } | null };
  found: { crawl: CrawlFacts | null; crawl_job: Loaded["crawlJob"]; hook: HookSummary | null; content_reuse: ContentReuse; website_manager: string | null; website_platform: string | null };
}

export async function intakeView(service: Service, leadId: string): Promise<IntakeView | null> {
  const [loaded, recRes] = await Promise.all([
    loadIntakeSources(service, leadId),
    service.from("client_intake").select("*").eq("lead_id", leadId).maybeSingle(),
  ]);
  if (!loaded) return null;
  const rec = (recRes?.data ?? null) as IntakeRecord | null;
  const profile = mergeClientProfile(intakeCandidates(loaded.rows), cleanOverrides(rec?.overrides));
  const route = routeOf(loaded);
  const steps = rec?.steps?.length ? rec.steps : loaded.steps;
  const summary = intakeSummary(profile, steps, route);
  const ob = loaded.rows.onboarding;
  const ag = loaded.rows.agreement;
  const qc = (loaded.rows.quickClose ?? {}) as Record<string, string>;
  const answer = (label: string, v: unknown) => (text(v) ? [{ label, value: text(v) }] : []);
  return {
    status: rec?.status ?? null,
    status_line: intakeStatusLine(rec?.status ?? null, rec?.status === "ready" || rec?.status === "needs_attention" ? summary : rec?.summary ?? summary),
    trigger_source: rec?.trigger_source ?? null,
    queued_at: rec?.queued_at ?? null, finished_at: rec?.finished_at ?? null, last_run_at: rec?.last_run_at ?? null, error: rec?.error ?? null,
    steps, summary, profile, route,
    sales: {
      handoff_lines: handoffSummaryLines(loaded.rows.handoff as never),
      sent: loaded.handoffSend ? { at: String(loaded.handoffSend.sent_at), by: (loaded.handoffSend.sent_by_name as string | null) ?? null, paid_when_sent: loaded.handoffSend.paid_when_sent === true } : null,
      quick_close: quickCloseAnswerPairs(qc as never),
      website_control: (loaded.lead.website_control as string | null) ?? null,
      domain_control: (loaded.lead.domain_control as string | null) ?? null,
    },
    client: {
      onboarding_status: (ob?.status as string | null) ?? null, source: (ob?.client_source as string | null) ?? (ob?.source as string | null) ?? null,
      answers: [
        ...answer("What makes them stand out", ob?.standout), ...answer("Accreditations", ob?.accreditations), ...answer("Must not say", ob?.must_not_say),
        ...answer("Not offered", Array.isArray(ob?.services_not_offered) ? (ob!.services_not_offered as string[]).join(", ") : ob?.services_not_offered),
        ...answer("Website platform", ob?.website_platform), ...answer("Who manages the website", ob?.website_manager),
        ...answer("Domain", ob?.domain_status), ...answer("Google Business Profile", ob?.gbp_status ?? ob?.gbp_exists),
      ],
      agreement: ag ? { version: (ag.agreement_version as string | null) ?? null, signed_at: (ag.accepted_at as string | null) ?? null, signer: (ag.typed_name as string | null) ?? null, role: (ag.typed_role as string | null) ?? null } : null,
    },
    found: {
      crawl: crawlFacts(loaded.crawlRow), crawl_job: loaded.crawlJob, hook: loaded.hook,
      content_reuse: contentReuse({ quickCloseRights: qc.rights, siteRights: ob?.site_rights }),
      website_manager: (ob?.website_manager as string | null) ?? null, website_platform: (ob?.website_platform as string | null) ?? null,
    },
  };
}
