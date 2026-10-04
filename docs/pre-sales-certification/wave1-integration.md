# Pre-sales wave 1 — integration record

- **Date:** Sunday 4 October 2026. **Branch:** `integration/pre-sales-wave1` (LeadFinderOS), cut from `origin/main`
  `c0e85078` (proved equal before branching), worktree `C:/Users/paulj/LeadFinderOS-wt/wave1-integration`.
  findable-site: `integration/pre-sales-wave1`, cut from `origin/master` `4486079`.
- **Not merged to main. Not deployed.** No migration was applied, no edge function deployed, no SQL run (not even
  read-only), no Stripe / Meta / vault change, no message or email sent. Ronnie and MCL were not touched.
- Visual QA used a throwaway local harness with fixture data only (deleted before commit).

---

## 1. Branches integrated

| Order | Branch | Commit(s) | Merge commit on the integration branch |
|---|---|---|---|
| 1 | `fix/01-security-inbound` | `2497e628` | `c690b10b` |
| 2 | `fix/03-payment-client-state` | `0ff1fb60` | `1ba72819` |
| 3 | `fix/02-quick-close-links` | `feffda54` + `71596fa2` | `a8d802fd` |
| 4 | `fix/05-call-workspace` | `282f240f` | `afb01564` |
| 5 | `fix/04-ai-measurement` | `6c5409a4` | `0d517390` |
| 6 | `fix/06-website-build` | `accedba6` | `fe89be0c` |
| — | findable-site `fix/04-ai-measurement` | `31ab2c1` | `978c806` (findable-site) |

All six were cut from the same `origin/main` (`c0e85078`), each one commit ahead (WS-2 two). The order put the
payment state (WS-3) under Quick Close (WS-2), the call workspace (WS-5) after Quick Close (it imports
`quickClose.ts`), and the measurement truth (WS-4) before the Website Build that consumes it (WS-6).

The integration's own changes are one commit on top of the six merges (listed in §3).

---

## 2. Conflicts and shared-file review

**Textual conflicts: none** — checked first with `git merge-tree` over the whole sequence, then by the real
`--no-ff` merges. Every shared file was then read in its combined form:

| File | Workstreams | Combined result |
|---|---|---|
| `src/lib/deliveryStage.ts` | WS-3 first contact · WS-4 stopped / frozen measurements | Independent branches; correct. First contact sits in setup, the measurement steps above it. |
| `supabase/functions/_shared/client-setup.ts` | WS-3 paid route + first contact · WS-4 `baseline_error`, replay row | Both column sets present; both audits loaded; correct. |
| `src/lib/manualOnboarding.ts`, `src/pages/ClientHub.tsx` | WS-3 · WS-4 | Different blocks (consents / agreement buttons vs onboarding wording / measurement panel). Correct. |
| `supabase/functions/paid-client-hub/index.ts` | WS-3 · WS-6 | WS-3's closed-client refusals and WS-6's `save_website_build` launch refusal are separate actions. Correct. Integration added `services_not_offered` to the onboarding columns (§3.4). |
| `supabase/functions/page-generator/index.ts` | WS-4 named ruler · WS-6 claims + scope | Different blocks; correct. Integration wired the service truth in (§3.4). |
| `src/lib/salesWorkspace.ts`, `src/lib/salesCrm.ts` | WS-2 expired link · WS-5 archived / call-first | WS-2's `link_expired` task sits after WS-5's `if (!active) continue`, so an archived lead never gets it. Correct (tested, §7 scenario 5). |
| `scripts/service-route-terms.test.ts`, `sales-readiness.test.ts`, `abuse-cost-protection.test.ts` | pairs | Different assertions; all pass. |

**Problems a clean merge did not show — found and fixed in the integration (§3):**
1. Quick Close judged "already paid" only on the onboarding row reading exactly `paid` (WS-2). A client moved on to
   `in_delivery` / `completed`, or ENDED, could still have answers changed and an unexpired payment link e-mailed or
   WhatsApped (WS-3's ended-client rules never reached Quick Close).
2. WS-3's first-contact rule was switched on by a hard-coded day (`FIRST_CONTACT_SINCE = 2026-10-05`) — ruled out by Paul.
3. WS-3 removed the SEO grade from the Welcome Pack pending a ruling Paul has now made (keep it).
4. WS-4's "not offered" matching dropped the word "new": a client's "no new boilers" excluded **every** boiler question,
   including the repairs and servicing they do offer — wrong in WS-4's own baseline checks and, once wired, on the site.
5. WS-6 used the page plan's services, not the client's confirmed truth (the required WS-4 → WS-6 wiring).
6. The guarantee headline existed twice (WS-2 `QUICK_CLOSE_PROMISE`, WS-5 `GUARANTEE_HEADLINE`).
7. WS-1's admin wording ("WhatsApp inbound is OFF") assumes the fail-closed webhook is live; with Paul's Meta hold the
   old webhook stays live, so that wording would be false in the Security panel and the alert email.

---

## 3. What the integration changed (one commit)

### 3.1 First contact — an activation stamp, not a date (Paul's decision 3)
- New column `outreach_leads.first_contact_owed_since` (migration `20261007200000_first_contact_activation.sql`,
  additive, nothing back-filled).
- `stripe-webhook` stamps it on the payment that made the lead a client, **before** the new-client email reads the
  stage (`stampFirstContactOwed`, `_shared/payment-state.ts`): conditional on a blank stamp, no recorded contact and an
  open client; never fails the payment (a failure is written to `client_error_reports` as `first_contact_stamp_failed`).
- `src/lib/firstContact.ts`: owed / overdue **only** with a readable stamp; due two working days after the payment day.
  `FIRST_CONTACT_SINCE` is gone. Every historical client — and any client paid before the new webhook is deployed —
  has no stamp and can never read "overdue", whenever the deploy happens.
- The seller's paid view in Quick Close now shows the **same due day** Paul's screen and email use
  ("…within two working days (by Wed 7 Oct)"). An ended client shows "This client's engagement has ended."
- Manual (Paul-entered) payments are not stamped: Paul entering the client is himself the contact.

### 3.2 Quick Close is pre-payment only, judged on the lead
- `quickCloseClosedRefusal` (`src/lib/quickClose.ts`): money on the lead, a paid-or-beyond status, refunded, or an
  ended engagement → `already_paid` / `client_closed`; the row's own status is a second signal.
- `fn quick-close`: one guard before every save / review / link / share mode; the load view never hands a link URL
  to a closed client, even one still inside its window. `findable-checkout` already refused a new session for a paid
  lead — the gap was a link made before payment and shared after it.

### 3.3 Welcome Pack SEO grade restored as a separate measure (Paul's decision 2)
- `seoStyle: 'pack'` (`aiAuditReportHtml.ts`, `welcomePackHtml.ts`): heading "Your website's SEO grade", eyebrow
  "Your website · a separate measure"; the measured grade as **Before**; an **After** only when a later scan genuinely
  exists (`seoAfter`, with its date) — otherwise "After — not measured yet … we never estimate one."
- The section says, in words: "It is separate from your AI visibility. Your money-back guarantee is judged only on AI
  visibility, measured before we start and re-measured after four weeks; this grade does not decide it."
- No grade-dependent spin, no target grade, no promised "A". The results sender never reads an SEO grade (tested).
- ⚠️ Today no "after" scan exists anywhere: SEO scans run only on the baseline (`seoScanAllowed`). The slot is ready;
  a post-launch re-scan is a separate decision.
- WS-3's per-route ownership wording is unchanged.

### 3.4 WS-4 service truth → WS-6 (required wiring)
One leaf, `src/lib/siteServiceTruth.ts`, uses WS-4's single ranking (`resolveServiceTruth`: client onboarding / verified
build fact → Sales notes → never Discovery) and WS-4's "not offered" list:

| WS-6 location named in its record | Now |
|---|---|
| `siteScopeFromBuild()` (`siteGate.ts`) | Receives only **client-confirmed** planned services; the not-offered list joins `excluded`. New `siteTruthFromBuild()` builds the truth from the client's own records (`clientTruth` on `BuildPackInput`, passed by `WebsiteBuild.tsx`; fallback: evidence + verified ledger fact). |
| `siteIntentMap()` | A planned page for a service the client never confirmed owns **no** baseline question; its question is UNOWNED with the reason ("is about "Underfloor heating", which has a planned page but is NOT one of the client's confirmed services"). The expect file carries `unconfirmedServices` and `notOffered`; the build prompt names both. |
| Website Build screen | New amber line on the Build pack step: "Not confirmed by the client: …" (was only inside the copied prompt). |
| `candidateFacts()` (`buildFacts.ts`) | **Unchanged, on purpose.** Its services are already ranked onboarding → client record → baseline, and only the onboarding list auto-verifies. WS-4 stopped "Save client context" writing the merged list back (it writes only what Paul sent), which was the risk WS-6 named. Rows saved before WS-4 cannot be told apart; the site gate's confirmed-service filter covers them. |
| page-generator Q&A | Service list = the truth list; the not-offered list joins the refusal; a **measured** question (in the client's own measured set) naming an unconfirmed service or an unserved town is refused before any spend. Free-typed questions keep WS-6's narrower check. |
| page-generator page-plan queue | Services = the truth list; a planned page whose primary question fails the same rule is HELD with the reason. |
| page-generator service pages | The client's ticked list minus anything their own not-offered / must-not-say names. |
| `classifyQuestion()` / `namesExcluded()` / `ownershipFor()` | Contracts unchanged; only their inputs changed (as WS-6 designed). |
| `paid-client-hub` `rebuild_context` | Selects `services_not_offered` (needs WS-4's migration `20261007040100` first). |

Why two judges: WS-4's `questionScope` decides what may enter the **measurement** and is deliberately blunt (an
unknown verb form reads "unsupported"); WS-6's `classifyQuestion` decides which **page** owns a question (work
families: "boiler installation" is not the servicing page). The integration asks WS-4's rule about **service names**
and WS-6's about **questions**. Measured on Session D's truth sets, WS-4's rule applied to questions would have
refused "leaking tap repair", "key safe fitted" and "Who fixes uPVC door locks" for clients who do that work.

### 3.5 WS-4 fix: a "not offered" entry about NEW work binds only new work
`serviceScope.ts` `NEW_WORK`: "no new boilers", "bathroom fitting", "boiler installation" now match only questions
that also ask for new / install / fit / replacement work. Before: "Who can repair my boiler" and "cheapest boiler
service" were **not offered** for Session D's plumber — kept out of his own baseline. WS-4's suites still pass.
⚠️ Separate, not fixed (measurement quality, WS-4 owner): `questionScope` reads some verb forms as unsupported
("fixes", "fitted", "leaking"). It fails toward caution — Paul sees the flag and can approve with a reason — but the
recommended 20 may leave such questions out.

### 3.6 Smaller
- One guarantee headline: `GUARANTEE_HEADLINE = QUICK_CLOSE_PROMISE` (call screen and Quick Close can never differ).
- Security panel + alert wording true whichever webhook is live (§5).
- Tests re-pointed where they pinned superseded shapes: `payment-client-state` (stamp rule, pack SEO), `service-route-terms`
  (lead-level guard), `outreach-list-columns` (one hand-checked exception: `service_terminated_at` read only by
  `quickCloseClosedRefusal` on fn quick-close's own row), `abuse-cost-protection` (wording).
- `CLAUDE.md`: rules for monotonic payment state, Quick Close on the lead, the activation stamp, the pack's SEO grade,
  site truth, the new-work negative, and the Meta hold. `docs/INDEX.md`: the six fix records and this file.

---

## 4. Cross-workstream checks the brief asked for

**WS-2 ↔ WS-3 (Quick Close → payment → Paid Client), all in `scripts/wave1-integration.test.ts`:** Build reaches 5/5
one answer per call; the link is made; the webhook's real writes (in-memory database) establish the client, stamp
first contact and move the row to paid; the Paid Client is WAITING FOR FINDABLE — "Introduce yourself and send the
setup link — by Wed 7 Oct"; Build needs no website or login; Quick Close then refuses every mode; the agreement route
cannot drift; Paul records the contact and the normal step takes over. Replays leave an in-delivery client
byte-identical; an ended client (Ronnie-shaped fixture) gets no link, no stamp, no first contact, stage ENDED.
Link e-mail / WhatsApp histories are WS-2's (`quick_close_events`, `lead_activity payment_link_shared`), unchanged.

**WS-2 ↔ WS-5 wording (rendered from the code):**

| | Call screen (WS-5) | Quick Close (WS-2) |
|---|---|---|
| Build | £99 now · £99/month · 12 payments in total; "the site is yours" once the 12 are done | £99 today; then £99 a month, starting six weeks after sign-up; 12 payments in total — a 12-month minimum; "It becomes theirs once all 12 payments are made" |
| Optimise | £99 now · £99/month · 6 payments in total; "You keep your own website and it stays yours… we never take it offline" | 6 payments in total — a 6-month minimum; "They keep their existing website — it stays theirs" |
| Guarantee | "We improve AI visibility or you get your money back." (one constant now) | the same, then `FINDABLE_GUARANTEE` verbatim |

No ranking, citation or "AI will name you" promise anywhere (WS-5 and WS-2 tests, plus `client-copy-claims`).
Archived leads and expired links: scenario 5.

---

## 5. Paul's decisions — applied

1. **Ronnie** — nothing touched. No SQL, no data write. The integration test's ended fixture is Ronnie-shaped
   (£49.99, 17 Aug, `client_ended_early`) and proves a late event cannot reactivate, stamp or chase it.
2. **SEO grade** — restored as a separate before/after measure (§3.3).
3. **First-contact cutoff** — the activation stamp (§3.1). No date in the code.
4. **Apify / budget** — WS-4's pools kept; constants equal Paul's launch configuration (guarantee $10/day, client
   $8/day, prospecting $12/day; tested). The Apify reserve: prospecting stops at 85%, client work at 95%, guarantee
   work runs to Apify's own cap. **Paul action:** raise / confirm the Apify monthly cap (~$100) before any bulk-audit
   rollout. Not changed here.
5. **Results email** — the hold stays (`REMEASURE_RESULTS_COPY_APPROVED = false`, unchanged). Exact copy in §6. The
   causal claim stays removed.
6. **Meta / WhatsApp** — 🔴 **WHATSAPP WEBHOOK DEPLOYMENT BLOCKED UNTIL FINDABLE META APP / APP SECRET IS READY.**
   WS-1's fail-closed gate is preserved in the code. `whatsapp-status` is excluded from the deploy list (§10). The
   **post-call reply matcher (M-005) rides the same function, so it waits for the same day.** The Security panel and
   alert e-mail now read: "WhatsApp webhook signatures are not verified. WHATSAPP_APP_SECRET is not set. Until it is,
   the current webhook accepts unsigned posts …, and the fail-closed webhook (built, held until the Findable Meta App
   is ready) would refuse every reply." No guessed secret was configured.
7. **Vault entries** — not touched. **Deploy-session action** (after re-checking, immediately before, that nothing
   references them; never print names or values):
   ```sql
   delete from vault.secrets
   where id in ('d896f9c2-2c83-4cf8-bd50-0073705c05bc', '6c9a19be-301a-42cc-ae18-c79c0d056495')
     and name ~ '^eyJ';
   ```
   Read-back: `select count(*) from vault.secrets where name ~ '^eyJ'` → 0. No key rotation.

---

## 6. The four-week results email — exact copy for Paul's approval

Rendered from `resultsEmailParagraphs` / `resultsEmailSubject` / `resultsDocumentMeaning` on this branch (fixture
names; the real email fills the client's). Still held: `REMEASURE_RESULTS_COPY_APPROVED = false`.

**A. The number went up (Build client, first monthly still ahead)**

> Subject: Your four-week results — Calder Plumbing and Heating
>
> Hi,
>
> Four weeks ago we measured how often ChatGPT and Gemini named Calder Plumbing and Heating when people asked the questions your customers ask in Halifax. We have just asked the same 20 questions again, on the same engines.
>
> Before: named in 12 of 120 answers (10%).
>
> After: named in 27 of 120 answers (23%).
>
> The full before-and-after, question by question, is here: https://findable.live/r/ABC123
>
> Your number has gone up: on the same questions and the same AI tools, you were named more often than four weeks ago, by more than the 5-point swing we see between repeat checks. We keep the work live and keep measuring.
>
> Your first monthly payment of £99 is on 16 November 2026. It covers the work we keep doing every week to add another way for people to find you, for the rest of your 12-month minimum term. It is payment 2 of 12, counting the £99 you paid at sign-up, and nothing is charged after the 12th.
>
> Paul, findable

**B. Not gone up — inside the noise band (Optimise client)**

> Subject: Your four-week results — Calder Plumbing and Heating
>
> Hi,
>
> Four weeks ago we measured how often ChatGPT and Gemini named Calder Plumbing and Heating when people asked the questions your customers ask in Halifax. We have just asked the same 20 questions again, on the same engines.
>
> Before: named in 12 of 120 answers (10%).
>
> After: named in 15 of 120 answers (13%).
>
> The full before-and-after, question by question, is here: https://findable.live/r/ABC123
>
> Your number has not gone up. The change is inside the 5-point swing we see between repeat measurements with no work done, so we count it as no movement.
>
> That means the guarantee applies. If that number has not gone up, email us within 14 days of your results and we'll refund your £99. A valid claim also ends your monthly payments: if the first one has not been taken yet, it never is, and if it has already been taken, we refund it as well.
>
> Your first monthly payment of £99 is on 16 November 2026. It covers the work we keep doing every week to add another way for people to find you, for the rest of your 6-month minimum term. It is payment 2 of 6, counting the £99 you paid at sign-up, and nothing is charged after the 6th.
>
> Paul, findable

**C. Not gone up — outside the band (it fell; no subscription date on record)**

> Subject: Your four-week results — Calder Plumbing and Heating
>
> Hi,
>
> Four weeks ago we measured how often ChatGPT and Gemini named Calder Plumbing and Heating when people asked the questions your customers ask in Halifax. We have just asked the same 20 questions again, on the same engines.
>
> Before: named in 20 of 120 answers (17%).
>
> After: named in 8 of 120 answers (7%).
>
> The full before-and-after, question by question, is here: https://findable.live/r/ABC123
>
> Your number has not gone up.
>
> That means the guarantee applies. If that number has not gone up, email us within 14 days of your results and we'll refund your £99. A valid claim also ends your monthly payments: if the first one has not been taken yet, it never is, and if it has already been taken, we refund it as well.
>
> Paul, findable

**The results page's "what this means"** — gone up: "Calder Plumbing and Heating is named more often than it was
four weeks ago, on the same questions and the same engines." / "We keep the work live and keep measuring." Not gone
up: the same "has not gone up" sentence(s) and the same claim paragraph as the email.

**Three wording points for Paul (not changed — the copy is his to approve):**
1. "the work we keep doing **every week** to add another way for people to find you" — your 2 Oct monthly wording is
   "a new page each month, a monthly AI visibility check, adjustments, hosting / looking after the site".
2. The sign-off reads "Paul, findable" (lower-case f).
3. In B, the claim paragraph says a valid claim ends the monthly, and the next paragraph gives the monthly's date.
   Both are true; read together they may want one joining phrase ("If you don't claim, …").

---

## 7. Six-week billing — determination

**Six weeks is the live, coded billing start. Wording kept everywhere.**
- `FINDABLE_MONTHLY_DELAY_DAYS = 42` (`src/lib/findableOffer.ts`), "exactly six weeks after the successful £99 signup
  payment"; `firstRecurringPaymentIso()` is the one calculation.
- `_shared/delayed-subscription.ts` sets Stripe's `trial_end` from that same function, with `cancel_at` after
  11 (Build) / 5 (Optimise) recurring charges — so the date a client is told and the date Stripe charges are one sum.
- Paul's decisions recorded in the code: 2026-09-18 (subscription moved to sign-up), 2026-09-23 ("Billing stays six
  weeks from sign-up"; payment 2 can fall inside the claim window — `GUARANTEE_PAYMENT_TWO_SENTENCE`), 2026-09-29
  (route counts 12 / 6).
- findable-site says the same (`site.ts`, `/pricing`, `/refunds`, `OnboardingFlow`), and the cross-repo sync check
  holds the shared sentences equal.
- Not verified against Stripe itself or the deployed function body (no Stripe access, no deploy-body read in this
  session). The first genuine payment remains a watched event.
- ⚠️ CLAUDE.md §1's older line ("starting the day the claim window closes", the £29.99 tiers) is stale history; the
  code above is the authority.

---

## 8. Migrations — order and audit

Apply **one at a time, in this order, each read back** (nothing was applied in this session):

| # | File | Owner | Kind | Notes |
|---|---|---|---|---|
| 1 | `20261006010000_templates_owner_only.sql` | WS-1 | drops one policy (`sales_select_templates`) | Removes access only. Show Paul. |
| 2 | `20261006010100_inbound_lead_candidates.sql` | WS-1 | new function, service-role only | Harmless while `whatsapp-status` is held. |
| 3 | `20261006020000_quick_close_link_sharing.sql` | WS-2 | widens `quick_close_events_kind_check`, `lead_activity_kind_check` from their LIVE lists | Re-read the live lists first if anything else widened them. |
| 4 | `20261007030000_payment_client_state.sql` | WS-3 | 5 columns, 1 CHECK, re-creates `monthly_update_save` / `_mark_sent` | Sorts after `20261006100000` by design. |
| 5 | `20261007040000_audit_budget_pools.sql` | WS-4 | `enrichment_usage.budget_pool` | Additive. |
| 6 | `20261007040100_onboarding_service_truth.sql` | WS-4 | `services_not_offered`, `top_requests` | **Before** paid-client-hub / findable-onboarding / paid-baseline (they select these). |
| 7 | `20261007040200_remeasure_date_guard.sql` | WS-4 | trigger on `outreach_leads` | Show Paul. Touches no existing date. |
| 8 | `20261007105000_call_workspace_guards.sql` | WS-5 | drops + re-creates `lead_set_follow_up` (7th arg), two call-log functions | Show Paul. **Before the SPA** (it sends `_expected`). |
| 9 | `20261007200000_first_contact_activation.sql` | integration | `first_contact_owed_since` | **Before** stripe-webhook / paid-client-hub / quick-close (client-setup selects it). |

Audit: no two migrations touch the same object except #4 re-creating two functions from `20261006100000` (intended,
sorted after it). Only #3 changes allowed-value lists, and nothing later re-types them. #1 and #8 drop and #7 adds a
trigger — the three to show Paul. No historical migration was edited. `supabase/tests/quick-close.sql` still calls
the old `quick_close_claim_link` RPC (WS-2's note; unused by the code, left in the database).

---

## 9. Visual QA — Website Build (WS-6 never rendered it)

The real `WebsiteBuild` page, in a throwaway Vite harness: `MemoryRouter`, the edge invoker and Supabase client stubbed,
a fixture client "ZZ QA Brookfoot Plumbing" (Build, bespoke route; an Optimise variant). No live data, nothing
deployed, harness deleted. Screenshots were taken in the Browser pane (some timed out while the window was hidden;
text, DOM and layout checks were used for the rest). **Nobody but this session has looked at it.**

| Checked | Result |
|---|---|
| Overlapping panels / sideways scroll | None at 1366 px or 375 px on Intake, Architecture, Build pack, Preview, Live (document width = viewport). The page-plan table scrolls inside its own box on a phone. |
| Forms readable | Yes. Labels, placeholders and buttons legible in the dark theme. |
| Production gate ("Cleared for production?") | Shows NOT YET with every reason in words; production ticks are disabled. Clear, but long (13 lines on the fixture). |
| Asset inputs | Adding a link + description + "client owns this" saved an asset `approval: approved, ownership: client_owned, origin: client`. |
| Location notes | The location page without a note is a named build blocker and shows its own warning in the Notes column. |
| Corrections panel | Present on the Preview step with the CTA field and "Copy Corrections Prompt". |
| Form switch | "Switch the form on" saved `{enabled, site_key from the project, recipient = the verified email}`. |
| Optimise blocked | Red banner "Findable Optimise client — Website Build is switched off…"; every stage prompt disabled; the form switch disabled with its reason; the assets panel hidden. |
| Unconfirmed service (new) | Amber line "Not confirmed by the client: Underfloor heating…" on the Build pack step. |
| Console | No errors. |

Observations (not fixed, minor): for Optimise the **"Copy Retry Prompt" button stays enabled** — it would copy only the
refusal sentence, not a prompt (cosmetic). The Build pack page is long on a phone (the assets panel is ~8,300 px down).

---

## 10. Tests

- **`npm run check`** (with `FINDABLE_SITE_DIR` at the findable-site integration branch): typecheck **9 errors = the
  baseline list**, edge syntax OK (466 files), edge names OK (67 entrypoints), import graph 0 faults, production build
  OK, **308 / 308 suites**. Run without `FINDABLE_SITE_DIR` (findable-site `master`), `manual-onboarding` fails until
  findable-site's branch merges — expected (the questionnaire wording lives there).
- Raw six-way merge before any integration change: 306 / 307 (the same cross-repo case).
- **New: `scripts/wave1-integration.test.ts`** — the 15 scenarios Paul listed (header of the file), through the real
  functions; 94 assertions. Mutation-checked: removing the new-work fix, the site-truth filter, the row-status signal
  or the activation-stamp check each makes it fail.
- **Deno-free strict type pass** (tsc, Deno / URL-import shim) over all 67 edge entrypoints, integration vs `main`:
  no new error except a shim artifact (a type-only import from an `esm.sh` URL in `site-enquiry`). One real new error
  was found in the integration's own page-generator edit and fixed. Deno itself is not installed; the deploy remains
  the real gate.
- **findable-site** (integration branch): `astro build` OK; `domain-authority`, `entity-profiles`, `site-access`,
  `draft-completeness`, `email-tld`, `onboarding-steps`, `pay-footnote` pass. `offer-terms` (the "eight-week" check)
  and 3 `astro check` errors fail on `master` too (pre-existing, WS-4 recorded the same).

---

## 11. Remaining blockers and decisions

**Before any deploy:**
- Paul: approve the migration list in §8 (show #1, #7, #8 especially).
- Paul: the WhatsApp hold stands — no `whatsapp-status` deploy until the Findable Meta App + App Secret exist.

**Paul actions (no code):**
- Apify monthly cap → ~$100 (or confirm) before bulk-audit rollout.
- Approve (or edit) the results email copy in §6, then flip `REMEASURE_RESULTS_COPY_APPROVED`.
  ⛔ RG's results were due 2026-10-06 (pinned date) — RG is refunded; check the sender's view of RG before flipping.
- Deactivate the two old Stripe Payment Links (WS-1 §4.2). Look once in Stripe for any subscription / schedule on
  MCL's customer (WS-3).
- Vault deletion at deploy time (§5.7).

**Known, not fixed here (owners named):**
- WS-4: `questionScope` verb forms ("fixes", "fitted", "leaking") read as unsupported (§3.5).
- WS-6: Optimise "Copy Retry Prompt" enabled (cosmetic).
- WS-1 later items (M-050, M-051 — the QA e-mail sink is suppressed, so WS-2's "Email the link" cannot be QA'd on a
  fixture until Paul clears it — M-055).
- No "after" SEO scan exists yet (§3.3).

---

## 12. Deployment order (for the deploy session — none of this was done)

0. Merge `integration/pre-sales-wave1` → `main` (`--no-ff`, prove `origin/main` unmoved first); findable-site
   `integration/pre-sales-wave1` → `master` likewise. Deploy only from merged `main` / `master`, never chained after a push.
1. **SQL** — §8, in order, each read back (Paul shown #1, #7, #8).
2. **Edge functions** — from `main`, after the SQL. The closure of every changed file (`check-import-graph --reached-by`),
   **minus `whatsapp-status`**:
   `admin-overview backfill-lead-towns business-summary check-website client-agreement conversation-triage crawl-check
   create-ai-audit enrich-business extract-competitors findable-checkout findable-onboarding market-view niche-sample
   notify-onboarding-submit page-generator paid-baseline paid-client-hub process-ai-audit-queue process-whatsapp-queue
   prospect-preview quick-close render-audit-report render-remeasure-results render-welcome-pack run-seo-scan
   sales-earnings sales-performance scan-site-details security-admin send-whatsapp-message site-enquiry stripe-webhook
   submissions voice-note-script warm-lead-reply weekly-visibility` (37).
   Order inside: `stripe-webhook`, `paid-client-hub`, `quick-close` only after SQL #4 and #9; `findable-onboarding`
   before findable-site; `site-enquiry` before any record switches a form on.
3. **SPA** — push `main` (Cloudflare Pages). After SQL #8 (`_expected`).
4. **findable-site** — `npm run deploy` from a clean `master` worktree with `--branch=master`, after `findable-onboarding`.
5. **Verify** with markers only the new code has: `crawl-check` body contains `salesCrawlIdsRefusal`; `site-enquiry`
   OPTIONS returns `x-site-enquiry-build: site-enquiry-registry-1`; `stripe-webhook` body contains
   `stampFirstContactOwed`; `quick-close` body contains `quickCloseClosedRefusal`; `page-generator` body contains
   `measuredQuestionRefusal`; the SPA chunk for Website Build contains "Not confirmed by the client".
6. **Held:** `whatsapp-status` — deploy only after the Findable Meta App Secret is set and one genuine reply is seen
   landing on the old code (WS-1 §5). Then verify `judgeWhatsAppWebhookPost` in its body and an unsigned POST → 401.
7. **Vault** deletion (§5.7). 8. First genuine payment = a watched event (lead, ledger, `subscription_claim`,
   `first_contact_owed_since`, subscription, agreement — within the hour).

---

## 13. Session 7 (WS-7, salesperson bulk checks)

WS-7 needs WS-1's crawl-check rule and WS-4's budget pools. Both are on this branch, integrated and tested. **Session 7
can start now, branching from `integration/pre-sales-wave1`** (not `main`, which has neither), and rebasing onto
`main` once this merges. Its rollout still waits for this deploy and Paul's Apify cap.
