/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SOCIAL PROFILES — THE ONE RULE (2026-09-30, Paul: Enrich as an end-to-end sales tool).

   Everything that decides WHAT a social link is and HOW SURE we are of it lives here, read by:
     - fn social-profiles (Find socials / add / confirm / reject) and fn enrich-business (paid), via
       supabase/functions/_shared/social-find.ts
     - the SPA's Socials line and review panel (labels, badges, the Search LinkedIn link)
     - scripts/social-profiles.test.ts (the fixture sample)
   The canonical pick (which profile goes on the lead) is ONE SQL function, _social_profiles_sync
   (migration 20260930140000) — this file grades, the database picks. Never a second copy of either.

   ⛔ FALSE POSITIVES ARE WORSE THAN NO RESULT. A link is REJECTED (never stored) when it is not a
      profile: a share / intent button, a post / video / reel, a bare homepage, an admin page, a
      display-truncated link ("/.../", "…"), a profile.php with no id, a website builder's or a
      platform's own account (instagram.com/wix), or a template placeholder.
   ⛔ Confidence:
      confirmed  — the business itself points at it: its own website (a link, or schema.org sameAs),
                   its Google listing, its questionnaire — or a person pasted / confirmed it
      likely     — found elsewhere with the name AND the town matching; or an own-site link whose
                   handle does not resemble the name (a footer "website by …" link is possible)
      unverified — anything weaker, or two different profiles competing for one platform on one
                   source, or a link already on a DIFFERENT business. Never canonical — a person decides.
   ⛔ LinkedIn is never scraped (Paul, 2026-09-30). A person's /in/ profile is stored only when their
      own website links to it; otherwise Sales gets Search LinkedIn (linkedInSearchUrl, below) and pastes the right one.

   Pure and edge-reachable: no imports, no `@/`.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** A LinkedIn people search for the business (a search link, never a scrape) — the Sales route to an
 *  owner / founder (Paul, 2026-09-30). Re-exported by focusQueue.ts for Focus Mode. */
export function linkedInSearchUrl(name: string | null | undefined, town?: string | null): string | null {
  const q = [name, town].filter((x) => x && String(x).trim()).join(' ').trim();
  return q ? `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(q)}` : null;
}

export type SocialPlatform = 'facebook' | 'instagram' | 'linkedin_company' | 'linkedin_person' | 'tiktok' | 'youtube' | 'x';
export type SocialConfidence = 'confirmed' | 'likely' | 'unverified';
export type SocialSource = 'website' | 'website_schema' | 'google_listing' | 'web_search' | 'questionnaire' | 'same_business' | 'manual' | 'legacy';

export interface SocialPlatformInfo {
  value: SocialPlatform;
  label: string;
  /** Pill / icon text. */
  short: string;
  /** Facebook, Instagram, LinkedIn: the three Sales reaches out on. The rest are shown, never chased. */
  priority: boolean;
}

export const SOCIAL_PLATFORMS: readonly SocialPlatformInfo[] = [
  { value: 'facebook', label: 'Facebook', short: 'Facebook', priority: true },
  { value: 'instagram', label: 'Instagram', short: 'Instagram', priority: true },
  { value: 'linkedin_company', label: 'LinkedIn (business page)', short: 'LinkedIn', priority: true },
  { value: 'linkedin_person', label: 'LinkedIn (person)', short: 'LinkedIn person', priority: true },
  { value: 'tiktok', label: 'TikTok', short: 'TikTok', priority: false },
  { value: 'youtube', label: 'YouTube', short: 'YouTube', priority: false },
  { value: 'x', label: 'X (Twitter)', short: 'X', priority: false },
];

export const SOCIAL_CONFIDENCE_LABEL: Record<SocialConfidence, string> = {
  confirmed: 'Confirmed',
  likely: 'Likely',
  unverified: 'Needs checking',
};

export const SOCIAL_SOURCE_LABEL: Record<SocialSource, string> = {
  website: 'linked from their website',
  website_schema: "listed in their website's profile data",
  google_listing: 'on their Google listing',
  web_search: 'found in a web search',
  questionnaire: 'from their questionnaire',
  same_business: 'already on this business (another record)',
  manual: 'added by a person',
  legacy: 'saved by the old Enrich',
};

export function socialPlatformLabel(p: string | null | undefined): string {
  return SOCIAL_PLATFORMS.find((x) => x.value === p)?.label ?? String(p ?? '');
}

/* ─────────────────────────────── normalising one link ─────────────────────────────── */

export type NormalisedSocial =
  | { ok: true; platform: SocialPlatform; url: string; urlKey: string; handle: string }
  | { ok: false; reason: SocialRejectReason };

export type SocialRejectReason =
  | 'empty' | 'unparseable' | 'not_social' | 'no_profile' | 'truncated' | 'share_link' | 'content_link'
  | 'admin_link' | 'platform_account' | 'placeholder' | 'bad_handle';

/** Website builders, platforms and directories whose OWN account turns up in a site template or a
 *  booking widget — never the business's profile. Compared against the whole handle, lowercased. */
const NOT_THE_BUSINESS_HANDLES = new Set<string>([
  'wix', 'wixcom', 'wixsite', 'wixcommunity', 'wixstudio', 'squarespace', 'godaddy', 'shopify', 'weebly', 'wordpress', 'wordpressdotcom',
  'wordpresscom', 'webflow', 'jimdo', 'strikingly', 'site123', 'webador', 'carrd', 'duda', 'yola', 'hostinger', 'ionos', '123reg',
  'facebook', 'facebookapp', 'meta', 'instagram', 'linkedin', 'youtube', 'tiktok', 'twitter', 'x', 'google', 'googlemybusiness',
  'fresha', 'booksy', 'treatwell', 'checkatrade', 'yell', 'yellcom', 'trustatrader', 'mybuilder', 'ratedpeople', 'bark', 'trustpilot',
  'nextdoor', 'houzz', 'gumtree', 'yelp', 'angi', 'homeadvisor', 'thumbtack', 'hipages', 'oneflare', 'airtasker', 'truelocal',
  'setmore', 'calendly', 'squareup', 'vagaro', 'mindbody',
]);
const PLACEHOLDER = /^(your|my)[-_.]?(page|company|business|username|handle|profile|name|account|channel)|^(username|example|placeholder|yourlink|handle|profile|page|company|business|account|test|demo)$|replace|changeme|sample/i;

const FB_RESERVED = new Set(['sharer', 'sharer.php', 'share', 'share.php', 'plugins', 'dialog', 'tr', 'login', 'login.php', 'l.php', 'events',
  'groups', 'watch', 'photo', 'photo.php', 'photos', 'story.php', 'permalink.php', 'hashtag', 'help', 'policies', 'privacy', 'ads', 'business',
  'marketplace', 'gaming', 'search', 'home.php', 'people', 'reel', 'reels', 'videos', 'posts', 'notes', 'media', 'settings', 'pg', 'legal', 'about']);
const IG_RESERVED = new Set(['p', 'reel', 'reels', 'tv', 'stories', 'explore', 'accounts', 'direct', 'about', 'legal', 'developer', 'web', 'create', 'ar']);
const X_RESERVED = new Set(['intent', 'share', 'home', 'i', 'search', 'hashtag', 'explore', 'settings', 'login', 'signup', 'tos', 'privacy', 'messages', 'notifications']);
const YT_CONTENT = new Set(['watch', 'shorts', 'embed', 'playlist', 'results', 'feed', 'live', 'v']);

function parse(raw: string): URL | null {
  const s = raw.trim().replace(/^\/\//, '');
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch { return null; }
}

function hostPlatform(host: string): 'facebook' | 'instagram' | 'linkedin' | 'tiktok' | 'youtube' | 'x' | null {
  const h = host.toLowerCase().replace(/^www\./, '');
  const on = (d: string) => h === d || h.endsWith(`.${d}`);
  if (on('facebook.com') || h === 'fb.com' || h === 'fb.me' || h === 'm.me') return 'facebook';
  if (on('instagram.com') || h === 'instagr.am') return 'instagram';
  if (on('linkedin.com') || h === 'lnkd.in') return 'linkedin';
  if (on('tiktok.com')) return 'tiktok';
  if (on('youtube.com') || h === 'youtu.be') return 'youtube';
  if (on('twitter.com') || on('x.com')) return 'x';
  return null;
}

function handleProblem(handle: string): SocialRejectReason | null {
  const h = handle.toLowerCase().replace(/^@/, '');
  if (!h) return 'no_profile';
  if (NOT_THE_BUSINESS_HANDLES.has(h.replace(/[._-]/g, ''))) return 'platform_account';
  if (PLACEHOLDER.test(h)) return 'placeholder';
  /* Accounts a small-business site links that are NOT the business (measured on the 2026-09-30
     backfill): a government body (x.com/DVLAgovuk on driving-school sites) and a theme / template
     author (x.com/bold_themes in a WordPress footer). */
  const flat = h.replace(/[._-]/g, '');
  if (/(govuk|govau|govus)$|^(gov|govuk|nhs|nhsuk)$/.test(flat)) return 'platform_account';
  if (/themes$|template/.test(flat)) return 'platform_account';
  return null;
}

/**
 * One link → a clean profile, or the reason it is not one. Mobile / regional hosts (m., en-gb., uk.,
 * mobile.) fold to the canonical host; tracking parameters and deep paths (/posts/…, /about) are cut;
 * a profile.php keeps its id (the id IS the page). `urlKey` is the dedupe key (lowercased, no slash).
 */
export function normaliseSocialUrl(raw: string | null | undefined): NormalisedSocial {
  const text = String(raw ?? '').trim();
  if (!text) return { ok: false, reason: 'empty' };
  if (/…|\/\.\.\.(\/|$)|\.\.\.$/.test(text)) return { ok: false, reason: 'truncated' };
  const u = parse(text);
  if (!u) return { ok: false, reason: 'unparseable' };
  const kind = hostPlatform(u.hostname);
  if (!kind) return { ok: false, reason: 'not_social' };
  const segs = u.pathname.split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch { return s; } });
  const first = (segs[0] ?? '').toLowerCase();
  const done = (platform: SocialPlatform, url: string, handle: string): NormalisedSocial => {
    const problem = handleProblem(handle);
    if (problem) return { ok: false, reason: problem };
    return { ok: true, platform, url, urlKey: url.toLowerCase().replace(/\/+$/, ''), handle };
  };

  if (kind === 'facebook') {
    if (/^(fb\.me|m\.me)$/i.test(u.hostname.replace(/^www\./, ''))) return { ok: false, reason: 'share_link' };
    if (!first) return { ok: false, reason: 'no_profile' };
    if (first === 'profile.php') {
      const id = u.searchParams.get('id') ?? '';
      if (!/^\d{5,}$/.test(id)) return { ok: false, reason: 'no_profile' };
      return done('facebook', `https://www.facebook.com/profile.php?id=${id}`, id);
    }
    if (first === 'pages' && segs[1]) {
      const id = segs.slice(1).find((s) => /^\d{5,}$/.test(s));
      if (!id) return { ok: false, reason: 'no_profile' };
      return done('facebook', `https://www.facebook.com/pages/${encodeURIComponent(segs[1])}/${id}`, segs[1]);
    }
    if (first === 'p' && segs[1]) return done('facebook', `https://www.facebook.com/p/${encodeURIComponent(segs[1])}`, segs[1]);
    if (/sharer|share\.php|dialog\/|plugins\//i.test(u.pathname)) return { ok: false, reason: 'share_link' };
    if (FB_RESERVED.has(first)) return { ok: false, reason: first === 'groups' || first === 'events' ? 'content_link' : 'no_profile' };
    if (!/^[a-z0-9.\-]{2,80}$/i.test(segs[0])) return { ok: false, reason: 'bad_handle' };
    return done('facebook', `https://www.facebook.com/${segs[0]}`, segs[0]);
  }

  if (kind === 'instagram') {
    if (!first) return { ok: false, reason: 'no_profile' };
    if (IG_RESERVED.has(first)) return { ok: false, reason: first === 'p' || first.startsWith('reel') || first === 'tv' || first === 'stories' ? 'content_link' : 'no_profile' };
    const h = segs[0].replace(/^@/, '');
    if (!/^[a-z0-9._]{1,30}$/i.test(h)) return { ok: false, reason: 'bad_handle' };
    return done('instagram', `https://www.instagram.com/${h}`, h);
  }

  if (kind === 'linkedin') {
    if (u.hostname.replace(/^www\./, '') === 'lnkd.in') return { ok: false, reason: 'share_link' };
    if (/share(Article)?|\/feed|\/posts\/|\/pulse\/|\/jobs/i.test(u.pathname)) return { ok: false, reason: first === 'shareArticle'.toLowerCase() || /share/i.test(first) ? 'share_link' : 'content_link' };
    if ((first === 'company' || first === 'showcase' || first === 'school') && segs[1]) {
      if (segs.slice(2).some((s) => /^admin$/i.test(s)) && /^\d+$/.test(segs[1])) return { ok: false, reason: 'admin_link' };
      if (!/^[a-z0-9\-_%.]{2,100}$/i.test(segs[1])) return { ok: false, reason: 'bad_handle' };
      return done('linkedin_company', `https://www.linkedin.com/company/${segs[1]}`, segs[1]);
    }
    if (first === 'in' && segs[1]) {
      if (!/^[a-z0-9\-_%.]{3,100}$/i.test(segs[1])) return { ok: false, reason: 'bad_handle' };
      return done('linkedin_person', `https://www.linkedin.com/in/${segs[1]}`, segs[1]);
    }
    return { ok: false, reason: 'no_profile' };
  }

  if (kind === 'tiktok') {
    if (!first.startsWith('@') || segs.length > 1) return { ok: false, reason: segs.length > 1 ? 'content_link' : 'no_profile' };
    const h = segs[0].slice(1);
    if (!/^[a-z0-9._]{2,24}$/i.test(h)) return { ok: false, reason: 'bad_handle' };
    return done('tiktok', `https://www.tiktok.com/@${h}`, h);
  }

  if (kind === 'youtube') {
    if (u.hostname.replace(/^www\./, '') === 'youtu.be' || YT_CONTENT.has(first)) return { ok: false, reason: 'content_link' };
    if (first.startsWith('@')) return done('youtube', `https://www.youtube.com/${segs[0]}`, segs[0].slice(1));
    if ((first === 'channel' || first === 'c' || first === 'user') && segs[1]) return done('youtube', `https://www.youtube.com/${first}/${segs[1]}`, segs[1]);
    return { ok: false, reason: 'no_profile' };
  }

  // x / twitter
  if (!first) return { ok: false, reason: 'no_profile' };
  if (X_RESERVED.has(first)) return { ok: false, reason: first === 'intent' || first === 'share' ? 'share_link' : 'no_profile' };
  if (segs.length > 1 && /^(status|statuses)$/i.test(segs[1])) return { ok: false, reason: 'content_link' };
  if (!/^[a-z0-9_]{1,15}$/i.test(segs[0])) return { ok: false, reason: 'bad_handle' };
  return done('x', `https://x.com/${segs[0]}`, segs[0]);
}

/** Every social profile link in a page's HTML: its anchors, plus schema.org sameAs (the site's own
 *  statement of "these are my profiles"). Rejected links are dropped; duplicates folded by key. */
export function extractSocialLinksFromHtml(html: string): Array<{ platform: SocialPlatform; url: string; urlKey: string; handle: string; via: 'link' | 'schema' }> {
  const out = new Map<string, { platform: SocialPlatform; url: string; urlKey: string; handle: string; via: 'link' | 'schema' }>();
  const add = (raw: string, via: 'link' | 'schema') => {
    const n = normaliseSocialUrl(raw.replace(/&amp;/g, '&'));
    if (!n.ok) return;
    const prev = out.get(n.urlKey);
    if (!prev || (via === 'schema' && prev.via === 'link')) out.set(n.urlKey, { platform: n.platform, url: n.url, urlKey: n.urlKey, handle: n.handle, via });
  };
  for (const m of html.matchAll(/href\s*=\s*["']([^"'#\s][^"'\s]*)["']/gi)) add(m[1], 'link');
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const stack: unknown[] = [JSON.parse(m[1].trim())];
      while (stack.length) {
        const n = stack.pop();
        if (Array.isArray(n)) { stack.push(...n); continue; }
        if (!n || typeof n !== 'object') continue;
        const same = (n as Record<string, unknown>).sameAs;
        for (const s of Array.isArray(same) ? same : same ? [same] : []) if (typeof s === 'string') add(s, 'schema');
        for (const v of Object.values(n as Record<string, unknown>)) if (v && typeof v === 'object') stack.push(v);
      }
    } catch { /* a malformed block is skipped, never fatal */ }
  }
  return [...out.values()];
}

/* ─────────────────────────────── matching a profile to a business ─────────────────────────────── */

/** Words that name a trade, a legal form or a country — they identify nobody. Includes the US / AU
 *  legal forms (LLC, Inc, Pty) so a US or Australian name is matched on its distinctive part. */
const NAME_NOISE = new Set<string>([
  'the', 'and', 'of', 'a', 'an', 'co', 'company', 'ltd', 'limited', 'llc', 'llp', 'lp', 'inc', 'incorporated', 'corp', 'corporation', 'plc',
  'pty', 'pl', 'group', 'holdings', 'uk', 'gb', 'usa', 'us', 'au', 'aus', 'australia', 'england', 'wales', 'scotland', 'official', 'page',
  'services', 'service', 'solutions', 'contractors', 'contractor', 'specialists', 'specialist', 'experts', 'expert', 'local', 'mobile',
  'electrical', 'electricals', 'electrician', 'electricians', 'electric', 'electrics', 'plumbing', 'plumber', 'plumbers', 'heating', 'gas',
  'boiler', 'boilers', 'locksmith', 'locksmiths', 'locks', 'roofing', 'roofer', 'roofers', 'building', 'builders', 'builder', 'construction',
  'driving', 'school', 'lessons', 'instructor', 'accounting', 'accountants', 'accountant', 'bookkeeping', 'cleaning', 'cleaners', 'cleaner',
  'repairs', 'repair', 'barber', 'barbers', 'barbershop', 'salon', 'hair', 'beauty', 'studio', 'garage', 'motors', 'auto', 'car', 'cars', 'keys',
  'landscaping', 'gardening', 'garden', 'painting', 'decorating', 'decorators', 'joinery', 'carpentry', 'flooring', 'windows', 'doors', 'glazing',
  'dental', 'dentist', 'clinic', 'law', 'lawyers', 'solicitors', 'legal', 'property', 'lettings', 'estate', 'agents', 'removals', 'shop', 'store',
]);

function nameTokens(name: string): string[] {
  return name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').split(/[^a-z0-9]+/)
    .filter((t) => t && !NAME_NOISE.has(t));
}

const squash = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

/** The registrable label of a website ("bmelectricals" from https://www.bmelectricals.co.uk/contact). */
export function websiteLabel(website: string | null | undefined): string {
  const u = parse(String(website ?? ''));
  if (!u) return '';
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  if (hostPlatform(host)) return '';
  const parts = host.split('.');
  // co.uk / com.au / org.uk style second-level suffixes
  const sld = parts.length >= 3 && /^(co|com|org|net|gov|ac|ltd|plc|me|nhs|edu|id|asn)$/.test(parts[parts.length - 2]);
  return squash(parts[parts.length - (sld ? 3 : 2)] ?? '');
}

/** Does the profile's handle name THIS business? A distinctive name word (3+ letters, not a trade or
 *  legal word) inside the handle, a 2-letter initialism that starts it, or the website's own label
 *  inside it (either way round). A numeric handle (profile.php?id=) never matches — it cannot. */
export function handleMatchesBusiness(handle: string, business: { name?: string | null; website?: string | null }): boolean {
  const h = squash(handle);
  if (h.length < 2 || /^\d+$/.test(h)) return false;
  const label = websiteLabel(business.website);
  if (label.length >= 4 && (h.includes(label) || (h.length >= 5 && label.includes(h)))) return true;
  const tokens = nameTokens(String(business.name ?? ''));
  if (tokens.some((t) => t.length >= 3 && h.includes(t))) return true;
  if (tokens.length && tokens[0].length === 2 && h.startsWith(tokens[0])) return true;
  const joined = tokens.join('');
  return joined.length >= 4 && h.includes(joined);
}

/** Does a piece of text (a search result's title / snippet) name the business's town? Plain words —
 *  never a UK postcode rule, so a US / AU town matches the same way. */
export function textMentionsTown(text: string | null | undefined, town: string | null | undefined): boolean {
  const t = ` ${squashWords(text)} `;
  const town0 = squashWords(town);
  return town0.length >= 3 && t.includes(` ${town0} `);
}
const squashWords = (s: string | null | undefined) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/* ─────────────────────────────── grading candidates ─────────────────────────────── */

export interface SocialCandidateInput {
  url: string;
  source: SocialSource;
  /** Free text found with it (a search result's title + snippet) — only web_search reads it. */
  context?: string | null;
  /** For same_business / legacy: the confidence it already carried. */
  carried?: SocialConfidence | null;
}

export interface GradedSocial {
  platform: SocialPlatform;
  url: string;
  urlKey: string;
  handle: string;
  source: SocialSource;
  confidence: SocialConfidence;
  evidence: { nameMatch: boolean; townMatch?: boolean; why: string; competing?: boolean; sharedWith?: number };
}

export interface SocialBusiness { name?: string | null; website?: string | null; town?: string | null }

const RANK: Record<SocialConfidence, number> = { unverified: 0, likely: 1, confirmed: 2 };
export const strongerConfidence = (a: SocialConfidence, b: SocialConfidence): SocialConfidence => (RANK[a] >= RANK[b] ? a : b);
export const isStronger = (a: SocialConfidence, b: SocialConfidence) => RANK[a] > RANK[b];

/** A source the business itself controls. */
const OWN_SOURCES = new Set<SocialSource>(['website', 'website_schema', 'google_listing', 'questionnaire']);

/**
 * Grade every candidate for one business. Invalid links are dropped (with their reasons returned).
 * Two DIFFERENT profiles for one platform from the business's own sources → the ones whose handle
 * names the business win if exactly one does; otherwise every one of them is unverified (competing)
 * — shown for review, never guessed. `sharedWith` (the number of OTHER businesses already holding the
 * same link) forces unverified: a link on two businesses is a franchise, a designer or a mistake.
 */
export function gradeSocialCandidates(
  candidates: readonly SocialCandidateInput[],
  business: SocialBusiness,
  sharedWith: Readonly<Record<string, number>> = {},
): { graded: GradedSocial[]; rejected: Array<{ url: string; reason: SocialRejectReason }> } {
  const rejected: Array<{ url: string; reason: SocialRejectReason }> = [];
  const byKey = new Map<string, GradedSocial>();
  for (const c of candidates) {
    const n = normaliseSocialUrl(c.url);
    if (n.ok === false) { rejected.push({ url: c.url, reason: (n as { reason: SocialRejectReason }).reason }); continue; }
    const nameMatch = handleMatchesBusiness(n.handle, business);
    let confidence: SocialConfidence;
    let why: string;
    let townMatch: boolean | undefined;
    if (c.source === 'manual') { confidence = 'confirmed'; why = 'added by a person'; }
    else if (c.source === 'questionnaire') { confidence = 'confirmed'; why = 'the business gave it'; }
    else if (OWN_SOURCES.has(c.source)) {
      /* An own-site link whose handle does not name the business: likely on Facebook / Instagram /
         LinkedIn (a numeric page id cannot name anyone, and own-site links there were right on the
         2026-09-30 sample); on X / YouTube / TikTok it was a stranger's channel as often as not (a video
         embed, a theme author), so it waits for a person. */
      const strongOnMismatch = n.platform === 'facebook' || n.platform === 'instagram' || n.platform === 'linkedin_company' || n.platform === 'linkedin_person';
      confidence = nameMatch || c.source === 'website_schema' ? 'confirmed' : strongOnMismatch ? 'likely' : 'unverified';
      why = nameMatch ? 'on their own site / listing and the handle matches the name' : c.source === 'website_schema' ? "in their site's own profile list (sameAs)" : 'on their own site / listing, but the handle does not match the name';
    } else if (c.source === 'web_search') {
      townMatch = textMentionsTown(c.context ?? '', business.town);
      confidence = nameMatch && townMatch ? 'likely' : 'unverified';
      why = nameMatch && townMatch ? 'name and town both match' : !nameMatch ? 'the name does not match' : 'the town does not match';
    } else {
      // same_business / legacy: what it carried, never more than likely unless it was confirmed
      confidence = c.carried ?? (nameMatch ? 'likely' : 'unverified');
      why = c.source === 'same_business' ? 'already on this business under another record' : 'saved by the old Enrich';
    }
    const g: GradedSocial = { platform: n.platform, url: n.url, urlKey: n.urlKey, handle: n.handle, source: c.source, confidence, evidence: { nameMatch, townMatch, why } };
    const prev = byKey.get(n.urlKey);
    if (!prev || isStronger(g.confidence, prev.confidence) || (g.confidence === prev.confidence && c.source === 'website_schema')) byKey.set(n.urlKey, g);
  }
  const graded = [...byKey.values()];

  // competing profiles on the business's own sources, per platform
  for (const platform of new Set(graded.map((g) => g.platform))) {
    const own = graded.filter((g) => g.platform === platform && OWN_SOURCES.has(g.source));
    if (own.length < 2) continue;
    const named = own.filter((g) => g.evidence.nameMatch || g.source === 'website_schema');
    const keep = named.length === 1 ? named[0] : null;
    for (const g of own) {
      if (g === keep) continue;
      g.confidence = 'unverified';
      g.evidence.competing = true;
      g.evidence.why = keep ? 'another profile on their site matches the name better' : 'their site links more than one — pick the right one';
    }
  }
  for (const g of graded) {
    const n = sharedWith[g.urlKey] ?? 0;
    if (n > 0 && g.source !== 'manual') { g.confidence = 'unverified'; g.evidence.sharedWith = n; g.evidence.why = `already saved on ${n === 1 ? 'another business' : `${n} other businesses`}`; }
  }
  return { graded, rejected };
}

/** Plain words for a rejected link (manual add). */
export const SOCIAL_REJECT_TEXT: Record<SocialRejectReason, string> = {
  empty: 'Paste a profile link.',
  unparseable: 'That is not a link.',
  not_social: 'That is not a Facebook, Instagram, LinkedIn, TikTok, YouTube or X link.',
  no_profile: 'That link is not a profile page — open their profile and copy the address from there.',
  truncated: 'That link is cut short ("…") — copy the full address.',
  share_link: 'That is a share button, not their profile.',
  content_link: 'That is a single post or video — copy their profile page instead.',
  admin_link: 'That is a page-admin link — copy the public profile address.',
  platform_account: "That is the platform's own account (e.g. Wix), not the business.",
  placeholder: 'That looks like a template placeholder, not a real profile.',
  bad_handle: 'That profile name does not look valid.',
};

/* ─────────────────────────────── the summary Sales reads ─────────────────────────────── */

export interface SocialProfileRow {
  id: string;
  platform: string;
  url: string;
  confidence: string;
  source: string;
  state: string;
  is_canonical: boolean;
  evidence?: Record<string, unknown> | null;
  confirmed_by?: string | null;
  updated_at?: string | null;
}

export type PlatformOutcome = { platform: 'facebook' | 'instagram' | 'linkedin'; state: 'confirmed' | 'likely' | 'review' | 'none'; url: string | null };

/** Per priority platform, what we have now — the "Facebook ✓ · Instagram none found · LinkedIn to
 *  check" line after a Find. LinkedIn folds the company page and the person (company first). */
export function socialOutcomes(rows: readonly SocialProfileRow[]): PlatformOutcome[] {
  const active = rows.filter((r) => r.state === 'active');
  const one = (platforms: string[], name: PlatformOutcome['platform']): PlatformOutcome => {
    const canon = platforms.map((p) => active.find((r) => r.platform === p && r.is_canonical)).find(Boolean);
    if (canon) return { platform: name, state: canon.confidence === 'confirmed' ? 'confirmed' : 'likely', url: canon.url };
    if (active.some((r) => platforms.includes(r.platform))) return { platform: name, state: 'review', url: null };
    return { platform: name, state: 'none', url: null };
  };
  return [one(['facebook'], 'facebook'), one(['instagram'], 'instagram'), one(['linkedin_company', 'linkedin_person'], 'linkedin')];
}

const OUTCOME_NAME = { facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn' } as const;
/** "Facebook confirmed · Instagram — none found · LinkedIn uncertain, check below". */
export function socialOutcomeSentence(outcomes: readonly PlatformOutcome[]): string {
  return outcomes.map((o) => {
    const n = OUTCOME_NAME[o.platform];
    if (o.state === 'confirmed') return `${n} confirmed`;
    if (o.state === 'likely') return `${n} likely`;
    if (o.state === 'review') return `${n} uncertain — check below`;
    return `No ${n} found`;
  }).join(' · ');
}
