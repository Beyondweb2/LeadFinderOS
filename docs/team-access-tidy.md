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
  `{"mailer_otp_exp": 86400}`). Read live 2026-10-14: **3600 (1 hour)**. Paul's target: **86400 (24 hours,
  the maximum)**. It covers invite, magic link (Resend activation), recovery (Send password reset) and the
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
