# The salesperson journey audit (2026-11-10)

Branch `audit/salesperson-journey`. Two salespeople start this week. The whole path was read in code, then walked on the live
system as a temporary test salesperson on QA fixtures: account, first login, permissions, call, questions, plan, link, send,
agreement, Stripe session, payment, Paul's notifications, New paid clients, Paid Clients, commission.

## How it was walked

- **Account:** `ZZ QA Rep` (`97cf465a-fcdd-4025-ba4f-26f05800822f`) made through fn `admin-users` `team_create_user`, the Team page's own
  route, and excluded from metrics before it did anything. First login through the auth API: temporary password, must-change gate on,
  the same password refused (`same_password`), an 8-letter password accepted, gate cleared. Disabled at the end (`team_disable`).
  ⛔ A team member is disabled, never deleted: the test sales carry its id as seller.
- **Fixtures:** `2a100000-0000-4000-8000-0000000000a1` to `a5`, one per plan. Excluded first, archived and contact details cleared at the end.
- **Payment:** the documented QA simulation (unsigned `checkout.session.completed`, CRON_SECRET, fixture only, no Stripe customer), with
  the same metadata `findable-checkout` puts on a real session and the plan's own amount. `scripts/qa-simulate-payment.ts` still sends
  £99 and the v3 markers, so it holds a v7.1 sale; it needs updating before it is used again.
- **Never done:** a real call, a real message, a real charge. No real business was touched.

## What the live system does (verified)

| Plan | Agreement | Stripe session charged | Payments | Monthly after | Commission (`FIXED_COMMISSION`) |
|---|---|---|---|---|---|
| Complete monthly (`complete`) | v7.1 | £99.00 | 12 | 11 × £99, Price in `FINDABLE_NEW_SITE_PRICE_ID` | £25 on each of the first 6 payments |
| Complete up front (`complete_upfront`) | v7.1 | £999.00 | 1 | none | £300 once |
| Essential in full (`full`) | v7.1 | £499.00 | 1 | none | £150 once |
| Essential 6 months (`six`) | v7.1 | £99.00 | 6 | 5 × £99, same Price | £15 on each of the first 6 |
| Essential 12 months (`twelve`) | v7.1 | £99.00 | 12 | 11 × £49.99, Price in `FINDABLE_REDUCED_MONTHLY_PRICE_ID` | £15 on each of the first 6 |

- The charged amounts are Stripe's own answer for five real, unpaid Checkout Sessions (`client_error_reports` `checkout_session_created`).
  Every first payment is an inline amount from `PAYMENT_PLAN_SPEC`, so there is no Stripe Price to get wrong.
- The two MONTHLY Prices could not be read from here (the Stripe key is an edge secret). The webhook checks the amount before it creates a
  subscription and refuses a wrong one. `FINDABLE_STANDARD_MONTHLY_PRICE_ID` is not set, so the £99 monthly uses the fallback.
  New: fn `sales-earnings` mode `plan_prices` (admin, read only, `src/lib/planPriceCheck.ts`) reads both Prices and judges them.
- Two simulated payments (£999 and £99), the first delivered twice: one paid lead, one ledger row on `fixed_v1` with the plan, the seller
  = the test salesperson, `Client paid` and `Introduce yourself` bells to Paul, the email to paul@findable.live sent once, the replay kept
  quiet. New paid clients showed services, areas, who runs the site, the contract, who decides, the domain, plan and seller.
- Permissions as the salesperson: only their own five leads; no read of Paul's or a paid client's lead; a direct update returns `200 []`
  and changes nothing; `user_roles`, `admin_home_marks`, `payment_ledger`, `protection_settings` refused; `admin-users`, `paid-client-hub`,
  `admin-overview`, `mark_paid`, `assign_lead`, `admin_home_needs` refused; `claim_lead` on an owned lead answers `already_owned`.

## What was wrong, and what changed

**Calls**
- Twilio reports an expired access token on the Device while a call carries on. The token lasted 5 minutes and the hook destroyed the
  device on ANY Device error. Read from the SDK (2.18.5, `_onSignalingError`), never seen live: the longest real call on record is 12
  seconds. Now the token lasts an hour (`VOICE_TOKEN_CALL_TTL_S`), and only the Call's own `disconnect` ends a ringing or answered call
  (`deviceErrorEndsCall`, `callErrorEndsCall` in `src/lib/liveCallFlag.ts`).
- End call during "Getting ready" set the state but the dial went ahead; Call again on top left a second call no button could end.
  Each `start()` now has a run number and stops after whatever it was waiting on.
- The stale-bundle reload (2026-11-07) reloaded during a call, and the only error boundary sat above `LiveCallProvider`, so a page crash
  unmounted the call. Now nothing reloads by itself while a call is live or the browser is offline (`autoReloadBlocked`), and
  `PageErrorBoundary` sits inside the provider. On a call the screen offers Go back (`StaleChunkScreen`).

**Close**
- A plan changed after the client signed left their link saying "Your chosen service changed after you signed", with no way to pay or
  re-sign, and nobody told. Proved live on a fixture. fn `quick-close` now refuses the change with the reason (`signedPlanLock.ts`);
  going back to the signed plan is always allowed.
- Text refused the sign-up link on a first call (`sms_gate_closed`): the gate wanted the call logged, and Log this call comes after the
  close. Proved live. A browser call they ANSWERED now counts as the conversation (`call_logs.answered_at`, Twilio's own stamp).
  A simulated call, an unanswered call and a call from the rep's own phone still need the log.
- The link message, its email subject and the script said "Findable Build" for a Complete or Essential sale (`closeSaleName`).
- The Close section now says why Email is off, and that a corrected phone number is not where the link goes.

**Paul's side**
- The new-client email printed "£99 today, then £99/month (12 payments in total) · this one is payment 1" for every plan. It now prints
  the plan's own line (`newClientEmailWords.ts`). It is retried three times when the provider does not take it.
- New paid clients: the signed agreement (who, role, version, when, link to the signed copy), trade, town, what the client corrected at
  sign-up, the paid sign-up row instead of the newest, the signed name as the contact name, and a held seller is no longer "Self-service".
- Archive on New paid clients and Paid Clients, with Show archived and Restore (`paidClientArchive.ts`, `usePaidClientArchive.ts`).
  A mark in `admin_home_marks`, never `is_archived`, never a delete.
- Hide earnings was a screen rule only. `sales-earnings` (`summary`, `owed`) and `sales-performance` now send a hidden salesperson no
  money (`_shared/earnings-hidden.ts`). Unreadable = hidden.

**First login**
- A name typed at first login waits for approval and nothing told Paul. Chris's had waited since 7 November. Migration
  `20261210090000` adds a bell to the book owner each time a name starts waiting, and one for each name already waiting.
- One failed role read showed "No access, ask the admin" with only Sign out. The read is tried three times, and a server that never
  answered shows "We could not check your access" with Try again.

## Found, not changed

- **Commission:** the code pays the fixed pounds above (Paul, 2026-11-04). The brief for this audit described 30/40/50 by volume plus 20%
  of later payments to month 12. Nothing was changed. Paul to confirm which is right.
- `findable_signup_link` has never been sent for real on WhatsApp (6 simulated sends only), and Meta's template status cannot be read
  (`no_waba` since 7 October), so every rep sees "Couldn't read the WhatsApp signup template's status". Text has one real delivery.
- A salesperson cannot change a lead's phone number. A landline lead whose owner gives a mobile can only get the link by Email or Copy.
- "Or let them fill it in themselves" dead-ends once the rep has tapped any question and no plan is picked (`signup_pending`). Read in
  code, not walked.
- The auth provider's minimum password is 6; the app says 8. A 7-character password was accepted through the API.
- `paul@move37.fun`, the QA sink, has been on the do-not-contact list since 4 October, so a fixture carrying it cannot be called,
  texted or emailed. The Email channel was therefore not walked.
- Three leads named `ZZ QA fixed commission test` are unarchived, not in `metric_exclusions`, and carry £99 each.
- "Record a payout" (Sales dashboard) still writes `commission_payouts`, which new-rule lines ignore: it can make a paid line look unpaid.
- The Team chip and "Commission due" card count lines not yet payable; Commission owed does not.
- The seller gets no notice that their client paid except the commission one, which Hide earnings filters.
- The persistent End call button has no mute and no way back to the lead.

## Tests

`scripts/salesperson-journey-audit.test.ts`, plus additions to `twilio-comms.test.ts`, `stale-chunk.test.ts` and
`paid-client-automation.test.ts`. Screens checked in headless Edge at 1440 and 390 wide against fixture data, no sideways scroll.

## Decisions built on 2026-11-10 (second pass)

- Commission follows the signed contract: first payment 30 / 40 / 50 pounds by the seller's sale number in the month, then 20% of each later plan payment, 300 for Complete up front, 150 for Essential in full, nothing on hosting. Numbers live in `src/lib/commissionConfig.ts`; record in `docs/commission-owed.md`; tests `scripts/commission-contract-rules.test.ts`. No stored commission rows needed rewriting (lines are derived; no payouts were recorded).
- The three "ZZ QA fixed commission test" leads are in `metric_exclusions` and archived (ledger rows kept).
- Sign-in provider minimum password length is 8.
- A salesperson can add a mobile to a landline lead from the close screen: `lead_add_mobile` (migration `20261210100000`), original kept in `outreach_leads.phone_original`, logged in `lead_activity`. Rule words in `src/lib/leadAddMobile.ts`.
- What's New entries about money are hidden from a salesperson with Hide earnings on (`whatsNewFor(role, { hideMoney })`).
