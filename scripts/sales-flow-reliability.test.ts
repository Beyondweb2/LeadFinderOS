/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SALES FLOW RELIABILITY (2026-09-28) — Coverage → Find Leads → Add to CRM → Outreach.

   Paul's report, one fault per section: the nav order; Coverage's "~9p" and Suppress; who worked a
   town; "10 found" over an empty table; the search-summary banner; results that came back from a
   visit with no search behind them ("Run a search first"); the phone number that never reached the
   CRM; no campaign control for Sales; what Available to claim means.
   The live-database half (campaign on own/others' leads, the claim pool, the Sales add keeping the
   Google details) is supabase/tests/sales-flow-reliability.sql, always rolled back.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { existsSync, readFileSync } from "node:fs";
import { canOpenRoute, orderNavForRole, SALES_NAV_ORDER } from "../src/lib/access.ts";
import { coverageKey, describeWorkers, workersByPair } from "../src/lib/coverageState.ts";
import { isUsableSearch, packSearchResults, resultSetSignature, unpackSearchResults } from "../src/lib/searchResultsCache.ts";
import { visibleResults } from "../src/lib/searchResultsView.ts";
import { salesAddPayload } from "../src/lib/salesAddPayload.ts";
import { refusalText } from "../src/lib/salesCrm.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

/* ── 1. NAVIGATION ─────────────────────────────────────────────────────────────────────────────── */
console.log("── nav ──");
{
  const sidebar = read("src/components/AppSidebar.tsx");
  const urls = [...sidebar.slice(sidebar.indexOf("const allNavItems"), sidebar.indexOf("];", sidebar.indexOf("const allNavItems")))
    .matchAll(/url: '([^']+)'/g)].map((m) => m[1]);
  const items = urls.map((url) => ({ url }));
  const sales = orderNavForRole(items.filter((i) => canOpenRoute("sales", i.url)), "sales").map((i) => i.url);
  ok(JSON.stringify(sales) === JSON.stringify(["/sales-dashboard", "/find-leads", "/outreach", "/coverage", "/inbox"]),
    `sales sidebar: Sales dashboard, Find Leads, Outreach, Coverage, Inbox (got ${sales.join(", ")})`);
  ok(sales[0] === "/sales-dashboard", "Sales dashboard is first");
  ok(sales.indexOf("/find-leads") < sales.indexOf("/outreach"), "Find Leads comes before Outreach");
  ok(sales.indexOf("/coverage") === sales.indexOf("/outreach") + 1, "Coverage is immediately after Outreach");
  for (const u of urls) if (!SALES_NAV_ORDER.includes(u)) ok(!canOpenRoute("sales", u), `sales still cannot open the admin page ${u}`);

  const admin = orderNavForRole(items.filter((i) => canOpenRoute("admin", i.url)), "admin").map((i) => i.url);
  ok(admin[0] === "/" && admin.length === urls.length, "admin keeps every item, Dashboard first");
  ok(admin.indexOf("/find-leads") < admin.indexOf("/outreach"), "admin: Find Leads above Outreach");
  ok(admin.indexOf("/coverage") === admin.indexOf("/outreach") + 1, "admin: Coverage directly below Outreach");
  ok(admin.includes("/team") && admin.includes("/paid-clients") && admin.includes("/ai-audit"), "admin-only items are still in the admin's nav");

  const extra = orderNavForRole([{ url: "/zzz" }, { url: "/inbox" }, { url: "/sales-dashboard" }], "sales").map((i) => i.url);
  ok(extra[extra.length - 1] === "/zzz", "an unlisted sales item goes AFTER the ordered ones, never to the top");

  const mobile = read("src/components/MobileBottomNav.tsx");
  const salesBar = mobile.slice(mobile.indexOf("const mainNavItems = role === 'sales'"), mobile.indexOf(": [", mobile.indexOf("const mainNavItems = role === 'sales'")));
  const bar = [...salesBar.matchAll(/url: '([^']+)'/g)].map((m) => m[1]);
  ok(JSON.stringify(bar) === JSON.stringify(["/sales-dashboard", "/find-leads", "/outreach", "/inbox"]), `mobile sales bar: Results, Find Leads, Outreach, Inbox (got ${bar.join(", ")})`);
  ok(/role === 'sales'\s*\?\s*\[\{ title: 'Coverage', url: '\/coverage'/.test(mobile), "mobile sales: Coverage under More");
  ok(!/url: '\/(team|paid-clients|ai-audit|templates|admin)'/.test(salesBar), "mobile sales bar has no admin page");
  ok(/icon: MapIcon/.test(mobile) && !/icon: Map \}/.test(mobile), "the mobile nav does not shadow the global Map");
}

/* ── 2–4. COVERAGE ─────────────────────────────────────────────────────────────────────────────── */
console.log("\n── coverage ──");
{
  const page = read("src/pages/Coverage.tsx");
  ok(!/asPence|MARKET_SEARCH_USD|~\{|·\s*~/.test(page), "no price estimate is rendered beside Find leads");
  ok(/>\s*Find leads\s*</.test(page), "the action is plainly 'Find leads'");
  ok(!/'Suppress'|'Restore'|Show suppressed|setSuppressed|window\.prompt/.test(page), "no Suppress / Restore / show-suppressed control on the page");
  ok(/gradeFor\(trade, false\)/.test(page), "suppressed towns (none today) still stay off the list — state untouched");
  const fn = read("supabase/functions/coverage/index.ts");
  ok(/action === "suppress" \|\| action === "unsuppress"/.test(fn), "the server's suppress action is kept (capability left intact)");
  ok(/assigned_to_user_id"\)/.test(fn) || /last_outreach_attempt_at, assigned_to_user_id/.test(fn), "coverage reads the lead owner");
  ok(/isAdmin \? \{ id, n \} : \{ id \}/.test(fn), "per-person counts go to the admin only");
  ok(/if \(contacted\) \{/.test(fn) && /const owner = typeof l\.assigned_to_user_id === "string"/.test(fn) && /if \(owner\)/.test(fn),
    "only a CONTACTED lead's owner counts, and a lead with no owner names nobody");

  const P = "11111111-0000-4000-8000-000000000001", T = "22222222-0000-4000-8000-000000000002";
  const w = workersByPair([
    { trade: "Plumbers", town: "Manchester", users: [{ id: P, n: 3 }] },
    { trade: "plumber", town: "manchester ", users: [{ id: P, n: 1 }, { id: T, n: 2 }] },
    { trade: "Locksmiths", town: "Wisbech", users: [{ id: T }] },
    // deno-lint-ignore no-explicit-any
    { trade: "x", town: "y", users: [{ id: "" }, null as any, { id: 7 as any }] },
  ]);
  const man = w.get(coverageKey("plumbers", "Manchester")) ?? [];
  ok(man.length === 2 && man[0].id === P && man[0].n === 4 && man[1].n === 2, "plural/case variants fold onto one row; counts add; most-worked first");
  const wis = w.get(coverageKey("locksmiths", "Wisbech")) ?? [];
  ok(wis.length === 1 && wis[0].n === null, "a salesperson's view carries no count (null, never 0)");
  ok((w.get(coverageKey("x", "y")) ?? []).length === 0, "malformed users are dropped, never guessed");
  ok(workersByPair(undefined).size === 0, "an older deploy with no workedBy → no names");

  const names = new Map([[P, "Paul"], [T, "Test"]]);
  const one = describeWorkers([{ id: P, n: null }], (id) => names.get(id));
  ok(one.text === "Worked by Paul", `one person: "${one.text}"`);
  const two = describeWorkers(man, (id) => names.get(id));
  ok(two.text === "Worked by Paul (4 contacted) and Test (2 contacted)", `two people, admin counts: "${two.text}"`);
  const unknown = describeWorkers([{ id: P, n: null }, { id: "gone", n: null }], (id) => names.get(id));
  ok(unknown.text === "Worked by Paul and 1 other" && unknown.named.length === 1, "an unknown id is counted, never given a made-up name");
  ok(describeWorkers([], () => "x").text === "", "nobody → nothing rendered");
  const comp = read("src/components/CoverageWorkers.tsx");
  ok(/team\.isLoading \|\| !d\.text/.test(comp), "no '+1 other' flash before the team names load");
  ok(/t\.state === 'worked' && t\.workers\.length > 0/.test(page), "avatars only on a Worked row with someone to name");
}

/* ── 5. COVERAGE → FIND LEADS: the count matches what you can see ─────────────────────────────── */
console.log("\n── coverage → find leads: visible results ──");
{
  ok(read("src/lib/coverageState.ts").includes("run: 'search'") && /onSearch=\{handleSearch\}/.test(read("src/pages/Index.tsx")),
    "Coverage's Find leads runs the NORMAL search (same handler as the Search button)");
  const ten = Array.from({ length: 10 }, (_, i) => ({ id: `place-${i}` }));
  const other = Array.from({ length: 32 }, (_, i) => ({ id: `mcr-${i}` }));
  ok(resultSetSignature(ten) !== resultSetSignature(other), "a different search has a different signature");
  ok(resultSetSignature(ten) === resultSetSignature(ten.map((l) => ({ ...l, websiteStatus: "NO_WEBSITE" }))), "a website-status correction keeps the same signature");
  const table = read("src/components/LeadsTable.tsx");
  ok(/return v && v\.sig === signature \? v : null;/.test(table), "a saved filter view is restored ONLY onto the result set it was set on");
  ok(/if \(lastSigRef\.current === signature\) return;[\s\S]{0,120}clearFilters\(\);/.test(table), "a new result set clears every filter");
  ok(/sig: signature/.test(table), "the view is saved with its signature");
  /* The exact state Paul hit: an old Instagram-only filter over a new search of 10 with no Instagram. */
  const v = visibleResults(10, 0);
  ok(v.filtered && v.hidden === 10 && v.emptyText === "Your filters hide all 10 results.", `filters hiding everything say so: "${v.emptyText}"`);
  const v2 = visibleResults(10, 3);
  ok(v2.line === "Showing 3 of 10 — filters hide 7", `partial: "${v2.line}"`);
  ok(visibleResults(10, 10).line === "" && !visibleResults(10, 10).filtered, "nothing hidden → no notice");
  ok(visibleResults(0, 0).emptyText === "No results for this search.", "an empty search is not blamed on filters");
  ok(visibleResults(5, 99).shown === 5 && visibleResults(NaN, NaN).shown === 0, "absurd inputs clamp");
  ok(/Show all \{leads\.length\}/.test(table) && /onClick=\{clearFilters\}/.test(table), "Show all is offered wherever filters hide rows");
  ok(!/>No leads match your current filters\.|^\s+No leads match your current filters\.$/m.test(table), "the old unexplained empty sentence is no longer rendered");
}

/* ── 6. THE SEARCH-SUMMARY BANNER ──────────────────────────────────────────────────────────────── */
console.log("\n── find leads: no summary banner ──");
{
  const index = read("src/pages/Index.tsx");
  ok(!/nothing is added by searching|searchOutcome|summariseSearchResults/.test(index), "the banner and its sentence are gone");
  ok(!existsSync(new URL("../src/lib/searchOutcome.ts", import.meta.url)), "…and its helper is deleted");
  ok(/Found \{leads\.length\} businesses/.test(read("src/components/LeadsTable.tsx")), "the Search Results heading keeps its count");
}

/* ── 7. LEAVE AND RETURN: results are never shown without the search behind them ─────────────────── */
console.log("\n── find leads: leave and come back ──");
{
  const leads = [{ id: "p1", name: "Manchester Plumbers" }, { id: "p2", name: "Rapid Drains" }];
  const search = { keyword: "Plumber", location: "Manchester", country: "UK" };
  const round = unpackSearchResults<{ id: string; name: string }>(packSearchResults(leads, search));
  ok(round?.leads.length === 2 && round.lastSearch.keyword === "Plumber" && round.lastSearch.location === "Manchester",
    "search → leave → return: the results AND the trade/town come back together");
  ok(unpackSearchResults(JSON.stringify({ leads })) === null, "⛔ the old leads-only copy (Paul's fault) restores NOTHING — never an unaddable list");
  ok(unpackSearchResults(JSON.stringify({ leads, lastSearch: { keyword: "", location: "X", country: "UK" } })) === null, "a search with no trade is not usable");
  ok(packSearchResults(leads, null) === null, "results with no search are never written");
  ok(unpackSearchResults("{not json") === null && unpackSearchResults(null) === null, "a corrupt or empty store restores nothing");
  ok(isUsableSearch(search) && !isUsableSearch({ keyword: "Plumber" }), "usable = a trade and a country");

  const ctx = read("src/contexts/LeadSearchContext.tsx");
  ok(!/storageKeys\.demoLeads|JSON\.stringify\(\{ leads: filteredLeads \}\)/.test(ctx), "the provider no longer writes a leads-only copy");
  ok(/unpackSearchResults<Lead>\(localStorage\.getItem\(storageKeys\.results\)\)/.test(ctx), "the restore goes through the one rule");
  ok(/localStorage\.removeItem\(storageKeys\.noSearch\)/.test(ctx), "the legacy leads-only copy is removed on load");
  ok(/setLeads\(filteredLeads\);\n\s*setLastSearch\(thisSearch\);/.test(ctx), "the search is recorded IN THE SAME UPDATE as its results");
  ok(!/lastSearchRef\.current = \{ filters, skipTrialCount, isDemo \};\n[^]*?setLastSearch\(\{/.test(ctx.slice(ctx.indexOf("const search = useCallback"), ctx.indexOf("const invokePromise"))),
    "…not before the request (a failed search can no longer relabel the old results)");
  ok(/setLeads\(\(cur\) => \(cur\.length \? cur : s\.leads\)\)/.test(ctx), "a restore never replaces results already on screen");
  const add = read("src/hooks/useOutreach.ts");
  ok(/if \(!searchKeyword \|\| !searchKeyword\.trim\(\)\)/.test(add), "Add still refuses a result with no trade (the guard stays; the page no longer reaches it)");
}

/* ── 8. THE PHONE NUMBER ───────────────────────────────────────────────────────────────────────── */
console.log("\n── find leads → CRM: phone and the rest ──");
{
  const lead = { id: "ChIJ-fixture", name: "Cleethorpes Mobile Mechanics", googleMapsUrl: "https://maps.google.com/?cid=1", websiteUrl: "", category: "Mechanic" };
  const details = { phone: "01472 123456", address: "2 Sea Road, Cleethorpes DN35 8AA", rating: 4.8, reviewCount: 31, derivedTown: "Cleethorpes", townNote: null, website: null };
  const p = salesAddPayload({ lead, details, email: null, searchKeyword: "Mobile mechanics", searchLocation: "Cleethorpes", country: "UK", listType: "no_website", campaignId: "camp-1" });
  ok(p.phone === "01472 123456", "the phone Google returned reaches the add");
  ok(p.address === "2 Sea Road, Cleethorpes DN35 8AA" && p.rating === 4.8 && p.review_count === 31, "address, rating and reviews too");
  ok(p.search_keyword === "Mobile mechanics" && p.search_location === "Cleethorpes", "trade and town preserved");
  ok(p.derived_town === "Cleethorpes" && p.town_checked === true && p.town_fetch_note === null, "the looked-up town, stamped as checked");
  ok(p.place_id === "ChIJ-fixture" && p.google_maps_url === "https://maps.google.com/?cid=1" && p.business_name === lead.name && p.category === "Mechanic", "place id, Maps link, name, category");
  ok(p.campaign_id === "camp-1" && p.country === "UK" && p.list_type === "no_website", "campaign, country, list type");
  const bare = salesAddPayload({ lead: { id: "x", name: "No Lookup Ltd" }, details: null, searchKeyword: "plumbers", searchLocation: null, country: "UK", listType: "no_website", campaignId: null });
  ok(bare.phone === null && bare.address === null && bare.rating === null && bare.derived_town === null && bare.town_checked === false, "nothing looked up → nulls, nothing invented, town not stamped");
  const oldDeploy = salesAddPayload({ lead: { id: "x", name: "Y" }, details: { phone: "07700 900000" }, searchKeyword: "p", searchLocation: "T", country: "UK", listType: "no_website", campaignId: null });
  ok(oldDeploy.town_checked === false, "a lookup that never reported on the town does not stamp it");
  const withPhone = salesAddPayload({ lead: { id: "x", name: "Y", phone: "07700 111111" }, details: { phone: "07700 222222" }, searchKeyword: "p", searchLocation: "T", country: "UK", listType: "no_website", campaignId: null });
  ok(withPhone.phone === "07700 111111", "a phone already on the result is kept");

  const hook = read("src/hooks/useOutreach.ts");
  const salesBlock = hook.slice(hook.indexOf("if (roleRef.current === 'sales') {", hook.indexOf("const addLead = useCallback")), hook.indexOf("// Fast local-only duplicate check"));
  ok(/await lookupPlaceDetails\(lead\.id\)/.test(salesBlock) && salesBlock.indexOf("lookupPlaceDetails") < salesBlock.indexOf("'sales_add_lead'"),
    "Sales: the Place Details lookup runs BEFORE the add");
  ok(/_lead: salesAddPayload\(/.test(salesBlock), "…and the add sends the one mapping");
  ok(/No phone or email found — not added\./.test(salesBlock), "the admin's no-contact-method rule applies to Sales too");
  ok(/if \(d\.error\) return null;/.test(hook), "a failed lookup (200 + error) is treated as no lookup — the add still goes ahead");
  const mig = read("supabase/migrations/20260928200000_sales_flow_reliability.sql");
  ok(/rating, review_count, derived_town, town_fetched_at, town_fetch_note\)/.test(mig), "sales_add_lead stores rating, reviews and the town");
  ok(/case when v_town_checked then now\(\) end/.test(mig), "…stamping the town only when the lookup reported on it");
  for (const r of ["'exists'", "'site_match'", "'no_trade'", "'bad_source'", "'too_many_items'", "'no_book_owner'"]) ok(mig.includes(r), `every refusal is kept: ${r}`);
}

/* ── 9. CAMPAIGN ───────────────────────────────────────────────────────────────────────────────── */
console.log("\n── campaign on a lead ──");
{
  const mig = read("supabase/migrations/20260928200000_sales_flow_reliability.sql");
  const fnText = mig.slice(mig.indexOf("create or replace function public.lead_set_campaign"), mig.indexOf("end $function$;") + 16);
  ok(/perform public\._require_work\(_lead_id\);/.test(fnText), "lead_set_campaign checks the lead is the caller's to work (sales: assigned, not a client)");
  ok(/from public\.campaigns where id = _campaign_id/.test(fnText) && /'unknown_campaign'/.test(fnText), "…that the campaign exists");
  ok(/update public\.outreach_leads set campaign_id = _campaign_id where id = _lead_id;/.test(fnText), "…and writes the ONE canonical column");
  ok(!/insert into public\.campaigns|delete from public\.campaigns|update public\.campaigns/.test(fnText), "it never creates, edits or deletes a campaign");
  ok(/'details_set'/.test(fnText), "the change is logged with an existing activity kind (no CHECK change)");
  ok(/revoke all on function public\.lead_set_campaign\(uuid, uuid\) from public, anon;/.test(mig) && /grant execute on function public\.lead_set_campaign\(uuid, uuid\) to authenticated;/.test(mig), "anon cannot call it");
  const panel = read("src/components/LeadCrmPanel.tsx");
  ok(/<LeadCampaign lead=\{lead\} save=\{save\} \/>/.test(panel), "the shared lead workspace shows the campaign control (both roles)");
  ok(/save\('lead_set_campaign', \{ _campaign_id: id \}/.test(panel) && /\{ campaign_id: id \}\)/.test(panel), "it saves through lead_set_campaign and tells Outreach / the Inbox (campaign_id patch)");
  ok(/CampaignPicker mode="assign" hideCreate value=\{lead\.campaign_id\}/.test(panel), "pick only — no New / Manage campaigns inside the workspace");
  ok(/campaign_id'?;/.test(panel.match(/const CRM_COLUMNS = '[^']+'/)?.[0] + ";") , "the workspace reads the lead's current campaign");
  const index = read("src/pages/Index.tsx");
  ok((index.match(/hideCreate=\{viewerRole !== 'admin'\}/g) ?? []).length === 2, "Find Leads: Sales cannot create or manage campaigns from either picker");
  const perf = read("src/lib/salesPerformance.ts");
  ok(/const cKey = f\.lead\.campaign_id \?\? ''/.test(perf), "the Sales dashboard groups by the lead's current campaign_id (so a change shows there)");
  ok(refusalText("unknown_campaign") === "That campaign no longer exists", "a plain refusal for a deleted campaign");
}

/* ── 10–11. AVAILABLE TO CLAIM + OWNERSHIP LABELS ──────────────────────────────────────────────── */
console.log("\n── available to claim, ownership labels ──");
{
  const claim = read("src/components/AvailableToClaim.tsx");
  ok(/export const CLAIM_POOL_HELP = 'Leads nobody owns and nobody has contacted yet\. Claim one to add it to your pipeline/.test(claim), "the pool explains itself in one line");
  ok(/\{CLAIM_POOL_HELP\}/.test(claim) && /title=\{CLAIM_POOL_HELP\}/.test(read("src/pages/Outreach.tsx")), "…in the panel and on the tab's hover");
  ok(/sales_pool/.test(read("src/hooks/useSalesCrm.ts")) && /rpc\('claim_lead'/.test(read("src/hooks/useSalesCrm.ts")), "the list and the claim are still the server's (sales_pool, claim_lead)");
  const own = read("src/components/FindLeadsOwnership.tsx");
  ok(/<Check className="h-3\.5 w-3\.5" \/> Yours/.test(own) && /Already in your pipeline/.test(own), "Yours = already in your pipeline");
  ok(/if \(own\.state === 'claimable' && own\.leadId && onClaim\)/.test(own) && /Claim lead/.test(own), "Claim only for an unassigned, never-contacted business");
  ok(/return <AlreadyAddedBadge ownerName=\{own\.ownerName\}/.test(own), "everything else: Already added · <name>, nothing more about it");
  ok(/Already added\{ownerName \? ` · \$\{ownerName\}` : ''\}/.test(read("src/components/OwnerBadge.tsx")), "the badge reads 'Already added · <name>'");
}

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
if (f) process.exit(1);
