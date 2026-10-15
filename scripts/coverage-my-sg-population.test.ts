/* Approximate populations for the Malaysia / Singapore Coverage towns (2026-10-15, src/lib/abroadTownPopulation.ts).
   Pins the fixed table figure by figure (each checked against its source — docs/coverage-my-sg-population.md), that
   blanks stay null and show as a dash (never 0), that no town is added, and that Singapore as a whole has neither a
   figure nor a population filter. */
import { readFileSync } from "node:fs";
import { ABROAD_TOWNS } from "../src/lib/coverageCountries.ts";
import {
  TOWN_POPULATION, townPopulation, populationSourcesFor, populationFilterShown, filterByPopulationBand,
  MY_COUNCIL_SOURCE, MY_DISTRICT_SOURCE, SG_SOURCE,
} from "../src/lib/abroadTownPopulation.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

const EXPECTED: Record<"Malaysia" | "Singapore", Record<string, number | null>> = {
  Malaysia: {
    "Kuala Lumpur": 1982112, "Petaling Jaya": 771687, "Shah Alam": 812327, "Subang Jaya": 902086, "Klang": 902025,
    "Johor Bahru": 858118, "George Town": 794313, "Ipoh": 759952, "Seremban": 681541, "Melaka": 453904,
    "Kuching": 349147, "Kota Kinabalu": 500425, "Kuantan": 548014, "Alor Setar": 423868, "Kuala Terengganu": 375424,
    "Kota Bharu": 396193, "Cyberjaya": null, "Putrajaya": 109202, "Kajang": 1047356, "Puchong": null,
    "Batu Pahat": 401210, "Kluang": 323762, "Kulai": 294156, "Muar": 314776, "Sibu": 248064, "Bintulu": 178646,
    "Taiping": 304023, "Sungai Petani": 545053,
  },
  Singapore: {
    "Singapore": null, "Orchard": 1550, "Marina Bay": null, "Jurong East": 72160, "Tampines": 296060,
    "Woodlands": 255280, "Ang Mo Kio": 159330, "Bedok": 272120, "Clementi": 104350, "Bukit Timah": 86720, "Changi": 1950,
  },
};

console.log("── THE TABLE ──");
for (const c of ["Malaysia", "Singapore"] as const) {
  const listed = ABROAD_TOWNS[c].map((t) => t.name).sort();
  const tabled = Object.keys(TOWN_POPULATION[c]).sort();
  ok(JSON.stringify(listed) === JSON.stringify(tabled), `${c}: one entry per Coverage town, no town added or missing`);
  ok(JSON.stringify(Object.keys(EXPECTED[c]).sort()) === JSON.stringify(tabled), `${c}: this test pins every town`);
  for (const [name, want] of Object.entries(EXPECTED[c])) {
    const got = TOWN_POPULATION[c][name];
    ok(got?.population === want, `${c} ${name}: ${want === null ? "blank (null)" : want.toLocaleString("en-GB")}`);
    ok(want === null ? got.source === null : got.source !== null && !!got.basis, `${c} ${name}: ${want === null ? "no source claimed" : "has its source and basis"}`);
  }
}
ok(Object.values(TOWN_POPULATION).flatMap((m) => Object.values(m)).every((t) => t.population !== 0), "no figure is 0 (a blank is null)");
ok(townPopulation("Malaysia", "Pasir Gudang").population === null, "a town only a lead named is blank, never a guess");

console.log("── SOURCES ──");
ok(MY_COUNCIL_SOURCE.year === 2020 && MY_DISTRICT_SOURCE.year === 2020 && SG_SOURCE.year === 2026, "years: Malaysia census 2020, Singapore June 2026");
ok(populationSourcesFor("Malaysia").length === 2 && populationSourcesFor("Singapore").length === 1, "the sources named under each country's table");
ok(TOWN_POPULATION.Malaysia.Kluang.source === MY_DISTRICT_SOURCE && TOWN_POPULATION.Malaysia.Ipoh.source === MY_COUNCIL_SOURCE, "district figures are labelled as district figures");

console.log("── SINGAPORE AS A WHOLE ──");
ok(TOWN_POPULATION.Singapore.Singapore.population === null, "Singapore (the city) has no figure");
ok(!populationFilterShown("Singapore") && populationFilterShown("Malaysia") && populationFilterShown("UK"), "no population filter for Singapore");

console.log("── MALAYSIA'S FILTER ──");
const rows = [{ name: "A", population: 1_000_000 }, { name: "B", population: 200_000 }, { name: "C", population: null }];
ok(filterByPopulationBand(rows, { min: null, max: null }).length === 3, "no bound → every town, blanks included");
ok(filterByPopulationBand(rows, { min: 300_000, max: null }).map((r) => r.name).join() === "A", "a minimum keeps the bigger towns; a blank never fits");
ok(filterByPopulationBand(rows, { min: null, max: 500_000 }).map((r) => r.name).join() === "B", "a maximum keeps the smaller; a blank is not 0");

console.log("── THE PAGE ──");
const page = readFileSync(new URL("../src/pages/Coverage.tsx", import.meta.url), "utf8");
const hook = readFileSync(new URL("../src/hooks/useCoverage.ts", import.meta.url), "utf8");
ok(/population: townPopulation\(country, t\.name\)\.population/.test(hook), "Coverage rows take the figure from the table");
ok(/showPopFilter = populationFilterShown\(country\)/.test(page) && /!isUk && showPopFilter &&/.test(page), "the page asks populationFilterShown before drawing the abroad filter");
ok(/t\.population === null \|\| t\.population === undefined \? '—'/.test(page), "a blank figure is drawn as a dash");
ok(/populationSourcesFor\(country\)\.map/.test(page) && /\(\{s\.year\}\)/.test(page), "the source and year are shown under the table");
ok(!/we have no source for them/.test(page), "the old 'no population figures' note is gone");

console.log(f ? `\n${f} FAILED` : "\nall passed");
if (f) process.exit(1);
