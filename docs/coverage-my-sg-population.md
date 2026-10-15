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
