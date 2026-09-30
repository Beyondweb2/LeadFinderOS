import { bookOwnerId } from "./access.ts";
import { loadEarnings } from "./earnings.ts";
import {
  foldAdminOverview,
  type AdminActivity, type AdminLead, type AdminLedgerRow, type AdminMessage, type AdminOnboarding, type AdminSuppression, type CostRow, type Person, type TriageRow,
} from "../../../src/lib/adminMetrics.ts";
import { TRIAGE_SURFACE_DAYS } from "../../../src/lib/replyTriage.ts";
import type { ClientExtras } from "../../../src/lib/clientHealth.ts";
import type { UsageRow } from "../../../src/lib/adminIntelligence.ts";
import { finaliseTotals, pagePath, periodWindows, resolvePerformanceState, sumTotals, totalsFromAggregate } from "../../../src/lib/searchPerformance.ts";
import { buildExclusions, exclusionNote, type ExclusionRow } from "../../../src/lib/metricExclusions.ts";
import { londonDay, previousPeriod, resolvePeriod, type ReportingPeriod } from "../../../src/lib/reportingPeriod.ts";
import { UNRECORDED_SPEND } from "../../../src/lib/apiCostLabels.ts";
import { FINDABLE_START_ISO, foldCostAccounting, type ApifyAccountCheck, type CostAccounting, type CostDetailRow } from "../../../src/lib/apiCostAccounting.ts";


// THE ADMIN CONTROL CENTRE'S DATA LOADER (moved verbatim from fn admin-overview, 2026-09-30, so the
// dashboard and fn business-summary read the SAME numbers — one loader, never two copies).
// ⛔ Service role, reads only; the CALLER decides who may see the result (admin-overview: requireAdmin;
// business-summary: the cron or the admin). Returns totals — never a message body, phone or Stripe id.

// deno-lint-ignore no-explicit-any
type Service = any;
const PAGE = 1000;
const WAVE = 4;


/** Every row of a query, paged by id (PostgREST stops at 1,000 silently), a few pages at a time. */
// deno-lint-ignore no-explicit-any
async function allRows<T>(build: (from: number, to: number, count: boolean) => any): Promise<T[]> {
  const first = await build(0, PAGE - 1, true);
  if (first.error) throw new Error(first.error.message ?? String(first.error));
  const out: T[] = [...((first.data ?? []) as T[])];
  const total = typeof first.count === "number" ? first.count : out.length;
  const starts: number[] = [];
  for (let from = PAGE; from < total; from += PAGE) starts.push(from);
  for (let i = 0; i < starts.length; i += WAVE) {
    const pages = await Promise.all(starts.slice(i, i + WAVE).map((from) => build(from, from + PAGE - 1, false)));
    for (const p of pages) {
      if (p.error) throw new Error(p.error.message ?? String(p.error));
      out.push(...((p.data ?? []) as T[]));
    }
  }
  const seen = new Set<string>();
  return out.filter((r) => { const id = (r as { id?: string }).id; if (!id) return true; if (seen.has(id)) return false; seen.add(id); return true; });
}

const LEAD_COLUMNS = "id, business_name, created_at, added_by_user_id, assigned_to_user_id, sold_by_user_id, sold_at, status, amount_paid, is_potential_work, call_booked_at, whatsapp_sent_at, next_action, next_action_date, is_archived, phone, email, search_keyword, category, payment_date, refunded_at, service_terminated_at, subscription_status, contract_total_payments, baseline_audit_id, remeasure_due_date, remeasure_audit_id, website, delivery_checklist, website_build, stripe_subscription_id, stripe_customer_id";

async function costRows(service: Service, p: ReportingPeriod): Promise<CostRow[]> {
  const { data, error } = await service.rpc("admin_api_cost", { _from: p.fromMs === null ? null : new Date(p.fromMs).toISOString(), _to: new Date(p.toMs).toISOString() });
  if (error) throw new Error(`admin_api_cost: ${error.message ?? String(error)}`);
  return ((data ?? []) as CostRow[]).map((r) => ({ ...r, usd: Number(r.usd) || 0, calls: Number(r.calls) || 0 }));
}


export async function loadAdminOverview(service: Service, period: ReportingPeriod, nowMs: number): Promise<Record<string, unknown>> {
  const today = resolvePeriod("today", nowMs);
  const yesterday = resolvePeriod("yesterday", nowMs);
  const week = resolvePeriod("week", nowMs);
  const month = resolvePeriod("mtd", nowMs);

  const [owner, teamRes, rolesRes, exRes, leads, outbound, inbound, activity, sups, ledgerRes, onboardingRes] = await Promise.all([
    bookOwnerId(service),
    service.from("team_members").select("user_id, display_name, status"),
    service.from("user_roles").select("user_id, role"),
    service.from("metric_exclusions").select("kind, value, reason"),
    allRows<AdminLead>((a, b, c) => service.from("outreach_leads").select(LEAD_COLUMNS, c ? { count: "exact" } : undefined).order("id").range(a, b)),
    allRows<AdminMessage & { id: string }>((a, b, c) => service.from("whatsapp_messages").select("id, lead_id, direction, status, created_at, sent_by_user_id, template_name, test_mode", c ? { count: "exact" } : undefined).eq("direction", "outbound").not("lead_id", "is", null).order("id").range(a, b)),
    // Bodies only for inbound: the automated-reply check needs them; nothing leaves this function.
    allRows<AdminMessage & { id: string }>((a, b, c) => service.from("whatsapp_messages").select("id, lead_id, direction, status, created_at, body, sent_by_user_id, template_name, test_mode", c ? { count: "exact" } : undefined).eq("direction", "inbound").not("lead_id", "is", null).order("id").range(a, b)),
    allRows<AdminActivity & { id: string }>((a, b, c) => service.from("lead_activity").select("id, lead_id, actor_user_id, kind, data, created_at", c ? { count: "exact" } : undefined).order("id").range(a, b)),
    allRows<AdminSuppression & { id: string }>((a, b, c) => service.from("contact_suppressions").select("id, lead_id, reason, source, created_at, wrong_number_at, wrong_number_by", c ? { count: "exact" } : undefined).order("id").range(a, b)),
    service.from("payment_ledger").select("id, lead_id, kind, status, amount_gbp, occurred_at, sold_by_user_id, stripe_object_id, stripe_payment_intent_id").order("occurred_at").limit(10000),
    service.from("onboarding_responses").select("id, lead_id, status, created_at, plan_tier, website_addon, contact_email").order("created_at").limit(5000),
  ]);
  for (const r of [teamRes, rolesRes, exRes, ledgerRes, onboardingRes]) if (r.error) throw new Error(r.error.message ?? String(r.error));

  const roles = new Map(((rolesRes.data ?? []) as { user_id: string; role: string }[]).map((r) => [r.user_id, r.role]));
  const exclusions = buildExclusions((exRes.data ?? []) as ExclusionRow[]);
  const people: Person[] = ((teamRes.data ?? []) as { user_id: string; display_name: string | null; status: string | null }[])
    .map((m) => ({ userId: m.user_id, name: m.display_name || "Unnamed", role: roles.get(m.user_id) ?? null, excluded: exclusions.users.has(m.user_id) }));

  /* Commission from the ledger (the one path). A failure blanks commission, never zeroes it. */
  let commissionLines = null, commissionTotals = null;
  const commissionDueBySeller = new Map<string, number>(); const payoutsBySeller = new Map<string, number>();
  let commissionError: string | null = null;
  try {
    const e = await loadEarnings(service, null, londonDay(nowMs));
    commissionLines = e.lines; commissionTotals = e.totals;
    for (const s of e.bySeller) { commissionDueBySeller.set(s.sellerId, s.due); payoutsBySeller.set(s.sellerId, s.paidOut); }
  } catch (err) { commissionError = err instanceof Error ? err.message : String(err); console.error("[admin-overview] earnings", commissionError); }

  const [cPeriod, cToday, cYesterday, cWeek, cMonth] = await Promise.all([period, today, yesterday, week, month].map((p) => costRows(service, p)));

  /* Reply triage (release 2): the period's rows and the surface window's. A failed read blanks the
     reply part (the page says triage is unavailable) — never an empty list that reads as "all clear". */
  let triage: TriageRow[] | null = null;
  try {
    const floorMs = Math.min(period.fromMs ?? 0, nowMs - TRIAGE_SURFACE_DAYS * 86_400_000);
    triage = await allRows<TriageRow>((a, b, c) => {
      let q = service.from("conversation_triage").select("id, message_id, lead_id, message_at, category, bucket, reason, confidence, method, action_taken, resolved_at", c ? { count: "exact" } : undefined);
      if (floorMs > 0) q = q.gte("message_at", new Date(floorMs).toISOString());
      return q.order("id").range(a, b);
    });
    triage = triage.map((r) => ({ ...r, confidence: r.confidence == null ? null : Number(r.confidence) }));
  } catch (err) { console.error("[admin-overview] triage", err instanceof Error ? err.message : err); triage = null; }

  /* Release 4 — paying clients' weekly checks, improvement items and directory issues. A failed read
     leaves health off the rows (the panel says so), never a false "all fine". */
  let clientExtras: ClientExtras | null = null;
  try {
    const paidIds = leads.filter((l) => Number(l.amount_paid ?? 0) > 0).map((l) => l.id);
    if (paidIds.length) {
      const [s, r, o, d] = await Promise.all([
        service.from("weekly_check_sets").select("lead_id, questions, frozen_at, start_reason").in("lead_id", paidIds),
        service.from("weekly_check_runs").select("lead_id, week_start, status, summary, cost_usd, estimate_usd, reason").in("lead_id", paidIds).order("week_start", { ascending: false }).limit(500),
        service.from("client_opportunities").select("lead_id, status, implemented_at").in("lead_id", paidIds),
        service.from("lead_directory_presence").select("lead_id").in("lead_id", paidIds).eq("status", "needs_attention"),
      ]);
      for (const x of [s, r, o, d]) if (x.error) throw new Error(x.error.message);
      clientExtras = {
        sets: (s.data ?? []) as ClientExtras["sets"],
        runs: ((r.data ?? []) as ClientExtras["runs"]).map((x) => ({ ...x, week_start: String(x.week_start).slice(0, 10), cost_usd: x.cost_usd == null ? null : Number(x.cost_usd), estimate_usd: x.estimate_usd == null ? null : Number(x.estimate_usd) })),
        opportunities: (o.data ?? []) as ClientExtras["opportunities"],
        directoryIssues: (d.data ?? []) as ClientExtras["directoryIssues"],
      };
    } else clientExtras = { sets: [], runs: [], opportunities: [], directoryIssues: [] };
  } catch (err) { console.error("[admin-overview] client extras", err instanceof Error ? err.message : err); clientExtras = null; }

  /* Release 5 — feature uses in the period and the same length before it (SQL admin_feature_usage).
     Unreadable → null (the panel says so; never "nothing was used"). */
  let usage: { now: UsageRow[]; previous: UsageRow[] | null } | null = null;
  try {
    const call = async (p: ReportingPeriod) => {
      const { data, error } = await service.rpc("admin_feature_usage", { _from: p.fromMs === null ? null : new Date(p.fromMs).toISOString(), _to: new Date(p.toMs).toISOString() });
      if (error) throw new Error(error.message);
      return ((data ?? []) as UsageRow[]).map((r) => ({ ...r, uses: Number(r.uses) || 0 }));
    };
    const prev = previousPeriod(period, nowMs);
    const [now, before] = await Promise.all([call(period), prev ? call(prev) : Promise.resolve(null)]);
    usage = { now, previous: before };
  } catch (err) { console.error("[admin-overview] usage", err instanceof Error ? err.message : err); usage = null; }

  /* Release 5 — the Findable funnel (first-party site events + the server's own facts), summed in
     SQL admin_site_funnel. Unreadable → null (the panel says so). */
  let site: Record<string, unknown> | null = null;
  {
    const { data, error } = await service.rpc("admin_site_funnel", { _from: period.fromMs === null ? null : new Date(period.fromMs).toISOString(), _to: new Date(period.toMs).toISOString() });
    if (!error && data && typeof data === "object") site = data as Record<string, unknown>;
    else if (error) console.error("[admin-overview] site funnel", error.message);
  }

  /* Release 5 — Google Search Console per paying client (ported; docs §Search Console). The state is
     the one resolver (searchPerformance.ts); a figure appears only when the state is "populated", and
     "vs previous" only when stored data covers the previous window. Nothing is estimated. */
  const searchConfigured = !!(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON") ?? "").trim();
  let search: Record<string, unknown> | null = null;
  try {
    const paidIds = leads.filter((l) => Number(l.amount_paid ?? 0) > 0).map((l) => l.id);
    const { data: conns, error: sErr } = paidIds.length
      ? await service.from("client_search_connections").select("lead_id, gsc_property, status, last_synced_at, last_sync_error").in("lead_id", paidIds)
      : { data: [], error: null };
    if (sErr) throw new Error(sErr.message);
    const w = periodWindows(28, londonDay(nowMs));
    const out: Record<string, unknown> = {};
    for (const id of paidIds) {
      const c = ((conns ?? []) as { lead_id: string; gsc_property: string | null; status: string; last_synced_at: string | null; last_sync_error: string | null }[]).find((x) => x.lead_id === id) ?? null;
      if (!c || !w) { out[id] = { state: resolvePerformanceState(c, 0) }; continue; }
      const [cur, prev, cov] = await Promise.all([
        service.rpc("search_console_page_totals", { p_lead: id, p_from: w.current.from, p_to: w.current.to }),
        service.rpc("search_console_page_totals", { p_lead: id, p_from: w.previous.from, p_to: w.previous.to }),
        service.rpc("search_console_coverage", { p_lead: id }),
      ]);
      const curRows = (cur.data ?? []) as { page: string; clicks: number; impressions: number; position_impressions: number }[];
      const state = resolvePerformanceState(c, curRows.length);
      const covRow = ((cov.data ?? []) as { first_date: string | null }[])[0] ?? null;
      const prevCovered = !!covRow?.first_date && covRow.first_date <= w.previous.from;
      const total = finaliseTotals(sumTotals(curRows.map(totalsFromAggregate)));
      const prevTotal = prevCovered ? finaliseTotals(sumTotals(((prev.data ?? []) as { clicks: number; impressions: number; position_impressions: number }[]).map(totalsFromAggregate))) : null;
      out[id] = {
        state, property: c.gsc_property, lastSyncedAt: c.last_synced_at, lastError: c.last_sync_error, window: w.current,
        ...(state === "populated" ? {
          clicks: total.clicks, impressions: total.impressions, ctr: total.ctr, position: total.position,
          previous: prevTotal ? { clicks: prevTotal.clicks, impressions: prevTotal.impressions } : null,
          dataFrom: covRow?.first_date ?? null,
          topPages: curRows.sort((a, b) => Number(b.clicks) - Number(a.clicks) || Number(b.impressions) - Number(a.impressions)).slice(0, 5)
            .map((r) => ({ path: pagePath(r.page), clicks: Number(r.clicks) || 0, impressions: Number(r.impressions) || 0 })),
        } : {}),
      };
    }
    search = out;
  } catch (err) { console.error("[admin-overview] search console", err instanceof Error ? err.message : err); search = null; }

  /* Background jobs: last run, status, error (admin_job_runs). Unreadable → null, shown as unknown. */
  let jobs: { job: string; lastStartedAt: string | null; lastFinishedAt: string | null; lastStatus: string | null; lastError: string | null; runs: number }[] | null = null;
  {
    const { data, error } = await service.from("admin_job_runs").select("job, last_started_at, last_finished_at, last_status, last_error, runs");
    if (!error) jobs = ((data ?? []) as { job: string; last_started_at: string | null; last_finished_at: string | null; last_status: string | null; last_error: string | null; runs: number }[])
      .map((j) => ({ job: j.job, lastStartedAt: j.last_started_at, lastFinishedAt: j.last_finished_at, lastStatus: j.last_status, lastError: j.last_error, runs: j.runs }));
  }

  /* Release 6 — the latest AI business summary (fn business-summary). Unreadable → null. */
  let latestSummary: Record<string, unknown> | null = null;
  {
    const { data, error } = await service.from("admin_summaries").select("id, created_at, kind, period_label, period_from, period_to, summary, look_at, status, reason, model").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!error && data) latestSummary = data as Record<string, unknown>;
  }

  /* API cost accuracy (2026-09-30, src/lib/apiCostAccounting.ts): the period's recorded usage by OWNER,
     Google's free allowance by SKU for the last three London calendar months, and the Apify account's
     own figure for its billing cycle beside what we recorded. Unreadable → null (the panel says so);
     confirmed charges are never filled in without real billing data. */
  let costAccounting: CostAccounting | null = null;
  try {
    const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
    const [y, m] = londonDay(nowMs).split("-").map(Number);
    const firstMonth = `${new Date(Date.UTC(y, m - 3, 1)).toISOString().slice(0, 7)}`;
    const detail = async (from: string | null, to: string) => {
      const { data, error } = await service.rpc("admin_api_cost_detail", { _from: from, _to: to, _findable_start: FINDABLE_START_ISO });
      if (error) throw new Error(`admin_api_cost_detail: ${error.message}`);
      return ((data ?? []) as CostDetailRow[]).map((r) => ({ ...r, usd: Number(r.usd) || 0, calls: Number(r.calls) || 0 }));
    };
    const [inPeriod, recent, apifyRes] = await Promise.all([
      detail(iso(period.fromMs), new Date(period.toMs).toISOString()),
      detail(new Date(Date.UTC(y, m - 3, 1) - 86_400_000).toISOString(), new Date(nowMs).toISOString()),
      service.from("apify_account_usage").select("captured_at, monthly_usage_usd, max_monthly_usage_usd, cycle_start, cycle_end").order("captured_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    let apify: ApifyAccountCheck | null = null;
    const a = apifyRes.data as { captured_at: string; monthly_usage_usd: number | string | null; max_monthly_usage_usd: number | string | null; cycle_start: string | null; cycle_end: string | null } | null;
    if (!apifyRes.error && a?.cycle_start && a.monthly_usage_usd != null) {
      const ours = await detail(a.cycle_start, a.captured_at);
      const recorded = Math.round(ours.filter((r) => String(r.api_type ?? "").startsWith("apify")).reduce((s, r) => s + r.usd, 0) * 100) / 100;
      const account = Math.round(Number(a.monthly_usage_usd) * 100) / 100;
      apify = { cycleStart: a.cycle_start, cycleEnd: a.cycle_end ?? "", accountUsd: account, capUsd: a.max_monthly_usage_usd == null ? null : Number(a.max_monthly_usage_usd), recordedUsd: recorded, notInOurLogUsd: Math.max(0, Math.round((account - recorded) * 100) / 100), capturedAt: a.captured_at };
    }
    costAccounting = foldCostAccounting(inPeriod, recent.filter((r) => r.month >= firstMonth), exclusions.users, apify);
  } catch (err) { console.error("[admin-overview] cost accounting", err instanceof Error ? err.message : err); costAccounting = null; }

  const overview = foldAdminOverview({
    period, today, yesterday, week, month, nowMs,
    bookOwnerId: owner, people, exclusions,
    leads: leads.map((l) => ({ ...l, amount_paid: l.amount_paid == null ? null : Number(l.amount_paid) })),
    messages: [...outbound, ...inbound],
    activity, suppressions: sups,
    ledger: ((ledgerRes.data ?? []) as AdminLedgerRow[]).map((r) => ({ ...r, amount_gbp: Number(r.amount_gbp) })),
    onboarding: (onboardingRes.data ?? []) as AdminOnboarding[],
    commissionLines, commissionTotals, commissionDueBySeller, payoutsBySeller,
    cost: { period: cPeriod, today: cToday, yesterday: cYesterday, week: cWeek, month: cMonth },
    triage, clientExtras, usage,
  });

  return {
    ...overview,
    exclusionNote: exclusionNote(exclusions, new Map(people.map((x) => [x.userId, x.name]))),
    exclusions: exclusions.rows.map((r) => ({ kind: r.kind, reason: r.reason })),
    costNotes: { unrecorded: UNRECORDED_SPEND },
    costAccounting,
    commissionError: commissionError ? "Commission could not be read from the ledger just now." : null,
    jobs, site, search, searchConfigured, latestSummary,
    generatedAt: new Date(nowMs).toISOString(),
  };
}
