/** 'discovery' = facts the operator typed into an earlier Discovery scan of the same lead (stored on
 *  its ai_audits row). Verified operator input, so it ranks above the website crawl. */
export type ContextSource = 'onboarding' | 'lead' | 'discovery' | 'website';
import { CRAWL_CHECK_VERSION, CRAWL_FRESH_MS } from './crawlCheck.ts';

export type ClientContext = {
  business_name: string;
  primary_location: string;
  services: string[];
  service_areas: string[];
  specialisms: string[];
  business_category: string;
  website: string;
  country: string;
  service_sources: Record<string, ContextSource[]>;
  area_sources: Record<string, ContextSource[]>;
};

type CrawlInfo = { services?: unknown; towns?: unknown; category?: unknown; specialisms?: unknown } | null | undefined;
type CrawlCandidate = { result?: unknown; created_at?: unknown } | null | undefined;

const clean = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const list = (value: unknown): string[] => Array.isArray(value)
  ? value.flatMap((item) => typeof item === 'string' ? [item] : []).map(clean).filter(Boolean)
  : clean(value).split(',').map((item) => item.trim()).filter(Boolean);
const key = (value: string) => value.trim().toLocaleLowerCase();

function compatibleCrawl(candidate: CrawlCandidate, website: string, requireComplete: boolean, now: number): { info: CrawlInfo; created_at: string } | null {
  const result = candidate?.result as { status?: unknown; version?: unknown; checked_at?: unknown; url?: unknown; siteInfo?: CrawlInfo } | null | undefined;
  if (!result || (requireComplete && result.status !== 'complete') || !result.siteInfo || Number(result.version ?? 0) < CRAWL_CHECK_VERSION) return null;
  const createdAt = clean(result.checked_at) || clean(candidate?.created_at);
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created) || now - created > CRAWL_FRESH_MS || created > now + 60_000) return null;
  try {
    if (website && clean(result.url) && new URL(website).origin !== new URL(clean(result.url)).origin) return null;
  } catch { return null; }
  return { info: result.siteInfo, created_at: createdAt };
}

export function selectClientCrawlContext(input: {
  runCrawls?: CrawlCandidate[];
  leadCrawl?: CrawlCandidate;
  website?: string;
  now?: number;
}): { info: CrawlInfo; source: 'run' | 'lead'; created_at: string } | null {
  const now = input.now ?? Date.now();
  for (const candidate of input.runCrawls ?? []) {
    const found = compatibleCrawl(candidate, clean(input.website), true, now);
    if (found) return { ...found, source: 'run' };
  }
  const fallback = compatibleCrawl(input.leadCrawl, clean(input.website), false, now);
  return fallback ? { ...fallback, source: 'lead' } : null;
}

function add(values: string[], sources: Record<string, ContextSource[]>, raw: unknown, source: ContextSource) {
  for (const value of list(raw)) {
    const existing = values.find((item) => key(item) === key(value));
    const canonical = existing ?? value;
    if (!existing) values.push(value);
    const current = sources[canonical] ?? [];
    if (!current.includes(source)) sources[canonical] = [...current, source];
  }
}

/** Merge operator/onboarding facts first, then lead facts, then explicit website facts. */
export function mergeClientContext(input: {
  onboarding?: { business_name?: unknown; business_category?: unknown; confirmed_location?: unknown; services?: unknown; services_list?: unknown; areas_list?: unknown; areas_wanted?: unknown; specialisms?: unknown; website?: unknown; country?: unknown } | null;
  lead?: { business_name?: unknown; search_location?: unknown; derived_town?: unknown; website?: unknown; category?: unknown; search_keyword?: unknown; services_included?: unknown; specialisms?: unknown; country?: unknown } | null;
  /** The newest Discovery scan's stored business facts (ai_audits: business_type, location_text,
   *  website, specialism). Never its questions — Discovery is separate research. */
  discovery?: { business_type?: unknown; location_text?: unknown; website?: unknown; specialism?: unknown } | null;
  crawl?: CrawlInfo;
}): ClientContext {
  const onboarding = input.onboarding ?? {};
  const lead = input.lead ?? {};
  const discovery = input.discovery ?? {};
  const service_sources: Record<string, ContextSource[]> = {};
  const area_sources: Record<string, ContextSource[]> = {};
  const services: string[] = [];
  const service_areas: string[] = [];
  const specialisms: string[] = [];
  const business_name = clean(onboarding.business_name) || clean(lead.business_name);
  const primary_location = clean(onboarding.confirmed_location) || clean(lead.derived_town) || clean(lead.search_location) || clean(discovery.location_text);
  const business_category = clean(onboarding.business_category) || clean(lead.category) || clean(lead.search_keyword) || clean(discovery.business_type) || clean(input.crawl?.category);
  const website = clean(onboarding.website) || clean(lead.website) || clean(discovery.website);
  const country = clean(onboarding.country) || clean(lead.country);

  add(services, service_sources, onboarding.services_list, 'onboarding');
  add(services, service_sources, onboarding.services, 'onboarding');
  add(services, service_sources, lead.services_included, 'lead');
  add(services, service_sources, discovery.specialism, 'discovery');
  add(service_areas, area_sources, onboarding.areas_list, 'onboarding');
  add(service_areas, area_sources, onboarding.areas_wanted, 'onboarding');
  add(service_areas, area_sources, input.crawl?.towns, 'website');
  add(services, service_sources, input.crawl?.services, 'website');
  add(specialisms, {}, onboarding.specialisms, 'onboarding');
  add(specialisms, {}, lead.specialisms, 'lead');
  add(specialisms, {}, input.crawl?.specialisms, 'website');

  return { business_name, primary_location, services, service_areas, specialisms, business_category, website, country, service_sources, area_sources };
}
