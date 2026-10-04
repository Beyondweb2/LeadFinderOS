# Security & Reliability Certification — Session E

- **Session / date (UK):** E (security, permissions, reliability, concurrency), Sunday 4 October 2026, 09:50–10:40 UK (08:50–09:40 UTC).
- **Release audited:** `main` at `c0e85078` (the same release as A–D). Worktree `C:/Users/paulj/LeadFinderOS-wt/cert-e`, branch `cert/e-security-reliability`. No product code changed, nothing deployed, nothing merged.
- **Accounts:** Test (`sales-test@leadfinder.invalid`, sales) = salesperson A. test1 (`sales@outlook.com`, sales) = salesperson B. **Paul's account was never signed in.** Two admin actions on my own fixtures (reassigning E5; archiving at the end) were run in SQL as Paul's identity, using README §4.4's pattern.
- **Fixtures (all excluded before use, reserved numbers, `paul@move37.fun` only, all archived at the end):**

| Fixture | Lead id | Holder | What it tested |
|---|---|---|---|
| ZZ QA-E1 payment replay | `1e000000-0000-4000-8000-0000000000e1` | Test | Quick Close race, simulated payment, replay after in_delivery / refunded / ended |
| ZZ QA-E2 campaign A queue | `…00e2` | Test | double queue; found the email-suppression side effect (E-10) |
| ZZ QA-E3 next action race | `…00e3` | Test | two-tab Next Action, double call log, dry-run send guards |
| ZZ QA-E4 inbound propagation | `…00e4` | Test | unsigned inbound from a never-messaged number |
| ZZ QA-E5 reassignment | `…00e5` | Test → test1 | admin reassignment |
| ZZ QA-E6 campaign B queue | `…00e6` | test1 | campaign launch, real cron drip (simulated), inbound reply, propagation |
| ZZ QA-E7 other rep target | `…00e7` | test1 | cross-rep IDOR target |
| ZZ QA-E8 quick close race | `…00e8` | test1 | cross-rep target |
| ZZ QA-E9 duplicate business | `…00e9` | test1 | duplicate add by phone |
| ZZ QA-E race dup ×3 | `01f50f5b-…`, `7871d808-…`, `a331397c-…` | Test / test1 | the winners of three concurrent-add races (excluded and archived afterwards) |

- **Campaign:** `Test - Pre Sales Certification E` (`520b3dc2-0380-44f7-9b5b-b3af34b97eeb`), owned by test1, the winner of the name race. Kept (README §4.5).
- **Spend:** none. 0 Places searches, 0 hook audits, 0 Apify, 0 OpenAI. One unpaid live Stripe Checkout Session was created by E1's Quick Close; it was never opened and expires 24 h after creation. Emails: one simulated payment produced the PAID email (to paul@findable.live) and the agreement PDF (to paul@move37.fun). The replays were skipped (`payment_email_skipped`).
- **Method:** live API and database calls as the two salespeople (PostgREST, RPCs, edge functions), read-only SQL for policies, grants and function sources, and four read-only code-review agents (edge-function auth map, secret scan, bulk audit and spend, webhooks and payments). Every agent claim I rate P1 or above was re-checked against the code or exercised live, and each row says which. **No screens were viewed.**
- **Safety note:** one step was dropped during the session: a planned harness that would have run write attempts against Paul's *real* records inside a rolled-back block. All write attempts were then aimed only at my own fixtures; real records were only **read**. Write protection on real records is established from the database function sources (every lead function calls `_require_work`), not from live attempts.

---

## Executive verdict

# NOT READY — one fix away from READY WITH FIXES on the security side

**Salesperson isolation is genuinely secure at the server level.** Every cross-rep attempt was refused by the database or the function, including direct table writes. That covers reading, editing, starring, archiving, queueing, unqueueing, claiming, call logging, renaming, launching, stopping and deleting another rep's lead or campaign, plus every admin endpoint. Refusals return `not_found` / `not_your_lead` with no data. Reassignment revokes access instantly. Duplicate adds and same-name campaigns are refused under real concurrency. The QA safety layer cannot be abused by a salesperson.

**What stops launch:**
1. **E-01 (P0): anyone on the internet can post fake customer WhatsApp replies into the system.** I proved it live: an unsigned message, sent with no credentials, was accepted and stored. The fix is one secret Paul sets, plus making the webhook refuse unsigned posts.
2. **A-02 (Session A's P0, traced in full here):** every salesperson can read, and send, all 15 of Paul's saved texts.

**What must be fixed before reps rely on the new call-first workflow (P1):**
- Reps have **no bulk audit or crawl at all** today. Simply switching it on would be unsafe (E-04).
- All audit spend shares **one $12/day budget**, so a busy sales day can fail a paying client's baseline or re-measure (E-05).
- A prospect who **WhatsApps after a phone call** (never messaged by the system) lands unmatched, with no notification (E-07).
- A late repeat of a payment event **moves a refunded or delivered client back to "payment received"** (E-02).
- Two simultaneous payment deliveries can create **two monthly subscriptions** (E-03, code).
- Two crawl-check holes let a rep read or overwrite another lead's crawl data (E-06, code).
- The live **service-role key is stored as the *name* of a vault secret** (E-08).

**Counts:** 1 P0 · 7 P1 · 15 P2 (not counting A–D findings re-confirmed here).

---

## Threat / reliability model

| Actor / event | What they can reach | Main risks examined |
|---|---|---|
| Internet (no login) | public functions (report, onboarding, checkout, agree page, enquiry, analytics) and the three webhooks | forged replies or payments, spend, enumeration |
| Salesperson (sales role) | the `sales_leads` view, ~90 RPCs, ~35 functions | IDOR across reps and Paul, admin data, spend, QA-layer abuse |
| Former salesperson | a token that is still valid | revocation |
| Two reps at once | the same business, campaign name, lead or queue | duplicates, lost updates |
| Stripe / Meta | retries, late or duplicate events | idempotency, state going backwards |
| Provider failure | Apify, OpenAI, the auth service | stuck jobs, silent failure, misleading 401s |
| Several reps calling all day | audits, Inbox, Next Actions, Quick Close | cost caps, lost replies, stale screens |

---

## P0 — Launch blockers

### E-01 — The WhatsApp webhook accepts unsigned posts from anyone (live-proved)

- **Where:** `supabase/functions/whatsapp-status/index.ts:57-66`. The function checks Meta's signature only if `WHATSAPP_APP_SECRET` is set, and otherwise lets the request through with a warning. The secret is not set live (README §5 relies on that). `config.toml` has `verify_jwt=false` for it.
- **Proof (live, fixture only):** from this machine, with no Authorization header and no signature, I posted one Meta-shaped `messages` event from E4's reserved number → `200 {"ok":true,"handled":1}`, and the message was stored as an inbound row. Posting the identical message id again → `handled:0`. Message ids are de-duplicated, but the sender chooses them, so that does not stop forgeries. A second forged reply from E6, a lead that had been messaged, set it to **`replied`**, raised test1's unread count and a "New WhatsApp reply" notification, and **armed the paid first-reply audit** (`whatsapp_auto_replies` row, `audit_status` pending).
- **What an attacker can do with only a business's public phone number** (code: `_shared/whatsapp-inbound.ts:243-276`, `first-reply-audit.ts:96-133`):
  - put any text into a rep's Inbox as if the prospect wrote it ("send the link to this other number…");
  - move contacted leads to `replied`;
  - make a contacted prospect's first reply "STOP" or "not interested". That suppresses them on every channel and uses up their one-time automation slot, so the genuine reply later arms nothing;
  - start a paid hook audit per contacted lead (up to 5 attempts each). In `audit + send` mode this also triggers a **real** WhatsApp to the real business.
- **Why P0:** forged customer replies and state changes from an unauthenticated caller, on the channel the sales team reads to decide who to call.
- **Not exploited further.** One forged message per fixture, both reserved numbers.
- **Suggested fix (not applied):**
  - Paul sets `WHATSAPP_APP_SECRET` (Meta app secret) in the function secrets.
  - Change lines 64-66 to refuse with 401 when the secret is missing, not just warn.
  - After that, QA inbound simulation must insert the row by SQL, or use a helper that signs with the real secret.
  - The Admin Security panel already flags the missing secret.

---

## P1 — Fix before rollout

| ID | Stage | Finding | Evidence | Failure scenario | Suggested fix (not applied) |
|---|---|---|---|---|---|
| **E-02** | J15, J27 | **A repeated payment event moves a client backwards, including a REFUNDED client back to `payment_received`.** Extends B-15: the refunded case touches revenue. | **Live on E1:** `in_delivery` → replay → `payment_received`, `payment_date` 20 Sep → 4 Oct. **`refunded` → replay → `payment_received`**, refund fields kept. `completed` + `service_terminated_at` → replay → `payment_received`; the end stamp survived. In every case no second ledger row, History line, notification, agreement or email. Code: `stripe-webhook/index.ts:1210-1220` (unconditional status / amount / date), `:907-912` (onboarding back to `paid`). | Stripe retries a `checkout.session.completed` for up to 3 days if our endpoint timed out the first time, and Paul can resend events from the Stripe dashboard. A refunded client then counts as revenue again (`refunded` is the one status that removes a lead from revenue). A delivered client drops back a stage. A changed `payment_date` shifts anything dated from it. | Write status, amount and date only when the lead is not already paid (`amount_paid is null`). Never move status backwards. Same for the onboarding row. |
| **E-03** | J15 | **Two simultaneous deliveries of one checkout event can create two monthly subscriptions** (code only; the simulation has no Stripe customer). | `stripe-webhook:1266-1276` reads `stripe_subscription_id`. `_shared/delayed-subscription.ts:131,161` checks it, then creates the subscription with **no Idempotency-Key**. The PAID email and ledger have claims; the subscription does not. | A slow first delivery (PDF, emails, Stripe calls) passes Stripe's timeout, and Stripe's retry arrives while the first is still running. The client is billed twice a month. | Pass `Idempotency-Key: sub-<checkout session id>` on the Stripe create. Claim the subscription with a conditional update before creating it. |
| **E-04** | J10 (new workflow) | **The call-first workflow's core step does not exist for salespeople, and switching it on as built would be unsafe.** | **Live:** `bulk-jobs create` as Test → `403 admin_only`. UI gate `perms.bulkAudits` is admin-only (`access.ts:145`). Reps have only the one-lead hook audit and a one-lead crawl. If opened by flipping the permission, `bulk-jobs`: <br>• checks `outreach_leads.user_id = caller` (`:691-698`), which is the data account → **a rep would reach the whole book**; <br>• does not refuse archived leads or clients (`:224-251`); <br>• runs items through the internal path, which **skips the per-rep guard and the per-lead daily limit** (`:289`, `create-ai-audit:744`); <br>• counts a 100-lead job as one guard row (`:701`). | Paul ticks "bulk audits for sales" to enable the new workflow, and one rep audits 100 of Paul's leads at once on the shared budget (E-05). | Build a sales bulk path: assignment check per lead (`can_work_lead`), refuse archived and clients, guard units per lead, a per-rep daily cap, and reuse of a hook audit under N days old. Until then, keep bulk admin-only. |
| **E-05** | J10, J23, J28 | **All audit spend shares one $12/day budget: reps, bulk jobs, paid baselines and re-measures.** | `process-ai-audit-queue/index.ts:98` `DAILY_CAP_USD = 12.0` "per-USER"; `:530-533` keys it on the audit's `userId`. Every audit, rep hooks included, is filed under the data account (`create-ai-audit:423`). Baselines and re-measures are not exempt. Per-rep guard: 80 hooks/day each (seed). | Five reps × 80 hooks ≈ 1,200 questions ≈ $13–16, so the cap trips mid-afternoon. A paying client's baseline or **day-28 re-measure** (Ronnie, 13 Oct) then fails questions with `daily_cap`. The rep is told the audit was accepted, and it ends `capped` (C-11 makes that invisible). | Give guarantee measurements (baseline / remeasure) their own budget or an exemption. Cap reps per person. Show "daily audit budget reached" at request time. |
| **E-06** | J10 | **crawl-check: a rep can read another lead's crawl result and write their own crawl into any audit run** (code-confirmed, not exercised). | `crawl-check/index.ts:219-232` checks only the rep's own `lead_id`. With `action:"status"` the query then prefers the caller's **`job_id`** (`:240`) and returns its result (`include_result`). With any **`run_id`** (`:261`, never refused for sales) the rep's crawl is merged into that run's `results.crawl_check` (`:624-630`), for example a paying client's baseline report. | A rep, or a script using a rep's login, overwrites the website section of a client's live report with another site's findings. It needs a run id or job id (UUIDs reps do not normally see), so it is not trivial; the impact is report integrity. | For sales, refuse `run_id` and `job_id`, or require that the job or run belongs to the same lead. |
| **E-07** | J8 (call-first) | **A WhatsApp from a lead we never messaged from the system is not linked to the lead: no unread count, no notification, no status change.** | **Live:** E4's inbound stored with `lead_id=null`; Test could read it by phone (RLS), but unread `[]` and no notification. Cause: `whatsapp-inbound.ts:149-154` matches by `ilike '%<last 9 digits>%'` on the stored phone, and stored phones contain spaces (`07700 900504`), so the substring never matches. **5,482 of 5,485 leads with a phone cannot be matched this way.** One real lead's reply went unmatched on 20 Sep. Also `:157` groups by `user_id`, which is always the data account, so the "ambiguous owner" check never fires. | In the call-first workflow the rep phones first, and the prospect then WhatsApps the business number ("send me the link"). Nobody is told; the lead stays "not contacted"; the rep forgets. | Match on `phone_key(phone)` (already used elsewhere). Assign to `assigned_to_user_id`, not `user_id`. Notify the holder. |
| **E-08** | Secrets | **The live service-role key (the master database key) is stored as the NAME of a vault secret; the anon key likewise.** Confirms A-31. | Vault entries `d896f9c2-…` (name = a 219-char JWT, `role=service_role`, byte-identical to the vault's `SUPABASE_SERVICE_ROLE_KEY` value) and `6c9a19be-…` (`role=anon`). Their *values* are short placeholders. Names are not encrypted. Readable only by `postgres` / `service_role` (checked: `anon` / `authenticated` have no vault usage, and no client-callable function reads the vault). Not in git history, the bundle, cron commands or `pg_stat_statements`. | Anyone listing vault secret names (dashboard, a backup, an AI session; Session A did) sees the master key in plain text. It has already been written into at least one session transcript on disk. | Delete or rename the two entries. **Rotation: recommended as a precaution at the next planned key change, not an emergency.** There is no evidence it left Paul's machine or Supabase. Rotating the legacy JWT secret also rotates the anon key in the bundle and findable-site, so plan it. |

---

## P2 — Improvements

| ID | Finding | Evidence | Suggested fix |
|---|---|---|---|
| E-09 | **Signing out does not end database access for up to an hour.** A logged-out token still works against PostgREST, the RPCs and the functions that verify tokens locally (`getClaims`: crawl-check, search-leads, google-place-details, check-website, extract-*, enrich-lead). The refresh token dies, and functions on the shared helper refuse it. | Live: after `logout` → `sales_leads` 200, `my_role` 200, `crawl-check` 200; `sales-performance` 401. | Write down the off-boarding rule: **remove the rep's role** (`user_roles`) or suspend them. That is immediate everywhere, because `my_role()` is read per call. Move the `getClaims` functions to `resolveActor`. |
| E-10 | **"Not interested" suppresses by EMAIL across every lead sharing that address, and the queue then flips them to `opted_out` with no History row.** | Live: Session A's A2 "Not interested" (04:17) wrote a suppression on `paul@move37.fun`. E2 (same email) was queued → `opted_out` / `suppressed`, 0 History rows (`process-whatsapp-queue:1863-1876`). Real data: **13 email groups, 37 active leads** share an address (largest 7). QA side effect: every fixture using the README's sink email will be suppressed on queue from now on. | Suppress by email only when the email is the identifier the person opted out on. Write a History row when the queue suppresses. README: give fixtures no email unless the test needs one. |
| E-11 | **Archiving does not cancel an armed first-reply audit.** | Live: E6 armed, then archived; the auto-reply row kept retrying (`retry_pending`, 3 attempts so far), stopped only by the town gate. On a verified-town lead it would spend. | Check `is_archived` (and suppression) in the audit-arming drain, not only before the send. |
| E-12 | **A double-submitted call outcome creates two call records** (20 ms apart). | Live E3: two `call_outcome` rows. | Ignore an identical outcome from the same actor within ~10 s. |
| E-13 | **Two tabs: last writer wins, with no stale-screen check.** A stale tab can silently replace a booked meeting. | Live E3: both changes logged in History (good); final state = the later write; `call_booked_at` cleared consistently. `lead_set_follow_up` locks the row but takes no "expected previous value". | Send the previous value. If it differs, ask "This changed since you opened it — replace?" |
| E-14 | **Small metadata leaks:** <br>• `lead_first_contact_at` / `lead_logged_contact_at` answer for any lead id, including Paul's and clients'; <br>• `bump_audit_open` is callable anonymously, so anyone with an audit UUID can inflate "report opened"; <br>• `quick-close load` answers 404 vs 403, so a rep can tell whether a lead id exists; <br>• reps can read `lead_id`s of 93 published mockup rows. | Live reads as Test. | Add `_require_work` to the two contact-time functions. Restrict `bump_audit_open` to the report function. Answer 403 for both cases. |
| E-15 | **21 functions return 401 when the auth service is down** (not 503), which the SPA treats as "signed out". The shared helper is correct. | Agent map: functions not on `resolveActor`/`requireAdmin` (admin-api-usage, crawl-check, search-leads, process-ai-audit-queue, mockup, …). | Move them onto `resolveOperator` / `resolveActor`. |
| E-16 | **Monthly payments on test accounts or excluded leads earn 20% commission and a "commission earned" alert.** Only the initial payment is stamped `test_excluded`. | Code: `commission.ts:269-277`, `_shared/earnings.ts:117`, `payment-ledger.ts:109-118`; migration `20261003100000:62-67`. | Apply the same exclusion to recurring payments. |
| E-17 | **`invoice.paid` on an ended client** sets `subscription_status='active'` and earns commission, if the Stripe subscription was not cancelled. | Code: `stripe-webhook:1500-1503`; `commission.ts` never reads `service_terminated_at`. | Ignore or flag payments after `service_terminated_at`, and alert Paul. |
| E-18 | **The public onboarding `submit` can overwrite a prospect's phone, website and trade** with only the lead UUID from their link. | Code: `findable-onboarding/index.ts:1144-1220`. | Fill blanks only; send changes to Paul as a suggestion. |
| E-19 | **Public-endpoint hardening:** <br>• site-enquiry is gated only by the `Origin` header; <br>• request-call and the agree page check-then-insert, so a double tap can send two emails; <br>• `invoice.payment_failed` / `subscription.deleted` emails are re-sent on a repeated event; <br>• resend-webhook does not dedupe `svix-id`; <br>• report short codes (6 chars) have no rate limit. | Code (agent, file:line in its map). | Unique keys / claims; per-IP limits. |
| E-20 | **Per-rep spend is not attributable.** Real cost rows sit under the data account; per rep there are only guard estimates. | `runner.ts:108-125`. | Stamp `actor_user_id` on `enrichment_usage`. |
| E-21 | **Inbox sends have no per-rep daily cap.** Media and voice likewise; only suspension applies. Sends are limited to the rep's own leads, and cold templates to fresh numbers. | `send-whatsapp-message:44,677`; `protection_settings` has no `whatsapp_send` limit. | Add a per-rep daily send limit. |
| E-22 | **`cert/b-close-payment` (pushed) contains five live Checkout Session ids.** They are not credentials, but they identify payment sessions. | Secret-scan agent. | Trim them before that branch merges. |
| E-23 | **Stale docs that will mislead the next session.** | CLAUDE.md §4/§8: `client_error_reports` **has** a `message` column now (live). README §2.3 says fixtures use `paul@move37.fun`, which is now suppressed (E-10). | Correct both. |

**Re-confirmed, not re-counted:** A-02 (scope below), A-03, A-11, A-31 (= E-08), B-15 (= part of E-02), C-11 (invisible give-up, relevant to E-05), C-14 (Apify monthly cap), the README §5 mirror placeholder.

---

## Authentication

| Case | Edge functions (gateway + shared helper) | Database API (PostgREST / RPC) |
|---|---|---|
| Valid session | 200 | 200 |
| No token | 401 `UNAUTHORIZED_NO_AUTH_HEADER` | 401 `permission denied` |
| Garbage / malformed 3-part | 401 `INVALID_JWT_FORMAT` | 401 `PGRST301` |
| Forged payload (sub changed to Paul) | 401 `ASYMMETRIC_JWT` | 401 |
| Expired claim (re-signed impossible) | 401 | 401 |
| `alg:none` | 401 `UNSUPPORTED_TOKEN_ALGORITHM` | 401 |
| Anon key as user token | 401 "Your session was not accepted. Sign in again." | 401 |
| **Signed-out (revoked) session** | **401** on helper-based functions; **200** on `getClaims` functions (E-09) | **200 until expiry (≤1 h)** (E-09) |
| Refresh token after sign-out | 400 `refresh_token_not_found` | — |
| Role removed mid-session | not run live; `my_role()` is read per call, so DB and helper functions refuse at once | same |
| Auth-service outage | shared helper → **503 `auth_unavailable`** (distinguishable); 21 other functions → 401 (E-15) | n/a |

The shared 401 fix (`_shared/operator-auth.ts`) behaves correctly. Its gap is coverage: 21 functions don't use it. No error path returned data after an auth failure.

## Role / permission matrix (server-tested)

| Object | Admin | Salesperson (own) | Other salesperson | Evidence |
|---|---|---|---|---|
| Leads | all | assigned, not a client | **refused** (`not_your_lead`, empty view) | live E1↔E7 |
| Campaigns | all | created by them | **`not_found`** for read / rename / launch / stop / delete / add / leads | live A↔B and Paul's |
| Queue | all | own leads only | unqueue `not_yours`, queue `skipped not_yours`, queue panel `forbidden` | live |
| Messages | all | own leads plus their phones | empty | live (E4: Test yes, test1 no) |
| History / notes | all | own leads (notes travel with the lead to the new holder) | empty | live |
| Audits / runs | all | hook audits on own leads | empty | live |
| Quick Close | all | own lead; seller after payment | `not_your_lead` 403 | live |
| Paid Clients / hub / baseline / agreement / monthly update / Welcome Pack admin | yes | **`admin_only`** | `admin_only` | live |
| Admin overview, security, users, submissions, Apify usage, team board | yes | **`admin_only`** | — | live |
| Commission | all | own summary only (a `user_id` param is ignored) | not reachable | live |
| `payment_ledger`, `commission_payouts`, agreements, `quick_close_events`, `protection_settings` tables | service only | **403 no grant** | — | live |
| `metric_exclusions`, `security_events`, `enrichment_usage`, `api_usage_log` | service only | 0 rows / insert refused | — | live |
| `user_roles` | own row read | own row; writes denied | — | policies |
| Templates | all | **all 15 of Paul's (A-02)** | same | live |

## IDOR results (ids changed by hand)

| Object | Request as Test | Result |
|---|---|---|
| test1's lead E7: follow-up, note, stage, star, call, archive | RPC | 403 `not_your_lead` ×6 |
| E7 claim / queue / unqueue / reassign to self | RPC | `already_owned` (owner name only) / `skipped not_yours` / `not_yours` / 403 `admin_only` |
| E7 direct PATCH `assigned_to_user_id` | REST | 200 `[]`, 0 rows changed (verified) |
| test1's campaign: detail / leads / rename / launch / stop / delete / add | RPC | `not_found` ×7 |
| test1's campaign direct PATCH name | REST | 0 rows (verified unchanged) |
| Paul's campaign `test` row / detail | REST / RPC | `[]` / `not_found` |
| Paul's lead: view / History / messages / Quick Close | REST / fn | empty / empty / empty / 403 |
| A client lead: same | REST / fn | empty / 403 |
| Client baseline audit / Paul's notification | REST | empty |
| Paid Client get, paid-baseline get, monthly update facts | fn / RPC | `admin_only` |
| Hook audit or crawl on E7, Paul's, a client, a nonexistent id | fn | 403 (no audit created) |
| Send to an unassigned real lead / to another number on own lead (dry run) | fn | 403 `forbidden` ×2; 0 rows written |
| test1 → Test's campaign leads, Test's E1 follow-up / star | RPC | `not_found`, `not_your_lead` |
| Exceptions (by design or minor) | | `lead_first_contact_at` answers for any id (E-14); crawl-check `job_id` / `run_id` (E-06, code) |

**Verdict: no IDOR found on any lead, campaign, conversation, queue item, audit, call, Next Action, commission, payment, Paid Client, agreement, monthly update or baseline object, except E-06 (crawl-check) and the timestamp leak in E-14.**

## Campaign isolation

- Re-tested end to end (above). Test's raw `campaigns` read lists only its own 3; `my_campaigns` for test1 lists only its own.
- `campaign_usable` (admin: any; sales: `created_by = me`) gates every campaign RPC. Launch and stop touch only leads the caller holds.
- **Name race:** Test and test1 created 4 case/space variants of the same name at the same instant → **exactly one row** (`campaigns_name_key_unique` on `campaign_name_key(name)`); 7 × `name_taken`. Double Launch → `queued:1` then `skipped not_new:1`.

## Lead ownership

- Ownership is derived per call (`assigned_to_user_id = auth.uid()` and not a client), so no stale grants exist.
- **Reassignment (E5, Test → test1, by admin):**
  - Test instantly lost the view, History, can-work and edit (`not_your_lead`), and its dashboard stopped mentioning E5.
  - test1 gained all four History items, the Next Action and the star, and got one "Paul assigned you" notification.
  - Exactly one active owner, and the History row records from / to.
- Notes are lead-scoped, so the new holder sees the old holder's notes. Note this if reps expect private notes.
- Paid clients leave every rep's view except the seller's read-only Quick Close (and a still-assigned non-seller can view too, `quick-close:113`; minor).

## Coverage / duplicate handling

- **Canonical rule (confirmed live):**
  - A BEFORE INSERT trigger `guard_lead_identity` takes an advisory lock on `place_id` and refuses a second insert, on **every** insert path.
  - `sales_add_lead` also locks by phone key and refuses phone and Maps-link matches.
  - A website match is a warning, not a refusal (chains).
- **Race:** three rounds of 6–16 simultaneous adds of the same no-phone business by Test and test1 → **exactly one winner per round**, the rest `exists` with the owner's name and no id.
- **Cases:**

  | Case | Result |
  |---|---|
  | Held by the other rep (phone, `07…` or `+44…`) | `owned · test1` |
  | Held by Paul | `owned · Paul` |
  | Archived | `owned · Test` |
  | Paid client | `owned · Paul` |

  No record id leaked in any case.
- **Legacy:** 82 duplicate `place_id` groups (170 rows) predate the trigger (newest 17 Aug, Paul's decision to leave them); none spans two owners.

## Bulk audit/crawl reliability

- **Today a salesperson has no bulk path** (E-04). They have:
  - one-lead hook audits (3 per lead per day, a 30-minute in-flight dedupe, guard 10 per 10 minutes / 80 per day);
  - a one-lead crawl of their own lead's website.
- **The admin bulk runner** (`bulk-jobs`): cap 100 per job, one active job per user (read-then-insert), a stuck-job sweep every minute, a 45-minute wait limit.
  - A retried chunk can add a second paid run to an existing audit (agent; P2-level, admin only).
  - A `capped` run with at least one answer counts as done.
- **Same site crawled by two reps:** one running full crawl per *lead*; nothing stops two leads with the same site, though that is rare given the place-id guard.
- **Cancellation and progress:** admin only.
- Not exercised live (no E audit budget; README §9 "E: none").

## Spend controls

| Control | Value | Scope | Note |
|---|---|---|---|
| Per-rep guard | hook 10 / 10 min, 80 / day; site_scrape 300 / h; $15 / h, $35 / day hard (estimates) | per user | counts rows, read-then-write (parallel bursts can exceed) |
| Per lead | 3 hooks / day, 30 min in-flight | per lead | not atomic |
| Audit queue | **$12 / rolling 24 h** | **shared by everyone** (E-05) | read without paging (`runner.ts:70-83`) |
| Team | $100 / day | all | |
| Apify monthly | $40, warn at 90 % | account | nothing refuses at 100 %; every audit then fails (C-14) |
| Rep-visible message at a cap | guard: "Usage temporarily paused — contact Paul"; queue cap: **none at request time** | | |

A rep cannot cause *uncontrolled* spend today: hooks are guarded, bulk is admin-only, and Places searches and lookups are guarded. **The risk is shared starvation (E-05), not runaway spend.**

## Audit result integrity

- Results are keyed by run and question.
- One baseline and one re-measure per lead (unique indexes); the pointers are immutable (C).
- A rep's hook audit takes business, trade and town from the request body, not the lead row (agent, `create-ai-audit:395-401`), so a rep can attach an audit of a different business to their own lead. P2-level.
- The auto "not interested" after a 6/6 hook ignores the lead's later progress (agent, `hook-not-interested.ts:37-40,73,132`). Code-only, not exercised.
- E-06 is the one cross-lead write.

## Call / Next Action concurrency

| Test (E3) | Result |
|---|---|
| Two tabs set different Next Actions at once | both applied in turn (row lock); History has both; final = the later write. Coherent; no stale check (E-13) |
| Re-save of an identical value | `unchanged` (no extra History) ✅ |
| Double-submit a call outcome | **two `call_outcome` rows** (E-12) |
| Another rep sets a Next Action / logs a call | `not_your_lead` ✅ |
| Archive / reassign | the old holder's edit refused at once ✅; Next Action kept on reassignment ✅ |

## Inbox / realtime

- **Messaged lead (E6), live:**
  - the drip was simulated by the real cron within a minute;
  - the inbound reply moved the lead → `replied`, gave test1 unread 1, created one notification, and appeared on test1's dashboard and Outreach row;
  - Test saw nothing.
- **Never-messaged lead (E4):** unmatched, no unread, no notification (E-07).
- **Duplicate inbound** (same message id) ignored ✅.
- **Phantom rows:** the mirror placeholder `[initial_contact]` appeared beside the simulated opener (README §5 artefact). It also happens on genuinely failed real sends, so a rep may see a "sent" placeholder for a message that never left. Cosmetic.
- Lost-reply risk: E-07.

## WhatsApp safety

| Check | Result |
|---|---|
| Queue own fixture | ✅ (E6 via campaign launch; real cron; `simulated`, no Meta id) |
| Duplicate queue / double launch | one queue entry, one History row ✅ |
| Other rep unqueue / queue / panel | refused ✅ |
| Simulated send retry loop | none: E6 sent once, then left the queue ✅ |
| Rep pressing send on an unassigned real lead / another number | 403 (dry run) ✅ |
| Rep `test_send`, QA drill | `admin_only` / `forbidden` ✅ |
| **Real outbound WhatsApp during the session** | **0 Meta message ids system-wide** (4 simulated) ✅ |
| Queue while paused / outside window | not run (in-window session); the window and pause logic are unchanged since README §2.6 |

## Email safety

- No email field is typeable by a salesperson that reaches a client: the agreement link and the onboarding sends are admin-only (`paid-client-hub` → `admin_only` for Test). The QA sink guard was proven by the coordinator.
- Quick Close "Correct a detail" writes to the onboarding row. Emails then go only through admin or Stripe paths.
- E-18 (public onboarding overwrites) is the one place a typed value lands on a lead without a login.

## Quick Close reliability

| Test (E1) | Result |
|---|---|
| Save all answers (Optimise), one call | `ready` ✅ (Build is blocked by A-01; not re-tested) |
| Two simultaneous "Generate link" | one `link_generated`, one Stripe session (claim `quick_close_claim_link`; the loser waits and reuses) ✅ |
| Other rep generates a link on E1 | 403 `not_your_lead` ✅ |
| Route change after a link | B-16 (the old session stays payable 24 h) — re-confirmed in code |
| Stale dialog after payment | B-14 |

## Payment idempotency

- **Exactly-once logical outcome for money:** across 5 deliveries of the identical event on E1 there was 1 ledger row (`test_excluded`), 1 `payment_received` History line, 1 Quick Close `paid`, 1 notification, 1 agreement acceptance, 1 PAID email (then `payment_email_skipped`) and 0 real WhatsApp.
- **Not idempotent for state:** E-02 (status / date regression, including refunded and ended).
- **Not idempotent under concurrency for the subscription:** E-03 (code).
- **Out-of-order events:** only `checkout.session.completed` can be simulated. `invoice.paid` before checkout, refunds and disputes were reviewed in code only (agent Part B). The refund path keeps `amount_paid` and reverses commission pro rata ✅.
- **QA simulation guard:** cannot be satisfied for a real lead. It needs `CRON_SECRET` and a `metric_exclusions` row, which no client can write (live: insert refused by RLS). It trusts `amount_total` from the body (fixtures only).

## Commission integrity

- **Seller attribution** is stamped by the `trg_outreach_leads_sold_by` trigger at payment (E1: seller = Test) ✅.
- Reps cannot read or write the ledger or payouts (403, no grant) ✅.
- `sales-earnings` ignores a `user_id` parameter and returns only the caller ✅. Team view `admin_only` ✅.
- Projected commission is labelled "Expected", never earned (code) ✅.
- **Gaps:**
  - E-16: recurring payments on test or excluded leads earn commission.
  - E-17: a payment after an ended service earns commission.
  - Claiming an unassigned, not-yet-paid self-signup lead just before it pays would make the claimer the seller (agent; whether free-check leads are left unassigned is unverified).

## Paid Client state machine

- **Backwards moves by replay:** E-02.
- **Delivery submit:** idempotent (B).
- **`contract_total_payments`:** immutable (trigger).
- **Baseline / re-measure pointers:** immutable (C).
- **No status trigger** prevents any writer from moving a client backwards. Only the replay was found to do so.
- Concurrent admin edits are row-lock last-writer-wins. Not exercised.

## Ended-client safety

- After the replay the ended client's status read `payment_received`, but `service_terminated_at` was kept. Weekly checks, re-measure, performance sync and the agreement prompt key on it (agent, `performance-sync:120`, `weekly-visibility:47`), so future work stays stopped.
- Historic revenue and commission are untouched.
- Risks: a later `invoice.paid` (E-17); the status label now says "payment received" for an ended client (E-02).
- MCL was not touched.

## Baseline / re-measure reliability

- From Session C's evidence plus the cap review:
  - one claim per start ✅;
  - unique one-baseline / one-remeasure-per-lead indexes ✅;
  - give-up is invisible (C-11);
  - the shared $12 cap can fail a guarantee run (E-05);
  - one click can clear a re-measure date (C-09);
  - held results are never sent later (C-10).
- **Ronnie (13 Oct)** was not touched. Its reliability consequence: the one-replay index makes any failure or wrong set permanent, and E-05 adds a way for that day's run to be capped.

## Website-build safety

- From Session D:
  - Build tooling is open for Optimise clients (D-06);
  - production unlock is not gated on a passing gate (D-04);
  - enquiry forms need a code change (D-12).
- From this session: every Website Build action is inside `paid-client-hub` (`requireAdmin`), and **no salesperson can reach it** (live `admin_only`).
- No deploy was attempted.

## Private data exposure (salesperson)

- **Admin-only, verified live:** Discovery answers, baseline results, the agreement and signed PDF, Website Build context, monthly updates and admin notes. These live in `paid-client-hub`, `paid-baseline`, `client_agreement_*`, `client_monthly_updates` and `lead_notes` (restrictive admin policy). Reps get `admin_only` or 403.
- **Readable by reps by design:** team display names (`profiles`, `team_directory`), shared Companies House and agency-check caches (106 / 180 rows, keyed by business), and published mockup site rows.

## Saved Quick Reply exposure (A-02, traced)

- **Source:** the `templates` table. Policy `sales_select_templates`: any `sales` user may SELECT every row whose `user_id = book_owner_id()` (Paul). Read through `useTemplates()` with no filter. Other policies are owner-only for INSERT / UPDATE / DELETE.
- **Can a rep read it?** Yes: **all 15 of Paul's rows**, every column (`title`, `content`, `category`, `template_type`). Any rep sees all of them, so a second rep sees exactly the same set.
- **Can a rep send it?** Yes, via the Inbox insert-and-send, on their own open-window leads. Template text is just message text, and the QA guard refuses it only for test accounts.
- **Can a rep edit or delete it?** **No.** UPDATE / DELETE require `auth.uid() = user_id`. A rep may create their own templates, which other reps cannot see.
- **Sensitive categories found (contents not reproduced):**
  - one ~11,000-character personal working note (contains an email address and account id);
  - one row containing a **live Stripe Payment Link** and prices;
  - three rows with old prices or terms;
  - the rest are barber-era or old openers.
- **No API keys or passwords** in any row (pattern scan).
- **The old Payment Links:** flagged, not reproduced. Deactivate them in Stripe.
- **Fix:** as A-02, and move notes out of `templates`.

## Secret-management audit

| Place | Result |
|---|---|
| Vault | **E-08**: service-role and anon JWTs stored as secret *names*; not client-readable |
| Git history (6,935 commits) + findable-site (528) | no real secret ever committed; only the public anon key (`.env` tracked Jan–Jun 2026 with anon only) |
| Working trees incl. untracked (`HANDOFF.md`, `RECON_*`, `SQL_FOR_PAUL_*`, `scripts/_*.ts`, `.wrangler/`) | no real secret; `.wrangler/` in the primary checkout is not gitignored (anon key only; add it to `.gitignore`) |
| Client bundle | only `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (anon), `VITE_APP_BUILD` |
| Edge functions | all secrets via `Deno.env.get`; logs record presence only; the one URL with a key (`search-leads:346-348`) is redacted before logging |
| Cron commands / `pg_stat_statements` / SQL functions | no inline keys; vault-reading functions are not executable by `anon` / `authenticated` |

**CREDENTIAL ROTATION: not required as an emergency; recommended as a precaution for the legacy service-role key (E-08).**

## Webhook authentication

| Webhook | Auth | Unset secret | Replay | Verdict |
|---|---|---|---|---|
| whatsapp-status | Meta HMAC (constant-time), **only if the secret is set** | **fails open (live)** | wamid unique (sender chooses it) | **E-01 P0** |
| stripe-webhook | Stripe signature, 300 s tolerance; QA path needs `CRON_SECRET` (wrong secret → 401) | fails closed (500) | per-object unique keys, no event table | ✅ auth; E-02 / E-03 state |
| resend-webhook | Svix, 5 min, constant-time | fails closed (401) | no `svix-id` dedupe (E-19) | ✅ |
| site-enquiry | Origin header only | — | per-IP / site caps | E-19 |

## Security-definer review

- **92 SECURITY DEFINER functions** are executable by `authenticated`, and **all set `search_path`**.
- **Lead functions:** every write funnels through `_require_work` → `can_work_lead` (admin: exists; sales: assigned and not a client).
- **Campaign functions:** through `campaign_usable`.
- **Admin functions:** `my_role() is distinct from 'admin'`.
- **Monthly updates:** admin-check ✅.
- **Payment simulation:** not a SQL function; webhook-gated by `CRON_SECRET` + exclusion ✅.
- **Callable by `anon`:** `bump_audit_open` (E-14), `log_usage_event`, `reset_my_metrics` (no-op without uid), and the booking helpers (legacy mockup product).
- **Unguarded but read-only:** `lead_first_contact_at`, `lead_logged_contact_at` (E-14).
- **Abuse-limited:** `lead_identity_lookup` (rate-limited, masks ids), `log_data_access` (checks lead ids for sales).

## RLS review

- **111 public relations:**
  - every base table has RLS enabled;
  - the two without RLS are views: `audit_gemini_signal` (`security_invoker`) and `sales_leads` (security barrier, filters to `assigned_to_user_id = me`, hides clients and `amount_paid`).
- **`outreach_leads`:** restrictive admin-only, so reps never read the base table.
- **Closed to reps (RLS with zero policies):** `onboarding_responses`, `metric_exclusions`, `whatsapp_sends`, `whatsapp_auto_replies`, `enrichment_usage` and similar.
- **Grants revoked from clients:** `payment_ledger`, `commission_payouts`, agreements and similar.
- **`user_roles`:** writes denied.
- **`lead_notes` / `lead_claims`:** permissive "view all" combined with restrictive admin-only, which is effectively admin-only ✅.
- **Over-broad:** `templates` (A-02); `generated_sites` (reps see `lead_id`s of published mockups; anon is limited to public columns).
- **Minor:** `pg_stat_statements` has a SELECT grant to `anon` / `authenticated` but is not exposed through the API.

## QA safety-layer review

| Abuse attempt (as Test) | Result |
|---|---|
| Insert a `metric_exclusions` row (make a real lead "simulated") | RLS refused ✅ |
| Delete an exclusion | 0 rows ✅ |
| QA drill on own fixture | 403 `forbidden` (cron / admin only) ✅ |
| Fake payment via the QA header without the secret | 401 ✅ |
| `test_send` | `admin_only` ✅ |
| Send to a real unassigned lead / mismatched number | refused before the guard ✅ |
| Drama-range number on a real lead | not creatable by a rep; Ofcom's range is unassignable, so the guard can only simulate (safe direction) |
| Production test mode | `WHATSAPP_TEST_MODE` off; 0 real sends in the session ✅ |

**The QA layer is not a backdoor.** Two side effects:
- E-10: the sink email is now globally suppressed.
- E-16: test accounts' recurring commission.

## Metrics integrity

- **Test activity is excluded by user and lead** (`metric_exclusions`). Gaps:
  - B-28: fixtures count in "New clients this month" until archived;
  - E-16: recurring commission;
  - `_campaign_counts` ignores exclusions (README §4.5);
  - **A-11:** simulated sends don't count as sends, so QA campaigns read "Draft".
- **Revenue risk from E-02:** a refunded client replayed back to `payment_received`.
- **Call counts inflated** by E-12.

## History / audit trail

| Action | History | Actor | Duplicates |
|---|---|---|---|
| Assignment | `lead_assigned` from / to | admin ✅ | — |
| Queue / unqueue / stop | `bulk_queued`, `details_set queue removed` ✅ | ✅ | one per real change ✅ |
| **Queue suppression → `opted_out`** | **none** (E-10) | — | — |
| Status / star / note / follow-up | ✅ with from / to | ✅ | identical re-save writes nothing ✅ |
| Call outcome | ✅ | ✅ | **duplicates on double-submit (E-12)** |
| Payment | one `payment_received` (unique index) ✅ | system | replay-safe ✅ |
| Archive | `archived_set` ✅ | ✅ | — |
| Quick Close | `quick_close_events` (append-only, server time) ✅ | ✅ | `link_reused` on repeats ✅ |

Immutability: `lead_activity` has no update or delete for reps. The agreement acceptance is write-once (trigger).

## Concurrency tests (all live)

| Race | Winner / outcome | Coherent? |
|---|---|---|
| Test + test1 add the same business ×3 rounds | one row per round; the rest `exists` | ✅ |
| Test + test1 create the same campaign name (4 variants) | one row | ✅ |
| Double queue / double launch | one queue entry | ✅ |
| Two Next Actions | later write wins; both in History | ✅ (stale overwrite, E-13) |
| Double call log | two rows | ❌ E-12 |
| Double generate link | one session | ✅ |
| Payment delivered ×5 (incl. after stage moves) | money once; status regresses | ⚠️ E-02 |
| Admin reassign while the rep holds the lead | old rep refused instantly | ✅ |

## Network / retry behaviour

- **Retry-safe (idempotent):** queue, launch, unqueue, claim, add lead, campaign create, set Next Action (same value), generate link, payment money rows, inbound message ids, submit for delivery.
- **Not retry-safe:**
  - call outcome (E-12);
  - request-call email and agree-page submit (check-then-insert, E-19);
  - Stripe subscription create (E-03);
  - Stripe failure / cancel emails (E-19).
- **Response lost after commit:** a retry of the above duplicates; everything else answers `unchanged` / `already` / `exists`.

## Error handling

- **Good:** refusals carry plain detail ("That lead is not assigned to you.", "Usage temporarily paused — contact Paul", "Another click is creating the link — try again in a moment.").
- **Bare codes reach the UI in places:** `not_found` / `name_taken` are mapped by the SPA, but A-23 (`town_unverified: …`) and B-14 ("Edge Function returned a non-2xx status code") show raw text.
- Raw error text is returned by `bulk-jobs:745` and `clear-enrichment-cache:146` (admin paths).
- No SQL or stack traces reached a rep in my calls; PostgREST 42501 bodies are raw, but the SPA calls RPCs, not tables.

## Observability — can Paul tell when something fails?

| Failure | Visible to Paul? |
|---|---|
| Forged / unsigned inbound | only the Admin Security "secret missing" badge (E-01) |
| Unmatched inbound reply | no alert (E-07) |
| Audit capped by the shared budget | no alert at request time; the run ends `capped` (E-05, C-11) |
| Baseline gave up | no (C-11) |
| Queue suppression of a lead | no History row (E-10) |
| Payment webhook processed | bell + PAID email ✅ |
| Payment email failures | `client_error_reports` (now has `message`) ✅ |
| Stuck bulk jobs | swept every minute ✅; none open |
| Function logs | retained under a minute; not an operator tool |

## Sales-team permission matrix (what a salesperson can do)

| Area | VIEW | CREATE | UPDATE | DELETE | TRIGGER | Flag |
|---|---|---|---|---|---|---|
| Dashboard | own numbers, own work | — | — | — | refresh | A-03 archived leads |
| Coverage | whole-book counts, niche verdict (by design) | — | — | — | — | |
| Find Leads | results; who owns a business (name only) | add lead (deduped) | — | — | Places search (guarded) | |
| Campaigns | own only | own (unique name) | rename own | delete own if empty | launch / stop own leads | ✅ |
| Outreach | own assigned non-client leads | — | stage, star, details, profile, email | archive own | claim unassigned (guarded) | |
| Audit / crawl | own leads' hook audits and crawls | one-lead hook audit | — | — | crawl own lead's site | **no bulk (E-04)**; E-06 |
| WhatsApp queue | own queued leads | queue own | unqueue own | — | — | ✅ |
| Inbox | own leads' threads + their phones | send / media / voice on own leads | mark read | — | AI draft (guarded) | **A-02 templates**; E-21 no daily cap |
| Calls | own | log outcome | — | — | — | E-12 |
| Next Actions | own | set | change / clear | — | — | E-13 |
| Quick Close | own leads; seller after payment | answers, handoff | handoff (after payment, seller) | — | generate link | A-01 Build |
| Payment Link | own lead's | Stripe session (claimed, reused) | — | — | send on WhatsApp | B-04, B-16 |
| Commission | own summary | — | — | — | — | ✅ |
| Paid Clients | — | — | — | — | — | ✅ admin-only |
| Admin | — | — | — | — | — | ✅ admin-only |
| Delivery (baseline, build, agreement, monthly, Welcome Pack admin) | — | — | — | — | — | ✅ admin-only |
| Saved texts | **all of Paul's (A-02)** | own | own | own | send | ❌ excessive |

Missing for the new workflow: bulk audit / crawl for own selected leads (E-04).

## Practical launch-risk summary (several reps calling all day)

1. **Fake replies from outside (E-01).** A rep acts on a message the prospect never sent, or a contacted prospect is silently suppressed.
2. **Shared $12 audit budget (E-05).** By mid-afternoon of a busy day, audits start failing silently, including a client's guarantee measurement.
3. **Replies after calls get lost (E-07).** In a call-first model this is the most likely "lost lead" path.
4. **Saved texts (A-02).** A new rep sends an old price or an old Payment Link that bypasses Quick Close and seller attribution.
5. **Payment-state regressions (E-02 / E-03).** Rare, but they hit money and need Paul to repair rows by hand.

What will *not* go wrong:
- two reps owning the same business;
- one rep reading or changing another's leads or campaigns;
- runaway spend from a single rep;
- duplicate clients, ledger rows or commission from a repeated payment;
- reps seeing Paid Client, delivery or admin data.

## Suggested launch decision

**Do not hand out logins until E-01 and A-02 are fixed** (plus A's and B's own blockers: A-01 Build close, B-07 first contact).

- **E-01:** Paul sets the Meta app secret, then a one-line fail-closed change.
- **A-02:** drop one policy, and move the notes out of `templates`.

**Then, before reps are expected to work call-first:** E-05 (separate the guarantee-measurement budget), E-07 (phone-key matching for inbound), E-02 (status never moves backwards), E-03 (Stripe idempotency key), E-06 (crawl-check ids), E-08 (vault entries renamed).

**E-04 is a product build, not a fix:** the "select leads → bulk audit" workflow does not exist for salespeople. Until it is built with per-lead ownership and a per-rep budget, reps run one-lead checks (≈1 minute each, guarded).

The P2 list can follow during the first weeks. **Write down the off-boarding rule now:** remove the rep's role, not just sign them out (E-09).

---

## Twelve-question matrix (README §12) — cross-cutting, Session E's lens

Q1 find · Q2 next · Q3 enough info · Q4 unnecessary info · Q5 asks known · Q6 harmful mistake · Q7 wording · Q8 state updates · Q9 admin gets it · Q10 permissions · Q11 desktop + mobile · Q12 recovery. (UX questions are A's and B's; E answers 6, 8, 9, 10 and 12.)

| Stage | Q6 | Q8 | Q9 | Q10 | Q12 |
|---|---|---|---|---|---|
| J1 Login / auth | ✅ | — | — | ✅ (E-09 sign-out lag) | ✅ (503 vs 401 on the helper; E-15) |
| J2–J3 Coverage / add | ✅ dedupe | ✅ | — | ✅ | ✅ |
| J4–J6 Campaign / queue | ⚠️ E-10 | ✅ | — | ✅ | ✅ |
| J7 Outreach | ✅ | ✅ | — | ✅ | — |
| J8 Inbox | ❌ E-01, A-02 | ⚠️ E-07 | ⚠️ E-07 | ❌ A-02 | ⚠️ |
| J9 Next Action | ⚠️ E-13 | ✅ | — | ✅ | ✅ |
| J10 Audit / crawl | ⚠️ E-05 | ⚠️ C-11 | ⚠️ | ⚠️ E-06 | ⚠️ no cap message |
| J11 Calls | ⚠️ E-12 | ✅ | — | ✅ | — |
| J13–J14 Quick Close / link | ✅ claim | ✅ | — | ✅ | ✅ |
| J15 Payment | ⚠️ E-02, E-03 | ✅ | ✅ | ✅ QA guard | ⚠️ |
| J16–J20 Handoff / agreement | ✅ | ✅ | ✅ | ✅ admin-only | — |
| J21–J28 Delivery | ⚠️ E-05 | — | ⚠️ C-11 | ✅ admin-only | ⚠️ |

## Not tested, and why

- **Bulk audit / crawl as a salesperson:** it does not exist (E-04). Admin bulk was not run: no E audit budget (README §9).
- **Any paid audit, crawl, Places search, Discovery or baseline:** E's caps are zero. Spend paths were reviewed in code. E6's armed audit was blocked by the town gate (no spend).
- **Write attempts on Paul's or clients' real records:** deliberately not made. Their protection rests on the function sources (`_require_work` / `campaign_usable` / `requireAdmin`) plus live reads.
- **Role removal mid-session:** not run live (it would change an account's access). `my_role()` is evaluated per call, so it is immediate by construction.
- **Auth-service outage:** not inducible; code only.
- **Stripe:** subscription, `invoice.*`, refund and dispute events, Stripe retries, concurrent deliveries (E-03). Code only; the simulation has no customer.
- **crawl-check E-06:** code-confirmed, not exercised (needs other leads' ids).
- **Admin screens, stale browser tabs, mobile:** no browser session was used. Staleness was tested at the API level (two-tab writes, double clicks).
- **Queue while paused / outside the window:** the session ran inside the window, and pausing is a global setting I may not change.
- **Ronnie, MCL, real client dates, Website Build deploys:** read-only, per protocol.
- **Sending real voice notes or media:** not attempted.

## Cleanup check output (README §4.4)

All 12 Session E records were archived through `lead_set_archived` (History `archived_set`), phone and email were cleared, the Next Actions on E3 and E5 were cleared, and History and exclusion rows were kept.

| business_name | id | is_archived | no_contact | excluded | `archived_set` | last status |
|---|---|---|---|---|---|---|
| ZZ QA-E race dup test 2 | 01f50f5b-8782-4efa-8147-62043bb414c5 | true | true | true | true | not_contacted |
| ZZ QA-E race dup test 3 | 7871d808-2b56-4693-b25e-b151fa2cb401 | true | true | true | true | not_contacted |
| ZZ QA-E race dup test1 0 | a331397c-4eb0-430a-bc6f-fff3c1a3d3c3 | true | true | true | true | not_contacted |
| ZZ QA-E1 payment replay | 1e000000-0000-4000-8000-0000000000e1 | true | true | true | true | payment_received (ended stamp kept) |
| ZZ QA-E2 campaign A queue | …00e2 | true | true | true | true | opted_out (E-10) |
| ZZ QA-E3 next action race | …00e3 | true | true | true | true | not_contacted |
| ZZ QA-E4 inbound propagation | …00e4 | true | true | true | true | not_contacted |
| ZZ QA-E5 reassignment | …00e5 | true | true | true | true | not_contacted (held by test1) |
| ZZ QA-E6 campaign B queue | …00e6 | true | true | true | true | replied |
| ZZ QA-E7 other rep target | …00e7 | true | true | true | true | not_contacted |
| ZZ QA-E8 quick close race | …00e8 | true | true | true | true | not_contacted |
| ZZ QA-E9 duplicate business | …00e9 | true | true | true | true | not_contacted |

- **Queue:** only Paul's two pre-existing, phone-less leads (Roof Rhino Ltd, PRECISION ROOFERS LTD); none of mine.
- **Jobs:** 0 open bulk jobs; 0 audits created during the session.
  - E6's armed first-reply audit row is still retrying and failing on the town gate. It stops at 5 attempts, spends nothing, and is left as E-11 evidence.
- **Real external actions:** 0 WhatsApp messages with a Meta id system-wide during the session (4 simulated). Emails went only to paul@findable.live (PAID) and paul@move37.fun (agreement PDF). No real payment and no Stripe subscription. 1 unpaid Checkout Session (E1, expires 24 h).
- **Inbound simulation:** 2 unsigned posts (E4, E6, reserved numbers) plus 1 replay.
- **Sessions:** every token I issued was signed out (204) and refused afterwards (401). `auth.sessions`: Test 0. test1 has 1 session that existed before this session started; it is not mine and was left alone.
- **Residue kept on purpose:**
  - the campaign `Test - Pre Sales Certification E`;
  - E1's onboarding row (`paid`), its ledger row (`test_excluded`), one agreement acceptance (write-once), its `client_paid` notification and Quick Close events;
  - E5's `lead_assigned` notification to test1;
  - the two inbound QA messages.
- **Local:** keys, tokens and the Management API token were held only in the session scratchpad and were deleted at the end. No key or token value appears in this report.
