/* ══ PROSPECT-ONLY COUNTRIES: FIND, AUDIT AND CALL — NEVER A PRICE OR A SIGN-UP LINK (2026-10-21) ════════════════
   Australia is worked as a prospect market only (Paul, 2026-10-21): leads can be found, audited and called, but the
   offer is GBP and the agreement is UK law, and neither has been decided for Australia. So, until Paul decides:
     · the report an Australian prospect opens carries no price, no guarantee line and no sign-up button
       (render-audit-report → prospectOnly on the report data);
     · Quick Close makes no sign-up / set-up link for an Australian lead, and findable-checkout refuses one;
     · a template that carries a sign-up / onboarding link or a £ price is never sent to an Australian number.
   ⛔ COLD WHATSAPP TO AUSTRALIA STAYS REFUSED by its own rule (ukColdDestination / outreachMarkets: +61 is not a
      market) — this file does not touch it and must never be read as permission to message Australia.
   ⛔ ONE RULE, ONE PLACE: every surface asks prospectOnlyLead / prospectOnlyNumber. Adding a country here is the
      whole switch; removing Australia is a Paul decision (pricing + agreement), never a code tidy-up.
   Pure. Edge-reachable: relative imports with .ts only. */
import { isAustralianLead } from './australiaTowns.ts';

/** The countries worked as prospects only. */
export const PROSPECT_ONLY_COUNTRIES: readonly string[] = ['Australia'];

export const PROSPECT_ONLY_DETAIL =
  'Australia is prospect-only for now: find, audit and call, but no price and no sign-up link. Paul decides when Australian clients can sign up.';

/** Is this lead in a prospect-only country — its stored country, or an address that ends in that country. */
export function prospectOnlyLead(lead: { country?: string | null; address?: string | null } | null | undefined): boolean {
  if (!lead) return false;
  return isAustralianLead(lead.country ?? null, lead.address ?? null);
}

/** Is this phone number (any form: +61…, 0061…, 61…) in a prospect-only country. National forms ("04…") are
 *  ambiguous with the UK's and are NOT read as Australian here — the lead's country decides those. */
export function prospectOnlyNumber(to: string | null | undefined): boolean {
  const d = String(to ?? '').replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/^00/, '');
  return /^61\d{8,9}$/.test(d);
}

/** The template variables that carry a sign-up / onboarding link (whatsapp-send.ts TemplateVar names). */
export const SIGNUP_LINK_VARS: ReadonlySet<string> = new Set(['onboarding_url', 'signup_url', 'onboarding_form_url']);

/**
 * A refusal sentence when a template must not go to this number because the number is in a prospect-only country:
 * the template carries a sign-up / onboarding link (judged by its VARIABLES, so a new link template is caught
 * without being named here), or it is one of the £-priced UK-worded templates. Else null.
 */
export function prospectOnlyTemplateRefusal(
  template: { name: string; vars: readonly string[] } | null | undefined,
  to: string | null | undefined,
  pricedTemplates: ReadonlySet<string>,
): string | null {
  if (!template || !prospectOnlyNumber(to)) return null;
  const carriesLink = template.vars.some((v) => SIGNUP_LINK_VARS.has(v));
  if (!carriesLink && !pricedTemplates.has(template.name)) return null;
  return `${template.name} carries ${carriesLink ? 'a sign-up link' : 'a £ price'}, and ${PROSPECT_ONLY_DETAIL}`;
}
