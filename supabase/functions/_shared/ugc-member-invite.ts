/* INVITE A UGC MEMBER (Jess) — the admin's action in fn ugc-brands. Pure: every read and write is injected, so it is
 * tested with an in-memory store (scripts/ugc-brand-finder.test.ts). Relative imports only.
 *
 * ⛔ The auth service emails the person its standard invite; they set their own password on the app's set-password
 *    page. The invite link NEVER comes back to us: it is not returned, logged or shown — no credential passes through.
 * ⛔ A UGC member gets a ugc_members row and NO user_roles row: no LeadFinder role, so every Findable policy and
 *    function keeps refusing them. Nothing here may ever write user_roles or team_members.
 * ⛔ All-or-nothing: if the member row cannot be written, the account just invited is removed again. */

export interface UgcInviteDeps {
  inviteByEmail(args: { email: string; displayName: string }): Promise<{ id: string | null; error: string | null }>;
  deleteAuthUser(id: string): Promise<void>;
  writeMember(id: string, displayName: string, senderEmail: string, by: string): Promise<string | null>;
}
export type UgcInviteResult =
  | { ok: true; status: 200; user_id: string }
  | { ok: false; status: number; error: string; detail?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function inviteUgcMember(deps: UgcInviteDeps, actor: string, body: Record<string, unknown>): Promise<UgcInviteResult> {
  const name = String(body.name ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  const sender = String(body.sender_email ?? '').trim().toLowerCase() || email;
  if (!name || name.length > 60) return { ok: false, status: 400, error: 'bad_name' };
  if (!EMAIL_RE.test(email) || email.length > 254) return { ok: false, status: 400, error: 'bad_email' };
  if (!EMAIL_RE.test(sender)) return { ok: false, status: 400, error: 'bad_email' };
  const invited = await deps.inviteByEmail({ email, displayName: name });
  if (invited.error || !invited.id) {
    const msg = String(invited.error ?? 'no user returned');
    if (/already|registered|exists/i.test(msg)) return { ok: false, status: 409, error: 'already_exists' };
    return { ok: false, status: 502, error: 'invite_failed', detail: msg.slice(0, 200) };
  }
  const err = await deps.writeMember(invited.id, name, sender, actor);
  if (err) {
    await deps.deleteAuthUser(invited.id);
    return { ok: false, status: 500, error: 'member_write_failed', detail: err.slice(0, 200) };
  }
  return { ok: true, status: 200, user_id: invited.id };
}
