# Attribution review — admin fixes (2026-10-05)

Branch `improve/attribution-review-admin`, off `origin/main` `9fd5a144`. **Not merged, not deployed.** Fixes the two
admin issues left open by the v3 production release (`v3-commercial-sales-production-release.md` §11 items 6 and 7).
No commercial rule changed: who the database stamps, when a review opens, the hold, and the commission engine are
all as they were.

## 1. Business revenue ≠ salesperson-attributed revenue

**The bug.** The admin team table credited each payment to `ledger.sold_by_user_id ?? lead.sold_by_user_id ??
bookOwnerId`. A sale under review has no seller stamped, so it fell through to **the book owner — Paul's row**. The
rep's own dashboard (`salesPerformance`) had the mirror fault: a paid lead with no seller counted as a **win for
whoever holds the lead now**. The Paid Clients list and the admin handoff cards named the **current owner** as
"Sold by".

**The rule now — one function, `saleCreditOf` (`src/lib/saleAttribution.ts`):**

| Lead state | Credit |
|---|---|
| review `open` (or an unknown status) | **awaiting attribution** — nobody's, whatever a row's seller says |
| review `not_credited` | **not credited** — nobody's, ever |
| a seller on the ledger row or the lead (incl. after CONFIRM) | that seller |
| no seller, but `sold_at` set (decided with no seller; review not read) | **awaiting attribution** (fail closed) |
| no seller, never decided (before the stamp existed) | the caller's old fallback — unchanged history |

Used by: the admin team table + money-by-seller (`adminMetrics.ts`), the rep dashboard (`salesPerformance.ts`), the
Paid Clients list and client card (fn `paid-client-hub`). Business totals (collected, paying clients, today's sales)
still count every payment. The team table shows, under it, **"£X awaiting attribution · N clients (names)"** and
**"£X not credited to a salesperson"** when there is any (`money.unattributed`). `admin-overview` reads the reviews
(view `sale_attribution_holds`); unreadable → the `sold_at` rule still keeps the money off every row.

Live on 2026-10-05: 0 reviews, 0 paid leads without a seller, 0 paid leads without `sold_at` — **no historical figure
moves**.

## 2. Resolving a review

**Before:** "Confirm seller" could only accept the claimed seller; otherwise Not credited.

**Now (Team page, admin only):** the card shows the frozen evidence — why it opened, the payment (amount, date, how:
paid sign-up / legacy session / marked by hand), the sign-up creator(s) with their Ready-to-Sell state when they made
it, the claimed seller with their state when the review opened, the lead owner at payment and now, the ownership
history, every sign-up link made for the client — then **"Who sold it?"**:

- **Evidence-backed candidates** — the database's own list, `public.sale_attribution_candidates(lead)`, built only
  from the review's frozen evidence: creators of the paid sign-up, the claimed seller, anyone who made a sign-up link
  for this client, and the owner at payment **only when that owner is a salesperson** (never Paul by ownership).
  Nothing is manufactured; no current-owner lookup.
- **Someone else — admin override**: any team member not in the list, **with a reason of at least 10 characters**
  (`ATTRIBUTION_OVERRIDE_REASON_MIN`, the same number in the resolver, the table check and the screen).
- **Not credited**.

Each needs a confirm; each decision is final.

**The resolver** `public.resolve_sale_attribution_with_seller(lead, decision, seller, note, override_reason, actor)`:
re-checks the actor holds the **admin** role (`not_admin` otherwise — a salesperson cannot resolve, and the function
is service-role only), one decision only (`no_open_review`), seller must be on the team, evidence vs override decided
by the candidate list, override refused without a reason, Not credited refuses a seller rather than dropping it.
CONFIRM stamps through the **existing** path (`app.attribution_resolve` → `sold_by_user_id`, frozen; ledger rows with
no seller filled) so commission applies exactly as before. The old `resolve_sale_attribution_review(uuid,text,text,uuid)`
keeps its signature as a wrapper (confirms the claimed seller through the one resolver).

**Immutability and history:**
- `sale_attribution_reviews` gains `resolved_seller_user_id`, `resolution_basis` (`evidence` / `admin_override`),
  `override_reason`. `claimed_seller_user_id`, `reason`, `evidence`, `created_at` never change (guard trigger); a
  resolved review is final; an open review cannot be resolved by a plain UPDATE; no review is deleted directly
  (only with its lead, through the FK cascade); TRUNCATE refused.
- New append-only `sale_attribution_review_events`: an `opened` line (with the candidates as they were) and one line
  per decision (seller, basis, note, override reason, actor, time). RLS on, no policies, no grants to signed-in users.
- Fn `admin-users` `attribution_reviews_list` now returns the payment, current owner, candidates (open reviews), the
  history and the team; `attribution_review_resolve` takes `seller_user_id` + `override_reason` and calls the new
  resolver.
- **Deploy-gap guard:** the card will not resolve against an older `admin-users` (its list has no `people`) — that
  version would confirm the claimed seller whoever was picked.

## 3. Commission — unchanged

`commission.ts` / `_shared/earnings.ts` untouched. Open or Not credited → held (no seller, no commission, not in the
ladder count). Confirmed → normal v3 rules, joining the ladder from the confirmation instant (Session F's engine).

## 4. Tests

- `scripts/attribution-review-admin.test.ts` — **82/82**: the credit rule; open review not on Paul's / the current
  owner's / the claimed seller's row; the business payment still counted; Not credited never in rep revenue (first or
  monthly); Confirm credits the confirmed seller only; unreadable reviews still fail closed; historical sales
  unchanged; the rep dashboard's win rule; override needs a reason; evidence picks need none; evidence view and
  override list; SQL wiring (admin check, one decision, same minimum, candidates from evidence only, immutability,
  append-only history, service-role only, wrapper, hold/decision/stamp not redefined); admin-users / paid-client-hub /
  Team page wiring; commission untouched; the deploy-gap guard.
- `supabase/tests/attribution-review-admin.sql` — **32/32 live, rolled back** (migration prepended; fake users on
  example.invalid, fake leads): five sale shapes, candidates per reason, Paul never a candidate, salesperson / no actor
  / signed-in session refused, evidence pick that is not the claim, override refused without / with a short reason /
  for a non-member then accepted with a reason, Not credited refuses a seller, one decision only, direct update /
  evidence rewrite / claim rewrite / plain-UPDATE resolve / delete (open and resolved) all refused, history append-only
  and complete, wrapper still works, confirmed seller frozen, hold unchanged, lead deletion still cascades, every
  existing seller untouched. Run twice (the creators of one sign-up tie inside a transaction — `quick_close_events`
  stamps `now()` — so the suite reads the claim from the review rather than assuming it).
- Existing suites, live and rolled back, **with and without** the migration: `v3-signup-attribution.sql` 24/24 both,
  `salesperson-onboarding-rls.sql` 70/70 both. Read back after: 0 reviews, no events table, 0 fake users, 0 QA leads,
  resolver hash unchanged (`e9b7850f…`).
- Updated pins: `sales-ready-gate` (the action calls the new resolver), `pre-sales-final` (the new migration is a later
  release), `outreach-list-columns` (`sold_at` read by the server-only fold, like `sold_by_user_id`).
- Full gate `npm run check`: **exit 0** — typecheck 9 = baseline (identical list), edge syntax / undefined / import
  graph OK, build OK, **329/329 suites**. (The first run found two real pins — the release migration list and the
  server-only `sold_at` read — fixed above.)

## 5. Visual QA

Throwaway Vite harness (real `AttributionReviewsCard`, `TeamPerformanceTable` fed by the REAL `foldAdminOverview`,
`HandoffsPanel`; fixture data; no network), served locally, captured with headless Edge at 1280 px and in a 390 px
frame; deleted before commit. Rendered: normal sale; open review; conflicting claimed vs creator seller; multiple
candidates with the override open; Not credited and Confirmed (admin override) records expanded. Fold result in the
page: Paul £0, Sarah (normal) £99, Owen (confirmed) £99, business £396, £99 awaiting, £99 not credited. Driven in the
pane: Confirm disabled until a pick; evidence pick enabled; override list = team minus candidates; override disabled
with no reason and with a 9-character reason, enabled at 10+; the request carried `seller_user_id` and
`override_reason`. Mobile: no page-level horizontal scroll (the team table scrolls inside its panel, as before). Fixed
after QA: a hand-marked payment with several sign-ups no longer says "Nobody created the paid sign-up". Paul has not
seen it yet.

## 6. Deploy (not done — for whoever deploys)

1. **SQL first**: `supabase/migrations/20261011100000_attribution_review_admin.sql`, one transaction, read back with
   the queries at its foot. Safe with the deployed `admin-users` (wrapper keeps the old call working).
2. **Edge** — behaviour changes: `admin-users`, `admin-overview`, `business-summary` (same loader), `sales-performance`,
   `paid-client-hub`. Closure-only (they reach `saleAttribution.ts` through `commission.ts`; only new exports were
   added, behaviour identical): `findable-onboarding`, `paid-baseline`, `quick-close`, `sales-earnings`,
   `stripe-webhook`. Verify `admin-users` by the list response carrying `people`.
3. **SPA** (merge to `main`). Until `admin-users` is deployed the card shows the evidence but refuses to decide.
