import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { startPaidBaseline } from "../_shared/audit-baseline.ts";
import { BASELINE_QUESTIONS } from "../../../src/lib/auditQuestionCounts.ts";
import { dedupeQuestions } from "../../../src/lib/seedGuard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const errMsg = (e: unknown) => e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e);

type BaselineStatus = "needs_questions" | "needs_approval" | "approved" | "running" | "complete" | "failed";

function cleanQuestions(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [];
  return dedupeQuestions(raw.filter((q): q is string => typeof q === "string")
    .map((q) => q.trim()).filter(Boolean)).questions;
}

async function operator(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const client = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data } = await client.auth.getUser();
  return data.user ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  try {
    const user = await operator(req);
    if (!user) return json({ ok: false, error: "unauthorized" }, 401);
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "get";
    const onboardingId = typeof body.onboarding_id === "string" ? body.onboarding_id.trim() : "";
    const leadId = typeof body.lead_id === "string" ? body.lead_id.trim() : "";
    if (!onboardingId && !leadId) return json({ ok: false, error: "onboarding_id_or_lead_id_required" }, 400);

    const url = Deno.env.get("SUPABASE_URL")!;
    const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    let q = service.from("onboarding_responses")
      .select("id, lead_id, status, confirmed_location, services, services_list, areas_list, baseline_status, baseline_questions, baseline_approved_at, baseline_approved_by")
      .eq("status", "paid");
    if (onboardingId) q = q.eq("id", onboardingId);
    else q = q.eq("lead_id", leadId).order("updated_at", { ascending: false }).limit(1);
    const { data: rows, error: readErr } = await q;
    if (readErr) throw readErr;
    const row = (rows ?? [])[0] as Record<string, unknown> | undefined;
    if (!row?.id || !row.lead_id) return json({ ok: false, error: "paid_onboarding_not_found" }, 404);

    const { data: lead, error: leadErr } = await service.from("outreach_leads")
      .select("id, user_id, business_name, category, search_keyword, search_location, derived_town, website, country")
      .eq("id", row.lead_id).eq("user_id", user.id).maybeSingle();
    if (leadErr) throw leadErr;
    if (!lead) return json({ ok: false, error: "lead_not_found" }, 404);

    const status = (String(row.baseline_status ?? "needs_questions") || "needs_questions") as BaselineStatus;
    const questions = cleanQuestions(row.baseline_questions);
    const details = {
      onboarding_id: row.id, lead_id: row.lead_id, business_name: lead.business_name,
      business_type: lead.category || lead.search_keyword || "", location: row.confirmed_location || lead.derived_town || lead.search_location || "",
      services: row.services || "", services_list: row.services_list || [], areas_list: row.areas_list || [], website: lead.website || "",
      status, questions, approved_at: row.baseline_approved_at || null,
    };
    if (action === "get") return json({ ok: true, baseline: details });

    if (["generate", "save", "approve", "run", "save_context"].indexOf(action) < 0) return json({ ok: false, error: "unsupported_action" }, 400);
    if (["running", "complete"].includes(status)) return json({ ok: true, baseline: details, skipped: "already_started" });

    /* Context is saved on the same lead/onboarding pair the baseline already reads. This is only
       an operator convenience for incomplete manual/onboarding records; it never creates a second
       audit profile and is locked once the measurement has begun. */
    if (action === "save_context") {
      const location = typeof body.location === "string" ? body.location.trim() : String(details.location ?? "").trim();
      const services = typeof body.services === "string" ? body.services.trim() : String(details.services ?? "").trim();
      const serviceList = cleanQuestions(Array.isArray(body.services_list) ? body.services_list : row.services_list);
      const areas = cleanQuestions(Array.isArray(body.areas_list) ? body.areas_list : row.areas_list);
      const businessType = typeof body.business_type === "string" ? body.business_type.trim() : String(details.business_type ?? "").trim();
      const website = typeof body.website === "string" ? body.website.trim() : String(details.website ?? "").trim();
      if (!location || !services || !businessType) return json({ ok: false, error: "location_services_and_business_type_required" }, 400);
      const now = new Date().toISOString();
      const { error: onErr } = await service.from("onboarding_responses").update({
        confirmed_location: location, services, services_list: serviceList, areas_list: areas, updated_at: now,
      }).eq("id", row.id).eq("status", "paid");
      if (onErr) throw onErr;
      const { error: leadUpdateErr } = await service.from("outreach_leads").update({
        category: businessType, website: website || null, search_location: location,
      }).eq("id", lead.id).eq("user_id", user.id);
      if (leadUpdateErr) throw leadUpdateErr;
      return json({ ok: true, baseline: { ...details, location, services, services_list: serviceList, areas_list: areas, business_type: businessType, website } });
    }

    let next = questions;
    if (action === "generate") {
      if (next.length === 0 || body.force === true) {
        const preview = await fetch(`${url}/functions/v1/create-ai-audit`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`,
            "x-cron-secret": Deno.env.get("CRON_SECRET") ?? "",
            "x-internal-job": "1",
          },
          body: JSON.stringify({
            preview: true, purpose: "baseline", user_id: user.id, lead_id: lead.id,
            business_name: lead.business_name,
            business_type: lead.category || lead.search_keyword || "business",
            location_text: details.location, specialisms: row.services || "",
            areas: row.areas_list || [], website: lead.website || null, country: lead.country || null,
            question_count: BASELINE_QUESTIONS,
          }),
        });
        const payload = await preview.json().catch(() => ({}));
        if (!preview.ok || !payload?.ok) return json({ ok: false, error: payload?.error || "draft_generation_failed" }, 502);
        next = cleanQuestions(payload.questions);
      }
      if (next.length === 0) return json({ ok: false, error: "no_questions_generated" }, 422);
      const { error } = await service.from("onboarding_responses").update({
        baseline_questions: next, baseline_status: "needs_approval", updated_at: new Date().toISOString(),
      }).eq("id", row.id).eq("status", "paid").in("baseline_status", ["needs_questions", "needs_approval", "failed"]);
      if (error) throw error;
      return json({ ok: true, baseline: { ...details, status: "needs_approval", questions: next } });
    }

    if (action === "save") {
      if (["approved", "running", "complete"].includes(status)) return json({ ok: false, error: "baseline_questions_locked" }, 409);
      next = cleanQuestions(body.questions);
      if (next.length === 0 || next.length > 40) return json({ ok: false, error: "questions_must_be_between_1_and_40" }, 400);
      const { error } = await service.from("onboarding_responses").update({ baseline_questions: next, baseline_status: "needs_approval", updated_at: new Date().toISOString() }).eq("id", row.id).eq("status", "paid");
      if (error) throw error;
      return json({ ok: true, baseline: { ...details, status: "needs_approval", questions: next } });
    }

    if (action === "approve") {
      if (next.length === 0) return json({ ok: false, error: "questions_required" }, 400);
      const { error } = await service.from("onboarding_responses").update({
        baseline_questions: next, baseline_status: "approved", baseline_approved_at: new Date().toISOString(), baseline_approved_by: user.id, updated_at: new Date().toISOString(),
      }).eq("id", row.id).eq("status", "paid").in("baseline_status", ["needs_questions", "needs_approval", "failed"]);
      if (error) throw error;
      return json({ ok: true, baseline: { ...details, status: "approved", questions: next } });
    }

    // Run only after the approved state is persisted. startPaidBaseline remains the shared
    // idempotent creator used by the webhook/backstop, but its approval guard blocks those callers.
    const started = await startPaidBaseline(service, String(row.id), "operator");
    if (!started.ok) {
      await service.from("onboarding_responses").update({ baseline_status: "failed", updated_at: new Date().toISOString() }).eq("id", row.id);
      return json({ ok: false, error: started.error || "baseline_start_failed" }, 502);
    }
    return json({ ok: true, baseline: { ...details, status: "running", audit_id: started.audit_id }, skipped: started.skipped || null });
  } catch (e) {
    console.error("[paid-baseline]", errMsg(e));
    return json({ ok: false, error: "server_error" }, 500);
  }
});
