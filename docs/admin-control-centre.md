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
| Money overview | the three above | net revenue − commission = **revenue after commission (GBP)**; API spend shown beside it in **USD**, never converted or subtracted (no dated rate on record). **Not profit** | period |
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
- **A paying client's STOP suppresses too** (integrity pass, 2026-09-30 — overturns the first rule,
  which escalated without suppressing). It is ALSO urgent for Paul, in case they mean the service.
  Suppression blocks marketing only: the payment confirmation (stripe-webhook) never checks it, the
  questionnaire chase is a SERVICE template, and the four-week results go by email.
- **`recordOptOut()`** (`_shared/suppression.ts`), not "already suppressed → skip": a number already
  suppressed for a weaker reason (archived, a decline, Wrong number) has its reason UPGRADED to
  `opted_out`, so it survives a revive (which deletes only `not_interested` rows) and the Inbox guard sees
  it. The admin's Suppress button uses the same function.
- **The Inbox's manual templates respect it** (`send-whatsapp-message`, build 2026-09-30b): a marketing
  template to an opted-out number is refused (`opted_out`); `SERVICE_TEMPLATES`
  (`src/lib/marketingConsent.ts`: `payment_recieved`, `questionnaire_followup`) and a free-text reply to
  their own message still go. Before this, only Wrong number was refused there. Fails closed.
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

## Weekly visibility check + paid client health (release 4)

Paul's decisions (2026-09-30): a light fresh check once a week for PAID clients; Build starts once the
new site is live, Optimise once the first real website/evidence changes are live (NOT when the baseline
freezes); the set is frozen once chosen; ~$0.12/client/week, caps approved; completely separate from
the official baseline, the guarantee and the four-week re-measure.

| Piece | Where |
|---|---|
| Rules (set, start, fold, trend, caps) | `src/lib/weeklyCheck.ts` (tests `scripts/weekly-check.test.ts`) |
| Health facts + blockers | `src/lib/clientHealth.ts` |
| Job | fn `weekly-visibility` (cron `weekly-visibility-run`, hourly at :15; lease `admin_job_runs`) |
| Tables | `weekly_check_sets` (one frozen set per client; a trigger refuses edits), `weekly_check_runs` (unique per client per London week) |
| Audit purpose | `'weekly_check'` (`auditKind.ts`), accepted by `create-ai-audit` from INTERNAL callers only |
| Panel | `src/components/admin/clientHealth.tsx` |

**Method.** `WEEKLY_CHECK_QUESTIONS` (10): the Hook Audit's own questions first (≤ 3, via
`hookQuestionsFor`), then the official baseline's ASKED set (run 1's queue, its approved order),
de-duplicated. Chosen ONCE and frozen; fewer than 5 real questions → no set (never padded). ChatGPT +
Gemini, ONE run a week. Per engine: named out of answered, per question named/absent, rivals named.
**Trend** is a word, not a score: ↑ improving / ↓ slipping only when an engine moves by
`WEEKLY_MOVE_MIN` (2) or more questions; otherwise "flat (within week-to-week noise)"; "mixed" when one
engine rises and the other falls; "first week" until there are two. Movements list questions "now named"
/ "no longer named"; "still absent" = neither engine named it.

**Why it cannot touch the guarantee.** Its own purpose, which none of the three pointer triggers reads
(`claim_baseline_pointer` = 'baseline', `claim_full_measure_pointer` = 'measurement',
`claim_remeasure_pointer` = 'remeasure' — read live 2026-09-30); its own tables; `isInternalMeasurement`
is true (no client report is ever served); `seoScanAllowed` false; never reuses or extends an old audit;
single run so `advanceBaseline` never repeats it; `process-ai-audit-queue` never auto-publishes a public
listing for it; the function never writes a lead row, an audit row directly, or any re-measure field.

**Start.** Build: `website_build.production_url` AND (`qa.production_checked` OR `production_status =
'verified'`). Optimise (and a legacy client with no route, who keeps their own site): a delivery
milestone ticked (`directories` / `pages` / `gbp` / `website`) or a `client_opportunities` row with
`implemented_at`. Bookkeeping ticks (baseline sent, re-measure) never count. On 2026-09-30 only RG
qualified (Google profile + directories ticked); MCLocksmiths, Ronnie's and BS4 wait.

**Spend.** Estimate `WEEKLY_USD_PER_QUESTION` ($0.014, the observed billed rate) × 10 = $0.14; caps
`WEEKLY_CLIENT_CAP_USD` ($0.25/client/week) and `WEEKLY_TOTAL_CAP_USD` ($2/week, all clients). Also
refused when the Apify account is ≥ 90% of its monthly cap or unreadable, when the spend can't be read,
and under the emergency stop. Real cost is read back from `ai_audit_runs.actor_cost_usd`.

**Client health** (no score): route, site live, baseline started, the weekly result vs last week with
the trend word, official re-measure date, open / implemented improvement items, directory listings
needing attention, payment state, and BLOCKERS as sentences (refunded, payment failed, baseline not
started, re-measure overdue, new site not live, weekly check failed). A details row shows this week's
per-question result and the rivals named (internal — never on a client surface).

**Redeployed because `auditKind.ts` changed** (every function reaching it): create-ai-audit,
findable-onboarding, paid-baseline, paid-client-hub, process-ai-audit-queue, render-audit-report,
render-remeasure-results, render-welcome-pack, stripe-webhook, submissions.

## Feature usage (release 5)

Counted from what each feature already records — SQL `admin_feature_usage(from, to)` sums a UNION of
the real rows (audits by purpose, Find Leads searches, leads added, logged contacts, Next Actions, Find
email, socials a PERSON found — the 2026-09-30 backfill has no actor and is excluded, Paid Enrich
charges, voice-note scripts, AI reply drafts, Quick Close events, Niche Checks, directory runs,
backlog items, report / sign-up links sent, prospect previews, generated pages, mockups, replies
marked handled). Four features wrote nothing, so they log ONE useful action (table `feature_events`,
RPC `log_feature_event`, `src/lib/featureUsage.ts`; at most one per person/feature/lead/London day):
the call script SHOWN for a lead, a LinkedIn / email script COPIED (`ColdCallPlaybook.tsx`), Focus Mode
opened (`Focus.tsx`). Never a click count, time on page or quota. Flags (`adminIntelligence.ts`):
unused; dropped sharply (≤ 50% of the previous period, from ≥ 10); costly for its use ($5+ on ≤ 5
uses); "tracking began 30 Sep" for the four new ones (not judged). Both "costly" and "unused" also
feed the bottleneck list.

## Findable site traffic (release 5)

Paul's decision: first-party, cookie-free, no names, no raw IP, no fingerprinting, admin/test
excluded, meaningful events only, landing page / referrer / UTM.

- findable-site `src/lib/analytics.ts` (+ `BaseLayout.astro` visit, `FreeCheck.tsx` first focus,
  `OnboardingFlow.tsx` open + checkout redirect) → LeadFinderOS fn `site-analytics` (public,
  `verify_jwt = false`, origin allowlist, 4 events, fields capped, bots dropped, ≤ 60 events per
  session-hour, always 204) → table `site_analytics_events`.
- A row: event, a RANDOM per-tab session id (sessionStorage — gone with the tab), path, referring HOST
  only, UTM tags, mobile/tablet/desktop from window width, internal flag. Never IP, user agent, name
  or email. Nothing is sent under Do Not Track / Global Privacy Control or on `?preview=1`.
- Internal: referrer from LeadFinderOS, or a browser marked once with `https://findable.live/?internal=1`
  (clear with `?internal=0`); stored flagged and counted apart. Submissions with internal emails are
  excluded server-side.
- The funnel (SQL `admin_site_funnel`): visitors (sessions) → started the free check (browser) →
  submitted it (`onboarding_responses`) → its audit finished (`ai_audits` free_check, a completed run)
  → opened onboarding (browser) → sign-up forms filled → reached checkout (`checkout_session_created`
  server rows) → paid (ledger); plus checkout refusals, landing pages, referrers, campaigns, top pages.
  Browser steps say "not tracked yet" until the first event exists — never a zero that means "unknown".
- The privacy page's "Cookies and tracking" section lists exactly these fields.

## Search Console — client website traffic (release 5)

Paul: integrate the parked 2026-09-22 branch `feat/client-performance` (e712b980), but audit it
first, keep what is still correct, respect the current model, never overwrite newer Paid Client work,
show "Not connected" when missing, never invent numbers.

**Audit findings (2026-09-30):** sound core (Google client, the maths, the "not connected" states); unsafe
as it stood — owner `FOR ALL` RLS policies would have let a browser session write traffic rows and set
`status = 'connected'`; `client-performance` had no admin check; `performance-sync` used a plain `===`
secret compare plus the dead service-role bearer, synced an arbitrary first 10 clients (`.limit(10)`, no
order) and ignored ended clients; its cron invoker was callable with the public key; a second
`outreach_leads.canonical_domain` would duplicate `website_build->>canonical_domain`; its `ClientHub.tsx`
would have overwritten ~380 lines of newer hub work; 5 files conflict with main.

**Ported (fixed):** `_shared/google-search-console.ts` and `src/lib/searchPerformance.ts` byte-identical
(two raw NUL separators rewritten as `\u0000` for the no-control-chars rule), `scripts/search-performance.test.ts`;
migration `20261001160000_search_console.sql` (connections with the domain on the row, page + query daily
tables, RLS on with NO policies, SQL functions service-role only, revoked invoker, cron
`performance-sync-run` 05:00 UTC); fn `performance-sync` rewritten (cron via `isInternalCall` +
`x-internal-job` or `requireAdmin`; `admin_job_runs` lease; every connected paying client, ordered;
ended / refunded / archived skipped; "not configured" when the credential is missing). The dashboard reads
it in `admin-overview` (state via the one `resolvePerformanceState`; figures only when populated; "vs
previous 28 days" only when stored data covers it; impressions labelled "summed across pages").
Pinned by `scripts/search-console-port.test.ts`.
**Not ported:** the branch's `ClientHub.tsx` diff, its `/paid-clients/:id/performance` page and
`client-tracked-pages` — nothing needs them yet, and the hub belongs to another session.

**Live state:** no `GOOGLE_SERVICE_ACCOUNT_JSON` secret exists, so every client reads "Not connected".
Setup (Paul): a Google Cloud service account with the Search Console API enabled; add its email as a user on
each client's Search Console property; set the JSON key as the edge secret; add a
`client_search_connections` row per client (property string exactly as Search Console shows it — probe with
`performance-sync` mode `properties`). The branch's MCL seed SQL is NOT safe to run as written (it writes
the dropped column and lists 14 pages that now redirect).

## AI business summary (release 6)

fn `business-summary` (cron `business-summary-weekly`, Mondays 06:30 UTC: the last full London week vs
the week before; or the admin's "Write one now": the last 7 days vs the 7 before, at most once an hour),
rules in `src/lib/businessSummary.ts` (tests `scripts/business-summary.test.ts`), table
`admin_summaries` (the exact facts given, the words, status, reason, model, prompt version, cost).

- **One set of numbers.** The dashboard's reads and fold were moved verbatim into
  `_shared/admin-overview-load.ts`; fn admin-overview and fn business-summary both call
  `loadAdminOverview`, so the briefing cannot disagree with the page.
- **It cannot invent a number.** The model (`gpt-4o`) sees only `facts` — totals, per-person lines,
  templates, niches, flagged bottlenecks, attention counts, client weekly checks, feature flags, site
  funnel — with every change pre-computed (`change_pct`). Every number in its draft must appear in the
  facts (`validateNumbers`); otherwise one retry naming the bad numbers; still wrong → stored `rejected`
  and NOT shown — the page shows the flagged checks instead (`fallbackLookAt`).
- Advisory only: it writes one row and nothing else; honours the emergency stop; single-flight
  (`admin_job_runs`); logged to `api_usage_log` as `openai_business_summary` (≈ $0.02–0.04 a briefing).
- The panel "This week in plain English" sits in the top section, open by default.

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

## Integrity pass (2026-09-30, after RG's refund)

- **RG refunded** (Paul set status `refunded` by hand, 11:26 UTC). Verified: `weekly-visibility` keeps
  only `isPaidLead` clients (a refund removes him — the 11:15 run was his last), `fireDueRemeasures` has
  `.neq("status","refunded")` (his 2026-10-06 re-measure will not fire), every attention item is gated on
  `isPaidLead`, no subscription exists. His one weekly run was already complete (5 of 5 queued questions
  done, $0.0675) — nothing queued, nothing to cancel. Frozen baseline `f64920ce` and all audits untouched.
- **The refund is not in the ledger**: no `charge.refunded` reached stripe-webhook (it writes a ledger row
  for every refund, matched or not), and RG's lead row has no Stripe ids — his £19.99 (2026-08-11)
  predates the ledger. `refunded_at` / `refund_amount_gbp` are blank. Nothing was invented or written.
- **Money overview no longer converts currencies**: the fixed `USD_TO_GBP_ESTIMATE` (0.75, no source, no
  date) is deleted. It shows revenue − commission = revenue after commission (GBP) and API spend (USD)
  beside it, never combined. The Revenue panel names refunded outside-the-ledger payments separately.
- **Weekly check honesty**: `weekCoverage` / `coverageLabel` ("Partial — 5 of 10 questions answered",
  "No answers came back"); the panel shows named/answered and never falls back to the set size; an
  engine with no shared answered question has a null delta and the trend reads "not comparable";
  "now named" needs the question answered in both weeks; a refunded client reads "Stopped — refunded".
- **Correction**: RG's first weekly check named him on 1 of the 5 answered questions on BOTH engines
  (the release-4 report said 0 of 5).
- **Opt-outs**: see *Late opt-outs* above. One historic STOP (BdH Chartered Certified Accountants) sits on
  a `not_interested` suppression and was filed "already suppressed" — upgrading it is a row rewrite, left
  for Paul.
