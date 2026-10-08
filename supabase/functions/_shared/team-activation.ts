/* RESEND ACTIVATION for an EXISTING salesperson (2026-10-08). Pure: every read and write is injected, so
 * the same code runs under test with an in-memory store. It performs exactly ONE write on the account —
 * asking the auth provider for a fresh link for the SAME user id — plus one audit event. It never inserts a
 * user, a team member, a role or a profile, and never touches leads, commission or history. The caller
 * (fn admin-users) has already proved the caller is an admin. Relative imports only. */
import { resendRefusal, resetRefusal, type RecoveryKind, type ResendFacts, type ResendRefusal } from '../../../src/lib/teamActivation.ts';

export interface ActivationDeps {
  facts(uid: string, kind: RecoveryKind): Promise<ResendFacts>;
  /** Fresh link for the SAME user (supersedes the previous token in the provider). activation = sign-in link to the set-password page; reset = the provider's recovery link. */
  makeLink(email: string, kind: RecoveryKind): Promise<{ link: string | null; error: string | null }>;
  /** Audit: who, whom, when, which — never the link or any token. */
  audit(ev: { actor: string; target: string; at: string; kind: RecoveryKind }): Promise<void>;
}

export type ActivationResult =
  | { ok: true; status: 200; link: string; user_id: string }
  | { ok: false; status: number; error: ResendRefusal | 'link_failed' | 'reset_failed'; detail?: string };

const STATUS: Record<string, number> = {
  bad_user: 400, not_found: 404, not_sales: 409, not_active: 409, suspended: 409, banned: 409, no_email: 409,
  already_activated: 409, not_activated: 409, state_unknown: 503, rate_limited: 429,
};

async function run(deps: ActivationDeps, kind: RecoveryKind, actor: string, target: unknown, now: () => Date): Promise<ActivationResult> {
  if (typeof target !== 'string' || !/^[0-9a-f-]{36}$/i.test(target)) return { ok: false, status: 400, error: 'bad_user' };
  const facts = await deps.facts(target, kind);
  const refusal = (kind === 'activation_resent' ? resendRefusal : resetRefusal)(facts);
  if (refusal) return { ok: false, status: STATUS[refusal] ?? 409, error: refusal };
  const { link, error } = await deps.makeLink(facts.email as string, kind);
  if (error || !link) return { ok: false, status: 502, error: kind === 'activation_resent' ? 'link_failed' : 'reset_failed', detail: error ?? 'no link returned' };
  await deps.audit({ actor, target, at: now().toISOString(), kind });
  return { ok: true, status: 200, link, user_id: target };
}

export const reissueActivation = (deps: ActivationDeps, actor: string, target: unknown, now: () => Date = () => new Date()) => run(deps, 'activation_resent', actor, target, now);
/** SEND PASSWORD RESET: same user, the provider's own recovery link, one audit row. */
export const issuePasswordReset = (deps: ActivationDeps, actor: string, target: unknown, now: () => Date = () => new Date()) => run(deps, 'password_reset_sent', actor, target, now);
