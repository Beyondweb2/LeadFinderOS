# Client sign-up → agreement → payment redesign (2026-10-06/07)

Branches: LeadFinderOS `improve/client-signup-agreement-flow`, findable-site `improve/client-signup-agreement-flow`.
Brief: Paul's "Redesign the client signup / onboarding / agreement / payment flow".

## 1. The journey before

Two entry paths, both ending on the same agreement page:

| Path | Steps |
|---|---|
| Self-service (`findable.live/onboarding/<slug>/?lead=<id>`, or no lead) | intro ("Be the X AI recommends locally") → details → (business, trade/town if unknown) → website panel that **opened with the price** ("£99 today, then £99/month from…") and asked "Are we using an existing domain?" / "Does an agency look after your website?" / access → domain pages (new site only) → permission → "Run my check" → plan screen with a **3rem £99 headline**, the list "In your £99" incl. **"A brand new website if you want one"** for everyone → Get started → `findable-checkout` → (unsigned) `findable.live/agree/<token>` |
| Sales (Quick Close) | rep answers Quick Close → `findable-checkout purpose:signup_link` → rep sends `findable.live/agree/<token>` |

Agreement page (`client-agreement` fn, `agreementPageHtml.ts`): light theme, offer line, full v3 agreement, form, 3 ticks, "I agree and sign", then "Continue to secure payment" → `findable-checkout purpose:pay` → Stripe. Gate `checkoutAgreementGate` (signupGate.ts); webhook backstop holds unsigned payments.

Authoritative records: plan = `onboarding_responses.plan_tier` (+ `website_addon`) via `serviceRouteFromRow`; signature = `client_agreement_acceptances` (write-once, text + SHA-256, IP, UA, onboarding_id, authority, terms); payment link to signature = `client_service_terms.agreement_acceptance_id` (webhook, once per lead); seller = `sale_creations` (creator of the paid sign-up). The signed PDF is rebuilt from the evidence row (never stored as a file).

## 2. The journey now

Self-service: **intro** "Let's get Findable set up for [Business]" + "We already know some of your details…" + 4 steps (details & website → plan → agreement → payment), **no price** → details → website (choice-first) → domain pages (Build only) → permission → **"See my plan"** → plan screen: **plan name, what's included (per plan), every month after, your first four weeks, guarantee (compact)** on the left; **What you pay** summary (Your plan / Today / Then / Minimum term / After the term) + access tick + **Get started** ("Next: read and sign your agreement. Payment comes after.") on the right → "Opening your agreement." → agreement page.

Agreement page (redesigned, same legal content): Findable dark theme; steps 1 Check your plan · 2 Sign · 3 Secure payment; "Before we take payment, please read and accept the Client Service Agreement."; plan summary + **Agreement date (the UK day you sign) + version**; full agreement in a scroll reader; details form pre-filled; the three ticks (unchanged sentences); "I agree and sign" greyed until both required ticks; a visibly **locked "Continue to payment"** (no pay control exists before signing); after signing, "Continue to secure payment".

Sales-held sign-up (new, `src/lib/salesSignup.ts`): if the lead's newest unpaid row is a Quick Close row, the self-service page shows **that** plan and continues on **that** row ("See my plan" → plan → Get started → agreement); if Quick Close isn't releasable yet it says the contact is finishing set-up. The server refuses a competing self-service submit (`409 signup_in_progress`) — the plan can't be silently changed and the seller stays the creator of the paid sign-up.

## 3. Questions

Removed / changed before payment: the price box inside the website panel; "Are we using an existing domain?" (replaced by a per-choice web-address question); the agency-first question order; "No, or I'd rather not ask them" silently becoming a build. Kept: name, email, mobile, website (pre-filled from Google), business/trade/town only when unknown, the domain authority pages (Build only), permission. Post-payment Q2 untouched.

Website questions now asked:
1. Choice: **Build me a new website** (Recommended) · Keep and improve my current website · I haven't got a website yet.
2. Build: Who looks after your current website? (I do / An agency or web company — "we only need their help to point your web address at the new site; your arrangement with them stays yours") + **Do you want to keep your current web address?** with "Your web address (domain) is separate from your website… your current site is a reference, not the base."
3. None: Do you already own a web address?
4. Keep: Who looks after your website? → Can you give/get us access to edit it? (agency email optional). **No access → not answered**; "We can only improve a website we can edit… Build me a new website instead" (an explicit choice, never a silent switch).
Mapping: `branchFromChoice`/`choiceFromBranch` (findable-site `siteAccess.ts`, ported to `manualOnboarding.ts`) onto the same three stored answers, so `needsNewWebsite` / `plan_tier` / `website_addon` and checkout are unchanged.

## 4. Build vs Optimise

Build list: measured first; **a new website built so customers, search engines and AI understand exactly what you do and where you work**; service/location pages from real customer questions; technical setup and hosting; GBP improved once access given; NAP consistent; re-measured at four weeks. Monthly: check + updates, hosting, monthly update.
Optimise list: the **current** website improved; pages added where questions show demand; technical fixes; GBP; NAP; re-measured. No new website promised. No "if you want one", no "public evidence", no "AI quotes", no score.

## 5. Commercial terms — CONFLICT (not resolved here)

Paul's brief: Optimise = six £99 payments then **no** £29.99 continuation. **Live main = agreement v3**: Optimise 6 payments **then £29.99/month continuing service until cancelled (clause 9A)**, on both routes. The "Optimise stops after six" terms are agreement **v4**, on unmerged branches (`improve/sales-script-commercial-alignment`, findable-site `commercial/optimise-six-payments`), awaiting Paul's approval of v4 wording. This redesign **did not change any term**: every figure is rendered from the existing constants, and the agreement-page summary is keyed to the version (`planSummaryRows(route, 'v3')`; any other version gets no summary rather than guessed terms). When v4 ships, `signupSummary.ts` needs its v4 rows.
Also noted, unchanged: the welcome pack's key points omit the v3 £29.99 continuing service.

## 6. Pre-fill, acceptance, dates

Agreement page pre-fills: contact name (sign-up row, else lead `contact_name`), email (sign-up, else lead), phone, address, website domain (lead). Findable's details are in the agreement itself. Not pre-filled (not invented): legal name, role, company number. The onboarding prefill still withholds email/contact name (capability-URL rule; the agreement link is where private details are shown).
Acceptance (unchanged mechanism): required authority tick + required agree tick (Paul's sentence) + optional marketing opt-out, typed name/role, stored write-once with agreed text + SHA-256, version, route, onboarding id, IP, UA, terms. Signing date = database `accepted_at` (PDF "Date" = UK day of it); the page previews today's UK day (`nowIso` = server now, `signingDayWords` Europe/London).

## 7. Payment gate and linkage (unchanged, re-proved)

`findable-checkout` reads plan from the row, price from `offerPrice()`; the gate refuses unsigned / other client / other sign-up / other route / no authority / tampered text. Webhook: v3 verdict or HOLD; `client_service_terms` upsert `ignoreDuplicates` ties the payment to `agreement_acceptance_id` once; intake trigger as before.

## 8. Paid Clients and welcome pack

`src/lib/signedAgreement.ts` `signedAgreementRecord()` — one fold of acceptances + terms row, used by `paid-client-hub agreement_status` (`record`) and `_shared/welcome-pack-render.ts`. Paid Client page: **AGREEMENT · Signed · date · version · plan**, "By name, role", "Tied to their payment of <date>", **View agreement** (opens the PDF) and **Download PDF**. Welcome pack: accepted line + "Plan · Agreement version · First payment" + "Download your signed agreement (PDF)" (`/agree/<token>?pdf=1`). No new welcome-pack delivery system was built.

## 9. Tests

`scripts/client-signup-agreement-flow.test.ts` (A–P where code can prove it), updated `manual-onboarding.test.ts` (choice-first parity), `paid-client-hub-resilience.test.ts` (columns read back live 2026-10-07), `client-copy-claims.test.ts` (+ signupSummary.ts). findable-site: pay-footnote, offer-terms, agreement-v3, site-access, domain-authority, onboarding-steps, draft-completeness all pass. Visual: headless Edge at 1440 and 390 — intro, website (build / keep-no-access), plan (Build, Optimise), agreement (Build, Optimise, signed): no horizontal overflow; sign button disabled until both ticks; Get started disabled until the access tick.

## 10. Deploy

No migration. Functions: `findable-onboarding`, `client-agreement`, `paid-client-hub`, `render-welcome-pack` (+ any other function reaching `_shared/welcome-pack-render.ts`). Never `whatsapp-status`. findable-site deploy from a clean origin/master worktree with `--branch=master`.

## Deferred

- v4 commercial terms (Paul's decision + wording approval) and the matching v4 summary rows.
- Welcome pack key points: add the continuing service line for whichever version applies.
- Paid Clients list column for agreement status (detail page only today).
