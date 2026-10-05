# 10 — Historical clients and exceptions

*State read live from the database on 2026-10-05 (read-only). Re-read before acting on any of it.*

⛔ **Do not alter historical clients accidentally.** No script, backfill, migration test, QA run or "tidy-up" may write to
these rows. Every pre-sales session on 2026-10-04/05 only READ them. Live tests use `ZZ QA` fixture leads instead
(`docs/qa-fixtures.md`).

## Current position in one line

**There is no active paying client right now.** Every real lead with money on it is ended or refunded. All other rows with
`amount_paid > 0` are archived `ZZ QA …` fixtures (simulated payments, excluded from metrics).

| Lead (id prefix) | Paid | DB status | Ended / refunded | Stored re-measure date | Will it be re-measured? |
|---|---|---|---|---|---|
| Ronnie's Shoe Repairs & Key Cutting (`0ff7954f`) | £49.99 | `payment_received` | ended 2026-10-04, `client_ended_early` | 2026-10-13 | **No** — ended clients are skipped |
| MCLocksmiths centre (`6d0585ac`) | £99 | `payment_received` | ended 2026-10-03, `client_ended_early` | 2026-10-20 | **No** — ended clients are skipped |
| RG Locksmiths cambs (`800425fe`) | £19.99 | `refunded` | refunded | 2026-10-06 | **No** — refunded leads are skipped |
| SC Plumbing & Gas Ltd (`d63f58f9`) | £49.99 | `refunded` | refunded | — | No |

The scheduler (`fireDueRemeasures`, `supabase/functions/_shared/audit-baseline.ts` ~line 805) filters
`.is("service_terminated_at", null)` **and** `.neq("status", "refunded")`, so none of the four can be re-measured.

## Ronnie's Shoe Repairs

- A **historic £49.99 legitimate one-off payment** (an older price, before today's £99 offer). Not a mistake, not a test.
- **Ended** 2026-10-04 (`service_termination_reason = client_ended_early`; Paid Clients shows COMPLETED).
- **No subscription** (no Stripe customer or subscription id on the row), **no refund**, **no more work**, **no
  remeasurement** (his 2026-10-13 date stays stored but cannot fire).
- `contract_total_payments` is NULL on purpose — a pre-route client is never given a 12 or a 6.

## MCLocksmiths (MCL, "Morgan")

- Historic client. Findable rebuilt his site (repo `Beyondweb2/MCLocksmiths-New`, Cloudflare project `mclocksmiths-new`,
  domain `mc-locksmiths.com`); after complications **he went back to his old website by choice**. That is why
  mc-locksmiths.com serves his old site — **not a defect**.
- £99 kept; **ended** 2026-10-03 (`client_ended_early`). **No further work.** Never touch the live site, its DNS or the
  Cloudflare project.
- Our database shows a Stripe customer but **no subscription id and no subscription claim**. ⚠️ **Stripe itself has not
  been checked** (no Stripe access from Claude) — Paul should look once at MCL's Stripe customer for any subscription or
  schedule and cancel it if one exists. (Open action, `12-OPEN-ACTIONS-AND-NEXT-PRIORITIES.md`.)
- MCL's rebuilt site is still the code source of the **only Website Build template** (the locksmith template, pinned to a
  commit of `Beyondweb2/MCLocksmiths-New` — see `05-WEBSITE-BUILD.md`). Using it as a template is structure only; MCL's
  own data, reviews and photos must never leak into another client's site (`inheritedHazards`).
- Old repo `Beyondweb2/MCLocksmiths` is the superseded first build (noindexed `mclocksmiths.pages.dev`); kept as reference.

## RG Locksmiths

- The first customer, on a **legacy outcome guarantee** pinned at 8 weeks (`remeasure_due_date` 2026-10-06, stored by
  hand). The database now shows **`refunded`**, so the scheduler will not re-measure him.
- His frozen baseline audit `f64920ce` stays **suppressed by the competitor junk rule** — do not re-extract its evidence.
- ⚠️ CLAUDE.md still said "RG is due 2026-10-06 — approve the results email before then". That is stale now that the row
  is refunded (corrected in CLAUDE.md in the handover commit). If Paul believes RG should still be measured, that is a
  decision for him — do not change the row.

## SC Plumbing & Gas

- Refunded. Nothing further.

## BS4 Electrical Services (Website Build pilot, not a paying client in the DB list above)

- The Website Build **pilot**: an Astro site in `C:\Users\paulj\BS4ElectricalServices` (GitHub
  `Beyondweb2/BS4ElectricalServices`, Cloudflare project `bs4-electrical-services`, account `beyondwebcraft`, Git-connected).
- **Push to `origin/preview` = the preview deploy** (`https://preview.bs4-electrical-services.pages.dev`, noindexed).
  The production branch `live` is a placeholder. ⛔ **Never push `live`, never touch BS4's Wix site, domain or DNS** — BS4
  stays preview-only until Paul says otherwise.
- In the LeadFinderOS Website Build screen its record reads as **"Bespoke build (set up earlier)"** — a legacy route the
  simple view shows but does not convert. Any change to Website Build must keep that record readable
  (`website-build-simple.test.ts` has a BS4-shaped fixture).
- What BS4 taught the build standard: a reviews widget rendered by JavaScript was invisible to an HTML read; a `mailto:`
  form is not a working form (`docs/website-build-quality-standard.md`).

## ABLM (findable.live homepage proof)

- ABLM is the first before/after evidence (0 → 3 of 18 answers, all Gemini, on town pages — one client, evidence not
  proof). Its result and the MCL showcase are on findable.live's homepage with client consent confirmed by Paul
  (2026-09-30). ABLM has no lead row; `/playbook/:id` resolves its audit id. ABLM's own site needs Wix access.

## Other exceptions worth knowing

- **Test accounts** (`test1`, "Test" `sales-test@leadfinder.invalid`) and every `ZZ QA` lead are in `metric_exclusions`:
  excluded from performance numbers by row, never by name. QA payments are simulated (`scripts/qa-simulate-payment.ts`),
  never a real card.
- **India**: leads can be prospected (+91 numbers, IST send window) but money is GBP-only — India can prospect, not close
  (`docs/india-readiness.md`).
- **Owner of the data**: rows are owned by the data account `pauljsales455@outlook.com`, not by Paul's operator login
  (CLAUDE.md §6). A row under the wrong owner is invisible, not wrong.
