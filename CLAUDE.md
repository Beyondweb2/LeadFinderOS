# CLAUDE.md — the rules. Short on purpose.

**Read all of it — it is ~1,200 lines and it is the memory you don't have.** It holds RULES and
POINTERS. The stories behind them — every dated session record, every incident narrative, every
number that was measured on a particular day — live in **`docs/`** and are read ON DEMAND, by topic.
`docs/INDEX.md` maps every old section number (§N) to its file; a "§N" inside `docs/` means the
original numbering.

⛔ **THE ONE RULE ABOUT THIS FILE: a session record goes in `docs/`; CLAUDE.md gets a rule or a
pointer, never the story.** If a paragraph here starts telling what happened on a date, it belongs
in `docs/`. Split 2026-09-16 from 5,219 lines / 448 KB (~110,000 tokens read at the start of every
session, most of why a prompt took 20–30 minutes) to this. Keep it here.

Facts and warnings, not prose. Correct a stale line when you find one; add a rule when you learn one.

---

## 0. State of play (2026-09-16; customers + handover updated 2026-10-05)

- 🆕 **NEW CLAUDE ACCOUNT? Start at `docs/handover/00-START-HERE.md`** (account handover, 2026-10-05) — the
  orientation, reading order, open actions and Paul's preferences. This file stays the rulebook.
- 📁 **Where to work (since 2026-10-05):** PRIMARY checkout = **`C:/Users/paulj/LeadFinderOS-current`** (its own
  clone; keep it clean on `main`). PARALLEL work = **`C:/Users/paulj/LeadFinderOS-wt/<task>`**, added FROM the
  primary after `git fetch origin`:
  `git -C C:/Users/paulj/LeadFinderOS-current worktree add -b <branch> C:/Users/paulj/LeadFinderOS-wt/<task> origin/main`.
  ARCHIVE = **`C:/Users/paulj/LeadFinderOS`** — stale; no new work there unless Paul asks you to inspect it. Never
  delete it: the ~95 OLDER worktrees still junction to its `node_modules`, and it holds the only copies of its
  `SQL_FOR_PAUL_*.sql`, and the `.git` the older `LeadFinderOS-wt` folders hang off. Full note:
  `docs/handover/09-PRODUCTION-AND-DEPLOYMENT.md` "Local machine layout".
- **Product:** Findable — AI visibility for local UK businesses (§1). **No active paying client on 2026-10-05:**
  Ronnie and MCLocksmiths are ENDED (`client_ended_early`), RG Locksmiths and SC Plumbing are REFUNDED
  (`docs/handover/10-HISTORICAL-CLIENTS-AND-EXCEPTIONS.md`). Re-count before quoting.
- **Operator app = `https://app.leadfinderos.com`** (canonical since 2026-10-01; custom domain on
  the `leadfinderos-next` Pages project). Written ONCE: `OPERATOR_APP_URL`,
  `src/config/operatorApp.ts` (SPA, edge, scripts all import it; `operator-app-url.test.ts` fails on
  a second copy). `https://leadfinderos-next.pages.dev` is the **temporary legacy/fallback** address
  during the migration — same build, still in Supabase Auth Redirect URLs, never used to build a
  link. Do not redirect it until Paul says so. Record: `docs/operator-app-domain.md`.
- **Repo:** `main` auto-deploys the SPA to the `leadfinderos-next` Cloudflare Pages project
  (served at app.leadfinderos.com) on push — observed working 2026-09-23. ⛔ **Never verify
  against `leadfinderos.pages.dev`** — a legacy project, not connected, frozen on an old bundle
  (§7). NEITHER project is in the Cloudflare account wrangler uses on this machine (it has only
  `findable-site`, `findable-directory`), so prove a deploy by the live BUNDLE, never a dashboard
  (§4 deploy check; `node scripts/verify-live.mjs`). **Edge functions deploy by
  hand** (`npx supabase functions deploy <name>`) and keep running old code until you do.
- **Gate: `npm run check`** = typecheck-vs-baseline (9 deliberate errors, compared as a LIST) +
  `check-edge-syntax` + `check-edge-undefined` + `check-import-graph` + `npm run build` + `npm test`
  (313 suites on 2026-10-05; the count grows — read the runner's own total). **FULLY GREEN since 2026-10-02**
  (313/313 on 2026-10-05) — there are NO known failures any more; a red suite is a real finding, unless the
  runner's ⚠️ ENVIRONMENT banner says the findable-site copy is behind (refresh it, below). (The old "known-stale" four were stale tests fixed that day; `site-origin`
  runs under Node with a `Deno.env` stand-in.) Typecheck reads 9 = the deliberate baseline LIST.
  📦 **Dependencies (2026-10-05):** `LeadFinderOS-current` has its OWN `node_modules` (`npm ci` from the lockfile;
  `.npmrc` keeps `legacy-peer-deps`). A NEW worktree junctions to it — never to the archive's.
  ⚠️ **The cross-repo suites read findable-site SOURCE through ONE resolver, `scripts/findable-site-dir.mjs`:**
  `FINDABLE_SITE_DIR` → `../findable-site-current` → `../findable-site`. The clean clone is
  **`C:/Users/paulj/findable-site-current`** (findable-site `origin/master`; `LeadFinderOS-wt/findable-site-current`
  is a junction to it). The older `../findable-site` siblings are stale (the primary `C:/Users/paulj/findable-site`
  is dirty; `LeadFinderOS-wt/findable-site` → `findable-site-wt/main-mirror` was 3 commits behind on 2026-10-05) —
  a red cross-repo suite is first a question about WHICH tree it read; `npm test` prints it and warns when it is
  behind or dirty. **Refresh after a findable-site merge:** `git -C C:/Users/paulj/findable-site-current pull --ff-only`.
- **Deno is not installed.** `deno check` cannot run here; the deploy is the only real gate for an
  edge function (§3, §4).
- **The deep clean is in progress — Phase 3, steps 1–3 done (Feedback, SMS, Instantly; all in
  `main`).** `docs/deep-clean-phase3-plan.md` is the plan for the rest — contact discovery, tour/i18n,
  barber branches in live functions, the 20 orphan function deletes, the
  SQL and purges that go to Paul one statement at a time — **and Paul's standing decisions, which
  are not to be re-asked.** `INVENTORY_DEEP_CLEAN.md` (untracked) is the Phase 1 evidence. Dead and
  not to be built on: the barber/salon product, Instantly, Twilio/SMS, contact discovery, the
  Feedback page. 22 functions are deployed with no source (2 belong to the
  findable-directory repo and stay). ⛔ **Step 7 (delete the multi-user surface) is OVERTURNED** —
  Paul, 2026-09-27: see the next bullet. ⛔ **Step 4 is OVERTURNED for SOCIAL discovery** (Paul,
  2026-09-30, `docs/social-profiles.md`): Find socials / `social-profiles` / `enrich-business` /
  `lead_social_profiles` are live and kept; Find email too (2026-09-29).
- ⛔ **Social profiles (2026-09-30, `docs/social-profiles.md`)**: ONE grade rule (`src/lib/socialProfiles.ts`,
  confirmed / likely / unverified) and ONE canonical pick (`_social_profiles_sync`, SQL trigger) that
  mirrors onto `facebook_url` / `instagram_url` / `linkedin_url` + `*_status`. **Never write those
  columns from code** — write `lead_social_profiles` through `_shared/social-find.ts` `saveGraded`
  (never re-activates a rejected row, never touches a person's row, only RAISES a grade). Unverified is
  never canonical; two at the top rank = review. ⛔ **LinkedIn is never scraped** — own-site link or
  pasted only; "Search LinkedIn" is a search link. ⛔ **Paid Enrich is ADMIN-ONLY** and never
  overwrites an email. Confirmed and Likely must LOOK different on every surface (`SocialLinks`).
- **Multi-user is built: ADMIN + SALES on ONE book** (2026-09-27, `docs/multi-user.md` — read it before
  touching auth, RLS, a lead read/write, or any edge function a salesperson can reach). Every row
  keeps `user_id` = the book owner; who WORKS a lead is `assigned_to_user_id`. A salesperson never
  reads `outreach_leads` (it holds Stripe/amount/refund/delivery columns) — only the `sales_leads`
  view and the role-checked SQL functions.
  ⛔ **Outreach owner scope (2026-10-05, `docs/pre-sales-certification/outreach-ownership-safety.md`)**: the admin's
  Outreach opens on MY LEADS = leads the admin OWNS (never unassigned), NOT remembered; Unassigned / a rep / All team
  (= every OWNED lead, unassigned excluded) only when chosen. A lead a signed-in team member adds is owned by them at
  creation (trigger `trg_outreach_leads_added_by_owner`); only system inserts stay unassigned. Unassigned → "Claim for me". The scope is
  applied by the PAGE before the table (`src/lib/outreachOwnerScope.ts`) — never as a row filter inside it — so
  counts, Select all and bulk actions cannot reach a hidden lead. A contact action spanning owners needs
  "Queue across team" (`contactScopeCheck`). A campaign launch messages only the campaign OWNER's leads
  (`other_owner`, `unassigned` skipped). Campaign membership never overrides ownership.
  ⛔ **ONE workflow (Paul, 2026-09-27): Sales uses the SAME Outreach and Inbox** — never build a
  SalesOutreach/SalesInbox or a second CRM (My Leads is deleted). Reads go through `leadSourceFor`;
  a salesperson's writes go through `planSalesPatch` → the lead functions (a direct update from a sales
  session is a SILENT 0-row success); what Sales cannot do is `leadPermissions` (`src/lib/access.ts`).
  ⛔ **Next Action is human-set only** (Paul, 2026-09-28) — no add/claim/send/reply/audit/status/queue/
  cron path may write `next_action`/`next_action_date` (clearing to 'none' is fine). Exception (Paul,
  2026-10-02): a person logging Call back / Meeting booked saves Call / Meeting with no day (`outcomePlan.setNextAction`).
  ⛔ **ONE Next Action** (`docs/one-next-action.md`): `call_booked_at` is the MIRROR of a Meeting Next Action with a
  time, written only inside `lead_set_follow_up` (`lead_set_call_booked` is a wrapper); the CHECK
  `outreach_leads_booking_is_the_meeting` refuses anything else. Never draw a derived "what's next" line
  beside the Next Action (the deleted `nextUpHint`); the Outreach cell is "+ Set" OR the action and its ✓.
  `scripts/next-action-human-only.test.ts` sweeps every writer; `supabase/tests/next-action-human-only.sql`.
  ⛔ **One Next Action display** (UI cleanup 2026-09-29, `docs/ui-cleanup-pass.md`): every screen draws it
  through `src/lib/nextActionView.ts` + `NextActionPill` (red overdue / amber today / grey later) and
  offers the popup's four choices (`NEXT_ACTION_OPTIONS`, salesCrm). No device-local custom labels.
  ⛔ **No hover template preview, anywhere** — one line under the picker, full wording only on Preview.
  ⛔ **The sales state is DERIVED, never stored** (`salesStateOf`, `src/lib/leadState.ts`, 2026-09-30,
  `docs/lead-state-model.md`): New / Contacted / Replied / Interested / Meeting booked / Won / Client / Not
  interested / Wrong number, read from the pipeline `status` + star + `call_booked_at` + paid + newest
  logged contact + Wrong number. `outreach_leads.status` stays the WhatsApp pipeline — never rewrite it
  into sales words. Every screen draws it with `SalesStatePill`; "Follow-up" is a Next Action, not a state.
  ⛔ **A logged outcome's follow-on is `outcomePlan` / `suggestNextAction`** (leadState), carried out ONLY
  by `src/lib/leadOutcome.ts` for both roles; `lead_log_contact` itself still writes activity only; a
  state change is recorded by `lead_log_state_change`. Every outcome in `CALL_OUTCOMES` needs a rule.
  ⛔ **No automatic write may overwrite a deal:** the inbound `replied` and both `report_sent` writers use
  `STRONG_STATUSES` (`src/lib/strongStatuses.ts`) — never a hand-typed status list.
  ⛔ **No selected opener** — both approved openers are ordinary choices; the batch's chosen template is
  what is stored and sent (`docs/whatsapp-templates.md`, last section).
  ⛔ **Abuse / API-cost protection (2026-09-29, `docs/abuse-cost-protection.md`)**: every paid or data-heavy
  action a PERSON starts asks ONE server guard (`public.guard_action` via `_shared/protection.ts`
  `guardAction`) — suspension, the global mode, burst windows, person + team spend. A new edge function
  that spends for a signed-in caller must call `guardAction` (or `allStopRefusal`) —
  `scripts/abuse-cost-protection.test.ts` sweeps for it. Thresholds live ONLY in the
  `protection_settings` row (seeded from `DEFAULT_PROTECTION_LIMITS`); never a number in code or prose.
  The ledger is `api_usage_log`; an `api_type = 'guard'` row is an estimate/record, NEVER a provider
  charge — every spend total must exclude it (`.or('api_type.is.null,api_type.neq.guard')`). Two pause
  levels, one control: "prospecting paused" keeps client measurement running; "all_stop" stops everything
  paid. Suspension = `team_members.suspended_at` (role kept, reads work). ⛔ Sales never sees a cost:
  refusals say `USAGE_PAUSED_DETAIL`. ⛔ Sales has no CSV export (Paul); Copy Numbers goes through
  `log_data_access` first. `lead_identity_lookup` is MASKED for Sales — internal code that needs the
  real lead id reads `_lead_identity_rows`.
  ⛔ **Sales readiness (2026-09-28, `docs/sales-readiness.md`)**: the Sales Dashboard's numbers come from
  fn `sales-performance` (a salesperson is ALWAYS themselves; counts only, never an amount), folded ONCE in
  `src/lib/salesPerformance.ts`; reply credit is `creditRepliesToSends` (the campaign card's walk).
  **Every lead write calls `notifyLeadChanged` and every lead reader listens** (`src/lib/leadSync.ts`) —
  Sales never receives outreach_leads realtime, so this notice IS the Inbox↔Outreach sync. A sign-up link
  SENT is `onboarding_link_events` (a whatsapp_messages trigger + "sent another way"); OPENED is a
  prefill page load after the first send — the app's own opens carry `preview=1` and never count
  (`src/lib/onboardingLinkStatus.ts`, one rule). GBP access has THREE states, never merged: asked,
  client says (`gbp_status`), confirmed by Findable (checklist `gbp_access`). The paid screen says
  paid only when `payment_status` does.
  ⛔ **Self-sourced prospects + handoff (2026-09-28, `docs/self-sourced-handoff.md`)**: Sales records
  services / areas on the LEAD (`services_included`, `service_areas` via `lead_set_profile`) — never a
  copy of onboarding; every reader ranks onboarding above it. A website match on Add a lead is a
  WARNING (`site_match`, chains share domains), never a refusal. A hand-added lead with no place id is
  not town-gated (`handTypedTown`). Sales crawls only a lead they work, its own site. In-app report
  opens carry `preview=1` and are never counted. **The seller is `sold_by_user_id`, stamped once at
  payment by trigger — never read the current owner as "who sold it".** WAITING FOR INFORMATION / READY TO
  SUBMIT is `handoffReadiness`; READY FOR DELIVERY = that + Submit for delivery (`deliveryStage`, Paul 2026-10-02) (one rule: Paid Clients, the client page, the new-client email, Submit —
  all through `_shared/client-setup.ts`). ⛔ **Paid client setup (2026-10-02, `docs/paid-client-automation.md`)**:
  the stage + ONE next step is `deliveryStage` (derived; never draw a second "what's next"); not-needed items
  never block (no GBP = `gbp_exists='no'` only; no site; Paul's own sale / pre-`SALES_HANDOFF_SINCE` clients owe
  no handoff — never fabricated); the crawl is reused while fresh, payment never crawls and drafts NO questions
  (crawl → Discovery manual → approve & freeze → Run baseline manual); ONE new-client email per lead (claim on
  `new_client_email_at`); the sales handoff is `outreach_leads.sales_handoff`, written only by quick-close
  `save_handoff` (seller-only after payment); `delivery_submitted_at` is the one stored setup act; History kinds
  live in the migration CHECK, `LeadEventKind` and `ACTIVITY_LABEL` (`paid-client-automation.test.ts` pins all three).
  ⛔ **Missing information** (2026-10-05, `docs/pre-sales-certification/client-missing-info-actions.md`): ONE box, rules in
  `src/lib/clientMissingInfo.ts` — Ask salesperson only for another ACTIVE seller's sale (`sold_by_user_id`), ONE open
  `client_info_requests` row per client (unique index), answered only by that seller's save; Find what we already have shows
  each source separately and applies a candidate BY ID; Contact client opens the Inbox with an INTERNAL need note. Nothing sends.
- **Other Claude sessions may share this checkout.** Every substantial task starts from the latest
  `origin/main` (`git fetch origin` first) on its own named branch in its own `git worktree`
  (`C:/Users/paulj/LeadFinderOS-wt/<task>`, added from `LeadFinderOS-current` as above; junction `node_modules`
  in from `LeadFinderOS-current` — `../findable-site-current` is already a junction in `LeadFinderOS-wt/`); never switch branches in the primary
  checkout, and never touch another session's branch or worktree. **When Paul runs sessions in parallel, a
  parallel branch is pushed but NOT merged or deployed** until an integration session (or Paul) does it
  (Paul's session rules, 2026-09-25 — ported from the unmerged `claude-md-session-safety` branch 2026-10-02).
- **Windows host.** PowerShell is primary, Git Bash is available. Working tree is CRLF, repo is LF
  (`core.autocrlf=true`) — match on LF-normalised text when scripting an edit.
- **SQL:** you can run it yourself (§2). Storage, RLS and crons are NOT locally testable — read back.

---

## 1. The business — current facts only

Full history and reasoning: `docs/business-and-offer.md`, `docs/measurement.md`.

- ⛔ **The signed Client Service Agreement v3 is authoritative over LeadFinderOS** (record:
  `docs/pre-sales-certification/client-agreement-commercial-alignment.md`). Signed on the agreement page BEFORE any
  payment (`findable-checkout` refuses a Stripe session without it — `src/lib/signupGate.ts`); the rep sends ONE sign-up
  link, never a Stripe URL. Dates (Access → Results → Refund Window → Approval = Payment Start, the 30-day fallback, the
  Continuing Service at `FINDABLE_CONTINUING_GBP`) live ONLY in `src/lib/clientTimeline.ts`, derived, citing clauses. Guarantee = ANY increase
  in the named count. v3 rules (incl. commission: 5 trailing, initial pending until Approval) apply ONLY to a client with
  a `client_service_terms` row — never re-rule Ronnie, MCL, RG or QA clients. Continuing Service is MANUAL
  (`CONTINUING_SERVICE_AUTOMATION` all false): nothing may charge it automatically until Paul switches it on.
  ⛔ An alert after an unsigned payment is NOT a gate: the webhook HOLDS any Findable payment without a valid v3 signature
  (`client_payment_holds` — no lifecycle, no subscription, no ledger/commission). Pre-switch Stripe objects are closed by
  fn `legacy-checkout-cutover` (report → execute with the reviewed plan hash). The signing copy and findable.live's
  public `/agreement` must stay word-for-word equal: `npx tsx scripts/check-agreement-parity.ts --site-ref <ref>`.

- **Offer (Paul, 2026-09-29): £99 to start, then £99/month from six weeks after sign-up — TWO ROUTES,
  same price, different LENGTH** (`docs/business-and-offer.md` §00). **Findable Build** (we build, host
  and manage a new website): **12 payments in total**. **Findable Optimise** (they keep their own site):
  **6 payments in total**. ⛔ The sign-up £99 is payment 1 on both (`FINDABLE_BUILD_TOTAL_PAYMENTS`,
  `FINDABLE_OPTIMISE_TOTAL_PAYMENTS`; recurring = `recurringPaymentsFor(route)` = 11 / 5) — never "£99 plus
  12 / 6 more"; nothing after the last. ⛔ **The route is `onboarding_responses.plan_tier`** (`new_site` =
  Build, `keep` = Optimise), written by the questionnaire and by Quick Close, read ONLY through
  `serviceRouteFromRow`; undecided (blank / unknown / contradicting `website_addon`) → findable-checkout
  refuses `route_undecided` — **never a default 12 or 6**. The checkout names the route's count on the
  Stripe page and carries it in session metadata; the webhook creates the subscription from the SESSION's
  route (`resolvePaidRoute`) with `cancel_at` after `recurringPaymentsFor(route)` charges, and refuses
  (Paul told) on a mismatch. `outreach_leads.contract_total_payments` is the stamped contract (NULL = not
  recorded — a pre-route client is NEVER given a 12 or 6); triggers lock it and a paid row's route against
  every API role. ⛔ Each is a real minimum — never "no commitment" / "cancel any time" beside it. The
  build ownership / suspension / transfer terms apply ONLY to Build; an Optimise client's site stays
  theirs and is never taken over or down. Where the route is known, name ONLY its count; pre-choice
  surfaces name both. Do not invent penalties or exit rights. The guarantee applies on top, identical on
  both. ⛔ The £9.99 hosting add-on is RETIRED; only a LEGACY row still carries `website_addon` alone.
- **Coverage Found vs Added** (2026-09-29, `docs/state-coverage-market.md` last section): per trade+town, FOUND = distinct
  businesses the recorded search runs RETURNED (`search_history.found_keys`, written when the run happens,
  BEFORE the page's exclusions), ADDED = those then successfully inserted (`added_keys`, written by
  `record_search_addition` after the insert), each split by the search's own website verdict
  (`isWithoutWebsite`, the one definition). ⛔ Never inferred from the CRM; a run from before 29 Sep is "not
  recorded" (its counts were post-exclusion), never estimated.
- **Quick Close** (`src/lib/quickClose.ts`, fn `quick-close`, `docs/sales-experience.md` §9): a salesperson's
  5-question close + the required website route (Build / Optimise) on the SAME onboarding row (locked find-or-create) → the EXISTING `findable-checkout`
  (row + lead only; never a price). Domain / agency doubt = Paul review, never silently safe.
- **Sales commission** (`src/lib/commission.ts`, `docs/sales-page-monthly-commission.md`, `docs/sales-experience.md` §4, §11): the INITIAL payment
  earns by the **monthly tier** (Paul, 2026-10-01; replaced the weekly tier) — per salesperson, per London
  calendar month, sales 1–12 30%, 13–24 40%, 25+ 50%, NOT retrospective, reset on the 1st, ordered by payment
  time then payment id; a fully refunded / lost sale stops counting towards LATER sales' places; a test
  account's or test lead's sale (`metric_exclusions`) is stamped `test_excluded` at 0% — plus
  20% × the next **6** succeeded recurring (`COMMISSION_RECURRING_COUNT`, 2026-10-02; never the initial),
  of the REAL amount, earned on receipt, reversed by refund / chargeback (an
  offset once paid out), from the **payment ledger** (`payment_ledger`, written by `stripe-webhook` + the
  admin backfill) — never from a CRM status. A salesperson earns — current (role `sales`) OR **ended**
  (Team → Disable: `team_members.status 'disabled'`, `disabled_at` = the end). ⛔ Never key "who earns" on the
  sales role alone (Disable deletes it — that would zero earned commission). Each payment is judged at ITS
  OWN time against `team_engagement_events` (append-only, server-timed ended / resumed): a recurring payment
  while not engaged is 0% forever — a re-enable never reaches back; a first payment while not engaged earns
  only if the seller generated its payment link (`quick_close_events` link_generated / link_reused) while
  engaged. What they earned stays (`docs/sales-page-monthly-commission.md` §5–6). ⛔ **The place and rate are STAMPED by
  the database ONCE** (`stamp_monthly_commission_for`, a trigger on the ledger, per-seller-month lock) into
  `commission_month_seq` / `commission_rate`, and the code READS them — never recompute a rate in code; a
  stamped row is never renumbered or re-rated. Rows stamped under an older rule (`flat_30_v0`,
  `weekly_tier_v1`) keep what they earned. There is no bonus. `MONTHLY_TIERS` (TS) and
  `monthly_tier_rate()` (SQL) are one table in two places — `scripts/monthly-commission-tiers.test.ts` pins them.
- **Sales page** (`/sales-dashboard`, 2026-10-01): the Sales dashboard and Earnings are ONE page (`/earnings`
  redirects); the month's ladder is the top card. **Focus Mode is retired** (`/focus` → Outreach): its
  Previous / Next is in the lead popup, its lists are Sales → What to do next, its recent WhatsApp messages are
  in the popup. Salesperson menu (2026-10-02): **Sales dashboard first** (and their landing page, `homeFor`),
  then Outreach, WhatsApp, Find Leads; Coverage under More (`SALES_NAV_ORDER`, `SALES_SECONDARY_NAV`).
- **Both dashboards draw from ONE design system** — `src/components/salesDash/ui.tsx` (PageHeader, SectionHeading,
  Segmented, Panel, KpiCard, Figure, TONE solid/tint, SURFACE). Never style a dashboard surface locally; never bring
  back "week by week" (`docs/dashboards-redesign.md`, `scripts/dashboard-design.test.ts`).
- **The Admin dashboard is Paul's sales control centre** (2026-10-02): one metric, one home. New sales & handoffs reads
  paid-client-hub `list` (never a second status); What needs you = server attention minus the two kinds the canonical
  delivery flow replaces + ONE pointer line for handoff clients (`src/lib/adminControl.ts`). Hide my activity filters the
  team table only. The old Sales team board panel is deleted — do not bring it back.
- **Agency check** (`docs/agency-detection.md`): Find Leads checks each result's own website (fn
  `agency-check`, a sitemap-guided sample, ≤`AGENCY_MAX_REQUESTS` requests, no AI) → `website_agency_checks` per
  domain, 30 days. Crawler name `LeadFinderOS-SiteCheck/1.0 (+https://findable.live)` — ⛔ no "Mozilla
  (compatible…)" wrapper (UK hosts 403 it) and never a browser identity; ⛔ a bot challenge is never worked around.
  Credits are read from EVERY `<footer>` + the script-free page tail (`creditRegions`), not `footerHtml()`.
  ⛔ The machine never sets `website_control`; the lead shows "Detected: …" with Confirm agency / Not agency.
  ⛔ Platform (WordPress, Wix…) is context only; one weak sign is never "Agency likely".
- **Business age** (`docs/companies-house-age.md`): Find Leads looks up UK results with NO website on
  Companies House (fn `companies-house-check`, secret `COMPANIES_HOUSE_API_KEY`, ≤3 requests, no AI) →
  `companies_house_checks` per place id. Rules live only in `src/lib/companiesHouse.ts`. ⛔ "Not found", never
  "not registered"; ⛔ a non-trading company is never a match; ⛔ the machine match never writes a lead.
  ⛔ It needs the result's ADDRESS: `search-leads` asks Google for `places.formattedAddress` (free at the tier
  `websiteUri` already bills) — without it no search result is ever a target (it never ran until 2026-10-02).
  The run lifecycle lives in `src/lib/companiesHouseRunner.ts` (React-free, tested Search A → Search B).
- **Constants own the words:** `src/lib/findableOffer.ts` — `FINDABLE_SETUP_PRICE_GBP`,
  `FINDABLE_MONTHLY_GBP`, `FINDABLE_BUILD_TOTAL_PAYMENTS` / `FINDABLE_OPTIMISE_TOTAL_PAYMENTS`, `FINDABLE_OFFER_SUMMARY`,
  `FINDABLE_GUARANTEE` (236 chars), `REMEASURE_CLAIM_SENTENCE`, `CARD_SAVED_NOTICE`. findable-site
  carries its own copies; `scripts/check-cross-repo-sync.mjs` (exists in BOTH repos) fails the build
  on drift for the pairs it lists. Change one repo, change the other. `scripts/findable-offer-terms.test.ts`
  pins the offer. ⛔ **A Meta-registered body quoting a retired offer goes in `STALE_OFFER_TEMPLATES`**
  (blocked on every path) until it is re-registered — explain_offer / explain_offer_v2 today.
- ⛔ **No surface may name one figure without the other.** ⛔ **Never claim an SEO score.** ⛔ **Review
  replies are NOT a Findable deliverable** (Paul, 2026-09-28) — never promise them on any client-facing
  surface; the explain_offer Meta bodies still say it and stay blocked (`docs/sales-readiness.md` §5).
- **Guarantee is outcome-conditional:** measure before, re-measure at four weeks on the same
  questions and engines, **judged on all 20 frozen questions — the home town AND the approved service
  areas** (Paul, 2026-09-23; was home-town-only from 2026-09-12; older frozen sets stay as they
  were). **Scored engines: ChatGPT + Gemini only** (`SCORED_ENGINES`); Google AI Overview is no longer
  collected at all (removed from the scraper input, `_shared/enrichment/ai-search.ts`) — never claim it is measured. "The number" = named answers ÷ answered answers pooled over every frozen question,
  replay vs baseline (`compareMeasurements` → `numberWentUp`). Same rule on Build and Optimise; only
  the clock is four weeks for every new client (`remeasureWeeksFor` always returns 4 since 2026-10-02). If the number has not
  gone up, they email within 14 days of their results and get the £99 back, **plus the first monthly
  payment if it has already been taken** (`GUARANTEE_PAYMENT_TWO_SENTENCE`); a valid claim ends the
  monthly. Verified against the code 2026-10-01. `findable.live/refunds` is the
  customer-facing authority. ⛔ **No hedge beside it** ("the engines decide", "anyone who promises is
  guessing") — a promise with a disclaimer stapled on reads as walking it back.
- **"Gone up" (v3 guarantee, Paul 2026-10-05) = ANY increase in the named count** —
  `guaranteeNumberWentUp` (`clientTimeline.ts`) / `numberWentUp`: 39 → 40 is up; 39 → 39 and 39 → 38 are not.
  ⛔ `NOISE_BAND_PP` / "within noise" never decides the guarantee — it survives only as an operator display label
  (`ReportBeforeAfter`, compare screens, export), so an operator screen can say "within noise" for a +1 that the
  guarantee counts as gone up. (The pre-v3 "beyond the band" reading is retired.)
- ⛔ **RG Locksmiths is pinned at 8 weeks** (legacy outcome guarantee, `remeasure_due_date`
  2026-10-06, stored by hand). The 28-day default (`REMEASURE_OFFSET_DAYS`) only fills a NULL date.
- ⛔ **THE DOMAIN RULE (Paul, 2026-09-28, `docs/domain-authority.md`): we only build / connect the standard
  new site where the client confirms they own or control the domain and may authorise the change** —
  agency-MANAGED is fine, agency-OWNED is not. One rule, byte-identical in both repos
  (`src/lib/domainAuthority.ts`, sync-checked); `findable-checkout` refuses `domain_unresolved`; Paid Clients
  is never READY without it. Reuse of the old site (faithful rebuild, or a move) only with confirmed rights;
  only client-owned assets download. Ending a service for a dispute is `terminate_service` (records +
  emails Paul to cancel in Stripe; the app never moves money).
- **Delivery works exactly two ways:** their site is WordPress and we get access, or they let us move
  it to our hosting (only where they own it — the domain rule). `src/lib/serveGate.ts` decides serve/flag/block — **derived, never stored**;
  blocks only on an explicit `migrate='no'` AND a known hand-edit platform; `no_website` serves
  outright. `findable-checkout` refuses a blocked row before Stripe. findable-site keeps a hand-kept
  mirror — change both.
- **The measurement model (`docs/measurement.md` §19):**
  | | Shape | `audit_purpose` | Compared? |
  |---|---|---|---|
  | Hook / free check | 3 q × 1 run, both engines = 6 results, no early stop (free check 3 × 3) | `audit` / `free_check` | never |
  | Discovery (paid clients, optional) | wide pool, one generator call per approved town, × 3 if run | `discovery` | never — it informs the choice |
  | Baseline | 20 q, home town + approved areas, balanced, × 3 runs, frozen | `baseline` | the before side |
  | Full measure | 20 q × 3 across home + areas, DISJOINT | `measurement` | never |
  | Day-28 replay | the baseline's ASKED set verbatim × 3 | `remeasure` | the after side |
  Order is structural: the full measure starts only from `onBaselineFrozen`; a paying lead with no
  frozen baseline is refused (`409 baseline_not_frozen`). `outreach_leads.baseline_audit_id` /
  `remeasure_audit_id` are claimed by DB TRIGGERS, immutable once set; one replay per lead, ever.
- **The four-week results sender** (`_shared/remeasure-results.ts`) is claim-first on
  `remeasure_results_sent_at` and **holds behind `REMEASURE_RESULTS_COPY_APPROVED = false`** until Paul
  approves the copy. (RG's stored 2026-10-06 date cannot fire: his row is `refunded`, which `fireDueRemeasures` skips.)
  ⛔ **Paul's wording (2026-10-05):** signed `RESULTS_SIGN_OFF` ("Paul, Findable"); the monthly is described as
  the real service (`monthlyCoversPhrase` — never "every week", no "maintenance"); the not-gone-up version names
  NO upcoming monthly payment after saying a claim stops it. Exact copy: `final-certification.md` §8.
  ⛔ **findable-checkout refuses with `quickCloseClosedRefusal`** — one closed-client rule with Quick Close
  (money, paid-or-beyond, refunded, ended).
  ⛔ **Billing and the claim window are TWO clocks**: billing = `firstRecurringPaymentIso(sign-up)`
  (the Stripe trial), the window = results + 14 days. The email names the subscription's own date
  (`resultsBillingStartIso`) or none — never "that same day". The end of the route's payments (12 / 6) is
  `subscriptionEndedByTerm` → `termCompleteEmail`; ownership words only for `findableSiteKind ===
  'findable_built'`. ⛔ **Re-measure clock: 4 weeks for every new client** (`remeasureWeeksFor`
  always returns 4 since 2026-10-02; the old 8-week new-domain case is gone — some code comments still say 8) — never "excluded". ⛔ **A valid claim refunds payment 2 too if already taken**
  (`GUARANTEE_PAYMENT_TWO_SENTENCE`, locked to findable-site). Record + MCLocksmiths' missing
  subscription: `docs/business-and-offer.md`, "Customer lifecycle cleanup".
- ⛔ **Campaigns are OWNED, PRIVATE and GLOBALLY UNIQUE** (2026-10-03, `docs/campaigns.md`, migration `20261006120000`). Owner =
  `created_by`, set by the server from auth.uid(). RLS: the admin reads every campaign, anyone else only their own; direct
  writes are admin-only; a salesperson acts only through the `campaign_*` functions (`campaign_usable` first — another owner's
  campaign answers `not_found`, never a name). Names: a UNIQUE index on `campaign_name_key` (trim, collapse whitespace,
  lower) → `name_taken`, never whose. A rep's lead goes only into their own campaign (`lead_set_campaign`, `leads_set_campaign`,
  `sales_add_lead`). Launch = `sales_queue_opener` with the approved opener only; Stop = still-queued leads back. The owner in
  brackets is DISPLAY ONLY (`campaignDisplayName`). ⛔ Campaigns is NOT a menu item (Paul): reached top right of Find
  Leads / Outreach (`CampaignsButton`, the dropdown's New / Manage). A salesperson's queue = `MyWhatsAppQueuePanel`
  (server-scoped `sales_leads`, remove via `lead_unqueue`). Never return another owner's campaign name to a rep (sales-performance
  groups them as "Leads assigned to you"; quick-close filters).
- **A paid client's service ends ONCE: `service_terminated_at` + `service_termination_reason`** (paid-client-hub
  `terminate_service`; words in `src/lib/serviceEnd.ts`, 2026-10-03). `client_ended_early` = the client stopped before the
  term ran out (shown COMPLETED, nothing further to do; MCLocksmiths, 2026-10-03); `domain_authority_dispute` = Findable
  ended it (ENDED). Every future-work reader already skips an ended client (remeasure, results, weekly check, perf sync,
  admin counts). ⛔ Ending never marks a delivery stage done and never touches money, the ledger or commission; a live
  subscription is cancelled by Paul in Stripe. Distinct from `refunded` and from a term that ran out (`subscriptionEndedByTerm`).
- **The monthly client update** (paid client page step 8, `docs/monthly-client-update.md`, 2026-10-02) is prepared and
  sent BY HAND, as /terms says. ⛔ Only the measurement paragraph is generated, from stored `weekly_check_runs`
  counts, comparing only like-for-like checks; work done is the operator's words (stored facts are Add
  suggestions). ⛔ `client_monthly_updates` is admin-only through its three functions; a sent row is never edited.
- **Named = the answer text first** for a judgeable name, then the model's verdict (`self_named`), then the
  string flag — one ruler on both sides of a comparison (`src/lib/namedSignal.ts`); since 2026-10-04 the frozen
  snapshot, `mention_rate`, the page generator and the action plan pass the context too. A name that is only trade +
  town is **not judgeable** (`nameIsJudgeable`, `_shared/derivable.ts`) — the report replaces its hero
  with Paul's wording, never a caveat under a false headline.

---

## 2. How Paul works

- **Non-technical.** He does ideation, scoping, plan review, product judgement. You write and run
  all code. **He never runs terminal commands.**
- **Plain English, no jargon. Lead with the answer. Questions at the very end.**
- **Plan first, then stop** for a new piece of work. Once approved, build the whole thing.
- ✅ **Deploy live by default (Paul, 2026-10-05):** implementation work ends with tests → commit → push
  `main` → deploy (SQL first, edge by hand) → verify on `https://app.leadfinderos.com` — unless he says not
  to, the session is planning-only, or deploying is unsafe.
- **Hard stop and ask** before anything irreversible or outward-facing he has not already authorised:
  destructive SQL, deletions, money / Stripe, Meta / WhatsApp credentials, access changes, real messages to
  real people, historical client rows. If the brief authorises it, proceed.
- **When Paul asks for a change, give him a fresh ready-to-paste prompt and say exactly where to run it**
  (no prompt when none is needed). Whole coherent passes, not micro-prompts; parallel sessions only when
  branches are genuinely independent (`docs/handover/11-PAUL-WORKING-PREFERENCES.md`).
- **Any plan approved earlier must have its numbers re-derived from the live database by the
  session that builds it.** An approval names intent; the builder re-establishes every fact.
- ✅ **You can run SQL yourself, and he asked you to.** Route: `POST
  https://api.supabase.com/v1/projects/ruusxpkkmwtljxxulhbq/database/query` with `{"query": "..."}`
  and `Authorization: Bearer <token>`. **The token is in Windows Credential Manager** (`cmdkey /list`
  → target `Supabase CLI:supabase`; read it with a PowerShell `CredRead` P/Invoke into the session
  scratchpad). It is NOT at `~/.supabase/access-token`. Never echo it, never commit it.
  - Additive/idempotent DDL and read-only SELECTs: run them. **Anything destructive (drop, truncate,
    delete, rewrite rows): show him first.** If he says "SQL to me", hand him one copy-pasteable block.
  - **Verify by reading the schema back**, not by trusting the 201. Say what you verified.
  - Service-role DATA writes go through PostgREST with the **legacy `service_role` JWT**
    (`npx supabase projects api-keys --output json`) — `auth.role() = 'service_role'` is what some
    triggers (e.g. the `generated_sites` lock) accept; the Auth admin API and the postgres role are not.
- **Screenshots need him.** The in-app Browser pane does not display here; `read_page` /
  `get_page_text` / `javascript_tool` work. Use text proof and say nobody has *seen* it.
- **An authed page cannot load the normal way** (no session at localhost:8080; RLS blocks anon). If
  you must render one: a throwaway Vite harness patching `fetch` with the service key for Supabase
  URLs only, real hook + component in a `MemoryRouter`, read-only, deleted before commit, and tell him.
- **Live tests use `ZZ QA` fixture leads** — no contact details, a `metric_exclusions` row each, ARCHIVED at the end, then the check query in `docs/qa-fixtures.md`. Never leave one active in Outreach.
- **Report faithfully.** Tests failing → say so with output. Step skipped → say that. Done and
  verified → state it plainly.

---

## 3. The discipline checklist

**Recon**
- [ ] Read the actual files before editing. Grep to verify any list you were handed.
- [ ] Re-derive numbers from the live DB before building an approved plan (§2).
- [ ] Before asserting what a function receives, read its **callers**; before asserting a column is
      empty, read its **writer**. One layer is never enough.

**Git**
- [ ] `git fetch origin`; prove `origin/main == HEAD` **before** branching. Print both with variables,
      never a hand-typed hash. Branch per task off `main`; branches are kept.
- [ ] Work in a **worktree** when another session may be open (§0).
- [ ] ⛔ **Never edit a source file with a PowerShell `Get-Content`/`Set-Content` round-trip or
      `-replace`** — it mojibakes every non-ASCII character and can silently not apply. Twice recorded.
      Use the Edit tool, or a Node script that reads/writes UTF-8 explicitly.
- [ ] Commit with `-F <file>`. **End with `Co-Authored-By: Claude <the model this session is actually
      running, as the harness names it> <noreply@anthropic.com>`** — e.g. today `Claude Fable 5.1`.
      Never copy the trailer from an older commit.
- [ ] Commit only this task's files.
- [ ] **Before merging:** `git fetch origin`; if `origin/main` moved, bring it into the branch,
      resolve conflicts deliberately, rerun the relevant tests. Merge only a current, verified branch.
- [ ] Merge `--no-ff`. Prove `origin` is unmoved immediately before pushing — and if the push is
      refused because another session landed first, fetch, rebase, retest and merge again (2026-10-02).
- [ ] **Never stage** `HANDOFF.md`, `ONBOARDING.md`, `HANDOVER_NEXT.md`, `RECON_*.md`,
      `INVENTORY_DEEP_CLEAN.md`, `SQL_FOR_PAUL_*.sql`, `scripts/_*.ts`. Stage files explicitly; never
      `git add -A`.

**Checks — run `npm run check` before claiming anything works, and know what it cannot see**
- [ ] Typecheck baseline is **9 errors as a LIST** (`scripts/typecheck-baseline.txt`). Do not fix them.
- [ ] tsc at baseline ≠ compiles — `npm run build` catches a stray backtick inside a template
      literal that tsc recovers from. ⛔ **Never put a backtick inside a template literal, not even in
      a comment or an HTML comment inside one.** Bitten three times.
- [ ] `npm run typecheck` does **not** cover `supabase/functions`. `check-edge-syntax.mjs` parses,
      `check-edge-undefined.mjs` catches an undefined NAME (TS2304 only), and
      **`check-import-graph.mjs` fails on a deleted or extensionless MODULE import in any gated file
      and on `@/` inside an edge closure.** `node scripts/check-import-graph.mjs --reached-by <file>`
      prints the redeploy list for a shared module; `--orphans` lists files nothing imports. Types
      are still the deploy's job.
- [ ] Every `src/lib` file reachable from an edge function uses **relative imports with an explicit
      `.ts`** — never `@/`, never extensionless. Grep the closure before deploying.
- [ ] Tests for code you delete are deleted in the same commit. New client-facing renderer → add it to
      `client-copy-claims.test.ts`; new operator screen → its `OPERATOR_SCREENS`.

**Deploy**
- [ ] **Production deploys originate from `main` only** — never from a feature branch, never bundling
      another unfinished branch. If another session moved `main` or changed shared infrastructure,
      stop and reconcile before deploying. **Backend before frontend** when both changed.
- [ ] **After every production deploy, verify the live operator app** at `https://app.leadfinderos.com`
      (and the fallback `https://leadfinderos-next.pages.dev`) by the marker check (§4).
- [ ] **SQL first, confirmed by read-back, then deploy** anything that reads/writes the new schema.
- [ ] Edge functions do not auto-deploy. After changing a shared module (`_shared/`, `src/lib/`),
      **walk the transitive import closure and redeploy every function that reaches it — then NAME
      THEM in the report.** Follow real `from "…"` statements, not `grep -l` (matches comments).
- [ ] 🔴 **Immediately before deploying a function, `git fetch` and check whether `origin/main` has a
      newer commit touching its closure** — another session may have just deployed it, and your
      deploy silently replaces theirs (sales-performance, 2026-09-28; caught only by the marker check).
      Deploy from a tree that contains both.
- [ ] Verify a deploy by a marker **only the new code produces** (§4). For `send-whatsapp-message`
      the OPTIONS preflight returns `x-swm-build`/`x-swm-caps` — bump `BUILD_ID` in the same commit.
- [ ] A **new edge function gets its `config.toml` `verify_jwt` entry in the same commit.** Absent =
      platform default TRUE = internal callers die silently the day a key rotates.
- [ ] **Deploy order is a price guard:** when a price RISES deploy display before charge; when it
      FALLS, charge before display. Ask which way the gap embarrasses you.
- [ ] ⛔ **Every deploy that changes what someone sees or what the app does adds a What's New entry**
      (`src/lib/whatsNew.ts`, newest first, right `audience`) WITH its `report`: added / changed / removed
      and one plain "what it means for you" line. No fluff. Paul, 2026-10-01; the test refuses an entry
      without a report. The card opens to it (What's new, sidebar footer / phone More menu).
- [ ] 🔴 **findable-site has NO CI.** `npm run deploy` (astro build + wrangler) is the only way it
      ships, and it ships the working tree. If `findable-site.pages.dev` is also stale, nothing was
      deployed — stop waiting for Cloudflare.

---

## 4. Traps — the rules. The incidents behind each are in `docs/traps.md` (§4) unless pointed elsewhere.

**Verifying**
- **The deploy check:** fetch the live HTML → read the chunk name → fetch that chunk → assert a marker
  from YOUR change → retry once (~90 s lag; Cloudflare can also sit 15+ minutes — prove where live IS
  by checking the previous deploy's marker before calling it a bug). Local vs live hash comparison is
  invalid. No cache-buster (it can return a STALER file). A shared component has its OWN chunk; a lazy
  route lives in its own chunk — check the chunk your code is in.
- **A 200 with all the right strings can be the wrong document** (`/a/*` fell back to the home page).
  Assert on something ONLY the target has (`class="src"`), check the byte count.
- **A negative can be your own check's fault**: CSS `text-transform`, `·` vs `&middot;`, whitespace
  wrapped mid-sentence, a label emitted in single quotes by Vite. **Grep the source for your own needle
  and normalise whitespace before believing "absent".**
- **Grep hit counts lie**: `bing` matches plum*bing*, `acca` matches M*acca*-Gas, `claim` matches
  `claimTemplatePayload`, `grep -l <module>` matches COMMENTS. Word boundaries; print the surrounding
  characters; match the import statement.
- **Not seeing something is not evidence it isn't there**: the anon key gets `200 []` from RLS;
  grep output here can path-mangle lines. `Read` the file.
- **"Identical everywhere" is a tell, not a result** — twice it meant the fix never reached the data.
  **When a model "gets it wrong", check what it was SHOWN before rewriting what it was TOLD.**
- **A stale comment is a load-bearing bug.** Verify the claim, don't inherit it (three recorded: the
  address mask, `templateNeedsAudit`, the `.first allowlist entry is canonical` belief).
- **The timestamp method** (deploy time vs newest commit in the closure) has false positives AND
  false negatives. It is a hint, never proof.
- **`TaskStop` can report success while the process runs on** — verify a kill by process count.

**Constants and money**
- ⛔ **A rate copied from a price list is a guess until a billed row agrees.** A cost constant names
  the PRODUCT and the TIER and cites a billed row; never validate it against data it wrote (the SEO
  $0.12 echo). Google bills once at the highest tier any requested field touches. Verified: Text
  Search Enterprise $0.035, Place Details Enterprise $0.020 (Essentials-only $0.005), per-question
  audit $0.0104, SEO scan $0.02–0.08 band, geocoding $0.005, gpt-4o-mini $0.15/$0.60 per 1M.
- **A constant the sync check cannot parse is unguardable** — make anything that must match another
  a named `const`; never write the declaration pattern in a comment (the regex takes the first match).
- **A `const` read before its declaration throws at module load** (TDZ) — in `findableOffer.ts` that
  is the checkout. Ordering is structural.
- **Never write a cap or a price as a number in prose** — name the constant. Two comments went stale.
- **Costs are per question, not per run** (`AI_SEARCH_USD_PER_QUESTION`); `enrichment_usage`
  already includes correction rows, so sum everything or use `actor_cost_usd`.
- **Apify is a single point of failure with a monthly cap** — every question and every SEO scan
  stops together at 100%. `/ai-audit` shows it (`apify-usage-status`); recompute the percentage from
  used/cap, never trust a stored `usage_pct`. `capped`/`daily_cap` tokens are OURS; anything else is
  the vendor.

**QA and live testing (2026-10-04, `docs/pre-sales-certification/README.md`)**
- ⛔ **A QA lead is explicit, never a name:** a `metric_exclusions` lead row, a 07700 900xxx number, email
  paul@move37.fun. Every WhatsApp sender asks `qaSendHold` (`_shared/qa-guard.ts`): fixture → SIMULATED,
  real lead held/pressed by a test account → REFUSED. A new sender must ask it (`qa-safety.test.ts` sweeps).
- **Payment success in a test is `scripts/qa-simulate-payment.ts`**, never a real card, never Stripe test mode.
- A QA lead's client email (agreement link, signed copy) goes only to paul@move37.fun — `qaEmailHold` refuses anything else.
- Prove the drip at any hour with `qa_drill_lead_id` on `process-whatsapp-queue` (cron/admin, fixture-only, simulate-only).

**Shape rules that have each bitten more than once**
- 🔴 **An absent value falling through as a real one — 16 recorded instances.** Never branch on the
  known states and let `else` carry the rest. Enumerate the absent case; assert on the grade you WANT
  (`=== 'established'`), never on the one you exclude. On a spending or sending path, absent means
  "do not". On a picker, absent must not mean "offer ungated".
- 🔴 **One rule written in N places — six recorded copies.** Extract the rule into a leaf and import
  it; the test to write is **"is there only one of it"** (`questionnaire-complete.test.ts`,
  `audit-kind.test.ts`, `template-picker-parity.test.ts` sweep are the pattern).
- 🔴 **A guard keyed to today's instance expires silently** (`templateName === "initial_contact"`).
  Test the PROPERTY that makes something dangerous, never the identifier.
- 🔴 **Ask not whether the guard is correct but whether the case it guards can reach it.** Two
  correct gates sat on paths their case never took (the cooldown, the search gate, the free-check
  email's four-day-old audit). Enumerate the arrivals; drive every combination including the null one.
- **A correctness decision must never read a client-side cache that races its own fetch** (the
  duplicate-openers incident). The database is the dedupe.
- 🔴 **N callers that READ "does it exist yet?" and then spend will all spend.** The guard is one
  conditional WRITE that only one caller can win (`approved → starting`, `startClaimFilter`); the
  losers wait on the claimed state. Read-then-create is never idempotent under a 30-second backstop
  (`docs/paid-baseline-flow.md`).
- **A parent reload that flips a page-level `loading` flag unmounts every dialog under it** — a
  mutation chain inside that dialog runs on detached and its errors reach nobody. Refresh in place;
  never toggle the first-load spinner for a re-read. Chains go in a pure controller behind a
  single-flight guard (`paidBaselineFlow.ts`).
- 🔴 **`supabase.functions.invoke` sends the ANON KEY when `getSession()` has no token** — an expired
  access token whose refresh failed retryably keeps the session, fires no SIGNED_OUT and answers
  `session: null`; the gateway accepts the anon JWT and the handler 401s while React still shows the
  operator signed in. Protected calls go through `invokeEdge` (`src/lib/edgeInvoke.ts`): session
  first, explicit bearer, one refresh-and-retry, genuine 401 → local sign-out. A failed load is an
  error state with retry, never an empty list (`docs/paid-baseline-flow.md`).
- 🔴 **A 401 is only for a token the auth service looked at and refused.** `getUser()` not answering
  (19.6 s on a valid token, measured) is **503 `auth_unavailable`**; the API not answering (a
  Cloudflare 522 page thrown by supabase-js) is **503 `upstream_timeout`** — `_shared/operator-auth.ts`
  (`resolveOperator`, `isUpstreamOutage`), used by every operator function. A bare token
  (`server_error`) is never rendered: `edgeErrorMessage` maps or quotes it inside a sentence.
- **Remembered state must belong to the data it was set on** — a per-person results filter applied to a
  later search showed "10 found" over an empty table, and a second leads-only copy of the Find Leads
  results restored them without their search ("Run a search first"). One store per fact, keyed to what
  it describes (`searchResultsCache.ts`, the view's `sig`) — `docs/sales-flow-reliability.md`.
- **A conditionally-shown question owns its answer's LIFETIME** — hiding a field is not clearing it,
  and clearing state is not the same as not SENDING it (derive the payload from the show condition).
- **Cutting question count saves money, not time** — questions run in parallel; the wall clock is one
  Apify scrape (~3–6 min). Never lower `MAX_RUN_AGE_MS` (12 min) — a retry storm is recorded.
- 🔴 **A secondary step must never hold a settled run.** Competitor cleaning is optional to the
  measurement; it is capped by `RETRY_CLEAN_CAP` on BOTH paths (`_shared/run-finalise.ts`) and an
  exhausted receipt (`complete:false`, `gave_up_at`) RELEASES the run. The 2026-09-20 storm: the
  finaliser held six runs `pending` for an OpenAI 429 and re-invoked the cleaner every tick — 3,000+
  attempts per run, "running 40/40" for a day, three hooks and two pitches blocked (`docs/traps.md`).

**Edge functions and the platform**
- **The service-role-bearer branch in every function is DEAD** since the ~2026-08-11 key rotation and
  no key you can send satisfies gateway and handler at once. Working callers: **CRON_SECRET via
  `x-cron-secret`**, or an operator's own admin JWT (`admin/generate_link` magiclink → the clicked-link
  GET → `access_token` in the `Location` fragment; a real sign-in — tell Paul, revoke after).
  ⛔ Do not spend a session re-probing this.
- **`sb_secret_…` keys are for `apikey` only; the legacy `service_role` JWT still works for
  `/rest/v1`** and is what scripts use. Say WHICH key.
- **The CLI has no `functions logs`, but the Management API does:** `GET /v1/projects/<ref>/analytics/
  endpoints/logs.all?sql=select timestamp, event_message from function_logs …` (same bearer as §2)
  — **retention is under a minute**, so read it WHILE the fault is happening. Otherwise a refusal that
  is only `console.error`'d is undiagnosable — write it to `client_error_reports` (`error_id` + `context` + `message`; the `message` column exists — verified
  live 2026-10-02).
- **The non-2xx triage table (`send-whatsapp-message`):** 200 + `ok:false` = a designed refusal with
  its reason · "non-2xx status code" = the handler answered 4xx/500 · **"Failed to send a request"
  = no CORS headers at all, the handler crashed outside its own catch.** Different layers.
- **A `catch` cannot see what its `try` declared** (`scripts/edge-catch-scope.test.ts` guards it).
- **supabase-js errors are plain objects** — `String(e)` is `[object Object]`; read `.message`.
- **`CREATE TABLE IF NOT EXISTS` against a table in a different shape is a silent no-op**; diff the
  live columns. **`.neq()` drops NULLs** — use `.or("col.is.null,col.neq.x")`.
- ⛔ **Never add a `generated … stored` column (or anything that rewrites) to a large live table** — it
  holds ACCESS EXCLUSIVE for the whole rewrite and queues every read (ai_audit_runs/queue ran past
  100 s, 2026-09-27). Plain column + trigger + batched backfill; DDL with `set local lock_timeout`.
  Never read a small key out of `results` in bulk — use `results_summary` / `results_crawl_check` /
  `results_seo_grade` (2026-09-27; a backfill must WALK the primary key, never search the JSON) /
  `gemini_answered` (`docs/inbox-outreach-speed.md`). A policy's `auth.uid()` goes in `(select …)`.
- **PostgREST truncates at 1,000 rows silently** — `src/lib/fetchAllRows.ts`, `.order('id')`; for a big
  list use `fetchAllRowsParallel` (same rows, deduped by id; a short page 0 probes once, the first wave
  is sized from last time's count). A
  `.in()` over many keys can hit the cap too; read the distinct set once and intersect in memory.
- ⛔ **Lead LIST code never reads `select('*')` of `outreach_leads`** — it downloads
  `OUTREACH_LIST_COLUMNS` (41 of 111, `src/lib/outreachLeadColumns.ts`; the Dashboard has its own
  `DASHBOARD_LEAD_COLUMNS`). A new field read in list code goes in that list —
  `scripts/outreach-list-columns.test.ts` walks every caller with a parser and fails otherwise; a dev
  Proxy logs any undownloaded read. `LeadDetailDialog` reads its own complete row (`useFullLeadRow`).
- ⛔ **The app's Sign out is GLOBAL** (`useAuth` calls `supabase.auth.signOut()`, scope defaults to
  global): pressing it ends every session on that account, on every device. To end ONLY a test or QA
  session, revoke it with `/auth/v1/logout?scope=local` using that session's own token.
- ⛔ **The API has ~10 database connections for everyone** (Micro instance, default PostgREST pool).
  Request count and query hold-time are shared costs. **Never `invalidateQueries` on an interval
  shorter than the query** — the old fetch keeps running (the queryFn ignores the abort), so copies
  pile up (the AI Audit 5 s whole-book poll, 2026-09-27). Poll the moving part and patch it in.
  Firing every page at once is slower, not faster (`docs/site-wide-speed.md`).
- **`ai_audits` / `ai_audit_runs` are NOT in the `supabase_realtime` publication** (only `outreach_leads`,
  `whatsapp_messages`): a `postgres_changes` subscription on them never fires. Poll, or read the card's
  state (`hookReportState`, `docs/hook-audit.md`).
- **RLS enabled with no policies reads as "no data"** (`200 []`), not "denied". Check `pg_policies`,
  not the prose. Route such reads through an edge function on the service role.
- **An allowlist is not an address book** — never read `ALLOWED_ORIGINS[0]` as canonical; when a
  fallback must guess an outward-facing address, refuse (`resolveSiteOrigin`).
- **UTC end-of-day formats as the next day in BST** — pass `timeZone: 'UTC'` for a stored day.
- **Stripe's hosted page is a JS shell** — verify an itemisation from the create-session response
  (`amount_total`), never from a fetch of the page. A `prod_` id where a `price_` id belongs kills
  checkout; name the SHAPE of a bad secret, never its value.
- **`findable-onboarding` silently drops any answer key not in its lists** (`answers`, `NEWER_COLS`,
  `optional`) — three places to add a field; only a live end-to-end test sees it.

**Measurement and documents**
- **The measurement can be right while the document lies** — check DATA vs RENDERING before calling
  an audit invalid. **Questions can measure the wrong intent** — `seedGuard.ts` (research intent,
  two tiers; teaching trades keep "learn to drive").
- **A catch-all error message is worse than none** — `explainAuditFailure` prints the raw error.
- **The four-minute gap between repeat runs was never a sampling safeguard**; `NOISE_BAND_PP = 5` was
  measured minutes apart. Do not restore sequencing as protection; do not stagger to zero until
  `run_number` has a unique index (§docs/measurement.md §25).
- **Business truth outranks generated ideas** (`docs/pre-sales-certification/fixes-04-ai-measurement.md`): the
  highest-ranked service list wins whole, Discovery is never a source of services, and every Discovery /
  baseline question passes `serviceScope.ts`; the final-20 checks live in `baselineQuality.ts` (one copy).
- **A guarantee measurement freezes only at questions × runs × engines answered** (`measurementHealth.ts`), or
  a Paul-accepted partial; missing cells are retried in place (`retryMissingCells`), never fabricated.
- **Audit spend is pooled by purpose** (`auditBudget.ts`: guarantee / client / prospecting, plus an Apify reserve).
  ⛔ Never one shared cap again — that is how a day of prospecting could cap a client's baseline.

---

## 5. Established findings — what actually works (`docs/findings.md`)

- **ChatGPT reads directories. Gemini reads businesses' own websites.** Two levers.
- Corrected book-wide (2026-09-15, judgeable names only): **941 businesses, Gemini 9.7%, ChatGPT
  33.2%, ratio 3.43×**. Re-derive before quoting — these are snapshots.
- **Being cited is not being named.** Directories are trade-specific and only citations can say
  which (Checkatrade: plumbers yes, accountants 1 of 80). **A business with no website cannot be named
  by Gemini at all.**
- **Tested NEGATIVE — never present as levers:** website quality, schema markup (35% vs 32%), reviews,
  Bing Places (zero citations ever).
- **The only supported lever:** presence in the sources AI reads for that trade, plus a website where
  there isn't one. **First before/after: ABLM 0 → 3 of 18, all Gemini, on town pages** — one client,
  evidence not proof. The claim lives in the overall figure, never a single question.
- **RG Locksmiths is the mirror experiment** (ChatGPT 20/36, Gemini 3/36 on one generic question):
  success needs a NEW service+town question naming him on Gemini.
- Question wording: `businessType` is stored PLURAL on 83% of audits; the WhatsApp variable rules in
  `templateVars.ts` (article check, `pluraliseTrade`, uncountables) exist for that.

---

## 6. Architecture rules that must not be broken (`docs/architecture-rules.md` for the reasoning)

**Evidence and verdicts**
- **Never add `trade` to `DirectoryFact`.** Facts are per-host; evidence is per-trade; the join can
  only SUBTRACT. Unknown hosts route to WHO'S WINNING, never to tasks. **No winnability scoring**;
  counts only. Known nationals/directories (`knownEntities.ts`) CLASSIFY, never add.
- **The niche verdict is the ONLY market verdict** — since 2026-09-28 it is the **Niche Check**
  (`src/lib/nicheSample.ts`, fn `niche-sample`, `NicheCheckCard` on Coverage): 3 towns (one per size
  band, distinct regions, random), 4 fixed intents, 3 runs, **Gemini decides, ChatGPT is context**, one
  Places search per town reads the real market; each town is one create-ai-audit discovery audit with
  `is_market`. Verdict derived on read (`niche_samples` stores evidence only). The old `market-view`
  fold is background only. Coverage rows are `worked` / `leads` / `untouched`. **Opening a view never
  spends**; only buttons that price themselves on their face may (the check's Run is admin-only).
- **`named` reads `cellNamed(cell, ctx)` everywhere** — with the business + trade/town the ANSWER
  TEXT is the ruler (a verdict may not contradict it; a citation alone is never a naming; joined or
  split spelling of one name is one name, never fuzzy), then the model verdict, then the stored
  string flag; one ruler per comparison. ⛔ **A title is not a name** (`PERSON_TITLE_TOKENS`, 2026-09-28): "Advocate Umesh
  Sharma" read 6/6 named from answers about OTHER advocates (`docs/india-readiness.md` §5). No context → the verdicts, exactly as before. Never zero on
  absence (`docs/reports.md` §33b; `named-text-primary.test.ts`).
  "Everywhere" includes the report's per-engine "Named in the answer" line (`recommended`), which
  ran its own string match until 2026-09-22 and disagreed with the summary above it
  (`docs/reports.md` §33; `named-one-ruler.test.ts` fences it). `cited` is a separate measure.
- **Competitor names come only from `extract-competitors` (LLM).** No regex extractor, ever. A dirty
  run withholds rival names from the client report (`competitorCleaning.ts`); RG's frozen baseline
  `f64920ce` stays suppressed by the junk rule — do not re-extract evidence.
- **`classifySource` grades any `.org` as authority** — known report-accuracy bug, not yet fixed.
- **A directory listing is CONFIRMED only by an identifier** (a link from their own site, the place id, their phone/domain, name + postcode) — never by a name; an inconsistency needs a confirmed listing; nothing is "worth adding" without positive evidence; absence never downgrades (`directoryPresence.ts`, `docs/directory-presence.md`). Discovery only — nothing creates a listing.

**Derived, never stored** — `serveGate`, `townVerdict`, `nameIsJudgeable`, `needsQ2`, the free-check
progress stage, the coverage rung, `townRequiredFor`/`audienceUsefulFor`, READY TO SELL
(`onboardingSummary`). A stored verdict freezes
old rows at a stale rule.

**The market model is the MARKET, never the delivery** (`src/lib/marketModel.ts`, 2026-09-20).
`local` / `national` / `hybrid` all HARD-FORCE their own prompt block; only a null scope is
classified by the model. A national set is an INTENT MIX (provider / problem / service / audience /
category / comparison / terminology, weighted), never one sentence pattern — the pattern is what made
a 20-question national audit twenty paraphrases. ⛔ **Never inject a town into a national question**,
and ⛔ **`dropMissingTown` must never bind hybrid** (it deleted the wider half and topped it up with
local templates). `offTradeReason`'s third door — the operator's own topics/sectors/audience — is
national/hybrid ONLY; the local guard was measured on 3,198 questions and stays tight. One context
shape (`auditQuestionContext.ts`) builds BOTH the preview and the confirm request: a second
hand-written payload is how a field shapes the reviewed questions and never reaches the stored audit.
`FULL_MEASURE_QUESTIONS` stays 20 — raising it is a spend decision, not a code one.

**DISCOVERY is the third manual mode AND THE FLEXIBLE OPPORTUNITY/RESEARCH AUDIT: 1–80
questions × 1–3 runs, default 40 × 3** (`DISCOVERY_MIN/MAX_QUESTIONS`, `DISCOVERY_QUESTIONS`,
`DISCOVERY_MIN/MAX/DEFAULT_RUNS`, `audit_purpose = 'discovery'`; 2026-09-20, dials 2026-09-21).
⛔ **THE DIALS LIVE HERE AND NOWHERE ELSE** — the full measure stays 20 × 3 and the paid baseline
stays frozen, because raising the measure's count raises the Apify bill on every paying client.
⛔ **Never present it as a measurement**, at any run count. ⛔ **The marker is the PURPOSE, never
the count** (`GENERATOR_ABSOLUTE_MAX_QUESTIONS` is also 40, so a count-based marker would capture
any caller asking for the maximum). ⛔ **80 is honest ONLY because generation is BATCHED**
(`planGenerationBatches` in `src/lib/auditPlan.ts`, each call ≤ the per-call cap); a policy
ceiling above what one call returns is the fault that killed the old 10..75 full-measure dial.
⛔ **Out of range is REFUSED, not clamped** (`question_count_out_of_range`, `runs_out_of_range`,
`too_many_questions` — 400, nothing started), and only for this purpose. The operator picks WHICH
generated questions run (`src/lib/questionSelection.ts`, indexes not text) and the screen quotes
`expectedResponses(q × runs × engines)`, the same function the run records. No money split, no SEO scan
(`seoScanAllowed` is baseline-only), no audit reuse, and it can never be a hook (`isHookAudit`
requires `ORDINARY_AUDIT_PURPOSE`). `audit_purpose` is plain nullable text with no CHECK — no
migration. Runs are operator-chosen 1-3 (`DISCOVERY_MAX_RUNS`), clamped server-side, replayed
verbatim by `advanceBaseline` — the chosen number IS `baselineTargetRuns`, so it controls
execution. `docs/measurement.md` §32. ⛔ Branch `full-measure-dials` (`2646b390`) put these
dials on the FULL MEASURE instead — **do not merge it**.

🔴 **A REPEAT'S QUESTION CAP COMES FROM THE STORED AUDIT, NEVER FROM THE CALLER** — three recorded
truncations (baseline 10→5, measurement 40→20, discovery 40→5, the last measured live on audit
`9a0c2b79`). `create-ai-audit` reads `audit_purpose` for any explicit `audit_id` and raises
`MAX_QUESTIONS` from it; it can only RAISE. ⛔ **Never re-teach a CALLER to declare what it is
repeating** — that is the guard-keyed-to-today's-instances trap, and it has now expired three times.
Same rule in `advanceBaseline`: a repeat sends the purpose that is STORED, with the two-column
reading kept only for rows written before the column existed.

**Three audit actions, one meaning each** (`src/lib/auditLifecycle.ts`, 2026-09-20): **Run again**
(a NEW audit, same purpose/questions/order/run count — a confirmation, never an editor), **Start new
audit** (the wizard prefilled, everything re-choosable, spends nothing), **Delete audit**. "Re-audit"
and "Re-run" are gone. `auditRepeatable` is a POSITIVE list of `audit` + `discovery`;
`auditDeletable` refuses `baseline` and `remeasure` — ⛔ **deleting one nulls
`outreach_leads.baseline_audit_id` (ON DELETE SET NULL) and `claim_baseline_pointer` is AFTER INSERT
only, so nothing can re-claim it.** Delete cancels work in flight via the existing `cancelRun` first;
runs and queue rows go by CASCADE, every other reference by SET NULL, so the lead survives.

**Absence is never an answer** — `serveGate` flags, never blocks, on a skipped question; `townVerdict` gates only on
`unverifiable`; `firstReplyMode` resolves anything unknown to `audit_only`; `seoScanAllowed()` is a
positive allowlist of `baseline`; `isColdOutreachTemplate` treats unknown as COLD.

**Money and customers**
- **API cost totals are Findable-PAID only** (`isFindableCost`, `src/lib/apiCostAccounting.ts`): usage before
  each provider's own switch date (`PROVIDER_MIGRATIONS`) was paid by Move37 — history only, never a Findable
  total. A new paid provider needs its date there or it reads Unallocated (`docs/api-cost-ownership.md`).
- **`paid` means `amount_paid > 0`, everywhere** (`isPaidLead`); `refunded` is the one status that
  removes a lead from revenue and keeps the amount. The dashboard's paying-customer count adds a
  floor (`PAYING_FLOOR_GBP`, derived) and churn (positive match on `canceled`/`incomplete_expired`).
  A cleared amount writes `null`, never `0`.
- **A WhatsApp conversation's state has ONE rule** (`src/lib/conversationState.ts`: unread per person
  from `UNREAD_TRACKING_START`, waiting-on-us, failed, queued, follow-up due, template required); the ONE
  deep link is `whatsAppLinkForLead` (`/inbox?lead=`). Sales' nav item says **WhatsApp** — same `/inbox`.
- **Counts and rates come from `whatsapp_messages`, never `outreach_leads.status`**; a send is
  `isRealSend` (`sent`/`delivered`/`read`, positive). `onboarding_responses` is read only through the
  `submissions` endpoint.
- **The browser never decides money**: `findable-checkout` reads the add-on tick from the ROW; the
  AI line stays inline `price_data` because it is the guarantee's only carrier.
- **Payment state is monotonic** (pre-sales wave 1, `docs/pre-sales-certification/wave1-integration.md`): only
  `establishLeadPayment` writes the paid state, as conditions ON the update; a replay never moves a client back,
  and a closed (ended / refunded) client never gets a subscription, a live status or a first-contact chase back.
- **Quick Close is pre-payment only, judged on the LEAD** (`quickCloseClosedRefusal`): money on it, a
  paid-or-beyond status, refunded or ended refuses every save / link / share — never the onboarding row's
  status alone (it moves on to `in_delivery` / `completed`).
- **First contact is owed only from the activation stamp** (`outreach_leads.first_contact_owed_since`, written
  by stripe-webhook on the payment that made them a client; `firstContact.ts`). ⛔ Never a hard-coded day.
- **The Welcome Pack's SEO grade is a separate website measure** (`seoStyle: 'pack'`, Paul 2026-10-04): the
  measured grade as Before, an After only when genuinely re-scanned, and the words saying the guarantee is
  judged on AI visibility alone. Never a projected grade, never the money-back number.
- ⛔ **A lead's country comes from Google's address, never from a form's remembered choice**
  (`src/lib/leadCountry.ts`, 2026-09-28): the hidden Find Leads country stored 349 UK businesses as USA.
  A stored phone → WhatsApp digits is ONE rule, `src/lib/waNumber.ts` (UK byte-identical, India's
  national forms get 91); a non-UK typed number is stored the way Google stores one ("+91 …").
  Hook questions pin the town with the LEAD'S country (`placeSuffixForCountry` — "Pune India", never
  "Pune UK"). Money is still GBP-only (checkout, webhook, report offer panel): India can PROSPECT, not
  CLOSE — `docs/india-readiness.md` §6.
- **Owner-scoped rows are owned by the DATA account** `pauljsales455@outlook.com` (`9d5a7629…`),
  resolved from the data (newest lead's `user_id`), never from the operator login (`paul@move37.fun`,
  owns nothing) and never hardcoded. A row under the wrong owner is invisible, not wrong.
- ⛔ **Canonical Findable business/contact/GBP email = `paul@findable.live`. move37 is
  legacy/non-client-facing only** (Paul, 2026-10-02). It is a real Zoho mailbox (send + receive,
  MX/SPF/DKIM set) with a Google account on it. Every alert, reply-to, client contact, onboarding
  step, GBP manager invite (`GBP_MANAGER_EMAIL`), welcome pack, report, PDF and support line uses it
  (`FINDABLE_CONTACT_EMAIL`, `OPERATOR_ALERT_TO`; findable-site `CONTACT_EMAIL`). **Never reintroduce
  `paul@move37.fun` in any of those.** It survives only as a login/account identifier (operator and
  Cloudflare login), in historical records, test fixtures and old notes. Clients who added it as GBP
  manager before 2026-10-02 keep that grant; nothing re-invites them. Live code or copy still naming
  it → flag it and change it.

**Auth, RLS, `user_id`**
- **`user_id` stays on every table.** `anon` and `authenticated` hold full DML GRANTS on all 56
  public tables and the anon key is in the JS bundle — **RLS is the only barrier to the internet.**
  Ten tables are service-role-only purely by having zero policies. `has_role(admin)` is inside 14
  tables' policies. Do not touch a policy "because single user".
- ⛔ **The role comes from `user_roles` only** (no signed-in role can write it; `admin-users` does,
  as service role). SQL `my_role()`, edge `_shared/access.ts` (`resolveActor` / `requireAdmin` /
  `leadAccess`), SPA `useSubscription().role`. Pure rules once: `src/lib/roleRules.ts`. Never a role
  from a request body, `user_metadata`, or the browser. Disable = remove the role row.
- ⛔ **A new edge function either calls `requireAdmin` or resolves the role and checks the lead with
  `leadAccess`/`canWorkLead`.** "Signed in" is not a permission any more. `scripts/role-rules.test.ts`
  lists them — add yours.
- ⛔ **A new page is admin-only by default** (`src/lib/access.ts` lists what sales may open, and
  `RequireAccess` redirects before the page mounts). That is presentation; the boundary is RLS + edge.
- ⛔ **Writes to `outreach_leads` / `ai_audits` / `ai_audit_runs` / `ai_audit_queue` from the browser
  are admin-only (RESTRICTIVE policies).** Sales writes go through the SECURITY DEFINER functions
  (`claim_lead`, `sales_add_lead`, `lead_set_*`, `sales_queue_opener`), which log to `lead_activity`.
- **"Contacted" = `lead_first_contact_at()`** (real message either direction, by lead OR phone; send
  row; legacy stamps; a questionnaire) — never found/crawled/audited. A contacted lead is never
  claimable. **New inserts with a place id already in the book are refused** by a trigger.
- **`whatsapp_sends.user_id` NULL = the queue sent it; set = the Inbox button.** That column is the
  sender diagnostic. `whatsapp_messages.user_id` NULL = system-sent or unmatched inbound.
- **Edge auth:** handler-side, always. Internal callers use CRON_SECRET + `x-internal-job`. Every
  function is listed in `config.toml`.
- ⛔ **A salesperson's bulk check is fn `sales-prospect-check` ONLY — never `bulk-jobs`** (it keys on
  `user_id` = the whole book; E-04). Per lead, judged when it is processed: assigned to them, not a client /
  archived / suppressed; reuse (in flight, or a result under `SALES_CHECK_AUDIT_REUSE_DAYS`) before any spend;
  then the rep's `sales_check` allowance → the prospecting pool → `guard_action` → `create-ai-audit` (internal
  door, the rep's own hook body). The database is the dedupe (request id, one active batch per rep, one lead
  per batch). It writes no lead row and refuses a NEW check while `audit_complete_template` is set or a pitch
  waits on the lead. `docs/pre-sales-certification/fixes-07-sales-bulk-audit.md`.
- ⛔ **No audit result ever changes a lead's status** (Paul, 2026-10-04). "Not interested" is a sales outcome a
  person records. The 3/3 and 6/6 auto-rules and `_shared/hook-not-interested.ts` are deleted; a 6/6 result
  is shown as "Strong AI visibility — named in all 6 answers" (`callCardAudit`). Do not re-add one.
- **The Dashboard "Full Reset" is gone**; `reset_my_account()` still exists in the DB until Phase 3.

**WhatsApp**
- **Compliance position: reviewed and NON-BLOCKING (Paul, 2026-10-02)** — `docs/whatsapp-outreach-compliance.md`.
  WhatsApp = a lightweight opener / follow-up; live calling becomes the main cold channel. PECR / WhatsApp
  questions are a legal-policy matter, NOT an engineering blocker: build no consent fields, no
  company-type classification, no new blocking rules, and do not change the openers for this reason.
  ⛔ Never write that cold WhatsApp outreach is definitively lawful (or unlawful). ⛔ The opt-out /
  suppression behaviour stays exactly as strict as it is. Reopen only on the triggers in that doc.
- **One sendable list: `WHATSAPP_TEMPLATES` (`src/types/outreach.ts`).** Legacy barber names stay in
  `LEGACY_WHATSAPP_TEMPLATES`/`templateBodies.ts`/`SUPERSEDED_BODIES` because they render historic
  transcripts. **A template lives in eleven places** — `WA_TEMPLATES` + bodies (`whatsapp-send.ts`),
  the queue's mirror, `WHATSAPP_TEMPLATES`, `WA_TEMPLATE_REQS`, `CONTINUATION_TEMPLATES`,
  `READABLE_TEMPLATE_BODIES`, Inbox `TEMPLATE_DISPLAY`, `SIGNUP_TEMPLATES`/`REPORT_LINK_TEMPLATES`,
  and the named-template tests. The parity tests (`template-registry`, `template-bodies`,
  `template-picker`, `template-routing`) fence them. **Names match Meta exactly**, `payment_recieved`
  included; each mirror follows ITS OWN registration.
- **One initial opener at a time — no split.** `whatsapp_outreach_state.initial_opener_template`
  (currently `initial_contact`) is the only choice; `openerSendability` refuses any other opener in every
  picker and in `send-whatsapp-message`, and fails closed when unreadable. Never re-introduce a
  hash/random split (`docs/whatsapp-templates.md`, 2026-09-23).
- **Cold vs continuation** (`coldOutreach.ts`): a cold template is refused for any phone with ANY
  non-failed message history, whatever lead row it arrives on; a follow-up must be named in
  `CONTINUATION_TEMPLATES` or it is refused for its whole audience. The queue is template-blind on
  "already sent" — it structurally cannot send a second message to a lead; second messages go from
  the Inbox. `contact_check` fails CLOSED.
- **A tap is not a call; only a logged CONVERSATION stops the cold opener** (sales workspace v2,
  `docs/pre-sales-certification/sales-workspace-v2.md`): tapping Call / `tel:` writes nothing (not even
  `contact_method`). `sales_queue_opener` refuses `contacted_by_phone` / `contacted_logged` only for an outcome in
  `CONVERSATION_OUTCOMES` — SQL `lead_conversation_outcomes()` is the same list (tested); no answer / voicemail
  never stop it. Campaign MEMBERSHIP never reads contact history; the reason the opener will not go is said on the lead.
  ⛔ EVERY cold-opener door asks the ONE function `opener_contact_block` (sales_queue_opener, contact_check →
  Outreach admin bulk + per-lead queue, the drip at send time, send-whatsapp-message — not overridable by
  allow_resend). Cold templates only; continuations and in-window replies never reach it. A new opener door must
  ask it too (`scripts/opener-contact-guard.test.ts`).
- **A campaign is a container** (name · niche · Call/WhatsApp · optional area; `campaign_new`/`campaign_update`):
  no lead-choosing wizard, leads join from Find Leads. A Call campaign never sends (`campaign_launch` →
  `call_campaign`). Delete = `campaign_archive` (leads, `campaign_id` and history stay) — never a hard delete.
- **The Close follows the website approach** (`quickClose.ts` `closeFlow`): a new site never asks for (or is
  blocked by) old-site access; plain Optimise never asks the domain; an unresolved domain on Build is a
  non-blocking FLAG for Paul ("Domain handoff to resolve before launch"); "Paul review required" is only Optimise
  on a site we cannot get into. `withRoute` is the one approach → plan derivation; an approach change is a
  confirmed route change. The lead popup is Call · Details · Close · History; ONE Next Action, at the bottom of Call.
- ⛔ **An explicit opt-out (`contact_suppressions.reason = 'opted_out'`) blocks every MARKETING send,
  paying clients included** — the automated senders refuse any suppressed row; the Inbox refuses a
  marketing template (`src/lib/marketingConsent.ts`; only `SERVICE_TEMPLATES` and free-text replies go).
  Record a stop with `recordOptOut()` (upgrades a weaker reason in place), never "already suppressed → skip".
- **A template parameter may not contain a newline, a tab or 4+ consecutive spaces (#132018) and may
  not exceed 1024 characters (#131009)** — either kills the WHOLE send. `forMeta()` collapses
  whitespace as a last resort; a multi-sentence variable is still ONE LINE, and a long one is
  shortened by dropping content, never truncated mid-sentence (`MAX_FINDINGS_CHARS`).
- **A template pending Meta approval gets a `*_APPROVED` constant, and the gate goes FIRST** —
  `INITIAL_OPENER_V2_APPROVED`, `AI_SITE_FINDINGS_V2_APPROVED` (`siteFindings.ts`, currently false).
  Register it in all eleven places; the constant, not absence, is what stops the send. Never infer
  approval, and never "try it and see" — that spends a real message on a real prospect.
- **`ai_site_findings_v2`'s {{6}} excludes `missingH1`/`noJsonLd` deliberately** — a weak finding on
  WhatsApp reads as a scan, so a lead with only weak faults gets NO message rather than a padded one.
  It also refuses a no-website and a clean-crawl lead, which `audit_followup_fault` accepts.
- ⛔ **Never assert how an AI model decides.** We can see what is on a site; we cannot see why Gemini
  or ChatGPT named someone else. "AI reads those as one page", "AI does not run JavaScript", "it has
  read everyone else's site and not yours" are all claims about an unobserved process — a prospect
  who knows more than we do spots one instantly. Write "can make it harder", "may mean", "gives AI
  less information to work with". `site-findings.test.ts` blocks both scanner phrasing and absolute
  claims; every finding is WHAT I SAW → WHAT IT MEANS → WHY IT MAY MAKE AI VISIBILITY HARDER.
- ⛔ **The send window is the RECIPIENT'S, chosen from the digits we send to** (`src/lib/sendWindow.ts`,
  2026-09-28): a +91 number sends 10:00–19:00 IST, every other number the London window unchanged; the
  queue filters held leads BEFORE the look-ahead slice, in every lane. Never choose it from
  `outreach_leads.country` — that column was measured wrong on 374 rows (`docs/india-readiness.md`).
- **The send window binds the QUEUE only** (07:00–21:30 London for UK numbers); the reply path answers Meta's 24-hour
  window and still counts against `DAILY_CAP`. Name the constants; never write the numbers.
- **The Inbox bulk confirm dry-runs every lead first** and sends only those that passed (`inboxBulkSend.ts` `applyBulkChecks`). A single-engine body is refused for a hook from the other engine UNLESS waived by name: `audit_followup` ("I asked chatgpt") is waived for either engine by Paul (`TEMPLATE_ENGINE_CLAIM_WAIVED`). See `docs/whatsapp-templates.md` (2026-09-27).
- **`mode: "dry_run"`** on `send-whatsapp-message` builds the real payload and stops before the Graph
  POST — the same code path, refusals reported. Use it before a first real send. `test_send` costs a
  real message and is the only proof Meta accepts a template.
- **Greeting names:** `displayName.ts` — `greet` (full peel) vs `identify` (legal suffix, then trailing
  town from the lead row, then "Services"); `IDENTIFY_NAME_TEMPLATES` is the one place that decides.
- **First-reply rule is three-way** (`whatsapp_outreach_state.first_reply_mode`): off / audit only /
  audit + send; `audit_only` rows are terminal by status. **Off is `auto_reply_enabled = false` and arms
  nothing** (`effectiveFirstReplyMode`). The guards are ONE set, `firstReplyGuard`
  (`src/lib/firstReplyAutomation.ts`): client → nothing, auto-responder/placeholder → nothing, a clear no →
  suppressed + flagged, no audit, no pitch; an auto-send needs a reply to an approved opener. The legacy
  inbound chain is deleted — never re-inline a guard in the webhook. **Never merge the three audit entry points**
  (row pill, Inbox button with auto-pitch, bulk) — share input resolution only.

**Reports and documents**
- ⛔ **We never publish content written in a business's name** (Paul, 2026-10-01). The
  yoursites.uk/r/ "listing" (fn `generate-report`) is RETIRED: `/r/[slug]` answers 410 + noindex,
  and `generate-report` is a 410 stub. ⛔ **Never delete `business_reports` rows**: they are the
  legacy name-plus-8-hex REPORT slug map for `render-audit-report`. yoursites.uk is the legacy
  `leadfinderos` project, which main does not deploy; its frozen `/r/` is closed by the dropped anon policy (anon reads of `business_reports` return nothing). Record: `docs/r-profile-pages-audit.md`.
- **The Welcome Pack resolves from `outreach_leads.baseline_audit_id` ONLY**, and asserts the row's
  `audit_purpose` rather than trusting the claim trigger. Never "the newest completed audit" — that
  was the bug, and a Discovery scan would have become a client's baseline pack. `welcomePackData.ts`
  is the one readiness rule; `_shared/welcome-pack-render.ts` is the one builder, serving BOTH
  `findable.live/w/<code>` (the baseline audit's own `short_code`) and the operator's download.
  Client safety is an explicit COLUMN ALLOWLIST, not a remembered omission (`docs/welcome-pack-and-
  website-build.md`).
- **Every report renders live** from `render-audit-report` at `findable.live/report/<auditId>`.
  ⚠️ Measurement audits ARE served as client reports since 15634d49 (Paul, 2026-09-18) — the old
  "internal measurements answer 403" rule is gone. Refused: market audits and the **weekly check**
  (`audit_purpose = 'weekly_check'`, explicit in the renderer); the per-question pages are
  operator-only; a mid-flight audit shows "still measuring" (`measuringState`), never a partial count;
  `hasWebsite` is tri-state from the lead's `website`/`place_id` — false is never inferred from blank.
- **Operator copy contains competitors — never send it.** (The client request form and its structural
  leak boundary went with the Playbook documents, retired 2026-09-30.)
- **Client-facing copy is scanned** by `client-copy-claims.test.ts` (no eight weeks, no £49.99, no
  founder, no hedge, no Bing). Add every new renderer. Things no script can check and are hand-kept:
  the Stripe Payment Link, every Meta-registered body.
- **Sales words have ONE style source: `src/lib/salesStyle.ts`** (Paul, 2026-09-30). A new model
  prompt that writes to a prospect includes `SALES_STYLE_RULES` verbatim; new generated or scripted
  sales copy is checked with `salesStyleProblems` (pass the inserted names as `ignore`) and added to
  `scripts/sales-style.test.ts`. Say the search as trade + town ("a plumber in Rugby"), never the audit
  query or an adjective on it. Record: `docs/sales-language.md`.
- **Page generator**: anti-stuffing is CODE (phrase/town/noun-spam caps, measured); "based here" only on
  the real home-town page; Q&A `structured` (all blanks) for regulated trades and for ANY blank trade,
  `advice` otherwise with every figure/credential/first-person commitment held for confirmation;
  competitor names never on a client page; neighbourhoods are an operator field, never mined.
- **A site page answers only what the client confirmed** (wave 1, `src/lib/siteServiceTruth.ts`): Workstream 4's
  service truth (client onboarding / verified fact → Sales notes → never Discovery) feeds Website Build's scope
  (`siteGate.siteTruthFromBuild`) and the page generator. A planned page for an unconfirmed service owns no
  baseline question and is flagged; the client's "not offered" list joins every exclusion; a MEASURED question
  naming an unconfirmed service or an unserved town gets no Q&A / plan page. WS-6's own rules: launch =
  `websiteLaunch.ts`, form registry = `website_build.form`, claims = `claimRules.ts` ↔ the gate.
- ⛔ **A not-offered entry about NEW work binds only new work** (`serviceScope.ts` `NEW_WORK`): "no new boilers"
  must never exclude boiler repairs or servicing (wave 1 found it shrinking to "boiler").
- ⛔ **The client's own "no" is not a word of the service** (`buildServiceScope` `NOT_OFFERED_PREAMBLE`, pre-sales
  final): a negative matches only when EVERY one of its words is in the question, so "no" / "we don't" / "fit"
  left in the LABEL meant "No new boilers" never matched anything. Strip them from labels only — never from
  questions ("no hot water" is the customer's words).

**Crawls, onboarding, baseline inputs** (`docs/paid-client-evidence.md`)
- **Every manual Crawl site / Re-crawl site / Crawl check is EXHAUSTIVE** (`mode: "full"`, operator-only,
  `resolveCrawlMode`): a background job (`crawl_jobs`/`crawl_urls`, drained by `crawl-worker`, cron
  `crawl-worker-run` backstop) that runs until the frontier is empty — no page, request or sitemap cap
  (`docs/exhaustive-crawl.md`). Never make it finish inside one request again. Automated crawls stay
  STANDARD inline (`STANDARD_CRAWL`). The screens only WATCH a job; they never crawl.
- **`lead_crawl_checks` is ONE row per lead, read by every screen** — never a screen-specific copy.
  The crawl-wide summary lives in `full_evidence`, every URL in `crawl_urls` (never in `result`, which
  Outreach/Inbox read for the whole book). An automated crawl never replaces a fresh full one
  (`mayReplaceLeadCrawl`). Read big inventories PAGED (`crawl_inventory`), never in one response.
- **Same-site means the SERVED address, `www.` ignored** (`sameSiteUrl`). Comparing against the
  requested origin read one page of every apex→www site.
- **Manual onboarding writes the customer's columns** (`buildOnboardingPatch`) + provenance
  (`operator_edited_at/by`, `client_source='manual'` on a row it creates); never `plan_tier`,
  `website_addon` or `baseline_*`. Its question text is pinned to findable-site by
  `manual-onboarding.test.ts` — change the customer copy and that test fails until this matches.
- **The crawl never MERGES into what the baseline measures** — onboarding → verified build facts →
  lead → Discovery; crawl services/towns are `detected_*` suggestions only.
- ⛔ **Official baseline = the Hook Audit's questions (locked, verbatim) + the rest from Discovery = exactly 20**
  (Paul, 2026-09-30, `docs/baseline-workflow.md`, `src/lib/baselineRecommendation.ts`). A Hook question
  leaves only with a written reason (server refuses `hook_question_removed`; kept on `baseline_meta`).
  Every Discovery question gets RECOMMENDED / FUTURE OPPORTUNITY / NOT RECOMMENDED + a reason. The
  opportunity is a TIE-BREAK after balance, never the selector. Not-chosen questions seed
  `client_opportunities` (the Opportunity Backlog, service-role only) — ⛔ never read by the guarantee.
  A frozen set reopens only via `reopen_approved` (approved + not started + reason). Counts are always
  MEASUREMENTS (complete) and NAMED on separate lines — never a bare "3/3". Collapse = ONE pattern,
  `src/components/CollapsibleSection.tsx`, per user.
- **Paid baseline = Discovery → balanced 20 → approve** (`docs/discovery-balanced-baseline.md`).
  Discovery asks the generator once PER APPROVED TOWN (no lead id, or `pickAuditTown` overrides the
  town); the draft is `buildBalancedBaseline` (`src/lib/baselineMix.ts`), which spreads services, towns
  and intent types and ⛔ **never reads winnability** (a caller-supplied rank may only break ties — 2026-09-30). Near-duplicates are "same intent" by
  `sameIntent` (meaning tokens + town), not by case/plural; approval refuses them unless
  `accept_duplicates`. The create-ai-audit baseline preview is still home-town-pinned — do not use it
  to draft a paid baseline.
- **Discovery progress is counted in MEASUREMENTS** (question × engine × run), from the stored rows,
  by `src/lib/discoveryProgress.ts` — never in whole runs, never a client counter
  (`docs/discovery-progress.md`). **One job per pool:** the start is a compare-and-set on
  `baseline_discovery`; a finished pool refuses a re-run; regenerate is refused mid-run and keeps the
  old job in `history`. A job is attached only if its questions all belong to the pool.

**Website Build**
- ⛔ **The operator flow is the SIMPLE screen** (`src/lib/simpleBuild.ts` + `SimpleWebsiteBuild.tsx`, 2026-10-05, `docs/pre-sales-certification/website-build-simple.md`): build type → Prepare Website → ONE Master Build Prompt → review the built preview → corrections → launch; the V2 command centre is `?view=advanced`, unchanged. Build type is DERIVED from the route (never stored). Prepare auto-accepts only uncontested contact-identity facts (`autoAcceptFacts`; a phone / email / address clash is always Paul's) and never overwrites a decision. Preview QA ticks each have ONE owner: a `SIMPLE_REVIEW_ITEMS` check or `GATE_ANSWERED_QA` (answered only by a preview-ready, problem-free result — `outstandingPreviewQa` is what the launch rule reads). Never treat a Discovery-only website as the client's: `currentWebsite` (simpleBuild.ts) is the ONE rule, read by the simple flow AND the Advanced view (`docs/pre-sales-certification/advanced-website-truth-fix.md`).
- ⛔ **Preview Ready = technical AND perceived quality** (`websiteQuality.ts`, 2026-09-25): read it through `previewReadyProblems`, never `previewGateProblems` alone (a test fails if the page or the retry prompt does). An existing-site rebuild is not Preview Ready until every old-site strength is decided (preserve / modernise / improve, or removed WITH a reason), every content intent is assessed, and the build reports old vs new at 1440 + a phone width as `upgrade` with nothing the old site still wins. Recon reads strengths from the RENDERED page (BS4: a JS reviews widget was invisible to an HTML read).
- ⛔ **…AND the build standard** (`websiteBuildStandard.ts`, 2026-09-27 — what MCL + BS4 were rescued for by hand): image roles (**Areas hub → the MAP by default**; fallback a genuine local image, then a job photo only if it shows the locality, each with a reason — never an unrelated one; a map is never a hero background; phone crop keeps labels legible; never drawn / pinned), the mobile hero photo BEHIND the copy (one first screen), **genuine reviews AND the confidently sourced rating / count shown by default** (rating with a snapshot date; held only for conflict / identity / unsourced — not a routine Paul approval), a real form through fn `site-enquiry` (a mailto form always fails; a working old form never becomes none; proven by a test-mode submission), credentials prominent, no repeated photos, photographic strength preserved (judged — never a photo quota). The build reports `quality.standard`; `standardProblems` × `standardEvidence(state)` gate it inside `previewReadyProblems`. Principles, not a clone — never name a reference client in the rules.
- ⛔ **…AND the Site Quality Gate** (`scripts/site-quality-gate.mjs` + `src/lib/siteGate.ts`, 2026-09-30, `docs/website-build-seo-gate.md`): the build's own `qa.*` is a CLAIM; the gate reads the real output (robots / sitemap / canonicals / noindex incl. `_headers` scope / links / orphans / titles / H1s / cloned pages / schema / identity / intent ownership) and its failures are imported as ERRORS that also turn the matching `qa.*` false. Not run = an error. Stored in the existing `errors` / `warnings` / `qa` keys — keep it that way (no `paid-client-hub` redeploy). The X6b **Site Intent Map** gives every service / location / content intent / frozen baseline question ONE owning page; a baseline question is a QA label, never a title / H1 (the gate fails a verbatim one). Never weaken a check to pass a build. The gate fetches from LeadFinderOS **main** — a change to it is live for every build once merged.
- ⛔ **Current-site facts (Paul, 2026-09-30, `recon.ts` `SOURCE_SITE_FACT_KEYS`)**: anything the client's own site states is approved source-site evidence by default — services, hours, credentials, licences, insurance, awards, FAQs, history, contact details… Paul decides only conflicts, ambiguity, 24/7 vs stated hours (`availabilityConflict`), superlatives, prices, tracking IDs and unknown keys. Never re-add a routine approval for a stated fact. ⛔ **Prices stay Paul's** (confirmed 2026-09-30): never carried from the old site into a rebuild because it is public — the build prompt says so and the gate fails any £ figure not in the Site Intent Map's `prices` (the verified ones).
- ⛔ **The MCL template (v2.0) seeds `Beyondweb2/MCLocksmiths-New` at a PINNED commit** (`sourcePinnedCommit`, `sourceKind: 'live_client_repo'`) — never the superseded `MCLocksmiths` repo, never the moving branch; the cache folder is per source (`templateCacheName`). A live client repo is structure only: its `inheritedHazards` (data modules, DPOM key, reviews, legacy URLs, photos, records) are printed in X1. The target is a Findable-owned template (`canonicalPlan`); re-pin deliberately, never "latest". No Findable surface emits rating / review schema.
- ⛔ **One intent-ownership rule** (`src/lib/intentOwnership.ts`, `ownershipFor`): the Site Intent Map, page-generator Q&A and the page-plan queue all ask supported → already owned (improve it) → competing → only then a new page. Q&A refuses `intent_owned` BEFORE any AI spend; plan_build HOLDS a planned page the Website Build plan already owns. ⛔ **A question is the target intent, never the heading** — `qaHeadings` builds title / H1 / slug from the genuine service + place + business ("who does rewiring in Bristol" → "House Rewiring in Bristol"); never `h1: question`.

**State and navigation**
- **The URL is for WHAT you are looking at; `usePersistedState` for HOW the page is configured.**
  ⛔ Never persist an open dialog. A modal must not arrive over the thing that was clicked.
- ⛔ **The lead workspace header draws each fact once** (`src/lib/workspaceHeader.ts`): status pill +
  owner, then the Next Action BAR (display; Edit opens the Work tab's ONE `NextActionForm`), then a quiet
  last contact. A sales-state pill joins the status only through `headerStateShown` — never "Meeting
  booked" above the same meeting in the bar. Work-tab sections fold through ONE component, `WorkSection` (summary line, warnings visible folded, body kept mounted). `docs/workspace-declutter.md`.
- **`useOutreach` is the one hook not on React Query** — its own piece of work; do not tack it on.
- ⛔ **Outreach loads progressively** (newest 1,000 first, `src/lib/outreachLoad.ts`): anything that
  needs the WHOLE list gates on `datasetComplete(leadLoad)` (positive match on `'complete'`) — a new
  bulk action goes inside the toolbar's disabled `<fieldset>` AND calls `needsFullList()`. Never let the
  first 1,000 stand in for the whole dataset (`docs/site-wide-speed.md` §7d).
- **The Coverage niche reads `ai_audit_queue.result_niche`**, a trigger-kept trimmed copy of `result`
  (`niche_result_slim`). A field the niche fold starts reading must be added to that SQL function AND
  backfilled first, or it reads as absent. Everything else reads `result`.
- **The shell mounts once** (`<Route element={<AppLayout/>}>`); page-level caches must survive it.
- ⛔ **ONE status pill per lead row** (Outreach desktop + phone, Inbox header + list, 2026-10-01): the SOLID
  pipeline badge in its own words and colours (`PipelineStatusSelect` / `OneStatusPill`). **Interested is the
  gold star, never a pill** (Paul). Never draw a `SalesStatePill` beside it; the stage is its tooltip only. The
  lead popup is the detail view (both). Paul rejected a stage-substituting pill the same day — do not bring it back.

**Outreach truth** (`docs/outreach-workspace.md`)
- ⛔ **A send stamp is not a contact when the send failed**: `whatsapp_sent_at` is set when Meta ACCEPTS; read
  contact through `leadState.openerReallySent`, never the raw stamp. WhatsApp reachability only through
  `whatsAppCapability.ts` — `line_type` is an offline format guess, never "WhatsApp-capable".
- The Status cell shows status only; last contact is its tooltip; what happens next is the Next Action column —
  the saved Next Action only (2026-10-02).
- Reply notifications are ONE bell card from `my_whatsapp_unread_counts` (the Inbox's unread truth); never count
  `whatsapp_reply` rows.

**Sales Team Board** (`docs/sales-team-board.md`)
- Admin → team messages/tasks live in `team_posts` / `team_post_recipients` / `team_post_events`; **no
  write grants** — every write is a role-checked function. Recipients are a frozen snapshot; "Everyone"
  is computed server-side and leaves out `metric_exclusions` test accounts.
- ⛔ **One lead = `assign_lead_with_brief`** (assign_lead + one board task; the ONE notice is
  `trg_notify_lead_assigned`'s). Bulk stays on `assign_lead`. A board task never stores a second date
  for a lead — it shows the lead's Next Action; completing it touches nothing on the lead.
- A moved lead cancels the previous holder's open lead tasks (trigger) — any new assignment path gets
  this for free; never delete a task row.
- ⛔ **Moving a lead never moves its history.** An event naming no person is credited to whoever held the lead
  THEN (`holderTimeline.ts`), never to the current holder. Never rewrite `added_by_user_id` / `lead_activity`
  actors to "fix" attribution (Paul, 2026-10-01: keep the historical records).

**Facts about a client**
- **One ranked resolver, `src/lib/clientFacts.ts`:** onboarding > client record > baseline >
  discovery > crawl. **Rank breaks the tie; it does not hide the loser** — a differing lower-ranked
  value is still raised under CLIENT CONFIRMATION REQUIRED, naming both values and both sources.
  **Lists are never merged** (a merge gives back a service the client deleted). Nothing is invented:
  an unknown local repo path prints `[LOCAL REPO PATH REQUIRED]`.
- **Section 5's Claude rebuild prompt is generated at CLICK TIME and never stored** — a stored prompt
  is stale the moment onboarding or a baseline lands. `outreach_leads.website_build` (jsonb, saved
  through an allowlist) holds only the seven workflow fields Paul types.
- **Citation is not causation.** Do-not-break URLs are the client's own host cited in the baseline;
  the wording says "cited while answering" and tells Claude to investigate first.

**Data hygiene**
- **Paginate every PostgREST read** (`fetchAllRows`, `.order('id')`).
- **Migrations are applied one at a time**, never `supabase db push` (history desynced). A migration
  file existing does not mean it is live — read the live definition.
- **Guards that decide from the database, fail closed** (addLead dedupe; contact_check; the
  free-check dedupe). Ambiguity creates a new lead rather than matching wrongly.
- **`no_whatsapp_needs_sms` (1,861 leads) is the landline marker** — keep the status; only its
  wording mentions SMS. `no_whatsapp` = mobile with no WhatsApp.
- **`generated_sites` is written by the live mockup product** — purge only barber rows, as
  service_role (the lock trigger refuses the postgres role and the Auth admin cascade).
- **`enrichment_usage` / `_shared/enrichment/*` are the audit engine and its spend cap**, not
  contact discovery. Do not delete with the enrichment product.

---

## 7. Where the code lives (`docs/code-map.md` for the long form)

| Thing | Path |
|---|---|
| Offer, guarantee, prices | `src/lib/findableOffer.ts` (+ `_shared/offer-price.ts`; findable-site `src/lib/site.ts`) |
| Audit kinds, SEO allowlist | `src/lib/auditKind.ts` (`audit_purpose` is the marker) |
| Named signal | `src/lib/namedSignal.ts`, `_shared/derivable.ts` (`nameIsJudgeable`) |
| Measurement folds | `src/lib/measurementCompare.ts`, `measurementRunGroups.ts`, `measurementExport.ts`, `baselineView.ts`, `pooledRuns.ts` |
| Baseline/replay engine | `_shared/audit-baseline.ts` (`advanceBaseline`, `fireDueRemeasures`), `src/lib/baselineReplay.ts`, `fullMeasure.ts`, `questionFill.ts`, `remeasureDue.ts`, `remeasureFill.ts` |
| Results sender + document | `_shared/remeasure-results.ts`, `src/lib/remeasureResults.ts`, `remeasureResultsHtml.ts`, fn `render-remeasure-results` |
| Client report | `src/lib/auditReport.ts` (`buildReportData`), `aiAuditReportHtml.ts`, fn `render-audit-report`, `measuringState.ts` |
| Report gates | `competitorCleaning.ts`, `knownEntities.ts`, `sourceType.ts`, `seedGuard.ts` |
| WhatsApp registries | `_shared/whatsapp-send.ts`, `process-whatsapp-queue` mirror, `src/types/outreach.ts`, `src/lib/whatsappTemplates.ts`, `templateBodies.ts`, `templateVars.ts`, `templateRouting.ts`, `coldOutreach.ts`, `rivalHook.ts`, `displayName.ts`, `firstReplyMode.ts` |
| Senders | fn `send-whatsapp-message` (Inbox, `dry_run`, `test_send`), `process-whatsapp-queue` (drip, first-reply lane, `contact_check`, `suppress_lead`), `_shared/whatsapp-inbound.ts` (via `whatsapp-status`) |
| Voice notes (Inbox, 24h only) | fn `send-whatsapp-voice`, `_shared/voice-note-send.ts`, `src/lib/oggOpus.ts` (WebM→Ogg remux), `voiceNote.ts`, `VoiceNoteRecorder`/`VoiceNotePlayer` — `docs/whatsapp-voice-notes.md` |
| Sales pre-call checks ("Check before calling") | `src/lib/salesCheck.ts`, `_shared/sales-check.ts`, fn `sales-prospect-check`, tables `sales_check_batches` / `_items`, `SalesCheckPanel.tsx`, `SalesChecksAdminCard.tsx`, `callCardAudit` (`coldCallPlaybook.ts`) |
| Free check | `_shared/free-check-lead.ts`, `free-check-audit.ts`, `free-check-result.ts`, `same-business.ts`, `src/lib/freeCheckProgress.ts`, fns `findable-onboarding`, `submissions`, `notify-onboarding-submit` |
| Town | `src/lib/townVerdict.ts`, `_shared/place-details.ts`, `place-town.ts`, `place-resolve.ts`, `town-distance.ts`, fn `backfill-lead-towns`, table `uk_towns` |
| Serve gate | `src/lib/serveGate.ts` (+ findable-site mirror) |
| Multi-user / roles | `src/lib/roleRules.ts`, `src/lib/access.ts` (matrix), `src/components/RequireAccess.tsx`, `_shared/access.ts`, `src/lib/salesCrm.ts`, `src/hooks/useSalesCrm.ts`, `LeadCrmPanel`, `AvailableToClaim`, `src/lib/leadRpc.ts` + `salesPatchPlan.ts`, pages `Team`/`SetPassword`, fn `admin-users` (team actions), migrations `20260927100000…100400` + `140000`, view `sales_leads`, tables `team_members`/`lead_activity` |
| Sales Team Board | `src/lib/teamBoard.ts`, `src/hooks/useTeamBoard.ts`, `src/components/team/` (TeamBoard, TeamComposer, TeamOversight), `adminMetrics.delegation`, migration `20261001200000`, test `supabase/tests/sales-team-board.sql` |
| Admin dashboard rules (2026-09-30) | ⛔ Every admin number comes from `_shared/admin-overview-load.ts` → `src/lib/adminMetrics.ts` (the dashboard AND the AI briefing — never a second fold). ⛔ Reply triage (`replyTriage.ts`): opt-out suppression is PHRASES ONLY, never the model, never a paying client; the model only files. ⛔ `audit_purpose = 'weekly_check'` is monitoring, never the guarantee — no pointer trigger reads it and `render-audit-report` refuses it. ⛔ findable.live analytics send only the fields the privacy page lists (`findable-site/src/lib/analytics.ts`); change both or neither. ⛔ The AI briefing is stored only when every number in it is in its facts (`validateNumbers`). |
| Admin dashboard (control centre) | `src/pages/Dashboard.tsx`, `src/components/admin/controlCentre.tsx`, `src/hooks/useAdminOverview.ts`, fn `admin-overview`, `src/lib/adminMetrics.ts` (every definition), `reportingPeriod.ts` (the ONE London-day clock), `metricExclusions.ts` + table `metric_exclusions`, `apiCostLabels.ts` + SQL `admin_api_cost` — `docs/admin-control-centre.md`. ⛔ Test accounts test1/Test are excluded from performance numbers by ROW, never by name; their leads stay in inventory |
| Dashboard (older, now unrendered) | `src/hooks/useDashboardMetrics.ts` (still the `FOUNDER_PRICE_GBP` sync source), `useCampaignStats.ts`, `src/lib/templateAttribution.ts`, `armComparison.ts`, `realSend.ts`, `leadPayment.ts`, `dashboardTasks.ts`, `deliveryCockpit.ts` |
| Coverage / niche | `src/pages/Coverage.tsx`, `NichePanel.tsx`, `src/lib/nicheView.ts`, `coverageState.ts` (`foundAddedByPair`), `websiteStatusClass.ts`, fns `coverage`, `market-view` |
| Directory / profile presence (discovery only) — THE one directory engine | `src/lib/directoryPresence.ts`, `presenceSources.ts`, `directoryFacts.ts` (64 hosts), fn `directory-presence`, SQL fn `presence_trade_citation_hosts`, tables `lead_directory_presence` (one row per lead × source) + `_runs`. Retired 2026-09-30: fns `check-directory-listings`, `playbook-evidence`, the Playbook libraries; tables `lead_directory_checks` / `client_listings` kept as history |
| Website Build (command centre, V2) | `src/pages/WebsiteBuild.tsx`, `src/lib/websiteBuildState.ts` (the ONE shape rule, browser + `paid-client-hub`; `version: 2`, V1 rows read through), `buildRoutes.ts` (routes + stage checklists — stored check keys, never rename), `websiteTemplates.ts` (MCL profile + forbidden seed values, hand-kept), `buildFacts.ts`, `buildArchitecture.ts`, `buildPack.ts`, `stagePrompts.ts`, recon: `reconSchema.ts` (the JSON contract, `reconVersion`), `recon.ts` (prompt, safe import, merge), `manifestSummary.ts` (fenced per-route summaries — never the raw JSON in a prompt), mapping: `templateMapping.ts` (`computeMapping` — trade-agnostic; a template only DECLARES fields / catalogue / slots in `websiteTemplates.ts`; only `ready` values reach the config; recon risk rule `LOW_RISK_FACT_KEYS` is a positive allowlist), execution: `buildExecution.ts` (Build Execution prompt refused while blocked; PREVIEW READY is gated by `previewGateProblems` — pages.dev + noindex + clean seed scrub + passing checks, whatever Claude claims; a failed result never erases the last good build); column `outreach_leads.website_build`. ⛔ Redeploy `paid-client-hub` BEFORE the SPA when the shape changes — the old server drops unknown keys on save |
| Client-site enquiry forms | fn `site-enquiry`, `_shared/site-enquiry.ts` (`CLIENT_SITES` — recipient never from the request; only the production origin delivers, preview/localhost = test mode), table `site_enquiries` |
| Page generator | `src/lib/pagePlan.ts`, `pagePlanQueue.ts`, `qaAnswerGuard.ts`, fn `page-generator`, tables `client_pages`/`client_page_questions` |
| Warm reply drafter (Inbox) | `src/lib/warmLeadResearch.ts`, `src/lib/warmReply.ts`, `src/lib/serviceWindow.ts`, `src/components/WarmReplyAssistant.tsx`, fn `warm-lead-reply`, table `warm_lead_research` (`docs/warm-lead-reply.md`). ⛔ It drafts into the composer and NEVER sends; a model finding survives only if its quote is on the page |
| Sales dashboard / prospect workspace / sync | `src/pages/SalesDashboard.tsx`, fn `sales-performance`, `src/lib/salesPerformance.ts`, `LeadDetailDialog` tabs + `LeadCrmPanel` (`LeadWorkPanel`/`LeadHookPanel`/`LeadHistoryPanel`), `ProspectFacts`, `AddLeadDialog`, `ClientOnboardingStrip`, `src/lib/leadSync.ts`, `src/lib/onboardingLinkStatus.ts` + `useOnboardingLink`, table `onboarding_link_events`, SQL `lead_log_contact` / `lead_onboarding_link_event` (`docs/sales-readiness.md`) |
| Self-sourced prospect + paid handoff | `src/lib/handoffReadiness.ts` (READY / MISSING, edge-reachable), `src/lib/reportShare.ts` + `useReportShare`, `ProspectProfilePanel` + `LeadHookPanel` (propose → review → run) in `LeadCrmPanel`, `ClientHandoffCard`, `create-ai-audit` `finalHookPlan`, SQL `lead_set_profile` / `lead_report_link_event` / `website_identity`, table `report_link_events`, trigger `trg_outreach_leads_sold_by` (`docs/self-sourced-handoff.md`) |
| Voice-note script (Inbox, lead popup) | `src/lib/voiceNoteScript.ts`, `src/components/VoiceNoteScriptButton.tsx`, fn `voice-note-script`, table `voice_note_scripts` (`docs/voice-note-script.md`). ⛔ Never sends. The site research is `_shared/site-research.ts`, shared with `warm-lead-reply` — change it, redeploy BOTH |
| Hook audit score (3 q × 2 engines) | `src/lib/hookScore.ts` (`scoreHookRun`, one ruler for card/report/6-of-6/send guard), `hookVisibility.ts`, `src/components/HookVisibilityCard.tsx` (`docs/hook-audit.md`) |
| Cold Call Playbook (read-only) | `src/lib/coldCallPlaybook.ts`, `src/hooks/useColdCallPlaybook.ts`, `src/components/ColdCallPlaybook.tsx` (`docs/cold-call-playbook.md`) |
| Prospect Preview (outreach homepage + evidence card, never sends; NOT a Website Build) | `src/lib/prospectPreview/`, fn `prospect-preview`, `_shared/prospect-preview-shot.ts`, `src/components/ProspectPreviewPanel.tsx`, table `prospect_previews` + private bucket `prospect-previews` (`docs/prospect-preview.md`) |
| Mockup product (live) | fn `mockup`, `_shared/mockup-*.ts`, `src/pages/Mockups.tsx`, `src/mockup/templates/`, table `generated_sites`, bucket `mockup-assets` |
| Audit engine | fns `create-ai-audit`, `process-ai-audit-queue`, `extract-competitors`, `run-seo-scan`, `_shared/enrichment/*` |
| Harness | `scripts/run-tests.mjs`, `check-typecheck-baseline.mjs`, `check-edge-syntax.mjs`, `check-edge-undefined.mjs`, `check-cross-repo-sync.mjs` |

- Live operator app **`https://app.leadfinderos.com`** — this is PRODUCTION (`OPERATOR_APP_URL`,
  `src/config/operatorApp.ts`). `https://leadfinderos-next.pages.dev` is the same project's own
  address: a temporary legacy/fallback during the 2026-10-01 migration. Supabase Auth Site URL is
  the new domain; Redirect URLs hold both; edge secret `TEAM_APP_URL` holds the new domain. ⛔
  **`leadfinderos.pages.dev` is LEGACY: a stale Cloudflare project, not connected to `main`, that
  still answers 200 with an old bundle (same title, same sign-in page).** Never use it for any
  verification. A deploy check against it reports "not live" forever and has now misled TWO
  sessions into diagnosing a broken deploy that did not exist (2026-09-20, 2026-09-23). If a
  change looks "not live", first check which host you fetched. Supabase ref `ruusxpkkmwtljxxulhbq`; public site
  `https://findable.live` (separate repo `../findable-site`, Astro, deploys by `npm run deploy`).
- **Report URL has THREE resolving forms, all forever:** the SHORT `findable.live/r/<code>` (the one
  every template/email/Inbox now sends; `ai_audits.short_code`, unique, trigger-assigned + backfilled,
  6 unambiguous chars), the UUID `findable.live/report/<auditId>`, and the legacy name+8-hex slug.
  `reportSlug.ts` owns the alphabet/length/`shortReportUrl`; the resolver is in `render-audit-report`.
  Always-resolving raw upstream: `…/functions/v1/render-audit-report?slug=<code|auditId>`.
- `/playbook/:id` resolves an AUDIT id first, then a lead (ABLM has no lead row). Three entry points;
  the two AI-Audit ones are the only audit-keyed ones — keep at least one.
- **Cron jobs live only in the DB** (`cron.job`): `ai-audit-queue-run` (30 s), `bulk-jobs-sweep`,
  `whatsapp-queue-run`, `whatsapp-auto-replies-run`, `notify-onboarding-submit-run` (1 min each),
  `daily-cron-run` (02:00), `crawl-worker-run` (1 min; only fires while a crawl job runs), `notify-follow-ups-due`, `security-sweep-run`. (`instantly-poll-run` is gone — 13 jobs, read 2026-10-02.)
  Admin control centre (2026-09-30): `conversation-triage-run` (2 min), `weekly-visibility-run` (hourly :15),
  `performance-sync-run` (05:00), `business-summary-weekly` (Mon 06:30); each records last run / status in
  `admin_job_runs`. The
  `bulk_jobs.job_type` CHECK constraint is DB-only too. A rebuild from migrations loses them.

---

## 8. Known open problems — the short list (`docs/open-problems.md` has the long record)

- ✅ **The pre-sales final release is DEPLOYED** (2026-10-05, `main` `c5c4a1b5`; 10 migrations, 38 functions —
  `docs/pre-sales-certification/production-deployment.md`), followed the same day by Sales workspace v2, the
  opener contact guard and the simple Website Build. The live open-actions list is
  `docs/handover/12-OPEN-ACTIONS-AND-NEXT-PRIORITIES.md` (Apify cap still US$40, results copy, Stripe, Meta).
- 🔴 ⛔ **`whatsapp-status` must not be deployed until the Findable Meta App and its exact App Secret are ready**
  (live = v114, 2026-09-30; `WHATSAPP_APP_SECRET` unset) — the new code fails closed without it; the post-call
  reply matcher rides the same deploy, so it waits too. Skip it in any closure redeploy. Cutover order:
  `docs/handover/07-SECURITY-AND-PERMISSIONS.md`.
- ~~`client_error_reports` has no `message` column~~ — it exists (read back 2026-10-02).
- ✅ **The OpenAI 429 is CLEARED** (was open 2026-09-20 → 2026-09-21; it was a billing/spend-limit
  refusal, not a rate limit, fixed by Paul topping the key up). Verified live: competitor extraction
  succeeded on 8/8 cells and question generation no longer falls back to templates
  (`docs/measurement.md` §32). The hardening it prompted stays — audits finalise regardless
  (`_shared/run-finalise.ts`) and the receipt keeps 400 chars of the error.
- 🔴 **The Apify monthly cap is US$40 (read live 2026-10-05: US$29.04 used, cycle ends 16 Oct)** — Paul's
  decision is ~US$150 and raising it is HIS manual action. Prospecting stops at 85%, client work at 95%, and
  **at 100% every audit question and SEO scan stops, paying clients included** (§4,
  `docs/handover/08-COSTS-BUDGETS-LIMITS.md`). Check the live cap before any big Discovery run.
- `classifySource` grades every `.org` as authority (report accuracy).
- A 3-run measurement repeats only 20 questions when the set is longer (`BASELINE_MAX_QUESTION_COUNT`
  clamp on repeats) — a spend decision, not a code one.
- The AI Audit list reloads its whole dataset every 5 s while a run drains; paging the LIST is owed.
- `uk_towns` lacks the major cities; the corrected BUA22 insert is parked (gate switches on for the
  biggest markets the day it runs).
- `run_number` is a read-then-write with no unique index — the stagger stays sequential until it has one.
- Nothing sends the four-week results by WhatsApp (email only); the email itself waits on copy approval.
- ~~The gate is red on `origin/main` itself (2026-09-22)~~ — resolved: 268/268 green on 2026-10-02 (§0).
- Two stranded free checks may still need the card's resend pressed.
- `FINDABLE_ALLOWED_ORIGINS` may not contain `findable.live` — unfalsifiable and no longer depended on.
- Website clicks other than the report link are untracked, by design for now.
- ~~"the Cloudflare Pages auto-deploy is not running"~~ — **WRONG, corrected 2026-09-23.** That
  entry was written from a check against the LEGACY `leadfinderos.pages.dev` (§7). Production is
  `leadfinderos-next.pages.dev`, and it was serving current `main` (`3972fd42`): 77 of 79 chunks
  byte-identical to a local build once filename hashes are neutralised; the other two differ only
  by the baked-in Supabase URL/key (a local build has no `.env`) and by Windows CRLF line endings in
  the raw-imported `src/mockup/templates/*.html`. There is no deploy fault.
- ✅ **`findable.live/w/<code>` is LIVE** (verified 2026-10-02): a baseline code answers 200 with the pack and
  `noindex, nofollow, noarchive, nosnippet`, a Discovery code and an unknown code answer 404 "Welcome pack
  unavailable", `/r/<code>` is unchanged. The stale primary findable-site checkout's two dirty edits are already
  on `master` (`b9286ad`); nothing unique is left in it.
- **TPS/CTPS screening is POSTPONED by Paul (2026-10-05)** — a future compliance enhancement, not a launch blocker.
  Dormant groundwork only (`phone_tps_checks`, `src/lib/tpsCheck.ts`); no provider, no call block, not in Ready to
  Sell (`docs/salesperson-onboarding.md` §5).
- ⛔ **Salesperson paperwork (contractor agreement, privacy notice) is HANDLED EXTERNALLY BY PAUL — NOT ENFORCED IN
  LEADFINDEROS** (2026-10-05, migration `20261010140000`). Never part of Ready to Sell; never a salesperson-facing
  button, tick or upload; Team-page records are reference only. Ready to Sell = 18+, right to work, bank details, VAT,
  individual/company, start date, own login, current team guide (`docs/salesperson-onboarding.md` §0, §3). This does
  NOT touch the CLIENT v3 agreement-before-payment gate.
- Deep clean Phase 3, steps 4–10 are owed: `docs/deep-clean-phase3-plan.md` has the order, the file
  lists and Paul's decisions. (The `instantly-poll-run` cron is gone.) Step 5 is SPA-only but Paul's standing
  decision is to see the file list before any deletion; step 6 redeploys `stripe-webhook` and eight others.

---

## 9. Parked branches, other docs

- ⚠️ **The ARCHIVED old checkout `C:/Users/paulj/LeadFinderOS`** (the primary until 2026-10-05; the primary is now
  `C:/Users/paulj/LeadFinderOS-current`, §0) was ~453 commits behind `origin/main` and idle since
  2026-09-21 (audited 2026-10-02). **Its `CLAUDE.md` is stale: read `git show origin/main:CLAUDE.md`.** Class A:
  every tracked edit in it is already on main or superseded (its `whatsapp-inbound.ts` edit is for a chain
  deleted 2026-09-28 — never port it); the one unmerged test block was ported 2026-10-02. Before resetting it,
  KEEP the untracked `SQL_FOR_PAUL_*.sql` (each is the only copy; `client_error_message` and
  `unschedule_instantly_poll` look still pending). Never `git worktree remove` anything through it without
  unlinking `node_modules` junctions first. Do not delete the folder: ~95 older worktrees hang off its `.git`
  (2026-10-05) and those older worktrees junction to its `node_modules` (new ones use `LeadFinderOS-current`'s).
- **Do not merge:** `edge-check-gate` (`d3fd6713`), `findable-product-rename` (`a8365707`),
  `short-signup-url` (`c8896003`).
- `HANDOFF.md`, `ONBOARDING.md` (untracked) describe the deleted barber product — the best map of it,
  nothing else. `HANDOVER_NEXT.md` is from 2026-08-22 and stale. `HANDOVER_MOCKUP.md` (tracked,
  2026-09-11) is the live mockup product's record. There is no `DEPLOY.md`; §3 is the deploy rule.

---

## 10. The records — read the one for the thing you are about to touch

`docs/INDEX.md` maps every old § to its file. One line each:

| Touching… | Read first |
|---|---|
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
| Auth, roles, RLS, a lead read/write, any function a salesperson can reach, the Team page | `docs/multi-user.md` (+ `supabase/tests/multi-user-*.sql`, re-runnable, always rolled back) |
| The price, the guarantee, checkout, Stripe, the site origin, the report CTA | `docs/business-and-offer.md` (§1, §11, §12, §13, §13b, §26) |
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
| Why a trap rule exists — the incident | `docs/traps.md` (§4) |
| Why an architecture rule exists — the reasoning | `docs/architecture-rules.md` (§6) |
| The full open-problems record, incl. the WhatsApp cap model and the auth matrix | `docs/open-problems.md` (§8) |
| The long code map, the playbook documents | `docs/code-map.md` (§9) |
| The measured findings in detail | `docs/findings.md` (§5) |
| How things stood on 2026-09-09, the harness repair | `docs/state-of-play-2026-09-09.md` (§0) |
| The original §2 / §3 / §7 / §10 text | `docs/how-paul-works.md`, `docs/discipline-checklist.md`, `docs/parked-branches.md`, `docs/other-docs.md` |
| Website Build: fact edits / saves, service-area candidates, asset plan, Cloudflare modes, template fit, readiness | `docs/website-build-pilot-hardening.md` (+ the website-build-*.md phase records) |
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

**When you finish a piece of work:** write the record into the matching `docs/` file (or a new one,
added to `docs/INDEX.md`), and put here only the rule it taught or the pointer to it.
