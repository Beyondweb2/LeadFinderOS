# Fix workstream 1 — Security & inbound replies

- **Branch:** `fix/01-security-inbound`, cut from `origin/main` `c0e85078` (proved equal before branching).
- **Date:** Sunday 4 October 2026.
- **Findings fixed:** M-002 (saved texts), M-003 (unsigned webhook), M-005 (post-call WhatsApp matching),
  M-006 (crawl-check cross-lead ids), M-007 (vault names: prepared, not run), M-054 (the off-boarding half).
- **Not merged, not deployed.** No SQL was applied to the live database. No secret was set. No Stripe
  change was made. Ronnie and MCL were not touched.
- **No secrets anywhere in this document.** The vault entries are named by id only; the Stripe links by the
  template title, price and the last four characters of the link.

---

## 1. What was fixed

### M-003 — the WhatsApp webhook now FAILS CLOSED
- **Before:** `whatsapp-status` checked Meta's signature only when `WHATSAPP_APP_SECRET` was set. It is not
  set, so anyone could post a fake customer reply (proved live by Session E).
- **Now:** one gate, `src/lib/metaWebhookGate.ts`, runs before the body is parsed and before a database
  client exists. Exactly two ways in:
  1. **Meta:** the app secret is configured **and** `X-Hub-Signature-256` is valid over the exact bytes received.
  2. **QA simulation:** the `CRON_SECRET` in `x-qa-simulate-inbound` **and** inbound messages only (no
     delivery statuses), every sender in Ofcom's reserved range 07700 900000–900999, every message id
     starting `wamid.QA_`. A real number is refused 403. It mirrors `x-qa-simulate-payment`. A salesperson
     cannot hold the `CRON_SECRET`.
- **Results:** secret missing → **401** · signature missing → **401** · signature wrong, for another body or
  another secret → **401** · valid Meta signature → accepted · duplicate message id → stored once (unchanged:
  the unique index on `wa_message_id`).
- **No unsigned production bypass exists.** The old QA method (an unsigned post) is gone. Its replacement is
  `scripts/qa-simulate-inbound.ts` (README §5 updated).
- **Admin wording:** the Security panel and the alert email now say "WhatsApp inbound is OFF" while the
  secret is missing, which is now the truth.

### M-002 — saved texts are private
- **Policy:** migration `20261006010000_templates_owner_only.sql` drops `sales_select_templates`. That was
  the only policy anywhere that used `book_owner_id()` (checked live).
- **Model (the smallest safe one, since no shared-template concept exists):** everyone reads only their
  own rows. The four owner policies (`auth.uid() = user_id`) already existed and stay.
  - A rep sees their own texts.
  - A rep sees none of Paul's: not his working note, not his pricing, not the old links.
  - Paul (admin) sees exactly what he saw before: his 15 rows.
- **Sending:** no server code reads `templates`. A saved text is only text the browser puts into the
  composer, so a rep can no longer send what they cannot read. Every send is still re-checked by
  `send-whatsapp-message`.
- **Browser:** `useTemplates` no longer seeds the nine barber-era default texts into an empty account.
  Once Paul's rows were hidden, that seeding would have hit every new rep.
- **Paul's records:** nothing deleted, nothing moved.

### M-005 — a WhatsApp after a call reaches its lead
- **Before:** the fallback matched with `ilike '%<last 9 digits>%'`. Measured today, 5,474 of 5,476 stored
  phones contain a space, so it almost never matched. It also judged ambiguity by `user_id`, which is always
  the one book owner, so that check never fired.
- **Now:**
  - Migration `20261006010100_inbound_lead_candidates.sql` adds `inbound_lead_candidates(phone)`. It compares
    `phone_key()` on both sides, uses the existing index, and is executable by the service role only.
  - `src/lib/inboundMatch.ts` decides between the candidates.
  - "07700 900123", "+44 7700 900123", "07700900123" and Meta's "447700900123" all meet on one key.
- **The rule:**
  - one non-archived lead → that lead;
  - no non-archived lead, but exactly one archived → that lead;
  - **more than one → ambiguous.** The message is stored with no lead (Unassigned, admin-only) and Paul gets
    one notification per message: "WhatsApp reply needs matching", linking to the conversation;
  - none → Unassigned, as before.
- **What a matched reply does:** it gets the lead's id. The database's existing rules then do the rest, all
  keyed on the lead's holder (`assigned_to_user_id`):
  - `trg_notify_whatsapp` → `lead_recipient` notifies the holder;
  - `my_whatsapp_unread` gives the holder an unread count;
  - `sales_select_messages` lets only the holder read it;
  - the normal matched-reply logic runs: status → `replied` (strong statuses protected) and the first-reply
    guard.
- **Also fixed:** an earlier outbound to the number with no lead attached no longer stops the search.
- **Unchanged:** a reply to a number we messaged still follows the most recent outbound.
- **No old message was re-assigned.** The one real reply that went unmatched on 20 Sep stays as it is (see
  Manual actions).
- **Size of the ambiguous case (live, today):** 122 phone keys sit on more than one active lead (281 leads),
  against 5,037 keys on exactly one.

### M-006 — crawl-check cannot cross leads
- **Rule:** `src/lib/crawlAccess.ts`, applied in the salesperson branch, after the lead check and before
  both the status read and the run write:
  - a `run_id` from a salesperson → **403 `run_id_not_allowed`**. Only the audit pipeline, an internal
    caller, files a crawl into a run, and the SPA never sends one;
  - a `job_id` whose lead is not the lead just checked, or a job we cannot place → **403
    `job_not_your_lead`**;
  - a failed job lookup → 503 (fails closed).
- **Still refused, re-proved:**
  - another rep's lead → `not_your_lead`;
  - a Paid Client lead → `not_your_lead`;
  - `url` / `audit_id` from a rep → `lead_website_only`.
- **Admin:** behaviour unchanged.

### M-054 (off-boarding) — role removal is the kill switch, and crawl-check honours it
- **crawl-check is on the shared `resolveActor`.** It used to check tokens locally (`getClaims`), so a
  signed-out session kept working until expiry. Now:
  - a revoked session → 401;
  - a removed role → 403 on the very next call;
  - an auth outage → 503 (not 401).
- **Already true, now fenced by a test:**
  - Team → Disable deletes the `sales` role row and bans the login;
  - `resolveActor` reads `user_roles` on every call;
  - every function that still checks a token locally also reads the role on every call.
  - The one exemption is `clear-enrichment-cache`: it acts only on rows whose `user_id` is the caller, and
    reps own none.
- **The rule for Paul:** to remove a salesperson, use **Team → Disable**.
  - Signing them out is not enough. Their access token works against the database for up to an hour.
  - Removing the role is immediate everywhere.
- **Live proof (rolled back):** after the role row was removed mid-session, `my_role()` was null,
  `can_work_lead` false, `sales_leads` 0 rows, their messages 0 and unread 0.

---

## 2. Migrations (WS-1 prefix `2026100601xxxx`)

| File | What | Destructive? |
|---|---|---|
| `20261006010000_templates_owner_only.sql` | `drop policy if exists sales_select_templates` | Removes access only; no rows touched |
| `20261006010100_inbound_lead_candidates.sql` | `create or replace function inbound_lead_candidates(text)`; revoke from public/anon/authenticated; grant service_role | Additive |

**Not applied live.** Both were run live **inside a rolled-back block**
(`docs/pre-sales-certification/fixes-01-rollback-qa.sql`). A read-back afterwards showed the live policy
still present, the function absent, no test rows and rep A's role intact. The block's results:

| Check | Result |
|---|---|
| Policies left on `templates` | the 4 owner policies, no `sales_select_templates` |
| Rep A: all rows / Paul's / own | 1 / **0** / 1 |
| Rep B: Paul's / rep A's | **0** / **0** |
| Paul: own / rep A's | **15** / 0 |
| Candidates for `447700900611` / `07700 900611` / `+44 7700 900611` (lead stored `07700 900611`) | 1 / 1 / 1, the right lead |
| Candidates for a number on two leads (`07700900612`, `+44 7700 900612`) | 2 (→ ambiguous) |
| Archived-only number | 1 row, `is_archived=true` |
| Unknown number / 3-digit junk | 0 / 0 |
| `EXECUTE` anon / authenticated / service_role | false / false / true |
| Inbound row on rep A's lead → notification rep A / rep B / Paul | **1** / 0 / 0 |
| Rep A sees the message / unread on the lead | 1 / 1 |
| Rep B sees the message / unread / can work the lead | **0** / 0 / false |
| Rep A after role removal: `my_role` / can work / sees message / `sales_leads` / unread | null / false / 0 / 0 / 0 |

---

## 3. Tests

`npm run check` passes on the branch: typecheck at the 9-error baseline, the edge checks, the build, and
**300/300 suites**.

New suites:

| Suite | Covers |
|---|---|
| `scripts/whatsapp-webhook-gate.test.ts` (30) | Missing secret 401 (with and without a header); missing / empty / invalid / other-secret / other-body signature 401; valid signature accepted (message and receipt). QA path: wrong secret, unset `CRON_SECRET`, real number (also hidden in `contacts[]` or mixed among fixtures), real-looking id, statuses and bad JSON all refused; fixtures accepted. Wiring: the gate runs before parse and before any DB client, and the fail-open branch is gone |
| `scripts/inbound-phone-match.test.ts` (49) | The chooser on every arrival (none, one, unassigned, active+archived, archived-only, two reps, same rep twice, two archived, duplicate row, junk, null `is_archived`). 8 UK formats → one key. The **real `handleInboundMessages`** against a fake DB: never-messaged lead linked + `replied`; ambiguous → no lead, Paul notified once, de-duplicated; duplicate Meta id ignored; failed lookup still stored unlinked; outbound rule kept; leadless outbound no longer blocks. Migration revokes |
| `scripts/crawl-check-access.test.ts` (24) | Own lead + own job ok; foreign job, unplaceable job, any `run_id` refused; other rep's / Paul's / Paid Client lead refused; no role refused; wiring order (lead → ids → status read / run write); `resolveActor`; fails closed |
| `scripts/templates-privacy.test.ts` (10) | The last migration to mention the policy drops it; nothing re-adds a cross-owner read; no edge function reads `templates`; the Quick reply comes only from the RLS-scoped hook; no default seeding |
| `scripts/offboarding-role-removal.test.ts` (17) | Disable deletes the role and bans; `resolveActor` reads the role per call; every `getClaims` function also reads the role (one listed exemption); the rep's Inbox / Outreach / crawl / lead functions are on `resolveActor` |

**Updated:** `scripts/abuse-cost-protection.test.ts` now asserts the new gate wiring and the new admin wording.

**Regression (all passing in the 300):** cross-rep lead isolation, campaign ownership, queue isolation,
Paid-Clients admin-only, commission, QA safety, duplicate-lead and same-business suites.
- No campaign, queue, commission, Paid Client or duplicate-lead code was changed.
- The rolled-back live block re-proved lead and message isolation between two reps.

**What no test here can prove (needs the deploy):**
- that a genuine Meta delivery verifies against the real secret (it needs the secret);
- that the deployed `whatsapp-status` / `crawl-check` run this code (marker check after deploy);
- the Inbox screen as a rep. Nobody has *seen* it; the RLS result above is text proof.

---

## 4. Manual Paul actions

1. **Set the Meta App Secret.** This must happen before `whatsapp-status` is deployed from this branch,
   because without it the new code refuses every real reply and receipt.
   - Where to get it: [developers.facebook.com](https://developers.facebook.com) → My Apps → the app that
     owns the WhatsApp number → **App settings → Basic → App secret → Show**. Facebook asks for your password.
   - Where to put it: Supabase dashboard → project `ruusxpkkmwtljxxulhbq` → **Edge Functions → Secrets** →
     add `WHATSAPP_APP_SECRET`, value = that App secret.
   - It is not stored anywhere on this machine and is not in the project's secrets today (checked by name only).
   - ⚠️ The **live** code already checks signatures as soon as the secret exists. Set it, then make sure one
     genuine reply still lands in the Inbox **before** anything else (not Meta's webhook Test button: its fake
     sender would leave a junk Unassigned conversation).
     If replies stop, the wrong value was pasted. Delete the secret, and the live (old) code accepts again
     while you fix it.
2. **Deactivate the two old Stripe Payment Links.**
   - Where they are: your saved text titled **"Pricing"** (created 4 Aug).
   - One is **£49.99** (link ending `…kE04`, for RG and anyone already quoted the old price). One is **£99**
     (link ending `…kE05`).
   - Stripe → Payment Links → open each → **Deactivate**.
   - Deactivating does not touch Quick Close, which uses its own checkout sessions, and does not refund anyone.
   - Your saved text "Price" (old offer wording, no link) and the barber texts are now private to you. Delete
     them from the Templates page if you no longer want them.
   - The ~11,000-character "META prompt" is now private too. Moving it out of saved texts is optional.
3. **Say yes (or no) to deleting the two malformed vault entries** (M-007). This is destructive, so it was
   not run.
   - They are the entries whose **name** is a key (ids `d896f9c2-2c83-4cf8-bd50-0073705c05bc` and
     `6c9a19be-301a-42cc-ae18-c79c0d056495`). Their values are short placeholders.
   - Nothing references them: every cron and `invoke_*` function reads `SUPABASE_SERVICE_ROLE_KEY`,
     `SUPABASE_ANON_KEY` and `CRON_SECRET` by their proper names, which are separate entries and stay.
   - The statement for the deploy session to run after your yes:
     ```sql
     delete from vault.secrets
     where id in ('d896f9c2-2c83-4cf8-bd50-0073705c05bc', '6c9a19be-301a-42cc-ae18-c79c0d056495')
       and name ~ '^eyJ';
     ```
     Read-back: `select count(*) from vault.secrets where name ~ '^eyJ'` → 0, and
     `select name from vault.secrets order by 1` → `CRON_SECRET`, `SUPABASE_ANON_KEY`,
     `SUPABASE_SERVICE_ROLE_KEY`.
   - **Rotation:** not done, and not needed as an emergency (Session E). Rotating the legacy key also changes
     the anon key in the app and findable-site, so plan it as its own change.
4. **Off-boarding rule** (no code): to remove a salesperson, use **Team → Disable**, never just "sign them
   out". Disable removes the role, which works at once everywhere, and bans the login.
5. **Optional:** the one real WhatsApp reply that went unmatched on 20 Sep is not re-attached automatically.
   Attach it by hand from the Inbox's Unassigned list if you want it on its lead.

---

## 5. Deploy order (for the merge/deploy session — this branch deploys nothing)

1. Paul: `WHATSAPP_APP_SECRET` set; one genuine inbound seen landing (on the **old** live code).
2. SQL, one migration at a time, each read back:
   - `20261006010000_templates_owner_only.sql` → `select policyname from pg_policies where tablename = 'templates'`
     (four owner policies, no `sales_select_templates`);
   - `20261006010100_inbound_lead_candidates.sql` → `select proname, prosecdef, proacl from pg_proc where proname = 'inbound_lead_candidates'`
     plus `has_function_privilege('authenticated', 'public.inbound_lead_candidates(text)', 'execute')` = false.
3. Edge functions, after the SQL (`whatsapp-status` calls the new function; if it were missing, replies
   would land Unassigned, never wrongly attached):
   - `whatsapp-status` (closure: `_shared/whatsapp-inbound.ts`, `metaWebhookGate.ts`, `inboundMatch.ts`);
   - `crawl-check` (closure: `crawlAccess.ts`);
   - `security-admin` (closure: `securityAlerts.ts`, wording only).
4. SPA via `main` (`useTemplates`, `SecurityPanel`).
5. Verify:
   - an unsigned POST to `whatsapp-status` → 401, nothing stored;
   - a QA inbound (`scripts/qa-simulate-inbound.ts --from "07700 9006xx"`) on a fixture lead with a spaced
     phone and no outbound → linked, holder unread + notification;
   - `--times 2` → stored once;
   - deploy marker: grep the deployed `whatsapp-status` body for `judgeWhatsAppWebhookPost`, and
     `crawl-check` for `salesCrawlIdsRefusal`.
6. Vault SQL after Paul's yes (item 3 above).

---

## 6. Outstanding configuration / not done here

- **`WHATSAPP_APP_SECRET` is not set.** The code fails closed without it. That is intended, but it means
  inbound stops until Paul sets it.
- **Later WS-1 items, not in this brief:**
  - M-050 (first-reply audit re-run / archive);
  - M-051 (email-wide "Not interested" suppression; the QA sink `paul@move37.fun` is suppressed);
  - M-055 public hardening (contact-time RPCs, `bump_audit_open`, `svix-id` dedupe, short-code throttle,
    onboarding overwrite).
- `TemplatePicker` (SingleWhatsAppDialog) still falls back to the hardcoded barber-era `DEFAULT_PREMADE_TEMPLATES`
  when a user has no saved texts. It is not a privacy leak (client constants), but it is off-brand copy. It
  is flagged for WS-5 / UI polish.
- Notes travel with a lead to its new holder (by design, Session E). Unchanged.

---

## 7. Overlap risk with workstreams 2–6

| File | Risk |
|---|---|
| `supabase/functions/whatsapp-status/`, `_shared/whatsapp-inbound.ts`, `crawl-check/` | WS-1 sole owner (plan's collision table). None expected. ⚠️ The **primary checkout** has stale uncommitted edits to `whatsapp-inbound.ts` from 19 Sep; this branch ignores them. Do not carry them in. |
| `docs/pre-sales-certification/README.md` (§5, the inbound row of the safety table, the closing note) | Low/medium: another session correcting the fixture-email note (M-051) may edit nearby lines. A textual merge only. |
| `src/hooks/useTemplates.ts` | Low: only WS-5's UI polish might touch template copy. |
| `src/components/SecurityPanel.tsx`, `src/lib/securityAlerts.ts`, `scripts/abuse-cost-protection.test.ts`, `docs/abuse-cost-protection.md` | Low: one wording line each. |
| `supabase/migrations/2026100601*` | None: the WS-1 timestamp prefix. |
| WS-7 (sales bulk check) | Depends on this branch's crawl-check rule. WS-7 must keep `run_id` refused for sales and judge every job against its own lead. |
| WS-4 | `process-ai-audit-queue` calls crawl-check **internally** with `run_id`. That path is untouched and still works. |
