import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isInternalCall, refusalBody, requireAdmin } from "../_shared/access.ts";
import {
  BACKFILL_CHUNK_DAYS, BACKFILL_MAX_DAYS, SETTLED_LAG_DAYS, addDays, chunkWindow, foldDailyRows, syncWindow, toISODate, type DateWindow,
} from "../../../src/lib/searchPerformance.ts";
import { fetchPageDaily, fetchQueryDaily, getAccessToken, listProperties, parseServiceAccount } from "../_shared/google-search-console.ts";
import { isPaidLead } from "../../../src/lib/leadPayment.ts";

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PERFORMANCE SYNC — Google Search Console → Supabase daily snapshots (ported 2026-09-30 from the
   parked 2026-09-22 branch after an audit; docs/admin-control-centre.md §Search Console).
   Modes: "daily" (cron, 05:00 UTC — the rolling settled window for every connected paying client),
   "backfill" (admin, ONE bounded chunk for one lead), "properties" (admin — what the service
   account can see; setup probe).
   FIXED vs the branch: the caller is the cron (isInternalCall + x-internal-job, constant-time) or the
   admin (requireAdmin) — never the dead service-role bearer; one daily run at a time (admin_job_runs
   lease); EVERY connected client, ordered, not an arbitrary first 10; refunded / ended / archived
   clients are skipped; the reporting domain is read from the connection row (else website_build).
   ⛔ No Google credential (GOOGLE_SERVICE_ACCOUNT_JSON unset) → the run records "not configured" and
   touches nothing. Search Console reads are free; nothing here spends.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret, x-internal-job",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const BUILD_ID = "performance-sync-2026-09-30a";
const FN = "performance-sync";
const UPSERT_BATCH = 500;
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// deno-lint-ignore no-explicit-any
type Service = any;
interface ConnectionRow { id: string; lead_id: string; user_id: string; gsc_property: string | null; canonical_domain: string | null }

async function upsertAll(service: Service, table: string, rows: Record<string, unknown>[], onConflict: string): Promise<number> {
  let written = 0;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH);
    const { error } = await service.from(table).upsert(batch, { onConflict, ignoreDuplicates: false });
    if (error) throw new Error(`${table} upsert failed: ${error.message ?? JSON.stringify(error)}`);
    written += batch.length;
  }
  return written;
}

async function domainFor(service: Service, conn: ConnectionRow): Promise<string | null> {
  if (text(conn.canonical_domain)) return text(conn.canonical_domain);
  const { data } = await service.from("outreach_leads").select("website_build").eq("id", conn.lead_id).maybeSingle();
  return text((data as { website_build?: { canonical_domain?: unknown } | null } | null)?.website_build?.canonical_domain) || null;
}

async function syncClient(service: Service, token: string, conn: ConnectionRow, window: DateWindow): Promise<number> {
  const property = text(conn.gsc_property);
  if (!property) throw new Error("no gsc_property set on this client");
  const domain = await domainFor(service, conn);
  const syncedAt = new Date().toISOString();
  const [pageRows, queryRows] = await Promise.all([fetchPageDaily(token, property, window.from, window.to), fetchQueryDaily(token, property, window.from, window.to)]);
  const tag = (rows: readonly object[]): Record<string, unknown>[] => rows.map((f) => ({ lead_id: conn.lead_id, user_id: conn.user_id, ...f, synced_at: syncedAt }));
  const pages = await upsertAll(service, "search_console_page_daily", tag(foldDailyRows(pageRows, domain, false)), "lead_id,date,page");
  const queries = await upsertAll(service, "search_console_query_daily", tag(foldDailyRows(queryRows, domain, true)), "lead_id,date,page,query");
  return pages + queries;
}

const mark = (service: Service, id: string, patch: Record<string, unknown>) =>
  service.from("client_search_connections").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);

async function connections(service: Service, leadId: string | null): Promise<ConnectionRow[]> {
  let q = service.from("client_search_connections").select("id, lead_id, user_id, gsc_property, canonical_domain").not("gsc_property", "is", null).order("lead_id");
  if (leadId) q = q.eq("lead_id", leadId);
  const { data, error } = await q;
  if (error) throw new Error(`connections: ${error.message}`);
  const rows = (data ?? []) as ConnectionRow[];
  if (!rows.length) return [];
  // Paying clients only: refunded / ended / archived clients are not synced.
  const { data: leads, error: lErr } = await service.from("outreach_leads").select("id, amount_paid, status, is_archived, service_terminated_at").in("id", rows.map((r) => r.lead_id));
  if (lErr) throw new Error(`leads: ${lErr.message}`);
  const live = new Set(((leads ?? []) as { id: string; amount_paid: number | null; status: string | null; is_archived: boolean | null; service_terminated_at: string | null }[])
    .filter((l) => isPaidLead(l) && !l.is_archived && !l.service_terminated_at).map((l) => l.id));
  return rows.filter((r) => live.has(r.lead_id));
}

async function daily(service: Service, todayISO: string): Promise<Record<string, unknown>> {
  const conns = await connections(service, null);
  if (!conns.length) return { status: "ok", clients: 0, note: "no connected clients" };
  let account;
  try { account = parseServiceAccount(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON")); }
  catch (e) { return { status: "not_configured", clients: conns.length, note: e instanceof Error ? e.message : String(e) }; }
  const window = syncWindow(todayISO);
  if (!window) throw new Error("bad_today");
  const token = await getAccessToken(account);
  const results: Record<string, unknown>[] = [];
  for (const c of conns) {
    try {
      const rows = await syncClient(service, token, c, window);
      await mark(service, c.id, { status: "connected", last_synced_at: new Date().toISOString(), last_sync_error: null, last_sync_row_count: rows });
      results.push({ lead_id: c.lead_id, ok: true, rows });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await mark(service, c.id, { status: "error", last_sync_error: message.slice(0, 500) });
      results.push({ lead_id: c.lead_id, ok: false, error: message.slice(0, 200) });
    }
  }
  return { status: "ok", window, clients: results.length, results };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { ...corsHeaders, "x-build": BUILD_ID } });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  try {
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const internal = isInternalCall(req) && req.headers.get("x-internal-job") === "1";
    if (!internal) {
      const who = await requireAdmin(req, service);
      if (!who.ok) return json(refusalBody(who), who.status);
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const mode = text(body.mode) || "daily";
    const todayISO = text(body.today) || toISODate(new Date());

    if (mode === "properties") {
      if (internal) return json({ ok: false, error: "admin_only" }, 403);
      let account;
      try { account = parseServiceAccount(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON")); }
      catch (e) { return json({ ok: false, error: "not_configured", detail: e instanceof Error ? e.message : String(e) }); }
      return json({ ok: true, properties: await listProperties(await getAccessToken(account)) });
    }

    if (mode === "backfill") {
      if (internal) return json({ ok: false, error: "admin_only" }, 403);
      const leadId = text(body.lead_id);
      if (!leadId) return json({ ok: false, error: "backfill_requires_lead_id" }, 400);
      const [conn] = await connections(service, leadId);
      if (!conn) return json({ ok: false, error: "no_connection", detail: "No connected paying client with a Search Console property for that lead." }, 404);
      let account;
      try { account = parseServiceAccount(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON")); }
      catch (e) { return json({ ok: false, error: "not_configured", detail: e instanceof Error ? e.message : String(e) }); }
      const days = Math.min(Math.max(Number(body.days) || BACKFILL_MAX_DAYS, 1), BACKFILL_MAX_DAYS);
      const to = addDays(todayISO, -SETTLED_LAG_DAYS);
      const from = to ? addDays(to, -(days - 1)) : null;
      if (!from || !to) return json({ ok: false, error: "bad_dates" }, 400);
      const chunks = chunkWindow({ from, to }, BACKFILL_CHUNK_DAYS);
      const index = Math.max(0, Math.floor(Number(body.chunk) || 0));
      if (index >= chunks.length) return json({ ok: true, done: true, chunks_total: chunks.length });
      try {
        const rows = await syncClient(service, await getAccessToken(account), conn, chunks[index]);
        await mark(service, conn.id, { status: "connected", last_synced_at: new Date().toISOString(), last_sync_error: null, last_sync_row_count: rows });
        return json({ ok: true, chunk: index, chunks_total: chunks.length, window: chunks[index], rows, next_chunk: index + 1 < chunks.length ? index + 1 : null });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await mark(service, conn.id, { status: "error", last_sync_error: message.slice(0, 500) });
        return json({ ok: false, error: "sync_failed", detail: message.slice(0, 300) }, 502);
      }
    }

    // daily — one run at a time.
    const { data: claimed, error: cErr } = await service.rpc("admin_job_claim", { _job: FN, _lease_seconds: 600 });
    if (cErr) throw new Error(`lease: ${cErr.message}`);
    if (claimed !== true) return json({ ok: true, build: BUILD_ID, skipped: "another run is in progress" });
    try {
      const result = await daily(service, todayISO);
      await service.rpc("admin_job_finish", { _job: FN, _status: String(result.status ?? "ok"), _result: result, _error: null });
      return json({ ok: true, build: BUILD_ID, ...result });
    } catch (e) {
      await service.rpc("admin_job_finish", { _job: FN, _status: "error", _result: null, _error: (e instanceof Error ? e.message : String(e)).slice(0, 500) });
      throw e;
    }
  } catch (e) {
    console.error("[performance-sync]", e instanceof Error ? e.message : e);
    return json({ ok: false, error: "server_error" }, 500);
  }
});
