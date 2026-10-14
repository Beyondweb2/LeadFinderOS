/* TEAM ACCOUNTS — the one rule file for an admin CREATING a team member with a temporary password, the
 * first-login password change, the Trial team member switch, and the scanner-safe link (2026-10-14).
 * Used by fn admin-users (server), the Team page, the set-password page and ProtectedRoute.
 * Relative imports only: an edge function reaches this file. No React, no Supabase client.
 *
 * ⛔ A PASSWORD IS NEVER STORED, LOGGED, ECHOED OR PUT IN AN ERROR. The admin's browser holds it once; the
 * server hands it straight to the auth provider (which stores only a hash) and returns nothing of it.
 * ⛔ The default role is SALES. An admin account is only made when the request names it AND confirms it.
 * ⛔ The first-login flag lives in app_metadata (only the service role can write it); the user clears it by
 * choosing a new password, which stamps user_metadata.password_set_at AFTER the temporary one was set. */

/** One password rule for a temporary password AND a password a person chooses for themselves. */
export const PASSWORD_MIN_LENGTH = 12;
/** The auth provider hashes with bcrypt, which ignores everything after 72 bytes. */
export const PASSWORD_MAX_LENGTH = 72;

export type PasswordProblem = 'too_short' | 'too_long' | 'needs_letter_and_number' | 'too_simple' | 'contains_email';

export const PASSWORD_PROBLEM_WORDS: Record<PasswordProblem, string> = {
  too_short: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
  too_long: `Use at most ${PASSWORD_MAX_LENGTH} characters.`,
  needs_letter_and_number: 'Use at least one letter and one number.',
  too_simple: 'That password is too easy to guess. Avoid repeated characters and simple runs like 123456 or abcdef.',
  contains_email: 'Do not use their email address in the password.',
};

const COMMON = ['password', 'qwerty', 'letmein', 'welcome', 'findable', 'leadfinder', 'admin', 'iloveyou'];

/** Why a password is not acceptable — null means it is fine. Never returns or quotes the password. */
export function passwordProblem(pw: unknown, opts: { email?: string | null } = {}): PasswordProblem | null {
  if (typeof pw !== 'string' || pw.length < PASSWORD_MIN_LENGTH) return 'too_short';
  if (new TextEncoder().encode(pw).length > PASSWORD_MAX_LENGTH) return 'too_long';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'needs_letter_and_number';
  const lower = pw.toLowerCase();
  if (new Set(lower).size < 5) return 'too_simple';
  if (/(.)\1{3,}/.test(lower)) return 'too_simple';
  if (/0123|1234|2345|3456|4567|5678|6789|abcd|bcde|cdef|qwer|asdf/.test(lower) && new Set(lower).size < 10) return 'too_simple';
  /* A common word plus a few characters ("Password2026!") is guessable; the same word inside a long phrase is not. */
  if (COMMON.some((w) => lower.includes(w) && pw.length - w.length < 8)) return 'too_simple';
  const local = String(opts.email ?? '').split('@')[0]?.toLowerCase() ?? '';
  if (local.length >= 4 && lower.includes(local)) return 'contains_email';
  return null;
}

/* No 0/O, 1/l/I: the admin reads it out or types it into a message. */
const ALPHA = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
export const GENERATED_PASSWORD_LENGTH = 16;

/** A random temporary password that always passes passwordProblem. `rand` is injectable for tests. */
export function generateTempPassword(rand: (n: number) => Uint32Array = (n) => crypto.getRandomValues(new Uint32Array(n))): string {
  const all = ALPHA + DIGITS;
  for (let attempt = 0; attempt < 20; attempt++) {
    const r = rand(GENERATED_PASSWORD_LENGTH);
    const chars = Array.from(r, (x) => all[x % all.length]);
    /* Guarantee a letter and a number in fixed-by-randomness slots. */
    chars[r[0] % GENERATED_PASSWORD_LENGTH] = DIGITS[r[1] % DIGITS.length];
    const pw = chars.join('');
    if (passwordProblem(pw) === null) return pw;
  }
  throw new Error('could not generate a password');
}

/** Replace any copy of the secret inside text (an upstream error message) before it goes anywhere. */
export function redactSecret(text: string, secret: string | null | undefined): string {
  if (!secret) return text;
  return text.split(secret).join('[redacted]');
}

/* ───────────────────────── Creating a team member ───────────────────────── */

export type TeamRole = 'sales' | 'admin';

export type CreateUserRefusal =
  | 'bad_name' | 'bad_email' | 'bad_role' | 'admin_not_confirmed' | PasswordProblem;

export interface CreateUserInput {
  name: string;
  email: string;
  role: TeamRole;
  mustChangePassword: boolean;
  password: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validate the Team page's request. Role defaults to sales; must-change defaults to ON. */
export function validateCreateUser(body: Record<string, unknown>): { ok: true; value: CreateUserInput } | { ok: false; error: CreateUserRefusal } {
  const name = String(body.name ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!name || name.length > 60) return { ok: false, error: 'bad_name' };
  if (!EMAIL_RE.test(email) || email.length > 254) return { ok: false, error: 'bad_email' };
  const rawRole = body.role === undefined || body.role === null || body.role === '' ? 'sales' : body.role;
  if (rawRole !== 'sales' && rawRole !== 'admin') return { ok: false, error: 'bad_role' };
  if (rawRole === 'admin' && body.confirm_admin !== true) return { ok: false, error: 'admin_not_confirmed' };
  const problem = passwordProblem(body.password, { email });
  if (problem) return { ok: false, error: problem };
  /* Positive match: only an explicit false switches the first-login change off. */
  const mustChangePassword = body.must_change_password !== false;
  return { ok: true, value: { name, email, role: rawRole, mustChangePassword, password: body.password as string } };
}

export const CREATE_USER_ERRORS: Record<string, string> = {
  ...PASSWORD_PROBLEM_WORDS,
  bad_name: 'Give them a name (up to 60 characters).',
  bad_email: 'That is not a valid email address.',
  bad_role: 'Pick Salesperson or Admin.',
  admin_not_confirmed: 'Tick the box to confirm you want to give them full admin access.',
  already_exists: 'That email already has an account. Use Send password reset on their row instead.',
  weak_password: 'The sign-in provider refused that password. Try a longer one.',
  create_failed: 'The sign-in provider could not create the account. Nothing was saved. Try again.',
  role_write_failed: 'The account could not be given its role, so it was removed again. Nothing was saved. Try again.',
};

/* ───────────────────────── First login ───────────────────────── */

type Meta = Record<string, unknown> | null | undefined;
interface UserLike { app_metadata?: Meta; user_metadata?: Meta }

/** Must this person choose a new password before using the app? Only an explicit flag set by an admin
 *  with a temporary password counts, and choosing a password afterwards clears it. */
export function mustChangePassword(user: UserLike | null | undefined): boolean {
  const app = user?.app_metadata ?? {};
  if (app.must_change_password !== true) return false;
  const tempAt = typeof app.temp_password_set_at === 'string' ? Date.parse(app.temp_password_set_at) : NaN;
  const chosen = user?.user_metadata?.password_set_at;
  const chosenAt = typeof chosen === 'string' ? Date.parse(chosen) : NaN;
  if (Number.isNaN(chosenAt)) return true;
  /* An unreadable temp stamp keeps the change owed (absent never means "done"). */
  if (Number.isNaN(tempAt)) return true;
  return chosenAt <= tempAt;
}

/** app_metadata written when an admin creates the account. Never contains the password. */
export function createdUserAppMetadata(input: Pick<CreateUserInput, 'mustChangePassword'>, actor: string, now: Date): Record<string, unknown> {
  return { must_change_password: input.mustChangePassword, temp_password_set_at: now.toISOString(), created_by_admin: actor };
}

/* ───────────────────────── Trial team member ───────────────────────── */

/** The Trial switch lives in app_metadata.trial_team_member (only the service role writes it). Display only:
 *  it hides the onboarding checklist. Selling is decided by the account restrictions alone, as for everyone. */
export function isTrialMember(app: Meta): boolean {
  return app?.trial_team_member === true;
}

export interface TrialView { showChecklist: boolean; label: string | null; tone: 'green' | 'red' }

/** What the Team row shows for onboarding. A trial member who can sell reads "Trial · can sell"; one who is
 *  restricted still shows the restriction (the switch never hides a suspension or an ended login). */
export function trialOnboardingView(trial: boolean, readyToSell: boolean, inactiveReason: string | null): TrialView {
  if (!trial) return { showChecklist: true, label: null, tone: 'green' };
  if (readyToSell) return { showChecklist: false, label: 'Trial · can sell', tone: 'green' };
  return { showChecklist: false, label: `Trial · ${inactiveReason ?? 'cannot sell right now'}`, tone: 'red' };
}

/* ───────────────────────── Scanner-safe links ───────────────────────── */

export type LinkType = 'invite' | 'magiclink' | 'recovery';

/** A link to OUR set-password page carrying the token hash. Opening it does nothing until the person presses
 *  Continue, so an email scanner or a WhatsApp link preview that fetches the page cannot use the link up. */
export function scannerSafeLink(setPasswordUrl: string, hashedToken: string, type: LinkType): string {
  const u = new URL(setPasswordUrl);
  u.searchParams.set('token_hash', hashedToken);
  u.searchParams.set('type', type);
  return u.toString();
}

/** Read the link the page was opened with. Only the three types we make are accepted. */
export function readLinkParams(search: string): { tokenHash: string; type: LinkType } | null {
  const p = new URLSearchParams(search);
  const tokenHash = p.get('token_hash');
  const type = p.get('type');
  if (!tokenHash || !/^[A-Za-z0-9_-]{10,200}$/.test(tokenHash)) return null;
  if (type !== 'invite' && type !== 'magiclink' && type !== 'recovery') return null;
  return { tokenHash, type };
}

/** The provider's own failure (an old-style link that was already used or has expired) arrives in the hash. */
export function linkErrorFromUrl(hash: string, search: string): string | null {
  const h = new URLSearchParams(hash.replace(/^#/, ''));
  const s = new URLSearchParams(search);
  return h.get('error_code') || s.get('error_code') || h.get('error') || s.get('error') || null;
}
