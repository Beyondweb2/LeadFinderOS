import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { refusalBody, resolveActor } from "../_shared/access.ts";
import {
  foldSalesPerformanceWithFacts, periodSinceMs, ASSIGNED_CAMPAIGN_KEY, ASSIGNED_CAMPAIGN_LABEL,
  type PerfActivity, type PerfHit, type PerfLead, type PerfLinkEvent, type PerfMessage,
} from "../../../src/lib/salesPerformance.ts";
import { foldSalesWorkspace, parseTargets, AUDIT_READY_DAYS, FEED_DAYS, type WorkspaceLead } from "../../../src/lib/salesWorkspace.ts";
import { loadEarnings } from "../_shared/earnings.ts";
import { londonDayOf } from "../../../src/lib/commission.ts";
import { quickCloseState } from "../../../src/lib/quickClose.ts";
import { isExcludedUser } from "../../../src/lib/metricExclusions.ts";
import { loadQaExclusions } from "../_shared/qa-guard.ts";

// sales-performance — the Sales Dashboard's numbers (2026-09-28, docs/sales-readiness.md).
//
// ⛔ WHO SEES WHAT IS DECIDED HERE, SERVER-SIDE. A salesperson always gets THEIR OWN leads — the
// `person` in the request is ignored for them, so no body can widen it. The admin may ask for one
// person or for everyone. The role comes from user_roles (resolveActor), never from the request.
// ⛔ ONLY COUNTS LEAVE THIS FUNCTION, plus the rep's own won business names. No amount, no Stripe id,
// no message text, no other person's lead. It runs on the service role because the sales_leads view
// hides a lead the moment it becomes a client, and a salesperson must still see that they won it.
// Reads only; it never writes anything.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 1000;
const CHUNK = 150;

// deno-lint-ignore no-explicit-any
type Service = any;

/** Every row of a query, paged by id — PostgREST stops at 1,000 silently (CLAUDE.md §4).
 *  The first page carries the exact count; the rest are fetched together, a few at a time (the API
 *  has ~10 connections for everyone — never all at once). Measured 2026-09-28: the whole book one
 *  page after another took ~10 s. */
const WAVE = 4;
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
  // Deduped by id: a row inserted between the count and a later page must not appear twice.
  const seen = new Set<string>();
  return out.filter((r) => { const id = (r as { id?: string }).id; if (!id) return true; if (seen.has(id)) return false; seen.add(id); return true; });
}

/** Rows keyed to a set of leads: in chunks when the set is small, the whole table filtered in memory
 *  when it is large (the admin's "Everyone") — one path would either flood `.in()` or over-read. */
async function rowsForLeads<T extends { lead_id: string }>(
  service: Service, table: string, columns: string, leadIds: string[],
): Promise<T[]> {
  if (leadIds.length === 0) return [];
  if (leadIds.length > 600) {
    const set = new Set(leadIds);
    const rows = await allRows<T>((a, b, c) => service.from(table).select(columns, (c ? { count: "exact" } : undefined)).not("lead_id", "is", null).order("id").range(a, b));
    return rows.filter((r) => set.has(r.lead_id));
  }
  const out: T[] = [];
  const chunks: string[][] = [];
  for (let i = 0; i < leadIds.length; i += CHUNK) chunks.push(leadIds.slice(i, i + CHUNK));
  for (const ids of chunks) {
    out.push(...await allRows<T>((a, b, c) => service.from(table).select(columns, (c ? { count: "exact" } : undefined)).in("lead_id", ids).order("id").range(a, b)));
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const started = Date.now();
  try {
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const who = await resolveActor(req, service);
    if (!who.ok) return json(refusalBody(who), who.status);
    const actor = who.actor;
    const body = await req.json().catch(() => ({}));

    // Scope: a salesperson is always themselves. The admin picks a person or everyone (null).
    let personId: string | null;
    if (actor.role === "sales") personId = actor.id;
    else if (body.person === "me") personId = actor.id;
    else if (typeof body.person === "string" && UUID_RE.test(body.person)) personId = body.person;
    else personId = null;

    const sinceMs = periodSinceMs(typeof body.period === "string" ? body.period : "all");

    const fetchedLeads = await allRows<PerfLead & { id: string }>((a, b, c) => {
      let q = service.from("outreach_leads")
        .select("id, business_name, campaign_id, status, amount_paid, is_potential_work, lead_source, sold_by_user_id, sold_at, assigned_to_user_id, next_action, next_action_date, next_action_time, next_action_note, call_booked_at, is_archived", (c ? { count: "exact" } : undefined));
      /* The person's leads, plus any client they SOLD that has since been reassigned (the win stays theirs). */
      if (personId) q = q.or(`assigned_to_user_id.eq.${personId},sold_by_user_id.eq.${personId}`);
      return q.order("id").range(a, b);
    });
    /* ⛔ THE TEAM VIEW EXCLUDES TEST ACTIVITY (2026-10-04, pre-sales certification; Paul's 2026-09-30
       rule that test accounts never count). When the admin looks at EVERYONE, a lead that is a QA fixture,
       or that a test account holds or sold, is left out. A person's OWN view is untouched — the Test
       salesperson must see their numbers move, that is what the certification checks. If the exclusion
       list cannot be read the team view is shown unfiltered rather than failing (it is a display). */
    let leads = fetchedLeads;
    if (personId === null) {
      try {
        const qaEx = await loadQaExclusions(service);
        leads = fetchedLeads.filter((l) => !qaEx.leads.has(l.id) && !isExcludedUser(qaEx, l.assigned_to_user_id) && !isExcludedUser(qaEx, l.sold_by_user_id));
      } catch (e) { console.error("[sales-performance] exclusions read failed (team view unfiltered):", (e as Error).message); }
    }
    const ids = leads.map((l) => l.id);

    const [messages, activity, linkEvents, hits, campaigns] = await Promise.all([
      rowsForLeads<PerfMessage>(service, "whatsapp_messages", "id, lead_id, direction, template_name, status, created_at, body, sent_by_user_id", ids),
      rowsForLeads<PerfActivity>(service, "lead_activity", "id, lead_id, actor_user_id, kind, data, created_at", ids),
      rowsForLeads<PerfLinkEvent>(service, "onboarding_link_events", "id, lead_id, kind, channel, actor_user_id, created_at", ids),
      rowsForLeads<PerfHit>(service, "lead_page_hits", "id, lead_id, page, created_at", ids),
      allRows<{ id: string; name: string; created_by: string }>((a, b, c) => service.from("campaigns").select("id, name, created_by", (c ? { count: "exact" } : undefined)).order("id").range(a, b)),
    ]);

    /* The workspace's extra read, small: hook audits finished in the feed window (for "audit ready"
       and the feed). ⛔ Targets are PRIVATE to their owner: the browser sends its own, and they are
       used only when the person is looking at their own numbers — never read here for anyone else. */
    const idSet = new Set(ids);
    const auditFloor = new Date(Date.now() - Math.max(FEED_DAYS, AUDIT_READY_DAYS) * 86_400_000).toISOString();
    const recentAudits = await allRows<{ id: string; lead_id: string | null; audit_purpose: string | null; is_measurement: boolean | null }>((a, b, c) =>
      service.from("ai_audits").select("id, lead_id, audit_purpose, is_measurement", (c ? { count: "exact" } : undefined))
        .gte("created_at", auditFloor).not("lead_id", "is", null).order("id").range(a, b));
    const hookAudits = recentAudits.filter((a) => a.lead_id && idSet.has(a.lead_id) && (a.audit_purpose ?? "audit") === "audit" && a.is_measurement !== true);
    const auditLead = new Map(hookAudits.map((a) => [a.id, a.lead_id as string]));
    const runs: { id: string; audit_id: string; status: string; created_at: string }[] = [];
    const auditIds = [...auditLead.keys()];
    for (let i = 0; i < auditIds.length; i += CHUNK) {
      runs.push(...await allRows<{ id: string; audit_id: string; status: string; created_at: string }>((a, b, c) =>
        service.from("ai_audit_runs").select("id, audit_id, status, created_at", (c ? { count: "exact" } : undefined))
          .in("audit_id", auditIds.slice(i, i + CHUNK)).eq("status", "complete").order("id").range(a, b)));
    }

    const { result, facts } = foldSalesPerformanceWithFacts({
      personId, sinceMs,
      /* ⛔ A salesperson sees only THEIR campaigns' names (campaigns are private, 2026-10-03): their leads in a campaign
         they do not own are grouped as "Leads assigned to you". The admin sees every name. */
      leads: leads.map((l) => ({ ...l, amount_paid: l.amount_paid == null ? null : Number(l.amount_paid),
        campaign_id: actor.role === "sales" && l.campaign_id && !campaigns.some((c) => c.id === l.campaign_id && c.created_by === actor.id) ? ASSIGNED_CAMPAIGN_KEY : l.campaign_id })),
      messages, activity, linkEvents, hits,
      campaignNames: new Map([...campaigns.filter((c) => actor.role !== "sales" || c.created_by === actor.id).map((c) => [c.id, c.name] as [string, string]), [ASSIGNED_CAMPAIGN_KEY, ASSIGNED_CAMPAIGN_LABEL]]),
    });
    /* Commission from the payment ledger (the ONE path, _shared/earnings.ts). A failure leaves the
       commission parts blank, never zero: the rest of the dashboard still loads. */
    let commission: { at: string; amount: number; leadId: string; label: string; business: string }[] | null = null;
    try {
      const e = await loadEarnings(service, personId, londonDayOf(new Date().toISOString()));
      const names = new Map(e.clients.map((c) => [c.leadId, c.business]));
      if (e.commissionable) commission = e.lines.filter((l) => l.status !== "not_commissionable").map((l) => ({ at: l.occurredAt, amount: l.commission, leadId: l.leadId, label: l.label, business: names.get(l.leadId) ?? "Client" }));
    } catch (err) { console.error("[sales-performance] earnings", err instanceof Error ? err.message : err); }
    /* ⛔ is_archived rides on each lead (fix workstream 5, 2026-10-04): the workspace fold keeps an archived lead's
       HISTORY (counts, feed) and never makes it work (actions, follow-ups, meetings) — salesWorkspace.ts isActiveWork. */
    /* Quick Close states (small: only rows that have one), for "finish it" / "chase the link". */
    const quickClose = new Map<string, { state: ReturnType<typeof quickCloseState>; linkAt: string | null }>();
    try {
      const { data: qrows } = await service.from("onboarding_responses").select("lead_id, status, quick_close").not("quick_close", "is", null).not("lead_id", "is", null).limit(2000);
      for (const r of (qrows ?? []) as { lead_id: string; status: string | null; quick_close: { link_generated_at?: string | null } | null }[]) {
        if (!idSet.has(r.lead_id)) continue;
        const s = quickCloseState(r.status, r.quick_close as never);
        const prev = quickClose.get(r.lead_id);
        if (!prev || s === "paid") quickClose.set(r.lead_id, { state: s, linkAt: r.quick_close?.link_generated_at ?? null });
      }
    } catch (err) { console.error("[sales-performance] quick close", err instanceof Error ? err.message : err); }
    const workspace = foldSalesWorkspace({
      personId, facts, activity, nowMs: Date.now(),
      leads: new Map((leads as unknown as WorkspaceLead[]).map((l) => [l.id, l])),
      audits: runs.map((r) => ({ lead_id: auditLead.get(r.audit_id)!, completed_at: r.created_at })),
      targets: personId === actor.id ? parseTargets(body.targets) : null,
      commission,
      quickClose,
    });

    // A salesperson learns only that a lead of theirs was won — never a figure. The fold already
    // returns no amount; this is the belt to that brace.
    return json({ ok: true, scope: { person: personId, self: personId === actor.id, role: actor.role }, ...result, workspace, ms: Date.now() - started });
  } catch (e) {
    console.error("[sales-performance]", e instanceof Error ? e.message : e);
    return json({ ok: false, error: "server_error", detail: "Could not load the numbers. Try again in a moment." }, 500);
  }
});
