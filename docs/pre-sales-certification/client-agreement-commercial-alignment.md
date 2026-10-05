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
- Stripe sessions already open at deploy (≤ 24 h) could still be paid: the webhook does **not** put them on v3 terms,
  writes `paid_without_v3_agreement`, and emails Paul.

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

Deploy order (integration session): **SQL → read back → stripe-webhook → process-ai-audit-queue, paid-baseline,
paid-client-hub, cron-run, sales-earnings, sales-performance, admin-overview, business-summary → client-agreement →
quick-close → findable-checkout LAST** (it switches the gate on; a v3 session must never reach a webhook that cannot read
it). Then expire any Stripe Checkout Session created before the switch.
Functions whose code changed directly: client-agreement, cron-run, findable-checkout, paid-client-hub, quick-close,
stripe-webhook. Every function reaching a changed shared module (`check-import-graph --reached-by`), 34 in all:
admin-overview business-summary client-agreement conversation-triage create-ai-audit cron-run findable-checkout
findable-onboarding market-view mockup niche-sample page-generator paid-baseline paid-client-hub process-ai-audit-queue
process-whatsapp-queue prospect-preview quick-close render-audit-report render-remeasure-results render-welcome-pack
run-seo-scan sales-earnings sales-performance send-whatsapp-media send-whatsapp-message send-whatsapp-voice site-enquiry
stripe-webhook submissions voice-note-script warm-lead-reply weekly-visibility whatsapp-status (HELD — wording only).
No new edge function, so no `config.toml` change.

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
