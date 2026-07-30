# TASKS.md — live checklist for the wrong-town fix + active directory check

**Purpose: if a session runs out of room, this file says where to resume.** Update it after each item
with the commit hash and commit it. Do not batch items — ship and merge each one separately.

Started 2026-07-30, from `main` at `faf51457`.

---

## Order of work (and why it differs from the brief's numbering)

Item 4 is done FIRST because it is one line and because Item 3 spends real money — a cap tripping
mid-run leaves broken data, which is the exact failure Item 4 exists to prevent.

| # | Item | Status | Commit |
|---|---|---|---|
| 4 | Raise `DAILY_CAP_USD` 8 → 12 | ☐ not started | |
| 1 | Fetch the real address (`getPlaceDetails`) | ☐ not started | |
| 2 | Use it — town precedence + override | ☐ not started | |
| 3 | Active directory check (Apify search) | ☐ not started | |

---

## Item 4 — `DAILY_CAP_USD` 8 → 12
- [ ] `process-ai-audit-queue/index.ts` constant + comment arithmetic
- [ ] `deno check --sloppy-imports`, exit code captured directly
- [ ] redeploy `process-ai-audit-queue`, prove exit 0

## Item 1 — fetch the real address
- [ ] Restore `getPlaceDetails()` from `a8fd7003^:supabase/functions/search-leads/index.ts`,
      trimmed to `formattedAddress`, `addressComponents`, `location`. Keyed on `place_id`.
- [ ] Town extraction reused as-is from `generate-barber-site:307-310`
      (UK `postal_town` → `locality` → `administrative_area_level_2`)
- [ ] Called inside `create-ai-audit` immediately before question generation, ONE try/catch
- [ ] 30-day cache on `town_fetched_at`; failure flags and proceeds, never blocks
- [ ] Cost logged via `runEnrichSource` + `recordCostCorrection`
- [ ] **SQL handed to Paul** (never run by me)

## Item 2 — use it
- [ ] Precedence `confirmed_location || derived_town || search_location`
- [ ] **OVERRIDE** an incoming `location_text` (bulk-jobs:229 and whatsapp-inbound:226/376 pass one in)
- [ ] `_shared/audit-baseline.ts:412` — the guarantee path
- [ ] `AiAudit.tsx:753` — the wizard
- [ ] Record which town was used and why on the audit
- [ ] Do NOT touch: findable-onboarding:127/:237, stripe-webhook:458, OnboardingLinkCard.tsx:49,
      Inbox.tsx:397 — customer-facing, different purpose

## Item 3 — active directory check
- [ ] `apify/google-search-scraper` via `_shared/enrichment/ai-search.ts`, no new vendor
- [ ] `site:<directory> "<business name>" <town>`; confirm a PROFILE url, not search/category
- [ ] Candidate directories from the trade-level derivation, never hardcoded
- [ ] ON DEMAND only — never at discovery, never in the WhatsApp queue
- [ ] Triggered from the lead and from `/playbook/:id`
- [ ] Stored with a timestamp so it is not re-run needlessly
- [ ] Capped + logged with the correction mechanism
- [ ] Shown on `/playbook/:id` distinct from the citation signal: "we searched and found it" vs
      "we saw their listing cited"

---

## Standing constraints (from CLAUDE.md and the brief)
- Never filter the WhatsApp queue on directory presence — already-listed ≠ no lever (ABLM is on
  Yell's Wisbech page and was named 0 times in 80 measurements).
- Never change existing audits' `location_text`. New audits only.
- Never change the radius search — the wide search is deliberate.
- `deno check --sloppy-imports` on every changed edge file, exit code captured DIRECTLY.
  Pre-existing failures, already proven: `generate-barber-site` (3 generics errors) and
  `search-leads:1275` (one `SupabaseClient` generics error).
- `npm run typecheck` baseline is **15**.
- Redeploy every function importing a changed shared module, and prove each.
