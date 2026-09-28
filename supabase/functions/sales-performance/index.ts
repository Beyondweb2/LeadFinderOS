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

/** Every row of a query, paged by id — PostgREST stops at 1,000 silently (CLAUDE.md §4). */
// deno-lint-ignore no-explicit-any
async function allRows<T>(build: (from: number, to: number) => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message ?? String(error));
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

/** Rows keyed to a set of leads: in chunks when the set is small, the whole table filtered in memory
 *  when it is large (the admin's "Everyone") — one path would either flood `.in()` or over-read. */
async function rowsForLeads<T extends { lead_id: string }>(
  service: Service, table: string, columns: string, leadIds: string[],
): Promise<T[]> {
  if (leadIds.length === 0) return [];
  if (leadIds.length > 600) {
    const set = new Set(leadIds);
    const rows = await allRows<T>((a, b) => service.from(table).select(columns).not("lead_id", "is", null).order("id").range(a, b));
    return rows.filter((r) => set.has(r.lead_id));
  }
  const out: T[] = [];
  for (let i = 0; i < leadIds.length; i += CHUNK) {
    const ids = leadIds.slice(i, i + CHUNK);
    out.push(...await allRows<T>((a, b) => service.from(table).select(columns).in("lead_id", ids).order("id").range(a, b)));
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

    const leads = await allRows<PerfLead & { id: string }>((a, b) => {
      let q = service.from("outreach_leads")
        .select("id, business_name, campaign_id, status, amount_paid, is_potential_work, lead_source");
      if (personId) q = q.eq("assigned_to_user_id", personId);
      return q.order("id").range(a, b);
    });
    const ids = leads.map((l) => l.id);

    const [messages, activity, linkEvents, hits, campaigns] = await Promise.all([
      rowsForLeads<PerfMessage>(service, "whatsapp_messages", "id, lead_id, direction, template_name, status, created_at, body, sent_by_user_id", ids),
      rowsForLeads<PerfActivity>(service, "lead_activity", "id, lead_id, actor_user_id, kind, data, created_at", ids),
      rowsForLeads<PerfLinkEvent>(service, "onboarding_link_events", "id, lead_id, kind, channel, actor_user_id, created_at", ids),
      rowsForLeads<PerfHit>(service, "lead_page_hits", "id, lead_id, page, created_at", ids),
      allRows<{ id: string; name: string }>((a, b) => service.from("campaigns").select("id, name").order("id").range(a, b)),
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
