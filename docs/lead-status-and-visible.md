# Lead status from the messages + the Visible flag (2026-10-21)

Branch `feat/visible-and-status-sync`, migration `20261118090000_lead_status_and_visible.sql`. Audit of the problem (live counts):
`C:\Users\paulj\Documents\Findable\status-audit-2026-10-21.md`.

## Job 1 — one status rule

**Before:** Replied / You replied / back-to-Contacted were written by eight senders and handlers, each after its own send (SMS sender: none).
Faults: answering a bare "yes it is" left the lead on Contacted (the You-replied write only moved leads on Replied); a text never moved
it; a late "You replied" write could land after the prospect's newer message; a send that failed later stayed You replied; a message
linked to a lead later never moved it.

**Now:** the database derives it from the stored messages, whatever wrote them.

| Piece | What it does |
|---|---|
| `lead_conversation_signal(lead)` | `replied` (a real reply nothing of ours answered) · `awaiting_reply` (a person wrote, we answered after) · `not_a_reply` (only auto-replies / a bare yes since our last send, never a real reply) · null |
| `lead_status_target(status, signal)` | which statuses may move: to Replied from the contact/report/legacy statuses; to You replied only from Replied / Contacted / Second attempt (Report sent stays); back to Contacted only from Replied. Deals, clients, Not interested, opted out, closed: never |
| `trg_lead_status_from_message` | on `whatsapp_messages` and `sms_messages`: insert, a status change that alters "counts" (sent/delivered/read vs queued/failed), a late `lead_id`, a `reply_kind` change |
| `trg_outreach_leads_status_from_messages` | BEFORE UPDATE OF status: a SYSTEM write of Replied / You replied (or Replied → Contacted) that the messages contradict is corrected (the late-write race). `auth.role() = 'authenticated'` (a person) is never second-guessed |
| `lead_status_sync_log` | every change: source `message` / `sender_guard` / `repair` / `visible` (admin-readable) |
| `repair_lead_statuses_from_messages(apply, only)` | the same rule over every lead with messages. Never moves a lead INTO Contacted; writes only the status + the log |

Counted: inbound, or ours with `sent` / `delivered` / `read` (a QA fixture's `simulated` too). Test-mode rows on real leads never count.
`whatsapp_messages.reply_kind` (`auto` | `confirmed` | null) is written ONLY by ai-reply-drafts `tagReplies`, from
`src/lib/replyKindTag.ts` (the 20 Oct auto-reply reading: `autoReplyFlags` + `inboundLabel`). `confirmed` = a bare yes before any real
reply and before we answered; it is "not a reply" but a person — once we answer it, You replied.

The senders' own status writes (send-whatsapp-message / -media / -voice, voice-note send, the webhook's Replied) are left in place: they
now agree with the trigger or are corrected by the guard. Removing them is optional clean-up (needs those redeploys).

⛔ **Not fixed here — the held webhook:** `whatsapp-status` reads only `messages` and `statuses`; Meta's message ECHOES (messages typed
in the WhatsApp Business phone app under coexistence) are never stored, so nothing can move a lead for them.

## Job 2 — the Visible flag

Rules: `src/lib/visibleFlag.ts`. Newest ordinary audit (`isDrafterAudit`), counted on the chips' ruler (`ai_audit_queue`
`gemini_*` / `overview_*`, done rows). ⛔ Per engine, SEPARATELY (Paul, later 2026-10-21): an engine names them when it named them in
MORE THAN HALF of its own answers (1/1, 2/2, 2/3 yes; 1/2 no — GSI Driving School gets the pitch). ChatGPT never counts; Google AI with
no answer is never named. Settings: `whatsapp_outreach_state.visible_rule` `either` (default) / `both` / `off`
(`set_inbox_visible_rule`) and `visible_min_share` `half` (default) / `two_thirds` / `all` (`set_inbox_visible_threshold`, migration
`20261118100000`); `inbox_visible_settings()` reads both. A lead is re-judged when either changes (`ai_visible_checked_rule` = `rule:share`).

Judged by ai-reply-drafts (`judgeLeadVisible`): only once the audit has a complete run AND the website check is final (or 30 min after the
audit). The tick's `refreshVisibleFlags` runs FIRST each minute (audits from the last `VISIBLE_RECHECK_DAYS`, flagged leads on a rule
change); a pitch whose evidence just became final is judged inline. Written only by `apply_lead_visible`: on a new flag it clears the
report / opener follow-up markers, retires waiting pitches (`skipped_visible`), cancels automatic replies (`cancel_reason 'visible'`) and
resolves open drafts / Needs you rows. Clearing restores nothing.

A Visible lead's replies get a `skipped` row, reason `visible` (no draft, no Needs you); a stop still opts them out. Draft reply /
Regenerate refuse a pitch (`VISIBLE_NO_PITCH_DETAIL`). Inbox: `inbox_visible_leads()` → `WaConversation.visible` → the chip (row +
thread), Show → Visible. Not a pipeline status: `outreach_leads.status` is untouched.

## The first reply and "named too often" (later 2026-10-21, GSI Driving School)

GSI sent "Yes" (pitched) then "How can I help" 69 minutes later — outside the 5-minute burst merge — and got "No playbook reply fits".
- ⛔ `pickMove`'s `first` = the opener was our last kind of message AND no pitch has been sent (`pitchOwed`): never a time window. The
  burst merge (`MERGE_WINDOW_MS`) still only joins messages into one turn.
- ⛔ A plain confirm or "how can I help" (`isPlainConfirm`) is never "No playbook reply fits": the pitch while owed, else the go-on step
  (the pitch is not repeated once sent).
- ⛔ `namedShareOf` (the "named others instead" count, read by the drafter AND the template send gate) counts Gemini + Google AI where
  shown and scored — never ChatGPT. GSI: ChatGPT 2/2 + Gemini 1/2 + Google AI 0/1 read 3 of 5 (soft pitch); now 1 of 3 (full pitch).

Tests: `scripts/lead-status-and-visible.test.ts`; SQL replay `supabase/tests/lead-status-from-messages.sql` (39 checks, rolled back).
