# Client Service Agreement v7: changes from v6, for review (Jess)

**For:** Jess (Paul's solicitor). **From:** Findable (drafted by Claude on Paul's instruction, 2026-10-30).
**Status:** v7 is live for new sign-ups, shipped the same way as v6: treated as approved, reviewed afterwards. Clients who
signed v6 (or earlier) stay on what they signed. The old staff-only £99 × 12 plan stays on v5.

The full v7 text, with each point marked **[CHECK]**, is `docs/agreement-v7.md` (generated from the live text in
`src/lib/clientAgreement.ts`). Every clause not listed here is v6 word for word. v6 and its review: `docs/agreement-v6.md`,
`docs/v6-review-for-solicitor.md` (its open points still stand where v7 kept the wording).

## What changed, and why

Findable now sells **two plans**:

| Plan | Payments | Total | What it is |
|---|---|---|---|
| **Findable Complete** (recommended) | £99 at sign-up, then 11 × £99 monthly | £1,188 | Everything in Essential, plus review replies, Google Business Profile, directories, changes within reason (fair use), monthly audits. Hosting while paying. |
| **Findable Essential**, pay in full | £499, one payment | £499 | An AI-optimised website, plus a baseline AI visibility audit and a four-week audit to measure the change. |
| Findable Essential, 6 months | £99, then 5 × £99 | £594 | As above. |
| Findable Essential, 12 months | £99, then 11 × £49.99 | £648.89 | As above. |

Essential's prices and money timing are v6's, unchanged. The guarantee and its timeline change for both plans.

**The new guarantee timeline (both plans):** the baseline is completed = **day 0** (the "Baseline Date"). The four-week
results are sent on **day 28**. The client can claim for **7 days** after the results (day 28 to 35; v6 allowed 14 days).
The first monthly payment is taken **the day after the window closes (day 36)**, then monthly. Nothing is scheduled before
the baseline. Headline (Paul's exact words): "We improve AI visibility or you get your money back". Refund = everything the
client has paid under the agreement.

| Clause | Change |
|---|---|
| Service description, Key points | Both plans; guarantee point says 7 days and day 28; a new point lists Complete's extras. |
| 1.5, 2.4 | Schedule 1 has a column per plan; "outside the plan" is per plan. |
| 2.6 | Plan Period names Complete. |
| 2.8 to 2.11 (new) | Complete's extras: review replies, GBP, directories (2.9), changes within reason (2.10), monthly audits (2.11). |
| 3.1, 3.2 | Complete's payments; Essential's three options relettered. |
| 4.1 | Complete's minimum term: 12 payments. |
| 5.2 | New defined term "Baseline Date" (day 0). |
| 5.3 | Results sent on day 28 from the Baseline Date (or the day actually sent, if later). |
| 5.4 | Refund Window 7 days after the Results Date (was 14). |
| 5.6 | First monthly the day after the window, normally day 36; nothing scheduled before the baseline; moves back if results are late. |
| 5.7 | Client delay before the baseline moves day 0 and everything after it. |
| 9.2 | Hosting included on Complete while paying. |
| Schedule 1 | Two columns; new rows for review replies, changes, monthly audits, payments. |

## Open points for you

- **[CHECK] The day 0 / 28 / 35 timeline (5.2, 5.3, 5.4, 5.6).** Day 0 is the day the baseline is completed; results on day
  28; claim window day 28 to 35; first monthly day 36. Paul said "about day 35"; day 35 is the last day of the window, so
  the first charge is day 36. Is a fixed "day 28" too firm a promise? If we send late, we wrote that the Results Date is
  the day we actually send and the first payment moves back to the day after the 7-day window.
- **[CHECK] The baseline delayed by the client (5.1, 5.7, 5.8(a)).** The baseline still starts on or after the Access Date,
  so a client who delays access delays day 0. We added: "If you cause delay before the baseline, the Baseline Date and
  every date counted from it move back with it." With 5.8(a) unchanged (no access within 30 days of the initial payment =
  the guarantee does not apply, and the first monthly falls back to six weeks after the initial payment). Is that fair and
  clear? A client who never gives access has paid £99 (or £499) and pays monthly from the fallback date.
- **[CHECK] The guarantee window on Complete (5.4, 5.5).** On Complete the 7-day window closes before the first monthly
  payment, so in practice a claim refunds the £99 initial payment. Paul's brief mentioned "up to 12 months of payments"; we
  did **not** extend the guarantee beyond the window or promise a refund of later payments. Confirm the intended maximum is
  "what was paid when the claim is made". If Paul wants a later or longer guarantee on Complete, 5.4 needs rewriting.
- **[CHECK] The site-taken-back line (5.5).** On a valid claim the agreement ends, nothing transfers, and on Essential paid
  in full the transfer that already happened is "reversed": the licence ends and we may take the website down. As in v6:
  can a transferred copyright be reversed this way, or should transfer on pay in full wait until the window closes? On
  Complete nothing has transferred at the claim, so only the licence ends.
- **[CHECK] Review replies (2.9).** We reply "on your behalf". Is replying in the client's name acceptable without approving
  each reply? We gave the client the right to ask us not to reply to a particular review; there is no approval step. Note
  the business previously treated review replies as not a deliverable; Complete makes them one.
- **[CHECK] "Changes within reason" (2.10).** Fair use: small edits, not redesigns, rebuilds or new features, with examples
  and a right to decline or quote. No number of changes and no turnaround time (Paul gave neither, so we did not invent
  them). Is "well beyond what our clients typically ask for" enough to rely on, or should there be a cap?
- **[CHECK] Complete's 12-month term (4.1).** "12 payments, so the plan runs for 12 months of payments." The first payment
  is at sign-up and the second normally on day 36, so the last payment falls roughly 12 to 13 months after sign-up. Is the
  wording accurate enough, and is a 12-payment minimum for a business customer enforceable as written (4.2 unchanged)?
- **[CHECK] Complete's extras end with the Plan Period (2.8).** After the final payment only the optional £29.99/month
  Hosting and Maintenance (9A) is offered, which does not include review replies, GBP, directories or audits (9A.3 unchanged).
- **[CHECK] Monthly audits (2.11)** are tracking only and never decide the guarantee. Confirm this is clear next to 5.9.
- **[CHECK] v6 clients.** Anyone who signed v6 keeps the 14-day window and the Results-Date clock. A v6 signature not yet
  paid for must be re-signed on v7 (the agreement page shows v7). Confirm that is acceptable (two unpaid v6 signatures
  existed on 2026-10-30).

## Not changed (deliberately)

- Clauses 6 to 16 (except 9.2) are v6 word for word, including liability (13.3: capped at the amount paid in the prior
  12 months), 10.3 (no fake reviews), 9A (optional £29.99 hosting after the Plan Period).
- findable.live's own `/agreement` page is in a separate repo and still shows v5 (it was not changed for v6 either).
  The agreement a client actually signs is served by our agreement page, which is v7 for every new sign-up.
