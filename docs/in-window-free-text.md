# In-window free text (2026-10-31, `feat/in-window-free-text`)

**Rule:** anything sent from the Inbox to a lead whose 24-hour WhatsApp window is open goes as FREE TEXT, never as a Meta
template. Templates are for a closed window (the cold opener, a lead quiet for 24 hours).

**Why:** from 1 Oct 2026 Meta charges for a utility template inside the window, and gives 1,000 free service (free-text)
messages a month per number before charging the market's service rate (= utility). The UK figure is still unconfirmed
(`src/lib/channelCosts.ts`). No usage counter, by decision.

## Where it lives

- `src/lib/inWindowFreeText.ts` — the one rule. `freeTextVersionOf(payload, words)`: a payload with a HEADER (the video
  templates) or words that are empty / a placeholder / still carry a `{{marker}}` have no free-text version.
  `inWindowShape({ origin, windowOpen, allowClosedText, typed, version })` decides template / text / refuse.
- `send-whatsapp-message` — after the WHOLE template build (every guard, every resolver, the real payload), before the
  send-hours queue and the dry-run answer, the payload is swapped for `textPayload(words)`. The row keeps `template_name`, so
  `pitchEverSent`, the once-per-lead guards and `report_sent` see it as that template; `template_snapshot` is saved from the
  template payload with the words sent; `findings_shown` stays only while the words still carry the findings sentence.
  Response carries `sent_as` and, when the window was open but there was no version, `no_free_text`.
- Origins: `via:"inbox"` (direct) and a queued Inbox/popup row when it runs (`sched`). Everything else (bulk cold-opener
  queue, lead popup direct sends, admin dashboard buttons, welcome pack, Quick Close) sends templates exactly as before.
- Queued: a template send outside the lead's hours is queued as `kind:"template"` with the words in `body`. When it runs:
  window open → the words as free text; closed → the approved template (never refused for the window closing first).
- `as_free_text: true` (+ `template_name` + `body`): the composer's own (possibly edited) words for that template. Window
  closed live → refused `window_closed`, never silently replaced by the template's wording. Test mode → simulated text.

## The Inbox

- Picker, WhatsApp, window open: **Put in message box** runs the dry run (`via:"inbox"`) and puts the sender's own rendering
  (every value filled) into the composer, with a green note naming the template (Remove clears it). Send carries the marker.
  The template button shows only when the dry run says the template has no free-text version (the video ones).
- Window closed, or a text thread: unchanged.
- Quick reply: each saved reply has **Send now** (Queue outside send hours; keeps any half-typed draft). Window closed: the
  menu still shows, greyed, "They haven't replied in 24 hours". Saved replies never carry a template marker.

## The video templates (2026-10-31b, `fix/in-window-video-and-leftovers`)

`video_template`, `competitor_hook`, `explain_offer`, `explain_offer_v2` carry their video as a template HEADER with a LINK
(`VIDEO_TEMPLATE_HEADER_URL`, `https://findable.live/media/findable-hook.mp4`). In the window they go as an ordinary video
message by link (`videoPayload(link, caption)` → `{type:"video", video:{link, caption}}`), the filled (or edited) words as its
caption; the row is `message_type: "video"`, no `media_path`, `template_name` kept (bubble: "▶ Sent with the Findable video").
`freeTextVersionOf` accepts exactly one header holding exactly one https video link; caption over `VIDEO_CAPTION_MAX` (1024,
Meta's media-caption limit) → the template with the reason. Any other header, or a template with a placeholder body → the template.
The Inbox fills the composer exactly as for the others (the dry run answers `message_type: "video"`, mapped to sentAs 'text').

## A queued send whose words cannot be read back

A queued row keeps only the words + template name. `needs_from_you` rebuilds `{{2}}` from the transcript line
(`neededItemFromTranscript`); a send queued as the composer's own words has none. When it runs: window open → those words go
as free text (still recorded as the template); closed → refused `queued_words_unreadable` with `QUEUED_WORDS_UNREADABLE_REASON`,
which the drain stores on the failed row and the Inbox shows as "Not sent — …". Every other template rebuilds from lead data.

## Quick report rival count

`rivalsNamedInstead` (`hookAudit.ts`) counts the same answers the displayed score counts: with Google AI in the score (method 2,
`scoringMethodFor`) a shown Google AI answer that did not name them adds its names; the client's own name is never counted.
WSH Electrical 2026-10-31: "3 of 3 answers didn't name you. 4 other businesses were named instead." → "… 8 other businesses …".

## Every door, the landing margin, free only (2026-11-16, `v1-free-window-sends`)

Paul: "never pay for a template when it doesn't have to." The conversion is no longer Inbox-only.

- **Every door converts.** `inWindowShape` no longer returns the template for origin `other`: the Outreach WhatsApp popup
  (`via:"lead_panel"`), the admin dashboard buttons, Quick Close, the welcome pack, the questionnaire / submissions buttons
  and the Inbox bulk send all send the template's wording as free text while the window is open. Only the Inbox can send
  TYPED words (`as_free_text`). A template with buttons (none today) has no free version (`has_buttons`).
- **The automatic sends** (`process-whatsapp-queue`): the first-reply / audit_complete pitch (fires minutes after they wrote,
  so nearly always in-window) and the hook_followup lane ask `_shared/free-window.ts` `freeWindowSwap` — the same rule, the
  window read as the NUMBER's newest inbound row (a failed read = closed = the template). Row keeps `template_name`,
  `message_type` is text / video, snapshot from the template payload. Not converted, because their window cannot be open by
  their own eligibility: the cold opener drip and contact_followup (never replied). Not touched: `stripe-webhook` payment
  confirmation and the free-check result (window almost never open; payment code).
- **The landing margin.** Template → free is judged by `freeWindowOpen(lastInbound, now)` (`inWindowFreeText.ts`; kept out of `serviceWindow.ts`, which 20 functions import): open only
  if `now + WINDOW_LANDING_MARGIN_MS` (5 minutes) is still inside the 24 hours; an inbound "from the future" is closed. A typed
  free-text reply's own gate (`WINDOW_MS`, no margin) is unchanged. A queued send is judged when it runs.
- **free_only** (`WhatsAppSendArgs.freeOnly` → `free_only: true`): anything that would go as the paid template is refused
  `would_be_paid` (`WOULD_BE_PAID_REASON`); outside the lead's send hours it is refused too (`queueGate` `beforeInsert`),
  nothing queued, because a queued send could go paid when it runs. BUILD_ID `2026-11-16a-free-window-sends`.
- **Screens** (`src/lib/freeWindowLabels.ts`, price = `CHANNEL_COST_GBP.whatsapp_marketing`, absent = paid): the Inbox bulk
  confirm shows "X free (window open) · Y need a paid template (window closed, about £… each)" from each lead's own dry run,
  with **Send only the X free** (free_only) and **Send all N**; the Inbox picker and the Outreach WhatsApp popup show
  "Free (window open)" / "Paid template (window closed, about £…)". The dashboard buttons have no label (the server still converts).

## How the bulk "Send N now" worked before this (2026-11-16 check)

Inbox `runBulkSend` → `useInbox.send` → `sendWhatsAppRequest(sb, { ...args, via: 'inbox' })` per lead, so since 31 Oct the
Inbox bulk send ALREADY went as free text inside the window (origin `inbox`). What paid every time: the Outreach popup, the
dashboard buttons, Quick Close, and the automatic audit reply / report follow-up in `process-whatsapp-queue`.

Tests: `scripts/in-window-free-text.test.ts`, `scripts/free-window-sends.test.ts`.
