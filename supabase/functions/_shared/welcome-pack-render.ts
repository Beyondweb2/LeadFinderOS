/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WELCOME PACK — ONE RENDERER, TWO DELIVERIES.

   The public page at findable.live/w/<code> and the operator's "Download Welcome Pack" button both
   end up here. There is no second builder and no second data path, so the PDF a client is emailed
   and the page they open at that link cannot say different things. (Paul, 2026-09-22: "The public
   version and downloadable version should come from the same underlying Welcome Pack data.")

   ⛔ THE PACK RESOLVES FROM `outreach_leads.baseline_audit_id`, NEVER FROM "THE LATEST AUDIT".
   Given a short code or an audit id, this module finds the audit, then finds the LEAD THAT CLAIMS IT
   AS ITS BASELINE, and refuses if no lead does. A Discovery scan has its own short code and its own
   id and will resolve to an audit row — and then be refused here, because no lead's
   `baseline_audit_id` points at it. See welcomePackData.ts for why that matters.

   ⛔ CLIENT-SAFE COLUMNS ONLY, BY ALLOWLIST. Every table is read through a named column list
   (LEAD_CLIENT_COLUMNS / ONBOARDING_CLIENT_COLUMNS). `notes`, `delivery_notes`, `project_overview`,
   `project_status`, `website_build`, `delivery_ref`, `user_id` and every other operator column are
   simply never fetched, so there is no variable holding one for a renderer to leak. An allowlist of
   columns is a structural guarantee; remembering not to print something is not.
   ⛔ `internal` IS FORCED FALSE. Winnability must never reach a customer document (CLAUDE.md §6).
   ⛔ READ ONLY. This module never writes, never creates an audit, never re-measures. Opening the
   link or pressing Download costs nothing and changes nothing.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { buildReportData, seoStyleForAudit, type QueueRow, type RunRow } from "../../../src/lib/auditReport.ts";
import { isAggregatorUrl } from "./aggregators.ts";
import { buildWelcomePackHtml } from "../../../src/lib/welcomePackHtml.ts";
import { buildBaselineSummary } from "../../../src/lib/baselineSummary.ts";
import { resolveClientFacts, toList } from "../../../src/lib/clientFacts.ts";
import { welcomePackReadiness } from "../../../src/lib/welcomePackData.ts";
import { isShortCode } from "../../../src/lib/reportSlug.ts";

/** ⛔ CLIENT-SAFE LEAD COLUMNS. Operator columns are absent by construction, not by discipline. */
export const LEAD_CLIENT_COLUMNS =
  "id,business_name,website,contact_name,email,phone,address,derived_town,search_location,category,search_keyword,services_included,payment_date,place_id,amount_paid,baseline_audit_id";

/** ⛔ CLIENT-SAFE ONBOARDING COLUMNS. `must_not_say` is read because it is a CONSTRAINT on what we
 *  may write, never rendered; it is dropped before the pack input is built. */
export const ONBOARDING_CLIENT_COLUMNS =
  "business_name,business_website,confirmed_location,services,services_list,areas_list,areas_wanted,contact_name,contact_email,confirmed_phone,incomplete";

const AUDIT_COLUMNS =
  "id,short_code,business_name,business_type,location_text,specialism,website,has_website,is_market,lead_id,baseline_target_runs,is_measurement,audit_purpose,baseline_completed_at";

export interface WelcomePackRenderResult {
  ok: boolean;
  /** The finished document, when ok. */
  html?: string;
  /** A short machine token for the caller's own refusal page/toast. Never echoed to a visitor. */
  error?: string;
  /** One sentence, safe to show. */
  detail?: string;
}

const refuse = (error: string, detail: string): WelcomePackRenderResult => ({ ok: false, error, detail });

/** All queue rows for a set of runs, paginated — PostgREST truncates silently at db-max-rows. */
// deno-lint-ignore no-explicit-any
async function allQueueRows(service: any, runIds: string[]): Promise<QueueRow[]> {
  const out: QueueRow[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await service
      .from("ai_audit_queue").select("id, question, status, result")
      .in("run_id", runIds).order("id").range(from, from + page - 1);
    if (error) throw error;
    const rows = (data ?? []) as QueueRow[];
    out.push(...rows);
    if (rows.length < page) return out;
  }
}

/**
 * Build the Welcome Pack document for a slug (a 6-char short code, or an audit UUID).
 *
 * `service` is a service-role supabase-js client: the runs and queue rows are owner-only under RLS,
 * exactly as the report renderer needs them.
 */
// deno-lint-ignore no-explicit-any
export async function renderWelcomePack(service: any, slug: string): Promise<WelcomePackRenderResult> {
  const key = String(slug || "").trim();
  if (!key) return refuse("no_slug", "No welcome pack specified.");

  /* 1) slug → audit. A short code resolves on ai_audits.short_code (unguessable, unique); anything
        else is treated as an audit id. Exactly the resolution /r/<code> already uses. */
  const query = service.from("ai_audits").select(AUDIT_COLUMNS);
  const { data: audit, error: auditErr } = isShortCode(key)
    ? await query.eq("short_code", key.toLowerCase()).maybeSingle()
    : await query.eq("id", key).maybeSingle();
  if (auditErr) throw auditErr;
  if (!audit) return refuse("not_found", "This welcome pack link is no longer valid.");
  if ((audit as { is_market?: boolean }).is_market === true) {
    return refuse("not_found", "This welcome pack link is no longer valid.");
  }

  /* 2) THE CLAIM CHECK. The lead must point at THIS audit as its baseline. A Discovery scan reaches
        step 1 and dies here, which is the whole point of the module. */
  const leadId = (audit as { lead_id?: string | null }).lead_id ?? null;
  if (!leadId) return refuse("no_client", "This welcome pack link is no longer valid.");
  const { data: lead, error: leadErr } = await service
    .from("outreach_leads").select(LEAD_CLIENT_COLUMNS).eq("id", leadId).maybeSingle();
  if (leadErr) throw leadErr;
  if (!lead) return refuse("no_client", "This welcome pack link is no longer valid.");

  /* 3) READINESS — the same shared rule the hub's Stage 2 pill shows, so the button and the link can
        never disagree about whether there is a pack. */
  const ready = welcomePackReadiness(
    { baseline_audit_id: (lead as { baseline_audit_id?: string | null }).baseline_audit_id },
    audit as { id?: string; audit_purpose?: string | null; baseline_completed_at?: string | null; short_code?: string | null },
  );
  if (ready.state !== "ready") {
    return refuse(ready.state === "waiting" ? "not_ready" : "not_baseline", "This welcome pack is not ready yet.");
  }

  /* 4) the measurement, read exactly as the report reads it. */
  const { data: run, error: runErr } = await service
    .from("ai_audit_runs").select("id, audit_id, run_number, status, mention_rate, results, created_at")
    .eq("audit_id", audit.id).order("run_number", { ascending: false }).limit(1).maybeSingle();
  if (runErr) throw runErr;
  if (!run) return refuse("no_run", "This welcome pack is not ready yet.");
  const { data: allRuns, error: runsErr } = await service
    .from("ai_audit_runs").select("id").eq("audit_id", audit.id);
  if (runsErr) throw runsErr;
  const runIds = ((allRuns ?? []) as Array<{ id: string }>).map((r) => r.id);
  const queueRows = await allQueueRows(service, runIds.length ? runIds : [run.id]);

  const { data: onboarding } = await service
    .from("onboarding_responses").select(ONBOARDING_CLIENT_COLUMNS)
    .eq("lead_id", leadId).eq("status", "paid").order("updated_at", { ascending: false }).limit(1).maybeSingle();

  const auditWebsite = String((audit as { website?: string | null }).website ?? "").trim();
  const leadWebsite = String((lead as { website?: string | null }).website ?? "").trim();
  const ownWebsite = auditWebsite || leadWebsite;
  const placeId = (lead as { place_id?: string | null }).place_id ?? null;
  const hasWebsite: boolean | null = ownWebsite ? true : (placeId ? false : null);

  const report = buildReportData(queueRows, run as RunRow, {
    businessName: (audit as { business_name?: string }).business_name ?? "",
    businessType: (audit as { business_type?: string | null }).business_type ?? "",
    locationText: (audit as { location_text?: string | null }).location_text ?? "",
    specialisms: (audit as { specialism?: string | null }).specialism ?? "",
    isAggregatorUrl,
    ownWebsite,
    hasWebsite,
    seoStyle: seoStyleForAudit(
      (audit as { baseline_target_runs?: unknown }).baseline_target_runs,
      (audit as { is_measurement?: unknown }).is_measurement,
    ),
  });
  if (!report) return refuse("no_results", "This welcome pack is not ready yet.");

  /* ⛔ THE CLIENT DOCUMENT, ALWAYS. `internal` carries the winnability signal and must never be true
     on anything a customer can open; `hidePitch` is forced inside buildWelcomePackHtml. */
  report.internal = false;

  /* The pack's back half IS this client's paid baseline report, and readiness above has already
     proved it: the lead claims this audit and its purpose is 'baseline'. So it gets the same
     percentage-first top the client sees at /r/<code> — one document, one presentation. */
  report.paidSummary = 'baseline';

  /* 5) the facts, resolved by the one ranked resolver, then REDUCED to the client-safe shape. The
        reduction is what stops an operator-only field ever reaching the document even if the
        resolver grows one later. */
  const facts = resolveClientFacts({
    lead: lead as Record<string, never>,
    onboarding: onboarding ?? null,
    baselineAudit: audit as Record<string, never>,
  });

  const html = buildWelcomePackHtml({
    businessName: facts.businessName.value || (audit as { business_name?: string }).business_name || "your business",
    /* ⚠️ NO REVIEW LINK IS STORED ANYWHERE IN THE SCHEMA, so there is none to print and none to
       guess. The reviews page explains how the client finds their own — a wrong review link would
       send their customers to somebody else's listing. Both deliveries behave identically. */
    reviewLink: "",
    report,
    facts: {
      website: facts.website.value,
      primaryLocation: facts.primaryLocation.value,
      category: facts.category.value,
      services: facts.services.values,
      areas: facts.areas.values,
      contactName: facts.contactName.value,
      email: facts.email.value,
      phone: facts.phone.value,
    },
    baseline: buildBaselineSummary(report, (audit as { baseline_completed_at?: string | null }).baseline_completed_at ?? null),
  });

  return { ok: true, html };
}

/** Re-exported so callers do not need a second import just to normalise a jsonb list column. */
export { toList };
