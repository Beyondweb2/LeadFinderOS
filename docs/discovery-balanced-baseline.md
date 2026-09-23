# Discovery before the paid baseline, and the balanced 20 (2026-09-23)

## Why

BS4 Electrical (lead `ac4e420e-…`) has 6 approved service areas (Bath, Keynsham, Portishead,
Clevedon, Nailsea, Weston-super-Mare) and 26 service entries, yet its drafted baseline was 20 Bristol
questions with 8 near-duplicate pairs ("rewiring services in bristol uk" / "rewiring Electricians in
Bristol UK").

Cause: the paid baseline was **home-town only by design** (Paul, 2026-09-12). create-ai-audit's
generator rejects every question that does not name the primary town (`dropMissingTown`), refills
from primary-town templates, and its prompt says "ALWAYS write the place EXACTLY as <town> UK". The
areas were passed as a prompt hint that could never survive the gate. The only dedupe folded case and
plurals. The 26 services included crawl-detected duplicates ("EICRs", "EICR reports", "EICR Bristol").

## Decision (Paul, 2026-09-23)

The paid baseline spans the home town AND the approved service areas; **the refund is judged on all
20 frozen questions**. Customer copy changed to say so: findable-site onboarding helper (mirrored in
LeadFinderOS `manualOnboarding.ts`), `/refunds`, the "What we do" stage copy; the welcome pack now says
"judged on these exact questions" / "the same towns". Already-frozen sets (RG, Ronnie, MCL) are
unchanged and still true under the new wording. Scoring, 20 × 3 × ChatGPT + Gemini, the freeze and the
verbatim day-28 replay are unchanged. The Full Measure (20 × 3 across home + areas, disjoint) is
unchanged.

## Flow (Prepare Baseline dialog)

A. context → **B. Discovery** → C. questions (Generate balanced baseline, edit) + coverage → D. approve.

- **Generate Discovery questions** (`paid-baseline` `discovery_generate`): one create-ai-audit preview
  (purpose `discovery`) PER APPROVED TOWN — home town ~20–24, each area 4–8 (`perTownCounts`), total ≤ 80
  — with NO lead id (otherwise `pickAuditTown` replaces the town with the confirmed home town). The
  services sent are the de-duplicated canonical list. Each town's questions are pinned to that town by
  the generator's own gate; the pool is interleaved by town and de-duplicated by meaning, stored on
  `onboarding_responses.baseline_discovery`. Costs one small question-writing call per town; asks no
  AI engine.
- **Run Discovery** (`discovery_run`, priced on its button, confirm dialog, `confirm_cost: true`):
  the pool measured as an ordinary Discovery audit × 3 runs (~$0.0104 per question per run). Never
  the baseline, never frozen. Not run on BS4 in verification (Paul's choice).
- **Results**: `discoveryState` reads the Discovery audit's answers and applies the EXISTING
  classifier (`src/lib/discoveryOpportunity.ts`, moved out of `Baseline.tsx`, which now imports it):
  Winnable / Possible / Already strong (named) / Weak, with "named in N/3 runs", fragmentation and the
  classifier's reason. Grouped by opportunity or by town.
- **Add to baseline**: appends to the draft on screen; the balanced generator keeps those first.
- **Generate balanced baseline** (`generate` / `balanced`): `buildBalancedBaseline` over the pool plus
  Paul's added questions — targets ~4 broad · 8 service · 6 service + other area · 2 emergency/problem
  for 20, rotating services (cap ~20%) and towns (home ~45%, each area ~15%), never admitting a
  near-duplicate, deterministic. ⛔ It has no access to winnability. Writes a draft (`needs_approval`).
- **Coverage** (live, `coverageReport`): N / 20, areas, services, intent types, warnings ("16 of 20
  questions target Bristol while 5 other approved service areas are unused…", one service dominating,
  few services, near-duplicate pairs listed).
- **Approve**: exact 20 as before; near-duplicates are refused (`baseline_near_duplicates`) unless
  Paul ticks "approve anyway" (`accept_duplicates`).

## Near-duplicates (`src/lib/baselineMix.ts`)

`meaningTokens`: lower-case, approved towns removed, synonyms folded (fuse board = consumer unit,
rewire/rewiring, EV charger/charging/charge point, EICR/electrical condition report/certificates,
lights/lighting, 24/7/urgent → emergency), plurals folded, filler removed (service(s), electrician(s),
installer(s), best, local, UK, for my home …). Same intent = same town and identical meaning or ≥ 80%
token overlap. Residential / commercial / landlord stay meaningful.

## BS4 verification

See the session report (2026-09-23). Generate-only: no Discovery run, no freeze, no baseline started.
