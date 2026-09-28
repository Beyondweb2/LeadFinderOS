/* ════════════════════════════════════════════════════════════════════════════════════════════════
   DOMAIN OWNERSHIP + AUTHORITY — the rule for the standard Findable NEW-WEBSITE service
   (Paul, 2026-09-28). ⛔ ONE FILE, BYTE-IDENTICAL IN BOTH REPOS (LeadFinderOS src/lib/domainAuthority.ts
   and findable-site src/lib/domainAuthority.ts); scripts/check-cross-repo-sync.mjs fails on drift.

   WE ONLY BUILD / CONNECT THE STANDARD NEW SITE WHERE THE CLIENT CONFIRMS THEY OWN / CONTROL THE
   DOMAIN AND HAVE AUTHORITY TO AUTHORISE THE CHANGE.
   - An agency MANAGING the current website (or its DNS) is not a problem in itself.
   - An agency / third party OWNING or CONTROLLING the domain IS, until the client obtains control.
   - "Not sure" is never a yes: the client establishes it first.
   - A brand-new domain is registered by the CLIENT, in the business's own name (Paul, 2026-09-28).
   - Faithful / modernised rebuilds (and moving a site to our hosting) only where the client confirms
     they own, or may reuse, the current design, text and images. Otherwise: a fresh Findable build.
   Derived, never stored (CLAUDE.md §6). Positive matches only: an unknown value is never a yes.
   No imports: this file is read by edge functions and by the Astro site alike.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export type YesNoNotSure = 'yes' | 'no' | 'not_sure';
export type DomainAccessAnswer = 'yes' | 'no' | 'agency';

/** The onboarding answers this rule reads (onboarding_responses columns of the same names). */
export interface DomainAuthorityInput {
  /** The standard NEW-WEBSITE service (we build / host / connect it). false = we optimise their own site. */
  newSite: boolean;
  /** They have a current website we would be replacing. */
  hasCurrentSite: boolean;
  /** 'existing' = their current domain; 'new' = a brand-new domain the client registers. */
  domain_status?: string | null;
  /** 1. Do you or your business own the domain name? */
  domain_owned?: string | null;
  /** 2. Do you have access to the domain registrar / DNS settings? */
  domain_access?: string | null;
  /** 4. Does any third party own or control the domain? */
  domain_third_party?: string | null;
  /** 5. entitled to replace or move the current website and connect the domain. */
  authority_confirmed?: boolean | null;
  /** 6. authorise Findable to connect / change the DNS and hosting settings. */
  dns_permission?: boolean | null;
  /** 7. right to provide the logos, photographs, text and other material they supply. */
  materials_confirmed?: boolean | null;
  /** Do you own, or have the right to reuse, your current website's design, text and photos? */
  site_rights?: string | null;
}

export type DomainReason =
  | 'domain_not_answered' | 'domain_not_owned' | 'domain_ownership_unsure' | 'third_party_controls'
  | 'third_party_unsure' | 'no_domain_access' | 'authority_not_confirmed' | 'dns_permission_missing'
  | 'materials_not_confirmed';

export interface DomainAuthorityVerdict {
  /** false = the rule does not apply (we optimise their own site; nothing to connect). */
  applies: boolean;
  /** Build-ready as far as the domain is concerned. */
  ready: boolean;
  label: 'DOMAIN READY' | 'DOMAIN / AGENCY ISSUE' | 'NOT NEEDED';
  reasons: DomainReason[];
  /** The customer said something that must be resolved BEFORE they can go on (not just a box left unticked). */
  stop: boolean;
  /** Faithful / modernised rebuild, or moving the site to our hosting, is allowed. */
  mayReuseExistingSite: boolean;
}

export const DOMAIN_REASON_TEXT: Record<DomainReason, string> = {
  domain_not_answered: 'Domain question not answered',
  domain_not_owned: 'The business does not own the domain',
  domain_ownership_unsure: 'Not sure who owns the domain',
  third_party_controls: 'A third party owns or controls the domain',
  third_party_unsure: 'Not sure whether a third party controls the domain',
  no_domain_access: 'No access to the domain registrar / DNS',
  authority_not_confirmed: 'Authority to replace the current website not confirmed',
  dns_permission_missing: 'Permission to connect the domain not given',
  materials_not_confirmed: 'Rights to supplied material not confirmed',
};

/** The reasons that mean "stop and sort the domain out first" rather than "tick the box". */
const STOP_REASONS: ReadonlySet<DomainReason> = new Set([
  'domain_not_owned', 'domain_ownership_unsure', 'third_party_controls', 'third_party_unsure', 'no_domain_access',
]);

export function domainAuthority(i: DomainAuthorityInput): DomainAuthorityVerdict {
  const mayReuseExistingSite = i.hasCurrentSite && i.site_rights === 'yes';
  if (!i.newSite) {
    return { applies: false, ready: true, label: 'NOT NEEDED', reasons: [], stop: false, mayReuseExistingSite };
  }
  const reasons: DomainReason[] = [];
  if (i.domain_status === 'existing') {
    if (i.domain_owned === 'no') reasons.push('domain_not_owned');
    else if (i.domain_owned !== 'yes') reasons.push('domain_ownership_unsure');
    if (i.domain_third_party === 'yes') reasons.push('third_party_controls');
    else if (i.domain_third_party !== 'no') reasons.push('third_party_unsure');
    if (i.domain_access !== 'yes' && i.domain_access !== 'agency') reasons.push('no_domain_access');
  } else if (i.domain_status !== 'new') {
    reasons.push('domain_not_answered');
  }
  if (i.hasCurrentSite && i.authority_confirmed !== true) reasons.push('authority_not_confirmed');
  if (i.dns_permission !== true) reasons.push('dns_permission_missing');
  if (i.materials_confirmed !== true) reasons.push('materials_not_confirmed');
  const ready = reasons.length === 0;
  return {
    applies: true, ready, label: ready ? 'DOMAIN READY' : 'DOMAIN / AGENCY ISSUE', reasons,
    stop: reasons.some((r) => STOP_REASONS.has(r)), mayReuseExistingSite,
  };
}

/** A stored onboarding row → the rule's input. ONE mapping, read by findable-checkout, Paid Clients
 *  and the PAID email. New site = the site-access answer needed a build (website_addon), or the
 *  operator's route / tier says we build it. A current site = a website was given, or the site-rights
 *  question (asked only when there is one) was answered. */
export interface DomainRow {
  website_addon?: boolean | null; website_route?: string | null; plan_tier?: string | null;
  business_website?: string | null; domain_status?: string | null; domain_owned?: string | null;
  domain_access?: string | null; domain_third_party?: string | null; site_rights?: string | null;
  authority_confirmed?: boolean | null; dns_permission?: boolean | null; materials_confirmed?: boolean | null;
}
export function domainInputFromRow(r: DomainRow | null | undefined): DomainAuthorityInput {
  const x = r ?? {};
  const newSite = x.website_addon === true || x.website_route === 'new_site' || x.website_route === 'rebuild_existing' || x.plan_tier === 'new_site';
  const hasCurrentSite = (typeof x.business_website === 'string' && x.business_website.trim() !== '') || (x.site_rights != null && x.site_rights !== '');
  return {
    newSite, hasCurrentSite, domain_status: x.domain_status ?? null, domain_owned: x.domain_owned ?? null,
    domain_access: x.domain_access ?? null, domain_third_party: x.domain_third_party ?? null,
    authority_confirmed: x.authority_confirmed ?? null, dns_permission: x.dns_permission ?? null,
    materials_confirmed: x.materials_confirmed ?? null, site_rights: x.site_rights ?? null,
  };
}
/** The onboarding columns the mapping reads — select exactly these. */
export const DOMAIN_ROW_COLUMNS = 'website_addon,website_route,plan_tier,business_website,domain_status,domain_owned,domain_access,domain_third_party,site_rights,authority_confirmed,dns_permission,materials_confirmed';

/* ── The customer-facing words (onboarding). Plain English; no legal advice; never a password. ── */
export const DOMAIN_QUESTIONS = {
  owned: 'Do you or your business own the domain name?',
  access: 'Do you have access to the domain registrar or DNS settings?',
  thirdParty: 'Does any third party own or control the domain?',
  siteRights: "Do you own, or have the right to reuse, your current website's design, text and photos?",
  authority: 'I have checked that my business is entitled to replace or move its current website and connect the domain to a new website.',
  dns: 'I authorise Findable to connect and, where necessary, change the DNS/hosting settings for my domain so it can point to the website Findable builds for my business.',
  materials: 'I have the right to provide Findable with any logos, photographs, text and other material I supply for use on the new website.',
} as const;
export const DOMAIN_OWNED_OPTIONS = [
  { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'not_sure', label: 'Not sure' },
] as const;
export const DOMAIN_ACCESS_OPTIONS = [
  { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }, { value: 'agency', label: 'An agency currently manages this' },
] as const;
export const DOMAIN_THIRD_PARTY_OPTIONS = [
  { value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }, { value: 'not_sure', label: 'Not sure' },
] as const;
export const SITE_RIGHTS_OPTIONS = [
  { value: 'yes', label: 'Yes' }, { value: 'no', label: 'No, an agency or developer owns it' }, { value: 'not_sure', label: 'Not sure' },
] as const;
export const NEW_DOMAIN_REGISTRATION_NOTE =
  'You register the new domain in your business’s own name, so it is yours from day one. We’ll tell you exactly how, and then connect it for you.';
export const AGENCY_CONTRACT_NOTE =
  'If an agency or developer looks after your current website, that’s normally fine. You’re responsible for checking your agreement with them (notice periods, fees, and who owns the site and its content). We can’t advise on that agreement.';
export const DOMAIN_STOP_MESSAGE =
  'Before we build and connect a new website, your business needs to own or control its domain name and be free to point it at the new site. Please sort that out first, or ask us to look at your setup with you. Nothing is charged until it’s resolved.';
export const FRESH_BUILD_NOTE =
  'That’s fine: we’ll build you a genuinely new website and only reuse your business details and the material you own.';

/* ── Sales: the four situations, and what a salesperson says. Never legal advice. ─────────────── */
export type DomainControl = 'client_owns' | 'client_owns_agency_manages' | 'third_party_owns' | 'unknown';
export const DOMAIN_CONTROL_OPTIONS: ReadonlyArray<{ value: DomainControl; label: string; guidance: string }> = [
  { value: 'client_owns', label: 'They own the domain and control it', guidance: 'Normal new-site path.' },
  { value: 'client_owns_agency_manages', label: 'They own it, an agency manages the site / DNS', guidance: 'Usually fine, once they confirm they have the right to move it and connect it.' },
  { value: 'third_party_owns', label: 'An agency / third party owns or controls the domain', guidance: 'Do not promise a rebuild or switch-over. Flag it to Paul; they need to get control first.' },
  { value: 'unknown', label: "They don't know", guidance: "Don't guess. They need to find out before a new site goes ahead." },
];
export const SALES_DOMAIN_LINE =
  "If an agency manages your current website that's normally fine, but before we replace it we need to confirm that your business owns or controls the domain and is free to point it at the new site. If you're unsure, we'll check the setup before going any further.";
