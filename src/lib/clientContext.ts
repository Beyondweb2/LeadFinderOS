export type ContextSource = 'onboarding' | 'lead' | 'website';

export type ClientContext = {
  primary_location: string;
  services: string[];
  service_areas: string[];
  business_category: string;
  website: string;
  service_sources: Record<string, ContextSource[]>;
  area_sources: Record<string, ContextSource[]>;
};

type CrawlInfo = { services?: unknown; towns?: unknown } | null | undefined;

const clean = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const list = (value: unknown): string[] => Array.isArray(value)
  ? value.flatMap((item) => typeof item === 'string' ? [item] : []).map(clean).filter(Boolean)
  : clean(value).split(',').map((item) => item.trim()).filter(Boolean);
const key = (value: string) => value.trim().toLocaleLowerCase();

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
  onboarding?: { confirmed_location?: unknown; services?: unknown; services_list?: unknown; areas_list?: unknown; areas_wanted?: unknown } | null;
  lead?: { search_location?: unknown; derived_town?: unknown; website?: unknown; category?: unknown; search_keyword?: unknown; services_included?: unknown; areas_wanted?: unknown } | null;
  crawl?: CrawlInfo;
}): ClientContext {
  const onboarding = input.onboarding ?? {};
  const lead = input.lead ?? {};
  const service_sources: Record<string, ContextSource[]> = {};
  const area_sources: Record<string, ContextSource[]> = {};
  const services: string[] = [];
  const service_areas: string[] = [];
  const primary_location = clean(onboarding.confirmed_location) || clean(lead.derived_town) || clean(lead.search_location);
  const business_category = clean(lead.category) || clean(lead.search_keyword);
  const website = clean(lead.website);

  add(services, service_sources, onboarding.services_list, 'onboarding');
  add(services, service_sources, onboarding.services, 'onboarding');
  add(services, service_sources, lead.services_included, 'lead');
  add(service_areas, area_sources, onboarding.areas_list, 'onboarding');
  add(service_areas, area_sources, onboarding.areas_wanted, 'onboarding');
  add(service_areas, area_sources, lead.areas_wanted, 'lead');
  add(service_areas, area_sources, input.crawl?.towns, 'website');
  add(services, service_sources, input.crawl?.services, 'website');

  return { primary_location, services, service_areas, business_category, website, service_sources, area_sources };
}

