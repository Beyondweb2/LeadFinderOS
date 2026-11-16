# Send more info (2026-11-16)

Paul's request: a salesperson on a call is asked "send me more info". The prospect page's Close section has **Send more info**:
Email or Text (no WhatsApp), previewed and editable, then sent.

## Where things are
- Wording (Paul's text, word for word, only the variables change): `src/lib/moreInfoMessage.ts`. Test: `scripts/send-more-info.test.ts`.
- Server: `supabase/functions/send-more-info` (modes `preview`, `send`, `settings`, `save_settings` admin-only). `verify_jwt = true`.
- UI: `src/components/SendMoreInfo.tsx` (button + dialog), mounted in `src/components/ClosePanel.tsx` under the sign-up sends.
- Setting: `public.more_info_settings.price_line` (one row, RLS on, no policies; read/written by the function). Default
  `£99 a month for 12 months (or £999 up front)`. Admin edits it in the dialog ("Price line").
- Migration `20261221090000_send_more_info.sql`: the settings table, History kind `more_info_sent`, guard action `email_send`.

## Rules
- Variables: business name (the lead's BUSINESS name), report link (the Inbox's report rule `resolveLeadReportAudit`, never a
  measurement; `findable.live/r/<code>`), trade with its article (`articleTrade`), price line (the setting), sender's first name
  (`team_members.display_name`).
- Blocked with a plain reason: no report yet, no business name, no trade, no sender name, AI names them in EVERY answer (neither
  competitor sentence would be true), a prospect-only country (Australia: no price/guarantee), a LeadFinderOS-style campaign.
- Named in some answers (the report's own displayed score for a quick check; the run's mention rate otherwise) → the competitor
  sentence becomes "AI mentions you sometimes, but mostly recommends your competitors". Named in more than half → a warning only.
- The text uses `{{price_line}}` where Paul's draft said "£99/month": point 3 says one setting for both, and the business rule says no
  surface names the monthly figure without the up-front one.
- An edit may change words but never add a link: only the lead's report link (unchanged) and findable.live (`moreInfoTextRefusal`,
  checked by the function and again by the SMS sender).
- **Call consent (2026-11-16, branch v1-more-info-consent):** the send window has a required tick "They asked for this info on a
  call" (`MORE_INFO_CONSENT_LABEL`), for email AND text; the function refuses `consent_required` without `call_consent: true`. For
  this message only it REPLACES the text's conversation gate (reps call from their own phones, so no call is on record):
  `sendSmsToLead` gate = `isCold || smsGateOpen(...) || moreInfoOpensSmsGate(a)` — only the `moreInfo` kind with `callConsent: true`
  opens it, and only fn send-more-info passes that kind. History row (`more_info_sent`) body adds "Asked for info on a call, confirmed
  by Valentin"; `data.consent` = who (user id + name), when, channel. Opt-out/DNC, QA test-lead rule, send limits and texting hours
  are unchanged; cold texts and every other text keep the conversation gate. No migration.
- Text: through `_shared/twilio-sms.ts` `sendSmsToLead` (`moreInfo` kind): access, UK mobile, opt-out / do-not-contact, the
  conversation gate (an answered call counts), QA, the `sms_send` guard. Outside the lead's texting hours it is refused, not queued.
- Email: Resend from `<First> at Findable <hello@findable.live>` (the alerts' verified domain), `reply_to` = the salesperson's login
  email, plain text, Resend `Idempotency-Key` per press. Suppression, the QA sink (`qaEmailHold`) and the `email_send` guard first.
- After a send: History `more_info_sent` ("More info sent by Valentin via SMS"); the salesperson's screen then saves Next Action
  Follow up in two UK days through `saveNextAction` (the one human Next Action write). The send path itself writes no Next Action.
