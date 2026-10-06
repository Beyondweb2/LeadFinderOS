/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE PAYMENT GATE — NO STRIPE SESSION WITHOUT A SIGNED v3 AGREEMENT FOR THIS SIGN-UP (2026-10-05).

   Clause 1.2 of the v3 Client Service Agreement: "You accept this agreement by clicking 'I agree and
   sign' on your agreement page … before you make your initial payment." The checklist (Part 3): "Block
   the Stripe checkout until the agreement is signed."

   ⛔ ENFORCED SERVER-SIDE, IN findable-checkout, THE ONLY CREATOR OF CHECKOUT SESSIONS. Hiding a button
      is presentation; this is the block. Quick Close, the self-service questionnaire, a pasted link and
      a replayed request all reach Stripe through that one function.
   ⛔ ONE ACCEPTANCE PAYS FOR ONE SIGN-UP. It must be:
        · method 'agree_page' (v3 has no checkout tick),
        · the CURRENT agreement version (a v1 signature never opens a v3 checkout),
        · for THIS lead and THIS onboarding row (another client's, or this client's older sign-up's,
          signature never pays for this one),
        · on THIS route (a Build signature never pays an Optimise checkout, and the reverse),
        · with the authority tick (clause 1.4),
        · and its stored text must still hash to its stored fingerprint (the record proves itself).
      Anything else — including no row at all — is a refusal, and the visitor is sent to the agreement page.
   Pure. ⚠️ Edge-reachable — explicit .ts on every relative import.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import type { AgreementRoute } from './clientAgreement.ts';

export interface GateAcceptance {
  id: string;
  lead_id: string;
  onboarding_id?: string | null;
  agreement_version: string;
  service_route: string;
  method: string;
  authority_confirmed?: boolean | null;
  agreed_text_sha256: string;
}

export type GateRefusal =
  | 'not_signed' | 'wrong_method' | 'old_version' | 'other_client' | 'other_signup' | 'other_route'
  | 'no_authority' | 'tampered';

export type GateResult = { ok: true; acceptanceId: string } | { ok: false; refusal: GateRefusal; reason: string };

const REASONS: Record<GateRefusal, string> = {
  not_signed: 'The Client Service Agreement has not been signed for this sign-up.',
  wrong_method: 'Only a signature on the agreement page counts under this agreement version.',
  old_version: 'The signature is on an earlier version of the agreement.',
  other_client: 'The signature belongs to a different client.',
  other_signup: 'The signature was given for a different sign-up.',
  other_route: 'The signature is for the other service (Build / Optimise).',
  no_authority: 'The signer did not confirm they are authorised to bind the business.',
  tampered: 'The stored agreement text no longer matches its fingerprint.',
};

/**
 * May a Stripe session be created for this sign-up? `recomputedSha` is sha256Hex(acceptance.agreed_text),
 * computed by the caller from the stored row (async, so it is passed in to keep this pure).
 */
export function checkoutAgreementGate(args: {
  acceptance: GateAcceptance | null;
  leadId: string;
  onboardingId: string;
  route: AgreementRoute;
  currentVersion: string;
  recomputedSha: string | null;
}): GateResult {
  const a = args.acceptance;
  const no = (refusal: GateRefusal): GateResult => ({ ok: false, refusal, reason: REASONS[refusal] });
  if (!a) return no('not_signed');
  if (a.method !== 'agree_page') return no('wrong_method');
  if (a.agreement_version !== args.currentVersion) return no('old_version');
  if (a.lead_id !== args.leadId) return no('other_client');
  if ((a.onboarding_id ?? '') !== args.onboardingId) return no('other_signup');
  if (a.service_route !== args.route) return no('other_route');
  if (a.authority_confirmed !== true) return no('no_authority');
  if (!args.recomputedSha || args.recomputedSha !== a.agreed_text_sha256) return no('tampered');
  return { ok: true, acceptanceId: a.id };
}

/* ══ THE WEBHOOK BACKSTOP (defence in depth — the gate above is the real block) ══════════════════════
   When Stripe reports a completed Findable checkout, the payment is treated as an agreement-first sale ONLY
   if the session says it is (an agreement-first version, the commercial terms THAT version puts a sale on,
   an acceptance id) AND that acceptance, read back from the database, passes the same gate — on the
   session's OWN version — for the lead, sign-up and service the session names. Anything else is HELD.
   🔴 v4 (2026-10-06): a v3 session (signed and opened before the v4 cutover, paid after it) is still a valid
   v3 sale on v3 terms; the CHECKOUT only ever opens new sessions on the current version. */
export type WebhookVerdict = { ok: true; acceptanceId: string } | { ok: false; reason: string };
export function webhookV3Verdict(args: {
  metadata: Record<string, string | undefined> | null | undefined;
  acceptance: GateAcceptance | null;
  leadId: string | null;
  onboardingId: string;
  recomputedSha: string | null;
  /** Agreement-first version → the commercial terms it puts a sale on (clientAgreement.ts AGREEMENT_FIRST_TERMS). */
  termsByVersion: Readonly<Record<string, string>>;
}): WebhookVerdict {
  const m = args.metadata ?? {};
  const knownTerms = Object.values(args.termsByVersion);
  if (!m.commercial_terms || !knownTerms.includes(m.commercial_terms)) return { ok: false, reason: 'not_a_v3_checkout: the session was not created by the agreement-first checkout' };
  const version = m.agreement_version ?? '';
  const expectedTerms = Object.prototype.hasOwnProperty.call(args.termsByVersion, version) ? args.termsByVersion[version] : null;
  if (!expectedTerms) return { ok: false, reason: `old_version: the session names agreement version ${m.agreement_version ?? 'none'}` };
  if (m.commercial_terms !== expectedTerms) return { ok: false, reason: `terms_mismatch: version ${version} puts a sale on ${expectedTerms}, the session says ${m.commercial_terms}` };
  if (!m.agreement_acceptance_id) return { ok: false, reason: 'no_acceptance_id: the session names no signature' };
  if (!args.leadId) return { ok: false, reason: 'no_lead: the session names no client' };
  if (!args.acceptance || args.acceptance.id !== m.agreement_acceptance_id) return { ok: false, reason: 'acceptance_not_found: the named signature does not exist' };
  const route = m.service_route === 'build' || m.service_route === 'optimise' ? m.service_route : null;
  if (!route) return { ok: false, reason: 'no_route: the session names no service' };
  const g = checkoutAgreementGate({ acceptance: args.acceptance, leadId: args.leadId, onboardingId: args.onboardingId, route, currentVersion: version, recomputedSha: args.recomputedSha });
  if ('refusal' in g) return { ok: false, reason: `${g.refusal}: ${g.reason}` };
  return { ok: true, acceptanceId: g.acceptanceId };
}

/** The agreement page for one sign-up: the client's own link plus the sign-up it is for. The page signs
 *  FOR that onboarding row and its "Continue to payment" pays for it; nothing else is accepted. */
export function signupAgreementUrl(agreementUrl: string, onboardingId: string): string {
  return `${agreementUrl}${agreementUrl.includes('?') ? '&' : '?'}s=${encodeURIComponent(onboardingId)}`;
}
