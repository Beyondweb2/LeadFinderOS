# Typed-town audits (2026-10-15)

**Problem.** Ethan's CSV import (`import_batch`, no Google place id, no `lead_source`) was refused 409 `town_unverified` on 94 of 95 leads:
the town gate only trusted a Google-confirmed town, and the hand-added exemption read `lead_source`, which imports leave empty. Failed
audits cost nothing (nothing was asked, no place lookup).

**Rule.** One predicate, `auditTownGated` (`supabase/functions/_shared/typed-town.ts`), read by bulk-jobs (before any call) and
create-ai-audit (the authority): a lead with NO place id that was hand-added (`lead_source`) or imported (`import_batch`) passes when its
typed `search_location` / `address` is a real town. A Google-resolved lead is never exempt. A messaging gate never uses it.

**What is a town** (`src/lib/typedTown.ts`, `cleanTypedTown`): first segment before `;`, bracketed landmark dropped
("Kuala Lumpur (Sunway Velocity 2)" -> "Kuala Lumpur"), a neighbourhood list ending in the city -> the city, never "Online" / "Remote" /
"Worldwide" / a sentence. A derived town that is not a place (Google answered "Online") is not verified (`townVerdict`) and
`pickAuditTown` skips it. No real town -> refused before a call (`skipped_town_unverified`, "No usable town ...") or, at create-ai-audit,
400 `local_scope_needs_town` with a message.

**Questions.** `hookPlaceFor` (seedGuard) pins the top-up hook place with the country for every listed country: "Kuala Lumpur, Malaysia",
Singapore not pinned twice, UK byte-identical. `malaysia` joins `NATIONAL_LOC_TERMS` (a country-only location is not a town).

**Limits are read from code, never retyped:** `src/lib/auditLimits.ts` (`AUDIT_RUN_CAP_USD`, `AUDIT_BULK_JOB_MAX_LEADS`,
`prospectingRemainingUsd`, `auditLimitsSentence`) + `auditBudget.ts` (`POOL_DAILY_CAP_USD.prospecting`, `APIFY_RESERVE_PCT.prospecting`).
The Outreach "Run AI audits" box used to say "Capped at $3/audit + $15/day" - no such cap ever existed.

Test: `scripts/typed-town-audit.test.ts`.
