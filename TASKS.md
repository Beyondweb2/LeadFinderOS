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
| 4 | Raise `DAILY_CAP_USD` 8 → 12 | ✅ **done, deployed** | `d9aa0559` |
| 1 | Fetch the real address (`getPlaceDetails`) | ✅ **done, deployed** | `ef86c9bf` |
| 2 | Use it — town precedence + override | ✅ **done, deployed** | `ef86c9bf` |
| — | Migration-tolerance fix (regression caught in test) | ✅ **done, deployed** | `3b93284d` |
| 3 | Active directory check (Apify search) | ☐ **NOT STARTED — resume here** | |

## 🔴 BLOCKING: the SQL must be applied before Items 1+2 do anything

Until Paul runs this, the town fix is **inert** — audits keep using the searched town, exactly as
before, and nothing is broken (both call sites fall back when the columns are missing). It starts
working the moment the columns exist.

```sql
alter table public.outreach_leads
  add column if not exists derived_town     text,
  add column if not exists town_fetched_at  timestamptz;

alter table public.ai_audits
  add column if not exists location_source  text,
  add column if not exists location_note    text;

comment on column public.outreach_leads.derived_town is
  'Town from Google Place Details addressComponents (postal_town > locality > admin_area_2). The town the business is IN, as opposed to search_location which is the town I SEARCHED.';
comment on column public.outreach_leads.town_fetched_at is
  'When Place Details was last fetched for this lead. 30-day cache key.';
comment on column public.ai_audits.location_source is
  'confirmed | derived | search | none — which town this audit used and why. "search" means UNVERIFIED.';
```

After applying it, regenerate types so the two `as unknown as` casts can go back to plain casts:
`npx supabase gen types typescript --project-ref ruusxpkkmwtljxxulhbq > src/integrations/supabase/types.ts`

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
