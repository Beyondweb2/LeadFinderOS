/* RESEND ACTIVATION — the one rule (2026-10-08). Used by fn admin-users (server) and the Team page (UI).
 * Relative imports only: an edge function reaches this file.
 *
 * "Activated" means the salesperson CHOSE A PASSWORD (auth.users holds a hash; read through
 * team_password_is_set). Never last_sign_in_at: the invite link signs them in by itself, and a mail
 * scanner that opens the link counts as a sign-in while the person never set anything.
 * ⛔ Positive allowlist: a link is issued ONLY when passwordSet === false. Unknown (null) is refused —
 * a login link for an account that may be live is impersonation, not a convenience. */

export const RESEND_MAX_PER_HOUR = 5;

export type ResendRefusal =
  | 'bad_user' | 'not_found' | 'not_sales' | 'not_active' | 'suspended' | 'banned' | 'no_email'
  | 'already_activated' | 'state_unknown' | 'rate_limited';

export interface ResendFacts {
  member: { status: string; suspended_at: string | null; is_book_owner: boolean } | null;
  role: 'admin' | 'sales' | null;
  email: string | null;
  banned: boolean;
  /** true = has a password, false = never set one, null = could not be read. */
  passwordSet: boolean | null;
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
  already_activated: 'They have already activated. If they cannot sign in, ask them to use “Forgot password” on the sign-in page.',
  state_unknown: 'Could not tell whether they have activated, so no link was made. Try again.',
  rate_limited: 'Too many new activations for this person in the last hour. Wait a little, or use the last link.',
  link_failed: 'The sign-in provider could not make a link. Nothing was changed. Try again.',
};
