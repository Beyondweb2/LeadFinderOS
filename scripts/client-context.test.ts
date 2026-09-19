import { mergeClientContext, selectClientCrawlContext } from '../src/lib/clientContext';
import { CRAWL_CHECK_VERSION, CRAWL_FRESH_MS } from '../src/lib/crawlCheck';

const context = mergeClientContext({
  onboarding: {
    confirmed_location: 'Canterbury',
    services_list: ['Locksmithing', 'Emergency entry'],
    areas_list: ['Canterbury', 'Whitstable', 'canterbury'],
  },
  lead: {
    business_name: 'MCLocksmiths centre',
    search_location: 'Kent',
    search_keyword: 'Locksmiths',
    services_included: ['Locksmithing', 'Key cutting'],
    website: 'https://example.test',
    country: 'UK',
  },
  crawl: {
    services: ['Key cutting', 'UPVC door repair'],
    towns: ['Herne Bay', 'Faversham', 'Canterbury'],
  },
});
const now = Date.parse('2026-09-18T12:00:00Z');
const result = (towns: string[]) => ({ status: 'complete', version: CRAWL_CHECK_VERSION, url: 'https://example.test/', siteInfo: { towns, services: ['Site service'] } });
const runPreferred = selectClientCrawlContext({
  website: 'https://example.test', now,
  runCrawls: [{ result: result(['Run town']), created_at: '2026-09-18T11:00:00Z' }],
  leadCrawl: { result: { ...result(['Lead town']), status: undefined }, created_at: '2026-09-18T10:00:00Z' },
});
const leadFallback = selectClientCrawlContext({
  website: 'https://example.test', now,
  runCrawls: [{ result: { status: 'unavailable', version: CRAWL_CHECK_VERSION }, created_at: '2026-09-18T11:00:00Z' }],
  leadCrawl: { result: { ...result(['Lead town']), status: undefined }, created_at: '2026-09-18T10:00:00Z' },
});
const stale = selectClientCrawlContext({ website: 'https://example.test', now, leadCrawl: { result: { ...result(['Wrong town']), status: undefined }, created_at: new Date(now - CRAWL_FRESH_MS - 1).toISOString() } });
const oldV2 = selectClientCrawlContext({ website: 'https://example.test', now, leadCrawl: { result: { version: CRAWL_CHECK_VERSION, url: 'https://example.test', town: 'Wrong town' }, created_at: '2026-09-18T10:00:00Z' } });

const checks: Array<[string, boolean]> = [
  ['onboarding location wins', context.primary_location === 'Canterbury'],
  ['all services are preserved and deduplicated', context.services.join('|') === 'Locksmithing|Emergency entry|Key cutting|UPVC door repair'],
  ['all service areas are preserved and deduplicated', context.service_areas.join('|') === 'Canterbury|Whitstable|Herne Bay|Faversham'],
  ['category uses lead data', context.business_category === 'Locksmiths'],
  ['business name and country use lead data', context.business_name === 'MCLocksmiths centre' && context.country === 'UK'],
  ['onboarding area has onboarding source', context.area_sources.Canterbury?.includes('onboarding') === true],
  ['crawl area has website source', context.area_sources['Herne Bay']?.includes('website') === true],
  ['crawl service has website source', context.service_sources['UPVC door repair']?.includes('website') === true],
  ['usable run-level crawl wins over lead cache', runPreferred?.source === 'run' && runPreferred.info?.towns?.[0] === 'Run town'],
  ['failed run crawl falls back to fresh compatible lead cache', leadFallback?.source === 'lead' && leadFallback.info?.towns?.[0] === 'Lead town'],
  ['stale crawl is optional and ignored', stale === null],
  ['old incompatible v2 result without siteInfo is ignored', oldV2 === null],
  ['onboarding town remains primary even when website adds areas', context.primary_location === 'Canterbury'],
];

let failures = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failures++;
}
if (failures) throw new Error(`${failures} failures`);
