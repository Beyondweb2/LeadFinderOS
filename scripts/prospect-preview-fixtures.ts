/* PROSPECT PREVIEW — test fixtures. TEST DATA ONLY: fictional contact details (Ofcom drama-range
   numbers 01632 960xxx, .example domains). The E.E.S Electrical / Addlestone shape follows the
   pattern Paul described; nothing here is read from, or written to, production. */

import type { FactsInput } from '../src/lib/prospectPreview/facts.ts';
import type { ProspectHeadline } from '../src/lib/prospectPreview/types.ts';
import type { ResearchForCard } from '../src/lib/prospectPreview/findings.ts';
import type { ResearchFinding } from '../src/lib/warmLeadResearch.ts';

export const FIXTURE_ASSET_BASE_DEFAULT = 'http://127.0.0.1:4777';

const f = (id: string, kind: ResearchFinding['kind'], title: string, detail: string, strength: ResearchFinding['strength'], evidence: string[] = [], source: ResearchFinding['source'] = 'crawl'): ResearchFinding =>
  ({ id, kind, category: kind === 'title_h1' || kind === 'missing_core_service_pages' ? 'content' : 'technical', title, detail, evidence, pageUrl: null, strength, source, verified: true });

export const FINDING_CRAWLER_BLOCKED = f('crawl:crawler_blocked:0', 'crawl_indexing', 'AI search crawlers are blocked',
  'The site’s robots.txt blocks OAI-SearchBot and PerplexityBot. That can stop those AI tools reading the site.', 5, ['OAI-SearchBot', 'PerplexityBot']);
export const FINDING_NO_SERVICE_PAGES = f('rule:missing_core_service_pages', 'missing_core_service_pages', 'Core services have no pages',
  'Consumer unit upgrades, rewiring and EICR testing are listed on the homepage but none has a page of its own.', 4, ['Consumer Unit Upgrades', 'Rewiring', 'EICR Testing'], 'rule');
export const FINDING_DOORWAYS = f('full:doorway_towns', 'thin_or_duplicate', 'Many near-identical town pages',
  '46 pages are the same text with the town name swapped.', 3, ['46 pages', '/electrician-in-weybridge/', '/electrician-in-chertsey/']);
export const FINDING_TITLE = f('rule:title_h1', 'title_h1', 'Homepage title does not name the trade or town',
  'The homepage title is "Home" and there is no H1.', 2, ['Home'], 'rule');
export const FINDING_MISSING_META = f('rule:meta', 'other', 'Missing meta description', 'No meta description.', 1, [], 'rule');

export function eesHeadline(): ProspectHeadline {
  return {
    auditId: 'fixture-audit-ees', runId: 'fixture-run-ees-1',
    question: 'electrician in Addlestone',
    engines: ['ChatGPT'],
    competitors: ['Addlestone Electricians', 'Pennington’s Electrical', 'Helsdown Electrical Contractors Ltd'],
    prospectNamed: false, trade: 'Electricians', town: 'Addlestone', namedDatapoints: 0, totalDatapoints: 6,
  };
}

export function eesResearch(kind: 'strong' | 'content' | 'clean' = 'strong'): ResearchForCard {
  if (kind === 'clean') return { status: 'complete', technicallyClean: true, strongestFindings: [FINDING_MISSING_META] };
  if (kind === 'content') return { status: 'complete', technicallyClean: true, strongestFindings: [FINDING_NO_SERVICE_PAGES, FINDING_TITLE, FINDING_MISSING_META] };
  return { status: 'complete', technicallyClean: false, strongestFindings: [FINDING_CRAWLER_BLOCKED, FINDING_NO_SERVICE_PAGES, FINDING_DOORWAYS, FINDING_TITLE, FINDING_MISSING_META] };
}

const EES_HOME_TEXT = [
  'E.E.S Electrical is an electrical contractor based in Addlestone, Surrey, working on homes and small commercial premises.',
  'Our electricians carry out electrical installations, consumer unit upgrades, full and partial rewiring, EICR testing and EV charger installation.',
  'We replace old fuse boxes with modern consumer units that meet current regulations.',
  'A full or partial rewire brings older properties up to current safety standards.',
  'EICR testing gives landlords and homeowners a clear report on the condition of their wiring.',
  'We install home EV chargers with the correct certification for your installation.',
  'We are NICEIC approved contractors and Part P registered.',
  'Established in 2009.',
  'Areas we cover: Addlestone, Weybridge, Chertsey, New Haw and Ottershaw.',
  'Call 01632 960123 or email info@ees-electrical.example for a quote.',
].join(' ');

export function eesFacts(opts: { assetBase?: string; logo?: boolean; photos?: boolean; conflict?: boolean } = {}): FactsInput {
  const base = opts.assetBase ?? FIXTURE_ASSET_BASE_DEFAULT;
  const text = opts.conflict ? EES_HOME_TEXT + ' Over 25 years’ experience.' : EES_HOME_TEXT;
  return {
    fixture: true,
    lead: {
      id: 'fixture-lead-ees', business_name: 'E.E.S Electrical', website: 'https://www.ees-electrical.example',
      phone: '01632 960123', email: null, address: null, category: 'Electrician', search_keyword: 'electricians',
      search_location: 'Addlestone', derived_town: 'Addlestone', rating: 4.9, review_count: 23,
    },
    audit: { trade: 'Electricians', town: 'Addlestone' },
    siteInfo: {
      email: 'info@ees-electrical.example', phone: opts.conflict ? '07700 900456' : '01632 960123', address: null, openingHours: null,
      services: ['Home', 'Electrical Installations', 'Consumer Unit Upgrades', 'Rewiring', 'EICR Testing', 'EV Charger Installation', 'Electrician in Weybridge', 'Electrician in Chertsey', 'Contact Us'],
      towns: ['weybridge', 'chertsey', 'new-haw', 'ottershaw', 'woking', 'staines', 'egham', 'byfleet', 'walton-on-thames', 'hersham'],
    },
    pages: [{ url: 'https://www.ees-electrical.example/', ok: true, text, metaDescription: null, title: 'Home' }],
    brand: {
      logoUrl: opts.logo === false ? null : `${base}/fixture/ees-logo.svg`, logoWarning: null,
      primary: '#0b5fcf', accent: '#facc15', colourSource: 'fixture',
      photos: opts.photos ? [`${base}/assets/stock-04.jpg`, `${base}/assets/stock-05.jpg`, `${base}/assets/stock-06.jpg`] : [],
    },
  };
}

/** A second, unrelated prospect — used for the leak test and the photos-present render. */
export function keylineFacts(opts: { assetBase?: string } = {}): FactsInput {
  const base = opts.assetBase ?? FIXTURE_ASSET_BASE_DEFAULT;
  return {
    fixture: true,
    lead: {
      id: 'fixture-lead-keyline', business_name: 'Keyline Locksmiths', website: 'https://keyline-locks.example',
      phone: '01632 960777', email: null, address: null, category: 'Locksmith', search_keyword: 'locksmiths',
      search_location: 'Woking', derived_town: 'Woking', rating: 4.7, review_count: 58,
    },
    audit: { trade: 'Locksmiths', town: 'Woking' },
    siteInfo: {
      email: 'help@keyline-locks.example', phone: '01632 960777', address: null, openingHours: ['Mo-Sa 08:00-18:00'],
      services: ['Lock Changes', 'uPVC Door Repairs', 'Lockouts', 'Key Cutting', 'Safe Opening'],
      towns: [],
    },
    pages: [{ url: 'https://keyline-locks.example/', ok: true, metaDescription: 'Keyline Locksmiths is an independent locksmith in Woking offering lock changes, uPVC door repairs and lockout help.', title: 'Keyline Locksmiths Woking',
      text: 'Keyline Locksmiths is an independent locksmith in Woking. We change locks, repair uPVC doors, cut keys and open safes. We are members of the Master Locksmiths Association. Serving Woking, Knaphill, Byfleet and West Byfleet.' }],
    brand: {
      logoUrl: null, logoWarning: null, primary: '#b91c1c', accent: null, colourSource: 'fixture',
      photos: [`${base}/assets/stock-04.jpg`, `${base}/assets/stock-05.jpg`, `${base}/assets/stock-06.jpg`, `${base}/assets/stock-01.png`, `${base}/assets/stock-02.png`],
    },
  };
}

export function keylineHeadline(): ProspectHeadline {
  return {
    auditId: 'fixture-audit-keyline', runId: 'fixture-run-keyline-1', question: 'emergency locksmith Woking', engines: ['Gemini'],
    competitors: ['Woking Lock Co', 'Surrey Secure Locks'], prospectNamed: false, trade: 'Locksmiths', town: 'Woking', namedDatapoints: 1, totalDatapoints: 6,
  };
}

/** The fixture logo — test artwork, not anyone's real mark. */
export const EES_LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="232" height="56" viewBox="0 0 232 56"><rect x="0" y="4" width="48" height="48" rx="12" fill="#0b5fcf"/><path d="M27 12 16 31h8l-2 13 11-19h-8z" fill="#facc15"/><text x="60" y="30" font-family="Arial Black,Arial,sans-serif" font-weight="900" font-size="22" fill="#0f172a">E.E.S</text><text x="60" y="48" font-family="Arial,sans-serif" font-weight="700" font-size="13" letter-spacing="3" fill="#0b5fcf">ELECTRICAL</text></svg>';
