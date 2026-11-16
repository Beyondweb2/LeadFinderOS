# Opportunity score (2026-11-16, branch v1-opportunity-score)

**What it is:** a 0–100 number per lead, banded **Hot (60+) / Warm (35–59) / Cold (under 35)**, that ranks how well a lead fits
our ICP: a business **AI ignores AND whose website is the reason**, that is active and reachable. Shown on **Outreach**
(Opportunity column, Filters → "Opportunity score", Sort → "Opportunity: best first") and **Find Leads** (under each name; Filter →
"Opportunity score": sort best first, "Has critical website issues", one band). Each lead shows its top 3 reasons in plain words.

**Team only.** A sorting aid. Never in a report, reply, template or voice note (`scripts/opportunity-score.test.ts` fences the
imports). Not a prediction of AI visibility and not a promise (Master Standard §01). It never scores a search (no winnability
score, `docs/architecture-rules.md`): it reads the audit's stored counts.

Code: `src/lib/opportunityScore.ts` (the rule, pure), `src/lib/opportunityForLead.ts` (reads the one website check),
`src/hooks/useOpportunityInputs.ts` (stored audit scores, opt-out list, Find Leads crawl rows), `src/components/OpportunityCell.tsx`.
Source standard: `Desktop/Findable/04 Standards/Findable_AI_Visibility_Master_Standard.pdf` v1.0 (9 Oct 2026; not in `docs/`).

## The inputs and weights

### Website (max 50) — only checks that passed the accuracy bench

Read from the lead's ONE website check (`websiteCheckFor`, team view), **deep checks only**. Every finding kind used is listed
with its bench result (`docs/WEBSITE_CHECK_ACCURACY.md`, replay of 2026-11-15; the test re-counts it from `truth.json` and fails
if a number drifts). A kind in `CLIENT_HIDDEN_KINDS` (under 90%) is never read.

| Signal | Points | Finding kinds (bench true/labelled) | Why (Master Standard) |
|---|---|---|---|
| **Critical** · No website of its own (none, or only Facebook / a directory) | 20 | from the lead, no check needed | §03 crawlable public HTML, §04 entity clarity: nothing of theirs for AI to read |
| **Critical** · AI crawlers blocked | 20 | `robots_blocks_all`, `robots_blocks_oai-searchbot`, `…_googlebot`, `…_bingbot`, `…_perplexitybot`, `robots_blocks_ai_search` — *exact robots.txt read*; site-score state "Blocked by robots.txt" | §03 (A, platform-confirmed: OAI-SearchBot / Googlebot / PerplexityBot access), §16 |
| **Critical** · Homepage unreadable | 20 | `client_rendered` 5/5, `home_no_text` 1/1, `noindex_home` 2/2; state "JavaScript-only site" | §03 "JavaScript should not hide essential content", §16 accidental noindex |
| **Critical** · Services not each on their own page | 20 | `no_service_pages` 4/4, `one_page_site` 3/3, `services_on_one_page` 2/2 | §05 one primary page per intent |
| **Critical** · No clear areas served | 20 | `ct_areas_not_stated` 4/4, `town_missing` 1/1 | §04 "genuine coverage areas" |
| **Critical** · No contact details | 20 | `no_contact_details` 1/1 | §04 contact details |
| **Big** · No LocalBusiness / Organization schema | 8 | `no_business_schema` 10/10, `vs_business_schema` 6/6 | §13 |
| **Big** · Thin pages | 8 | `thin_key_pages` 3/3, `thin_pages` 4/4 | §07 answer-first content |
| **Big** · Copy-paste town pages | 8 | `vs_town_swapped_pages` 8/8 | §05, §19 (doorway / cloned towns — a problem we fix) |
| **Big** · Not set up for phones | 8 | `no_viewport` — *exact meta-tag read* | §03, §16 mobile usability |
| **Big** · Very heavy pages | 5 | `heavy_pages` 1/1 | §03, §16 reasonable performance |

- **"Very slow" is NOT read:** `slow_pages` is one download from our server, not a phone speed test, and the bench never measured
  it. `heavy_pages` (page size, exact) stands in, with less weight.
- **Exact reads the bench had no case of** (`OPP_EXACT_READS`): no site in the bench set blocked AI in robots.txt or lacked the
  viewport tag, so these were not measured there; both are a literal read of one file/tag, unit-tested in `siteAudit`. Remove
  them from `OPP_EXACT_READS` to switch them off.
- **Strong site:** site score 80+ ("Little to gain") with no critical issue → the website part counts 0 and the lead is capped at
  30 (Cold), reason "Website already strong".

### AI audit (max 36) — §17 measurement

From the stored audit score (`ai_audit_runs.hook_score`, the one ruler in `auditScore.ts`), the newest outreach audit:

| Named in | Points |
|---|---|
| none of the answers | 30 |
| up to a third | 18 |
| up to two thirds | 6 |
| more than two thirds = **already named widely** | 0, and the lead is capped at 30 (Cold), said first |

- **Winnable searches (rules v3/v4) — ON since 2026-11-16 (leftovers):** +2 per winnable search, max +6, from the lead's NEWEST
  Discovery's stored split `ai_audits.verdict_counts` (`src/lib/auditVerdictCounts.ts`; written by the `audit-watch` job within ~5
  minutes of a Discovery finishing, from the report's own `pooledSummary` split; re-counted when a run is re-scored). Judged = Already
  named + Winnable + Not winnable + AI doesn't name businesses (Couldn't measure left out); "AI doesn't name" gets no weight. A newest
  Discovery that is "Audit incomplete" gives nothing (an older one never stands in). Only Discoveries have verdicts (hook audits keep
  the classic page), so a lead with no Discovery gets no winnable points. Only applies when the AI part is scored and not "named widely".
- An audit still running, unfinished or "updating" = **Incomplete**, never "0 named".

### Worth it (max 14) — §10 corroboration, §11 reviews

Google listing 2 · 3+ Google reviews 2 (10+: 4) · rating 4.0★+ (with 3+ reviews) 2 · **a UK mobile we can reach 6**
(`coldWhatsAppVerdict`, the same rule the queue uses). No mobile is said as a reason.

### Excluded (never scored)

Opted out / Do Not Contact / wrong number (lead status, the role-checked `leads_suppressed` list, or Find Leads' server status),
and paying / refunded clients.

### Incomplete (never guessed)

No deep website check (none, quick only, or the site could not be read) **or** no finished audit → "Incomplete", with what is
missing. A no-website lead needs no scan. **"Has critical website issues" still works on an incomplete lead** (it needs the scan
only), and incomplete leads sort after scored ones, critical first.

### Never suggests thin service × town pages

Master Standard §05 / §19. No reason line advises adding pages per town (the test checks every line); a site that already has
copy-paste town pages scores higher, because that is a problem we fix.

## Real data (2026-11-16, 10,535 live leads, QA fixtures left out)

Hot 384 · Warm 626 · Cold 354 · Incomplete 8,925 · Excluded 246. 2,297 have a critical website issue. Incomplete because: no
audit 8,314, no website scan 6,956, quick check only 277, site unreadable 185. Top 20 / bottom 20 with reasons:
`docs/reports/opportunity-score-sample-2026-11-16.md`.

## Tuning it once client re-measures come in

The weights are a first judgement from the Master Standard, not measured. Plan:

1. For every paid client with a day-0 baseline and a four-week re-measure (§17: same frozen questions, engines, method), record
   the day-0 opportunity inputs (which signals were on, named share) beside the change in named share.
2. After ~20 clients, compare: which day-0 signals went with the biggest gains after we fixed them? Raise those weights; lower
   signals whose fix never moved naming. Same for the bands: Hot should be the leads that moved most.
3. Never on one client or one favourable run (§18: no causal claims from small uncontrolled before/after changes). Record each
   change here with date, evidence and old → new weight; bump `OPPORTUNITY_SCORE_VERSION`.
4. Winnable searches are on (stored counts, 2026-11-16). Check "AI doesn't name businesses here" separately before giving it any weight.
