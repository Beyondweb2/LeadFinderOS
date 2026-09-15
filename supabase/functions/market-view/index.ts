import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isAggregatorUrl } from "../_shared/aggregators.ts";
import { cellNamed } from "../../../src/lib/namedSignal.ts";
import { classifyWinnability, unwrapCitationUrl, DISPLAY_ENGINES, type EngineMap } from "../../../src/lib/auditReport.ts";

/* ⛔ THE TWO SCORED ENGINES ONLY, for the slot read. AI Overview and Google organic are captured
   but never scored, and §5's pages-move-Gemini evidence says nothing about them — reading slots
   off an engine whose behaviour we have never measured would put an unevidenced number at the top
   of the screen. Same restriction the opportunity-engine filter already applies. */
const SCORED_SLOT_ENGINES = ["chatgpt", "gemini"] as const;
import { majorityVerdict, type WinnVerdict } from "../../../src/lib/pagePlanQueue.ts";
import { classifySource } from "../../../src/lib/sourceType.ts";
import { nicheTradeKey, ENGINE_LABELS_NICHE } from "../../../src/lib/nicheView.ts";
/* 🔴 §6b's NAME TEST, RESTORED AND WIRED HERE (2026-09-15, Paul's brief). `named` is
   nameMatches(answer_text, businessName) at scan time, so a business CALLED "Blackpool Plumber"
   scores on an answer about plumbers in Blackpool without the engine having any idea who they are.
   Those audits inflated every naming rate this fold produces — measured across the whole book they
   score roughly DOUBLE the judgeable ones. They are excluded from the rates now and counted where
   the operator can see them. ⛔ Derived on read; no stored score is touched.
   ✅ AND SINCE LATER THE SAME DAY THE FOLD NO LONGER HAS TO GUESS: cellNamed() (namedSignal.ts)
   reads the MODEL's self_named where extract-competitors has recorded one. The exclusion above
   still applies — a name that is all trade and town with no model verdict is still unjudgeable —
   but a backfilled audit now contributes a real number instead of being dropped. */
import { nameIsJudgeable } from "../_shared/derivable.ts";
/* ⛔ src/lib/marketView.ts IS NO LONGER IMPORTED HERE, AND THAT IS THE POINT OF THE 2026-09-09
   PRUNE. This file used to pull seventeen symbols out of it — every one of them for the deleted
   `view` action. The `niche` fold referenced none of them, so the market panel's whole evidence
   apparatus (pool states, tiers, fragmentation, off-trade marks, uncleaned-name folds) came down
   with the action it served. marketView.ts is now a cost-constants leaf; if a future change here
   wants one of those folds back, that is a decision to re-open the market view, not an import. */
/* ============================================================
   THE NICHE VERDICT — is this TRADE worth outreaching to?

   ⚠️ THE NAME IS NOW WIDER THAN THE JOB, AND IT IS KEPT ON PURPOSE. This was the per-town market
   view; the `view` and `options` actions were deleted 2026-09-09 with MarketPanel, leaving the
   one fold that answers the only question the market view was ever for. Renaming the function
   would mean a deploy under a new slug plus a delete of this one, and NichePanel's invoke would
   be broken for the window between them — a rename is not worth an outage on a live read.

   READ ONLY. It calls no vendor API and writes no row: every number was already paid for by an
   audit that has already run. So the SPA may load it on opening the panel — see CLAUDE.md §6e's
   rule that opening a view never spends.

   ONE ACTION: `niche` — a trade folded across EVERY town holding its audits. Per-engine named
   rates, winnability counts (majorityVerdict over per-run classifyWinnability), and the
   directory-vs-own-site source split that §5's model turns on.

   ── WHY THE FOLD IS SERVER-SIDE ──────────────────────────────────────────────────────────────
   Competitor names live in ai_audit_queue.result, jsonb, one row per question per run. The anon
   key cannot read most of it (RLS returns 200 with [], not an error — an empty trade would be
   indistinguishable from a blocked one), and the table is well past the 1000-row PostgREST
   truncation point. Same reasoning, and the same paginated read, as playbook-evidence.
   ============================================================ */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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
    /* ⚠️ NO DEFAULT ACTION. It used to default to "view", which is now deleted — so an absent
       action would have been refused with `unknown action "view"`, blaming the caller for a word
       it never sent. An empty action is reported as absent, which is what it is. */
    const action = typeof body.action === "string" ? body.action.trim() : "";
    /* ⛔ ONE ACTION REMAINS, AND THE OTHER TWO WERE DELETED 2026-09-09 WITH THE MARKET PANEL.
       `view` (the per-town market read, ~635 lines) and `options` (the trade+town picker that fed
       it) had NO caller left once MarketPanel went: the niche verdict answers the only question
       the market view existed for — "is this trade worth outreaching to" — and it is trade-wide,
       so it never needed a town. Verified before cutting: the `niche` branch below referenced
       ZERO of the seventeen symbols this file used to import from src/lib/marketView.ts.
       ⚠️ An unknown action is REFUSED by name rather than falling through to a default. A stale
       SPA asking for "view" gets a 400 that says so, which is diagnosable; the old code's
       `action ?? "view"` default would have silently run a read that no longer exists. */
    if (action !== "niche") {
      return json({ ok: false, error: action
        ? `unknown action "${action}" — this function serves "niche" only`
        : 'action required — this function serves "niche" only' }, 400);
    }


    /* ══ NICHE — the outreach decision engine's read-only fold (Phase 1, 2026-08-28, Paul's spec).
       One trade folded across EVERY town holding its audits: per-engine named rates, winnability
       counts (majorityVerdict over per-run classifyWinnability), and the directory-vs-own-site
       source split — the hand-run plumber recon, automatic and repeatable.
       ⛔ DERIVED ON READ, never stored. ⛔ BUSINESS AUDITS ONLY for the numbers: market audits'
       `named` was matched against a pseudo-name and would dilute the rates with structural zeros;
       they are counted separately as Phase-2 intel. Zero spend: pure reads. ═══════════════════ */
    {
      const tradeIn = typeof body.trade === "string" ? body.trade.trim() : "";
      const key = nicheTradeKey(tradeIn);
      if (!key) return json({ ok: false, error: "trade required" }, 400);

      const audits = await all<AuditRow & { website?: string | null; baseline_target_runs?: number | null; created_at?: string }>(
        service, "ai_audits", "id, business_type, location_text, business_name, is_market, website, baseline_target_runs, created_at",
        (q) => q.eq("user_id", userId));
      const mine = audits.filter((a) => nicheTradeKey(a.business_type) === key && a.is_market !== true);
      const marketAudits = audits.filter((a) => nicheTradeKey(a.business_type) === key && a.is_market === true).length;
      if (mine.length === 0) return json({ ok: true, niche: null, marketAudits, reason: "no business audits for this trade yet" });

      const auditIds = new Set(mine.map((a) => a.id));
      const runs = await all<{ id: string; audit_id: string; status: string }>(
        service, "ai_audit_runs", "id, audit_id, status", (q) => q.in("status", ["complete", "capped"]));
      const wantedRuns = runs.filter((r) => auditIds.has(r.audit_id)).map((r) => r.id);
      const qrows: { audit_id: string; run_id: string; question: string; result: unknown }[] = [];
      for (let i = 0; i < wantedRuns.length; i += 40) {
        const batch = wantedRuns.slice(i, i + 40);
        qrows.push(...await all<{ audit_id: string; run_id: string; question: string; result: unknown }>(
          service, "ai_audit_queue", "audit_id, run_id, question, result",
          (q) => q.in("run_id", batch).eq("status", "done")));
      }

      const hostOf = (u: string): string => { try { return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };
      const auditById = new Map(mine.map((a) => [a.id, a]));
      const byAudit = new Map<string, typeof qrows>();
      for (const r of qrows) (byAudit.get(r.audit_id) ?? byAudit.set(r.audit_id, []).get(r.audit_id)!).push(r);

      const engNamed: Record<string, [number, number]> = {};
      const srcSplit: Record<string, { directory: number; ownSite: number; authority: number; other: number; total: number }> = {};
      /* ⛔ SLOT CHURN — one entry per engine, accumulated over questions that were asked MORE THAN
         ONCE. A single-run question cannot show whether a name is entrenched or passing through,
         so it contributes nothing here rather than counting as "held". */
      const slotAgg: Record<string, { qs: number; names: number; held: number }> = {};
      const domCount: Record<string, Map<string, number>> = {};
      const winnability: Record<string, number> = {};
      const townAgg = new Map<string, { town: string; businesses: Set<string>; audits: number; cells: number }>();
      const bizNames = new Set<string>();
      let cellsTotal = 0, questionsTotal = 0, multiRunAudits = 0, multiRunQuestions = 0, auditsWithAnswers = 0;
      /* The excluded set, kept separately so the refusal is a number on the screen and never a
         silent shrink — the same rule the market view's off-trade and already-winning lists follow. */
      const unjudgeableNames = new Set<string>();
      let unjudgeableAudits = 0;

      for (const a of mine) {
        const rows = byAudit.get(a.id) ?? [];
        if (rows.length === 0) continue;
        /* ⛔ THE NAME DECIDES WHETHER THIS AUDIT MAY VOTE ON NAMING, NOT WHETHER IT IS READ. Its
           citations say which sources the engines read for this trade, and that fact is entirely
           independent of what the business is called — so sources, top domains and the slot read
           still take it. Only `named` (and winnability, which counts it) are refused. */
        const judgeable = nameIsJudgeable({
          businessName: a.business_name, trade: a.business_type, town: a.location_text,
        });
        if (!judgeable) { unjudgeableAudits++; unjudgeableNames.add((a.business_name ?? "").trim().toLowerCase()); }
        if (judgeable) auditsWithAnswers++;
        const isMulti = (a.baseline_target_runs ?? 0) > 1;
        if (isMulti && judgeable) multiRunAudits++;
        if (judgeable) bizNames.add((a.business_name ?? "").toLowerCase());
        const townRaw = (a.location_text ?? "").trim() || "(unknown town)";
        const tKey = townRaw.toLowerCase();
        const tAgg = townAgg.get(tKey) ?? { town: townRaw, businesses: new Set<string>(), audits: 0, cells: 0 };
        if (judgeable) { tAgg.audits++; tAgg.businesses.add((a.business_name ?? "").toLowerCase()); }
        const own = hostOf(String(a.website ?? ""));
        const byQ = new Map<string, EngineMap[]>();
        for (const r of rows) {
          const res = (r.result ?? {}) as EngineMap;
          (byQ.get(r.question) ?? byQ.set(r.question, []).get(r.question)!).push(res);
          for (const e of DISPLAY_ENGINES) {
            const er = (res as Record<string, { named?: boolean; citations?: { url?: string }[] } | undefined>)[e];
            if (!er) continue;
            if (judgeable) {
              engNamed[e] = engNamed[e] ?? [0, 0];
              engNamed[e][1]++; cellsTotal++; tAgg.cells++;
              if (cellNamed(er)) engNamed[e][0]++;
            }
            srcSplit[e] = srcSplit[e] ?? { directory: 0, ownSite: 0, authority: 0, other: 0, total: 0 };
            domCount[e] = domCount[e] ?? new Map();
            for (const c of (er.citations ?? [])) {
              const h = hostOf(unwrapCitationUrl(c?.url ?? "")); if (!h) continue;
              domCount[e].set(h, (domCount[e].get(h) ?? 0) + 1);
              srcSplit[e].total++;
              // Order matters and mirrors the hand recon exactly: own site first, then directory,
              // then authority split OUT of "other" (extra detail; dir/own axes unchanged).
              if (own && h.endsWith(own)) srcSplit[e].ownSite++;
              else if (isAggregatorUrl(`https://${h}/`)) srcSplit[e].directory++;
              else if (classifySource(h) === "authority") srcSplit[e].authority++;
              else srcSplit[e].other++;
            }
          }
        }
        if (judgeable) questionsTotal += byQ.size;
        for (const [, runResults] of byQ) {
          if (isMulti && judgeable && runResults.length > 1) multiRunQuestions++;
          const verdicts = runResults.map((res) => {
            const v = classifyWinnability(res, {
              businessName: a.business_name ?? "", locationText: a.location_text ?? "",
              ownWebsite: String(a.website ?? ""), isAggregatorUrl,
            }).verdict;
            return (v === "no-local-race" ? "no_local_race" : v) as WinnVerdict;
          });
          const m = majorityVerdict(verdicts);
          /* ⛔ WINNABILITY READS `named` TOO — classifyWinnability's first branch is "were they
             named". An unjudgeable name would file its own questions under `named` and make the
             trade look more taken than it is, which is the same inflation in the column Paul picks
             towns from. Excluded on the same predicate, never on a second one. */
          if (judgeable) winnability[m] = (winnability[m] ?? 0) + 1;
          /* ⛔ THE FREE-SLOT READ. `runResults` is this ONE question across its runs, so the same
             question's competitor lists can be compared run to run — which is the only way to tell
             a firm that holds a slot from one that happened to appear once.
             ⚠️ 2+ RUNS OR NOTHING. With a single run every name looks "held every run", which would
             read as total entrenchment and is the exact inversion of the truth. */
          if (runResults.length > 1) {
            for (const e of SCORED_SLOT_ENGINES) {
              const perRun = runResults
                .map((res) => (res as Record<string, { competitors?: unknown } | undefined>)[e])
                .filter((d): d is { competitors?: unknown } => !!d)
                .map((d) => new Set((Array.isArray(d.competitors) ? d.competitors : [])
                  .map((c) => String(c ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim())
                  .filter((c) => c.length >= 3)));
              if (perRun.length < 2) continue;
              const count = new Map<string, number>();
              for (const set of perRun) for (const n of set) count.set(n, (count.get(n) ?? 0) + 1);
              const agg = slotAgg[e] ?? { qs: 0, names: 0, held: 0 };
              agg.qs += 1;
              agg.names += perRun.reduce((n, set) => n + set.size, 0) / perRun.length;
              agg.held += [...count.values()].filter((c) => c === perRun.length).length;
              slotAgg[e] = agg;
            }
          }
        }
        townAgg.set(tKey, tAgg);
      }

      /* ⛔ EVERY AUDIT UNJUDGEABLE IS A REFUSAL, NOT A ZERO. Without this the panel would render
         0 named of 0 answered and read as "AI names nobody in this trade" — the absent-value
         inversion, on the number that decides whether a trade is worth working. */
      if (auditsWithAnswers === 0) {
        return json({
          ok: true, niche: null, marketAudits,
          reason: unjudgeableAudits > 0
            ? `${unjudgeableAudits} audit${unjudgeableAudits === 1 ? "" : "s"} for this trade, but every business name is only its trade and town — nothing here can say whether AI named them`
            : "no answered business audits for this trade yet",
        });
      }

      const engines = DISPLAY_ENGINES
        .filter((e) => engNamed[e])
        .map((e) => ({ engine: e, label: ENGINE_LABELS_NICHE[e] ?? e, named: engNamed[e][0], answered: engNamed[e][1] }));
      const sources = Object.entries(srcSplit).map(([e, s]) => ({ engine: e, label: ENGINE_LABELS_NICHE[e] ?? e, ...s }));
      /* Means, not totals: the consumer reads "names per answer", and a raw sum would make a niche
         with more questions look more crowded. An engine with no readable question is OMITTED
         rather than sent as zero — absent is not "no slots". */
      const slots = Object.entries(slotAgg)
        .filter(([, v]) => v.qs > 0)
        .map(([e, v]) => ({
          engine: e, label: ENGINE_LABELS_NICHE[e] ?? e,
          readableQuestions: v.qs,
          namesPerAnswer: v.names / v.qs,
          heldEveryRun: v.held / v.qs,
        }));
      const topDomains = Object.fromEntries(Object.entries(domCount).map(([e, m]) =>
        [e, [...m.entries()].sort((x, y) => y[1] - x[1]).slice(0, 10).map(([domain, count]) => ({ domain, count }))]));

      const niche = {
        trade: tradeIn, tradeKey: key, slots,
        sample: {
          audits: auditsWithAnswers, businesses: bizNames.size,
          towns: [...townAgg.values()].filter((t) => t.audits > 0).length,
          questions: questionsTotal, cells: cellsTotal, multiRunAudits, multiRunQuestions,
          /* ⛔ ITEMISED, NOT SILENT. These audits exist and were read; what they cannot do is vote
             on whether AI names a business, because their name IS the trade and the town. */
          nameNotJudgeable: unjudgeableAudits,
          nameNotJudgeableBusinesses: [...unjudgeableNames].filter(Boolean).length,
        },
        engines, winnability, sources, topDomains,
        towns: [...townAgg.values()]
          /* A town whose only audits were unjudgeable has nothing to say about naming; listing it
             at "0 audits" would read as a measured zero. */
          .filter((t) => t.audits > 0)
          .map((t) => ({ town: t.town, businesses: t.businesses.size, audits: t.audits, cells: t.cells }))
          .sort((x, y) => y.cells - x.cells),
        marketAudits,
      };
      return json({ ok: true, niche });
    }

  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    console.error("[market-view]", raw);
    return json({ ok: false, error: raw }, 200);
  }
});
