# 12 — Open actions and next priorities

*Built from live reality on 2026-10-05 (database, deployed function versions and edge secret NAMES read via the
Management API; code at `main` `4ed16813`). Things already done today are NOT listed. Re-check each item before acting —
Paul may have done some of the manual ones since.*

## URGENT — manual (Paul; Claude cannot do these)

1. **Raise the Apify monthly cap to about US$150.** Verified still **US$40** (US$29.04 used, cycle ends 16 Oct). At US$40,
   prospecting stops at 85% (~US$34) — salespeople's "Check before calling" will stop within days, and at 100% every AI
   question stops, client baselines included. Apify dashboard → usage limits. Do this **before** reps use bulk checks.
2. **Open the four admin screens once, signed in, on https://app.leadfinderos.com**: a Paid Client page, Website Build, a
   client's Welcome Pack, Admin → API Usage & Security. They are deployed and marker-verified but nobody has seen them
   rendered. If they load, the 2026-10-05 deployment is complete.
3. **Approve the four-week results email copy** (`docs/pre-sales-certification/final-certification.md` §8 — three versions).
   Until then `REMEASURE_RESULTS_COPY_APPROVED = false` holds every result. (No client is currently due — RG is refunded,
   Ronnie and MCL are ended — so this is urgent only before the next real client's day-28.) After approval: one commit flips
   the constant + redeploy `paid-baseline`, `process-ai-audit-queue`, `render-remeasure-results`.
4. **Stripe:** deactivate the **two old Payment Links** from Paul's old "Pricing" text; **look once at MCL's Stripe customer**
   for any subscription or schedule (our database shows none) and cancel if found.
5. **Finish the Findable Meta / WhatsApp setup** (app, business number, templates) and **obtain the exact Findable App
   Secret**. Verified: `WHATSAPP_APP_SECRET` is **not set**; live `whatsapp-status` is v114 (2026-09-30).
6. **Then (Claude, with Paul): the WhatsApp cutover**, strictly in order — secret configured → deploy the held
   `whatsapp-status` → signed inbound QA (unsigned POST → 401) → deliberate Move37 → Findable cutover (token, phone id,
   verify token, webhook, templates re-registered with identical names). Details: `07-SECURITY-AND-PERMISSIONS.md`.
7. **Account / access hygiene for the Move37 exit** (see `15-ACCOUNT-MIGRATION-CHECKLIST.md`): findable.live email forwards to
   `paul@move37.fun`; findable-site's Cloudflare account is "Paul@move37.fun's Account"; the operator login is
   `paul@move37.fun`; WhatsApp runs on Move37's Meta app. If the move37.fun mailbox or accounts could disappear, move these
   first.

## PRODUCT NEXT (likely priorities)

1. **Trade templates for Website Build.** Only one template exists (MCL locksmith, `mcl-local-trades`, pinned to a live
   client repo). A non-locksmith New-site client with no old site is blocked → Bespoke in Advanced. Build a Findable-owned
   template repo (`Beyondweb2/findable-local-trades-template` is planned but does not exist) and trade profiles for the
   trades being sold (plumbers, electricians, roofers…). `05-WEBSITE-BUILD.md`.
2. **Watch the first genuine Stripe payment end to end** — webhook, subscription (trial to day 42, 11 / 5 charges), first-
   contact notification, new-client email, commission ledger. The idempotency has never run against a real customer.
3. **Advanced-only Website Build inconsistencies** — the current-website one is FIXED (2026-10-05, `currentWebsite`, one
   rule for both views; `docs/pre-sales-certification/advanced-website-truth-fix.md`). Still owed: sweep Advanced for other
   places that disagree with the simple view's truth rules.
4. **Campaign permission tidy-up** — `leadPermissions.campaigns` (`src/lib/access.ts`) still says admin-only and the Find
   Leads "ask each time" dialog hides New for salespeople, while the server lets reps create/manage their own campaigns.
5. **Re-register the stale WhatsApp bodies** — `explain_offer` / `explain_offer_v2` quote a retired offer and review replies;
   they are blocked (`STALE_OFFER_TEMPLATES`). Best done as part of the Findable Meta setup.
6. **Optional live QA not yet done on production:** an Optimise call script rendered for a QA lead with a website, and a full
   Build Quick Close on a QA lead — skipped on 5 Oct to avoid creating a live Stripe Checkout session.

## OPTIONAL LATER

- **Integrated phone calling** — not built and not planned yet; the current plan is the phone's native dialler (`tel:`) on a
  business SIM / eSIM.
- **Four-week results by WhatsApp** — email only today.
- **Deep clean Phase 3, steps 4–10** (`docs/deep-clean-phase3-plan.md`) — barber branches in live functions, tour/i18n,
  orphan function deletes (90 deployed vs 68 in source), dead secrets (Instantly, Twilio, barber price), SQL purges — Paul
  sees every file list / statement first. Steps 4 (socials) and 7 (multi-user) were overturned — do not delete those.
- **Known report-accuracy bug:** `classifySource` grades every `.org` as authority.
- **`uk_towns` lacks the major cities** (the corrected BUA22 insert is parked).
- **AI Audit list** reloads its whole dataset while a run drains; paging owed.
- **`run_number`** has no unique index (keep repeat runs sequential until it does).
- **Stale code comments** to correct when passing: `auditQuestionCounts.ts` ("12, NOT 10"), `create-ai-audit/index.ts`
  ("BASELINE_QUESTIONS (10)"), several "8 weeks" comments (`remeasureResults.ts`, `remeasureFill.ts`,
  `remeasureResultsHtml.ts`, `_shared/remeasure-results.ts`), the `LeadDetailDialog.tsx` tab comment (WORK / SCRIPTS /
  PROSPECT), the `sources.ts` "MUST EQUAL" comment, `measurementCompare.ts` "SPA-only" header.
- **The stale primary checkout** `C:\Users\paulj\LeadFinderOS` could be reset to `origin/main` — but keep its untracked
  `SQL_FOR_PAUL_*.sql` files (only copies) and never delete the folder (worktrees hang off it).
- **Unmerged certification report branches** `cert/a-salesperson` … `cert/e-security-reliability`, `cert/master-launch-plan`
  hold the full 2026-10-04 audit reports (main has only stubs). Merge them as docs if Paul wants them on `main`.
- **Local-only branch** `feat/forecast-nextaction-crawl` (one commit, 2026-10-02, never pushed) — probably superseded by
  the commission-six work that is on main; check before deleting.
- **`leadfinderos-next.pages.dev` redirect** to the custom domain — only when Paul says.
- Do **not** merge: `full-measure-dials`, `edge-check-gate`, `findable-product-rename`, `short-signup-url`,
  `claude-md-session-safety` (already ported).
