# findable.live → LeadFinderOS: selling the plans (contract, 2026-10-29; two plans from 2026-10-30)

> **2026-10-30, TWO PLANS:** `plans` now returns four ids: `complete` (Findable Complete, £99 × 12, `recommended: true`)
> first, then Essential's `full`, `six`, `twelve`. Each entry is `{ plan, name, product, recommended, available }`
> (`product` is `"complete"` or `"essential"`). `submit` accepts `"complete"` too; every plan now signs agreement **v7**.
> If the site keeps its own list of ids, name it `SITE_PLAN_IDS` in `src/lib/site.ts`: `scripts/check-cross-repo-sync.mjs`
> fails if it offers an id this repo does not sell. The rest of this page is the 2026-10-29 contract (v6 wording).

For the session working on the `findable-site` repo. Two hooks in fn **`findable-onboarding`** (the function the
sign-up already calls). Nothing else changes: the site still calls `findable-checkout` and the agreement page exactly as
today, and both read the plan off the sign-up row the submit wrote.

Endpoint (unchanged): `POST https://ruusxpkkmwtljxxulhbq.supabase.co/functions/v1/findable-onboarding`
Headers (unchanged): `Content-Type: application/json`, `apikey: <the anon key the site already uses>`,
`Authorization: Bearer <the same anon key>`.

## 1. `plans` — which plans are on sale (public, read-only)

Request:

```json
{ "action": "plans" }
```

Response `200` (example, today — the 12-month plan's live Stripe price is not set up yet):

```json
{ "ok": true, "plans": [
  { "plan": "full",   "name": "Pay in full", "available": true  },
  { "plan": "six",    "name": "6 months",    "available": true  },
  { "plan": "twelve", "name": "12 months",   "available": false }
] }
```

- Always exactly these three ids, in this order. The old staff-only plan is never listed.
- Names and availability only: **no prices** (the site keeps its own price copy, checked by
  `scripts/check-cross-repo-sync.mjs`; the charge is always decided server-side), no client data, no ids, no secrets.
- No database read. `Cache-Control: public, max-age=300`. No login. Safe to call on every page load.
- Show an unavailable plan disabled (or hide it). It becomes available, with no deploy, the moment
  `FINDABLE_REDUCED_MONTHLY_PRICE_ID` is set.

## 2. `submit` — the new `answers.payment_plan`

Add one field to the existing submit body:

```json
{ "action": "submit", "lead_id": "<optional, as today>", "source": "signup",
  "answers": { "...every existing field, unchanged...": "", "plan_tier": "new_site", "payment_plan": "six" } }
```

| `answers.payment_plan` | Result |
|---|---|
| absent, `null` or `""` | **Exactly as today.** Nothing written; the row is the current v5 offer (£99 × 12, agreement v5). Links already sent keep working. |
| `"full"` | Written. Agreement **v6**, first payment **£499**, no monthly payments. |
| `"six"` | Written. Agreement **v6**, first payment **£99**, then £99 a month (6 payments). |
| `"twelve"` (only while `plans` says available) | Written. Agreement **v6**, first payment **£99**, then £49.99 a month (12 payments). |
| `"twelve"` while not on sale | `409 { "ok": false, "error": "plan_unavailable", "detail": "That payment option is not available yet. Please choose another way to pay." }` — no row written. |
| anything else (`"legacy_twelve"`, `"FULL"`, a number…) | `400 { "ok": false, "error": "invalid_payment_plan", "detail": "Unknown payment option. Reload the page and choose again." }` — no row written. |

- The plan is checked **before** any row is written. Every other submit rule is unchanged (`missing_required`,
  `missing_contact_email`, `plan_withdrawn` for `plan_tier: "keep"`, `too_soon`, …).
- The three plans are all Findable Build: send `plan_tier: "new_site"` as today. `findable-checkout` still refuses a row
  with no route (`route_undecided`).
- After a successful submit, carry on as today: the agreement page (fn `client-agreement`) shows v6 with the plan
  printed in the client details, and `findable-checkout` charges the plan's first payment. Neither takes a plan or a
  price from the browser — only from this row.
- A lead who already has a salesperson's sign-up resumes THAT sign-up (`resumed: true`); its plan is the salesperson's,
  never the one in this request.

## Words on the site

- v6 agreement text is `src/lib/clientAgreement.ts` V6 in this repo; the site's `/agreement` page is still v5 (the
  parity check `scripts/check-agreement-parity.ts --site-ref <ref>` must be satisfied when the site adds v6).
- Plan names: use the `name` from `plans`.

## Tests

`scripts/signup-payment-plan.test.ts` (dry run: each plan → agreement version and first payment, no-plan path unchanged,
refusals, the public list leaks nothing).
