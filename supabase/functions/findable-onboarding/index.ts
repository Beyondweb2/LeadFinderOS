import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildReportData, type QueueRow, type RunRow } from "../../../src/lib/auditReport.ts";
import { isAggregatorUrl } from "../_shared/aggregators.ts";

// findable-onboarding — the PUBLIC backend for findable-site's /onboarding flow
// (verify_jwt = false; the static site calls it with the anon apikey only). Three actions:
//
//   prefill  { lead_id }                 → safe prefill fields for a known lead
//   submit   { lead_id?, answers{...} }  → save answers; for a KNOWN lead also fire the audit
//   status   { lead_id, audit_id }       → the audit's report payload when complete
//                                          (never winnability: not defensible, see auditReport.ts)
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

const clip = (v: unknown, max: number): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : null;
};

/**
 * The report payload the onboarding page renders: headline counts, the single most damning answer,
 * the SEO grade, and whether they have a website at all. ONE implementation, used by `submit`
 * (which now returns it inline from the lead's existing run) and by `status` (kept for any client
 * still polling). Returns null when the run has not produced renderable data.
 */
// deno-lint-ignore no-explicit-any
async function buildReportPayload(service: any, audit: any, run: RunRow): Promise<Record<string, unknown> | null> {
  const { data: qrows } = await service
    .from("ai_audit_queue").select("id, question, status, result")
    .eq("run_id", run.id).order("created_at", { ascending: true });
  const data = buildReportData((qrows ?? []) as QueueRow[], run, {
    businessName: audit.business_name ?? "",
    businessType: audit.business_type ?? "",
    locationText: audit.location_text ?? "",
    specialisms: audit.specialism ?? "",
    isAggregatorUrl,
    ownWebsite: audit.website ?? "",
  });
  if (!data) return null;

  const seo = data.seo
    ? {
        overall_grade: (data.seo as { overallGrade?: string }).overallGrade ?? null,
        categories: (data.seo as { categories?: unknown }).categories ?? null,
        findings: ((data.seo as { leadFindings?: unknown[] }).leadFindings ?? [])
          .slice(0, 4)
          .map((f) => {
            const x = f as { title?: string; detail?: string; severity?: string };
            return { title: x.title ?? "", detail: x.detail ?? "", severity: x.severity ?? "low" };
          }),
      }
    : null;

  const gp = data.gutPunch;
  const gutPunch = gp
    ? { question: gp.question, engine: gp.engineLabel, rivals: (gp.rivals ?? []).slice(0, 3) }
    : null;

  // The date the run was MEASURED, so the page can be honest that this is an earlier check
  // rather than something happening now.
  const measuredAt = run.created_at ?? null;

  return {
    business_name: data.businessName,
    named: data.named,
    total: data.total,
    gut_punch: gutPunch,
    has_website: audit.has_website === true,
    seo,
    measured_at: measuredAt,
  };
}

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
      // The flow's single escape hatch ("I'll fill this in later") posts whatever exists so
      // far. Those answers are worth keeping and chasing, so the required-field check is
      // relaxed for them and the row is flagged instead. A COMPLETE submission still has to
      // carry the area and the consent answer.
      const incomplete = body.incomplete === true;
      if (!incomplete && (!confirmedLocation || !gbpConsent)) {
        return json({ ok: false, error: "missing_required" }, 400);
      }
      const gbpEmailRaw = clip(a.gbp_manager_email, 200);
      const gbpEmail = gbpEmailRaw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gbpEmailRaw) ? gbpEmailRaw : null;
      // "Yes to both" exists to collect the address we add as GBP manager. Accepting that
      // answer without it silently loses the single field the option is for — so require it
      // for that answer only. The other two consent options don't need an email, and the
      // escape hatch stays exempt like every other required field.
      if (!incomplete && gbpConsent === "yes_all" && !gbpEmail) {
        return json({ ok: false, error: "missing_gbp_email" }, 400);
      }
      const answers = {
        standout: clip(a.standout, 2000),
        services: clip(a.services, 2000),
        // Storage only. `services` is the audit-facing field (it becomes specialisms),
        // so the areas answer is kept out of it deliberately.
        areas_wanted: clip(a.areas_wanted, 2000),
        confirmed_location: confirmedLocation,
        accreditations: clip(a.accreditations, 2000),
        gbp_consent: gbpConsent,
        gbp_manager_email: gbpEmail,
        business_name: clip(a.business_name, 200),
        incomplete,
      };

      // Save helper. If the areas_wanted migration has not been applied yet, PostgREST
      // rejects the unknown column: retry without it rather than lose a real submission.
      // Removes any ordering hazard between deploying this function and running the SQL.
      const saveAnswers = async (extra: Record<string, unknown>) => {
        const attempt = (payload: Record<string, unknown>) =>
          service.from("onboarding_responses").insert(payload).select("id").maybeSingle();
        let res = await attempt({ ...answers, ...extra });
        // Drop whichever optional column the database does not have yet and retry, so a
        // pending migration can never cost us a real submission.
        for (const col of ["areas_wanted", "incomplete"]) {
          if (res.error && new RegExp(col, "i").test(res.error.message ?? "")) {
            console.warn(`[findable-onboarding] ${col} column missing, saving without it`);
            const reduced = { ...answers } as Record<string, unknown>;
            delete reduced[col];
            res = await attempt({ ...reduced, ...extra });
          }
        }
        return res;
      };

      // GENERIC MODE (no valid lead): save the answers, NEVER fire an audit (lockdown #1).
      if (!leadId) {
        const { data: row, error: insErr } = await saveAnswers({ status: "submitted" });
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

      const { data: row, error: insErr } = await saveAnswers({ lead_id: leadId, status: "submitted" });
      if (insErr || !row) return json({ ok: false, error: "save_failed" }, 500);

      // Customer-confirmed location becomes the lead's location of record (the wizard's
      // write-back convention) — the audit and everything after use CONFIRMED inputs.
      try {
        await service.from("outreach_leads").update({ search_location: confirmedLocation }).eq("id", leadId);
      } catch { /* non-fatal — the audit still gets the confirmed value directly */ }

      // An incomplete submission stops here: there is no confirmed area to audit against, and
      // firing a 3-run paid baseline on a half-answered form would spend real money guessing.
      // The plan screen still works, so they can pay and we chase the answers.
      if (incomplete) {
        return json({ ok: true, onboarding_id: row.id, audit_id: null, incomplete: true });
      }

      // NO AUDIT IS FIRED HERE ANY MORE.
      //
      // It used to start a 10-question, 3-run paid baseline and park the customer on a "building
      // your report" screen for up to five minutes — directly in front of the payment button, for
      // a measurement they cannot see and do not need in order to decide. They have already read
      // their report; that link is what brought them to this page.
      //
      // So: save the answers, hand back whatever we ALREADY know from their most recent completed
      // run, and let them read it and pay. The averaged 3-run baseline starts AFTER payment
      // (stripe-webhook -> startPaidBaseline, with the queue's ensureBaselinesForPaidOnboardings
      // as the backstop), so the guarantee is still measured against three runs — just not while
      // anybody watches.
      //
      // Side effect worth knowing: this public endpoint (verify_jwt = false) now triggers ZERO
      // Apify spend, which removes the "leaked lead id drains the daily cap" exposure entirely.
      // The per-lead baseline cap that used to guard it lives in startPaidBaseline instead, as an
      // idempotency check.
      const { data: leadAudits } = await service
        .from("ai_audits").select("id").eq("lead_id", leadId);
      const auditIds = ((leadAudits ?? []) as Array<{ id: string }>).map((a) => a.id);

      let report: Record<string, unknown> | null = null;
      let existingAuditId: string | null = null;
      if (auditIds.length) {
        // Most recent run that actually produced data, across ALL of this lead's audits.
        const { data: run } = await service
          .from("ai_audit_runs")
          .select("id, audit_id, run_number, status, mention_rate, results, created_at")
          .in("audit_id", auditIds)
          .in("status", ["complete", "capped"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (run) {
          const { data: audit } = await service
            .from("ai_audits").select("*").eq("id", (run as { audit_id: string }).audit_id).maybeSingle();
          if (audit) {
            existingAuditId = (run as { audit_id: string }).audit_id;
            report = await buildReportPayload(service, audit, run as RunRow);
          }
        }
      }

      await service.from("onboarding_responses")
        .update({
          audit_id: existingAuditId,
          // Distinguishable from 'submitted' (never processed) and from 'paid'. Nothing is
          // running, so 'audit_running' would have been a lie.
          status: report ? "answers_saved" : "answers_saved_no_report",
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      return json({ ok: true, onboarding_id: row.id, audit_id: existingAuditId, report });
    }

    // ── status ──────────────────────────────────────────────────────────────────
    if (action === "status") {
      const auditId: string | null =
        typeof body.audit_id === "string" && UUID_RE.test(body.audit_id.trim()) ? body.audit_id.trim() : null;
      if (!leadId || !auditId) return json({ ok: false, error: "bad_request" }, 400);
      // The audit must belong to THIS lead — a random audit UUID gets nothing.
      // select('*') so the baseline columns come through when present and are simply absent
      // when the migration has not run — no second query, no failure either way.
      const { data: audit } = await service
        .from("ai_audits").select("*").eq("id", auditId).maybeSingle();
      if (!audit || audit.lead_id !== leadId) return json({ ok: false, error: "unknown_audit" }, 404);
      const { data: run } = await service
        .from("ai_audit_runs").select("id, audit_id, run_number, status, mention_rate, results, created_at")
        .eq("audit_id", auditId).order("run_number", { ascending: false }).limit(1).maybeSingle();
      if (!run) return json({ ok: true, status: "pending" });
      if (run.status !== "complete" && run.status !== "capped") {
        return json({ ok: true, status: "running" });
      }
      // Complete → the SHARED report payload (same builder `submit` uses). No winnability.
      const { data: qrows } = await service
        .from("ai_audit_queue").select("id, question, status, result")
        .eq("run_id", run.id).order("created_at", { ascending: true });
      const payload = await buildReportPayload(service, audit, run as RunRow);
      if (!payload) return json({ ok: true, status: "running" });
      return json({ ok: true, status: "complete", ...payload });
    }

    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    console.error("[findable-onboarding] error:", e instanceof Error ? e.message : e);
    return json({ ok: false, error: "internal" }, 500);
  }
});
