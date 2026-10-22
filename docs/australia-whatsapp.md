# Australia: WhatsApp openers and replies, in each lead's local time (2026-10-22, branch `feat/australia-whatsapp`)

Paul's brief: Australia WhatsApp works for openers and replies, in each lead's own local time. He works Australia in his
Thailand morning and the UK in his afternoon. Set up like Malaysia. SMS to +61 stays refused. Prospect-only stays.

## The rules (one place each)

| Rule | Where |
|---|---|
| An Australian mobile = `61 4` + 8 digits → market `AU` | `src/lib/outreachMarkets.ts` `mobileMarketOf`; SQL twin `public.mobile_market` (`phone_key` `4` + 8 digits) |
| WhatsApp only: AU texts / browser calls are never on, whatever is stored | `channelOn` (`WHATSAPP_ONLY_MARKETS`); SQL `outreach_channel_on`; `set_outreach_country` refuses `whatsapp_only` |
| The lead's zone from its STATE: address → `coverage_town` → `search_location` → `derived_town`; a bare town is never guessed | `src/lib/auLeadZone.ts` `auLeadZone` |
| States → IANA zones: NSW/ACT Sydney, VIC Melbourne, TAS Hobart, QLD Brisbane, SA Adelaide, NT Darwin, WA Perth | `AU_STATE_TIME_ZONES` |
| Window: 09:00–17:00 (the AU row's hours, editable) Mon–Fri in the lead's zone; no zone = never open ("Needs state") | `windowForMarket(…, leadTz)`, `AU_SEND_DAYS`, `windowOpenAt` |
| Next opening skips the weekend, DST-correct | `src/lib/inboxSendWindow.ts` `nextWindowOpenAt` |
| Own budget: AU sends are left out of the team count and the team cap never stops AU; AU cap 100 (its own local day, Sydney) | `process-whatsapp-queue` (`teamCapReached`, `auMaySend`, `.not("phone","like","61%")`), `_shared/country-settings.ts` |
| Same auto-off and no-auto-retry as Malaysia | SQL `country_whatsapp_auto_pause`, `whatsapp_failure_country_check`, `whatsapp_my_sg_no_auto_retry`; the drip's `isNoAutoRetryMarket` |
| Prospect-only: no sign-up-link / £ template to +61 — now asked by the drip too | `src/lib/prospectOnly.ts`, `process-whatsapp-queue`, `send-whatsapp-message` |
| Inbox / Outreach popup: their day, time, city; a needs-state send is REFUSED (never queued) | `windowStatusLine`, `queueDecision` (`needs_state`), `_shared/inbox-schedule.ts` (`leadTzFor`) |
| A queued Inbox row is drained in the zone it was queued in | `inbox_scheduled_sends.tz` → `inbox-scheduled-drain.ts` `leadTz: row.tz` |
| Queue panel: "Needs state" count + row chip | `src/lib/whatsappQueueView.ts` `rowNeedsState` |
| Settings: the Australia row (WhatsApp switch, cap, hours; SMS / calls shown "never") | `src/components/CountrySendingSettings.tsx` |

Migration: `supabase/migrations/20261120090000_australia_whatsapp.sql` — ⛔ apply it TOGETHER with the edge deploy: before the
new `process-whatsapp-queue` is live, an Australian lead queued by the new SQL reaches the old drip, which calls it "not a UK
mobile" and marks it No WhatsApp. Validated 2026-10-22 against live inside a forced rollback (nothing kept).

## Facts found (2026-10-22, read-only)

- 97 Australian leads, ALL `status = no_whatsapp_needs_sms` ("No mobile"), `whatsapp_delivery_status` NULL. 77 are real
  Australian mobiles (04…); 20 are landlines. Every one of the 77 has a state in its Google address: Melbourne 26, Brisbane 24,
  Perth 17, Sydney 10. None needs a state today.
- `sales_queue_opener` only queues `status = 'not_contacted'`, so the 77 cannot be queued until their stale "No mobile" is
  cleared. That is a row rewrite — Paul's decision (below), not run by the session.
- Dry run (`scripts/_au-dry-run.ts`, never staged; reads the export, sends nothing): from Thu 22 Oct 09:13 Bangkok the first 5
  would go 10:14–10:18 Perth / 13:15 Melbourne / 12:18 Brisbane; from Saturday 09:00 Bangkok they wait to Mon 26 Oct 09:00
  Melbourne (05:00 Bangkok).

## The status reset (for Paul — run AFTER the migration, only if he says so)

```sql
update public.outreach_leads
   set status = 'not_contacted'
 where status = 'no_whatsapp_needs_sms'
   and whatsapp_delivery_status is null
   and (country = 'Australia' or address ~* 'australia\s*$')
   and public.mobile_market(country, public.phone_key(phone)) = 'AU'
   and public.lead_first_contact_at(id) is null
   and not coalesce(is_archived, false);
-- expected: 77 rows (re-count first)
```

## Open: "messages must identify Findable"

None of the approved openers says "Findable" in its text (`initial_contact` "Hi, is this {{1}}? Cheers", `initial_opener_v2`,
`initial_contact_short`), and none tells the reader how to opt out. The opt-out itself works (STOP / "not interested" phrases
→ `recordOptOut`, every marketing send refuses a suppressed number — unchanged). Whether the WhatsApp display name ("Findable"?)
covers identification could not be read without the Meta token. Australia's Spam Act expects sender identification and an
unsubscribe in each commercial message. Recommended: register an Australian opener with Meta that names Findable and says
"reply STOP" — Paul's action; nothing was registered.

## Deploy list (when Paul approves)

SQL first: the migration (then, if approved, the reset). Edge, by hand, from main — the 24 functions that reach
`src/lib/outreachMarkets.ts` (read 2026-10-22 with `node scripts/check-import-graph.mjs --reached-by src/lib/outreachMarkets.ts`;
re-walk before deploying): admin-overview, ai-reply-drafts, business-summary, conversation-triage, create-ai-audit,
findable-onboarding, inbox-scheduled-send, mockup, paid-client-hub, process-ai-audit-queue, process-sms-queue,
process-whatsapp-queue, quick-close, sales-performance, send-whatsapp-media, send-whatsapp-message (`BUILD_ID`
`2026-10-22a-australia-whatsapp`), send-whatsapp-voice, stripe-webhook, submissions, twilio-sms-send, twilio-voice-token,
twilio-webhook, warm-lead-reply, whatsapp-number-health. ⛔ Skip `whatsapp-status` (held). SPA: push main.

## Deployed 2026-10-22 (main `57fb9b73`)

- Edge first (new code with no AU row = Australia off, safe), then SQL. All 24 functions above deployed exit 0; live
  `x-swm-build` = `2026-10-22a-australia-whatsapp`; `process-whatsapp-queue` body carries `auMaySend` / `auLeadTz`,
  `twilio-sms-send` / `inbox-scheduled-send` carry the Australia wording. `whatsapp-status` NOT deployed (held).
- Migration `20261120090000` applied and read back: AU row on (WhatsApp only, cap 100, 540-1020, Australia/Sydney), both CHECKs
  include AU, `mobile_market` / `outreach_channel_on` / `set_outreach_country` / auto-off / no-retry include AU.
- Status reset run on Paul's approval: 77 Australian mobiles `no_whatsapp_needs_sms` → `not_contacted` (count read first: 77);
  the 20 landlines keep No mobile. 0 Australian leads queued and 0 sends at the time of the check.
- SPA live on app.leadfinderos.com and leadfinderos-next.pages.dev (entry `index-ef7zUOVO.js`; WhatsAppQueuePanel chunk has the
  Australia row; entry has the zone rule and the What's New entry).
