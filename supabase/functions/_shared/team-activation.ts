/* RESEND ACTIVATION for an EXISTING salesperson (2026-10-08). Pure: every read and write is injected, so
 * the same code runs under test with an in-memory store. It performs exactly ONE write on the account —
 * asking the auth provider for a fresh link for the SAME user id — plus one audit event. It never inserts a
 * user, a team member, a role or a profile, and never touches leads, commission or history. The caller
 * (fn admin-users) has already proved the caller is an admin. Relative imports only. */
import { resendRefusal, type ResendFacts, type ResendRefusal } from '../../../src/lib/teamActivation.ts';

export interface ActivationDeps {
  facts(uid: string): Promise<ResendFacts>;
  /** Fresh link for the SAME user (supersedes the previous token in the provider). */
  makeLink(email: string): Promise<{ link: string | null; error: string | null }>;
  /** Audit: who, whom, when — never the link or any token. */
  audit(ev: { actor: string; target: string; at: string }): Promise<void>;
}

export type ActivationResult =
  | { ok: true; status: 200; link: string; user_id: string }
  | { ok: false; status: number; error: ResendRefusal | 'link_failed'; detail?: string };

const STATUS: Record<string, number> = {
  bad_user: 400, not_found: 404, not_sales: 409, not_active: 409, suspended: 409, banned: 409, no_email: 409,
  already_activated: 409, state_unknown: 503, rate_limited: 429,
};

export async function reissueActivation(deps: ActivationDeps, actor: string, target: unknown, now: () => Date = () => new Date()): Promise<ActivationResult> {
  if (typeof target !== 'string' || !/^[0-9a-f-]{36}$/i.test(target)) return { ok: false, status: 400, error: 'bad_user' };
  const facts = await deps.facts(target);
  const refusal = resendRefusal(facts);
  if (refusal) return { ok: false, status: STATUS[refusal] ?? 409, error: refusal };
  const { link, error } = await deps.makeLink(facts.email as string);
  if (error || !link) return { ok: false, status: 502, error: 'link_failed', detail: error ?? 'no link returned' };
  await deps.audit({ actor, target, at: now().toISOString() });
  return { ok: true, status: 200, link, user_id: target };
}
