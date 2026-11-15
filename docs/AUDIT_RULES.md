# Audit verdict rules (v2, Paul, 2026-11-15)

The one written rule for **Winnable / Not winnable** on a V1 audit report. Code: `src/lib/auditVerdict.ts` (the rules),
`src/lib/strictName.ts` (the name match), wired in `src/lib/reportOpportunity.ts` (`ctx.rules === 2`) and
`src/lib/reportDesign.ts` (`winnableOf`). Tests: `scripts/audit-rules-v2.test.ts`.

Not a score (docs/architecture-rules.md): fixed rules over counts. The same answers always give the same verdict.

**Winnable means room to be NAMED, not to come first** (Paul, 2026-11-15). A firm that is in every answer is only a
firm to beat; a search is Not winnable only when the list is closed.

## Per search, over its answers (3 asks × ChatGPT + Gemini = 6). The first rule that fits wins.

| # | Rule | Verdict (client) | Stored internally |
|---|---|---|---|
| 0a | Any answer failed or missing | not shown | "Re-run needed". It gets re-run and never gets a verdict |
| 0b | Genuinely odd phrasing (a doubled word, a run-on of 15+ words). A missing "in" ("wedding content creator Ireland") is how people search and is **never** flagged | not shown | "Unnatural question: not scored" + why |
| 1 | The business is named in **any** answer | **Winnable** | "Already visible: X of N", per engine. **Beats every rule below** |
| – | A service they said they don't offer, or not on their site yet | not shown | as before |
| 2 | **Closed list**: every answer names firms and the SAME firms fill every spot in every answer; no other firm ever appears | **Not winnable** | "Closed list" + the firms that lock it |
| 3 | Any spot rotates (some other firm appears, or an answer leaves a spot open) | **Winnable** | "Names change" / "A few repeat" + the ones to beat (firms in 2+ answers); a firm in 5+ of 6 is listed first as "always there" |
| 4 | Nobody named in most answers on **both** engines | **Winnable** | "No clear leader" + why (general advice / doesn't know anyone / refused) |
| 5 | Only directories named | **Winnable** | "Directory gap" + the directories |
| 6 | Only firms of another trade → "Category gap". Gemini answered for another place → "Local gap" (Gemini only) | **Winnable** | the label + the evidence |

- There is no big-city cap and no "engines disagree" logic. ChatGPT and Gemini are counted separately (`perEngine`).
- Rule 3 applies only when firms come up in most answers on at least one engine. When most answers on both engines
  name nobody, it is rule 4, even if one answer named a firm.
- Only Gemini is checked for another place (a ChatGPT answer is never dropped for it). A search is no longer left
  out for a place mix-up: it gets a verdict.
- The client sees only Winnable / Not winnable and one plain line (`clientLineOf`), with no counts and no names. The
  internal label and reason (which may name competitors) show in the operator's Create baseline dialog and in the
  `verdicts_v2` snapshot.

## Name match (strict)

An answer names the business only by:
- its **exact name**: every word, in order, each capitalised as a name is; "Ltd"/"Limited" optional;
- its **website domain**: in the text or a cited source;
- its **Google profile**: the lead's place_id.

A one-word name never counts by text alone (a common word). It still counts by domain or profile.

A **near-name** is flagged and **not counted**. That covers:
- an extra word stuck to the name ("MC Moments Wedding Content", "… Wedding Content Studio");
- the name next to a different home town or review count. This is checked only when those facts are known; today no audit stores them, so this check is dormant.

A clean match anywhere in the answer wins over a near-name elsewhere in it. A near-name is another business, so
it counts as a firm (it can be one to beat, or lock a closed list).

This ruler is used by v2 reports (the verdicts and the redesigned report's named %) and by the guarantee for NEW
baselines (below). `cellNamed` (`namedSignal.ts`) itself is unchanged.

## The guarantee count (Paul, 2026-11-15)

A baseline created on rules v2 (after `AUDIT_RULES_V2_FROM`) counts "named" with the same strict match, everywhere it
is counted:
- its frozen day-0 snapshot (`_shared/audit-baseline.ts` `aggregateRuns`);
- BOTH sides of its day-28 comparison (`compareMeasurements` `strictIdentity`): the results email/page
  (`_shared/remeasure-results.ts`), Compare measurements and the report's before/after.

The switch is `guaranteeIdentityFor(baseline created_at, name, website)` — keyed on the BASELINE's date, like the
Google AI scoring method, so the two sides can never use different rulers. Identity = name + website only.
**Existing and paid baselines (created before the cut-off) keep the ruler they were sold on.** New baselines are on
scoring method 1 (ChatGPT + Gemini), so Google AI's naming never enters their count.

## Which reports use v2

`auditRulesFor`: an audit created after `AUDIT_RULES_V2_FROM`, or one whose runs carry `results.report_rules = 2`
(a re-scored copy). Every older audit keeps the old rule, so a link already sent keeps the page it showed.

## Re-scoring an old audit

`scripts/audit-rescore-v2.ts <outDir> <code> …` is a DB tool. It asks no AI and runs no Apify. It reads the stored
answers read-only and writes, for each audit:
- one atomic insert-only SQL file that copies the audit, its runs and its queue rows to a **new short code**, with the runs marked `report_rules = 2` and the latest run holding a `verdicts_v2` snapshot;
- a table of old vs new verdicts.

The old audit and its link are untouched.

2026-11-15 re-scores: Moments Wedding Content `paazz5` → `ukuarx`, LDM Discovery `w9ebxk` → `f7n6d2`, LDM Baseline
`ew3yvm` → `qgdx4m`. "MC Moments Wedding Content" (Kildare) is treated as a different business.
