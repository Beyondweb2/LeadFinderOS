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

**Choices to check with Paul:** the contract question also offers **Not sure** (he asked for Yes / No). Without it a rep with an unsure customer must say No, which skips his review of clause 1.6, or Yes, which declines the sale. "Not sure" keeps his existing review. Tied in stays a decline.

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

## Deploying (not done yet: waiting for Paul's approval)

Edge first. `quick-close` changed, and `src/lib/quickClose.ts` / `paymentLinkRoute.ts` changed under it: walk `check-import-graph --reached-by` for both, redeploy all of them, name them in the report, and skip `whatsapp-status`.

## How it was checked

A throwaway Vite harness rendered the real popup with made-up data and mocked edge calls, driven with real mouse clicks in headless Edge. No real calls or messages. Nobody has seen it on the live app.
