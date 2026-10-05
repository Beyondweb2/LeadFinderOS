# Pre-sales — final integration and certification

- **Date:** Monday 5 October 2026. **Branch:** `integration/pre-sales-final` (LeadFinderOS), cut from
  `integration/pre-sales-wave1` `4cd1a466` (proved equal to `origin` before branching), worktree
  `C:/Users/paulj/LeadFinderOS-wt/pre-sales-final`. findable-site: **no change needed** — its
  `integration/pre-sales-wave1` (`978c806`) is the matching branch; no `integration/pre-sales-final` was made there.
- **Not merged to main. Not deployed.** No migration applied, no edge function deployed, no Stripe / Meta / Apify /
  vault change, no message or email sent, no paid check run. Live SQL was **read-only SELECTs** (schema and
  state checks, listed in §11). Ronnie and MCL were read, never written.
- Supersedes the deploy lists in `wave1-integration.md` §8 / §12 and `fixes-07-sales-bulk-audit.md` §11.

---

## Verdict

### READY FOR CONTROLLED DEPLOYMENT

No blocking code defect remains. Two genuine defects found by this session were fixed and tested (§3). What is
left is manual pre-deploy work (§13), not code. `whatsapp-status` stays held (§12).

---

## 1. Branches and commits

| Order | What | Commit |
|---|---|---|
| base | `integration/pre-sales-wave1` (WS-1…WS-6 + wave-1 fixes; record `wave1-integration.md`) | `4cd1a466` |
| 1 | merge `fix/07-sales-bulk-audit` (WS-7: `769e5edb`, `d231c9e6`, `32214975`), `--no-ff` | `740443e3` |
| 2 | final fixes, results-email wording, final tests, this record | the commit after `740443e3` (see `git log`) |

WS-7 was cut from the same wave-1 commit, so the merge was textually clean (39 files). It was then read in its
combined form, not trusted (§2).

## 2. WS-7 integration review (combined code)

| Area | Combined result |
|---|---|
| `process-ai-audit-queue` | WS-4's budget-pool code and WS-7's removal of both auto-"Not interested" rules sit in different blocks. The queue now only READS `not_interested` (to refuse a send). No edge function writes that status (swept). |
| `salesCheck` ↔ Wave 1 client rules | Bulk-check eligibility, Quick Close's `quickCloseClosedRefusal`, checkout and `isClientLead` agree on every client shape incl. Ronnie- and MCL-shaped (ended) and refunded (§4 A). Live: all 3 ended leads carry money, so none can slip through as a prospect. |
| Budget | A bulk check is `audit_purpose = audit` → prospecting pool; the WS-7 allowance gate runs before the pool and the guard (§6). |
| `protectionLimits` / `security-admin` | `sales_check` added to the defaults; `withDefaultActions` lets the Security panel save before the SQL lands. `_shared/protection.ts` imports only unchanged functions from it → the 47 functions it reaches need no redeploy for it. |
| Outreach / call workspace | The "Check before calling" button and panel are sales-only; "Open the next ready lead" opens WS-5's call screen, whose top line is the same `callCardAudit` helper. |
| Migrations | WS-7's one file touches none of the objects Wave 1's nine own (tested). |
| Tests | `fake-supabase.ts` additions keep every older suite green. |

## 3. Defects found and fixed in this session

1. **A client's "not offered" entry starting with a negative never matched** (WS-4 `serviceScope.ts`, used by the
   baseline question checks AND, via `siteServiceTruth`, by Website Build and the page generator). Every word of a
   negative must appear in the question; "No new boilers" kept "no", "We don't fit new boilers" kept "not" and
   "fit". Result: for a client who said they don't install boilers, "New boiler installation" questions read as
   their confirmed "Boiler repair" service — into the baseline and onto a planned page. **Fix:** strip the
   client's negation and verbs from the LABEL only (`NOT_OFFERED_PREAMBLE`; new-work verbs are carried by the
   existing `newWork` flag). Repairs and servicing stay in scope (wave-1 rule kept). Tested on three wordings.
2. **Checkout's "already a client" test read only the money and three statuses.** An ended or refunded client
   whose amount had been cleared could have started a new Stripe session. Not reachable on today's data (0 such
   rows), but it was a second copy of the closed-client rule. **Fix:** `findable-checkout` refuses with
   `quickCloseClosedRefusal` (money, paid-or-beyond, refunded, ended) — one rule with Quick Close.

Also applied (Paul's decisions, not defects): the results-email wording (§8).

## 4. End-to-end certification

Proved by the suites named, all passing on the combined tree (310 / 310), plus the new `pre-sales-final` suite.

**A. Salesperson isolation — PASS.** Own active prospects only, by `assigned_to_user_id` (never `user_id`).
Another rep's, Paul's (unassigned or his), clients, archived and non-existent leads are refused server-side, with
"not yours" answered first (no existence oracle). (`sales-prospect-check`, `role-rules`, `sales-shared-workflow`,
`campaign-ownership`, `crawl-check-access`, `offboarding-role-removal`, `pre-sales-final` §1–2.)

**B. Outreach → audit → call — PASS.** Select own leads → dialog (research only) → progress → ready → call
screen → Log call / Next Action / Quick Close. The engine writes only its two tables, `lead_activity` and (via the
crawl) `lead_crawl_checks`: no email, no WhatsApp, no payment link, no Interested, no Not interested, no Next
Action. The import closure has no sender. (`sales-prospect-check` §8 sweep, `pre-sales-final` §3.)

**C. Bulk rules — PASS.** 30 fresh checks / rep / day (`DEFAULT_PROTECTION_LIMITS.actions.sales_check.per_day`,
migration adds `{"paid":true,"per_day":30}` only if absent); 20 / batch, refused above (never sliced); duplicate
ids collapse; reused results free and not counted; recent results reused (14 days; "check again" only ≥ 2 days);
double submit = same batch (unique request id); two tabs / overlapping batches → one active batch per rep; three
concurrent advances → one check per lead; refresh keeps the job (state is the database's); reassignment / archive
stop future spend and hide the result; results attach to their own lead; another rep cannot read or stop a batch;
prospecting pool only; a client baseline and re-measure are untouched. End to end: a full 20, then 10 more, the
31st refused, a cached lead still reused, exactly 30 paid checks and 30 guard rows.

**6/6 status behaviour — PASS.** Single check: the audit queue has no status rule (the writer module is deleted);
bulk: a 6/6 lead row is byte-identical afterwards (status, star, Next Action), no follow-up. The call card and the
panel read **"Strong AI visibility — named in all 6 answers"**; WS-5's call script on 6/6 says "it did name you,
which is good" and makes no "AI missed you" claim; every audit-based WhatsApp template is still refused for that
lead. Manual Not interested still works (outcome plan sets the status and clears the Next Action; both roles).
Old leads moved by the retired rule were not restored.

**D. Call workspace — PASS.** Identity-first opener ("Hi, is that … ? It's Sam from Findable."), the audit
finding, the 6/6 line, Build / Optimise per website (no site → Build only), six-week billing, the one guarantee
line shared with Quick Close, archived leads absent, stale Next Action protection (`_expected`).
(`call-workspace`, `pre-sales-final` §3, §5; visual §9.)

**E. Quick Close — PASS.** Build reaches 5/5 and payment-ready; Optimise reaches ready. Current valid link only,
expired links hidden with "Create fresh payment link", double click / tab safe (claim), ended / already-paid
refused for every mode, email only to a known address, WhatsApp only inside the 24-hour window, Copy recorded as
copied (never "sent"), route locked after payment / agreement. (`quick-close`, `quick-close-links`,
`quick-close-events-locked`, `service-route-terms`, `wave1-integration`.)

**F. Payment → Paid Client — PASS.** One payment record, one client, duplicate webhook replays byte-identical,
no duplicate subscription (claim), original payment date kept, ended stays ended (Ronnie-shaped fixture: no
link, no stamp, no first contact), no post-end commission, none projected. (`payment-client-state`,
`wave1-integration`, `payment-confirm`, `payment-email-guard`.)

**G. Handoff — PASS.** Paul owns first contact, owed only from the activation stamp written by the new webhook
(no calendar cutoff; historical clients never "overdue"); the seller sees the same due day ("by Wed 7 Oct");
Build clients get no false Website / Website-access requirement; Optimise still needs real site / access.

**H. AI service truth — PASS (after fix 1).** Client-confirmed > Sales notes > never Discovery (`resolveServiceTruth`
has no Discovery input). Unsupported and not-offered services blocked; approved towns only; generated questions
never become business truth. (`ai-measurement-truth`, `discovery-not-baseline`, `pre-sales-final` §6.)

**I. Final 20 — PASS.** Exactly 20, realistic wording, two required core questions, service repetition capped,
branded questions refused without a reason, unsupported services / unapproved towns refused, human approval
required, the approved set freezes. (`ai-measurement-truth`, `ai-measurement-reliability`, `question-*`.)

**J. Baseline — PASS.** 20 × 3 runs × ChatGPT + Gemini = 120; complete only at 120 / 120 or an explicitly
accepted partial with a reason; missing answers are never invented; retries only the failed rows; no second
baseline. (`ai-measurement-reliability`, `paid-baseline-*`, `balanced-baseline`.)

**K. Budget separation — PASS.** Prospecting exhausted (and Apify past 85%) does not block a baseline or a
re-measure; other-client work at its cap does not consume guarantee capacity; each pool counts only its own
ledger rows. Configured values in §6.

**L. Remeasurement — PASS.** Exact frozen questions; ended / refunded clients excluded (`.is("service_terminated_at",
null)` — already live on `main`, so Ronnie's 13 Oct replay cannot fire); one replay per lead; incomplete results
held; matched-question comparison; engine imbalance holds the result; results email claim-first (sends once);
manual send-results safe. Sending stays held (`REMEASURE_RESULTS_COPY_APPROVED = false`).

**M. Results email — wording applied, held.** Exact copy §8.

**N. Website Build — PASS.** WS-4 truth wired into WS-6 (only client-confirmed services seed pages; with fix 1 a
"no …" negative now actually blocks); Build-only production; Optimise blocked; domain ownership; preview gate;
enquiry form registry; claims; client assets; location notes; corrections; meta description; CTA; production
verification. (`website-build-*`, `wave1-integration`.)

**O. Welcome Pack — PASS.** Build: "We own the website and our work until your final payment." Optimise: "Your
website is always yours. We will never take it offline." SEO grade is its own section ("separate from your AI
visibility"), Before only, "After — not measured yet"; no promised grade; the AI guarantee separate.

**P. Security — PASS.** Cross-rep isolation, Paul's saved templates private (`templates-privacy`), cross-lead
crawl / run refused, test-account exclusions (`qa-safety`), client separation, all server-side. The fail-closed
webhook code passes its tests (`whatsapp-webhook-gate`) and lives in `whatsapp-status` only — held.

**Q. Closed / historical clients — PASS.** Ronnie (live: ended 2026-10-04, £49.99, `payment_received`) and MCL
(ended 2026-10-03, £99) are skipped by the bulk check as clients with zero provider calls and zero writes; no
subscription, re-measure, replay regression or reopening path exists for an ended client.

## 5. Mutation tests (each protection broken on purpose; file restored byte-for-byte after)

| Mutation | Killed by |
|---|---|
| Bulk check ignores assignment (cross-rep) | `sales-prospect-check`, `pre-sales-final` |
| Role rule lets a rep work any lead | `role-rules`, `crawl-check-access`, `pre-sales-final` |
| The queue writes "not_interested" again (6/6) | `sales-prospect-check`, `hook-audit-adaptive`, `pre-sales-final` |
| Prospect checks charged to the guarantee pool | `pre-sales-final`, `sales-prospect-check`, `ai-measurement-reliability` |
| Guarantee pool counts every pool's spend | `pre-sales-final`, `ai-measurement-reliability` |
| An ended engagement not treated as closed | `pre-sales-final`, `wave1-integration` |
| Checkout drops the closed-client rule | `pre-sales-final` |
| An unconfirmed service vouches for a page | `pre-sales-final`, `wave1-integration` |
| The client's "no" kept as a service word | `pre-sales-final` |

**9 / 9 killed.**

## 6. Rules and configured values

| | Value | Where |
|---|---|---|
| Fresh prospect checks per rep per day | **30** (admin-configurable; malformed = 30, never unlimited; 0 allowed) | `protectionLimits.ts`, migration #10 |
| Leads per batch | **20**, refused above | `SALES_CHECK_BATCH_MAX` |
| Reuse window | 14 days; "check again" only for results ≥ 2 days old; reuse is free | `salesCheck.ts` |
| Pools (rolling 24 h, USD) | guarantee **$10**, other client work **$8**, prospecting **$12** | `POOL_DAILY_CAP_USD` |
| Apify reserve | prospecting stops at **85%**, client at **95%**, guarantee runs to Apify's own cap (**100%**) | `APIFY_RESERVE_PCT` |
| One fresh check | ≈ **US$0.0331** (measured average of 579 hook runs) | `OUTREACH_AUDIT_EST_USD` |
| Recommended Apify monthly cap | ≈ **US$150** — manual, not changed here | §13 |

At 30 checks a day: one rep ≈ US$0.99/day (≈ US$22 a month of 22 working days); five reps ≈ US$109/month, which
is near the prospecting line (85% of US$150 ≈ US$127). All figures USD.

## 7. Commercial terms (as coded and rendered)

- **Build:** £99 at sign-up; £99/month from 42 days (six weeks) later; **12 payments**, 12-month minimum; Findable
  builds, hosts and manages the new site; it becomes the client's after the final payment.
- **Optimise:** £99 at sign-up; £99/month from 42 days later; **6 payments**, 6-month minimum; the client always
  owns their existing site; Findable never takes it offline.
- **Guarantee:** "We improve AI visibility or you get your money back." (`QUICK_CLOSE_PROMISE` = `GUARANTEE_HEADLINE`),
  followed by `FINDABLE_GUARANTEE` verbatim. No ranking, citation or recommendation promise anywhere.

## 8. The four-week results email — exact final copy (HELD for Paul's approval)

Rendered from `resultsEmailParagraphs` on this branch (fixture name and dates; the real email fills the client's).
Paul's decisions applied: no "every week"; the actual monthly service named; signed exactly "Paul, Findable";
the guarantee versions name **no** upcoming monthly payment; no causal claim. `REMEASURE_RESULTS_COPY_APPROVED`
stays `false` — nothing sends.

**1. Clear improvement (Build client)**

> Subject: Your four-week results — Calder Plumbing and Heating
>
> Hi,
>
> Four weeks ago we measured how often ChatGPT and Gemini named Calder Plumbing and Heating when people asked the questions your customers ask in Halifax. We have just asked the same 20 questions again, on the same engines.
>
> Before: named in 12 of 120 answers (10%).
>
> After: named in 27 of 120 answers (23%).
>
> The full before-and-after, question by question, is here: https://findable.live/r/ABC123
>
> Your number has gone up: on the same questions and the same AI tools, you were named more often than four weeks ago, by more than the 5-point swing we see between repeat checks. We keep the work live and keep measuring.
>
> Your first monthly payment of £99 is on 16 November 2026. The monthly covers a new page each month, a monthly check of your AI visibility, adjustments as we learn, and hosting the website we built for you, for the rest of your 12-month minimum term. That first monthly payment is payment 2 of 12, counting the £99 you paid at sign-up, and nothing is charged after the 12th.
>
> Paul, Findable

*Optimise client:* the monthly paragraph reads "…The monthly covers a new page each month, a monthly check of
your AI visibility, and adjustments as we learn, for the rest of your 6-month minimum term. That first monthly
payment is payment 2 of 6, … nothing is charged after the 6th." (No hosting claim — they keep their own site.)
With no trialing subscription on record, the paragraph is left out.

**2. Near-flat / no movement (inside the 5-point swing)**

> Subject: Your four-week results — Calder Plumbing and Heating
>
> Hi,
>
> Four weeks ago we measured how often ChatGPT and Gemini named Calder Plumbing and Heating when people asked the questions your customers ask in Halifax. We have just asked the same 20 questions again, on the same engines.
>
> Before: named in 12 of 120 answers (10%).
>
> After: named in 15 of 120 answers (13%).
>
> The full before-and-after, question by question, is here: https://findable.live/r/ABC123
>
> Your number has not gone up. The change is inside the 5-point swing we see between repeat measurements with no work done, so we count it as no movement.
>
> That means the guarantee applies. If that number has not gone up, email us within 14 days of your results and we'll refund your £99. A valid claim also ends your monthly payments: if the first one has not been taken yet, it never is, and if it has already been taken, we refund it as well.
>
> Paul, Findable

**3. Guarantee applies (the number fell)**

> Subject: Your four-week results — Calder Plumbing and Heating
>
> Hi,
>
> Four weeks ago we measured how often ChatGPT and Gemini named Calder Plumbing and Heating when people asked the questions your customers ask in Halifax. We have just asked the same 20 questions again, on the same engines.
>
> Before: named in 20 of 120 answers (17%).
>
> After: named in 8 of 120 answers (7%).
>
> The full before-and-after, question by question, is here: https://findable.live/r/ABC123
>
> Your number has not gone up.
>
> That means the guarantee applies. If that number has not gone up, email us within 14 days of your results and we'll refund your £99. A valid claim also ends your monthly payments: if the first one has not been taken yet, it never is, and if it has already been taken, we refund it as well.
>
> Paul, Findable

The sentence "If that number has not gone up, email us within 14 days…" and the payment-two sentence are locked
to findable.live (/refunds) and cannot be reworded here. **Consequence for Paul:** in versions 2 and 3 the email
is no longer an early billing notice for a client who does not claim; the date is still in Stripe's own
reminder and the monthly-starting email.

## 9. Visual QA

A throwaway Vite harness (deleted before commit) rendered the **real** components with fixture data ("ZZ QA …"),
every network module mocked (no Supabase, no edge call, nothing sent); the client documents were rendered by
their real renderers. Headless Edge captured 1366 px and 390 px; this session looked at the screenshots.
**Nobody else has seen them.**

| Screen | 1366 / 390 | Result |
|---|---|---|
| Check before calling dialog | ✓ / ✓ | research only, no WhatsApp / email, 14-day reuse, "12 of 30 left today", skip reasons, "Check again" |
| Progress | ✓ / ✓ | 1 ready, 2 checking, 1 waiting, Stop, "finish on their own" |
| Results | ✓ / ✓ | 6/6 "Strong AI visibility — named in all 6 answers"; Google miss line; reused "checked 2 days ago"; failed (41 km); skipped (town, allowance used, not yours — no name); "Checks left today: 0 of 30" |
| Call screen (6/6) | ✓ / ✓ | identity-first opener; "it did name you, which is good"; Optimise + Build with correct terms; guarantee line; after-payment list |
| Quick Close — Build | ✓ / ✓ | 5 of 5, payment link ready, 12 payments / 12-month minimum, ownership after final payment; Email greyed (no address), WhatsApp greyed (window shut) |
| Quick Close — Optimise | ✓ / ✓ | ready, 6 payments / 6-month minimum, "stays theirs", Generate £99 link |
| Quick Close — paid | ✓ / ✓ | "Paid — your part is done", Paul in touch "by Wed 7 Oct", no link, setup 2/5 |
| Welcome Pack Build / Optimise | ✓ / ✓ | ownership per route; SEO section separate, "After — not measured yet" |
| Results document (up / guarantee) | ✓ / ✓ | renders, no competitor language |

All 22 captures: **no sideways scroll** (`scrollWidth = clientWidth`), **no console errors**. Minor, unchanged:
on a phone a ready row's "Skip" wraps under its three buttons (WS-7 noted the same).
**Not re-rendered here:** the Paid Client hub and Website Build — no UI code there changed since Wave 1's render
(`wave1-integration.md` §9); fix 1 changes only which services count as confirmed.

## 10. Test results

- **`npm run check`** (with `FINDABLE_SITE_DIR` = findable-site `integration/pre-sales-wave1`): typecheck **9 =
  the baseline list**; **468** edge-reachable files parse; **68** entrypoints resolve; import graph **0 faults**;
  production build OK; **310 / 310 suites**. (The raw merge, before this session's changes: 309 / 309.)
- **New `scripts/pre-sales-final.test.ts`** — 123 assertions, all passing (§4 cross-workstream items).
- Updated: `remeasure-results` (+ Paul's wording block), `customer-lifecycle` (no monthly in the not-up email),
  `outreach-list-columns` (the `service_terminated_at` exception now names checkout too).
- **findable-site** (`integration/pre-sales-wave1`, unchanged): `astro build` OK; `domain-authority`,
  `draft-completeness`, `email-tld`, `entity-profiles`, `onboarding-steps`, `pay-footnote`, `site-access` pass.
  `offer-terms` fails 1 (the stale "eight-week re-measure for a new domain" check — Paul moved every new client to
  four weeks on 2 Oct) and `astro check` has 3 errors: both pre-existing on `master` (wave 1 recorded the same).
- Deno is not installed; the deploy remains the type gate for edge code.

## 11. Live read-only checks (SELECT only, 5 Oct)

None of the ten candidate migrations is applied (no `budget_pool`, no `services_not_offered`, no
`first_contact_owed_since`, no `sales_check_*` tables, `sales_select_templates` still present, no `sales_check`
action in `protection_settings`); mode `running`; `audit_complete_template` null (so no finished audit queues a
WhatsApp); no trigger on the audit tables touches lead status; 2 malformed vault names still present; the four
2026-10-06 migrations already on `main` are applied; every dependency the migrations name exists (`my_role`,
`guard_action`, `protection_settings.updated_at`, `quick_close_events`, `client_monthly_updates`, `must_not_say`);
`lead_set_stage` accepts `not_interested`; 3 ended leads, all with money.

## 12. Migrations — apply one at a time, in this order, each read back

| # | File | Kind | Notes |
|---|---|---|---|
| 1 | `20261006010000_templates_owner_only.sql` | drops `sales_select_templates` | removes access only — **show Paul** |
| 2 | `20261006010100_inbound_lead_candidates.sql` | new function, service-role only | harmless while `whatsapp-status` is held |
| 3 | `20261006020000_quick_close_link_sharing.sql` | widens two kind CHECKs from their LIVE lists | idempotent helper |
| 4 | `20261007030000_payment_client_state.sql` | 5 columns, 1 guarded CHECK, re-creates `monthly_update_save` / `_mark_sent` | before stripe-webhook / paid-client-hub / quick-close |
| 5 | `20261007040000_audit_budget_pools.sql` | `enrichment_usage.budget_pool` | additive |
| 6 | `20261007040100_onboarding_service_truth.sql` | `services_not_offered`, `top_requests` | before paid-client-hub / findable-onboarding / paid-baseline |
| 7 | `20261007040200_remeasure_date_guard.sql` | trigger on `outreach_leads` | **show Paul**; nothing in code clears the date (grepped) |
| 8 | `20261007105000_call_workspace_guards.sql` | drops + re-creates `lead_set_follow_up` (7th arg defaults null, old callers still resolve), call-log functions | **show Paul**; before the SPA |
| 9 | `20261007200000_first_contact_activation.sql` | `first_contact_owed_since` | before stripe-webhook / paid-client-hub / quick-close |
| 10 | `20261006070000_sales_prospect_checks.sql` | 2 tables, RLS (2 SELECT policies), revokes, `sales_check` `{paid:true, per_day:30}` added only if absent | before `sales-prospect-check` and `security-admin`; its filename sorts earlier, nothing depends on its position |

Audit: create-if-not-exists / `add column if not exists` / guarded constraint / `drop … if exists` throughout;
only #3 changes allowed-value lists, and nothing later re-types them; no migration touches another's object
except #4 re-creating two functions from the already-live `20261006100000` (intended); no historical migration
edited. #10 read-back: both `to_regclass`, exactly two SELECT policies, `has_table_privilege('authenticated',
'public.sales_check_items','INSERT')` = false, the `sales_check` action = `{"paid":true,"per_day":30}`.

## 13. Edge deployment closure (computed from every changed file, `check-import-graph --reached-by`)

**A. SAFE TO DEPLOY IN THE MAIN RELEASE — 38 functions** (after the SQL):

`admin-overview backfill-lead-towns business-summary check-website client-agreement conversation-triage
crawl-check create-ai-audit enrich-business extract-competitors findable-checkout findable-onboarding market-view
niche-sample notify-onboarding-submit page-generator paid-baseline paid-client-hub process-ai-audit-queue
process-whatsapp-queue prospect-preview quick-close render-audit-report render-remeasure-results
render-welcome-pack run-seo-scan sales-earnings sales-performance sales-prospect-check scan-site-details
security-admin send-whatsapp-message site-enquiry stripe-webhook submissions voice-note-script warm-lead-reply
weekly-visibility`

(Wave 1's 37 + the new `sales-prospect-check`. `protectionLimits.ts` also reaches 20 more functions through
`_shared/protection.ts`, type-only — no redeploy.)

Order inside: `stripe-webhook`, `paid-client-hub`, `quick-close` after SQL #4 and #9; `sales-prospect-check` and
`security-admin` after #10; `findable-onboarding` before findable-site; `site-enquiry` before any form is switched
on. **Until `process-ai-audit-queue` is redeployed, the live queue still moves 6/6 leads to Not interested.**

**B. 🔴 HELD UNTIL THE FINDABLE META APP SECRET IS READY — 1 function:** `whatsapp-status` (the fail-closed
webhook; the post-call reply matcher rides it). Do not configure or guess `WHATSAPP_APP_SECRET`; the Move37
production webhook stays live.

Then the SPA (`main` → Cloudflare Pages, after SQL #8 and the functions it calls), then findable-site
(`integration/pre-sales-wave1` merged to `master`, `npm run deploy --branch=master` from a clean worktree).

**Deploy markers** (only the new code has them): `sales-prospect-check` OPTIONS → `x-sales-check-build:
sales-prospect-check-1`; `process-ai-audit-queue` body has no `autoMarkSixOfSixNotInterested`; `findable-checkout`
body contains `quickCloseClosedRefusal`; `page-generator` / `paid-baseline` bodies contain `NOT_OFFERED_PREAMBLE`;
plus Wave 1's (`salesCrawlIdsRefusal`, `x-site-enquiry-build`, `stampFirstContactOwed`, `measuredQuestionRefusal`);
the Outreach chunk contains "Check before calling".

## 14. Manual pre-deploy actions (not code defects)

1. Confirm / raise the **Apify monthly cap to about US$150** (Apify account; not touched here).
2. **Findable Meta / WhatsApp setup** is still pending — the Move37 setup stays live.
3. Obtain the exact **Findable Meta App Secret** before any `whatsapp-status` deploy; then one genuine reply seen
   on the old code, deploy, verify an unsigned POST → 401.
4. At deploy time, re-check and remove the **two malformed vault entries** (`wave1-integration.md` §5.7 SQL;
   never print names or values).
5. Inspect and apply the **10 migrations in §12's order**, one at a time, each read back (show Paul #1, #7, #8).
6. **Paul approves the results-email copy in §8**, then a deliberate commit flips
   `REMEASURE_RESULTS_COPY_APPROVED`.
7. After deploy: **one QA prospect check** (~3p, US$0.03) as the excluded "Test" salesperson on a QA fixture lead,
   no contact sent — expect one `sales_check` guard row, one hook audit, item `done`, zero WhatsApp / email rows;
   press again → "reused", no new row.

Also outstanding from Wave 1 (Paul, no code): deactivate the two old Stripe Payment Links; look once in Stripe for
any subscription / schedule on MCL's customer.

**Not changed, on purpose:** Ronnie (historic £49.99 custom one-off — no subscription, refund, work or re-measure)
and MCL (no new subscription or work). Both were only read.
