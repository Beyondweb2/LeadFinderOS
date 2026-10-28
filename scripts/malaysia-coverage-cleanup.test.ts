/* Malaysia Coverage clean-up (2026-10-19, feat/malaysia-coverage-cleanup; docs/coverage-my-sg-population.md).
   1. Imported place text is read, never rewritten: a town (listed, GeoNames, or as written) or UNCLEAR (a state, a
      region, several places, not a place) — every real string from the live book on 2026-10-19 is pinned here.
   2. Every Malaysian town row gets a state and, where GeoNames has one, a real figure; nothing is invented.
   3. Unclear text leaves the town list and is counted per lead.
   4. The UK view counts exactly what it did (regression).
   5. Imported leads count as already added: the migration's rules, the Find Leads marker (avatar, "Added by",
      not clickable), the niche panel's batch add. */
import { readFileSync, readdirSync } from "node:fs";
import { readMalaysiaPlace, datasetPlace, townFromAddress, malaysianStateOf, UNCLEAR_WORDS } from "../src/lib/malaysiaPlaces.ts";
import { ABROAD_TOWNS, pairsForCountry } from "../src/lib/coverageCountries.ts";
import { listedMalaysianTown, coveragePairsFor } from "../src/lib/malaysiaCoverage.ts";
import { townPopulation } from "../src/lib/abroadTownPopulation.ts";
import { MALAYSIA_PLACES } from "../src/data/malaysiaPlaces.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const r = (s: string) => readMalaysiaPlace(s, listedMalaysianTown);
const town = (s: string) => { const v = r(s); return v?.kind === "town" ? v.name : null; };
const unclear = (s: string) => { const v = r(s); return v?.kind === "unclear" ? v.reason : null; };

console.log("── THE DATASET ──");
ok(MALAYSIA_PLACES.length > 700 && MALAYSIA_PLACES.every((p) => p[3] > 0 && Number.isInteger(p[3])), "GeoNames places, every one with its own whole-number figure above 0");
ok(read("src/data/malaysiaPlaces.ts").includes("CC BY 4.0") && read("src/data/malaysiaPlaces.ts").includes("download.geonames.org"), "the generated file names its source and licence");
ok(datasetPlace("Simpang Empat") === "ambiguous", "three same-named places, no state → none chosen");
ok(datasetPlace("Kepala Batas", "Kedah") !== "ambiguous" && (datasetPlace("Kepala Batas", "Kedah") as { state: string }).state === "Kedah", "…the state picks one");
ok(datasetPlace("Air Itam") !== null && (datasetPlace("Air Itam") as { name: string }).name === "Ayer Itam", "a known spelling reaches the place's own name");
ok(datasetPlace("Nilai") === null, "no alternate names: 'Nilai' never borrows the village Kampung Baharu Nilai's figure");

console.log("── TOWNS (as written in the imported files) ──");
const towns: Array<[string, string, string | null]> = [
  ["Kuala Lumpur", "Kuala Lumpur", "Kuala Lumpur"], ["Penang", "George Town", "Penang"], ["Johor Bahru, Johor", "Johor Bahru", "Johor"],
  ["Johor Bharu", "Johor Bahru", "Johor"], ["  johor   bahru ", "Johor Bahru", "Johor"],
  ["Kuala Lumpur (Cheras)", "Kuala Lumpur", "Kuala Lumpur"], ["Bayan Lepas, Penang", "Bayan Lepas", "Penang"],
  ["Simpang Ampat", "Simpang Ampat", null], ["Gelang Patah", "Gelang Patah", "Johor"], ["Seri Kembangan, Selangor", "Seri Kembangan", "Selangor"],
  ["Tikam Batu, Sungai Petani, Kedah", "Sungai Petani", "Kedah"], ["Skudai (Johor Bahru)", "Johor Bahru", "Johor"],
  ["Kuala Lumpur; corporate and individual training", "Kuala Lumpur", "Kuala Lumpur"], ["Kuala Lumpur / Epsom campus", "Kuala Lumpur", "Kuala Lumpur"],
  ["Penang / Malaysia in-house", "George Town", "Penang"], ["Miri, Sarawak (Miri-specific classes; site publishes Cyberjaya HQ only)", "Miri", "Sarawak"],
  ["Melaka, Melaka", "Melaka", "Melaka"], ["Kota Kemuning, Selangor", "Kota Kemuning", "Selangor"], ["Telok Panglima Garang", "Teluk Panglima Garang", "Selangor"],
];
for (const [raw, name, state] of towns) {
  const v = r(raw);
  ok(v?.kind === "town" && v.name === name && v.state === state, `"${raw}" → ${name} [${state ?? "—"}] (${v?.kind === "town" ? `${v.name} [${v.state}]` : v?.kind})`);
}

console.log("── UNCLEAR (Paul's examples and the rest of the live book) ──");
const unclears: Array<[string, string]> = [
  ["Penang and Kuala Lumpur", "several"], ["Klang Valley", "region"], ["Sabah", "state"], ["Kedah", "state"], ["Kelantan", "state"],
  ["Klang Valley (Subang Jaya, Petaling Jaya, Shah Alam, Kuala Lumpur)", "region"], ["Shah Alam / Kuala Lumpur", "several"],
  ["Ipoh / Kuala Lumpur", "several"], ["Kuala Lumpur, Puchong and Penang", "several"], ["Kajang/Semenyih/Bangi, Selangor", "several"],
  ["Ampang, Puchong and Cheras (Selangor/Kuala Lumpur)", "several"], ["Melaka; Johor Bahru (Mount Austin and Bukit Indah), Johor", "several"],
  ["Miri and Bintulu, Sarawak", "several"], ["Malaysia corporate training", "not_a_place"], ["Tanjung Tokong / Kuala Lumpur", "several"],
];
for (const [raw, reason] of unclears) ok(unclear(raw) === reason, `"${raw}" → ${UNCLEAR_WORDS[reason as keyof typeof UNCLEAR_WORDS]} (${unclear(raw) ?? town(raw)})`);
ok(r("") === null && r("   ") === null, "blank → counted nowhere");
ok(malaysianStateOf("Pulau Pinang") === "Penang" && malaysianStateOf("Kuantan") === null, "states by every spelling");

console.log("── STATE AND POPULATION FOR EVERY ROW ──");
ok(ABROAD_TOWNS.Malaysia.every((t) => !!t.region), "every listed Malaysian town has its state");
for (const [n, st] of [["Cyberjaya", "Selangor"], ["Puchong", "Selangor"], ["Bayan Lepas", "Penang"], ["Seri Kembangan", "Selangor"], ["Gelang Patah", "Johor"]] as const) {
  const p = townPopulation("Malaysia", n, st);
  const d = datasetPlace(n, st);
  ok(p.population !== null && d !== null && d !== "ambiguous" && p.population === d.population, `${n}: GeoNames' own figure (${p.population?.toLocaleString("en-GB")})`);
}
ok(townPopulation("Malaysia", "Simpang Ampat", null).population === null, "Simpang Ampat: no figure in the dataset → blank");

console.log("── PAIRS: UNCLEAR LEAVES THE TOWN LIST ──");
const lead = (trade: string, town: string, country: string | null) => ({ trade, town, country });
const p = {
  leads: [lead("Accountants", "Penang and Kuala Lumpur", "Malaysia"), lead("Dentists", "Penang and Kuala Lumpur", "Malaysia"),
    lead("Accountants", "Sabah", "Malaysia"), lead("Accountants", "Simpang Ampat", "Malaysia"), lead("Accountants", "Bayan Lepas, Penang", "Malaysia"),
    lead("Plumbers", "Kettering", null), lead("Plumbers", "Wisbech", "UK")],
  worked: [lead("Accountants", "Sabah", "Malaysia")],
};
const my = coveragePairsFor("Malaysia", p);
ok(my.leads.map((l) => l.town).join() === "Simpang Ampat,Bayan Lepas", "only real towns are counted as town rows");
ok(my.worked.length === 0, "a worked lead with unclear text is under no town");
ok(my.unclearPlaces.map((u) => `${u.text}:${u.leads}:${u.reason}`).join() === "Penang and Kuala Lumpur:2:several,Sabah:1:state", "unclear places, with how many leads each (all trades), most first");
ok(my.extraTowns.map((t) => `${t.name}/${t.region}`).join() === "Simpang Ampat/null,Bayan Lepas/Penang", "a lead's own town row carries its state (blank only when unknown)");

console.log("── UK REGRESSION ──");
const uk = coveragePairsFor("UK", p);
const ukBefore = pairsForCountry("UK", p);
ok(JSON.stringify({ ...uk, unclearPlaces: undefined }) === JSON.stringify({ ...ukBefore, unclearPlaces: undefined }), "UK pairs are exactly pairsForCountry's (unchanged code)");
ok(uk.leads.map((l) => l.town).join() === "Kettering,Wisbech" && uk.worked.length === 0, "the UK keeps every non-Malaysia/Singapore pair, as before");
ok(uk.unclearPlaces.length === 0 && uk.extraTowns.length === 0, "the UK has no unclear group and no extra rows");
ok(uk.runs === undefined, "UK runs pass through untouched");
const page = read("src/pages/Coverage.tsx");
ok(/country === 'Malaysia' && !isLoading && !error && unclearPlaces\.length > 0/.test(page), "the Unclear places group is drawn for Malaysia only");
ok(/defaultOpen=\{false\}/.test(page) && /Unclear places \(\$\{unclearPlaces\.length\}\)/.test(page), "…collapsed by default, titled with its count");
ok(/if \(isUk\) return applyFilters\(gradeFor\(trade, false\), \{ region, minPopulation: minPop, maxPopulation: maxPop \}\);/.test(page), "the UK rows and band are untouched");

console.log("── ADDRESS SUGGESTION (never written) ──");
ok(townFromAddress("12 Jalan SS15/4, 47500 Subang Jaya, Selangor, Malaysia", listedMalaysianTown) === "Subang Jaya", "the town in a full address");
ok(townFromAddress("", listedMalaysianTown) === null, "no address → no suggestion");

console.log("── IMPORTED LEADS COUNT AS ADDED: THE MIGRATION ──");
const migName = readdirSync(new URL("../supabase/migrations/", import.meta.url)).find((n) => n.endsWith("_imported_leads_identity.sql"))!;
const mig = read(`supabase/migrations/${migName}`);
ok(!!migName, "the migration exists");
/* The new part (everything before the re-stated live coverage_add_leads, which keeps its own inserts) changes no data. */
const newPart = mig.slice(0, mig.indexOf("CREATE OR REPLACE FUNCTION public.coverage_add_leads")).replace(/--.*$/gm, "");
ok(newPart.length > 1000 && !/\b(drop|truncate|delete\s+from|alter\s+table|update\s+public\.|insert\s+into)/i.test(newPart), "additive only: the new functions drop, alter or write nothing");
const liveCal = mig.slice(mig.indexOf("CREATE OR REPLACE FUNCTION public.coverage_add_leads"));
const oldFile = read("supabase/migrations/20261031090000_coverage_add_leads.sql").replace(/\r\n/g, "\n");
ok((liveCal.match(/insert into public\./g) ?? []).length === (oldFile.match(/insert into public\./g) ?? []).length, "coverage_add_leads writes exactly the tables it wrote before");
const idFn = mig.slice(mig.indexOf("create or replace function public._lead_identity_rows"), mig.indexOf("$function$;"));
ok(/l\.place_id = it\.pid[\s\S]*phone_key\(l\.phone\) = it\.pk[\s\S]*l\.google_maps_url = it\.mu/.test(idFn), "the old three checks stay first, in their order");
ok((idFn.match(/where it\.abroad and/g) ?? []).length === 3, "the three new checks run only for a non-UK item");
ok(/upper\(it0\.ctry\) not in \('UK', 'GB', 'UNITED KINGDOM'\)/.test(idFn) && /it0\.ctry is not null/.test(idFn), "absent country = UK = the old lookup");
ok(/my_sg_e164\(it0\.x->>'phone', it0\.ctry\)/.test(idFn) && /website_identity\(l\.website\) = it\.sid and l\.country = it\.ctry/.test(idFn) && /business_name_key\(l\.business_name\) = it\.nkey/.test(idFn), "phone (+60/+65), website and name + town, each in the same country");
ok(/security definer/.test(idFn) && /my_role\(\)/.test(idFn) && /raise exception 'no_role'/.test(idFn), "tenancy unchanged: definer, role required");
ok(/'country', c_country, 'website', c_site, 'name', c_name, 'town', c_town/.test(mig), "coverage_add_leads passes the new keys to the same lookup (one rule for marker and dedupe)");

console.log("── THE MARKER ──");
const own = read("src/components/FindLeadsOwnership.tsx");
const table = read("src/components/LeadsTable.tsx");
const index = read("src/pages/Index.tsx");
ok(/`Added by \$\{addedByName\}`/.test(own) && /AlreadyAddedMarker/.test(own) && /aria-disabled="true"/.test(own), "the marker says 'Added by <name>' and is not a control");
ok(!/<Button|onClick/.test(own.slice(own.indexOf("export function AlreadyAddedMarker"))), "…it has no button and no click");
ok(/<Check className="h-3\.5 w-3\.5" \/>/.test(own.slice(own.indexOf("export function AlreadyAddedMarker"))), "no owner on record → a neutral In CRM tick");
ok(/viewerRole === 'admin' && !crm\?\.inCrm && isAlreadyAdded\(ownership\?\.\(lead\)\)/.test(table) && /viewerRole === 'admin' && isAlreadyAdded\(ownership\?\.\(lead\)\) \?/.test(table), "desktop AND phone rows show it instead of Add to CRM");
ok(/country: l\.searchCountry \?\? identityCountry, website: l\.websiteUrl \?\? null, name: l\.name/.test(index), "Find Leads sends the country, website and name to the lookup");

console.log("── THE NICHE PANEL'S ADD ──");
const niche = read("src/components/NichePanel.tsx");
ok(/await bulkAdd\(rowLeads as BulkAddLead\[\]/.test(niche) && !/addLead\(/.test(niche), "the niche panel adds through Find Leads' batch add, never one addLead per lead");
ok(/addSummaryTitle\(res\.summary\)/.test(niche) && /Added \{state\.added\}, skipped \{state\.dupes\}/.test(niche), "…and says 'Added N, skipped M'");

console.log("── NO EDGE FUNCTION REACHES THE NEW READING ──");
const cc = read("src/lib/coverageCountries.ts");
ok(!/malaysiaPlaces|malaysiaCoverage/.test(cc), "coverageCountries.ts (reached by 17 edge functions via cleanBusinessName) does not import the new reading");
ok(/coveragePairsFor\(country, rawPairs\)/.test(read("src/hooks/useCoverage.ts")), "the Coverage page reads its pairs through coveragePairsFor");

console.log(f ? `\n${f} FAILED` : "\nall passed");
if (f) process.exit(1);
