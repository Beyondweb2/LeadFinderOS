# The Plan Period reminder (Client Service Agreement v6, clause 9A.5) — 2026-10-29

## What the agreement promises

v6 9A.5, last sentence: **"We will remind you before the Plan Period ends that you can opt in."** — to the optional
£29.99/month Hosting and Maintenance service (9A.2). 16.6: notices by email to the recorded address. So: one EMAIL to
the "Email for notices" on the client's signed acceptance, from `PLAN_PERIOD_REMINDER_LEAD_DAYS` (30) days before the
Plan Period ends, never on or after that day.

When the Plan Period ends (v6 2.6, 9.2):

| Plan (signed acceptance `payment_plan`) | Plan Period ends |
|---|---|
| `full` — Pay in full | 6 months (`FULL_PAY_HOSTING_INCLUDED_MONTHS`) after the built site first goes live (`outreach_leads.site_first_live_at`) |
| `six` — 6 months | the final (6th) payment: `finalPaymentDates` with the plan's 5 recurring payments |
| `twelve` — 12 months | the final (12th) payment: 11 recurring payments |

- Paul asked for Pay in full and 6 months. **12 months is included too**: its signed v6 text carries the same promise and
  the v5 payment-12 reminder (fn `month12-reminder`) only matches the v5 sentence, so without this nobody would send it.
- The old £99 × 12 plan (v5) keeps fn `month12-reminder`. The two sentences never both match: no client gets both.
- The test is the signed TEXT plus the signed plan, never a version label.

## How it works

- Rules: `src/lib/planPeriodReminder.ts` (`planPeriodEnd`, `planPeriodReminderVerdict`, `planPeriodReminderEmail`; every
  "no" named). The email restates only 2.6, 8.4, 9.2, 9A.2–9A.5; it is in `client-copy-claims.test.ts`.
- `clientTimeline.minimumTerm` takes an optional `recurringPaymentsNeeded` (the plan's count). Absent = the route's count,
  so every other caller is unchanged (no redeploy of the functions that bundle it was needed).
- Go-live day: `outreach_leads.site_first_live_at`, stamped by trigger `trg_stamp_site_first_live` the first time
  `website_build` is recorded live (`production_status` deployed/verified, or v1 `deploy_status` production). Immutable
  once set; a direct write to the column is ignored. Sites live before 2026-10-29 have NULL → "no date", never a guess
  (no v6 client existed before then, so no v6 Pay-in-full client can be affected).
- Server: `_shared/plan-period-reminder.ts`, fn `plan-period-reminder` (internal, CRON_SECRET): `dry_run` (reads only,
  default horizon 240 days), `run` (scheduled), `qa_drill` (one ZZ fixture, fast-forwarded day).
- Once per client: `plan_period_reminders` (primary key lead_id) is CLAIMED before the send; a failed send stays
  `failed`, Paul is emailed, never retried blind. A send stamps `client_service_terms.continuing_reminder_sent_at` +
  history `continuing_reminder_sent` (clause 9A.5, agreement v6).
- Kill switch: `plan_period_reminder_settings.enabled` — **ON** from the migration (Paul: "It must be scheduled"). Cron
  `plan-period-reminder-run` 10:15 UTC daily calls `invoke_plan_period_reminder()`, which posts only while it is on. QA
  leads are never reached by `run`.
- Migration `20261129110000_plan_period_reminder.sql` (additive; rollback in its header).

## Verified on 2026-10-29

- Migration applied and read back (switch on, cron `15 10 * * *` active, RLS on, trigger present, 0 existing sites stamped).
- fn deployed (build `plan-period-reminder-2026-10-29a`); unauthorised POST → 401.
- Live dry run (horizon 400 days): 18 clients with terms rows, all QA, **0 would be sent** ("not v6").
- QA fixture `ZZ QA PP1 pay in full` (`12290000-0000-4000-8000-0000000000a1`, v6, plan full, no phone/email, excluded,
  ARCHIVED after): the insert stamped `site_first_live_at` by trigger; drill day 2027-03-29 → too_early; 2027-04-10 →
  sent to paul@move37.fun (Resend accepted; row `sent`; terms `continuing_reminder_sent_at` stamped); 2027-04-11 →
  already_sent. Dry run after: still 0 real clients.
- The v6 row in `client_agreement_versions` did not exist yet (the agreement function writes it on the first v6
  signature). It was written for the fixture with the identical text/hash the function writes (`versionTemplateText('v6')`,
  sha `7d1157c8…`; the same method reproduced the live v5 hash exactly), so the first real v6 signature finds it and
  matches.
- Invoking an internal function for a test: `net.http_post` from SQL with the vault `CRON_SECRET` (as the cron invoker
  does), then read `net._http_response`.
