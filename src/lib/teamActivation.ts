/* RESEND ACTIVATION / SEND PASSWORD RESET — the one rule (2026-10-08). Used by fn admin-users (server) and the Team page (UI).
 * Relative imports only: an edge function reaches this file.
 *
 * "Activated" means the salesperson CHOSE A PASSWORD — read through team_password_is_set: the
 * password_set_at stamp the set-password page writes, or a session that signed in BY password.
 * ⛔ Never "auth.users holds a hash" (Finn, 2026-10-08: the provider stores a random placeholder hash on an
 * invited user, so a person who never chose anything reads as activated) and never last_sign_in_at (the
 * invite link signs them in by itself; a mail scanner opening it counts).
 * ⛔ Positive allowlist: a link is issued ONLY when passwordSet === false. Unknown (null) is refused —
 * a login link for an account that may be live is impersonation, not a convenience. */

/** Where every recovery link (invite, resend, reset, forgot-password email) lands. */
export const SET_PASSWORD_PATH = '/set-password';
export const RESEND_MAX_PER_HOUR = 5;
export const RESET_MAX_PER_HOUR = 5;

export type RecoveryKind = 'activation_resent' | 'password_reset_sent';

export type ResendRefusal =
  | 'bad_user' | 'not_found' | 'not_sales' | 'not_active' | 'suspended' | 'banned' | 'no_email'
  | 'already_activated' | 'not_activated' | 'state_unknown' | 'rate_limited';

export interface ResendFacts {
  member: { status: string; suspended_at: string | null; is_book_owner: boolean } | null;
  role: 'admin' | 'sales' | null;
  email: string | null;
  banned: boolean;
  /** true = has a password, false = never set one, null = could not be read. */
  passwordSet: boolean | null;
  /** Recovery links already made for this person in the last hour, of the kind being asked for. */
  resendsLastHour: number;
}

/** Why a fresh activation must NOT be issued — null means go ahead. */
export function resendRefusal(f: ResendFacts): ResendRefusal | null {
  if (!f.member) return 'not_found';
  if (f.role !== 'sales' || f.member.is_book_owner) return 'not_sales';
  if (f.member.status !== 'active') return 'not_active';
  if (f.member.suspended_at) return 'suspended';
  if (f.banned) return 'banned';
  if (!f.email) return 'no_email';
  if (f.passwordSet === true) return 'already_activated';
  if (f.passwordSet !== false) return 'state_unknown';
  if (f.resendsLastHour >= RESEND_MAX_PER_HOUR) return 'rate_limited';
  return null;
}

/** Why a PASSWORD RESET must not be issued — it needs a person who really has chosen a password. */
export function resetRefusal(f: ResendFacts): ResendRefusal | null {
  if (!f.member) return 'not_found';
  if (f.role !== 'sales' || f.member.is_book_owner) return 'not_sales';
  if (f.member.status !== 'active') return 'not_active';
  if (f.member.suspended_at) return 'suspended';
  if (f.banned) return 'banned';
  if (!f.email) return 'no_email';
  if (f.passwordSet === false) return 'not_activated';
  if (f.passwordSet !== true) return 'state_unknown';
  if (f.resendsLastHour >= RESET_MAX_PER_HOUR) return 'rate_limited';
  return null;
}

/** The Team row's pill: only a confirmed "no password yet" is pending. */
export function activationPending(passwordSet: boolean | null | undefined): boolean {
  return passwordSet === false;
}

export const RESEND_ERRORS: Record<string, string> = {
  bad_user: 'That is not a valid team member.',
  not_found: 'That team member no longer exists.',
  not_sales: 'Activation can only be resent to a salesperson.',
  not_active: 'Their engagement has ended. Re-enable them first.',
  suspended: 'Their Sales access is suspended. Reactivate them first.',
  banned: 'Their login is switched off. Re-enable them first.',
  no_email: 'They have no email on their account.',
  not_activated: 'They have not activated yet, so there is no password to reset. Use Resend activation.',
  already_activated: 'They have already activated. If they cannot sign in, ask them to use “Forgot password” on the sign-in page.',
  state_unknown: 'Could not tell whether they have activated, so no link was made. Try again.',
  rate_limited: 'Too many new activations for this person in the last hour. Wait a little, or use the last link.',
  reset_failed: 'The sign-in provider could not make a reset link. Nothing was changed. Try again.',
  link_failed: 'The sign-in provider could not make a link. Nothing was changed. Try again.',
};

/** The public expired-link page cannot know who the visitor is, so it must not hint at an account. */
export const EXPIRED_LINK_COPY = {
  title: 'This link has expired or was already used',
  body: 'If you have not set up your account yet, ask your admin for a new activation link. If you already have an account, use Forgot password.',
};
