# Sales → sign-up → agreement → payment: the final pass (2026-10-07)

Branches: LeadFinderOS `fix/sales-to-payment-final-pass`, findable-site `fix/sales-to-payment-final-pass`.
Brief: Paul, "final pass on the salesperson → signup → agreement → payment journey". No commercial term, price,
agreement text, India / Australia setting or WhatsApp template was changed. `whatsapp-status` was not touched.

## 1. The broken link — root cause

The salesperson's sign-up link is `findable.live/agree/<token>` (one per client, `client_agreement_links`,
upserted per lead, so a resend is the identical URL). The message *"Your sign-up is already set up with the plan you
agreed with us…"* is not on that page. It is findable-site's **self-service onboarding page** (`/onboarding/?lead=<id>`,
the report button, the Inbox "Onboarding link") reacting to a `409 signup_in_progress` from `findable-onboarding`.

Reproduced live on a ZZ fixture before the fix: prefill answered *ready, build, on its own row*, and **a submit on that
same valid lead answered `409 signup_in_progress`**. The page reaches a submit when:

1. a **saved questionnaire draft** (sessionStorage) is restored — the page jumped straight to `questions` before
   prefill had said the lead had a sales sign-up, and the client answered everything and was refused at the end; or
2. the client pressed **"Let's start"** inside the 2.5 s window before prefill returned.

The server's rule ("a sales-held sign-up is never replaced from the public page") was right; answering a *legitimate
visit* with a refusal was wrong.

## 2. The canonical sign-up / resume logic

`src/lib/salesSignup.ts` → `resumeDecision(rows)` (one rule, used by prefill, submit and sales_confirm):

| The lead's newest unpaid sign-up | Result |
|---|---|
| a Quick Close sign-up Quick Close may release (`mayGenerateLink`) | **resume** — continue on that row |
| a Quick Close sign-up not yet releasable (answers missing, Paul's review, blocked) | **pending** — "being finished", never an error |
| none / a self-service row / a paid row | **self_service** — the ordinary flow |

* `findable-onboarding` **submit** on a *resume*: returns `{ok, onboarding_id: <the held row>, resumed:true, route}` before
  any row is written. Typed contact details fill **empty** fields on the held row only. Plan, price, seller are not read.
* **pending**: `409 signup_pending` ("Your Findable contact is finishing your set-up…"). `signup_in_progress` no longer exists.
* The page (findable-site `OnboardingFlow.tsx`): when prefill reports a sales sign-up it **drops the stale draft and
  leaves the questions**; a resumed submit carries on to that sign-up's plan.
* Reopen / resume / resend: the same URL, the same row, every time; a duplicate row cannot be created from the public page.
* Seller: attribution is `sale_creations` (the creator of the sign-up, written when Quick Close generated the link). Nothing
  in resume or confirm touches it.

## 3. Quick Close — the questions (final)

`closeFlow()` is the one list; `missingQuestions()` is "closeFlow minus what the Call screen already saved".

1. **Authority** — "Are they authorised to make this decision?" (Call screen usually already saved it.) *A "No" ends the close.*
2. **Who currently looks after their website?** — They manage it themselves · Freelancer / individual developer · Agency · No website · Not sure. *(legacy `employee` / `third_party` answers stay readable, not offered.)*
3. **Contract** — "Are they still tied into a contract with them?" Yes · No · Not sure. **Only if** 2 = agency / freelancer.
4. **Who has control of their web address (domain)?** — They do · Agency / developer · Not sure · No domain yet. (The line under it: *the domain is separate from the website.*)
5. **Right to reuse** — "Do they own, or have permission to reuse, the design and content from their current website?" Yes · No · Not sure. **Only if** 2 ≠ no website.
6. **The plan — last.** Build first ("A new website built and optimised for AI visibility"), Optimise ("Improve their current website"). **Optimise only:** "Can Findable get access?"

4–5 questions (6 with an agency), fewer when the Call screen already answered. Nothing asked: registrar, DNS / CMS / hosting
logins, Google Business login, contract expiry, logos, photos, detailed services, hours, areas, plugins — all post-payment.

## 4. The recommendation rule

* **Build is the default** (Call screen and Quick Close, `offerFit`). Reason line (Paul's approved copy): "Build is usually the best route. Use Optimise if they need to keep their current website because they're still tied into an existing agency contract." plus helper notes: *Build gives us a clean technical base to work from*; reuse **yes** → "We can keep the new site very close to the look they already like if they want."; reuse **no / not sure** → "We'll build an original site rather than copy their current one." (never promise a clone); and "Keeping their domain is not the same as keeping their website".
* **Optimise is recommended only** when an agency / freelancer / third party runs the site **and** the contract is **still on** (`agencyContractTiedIn`). Build is then not offered to a salesperson (Paul may still choose it; it stops for his release).
* **Contract "Not sure" / unanswered**: Build stays the default recommendation, with **"Confirm their agency contract before finalising Build."** and — unchanged from this morning's rule — the Build still stops for Paul's release until the contract is confirmed *free* (`agencyContractBlocksBuild`). *A decision for Paul to confirm: the brief asks only for the warning; I kept the existing stop rather than remove a safeguard.*
* **Domain** held elsewhere / not sure → never a plan change; a "Domain handoff to resolve before launch" note for Paul.
* **Reuse rights** → wording only; never blocks Build.
* **No website** → Build only; no contract, no reuse question, no ownership notes.

## 5. What the client confirms before payment

`src/lib/clientConfirm.ts` + `findable-onboarding` `sales_confirm` + findable-site `SalesConfirmCard`. On the intro of their own
page (ready sales sign-up only): **"Here's what we have so far"** — who looks after the website · contract (only with an
agency / freelancer) · who controls the web address · reuse of the current site (only with a site). **Looks right** or **Change**
(chips; the follow-ups appear / disappear as they change an answer — the server sends each item's `showIf`, the page only draws).

* The answer is stored in `quick_close.client_confirmed`, **beside** Sales' answers; `effectiveAnswers()` overlays it for the gate.
* A correction that makes the sale unsafe (Build + still tied in / not sure, an answer missing) **holds the sign-up for Paul**
  (`quickCloseState` judges it even while the link stands; `findable-checkout` refuses with `held_for_review`; Paul is notified).
  A real change withdraws any earlier release.
* It **cannot** change the plan (`route`, `approach`, `plan_tier`, `website_addon`), the price, the decision-maker answer, the
  consents, or the seller — only the four keys are read; the columns written are `website_manager / website_platform /
  domain_* / site_rights`; `rev`-conditional like every `quick_close` write.

## 6. Deferred to post-payment onboarding (unchanged)

Domain registrar, DNS / CMS / hosting access, Google Business Profile access, logo / brand files, photos, detailed services,
service areas, opening hours, agency contact / handover — `clientOnboardingForm.ts` / the paid client's form.

## 7. Tests

`scripts/sales-to-payment-final-pass.test.ts` (new: scenarios A–F through the real save planner, the resume rule, the
confirmation and its tamper cases, the gates, the server and page source) + the suites that encoded plan-first / Optimise-default
(`quick-close`, `quick-close-links`, `sales-close-handoff`, `sales-workspace-v2`, `service-route-terms`, `wave1-integration`,
`coverage-found-added`, `call-script`, `call-workspace`, `plan-recommendation`, `client-signup-agreement-flow`,
`lead-lookup-failure`, `client-copy-claims` (+ `clientConfirm.ts`)). Run the cross-repo ones with
`FINDABLE_SITE_DIR=<findable-site checkout>` until the site is merged.

## 8. Deploy

No migration. Edge functions that reach the changed modules (`check-import-graph --reached-by`): `findable-onboarding`,
`findable-checkout`, `quick-close`, `client-agreement`, `client-intake`, `client-onboarding`, `paid-client-hub`,
`sales-performance`, `send-whatsapp-message`, `stripe-webhook`, `conversation-triage`, `paid-baseline`. **Never `whatsapp-status`.**
Order: functions first (a new server with the old page is fine), then findable.live. findable-site: clean `origin/master` worktree,
`npm run deploy` with `--branch=master`.

## 9. Live ZZ QA — 2026-10-07 (production functions + findable.live)

Driver: `scripts/_qa_final_pass.ts` (untracked, never staged). Fixtures `ZZ QA Final A…F, R, S` (ids `11110000-0000-4000-8000-0000000000xx`):
no phone / email of a real person (paul@move37.fun only), in `metric_exclusions`, **all archived** (read back: `is_archived true, no_contact true, excluded true` ×10).
The salesperson's close was written through the REAL `planQuickCloseSave` one tap at a time; everything the CLIENT does hit the live public endpoints
(`findable-onboarding` prefill / submit / sales_confirm, `findable-checkout`, `findable.live/agree/<token>` GET + POST) and payment used `scripts/qa-simulate-payment.ts` twice (duplicate-safe).

**Before the deploy (old server):** a valid ready sales sign-up answered the questionnaire submit with `409 signup_in_progress` — the bad state, reproduced.

| | Scenario | Result (all live) |
|---|---|---|
| A | Build · self-managed | Build recommended; link; prefill ready; **submit resumes the same row** (twice); no duplicate; forged `route / plan_tier / website_addon / sold_by` ignored; wrong sign-up id → `not_held`; a correction "agency, still in contract" **holds it** (checkout `held_for_review`, page "being finished", client cannot flip it back); Paul's release → ready; agreement v4 signed on the exact link; paid ×2 → one ledger row, 12 payments, tied to the signature |
| B | Build · agency, free to leave | resume + no duplicate; harmless correction (domain → not sure) saved, still ready; Looks right; v4; paid, 12 payments |
| C | Optimise · contract blocker | Optimise recommended / Build not offered; resume; Looks right; **v4 Optimise** signed; paid, **6 payments** |
| D | Unknown contract | Build default; the link is **refused until Paul releases** (existing stop, `domain_unresolved`); client told "being finished" (`signup_pending`); after release: link, sign, paid, 12 payments |
| E | No website | Build only; no contract / reuse questions; full journey; 12 payments |
| F | Resend | `findable-checkout signup_link` twice → **identical URL**; reopen → same sign-up, still one row; seller unchanged |

Seller (A–F): exactly one `sale_creations` row per sign-up, by the Test salesperson, unchanged by every client action; `sold_by_user_id` = that salesperson after payment.
Browser (findable.live, real fixture): the card renders; **390 px and 1280 px, no horizontal overflow**, buttons ≥ 52 px; Change shows the follow-ups conditionally
(choosing "We manage it ourselves" removes the contract question); Save and continue → the plan screen. **The stale-draft case in a real tab:** the questionnaire started
(draft saved in sessionStorage) → the salesperson then closed the lead → reload → the page showed the intro with the confirmation card, the draft was cleared, no questionnaire.
Incidental proof: a simulated payment on a sign-up with no signature went on **payment hold**, not paid (the v3 backstop).

**Not exercised live — said plainly:** Quick Close's own `save` / `generate_link` / WhatsApp `share_link` (a salesperson JWT could not be minted without the service key, and fetching it was
blocked by the session's auto-mode — not pursued); the seller `link_generated` event was written by SQL as the Test salesperson. The operator Quick Close screen sits behind login and was not
viewed in a browser (covered by the source tests; the dialog's classes are unchanged apart from two callouts and a one-column list for the new question).
