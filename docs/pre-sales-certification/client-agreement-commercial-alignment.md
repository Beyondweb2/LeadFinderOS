# Client Service Agreement v3 + commercial alignment (2026-10-05)

Branch `feature/client-agreement-commercial-alignment` (worktree `LeadFinderOS-wt/client-agreement-commercial-alignment`),
cut from `origin/main` `ac9b8a07` (the D + E ownership / client-info production release). **Not merged, no migration
applied, no function deployed, no Stripe customer touched.**

Legal source, read in full before coding: `Downloads\findablecontractsteamguidenotesandsetuppackplease\`
`Findable_Client_Service_Agreement_v3_clean.docx` and `Findable_Paul_Checklist_Risks_and_Actions.docx`.
⛔ The signed agreement is authoritative over LeadFinderOS. Every rule in `src/lib/clientTimeline.ts` cites its clause.

## 1. Old vs new timeline

| | Before (live today) | v3 (this branch) |
|---|---|---|
| Agreement | Optional: a Stripe checkout tick (binding), and an agree page sent AFTER payment | **Required BEFORE payment**, on the agreement page only (clause 1.2). No checkout tick. |
| What the rep sends | A naked Stripe Checkout URL (24 h) | **One sign-up link** = `findable.live/agree/<token>` |
| First £99 monthly | Fixed: sign-up + 42 days (Stripe trial) | **Payment Start Date** = day after the Refund Window (5.6) |
| Refund window | "within 14 days of your results" | 14 days after the **Results Date** (the day the formal results are SENT) (5.3, 5.4) |
| Fallback | — | No access within 30 days of the £99, or access withdrawn → guarantee ceases (5.8) → Payment Start = day after six weeks from the £99 (5.6) |
| Access Date | Not a concept | Paul confirms it (5.1); starts the clock; the baseline waits for it (5.2) |
| Guarantee | Pooled % beyond a ±5-point band | **Any increase in the named count** (39→40 of 120 = up; 39→39, 39→38 = not) (5.4) |
| After the minimum term | "Nothing is charged after the last payment" | **£29.99 Continuing Service** until cancelled on 30 days' notice (9A) — manual for now |
| Trailing commission | 20% × next **6** recurring | 20% × first **5** £99 recurring, Build and Optimise; none on £29.99 |
| Initial commission | Earned at payment | **Pending until the Approval Date**, then approved; rate re-worked until then, locked after |

Normal route: AGREEMENT ACCEPTED → £99 → ACCESS DATE → BASELINE → ~4 weeks → RESULTS DATE → 14-day Refund Window →
APPROVAL DATE (next day) = PAYMENT START DATE → first £99 monthly → … → last minimum-term payment → £29.99 Continuing Service.

## 2. The agreement (v3, verbatim)

- `src/lib/clientAgreement.ts` — version `v3`, **generated from the .docx paragraphs** (clause numbers, bold run-in leads,
  lettered items (a)–(i)), not retyped. `scripts/fixtures/client-agreement-v3-source.txt` is the .docx's plain text;
  `scripts/client-agreement-v3.test.ts` proves all 113 clause paragraphs appear verbatim and in order, and pins the v3
  template fingerprint `3e1edf3b…`. v1 is untouched (fingerprint `10b3fd55…` still pinned) so copies already signed render
  and verify exactly.
- New block kind `item` (lettered sub-items), `keyPoints`, `sectionTitles`; v1's rendering is byte-identical.
- The page (`agreementPageHtml.ts`) shows: the client's details, **the chosen offer** (figures from the constants), the
  KEY POINTS box, the **full** agreement, then the form. Three ticks, **none pre-ticked**: the consent sentence ("I agree…
  my electronic signature"), a separate **authority** confirmation (clause 1.4), and the optional **marketing opt-out**
  (clause 12.4). Button: **I agree and sign**. Payment appears only after signing.
- The PDF copy (`agreementPdf.ts`) renders v3 (key points, lettered items, section titles).

## 3. Acceptance evidence

`client_agreement_acceptances` (write-once, hand-made table) gains `onboarding_id`, `authority_confirmed`,
`marketing_opt_out`, `commercial_terms`. A v3 row stores: lead (client), business name, version, the exact agreed text and
its SHA-256, the selected route (Build / Optimise), accepted_at (DB time), typed name + role, legal name, company number,
address, email, phone, website, IP and user agent, the sign-up it binds to, authority confirmation, terms.
- DB check `v3_acceptance_is_complete` refuses an incomplete v3 row; unique index = one v3 signature per sign-up.
- The emailed copy: `client_agreement_emails` logs every send with what Resend answered (`sent` / `failed` / `refused`
  + provider message id). The page says "we have emailed a copy" **only** when Resend accepted it.
- The acceptance for a legacy paid client (no open sign-up) still signs **v1**, post-payment, as before — never v3's terms.

## 4. Payment gate (server-side, every path)

`findable-checkout` is the only creator of Stripe Checkout Sessions. It now:
1. runs every existing refusal (paid, serve gate, route, domain, closed client, trade, no lead);
2. upserts the client's agreement link — **fails closed (503) if it cannot**;
3. `purpose: "signup_link"` (Quick Close) → returns the agreement URL, **never a session**;
4. otherwise reads the v3 acceptance for **this lead + this onboarding row + current version** and runs
   `checkoutAgreementGate` (`src/lib/signupGate.ts`): must be agree_page, current version, same lead, same sign-up, same
   route, authority ticked, text re-hashes to its fingerprint. Any failure → `{ ok:true, kind:"agreement_required", url }`
   — no session; the self-service site already navigates to `url`, so it lands on the agreement page with **no
   findable-site change needed**;
5. only then creates the session, carrying `agreement_acceptance_id`, `agreement_version`, `commercial_terms`,
   `payment_timing=option_b`. `consent_collection` (the tick) is gone. Cancel returns to the agreement page.

Bypass protections:
- Quick Close: `linkUsable` is false for any stored link that is not a sign-up link — a pre-v3 Stripe URL is never handed
  over again, and the next press stores the sign-up link and **expires the old Stripe session**.
- The agreement page pays only via findable-checkout and only forwards to a `https://checkout.stripe.com/` URL; a stale
  page for an older sign-up can neither sign nor pay; "pay" before signing is refused.
- Objects created BEFORE the switch (open Checkout Sessions, hand-made Payment Links) are invalidated by the
  controlled cutover (§14), and anything Stripe still completes without a valid v3 signature is HELD by the webhook
  backstop (§15). ⛔ An alert after an unsigned payment is NOT the gate — the first version of this branch did only that;
  corrected the same day.

## 5. Access / Results / Approval dates

All derived in `src/lib/clientTimeline.ts` (UK calendar days, Europe/London incl. BST), never stored:
- **Access Date** (5.1): stored when Paul presses **Confirm Access Date** (Paid Client page). Refused while a route-specific
  required checklist item is missing (`ACCESS_REQUIREMENTS`: Build = business, contact, services, areas, domain, GBP;
  Optimise = business, contact, services, areas, website, website access, GBP) — never inferred from non-null fields.
  Confirming: stores date/time/by, logs history, emails the client the date (recorded as sent only on Resend ok), and
  lets the baseline start (`startPaidBaseline` returns `awaiting_access_date` for a v3 client until then).
- **Results target** = Access + 28 (a due date, with a reminder 7 days before), normally by Access + 42.
- **Results Date** = the day `remeasure_results_sent_at` is stamped (the formal results actually sent).
- **Refund Window end** = Results Date + 14. **Approval Date = Payment Start Date** = + 15.
- **Fallback**: Paul records "the guarantee no longer applies" with a clause-5.8 reason → Payment Start = initial £99 day
  + 43 (never earlier than the day after recording; an earlier real Refund Window end wins).
- `remeasure_due_date` is still set at baseline freeze + 28 (unchanged mechanism; "about four weeks", 5.3).

## 6. Guarantee

`numberWentUp(c)` = `guaranteeNumberWentUp(before.named, after.named)` — the pooled count of named answer opportunities on
the matched questions and both engines. Any increase counts. The ±5 band remains only on operator comparison screens; no
client sentence mentions it. Comparability gates (same questions, engine balance, enough cells) still HOLD results for
Paul — they are never a threshold on the number. 20 questions × 3 runs × ChatGPT + Gemini = 120 is unchanged.

## 7. Stripe architecture (researched, not guessed)

Stripe API reference (Update a subscription, `trial_end`): "The billing_cycle_anchor will be updated to the trial_end
value … Can be at most two years from billing_cycle_anchor." So:
1. At sign-up (webhook) a v3 subscription is created **on a hold**: `trial_end` = sign-up + `PAYMENT_START_HOLD_DAYS` (365),
   metadata `payment_timing=option_b`, the same claim + Idempotency-Key as before. Nothing can be charged early.
2. When the Payment Start Date exists (results sent, or fallback recorded), `_shared/client-terms.ts schedulePaymentStart`
   re-derives it, refuses anything inside the Refund Window (`chargeAllowedOn`), refuses a subscription that is not ours /
   not option_b / not trialing, POSTs `trial_end` (10:00 UK on that day) + matching `cancel_at` + `proration_behavior=none`
   with Idempotency-Key `findable-payment-start-<sub>-<trial_end>`, then **reads the subscription back** and records
   `payment_start_confirmed_at` only if Stripe's `trial_end` matches. Re-running is a no-op. Later payments fall on the same
   date each month (Stripe clamps short months, clause 3.1).
3. The results sender calls it right after a confirmed send; Paul's **Set Payment Start Date** button calls it; a failure
   emails Paul and is an action on the client page. Failure can only ever charge LATE.
Legacy subscriptions (Ronnie, MCL, …) keep their six-week timing; the scheduler refuses them.

## 8. Continuing Service (£29.99) — manual

- `FINDABLE_CONTINUING_GBP` (one constant). Build: hosting + monitoring + reasonable updates; Optimise: monitoring +
  reasonable updates (9A.2). The minimum-term subscription still ends at `cancel_at`; **nothing switches to £29.99**.
- `minimumTerm()` computes completion from **successfully collected** recurring payments (a late payment moves it):
  final payment day, Continuing Service start (same date), client reminder due (start − 30 days, 9A.3), Paul's action day
  (reminder − 14).
- Paid Client card: **Prepare Continuing Service**, **Record client reminder sent**, **Client will continue**, **Client will
  cancel** — bookkeeping + history only.
- When the minimum-term subscription ends on a v3 client, the webhook does NOT send "it stops"; it emails Paul to set up or
  close the Continuing Service by hand.

## 9. How Paul is told

- The Paid Client page card (`ClientTimelineCard`) lists the derived actions and every date.
- `cron-run` (02:00 daily) → `notifyTimelineActions`: one `team_task` notification per client / action / due day
  (deduped): confirm access, 30-day access deadline, results due, Payment Start not confirmed in Stripe, Continuing Service
  reminder due / overdue, decision before start.
- Operator emails: paid without the v3 agreement; Payment Start not set after results; minimum term complete.

## 10. Manual now vs automation-ready

`CONTINUING_SERVICE_AUTOMATION = { clientReminderEmail: false, stripeSwitch: false, autoState: false }`. The data model
already holds everything each switch needs (reminder due day, decision, prepared/sent stamps, the price constant, the
subscription id and option_b marker), so enabling one is a job + a flag, not a schema change.
Manual today: confirming the Access Date, recording the 5.8 fallback, the 30-day client reminder, the continue/cancel
decision, creating the £29.99 subscription, any refund (Paul refunds in Stripe; the app never moves money).

## 11. Commission audit and changes

Audit of the live engine (`src/lib/commission.ts`, derived from `payment_ledger`, nothing stored but the initial tier stamp):
ladder 30/40/50 per London month ✔; refunded sales stop lifting later ones ✔ (never re-positioned); trailing 6 ✗ (v3: 5);
initial earned at payment ✗ (v3: pending until Approval); no Continuing Service concept ✗; no per-sale terms ✗.
Changes, gated to clients with a `client_service_terms` row (v3) so **no historical commission moves**:
- `LineStatus` gains `pending` and `cancelled`; totals gain `pending` (never in earned / due / offset).
- v3 initial: Pending until the Approval Date; owed in the Approval month, paid the first working day after; full refund
  inside the window → cancelled; partial → reduced in proportion; refund after the Approval Date → unchanged.
- v3 ladder place: re-worked as of the Approval instant (refunded / lost / test sales removed), locked after — derived,
  not stored. UK month.
- v3 trailing: `COMMISSION_RECURRING_COUNT_V3 = 5`; a recurring payment below £99 is the Continuing Service → 0%.
- The seller's notification says "+£X commission pending" for a v3 sale.
- Terms per sale = the `client_service_terms` row (stamped from the signed acceptance at payment).
Not changed (flag for Paul): exclusions marked AFTER a sale is stamped do not re-stamp it; misconduct / leaver types,
disputes-hold, payment runs and statements are as before.

## 12. Migration and functions

Migration (NOT applied): `supabase/migrations/20261010090000_client_agreement_v3_commercial.sql` — additive: 4 columns + a
check + a unique index on `client_agreement_acceptances`; new `client_agreement_emails`, `client_service_terms` (guard
trigger), `client_service_events` (append-only); RLS on, no grants to anon/authenticated. Read-back queries at its foot.

The migration also creates `client_payment_holds` (§15).

Deploy order: **the cutover process in §14** — it is the deploy order.
Functions whose code changed directly: client-agreement, cron-run, findable-checkout, paid-client-hub, quick-close,
stripe-webhook, and the NEW `legacy-checkout-cutover` (its `config.toml` entry, `verify_jwt = false`, handler-side auth,
is in this branch). Every function reaching a changed shared module (`check-import-graph --reached-by`), 35 in all:
admin-overview business-summary client-agreement conversation-triage create-ai-audit cron-run findable-checkout
findable-onboarding legacy-checkout-cutover market-view mockup niche-sample page-generator paid-baseline paid-client-hub
process-ai-audit-queue process-whatsapp-queue prospect-preview quick-close render-audit-report render-remeasure-results
render-welcome-pack run-seo-scan sales-earnings sales-performance send-whatsapp-media send-whatsapp-message
send-whatsapp-voice site-enquiry stripe-webhook submissions voice-note-script warm-lead-reply weekly-visibility, and
**whatsapp-status**.
⛔ **whatsapp-status is HELD in production (v114) and must NOT be deployed or modified by this release.** It is reached only
through `_shared/whatsapp-inbound.ts` → the audit / offer modules (offer wording in `findableOffer.ts`, and the v3
Access-Date guard inside `startPaidBaseline`, which the inbound path does not call). Leaving it on its deployed version
changes nothing about payments, agreements or commission.

**Owed outside this branch (findable-site, separate repo, not touched):** /refunds (checklist Part 16), /terms, the pre-pay
screen's copy of the card notice and the plan card's "six weeks" wording, `GUARANTEE_PAYMENT_TWO_LINE` (no longer reachable
on v3). The byte-locked guarantee constants were deliberately NOT changed so cross-repo sync stays green.

## 13. Tests

New: `client-agreement-v3.test.ts` (verbatim, version pin, evidence, not pre-ticked, gate refusals, server-side order,
email logging), `client-timeline.test.ts` (Option B dates, fallback, no early charge, BST, minimum term from real payments,
Continuing Service reminders, guarantee +1, access readiness, baseline gate), `payment-start-schedule.test.ts` (fake Stripe:
hold, refusals, idempotency, read-back), `commission-v3-terms.test.ts` (30/40/50, re-positioning and lock, UK month, five
trailing, £29.99 none, pending / approved / cancelled, late refund, legacy unchanged).
Updated to the v3 rules (17 suites): call-workspace, client-agreement, client-copy-claims (now allows £29.99 only as the
Continuing Service, and the verbatim clause 12.2(e) sentence), cold-call-playbook, commission-six-trailing,
customer-lifecycle, findable-offer-terms, paid-client-hub-resilience, payment-client-state, pre-sales-final, qa-safety,
quick-close-links, quick-close, remeasure-results, sales-commission, service-route-terms, wave1-integration.
New in the correction pass: `legacy-cutover.test.ts` (the bypass trace, the cutover against a fake Stripe, the code scan
that exactly one place can create a session, the webhook backstop's order and what it does not write) and the ladder
boundary cases in `commission-v3-terms.test.ts`. Agreement parity: `scripts/check-agreement-parity.ts` (§17).

## 14. Legacy payment bypass — trace and controlled cutover (correction, 2026-10-05)

Paul's rule: **no payment may be taken for a new v3 sale without the v3 agreement acceptance; the system fails closed.**

**What could still take money before the switch (traced):**

| Path | Payable? | Closed by |
|---|---|---|
| A new session from `findable-checkout` (Quick Close, questionnaire, agreement page, a direct POST) | No — the v3 gate refuses without a signature | the gate (§4) |
| A Checkout Session created by the OLD checkout and still open (≤ 24 h), incl. the one behind a Quick Close link already sent to a prospect | **Yes** | cutover: EXPIRE |
| A hand-made Stripe **Payment Link** — the docs record one "kept for sending manually on WhatsApp" (founder era); no code ever created one, so only Stripe can list them | **Yes, until deactivated** — and its payments used to leave NO trace (no onboarding id → the old barber branch) | cutover: DEACTIVATE; backstop holds any payment |
| A Quick Close row storing a Stripe URL | Only while its session is open | never reused (`linkUsable`); its session is expired by the cutover |
| Cached / emailed / WhatsApp-sent Stripe URLs | Only while their session is open | the session expiry |
| The self-service onboarding URL | No — it goes through the gated checkout | the gate |
| Any other Stripe write in code | None — the scan finds exactly one session creator (`findable-checkout`), no Payment Link creator, no stored `buy.stripe.com` URL | — |

The live Stripe objects could not be listed from this session (the Stripe key exists only inside the edge functions), so
the REAL counts come from the cutover report, run by the integration session.

**The tool:** fn `legacy-checkout-cutover` (rules `src/lib/legacyCutover.ts`, I/O `_shared/legacy-cutover.ts`). Auth:
`x-cron-secret` = CRON_SECRET, or an admin session.
- `POST {}` → **read-only report**:
  ```
  LEGACY FINDABLE CHECKOUT CUTOVER
  Open legacy Checkout Sessions: X
  Active legacy Payment Links: X
  Stored legacy Quick Close links: X (still payable: X)
  Other bypass paths: X
    EXPIRE session cs_… (Quick Close link already sent) · lead … · sign-up …
    DEACTIVATE Payment Link plink_… — a Findable price or name
    REVIEW Payment Link plink_… — could not tell if it is Findable
  Left alone: … signed v3 session(s), … non-Findable session(s), … non-Findable Payment Link(s).
  Plan hash: …
  READY / NOT READY
  ```
  Targets ONLY Findable sales paths: an open session carrying `onboarding_id` and no v3 terms; an active Payment Link
  whose metadata or line item names Findable or charges a historic Findable first-payment price (£19.99, £49.99, £99) in
  GBP, plus its open sessions. Never touched: completed sessions (history), signed v3 sessions, sessions / links of other
  products. A Payment Link nobody can classify is listed under REVIEW and counts as an "other bypass path" until Paul
  decides — never guessed.
- `POST { mode: "execute", plan_hash, confirm: "INVALIDATE LEGACY FINDABLE CHECKOUT" }` → re-reads Stripe, **refuses
  unless the plan is byte-for-byte the one reviewed** (same hash), deactivates the listed links first (Stripe:
  `active=false`, reversible), expires the listed sessions, logs `legacy_checkout_cutover_executed`, and reports again.

**THE CUTOVER PROCESS (this is the deploy order; the integration session runs it, not this branch):**
1. Tell the team: no new links for the next hour (sales pause for the cutover window only).
2. Apply `20261010090000_client_agreement_v3_commercial.sql` one block at a time; read back (queries at its foot).
3. Deploy **stripe-webhook** — the backstop is live from here: any unsigned payment is HELD.
4. Deploy process-ai-audit-queue, paid-baseline, paid-client-hub, cron-run, sales-earnings, sales-performance,
   admin-overview, business-summary, client-agreement, quick-close, **legacy-checkout-cutover** (+ the other functions
   §12 lists for wording; **never whatsapp-status**).
5. Deploy **findable-checkout** — the gate is on. Prove it by marker (`agreement_required` / `signup_link` in the bundle).
6. Run the cutover **report**. Paul decides every REVIEW link (deactivate it in Stripe, or confirm it is not Findable).
7. Run **execute** with that report's plan hash and the confirm phrase.
8. Run the report again until it says **READY**. Record the before/after reports in the release record.
9. Run the agreement parity check (§17) and deploy findable-site's v3 /agreement, /terms, /refunds.
10. Resume selling. Watch `client_payment_holds` (it should stay empty).

**PAYMENT GATE READY** — conditional, and only in this sense: in this branch's code there is no supported route to a
Stripe payment without a valid v3 acceptance (the one session creator is gated; Quick Close never hands out a Stripe URL;
stored Stripe links are never reused), and every pre-switch Stripe-side path (open sessions, Findable Payment Links) is
identified and invalidated by the documented cutover, which refuses to report READY while anything payable or unclassified
remains. It becomes true in production only when step 8 reports READY. Anything Stripe still completes after that is held
(§15), never processed.

## 15. Webhook backstop (defence in depth, not the gate)

`_shared/payment-hold.ts`, run at the very start of a completed Findable checkout, BEFORE the paid state, the ledger and
the subscription:
- A replay of a payment the ledger already recorded is history → processed as it always was (never re-judged).
- Otherwise the session must name a v3 signature (`commercial_terms` v3, current version, `agreement_acceptance_id`) that,
  read back, passes the gate for the session's client, sign-up and service, with the stored text re-hashing to its
  fingerprint (`webhookV3Verdict`).
- If not → **HELD**: one row in `client_payment_holds` (session, payment, Payment Link, lead, sign-up, amount, payer
  email, reason), a priority notification + an email to Paul, an error-log row — and NOTHING else: the lead is not marked
  paid, no Paid Client lifecycle, no subscription (no recurring billing), no ledger row (so no commission), no baseline,
  no client email. Paul refunds it in Stripe, or has them sign and migrates them by hand.
- A completed **Payment Link** / one-off session with no sign-up (until now it left no trace) is held the same way.
- While a hold is open for a client, `findable-checkout` refuses another payment (`payment_held`) — no double charge.

## 16. Decisions applied (Paul, 2026-10-05)

- **Continuing Service reminder timing — kept.** Paul's action appears 14 days before the client's 30-day reminder is due
  (≈ 44 days before the Continuing Service starts). The client reminder and the Continuing Service switch stay manual.
- **Excluded sales and the ladder — v3 sales only.** A sale excluded / disqualified (metric_exclusions: the lead, or its
  seller as a test account, by `created_at`) or refunded in full BEFORE its Approval Date is not a qualifying sale: it
  earns nothing (`cancelled`) and drops out of its UK month's 30/40/50 count, and every still-pending later sale is
  re-placed. On and after a sale's Approval Date its rate is locked: a later exclusion or status change never re-rates it
  and never cascades backwards through approved sales. Test / invalid records (stamped `test_excluded`) never count for
  anyone. Pre-v3 commission is exactly as it was. Proven at the 12/13 boundary in `commission-v3-terms.test.ts`.

## 17. Cross-repo agreement parity — REQUIRED before deploying either copy

findable.live's public `/agreement` (findable-site `src/lib/clientAgreementV3.ts`, Session G, branch
`legal/client-agreement-v3-alignment`, `7398b4f`) and this signing copy (`src/lib/clientAgreement.ts` v3) were generated
independently from the SAME .docx (sha256 `d0ede629…`, re-checked against Paul's file). The integration session **MUST** run
```
npx tsx scripts/check-agreement-parity.ts --site-ref <the findable-site ref being deployed>
```
and get `IDENTICAL` before deploying either side, and again after any change to either. On 2026-10-05 against
`origin/legal/client-agreement-v3-alignment`: **IDENTICAL — 139 signed paragraphs** (intro, both service boxes, key points,
clauses 1.1–16.7 incl. lettered items, Schedule 1). A one-word change in a copy of the site file was caught (exit 1). The
signed fingerprint (v3 template `3e1edf3b…`) covers the client-filled agreement; the parity check covers the shared words.
