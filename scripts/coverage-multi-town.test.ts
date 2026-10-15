/* ============================================================
   COVERAGE: FIND LEADS IN MANY TOWNS, ADD THEM IN ONE GO (2026-10-15).
   Mocked providers only — no search, no Place Details, no database. Pinned here:
   ⛔ 1. Towns: at most MULTI_TOWN_MAX_TOWNS per press, the rest wait (the cap is the constant).
   ⛔ 2. Price line: towns × MARKET_SEARCH_USD for the admin; a salesperson never sees a cost.
   ⛔ 3. One merged list with the town on each row; the same business from two towns is kept ONCE
        (place id, Maps link, name + phone, name + website) and the removed count is right.
   ⛔ 4. A LIMIT refusal stops new towns, keeps what was found, and says so in plain words; a one-town
        failure does not stop the others.
   ⛔ 5. Page / all-results selection are separate.
   ⛔ 6. The bulk add: duplicates skipped from the free preview, lookups only for NEW rows, no-contact
        dropped, a failed lookup still added, ONE committing call, a lookup limit stops (never adds blind),
        and the summary counts each kind once.
   ⛔ 7. Scoping and spend: each town is search-leads with townOnly (Google, never Apify); the SQL function
        keeps the single add's owner, campaign and duplicate rules and writes no import_batch / lead_source.
   ============================================================ */
import { readFileSync } from "node:fs";
import {
  MULTI_TOWN_MAX_TOWNS, MULTI_TOWN_PAGE_SIZE, COVERAGE_ADD_MAX_ROWS, PLACE_LOOKUPS_PER_MINUTE, PLACE_DETAILS_USD,
  townsToSearch, estimateMultiTownSearch, searchEstimateSentence, mergeTownResults, sameBusinessKeys,
  runTownSearches, limitSummary, isLimitRefusal, pageRows, pageCount, selectPage, selectAllResults,
  addRowFor, runBulkAdd, addSummarySentence, addLookupEstimate, noContactAfterLookup,
  type TownResult, type ResultLead, type TownStatus, type AddRowAnswer, type AddPhase,
} from "../src/lib/multiTownSearch.ts";
import { MARKET_SEARCH_USD, USD_TO_GBP_DISPLAY } from "../src/lib/marketView.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const lead = (id: string, name: string, extra: Partial<ResultLead> = {}): ResultLead => ({
  id, name, googleMapsUrl: `https://maps.google.com/?cid=${id}`, websiteStatus: "NO_WEBSITE", ...extra,
});

(async () => {
  console.log("── 1. the town cap ──");
  const fourteen = Array.from({ length: 14 }, (_, i) => `T${i}`);
  const { run, later } = townsToSearch(fourteen);
  ok(MULTI_TOWN_MAX_TOWNS === 10, "the cap is 10 towns per search");
  ok(run.length === 10 && later.length === 4 && run[0] === "T0" && later[0] === "T10", "14 selected → the first 10 in list order now, 4 wait");
  ok(townsToSearch(fourteen, 3).run.length === 3, "the cap is a parameter (one constant to change)");
  ok(townsToSearch(["A", "B"]).later.length === 0, "under the cap → nothing waits");

  console.log("── 2. the estimate ──");
  const e3 = estimateMultiTownSearch(3);
  ok(Math.abs(e3.usd - 3 * MARKET_SEARCH_USD) < 1e-9, "3 towns = 3 × MARKET_SEARCH_USD");
  ok(e3.label === `about ${Math.round(3 * MARKET_SEARCH_USD * USD_TO_GBP_DISPLAY * 100)}p`, `label in pence: ${e3.label}`);
  const adminLine = searchEstimateSentence({ selected: 14, isAdmin: true });
  const salesLine = searchEstimateSentence({ selected: 14, isAdmin: false });
  ok(/Searches 10 towns/.test(adminLine) && /about £?\d/.test(adminLine) && /no Apify/.test(adminLine), `admin sees towns + price: ${adminLine}`);
  ok(/other 4 stay selected/.test(adminLine), "the waiting towns are named");
  ok(/Searches 10 towns/.test(salesLine) && !/[£$]|\dp\b|cost|price/i.test(salesLine), `a salesperson sees no cost: ${salesLine}`);
  ok(addLookupEstimate(60).minutes === Math.ceil(60 / PLACE_LOOKUPS_PER_MINUTE) && Math.abs(addLookupEstimate(60).usd - 60 * PLACE_DETAILS_USD) < 1e-9, "add lookups: minutes from the pace, price from the Place Details SKU");
  ok(PLACE_DETAILS_USD === 0.02, "Place Details Enterprise = $0.020 a lookup (from GOOGLE_SKUS)");

  console.log("── 3. one merged list, de-duplicated across towns ──");
  const rugby: TownResult = { town: "Rugby", location: "Rugby", country: "UK", leads: [
    lead("p1", "Ace Plumbing"), lead("p2", "Best Pipes", { phone: "01788 111222" }), lead("p3", "Clear Drains", { websiteUrl: "https://www.cleardrains.co.uk/x", websiteStatus: "HAS_OWN_WEBSITE" }),
  ] };
  const coventry: TownResult = { town: "Coventry", location: "Coventry", country: "UK", leads: [
    lead("p1", "Ace Plumbing"),                                                // same place id
    lead("q2", "Best  Pipes!", { phone: "+44 1788 111222".replace("+44 ", "0") }), // same name + phone, other id
    lead("q3", "clear drains", { websiteUrl: "cleardrains.co.uk", websiteStatus: "HAS_OWN_WEBSITE" }), // same name + website
    lead("q4", "Dan's Heating"),
  ] };
  const leamington: TownResult = { town: "Leamington Spa", location: "Leamington Spa", country: "UK", leads: [lead("q4", "Dan's Heating"), lead("r5", "Eve Gas")] };
  const m = mergeTownResults([rugby, coventry, leamington]);
  ok(m.rows.length === 5, `5 distinct businesses from 9 results (got ${m.rows.length})`);
  ok(m.removed === 4, `4 duplicates removed (got ${m.removed})`);
  ok(m.rows.map((r) => r.town).join(",") === "Rugby,Rugby,Rugby,Coventry,Leamington Spa", "each row carries the town that found it first");
  const ace = m.rows.find((r) => r.id === "p1")!;
  ok(ace.alsoIn.join(",") === "Coventry", "the other town is kept as 'also in'");
  ok(m.rows.find((r) => r.id === "q4")!.alsoIn.join(",") === "Leamington Spa", "…for a later town too");
  ok(m.rows.every((r) => r.searchLocation && r.country === "UK"), "every row carries its search location and country");
  ok(sameBusinessKeys(lead("x", "A")).length === 2, "id + Maps link only when there is no phone or website");
  ok(mergeTownResults([{ town: "A", location: "A", country: "UK", leads: [lead("1", "Same Name"), lead("2", "Same Name")] }]).rows.length === 2,
    "the same NAME alone is never a duplicate (two branches)");
  const my = mergeTownResults([{ town: "Klang", location: "Klang, Malaysia", country: "Malaysia", leads: [lead("m1", "Kedai")] }]);
  ok(my.rows[0].searchLocation === "Klang, Malaysia" && my.rows[0].country === "Malaysia", "a Malaysian town keeps its searched text and country");

  console.log("── 4. limits vs failures ──");
  ok(isLimitRefusal({ status: 429 }) && isLimitRefusal({ status: 403, code: "usage_paused" }) && isLimitRefusal({ code: "not_ready_to_sell" }), "429 / usage_paused / not_ready_to_sell are limits");
  ok(!isLimitRefusal({ status: 500, code: "server_error" }) && !isLimitRefusal(null), "a 500 is a failure, not a limit");
  const towns = ["A", "B", "C", "D", "E", "F"].map((t) => ({ town: t }));
  const seen: Record<string, TownStatus["kind"][]> = {};
  const calls: string[] = [];
  const r1 = await runTownSearches(towns, async (t) => {
    calls.push(t.town);
    if (t.town === "B") return { ok: false, limit: false, message: "Map lookup failed" };
    if (t.town === "D") return { ok: false, limit: true, message: "You have reached the search limit for now." };
    return { ok: true, result: { town: t.town, location: t.town, country: "UK", leads: [lead(`id-${t.town}`, t.town)] } };
  }, { concurrency: 1, onStatus: (town, s) => { (seen[town] ??= []).push(s.kind); } });
  ok(calls.join("") === "ABCD", `stops starting towns after the limit (called ${calls.join("")})`);
  ok(r1.searched === 2 && r1.failed === 1 && r1.notSearched === 3, `2 searched, 1 failed, 3 not searched (got ${r1.searched}/${r1.failed}/${r1.notSearched})`);
  ok(r1.results.map((r) => r.town).join("") === "AC", "what was found is kept");
  ok(seen.E.at(-1) === "not_searched" && seen.F.at(-1) === "not_searched" && seen.B.at(-1) === "failed", "each town reports its own final state");
  const words = limitSummary({ searched: r1.searched, total: 6, notSearched: r1.notSearched, message: r1.limitMessage! });
  ok(words === "Searched 2 of 6 towns. The other 3 were not searched: You have reached the search limit for now. They stay selected — press Find leads again later to search them.", `plain words: ${words}`);
  ok(!/usage_paused|rate_limit|429/.test(words), "no machine token in the message");
  let inFlight = 0, peak = 0;
  await runTownSearches(towns, async (t) => { inFlight++; peak = Math.max(peak, inFlight); await new Promise((r) => setTimeout(r, 5)); inFlight--; return { ok: true, result: { town: t.town, location: t.town, country: "UK", leads: [] } }; }, { onStatus: () => {} });
  ok(peak === 2, `two towns at a time by default (peak ${peak})`);

  console.log("── 5. selection ──");
  const many = Array.from({ length: 60 }, (_, i) => ({ rowKey: `k${i}` }));
  ok(pageCount(60) === Math.ceil(60 / MULTI_TOWN_PAGE_SIZE) && pageRows(many, 1).length === MULTI_TOWN_PAGE_SIZE && pageRows(many, 1)[0].rowKey === `k${MULTI_TOWN_PAGE_SIZE}`, "page 2 is the next 25");
  const sel = selectPage(new Set(["k0"]), pageRows(many, 1), true);
  ok(sel.size === 1 + MULTI_TOWN_PAGE_SIZE && sel.has("k0") && !sel.has(`k${2 * MULTI_TOWN_PAGE_SIZE}`), "select all on THIS page only; other pages untouched");
  ok(selectPage(sel, pageRows(many, 1), false).size === 1, "unticking the page leaves the other page's ticks");
  ok(selectAllResults(many).size === 60, "select all results is every row (a separate control)");

  console.log("── 6. the bulk add (mocked database + lookups) ──");
  const rows = mergeTownResults([rugby, coventry, leamington]).rows;   // 5 rows
  const calls2: { commit: boolean; rows: Record<string, unknown>[]; campaign: string | null }[] = [];
  const looked: string[] = [];
  const phases: AddPhase["kind"][] = [];
  const res = await runBulkAdd(rows, "plumbers", "camp-1", {
    addLeads: async (r, c, commit) => {
      calls2.push({ commit, rows: r, campaign: c });
      if (!commit) {
        // p1 (Ace) is already the caller's lead; p2 another person's → 3 new.
        return { ok: true, rows: r.map((x, i): AddRowAnswer => ({ k: String(x.k), business_name: String(x.business_name), outcome: x.place_id === "p1" ? "skipped" : x.place_id === "p2" ? "skipped" : "new", reasons: x.place_id === "p1" ? ["already_yours"] : x.place_id === "p2" ? ["owned_by_other"] : undefined })) };
      }
      return { ok: true, rows: r.map((x): AddRowAnswer => ({ k: String(x.k), business_name: String(x.business_name), outcome: "created", lead_id: `L-${x.place_id}` })) };
    },
    lookup: async (placeId) => {
      looked.push(placeId);
      if (placeId === "q4") return { phone: null, townNote: "no_town_in_address" };     // answered: no phone, no email → not added
      if (placeId === "r5") throw new Error("network");                                   // failed lookup → still added
      return { phone: "01788 000000", address: "1 High St, Rugby CV21 1AA, UK", derivedTown: "Rugby", townNote: null };
    },
    onPhase: (p) => phases.push(p.kind),
  });
  ok(calls2.length === 2 && !calls2[0].commit && calls2[1].commit, "one free preview, then ONE committing call");
  ok(calls2.every((c) => c.campaign === "camp-1"), "the chosen campaign rides on both calls");
  ok(looked.sort().join(",") === "p3,q4,r5", `lookups only for the NEW rows (looked up ${looked.join(",")})`);
  ok(calls2[1].rows.length === 2 && calls2[1].rows.map((r) => r.place_id).sort().join(",") === "p3,r5", "the no-contact row is not sent; the failed lookup is");
  const p3 = calls2[1].rows.find((r) => r.place_id === "p3")!;
  ok(p3.phone === "01788 000000" && p3.derived_town === "Rugby" && p3.town_checked === true && p3.search_keyword === "plumbers" && p3.search_location === "Rugby", "the looked-up phone and town ride in the row, with the trade and town searched");
  const r5 = calls2[1].rows.find((r) => r.place_id === "r5")!;
  ok(r5.town_checked === false && r5.derived_town === null && r5.search_location === "Leamington Spa", "a failed lookup: no town stamp, the searched town kept");
  ok(typeof p3.search_run_id === "object" && p3.without_website === false && p3.k === rows.find((r) => r.id === "p3")!.rowKey, "the row carries its key, run and website verdict");
  ok(!!res && res.summary.added === 2 && res.summary.skippedDuplicate === 2 && res.summary.noContact === 1 && res.summary.limit === 0 && res.summary.failed === 0,
    `summary: 2 added, 2 skipped as duplicate, 1 no contact (got ${JSON.stringify(res?.summary)})`);
  ok(addSummarySentence(res!.summary) === "2 added · 2 skipped (already in the CRM) · 1 not added (no phone or email)", addSummarySentence(res!.summary));
  ok(phases[0] === "checking" && phases.includes("lookups") && phases.includes("saving") && phases.at(-1) === "done", `progress phases: ${[...new Set(phases)].join(" → ")}`);

  // A lookup LIMIT stops the lookups; those rows are reported, never added without their lookup.
  const commits: Record<string, unknown>[][] = [];
  let n = 0;
  const res2 = await runBulkAdd(rows, "plumbers", null, {
    addLeads: async (r, _c, commit) => {
      if (commit) { commits.push(r); return { ok: true, rows: r.map((x): AddRowAnswer => ({ k: String(x.k), outcome: "created" })) }; }
      return { ok: true, rows: r.map((x): AddRowAnswer => ({ k: String(x.k), outcome: "new" })) };
    },
    lookup: async () => (++n >= 2 ? { limit: true } : { phone: "0123456789", townNote: null }),
    onPhase: () => {},
  });
  ok(commits.length === 1 && commits[0].length === 1, `after the limit only the looked-up row is saved (${commits[0]?.length})`);
  ok(res2!.summary.added === 1 && res2!.summary.limit === 4, `4 reported as not added yet (got ${JSON.stringify(res2!.summary)})`);

  // Pacing: never more than PLACE_LOOKUPS_PER_MINUTE started inside any minute (fake clock).
  let clock = 0;
  const starts: number[] = [];
  const big = Array.from({ length: 60 }, (_, i) => ({ ...rows[0], id: `b${i}`, rowKey: `b${i}` }));
  await runBulkAdd(big, "plumbers", null, {
    addLeads: async (r, _c, commit) => ({ ok: true, rows: r.map((x): AddRowAnswer => ({ k: String(x.k), outcome: commit ? "created" : "new" })) }),
    lookup: async () => { starts.push(clock); return { phone: "0123456789", townNote: null }; },
    onPhase: () => {}, now: () => clock, sleep: async (ms) => { clock += ms; },
  });
  const worstMinute = Math.max(...starts.map((s) => starts.filter((t) => t >= s && t < s + 60_000).length));
  ok(starts.length === 60 && worstMinute <= PLACE_LOOKUPS_PER_MINUTE, `60 lookups paced: at most ${worstMinute} in any minute (limit ${PLACE_LOOKUPS_PER_MINUTE})`);

  // The whole call refused (e.g. a campaign the caller may not use) → nothing saved, plain words.
  let committed = false;
  const phases3: AddPhase[] = [];
  const res3 = await runBulkAdd(rows, "plumbers", "not-mine", {
    addLeads: async (_r, _c, commit) => { committed ||= commit; return { ok: false, error: "unknown_campaign" }; },
    lookup: async () => null, onPhase: (p) => phases3.push(p),
  });
  ok(res3 === null && !committed && phases3.at(-1)?.kind === "error" && /campaign is not available/.test((phases3.at(-1) as { message: string }).message), "a refused campaign: nothing saved, said plainly");
  const tooMany = Array.from({ length: COVERAGE_ADD_MAX_ROWS + 1 }, (_, i) => ({ ...rows[0], rowKey: `z${i}` }));
  ok((await runBulkAdd(tooMany, "plumbers", null, { addLeads: async () => { throw new Error("must not call"); }, lookup: async () => null, onPhase: () => {} })) === null, "over the row ceiling: refused before any call");
  ok(noContactAfterLookup({ phone: "" }, null) === false, "no lookup answer never counts as no contact");

  console.log("── 7. scoping and spend, read from the source ──");
  const hook = readFileSync("src/hooks/useMultiTownLeads.ts", "utf8");
  ok(/invokeEdge<SearchLeadsAnswer>\('search-leads', \{[\s\S]{0,160}townOnly: true/.test(hook), "each town is search-leads with townOnly (the Google path — never Apify)");
  ok(!/skipHistory/.test(hook.replace(/\/\*[\s\S]*?\*\//g, "")),"search-leads writes the run's history row itself (Found vs Added stays right)");
  ok(!/apify|create-ai-audit|bulk-jobs|whatsapp|send-/i.test(hook.replace(/\/\*[\s\S]*?\*\//g, "")), "no Apify, no audit, no message path");
  ok(!/\.from\('outreach_leads'\)/.test(hook), "never writes outreach_leads directly — only through coverage_add_leads");
  const sql = readFileSync("supabase/migrations/20261031090000_coverage_add_leads.sql", "utf8");
  ok(/SECURITY DEFINER/.test(sql) && /revoke all on function public\.coverage_add_leads\(jsonb, uuid, boolean\) from public, anon/.test(sql), "SECURITY DEFINER, not callable by anon");
  ok(/raise exception 'no_role'/.test(sql), "no team role → refused");
  ok(/v_book uuid := public\.book_owner_id\(\)/.test(sql) && /values \(\s*v_book, v_uid, v_uid, now\(\)/.test(sql), "owner: user_id = the book, added_by = assigned_to = the caller (the single add's rule)");
  ok(/public\.campaign_usable\(_campaign_id\)/.test(sql), "a campaign only when the caller may use it");
  ok(/public\._lead_identity_rows\(v_items\)/.test(sql), "the canonical identity lookup decides duplicates");
  ok(/guard_action\(v_uid, 'lead_add', null, 0, 1, 'coverage_add_leads'\)/.test(sql), "one lead_add guard per new lead (the same accounting as single adds)");
  const insertCols = sql.match(/insert into public\.outreach_leads \(([\s\S]*?)\)\s*values/)![1];
  ok(!/import_batch|lead_source/.test(insertCols), "no import_batch and no lead_source are written (search adds never carried them)");
  ok(/'no_website'/.test(sql) && /'not_contacted', 'none'/.test(sql), "list_type no_website, status not_contacted, next action none — as a single add");
  ok(!/drop |delete from|truncate|alter table/i.test(sql.replace(/--.*$/gm, "")), "additive only: no drop / delete / alter");
  ok(/'owner_name', case when v_role = 'admin'/.test(sql), "a salesperson is never told whose lead it is");

  const page = readFileSync("src/pages/Coverage.tsx", "utf8");
  ok(/<Link to=\{findLeadsHref\(tradeSearchWord\(trade\), townLocation\(t\.name\), country\)\}/.test(page) && /Find leads\s*<\/Link>/.test(page), "the one-town Find leads link is still on every row");
  ok(/Select all towns in this list/.test(page), "select all in this list");
  const comp = readFileSync("src/components/CoverageMultiTown.tsx", "utf8");
  ok(/searchEstimateSentence\(\{ selected: selected\.length, isAdmin \}\)/.test(comp) && /isAdmin && addable\.length > 0 \?/.test(comp), "prices are shown only to the admin");
  ok(/Select all on this page/.test(comp) && /Select all \{rows\.length\} results/.test(comp), "page and all-results selection are separate, labelled controls");
  ok(/<CampaignPicker mode="assign"/.test(comp), "the add asks which campaign");

  console.log(f ? `\n${f} FAILURE(S)` : "\nALL PASS");
  process.exit(f ? 1 : 0);
})();
