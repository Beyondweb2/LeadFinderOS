# Six-month forecast, Next Action CTA, crawl-first hook questions (2026-10-01 → 02)

Branch `forecast-nextaction-crawl`. Not merged or deployed at the time of writing (Paul: "do not merge/deploy until reviewed").

## 1. Trailing commission: the next six

- **Rule** (`src/lib/commission.ts` `recurringEarns`): the first payment earns by the monthly tier (unchanged, stamped
  by the database). Each later monthly payment n (n = 2, 3, …) earns **20% of the amount actually received** when
  n ≤ 7 — i.e. the next six — **provided** that for n = 5, 6, 7 the payment was received on or after
  `COMMISSION_RECURRING_SIX_FROM` (2026-10-01 00:00 London = `2026-09-30T23:00:00Z`). Payments 2–4 earn as before
  whatever the date. Payment 8 onwards earns nothing.
- **Not retrospective**: a payment 5 (4th monthly) received in September stays £0 and is never re-rated; payments 6
  and 7 of the same client received after the change earn.
- Unchanged: the monthly 30/40/50 ladder, the London month, the stamped first-payment rate, refunds / chargebacks
  (a reversal at the rate of the payment it reverses), test exclusions, the contract cap (`contract_total_payments`
  — Optimise has 5 monthly payments, so it earns at most 5), pricing.
- No SQL: the database stamps only the first payment's rate; recurring commission is derived in TypeScript.
- Edge functions that read `commission.ts` (redeploy on release): `sales-earnings`, `sales-performance`,
  `admin-overview`, `business-summary`, `stripe-webhook`.

## 2. The six-month forecast

`commissionForecast(lines, clients, today)` in `commission.ts`, built server-side in `_shared/earnings.ts` (returned
by `sales-earnings` as `forecast`). Six London calendar months: this month + the next five.

- **Earned** (collected): the month's commission lines (the same lines as the ledger totals), split new sale (payment 1)
  / monthly; a refund or chargeback in the month comes off the bucket of the payment it reverses and is listed as itself.
  This month's collected equals `totals.earnedThisMonth`.
- **Expected**: for each client with `subscription_status` active or trialing, its `commissionablePaymentsLeft` (the
  six rule, capped by the contract) at 20% of its monthly amount (the last monthly received, else `FINDABLE_MONTHLY_GBP`),
  dated from `subscription_renews_at` (Stripe's next billing date) and one month apart. A date already passed with no
  payment is not expected; past due / cancelled expects nothing; no billing date → listed as "not counted yet", never
  placed in a month. Never a hypothetical sale.
- **Header**: Earned this month · Total earned to date · Expected next 6 months · 6-month total (= the sum of the six
  blocks). "Earned this month" moved off the ladder (drawn once); the ladder shows what is due at the next payout.
- UI: `src/components/salesDash/CommissionForecastCard.tsx`; six columns from lg, three on a tablet, stacked on a phone;
  each month is a button opening the per-client list.

## 3. "+ Set next action" in place of Find email

- Inbox thread header: `<NextActionEditor lead={activeLead} variant="pill" />` — "+ Set next action", or
  "Call · Tomorrow · 14:30"; opens the same `NextActionForm` and the one write (`saveNextAction`); the ✓ completes it.
- Find email removed from salesperson surfaces (admin keeps it, `perms.enrichLeads`): the Inbox header (gone for
  everyone — the pill took its place), the lead popup tools row, the prospect facts Email row, Find Leads' bulk "Find
  emails" / "Add all with emails". The Outreach toolbar was already admin-only. No email data, column or function removed.

## 4. Crawl first, then the hook questions

website → crawl (`crawl-check`, or a fresh stored row) → `result.serviceEvidence` (`serviceCandidates`: menu links,
homepage "Services" section headings, sampled pages' title/h1 — each with its source) → `verifiedServices` (clean, drop
towns / brands / about-type pages / model codes / the bare trade word / lone generic words, merge one intent, rank by
the site's own prominence) → `pickServicesForQuestions` (three distinct intents) → the generator's "Known for" line →
the same three hook questions × two engines.

- `_shared/hook-services.ts` `resolveHookServices`: reuses a lead crawl row younger than 30 days with
  `serviceEvidence`; otherwise calls `crawl-check` (internal, `deep: true`, 45 s ceiling) — the post-audit crawl in
  `process-ai-audit-queue` then reuses that row, so a lead is crawled once, not twice. Towns come from the lead's town,
  its service areas, the site's location-page cluster, `MAJOR_UK_CITIES` and a `uk_towns` lookup of the candidates.
- **Hook only**: `create-ai-audit` calls it when `hook_audit` and purpose is ordinary and not a re-run. Baseline,
  measurement, re-measure, free check, discovery and weekly check generation is byte-for-byte unchanged.
- A reviewed preview sent back verbatim reads the stored row only (`crawlIfMissing: false`) — no second crawl.
- **Fallback** (`basis.source = 'fallback'`, reason `no_website` / `crawl_failed` / `no_services_found` / `not_checked`):
  the questions are what they were (trade + town). Internal — the card shows nothing.
- Stored: `results.hook.basis` = {source, services, reason, crawledAt, reused}; the preview returns `basis`. The hook
  card and the proposed-questions box show "Audit based on …" only for a crawl basis.
- **Cost**: no new paid API. Question count unchanged (`HOOK_SCORE_QUESTIONS`), so Apify spend per hook is unchanged.
  The crawl is free HTTP and moves earlier rather than being added. Latency: up to ~35–45 s on a lead's first audit when
  no fresh crawl exists.

### Real-site extraction (2026-10-01, `serviceCandidates` + `verifiedServices`, live HTML)

| Site | Picked for 3 questions | Also verified |
|---|---|---|
| peteheatingserviceltd.co.uk | Boiler Repair · Boiler Installations · Annual Boiler Servicing | Hot Water Cylinders, Heat Pump Services, Radiators & Pipeworks, Domestic Electrical Services, Gas Safety Checks |
| smartplumbingheatingbristol.co.uk | Electrical Installations · Boiler Install and Repair · Underfloor Heating Installer | Heat Pump Installers, Air Source Heat Pump Installers, Emergency Heating Engineer, Hot Water System Install, Water Heater Installation |
| locksmithsmanchester.co.uk | Emergency Door Repairs · Emergency Locksmiths · Commercial Services | Wall Safes (merged with Wall Safe Installation), Fire Doors, Joinery Services |
| gkplumbing.net | New Boilers · Boiler Repairs · Boiler Servicing | New Gas/Oil/LPG/Electric Boiler, Landlords |
| parkesplumbing.co.uk | Boiler Repairs (one service found; the other two questions top up with trade + town) | — |

Known weak spots: menu labels that are a customer group ("Landlords") or a category ("Commercial Services") pass as
services; a site whose menu is images or JavaScript yields nothing (fallback).
