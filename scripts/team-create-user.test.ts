/* TEAM ACCESS TIDY (2026-10-14): an admin creates a team member with a temporary password, the first-login
 * change, the scanner-safe links and the Trial team member switch. The create flow is injected, so an
 * in-memory "world" stands in for auth + roles + team + audit + logs; the admin gate, the logs and the UI are
 * pinned by reading the source. */
import fs from 'node:fs';
import path from 'node:path';
import { createTeamUser, type CreateUserDeps } from '../supabase/functions/_shared/team-create-user.ts';
import {
  CREATE_USER_ERRORS, generateTempPassword, isTrialMember, linkErrorFromUrl, mustChangePassword, PASSWORD_MIN_LENGTH,
  PASSWORD_PROBLEM_WORDS, passwordProblem, readLinkParams, redactSecret, scannerSafeLink, trialOnboardingView, validateCreateUser,
} from '../src/lib/teamAccounts.ts';
import { EXPIRED_LINK_COPY } from '../src/lib/teamActivation.ts';
import { canOpenRoute } from '../src/lib/access.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const root = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const ADMIN = '22222222-2222-2222-2222-222222222222';
const PW = 'Tq7mZr4xWv9kHs2p';

function world(over: Partial<{ createError: string; roleError: string; memberError: string }> = {}) {
  const w = {
    users: [] as { id: string; email: string; password: string; app: Record<string, unknown>; meta: Record<string, unknown> }[],
    roles: [] as { user_id: string; role: string }[],
    members: [] as { user_id: string; display_name: string; invited_by: string }[],
    audit: [] as Record<string, unknown>[],
    logs: [] as string[],
    deleted: [] as string[],
  };
  let n = 0;
  const deps: CreateUserDeps = {
    createAuthUser: async ({ email, password, displayName, appMetadata }) => {
      if (over.createError) return { id: null, error: over.createError };
      if (w.users.some((u) => u.email === email)) return { id: null, error: 'A user with this email address has already been registered' };
      const id = `00000000-0000-0000-0000-00000000000${++n}`;
      w.users.push({ id, email, password, app: appMetadata, meta: { display_name: displayName } });
      return { id, error: null };
    },
    deleteAuthUser: async (id) => { w.deleted.push(id); w.users = w.users.filter((u) => u.id !== id); w.roles = w.roles.filter((r) => r.user_id !== id); },
    writeRole: async (id, role) => { if (over.roleError) return over.roleError; w.roles.push({ user_id: id, role }); return null; },
    writeMember: async (id, display_name, invited_by) => { if (over.memberError) return over.memberError; w.members.push({ user_id: id, display_name, invited_by }); return null; },
    audit: async (ev) => { w.audit.push(ev as unknown as Record<string, unknown>); },
  };
  return { w, deps };
}

const body = (o: Record<string, unknown> = {}) => ({ name: 'Trial Rep', email: 'Trial.Rep@Example.com', password: PW, ...o });

(async () => {
  /* ── Password rule ── */
  ok(passwordProblem('short1') === 'too_short' && passwordProblem(undefined) === 'too_short', 'P1. under the minimum is refused');
  ok(PASSWORD_MIN_LENGTH >= 12, 'P2. the minimum is at least 12 characters');
  ok(passwordProblem('abcdefghijklmnop') === 'needs_letter_and_number' && passwordProblem('1234567890123') === 'needs_letter_and_number', 'P3. needs a letter and a number');
  ok(passwordProblem('aaaaaaaaaaaa1') === 'too_simple' && passwordProblem('Password2026!') === 'too_simple' && passwordProblem('abcd1234abcd') === 'too_simple', 'P4. repeats, common words and simple runs are refused');
  ok(passwordProblem('jamie2026xyzqw', { email: 'jamie@example.com' }) === 'contains_email', 'P5. the email name inside the password is refused');
  ok(passwordProblem(PW) === null && passwordProblem('correct horse battery staple 9') === null, 'P6. a good password passes');
  ok(passwordProblem('x1'.repeat(40)) === 'too_long', 'P7. over 72 bytes is refused (bcrypt would silently cut it)');
  const gens = Array.from({ length: 200 }, () => generateTempPassword());
  ok(gens.every((g) => passwordProblem(g) === null && g.length === 16) && new Set(gens).size === 200, 'P8. 200 generated passwords all pass the rule and are all different');
  ok(!gens.some((g) => /[0O1lI]/.test(g)), 'P9. generated passwords avoid look-alike characters');

  /* ── Validation and defaults ── */
  const v = validateCreateUser(body());
  ok(v.ok && v.value.role === 'sales' && v.value.mustChangePassword === true && v.value.email === 'trial.rep@example.com', 'V1. defaults: role salesperson, first-login change ON, email lower-cased');
  ok(!validateCreateUser(body({ role: 'admin' })).ok && (validateCreateUser(body({ role: 'admin' })) as { error: string }).error === 'admin_not_confirmed', 'V2. admin is refused unless confirmed');
  const va = validateCreateUser(body({ role: 'admin', confirm_admin: true }));
  ok(va.ok && va.value.role === 'admin', 'V3. admin only with an explicit confirm');
  ok((validateCreateUser(body({ role: 'owner' })) as { error: string }).error === 'bad_role' && (validateCreateUser(body({ role: 'superuser' })) as { error: string }).error === 'bad_role', 'V4. any other role is refused');
  ok(validateCreateUser(body({ must_change_password: false })).ok && (validateCreateUser(body({ must_change_password: false })) as { value: { mustChangePassword: boolean } }).value.mustChangePassword === false, 'V5. the admin can switch the first-login change off (only an explicit false)');
  ok((validateCreateUser(body({ must_change_password: 'no' })) as { value: { mustChangePassword: boolean } }).value.mustChangePassword === true, 'V6. anything but an explicit false keeps the change ON');
  ok((validateCreateUser(body({ password: 'weak' })) as { error: string }).error === 'too_short' && (validateCreateUser(body({ email: 'nope' })) as { error: string }).error === 'bad_email' && (validateCreateUser(body({ name: '' })) as { error: string }).error === 'bad_name', 'V7. bad password / email / name refused');
  ok(Object.keys(PASSWORD_PROBLEM_WORDS).every((k) => CREATE_USER_ERRORS[k]) && ['admin_not_confirmed', 'already_exists', 'role_write_failed', 'create_failed', 'weak_password', 'bad_role'].every((k) => CREATE_USER_ERRORS[k]), 'V8. every refusal has plain words');

  /* ── The flow ── */
  {
    const { w, deps } = world();
    const r = await createTeamUser(deps, ADMIN, body(), () => new Date('2026-10-14T10:00:00Z'));
    ok(r.ok && w.users.length === 1 && w.users[0].password === PW, 'C1. creates the auth user with the temporary password');
    ok(w.roles.length === 1 && w.roles[0].role === 'sales' && w.members.length === 1 && w.members[0].invited_by === ADMIN, 'C2. writes the sales role and the team row (who added them)');
    ok(w.users[0].app.must_change_password === true && w.users[0].app.temp_password_set_at === '2026-10-14T10:00:00.000Z' && w.users[0].app.created_by_admin === ADMIN, 'C3. app_metadata carries the first-login flag, when and by whom');
    ok(w.audit.length === 1 && w.audit[0].actor === ADMIN && w.audit[0].target === w.users[0].id && w.audit[0].role === 'sales', 'C4. ONE audit entry: who created whom, which role');
    ok(!JSON.stringify(w.audit).includes(PW) && !JSON.stringify(r).includes(PW) && !JSON.stringify(w.users[0].app).includes(PW) && !JSON.stringify(w.users[0].meta).includes(PW), 'C5. the password is in NO audit row, NO response, NO metadata');
    const again = await createTeamUser(deps, ADMIN, body());
    ok(!again.ok && again.error === 'already_exists' && again.status === 409 && w.roles.length === 1, 'C6. an existing email is refused, nothing else written');
  }
  {
    const { w, deps } = world({ roleError: 'insert failed' });
    const r = await createTeamUser(deps, ADMIN, body());
    ok(!r.ok && r.error === 'role_write_failed' && w.users.length === 0 && w.deleted.length === 1 && w.audit.length === 0, 'C7. a failed role write removes the just-made login (no half account) and writes no audit');
  }
  {
    const { w, deps } = world({ memberError: 'insert failed' });
    const r = await createTeamUser(deps, ADMIN, body());
    ok(!r.ok && r.error === 'role_write_failed' && w.users.length === 0 && w.roles.length === 0, 'C8. a failed team-row write removes the login and its role');
  }
  {
    const { deps } = world({ createError: `Password ${PW} is known to be weak` });
    const r = await createTeamUser(deps, ADMIN, body());
    ok(!r.ok && r.error === 'weak_password' && !JSON.stringify(r).includes(PW), 'C9. a provider error quoting the password is redacted before it goes anywhere');
  }
  {
    const { w, deps } = world();
    const r = await createTeamUser(deps, ADMIN, body({ role: 'admin' }));
    ok(!r.ok && r.error === 'admin_not_confirmed' && w.users.length === 0, 'C10. an unconfirmed admin request creates nothing');
  }
  ok(redactSecret('x secret y secret', 'secret') === 'x [redacted] y [redacted]' && redactSecret('abc', '') === 'abc', 'C11. redactSecret removes every copy');

  /* ── First login ── */
  const temp = '2026-10-14T10:00:00.000Z';
  ok(mustChangePassword({ app_metadata: { must_change_password: true, temp_password_set_at: temp }, user_metadata: {} }), 'F1. a fresh temporary-password user must change');
  ok(!mustChangePassword({ app_metadata: { must_change_password: true, temp_password_set_at: temp }, user_metadata: { password_set_at: '2026-10-14T10:05:00.000Z' } }), 'F2. choosing a password after the temporary one clears it');
  ok(mustChangePassword({ app_metadata: { must_change_password: true, temp_password_set_at: temp }, user_metadata: { password_set_at: '2026-10-01T09:00:00.000Z' } }), 'F3. an OLDER password_set_at (before the temp one) does not clear it');
  ok(!mustChangePassword({ app_metadata: { must_change_password: false, temp_password_set_at: temp } }) && !mustChangePassword({ app_metadata: {} }) && !mustChangePassword(null), 'F4. switched off / ordinary users / no user: no forced change');
  ok(mustChangePassword({ app_metadata: { must_change_password: true }, user_metadata: { password_set_at: 'garbage' } }), 'F5. unreadable stamps keep the change owed');
  const pr = strip(read('src/components/ProtectedRoute.tsx'));
  ok(/mustChangePassword\(user\)/.test(pr) && /Navigate to="\/set-password"/.test(pr), 'F6. every protected page sends a must-change user to /set-password first');
  const app = read('src/App.tsx');
  const setPwRoute = app.indexOf('path="/set-password"'), shell = app.indexOf('<ProtectedRoute>');
  ok(setPwRoute > 0 && shell > 0 && setPwRoute < shell, 'F7. /set-password sits outside ProtectedRoute (no redirect loop)');
  const sp = strip(read('src/pages/SetPassword.tsx'));
  ok(/mustChangePassword\(user\)/.test(sp) && /password_set_at/.test(sp) && /passwordProblem\(pw/.test(sp), 'F8. the set-password page knows first login, stamps password_set_at and uses the ONE password rule');
  ok(/different from the temporary one/.test(sp), 'F9. re-using the temporary password gets a plain message');

  /* ── Links ── */
  const link = scannerSafeLink('https://app.leadfinderos.com/set-password', 'abcDEF123_-xyz789', 'recovery');
  ok(link === 'https://app.leadfinderos.com/set-password?token_hash=abcDEF123_-xyz789&type=recovery', 'L1. our link points at OUR page with the token hash');
  const lp = readLinkParams(new URL(link).search);
  ok(!!lp && lp.type === 'recovery' && lp.tokenHash === 'abcDEF123_-xyz789', 'L2. the page reads it back');
  ok(readLinkParams('?token_hash=abcDEF123456&type=signup') === null && readLinkParams('?token_hash=<script>&type=invite') === null && readLinkParams('') === null, 'L3. only our three types and a clean token are accepted');
  ok(linkErrorFromUrl('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid', '') === 'otp_expired' && linkErrorFromUrl('#access_token=x', '') === null, 'L4. a used / expired provider link is recognised; a good one is not');
  ok(/verifyOtp\(\{ token_hash: linkParams\.tokenHash, type: linkParams\.type \}\)/.test(sp) && /onClick=\{\(\) => void continueWithLink\(\)\}/.test(sp), 'L5. the token is used ONLY when the person presses Continue (a scanner opening the page uses nothing)');
  ok(/if \(providerError \|\| !user\) return expired/.test(sp) && /EXPIRED_LINK_COPY\.scanner/.test(sp), 'L6. a failed link shows the friendly page, even if someone is signed in on that browser');
  ok(/open links to check them/.test(EXPIRED_LINK_COPY.scanner) && /ask for a new link/.test(EXPIRED_LINK_COPY.scanner), 'L7. the friendly message explains scanners and says what to do');
  const fn = strip(read('supabase/functions/admin-users/index.ts'));
  ok((fn.match(/safeLink\(/g) ?? []).length >= 2 && /const safeLink = /.test(fn) &&!/link: link\.properties\?\.action_link/.test(fn), 'L8. invite, resend activation and password reset all hand out the scanner-safe link');
  ok(/type: kind === 'password_reset_sent' \? 'recovery' : 'magiclink'/.test(fn) && /safeLink\(link\.properties, 'invite'\)/.test(fn), 'L9. each link carries the type it was made as');
  ok(!/expires?_in|otp_exp|86400/.test(fn), 'L10. link expiry is NOT set in code (it is the project auth setting)');

  /* ── Admin only; salespeople cannot ── */
  const gate = fn.indexOf("if (!roleData)");
  const create = fn.indexOf("action === 'team_create_user'"), trial = fn.indexOf("action === 'team_set_trial'");
  ok(gate > 0 && create > gate && trial > gate, 'A1. both new actions sit AFTER the admin role check (a salesperson gets 403 before reaching them)');
  ok(/\.eq\('role', 'admin'\)/.test(fn.slice(0, gate)) && /recordDenial\(serviceClient, adminUserId, 'admin-users'\)/.test(fn.slice(0, gate + 400)), 'A2. the gate reads user_roles for admin and records a denial');
  ok(!canOpenRoute('sales', '/team') && canOpenRoute('admin', '/team'), 'A3. a salesperson cannot open the Team page');
  ok(!/role:\s*body\.role/.test(fn) && /createTeamUser\(deps, adminUserId, body\)/.test(fn), 'A4. the role is validated by the one rule, never written from the body directly');

  /* ── No password in logs ── */
  const createBlock = fn.slice(create, trial);
  const logLines = createBlock.split('\n').filter((l) => /console\.(log|error|warn|info)/.test(l));
  ok(logLines.length > 0 && logLines.every((l) => !/password\b(?!_)/.test(l.replace(/must_change_password/g, ''))), 'N1. no log line in the create action mentions the password');
  ok(!/password/.test(createBlock.match(/jsonResponse\(\{ ok: true[^\n]*/)?.[0]?.replace(/must_change_password/g, '') ?? 'password'), 'N2. the success response carries no password');
  ok(/console\.log\(JSON\.stringify\(\{\s*level: 'info',\s*admin_user_id: adminUserId,\s*action,\s*timestamp/.test(fn), 'N3. the request log line names only the action (never the body)');
  const shared = strip(read('supabase/functions/_shared/team-create-user.ts'));
  ok(!/console\./.test(shared), 'N4. the create flow itself never logs');
  const ui = strip(read('src/components/team/AddTeamMember.tsx'));
  ok(!/console\.|localStorage|sessionStorage|usePersistedState/.test(ui), 'N5. the Team form never logs or saves the password in the browser');
  ok(/setCreated\(null\)/.test(ui) && /setPassword\(''\)/.test(ui) && /only time the password is shown/.test(ui), 'N6. the password is shown once, the input is cleared, and Done hides it');
  ok(/useState<TeamRole>\('sales'\)/.test(ui) && /useState\(true\)/.test(ui), 'N7. the form defaults to Salesperson with the first-login change ON');

  /* ── Trial team member ── */
  ok(isTrialMember({ trial_team_member: true }) && !isTrialMember({ trial_team_member: 'yes' }) && !isTrialMember(null), 'T1. only an explicit true is a trial member');
  ok(trialOnboardingView(false, true, null).showChecklist && trialOnboardingView(false, false, 'Login disabled').showChecklist, 'T2. everyone else keeps the checklist (e.g. Finn)');
  const tv = trialOnboardingView(true, true, null);
  ok(!tv.showChecklist && tv.label === 'Trial · can sell' && tv.tone === 'green', 'T3. a trial member who can sell: checklist hidden, shown as able to sell');
  const tr = trialOnboardingView(true, false, 'Sales access suspended');
  ok(!tr.showChecklist && /suspended/.test(tr.label ?? '') && tr.tone === 'red', 'T4. the switch never hides a suspension or an ended login');
  const trialBlock = fn.slice(trial, fn.indexOf("action === 'team_new_link'"));
  ok(/app_metadata: \{ trial_team_member: body\.trial \}/.test(trialBlock) && !/salesperson_onboarding/.test(trialBlock), 'T5. the switch writes ONE app_metadata key and never touches onboarding records');
  ok(/kind: body\.trial \? 'trial_member_on' : 'trial_member_off'/.test(trialBlock) && /typeof body\.trial !== 'boolean'/.test(trialBlock), 'T6. audited; only a real boolean accepted');
  ok(/is_book_owner \|\| isAdminRow/.test(trialBlock), 'T7. only a salesperson can be a trial member');
  const team = strip(read('src/pages/Team.tsx'));
  ok(/trialOnboardingView\(m\.trial === true, summary\.readyToSell, summary\.inactiveReason\)/.test(team) && /m\.trial !== true && \(/.test(team), 'T8. the Team page hides both the badge button and the panel for a trial member');
  ok(/team_set_trial/.test(team) && /aria-label="Trial team member"/.test(team), 'T9. each salesperson row has the Trial team member switch');
  const missingSql = read('supabase/migrations/20261012120000_selling_gate_account_only.sql');
  ok(!/trial/i.test(missingSql), 'T10. the selling gate is unchanged (the checklist still never blocks selling)');

  /* ── Existing Team actions unchanged ── */
  for (const a of ['team_password_reset', 'team_new_link', 'team_suspend', 'team_unsuspend', 'team_disable', 'team_reactivate', 'team_invite', 'team_reassign_all']) {
    ok(new RegExp(`action === '${a}'`).test(fn), `E. admin-users still handles ${a}`);
  }
  ok(/Send password reset/.test(team) && /Suspend Sales access/.test(team) && />Disable</.test(team), 'E2. the Team page still has Send password reset, Suspend Sales access and Disable');

  console.log(f ? `\n${f} FAILURE(S)` : '\nALL PASS');
  process.exit(f ? 1 : 0);
})();
