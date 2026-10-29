/* UGC BRAND FINDER — actor inputs and outputs, pure (docs/ugc-brand-finder.md). fn ugc-brands builds every Apify
 * input here and turns every dataset item into a BrandCandidate here, so the tests prove both without Apify.
 *
 * ⛔ ONE BRAND PER KEY. The key is the website's bare domain; without a usable website, the Facebook page id,
 *    then the Instagram handle, then the normalised name. Two sources that find the same brand merge into one row.
 * ⛔ A platform / marketplace / link page is never a brand's website (instagram.com, linktr.ee, amazon…). */

import {
  CONTACT_LINKTREE_EXTRA_PAGES, CONTACT_PAGES_PER_SITE, ENRICH_DEPARTMENTS, ENRICH_LEADS_PER_BRAND, MARKETING_TITLE, NICHE_KEYWORDS, clampCap,
  type UgcCountry, type UgcNiche, type UgcSource,
} from './config.ts';

/** Where a WhatsApp-able number came from (Jess reads this before choosing who to message). */
export type WaSource = 'website_button' | 'maps_reception' | 'named_person';
export interface WaNumber { number: string; source: WaSource; label?: string }
export const WA_SOURCE_LABEL: Record<WaSource, string> = {
  website_button: 'Website support button', maps_reception: 'Google Maps (reception)', named_person: 'Named person',
};

/** A named marketing / partnerships person (contact scraper, leads enrichment). */
export interface NamedContact { name: string; title: string; email: string | null; email_status: string | null; linkedin: string | null; phone: string | null }

/** Digits for wa.me from a wa.me / api.whatsapp.com link or a number written with its country code; null otherwise. */
export function waDigits(raw: string | null | undefined): string | null {
  const v = String(raw ?? '').trim();
  if (!v) return null;
  const m = v.match(/(?:wa\.me\/|phone=)\+?(\d[\d\s-]{6,})/i);
  const d = (m ? m[1] : /^https?:/i.test(v) ? '' : v.startsWith('+') || v.startsWith('00') ? v : '').replace(/\D/g, '').replace(/^00/, '');
  return d.length >= 8 && d.length <= 15 ? d : null;
}

export function mergeWa(a: readonly WaNumber[] | null | undefined, b: readonly WaNumber[]): WaNumber[] {
  const out = [...(a ?? [])];
  for (const n of b) if (!out.some((x) => x.number === n.number)) out.push(n);
  return out;
}

export interface AdSample { text?: string; link?: string; started?: string }

export interface BrandCandidate {
  brand_key: string;
  name: string;
  website: string | null;
  domain: string | null;
  facebook_url: string | null;
  facebook_page_id: string | null;
  instagram_url: string | null;
  linktree_url: string | null;
  phones: string[];
  wa_numbers: WaNumber[];
  niche: string | null;
  country: string | null;
  sources: UgcSource[];
  live_ads_count: number;
  ad_samples: AdSample[];
  /** Start dates (YYYY-MM-DD) of the active video ads seen — Tier B reads these. */
  ad_start_dates: string[];
  creators_seen: string[];
  page_created_at: string | null;
  admin_countries: string[];
  shop_links: string[];
  has_address: boolean | null;
  /** Ad copy / snippet / description we saw — research for the pitch and text for the exclusion rules. */
  snippets: string[];
}

/* ── small helpers ─────────────────────────────────────────────────────────────────────────── */

const s = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const uniq = <T,>(xs: readonly T[]): T[] => [...new Set(xs)];

/** Hosts that are never a brand's own website. */
const PLATFORM_HOSTS = [
  'facebook.com', 'fb.com', 'fb.me', 'instagram.com', 'tiktok.com', 'youtube.com', 'youtu.be', 'twitter.com', 'x.com',
  'linkedin.com', 'pinterest.com', 'reddit.com', 'threads.net', 'linktr.ee', 'beacons.ai', 'bio.link', 'campsite.bio',
  'amazon.com', 'amazon.co.uk', 'etsy.com', 'ebay.com', 'ebay.co.uk', 'shopee.sg', 'shopee.com.my', 'shopee.ph', 'lazada.sg',
  'lazada.com.my', 'lazada.com.ph', 'aliexpress.com', 'temu.com', 'google.com', 'goo.gl', 'bit.ly', 'wa.me', 'whatsapp.com',
  'apps.apple.com', 'play.google.com', 'indeed.com', 'glassdoor.com', 'upwork.com', 'fiverr.com', 'collabstr.com',
  'backstage.com', 'tripadvisor.com', 'booking.com', 'agoda.com', 'medium.com', 'quora.com', 'wikipedia.org',
  /* Redirects, shorteners, ad trackers, app stores and serverless endpoints seen in real ads (2026-10-29): never a brand's site. */
  'tinyurl.com', 'ow.ly', 't.co', 'buff.ly', 'rebrand.ly', 'cutt.ly', 'lnk.to', 'app.link', 'onelink.me', 'adj.st', 'amzn.to',
  'doubleclick.net', 'googleadservices.com', 'googlesyndication.com', 'apple.com', 'on.aws', 'amazonaws.com', 'cloudfront.net',
  'linkin.bio', 'shopmy.us', 'l.instagram.com', 'typeform.com', 'calendly.com', 'forms.gle',
  /* Retailers stockists link to (seen live: Nordic Naturals -> costco.com): the retailer is never the brand's site. */
  'costco.com', 'costco.co.uk', 'walmart.com', 'target.com', 'boots.com', 'superdrug.com', 'hollandandbarrett.com', 'sephora.com',
  'sephora.co.uk', 'ulta.com', 'lookfantastic.com', 'cultbeauty.co.uk', 'iherb.com', 'tesco.com', 'sainsburys.co.uk', 'asda.com',
];
export const LINK_PAGE_HOSTS = ['linktr.ee', 'beacons.ai', 'bio.link', 'campsite.bio'];

export function hostOf(url: string | null | undefined): string | null {
  const raw = s(url);
  if (!raw) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return u.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '') || null;
  } catch { return null; }
}
const onHost = (host: string, list: readonly string[]) => list.some((h) => host === h || host.endsWith(`.${h}`));

/** Unwrap Facebook's l.facebook.com/l.php?u=… redirect to the real link. */
export function unwrapLink(url: string): string {
  try {
    const u = new URL(url);
    if (/(^|\.)facebook\.com$/.test(u.hostname) && u.pathname.startsWith('/l.php')) return u.searchParams.get('u') ?? url;
  } catch { /* keep */ }
  return url;
}

/** A brand's own website (origin only), or null for a platform / marketplace / link page. */
export function brandWebsite(url: string | null | undefined): { website: string; domain: string } | null {
  const raw = s(url);
  if (!raw) return null;
  const real = unwrapLink(raw);
  const host = hostOf(real);
  if (!host || !host.includes('.') || onHost(host, PLATFORM_HOSTS)) return null;
  return { website: `https://${host}`, domain: host };
}

export function instagramHandle(url: string | null | undefined): string | null {
  const host = hostOf(url);
  if (!host || !onHost(host, ['instagram.com'])) return null;
  try {
    const seg = new URL(/^https?:/i.test(s(url)) ? s(url) : `https://${s(url)}`).pathname.split('/').filter(Boolean)[0] ?? '';
    return /^[a-z0-9._]{1,30}$/i.test(seg) && !['p', 'reel', 'reels', 'explore', 'stories', 'accounts'].includes(seg.toLowerCase()) ? seg.toLowerCase() : null;
  } catch { return null; }
}

/** A creator name typed by Jess → their Instagram profile URL (handle, @handle or a profile link). */
export function creatorProfileUrl(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  const fromUrl = instagramHandle(t);
  const handle = fromUrl ?? t.replace(/^@/, '').toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(handle) ? `https://www.instagram.com/${handle}/` : null;
}

export function normaliseName(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ')
    .replace(/\b(ltd|limited|inc|llc|co|official|store|shop|uk|us)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
}

export function brandKey(c: Pick<BrandCandidate, 'domain' | 'facebook_page_id' | 'instagram_url' | 'name'>): string {
  if (c.domain) return `d:${c.domain}`;
  if (c.facebook_page_id) return `fb:${c.facebook_page_id}`;
  const ig = instagramHandle(c.instagram_url);
  if (ig) return `ig:${ig}`;
  return `n:${normaliseName(c.name) || 'unknown'}`;
}

function blank(name: string, source: UgcSource, niche: string | null, country: string | null): BrandCandidate {
  return {
    brand_key: '', name, website: null, domain: null, facebook_url: null, facebook_page_id: null, instagram_url: null,
    linktree_url: null, phones: [], wa_numbers: [], niche, country, sources: [source], live_ads_count: 0, ad_samples: [], ad_start_dates: [], creators_seen: [],
    page_created_at: null, admin_countries: [], shop_links: [], has_address: null, snippets: [],
  };
}
const keyed = (c: BrandCandidate): BrandCandidate => ({ ...c, brand_key: brandKey(c) });

/* ── inputs ────────────────────────────────────────────────────────────────────────────────── */

export function adLibraryUrl(keyword: string, country: UgcCountry): string {
  const q = encodeURIComponent(keyword);
  return `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}&media_type=video&q=${q}&search_type=keyword_unordered`;
}

export function fbAdsInput(niche: UgcNiche, country: UgcCountry, itemCap: number, keyword?: string) {
  const cap = clampCap(itemCap);
  const words = keyword?.trim() ? [keyword.trim()] : [...NICHE_KEYWORDS[niche]];
  return {
    startUrls: words.map((w) => ({ url: adLibraryUrl(w, country) })),
    resultsLimit: Math.max(1, Math.ceil(cap / words.length)),
    activeStatus: 'active',
    includeAboutPage: true,
    isDetailsPerAd: false,
  };
}

export function creatorCollabsInput(creators: readonly string[], itemCap: number) {
  const urls = uniq(creators.map(creatorProfileUrl).filter((u): u is string => !!u));
  const cap = clampCap(itemCap);
  return { startUrls: urls.map((url) => ({ url })), resultsLimit: Math.max(1, Math.ceil(cap / Math.max(1, urls.length))) };
}

export function placesInput(types: readonly string[], area: string, itemCap: number) {
  const cap = clampCap(itemCap);
  const list = types.length ? [...types] : ['hotel'];
  return {
    searchStringsArray: list,
    locationQuery: `${area}, Thailand`,
    maxCrawledPlacesPerSearch: Math.max(1, Math.ceil(cap / list.length)),
    language: 'en',
    skipClosedPlaces: true,
  };
}

export function googleQueries(niche: UgcNiche, keyword?: string): string[] {
  const w = keyword?.trim() || NICHE_KEYWORDS[niche][0];
  return [`"UGC creator" wanted ${w} brand`, `${w} brand "looking for UGC creators"`, `${w} "UGC creators" apply`];
}

export function googleSearchInput(niche: UgcNiche, country: UgcCountry, itemCap: number, keyword?: string) {
  const queries = googleQueries(niche, keyword);
  const pages = Math.max(1, Math.ceil(clampCap(itemCap) / 10 / queries.length));
  return { queries: queries.join('\n'), maxPagesPerQuery: pages, resultsPerPage: 10, countryCode: country === 'GB' ? 'uk' : country.toLowerCase(), mobileResults: false };
}

/** With enrich: the actor's Business Leads Enrichment — named marketing people, emails verified. */
/** Page details: each brand's OWN Ad Library page with its About tab (keyword searches return pageInfo.page empty —
 *  checked on a live run 2026-10-29), one result per page, so page age and admin countries come back. */
export function pageDetailsInput(pageIds: readonly string[]) {
  const ids = uniq(pageIds.filter((id) => /^\d{5,25}$/.test(id)));
  return {
    startUrls: ids.map((id) => ({ url: `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&view_all_page_id=${id}` })),
    resultsLimit: 1,
    includeAboutPage: true,
    isDetailsPerAd: false,
  };
}

/** The page facts one page-details item carries (page id, creation date, admin countries); null when it has none. */
export function pageFactsFrom(raw: unknown): { pageId: string; page_created_at: string | null; admin_countries: string[] } | null {
  const c = fromFbAd(raw, null, null);
  if (!c?.facebook_page_id) return null;
  return { pageId: c.facebook_page_id, page_created_at: c.page_created_at, admin_countries: c.admin_countries };
}

export function contactsInput(urls: readonly string[], enrich = false) {
  const start = uniq(urls.filter(Boolean));
  const leads = enrich ? {
    maximumLeadsEnrichmentRecords: ENRICH_LEADS_PER_BRAND,
    leadsEnrichmentDepartments: [...ENRICH_DEPARTMENTS],
    verifyLeadsEnrichmentEmails: true,
  } : {};
  return {
    ...leads,
    startUrls: start.map((url) => ({ url })),
    maxRequestsPerStartUrl: CONTACT_PAGES_PER_SITE,
    maxRequests: start.length * (CONTACT_PAGES_PER_SITE + CONTACT_LINKTREE_EXTRA_PAGES),
    maxDepth: 1,
    sameDomain: true,
    mergeContacts: true,
    considerChildFrames: false,
  };
}

/* ── outputs ───────────────────────────────────────────────────────────────────────────────── */

function creationDate(page: Record<string, unknown>): string | null {
  const items = arr(obj(obj(page.pagesTransparencyInfo)).historyItems);
  for (const it of items) {
    const o = obj(it);
    if (s(o.itemType).toUpperCase() !== 'CREATION') continue;
    const t = s(o.eventTimeFormatted) || s(o.eventTime);
    const n = Number(t);
    const d = Number.isFinite(n) && n > 1e9 ? new Date(n < 1e12 ? n * 1000 : n) : new Date(t);
    if (Number.isFinite(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return null;
}

/** An ad's start date as YYYY-MM-DD (startDate is unix seconds; startDateFormatted a date string). */
export function adStartDate(it: Record<string, unknown>): string | null {
  const n = Number(it.startDate);
  const d = Number.isFinite(n) && n > 1e9 ? new Date(n < 1e12 ? n * 1000 : n) : new Date(s(it.startDateFormatted) || s(it.startDate));
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : null;
}

export function fromFbAd(raw: unknown, niche: string | null, country: string | null): BrandCandidate | null {
  const it = obj(raw);
  const snap = obj(it.snapshot);
  const page = obj(obj(it.pageInfo).page);
  const name = s(it.pageName) || s(snap.pageName) || s(page.name);
  if (!name) return null;
  const c = blank(name, 'fb_ads', niche, country);
  c.facebook_page_id = s(it.pageID) || s(it.pageId) || s(page.id) || null;
  c.facebook_url = s(snap.pageProfileUri) || s(page.url) || null;
  const links = [s(snap.linkUrl), ...arr(snap.cards).map((x) => s(obj(x).linkUrl))].filter(Boolean).map(unwrapLink);
  c.shop_links = uniq(links);
  const site = links.map(brandWebsite).find(Boolean) ?? null;
  if (site) { c.website = site.website; c.domain = site.domain; }
  const ig = links.find((l) => instagramHandle(l));
  if (ig) c.instagram_url = `https://www.instagram.com/${instagramHandle(ig)}/`;
  c.live_ads_count = 1;
  const started = adStartDate(it);
  if (started) c.ad_start_dates = [started];
  const text = s(obj(snap.body).text) || s(snap.body);
  c.ad_samples = [{ text: text.slice(0, 280) || undefined, link: links[0], started: s(it.startDateFormatted) || undefined }];
  if (text) c.snippets = [text.slice(0, 400)];
  c.page_created_at = creationDate(page);
  const admins = arr(obj(obj(page.pagesTransparencyInfo).adminLocations).adminCountryCounts)
    .map((x) => s(obj(obj(x).country).isoName) || s(obj(x).country)).filter(Boolean);
  c.admin_countries = uniq(admins);
  return keyed(c);
}

/** One post from the branded-content scraper → one candidate per brand partner. */
export function fromCreatorCollab(raw: unknown, niche: string | null): BrandCandidate[] {
  const it = obj(raw);
  const creator = s(obj(it.creator).name) || s(obj(it.creator).link);
  return arr(it.brandPartners).map((p) => {
    const o = obj(p);
    const name = s(o.name);
    const link = s(o.link);
    if (!name && !link) return null;
    const c = blank(name || instagramHandle(link) || 'Unknown brand', 'creator_collabs', niche, null);
    if (instagramHandle(link)) c.instagram_url = `https://www.instagram.com/${instagramHandle(link)}/`;
    else if (hostOf(link)?.endsWith('facebook.com')) c.facebook_url = link;
    if (creator) c.creators_seen = [creator];
    if (s(it.link)) c.ad_samples = [{ link: s(it.link), started: s(it.dateCreated) || undefined }];
    return keyed(c);
  }).filter((c): c is BrandCandidate => !!c);
}

export function fromPlace(raw: unknown): BrandCandidate | null {
  const it = obj(raw);
  const name = s(it.title) || s(it.name);
  if (!name) return null;
  const cat = `${s(it.categoryName)} ${s(it.searchString)}`;
  const niche = /spa|wellness|massage|yoga|retreat/i.test(cat) ? 'wellness' : /caf[eé]|coffee|bakery|restaurant/i.test(cat) ? 'lifestyle' : 'travel';
  const c = blank(name, 'places', niche, 'TH');
  const site = brandWebsite(s(it.website));
  if (site) { c.website = site.website; c.domain = site.domain; }
  else if (instagramHandle(s(it.website))) c.instagram_url = s(it.website);
  if (s(it.phone)) {
    c.phones = [s(it.phone)];
    /* A Maps number is the venue's reception: worth a WhatsApp only when it is a mobile (derived on read). It is
       kept with its country code so wa.me can use it; a national-format number without one is left as a phone only. */
    const d = waDigits(s(it.phoneUnformatted) || s(it.phone));
    if (d) c.wa_numbers = [{ number: d, source: 'maps_reception' }];
  }
  c.has_address = s(it.address) ? true : null;
  const desc = [s(it.categoryName), s(it.description)].filter(Boolean).join(' — ');
  if (desc) c.snippets = [desc.slice(0, 400)];
  return keyed(c);
}

export function fromGoogleResults(raw: unknown, niche: string | null, country: string | null): BrandCandidate[] {
  return arr(obj(raw).organicResults).map((r) => {
    const o = obj(r);
    const url = s(o.url);
    const title = s(o.title);
    const ig = instagramHandle(url);
    const site = brandWebsite(url);
    if (!site && !ig) return null;
    const name = ig ? ig : title.split(/[|\-–—:]/)[0].trim() || site!.domain;
    const c = blank(name, 'google_search', niche, country);
    if (site) { c.website = site.website; c.domain = site.domain; }
    if (ig) c.instagram_url = `https://www.instagram.com/${ig}/`;
    const snip = [title, s(o.description)].filter(Boolean).join(' — ');
    if (snip) c.snippets = [snip.slice(0, 400)];
    return keyed(c);
  }).filter((c): c is BrandCandidate => !!c);
}

export interface ContactFind {
  startUrl: string;
  domain: string | null;
  emails: string[];
  instagrams: string[];
  wa_numbers: WaNumber[];
  named: NamedContact[];
  phones: string[];
  linktree: string | null;
  hasAboutPage: boolean;
}

const EMAIL_OK = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;
const EMAIL_JUNK = /(example\.|sentry|wixpress|\.png$|\.jpg$|\.webp$|@2x|noreply|no-reply|domain\.com)/i;

export function fromContactItem(raw: unknown): ContactFind | null {
  const it = obj(raw);
  const startUrl = s(it.originalStartUrl) || s(it.url);
  if (!startUrl) return null;
  const pages = arr(it.scrapedUrls).map(s);
  const ig = arr(it.instagrams).map(s).map((u) => instagramHandle(u)).filter((h): h is string => !!h).map((h) => `https://www.instagram.com/${h}/`);
  return {
    startUrl,
    domain: s(it.domain).replace(/^www\./, '') || hostOf(startUrl),
    emails: uniq(arr(it.emails).map((e) => s(e).toLowerCase()).filter((e) => EMAIL_OK.test(e) && !EMAIL_JUNK.test(e))),
    instagrams: uniq(ig),
    wa_numbers: uniq(arr(it.whatsapps).map((w) => waDigits(s(w))).filter((d): d is string => !!d))
      .map((number) => ({ number, source: 'website_button' as const })),
    named: namedContactsFrom(it.leadsEnrichment),
    phones: uniq(arr(it.phones).map(s).filter(Boolean)),
    linktree: [startUrl, ...pages].find((u) => onHost(hostOf(u) ?? '', LINK_PAGE_HOSTS)) ?? null,
    hasAboutPage: pages.some((u) => /\/(about|about-us|our-story|who-we-are)(\/|$|\?)/i.test(u)),
  };
}

/** Leads enrichment records → named marketing / partnerships people only (MARKETING_TITLE); best email first. */
export function namedContactsFrom(raw: unknown): NamedContact[] {
  const out: NamedContact[] = [];
  for (const r of arr(raw)) {
    const o = obj(r);
    const name = s(o.fullName) || [s(o.firstName), s(o.lastName)].filter(Boolean).join(' ');
    const title = s(o.jobTitle) || s(o.headline);
    if (!name || !MARKETING_TITLE.test(title)) continue;
    const email = s(o.email).toLowerCase() || null;
    out.push({ name, title, email: email && EMAIL_OK.test(email) ? email : null, email_status: s(obj(o.emailVerification).result) || null,
      linkedin: s(o.linkedinProfile) || null, phone: s(o.mobileNumber) || null });
  }
  /* A verified email (ok) first, then any email, then none. */
  const rank = (c: NamedContact) => (c.email && c.email_status === 'ok' ? 0 : c.email ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b)).filter((c, i, all) => all.findIndex((x) => x.name === c.name) === i);
}

/** The named person "Open in Gmail" uses: the first with a verified email, else null (the generic address is used). */
export function primaryNamedContact(list: readonly NamedContact[] | null | undefined): NamedContact | null {
  return (list ?? []).find((c) => c.email && c.email_status === 'ok') ?? null;
}

/* ── merge and rank ────────────────────────────────────────────────────────────────────────── */

export function mergeCandidates(list: readonly BrandCandidate[]): BrandCandidate[] {
  const by = new Map<string, BrandCandidate>();
  for (const c of list) {
    const was = by.get(c.brand_key);
    if (!was) { by.set(c.brand_key, { ...c }); continue; }
    by.set(c.brand_key, {
      ...was,
      website: was.website ?? c.website, domain: was.domain ?? c.domain,
      facebook_url: was.facebook_url ?? c.facebook_url, facebook_page_id: was.facebook_page_id ?? c.facebook_page_id,
      instagram_url: was.instagram_url ?? c.instagram_url, linktree_url: was.linktree_url ?? c.linktree_url,
      phones: uniq([...was.phones, ...c.phones]),
      wa_numbers: mergeWa(was.wa_numbers, c.wa_numbers),
      sources: uniq([...was.sources, ...c.sources]),
      live_ads_count: was.live_ads_count + c.live_ads_count,
      ad_samples: [...was.ad_samples, ...c.ad_samples].slice(0, 5),
      ad_start_dates: [...was.ad_start_dates, ...c.ad_start_dates],
      creators_seen: uniq([...was.creators_seen, ...c.creators_seen]),
      page_created_at: was.page_created_at ?? c.page_created_at,
      admin_countries: uniq([...was.admin_countries, ...c.admin_countries]),
      shop_links: uniq([...was.shop_links, ...c.shop_links]).slice(0, 20),
      has_address: was.has_address ?? c.has_address,
      snippets: uniq([...was.snippets, ...c.snippets]).slice(0, 6),
    });
  }
  return [...by.values()];
}

/** Most live ads first, then the most creators paid, then by name. */
export function rankBrands<T extends { live_ads_count?: number | null; creators_seen?: readonly string[] | null; name: string }>(list: readonly T[]): T[] {
  return [...list].sort((a, b) =>
    (b.live_ads_count ?? 0) - (a.live_ads_count ?? 0)
    || (b.creators_seen?.length ?? 0) - (a.creators_seen?.length ?? 0)
    || a.name.localeCompare(b.name));
}

export function candidatesFrom(source: Exclude<UgcSource, 'contacts'>, items: readonly unknown[], ctx: { niche: string | null; country: string | null }): BrandCandidate[] {
  const out: BrandCandidate[] = [];
  for (const it of items) {
    if (source === 'fb_ads') { const c = fromFbAd(it, ctx.niche, ctx.country); if (c) out.push(c); }
    else if (source === 'creator_collabs') out.push(...fromCreatorCollab(it, ctx.niche));
    else if (source === 'places') { const c = fromPlace(it); if (c) out.push(c); }
    else out.push(...fromGoogleResults(it, ctx.niche, ctx.country));
  }
  return mergeCandidates(out);
}
