# Team access tidy (2026-10-14)

Branch `feat/team-access-tidy`. Rules live in `src/lib/teamAccounts.ts`; the create flow in
`supabase/functions/_shared/team-create-user.ts`; tests in `scripts/team-create-user.test.ts`.

## 1. Admin creates a team member with a temporary password

- Team → **Add a team member** → *Set a temporary password* (default) or *Send an invite link* (the old flow).
- fn `admin-users` action `team_create_user` (after the admin role check): `auth.admin.createUser` with
  `email_confirm: true`, then `user_roles` + `team_members`; if either write fails the just-made login is
  removed again (it owns nothing). One `security_events` row `user_created_by_admin` (who, whom, role,
  first-login flag — never the password).
- **Role** defaults to `sales`. `admin` only with `confirm_admin: true` (a second tick on the screen).
- **First-login change** defaults ON (`must_change_password !== false`). Stored in
  `app_metadata.must_change_password` + `temp_password_set_at` (only the service role can write
  app_metadata). It is cleared when the person chooses a password: `/set-password` stamps
  `user_metadata.password_set_at` later than `temp_password_set_at` (`mustChangePassword`).
  `ProtectedRoute` sends a must-change user to `/set-password` before any page. This is a browser gate, not a
  server one: a person could skip it by calling the auth API themselves — it only affects their own account.
- **Password rule** (one rule, also used by `/set-password`): `PASSWORD_MIN_LENGTH` (12), letter + number, no
  repeats / runs / common words / own email name, ≤72 bytes. Generate makes a 16-character password with no
  look-alike characters.
- **The password is never logged, stored by us, returned or put in an error**: the browser sends it once, the
  function hands it to the provider, upstream errors pass through `redactSecret`. The screen shows it ONCE
  and clears it on Done.

## 2. Links: expiry, and scanners

- **Expiry is a project auth setting, not code.** Supabase `mailer_otp_exp` — Dashboard → Authentication →
  Sign In / Providers → Email → "Email OTP Expiration" (Management API `PATCH /v1/projects/<ref>/config/auth`
  `{"mailer_otp_exp": 86400}`). Was **3600 (1 hour)**; **set to 86400 (24 hours, the maximum) on 2026-10-14** through the Management API and read back. It covers invite, magic link (Resend activation), recovery (Send password reset) and the
  Forgot password email alike.
- **Scanner-safe links** (`scannerSafeLink`): the Team page's invite / Resend activation / Send password reset
  links now go to `/set-password?token_hash=…&type=invite|magiclink|recovery`; the page calls `verifyOtp` only
  when the person presses **Continue**. A WhatsApp preview or an email scanner that opens the link uses nothing.
  Proven live 2026-10-14 with a throwaway login (no role, deleted after): each type verifies once (200 +
  session); a second use answers `403 otp_expired`.
- The **Forgot password email** still uses the provider's own `{{ .ConfirmationURL }}` (consumed on open).
  To make it scanner-safe too, change the Reset password email template's link to
  `{{ .SiteURL }}/set-password?token_hash={{ .TokenHash }}&type=recovery` — an auth setting, Paul's call,
  only after this branch is live.
- A used / expired link (`#error_code=otp_expired`, or a failed Continue) shows `EXPIRED_LINK_COPY` with the
  scanner line and what to do (ask for a new link / Forgot password).
- ⚠️ Found 2026-10-14: the project has **no custom SMTP** (`smtp_host` empty) and `rate_limit_email_sent` = 2
  per hour. Supabase's built-in mailer only delivers to the project's own org members, so the Forgot password
  email may never reach a salesperson. The Team page's copy-the-link buttons do not depend on email.

## 3. Trial team member

- Switch on each salesperson row → fn `admin-users` `team_set_trial` → `app_metadata.trial_team_member`
  (merged; no table change; audited `trial_member_on` / `trial_member_off`). Book owner and admins refused.
- On: the onboarding badge and panel are hidden and the row reads **Trial · can sell** (or **Trial · <the
  restriction>** if suspended / ended — the switch never hides that). Off: the checklist shows exactly as it was.
- Display only. Selling is still decided by `salesperson_onboarding_missing` (account restrictions), unchanged.
  No onboarding data is read, changed or deleted.

## 4. The name on your messages (2026-10-14)

- One rule: `src/lib/messageName.ts`. Stored on `profiles.message_name` (+ `message_name_set_at`; CHECK 1–40 characters, one
  line — migration `20261026090000`). RLS already lets a person update only their own profile row.
- **First login:** `MessageNameDialog` (mounted once in `AppLayout`) asks *"What name should we use on your messages?"* — one
  field, not onboarding — after any temporary-password change (`ProtectedRoute` sends a must-change user to /set-password first).
  Skip → the first part of the person's OWN email is used and the box asks again at the next login (a sessionStorage mark).
- **Edit later:** account menu → *Name on my messages* (desktop `UserMenu`, phone More menu).
- ⛔ **Never another person's name.** The sender is the person who queued (`outreach_leads.queued_by_user_id`, stamped by the admin
  queue writes and by `sales_queue_opener`) or pressed send (the caller). No sender → the send refuses. `_shared/sender-name.ts`
  never reads the owner, the assignee or the book owner.
- "Onboarding must not show for team members": a salesperson sees only `NotReadyToSellBanner` for a genuine account restriction
  (no role, login, suspended, ended) — never the checklist (Paul's Team-page record; a Trial member's is hidden there too).

### 4a. Paul approves a salesperson's name (2026-10-27, migration 20261128100000)

- `profiles.message_name` stays THE name every sender signs with; it changes only when an admin approves. A salesperson's
  typed name waits in `message_name_pending` (+ `_pending_at`, same CHECK). ⛔ Enforced by trigger
  `trg_profiles_message_name_approval`: a signed-in non-admin's write to `message_name` (an old cached app, a hand-made request)
  is moved into the waiting slot and the approved name kept. The service role and admins write as before.
- Team page → *Message names waiting for your approval* (`MessageNameApprovals`, only while something waits): Approve / Reject
  → `review_message_name(_user_id, _approve)` (admin only, anon revoked).
- A person whose ONLY name is still waiting has no name: `senderMessageName` returns '' (not the email fallback), so a send that
  needs `{{sender_name}}` refuses; the hook signature (`senderChosenName`, `useMyMessageName`) reads the approved name only;
  the Inbox says "Your name is waiting for approval".
- Names already set on 2026-10-27 stayed approved (in use). Tests: `scripts/message-name-approval.test.ts`,
  `supabase/tests/message-name-approval.sql` (11 checks, rolled back; 11/11 on the live schema).

## 5. ai_visibility_report_offer (2026-10-14)

Marketing, English, submitted to Meta 2026-10-14 and wired in as approved. Rules: `src/lib/reportOfferTemplate.ts`.

| {{n}} | var | value |
|---|---|---|
| 1 | `name_or_there` | the business name (greeting form), "there" when blank |
| 2 | `town` | the town the lead's AI check SEARCHED (`ai_audits.location_text` — what was actually asked) |
| 3 | `competitors` | the check's missed-search rivals, "A, B and C" / "A and B" / "A" (`formatCompetitors`) |
| 4 | `visibility_score` | the quick check's overall AI visibility (`scoreHookRun` percent — the report's figure), "66%" |
| 5 | `audit_url` | `findable.live/r/<code>` (no preview flag) |
| 6 | `sender_name` | the sending person's own message name |

- **Not queueable** without a finished check, competitors, a score (a complete six-result quick check only) and the report link,
  or when the lead was named (6/6 → `hook_no_visibility_gap`; the rivals always come from a MISSED search). Checked BEFORE
  queueing by `process-whatsapp-queue` mode `report_offer_check` (both roles; a salesperson only for their own leads) — the
  queue dialog shows who can get it and why not (`ReportOfferPreviewBox`), the batch result lists the refused leads with names,
  and the single-lead control refuses with the reason. The drip checks again and dequeues with `report_offer_<reason>`.
- **Warnings, never a block:** outside MY / SG / UK, or a trade that is not a language school.
- **Country rules** are the existing ones: cold template → `outreach_country_settings` switch, caps and local send hours;
  suppression and the opener contact guard apply. Sales bulk-queue it through `sales_queue_opener` (now accepts it).
- **Meta status:** the drip reads Meta's live status (`template-status.ts`) before sending it; PENDING / REJECTED / PAUSED /
  DISABLED / NOT_FOUND → the lead leaves the queue as `template_<status>`, nothing retries. A send Meta refuses as template
  unavailable (132001/132015/132016/132007) or wrong variables (132000) also leaves the queue (`template_unavailable` /
  `template_vars_mismatch`) — for every template, not only this one. The lead's WhatsApp box says it in words (`queueDropWords`).
- **UK-worded templates** (`explain_offer`, `explain_offer_v2`, `re_engage`, `booking_switch_barbers`) are refused for any
  number that is not a UK mobile, in both senders (`uk_template_wrong_country`).
- Nothing was sent to test it. Tests: `scripts/report-offer-template.test.ts`.
