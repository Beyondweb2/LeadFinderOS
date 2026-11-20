# Natural question wording — no "UK" in new questions (2026-11-20)

Paul: audit questions ended in "UK" ("best plumber in Newcastle UK"). Real people don't type that. Goal: questions read the
way customers ask; the location is set separately.

## 1. Do the Apify engines take a location?

One actor runs every engine: `apify~google-search-scraper` (`_shared/enrichment/ai-search.ts`). Its input schema (build
0.0.491, read 2026-11-20) has `countryCode`: "passed to Google Search as the gl parameter … The country is also sent to the
LLM search engines. ChatGPT, Gemini, Copilot and AI Mode do not support every country; if the selected one is not available,
that engine returns no result." There is also `locationUule` (exact location) — **Google results only**; the AI engines get
the country, not a town.

| Engine | Country setting | Exact town | What we send |
|---|---|---|---|
| ChatGPT | yes (`countryCode`) | no | `gb` |
| Gemini | yes (`countryCode`) | no | `gb` |
| Google AI Mode / Overview | yes (`countryCode`, Google's `gl`) | Google `uule` only | `gb` |

We were **already** sending `gb` on every run and every one-engine lane (`toCountryCode`: UK, blank and unknown → `gb`). No
proxy setting is exposed for the AI add-ons. So nothing about *where* we ask changed — only the words.

## 2. The 10-question test (2026-11-20)

10 real stored questions for towns shared with places abroad, each asked three times from `gb` with the same input an
audit uses (ChatGPT + Gemini + Google AI Mode): with "UK", without "UK", and with "UK" again (the control — how much the
answers move when nothing changes). Run through a temporary internal function (`question-wording-bench`, deployed for the
test and deleted after; the Apify key never left Supabase). Cost ≈ $0.44.

**Wrong country without "UK"** (UK wording: none of these ever went abroad):
- **Boston** — all three engines answered about Boston, Massachusetts (US phone numbers, "Boston, MA"). 0–13% of firms shared.
- **Halifax** — Gemini answered Halifax, Nova Scotia. ChatGPT and Google AI stayed in Yorkshire.
- **Lincoln** — Gemini mixed in Lincoln, Nebraska electricians.
- **Peterborough** — Google AI named one Ontario firm (+1 705 number).
- Newcastle, Stamford, Richmond, Cambridge, Gloucester, York — stayed in the UK (ChatGPT even wrote "Newcastle upon Tyne").

**Do the named businesses change?** Overlap of named firms, average over 30 engine answers:
- same question asked twice: **47%** (this is normal run-to-run churn)
- with vs without "UK": **38%** — **41% if Boston is left out**.

So apart from the wrong-country towns, dropping "UK" moves the named firms about as much as simply asking again. The real
risk is the handful of towns with a bigger namesake abroad — handled below.

## 3. What changed

- `seedGuard.ts`: `questionPlaceSuffix(country)` → `""` for UK (other countries keep "Pune India" etc.).
  `ukLocalPlaceName(town)` drops a typed "UK" and writes a risky town the local way: Boston, Halifax, Lincoln,
  Peterborough, Stamford → "Boston, Lincolnshire" etc.; Perth, Hamilton, Kingston, Windsor (big namesakes, untested).
  Never a town ambiguous inside the UK (Richmond, Wellington). `naturalUkQuestion` / `qualifyPlace(…, "")` drop a stray
  "UK" the model writes and apply the local form. `hookPlaceFor` uses it for UK.
- `create-ai-audit`: fallback templates, the prompt's place (`locQ`), customer style (`customerPlace`), the prompt rules
  ("never add UK"), both `qualifyPlace` calls.
- `customerQuestion.ts` (paid Discovery): empty suffix = UK = the town alone; ", UK" stripped.
- `paid-baseline`, `baseline-discovery`, `nicheSample.ts`: same rule.
- `abroadAnswer.ts` + AiAudit page: an amber line on any engine answer of a **UK audit** that reads as abroad (US/Canadian/
  Australian states and codes, "+1" phone numbers). Display only — never a score. On the 20 test answers it flagged exactly
  the 6 abroad answers and none of the UK ones.

National audits ("accountant for small businesses uk") are **unchanged** — not part of this change.

## 4. Frozen questions are not touched

A day-28 replay, a frozen baseline's repeat runs and a locked Hook set re-ask their **stored** strings. Only newly generated
questions change. Note: a NEW baseline whose Hook questions were generated before today keeps those three "UK" questions
(they are locked verbatim) next to new natural ones.

Client baselines whose frozen questions contain "UK" (2026-11-20, `outreach_leads.baseline_audit_id`):

| Client | Baseline | Questions | With "UK" |
|---|---|---|---|
| AD Locksmithing | 2026-09-13 | 11 | 11 |
| White Sparks Electrical | 2026-09-13 | 12 | 12 |
| SC Plumbing & Gas Ltd | 2026-08-22 | 10 | 10 |
| Ronnie's Shoe Repairs & Key Cutting | 2026-08-13 | 18 | 3 |
| RG Locksmiths cambs | 2026-08-11 | 12 | 12 |
| MCLocksmiths centre | 2026-09-22 | 20 | 0 |

(ZZ QA-C1 fixture: 3 of 20.) Paul decides whether any of these change; the code does not.
