/* RELATIVE imports with an explicit .ts — this file is reached by supabase/functions/directory-presence. */
import { factFor, type DirectoryFact } from './directoryFacts.ts';

/**
 * Does `resultHost` belong to `targetHost`? Exact match, or a subdomain WITH the dot, so
 * "business.yell.com" matches while "notyell.com" and "yell.com.evil.net" (registrable by anyone) do
 * not. NEVER string.includes(): "bing" matched plum·BING· (99 false hits) and "acca" matched
 * M·acca·-Gas. Moved here verbatim from the retired directoryHosts.ts (2026-09-30).
 */
export function hostMatches(resultHost: string, targetHost: string): boolean {
  const r = (resultHost ?? '').trim().toLowerCase().replace(/^www\./, '');
  const t = (targetHost ?? '').trim().toLowerCase().replace(/^www\./, '');
  if (!r || !t) return false;
  if (r === t) return true;
  return r.endsWith(`.${t}`);
}

/* ════════════════════════════════════════════════════════════════════════════════════════════
   PRESENCE SOURCES — what each place a business can be listed IS, keyed by HOST, never by trade.

   ⛔ THE SAME RULE AS directoryFacts.ts: nothing here says "Checkatrade is for plumbers". Which
   sources matter for a business is decided by EVIDENCE (the citations in its own audits, the trade
   fold, presence_trade_citation_hosts) or by the business's OWN CLAIM (its site says "Gas Safe registered").
   This file answers only: given a URL on this host, is it a profile page, what kind of source is it,
   and is it ever something we would recommend.

   `profile` is the path shape of ONE business's page. A directory's search or category page is not
   a listing, and a broad search surfaces those constantly — so a URL that fails `profile` can never
   raise a match above UNVERIFIED (directoryPresence.ts). Hosts with no known shape fall back to a
   generic test (a non-trivial path that is not a search/category path).
   ════════════════════════════════════════════════════════════════════════════════════════════ */

export type PresenceSourceKind =
  | 'map'           // Google Business Profile
  | 'directory'     // a listing site a business can appear on
  | 'review'        // a review platform (Trustpilot)
  | 'social'        // Facebook, Instagram, LinkedIn…
  | 'trade-body'    // a register/scheme the business must QUALIFY for
  | 'manufacturer'  // a manufacturer's installer/approved-trader finder
  | 'register'      // statutory (Companies House) — listing is automatic, never a task
  | 'other';        // a host we hold no record for

export interface PresenceSource {
  /** Canonical key, stored as lead_directory_presence.source_key. A host, except GBP. */
  key: string;
  label: string;
  kind: PresenceSourceKind;
  /** Hosts that belong to this source (dotted-suffix match via hostMatches — never includes()). */
  hosts: string[];
  /** Path (+ query) shape of ONE business's page on this source. */
  profile?: RegExp;
  /** The business's OWN claim that makes this source applicable: a `name` from fullCrawl.ts's
   *  CREDENTIALS list — the one ruler the crawl already reads credentials off a site with. Only
   *  trade bodies and manufacturer schemes carry one. */
  credential?: string;
  /** The entity anchor every local business should have. Only GBP. */
  core?: boolean;
  /** Never recommended, with the reason shown when asked. A found listing is still recorded. */
  neverRecommend?: string;
}

/* The generic "this is a search/category page, not a profile" test. */
const NOT_A_PROFILE = /\/(search|s|find|results?|category|categories|browse|near-me|directory|tag|list)(\/|$|\?)|[?&](q|query|search|keywords?|what|where)=/i;

export const PRESENCE_SOURCES: PresenceSource[] = [
  {
    key: 'google-business-profile', label: 'Google Business Profile', kind: 'map', core: true,
    hosts: ['google.com', 'google.co.uk', 'maps.google.com', 'maps.google.co.uk', 'business.google.com', 'g.page', 'maps.app.goo.gl'],
    profile: /^\/(maps\/place\/|maps\?cid=|\?cid=|maps\/search\/[^/]+\/@|[a-z0-9_-]{4,})|cid=\d+|place_id|ludocid/i,
  },
  {
    key: 'bing-places', label: 'Bing Places', kind: 'map',
    hosts: ['bingplaces.com', 'bing.com'],
    profile: /^\/maps\?.*(cp=|ss=)|^\/local\?/i,
    neverRecommend: 'Tested: no AI engine has ever cited Bing Places in our data, so it is not a lever we recommend.',
  },
  { key: 'facebook.com', label: 'Facebook', kind: 'social', hosts: ['facebook.com', 'fb.com', 'fb.me'],
    /* A group post (/groups/<id>/posts/…) is somebody talking ABOUT the business, not its page —
       measured live: two group posts were read as "a second Facebook profile". */
    profile: /^\/(?!sharer|share|plugins|dialog|login|help|policies|privacy|groups\b|watch|events\b|search|hashtag|marketplace|photo|story\.php|permalink\.php|reel\b)(p\/[^/]+|pages\/[^/]+\/\d+|profile\.php\?id=\d+|people\/[^/]+\/\d+|[a-z0-9.\-_]{3,})\/?/i },
  { key: 'instagram.com', label: 'Instagram', kind: 'social', hosts: ['instagram.com', 'instagr.am'],
    profile: /^\/(?!p\/|reel\/|explore|accounts|stories)[a-z0-9._]{2,}\/?$/i },
  { key: 'linkedin.com', label: 'LinkedIn', kind: 'social', hosts: ['linkedin.com'],
    profile: /^\/(company|in)\/[^/]+/i },
  { key: 'x.com', label: 'X / Twitter', kind: 'social', hosts: ['x.com', 'twitter.com'],
    profile: /^\/(?!intent|share|home|search|i\/)[a-z0-9_]{2,15}\/?$/i },
  { key: 'youtube.com', label: 'YouTube', kind: 'social', hosts: ['youtube.com'],
    profile: /^\/(@[^/]+|channel\/|c\/|user\/)/i },
  { key: 'tiktok.com', label: 'TikTok', kind: 'social', hosts: ['tiktok.com'], profile: /^\/@[^/]+\/?$/i },
  { key: 'nextdoor.com', label: 'Nextdoor', kind: 'social', hosts: ['nextdoor.co.uk', 'nextdoor.com'], profile: /^\/pages\/[^/]+/i },

  { key: 'yell.com', label: 'Yell', kind: 'directory', hosts: ['yell.com'], profile: /^\/biz\/[^/]+/i },
  { key: 'checkatrade.com', label: 'Checkatrade', kind: 'directory', hosts: ['checkatrade.com'], profile: /^\/trades\/[^/]+/i },
  { key: 'trustatrader.com', label: 'TrustATrader', kind: 'directory', hosts: ['trustatrader.com'], profile: /^\/traders\/[^/]+/i },
  { key: 'mybuilder.com', label: 'MyBuilder', kind: 'directory', hosts: ['mybuilder.com'], profile: /^\/profile\/[^/]+/i },
  { key: 'ratedpeople.com', label: 'Rated People', kind: 'directory', hosts: ['ratedpeople.com'], profile: /^\/profile\/[^/]+/i },
  { key: 'trustedtraders.which.co.uk', label: 'Which? Trusted Traders', kind: 'directory', hosts: ['trustedtraders.which.co.uk'], profile: /^\/businesses\/[^/]+/i },
  { key: 'bark.com', label: 'Bark', kind: 'directory', hosts: ['bark.com'], profile: /^\/[a-z]{2}\/[a-z]{2}\/company\/[^/]+/i },
  { key: 'yelp.com', label: 'Yelp', kind: 'directory', hosts: ['yelp.com', 'yelp.co.uk'], profile: /^\/biz\/[^/]+/i },
  { key: 'thomsonlocal.com', label: 'Thomson Local', kind: 'directory', hosts: ['thomsonlocal.com'] },
  { key: 'freeindex.co.uk', label: 'FreeIndex', kind: 'directory', hosts: ['freeindex.co.uk'], profile: /^\/profile\(/i },
  { key: 'houzz.co.uk', label: 'Houzz', kind: 'directory', hosts: ['houzz.co.uk', 'houzz.com'], profile: /^\/(pro|professionals)\/[^/]+/i },
  { key: 'uk.trustpilot.com', label: 'Trustpilot', kind: 'review', hosts: ['trustpilot.com'], profile: /^\/review\/[^/]+/i },

  /* Trade bodies and schemes. A credential is the business's OWN claim, matched against its site. */
  { key: 'gassaferegister.co.uk', label: 'Gas Safe Register', kind: 'trade-body', hosts: ['gassaferegister.co.uk'], credential: 'Gas Safe' },
  { key: 'niceic.com', label: 'NICEIC', kind: 'trade-body', hosts: ['niceic.com'], credential: 'NICEIC' },
  { key: 'napit.org.uk', label: 'NAPIT', kind: 'trade-body', hosts: ['napit.org.uk'], credential: 'NAPIT' },
  { key: 'locksmiths.co.uk', label: 'Master Locksmiths Association', kind: 'trade-body', hosts: ['locksmiths.co.uk'], credential: 'Master Locksmiths Association' },
  { key: 'trustmark.org.uk', label: 'TrustMark', kind: 'trade-body', hosts: ['trustmark.org.uk'], credential: 'TrustMark' },
  { key: 'fmb.org.uk', label: 'Federation of Master Builders', kind: 'trade-body', hosts: ['fmb.org.uk'], credential: 'Federation of Master Builders' },
  { key: 'ciphe.org.uk', label: 'CIPHE', kind: 'trade-body', hosts: ['ciphe.org.uk'], credential: 'CIPHE' },
  { key: 'oftec.org', label: 'OFTEC', kind: 'trade-body', hosts: ['oftec.org', 'oftec.org.uk'], credential: 'OFTEC' },
  { key: 'hetas.co.uk', label: 'HETAS', kind: 'trade-body', hosts: ['hetas.co.uk'], credential: 'HETAS' },
  { key: 'fensa.org.uk', label: 'FENSA', kind: 'trade-body', hosts: ['fensa.org.uk'], credential: 'FENSA' },
  { key: 'icaew.com', label: 'ICAEW', kind: 'trade-body', hosts: ['icaew.com'], credential: 'ICAEW' },
  { key: 'accaglobal.com', label: 'ACCA', kind: 'trade-body', hosts: ['accaglobal.com'], credential: 'ACCA' },
  { key: 'aat.org.uk', label: 'AAT', kind: 'trade-body', hosts: ['aat.org.uk'], credential: 'AAT' },
  { key: 'worcester-bosch.co.uk', label: 'Worcester Bosch accredited installer', kind: 'manufacturer', hosts: ['worcester-bosch.co.uk'], credential: 'Worcester Bosch Accredited' },
  { key: 'vaillant.co.uk', label: 'Vaillant Advance installer', kind: 'manufacturer', hosts: ['vaillant.co.uk'], credential: 'Vaillant Advance' },

  { key: 'company-information.service.gov.uk', label: 'Companies House', kind: 'register',
    hosts: ['find-and-update.company-information.service.gov.uk', 'company-information.service.gov.uk', 'companieshouse.gov.uk'],
    profile: /^\/company\/[A-Z0-9]{8}/i,
    neverRecommend: 'A statutory register: a limited company is listed automatically.' },
];

/* MASS-SUBMISSION NETWORKS AND SCRAPED AGGREGATORS. Never recommended, whatever the evidence says —
   they are the "submit to 100 directories" trap this feature must never become. A listing FOUND on
   one is still recorded when it is confirmed (an old phone number on one is a real consistency fact). */
export const NEVER_RECOMMEND_HOSTS: Record<string, string> = {
  'hotfrog.co.uk': 'Mass-submission directory network.',
  'hotfrog.com': 'Mass-submission directory network.',
  'brownbook.net': 'Mass-submission directory network.',
  'misterwhat.co.uk': 'Scraped aggregator.',
  'findopen.co.uk': 'Scraped aggregator.',
  'opendi.co.uk': 'Scraped aggregator.',
  'tupalo.net': 'Scraped aggregator.',
  'bizify.co.uk': 'Scraped aggregator.',
  'cybo.com': 'Scraped aggregator.',
  'yably.co.uk': 'Scraped aggregator.',
  'infobel.com': 'Scraped aggregator.',
  'showmelocal.com': 'Scraped aggregator.',
  'ratingsnearme.com': 'Auto-generated ranking page.',
  'threebestrated.co.uk': 'Pay-to-feature ranking site.',
  'topratedlocksmiths.co.uk': 'Auto-generated ranking page.',
  'endole.co.uk': 'Company-data aggregator.',
  'companycheck.co.uk': 'Company-data aggregator.',
  'opencorporates.com': 'Company-data aggregator.',
};

/** Parsed hostname, lowercased, one leading www. removed. Null when unparseable. */
export function hostOfUrl(raw: string): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : s.startsWith('//') ? `https:${s}` : `https://${s}`);
    return u.hostname.toLowerCase().replace(/^www\./, '') || null;
  } catch { return null; }
}

/** Path + query of a URL (not lowercased — profile regexes are case-insensitive themselves). */
export function pathOfUrl(raw: string): string {
  try {
    const s = String(raw ?? '').trim();
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return `${u.pathname}${u.search}`;
  } catch { return ''; }
}

export function sourceByKey(key: string): PresenceSource | undefined {
  return PRESENCE_SOURCES.find((s) => s.key === key);
}

/* A Google URL that is not a Maps/Business link (a search result page, a redirect) is not a profile.
   google.com is a GBP host only through these paths. */
const GOOGLE_NON_MAPS = /^\/(search|url|imgres|webhp|advanced_search|preferences)\b/i;

/** Which source does this URL belong to? A catalogue source first, then a directoryFacts host
 *  (as its own source), else an `other` source keyed by the host. Null when the URL is unparseable. */
export function sourceForUrl(url: string): { source: PresenceSource; fact: DirectoryFact | undefined } | null {
  const host = hostOfUrl(url);
  if (!host) return null;
  for (const s of PRESENCE_SOURCES) {
    if (!s.hosts.some((h) => hostMatches(host, h))) continue;
    if (s.key === 'google-business-profile' && /^google\./.test(host) && !/^\/maps\b/i.test(pathOfUrl(url))) {
      if (GOOGLE_NON_MAPS.test(pathOfUrl(url)) || !/cid=|place_id|ludocid/i.test(url)) return null;
    }
    return { source: s, fact: factFor(s.key) ?? factFor(host) };
  }
  const fact = factFor(host);
  if (fact) {
    const kind: PresenceSourceKind = fact.kind === 'trade-body' ? 'trade-body'
      : fact.kind === 'register' ? 'register'
      : fact.kind === undefined || fact.kind === 'directory' ? 'directory' : 'other';
    return { source: { key: fact.host, label: fact.label, kind, hosts: [fact.host] }, fact };
  }
  return { source: { key: host, label: host, kind: 'other', hosts: [host] }, fact: undefined };
}

/** Is this URL ONE business's page on its source? Known shape when the source has one; otherwise a
 *  non-trivial path that is not a search/category page. */
export function isProfileUrl(url: string, source: PresenceSource): boolean {
  const path = pathOfUrl(url);
  if (source.profile) return source.profile.test(path) || source.profile.test(String(url));
  if (!path || path === '/' || NOT_A_PROFILE.test(path)) return false;
  return path.replace(/\/+$/, '').split('/').filter(Boolean).length >= 1;
}

/** Why a source may never be recommended, or null when it may be (subject to evidence). */
export function neverRecommendReason(source: PresenceSource, fact: DirectoryFact | undefined): string | null {
  if (source.neverRecommend) return source.neverRecommend;
  for (const h of source.hosts) {
    for (const [junk, why] of Object.entries(NEVER_RECOMMEND_HOSTS)) if (hostMatches(h, junk)) return why;
  }
  if (fact?.notAListing) return 'Not a listing you can join.';
  if (fact && fact.kind && !['directory', 'trade-body'].includes(fact.kind)) {
    return fact.kind === 'own-site' ? "Another business's own website — you cannot be listed there."
      : fact.kind === 'editorial' ? 'Editorial coverage, not a listing.'
      : fact.kind === 'community' ? 'A forum, not a listing.'
      : fact.kind === 'aggregator' ? 'Auto-generated from public data; nothing to join.'
      : 'Not a listing you can join.';
  }
  if (source.kind === 'register') return 'A statutory register, listed automatically.';
  if (source.kind === 'other') return 'A source we hold no record for — it needs a human look before it could be recommended.';
  return null;
}
