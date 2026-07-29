import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// playbook-evidence — folds every audit citation into per-trade evidence, which is the ONLY thing
// that decides which directories a playbook recommends.
//
// WHY AN EDGE FUNCTION. The fold needs jsonb_each + jsonb_array_elements over ai_audit_queue.result,
// which PostgREST cannot express, so the SPA cannot run it. An RPC or a materialised view would both
// need SQL run against the database by hand; this needs none.
//
// WHAT IT RETURNS is exactly buildPlaybook's existing signature — { evidence, tradeAuditTotals } —
// so the fold is the only new code and the evidence layer is untouched.
//
// THE SEPARATION THIS PRESERVES: this function decides WHICH hosts matter for a trade, purely from
// citations. directoryFacts.ts says what a host IS and who can action it, keyed by host and never by
// trade. Collapsing the two would recreate the hardcoded list — see the guardrail in that file.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** Mirrors buildPlaybook.ts's own norm() EXACTLY. If that changes, this must change with it, or the
 *  keys stop matching and every trade silently folds to zero evidence. */
const norm = (t: string | null | undefined): string => {
  const s = (t ?? "").toLowerCase();
  if (/plumb/.test(s)) return "plumber";
  if (/accountant|accountancy|bookkeep/.test(s)) return "accountant";
  if (/electric/.test(s)) return "electrician";
  return s.trim();
};

/** Host from a citation URL: scheme stripped, path and query dropped, www removed, lowercased. */
function hostOf(url: string): string {
  const raw = (url ?? "").trim();
  if (!raw) return "";
  return raw.replace(/^https?:\/\//i, "").split("/")[0].split("?")[0].toLowerCase().replace(/^www\./, "");
}

interface EvidenceRow { trade: string; host: string; citations: number; audits: number }

/* IN-MODULE CACHE. The fold reads every queue row, so re-running it on each page load would be
   wasteful for data that changes only when an audit completes. Per-instance and lost on cold start,
   which is fine: a miss costs one fold. A shared cache table would be better and needs SQL. */
const TTL_MS = 12 * 60_000;
let cache: { at: number; body: Record<string, unknown> } | null = null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const fresh = url.searchParams.get("fresh") === "1";
    if (!fresh && cache && Date.now() - cache.at < TTL_MS) {
      return json({ ...cache.body, cached: true, cache_age_seconds: Math.round((Date.now() - cache.at) / 1000) });
    }

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );
    const started = Date.now();

    /* PAGINATED, ORDERED BY A UNIQUE KEY. PostgREST truncates at db-max-rows (1000) SILENTLY, and
       ai_audit_queue is well past that — an unpaginated read would make every citation count wrong
       while looking perfectly healthy. `id` is the tiebreaker because created_at is not unique. */
    async function all<T>(table: string, cols: string): Promise<T[]> {
      const out: T[] = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await service.from(table).select(cols)
          .order("id", { ascending: true }).range(from, from + PAGE - 1);
        if (error) throw new Error(`${table}: ${error.message}`);
        const rows = (data ?? []) as T[];
        out.push(...rows);
        // Advance by rows RETURNED, and stop on a short page — not on a fixed count.
        if (rows.length < PAGE) break;
      }
      return out;
    }

    const audits = await all<{ id: string; business_type: string | null }>("ai_audits", "id, business_type");
    const runs = await all<{ id: string; audit_id: string }>("ai_audit_runs", "id, audit_id");
    const queue = await all<{ id: string; run_id: string; result: Record<string, unknown> | null }>(
      "ai_audit_queue", "id, run_id, result",
    );

    const tradeOfAudit = new Map<string, string>();
    const tradeAuditTotals: Record<string, number> = {};
    for (const a of audits) {
      const t = norm(a.business_type);
      if (!t) continue;                       // an audit with no trade cannot inform any trade
      tradeOfAudit.set(a.id, t);
      tradeAuditTotals[t] = (tradeAuditTotals[t] ?? 0) + 1;
    }
    const auditOfRun = new Map(runs.map((r) => [r.id, r.audit_id]));

    /* trade -> host -> { citations, audits:Set<auditId> }. Audits is a SET because BREADTH is the
       honest signal: 32 Companies House citations turned out to come from a single audit, and a
       count of rows would have made that look like the strongest source in the data. */
    const fold = new Map<string, Map<string, { citations: number; audits: Set<string> }>>();
    let citationsSeen = 0;
    let rowsWithResult = 0;

    for (const row of queue) {
      const result = row.result;
      if (!result || typeof result !== "object") continue;
      const auditId = auditOfRun.get(row.run_id);
      if (!auditId) continue;
      const trade = tradeOfAudit.get(auditId);
      if (!trade) continue;
      rowsWithResult += 1;
      for (const payload of Object.values(result)) {
        const cits = (payload as { citations?: unknown })?.citations;
        if (!Array.isArray(cits)) continue;
        for (const c of cits) {
          const host = hostOf(String((c as { url?: string })?.url ?? ""));
          if (!host) continue;
          citationsSeen += 1;
          const byHost = fold.get(trade) ?? new Map();
          fold.set(trade, byHost);
          const hit = byHost.get(host) ?? { citations: 0, audits: new Set<string>() };
          hit.citations += 1;
          hit.audits.add(auditId);
          byHost.set(host, hit);
        }
      }
    }

    const evidence: EvidenceRow[] = [];
    for (const [trade, byHost] of fold) {
      for (const [host, v] of byHost) {
        evidence.push({ trade, host, citations: v.citations, audits: v.audits.size });
      }
    }
    // Breadth first, then volume — the order the operator should read them in.
    evidence.sort((a, b) => a.trade.localeCompare(b.trade) || b.audits - a.audits || b.citations - a.citations);

    const body = {
      ok: true,
      evidence,
      tradeAuditTotals,
      counts: {
        audits: audits.length,
        runs: runs.length,
        queue_rows: queue.length,
        queue_rows_folded: rowsWithResult,
        citations: citationsSeen,
        hosts: evidence.length,
      },
      fold_ms: Date.now() - started,
    };
    cache = { at: Date.now(), body };
    return json({ ...body, cached: false });
  } catch (e) {
    console.error("[playbook-evidence]", e instanceof Error ? e.message : e);
    return json({ ok: false, error: e instanceof Error ? e.message : "internal" }, 500);
  }
});
