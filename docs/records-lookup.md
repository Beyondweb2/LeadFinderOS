# Records lookup — read the one for the thing you are about to touch

Moved verbatim from CLAUDE.md §10 on 2026-10-15. Add a row here when you write a new record (and list the file in `docs/INDEX.md`).

| Touching… | Read first |
|---|---|
| Sending from the Inbox outside the lead's send hours: the queue (inbox_scheduled_sends), its drain, the holds (they replied since / 24h expired), the reply-hours setting | `docs/inbox-send-window.md` |
| Closing items on the Sales dashboard (What to do next / Follow-ups): lead_close_work, the closed-until-they-reply rule (isClosedItem), Done vs Dead lead | `docs/close-dashboard-items.md` |
| The WhatsApp cap / pace / auto-pause settings (`whatsappPace.ts`), the CSV import batch + owner (`import_leads_v2`), the price model switch (`priceModel.ts` — the £499 link is OFF until Paul approves its agreement), texted numbers never get a cold WhatsApp | `docs/test-day-outreach.md` |
| A bulk audit's visibility score, the report offer's {{4}}, the bulk_score marker | `docs/bulk-audit-score.md` |
| The Inbox (WhatsApp **and** SMS — one component), the SMS status model and failure codes, inbound text handling, Run AI audit vs the reply setting | `docs/twilio-comms.md` (the "One Inbox, two channels…" section) |
| Malaysia / Singapore town populations on Coverage (fixed approximate table, sources per figure, blanks stay null, no Singapore city-wide filter) | `docs/coverage-my-sg-population.md` |
| Anything, as a NEW Claude account / fresh start — orientation, reading order, open actions, Paul's preferences | `docs/handover/00-START-HERE.md` (then the folder in its order) |
| The monthly client update (paid client page step 8), `client_monthly_updates` and its three functions | `docs/monthly-client-update.md` |
| What the 2026-10-02 closeout audit found complete / fixed / still open | `docs/closeout-2026-10-02.md` |
| Inbox / Outreach load speed, the stored result-part columns, parallel paging, the shared queue status | `docs/inbox-outreach-speed.md` |
| Site-wide speed: the list columns, the detail-on-demand dialog, the pager, the Dashboard/AI Audit/LeadSearch loads, the connection pool, the proposed DB work | `docs/site-wide-speed.md` |
| WhatsApp media access for Sales, the Inbox height/header layout, sending an image/video/document | `docs/inbox-media-and-layout.md` |
| The Sales Dashboard, the prospect workspace, contact logging, sign-up link tracking, the post-payment GBP step | `docs/sales-readiness.md` (+ `supabase/tests/sales-readiness.sql`, re-runnable, always rolled back) |
| Domain ownership / authority, the domain onboarding pages, ending a service over a dispute, the terms / refunds carve-out | `docs/domain-authority.md` (+ `supabase/tests/domain-authority.sql`) |
| Add a lead, services/areas on a prospect, the Sales Hook Audit / crawl / report share, sold_by, READY / MISSING, the PAID email's handoff lines | `docs/self-sourced-handoff.md` (+ `supabase/tests/self-sourced-handoff.sql`, re-runnable, always rolled back) |
| A salesperson's bulk pre-call check, its allowance, reuse windows, the job model | `docs/pre-sales-certification/fixes-07-sales-bulk-audit.md` (+ `fixes-07-rollback-qa.sql`, always rolled back) |
| Campaigns, the lead popup's four tabs, the Close branching, the sales talking points and their sources, tap ≠ contact | `docs/pre-sales-certification/sales-workspace-v2.md` |
| Team: admin-created logins with a temporary password, the first-login change, scanner-safe links (Continue page), link expiry (= auth setting `mailer_otp_exp`, not code), the Trial team member switch; the name on your messages (`profiles.message_name`); the `ai_visibility_report_offer` template (checked before queueing, Meta status read before sending, UK-worded templates never to MY/SG) | `docs/team-access-tidy.md` — ⛔ a password is never logged, stored by us, returned or put in an error; ⛔ a message is signed only with the SENDING person's own name (`messageName.ts`, `queued_by_user_id`) |
| Auth, roles, RLS, a lead read/write, any function a salesperson can reach, the Team page | `docs/multi-user.md` (+ `supabase/tests/multi-user-*.sql`, re-runnable, always rolled back) |
| The price, the guarantee, checkout, Stripe, the site origin, the report CTA | `docs/business-and-offer.md` (§1, §11, §12, §13, §13b, §26) |
| The three payment options (pay in full / 6 / 12 months), `paymentPlans.ts`, `payment_plan`, `paid_in_full_at` | `docs/payment-options.md` (+ `payment-options-live-setup.md`, `agreement-v6.md`, `v6-review-for-solicitor.md`) |
| The v3 agreement, sign-up link, payment gate, Option B dates, Continuing Service, v3 commission | `docs/pre-sales-certification/client-agreement-commercial-alignment.md` |
| Baselines, replays, the pointer, the results sender, the noise band, named-by-model | `docs/measurement.md` (§17, §18, §19, §24, §25, §31) |
| Prepare Baseline, `baseline_status`, the `starting` claim, the hub poller, the approve gate | `docs/paid-baseline-flow.md` (2026-09-22) |
| The recommended 20, Hook questions locked in, the Opportunity Backlog, the replay run-2 fix, collapsible sections | `docs/baseline-workflow.md` (2026-09-30) |
| Any WhatsApp template, sender, greeting name, the Inbox list, the reply rule | `docs/whatsapp-templates.md` (§6g, §16, §29, §30–30e, §32) |
| The client report, wrong-town history, partial results, the name that scores itself | `docs/reports.md` (§6b, §22, §27) |
| The manual audit wizard, the market model, how a national/hybrid question set is built | `docs/market-model-audits.md` |
| The free-check lane, its dedupe, its emails, where it meets the baseline | `docs/free-check.md` (§6j, §15, §21) |
| Dashboard numbers, the campaign card, the client card, stored tasks | `docs/dashboard.md` (§6h, §14, §23) |
| Website Build: build mode, template profile, build facts, the Build Pack | `docs/website-build-v1.md`, then `docs/website-build-v2.md` (routes, stage prompts, manifest), then `docs/website-build-recon.md` (recon import + fact merge rules), then `docs/website-build-mapping.md` (risk rule, template mapping, readiness, config), then `docs/website-build-execution.md` (build execution, preview, retry) |
| The page generator, the page-plan queue, Q&A modes | `docs/page-generator.md` (§6i) |
| Coverage, the town gate, state persistence, the DELETED market view | `docs/state-coverage-market.md` (§6c–§6f; §6e is archive) |
| findable-site's home page and copy rules | `docs/findable-site.md` (§20, §28) |
| Closing a sale: the two ways (Close on the phone / Send full setup), the phone questions, the Full Setup link | `docs/pre-sales-certification/two-close-options.md` |
| Why a trap rule exists — the incident | `docs/traps.md` (§4) |
| Why an architecture rule exists — the reasoning | `docs/architecture-rules.md` (§6) |
| The full open-problems record, incl. the WhatsApp cap model and the auth matrix | `docs/open-problems.md` (§8) |
| The long code map, the playbook documents | `docs/code-map.md` (§9) |
| An audit score / named count shown anywhere in the Inbox, the Visible flag counts, the drafter fallback count | `docs/audit-score-one-ruler.md` |
| The measured findings in detail | `docs/findings.md` (§5) |
| How things stood on 2026-09-09, the harness repair | `docs/state-of-play-2026-09-09.md` (§0) |
| The original §2 / §3 / §7 / §10 text | `docs/how-paul-works.md`, `docs/discipline-checklist.md`, `docs/parked-branches.md`, `docs/other-docs.md` |
| Website Build: fact edits / saves, service-area candidates, asset plan, Cloudflare modes, template fit, readiness | `docs/website-build-pilot-hardening.md` (+ the website-build-*.md phase records) |
| The crawl's content & trust checks (headings, accreditations, proof, placeholders, areas, conflicting facts, markup vs page, images, links, dates), evidence classes, the Master Standard wording rules | `docs/crawl-content-trust.md` |
| Website Build: the QUALITY standard — strengths, no-downgrade, completeness, old-vs-new upgrade, the source-site fact rule, the BUILD standard (image roles, Areas → map, mobile hero, reviews, forms) | `docs/website-build-quality-standard.md` |
| India (or any non-UK country): search bias, lead country, +91 phones, local send hours, audit wording, the measured Places quality, INR/Coverage designs | `docs/india-readiness.md` |
| Abuse / cost protection: the guard, thresholds, suspension, pause / emergency stop, exports, alerts | `docs/abuse-cost-protection.md` |
| Sales Experience: WhatsApp unread / states / deep link, the workspace dashboard, earnings, notifications, Focus Mode, feedback | `docs/sales-experience.md` |
| Directory listings / profile presence, its confidence and recheck rules, the hub integration still owed | `docs/directory-presence.md` |
| Lead statuses, the sales state, Log Contact outcomes, Last contact, outcome → Next Action | `docs/lead-state-model.md` |
| WhatsApp outreach compliance (PECR questions, the non-blocking decision, when to reopen) | `docs/whatsapp-outreach-compliance.md` |
| Salesperson onboarding, the ENFORCED Ready to Sell gate, paperwork handled outside the app, right to work, business type (display only), leavers, TPS/CTPS (postponed) | `docs/salesperson-onboarding.md` — the rule is `public.salesperson_onboarding_missing()`; onboarding rows are admin-only by having NO policy |
| The deep clean: what is done, what is next, Paul's standing decisions | `docs/deep-clean-phase3-plan.md` (+ `INVENTORY_DEEP_CLEAN.md`, untracked, the Phase 1 evidence) |
| The Client Service Agreement: its words (v1, pinned), the checkout tick, the agree page, the evidence tables (write-once), the signed PDF | `docs/client-agreement.md` |
