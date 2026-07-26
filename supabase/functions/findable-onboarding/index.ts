import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildReportData, type QueueRow, type RunRow } from "../../../src/lib/auditReport.ts";
import { isAggregatorUrl } from "../_shared/aggregators.ts";

// findable-onboarding — the PUBLIC backend for findable-site's /onboarding flow
// (verify_jwt = false; the static site calls it with the anon apikey only). Three actions:
//
//   prefill  { lead_id }                 → safe prefill fields for a known lead
//   submit   { lead_id?, answers{...} }  → save answers; for a KNOWN lead also fire the audit
//   status   { lead_id, audit_id }       → poll the audit → winnability list when complete
//
// COST-TAP LOCKDOWN (this function can trigger Apify/OpenAI spend, so it is deliberately
// strict — a stranger with a random UUID must get nothing):
//   1. Audits fire ONLY for an EXISTING lead (the unguessable lead UUID is the capability
//      token). Generic mode (no lead) saves answers but NEVER fires an audit.
//   2. Already-paid clients are rejected (nothing to sell; no spend to burn).
//   3. Rate-limited per lead: a submission within the last 10 minutes → 429; an audit run
//      created within the last 30 minutes → REUSED (its audit_id is returned; no new run).
//   4. All privileged calls (service role, CRON_SECRET) happen HERE, server-side. The
//      client never sees anything but this function's JSON.
//   5. queue_pitch_on_complete is never sent → false: onboarding NEVER queues a WhatsApp
//      pitch (and the pitchEverSent guards are belt-and-braces behind that).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAID_OR_BEYOND = new Set(["payment_received", "in_delivery", "completed"]);
const GBP_CONSENT = new Set(["yes_all", "listings_only", "discuss"]);
const SUBMIT_COOLDOWN_MS = 10 * 60_000;   // one submission per lead per 10 min
const AUDIT_REUSE_MS = 30 * 60_000;       // a run newer than this is reused, never duplicated

const clip = (v: unknown, max: number): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const body = await req.json().catch(() => ({}));
    const action: string = typeof body.action === "string" ? body.action : "";
    const leadId: string | null =
      typeof body.lead_id === "string" && UUID_RE.test(body.lead_id.trim()) ? body.lead_id.trim() : null;

    // ── prefill ─────────────────────────────────────────────────────────────────
    if (action === "prefill") {
      if (!leadId) return json({ ok: false, error: "unknown_lead" }, 404);
      const { data: lead } = await service
        .from("outreach_leads")
        .select("id, business_name, category, search_keyword, search_location, address, status, amount_paid")
        .eq("id", leadId).maybeSingle();
      if (!lead) return json({ ok: false, error: "unknown_lead" }, 404);
      if (PAID_OR_BEYOND.has(lead.status as string) || ((lead.amount_paid as number) ?? 0) > 0) {
        return json({ ok: false, error: "already_client" }, 403);
      }
      // SAFE subset only — never expose phone/email/notes/owner to the public page.
      return json({
        ok: true,
        business_name: lead.business_name ?? "",
        business_type: ((lead.category as string) || (lead.search_keyword as string) || "").trim(),
        location_guess: ((lead.search_location as string) || (lead.address as string) || "").trim(),
      });
    }

    // ── submit ──────────────────────────────────────────────────────────────────
    if (action === "submit") {
      const a = (body.answers ?? {}) as Record<string, unknown>;
      const confirmedLocation = clip(a.confirmed_location, 200);
      const gbpConsent = typeof a.gbp_consent === "string" && GBP_CONSENT.has(a.gbp_consent) ? a.gbp_consent : null;
      if (!confirmedLocation || !gbpConsent) return json({ ok: false, error: "missing_required" }, 400);
      const gbpEmailRaw = clip(a.gbp_manager_email, 200);
      const gbpEmail = gbpEmailRaw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gbpEmailRaw) ? gbpEmailRaw : null;
      const answers = {
        standout: clip(a.standout, 2000),
        services: clip(a.services, 2000),
        confirmed_location: confirmedLocation,
        accreditations: clip(a.accreditations, 2000),
        gbp_consent: gbpConsent,
        gbp_manager_email: gbpEmail,
        business_name: clip(a.business_name, 200),
      };

      // GENERIC MODE (no valid lead): save the answers, NEVER fire an audit (lockdown #1).
      if (!leadId) {
        const { data: row, error: insErr } = await service
          .from("onboarding_responses").insert({ ...answers, status: "submitted" })
          .select("id").maybeSingle();
        if (insErr || !row) return json({ ok: false, error: "save_failed" }, 500);
        return json({ ok: true, onboarding_id: row.id, audit_id: null });
      }

      // LEAD MODE — lockdown #2: the lead must exist and must NOT already be a paying client.
      const { data: lead } = await service
        .from("outreach_leads")
        .select("id, user_id, business_name, category, search_keyword, status, amount_paid, country, website")
        .eq("id", leadId).maybeSingle();
      if (!lead) return json({ ok: false, error: "unknown_lead" }, 404);
      if (PAID_OR_BEYOND.has(lead.status as string) || ((lead.amount_paid as number) ?? 0) > 0) {
        return json({ ok: false, error: "already_client" }, 403);
      }

      // Lockdown #3a: one submission per lead per SUBMIT_COOLDOWN_MS.
      const { data: recent } = await service
        .from("onboarding_responses").select("id, created_at")
        .eq("lead_id", leadId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (recent && Date.now() - new Date(recent.created_at as string).getTime() < SUBMIT_COOLDOWN_MS) {
        return json({ ok: false, error: "too_soon" }, 429);
      }

      const { data: row, error: insErr } = await service
        .from("onboarding_responses").insert({ ...answers, lead_id: leadId, status: "submitted" })
        .select("id").maybeSingle();
      if (insErr || !row) return json({ ok: false, error: "save_failed" }, 500);

      // Customer-confirmed location becomes the lead's location of record (the wizard's
      // write-back convention) — the audit and everything after use CONFIRMED inputs.
      try {
        await service.from("outreach_leads").update({ search_location: confirmedLocation }).eq("id", leadId);
      } catch { /* non-fatal — the audit still gets the confirmed value directly */ }

      // Lockdown #3b: an audit run created in the last AUDIT_REUSE_MS is reused, not duplicated.
      const { data: leadAudits } = await service.from("ai_audits").select("id").eq("lead_id", leadId);
      const auditIds = ((leadAudits ?? []) as Array<{ id: string }>).map((x) => x.id);
      if (auditIds.length) {
        const { data: freshRun } = await service
          .from("ai_audit_runs").select("audit_id, created_at").in("audit_id", auditIds)
          .gte("created_at", new Date(Date.now() - AUDIT_REUSE_MS).toISOString())
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (freshRun) {
          await service.from("onboarding_responses")
            .update({ audit_id: freshRun.audit_id, status: "audit_running", updated_at: new Date().toISOString() })
            .eq("id", row.id);
          return json({ ok: true, onboarding_id: row.id, audit_id: freshRun.audit_id, reused: true });
        }
      }

      // Fire the audit INTERNALLY (lockdown #4) with the CONFIRMED inputs. No pitch (#5):
      // queue_pitch_on_complete is simply not sent, and create-ai-audit treats anything
      // but `=== true` as false.
      const bizType = ((lead.category as string) || (lead.search_keyword as string) || "").trim();
      if (!bizType) {
        // No usable business type → an audit would ask garbage questions. Answers are saved;
        // the page falls through to the plan without a report.
        return json({ ok: true, onboarding_id: row.id, audit_id: null, note: "no_business_type" });
      }
      const res = await fetch(`${supabaseUrl}/functions/v1/create-ai-audit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
          "x-cron-secret": Deno.env.get("CRON_SECRET") ?? "",
          "x-internal-job": "1",
        },
        body: JSON.stringify({
          user_id: lead.user_id,
          lead_id: leadId,
          business_name: lead.business_name,
          business_type: bizType,
          location_text: confirmedLocation,
          specialisms: (answers.services ?? "").slice(0, 200),
          country: lead.country ?? null,
          website: lead.website ?? null,
          has_website: !!lead.website,
        }),
      });
      const created = await res.json().catch(() => ({}));
      if (!res.ok || !created?.ok || !created?.audit_id) {
        console.error("[findable-onboarding] create-ai-audit failed:", created?.error ?? res.status);
        return json({ ok: true, onboarding_id: row.id, audit_id: null, note: "audit_failed" });
      }
      await service.from("onboarding_responses")
        .update({ audit_id: created.audit_id, status: "audit_running", updated_at: new Date().toISOString() })
        .eq("id", row.id);
      return json({ ok: true, onboarding_id: row.id, audit_id: created.audit_id });
    }

    // ── status ──────────────────────────────────────────────────────────────────
    if (action === "status") {
      const auditId: string | null =
        typeof body.audit_id === "string" && UUID_RE.test(body.audit_id.trim()) ? body.audit_id.trim() : null;
      if (!leadId || !auditId) return json({ ok: false, error: "bad_request" }, 400);
      // The audit must belong to THIS lead — a random audit UUID gets nothing.
      const { data: audit } = await service
        .from("ai_audits")
        .select("id, lead_id, business_name, business_type, location_text, specialism, website")
        .eq("id", auditId).maybeSingle();
      if (!audit || audit.lead_id !== leadId) return json({ ok: false, error: "unknown_audit" }, 404);
      const { data: run } = await service
        .from("ai_audit_runs").select("id, audit_id, run_number, status, mention_rate, results")
        .eq("audit_id", auditId).order("run_number", { ascending: false }).limit(1).maybeSingle();
      if (!run) return json({ ok: true, status: "pending" });
      if (run.status !== "complete" && run.status !== "capped") {
        return json({ ok: true, status: "running" });
      }
      // Complete → the SHARED winnability verdicts (same logic as the report).
      const { data: qrows } = await service
        .from("ai_audit_queue").select("id, question, status, result")
        .eq("run_id", run.id).order("created_at", { ascending: true });
      const data = buildReportData((qrows ?? []) as QueueRow[], run as RunRow, {
        businessName: audit.business_name ?? "",
        businessType: audit.business_type ?? "",
        locationText: audit.location_text ?? "",
        specialisms: audit.specialism ?? "",
        isAggregatorUrl,
        ownWebsite: audit.website ?? "",
      });
      if (!data) return json({ ok: true, status: "running" });
      return json({
        ok: true,
        status: "complete",
        business_name: data.businessName,
        named: data.named,
        total: data.total,
        winnability: data.winnability, // [{ question, verdict, rivalCount }]
      });
    }

    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    console.error("[findable-onboarding] error:", e instanceof Error ? e.message : e);
    return json({ ok: false, error: "internal" }, 500);
  }
});
