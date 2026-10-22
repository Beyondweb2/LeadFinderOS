# Country refusals in plain words; a number's own code wins (2026-10-22, `fix/country-refusals`)

## Part 1 — why Australia switched itself off again at 08:50 UTC (read-only, live DB)

Australia was switched on at **08:30:58 UTC** and switched itself off at **08:50:16 UTC**. It had also switched itself off
at **08:03:12 UTC** after an earlier run (07:04–08:03). Both were the NEW pattern rule (`country_whatsapp_auto_pause`,
`docs/country-auto-off.md`): "5 of its last 10 sends failed (Meta gave no error code)". The rule did what it says.

The 08:31–08:50 run (12 queue sends, template `initial_contact_short`, all `test_mode` false):

| UTC | Lead (state) | Lead's local time | Result |
|---|---|---|---|
| 08:31 | Koombana Driving School (WA) | 16:31 Perth | delivered |
| 08:33 | Regan's Driving School (WA) | 16:33 Perth | read |
| 08:35 | Bakhers Driver Training (QLD) | 18:35 Brisbane | read (replied) |
| 08:37 | **Ten2 two driving school** (QLD) | 18:37 Brisbane | **failed → No WhatsApp** |
| 08:39 | Beep Beep driving school (WA) | 16:39 Perth | read |
| 08:40 | Geronimo Driving School (QLD) | 18:40 Brisbane | delivered |
| 08:42 | **Lyndon's Driving School Mackay** (QLD) | 18:42 Brisbane | **failed → WhatsApp failed** |
| 08:44 | **Cape to Cape Driving School** (WA) | 16:44 Perth | **failed → No WhatsApp** |
| 08:45 | **Alton's Driving School** (QLD) | 18:45 Brisbane | **failed → No WhatsApp** |
| 08:47 | ADT Driving School (QLD) | 18:47 Brisbane | read (replied) |
| 08:49 | Let'Z Pass School of Driving (WA) | 16:49 Perth | sent |
| 08:50 | **Kristina's Driving School** (QLD) | 18:50 Brisbane | **failed → WhatsApp failed** |

- **Error text: none stored.** Every send was accepted by Meta (each has a message id); the failure came later as a delivery
  report through the held `whatsapp-status` webhook (v114), which stores no code. It routed three leads to `no_whatsapp`
  (it does that only for Meta 131026, "not on WhatsApp") and two to `whatsapp_failed` (some other code — unknown).
- **The window.** The AU row's hours are stored as **09:00–19:00** (`send_end_min` 1140). The migration seeded 09:00–17:00
  (1020) and the code default is 17:00, so someone changed it in the settings screen (who is not recorded —
  `updated_by` is overwritten by every automatic switch-off). Every send was inside the STORED window in the lead's own
  state zone, on a Thursday. Against 17:00, the Queensland sends (18:35–18:50 Brisbane) and the whole 07:04–08:03
  run's VIC / NSW / QLD sends (18:04–19:00 local) were after 17:00. The window code is right; the setting is not what Paul
  expects.
- **Nothing sent outside a lead's window.** The three sends after the switch-off (09:12–09:13 UTC) were a person's typed
  replies to leads who had just replied (free-form, in the 24-hour window; manual Inbox sends have no window). The four
  "second sends" in the earlier run (A+, Freshers, Good, Pauli's) were also typed replies, never a second opener.
- **Not a sending bug.** The real issue: with no error codes, numbers that are simply not on WhatsApp count toward the
  pattern. Driving-school numbers in regional QLD / WA failed at about a third today (15 of ~47), and at that rate 5 of 10
  happens by chance often. Excluding sends whose lead was routed `no_whatsapp` (= 131026) would not have tripped either run
  (08:50: 2 of 10; 08:03: 2 of 10). That is a rule change — Paul's decision, not made here. Australia was NOT switched on.

## Part 2 — what changed

| Rule | Where |
|---|---|
| Why a number is not a mobile we message, in plain words (a Malaysian landline, a 1300 number, country not set, the label and the number disagree, another country) | `src/lib/phoneCountry.ts` `phoneProblemWords` |
| The number's own code vs the lead's country (lead-card warning) | `phoneCountryMismatch`; drawn in `LeadDetailDialog.tsx` (`workspace-phone-country-mismatch`) |
| The two list skip tokens' words (`not_a_uk_mobile`, `country_off`) — one wording | `src/lib/countrySkipWords.ts` (import-free: salesCrm is read by the Dashboard column walk) |
| A full international number typed without "+" (44… / 60… / 65… / 61…) is read by its code on a MY / SG / AU lead | `src/lib/waNumber.ts` `bareInternationalMarketOf` |
| An explicit UK code is UK whatever the label (SQL) | `public.phone_market_country`, migration `20261123090000_phone_prefix_country.sql` — used by `sales_queue_opener`, `queue_sms_openers`, `campaign_candidates` |

- A "+60 / +65 / +61 / +44" number already kept its code on every lead in TypeScript. The two real gaps were: (1) SQL
  `mobile_market` accepted a UK mobile only on a UK / blank lead, so "+44 7…" on a lead labelled "USA" / Malaysia was
  refused as `not_a_uk_mobile` and flagged No mobile; (2) a bare "447…" / "659…" / "614…" on a lead labelled another of our
  countries was read as that label's national number and refused.
- **349 live leads are labelled "USA" with UK addresses and +44 numbers** (all added 17–18 Sep, no source). The 178 UK
  mobiles among them were all contacted in September; the 171 marked No mobile are real UK landlines. So nothing is wrongly
  blocked today; the lead card now warns on all 349. Their country label was not changed.
- Hints are words only: "012-345 6789" on a UK lead says "If this is a Malaysian mobile (01x…), set the country to
  Malaysia or add +60" and is still read as a UK number. A number without a code is never guessed.
- Stale wording gone: "Not a UK mobile (cold WhatsApp is UK mobiles only)", "SMS goes to UK mobiles only", "No usable UK
  phone number to call", the queue panel's "(cold WhatsApp is UK mobiles only)", the drip's / send-whatsapp-message's
  "cold WhatsApp outreach is UK only", and the list text "not switched on for Australia". Australian mobiles now say
  "Texts / Browser calls never go to Australia — it is WhatsApp only".
- Not changed: UK / MY / SG / AU send rules, the auto-off rule, the rating watcher, the 1–2 minute gap,
  `whatsapp_my_sg_no_auto_retry` (asks for MY / SG / AU, which never read the country), the held `whatsapp-status`.

## The 100 Malaysian leads with a stale `country_off` marker

All 100 (`not_contacted`, added 17 Oct, all in a campaign) pass every check `sales_queue_opener` makes today (status,
contact history, conversation, number, market, switch on, suppression) — nothing blocks them. The marker is read only by
`isFreshLead` (Find Leads' Remove button treats them as touched). Left as they are.

## Deployed 2026-10-22 (main `5f9dd733`)

- Full gate on the branch: 444/444 suites passed. Merged `--no-ff`; origin/main unmoved throughout.
- SQL first: `20261123090000` applied and read back — `phone_market_country` answers as designed (+44 on USA / bare 44 on
  Malaysia → UK; a national number keeps its label), the three functions use it, none passes the raw country, grants
  unchanged (authenticated, postgres, service_role). Australia still off (not switched on); its hours still 09:00–19:00.
- Edge (23, the whole closure of the changed `src/lib` files): admin-overview, ai-reply-drafts, business-summary,
  conversation-triage, create-ai-audit, findable-onboarding, inbox-scheduled-send, mockup, paid-client-hub,
  process-ai-audit-queue, process-sms-queue, process-whatsapp-queue, quick-close, sales-performance, send-whatsapp-media,
  send-whatsapp-message (x-swm-build `2026-10-22b-country-refusals`), send-whatsapp-voice, stripe-webhook, submissions,
  twilio-sms-send, twilio-voice-token, twilio-webhook, whatsapp-number-health. Bodies checked for the new code.
  **`whatsapp-status` NOT deployed (held)** — it only matches inbound numbers, which arrive with their full code.
- SPA live on app.leadfinderos.com (entry `index-B1_5U9vs.js`): the lead-card warning, the plain words and the What's New
  entry are in the live chunks. Nobody has looked at it on screen.
