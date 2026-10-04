# Fix workstream 2 — Quick Close and the payment link

- **Date:** Sunday 4 October 2026. **Branch:** `fix/02-quick-close-links`, off `origin/main` `c0e85078`.
- **Not merged. Not deployed.** No SQL was applied, no Stripe action taken, no message or email sent.
- **Findings closed (master plan IDs):** M-001 (P0), M-011, M-012, M-013, M-014 (with B-16), M-015 (launch
  minimum), M-022, M-008's `my_handoffs` half, and from M-044/M-045: B-14 (stale dialog after payment) and
  part of B-30 (the counter's route chip, the "two working days" timeframe).
- **Inputs read:** `cert/master-launch-plan` (WS-2 section), `cert/a-salesperson` (A-01, A-07–A-10, A-29),
  `cert/b-close-payment` (B-01–B-04, B-09, B-10, B-14, B-16, B-21–B-23, B-30, B-31).

---

## 1. Build Quick Close (M-001, P0) — fixed

**Root cause, confirmed in the code.** The dialog saves one answer per call. `fn quick-close` ran
`cleanAnswers(body.answers)` on that single answer *before* merging it with the saved ones. `cleanAnswers`
removes `build_consents` from any set that does not also say `route: 'build'` — and a lone
`{ build_consents: 'yes' }` never does. So "Yes — they confirm all three" was thrown away on every save,
the audit trail recorded `changed: {}`, and the screen fell back from 5/5 to 4/5.

**Fix.**
- `src/lib/quickClose.ts` now has `pickAnswers` (per-answer validation only) and `mergeAnswers` (lay the
  incoming answers over the saved set, *then* run the cross-answer rules on the complete result).
- The whole save decision is one pure function, `planQuickCloseSave`, which `fn quick-close` runs. If an
  answer the rep sent still does not survive (e.g. Build consents on Optimise, Optimise with no website),
  the save is **refused with a sentence** (`answer_not_kept`) — the silent loss that hid this bug for a week
  cannot recur.
- **Durable and race-safe:** every write to `onboarding_responses.quick_close` is now conditional on a
  `rev` counter stored inside it (`writeQc`). A double tap, two tabs, or a save racing a link generation
  can never overwrite each other: the loser re-reads and re-applies (up to four times), or is told "busy".
  Checked live (read-only) that the database API accepts the `quick_close->>rev` filter on updates.

**Proven by** `scripts/quick-close-links.test.ts`: Build saved one answer per call, as the dialog does —
4/5 → 5/5 → *Ready for payment*; refresh stays 5/5; a double final tap is harmless; two taps that read
the same version both land correctly; the link becomes available. A mutation check (putting the old
"clean the lone answer" line back) makes that test fail on exactly those three lines.

## 2. Optimise — unchanged behaviour, still reaches ready

Optimise answered one per call → 5/5, ready, sold as Optimise (`plan_tier = keep`). Sending Build consents
on an Optimise close is refused out loud.

## 3. Stale and superseded links (M-014, B-16) — fixed

- **The server decides whether a link is usable** (`linkUsable`): younger than `LINK_REUSE_MS` *and* at
  least `LINK_MIN_LEFT_MS` before Stripe closes it. Anything else is a new state, **`link_expired`**
  ("Payment link expired"), never "Payment link ready". Positive match: no link, no time, an unreadable
  time are all "not usable".
- **The expired URL never reaches the screen** (the load returns `url: null`), so it cannot be copied or
  sent. The screen shows when the old link was made and one button: **Create fresh payment link**.
- **One current link, always:**
  - a usable link is reused (double click → one Checkout Session);
  - a second press while the first is being made waits for that link (claim by version-checked write);
  - if two sessions ever come back (a claim taken over after `LINK_CLAIM_MS`), the first stored is THE link
    and the other is **expired at Stripe** (`POST /v1/checkout/sessions/:id/expire`);
  - if an answer changes while Stripe is making a session, that session is expired and nothing is stored;
  - a fresh link **expires the one it replaces**; changing an answer (including the route) clears the link
    **and expires its session**, so a Build session can no longer be paid on an Optimise row (B-16).
  - The session id is kept on the row (`link_session_id`); for older rows it is read out of the URL.
- The rep sees how long they may still **send** the link ("send it within about 18 hours"), not Stripe's
  own 24 hours.
- The sales dashboard shows an expired link as "Payment link expired — make a fresh one", not as "sent,
  not paid" (`salesWorkspace.ts`).

**Not changed (Session 3's):** the webhook's handling of a payment on a session we expired a moment too
late. If a client pays an old session in the seconds before it is expired, the webhook's existing
route check (`resolvePaidRoute`) still applies.

## 4. Sharing the link (M-015) — copy, email, WhatsApp, each recorded

New mode `share_link` on `fn quick-close`, channel `copy` / `email` / `whatsapp`. Every share needs a
**usable** link (an expired one is refused).

| Channel | What happens | Recorded as |
|---|---|---|
| **Copy** (link or full message) | The browser copies; the server records it. A second copy by the same person within two minutes is the same act. | "Payment link copied (to send by hand — not confirmed as sent)" |
| **Email the link** | To the onboarding contact email, else the lead's email. Do-not-contact list checked (fails closed), QA guard (a test lead's email goes only to the QA sink; fails closed), sent through Resend from `alerts@findable.live`, replies to `paul@findable.live`, signed with the rep's name. A Resend failure is written to `client_error_reports` and the rep is told. | "Payment link emailed to x@y" |
| **Send on WhatsApp** | Only when the 24-hour window is open (checked on the server too). Sent through `send-whatsapp-message` **as the rep** (their own login is forwarded), so its window, QA, opt-out, wrong-number and ownership rules apply unchanged. | Only when that sender says ok: "Payment link sent on WhatsApp", or "(test mode — not delivered)" for a simulation. A refusal is recorded as `link_share_failed`, never as sent. |

Each share writes: the row (`link_shared`, newest 20), `quick_close_events` (`link_shared`), and the
lead's **History** (`lead_activity` kind `payment_link_shared`, label "Payment link"). The dialog shows
which ways are available and why not ("No email address on file — add one under Correct a detail";
"WhatsApp is closed … email the link instead"), and lists what was shared, when.

**Not built (master plan "later"):** a Meta-approved payment-link WhatsApp template for a closed window.
It touches the eleven-place template registry and needs Meta approval.

⚠️ **QA note:** M-051 records that the QA email sink `paul@move37.fun` is currently on the do-not-contact
list. While it is, "Email the link" on a QA fixture is refused by the suppression check ("They are on the
do-not-contact list"). That is WS-1's fix; until then the email path can be QA'd on a fixture with a
different internal address only after Paul clears the sink.

## 5. Commercial wording before payment (M-011, M-012, A-07, A-29)

Every version — the rep's card, the spoken words, the WhatsApp/copied message and the email — now says,
**before the link is sent**:

- **Build:** £99 today; then £99 a month, starting six weeks after sign-up; **12 payments in total, a
  12-month minimum term**; Findable builds, hosts and manages a new website, which becomes theirs once all
  12 payments are made.
- **Optimise:** £99 today; then £99 a month from six weeks; **6 payments in total, a 6-month minimum
  term**; they keep their existing website — it stays theirs.
- **The guarantee:** "We improve AI visibility or you get your money back." followed by
  `FINDABLE_GUARANTEE` **verbatim** (measured before, re-measured at four weeks on the same questions and
  engines, £99 back if the number has not gone up, claimed within 14 days of the results). No ranking,
  recommendation or citation is promised, and no hedge sits beside it.
- **The agreement tick:** "On the payment page they tick to accept the client agreement before they pay."
- **After payment:** full baseline first; Paul in touch within two working days (the same timeframe the
  client's paid page states).

Other wording changes:
- "What to tell them" appears only once the route is chosen and no longer opens with "That's everything I
  need from you" (A-07).
- One timing phrase, "six weeks after sign-up", as `offerSummaryFor` uses; no nested brackets; the message
  greets the contact's first name, never the business's legal name (A-29).
- **No domain (M-012):** the first Build consent now reads "They will register a domain in the business's
  own name (Findable can help), and have the authority to make the changes the new website needs." The
  confirmed consent stores which wording was read (`build_consents_confirmed.wording` / `.lines`).
  Changing between "No domain" and an existing domain asks for the consents again.
- `findableOffer.ts` and findable-site are **not** changed — no cross-repo mirror is affected. The Stripe
  line item's own "from week six" text is untouched.
- `QuickCloseDialog.tsx` is now in the operator-screen scan and `quickClose.ts` in the client-renderer scan
  of `client-copy-claims.test.ts`.

## 6. The false "questionnaire submitted, not paid" alert (M-022, B-09) — fixed

- `notify-onboarding-submit` no longer picks Quick Close rows at all. The exclusion is in the query
  (`or(source.is.null, source.neq.quick_close)` nested inside the existing filter), so these rows cannot
  fill a batch and starve real ones, and the 9 older self-service rows with a blank `source` are kept.
  Checked live, read-only: the new filter returns 11 rows where the old returned 18 — exactly the 7
  Quick Close rows removed.
- Paul's "Chase the sign-up" task (`adminMetrics.ts`) counts a Quick Close **only once a payment link was
  made**, timed from `link_generated_at`, and words it "Quick Close payment link made N days ago and not
  paid". A Quick Close that was only started never appears. Self-service sign-ups are unchanged.

⚠️ The master plan assigns M-022 to WS-3; Paul's brief for this workstream asked for it. The change in
`notify-onboarding-submit` is one filter line. If WS-3 also changes that query, keep the nested form.

## 7. Route integrity

- A **route change must be confirmed**: the screen asks ("Switch to Findable Optimise? That is 6 payments
  in total instead of 12 …"), and the server refuses a change without `route_change: true`.
- A **stale screen is refused**: every save carries the route the screen showed (`expect_route`); if the
  saved route differs (another tab changed it), the save is refused and the screen re-reads itself.
- Build ⇄ Optimise **never mix**: switching off Build drops the consents, clears the consent columns and
  the consent evidence, clears the link and expires its session; switching back to Build asks for the
  consents again.
- **Downstream lock:** once the lead has `contract_total_payments` or *any* client-agreement acceptance,
  Quick Close refuses a route change ("ask Paul"). An unreadable acceptance record refuses too. After
  payment nothing in Quick Close can change (unchanged). The agreement's own route lock (M-021) is WS-3's.

## 8. UX on a live call (M-013, B-14)

- Once the route is chosen, the **route card with the terms and the link block is first**; the handoff is
  folded to one line ("not started — can wait until after the call") until payment.
- A route chip in the header ("Findable Build · 12 payments").
- Measured in a render harness at 375×812: **Generate at 619–673 px** (Session B measured 1,517 px);
  with a link, **Copy at 642–695 px and Email at 753–799 px**; no sideways scroll.
- The dialog re-reads itself on focus and every 30 s while a link is out, so a dialog left open across a
  payment stops offering Send (B-14); stale refusals ("already paid", "route changed", "busy") re-read.
- The paid view says Paul will be in touch within two working days.

## 9. Tests

- **New:** `scripts/quick-close-links.test.ts` — Build one-per-call to 5/5, refresh, double submit, racing
  duplicate; Optimise to ready; double generation → one session; two tabs → one claims, one waits; a
  taken-over claim with two sessions → one link, the other expired; stale link → expired state → fresh link
  replaces and expires the old; answers changed / paid during generation; route switch needs confirming;
  stale tab refused; route switch clears consents, columns, link (session expired); no-domain wording and
  re-ask; locked route (source); every word on both routes; sharing paths (source); History label;
  M-022 (notifier query + the admin task folded with fixtures); the function really calls the tested
  decisions.
- **Updated** (they pinned the old mechanism): `quick-close.test.ts`, `service-route-terms.test.ts`,
  `coverage-found-added.test.ts`, `client-copy-claims.test.ts` (two new scanned files).
- **`npm run check`:** typecheck identical to the 9-error baseline; edge syntax, undefined-name and
  import-graph checks OK; build OK; **296/296 suites passed**.
- **Deno is not installed**, so the edge functions were type-checked with a scratch strict `tsc` run
  (shimmed `Deno` and `esm.sh`): no errors in the changed edge files. The deploy remains the real check.
- **Migration** tested against the live database inside a block that always rolls back: both checks
  widened correctly, a second run is a no-op; live constraints read back unchanged afterwards.
- **Screens:** rendered in a throwaway harness with fixture data (deleted; nothing committed). Screenshots
  were taken in the Browser pane; **nobody has used the screen against the live function yet**.

## 10. Deploy order (when Paul approves — none of this was done)

1. **SQL:** `supabase/migrations/20261006020000_quick_close_link_sharing.sql` (additive; widens two
   checks from their live definition). Read back `quick_close_events_kind_check` and
   `lead_activity_kind_check`. Until it runs, the new events and History rows are refused by the checks and
   only logged — nothing breaks, nothing is recorded.
2. **Edge functions** (deploy from `main` only): `quick-close`, `notify-onboarding-submit`,
   `admin-overview`, `business-summary`, `sales-performance` (all behaviour changes), then the rest of the
   closure of the changed shared files — `findable-checkout`, `paid-client-hub`, `stripe-webhook`
   (reach `quickClose.ts`; no behaviour change for them) and `conversation-triage` (reaches `salesCrm.ts`;
   label only). WS-3 deploys `stripe-webhook` and `paid-client-hub` anyway.
3. **SPA** (push to `main`).
4. **Live check on a B-style fixture:** Build one answer at a time → Generate → `checkout_session_created`
   with `amount_total_minor = 9900`; Email the link to the QA sink (after M-051); age the link record past
   20 h → "Create fresh payment link" → the old session reads `expired` in Stripe; route switch → old
   session expired.

## 11. Expected conflicts with other workstreams

**Checked, not guessed (4 Oct, after the push):** `git merge-tree` of this branch against
`fix/01-security-inbound`, `fix/03-payment-client-state` and `fix/05-call-workspace` as they stood on
`origin` — **no textual conflicts with any of them.** Shared files: `scripts/service-route-terms.test.ts`
with fix/03 (different assertions), `src/lib/salesCrm.ts` and `src/lib/salesWorkspace.ts` with fix/05
(fix/05 reworks the workspace fold; this branch adds one `link_expired` line beside its Quick Close
actions — re-read that block after both merge). None of the three touches either kind check.

| File | Likely touched by | Note |
|---|---|---|
| `supabase/functions/notify-onboarding-submit/index.ts` | WS-3 (M-022 is theirs in the plan) | One filter line. |
| `src/lib/adminMetrics.ts`, `_shared/admin-overview-load.ts` | WS-5 / admin work | `AdminOnboarding` gained `source`, `qc_link_at`; one task's rule. |
| `src/lib/salesWorkspace.ts`, `src/lib/salesCrm.ts` | WS-5 | One branch; one label + one `activityDetail` case. |
| `lead_activity_kind_check` | anyone adding a History kind | The migration widens from the live list, never re-types it. |
| `quick-close` `my_handoffs` | WS-5 (M-008 dashboard half) | Archived sales are now excluded here. |
| `supabase/tests/quick-close.sql` | — | Still calls the old `quick_close_claim_link` RPC; the function is unused by the code now but left in the database (not dropped). |

## 12. Not done here, and why

- B-21 ("Not sure" stored as "cannot give access"), B-22 (blank handoff answers not cleared), B-23
  (prefilled handoff answers counted as missing), A-10 (auto-answering what the CRM already knows) — M-044,
  after launch.
- B-31 (Outreach row and workspace do not show "Link sent · waiting for payment") — WS-5's surfaces.
- The sales dashboard still words a usable link as "Payment link sent — not paid yet" even when it was
  only made; it can now read `link_shared` to say "made" vs "sent" (needs a `sales-performance` change).
- A payment-link WhatsApp template for a closed window (needs Meta).
