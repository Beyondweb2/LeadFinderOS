# Site shot — one homepage picture per lead for the prospect report (2026-10-23/24)

Paul approved the contact sheet and the wiring on 2026-10-24. Record of what was built, measured and learned.
Mockups: branch `design/audit-report-concepts`; layout record: `docs/audit-report-v3.md`; the 20-site sheet: `docs/site-shot/contact-sheet-20-sites.png`.

## Shape
- **fn `site-shot`** (internal only: `x-cron-secret` + `x-internal-job`, `verify_jwt = false`). Modes: `status` (reads), `shoot` (one lead), `measure` (the operator's 20-site door: ignores the switch and the cap, stores under `measure/`, reports every verdict).
- **Table `lead_site_shots`** (one row per lead, service role only), **`site_shot_settings`** (the kill switch `enabled` + `monthly_cap`; seeded OFF / 600 by the migration, parity-tested against `SITE_SHOT_DEFAULT_MONTHLY_CAP`), **`claim_site_shot()`** (ONE conditional write: none / stale ok / failed with attempts left / old refusal / crashed claim; anything else is `held`), **private bucket `lead-site-shots`** (JPEG, 2 MB, no storage policies).
- **Rules** in `src/lib/siteShot.ts` (pure): the gate (`siteShotGate`: switch, protection mode, own real website, a fresh readable website check, cap), the image refusals, the page-text refusals (`siteShotPageProblem`), the London-month cap window, the dated caption.
- **Who asks:** `process-ai-audit-queue` calls `triggerSiteShot` (`_shared/site-shot-trigger.ts`, fire-and-forget, never throws) in BOTH places a lead's website check is settled. **`render-audit-report` only READS** a finished picture and mints a 2-hour signed link, only when the picture's source host equals the report's host. Opening a report never spends.

## Rules it taught (measured on 20 real prospect sites, 2026-10-23)
- 🔴 **A size can never tell a real page from a bot wall.** Two of twenty "pictures" were a 21 KB "Checking the site connection security" page; others were "Site Currently Unavailable" and "Please wait while your request is being verified". Every picture is judged by the text of the very page it shows.
- 🔴 **The page text must come from the SAME visit as the picture.** A separate second visit for the text passed a challenge picture (a second visit can land on a different page). Cloudflare's `/snapshot` returns both together; the separate `/content` read was deleted.
- **A refusal costs nothing but the plain card; a wall captioned "your homepage" is a false claim.** Absent = do not.
- **Cloudflare rate-limits this API** (HTTP 429 "Rate limit exceeded": 16 of 20 quick requests refused). A rate-limited try gives the lead's attempt back (`attempts: 0`). Pace ~10 s between measurements.
- **Some sites cannot be shot:** a Content-Security-Policy / Trusted Types policy (error 6004, even a bare shot), an auth prompt, a closed connection. They keep the plain card. Two transient errors (6003 "Not attached to an active page", `ERR_BLOCKED_BY_CLIENT`) get ONE retry.
- 1x JPEG at 1280x800, quality 80: median 87 KB, largest 157 KB (the mockup's 2x PNG was 1.5-1.9 MB). Median 3.7 s, slowest 10.6 s per picture.
- Final 20-site result: 16 shown, 2 refused as not-their-homepage, 2 no picture.

## Not done / owed
- Cost: Cloudflare's dashboard figure for Browser Rendering is the billed truth; the sum of request time over the 18 returned pictures was ~81 s. Paul to read the dashboard.
- No `api_usage_log` row per shot yet (the provider cost is unmeasured; `isFindableCost` / `PROVIDER_MIGRATIONS` need a decision when it is).
- Existing leads have no picture until their next audit finishes; a capped backfill is a separate approval.
- Report downloads (PDF / saved HTML) keep the plain card.
- `src/lib/siteFixLines.ts` stays but is unrendered ("What to fix first" was removed at Paul's request, 2026-10-23).

## Deploy record (2026-10-24)
Merged to main `e68c434f`. Edge: `site-shot` (+ `mockup`, which shares the driver), then `render-audit-report`, `process-ai-audit-queue` and the 24 other functions that import the renderer (admin-overview, ai-reply-drafts, business-summary, client-intake, client-onboarding, conversation-triage, findable-onboarding, market-view, niche-sample, page-generator, paid-baseline, paid-client-hub, process-whatsapp-queue, prospect-preview, quick-close, render-remeasure-results, render-welcome-pack, run-seo-scan, send-whatsapp-message, stripe-webhook, submissions, voice-note-script, warm-lead-reply, weekly-visibility). `whatsapp-status` untouched. Switch ON (`site_shot_settings.enabled`, cap 600) only AFTER every function was live.
Live proof: `render-audit-report` for Bracey's Accountants shows `q4-site q4-site--shot`, the caption "Your homepage, as we saw it on 24 Oct 2026", no "What to fix first", the guarantee card intact, and its signed image link returns 200 image/jpeg of the stored size; a second `shoot` for the same lead answers `held` (no second spend). SPA: `whatsNew` chunk carries `report-homepage-picture`, `aiAuditReportDownload` carries `q4-site--shot`.
NOT proved live: the queue's own trigger firing from a finishing audit (it needs a real audit to finish; check `select count(*) from lead_site_shots` grows after the next ones). One site (patienceplus.com.au) answered `cf_error` on a live shot and keeps the plain card, retried once at its next audit.
`scripts/coverage-found-added.test.ts` was red on main before all of this (Find Leads "Not a match") and still is.
