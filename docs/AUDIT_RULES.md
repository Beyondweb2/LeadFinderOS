# Audit verdict rules (v4, Paul, 2026-11-16 — v3 and v2 below stay for the audits made on them)

## Rules v4: locked spots, one firm per spelling (2026-11-16, Paul's "B′")

v4 is v3 below with ONE change to step 2b/2c and ONE to how firms are counted. Everything else (Couldn't measure,
Already named, AI doesn't name businesses, registers, named % over every answer, Audit incomplete, alerts) is v3's.
Code: `decideVerdictV3(…, { lockedSpots: true })` and `makeFirmMatchKey` (`reportOpportunity.ts`). Tests:
`scripts/audit-rules-v4.test.ts`. From `AUDIT_RULES_V4_FROM`, or a copy whose runs carry `report_rules = 4`. v4 was deployed
before v3's own start time, so it took that slot (both 2026-11-16 10:30 UTC): new audits go from v2 straight to v4; v3 is
read only by the copies stamped 3 (`tge2ue`, `rfussx`).

**Locked spots** replace the 70% line. For each AI, over the asks in which it named firms (3 of 3, or 2 of 3):
- it is **locked** when at least **2 firms are in every one of those asks** (`LOCKED_MIN_EVERY`) AND **fewer than 2 firms
  are named in only one of them** (`LOCKED_MAX_ONCE`);
- **Winnable** = at least one naming AI is not locked; **Not winnable** = every naming AI is locked.
- An AI that names firms in only 2 of its 3 asks is judged on those 2 (it used to be always Winnable).

Why (compared on the stored LDM `tge2ue` and Moments `rfussx` answers, Paul 2026-11-16): with 4–6 firms per search a share
of mentions punishes small lists that rotate (the 70% line made "gas safety certificate London" — one regular plus a new
firm each ask — Not winnable), and the 80% line opened Lewisham, where the same 4 firms came back every time. Plain
"locked spots" (B) counted a firm in 2 of 3 asks, or a second spelling, as a newcomer; B′ counts only firms named once.

**One firm, many spellings** (`makeFirmMatchKey`, on top of `firmKey`): drops a strapline after a spaced " - " / " – " /
" | " and a trailing "(…)", drops Ltd / Limited / LLP / PLC / Inc / Co, case and punctuation, and trailing place words (the
audit's town, its searches' places and areas, compass / country words) while more than two words remain. Merges found on
the LDM and Moments answers (all one firm each): HomeCert Ltd / HomeCert Ltd - Electricians & Gas Engineers London ·
Keystone London / Keystone London - Plumbing & Heating · Landlords Gas Inspections / … (JF Gas Ltd) · RCD Electrical Ltd /
RCD Electrical LTD Fulham · Aoife Lyons (4 spellings) · D|N Wedding Stories / … – Dace Nolan · Irish Content Creator /
… – Aoife · JMB Videos / … (ReelMemories) · Sociabelle (3) · Socially Wed / … (SocialWeds). Different words stay different
firms ("EICR Pro" ≠ "EICR Pro Electricians"; "Electricians Greenwich" is never cut to "electricians").

## Rules v3: the evidence rule (2026-11-16)

**Why.** The 16 Nov London Domestic Maintenance Discovery (`qs44zg`) said "Winnable 39 · 0 of 25 answers". The OpenAI
account had no credit, so the firm-reading step (`extract-competitors`) read **0 of 240** answers, and v2 scored the empty
lists. Re-read on real answers, v2 still said Winnable 39: ChatGPT named firms in 3 of 3 asks, Gemini in 0 of 3, so "most of
the 6 answers" never held, nothing could be Crowded, and any one stored firm made a search Winnable.

Code: `decideVerdictV3` in `src/lib/auditVerdict.ts`; wired in `reportOpportunity.ts` (`ctx.rules === 3`); page in
`reportDesign.ts`; alerts `src/lib/auditAlerts.ts` + `supabase/functions/_shared/audit-alerts.ts`. Tests:
`scripts/audit-rules-v3.test.ts`. Per search, first rule that fits wins:

| # | Rule | Client sees |
|---|---|---|
| 0 | **Couldn't measure** — any answer failed, or its firms were never read (no `firms_read` mark on the answer) | not shown, never counted; listed as "couldn't be measured" |
| – | Odd phrasing / a service they don't offer / not on their site | not shown (unchanged) |
| 1 | **Already named** — the business is named (strict match) in any answer. Beats everything below | Already named |
| 2 | An AI **names firms** when a right-trade firm is in **2 or more of its 3 asks** (`NAMES_IN_ASKS`). Each AI is judged on its own asks | |
| 2a | Neither AI names firms | **AI doesn't name businesses here** (never Winnable), with where AI points people instead |
| 2b | At least one naming AI whose top 3 firms take **under 70%** of that AI's mentions (`CROWDED_AT`) | **Winnable** |
| 2c | Every naming AI's top 3 take 70% or more | **Not winnable** (Crowded) |

- **Registers and regulators** (Gas Safe Register, NICEIC, NAPIT, gov.uk, HSE, TrustMark, ICAEW, ACCA, AAT) are never a
  firm and never a "directory gap". Directories (Checkatrade, TrustATrader, MyBuilder, Bark, Yell…) are listed as
  "AI points people to"; registers as "tells them to check".
- **The summary line**: "Already named X · Winnable Y · Not winnable Z · AI doesn't name businesses W".
- **The named %** is over every ChatGPT + Gemini answer returned, never only the answers that kept a firm list
  (`reportModel` `score.overAll`). Baselines already did this.
- **Asks per AI stay at 3** (brief item 5). Measured on LDM 16 Nov: ~61% of the firms in asks 2 and 3 were already in ask 1,
  and Gemini named no firm in all 3 asks for 36 of 40 searches, so 5 asks would change little for about +$1.80 per audit.
- **`firms_read`**: `extract-competitors` sets it on every answer the model actually read. An id the model left out, a
  failed batch or no credit leaves it off.
- Worth knowing: ChatGPT names only 4–6 firms per search over 3 asks, so "top 3 take 70%" fires often (LDM: 20 of 40).

### Audit incomplete (brief item 1)

More than **10%** of an audit's answers unmeasured (`AUDIT_INCOMPLETE_AT`, `auditCompleteness`) = **Audit incomplete**:
the Discovery / first-contact report link shows "Audit incomplete" with **no score, no groups, no searches** (Findable and
LeadFinderOS pages alike), and the Past audits row says "Audit incomplete". The same link shows the real report once the
answers are read. A baseline is never gated by it: its numbers come from the answers themselves (strict name match), not
from firm lists, and it keeps its own completeness checks.

### Alerts (bell + email, operator only)

- **Audits incomplete** — ONE SUMMARY PER CAUSE AT MOST ONCE AN HOUR (v1-incomplete-fix, 2026-11-16). When an audit's last
  run settles (`process-ai-audit-queue` → `checkAuditCompleteness`) it is given one cause (`incompleteCause`: OpenAI
  refused / Apify refused / AI search did not finish in time / AI search failed / firms not read) and added to that cause's
  bell row for the rolling hour ("12 audits incomplete since 12:08", key `audit_incomplete:<cause>:<minute>`). audit-watch
  sends that row's ONE email 3+ minutes after it opened (`sendDueIncompleteSummaries`; its cron gate wakes for it). Quiet
  claim rows written already cleared (`audit_incomplete_counted:<audit>`, `audit_incomplete_emailed:<key>`) make "count
  once" and "email once" hold. Why: at 12:08 on 16 Nov twelve Quick checks failed together and Paul got twelve emails.
- **Quick checks are judged like every audit.** They are firm-read (`firms_read` on both answers), so "2 of 2 could not be
  measured" only means the answers really failed (16 Nov: Apify's AI search hung 3 × 12 min, `run_age_exceeded`) or were
  really unread. Never loosen the rule to quieten an alert.
- **Quick check, one automatic retry** (v1-quickcheck-retry, 2026-11-16; `src/lib/quickCheckRetry.ts`,
  `_shared/quick-check-retry.ts`): a Quick check (purpose audit, one run, 1–3 asks) whose every ask failed because the
  provider did not finish (`run_age_exceeded`, `apify_TIMED-OUT/FAILED/ABORTED`, `stuck_running_reclaimed`) is re-opened
  ONCE 30+ minutes later by the queue tick: same run (stamped `results.late_retry`), each ask pending with one start left,
  started by the normal start path (every budget limit). Never for budget refusals, a run already stamped, a lead with a
  newer audit, or a failure over 6 h old. Not charged to the rep's allowance. The "incomplete" alert waits for the final
  failure. The public link says "check back shortly" while a run is in flight or the retry is due, else "This check
  couldn't be completed, ask your contact to run it again." The row's button is "Run again".
- **Provider refused** — OpenAI ("no credits remaining", insufficient quota) or Apify (HTTP 402 / 403, our Apify reserve):
  at most once an hour per provider (rolling; key carries the minute), emailed at once; a repeat inside the hour only
  raises the bell row's count. From the firm-reading step and from any settled audit's stored errors.
- The bell row is the claim (dedupe key); the email (Resend, `OPERATOR_ALERT_TO`) goes only when the claim wins. Bell kinds
  reuse `audit_finished` / `team_update` (no migration).

### Which audits use v3

`auditRulesFor`: created after `AUDIT_RULES_V3_FROM`, or a copy whose runs carry `report_rules = 3`. Every older link
keeps the rule it was made on. The guarantee's strict name ruler is unchanged (v2 or later). The Create baseline dialog
still picks targets on v2 (its source Discoveries predate `firms_read`).

### Re-scoring on v3

`scripts/audit-rescore-v3.ts <outDir> <code> …` (a DB tool; no AI, no Apify; reads only) writes an insert-only copy to a
NEW short code, runs stamped `report_rules = 3`, a `verdicts_v3` snapshot, and marks `firms_read` on a copied answer only
when its run's firm-reading receipt says complete; plus an old-vs-new table.

2026-11-16 v3 re-scores (stored answers, no new searches; firm reading re-run first where it had failed):

| Audit | Old (v2) | New (v3) | Named |
|---|---|---|---|
| LDM Discovery `qs44zg` → `tge2ue` | Winnable 39 · left out 1 | Winnable 18 · Not winnable 20 · AI doesn't name businesses 1 · left out 1 | 0 of 128 → 0 of 240 |
| Moments Discovery `ukuarx` → `rfussx` | Already named 13 · Winnable 25 · Not winnable 2 | Already named 13 · Winnable 24 · Not winnable 3 · AI doesn't name businesses 0 | 37 of 240 |
| **v4** LDM `tge2ue` → `6kjpm7` | (v3) Winnable 18 · Not winnable 20 · AI doesn't name 1 · left out 1 | Winnable 28 · Not winnable 10 · AI doesn't name businesses 1 · left out 1 | 0 of 240 |
| **v4** Moments `rfussx` → `db7nmj` | (v3) Already named 13 · Winnable 24 · Not winnable 3 | Already named 13 · Winnable 27 · Not winnable 0 · AI doesn't name businesses 0 | 37 of 240 |

LDM's 3 runs were re-read on 16 Nov after the OpenAI key moved to a new organisation (~$0.76). Moments' copy had run 2
re-read ($0.23): on 15 Nov the model skipped 24 of its answers, so v3 first showed every search as Couldn't measure.

---

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
