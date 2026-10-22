# whatsapp-status cutover — the plan (2026-10-22, planning only, nothing changed)

> **⛔ OPTION A IS OFF (2026-10-22, later the same day).** Paul no longer has access to Move37's App Secret, so it cannot
> be set. Nothing was changed live: `WHATSAPP_APP_SECRET` was never saved (checked in every project and the Vault) and
> `whatsapp-status` was not deployed — live is still v129 (fail-open, saves no error code). The error-capture code and the
> `WHATSAPP_APP_SECRET_NEXT` slot are merged in `main` but NOT deployed; the v129 rollback copy is kept.
> **The cutover now happens at the Findable switch, in this order** (v129 enforces whatever secret is set, so the secret
> and the webhook move go together):
> 1. Findable Meta app, number, token and templates ready (list at the end).
> 2. In the same few minutes: Paul moves the webhook URL to the Findable app AND saves the Findable App Secret as
>    `WHATSAPP_APP_SECRET`. On v129 that already verifies Findable-signed deliveries.
> 3. Claude confirms receipts and a reply still arrive (`scripts`: the receipts query in this record), then deploys the
>    `whatsapp-status` in `main` (error capture + fail closed), checks unsigned → 401, and runs the one test send.
> Until then delivery-failure codes stay unrecorded; the lead flag (No WhatsApp / WhatsApp failed) is what the screens show.

Goal: delivery failures save Meta's error code and text, and the webhook checks Meta's signature. Read with
`docs/handover/07-SECURITY-AND-PERMISSIONS.md` (the hold) and `docs/country-auto-off.md` (why the code matters).

## What is true today (checked 22 Oct, read-only)

- Live `whatsapp-status` = version 129, deployed 30 Sep 2026, from code older than the fail-closed rewrite. It accepts any
  POST without checking Meta's signature (the fail-open hole found 4 Oct, still live). It reads `errors[0].code` only to
  pick the lead's flag and saves no code, title or details anywhere.
- The held version in `main` checks `X-Hub-Signature-256` against `WHATSAPP_APP_SECRET` and refuses everything else
  (fail closed). **It does not save the error code either** — that still has to be written.
- `WHATSAPP_APP_SECRET` is not set. Set today: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
  `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_TEST_MODE`, `WHATSAPP_TEST_NUMBER` (names only).
- All sending and the webhook run on **Move37's** Meta app and number.
- Deploying from `main` also brings 47 commits of changes to the code that handles inbound replies (48 modules vs 28
  live: post-call reply matching, QA guard, opt-out words, Australia / Malaysia / Singapore numbers, SMS reply rules…).
  That is intended, but it is a big change to inbound and needs its own check after deploy.

## ⚠️ The documented order does not work as written

Meta signs every webhook with the App Secret of **the app the webhook belongs to**. Today that is Move37's app. The order
in handover 07 (set the Findable secret → deploy → signed QA → then switch Move37 → Findable) would make the new webhook
refuse every reply and receipt from the moment it is deployed until the switch, because they are still signed by Move37.
Meta retries for a while, then drops them: inbound replies would be lost. So either the secret matches the app that
delivers TODAY, or the deploy happens at the same moment as the switch.

## Two ways

**A. Now, on Move37's app (recommended).** Set `WHATSAPP_APP_SECRET` to Move37's App Secret, the app that really sends
today's webhooks. Then deploy the fail-closed webhook plus error capture. This saves the codes from that day on and closes
the fail-open hole. It changes no number, template or token. When the Findable app is ready later, the secret is swapped
in the same step as the webhook move (B).
  (Handover 07 says "do not copy Move37's". That warned against using Move37's secret as a stand-in for Findable's. For
  the app that delivers today it is the correct secret. Paul decides.)

**B. Wait for the full Findable switch.** Nothing saves codes until the Findable Meta app, number, templates and token are
ready, and the deploy happens on the day of the switch.

## The code work (Claude, either way, one branch, full gate)

1. `whatsapp-status`, on `failed`: write Meta's `errors[0].code / title / error_data.details` (masked, through the
   existing `sendErrorMeaning.ts` helpers) to `whatsapp_sends.error_code / error_title / error_details`, the matching
   `whatsapp_messages` row, and the lead's `whatsapp_error_code / whatsapp_error_title / whatsapp_error_at`. Columns exist
   (migration `20261029090000`); no migration needed.
2. Changeover support for B: the gate also accepts a second secret, `WHATSAPP_APP_SECRET_NEXT`, while both apps may post.
   Removed after the switch.
3. Tests: a signed failure saves its code; an unsigned POST gets 401; a wrong signature gets 401; the inbound QA
   simulation still works; the auto-off rule now sees 131026 directly.
4. Rollback ready BEFORE deploying: version 129's own source, taken from its live bundle, kept as a deployable folder
   outside `main`. Rolling back = deploying that folder. Diffed and dry-built first.

## Built 2026-10-22 (`fix/webhook-error-capture`, Paul chose A)

- Code work 1–3 done: the webhook stores `errors[0]` on the send, the message and the lead; the gate takes
  `WHATSAPP_APP_SECRET_NEXT` as a second secret; `scripts/webhook-error-capture.test.ts`.
- Rollback copy: `C:/Users/paulj/LeadFinderOS-wt/whatsapp-status-v129-rollback` (outside the repo; `ROLLBACK.md` has the
  command; the original live bundle is kept beside it). All 28 modules recovered from the bundle's source maps, all compile.
- ⚠️ Found while building: **live v129 already checks Meta's signature whenever `WHATSAPP_APP_SECRET` is set** (it was
  fail-open only while the secret was empty). So saving the secret changes live behaviour at once, before any deploy.
  That makes it the safest first test: a right secret changes nothing visible; a wrong one stops receipts and replies
  until the secret is deleted. It also means a rollback to v129 does not rescue a wrong secret — delete the secret too.

## The cutover day (A), in order

1. Paul sets `WHATSAPP_APP_SECRET` himself (Move37 app → App settings → Basic → App secret; Supabase → Edge Functions →
   Secrets). Claude confirms the NAME exists (never the value).
2. **On v129, before any deploy:** real receipts must keep arriving (`whatsapp_sends` rows going `delivered` / `read`
   after the moment the secret was saved). If they stop, the secret is wrong → Paul deletes it; nothing else to undo.
3. Claude deploys `whatsapp-status` from `main` (nothing else).
4. Claude: an unsigned POST must answer 401, and the GET handshake still works with the existing verify token. Real
   receipts keep arriving. If they stop, roll back (the folder above) and tell Paul.
5. Paul sends one WhatsApp from his own phone to the business number → it must appear in the Inbox.
6. A failure with a code (Paul approved this one send, 22 Oct): one template send to the reserved test number 07700 900 0xx (not a real person; it is not on
   WhatsApp, so Meta answers 131026) → the row must show `error_code` 131026 and text. Costs one message; only with Paul's OK.
7. Record in `docs/`, What's New entry for admins, update handover 07.

## What the full Findable switch (B, later) needs from Paul

Findable Meta Business verified; a WhatsApp Business number on the Findable WABA (display name approved); a permanent
system-user access token; the phone number id and WABA id; the Findable App Secret; every template re-submitted and
approved under the SAME names; the webhook URL set in the Findable app, subscribed to `messages`. Also: the new number
starts with a fresh quality rating and messaging limit, and prospects who replied to the Move37 number keep replying there.
