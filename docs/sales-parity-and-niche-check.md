# Sales parity pass + the Niche Check (2026-09-28)

Paul's combined brief (Sales audit / Inbox / WhatsApp / Outreach / Niche Verdict). Branch
`feat/sales-parity-niche`. Migrations `20260929000000_sales_view_town_note.sql`,
`20260929000100_niche_samples.sql`. New fn `niche-sample`.

## 1. What was already true (verified, left alone)

- **Sales could already run the standard hook audit** on its own assigned leads (create-ai-audit:
  `salesAuditRefusal` + `canWorkLead`), server-side and background (process-ai-audit-queue), several at
  once. The row icon opened the lead workspace on the WRONG tab (Work, not the audit) — that was the gap.
- **The reply-triggered audit never looked at the owner or the sender.** `whatsapp-inbound` →
  `armFirstReplyAuditIntent` → the reconciler in process-ai-audit-queue → create-ai-audit, filed under the
  lead's `user_id` (the book owner). A Sales lead behaves exactly like the admin's; webhook retries are
  deduped by `wa_messages_wa_id_uq`, and the once-per-lead slot by `whatsapp_auto_replies.lead_id`.
- **Inbox features are the same for both roles** (free text in the window, voice, attachments, templates,
  audit buttons). Deliberate admin-only: the reply rule, Send now, follow-up lanes, crawl, welcome pack,
  stages outside Sales' four, the campaign filter (now opened — §3). There is no unread state for EITHER role.
- **MB & Son Recovery and Repairs** was queued correctly (10:50, `initial_contact`, by `test1`). Nothing was
  hidden by a missing column. What Paul sees as admin is the queue PANEL (admin-only, deliberate) — and the
  queue itself has been **PAUSED since 2026-09-27 10:05 UTC**, so nothing sends. Sales was told "sends within
  the daily window". Paul: leave it paused; he un-pauses it himself.

## 2. Built

- **Audit popup, both roles** (`HookAuditDialog`): the workspace's own `LeadHookPanel` in a dialog. Three
  questions proposed by create-ai-audit's preview, **editable** (Paul overturned "no free-text editing"),
  `reviewedHookQuestions` refuses a blank / repeat / essay so the server never tops one up. Still exactly 3,
  both engines, 1 run. The AI Audit page is the admin's "Advanced" link inside it.
- **Row state:** `auditRowState` (`src/lib/auditRowState.ts`) — `processing`/`queued` now read as running
  (they used to offer Run again). The map polls every 20 s only while a row is mid-audit.
- **One hook in flight per lead** (create-ai-audit): a person's hook finds any in-flight run on the lead
  (30 min window) and answers `already_running` with that audit. Internal callers untouched.
- **Sales cannot hook-audit a client via the API** (`isClientLead` after `canWorkLead`).
- **Inbox thread lookup:** conversations are keyed by the message rows' `user_id` (the book owner), so
  `${user.id}::phone` only ever matched for the admin. Now: viewer's key → number + lead → number; a
  just-started thread switches to the real one when its first message lands.
- **Contact tag:** a live send fills an EMPTY `contact_method` with `whatsapp` (send-whatsapp-message,
  `BUILD_ID` 2026-09-28a). Mobile card shows the tag read-only for Sales.
- **`sales_leads.town_fetch_note`** (appended) — the "Google couldn't confirm the town" badge now shows for Sales.
- **Queue state for Sales:** process-whatsapp-queue mode `queue_state` (read-only, both roles: paused /
  window open). The workspace line, the queue toast and an Outreach banner say
  "Queue paused by admin — not currently sending." when it is (`src/lib/queueLine.ts`).
- **Campaign filter at page level, both roles** (Sales pick-only). A view control; never moves a lead.
- **Available to claim removed from Outreach** (panel, `useSalesPool`, `perms.claimPool`, the words).
  Kept in the DB: `claim_lead` (Find Leads' "Claim lead"), `lead_identity_lookup`, the contact rule
  (`lead_contact_attempt_at`, which Remove from my leads reads), and `sales_pool` (unused).
- **Archived leads off the working list for BOTH roles** — extends the closeout pass's Sales-only
  `rowsForArchiveView` (`archiveViewFor(!isArchiveView, …)`); Filters → Archived shows them.
- **The reply rule — one guard set** (`firstReplyGuard`, `src/lib/firstReplyAutomation.ts`), on the live
  path: a client never enters prospect automation; placeholders / lone characters / auto-responders arm
  nothing (and the first HUMAN reply is the one that counts — `countsAsFirstReply`); a suppressed contact
  arms nothing; a clear no is suppressed + `flagged_decline`, **no audit, no pitch**; an auto-SEND needs a
  reply to an approved opener (`isInitialOpener`). **"Do nothing" now arms nothing**
  (`effectiveFirstReplyMode`: the Inbox control's Off is `auto_reply_enabled = false`). The drain also
  re-checks the reply that armed a row. The dead legacy chain (~500 lines) is deleted.
- **bulk-jobs create:** explicit admin role check (it refused Sales only by accident of the owner filter).

## 3. The Niche Check (`src/lib/nicheSample.ts`, fn `niche-sample`, `NicheCheckCard` on Coverage)

**The old verdict (market-view `niche`) and why it could not answer the question:** free re-read of every
stored audit for one of seven fixed trades; mixes every purpose; no chosen towns (whatever towns happened
to have audits); verdict = Gemini "free slots" (names per answer − names in every run), which needs
repeat runs — Plumbers had 447 audits and 0 repeat runs, so it said nothing; counted directories and
nationals as free slots; a new niche showed "audit some businesses first"; "Mobile valeting & detailing"
matched none of its 7 audits (key mismatch). It stays, behind a "show the older reading" button, as
background — never shown as the verdict.

**Measured to design it (2026-09-28, every stored repeat-run question):** two identical runs share only
~20–30% of the businesses Gemini names (mean Jaccard: plumber 0.32, locksmith 0.27, electrician 0.18,
accountant 0.22) — one run reads rotation as fragmentation. ChatGPT names the audited business far more
(locksmiths 59% vs Gemini 15%) because it reads directories.

**Method 1:** 3 towns (major ≥250k / medium 60k–250k / small 15k–40k), distinct regions, random in band,
avoiding towns an earlier sample of the niche used; never London. 4 fixed customer intents per town,
identical wording. 3 runs. Gemini decides; ChatGPT is one line of context (free — same call). One Places
text search per town (20 results, Enterprise $0.035, no rating/review field) to tell a healthy market
Gemini barely surfaces (WORKABLE) from a genuinely thin one (HARDER). 36 question-runs + 3 searches
≈ `NICHE_SAMPLE_USD` (≈ 50p). Each town is ONE create-ai-audit discovery audit (`niche_sample` →
`is_market`: no public report, out of every business fold). Verdict derived on read; `niche_samples`
stores the plan, the audit ids and the raw market search only.

**Labels:** WORKABLE · HARDER NICHE · PROMISING — NEEDS MORE DATA · NEED MORE DATA; per-town Gemini
patterns in words; confidence High/Medium/Low; one next step. Thresholds are named constants in the file.
Calibrated over the stored repeat-run audits: most local-trade towns read "spread across many local
firms", one plumber town "the same few firms".

**Major cities:** `scripts/seed-uk-towns.mjs` (the table's source of truth) default ceiling raised
250k → 5M and its coordinate fetch narrowed to the band's codes (the whole-table walk now 504s); run once
with `--min 250001`: 17 England+Wales cities added with ONS BUA22 codes, Census 2021 populations and
coordinates (London is not in the ONS dataset). Side effect measured: the 25 km town-distance gate in
create-ai-audit now reaches these cities — 132 current leads in them, 8 newly WARN (10–25 km), 1 newly
BLOCK (Russell Dane Gas Heating & Plumbing, Liverpool, 26 km — overridable). Coverage's default band
(15k–210k) is unchanged.
