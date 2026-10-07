/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE AGENCY-CONTRACT SAFEGUARD FOR THE CLIENT'S OWN SIGN-UP (Full Setup), 2026-10-07 — ONE RULE, NOT TWO.

   On the phone, Build on a site an agency / developer runs stops for Paul unless the contract is confirmed FREE
   (quickClose.agencyContractBlocksBuild → review reason `agency_contract_build`, released by Paul through
   quick-close approve_review, which stamps quick_close.review_approved_at). A client who answers the SAME question on
   their own page must not be able to walk round it. This is that rule read off the onboarding ROW the page wrote
   (website_manager = 'web_company' = an agency / web company runs the site; agency_contract = their answer):

     Build  +  agency runs the site  +  contract NOT confirmed free (still in contract, or not sure)  →  HELD
     Optimise, or an agency contract that has ended (free), or no agency                               →  not held

   ⛔ POSITIVE MATCH ONLY. A row with no contract answer (a sign-up made before the question existed, or no agency) is
   never held by this — the hold fires on an answer that says "still in contract" / "not sure", never on silence.
   ⛔ THE RELEASE IS PAUL'S, THE SAME FIELD: quick_close.review_approved_at. There is no second release.
   Pure; reached from edge functions: explicit .ts on relative imports.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { agencyContractBlocksBuild, QC_REVIEW_TEXT, type QcAgencyContract } from './quickClose.ts';
import { serviceRouteFromRow } from './findableOffer.ts';

export interface SelfServeRow {
  plan_tier?: unknown;
  website_addon?: unknown;
  website_manager?: unknown;
  agency_contract?: unknown;
  quick_close?: { review_approved_at?: unknown } | null;
}

const CONTRACT: ReadonlySet<string> = new Set(['in_contract', 'free', 'not_sure']);

/** Is this client-made sign-up waiting for Paul because it is a Build on an agency-run site they may still be tied into? */
export function selfServeBuildHold(row: SelfServeRow | null | undefined): boolean {
  if (!row) return false;
  if (serviceRouteFromRow(row) !== 'build') return false;
  if (row.website_manager !== 'web_company') return false;
  const c = typeof row.agency_contract === 'string' && CONTRACT.has(row.agency_contract) ? (row.agency_contract as QcAgencyContract) : null;
  if (!c) return false; // no answer is not an answer
  if (row.quick_close?.review_approved_at) return false; // Paul released it
  /* The SAME predicate the phone close uses, fed the same two facts. */
  return agencyContractBlocksBuild({ manager: 'agency', agency_contract: c });
}

/** What Paul is told (the phone close's own wording for this stop). */
export const SELF_SERVE_HOLD_TEXT: string = QC_REVIEW_TEXT.agency_contract_build;
