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
- **Emails mark SUBMISSIONS, never leads** (measured 2026-09-30): Paul's address sits on real
  businesses' rows he tested the sign-up on (Go-To Plumbing, JG Electrics, Philsan, Peterborough Pro…)
  — their WhatsApp conversations are real. So an `email` row (exact, or a whole domain written
  `@move37.fun`) only makes a sign-up / free check / site visit internal (`isInternalEmail`). Seeded:
  `@move37.fun`, the data account `pauljsales455@outlook.com`.
- **Whole-lead exclusions** only on clear evidence (migration `20261001100100`): "Paul SALES" (invalid
  phone), "White Sparks Electrical" (four test sign-ups, no phone), "4seas" and "sinners and saints"
  (Paul's email, Thai test numbers), "richard" (internal address, no phone). Effect on the live data:
  Needs your attention fell from 8 items to 5 — the three removed were Paul's own test sign-ups.
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

## Reply triage (release 2)

Paul: "A reply alone is NOT an admin task." Every inbound WhatsApp is filed once by fn
`conversation-triage` (cron `conversation-triage-run`, every 2 minutes; table `conversation_triage`, one row
per message; rules in `src/lib/replyTriage.ts`, tests `scripts/reply-triage.test.ts`).

**Order of authority:** fixed-phrase rules first → the AI (`gpt-4o-mini`) only for a recent human message
no rule recognised, the newest per lead → anything unsure goes to REVIEW. Each row stores category,
bucket, reason, confidence, method (`rule`/`ai`/`skipped`), rule id, `rules_version`, model and
`prompt_version`.

| Bucket | Examples | On Paul's list? |
|---|---|---|
| urgent_admin | harassment / reporting / legal / police / scam / GDPR; complaint; a client's refund or STOP; a suppression that failed | URGENT |
| admin_action | any other message from a paying client; a prospect's payment question | TODAY |
| review | low-confidence AI (< `TRIAGE_MIN_CONFIDENCE` 0.7), an AI "opt-out", AI unavailable / capped | REVIEW |
| rep_action | price, call, booking, interested, question, media, "confirmed it's them" | only a HIGH-INTENT reply (interested/price/call/booking) or a question on a lead Paul holds or nobody holds; or a high-intent reply a salesperson has left `REP_ESCALATE_HOURS` (24) |
| no_action | no / not interested / already sorted / wrong person / automated / thanks / emoji / opt-out (suppressed) | never |

**Open** is derived when the page loads, never stored: an item closes when a person replies after it
(a human send or any free-form send), someone acts on the lead after it (Next Action, booking, logged
contact, state move), the lead settles (client / won / not interested — except client, money, complaint
and opt-out items), Paul presses **Handled**, or it is older than `TRIAGE_SURFACE_DAYS` (14).

**Calibrated on all 1,843 real inbound messages (2026-09-30):** the opener asks "Is this <business>?", so
"Yes" / "Yes it is" / "How can I help?" (737 messages) CONFIRM WHO THEY ARE — filed `confirmed_contact`,
never interest. Real interest: 17 messages. Also found: negated interest ("i ain't interested"), curly
apostrophes, working-hours auto-replies, "the report you provide" falsely matching "report you".

### Late opt-outs (Paul's decision 3)

- A clear opt-out phrase in ANY inbound reply (`isOptOut`: STOP as the whole message, unsubscribe,
  stop messaging/contacting, don't contact/message me, remove me/my number, take me off, opt out, leave
  me alone) → the shared `suppress()` (reason `opted_out`, source `whatsapp_optout_inbound`) — the row
  every automated sender already refuses — and a History row (`lead_activity` kind `opted_out`, "Asked to
  stop"). Hand-typed Inbox replies are still possible (a person may answer "sorry, removed you").
- **Phrases only.** The AI can never suppress: an AI opt-out is REVIEW.
- **Never for a paying client** — their STOP is URGENT for Paul (suppressing would stop service messages).
- Wrong number stays its own flow; the lead's status is never changed by triage.
- Found on the first pass: 3 opt-outs in history, 2 not yet suppressed ("Stop"; "scrub me off your list
  and stop bothering me") — the first-reply check only ever looked at a first reply.

**Spend:** at most `AI_MAX_PER_RUN` (40) model calls a run and `AI_DAILY_CAP_USD` ($0.50) a rolling day
(fails closed if the spend can't be read), honours the emergency stop, logged to `api_usage_log`
(`openai_reply_triage`). ~$0.0002 a call.

### What reaches the list (tightened in release 3)

Measured on live data: surfacing every open question put 37 "who's asking?"-style replies on the list.
Now only a LIVE SALE (interested / price / call / booking) nobody is working reaches Paul; every other
open reply is one line, "N other replies are waiting in the Inbox". An AI "they asked to stop" (e.g. "No.
Bugger off!") sits in REVIEW with a **Suppress** button — Paul's decision, the shared `suppress()`
(source `admin_confirmed_optout`), a History row naming him, and the item closes. On 2026-09-30 the list
went from 45 items to 13.

Runs are single-flight: `admin_job_runs` (lease + last run / status / result / error), claimed by
`admin_job_claim` before work and released by `admin_job_finish`. Two overlapping runs had once asked
the model about the same messages (61 calls for 34 filings). The page prints the sorter's last run.

## Sales intelligence (release 3)

`src/lib/adminIntelligence.ts` (tests `scripts/admin-intelligence.test.ts`), panels in
`src/components/admin/intelligence.tsx`. No scores, no winner rankings; every label prints its threshold.

- **Templates:** registered Meta templates (a send with a template name) are kept apart from free-form
  sends (typed in the Inbox, or an AI draft sent). Per template, for sends in the period: sends, leads
  sent, delivered, replied (last-touch, `creditRepliesToSends` — the one rule; "contested" shown), real
  interest (credited replies the sorter filed as a live sale or question), and what FOLLOWED on those
  leads: interested, meetings, paid, said no, opted out. Flags: tiny sample < `TEMPLATE_MIN_LEADS` (30);
  high reply ≥ 1.5× the overall rate; weak ≤ 0.5×; no replies; high rejection ≥ 40% of ≥ 10 replies.
  Message cost: **not recorded** (Meta charges are not captured) — said so, never £0. Live, 30 days:
  `audit_followup_call` 93 replies of which 48 said no (high rejection); `initial_contact` 404 of 918.
- **Niches:** the canonical trade of the search keyword (`canonicalTrade`, so plumbers = plumber). For
  leads first messaged in the period: messaged, replied, interested, meetings, paid, and the website
  cohort ("no website on record" = blank field, never "no website"). Contactable = has a phone and not
  marked no-WhatsApp (`whatsapp_status` is "unknown" on every lead — useless). Labels: Needs more data
  under `NICHE_MIN_MESSAGED` (30); Promising data = reply rate ≥ the book's and ≥ 1 interested; Weak
  response so far ≤ 0.5× the book's; otherwise In line with the book. Cost per niche: not attributable.
- **Bottlenecks:** fixed checks, each with the numbers it used and "not enough data" below its minimum
  (`BOTTLENECK_THRESHOLDS`): contacts → replies, replies → interested, interested → meetings, meetings →
  sales, prospect sign-ups → paid (test sign-ups excluded), spend with nothing collected, interested
  leads with no Next Action, templates with 40+ leads and 0 replies. Live, 30 days: flagged "few
  interested from replies" (17 of 448 — a reply includes "yes, it's us"), "few meetings from interested"
  (1 of 17), and "38 interested leads with no next step".

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
