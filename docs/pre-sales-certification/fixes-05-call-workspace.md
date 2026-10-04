# Fix workstream 5 — Sales call workspace + salesperson daily UX

- **Date:** Sunday 4 October 2026. **Branch:** `fix/05-call-workspace`, cut from `origin/main` `c0e85078`.
- **Not merged, not deployed.** No SQL applied to the live database (the migration was exercised only inside a
  rolled-back DO block, see *Database* below). No edge function deployed.
- **Findings addressed:** M-008 (A-03), M-009 (A-04, A-05, A-06, A-21 + the script/objection audits), M-052 (E-13),
  M-053 (E-12), A-18 (dashboard order on a phone). Read from `cert/master-launch-plan` and `cert/a-salesperson`,
  Session E from `cert/e-security-reliability`.

## 1. The call screen (lead workspace → Scripts tab)

The rep now sees, top to bottom:

1. **Call card** — phone (tap to ring), website (or "No website" / "(TradeHQ profile)"), trade and town, and the
   AI check in one line: `Google AI did not name them — it named A, B and C`, `Google AI named them`, `AI check
   running`, or **`No audit yet`** with a **Run the AI check (about a minute)** button that opens the Work tab, where
   the existing one-lead check is run. "No problem if you ring first" — the script never claims a result it lacks.
2. **Call script**, in four numbered steps instead of one paragraph:
   1. **Open: who you are, why you're ringing** — the opening read. The "if they'd rather see it first" line is now a
      grey hint under the script, not a line the rep reads out.
   2. **Ask** — five short questions, each changes what happens next (website control / "a website I missed?" /
      a profile page; where work comes from; jobs they want more of; towns; are you the decision maker).
   3. **If they're interested** — the offer for the route that fits (below), the guarantee, the monthly in the agreed
      words, and the close line *"If that sounds good, I'll send you the link now…"* with **Quick Close** beside it.
   4. **After they pay** — Quick Close's own `QUICK_CLOSE_AFTER_PAYMENT` list (one source, not a copy).
   - Folded underneath: **Not the owner, or voicemail** (gatekeeper line; a voicemail under 20 seconds).
3. AI opportunity, what to talk about, the questions they may ask, audit evidence, report link — as before.
4. **Sticky bar:** *Log this call* + **Quick Close**.

Copy now copies the whole flow (open, questions, close, after payment).

## 2. Script and offer

**Offer (src/lib/callClose.ts, every figure a `findableOffer.ts` constant — no price or count typed):**

| | Build | Optimise |
|---|---|---|
| Glance line | £99 now · £99/month · 12 payments in total | £99 now · £99/month · 6 payments in total |
| What they get | A new website built, hosted and managed by Findable — theirs once the term is paid | They keep their existing website and its ownership |
| Spoken | "We build you a new website, host it and look after it. It's £99 today, then £99 a month starting six weeks after today. That's 12 payments in total, the £99 today included, so a 12-month minimum. Once the 12 payments are done the site is yours and nothing more is charged." | "You keep your own website and it stays yours. We work on it with your access, and we never take it offline. … 6 payments in total, the £99 today included, so a 6-month minimum. After the last payment nothing more is charged." |

- **Route that fits:** own website → Optimise first (labelled "keeps their site"), Build second. No website, or only
  a directory/social profile → **Build only**, saying "Optimise needs their own website".
- **Guarantee:** headline `We improve AI visibility or you get your money back.` (findable.live's line, checked
  word for word against `findable-site/src/components/Guarantee.astro` by the test), then plainly: measured before,
  same questions again after four weeks, not gone up → email within 14 days of the results → the £99 back. A
  rep-facing caution: *never promise a ranking, a recommendation or that AI will name them*.
- **Monthly (Paul's 2026-10-02 wording):** a new page every month, a monthly check of what AI says, adjustments as
  we go, and hosting/looking after the site (Build) or keeping their site right (Optimise).

**Script changes (src/lib/coldCallPlaybook.ts):**
- **Who is calling first, always.** Cold: "Hi, is that X? It's Sam from Findable." (the signed-in rep's first
  name). Follow-up: "…It's Sam from Findable, I messaged you on WhatsApp earlier today."
- **After "who's this?"** (and "who are you", "how did you get my number", "is this a scam"…): "It's Sam from
  Findable. You asked who I was when I messaged earlier today, so I thought I'd ring and explain. We help local
  businesses get named when people ask AI tools like ChatGPT and Google AI for a plumber in Halifax." Then the reason.
- **"Quick recap"** only when a report-carrying message actually went out; otherwise "I'm ringing because…".
- **Days said aloud:** "earlier today", "yesterday", "on Friday" (this week), "on 15 Sep", the year only when it is
  not this year. Was "on 4 Oct 2026" for a message sent that morning.
- **Plain words:** "We help local businesses get named when people ask AI for a plumber in Halifax" replaces
  "We specialise in AI visibility" in the spoken script (jargon to a trade).
- **Removed the absolute claim** "Google AI has not named a business without a website" (a lead's own audit
  contradicted it). The note now says less to go on, and *never say AI cannot name a business without a website*.
- **Objections:** "Can you guarantee I'll appear?" → "Nobody can promise AI will name you, and I won't. What I can
  promise: … get your £99 back." (master plan wording, no hedge after it). "Why is it monthly?" → the agreed monthly
  wording, "the four-week check is the first one, not the end" (was "the monthly keeps you there"). **New:**
  "That's a lot / £99?", "I need to think about it", "Who are you? Is this a scam?", "Can I cancel?" (the minimum
  term from the constants, before payment), "How long does it take?". "How much is it?" still starts with the
  canonical `FINDABLE_OFFER_SUMMARY` (pinned by findable-offer-terms.test.ts); the route-fit price is in the close.
- **Voice note:** the 20-second version opens "hi mate, it's Sam from Findable.", drops "quick one", and with no
  website asks "have you got a website i missed, or is it something you've not got round to?". The generated note's
  prompt gains beat 0 *WHO IS SPEAKING* with the rep's first name (fn `voice-note-script` reads `team_members`), and
  the checker warns the rep when a generated note skips it. `VOICE_NOTE_GENERATOR_VERSION` 4 → 5, so older saved
  notes show "Written before the voice note said who is speaking. Regenerate…". ⚠️ The voice-note link check used to
  flag the bare word "Findable"; it now allows "from Findable" and still flags the address ("findable.live",
  "findable dot live").
- The caller name rule moved to a leaf, `src/lib/callerName.ts`, shared by the call script and the voice note.

## 3. Archived leads off the to-do list (M-008)

- `src/lib/salesWorkspace.ts`: one predicate, `isActiveWork(lead)` (only an explicit `is_archived = true` removes a
  lead). An archived lead is now in **no** next action, follow-up list (overdue, due today, replied-unanswered,
  interested-untouched, sign-up sent, going cold, warm, meetings), waiting reply, pipeline card, warmth count or
  health warning, and is not counted in "follow-ups due today". **Its history stays:** today's contacted/replies/won,
  the activity feed, trends and milestones still count what was really done.
- `supabase/functions/sales-performance`: reads `is_archived` on each lead for the fold.
- Already correct, checked, untouched: `notify_due_follow_ups` (reminders skip archived), Outreach and Inbox lists,
  the Outreach overdue count, the WhatsApp queue panel.
- **Not changed here — WS-2 owns it:** `quick-close` `my_handoffs` (the "Finish the handoff" card) still has no
  `is_archived` filter (master plan assigns `my_handoffs` to WS-2).

## 4. Audit findings on the call screen

Presentation only, no new data: the call card's one-line headline comes from the stored hook result the playbook
already selected (`audit.state` ready / running / none); the website line is the strongest stored crawl finding
title, "No website on file", or "Only a TradeHQ profile…". **Nothing is fabricated**: no result → "No audit yet" and
the opening claims none. **Bulk audit is not built** (WS-7). When WS-7 lands, its finished lead opens this same call
screen and the card shows the result with no change needed.

## 5. Logging the call

- Call outcomes are grouped: **Didn't speak to them** (No answer, Left voicemail, Wrong number) / **Spoke to them**
  (Spoke to owner, Interested, Call back, Meeting booked, Not interested). Other channels keep one grid.
- After **Interested / Spoke to owner / Meeting booked**, the result line offers **"Ready to pay now? Take the £99
  on the call." + Quick Close** (never on a lead that reads Not interested).
- The routing itself is unchanged and tested: Call back saves a Call, Meeting booked saves a Meeting and asks when,
  Not interested clears the Next Action and asks why, Wrong number blocks the number.

### Double submit (M-053 / E-12)
- **UI:** a ref guard in Log a contact — a second tap before the first answers is ignored (the `busy` state only
  disabled the buttons after a re-render, so two taps in one frame both went through). The Next Action form ignores a
  second Save while one is in flight.
- **Server (migration):** `lead_log_contact` and `lead_record_call` lock the lead row, then refuse a second row that
  is identical — same lead, same person, same kind, same outcome, same channel, same note — inside
  `call_log_dedupe_window()` (**10 seconds**). They answer `ok` + `duplicate: true` (safe for a retry after a lost
  response); the toast says "Already logged a moment ago — not recorded twice". A different outcome, a different
  note, another channel, another person, or the same outcome after the window is recorded.

## 6. Next Action concurrency (M-052 / E-13)

- `NextActionForm` (the one form every screen draws) captures **what it showed when it opened** — type, day, time —
  and sends it with every Save / Clear. The Outreach row's ✓ Done and the Call back / Meeting booked outcome writes
  send it too.
- `lead_set_follow_up` gains `_expected jsonb default null`. If the stored type, day or time no longer matches, it
  writes nothing and answers `stale_next_action` with the current values — unless the save asks for exactly what is
  stored already. A note-only difference does not block. A malformed expectation is refused (`bad_expected`).
- `saveNextAction` then asks **"This Next Action was changed since you opened it. It is now: Meeting · Tue 6 Oct ·
  14:30. Replace it with yours?"** Only a yes sends again (expecting the new value, so a third change is caught too).
  No / no browser → nothing replaced; every screen re-reads the row; the toast says "Kept the newer Next Action".
- Unchanged on purpose (no expectation sent): the admin bulk "Set Action" menu, Not interested's clear,
  `lead_set_call_booked`, `assign_lead_with_brief`.
- Pure rule + snapshot: `src/lib/nextActionStale.ts` (re-exported from `nextActionWrite.ts`).

## 7. "What do I do next?" (dashboard)

- For a **salesperson**, *What to do next* is now the **first** block on the Sales dashboard (it sat ~1,600 px down on
  a phone, under commission). The admin's overview keeps its order.
- Call-first wording and links: a due Call reads **"Call due today" / "Call overdue"**; a fresh audit reads **"Ready
  to call — open the call script and ring them"** and opens the lead (was "Share what AI says" → WhatsApp), ranked with
  the other warm items; an interested lead reads **"Ring them, or take the £99 with Quick Close"** and opens the lead.
  A WhatsApp reply still ranks high (the 24-hour window). Nothing in the list is a mass-WhatsApp task.

## Database (migration `20261007105000_call_workspace_guards.sql`) — NOT APPLIED

- Contents: `call_log_dedupe_window()`, the two call-log functions (dedupe), and `lead_set_follow_up` **dropped and
  recreated** with the 7th defaulted argument (keeping both signatures would make every named call ambiguous). Body =
  the live definition read 2026-10-04 + the check. Grants: `authenticated`, `service_role`; `anon` revoked.
- **Tested live, rolled back:** `supabase/tests/call-workspace-guards.sql` — one DO block that ends by raising its
  results. Run before applying, the runner swaps its `@@DDL@@` line for the migration's statements so the NEW
  definitions are tested in the same rolled-back block. **18/18 passed** on the live schema (double submit = one row;
  separate contacts recorded; after-window recorded; `lead_record_call` too; stale refusal with current values; booked
  meeting untouched; same-value save not a conflict; confirmed replace works and takes the booking; no-`_expected`
  back-compat; malformed refused; `lead_set_call_booked` still resolves; rep B refused on both writes). Read back
  afterwards: live `lead_set_follow_up` still the 6-argument version, no `call_log_dedupe_window`, no fake users, no
  activity rows — nothing persisted.

## Deploy order (for whoever merges — Paul authorises)

1. Apply the migration (one statement block at a time, read back `pg_get_functiondef` for all three functions and the
   grants). **Before** the SPA: the SPA sends `_expected`, which the old function does not accept.
2. Redeploy edge functions: **`sales-performance`** (archived filter + call-first wording, via `salesWorkspace.ts`) and
   **`voice-note-script`** (who is speaking, via `voiceNoteScript.ts` + `callerName.ts`). `salesCrm.ts` also reaches
   `admin-overview`, `business-summary`, `conversation-triage`, but the only change there is two refusal messages they
   never show — no redeploy needed for them.
3. SPA via `main` (Cloudflare Pages).

## Tests

- **New:** `scripts/call-workspace.test.ts` (all pass) — archived excluded with history kept; both routes' offer from
  the constants; route fit; no false guarantee (headline matches findable.live); identity in every opener, gatekeeper,
  voicemail and voice note; days without the year; no-audit / no-WhatsApp call still usable; outcome routing and Quick
  Close in the result line; double-submit guards (UI + migration); stale rule unit-tested + wiring; every lead write
  in the migration behind `_require_work`.
- **New live SQL:** `supabase/tests/call-workspace-guards.sql` (18/18, rolled back).
- **Updated (wording or structure deliberately changed):** cold-call-playbook (weekday not year; plain-words line;
  fallback is a hint), sales-style (short voice note ≤ 62 words, opens with who is speaking), voice-note-script
  (generator version 5), lead-state / sales-readiness / call-log-from-script / next-action-one-flow (source shapes),
  next-action-human-only (allowlists `nextActionStale.ts` — an expectation, not a write), dashboard-design (What to do
  next first for sales), outreach-list-columns (the walk stops at `QuickCloseDialog`, which takes only a lead id).
- **Rendered (throwaway harness, deleted):** the real `ColdCallPlaybookInline` with fixture data and mocked Supabase,
  built and screenshotted in headless Edge at 1366 px and inside a 390 px frame for three cases (audit + own site;
  no audit + no website; "who's this?" follow-up). No console errors; no horizontal scroll at 390 px (scrollWidth =
  clientWidth = 390 in all three); *Run the AI check* and *Log this call* fire. Nobody else has looked at it, and the
  Quick Close dialog itself was not opened in the harness (it needs the live function).

## Expected merge conflicts

- **WS-2 (Quick Close):** `src/lib/quickClose.ts` is only *imported* here (`QUICK_CLOSE_AFTER_PAYMENT`); if WS-2 renames
  it, `callClose.ts` follows. `QuickCloseDialog.tsx` untouched (only its button is rendered). If WS-2 adds a guarantee
  constant to `findableOffer.ts`, consider pointing `GUARANTEE_HEADLINE` at it (one copy).
- **WS-2 `my_handoffs`:** archived filter left to WS-2.
- **Shared files likely edited by others:** `LeadDetailDialog.tsx` (one prop on one line), `LeadCrmPanel.tsx`
  (`useSave` toast line, `LogContact`), `SalesDashboard.tsx`, `salesWorkspace.ts`, `sales-performance/index.ts`
  (select list), `coldCallPlaybook.ts`, and the structural tests listed above.
- **Migration number** `20261007105000` chosen clear of the existing `2026100612…` files; re-check against whatever
  merged first.
