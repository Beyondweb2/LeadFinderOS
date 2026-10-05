# End-to-end sales certification — 2026-10-05

**Branch:** `qa/end-to-end-sales-certification` (off production `main` `9fd5a144`). **Nothing deployed.** No message, call,
email, payment or Stripe object was created for anyone; no real lead, client or historic sale was changed.

## Verdict: **READY WITH NON-BLOCKING ISSUES**

The live sales flow does what the v3 release says it does, end to end, on the production database (rolled-back
fixtures), the production edge functions (unauthenticated refusal calls) and the real rule modules. Nothing found here
blocks a Ready salesperson from selling safely. Four things must be on Paul's list before / soon after the first real
sale — see **Must-do for Paul** — and one carried-over security item (E2E-05, the WhatsApp webhook) is outside this
certification by Paul's decision but is a real production risk.

One genuine core-release bug was found and fixed on this branch (E2E-11, the Quick Close offer card told reps the
monthly starts "six weeks after sign-up"); it reaches production only with the next SPA release.

Strictness notes: the live **signed-in** journey was NOT driven (minting a session for the Test account was refused by
this session's permission check — §Not tested). Server-side rules were proved as the database itself enforces them; the
screens were rendered from the real components with fixture data (§Visual QA), never seen live by anyone.

## Must-do for Paul

1. **Record a salesperson's onboarding before they start.** Live today: 2 sales accounts (Test, test1), **neither is
   Ready to Sell**, 1 onboarding row in total. A new rep can sign in but every selling action is refused until the 7
   practical items + login are recorded on the Team page.
2. **E2E-01 — approve the four-week results copy before the first v3 client's results.** While
   `REMEASURE_RESULTS_COPY_APPROVED = false` no v3 client can get a Results Date, so no Refund Window, no Approval
   Date, the first monthly £99 is never scheduled (late, never early — the Stripe hold) and the seller's initial
   commission stays Pending. Due about four weeks after the first v3 client's Access Date.
3. **E2E-05 — the WhatsApp inbound webhook still accepts unsigned posts** (`whatsapp-status` v114,
   `WHATSAPP_APP_SECRET` not set). Known since Session E (M-003); held by Paul for the Meta cutover. Not tested or touched.
4. Portsmouth Plumbing still needs their new sign-up link (carried from the release record).
5. **E2E-11 — release the Quick Close card fix** (this branch; SPA only, no edge function or SQL). Until it ships,
   tell reps the monthly starts "the day after the 14-day refund window", not "six weeks after sign-up".

## Evidence base

| Layer | What ran | Result |
|---|---|---|
| Repo gate | `npm run check` on the branch | typecheck 9 = baseline, edge syntax / names / import graph clean, build clean, **329/329 suites** |
| Rule suite (new) | `scripts/e2e-sales-certification-rules.test.ts` — real modules, local fakes | **92/92** (+ 1 WARN line for E2E-01) |
| Related TS suites | commission-v3-terms 33, v3-sales-attribution-integration 45, client-timeline 55, client-agreement-v3 57, legacy-cutover 47, paid-baseline-three-runs 8, baseline-methodology 100, commission-six-trailing 94, monthly-commission-tiers 52, payment-start-schedule 26, sales-prospect-check (all ✓) | all pass |
| Live SQL, new | `supabase/tests/e2e-sales-certification.sql` (rolled back) | **62/62** |
| Live SQL, all suites | every `supabase/tests/*.sql`, rolled back (§Live SQL) | **846 / 847** list checks + 7 value-dump suites read OK; 1 known item; 2 stale suites |
| Live edge refusals | 14 unauthenticated calls to production functions (§G) | all refused correctly; no Stripe session |
| Live public site | findable.live pages + sitemap fetched and scanned | clean; agreement parity **IDENTICAL — 139** |
| Live deploy state | function versions, deployed whatsapp-status body, secrets list (names only) | whatsapp-status v114 untouched |
| Visual | 12 screens: real components in a local fixture harness + live public pages, 1440 / 390 px | all rendered, no overflow, P0 none; E2E-11 fixed, P2s listed |

Live data guard, read before and after every run: seller hash `f3db0eaf…` (identical to the release record), 0
attribution reviews, no leftover QA function, campaign or onboarding row.

## Certification matrix

| AREA | TEST | RESULT | EVIDENCE | RISK / NOTE |
|---|---|---|---|---|
| A Onboarding | Not-ready rep can sign in and read own status | PASS | e2e SQL: `my_onboarding_status` as the rep → `ready:false` + missing list; salesperson-onboarding-rls "an incomplete rep can still sign in" | |
| A | Each practical item missing ALONE blocks, and only that item is listed: 18+, right to work (date / result), bank, VAT (null / registered without number), individual/company (null / company without number), start date, team guide, login (disabled), suspended | PASS (13/13) | e2e SQL `A: missing … ALONE` — Find Leads guard `not_onboarded` (`suspended` for a suspension) | |
| A | Not-ready rep refused: claim, queue, send, prospect check, hook audit, preview, lead add; ready rep not refused | PASS (14/14) | e2e SQL `guard_action` per action | |
| A | Paperwork / TPS never a reason | PASS | e2e SQL 7 practical items, no agreement / notice / TPS; ready-to-sell-paperwork 13/13 | Paul's 2026-10-05 rule |
| A | Paul (admin) unaffected | PASS | e2e SQL admin guard ok, `not_onboarded:false`; onboarding-rls "the admin is never gated" | |
| A | Non-team-guide acknowledgement refused by the DB | PASS | e2e SQL | |
| A | Start date in the FUTURE | INFO | e2e SQL: rep is READY today with a start date 30 days ahead | E2E-03 (P2): only a missing start date blocks |
| A | Wording a not-ready rep sees on add / queue / campaign | ISSUE | `sales_add_lead` → "Usage temporarily paused — contact Paul" | E2E-02 (P2): the banner explains, but the toast names the wrong cause |
| B Find Leads | Not-ready rep: Find Leads blocked | PASS | guard `lead_search` → `not_onboarded` (A); release record: page handler does not start; live `search-leads` unauthenticated → 401 | page handler itself only via harness (Visual) |
| B | Ready rep add → lead is theirs, added by them, book = Paul | PASS | e2e SQL `sales_add_lead` | |
| B | Rep cannot choose another owner | PASS | e2e SQL: `assigned_to_user_id` / `user_id` = Tom in the payload were ignored | |
| B | Same business again → "exists, yours" | PASS | e2e SQL | |
| B | Paul's add belongs to Paul | PASS | outreach-ownership.sql 32/32 ("a Find Leads add with no owner field is owned by Paul (server-side)") | |
| B | Ownership isolation (read, claim by name) | PASS | e2e SQL; multi-user-rls 70; outreach-ownership 32 | |
| C Prospect check | Doesn't change lead status / no Not interested / no messages | PASS (unit + source) | sales-prospect-check: "no lead row is written", "no WhatsApp row", "no edge function writes not_interested", bulk 6/6 byte-identical | not run live (would need a signed-in rep + spend) |
| C | Quota 30/day, reuse free, fail closed | PASS | sales-prospect-check ("exactly 30 paid checks…"); live `protection_settings.sales_check.per_day = 30`; abuse-cost-protection.sql 90/90 | |
| C | Cache / reuse windows; "Call screen" link opens the Call tab | PASS | sales-prospect-check | |
| C | Ownership; not-ready refused | PASS | guard `sales_check`/`hook_audit`/`prospect_preview` (A); live `create-ai-audit`, `prospect-preview` unauthenticated → 401 | |
| D Call workspace | Call log; duplicate tap = one row; bad outcome refused | PASS | e2e SQL; call-workspace-guards.sql 18/18 | |
| D | Next Action (call, day, time, note); details; History under the rep | PASS | e2e SQL; next-action-one-flow 29, next-action-reminders 21, next-action-human-only 19 | |
| D | No cross-owner access (call, next action, details, stage, read) | PASS | e2e SQL `not_your_lead` ×4 | |
| D | Rep stops being ready → no calls / claims | PASS | e2e SQL `not_ready_to_sell` | |
| D | Opt-out | PASS / NOTE | claim-rule 16/16 (opted out → blocked), lead-revive ("opted out is never revived") | E2E-04 (P2): no "asked not to be contacted" call outcome; a rep uses Not interested (revivable by a later reply) |
| D | Keystroke closing / navigation bug | PASS / ISSUE | harness, both widths, Call-tab note + Details note: letters, space, Enter, Backspace, ArrowRight never close, navigate or skip to the next lead; text kept | E2E-12 (P2): Escape closes the whole workspace and the unsaved note is lost, no confirmation |
| E Quick Close | Offer card the rep reads before the link | FAIL → FIXED | harness: "Then £99 a month, starting six weeks after sign-up" (`quickClose.ts:133`) contradicted v3 Option B | **E2E-11, fixed on this branch** |
| E | Creates a SIGN-UP link, never a raw Stripe URL | PASS | live `findable-checkout`: unsigned `pay` → `agreement_required` + `findable.live/agree/<token>`, no session; source G7 (gate before the only session create) | live `quick-close` itself needs sign-in (401) |
| E | Creator snapshotted (creator, role, ready-at-that-moment, this sign-up + lead, no session); append-only | PASS | e2e SQL `sale_creations`; v3-signup-attribution 24/24 | |
| E | Link belongs to the exact sign-up | PASS | live: a body naming another lead is ignored — the sign-up's own lead is used; the acceptance is matched on lead + onboarding + version | the agreement LINK is one per lead (upsert on lead_id); the acceptance is per sign-up |
| E | Reassignment later does not change the seller | PASS | e2e SQL H; v3-signup-attribution | |
| F Agreement | v3 shown; Build / Optimise; full agreement; authority; nothing pre-ticked; no pay before signing | PASS | rules G6 (3 boxes, none ticked); client-agreement-v3 57; live /agreement/ v3 static; release §13 live `/agree` read | |
| F | Wrong / v1 signature, another sign-up's acceptance, tampered record → refused | PASS | rules G1–G5, F1 (`checkoutAgreementGate`, `webhookV3Verdict`) | not demonstrated live (needs fake evidence rows) |
| F | Acceptance fingerprint | PASS | rules G (sha256 recomputed), client-agreement-v3 | |
| F | Public agreement parity | PASS | `check-agreement-parity.ts --site-ref 5af9064` IDENTICAL — 139; live /agreement/ 165/166 paragraphs in order (the miss is Cloudflare's e-mail obfuscation) | |
| G Payment | Signed v3 → permitted; unsigned → refused; legacy → held | PASS | rules G1–G5, F1, F2 (`holdPayment` writes no ledger / lead change); live unsigned → `not_signed`; already a client → 403 `already_client`; bad request 400 | no real or test-mode charge |
| G | Webhook refuses unsigned / wrong QA secret | PASS | live `stripe-webhook` → 400 "Missing stripe-signature"; wrong QA secret → 401 | |
| H Seller | Sarah ready → creates sign-up → reassigned to Tom → Sarah not ready AND disabled → paid → **Sarah** | PASS | e2e SQL H (one rep, both lapses); v3-signup-attribution (separately) | |
| H | Later reassignment + direct seller rewrite → Sarah stays | PASS | e2e SQL | |
| H | Multiple plausible sign-ups → review, never "latest", never Paul | PASS | e2e SQL `ambiguous_manual_payment`; v3 `conflicting_creators`, `no_authorised_creator` | |
| I Hold | Open review → held, no commission, not on the ladder | PASS | e2e SQL `sale_attribution_held`; rules I1–I4 | |
| I | Not credited → no commission; cannot be re-decided | PASS | e2e SQL `no_open_review` | |
| I | Confirmed → normal rules from the confirmation, no retroactive re-rating | PASS | rules I3; v3-sales-attribution-integration (12/13 boundary) | |
| J Commission | Pending until Approval; 30/40/50; UK month (GMT + BST edges); excluded/refunded before Approval drops out; Approval locks; 20% × first five £99; none on 6th+; none on £29.99; pre-v3 unchanged | PASS | rules J1–J8; monthly-commission-tiers.sql (13th = 40%, 31 Oct 23:30 = October) | E2E-07 (P2): Continuing Service is recognised by AMOUNT (<£99) |
| K Paid Client | Missing information, find what we have, ask salesperson, contact helper (no send), history | PASS (unit) | client-missing-info, paid-client-hub-resilience (in the 329) | live screen needs admin sign-in; Visual harness |
| L Access Date | Refused while required info missing; future / before-£99 refused; written once; History; email rendered + QA-guarded + "sent" only when Resend accepts; baseline waits | PASS | rules L1–L5; client-timeline (accessReadiness, baselineMayStart) | live call needs admin sign-in (401 unauthenticated) |
| M Baseline | 20 × 3 × ChatGPT + Gemini = 120; frozen | PASS | rules M1–M5; baseline-methodology 100; paid-baseline-three-runs | |
| M | Results Date = the send event, not +28 | PASS | rules O16–O19: no stamp → no Results Date / window / Approval invented; one writer only | **E2E-01** |
| N Guarantee | 39→40 improved; 39→39, 39→38 not | PASS | rules N1–N3 (`guaranteeNumberWentUp`) | |
| N | No ±5 rule decides | PASS | rules N4–N6; full NOISE_BAND_PP inventory: display labels only | E2E-08 (P2): operator compare screens can say "within noise" for a +1 the guarantee counts; CLAUDE.md §1 corrected |
| O Option B | Results → +14 → Approval next day (month end, year end, 25 Oct clock change); Stripe cannot charge early; no-access fallback (six weeks from the £99) | PASS | rules O1–O15; payment-start-schedule 26 | fallback is applied when Paul records the guarantee ceased (not automatic) — late, never early |
| P Continuing | Build after 12 / Optimise after 6 ACTUAL payments → £29.99 state; Paul + client reminders; Continue / Cancel; no automatic switch or charge | PASS | rules P0–P9 (`CONTINUING_SERVICE_AUTOMATION` all false) | |
| Q D+E regression | My leads / Unassigned / own leads / claim / campaign owner scoping / client missing info | PASS | outreach-ownership 32, claim-rule 16, campaign-claim-contact 67, campaign-ownership (dump read), sales-flow-reliability 33, sales-remove-move-campaign 36, multi-user-queue 11, sales-readiness 38 | these suites could not run at all since Ready to Sell went live — repaired here (§Live SQL) |
| R Public site | Home, pricing, refunds, terms, privacy, /agreement/, sitemap | PASS | live fetch: no 42 days / 8 weeks / "nothing charged after" / £9.99 / ±5 / noise band; Build 12 (1+11), Optimise 6 (1+5), £29.99 after, any increase, Option B, sign before paying; /agreement/ v3 static in sitemap | every "six weeks" hit is legitimate (estimate or the clause 5.6/5.8 fallback) |
| S WhatsApp | whatsapp-status held, unchanged by any release | PASS | function list: v114, 2026-09-30 06:26 UTC; nothing deployed after the release (14:45 UTC) | E2E-05 |

## Findings

| ID | Sev | Finding | Evidence | Disposition |
|---|---|---|---|---|
| E2E-01 | P1 (dated) | No v3 client can get a Results Date while `REMEASURE_RESULTS_COPY_APPROVED = false`: the sender is the only writer of `remeasure_results_sent_at`. Consequence: no Refund Window / Approval / first monthly; initial commission Pending. Late, never early. | `src/lib/remeasureResults.ts:41`, `:141`; `_shared/remeasure-results.ts:247`; rules O19–O21 | Paul approves the copy before the first v3 results (~4 weeks after the first Access Date). Not a code fix. |
| E2E-02 | P2 | A not-ready rep pressing Add lead / queue / campaign gets "Usage temporarily paused — contact Paul" (the RPCs collapse `not_onboarded` into `usage_paused`). | `sales_add_lead`, `sales_queue_opener` (`20261008100000:121`), `src/lib/salesCrm.ts:186` | Document; the onboarding banner is always shown. Fix = SQL (return the guard reason).  **FIXED in the final sales release** (`final-sales-product-release.md` §4: the real cause + what is still needed). |
| E2E-03 | P2 | A future start date does not block Ready to Sell (only a missing one). | e2e SQL INFO line | Paul to say if a future start date should block.  **FIXED in the final sales release** (migration `20261011120000`: a future start date = `not_started`). |
| E2E-04 | P2 | No "asked not to be contacted" call outcome; a phone opt-out is logged as Not interested (revivable only by the prospect's own reply). | `lead_log_contact` outcome list | Document. |
| E2E-05 | P0 carried (Session E M-003), out of scope | Live `whatsapp-status` v114 checks a Meta signature only `if (appSecret)`, and `WHATSAPP_APP_SECRET` is not set: unsigned inbound posts are accepted (forged reply / STOP on a known phone; first-reply mode is `audit_only`, so spend, not a send). | deployed body: `if (appSecret) { … validMetaSignature …`; secrets list has no `WHATSAPP_APP_SECRET` | Held by Paul for the Meta cutover — not tested, not touched. |
| E2E-06 | P2 (pre-existing) | `multi-user-rls.sql`: an automatic queue send that is only `sent` already assigns the lead (the rule says: only once delivered). | multi-user-rls 70/71 | Same as the release record §11. |
| E2E-07 | P2 | v3 commission treats any recurring payment under ~£99 as Continuing Service (0%, not one of the five). A prorated / discounted £99 would lose its 20%. | `src/lib/commission.ts:426`, `:446` | Document; no discounts exist today. |
| E2E-08 | P2 | Operator compare screens still say "within noise" for a +1 that the v3 guarantee counts as gone up. | `ReportBeforeAfter.tsx:71`, `MeasurementCompareTable.tsx:248` | Display only. CLAUDE.md §1's stale "beyond NOISE_BAND_PP" line corrected here. |
| E2E-09 | P2 | The Results Date stamp is written just before the email is sent; a crash between the two leaves a Results Date with no email (clocks start). | `_shared/remeasure-results.ts:247–288` | Document; claim-first is deliberate (no double send). |
| E2E-11 | **P1, FIXED** | Quick Close offer card told the rep the monthly starts "six weeks after sign-up"; the v3 agreement, the call script, the site and the Access Date email all say the day after the 14-day refund window. A rep reading the card aloud would misstate the contract. | harness screenshot 05; `src/lib/quickClose.ts:133` | Card now renders `MONTHLY_START_V3_WORDS` (the one copy the script and `offerSummaryFor` already use). Tests: `service-route-terms` (exact line + "never after sign-up"), `sales-workspace-v2`. Stale comment `findableOffer.ts:70` corrected. **Needs the SPA release to reach production.** |
| E2E-12 | P2 (P1 if reps type long call notes) | Escape closes the lead workspace at once and an unsaved note is lost, without a prompt. Ordinary typing is safe. | harness keyboard test | Document. |
| E2E-13 | P2 | Quick Close: "send it within about 715 hours" (formats a 30-day link life in hours; comment still says "before Stripe closes it"); the offer card does not mention the £29.99 after the minimum term (the script does); "What to tell them" questions cut off at 390 px. | `QuickCloseDialog.tsx:98` | Document. |
| E2E-14 | P2 | Sales dashboard: "Not in any month yet: Harbour Locksmiths (£29.70), Harbour Locksmiths (£99.00)" — the £99.00 is 20% × five monthlies summed, reads like the client price, business listed twice; "0 sales from 1 people"; Follow-ups filter row clipped at 1440. | harness 01 | Document. |
| E2E-15 | P2 | Paid Client: the collapsible "The guarantee no longer applies (clause 5.8)…" reads like a status while the guarantee is live (it is a record-it action); ISO dates and lower-case "findable build"; a failing monthly-update call shows a raw code ("empty_response"). Confirm "No live monthly schedule in Stripe" does not fire for every v3 client before Payment Start. | `ClientTimelineCard.tsx:103`; harness 07 | Document. |
| E2E-16 | P2 | Find Leads not-ready: the empty state still says "Ready to find leads" under the paused banner (the search itself does not start). Outreach phones wrap at 1440; Team panel indented at 390, seconds in "last active", raw document ids. Live /agreement/ at 390: the floating "Get started" pill covers table content. | harness 02, 03, 08, 10 | Document. |
| E2E-10 | test debt, FIXED | 20 live SQL suites could not run since Ready to Sell went live (their fake reps are not onboarded), plus 5 stale assertions. The D+E regression was not actually being exercised. | §Live SQL | Fixed here (tests only). |

Bugs fixed in product code: **one — E2E-11** (the Quick Close offer card timing; one line, rendered from the existing
constant, with regression tests). Every other product finding above is documented, not changed. Nothing overlaps the parallel branches (full crawl, compact Outreach, CSV
import, attribution-review redesign) except E2E-08's wording, which is display-only.

## Live SQL — what was repaired (tests only)

- **Ready-to-Sell fixture** added to 22 suites (inside each suite's own rolled-back transaction): a trigger onboards every
  fake `.invalid` salesperson the suite creates, and the existing sales accounts are made Ready for that transaction
  only. Proved first that the Management API runs a whole request as ONE transaction (a table created before a failing
  `DO` block did not survive).
- `claim-rule.sql`: its reserved numbers 07700 900101–110 now carry Session A's simulated thread, so its "never
  contacted" fixture read as contacted → moved to 07700 900901–910 (no history). 16/16.
- `campaign-claim-contact.sql`: two admin renames to the same name hit `campaigns_name_key_unique`; sales now see and
  use only their OWN campaigns (campaign ownership) → assertions updated. 67/67.
- `sales-flow-reliability.sql`, `sales-remove-move-campaign.sql`: borrowed Paul's campaigns → rep-owned campaigns. 33/33, 36/36.
- `self-sourced-handoff.sql`: asserted "the holder is the seller" → now the v3 rule (no sign-up creator → no seller,
  review). 41/41.
- Still stale, unchanged (pre-existing, release §11): `quick-close.sql` (permission on `quick_close_events`),
  `sales-shared-workflow.sql` (removed `lead_set_follow_up` signature).

Results (rolled back, 2026-10-05 ~15:00 UTC): abuse-cost-protection 90 · call-workspace-guards 18 ·
campaign-claim-contact 67 · claim-rule 16 · client-tables-admin-only 32 · dashboard-visibility 10 · domain-authority 9 ·
e2e-sales-certification 62 · lead-revive 18 · multi-user-queue 11 · multi-user-rls 70/71 · next-action-human-only 19 ·
next-action-one-flow 29 · next-action-reminders 21 · no-legacy-interested 13 · outreach-ownership 32 ·
ready-to-sell-paperwork 13 · sales-flow-reliability 33 · sales-media-rls 23 · sales-readiness 38 ·
sales-remove-move-campaign 36 · sales-team-board 41 · salesperson-onboarding-rls 70 · self-sourced-handoff 41 ·
template-requests 10 · v3-signup-attribution 24. Value dumps read and as expected: campaign-ownership (every cross-rep
action `not_found` / `unknown_campaign`, own launch ok), coverage-found-added, feedback, monthly-commission-tiers,
notifications, payment-ledger, whatsapp-unread.

How to run one: send the file as one query to the Management API (`/database/query`); the results come back in the error.

## Live edge refusals (unauthenticated, production)

| Call | Answer |
|---|---|
| `findable-checkout` pay, unsigned sign-up (ZZ QA-B4, archived fixture) | 200 `agreement_required` / `not_signed`, agreement URL, **no session** |
| …same sign-up, another lead in the body | same — the sign-up's own lead is used |
| …an already-paid client (ZZ QA-B1) | 403 `already_client` |
| …no sign-up | 400 `bad_request` |
| `stripe-webhook` unsigned / wrong QA secret | 400 "Missing stripe-signature" / 401 |
| `quick-close`, `paid-client-hub` (list, confirm access date), `prospect-preview`, `sales-earnings` | 401 no auth header |
| `search-leads`, `create-ai-audit`, `legacy-checkout-cutover` | 401, 0 Google calls |

Side effects: three `client_error_reports` refusal rows (the designed record) and an idempotent upsert of the fixture's
own agreement-link row. Nothing else.

## Visual QA

Operator screens were **rendered from the real components with fixture data** (a Vite build of this branch's `src`,
Supabase client and auth mocked, headless Edge with every host except localhost blocked — no backend reached, no
sign-in). The public pages were loaded live, read-only. **Nobody has seen any of these screens live.** Screenshots:
session scratchpad `harness/shots/` (not committed).

| SCREEN | 1440 | 390 | RESULT |
|---|---|---|---|
| 1 Sales dashboard | rendered | rendered | E2E-14 (P2 wording / clipping) |
| 2 Find Leads, not ready | rendered | rendered | banner lists the real missing items + team-guide button; pressing Find Leads made **no search call** ("Find Leads is paused"); E2E-16 (P2) |
| 3 Outreach (rep, own leads) | rendered | rendered | phones wrap at 1440 (P2) |
| 4 Lead workspace Call · Details · Close · History | rendered | rendered | typing safe; E2E-12 Escape; at 390 the script "Copy" button sits under the sticky bar (P2) |
| 5 Quick Close | rendered | rendered | link step gives `findable.live/agree/<token>`, **no Stripe URL**, "Payment only opens after they sign"; not-ready rep → 403 `not_ready_to_sell` toast; **E2E-11 found and fixed**; E2E-13 |
| 6 Agreement page (builder: Build, Optimise, accepted) | rendered | rendered | 3 tick boxes, **none ticked**; only "I agree and sign" before signing — **no pay button**; "Continue to secure payment" only once accepted |
| 6b live findable.live/agreement/ | rendered | rendered | v3, last updated 5 Oct 2026; floating pill overlaps at 390 (P2) |
| 7 Paid Client (Build) | rendered | rendered | timeline Initial £99 → Access Date → Results → Refund Window end → Approval / Payment Start → monthly 0 of 11; Missing Information actions (Ask salesperson / Contact client / Call / Copy request / Find what we already have); Continuing Service £29.99 "manual for now"; E2E-15 |
| 7b Paid clients list | rendered | rendered | clean |
| 8 Team + onboarding panel | rendered | rendered | NOT READY TO SELL + missing items; agreement / notice marked "handled outside LeadFinderOS"; E2E-16 |
| 9 Attribution review | rendered | rendered | "ATTRIBUTION REVIEW NEEDED … No seller has been recorded", Confirm seller / Not credited; clean |
| 10 live /, /pricing/, /refunds/, /terms/, /privacy/, /agreement/ | rendered | rendered | no console errors, no overflow, no stale terms |

Across every screen at both widths: no error boundary, no console errors, **no horizontal page overflow**, no raw
UUIDs / JSON / undefined on screen (except E2E-15's error code), no stale v3 wording (£9.99, £49.99, 8 weeks, ±5).
**P0: none.** Harness-only limits: real data shapes, RLS and edge functions were not exercised by the screens (they
are covered by the live SQL and refusal sections). Style note for Paul: the home page's secondary button says "Get a
free AI audit" (saved preference: "check", not "audit").

## Not tested, and why

- **The live signed-in app** (as Test or as Paul): minting a sign-in session from the service key was refused by this
  session's permission check, and was not worked around. Covered instead by the database rules (as the database
  enforces them for a signed-in user), unauthenticated live refusals, and real components rendered with fixtures.
- A real prospect check, Quick Close `generate_link`, Confirm Access Date and Paid Client actions live: each needs a
  signed-in user (and the check spends).
- Stripe's hosted page, subscriptions, invoices, refunds and disputes: never triggered (code + unit only).
- Meta / WhatsApp cutover, TPS/CTPS: out of scope by instruction.
- Emails: none sent; the Access Date email was rendered locally only.

## Cleanup / proof nothing persisted

After every run: `qa_tmp_autoonboard` absent, 0 QA campaigns, onboarding rows 1 (as before), seller hash
`f3db0eaf4e411a712398327afd0df6a9` (= release record), 0 attribution reviews. Harness files lived in the session
scratchpad and were never committed.
