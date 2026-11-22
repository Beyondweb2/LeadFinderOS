// campaign-performance — the Campaigns page's per-template table (Paul, 2026-11-22; docs/campaign-performance.md).
//
// POST { campaign_id } with the signed-in user's JWT → { ok, campaign, rows, best, min_sends, unattributed_opens, bot_hits }.
// The fold itself is src/lib/campaignPerformance.ts (pure, tested); this function only decides WHO may see WHAT and loads it.
//
// ⛔ ACCESS, THE SAME AS campaign_usable + _campaign_counts: the role comes from user_roles (resolveActor), never the request.
//    The admin: any campaign, all its leads. A salesperson: only a campaign they created, and only the leads assigned to them
//    in it. Anyone else, or another owner's campaign → not_found (the same answer as a campaign that does not exist).
// ⛔ Counts only. No message text, no phone number, no business name leaves this function.
// ⛔ QA fixture leads (metric_exclusions) and test-mode messages never count.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { refusalBody, resolveActor } from "../_shared/access.ts";
import { loadQaExclusions } from "../_shared/qa-guard.ts";
import { campaignPerformance, MIN_SENDS_TO_JUDGE, type PerfLeadInput } from "../../../src/lib/campaignPerformance.ts";
import type { AttributableMsg } from "../../../src/lib/templateAttribution.ts";
import { REPORT_VIEW_LOG_START } from "../../../src/lib/engagementBots.ts";

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

/** Every row of a query, paged by id (PostgREST stops at 1,000 silently). */
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

async function rowsForLeads<T>(service: Service, table: string, columns: string, ids: string[], extra?: (q: Service) => Service): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    out.push(...await allRows<T>((a, b) => {
      let q = service.from(table).select(columns).in("lead_id", chunk);
      if (extra) q = extra(q);
      return q.order("id").range(a, b);
    }));
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const who = await resolveActor(req, service);
    if (!who.ok) return json(refusalBody(who), who.status);
    const actor = who.actor;
    const body = await req.json().catch(() => ({}));
    const campaignId = typeof body?.campaign_id === "string" ? body.campaign_id.trim() : "";
    if (!UUID_RE.test(campaignId)) return json({ ok: false, error: "not_found" }, 200);

    const { data: camp, error: cErr } = await service.from("campaigns").select("id, name, created_by").eq("id", campaignId).maybeSingle();
    if (cErr) return json({ ok: false, error: "lookup_failed" }, 503);
    if (!camp) return json({ ok: false, error: "not_found" }, 200);
    /* POSITIVE MATCH: the admin, or the salesperson who owns it. Any other role never reaches here (resolveActor). */
    const usable = actor.role === "admin" || (actor.role === "sales" && camp.created_by === actor.id);
    if (!usable) return json({ ok: false, error: "not_found" }, 200);

    const leads = await allRows<{ id: string; is_potential_work: boolean | null; assigned_to_user_id: string | null }>((a, b) => {
      let q = service.from("outreach_leads").select("id, is_potential_work, assigned_to_user_id").eq("campaign_id", campaignId).or("is_archived.is.null,is_archived.eq.false");
      if (actor.role !== "admin") q = q.eq("assigned_to_user_id", actor.id);
      return q.order("id").range(a, b);
    });
    let qaLeads = new Set<string>();
    try { qaLeads = (await loadQaExclusions(service)).leads; } catch (e) { console.warn("[campaign-performance] QA exclusions unreadable:", (e as Error).message); }
    const kept = leads.filter((l) => !qaLeads.has(l.id));
    const ids = kept.map((l) => l.id);

    const [msgs, views, clicks, audits] = await Promise.all([
      rowsForLeads<AttributableMsg & { id: string; lead_id: string; test_mode: boolean | null }>(service, "whatsapp_messages", "id, lead_id, direction, template_name, status, created_at, body, test_mode", ids),
      rowsForLeads<{ id: string; lead_id: string; opened_at: string; bot_reason: string | null; js_at: string | null }>(service, "report_views", "id, lead_id, opened_at, bot_reason, js_at", ids),
      rowsForLeads<{ id: string; lead_id: string; clicked_at: string; bot_reason: string | null; code: string }>(service, "link_clicks", "id, lead_id, clicked_at, bot_reason, code", ids),
      /* Before the view log: each report's FIRST open only (its old user-agent filter), used for opens before the log began. */
      rowsForLeads<{ id: string; lead_id: string; first_opened_at: string | null; open_count: number | null }>(service, "ai_audits", "id, lead_id, first_opened_at, open_count", ids, (q) => q.not("first_opened_at", "is", null)),
    ]);
    const codes = [...new Set(clicks.map((c) => c.code))];
    const codeTemplate = new Map<string, string | null>();
    for (let i = 0; i < codes.length; i += CHUNK) {
      const { data, error } = await service.from("tracked_links").select("code, template_name").in("code", codes.slice(i, i + CHUNK));
      if (error) throw new Error(error.message);
      for (const r of (data ?? []) as Array<{ code: string; template_name: string | null }>) codeTemplate.set(r.code, r.template_name);
    }

    const byLead = new Map<string, PerfLeadInput>();
    for (const l of kept) byLead.set(l.id, { id: l.id, interested: l.is_potential_work === true, messages: [], views: [], clicks: [] });
    for (const m of msgs) if (m.test_mode !== true) byLead.get(m.lead_id)?.messages.push(m);
    for (const v of views) byLead.get(v.lead_id)?.views.push({ at: v.opened_at, bot_reason: v.bot_reason, js_at: v.js_at });
    for (const a of audits) {
      if ((a.open_count ?? 0) <= 0 || !a.first_opened_at || !(Date.parse(a.first_opened_at) < REPORT_VIEW_LOG_START)) continue;
      byLead.get(a.lead_id)?.views.push({ at: a.first_opened_at, bot_reason: null, js_at: null });
    }
    for (const c of clicks) byLead.get(c.lead_id)?.clicks.push({ at: c.clicked_at, bot_reason: c.bot_reason, template_name: codeTemplate.get(c.code) ?? null });

    const perf = campaignPerformance([...byLead.values()]);
    return json({
      ok: true,
      campaign: { id: camp.id, name: camp.name },
      leads: kept.length,
      min_sends: MIN_SENDS_TO_JUDGE,
      rows: perf.rows,
      best: perf.best,
      unattributed_opens: perf.unattributedOpens,
      bot_hits: perf.botHits,
    });
  } catch (e) {
    console.error("[campaign-performance] failed:", e instanceof Error ? e.message : e);
    return json({ ok: false, error: "server_error" }, 500);
  }
});
