// Truth-table for the geocode bias logic. Run: deno test geobias.test.ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { resolveGeoBias, qualifierInfo } from './geobias.ts';

Deno.test('resolveGeoBias — bare UK name defaults to GB', () => {
  assertEquals(resolveGeoBias('Reading'), 'GB');
  assertEquals(resolveGeoBias('Manchester'), 'GB');
  assertEquals(resolveGeoBias('London'), 'GB');
  // Lone word that equals a US state name stays bare → GB (real US search names the city).
  assertEquals(resolveGeoBias('Washington'), 'GB');
});

Deno.test('resolveGeoBias — US state code/name skips GB (no forced bias)', () => {
  assertEquals(resolveGeoBias('Reading PA'), null);   // no comma, trailing state code
  assertEquals(resolveGeoBias('Reading, PA'), null);  // comma + state code
  assertEquals(resolveGeoBias('Reading, Pennsylvania'), null);
});

Deno.test('resolveGeoBias — comma qualifier (unclassified) skips GB', () => {
  assertEquals(resolveGeoBias('Reading, Berkshire'), null);
});

Deno.test('resolveGeoBias — explicit country field on a bare name', () => {
  assertEquals(resolveGeoBias('Sydney', 'AU'), 'AU');
  assertEquals(resolveGeoBias('Sydney', 'Australia'), 'AU');
  assertEquals(resolveGeoBias('Reading', 'US'), 'US');
  // A qualifier in the string still wins over the country field.
  assertEquals(resolveGeoBias('Reading, PA', 'GB'), null);
});

Deno.test('qualifierInfo — appends country for a foreign state without a country word', () => {
  assertEquals(qualifierInfo('Reading PA'), { hasQualifier: true, country: 'US', appendCountry: 'USA' });
  assertEquals(qualifierInfo('Reading, PA'), { hasQualifier: true, country: 'US', appendCountry: 'USA' });
  // Country already present → no append needed.
  assertEquals(qualifierInfo('Reading, PA, USA'), { hasQualifier: true, country: 'US', appendCountry: null });
  // Comma-only qualifier → no country, no append.
  assertEquals(qualifierInfo('Reading, Berkshire'), { hasQualifier: true, country: null, appendCountry: null });
  // Bare name → nothing.
  assertEquals(qualifierInfo('Reading'), { hasQualifier: false, country: null, appendCountry: null });
});

Deno.test('qualifierInfo — Canada + Australia', () => {
  assertEquals(qualifierInfo('London, ON'), { hasQualifier: true, country: 'CA', appendCountry: 'Canada' });
  assertEquals(qualifierInfo('Perth, WA'), { hasQualifier: true, country: 'US', appendCountry: 'USA' }); // WA→US by design (collision note)
  assertEquals(qualifierInfo('Sydney NSW'), { hasQualifier: true, country: 'AU', appendCountry: 'Australia' });
  assertEquals(qualifierInfo('Melbourne, Victoria'), { hasQualifier: true, country: 'AU', appendCountry: 'Australia' });
});
