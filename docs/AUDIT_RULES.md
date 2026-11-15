# Audit verdict rules (v2, Paul, 2026-11-15)

The one written rule for **Winnable / Not winnable** on a V1 audit report. Code: `src/lib/auditVerdict.ts` (the rules),
`src/lib/strictName.ts` (the name match), wired in `src/lib/reportOpportunity.ts` (`ctx.rules === 2`) and
`src/lib/reportDesign.ts` (`winnableOf`). Tests: `scripts/audit-rules-v2.test.ts`.

Not a score (docs/architecture-rules.md): fixed rules over counts. The same answers always give the same verdict.

**Winnable means room to be NAMED, not to come first** (Paul, 2026-11-15). A firm that is in every answer is only a
firm to beat; a search is Not winnable only when a few firms crowd it (rule 2).

## Per search, over its answers (3 asks × ChatGPT + Gemini = 6). The first rule that fits wins.

| # | Rule | Verdict (client) | Stored internally |
|---|---|---|---|
| 0a | Any answer failed or missing | not shown | "Re-run needed". It gets re-run and never gets a verdict |
| 0b | Genuinely odd phrasing (a doubled word, a run-on of 15+ words). A missing "in" ("wedding content creator Ireland") is how people search and is **never** flagged | not shown | "Unnatural question: not scored" + why |
| 1 | The business is named in **any** answer | **Winnable** | "Already visible: X of N", per engine. **Beats every rule below** |
| – | A service they said they don't offer, or not on their site yet | not shown | as before |
| 2 | **Crowded** (2026-11-15, replaces "closed list"): most answers (more than half) name firms of the right trade, AND the top 3 firms take **70% or more** of every firm mention (`CROWDED_AT`) | **Not winnable** | "Crowded" + the top 3 firms, their counts and the share |
| 3 | Otherwise, firms named and the list has room | **Winnable** | "Names change" / "A few repeat" + the ones to beat (firms in 2+ answers); a firm in 5+ of 6 is listed first as "always there" |
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

## Rule 2: why crowding, and why 70% (Paul, 2026-11-15)

The closed-list rule ("the same firms in every spot of every answer") almost never fired, because answers always
shuffle a little: Moments came out 40 of 40 Winnable. Crowding asks instead how much of the list the top 3 firms take.

- A firm mention = a firm named in one answer (counted once per answer). Only right-trade firms, only answers about the
  right place. Directories are not firms.
- Every scored verdict keeps the counts (`crowding`: answers with firms, different firms, mentions, the top 3, their share).
- Tested on the stored answers of Moments (`ukuarx`) and LDM (`f7n6d2`), with no new AI searches:

| Line | Moments (40) | LDM (40, 7 not shown) |
|---|---|---|
| 70% | Already named 13 · Winnable 25 · Not winnable 2 (Donegal 74%, Waterford 73%) | Winnable 33 · Not winnable 0 |
| 80% | Already named 13 · Winnable 27 · Not winnable 0 | Winnable 33 · Not winnable 0 |
| 90% | Already named 13 · Winnable 27 · Not winnable 0 | Winnable 33 · Not winnable 0 |

  70% is the only line that catches anything. Real answers name 5 to 18 different firms per search, so the top 3 rarely
  pass 60%; the LDM searches over 80% are ones where most answers name nobody (rule 4, never crowded).

## The three groups on the report (Paul, 2026-11-15)

A v2 report and its Past audits row split the searches three ways, from one function (`reportDesign.verdictSplitOf`):
**Already named** (named in at least one answer, rule 1) · **Winnable** · **Not winnable**. The report shows
"Already named X · Winnable Y · Not winnable Z" above three panels; an audit before v2 keeps its page.

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

## The baseline's "already named" searches (Paul, 2026-11-15)

- A rules-v2 baseline (targeted or paid) opens with "You're already named on X searches": the business's Discovery
  (same lead, else same name + website; a v2 copy preferred, then the newest) scored from its STORED answers, the
  searches with rule 1 (Already named), minus any of the baseline's own targets. Labelled "from your Discovery on <date>".
  Not re-measured for the client, not part of the guarantee: nothing in the 20 targets' counts, the frozen day-0 numbers
  or the guarantee reads it (`src/lib/alreadyNamed.ts`, `_shared/already-named.ts`). Older baselines are unchanged.
- Headline: "You're already named on 13 searches. Here are 20 more we're going after." Every baseline number says
  "on your 20 target searches". "AI doesn't mention you yet" is gone everywhere.
- Header place: the audit's town, else its stored `business_address`, else "All of <country>" for a national business,
  with "· covers all of <country>" for a national one. Never the commonest place in the searches (Moments said "Clare").
- Internal quarterly re-check (`weekly-visibility`, purpose `named_recheck`): every 91 days per business,
  one run of the already-named searches, no lead attached (so it can never arm a WhatsApp pitch), same stop / Apify /
  cost caps, at most 3 starts per run. Folded onto run 1 (`results.named_recheck`: kept / dropped / unanswered); drops go
  to Paul's bell. The public renderer refuses it.
- Moments: new baseline copy `868qnr` (from `hms2vc`, stored answers, business_address "Co. Mayo"); `hms2vc` still works.
