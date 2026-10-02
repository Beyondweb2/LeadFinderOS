import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { clientContract } from "../../../src/lib/clientContract.ts";
import { attachPersistedQueueProgress } from "../../../src/lib/baselineProgress.ts";
import { isUpstreamOutage } from "../_shared/operator-auth.ts";
import { refusalBody, requireAdmin } from "../_shared/access.ts";
import { renderWelcomePack } from "../_shared/welcome-pack-render.ts";
import { buildReportData, seoStyleForAudit, type QueueRow, type RunRow } from "../../../src/lib/auditReport.ts";
import { isAggregatorUrl } from "../_shared/aggregators.ts";
import { normaliseWebsiteBuild } from "../../../src/lib/websiteBuildState.ts";
import { isPaidClient, paidClientSource, PAID_CLIENT_OR_FILTER } from "../../../src/lib/paidClient.ts";
import { summariseLeadCrawl, LEAD_CRAWL_SUMMARY_COLUMNS, type LeadCrawlRowLike, type CrawlJobLike } from "../../../src/lib/leadCrawlSummary.ts";
import { cleanCounts, progressLabel, type JobStatus } from "../../../src/lib/crawlJob.ts";
import { answerProblems, buildOnboardingPatch, cleanAnswers, leadPatchFromAnswers } from "../../../src/lib/manualOnboarding.ts";
import { cellNamed } from "../../../src/lib/namedSignal.ts";
import { loadClientSetup, loadClientSetups, recordLeadEvent, submitForDelivery, SETUP_LEAD_COLUMNS, type ClientSetup } from "../_shared/client-setup.ts";
import { sendOperatorAlert } from "../_shared/operator-alert.ts";
import { handoffPrefill, handoffWithPrefill, type SalesHandoffRecord } from "../../../src/lib/salesHandoff.ts";
import { cleanAnswers as cleanQuickClose } from "../../../src/lib/quickClose.ts";
import { serviceRouteForTotal, serviceRouteFromRow } from "../../../src/lib/findableOffer.ts";
import { agreementUrl, AGREEMENT_COPY_TO_PAUL } from "../../../src/lib/clientAgreement.ts";
import { weeklyStart } from "../../../src/lib/weeklyCheck.ts";

/* THE OFFICIAL BASELINE'S VISIBILITY, for the client summary (2026-09-30): answers naming the business
   over the FROZEN runs (usable runs, run_number order, the first baseline_target_runs — the same runs
   the freeze snapshot used), ChatGPT + Gemini, with the report's ruler (cellNamed + the business,
   trade and town). expected = questions × runs × 2. Display only — it decides nothing. */
const SUMMARY_ENGINES = ["chatgpt", "gemini"];
// deno-lint-ignore no-explicit-any
async function baselineVisibility(service: any, audit: Record<string, unknown>, runs: Array<Record<string, unknown>>) {
  if (!audit?.baseline_completed_at) return null;
  const target = Number(audit.baseline_target_runs ?? 3) || 3;
  const frozen = runs.filter((r) => r.status === "complete" || r.status === "capped")
    .sort((a, b) => Number(a.run_number) - Number(b.run_number)).slice(0, target);
  const ids = frozen.map((r) => String(r.id));
  if (!ids.length) return null;
  const rows: Array<{ run_id: string; question: string; result: Record<string, unknown> | null }> = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await service.from("ai_audit_queue").select("id,run_id,question,result").in("run_id", ids).order("id").range(from, from + 999);
    if (error) throw error;
    const batch = (data ?? []) as typeof rows;
    rows.push(...batch);
    if (batch.length < 1000) break;
  }
  const ctx = { businessName: text(audit.business_name), trade: text(audit.business_type) || null, town: text(audit.location_text) || null };
  let named = 0, answered = 0;
  for (const r of rows) for (const e of SUMMARY_ENGINES) {
    const cell = (r.result ?? {})[e];
    if (!cell || typeof cell !== "object") continue;
    answered++;
    if (cellNamed(cell as never, ctx)) named++;
  }
  return { named, answered, expected: rows.length * SUMMARY_ENGINES.length };
}

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const text = (v: unknown) => typeof v === "string" ? v.trim() : "";
const array = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean) : text(v).split(",").map((x) => x.trim()).filter(Boolean);

/* ⚠️ EVERY COLUMN HERE WAS READ BACK AGAINST THE LIVE SCHEMA (2026-09-22). The previous select
   named existing_url, recommendation and priority, none of which exist on client_pages; PostgREST
   refused the whole query with 42703 and, because the error was never read, the hub showed "No
   planned pages yet" for every client. */
const CLIENT_PAGES_COLUMNS = "id,status,primary_question,service,town";

/* ⚠️ READ BACK AGAINST THE LIVE SCHEMA 2026-09-22 (information_schema.columns), including
   `website_build`, which its own migration adds. */
const HUB_LEAD_COLUMNS =
  "id,business_name,address,search_location,derived_town,website,email,phone,contact_name,amount_paid,payment_date,status,next_action,next_action_date,next_action_time,baseline_audit_id,remeasure_audit_id,remeasure_due_date,delivery_checklist,category,search_keyword,services_included,delivery_ref,notes,delivery_notes,project_overview,project_status,paid_for,place_id,website_build,service_areas,website_control,website_control_note,lead_source,assigned_to_user_id,added_by_user_id,sold_by_user_id,sold_at,domain_control,service_terminated_at,service_termination_reason,service_termination_note,stripe_subscription_id,subscription_status,subscription_renews_at,contract_total_payments";

/* The handoff (2026-09-28, src/lib/handoffReadiness.ts): what Sales collected, who sold it, and whether
   Paul can start. The list reads the same readiness, so these columns ride on the list too. */
const HUB_LIST_COLUMNS =
  "id,business_name,address,search_location,derived_town,website,email,phone,contact_name,amount_paid,payment_date,status,next_action,next_action_date,next_action_time,baseline_audit_id,remeasure_audit_id,remeasure_due_date,delivery_checklist,services_included,service_areas,website_control,assigned_to_user_id,sold_by_user_id,service_terminated_at,stripe_subscription_id,subscription_status,subscription_renews_at,contract_total_payments";
/* The prospect audits a paid client arrives with: the hook / quick check / free check. Never a baseline,
   a measurement, Discovery or a replay (those are delivery, shown elsewhere on the hub). */
const PROSPECT_AUDIT_PURPOSES = ["audit", "free_check"];
/* What a salesperson recorded about the conversation: the context Paul needs to pick it up. */
const HANDOFF_ACTIVITY_KINDS = ["note", "call_outcome", "contact_logged", "report_link", "stage_changed", "call_booked", "website_control_set", "lead_added"];

/* The onboarding answers Section 5 and the rebuild prompt read. Everything added here is a fact the
   CLIENT stated; nothing is derived and nothing is operator workflow. */
const HUB_ONBOARDING_COLUMNS =
  "id,business_name,business_website,confirmed_location,business_address,services,services_list,areas_list,areas_wanted,contact_name,contact_email,confirmed_phone,baseline_status,baseline_questions,baseline_approved_at,website_route,domain_status,access_status,client_source,audit_id,standout,accreditations,must_not_say,website_platform,website_platform_other,willing_to_migrate,competitor_name,gbp_consent,gbp_exists,gbp_status,gbp_verified,gbp_manager_email,incomplete,status,website_manager,website_manager_email,website_addon,plan_tier,operator_edited_at,domain_owned,domain_access,domain_third_party,site_rights,authority_confirmed,dns_permission,materials_confirmed,domain_escalated_at";

/* `audit_purpose` is why this list grew: welcomePackReadiness ASSERTS the purpose of the row rather
   than trusting the claim trigger that set baseline_audit_id (CLAUDE.md §4 — test the property). */
const HUB_AUDIT_COLUMNS =
  "id,baseline_completed_at,short_code,created_at,audit_purpose,business_name,business_type,location_text,specialism,website,has_website,baseline_target_runs,is_measurement";

/* ⛔ THE SAVED SHAPE IS AN ALLOWLIST, NOT WHATEVER THE BROWSER SENDS. website_build is a jsonb
   column; normaliseWebsiteBuild (src/lib/websiteBuildState.ts — the same module the browser reads
   with) keeps only known keys, enumerated tokens and capped lengths/counts, so a client could not
   post an arbitrary object into it and a paste cannot bloat the row. */

/** The completed baseline's report payload, built with the SAME shared logic the client report and
 *  the welcome pack use — so the rebuild prompt's figures cannot disagree with the report Paul sends.
 *  Paginated: PostgREST truncates silently at db-max-rows. */
// deno-lint-ignore no-explicit-any
async function buildBaselineReport(service: any, audit: Record<string, unknown>, lead: Record<string, unknown>) {
  const { data: run } = await service.from("ai_audit_runs")
    .select("id, audit_id, run_number, status, mention_rate, results, created_at")
    .eq("audit_id", audit.id).order("run_number", { ascending: false }).limit(1).maybeSingle();
  if (!run) return null;
  const { data: allRuns } = await service.from("ai_audit_runs").select("id").eq("audit_id", audit.id);
  const runIds = ((allRuns ?? []) as Array<{ id: string }>).map((r) => r.id);
  const rows: QueueRow[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await service.from("ai_audit_queue").select("id, question, status, result")
      .in("run_id", runIds.length ? runIds : [run.id]).order("id").range(from, from + page - 1);
    if (error) throw error;
    const batch = (data ?? []) as QueueRow[];
    rows.push(...batch);
    if (batch.length < page) break;
  }
  const ownWebsite = text(audit.website) || text(lead.website);
  const report = buildReportData(rows, run as RunRow, {
    businessName: text(audit.business_name),
    businessType: text(audit.business_type),
    locationText: text(audit.location_text),
    specialisms: text(audit.specialism),
    isAggregatorUrl,
    ownWebsite,
    hasWebsite: ownWebsite ? true : (lead.place_id ? false : null),
    seoStyle: seoStyleForAudit(audit.baseline_target_runs, audit.is_measurement),
  });
  /* ⛔ NEVER the internal view. Winnability must not leave the report module even into a prompt that
     an operator reads — the prompt is pasted into another agent's context and travels. */
  if (report) report.internal = false;
  return report;
}

/** The one onboarding row a paid client's answers live on: the newest PAID row, else the newest row
 *  of any status for the lead (a customer who started onboarding and was then marked paid by hand). */
// deno-lint-ignore no-explicit-any
/** The lead's newest crawl job with its live counts — read only. */
// deno-lint-ignore no-explicit-any
async function latestCrawlJob(service: any, leadId: string): Promise<CrawlJobLike | null> {
  const { data: job } = await service.from("crawl_jobs").select("id,status,started_at,completed_at")
    .eq("lead_id", leadId).order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (!job) return null;
  const { data: raw } = await service.rpc("crawl_job_counts", { p_job: job.id });
  const counts = cleanCounts(raw);
  return { ...job, counts, label: progressLabel(job.status as JobStatus, counts) };
}

/** The job whose rows are the lead's CURRENT inventory: the one its canonical crawl row names, else
 *  its newest finished job. */
// deno-lint-ignore no-explicit-any
async function inventoryJobId(service: any, leadId: string): Promise<string | null> {
  const { data: row } = await service.from("lead_crawl_checks").select("job_id").eq("lead_id", leadId).maybeSingle();
  if (row?.job_id) return row.job_id as string;
  const { data: job } = await service.from("crawl_jobs").select("id").eq("lead_id", leadId)
    .in("status", ["complete", "complete_with_failures"]).order("completed_at", { ascending: false }).limit(1).maybeSingle();
  return (job?.id as string | undefined) ?? null;
}

async function onboardingRowFor(service: any, leadId: string): Promise<Record<string, any> | null> {
  const { data: paid, error } = await service.from("onboarding_responses").select(HUB_ONBOARDING_COLUMNS)
    .eq("lead_id", leadId).eq("status", "paid").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (paid) return paid;
  const { data: latest, error: latestErr } = await service.from("onboarding_responses").select(HUB_ONBOARDING_COLUMNS)
    .eq("lead_id", leadId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (latestErr) throw latestErr;
  return latest ?? null;
}

/** Everything the handoff needs beyond the lead + onboarding rows, for MANY leads in three reads. */
// deno-lint-ignore no-explicit-any
async function handoffEvidenceFor(service: any, leadIds: string[]) {
  const ids = leadIds.length ? leadIds : ["00000000-0000-0000-0000-000000000000"];
  const [ob, crawls, audits] = await Promise.all([
    service.from("onboarding_responses").select("lead_id,updated_at," + HUB_ONBOARDING_COLUMNS).in("lead_id", ids).order("updated_at", { ascending: false }),
    service.from("lead_crawl_checks").select("lead_id").in("lead_id", ids),
    service.from("ai_audits").select("id,lead_id,short_code,created_at,audit_purpose").in("lead_id", ids)
      .or("audit_purpose.is.null," + PROSPECT_AUDIT_PURPOSES.map((p) => "audit_purpose.eq." + p).join(","))
      .order("created_at", { ascending: false }),
  ]);
  if (ob.error) throw ob.error;
  if (crawls.error) throw crawls.error;
  if (audits.error) throw audits.error;
  /* The onboarding row per lead: the newest PAID one, else the newest of any status (as onboardingRowFor). */
  const onboardingByLead = new Map<string, Record<string, unknown>>();
  for (const r of (ob.data ?? []) as Array<Record<string, unknown>>) {
    const k = String(r.lead_id); const cur = onboardingByLead.get(k);
    if (!cur || (cur.status !== "paid" && r.status === "paid")) onboardingByLead.set(k, r);
  }
  const crawled = new Set(((crawls.data ?? []) as Array<{ lead_id: string }>).map((r) => r.lead_id));
  const auditByLead = new Map<string, Record<string, unknown>>();
  for (const a of (audits.data ?? []) as Array<Record<string, unknown>>) if (!auditByLead.has(String(a.lead_id))) auditByLead.set(String(a.lead_id), a);
  return { onboardingByLead, crawled, auditByLead };
}

/** The payment ledger rows for many leads, in one read (the contract summary counts payments made). */
// deno-lint-ignore no-explicit-any
async function ledgerFor(service: any, leadIds: string[]): Promise<Map<string, Array<{ kind: string; status: string; amount_gbp: number | string }>>> {
  const out = new Map<string, Array<{ kind: string; status: string; amount_gbp: number | string }>>();
  if (!leadIds.length) return out;
  const { data, error } = await service.from("payment_ledger").select("lead_id,kind,status,amount_gbp").in("lead_id", leadIds).order("id");
  if (error) throw error;
  for (const r of (data ?? []) as Array<{ lead_id: string; kind: string; status: string; amount_gbp: number | string }>) {
    const a = out.get(r.lead_id); if (a) a.push(r); else out.set(r.lead_id, [r]);
  }
  return out;
}

/** The setup checklist + stage, in the shape the list card and the client page draw (one shape). */
function setupView(s: ClientSetup) {
  const r = s.readiness;
  return {
    ready: r.ready, label: r.label, missing: r.missing, done: r.done, total: r.total, waiting_on: r.waitingOn,
    stage: s.stage.stage, stage_label: s.stage.stageLabel, state: s.stage.state, state_label: s.stage.stateLabel, next: s.stage.next,
  };
}

/* The delivery workflow's History on the client page: the handoff kinds above plus the delivery events. */
const DELIVERY_ACTIVITY_KINDS = ["payment_received", "handoff_saved", "onboarding_submitted", "delivery_submitted", "discovery_run", "baseline_approved", "baseline_run", "build_started", "launched", "crawl_run", "audit_run"];

// deno-lint-ignore no-explicit-any
async function teamNames(service: any): Promise<Map<string, string>> {
  const { data } = await service.from("team_members").select("user_id,display_name");
  return new Map(((data ?? []) as Array<{ user_id: string; display_name: string | null }>).map((t) => [t.user_id, t.display_name ?? "A teammate"]));
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
    const action = text(body.action) || "list";
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });

    if (action === "list") {
      const { data: leads, error } = await service.from("outreach_leads")
        .select(HUB_LIST_COLUMNS + "," + SETUP_LEAD_COLUMNS)
        .eq("user_id", user.id).or(PAID_CLIENT_OR_FILTER).order("payment_date", { ascending: false });
      if (error) throw error;
      /* Membership is isPaidClient (src/lib/paidClient.ts): a recorded amount OR a status Paul set by
         hand. payment_source says which, so a hand-marked client is never shown as Stripe-paid. */
      const members = (leads ?? []).filter(isPaidClient) as Array<Record<string, unknown>>;
      /* THE SETUP CHECKLIST + STAGE + ONE NEXT STEP (src/lib/handoffReadiness.ts + deliveryStage.ts, loaded
         by _shared/client-setup.ts — the same loader the new-client email uses). */
      const [setups, names, ledger] = await Promise.all([loadClientSetups(service, members), teamNames(service), ledgerFor(service, members.map((l) => String(l.id)))]);
      const clients = members.map((l) => {
        const id = String(l.id);
        const s = setups.get(id)!;
        const soldBy = (l.sold_by_user_id ?? l.assigned_to_user_id) as string | null;
        // The list never ships the big jsonb blobs it only needed for the rule.
        const { website_build: _wb, sales_handoff: _sh, ...rest } = l;
        return {
          ...rest, payment_source: paidClientSource(l),
          handoff: setupView(s),
          sold_by_name: soldBy ? names.get(soldBy) ?? "A teammate" : null,
          contract: clientContract({ lead: l as Record<string, never>, onboarding: s.onboarding, ledger: ledger.get(id) ?? [] }),
        };
      });
      return json({ ok: true, clients });
    }

    if (action === "matches") {
      const query = text(body.query);
      if (query.length < 2) return json({ ok: true, leads: [] });
      const { data, error } = await service.from("outreach_leads")
        .select("id,business_name,website,search_location,address,email,phone")
        .eq("user_id", user.id).ilike("business_name", `%${query}%`).limit(8);
      if (error) throw error;
      return json({ ok: true, leads: data ?? [] });
    }

    if (action === "get") {
      const leadId = text(body.lead_id);
      const { data: lead, error } = await service.from("outreach_leads")
        .select(HUB_LEAD_COLUMNS)
        .eq("id", leadId).eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      if (!lead) return json({ ok: false, error: "client_not_found", detail: "This client is not in your paid-client list." }, 404);
      /* READ ONLY, and only the row this lead points at. The hub never resolves "the newest audit"
         and never creates anything: a Discovery scan on the same lead is invisible here by design,
         because outreach_leads.baseline_audit_id is set by the claim trigger on audit_purpose =
         'baseline' alone. */
      const { data: onboarding, error: onboardingErr } = await service.from("onboarding_responses")
        .select(HUB_ONBOARDING_COLUMNS)
        .eq("lead_id", leadId).eq("status", "paid").order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (onboardingErr) throw onboardingErr;
      /* No PAID row: did the customer start one that never reached paid (a client marked paid by
         hand)? Named, not used — the baseline reads paid rows only, so the hub says so and offers the
         manual form, which adopts that row rather than creating a second one. */
      let onboardingUnpaid: { id: string; status: string | null } | null = null;
      if (!onboarding) {
        const { data: other } = await service.from("onboarding_responses").select("id,status")
          .eq("lead_id", leadId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
        onboardingUnpaid = (other as { id: string; status: string | null } | null) ?? null;
      }
      const auditId = (lead as Record<string, unknown>).baseline_audit_id as string | null;
      let audit: unknown = null, runs: Array<Record<string, unknown>> = [], pages: unknown[] = [];
      if (auditId) {
        const [a, r] = await Promise.all([
          service.from("ai_audits").select(HUB_AUDIT_COLUMNS).eq("id", auditId).maybeSingle(),
          /* ⚠️ ai_audit_runs has NO completed_at column (read back 2026-09-22). */
          service.from("ai_audit_runs").select("id,run_number,status,created_at").eq("audit_id", auditId).order("run_number"),
        ]);
        if (a.error) throw a.error;
        if (r.error) throw r.error;
        audit = a.data; runs = (r.data ?? []) as Array<Record<string, unknown>>;
        const ids = runs.map((run) => String(run.id)).filter(Boolean);
        if (ids.length) {
          const { data: queue, error: queueErr } = await service.from("ai_audit_queue").select("run_id,status").in("run_id", ids);
          if (queueErr) throw queueErr;
          runs = attachPersistedQueueProgress(runs, (queue ?? []) as Array<{ run_id: string; status: string | null }>);
        }
      }
      const p = await service.from("client_pages").select(CLIENT_PAGES_COLUMNS).eq("lead_id", leadId).order("created_at", { ascending: false });
      if (p.error) throw p.error;
      pages = p.data ?? [];
      /* THE LEAD'S ONE CRAWL ROW, READ — never run. Whatever screen started it (Outreach, Inbox, the
         lead popup, this hub, Website Build), this is the same row; only its summary travels, never
         the page-by-page evidence (the hub polls this action while a baseline runs). */
      const { data: crawlRow } = await service.from("lead_crawl_checks")
        .select(LEAD_CRAWL_SUMMARY_COLUMNS).eq("lead_id", leadId).maybeSingle();
      const crawlJob = await latestCrawlJob(service, leadId);
      const crawl = summariseLeadCrawl(crawlRow as LeadCrawlRowLike | null, crawlJob);
      /* ══ THE HANDOFF: who sold it, what Sales collected, READY TO START / MISSING INFORMATION ══════
         Read only. The readiness is DERIVED on every read (never stored) from the same rows the rest
         of the hub shows. The salesperson is sold_by_user_id, stamped once at payment by a trigger so
         a later reassignment never erases it; a client older than the stamp falls back to its owner. */
      /* The hub's baseline poller asks with handoff:false: the handoff does not move while a run
         drains, and every poll shares the ~10-connection API pool (CLAUDE.md §4). */
      if (body.handoff === false) {
        return json({ ok: true, client: { lead, onboarding: onboarding ?? null, onboarding_unpaid: onboardingUnpaid, audit, runs, pages, crawl, crawl_job: crawlJob } });
      }
      const visibility = audit ? await baselineVisibility(service, audit as Record<string, unknown>, runs) : null;
      /* What they bought: Findable Build / Optimise, payments made and remaining, the next charge. */
      const contract = clientContract({ lead: lead as Record<string, never>, onboarding: (onboarding ?? null) as Record<string, unknown> | null, ledger: (await ledgerFor(service, [leadId])).get(leadId) ?? [] });
      const L = lead as Record<string, unknown>;
      const [ev, names, act, hist, loaded] = await Promise.all([
        handoffEvidenceFor(service, [leadId]),
        teamNames(service),
        service.from("lead_activity").select("id,kind,body,data,actor_user_id,created_at").eq("lead_id", leadId)
          .in("kind", HANDOFF_ACTIVITY_KINDS).order("created_at", { ascending: false }).limit(25),
        service.from("lead_activity").select("id,kind,body,data,actor_user_id,created_at").eq("lead_id", leadId)
          .in("kind", DELIVERY_ACTIVITY_KINDS).order("created_at", { ascending: false }).limit(40),
        loadClientSetup(service, leadId),
      ]);
      if (act.error) throw act.error;
      if (hist.error) throw hist.error;
      /* ONE checklist rule for the list, this page, the email and Submit (_shared/client-setup.ts). */
      const setup = loaded!.setup;
      const readiness = setup.readiness;
      const nameOf = (id: unknown) => (typeof id === "string" && id ? names.get(id) ?? "A teammate" : null);
      /* The salesperson's handoff, with what the system already knew pre-filled (salesHandoff.ts). The
         saved answers win; the prefill is shown as a suggestion until the salesperson saves it. */
      const saved = (loaded!.lead.sales_handoff ?? null) as SalesHandoffRecord | null;
      const ob = setup.onboarding;
      const pre = handoffPrefill({
        quickClose: cleanQuickClose((ob?.quick_close as { answers?: unknown } | null)?.answers),
        route: serviceRouteFromRow(ob as never), websiteControl: (L.website_control as string | null) ?? null,
        hasWebsite: L.website ? true : null, contactName: (ob?.contact_name as string | null) ?? (L.contact_name as string | null) ?? null,
      });
      const salesHandoff = {
        applies: setup.handoffApplies,
        saved, fields: handoffWithPrefill(saved, pre.fields), prefilled: saved?.saved_at ? [] : pre.prefilled,
        saved_by: nameOf(saved?.saved_by), completed_at: saved?.completed_at ?? null,
      };
      const handoff = {
        readiness,
        setup: setupView(setup),
        sales_handoff: salesHandoff,
        submitted_at: loaded!.lead.delivery_submitted_at ?? null,
        submitted_by: nameOf(loaded!.lead.delivery_submitted_by),
        onboarding_id: (ob?.id as string | undefined) ?? null,
        crawl_age_days: setup.crawlAgeDays,
        history: ((hist.data ?? []) as Array<Record<string, unknown>>).map((a) => ({ ...a, actor: nameOf(a.actor_user_id) ?? ((a.data as { source?: string } | null)?.source === "client" ? "Client" : "System") })),
        sold_by: nameOf(L.sold_by_user_id ?? L.assigned_to_user_id),
        sold_by_recorded: !!L.sold_by_user_id,
        sold_at: L.sold_at ?? null,
        owner_now: nameOf(L.assigned_to_user_id),
        added_by: nameOf(L.added_by_user_id),
        lead_source: L.lead_source ?? null,
        /* What Sales heard about the domain (A/B/C/D) — shown beside the client's own answers, never counted. */
        domain_control: L.domain_control ?? null,
        domain_escalated_at: (ev.onboardingByLead.get(leadId) as Record<string, unknown> | undefined)?.domain_escalated_at ?? null,
        terminated: L.service_terminated_at ? { at: L.service_terminated_at, reason: L.service_termination_reason, note: L.service_termination_note } : null,
        prospect_audit: ev.auditByLead.get(leadId) ?? null,
        activity: ((act.data ?? []) as Array<Record<string, unknown>>).map((a) => ({ ...a, actor: nameOf(a.actor_user_id) ?? "System" })),
      };
      return json({ ok: true, client: { lead, onboarding: onboarding ?? null, onboarding_unpaid: onboardingUnpaid, audit, runs, pages, crawl, crawl_job: crawlJob, handoff, contract, baseline_visibility: visibility } });
    }

    /* ══ END THE SERVICE: a client-side domain / authority / IP dispute (Paul, 2026-09-28) ══════════
       The terms let Findable pause, refuse the cutover, suspend, take the site offline or end the
       service where a third party credibly disputes the client's authority. This records the END and
       its reason. ⛔ THE APP NEVER MOVES MONEY: it does not cancel the subscription or refund anything.
       It excludes the case from the guarantee (the results sender and the re-measure skip it) and
       emails Paul to cancel the subscription in Stripe so no further payment is taken. Explicit
       confirm + a written note, admin only (this whole function is requireAdmin). Once only. */
    if (action === "terminate_service") {
      const leadId = text(body.lead_id);
      const note = text(body.note).slice(0, 1000);
      if (body.reason !== "domain_authority_dispute") return json({ ok: false, error: "bad_reason" }, 400);
      if (note.length < 10) return json({ ok: false, error: "note_required", detail: "Say what the dispute is (at least 10 characters)." }, 400);
      if (body.confirm !== true) return json({ ok: false, error: "confirm_required" }, 400);
      const { data: lead, error } = await service.from("outreach_leads")
        .select("id,business_name,stripe_subscription_id,subscription_status,service_terminated_at")
        .eq("id", leadId).eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      if (!lead) return json({ ok: false, error: "client_not_found" }, 404);
      if (lead.service_terminated_at) return json({ ok: true, already: true, at: lead.service_terminated_at });
      const at = new Date().toISOString();
      const { data: upd, error: upErr } = await service.from("outreach_leads")
        .update({ service_terminated_at: at, service_termination_reason: "domain_authority_dispute", service_termination_note: note, service_terminated_by: user.id })
        .eq("id", leadId).is("service_terminated_at", null).select("id");
      if (upErr) throw upErr;
      if (!upd?.length) return json({ ok: true, already: true });
      const live = !!lead.stripe_subscription_id && !["canceled", "incomplete_expired"].includes(String(lead.subscription_status ?? ""));
      const key = Deno.env.get("RESEND_API_KEY");
      let alerted = false;
      if (key) {
        const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const lines = [
          `You ended the Findable service for <b>${esc(String(lead.business_name ?? "a client"))}</b> (domain / authority dispute).`,
          `Note: ${esc(note)}`,
          live
            ? `<b>Cancel their subscription in Stripe now</b> so no further monthly payment is taken: ${esc(String(lead.stripe_subscription_id))} (status ${esc(String(lead.subscription_status ?? "unknown"))}). The app has not moved any money.`
            : "No live subscription is recorded for this client. Check Stripe anyway before closing it.",
          "Under the terms: the £99 is not refunded for this reason, the money-back guarantee does not cover this interruption, and payments already properly taken are not refunded automatically.",
        ];
        try {
          const r = await fetch("https://api.resend.com/emails", {
            method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({ from: "Findable alerts <alerts@findable.live>", to: ["paul@findable.live"],
              subject: `SERVICE ENDED — ${live ? "cancel the monthly in Stripe" : "check Stripe"} — ${String(lead.business_name ?? "")}`,
              html: lines.map((l) => `<p>${l}</p>`).join("") }),
          });
          alerted = r.ok;
        } catch (e) { console.error("[paid-client-hub] termination alert failed:", (e as Error).message); }
      }
      return json({ ok: true, at, subscription_live: live, alerted });
    }

    /* ══ SECTION 5 — WEBSITE BUILD WORKFLOW STATE ════════════════════════════════════════════════
       The ONLY write this hub makes outside create_manual, and it touches exactly one column on one
       row the operator owns. ⛔ It cannot reach an audit, a baseline, a question set or Discovery:
       the update names `website_build` and nothing else, so there is no shape of request that could
       change a measurement. */
    if (action === "save_website_build") {
      const leadId = text(body.lead_id);
      const patch = normaliseWebsiteBuild(body.website_build);
      const { data: before } = await service.from("outreach_leads").select("website_build").eq("id", leadId).eq("user_id", user.id).maybeSingle();
      const { data: updated, error: saveErr } = await service.from("outreach_leads")
        .update({ website_build: patch }).eq("id", leadId).eq("user_id", user.id)
        .select("id,website_build").maybeSingle();
      if (saveErr) throw saveErr;
      if (!updated) return json({ ok: false, error: "client_not_found", detail: "This client is not in your paid-client list." }, 404);
      /* HISTORY (2026-10-02): the first save of a build is "Build started"; the new site becoming live by
         the shared rule (weeklyCheck.weeklyStart, Build route) is "Launched" — once per lead (unique index). */
      const after = (updated as { website_build?: Record<string, unknown> | null }).website_build ?? null;
      const prev = ((before as { website_build?: Record<string, unknown> | null } | null)?.website_build) ?? null;
      if (!prev || Object.keys(prev).length === 0) await recordLeadEvent(service, leadId, "build_started", { actor: user.id, source: "admin", body: "Website build started" });
      const liveNow = weeklyStart({ route: "build", websiteBuild: after as never, checklist: null, implementedOpportunities: 0 }).ok;
      const liveBefore = weeklyStart({ route: "build", websiteBuild: prev as never, checklist: null, implementedOpportunities: 0 }).ok;
      if (liveNow && !liveBefore) await recordLeadEvent(service, leadId, "launched", { actor: user.id, source: "admin", body: "Launched" + (after?.production_url ? " · " + String(after.production_url) : "") });
      return json({ ok: true, website_build: after ?? {} });
    }

    /* ══ SUBMIT FOR DELIVERY (2026-10-02) ════════════════════════════════════════════════════════════
       The checklist is re-derived on the server; refused unless every REQUIRED item is in. Stamped once,
       snapshot into History. Paul's own submit sends no email (he is the one it would tell). */
    if (action === "submit_delivery") {
      const leadId = text(body.lead_id);
      const { data: own } = await service.from("outreach_leads").select("id").eq("id", leadId).eq("user_id", user.id).maybeSingle();
      if (!own) return json({ ok: false, error: "client_not_found", detail: "This client is not in your paid-client list." }, 404);
      const out = await submitForDelivery(service, leadId, { id: user.id, source: "admin" }, sendOperatorAlert);
      if (!out.ok) {
        return json({ ok: false, error: out.error, detail: out.error === "not_ready" ? `Still missing: ${(out.missing ?? []).join(", ")}` : "Not submitted — try again." }, out.error === "not_ready" ? 409 : 500);
      }
      return json({ ok: true, already: out.already, setup: setupView(out.setup) });
    }

    /* ══ CONFIRM GBP ACCESS: Findable's own tick (the third GBP state, docs/sales-readiness.md §4) ═════
       The same delivery_checklist key the lead popup's cockpit ticks (HANDOFF_GBP_CHECKLIST_KEY). */
    if (action === "confirm_gbp") {
      const leadId = text(body.lead_id);
      const { data: row } = await service.from("outreach_leads").select("delivery_checklist").eq("id", leadId).eq("user_id", user.id).maybeSingle();
      if (!row) return json({ ok: false, error: "client_not_found", detail: "This client is not in your paid-client list." }, 404);
      const list = { ...(((row as { delivery_checklist?: Record<string, unknown> | null }).delivery_checklist) ?? {}), gbp_access: true };
      const { error: upErr } = await service.from("outreach_leads").update({ delivery_checklist: list }).eq("id", leadId).eq("user_id", user.id);
      if (upErr) throw upErr;
      return json({ ok: true });
    }

    /* ══ CLIENT SERVICE AGREEMENT — Paul's view (2026-10-02) ═══════════════════════════════════════
       agreement_status: the link, the route it is agreed on, and every acceptance (read only).
       agreement_set_route: Build / Optimise for the agreement page — creates the link if missing.
         ⛔ Refused once the client has signed on the agreement page: the signed text names the route.
       agreement_send_link: emails the client their agreement link (Resend), stamps last_sent_*.
       ⛔ The acceptances table is write-once and is never written here. */
    if (action === "agreement_status" || action === "agreement_set_route" || action === "agreement_send_link") {
      const leadId = text(body.lead_id);
      const { data: lead, error: leadErr } = await service.from("outreach_leads")
        .select("id,business_name,email,contract_total_payments").eq("id", leadId).eq("user_id", user.id).maybeSingle();
      if (leadErr) throw leadErr;
      if (!lead) return json({ ok: false, error: "client_not_found", detail: "This client is not in your paid-client list." }, 404);
      const L = lead as { id: string; business_name: string | null; email: string | null; contract_total_payments: number | null };
      const loadLink = async () => {
        const { data, error } = await service.from("client_agreement_links")
          .select("token,service_route,created_at,last_sent_at,last_sent_to").eq("lead_id", L.id).maybeSingle();
        if (error) throw error;
        return data as { token: string; service_route: string | null; created_at: string; last_sent_at: string | null; last_sent_to: string | null } | null;
      };
      const loadAcceptances = async () => {
        const { data, error } = await service.from("client_agreement_acceptances")
          .select("method,accepted_at,typed_name,typed_role,email,agreement_version,service_route,stripe_session_id")
          .eq("lead_id", L.id).order("accepted_at", { ascending: false });
        if (error) throw error;
        return (data ?? []) as Array<{ method: string; accepted_at: string; typed_name: string | null; typed_role: string | null; email: string | null; agreement_version: string; service_route: string }>;
      };

      if (action === "agreement_set_route") {
        const route = text(body.route);
        if (route !== "build" && route !== "optimise") return json({ ok: false, error: "bad_route", detail: "Choose Build or Optimise." }, 400);
        const signed = (await loadAcceptances()).find((a) => a.method === "agree_page");
        if (signed && signed.service_route !== route) {
          return json({ ok: false, error: "already_signed", detail: `They have already signed the agreement for ${signed.service_route === "build" ? "Build" : "Optimise"}. The route on a signed agreement cannot change.` }, 409);
        }
        const { error: upErr } = await service.from("client_agreement_links")
          .upsert({ lead_id: L.id, service_route: route }, { onConflict: "lead_id" });
        if (upErr) throw upErr;
      }

      if (action === "agreement_send_link") {
        const link = await loadLink();
        const route = (link?.service_route === "build" || link?.service_route === "optimise") ? link.service_route : serviceRouteForTotal(L.contract_total_payments);
        if (!link || !route) return json({ ok: false, error: "route_not_set", detail: "Set Build or Optimise first, then send the link." }, 409);
        const { data: ob } = await service.from("onboarding_responses").select("contact_email")
          .eq("lead_id", L.id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
        const to = (text(body.to) || text((ob as { contact_email?: string | null } | null)?.contact_email) || text(L.email)).toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) return json({ ok: false, error: "no_email", detail: "There is no email address on file for this client. Add one first." }, 409);
        const key = Deno.env.get("RESEND_API_KEY");
        if (!key) return json({ ok: false, error: "email_unconfigured", detail: "Email is not configured." }, 500);
        const url = agreementUrl(link.token);
        const name = text(L.business_name) || "your business";
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "Findable <alerts@findable.live>", to: [to], reply_to: AGREEMENT_COPY_TO_PAUL,
            subject: `Your Findable agreement - ${name}`,
            text: [
              "Hello,",
              "",
              `Here is your Findable Client Service Agreement for ${name}. Please read it, fill in your details and click "I agree and sign":`,
              "",
              url,
              "",
              "This link is yours alone. You will get a PDF copy of exactly what you agreed to as soon as you sign.",
              "",
              "Any questions, just reply to this email.",
              "",
              "Paul",
              "Findable",
            ].join("\n"),
          }),
        });
        if (!res.ok) {
          const detail = (await res.text()).slice(0, 300);
          await service.from("client_error_reports").insert({ error_id: "agreement_link_email_failed", message: `${res.status} ${detail}`, context: { lead_id: L.id } });
          return json({ ok: false, error: "email_failed", detail: "The email did not send. Try again in a moment." }, 502);
        }
        const { error: stampErr } = await service.from("client_agreement_links")
          .update({ last_sent_at: new Date().toISOString(), last_sent_to: to }).eq("lead_id", L.id);
        if (stampErr) throw stampErr;
      }

      const link = await loadLink();
      const linkRoute = (link?.service_route === "build" || link?.service_route === "optimise") ? link.service_route : null;
      const stampedRoute = serviceRouteForTotal(L.contract_total_payments);
      return json({
        ok: true,
        agreement: {
          url: link ? agreementUrl(link.token) : null,
          route: linkRoute ?? stampedRoute,
          route_source: linkRoute ? "set" : stampedRoute ? "checkout" : null,
          last_sent_at: link?.last_sent_at ?? null,
          last_sent_to: link?.last_sent_to ?? null,
          acceptances: await loadAcceptances(),
        },
      });
    }

    /* ══ WELCOME PACK — the operator's Download button ════════════════════════════════════════════
       Returns the SAME HTML the public findable.live/w/<code> page serves, because both go through
       _shared/welcome-pack-render.ts and there is no second builder. The browser prints it through
       the offscreen-iframe helper every other Findable document uses.
       ⛔ READ ONLY. No audit is created, nothing is re-measured, nothing is written. */
    if (action === "welcome_pack_html") {
      const leadId = text(body.lead_id);
      const { data: lead, error: leadErr } = await service.from("outreach_leads")
        .select("id,baseline_audit_id").eq("id", leadId).eq("user_id", user.id).maybeSingle();
      if (leadErr) throw leadErr;
      if (!lead) return json({ ok: false, error: "client_not_found", detail: "This client is not in your paid-client list." }, 404);
      const auditId = text((lead as { baseline_audit_id?: unknown }).baseline_audit_id);
      if (!auditId) return json({ ok: false, error: "not_ready", detail: "The paid baseline has not run yet, so there is no welcome pack." }, 409);
      const packed = await renderWelcomePack(service, auditId);
      if (!packed.ok || !packed.html) {
        return json({ ok: false, error: packed.error ?? "not_ready", detail: packed.detail ?? "The welcome pack is not ready yet." }, 409);
      }
      return json({ ok: true, html: packed.html });
    }

    /* ══ SECTION 5 — EVERYTHING THE REBUILD PROMPT IS GENERATED FROM ══════════════════════════════
       Data only. The prompt TEXT is assembled in the browser (src/lib/buildPack.ts) at the
       moment the button is pressed, so it always reflects the newest onboarding and baseline data
       and no stale copy is ever stored.
       ⛔ READ ONLY, and every source is fetched by an explicit column list. */
    if (action === "rebuild_context") {
      const leadId = text(body.lead_id);
      const { data: lead, error: leadErr } = await service.from("outreach_leads")
        .select(HUB_LEAD_COLUMNS).eq("id", leadId).eq("user_id", user.id).maybeSingle();
      if (leadErr) throw leadErr;
      if (!lead) return json({ ok: false, error: "client_not_found", detail: "This client is not in your paid-client list." }, 404);

      const { data: onboarding, error: obErr } = await service.from("onboarding_responses")
        .select(HUB_ONBOARDING_COLUMNS)
        .eq("lead_id", leadId).eq("status", "paid").order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (obErr) throw obErr;

      const baselineAuditId = text((lead as { baseline_audit_id?: unknown }).baseline_audit_id) || null;
      let baselineAudit: unknown = null;
      let report: unknown = null;
      let baselineCompletedAt: string | null = null;
      if (baselineAuditId) {
        const { data: a, error: aErr } = await service.from("ai_audits").select(HUB_AUDIT_COLUMNS).eq("id", baselineAuditId).maybeSingle();
        if (aErr) throw aErr;
        baselineAudit = a ?? null;
        baselineCompletedAt = (a as { baseline_completed_at?: string | null } | null)?.baseline_completed_at ?? null;
        /* ⛔ ONLY A COMPLETED BASELINE PRODUCES BASELINE EVIDENCE. A half-finished run would put a
           partial count into a document that tells Claude the measurement is final. */
        if (a && baselineCompletedAt) report = await buildBaselineReport(service, a as Record<string, unknown>, lead as Record<string, unknown>);
      }

      /* DISCOVERY — verified prior context only, and ONLY as a lower-ranked fact source. It can
         never replace the baseline: it is passed to the fact resolver as `discovery`, which loses
         every tie, and its measurement numbers are not read at all. */
      const { data: discovery } = await service.from("ai_audits")
        .select("id,business_name,business_type,location_text,website,specialism,created_at,audit_purpose")
        .eq("lead_id", leadId).eq("audit_purpose", "discovery")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();

      /* STORED CRAWL — read, never re-run. */
      const { data: crawl } = await service.from("lead_crawl_checks")
        .select(LEAD_CRAWL_SUMMARY_COLUMNS).eq("lead_id", leadId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();

      const pagesRes = await service.from("client_pages").select(CLIENT_PAGES_COLUMNS).eq("lead_id", leadId).order("created_at", { ascending: false });
      if (pagesRes.error) throw pagesRes.error;
      const crawlJob = await latestCrawlJob(service, leadId);

      return json({
        ok: true,
        context: {
          lead,
          onboarding: onboarding ?? null,
          baseline_audit: baselineAudit,
          baseline_audit_id: baselineAuditId,
          baseline_completed_at: baselineCompletedAt,
          report,
          discovery_audit: discovery ?? null,
          crawl: crawl ?? null,
          crawl_job: crawlJob,
          pages: pagesRes.data ?? [],
        },
      });
    }

    /* ══ MANUAL ONBOARDING — the form's data ══════════════════════════════════════════════════════
       READ ONLY. The onboarding row the form edits (the paid row; else the newest row the customer
       started for this lead), the lead fields it prefills from, and what the latest crawl DETECTED
       — offered as suggestions the operator must tap, never filled in. */
    if (action === "onboarding_form") {
      const leadId = text(body.lead_id);
      const { data: lead, error: leadErr } = await service.from("outreach_leads")
        .select("id,business_name,contact_name,email,phone,website,category,search_keyword,derived_town,search_location,amount_paid,status")
        .eq("id", leadId).eq("user_id", user.id).maybeSingle();
      if (leadErr) throw leadErr;
      if (!lead || !isPaidClient(lead as never)) return json({ ok: false, error: "client_not_found", detail: "This client is not in your paid-client list." }, 404);
      const row = await onboardingRowFor(service, leadId);
      const { data: crawlRow } = await service.from("lead_crawl_checks").select("result").eq("lead_id", leadId).maybeSingle();
      const si = (crawlRow as { result?: { siteInfo?: { services?: unknown; towns?: unknown } } } | null)?.result?.siteInfo ?? null;
      return json({ ok: true, form: {
        lead, onboarding: row,
        detected: { services: Array.isArray(si?.services) ? si!.services : [], towns: Array.isArray(si?.towns) ? si!.towns : [] },
      } });
    }

    /* ══ MANUAL ONBOARDING — save ════════════════════════════════════════════════════════════════
       ⛔ THE SAME ROW, THE SAME COLUMNS the customer's onboarding writes (src/lib/manualOnboarding.ts
       buildOnboardingPatch), plus provenance (operator_edited_at/by). One row per paid client:
         · a paid row exists → it is updated;
         · the customer started one that never reached "paid" (a client marked paid by hand) → that
           row is updated and marked paid, so their own answers are kept rather than duplicated;
         · none → one is created with client_source 'manual', exactly as create_manual does.
       ⛔ NEVER plan_tier OR website_addon (money), NEVER a baseline, an audit, a message or an email.
       A new row gets baseline_status 'needs_questions' — the state payment gives it — which the
       paid backstop does NOT start (only an operator-approved question set starts). */
    if (action === "save_onboarding") {
      const leadId = text(body.lead_id);
      const { data: lead, error: leadErr } = await service.from("outreach_leads")
        .select("id,business_name,contact_name,email,phone,website,category,notes,amount_paid,status")
        .eq("id", leadId).eq("user_id", user.id).maybeSingle();
      if (leadErr) throw leadErr;
      if (!lead || !isPaidClient(lead as never)) return json({ ok: false, error: "client_not_found", detail: "This client is not in your paid-client list." }, 404);
      const answers = cleanAnswers(body.answers);
      const problems = answerProblems(answers);
      if (problems.length) return json({ ok: false, error: "invalid_answers", detail: problems.map((p) => p.message).join(" "), problems }, 400);
      const now = new Date().toISOString();
      const patch = buildOnboardingPatch(answers, user.id, now);
      const existing = await onboardingRowFor(service, leadId);
      let saved: unknown = null;
      if (existing) {
        const promote = existing.status !== "paid"
          ? { status: "paid", ...(existing.baseline_status ? {} : { baseline_status: "needs_questions" }) }
          : {};
        const { data, error } = await service.from("onboarding_responses")
          .update({ ...patch, ...promote }).eq("id", existing.id).eq("lead_id", leadId)
          .select(HUB_ONBOARDING_COLUMNS).maybeSingle();
        if (error) throw error;
        if (!data) return json({ ok: false, error: "onboarding_changed", detail: "The onboarding record changed while you were editing. Reload and try again." }, 409);
        saved = data;
      } else {
        const { data, error } = await service.from("onboarding_responses")
          .insert({ ...patch, lead_id: leadId, status: "paid", baseline_status: "needs_questions", client_source: "manual" })
          .select(HUB_ONBOARDING_COLUMNS).single();
        if (error) throw error;
        saved = data;
      }
      const { patch: leadPatch, notes } = leadPatchFromAnswers(answers, lead as Record<string, unknown>, now);
      if (notes.length) leadPatch.notes = [text((lead as { notes?: unknown }).notes), ...notes].filter(Boolean).join("\n");
      if (Object.keys(leadPatch).length) {
        const { error } = await service.from("outreach_leads").update(leadPatch).eq("id", leadId).eq("user_id", user.id);
        if (error) throw error;
      }
      return json({ ok: true, onboarding: saved });
    }

    /* ══ THE COMPLETE CRAWL INVENTORY — every URL the lead's current crawl found, page by page ════
       READ ONLY. Paged (offset/limit ≤ 1000) with optional filters, so a 5,000-URL site is browsed,
       searched and exported without any row being left out and without one giant response. */
    if (action === "crawl_inventory") {
      const leadId = text(body.lead_id);
      const { data: owned } = await service.from("outreach_leads").select("id").eq("id", leadId).eq("user_id", user.id).maybeSingle();
      if (!owned) return json({ ok: false, error: "client_not_found", detail: "This client is not in your paid-client list." }, 404);
      const jobId = await inventoryJobId(service, leadId);
      if (!jobId) return json({ ok: true, inventory: { job_id: null, total: 0, rows: [] } });
      const limit = Math.max(1, Math.min(1000, Number(body.limit) || 100));
      const offset = Math.max(0, Number(body.offset) || 0);
      let q = service.from("crawl_urls")
        .select("id,url,status,skip_reason,http_status,final_url,source,depth,family:evidence->d->>family,title:evidence->d->>title,words:evidence->d->>words,noindex:evidence->d->>noindex", { count: "exact" })
        .eq("job_id", jobId).eq("kind", "page");
      const status = text(body.status);
      if (["done", "failed", "skipped", "queued", "processing"].includes(status)) q = q.eq("status", status);
      const family = text(body.family);
      if (/^[a-z_]{2,20}$/.test(family)) q = q.eq("evidence->d->>family", family);
      const search = text(body.q).replace(/[%,()]/g, " ").trim().slice(0, 80);
      if (search) q = q.ilike("url", `%${search}%`);
      const { data, error, count } = await q.order("id").range(offset, offset + limit - 1);
      if (error) throw error;
      return json({ ok: true, inventory: { job_id: jobId, total: count ?? 0, offset, limit, rows: data ?? [] } });
    }

    if (action === "create_manual") {
      const businessName = text(body.business_name);
      const location = text(body.location);
      const services = array(body.services);
      const amountPaid = Number(body.amount_paid);
      if (!businessName || !location || !services.length || !Number.isFinite(amountPaid) || amountPaid <= 0) {
        return json({ ok: false, error: "business_name_location_services_and_paid_amount_required", detail: "Business name, location, at least one service and a paid amount are required." }, 400);
      }
      let leadId = text(body.lead_id);
      if (leadId) {
        const { data: matched } = await service.from("outreach_leads").select("id").eq("id", leadId).eq("user_id", user.id).maybeSingle();
        if (!matched) return json({ ok: false, error: "matching_lead_not_found", detail: "The matched lead could not be found under your account." }, 404);
      } else {
        const { data: created, error } = await service.from("outreach_leads").insert({
          user_id: user.id, business_name: businessName, contact_name: text(body.contact_name) || null,
          email: text(body.email) || null, phone: text(body.phone) || null, website: text(body.website) || null,
          address: location, search_location: location, derived_town: location, category: services[0],
          services_included: services, amount_paid: amountPaid,
          payment_date: text(body.payment_date) || new Date().toISOString().slice(0, 10), status: "in_delivery",
        }).select("id").single();
        if (error) throw error;
        leadId = created.id;
      }
      const { error: leadError } = await service.from("outreach_leads").update({
        business_name: businessName, contact_name: text(body.contact_name) || null, email: text(body.email) || null,
        phone: text(body.phone) || null, website: text(body.website) || null, address: location, search_location: location,
        derived_town: location, category: services[0], services_included: services,
        amount_paid: amountPaid,
        payment_date: text(body.payment_date) || new Date().toISOString().slice(0, 10), status: "in_delivery",
      }).eq("id", leadId).eq("user_id", user.id);
      if (leadError) throw leadError;
      const onboardingPatch = {
        lead_id: leadId, business_name: businessName, confirmed_location: location, services: services.join(", "),
        services_list: services, areas_list: array(body.service_areas), areas_wanted: array(body.service_areas).join(", "),
        contact_email: text(body.email) || null, gbp_consent: "discuss", status: "paid", baseline_status: "needs_questions",
        client_source: "manual", website_route: text(body.website_route) || "optimise_existing",
        domain_status: text(body.domain_status) || (text(body.website) ? "existing" : "new"), access_status: text(body.access_status) || null,
      };
      const { data: existingOnboarding } = await service.from("onboarding_responses").select("id")
        .eq("lead_id", leadId).eq("status", "paid").order("updated_at", { ascending: false }).limit(1).maybeSingle();
      const onboardingError = existingOnboarding
        ? (await service.from("onboarding_responses").update(onboardingPatch).eq("id", existingOnboarding.id)).error
        : (await service.from("onboarding_responses").insert(onboardingPatch)).error;
      if (onboardingError) throw onboardingError;
      return json({ ok: true, lead_id: leadId });
    }
    return json({ ok: false, error: "unsupported_action", detail: "Unknown action." }, 400);
  } catch (e) {
    const message = e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e);
    /* Log the first line only: a Cloudflare 522 page is 8 KB of HTML and used to fill the log. */
    console.error("[paid-client-hub]", message.split("\n")[0].slice(0, 300));
    /* The API not answering (a 522 page, a fetch failure) is 503 upstream_timeout with a sentence,
       never a bare 500 that reads as a bug in this function. A real database refusal keeps 500 but
       still carries a sentence, so no screen ever prints the raw token. */
    if (isUpstreamOutage(e)) {
      return json({ ok: false, error: "upstream_timeout", detail: "The database did not answer in time. Nothing was changed — try again in a moment." }, 503);
    }
    return json({ ok: false, error: "server_error", detail: `The server could not complete this request (${message.split("\n")[0].slice(0, 120)}). Try again.` }, 500);
  }
});
