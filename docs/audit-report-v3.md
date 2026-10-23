# The prospect (quick) report, v3 layout — Phase 1 (2026-10-23)

Paul's approved design, built in the real renderer (`renderQuickCheckReport` / `renderQuickCheckHeader` in
`src/lib/aiAuditReportHtml.ts`). Mockups: branch `design/audit-report-concepts` (`docs/audit-concepts/site-first-v3.html`, never merged).
Only the six-answer quick report (`concept4`) changed; the paid, weekly, market and older reports did not.

## Shape, top to bottom
Light header → black hero band ("How visible is X in AI search?", overall % in a ring, verdict, method line) → one white
tile per engine (+ Google AI as a tile: display only unless the audit's scoring method puts it in) → **What we found on your
website** (a neutral site card beside the issues) → **The questions we asked** (one box per question: dark title bar, grey
body, one white cell per engine, competitors red, the business green, a miss grey) → **What to fix first** (≤3 lines) → the real
closing band (CTA buttons + the locked guarantee sentence, unchanged).

## Rules it taught
- **Fix lines** live in ONE file, `src/lib/siteFixLines.ts`, keyed by finding KIND, exhaustive by type (a new kind will not compile
  until it has a line or an explicit null). ≤3, deduplicated, only for findings the report showed, no figures, no promise.
  Wording approved by Paul 2026-10-23 (`docs/audit-report-v3-fix-lines.md`). **A new finding id from the website check needs an
  alias or it prints no fix.**
- 🔴 **A live report's issues come from the lead's ONE website check (`websiteCheck.ts`), whose finding ids are siteAudit ids
  (`ct_<kind>` for content checks) — NOT the crawl kinds.** I keyed the first version on crawl kinds and found only on the live
  check that most real reports would have shown no fix row. `FIX_ALIASES` maps the site-audit ids to approved lines. Test the
  path a real report takes, not the path the mockup took.
- The report is **light only** (`:root{color-scheme:light}`); the old dark-mode block is gone (test D2 pins it).
- The site card is NEUTRAL (their host + "N things found"): nothing drawn, no picture. Host comes from `render-audit-report`
  (`data.siteHost`; an aggregator page names none). Phase 2 (a real homepage capture) is a separate approval; see below.
- The snippets of each AI answer are still in the markup but `display:none` (CSS) to keep the boxes short.

## Phase 2 (NOT built — needs approval): the homepage picture
The audit crawl stores only the `og:image` link. A real capture exists only in the mockup / prospect-preview flow
(`_shared/mockup-shot.ts`, Cloudflare Browser Rendering, 1280×800, private bucket). Plan: one capture per lead when its crawl finishes
(never on opening a report), a table + private bucket, a signed link minted per render, neutral-card fallback for no-site/aggregator
leads, a spend cap, cost measured on ~20 sites first (estimate: a fraction of a penny each, unconfirmed).

## Deploy record
Merged to main `d379d49f` (+ aliases `beb71bac`). Edge: `render-audit-report` plus the 25 other functions that import the renderer
(admin-overview, ai-reply-drafts, business-summary, client-intake, client-onboarding, conversation-triage, findable-onboarding,
market-view, niche-sample, page-generator, paid-baseline, paid-client-hub, process-ai-audit-queue, process-whatsapp-queue,
prospect-preview, quick-close, render-remeasure-results, render-welcome-pack, run-seo-scan, send-whatsapp-message, stripe-webhook,
submissions, voice-note-script, warm-lead-reply, weekly-visibility). `whatsapp-status` untouched. Live proof: the public report body
carries `q4-hero2`, `q4-ring`, `q4-found` and the fix section; the SPA's `whatsNew` chunk carries `report-v3-layout` and
`aiAuditReportDownload` carries `q4-hero2`.
`scripts/coverage-found-added.test.ts` was already red on main before this change (the Find Leads "Not a match" work) — unrelated, not fixed here.
