import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { directPoolCacheKeys, generateCacheKey } from "../_shared/search-cache-key.ts";
import { bookOwnerId, refusalBody, resolveActor } from "../_shared/access.ts";

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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json", ...extra } });

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

/** The same rows as all(), fetched in waves of six pages after the first (the browser pager's rule,
 *  src/lib/fetchAllRows.ts): page 0 alone — its length is the page size, so a server cap below 1,000
 *  cannot leave gaps — then waves, stopping at the first short page, deduped by id. The caller must
 *  order by a unique key. ⚡ 2026-09-27: the ~5,300-lead read was six sequential pages, ~3 s of the
 *  4.5 s pairs call. */
// deno-lint-ignore no-explicit-any
async function allInWaves(q: (from: number, to: number) => any): Promise<Record<string, unknown>[]> {
  const PAGE = 1000;
  const first = await q(0, PAGE - 1);
  if (first.error) throw new Error(first.error.message);
  const firstRows = (first.data ?? []) as Record<string, unknown>[];
  const size = firstRows.length;
  const pages: Record<string, unknown>[][] = [firstRows];
  if (size > 0) {
    let next = 1;
    let waveLen = size < PAGE ? 1 : 6;
    outer: for (let guard = 0; guard < 50; guard++) {
      const wave = Array.from({ length: waveLen }, (_, i) => next + i);
      waveLen = 6;
      const res = await Promise.all(wave.map((p) => q(p * size, p * size + size - 1)));
      for (const r of res) {
        if (r.error) throw new Error(r.error.message);
        const batch = (r.data ?? []) as Record<string, unknown>[];
        pages.push(batch);
        if (batch.length < size) break outer;
      }
      next += wave.length;
    }
  }
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const b of pages) for (const row of b) { const k = String(row.id); if (!seen.has(k)) { seen.add(k); out.push(row); } }
  return out;
}

interface Pair { trade: string; town: string }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  try {
    const t0 = Date.now();
    const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "view";
    /* ⛔ A ROLE IS REQUIRED; SUPPRESS IS ADMIN ONLY (2026-09-27, multi-user). uk_towns is shared by
       everyone — a rep hiding a town would hide it from the whole team.
       ⚡ ONE sign-in check (2026-09-27, site-wide speed pass): resolveActor verifies the token with
       the auth service AND reads the role. The handler used to call getUser itself first — the same
       question asked twice, one after the other, on every call. */
    const who = await resolveActor(req, service);
    if (!who.ok) return json(refusalBody(who), who.status);
    let userId = who.actor.id;
    const authMs = Date.now() - t0;
    if ((action === "suppress" || action === "unsuppress") && who.actor.role !== "admin") {
      return json({ ok: false, error: "admin_only", detail: "Only the admin can hide or restore a town." }, 403);
    }
    /* A salesperson reads the ONE book's coverage (counts only — no lead names leave this function),
       so "worked / untouched" means the same thing for the whole team. */
    if (who.actor.role === "sales") {
      const owner = await bookOwnerId(service);
      if (!owner) return json({ ok: false, error: "no_book_owner" }, 503);
      userId = owner;
    }

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
      .order("population", { ascending: false }).order("id", { ascending: true }).range(from, to));

    /* ── THE FACTS, ONE QUERY PER SOURCE ─────────────────────────────────────────────────────── */
    /* Per-read milliseconds for the timing header (reads run side by side, so these overlap). */
    const readMs: Record<string, number> = {};
    const timed = <T,>(name: string, p: Promise<T>): Promise<T> => { const s = Date.now(); return p.then((v) => { readMs[name] = Date.now() - s; return v; }); };
    const computePairs = async () => {
      /* MEASURED: market audits with a COMPLETED run, sent ONE ENTRY PER AUDIT. The client counts
         them per canonical trade+town and calls a town measured only at >= MARKET_AUDIT_MIN_AUDITS —
         so the row and the market panel agree, and case-drift (Locksmiths vs locksmiths) folds on the
         client where coverageKey lives. Counting audits rather than runs is deliberate: 2 audits with
         1 completed run between them is ONE completed audit, half a measurement (CLAUDE.md §8). */
      /* ⚡ SIDE BY SIDE (2026-09-27, site-wide speed pass). The market audits, the leads, the search
         history and the cache keys are independent reads; they used to run one after another. Only
         the completed-run check needs the market audit ids, so it follows that one read — its
         150-id chunks together, not in turn. Same rows, same folds below. */
      const marketAuditsP = all((from, to) => service
        .from("ai_audits").select("id, business_type, location_text")
        .eq("user_id", userId).eq("is_market", true).order("id", { ascending: true }).range(from, to));
      const completedP = marketAuditsP.then(async (marketAudits) => {
        const marketIds = marketAudits.map((a) => String(a.id));
        const chunks: string[][] = [];
        for (let i = 0; i < marketIds.length; i += 150) chunks.push(marketIds.slice(i, i + 150));
        const results = await Promise.all(chunks.map((chunk) => service.from("ai_audit_runs")
          .select("audit_id").in("audit_id", chunk).in("status", ["complete", "capped"])));
        const completed = new Set<string>();
        for (const { data } of results) for (const r of (data ?? []) as Array<{ audit_id: string }>) completed.add(String(r.audit_id));
        return completed;
      });
      const leadsP = allInWaves((from, to) => service
        .from("outreach_leads")
        .select("id, search_keyword, category, search_location, derived_town, status, whatsapp_sent_at, instantly_pushed_at, last_outreach_attempt_at")
        .eq("user_id", userId).eq("is_archived", false).order("id", { ascending: true }).range(from, to));
      const historyP = all((from, to) => service
        .from("search_history").select("keyword, location, radius")
        .eq("user_id", userId).order("id", { ascending: true }).range(from, to));
      const cacheRowsP = all((from, to) => service
        .from("search_cache").select("cache_key").order("id", { ascending: true }).range(from, to));
      const [marketAudits, completed, leads, history, cacheRows] = await Promise.all([timed("audits", marketAuditsP), timed("runs", completedP), timed("leads", leadsP), timed("history", historyP), timed("cache", cacheRowsP)]);
      const hashStart = Date.now();
      const measured: Pair[] = marketAudits
        .filter((a) => completed.has(String(a.id)))
        .map((a) => ({ trade: String(a.business_type ?? ""), town: String(a.location_text ?? "") }));

      /* LEADS and WORKED, from one read of outreach_leads.
         ⛔ THE TOWN IS derived_town FIRST. search_location is the town SEARCHED, and a radius search
         pulls in businesses from another county — 31 of 44 measurable audits were >10km from the town
         they asked about. Keying coverage off the searched town would credit work in a town where no
         business actually is. */
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

      /* ── POOLED: which pairs have a lead pool the market panel can actually SHOW ───────────────
         ⛔ WHY THIS BELONGS HERE. Coverage graded a town "Measured" off audits alone, so the row
         offered "Market view" for 20 of 42 measured markets (48%, measured 2026-08-20) that had no
         pool — and the panel answered with a dead end. The row cannot label the button honestly
         without knowing this, and finding out per-row costs a market-view read each. One extra pair
         of table reads here answers it for every row at once.

         ⛔ IT IS THE SAME JOIN market-view DOES, and it must stay that way or the label lies: a
         search_history row locates the pool, and generateCacheKey (the ONE shared definition, so the
         hash matches search-leads byte for byte) says whether the cached copy still exists. townOnly
         FIRST, then the radius key, exactly as market-view orders them.

         ⚠️ AGE IS DELIBERATELY NOT A FILTER. market-view serves a stale pool as `stale` and SHOWS the
         businesses — age decides the state, never whether they appear (the 2026-08-14 fix). A row
         whose pool is 8 days old must therefore read "Market view", because that is what clicking it
         gives you. Filtering by age here would recreate the dead end for exactly those towns.

         COSTS NOTHING: two table reads, no Google, no Apify. */
      const cacheKeys = new Set(cacheRows.map((r) => String(r.cache_key)));
      const pooled: Pair[] = [];
      /* The hashes are independent of each other: computed together, then read in history order, so
         `pooled` comes out in exactly the order the one-at-a-time loop produced. */
      const hashed = await Promise.all(history.map(async (h) => {
        const keyword = String(h.keyword ?? "").trim();
        const location = String(h.location ?? "").trim();
        if (!keyword || !location) return null;
        const radius = Number(h.radius ?? 0);
        const [townKey, radiusKey] = await Promise.all([generateCacheKey(keyword, location, radius, true), generateCacheKey(keyword, location, radius, false)]);
        return { keyword, location, has: cacheKeys.has(townKey) || cacheKeys.has(radiusKey) };
      }));
      readMs.hash = Date.now() - hashStart;
      for (const h of hashed) {
        /* Sent RAW like every other pair — coverageKey folds it on the client, once. */
        if (h?.has) pooled.push({ trade: h.keyword, town: h.location });
      }

      /* ── THE DIRECT-KEY FALLBACK, same reasoning as market-view's (2026-08-20) ─────────────────
         A pool whose `search_history` row was never written is invisible to the loop above, so the
         row would offer a priced "Find leads" for businesses already sitting in the cache — paid for
         and unreachable. The MEASURED pairs are exactly the rows at risk (a measured town with no
         pool is the dead end), so their direct keys are checked here. No extra reads: `cacheKeys` is
         already in memory, and this only hashes. */
      for (const p of measured) {
        for (const key of await directPoolCacheKeys(p.trade, p.town)) {
          if (cacheKeys.has(key)) { pooled.push({ trade: p.trade, town: p.town }); break; }
        }
      }

      return { measured, leads: leadPairs, worked: workedPairs, pooled };
    };

    /* Where the time went, for the next person who measures this (auth = the sign-in + role check). */
    const timing = () => ({ "x-coverage-timing": [`auth=${authMs}`, ...Object.entries(readMs).map(([k, v]) => `${k}=${v}`), `total=${Date.now() - t0}`].join(";") });
    if (action === "towns") {
      const towns = await loadTowns();
      return json({ ok: true, towns, counts: { towns: towns.length } }, 200, timing());
    }
    if (action === "pairs") {
      const pairs = await computePairs();
      return json({
        ok: true,
        pairs,
        counts: { measured: pairs.measured.length, leads: pairs.leads.length, worked: pairs.worked.length, pooled: pairs.pooled.length },
      }, 200, timing());
    }

    /* action === "view" — everything, for an older SPA mid-deploy. */
    const [towns, pairs] = await Promise.all([loadTowns(), computePairs()]);
    return json({
      ok: true,
      towns,
      pairs,
      /* So the page can say what it is looking at without a second call. */
      counts: { towns: towns.length, measured: pairs.measured.length, leads: pairs.leads.length, worked: pairs.worked.length, pooled: pairs.pooled.length },
    });
  } catch (e) {
    console.error("[coverage] error:", (e as Error).message);
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
