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
