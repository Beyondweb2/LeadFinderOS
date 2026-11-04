# Four-week results approved and switched on (Paul, 2026-11-04)

Branch `fix/approve-four-week-results`. Paul read every version and approved edits A to G.

## What changed

- **A. Guarantee line.** Not gone up, v6 and v7: "Your number has not gone up, so the guarantee applies: We improve AI visibility or you get your money back." then the claim paragraph. v5's claim is byte-locked to findable.live and unchanged.
- **B. The page matches the email.** It used to say 14 days and £99 to everyone. `resultsTermsCopy` (`_shared/remeasure-results.ts`) is now the one read for both, as at the send stamp. The page names the send date where the email says "the date of this email". A failed read holds the send, or shows the page's error; it never falls back to other terms.
- **C. Essential** is told "We keep the work live." Monthly audits are Complete only (agreement v7 Schedule 1).
- **D. Screens and alerts.** The delivery checklist reads the window from `terms_status` (no date if unknown). The sent record stores the client's own window. Paid-in-full clients no longer raise "MONTHLY NOT SET UP" or "PAYMENT START NOT SET".
- **E. QA.** The sender asks `qaEmailHold` before it claims the send.
- **F. Commission.** `commission_payable_on` is the day AFTER the window (migration `20261208090000`). `commission_payable_days` is still the window. A payment collected on the payable day counts as after the window (the 1st of next month, as before), and a refund on it is not a claim.
- **G. Payment paragraph on not gone up.** "If you don't claim, your first monthly payment of ... is on ...". Replaces Paul's 2026-10-05 rule of naming no payment there. Paid in full has none. Chosen by the builder: the page shows the paragraph on both verdicts so it matches the email, and older terms get it too, because they are charged as well.

v6 stays at 14 days (signed clause 5.4). The footer is unchanged.

## What sending does

Results go automatically: when a replay finishes, and from a 15-minute sweep of unsent replays. Sending stamps `remeasure_results_sent_at`, which starts the refund window, publishes the page, sets the Stripe first monthly date and sets the commission date.

## Live, 2026-11-04 (main 6dcdf14b)

Migration `20261208090000` applied and read back. No ledger row held a date, so nothing moved. Fifteen functions deployed, the whole import closure of the change: render-remeasure-results, paid-baseline, process-ai-audit-queue, sales-earnings, sales-performance, admin-overview, business-summary, client-intake, client-onboarding, commission-stripe-check, conversation-triage, findable-onboarding, paid-client-hub, quick-close, stripe-webhook. `whatsapp-status` was not touched.

`supabase/tests/commission-fixed-amounts.sql` passed in a rolled-back transaction with the new date. `supabase/tests/commission-owed.sql` stops at its first check ("existing rows moved off legacy: 2"), which assumes no newer rows exist, so it is out of date since the fixed-amount migration and did not run.

## Not proven live

No client has a finished re-measure, so the Send button appears nowhere and nothing has ever been sent. The switch was confirmed by reading the deployed function code. The first real send is the first real test.
