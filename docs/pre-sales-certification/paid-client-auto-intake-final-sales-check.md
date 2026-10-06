# Paid client auto-intake, Send to Paul, final sales readiness (2026-10-06)

Branch `improve/paid-client-auto-intake-final-sales-check` (off `main` `719e5c76`).
Scope: SALE → HANDOFF → PAID CLIENT → AUTOMATIC INTAKE → final sales certification. Operational only:
the agreement, prices, terms, guarantee, seller attribution, commission and Stripe are **unchanged**.

## 1. Quick Close look

Paul disliked the large teal/cyan panels. Quick Close (`QuickCloseDialog.tsx`, `SalesHandoffForm.tsx`, the Quick
Close button and the Website approach field) now uses the Sales Dashboard language, scoped to these files only:
dark card surfaces with a thin accent edge (`PANEL` + `EDGE.blue`), blue for the workflow and its buttons, Findable
yellow for emphasis (the guarantee shield), green only for a genuine success (paid, link ready, sent), amber
waiting, red stop. No `teal-` / `cyan-` class or teal-tone wash remains in Quick Close (pinned by the test). The
shared `TONE.green` (teal) was NOT changed — the parallel design branch owns the shared tokens.

## 2. Send to Paul

- The handoff form (`SalesHandoffForm`, given `onSend`) ends with **HANDOFF COMPLETE → [Send to Paul]** once every
  required answer is in; before that it is "Save handoff · N answers to go — then Send to Paul"; after sending it
  shows "Sent to Paul · <time>" and later edits are "Save changes". Paul's own client page has no Send button.
- The handoff fold opens by itself once the sign-up link is out, after payment, or when it is ready to send
  (still below the terms and the link — M-013's order is kept).
- fn `quick-close` mode **`send_to_paul`** (before or after payment): saves what the form holds (the same save path
  as `save_handoff`), re-checks every required answer on the server (`handoffSendRefusal`), then inserts the ONE
  `client_handoff_sends` row (unique per lead): who sent it (id, name, role — kept after a Disable), when, paid or
  not, the exact sign-up (`onboarding_id`), the answers and the Quick Close answers. Only the winning insert writes
  History (`handoff_sent`, once per lead — unique index) and Paul's ONE bell notice (`client_handoff`,
  "NEW CLIENT HANDOFF · <client>", "From <rep>. Awaiting payment …" / "Paid …", dedupe `handoff_sent:<lead>`,
  link `/paid-clients/<lead>` or `/paid-clients?handoff=<lead>`). A second press, two tabs or a retry read the
  first send back. Paul's own send notifies nobody. Never a message to the client; nothing commercial touched.
- Paid Clients shows **"New client handoffs · awaiting payment"** for sends whose lead has not paid; the moment it
  pays it moves into the client list and the intake merges the handoff.

## 3. The paid trigger

`trg_client_intake_on_paid` (migration `20261013120000`) on `outreach_leads` AFTER INSERT OR UPDATE OF
amount_paid, status: when a lead ENTERS the Paid Clients list (`isPaidClient`: an amount, or Mark Paid's status;
never refunded, never ended) it inserts ONE `client_intake` row (`queued`, `payment` / `manual_paid`) and kicks the
worker (`invoke_client_intake` → pg_net, sent after commit). Every route into Paid Clients writes that row — Stripe,
the QA payment simulation, Mark Paid, the manual add — so stripe-webhook itself is unchanged. Not on Interested, a
sign-up link or a drafted handoff. A failure inside the trigger is swallowed (never blocks a payment).
Backstop cron `client-intake-run` (every minute) posts only while a row is due.

## 4. The intake (`src/lib/clientIntake.ts` rules, `_shared/client-intake.ts` database half, fn `client-intake`)

COLLECT → NORMALISE → MERGE → FLAG CONFLICTS → FIND GAPS. One run per client at a time: a conditional claim on the
state just read (`queued`, or `running` / `crawling` whose lease ran out). Each source is its own step; one failing
read marks that step and the rest carry on. Attempts capped (`INTAKE_MAX_ATTEMPTS`); polling a running crawl is not
an attempt. Statuses: queued (Gathering existing information) → running (Merging findings) → crawling (Crawling
website — the client is usable) → ready (nothing needed, nothing to review) / needs_attention.

**Sources (all stored data, no paid API):** lead record · sales handoff + the send · Quick Close answers · client
onboarding (the counted row + earlier forms) · signed v3 agreement acceptance · Google Places (the lead's own
columns + `phone_cache`, reused — no new lookup) · Companies House (a stored strong match) · the prospect hook audit
(scored with the card's ruler) · the lead's canonical social profiles · the website crawl (`lead_crawl_checks`
`result.siteInfo` + `full_evidence.business` / audit / families / stats).

**Precedence (`SOURCE_RANK`):** confirmed by Paul > client (onboarding, signed agreement) > salesperson (handoff,
Quick Close, lead details they set) > structured records (Companies House) > lead record > existing website >
Google business data > inferred (hook audit). A lead with a Google place id carries Google's own name / phone /
website / address — labelled Google business data; a hand-added lead's are the lead record.

**Conflicts:** rank picks the shown value; a disagreeing source at or above the field's `conflictFrom` marks the field
**"Needs review — conflicting evidence"** with every source listed (phone / address / email / areas / name…). Same
value spelt differently is not a conflict (UK phones, www, postcodes, Ltd). Lists are never merged; a client's list
wins whole. Website menu items never conflict with a client or sales services list (they stay a listed source).

**Paul's controls (fn paid-client-hub `intake_fact`, admin):** Confirm (the value the SERVER shows now), Edit, "Wrong —
reject" (a source's value, never shown again), Back to automatic. Stored in `client_intake.overrides`; a confirmed
value outranks every source and no later research replaces it. Confirming services / areas (or a website where none
is on file) also writes the lead field the setup checklist reads. History `client_fact_set`.

**Auto-fill ("Find what we already have", done for Paul):** `gatherKnown` candidates for the missing checklist items,
applied ONLY from client / sales sources (`AUTO_APPLY_SOURCES`: earlier forms, free check, handoff, Quick Close),
only into BLANK lead fields (the blank test is on the UPDATE), History `details_set` with `auto_intake`. ⛔ Never a
website find — the crawl never merges into what the baseline measures. The "Find what we already have" button stays
as the fallback.

**The website crawl (`crawlPlan`):** no website → not needed; a FULL crawl of the same site younger than
`CRAWL_FRESH_MS` (not failed) → reused; any crawl already running → waited on; otherwise ONE exhaustive crawl through
crawl-check's internal intake door (`isIntakeCrawlRequest`: internal + `mode: "full"` + `requested_from:
"client_intake"` + a lead id, no URL; crawl-check refuses it unless the lead is a paid client; the job is filed under
the book). An intake starts at most one crawl; if it fails (site down) or runs past `INTAKE_CRAWL_MAX_WAIT_MS` the
intake finishes without it. "Refresh research" may start one more only when no fresh full crawl exists.
⛔ This reverses "payment never crawls" (Paul's brief, 2026-10-06). The webhook itself still never crawls.

**Not done automatically:** the paid 20 × 3 × 2 baseline (still waits for Paul / the Access Date), Discovery,
questions, any message, any Google / Apify / OpenAI call. "Refresh Google data" (one Places lookup, a small
charge, the existing guarded function) is Paul's button only.

**Finishing:** History `client_intake` (event `ready`, once per lead — unique index) and ONE notification
(`client_intake`, "CLIENT READY · <client>" or "… needs attention", dedupe `client_intake:<lead>`).

## 5. Paid Client page (first open)

`ClientIntakeCard` at the top, above the setup checklist: status line ("N sources checked · N fields populated · N
items still needed · N to review"), the source steps, then **Still needed / Needs review** (pointing to the existing
Missing information box — find again, ask salesperson, contact client), **Who are they**, **What did they buy**, **What
did Sales tell us** (sent by / when, the answers, the call answers), **What did the client tell us** (onboarding +
signed agreement), **What they do** (services, areas), **What did we find** (crawl summary + top findings, the
quick AI check — labelled the prospect check, not the guarantee — and website evidence with page links), then
**For the new website (Build)** — content reuse: REFERENCE ONLY — DO NOT REUSE unless the client confirmed rights
(`contentReuse`: Quick Close `rights` / onboarding `site_rights`; a no anywhere wins) — or **For optimising their
website (Optimise)** (size, page types, platform, who controls it, technical issues; nothing changed until access).
While research runs the card polls `intake_view` only (15 s) — never the whole page.

## 6. Security

`client_intake`: RLS on, no grants, no policies (service role only — paid-client-hub, admin). `client_handoff_sends`:
select = admin or the sender; no write grants (fn quick-close only). paid-client-hub (whole function) is
`requireAdmin`; fn client-intake is internal (CRON_SECRET); quick-close `send_to_paul` uses the existing `mayHandoff`
(admin; the rep working it before payment; the SELLER after) with a recorded denial.

## 7. Tests

- `scripts/paid-client-auto-intake.test.ts` — the rules and source sweeps (Send to Paul rule / form / server /
  idempotency / snapshot / notice; migration kinds, uniques, RLS, trigger transition; precedence; conflicts;
  overrides; every source mapped; gaps; crawl decision; auto-fill; content rights; no paid API / no message / no
  baseline; Paul's screen; the look).
- `scripts/paid-client-auto-intake-run.test.ts` — the REAL `runClientIntake` on an in-memory database: claim once,
  one crawl, wait ≠ attempt, merge on finish, one History line + one notice, re-run reuses the crawl, no website,
  crawl failure, a source read failure, refunded / ended not researched, retry cap, nothing sent.
- `supabase/tests/paid-client-auto-intake.sql` — rolled back, live: 24/24 (trigger: payment, replay, Mark Paid, not
  Interested, refunded / ended, manual add, PK; send unique, role check, History once, RLS sender / other rep /
  admin / anon, research table unreadable by Sales; kinds; notification dedupe; worker door; cron).
- Updated (intentional behaviour changes): `quick-close-links` (handoff opens once the link is out / ready to send),
  `self-sourced-handoff` (intake job filed under the book), `paid-client-hub-resilience` (new columns).

## 8. Visual QA

Throwaway harness (real components, fixture data, network blocked, deleted before commit), headless Edge at 1280
and a fixed 390 px frame: Quick Close questions, link ready + handoff complete + Send to Paul, sent, paid (one step
left); Client intake Build (conflicts, reference-only), Optimise, crawling. No horizontal overflow at 390. Seen by
the session; not seen live by Paul.

## 9. Deploy

1. SQL `20261013120000_paid_client_auto_intake.sql` (additive; no column on outreach_leads), read back.
2. Functions: `client-intake` (new), `crawl-check`, `quick-close`, `paid-client-hub`; for the History labels:
   `admin-overview`, `business-summary`, `conversation-triage`, `sales-performance`.
   Reached by the shared changes but behaviour-identical (only unused new exports / type members) and NOT redeployed:
   `stripe-webhook`, `findable-checkout`, `findable-onboarding`, `paid-baseline`, `crawl-worker`, `directory-presence`.
   ⛔ `whatsapp-status` not deployed.
3. SPA via `main`. Live verification: see the session report.

## 10. Deployed (2026-10-06)

- SQL `20261013120000` applied 11:2x UTC and read back: both tables + columns, `client_intake` 0 policies and no
  `authenticated` select, `client_handoff_sends_read`, trigger, cron `* * * * *`, both kind lists widened.
- `main` `5df464b6` (release) then `acd0e53a` (follow-up: website-only services / areas count as "confirm what we
  found"; QA payment simulator speaks v3). Reconciled twice with parallel merges (quick-report fix, full-app design
  consistency — no file overlap with Quick Close; What's New and the ClientHub header merged by hand). Gate 342/342.
- Functions (markers read from the deployed bodies): `client-intake` (new, v1 → v2), `crawl-check`, `quick-close`,
  `paid-client-hub` (×2), `admin-overview`, `business-summary`, `conversation-triage`, `sales-performance`.
  Not redeployed (reached only by unused additions): `stripe-webhook` v164, `findable-checkout` v76,
  `findable-onboarding`, `paid-baseline`, `crawl-worker`, `directory-presence`. ⛔ `whatsapp-status` v114 untouched.
- SPA: `app.leadfinderos.com` and `leadfinderos-next.pages.dev` both serve "Send to Paul", "Client intake",
  "Needs review — conflicting evidence", "awaiting payment".

## 11. Live certification (production, fixture `ZZ QA-I1 Auto intake` `1f000000-0000-4000-8000-0000000000f1`)

Signed in as the Test salesperson and as Paul by magic link (sessions revoked afterwards, scope=local). No message to
anyone, no card, no Stripe object.

| Step | Result |
|---|---|
| Rep: Quick Close answers (Build), Create sign-up link | `findable.live/agree/<token>` — a sign-up link, never Stripe |
| Rep: Send to Paul with a partial handoff | 409 `handoff_incomplete`, the four missing answers named |
| Rep: Send to Paul complete, then again | 200, the same send both times; 1 row, 1 History line, 1 "NEW CLIENT HANDOFF · …" ("Awaiting payment", `/paid-clients?handoff=…`) |
| Rep reaches Paid Clients / intake / facts | 403 `admin_only` ×3; `client_intake` 42501; own send only; 0 raw lead rows; none of Paul's notices |
| Fixture client signs v3 on the agreement page | v3, `agree_page`, the exact sign-up, authority confirmed; no pay button before signing |
| Lead reassigned to Paul, then paid (simulated, delivered twice) | paid; **seller = Test** (creator of the sign-up); 1 ledger row (test_excluded 0%); 1 Payment received |
| Automatic intake | queued by the trigger and run within ~1 s; ONE full crawl via the intake door; merged at the next tick; 10 sources, 12 fields; conflict Email (fixture vs website); ONE "CLIENT INTAKE DONE" notice + ONE History line |
| Paul: client page / list | intake on the page (Build, content REFERENCE ONLY, sent by Test before payment); client listed with its intake state |
| Paul: Refresh research | crawl reused (still 1 job), no new notice |
| Paul: Confirm services / reject the website email / refresh | services written to the lead and confirmed; conflict cleared; a further refresh overwrote neither |
| Rep after payment | sees Paid, the send, "Finish the handoff" lists it as sent; can no longer make a link (403) |
| Fixture ended | archived, no contact, excluded |

⚠️ The first simulated payment used the pre-v3 simulator and was correctly HELD (`client_payment_holds`, "PAYMENT HELD"
bell item + operator email). Fixed by teaching the simulator the v3 markers; the hold row and its bell item are left
OPEN for Paul (resolving it was not permitted to this session).

Live SQL suites (rolled back): paid-client-auto-intake 24/24, outreach-ownership 32/32, call-workspace-guards 18/18,
claim-rule 16/16, next-action-one-flow 29/29, sales-readiness 38/38, self-sourced-handoff 41/41,
client-tables-admin-only 32/32, abuse-cost-protection 90/90, multi-user-rls 70/71 (the known E2E-06 item),
v3-signup-attribution 20/24 (the four stale checks its header marks wrong-by-design since the selling gate became
account-only — they prove an incomplete checklist no longer blocks). A brand-new rep with NO onboarding record: ready
to sell, adds a lead that is theirs, sees nothing else.

Not driven: creating a real salesperson login (Paul's own action on the Team page — this session never creates
accounts); the operator screens were seen in the harness, not live.
