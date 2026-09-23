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

import type { PageFamily } from './websiteBuildState.ts';

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

export interface WebsiteTemplate {
  id: string;
  name: string;
  description: string;
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
  supportedBusinessTypes: string[];
  facts: TemplateFactSpec[];
  claims: TemplateClaim[];
  /** Files in the source that carry client content and MUST be rewritten or emptied. */
  clientContentFiles: string[];
  /** Folders of client-owned assets that must be emptied and refilled with the new client's own. */
  clientAssetDirs: string[];
  /** Strings that prove source-client content survived. Every hit is removed or backed by a VERIFIED fact. */
  leftoverNeedles: string[];
}

export const MCL_TEMPLATE_ID = 'mcl-local-trades';

export const MCL_TEMPLATE: WebsiteTemplate = {
  id: MCL_TEMPLATE_ID,
  name: 'MCL Local Trades Template',
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
  leftoverNeedles: [
    'Morgan', 'MC Locksmiths', 'MCLocksmiths', 'mc-locksmiths', 'Canterbury', 'Kent', 'Whitstable', 'Herne Bay',
    '07395', '07848', '447395351094', '447848426374', 'morganbusiness1', 'Walden Court', 'CT2 7JQ',
    'DBS', 'NCFE', 'City & Guilds', 'Hiscox', 'Public Liability', 'APECS', 'Checkatrade', 'MyBuilder', 'MyJobQuote',
    'MPL', 'Yale', 'Chubb', 'Mul-T-Lock', 'locksmith', '24/7', '15-30 minutes', '£65', '£75',
  ],
};

export const WEBSITE_TEMPLATES: readonly WebsiteTemplate[] = [MCL_TEMPLATE];

export function templateById(id: string | null | undefined): WebsiteTemplate | null {
  return WEBSITE_TEMPLATES.find((t) => t.id === id) ?? null;
}

/** The facts every Findable build needs, template or not — used for a rebuild, where no template
 *  profile names them. The same keys as the template profile so a decision carries across routes. */
export const CORE_BUILD_FACTS: TemplateFactSpec[] = MCL_TEMPLATE.facts;
