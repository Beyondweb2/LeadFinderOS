# Two ways to close — Close on the phone / Send full setup (2026-10-07)

Branch `fix/quick-close-two-options` (LeadFinderOS) + `feat/two-close-options` (findable-site). Builds on the final pass
(`sales-to-payment-final-pass.md`); nothing there was rebuilt.

## What a salesperson sees (Close tab, `src/components/ClosePanel.tsx`)

**How do you want to close them?**
- **Close on the phone** — *Ask the questions now, then send agreement & payment* → the one Quick Close panel.
- **Send full setup** — *Let the customer fill it in themselves* → `FullSetupPanel`.

It opens on the way already started (answers or a link exist → phone; a set-up link sent → setup), with a "How do you want to close
them?" link to switch. Paid / ended leads skip the choice.

## Close on the phone — the exact questions (`closeFlow`)
1. Are they authorised to make this decision? (kept: it stops payment on a No)
2. Who currently looks after their website? (they / freelancer / agency / no website / not sure)
3. *(agency or freelancer only)* Are they still tied into a contract with them? (yes / no / not sure)
4. Who has control of their web address? (they do / agency-developer / not sure / no domain yet)
5. **What do they offer, and where do they want to be found?** — two short text boxes, saved as the Call screen's `jobs` / `areas`
   (skipped when the Call screen already saved them). **New.**
6. The plan, last. Build first and recommended; Optimise only on "agency / developer **and** confirmed still in contract"
   (`offerFit` / `agencyContractTiedIn`, unchanged). Optimise adds only "can we get in?".

**Removed from the call:** the reuse-the-design question (`rights`). It never changed the plan. Stored answers still read.
Nothing about DNS / registrar / hosting / CMS logins, photos, logos or hours is asked — that is the paid client's onboarding form.

Then **Create agreement & payment link** → **Send agreement & payment link** (WhatsApp, one click) / **Copy link** / Email.
The link is `findable.live/agree/<token>` — **never a Stripe URL** (agreement before payment, seller attribution, plan, price and
tamper-protection all stay on the server path). A NEW link is refused (`call_notes_missing`) until what they offer and where are
saved; a link that already stands is reused untouched.

The customer: Findable link → *Here's what we have so far* (website, domain, contract, **what you offer, where you want to be
found, your plan** — the first three can be corrected; the rest are read-only) → plan → v4 agreement → Stripe → paid.

## Send full setup
The client's own page `findable.live/onboarding/?lead=<lead id>` (made from the lead id alone — nothing is created until they use
it). Sent through the **same approved `findable_signup_link` template** (`link_variant: "setup"`, resolved by
`link-template-vars.ts`; `isSignupTemplateLinkUrl` accepts the agreement link or this link, never a Stripe URL), or a normal
message in an open conversation, or Copy. Server mode `share_setup` (`quick-close`): ownership, Ready-to-Sell gate, Paul's link rule
(`decideLinkRoute`), a repeat send needs a deliberate **Resend**. History is `lead_activity` `payment_link_shared` with
`data.variant = "setup"`.

The client's questions (`OnboardingFlow.tsx`): your details · the website choice (Build recommended / keep and improve / no website)
and who looks after it · **if an agency / web company: are you still tied into a contract with them? (new)** · the web address
questions on the new-site path (unchanged) · **what you offer + where you want to be found (new panel, before permission)** ·
permission · the plan screen · agreement · payment. When an agency runs the site **and** they are still in contract, the
"Recommended" badge moves to *Keep and improve* with a one-line reason; both choices stay open.

## One sign-up, two routes
Both use the lead's single onboarding row (`quick_close_row`, advisory-locked) and the single agreement link per lead. A salesperson's
answers on the row make it **assisted**; the page then resumes it instead of asking again (`resumeDecision`, unchanged). The route is
derived (`closeRouteOf`) and the phone link also stamps `quick_close.close_route = 'phone'`. Self-serve answers go in
`onboarding_responses.agency_contract` (new, additive, constrained to in_contract | free | not_sure).

## Known gap, said plainly
A self-serve client who is in contract with their agency may still *choose* Build; the page only recommends. The server's
agency-contract stop (`agencyContractBlocksBuild`) applies to Quick Close rows, not to a self-serve row. Not changed here.
The self-serve new-site path still has the domain-owner / registrar-access / reuse-rights / consent panels from before this work.

## Deploy
Migration `20261016000000_onboarding_agency_contract.sql` first (additive). Functions: `quick-close`, `findable-onboarding`,
`findable-checkout`, `send-whatsapp-message`, `sales-performance`. Reach the changed modules but behaviour unchanged (not redeployed):
`client-intake`, `client-onboarding`, `paid-client-hub`, `stripe-webhook`. **`whatsapp-status` untouched.** Then the SPA (push to
main) and findable.live (`npm run deploy --branch=master` from a clean worktree).

## Live ZZ QA — 2026-10-07 (production functions + findable.live, after the deploy)
Driver `scripts/_qa_two_options.ts` (untracked, never staged). Fixtures `ZZ QA Two P1, P2, S1, S2` (ids `11120000-0000-4000-8000-0000000000a1/a2/b1/b2`), no real
contact, in `metric_exclusions`, archived at the end (read back: `is_archived true, no_contact true, excluded true`). Payment simulated (no Stripe, no money), twice per
sign-up (duplicate-safe).

| | Scenario | Result |
|---|---|---|
| P1 | Phone close · Build (owner-run site, services + areas saved) | link is `findable.live/agree/<token>`, never Stripe; customer's page READY on the salesperson's row; 3 facts to confirm (no reuse question); summary *What you offer / Where you want to be found / Your plan = Findable Build*; full questionnaire submit **resumes the same row**, no duplicate; resend → identical URL; Looks right; agreement v4 before payment; paid, 12 payments; route recorded `phone`; seller = the salesperson |
| P2 | Phone close · Optimise (agency, still in contract, access yes) | same, plan *Findable Optimise*, v4 Optimise, 6 payments |
| S1 | Full setup · Build (agency, free to leave) | prefill holds no sales sign-up; submit stores `agency_contract=free`, services + areas **before payment**, `plan_tier new_site`; checkout → the agreement first; signed v4; paid, 12 payments; one row; no seller (self-serve) |
| S2 | Full setup · Optimise (agency, in contract) | `agency_contract=in_contract`, `plan_tier keep`; agreement v4 Optimise; paid, 6 payments |

Driver artefact, not a fault: the "one sign-up creation" check read 2 on P1/P2 because the driver itself wrote a second `link_generated` event for its resend step (the real server writes
`link_reused`); both creations are by the same salesperson on the same sign-up.

**Not exercised live — said plainly:** the operator screens (behind login — rendered in a throwaway harness against the real Quick Close rules at desktop and 390 px, no overflow, then deleted),
Quick Close's own `save` / `generate_link`, and the WhatsApp sends (`share_link`, `share_setup`) — a salesperson JWT cannot be minted here. The Full Setup template path is pinned by
`scripts/quick-close-two-options.test.ts` and by the sender's own shape check, not by a live Meta send. The customer's new panels (contract question, services / areas) were verified by
typecheck, the site's source guards and the live chunk markers, **not** clicked through in a browser against live data.

## Final safeguards — 2026-10-07 (fix/two-close-final-safeguards, live)
1. **Full Setup keeps its salesperson.** `share_setup` records the send (`quick_close_events` `link_shared`, `variant: "setup"`). When the client's own page creates the
   sign-up row, `findable-onboarding` calls `_shared/setup-link-creator.ts`: ONE `link_generated` event on that row, actor = the sender — the phone close's own event, so the
   existing trigger writes `sale_creations` and `sale_attribution_decision` stamps `sold_by_user_id` at payment. No send recorded → no event → the existing no-creator rule decides.
   Before: a self-serve sale on a salesperson's lead had `sold_by_user_id` null (S1/S2 of the first QA). After: the sender, `source signup_creator`, ledger seller set, no review.
   Not carried over: the send-time "engaged" evidence the commission engine reads from `link_generated` after an engagement END (a full setup send is `link_shared`, not `link_generated`).
2. **Self-serve contract safeguard** (`src/lib/selfServeContract.ts`): Build + agency-run site + contract `in_contract` or `not_sure` is held — the phone close's own
   predicate (`agencyContractBlocksBuild`), `findable-checkout` refuses `held_for_review`, Paul is notified once, the Close tab shows the stop and the SAME Release button
   (`approve_review` → `quick_close.review_approved_at`). Optimise, `free`, no agency, or no answer are not held (silence is never "in contract").
3. **A preview never writes.** The client page opened with `preview=1` answers every write locally (`preview_only`) and shows a banner. Cause of the wrong name / email on
   a lead: the operator's Preview link was completed and submitted, which saved the operator's own details as the prospect's.

Live QA `_qa_final_safeguards.ts`, fixtures `ZZ QA Safe …` (archived): P1 phone Build; S1 setup Build (contract ended) / S2 setup Optimise (in contract) paid with
`sold_by_user_id` = the sender, one creation event, ledger seller set, no review; S3 Build in contract → held, Paul notified, released by SQL (the field `approve_review` writes) → v4 → paid, seller kept;
S4 Build not sure → held. Resume in a real browser on findable.live: details and the website / contract answers restored on reopening the same link, no onboarding row created.
Not exercised live: the WhatsApp send itself and the operator Close-tab buttons (no salesperson JWT here).
