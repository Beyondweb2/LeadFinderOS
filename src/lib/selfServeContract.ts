/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE AGENCY-CONTRACT SAFEGUARD FOR THE CLIENT'S OWN SIGN-UP (Full Setup), 2026-10-07 — ONE RULE, NOT TWO.

   On the phone, Build on a site an agency / developer runs is not ready unless the contract is confirmed FREE
   (quickClose.agencyContractBlocksBuild). A client who answers the SAME question on their own page must not be able to
   walk round it. This is that rule read off the onboarding ROW the page wrote (website_manager = 'web_company' = an
   agency / web company runs the site; agency_contract = their answer).

   🔴 v5 (Paul, 2026-10-16, Client Service Agreement clause 1.6) — TIED IN IS A DECLINE, NOT A REVIEW:
     agency runs the site  +  STILL TIED IN ('in_contract')            →  DECLINED (selfServeDeclined). We do not take
                                                                         them on; Paul's release does NOT lift it; no
                                                                         other plan is offered.
     Build  +  agency runs the site  +  NOT SURE                       →  HELD for Paul (selfServeBuildHold, released by
                                                                         quick-close approve_review once they confirm
                                                                         they are free).
     an agency contract that has ended (free), or no agency            →  neither.
   selfServeBuildHold stays TRUE for a declined row too, so every caller that refuses payment on it (findable-checkout:
   held_for_review) keeps refusing — and a release can never open it.

   ⛔ POSITIVE MATCH ONLY. A row with no contract answer (a sign-up made before the question existed, or no agency) is
   never held or declined by this — it fires on an answer that says "still in contract" / "not sure", never on silence.
   ⛔ THE RELEASE IS PAUL'S, THE SAME FIELD: quick_close.review_approved_at. There is no second release, and none for a decline.
   Pure; reached from edge functions: explicit .ts on relative imports.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { agencyContractBlocksBuild, agencyContractTiedIn, QC_REVIEW_TEXT, TIED_IN_DECLINE_REASON, type QcAgencyContract } from './quickClose.ts';
import { serviceRouteFromRow } from './findableOffer.ts';

export interface SelfServeRow {
  plan_tier?: unknown;
  website_addon?: unknown;
  website_manager?: unknown;
  agency_contract?: unknown;
  quick_close?: { review_approved_at?: unknown } | null;
}

const CONTRACT: ReadonlySet<string> = new Set(['in_contract', 'free', 'not_sure']);
const contractOf = (row: SelfServeRow): QcAgencyContract | null =>
  typeof row.agency_contract === 'string' && CONTRACT.has(row.agency_contract) ? (row.agency_contract as QcAgencyContract) : null;

/** 🔴 v5 clause 1.6: did this client say, on their own page, that an agency / web company runs their site and they are STILL
 *  TIED INTO a contract with it? Then we do not take them on — whatever plan the row names, whatever Paul released. */
export function selfServeDeclined(row: SelfServeRow | null | undefined): boolean {
  if (!row) return false;
  if (row.website_manager !== 'web_company') return false;
  /* The SAME predicate the phone close uses, fed the same two facts. */
  return agencyContractTiedIn({ manager: 'agency', agency_contract: contractOf(row) });
}

/** Is this client-made sign-up NOT payable because of the agency contract? True while it waits for Paul (Build + agency +
 *  not sure, until he releases it) and ALWAYS for a declined one (still tied in: no release lifts it). */
export function selfServeBuildHold(row: SelfServeRow | null | undefined): boolean {
  if (!row) return false;
  if (selfServeDeclined(row)) return true; // v5: tied in = declined, never released
  if (serviceRouteFromRow(row) !== 'build') return false;
  if (row.website_manager !== 'web_company') return false;
  const c = contractOf(row);
  if (!c) return false; // no answer is not an answer
  if (row.quick_close?.review_approved_at) return false; // Paul released it (an unconfirmed contract only)
  /* The SAME predicate the phone close uses, fed the same two facts. */
  return agencyContractBlocksBuild({ manager: 'agency', agency_contract: c });
}

/** What Paul is told about a held (not sure) sign-up (the phone close's own wording for this stop). */
export const SELF_SERVE_HOLD_TEXT: string = QC_REVIEW_TEXT.agency_contract_build;
/** What Paul / the rep is told about a declined sign-up (the phone close's own wording for a decline). */
export const SELF_SERVE_DECLINE_TEXT: string = TIED_IN_DECLINE_REASON;
