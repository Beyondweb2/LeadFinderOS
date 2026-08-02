import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { norm } from "../../../src/lib/buildPlaybook.ts";
import { buildMatchContext, groupNames, keyIndex } from "../_shared/market-match.ts";
import { generateCacheKey } from "../_shared/search-cache-key.ts";
import {
  EVIDENCE_MIN_AUDITS, JUNK_RATIO_PER_AUDIT, MAX_PER_ENGINE_CAP,
  type MarketConcentration, type MarketNamedRow, type MarketPoolExcluded,
  type MarketPoolRow, type MarketPoolState,
} from "../../../src/lib/marketView.ts";

/* ============================================================
   MARKET VIEW — a trade in a town, rather than one business at a time.

   READ ONLY. This function calls no vendor API and writes no row. It reads audits that already
   exist and the lead pool that a Find Leads search already cached. Every number it returns was
   already paid for.

   THREE ANSWERS:
     1. How concentrated the market is — is it owned by one firm, or spread across many.
     2. Who AI already names.
     3. Which local businesses AI has never named. Those are the prospects.

   ── WHY THE FOLD IS SERVER-SIDE ──────────────────────────────────────────────────────────────
   Competitor names live in ai_audit_queue.result, jsonb, one row per question per run. The anon
   key cannot read most of it (RLS returns 200 with [], not an error — an empty market would be
   indistinguishable from a blocked one), and the table is well past the 1000-row PostgREST
   truncation point. Same reasoning, and the same paginated read, as playbook-evidence.
   ============================================================ */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** Cache TTL of search_cache, mirrored from search-leads. Used ONLY to explain an expiry to the
 *  operator ("searched 5 days ago, the pool has since expired") — the read itself filters on
 *  created_at, so a stale row can never be served as fresh. */
const POOL_TTL_MS = 72 * 60 * 60 * 1000;

/** Town strings are hand-typed and inconsistent ("Wisbech", "wisbech ", "Wisbech, UK"). Compare on
 *  letters only, with the country word dropped — the same shape as buildPlaybook's townKey. */
const townKey = (t: string | null | undefined) =>
  (t ?? "").toLowerCase().replace(/\b(uk|england|scotland|wales|united kingdom)\b/g, "").replace(/[^a-z]/g, "");

/** Label for a merged group.
 *  Prefer a spelling WITHOUT brackets, then the most-mentioned, then the shortest.
 *  Not simply "the shortest": that picked "Rapid Secure UK" as the label for a 38-mention Rapid
 *  Locksmiths group, and "Wisbech Locksmiths (Rapid Locksmiths)" once brackets were in play. The
 *  label should be what this firm usually gets CALLED, which is the modal spelling. */
function pickDisplayName(counts: Map<string, number>): string {
  const all = [...counts.entries()];
  if (all.length === 0) return "";
  const plain = all.filter(([n]) => !n.includes("("));
  const pool = plain.length ? plain : all;
  return pool.sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || a[0].localeCompare(b[0]))[0][0];
}

/** Same rule for a list with no mention counts (the lead pool, where each row appears once). */
function pickDisplayNameFromList(names: string[]): string {
  const counts = new Map<string, number>();
  for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
  return pickDisplayName(counts);
}

// deno-lint-ignore no-explicit-any
type Client = any;

/** Paginated read — PostgREST truncates at db-max-rows SILENTLY, which would make every count
 *  here wrong while looking perfectly healthy. `id` is the tiebreaker (created_at is not unique). */
async function all<T>(service: Client, table: string, cols: string, apply: (q: Client) => Client): Promise<T[]> {
  const out: T[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await apply(service.from(table).select(cols))
      .order("id", { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

interface AuditRow { id: string; business_type: string | null; location_text: string | null; business_name: string | null }
interface RunRow { id: string; audit_id: string; status: string | null }
interface QueueRow { id: string; run_id: string; result: Record<string, unknown> | null }
interface HistoryRow { id: string; keyword: string; location: string; radius: number; searched_at: string }
/** Shape search-leads stores in search_cache — a bare array, or { leads, region } for region runs. */
interface CachedLead {
  id: string; name: string; googleMapsUrl: string; websiteUrl: string | null;
  websiteStatus: string; confidence: number; reason: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json({ ok: false, error: "Auth required" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ ok: false, error: "Auth required" }, 401);
    const userId = u.user.id;

    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "view";

    /* ── OPTIONS: which trade + town pairs exist, and how many audits back each ───────────────
       Populated from real audits so the picker can never offer a market with nothing behind it,
       and the count is shown so a thin one is obvious BEFORE it is opened. */
    if (action === "options") {
      const audits = await all<AuditRow>(service, "ai_audits", "id, business_type, location_text, business_name",
        (q) => q.eq("user_id", userId));
      const byPair = new Map<string, { trade: string; town: string; audits: number }>();
      for (const a of audits) {
        const trade = norm(a.business_type);
        const town = (a.location_text ?? "").trim();
        if (!trade || !town) continue;   // a pair needs both halves to mean anything
        const k = `${trade}|||${townKey(town)}`;
        const hit = byPair.get(k) ?? { trade, town, audits: 0 };
        hit.audits += 1;
        byPair.set(k, hit);
      }
      const options = [...byPair.values()].sort((a, b) => b.audits - a.audits || a.trade.localeCompare(b.trade) || a.town.localeCompare(b.town));
      return json({ ok: true, options });
    }

    if (action !== "view") return json({ ok: false, error: `unknown action "${action}"` }, 400);

    const trade = norm(typeof body.trade === "string" ? body.trade : "");
    const town = (typeof body.town === "string" ? body.town : "").trim();
    if (!trade || !town) return json({ ok: false, error: "trade and town are both required" }, 400);
    const tk = townKey(town);

    /* ── 1. THE AUDITS BEHIND THIS MARKET ─────────────────────────────────────────────────── */
    const allAudits = await all<AuditRow>(service, "ai_audits", "id, business_type, location_text, business_name",
      (q) => q.eq("user_id", userId));
    const audits = allAudits.filter((a) => norm(a.business_type) === trade && townKey(a.location_text) === tk);
    const auditIds = audits.map((a) => a.id);

    if (auditIds.length === 0) {
      return json({
        ok: true, trade, town,
        concentration: emptyConcentration(),
        named: [], pool: [], poolState: { state: "never_searched" } as MarketPoolState,
        audited: [],
      });
    }

    /* COMPLETE runs only. A failed or capped run has no answer text, so its absence of competitors
       is not evidence of a concentrated market — it is evidence of nothing. */
    const runs = await all<RunRow>(service, "ai_audit_runs", "id, audit_id, status",
      (q) => q.in("audit_id", auditIds));
    const completeRuns = runs.filter((r) => (r.status ?? "") === "complete");
    const auditOfRun = new Map(completeRuns.map((r) => [r.id, r.audit_id]));
    const runIds = completeRuns.map((r) => r.id);

    /* -- 2. RAW COMPETITOR MENTIONS ------------------------------------------------------- */
    const queue = runIds.length
      ? await all<QueueRow>(service, "ai_audit_queue", "id, run_id, result", (q) => q.in("run_id", runIds))
      : [];

    const mentions: { auditId: string; name: string }[] = [];
    let engineBlocks = 0;
    let truncatedBlocks = 0;

    for (const row of queue) {
      const result = row.result;
      if (!result || typeof result !== "object") continue;
      const auditId = auditOfRun.get(row.run_id);
      if (!auditId) continue;
      for (const payload of Object.values(result)) {
        const block = payload as { competitors?: unknown; named?: unknown } | null;
        // Only real engine blocks carry `named`; this skips _apify and _cost_usd.
        if (!block || typeof block !== "object" || block.named === undefined) continue;
        const list = block.competitors;
        if (!Array.isArray(list)) continue;
        engineBlocks += 1;
        // MAX_PER_ENGINE caps extract-competitors at 8 per engine, so a block sitting exactly on
        // the cap was probably cut short - the fragmented markets are the ones that hit it.
        if (list.length >= MAX_PER_ENGINE_CAP) truncatedBlocks += 1;
        for (const raw of list) {
          const name = typeof raw === "string" ? raw.trim() : "";
          if (name) mentions.push({ auditId, name });
        }
      }
    }

    /* -- 3. THE LEAD POOL, FROM CACHE ONLY -------------------------------------------------- */
    /* Fetched BEFORE the grouping, because the grouping has to see both sides at once. Three
       states, and they must read differently on screen: an empty prospect list and a search that
       was never run are completely different facts about a market. */
    let poolState: MarketPoolState = { state: "never_searched" };
    let pool: CachedLead[] = [];

    /* Which keyword was actually SEARCHED for this trade? It cannot be assumed to equal the trade:
       norm() maps "plumbers" to "plumber" but leaves "locksmiths" alone, while the cache key
       singularises everything. So the real keyword is resolved from history rather than guessed. */
    const history = await all<HistoryRow>(service, "search_history", "id, keyword, location, radius, searched_at",
      (q) => q.eq("user_id", userId));
    const matching = history
      .filter((h) => norm(h.keyword) === trade && townKey(h.location) === tk)
      .sort((a, b) => (b.searched_at ?? "").localeCompare(a.searched_at ?? ""));

    if (matching.length > 0) {
      const last = matching[0];
      const cutoff = new Date(Date.now() - POOL_TTL_MS).toISOString();
      /* townOnly FIRST. The market view's own search button runs townOnly, and that is the pool
         this view wants - a radius pool includes neighbouring towns the audits never covered,
         which would put businesses in the prospect list that were never in the market being
         measured. The plain key is only a fallback, and it is reported as such. */
      for (const [tOnly, kind] of [[true, "town"], [false, "radius"]] as const) {
        const key = await generateCacheKey(last.keyword, last.location, last.radius, tOnly);
        const { data: hit } = await service.from("search_cache")
          .select("results, created_at").eq("cache_key", key).gte("created_at", cutoff).maybeSingle();
        if (!hit?.results) continue;
        const rawRes = hit.results as unknown;
        const isRegionBlob = !!rawRes && !Array.isArray(rawRes) && Array.isArray((rawRes as { leads?: unknown }).leads);
        pool = (isRegionBlob ? (rawRes as { leads: CachedLead[] }).leads : rawRes) as CachedLead[];
        poolState = {
          state: "ready", scope: kind, keyword: last.keyword, radiusM: last.radius,
          searchedAt: String(hit.created_at), total: pool.length,
        };
        break;
      }
      if (poolState.state === "never_searched") {
        poolState = { state: "expired", keyword: last.keyword, searchedAt: last.searched_at, ttlHours: POOL_TTL_MS / 3_600_000 };
      }
    }

    /* -- 4. ONE GROUPING PASS OVER BOTH SIDES ----------------------------------------------- */
    /* THE FIX. Previously the named list merged on businessCore and the pool subtracted using the
       same key computed separately - so "Anglia Locksmiths" led the named list on 86 mentions
       while "Anglia Locksmiths (MLA Approved Company)" sat in the prospect list, telling the
       operator to cold-contact the market leader. Grouping both sides in ONE pass makes that
       disagreement structurally impossible: the pool asks the same index the named list was
       built from. */
    const ctx = buildMatchContext(trade, town);
    const poolNames = pool.map((p) => (p?.name ?? "").trim()).filter(Boolean);
    const groups = groupNames([...mentions.map((m) => m.name), ...poolNames], ctx);
    const idx = keyIndex(groups);

    // key -> the fold. AUDITS is the honest signal: 32 mentions from one audit is one opinion, not
    // a market position (the same trap playbook-evidence guards).
    const fold = new Map<string, { counts: Map<string, number>; mentions: number; audits: Set<string> }>();
    for (const m of mentions) {
      const k = idx.get(m.name);
      if (!k) continue;
      const hit = fold.get(k) ?? { counts: new Map<string, number>(), mentions: 0, audits: new Set<string>() };
      hit.counts.set(m.name, (hit.counts.get(m.name) ?? 0) + 1);
      hit.mentions += 1;
      hit.audits.add(m.auditId);
      fold.set(k, hit);
    }

    const named: MarketNamedRow[] = [...fold.entries()]
      .map(([key, v]) => ({
        key,
        name: pickDisplayName(v.counts),
        variants: [...v.counts.keys()].sort(),
        mentions: v.mentions,
        audits: v.audits.size,
      }))
      .sort((a, b) => b.audits - a.audits || b.mentions - a.mentions || a.name.localeCompare(b.name));

    /* -- 5. CONCENTRATION -------------------------------------------------------------------- */
    const totalMentions = named.reduce((s, n) => s + n.mentions, 0);
    const byMentions = [...named].sort((a, b) => b.mentions - a.mentions);
    const share = (n: number) => (totalMentions > 0 ? Math.round((n / totalMentions) * 1000) / 10 : 0);
    /* JUNK DETECTION, not a quality score. extract-competitors cleans these with an LLM but never
       ran on the older audits, so those carry raw regex output - Wisbech accountants folds to
       thousands of "names" topped by "hmrc". Measured: clean markets sit at 4-9 distinct names per
       audit, junk ones at 30-970. Reported as a suspicion with the ratio attached, never as a
       verdict, and never auto-corrected: re-extraction costs an LLM call per run. */
    const distinctPerAudit = auditIds.length > 0
      ? Math.round((named.length / auditIds.length) * 10) / 10
      : 0;
    const concentration: MarketConcentration = {
      audits: auditIds.length,
      completeRuns: completeRuns.length,
      distinctBusinesses: named.length,
      totalMentions,
      topName: byMentions[0]?.name ?? null,
      topSharePct: byMentions[0] ? share(byMentions[0].mentions) : 0,
      topThreeSharePct: share(byMentions.slice(0, 3).reduce((s, n) => s + n.mentions, 0)),
      thin: auditIds.length < EVIDENCE_MIN_AUDITS,
      distinctPerAudit,
      likelyJunk: distinctPerAudit >= JUNK_RATIO_PER_AUDIT,
      truncatedBlocks,
      engineBlocks,
      runIds,
    };

    /* -- 6. PROSPECTS = pool minus named, chains collapsed, exclusions ITEMISED --------------- */
    const namedByKey = new Map(named.map((n) => [n.key, n]));
    // Chains: pool rows sharing a group key are one company. Ten Timpson branches are one entry
    // with a branch count, not ten prospects. Derived from repetition - no chain list anywhere.
    const poolGroups = new Map<string, { variants: string[]; ids: string[]; websiteless: number; sample: CachedLead }>();
    for (const p of pool) {
      const nm = (p?.name ?? "").trim();
      if (!nm) continue;
      const k = idx.get(nm);
      if (!k) continue;
      const g = poolGroups.get(k) ?? { variants: [], ids: [], websiteless: 0, sample: p };
      g.variants.push(nm);
      g.ids.push(p.id);
      if (p.websiteStatus === "NO_WEBSITE") g.websiteless += 1;
      poolGroups.set(k, g);
    }

    const notNamed: MarketPoolRow[] = [];
    /* EVERY EXCLUSION IS ITEMISED. A silent exclusion is as dangerous as a silent inclusion - it is
       how a real prospect disappears. Each one names the entry it matched and that entry's weight,
       so a wrong merge is visible on screen instead of quietly removing a business. */
    const poolExcluded: MarketPoolExcluded[] = [];
    for (const [key, g] of poolGroups) {
      const hit = namedByKey.get(key);
      if (hit) {
        poolExcluded.push({
          name: pickDisplayNameFromList(g.variants),
          matchedNamed: hit.name,
          matchedMentions: hit.mentions,
          matchedAudits: hit.audits,
        });
        continue;
      }
      notNamed.push({
        key,
        name: pickDisplayNameFromList(g.variants),
        branches: g.variants.length,
        isChain: g.variants.length > 1,
        placeIds: g.ids,
        noWebsite: g.websiteless > 0,
        googleMapsUrl: g.sample.googleMapsUrl,
        websiteUrl: g.sample.websiteUrl,
      });
    }
    notNamed.sort((a, b) => Number(b.noWebsite) - Number(a.noWebsite) || a.name.localeCompare(b.name));
    poolExcluded.sort((a, b) => b.matchedMentions - a.matchedMentions);
    const alreadyNamed = poolExcluded.length;

    return json({
      ok: true, trade, town,
      concentration,
      named,
      pool: notNamed,
      poolState,
      poolMatchedNamed: alreadyNamed,
      poolExcluded,
      auditedBusinesses: audits.map((a) => a.business_name).filter(Boolean),
    });
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    console.error("[market-view]", raw);
    return json({ ok: false, error: raw }, 200);
  }
});

function emptyConcentration(): MarketConcentration {
  return {
    audits: 0, completeRuns: 0, distinctBusinesses: 0, totalMentions: 0,
    topName: null, topSharePct: 0, topThreeSharePct: 0,
    thin: true, distinctPerAudit: 0, likelyJunk: false,
    truncatedBlocks: 0, engineBlocks: 0, runIds: [],
  };
}
