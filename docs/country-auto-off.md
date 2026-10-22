# Country auto-off only on a pattern; an off country holds its queue (2026-10-22, `fix/country-auto-off`)

## What happened (22 Oct, read-only, live DB)

- Australia was switched on at 03:40 UTC (10:40 Bangkok). Sends: ok, ok, ok, ok, **Nifty Driving School failed** at 03:51 →
  `country_whatsapp_auto_pause` switched Australia off ("1 of its first 5 sends failed (Meta gave no error code)").
  Earlier the same morning (03:04) **Start Me Up Driving School** failed as the 2nd send and switched it off the first time.
- The drip then released every queued Australian lead, one per tick, back to New: **70 leads** `not_contacted` /
  `country_off`. Nothing queued abroad at the time of the check.
- Both failed leads are `no_whatsapp` / `no_whatsapp`. Both numbers are valid Australian mobiles in form
  (+61 4xx xxx xxx, 11 digits, `mobile_market` = AU): +61 403 409 954 (West Wodonga VIC), +61 413 824 554 (Maryborough QLD).

## Why Meta "gave no error"

Meta did give one — it was not stored. Both messages were ACCEPTED at send time (each has a Meta message id); the failure
came later as a delivery report through the `whatsapp-status` webhook. The live webhook (v114, held — not to be deployed
until the Findable Meta App secret is ready) reads `errors[0].code` only to route the lead and writes no error columns
(`docs/send-error-capture.md`). It routed both leads to `no_whatsapp`, which `_shared/whatsapp-failure.ts` does ONLY for
Meta **131026** ("not on WhatsApp / not deliverable"). So: almost certainly 131026 — the numbers are real mobiles that are
not WhatsApp accounts (or cannot take the message). Every outbound WhatsApp failure of the last 30 days (74) has a NULL
code for the same reason. The old trial rule exempted 131026 but could not see it, so it treated a not-on-WhatsApp
number as a country problem.

## The new rule (one place: SQL `country_whatsapp_auto_pause`, mirror `src/lib/countryAutoPause.ts`)

Counted on real sends to Malaysia / Singapore / Australia since the country was last switched on:

| | |
|---|---|
| **Pattern** | at least `whatsapp_auto_off_min_fails` failures (default **5**) AND at least `whatsapp_auto_off_fail_pct` % (default **50**) of the last `whatsapp_auto_off_window` sends (default **10**) |
| **Systemic** | any failed send in that window with a Meta code about OUR account or template — `COUNTRY_SYSTEMIC_CODES`: 0, 3, 10, 190, 200 (login / permission), 368, 131031, 131042, 131045, 131048, 131057, 133010 (account restricted / rated down / unpaid / unregistered / maintenance), 130497 (not allowed in this country), 131063, 131064 (marketing off / limited), 132001, 132007, 132015, 132016 (template missing / policy / paused / disabled). One is enough. |
| One failed number | never the country. The lead alone is flagged (No WhatsApp for 131026; WhatsApp failed otherwise — unchanged routing, no auto-retry abroad unchanged) |

Settings live on `outreach_country_settings` (NULL = default), changed only through admin `set_outreach_country`
(1–100 each; failures above the window refused). Not on the screen — the settings popup states the rule with each
country's numbers. Note: while the webhook stays held, delivery-report failures have no code, so "systemic" only sees
send-time refusals; the pattern rule covers the rest.

`whatsapp_off_at` / `whatsapp_off_by` are stamped by the switch trigger on every switch-off (`off_by` NULL = automatic) and
cleared on switch-on. Australia's 03:51 auto-off was back-filled.

## An off country holds its queue

`heldCountryOff` (`src/lib/countryHold.ts`, a leaf so `outreachMarkets.ts` did not change): a queued lead whose country (MY / SG / AU) is off — by hand or
automatically — is not chosen and nothing is written; it sends when the country is switched back on, through every
send-time guard as usual (suppression, phone history, window, cap, pace). The drip also leaves those countries out of its
queue read by stored prefix (+60 / +65 / +61 — every abroad lead was stored that way on 22 Oct) so a long held queue
cannot fill `QUEUE_SCAN` (400) and starve the UK. The UK is not held by this (it has the queue's own pause; its old
release path is untouched). While a country is off nothing new can be queued for it (`sales_queue_opener` answers
`country_off`), so the held set only shrinks.

Why this is safe: holding never sends; a country that is switched back on resumes at its own cap and pace, and the
pattern rule stops it again within ~10 sends if the problem is real. Trade-off: leads queued long ago go out when the
country comes back — remove them from the queue (Clear queue on that tab) if that is not wanted.

## Queue screen

On the country's tab: an amber note "Australia is off. 70 leads are waiting and will send when it is switched back on.
Switched off automatically after failed sends, at 10:51." (viewer's own time; "by hand at …" when a person did it) and the
stored reason underneath; an "off" marker on the tab; each row shows "Waiting: Australia is off". An off country's mobile
is no longer counted in "no number WhatsApp can reach".

## The 70 released leads

Not touched. They are `not_contacted` / `country_off` and need queueing again (by hand or a re-queue) once Australia is on.

## Deployed 2026-10-22 (main `c924edf8`)

- Full gate on the branch: 442/442 suites passed. Merged `--no-ff`; origin/main was unmoved throughout.
- SQL first: `20261122090000` applied and read back — new rule (`v_systemic`, no trial), switch trigger stamps
  `whatsapp_off_at`, `set_outreach_country` takes the three settings, auto-pause still not callable by anon / authenticated.
  All four rows at the defaults (NULL); Australia off, `whatsapp_off_at` 03:51:17 UTC, `off_by` NULL (automatic).
- Edge: `process-whatsapp-queue` only (the only function reaching `countryHold.ts`; `outreachMarkets.ts` unchanged), live v246,
  body carries `heldCountryOff` / `country_off_held` / `HELD_PHONE_PREFIX`. Five normal UK sends in the first 10 minutes, no
  pause. `whatsapp-status` not touched (held).
- SPA live on app.leadfinderos.com and leadfinderos-next.pages.dev (entry `index-CVTZAl1G.js`; `WhatsAppQueuePanel-2ml9W8Cq.js`
  has the off note; `whatsNew-CTw5QoWJ.js` has the entry — What's New is its own chunk now, not in the entry).
- Australia NOT switched on (Paul's action). The 70 leads released this morning are untouched (New / `country_off`).
