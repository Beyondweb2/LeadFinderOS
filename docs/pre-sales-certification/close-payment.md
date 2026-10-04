# Close, Payment & Handoff Certification — Session B

- **Session / date:** B (Close / payment / admin handoff), Sunday 4 October 2026, 05:00–05:45 UTC (06:00–06:45 UK).
- **Stages owned:** J13–J20, J24, J26, J27.
- **Accounts:** Test salesperson (`sales-test@leadfinder.invalid`): browser + API session. Paul (admin, the data account): browser + API session, used to read admin screens and to act on B fixtures only. **All four sessions were signed out (scope=local). Both API tokens were then tried again and refused with 401.**
- **Fixtures (all excluded before use, reserved numbers, `paul@move37.fun` only):**

| Fixture | Lead id | Phone | What it tested |
|---|---|---|---|
| ZZ QA-B1 Build close | `1b000000-0000-4000-8000-0000000000b1` | 07700 900201 | Build, no website, full handoff before the link, paid, replayed, agreement signed, set up to READY FOR DELIVERY |
| ZZ QA-B2 Optimise close | `…00b2` | 07700 900202 | Optimise, own site, link generated on a phone-width screen, paid, handoff finished **after** payment |
| ZZ QA-B3 Missing info | `…00b3` | 07700 900203 | Optimise, no email, no contact name, no handoff, access "Not sure", paid |
| ZZ QA-B4 Abandoned link | `…00b4` | 07700 900204 | Never paid: route switched Build → Optimise after a link, reused link, link aged past 24 h |

- **Spend:** none. No Places searches, no audits, no Discovery, no baseline, no Apify, no OpenAI. Five unpaid live Stripe Checkout Sessions were created (free). Resend: about ten emails, all to Paul's own addresses (listed under **Email review**).
- **Worktree / branch:** `C:/Users/paulj/LeadFinderOS-wt/cert-b`, branch `cert/b-close-payment` off `origin/main` `c0e85078`. Only this report is committed. Two throwaway scripts were used and deleted before the commit.
- **How screens were read:** `get_page_text`, `read_page` and `javascript_tool` in the Browser pane. Screenshots timed out, so **nobody has looked at these screens.** API calls were made as the same users.

---

## Executive verdict

**NOT READY.**

The payment engine is sound. A simulated £99 runs the real webhook and lands one ledger row, the correct seller, one Paid Client, one History line, one admin alert, one PAID email and one agreement record. Sending the identical event again changed nothing that matters.

Three things stop it being ready today:

1. **A salesperson cannot close a Build sale.** The one route every no-website prospect needs is blocked (B-01, the same as A-01).
2. **After payment, nobody owns the next conversation with the client.** The client is told "we'll be in touch within two working days". The salesperson is told "your part is done". Paul's screen says WAITING FOR CLIENT, and nothing gives Paul a task to contact them (B-07).
3. **The Paid Client record is not trustworthy for a Build client.** It shows false blockers for a no-website client (B-05). Paul's normal "Fix in onboarding" step silently wipes the Build consents taken on the call (B-06).

Fix B-01, B-05, B-06 and B-07 and this becomes **READY WITH FIXES**. The other P1s are smaller, contained changes.

**The question:** *"If a salesperson closes a business today, will the system correctly take over and give Paul everything required to deliver Findable, without chasing the salesperson for context or repairing broken state?"*

- **Optimise: mostly yes.** The handoff reaches Paul complete, in the email and on the client page.
- **Build: no.** The close itself is blocked. If it is forced through, Paul gets a client wrongly flagged as missing website details. His first routine edit then breaks the domain consent.
- **For both routes,** nobody is prompted to make first contact with the client.

---

## Journey tested

1. Created B1–B4 by SQL, with the exclusion rows inserted first.
2. **As Test, desktop:** Outreach → B1 → Quick Close. Answered Yes → No domain → No website → Build. **"Yes — they confirm all three"** flipped from 5 of 5 back to 4 of 5 within 0.8 s (reproduced A-01). Proved it in the audit trail and the API (B-01).
3. Applied the same narrow workaround as Session A: one save carrying `{route:"build", build_consents:"yes"}`, as Test, through the real function. Then filled the handoff in the UI, generated the £99 link, inserted one inbound WhatsApp reply by SQL to open the 24-hour window, and pressed **Send on WhatsApp**. Result: simulated, toast "Sent (test mode)".
4. **As Test, phone width (375×812):** B2 → Quick Close → Optimise → generated the link.
5. **B3 by API:** one answer per call, exactly as the dialog sends them. Optimise worked one answer at a time. Then generated the link.
6. **B4 by API:** Build link → second click reused it → switched the route to Optimise → a new link was made. Later aged the link record to 26 h.
7. Left B1's Quick Close open in the browser (stale). **Simulated payment for B1.** Then pressed Send on WhatsApp in the stale dialog.
8. **Replayed the identical B1 event.** Diffed every table.
9. Salesperson view: Outreach, Sales dashboard, Inbox, the paid Quick Close view.
10. **As Paul:** Paid Clients list, the B1 and B2 client pages (desktop and phone), Admin dashboard, bell notifications. Reconstructed the PAID email from the same builders.
11. **Agreement on B1:** switched the route while unsigned, then switched it back. Typed an invalid email. Sent the link to the QA inbox. Submitted the agree page with errors, then signed it. Checked the route lock, the PDF from both places, and that signing again is refused.
12. Simulated payment for B2 and B3. B2's seller finished the handoff after payment.
13. **B1 setup as Paul:** "Fix in onboarding" (data loss found, B-06), re-answered the site questions, confirmed GBP. Then submitted for delivery as the seller, twice, reaching READY FOR DELIVERY. Then moved B1 to `in_delivery` and replayed the payment once more (B-16).
14. Opened the client's own post-payment page (`findable.live/onboarding/…?paid=1`) to see what a Quick Close payer sees.
15. Welcome Pack: not producible for a B fixture (it waits for a paid baseline, which only Session C may run). Read the **live public Welcome Pack of the most recent real baseline client** (read only, no writes), plus the template code for the route-specific parts.
16. Cleanup (bottom of this file).

---

## P0 — Launch blockers

### B-01 — A Build sale cannot reach a payment link through Quick Close (independently confirms A-01)

- **Issue:** the last Build question, the three consents, is thrown away by the server every time it is answered.
- **Reproduction:** on B1, answer Yes, then No domain, then No website, then Build, then tap **Yes — they confirm all three**.
- **Expected:** "5 of 5 answered", "Ready for payment", **Generate £99 payment link** appears.
- **Actual (measured):**
  - The screen read "5 of 5" at 0 ms and 400 ms, then "4 of 5 · QUESTION 5 OF 5" from 800 ms onwards, with no error shown.
  - `quick_close_events` recorded the tap as `answers_saved` with `changed: {}`.
  - The API save of `{build_consents:"yes"}` alone returned **200 ok**, but still `missing:["build_consents"]`.
  - `generate_link` then answered **409 "Finish the questions first."**
  - Cause: `supabase/functions/quick-close/index.ts:227` runs `cleanAnswers(body.answers)` on the single incoming answer. `src/lib/quickClose.ts:85` deletes `build_consents` from any object without `route:'build'`. Line 230 re-cleans the merge correctly, but the consent was already dropped at line 227.
- **Operational impact:**
  - Every no-website prospect (the hot Find Leads lead) and every "build me a new site" close stops on a screen that silently undoes the rep's tap.
  - The audit trail records a successful save, so nobody can see why.
  - The only way out today is the self-service sign-up link, which loses the Quick Close handoff.
- **Recommended fix:** clean the merge, not the fragment: `cleanAnswers({ ...prevRaw, ...body.answers })`. Add a test that saves all Build answers one per call, as the dialog does, and expects `ready`. (Same as A-01; dedupe in consolidation.)

**No other P0.** No real WhatsApp, payment or subscription happened. There was no duplicate client, revenue, commission, handoff, notification, agreement or client message. No permission leak was found on this path.

---

## P1 — Fix before rollout

| ID | Stage | Finding | Evidence | Failure scenario | Suggested fix (not applied) |
|---|---|---|---|---|---|
| **B-02** | J13 | The screen before the link never states the **guarantee**, the **minimum term** or that they must **tick the agreement** at checkout. The rep cannot accurately explain what is being bought without another document. (Extends A-07.) | Route card: "£99 today · Then £99/month from week six · 12 payments total". The script and the WhatsApp message say the same (`quickClose.ts:63-65, 236-253`). Checkout says "12-month minimum term … Nothing is charged after the 12th" (`findableOffer.ts:479-486`). Agreement 4.1: "This is not a cancel-any-time service." | A client thinks "£99 a month" is cancellable, meets the minimum-term clause at checkout, and either drops off or disputes it later. | One spoken line per route: "£99 today, then £99 a month from six weeks, 12 payments, a 12-month minimum. If AI doesn't name you more at four weeks, you get the £99 back." Add a line saying they will tick the agreement on the payment page. Same in the WhatsApp message. |
| **B-03** | J13–J14 | At the moment of close the **Generate button is buried under the open handoff form**. (Extends A-09, which measured the screen after the link.) | Desktop: Generate at **1,612 px** in a 546 px pane, under the expanded handoff. Phone (375×812): **1,517 px** in a 688 px pane. It only rose to 519 px once the handoff was complete and folded. | The customer waits on the phone while the rep scrolls past six questions to find the button. | Put the route card and the Generate / Copy / Send block first. Collapse the handoff to one line ("Handoff for Paul · 3 to answer") until the link has been sent. |
| **B-04** | J14 | **An expired link is shown as "PAYMENT LINK READY · Copy payment link", with no way to regenerate it.** | `QuickCloseDialog.tsx:284` renders Generate only when `!v.link`. The server can regenerate after `LINK_REUSE_MS`, but nothing in the UI asks it to. B4's link record was aged to 26 h: the dialog still showed "Payment link ready" and Copy, no age, no new-link button. Stripe sessions expire after 24 h. | The rep sends yesterday's link. The client opens a Stripe "expired" page. The rep's only escape is changing an answer to force a new link. | Show the link's age. After `LINK_REUSE_MS`, show **Make a fresh link** (calls `generate_link`) and hide Copy and Send. |
| **B-05** | J19, J24 | **False blockers for a no-website Build client.** Quick Close said "No website" and the handoff said "No website". The checklist still asks the client for "Website" and "Website access / control". | B1 after payment: `Website — Not known whether they have a website` and `Website access / control — Not known who controls the website`, both "Client", in Paid Clients, the client page, the PAID email and the seller's view. `handoffReadiness.ts:206-227` only accepts `website_route='new_site'` or `lead.website_control='no_website'`. Quick Close writes neither: it writes `website_platform='no_website'` (`quickClose.ts:158`). The client page header says "No website recorded · Findable is building their website" right above the blockers. | Paul chases a client for "website access" that does not exist. The client cannot reach READY TO SUBMIT until Paul re-enters what Quick Close already knew. | Treat `website_platform='no_website'`, Quick Close `manager='no_website'` or handoff `site_situation='no_website'` as a positive "no site". Or have Quick Close write `website_route='new_site'` for Build with no site. |
| **B-06** | J19, J27 | **Paul's routine "Fix in onboarding" silently wipes the Build consents taken on the call.** Domain then flips from DOMAIN READY to DOMAIN / AGENCY ISSUE. | On B1, replayed `ManualOnboardingDialog` exactly (`answersFromRecords` → added services, areas and town → `save_onboarding`). `answerProblems` reported none. After the save, `authority_confirmed`, `dns_permission` and `materials_confirmed` went from **true to null**, and the checklist said "DOMAIN / AGENCY ISSUE: Permission to connect the domain not given, Rights to supplied material not confirmed". Cause: Quick Close never sets the form's site-branch answers, so `buildOnboardingPatch` → `domainPatch` treats the client as "not a new site" and nulls the consents (`manualOnboarding.ts:296-305`). | The page's "Fix in onboarding" button is the first thing Paul presses on a new Build client, and it un-does the client's consent. Paul must notice and re-tick it, recording a client confirmation he did not hear himself. | Prefill the branch from `quick_close.answers` (`manager='no_website'` → self_site none; owner + Build → rebuild). Never null a consent the save did not show. Refuse the save, or warn, when it would clear a stored consent. |
| **B-07** | J16–J19 | **After payment nobody owns first contact with the client.** The two sides each think the other is moving. | Client, after paying (`findable.live/onboarding/…?paid=1`): "We'll be in touch within two working days to take these details." The details form needs a stored onboarding id, which a Quick Close payer never has. Client WhatsApp (simulated): "We'll get started and be back to you within a few days…". Seller: "Paid — your part is done. Paul takes it from here." Paul: Paid Clients says **WAITING FOR CLIENT**. Next step reads "Waiting for client: Services, Service areas, Website…" (B1) or "Crawl website" (B2). Admin "needs you" lists "Run Discovery" / "Crawl website", never "contact the client". The only prompt is a line in the PAID email: "Client's setup link (send it if they still owe details)". | Two working days pass with the client waiting for Paul and Paul's screen saying the client owes him. The guarantee clock and the sale's goodwill both suffer. | While the client has not been sent the setup link, make the state **WAITING FOR FINDABLE · "Introduce yourself and send the setup link"**, owned by Paul, due within two working days of payment. Give the client page a **Send setup link** button (email + WhatsApp) that stamps when it was sent. Show the same due date to the seller. |
| **B-08** | J26 | **The Welcome Pack is route-blind.** For an Optimise client its agreement page says Findable owns, and can take down, "the website". For a Build client it never says Findable is building them a website. | `welcomePackHtml.ts:456-463` prints for every client: "We own the website and our work until your final payment. Then it's yours." and "If a payment is 14 days late, we can take the site down until it's paid." The Optimise agreement says the opposite: 9.4 "We will never take your own website offline", Schedule 1 "Your site is always yours". "What you get" (`:562-569`) lists pages, GBP, directories and a before-and-after for everyone. "a new website" appears only in the domain paragraph's "If we are building you a new website…". | An Optimise client reads that Findable owns their site. A Build client cannot find their main purchase in their own pack. Both contradict the agreement they signed. | Per-route key points: for Optimise, "Your website is always yours; the pages we add pass to you on final payment; if payments stop we may remove what we added." For Build, add "A new website, built and hosted by us" to What you get. Read the route from `contract_total_payments` (already passed in). |
| **B-09** | J14, J17 | **Every Quick Close link not paid within 20 minutes of the first answer emails Paul a false "filled in the questionnaire … reached the payment screen and stopped".** It later becomes Paul's "Chase the sign-up" task. | `onboarding_responses.notify_sent_at` stamped for B4 at **05:33:01** (row created 05:12:47) and for A1 at **04:40:04**. Subject: "Questionnaire submitted, not paid — …". The body says the client filled the questionnaire and "Nothing has been sent to them automatically" (`notify-onboarding-submit/index.ts:515-527, 600-604`). After `SIGNUP_CHASE_DAYS` it lands in "Your actions" as "Filled the sign-up … and hasn't paid · Chase the sign-up in the Inbox" (`adminMetrics.ts:955-965`). The clock starts at the **first answer**, so a 25-minute call fires it before the link even exists. | Paul gets a stream of false "bailed checkout" alerts for prospects his salespeople are still working. He chases a rep's prospect over the rep's head, or learns to ignore the alert that matters for self-service sign-ups. | Skip `source='quick_close'` rows here. Show the rep "Link sent, not paid" (already on their dashboard). If Paul wants to see unpaid closes, list them per rep, named as Quick Close, timed from `link_generated_at`. |
| **B-10** | J14 | **When the WhatsApp window is closed (every phone close with a prospect who hasn't messaged in 24 h), the app cannot send the link at all.** | B1 before the simulated inbound: Send on WhatsApp disabled with "The WhatsApp window is closed — copy the link instead". There is no Send by email, SMS or template. The rep can only Copy. | The rep pastes the link from their **personal** phone or WhatsApp: a different number from Findable's, nothing logged in the thread, nothing in History. The Inbox and Paul never see the link was sent. | Add **Email the link** (client email is known, goes through the QA guard) and a Meta-approved payment-link template for a closed window. At minimum, log "Link copied at 10:42" to History. |
| **B-11** | J20 | **After a client has accepted Build at checkout, Paul can switch their agreement to Optimise.** The client is then asked to sign terms that contradict what Stripe charges. | B1 (paid Build, `contract_total_payments=12`, checkout acceptance `service_route=build`): `agreement_set_route` → `optimise` returned **200**. The public agree page then rendered with Optimise selected. Only an **agree-page** signature locks the route (`paid-client-hub/index.ts:560-570`). Reverted straight away; the lock after signing was proven (409). | A mis-tap on the client page's Build / Optimise toggle sends a Build client a 6-payment Optimise agreement to sign against a 12-payment card schedule. | Lock the route once `contract_total_payments` is stamped or any acceptance exists (checkout included). Only allow a change through an explicit "correct the route" admin action that also fixes Stripe. |

---

## P2 — Improvements

| ID | Stage | Finding | Evidence | Suggested fix |
|---|---|---|---|---|
| B-12 | J18, J24 | The client page contradicts itself about the route and the domain. | "**Website route not set**" sits beside "Findable Build · 12 payments" on B1 and B2 (Quick Close never writes `website_route`). Optimise B2 shows "4. Website Build · Build route: Not chosen yet". B1 (no domain) shows "**DOMAIN READY** · fresh build"; the note "No domain yet — the business registers one in its own name" exists only in the PAID email. | One route label from `contract_total_payments`. Hide "Website Build" for Optimise or rename it. Domain: "NO DOMAIN YET — client to register one in the business's name". |
| B-13 | J16 | The seller's dashboard says "Finish the handoff · **Ready to submit?**" while the client is WAITING FOR CLIENT, and there is nothing to submit. | `MyHandoffs.tsx:24-35` shows it whenever the handoff is complete and the sale is not yet submitted, ignoring readiness. B2 showed it at 6/11. The card opens a "Paid — your part is done" screen with no Submit button. | Show the setup state ("Waiting for the client") or hide the row until it is actually ready. |
| B-14 | J16 | A stale Quick Close after payment still offers **Send on WhatsApp**. The refusal is raw. | Pressed in the dialog left open across the payment: 403, toast "Not sent on WhatsApp · Edge Function returned a non-2xx status code". The refusal itself is correct: a rep cannot message a client. | Refetch on focus. Translate `forbidden` to "This business is now a client — Paul looks after them". |
| B-15 | J15 | A late re-delivery of the payment event **moves a client back to `payment_received`** and rewrites `payment_date`. | B1 set to `in_delivery`, same event delivered again → `status=payment_received`. Delivery submission kept. `stripe-webhook/index.ts:1210-1220` writes status, amount, date and `paid_for` unconditionally. | Only write those when the lead is not already paid (`amount_paid` null), or never move status backwards. |
| B-16 | J14 | Changing the route after sending a link **leaves the old Stripe session payable for 24 h**. | B4: Build session `cs_live_a16wKtF3…` still live after the switch to Optimise and a new session `cs_live_a1n5vx4r…`. If the old one is paid, the webhook refuses to build a schedule (good) but records a Build checkout agreement on an Optimise row. | Expire the superseded session (`POST /v1/checkout/sessions/{id}/expire`) when `link_invalidated_at` is set. |
| B-17 | J20 | Agreement link send with a mistyped address says "There is no email address on file for this client." | `to:"paul@move37"` → 409 `no_email` (`paid-client-hub/index.ts:579`). | "That email address doesn't look right." |
| B-18 | J17, J20 | Some emails leave no success trace, and one trace records the wrong subject. | Signed-agreement PDFs and "Ready for delivery" record nothing when sent (`_shared/client-agreement.ts:110-112`; `client-setup.ts:183-193` ignores the result of `sendOperatorAlert`). `payment_email_sent` stores subject "PAID £99.00 — …"; the real subject is "New Findable client: … (paid £99.00)". | Record `agreement_copy_email_sent` and `ready_for_delivery_email_sent/failed`. Store the real subject. |
| B-19 | J17 | The PAID email is about 45 lines and repeats itself. | It has Salesperson and Sold by, Payment and Amount, Onboarding twice, and three handoff blocks (setup, QUICK CLOSE, SALES HANDOFF). It ends with "Setup is promised within two working days" without saying the client was told that. Reconstructed from the same builders (`newClientEmail.ts`, `quickCloseHandoffLines`, `handoffSummaryLines`). | Order it: what was sold / who / £ → the one thing to do now (contact the client by \<date\>, setup link) → handoff (client wants, promised, why) → checklist. |
| B-20 | J17 | The bell alert "Client paid · ZZ QA-B1 Build close paid £99.00 (sign-up)." names neither the route nor the seller. Priority 2, the same as a WhatsApp reply. | `notifications` rows for B1–B3. | "New client: X · Build · sold by Test · contact them by Tue". |
| B-21 | J13, J19 | Quick Close "access: **Not sure**" is stored as "they run it but **cannot** give access". | B3: `website_manager='owner_only'` (`quickClose.ts:157`). Checklist detail: "they run it but cannot give access". | Map "Not sure" to unknown, not to "No". |
| B-22 | J13 | Handoff edits: emptying a box and saving does not clear it. An unsaved draft is lost on close with no warning. | `SalesHandoffForm.tsx:34` sends `cleanHandoff(draft)`, which drops blanks, and the server keeps keys not sent (`quick-close/index.ts:186-190`). The dialog unmounts on close (`QuickCloseButton`). | Send blanks explicitly. Warn on close with unsaved changes. |
| B-23 | J13, J19 | Handoff answers that Quick Close already knows still count as "missing" until saved again. | B3 and B2: "6 answers to give" with three already filled (work type = route, site situation = manager, decision maker = contact name). | See the question audit: auto-fill these and count only the three genuine questions. |
| B-24 | J19 | The 11-item checklist double-counts, and GBP access gates "ready". | "Client onboarding: services and main town still to come" repeats "Services". GBP access is required for READY TO SUBMIT, and `deliveryStage` keeps the next step on setup until then, though Discovery and the baseline do not need GBP. | Fold "Client onboarding" into Services / Town. Make GBP access required for the build stage, not for starting Discovery. |
| B-25 | J26 | Welcome Pack details that read wrong. | "Any questions at all, just reply to the email this came with" (×2), but the pack is never emailed: Paul copies a link (`ClientHub.tsx:424-438`). A client who accepted at checkout is still shown "**Review and agree** to your agreement" (the pack only reads agree-page signatures, `welcome-pack-render.ts:180-183`). The baseline report section prints an SEO letter grade ("Your site's overall SEO grade is A"), and CLAUDE.md says "Never claim an SEO score". | Say "just reply to us on WhatsApp or email paul@findable.live". Show "Accepted at checkout on …, please add your business details here". Paul to rule on the SEO grade. |
| B-26 | J17 | The payment confirmation WhatsApp is route-blind. | `payment_recieved`: "We'll get started and be back to you within a few days to get your Google profile sorted and share your page plan." A Build client is not told about their site, and Paul is not named. | Needs a new Meta template, so it is a template-registry change: name Paul and the two-working-day promise. |
| B-27 | J16 | Commission copy says "20% of the next 6 monthly payments". An Optimise client has only 5. | Sales dashboard text. `COMMISSION_RECURRING_COUNT = 6` (`commission.ts:50`), Optimise recurring = 5. | "…of up to 6 monthly payments (5 on Optimise)". |
| B-28 | J18 | Live QA fixtures count in the Admin "**New clients this month**" (showed 3) while the dashboard footer says 47 test leads are excluded. | `teamControl.tsx:29` counts the Paid Clients list, which shows a fixture until it is archived (README §2.3). After archiving: 0 B fixtures in the list and 0 mentions in `admin-overview`. | Filter `metric_exclusions` in that KPI. |
| B-29 | J18 | "Who sold it · the conversation" says "SALES NOTES AND CONTACT — Nothing recorded by Sales." even when the handoff has notes and there is a WhatsApp exchange. | B1 client page. Two separate "notes" places (lead notes vs `notes_for_paul`). | Show the handoff note and the last three messages there. |
| B-30 | J13 | Small Quick Close wording. | The counter jumps ("0 of 6" → "3 of 4" → "4 of 5"). Route buttons are in the client's voice ("Build me a new Findable website") although the rep is asking. The paid view's "Paul introduces himself" gives no timeframe; the client was told two working days. | Count only questions that will be asked. "New website (Findable Build)" / "Keep their site (Findable Optimise)". "Paul will be in touch within two working days". |
| B-31 | J14 | The pending-payment state is visible only on the rep's dashboard. | After the link was generated and sent: the Outreach row still "New", the workspace shows "SIGN-UP LINK · Not sent yet" and "Last contact: none yet", no Next Action, and the "Sign-up link sent" tile shows 0. The dashboard does say "Payment link sent — not paid yet · Link made 4 Oct". | Mark the row "Link sent · waiting for payment". Offer a one-tap Next Action "Check they've paid · tomorrow". |

Already reported by Session A and **confirmed again here, not re-counted:** A-07 (no guarantee in Quick Close), A-08 (consent text contradicts "No domain"), A-09 (link under the handoff after reopening), A-10 (known facts asked again), A-29 ("week six" wording, full legal name in the greeting), A-11 (simulated sends do not count in message-derived state). The vault secret *names* that contain raw keys (A-31) were seen again; not repeated here.

---

## Quick Close review

- **Where it is:** the outline **Quick Close** button in the lead workspace header (Outreach row → workspace; also Inbox). It sits beside WhatsApp, away from the call script.
- **Obvious during a live call?** You can find it, but it is quiet. On a phone it is the second button in the header and opens full screen.
- **Clicks (Optimise, nothing pre-known):** open lead (1), Quick Close (2), five answers (7), Generate (8), Copy or Send (9). Fine.
- **Clicks (Build):** blocked at step 7 (B-01).
- **Feels like:**
  - **Optimise: a close.** One tap per question, saved as you go, resumes after closing.
  - **Build: paperwork, then a dead end.** Three domain and website questions the app could answer (A-10), a consent that contradicts the domain answer (A-08), then the save bug (B-01).
- **Prefill:** "What we already know" shows business, trade, town, phone, email, website and contact, but none of it answers a question. A no-website lead is still asked about its domain, its website manager and its route.
- **Re-entry:** contact corrections are typed into a separate "Correct a detail" form and land on the onboarding row, not the lead. The onboarding row's `contact_email` stays empty until the Stripe payer email fills it.
- **Desktop and phone:** no horizontal scroll at 375 px. The ready-state Generate button is 2–3 screens down on both (B-03).

### Quick Close question audit

Two tests applied to each item: does the salesperson already know this (from CRM, the call or an audit)? Does Paul genuinely need it to deliver?

| QUESTION / FIELD | VERDICT | WHY |
|---|---|---|
| Are you authorised to make this decision for the business? | **KEEP** (reword: "Are you the owner, or allowed to sign up for the business?") | Agreement 1.4 needs authority. A "No" correctly stops the link. Not known beforehand. |
| Do you own or control the domain name? | **AUTO-FILL** "No domain" when the lead has no website. **REMOVE for Optimise** (the domain check is "Not needed — we work on their own site"). **KEEP** for Build with a site. | Paul needs it only to plan DNS on a Build. On Optimise nothing downstream reads it. |
| Who currently manages or controls the website? | **AUTO-FILL** (no website → "No website"; Work-tab `website_control`; agency check), shown and editable | The CRM usually knows. Paul needs it for access. |
| Could you give Findable access to the current website if needed? | **KEEP for Optimise; MOVE TO AFTER PAYMENT for Build.** Fix "Not sure" → "cannot" (B-21) | Decides whether Optimise is deliverable. A Build does not need the old site. |
| (agency only) Do you have the authority to replace, move or materially change the website? | **KEEP (agency only), REWORD** shorter: "Can you tell the agency to hand over or change the site?" | A genuine blocker Paul relies on. Already hidden unless agency. |
| Website route | **KEEP, ASK FIRST; AUTO-SELECT Build when no website** | It decides the money (12 vs 6). Asking it first lets the other questions be skipped. |
| For the new website, can they confirm all three? | **KEEP, REWORD per domain answer (A-08), FIX the save (B-01)** | Paul relies on DNS and content permission. It must survive Paul's own onboarding edit (B-06). |
| What is their trade? (only when blank) | **KEEP** (already auto-hidden when known) | The checkout refuses without it, and the baseline measures it. |
| Correct a detail (name, email, phone, website) | **KEEP** | Real corrections on the call. Prefill the onboarding row from the lead so the agreement and emails have an address before payment. |
| "What to tell them" script | **REWORD**, show only after the route is chosen | It starts "That's everything I need from you", omits the guarantee and the minimum term (B-02, A-07). |
| Handoff: What are we doing? | **AUTO-FILL** from the route (Optimise is fully determined). Ask only "new design / rebuild / keep the look" on a Build with a site | It duplicates the route. |
| Handoff: Current website situation | **REMOVE** (or auto-fill from the manager answer) | Duplicates "Who manages the website". |
| Handoff: What does the client want? | **KEEP** | The only place the client's own goal is captured. Paul used it (B1, B2). |
| Handoff: Anything specifically promised? | **KEEP**, add a hint ("e.g. dates, rankings, ownership") | It caught a real over-promise: B1 "the site is theirs to keep". Under the agreement, ownership passes only on the final payment. Nothing flags it to Paul (see Handoff review). |
| Handoff: Why did they buy / their main concern? | **REWORD → optional** ("Anything they're worried about?") | Useful for tone, but nothing reads it except the email and page. It should not block READY. |
| Handoff: Decision maker | **AUTO-FILL** from the lead contact (already suggested) | Known. Only "saved" status makes it "missing". |
| Handoff: Their role (optional) | **KEEP optional** | The agreement asks for the signer's role. Pass it to the agree page as a prefill. |
| Handoff: Anything Paul needs to know? (optional) | **KEEP** | Free text Paul read (logo, photos, preferred contact time). |

**Net:** after auto-fill, a rep on an Optimise close answers about **five taps and three short texts**. On a Build close with no website: about **three taps** (decision maker, consents, route already set) **and three texts**.

---

## Build vs Optimise

| | Build | Optimise | Verdict |
|---|---|---|---|
| Rep sees | "Build me a new Findable website · Findable Build · 12 payments total". Route card "£99 today / Then £99/month from week six / 12 payments total". | "Keep my existing website and optimise it · 6 payments total". Greyed out with "Not possible — they have no website" when none. | ✅ distinction is clear, and the terms are locked to the constants |
| Ownership words | "we build and manage a new website for you as part of the service". The rep is **not told** that ownership passes only on the final payment. | "we work on your existing website, which stays yours" | ⚠️ Build: the rep over-promised ("theirs to keep"). ✅ Optimise wording never implies Findable owns the site in Quick Close, the checkout line, the agreement or the PAID email ("ADD PAGES to their existing site"). ❌ Welcome Pack does (B-08). |
| Payment term | "12 payments total". Minimum term not said. | "6 payments total". Minimum term not said. | ⚠️ B-02 |
| First recurring | "from week six" | same | ✅ (A-29 wording) |
| What happens after | "Paul introduces himself… handles the website, domain and access" | same | ⚠️ no timeframe; nobody owns it (B-07) |
| Reversible before payment | Yes. Changing the route clears the consents and invalidates the link; a fresh session is made. | same | ✅ but the old session stays payable for 24 h (B-16) |
| Wrong route after payment | `contract_total_payments` is immutable (DB trigger `guard_contract_total_payments`) and Quick Close is read-only once paid. The agreement route can still be flipped (B-11). | same | ⚠️ no supported correction path. Paul would have to fix Stripe and the database by hand. |

---

## Payment-link UX

- **Generation:** one button, about 6–12 s (spinner shown). Stripe `amount_total` = **9900 (£99.00)** on all five sessions (`checkout_session_created`). Route and payment count are in the session metadata.
- **Copy:** big button, plus the link printed below (truncated to two lines).
- **WhatsApp send:** one tap, no confirmation. Message: "Hi ZZ QA-B1 Build close, here's your Findable Build sign-up link (£99 today, then £99 a month from week six (12 payments in total)): \<link\> Once it's paid we'll run your full baseline AI visibility measurement, and Paul will be in touch to take over the setup."
  - Natural enough, but: nested brackets, the full legal name in the greeting, and no guarantee or minimum term (A-29, B-02).
  - Feedback: a toast "Sent (test mode)" that disappears. The dialog keeps no "Sent at 06:08".
- **Inbox / history:** the message appeared in the thread as `simulated`, `test_mode`, no Meta id, plus the known mirror placeholder (README §5). Nothing in History records that a payment link was sent.
- **Window closed:** Send disabled, so Copy only (B-10). No email or SMS option.
- **Mistakes checked:**
  - **Wrong route:** clearly labelled. Switchable before payment.
  - **Duplicate sessions:** a second click on the same answers was reused (`link_reused`). A route change makes a new session and leaves the old one live (B-16).
  - **Old link:** shown as ready after expiry (B-04).
  - **Another client's link:** not possible from this screen (one lead per dialog, server-side lead tie).
  - **Losing the handoff:** a saved handoff survives. An unsaved draft is lost silently on close (B-22).
- **Could a rep say "I've just sent the payment link over" while still on the call?**
  - **Optimise, window open:** yes.
  - **Window closed:** only by pasting from their own phone (B-10).
  - **Build:** no (B-01).
- **While waiting:** the rep's dashboard shows "Payment link sent — not paid yet · Link made 4 Oct". Nothing else changes (B-31). No guidance on when to chase.

---

## Payment simulation result — **SUCCEEDED**

`scripts/qa-simulate-payment.ts` (coordinator-approved). Unsigned `checkout.session.completed` with the CRON_SECRET header, `livemode:false`, `evt_qa_`/`pi_qa_` ids, **no Stripe customer**. Same branch as a real payment.

B1 (Build), before → after the first delivery (05:15:37 UTC):

| Item | Before | After |
|---|---|---|
| Lead status | `not_contacted` | `payment_received` |
| `amount_paid` / `payment_date` / `paid_for` | null | 99 / 2026-10-04 / "Findable Build - AI visibility + new website (12 payments)" |
| `sold_by_user_id` / `sold_at` | null | Test / 05:15:33 (trigger) — **seller retained** |
| `contract_total_payments` | null | **12** |
| `payment_ledger` | 0 rows | **1** `initial` £99, `pi_qa_684ac312771c4348`, seller Test, `commission_rule test_excluded` 0% (by design for a fixture) |
| Onboarding row | `answers_saved` | `paid`, `baseline_status needs_questions`, `contact_email` filled from payer |
| History | `handoff_saved` | + **1** `payment_received` "Payment received · £99.00 · became a Paid Client" |
| Notifications | 1 (rep: WhatsApp reply) | + **1** `client_paid` to Paul |
| Quick Close events | 9 | + **1** `paid` |
| Agreement | 0 | **1** checkout acceptance (Build, v1, session `cs_qa_…`) |
| Client WhatsApp | — | **1** `payment_recieved` template, `simulated`, no Meta id (+ mirror placeholder) |
| PAID email | — | **1** "New Findable client: ZZ QA-B1 Build close (paid £99.00)" → paul@findable.live (trace `payment_email_sent`, Resend id `01a10556…`) |
| Lead left the rep's active work | in Outreach | gone from Outreach (count 4 → 3) and from the Inbox. Seller sees "Paid — your part is done" |
| Paid Clients | — | **exactly one** card |
| Stripe customer / subscription | — | none (expected: no customer in the simulation; "No live monthly schedule in Stripe" on the page is **expected here**) |

B2 (Optimise) and B3 gave the same shape: contract 6, one ledger row each, one acceptance each, one PAID email each (`01a10560…`, `01a10561…`).

**Commission rule (from code, not a payout):** `commission.ts` stamps the initial rate once (30% for sales 1–12 in the month, then 40% / 50%), plus 20% of up to six recurring payments. A real seller gets a "+£… commission earned" bell. Test's sale is `test_excluded`, so no commission notification and nothing under "Recent wins". **The rep's win display could not be certified with a test account.**

**Not exercised (by design):** Stripe's hosted page and consent UI, the delayed subscription, `invoice.*`, refund and dispute events, Stripe's signature and retries.

## Idempotency result — **IDEMPOTENT**

The identical event was delivered again (05:18:06). Full diff of every table: only `outreach_leads.updated_at` and `onboarding_responses.updated_at` moved, plus one `payment_email_skipped` trace.

Unchanged: 1 Paid Client, 1 ledger row, 0 extra commission, 1 History line, 1 Quick Close `paid`, 2 notifications, 1 acceptance, 0 extra WhatsApp, 0 extra email. B1 was also delivered a third time after reaching READY FOR DELIVERY: still no duplicates, but the status moved back (B-15).

**Stale UI and refresh:**
- A refresh after payment shows "Paid".
- The stale dialog's Send was refused (B-14).
- Seller "Submit for delivery" pressed twice gave one History line, already-submitted the second time.

---

## Salesperson post-payment state

| Check | Result |
|---|---|
| Disappears from Outreach | ✅ (after a reload; there is no live push) |
| Disappears from Inbox | ✅ "No conversations yet" |
| Can keep messaging as a prospect | ❌ refused (403) — correct. Raw message (B-14) |
| Campaign state | — B fixtures were not in a campaign |
| Follow-up / Next Action | none had been set. Nothing auto-cleared or needed |
| Sees they made the sale | ⚠️ the paid Quick Close shows it. The dashboard "Recent wins" and the sales count stay 0 for a test sale. Real-seller behaviour is code-read only |
| Commission | ⚠️ `test_excluded`. Rule verified in code. Copy overstates Optimise (B-27) |
| Obvious it's handed over | ⚠️ "Paid — your part is done. Paul takes it from here". But the dashboard still lists the sale under "Finish the handoff · Ready to submit?" (B-13) |
| Handoff after payment | ✅ B2's seller completed it after payment. Paul got a History line, no alert |

## Admin notification

- **Speed:** the bell `client_paid` was created about 2 s after payment. The PAID email was sent about 5 s after.
- **Correct business:** ✅. **Amount:** ✅ £99.00.
- **Salesperson and route:** in the email ✅ ("FINDABLE BUILD — 12 payments in total", "Salesperson: Test"). Not in the bell (B-20).
- **Useful next action:** ⚠️ the email's "Next step" was "Waiting for client: Services, Service areas, Website…" — false and misowned (B-05, B-07). The setup link to send the client is there, at the bottom.
- **Replay:** no duplicate bell, no duplicate email (`payment_email_skipped` recorded).
- **Destinations:**
  - Operator emails → **paul@findable.live** ✅.
  - Client-facing → **paul@move37.fun** ✅.
  - Nothing went anywhere else (QA guard plus trace rows).
- I could not read the mailbox. The email body above is **reconstructed** from the same builders and data.

## Paid Clients review

- **The list (as Paul):** B1 appeared **once**, under "Needs attention".
- **Card:** "ZZ QA-B1 Build close · Halifax · Findable Build · 1 of 12 paid · Sold by Test · WAITING FOR CLIENT · Setup 5/11 · Paid · 2026-10-04 · Next step … · Missing: …".
- **Clear from the card:** who, seller, route, payments made, setup progress, what's missing, next step.
- **Missing from the card:**
  - **Amount** (only "Paid · date").
  - **Whose move it is.** "WAITING FOR CLIENT" with next step "Crawl website" is two owners on one card (B2). The Admin dashboard adds "YOU" on that card: right, because the crawl is Paul's, but it contradicts the state label.
- **The client page:** one long page, 7,021 px at 375 wide, no horizontal scroll; Agreement at 3,635 px.
- **Could Paul fulfil the sale from this page alone?**
  - **Optimise (B2): nearly.** Contact, seller, payment, handoff (client wants / promised / why / decision maker / notes), website, access, agreement status, setup checklist, baseline, remeasure, monthly update are all there.
  - **Build (B1): no**, without correcting the false blockers (B-05). Domain shows READY although there is no domain (B-12). The conversation panel says nothing was recorded (B-29). "Website route not set" contradicts the header (B-12).
- **Duplicated or conflicting state on the page:**
  - Route in four forms: header, "Website route not set", agreement toggle, "Website Build · Build route".
  - Notes in two places.
  - Primary town "—" in Onboarding while the header and lead say Halifax.

## Handoff review (the B1 handoff as Paul saw it)

- **Copied correctly:** ✅ word for word, in the email and on the client page, with "Complete · Test".
- **Prefill:** work type, site situation and decision maker were prefilled from Quick Close and the lead. Paul cannot see which ones the rep typed and which were suggested once saved; acceptable.
- **WHY they bought:** ✅ "Saw a rival named by ChatGPT in the check and he wasn't."
- **WHAT was promised:** ✅ "live in about two weeks and that the site is theirs to keep".
  - The system **did not flag** that "theirs to keep" is only true after the 12th payment (agreement 4.3 / 8.2).
  - Nor that "two weeks" is a delivery date nobody agreed.
  - Paul has to spot it himself. Suggest: a one-line warning when the promise mentions ownership, dates or rankings.
- **Client wording vs salesperson assumption:** not distinguishable. Every handoff field is the rep's words. Acceptable for a phone close; label the block "In the salesperson's words".
- **Missing:** nothing essential for Optimise. For Build, "which domain name do they want, and who registers and pays for it?" is captured only as a generic note (Quick Close "No domain yet — the business registers one in its own name"). Domain choice belongs in onboarding or Build Facts (Session D's area), not Quick Close.
- **Pointless:** "What are we doing?" and "Current website situation" (duplicates).

## Missing information / readiness

| Case | State | Missing (as shown) | Correct? |
|---|---|---|---|
| B3 (sparse: no handoff, no email, access "Not sure") | WAITING FOR SALES, 5/11, next "Complete sales handoff" | Sales handoff, Services, Service areas, GBP, Website crawled, Client onboarding | ✅ the owner is right. ⚠️ "6 answers to give" though 3 are known (B-23). ⚠️ access shown as "cannot give access" (B-21) |
| B2 (Optimise, handoff after payment) | WAITING FOR CLIENT, 6/11, next "Crawl website" | Services, Service areas, GBP, Website crawled, Client onboarding | ⚠️ the client was never asked (B-07). "Client onboarding" duplicates Services (B-24) |
| B1 (Build, full info) | WAITING FOR CLIENT, 5/11 | Services, Service areas, **Website**, **Website access / control**, GBP, Client onboarding | ❌ two false blockers (B-05) |
| B1 after Paul's onboarding fix | WAITING, 7/11 | + **Domain / authority: DOMAIN / AGENCY ISSUE** | ❌ caused by the fix itself (B-06) |
| B1 after re-answering the site questions + GBP confirmed | **READY TO SUBMIT** 10/10 → seller submit → **READY FOR DELIVERY**, next "Run Discovery" | — | ✅ the three states work. Submit is idempotent. "YOU" is shown on the Admin card when the next step is Paul's (correct for "Run Discovery") |

## Agreement review

- **Route recorded:** ✅ checkout acceptance `build` (B1) / `optimise` (B2, B3) from the session metadata.
- **Agreement link:** `findable.live/agree/<64-hex>`, created at checkout with the route.
- **Send and resend:** sent to **paul@move37.fun** (05:24 UTC), `last_sent_at` stamped. A mistyped address gives the wrong message (B-17). Coordinator already proved that outside addresses are refused.
- **Page:**
  - Full v1 text.
  - Client details "Filled in from the form below".
  - The service tick follows the route.
  - Intro still says "sign the last page and send it back" (paper wording on an e-sign page; Paul's verbatim v1).
  - Build and Optimise wording is correct and distinct: 3.3 removes added pages on Optimise rather than taking a site down; 9.4 "We will never take your own website offline"; Schedule 1 ownership rows.
- **Signing:**
  - Errors are shown inline (422: bad email, no tick, QA-only sentence).
  - Valid signature → "Accepted on 4 October 2026, 06:24 (UK time) by QA Owner B1". IP and user agent are stored.
- **Immutable:** a second POST just shows the existing acceptance (still 2 rows). Rows are write-once (DB trigger).
- **Route lock:** after the agree-page signature `agreement_set_route` → **409** "already signed … cannot change". **Before it** the route could be flipped against a Build checkout (B-11).
- **Signed PDF:** downloaded from Paid Client (`agreement_pdf`) and from the public `?pdf=1`. Both 23,943 bytes, 7 pages. Client details filled, signature block "Signed electronically … 06:24 (UK time)", fingerprint printed. The "£" sign extracted as "�" in a text extractor; please glance at the PDF itself.
- **Copies:** the client copy goes to the signer's email, Paul's copy to paul@findable.live. Both are untraced on success (B-18).
- **The client is asked to agree twice:** the checkout tick is binding on its own, and the agree page asks again for legal name, address and role. That is Paul's design, but every surface should say "already accepted at checkout — please add your business details" rather than "please agree" (B-25).

## Email review

Triggered in this journey (UTC). Recipients come from the trace rows and the code. **I could not open the mailbox; please glance at paul@move37.fun** for the five client-facing ones.

| # | Time | Subject | To | Proof | Wording notes |
|---|---|---|---|---|---|
| 1 | 05:15 | New Findable client: ZZ QA-B1 Build close (paid £99.00) | paul@findable.live | trace, Resend `01a10556…` | long and repetitive; false blockers; next step misowned (B-19, B-05, B-07) |
| 2 | 05:15 | Your Findable Client Service Agreement - ZZ QA-B1 Build close (PDF, checkout) | paul@move37.fun + paul@findable.live | acceptance row; no send trace | plain, fine. Signed "Paul, Findable" |
| 3 | 05:24 | Your Findable agreement - ZZ QA-B1 Build close (link) | paul@move37.fun | `last_sent_at` | text only. "Hello," then the link. Fine; no mention it is already accepted at checkout |
| 4 | 05:24 | Your Findable Client Service Agreement - ZZ QA-B1 Build close (PDF, agree page) | paul@move37.fun + paul@findable.live | acceptance row | as #2 |
| 5–6 | 05:26 | New Findable client: ZZ QA-B2 … / PDF B2 | as #1 / #2 | trace `01a10560…` | Optimise job line "ADD PAGES to their existing site — they can let you in themselves" ✅ |
| 7–8 | 05:27 | New Findable client: ZZ QA-B3 … / PDF B3 | as #1 / #2 | trace `01a10561…` | "Sales handoff: NOT COMPLETE — the salesperson still owes it" ✅ |
| 9 | ~05:30 | Ready for delivery: ZZ QA-B1 Build close | paul@findable.live | none (untraced, B-18) | short, has the link |
| 10 | 05:33 | Questionnaire submitted, not paid — ZZ QA-B4 Abandoned link | paul@findable.live | `notify_sent_at` | **false** for a Quick Close (B-09) |

No client email went anywhere but paul@move37.fun. No email was sent to a real business. No duplicate on replay.

## Welcome Pack review

- **Could not be generated for a B fixture.** It requires a completed **paid baseline** (`welcomePackData.ts:81-101`, "Waiting for baseline · Missing: paid baseline"). Baselines are capped to Session C (README §9).
- **What I reviewed instead:**
  - The live public pack of the most recent real baseline client, read only: `findable.live/w/<code>`, HTTP 200, 101 KB, no writes, no tracking.
  - The template code for the parts that depend on route and payment.
- **As the customer:**
  - **First impression: good.** Clean, warm, "one thing we need from you" up front, an eight-part contents list, every page footed "Backed by our money-back guarantee" with Paul's phone and email.
  - **Baseline explanation: excellent and accurate.**
    - "We asked 20 questions… 3 times on ChatGPT and Gemini. That makes 120 answers."
    - "39 of those 120 … That's 33%: roughly 1 in every 3 times."
    - A per-engine split.
    - "Why ask everything 3 times?"
    - "Week four is your first check, not the end."
  - **No guaranteed-recommendation claims:** "What nobody can do is guarantee that a particular AI tool will recommend you." ✅
  - **Timeline and responsibilities:** clear five-step "From today to your before and after", GBP manager invite, five-minute review set-up.
  - **For a new-offer client** (`contract_total_payments` stamped + £99) it prints the real guarantee and "£99 a month begins… for your 12-month minimum term". Older clients get neutral wording (correct).
- **Problems:**
  - Route-blind agreement and ownership lines, and no "new website" for Build (**B-08, P1**).
  - "reply to the email this came with" when it is never emailed.
  - Checkout acceptance ignored ("Review and agree").
  - SEO letter grade printed (B-25).
- **How Paul provides it:** Stage 2 on the client page: Preview, **Copy Welcome Pack Link**, Download. No send button and no "sent" record. It renders live, so it is never stale. If facts change, the client's view changes silently.
- **Good enough to send?**
  - **Optimise: no**, until B-08 is fixed (it tells them we own their website).
  - **Build: yes with caveats** (it never mentions their new website).

## Build readiness (J24)

What Paul has after a Build Quick Close:

- route and contract (12)
- decision maker
- "no domain yet" (email only)
- the three consents (until B-06 wipes them)
- what the client wants
- what was promised
- notes (logo, photos)
- contact details

What he lacks, and where it should come from:

| Missing | Source |
|---|---|
| Services, areas, primary town | The onboarding form Paul must send the client (B-07). Prefilled town works when Paul uses the form. |
| GBP access | The client's own step on the post-payment page. Paul ticks it. |
| Which domain to register, and who pays for it | Nothing asks. It belongs in onboarding or the Website Build "Client Build Facts" (Session D). Not Quick Close. |
| Branding / assets | Only the rep's free text. Build Facts territory (D). |

Approval and contact route: the decision maker and preferred contact time are in the handoff ✅. **Sequence:** the order is right (payment → setup → submit → Discovery → baseline → build). It stalls at "setup" because of B-05, B-06 and B-07.

## Optimise readiness (J24)

Paul knows:

- the website ✅
- who controls it ✅ ("they manage it themselves" / agency)
- access ✅ (but "Not sure" is mis-stored, B-21)
- what the client wants changed ✅ (handoff)
- route and agreement ✅
- the CMS / platform: only if the rep wrote it in notes ("WordPress"). Quick Close does not ask, and onboarding's platform question is not prefilled.

Credentials are rightly not collected in Quick Close. The crawl is Paul's prep step. **Ownership language is correct everywhere except the Welcome Pack (B-08).** Nothing implies Findable can suspend an Optimise client's own site, except the pack's "we can take the site down".

## Client communication handover

- **When ownership moves:** at payment. The seller's view says "Paid — your part is done. Paul takes it from here", and Outreach and the Inbox drop the lead. Their messages to the client are refused from then on.
- **What the client is told:**
  - On the payment-complete page: "We'll be in touch within two working days to take these details."
  - On WhatsApp: "be back to you within a few days".
  - The agreement PDF arrives.
  - **Nobody introduces Paul by name.**
- **What Paul is told:** the PAID email ("Setup is promised within two working days", setup link at the bottom). The client page says **WAITING FOR CLIENT**.
- **The gap:**
  - The client waits for Findable.
  - The seller believes Paul has it.
  - Paul's screen says the client owes him.
  - No task, due date or alert puts the first contact on Paul (**B-07**).
  - The seller has no timeframe to repeat if the client calls them (B-30).
  - The client does have paul@findable.live (agreement) and the business WhatsApp number.

## State / data duplication

| Fact | Where it lives | Drift seen |
|---|---|---|
| Build / Optimise | Quick Close `answers.route`, onboarding `plan_tier` + `website_addon`, Stripe metadata, `contract_total_payments`, `client_agreement_links.service_route`, handoff `work_type`, onboarding `website_route`, Website Build "Build route" | "Website route not set" beside Findable Build (B-12). The agreement route can diverge from the contract (B-11). |
| Website status | `lead.website`, `lead.website_control`, onboarding `website_platform` / `website_manager` / `website_route`, Quick Close `manager`, handoff `site_situation` | The checklist reads only two of these, hence false blockers (B-05). "Not sure" becomes "cannot" (B-21). |
| Client wants / promises | handoff only | ✅ one source |
| Decision maker | Quick Close yes/no, handoff name + role, `lead.contact_name`, onboarding `contact_name`, agreement `typed_name` / `typed_role`, Stripe cardholder name (checkout acceptance "QA certification") | Typed three times (handoff, agree page, Stripe). Role never passed to the agree page. |
| Contact details | lead email / phone, onboarding contact_email / confirmed_phone (Quick Close corrections write only here), agreement email / phone, payer email | Onboarding email empty until Stripe fills it. The agree page prefills from the lead. |
| Consents | Quick Close `answers.build_consents` + onboarding columns | The onboarding columns are wiped by Paul's form while the Quick Close answer still says yes (B-06). |
| Notes | handoff `notes_for_paul`, lead notes, workspace internal note | The client page "Nothing recorded by Sales" despite a handoff note (B-29). |

## Suggested launch decision

Do not hand out salesperson logins for Build sales until **B-01** is fixed, and not for any sale until **B-07** gives Paul an owned "contact the client" step.

Ship in one release:
- B-01 (one line)
- B-05 and B-06 (readiness and onboarding prefill)
- B-07 (state + Send setup link)
- B-04 (fresh link)
- B-09 (skip Quick Close rows in the not-paid notifier)
- B-11 (lock the agreement route once paid)
- B-08 (route-aware Welcome Pack)

Then re-run J13–J20 on one Build and one Optimise fixture, with one answer per tap. With those in, the verdict becomes **READY WITH FIXES**. B-02, B-03 and B-10 should land before reps' first week. The P2 list can follow.

---

## Twelve-question matrix (README §12)

Q1 find · Q2 next · Q3 enough info · Q4 unnecessary info · Q5 asks known · Q6 harmful mistake · Q7 wording · Q8 state updates · Q9 admin gets it · Q10 permissions · Q11 desktop + mobile · Q12 recovery.

| Stage | Q1 | Q2 | Q3 | Q4 | Q5 | Q6 | Q7 | Q8 | Q9 | Q10 | Q11 | Q12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| J13 Quick Close | ⚠️ quiet button | ⚠️ B-03 | ❌ B-02 | ⚠️ duplicate handoff Qs | ❌ A-10 / B-23 | ❌ B-01, A-08 | ⚠️ B-30 | ✅ saves as you go | ✅ | ✅ | ⚠️ B-03 | ❌ B-01 silent |
| J14 Payment link | ✅ | ⚠️ B-31 | ✅ | — | — | ⚠️ B-04, B-16 | ⚠️ A-29 | ⚠️ B-31 | ⚠️ B-09 | ✅ | ✅ | ❌ B-04, B-10 |
| J15 Payment | — | — | ✅ | — | — | ✅ | — | ✅ | ✅ | ✅ guard | — | ⚠️ B-15 |
| J16 Seller after payment | ✅ | ⚠️ B-13 | ✅ | — | — | ✅ refused | ⚠️ B-14 | ⚠️ needs reload | — | ✅ | ✅ | ✅ |
| J17 Admin alert + email | ✅ | ❌ B-07 | ✅ | ⚠️ B-19 | — | — | ⚠️ B-19 | ✅ | ✅ | ✅ | — | ✅ |
| J18 Paid Clients | ✅ once | ⚠️ two owners | ⚠️ no amount | ⚠️ | ⚠️ | — | ⚠️ B-12 | ✅ | ✅ | ✅ admin only | ✅ (7,021 px) | ✅ |
| J19 Handoff / setup | ✅ | ❌ B-07 | ⚠️ B-05 | ⚠️ B-24 | ❌ B-05, B-23 | ❌ B-06 | ✅ | ✅ derived | ✅ | ✅ seller-only edit | ✅ | ⚠️ B-06 |
| J20 Agreement | ✅ | ✅ | ✅ | — | ⚠️ typed 3× | ❌ B-11 | ⚠️ B-17 | ✅ | ✅ | ✅ | ⏸ not checked on phone | ✅ |
| J24 Route consequences | ✅ | ⚠️ | ⚠️ B-02 | — | ⚠️ | ⚠️ B-11, B-16 | ⚠️ B-08 | ⚠️ B-12 | ✅ | ✅ | ✅ | ⚠️ no route correction |
| J26 Welcome Pack | ✅ Stage 2 | ✅ | ✅ | — | — | ❌ B-08 | ⚠️ B-25 | ✅ live render | — | ✅ | ⏸ not checked on phone | ⏸ |
| J27 Delivery lifecycle | ✅ | ⚠️ B-07 | ✅ | ⚠️ B-24 | — | ⚠️ B-06 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ submit idempotent |

## Not tested, and why

- **The Welcome Pack for a B client:** needs a paid baseline (Session C only, spend cap). Reviewed a live real pack read-only plus the template code.
- **Stripe's hosted page, the consent tick UI, the real subscription schedule, invoice / refund / dispute events, Stripe's own retries and signature:** the simulation cannot exercise them (README §7).
- **The real salesperson's win display and commission notification:** Test's sales are `test_excluded`. Code-read only.
- **Reading the received emails:** no mailbox access. Proved by trace rows where they exist. The PAID email body was reconstructed.
- **Discovery, crawl and baseline after READY FOR DELIVERY:** spend; Session C.
- **The client's post-payment GBP buttons** ("I've sent the invite"): not pressed.
- **Screens were not seen:** the Browser pane screenshots timed out, so everything was read via text tools.
- **The agree page and Welcome Pack at phone width:** not checked.
- **An agency-managed site through Quick Close review / release:** not exercised (covered by Session A / E).

## Cleanup check output (README §4.4)

All four fixtures were archived through `lead_set_archived`. B4 as Test; B1–B3 as Paul, because a paid client is no longer the rep's to archive (`not_your_lead`). Lead phone and email were cleared, plus the onboarding phone on B1. History and exclusion rows were kept.

| business_name | id | is_archived | no_contact | excluded | History `archived_set` | status |
|---|---|---|---|---|---|---|
| ZZ QA-B1 Build close | 1b000000-0000-4000-8000-0000000000b1 | true | true | true | true | payment_received |
| ZZ QA-B2 Optimise close | …00b2 | true | true | true | true | payment_received |
| ZZ QA-B3 Missing info | …00b3 | true | true | true | true | payment_received |
| ZZ QA-B4 Abandoned link | …00b4 | true | true | true | true | not_contacted |

- **Queued WhatsApp:** none of mine. The only `queued` leads are Paul's pre-existing Roof Rhino Ltd and PRECISION ROOFERS LTD (no phone, untouched).
- **Real external contact:**
  - WhatsApp: **0** Meta message ids on any B fixture; every outbound is `simulated` / `test_mode`.
  - Email: none sent to anyone outside paul@findable.live and paul@move37.fun.
- **No real payment and no Stripe subscription:** `stripe_customer_id` and `stripe_subscription_id` are null on all four.
- **Sessions:** all four sessions (Test browser + API, Paul browser + API) were signed out (204), and both API tokens were refused with 401 afterwards.
- **Paid Clients:** after archiving it lists 0 B fixtures, and `admin-overview` mentions none.
- **Unpaid live Stripe Checkout Sessions, left to expire about 24 h after creation (05:07–05:13 UTC on 05/10/2026):**
  - B1 `cs_live_a1O6bCue520QRnaSRHoodvQInCt77144FXPCL8k9isEQWHH9GrjyeK7DJe` (Build)
  - B2 `cs_live_a130c4lKPDVIKTq5j1i7HSFv6dCGQ2KnhFSxPkPfZVA05SnpZDtHlTW6iT` (Optimise)
  - B3 `cs_live_a1XsOGoypYK36IS2SEfMFivZR3eQrkEIpnCtNx32yxSBDWZqzSWXHOm0WW` (Optimise)
  - B4 `cs_live_a16wKtF3g9Qnyc8O1TMgZ7Xt5VYg7QKqMV080DKy4xTtSFrdvi83ZG92ER` (Build, superseded)
  - B4 `cs_live_a1n5vx4rzKZENYWDuyYd9ItqMQfmmbDDFwWTyg1prUP8NceRK0bff3UNsB` (Optimise)
  - Each is payable by anyone holding the link until it expires; nobody outside QA has them.
- **Intentionally permanent records (write-once, cannot be removed):** four `client_agreement_acceptances` (B1 checkout + B1 agree page, signer "QA Owner B1", reserved phone, QA address; B2 checkout; B3 checkout). Also three `payment_ledger` rows (B1–B3, `test_excluded`, £0 commission).
- **QA Paid Client residue, kept as evidence and hidden because archived:**
  - three onboarding rows with `status=paid`
  - three `payment_received` History lines
  - Paul's three `client_paid` bell notifications
  - 33 `quick_close_events`
  - B1's `delivery_submitted` stamp
  - B4's link record, deliberately aged to 26 h for B-04
- **Not mine, seen:** Test's dashboard still lists the archived ZZ QA12 under "Finish the handoff" (Session A's A-03).
