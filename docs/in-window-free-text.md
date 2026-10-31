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

## Templates with no free-text version (go as the template, the picker says why)

`video_template`, `competitor_hook`, `explain_offer`, `explain_offer_v2` — the video header (`WA_TEMPLATES[*].headerVideoUrl`).
Any template whose renderer is missing (placeholder body) falls back the same way.

Tests: `scripts/in-window-free-text.test.ts`.
