# Client Service Agreement v4 + the call script rewrite (2026-10-06)

Branch `improve/sales-script-commercial-alignment` (LeadFinderOS) and `commercial/optimise-six-payments`
(findable-site). **Not merged, not deployed.**

## Paul's commercial decision (supersedes v3 for FUTURE sales)

| | Payments | After the last payment |
|---|---|---|
| **Findable Optimise** (keeps their site) | £99 + 5 × £99 = **6 in total** | **The sixth payment is the last.** It covers ONE FINAL MONTH of the included work; the agreement then ends automatically on the Optimise End Date (one month after payment 6, month-end clamped). No 7th payment, no £29.99, no continuation state, reminder, question or charge. Ownership of our work passes on payment 6. |
| **Findable Build** (we build, host, manage) | £99 + 11 × £99 = **12 in total** | The site is theirs; £29.99/month hosting + monitoring until cancelled (30 days' notice). |

Timing is unchanged (Option B): £99 → Access Date → results (about four weeks) → 14-day Refund Window → first
monthly £99 the day after. The no-access fallback (5.6/5.8) is unchanged and kept separate. The guarantee is
unchanged (any increase in the named count, or the £99 back within the refund window).

## What production held on the day (read-only, 2026-10-06)

- `client_agreement_acceptances`: 8 rows, **all v1** (the internal test client + QA rows). **No v3 signature exists.**
- `client_service_terms`: **0 rows.** `client_payment_holds`: 0. `client_agreement_versions`: only `v1`.
- Two unpaid, unsigned sign-ups (both Build): The Portsmouth Plumbing and Heating Co, Infinity Fit Club. After v4
  ships they sign v4; Build is commercially identical in v3 and v4.
- Live constraint `client_service_terms_commercial_terms_check` accepts only `csa_v3_option_b` — **the migration
  below must run before any function that writes v4 terms is deployed.**

## The agreement

- `CLIENT_AGREEMENT_VERSION = 'v4'`. v4 = v3 + `V4_AMENDMENTS` (clientAgreement.ts) and nothing else:
  Optimise service box, key point 3, clauses 3.1, 3.2, 9.3, 9A.1, 9A.2, 9A.4, 15.1, the 9A heading ("FINDABLE BUILD
  ONLY"), new **9B** (9B.1 the fixed term; 9B.2 ownership of our work on final payment), and a Schedule 1 row
  "After the minimum term". v4 template fingerprint `2d81cebd…` is pinned (`scripts/client-agreement-v4.test.ts`);
  v3's `3e1edf3b…` is unchanged.
- ⚠️ **v4's words were drafted in code from v3, not from a .docx.** Paul (and ideally a lawyer) must read v4 before
  it is deployed. The public copy is findable-site `src/lib/clientAgreementV4.ts` (generated from v3's blocks by
  `scripts/generate-agreement-v4.mjs`); `/agreement` serves v4, `/agreement/v3` serves v3 unchanged.
- Parity: `FINDABLE_SITE_DIR=<site checkout> npx tsx scripts/check-agreement-parity.ts` now checks v3 AND v4
  (139 and 145 paragraphs, identical on the day).
- Historical: every acceptance row names its version; the PDF, the email and the fingerprint re-check use THAT
  version. A v3 signature never opens a NEW checkout after the cutover (re-sign v4); a v3 Stripe session opened before
  the cutover and paid after it is still accepted by the webhook **on v3 terms** (`webhookV3Verdict` takes
  `AGREEMENT_FIRST_TERMS`, version → terms, and checks the session's terms match its signature's version).

## Paul's review of the wording (2026-10-06, second pass)

- Optimise final month: 9B.1 (sixth payment is final), 9B.2 (it covers one final month; Optimise End Date; ends automatically), 9B.3 (Our Work passes on the sixth payment, not at the end date); 2.6 extended to the final month; 9.3 and 15.1 point to the End Date.
- Inherited v3 wording fixed in v4 only: 4.3 and 5.5 no longer say "the website" passes to an Optimise client; Schedule 1 Build hosting cites 9.2 (term) and 9A (after); key point 1 says monthly payments "normally" start the day after the refund window.
- Billing already matched: Stripe's cancel_at is the boundary one month after payment 6, so there is no 7th charge and the subscription closes itself on the End Date. `minimumTerm().serviceEndDay`, `serviceEndedOn()` and `timelineView().serviceEnded` derive the end (only once payment 6 is actually collected); the Paid Client card shows the final month, then "Service ended"; the term-complete email (sent at cancel_at) says the final month has finished. Edge: if payment 6 is collected late after retries, Stripe still ends on its anchor date while the contract end is one month after the actual payment — Paul extends by hand if that ever happens.
- v4 fingerprint now `bc0061ea…`; parity 147 paragraphs.

## Billing and continuing service

- The one rule: `continuingServiceApplies(terms, route)` (clientTimeline.ts): v3 → both routes; v4 → Build only
  (`continuingServiceAfterTerm`, findableOffer.ts); no stamp → no.
- New sales are stamped `COMMERCIAL_TERMS_CURRENT = 'csa_v4_option_b'`; `isOptionBTerms` (v3 or v4) replaced every
  "is this a v3 client" check (timeline, scheduling, commission, results email).
- Stripe was already right: every subscription stops at its last minimum-term payment (`cancel_at`). New
  subscriptions now carry `metadata[commercial_terms]`; `subscriptionContinuesAfterTerm(meta)` decides from the
  subscription alone (option_b with no marker = a v3 sale). At term end: v3 / v4 Build → Paul's manual Continuing
  Service alert (as before); **v4 Optimise → the "All 6 of your payments are complete … nothing more will be
  charged" email**, no operator step.
- `minimumTerm` gives v4 Optimise no Continuing Service dates, so no reminder or decision action can appear; it gains
  `planComplete` (the 6th actual payment collected). The Paid Client card shows "Fixed term" / "Payment plan complete"
  and hides the Continuing Service buttons; paid-client-hub refuses the three continuing actions
  (`no_continuing_service`); the migration adds a DB check that refuses a continuing state on v4 Optimise.
- Wording per client: card notice + Stripe line name (route), the sign-up page offer box, Quick Close's price
  sentence, the four-week results email (`continuingService` from the client's own terms), the Welcome Pack
  (`afterTermKeyPoint`, read from `client_service_terms`), the call close.

## The call script (src/lib/callScript.ts)

Sections: OPENER → WHAT WE FOUND → FIRST QUESTION → IF THEY USE AN AGENCY → DISCOVERY → WHAT WE DO → PRICE →
OBJECTIONS. Opener: "Hi mate, I was looking for a plumber in Rugby, so I asked Google AI and it mentioned A, B and
C, but not you. I had a look into why they were being named and you weren't, and I found a few potential reasons."
Competitors = the stored answer's (max three; none → "you didn't come up in the answer it gave"); website points =
the stored crawl's findings in plain words (max three; none → Paul's "I couldn't see one huge technical fault" line;
no website / profile said as such). Never "from Findable", "I messaged you", a WhatsApp day or date — an earlier
message is a rep-only note. FIRST question always "Do you manage the website yourself, or does an agency do it?";
agency → contract, then (lightly) cost; PRICE ANGLE only above £100/month and above our own monthly. Objections:
Why £99 / six / twelve, What happens after, agency, think about it, scam, cancel, guarantee, send me something, busy.

## Deploy order (for the integration session)

1. Paul reads and approves the v4 wording (`/agreement` on the site branch build, or `renderAgreementText(…, 'v4')`).
2. SQL `20261012090000_client_agreement_v4_optimise_fixed_term.sql`, block by block, read back.
3. Edge functions — every function that reaches a changed module (`node scripts/check-import-graph.mjs --reached-by`).
   Behaviour-carrying: `stripe-webhook`, `findable-checkout`, `client-agreement`, `paid-client-hub`,
   `render-welcome-pack`, `render-remeasure-results`, `cron-run`, `quick-close`, `legacy-checkout-cutover`,
   `process-ai-audit-queue`, `paid-baseline`. Wording-only via findableOffer.ts: the rest of the reached list.
   ⛔ `whatsapp-status` is in the reached list and is HELD — do not redeploy it for this change.
   Webhook first (it must accept v4 sessions before checkout creates them), checkout last.
4. Operator SPA (Cloudflare on merge) — the call script and the Paid Client card.
5. findable-site `npm run deploy` from a clean origin/master worktree with `--branch=master`, after the functions.

## Not done / open

- Meta-registered WhatsApp bodies are untouched (none states the Optimise continuation today; the stale
  `explain_offer` pair stays blocked).
- No existing client is re-ruled; RG, Ronnie, MCL and QA clients have no terms row.
