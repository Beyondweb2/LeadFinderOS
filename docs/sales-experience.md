# Sales Experience (2026-09-28)

Paul's brief: finish the Sales experience — find what was started but never finished, then build the
complete Sales workspace. Branch `feat/sales-experience`. Five releases, each deployed on its own.
Paul's decisions for this work are in memory `sales-experience-decisions` and are repeated where they bind.

## 1. What was found before building (recon, 2026-09-28)

- **No unfinished Sales work on any branch or worktree.** Every Sales branch of the previous week was
  merged; the only unmerged branches are old/unrelated (see the recon in the session). Uncommitted
  edits in the primary checkout (sign-in timeout, Inbox emoji/captions) belong to another session.
- **WhatsApp was always meant to live in the Inbox** (`src/lib/access.ts` "ONE WORKFLOW"). No standalone
  WhatsApp page was ever started or hidden. What made it feel missing: no unread anywhere, no paused-
  queue state for Sales, a stacked 60vh phone layout, one lead→thread entry point.
- **Existing and reused:** the Sales Dashboard fold (`salesPerformance.ts`, fn `sales-performance`),
  the human-set Next Action, `LeadCrmPanel` / `LeadDetailDialog`, `sold_by_user_id` (stamped once at
  payment), `queue_state`, `lead_activity`, onboarding link events.
- **Not started anywhere:** commission, notifications, Focus Mode, command palette, saved views,
  shortcuts, recap, milestones, targets, trends, What's New. **Feedback** was deleted in the deep clean
  (2026-09-16); `team_feedback` (0 rows) still exists and stays until the replacement is proven.
- **No per-payment ledger existed**: `stripe-webhook` only flips `subscription_status` on
  `invoice.paid`; the monthly amounts and refunds were never recorded (release 2).

## 2. Release 1 — WhatsApp Inbox for Sales + the dashboard redesign

- **Naming.** Sales nav item "WhatsApp" (sidebar and phone bar), page title "WhatsApp Inbox" for both
  roles, the same `/inbox` route and components — one conversation system.
- **Unread, per person** (migration `20260929120000_whatsapp_unread.sql`): `whatsapp_conversation_reads`
  (own-row SELECT only; no write policy), `mark_whatsapp_read(phone)` (keeps the later time — a stale
  tab cannot un-read), `my_whatsapp_unread()` (the Inbox's visible set: admin all; sales own non-client
  leads through `my_sales_lead_ids` / `my_sales_message_phones`; newest lead on the number, not
  archived). Counted from `whatsapp_unread_since()` = `UNREAD_TRACKING_START` (2026-09-28 00:00 UTC) —
  history before it is never unread. A thread is marked read only when open AND the tab is visible.
- **One state rule** (`src/lib/conversationState.ts`), read by the Inbox rows, the thread header and the
  dashboard fold: unread · waiting on us (first unanswered HUMAN reply; auto-responders excluded; a
  clear no — `isDecline` — owes nothing) · waiting on them · failed (newest send failed) · queued ·
  follow-up due (a person's Next Action dated today or earlier, London day) · template required
  (window closed). One colour per row by a fixed order: failed (red) → waiting (blue) → follow-up
  (amber) → queued (grey).
- **Inbox:** All / Unread / Waiting on us (longest wait first); the unread dot and bold name; the paused-
  queue banner for both roles ("Replies you send by hand still go out"); `/inbox?lead=<id>` opens that
  lead's real thread (dropped once used) — the ONE deep link (`whatsAppLinkForLead`) for the dashboard,
  notifications and the lead panel's new WhatsApp button; phones switch list ↔ thread with Back.
- **Dashboard** (`src/lib/salesWorkspace.ts`, pure, on the SAME `LeadFacts` as the funnel —
  `foldSalesPerformanceWithFacts`; the old output is unchanged, asserted by test):
  KPI cards (commission waits for release 2), Today strip, next best actions (one per lead, most
  urgent first, deep-linked), follow-up queue (overdue / due today / replied unanswered / interested
  untouched / signup sent / going cold), pipeline New → Contacted → Replied → Interested → Signup sent
  → Paid (tap = the stage's leads), response timers (replies in the last `REPLY_ACTION_DAYS`),
  lead temperature (Warm / Needs follow-up / Going cold — named thresholds, no score), pipeline health,
  activity feed (one reply line per lead per day), daily recap, private targets, milestones, trends
  ("Not enough data yet" below `TREND_MIN_CONTACTED` over `TREND_MIN_ACTIVE_WEEKS`), campaign cards,
  template Meta status (from the sendable registry), channel bars, sources.
- **Targets are private.** Stored in `user_preferences.sales_targets` (own row); the browser sends its
  own to `sales-performance`, which uses them only when `personId === actor.id`. The server still never
  reads preferences (`dashboard-visibility.test.ts`).
- **Design tokens** live in `src/components/salesDash/ui.tsx` (one edit for a colour correction).

## 3. Verification (release 1)

- `scripts/sales-experience-whatsapp.test.ts`; `supabase/tests/whatsapp-unread.sql` (rolled back,
  live: admin 1 / rep 1 / rep after own read 0 / other rep 0 / admin after rep's read 1 / anon 0).
- `inbox-layout.test.ts` updated: phones switch rather than stack; the md rules are unchanged.
- Live `sales-performance` as the Sales Test account: asking for Paul's scope returns their own; no money
  field in the response; 1.6–2.7 s server time (was 1.2–1.9 s before the workspace fold).
- **Layout checked by machine, not by eye**: headless Edge over CDP (`--remote-debugging-port`,
  session injected with `Page.addScriptToEvaluateOnNewDocument`), the BUILT bundle served statically —
  ⚠️ a Vite dev server rooted at a worktree while the process cwd is the primary checkout drops every
  Tailwind class that exists only in the worktree (the money card rendered flat). ⚠️ Git Bash rewrites a
  `/path` argument into `C:/Program Files/Git/path` — set `MSYS_NO_PATHCONV=1`. At 390 / 1440 / 1920:
  no page-level horizontal overflow on the dashboard; the Inbox list at 390 is 419 px wide for the ADMIN
  only (the pre-existing reply-rule toggle row).

## 4. Release 2 — the payment ledger and earnings

- **Ledger** (migration `20260929130000_payment_ledger.sql`): `payment_ledger` — one row per real
  payment (`initial`, `recurring`), per refunded charge (`refund`, the charge's cumulative refunded
  amount, only ever grows) and per dispute (`chargeback`, its latest status). Unique
  `(kind, stripe_object_id)`: a retried webhook or a second backfill never writes twice (live: run 1
  "inserted", run 2 "exists"). `sold_by_user_id` is snapshotted from the lead at write time.
  `commission_payouts` — payouts the admin actually made (`record_payout`), one per person per
  receipts month. Both: RLS on, no policies, no grants — read only through fn `sales-earnings`.
- **Writers** (`_shared/payment-ledger.ts` `recordLedger`, never throws, reports to
  `client_error_reports` `payment_ledger_write_failed`): `stripe-webhook` at four points — after the
  initial payment write, on a paid (> £0) recurring invoice, on `charge.refunded` (before the CRM
  lookup, so an unplaceable refund is still on record), on `charge.dispute.*`. **Charging is untouched.**
- ⚠️ **The Stripe endpoint does not send dispute events** (read 2026-09-28: checkout.session.completed,
  invoice.paid, invoice.payment_failed, customer.subscription.updated/deleted, charge.refunded). The
  code records chargebacks the moment `charge.dispute.created/updated/closed` are enabled on the
  endpoint (Paul's Stripe setting). The backfill reads disputes from Stripe directly regardless.
- **Backfill** (`sales-earnings` mode `backfill`, admin): lists Stripe charges (+ refunds) and
  disputes, places each on exactly one lead (payment intent on the lead → checkout session metadata →
  charge metadata → invoice subscription → customer → billing email of a PAID lead), reports the rest.
  `apply: false` (default) only reports. **2026-09-28 result:** the Stripe account holds 3 charges ever —
  MCLocksmiths £99 (17 Sep, matched by payment intent, recorded) and two refunded £99 / £108.99 test
  charges from Paul's own move37.fun address (not client payments, not recorded). **RG Locksmiths,
  Ronnie's and SC Plumbing have NO charge in this Stripe account** — they were paid outside it (their
  CRM rows say paid; nothing was invented). All four are Paul's sales: £0 commission.
- **Commission** (`src/lib/commission.ts`, derived, never stored): 30% initial, 20% × the next 3
  recurring, of the real amount (`commissionOn`, pence half-up); a partial refund reverses its share; a
  won chargeback reverses nothing; a reversal after its month was paid out is an OFFSET (due never goes
  negative). Payout = first working day of the month after the receipt's London month
  (`UK_BANK_HOLIDAYS`, 2026–2027 — ⚠️ extend before 2028). Projected = remaining commissionable
  months × 20% × the last real monthly (else `FINDABLE_MONTHLY_GBP`), only while the subscription is
  live; never in earned. Only role `sales` earns.
- **Screens:** `/earnings` (both roles; nav "Earnings", phone: More) — Earned / Due next payout /
  Projected / Reversed-or-Paid-out, per client, every line with its payout date; admin: by seller,
  person picker, "Record a payout". Dashboard: the commission card, Today's "Earned today", the recap,
  the £100 milestone, the commission target and a commission line in the feed all come from the same
  loader (`_shared/earnings.ts`). **Celebration** (`EarnedCelebration`): "+£X earned" once — the
  newest line time is saved to `user_preferences.commission_seen_at` BEFORE it shows.
- **Tests:** `scripts/sales-commission.test.ts`; `supabase/tests/payment-ledger.sql` (rolled back,
  6/6 live: duplicate blocked, authenticated + anon denied, payout duplicate / non-first-of-month /
  negative amount blocked). Live: Test (sales) gets only their own (empty) earnings and a 403 on
  `backfill`; the webhook still answers 400 to a missing / bad signature after the deploy.

## 5. Release 3 — the notification centre

- **Table** `notifications` (migration `20260929140000_notifications.sql`): one recipient per row; own-row
  SELECT only; the browser cannot insert/update/delete (`mark_notifications_read`, `clear_notifications`
  act on the caller's own rows); `notify_person` is server-only. `unique (user_id, dedupe_key)` makes
  every event idempotent. In the `supabase_realtime` publication (RLS applies to realtime too).
- **Producers** — every trigger is AFTER, swallows its own failure (a warning) and returns the row, so a
  notification can never block the write it reports:
  - `trg_notify_whatsapp` (whatsapp_messages): a reply → the lead's person (assignee, else the book
    owner), COALESCED while unread ("3 new WhatsApp messages"), titled "Replied after their audit" when an
    `audit%` template went first; a failed outbound → its sender (else the lead's person).
  - `trg_notify_signup_opened` (lead_page_hits `onboarding`, only after a recorded send): once per lead per day.
  - `trg_notify_audit_finished` (ai_audit_runs → `complete`, hook audits only).
  - `trg_notify_lead_assigned` — never for claiming your own lead or the automatic book-owner assignment.
  - `notify_due_follow_ups()` — pg_cron `notify-follow-ups-due` `0 6 * * *` (DB-only, like every cron):
    a person's due / overdue Next Action, ONCE per scheduled date.
  - `set_template_request_status(id, status, note)` (admin) → the requester ("approved" / "not approved");
    `template_requests` gained `status`, `decided_at`, `decision_note`.
  - Money (`_shared/payment-ledger.ts` `notifyMoney`, on a NEW live ledger row only — never a backfill):
    the seller "+£X commission earned" / "−£X reversed" (amount from `commission.ts`), the book owner
    "Client paid".
- **UI** (`NotificationCenter`, in `AppLayout`): desktop bell bottom-right (the Inbox leaves a 3.5rem strip
  so it never covers the composer; the admin's review card moved above it), phone bell in a new top bar;
  newest first, unread dot, mark read / all read, clear / clear read, deep links; opt-in desktop alerts
  (priority items, tab hidden) from ONE instance; unread count in the tab title.
- **Tests:** `scripts/sales-notifications.test.ts`; `supabase/tests/notifications.sql` — 16/16 live, rolled
  back (two replies → one row count 2; failed send; own-row reads, other rep 0, anon 0, forged insert
  denied; mark read; assignment rules; follow-up once per date; clear).

## 6. Release 4 — Focus Mode, the command palette, recent leads, saved views, shortcuts

- **Focus Mode** (`/focus`, both roles; nav + phone More; dashboard "Focus Mode" button): one lead at a
  time from a queue (`src/lib/focusQueue.ts`) — the dashboard's next best actions, or a SAVED VIEW:
  follow up today, overdue, replied unanswered, interested, signup sent, warm, going cold (the same
  workspace lists, so a view means one thing everywhere). `?lead=` opens one lead first. It shows the
  business, trade, town, contact, status; WhatsApp (the deep link) / Call (tel:) / LinkedIn (a search
  link) / Email; the latest 6 messages; the audit (`LeadHookPanel`); optional talking points (the call
  script, folded away); and the lead workspace's own `LeadWorkPanel` (log a contact on any channel,
  Next Action, campaign, internal note). Interested / Not interested use `src/lib/leadQuickActions.ts`.
- **One path for Interested / Not interested** (`leadQuickActions.ts`): the Inbox's status pill now calls
  it too, so the admin-direct / sales-ownership-checked split and the sales "suppress_lead" queue stop
  are written once.
- **Command palette** (`CommandPalette`, in the shell; Ctrl/Cmd+K, the sidebar "Search…" box, the phone
  top bar's search icon): lead search (the person's own table/view, archived excluded), recent leads,
  go-to pages (only routes the role can open), follow-ups, saved views, campaigns (opens Outreach on that
  campaign). Each lead row: Open (workspace) · WhatsApp · Focus.
- **Recent leads** (`useRecentLeads`): what THIS person worked — their own `lead_activity` and their own
  hand-sent WhatsApp messages, newest first.
- **Shortcuts** (`src/lib/shortcuts.ts`): Ctrl/Cmd+K; `g d/w/o/l/f/e/c`; `?` help; Focus → / ← (n / p).
  Never while typing, and none of them sends or writes (asserted by test).
- ⚠️ **Typecheck baseline re-recorded (count unchanged, 9):** the `OutreachStatusBadge` TS2740 message
  lists the missing statuses in type-creation order, and the new files changed that order — the same
  error, reworded. No error was fixed or added.
- **Tests:** `scripts/sales-productivity.test.ts`.

## 7. Release 5 — Feedback, the admin Feedback inbox, What's New

- **Feedback** (migration `20260929150000_feedback.sql`, fn `feedback-submit`): `feedback_items` —
  kind (feature / bug / confusing / other), message, a POSITIVE-allowlist context (page, viewport,
  browser, build, role, language, timezone — `src/lib/feedback.ts`), status New / Reviewing / Planned /
  Fixed / Won't do. Saved FIRST, then emailed to the admin (Resend), the outcome written back; 20 an hour
  per person. RLS: own or admin SELECT; no browser writes. **The old empty `team_feedback` table is left
  in place** until this is proven (Paul) — then its drop is deep-clean step 9's.
- **The loop:** `set_feedback_status` (admin) notifies the author on Planned / Fixed / Won't do —
  "Your suggestion was added" for a fixed feature, "The bug you reported is fixed" for a bug.
- **Entry points, always there:** sidebar footer (Feedback · What's new, with a dot until the newest
  entry is seen), the phone's More menu, the command palette. The dialog lists the person's own
  feedback and where each stands.
- **Admin Feedback inbox** (`/feedback`, admin only): the feedback with status buttons and a note; a
  **Template requests** tab — Approve / Reject (`set_template_request_status`, release 3) tells the
  requester. ⛔ Approving records the decision; registering with Meta is still done by hand.
- **What's New** (`src/lib/whatsNew.ts`): a plain list in the code, newest first, per audience.
- **Tests:** `scripts/sales-feedback.test.ts`; `supabase/tests/feedback.sql` — 8/8 live, rolled back.
  Live: a too-short message → 400 with words, no row; no auth → 401. **No real feedback was submitted**
  (it would have emailed Paul) — the insert → email path is the template-request shape, verified by test.

## 8. Open after the five releases (2026-09-28)

- **Stripe dispute events are not enabled on the webhook endpoint** — chargebacks are recorded only
  once `charge.dispute.created/updated/closed` are added (Paul's Stripe setting), or by the backfill.
- **RG, Ronnie's and SC Plumbing have no Stripe charge in this account** — the ledger does not hold
  them (nothing invented). All three are Paul's sales: no commission is affected.
- **Nobody has seen these screens by eye yet** — layout was checked by machine (headless Edge, the
  built bundle, 390 / 1440 / 1920) and screenshots were read by Claude, not a person. Paul's review is
  the first human one; `src/components/salesDash/ui.tsx` holds the colour tokens for quick corrections.
- **Admin-only Inbox toolbar** is 419 px wide at 390 (the pre-existing reply-rule toggle row).
- **Unread** counts from 2026-09-28 00:00 UTC; a number never opened before then is not unread for
  older replies (deliberate).
- **Commission payouts are recorded by hand** in Earnings (nothing pays anyone from the app).
