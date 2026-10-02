# One Sales page, the monthly commission ladder, Focus Mode retired (built 2026-10-01, branch `feat/agency-sales-overhaul`, NOT merged)

## 1. Monthly commission (Paul, 2026-10-01)

- Per salesperson, per **London calendar month**: sales 1–12 → 30% of the initial payment, 13–24 → 40%,
  25+ → 50%. Non-retroactive; resets on the 1st. Recurring unchanged: 20% of the next 3 monthly payments
  actually received. Refund / dispute reversals unchanged.
- **The database stamps it once** (migration `20261003100000`, NOT applied): `stamp_monthly_commission_for`
  numbers a seller's not-yet-stamped initial payments in payment order under a per-seller-month lock;
  place = 1 + the earlier stamped sales that month that **still count** (`commission_sale_stuck`: not fully
  refunded, not lost to a chargeback). A stamped row is never renumbered or re-rated. A test account's or test
  lead's sale (`metric_exclusions` kind user / lead) → `test_excluded`, 0%, no place. Older rows keep their
  rule (`flat_30_v0`, `weekly_tier_v1`). The weekly trigger is dropped; its functions and columns stay.
- Live on 2026-10-01: ONE ledger row (the admin's 17 Sep £99, `flat_30_v0`), no `weekly_tier_v1` row, no
  payout — nothing to convert.
- Examples (£99): sale 12 → £29.70 (30%); sale 13 → £39.60 (40%); sale 24 → £39.60; sale 25 → £49.50 (50%).
- Code: `MONTHLY_TIERS`, `monthlyTierRate`, `londonMonthStart`, `monthlyTracker`, `monthlyTrackerNextLine` in
  `src/lib/commission.ts`. Proved live in a rolled-back transaction (`supabase/tests/monthly-commission-tiers.sql`):
  1–12 30%, 13 40%; sale 3 refunded → the next sale took place 13 (40%), sale 3 kept 30%; a re-touch never
  re-stamps; 1 Nov 00:30 → 30% again; 31 Oct 23:30 → October; both test sales 0% and placeless; the 17 Sep row
  untouched.

## 2. The Sales page (Sales dashboard + Earnings → one page, `/sales-dashboard`; `/earnings` redirects)

Inventory before: the dashboard had a KPI row (commission earned, replies, interested, clients won), the weekly
tier, Today strip, Next best actions, Follow-up queue, pipeline strip, waiting / warmth / health panels, activity
feed, recap, targets, milestones, trends, conversion funnel + "where to focus", campaigns, templates, channels,
sources, calls, won, "how counted"; Earnings had earned / due / projected / reversed cards, the weekly tier
again, the weekly audit, by-salesperson, clients cards, every payment, how commission works, payout dialog.
Commission earned, the tier and the celebration were drawn on both pages.

Now, top to bottom: **the month's ladder** (sales this month, the rate on the next sale, sales to the next
rate, earned this month + due date; one dot per sale, tap → client, date, package, commission, what monthly
payments may still earn; tiers side by side from lg, stacked on a phone) → **three work numbers** (calls made,
people reached, contacted → sale, each with its base) → **what to do next** (the ranked list + Follow-ups:
overdue, due today, replied, interested, sign-up link sent, going cold, **meetings**, **warm**) → **recent
wins** + **one chart** (this month week by week) → **how your commission works** (folded) → **your payments**
(folded; the admin also sees who sold) → **more numbers** (folded: campaigns, WhatsApp messages, channels,
sources). Admin keeps the person picker, Record a payout, By salesperson.

Removed (repeated another card or helped no decision): the KPI row, Today, pipeline, waiting, warmth, health,
feed, recap, targets, milestones, trends, conversion funnel, calls panel, won panel, clients cards, weekly tier
and weekly audit, the Earnings page. Their server numbers (salesWorkspace) are untouched.

## 3. Focus Mode — audited, retired

Unique: stepping lead to lead (Prev / Next, ← →), a ranked queue, Meetings / Warm / Going cold / Sign-up sent
lists, the last 6 WhatsApp messages on the card. Everything else duplicated the lead popup. Moved: Previous /
Next + ← → into the lead popup (through Outreach's filtered, sorted list; a lead that drops out keeps its
place), the lists into Sales → Follow-ups, the messages into the popup (`RecentWhatsApp`, not in the Inbox).
Removed from the sidebar, phone More, shortcuts (`g f`, `g e`), the palette; `/focus` → Outreach (`?lead=`
opens that lead). Salesperson menu: Outreach, WhatsApp, Find Leads, Sales; Coverage under More (no sales-only
Team route exists — the Team board is on Sales).

## 4. Deploy order (when approved)

SQL `20261003100000` (read back: functions, trigger swap, columns) → redeploy every function reaching
`src/lib/commission.ts` / `salesCrm.ts` / `salesWorkspace.ts` / `salesPerformance.ts`: `stripe-webhook`,
`sales-earnings`, `sales-performance`, `admin-overview`, `business-summary`, `conversation-triage` (walk
`node scripts/check-import-graph.mjs --reached-by <file>` again on the merged tree) → push main.


## 5. Six trailing payments, the engagement end, the six-month forecast (Paul, 2026-10-02, branch `feat/commission-six-trailing`)

- **Trailing:** 20% (`COMMISSION_RECURRING_RATE`) of each of the next **six** (`COMMISSION_RECURRING_COUNT`,
  was three) SUCCEEDED monthly payments. The initial payment is not one of the six; monthly payment 7
  onwards earns 0% (listed for history). A failed payment is not a payment (it neither earns nor uses up a
  place); refunds / lost chargebacks reverse; open disputes hold — unchanged. The ladder (30/40/50, stamped,
  not retrospective, London month) is unchanged.
- **Transition:** none needed. Live ledger on 2026-10-02: ONE row (MCLocksmiths' £99 initial, sold by the
  admin → £0), no recurring payment ever, no payout ever. Nothing re-rated, nothing back-dated.
- **Contract cap still binds the PROJECTION only:** Optimise (6 payments total) can forecast at most 5
  trailing payments; Build (12) the full six.
- **Engagement end = Team → Disable** (`team_members.status 'disabled'`, `disabled_at` = the end instant).
  Monthly payments received on/after it: 0%, "Month N · after the engagement ended", status No commission;
  nothing more projected or forecast. Everything earned before stays (never clawed back); the client stays
  attributed (`sellerId` unchanged). Suspension is NOT an end. A disabled row with no date fails closed
  (`ENGAGEMENT_END_UNKNOWN`: no new trailing at all). The first payment after an end earns only when the
  sale was closed while engaged (Paul decided, §6).
- 🔴 **Bug fixed on the way:** the loader keyed "who earns" on the CURRENT `sales` role, and Disable deletes
  that role — so disabling a salesperson would have zeroed every penny they had earned. Now: sales role OR
  an ended team member (admins excluded). Disable now writes the end first (checked), then removes the role,
  and a repeat Disable keeps the FIRST end date.
- (The re-enable gap first recorded here is closed — §6.)
- **Forecast** (`commissionForecast`, server-built in `_shared/earnings.ts`): this London month + the next
  five. Collected = the month's own commission lines (net of reversals). Expected = each active / trialing
  subscription's remaining commission-earning payments, from `subscription_renews_at`, a month apart, at 20%
  of the client's monthly (last recurring amount, else `FINDABLE_MONTHLY_GBP`). A billing date already passed
  is not expected; past due / cancelled expects nothing; undated is listed, counted in no month. Never a
  hypothetical sale.
- **Sales page:** `CommissionForecastCard` (total earned to date · this month collected + expected · expected
  over six months · six month blocks, tap for clients) under the ladder; the ladder's headline is the progress
  line ("1 more sale to unlock 40%" → "40% unlocked · 12 more sales to unlock 50%" → "50% unlocked · every
  sale earns 50%") and the scheme in one line from the constants. Ended salespeople stay pickable for the admin.
- **Inbox header:** "+ Set next action" / the saved action (`NextActionEditor variant="pill"`, the one form and
  the one write) in place of Find email. Find email is admin-only on the lead popup and the facts panel; no
  email field or data touched.
- **Example pinned** (`scripts/commission-six-trailing.test.ts`, through the real engine): 20 sales/month at
  £99 → month 1 £673.20, then +£396 a month, month 7 onward £3,049.20.
- **Redeploy on release:** `sales-earnings`, `sales-performance`, `admin-overview`, `business-summary`,
  `stripe-webhook` (closure of `commission.ts` / `_shared/earnings.ts`), `admin-users`. No SQL.


## 6. The first payment after an end, and the re-enable gap closed (Paul, 2026-10-02)

- **Engagement history** = `team_engagement_events` (migration `20261005100000`): one row per Disable
  ('ended') and Re-enable ('resumed'). The database sets `at` to now() on every insert (nothing can back- or
  forward-date it) and refuses update / delete / truncate; no signed-in role holds any privilege. fn
  `admin-users` writes the event FIRST and stops if it fails. Seeded with an 'ended' for anyone already
  disabled (none on 2026-10-02). A member disabled now whose history does not end in 'ended' gets one at
  `disabled_at` (else `ENGAGEMENT_END_UNKNOWN`) — never "engaged".
- **Each payment is judged at its own time** (`engagedAt(history, occurred_at)`), so a later re-enable only
  appends; it can never make a payment from the ended period commissionable. Paul's example — disabled 1 Jan,
  client pays 15 Jan and 15 Feb, re-enabled 1 Mar — Jan and Feb stay £0 for good; Mar onwards earn again
  inside the six-payment tail (the client's payment count runs on through the gap). This is computed, not
  stamped, but the inputs (the payment's own time, an append-only server-timed history) cannot change, so
  the answer cannot either.
- **First payment received while not engaged** earns its stamped 30/40/50 only if the seller CLOSED the sale
  while engaged. The proof is the one objective record of a close that exists: a payment link the seller
  generated (or re-sent) for that lead through Quick Close — `quick_close_events` `link_generated` /
  `link_reused`, written only by fn `quick-close` with a database-set time (signed-in roles cannot insert,
  update or delete it). Rules: the link's actor is the seller, it was made while they were engaged, before
  the payment. No link (a self-checkout, a link made by someone else, a link made after the end) → 0%. A
  non-earning first payment is not a sale on their ladder.
- ⚠️ Not fixed here (out of scope, flagged): signed-in users hold TRUNCATE on `quick_close_events` (and the
  revoke there named only insert / update / delete). A wipe can only REMOVE closing proof — a seller can
  never fabricate or backdate one — so it fails closed for commission, but it is a hole to close.
- Tests: `scripts/commission-six-trailing.test.ts` §3 (closed before → earned; not closed → £0; recurring
  while disabled → £0; re-enabled → the disabled-period payments still £0; after the re-enable → earns
  inside the six; earned never disappears).
- Deploy: SQL `20261005100000` first (read back), then `admin-users` and the earnings closure
  (`sales-earnings`, `sales-performance`, `admin-overview`, `business-summary`, `stripe-webhook`).
