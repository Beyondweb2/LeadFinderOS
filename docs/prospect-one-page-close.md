# The prospect popup is one page (Paul, 2026-11-04)

Branch `feat/prospect-one-page-close`. Facts, script, questions, then close and send the link at the bottom. Tabs are Call and History (Client for the admin once paid). The Quick Close button and the Close tab are gone.

## The page, in order

`src/components/SimpleCallTab.tsx`: What we found, Script, **Questions**, What we offer, Objections, **Close**, sticky Log this call. The call button sits above it (`CallPanel`).

## Questions (`src/components/ProspectQuestions.tsx`)

Everything saves itself. Nothing got a second home:

| Question on screen | Stored in |
|---|---|
| What jobs do you want to get more of? | `quick_close.call.jobs` (`save_call`, which also fills the lead's `services_included` when blank) |
| What areas do you want people to find you in? | `quick_close.call.areas` (`service_areas` likewise) |
| Who makes the decision on this? | `answers.decision_maker`; the name if someone else: `quick_close.call.decision_who` (new) |
| Do you look after the website yourself…? | `answers.manager` (Myself = `owner`, Agency or someone else = `agency`, No website yet = `no_website`, offered only when no site is on file) |
| Are you tied into a contract with them? | `answers.agency_contract`; Until when: `quick_close.call.contract_until` (new, optional, free text, never a date we rely on) |
| Do you own your domain name? | `answers.domain` (`yes` / `no` / `not_sure`) |
| What is their trade? (only if blank) | the lead, as before |

`paidClientRecord.ts` reads `callNotesLines`, so all of it shows on New paid clients. The domain answer and the two new notes were added to `callNotesLines` for this.

Services and areas the lead already holds are shown as the answer, and are copied onto the call notes only when a link is made (`callNotesToCarry`): opening a lead writes nothing, and fn quick-close still requires the notes on the record.

**A choice Paul approved with the merge:** the contract question also offers **Not sure** (he asked for Yes / No). Without it a rep with an unsure customer must say No, which skips his review of clause 1.6, or Yes, which declines the sale. "Not sure" keeps his existing review. Tied in stays a decline.

The domain never stops a link. It is the same note for Paul it always was (`domain_handoff`).

## Close (`src/components/ClosePanel.tsx`, `QuickClosePanel` in `QuickCloseDialog.tsx`)

- Pick the plan: Complete monthly, Complete up front, Essential's three. Saved at once, as before.
- Terms and guarantee, then **WhatsApp / Text / Email**. A button only asks; one confirm ("Send Complete monthly link to 07700 900123 by WhatsApp?"); then `generate_link` if there is no usable link, then `share_link`. The server decides everything as it always did, and refuses on its own.
- `closeStillNeeded` (`src/lib/prospectClose.ts`) says what is unanswered before the buttons switch on.
- Email box: pre-filled from `share.email` (the lead's email, which the crawl's `extract-email` writes), otherwise typed; saved to the lead through `save_email`.
- Kept: Copy link, What to tell them, the old staff plan, Mark paid (admin), paid and client-info panels, every stop (decision maker, tied in, Paul's review, plan not on sale, Australia).
- **Send full setup** stays, folded under the section ("Or let them fill it in themselves").
- `QuickCloseDialog` is only this panel in a frame, for the Sales dashboard's "Paul asked for details".

### WhatsApp route

`decideLinkRoute` gained `freeTextInWindow`. fn quick-close passes it: inside the 24 hours (we messaged, they replied) the link goes as a normal message even with an approved template; outside, the approved `findable_signup_link`; otherwise nothing, and the screen says why and offers Text / Email. paid-client-hub's onboarding link does not pass it and keeps its old order.

## The call (`src/components/LiveCall.tsx`)

The hook lived inside the popup body, so anything that remounted or closed the popup (Previous / Next, closing it, a parent reload) destroyed the Twilio device and hung up on the prospect. It now lives in `LiveCallProvider`, above every route in `App.tsx`.

- Fixed red **End call** on the right edge with the timer, portalled to `document.body`, `z-[200]`.
- A modal dialog switches pointer events off on the body and treats a press outside as "close": hence `pointer-events-auto`, and `data-keep-dialog-open`, honoured by `ui/dialog.tsx` and `ui/sheet.tsx` (`keepsDialogOpen`).
- The popup reads `useLiveCallActions` only. The timer ticks every second, and it used to redraw the whole popup each time.
- Call ended with the popup closed: a small corner card links back to the lead to log it.

## Loading

`quick-close` is a heavy read. It loads when the questions come on screen, not on every popup stepped past (`useSeen`). The questions and Close still show if the script fails to load.

## Deployed 2026-11-04

Merge `b8d7c910`. Edge first, then the app.

26 functions redeployed (the reach of `quickClose.ts` and `paymentLinkRoute.ts`): quick-close, send-whatsapp-message, admin-overview, ai-reply-drafts, business-summary, client-agreement, client-intake, client-onboarding, create-ai-audit, findable-checkout, findable-onboarding, inbox-scheduled-send, mockup, paid-client-hub, process-ai-audit-queue, process-sms-queue, process-whatsapp-queue, sales-earnings, sales-performance, send-whatsapp-media, send-whatsapp-voice, stripe-webhook, submissions, twilio-sms-send, warm-lead-reply, whatsapp-number-health. `whatsapp-status` skipped as the rule says (last updated 2026-09-30).

Proved live: OPTIONS on send-whatsapp-message returns `x-swm-build: 2026-11-04a-one-page-close`; the quick-close body holds `freeTextInWindow` and `contract_until`; app.leadfinderos.com serves `index-ZeKV0dXV.js` with `data-keep-dialog-open`, the `statusFilter` chunk with the first question, and the `whatsNew` chunk with the entry. Main bundle 1,605,337 bytes against 1,612,384 before.

Full gate before merge: 493 of 496. Two red suites were old popup checks, updated and passing. `exhaustive-crawl` was red only under the gate's load and passed alone twice. The whole gate was not re-run after the test-only fixes.

## How it was checked

A throwaway Vite harness rendered the real popup with made-up data and mocked edge calls, driven with real mouse clicks in headless Edge. No real calls or messages. Nobody has seen it signed in on the live app, and no real Twilio call or real send has been made through it.
