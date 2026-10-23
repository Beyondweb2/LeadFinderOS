/* ════════════════════════════════════════════════════════════════════════════════════════════════
   LINKEDIN DISCOVERY — THE PROVIDER CONTRACTS (2026-09-30). Pure: builds actor inputs and maps actor
   outputs. The network call lives in _shared/linkedin-discovery.ts.

   CHOSEN (Apify Store read 2026-09-30; the comparison is in docs/linkedin-decision-maker.md):
     · SEARCH  apify~google-search-scraper — a Google `site:linkedin.com/in "Name" "Company"` query.
       No LinkedIn login, no cookies, Apify's own actor, already on this account for the audits.
       Returns Google's public result title + snippet; the name / headline / company / location are
       PARSED from them here (Google's LinkedIn title shape: "Name - Headline - Company | LinkedIn").
     · VERIFY  harvestapi~linkedin-profile-scraper — ONE known profile URL → structured current job,
       location and website. No login or cookies. Optional, admin-only, off by default.
   ⛔ Neither touches anyone's LinkedIn account. Nothing here views, follows, connects or messages.
   ⛔ COSTS ARE ESTIMATES FROM THE PRICE LIST (CLAUDE.md §4: a rate copied from a price list is a guess
      until a billed row agrees). The real figure is read back from Apify after every run
      (resolveSyncRunCost) and that is what is logged; these constants only size the pre-spend check.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { canonicalLinkedInUrl, companyNameKey, type DiscoveryCountry, type ProfileCandidate } from './linkedinMatch.ts';
import { tidyPersonName } from './decisionMaker.ts';

export const LINKEDIN_SEARCH_ACTOR = 'apify~google-search-scraper';
export const LINKEDIN_VERIFY_ACTOR = 'harvestapi~linkedin-profile-scraper';

/** Price list, 2026-09-30, FREE tier: $0.0045 per results page + $0.001 per run. ESTIMATE — see header. */
export const LINKEDIN_SEARCH_EST_USD = 0.0055;
/** Price list, 2026-09-30: $0.004 per profile. ESTIMATE — see header. */
export const LINKEDIN_VERIFY_EST_USD = 0.004;
/** Apify's per-run spend ceiling (query param maxTotalChargeUsd). The Google actor's own minimum is
 *  0.5; this caps a runaway, it is not what a run costs. */
export const LINKEDIN_RUN_MAX_CHARGE_USD = 0.5;

const COUNTRY_ISO2: Record<DiscoveryCountry, string> = { UK: 'gb', US: 'us', AU: 'au' };

/** One Google query per person. At most 32 words (the actor's limit). Quotes keep the name and the
 *  business together; the town is unquoted so "Leeds, England" still matches. */
export function buildSearchQuery(args: { personName: string; businessName: string; town?: string | null }): string {
  const person = tidyPersonName(args.personName).replace(/"/g, '');
  const bizRaw = args.businessName.replace(/"/g, '').trim();
  // The quoted business phrase is the NAME WITHOUT its legal suffix, as LinkedIn titles rarely carry it,
  // kept in the original case for readability.
  const key = companyNameKey(bizRaw);
  const biz = key && key.split(' ').length >= 1 ? key : bizRaw;
  const words = ['site:linkedin.com/in', `"${person}"`, `"${biz}"`, args.town ? args.town.trim() : ''].filter(Boolean).join(' ');
  return words.split(/\s+/).slice(0, 32).join(' ');
}

/** apify~google-search-scraper input — one page (≈10 results), organic only, no AI engines. */
export function buildSearchInput(query: string, country: DiscoveryCountry | null): Record<string, unknown> {
  const input: Record<string, unknown> = {
    queries: query,
    maxPagesPerQuery: 1,
    mobileResults: false,
    saveHtml: false,
    saveHtmlToKeyValueStore: false,
    includeUnfilteredResults: false,
    /* Every paid add-on OFF explicitly (schema read 2026-09-30) — a default flipping upstream must
       not turn a half-cent search into an AI-engine run or a leads-enrichment charge. */
    aiOverview: { scrapeFullAiOverview: false },
    aiModeSearch: { enableAiMode: false },
    geminiSearch: { enableGemini: false },
    perplexitySearch: { enablePerplexity: false },
    chatGptSearch: { enableChatGpt: false },
    copilotSearch: { enableCopilot: false },
    websiteContentScraper: { enable: false },
    maximumLeadsEnrichmentRecords: 0,
  };
  if (country) { input.countryCode = COUNTRY_ISO2[country]; input.languageCode = 'en'; }
  return input;
}

export function buildVerifyInput(profileUrl: string): Record<string, unknown> {
  return { urls: [profileUrl], profileScraperMode: 'Profile details no email ($4 per 1k)' };
}

/* ── Google result → candidate ──────────────────────────────────────────────────────────────────── */

// deno-lint-ignore no-explicit-any
type Json = any;

export interface CompanyPageHit { url: string; name: string | null }

export interface SerpParse {
  profiles: ProfileCandidate[];
  companyPages: CompanyPageHit[];
  /** Organic results that were neither (posts, jobs, other sites) — counted, never used. */
  ignored: number;
}

/** "Sarah Jones - Owner - Hughes Plumbing Ltd | LinkedIn" → parts. Tolerates – — and missing parts. */
export function parseLinkedInTitle(title: string): { name: string | null; headline: string | null; company: string | null } {
  const t = String(title ?? '').replace(/\s*[|·]\s*LinkedIn.*$/i, '').replace(/\s*-\s*LinkedIn$/i, '').trim();
  const parts = t.split(/\s+[-–—]\s+/).map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return { name: null, headline: null, company: null };
  const name = parts[0].replace(/\s*\(.*?\)\s*/g, ' ').replace(/,.*$/, '').trim() || null;
  if (parts.length === 1) return { name, headline: null, company: null };
  if (parts.length === 2) {
    // "Name - Company" or "Name - Headline"
    const second = parts[1];
    return /\b(?:at|@)\b/i.test(second) ? { name, headline: second, company: null } : { name, headline: second, company: second };
  }
  return { name, headline: parts[1], company: parts[parts.length - 1] };
}

/** Snippet facts Google shows for LinkedIn: "Experience: X · Location: Y · 500+ connections". */
export function parseLinkedInSnippet(desc: string): { experience: string | null; location: string | null } {
  const d = String(desc ?? '');
  const exp = /Experience:\s*([^·•|]+?)\s*(?:[·•|]|$)/i.exec(d)?.[1]?.trim() ?? null;
  const loc = /Location:\s*([^·•|]+?)\s*(?:[·•|]|$)/i.exec(d)?.[1]?.trim()
    ?? /^([A-Z][A-Za-z .'-]+,\s*[A-Z][A-Za-z .'-]+(?:,\s*[A-Z][A-Za-z .'-]+)?)\s*[·•]/.exec(d)?.[1]?.trim()
    ?? null;
  return { experience: exp, location: loc };
}

/** The actor's dataset (one item per results page, each with organicResults[]) → candidates. */
export function parseSearchItems(items: Json[]): SerpParse {
  const profiles: ProfileCandidate[] = [];
  const companyPages: CompanyPageHit[] = [];
  let ignored = 0;
  const seen = new Set<string>();
  for (const item of Array.isArray(items) ? items : []) {
    for (const r of Array.isArray(item?.organicResults) ? item.organicResults : []) {
      const canon = canonicalLinkedInUrl(typeof r?.url === 'string' ? r.url : '');
      if (!canon) { ignored++; continue; }
      if (seen.has(canon.url)) continue;
      seen.add(canon.url);
      const title = String(r.title ?? '');
      const desc = String(r.description ?? '');
      if (canon.kind === 'company') {
        companyPages.push({ url: canon.url, name: title.replace(/\s*[|·]\s*LinkedIn.*$/i, '').split(/\s+[-–—]\s+/)[0].trim() || null });
        continue;
      }
      const t = parseLinkedInTitle(title);
      const s = parseLinkedInSnippet(desc);
      profiles.push({
        url: canon.url,
        name: t.name,
        headline: t.headline,
        currentCompany: s.experience ?? t.company,
        pastCompanies: [],
        location: s.location,
        websites: [],
        currentCompanyLinkedInUrl: null,
        text: `${title} ${desc}`,
        origin: 'serp',
      });
    }
  }
  return { profiles, companyPages, ignored };
}

/* ── Profile scraper → candidate (verify step) ──────────────────────────────────────────────────── */

/** harvestapi profile item → candidate. Defensive: every field is optional. */
export function mapVerifiedProfile(raw: Json): ProfileCandidate | null {
  const canon = canonicalLinkedInUrl(raw?.linkedinUrl ?? raw?.url ?? (raw?.publicIdentifier ? `https://www.linkedin.com/in/${raw.publicIdentifier}` : ''));
  if (!canon || canon.kind !== 'person') return null;
  const name = [raw?.firstName, raw?.lastName].filter((x) => typeof x === 'string' && x.trim()).join(' ') || (typeof raw?.fullName === 'string' ? raw.fullName : null);
  const current = Array.isArray(raw?.currentPosition) ? raw.currentPosition : [];
  const exp = Array.isArray(raw?.experience) ? raw.experience : [];
  const nowJob = current[0] ?? exp.find((e: Json) => !e?.endDate || /present/i.test(String(e?.endDate?.text ?? e?.endDate ?? ''))) ?? null;
  const past = exp.filter((e: Json) => e !== nowJob).map((e: Json) => String(e?.companyName ?? '')).filter(Boolean);
  const websites = [
    ...(Array.isArray(raw?.websites) ? raw.websites : []),
    raw?.website, raw?.contactInfo?.website,
    ...(Array.isArray(raw?.contactInfo?.websites) ? raw.contactInfo.websites : []),
  ].map((w: Json) => (typeof w === 'string' ? w : typeof w?.url === 'string' ? w.url : '')).filter(Boolean);
  const location = typeof raw?.location?.linkedinText === 'string' ? raw.location.linkedinText
    : typeof raw?.location === 'string' ? raw.location
    : typeof raw?.addressWithCountry === 'string' ? raw.addressWithCountry : null;
  const companyUrl = nowJob?.companyLinkedinUrl ?? nowJob?.companyUrl ?? null;
  return {
    url: canon.url,
    name: name || null,
    headline: typeof raw?.headline === 'string' ? raw.headline : null,
    currentCompany: typeof nowJob?.companyName === 'string' ? nowJob.companyName : null,
    pastCompanies: past,
    location,
    websites,
    currentCompanyLinkedInUrl: typeof companyUrl === 'string' ? companyUrl : null,
    text: [raw?.headline, raw?.about, nowJob?.title, nowJob?.companyName, location].filter((x) => typeof x === 'string').join(' '),
    origin: 'profile_scrape',
  };
}
