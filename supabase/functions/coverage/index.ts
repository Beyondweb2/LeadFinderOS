import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ════════════════════════════════════════════════════════════════════════════════════════════
   WHERE HAVE I BEEN? — the candidate town list, and the raw facts to grade it against.

   ⛔ IT RETURNS FACTS, NOT VERDICTS. The grading lives in src/lib/coverageState.ts so there is ONE
   implementation of "what counts as worked" and it is unit-tested. If this endpoint graded as well,
   the page and the tests would be checking different code, and the first divergence would be
   invisible — the page would simply be wrong in a way no test could see.

   ⛔ AND IT RETURNS EVERY CANDIDATE TOWN, which is the whole difference from market-view's
   `options` action. That one lists trade+town pairs that ALREADY have audits — useful, and exactly
   the wrong shape here, because the towns Paul needs to see are the ones he has NOT touched.

   ⚠️ THE PAIRS ARE SENT RAW, un-canonicalised. coverageKey() folds "plumber" and "plumbers" into
   one trade, and it must do that on BOTH sides of the join using the same function — so it runs on
   the client, once, over both the town list and these pairs. Canonicalising here would put a second
   copy of that rule in a second language.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** Paginated read — PostgREST truncates at db-max-rows silently (CLAUDE.md §6). */
// deno-lint-ignore no-explicit-any
async function all(q: (from: number, to: number) => any): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const PAGE = 1000;
  for (let i = 0; ; i += PAGE) {
    const { data, error } = await q(i, i + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Record<string, unknown>[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

interface Pair { trade: string; town: string }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ ok: false, error: "Auth required" }, 401);
    const token = authHeader.slice(7);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: u, error: uErr } = await userClient.auth.getUser(token);
    if (uErr || !u?.user) return json({ ok: false, error: "Auth required" }, 401);
    const userId = u.user.id;

    const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "view";

    /* ── SUPPRESS / UNSUPPRESS ────────────────────────────────────────────────────────────────
       ⛔ NEVER A DELETE. Roughly 5% of Built-Up Areas are conurbation fragments rather than towns
       anyone would name, and they must come off the working list WITHOUT being removed: a delete
       is silently undone by the next re-seed, and the reason is lost. The seed upserts only the
       ONS-sourced columns, so these two survive it.
       ⚠️ Writes go through the service role because uk_towns is read-only to authenticated — the
       operator is checked above, and the table stays un-writable from the browser. */
    if (action === "suppress" || action === "unsuppress") {
      const townId = typeof body.town_id === "string" ? body.town_id.trim() : "";
      if (!townId) return json({ ok: false, error: "town_id required" }, 400);
      const patch = action === "suppress"
        ? {
            suppressed_at: new Date().toISOString(),
            /* A reason is optional but strongly wanted: "why is Salford not on my list" is a
               question that gets asked six months later. Recorded as given, never invented. */
            suppressed_reason: String(body.reason ?? "").trim() || null,
          }
        : { suppressed_at: null, suppressed_reason: null };
      /* ⛔ RETURNS THE ROW IT WROTE. The page patches its cache from this rather than re-deriving
         what it thinks the server did — a client-invented `suppressed_at` is a value nobody wrote,
         and the moment the two disagree the cache is quietly lying about the database. Returning
         the row is also what lets the page skip a 733-row refetch honestly. */
      const { data: updated, error } = await service
        .from("uk_towns").update(patch).eq("id", townId)
        .select("id, suppressed_at, suppressed_reason").maybeSingle();
      if (error) return json({ ok: false, error: error.message }, 500);
      if (!updated) return json({ ok: false, error: "unknown town" }, 404);
      console.log(`[coverage] ${action} town ${townId} by ${userId}${body.reason ? ` — ${body.reason}` : ""}`);
      return json({ ok: true, town: updated });
    }

    /* ── THREE READ ACTIONS ───────────────────────────────────────────────────────────────────
       `view` returns everything (kept for back-compat during a deploy — an older SPA still calls it).
       `towns` and `pairs` are the split the SPA now uses: the static 733-town list hard-caches on the
       client, the dynamic pairs sit on the key a lead-add invalidates, and the two fire in parallel.
       Splitting a 3-second sequential read that a lead-add refetched in full — CLAUDE.md §6c. */
    if (action !== "view" && action !== "towns" && action !== "pairs") {
      return json({ ok: false, error: `unknown action "${action}"` }, 400);
    }

    /* ── THE CANDIDATE LIST ───────────────────────────────────────────────────────────────────
       Suppressed rows are RETURNED, flagged, not filtered out. The page hides them by default and
       can show them — a list you cannot see the exclusions from is a list you cannot correct. */
    const loadTowns = () => all((from, to) => service
      .from("uk_towns").select("id, name, region, county, population, suppressed_at, suppressed_reason")
      .order("population", { ascending: false }).range(from, to));

    /* ── THE FACTS, ONE QUERY PER SOURCE ─────────────────────────────────────────────────────── */
    const computePairs = async () => {
      /* MEASURED: market audits with a COMPLETED run, sent ONE ENTRY PER AUDIT. The client counts
         them per canonical trade+town and calls a town measured only at >= MARKET_AUDIT_MIN_AUDITS —
         so the row and the market panel agree, and case-drift (Locksmiths vs locksmiths) folds on the
         client where coverageKey lives. Counting audits rather than runs is deliberate: 2 audits with
         1 completed run between them is ONE completed audit, half a measurement (CLAUDE.md §8). */
      const marketAudits = await all((from, to) => service
        .from("ai_audits").select("id, business_type, location_text")
        .eq("user_id", userId).eq("is_market", true).range(from, to));
      const marketIds = marketAudits.map((a) => String(a.id));
      const completed = new Set<string>();
      for (let i = 0; i < marketIds.length; i += 150) {
        const chunk = marketIds.slice(i, i + 150);
        if (!chunk.length) continue;
        const { data } = await service.from("ai_audit_runs")
          .select("audit_id").in("audit_id", chunk).in("status", ["complete", "capped"]);
        for (const r of (data ?? []) as Array<{ audit_id: string }>) completed.add(String(r.audit_id));
      }
      const measured: Pair[] = marketAudits
        .filter((a) => completed.has(String(a.id)))
        .map((a) => ({ trade: String(a.business_type ?? ""), town: String(a.location_text ?? "") }));

      /* LEADS and WORKED, from one read of outreach_leads.
         ⛔ THE TOWN IS derived_town FIRST. search_location is the town SEARCHED, and a radius search
         pulls in businesses from another county — 31 of 44 measurable audits were >10km from the town
         they asked about. Keying coverage off the searched town would credit work in a town where no
         business actually is. */
      const leads = await all((from, to) => service
        .from("outreach_leads")
        .select("id, search_keyword, category, search_location, derived_town, status, whatsapp_sent_at, instantly_pushed_at, last_outreach_attempt_at")
        .eq("user_id", userId).eq("is_archived", false).range(from, to));

      const leadPairs: Pair[] = [];
      const workedPairs: Pair[] = [];
      for (const l of leads) {
        const trade = String(l.search_keyword || l.category || "").trim();
        const town = String(l.derived_town || l.search_location || "").trim();
        if (!trade || !town) continue;
        const pair = { trade, town };
        leadPairs.push(pair);
        /* ⛔ CONTACTED IS A POSITIVE TEST ON EVIDENCE OF A SEND, not "status is not new". Statuses are
           operator-editable and a list of the ones that mean untouched would go stale the moment one
           was added — the absent-value shape CLAUDE.md records six times. A timestamp is a fact.
           `report_sent` is included because a report going out IS the outreach on the email path. */
        const contacted = !!l.whatsapp_sent_at || !!l.instantly_pushed_at || !!l.last_outreach_attempt_at
          || String(l.status ?? "") === "report_sent";
        if (contacted) workedPairs.push(pair);
      }
      return { measured, leads: leadPairs, worked: workedPairs };
    };

    if (action === "towns") {
      const towns = await loadTowns();
      return json({ ok: true, towns, counts: { towns: towns.length } });
    }
    if (action === "pairs") {
      const pairs = await computePairs();
      return json({
        ok: true,
        pairs,
        counts: { measured: pairs.measured.length, leads: pairs.leads.length, worked: pairs.worked.length },
      });
    }

    /* action === "view" — everything, for an older SPA mid-deploy. */
    const [towns, pairs] = await Promise.all([loadTowns(), computePairs()]);
    return json({
      ok: true,
      towns,
      pairs,
      /* So the page can say what it is looking at without a second call. */
      counts: { towns: towns.length, measured: pairs.measured.length, leads: pairs.leads.length, worked: pairs.worked.length },
    });
  } catch (e) {
    console.error("[coverage] error:", (e as Error).message);
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
