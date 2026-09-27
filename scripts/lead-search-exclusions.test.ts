/* LeadSearchContext's viewed / in-list businesses (2026-09-27, site-wide speed pass).
   Four promises this suite keeps:
     1. NO SILENT CAP — all three lists are paged in full (they were cut at 1,000 rows, which HID a
        business you had viewed and already hold instead of showing it marked "in list");
     2. NOT ON EVERY PAGE LOAD — the provider wraps the whole app; nothing reads the lists on mount,
        and the fetch is keyed on the user's ID, not the user object (which changes identity twice
        per load and on every tab refocus);
     3. A SEARCH FILTERS WITH WHAT IT FETCHED — never the pre-await `isExcluded` closure — and the
        fetch runs alongside the search instead of in front of it;
     4. the one other reader (the Coverage niche panel) loads the lists when it opens. */
import fs from "node:fs";
import path from "node:path";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const src = fs.readFileSync(path.join(root, "src/contexts/LeadSearchContext.tsx"), "utf8").replace(/\r\n/g, "\n");

const fetchFn = src.slice(src.indexOf("const fetchExcludedBusinesses = useCallback"), src.indexOf("const loadExclusions"));
ok(fetchFn.length > 200, "fetchExcludedBusinesses found");
for (const table of ["checked_businesses", "outreach_history", "outreach_leads"]) {
  ok(new RegExp(`all\\('Exclusions \\([a-z]+\\)', '${table}'\\)`).test(fetchFn), `${table} is read through the paged reader`);
}
ok(/fetchAllRowsParallel</.test(fetchFn) && /\.order\('id', \{ ascending: true \}\)\.range\(from, to\)/.test(fetchFn), "paged with the unique id tiebreaker");
ok(!/\.select\('business_name, google_maps_url'\)\s*,?\s*\n/.test(fetchFn) && !/supabase\.from\('outreach_leads'\)\.select\('business_name, google_maps_url'\)/.test(src), "no unpaginated exclusion read remains");
ok(/\}, \[user\?\.id\]\);\s*$/.test(fetchFn.trimEnd() + "\n") || /\}, \[user\?\.id\]\);/.test(fetchFn), "keyed on the user's ID, not the user object");

// 2. Nothing fetches the lists on mount.
ok(!/useEffect\(\(\) => \{\s*(void )?fetchExcludedBusinesses\(\);?\s*\}, \[fetchExcludedBusinesses\]\);/.test(src), "no mount-time exclusion load in the app-wide provider");

// 3. A search starts the fetch alongside the invoke and filters with the result.
const searchFn = src.slice(src.indexOf("const exclusionsP ="), src.indexOf("setLeads(filteredLeads)"));
ok(searchFn.length > 500, "search() exclusion flow found");
const searchBody = src.slice(src.indexOf("const search = useCallback"), src.indexOf("setLeads(filteredLeads)"));
ok(searchBody.length > 1000 && !/await fetchExcludedBusinesses\(\)/.test(searchBody), "the search does not wait for the lists before calling search-leads");
ok(searchFn.indexOf("const exclusionsP =") < searchFn.indexOf("functions.invoke<SearchResponse>('search-leads'"), "the lists are requested before the search is sent (so they run together)");
ok(/const ex = await exclusionsP;/.test(searchFn) && /matchesBusiness\(ex\.checked, lead\) && !matchesBusiness\(ex\.inList, lead\)/.test(searchFn), "results are filtered against the lists THIS search fetched");
ok(!/data\.leads\.filter\(lead => !isExcluded\(lead\)\)/.test(src), "the stale pre-await isExcluded closure is no longer the search filter");

// 4. The niche panel asks for the lists.
const niche = fs.readFileSync(path.join(root, "src/components/NichePanel.tsx"), "utf8");
ok(/const \{ isLeadExcluded, loadExclusions \} = useLeadSearchContext\(\);/.test(niche) && /useEffect\(\(\) => \{ void loadExclusions\(\); \}, \[loadExclusions\]\);/.test(niche), "the Coverage niche panel loads the lists when it opens");

// The ONE rule, unchanged: drop only if viewed AND not already held.
{
  type B = { business_name: string; google_maps_url: string | null };
  type L = { name: string; googleMapsUrl?: string };
  const matches = (list: B[], lead: L) => list.some((b) => b.business_name === lead.name || (!!lead.googleMapsUrl && b.google_maps_url === lead.googleMapsUrl));
  const dropped = (ex: { checked: B[]; inList: B[] }, lead: L) => matches(ex.checked, lead) && !matches(ex.inList, lead);
  // A held business beyond the old 1,000-row window: viewed AND in the list → kept (was hidden).
  const inList: B[] = Array.from({ length: 5400 }, (_, i) => ({ business_name: `Biz ${i}`, google_maps_url: `u${i}` }));
  const checked: B[] = [{ business_name: "Biz 4321", google_maps_url: "u4321" }, { business_name: "Viewed only", google_maps_url: "v" }];
  ok(!dropped({ checked, inList }, { name: "Biz 4321", googleMapsUrl: "u4321" }), "a held business past row 1,000 is kept and marked, not hidden");
  ok(dropped({ checked, inList: inList.slice(0, 1000) }, { name: "Biz 4321", googleMapsUrl: "u4321" }), "…which the 1,000-row cut used to hide");
  ok(dropped({ checked, inList }, { name: "Viewed only", googleMapsUrl: "v" }), "a viewed-only business is still decluttered");
  const matchSrc = src.slice(src.indexOf("const matchesBusiness = "), src.indexOf("const isExcluded"));
  ok(/b\.business_name === lead\.name \|\|\s*\n?\s*\(lead\.googleMapsUrl && b\.google_maps_url === lead\.googleMapsUrl\)/.test(matchSrc), "the matching rule (name OR map URL) is the provider's own");
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nALL PASS");
