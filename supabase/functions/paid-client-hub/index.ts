import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { attachPersistedQueueProgress } from "../../../src/lib/baselineProgress.ts";
import { isUpstreamOutage, resolveOperator } from "../_shared/operator-auth.ts";
import { renderWelcomePack } from "../_shared/welcome-pack-render.ts";
import { buildReportData, seoStyleForAudit, type QueueRow, type RunRow } from "../../../src/lib/auditReport.ts";
import { isAggregatorUrl } from "../_shared/aggregators.ts";
import { normaliseWebsiteBuild } from "../../../src/lib/websiteBuildState.ts";

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
  "id,business_name,address,search_location,derived_town,website,email,phone,contact_name,amount_paid,payment_date,status,next_action,next_action_date,baseline_audit_id,remeasure_audit_id,remeasure_due_date,delivery_checklist,category,search_keyword,services_included,delivery_ref,notes,delivery_notes,project_overview,project_status,paid_for,place_id,website_build";

/* The onboarding answers Section 5 and the rebuild prompt read. Everything added here is a fact the
   CLIENT stated; nothing is derived and nothing is operator workflow. */
const HUB_ONBOARDING_COLUMNS =
  "id,business_name,business_website,confirmed_location,business_address,services,services_list,areas_list,areas_wanted,contact_name,contact_email,confirmed_phone,baseline_status,baseline_questions,baseline_approved_at,website_route,domain_status,access_status,client_source,audit_id,standout,accreditations,must_not_say,website_platform,website_platform_other,willing_to_migrate,competitor_name,gbp_consent,gbp_exists,gbp_status,gbp_verified,gbp_manager_email,incomplete";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  try {
    /* The auth service not answering is 503 auth_unavailable, never 401 (_shared/operator-auth.ts). */
    const who = await resolveOperator(req);
    if (!who.ok) return json({ ok: false, error: who.error, detail: who.detail }, who.status);
    const user = who.user;
    const body = await req.json().catch(() => ({}));
    const action = text(body.action) || "list";
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });

    if (action === "list") {
      const { data: leads, error } = await service.from("outreach_leads")
        .select("id,business_name,address,search_location,derived_town,website,email,phone,contact_name,amount_paid,payment_date,status,next_action,next_action_date,baseline_audit_id,remeasure_audit_id,remeasure_due_date,delivery_checklist")
        .eq("user_id", user.id).gt("amount_paid", 0).order("payment_date", { ascending: false });
      if (error) throw error;
      return json({ ok: true, clients: leads ?? [] });
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
      return json({ ok: true, client: { lead, onboarding: onboarding ?? null, audit, runs, pages } });
    }

    /* ══ SECTION 5 — WEBSITE BUILD WORKFLOW STATE ════════════════════════════════════════════════
       The ONLY write this hub makes outside create_manual, and it touches exactly one column on one
       row the operator owns. ⛔ It cannot reach an audit, a baseline, a question set or Discovery:
       the update names `website_build` and nothing else, so there is no shape of request that could
       change a measurement. */
    if (action === "save_website_build") {
      const leadId = text(body.lead_id);
      const patch = normaliseWebsiteBuild(body.website_build);
      const { data: updated, error: saveErr } = await service.from("outreach_leads")
        .update({ website_build: patch }).eq("id", leadId).eq("user_id", user.id)
        .select("id,website_build").maybeSingle();
      if (saveErr) throw saveErr;
      if (!updated) return json({ ok: false, error: "client_not_found", detail: "This client is not in your paid-client list." }, 404);
      return json({ ok: true, website_build: (updated as { website_build?: unknown }).website_build ?? {} });
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
        .select("url,result,created_at").eq("lead_id", leadId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();

      const pagesRes = await service.from("client_pages").select(CLIENT_PAGES_COLUMNS).eq("lead_id", leadId).order("created_at", { ascending: false });
      if (pagesRes.error) throw pagesRes.error;

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
          pages: pagesRes.data ?? [],
        },
      });
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
