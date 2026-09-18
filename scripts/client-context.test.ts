import { mergeClientContext } from '../src/lib/clientContext';

const context = mergeClientContext({
  onboarding: {
    confirmed_location: 'Canterbury',
    services_list: ['Locksmithing', 'Emergency entry'],
    areas_list: ['Canterbury', 'Whitstable', 'canterbury'],
  },
  lead: {
    search_location: 'Kent',
    search_keyword: 'Locksmiths',
    services_included: ['Locksmithing', 'Key cutting'],
    website: 'https://example.test',
  },
  crawl: {
    services: ['Key cutting', 'UPVC door repair'],
    towns: ['Herne Bay', 'Faversham', 'Canterbury'],
  },
});

const checks: Array<[string, boolean]> = [
  ['onboarding location wins', context.primary_location === 'Canterbury'],
  ['all services are preserved and deduplicated', context.services.join('|') === 'Locksmithing|Emergency entry|Key cutting|UPVC door repair'],
  ['all service areas are preserved and deduplicated', context.service_areas.join('|') === 'Canterbury|Whitstable|Herne Bay|Faversham'],
  ['category uses lead data', context.business_category === 'Locksmiths'],
  ['onboarding area has onboarding source', context.area_sources.Canterbury?.includes('onboarding') === true],
  ['crawl area has website source', context.area_sources['Herne Bay']?.includes('website') === true],
  ['crawl service has website source', context.service_sources['UPVC door repair']?.includes('website') === true],
];

let failures = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failures++;
}
if (failures) throw new Error(`${failures} failures`);

