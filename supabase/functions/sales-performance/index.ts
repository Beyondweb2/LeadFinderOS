import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { refusalBody, resolveActor } from "../_shared/access.ts";
import {
  foldSalesPerformance, periodSinceMs,
  type PerfActivity, type PerfHit, type PerfLead, type PerfLinkEvent, type PerfMessage,
} from "../../../src/lib/salesPerformance.ts";

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

    const leads = await allRows<PerfLead & { id: string }>((a, b, c) => {
      let q = service.from("outreach_leads")
        .select("id, business_name, campaign_id, status, amount_paid, is_potential_work, lead_source", (c ? { count: "exact" } : undefined));
      if (personId) q = q.eq("assigned_to_user_id", personId);
      return q.order("id").range(a, b);
    });
    const ids = leads.map((l) => l.id);

    const [messages, activity, linkEvents, hits, campaigns] = await Promise.all([
      rowsForLeads<PerfMessage>(service, "whatsapp_messages", "id, lead_id, direction, template_name, status, created_at, body, sent_by_user_id", ids),
      rowsForLeads<PerfActivity>(service, "lead_activity", "id, lead_id, actor_user_id, kind, data, created_at", ids),
      rowsForLeads<PerfLinkEvent>(service, "onboarding_link_events", "id, lead_id, kind, channel, actor_user_id, created_at", ids),
      rowsForLeads<PerfHit>(service, "lead_page_hits", "id, lead_id, page, created_at", ids),
      allRows<{ id: string; name: string }>((a, b, c) => service.from("campaigns").select("id, name", (c ? { count: "exact" } : undefined)).order("id").range(a, b)),
    ]);

    const result = foldSalesPerformance({
      personId, sinceMs,
      leads: leads.map((l) => ({ ...l, amount_paid: l.amount_paid == null ? null : Number(l.amount_paid) })),
      messages, activity, linkEvents, hits,
      campaignNames: new Map(campaigns.map((c) => [c.id, c.name])),
    });

    // A salesperson learns only that a lead of theirs was won — never a figure. The fold already
    // returns no amount; this is the belt to that brace.
    return json({ ok: true, scope: { person: personId, self: personId === actor.id, role: actor.role }, ...result, ms: Date.now() - started });
  } catch (e) {
    console.error("[sales-performance]", e instanceof Error ? e.message : e);
    return json({ ok: false, error: "server_error", detail: "Could not load the numbers. Try again in a moment." }, 500);
  }
});
