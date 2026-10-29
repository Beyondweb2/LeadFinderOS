/* CREATE A UGC LOGIN (Jess) WITH A TEMPORARY PASSWORD — the admin's action in fn ugc-brands. Pure: every read and
 * write is injected, so it is tested with an in-memory store (scripts/ugc-brand-finder.test.ts). Relative imports only.
 *
 * ⛔ A UGC login gets a ugc_members row and NO user_roles row: it has no Findable role, so every Findable policy and
 *    function keeps refusing it. Nothing here may ever write user_roles or team_members.
 * ⛔ The password goes to the auth provider and nowhere else (not the response, not a log, not an error).
 * ⛔ All-or-nothing: if the member row cannot be written, the seconds-old account is removed again. */
import { createdUserAppMetadata, passwordProblem, redactSecret } from '../../../src/lib/teamAccounts.ts';

export interface UgcMemberDeps {
  createAuthUser(args: { email: string; password: string; displayName: string; appMetadata: Record<string, unknown> }): Promise<{ id: string | null; error: string | null }>;
  deleteAuthUser(id: string): Promise<void>;
  writeMember(id: string, displayName: string, senderEmail: string, by: string): Promise<string | null>;
}
export type UgcMemberResult =
  | { ok: true; status: 200; user_id: string }
  | { ok: false; status: number; error: string; detail?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createUgcMember(deps: UgcMemberDeps, actor: string, body: Record<string, unknown>, now: () => Date = () => new Date()): Promise<UgcMemberResult> {
  const name = String(body.name ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  const sender = String(body.sender_email ?? email).trim().toLowerCase();
  if (!name || name.length > 60) return { ok: false, status: 400, error: 'bad_name' };
  if (!EMAIL_RE.test(email) || email.length > 254) return { ok: false, status: 400, error: 'bad_email' };
  if (!EMAIL_RE.test(sender)) return { ok: false, status: 400, error: 'bad_email' };
  const problem = passwordProblem(body.password, { email });
  if (problem) return { ok: false, status: 400, error: problem };
  const secret = String(body.password);
  const created = await deps.createAuthUser({
    email, password: secret, displayName: name,
    appMetadata: { ...createdUserAppMetadata({ mustChangePassword: true }, actor, now()), ugc_member: true },
  });
  if (created.error || !created.id) {
    const msg = redactSecret(String(created.error ?? 'no user returned'), secret);
    if (/already|registered|exists/i.test(msg)) return { ok: false, status: 409, error: 'already_exists' };
    return { ok: false, status: 502, error: 'create_failed', detail: msg };
  }
  const err = await deps.writeMember(created.id, name, sender, actor);
  if (err) {
    await deps.deleteAuthUser(created.id);
    return { ok: false, status: 500, error: 'member_write_failed', detail: redactSecret(err, secret) };
  }
  return { ok: true, status: 200, user_id: created.id };
}
