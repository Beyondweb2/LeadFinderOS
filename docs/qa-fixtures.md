# QA fixture leads on the live database — the pattern (2026-10-01)

Live tests of the operator app run against production data, on hand-made fixture leads. There is no
helper; every session has written its own SQL. This is the pattern all 18 fixtures so far follow, written
down so the next session does not leave one visible in Outreach or counted in a metric.

## Making one

- **Name** starts `ZZ QA` (`ZZ QA7 admin`, `ZZ QA7 sales`) — sorts last, unmistakable. Never reuse a real
  business's name.
- **Id** a fixed, recognisable UUID per batch: `a0a00000-…-a1`, `b0b0…`, … `f0f0…-f1`. The next batch is
  `10100000-0000-4000-8000-0000000001x1` style — anything a real `gen_random_uuid()` would never produce.
- **Owner** `user_id` = the data account; assign the `sales` copy to the Test salesperson
  (`sales-test@leadfinder.invalid`, already in `metric_exclusions` as a user).
- **No contact details**: `phone`, `email`, `website` NULL. If a test needs a phone, use the Ofcom drama
  range `07700 900xxx` and clear it at the end. Never a real number: the queue, templates and the Inbox
  act on phones.
- **Excluded from metrics**: one `metric_exclusions` row per lead, `kind = 'lead'`, `value = <id>`,
  `reason = 'QA fixture <UK date>: <what it tests> (no phone, never messaged)'`. Use the real UK date (see
  the What's New dating rule — `scripts/sales-feedback.test.ts`).

## Ending a test (always, even if the test failed)

1. Archive every fixture (`is_archived = true`, through `lead_set_archived` / the app so History records
   `archived_set`). An archived fixture still opens by `?lead=<id>` for a later check; it never shows in
   the active Outreach list, for the admin or the salesperson.
2. Clear any phone / email you set.
3. Keep History and `metric_exclusions` rows — they are the record. Do not delete fixtures.
4. Run the check below; every row must say `is_archived true`, `no_contact true`, `excluded true`.

```sql
select l.business_name, l.id, l.is_archived, (l.phone is null and l.email is null) as no_contact,
       exists (select 1 from metric_exclusions e where e.kind = 'lead' and e.value = l.id::text) as excluded
from outreach_leads l where l.business_name ilike 'ZZ QA%' order by l.business_name;
```

## Consequence worth knowing

A salesperson whose only leads are archived fixtures (the Test salesperson today) has an **empty active
Outreach list**. That is expected, not a visibility bug — see `docs/workspace-declutter.md` pass 2 and the
pin in `scripts/workspace-declutter.test.ts`.

## State on 2026-10-01

All 18 fixtures (`ZZ QA` … `ZZ QA6`) checked: archived, no phone or email, excluded. Nothing needed
cleaning; the QA6 pair was archived by its own session at 10:16 UK.

## Since 04/10/2026 — the QA safety layer (src/lib/qaSafety.ts, docs/pre-sales-certification/README.md)

- A fixture MAY now carry a phone, but only from Ofcom's drama range **07700 900000–900999**, and an email
  only of **paul@move37.fun**. Every WhatsApp sender SIMULATES a send to a fixture (its lead id / phone in
  metric_exclusions, or a 07700 900xxx number): nothing reaches Meta, the row is `simulated` /
  `test_mode=true`, and the lead advances as a live send would. Before 04/10 a drama-range number DID
  reach Meta (it passed every gate) — the older fixtures relied on "no phone" or the town gate.
- A REAL lead held by a test account, or a send pressed by one, is REFUSED (`qa_test_account`).
- Payment success is simulated with `scripts/qa-simulate-payment.ts` (CRON_SECRET-gated, fixture-only,
  no Stripe customer). The exclusion row must exist BEFORE the payment (the commission stamp is never redone).
- An archived fixture leaves the Paid Clients list; the admin team view of sales performance excludes
  fixtures and test accounts.
- ZZ QA12 (`10800000-0000-4000-8000-0000000008a1`, onboarding `…08b1`) is the coordinator's smoke test
  of all of the above: paid by simulation twice (idempotent), archived, contacts cleared. Leave it.
