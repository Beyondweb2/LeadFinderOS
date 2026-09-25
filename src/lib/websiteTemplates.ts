/* ════════════════════════════════════════════════════════════════════════════════════════════════
   FINDABLE WEBSITE TEMPLATES — a small registry of reusable DESIGN / STRUCTURE / TECHNICAL bases.

   ⛔ A TEMPLATE IS STRUCTURE, NEVER CLAIMS. The template's source repo is a real client's finished
   site, so every file in it carries that client's facts. The profile below lists (a) what is
   reusable, (b) the facts a new client must supply, and (c) every client-specific claim the source
   carries, each tied to the fact that would have to be VERIFIED for the new client before anything
   like it may appear. A claim with no verified fact is REMOVED, never adapted.

   Every value in the MCL profile was read from the MCLocksmiths repo on 2026-09-23 (package.json,
   astro.config.mjs, src/pages, src/components, src/lib, public/). If that repo changes shape, change
   this profile — it is hand-kept, like the Stripe Payment Link.

   ⚠️ Edge-reachable if ever imported server-side: relative imports with an explicit .ts only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import type { AssetType, PageFamily } from './websiteBuildState.ts';
import { templateSuitsTrade } from './buildRoutes.ts';

/** One claim the template's source content makes that belongs to the SOURCE client. */
export interface TemplateClaim {
  id: string;
  /** What the claim is, in Paul's words. */
  label: string;
  /** How the source site states it — so Claude can recognise it when stripping. */
  sourceExample: string;
  /** The client build fact that must be VERIFIED before an equivalent may be written. */
  factKey: string;
}

export interface TemplateFactSpec { key: string; label: string; required: boolean; hint?: string }

/** What kind of identifier a seed value is — so later QA can say WHY a hit is a leak. */
export const SEED_VALUE_KINDS = ['business_name', 'owner', 'phone', 'email', 'domain', 'town', 'address', 'credential', 'profile', 'brand', 'claim', 'trade_word', 'image'] as const;
export type SeedValueKind = (typeof SEED_VALUE_KINDS)[number];
/** A value that belongs to the template's SEED client. Found in a generated client site = a leak,
 *  unless the new client has the same fact VERIFIED. Belongs to the template, never global. */
export interface ForbiddenSeedValue { kind: SeedValueKind; value: string }

/** An optional section the template can show or hide, and the fact that decides it. */
export interface TemplateSection { id: string; label: string; needsFact?: string }

/** An image slot the template expects the client to fill with their OWN asset. */
export interface TemplateImageSlot { id: string; label: string; required: boolean; spec: string }

/* ══ PHASE 3 — THE CONFIGURABLE FIELD MODEL ════════════════════════════════════════════════════
   A template DECLARES what it can be configured with; the mapping engine (templateMapping.ts) is
   trade-agnostic and only ever reads these declarations. A new trade template = a new declaration,
   no new code. */

export const FIELD_GROUPS = ['identity', 'business', 'services', 'locations', 'proof', 'commerce', 'assets', 'tracking'] as const;
export type FieldGroup = (typeof FIELD_GROUPS)[number];
export const FIELD_REQUIREMENTS = ['required', 'optional', 'conditional'] as const;
export type FieldRequirement = (typeof FIELD_REQUIREMENTS)[number];

/** Where a field's value comes from. The fact ledger is the source of truth for anything a client
 *  could state; a project value (the domain) or an operator choice covers the rest. */
export type FieldSource =
  | { fact: string }
  | { project: 'canonical_domain' }
  | { choice: readonly string[] };

export interface TemplateField {
  id: string;
  group: FieldGroup;
  label: string;
  requirement: FieldRequirement;
  source: FieldSource;
  /** For a conditional field: required when this other field has a value / one of these values. */
  requiredWhen?: { field: string; values?: readonly string[] };
  /** Where it lands in the generated client config: "business.phone". */
  configPath: string;
  hint?: string;
}

export interface TemplateService {
  id: string;
  name: string;
  /** Phrases that identify this service in a source site's service names, titles, H1s and URLs. */
  synonyms: readonly string[];
}

export interface TemplateAssetSlot {
  id: string;
  label: string;
  requirement: FieldRequirement;
  multiple: boolean;
  /** What suggests an asset for this slot: its recon type, and words in its purpose / filename / URL. */
  suggest: { types: readonly AssetType[]; words: readonly string[] };
}

export interface TemplateLocationPolicy {
  /** The template ships a page for the client's base / home town. */
  primaryLocationPage: boolean;
  /** Families a dedicated town page would use. */
  locationFamily: PageFamily;
}

export interface WebsiteTemplate {
  id: string;
  name: string;
  /** Bumped by hand whenever the source repo's structure changes. */
  version: string;
  /** The trade the template was built for. */
  trade: string;
  description: string;
  /** A deployed preview of the template itself, for design comparison. Blank until one exists. */
  previewUrl: string;
  /** The source client the structure came from — named so its facts are recognised as foreign. */
  sourceClient: string;
  sourceRepoUrl: string;
  sourceRepoOwner: string;
  sourceRepoPrivate: boolean;
  sourceBranch: string;
  framework: string;
  nodeVersion: string;
  installCommand: string;
  devCommand: string;
  devUrl: string;
  buildCommand: string;
  buildOutputDir: string;
  testCommand: string;
  cloudflare: string;
  /** Pages Functions the template ships (they deploy with the site) and the secrets they need. */
  serverFunctions: Array<{ path: string; purpose: string; secrets: string[] }>;
  defaultPageFamilies: Array<{ family: PageFamily; path: string; title: string; note?: string }>;
  reusableComponents: string[];
  visualStyle: string[];
  /** The trade this template was BUILT for, and every trade it genuinely serves as-is. These — and
   *  only these — decide whether the template is RECOMMENDED (F1, BS4 pilot: the locksmith template
   *  was recommended to an electrician because the list below mentions electricians). */
  primaryTrade: string;
  supportedTrades: string[];
  /** Descriptive only: trades the structure could be ADAPTED for. Never a recommendation. */
  supportedBusinessTypes: string[];
  facts: TemplateFactSpec[];
  /** Optional sections, each shown only when its fact is verified for the client. */
  optionalSections: TemplateSection[];
  imageRequirements: TemplateImageSlot[];
  /** Phase 3: every configurable field, its group, requirement and source. */
  fields: TemplateField[];
  /** Phase 3: the services this template has pages / cards for. Belongs to the TEMPLATE. */
  serviceCatalogue: TemplateService[];
  /** At least this many services must be included to build. */
  minServices: number;
  assetSlots: TemplateAssetSlot[];
  locations: TemplateLocationPolicy;
  /** Client-specific claim fields: every claim the source makes and the fact that must back it. */
  claims: TemplateClaim[];
  /** Every identifier of the seed client. Later QA fails a generated site that contains one. */
  forbiddenSeedValues: ForbiddenSeedValue[];
  /** Files in the source that carry client content and MUST be rewritten or emptied. */
  clientContentFiles: string[];
  /** Folders of client-owned assets that must be emptied and refilled with the new client's own. */
  clientAssetDirs: string[];
  /** Strings that prove source-client content survived. Every hit is removed or backed by a VERIFIED
   *  fact. DERIVED from forbiddenSeedValues (one list, not two). */
  leftoverNeedles: string[];
}

/** The supported page types, read from the template's own page families. */
export const templatePageTypes = (t: WebsiteTemplate) => [...new Set(t.defaultPageFamilies.map((f) => f.family))];
export const templateRequiredFacts = (t: WebsiteTemplate) => t.facts.filter((f) => f.required);
export const templateOptionalFacts = (t: WebsiteTemplate) => t.facts.filter((f) => !f.required);

/**
 * Every forbidden seed value found in a text, case-insensitive. For the future QA gate; pure.
 * ⛔ Positive: a hit is a leak unless the caller has the same value VERIFIED for the new client.
 */
export function findForbiddenSeedValues(text: string, t: WebsiteTemplate, verifiedValues: string[] = []): ForbiddenSeedValue[] {
  const allowed = verifiedValues.join(' | ');
  return t.forbiddenSeedValues.filter((v) => seedValueIn(text, v.value) && !seedValueIn(allowed, v.value));
}

/** Whole-word, case-insensitive: "Kent" is not found in "Kentish", "07395" is found in "07395 351 094". */
export function seedValueIn(text: string, value: string): boolean {
  if (!value) return false;
  const esc = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp('(^|[^a-z0-9])' + esc + '([^a-z0-9]|$)', 'i').test(text);
}

/** The trade-agnostic core — used as-is for Faithful / Bespoke builds, and extended by a template. */
export const CORE_FIELDS: TemplateField[] = [
  { id: 'business_name', group: 'identity', label: 'Business name', requirement: 'required', source: { fact: 'business_name' }, configPath: 'business.name' },
  { id: 'owner_name', group: 'identity', label: 'Owner / person customers deal with', requirement: 'optional', source: { fact: 'owner_name' }, configPath: 'business.owner' },
  { id: 'phone', group: 'identity', label: 'Phone', requirement: 'required', source: { fact: 'phone' }, configPath: 'business.phone' },
  { id: 'whatsapp', group: 'identity', label: 'WhatsApp number', requirement: 'optional', source: { fact: 'whatsapp_number' }, configPath: 'business.whatsapp', hint: 'Only a number the client confirmed is on WhatsApp.' },
  { id: 'email', group: 'identity', label: 'Email', requirement: 'required', source: { fact: 'email' }, configPath: 'business.email' },
  { id: 'domain', group: 'identity', label: 'Domain', requirement: 'required', source: { project: 'canonical_domain' }, configPath: 'business.domain' },
  { id: 'base_location', group: 'business', label: 'Base location (home town)', requirement: 'required', source: { fact: 'primary_town' }, configPath: 'locations.primary' },
  { id: 'service_area', group: 'business', label: 'Wider service area (wording)', requirement: 'optional', source: { fact: 'service_areas' }, configPath: 'locations.areaWording' },
  { id: 'hours', group: 'business', label: 'Opening hours', requirement: 'optional', source: { fact: 'opening_hours' }, configPath: 'business.hours' },
  { id: 'accreditations', group: 'proof', label: 'Accreditations / qualifications', requirement: 'optional', source: { fact: 'accreditations' }, configPath: 'proof.accreditations' },
  { id: 'insurance', group: 'proof', label: 'Insurance', requirement: 'optional', source: { fact: 'insurance' }, configPath: 'proof.insurance' },
  { id: 'reviews', group: 'proof', label: 'Review profiles', requirement: 'optional', source: { fact: 'review_profiles' }, configPath: 'proof.reviewProfiles' },
  { id: 'years_trading', group: 'proof', label: 'Years trading', requirement: 'optional', source: { fact: 'years_experience' }, configPath: 'proof.yearsTrading' },
  { id: 'prices', group: 'commerce', label: 'Prices', requirement: 'optional', source: { fact: 'prices' }, configPath: 'pricing.prices' },
  { id: 'analytics', group: 'tracking', label: 'Analytics ID', requirement: 'optional', source: { fact: 'analytics_ids' }, configPath: 'tracking.analytics' },
  { id: 'consent', group: 'tracking', label: 'Cookie consent', requirement: 'conditional', source: { choice: ['banner', 'none'] }, requiredWhen: { field: 'analytics' }, configPath: 'tracking.consent', hint: 'Required once any analytics or ads tag is used.' },
];
export const CORE_ASSET_SLOTS: TemplateAssetSlot[] = [
  { id: 'logo', label: 'Logo', requirement: 'optional', multiple: false, suggest: { types: ['logo'], words: ['logo'] } },
  { id: 'hero', label: 'Hero', requirement: 'optional', multiple: false, suggest: { types: ['photo'], words: ['hero', 'banner', 'header', 'homepage'] } },
  { id: 'owner', label: 'Owner / team', requirement: 'optional', multiple: false, suggest: { types: ['photo'], words: ['owner', 'team', 'portrait', 'founder', 'staff', 'about'] } },
  { id: 'gallery', label: 'Gallery', requirement: 'optional', multiple: true, suggest: { types: ['photo'], words: ['gallery', 'job', 'project', 'work', 'before', 'after'] } },
  { id: 'credentials', label: 'Credentials', requirement: 'optional', multiple: true, suggest: { types: ['badge', 'brand_logo'], words: ['badge', 'accredit', 'certif', 'member', 'approved', 'logo of'] } },
];
const byId = <T extends { id: string }>(list: T[], over: Partial<Record<string, Partial<T>>>, extra: T[] = []): T[] =>
  [...list.map((x) => ({ ...x, ...(over[x.id] ?? {}) })), ...extra];

const MCL_FORBIDDEN: ForbiddenSeedValue[] = [
  { kind: 'owner', value: 'Morgan' },
  { kind: 'business_name', value: 'MC Locksmiths' }, { kind: 'business_name', value: 'MCLocksmiths' },
  { kind: 'domain', value: 'mc-locksmiths' },
  { kind: 'town', value: 'Canterbury' }, { kind: 'town', value: 'Kent' }, { kind: 'town', value: 'Whitstable' }, { kind: 'town', value: 'Herne Bay' },
  { kind: 'phone', value: '07395' }, { kind: 'phone', value: '07848' }, { kind: 'phone', value: '447395351094' }, { kind: 'phone', value: '447848426374' },
  { kind: 'email', value: 'morganbusiness1' },
  { kind: 'address', value: 'Walden Court' }, { kind: 'address', value: 'CT2 7JQ' },
  { kind: 'credential', value: 'DBS' }, { kind: 'credential', value: 'NCFE' }, { kind: 'credential', value: 'City & Guilds' },
  { kind: 'credential', value: 'Hiscox' }, { kind: 'credential', value: 'Public Liability' }, { kind: 'credential', value: 'APECS' },
  { kind: 'profile', value: 'Checkatrade' }, { kind: 'profile', value: 'MyBuilder' }, { kind: 'profile', value: 'MyJobQuote' }, { kind: 'profile', value: 'MPL' },
  { kind: 'brand', value: 'Yale' }, { kind: 'brand', value: 'Chubb' }, { kind: 'brand', value: 'Mul-T-Lock' },
  { kind: 'trade_word', value: 'locksmith' },
  { kind: 'claim', value: '24/7' }, { kind: 'claim', value: '15-30 minutes' }, { kind: 'claim', value: '£65' }, { kind: 'claim', value: '£75' },
];

export const MCL_TEMPLATE_ID = 'mcl-local-trades';

export const MCL_TEMPLATE: WebsiteTemplate = {
  id: MCL_TEMPLATE_ID,
  name: 'MCL Local Trades Template',
  version: '1.0',
  trade: 'Locksmith',
  previewUrl: '',
  description: 'The finished MCLocksmiths site (Astro + Tailwind, Cloudflare Pages) as a reusable local-trades design system and page structure: hero, service and location card systems, CTA and floating call/WhatsApp actions, callback wizard, FAQ and pricing layouts, schema and redirect framework.',
  sourceClient: 'MC Locksmiths (Morgan, Canterbury)',
  sourceRepoUrl: 'https://github.com/Beyondweb2/MCLocksmiths.git',
  sourceRepoOwner: 'Beyondweb2',
  sourceRepoPrivate: true,
  sourceBranch: 'main',
  framework: 'Astro 7 + Tailwind CSS 4 + @astrojs/sitemap',
  nodeVersion: '22.12 or newer',
  installCommand: 'npm install',
  devCommand: 'npm run dev',
  devUrl: 'http://localhost:4321',
  buildCommand: 'npm run build',
  buildOutputDir: 'dist',
  testCommand: 'npm test',
  cloudflare: 'Cloudflare Pages. Static output in dist, plus Pages Functions from the functions folder (deployed automatically when wrangler runs from the project folder). Legacy redirects in public/_redirects.',
  serverFunctions: [
    { path: 'functions/api/public/lead.ts', purpose: 'Callback / enquiry form handler — emails the lead through Resend', secrets: ['RESEND_API_KEY', 'LEAD_FROM_EMAIL', 'LEAD_TO_EMAIL'] },
  ],
  defaultPageFamilies: [
    { family: 'homepage', path: '/', title: 'Home' },
    { family: 'services_index', path: '/services/', title: 'Services' },
    { family: 'service', path: '/services/<service-slug>/', title: 'One page per VERIFIED service', note: 'Only genuine services; the template had 22 locksmith services — do not carry them.' },
    { family: 'locations_index', path: '/locations/', title: 'Areas covered', note: 'Only when there are verified service areas.' },
    { family: 'location', path: '/locations/<town-slug>/', title: 'One page per town with genuinely different local content', note: 'Never cloned town pages.' },
    { family: 'commercial', path: '/commercial/', title: 'Commercial', note: 'Only if the client genuinely does commercial work.' },
    { family: 'pricing', path: '/pricing/', title: 'Pricing', note: 'Only with verified prices.' },
    { family: 'about', path: '/about/', title: 'About' },
    { family: 'faq', path: '/faqs/', title: 'FAQs' },
    { family: 'gallery', path: '/gallery/', title: 'Gallery', note: "Only with the client's own photos." },
    { family: 'contact', path: '/contact/', title: 'Contact' },
    { family: 'legal', path: '/privacy/', title: 'Privacy' },
    { family: 'legal', path: '/cookies/', title: 'Cookies' },
    { family: 'legal', path: '/terms/', title: 'Terms' },
  ],
  reusableComponents: [
    'Layout.astro (head, meta, JSON-LD entity graph with stable @id)', 'Header.astro / Footer.astro',
    'PageHero.astro', 'ServiceCard.astro / ServiceGridCard.astro', 'RelatedServices.astro / RelatedLocations.astro',
    'CtaSection.astro', 'FloatingActions.astro (sticky call + WhatsApp)', 'CallbackWizard.astro + ProblemSelector.astro',
    'FaqItem.astro', 'PricingItem.astro', 'TrustStrip.astro / CredentialItem.astro / BrandPanel.astro',
    'ReviewCard.astro', 'Breadcrumbs.astro', 'ContentSection.astro / ContentList.astro / SectionHeading.astro',
    'ConsentBanner.astro + analytics consent', 'Icon.astro', 'src/styles/global.css (design tokens)',
  ],
  visualStyle: [
    'Bold trade look: strong primary colour, dark header/footer, high-contrast CTAs',
    'Card grids for services and locations; icon-led trust strip',
    'Sticky mobile call / WhatsApp bar; mobile-first spacing',
    'Hero with photo, headline, two CTAs (call, WhatsApp)',
  ],
  primaryTrade: 'locksmith',
  supportedTrades: ['locksmith'],
  supportedBusinessTypes: ['Locksmiths', 'Plumbers / heating engineers', 'Electricians', 'Roofers', 'Builders', 'Other emergency or call-out local trades'],
  facts: [
    { key: 'business_name', label: 'Business name', required: true },
    { key: 'trade', label: 'Trade / category', required: true },
    { key: 'phone', label: 'Phone number', required: true },
    { key: 'whatsapp_number', label: 'WhatsApp number (verified as WhatsApp)', required: false, hint: 'Only a number the client has confirmed is on WhatsApp.' },
    { key: 'email', label: 'Email', required: true },
    { key: 'address', label: 'Business address', required: false },
    { key: 'primary_town', label: 'Home town', required: true },
    { key: 'service_areas', label: 'Service areas', required: true },
    { key: 'services', label: 'Services', required: true },
    { key: 'owner_name', label: 'Owner / person customers deal with', required: false },
    { key: 'opening_hours', label: 'Opening hours / availability', required: false, hint: 'e.g. 24/7 only if the client confirms it.' },
    { key: 'response_time', label: 'Response time', required: false },
    { key: 'years_experience', label: 'Years in business / experience', required: false },
    { key: 'accreditations', label: 'Accreditations / credentials / checks', required: false },
    { key: 'insurance', label: 'Insurance', required: false },
    { key: 'prices', label: 'Prices', required: false },
    { key: 'guarantee', label: 'Guarantees / warranties', required: false },
    { key: 'brands', label: 'Manufacturers / brands worked with', required: false },
    { key: 'review_profiles', label: 'Review profiles (Google, Checkatrade…)', required: false },
    { key: 'directory_profiles', label: 'Third-party / directory profiles', required: false },
    { key: 'social_profiles', label: 'Social profiles', required: false },
    { key: 'photos', label: "Client's own photos / logo", required: false },
    { key: 'standout', label: 'What makes them different', required: false },
    { key: 'availability', label: 'Availability (e.g. 24/7)', required: false, hint: '24/7 only if the client confirms it.' },
    { key: 'dbs', label: 'DBS check', required: false },
    { key: 'memberships', label: 'Memberships', required: false },
    { key: 'payment_methods', label: 'Payment methods', required: false },
  ],
  optionalSections: [
    { id: 'pricing', label: 'Pricing page / price-from on cards', needsFact: 'prices' },
    { id: 'gallery', label: 'Gallery', needsFact: 'photos' },
    { id: 'locations', label: 'Areas covered + location pages', needsFact: 'service_areas' },
    { id: 'commercial', label: 'Commercial page', needsFact: 'services' },
    { id: 'trust_strip', label: 'Trust strip / credentials', needsFact: 'accreditations' },
    { id: 'brands', label: 'Brand panel (manufacturer logos)', needsFact: 'brands' },
    { id: 'reviews', label: 'Review cards', needsFact: 'review_profiles' },
    { id: 'whatsapp', label: 'WhatsApp floating action', needsFact: 'whatsapp_number' },
    { id: 'guarantee', label: 'Guarantee block', needsFact: 'guarantee' },
  ],
  fields: byId(CORE_FIELDS, {}, [
    { id: 'mobile_or_premises', group: 'business', label: 'Mobile or premises', requirement: 'required', source: { choice: ['mobile', 'premises', 'both'] }, configPath: 'business.mode', hint: 'Mobile = no public address on the site.' },
    { id: 'address', group: 'business', label: 'Public address', requirement: 'conditional', source: { fact: 'address' }, requiredWhen: { field: 'mobile_or_premises', values: ['premises', 'both'] }, configPath: 'business.address' },
    { id: 'availability', group: 'business', label: 'Availability (e.g. 24/7)', requirement: 'optional', source: { fact: 'availability' }, configPath: 'business.availability' },
    { id: 'response_time', group: 'business', label: 'Response time', requirement: 'optional', source: { fact: 'response_time' }, configPath: 'business.responseTime' },
    { id: 'dbs', group: 'proof', label: 'DBS check', requirement: 'optional', source: { fact: 'dbs' }, configPath: 'proof.dbs' },
    { id: 'memberships', group: 'proof', label: 'Memberships', requirement: 'optional', source: { fact: 'memberships' }, configPath: 'proof.memberships' },
    { id: 'guarantee', group: 'proof', label: 'Guarantee', requirement: 'optional', source: { fact: 'guarantee' }, configPath: 'proof.guarantee' },
    { id: 'brands', group: 'proof', label: 'Brands fitted', requirement: 'optional', source: { fact: 'brands' }, configPath: 'proof.brands' },
    { id: 'payment_methods', group: 'commerce', label: 'Payment methods', requirement: 'optional', source: { fact: 'payment_methods' }, configPath: 'pricing.paymentMethods' },
    { id: 'ads', group: 'tracking', label: 'Google Ads ID', requirement: 'optional', source: { fact: 'ads_ids' }, configPath: 'tracking.ads' },
  ]).map((fl) => (fl.id === 'consent' ? { ...fl, requiredWhen: { field: 'analytics' } } : fl)),
  serviceCatalogue: [
    { id: 'emergency-lockouts', name: 'Emergency lockouts', synonyms: ['locked out', 'lockout', 'lock out', 'emergency locksmith', 'emergency entry', 'emergency', 'gain entry', 'non destructive entry', 'lost keys'] },
    { id: 'lock-changes', name: 'Lock changes & upgrades', synonyms: ['lock change', 'lock changes', 'change locks', 'lock replacement', 'replace locks', 'new locks', 'lock fitting', 'lock installation', 'lock upgrade', 'rekey'] },
    { id: 'upvc-door-mechanism', name: 'uPVC & multipoint repairs', synonyms: ['upvc', 'u pvc', 'multipoint', 'multi point', 'door mechanism', 'gearbox', 'door handle', 'upvc lock repairs'] },
    { id: 'high-security-upgrades', name: 'High-security upgrades', synonyms: ['high security', 'anti snap', 'anti-snap', 'ts007', 'sold secure', '3 star', 'british standard', 'bs3621', 'insurance approved'] },
    { id: 'burglary-repair', name: 'Burglary repairs', synonyms: ['burglary', 'break in', 'break-in', 'forced entry', 'board up', 'boarding up', 'after a break'] },
    { id: 'commercial', name: 'Commercial locksmith', synonyms: ['commercial', 'master key', 'access control', 'shop', 'office', 'landlord'] },
    { id: 'safe-opening', name: 'Safe opening', synonyms: ['safe opening', 'safe engineer', 'safe cracking', 'open a safe', 'safes'] },
    { id: 'key-safe-installation', name: 'Key safe installation', synonyms: ['key safe', 'keysafe', 'key box', 'key lock box'] },
    { id: 'garage-locks', name: 'Garage locks', synonyms: ['garage', 'garage door', 'shed lock'] },
  ],
  minServices: 1,
  /* Phase 4: the logo is OPTIONAL — with no approved logo the config carries a text wordmark of the
     verified business name (templateMapping.ts). A graphical logo is never generated. */
  assetSlots: byId(CORE_ASSET_SLOTS, {}, [
    { id: 'van', label: 'Van', requirement: 'optional', multiple: false, suggest: { types: ['photo'], words: ['van', 'vehicle', 'car'] } },
    { id: 'map', label: 'Map / area', requirement: 'optional', multiple: false, suggest: { types: ['photo', 'other'], words: ['map', 'area', 'coverage'] } },
  ]),
  locations: { primaryLocationPage: true, locationFamily: 'location' },
  imageRequirements: [
    { id: 'logo', label: 'Logo', required: true, spec: 'SVG preferred, else PNG 512px+ on transparent' },
    { id: 'favicon', label: 'Favicon set', required: true, spec: 'from the logo: 32px, 180px apple-touch, SVG' },
    { id: 'hero', label: 'Hero photo', required: false, spec: "the client's own, landscape 1600px+; omitted if none" },
    { id: 'og', label: 'Share image', required: false, spec: '1200x630' },
    { id: 'gallery', label: 'Gallery photos', required: false, spec: "the client's own job photos only" },
  ],
  claims: [
    { id: 'owner', label: 'Owner named in copy', sourceExample: '"Speak to Morgan directly"', factKey: 'owner_name' },
    { id: 'services', label: 'Service list (22 locksmith services, car keys page)', sourceExample: 'lock changes, uPVC repairs, emergency entry, auto locksmith', factKey: 'services' },
    { id: 'home_town', label: 'Home town and county', sourceExample: 'Canterbury, Kent', factKey: 'primary_town' },
    { id: 'areas', label: 'Service areas and location pages', sourceExample: 'Whitstable, Herne Bay and surrounding towns', factKey: 'service_areas' },
    { id: 'phone', label: 'Phone numbers (two lines)', sourceExample: '07395 351 094 / 07848 426 374', factKey: 'phone' },
    { id: 'whatsapp', label: 'WhatsApp links', sourceExample: 'wa.me/447395351094', factKey: 'whatsapp_number' },
    { id: 'email', label: 'Email address', sourceExample: 'morganbusiness1@outlook.com', factKey: 'email' },
    { id: 'address', label: 'Postal address', sourceExample: '28 Walden Court, Canterbury CT2 7JQ', factKey: 'address' },
    { id: 'availability', label: '24/7 availability', sourceExample: '"He answers 24/7"', factKey: 'opening_hours' },
    { id: 'response', label: 'Response time', sourceExample: '"typically 15-30 minutes"', factKey: 'response_time' },
    { id: 'credentials', label: 'Credentials', sourceExample: 'DBS checked, NCFE, City & Guilds', factKey: 'accreditations' },
    { id: 'insurance', label: 'Insurance', sourceExample: '"£5m Public Liability", Hiscox', factKey: 'insurance' },
    { id: 'prices', label: 'Prices', sourceExample: 'priceFrom "£65" / "£75"', factKey: 'prices' },
    { id: 'guarantee', label: 'Guarantees', sourceExample: '"Up to £2,500 break-in guarantee (APECS)"', factKey: 'guarantee' },
    { id: 'brands', label: 'Manufacturer logos / claims', sourceExample: 'Yale, Chubb, ERA, Mul-T-Lock, Union, Legge, APECS, CISA', factKey: 'brands' },
    { id: 'reviews', label: 'Reviews and review-platform badges', sourceExample: 'Checkatrade and Google review cards', factKey: 'review_profiles' },
    { id: 'profiles', label: 'Third-party profiles and badges', sourceExample: 'Checkatrade, MyBuilder, MyJobQuote, MPL', factKey: 'directory_profiles' },
    { id: 'experience', label: 'Years of experience', sourceExample: 'any "years" claim', factKey: 'years_experience' },
    { id: 'images', label: 'Photos, van, gallery, logo, favicon, share image', sourceExample: 'hero-van.webp, 95 gallery photos, orange MC logo', factKey: 'photos' },
  ],
  clientContentFiles: [
    'src/lib/siteConfig.ts', 'src/lib/homeContent.ts', 'src/lib/serviceContent.ts', 'src/lib/locationContent.ts',
    'src/lib/carKeysContent.ts', 'src/lib/galleryContent.ts', 'src/lib/leadEmail.ts', 'src/lib/leadContract.ts',
    'src/pages/*.astro (every page)', 'src/pages/car-keys.astro (MCL-only page — delete unless verified)',
    'src/components/*.astro (24 hard-coded MCL strings across Header, Footer, CTA, hero, cards, wizard)',
    'src/layouts/Layout.astro (entity JSON-LD, default meta)', 'astro.config.mjs (site: https://mc-locksmiths.com)',
    'public/_redirects (MCL legacy URLs — replace entirely)', 'public/robots.txt (sitemap URL)',
    'public/site.webmanifest, public/og-image.*', 'README.md, CLAUDE.md, AGENTS.md, docs/ (MCL records)',
    'tests/*.test.ts (assert MCL content — rewrite for the new client)',
  ],
  clientAssetDirs: ['public/images/gallery', 'public/images/badges', 'public/images/brands', 'public/images (hero-van.webp, logo.png)', 'public (favicons, apple-touch-icon, safari-pinned-tab.svg, og-image)'],
  forbiddenSeedValues: MCL_FORBIDDEN,
  leftoverNeedles: MCL_FORBIDDEN.map((v) => v.value),
};

export const WEBSITE_TEMPLATES: readonly WebsiteTemplate[] = [MCL_TEMPLATE];

/** Faithful / Bespoke: no template, the core field set and core asset slots, no catalogue. */
export const CORE_BUILD_MODEL = { fields: CORE_FIELDS, assetSlots: CORE_ASSET_SLOTS, serviceCatalogue: [] as TemplateService[], minServices: 0 };

/* ── TRADE COMPATIBILITY — the one rule for "recommended" ──────────────────────────────────────── */

/** compatible = the client's trade is the template's primary trade or one of its supported trades.
 *  weak = anything else (a template can still be CHOSEN deliberately, with a warning).
 *  unknown = no trade recorded — nothing is recommended. */
export type TradeFit = 'compatible' | 'weak' | 'unknown';
export function tradeFit(trade: string, t: WebsiteTemplate): TradeFit {
  if (!trade.trim()) return 'unknown';
  return templateSuitsTrade(trade, [t.primaryTrade, ...t.supportedTrades]) ? 'compatible' : 'weak';
}
export function recommendedTemplates(trade: string): WebsiteTemplate[] {
  return WEBSITE_TEMPLATES.filter((t) => tradeFit(trade, t) === 'compatible');
}
/** The route to RECOMMEND (the operator still chooses): a compatible template, else Bespoke / new
 *  trade. '' when the trade is not known yet. */
export function recommendedRoute(trade: string): 'template_rebuild' | 'bespoke' | '' {
  if (!trade.trim()) return '';
  return recommendedTemplates(trade).length ? 'template_rebuild' : 'bespoke';
}

export function templateById(id: string | null | undefined): WebsiteTemplate | null {
  return WEBSITE_TEMPLATES.find((t) => t.id === id) ?? null;
}

/** The facts every Findable build needs, template or not — used for a rebuild, where no template
 *  profile names them. The same keys as the template profile so a decision carries across routes. */
export const CORE_BUILD_FACTS: TemplateFactSpec[] = MCL_TEMPLATE.facts;
