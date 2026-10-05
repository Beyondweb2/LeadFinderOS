# v3 commercial alignment + salesperson onboarding — production release (F + G + H), 2026-10-05

**STATUS: DEPLOYED (2026-10-05).** Backend, Stripe cutover (READY), LeadFinderOS frontend and findable.live are live
and verified. The cutover execute was first refused by the session permission check; Paul then said "yes, run the
cutover" and it ran (§8). During the release Paul changed the salesperson-paperwork rule (§14) — applied, tested and
deployed before the final release. Production commits: LeadFinderOS `main` — see §15; findable-site `master` `5af9064`.

## 1. Source commits

| | Before | Integrated |
|---|---|---|
| LeadFinderOS `origin/main` (production) | `ac9b8a07` (D + E live) | integration branch `integration/v3-commercial-sales-onboarding` |
| F `feature/client-agreement-commercial-alignment` | approved `790ae9e9` | merge `ea67371e` |
| H `feature/salesperson-onboarding-compliance` | approved `c634cff5` | merge `117deca8` |
| F + H reconciliation | — | `0092307b`, `cf98268b`, `c8a8db6b` |
| findable-site `origin/master` (production) | `f23d42e` | `integration/legal-v3-production` merge `5af9064` of G `7398b4f` |

## 2. Conflicts and how they were resolved

- **Textual (1):** `scripts/pre-sales-final.test.ts` — the LATER migration list. Both F's and H's migrations listed (and the
  reconciliation's).
- **Semantic (the real one): seller attribution under v3.** H keyed the seller on the Stripe Checkout Session a Quick Close
  link created (`sale_creations.checkout_session_id`). Under F, Quick Close creates the client's SIGN-UP (the
  `onboarding_responses` row + agreement link) and logs `link_generated` with **no session**; the session is created by
  `findable-checkout` only after the client signs. Merged as text, H's lookup would never match a v3 sale and every
  salesperson's sale would have fallen into review. Resolved by keying on the paid sign-up (§3).
- **Semantic: commission and a confirmed review.** H's "Confirm seller" back-fills `sold_by_user_id`; F's ladder would then
  count that sale with its original date and silently re-rate sales already locked at their Approval Date. Resolved in the
  engine (§4).
- `quick-close`, `stripe-webhook`, `salesCrm.ts`, `CLAUDE.md` merged cleanly as text and were read through by hand: H's
  Ready-to-Sell gate sits in front of F's sign-up creation (`save` / `generate_link` / `share_link`); the webhook's v3 hold
  runs before H's payment write.
- Not mechanical: no `ours` / `theirs` anywhere.

## 3. Final seller-attribution architecture

SALESPERSON (Ready to Sell, enforced in `quick-close`) → Quick Close `generate_link` → `findable-checkout` purpose
`signup_link` (no Stripe session) → `quick_close_events` `link_generated` (actor, **`onboarding_id` = the sign-up**;
server-written, immutable) → `sale_creations` snapshot (creator, role, Ready to Sell AT THAT MOMENT; append-only; H) →
client opens `/agree/<token>`, signs v3 → `findable-checkout` creates the session for THAT sign-up with metadata
`onboarding_id`, `agreement_acceptance_id`, `commercial_terms=v3`, `payment_timing=option_b`, **`signup_creator`**
(tracing only) → client pays → `stripe-webhook` (v3 hold first) writes **`paid_signup_id`** + `paid_checkout_session_id` in
the SAME update as the money (`firstPaymentPatch`; never a seller) → `trg_outreach_leads_sold_by` →
`sale_attribution_decision` (migration `20261010130000`) → `sold_by_user_id`, once, frozen.

The decision:
- **Paid sign-up known:** the creators of THAT sign-up. Exactly one, authorised (admin, or Ready to Sell at a creation of
  that sign-up; unknown readiness never counts) → seller. Two or more different creators → REVIEW `conflicting_creators`.
  One, never authorised → REVIEW `creator_not_authorised`.
- **Legacy paid session only:** H's rule unchanged.
- **Manual Mark Paid (no session):** credited only when exactly ONE sign-up with creation evidence exists for the lead;
  more than one → REVIEW `ambiguous_manual_payment`. Never "the most recent link".
- **No creator:** Paul's own sale ONLY when Paul (or nobody) owns the lead AND no salesperson ever created a sign-up for it;
  otherwise REVIEW `no_authorised_creator`. Never the current owner, never Paul as a fallback.
- Immutable: reassignment, the creator becoming not ready or disabled, status changes, later payments and direct rewrites
  never move a stamped seller or the paid sign-up.
- Paul resolves a review once on the Team page: **Confirm seller** (the claimed seller) or **Not credited**. Evidence kept.
  Known limit: Confirm only offers the CLAIMED seller (for a conflict: the first creator; for an ambiguous manual payment:
  the latest salesperson). If the right person is another one, Not credited is the only option today.

## 4. Attribution hold → commission

`src/lib/commission.ts` takes `attributionOf` (from the view `sale_attribution_holds`, via `isAttributionHeld` in
`src/lib/saleAttribution.ts` — one rule). Loaded by `_shared/earnings.ts` (Earnings, Sales dashboard, Admin) and by the
payment-ledger money notice; an unreadable view fails closed.
- OPEN or NOT CREDITED (or an unknown status) → no salesperson commission on any payment of that client, no seller on its
  lines, and the sale is in nobody's 30/40/50 count (cannot move anyone up the ladder). The money notice announces nothing.
- CONFIRMED → normal v3 rules on the ORIGINAL dates, but the sale joins the ladder only from its confirmation instant:
  a sale whose place was locked at its Approval Date before then keeps it (no cascade backwards). Anything the confirmed
  sale earns is owed no earlier than its confirmation month (never into a payout month already paid). Labelled
  "seller confirmed after review <day>".
- Tests: `scripts/v3-sales-attribution-integration.test.ts` (12/13 boundary: held → X stays 12th at 30%; confirmed before
  approval → X re-placed 13th at 40%; confirmed after X locked → X keeps 12th / 30%, the reviewed sale owed in January not the
  paid December).

## 5. Migrations — applied one at a time, each `begin … commit`, read back

| # | Migration | Purpose | Depends on | Needed by |
|---|---|---|---|---|
| 1 | `20261010090000_client_agreement_v3_commercial.sql` | v3 acceptance columns + check; `client_service_terms`, `client_service_events`, `client_agreement_emails`, `client_payment_holds` | existing `client_agreement_acceptances` | stripe-webhook, findable-checkout, client-agreement, paid-client-hub, cron-run, earnings |
| 2 | `20261010120000_salesperson_onboarding_compliance.sql` | onboarding + documents, Ready-to-Sell gate (`guard_action`, triggers), `sale_creations`, reviews, hold view, `paid_checkout_session_id`, dormant TPS, business type | `quick_close_events`, `guard_action`, `lead_is_client` | stripe-webhook (column), quick-close, admin-users, earnings |
| 3 | `20261010130000_v3_signup_seller_attribution.sql` | `paid_signup_id`, sign-up-keyed decision, two review reasons, triggers watch the paid sign-up | #2 | stripe-webhook (writes `paid_signup_id`) |

Applied 2026-10-05 13:45–13:50 UTC. Read-back: (1) 4 acceptance columns, `v3_acceptance_is_complete`, 4 tables RLS on,
0 anon/authenticated grants, 0 policies, guard triggers, 8 historic acceptances unchanged; (2) 7 tables + view + column,
documents = draft v2 agreement (draft), privacy notice (draft, 10 outstanding), team guide (approved) — **0 approved
agreement / notice**, both test reps NOT ready, `guard_action` has `not_onboarded`, 5 triggers, 8 historic links back-filled
as evidence (0 counted authorised), 0 reviews, 0 policies, signed-in users cannot call the readiness functions, TPS rows 0;
(3) both columns, the five-reason check, decision + stamp read `paid_signup`, both triggers include `paid_signup_id`.
**Seller hash `f3db0eaf…` identical before and after all three: no historic sale moved.**

Pre-deploy (live, ALWAYS ROLLED BACK, all three migrations prepended): H's suite **70/70**; the new
`supabase/tests/v3-signup-attribution.sql` **24/24** (the Monday/Tuesday/Wednesday example → Sarah). Eleven older suites
run with and without the migrations: identical results (pre-existing failures only, listed in §11). Read back after: no
table, fake user, QA row or override left.

## 6. Functions deployed (35) and NOT deployed

Derived from `git diff origin/main..HEAD` + `check-import-graph --reached-by` (36 reach a changed module).
Order: **stripe-webhook** (13:52) → 32 support functions → **legacy-checkout-cutover** → **findable-checkout LAST**.
admin-overview, admin-users, business-summary, client-agreement, conversation-triage, create-ai-audit, cron-run,
findable-checkout, findable-onboarding, legacy-checkout-cutover (new), market-view, mockup, niche-sample, page-generator,
paid-baseline, paid-client-hub, process-ai-audit-queue, process-whatsapp-queue, prospect-preview, quick-close,
render-audit-report, render-remeasure-results, render-welcome-pack, run-seo-scan, sales-earnings, sales-performance,
send-whatsapp-media, send-whatsapp-message, send-whatsapp-voice, site-enquiry, stripe-webhook, submissions,
voice-note-script, warm-lead-reply, weekly-visibility.
- Verified by version: exactly these 35 moved, nothing else (91 functions now).
- Verified by marker (deployed bundle via the Management API): 30 carry release-only identifiers from their own closure
  (the old bundles of stripe-webhook / findable-checkout carried none). market-view, niche-sample, page-generator,
  prospect-preview, run-seo-scan reach `findableOffer.ts` only through type imports — the module is absent from their
  bundles altogether (not even old constants), so the release cannot change them.
- ⛔ **NOT deployed: `whatsapp-status`** — still **v114**, last updated 2026-09-30 06:26 UTC. It reaches the changed offer /
  baseline modules through `_shared/whatsapp-inbound.ts`; its deployed copy keeps the older offer wording module, and the
  v3 Access-Date guard lives in `startPaidBaseline`, which the inbound path does not call. No payment, agreement or
  commission behaviour depends on it.
- Rollback: redeploy any function from `ac9b8a07` (before-versions saved in the session; no Supabase "previous version"
  switch exists). The migrations are additive; nothing depends on rolling them back.

## 7. Pausing new sales links during the cutover

No pause switch exists in code. Used instead: only Paul and two TEST accounts can create links; the cutover report lists
every open legacy session whenever made; the new webhook HOLDS any unsigned payment. Window opened 13:45:10 UTC; proof at
13:58: **0 sign-up/payment links created, 0 payments, 0 holds** since. The checkout gate went live 13:52:50 UTC.

## 8. Stripe cutover

Report (dry run, 13:40, tool deployed alone first — read-only; and again after the deploy, 13:57 — identical, plan hash
`63fb023a…`):
- EXPIRE `cs_live_a1Hmk…` — Paul's own Quick Close **Build** link for **The Portsmouth Plumbing and Heating Co**
  (lead `09ed461b…`, sign-up `6fb7bee9…`), generated and COPIED today 09:38 UTC, Stripe expiry 2026-10-06 09:38 UTC.
- DEACTIVATE `plink_1UGfgAFi7Bp695ObEyaZiH1l` (`buy.stripe.com/fZu00j…01`) — **"Findable one off" £99** — names Findable.
- DEACTIVATE `plink_1UGffKFi7Bp695Ob9QmhM4Nb` (`buy.stripe.com/3cI00j…00`) — **"Findable — New site plan" £99** — names
  Findable (the retired new-site tier).
- 0 unclassified links, 0 non-Findable objects, 0 signed v3 sessions; completed payments never listed.
- Neither link is in any repository or record (the only one ever recorded, `buy.stripe.com/5kQcN4…kE06`, is not active
  on this account). Classification was made confident by adding each link's line items and its evidence (name vs price
  only) to the report — display only, the plan hash covers ids (`c8a8db6b`).

EXECUTE: first refused by the session permission check (nothing worked around it); run after Paul's explicit
"yes, run the cutover" at **2026-10-05 ~14:01 UTC** with plan hash `63fb023a…` and the confirm phrase:
- expired `cs_live_a1Hmk…` (Portsmouth Plumbing Quick Close link) — done;
- deactivated `plink_1UGfgAFi…` ("Findable one off" £99) and `plink_1UGffKFi…` ("Findable — New site plan" £99) — done.
Report after (and re-run independently at 14:02:30): **Open legacy Checkout Sessions 0 · Active legacy Payment Links 0 ·
Stored legacy Quick Close links 3 (still payable 0) · Other bypass paths 0 · READY: no payable legacy Findable path
remains.** Plan hash now `3fcf505e…`. Nothing else in Stripe was touched (0 non-Findable objects existed).
⚠️ Paul: The Portsmouth Plumbing and Heating Co's old link no longer works — send them their sign-up link (Quick Close →
the link is now the agreement page) so they sign v3 before paying.

## 9. Agreement parity

`npx tsx scripts/check-agreement-parity.ts --site-ref 5af9064` (the merged site integration commit):
**IDENTICAL — 139 signed paragraphs**, same source .docx `d0ede62911bf…` (re-hashed from Paul's Downloads file).
The CURRENT public `/agreement` (old site, proxying `client-agreement`) already serves **v3** since that function deployed.

## 10. Tests

- LeadFinderOS `npm run check` against the merged site: **327/327 suites**, typecheck 9 = baseline, edge syntax / names /
  import graph clean, build clean (`page-roadmap` warning is a pre-existing unwired tool).
- F's 22 focused suites on the F merge: all pass. H's 4 suites: pass (two of H's assertions were promises about H alone —
  "commission untouched", a 400-character window — updated to the integrated rule).
- New: `scripts/v3-sales-attribution-integration.test.ts` (45 checks), `supabase/tests/v3-signup-attribution.sql` (24, live).
- findable-site: build 20 pages; offer-terms, pay-footnote, draft-completeness, email-tld, onboarding-steps, agreement-v3,
  domain-authority, entity-profiles, site-access — all pass; cross-repo sync 14/14 (site side, read through private junctions
  at both integration worktrees) and 18/18 (LeadFinderOS side); `astro check` 3 errors = master's 3; built-output scan:
  /agreement v3, proxy gone, Option B wording, any-increase, Build 12 / Optimise 6 × £99, £29.99 after, no £9.99, no
  "six weeks after sign-up", no "nothing charged after", refunds, terms not a second contract, privacy 0 placeholders,
  sitemap 18 URLs incl. /agreement/, canonicals, JSON-LD parses, internal links resolve.
- Live checkout gate (13:57, QA fixture `ZZ QA-B4`, archived): unsigned `pay` → `agreement_required` / `not_signed`, NO
  session; `signup_link` → the agreement URL, NO session. v1 acceptance bypass: covered by F's unit suites
  (`client-agreement-v3`, `legacy-cutover`); not demonstrated live (would need fake evidence rows).

## 11. Pre-existing, not caused here

- `supabase/tests/quick-close.sql` (permission denied on `quick_close_events` as `authenticated`) and
  `sales-shared-workflow.sql` (calls a removed `lead_set_follow_up` signature) fail identically on live without this release.
- `multi-user-rls.sql` 1, `claim-rule.sql` 3, `call-workspace-guards.sql` 1 failing items — identical without this release.

## 12. Releases

- **LeadFinderOS frontend:** `main` `81628fdb` (release merge, `--no-ff`, origin proven unmoved at `ac9b8a07` before the
  push), then `af51f62e` (§14), then the final record/visual-fix merge (§15). Cloudflare Pages auto-deploys `main`;
  **app.leadfinderos.com and leadfinderos-next.pages.dev serve the same entry chunk** and every release-only marker
  (review reasons, `conflicting_creators`, the new not-ready wording) was found by crawling the live chunks.
- **findable-site:** parity re-run on the exact commits (LFOS `81628fdb` tree = integration; site `5af9064`):
  **IDENTICAL — 139**. `master` fast-forwarded `f23d42e → 5af9064` (the G `--no-ff` merge), built, deployed with
  `wrangler pages deploy --branch=master --commit-hash=5af9064` on the findable-site account (`4148056c…`); Cloudflare lists
  `c8e47e41` as **Production / master / 5af9064** (rollback = `ce99e331` / `f23d42e`).
- Live findable.live checks (fetched, not the local build): /agreement/ is the static v3 page (9A, £29.99, read-only note),
  Option B wording on home + /pricing, £29.99 after, Build 12 / Optimise 6, any increase, no six-weeks / nothing-charged-after
  / £9.99, /terms points to the agreement, /privacy clean (its only "[…]" is Cloudflare's own `[email protected]` rewrite),
  sitemap lists /agreement/.

## 13. Live verification (no real payment, no message to anyone)

- **Client sign-up:** a QA fixture's live `/agree/<token>` page: v3 text, the chosen route (Findable Optimise, 6
  payments), £29.99 Continuing Service, **3 tick boxes (authority, agree, marketing opt-out), none pre-ticked**, "I agree and
  sign", **no payment link or pay button before signing**. Unsigned `pay` → `agreement_required` / `not_signed`, no session;
  Quick Close `signup_link` → the agreement URL, no session. v1 bypass: unit-proven (not demonstrated live).
- **Payment:** cutover READY; the webhook HOLD is live (marker `holdPayment`); a held client cannot be charged again
  (`payment_held`); old Stripe URLs are never reused (`linkUsable`).
- **Timing / guarantee / Continuing Service:** the live Paid Client card (rendered from the real `timelineView`) shows Access
  Date → Results Date → Refund Window end (+14) → Approval / Payment Start (+15), "NOT yet set in Stripe" until confirmed,
  monthly count, and Continuing Service £29.99 "manual for now". Any +1 counts (`guaranteeNumberWentUp`, unit-proven); the
  20 × 3 × 2 method is unchanged. Nothing charges £29.99 automatically (`CONTINUING_SERVICE_AUTOMATION` all false).
- **Salesperson onboarding:** live read-back — no rep is Ready (Test, test1 miss practical items), Paul is never gated, no
  paperwork key anywhere, TPS absent.
- **Attribution / commission:** live rolled-back suites 70/70 (H), 24/24 (sign-up attribution), 13/13 (paperwork rule);
  hold → commission unit-proven (§4). Historic sellers: hash `f3db0eaf…` unchanged throughout.
- **D + E:** their TS suites pass in the 328; `outreach-ownership.sql` and the other SQL suites give identical results with
  and without this release.
- **WhatsApp:** `whatsapp-status` still **v114** (2026-09-30); no WhatsApp policy changed (a not-ready rep is refused sends
  exactly like a suspended one, as before).

## 14. Change from Paul mid-release — salesperson paperwork HANDLED EXTERNALLY, NOT ENFORCED IN LEADFINDEROS

- Migration `20261010140000_ready_to_sell_without_paperwork.sql` (applied ~14:3x UTC, read back): Ready to Sell no longer
  checks the contractor agreement or the privacy notice. Also fixed a real gap found by the new live test: a NULL
  `contractor_type` silently passed the contractor-status item.
- **Still blocks Ready to Sell:** 18+ confirmed, right to work, bank details, VAT status, individual / limited company, start
  date, own login, current team guide acknowledged. Schedule 2 optional; TPS/CTPS postponed.
- Not ready ⇒ server refuses Find Leads (`search-leads` → `guard_action` `not_onboarded`), claims, checks, calls / contact
  logging, outreach and WhatsApp, Quick Close sign-up links (so no commission-bearing sale). Paul is never gated.
- No salesperson-facing paperwork UI: the banner says "Calls, messages, claiming leads, checks, Find Leads and sign-up
  links are paused until your onboarding is complete. Waiting on: …" with only real missing items; its one button is the
  team-guide acknowledgement. Find Leads shows the banner and its single search handler does not start a search.
  Team-page agreement / notice fields are optional reference lines.
- Deployed: `admin-users` (marker-verified). Tests: `salesperson-paperwork-external` (new), `salesperson-onboarding`
  rewritten, live `ready-to-sell-paperwork.sql` 13/13; H 70/70 and attribution 24/24 re-run on the new rule.
- The CLIENT v3 agreement-before-payment flow is unchanged (no client agreement / checkout file or object touched).

## 15. Visual QA

- Public pages (/agreement/, /, /pricing/, /refunds/, /terms/, /privacy/) on live findable.live at 390 px and 1440 px:
  no horizontal overflow, no stale v1 wording, no debug text.
- Operator components rendered from the real source in a throwaway harness (fixtures, no network; deleted afterwards):
  not-ready banner, Team onboarding panel, Team documents card, attribution-review card, Paid Client timeline. Found and
  fixed: the banner's team-guide button ran 30 px off a 390 px screen (now wraps); the paperwork labels read
  "…reference only)(optional)" (shortened). After: no overflow at 390 or 1440. Not rendered: the Quick Close dialog and the
  full signed-in pages (no admin session in this session). Measured by script; nobody has looked at them yet.

## 16. Open items

1. Salesperson contractor agreement / privacy notice — **handled externally by Paul; not a product blocker** (§14).
2. TPS/CTPS — postponed (dormant table and lib only).
3. Findable Meta / WhatsApp cutover — pending; `whatsapp-status` held on v114.
4. CSV import — pre-existing bug, open.
5. Prospect full-site crawl, larger audit modal, salesperson WhatsApp queue UI, compact Outreach audit rows — not in this
   release.
6. Admin team table: a sale under attribution review shows its REVENUE on the book owner's row (display only; no seller, no
   commission).
7. Attribution review "Confirm seller" offers only the claimed seller (§3).
8. Stale SQL test files `quick-close.sql`, `sales-shared-workflow.sql` (pre-existing, §11).
