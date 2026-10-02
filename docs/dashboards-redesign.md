# The dashboards redesign (2026-10-02)

Paul: the Sales dashboard looked "weak, messy, old, low quality"; the Admin dashboard was messy but a
better direction. Brief: one shared, modern, more colourful (tasteful), more solid design language; Sales
dashboard first in the sales nav; remove redundant clutter (named: "this month, week by week"); a nicer
commission / progress area and six-month forecast. Functionality and numbers unchanged — layout only.

Branch `feat/dashboard-redesign`. Pinned by `scripts/dashboard-design.test.ts`.

## One design system
`src/components/salesDash/ui.tsx` is the ONLY source for both dashboards (and every admin panel in
`components/admin`, the team board, notifications):
- `TONE` gained `solid` (gradient fill, white icon — panel icon tiles, hero stats) and `tint` (soft
  coloured wash — figures, KPI cards). Colour meaning unchanged: green money, blue activity, amber
  follow-up, purple AI / forecasts, red urgent, grey secondary.
- `SURFACE` — the one card: 1.25rem corners, soft deep shadow. Panel, KpiCard use it.
- `PageHeader`, `SectionHeading` (coloured bar + title + one-line purpose), `Segmented` (pill control:
  admin period, sales follow-up lists), `Figure` (moved from controlCentre — one figure on both pages).
- `gbp` now separates thousands (£1,335.60).
- `StatTile` deleted (unused).

## Sales dashboard (src/pages/SalesDashboard.tsx)
Order: header → **hero** (MonthlyLadder: solid green, sales count, progress line, next-sale rate, earned
this month + due date, three rate steps ticked / current / locked, one dot per sale) → team board +
handoffs (sales role) → three work KPIs → What to do next | Follow-ups → **Your earnings**
(CommissionForecastCard: earned to date / this month / expected 6 months, then the six months as ONE
stacked bar chart, collected green, expected purple, tap for clients) → Recent wins | How your commission
works → (admin: by salesperson) → payments (folded) → More numbers (folded).

Removed: **SalesByWeek** ("This month, week by week" — counted what the hero shows); the explainer's
repeat of rate / tiers / next rate / recurring totals (now four rules only).

## Nav
`SALES_NAV_ORDER` = Sales dashboard, Outreach, WhatsApp, Find Leads (Coverage under More).
`homeFor('sales')` = `/sales-dashboard` (they land on it). Sidebar names the pair "Admin dashboard" /
"Sales dashboard"; phone bar for sales starts "Dashboard".

## Admin dashboard (src/pages/Dashboard.tsx)
Shared header ("Admin dashboard"), segmented period picker, every section a coloured heading with a
purpose line: Start here, Team, Sales intelligence, Money, Clients, Website & usage (Traffic + System
merged — System held one panel), Sign-ups & free checks. Today tiles tinted; list frames unified.

## Verification
Rendered the real app (headless Edge, 1440 and 390 wide) against real responses saved server-side from
admin-overview / sales-performance / sales-earnings (one-off admin session, signed out straight after),
with the Supabase client stubbed — no token in a browser. The "Test" salesperson's real numbers are all
zero, so the full layout was also checked with a demo month built by `commissionLines`.

## Open
- Nobody but Claude has looked at it — Paul to review live.
- On a phone the admin attention rows' action buttons (Assign / Handled) are cramped (pre-existing).
- "This week in plain English" header squeezes beside its button on a phone (pre-existing).
