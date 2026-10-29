# WhatsApp template: welcome_pack_ready (for Paul to submit at Meta)

Written 2026-10-29. Not submitted yet. The app reads Meta's live status of this template. Until it is
**approved at Meta and wired into the sender** (`WELCOME_PACK_TEMPLATE_WIRED` in `src/lib/welcomePackWhatsApp.ts`),
"Send welcome pack" to a client who has not messaged in the last 24 hours refuses with a clear sentence and
offers **Copy WhatsApp message**. A client who messaged within 24 hours gets the same words as a normal message.

## What to enter in WhatsApp Manager

| Field | Value |
|---|---|
| Name | `welcome_pack_ready` (the app's one setting is `WELCOME_PACK_TEMPLATE_NAME`; change it there if Meta needs another name) |
| Category | **Utility** (an update about a service the client has bought; no offer, no price, no promotion) |
| Language | English (UK) `en_GB`, or English `en`. Tell Claude which, the sender needs it |
| Header | None |
| Footer | None |
| Buttons | None |

### Body

```
Hi {{1}}, welcome to Findable! Your welcome pack for {{2}} is ready: {{3}}. One thing I need from you: please add paul@findable.live as a Manager of your Google Business Profile (the steps are on the first page of the pack). Any questions, just reply here. Paul
```

The text matches `WELCOME_PACK_TEMPLATE_BODY` in `src/lib/welcomePackWhatsApp.ts` and the free-text message the app
sends inside the 24 hours, word for word. If Meta asks for changes, update both together.

### Variables and sample values (Meta asks for samples)

| Variable | Means | Sample |
|---|---|---|
| `{{1}}` | Client's first name | `Sam` |
| `{{2}}` | Business name | `Leeds Boilers` |
| `{{3}}` | Their welcome pack link (`https://findable.live/w/<code>`) | `https://findable.live/w/abc123` |

## Why Utility, not Marketing

It is sent only to a paying client, only after they have paid and finished onboarding, and it delivers what
they bought (their pack) and asks for the access the service needs. It carries no offer, price or promotion.
Meta decides the category in the end. If it re-classes it as Marketing, tell Claude: the app treats it as a
continuation to a paying client either way, but an explicit opt-out still blocks it.

## After Meta approves it

The app does **not** start sending the template on its own. One change is still needed: register
`welcome_pack_ready` in the sender (`_shared/whatsapp-send.ts` WA_TEMPLATES + the queue mirror, the transcript body,
the picker label, `CONTINUATION_TEMPLATES`) with its three variables resolved server-side from the lead
(first name, business name, the `/w/` link), then set `WELCOME_PACK_TEMPLATE_WIRED = true`. That shared file is
reached by 17 edge functions, among them `stripe-webhook` and the held `whatsapp-status`, which is why it was
not done before approval.
