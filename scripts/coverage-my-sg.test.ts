/* Coverage for Malaysia and Singapore (2026-10-14): the country choice, the town list, the language-schools trade,
   and imported leads (Ethan's language-school file: batch, country, messy city text) counting under the right
   country, town and trade. The UK view must count exactly what it always did. */
import { canonicalTrade, tradeSearchWord, TRADES } from "../src/lib/trades.ts";
import { SUGGESTED_LOCATIONS } from "../src/lib/locationPicker.ts";
import { RESEARCH_FILE_DEFAULT_TRADE } from "../src/lib/csvLeadImport.ts";
import {
  ABROAD_TOWNS, COVERAGE_COUNTRIES, normaliseCoverageCountry, resolveCoverageTown, abroadCountryOfLocation, pairsForCountry,
} from "../src/lib/coverageCountries.ts";
import { countLeadsByPair, coverageKey, findLeadsHref, foundAddedByPair, workersByPair } from "../src/lib/coverageState.ts";
import { readFileSync } from "node:fs";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

console.log("── THE TRADE ──");
ok(canonicalTrade("Language schools")?.slug === "language-school", "Language schools is a trade");
ok(canonicalTrade(RESEARCH_FILE_DEFAULT_TRADE)?.slug === "language-school", "the research import's default trade maps onto it");
ok(canonicalTrade("language school")?.slug === "language-school", "the Singapore search's 'language school' maps onto it");
ok(canonicalTrade("English language schools")?.slug === "language-school", "English language schools maps onto it");
ok(tradeSearchWord("Language schools") === "Language schools", "searched and stored as 'Language schools' (what the import stores)");
ok(canonicalTrade("school") === null && canonicalTrade("driving school")?.slug === "driving-instructor", "bare 'school' is not this trade; driving school is still driving instructors");
ok(TRADES.every((t) => canonicalTrade(t.label)?.slug === t.slug), "every label round-trips");
ok(["Roofers", "Web designers / digital agencies", "Language schools"].every((l) => TRADES.some((t) => t.label === l)), "Roofers, Web designers and Language schools all listed");

console.log("── THE COUNTRIES AND TOWNS ──");
ok(COVERAGE_COUNTRIES.join(",") === "UK,Malaysia,Singapore,Australia", "UK, Malaysia, Singapore, Australia (2026-10-21, scripts/australia-coverage.test.ts)");
ok(normaliseCoverageCountry(null) === "UK" && normaliseCoverageCountry("India") === "UK" && normaliseCoverageCountry("Malaysia") === "Malaysia", "unknown / blank → UK (the default)");
for (const c of ["Malaysia", "Singapore"] as const) {
  const names = new Set(ABROAD_TOWNS[c].map((t) => t.name));
  ok(SUGGESTED_LOCATIONS[c].every((n) => names.has(n)), `every Find Leads ${c} suggestion is a Coverage town (reused)`);
  ok(names.size === ABROAD_TOWNS[c].length, `${c}: no town listed twice`);
}
for (const [raw, want] of [["Kuala Lumpur", "Kuala Lumpur"], ["George Town", "George Town"], ["Penang", "George Town"], ["Johor Bahru", "Johor Bahru"],
  ["Kuching", "Kuching"], ["Ipoh", "Ipoh"], ["Kota Kinabalu", "Kota Kinabalu"], ["Malacca", "Melaka"], ["Melaka", "Melaka"],
  ["Shah Alam", "Shah Alam"], ["Petaling Jaya", "Petaling Jaya"]] as const) {
  ok(resolveCoverageTown("Malaysia", raw)?.name === want && resolveCoverageTown("Malaysia", raw)?.listed === true, `Malaysia: "${raw}" → ${want}`);
}
ok(resolveCoverageTown("Singapore", "Singapore")?.name === "Singapore", "Singapore itself is a town");
ok(Object.values(ABROAD_TOWNS).flat().every((t) => !("population" in t)), "the town list itself carries no population (figures live only in abroadTownPopulation.ts)");

console.log("── IMPORTED CITY TEXT (Ethan's file, as written) ──");
const cases: Array<[string, "Malaysia" | "Singapore", string, boolean]> = [
  ["Kuala Lumpur (Cheras)", "Malaysia", "Kuala Lumpur", true],
  ["Kuala Lumpur (Desa ParkCity / Plaza Arkadia)", "Malaysia", "Kuala Lumpur", true],
  ["Ipoh, Perak (online classes also offered)", "Malaysia", "Ipoh", true],
  ["Kota Kinabalu, Sabah", "Malaysia", "Kota Kinabalu", true],
  ["Kuching, Sarawak", "Malaysia", "Kuching", true],
  ["Melaka City, Melaka", "Malaysia", "Melaka", true],
  ["Tangga Batu / Tanjung Kling, Melaka", "Malaysia", "Melaka", true],
  ["Teluk Kumbar / Balik Pulau, Penang", "Malaysia", "George Town", true],
  ["Skudai (Johor Bahru)", "Malaysia", "Johor Bahru", true],
  ["Johor Bahru (Tebrau/Austin Perdana; Taman Perling branch)", "Malaysia", "Johor Bahru", true],
  ["Shah Alam (Kota Kemuning)", "Malaysia", "Shah Alam", true],
  ["Pagoh, Muar", "Malaysia", "Muar", true],
  ["Pasir Gudang (Masai)", "Malaysia", "Pasir Gudang", false],
  ["Lukut, Port Dickson, Negeri Sembilan", "Malaysia", "Lukut", false],
  ["Kuala Lumpur, Malaysia", "Malaysia", "Kuala Lumpur", true],
  ["Singapore", "Singapore", "Singapore", true],
  ["Online; team reports tutors in Singapore, Malaysia, Australia and Brunei", "Singapore", "Singapore", true],
  ["orchard, singapore", "Singapore", "Orchard", true],
];
for (const [raw, c, name, listed] of cases) {
  const r = resolveCoverageTown(c, raw);
  ok(r?.name === name && r.listed === listed, `${c}: "${raw}" → ${name}${listed ? "" : " (its own row)"} (${r?.name}/${r?.listed})`);
}
ok(resolveCoverageTown("Malaysia", "") === null && resolveCoverageTown("Singapore", "  ") === null, "a blank city counts nowhere");

console.log("── SEARCH RUNS (no stored country) ──");
ok(abroadCountryOfLocation("orchard, singapore") === "Singapore", "'orchard, singapore' is a Singapore run");
ok(abroadCountryOfLocation("Kuala Lumpur, Malaysia") === "Malaysia" && abroadCountryOfLocation("Kuala Lumpur") === "Malaysia", "KL runs are Malaysian");
ok(["Wisbech", "Kettering", "Perth", "Newport", "George", ""].every((l) => abroadCountryOfLocation(l) === null), "UK (and other) runs stay out");

console.log("── PAIRS PER COUNTRY ──");
const lead = (trade: string, town: string, country: string | null) => ({ trade, town, country });
const leads = [
  lead("plumber", "Wisbech", "UK"), lead("plumbers", "Wisbech", null), lead("locksmiths", "Bourne", "USA"),
  lead("Language schools", "Kuala Lumpur", "Malaysia"), lead("Language schools", "Kuala Lumpur (Cheras)", "Malaysia"),
  lead("Language schools", "Penang", "Malaysia"), lead("Language schools", "Pasir Gudang (Masai)", "Malaysia"),
  lead("Language schools", "Singapore", "Singapore"),
];
const worked = [lead("plumber", "Wisbech", "UK"), lead("Language schools", "Kuala Lumpur", "Malaysia")];
const workedBy = [{ trade: "plumber", town: "Wisbech", country: "UK", users: [{ id: "u1", n: 1 }] },
  { trade: "Language schools", town: "Kuala Lumpur", country: "Malaysia", users: [{ id: "u2", n: 1 }] }];
const runs = [{ trade: "plumber", town: "Wisbech", found: { a: false }, added: {} },
  { trade: "language school", town: "orchard, singapore", found: { b: true }, added: { b: true } }];
const raw = { leads, worked, workedBy, runs };

const uk = pairsForCountry("UK", raw);
ok(uk.leads.length === 3 && uk.leads.every((p) => p.country !== "Malaysia" && p.country !== "Singapore"), "UK: every non-MY/SG lead kept (UK, blank and the mis-stored USA one), MY/SG left out");
ok(uk.runs === runs, "UK: the search runs are untouched");
ok(countLeadsByPair(uk.leads).get(coverageKey("Plumbers", "Wisbech")) === 2, "UK: Wisbech plumbers still 2 (plumber + plumbers fold as before)");
ok(workersByPair(uk.workedBy).get(coverageKey("Plumbers", "Wisbech"))?.[0]?.id === "u1", "UK: who worked Wisbech unchanged");
ok(uk.extraTowns.length === 0, "UK: no extra towns");
const unchanged = { leads: leads.slice(0, 3), worked: worked.slice(0, 1), workedBy: workedBy.slice(0, 1), runs };
const u2 = pairsForCountry("UK", unchanged);
ok(JSON.stringify(u2.leads) === JSON.stringify(unchanged.leads) && JSON.stringify(u2.worked) === JSON.stringify(unchanged.worked), "UK: a UK-only book comes back identical");

const my = pairsForCountry("Malaysia", raw);
const myCounts = countLeadsByPair(my.leads);
ok(myCounts.get(coverageKey("Language schools", "Kuala Lumpur")) === 2, "Malaysia: Kuala Lumpur has 2 language schools (incl. Cheras)");
ok(myCounts.get(coverageKey("Language schools", "George Town")) === 1, "Malaysia: Penang counts under George Town");
ok(myCounts.get(coverageKey("Language schools", "Pasir Gudang")) === 1 && my.extraTowns.map((t) => t.name).join() === "Pasir Gudang", "Malaysia: an unlisted town is its own row, counted");
ok(!my.leads.some((p) => p.town === "Wisbech" || p.town === "Singapore"), "Malaysia: no UK or Singapore lead");
ok(new Set(my.worked.map((p) => coverageKey(p.trade, p.town))).has(coverageKey("Language schools", "Kuala Lumpur")), "Malaysia: KL contacted");
ok(workersByPair(my.workedBy).get(coverageKey("Language schools", "Kuala Lumpur"))?.[0]?.id === "u2", "Malaysia: KL worked by u2");
ok((my.runs ?? []).length === 0, "Malaysia: the Singapore search run is not here");

const sg = pairsForCountry("Singapore", raw);
ok(countLeadsByPair(sg.leads).get(coverageKey("Language schools", "Singapore")) === 1 && sg.leads.length === 1, "Singapore: one lead, under Singapore");
const fa = foundAddedByPair(sg.runs).get(coverageKey("Language schools", "Orchard"));
ok(fa?.foundWithoutWebsite === 1 && fa?.addedWithoutWebsite === 1, "Singapore: the 'language school / orchard, singapore' run shows under Orchard, Language schools");

console.log("── FIND LEADS FROM A ROW ──");
const p = new URLSearchParams(findLeadsHref("language schools", "Kuala Lumpur, Malaysia", "Malaysia").split("?")[1]);
ok(p.get("country") === "Malaysia" && p.get("location") === "Kuala Lumpur, Malaysia" && p.get("run") === "search" && !p.get("confirm"), "the row's search names the country");
ok(!new URLSearchParams(findLeadsHref("plumber", "Kettering").split("?")[1]).has("country"), "no country argument → no country param (unchanged)");
const sfSrc = readFileSync(new URL("../src/components/SearchForm.tsx", import.meta.url), "utf8");
ok(/initialCountry && selectedCountry !== initialCountry\) return;/.test(sfSrc), "Find Leads waits for the asked-for country before the arrival search runs");
const pageSrc = readFileSync(new URL("../src/pages/Coverage.tsx", import.meta.url), "utf8");
ok(/useCoverage\(country\)/.test(pageSrc) && /if \(isUk\) return applyFilters\(/.test(pageSrc), "the page grades per country; the UK keeps its population band");
const fnSrc = readFileSync(new URL("../supabase/functions/coverage/index.ts", import.meta.url), "utf8");
ok(/derived_town, (?:coverage_town, address, )?country, status/.test(fnSrc) && /const pair = \{ trade, town, country \}/.test(fnSrc), "the endpoint sends each lead's own country");

console.log("── THE IMPORT KEEPS THE BATCH NAME (20261027090000) ──");
{
  const { readdirSync } = await import("node:fs");
  const dir = new URL("../supabase/migrations/", import.meta.url);
  const defs = readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()
    .filter((n) => /create or replace function public\.import_leads_v2\(/i.test(readFileSync(new URL(n, dir), "utf8")));
  const newest = readFileSync(new URL(defs[defs.length - 1], dir), "utf8");
  ok(defs[defs.length - 1] >= "20261027090000", `the newest import_leads_v2 is the fixed one (${defs[defs.length - 1]})`);
  const batchLine = newest.split(/\r?\n/).find((l) => l.includes("v_batch text :=")) ?? "";
  ok(batchLine.includes("regexp_replace(coalesce(_batch, ''), '\\s+', ' ', 'g')"), "the batch name is tidied with \\s+ (a bare 's+' deleted every letter s)");
}

console.log(f ? `\n${f} FAILED` : "\nall passed");
if (f) process.exit(1);
