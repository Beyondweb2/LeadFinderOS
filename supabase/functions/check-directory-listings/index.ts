import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { startApifyRun, getApifyRun, getApifyRunItems } from "../_shared/enrichment/apify.ts";
import { AI_SEARCH_ACTOR, toCountryCode } from "../_shared/enrichment/ai-search.ts";
import { norm } from "../../../src/lib/buildPlaybook.ts";
import {
  gatingFor, hostnameOf, hostMatches,
  type DirectoryFoundRow, type DirectoryHostRow, type DirectoryNotFoundRow,
} from "../../../src/lib/directoryHosts.ts";

/* ============================================================
   ACTIVE DIRECTORY CHECK — does this business ALREADY have a listing on the directories the
   engines actually cite for its trade?

   ON DEMAND ONLY. No cron, no bulk, no run-on-create, no automatic re-run. One click, one charge.

   WHY IT EXISTS. The playbook hands out directory work derived from trade-level citations, with no
   idea whether the business is already on any of them. That wastes the operator's hour and, worse,
   makes the printed header lie about how much work there is.

   ── DELIBERATE DEPARTURES FROM THE ORIGINAL TASKS.md SPEC, ALL APPROVED ──────────────────────────
   1. TWO BROAD QUERIES, not one `site:<host>` search per host. Eight hosts would have meant eight
      Apify runs — roughly eight times the cost — for an answer two searches and honest hostname
      matching already give.
   2. ORGANIC-ONLY ACTOR INPUT, not buildAiSearchInput. That helper switches ChatGPT and Gemini
      add-ons ON, which this check never reads. Paying for two AI engines to find out whether a
      business is on Yell would be money burnt. Same actor, cheaper input.
   3. NO PROFILE-vs-SEARCH-PAGE HEURISTIC. A broad search can surface a directory's own search page
      rather than the business's profile. Guessing which is which would classify silently and
      wrongly, so the full URL is stored and displayed and the operator judges by clicking.
   ============================================================ */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/* Hosts per check. RAISED 8 → 25, and the reasoning matters: the two queries are the whole spend,
   and matching hostnames against the results they already returned is free. Checking 25 hosts costs
   exactly what checking 2 costs. There are no slots to conserve, so the only reason to cap at all
   is to keep the stored row and the panel readable. */
const MAX_HOSTS = 25;
/** Refuse at or above this. Apify runs the audits AND the lead scraping; a full cap stops BOTH, so
 *  a directory check must never be the thing that tips it over. Matches USAGE_CRITICAL_PCT. */
const REFUSE_AT_PCT = 0.90;
/** Two actor runs. Priced off the measured per-question audit cost, which uses the same actor —
 *  ~$0.0125 each with the AI add-ons ON, so organic-only is at or under this. ~8p total, stated to
 *  the operator before anything is spent. NOT a billed figure: it is an estimate and stored as one. */
const COST_PER_QUERY_USD = 0.05;
const RUN_POLL_MS = 3_000;
/** 60s, DOWN FROM 90s. The two runs now go out CONCURRENTLY, so the worst case is ONE timeout plus
 *  overhead instead of two stacked. Two sequential 90s runs gave a 180s ceiling against the ~150s
 *  edge wall clock (see seo-scan-core.ts:12, bulk-jobs:36) — on a slow day the isolate would have
 *  been killed with both searches paid for and nothing written at all. */
const RUN_TIMEOUT_MS = 60_000;

/** One search, as stored in raw_results.apify_runs. The run_id is the whole point: it is written to
 *  the row the moment Apify hands it over, so a dataset stays openable in the Apify console even if
 *  this function never gets to finish. */
interface QueryAttempt {
  query: string;
  run_id: string | null;
  state: "started" | "succeeded" | "failed" | "start_failed";
  billed_usd: number | null;
  error: string | null;
}

const reasonOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Organic-only input for apify~google-search-scraper. No chatGptSearch / geminiSearch blocks —
 *  that is the whole cost saving. Organic IS the actor's base output; there is no toggle to add.
 *
 *  ⚠️ `resultsPerPage` WAS HERE AND IT DOES NOT EXIST. Checked against the actor's published input
 *  schema (api.apify.com/v2/actor-builds/<latest>): the valid fields are queries, maxPagesPerQuery,
 *  countryCode, searchLanguage, languageCode, locationUule, forceExactMatch, site, … — no
 *  resultsPerPage. It was being silently ignored, so the run returned ONE page, "approximately 10
 *  results" in the actor's own words. Removed rather than left as decoration.
 *
 *  maxPagesPerQuery stays at 1 DELIBERATELY: each extra page is another SERP fetch and roughly
 *  another unit of spend, so raising it is a cost decision for the operator, not a silent change.
 *  See the note in the report — with 25 hosts to match against, 2 pages may be worth it. */
function buildOrganicSearchInput(query: string, countryCode: string): Record<string, unknown> {
  return {
    queries: query,
    countryCode: (countryCode || "gb").toLowerCase(),
    maxPagesPerQuery: 1,
    languageCode: "en",
  };
}

interface OrganicHit { url: string; title: string | null }

/** Pull organic results out of a raw dataset item. The actor nests them under organicResults
 *  (older shapes used `results`), each with url + title. */
function organicHits(items: unknown[]): OrganicHit[] {
  const out: OrganicHit[] = [];
  for (const raw of items) {
    const item = (raw ?? {}) as Record<string, unknown>;
    const list = item["organicResults"] ?? item["results"];
    if (!Array.isArray(list)) continue;
    for (const r of list) {
      const rec = (r ?? {}) as Record<string, unknown>;
      const url = typeof rec.url === "string" ? rec.url : "";
      if (!url) continue;
      out.push({ url, title: typeof rec.title === "string" ? rec.title : null });
    }
  }
  return out;
}

/** START one actor run and return its id AT ONCE, before any polling. Split out of the old
 *  start-and-poll helper for one reason: the id has to be persisted before we spend time waiting
 *  on it, or an interrupted poll loses the only handle on a run that has already been paid for. */
async function startQuery(query: string, countryCode: string, token: string): Promise<string> {
  const { runId } = await startApifyRun(AI_SEARCH_ACTOR, buildOrganicSearchInput(query, countryCode), token);
  return runId;
}

/** Poll an already-started run to completion and pull its items. Returns what Apify says it cost.
 *  Throws with the REAL message on any failure. */
async function awaitRun(
  runId: string,
  token: string,
): Promise<{ items: unknown[]; billedUsd: number | null }> {
  const deadline = Date.now() + RUN_TIMEOUT_MS;
  for (;;) {
    if (Date.now() > deadline) throw new Error(`Apify run ${runId} timed out after ${RUN_TIMEOUT_MS / 1000}s`);
    await new Promise((r) => setTimeout(r, RUN_POLL_MS));
    const run = await getApifyRun(runId, token);
    if (run.status === "SUCCEEDED") {
      /* usageTotalUsd is Apify's OWN figure for this run, and it comes back on the status poll we
         were making anyway — free. Preferred over the estimate wherever present, because a stored
         guess is exactly how the audit cost came to be wrong by 5x in both directions. */
      return { items: await getApifyRunItems(runId, token), billedUsd: run.usageTotalUsd };
    }
    if (run.status === "FAILED" || run.status === "ABORTED" || run.status === "TIMED-OUT") {
      throw new Error(`Apify run ${runId} ${run.status}`);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Declared out here so the catch-all can still write a row against the right lead.
  let leadId = "";
  let userId = "";
  /** The pending row's id, once money is committed. Its presence is what tells the catch-all to
   *  UPDATE rather than INSERT — one click must never leave two rows. */
  let checkId = "";

  /** Close the pending row out, whichever way the check ended. */
  const finish = (id: string, patch: Record<string, unknown>) =>
    service.from("lead_directory_checks")
      .update({ ...patch, checked_at: new Date().toISOString() })
      .eq("id", id);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return json({ ok: false, error: "Auth required" }, 401);
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ ok: false, error: "Auth required" }, 401);
    userId = u.user.id;

    const body = await req.json().catch(() => ({}));
    leadId = typeof body.lead_id === "string" ? body.lead_id.trim() : "";
    if (!leadId) return json({ ok: false, error: "lead_id required" }, 400);

    /* OWNERSHIP. Service role bypasses RLS, so the check is explicit — a caller must not be able to
       spend money running a search against somebody else's lead. */
    const { data: lead } = await service
      .from("outreach_leads")
      .select("id, user_id, business_name, search_keyword, category, search_location, derived_town, address, country")
      .eq("id", leadId).eq("user_id", userId).maybeSingle();
    if (!lead) return json({ ok: false, error: "Lead not found, or not yours." }, 404);

    const businessName = String(lead.business_name ?? "").trim();
    if (!businessName) return json({ ok: false, error: "This lead has no business name to search for." }, 400);

    /* TRADE + TOWN, resolved the SAME way the rest of the system does. Town prefers the town the
       business is IN over the town that was searched — the searched town is a property of my query.
       (There is no audit row in scope here, so derived_town is the best available answer.) */
    const tradeRaw = String(lead.search_keyword ?? lead.category ?? "").trim();
    const trade = norm(tradeRaw);
    const town = String(lead.derived_town ?? lead.search_location ?? "").trim();
    if (!trade) return json({ ok: false, error: "This lead has no trade recorded, so there is no directory list to check against." }, 400);

    /* ── SPEND GATE, BEFORE ANY CALL ────────────────────────────────────────────────────────────
       Same snapshot the AI Audit page shows. Apify runs the audits and the lead scraping too, so a
       directory check must never be what tips the account over. Refuse WITH the live figure.

       ⚠️ IT NOW REFUSES ON A MISSING OR UNREADABLE SNAPSHOT TOO. This was `if (usage)` guarding a
       `cap > 0` test, so no row — or a null cap — skipped the gate entirely and the search went
       ahead blind. With single-digit dollars of headroom that is the wrong default: not knowing the
       balance is a reason to STOP, not a reason to spend. No cap is ever guessed or defaulted. */
    const { data: usage, error: usageErr } = await service
      .from("apify_account_usage")
      .select("monthly_usage_usd, max_monthly_usage_usd, cycle_end")
      .order("captured_at", { ascending: false }).limit(1).maybeSingle();

    const used = Number(usage?.monthly_usage_usd ?? NaN);
    const cap = Number(usage?.max_monthly_usage_usd ?? NaN);
    const blind = !!usageErr || !usage || !Number.isFinite(used) || !Number.isFinite(cap) || cap <= 0;
    // Recomputed from used/cap, never the stored pct — the cap can be RAISED mid-cycle and the
    // stored figure is only true for the cap in force when the row was written.
    const pct = blind ? 1 : used / cap;

    if (blind || pct >= REFUSE_AT_PCT) {
      const why = usageErr ? `read failed: ${usageErr.message}`
        : !usage ? "there is no apify_account_usage row at all"
        : "the newest row has no usable spend or cap figure";
      const line = blind
        ? `Refused: the Apify spend snapshot is unreadable, so there is no way to tell how much headroom is left (${why}). Nothing was spent.`
        : `Apify is at ${(pct * 100).toFixed(1)}% of its monthly cap ($${used.toFixed(2)} of $${cap.toFixed(2)})`
          + (usage?.cycle_end ? `, resetting ${new Date(String(usage.cycle_end)).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}` : "")
          + ". Refused: audits and lead scraping share this account and both stop at 100%.";
      await service.from("lead_directory_checks").insert({
        lead_id: leadId, user_id: userId, trade, town, status: "refused_cap",
        queries_run: [], hosts_checked: [], found: [], not_found: [],
        error: line, checked_at: new Date().toISOString(),
      });
      return json({ ok: false, status: "refused_cap", error: line, usage_pct: blind ? null : pct }, 200);
    }

    /* ── THE HOSTS: trade-level citation evidence, BREADTH first ────────────────────────────────
       Same derivation the playbook uses, via the same edge function, so the check can never target
       a different list from the one the playbook recommends. */
    const evRes = await fetch(`${supabaseUrl}/functions/v1/playbook-evidence`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!evRes.ok) throw new Error(`playbook-evidence HTTP ${evRes.status}: ${(await evRes.text()).slice(0, 300)}`);
    const ev = await evRes.json() as { evidence?: Array<{ trade: string; host: string; citations: number; audits: number }> };

    const hosts = (ev.evidence ?? [])
      .filter((e) => e.trade === trade)
      // BREADTH first — how many separate audits the host appeared in. Volume alone lies: one host
      // had 32 citations from a SINGLE audit and read as the strongest source in the data.
      .sort((a, b) => b.audits - a.audits || b.citations - a.citations)
      .map((e) => e.host)
      /* NO CLASSIFICATION FILTER — this was here and it was WRONG, dangerously so.
         Excluding unclassified hosts would have made the check test only the hosts already known,
         and reported a clean sweep while the most important host in the trade went unmentioned.
         The live example: Elite Clean (valeting) has yell.com as its ONLY classified host, so the
         check would have tested one host, found it, and read as all-done — while cleanme.co.uk
         (15 citations across 5 of 5 audits, joinable, named directly by AI Overview) was never
         looked at. That false all-done signal is the exact thing this feature exists to prevent.
         An unclassified host is rendered UNCLASSIFIED and, when NOT FOUND, is routed to a group that
         says it needs classifying before it can be actioned — never counted as work. */
      .slice(0, MAX_HOSTS);

    if (hosts.length === 0) {
      const line = `No cited directories are on record for "${trade}" yet, so there is nothing to check against.`;
      await service.from("lead_directory_checks").insert({
        lead_id: leadId, user_id: userId, trade, town, status: "no_results",
        queries_run: [], hosts_checked: [], found: [], not_found: [],
        error: line, checked_at: new Date().toISOString(),
      });
      return json({ ok: false, status: "no_results", error: line }, 200);
    }

    const hostRows: DirectoryHostRow[] = hosts.map((h) => {
      const g = gatingFor(h);
      return { host: h, gating: g.gating, actor: g.actor };
    });

    // ── THE SEARCH: exactly two queries, deduped across both ──
    const apifyToken = Deno.env.get("APIFY_TOKEN") ?? Deno.env.get("APIFY_API_TOKEN") ?? "";
    if (!apifyToken) throw new Error("APIFY_TOKEN is not set on this function.");
    const countryCode = toCountryCode(lead.country as string | null);
    const queries = [
      `"${businessName}"${town ? ` ${town}` : ""}`.trim(),
      `"${businessName}"${tradeRaw ? ` ${tradeRaw}` : ""}${town ? ` ${town}` : ""}`.trim(),
    ].filter((q, i, a) => q && a.indexOf(q) === i);   // if trade+town add nothing, do not pay twice

    /* ── THE PENDING ROW, WRITTEN BEFORE A PENNY IS SPENT ───────────────────────────────────────
       Everything above this line is free, which is why the refusals and the empty-host case still
       short-circuit without a row. From here on money is committed, so the row exists FIRST and is
       UPDATED in place afterwards — never followed by a second insert. One click, one row.
       A row still reading 'pending' is the signal that the searches were started and this function
       did not live to write the answer; the run ids on it are then the only way back to the data. */
    const { data: pendingRow, error: pendErr } = await service
      .from("lead_directory_checks").insert({
        lead_id: leadId, user_id: userId, trade, town, status: "pending",
        queries_run: queries, hosts_checked: hostRows, found: [], not_found: [],
        checked_at: new Date().toISOString(),
      }).select("id").single();
    if (pendErr || !pendingRow) {
      // Fail BEFORE spending. If the row cannot be opened there is nowhere to put the answer.
      throw new Error(`could not open the check row, so nothing was searched: ${pendErr?.message ?? "no row returned"}`);
    }
    checkId = String(pendingRow.id);

    /* ── BOTH SEARCHES START CONCURRENTLY ───────────────────────────────────────────────────────
       allSettled, not all: one query failing must not throw away what the other one found. */
    const started = await Promise.allSettled(queries.map((q) => startQuery(q, countryCode, apifyToken)));
    const attempts: QueryAttempt[] = queries.map((q, i) => {
      const s = started[i];
      return s.status === "fulfilled"
        ? { query: q, run_id: s.value, state: "started", billed_usd: null, error: null }
        : { query: q, run_id: null, state: "start_failed", billed_usd: null, error: reasonOf(s.reason) };
    });

    /* RUN IDS GO DOWN NOW, NOT AT THE END — the whole reason the pending row exists. If the isolate
       is killed while polling, the runs are still sitting in the Apify console and the row says
       which ones they are. Stored under raw_results.apify_runs: no new column, no SQL. */
    await service.from("lead_directory_checks")
      .update({ raw_results: { apify_runs: attempts, partial: false, items: [] } })
      .eq("id", checkId);

    const polled = await Promise.allSettled(attempts.map((a) =>
      a.run_id ? awaitRun(a.run_id, apifyToken) : Promise.reject(new Error(a.error ?? "run was never started"))));

    const rawItems: unknown[] = [];
    const seenUrl = new Set<string>();
    const hits: OrganicHit[] = [];
    let billedTotal = 0;
    let anyBilledFigure = false;
    let okRuns = 0;
    polled.forEach((p, i) => {
      const a = attempts[i];
      if (p.status !== "fulfilled") {
        if (a.state === "started") a.state = "failed";
        a.error = reasonOf(p.reason);
        return;
      }
      okRuns++;
      a.state = "succeeded";
      a.billed_usd = p.value.billedUsd;
      if (typeof p.value.billedUsd === "number") { billedTotal += p.value.billedUsd; anyBilledFigure = true; }
      rawItems.push(...p.value.items);
      for (const h of organicHits(p.value.items)) {
        const key = h.url.toLowerCase();
        if (seenUrl.has(key)) continue;
        seenUrl.add(key);
        hits.push(h);
      }
    });
    /* Apify's own number when it gave us one, our estimate only as a fallback — and the estimate is
       per SUCCEEDED run, so a half-failed check is not priced as a whole one. */
    const costUsd = anyBilledFigure ? billedTotal : okRuns * COST_PER_QUERY_USD;

    const failedRuns = attempts.filter((a) => a.state !== "succeeded");
    const partial = okRuns > 0 && failedRuns.length > 0;
    const partialNote = partial
      ? `PARTIAL — ${okRuns} of ${attempts.length} searches completed. Failed: `
        + failedRuns.map((f) => `"${f.query}" (${f.error ?? "unknown"})`).join("; ")
        + ". FOUND is still true; NOT FOUND is less certain than usual."
      : null;
    // Bounded: the full dataset is large and this column is a diagnostic, not a store.
    const rawBlob = { apify_runs: attempts, partial, items: rawItems.slice(0, 5) };

    /* EVERY SEARCH FAILED. Distinct from "no results": there we searched and found nothing, here we
       never got an answer at all. The run ids stay on the row either way. */
    if (okRuns === 0) {
      const line = "Every search failed, so nothing was learned about any host. "
        + failedRuns.map((f) => `"${f.query}": ${f.error ?? "unknown"}`).join(" | ");
      await finish(checkId, { status: "error", error: line, raw_results: rawBlob, cost_estimate_usd: costUsd });
      return json({ ok: false, status: "error", error: line, queries_run: queries }, 200);
    }

    /* ZERO RESULTS IS ITS OWN STATE. A search that surfaced nothing at all tells us nothing about
       any host, and reporting NOT FOUND for all of them off the back of it would be a lie. */
    if (hits.length === 0) {
      const line = "The search returned no results at all, so nothing can be said about any host. This is not the same as the business being absent from them."
        + (partialNote ? ` ${partialNote}` : "");
      await finish(checkId, { status: "no_results", raw_results: rawBlob, cost_estimate_usd: costUsd, error: line });
      return json({ ok: false, status: "no_results", error: line, queries_run: queries }, 200);
    }

    /* ── MATCHING: parsed hostname, exact or dotted-suffix. NEVER includes(). ──
       "yell.com" matches "business.yell.com" but NOT "notyell.com" and NOT "yell.com.evil.net". */
    const found: DirectoryFoundRow[] = [];
    const notFound: DirectoryNotFoundRow[] = [];
    for (const host of hosts) {
      const hit = hits.find((h) => {
        const hn = hostnameOf(h.url);
        return hn ? hostMatches(hn, host) : false;
      });
      if (hit) found.push({ host, url: hit.url, title: hit.title });
      else notFound.push({ host });
    }

    /* A PARTIAL RUN STILL STORES AS 'ok', DELIBERATELY. The fold only suppresses a task when a host
       was FOUND, and a listing surfaced by one search is a real listing whether or not the other
       search ran; a host that was not surfaced keeps its task regardless. Giving partial its own
       status would empty the fold and silently re-raise work already done — worse than the caveat.
       The caveat rides in `error` and is shown on screen above the host list. */
    const { data: row, error: updErr } = await service.from("lead_directory_checks")
      .update({
        status: "ok", found, not_found: notFound,
        raw_results: rawBlob,
        cost_estimate_usd: costUsd,
        error: partialNote,
        checked_at: new Date().toISOString(),
      })
      .eq("id", checkId).select("*").single();
    if (updErr) throw new Error(`could not store the result: ${updErr.message}`);

    return json({ ok: true, status: "ok", partial, check: row });
  } catch (e) {
    /* THE REAL ERROR, NEVER A CATCH-ALL. An Apify 402 must read as the cap being reached, not as a
       generic failure — that mistake cost a day when "term too broad" masked exactly this. */
    const raw = e instanceof Error ? e.message : String(e);
    let human = raw;
    if (/\b402\b/.test(raw)) human = `Apify refused the run: payment required — the account's spend cap is reached. (${raw})`;
    else if (/\b403\b/.test(raw)) human = `Apify refused the run (403). Usually the spend cap; otherwise check the API token. (${raw})`;
    else if (/\b429\b/.test(raw)) human = `Apify rate-limited the run (429) — try again shortly. (${raw})`;
    else if (/\b5\d\d\b/.test(raw)) human = `Apify returned a server error — their end, not ours. (${raw})`;

    console.error("[check-directory-listings]", raw);
    /* ONE ROW PER CHECK. Once the pending row exists this UPDATES it — inserting here as well would
       leave two rows for one click, and the newest would read as an error with no queries, no hosts
       and no run ids on it, hiding the very thing the pending row was written to preserve.
       The insert branch only fires for failures BEFORE any money was committed. */
    if (checkId) {
      await finish(checkId, { status: "error", error: human });
    } else if (leadId && userId) {
      await service.from("lead_directory_checks").insert({
        lead_id: leadId, user_id: userId, status: "error",
        queries_run: [], hosts_checked: [], found: [], not_found: [],
        error: human, checked_at: new Date().toISOString(),
      }).select("id").maybeSingle();
    }
    return json({ ok: false, status: "error", error: human }, 200);
  }
});
