/* CREATE A TEAM MEMBER WITH A TEMPORARY PASSWORD (2026-10-14). Pure: every read and write is injected, so
 * the same code runs under test with an in-memory store. The caller (fn admin-users) has already proved the
 * caller is an admin. Relative imports only.
 *
 * ⛔ The password goes to the auth provider and NOWHERE else: not into the audit row, not into a log line,
 * not into the response, not into an error (redactSecret runs on every upstream message).
 * ⛔ All-or-nothing: if the role or the team row cannot be written, the account just created is removed
 * again (it is seconds old and owns nothing), so a half-made login never lingers. */
import {
  createdUserAppMetadata, redactSecret, validateCreateUser,
  type CreateUserRefusal, type TeamRole,
} from '../../../src/lib/teamAccounts.ts';

export interface CreateUserDeps {
  /** Create the auth user, email already confirmed, with this password. Returns the new id or the provider's error. */
  createAuthUser(args: { email: string; password: string; displayName: string; appMetadata: Record<string, unknown> }): Promise<{ id: string | null; error: string | null }>;
  /** Remove an auth user this flow just created (compensation only). */
  deleteAuthUser(id: string): Promise<void>;
  writeRole(id: string, role: TeamRole): Promise<string | null>;
  writeMember(id: string, displayName: string, invitedBy: string): Promise<string | null>;
  /** Audit: who created whom, which role, whether the first-login change is on. Never the password. */
  audit(ev: { actor: string; target: string; role: TeamRole; must_change_password: boolean; at: string }): Promise<void>;
}

export type CreateUserResult =
  | { ok: true; status: 200; user_id: string; role: TeamRole; must_change_password: boolean }
  | { ok: false; status: number; error: CreateUserRefusal | 'already_exists' | 'weak_password' | 'create_failed' | 'role_write_failed'; detail?: string };

export async function createTeamUser(deps: CreateUserDeps, actor: string, body: Record<string, unknown>, now: () => Date = () => new Date()): Promise<CreateUserResult> {
  const v = validateCreateUser(body ?? {});
  if (!v.ok) return { ok: false, status: 400, error: v.error };
  const input = v.value;
  const secret = input.password;
  const at = now();
  const created = await deps.createAuthUser({
    email: input.email, password: secret, displayName: input.name,
    appMetadata: createdUserAppMetadata(input, actor, at),
  });
  if (created.error || !created.id) {
    const msg = redactSecret(String(created.error ?? 'no user returned'), secret);
    if (/already|registered|exists/i.test(msg)) return { ok: false, status: 409, error: 'already_exists' };
    if (/password/i.test(msg)) return { ok: false, status: 400, error: 'weak_password', detail: msg };
    return { ok: false, status: 502, error: 'create_failed', detail: msg };
  }
  const id = created.id;
  const rErr = await deps.writeRole(id, input.role);
  const tErr = rErr ? null : await deps.writeMember(id, input.name, actor);
  if (rErr || tErr) {
    await deps.deleteAuthUser(id);
    return { ok: false, status: 500, error: 'role_write_failed', detail: redactSecret(String(rErr ?? tErr), secret) };
  }
  await deps.audit({ actor, target: id, role: input.role, must_change_password: input.mustChangePassword, at: at.toISOString() });
  return { ok: true, status: 200, user_id: id, role: input.role, must_change_password: input.mustChangePassword };
}
