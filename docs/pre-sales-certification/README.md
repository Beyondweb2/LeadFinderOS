# Pre-sales launch certification — master plan (coordinator, 04/10/2026)

**Question the certification answers:** can a salesperson safely and efficiently take a business from
Coverage to a closed £99 sale, and does the paid-client workflow then give Paul everything he needs to
deliver Findable?

**This file is the contract for the five specialist sessions.** Read all of it before touching anything.
It holds: the QA protocol, the accounts, the fixture rules and allocations, the external-action safety
table, the spend caps, the canonical journey, the master checklist, severity, session boundaries and the
report format. The coordinator built the safety layer it relies on (§2) and verified it in production.

---

## 0. Verdict — is it safe to start?

**Paul's three decisions are made and applied (§15).** The QA safety layer is live (main `22bf5362`,
9 functions, verified §2.4) and the QA email guard is live (main `b1c18d61`, 10 functions, verified
§2.5). The automatic queue path is PROVEN in production (main `4294aa3d`, §2.6). **Session A may start.**

---

## 1. Accounts

| Account | Login | Role | Use |
|---|---|---|---|
| **Test** | `sales-test@leadfinder.invalid` (id `262c1d64-05ad-42e8-a81b-7d25553aeff3`) | sales | THE salesperson for the whole journey (sessions A, B, E) |
| **test1** | `sales@outlook.com` (id `c6e21a37-e342-4b99-9cf6-0489cb9af775`) | sales | Session E only: the "other salesperson" for isolation tests |
| **Paul (admin)** | `pauljsales455@outlook.com` (id `9d5a7629-…`) — the DATA account, owns every lead | admin | Admin views (Paid Clients, Admin dashboard, notifications). Sign-in is a REAL sign-in of Paul's account — see rule P8 |

Both test accounts are in `metric_exclusions` (kind `user`), so their activity is already out of every
business number, and since 04/10/2026 **out of Meta**: a real business they hold can never be messaged.

**How to sign in without a password (the only way here):** service-role `POST /auth/v1/admin/generate_link`
`{type:"magiclink", email, redirect_to:"https://app.leadfinderos.com"}` → open the returned `action_link`
in the Browser pane (or fetch it with `redirect: manual` and read `access_token` from the `Location`
fragment for API calls). The service-role key is in the vault (`vault.decrypted_secrets` name
`SUPABASE_SERVICE_ROLE_KEY`), read through the Management API (CLAUDE.md §2). Never print a token.
**Always sign out when done:** `POST /auth/v1/logout?scope=local` with the token (scope=local ends only
that session — never `global` on Paul's account).

The Browser pane cannot show screenshots here; `read_page` / `get_page_text` / `javascript_tool` work.
Mobile: `resize_window` preset `mobile`, then reset to `desktop`.

---

## 2. What protects the real world (built and verified 04/10/2026)

### 2.1 What already existed (reused, not rebuilt)
- `metric_exclusions` (kinds `user` / `lead` / `phone` / `email`) + `src/lib/metricExclusions.ts`: keeps
  test activity out of the Admin dashboard, revenue, commission stamping (`test_excluded`, 0%), weekly
  checks, lost reasons, team board, site analytics. `@move37.fun` is an internal email domain.
- The ZZ QA fixture pattern (`docs/qa-fixtures.md`): fixed ids, no contact details, excluded, archived at end.
- Suppression, wrong-number and opt-out guards (fail closed), the town gate, the send window, the daily
  cap, suspension holds, the 72-hour Places cache, spend caps (§9).
- `WHATSAPP_TEST_MODE` exists but is **global** and is **`off`** in production (real sends are live).
  There was no per-lead test mode, no test-mode Stripe, no email sink.

### 2.2 The gap that made it unsafe
Nothing in any WhatsApp sender knew what a test lead was. A QA lead was safe only because it had no
phone. The Test salesperson adding a real business from Coverage copies that business's real mobile onto a
lead it holds — one "queue" press from a real send. Two real businesses with real mobiles were already
sitting on the test accounts (§15). There was no way to exercise the £99 payment without real money.

### 2.3 What was added (the smallest layer that closes it) — `src/lib/qaSafety.ts`
1. **One send rule, three outcomes**, asked by EVERY sender that can reach Meta's `/messages` (queue drip,
   its hook / contact follow-up lanes, the auto-reply drain, Inbox send, media, voice notes, the payment
   confirmation, the free-check text). A sweep test (`scripts/qa-safety.test.ts`) fails if a new sender
   forgets.
   - **SIMULATE** — a QA fixture: its lead id or phone is in `metric_exclusions`, or its number is in
     Ofcom's reserved drama range **07700 900000–900999**. Nothing reaches Meta; the message is recorded
     `status='simulated'`, `test_mode=true`; **the lead moves exactly as a live send moves it** (status,
     contact tag, "You replied") so the workflow is genuinely exercised.
   - **REFUSE** — a lead *held by* a test account, or a send *pressed by* a test account, that is not a
     fixture: i.e. a real business. Inbox / media / voice answer `qa_test_account` with a plain sentence;
     the queue holds it (stays queued, nothing written, like a suspended rep's lead). Refused rather than
     simulated because a simulated row on a real phone would count as message history and block a genuine
     opener to that business forever.
   - **LIVE** — everything else (global test mode still applies).
   - Fails closed: if the exclusion list cannot be read, nothing is sent.
2. **Simulated payment** — `stripe-webhook` accepts an *unsigned* `checkout.session.completed` only with
   the `CRON_SECRET` in `x-qa-simulate-payment`, and only when: `livemode:false`, `evt_qa_` / `pi_qa_` ids,
   **no Stripe customer** (so no subscription and no Stripe call), the lead is a fixture whose phone is
   absent/reserved and whose lead, payer and onboarding emails are all internal. It then runs **the same
   branch a real payment runs**. Helper: `scripts/qa-simulate-payment.ts` (§7).
3. **Paid Clients** hides a fixture once it is archived (it shows while its test runs).
5. **QA email guard (04/10, Paul's decision)** — a client-facing email about a QA lead (fixture, reserved
   number, or held by a test account) may go ONLY to **paul@move37.fun**; anything else is REFUSED with
   "QA only: … Nothing was sent", never redirected. Applied where an address can be TYPED in the journey:
   Paid Clients → Send agreement link (`qa_email_sink_only`), the client's agree page (refused on the
   form, nothing stored), and a backstop in the signed-copy sender. Genuine clients are unchanged. Not
   reachable for a fixture, so left alone: monthly payment emails (need a Stripe customer), the
   free-check result (public form, new lead), the four-week results (held, and fixtures are archived).
4. **Sales performance, admin "everyone" view** leaves out test accounts and fixtures (a person's own
   view, including Test's, is unchanged so A can watch numbers move).

### 2.4 Production verification (04/10/2026, 02:05–02:20 UTC)
- Deploy markers: `x-swm-build: 2026-10-04a-qa`, `x-swv-build: 2026-10-04a-voice-qa`,
  `x-swmd-build: 2026-10-04a-media-qa`; webhook answers `401 Forbidden` to a wrong QA secret (old build
  answered `400 Missing stripe-signature`).
- Signed in as Test: a dry run to **MB & Son** (real business on the Test account) → `qa_test_account`,
  no row written. A text to fixture **ZZ QA12** (07700 900012) → `simulated`, `test_mode=true`, no Meta id.
- Five unsafe payment shapes refused (real lead; not-a-fixture; Stripe customer present; livemode true;
  real payer email) — nothing written.
- The identical simulated £99 event delivered **twice** to ZZ QA12: one ledger row (seller = Test,
  commission `test_excluded` 0%), one `payment_received` History row, one `client_paid` notification,
  one agreement acceptance, one PAID email to paul@findable.live (replay correctly skipped), payment
  confirmation WhatsApp `simulated`, **zero real outbound WhatsApp**, contract stamped (6 payments).
- After archiving: Paid Clients (as admin) no longer lists ZZ QA12; the team performance view mentions
  neither ZZ QA12 nor MB & Son. Both sessions signed out.
- **Not yet exercised in production:** the queue DRIP path (it only runs inside the 07:00–21:30 London
  window; verification ran at 03:10). The auto-reply lane ran clean on the new build. Session A's
  first queued fixture is the first drip proof — see A-precondition in §12.

### 2.5 QA email guard — production verification (04/10/2026 ~02:55 UTC)
On fixture ZZ QA13 as admin: agreement link to `qa-outsider@example.com` → `409 qa_email_sink_only`;
to `paul@findable.live` → refused the same way (a test lead's CLIENT email is only the sink); the agree
page POSTed with an outside email → `422` with the QA sentence, no acceptance stored, no link sent
(`last_sent_to` null). The sink being allowed is proved by `scripts/qa-safety.test.ts`.

### 2.6 Automatic queue proof
**PROVEN 04/10/2026 03:25 UTC** through the real `process-whatsapp-queue` (same headers as the cron).
Fixture ZZ QA13 (`10800000-0000-4000-8000-0000000008a2`, 07700 900013, held by Test) was queued the way
Session A will do it: as Test, `campaign_create` "TEST - QA COORDINATOR QUEUE PROOF" → `campaign_add_leads`
→ `campaign_launch` (→ `sales_queue_opener`, status `queued`, History `bulk_queued`).
- **The QA drill** (`qa_drill_lead_id`, cron/admin only): runs the real drip tick for ONE named lead at any
  hour. It skips only the clock (London window, local window, pacing); pause, cap, suppression, town gate
  and the QA guard still apply, and it REFUSES any lead whose verdict is not SIMULATE. It never moves the
  real pacing clock and never runs the follow-up lanes.
- Drill on a REAL queued lead (Roof Rhino) → `qa_drill_not_sendable`, nothing written.
- Drill on QA13 → `sent:true, simulated:true, qa_simulated:"reserved_test_number", outcome:"sent"`. The lead
  moved `queued` → `initial_contact`, `whatsapp_sent_at` stamped, delivery `simulated`, attempts 1; one
  `whatsapp_sends` row (`test_mode` true, `message_id` null); the opener rendered into the thread
  ("Hi, is this ZZ QA13 coordinator queue proof?…", `simulated`, `test_mode` true, no Meta id) plus the
  known mirror placeholder (§5). A real send writes no History row here either (only `bulk_queued` earlier).
- Drill on QA13 again → `qa_drill_not_sendable` (left the queue; never picked twice). A normal tick →
  `outside_window`.
- **0 Meta message ids** (QA13 and the whole system, that hour). The two real queued leads (Paul's, no
  phone, so never chosen) unchanged: same status, attempts and `updated_at`. `next_send_at` unchanged.
- QA13 then archived (History `archived_set`), phone and email cleared, exclusion kept.
**For sessions:** inside 07:00–21:30 London the normal cron picks up a queued fixture within a minute.
Outside it, the drill may be used on YOUR fixture only (POST `process-whatsapp-queue` with the cron headers
and `{"qa_drill_lead_id":"<your fixture>"}`). One queued fixture at a time across all sessions (§14).

---

## 3. The QA protocol — rules every session follows

- **P1. Never contact a real business.** No WhatsApp, email, call, form or message to anyone outside
  Paul. Every lead you act on is a fixture from YOUR batch (§4), except Coverage reading (P5).
- **P2. Fixtures carry only reserved contact details (the email guard enforces the address server-side):** phone `07700 900xxx` from your range (or none);
  email `paul@move37.fun` (or none). Never a real number, never a real address, never `paul@findable.live`
  on a lead (it is not in the internal-email list, so the payment simulation refuses it).
- **P3. Exclude BEFORE you act.** Insert the `metric_exclusions` lead row before the fixture does anything
  — the commission stamp is never redone, and an unexcluded fixture is a real lead to every guard.
- **P4. Never queue, message, enrich, "Find email", claim or edit a lead that is not your fixture.**
  Reading is fine. This includes Paul's leads and the real businesses on the test accounts.
- **P5. Coverage with real towns is allowed (read).** Bringing real businesses INTO the CRM is limited to
  session A, at most **3 single adds**, never "Add all", never queued/messaged/enriched — §6.
- **P6. No real money, no Stripe test mode, no paying a Checkout link.** A Quick Close link may be
  *created* (it makes an unpaid live Checkout Session — harmless); never open-and-pay it. Payment success
  is `scripts/qa-simulate-payment.ts` only (§7).
- **P7. Audit phase = inspect and write findings.** No product-code fixes, no merges to main, no edge
  deploys, no findable-site deploys, no SQL that changes schema or real rows. Throwaway harnesses go in
  your own worktree and are deleted. If a defect is a live P0 safety risk, STOP and tell Paul.
- **P8. Admin sign-in is a real sign-in of Paul's account.** Use it to READ admin screens and to act on
  YOUR fixtures only. Never send, assign, archive or change a real lead as admin. Sign out (scope=local).
- **P9. Spend only inside §9's caps.** Check `apify_account_usage` / the AI Audit page before any paid run.
- **P10. Clean up even when the test fails** (§4.4), and record the fixture ids in your report.
- **P11. One session = one worktree, one branch** (`C:/Users/paulj/LeadFinderOS-wt/cert-<letter>`,
  branch `cert/<letter>-<topic>` off fresh `origin/main`) if you need files at all. Never touch another
  session's worktree, fixtures or campaign.
- **P12. Report faithfully.** "Not tested" is a valid line. Never claim a screen was SEEN — the Browser
  pane does not display here; say "read via read_page".

---

## 4. Fixtures — naming, ids, ranges, lifecycle

### 4.1 Naming
`ZZ QA-<session letter><n> <what it tests>` — e.g. `ZZ QA-A1 queue opener`, `ZZ QA-B2 paid build`.
Sorts last, unmistakable, and the letter says whose it is.

### 4.2 Allocation (no two sessions share a mutable record)

| Session | Lead ids (fixed, never a real uuid) | Phones | Holder |
|---|---|---|---|
| Coordinator (done) | `10800000-0000-4000-8000-0000000008a1` ZZ QA12 (paid, simulated; onboarding `…08b1`), `…08a2` ZZ QA13 (queue + email proof; campaign "TEST - QA COORDINATOR QUEUE PROOF") | 07700 900012 / 900013 (cleared) | Test — archived |
| A Salesperson | `1a000000-0000-4000-8000-0000000000a1` … `…a9` | 07700 900101–900109 | Test |
| B Close/payment | `1b000000-0000-4000-8000-0000000000b1` … `…b6` | 07700 900201–900206 | Test |
| C Delivery AI | `1c000000-0000-4000-8000-0000000000c1` … `…c3` | none needed (07700 900301–3 if one is) | Test |
| D Site generation | `1d000000-0000-4000-8000-0000000000d1` … `…d3` | none | Test |
| E Security | `1e000000-0000-4000-8000-0000000000e1` … `…e9` | 07700 900501–900509 | Test (e1–e5) / test1 (e6–e9) |

Onboarding rows: let Quick Close create them (preferred — it is the real path). If one must be made by
hand, use the lead id with its last two hex digits replaced by `f<n>` (lead `1b…00b2` → onboarding
`1b…00f2`).

### 4.3 Creating one (template — run through the Management API)
```sql
insert into metric_exclusions (kind, value, reason) values
  ('lead', '<id>', 'QA fixture <DD/MM/YYYY>: pre-sales certification <session> — <what it tests> (07700 900xxx, internal email, never messaged)')
on conflict (kind, value) do nothing;
insert into outreach_leads (id, user_id, assigned_to_user_id, added_by_user_id, business_name,
  search_keyword, search_location, country, phone, email, website, status)
values ('<id>', '9d5a7629-3171-4091-b3a4-43010a1d424d', '262c1d64-05ad-42e8-a81b-7d25553aeff3',
  '262c1d64-05ad-42e8-a81b-7d25553aeff3', 'ZZ QA-<X><n> <what>', '<trade>', '<real UK town>', 'UK',
  '07700 900<nnn>', 'paul@move37.fun', null, 'not_contacted')
on conflict (id) do nothing;
```
`user_id` is always the data account (owner); the holder is `assigned_to_user_id`. A fixture that needs
a website for crawl/Discovery uses `https://findable.live` (ours — nobody external is visited).

### 4.4 Ending a test (always)
1. Archive every fixture through `lead_set_archived` (History records `archived_set`) — via the app, or
   SQL as the actor: `with c as (select set_config('request.jwt.claims','{"sub":"<actor>","role":"authenticated"}',true))
   select public.lead_set_archived('<id>'::uuid, true) from c;`
   Archiving also stops weekly checks and the four-week re-measure from ever firing for it.
2. Clear phone and email. 3. Keep History and exclusion rows. 4. Run the check:
```sql
select l.business_name, l.id, l.is_archived, (l.phone is null and l.email is null) as no_contact,
  exists (select 1 from metric_exclusions e where e.kind='lead' and e.value=l.id::text) as excluded
from outreach_leads l where l.business_name ilike 'ZZ QA%' order by 1;
```

### 4.5 Campaign
A campaign called `test` already exists (Paul's), and campaign names are globally unique. Session A
creates **`TEST - PRE SALES CERTIFICATION`** as the Test salesperson and only fixtures go in it. Session E
may create `TEST - PRE SALES CERTIFICATION E` as test1 for isolation tests. Nobody else creates
campaigns. Do not delete them at the end (campaign stats are per campaign, so they pollute nothing; note `_campaign_counts` does not read `metric_exclusions`).
The Test account already OWNS a campaign `roofers 2` (from Paul's mistaken use of Test, its leads since moved to Paul). Do not launch or edit it: a salesperson's launch only queues leads THEY hold (`campaign_launch`), and the guard refuses any real lead on Test, but it is not a QA campaign.

---

## 5. WhatsApp — how real outbound is prevented, and how to simulate inbound

- Outbound: §2.3. On a fixture every send path simulates; on a real lead held by a test account every
  path refuses. **The guard does not protect Paul's admin account on a real lead** — rule P8.
- **What a simulated send cannot show:** delivery/read ticks (Meta never saw it), Meta template
  rejections, the 24-hour window as Meta enforces it (simulation allows free text outside it, like test
  mode). Template correctness is checkable with `mode:"dry_run"` (builds the exact Meta payload).
- **Known artefact (pre-existing, cosmetic):** the legacy trigger `mirror_whatsapp_send_to_inbox`
  copies each `whatsapp_sends` row into the thread; when the send has no Meta id (simulated or failed)
  that makes a duplicate placeholder row (`[template]` / `[template_name]`). Expect one extra row per
  simulated send. Record it once as a finding if it matters to the rep's view; do not re-report it.
- **Simulating a customer reply (session A, E):** `whatsapp-status` currently accepts unsigned Meta-shaped
  POSTs because `WHATSAPP_APP_SECRET` is not set (shown on the Admin Security panel). Post a standard
  Meta `messages` webhook whose `from` is your fixture's number in E.164 (`447700900101`) and whose
  `id` starts `wamid.QA`. This exercises the real inbound path (owner resolution, STOP detection,
  Interested/triage, auto-reply arming). Any reply the system then sends is simulated by the guard.
  ⚠️ An inbound reply can arm the first-reply rule, which is `audit_only` live — it may start a 3-question
  hook audit on the fixture (small Apify/OpenAI spend, inside §9). If Paul sets the app secret, this
  route closes; then fall back to inserting the inbound row via SQL and say the inbound processor was not
  exercised.

---

## 6. Coverage with real businesses (session A only)

- Search a real town as Test, inspect genuine results — allowed (Places, cached 72 h; ~11p per fresh
  search). At most **5 fresh searches** across the certification.
- Bring **at most 3** real businesses into the CRM with single adds, choosing ones **not already in the
  CRM** (the add returns "already in the CRM" otherwise — that is a valid observation). They are real
  leads held by Test: the guard refuses every WhatsApp to them. **Never** queue, launch a campaign on,
  enrich, "Find email", audit-spend beyond §9, claim, or change their stage.
- Record their ids in `salesperson.md`. **At the end (Paul, 04/10): they are QA material only — never
  moved to Paul as actionable leads.** For each: insert its `metric_exclusions` lead row (reason "QA
  material from Coverage, pre-sales certification"), archive it through `lead_set_archived`, clear its
  phone and email, keep its History. Prove with the §4.4 check. ⚠️ Once excluded, the WhatsApp guard
  treats it as a fixture (simulated, never sent) — if anyone ever revives it as a genuine prospect,
  delete that exclusion row FIRST.
- The QA journey from "assign to campaign" onward uses fixtures, not these businesses.

---

## 7. Payment — how success is simulated (session B; E for replay)

1. Take a fixture through Quick Close as Test up to "payment link" (a real, unpaid Checkout Session is
   created — never pay it). Choose Build or Optimise there: the simulation refuses a row with no route.
   Contact email on the questionnaire: `paul@move37.fun`.
2. `SUPABASE_MGMT_TOKEN_FILE=<file> npx tsx scripts/qa-simulate-payment.ts --lead <id> --check` — the
   local pre-check + a read-back. Then `--times 1` (pay) and later `--times 2` (replay the IDENTICAL
   event; ids derive from the onboarding row, so any later run replays too).
3. The read-back prints the lead, the ledger, History, Quick Close `paid`, notifications, agreement
   acceptances, real vs simulated outbound WhatsApp.

**What the simulation exercises:** everything in the `checkout.session.completed` branch — onboarding
→ paid, sibling retirement, payer email fill, agreement acceptance + PDF email, lead → `payment_received`
+ amount + date, `sold_by` trigger, ledger + commission stamp + notifications, contract stamp, History,
the claim-first PAID email to Paul, Quick Close handoff, payment-confirmation WhatsApp (simulated), paid
baseline start (spends nothing until questions are approved).

**What it cannot exercise (say so in the report):** Stripe's hosted page and consent UI, the delayed
monthly subscription (no customer → the PAID email will say no monthly schedule — EXPECTED here, not a
finding), `invoice.paid` / failed / refund / dispute events, Stripe's own retries and signature. Review
those by reading code only.

**Commission:** a fixture's ledger row is stamped `test_excluded` (0%) by design. Prove seller
attribution (`sold_by_user_id`, Quick Close `link_generated` by Test) from the data and the earning
*rule* from `src/lib/commission.ts` / its tests — not from a real payout.

**Leads from the coordinator's recon for B/E to verify (unverified):** every delivery rewrites
`status='payment_received'` and `payment_date` (a replay after the client moved on may reset them);
two overlapping deliveries could each try a subscription (no Idempotency-Key — moot with no customer);
a Resend refusal + retry may write a second Quick Close `paid` row; a recurring payment on an excluded
lead may still earn commission (only the initial is stamped `test_excluded`).

---

## 8. Email

- Client-facing emails go to the lead / onboarding / payer address → on fixtures that is
  **paul@move37.fun** (the QA sink). Operator emails go to **paul@findable.live**, which forwards to
  paul@move37.fun. Nothing in code was changed; the canonical public address stays paul@findable.live.
- Expect, per simulated payment: the PAID / new-client email (to paul@findable.live, subject names the
  ZZ QA business) and the signed-agreement PDF (to paul@move37.fun + paul@findable.live).
- **The QA email guard (§2.3 item 5) enforces the sink server-side** for the typed-address actions:
  any other address on a QA lead is refused, never sent. Type **paul@move37.fun**. The Welcome Pack is a
  page, never emailed. Outreach email is `mailto:` only.
- The four-week results email is held by `REMEASURE_RESULTS_COPY_APPROVED = false` — do not change it.
- Sessions cannot read the mailbox; prove an email by its Resend record (`client_error_reports`
  `payment_email_sent`, `new_client_email_at`, etc.) and ask Paul to glance at move37 if wording matters.

---

## 9. Spend caps for the whole certification — APPROVED by Paul 04/10/2026

Keep the certification deliberately lean: Ronnie's re-measure still needs Apify budget. **Exceeding
any cap below = STOP and report why to Paul before spending more.**

| Spend | Cap | Note |
|---|---|---|
| Google Places (Coverage / Find Leads searches) | 5 fresh searches | repeat within 72 h is free |
| Hook audits (3 q) | 4 | A: up to 2 on fixtures/its 3 Coverage adds; E: none |
| Niche check | 1 | A only |
| Discovery crawl | 2 | C only, website `https://findable.live` |
| Baseline / re-measure runs (ChatGPT + Gemini via Apify) | 1 full baseline | C only, on ZZ QA-C1 |
| OpenAI drafts (voice-note script, warm reply, question generation, page generator) | normal use on fixtures | |
| **Apify total** | **≤ $3** | ⚠️ $27.35 of the $40 monthly cap was used by 30/09 (cycle ends 16/10); at 100 % every audit stops, and Ronnie's re-measure is due 13/10. Check usage first; stop at 80 %. |

Anything beyond: stop and report to Paul. The caps are TOTALS across all five sessions — record every
paid run (what, which fixture, cost from `enrichment_usage` / `apify_account_usage`) in your report.

---

## 10. External-action safety table

| Action | Class | How |
|---|---|---|
| WhatsApp send to a fixture (queue, Inbox, media, voice, payment confirmation) | **SAFE ONLY WITH QA FIXTURE** | simulated by the guard |
| WhatsApp send to any real business | **DO NOT TRIGGER** | refused for test accounts; protocol for admin |
| WhatsApp `test_send` (Paul's own test number) | **DO NOT TRIGGER** | admin-only, costs a real message |
| Inbound customer reply | **SIMULATE** | unsigned Meta-shaped POST from a fixture number (§5) |
| Email to a fixture / operator email to Paul | **SAFE ONLY WITH QA FIXTURE** | paul@move37.fun sink (§8) |
| Email to any real business | **DO NOT TRIGGER** | |
| Stripe Checkout Session creation (Quick Close link) | **SAFE ONLY WITH QA FIXTURE** | unpaid live session; never pay |
| Stripe payment success | **SIMULATE** | `scripts/qa-simulate-payment.ts` |
| Stripe subscription / invoices / refunds / disputes / portal | **DO NOT TRIGGER** | code review only |
| Coverage / Find Leads search (Google Places, Geocoding) | **SAFE TO USE LIVE** | read-only, cap §9 |
| Adding a real business to the CRM | **SAFE ONLY WITH QA FIXTURE rules** | A only, ≤3, §6 |
| Companies House lookups | **SAFE TO USE LIVE** | free, read-only |
| Hook audit / niche check / Discovery / baseline (OpenAI + Apify ChatGPT/Gemini) | **SAFE ONLY WITH QA FIXTURE** | within §9 |
| Enrichment, "Find email", social discovery on real businesses | **DO NOT TRIGGER** | writes contact data to a real record; paid |
| Website fetches (crawl-check, agency check, prospect preview, Cloudflare screenshots) | **SAFE ONLY WITH QA FIXTURE** | point at findable.live |
| Website build: GitHub repo creation, Cloudflare Pages preview deploy (the Build Execution prompt) | **DO NOT TRIGGER** | D reviews prompts, configs and existing previews; a local build in scratch with no push/deploy is allowed |
| Production site publish, custom domain, DNS | **DO NOT TRIGGER** | |
| Google Business Profile / review replies | **DO NOT TRIGGER** | no integration; manual by Paul |
| Search Console sync | **SAFE TO USE LIVE** | read-only, currently "Not connected" |
| Edge-function deploy, SPA push, findable-site deploy, schema SQL | **DO NOT TRIGGER** (audit phase) | fixes come after consolidation |
| Changing secrets, crons, `protection_settings`, Paul's account | **DO NOT TRIGGER** | |
| Admin sign-in as Paul | **SAFE ONLY WITH QA FIXTURE** | read + fixture actions only, sign out (P8) |
| Security tests that cause denials | **SAFE TO USE LIVE** | ≥10 denials in 10 min emails Paul ONE warning a day; no auto-suspension exists |

Automatic processes and fixtures: weekly visibility checks skip excluded and archived leads; the
four-week re-measure skips archived leads (and is 28 days out); the auto-reply rule is `audit_only`; the
audit-complete template is empty. Nothing auto-sends to a fixture except through the guard.

---

## 11. The canonical journey (all sessions refer to these stage numbers)

| # | Stage | Owner | Fixture / data | Simulated? |
|---|---|---|---|---|
| J1 | Test salesperson login (desktop + mobile) | A (E: auth) | Test | — |
| J2 | Coverage: open, search a real town, read results, niche verdict | A | real town | live read |
| J3 | Bring leads into CRM (≤3 real, plus fixtures A1–A6) | A | §6 | — |
| J4 | Create campaign `TEST - PRE SALES CERTIFICATION`, assign fixtures | A | A1–A4 | — |
| J5 | Queue ONE fixture for WhatsApp; inspect the queue panel | A | A1 (07700 900101) | send simulated |
| J6 | Remove / requeue | A | A1 | — |
| J7 | Outreach list: state, filters, star, pipeline pill | A | A1–A4 | — |
| J8 | Inbox: thread, reply arrives, Interested / reply state | A | A1 (inbound simulated) | inbound simulated |
| J9 | Next Action: set, due, complete | A | A2 | — |
| J10 | Audit / findings for the conversation | A | A2 or a Coverage add | live, capped |
| J11 | Call workflow (outcomes, call booked, scripts) | A | A3 | — |
| J12 | Voice-note workflow (script, record/send) | A | A3 | send simulated |
| J13 | Quick Close: questions, Build/Optimise choice | A (UX) / B (data) | B1, B2 | — |
| J14 | Payment link | B | B1 (Optimise), B2 (Build) | real unpaid session |
| J15 | Payment success | B | B1, B2 | **simulated** |
| J16 | Salesperson sees the win; lead leaves their active work where expected | B (A: UX) | B1 | — |
| J17 | Admin notification + PAID email | B | B1 | email to Paul |
| J18 | Paid Clients: exactly one client, seller retained, commission rule | B | B1 | — |
| J19 | Handoff / setup: known info prefilled, missing info identified | B | B1, B3 (sparse) | — |
| J20 | Agreement state (checkout acceptance, agree page) | B | B1 | — |
| J21 | Discovery | C | C1 (website findable.live) | live, capped |
| J22 | Baseline question generation, 20-question selection, approval | C | C1 | — |
| J23 | Baseline (ChatGPT + Gemini, citations, competitors), results | C | C1 | live, 1 run |
| J24 | Build / Optimise route consequences | B → D | B2 / D1 | — |
| J25 | Website build (prompt, config, quality, SEO/GEO, schema, mobile) | D | D1 + existing previews | no deploy |
| J26 | Welcome Pack | B | B1 | — |
| J27 | Delivery lifecycle (stages, next step, submit for delivery) | B / C | B1, C1 | — |
| J28 | Re-measurement readiness (due date, replay set, results hold) | C | C1 | not fired |

**Session E** runs across all stages: permissions (Test vs test1 vs admin), campaign and queue
isolation, admin boundaries, duplicate clicks, races, webhook replay (`--times 2/3` on E1), stale UI,
error recovery, idempotency, data integrity.

---

## 12. Master certification checklist

For **every stage J1–J28** the owning session answers the twelve questions and records each as
✅ / ⚠️ finding / ❌ finding / — not applicable / ⏸ not tested (say why):

1. Can a new salesperson find what they need?
2. Is it obvious what to do next?
3. Do they have enough useful information?
4. Is there unnecessary information?
5. Does the system ask for something it already knows?
6. Can they accidentally make a harmful mistake?
7. Is the wording natural?
8. Does state update everywhere immediately (list, thread, dashboards, admin)?
9. Does admin receive what it needs afterwards?
10. Are permissions correct?
11. Does it work on desktop AND mobile?
12. Does failure give a useful recovery path?

Session-specific must-proves (in addition):
- **A:** the drip path is already proven (§2.6); A's job at J5–J6 is the salesperson's experience of
  queueing, the queue panel, remove/requeue — and confirming the same `simulated` result on A1.
- **B:** payment → seller retained → commission rule → lead leaves active workflow → exactly one Paid
  Client → admin notification → handoff exists → known info prefilled → missing info identified →
  agreement correct → Welcome Pack continues; and the replay proves no second client, commission,
  revenue, notification or handoff.
- **C:** every AI stage on C1 with costs read from `enrichment_usage`; real clients' deliveries are
  READ ONLY (RG refunded, Ronnie due 13/10 — never touch their baselines or replays).
- **D:** output quality, truthfulness (no invented figures/credentials), SEO/GEO/entity/schema, mobile —
  against `docs/website-build-quality-standard.md`; no repo/deploy.
- **E:** a second salesperson (test1) cannot see, send to, assign, or pay-link Test's fixtures or
  campaign, and vice versa; admin-only screens refuse sales; the webhook replay is idempotent; the QA
  guard itself cannot be bypassed (try: a fixture id with a real phone, a real lead with a drama phone,
  a test account pressing send on an unassigned real lead).

---

## 13. Severity

- **P0 — cannot launch / unsafe:** data leak, real-send risk, wrong permissions, payment or client
  corruption, duplicate client/commission/payment, destructive bug, core salesperson flow blocked.
- **P1 — fix before ordinary salesperson use:** confusing closing flow, missing handoff information,
  important state not updating, poor scripts/questions, an essential action too hard, client output not
  good enough.
- **P2 — worthwhile, not launch-blocking:** an extra click, cosmetic, optional convenience, minor wording.

Do not inflate. A P0 needs a concrete failure scenario; "could in theory" is P1 at most unless it
touches money, sending or permissions.

---

## 14. Session boundaries and the report format

| Session | Report | Owns stages | Must not |
|---|---|---|---|
| A Salesperson journey / UX / sales quality | `salesperson.md` | J1–J13 (UX of J13–J16) | pay, run baselines, build sites |
| B Close / payment / admin handoff | `close-payment.md` | J13–J20, J24, J26, J27 | spend on AI beyond Quick Close needs |
| C AI delivery | `delivery-ai.md` | J21–J23, J27, J28 | touch real clients' measurements |
| D Website generation | `site-generation.md` | J24–J25 | create repos, deploy, touch DNS |
| E Security / reliability | `security-reliability.md` | cross-cutting | fix anything; attack real records |

Each report: a header (session, date, fixtures used, accounts, spend), then a findings table:

`| ID | Severity | Stage | Finding (one sentence) | Evidence (file:line, query, response) | Failure scenario | Suggested fix (not applied) |`

then the twelve-question matrix for each owned stage, then "Not tested and why", then the cleanup check
output (§4.4). IDs: `A-01`, `B-01`, … Findings are only reported, never fixed, in this phase.

Parallel running: A, C, D can start together. B can start together with A (it creates its own fixtures
and does its own Quick Close). E starts with the others but runs its webhook-replay and queue tests only
on E fixtures, and must not queue while A's J5 is in flight (the drip is global: one send per tick,
and every simulated attempt also sets the shared pacing clock) — coordinate by checking
`select business_name from outreach_leads where status='queued'` first; at most ONE fixture may be
queued at any moment across all sessions.

---

## 15. Paul's decisions (04/10/2026) and their state

1. **Genuine businesses off the test accounts — DONE.** `assign_lead` to Paul (one History line each,
   nothing else rewritten): MB & Son Recovery (active, never messaged), Sunnybank Plumbing (active, its
   real conversation and "price given" stage kept), JB7 Plumbing (kept archived). test1 now holds no
   leads; Test holds only excluded fixtures. Test still OWNS the old `roofers 2` campaign shell, but its
   82 leads are Paul's: as Test it reads "0 leads" and none can be read or queued.
2. **Spend caps APPROVED** (§9), Apify ≤ $3 total. Over a cap → stop and report.
3. **Coverage adds are QA material** — excluded, archived, contact cleared at the end (§6).
4. **QA email guard** — added and verified (§2.3 item 5, §2.5).
5. **Automatic queue path** — §2.6.

The ZZ QA12 smoke test (04/10 ~02:14 UTC) produced a PAID email, a signed-agreement email and a
`client_paid` notification — tests, no action.

Optional: setting `WHATSAPP_APP_SECRET` closes the unsigned inbound webhook (good for security) but
removes §5's inbound simulation — if you set it, do it after session A finishes J8.
