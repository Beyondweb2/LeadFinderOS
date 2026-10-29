# DRAFT: agreement changes for the three payment options (for Paul and his solicitor)

**Draft only. The legal terms have NOT been edited.** v5 (`src/lib/clientAgreement.ts`, generated from
`Findable_Client_Service_Agreement_v5_clean.docx`) stays what every new client signs until a v6 is approved, generated
by script and live on findable.live. Clause numbers below are v5's.

## Why a new version is needed before anything is sold

The checkout only takes money after the client signs the current agreement, and v5 says "£99 initial payment, then
11 further monthly payments of £99 (12 payments in total, £1,188 in all)" (3.1), "the minimum term is 12 payments" (4.1)
and "transfers only after all 12 minimum-term payments" (4.3). Selling £499 once, £99 × 6 or £99 + £49.99 × 11 against
that text would mean a client paying one thing having signed another. The code refuses the new plans until this is done.

## Clauses that would change (suggested wording, for the solicitor to improve)

| v5 clause | Today | Suggested v6 direction |
|---|---|---|
| Summary box (line "We build, host and manage…") | £99 then £99 a month, 12 payments | Name the plan the client chose: "Pay in full: £499 once" / "6 months: £99 a month, 6 payments (£594)" / "12 months: £99 now, then £49.99 a month for 11 months (£648.89)". |
| 3.1 | £99 + 11 × £99 | "You pay according to the payment plan you chose at sign-up: (a) Pay in full, £499 once; (b) 6 months, £99 initial payment then 5 monthly payments of £99; (c) 12 months, £99 initial payment then 11 monthly payments of £49.99." |
| 3.2, 5.6 | "Your first recurring £99 payment…" | "Your first recurring payment…" (no amount). Pay in full: no recurring payments. |
| 3.7 | "The £99 price is fixed…" | "The price of your payment plan is fixed…" |
| 4.1 | "The minimum term is 12 payments" | "The minimum term is the number of payments in your plan (1, 6 or 12)." Pay in full: decide whether a "minimum term" still exists (see decision 3). |
| 4.3, summary bullet | transfers after all 12 payments | "…transfers only after your final payment has cleared." |
| 5.4, 5.5 (guarantee refund) | refund of "your £99 initial payment"; ends further payments | **Decision 1 below.** |
| 9.2 | "Hosting is included during the 12-payment minimum term" | "Hosting is included while you are paying your plan" plus the pay-in-full period (decision 2). |
| 9A.2, 9A.5 | "after payment 12" | "after your final payment". |
| Schedule table ("Included for the 12-payment minimum term") | 12 payments | per plan. |

The headline promise stays exactly: "We improve AI visibility or you get your money back". The contractual guarantee
sentence (`FINDABLE_GUARANTEE`, byte-locked with findable.live) is NOT changed in this branch.

## Decisions only Paul can make (needed before v6 is drafted properly)

1. **Guarantee refund on pay in full.** The guarantee refunds "your £99". A pay-in-full client paid £499. Refund £99,
   £499, or something else? (Same question for the first £49.99 monthly if taken inside the claim window on the
   12-month plan; today's rule refunds "the first monthly if taken".) This changes `FINDABLE_GUARANTEE` in both repos.
2. **Hosting for pay in full.** "Hosting included while they are paying" gives a pay-in-full client no included hosting
   after the build. The code's words currently assume **12 months included** (`FULL_PAY_HOSTING_INCLUDED_MONTHS`, a draft
   default, words only, never a charge). Confirm or change.
3. **Pay in full and "minimum term".** With one payment there is nothing left owing; does early-exit wording simply
   not apply, and is there any refund outside the guarantee? (Today: none.)
4. **Commission.** Initial commission is a rate × the real first payment from `payment_ledger`; a £499 first payment
   pays commission on £499, and the 12-month plan's recurring commission is on £49.99. Confirm that is intended
   (`COMMISSION_RECURRING_COUNT` is 6 in code; an old note says 5 — still unconfirmed).
5. **The £499 "upfront" price model** from test day (`src/lib/priceModel.ts`: £499 then £99 × 12, never payable) clashes
   with "Pay in full £499 once". Recommend retiring it when the new plans go live.
