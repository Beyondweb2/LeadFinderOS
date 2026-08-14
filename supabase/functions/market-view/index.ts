import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { norm } from "../../../src/lib/buildPlaybook.ts";
import { buildMatchContext, groupNames, keyIndex } from "../_shared/market-match.ts";
import { nameMatches } from "../_shared/enrichment/ai-search.ts";
import { generateCacheKey } from "../_shared/search-cache-key.ts";
import { questionKey } from "../../../src/lib/seedGuard.ts";
import { isAggregatorUrl } from "../_shared/aggregators.ts";
import {
  EVIDENCE_MIN_AUDITS, JUNK_RATIO_PER_AUDIT, MAX_PER_ENGINE_CAP,
  ESTABLISHED_MIN_AUDIT_SHARE, ESTABLISHED_MIN_MENTION_SHARE, expectedPrimaryType,
  offTradeMarkForGroup, poolTargetVerdict,
  hasShapeEvidence, uncleanedNames, UNCLEANED_EXAMPLES_SHOWN,
  type MarketConcentration, type MarketNamedRow, type MarketPoolExcluded,
  type MarketPoolRow, type MarketPoolState, type MarketTier, type MarketCitationHost,
  type MarketViewResult,
  type MarketAuditProgress,
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

/** Cache TTL of search_cache, mirrored from search-leads. This no longer hides anything: a pool
 *  older than this is served as state `stale` (businesses visible, freshness gates unsatisfied)
 *  rather than refused. search-leads still re-charges Google past its own copy of this window, so
 *  the paid-search semantics are untouched — only the DISPLAY stopped throwing the data away. */
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

interface AuditRow {
  id: string; business_type: string | null; location_text: string | null; business_name: string | null;
  /** A trade-and-town audit with no business attached. Excluded from the named list and the pool
   *  subtraction; its mentions and its audit count still count. */
  is_market?: boolean | null;
}
interface RunRow { id: string; audit_id: string; status: string | null; created_at?: string | null }
interface QueueRow { id: string; run_id: string; question?: string | null; status?: string | null; result: Record<string, unknown> | null }
interface HistoryRow { id: string; keyword: string; location: string; radius: number; searched_at: string }
/** Shape search-leads stores in search_cache — a bare array, or { leads, region } for region runs. */
interface CachedLead {
  id: string; name: string; googleMapsUrl: string; websiteUrl: string | null;
  websiteStatus: string; confidence: number; reason: string;
  /** search-leads' town-only nearby pass sets this on anything outside the boundary rectangle.
   *  Absent on every row cached before that shipped, which reads as false — correct, because
   *  those pools only ever contained inside-the-rectangle results. */
  outsideTown?: boolean;
  /** What Google files this business as. Written by search-leads since 2026-08-06; absent on every
   *  row cached before that, which must never be read as "not the trade" — see offTradeMark. */
  primaryType?: string;
  primaryTypeLabel?: string;
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
      const audits = await all<AuditRow>(service, "ai_audits", "id, business_type, location_text, business_name, is_market",
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
    const allAudits = await all<AuditRow>(service, "ai_audits", "id, business_type, location_text, business_name, is_market",
      (q) => q.eq("user_id", userId));
    const audits = allAudits.filter((a) => norm(a.business_type) === trade && townKey(a.location_text) === tk);
    const auditIds = audits.map((a) => a.id);

    /* NO EARLY RETURN ON ZERO AUDITS — deliberately removed when the market view moved onto Find
       Leads as a free-text mode.
       It used to short-circuit here with pool: [] and poolState: "never_searched". Under the old
       dropdown that branch was unreachable, because the picker only offered markets that already
       had audits. Typing a trade and town freely makes it reachable, and it then LIES twice: it
       reports "never searched" for a town whose pool is sitting in the cache, and it leaves the
       run-audits button with no businesses to source. Both are the failure the three pool states
       exist to prevent. Everything below already copes with an empty audit list — the reads are
       guarded, the fold yields an empty `named`, and concentration reports audits: 0, which is what
       the page keys "no audits yet" off. */

    /* COMPLETE runs only. A failed or capped run has no answer text, so its absence of competitors
       is not evidence of a concentrated market — it is evidence of nothing. */
    const runs = auditIds.length
      // Guarded: PostgREST renders .in('audit_id', []) as `in.()`, which is a syntax error, not an
      // empty result — so a market with no audits would 400 rather than come back empty.
      ? await all<RunRow>(service, "ai_audit_runs", "id, audit_id, status, created_at", (q) => q.in("audit_id", auditIds))
      : [];
    const completeRuns = runs.filter((r) => (r.status ?? "") === "complete");
    /* WHICH AUDITS HAVE FINISHED, and which are still going. "2 audits, 1 completed run" told the
       operator nothing about the second one: whether it was mid-flight (an Apify question legitimately
       takes up to ~9 minutes) or dead. Both the evidence gate and the panel need this. */
    const marketAuditIds = new Set(audits.filter((a) => a.is_market === true).map((a) => a.id));
    const completedByAudit = new Set(
      runs.filter((r) => ["complete", "capped"].includes(r.status ?? "")).map((r) => r.audit_id),
    );
    const auditOfRun = new Map(completeRuns.map((r) => [r.id, r.audit_id]));
    const runIds = completeRuns.map((r) => r.id);

    /* -- 2. RAW COMPETITOR MENTIONS ------------------------------------------------------- */
    const queue = runIds.length
      ? await all<QueueRow>(service, "ai_audit_queue", "id, run_id, question, result", (q) => q.in("run_id", runIds))
      : [];

    const mentions: { auditId: string; name: string }[] = [];
    /** host -> citation count, for the shape read's #1-host test. */
    const hostCounts = new Map<string, number>();
    let citationTotal = 0;
    let engineBlocks = 0;
    let truncatedBlocks = 0;

    /* ── THE SCORED ANSWERS — what the pool is measured AGAINST ──────────────────────────────────
       Every chatgpt/gemini answer_text on the market's completed runs, one entry per deduped
       question per engine. The prospect list is scored by running nameMatches — the SAME function
       that decides the report verdict and the week-8 guarantee comparison — over these texts, per
       pool business. That replaces the extracted-competitor join entirely for TARGETING: no
       extraction means no junk in the scores, no fragment can bridge two firms, and no cleaning
       step (manual or LLM) is ever needed before the target list is right.
       ⚠️ chatgpt + gemini ONLY, mirroring SCORED_ENGINES in src/lib/auditReport.ts and derive-audit
       — the same engines every other named-share in the product is counted over. */
    const SCORED_ENGINES = ["chatgpt", "gemini"] as const;
    const scoredAnswers: { text: string }[] = [];

    /* ONE QUESTION, COUNTED ONCE PER RUN. Measured 2026-08-04: 18 Hastings questions held only 12
       distinct ones, because the queue treated "locksmith services in hastings uk" and "... in
       Hastings UK" as different. Two rows asking the same thing in different capitals answered the
       same way, which inflated every MENTION total and therefore the top-share percentages and the
       established/thin mention test. The generator no longer produces them (dedupeQuestions), but
       historical runs already hold them, so the fold protects itself.
       Scoped to the RUN, deliberately: the same question in a different AUDIT is a separate
       measurement of the market and still counts — which is why `audits` is the robust signal. */
    const seenPerRun = new Set<string>();
    let dupRows = 0;
    /** Deduped questions at least one engine answered — the per-question denominator. */
    let questionsAnswered = 0;
    for (const row of queue) {
      const result = row.result;
      if (!result || typeof result !== "object") continue;
      const auditId = auditOfRun.get(row.run_id);
      if (!auditId) continue;
      const qk = `${row.run_id}|${questionKey(String((row as { question?: unknown }).question ?? ""))}`;
      if (seenPerRun.has(qk)) { dupRows += 1; continue; }
      seenPerRun.add(qk);
      let answeredHere = false;
      for (const [engineKey, payload] of Object.entries(result)) {
        const block = payload as { competitors?: unknown; named?: unknown; answer_text?: unknown } | null;
        // Only real engine blocks carry `named`; this skips _apify and _cost_usd.
        if (!block || typeof block !== "object" || block.named === undefined) continue;
        /* The answer text this question produced, collected for the pool scoring above. Empty or
           missing text is simply not a scored answer — it can neither name nor fail to name. */
        if ((SCORED_ENGINES as readonly string[]).includes(engineKey)) {
          const text = typeof block.answer_text === "string" ? block.answer_text.trim() : "";
          if (text) scoredAnswers.push({ text });
        }
        /* ⛔ COUNTED HERE, NOT OFF seenPerRun.size. A question is only a question this fold measured
           if at least one ENGINE answered it — a row with a result object but no engine block
           contributed no names, and counting it would inflate the denominator of every per-question
           ratio and make a dirty market look cleaner than it is. */
        answeredHere = true;
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
        /* CITED HOSTS, from the same block. The shape read needs to know whether a marketplace
           holds the #1 host position - Checkatrade is the single most-cited source in
           plumber/Loughborough, ahead of every business's own site, which is the only signal that
           catches a market where a local firm leads the naming but a platform owns the sources.
           No extra query: these citations are already on the row. */
        const cites = (payload as { citations?: unknown })?.citations;
        if (Array.isArray(cites)) {
          for (const c of cites) {
            const url = typeof (c as { url?: unknown })?.url === "string" ? (c as { url: string }).url : "";
            if (!url) continue;
            const m = url.match(/^https?:\/\/([^/]+)/i);
            if (!m) continue;
            const host = m[1].toLowerCase().replace(/^www\./, "");
            if (!host) continue;
            hostCounts.set(host, (hostCounts.get(host) ?? 0) + 1);
            citationTotal += 1;
          }
        }
      }
      if (answeredHere) questionsAnswered += 1;
    }

    if (dupRows > 0) {
      console.log(`[market-view] ${dupRows} case-duplicate question row(s) ignored in the mention fold`);
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
      /* townOnly FIRST. The market view's own search button runs townOnly, and that is the pool
         this view wants - a radius pool includes neighbouring towns the audits never covered,
         which would put businesses in the prospect list that were never in the market being
         measured. The plain key is only a fallback, and it is reported as such. */
      for (const [tOnly, kind] of [[true, "town"], [false, "radius"]] as const) {
        const key = await generateCacheKey(last.keyword, last.location, last.radius, tOnly);
        /* ⛔ NO created_at CUTOFF ON THE READ — 2026-08-14. Filtering here is what made 113 of 123
           measured markets show no prospect at all: the businesses exist, only the cache row aged.
           Age now decides the STATE (ready vs stale), never whether the businesses are shown. A
           stale pool satisfies no freshness gate — MeasureMarket and the search-skip both key on
           state === 'ready' — so nothing spends differently because of this. */
        const { data: hit } = await service.from("search_cache")
          .select("results, created_at").eq("cache_key", key).maybeSingle();
        if (!hit?.results) continue;
        const rawRes = hit.results as unknown;
        const isRegionBlob = !!rawRes && !Array.isArray(rawRes) && Array.isArray((rawRes as { leads?: unknown }).leads);
        pool = (isRegionBlob ? (rawRes as { leads: CachedLead[] }).leads : rawRes) as CachedLead[];
        const fresh = Date.now() - new Date(String(hit.created_at)).getTime() <= POOL_TTL_MS;
        poolState = {
          state: fresh ? "ready" : "stale", scope: kind, keyword: last.keyword, radiusM: last.radius,
          searchedAt: String(hit.created_at), total: pool.length,
        };
        break;
      }
      if (poolState.state === "never_searched") {
        /* Searched, but the cache row itself is gone — pools deleted by the old nightly cleanup
           (removed 2026-08-14) or overwritten under a different key. Re-running the search is the
           only way back; the state says so. */
        poolState = { state: "expired", keyword: last.keyword, searchedAt: last.searched_at, ttlHours: POOL_TTL_MS / 3_600_000 };
      }
    }

    /* THE TOWN POOL KEEPS ITS IDENTITY. Rows tagged outsideTown came from the nearby radius pass
       and are NOT businesses in this town: they are shown separately so the boundary stops
       silently deciding who exists, without ever inflating the town's own count. */
    const poolOutside = pool.filter((p) => p?.outsideTown === true);
    pool = pool.filter((p) => p?.outsideTown !== true);
    if (poolState.state === "ready" || poolState.state === "stale") poolState = { ...poolState, total: pool.length };

    /* -- 4. TWO GROUPING PASSES, ONE PER SIDE — AND THAT IS THE 2026-08-14 FIX ---------------- */
    /* The named-intel fold groups EXTRACTED MENTION names; the pool groups PLACES names (so a
       chain's branches fold to one entry). They used to share one pass so the subtraction could
       join them — and that shared pass is exactly where junk corrupted targeting: raw fragments
       sat in the same union-find as the pool, and the single mention "Lock" bridged Lockforce,
       LockFit, Lock Around The Clock AND Aylesbury Lock and Key Centre into one 23-name group
       scored as one firm. The pool no longer joins the named list AT ALL: each pool business is
       scored directly against the stored answer text with nameMatches (section 6), so the two
       sides have nothing left to disagree about and nothing extracted can touch a target score.
       Junk cannot enter the pool pass, because its only input is Places names. */
    const ctx = buildMatchContext(trade, town);
    const groups = groupNames(mentions.map((m) => m.name), ctx);
    const idx = keyIndex(groups);
    const poolNames = [...pool, ...poolOutside].map((p) => (p?.name ?? "").trim()).filter(Boolean);
    const poolIdx = keyIndex(groupNames(poolNames, ctx));

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

    /* ── NATIONAL BRAND OR LOCAL FIRM, FROM CITATIONS ONLY ─────────────────────────────────────
       A name cited in OTHER towns for the same trade is a national brand, not a local prospect:
       Able Group, Rapid Secure UK and E-Locksmiths all appear in Hastings AND Wisbech. Evidence,
       not a hardcoded brand list (§6: facts are per-host, evidence is per-trade).
       Bounded: OTHER_TOWN_RUN_CAP runs, and the cap is REPORTED rather than swallowed, so
       otherTowns reads as a floor when it trips. */
    const OTHER_TOWN_RUN_CAP = 60;
    const townsByName = new Map<string, Set<string>>();
    let otherTownsCapped = false;
    {
      const sameTrade = await all<AuditRow>(service, "ai_audits", "id, business_type, location_text",
        (q) => q.eq("user_id", userId));
      const otherAudits = sameTrade.filter((a) =>
        norm(a.business_type) === trade && townKey(a.location_text) !== tk && !!(a.location_text ?? "").trim());
      const byAuditTown = new Map<string, string>(otherAudits.map((a) => [a.id, townKey(a.location_text)]));
      if (byAuditTown.size > 0) {
        const otherRuns = await all<RunRow>(service, "ai_audit_runs", "id, audit_id, status",
          (q) => q.in("audit_id", [...byAuditTown.keys()]).in("status", ["complete", "capped"]));
        const use = otherRuns.slice(0, OTHER_TOWN_RUN_CAP);
        otherTownsCapped = otherRuns.length > use.length;
        for (const r of use) {
          const town2 = byAuditTown.get(r.audit_id) ?? "";
          const rows = await all<QueueRow>(service, "ai_audit_queue", "id, result", (q) => q.eq("run_id", r.id));
          for (const row of rows) {
            for (const eng of Object.values(row.result ?? {})) {
              const list = (eng as { competitors?: unknown })?.competitors;
              if (!Array.isArray(list)) continue;
              for (const raw of list) {
                const nm = typeof raw === "string" ? raw.trim() : "";
                if (!nm) continue;
                const k = idx.get(nm);
                if (!k) continue;   // only names this market already knows about
                const set = townsByName.get(k) ?? new Set<string>();
                set.add(town2);
                townsByName.set(k, set);
              }
            }
          }
        }
      }
    }

    /* GRADED: established / thin / unknown.
       ⛔ THE TIER BAR AND THE SHAPE BAR MUST BE THE SAME BAR, AND FOR MONTHS THEY WERE NOT.
       This read `auditIds.length < EVIDENCE_MIN_AUDITS` — a flat 5 — while the view calls a
       market's shape on MARKET_AUDIT_MIN_AUDITS (2) market audits. So with 2 market audits the
       shape was called, every entry was graded `unknown`, and the subtraction (which keeps
       everything that is not `established`) subtracted NOTHING.
       Chichester electricians, 2 completed market audits: Chi-Lec Electrical Contractors — 23
       mentions in 2 of 2 audits, the most-named business in the market — was offered as a
       PROSPECT, alongside Swift Electrical (19), Arctic Electrical (16) and Henderson (12). The
       reconciliation line read "24 entries − 0 already named" while the rows displayed their
       mention counts, which is the tell: the matcher had matched them perfectly.

       ⚠️ THIS IS THE SAME LINE THAT DROPPED 15 NORWICH PROSPECTS, failing in the OPPOSITE
       direction. There it kept `tier === "thin"` and dropped `unknown`; here it keeps everything
       because everything IS `unknown`. One expression, two contradictory bugs, because the grade
       it tests against was computed from a different threshold than the one that decides whether
       the grades mean anything at all.

       THE FIX IS TO SHARE THE FUNCTION, NOT TO COPY THE NUMBER. hasShapeEvidence already encodes
       the whole rule — 2 market audits, or 5 business audits, or the weighted mix — and is what
       the shape gate calls. Two thresholds that must agree will drift; one function cannot.
       Paul's rule, and it settles it: if two market audits are enough to call a market's shape,
       they are enough to call a firm established within it — and if they are not, the view should
       not be calling the shape either. */
    const leaderMentions = Math.max(0, ...[...fold.values()].map((v) => v.mentions));
    const marketAuditsDone = [...completedByAudit].filter((id) => marketAuditIds.has(id)).length;
    const businessAuditsDone = [...completedByAudit].filter((id) => !marketAuditIds.has(id)).length;
    const thinMarket = !hasShapeEvidence({ marketAudits: marketAuditsDone, businessAudits: businessAuditsDone });
    const named: MarketNamedRow[] = [...fold.entries()]
      .map(([key, v]) => {
        const auditShare = auditIds.length > 0 ? v.audits.size / auditIds.length : 0;
        const mentionShare = leaderMentions > 0 ? v.mentions / leaderMentions : 0;
        const established = auditShare >= ESTABLISHED_MIN_AUDIT_SHARE && mentionShare >= ESTABLISHED_MIN_MENTION_SHARE;
        return {
          key,
          name: pickDisplayName(v.counts),
          variants: [...v.counts.keys()].sort(),
          mentions: v.mentions,
          audits: v.audits.size,
          tier: (thinMarket ? "unknown" : established ? "established" : "thin") as MarketTier,
          auditShare: Math.round(auditShare * 1000) / 1000,
          mentionShare: Math.round(mentionShare * 1000) / 1000,
          otherTowns: townsByName.get(key)?.size ?? 0,
        };
      })
      .sort((a, b) => b.audits - a.audits || b.mentions - a.mentions || a.name.localeCompare(b.name));
    const leaderRow = [...named].sort((a, b) => b.mentions - a.mentions)[0] ?? null;

    /* -- 5. CONCENTRATION -------------------------------------------------------------------- */
    const totalMentions = named.reduce((s, n) => s + n.mentions, 0);
    const byMentions = [...named].sort((a, b) => b.mentions - a.mentions);
    const share = (n: number) => (totalMentions > 0 ? Math.round((n / totalMentions) * 1000) / 10 : 0);
    /* JUNK DETECTION, not a quality score. extract-competitors cleans these with an LLM but never
       ran on the older audits, so those carry raw regex output - Wisbech accountants folds to
       thousands of "names" topped by "hmrc".
       ⛔ THE RATIO IS NO LONGER THE TEST, ONLY THE CONTEXT. Re-measured across all 20 markets
       2026-08-10: a threshold on distinct-names-per-question would have missed chorley (9.6) and
       accountant/chichester (5.8), both provably raw, while the marker-word test separates all 20
       with 39/39/33/24/18 on the dirty ones and ZERO on the other fifteen. See
       UNCLEANED_MARKER_WORDS in src/lib/marketView.ts for the whole distribution.
       ⚠️ THE MARKERS ARE COUNTED ON THE RAW MENTIONS, BEFORE THE MERGE. groupNames folds spellings
       together, so a junk fragment can end up inside a group labelled with a real firm's name and
       vanish from `named` entirely — counting there would let a dirty fold read clean. */
    const distinctPerAudit = auditIds.length > 0
      ? Math.round((named.length / auditIds.length) * 10) / 10
      : 0;
    const distinctRawNames = new Set(mentions.map((m) => m.name.trim().toLowerCase())).size;
    const markers = uncleanedNames(mentions.map((m) => m.name));
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
      questions: questionsAnswered,
      distinctPerQuestion: questionsAnswered > 0
        ? Math.round((distinctRawNames / questionsAnswered) * 10) / 10
        : 0,
      uncleanedCount: markers.length,
      uncleanedExamples: markers.slice(0, UNCLEANED_EXAMPLES_SHOWN),
      truncatedBlocks,
      engineBlocks,
      runIds,
      /* How many of these are MARKET audits. They carry more evidence weight than a business audit
         (8 questions aimed at the market vs 3 aimed at a firm), so the shape's evidence gate needs
         the split — see hasShapeEvidence in src/lib/marketView.ts. */
      marketAudits: audits.filter((a) => a.is_market === true).length,
      /* ⛔ AND HOW MANY HAVE ACTUALLY FINISHED. The evidence gate counted AUDITS, so two market
         audits with only one completed run passed the bar and the view called a shape on a single
         audit's data — the exact degeneracy the bar exists to prevent. These are the numbers the
         gate now reads. */
      marketAuditsComplete: [...completedByAudit].filter((id) => marketAuditIds.has(id)).length,
      businessAuditsComplete: [...completedByAudit].filter((id) => !marketAuditIds.has(id)).length,
    };

    /* ── WHAT EACH UNFINISHED MARKET AUDIT IS DOING ────────────────────────────────────────────
       A market audit that stalls or fails is money spent on a market the operator then believes is
       measured. Reported per audit with question progress and the RAW error string off the queue
       row — never a wrapper like "audit failed", which is what made the last one undiagnosable. */
    const unfinished = audits.filter((a) => a.is_market === true && !completedByAudit.has(a.id));
    const unfinishedRuns = runs.filter((r) => unfinished.some((a) => a.id === r.audit_id));
    /* One query for every unfinished market run's questions, not one per run. */
    const progressRows = unfinishedRuns.length
      ? await all<QueueRow>(service, "ai_audit_queue", "id, run_id, question, status, result",
        (q) => q.in("run_id", unfinishedRuns.map((r) => r.id)))
      : [];
    const marketProgress: MarketAuditProgress[] = unfinished.map((a) => {
      const myRuns = unfinishedRuns.filter((r) => r.audit_id === a.id);
      const myRunIds = new Set(myRuns.map((r) => r.id));
      const rows = progressRows.filter((row) => myRunIds.has(row.run_id));
      let done = 0, failed = 0;
      let firstError: string | null = null;
      for (const row of rows) {
        const st = row.status ?? "";
        if (st === "done") done += 1;
        if (st === "failed") failed += 1;
        /* THE RAW STRING, wherever it sits. The queue writes the error either at result.error or
           inside a per-engine block, and a catch-all wrapper is what sent the last diagnosis off
           after phantom question wording while `Apify start ... HTTP 402` sat unread. */
        if (!firstError && row.result && typeof row.result === "object") {
          const direct = (row.result as { error?: unknown }).error;
          if (typeof direct === "string" && direct) firstError = direct;
          else {
            for (const v of Object.values(row.result)) {
              const e = (v as { error?: unknown } | null)?.error;
              if (typeof e === "string" && e) { firstError = e; break; }
            }
          }
        }
      }
      return {
        auditId: a.id,
        status: myRuns.length === 0 ? "no_run" : (myRuns[0].status ?? "pending"),
        questionsDone: done,
        questionsTotal: rows.length,
        questionsFailed: failed,
        startedAt: myRuns[0]?.created_at ?? null,
        error: firstError,
      };
    });

    /* CITED HOSTS, biggest first. Only the top few are needed (the shape read uses position 1),
       but a handful is useful context on screen. isAggregatorUrl is the same classifier the audit
       report uses, so "directory or marketplace" means one thing across the app. */
    const citationHosts: MarketCitationHost[] = [...hostCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8)
      .map(([host, citations]) => ({ host, citations, isAggregator: isAggregatorUrl(`https://${host}/`) }));

    /* -- 6. TARGETS = the scraped list, scored by nameMatches against the stored answers ------ */
    /* ⛔ NO EXTRACTED NAME IS AN INPUT HERE — 2026-08-14, Paul's targeting fix. Each pool business
       is scored the way an audited business is: nameMatches over every stored chatgpt/gemini
       answer_text. That is the same verdict the report and the week-8 guarantee comparison use, so
       targeting and the report can never disagree about whether AI names somebody. The old path
       joined the pool to the EXTRACTED competitor fold and subtracted "established" entries —
       leader-relative thresholds over junk-polluted, junk-bridged groups; see section 4. */
    // Chains: pool rows sharing a group key are one company. Ten Timpson branches are one entry
    // with a branch count, not ten prospects. Derived from repetition - no chain list anywhere.
    const poolGroups = new Map<string, { variants: string[]; ids: string[]; websiteless: number; rows: CachedLead[]; sample: CachedLead }>();
    for (const p of pool) {
      const nm = (p?.name ?? "").trim();
      if (!nm) continue;
      const k = poolIdx.get(nm);
      if (!k) continue;
      const g = poolGroups.get(k) ?? { variants: [], ids: [], websiteless: 0, rows: [], sample: p };
      g.variants.push(nm);
      g.ids.push(p.id);
      g.rows.push(p);
      if (p.websiteStatus === "NO_WEBSITE") g.websiteless += 1;
      poolGroups.set(k, g);
    }

    /* WHAT GOOGLE CALLS MOST OF THIS MARKET. Computed across the WHOLE in-town pool, named and
       unnamed alike, because the firms AI already names are the ones most certainly the trade and
       they should get a vote. Null whenever the pool has no consensus, in which case NOTHING is
       marked. Not stored: it is a property of the pool in front of the operator, and storing it
       would freeze one search's consensus onto the next. */
    const expectedType = expectedPrimaryType(pool);

    /* THE SCORE. One count per pool entry: in how many of the market's scored answers does
       nameMatches find it (any branch spelling counts, an answer counts once). The denominator is
       shared by every row, so ordering by the count IS ordering by the share. */
    const nameCtx = { trade, town };
    const answersTotal = scoredAnswers.length;
    const namedAnswersFor = (variants: string[]): number => {
      const distinct = [...new Set(variants)];
      let n = 0;
      for (const a of scoredAnswers) {
        if (distinct.some((v) => nameMatches(a.text, v, nameCtx))) n++;
      }
      return n;
    };

    const notNamed: MarketPoolRow[] = [];
    /* EVERY EXCLUSION IS ITEMISED. A silent exclusion is as dangerous as a silent inclusion - it is
       how a real prospect disappears. Each excluded entry carries its score, so the operator can
       disagree with the cut by reading the number beside the name. */
    const poolExcluded: MarketPoolExcluded[] = [];
    for (const [key, g] of poolGroups) {
      const answersNamed = namedAnswersFor(g.variants);
      const row: MarketPoolRow = {
        key,
        name: pickDisplayNameFromList(g.variants),
        branches: g.variants.length,
        isChain: g.variants.length > 1,
        placeIds: g.ids,
        /* EVERY branch, not any branch. `> 0` flagged a whole chain entry as websiteless
           because ONE of its branches had no site on its Places listing, which is a wrong badge on
           an entry that plainly has a website. An entry has no website only if none of its
           branches does. Single-business entries are unaffected: 1 of 1 either way. */
        noWebsite: g.websiteless === g.variants.length,
        googleMapsUrl: g.sample.googleMapsUrl,
        websiteUrl: g.sample.websiteUrl,
        offTrade: offTradeMarkForGroup(g.rows, expectedType),
        answersNamed,
        answersTotal,
      };
      /* ⛔ ONLY `winning` IS EXCLUDED. `target` stays, and so does `unmeasured` (zero scored
         answers) — with nothing measured, nothing is subtracted AND nothing is claimed, which the
         panel's completed-runs gate already states out loud. poolTargetVerdict owns the boundary
         (TARGET_MAX_NAMED_SHARE, inclusive), so this file cannot drift from the tests. */
      if (poolTargetVerdict(answersNamed, answersTotal) === "winning") {
        poolExcluded.push({ name: row.name, branches: row.branches, answersNamed, answersTotal });
        continue;
      }
      notNamed.push(row);
    }
    /* NEARBY, OUTSIDE THE BOUNDARY. Same grouping and the same score, its own list — so a nearby
       firm AI already names reads as such and is never pitched blind, without ever inflating the
       town's own counts. */
    const nearbyGroups = new Map<string, { variants: string[]; ids: string[]; websiteless: number; rows: CachedLead[]; sample: CachedLead }>();
    for (const p of poolOutside) {
      const nm = (p?.name ?? "").trim();
      if (!nm) continue;
      const k = poolIdx.get(nm);
      if (!k) continue;
      const g = nearbyGroups.get(k) ?? { variants: [], ids: [], websiteless: 0, rows: [], sample: p };
      g.variants.push(nm);
      g.ids.push(p.id);
      g.rows.push(p);
      if (p.websiteStatus === "NO_WEBSITE") g.websiteless += 1;
      nearbyGroups.set(k, g);
    }
    const poolNearby: MarketPoolRow[] = [...nearbyGroups.entries()].map(([key, g]) => {
      return {
        key,
        name: pickDisplayNameFromList(g.variants),
        branches: g.variants.length,
        isChain: g.variants.length > 1,
        placeIds: g.ids,
        noWebsite: g.websiteless === g.variants.length,   // see the note above: every branch, not any
        googleMapsUrl: g.sample.googleMapsUrl,
        websiteUrl: g.sample.websiteUrl,
        offTrade: offTradeMarkForGroup(g.rows, expectedType),
        outsideTown: true,
        answersNamed: namedAnswersFor(g.variants),
        answersTotal,
      };
    }).sort((a, b) => a.answersNamed - b.answersNamed || a.name.localeCompare(b.name));

    /* Worst first: never-named at the top, then by how rarely they are named. The completely
       invisible are the strongest pitch. noWebsite breaks ties because it is a different opening,
       and the panel lists those separately anyway. */
    notNamed.sort((a, b) =>
      a.answersNamed - b.answersNamed ||
      Number(b.noWebsite) - Number(a.noWebsite) ||
      a.name.localeCompare(b.name));
    poolExcluded.sort((a, b) => b.answersNamed - a.answersNamed);
    const alreadyNamed = poolExcluded.length;

    /* ⛔ TYPED, AND THAT IS THE WHOLE POINT. This object used to be an untyped literal, and three
       values computed above it — marketProgress, poolNearby, citationHosts — were simply never
       added to it. All three were optional on the interface, so nothing anywhere complained: the
       SPA read undefined, defaulted to [], and displayed "nothing running" / "none nearby" /
       "no hosts" for months. The measure bar surviving a reload, which deriveRun exists for, has
       never once worked in production.
       Annotating the payload makes a missing field a compile error. Keep the annotation. */
    const payload: MarketViewResult = {
      ok: true, trade, town,
      concentration,
      marketProgress,
      poolNearby,
      citationHosts,
      citationTotal,
      named,
      leader: leaderRow ? { name: leaderRow.name, mentions: leaderRow.mentions } : null,
      otherTownsCapped,
      pool: notNamed,
      poolState,
      poolMatchedNamed: alreadyNamed,
      poolExcluded,
      /* MARKET AUDITS ARE NOT BUSINESSES. Their sentinel name ("[market] locksmiths · Hastings")
         must never appear in a list of audited businesses. Their competitor mentions DO count —
         that is the entire point of them — and so does their contribution to `audits`, because a
         market audit is a legitimate measurement of the market. */
      /* A type PREDICATE, not `.filter(Boolean)`. The behaviour is identical at runtime — the first
         thing the annotation above caught was that business_name is nullable and `.filter(Boolean)`
         does not narrow it, so the declared string[] was a lie the untyped literal had been telling
         all along. A cast would have silenced it; this states the guarantee instead. */
      auditedBusinesses: audits
        .filter((a) => a.is_market !== true)
        .map((a) => a.business_name)
        .filter((n): n is string => typeof n === "string" && n.length > 0),
    };
    return json(payload);
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    console.error("[market-view]", raw);
    return json({ ok: false, error: raw }, 200);
  }
});
