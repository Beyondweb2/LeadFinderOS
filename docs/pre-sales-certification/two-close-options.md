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
