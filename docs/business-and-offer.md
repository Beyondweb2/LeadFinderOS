# The business, the price, the guarantee, the site origin, the report CTA

*Records moved out of CLAUDE.md on 2026-09-16. CLAUDE.md holds the rules; this holds the story. Sections keep their original numbers and text. Read this when you are about to touch the thing it describes.*

> Moved from CLAUDE.md §1 on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.

## 1. What the business is

- Paul sells **AI visibility** to local UK businesses. **£99, one-off, ONE FLAT PRICE FOR EVERYONE**
  since 2026-09-12 — the founder-vs-full split stays deleted (history £49.99 → £99 on 2026-08-04 →
  flat £49.99 on 09-03 → **flat £99 on 09-12**). Price + guarantee wording live in
  **`src/lib/findableOffer.ts`** — one constant, shared by the SPA docs and the checkout/webhook
  edge functions. findable-site (separate repo) carries its own copy; changing either means a
  matching pass in the other, and `scripts/check-cross-repo-sync.mjs` fails the build on any drift.
  ⚠️ **THIS BULLET SAID "£49.99 … and £99 is charged to nobody" FOR NINE DAYS AFTER THAT STOPPED
  BEING TRUE**, which is the exact inversion §0 warns about: confident prose describing the opposite
  of what the code does, on the first page anyone reads. The constants were right the whole time.
- **THE WEBSITE BUILD IS INCLUDED IN THE £99 SINCE 2026-09-12** — the separate £49.99 build line
  item is **deleted from `findable-checkout`** and `WEBSITE_BUILD_PRICE_GBP` is gone from
  findable-site. Ticking "build my site" now adds **hosting only**.
- **£9.99/month hosting** is the product's only recurring charge, live since 2026-09-03. A ticked
  checkout is still `mode: subscription` (one line now, not three): **£99 today, £9.99/month after**.
  Unticked is `mode: payment`.
- 🔴 **THE OFFER IS £99 TO START **AND** £29.99 A MONTH. ONE SHAPE, TWO HALVES (2026-09-14).** The
  £99 covers the measurement, the pages and the work to get them named; the £29.99 keeps them there
  — more pages every month, replying to their Google reviews, and watching the technical side of
  their site. It is **automatic and delayed**: a real Stripe subscription
  (`_shared/delayed-subscription.ts`) starting on the day the claim window closes, which is the
  four-week results **plus 14 days**.
  - ⛔ **THIS BULLET SAID "£49.99/month, OPTIONAL and COPY-ONLY, sent BY HAND as a Payment Link"
    UNTIL 2026-09-14** — wrong price, wrong shape, and wrong about whether code charges it. §0's
    exact failure: confident prose describing the opposite of what the code does, on the first page
    anyone reads. The constants were right the whole time (`FINDABLE_MONTHLY_GBP`).
  - ⛔ **NO SURFACE MAY NAME ONE FIGURE WITHOUT THE OTHER.** The whole product read as a one-off
    with something bolted on because every screen led with the setup fee: "Pay once" headlined the
    pricing section, the card showed £99 alone, /terms opened "for the one-off fee", the Stripe
    receipt said "4-week cycle", and the report told the one customer who also pays hosting that
    there was "nothing extra to pay". Swept 2026-09-14, both repos, §26.
  - ⛔ **BINDING COPY COUNTS FROM THE RESULTS, NEVER "week six".** Week six is results + 14 days
    only when the results land on day 28 — later whenever the replay holds, and **day 56 for RG by
    contract, whose second payment is week ten.** /terms, /refunds, the pay screen, Stripe and the
    emails all say "14 days after you get your results". The pricing TIMELINE may say "From week 6"
    because it states day 28 in the row directly above it.
  - ⛔ **NEVER CLAIM AN SEO SCORE.** "watch the technical side of your site so nothing slips" is the
    ceiling and is written into the comments as one: nothing measures a score, and site quality is
    tested NEGATIVE for being named by AI (§5).
  - ⚠️ **"Reply to your reviews" is a REAL promise since 2026-09-14** (Paul is doing it) and it
    needs the client's GBP access. Every surface used to say *help* replying. If that access ever
    leaves the flow, the word goes back to "help". Asking for a review is still the client's.
- Audit whether **ChatGPT and Gemini name them** when a customer asks for their trade in their town.
- Fix what AI reads: pages on **their own site**, a page per service per town, plus consistency in
  the sources the evidence says matter for that trade.
- **Re-measure at 4 WEEKS** (since 2026-09-03; it was 8).
- 🔴 **THE GUARANTEE IS NO LONGER WORK-BASED. SINCE 2026-09-12 THE REFUND IS CONDITIONAL ON THE
  MEASUREMENT GOING UP**, on Paul's instruction and confirmed by him on the record. It used to
  promise the audit + the work + the re-measurement and explicitly disclaim the outcome; it now
  says: we measure before we start, we re-measure after four weeks on the same questions and the
  same engines, and **if that number has not gone up, they email us within 14 days of their
  four-week results and we refund their £99.** (Wording as of 2026-09-13 — Paul cut "we will show
  you both sets of numbers": the four-week results ARE both sets. One constant now, 236 chars, §21.)
  - ⛔ **EVERY HEDGE WENT WITH IT** — "we do not promise you will be named", "the engines decide
    that", "anyone who promises it is guessing" are deleted from both repos. **Do not reintroduce
    one next to a conditional refund**: a promise with a disclaimer stapled to it reads as walking
    it back, which is worse than either wording alone. The old "never write copy that promises the
    outcome" rule is SUPERSEDED for the refund sentence specifically.
  - ⛔ **`findable.live/refunds` IS THE CUSTOMER-FACING AUTHORITY** and carries Paul's exact
    wording. Nothing on either site may contradict it; if the guarantee constant changes, that page
    changes in the same commit.
  - ⚠️ **The refund now turns on something we do not control**, so the four-week re-measurement has
    to genuinely run on the SAME questions — `audit-baseline.ts`'s stored set and §17's measurement
    lock are what make a claim adjudicable. Do not loosen them.
  - ⚠️ **£99 is written INSIDE the guarantee string**, so the promise and the price can now
    disagree with nothing throwing. `check-cross-repo-sync.mjs` asserts the text contains
    `FINDABLE_SETUP_PRICE_GBP` — that is why the check counts 10 now, not 9.
  - The functional half is **`REMEASURE_OFFSET_DAYS = 28`** (`src/lib/deliveryCockpit.ts`); the
    words are `FINDABLE_GUARANTEE` ("the re-measurement at week four"), byte-locked to
    findable-site's copy by `scripts/check-cross-repo-sync.mjs`.
  - ⛔ **RG LOCKSMITHS IS PINNED AT 8 WEEKS AND MUST STAY THERE.** He is the one **legacy
    OUTCOME-guarantee** client ("named in more AI answers after 8 weeks than today"), and the
    constant only supplies a default for a lead with **no stored `remeasure_due_date`** — his was
    NULL, so the change would have jumped his re-measure from 6 Oct to **8 Sep, five days after the
    change**. His +56 date is stored by hand. The 8-week references in `audit-baseline.ts` are
    **deliberately unchanged**: they describe what he was actually sold, and rewriting them would
    misrepresent an existing customer's promise. Ronnie already carried a stored date (2026-10-13).
- **TWO PAYING CUSTOMERS: RG Locksmiths and Ronnie.** (This line read "zero" until 2026-09-08 and
  was months stale.) Nothing is yet proven at scale — don't write copy implying a track record —
  but "no paying customer has ever…" is now a false premise. **Re-count before quoting a number**;
  `paid` is `amount_paid > 0` with two 2026-09-03 refinements (a floor, and churn) — see §11.
- 🔴 **DELIVERY WORKS EXACTLY TWO WAYS, AND SOME CUSTOMERS CANNOT BE SERVED.** Either their site is
  **WordPress and we can have access** (pages publish automatically), or **they let us move the site
  to our hosting**, copied as-is. Hand-editing Wix/Squarespace is ~15 min a page forever and does not
  work at £99. Since 2026-08-05 the questionnaire asks both (`website_platform`,
  `willing_to_migrate`) and **`src/lib/serveGate.ts` decides**: serve / flag / block.
  - **`findable-checkout` refuses a blocked row before creating a Stripe session** — that is the real
    block; the site's `CannotServePanel` is only presentation. `notify-onboarding-submit` derives the
    same verdict and labels the email, keyed off the **submitted row** (a blocked visitor never
    clicks pay, so keying off the checkout would miss them).
  - **A BLOCK ONLY FIRES WHEN WE ARE CERTAIN.** A skipped or `not_sure` platform, WordPress with
    unconfirmed access, and unrecognised column values all **flag, never block**. `no_website`
    **serves outright** — it is the best case (we build it on our hosting). 20 of 144 states block,
    all requiring an explicit `migrate = 'no'` **and** a known hand-edit platform.
  - ⚠️ **The verdict is DERIVED, never stored.** No `serve_decision` column — a stored verdict
    freezes old rows at a stale rule and lets the three callers drift.
  - ⚠️ **findable-site carries a hand-kept MIRROR at its own `src/lib/serveGate.ts`.** Change both.
    Diff the two `serveDecision` bodies; they were byte-identical (3635 chars) on 2026-08-05.

---


---

> Moved from CLAUDE.md §11 on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.

## 11. 🔴 THE PRICE — ONE FLAT £99 SINCE 2026-09-12, PLUS THE HOSTING SUBSCRIPTION

🔴 **THE PRICE MOVED AGAIN ON 2026-09-12: £49.99 → £99, AND THE BUILD IS NOW INSIDE IT.** This
section was written on 09-03 and its first line said "one flat £49.99 … £99 is charged to nobody" —
the exact opposite of today. Read this preamble before anything below it, and treat the rest of the
section as the reasoning rather than the current figures.

**WHAT IS TRUE TODAY (verified against the constants, not the prose):**

| | |
|---|---|
| `FINDABLE_SETUP_PRICE_GBP` | **99** — charged and displayed, one-off, everyone |
| The website build | **included in the £99.** `FINDABLE_WEBSITE_PRICE_ID` is no longer read by `findable-checkout` at all |
| Hosting | **£9.99/month**, `FINDABLE_HOSTING_PRICE_ID`, the only line the tick now adds |
| Continuing work | 🔴 **£29.99/month, AUTOMATIC, `FINDABLE_MONTHLY_GBP`** — a delayed Stripe subscription starting on the results + 14 days. ⛔ This row said "£49.99, OPTIONAL, copy-only, no code path bills it" until 2026-09-14; every clause was wrong. §1 |
| The guarantee | **outcome-conditional**: if the measured number has not gone up at four weeks, they email **within 14 days of their four-week results** and the £99 is refunded (wording of 2026-09-13, §21) |

- ⚠️ **THE SECRET IS NOT DELETED, ONLY UNREAD.** `FINDABLE_WEBSITE_PRICE_ID` still exists in the
  Supabase secret list deliberately: it is the Stripe account's record of what earlier customers
  were charged, and removing it would orphan their invoices. Nothing will add it to a session again.
- ⛔ **DEPLOY ORDER ON 09-12 WAS DISPLAY-BEFORE-CHARGE, because the price ROSE.** findable-site went
  first, so any gap read "shown £99, charged £49.99" — a pleasant surprise. The 09-03 note below
  inverted it for the same reason in the other direction. **Always ask which way the gap
  embarrasses you**; that is the rule, not the order.

<details><summary>THE 09-03 FLAT-£49.99 ERA — superseded by the table above, kept for the reasoning</summary>

**1. THE FOUNDER-VS-FULL SPLIT IS GONE. Everyone pays `FINDABLE_SETUP_PRICE_GBP` = 49.99, one-off,
whatever they arrive from** — their report, the homepage, or a cold link. £99 is charged to nobody.
- **What the split used to do, because it is worth knowing it no longer does:** the price was
  derived PER LEAD — founder when the lead had a **completed audit** and had not paid, full
  otherwise. That rule was **non-forgeable** (you cannot fake having an audit) and separated warm
  from cold arrivals for free. It also cost three queries a render, and it is why a **lead-less
  visitor could not be charged at all** (`no_lead_attribution`).
- ⛔ **`offerPrice()` SURVIVES EVEN THOUGH IT RETURNS A CONSTANT — DO NOT INLINE IT.** Its value
  was never the branching: it is that the plan card and the Stripe session call the SAME function,
  so display and charge cannot diverge. Inlining the constant at both call sites rebuilds the
  two-constants-in-two-repos drift it exists to end. It is **no longer async and takes no database
  handle** (a "just in case" async signature would have left three dead queries' plumbing behind
  and invited someone to put a lookup back without asking why it went).
- **`founderOffer.ts` IS NOW `src/lib/buyOffer.ts`**, `showFounderOffer` → **`showOffer`**, and the
  four pitch constants ("the first 10 at £49.99", "normally £99") are deleted along with the report's
  offer block, which was already unrendered. ⚠️ **Some comments still name the old file and the
  deleted constants** — `useDashboardMetrics.ts`'s sync note is one. Grep, don't trust the prose.
- **SIGN-UP NO LONGER NEEDS A `?lead=` TAG.** With no lead the pre-payment screen asks business
  name, trade and town **and only then** (a tagged visitor already has all three; re-asking implies
  we lost their details at the moment they decide to pay). `findable-onboarding`'s lead-less branch
  gained a **`signup` source** that creates the lead through the SAME `createFreeCheckLead` — same
  dedupe, same fail-closed reads, same three-guard place resolution — **skipping the free-check
  daily cap**, because refusing someone trying to PAY on a guard against strangers' free checks
  turns a spend cap into a lost sale. It fires no free audit; the paid baseline measures instead.
  The **trade is not vanity data**: `startPaidBaseline` refuses with `no_business_type` without one
  on the lead, so asking after payment would mean selling a guarantee we cannot measure.
- `paid_for` was "Findable - Setup + first 2 months" (wrong for a one-off) → **"Findable - AI
  visibility, first cycle"**.
- ⛔ **DEPLOY ORDER INVERTED ON PURPOSE, AND THE RULE IS THE PRINCIPLE, NOT THE ORDER.** §11's rule
  below says display before charge — right when a price **RISES**. This one **FELL**, so charge went
  first and the gap read "shown £99, charged £49.99", a pleasant surprise. Reversed, it would have
  shown £49.99 and charged £99. **Ask which direction the gap embarrasses you in.**

**2. RECURRING BILLING EXISTS NOW — the website add-on, £49.99 build + £9.99/month hosting.** The
"scoped but not built" note further down is superseded; what it flagged as the real blocker was
right and was fixed here.
- **THE TICK IS READ FROM THE ROW, NEVER THE REQUEST.** `onboarding_responses.website_addon`, saved
  at submit; `findable-checkout` reads it **from that row** and never from its own body. The
  standing rule on that endpoint is that **the browser never decides money** — there is no parameter
  through which a discount can be asked for, and there must be none through which a £59.98 upsell
  can be either. It is also what makes the row the record of what the customer bought, which
  delivery reads and a receipt must still agree with months later. **Strictly `=== true`**: null,
  absent, `"false"` and `0` all mean not ticked — absence is never a purchase.
- **THE SESSION.** `mode: "payment"` cannot carry a recurring price, so a ticked checkout becomes
  **`mode: "subscription"`** with three lines — AI £49.99 one-off, build £49.99 one-off, hosting
  £9.99/month — and Stripe bills the one-offs on the first invoice. One card entry, **£109.97
  today, £9.99/month after**. Unticked is unchanged.
- ⛔ **THE AI LINE STAYS INLINE `price_data`, AND THAT IS THE GUARANTEE'S ONLY CARRIER.** It is the
  only branch with a `description`, and the description is `FINDABLE_GUARANTEE` verbatim — a
  dashboard Price ID would drop the guarantee text silently (the `FINDABLE_SETUP_PRICE_ID` trap
  recorded below). The two new lines use **Price IDs precisely because they carry no guarantee to
  lose**: Paul's decision — the guarantee is AI-visibility only, the build is a delivered product,
  hosting is a cancellable service. **If it is ever claimed: refund the £49.99 AI portion and cancel
  the hosting; do not refund the build.**
- ⛔ **THE ADD-ON PRICES LIVE IN STRIPE, NOT IN THIS REPO** — `FINDABLE_WEBSITE_PRICE_ID` and
  `FINDABLE_HOSTING_PRICE_ID` are secrets holding Price ids, so **no script can check those two
  amounts**. They are a third and fourth hand-kept copy alongside the Payment Link.
- 🔴 **BOTH IDS WERE FIRST SET TO PRODUCT IDS (`prod_…`) AND THE WHOLE CHECKOUT DIED** — Stripe 400
  `resource_missing`, "No such price", a dead Buy button at the moment someone decides to pay. The
  dashboard shows a product's id far more prominently than its price's and the two look alike, so
  **this is the expected paste error, not an unlucky one.** An unusable id is now treated as an
  **unset** one: the add-on drops and the AI line still sells (a customer who wanted a website and
  got only the audit is a phone call; one who could not pay at all is gone). The refusal names the
  **SHAPE** of the bad value ("a PRODUCT id (prod_) — needs the PRICE id") and never its contents.
- **THE WEBHOOK GAINED THREE EVENTS THAT DID NOT EXIST**: `invoice.paid`,
  `invoice.payment_failed`, and Findable branches on `customer.subscription.updated/deleted`.
  Before this a Findable subscription event was **invisible** — both subscription handlers read
  `metadata.generated_site_id` (the BARBER product) and `setPaid`'s empty-id guard logged "skipped",
  so a renewal, a dead card and a cancellation were all silent. The barber path is untouched; the
  discriminator is which metadata is present.
  - ⛔ **THE LEAD IS RESOLVED BY `stripe_subscription_id`, NEVER BY METADATA. An INVOICE does not
    inherit subscription metadata**, so keying on metadata would have worked for the subscription
    events and **silently failed for the renewals — the ones that matter.**
  - ⚠️ **`past_due` IS DELIBERATELY NOT CANCELLED.** Smart Retries is still running: that customer
    has a card problem, not a decision.
  - The Stripe ids are written in a **separate non-fatal update after the payment** — the payment
    write must never be able to fail on a column newer than itself.
- ⛔ **`paid` NEEDED TWO REFINEMENTS AND THE OLD EXACT-MATCH TILE WOULD HAVE HIDDEN AN ADD-ON
  CUSTOMER** (`useDashboardMetrics.ts`, pinned by `scripts/paying-customer.test.ts`):
  1. **A FLOOR, NOT AN ENUMERATION.** The tile matched `amount_paid` against `[49.99, 19.99]`
     exactly, so £109.97 vanished — a paying customer reading as no sale. It is now **at or above
     `PAYING_FLOOR_GBP`**, which is **derived** (`Math.min` of the current and historical prices),
     never typed. Enumerating valid totals (49.99, 99.98, 109.97, …) fails invisibly the first time
     an add-on, discount or proration lands outside the list.
  2. **CHURN IS A POSITIVE MATCH ON `canceled` / `incomplete_expired`** (`DEAD_SUBSCRIPTION_STATUSES`).
     `paid = amount_paid > 0` is one scalar and cannot express "bought once, hosting since
     cancelled". ⚠️ **Absent is NOT cancelled** — a one-off customer has no subscription and no
     status at all and must keep counting, so it is never `!== 'active'`.
- ⚠️ **`decideGuarantee` NOW COMPARES AGAINST A PRICE THAT HAS FALLEN TO THE EXACT AMOUNT THAT USED
  TO MEAN "LEGACY".** `src/lib/baselineContract.ts` decides the outcome-vs-work guarantee from
  `paid < currentPriceGbp`; that was written when the current price was £99, so "below current" meant
  **the legacy £49.99 sale**. At a flat £49.99 a legacy £49.99 client whose contract is written
  **from now on** grades as `work` instead of `outcome`. Frozen contracts are unaffected (it is
  decided ONCE at baseline time, deliberately), and RG at £19.99 still grades `outcome` — so this is
  a latent fault, not a live one. **Before relying on either paying client's guarantee kind, read
  the STORED contract rather than re-deriving it.**
- ✅ **STRIPE'S OWN RESPONSE IS THE ONLY WAY TO VERIFY AN ITEMISATION.** `amount_total` is now
  recorded from the create-session response (non-fatal, written after the session exists). The
  hosted page is a JS-rendered shell — fetching it yields no amount, no line items and not even the
  product name (§6 records the same finding when the guarantee's length was checked). That is how
  the mixed one-off + subscription shape was finally confirmed: ticked `mode=subscription`
  `amount_total 10997`, unticked `mode=payment` `4999`. **From Stripe, not from our arithmetic.**
- ✅ **A REFUSED CHECKOUT IS NOW DIAGNOSABLE: refusals land in `client_error_reports`**, not only
  `console.error`. **The CLI has no `functions logs` subcommand**, so without a table there is
  nothing to read afterwards — a payment Stripe rejected left one edge-log line and a bare
  `checkout_failed` at the client. §4's "a catch-all error message is worse than no message", on
  the one path carrying all the revenue. The message is **stored, never returned**.

</details>

---

<details><summary>THE FOUNDER-PRICE ERA (£19.99 → £49.99, 2026-08-12) — superseded by the flat price above, kept for the reasoning</summary>

- ✅ **THREE CODE CONSTANTS, AND ONE COMMAND PROVES THEY AGREE.** `FOUNDER_PRICE_GBP`
  (`_shared/offer-price.ts`, **CHARGED**), `FOUNDER_OFFER_PRICE_LABEL` (`founderOffer.ts`, what the
  report SAYS), `FOUNDER_PRICE_GBP` (`useDashboardMetrics.ts`, what is COUNTED). Run
  **`node scripts/check-cross-repo-sync.mjs`** — it fails on any drift and passed 8/8 at 49.99.
  ⚠️ Two of those three have since moved: the label constants are deleted and `founderOffer.ts` is
  `buyOffer.ts`. The script now runs **9 checks** and still guards the price and the guarantee.
- ⛔ **TWO COPIES NO SCRIPT CAN REACH, AND BOTH ARE PAUL'S BY HAND:**
  1. **The Stripe Payment Link** (kept for sending manually on WhatsApp) — its amount AND its
     description. A stale amount here means a hand-sent link charges the old price.
  2. **The Meta-registered `re_engage` template.** The string in `_shared/whatsapp-send.ts` is
     DISPLAY-ONLY — Meta renders the real message from its own copy.
     ✅ **THE £19.99 DRIFT IS CLOSED — re-registration CONFIRMED by Paul in WhatsApp Manager,
     2026-08-17.** The registered body is the £49.99 version; re_engage is cleared for sends.
     ⚠️ **A smaller display drift replaced it:** Meta's registered wording says "A few quick
     questions and we're up and running" where the code's Inbox display copy says "Five quick
     questions and we're started". Affects only what the OPERATOR reads in the transcript, never
     what the prospect receives. Fix by pasting the full registered body from WhatsApp Manager
     into `reEngageBody` — do not guess the rest of the wording from the one confirmed sentence.
     The lasting rule stands: this copy changes at Meta BY HAND whenever the price moves.
- ⚠️ **THE DASHBOARD FOUNDER TILE WENT 1 → 0 AND NOTHING IS WRONG.** It counts leads whose
  `amount_paid` matches the CURRENT constant within a penny, so RG Locksmiths (£19.99, the only
  payment ever taken) stopped counting the moment the constant moved. No data changed. If that tile
  should count every founder-era sale it needs a list of historical prices, not one constant —
  Paul's call, deliberately not made here.
- ✅ **Checked before changing it: no lead has EVER been charged £49.99** (exactly one lead has a
  non-null `amount_paid` at all). So the new value sweeps nothing historical into that counter —
  which mattered, because the comment there used to justify the exact match by saying it kept out
  "the £49.99 quote that predates this offer". That reasoning inverted; the comment was rewritten
  rather than left to mislead.
- ⛔ **DEPLOY ORDER IS A PRICE GUARD, NOT A PREFERENCE: DISPLAY BEFORE CHARGE.** `render-audit-report`
  and `findable-onboarding` show the price; `findable-checkout` takes it. Deploy the display pair
  FIRST and the gap reads "shown £49.99, charged £19.99" — a pleasant surprise. Reverse it and the
  gap is "shown £19.99, charged £49.99". Same rule the `serverPriceLabel` comment in findable-site
  states for the fallback.
- ⚠️ **NINE FUNCTIONS CARRY THESE VALUES, NOT THREE** — the shared-file trap (§4) in its most
  ordinary form. Walked from each `index.ts` following relative imports:
  `create-ai-audit`, `findable-checkout`, `findable-onboarding`, `process-ai-audit-queue`,
  `process-sms-queue`, `process-whatsapp-queue`, `render-audit-report`, `send-whatsapp-message`,
  `whatsapp-status`. Two more — `instantly-push`, `run-seo-scan` — reach `founderOffer.ts` **only
  through `import type`, which is erased at build**, so they carry no values; they were redeployed
  anyway because over-deploying is free and the recorded failure is always the other direction.
- 🔴 **AND THE MONTHLY IDEA IS SCOPED BUT NOT BUILT.** ⛔ **BUILT 2026-09-03 — the block at the top
  of §11 is the current record; this bullet is history.** It called the real blocker correctly: the
  one-scalar `paid` problem is exactly what the floor + churn rules answer.
  Recon 2026-08-12: `findable-checkout` creates
  a ONE-OFF session (`mode: "payment"`). Subscription code exists but belongs to the BARBER product —
  `customer.subscription.*` reads `metadata.generated_site_id` and flips `generated_sites.is_paid`.
  For Findable there is **no `invoice.paid` handler** (so renewals would be invisible) and **no
  Stripe identifier persisted anywhere** (no customer id, subscription id or status on any table).
  ⛔ The real blocker is not Stripe: **`paid = amount_paid > 0` is a single scalar** (§6, §6d) and
  cannot express "upfront + monthly, still active" — a churned customer keeps `amount_paid > 0` and
  reads as paying forever. Decide that before any subscription work.
  ⚠️ Also unresolved: `paid_for` is written as **"Findable - Setup + first 2 months"**, so today's
  one-off already claims two months; and the guarantee's "or a full refund" is byte-locked across
  both repos and becomes ambiguous the moment billing recurs. (`paid_for` was fixed 2026-09-03; the
  refund ambiguity now has an answer — refund the AI portion, cancel hosting, keep the build.)

</details>

---


---

> Moved from CLAUDE.md §12 on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.

## 12. ✅ THE SITE ORIGIN — an allowlist is not an address book (2026-09-03)

🔴 **THE SAME CATEGORY ERROR IN TWO PLACES, AND ONE OF THEM WAS SENDING REAL PROSPECTS TO A PREVIEW
DOMAIN.** Both read **`FINDABLE_ALLOWED_ORIGINS[0]`** — the first entry of findable-checkout's **CORS
allowlist** — as the canonical public address. An allowlist answers *who may call us*; **the order of
its entries is nobody's deliberate decision**, and it legitimately contains preview hosts.

- **Measured across all 47 onboarding links ever sent: 27 went out on `findable-site.pages.dev`, and
  every one of those was SERVER-BUILT** (re_engage ×19, onboarding_followup ×3, 5 others). The 20
  reading `findable.live` were all hand-typed by the operator. **The most recent server-built link
  reached a real prospect on 2026-08-31.**
- **The second site was worse: `findable-checkout`'s `CANONICAL_ORIGIN`**, which becomes Stripe's
  `success_url` / `cancel_url` — **a paying customer landing back on a preview domain the instant
  they finish paying.**
- ⛔ **AND CORS DID NOT PROTECT IT.** `Access-Control-Allow-Origin` is `*`, so the browser POST
  succeeds from any origin — meaning **"payments work from findable.live" was never evidence that
  findable.live is IN the allowlist.** If it is absent, the trusted-origin test failed for every
  real payer and all of them fell through to the constant. The secret's value cannot be read (the
  CLI returns hashes), which is the reason not to depend on it at all.
- **The fix: one shared `resolveSiteOrigin`**, `FINDABLE_SITE_ORIGIN` first — proven to be exactly
  `https://findable.live` by hashing candidates against the stored digest — folded into the allowed
  origins so a findable.live payer matches at the first test whatever the CORS list holds. A
  trusted REQUEST origin still wins, so localhost and Pages testing return where they are.
- ⛔ **THE FALLBACK REFUSES RATHER THAN GUESSES.** It skips hosts that cannot be a public home
  (`pages.dev`, `workers.dev`, `supabase.co`, localhost) and **returns null** when nothing
  qualifies. A refusal is loud — the senders already decline with "the onboarding link base is not
  configured" — whereas **a plausible preview URL is silent and reaches a customer.** The PRIMARY
  variable is still trusted as set, including its host: pointing it at a preview deliberately is a
  decision, and overriding it would make the variable a lie.
- ⚠️ **THE COMMENT WAS THE BUG.** Both files carried prose asserting the first allowlist entry
  "becomes canonical". That sentence was not a description of the behaviour, it was the belief that
  produced it. `scripts/site-origin.test.ts` pins all eleven shapes (**Deno, not tsx** — it reads
  `Deno.env`); the third case is the exact fault.
- ⚠️ **Swept at the same time: five onboarding-link builders exist** (three functions + two static
  hrefs) and four were already correct. When one of these is wrong, check the other four.

---


---

> Moved from CLAUDE.md §13 on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.

## 13. ✅ THE REPORT'S "GET STARTED" BUTTON — the only CTA in the document (2026-09-03)

`render-audit-report` had always computed `/onboarding/<slug>/?lead=<leadId>` and **thrown it away**
since the offer block was stripped on 2026-09-02. The existing "Want us to fix this?" CTA now leads
with it.

- **This is where outreach clickers actually land: all 16 leads sent `audit_result_hook` opened
  their report, 16 of 16.** So the button catches them with **no change to the Meta-approved
  template.**
- ⛔ **NO URL → NO BUTTON, and it is a price guard as much as a link.** `showOffer === true`
  strictly, so a paying customer is never invited to start again, and an unset value shows nothing.
  (Under the old founder split the `?lead=` was what made the report quote the founder price; the
  flat price has removed that particular hazard but not the rule.)
- **No price on the button** — the pitch was deliberately removed from this document, and the
  onboarding page states the price itself.
- Verified live: Luna Locksmiths (unpaid, hook cohort) renders **Get started** →
  `findable.live/onboarding/<slug>/?lead=…`, and RG Locksmiths (paid) renders the same CTA with
  **no button at all**.
- **Deployed for it:** `render-audit-report`, `process-whatsapp-queue`, `send-whatsapp-message`,
  `process-ai-audit-queue` — the transitive closure, walked by following relative imports.
  `apply-seo-paste` and `notify-onboarding-submit` matched a grep **in comments only** (§4).

---


---

> Moved from CLAUDE.md §13b on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.

## 13b. ✅ THE REPORT'S QUESTION PAGES ARE OPERATOR-ONLY, AND THE CTA (2026-09-12)

- ⛔ **THE PER-QUESTION PAGES ("page 2") NO LONGER GO TO A PROSPECT — GATED ON `internal`, NOT
  DELETED.** `QUESTIONS_PER_PAGE` is 3, so a 12-question baseline added FOUR full sheets after the
  CTA and read as clutter on the document that asks for the sale.
  - 🔴 **DELETING THEM WOULD HAVE SILENTLY TAKEN THE ONLY WINNABILITY VIEW IN THE PRODUCT.**
    `winBlock` renders only inside a question card; nothing else renders it. A block that renders
    nowhere is not a compile error — the same trap that left `FINDABLE_GUARANTEE` imported and
    unrendered for ten days on this very file.
  - ⛔ **THE POINTER SENTENCE IS GATED ON THE SAME CONDITION AS THE PAGES.** It used to be gated on
    the DATA existing while the pages are gated on `internal` — two conditions for one promise, so a
    prospect report would have said "listed on the next page" with no next page.
  - ⚠️ **THE COST, STATED AND ACCEPTED (Paul):** those cards were the ONLY place the report showed
    which SOURCES each engine read. Page 1 carries no citations at all, so a prospect no longer sees
    them anywhere. If that is revisited, the fix is a sources summary on page 1, not un-gating.
  - ✅ Nothing else depends on the pages: the before/after and re-measure comparison read QUEUE ROWS
    (`compareMeasurements(QueueRowLite[])`), never `questionBreakdown`, whose only consumer is this
    renderer. No test asserts page-2 content.
- **The CTA is "Ready to get found?"** — three steps, the explainer line, and Get started / See how
  it works / WhatsApp me, over the byte-locked `FINDABLE_GUARANTEE`.
  - ⛔ **IT MUST READ CORRECTLY WITH NO "Get started" BUTTON**, which is the common case: `offerUrl`
    is set ONLY by `render-audit-report`, so the in-app preview, the PDF, the before/after iframes
    and the welcome pack all render without it. The copy names only the two buttons that always
    render, and the three steps describe what WE do rather than steps the reader takes.
  - ✅ **THE EXPLAINER LINE POINTED AT NOTHING FOR A FEW HOURS, AND THE VIDEO IS NOW ON THE SITE.**
    `/media/findable-hook.mp4` served a clean 200 `video/mp4` while **nothing embedded it** — zero
    `<video>` elements, zero iframes, no reference on the home page; it existed only as the WhatsApp
    template's header asset. findable-site now has **`Explainer.astro`, a `section#video` above
    Pricing** (native `<video>`, no autoplay, `preload="metadata"`, `playsinline`, capped at 340px
    wide because the file is 1080×1920 VERTICAL and would otherwise render ~1100px tall).
    **If that section is removed, the report's CTA line must go with it.**
  - ⛔ **THE LENGTH IS CLAIMED ON THE SITE AND NOWHERE ELSE, AND THAT SPLIT IS THE POINT.** The CTA
    said "the two minute explainer"; the file is **49 seconds**. The report now claims NO length
    ("Watch the explainer") because it deploys from a different repo to the video it describes, so a
    number there goes stale the moment the cut changes with nobody standing next to it. The site
    heading says "under a minute" — true at 49s, and directly above the player, where a re-cut
    cannot happen without seeing it. **Re-cut past 60 seconds and that heading is the line that
    becomes false.**
  - ⚠️ **The trade/town subject line was deleted with the old CTA, and its MEASUREMENTS are kept as
    a comment** where it stood: `businessType` is stored PLURAL on 649 of 778 audits (83%), so
    `${article(t)} ${t}` printed *"a Locksmiths in Ashby-de-la-Zouch"* on four reports in five. Any
    future CTA naming a trade needs that rule back.
  - **Deploy list: `render-audit-report` ONLY** — re-walked 2026-09-12 by real `from "…"` statements;
    no `_shared` module reaches `aiAuditReportHtml.ts`.

---


---

> Moved from CLAUDE.md §26 on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.

## 26. ✅ THE PRICE IS ONE SHAPE WITH TWO HALVES — swept both repos (2026-09-14)

**£99 to start, then £29.99 a month.** The machinery had been right since 09-13; the WORDS had not,
and every one of them was defensible alone. Together the site and the documents sold a one-off.
§1's first section carries the rule; this is what moved and what it cost.

- **findable-site:** the pricing heading ("Pay once." → the price, with the refund condition moved
  down into the guarantee band that already carries it word for word); the card (both figures, and
  `OFFER_COPY[1]` inside it saying what each half buys); a fourth timeline row; hosting back on the
  page; the FAB on every page ("Sign up · £99" → both figures); two FAQ answers; HowItWorks' "One
  project, start to finish."; /terms' "For the one-off fee we:"; /refunds' opening sentence; the pay
  screen's "What you pay" block.
- **LeadFinderOS:** `CARD_SAVED_NOTICE` (one string, shown by BOTH Stripe as its submit message and
  findable.live on its own pre-pay screen); the Stripe **product name** on the receipt; the report's
  only price sentence; the welcome pack, which had said nothing about the monthly at all.
- ⛔ **THE PAY SCREEN'S TICK LIST IS TWO LISTS NOW**, under "In your £99" and "In your £29.99 a
  month". Eight ticks under one figure meant three of them — the monthly's work — read as things
  the setup fee had already bought. "Help getting more Google reviews" LEFT the setup list rather
  than being copied down: keeping a weaker version above the real promise would sell the reviews
  work twice, once in each column.
- 🔴 **`FINDABLE_MONTHLY_GBP` MOVED TO THE TOP OF `findableOffer.ts`, AND THAT IS STRUCTURAL.**
  `CARD_SAVED_NOTICE` interpolates it, and a `const` referenced before its declaration throws
  **ReferenceError at module load** — in this file that is the checkout, not a screen. Third TDZ
  bite recorded in this repo.
- 🔴 **THREE FUNCTIONS FAILED TO DEPLOY ON A PRE-EXISTING FAULT, AND NOTHING LOCAL COULD SEE IT.**
  `src/lib/deliveryCockpit.ts` imported `'./findableOffer'` with no extension; tsc, `npm run build`
  and all 103 suites resolve that happily, so the gate read green and only the bundler said
  *Module not found … Maybe add a '.ts' extension*. **stripe-webhook, process-ai-audit-queue and
  render-remeasure-results sat on their previous version while `main` looked correct.** Fixed, and
  the closure re-swept: it was the ONLY extensionless relative import reachable from any edge
  entrypoint. The others in `src/lib` are SPA-only.
  ⚠️ **The sweep is worth re-running after any change that adds a file to an edge closure** — walk
  `from "./…"` from each `index.ts` and flag anything without `.ts`.
- ⚠️ **A NEGATIVE STRING CHECK WAS MY OWN CHECK'S FAULT, AGAIN.** The report's new line asserted
  false on five live documents because the source wraps mid-sentence and the served HTML carries a
  newline where my needle had a space. §4's rule, still earning its place: **normalise whitespace
  before believing a missing marker.** Proven live afterwards on all five.
- **Deployed:** the 13 functions in the changed closure — findable-checkout v54, render-audit-report
  v101, stripe-webhook v103, process-ai-audit-queue v172, render-remeasure-results v13,
  findable-onboarding v97, submissions v42, process-whatsapp-queue v132, send-whatsapp-message v91,
  instantly-push v55, market-view v68, page-generator v54, run-seo-scan v52. findable-site deployed
  with `npm run deploy` (no CI) and verified live by string on /, /terms, /refunds and the
  onboarding island.
- ⚠️ **NOT VERIFIED, AND IT NEEDS A REAL PAYMENT:** `CARD_SAVED_NOTICE` and the new Stripe product
  name are proven by source and deploy only. Both render on Stripe's own hosted page, which is a
  JS shell that tells a fetch nothing (§6, §11) — the first real Checkout Session is the proof.
  The guarantee description is 236 chars against a 222-char proof, so that is the same session.

---

