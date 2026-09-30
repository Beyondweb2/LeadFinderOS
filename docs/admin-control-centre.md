# The Admin control centre (2026-09-30)

Paul's brief: one page, opened every day, that says what needs him, what is working, what it costs and
what it makes — "not a notification feed, not a pile of cards, not a list of every event". Approved
2026-09-30 with six decisions (memory `admin-control-centre-decisions`); built in six releases.

## Where it lives

| Piece | Path |
|---|---|
| Page | `src/pages/Dashboard.tsx` (route `/`, admin only — sales are redirected before it mounts) |
| Sections | `src/components/admin/controlCentre.tsx` (presentational; computes nothing) |
| Data hook | `src/hooks/useAdminOverview.ts` (React Query, 5-minute cache) |
| Server | fn `admin-overview` (requireAdmin, reads only, spends nothing) |
| The fold | `src/lib/adminMetrics.ts` — every definition below lives there and only there |
| The clock | `src/lib/reportingPeriod.ts` |
| Exclusions | `src/lib/metricExclusions.ts` + table `metric_exclusions` |
| Cost labels | `src/lib/apiCostLabels.ts` + SQL `admin_api_cost(from, to)` |
| Tests | `scripts/admin-metrics.test.ts` |

## The clock (one rule for every widget)

- The business day is the **London calendar day** (BST/GMT handled). Weeks are **Monday–Sunday,
  London** — the same week the commission tiers use.
- "7 days" / "30 days" = the last N London days **including today**, never a rolling N×24 h window.
- A period is `[London midnight of the first day, London midnight after the last day)`, capped at now.
- An invalid custom range falls back to 7 days, never to all time (the expensive read).
- ⚠️ Not yet adopted elsewhere: `sales-performance` trends still use UTC Monday weeks and a rolling
  window. The admin page does not read them.

## Metric definitions

| Metric | Source | Definition | Time basis |
|---|---|---|---|
| WhatsApps sent | `whatsapp_messages` | outbound, `isRealSend` status, not `test_mode`/simulated | sent in period |
| Leads messaged | same | distinct leads with a real send | in period |
| Reply | `whatsapp_messages` | inbound, not test-mode, not `looksAutomated`; once per lead | received in period |
| Call | `lead_activity` kind `call_outcome` | a LOGGED outcome; tapping a number never counts | logged in period |
| Email / social / other contact | `lead_activity` kind `contact_logged` | by `data.channel` (every LinkedIn format = LinkedIn; social = LinkedIn/Facebook/Instagram) | logged in period |
| Interested | `lead_activity` | first recorded moment: star, status move to interested/price_given/won_pending, state move to interested/meeting/won, interested/meeting outcome. An old status with no moment counts in the funnel only | first moment in period |
| Meeting | `lead_activity` | `call_booked` with a time, `meeting_booked` outcome, state move to meeting booked; once per lead | in period |
| Not interested | `lead_activity` + `contact_suppressions` | outcome / state or status move / a `replied_no` or `not_interested` suppression (backfilled rows excluded — bulk imports, not events) | in period |
| Wrong number | `contact_suppressions.wrong_number_at` + outcome | | in period |
| Opt-out | `contact_suppressions` reason `opted_out`/`opt_out`/`stop`, or a status move to `opted_out` | | in period |
| Leads added | `outreach_leads.created_at`, credited to `added_by_user_id` (else the book owner) | | created in period |
| Paid / revenue / refunds / disputes | `payment_ledger` only | succeeded initial/recurring; refund rows; chargeback rows (open = held, lost = gone) | `occurred_at` in period |
| Commission | `_shared/earnings.ts` → `commission.ts` lines | the rate stamped when the sale landed; never recomputed | `occurredAt` in period; "due" is current |
| API cost | `api_usage_log` via `admin_api_cost()` | charge rows only (`guard` estimates excluded), USD as recorded | `created_at` in period |
| Contribution | the three above | net revenue − commission − API spend (USD at a fixed `USD_TO_GBP_ESTIMATE`). **Not profit** | period |
| Follow-ups due | `outreach_leads.next_action(_date)` | set, not `none`, due ≤ today, lead not archived/client/won/not-interested; the legacy auto-written `send_draft` on a thread with inbound is skipped | current |
| Cohort rates | the above | of the leads a person FIRST contacted in the period: how many have since replied / become interested / booked / paid, with the base shown. Below `RATE_MIN_BASE` (10) the page says "small sample" | first contact in period |
| Funnel | the above | the leads ADDED in the period (all time = the book), how far each has got; a lead can skip a stage | created in period |
| Channel row | the above | leads reached on the channel in the period; replied / interested / meeting / sale AFTER that channel first reached them — "touched by", never "caused by". Under `CHANNEL_MIN_ATTEMPTS` (20) the page says "not enough data" | period |

**Who gets the credit:** a send is its `sent_by_user_id`; a send with no sender (the queue) is the lead's
holder's (`assigned_to_user_id`, else the book owner); a logged contact or state move is its actor's; a
reply is the holder's; a sale is the ledger's `sold_by_user_id`, else the lead's stamp, else the book owner.

## Test / internal exclusions

- Table `metric_exclusions` (kind `user`/`lead`/`phone`/`email`, value, reason). RLS on, no policies —
  service role only. Seeded 2026-09-30 with the two test sales accounts **test1** (`c6e21a37…`) and
  **Test** (`262c1d64…`) — Paul's decision.
- Their activity is dropped from every performance and attribution number and tallied apart
  (`excludedActivity`). **The businesses they added are not hidden:** inventory and the funnel of leads
  added still count them.
- Always excluded as well: WhatsApp rows with `test_mode = true` or status `simulated`.
- The page prints the exclusion line under the team table and at the foot of the page.
- Nothing is deleted. To exclude a QA lead, insert a `lead` row — do not delete the lead.

## Needs your attention (release 1 — deterministic items)

| Group | Item | Rule |
|---|---|---|
| Urgent | Payment dispute | a `chargeback` ledger row not won/closed/lost |
| Urgent | Payment failed | paid client, `subscription_status = past_due` |
| Urgent / Today | Setup not started | `isPaidLead` (so **refunded never shows** — the old card's bug), live, no `baseline_audit_id`; urgent after `SETUP_PROMISE_DAYS` |
| Today | Re-measure overdue | baseline set, `remeasure_due_date` before today, no `remeasure_audit_id` |
| Today | Quote gone quiet | `price_given`, unpaid, not waiting on us, quiet `QUOTE_QUIET_DAYS` |
| Today | Sign-up not paid | newest onboarding row not paid, `SIGNUP_CHASE_DAYS` old, lead not dead |
| Review | No trade | one line: live leads with no trade (checkout refuses them) |

The old card's "Dismiss" (a browser write of `status = closed`) is gone: the page writes nothing.
Release 2 adds the reply triage items.

## What was removed from the old page (audit, 2026-09-30)

| Old block | Verdict | Why |
|---|---|---|
| Paying clients / Replies waiting / Follow-ups due / Interested tiles | removed | disagreed with each other (any-age vs 14-day replies; archived/cancelled counted as paying; follow-ups counted won/archived leads) |
| Next best actions, Follow-up queue, Waiting on a reply | moved | salesperson work lists — Sales dashboard and Focus keep them |
| "Needs you" tasks | merged | rebuilt server-side in Needs your attention; refunded-client "Deliver" bug fixed |
| Clients delivery card | merged | Paid clients table; the ticks live on the client hub. `ClientDeliveryCard.tsx` deleted |
| Free checks, Sign-ups | kept, moved | folded "Sign-ups & free checks" desk at the foot (their buttons act) |
| Team activity feed | removed | an event feed; mislabelled other people's assignments as "assigned to you" |
| Audit funnel | removed | replaced by the sales funnel |
| Footer links | removed | API usage is linked from the cost panel |

⚠️ `useDashboardMetrics.ts`, `dashboardTasks.ts` and `AuditFunnelCard.tsx` are now imported by nothing,
but `useDashboardMetrics` is a source for `check-cross-repo-sync` (`FOUNDER_PRICE_GBP`) and
`paying-customer.test.ts` restates it. Deleting them means moving that sync — its own small piece of work.

## Performance

The old page read every lead (32 columns) and every WhatsApp message WITH its body into the browser,
and the whole book again on the server (sales-performance). The new page makes one call; the server
reads narrow columns (bodies only for inbound, to spot auto-replies), sums costs in SQL, and returns
totals. Cached 5 minutes in the browser; Refresh refetches.

## Release log

- **Release 1 (2026-09-30):** clock, exclusions, fold, fn `admin-overview`, SQL `metric_exclusions` +
  `admin_api_cost`, new page (Now / Team / Money / Clients / sign-up desk).
