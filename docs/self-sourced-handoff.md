# Self-sourced prospects + paid-client handoff (2026-09-28)

Paul's brief: a salesperson who finds a business themselves (Facebook, LinkedIn, Google, networking, a
referral) handles the whole prospect setup from Outreach — add, dedupe, services/areas, Hook Audit,
full crawl, share the report, work the lead — and when it pays, Paul either has everything to start or
LeadFinderOS says exactly what is missing. Branch `feat/sales-self-sourced-handoff` (LeadFinderOS),
`feat/report-preview-flag` (findable-site). Migration `20260928160000_self_sourced_handoff.sql`.

## 1. What already existed (reused, not rebuilt)

- Add a lead (`AddLeadDialog` → `sales_add_lead`, both roles): server dedupe by place id → phone → Maps
  link (`lead_identity_lookup`), refusal names who has it, assigned to the adder, `lead_source`.
- The Hook Audit for Sales on own leads (`create-ai-audit` + `salesAuditRefusal` + `canWorkLead`),
  3 questions × 2 engines, scored by `hookScore.ts`.
- The exhaustive crawl engine (`crawl-check` → `crawl_jobs` → `crawl-worker`), ONE `lead_crawl_checks`
  row per lead, read by every screen; Sales could already READ it (RLS) but not start it (admin-only).
- The public report (`findable.live/r/<code>`, `render-audit-report`), open tracking on `ai_audits`
  (`first_opened_at` / `open_count`, bots excluded).
- `services_included` on the lead, already ranked as the client record by `clientFacts`/`clientContext`.
- Paid Clients (`paid-client-hub`, admin), the PAID email (`stripe-webhook`), `onboarding_responses`,
  the delivery checklist `gbp_access` tick, `lead_activity`, `sales-performance`.

## 2. What was missing, and what was added

| Gap | Added |
|---|---|
| A hand-added lead has no Google place, so `resolveDerivedTown` stamped `no_place_id` and the town gate refused EVERY one (409 `town_unverified`) | `handTypedTown` exemption in `create-ai-audit`: positive match on `lead_source` set + no place id + the typed town in use. Every other lead gated as before |
| Nowhere for Sales to record services / areas | `outreach_leads.service_areas` (twin of `services_included`); `lead_set_profile` (both roles, own leads; never the phone); Add a lead takes services / areas / address; the workspace's **Services and areas** card |
| The questions were never shown before spending | Propose → review → run: the hook preview is planned by the SAME `finalHookPlan` as the run; the reviewed three are sent back verbatim. No free-text editing (no invented service) |
| No record of who ran a hook audit | `audit_run` activity written by `create-ai-audit` (the comment always claimed the browser did it; nothing did) |
| Crawl admin-only | `crawl-check` admits a salesperson for a lead they work, its own website only (`url`/`audit_id` refused, paste box refused), row filed under the lead's owner; `crawl_run` activity; `crawlOwnLead` permission (both roles) in the workspace header |
| Staff opens took the prospect's "first open" for ever | Every in-app Open report adds `preview=1` (`staffPreviewUrl`); `render-audit-report` skips the count; findable-site `/r/` and `/report/` proxies pass ONLY that flag through |
| Nothing recorded that a report was sent | `report_link_events` (generated / sent) + trigger on `whatsapp_messages` (a real send whose body carries `findable.live/r/<code>` or `/report/<uuid>`; backfill 687 sends / 653 leads) + `lead_report_link_event` ("sent another way"; WhatsApp refused — the trigger records it). Workspace shows Sent / Opened |
| No website dedupe | `website_identity()` (own-site host, `www.` ignored, every aggregator/social/directory host excluded — held to `aggregators.ts` by a test) — **a WARNING, never a refusal** (below) |
| Facebook / email research not selectable | sources `facebook`, `email_research` |
| Nothing kept the seller once paid | `sold_by_user_id` / `sold_at`, stamped once by `trg_outreach_leads_sold_by` when a lead becomes a client, immutable (reassignment / overwrite ignored); 5 existing clients backfilled |
| No readiness check | `src/lib/handoffReadiness.ts` — READY TO START / MISSING INFORMATION (below), one rule for Paid Clients and the PAID email |
| Paid Clients showed no seller / Sales data / hook audit / notes | `paid-client-hub` list: readiness + "Sold by"; `get`: `handoff` (readiness, seller, source, prospect audit link, the last 25 Sales notes/contacts). `ClientHandoffCard` on the client page |
| PAID email had no seller / readiness | "Sold by", `READY TO START` or `MISSING INFORMATION: …`, "Onboarding: complete / not complete yet" — read AFTER the payment write; a failed read drops the lines, never the email |
| Won followed the current owner | `sales-performance` scope includes clients the person SOLD; a win counts for the seller only |

## 3. Decisions taken inside the brief (not re-asked)

- **The website is a warning, not a refusal.** Measured 2026-09-28: 149 own-site hosts sit on 2+ leads
  (lockfit.co.uk 24 branches, cityplumbing.co.uk 20, timpsonlocksmiths.co.uk 13). A hard match would
  refuse a genuine branch, and CLAUDE.md §6 says ambiguity creates a new record. `sales_add_lead`
  returns `site_match` (who has it); the person may confirm "different branch". Place id / phone / Maps
  link stay hard refusals — a contacted or owned lead can still never be re-added or taken.
- **One data model.** Sales writes the LEAD (`services_included`, `service_areas`, `website_control`);
  the client writes onboarding. Nothing is copied. Every reader ranks onboarding above the lead
  (`handoffReadiness`, `clientFacts` — areas now have a `client_record` source — `clientContext`, used
  by `paid-baseline`). The welcome pack does NOT read `service_areas` (client-facing; left alone).
- **The Hook Audit is required? No.** It is shown on the handoff, never blocks READY (a free-check
  client arrives with a different audit and the paid baseline replaces it).

## 4. READY TO START / MISSING INFORMATION (`handoffReadiness`)

Required, each satisfied by the client's onboarding OR by Sales, and saying which:
payment confirmed (`isPaidLead`, amount > 0, not refunded) · business name · phone or email · main
services · service areas · website (a site, or a positive new-site / no-website) · website access /
control (onboarding `website_route`/`website_manager`, or Sales' `website_control` — `unknown` is NOT
an answer) · GBP access (Findable's `gbp_access` tick, or the client saying `done`; `will_do`,
`no_access`, blank are missing) · website crawl (only when there is a site). Informational: Hook Audit.
Derived on every read, never stored.

## 5. What counts as a report OPEN

A non-bot load of `findable.live/r/<code>` or `/report/<id>` WITHOUT `preview=1`. The app's own Open
report buttons (hook card, previous report, paid-client handoff) all add it. Copy link copies the clean
URL for the prospect. Anyone can append the flag, which only under-counts. Opens before 2026-09-28 may
include staff opens. `openedBeforeSend` flags a first open earlier than any recorded send.

## 6. Tests

- `scripts/self-sourced-handoff.test.ts` (89 checks, in `npm test`): readiness cases (either source,
  rank, positive matches, refunded/unpaid/absent), share rule, preview wiring (app + findable-site),
  source list == CHECK == function, host list == aggregators.ts, GBP key, hook 3×2 + one plan + gate
  shape, crawl gates, sold_by immutability, the fold's seller rule, email/hub wiring, activity words.
- `supabase/tests/self-sourced-handoff.sql` — 41/41 on the live schema, always rolled back: add with
  source/services/areas (cleaned), phone duplicate refused, bad source, website WARNS (Paul's lead,
  another rep's), Facebook page not an identity, confirm-as-branch, profile own/others/anon, direct
  UPDATE = 0 rows, B cannot re-add / claim / read / edit A's lead, the WhatsApp report trigger (once,
  unknown code harmless), share events (dedupe, channels, WhatsApp refused, other lead's audit refused,
  RLS), payment stamps the seller, reassignment + overwrite ignored, client leaves the rep's view.
  Re-run with all six older suites the same day: 11/11, 70/70, 18/18, 23/23, 38/38, 37/37.
- Gate: 215/221 — the six known-stale suites only; typecheck 9 = baseline; build passes.

## 7. Deploy (2026-09-28)

- Migration applied one statement at a time and read back (columns, view, triggers, policies, anon
  EXECUTE false on every new function, 5 clients stamped, 687 report sends backfilled).
- Edge, from the merged tree, markers read back from each deployed bundle: `render-audit-report`,
  `sales-performance`, `crawl-check`, `create-ai-audit`, `paid-baseline`, `paid-client-hub`,
  `render-welcome-pack` (clientFacts), `stripe-webhook`.
  ⚠️ **A concurrent session (dashboard visibility, `ef43ab46`) deployed `sales-performance` a minute
  before my redeploy, which replaced theirs.** Found by the marker check, fixed by merging their main
  and redeploying (v6 carries both `lastActivityAt` and `sold_by_user_id`); ~2 minutes without their
  field. Rule it teaches: before deploying a shared function, `git fetch` and check whether main has
  a newer commit touching its closure.
- findable-site master `b5f470d` (`--branch=master`, account 4148056c…). LeadFinderOS main `2123d015`;
  leadfinderos-next bundles carry every new marker (Outreach, the workspace chunk, Paid Clients,
  ClientHub).

## 8. Live QA (2026-09-28, the Test salesperson via a one-time link; admin the same way; both ended with logout?scope=local)

As Sales, on "QA Test Findable Self-sourced Plumbing" (fictional 07700 900741, website findable.live):
add 712 ms · same phone again refused ("yours", Test) 315 ms · profile 287 ms · **propose questions
7.7 s** (3: leak detection / boiler repair / radiator installation, from the recorded services) · hook
start 4.3 s · **hook complete 179 s: 3 × 2 × 1, 6/6 valid, complete, named 0/6** (scored by the app's
`scoreHookRun`) · crawl start 6.4 s, **complete 28 s** (20 discovered, 17 fetched, 3 skipped) · refused:
another URL (`lead_website_only`), Paul's lead (`not_your_lead`), the paste box (`lead_required`), an
audit on Paul's lead, Paid Clients (`admin_only`) · contact logged 236 ms · next action set/cleared
~260 ms · report: `findable.live/r/84nwm3?preview=1` → opens stayed 0; plain load → 1; `/r/zzzzzz` 404
"unavailable" · leak scan of the public page: no note, rep, cost, key, source, Stripe or amount ·
copy + "sent on LinkedIn" recorded, on the history.
Paid (set as Mark Paid writes it; no Stripe charge): seller stamped = Test; the client left the rep's
view; the rep's dashboard lists it as won with no amount. Admin Paid Clients: list "Sold by Test ·
MISSING INFORMATION · 2"; client page: missing Website access / control, GBP access; everything else
"(Sales)". Reassigned to Paul → still won for Test. Client onboarding added → READY TO START, items
now "(client)". The poller read (`handoff:false`) carries no handoff. Timings: hub list 1.8 s, get
2.7–3.1 s, report page 4.4–5.5 s through findable.live, sales-performance 1.1–3.0 s.
Restored: the lead (cascade: audit, run, 3 queue rows, crawl job + 20 URLs, crawl row, 10 activity rows,
2 share events) and the onboarding row deleted by id; zero left.

## 9. Not verified / remaining

- **The PAID email was not sent** (it needs a real Stripe event). Its code is unit-pinned and its
  bundle marker is live; the first real payment is its live test.
- **Nobody has SEEN the new screens** (production sessions may not be put into the browser pane).
  Bundles and API responses prove them; Paul should open a paid client and the workspace once.
- The public report carries the lead id in its sign-up link (pre-existing design, all reports).
- The client's onboarding form does not prefill from what Sales recorded (readiness does not need it).
- The Inbox's copy-link on the hook card does not record "generated" (the workspace's does).
- `scripts/verify-live.mjs` still checks the retired £29.99 offer text on findable.live (stale script).
