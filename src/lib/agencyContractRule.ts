/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE AGENCY-CONTRACT RULE — ONE PLACE (Paul, 2026-10-16; Client Service Agreement v5, clause 1.6).

   Every way a client signs up asks the same thing: are they with a web agency or provider, and if so are they tied
   into a contract with them? The answer means the same everywhere:

     no agency, or free to leave  →  GO      (Findable Build)
     tied in                      →  STOP    (declined: we do not take them on; no release lifts it — v5)
     not sure                     →  HOLD    (held for Paul to check before any payment; his release is
                                              quick_close.review_approved_at)
     agency, no answer yet        →  UNANSWERED (never a go, never a stop: ask it)

   Read by: Quick Close and the Call screen (quickClose.ts agencyContractTiedIn / agencyContractBlocksBuild /
   agencyContractUnconfirmed — thin wrappers over this), the client's own sign-up and findable-checkout (selfServeContract.ts
   through those wrappers), and Paul's manual onboarding dialog. Mirrors findable-site's contractOutcome
   (src/lib/onboardingSimple.ts). The words for each outcome stay with the close (quickClose.ts TIED_IN_DECLINE_REASON,
   QC_REVIEW_TEXT.agency_contract_build) so a rep, Paul and the dialog read the same sentence.
   ⛔ POSITIVE MATCHES ONLY. No answer is "unanswered", never a go and never a stop.
   Pure, no imports: reached from edge functions.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export type AgencyContractAnswer = 'in_contract' | 'free' | 'not_sure';
export type AgencyContractOutcome = 'go' | 'stop' | 'hold' | 'unanswered';

/** The three answers, in the order the client's own page shows them. */
export const AGENCY_CONTRACT_ANSWERS: readonly AgencyContractAnswer[] = ['free', 'in_contract', 'not_sure'];
/** The labels, as the client is asked them (findable-site CONTRACT_OPTIONS). */
export const AGENCY_CONTRACT_LABEL: Record<AgencyContractAnswer, string> = {
  free: 'Free to leave',
  in_contract: 'Tied in',
  not_sure: 'Not sure',
};

export function readAgencyContract(v: unknown): AgencyContractAnswer | null {
  return v === 'in_contract' || v === 'free' || v === 'not_sure' ? v : null;
}

/** THE RULE. `thirdParty`: true = an agency / provider / freelancer runs their site; false = nobody outside does (they run
 *  it themselves, or have no website); null = not answered. */
export function agencyContractOutcome(thirdParty: boolean | null, contract: unknown): AgencyContractOutcome {
  if (thirdParty === false) return 'go';
  if (thirdParty !== true) return 'unanswered';
  const c = readAgencyContract(contract);
  if (c === 'free') return 'go';
  if (c === 'in_contract') return 'stop';
  if (c === 'not_sure') return 'hold';
  return 'unanswered';
}
