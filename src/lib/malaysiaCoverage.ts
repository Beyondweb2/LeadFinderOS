import {
  ABROAD_TOWNS, abroadCountryOfLead, abroadCountryOfLocation, abroadTownKey, pairsForCountry,
  type AbroadTown, type CountryPairsIn, type CountryPairsOut, type CoverageCountry,
} from './coverageCountries.ts';
import { placeKey, readMalaysiaPlace, type ListedLookup, type UnclearReason } from './malaysiaPlaces.ts';

/* ══ MALAYSIA'S COVERAGE ROWS, READ PROPERLY (2026-10-19, Paul: "the Malaysia Coverage page is messy") ══════════
   The Coverage page's pairs, per country. The UK and Singapore are pairsForCountry exactly as before. Malaysia reads
   each lead's place text through malaysiaPlaces.ts: a real town keeps its state (and so a population); text that is
   not one town (a state, a region, several places) is counted under NO town and listed apart with its lead count.

   ⛔ WHY A FILE OF ITS OWN: coverageCountries.ts is reached by 17 edge functions (through cleanBusinessName.ts —
      whatsapp-status among them, which must not be redeployed). This reading is the Coverage page's only, so it lives
      here, where no edge function reaches it, and coverageCountries.ts stays byte-identical. */

/** A listed Malaysian town (name + state) for a normalised key: the town's name or any of its aliases. */
const LISTED = new Map<string, { name: string; region: string | null }>();
for (const t of ABROAD_TOWNS.Malaysia) {
  for (const n of [t.name, ...(t.aliases ?? [])]) LISTED.set(placeKey(n), { name: t.name, region: t.region });
}
/* Known misspellings of a listed town (safe tidy, display only — nothing stored is changed). */
for (const [k, name] of [['johor bharu', 'Johor Bahru']] as const) {
  const t = ABROAD_TOWNS.Malaysia.find((x) => x.name === name);
  if (t) LISTED.set(k, { name: t.name, region: t.region });
}
export const listedMalaysianTown: ListedLookup = (k) => LISTED.get(placeKey(k));

export interface UnclearPlace { text: string; reason: UnclearReason; state: string | null; leads: number }
export interface CoveragePairsOut extends CountryPairsOut {
  /** Malaysia: place text that is not one town, with how many leads carry it (all trades). Most leads first. */
  unclearPlaces: UnclearPlace[];
}

export function coveragePairsFor(country: CoverageCountry, p: CountryPairsIn): CoveragePairsOut {
  if (country !== 'Malaysia') return { ...pairsForCountry(country, p), unclearPlaces: [] };
  const extras = new Map<string, AbroadTown>();
  const place = <T extends { town: string }>(x: T): T | null => {
    const r = readMalaysiaPlace(x.town, listedMalaysianTown);
    if (!r || r.kind !== 'town') return null;
    if (!r.listed && !extras.has(abroadTownKey(r.name))) extras.set(abroadTownKey(r.name), { name: r.name, region: r.state });
    return { ...x, town: r.name };
  };
  const mine = <T extends { town: string; country?: string | null }>(xs: readonly T[]) =>
    xs.filter((x) => abroadCountryOfLead(x.country) === 'Malaysia').map(place).filter((x): x is T => x !== null);
  /* Search runs: the same country test pairsForCountry uses, then the same reading. */
  const runs = p.runs
    ? p.runs.filter((r) => abroadCountryOfLocation(r.town) === 'Malaysia').map(place).filter((x): x is NonNullable<typeof x> => x !== null)
    : undefined;
  /* The unclear text, counted per LEAD (the endpoint sends one pair per lead), as written (trimmed). */
  const unclear = new Map<string, UnclearPlace>();
  for (const l of p.leads) {
    if (abroadCountryOfLead(l.country) !== 'Malaysia') continue;
    const r = readMalaysiaPlace(l.town, listedMalaysianTown);
    if (!r || r.kind !== 'unclear') continue;
    const text = String(l.town).trim().replace(/\s+/g, ' ');
    const e = unclear.get(text) ?? { text, reason: r.reason, state: r.state, leads: 0 };
    e.leads++;
    unclear.set(text, e);
  }
  return {
    leads: mine(p.leads), worked: mine(p.worked), workedBy: p.workedBy ? mine(p.workedBy) : undefined, runs,
    extraTowns: [...extras.values()],
    unclearPlaces: [...unclear.values()].sort((a, b) => b.leads - a.leads || a.text.localeCompare(b.text)),
  };
}
