# Coverage: approximate populations for Malaysia and Singapore (2026-10-15)

Branch `feat/my-sg-town-population`. Code: `src/lib/abroadTownPopulation.ts` (the fixed table), read by
`src/hooks/useCoverage.ts` and drawn by `src/pages/Coverage.tsx`. Test: `scripts/coverage-my-sg-population.test.ts`.

## Rules

- A FIXED table in code. No live API, no migration, nothing stored.
- Only the towns Coverage already lists (`ABROAD_TOWNS` in `coverageCountries.ts`). None added. A town that only a lead
  named (shown as "from your leads") is blank.
- Never an invented number. No clean source figure → `null` → a dash on screen, never 0.
- Every figure is approximate and shown with "≈". Malaysia's figures cover the council area or district, which is wider
  than the town itself. Singapore's are residents only (citizens and PRs), so business districts read small.
- Singapore as a whole has no figure and no population filter (`populationFilterShown`). It is one city.
- Malaysia has its own filter (`filterByPopulationBand`). Blank bounds mean every town shows. Once a bound is set, a
  town with no figure is left out, the same rule as the UK band.

## Sources (each figure checked on 2026-10-15)

**M1. Wikipedia, "List of cities and towns in Malaysia by population"**, 2020 column (DOSM Population and Housing
Census of Malaysia 2020, local-authority areas):
https://en.wikipedia.org/wiki/List_of_cities_and_towns_in_Malaysia_by_population. Read through WebFetch and checked
again against the page's raw wikitext (`?action=raw`).

**M2. Wikipedia, "List of districts in Malaysia"**, Population (2020) column (DOSM census 2020):
https://en.wikipedia.org/wiki/List_of_districts_in_Malaysia. Raw wikitext. Used only where M1 has no row (M1 lists
places over 250,000 only).

**S1. Singapore Department of Statistics, "Singapore Residents by Planning Area / Subzone, Single Year of Age and
Sex, June 2026"** (xlsx, generated 25/9/2026, planning areas per URA Master Plan 2025, rounded to the nearest 10),
from https://www.singstat.gov.sg/find-data/explore-data-themes/population/geographic-distribution/latest-news-data
(file `/files/976b7278-e255-435e-90a6-e6658561caa4.xlsx`). The figure is the planning area's "Total / Total / Total"
row. Island total in that file: 4,231,520. It is not shown.

| Country | Town | Figure | Covers | Source |
|---|---|---|---|---|
| MY | Kuala Lumpur | 1,982,112 | Federal Territory of Kuala Lumpur | M1 |
| MY | Petaling Jaya | 771,687 | Petaling Jaya City Council area | M1 |
| MY | Shah Alam | 812,327 | Shah Alam City Council area | M1 |
| MY | Subang Jaya | 902,086 | Subang Jaya City Council area | M1 |
| MY | Klang | 902,025 | Klang council area | M1 |
| MY | Johor Bahru | 858,118 | Johor Bahru City Council area | M1 |
| MY | George Town | 794,313 | Penang Island City Council area | M1 |
| MY | Ipoh | 759,952 | Ipoh City Council area | M1 |
| MY | Seremban | 681,541 | Seremban City Council area | M1 |
| MY | Melaka | 453,904 | Malacca City Council area | M1 |
| MY | Kuching | 349,147 | Kuching North and South councils | M1 |
| MY | Kota Kinabalu | 500,425 | Kota Kinabalu City Hall area | M1 |
| MY | Kuantan | 548,014 | Kuantan City Council area | M1 |
| MY | Alor Setar | 423,868 | Alor Setar City Council area | M1 |
| MY | Kuala Terengganu | 375,424 | Kuala Terengganu City Council area | M1 |
| MY | Kota Bharu | 396,193 | Kota Bharu Municipal Council area | M1 |
| MY | Kajang | 1,047,356 | Kajang Municipal Council area | M1 |
| MY | Batu Pahat | 401,210 | Batu Pahat Municipal Council area | M1 |
| MY | Kulai | 294,156 | Kulai Municipal Council area | M1 |
| MY | Muar | 314,776 | Muar Municipal Council area | M1 |
| MY | Sungai Petani | 545,053 | Sungai Petani Municipal Council area | M1 |
| MY | Putrajaya | 109,202 | Federal Territory of Putrajaya | M2 |
| MY | Kluang | 323,762 | Kluang District | M2 |
| MY | Sibu | 248,064 | Sibu District | M2 |
| MY | Bintulu | 178,646 | Bintulu District | M2 |
| MY | Taiping | 304,023 | Larut, Matang and Selama District (incl. Selama) | M2 |
| MY | Cyberjaya | blank | No figure of its own. It is one part of Sepang district (324,935), so that figure would overstate it. | — |
| MY | Puchong | blank | No figure of its own. It is split between the Subang Jaya and Petaling Jaya councils. | — |
| SG | Singapore | blank | The whole city. Deliberately not given a figure. | — |
| SG | Orchard | 1,550 | Orchard planning area, residents | S1 |
| SG | Marina Bay | blank | Not a planning area. It spans Downtown Core and Marina South. | — |
| SG | Jurong East | 72,160 | Jurong East planning area, residents | S1 |
| SG | Tampines | 296,060 | Tampines planning area, residents | S1 |
| SG | Woodlands | 255,280 | Woodlands planning area, residents | S1 |
| SG | Ang Mo Kio | 159,330 | Ang Mo Kio planning area, residents | S1 |
| SG | Bedok | 272,120 | Bedok planning area, residents | S1 |
| SG | Clementi | 104,350 | Clementi planning area, residents | S1 |
| SG | Bukit Timah | 86,720 | Bukit Timah planning area, residents | S1 |
| SG | Changi | 1,950 | Changi planning area, residents | S1 |

## Updating

When the June 2027 Singapore file appears, or Malaysia publishes a new census, re-read the sources. Change the figures,
the year and the URL in `abroadTownPopulation.ts`, this table and the test in the same commit.

## 2026-10-19 — Malaysia clean-up: GeoNames for every other town, unclear places apart (feat/malaysia-coverage-cleanup)

**Why.** After Ethan's lead files were imported, the Malaysia table held 78 rows: 50 came "from your leads" with no state
and no figure, and some were not towns at all ("Penang and Kuala Lumpur", "Klang Valley", "Sabah"). The cause: the
Coverage town for a lead is `derived_town`, else `search_location`, i.e. the city column of the file, and
`resolveCoverageTown` gave any unlisted text its own row with `region: null` and no population.

**Second source: GeoNames.** `src/data/malaysiaPlaces.ts` is generated by `scripts/build-malaysia-places.mjs` from
GeoNames' `MY.txt` (https://download.geonames.org/export/dump/MY.zip, downloaded 2026-10-19, licence **CC BY 4.0**,
credited under the table). It keeps every populated place (feature class P, not historical, abandoned or destroyed) that
GeoNames gives a population above 0: 745 places, with name, state (admin1) and GeoNames' own figure. There are no
alternate names: GeoNames' alternates attach a village's figure to a town's spelling ("Nilai" is listed as an alternate of
the village Kampung Baharu Nilai). A short hand-kept spelling list in `malaysiaPlaces.ts` covers Air Itam / Ayer Itam,
Telok / Teluk Panglima Garang, Jenjarom / Jenjarum, Tasek Gelugor / Glugor and Puncak Alam / Bandar Puncak Alam.

**The rule (`abroadTownPopulation.ts` `townPopulation`).** The council / district table above is first and unchanged. Where
it has no figure (Cyberjaya, Puchong) or does not list the town, the figure is GeoNames' figure for a place of exactly
that name, in the row's state when names repeat. GeoNames figures are for the place itself, so they are not on the same
basis as the council figures. The tooltip on each figure says which basis it uses. Two same-named places with no state to
pick between, or no place at all, stay blank (a dash).

**Reading the place text (`src/lib/malaysiaPlaces.ts` `readMalaysiaPlace`, used by `src/lib/malaysiaCoverage.ts`).**
Commas are hierarchy ("Tikam Batu, Sungai Petani, Kedah": the first listed town wins, as before, then the first GeoNames
place). A trailing state names the state, not the town ("Bayan Lepas, Penang" is Bayan Lepas, not George Town). ";",
"/", "&" and "and" join alternatives, so two different known towns across them is **several places**. A state alone, a
region (Klang Valley, East Malaysia…) or a description ("Malaysia corporate training") is **unclear**. Unclear leads are
counted under no town and listed in the folded "Unclear places (N)" group with their lead counts (all trades). Nothing is
written to a lead. A safe tidy (trim, case, Johor Bharu → Johor Bahru) is display-only. The live book needed no stored
tidy on 2026-10-19: no Malaysian `search_location` had stray spaces, all-lower or all-upper case, or a known misspelling.
`townFromAddress` can suggest a town from a full address. It is not wired to the page because none of the 19 unclear
leads has an address.

⛔ `coverageCountries.ts` is unchanged on purpose. It is reached by 17 edge functions through `cleanBusinessName.ts`
(including `whatsapp-status`), so the new reading lives in `malaysiaCoverage.ts`, which no edge function reaches.

**Measured on the live book, 2026-10-19 (635 Malaysian leads).** Before: 78 rows, 50 with no state, 52 with no
population. After: 75 rows, 7 with no state, 9 with no population, plus 19 unclear values (one lead each). Still no
figure (not in GeoNames with a population, or ambiguous): Pontian, Nilai, Langkawi, Bandar Baru Bangi, Gelugor,
Ampang Jaya, Simpang Ampat (no state either), Penampang (Sabah), Kota Kemuning (Selangor).

## 2026-10-19 — imported leads count as already added (migration `20261108090000_imported_leads_identity.sql`)

Ethan's 635 Malaysian and 582 Singapore leads came in by file. Only 19 have a Google place id, none has a Maps link, every
phone is stored in +60 / +65 form, and names carry "Sdn Bhd" or a branch in brackets. The one identity lookup
(`_lead_identity_rows`, used by Find Leads' markers AND `coverage_add_leads`' duplicate check) matched on place id, then
`phone_key`, then Maps link, so none of these leads was recognised. Google's national "012-…" format never equals
`phone_key("+6012…")`.

The migration keeps those three checks, in order, and adds three more that run **only for an item whose country is given
and is not the UK**: the phone in its E.164 form (`my_sg_e164` → `phone_key`, indexed), the website identity (indexed,
same country), and `business_name_key` + town (the searched town inside the lead's town or address text, or the lead's
town inside the result's address, same country). `coverage_add_leads` now passes country, website, name, town and address
in its identity items, so the marker and the add's dedupe use one rule. The function is security definer and checks the
role as before, and `lead_identity_lookup` still masks for Sales.

Find Leads (admin): a result the server recognises but this page's own match missed shows `AlreadyAddedMarker`, the
owner's avatar with "Added by <name>" (or a neutral In CRM tick when there is no owner). It is not a control. The
salesperson's badge carries the same tooltip.

**Read-only sample (no search run).** The only stored search results for this market are one Singapore language-school
search (61 results; 1 Malaysian address among them). The old rule recognised 4 of Ethan's imported leads in it and the
new rule 8 (website 8, name + town 3, overlapping). The 1 Malaysian result matched nothing under either rule. There is no
stored Malaysian search to sample beyond that.

**Fixtures.** `ZZ QA-M1 phone match` / `-M2 website match` / `-M3 Name Town Sdn Bhd`
(`4d000000-0000-4000-8000-0000000000a1…a3`) were recognised as "yours · Paul" by `lead_identity_lookup` on a national phone,
a www-less website and a name without "Sdn Bhd" in its town. The same name in another town stayed new, a UK item stayed
on the old checks, and the add preview skipped all three as `already_yours`. All three were archived with History
`archived_set` and their contact details cleared. Their `metric_exclusions` rows stay.

**Coverage niche panel.** "Add all" now runs `useFindLeadsBulkAdd` (preview → phone lookups → UK landlines and no-number
skipped → one save) and says "Added N, skipped M". It used to call `addLead` once per lead and added landlines.
