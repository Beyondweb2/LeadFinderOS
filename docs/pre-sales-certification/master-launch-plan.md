# Pre-Sales Certification — Master Launch Plan

- **Session / date:** consolidation, Sunday 4 October 2026. Planning only: no product code, policy, secret,
  Stripe, Ronnie or deploy was touched.
- **Release audited by all five sessions:** `main` at `c0e85078` (still `origin/main` when this plan was written).
- **Inputs (the real reports, read from their branches, not the stubs on `main`):**
  A `cert/a-salesperson` `413d5790` · B `cert/b-close-payment` `fc16695f` · C `cert/c-delivery-ai` `f94902e9` ·
  D `cert/d-site-generation` `a3d79300` · E `cert/e-security-reliability` `8562a5a8` · protocol `README.md`.
- **Checked by this session, read-only, to settle disagreements:**
  - Ronnie's lead and baseline, by SQL: `payment_received`, not archived, `remeasure_due_date = 2026-10-13`,
    no re-measure claimed yet. Baseline `1a0603aa` run 1 asked exactly three questions: "best / top rated /
    which … Locksmiths in Halifax UK". Runs 2–5 asked 15 different shoe-repair, key-cutting and watch-battery
    questions, each once. **C-01 confirmed.**
  - `_shared/whatsapp-inbound.ts:149-154`: the fallback match is `ilike '%<last 9 digits>%'` on the stored phone.
    A spaced UK number (`07700 900504`) never contains `700900504`. **E-07 confirmed.**
  - `_shared/delayed-subscription.ts`: reads `stripe_subscription_id`, then creates the subscription with no
    `Idempotency-Key`. In `stripe-webhook` the slow agreement PDF and emails run **before** it (`:1064` vs `:1269`).
    **E-03 confirmed as a real, narrow window.**
- **Raw totals across the five reports:** 5 P0 · 52 P1 · 86 P2. **After merging duplicates and re-grading:
  4 P0 · 39 P1 · 21 P2** (the P2s are grouped by theme; every source ID is kept in SOURCE AUDITS).
- **Second consolidation pass (same day, review only):** re-read all five reports, re-checked the code behind
  M-003, M-005, M-010 and M-017 on `origin/main`, and corrected two contradictions between this plan's sections:
  **M-003 now sits in Gate 1** (the security section already said "before any real login"), and **M-015 is now a
  Gate 3 blocker** (the call-first section already listed it in the minimum). Counts unchanged.
- **Amendment — Paul's business decision on Ronnie (4 October 2026):** Ronnie is **no longer an active client**.
  He paid the initial £99 but never sent the services / information needed to continue, and has gone quiet. The
  engagement is **closed / completed early**: no refund, the £99 and its revenue kept, no further payments, no
  further work, **no 13 October re-measure**, and **no attempt to repair or re-run the wrong locksmith question
  set**. M-004 changes from "hold, then re-run his real questions" to **"close Ronnie with the existing
  ended-client mechanism before 13 October"**. Ronnie's live record was **not** changed by this planning session.
  The SQL facts above about his baseline stay as history; they no longer drive any action.

---

## Executive verdict

### NOT READY. Four P0s, all small. Do not give anyone a salesperson login yet.

The foundations are better than the finding count suggests:
- Rep-to-rep isolation is secure at the server.
- Payment money rows are exactly-once.
- The measurement engine is right.
- The QA layer is not a backdoor.
- The generated websites were truthful.

What blocks launch is a short list of specific breaks, and most are one-line or one-policy fixes:

| | P0 | Why it blocks | Size |
|---|---|---|---|
| **M-001** | A Build sale cannot reach a payment link | Quick Close throws away the last Build answer. Every no-website prospect, the hottest call-first lead, cannot be closed. | one line + a test |
| **M-002** | Every salesperson can read and send Paul's private saved texts | Paul's personal AI prompt with his login email and account id, two old live Stripe Payment Links, and an old "£19.99 / eight weeks" offer. | one policy + Paul deactivates two links |
| **M-003** | Anyone on the internet can post fake customer WhatsApp replies | Proved live. Forged replies move leads, suppress prospects and can start paid audits. | Paul sets one secret, then a one-line fail-closed change |
| **M-004** | Ronnie is no longer an active client, but the system still treats him as one: an automatic re-measure fires on 13 Oct (on a wrong locksmith question set) | Paul has closed the engagement. Unless the record is closed, the cron spends and claims a re-measure for a client we have stopped serving. **TIME CRITICAL.** | no code: one existing admin action (Completed / client ended early) + read-back |

M-001 to M-003 block the launch. M-004 blocks nothing else, but it has a hard date: **close Ronnie using the
existing ended-client mechanism, and make sure his 13 October re-measure and all future billing and work are
off, before 13 October.**

**The call-first workflow is not usable end to end today.** Only one path works from start to finish: an
Optimise close where the prospect messaged in the last 24 hours. Five things are missing or broken:
- Build cannot close (M-001).
- A prospect who WhatsApps after a call is lost (M-005).
- The call screen has no close (M-009).
- The rep's to-do list includes leads they archived (M-008).
- After a call the WhatsApp window is usually shut, so the link can only be pasted from the rep's own phone (M-015).

**After the fixes in Gate 1 → Gate 3 (below), the honest verdict becomes READY WITH FIXES for a controlled
launch:** one or two reps, Paul watching, Optimise and Build sales allowed. Delivery has two more conditions:
- **Optimise and Build delivery** need Gates 4 and 5.
- **Paying clients' baselines** need Gate 6, or Paul's documented manual stand-ins for the first one to three clients.

---

## What already works

Proved live by at least one session. Do not rebuild any of it.

- **Salesperson isolation (E).** Another rep cannot reach a lead, campaign, queue item, message, History,
  audit, call, Next Action, Quick Close or commission, including through direct table writes. Refusals carry no
  data. Reassignment revokes access at once. Admin screens answer `admin_only`.
- **Duplicates under real concurrency (E).** The same business added by two reps, the same campaign name, double
  queue, double launch and double "Generate link" each produce exactly one winner.
- **Payment money is exactly-once (B, E).** Up to five deliveries of the same event gave one ledger row, one
  History line, one notification, one agreement acceptance, one PAID email and zero real WhatsApp. The seller is
  stamped by trigger. `contract_total_payments` is immutable.
- **The QA safety layer (A, B, C, E).** 0 Meta message ids across all five sessions. Every fixture send was
  simulated. Test accounts cannot make a real lead "simulated", fake a payment, or run the drill.
- **Campaigns, queue, remove/requeue, Next Action, Not interested + lost reason (A).** Simple, correct and synced.
- **Find Leads (A).** Website / no website, an honest agency check with evidence, Companies House age, and an
  owner-safe duplicate guard.
- **The measuring machine (C).** It ran 120 of 120 answers on the 20 × 3 × 2 method. The freeze is enforced by
  database triggers. Runs 2–3 replay run 1. One re-measure per lead. MCL's live figures recompute exactly
  (39/120 → 33%).
- **Client-facing measurement wording (B, C).** "Nobody can guarantee a particular AI tool will recommend you."
  Named is kept separate from cited. Methodology is explained plainly.
- **The agreement (B).** Route-correct text: Optimise 9.4 "We will never take your own website offline".
  Write-once acceptances, a route lock after signing, and a correct PDF.
- **The generated websites (D).** Two independent builds: 0 invented claims, every negative respected, valid
  schema, AI search crawlers allowed, 0 JavaScript, credible on a phone.
- **The Optimise generator never publishes (D).** It produces paste-ready blocks only.

---

## Master table

Severity is this plan's **re-graded** severity (model in the brief). "Blocks" uses: **Login** (salesperson
login) · **Call** (call-first workflow) · **Pay** (accepting payment) · **Deliver** (client delivery) ·
**Build** · **Optimise** · **Measure** (AI measurement) · **Existing** (existing clients only). Workstreams
WS-1 … WS-7 are defined under *Engineering workstreams*.

| ID | SEVERITY | ROOT FINDING | SOURCE AUDITS | AREA | BLOCKS WHAT | FIX WORKSTREAM | ACCEPTANCE TEST |
|---|---|---|---|---|---|---|---|
| **M-001** | **P0** | Quick Close cleans the single incoming answer before merging, so `build_consents` is always dropped; Build never reaches "ready" | A-01, B-01 (D, C cross-ref) | Quick Close | Call, Pay, Build | WS-2 | Dialog-shaped test: save the 7 Build answers one call each → state `ready`; live on a fixture: Generate link appears, £99 session created |
| **M-002** | **P0** | `sales_select_templates` lets every rep read (and send) all 15 of Paul's private saved texts | A-02, E (Saved Quick Reply, role matrix) | RLS / Inbox | Login | WS-1 + Paul | As a rep: `templates` returns only the rep's own rows; Quick reply shows none of Paul's; the two old Payment Links show "inactive" in Stripe |
| **M-003** | **P0** | `whatsapp-status` verifies Meta's signature only if `WHATSAPP_APP_SECRET` is set; it is not, so unsigned posts are accepted | E-01, README §5 | Webhook | Login, Call | WS-1 + Paul | Unsigned post → 401, nothing stored; a genuine Meta delivery still lands; secret missing → 401 (fail closed) |
| **M-004** | **P0 — TIME CRITICAL (13 Oct)** | Ronnie has disengaged (Paul, 4 Oct: closed / completed early) but his record is still a live paid client, so the day-28 replay will fire on 13 Oct (on run 1's wrong locksmith set) and future work stays scheduled | C-01 (E notes; Paul's decision 4 Oct) | Client lifecycle | Existing (Ronnie) | Paul (the close) + WS-3 (read-back and the ended-client tests) | Before 13 Oct: `service_terminated_at` set with reason `client_ended_early` (read back); `fireDueRemeasures`' query does not return him; no `remeasure` audit for him on or after 13 Oct; `amount_paid` 99, ledger, revenue and commission rows unchanged; no live Stripe subscription or schedule; Paid Clients shows COMPLETED |
| M-005 | P1 | Inbound WhatsApp from a lead never messaged by the system is not matched (spaced phones; owner grouped by `user_id`) | E-07 | Inbound | Call | WS-1 | Inbound from a fixture with a spaced phone and no outbound → linked to the lead, holder (`assigned_to_user_id`) gets unread + a notification |
| M-006 | P1 | `crawl-check` lets a rep read another job's result (`job_id`) and write a crawl into any run (`run_id`) | E-06 | Crawl | Call (security) | WS-1 | As a rep: `job_id` / `run_id` not belonging to the rep's own lead → 403; own lead unchanged |
| M-007 | P1 | Live service-role and anon JWTs stored as vault secret **names** | A-31, E-08 | Secrets | — (hygiene) | WS-1 + Paul | `select name from vault.secrets` shows no JWT-shaped names; rotation decision recorded |
| M-008 | P1 | Archived leads (and archived paid fixtures) still drive the rep's dashboard and handoff list; handoff says "Ready to submit?" when nothing can be submitted | A-03, B-13 | Sales dashboard | Call | WS-5 (sales-performance), WS-2 (`my_handoffs`) | Fold test with an archived lead: absent from "What to do next", counts and handoffs; a waiting client shows "Waiting for the client" |
| M-009 | P1 | Call screen has no close (price, guarantee, route, "I'll send the link"); scripts ignore the reply and read dates with the year; one rep claim is contradicted by the lead's own audit; objection lines overpromise; no gatekeeper / voicemail | A-04, A-05, A-06, A-21, A objection + script audits | Call workspace | Call | WS-5 | Script snapshot tests: an "If they're interested" block per route with the byte-locked guarantee sentence; after a "who's this?" reply the opener says who is calling; no year for a date within 7 days; no absolute no-website claim |
| M-010 | P1 | All audit spend shares one $12/day budget (rep hooks, bulk, baselines, re-measures); Apify's $40/month cap cannot carry client volume, at 100% everything stops; our ledger under-records Apify by about a quarter | E-05, C-14, C-33 | Budget | Call, Measure, Existing | WS-4 + Paul | A baseline / re-measure run when the daily cap is exhausted still runs; prospecting refused above the reserve line with a plain message; Paul's Apify cap decision recorded |
| M-011 | P1 | Before the link, nothing states the guarantee, the minimum term or the checkout agreement tick; "What to tell them" opens with "That's everything I need"; "week six" vs "six weeks" drift | A-07, B-02, A-29 | Quick Close copy | Pay | WS-2 | Route card, spoken line and WhatsApp text each carry the guarantee, the payment count and minimum term, and "you'll tick the agreement on the payment page"; `client-copy-claims` passes; cross-repo sync green |
| M-012 | P1 | After "No domain", consent 1 still makes the rep confirm "they own or control the domain" | A-08 | Quick Close | Build, Pay | WS-2 | Domain = No domain → consent reads "they'll register a domain in the business's own name"; stored consent records which wording was confirmed |
| M-013 | P1 | Generate / Copy link sits 1,500–1,800 px down, under the open handoff form | A-09, B-03 | Quick Close UX | Call | WS-2 | At 375×812 and 1366: once the route is set, Generate (or Copy / Send) is in the first screen; handoff folded to one line |
| M-014 | P1 | Payment-link lifecycle: a link past 24 h shows as "ready" with no fresh-link button; a superseded session (route changed) stays payable for 24 h | B-04, B-16 | Quick Close / Stripe | Pay | WS-2 | Link older than `LINK_REUSE_MS` → age shown, Copy/Send hidden, "Make a fresh link" works; route change → old session expired in Stripe (create-session response check) |
| M-015 | P1 | When the WhatsApp window is closed (most post-call closes) the link can only be copied; nothing records that it was sent | B-10 | Quick Close send | Call, Pay | WS-2 | Window closed → "Email the link" (QA guard applies) works; "Link copied" and "Link emailed" write History rows |
| M-016 | P1 | A late repeat of `checkout.session.completed` moves a client backwards, including **refunded** → `payment_received`, and rewrites `payment_date` | E-02, B-15 | Stripe webhook | Pay | WS-3 | Replay on fixtures in `in_delivery`, `refunded` and ended: status, amount and date unchanged; onboarding not moved back to `paid` |
| M-017 | P1 | Two overlapping deliveries can create two monthly subscriptions (no Idempotency-Key, no claim) | E-03 | Stripe | Pay | WS-3 | Code: `Idempotency-Key: sub-<checkout session id>` on create + a conditional claim; unit test of the claim; reviewed against the Stripe API docs |
| M-018 | P1 | After payment nobody owns first contact: client told "two working days", seller told "your part is done", Paul's screen says WAITING FOR CLIENT | B-07, B-30 | Paid-client state | Pay, Deliver | WS-3 | Paid fixture with no setup link sent → WAITING FOR FINDABLE "Introduce yourself and send the setup link", due two working days after payment; "Send setup link" stamps when sent; seller view shows the same date |
| M-019 | P1 | No-website Build client shows false "Website" and "Website access / control" blockers (readiness ignores Quick Close's `no_website`) | B-05 | Readiness | Build, Deliver | WS-3 | Build fixture closed with No website → neither blocker; Optimise unaffected |
| M-020 | P1 | Paul's "Fix in onboarding" silently nulls the Build consents taken on the call | B-06 | Manual onboarding | Build | WS-3 | Replay of the B1 save: consents unchanged; a save that would clear a stored consent is refused or warns |
| M-021 | P1 | After checkout acceptance (Build, 12 payments) the agreement route can still be flipped to Optimise; no supported route correction | B-11 | Agreement | Pay, Build, Optimise | WS-3 | `agreement_set_route` refused once `contract_total_payments` is set or any acceptance exists; a deliberate "correct the route" admin action is the only path and names the Stripe step |
| M-022 | P1 | Every Quick Close not paid within 20 min of its first answer emails Paul a false "questionnaire submitted, not paid", later a "Chase the sign-up" task | B-09 | Notifier | Pay (noise) | WS-3 | `source='quick_close'` rows never notified or tasked; self-service rows unchanged |
| M-023 | P1 | Admin "Add paid client" can match an already-paid lead and overwrite its amount (default £49.99), route and `baseline_status` | C-15 | Paid Clients | Existing, Deliver | WS-3 | Matching excludes paid leads; `create_manual` on `amount_paid > 0` refused; no `49.99` default |
| M-024 | P1 | Welcome Pack is route-blind: tells Optimise clients Findable owns and can take down "the website"; never tells Build clients they get a new site; prints an SEO letter grade | B-08, B-25 (SEO part), D cross-ref | Welcome Pack | Optimise, Build | WS-3 | Optimise pack: "Your website is always yours"; no take-down line; Build pack lists "A new website, built and hosted by us"; no SEO grade (pending Paul's ruling, default remove); `welcome-pack-content` test updated |
| M-025 | P1 | Client questionnaire promises "one page per service per town" — the cloned-page pattern the method rejects | C-07 (D cross-ref) | Onboarding copy | Deliver | WS-3 | Both repos carry the new wording; cross-repo sync green; findable-site deployed and live-checked |
| M-026 | P1 | The sales (hook) report prints the £99 guarantee sentence directly under a 3-question score | C-06 | Hook report | Pay (dispute risk) | WS-4 | Hook report says the guarantee is judged on the full 20-question measurement, then the byte-locked sentence; footer no longer says "the same questions" |
| M-027 | P1 | A baseline that gives up shows "Baseline running" for ever; capped / partial runs count; no per-question retry | C-11 (E observability) | Baseline engine | Measure | WS-4 (+WS-3 renders) | Forced give-up on a fixture → `baseline_status='failed'` + reason, listed in Needs attention; a run with missing cells is not counted as complete; "re-run failed questions" spends only on missing cells |
| M-028 | P1 | Discovery can propose a service the client does not offer; approval has no content checks (brand, unconfirmed service, rep-edited Hook) | C-04, C-05 (MCL "auto locksmith") | Question generation | Measure | WS-4 | Generator fed `must_not_say` + "not offered"; approve refuses (override needs a typed reason) a branded question or an unconfirmed service; backlog never seeded with an unmatched service |
| M-029 | P1 | Questions are SEO keyword strings; the recommended 20 omits the core "<trade> in <home town>" question, grids services × towns, and mislabels service questions as "core" | C-02, C-03 | Question selection | Measure | WS-4 | On C's truth set: the 20 contains the two mandatory core questions, ≤2 per service, ≥half the services covered or a warning; questions read as customer questions |
| M-030 | P1 | Services / areas are merged from several sources; "Save context" writes the merged list back as if the client said it; Website Build then auto-verifies it | C-08, D-07 | Client facts | Measure, Build | WS-4 (root), WS-6 (consumer) | A client-unticked town / a Discovery-only service never reaches Discovery, the 20 or a VERIFIED build fact |
| M-031 | P1 | Re-clicking the re-measure date clears it (react-day-picker) and nothing ever fires or alerts | C-09 | Delivery cockpit | Measure, Existing | WS-4 | Calendar `required`; server refuses null for a lead with a frozen baseline; "(8 wks)" label fixed |
| M-032 | P1 | A held four-week result is never sent after approval; no "send results" action; the draft claims cause | C-10, C-28 | Results sender | Measure | WS-4 + Paul (copy) | Sweep + operator button use the same claim; causal sentence removed; still held until Paul approves the copy |
| M-033 | P1 | Before/after verdict pools engines and all runs over unmatched questions; an engine drop-out can flip the verdict | C-12 | Verdict | Measure | WS-4 | Compare matched questions answered on both sides; hold when an engine is short; read the frozen three runs only |
| M-034 | P1 | Salespeople have no bulk audit/crawl; the admin bulk path is unsafe to expose (whole book, archived/clients, skips per-rep guard) | E-04 | Prospecting | Call (normal rollout) | WS-7 | See *Call-first workflow assessment*: rep A cannot include rep B's, archived or paid leads; per-rep allowance enforced; guarantee runs unaffected; nothing contacts anyone |
| M-035 | P1 | Site Intent Map points unoffered services and unserved towns at real pages; keyword-phrased questions fall to the town page with a blank owner; Q&A guard same hole | D-01, D-02, D-21 | Website Build / page-gen | Build, Optimise | WS-6 (uses WS-4's leaf) | D1/D2 truth sets: "car key", "boiler installation", "Telford", "Halifax" listed `unowned: not offered / not served`; no blank owner; Q&A refuses an unapproved service/town |
| M-036 | P1 | `section on /`, the format the screen suggests, fails the site gate on every build — Preview Ready is unreachable | D-03 | Site gate | Build | WS-6 | Test: a section-served intent passes the gate; D1 gate 17/17 |
| M-037 | P1 | Nothing automated checks claims (years, insured, 24/7, response time, ratings, "approved") on Build output or page-generator fields | D-05, D-20 | Site gate / page-gen | Build, Optimise | WS-6 | A planted "fully insured, 10 years, 24/7" fails the gate and is refused by page-generator unless each is a verified fact |
| M-038 | P1 | A no-website Build client can never get photos, logo or map into the build | D-08, D-09 | Website Build | Build | WS-6 | "Add client assets" on any route, without an old site; licensed map source named |
| M-039 | P1 | Each new client's enquiry form needs a code change and an edge deploy (`CLIENT_SITES`) | D-12 | site-enquiry | Build | WS-6 | Registry is a table written by Website Build; a new fixture site's form test passes with no deploy |
| M-040 | P1 | Production prompt/commands unlock on a preview URL alone (not Preview Ready, not QA ticks); Website Build and production are open for Optimise clients | D-04, D-06 | Website Build | Build, Optimise | WS-6 | Production items absent until `previewReadyProblems` is empty and the QA ticks are set; Optimise client → Build and Production disabled with a sentence |
| M-041 | P1 | What the rep promised and what the client wants never reach the build prompt; Optimise has no single brief | C-13 (D cross-ref) | Build/Optimise brief | Build, Optimise | WS-6 | Build prompt carries the handoff's "promised" and "client wants"; an Optimise brief page exists from the same evidence |
| M-042 | P1 | No change workflow after launch; production gate report never imported; "Live" is a tick | D-15 | Website Build | Build (monthly) | WS-6 | "Change request" prompt from the fact-ledger diff; production `--url` gate report imported into the record |
| M-043 | P1 | Page-generator service+town pages are kept from cloning only by a prompt line | D-19 | Page generator | Optimise | WS-6 | Cross-page 5-word-shingle similarity ≥ 60% → refused |
| M-044 … M-064 | P2 | Grouped after-launch themes | see *Consolidated P2 findings* | — | — | — | — |

---

## Consolidated P0 findings

### M-001 — A Build sale cannot reach a payment link
- **Sources:** A-01 and B-01 found it independently and live. C (hand-made onboarding) and D carry it as the
  upstream blocker.
- **Root:** `supabase/functions/quick-close/index.ts:227` runs `cleanAnswers(body.answers)` on the one answer the
  dialog sends. `src/lib/quickClose.ts:85` deletes `build_consents` from any object without `route:'build'`, so
  the answer is dropped before the merge. The audit trail records `answers_saved` with `changed:{}`, and the
  screen reverts from 5 of 5 to 4 of 5 after about 0.8 s with no error.
- **Real severity: P0.** A salesperson cannot close the product the hottest leads need. Every no-website lead is
  Build-only.
- **Fix:** clean the merge, `cleanAnswers({ ...prevRaw, ...body.answers })`, plus a test that saves all answers one
  per call. Ship with M-012 (consent wording), in the same file family.

### M-002 — Paul's private saved texts are readable and sendable by every salesperson
- **Sources:** A-02 (found live in the Inbox Quick reply menu); E traced it fully. All 15 rows are readable;
  sending works via insert-and-send; editing or deleting is refused; there are no API keys or passwords.
- **Exposed:**
  - an ~11,000-character personal working note with Paul's login email and account id;
  - "Pricing", with two live Stripe Payment Links that bypass Quick Close, the route, the agreement and seller
    attribution;
  - "£19.99 / eight weeks" and barber-era texts.
- **Real severity: P0.** It leaks private data to every rep, and a rep can send a wrong price or a bypassing
  payment link in one click.
- **Fix (WS-1):** drop or narrow `sales_select_templates` to rows explicitly flagged as shared. Check every other
  `book_owner_id()` policy for the same pattern.
- **Paul:**
  - deactivate the two old Payment Links in Stripe (a Stripe action, so it is his);
  - move the notes out of `templates`, or let the fix session move them to an admin-only notes table with his
    approval;
  - delete the barber rows.

### M-003 — Unsigned WhatsApp webhook
- **Sources:** E-01, proved live. README §5 relied on the hole for QA inbound simulation.
- **Root:** `whatsapp-status/index.ts:57-66` checks the signature only when `WHATSAPP_APP_SECRET` is set, and the
  secret is unset.
- **What an attacker can do with only a business's public number:**
  - put words in a prospect's mouth in a rep's Inbox;
  - flip leads to `replied`;
  - send a fake "STOP", which suppresses the prospect everywhere and burns their one automation slot;
  - start paid hook audits; in `audit + send` mode this also triggers a real WhatsApp.
- **Real severity: P0.** An external, unauthenticated attacker can change state on the channel reps use to decide
  who to call.
- **Fix:**
  1. Paul sets the Meta app secret.
  2. Verify that a genuine inbound still lands.
  3. Change the code to refuse with 401 when the secret is missing.
  4. Replace QA inbound simulation with a `CRON_SECRET`-gated, fixture-only path. This mirrors the payment
     simulation and is needed by the final regression.

### M-004 — Close Ronnie before his 13 October re-measure (TIME CRITICAL, existing client)
- **Source:** C-01 found the replay and its wrong question set. **Paul's decision (4 Oct)** replaces the original
  fix: Ronnie paid £99, never sent the services / information needed to continue, and has gone quiet. The
  engagement is **closed / completed early**. No refund; the £99 and its revenue are kept; no further payments; no
  further work; **no 13 October re-measure**; **no repair or re-run of the locksmith question set**.
- **What happens on 13 Oct if nothing changes:** `fireDueRemeasures` replays his run 1 (three "Locksmiths in
  Halifax" questions × 3 runs, about $0.13 of Apify), claims a re-measure slot and creates a comparison for a
  client we no longer serve. Weekly checks and other paid-client work also stay switched on for him.
- **The required pre-13-October action:** **"Close Ronnie using the existing ended-client mechanism and ensure
  his scheduled 13 October remeasurement and all future billing/work are disabled."**
  - **The mechanism (exists, live since 3 Oct, used for MCLocksmiths):** Paid Clients → the client page → end the
    engagement with reason **`client_ended_early`**, which is paid-client-hub `terminate_service` (a note of at
    least 10 characters plus an explicit confirm). It writes `outreach_leads.service_terminated_at` (+ reason,
    note, by), the ONE terminal mark (`src/lib/serviceEnd.ts`). Paid Clients then shows **COMPLETED** —
    "Engagement ended early by the client. What they paid is kept; no further payments, delivery, re-measure or
    monthly updates." It is the legitimate terminal state; it never marks a delivery stage done, so no
    successful delivery is fabricated.
  - **What it already stops (code-checked on `origin/main`):** the re-measure firer (`audit-baseline.ts:646`
    filters `service_terminated_at is null`), the results sender (`remeasure-results.ts:149`), weekly visibility
    checks (`weekly-visibility:76`), performance sync (`performance-sync:121`), the admin paid-client counts and
    "needs you" actions (`adminMetrics.ts:721, 920`), and the delivery stage (shown as Completed).
  - **What it never touches, by design:** money. No refund, no ledger row, no commission change. If a Stripe
    subscription is live, the action emails Paul to cancel it in Stripe himself (the app never moves money).
  - **Who:** Paul presses it, or a session runs the same action with his explicit yes. Either way, a session then
    reads the record back (acceptance in the master table) and records the result in `docs/`.
  - **Do NOT:** move or clear `remeasure_due_date` (the firer already skips an ended client; clearing dates is
    exactly the C-09 hazard), archive him instead (archiving is not a client state and hides the history), set
    `status='refunded'`, delete or re-extract his baseline `1a0603aa`, or generate a new question set.
- **Gaps the closing tests must cover (found while checking the mechanism):**
  - **A payment replay after the close** (M-016 / E-02, proved live on an ended fixture): status goes back to
    `payment_received` and the onboarding row back to `paid`. `service_terminated_at` survives, so no work
    restarts, but the label regresses. M-016's fix must keep an ended client ended.
  - **`invoice.paid` after the close** (E-17): would mark the subscription active and earn commission. Ronnie
    paid in August, before delayed subscriptions existed, so he should have none — **verify, do not assume**.
  - **Monthly updates:** `client_monthly_updates` / `monthlyUpdate.ts` never read `service_terminated_at`. Nothing
    sends one automatically, but nothing stops Paul starting one for an ended client. Add a refusal (WS-3).
- **Real severity: P0, existing client only, dated.** It blocks no other gate. No product code is needed for the
  close itself; the tests and the three small guards above belong to WS-3.
- **Owner:** Paul (the close, by Friday 9 October; last safe day Monday 12 October), WS-3 (read-back and tests).
  See *Existing client actions*.

---

## Consolidated P1 findings

Grouped by the workstream that fixes them. Full rows are in the master table.

**Security and inbound (WS-1)**
- **M-005 — a reply after a call is lost.**
  - **The case:** in the call-first flow the rep phones first, then the prospect WhatsApps.
  - **What happens:** the reply arrives unlinked, with no unread count and no notification.
  - **Cause:** 5,482 of 5,485 phone-bearing leads cannot match. One real reply went unmatched on 20 Sep.
  - **Paul's choice:** once fixed, he may want that one message attached by hand. The fix must not
    retro-assign old messages in bulk.
- **M-006 — crawl-check cross-lead ids.** Code-confirmed. It needs a UUID a rep does not normally see, and the
  impact is report integrity.
- **M-007 — vault names.** Readable only by `postgres` / `service_role`, but the master key now sits in at
  least one session transcript.
  - Delete or rename the two entries. This is destructive SQL, so show Paul first.
  - Rotation: recommended at the next planned key change, not an emergency (E). Rotating the legacy JWT secret
    also rotates the anon key in the SPA and findable-site, so plan it as its own change.

**Sales call workspace (WS-5)**
- **M-008 — archived leads on the rep's dashboard.** The rep can be told to chase a lead they binned, including
  "Send the sign-up link" to one. Calls are not guarded by suppression, so this is a contact-harm risk, not just
  clutter.
- **M-009 — the call screen does not close.** Price, guarantee, route and "I'll send the link now" are built in
  `coldCallPlaybook.ts:634-668` but never rendered.
  - **Overpromising lines to fix:**
    - "The monthly keeps you there" → the agreed monthly wording: a new page each month, a monthly AI check, and
      keeping the site right.
    - "What I guarantee is the measurement" → "Nobody can promise AI will name you. If the number hasn't gone up
      at four weeks, you get your £99 back."
  - **The absolute claim (A-05):** remove "Google AI has not named a business without a website". The lead's own
    audit contradicts it, and so does CLAUDE.md §5's matching line (see M-063).

**Spend (WS-4 + Paul)**
- **M-010 — the shared audit budget.** Two different caps:
  - **$12 rolling 24 h** (`process-ai-audit-queue/index.ts:98`), keyed on the data account that owns every audit,
    including baselines and re-measures.
  - **Apify $40 / month**: about 72% used on 4 Oct; the cycle ends 16 Oct. (Ronnie's 13 Oct replay no longer
    needs budget: he is being closed, M-004.)
  - **Severity: P1, but its interim half is a Gate 2 requirement.** Real reps running hook audits from now on are
    the most likely way a paying client's baseline or re-measure ends `capped`.

**Quick Close and the payment link (WS-2)**
- **M-011 — terms before the link.** Disputes over the minimum term are money. The checkout and agreement already
  state it; the rep's screen must too.
- **M-012 — the "No domain" consent.** It makes the rep confirm something false that Paul later relies on.
- **M-013 — link buried.** The button sits under the handoff form while the customer waits on the phone.
- **M-014 — stale and superseded links.** B-16 (P2 in B) is merged here. It is the same lifecycle and the same
  function, and a paid superseded link records a Build agreement on an Optimise row.
- **M-015 — the window-closed send.** In a call-first model this is the normal case, not the edge case.
  - **Launch minimum:** "Email the link" plus History rows for copy and email.
  - **Later:** a Meta-approved payment-link template. That touches the eleven-place template registry, so it is
    out of launch scope.

**Payment and paid-client state (WS-3)**
- **M-016 — status regression.** B rated it P2 and E rated it P1. Resolved **P1**: the refunded case puts a
  refunded client back into revenue, and Stripe retries for up to 3 days.
- **M-017 — duplicate subscription.** Rare, but it bills twice. The fix is a header and a claim, so it is
  **required before the first real payment**.
- **M-018 — first-contact owner.** Without it the guarantee clock and the client's goodwill run down in silence.
- **M-019 and M-020 — the Build client record is not trustworthy.** False blockers, and Paul's first routine edit
  wipes the consents.
- **M-021 — agreement route lock.** One mis-tap sends a Build client a 6-payment Optimise agreement against a
  12-payment card schedule.
- **M-022 — false "not paid" alerts.** These grow with every rep.
- **M-023 — manual add-client overwrites.** Admin-only, but it corrupts a real client's money and baseline state.
- **M-024 — Welcome Pack.** Optimise is not deliverable with it as written. B-25's SEO letter grade is promoted
  into this P1 because it breaks the standing rule "never claim an SEO score". Paul rules; the default is to
  remove it.
- **M-025 — questionnaire promise.** Wrong expectation set at onboarding, in both repos.

**AI measurement (WS-4)**
- **M-026 — the hook report's guarantee sentence.** "That number" on the page a prospect bought from is the
  3-question score. The guarantee is judged on the 20-question measurement.
- **M-027 — silent baseline failure.** On 3 Sep, 317 runs failed on Apify HTTP 402 at the cap, with nothing
  surfaced.
- **M-028 and M-029 — question quality.** With M-010, these are the reason Gate 6 fails. Until they land, Paul
  rewrites each draft to the MCL style and removes anything not on the confirmed list. That is the documented
  stand-in.
- **M-030 — one source of truth for services and areas.** It feeds both the guarantee and the build.
- **M-031 to M-033 — the re-measure path.** Needed before the first new client's day 28. The earliest is
  freeze + 28 days, so on or after 1 Nov for anyone frozen this week.

**Call-first prospecting (WS-7)**
- **M-034** — a product build, designed below. Not a Gate 2 blocker, because reps can run one-lead checks
  (about 1 minute each, guarded). It is required for normal rollout.

**Website Build and the Optimise generator (WS-6)**
- **M-035 to M-043.** D's verdict stands: the words on the page are good, the process around them is not yet
  safe.
- **Required for any Build:** M-036, M-038, M-039 and M-040.
- **Manual stand-in allowed for the first one to three Build clients:**
  - M-035 → Paul edits the intent map;
  - M-037 → Paul claim-reads every page against the fact ledger;
  - M-041 → Paul pastes the handoff into the prompt.

---

## Consolidated P2 findings

Grouped by theme. Each is real, none blocks a controlled launch.

| ID | Theme (merged) | Source audits | Workstream |
|---|---|---|---|
| M-044 | Quick Close friction: re-asks known facts; "Not sure" stored as "cannot give access"; handoff counts prefilled answers as missing; blanks can't be cleared; unsaved draft lost on close; counter jumps; route buttons in the client's voice | A-10, B-21, B-22, B-23, B-30 (wording) | WS-2 |
| M-045 | Stale Quick Close after payment still offers Send (raw "non-2xx" error); pending-payment state only on the dashboard | B-14, B-31 | WS-2 |
| M-046 | Paid Client page contradictions: route shown 4 ways, "Website route not set", DOMAIN READY with no domain, "Nothing recorded by Sales" beside a handoff note, no amount on the card, checklist double-counts, GBP gates READY | B-12, B-24, B-29 | WS-3 |
| M-047 | Post-payment comms: PAID email long and repetitive; bell lacks route and seller; payment-confirmation WhatsApp route-blind (needs a new Meta template); commission copy says 6 for Optimise (5) | B-19, B-20, B-26, B-27 | WS-3 (B-27 → WS-5) |
| M-048 | Email traces missing / wrong stored subject; mistyped agreement address gets "no email on file" | B-17, B-18 | WS-3 |
| M-049 | Welcome Pack and paid-report details: "reply to the email this came with" (never emailed); checkout acceptance shown as "Review and agree"; "Services we measure you on" overclaims; sales "Request a call" on a paid client's report; "from your own website" when there is none | B-25 (rest), C-34, C (pack notes) | WS-3 (+WS-4 for the report CTA) |
| M-050 | First-reply auto audit re-runs right after a manual check; archiving does not cancel an armed audit | A-12, E-11 | WS-1 |
| M-051 | "Not interested" suppresses every lead sharing the email; queue `opted_out` writes no History; **the QA sink `paul@move37.fun` is now suppressed** | E-10 (37 active leads in 13 shared-email groups) | WS-1 |
| M-052 | Two tabs: last writer wins on Next Action, no stale check | E-13 | WS-5 |
| M-053 | Double-submitted call outcome logs two calls | E-12 | WS-5 |
| M-054 | Sign-out leaves database access for up to an hour; 21 functions answer 401 (not 503) on an auth outage | E-09, E-15 | WS-1 (**off-boarding rule written now** — Gate 1) |
| M-055 | Small leaks and public hardening: contact-time RPCs answer for any id; anonymous `bump_audit_open`; 404 vs 403 on Quick Close load; public onboarding can overwrite a lead's phone/website/trade; site-enquiry Origin-only; check-then-insert double emails; no `svix-id` dedupe; short codes unthrottled; hook audit takes business details from the request body | E-14, E-18, E-19, E (audit integrity) | WS-1 / WS-3 |
| M-056 | Commission on recurring payments of excluded leads and after a service ended | E-16, E-17 | WS-3 |
| M-057 | Per-rep spend not attributable; no per-rep daily Inbox send cap | E-20, E-21 | WS-7 (actor stamp is part of its design) / WS-1 |
| M-058 | Simulated sends don't count as sends (QA campaigns read "Draft"); a campaign whose sends all failed also reads "Draft"; mirror-placeholder duplicate rows in threads | A-11, A-20 (part), README §5 | WS-5 |
| M-059 | Sales UI polish: Enrich offered to sales; rating / agency / company age lost on add; campaign page and dashboard don't refresh; Launch with no confirm and "Sending" while the window is shut; lower-case queue line; commission first on phones; no Inbox context strip, jargon; stale copy; town badge vs gate predicate and raw error code; Next Action options ("Send proposal"); campaign picker reasons; notifications for reassigned leads; national merchants unflagged; no rep niche verdict; Outreach website marker | A-13–A-20, A-22–A-28, A-30 | WS-5 |
| M-060 | Measurement hygiene: competitor variants not merged and the client as its own rival; cleaning gives up under OpenAI 429; raw citations, `.org` = authority; model-first "named" on internal surfaces; OpenAI spend untracked | C-16, C-17, C-18, C-29, C-32 | WS-4 |
| M-061 | Baseline workflow details: backlog/guarantee overlap after reopen; stage skipping and stale labels; monthly update judgeability; selection details; opportunity check has no claim; run-pooling differs by surface; **pointer triggers and one-replay index not in migrations**; legacy rows regenerable server-side; hook precision and engine naming; empty answer counted | C-19–C-27, C-31 | WS-4 |
| M-062 | Website Build polish: home-town page on by default with nothing local (D-10, **re-graded P1 → P2**: Paul turns it off per build until fixed); template extraction; `standout` missing from config; prompt contradictions and length; "Built by Findable" credit on by default (Paul decision); mechanical repetition; mobile email wrap; "Launched" event hard-coded to Build; no "Preview concept" label; page-generator leftovers | D-10, D-11, D-13, D-14, D-16, D-17, D-18, D-22, D-23, D-24 | WS-6 |
| M-063 | Stale docs that will mislead fix sessions: CLAUDE.md §8 `run_number` (unique index exists), §1 "Named = model's verdict" and "RG due 6 Oct — approve before then" (RG refunded, will not fire), §4/§8 `client_error_reports` has no `message` (it does now), §5 "no website cannot be named by Gemini" (counter-example in A-05); §0 "two paying customers, RG and Ronnie" (RG refunded; Ronnie closed 4 Oct, see M-004); README fixture email now suppressed | C-30, E-23, A-05, E-10 | the first fix session to merge (docs only) |
| M-064 | `cert/b-close-payment` contains five live Checkout Session ids; audit branches must never be merged as-is | E-22 | none — do not merge audit branches |

---

## Duplicate findings merged

| Master | Merged source findings | How they relate | Severity decision |
|---|---|---|---|
| M-001 | A-01, B-01 (+ D upstream, C note) | Same line, found twice independently | P0 (both agreed) |
| M-002 | A-02, E §Saved Quick Reply, E role matrix | E traced A's finding to the policy | P0 (both agreed) |
| M-003 | E-01, README §5 | README documented the hole as a QA convenience | P0 |
| M-004 | C-01, E (Ronnie reliability note), Paul's decision 4 Oct | Same replay; resolved by closing him | P0 time-critical, existing-only |
| M-007 | A-31, E-08 | A saw it in passing; E confirmed and scoped it | P1 (E), not an emergency |
| M-008 | A-03, B-13 | Same dashboard and handoff fold; B-13 is the "not ready" variant | P1 |
| M-009 | A-04, A-05, A-06, A-21, A script / objection audits | One builder family (`coldCallPlaybook.ts`, `voiceNoteScript.ts`) | P1 (A-21 rides along) |
| M-010 | E-05, C-14, C-33 | One budget problem: daily cap, monthly cap and the ledger they are judged by | P1, interim part gates Gate 2 |
| M-011 | A-07, B-02, A-29 | Same screen and copy; B extended to minimum term and agreement tick | P1 (A-29 P2 absorbed) |
| M-013 | A-09, B-03 | Same layout, measured after (A) and before (B) the link | P1 |
| M-014 | B-04, B-16 | One link lifecycle in `quick-close` | P1 (B-16 was P2) |
| M-016 | E-02, B-15 | E extended B's case to refunded and ended clients | **P1** (B said P2; refunded → revenue decides it) |
| M-018 | B-07, B-30 | B-30's missing timeframe is part of the ownership gap | P1 |
| M-024 | B-08, B-25 (SEO grade), D cross-ref | Same renderer | P1 (SEO grade promoted: standing-rule breach) |
| M-025 | C-07, D cross-ref | Same sentence in two repos | P1 |
| M-028 | C-04, C-05 | Same gap: no "is this service confirmed / is this branded" check | P1 |
| M-029 | C-02, C-03 | Generator style and selection balance | P1 |
| M-030 | C-08, D-07 | C found the merge; D found where it lands as "verified" | P1 |
| M-032 | C-10, C-28 | Same results sender | P1 |
| M-035 | D-01, D-02, D-21 | `findNamed` searches only the approved list, in `siteGate` and `intentOwnership` | P1 |
| M-037 | D-05, D-20 | One missing claim checker, two generators | P1 |
| M-038 | D-08, D-09 | No asset route; the map is one asset | P1 |
| M-040 | D-04, D-06 | Production and Optimise exposure on the same page | P1 |
| M-050 | A-12, E-11 | Same first-reply audit drain | P2 |
| M-062 | D-10 + 9 others | Build polish | **D-10 re-graded P1 → P2** |

**Shared-root note (one rule in N places, CLAUDE.md §4).** M-028 (question generator and approval) and M-035
(intent map and Q&A) are separate findings with **one missing predicate**: "does this question name a confirmed
service, an unconfirmed service or trade term, a served town or an unserved town?" Build it **once** as a leaf,
`src/lib/serviceScope.ts`, with relative `.ts` imports because it is reached from edge functions. Add a test that
there is only one of it. WS-4 owns it; WS-6 consumes it.

### The 30 named root causes — reconciled

| # | Named root cause | Master | Verdict |
|---|---|---|---|
| 1 | Build Quick Close cannot complete | M-001 | P0, confirmed by A and B independently |
| 2 | Paul's Quick Replies visible to reps | M-002 | P0, confirmed by A and E |
| 3 | Unsigned WhatsApp webhook | M-003 | P0, proved live by E |
| 4 | Paid-client first-contact ownership | M-018 | P1, a Gate 3 requirement |
| 5 | Payment webhook status regression | M-016 | P1 (B's P2 raised by E's refunded case), Gate 3 |
| 6 | Possible duplicate Stripe subscription | M-017 | P1, code-confirmed today, Gate 3 |
| 7 | Build / Optimise separation | M-021 (agreement), M-040 (Website Build), M-014 (superseded link), M-046 (route shown 4 ways) | Tooling not separated; agreement and terms are correct |
| 8 | Optimise Welcome Pack ownership wording | M-024 | P1, Gate 4 |
| 9 | False Website / Access blockers for Build | M-019 | P1, Gate 3 for Build payments |
| 10 | Onboarding edits wiping Build consents | M-020 | P1, Gate 3 for Build payments |
| 11 | No safe salesperson bulk audit/crawl | M-034 | P1 product build (WS-7); not a Gate 2 blocker |
| 12 | Shared audit budget starves client measurements | M-010 | P1; interim protection gates Gate 2 and Gate 6 |
| 13 | WhatsApp replies after calls not matched | M-005 | P1, Gate 2; code-confirmed today |
| 14 | Crawl-check cross-lead ids | M-006 | P1, Gate 2 |
| 15 | Service-role key as vault secret name | M-007 | P1, Gate 2 (cheap); rotation is a precaution |
| 16 | AI question generation inventing services | M-028 | P1, Gate 6 (stand-in: Paul removes them by hand) |
| 17 | Keyword-like / low-quality baseline questions | M-029 | P1, Gate 6 (core slots required; style can follow with stand-in) |
| 18 | Silent / capped baseline failures | M-027 (+M-010) | P1, Gate 6 |
| 19 | Ronnie 13 October | M-004 | P0 time-critical, existing-only. **Paul, 4 Oct: Ronnie is closed (client ended early, £99 kept, no refund, no further work); the action is the close before 13 Oct, not a hold or re-run** |
| 20 | Website intent mapping accepting unsupported services | M-035 | P1, Gate 5 (stand-in for the first 1–3) |
| 21 | Website Build `section on /` gate failure | M-036 | P1, Gate 5 required |
| 22 | Website claim truthfulness enforcement | M-037 | P1, Gate 5 / Gate 4 (stand-in: Paul's claim-read) |
| 23 | Photos/logo/map for new Build clients | M-038 | P1, Gate 5 required |
| 24 | Enquiry form registration | M-039 | P1, Gate 5 (stand-in: one engineer deploy per client for the first 1–3) |
| 25 | Production / go-live gating | M-040 | P1, Gate 5 required (and Gate 4 for the Optimise half) |
| 26 | Sales call screen / scripts / close information | M-009, M-011 | P1, Gate 2 (screen) and Gate 3 (terms) |
| 27 | Archived leads still appearing as work | M-008 | P1, Gate 2 |
| 28 | Next Action concurrency / stale tabs | M-052 | P2 (coherent, logged, last-writer-wins) |
| 29 | Double call-log submission | M-053 | P2 (inflates call counts only) |
| 30 | Test/QA and off-boarding | M-054 (off-boarding rule, Gate 1 doc), M-051 (QA sink suppressed — affects the final regression), M-056 (excluded recurring commission), M-058 (simulated sends), M-064 (branch ids) | P2; the off-boarding rule is written before Gate 1 |

### Disagreements resolved

- **Payment replay severity (B-15 P2 vs E-02 P1) → P1.** E reproduced it on a refunded client, and refunded is
  the one status that removes a lead from revenue.
- **Ronnie (C-01 P0 vs the existing note in `docs/baseline-workflow.md`, "Paul's decision") → P0 time-critical.**
  The old note said "3 vs 18 questions". It did not say run 1 is the wrong trade. Confirmed today by SQL.
  **Superseded by Paul's 4 Oct decision:** Ronnie is closed (client ended early), not re-measured; M-004 stays P0
  time-critical because the close must happen before 13 Oct.
- **Is the call-first workflow blocked by the lack of bulk audit (E-04)? → No.** One-lead checks work and are
  guarded. Bulk is a P1 product build for normal rollout. The blockers for real calling are M-003, M-005, M-008,
  M-009 and the budget protection in M-010.
- **D-10 (D P1) → P2.** It is content quality and cannibalisation, not safety, and Paul turning the page off is a
  complete stand-in.
- **Is the vault key an emergency (A-31 note vs E-08)? → No.** E checked that it is not client-readable, not in
  git, not in the bundle, cron or statement logs. Delete the names now; rotate at the next planned change.

---

## Call-first workflow assessment

**The intended flow and today's state:**

| Step | Today | Blocking findings |
|---|---|---|
| Find Leads / Outreach, select prospects | ✅ good (A) | — (M-059 polish) |
| Website crawl / sales audit | ⚠️ one lead at a time only (≈1 min, guarded); no bulk for reps | M-034 (P1), M-006, M-010 |
| Rep reviews useful findings | ⚠️ findings exist in the Scripts tab; one rep line contradicted by the audit | M-009 |
| **CALL the prospect** | ❌ no close on the call screen; follow-up script ignores the reply; no gatekeeper / voicemail | M-009 |
| Call workspace → Next Action | ✅ set / change / clear syncs everywhere (A); two-tab and double-log are P2 | M-052, M-053 |
| Quick Close | ⚠️ Optimise works; **Build cannot complete**; no guarantee or minimum term on screen; link buried | M-001, M-011, M-012, M-013 |
| Payment link sent | ⚠️ after a phone call the 24-hour window is usually shut → copy only, unlogged; stale links look ready | M-015, M-014 |
| Prospect replies on WhatsApp after the call | ❌ unmatched — no unread, no notification | M-005 |
| Payment | ✅ money exactly-once; ⚠️ state regression on replay; subscription race | M-016, M-017 |
| Paid Client handoff | ⚠️ nobody owns first contact; Build record shows false blockers | M-018, M-019, M-020 |
| Rep's dashboard | ⚠️ archived leads listed as work | M-008 |

**Verdict: not usable end to end today.** It works only for an Optimise prospect who messaged in the last 24 hours.

**Minimum to make it usable for a controlled launch:** M-001, M-003, M-005, M-008, M-009, the interim part of
M-010, M-011 and M-015, plus Gate 3's payment items. Reps run one-lead checks until WS-7 lands.

### Product decision — a salesperson bulk-check flow (M-034, WS-7)

**Do not expose the admin `bulk-jobs` endpoint.** As built it would hand a rep the whole book, because it checks
`outreach_leads.user_id`, which is the data account. It would also include archived leads and clients, skip the
per-rep guard and per-lead limits, and count a 100-lead job as one guard row (E-04).

**Build a separate, sales-only path.** Working name: **"Check before calling"**, a new edge function
`sales-prospect-check` with its own `verify_jwt` entry in `config.toml`.

| Requirement | Design |
|---|---|
| Only the rep's own leads | Per lead, server-side: `can_work_lead(auth.uid(), lead)`, i.e. `assigned_to_user_id = caller`. Never `user_id`. A lead that fails is reported `skipped: not yours`, never processed. |
| Reject Paid Clients | Refuse `amount_paid > 0` / client statuses (`isPaidLead`), reported `skipped: client`. |
| Reject archived leads | Refuse `is_archived`, reported `skipped: archived`. Also skip suppressed / opted-out leads, so nobody calls someone who said stop. |
| Explicit batch maximum | One named constant (e.g. `SALES_CHECK_BATCH_MAX`), proposed 20, never written as a number in prose. One active batch per rep (claim, not read-then-insert). |
| Dedupe / caching | Reuse a completed hook audit on the same lead younger than a named reuse window, and any in-flight one. Reuse a crawl younger than the crawl window. Same-website leads share one crawl. Reused items cost nothing and say "reused (checked 3 days ago)". |
| Per-rep allowance | Counted **per lead**, not per batch, from `protection_settings` (a new `sales_check` limit per rep per day). Each audit stamped with `actor_user_id` (closes E-20 for this path). |
| Never starve guaranteed measurements | Prospecting draws from a **prospecting pool** separate from the **guarantee pool**. Baselines and re-measures are exempt from the prospecting cap (WS-4, M-010). A batch is refused when Apify's monthly usage is above a reserve line that keeps headroom for every baseline / re-measure due in the cycle. The refusal is plain: "Today's checking budget is used — your leads are still here, try tomorrow or ask Paul". |
| Uses the guarded path | Items go through `create-ai-audit`'s normal per-rep path (town gate, per-lead daily limit, per-rep guard), **not** the internal path that skips them. |
| Progress and failures | A `sales_check_batches` + items table. Per lead: queued / reused / running / done / failed (plain reason) / skipped (reason). The rep sees a progress list that survives reload; failures say what to do ("Town not confirmed — confirm it on the lead"). |
| Review before calling | Each finished lead shows a one-card summary: named or not, the rivals named, the website finding (from the existing hook report and crawl). It opens the call workspace, whose script uses the result. The rep may set "Call · today" as a Next Action in one tap. Nothing happens automatically. |
| Never contacts the prospect | The function's import closure must not reach any WhatsApp, email or auto-reply sender. Add a sweep test (`check-import-graph --reached-by` pattern) that fails if it does. It does not arm the first-reply rule. It writes no lead status other than the audit link. |
| Admin visibility | Admin sees batches per rep, items, spend per rep (from `actor_user_id`) and refusals. |

**Where it sits:** WS-7 starts after WS-1 (crawl-check, M-006) and WS-4 (budget pools, M-010) are merged. It is
**not** in Gate 2. It is required before normal rollout (more than two reps, or reps working full days).

---

## Salesperson security assessment

- **Strong.** Server-side isolation held under every IDOR, direct-write and race E tried. No admin data reaches a
  rep. The QA layer is not a backdoor. Duplicates are refused under concurrency (E).
- **Must fix before any real login:** M-002 (private texts) and M-003 (forged inbound).
- **Must fix before real reps work full days:** M-006 (crawl-check ids) and M-007 (vault names).
- **P2:** sign-out lag (M-054) and small leaks (M-055).
- **The off-boarding rule — write it before the first login (Gate 1):** to remove a rep, **remove their role in
  `user_roles` or suspend them**. That is immediate everywhere, because `my_role()` is read per call. Signing them
  out alone leaves database access for up to an hour (E-09).
- **Notes travel with a lead to its new holder.** Tell reps notes are not private.

---

## Payment / client-state assessment

- **Money is safe on the happy path and on simple replay:**
  - one ledger row, one commission stamp, one client;
  - the £99 amount was verified from Stripe's create-session response on all sessions (`amount_total` 9900);
  - the QA payment path cannot be satisfied for a real lead.
- **State is not yet safe:**
  - **M-016** moves refunded and delivered clients backwards on a late retry.
  - **M-017** can bill twice under overlap.
  - **M-021** lets the agreement route diverge from what Stripe charges.
  - **M-014** leaves superseded links payable.
  - **M-023** lets an admin overwrite a real client.
- **Ownership after payment is missing (M-018).** That is the biggest practical gap. The client, the rep and Paul
  each believe someone else is moving.
- **Not exercisable by the simulation; code-read only:**
  - Stripe's hosted page and consent tick;
  - the delayed subscription and schedule;
  - `invoice.*`, refunds and disputes;
  - Stripe's own signature and retries.

  **Recommendation:** treat the first genuine payment as a watched event. Paul watches; a session reads back the
  lead, ledger, subscription (`trial_end`, `cancel_at`, price), agreement and PAID email within the hour.
  Memory already records "first real Stripe payment still to be watched".

---

## AI delivery assessment

- **The measurement is trustworthy; the measuring stick is not yet.** The engine, freeze, replay, pointers and
  client numbers are correct (C, 120/120, MCL recomputed).
- **What Paul approves is weak:**
  - keyword strings, not customer questions;
  - no core question;
  - unoffered services, with no blocking checks.

  Business truth must outrank AI-generated audit questions, so the confirmed-services list and the "not offered"
  answer become hard inputs (M-028, M-030). C's two missing client questions should be added to onboarding (WS-3
  owns the questionnaire; WS-4 consumes the answers):
  - "Anything you don't offer?"
  - "What do customers call you for most?"
- **Failure is invisible (M-027), and budget can starve guarantee runs (M-010).** Both must land before more
  clients' baselines run unattended.
- **The re-measure path (M-031, M-032, M-033) has time:**
  - nothing new reaches day 28 before about 1 Nov;
  - RG is refunded and will not fire;
  - MCL is ended and will not fire;
  - Ronnie will not fire **once he is closed** (M-004) — that close is the one dated action.
- **Never promised anywhere, and must stay that way:** guaranteed recommendation, guaranteed citations, rankings,
  guaranteed Google AI inclusion. C and D found none in client copy. M-026 and M-032's causal sentence are the
  two places that drift toward implied promises.

---

## Website Build assessment

- **Output: good.** Truthful, entity-clear, crawlable, credible on a phone. D's scores: truthfulness 9 as output,
  entity 9, technical SEO 9.
- **Process: not safe at volume:**
  - Preview Ready is unreachable (M-036);
  - production is ungated (M-040);
  - truth depends on the executing session (M-037, M-035, M-030);
  - no assets without an old site (M-038);
  - every form needs a code deploy (M-039);
  - no post-launch change path (M-042).
- **Principles check against Findable's list:**

  | Principle | Today | Owed by |
  |---|---|---|
  | CRAWLABLE | yes | — |
  | CLEAR | yes | — |
  | SPECIFIC | yes, but repetitive | M-062 |
  | CONSISTENT | yes (gate identity) | — |
  | USEFUL | yes | — |
  | VERIFIABLE | **weak** — no assets, `sameAs` or reviews route | M-038 |
  | SOURCEABLE | yes (direct answers, prices and hours in text) | — |
  | MEASURABLE | yes (frozen 20 → intent map) | M-035, to stop it pointing at the wrong pages |

  No gimmicks found or proposed: no llms.txt, no hidden text, no prompt pages.
- **For the first one to three Build clients** Paul can proceed with D's manual stops:
  - a claim-read of every page;
  - an intent-map edit;
  - one `CLIENT_SITES` deploy;
  - photos added by hand, once M-038 exists or via a hand recon.

  **M-036 and M-040 have no stand-in. They must be fixed.**

---

## Optimise assessment

- **Commercially and legally correct** in Quick Close, checkout, the agreement (9.4, 3.3, Schedule 1),
  `/terms` and the PAID email ("ADD PAGES to their existing site").
- **Wrong in two places:**
  - **The Welcome Pack** says Findable owns, and can take down, "the website" (M-024). It must be fixed before
    any Optimise client receives a pack.
  - **The Website Build page and production steps** are open for Optimise clients (M-040). It must be disabled
    for them. Findable must never take an Optimise client's site down or claim it.
- **The generator** (`page-generator`, gpt-4o) never publishes. Its output is paste-ready only. Three risks:
  - unguarded claims in meta, H1 and body (M-037);
  - cloning across towns (M-043);
  - unsupported Q&A topics (M-035).

  Stand-in until fixed: Paul reads every block against the fact ledger before pasting.
- **There is no single Optimise brief (M-041).** The evidence exists but is assembled only inside the rebuild
  prompt.

---

## Existing client actions

**Nothing in this section was changed by this session.** These are instructions for the fix sessions and
decisions for Paul.

### Ronnie's Shoe Repairs & Key Cutting — CLOSE BEFORE 13 OCTOBER 2026 (TIME CRITICAL)

- **Paul's decision (4 October 2026):** Ronnie is **no longer an active client**. He paid the initial £99, never
  sent the services / information needed to continue, and has gone quiet. The engagement is **closed / completed
  early**:
  - **no refund**; the historic £99 payment and its revenue are **kept**;
  - **no further payments**; **no further work**;
  - **no 13 October re-measure**, and **no repair or re-run** of the wrong locksmith question set;
  - **stop** all future baseline, re-measure, monthly-update, reminder and delivery activity;
  - historic records and any commission already earned are **preserved**;
  - closed with the **existing legitimate Completed / client-ended-early** mechanism — never by fabricating a
    successful delivery state.
- **Record as last read (read-only SQL, 4 Oct; not changed by this session):** lead `payment_received`, not
  archived, not terminated; `remeasure_due_date = 2026-10-13`; `remeasure_audit_id` null; legacy baseline
  `1a0603aa` (run 1 = 3 locksmith questions, runs 2–5 = 15 shoe-repair / key-cutting / watch questions).
- **THE REQUIRED PRE-13-OCTOBER ACTION:** **Close Ronnie using the existing ended-client mechanism and ensure his
  scheduled 13 October remeasurement and all future billing/work are disabled.**
  1. **Close:** Paid Clients → Ronnie → end the engagement, reason **"client ended early"** (paid-client-hub
     `terminate_service`, reason `client_ended_early`, a note such as "Paid £99, never sent the information
     needed to continue, gone quiet; closed by Paul 4 Oct 2026 — no refund, no further work", confirm). Paul
     presses it, or a session runs it with his explicit yes. Nothing else is written by hand.
  2. **Read back (a session, read-only SQL, recorded in `docs/`):**
     - `service_terminated_at` set; `service_termination_reason = 'client_ended_early'`;
     - `amount_paid` still 99; `status` not `refunded`; his `payment_ledger` / commission rows unchanged in
       count and value (diffed against a snapshot taken just before the close);
     - `fireDueRemeasures`' exact query (`audit-baseline.ts:640-652`) returns no row for him;
     - `stripe_subscription_id` null and Stripe shows no subscription or subscription schedule for him. If one
       exists, **Paul cancels it in Stripe** (the close action emails him to do so; the app never moves money);
     - Paid Clients shows him **COMPLETED · "Completed — nothing further to do"**; he is absent from the admin
       "needs you" list, the paid-client count, weekly checks and performance sync.
  3. **Watch on 13–14 Oct:** no `ai_audits` row with `audit_purpose='remeasure'` for his lead; no Apify spend
     against him.
- **Do NOT:** move or clear his `remeasure_due_date` (the firer already skips an ended client, and clearing dates
  is the C-09 hazard); archive him instead of closing; set `refunded`; delete, regenerate or re-extract
  `1a0603aa`; create any new question set; send him anything.
- **Deadline:** close by **Friday 9 October 2026**. Last safe day **Monday 12 October** (the firer runs on the
  cron and treats a date ≤ today in UTC as due, so it can fire in the first minutes of 13 October).
- **Owner:** Paul (the decision is made; he presses the close or approves a session doing it). **WS-3** owns the
  read-back and the ended-client tests below. WS-4 no longer has any Ronnie work.

#### Tests the engineering plan must run: closing Ronnie cannot…

Run on a **fixture** shaped like Ronnie (paid £99, legacy baseline pointer, a due `remeasure_due_date`, a ledger
row), closed with `client_ended_early` — never on Ronnie's live row. Owned by **WS-3**, run again in the final
regression.

| Closing must not… | Test | Where it is guarded |
|---|---|---|
| refund the £99 | after the close: `amount_paid` unchanged, `status` ≠ `refunded`, no refund call in the code path (static sweep: `terminate_service` reaches no Stripe refund endpoint) | `serviceEnd.ts` rule; `terminate_service` writes four columns only |
| erase historic revenue | admin revenue and the client's ledger / commission rows identical before and after (diff); the revenue fold still counts the £99 (`isPaidLead`, not `refunded`) | `adminMetrics.ts`; write-once ledger |
| trigger another payment | no Checkout Session, Payment Link or invoice created; Quick Close refuses (`already_paid`); no payment-link template sendable for an ended client | `quick-close` `already_paid`; WS-2 to confirm the email-the-link path (M-015) also refuses an ended client |
| create recurring charges | no subscription / schedule created by the close; a `checkout.session.completed` replay after the close creates none (`delayed-subscription.ts` must refuse an ended client — **add the check**, with M-017's claim); an `invoice.paid` after the close does not set `subscription_status='active'` or earn commission (**E-17, fix in WS-3**) | `stripe-webhook`, `delayed-subscription.ts`, `commission.ts` |
| trigger the 13 October re-measure | with a due date ≤ today, `fireDueRemeasures` returns 0 for the ended fixture; no `remeasure` audit; the results sender skips it | `audit-baseline.ts:646`; `remeasure-results.ts:149` |
| trigger monthly updates or delivery work | weekly visibility and performance sync skip it; the delivery stage is `ended` (Completed), with no next step; admin "needs you" omits it; **creating or sending a monthly update for an ended client is refused (new guard — today `client_monthly_updates` never reads `service_terminated_at`)**; no setup / agreement / chase reminder fires | `weekly-visibility:76`, `performance-sync:121`, `deliveryStage.ts`, `adminMetrics.ts:920`; monthly-update functions (new) |
| be accidentally reactivated by a payment / webhook replay | replay `checkout.session.completed` ×3 after the close: `service_terminated_at` and reason unchanged; `status` not moved back to `payment_received`; onboarding not moved back to `paid`; no baseline restarted; no second ledger row, notification, PAID email or WhatsApp (**today the status and onboarding DO regress — E-02 proved it on an ended fixture; M-016's fix must cover the ended case**). A second `terminate_service` answers `already` and changes nothing | `stripe-webhook:1210-1220`, `:907-912` (M-016); `terminate_service` conditional update |

### MCLocksmiths — COMPLETED / ENDED (3 October)

- `service_terminated_at` is set, so the replay, weekly checks and performance sync are all excluded. His public
  report and pack stay up as homepage proof (Paul confirmed consent).
- **Do not touch:** his baseline `50880751`, his site, DNS, report or pack.
- **One check for WS-3, read-only:** confirm MCL has no live Stripe subscription. E-17 means an `invoice.paid`
  after the end would mark him active and earn commission. Memory says there is no monthly; verify, do not change.
- **C's stray read raised his report's `open_count` by one** (to 16). Paul may subtract it; nobody else should.

### RG Locksmiths — refunded

- The replay picker excludes refunded leads, so **nothing fires on 6 Oct**. CLAUDE.md §1's "approve before then"
  is stale (M-063).
- Keep his pinned date and frozen baseline `f64920ce` untouched.
- **M-016's fix must make sure a late Stripe retry can never move RG out of `refunded`.**

### BS4 Electrical (first real Build)

- Its `CLIENT_SITES` entry exists; M-039's table migration must **carry it over, not drop it**.
- Its stored draft lacks the Hook questions (memory: press "Use recommended baseline"). That is Paul's open item
  and not part of this plan.

### Historical-client compatibility — what must NOT be globally rewritten

1. **Frozen baselines and pointers.** Never regenerate, re-extract or re-point (RG `f64920ce` stays suppressed by
   the junk rule; MCL `50880751`; Ronnie `1a0603aa`). M-061's server refusal for legacy rows must leave
   `baseline_status` null rows as they are.
2. **Pinned re-measure dates** (RG 6 Oct, Ronnie 13 Oct, MCL 20 Oct). M-031's fix refuses future nulls; it must
   not backfill or rewrite. Ronnie's and MCL's dates stay as history: the ended mark, not the date, is what stops
   the replay.
3. **M-016 "never move status backwards"** applies to future webhook writes only. No data migration of existing
   statuses.
4. **Derived, never stored.** M-018's WAITING FOR FINDABLE and M-019's no-website rule are derived on read. No
   stored state is back-filled.
5. **The Welcome Pack** keeps neutral wording for legacy clients without `contract_total_payments` (as today).
6. **Write-once rows** stay as written: `payment_ledger`, agreement acceptances, `lead_activity`.
7. **Question-generator changes** (M-028, M-029) apply to new drafts only. Never re-draft an approved or frozen
   set.
8. **M-002** narrows who can read Paul's templates. It does not delete his rows; Paul decides what moves.
9. **M-005's matching fix** applies to new inbound only. Do not mass-attach old unmatched messages.
10. **M-051.** Do not mass-unsuppress the 37 shared-email leads. A suppression is a person's wish until shown
    otherwise.

---

## Launch gates

Every gate is **FAIL NOW**. Gates are cumulative: each needs the ones before it, except Gate 6, which runs on its
own track.

### GATE 1 — Safe to give test salesperson logins (a real person, test account, fixtures only)
**FAIL NOW.** Blocking:
- **M-002**: policy narrowed, and Paul's two old Payment Links deactivated in Stripe;
- **M-003**: the webhook (Meta app secret set, a genuine inbound proven, then fail-closed). It is a P0 and an
  external hole that exists whether or not anyone logs in; Session E's launch line is "no logins until E-01 and
  A-02 are fixed";
- **the off-boarding rule** (M-054) written into `docs/` and CLAUDE.md;
- **M-051 QA impact**: README's fixture email changed, because the sink is suppressed.

### GATE 2 — Safe for real calling / prospecting (real reps, real leads, no payment links yet)
**FAIL NOW.** Blocking, on top of Gate 1 (which now includes M-003):
- M-005, the reply after a call;
- M-006, crawl-check ids;
- M-007, vault names deleted;
- M-008, archived leads off the to-do list;
- M-009, the close block and the overpromising lines fixed;
- **M-010 interim**:
  - baselines and re-measures exempt from the $12 prospecting cap;
  - a reserve line on Apify's monthly usage;
  - Paul's decision on the Apify cap / plan.

**In practice ship Gate 2 and Gate 3 together.** Gate 2 alone means reps book call-backs instead of closing.

### GATE 3 — Safe to take a real payment
**FAIL NOW.** Blocking, on top of Gate 2:
- M-001 (Build close);
- M-011 (guarantee, minimum term and agreement tick stated before the link);
- M-014 (stale and superseded links);
- M-015 (window-closed send: "Email the link" plus History rows for copy and email). After a phone call the
  24-hour window is shut on almost every close, so without it the one step that takes the money happens off the
  system, from the rep's own phone, with no record. The Meta payment-link template stays after launch;
- M-016 (no status regression);
- M-017 (subscription idempotency);
- M-018 (first-contact owner);
- M-021 (agreement route lock);
- M-026 (hook report guarantee sentence).

**For Build payments, also:** M-012 (consent wording), M-019 (false blockers) and M-020 (consents wiped).

**Strongly recommended in the same release, not gate-blocking:** M-013 and M-022.

### GATE 4 — Safe to deliver Optimise
**FAIL NOW.** Blocking, on top of Gate 3 and Gate 6:
- M-024 (Welcome Pack ownership);
- M-040's Optimise half (Website Build and production disabled for Optimise);
- M-025 (questionnaire promise).

**Allowed with a documented manual stand-in for the first 1–3 Optimise clients:**
- M-037 / M-043 / M-035 (page-generator claims, cloning, Q&A topics) → Paul reads every block against the fact
  ledger;
- M-041 (Optimise brief) → Paul works from the client page.

### GATE 5 — Safe to deliver Build
**FAIL NOW.** Blocking, on top of Gate 3 (with its Build items) and Gate 6:
- M-036 (`section on /`);
- M-040 (production gated on Preview Ready and QA ticks);
- M-038 (client assets without an old site);
- M-024 (pack names the new website);
- M-025.

**Allowed with a manual stand-in for the first 1–3 Build clients:**
- M-039 → one engineer deploy of `CLIENT_SITES` per client;
- M-035 → Paul edits the intent map;
- M-037 → Paul claim-reads every page;
- M-030 → Paul checks each "verified" service against what the client said;
- M-041 → handoff pasted into the prompt;
- M-062's D-10 → home-town page off.

**M-042** (post-launch change prompt) is owed before the first monthly page is due, about four weeks after the
first launch.

### GATE 6 — Safe to run baseline / remeasurement
**FAIL NOW.** Blocking for any new client's baseline approval:
- **M-010** (guarantee pool, so a baseline is never capped by reps);
- **M-027** (failure visible);
- **M-028** (blocking checks: branded question, unconfirmed service; `must_not_say` fed to the generator);
- **M-029's mandatory core questions**;
- **M-030** (no merged write-back);
- **M-031** (date cannot be cleared).

**Allowed with a stand-in until fixed:** M-029's question *style* → Paul rewrites the draft in the MCL style.

**Blocking before the first new client's day 28** (none before about 1 Nov):
- M-032, with Paul approving the results copy;
- M-033.

**Blocking for existing clients:** M-004 — Ronnie closed with the ended-client mechanism (client ended early) and
read back, by 9 Oct (last safe day 12 Oct).

---

## Engineering workstreams

Seven workstreams, cut by **file ownership** so no two edit the same file. Rules for every workstream (from
CLAUDE.md §3 and Paul's 14 session-safety rules):
- Each is one worktree and one branch (`fix/<ws-name>`) off a freshly fetched `origin/main`, proved equal before
  branching.
- Run `npm run check`; read the FAILED names, never the count.
- Reconcile with `origin/main` before merge. Merge `--no-ff`.
- **Deploy only from `main`**, never chained after a push in one command.
- SQL goes first and is read back before any deploy that depends on it.
- After a shared-module change, redeploy the closure (`check-import-graph --reached-by`) and name it.
- **Migration names do not collide:** each workstream has its own timestamp prefix, with the hour set to the
  workstream number (WS-1 → `2026100601xxxx`, WS-2 → `2026100602xxxx`, … WS-7 → `2026100607xxxx`).
- Paul approves every destructive SQL statement, secret change and Stripe action. The sessions write and run the
  code.

### WS-1 — SECURITY & INBOUND
- **Mission:** close the external hole and the private-data leak, and make every inbound reply reach its rep.
- **Findings:** M-002, M-003, M-005, M-006, M-007. Later: M-050, M-051, M-054, M-055 (its public-function half).
- **Likely files / areas:**
  - `supabase/functions/whatsapp-status/`;
  - `_shared/whatsapp-inbound.ts`;
  - `_shared/first-reply-audit.ts` (M-050 later);
  - `supabase/functions/crawl-check/`;
  - a migration narrowing `sales_select_templates` (and any sibling `book_owner_id()` policy);
  - vault entries (SQL shown to Paul);
  - a new fixture-only `x-qa-simulate-inbound` path (CRON_SECRET + fixture / reserved number only, mirroring the
    Stripe QA path);
  - `scripts/` tests;
  - the off-boarding note in `docs/`.
- **Dependencies:**
  - Paul sets `WHATSAPP_APP_SECRET`, and a genuine inbound is proven, **before** the fail-closed deploy;
  - Paul deactivates the two old Payment Links.
- **Can run in parallel with:** WS-2, WS-3, WS-4, WS-5, WS-6.
- **Must not run in parallel with:** any other session editing `_shared/whatsapp-inbound.ts` or `whatsapp-status`.
  The primary checkout has stale uncommitted edits to `whatsapp-inbound.ts` from 19 Sep; ignore them and work from
  fresh `origin/main`.
- **Acceptance tests:**
  - As a rep: zero of Paul's templates; the Quick reply list is empty or the rep's own.
  - Unsigned inbound → 401, nothing stored; a genuine inbound lands; secret unset → 401.
  - QA inbound helper accepted only for fixtures and refused for a real number.
  - Spaced-phone inbound with no outbound → linked to the lead, holder notified.
  - crawl-check foreign `job_id` / `run_id` → 403.
  - Vault names contain no JWT.
- **Deployment order:**
  1. SQL: policy narrowing, read back with `pg_policies`.
  2. Paul: secret set; one genuine inbound checked.
  3. Deploy `whatsapp-status` (and everything `--reached-by` `whatsapp-inbound.ts`), then `crawl-check`.
  4. Vault SQL, after Paul's yes.

### WS-2 — QUICK CLOSE & PAYMENT LINK
- **Mission:** a rep can close Build or Optimise on the phone in one screen, with the true terms said out loud,
  and send a link that works.
- **Findings:** M-001, M-011, M-012, M-013, M-014, M-015, M-008 (the `my_handoffs` half and B-13). Later: M-044,
  M-045.
- **Likely files / areas:**
  - `supabase/functions/quick-close/` (sole owner, including `my_handoffs`);
  - `src/lib/quickClose.ts`;
  - `QuickCloseDialog.tsx`, `QuickCloseButton`, `SalesHandoffForm.tsx`;
  - `src/components/salesDash/MyHandoffs.tsx`;
  - `src/lib/findableOffer.ts` wording (sole owner) plus its findable-site mirror (`src/lib/site.ts`), with
    `check-cross-repo-sync` green;
  - the email-the-link path, through the existing QA email guard;
  - `client-copy-claims.test.ts`.
- **Dependencies:** none to start. The guarantee sentence stays the byte-locked `REMEASURE_CLAIM_SENTENCE`.
- **Can run in parallel with:** WS-1, WS-3, WS-4, WS-5, WS-6.
- **Must not run in parallel with:** anything editing `findableOffer.ts` or findable-site `site.ts`. WS-3's
  findable-site edits are other files, but **findable-site deploys are serialized** (one deploy, from a clean
  `origin/master` worktree with `--branch=master`).
- **Acceptance tests:**
  - One-answer-per-call Build save → `ready` → link created (`amount_total` 9900 from the create response).
  - "No domain" consent wording stored.
  - Generate / Copy in the first screen at 375 and 1366.
  - A 26 h link → "Make a fresh link".
  - Route change → old session expired.
  - Window closed → "Email the link" to the QA sink, History rows for copy and email.
  - Guarantee, minimum term and agreement-tick lines present.
  - An archived handoff is not listed.
- **Deployment order:** deploy `quick-close` (and anything reaching the changed `src/lib` files) → push the SPA
  (auto-deploys) → findable-site mirror deploy if the offer wording changed. Price figures do not change, so there
  is no price-guard ordering issue.

### WS-3 — PAYMENT, PAID-CLIENT STATE & CLIENT DOCUMENTS
- **Mission:** after payment, the record is right, someone owns the next step, and every client document matches
  the route.
- **Findings:** **M-004 first (Ronnie's close read-back, no code)**, M-016, M-017, M-018, M-019, M-020, M-021,
  M-022, M-023, M-024, M-025, plus the **ended-client test suite** (*Existing client actions → Tests the
  engineering plan must run*) and its three small guards: an ended client is never subscribed
  (`delayed-subscription.ts`), `invoice.paid` after the end never reactivates or earns commission (the E-17 half of
  M-056, pulled forward), and a monthly update cannot be created or sent for an ended client. Later: M-046, M-047,
  M-048, M-049, M-055 (onboarding half), the rest of M-056. Also renders WS-4's failed-baseline state.
- **Likely files / areas:**
  - `supabase/functions/stripe-webhook/`;
  - `_shared/delayed-subscription.ts`;
  - `src/lib/handoffReadiness.ts`, `src/lib/deliveryStage.ts` (**sole owner** of both);
  - `src/lib/manualOnboarding.ts` and `ManualOnboardingDialog`;
  - `supabase/functions/paid-client-hub/` (sole owner at launch);
  - `ClientHub.tsx` (sole owner) and `ClientSetupCard.tsx`;
  - `supabase/functions/notify-onboarding-submit/`, `src/lib/adminMetrics.ts`;
  - `welcomePackHtml.ts`, `welcome-pack-render.ts`, `welcomePackData.ts`;
  - `PaidClients.tsx`;
  - the monthly-update functions (migration `20261006100000_client_monthly_updates.sql` defines them; a new
    migration adds the ended-client refusal) and `MonthlyUpdatePanel.tsx`;
  - `src/lib/commission.ts` / `_shared/earnings.ts` (the ended-client half of E-17 only);
  - findable-site: the post-payment onboarding page, and the questionnaire wording with its `manualOnboarding.ts`
    mirror.
- **Dependencies:**
  - **Ronnie closed by Paul (or by a session with his yes) before 13 Oct.** That needs no WS-3 code; WS-3 does the
    read-back the same day and records it.
  - Paul rules on the SEO grade in the pack (default remove).
  - The read-only MCL subscription check.
  - Coordinate the `deliveryStage.ts` "baseline failed" branch with WS-4: WS-4 supplies the data, WS-3 renders it.
- **Can run in parallel with:** WS-1, WS-2, WS-4, WS-5, WS-6.
- **Must not run in parallel with:** WS-4 on `deliveryStage.ts` (WS-3 owns the file; WS-4 only writes the data).
  WS-6 must not edit `ClientHub.tsx`; D-06 is done inside `WebsiteBuild.tsx`.
- **Acceptance tests:**
  - **Ronnie (live, read-only):** the M-004 read-back passes (ended `client_ended_early`, £99 and ledger
    unchanged, no subscription, not returned by the re-measure firer, COMPLETED in Paid Clients).
  - **Ended-client suite on a Ronnie-shaped fixture:** closing cannot refund the £99, erase historic revenue,
    trigger another payment, create recurring charges, trigger a due re-measure, trigger monthly updates or
    delivery work, or be reactivated by a payment / webhook replay (the seven rows in *Existing client actions*).
  - Replay ×2 on fixtures in `in_delivery`, `refunded` and ended → nothing regresses.
  - Subscription create carries an Idempotency-Key, with the claim unit-tested.
  - A paid fixture shows WAITING FOR FINDABLE with a due date; Send setup link stamps it.
  - A no-website Build fixture has no false blockers.
  - The B1 onboarding replay keeps its consents.
  - The agreement route is refused after checkout acceptance.
  - Quick Close rows are never notified as "not paid".
  - `create_manual` on a paid lead is refused.
  - Optimise and Build packs read right.
  - The questionnaire's new wording is live on findable.live.
- **Deployment order:**
  1. Any SQL (a status-regression guard if chosen), read back.
  2. Deploy `stripe-webhook` **before** the SPA (backend first).
  3. Deploy `notify-onboarding-submit`, `paid-client-hub` and the Welcome Pack render function.
  4. SPA.
  5. findable-site (serialized with WS-2).

### WS-4 — AI MEASUREMENT (BASELINE, BUDGET)
- **Mission:** the guarantee measurement is never starved, never fails silently, and never measures something the
  client does not do. (Ronnie is no longer WS-4 work: he is closed, not re-measured — M-004, owned by Paul and
  WS-3. No legacy replay-set choice is built.)
- **Findings:** M-010, M-026, M-027, M-028, M-029, M-030, M-031, M-032, M-033. Later: M-060, M-061. Also the
  report-CTA half of M-049.
- **Likely files / areas:**
  - `_shared/audit-baseline.ts` (failed state);
  - `supabase/functions/process-ai-audit-queue/` (budget pools);
  - `create-ai-audit` (generator prompt; the sole owner, which WS-7 calls but does not edit);
  - `_shared/baseline-discovery.ts`, `src/lib/baselineMix.ts`, `baselineRecommendation.ts`;
  - `supabase/functions/paid-baseline/`;
  - `src/lib/clientContext.ts`;
  - **new leaf `src/lib/serviceScope.ts`**;
  - `LeadDeliveryCockpit.tsx`;
  - `_shared/remeasure-results.ts`, `src/lib/remeasureResults.ts`, `measurementCompare.ts`;
  - `aiAuditReportHtml.ts` (sole owner);
  - `run-finalise.ts`.
- **Dependencies:**
  - Paul's Apify cap / plan decision.
  - Paul approves the results copy before M-032 sends anything.
- **Can run in parallel with:** WS-1, WS-2, WS-3, WS-5, WS-6.
- **Must not run in parallel with:** WS-7's edge work (WS-7 waits for the budget pools); WS-3 on
  `deliveryStage.ts`.
- **Order inside WS-4:**
  1. Budget pools / guarantee exemption.
  2. `serviceScope.ts` and the M-028 checks.
  3. M-027.
  4. M-029.
  5. M-030.
  6. M-031.
  7. M-026.
  8. M-032 / M-033.
- **Acceptance tests:**
  - A baseline fixture still runs with the daily cap exhausted.
  - A forced give-up → `failed` and Needs attention.
  - C's truth set → no "car keys", two core questions, ≤2 per service.
  - A branded question refused without a reason.
  - An unticked town never measured.
  - The date picker cannot clear.
  - Verdict on an engine-short replay → hold.
  - Hook report wording.
  - `scripts/` "only one of it" test for `serviceScope`.
- **Deployment order:**
  1. SQL first (any budget columns), read back.
  2. `process-ai-audit-queue`, `create-ai-audit`, `paid-baseline`, `render-audit-report` and everything
     `--reached-by` the changed shared modules (name them).
  3. SPA.
  4. The results sweep goes live only after Paul's copy approval (`REMEASURE_RESULTS_COPY_APPROVED` stays false
     until then).

### WS-5 — SALES CALL WORKSPACE
- **Mission:** a rep on a live call has the opener, the finding, the close and the next step on one screen, and
  the to-do list is real.
- **Findings:** M-008 (the `sales-performance` half), M-009. Later: M-052, M-053, M-058, M-059, B-27 from M-047.
- **Likely files / areas:**
  - `src/lib/coldCallPlaybook.ts`, `voiceNoteScript.ts`, `salesStyle.ts`;
  - the lead workspace Scripts / Work tab components;
  - `supabase/functions/sales-performance/`;
  - the sales dashboard fold (`salesWorkspace.ts`);
  - later: the call-log and Next Action RPCs (SQL).
- **Dependencies:** none. It reads the offer constants from `findableOffer.ts` and never edits them (WS-2 owns
  them).
- **Can run in parallel with:** all others.
- **Must not run in parallel with:** WS-2 on `MyHandoffs.tsx` / `quick-close`. WS-5 does not touch them.
  Not with any Inbox-page work: avoid `Inbox.tsx` at launch.
- **Acceptance tests:**
  - Script snapshots per route, with the guarantee sentence byte-identical to the constant.
  - "Who's this?" opener.
  - No year in a recent date.
  - No absolute no-website claim.
  - Gatekeeper and voicemail blocks.
  - An archived lead absent from the rep's dashboard, counts and actions.
  - Rendered as Test on a fixture (read via `read_page`).
- **Deployment order:** deploy `sales-performance` → SPA.

### WS-6 — WEBSITE BUILD & OPTIMISE GENERATOR
- **Mission:** a Build can reach Preview Ready honestly, production is gated, Optimise clients can never be
  "built", and generated words are checked against verified facts.
- **Findings:** M-035, M-036, M-037, M-038, M-039, M-040, M-041, M-042, M-043; the consumer side of M-030
  (`buildFacts` verifies only client-submitted lists). Later: M-062.
- **Likely files / areas:**
  - `src/lib/siteGate.ts`, `intentOwnership.ts`;
  - `scripts/site-quality-gate.mjs`;
  - `WebsiteBuild.tsx` (sole owner, including the Optimise disable);
  - `websiteQuality.ts`, `buildExecution.ts`, `stagePrompts.ts`, `buildPack.ts`;
  - `buildFacts.ts`, `clientFacts.ts` (the verify rule only);
  - `recon.ts` (asset step), `websiteBuildPrompt.ts`;
  - `_shared/site-enquiry.ts` plus a new registry table;
  - `supabase/functions/page-generator/`.
- **Dependencies:**
  - **WS-4's `serviceScope.ts`** for M-035 (start M-036, M-040, M-038, M-039 and M-037 first);
  - WS-4's M-030 root fix before the `buildFacts` change;
  - BS4's `CLIENT_SITES` entry carried into the new table.
- **Can run in parallel with:** WS-1, WS-2, WS-3, WS-5, WS-7. With WS-4 too, if it rebases onto the leaf.
- **Must not run in parallel with:** WS-3 on `ClientHub.tsx` or `paid-client-hub` (D-22's "Launched" event waits
  for after launch).
- **Acceptance tests:**
  - D1 and D2 truth sets re-run through the real functions: gate 17/17; unoffered and unserved questions listed
    `unowned` with reasons; no blank owners.
  - A planted invented claim fails the gate and page-generator.
  - Production items absent until Preview Ready and the QA ticks.
  - Optimise client → Build disabled.
  - An asset added for a no-site client appears in the config.
  - A new fixture site's form works with no deploy.
  - The 1,020 existing Website Build checks still pass.
- **Deployment order:**
  1. Registry table SQL with BS4 carried over, read back.
  2. Deploy `site-enquiry` and `page-generator` (and the `--reached-by` closure).
  3. SPA.
  4. The gate script ships with the repo (the template repo's copy is updated by the build prompt itself).

### WS-7 — CALL-FIRST PROSPECT CHECKS (sales bulk audit)
- **Mission:** build the design under *Call-first workflow assessment*.
- **Findings:** M-034; the per-rep attribution half of M-057.
- **Likely files / areas:**
  - a new `supabase/functions/sales-prospect-check/` (+ `config.toml` `verify_jwt` entry);
  - new `sales_check_batches` / items tables and RPCs;
  - an `actor_user_id` stamp on `enrichment_usage` (column via SQL; the stamp is passed through WS-4's
    `create-ai-audit` interface, agreed before WS-7 starts);
  - a `protection_settings` `sales_check` limit;
  - Outreach selection toolbar and a "Checks" progress / review panel (new components);
  - an import-graph sweep test proving no sender is reachable.
- **Dependencies:** WS-1 merged (M-006 crawl-check) and WS-4's budget pools merged (M-010). UI scaffolding may
  start earlier on mocks.
- **Can run in parallel with:** WS-2, WS-3, WS-5, WS-6 throughout, and with WS-1 and WS-4 once their pieces are in.
- **Must not run in parallel with:** WS-4 editing `create-ai-audit` or `process-ai-audit-queue`. WS-7 calls them
  and never edits them.
- **Acceptance tests:**
  - Two reps at once: each batch includes only their own leads.
  - Archived, paid, suppressed and other-rep leads → `skipped` with a reason.
  - Batch over the maximum → refused.
  - A recent audit → `reused`, zero spend.
  - Per-rep allowance enforced per lead.
  - With the prospecting pool exhausted, a baseline fixture still runs.
  - 0 WhatsApp / email rows written.
  - Admin sees per-rep batches and spend.
- **Deployment order:**
  1. SQL (tables, limit, actor column), read back.
  2. Deploy the function.
  3. SPA.

---

## Recommended parallel execution plan

| Wave | Runs in parallel | Starts when | Ends with |
|---|---|---|---|
| **0 — Paul, today/tomorrow (no code)** | **Close Ronnie** as client ended early (by Fri 9 Oct; last safe day Mon 12 Oct), then a session reads it back; set `WHATSAPP_APP_SECRET`; deactivate the two old Payment Links; Apify cap / plan decision; SEO-grade ruling | now | decisions written into `docs/` by the first session that starts |
| **1 — launch fixes** | **WS-1, WS-2, WS-3, WS-4, WS-5** (five sessions, disjoint files) and **WS-6 on its leaf-independent items** (M-036, M-040, M-038, M-039, M-037) | immediately, after Wave 0's secret for WS-1's deploy | Gates 1, 2, 3 and 6 passable |
| **2 — dependants** | **WS-7** (needs WS-1's crawl-check and WS-4's pools); **WS-6's M-035 / M-030 consumer** (needs WS-4's leaf and root) | WS-1 and WS-4 merged | Gates 4 and 5; normal rollout |
| **3 — after launch** | P2 themes, by owning workstream | after the final regression | — |

**Which can run in parallel:** WS-1 ∥ WS-2 ∥ WS-3 ∥ WS-4 ∥ WS-5 ∥ WS-6 (part) from day one. WS-7 joins when WS-1
and WS-4 are merged.

**Collision guards (single owners):**

| File or area | Owner |
|---|---|
| `quick-close`, `findableOffer.ts` | WS-2 |
| `deliveryStage.ts`, `handoffReadiness.ts`, `ClientHub.tsx`, `paid-client-hub`, `stripe-webhook` | WS-3 |
| `create-ai-audit`, `process-ai-audit-queue`, `audit-baseline.ts`, `aiAuditReportHtml.ts`, `serviceScope.ts` | WS-4 |
| `whatsapp-status`, `whatsapp-inbound.ts`, `crawl-check` | WS-1 |
| `coldCallPlaybook.ts`, `sales-performance` | WS-5 |
| `WebsiteBuild.tsx`, the gate, `page-generator`, `site-enquiry` | WS-6 |
| findable-site deploys | serialized: WS-3 deploys, WS-2's mirror rides along or deploys next |
| Edge deploys | serialized through `main` |

---

## Deployment order

1. **Paul's no-code actions:**
   - Meta app secret set, then one genuine inbound checked;
   - old Payment Links deactivated;
   - Apify decision;
   - off-boarding rule written.
2. **Close Ronnie** with the existing ended-client mechanism (Paid Clients → end engagement → "client ended early",
   i.e. `terminate_service` / `client_ended_early`), then the WS-3 read-back. **No code, no deploy, no date
   change. Not later than Monday 12 October.** If the read-back shows a live Stripe subscription or schedule,
   Paul cancels it in Stripe the same day.
3. **Release R1 — security (Gate 1 + Gate 2's security half):** templates policy SQL → read back → deploy
   `whatsapp-status` (+ closure) and `crawl-check` → vault SQL after Paul's yes.
4. **Release R2 — close + payment (Gate 3):**
   - WS-3 backend first: `stripe-webhook`, `notify-onboarding-submit`, `paid-client-hub`, Welcome Pack renderer.
   - WS-2: `quick-close`.
   - WS-4's budget pools (`process-ai-audit-queue`) and the hook-report copy (`render-audit-report`).
   - SPA.
   - findable-site (serialized).
5. **Release R3 — call workspace (Gate 2's sales half):** `sales-performance` → SPA. May ship with R2.
6. **Release R4 — measurement (Gate 6):** WS-4 SQL → functions (`create-ai-audit`, `paid-baseline`, the queue,
   the results sender held behind its flag) → SPA. The results sweep is enabled only after Paul's copy approval.
7. **Release R5 — Build / Optimise (Gates 4 and 5):** WS-6 registry SQL → `site-enquiry`, `page-generator` → SPA.
8. **Release R6 — prospect checks (normal rollout):** WS-7 SQL → function → SPA.
9. **Final regression** (below) after R1–R5. R6 is re-certified on its own when it lands.

**Verification after every deploy:**
- prove the live code with a marker only the new code produces (CLAUDE.md §4);
- for authed functions, grep the deployed body;
- confirm the Cloudflare account, project, branch and commit;
- check `app.leadfinderos.com` afterwards (memory: production URL).

---

## Final regression plan

A fresh end-to-end certification after R1–R5, run on a **new fixture range**. Proposed: `1f000000-…f01` …
`…f20`, phones 07700 900601–900620, under the README §4 rules.

**Two corrections to the README must land first:**
- **The fixture email.** `paul@move37.fun` is now suppressed (M-051). Either fixtures carry no email unless the
  test needs one, or Paul approves lifting that one suppression row.
- **Inbound simulation.** It must use WS-1's fixture-only signed or `CRON_SECRET` path, because the unsigned
  route is closed.

### The journey (one Build fixture and one Optimise fixture, end to end)

| # | Step | Actor | Must prove |
|---|---|---|---|
| R1 | Salesperson login, desktop + phone | Test | Lands on the dashboard; no archived lead in "What to do next"; Quick reply shows none of Paul's texts |
| R2 | Find Leads (one cached town, no fresh Places spend if possible) | Test | Results, agency check, owner-safe duplicate guard |
| R3 | Add prospect | Test | Fixture F1 (no website → Build) and F2 (findable.live → Optimise), excluded first |
| R4 | **Bulk audit/crawl** (if WS-7 has landed; otherwise one-lead checks, recorded as such) | Test | Only own leads; reuse on a second press; per-rep allowance counted per lead; 0 sends |
| R5 | Review findings | Test | The card shows named / rivals / website finding; opens the call workspace |
| R6 | Call workspace | Test | Opener, finding, the "If they're interested" block with the exact guarantee sentence, the minimum term, the route; gatekeeper / voicemail present |
| R7 | Next Action | Test | Set "Call · today" → change → stays in sync; a double-submitted call outcome logs once (if M-053 landed) |
| R8 | Inbound after a call | system | Fixture-only signed inbound from F1's number with no prior outbound → linked, Test notified (M-005) |
| R9 | **Quick Close, one answer per tap**, Build (F1) and Optimise (F2) | Test | Both reach `ready`; "No domain" consent wording; terms stated; Generate in the first screen at 375 |
| R10 | Payment link | Test | `amount_total` 9900 from the create response; window closed → Email the link (QA sink) + History; 26 h link → fresh link; route change → old session expired |
| R11 | **Payment simulation** ×1, then **×3 replays**, then a replay after moving F2 to `in_delivery` and a third fixture to `refunded` | coordinator script | One client, one ledger row, one notification, one PAID email; **no status regression**; refunded stays refunded |
| R12 | Paid Client | Paul (admin) | Exactly one card each; seller retained; route consistent; **WAITING FOR FINDABLE** with a due date; no false website blockers on F1 |
| R13 | Handoff | Test / Paul | Seller completes after payment; Paul sees it; "Fix in onboarding" on F1 keeps the consents |
| R14 | Agreement | Paul | Route locked after checkout acceptance; agree page signed (QA sink); PDF correct |
| R15 | Discovery | Paul | Generate on C's MCL-derived truth set: no unoffered service; `must_not_say` respected |
| R16 | Baseline questions | Paul | Two core questions present; ≤2 per service; branded question refused without a reason |
| R17 | Baseline run | system | **One** controlled run (cap ≈ $1); 120/120; with the prospecting pool deliberately exhausted the baseline still runs; a forced give-up on a second fixture is visible (use a no-spend failure injection if WS-4 provides one) |
| R18 | Build (F1) | Paul | Website Build reaches Preview Ready on the D1 truth set locally (no deploy); planted invented claim fails; production items locked until QA ticks; assets added without an old site |
| R18b | Optimise (F2) | Paul | Website Build disabled with a sentence; page-generator refuses a cloned town page and an invented claim; Welcome Pack says "Your website is always yours" |
| R19 | Launch / readiness | Paul | READY TO SUBMIT → READY FOR DELIVERY; next steps owned correctly |
| R20 | Re-measure setup | system | Date = freeze + 28, cannot be cleared by a click; replay set = frozen 20; results held behind the flag; archived fixtures excluded |

### Cross-cutting checks (run alongside)

| Check | Pass condition |
|---|---|
| **Two salespeople simultaneously** (Test and test1, each with their own fixtures, running R4–R10 at the same time) | No cross-visibility; races resolve to one winner; neither rep's batch touches the other's leads |
| **Another rep cannot access it** | test1 → Test's leads, campaign, batch, Quick Close, payment link and paid client: `not_your_lead` / `not_found` / `admin_only` |
| **Admin visibility** | Paul sees both reps' batches, spend per rep, Paid Clients, notifications, and the failed-baseline item in Needs attention |
| **No fake external contact** | 0 Meta message ids system-wide for the window; every outbound to a fixture `simulated`; unsigned inbound refused; no email outside paul@findable.live and the QA sink |
| **No duplicate spend** | Bulk reuse proves zero spend on repeat; one baseline per fixture; re-measure not fired; `enrichment_usage` per-rep rows add up; Apify delta within the cap |
| **Correct client-facing wording** | `client-copy-claims` green. On rendered pages, by grep for exact strings: guarantee sentence byte-identical; no "eight weeks", "week six", "£49.99", SEO grade or Bing; Optimise documents never claim ownership or a right to take the site down; no "guaranteed", "#1", "rank" or "citations guaranteed" anywhere |
| **Existing clients untouched** | Ronnie (now ended), RG, MCL and BS4 rows byte-identical before and after (diff of selected columns); no remeasure audit created |
| **Ended clients stay ended** | The WS-3 ended-client suite re-run on a fresh Ronnie-shaped fixture: no refund, revenue unchanged, no new payment or recurring charge, no re-measure, no monthly update or delivery work, and three `checkout.session.completed` replays leave it ended with its status unchanged |

**Cleanup:** README §4.4. Archive, clear contacts and keep exclusions. Every session signed out (scope=local).

**After the regression:** the first genuine payment is a watched event (see *Payment / client-state assessment*).

---

## After-launch backlog

These can safely wait until after a controlled launch with one or two reps and Paul watching. In order of value:

1. **M-034 / WS-7, salesperson bulk checks.** Required before normal rollout, not before the first reps.
2. **M-042, the post-launch change prompt.** Before the first monthly page is due (about four weeks after the
   first Build launch).
3. **M-032 / M-033, the results sender and verdict.** Before the first new client's day 28 (on or after about
   1 Nov). Paul approves the copy first.
4. **M-022, false "not paid" alerts.** In the first week.
5. **M-013, link placement.** In the first week, if not shipped in R2. (M-015's email send is Gate 3; only its
   Meta payment-link template waits until after launch.)
6. **M-029's question style** (customer questions, not keyword strings). Until then Paul rewrites drafts.
7. **M-041, the Optimise brief.** Paul works from the client page until it exists.
8. **M-044 to M-064, the P2 themes,** by owning workstream:
   - Quick Close friction;
   - Paid Client page contradictions;
   - post-payment comms, including a route-aware payment-confirmation Meta template;
   - email traces;
   - Welcome Pack details;
   - first-reply audit repeats;
   - email-wide suppression;
   - two-tab Next Action;
   - double call log;
   - sign-out lag and 401-vs-503;
   - small leaks;
   - excluded and ended commission;
   - per-rep send cap;
   - simulated-send counting and mirror placeholders;
   - sales UI polish;
   - measurement hygiene;
   - baseline workflow details, including **putting the pointer triggers and one-replay index into migrations**;
   - Website Build polish (D-10 home-town page, Findable credit decision);
   - stale docs;
   - audit branches never merged as-is.

**Not on any list, by Paul's standing decisions:** consent or classification builds for WhatsApp (closed
2026-10-02), any re-generation of existing frozen baselines, and any feature built on the dead products listed in
CLAUDE.md §0.
