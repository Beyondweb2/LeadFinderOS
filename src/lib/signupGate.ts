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

/** The agreement page for one sign-up: the client's own link plus the sign-up it is for. The page signs
 *  FOR that onboarding row and its "Continue to payment" pays for it; nothing else is accepted. */
export function signupAgreementUrl(agreementUrl: string, onboardingId: string): string {
  return `${agreementUrl}${agreementUrl.includes('?') ? '&' : '?'}s=${encodeURIComponent(onboardingId)}`;
}
