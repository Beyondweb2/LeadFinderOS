import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { bookOwnerId, refusalBody, requireAdmin } from "../_shared/access.ts";
import { loadEarnings } from "../_shared/earnings.ts";
import {
  foldAdminOverview,
  type AdminActivity, type AdminLead, type AdminLedgerRow, type AdminMessage, type AdminOnboarding, type AdminSuppression, type CostRow, type Person, type TriageRow,
} from "../../../src/lib/adminMetrics.ts";
import { TRIAGE_SURFACE_DAYS } from "../../../src/lib/replyTriage.ts";
import { buildExclusions, exclusionNote, type ExclusionRow } from "../../../src/lib/metricExclusions.ts";
import { londonDay, resolvePeriod, type ReportingPeriod } from "../../../src/lib/reportingPeriod.ts";
import { UNRECORDED_SPEND, USD_TO_GBP_ESTIMATE } from "../../../src/lib/apiCostLabels.ts";

// admin-overview — the Admin control centre's numbers (2026-09-30, docs/admin-control-centre.md).
//
// ⛔ ADMIN ONLY (requireAdmin: a salesperson is refused and the refusal is counted). It runs on the
// service role, reads the book, folds it with src/lib/adminMetrics.ts and returns TOTALS — never a
// message body, never a phone number, never a Stripe id. Reads only; it writes nothing and spends
// nothing (no model, no paid API).
// The period is resolved by src/lib/reportingPeriod.ts — the one London-day clock.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const PAGE = 1000;
const WAVE = 4;
/** Marker only the new code produces — the deploy check reads it from the response. */
const BUILD_ID = "admin-overview-2026-09-30d";

// deno-lint-ignore no-explicit-any
type Service = any;

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

const LEAD_COLUMNS = "id, business_name, created_at, added_by_user_id, assigned_to_user_id, sold_by_user_id, sold_at, status, amount_paid, is_potential_work, call_booked_at, whatsapp_sent_at, next_action, next_action_date, is_archived, phone, email, search_keyword, category, payment_date, refunded_at, service_terminated_at, subscription_status, contract_total_payments, baseline_audit_id, remeasure_due_date, remeasure_audit_id, website";

async function costRows(service: Service, p: ReportingPeriod): Promise<CostRow[]> {
  const { data, error } = await service.rpc("admin_api_cost", { _from: p.fromMs === null ? null : new Date(p.fromMs).toISOString(), _to: new Date(p.toMs).toISOString() });
  if (error) throw new Error(`admin_api_cost: ${error.message ?? String(error)}`);
  return ((data ?? []) as CostRow[]).map((r) => ({ ...r, usd: Number(r.usd) || 0, calls: Number(r.calls) || 0 }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { ...corsHeaders, "x-build": BUILD_ID } });
  const started = Date.now();
  try {
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const who = await requireAdmin(req, service);
    if (!who.ok) return json(refusalBody(who), who.status);
    const body = await req.json().catch(() => ({}));
    const nowMs = Date.now();
    const period = resolvePeriod(body.period ?? "30d", nowMs, { from: body.from, to: body.to });
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
      service.from("payment_ledger").select("id, lead_id, kind, status, amount_gbp, occurred_at, sold_by_user_id").order("occurred_at").limit(10000),
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

    /* Background jobs: last run, status, error (admin_job_runs). Unreadable → null, shown as unknown. */
    let jobs: { job: string; lastStartedAt: string | null; lastFinishedAt: string | null; lastStatus: string | null; lastError: string | null; runs: number }[] | null = null;
    {
      const { data, error } = await service.from("admin_job_runs").select("job, last_started_at, last_finished_at, last_status, last_error, runs");
      if (!error) jobs = ((data ?? []) as { job: string; last_started_at: string | null; last_finished_at: string | null; last_status: string | null; last_error: string | null; runs: number }[])
        .map((j) => ({ job: j.job, lastStartedAt: j.last_started_at, lastFinishedAt: j.last_finished_at, lastStatus: j.last_status, lastError: j.last_error, runs: j.runs }));
    }

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
      triage,
    });

    return json({
      ok: true, build: BUILD_ID, ...overview,
      exclusionNote: exclusionNote(exclusions, new Map(people.map((x) => [x.userId, x.name]))),
      exclusions: exclusions.rows.map((r) => ({ kind: r.kind, reason: r.reason })),
      costNotes: { unrecorded: UNRECORDED_SPEND, usdToGbp: USD_TO_GBP_ESTIMATE },
      commissionError: commissionError ? "Commission could not be read from the ledger just now." : null,
      jobs,
      generatedAt: new Date(nowMs).toISOString(), ms: Date.now() - started,
    });
  } catch (e) {
    console.error("[admin-overview]", e instanceof Error ? e.message : e);
    return json({ ok: false, error: "server_error", detail: "Could not load the dashboard numbers. Try again in a moment." }, 500);
  }
});
