# Malaysia and Singapore (2026-10-14, `feat/my-sg-support`)

The team started prospecting Malaysia and Singapore on 14 October 2026. A read-only check that morning found V1 had no
Malaysia at all and was UK-only for phones, sending, hours and opt-outs.

## The rules (one place each)

| Rule | Where |
|---|---|
| A stored number → the digits we send to (MY `60…`, SG `65…`) | `src/lib/waNumber.ts` `malaysiaDigits` / `singaporeDigits` |
| Which market a number is (UK / MY / SG mobile; callable incl. landlines) | `src/lib/outreachMarkets.ts` `mobileMarketOf` / `callMarketOf`; SQL twin `public.mobile_market(country, phone_key)` |
| Per-country switch (WhatsApp, SMS, browser calling), country daily caps, local send hours | table `public.outreach_country_settings` (UK on, MY/SG seeded OFF); `channelOn`, `windowForMarket`; SQL `outreach_channel_on`; admin-only writes via `set_outreach_country` |
| A MY / SG lead's phone is stored E.164 | SQL `public.my_sg_e164` + trigger `trg_outreach_leads_my_sg_phone` (rewrites only a MY/SG row, only a readable number) |
| The country from Google's address (incl. "Singapore 048616") | `src/lib/leadCountry.ts` |
| Audit wording "plumber in Johor Bahru, Malaysia" | `src/lib/seedGuard.ts` `placeJoin` (comma for MY/SG only — new markets, no replay to keep comparable) |

## Facts worth knowing

- `phone_key` was NOT changed (no index rebuild). `+65 9123 4567` keys as `6591234567`, `+60 12-345 6789` as `60123456789`
  — already their own. National forms meet them because MY/SG phones are stored E.164 (Add Lead, CSV import, the trigger).
- `phone_e164_key` gave a 10-digit `65…`/`60…` key a `+44` (so "Wrong number" on a Singapore lead suppressed a number nobody
  owns). Fixed by one branch above the UK one. The UK has no `06…` numbers, so no UK key can start 6.
- A real MY / SG mobile in a market whose channel is OFF answers `country_off` — skipped, never "No mobile" / "No SMS".
  `not_a_uk_mobile` (stored token) still means "not a mobile we message".
- Malaysian mobiles: `01x` + 7 digits, or `011` + 8 digits. A `1-800` number is not a mobile. Singapore mobiles start 8 or 9;
  `6…` is a landline, `3…` VoIP.
- Send hours: the UK keeps 07:00–21:30 London (WhatsApp) and 09:00–20:00 London (texts). MY / SG use their own local hours
  (default 09:00–19:00, UTC+8) for the WhatsApp drip, both follow-up lanes and the SMS drip. A country at its own daily cap
  holds its leads like the window does. Manual Inbox sends have no window (unchanged).
- The held `whatsapp-status` function imports `waNumber.ts` but was NOT redeployed (held for the Meta App Secret). Its output
  for an incoming `60…` / `65…` number is identical under the old code, so nothing is lost.

## Opt-outs (Part B)

- SMS: `isStopMessage` (whole text) has the Malay and Chinese stop words; an inbound text ALSO opts out on `isOptOut`
  (`replyTriage.ts` OPT_OUT) — the same phrases WhatsApp replies are triaged with. Malay / Chinese phrases are as narrow as the
  English ones: "Boleh berhenti kat kedai esok?" is not an opt-out.
- Declines (`inboundClassify.ts`) include "tak berminat", "没兴趣" etc. — a decline never gets an automatic pitch.

## SMS sender

Texts go from TWILIO_SMS_FROM = the UK long code +44 7400 420187 (confirmed by secret digest, value never printed). No
Malaysian / Singapore sender registration exists, so delivery there is not guaranteed; Twilio's Geo Permissions must
allow MY and SG for SMS and voice or Twilio refuses the send.

## Templates with UK / £ wording (do not use for MY / SG)

`explain_offer`, `explain_offer_v2` ("941 UK businesses", £99 / £29.99 — already blocked as stale offers),
`re_engage` (£49.99, legacy), `booking_switch_barbers` (£29.99, dead barber product). The openers (`initial_contact`,
`initial_opener_v2`) have no UK or £ wording. The sign-up link and report pages are in £ (money is out of scope).

## CSV import (Part C)

- A Country for the whole file (UK / Malaysia / Singapore, or worked out per row as before); a row's own Country wins.
  The preview counts rows by country and the numbers that could not be read there (`countsByCountry`); the server names the
  country on every result row (migration `20261025090200`).
- **A researched lead file** (Ethan's language-school list, 53 columns) is recognised by its columns (`isResearchFile`) and read
  by `buildResearchRows`: name / country / city / website / whatsapp_number / owner_name + owner_role; "Not established" (the
  whole value) is empty; the note = hypothesis_1 + english_evidence (or website_absence_evidence) + proposed_offer, first
  sentences; every other column goes to `outreach_leads.import_extra` (jsonb, new leads only, never shown). Batch defaults to
  the file name, trade to Language schools — only for that shape; every other file imports exactly as before.
- Checked 2026-10-14 against the real file (100 rows, kept out of the repo), check-only as admin, rolled back:
  100 valid, all new — Malaysia 79, Singapore 21, 0 invalid, 0 duplicates.
- ⚠️ **The batch name lost every "s" until 2026-10-14** (`regexp_replace(_batch, 's+', …)` — the backslash of `\s+` was lost
  when `20261024100000` was written, and copied twice). Fixed by `20261027090000_import_batch_name_spaces.sql` (the live
  definition with that one line changed, read back). No lead had a batch when it was found.

## Coverage (2026-10-14, `feat/coverage-my-sg`)

- Coverage has a Country (UK / Malaysia / Singapore; URL `?country=` only when not the UK; remembered like the trade).
  The rules: `src/lib/coverageCountries.ts`. The UK view reads `uk_towns` and counts every lead EXCEPT a Malaysia /
  Singapore one — the same rows as before (no UK town can match those).
- Malaysia / Singapore towns = Find Leads' `SUGGESTED_LOCATIONS` for the country (reused) + a few towns Ethan's file named,
  with the state / URA region. **No population** (no source in the app; none invented) — the population band and the
  Niche verdict (it samples UK towns) are UK-only.
- A lead counts by its OWN `country`. City text is read by `resolveCoverageTown`: the first piece (outside brackets, split on
  `, ; /`, then bracket contents) that is a listed town or alias wins — "Kuala Lumpur (Cheras)" → Kuala Lumpur, "Penang" →
  George Town, "Skudai (Johor Bahru)" → Johor Bahru. Unlisted Malaysian place → its own row ("from your leads"); unlisted
  Singapore → Singapore. Search runs (no stored country) count by their location's tail ("…, Malaysia") or a listed town.
- Find leads on a row passes `country=` and Find Leads waits for that country before the arrival search runs.
- Language schools is a trade (`trades.ts`; searched and stored as "Language schools", what the research import stores).
- Checked 2026-10-14 with Ethan's real file (rolled back, 0 kept): imported as admin with batch "Language schools" →
  100 created (79 MY / 21 SG), batch intact, trade Language schools, town = the city as written, no `derived_town`. Folded
  through the Coverage code: all 79 Malaysian leads land on a row (KL 22, George Town 7, Johor Bahru 6, Kuching 6 …, 7 on
  "from your leads" rows), all 21 Singapore leads under Singapore; none in the UK view.

## Deploys

- Part A (country plumbing, sending OFF): migrations `20261025090000_my_sg_markets.sql`, `20261025090100_my_sg_import.sql`.
