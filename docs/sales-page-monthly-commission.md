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
