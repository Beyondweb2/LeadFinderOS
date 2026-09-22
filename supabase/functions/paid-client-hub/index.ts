import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { attachPersistedQueueProgress } from "../../../src/lib/baselineProgress.ts";
import { isUpstreamOutage, resolveOperator } from "../_shared/operator-auth.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const text = (v: unknown) => typeof v === "string" ? v.trim() : "";
const array = (v: unknown) => Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean) : text(v).split(",").map((x) => x.trim()).filter(Boolean);

/* ⚠️ EVERY COLUMN HERE WAS READ BACK AGAINST THE LIVE SCHEMA (2026-09-22). The previous select
   named existing_url, recommendation and priority, none of which exist on client_pages; PostgREST
   refused the whole query with 42703 and, because the error was never read, the hub showed "No
   planned pages yet" for every client. */
const CLIENT_PAGES_COLUMNS = "id,status,primary_question,service,town";

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
        .select("id,business_name,address,search_location,derived_town,website,email,phone,contact_name,amount_paid,payment_date,status,next_action,next_action_date,baseline_audit_id,remeasure_audit_id,remeasure_due_date,delivery_checklist,category,search_keyword,services_included,delivery_ref,notes,delivery_notes,project_overview,project_status,paid_for")
        .eq("id", leadId).eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      if (!lead) return json({ ok: false, error: "client_not_found", detail: "This client is not in your paid-client list." }, 404);
      /* READ ONLY, and only the row this lead points at. The hub never resolves "the newest audit"
         and never creates anything: a Discovery scan on the same lead is invisible here by design,
         because outreach_leads.baseline_audit_id is set by the claim trigger on audit_purpose =
         'baseline' alone. */
      const { data: onboarding, error: onboardingErr } = await service.from("onboarding_responses")
        .select("id,confirmed_location,services,services_list,areas_list,areas_wanted,contact_email,baseline_status,baseline_questions,baseline_approved_at,website_route,domain_status,access_status,client_source,audit_id,standout,accreditations,gbp_consent,gbp_manager_email")
        .eq("lead_id", leadId).eq("status", "paid").order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (onboardingErr) throw onboardingErr;
      const auditId = (lead as Record<string, unknown>).baseline_audit_id as string | null;
      let audit: unknown = null, runs: Array<Record<string, unknown>> = [], pages: unknown[] = [];
      if (auditId) {
        const [a, r] = await Promise.all([
          service.from("ai_audits").select("id,baseline_completed_at,short_code,created_at").eq("id", auditId).maybeSingle(),
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
