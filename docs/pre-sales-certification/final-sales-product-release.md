# Final sales product release (2026-10-05 → 06)

Integration branch `integration/final-sales-product-release`, worktree `C:/Users/paulj/LeadFinderOS-wt/final-sales-product-release`,
cut from `origin/main` `9fd5a144` (the live v3 commercial/legal release — still the base; `main` had not moved).
Pre-flight: C: had ~76 GB free (no disk blocker).

**Out of scope, untouched:** TPS/CTPS (postponed), the Findable Meta / WhatsApp migration, a new consent model,
`whatsapp-status` signature work, any WhatsApp queue redesign. ⛔ `whatsapp-status` was NOT deployed (§7).

## 1. Source branches (each at its approved commit, each based on 9fd5a144)

| # | Branch | Commit | What |
|---|---|---|---|
| A | `improve/prospect-full-crawl-audit-results` | `d786d2a9` | prospect crawl cap 500, 7-day reuse, grouped site audit, the large audit window |
| B | `improve/outreach-compact-audit-rows` | `7f606023` | compact ChatGPT / Gemini row line, Call screen, check bar, Open next ready; results panel deleted |
| C | `fix/csv-lead-import` | `dd0e2603` (+ `9b1718ab`) | server-side `import_leads`, preview, owner = importer, duplicates / possible matches |
| D | `improve/attribution-review-admin` | `35e37fb5` | held sales are nobody's revenue; resolve from the evidence or override with a reason |
| E | `qa/end-to-end-sales-certification` | `3aa96580` | E2E certification suites; Quick Close monthly-start wording (E2E-11) |

Merged in that order with `--no-ff`. Conflicts (both list-shaped, resolved as unions — no semantic choice):
- `src/lib/whatsNew.ts` (A ⇄ C): both added an entry at the top → both kept, newest first.
- `scripts/pre-sales-final.test.ts` (C ⇄ D): both added their migration to the "later migrations" list → both kept.
Everything else merged cleanly; the combined tree was green before any integration change (333/333 suites).

## 2. Crawl ⇄ compact Outreach reconciliation

- A never touched the Outreach rows, `OutreachTable` / `OutreachMobileCard` markup or the old panel; B deleted
  `SalesCheckPanel.tsx`. Nothing resurrected it (grep: only B's own "is gone" test mentions it).
- **The row = compact CRM**: `ChatGPT x/y · Gemini x/y · Call screen` only. The visible **"reused"** tag B drew beside a
  cached result is REMOVED (integration commit); `cached` stays internal. Tested: a cached row's text equals a fresh one's.
- **The detail** = A's `ProspectAuditDialog`, reached from the row's Call screen → Call tab → "Full audit & website
  evidence" (also the AI check card's "View full audit" and the Crawl check popup's "Full audit"). The pre-existing icon-only
  crawl button stays in the row's action column (no findings on the row).
- The crawl popup still says when a saved crawl was reused — that is an honesty statement about data age inside the crawl
  window, not a row badge, so it stays.

## 3. Crawl rules as shipped (A, unchanged)

Prospect crawl cap `PROSPECT_CRAWL_PAGE_CAP` (500) with explicit capped coverage; a valid full crawl reused for
`PROSPECT_CRAWL_REUSE_MS` (7 days), decided before any fetch; clients / Paid Clients / Website Build stay exhaustive;
robots, sitemaps + indexes, internal links; OAI-SearchBot checked, GPTBot never a finding, no llms.txt, no score; grouped
findings with affected URLs; no website / failed crawl said truthfully. No model, audit or `guard_action` call in the crawl —
the 30-checks/day allowance is untouched.

## 4. The integration's own fixes

| Fix | What changed | Where |
|---|---|---|
| 1. Unsaved note + Escape | ONE leave guard. Fields with typed-but-unsaved text mark themselves (Internal note, Log-a-contact note, private note, Details editor, name / contact-field edits). Escape / outside click / X / Previous-Next ask "Discard unsaved changes?" — [Keep editing] (focused, default) [Discard] — only when something is marked. Escape inside an inline edit cancels that edit only. Escape on the prompt = Keep editing (found in visual QA, fixed). | `UnsavedDraftGuard.tsx`, `LeadDetailDialog.tsx`, `LeadCrmPanel.tsx` |
| 2. Future start date | `salesperson_onboarding_missing` = the live body + one rule: `start_date > London today → not_started`. Ready from the start date itself. `my_onboarding_status` returns the person's own `starts_on` while it is to come. Screen: "Starts on 12 October". | migration `20261011120000`, `salespersonOnboarding.ts` |
| 3. Not-ready wording | `not_onboarded` is said as itself: "Complete your onboarding before using Find Leads." + what is still needed. Edge refusal body `error: 'not_ready_to_sell'` (403); database actions that collapse to `usage_paused` are re-worded only when the person's own server-read status is loaded, not ready and not suspended. Pre-call checks: `not_ready`, never "allowance used". Genuine pause / stop / limit / suspension wording unchanged. | `readinessWords.ts`, `protectionLimits.ts`, `_shared/protection.ts`, `salesCrm.ts`, `campaignRules.ts`, `csvLeadImport.ts`, `edgeInvoke.ts`, `salesCheck.ts`, `Index.tsx`, `LeadSearchContext.tsx` |
| 4. Link expiry | `linkTimeLeftWords`: "send it within about 30 days" (was "about 715 hours"). The lifetime (`SIGNUP_LINK_LIFETIME_MS`, 30 days; shown until 4 h before) is unchanged — the wording was the bug. | `quickClose.ts`, `QuickCloseDialog.tsx` |
| Stale wording | E's Quick Close fix (E2E-11) is in. The sweep found the **Welcome Pack** still telling a client "Monthly payments start six weeks after your first payment" — contradicting v3 (clauses 3.1, 5.6). Now `MONTHLY_START_V3_WORDS`. v1's pinned agreement text and the 5.6 / 5.8 six-week FALLBACK wording are correct and untouched. | `welcomePackHtml.ts` |

E2E-02 and E2E-03 (`end-to-end-sales-certification.md`) are therefore fixed. Also: SQL fixtures that hard-coded
`start_date '2026-10-06'` (a FUTURE date on 5 Oct) in five suites were pinned to `2026-10-01`; E2E's info row became real
assertions (today / past / tomorrow / next month / the guard's reason). `typecheck-baseline.txt`: the same `useOutreach.ts`
TS2345 error re-printed with its union in another order (identical after sorting; still 9).

## 5. Migrations

| Migration | Purpose | Depends on | Read by |
|---|---|---|---|
| `20261010170000_csv_lead_import.sql` (C) | `import_leads(_rows, _commit, _file_name, _import_possible)` SECURITY DEFINER, authenticated EXECUTE; `protection_settings.limits.actions.lead_import` (only when absent) | `guard_action`, `_lead_identity_rows`, `salesperson_ready_to_sell`, owner trigger (all live) | SPA CSV dialog; fn `security-admin` (validates the new `lead_import` key) |
| `20261011100000_attribution_review_admin.sql` (D) | 3 columns + 4 CHECKs on `sale_attribution_reviews`; append-only `sale_attribution_review_events`; `sale_attribution_candidates`; guard / truncate / opened triggers; `resolve_sale_attribution_with_seller`; `resolve_sale_attribution_review` kept as a wrapper | `sale_attribution_reviews` (live, 0 rows) | fns `admin-users`, `admin-overview`, `business-summary`, `paid-client-hub`, `sales-performance` |
| `20261011120000_ready_to_sell_start_date.sql` (integration) | `salesperson_onboarding_missing` + `not_started`; `my_onboarding_status` + `starts_on` | 20261010140000's body (verified byte-identical to live before) | every Ready-to-Sell gate (no redeploy needed — they call the SQL); SPA |

Before applying: none of their objects existed live (read back). Every one was first run inside rolled-back live
transactions together with the test suites (§8).

## 6. Server functions — the exact list (from `check-import-graph --reached-by` + what each change does)

**Deployed (behaviour changes):**

| Function | Why |
|---|---|
| `crawl-check` | A: cap, reuse, failure reason, audit; protection refusal wording |
| `crawl-worker` | A: page cap + grouped audit at finalize. ⚠️ live was v4 (23 Sep); this also brings its shared crawl code up to what `crawl-check` already runs (commits 693e4756, 42ac0fe3) |
| `paid-client-hub` | A: capped label; D: `saleCreditOf`; Welcome Pack v3 wording (operator download) |
| `render-welcome-pack` | Welcome Pack v3 wording (`findable.live/w/<code>`) |
| `admin-users` | D: review list `people` + resolver; Team page readiness with `not_started` |
| `admin-overview`, `business-summary` | D: same loader (unattributed money) |
| `sales-performance` | D: no credit to the current holder for a held sale |
| `security-admin` | C: `lead_import` in `GUARD_ACTIONS` (the old build refuses saving limits with it) |
| `search-leads` | Find Leads: `not_ready_to_sell` refusal |
| `sales-prospect-check` | checks: `not_ready` reason |

**Closure-only, NOT redeployed (no behaviour change):** the other users of `_shared/protection.ts` / `protectionLimits.ts`
(their sales refusal now reads correctly anyway through `edgeErrorMessage` in the browser); the 24 users of `hookScore.ts`
(display-only `citations` field); the 35 users of `findableOffer.ts` (a comment changed); `directory-presence` (crawl lib
additions only); `findable-onboarding`, `paid-baseline`, `quick-close`, `sales-earnings`, `stripe-webhook` (new exports only);
`conversation-triage` (`salesCrm.ts` refusal words unused there).

## 7. `whatsapp-status`

v114, updated 2026-09-30 06:26 UTC — before AND after this release (§9). It reaches `findableOffer.ts` (a comment change
only) and was deliberately excluded. Held for the Findable Meta App secret.

## 8. Combined tests

- `npm run check` on the final tree: typecheck 9 = baseline (list identical), edge syntax / undefined names / import graph
  clean, build OK, **334/334 suites** on the final tree `88218128` (= the merged `main` tree).
- New: `scripts/final-sales-release-fixes.test.ts` (the four fixes, the Welcome Pack wording, the edge wording wrapper).
- **Live, rolled back, all three migrations loaded first** (Management API; each file ends by raising its results):
  CSV 52/52 · attribution review 32/32 · v3 sign-up attribution 24/24 · salesperson onboarding RLS 70/70 · ready-to-sell
  paperwork 13/13 · E2E certification 66/66 (now incl. start date today / past / tomorrow / next month / guard) · abuse /
  cost 90/90 · campaign-claim-contact 67/67 · client tables admin-only 32/32 · dashboard visibility 10/10 · domain authority
  9/9 · multi-user queue 11/11 · next action human-only 19/19 · one-flow 29/29 · reminders 21/21 · no-legacy-interested
  13/13 · outreach ownership 32/32 · sales flow reliability 33/33 · sales media RLS 23/23 · sales readiness 38/38 · sales
  remove/move campaign 36/36 · sales team board 41/41 · self-sourced handoff 41/41 · template requests 10/10 · call workspace
  guards 18/18 · claim rule 16/16 · lead revive 18/18 · payment ledger 6/6 · notifications 9/9 · WhatsApp unread 6/6 ·
  campaign ownership (JSON) all cross-owner calls not_found / unknown_campaign / 0 rows, duplicates name_taken, no owner field ·
  monthly commission tiers (JSON) 1–12 30%, 13+ 40%, refund keeps its stamp and stops counting later places, 31 Oct 23:30
  London = October, November restarts, test sales 0%, old rules untouched.
- **Pre-existing, identical WITHOUT this release (not regressions):** `multi-user-rls` 70/71 (#70 — E2E-06, an automatic
  send that is only `sent` already assigns); `sales-shared-workflow.sql` calls a superseded `lead_set_follow_up` signature;
  `quick-close.sql` (2026-09-29) reads `quick_close_events` as `authenticated`, revoked by a later migration. Their behaviour
  is covered by the newer suites above and the TS suites.

## 9. E2E certification re-run against the combined tree (E's checklist A–S)

A onboarding — PASS (incl. future start now blocks) · B Find Leads — PASS (not-ready refused with the real reason) ·
C prospect check — PASS (30/day, reuse, `not_ready`) · D Call workspace — PASS (+ unsaved-draft guard) · E Quick Close —
PASS (v3 monthly start, link words) · F v3 agreement — PASS (rules suite) · G payment refusal / simulation — PASS ·
H seller attribution — PASS · I attribution hold — PASS (D's resolver, 32/32) · J commission — PASS · K Paid Client — PASS ·
L Access Date — PASS · M baseline / results — PASS (results copy still unapproved, E2E-01) · N guarantee — PASS ·
O Option B date — PASS · P £29.99 Continuing Service — PASS (manual) · Q D/E ownership — PASS · R public site — read-only,
§10 · S `whatsapp-status` held — PASS (v114 before and after).

## 10. Visual QA (real merged components, fixture data, nothing real touched)

A throwaway harness (deleted before commit) mounted the REAL Outreach page, `LeadDetailDialog`, `ProspectAuditFrame` +
`ProspectAuditView` in the real Dialog, `CSVImportDialog`, `AttributionReviewsCard` + `UnattributedNote`,
`NotReadyToSellBanner`, `SalespersonOnboardingPanel` and `QuickClosePanel`, with the Supabase client swapped for a fixture
mock (the live project URL was absent from the bundle; every write attempt recorded — none happened outside the import's own
RPC). Real key presses / clicks in the Browser pane, 1024 px and 390 px. Screenshots were looked at by this session; Paul has
not seen them.

- **Outreach (34 leads, sales + admin):** rows show only `ChatGPT x/3 · Gemini y/3 · Call screen` (a lost answer reads `0/2`),
  Checking… / Waiting / Check failed · Retry / Skipped / Not checked; reused rows identical to fresh; no old panel; bar:
  "Checking 23: 12 ready · 3 checking · 4 waiting · 2 failed · 2 skipped · Stop · Checks left today: 22/30 · Open next ready
  (12)"; Open next ready opened the first ready lead on its Call tab with "Full audit & website evidence"; no horizontal
  overflow at 1024 or 390.
- **Detailed audit** (good / poor / capped 500-of-2,390 / no website / failed / mixed): exactly one vertical scroller,
  nothing past the window edge, at 1366 and 390 (full screen on a phone); "Capped crawl: read 500 of 2,390 addresses found —
  1,890 not read. Not the whole site."; repeated issues grouped ("60 pages affected", "Show all 60"); the largest fixture is
  27 grouped findings covering several hundred page-level issues (grouping is the design, so distinct findings stay well under
  50); no website / failed crawl list no findings; both engines, 6 results, cited sources; no llms.txt / score words.
- **CSV (sales + admin, 390):** mapping auto-matched; preview = one `import_leads` call with commit off, nothing written;
  counts, possible match (same name other town → added and flagged), held (name + postcode), duplicate in file, invalid,
  already yours; a rep sees "Already belongs to another team member" / "a lead elsewhere in the system" (no names), the admin
  sees "owned by Imp B"; result state "3 leads added. 5 row(s) not added".
- **Attribution review:** open review with real evidence (both creators + readiness, claimed seller, owner at payment / now,
  history, every link), three evidence candidates, override list = team minus candidates, Confirm disabled until a ≥10-char
  reason, the confirm text names an ADMIN OVERRIDE and finality, the call carries seller + reason; decided reviews (confirmed
  by override, not credited); "£99.00 awaiting attribution · 1 client" and "£99.00 not credited"; no overflow at 390.
- **Lead workspace:** clean Escape closes at once; with an unsaved Internal note Escape / X / Next ask, Keep editing focused,
  Escape on the prompt keeps editing, Discard closes / moves on and saves nothing.
- **Salesperson:** future start → banner "Waiting on: Starts on 12 October", refusal "Complete your onboarding before using
  this. Still needed: Starts on 12 October."; incomplete → the missing items; ready rep → a genuine pause keeps its words;
  admin checklist "NOT READY TO SELL … Starts on 12 October — not Ready to Sell before then", past start → READY 8/8.
- **Quick Close:** "Then £99 a month, starting the day after your 14-day refund window closes (normally about six weeks after
  you give us access)"; "Sign-up link ready · send it within about 30 days".

## 11. Deployment and live verification

**Order followed:** snapshot → migrations one at a time, each read back → the 11 functions (from the local merge commit, i.e.
the exact tree that became `main`) → `whatsapp-status` checked → push `main` → Cloudflare → both hosts → live checks.

- **Snapshot before:** `main` `9fd5a144`; both hosts served `index-C3SPDHr5.js`; 91 functions; versions in the table below.
- **Migrations applied** (Management API, one at a time, 2026-10-06 London):
  1. `20261010170000_csv_lead_import` — read back: `import_leads` SECURITY DEFINER, authenticated EXECUTE yes, anon no;
     `limits.actions.lead_import` = paid false, per_hour 30, max_rows 500, rows_per_day 3000.
  2. `20261011100000_attribution_review_admin` — read back: the 3 columns + 4 CHECKs, `sale_attribution_review_events`
     (RLS on, authenticated cannot read), the 5 triggers, the 3 functions service-role only; 0 reviews.
  3. `20261011120000_ready_to_sell_start_date` — read back: `not_started` and `starts_on` live, grants unchanged; the live
     body hashes equal the file as sent (sent with CRLF line endings — whitespace only). The one rep record (test1) lists the
     same missing items as before.
  Then, against the LIVE functions (no prepend, rolled back): E2E 66/66 · CSV 52/52 · attribution 32/32 · onboarding RLS
  70/70 · v3 attribution 24/24 · paperwork 13/13.
- **Functions deployed and proven by a marker only the new code has** (deployed bundle via the Management API):

  | Function | Version | Marker |
  |---|---|---|
  | security-admin | v8 → v9 | `lead_import` |
  | crawl-check | v19 → v20 | `PROSPECT_CRAWL_REUSE_MS`, `not_ready_to_sell` |
  | crawl-worker | v4 → v5 | `buildSiteAudit`, `coverage_cap` |
  | paid-client-hub | v62 → v63 | `saleCreditOf`, the v3 Welcome Pack words |
  | render-welcome-pack | v32 → v33 | the v3 Welcome Pack words |
  | admin-users | v72 → v73 | `resolve_sale_attribution_with_seller`, `not_started` |
  | admin-overview | v42 → v43 | `saleCreditOf`, `unattributed`, `sale_attribution_holds` |
  | business-summary | v36 → v37 | `saleCreditOf` |
  | sales-performance | v49 → v50 | `saleCreditOf` |
  | search-leads | v98 → v99 | `not_ready_to_sell`, "Complete your onboarding before using this" |
  | sales-prospect-check | v1 → v2 | "Complete your onboarding before starting checks" |

  Exactly these 11 changed version (the full list was diffed). All answer an OPTIONS preflight (200; `crawl-worker` 405 and
  `render-welcome-pack` 404 are their handlers answering — booted).
- **`whatsapp-status`: v114, 2026-09-30 06:26 UTC before and after. Not deployed.**
- **`main` = `700b6a0c`** (merge of this branch, pushed after `origin` was proven unmoved at `9fd5a144`).
- **Frontend:** both `app.leadfinderos.com` and `leadfinderos-next.pages.dev` serve `index-Bxu2xOa0.js` (~100 s after the
  push). All 106 chunks resolved on each host: present — "Discard unsaved changes?", "send it within about", "Complete your
  onboarding before using", "Open next ready", "Capped crawl", "Starts on", "awaiting attribution", the What's New id, "Full
  audit & website evidence", "Check rows", "Who sold it?"; gone — "Find Leads is paused", the old not-ready sentence,
  "starting six weeks after sign-up".
- **Live safe checks:** 0 attribution reviews, 0 payment holds, 0 `lead_import` calls left by tests; all 10 paid leads keep
  the seller they were stamped with (no migration writes a lead row); `findable-checkout` / `stripe-webhook` / `quick-close`
  not redeployed (payment and agreement flow unchanged); `findable.live/w/<code>` answers with no old monthly wording (a QA
  fixture client's pack shows the v3 words; two prospects show the neutral older-client wording; every real paid client is
  ended / refunded or pre-route, so none is shown v3 timing it did not sign).
- **Public site (read-only, not redeployed):** agreement parity IDENTICAL (139 signed paragraphs, findable-site `5af9064`);
  home / pricing / refunds / terms / agreement: no "six weeks after sign-up", no "eight weeks", no £9.99; `/agreement` is v3.
- Nobody has signed in and LOOKED at the live screens with real data; the visual proof is §10 (fixtures).

## 12. Open items after this release

- **TPS / CTPS** — postponed by Paul.
- **Findable Meta / WhatsApp migration** and **`whatsapp-status` signature verification** — held together (v114 live).
- **Approve the four-week results email wording** (`final-certification.md` §8) before the first v3 client's results are due
  — Paul's decision; nothing is due today.
- Pre-existing, unchanged: Apify cap still US$40 (Paul raises it); E2E-04 / E2E-06 / E2E-07 / E2E-08 / E2E-09 as recorded;
  the three stale SQL suites in §8; `crawlUrl.ts` `CONTENT_ID` (`/^d{1,10}$/`, missing backslash — WordPress `?page_id=` pages
  are skipped as query traps; found by A, not fixed).
