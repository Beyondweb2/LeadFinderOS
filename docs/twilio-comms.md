# Twilio SMS + browser calling + "Best way to contact" (2026-10-09, `feat/twilio-comms`)

One communications system, not a second one: SMS is the second tab of the existing Inbox, calling lives in the existing Call
tab, and links still come from Quick Close. WhatsApp (Meta direct) is untouched; `whatsapp-status` was not changed or deployed.

## What exists

| Piece | Where |
|---|---|
| Routing decision (pure) | `src/lib/contactRouting.ts` — `decideContactRoute(facts, 'link' \| 'message' \| 'call')` |
| Cost model (estimates, one editable table) + SMS segment counter | `src/lib/channelCosts.ts` |
| Texts, link allow-list, delivery states | `src/lib/smsMessages.ts` |
| Webhook signature + voice token (Web Crypto, no SDK) | `src/lib/twilioAuth.ts` |
| Sender with every guard | `supabase/functions/_shared/twilio-sms.ts` (`sendSmsToLead`) |
| Env + REST | `supabase/functions/_shared/twilio.ts` |
| Functions | `twilio-sms-send` (JWT), `twilio-voice-token` (JWT), `twilio-webhook` (public, signature-checked) |
| Quick Close | `quick-close` `share_link` / `share_setup` accept channel `sms` |
| Tables | `sms_messages`, `sms_conversation_reads`, `call_logs` (migration `20261018090000_twilio_comms.sql`) |
| UI | Inbox `?channel=sms` (`SmsInbox`), `LeadSmsPanel`, `BestWayToContact`, `CallPanel`, `SmsLinkSend`, `useTwilioCall` |

## Rules this encodes (each is pinned by `scripts/twilio-comms.test.ts`)

- **Absent is never a yes.** WhatsApp is recommended only on proof (a delivered message, or they replied and the 24-hour window
  is open). A mobile number is "can try", never the recommendation. No unofficial number-checking.
- **SMS follows a conversation.** First text only after a logged conversation, a message from them (SMS or WhatsApp), or by an
  admin. There are no cold SMS openers and no bulk/campaign send path.
- **The lead decides the number.** Neither the text sender nor the call token accepts a phone number; the number is read from the
  lead (and for a call from the `call_logs` row the token function wrote).
- **Links.** Setup and agreement links are made and sent only by Quick Close (`generate_link` → `findable-checkout`: the
  agreement page first, Stripe only after it is signed; the sale is credited to the rep who created it). The SMS sender accepts
  only `findable.live/agree/<token>`, `findable.live/onboarding/?lead=<id>` or the home page. A Stripe URL is refused. Free text
  cannot contain a link.
- **Delivered means the carrier said so.** Twilio "queued" is queued; `delivered` only from the status callback; receipts never
  move a message backwards; a test send is labelled and never counts.
- **Failures offer another route.** A failed text marks SMS failed in the router, which recommends the next channel; nothing
  resends automatically and nothing is sent on two channels by default (an already-sent link says so).
- **Calls are not contact.** Opening the workspace, pressing Call, or a connected call writes no lead state. The call row and one
  History line ("Browser call") are the only writes; the rep still logs the outcome (`lead_log_contact`). Not recorded, ever.
- **Free alternative is never a silent swap.** "Call on WhatsApp" (the rep's own phone, wa.me) is a separate labelled button. A
  failed browser call does not start it, and it does not start a Twilio call.
- **Opt-outs.** `contact_suppressions` is checked before every text and call (unreadable = refuse). A STOP reply is recorded as an
  opt-out (`source twilio_inbound`).
- **Abuse limits.** `guard_action` actions `sms_send` and `voice_call` (per minute / hour / day; suspended or not-ready reps refused).
- **Test mode is the default.** `TWILIO_TEST_MODE` anything but exactly `off` simulates: no SMS leaves, no call is placed, rows are
  `simulated`. QA fixtures (reserved numbers, test accounts) are simulated/refused by `qaSafety` even when live.

## Costs (ESTIMATES — `channelCosts.ts`; check against a billed row)

Official Twilio pages could not be fetched on 2026-10-09; third-party and cached figures disagree. Rounded-up working numbers:
SMS ≈ 5p per segment out (≈ USD 0.046–0.056 + carrier fees), ≈ 1p per reply in; browser call ≈ 3.5p/min to a UK mobile (≈ USD 0.03 +
≈ 0.004 client leg), ≈ 2p/min to a landline; UK mobile number ≈ USD 2.50/month. WhatsApp via Meta direct: reply inside the 24-hour
window free; UK utility template ≈ 1.6p–2p, marketing ≈ 4p–6p (sources vary; some say service charges change from 1 Oct 2026 —
unconfirmed). Email ≈ free. Cost only breaks ties between channels likely to land.

## WhatsApp calling (investigated, not built)

Meta's Cloud API does support business-initiated calls, but it needs the user's prior **call permission** (limited to a few
requests per user per day/week; unanswered calls revoke it), a messaging limit ≥ 2,000 unique recipients/day, calling enabled on
the number, and the number on Cloud API. A cold prospect has granted nothing, so it cannot be the cold route. The existing wa.me
"Call on WhatsApp" stays as the labelled free alternative.

## What must be configured (nothing is live until it is)

Supabase secrets (`npx supabase secrets set …`): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM=+447400420187`,
`TWILIO_API_KEY_SID`, `TWILIO_API_KEY_SECRET` (a standard API key created in the Twilio console), `TWILIO_TWIML_APP_SID`;
`TWILIO_TEST_MODE=off` only when ready for real sends/calls. Optional `TWILIO_WEBHOOK_BASE` if the functions URL differs.

Twilio console, all POST, base `https://ruusxpkkmwtljxxulhbq.supabase.co/functions/v1/twilio-webhook`:
- the number +447400420187 → Messaging "A message comes in": `…?type=sms-in`; Voice "A call comes in": `…?type=voice-in`
- a **TwiML App** → Voice Request URL `…?type=voice-twiml`, Status Callback URL `…?type=voice-status` (this app's SID is `TWILIO_TWIML_APP_SID`)
- no webhook is needed for outbound SMS status: each message carries its own `StatusCallback` (`…?type=sms-status`)

## Unverified until credentials exist

Live SMS delivery to a real handset, Twilio's acceptance of this sender, real browser audio, carrier filtering of UK long-code SMS,
STOP handling end to end, and the inbound-call message. Everything else is covered by mocks and text assertions.

## Compliance notes (not legal advice)

UK PECR: unsolicited marketing texts to individual subscribers (including sole traders) need consent; to limited companies they do
not, but identification and an opt-out are required. The product only texts after a conversation, every template says who we are
and how to stop, and STOP is honoured. Cold calling to numbers on the TPS/CTPS register is a separate compliance question
(already open in `docs/open-problems.md`).

## SMS queue, text button, one Inbox (2026-10-09, feat/sms-queue-and-method)

- **Row text button / Queue text.** `SingleSmsDialog`, `QueueSmsDialog`, `SmsQueuePanel` (on the queue page). The queue is a LANE (`outreach_leads.sms_queued_at`, by `sms_queued_by_user_id`), never a status. `queue_sms_openers` refuses with a named reason: not a UK mobile, opted out, already texted, already in a WhatsApp conversation, spoken to, not at the start, client, not yours.
- **The cold text** is `sms_opener` (src/lib/smsMessages.ts) - the ONE text that needs no conversation. Wording is Paul's to change in that file. Cold rules in `_shared/twilio-sms.ts`: never texted, no WhatsApp thread, never spoken to.
- **The drip** `process-sms-queue` (cron `sms-queue-run`, every minute): paused -> window 09:00-20:00 London -> pacing -> daily cap (`SMS_QUEUE_DAILY_CAP`) -> ONE send through `sendSmsToLead`, as the person who queued it. Test-account-held and suspended-rep leads are skipped, never dropped.
- **Contact Method.** A real (non-simulated) text sets `contact_method = sms`. `/inbox?lead=<id>` with no channel opens the SMS tab when the lead is on Text (`useInboxChannel`); an explicit `?channel=` wins. Reps may set Text by hand (`lead_set_contact_method`).
- **Nav.** The sidebar / phone nav say Inbox for both roles; one badge = WhatsApp + SMS unread (`useAllInboxUnread`).
- Compliance: a cold text is marketing. Limited companies need identification + opt-out (present); sole traders need consent (PECR) - Paul's call; the queue has a daily cap and the STOP list.

## SMS reuses the WhatsApp templates (2026-10-09, feat/sms-reuse-whatsapp-templates) - this REPLACES the bespoke SMS texts above

- **No SMS copy exists.** `src/lib/smsMessages.ts` lists which WhatsApp templates SMS may carry: cold openers `initial_contact`, `initial_opener_v2` (chosen per send / per batch, as on WhatsApp - `openerVariant.ts`); conversation templates `book_call`, `re_engage_49`, `contact_followup` (conversation gate); `findable_signup_link` (Quick Close only, agreement or setup variant, link resolved by `link-template-vars.ts`).
- The server renders with the WhatsApp sender's own `renderTemplateBody`; the screens preview with `readableTemplateBody` (`src/lib/smsPreview.ts`). `scripts/sms-queue.test.ts` pins that the two are identical for every template and that the only difference from WhatsApp is the `Reply STOP to opt out.` line on a COLD text.
- Not offered by SMS: the audit-driven templates (`video_template`, `competitor_hook`, `audit_*`, `ai_site_findings_v2`) and `explain_offer(_v2)` - they need the lead's audit/rivals/report link resolved by the WhatsApp sender and run to 2-8 segments. The bespoke `sms_opener`, `follow_up`, `website_link`, `setup_link`, `agreement_link` texts are gone.
- The SMS queue stores the chosen opener on the lead (`outreach_leads.sms_queued_template`); `queue_sms_openers(uuid[], text)` accepts only the two openers.
