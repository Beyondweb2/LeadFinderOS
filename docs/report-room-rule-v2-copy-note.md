# Report room rule, baseline split and the V2 copy note (2026-11-12)

Method record. The rule lives in `src/lib/reportOpportunity.ts` (`ROOM_*`, `RULE_WORDS`), its numbers and data in `docs/reports.md` ("Room rule").

## The room rule (every report, every business)
Per search, over all its answers (6 = 3 asks x ChatGPT + Gemini). **Regulars** = firms named in at least half the answers. **Repeat share** = the regulars' share of all firm mentions.

| Label | When |
|---|---|
| **Lots of room** | repeat share under 0.3, a specific place (borough, town) and the service on their site |
| **Some room** | 0.3 to under 0.6; a whole city, region, country, "across X" or no place is capped here |
| **Little room** | 0.6 or more, or one firm in 5+ of 6 answers with share 0.5+ |
| **AI doesn't name firms yet** | more than half the answers name no firm. Never a target |
| **Keep and grow** | AI names them in half or more of the answers |
| **Not on your site yet** | the service is missing from their CURRENT site. NOT excluded (we build the new site): "add a page if you offer this". Kept out of the room counts until confirmed |
| **Not your service** | only a service the client said they do not offer (onboarding) or one clearly outside their trade. Excluded |
| left out (wrong place) | half or more of the answers are for another place with the same name (Stratford-upon-Avon). Fewer wrong answers are dropped one by one |

Thresholds come from real data (LDM 37 searches, ABLM 20): rotating lists 0-0.3, mixed 0.4-0.55, closed lists 0.6-0.9. Directories and bare service phrases are never firms. The goal is to be NAMED, never first; no promise of a ranking.

## The score label (Master Standard)
Always **"AI named you in X% of answers"**: named answers over answers that named any business. Named only, never a mixed score. Today card on a client report uses the same words.

## Baseline picker (discovery -> baseline of 20), every business
`recommendBaseline` (`src/lib/baselineRecommendation.ts`), a NEW recommendation only; a baseline already approved and frozen is never re-picked.
- every hook search (up to 3), locked in verbatim
- 3-4 MAIN money searches (the two core questions, topped up from the home-town broad/service searches) even if Little room, labelled **"Main search, harder to get named"**
- about 14 chosen for the most room to be named (Lots, then Some). A Little-room search fills a gap only when too few others exist
- none where AI names no firms (as before, plus the balance rules: intent, service, town, no near-duplicates)

Client report heading: **"Your targeted searches"**, with the line "We chose searches where you have the best chance of being named, plus your main ones." Counts and per-search proof are computed from the stored answers.

## V2 copy note (words V2 must use; V2 is read-only here, copy only)
- Score: "AI named you in X% of answers". Never "AI score", never /100, never a blend of named and other signals.
- Room labels exactly as above; "Not on your site yet: add a page if you offer this".
- Section titles: "Searches where you can get named" (opportunity), "Your targeted searches" (client).
- Footer line: "These are opportunities, not guarantees." No ranking, recommendation or citation promise.
- Wording for ambiguous places: ask with the wider area ("Stratford, East London"), new audits only.
- **Google AI = Google AI Mode, context only (2026-11-12).** New audits ask Google AI Mode in the Google AI box instead of the AI Overview. It is shown beside the answers but is **not scored**: ChatGPT and Gemini are the scored engines. Its firms go through the same filters (no directories, no service phrases). Older audits and reports keep the Google AI answer they stored; locked baselines are never re-run, and a client's re-measure is asked the same way as its baseline.
