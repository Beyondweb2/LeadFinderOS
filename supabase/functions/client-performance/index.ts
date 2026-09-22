/* ════════════════════════════════════════════════════════════════════════════════════════════
   CLIENT PERFORMANCE — the read API for the Performance section (2026-09-22, Phase 1).

   One POST, one screen's worth of data. Operator JWT in, aggregated totals out — the exact shape
   paid-client-hub uses: verify the caller's own token with the anon client, then read with the
   service role, scoped to rows whose user_id is that caller's.

   ⛔ IT NEVER RETURNS RAW DAILY ROWS. 90 days × a real site is tens of thousands of rows for query
      data alone, past PostgREST's silent 1,000-row truncation and past anything the browser should
      be folding. Postgres groups and SUMS (three additive integers, never a rate); this function
      turns those sums into rates in exactly one place — finaliseTotals in
      src/lib/searchPerformance.ts, the same module the SPA and the tests import.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  PERFORMANCE_PERIODS,
  QUERY_ROW_LIMIT,
  buildPageRows,
  finaliseTotals,
  indexTrackedPages,
  isPerformancePeriod,
  normaliseUrl,
  pageLabel,
  periodWindows,
  resolvePerformanceState,
  sumTotals,
  toISODate,
  totalsFromAggregate,
  type PerformancePeriod,
  type Totals,
  type TrackedPage,
} from "../../../src/lib/searchPerformance.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

async function operator(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: auth } },
  });
  const { data } = await client.auth.getUser();
  return data.user ?? null;
}

interface AggregateRow { page?: unknown; query?: unknown; clicks?: unknown; impressions?: unknown; position_impressions?: unknown }

/** RPC rows → a URL-keyed map of the additive triple, with every URL put through the SAME
 *  normaliser the sync used. Two stored pages that normalise together are summed, not lost. */
function totalsByUrl(rows: readonly AggregateRow[], canonicalDomain: string | null): Map<string, Totals> {
  const map = new Map<string, Totals>();
  for (const row of rows) {
    const raw = text(row.page);
    if (!raw) continue;
    const url = normaliseUrl(raw, canonicalDomain) ?? raw;
    const add = totalsFromAggregate(row);
    const prev = map.get(url);
    map.set(url, prev
      ? { clicks: prev.clicks + add.clicks, impressions: prev.impressions + add.impressions, positionImpressions: prev.positionImpressions + add.positionImpressions }
      : add);
  }
  return map;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const user = await operator(req);
    if (!user) return json({ ok: false, error: "unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const leadId = text(body.lead_id);
    if (!leadId) return json({ ok: false, error: "lead_id_required" }, 400);

    const requested = Number(body.period);
    const period: PerformancePeriod = isPerformancePeriod(requested) ? requested : PERFORMANCE_PERIODS[1];

    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
      auth: { persistSession: false },
    });

    /* ⛔ THE OWNERSHIP GATE. Scoped on user_id, so another operator's lead id returns 404 rather
       than another operator's traffic. Every subsequent read is keyed on this lead. */
    const { data: lead, error: leadError } = await service
      .from("outreach_leads")
      .select("id,business_name,website,canonical_domain,derived_town,search_location,amount_paid,payment_date")
      .eq("id", leadId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (leadError) throw new Error(leadError.message ?? JSON.stringify(leadError));
    if (!lead) return json({ ok: false, error: "client_not_found" }, 404);

    const canonicalDomain = text((lead as { canonical_domain?: unknown }).canonical_domain) || null;

    const windows = periodWindows(period, toISODate(new Date()));
    if (!windows) throw new Error("could not build the period windows");

    const [connRes, trackedRes, coverageRes, currentRes, previousRes, queriesRes] = await Promise.all([
      service.from("client_search_connections")
        .select("status,gsc_property,last_synced_at,last_sync_error,last_sync_row_count")
        .eq("lead_id", leadId).maybeSingle(),
      service.from("client_tracked_pages")
        .select("canonical_url,label,page_type,existed_before_findable,built_or_rebuilt_on")
        .eq("lead_id", leadId),
      service.rpc("search_console_coverage", { p_lead: leadId }),
      service.rpc("search_console_page_totals", { p_lead: leadId, p_from: windows.current.from, p_to: windows.current.to }),
      service.rpc("search_console_page_totals", { p_lead: leadId, p_from: windows.previous.from, p_to: windows.previous.to }),
      service.rpc("search_console_query_totals", { p_lead: leadId, p_from: windows.current.from, p_to: windows.current.to, p_limit: QUERY_ROW_LIMIT }),
    ]);

    for (const r of [connRes, trackedRes, coverageRes, currentRes, previousRes, queriesRes]) {
      if (r.error) throw new Error(r.error.message ?? JSON.stringify(r.error));
    }

    const connection = connRes.data as { status?: string | null; gsc_property?: string | null } | null;
    const trackedPages = (trackedRes.data ?? []) as TrackedPage[];
    const trackedIndex = indexTrackedPages(trackedPages, canonicalDomain);

    const currentTotals = totalsByUrl((currentRes.data ?? []) as AggregateRow[], canonicalDomain);
    const previousTotals = totalsByUrl((previousRes.data ?? []) as AggregateRow[], canonicalDomain);

    const pages = buildPageRows(currentTotals, previousTotals, trackedIndex, windows.previous);

    /* ⛔ The overview is the SUM of the same rows the table shows, not a separate query. Two
       independent aggregations of "the same" number drift, and the screen then argues with
       itself. */
    const overview = {
      current: finaliseTotals(sumTotals([...currentTotals.values()])),
      previous: finaliseTotals(sumTotals([...previousTotals.values()])),
    };

    const queries = ((queriesRes.data ?? []) as AggregateRow[]).map((row) => {
      const raw = text(row.page);
      const url = normaliseUrl(raw, canonicalDomain) ?? raw;
      const meta = trackedIndex.get(url);
      const final = finaliseTotals(totalsFromAggregate(row));
      return {
        query: text(row.query),
        url,
        pageLabel: pageLabel(meta?.label, url),
        tracked: !!meta,
        clicks: final.clicks,
        impressions: final.impressions,
        ctr: final.ctr,
        position: final.position,
      };
    });

    /* Row count for the state decision is the CURRENT PERIOD's row count — an empty 7-day window on
       a client with 90 days of history is 'no_data' for what is on screen, which is the truthful
       thing to say, while coverage still reports the real history underneath. */
    const coverage = ((coverageRes.data ?? []) as Array<Record<string, unknown>>)[0] ?? null;
    const state = resolvePerformanceState(connection, currentTotals.size);

    return json({
      ok: true,
      client: {
        lead_id: leadId,
        business_name: (lead as { business_name?: string }).business_name ?? "",
        website: (lead as { website?: string | null }).website ?? null,
        canonical_domain: canonicalDomain,
        town: (lead as { derived_town?: string | null }).derived_town
          ?? (lead as { search_location?: string | null }).search_location ?? null,
      },
      connection: connection ?? null,
      state,
      period,
      windows,
      /* ⛔ Coverage is max(date) IN THE DATA. Never last_synced_at: a sync that ran five minutes ago
         and returned nothing must not imply there is data for today. And there is no
         "data starts at verification" rule anywhere — Search Console can hold data from before a
         property was verified, so what we have is simply what we have. */
      coverage: coverage
        ? { first_date: coverage.first_date ?? null, last_date: coverage.last_date ?? null, row_count: Number(coverage.row_count ?? 0) }
        : { first_date: null, last_date: null, row_count: 0 },
      overview,
      pages,
      queries,
      tracked_count: trackedPages.length,
      untracked_count: pages.filter((p) => !p.tracked).length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[CLIENT-PERFORMANCE]", message);
    return json({ ok: false, error: message }, 500);
  }
});
