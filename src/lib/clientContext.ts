/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE PAID BASELINE'S BUSINESS CONTEXT — what the 20 questions are generated from, in priority order.

     1. onboarding     — the client's answers, or the operator's manual onboarding on their behalf
     2. build_facts    — Client Build Facts Paul has VERIFIED on the Website Build page
     3. lead           — the client record (business name, category, town, services_included)
     4. discovery      — facts the operator typed into an earlier Discovery scan of the same lead
                         (town / category / website only — NEVER services, since 2026-10-04)
     5. website        — the latest crawl: DETECTED ONLY, never merged (see below)

   ⛔ SERVICES AND AREAS ARE NOT MERGED (2026-10-04): the highest-ranked non-empty list wins whole
   (serviceScope.resolveServiceTruth, the clientFacts.ts rule). See mergeClientContext.

   🔴 THE CRAWL USED TO BE MERGED STRAIGHT INTO SERVICES AND AREAS (until 2026-09-23). A town that
   merely has a page on the old site, or a menu item that is not a service at all ("Gallery"), went
   into the list the baseline — the measuring stick the refund is settled on — was generated from.
   ⛔ Now the crawl's services and towns come back SEPARATELY as `detected_services` /
   `detected_areas`, shown to the operator as suggestions to confirm. Nothing the public website says
   becomes a measured service or town until a person has approved it (manual onboarding, section A's
   Save client context, or a verified build fact).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** 'discovery' = facts the operator typed into an earlier Discovery scan of the same lead (stored on
 *  its ai_audits row). Verified operator input, so it ranks above the website crawl.
 *  'build_facts' = a Client Build Fact Paul marked VERIFIED on the Website Build page. */
export type ContextSource = 'onboarding' | 'build_facts' | 'lead' | 'discovery' | 'website';
import { CRAWL_CHECK_VERSION, CRAWL_FRESH_MS } from './crawlCheck.ts';
import { resolveServiceTruth } from './serviceScope.ts';

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
  /** What the latest crawl SAW that no approved source lists — suggestions, never measured. */
  detected_services: string[];
  detected_areas: string[];
  /** True only when the services are the client's own answer or a VERIFIED build fact (serviceScope.ts). */
  services_client_confirmed: boolean;
  /** Lower-ranked lists holding entries the winner does not — shown to Paul to ask about, NEVER merged. */
  unconfirmed_services: string[];
  unconfirmed_areas: string[];
};

type CrawlInfo = { services?: unknown; towns?: unknown; category?: unknown; specialisms?: unknown } | null | undefined;
type CrawlCandidate = { result?: unknown; created_at?: unknown; mode?: unknown } | null | undefined;

const clean = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const list = (value: unknown): string[] => Array.isArray(value)
  ? value.flatMap((item) => typeof item === 'string' ? [item] : []).map(clean).filter(Boolean)
  : clean(value).split(',').map((item) => item.trim()).filter(Boolean);
const key = (value: string) => value.trim().toLocaleLowerCase();
/** Same website, ignoring a leading www. (a site served apex → www is one site). */
const siteKey = (url: string) => new URL(url).hostname.toLowerCase().replace(/^www\./, '');

function compatibleCrawl(candidate: CrawlCandidate, website: string, requireComplete: boolean, now: number): { info: CrawlInfo; created_at: string } | null {
  const result = candidate?.result as { status?: unknown; version?: unknown; checked_at?: unknown; url?: unknown; siteInfo?: CrawlInfo } | null | undefined;
  if (!result || (requireComplete && result.status !== 'complete') || !result.siteInfo || Number(result.version ?? 0) < CRAWL_CHECK_VERSION) return null;
  const createdAt = clean(result.checked_at) || clean(candidate?.created_at);
  const created = Date.parse(createdAt);
  if (!Number.isFinite(created) || now - created > CRAWL_FRESH_MS || created > now + 60_000) return null;
  try {
    if (website && clean(result.url) && siteKey(website) !== siteKey(clean(result.url))) return null;
  } catch { return null; }
  return { info: result.siteInfo, created_at: createdAt };
}

/** Which stored crawl describes the client's site. A FULL manual crawl on the lead row wins (it read
 *  the whole site); then a completed audit-run crawl; then any fresh lead crawl. */
export function selectClientCrawlContext(input: {
  runCrawls?: CrawlCandidate[];
  leadCrawl?: CrawlCandidate;
  website?: string;
  now?: number;
}): { info: CrawlInfo; source: 'run' | 'lead'; created_at: string } | null {
  const now = input.now ?? Date.now();
  if (input.leadCrawl?.mode === 'full') {
    const full = compatibleCrawl(input.leadCrawl, clean(input.website), false, now);
    if (full) return { ...full, source: 'lead' };
  }
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

/** The VERIFIED Client Build Facts that bear on the baseline, from outreach_leads.website_build. */
export function verifiedBuildFacts(websiteBuild: unknown): { services: string; service_areas: string; primary_town: string } {
  const facts = (websiteBuild && typeof websiteBuild === 'object' ? (websiteBuild as { facts?: unknown }).facts : null);
  const out = { services: '', service_areas: '', primary_town: '' };
  if (!Array.isArray(facts)) return out;
  for (const f of facts) {
    const k = clean((f as { key?: unknown })?.key) as keyof typeof out;
    if (!(k in out)) continue;
    if ((f as { status?: unknown }).status !== 'verified') continue;   // positive match: only verified
    out[k] = clean((f as { value?: unknown }).value);
  }
  return out;
}

/** Merge the approved sources in priority order; the crawl only ever DETECTS. */
export function mergeClientContext(input: {
  onboarding?: { business_name?: unknown; business_category?: unknown; confirmed_location?: unknown; services?: unknown; services_list?: unknown; areas_list?: unknown; areas_wanted?: unknown; specialisms?: unknown; website?: unknown; country?: unknown } | null;
  /** Verified Client Build Facts (verifiedBuildFacts). */
  buildFacts?: { services?: unknown; service_areas?: unknown; primary_town?: unknown } | null;
  lead?: { business_name?: unknown; search_location?: unknown; derived_town?: unknown; website?: unknown; category?: unknown; search_keyword?: unknown; services_included?: unknown; service_areas?: unknown; specialisms?: unknown; country?: unknown } | null;
  /** The newest Discovery scan's stored business facts (ai_audits: business_type, location_text,
   *  website, specialism). Never its questions — Discovery is separate research. */
  discovery?: { business_type?: unknown; location_text?: unknown; website?: unknown; specialism?: unknown } | null;
  crawl?: CrawlInfo;
}): ClientContext {
  const onboarding = input.onboarding ?? {};
  const facts = input.buildFacts ?? {};
  const lead = input.lead ?? {};
  const discovery = input.discovery ?? {};
  const service_sources: Record<string, ContextSource[]> = {};
  const area_sources: Record<string, ContextSource[]> = {};
  const services: string[] = [];
  const service_areas: string[] = [];
  const specialisms: string[] = [];
  const business_name = clean(onboarding.business_name) || clean(lead.business_name);
  const primary_location = clean(onboarding.confirmed_location) || clean(facts.primary_town) || clean(lead.derived_town) || clean(lead.search_location) || clean(discovery.location_text);
  const business_category = clean(onboarding.business_category) || clean(lead.category) || clean(lead.search_keyword) || clean(discovery.business_type) || clean(input.crawl?.category);
  const website = clean(onboarding.website) || clean(lead.website) || clean(discovery.website);
  const country = clean(onboarding.country) || clean(lead.country);

  /* 🔴 THE LISTS USED TO BE CONCATENATED (until 2026-10-04, Session C C-08). Onboarding + build facts +
     what Sales typed + the newest Discovery audit's `specialism` were all merged, so a town the client
     UNTICKED came back from the lead row, Discovery's own output fed itself, and "Save client context"
     then wrote the merged list onto the onboarding row as if the client had said it.
     ⛔ NOW THE clientFacts.ts RULE: the highest-ranked NON-EMPTY list WINS WHOLE (client onboarding →
     verified build fact → what Sales recorded). Lower lists are returned as `unconfirmed_*` for Paul to
     ask about — never measured. Discovery's `specialism` is never a source of services: it is what a
     previous Discovery was GIVEN, not something the client said. */
  const truth = resolveServiceTruth({ onboardingList: onboarding.services_list, onboardingText: onboarding.services, buildFacts: facts.services, lead: lead.services_included });
  const serviceSource: ContextSource | null = truth.source;
  if (serviceSource) add(services, service_sources, truth.services, serviceSource);
  const areaLists: Array<{ source: ContextSource; values: string[] }> = [
    { source: 'onboarding', values: [...list(onboarding.areas_list), ...list(onboarding.areas_wanted)] },
    { source: 'build_facts', values: list(facts.service_areas) },
    /* The towns Sales recorded on the prospect (2026-09-28) — used only when the client has not answered. */
    { source: 'lead', values: list(lead.service_areas) },
  ];
  const areaWinner = areaLists.find((l) => l.values.length > 0) ?? null;
  if (areaWinner) add(service_areas, area_sources, areaWinner.values, areaWinner.source);
  const haveArea = new Set(service_areas.map(key));
  const unconfirmed_areas = areaLists.filter((l) => l !== areaWinner).flatMap((l) => l.values)
    .filter((v, i, a) => !haveArea.has(key(v)) && a.findIndex((x) => key(x) === key(v)) === i);
  const unconfirmed_services = truth.unconfirmed.flatMap((u) => u.values)
    .filter((v, i, a) => a.findIndex((x) => key(x) === key(v)) === i);
  add(specialisms, {}, onboarding.specialisms, 'onboarding');
  add(specialisms, {}, lead.specialisms, 'lead');

  /* DETECTED, NOT MERGED — anything the crawl saw that no approved list already holds. The home town
     is never offered as an extra area. */
  const have = (xs: string[]) => new Set(xs.map(key));
  /* Anything already shown as an unconfirmed list entry is not offered a second time as "detected". */
  const knownServices = have([...services, ...unconfirmed_services]);
  const knownAreas = have([...service_areas, ...unconfirmed_areas, primary_location].filter(Boolean));
  const detected_services = list(input.crawl?.services).filter((s, i, a) => !knownServices.has(key(s)) && a.findIndex((x) => key(x) === key(s)) === i);
  const detected_areas = list(input.crawl?.towns).filter((s, i, a) => !knownAreas.has(key(s)) && a.findIndex((x) => key(x) === key(s)) === i);

  return {
    business_name, primary_location, services, service_areas, specialisms, business_category, website, country, service_sources, area_sources,
    detected_services, detected_areas, services_client_confirmed: truth.clientConfirmed, unconfirmed_services, unconfirmed_areas,
  };
}
