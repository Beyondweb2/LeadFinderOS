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
- Origins: `via:"inbox"` (direct) and a queued Inbox/popup row when it runs (`sched`). ⛔ **Since 2026-11-16 (Paul) every other
  door too** (lead popup, admin dashboard buttons, welcome pack, Quick Close = `other`, never typed): window open → free text,
  closed → the template. See "Every template, single or bulk" below.
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

Tests: `scripts/in-window-free-text.test.ts`.

## Every template, single or bulk (2026-11-16, branch v1-window-free-text)

Paul: "when sending any template (single or bulk) to someone whose 24-hour window is open, send its wording as a normal free-form
message, never as a paid template. Only use the actual template when the window is closed."

- **The rule** `inWindowShape`: origin `other` now converts like a queued send (typed words never apply there, so it never refuses).
- **The bulk queue** (`process-whatsapp-queue`, which posts to Meta itself): the drip (openers), hook follow-up and contact follow-up
  lanes each call `queueLanePayload(templatePayload, body, await phoneWindowOpen(service, to))` (`_shared/in-window-send.ts`, rule =
  `queueSendShape`). The window is read per NUMBER from inbound rows (Meta measures it per business number + customer). A failed
  read = closed = the template. The row keeps `template_name`; `message_type` is text / video when it went free.
- **Bulk confirm** (Outreach → Queue WhatsApp): "X free (window open) · Y need a paid template (window closed, ~£0.06 each)" and
  "Keep only the X free ones" (narrows the selection; then Queue). Read when the dialog opens; each send is decided again when it goes.
  The price is `CHANNEL_COST_GBP.whatsapp_marketing` (`templateSendPrice.ts`), an estimate until a billed row agrees.
- **Single send** (the lead WhatsApp popup): "Free: … goes as a normal message" / "Paid template: … (~£0.06)".
- Tests: `scripts/in-window-free-text.test.ts` sections 2, 5, 6 (pure + source; nothing is sent).
