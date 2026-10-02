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

## Phone polish + deeper green (2026-10-02, branch feat/dashboard-mobile-polish)
- Paul: "green on green with white text looks washed out". The hero is now deep green (emerald-800 → #03261d); the current
  rate step and the earned box are WHITE cards with dark green text; done steps solid dark green, locked steps darker and
  muted; no white washes or faded white text. Solid green (TONE.green.solid) is emerald-600 → 800 (white text readable).
- Phone (< sm): attention-row actions in an even strip under the row (data-testid attention-actions); Panel gained
  `stackAction` (action on its own row; used by This week in plain English); Segmented gained `wrapOnPhone` (follow-up
  lists wrap); the three work KPIs stay one row (KpiCard drops icon and sub-line below sm).
- Checked at 390×844 and 430×932 with the same harness method.

## Dark card direction (2026-10-02, same branch)
Paul: no green hero; the reference is the work tiles (dark navy card, deep coloured wash, coloured edge, solid
icon tile, white number). The money tone (key `green`) is drawn TEAL. Sales hero = dark indigo card, current
rate amber, unlocked teal, locked muted; EarningsStats (earned this month / to date / expected 6 months) beside
it; CommissionForecastCard is the six-month chart only, beside Recent wins; What to do next shows 6 + Show all;
How your commission works is folded.

## Admin = business / sales control centre (2026-10-02, same branch — awaiting Paul's approval)
Paul no longer does most outreach. Order: Business at a glance (revenue this month, new clients this month,
needs you, commission due) → What needs you → Clients (New sales & handoffs; Clients in delivery folded) →
Sales team (Sales team performance — the old Sales team board panel, TeamOversight, was then REMOVED at Paul's request) → Money (one panel) → Sales
intelligence → Website & system → Sign-ups & free checks.
- Rules: `src/lib/adminControl.ts` (`scripts/admin-control.test.ts`). New sales & handoffs = pre-delivery
  (setup / ready) + sold within NEW_SALE_DAYS, from paid-client-hub `list` (the Paid Clients page's own call —
  the canonical setupView: state, done/total, missing, ONE next step). What needs you = the server's attention
  list MINUS `setup_not_started` / `remeasure_overdue` (they contradict Setup → Ready → Discovery → questions →
  baseline) + in-delivery client steps that are Paul's + ONE pointer line for the handoff clients. A handoff
  left HANDOFF_CHASE_DAYS becomes "Chase {seller}" on that client's card.
- Hide my activity: usePersistedState `admin.hideMyActivity` (default true, per person, this device). It filtered
  ONLY the team table rows at first. **Superseded 2026-10-02:** it now scopes every activity figure on the server —
  docs/admin-control-centre.md "My activity: hidden / included".
- Team table: `o.team` (period) + sales this month and rate from fn sales-earnings `all` lines (monthlyTracker
  per sellerId) + last activity = the newest lead_activity / whatsapp_messages row per person (admin RLS) →
  activityStatus (Active within 24 h, Quiet within 3 days, else Inactive). Derived, never stored.
- Removed from the page: SinceYesterday, TeamComparison, FunnelPanel, CallsPanel, RevenuePanel,
  ContributionPanel, CommissionPanel (the components stay in controlCentre.tsx, unrendered).
- No server change, so no backend deploy. Both live salespeople are test accounts (excluded from metrics), so
  the real team table is empty with Paul hidden; the review screenshots used reps named "(demo)".

## Open
- Paul to review live.
