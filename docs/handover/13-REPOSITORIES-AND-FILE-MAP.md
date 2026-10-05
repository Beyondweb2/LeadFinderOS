# 13 — Repositories and file map

*Practical map, not an inventory. The long form is CLAUDE.md §7 and `docs/code-map.md`.*

## Repositories (GitHub owner `Beyondweb2`)

| Repo | Local path | What it is | Ships how |
|---|---|---|---|
| **LeadFinderOS** | `C:\Users\paulj\LeadFinderOS-current` (PRIMARY) + `C:\Users\paulj\LeadFinderOS-wt\<task>` worktrees; `C:\Users\paulj\LeadFinderOS` = ARCHIVE (stale, keep) | the operator app + Supabase backend (functions, migrations) | `main` → Cloudflare Pages `leadfinderos-next` (app.leadfinderos.com); edge functions by hand |
| **findable-site** | `C:\Users\paulj\findable-site` (stale, dirty) + `C:\Users\paulj\findable-site-wt\main-mirror` (clean `origin/master`) | the public site findable.live (Astro): home, onboarding, checkout start, terms/refunds, FAQ | **no CI** — build + `wrangler pages deploy … --branch=master` from a clean worktree; default branch `master` |
| findable-directory | `C:\Users\paulj\findable-directory` | a separate SSR directory site reading the same Supabase (2 deployed functions belong to it) | its own deploy |
| MCLocksmiths-New | `C:\Users\paulj\MCLocksmiths-New` | MCL's rebuilt site; **the source of the only Website Build template** (pinned commit) | engagement closed — never push to its production |
| MCLocksmiths | `C:\Users\paulj\MCLocksmiths` | superseded first MCL build (noindexed) | reference only |
| BS4ElectricalServices | `C:\Users\paulj\BS4ElectricalServices` | Website Build pilot (Astro) | push `preview` only; never `live` |
| ablm-site | `C:\Users\paulj\ablm-site` | ABLM (homepage proof client) | needs Wix access |

Shared-code contract between the two main repos: offer constants and some rules exist in BOTH repos and
`scripts/check-cross-repo-sync.mjs` (in both) fails the build on drift — change one, change the other.

## LeadFinderOS — top level

| Path | What lives there |
|---|---|
| `src/` | the React app (Vite + TypeScript + Tailwind + shadcn) |
| `src/pages/` | one file per route (`App.tsx` maps them) |
| `src/components/` | UI; `salesDash/ui.tsx` is the one dashboard design system |
| `src/lib/` | **the rules** — pure TypeScript, many imported by edge functions too (relative imports with explicit `.ts` only) |
| `src/config/operatorApp.ts` | `OPERATOR_APP_URL` (one copy) |
| `supabase/functions/<name>/` | 68 edge functions (Deno) |
| `supabase/functions/_shared/` | server modules shared by functions |
| `supabase/migrations/` | 290 SQL files — applied one at a time by hand; a file existing ≠ live |
| `supabase/config.toml` | every function's `verify_jwt` |
| `supabase/tests/*.sql` | re-runnable SQL security tests, always rolled back |
| `scripts/` | the test harness (`run-tests.mjs`, ~313 suites), checks (`check-*.mjs`), `verify-live.mjs`, `site-quality-gate.mjs`, `qa-simulate-payment.ts`, `qa-simulate-inbound.ts`, `rls-isolation-probe.mjs` |
| `functions/` | two legacy Cloudflare Pages functions (`a/[slug]`, `r/[slug]`) |
| `docs/` | session records by topic; `docs/INDEX.md` maps them |
| `docs/pre-sales-certification/` | the 2026-10-04/05 launch certification, fixes, deployment, Sales v2, Website Build simple |
| `docs/handover/` | **this handover** |
| `CLAUDE.md` | the rules — read first every session (always read it from `origin/main`) |

`npm run check` = typecheck vs a 9-error baseline list + edge syntax + edge undefined names + import graph + build + all
tests. `node scripts/check-import-graph.mjs --reached-by <file>` = which functions to redeploy.

## Who owns what (the files to read first)

| Area | Rules (`src/lib`) | Server | UI |
|---|---|---|---|
| **Offer / prices / guarantee words** | `findableOffer.ts` (constants own the words) | `_shared/offer-price.ts`; findable-site `src/lib/site.ts` | — |
| **Sales workflow** | `salesCrm.ts` (`CALL_OUTCOMES`, Next Action options), `leadState.ts` (`salesStateOf`, `CONVERSATION_OUTCOMES`, `outcomePlan`), `leadOutcome.ts`, `nextActionView.ts`, `coldCallPlaybook.ts` (`callCardAudit`), `salesExplainer.ts` (talking points), `salesStyle.ts` (sales words) | SQL `lead_log_contact`, `lead_set_follow_up`, `lead_set_profile`, `sales_add_lead`; fn `sales-performance` | `LeadDetailDialog.tsx` (Call/Details/Close/History), `ColdCallPlaybook.tsx`, `pages/Outreach.tsx`, `pages/Index.tsx` (Find Leads), `pages/SalesDashboard.tsx` |
| **Campaigns** | `campaignStats`, `campaignDisplayName` | migrations `20261006120000_campaign_ownership`, `20261008100000_sales_workspace_v2` (`campaign_new/update/archive/launch`), `20261008110000_opener_contact_guard` (`opener_contact_block`) | `CampaignPicker.tsx`, `campaigns/CampaignEditDialog.tsx`, `CampaignsButton.tsx`, `pages/Campaigns.tsx` |
| **Cold-opener safety / WhatsApp** | `coldOutreach.ts` (`CONTINUATION_TEMPLATES`, `isColdOutreachTemplate`), `src/types/outreach.ts` (`WHATSAPP_TEMPLATES`), `templateBodies.ts`, `sendWindow.ts`, `marketingConsent.ts`, `conversationState.ts` | fns `send-whatsapp-message`, `process-whatsapp-queue`, `whatsapp-status` (HELD), `_shared/whatsapp-send.ts`, `_shared/whatsapp-inbound.ts` | `pages/Inbox.tsx` |
| **Audit budgets / cost guard** | `auditBudget.ts` (pools), `salesCheck.ts`, `protectionLimits.ts`, `apiCostAccounting.ts` | `_shared/audit-budget.ts`, `_shared/sales-check.ts`, `_shared/protection.ts` (`guardAction`), fn `sales-prospect-check`, SQL `guard_action` | `SalesCheckPanel.tsx`, `pages/AdminApiUsage.tsx`, `SalesChecksAdminCard.tsx` |
| **Audit engine** | `auditKind.ts`, `auditQuestionCounts.ts`, `seedGuard.ts`, `hookScore.ts` | fns `create-ai-audit`, `process-ai-audit-queue`, `extract-competitors`, `run-seo-scan`, `_shared/enrichment/*` (Apify) | `pages/AiAudit.tsx` |
| **AI baseline / Discovery / replay** | `baselineRecommendation.ts`, `baselineMix.ts`, `baselineQuality.ts`, `serviceScope.ts`, `measurementHealth.ts`, `measurementCompare.ts`, `namedSignal.ts`, `remeasureDue.ts`, `discoveryOpportunity.ts` | `_shared/baseline-discovery.ts`, `_shared/audit-baseline.ts` (`advanceBaseline`, `fireDueRemeasures`, freeze gate), fn `paid-baseline` | `pages/PaidBaselineSetup.tsx`, `pages/Baseline.tsx`, `pages/CompareMeasurements.tsx` |
| **Results emails** | `remeasureResults.ts` (`REMEASURE_RESULTS_COPY_APPROVED`, decision), `remeasureResultsHtml.ts` | `_shared/remeasure-results.ts`, fn `render-remeasure-results` | — |
| **Client report** | `auditReport.ts` (`buildReportData`, `classifyWinnability`), `aiAuditReportHtml.ts`, `measuringState.ts`, `reportSlug.ts` | fn `render-audit-report` | findable.live/r/… |
| **Quick Close** | `quickClose.ts` (`closeFlow`, `withRoute`, the gate) | fn `quick-close` → fn `findable-checkout` | `QuickCloseDialog.tsx` (`QuickClosePanel`), Close tab in `LeadDetailDialog.tsx` |
| **Payments** | `paymentState.ts`, `findableOffer.ts` (`serviceRouteFromRow`), `commission.ts`, `serviceEnd.ts` | fn `stripe-webhook`, `_shared/payment-state.ts`, `_shared/delayed-subscription.ts`, `_shared/payment-ledger.ts`, `_shared/earnings.ts` | — |
| **Paid clients / delivery** | `firstContact.ts`, `handoffReadiness.ts`, `deliveryStage.ts`, `agreementRoute.ts`, `welcomePackData.ts`, `clientFacts.ts`, `siteServiceTruth.ts` | fn `paid-client-hub`, `_shared/client-setup.ts`, fn `client-agreement`, fn `render-welcome-pack` (`_shared/welcome-pack-render.ts`) | `pages/PaidClients.tsx`, `pages/ClientHub.tsx`, `ClientSetupCard.tsx` |
| **Website Build** | `simpleBuild.ts` (the simple flow), `websiteBuildState.ts`, `websiteTemplates.ts` (the one template), `buildExecution.ts`, `websiteQuality.ts`, `websiteBuildStandard.ts`, `siteGate.ts`, `intentOwnership.ts`, `websiteLaunch.ts`, `claimRules.ts` | fn `paid-client-hub` (saves), fn `site-enquiry`, `scripts/site-quality-gate.mjs` | `SimpleWebsiteBuild.tsx`, `pages/WebsiteBuild.tsx` (`?view=advanced`) |
| **Page generator (Optimise)** | `pagePlan.ts`, `pagePlanQueue.ts`, `qaAnswerGuard.ts` | fn `page-generator` | `pages/PageGenerator.tsx`, `pages/PagePlanQueue.tsx` |
| **Permissions** | `access.ts` (pages + `leadPermissions`), `roleRules.ts`, `leadRpc.ts` + `salesPatchPlan.ts` | `_shared/access.ts`, `_shared/operator-auth.ts`, view `sales_leads`, RLS in migrations `20260927100000…`, `20261006010000_templates_owner_only` | `RequireAccess.tsx`, `pages/Team.tsx` |
| **Admin dashboard** | `adminMetrics.ts`, `adminControl.ts`, `reportingPeriod.ts`, `metricExclusions.ts` | fn `admin-overview`, `_shared/admin-overview-load.ts` | `pages/Dashboard.tsx` |
| **What's New** | `whatsNew.ts` | — | sidebar footer card |

## findable-site — where to look

`src/lib/site.ts` (offer / contact constants, synced), the onboarding flow (`OnboardingFlow`), `/terms`, `/refunds`, FAQ,
`src/lib/analytics.ts` (privacy-listed fields only), `workers/www-redirect/`, `scripts/check-cross-repo-sync.mjs`.
Record: `docs/findable-site.md`.
