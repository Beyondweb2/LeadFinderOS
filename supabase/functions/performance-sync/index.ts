/* ════════════════════════════════════════════════════════════════════════════════════════════
   PERFORMANCE SYNC — Google Search Console → Supabase snapshots (2026-09-22, Phase 1).

   Runs once a day from pg_cron. Pulls a ROLLING window of settled days for every connected client
   and upserts it onto the unique keys, so re-running is free and a day Google later revises is
   corrected rather than duplicated.

   ⛔ verify_jwt = false + x-cron-secret. The service-role-bearer branch in every function has been
      dead since the ~2026-08-11 key rotation; CRON_SECRET via x-cron-secret is the working internal
      caller and is what public.invoke_performance_sync() sends. The Authorization arm below is kept
      only because cron-run has it and pg_cron sends both headers — it is not the load-bearing one.

   ⛔ NOTHING HERE IS UNBOUNDED. A daily run does at most MAX_CLIENTS_PER_RUN clients × 2 API calls
      over a 5-day window; a backfill does ONE chunk of at most BACKFILL_CHUNK_DAYS and tells the
      caller how many chunks remain. An edge function that tries to walk 90 days × every client in
      one request dies at the wall clock having written half a dataset.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  BACKFILL_CHUNK_DAYS,
  BACKFILL_MAX_DAYS,
  SETTLED_LAG_DAYS,
  addDays,
  chunkWindow,
  foldDailyRows,
  syncWindow,
  toISODate,
  type DateWindow,
} from "../../../src/lib/searchPerformance.ts";
import {
  fetchPageDaily,
  fetchQueryDaily,
  getAccessToken,
  listProperties,
  parseServiceAccount,
} from "../_shared/google-search-console.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const log = (step: string, details?: unknown) =>
  console.log("[PERFORMANCE-SYNC] " + step + (details ? " — " + JSON.stringify(details) : ""));

/** One run touches at most this many clients. There are four paying clients today; the cap exists
 *  so growth turns into a second run, not a timeout that silently syncs the first few. */
const MAX_CLIENTS_PER_RUN = 10;
/** Rows per upsert. PostgREST is happy well past this; small batches keep one bad row's failure
 *  legible instead of losing a whole day. */
const UPSERT_BATCH = 500;

function isAuthorized(req: Request): boolean {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const headerSecret = req.headers.get("x-cron-secret");
  if (cronSecret && headerSecret === cronSecret) return true;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("authorization");
  if (serviceRoleKey && authHeader && authHeader.replace("Bearer ", "") === serviceRoleKey) return true;
  return false;
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** A folded row → the table row. The fold (and therefore the CTR/position maths, and the
 *  idempotency) lives in src/lib/searchPerformance.ts so it is unit-tested rather than trapped
 *  inside a Deno handler nothing can run locally. */
function toDbRows(folded: ReadonlyArray<Record<string, unknown>>, leadId: string, userId: string, syncedAt: string) {
  return folded.map((f) => ({ lead_id: leadId, user_id: userId, ...f, synced_at: syncedAt }));
}

async function upsertAll(
  service: ReturnType<typeof createClient>,
  table: string,
  rows: ReadonlyArray<Record<string, unknown>>,
  onConflict: string,
): Promise<number> {
  let written = 0;
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH);
    const { error } = await service.from(table).upsert(batch, { onConflict, ignoreDuplicates: false });
    // supabase-js errors are plain objects — String(e) is "[object Object]". Read .message.
    if (error) throw new Error(table + " upsert failed: " + (error.message ?? JSON.stringify(error)));
    written += batch.length;
  }
  return written;
}

/* ── One client, one window ──────────────────────────────────────────────────────────────── */

interface ConnectionRow {
  id: string;
  lead_id: string;
  user_id: string;
  gsc_property: string | null;
  status: string;
}

async function syncClient(
  service: ReturnType<typeof createClient>,
  token: string,
  conn: ConnectionRow,
  window: DateWindow,
): Promise<number> {
  const property = text(conn.gsc_property);
  if (!property) throw new Error("no gsc_property set on this client");

  const { data: lead } = await service
    .from("outreach_leads")
    .select("canonical_domain")
    .eq("id", conn.lead_id)
    .maybeSingle();
  const canonicalDomain = text((lead as { canonical_domain?: unknown } | null)?.canonical_domain) || null;

  const syncedAt = new Date().toISOString();
  const [pageRows, queryRows] = await Promise.all([
    fetchPageDaily(token, property, window.from, window.to),
    fetchQueryDaily(token, property, window.from, window.to),
  ]);

  const pages = toDbRows(foldDailyRows(pageRows, canonicalDomain, false), conn.lead_id, conn.user_id, syncedAt);
  const queries = toDbRows(foldDailyRows(queryRows, canonicalDomain, true), conn.lead_id, conn.user_id, syncedAt);

  const writtenPages = await upsertAll(service, "search_console_page_daily", pages, "lead_id,date,page");
  const writtenQueries = await upsertAll(service, "search_console_query_daily", queries, "lead_id,date,page,query");
  log("client synced", { lead: conn.lead_id, from: window.from, to: window.to, pages: writtenPages, queries: writtenQueries });
  return writtenPages + writtenQueries;
}

async function markResult(
  service: ReturnType<typeof createClient>,
  connId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  await service.from("client_search_connections").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", connId);
}

/* ── Handler ─────────────────────────────────────────────────────────────────────────────── */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  if (!isAuthorized(req)) {
    log("unauthorized");
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const mode = text(body.mode) || "daily";
    const todayISO = text(body.today) || toISODate(new Date());

    const service = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const account = parseServiceAccount(Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON"));

    /* A setup probe: prove the service account can actually see a property before anyone spends a
       morning debugging an empty dashboard. Reads nothing from our database. */
    if (mode === "properties") {
      const token = await getAccessToken(account);
      return json({ ok: true, properties: await listProperties(token) });
    }

    let connections: ConnectionRow[] = [];
    const leadId = text(body.lead_id);
    const q = service
      .from("client_search_connections")
      .select("id,lead_id,user_id,gsc_property,status")
      .not("gsc_property", "is", null);
    const { data, error } = leadId ? await q.eq("lead_id", leadId) : await q.limit(MAX_CLIENTS_PER_RUN);
    if (error) throw new Error("could not read connections: " + (error.message ?? JSON.stringify(error)));
    connections = (data ?? []) as ConnectionRow[];

    if (connections.length === 0) {
      return json({ ok: true, mode, clients: 0, note: leadId ? "no connection row with a property for that lead" : "no connected clients" });
    }

    /* ── Backfill: ONE bounded chunk, and the caller is told how many there are ──────────────
       Deliberately not a queue. A queue for a job that runs once per client, by hand, during
       setup is a second system to debug. */
    if (mode === "backfill") {
      if (!leadId) return json({ ok: false, error: "backfill_requires_lead_id" }, 400);
      const conn = connections[0];
      const days = Math.min(Math.max(Number(body.days) || BACKFILL_MAX_DAYS, 1), BACKFILL_MAX_DAYS);
      const to = addDays(todayISO, -SETTLED_LAG_DAYS);
      const from = to ? addDays(to, -(days - 1)) : null;
      if (!from || !to) return json({ ok: false, error: "bad_dates" }, 400);
      const chunks = chunkWindow({ from, to }, BACKFILL_CHUNK_DAYS);
      const index = Math.max(0, Math.floor(Number(body.chunk) || 0));
      if (index >= chunks.length) {
        return json({ ok: true, mode, done: true, chunks_total: chunks.length, note: "no chunk at that index" });
      }
      const token = await getAccessToken(account);
      try {
        const rows = await syncClient(service, token, conn, chunks[index]);
        await markResult(service, conn.id, {
          status: "connected",
          last_synced_at: new Date().toISOString(),
          last_sync_error: null,
          last_sync_row_count: rows,
        });
        return json({
          ok: true, mode, lead_id: conn.lead_id, chunk: index, chunks_total: chunks.length,
          window: chunks[index], rows, done: index + 1 >= chunks.length,
          next_chunk: index + 1 < chunks.length ? index + 1 : null,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        await markResult(service, conn.id, { status: "error", last_sync_error: message });
        return json({ ok: false, mode, lead_id: conn.lead_id, chunk: index, error: message }, 502);
      }
    }

    /* ── Daily: the rolling settled window for every connected client ──────────────────────── */
    const window = syncWindow(todayISO);
    if (!window) return json({ ok: false, error: "bad_today" }, 400);

    const token = await getAccessToken(account);
    const results: Array<Record<string, unknown>> = [];
    for (const conn of connections) {
      try {
        const rows = await syncClient(service, token, conn, window);
        await markResult(service, conn.id, {
          status: "connected",
          last_synced_at: new Date().toISOString(),
          last_sync_error: null,
          last_sync_row_count: rows,
        });
        results.push({ lead_id: conn.lead_id, ok: true, rows });
      } catch (e) {
        // One client's broken property must not stop the others. The real message is STORED, not
        // just console.error'd — the CLI has no `functions logs`, so an error only in the log is
        // an error nobody can read (CLAUDE.md §4).
        const message = e instanceof Error ? e.message : String(e);
        log("client failed", { lead: conn.lead_id, error: message });
        await markResult(service, conn.id, { status: "error", last_sync_error: message });
        results.push({ lead_id: conn.lead_id, ok: false, error: message });
      }
    }

    return json({ ok: true, mode, window, clients: results.length, results });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log("fatal", { error: message });
    return json({ ok: false, error: message }, 500);
  }
});
