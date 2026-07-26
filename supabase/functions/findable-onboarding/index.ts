import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildReportData, type QueueRow, type RunRow } from "../../../src/lib/auditReport.ts";
import { isAggregatorUrl } from "../_shared/aggregators.ts";
import { BASELINE_QUESTIONS, BASELINE_RUNS } from "../../../src/lib/auditQuestionCounts.ts";

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
// PAID BASELINE shape — from the shared question-count policy, so this path and the cheap
// outreach hook cannot drift into each other. See src/lib/auditQuestionCounts.ts for why 10 x 3
// is not negotiable here.
const MAX_BASELINES_PER_LEAD = 2;        // lifetime paid baselines per lead (public endpoint)
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

      // Lockdown #3b: a recent audit is reused rather than duplicated — but ONLY a PAID
      // BASELINE. An outreach audit is a different animal: 3-5 questions, a single run, no
      // forced local scope and no repeat chain. Reusing one handed a paying customer exactly
      // that (measured on the live flow: baseline_target_runs null, business_scope null, 3
      // questions, 1 run) while the results screen told them their baseline was "the average
      // of three separate runs" and that the money-back guarantee is measured against it. The
      // copy was false and this was the likeliest path in: report link, click, onboard inside
      // the window.
      //
      // The distinguishing mark is baseline_target_runs. findable-onboarding is its only
      // caller (BASELINE_RUNS below) and advanceBaseline only ever chains runs onto an audit
      // that already has it, so `> 1` means "this audit IS a paid baseline". Outreach audits
      // leave it null.
      //
      // Anti-abuse is unchanged: a double-submit inside SUBMIT_COOLDOWN_MS is already refused
      // with too_soon above, and from then to AUDIT_REUSE_MS the customer's OWN baseline is
      // reused instead of a second one firing.
      const { data: leadAudits, error: auditsErr } = await service
        .from("ai_audits").select("id, baseline_target_runs").eq("lead_id", leadId);
      if (auditsErr) {
        // Column unreadable (migration pending) → a baseline can't be told from an outreach
        // audit, so reuse nothing. A duplicate baseline costs pennies; a false guarantee
        // costs trust.
        console.warn("[findable-onboarding] baseline_target_runs unreadable, reusing nothing:", auditsErr.message);
      }
      const baselineAuditIds = ((leadAudits ?? []) as Array<{ id: string; baseline_target_runs: number | null }>)
        .filter((a) => Number(a.baseline_target_runs ?? 0) > 1)
        .map((a) => a.id);

      // LIFETIME CEILING on paid baselines for one lead.
      // This endpoint is public (verify_jwt = false) and the only credential is the lead UUID,
      // which every prospect is handed in their report link. The cooldown (10 min) and the reuse
      // window (30 min) only slow repeats down: past 30 minutes a fresh submit bought a whole new
      // 10-question, 3-run baseline plus its own SEO scan, about $0.20 a time, roughly $9/day per
      // known lead id - more than DAILY_CAP_USD (8), so one refreshing prospect could exhaust the
      // day's budget and fail every legitimate audit. Two allows a genuine second attempt if the
      // first was a mess; beyond that an operator can re-run from the Audit page.
      if (baselineAuditIds.length >= MAX_BASELINES_PER_LEAD) {
        console.warn(`[findable-onboarding] lead ${leadId}: baseline cap reached (${baselineAuditIds.length}/${MAX_BASELINES_PER_LEAD}) - saving answers, no new audit`);
        await service.from("onboarding_responses")
          .update({ status: "baseline_cap_reached", updated_at: new Date().toISOString() })
          .eq("id", row.id);
        return json({ ok: true, onboarding_id: row.id, audit_id: null, note: "baseline_cap_reached" });
      }
      if (baselineAuditIds.length) {
        const { data: freshRun } = await service
          .from("ai_audit_runs").select("audit_id, created_at").in("audit_id", baselineAuditIds)
          .gte("created_at", new Date(Date.now() - AUDIT_REUSE_MS).toISOString())
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (freshRun) {
          console.log(`[findable-onboarding] lead ${leadId}: reusing paid baseline ${freshRun.audit_id}`);
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
        // Was: ok:true with the row left on 'submitted', indistinguishable from a submission
        // still waiting to be picked up. Now queryable:
        //   select * from onboarding_responses where status like '%failed%' or status like 'no_%';
        console.warn(`[findable-onboarding] lead ${leadId}: no business type, cannot ask sensible questions - answers saved, no audit`);
        await service.from("onboarding_responses")
          .update({ status: "no_business_type", updated_at: new Date().toISOString() })
          .eq("id", row.id);
        return json({ ok: true, onboarding_id: row.id, audit_id: null, note: "no_business_type" });
      }
      // SCOPE. Every onboarding customer so far is a local trade, and leaving scope null let
      // create-ai-audit's classify fallback emit NATIONAL-pattern questions for one-van
      // plumbers ("plumbing finance options for homeowners UK", "fixed price plumbing quotes
      // for homeowners uk" — both real, both unwinnable, each wasting a question). Forcing
      // 'local' removes them by construction.
      //
      // Guarded: create-ai-audit rejects scope='local' without a usable town (400
      // local_scope_needs_town). The customer types this field, so "UK" or "nationwide" is
      // possible — in that case send no scope and let the classifier decide, rather than
      // failing a paying customer's audit.
      const NON_TOWN = new Set([
        "uk", "u.k.", "united kingdom", "great britain", "britain", "gb", "england", "scotland",
        "wales", "northern ireland", "ireland", "nationwide", "national", "online", "remote",
        "everywhere", "anywhere", "the local area",
      ]);
      const locKey = (confirmedLocation ?? "").toLowerCase().trim();
      const scopeIsLocal = !!locKey && !NON_TOWN.has(locKey);

      // areas_wanted is deliberately NOT passed. create-ai-audit takes a single location
      // string and builds "[service] in [town] UK" from it; there is no multi-area input, and
      // stuffing a list into location_text or specialisms would corrupt the question shape
      // (specialisms drives niche keywords). It stays stored for operator use.
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
          ...(scopeIsLocal ? { business_scope: "local" } : {}),
          // PAID BASELINE: more questions than the outreach hook, measured over repeat runs.
          purpose: "baseline",
          question_count: BASELINE_QUESTIONS,
          baseline_target_runs: BASELINE_RUNS,
        }),
      });
      const created = await res.json().catch(() => ({}));
      if (!res.ok || !created?.ok || !created?.audit_id) {
        console.error("[findable-onboarding] create-ai-audit failed:", created?.error ?? res.status);
        // Distinguishable from 'submitted': this customer paid attention, filled the form, and
        // got no audit. Stays ok:true so the page still offers the plan, but the row now says so.
        await service.from("onboarding_responses")
          .update({ status: "audit_failed", updated_at: new Date().toISOString() })
          .eq("id", row.id);
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

      // SEO. Already computed: process-ai-audit-queue grades the site in its OWN tick before
      // draining questions, so by the time a run reads 'complete' the grade has been sitting
      // in results.seo for minutes. buildReportData only carries it through isRenderableSeo,
      // which drops Apify failure markers (2 of 55 stored runs are failures) — so `seo` here
      // is either a real grade or undefined, and the page shows nothing rather than an error.
      const seo = data.seo
        ? {
            overall_grade: (data.seo as { overallGrade?: string }).overallGrade ?? null,
            categories: (data.seo as { categories?: unknown }).categories ?? null,
            findings: ((data.seo as { leadFindings?: unknown[] }).leadFindings ?? [])
              .slice(0, 4)  // the page shows the main issues, not the full audit
              .map((f) => {
                const x = f as { title?: string; detail?: string; severity?: string };
                return { title: x.title ?? "", detail: x.detail ?? "", severity: x.severity ?? "low" };
              }),
          }
        : null;

      // Baseline progress, so the page can be honest that measurement continues after the
      // first result. Absent column (migration pending) → null, and the page just omits it.
      const targetRuns = Number((audit as { baseline_target_runs?: number }).baseline_target_runs ?? 0);
      let baseline: { runs_done: number; runs_target: number; complete: boolean } | null = null;
      if (targetRuns > 1) {
        const { count } = await service
          .from("ai_audit_runs").select("id", { count: "exact", head: true })
          .eq("audit_id", auditId).in("status", ["complete", "capped"]);
        baseline = {
          runs_done: Math.min(count ?? 0, targetRuns),
          runs_target: targetRuns,
          complete: !!(audit as { baseline?: unknown }).baseline,
        };
      }

      // The report's own strongest finding: the single question+engine whose answer is most
      // damning, and the firms it named instead. pickGutPunch already scores for relevance and
      // skips junk/near-me answers, so this is the same thing the PDF leads with — no second
      // opinion to drift from. null when nothing qualified.
      const gp = data.gutPunch;
      const gutPunch = gp
        ? { question: gp.question, engine: gp.engineLabel, rivals: (gp.rivals ?? []).slice(0, 3) }
        : null;

      return json({
        ok: true,
        status: "complete",
        business_name: data.businessName,
        named: data.named,
        total: data.total,
        gut_punch: gutPunch,
        // Lets the results screen tell "no website, we'll build you one" apart from "has a
        // website but the scan failed", which must stay silent rather than claim anything.
        has_website: (audit as { has_website?: boolean }).has_website === true,
        // Still returned for operator/debug use, but the customer-facing results screen
        // deliberately does NOT show per-search winnable/locked claims: single-run winnability
        // is unstable (one business swung 0 to 0.6 mention rate across identical runs with no
        // work done), and promising specific winnable searches off one run risks the 3-run
        // baseline contradicting us.
        winnability: data.winnability,
        seo,
        baseline,
      });
    }

    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    console.error("[findable-onboarding] error:", e instanceof Error ? e.message : e);
    return json({ ok: false, error: "internal" }, 500);
  }
});
