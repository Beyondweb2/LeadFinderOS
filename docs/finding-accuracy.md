# Finding accuracy — what we may tell a prospect their site does not say (2026-10-25)

Trigger: the hook draft for X Border Transport Training (heavy vehicle driver trainer, Lavington NSW, report j4zej4) said
"your site doesn't say which areas you cover", "your site doesn't mention Lavington NSW" and "your main pages don't say
clearly what you do". All three were false, and the audit asked for "the best driving instructor".

## Why each fired
| Line | Source | Cause |
|---|---|---|
| Areas not stated | `ct_areas_not_stated` (contentTrust.ts) | The coverage reading knew only "we cover X", "serving X", "areas we cover". The site says "available to anyone in Albury/Wodonga and surrounds, including all areas of Riverina NSW" - no match, so "no statement". |
| Doesn't mention Lavington NSW | `location_unclear` (salesInsights.ts), `town_missing` (siteAudit.ts) | Judged on title, headings and the FIRST 700 characters of a page only, and on every word of the stored label, so the "NSW" had to be on the page too. Parent city / suburb ignored. |
| Main pages unclear | `vs_key_page_basics` (no H1 on the homepage and /services) | A Weebly site with H2 headings and no H1. A true fact about page code, mapped in pitchIssueWords.ts to "don't say clearly what you do". |
| Best driving instructor | `create-ai-audit` hook plan | Question 1 used the lead's Google category ("Driving instructors") verbatim. |

## Rules it taught (code: `src/lib/siteClaims.ts`)
- An absence is quoted to a prospect only when the check read every page to the end (the crawl keeps 5,000 characters per page, `KEPT_TEXT_CHARS`; a page at the cap, or one with no kept text, is "cannot prove") and stamped its `saw` with `FULL_TEXT_MARK`. `pitchIssueWords.ts` drops `location_unclear`, `town_missing` and `ct_areas_not_stated` without the stamp, so every finding stored before this change is left out until the site is re-checked.
- When any page says where the business covers (`COVERAGE_PHRASES`), "doesn't mention <town>" is not said at all: the town may be inside the area named, and we hold no suburb map.
- The state label (NSW, VIC, UK...) is how we store a town, not how a site writes it (`townCore`).
- A technical id (no H1, no title, no description, duplicate titles) is never worded as "don't say what you do"; `ct_area_coverage` ("doesn't say much about the areas") is out of the pitch.
- Question 1 for a driving category reads the homepage (title, description, H1/H2, first 700 characters). One specialism named (truck, bus, forklift, motorcycle) and no car-lesson wording = that trade; otherwise the category (`siteTradeFor`, `hookTradeFor` in create-ai-audit). Questions 2 and 3 still follow the category.

## Measured on stored text (last 30 of each finding among the latest 500 full crawls, `crawl_urls.evidence->t`)
- `ct_areas_not_stated`: 7 of 30 false (the site states coverage in a sentence).
- `location_unclear`: 7 of 30 false (town is in the full text); 19 of 30 unprovable (site names covered places, or a page was cut) - now left out.
- `town_missing`: 11 of 23 unprovable. Not scored for truth (homepage-only claim).
- `vs_key_page_basics` / `missing_h1` as "unclear what you do": 30 of 30 were a code fact worded as a claim about the content; the sites' titles/H2s name a service in every sampled case.
Page text is not kept beyond the first 5,000 characters, so "false" here means contradicted by the kept text; the true rate is at least this.

## Not changed
Scoring, the Visible rule, existing audit data. No migration.
