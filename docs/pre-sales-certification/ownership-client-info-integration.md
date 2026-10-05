# Ownership + client info — integration and deployment (2026-10-05)

Integration of two finished branches into production `main`:

| | Branch | Commit | What |
|---|---|---|---|
| D | `fix/outreach-lead-ownership` | `63061134` | Outreach lead ownership (My leads / Unassigned / salesperson / All team (owned)), owner-at-add, cross-owner send confirmation, campaign-launch owner scope, enrich-lead + contact_check leaks |
| E | `feature/client-missing-info-actions` | `c4a2b56e` | Paid Client missing information: Find what we already have, Ask salesperson, Contact client |

Branch `integration/ownership-client-info`, worktree `C:/Users/paulj/LeadFinderOS-wt/ownership-client-info`, from
`origin/main` `52b15962` (both branches were based on that exact commit; main had gained nothing since).

⛔ **Not in this release:** client-agreement acceptance, payment-agreement gating, the onboarding contract UI, the Stripe
checkout contract logic and the salesperson agreement. Paul is having both agreements rewritten; "client agreement must
be accepted before payment" is a future rule, built only when the final text arrives. The merged diff touches no
checkout / stripe / agreement / contract / onboarding / payment / billing / commission file (checked by path).

## 1. Merge and conflicts

- D merged clean (`579992d5`).
- E (`6569f82b`): two conflicts, both resolved by keeping BOTH sides:
  - `src/lib/whatsNew.ts` — D's `2026-10-05-outreach-my-leads` entry and E's `2026-10-05-client-missing-info` (admin) +
    `2026-10-05-client-info-needed` (sales) entries all kept.
  - `scripts/pre-sales-final.test.ts` — the `LATER` migration list = the union: `20261009090000_client_info_requests`,
    `20261009150000_campaign_launch_owner_scope`, `20261009160000_lead_owner_on_add`.
- `CLAUDE.md` and `docs/INDEX.md` auto-merged (each branch added its own lines; read and kept).

## 2. Gate

`npm run check` on the merged tree: typecheck 9 = baseline LIST, edge syntax / undefined-name / import-graph clean
(68 entrypoints, 0 faults), build ok, **317/317 suites** (main 315 + `outreach-owner-scope` + `client-missing-info`).
findable-site input: `findable-site-current` at `origin/master` `f23d42e`, clean. Named suites all PASS, among them:
outreach-owner-scope, outreach-filters, campaign-ownership, campaign-interleave, initial-opener-select,
opener-contact-guard, client-missing-info, paid-client-automation, paid-client-hub-resilience / -no-writes / -membership,
quick-close, quick-close-links, quick-close-events-locked, payment-client-state, payment-confirm, payment-email-guard,
lead-payment, commission-six-trailing, monthly-commission-tiers, remeasure-schedule, remeasure-results, the baseline
suites, website-build-* (v1, v2, simple, launch, execution, recon, mapping, standard, claims), pre-sales-final.

## 3. Migrations — applied one at a time, each read back

Exact new migrations in the merged tree (none was live; `schema_migrations` is not used — hand-applied history):

| Order | File | Pre-check | Read back |
|---|---|---|---|
| 1 | `20261009090000_client_info_requests.sql` (E) | table absent; both live CHECK lists are exact subsets of the new ones (only the new kinds added) | table + 12 columns, RLS on, one SELECT policy (admin or `seller_user_id = auth.uid()`), `authenticated` SELECT only, `client_info_requests_one_open` partial unique index, both CHECKs carry the new kinds; 0 rows; notifications 58 / lead_activity 1,242 unchanged |
| 2 | `20261009150000_campaign_launch_owner_scope.sql` (D) | live `campaign_launch` body byte-identical to `20261008100000`'s; the new body differs only by added lines | `prosrc ~ 'other_owner'` and the owner filter; one function, SECURITY DEFINER; anon cannot execute |
| 3 | `20261009160000_lead_owner_on_add.sql` (D) | trigger absent; columns present | `trg_outreach_leads_added_by_owner BEFORE INSERT` (fires first by name); function not executable by `authenticated`; leads by owner IDENTICAL before/after: unassigned 2,694 · Paul 2,815 · Test 32 · test1 9 (5,550 total) |

**Rolled-back live QA (nothing persisted — every block ends in RAISE):**
- E (one DO block): first open request ok · second open → `unique_violation` · seller sees 1, seller UPDATE / INSERT →
  `42501` · another salesperson sees 0 · admin sees 1 · anon → `42501` · closing without a reason → `check_violation` ·
  a new request after an answered one ok · the new notification + three History kinds accepted. Read back: 0 rows,
  counts unchanged.
- D (`supabase/tests/outreach-ownership.sql`, now against the LIVE migrations): **32/32** — salesperson isolation
  (view, direct reads, queue → `not_yours`, stage / Next Action / star / archive / unqueue refused, direct UPDATE 0 rows),
  campaigns own-only, a rep's add owned by the rep, a nominated owner ignored, a direct insert owned by another rep
  refused, **Paul's Find Leads add with no owner field owned by Paul**, admin launch skips other owners (`other_owner`)
  and the unassigned member (`unassigned`) and queues only Paul's own, Claim makes the lead Paul's, a system insert stays
  unassigned. Read back: 0 fixture users / campaigns left, owner counts unchanged, `queued` 2 (unchanged).
- The ~2,694 historical unassigned leads were NOT claimed or migrated.

## 4. Edge functions

Closure computed from the merged diff (`check-import-graph --reached-by`), not from the branch descriptions:

| Function | Why | Marker in the live bundle (Management API body) |
|---|---|---|
| `paid-client-hub` | E: missing-info actions; `clientMissingInfo.ts`, `_shared/client-info-request.ts` | `client_info_requests` |
| `quick-close` | E: seller's `save_client_info`, request view | `client_info_requests` |
| `enrich-lead` | D: `mayLookUpBusiness` before the place-id cache | `const mayPlace` |
| `process-whatsapp-queue` | D: contact_check cut to the rep's own numbers | `own.has(tail(` |
| `admin-overview`, `business-summary`, `conversation-triage`, `sales-performance` | reach `src/lib/salesCrm.ts` (E added three `ACTIVITY_LABEL` entries) — CLAUDE.md §3 closure rule | `client_contact_opened` |

All eight: OPTIONS 200 with CORS, unauthenticated POST refused (401) as before. Before deploying, their live bundles
already held main's latest code (e.g. `reachedInConversation`, `APPROACH_ROUTE`), so the redeploy shipped only this release.
**Not redeployed:** `findable-onboarding`, `paid-baseline`, `stripe-webhook` — they reach `_shared/client-setup.ts`, whose
only change is the `LeadEventKind` TYPE (erased at bundle time; runtime identical), and the payment path is deliberately
untouched in this release. **`whatsapp-status` HELD** — still v114 (2026-09-30); no Meta / WhatsApp credential or secret touched.

## 5. The ownership model (D)

- Admin Outreach opens on **My leads** = leads owned by Paul. **Unassigned** is its own scope — never treated as Paul's.
  Each salesperson by name, and **All team (owned)** = every owned lead, unassigned excluded. The choice is not remembered.
- Salesperson: own leads only; no owner control; cross-owner writes refused server-side.
- New leads: added by Paul → Paul's; by a salesperson → theirs; a service-role / system insert stays unassigned.
- Claim for me (Unassigned view) → `assign_lead`, still-unowned only, capped; messages nobody.
- Queue WhatsApp across more than one owner → a second confirmation ("Queue across team", Cancel focused).
- Campaign launch: only the campaign owner's leads; others reported `other_owner`, unassigned reported `unassigned`.
- 52 never-contacted unassigned leads sit in Paul's live campaigns (Locksmiths 24, Morgage 21, Plumber 2 5, Accountants
  1, plumber 1 — re-derived live) — Paul claims them before relaunching (open actions).

## 6. The client-info workflow (E)

- **Find what we already have:** onboarding forms, website crawl, the salesperson's handoff, Quick Close answers — each
  source shown separately; crawl values are labelled unconfirmed guesses; nothing is applied until Paul presses Use (by
  candidate id); domain / Google access / setup-form answers are never guessed.
- **Ask salesperson:** only when another active seller (`sold_by_user_id`) sold it; one open request per client (unique
  index — idempotent); the seller sees CLIENT INFO NEEDED and answers through the existing handoff; only that seller may
  answer; Paul is notified. Paul's own sale shows no Ask.
- **Contact client:** opens the right Inbox conversation with an INTERNAL "Need from this client" note (Copy / Put in reply
  box); Meta template and 24-hour rules unchanged; email / phone fallback.
- Filling the real fields removes the missing items (the list is always re-derived from the checklist).
- **Nothing auto-sends.**

## 7. CSV import — separate bug, not fixed here

Confirmed live: `bulkImportLeads` (`src/hooks/useOutreach.ts`) inserts `list_type: 'imported'`;
`outreach_leads_list_type_check` allows only `no_website` / `broken_website` / `manual` (all 5,550 live rows are
`no_website`). Present on `main` before D/E. Recorded as **CSV IMPORT — BROKEN / NEEDS FIX** in
`docs/handover/12-OPEN-ACTIONS-AND-NEXT-PRIORITIES.md`.

## 8. Visual QA

Two throwaway harnesses on the MERGED tree (real components, `vite build` from the worktree, fixture data, every
Supabase / edge / fetch call mocked and recorded, no network; headless Edge; harness folders deleted). Fixture leads are
"ZZ QA …" on 07700 900xxx numbers. Nobody has seen these on the live app; screenshots were looked at by the session.
Horizontal overflow: **0 px in every state** at both sizes (desktop reads −10 px = the scrollbar).

**Outreach** (real `Outreach` page behind `RequireAccess`; 40 leads: Paul 12, unassigned 8, test1 12, Test 8;
1440×1000 and 390×844):

| State | Desktop | Phone |
|---|---|---|
| Admin default | `Outreach (12)` "Leads you own.", control "My leads", all Paul's, no unassigned | same, 10 of 12 on page 1 |
| Unassigned, ticked | `(8)`, amber "Unassigned" tag, claim line, **Claim for me (8)** | **Claim for me (4)** |
| Claim for me pressed | confirm "…Nobody is messaged."; only `assign_lead` × 8 (+ list refresh, `lead_activity` read); no edge call, no queue, no WhatsApp | same, × 4 |
| Unassigned (ticked) → test1 | 0 ticked, no bulk toolbar | same |
| test1 | `(12)` "Leads owned by test1." | same |
| All team (owned) | `(32)` "…Unassigned leads are not included." | same |
| All team → Select all → Queue WhatsApp | "32 leads across 3 owners — You 12 · test1 12 · Test 8"; "Queue 32 across team…" made ZERO calls and opened the second confirmation; **Cancel focused**; Cancel made zero calls | no Select all on phone; 10 visible ticked = 2 owners (Test 8 · test1 2), same confirmation, Cancel focused |
| Salesperson (test1) | `Outreach (12)`, own only, no owner control | same |

**Paid Client** (real `ClientSetupCard` → `ClientMissingInfoPanel` + `KnownInfoFinder`, data built with the same
library functions the server uses; real `ClientInfoNeededHelper`; real `QuickClosePanel` as a salesperson; 1280 + 375;
the whole ClientHub / Inbox pages were not rendered):

| State | Seen |
|---|---|
| Paul's own sale | six items; **no Ask salesperson**; Contact client / Email / Call / Copy request / Find |
| Salesperson's sale | **Ask salesperson**; items say "Test may know" |
| Find what we already have | one read-only `gather_known`; each source separate and labelled (earlier form, free-check form, their website, the crawl, the handoff, the Quick Close answer); website finds say "a guess until the client confirms it"; nothing changes until Use |
| Use pressed | only `apply_known` with a `candidate_id` (no value), then re-read; Services left the list |
| Domain missing | listed, never guessed; "domain, Google access and their setup form can only come from the client" |
| Outstanding request | fresh: "Requested from Test", Remind disabled; a day old: Remind enabled → one `request_client_info` `remind:true` |
| Ask double-click (mouse) | one call, then "Requested from Test". (Two script clicks in the same instant both left the browser; the server's one-open unique index refuses the second — verified live, §3.) |
| Seller answered | only GBP access + onboarding left; "Test answered your request" |
| Existing conversation | Contact client → `client_contact_opened` (`via: whatsapp`) and `/inbox?lead=<id>&need=…` |
| No conversation | start on WhatsApp (template / 24-hour rules note) + Email + Call; Meta-rejected → Email + Call; no phone / email → a sentence, no dead button |
| Inbox note | "Need from this client · internal — never sent"; Copy request + Put in reply box (window open), Copy only (closed); pressing them made **zero** server calls |
| Salesperson CLIENT INFO NEEDED | expanded, the asked items, the form; Save → one `quick-close` `save_client_info` |
| Fields filled (item 19) | 6 items → 2 → box gone, READY TO SUBMIT |

Small copy points noticed, NOT changed (E's behaviour preserved exactly; for a later tidy): the no-contact sentence says
"setup link above" but the button sits below unless the first-contact box shows; the Inbox draft leaves out the
"setup form" item by design (`onboarding` filtered); "Website" in the box vs "Current website" in the finder.

## 9. Deployment and production verification

Order followed: gate green → the three migrations one at a time, each read back → rolled-back live QA → the eight edge
functions, each marker-verified → integration branch merged to `main` (`--no-ff`) and pushed → the SPA ships from `main`
→ production check below.

PRODUCTION_RESULT_PENDING (recorded in the follow-up commit after the live check)
