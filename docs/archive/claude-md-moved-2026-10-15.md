# Moved out of CLAUDE.md on 2026-10-15 (verbatim — nothing deleted)

CLAUDE.md keeps every rule. What is here is reference and history: path rows that carry no rule, resolved
open problems and the old-checkout audit detail Section numbers are CLAUDE.md's.

## From §7 — code-path rows with no rule in them (the rows that carry a rule stayed in CLAUDE.md)

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
| Sales pre-call checks ("Check before calling") | `src/lib/salesCheck.ts`, `_shared/sales-check.ts`, fn `sales-prospect-check`, tables `sales_check_batches` / `_items`, `SalesCheckPanel.tsx`, `SalesChecksAdminCard.tsx`, `callCardAudit` (`coldCallPlaybook.ts`) |
| Free check | `_shared/free-check-lead.ts`, `free-check-audit.ts`, `free-check-result.ts`, `same-business.ts`, `src/lib/freeCheckProgress.ts`, fns `findable-onboarding`, `submissions`, `notify-onboarding-submit` |
| Town | `src/lib/townVerdict.ts`, `_shared/place-details.ts`, `place-town.ts`, `place-resolve.ts`, `town-distance.ts`, fn `backfill-lead-towns`, table `uk_towns` |
| Serve gate | `src/lib/serveGate.ts` (+ findable-site mirror) |
| Multi-user / roles | `src/lib/roleRules.ts`, `src/lib/access.ts` (matrix), `src/components/RequireAccess.tsx`, `_shared/access.ts`, `src/lib/salesCrm.ts`, `src/hooks/useSalesCrm.ts`, `LeadCrmPanel`, `AvailableToClaim`, `src/lib/leadRpc.ts` + `salesPatchPlan.ts`, pages `Team`/`SetPassword`, fn `admin-users` (team actions), migrations `20260927100000…100400` + `140000`, view `sales_leads`, tables `team_members`/`lead_activity` |
| Sales Team Board | `src/lib/teamBoard.ts`, `src/hooks/useTeamBoard.ts`, `src/components/team/` (TeamBoard, TeamComposer, TeamOversight), `adminMetrics.delegation`, migration `20261001200000`, test `supabase/tests/sales-team-board.sql` |
| Dashboard (older, now unrendered) | `src/hooks/useDashboardMetrics.ts` (still the `FOUNDER_PRICE_GBP` sync source), `useCampaignStats.ts`, `src/lib/templateAttribution.ts`, `armComparison.ts`, `realSend.ts`, `leadPayment.ts`, `dashboardTasks.ts`, `deliveryCockpit.ts` |
| Coverage / niche | `src/pages/Coverage.tsx`, `NichePanel.tsx`, `src/lib/nicheView.ts`, `coverageState.ts` (`foundAddedByPair`), `websiteStatusClass.ts`, fns `coverage`, `market-view` |
| Page generator / page plan / review replies | Inside Paid Clients since 2026-10-06 (Tools tab + each client's Pages & reviews; old URLs redirect): `src/lib/paidClientTools.ts` (every address), `src/components/clientTools/`, `src/lib/pagePlan.ts`, `pagePlanQueue.ts`, `qaAnswerGuard.ts`, fns `page-generator`/`review-reply`, tables `client_pages`/`client_page_questions` (`docs/operator-design-consistency.md`) |
| Operator look (dialogs, cards, chips) | `src/components/salesDash/primitives.tsx` (TONE, the leaf), `src/components/operator/ui.tsx` (DialogHero, ToneChip, Callout, SubSection, ActionBar, EDGE) — both LEAVES (no auth/client imports); `Panel` stays in `salesDash/ui.tsx` |
| Sales dashboard / prospect workspace / sync | `src/pages/SalesDashboard.tsx`, fn `sales-performance`, `src/lib/salesPerformance.ts`, `LeadDetailDialog` tabs + `LeadCrmPanel` (`LeadWorkPanel`/`LeadHookPanel`/`LeadHistoryPanel`), `ProspectFacts`, `AddLeadDialog`, `ClientOnboardingStrip`, `src/lib/leadSync.ts`, `src/lib/onboardingLinkStatus.ts` + `useOnboardingLink`, table `onboarding_link_events`, SQL `lead_log_contact` / `lead_onboarding_link_event` (`docs/sales-readiness.md`) |
| Self-sourced prospect + paid handoff | `src/lib/handoffReadiness.ts` (READY / MISSING, edge-reachable), `src/lib/reportShare.ts` + `useReportShare`, `ProspectProfilePanel` + `LeadHookPanel` (propose → review → run) in `LeadCrmPanel`, `ClientHandoffCard`, `create-ai-audit` `finalHookPlan`, SQL `lead_set_profile` / `lead_report_link_event` / `website_identity`, table `report_link_events`, trigger `trg_outreach_leads_sold_by` (`docs/self-sourced-handoff.md`) |
| Hook audit score (3 q × 2 engines) | `src/lib/hookScore.ts` (`scoreHookRun`, one ruler for card/report/6-of-6/send guard), `hookVisibility.ts`, `src/components/HookVisibilityCard.tsx` (`docs/hook-audit.md`) |
| Mockup product (live) | fn `mockup`, `_shared/mockup-*.ts`, `src/pages/Mockups.tsx`, `src/mockup/templates/`, table `generated_sites`, bucket `mockup-assets` |
| Audit engine | fns `create-ai-audit`, `process-ai-audit-queue`, `extract-competitors`, `run-seo-scan`, `_shared/enrichment/*` |
| Harness | `scripts/run-tests.mjs`, `check-typecheck-baseline.mjs`, `check-edge-syntax.mjs`, `check-edge-undefined.mjs`, `check-cross-repo-sync.mjs` |

## From §8 — resolved / corrected items

- ✅ **The pre-sales final release is DEPLOYED** (2026-10-05, `main` `c5c4a1b5`; 10 migrations, 38 functions —
  `docs/pre-sales-certification/production-deployment.md`), followed the same day by Sales workspace v2, the
  opener contact guard and the simple Website Build. The live open-actions list is
  `docs/handover/12-OPEN-ACTIONS-AND-NEXT-PRIORITIES.md` (Apify cap still US$40, results copy, Stripe, Meta).
- ~~`client_error_reports` has no `message` column~~ — it exists (read back 2026-10-02).
- ✅ **The OpenAI 429 is CLEARED** (was open 2026-09-20 → 2026-09-21; it was a billing/spend-limit
  refusal, not a rate limit, fixed by Paul topping the key up). Verified live: competitor extraction
  succeeded on 8/8 cells and question generation no longer falls back to templates
  (`docs/measurement.md` §32). The hardening it prompted stays — audits finalise regardless
  (`_shared/run-finalise.ts`) and the receipt keeps 400 chars of the error.
- ~~The gate is red on `origin/main` itself (2026-09-22)~~ — resolved: 268/268 green on 2026-10-02 (§0).
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

## From §9 — parked branches, other docs (original text)

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

The §10 records lookup table moved to `docs/records-lookup.md` (it is live reference — add new rows there).
