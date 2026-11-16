# Inbox follow-up hooks + plain send errors (2026-11-16)

Paul: in the Inbox, Polite hook 2 on Antony Cooper (open window, he replied) was labelled "Opener" and its preview said
"This would NOT send — Edge Function returned a non-2xx status code".

## The real error
Function logs (`npx supabase logs --remote=<ref> --service function-edge --resource <send-whatsapp-message id> --level error`):
three POSTs at 13:32 UTC answered **503**; the function's own log at the same seconds: `[operator-auth] auth service unavailable:
auth service timed out after 8000 ms`. So the answer was `auth_unavailable` (the Supabase sign-in service timed out checking the
rep's session) — transient, not a polite_hook2 fault. Earlier the same day polite_hook2 dry runs succeeded ("WOULD SEND (text)",
v255). The screen showed the SDK wrapper because `useInbox.preview` used `error.message`.

## What changed
- `src/lib/functionError.ts` `invokeFailure(err)` → `{ error, reason, status }`: reads the body once; reason = the server's
  `reason`/`detail`/`message`, else the known-token sentence (`EDGE_ERROR_SENTENCES`), else plain words with the status. Never the
  wrapper. `plainRefusal(token)` for a bare token. Used by: Inbox preview (dry run), `sendWhatsAppRequest` (single + bulk sends,
  Outreach WhatsApp dialog), Inbox `sendNamed`, SubmissionsCard, LeadQuestionnaireSection. The preview line shows the reason.
- Labels: `TemplateGroup` gains `'followup'`; polite_hook, polite_hook2, webdev_hook, webdev_report, webdev_example,
  initial_question are `followup`. `templateGroupLabel()` is the one picker label rule (any continuation reads Follow-up; only a
  cold template reads Opener). Sending already treated all six as continuations (`CONTINUATION_TEMPLATES`, `NEEDS_PRIOR_WHATSAPP`)
  in preview, single send and bulk — unchanged.
- Test: `scripts/inbox-followup-labels.test.ts`.

## send-whatsapp-message on main
Live was v255 (09:40 UTC); `src/lib/clientOnboardingForm.ts` and `src/lib/protectionLimits.ts` (both reached by it) changed on main
after that, so it was redeployed from main with this release.

## "Send failed" on openers → "Not on WhatsApp" (same day, branch v1-not-on-whatsapp-label)
Paul's screenshot: Uglow Digital, Fram3, Britnett Tyne & Wear… openers ("Hi, is this …? Cheers") showing red Send failed.
Read-only check: in the last 24h 25 `initial_contact` sends came back `failed`; every one is Meta **131026** (whatsapp-status log
"failed (code 131026) … hasPriorSuccess=false"), i.e. the number is not on WhatsApp. All 25 leads are already `no_whatsapp`
(`_shared/whatsapp-failure.ts` leadFailurePatch): out of the queue, never re-sent, not counted toward country auto-off.
Meta does not charge undelivered messages and 131026 is not a block/report, so it is not what lowers the quality rating
(blocks, reports and low read rates do). The message row's `error_code` is empty because the live whatsapp-status (held, v138)
logs the code but does not store it on the row — left alone (the hold).
Change: `inboxStatusPill.ts` `not_on_whatsapp` ("Not on WhatsApp", muted, the stored No WhatsApp colour) when the lead is stored
`no_whatsapp`, our send failed, and they have not replied. Every other failure is still red Send failed.

## Live preview sweep (dry run, nothing sent) — 2026-11-16 ~14:00 UTC
Paul's session in the built-in browser, `send-whatsapp-message` `mode:"dry_run"`, `via:"inbox"`:
- Antony Cooper (open window, no audit), 30 templates (picker + dashboard): all answered 200. 22 previewed (in-window free text);
  8 audit templates refused "run an audit first" (correct); explain_offer / explain_offer_v2 refused `template_not_approved`
  (stale £29.99 wording, already greyed in the picker).
- A second open-window lead WITH an audit: webdev_report, competitor_hook (video), audit_followup, audit_followup_call,
  audit_followup_fault, ai_visibility_report_offer previewed; audit_reply / video_template / audit_reply_warm held
  `trade_starts_with_vowel_sound` (by design: "for a {{2}}").
- Fix (branch v1-plain-reason-detail): those holds came back with a TOKEN in `reason` (sentence or trade word in `detail`), which
  the screen would have shown bare. `refusalSentence()` (functionError.ts) now words every 200 refusal: known token → its sentence
  (`EDGE_ERROR_SENTENCES`, + template_not_approved, trade_starts_with_vowel_sound), else the first real sentence, else plainRefusal.

## In-window "an <trade>" for audit_reply / video_template / audit_reply_warm (branch v1-in-window-article)
Paul: fix the article in free text inside the open window instead of holding; keep the hold for closed-window paid sends.
- `templateVars.ts`: `bareTrade` (normaliseTrade minus the vowel rule) and `withTradeArticle(words, raw)` ("a electrician" →
  "an electrician", first match, only when the trade needs "an").
- `_shared/whatsapp-send.ts` templateBodyParams `trade`: with `extra.freeTextOnly` a vowel trade returns the bare value.
- `send-whatsapp-message` audit branch: `vowelFreeText` only when `freeWindow`; payload built with `freeTextOnly`; the words get
  the normalised trade (`bodyTrade`) and the fixed article; if the shape is not `text` the old hold is returned (never the paid
  template with "a electrician"). Also fixed: the free-text words used the TYPED trade ("for a Plumbers") — now normalised.
- The queue (process-whatsapp-queue) is unchanged: it still holds these trades (safe default; its lanes send templates).
- Test: `scripts/in-window-trade-article.test.ts`.

## Queue fairness status (asked 2026-11-16)
Not built. process-whatsapp-queue round-robins by CAMPAIGN (`interleaveByCampaign`), not by sender; there is no per-sender
round-robin (Valentin's leads alongside Paul's) and no 30-minute stuck-queue alert on main or any branch.

## Queue fairness by sender, stuck alert, rep status line, queue "an <trade>" (branch v1-queue-fairness)
- **Bug found:** `interleaveByCampaign` was re-derived every tick and broke rank ties by `queued_at`, so with one send per tick the
  first-queued campaign/sender kept winning (proved in `scripts/queue-fairness.test.ts`: the old order sent 20 of Paul's before any
  of Valentin's).
- **Fix:** `_shared/queue-fairness.ts` `fairQueueOrder(leads, lastSentBySender)`: senders (queued_by → holder → book owner) take
  turns ACROSS ticks, least recently served first (each sender's last queue send today, read from `whatsapp_sends` + the lead);
  campaigns still take turns inside a sender. Stateless (no cursor). One send per tick, caps, hours, cold guard, opt-outs, DNC,
  free-window rules untouched. Test: 2 senders × 50 → strict A,B,A,B; a cap of 30 → 15/15.
- **Stuck alert:** in a due tick (past pause, hours, cap, pacing), a sender with leads that could go and nothing sent for
  max(30 min, 1.5 × senders × pace gap) → `raiseOperatorAlert` (one bell row + one email per episode; dedupe key
  `queue_stuck:<sender>:<since>`). Reason words: `stuckReasonWords`. The threshold grows with many senders so the rotation itself
  never trips it.
- **Status line:** `process-whatsapp-queue` mode `my_queue` (sales + admin, read-only) → `senderQueueLine`: "Queued: 12, next send
  ~14:20", "Paused: daily limit reached / the queue is paused / outside send hours", or "Not moving since 13:10: <reason>". Rep sees
  their own; admin sees every sender (`src/components/SenderQueueLines.tsx` on the queue page).
- **Queue "an <trade>":** `_shared/free-window.ts` `tradeForFreeText` used by the reply lane and main lane: inside the 24 hours the
  three audit templates go as free text with "an <trade>"; the payload is built `freeTextOnly` and the send is refused if it would
  go as the paid template. Closed window = the old hold.
