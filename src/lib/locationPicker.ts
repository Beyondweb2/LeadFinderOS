/* ══ FIND LEADS — COUNTRY → LOCATION → RADIUS (2026-10-07, improve/au-location-parity) ═══════════════════
   The pure half of the Find Leads location picker: which countries are offered and how they are named, the
   suggested locations for ONE selected country, the string a suggestion puts in the Location box, and what
   happens to the Location box when the country changes. SearchForm.tsx draws it; scripts/au-location-parity
   .test.ts drives it.

   ⛔ WHAT IT REPLACED. A "Quick Locations" expander with a cloud of 20 country tabs (flag emoji, which Windows
   draws as the letters "GB", "AU") and a scrolling bubble of every city of every country. The country itself
   was a tiny "GB UK" select. Paul: country first, then location, then radius — and the suggestions for the
   country you picked, nothing else.

   ⛔ THE COUNTRY ONLY BIASES THE SEARCH. A lead's stored country is still the one Google's address names
   (src/lib/leadCountry.ts). Changing the country never touches the radius or "This town only".

   ⛔ THE STRING A SUGGESTION SENDS IS UNCHANGED: a UK city goes bare ("Leeds" — the server's GB default), any
   other country's goes as "City, Country" ("Perth, Australia") so the geocoder can never resolve it in
   another country (Perth, Scotland). search-leads' cache keys depend on that exact text.

   Pure, no React, no app wiring. */
import type { Country } from '@/types/lead';

export interface SearchCountryOption {
  value: Country;
  /** What the dropdown shows — the country's name, written out. */
  name: string;
  /** ISO-3166 alpha-2, shown small beside the name (never a flag emoji: Windows renders those as letters). */
  code: string;
  /** A market the team actively prospects — listed first. */
  primary: boolean;
}

/** Every country Find Leads can search. The first three are the markets worked today; the rest A–Z. */
export const SEARCH_COUNTRY_OPTIONS: readonly SearchCountryOption[] = [
  { value: 'UK', name: 'United Kingdom', code: 'GB', primary: true },
  { value: 'Australia', name: 'Australia', code: 'AU', primary: true },
  { value: 'India', name: 'India', code: 'IN', primary: true },
  { value: 'Belgium', name: 'Belgium', code: 'BE', primary: false },
  { value: 'Brazil', name: 'Brazil', code: 'BR', primary: false },
  { value: 'Canada', name: 'Canada', code: 'CA', primary: false },
  { value: 'France', name: 'France', code: 'FR', primary: false },
  { value: 'Germany', name: 'Germany', code: 'DE', primary: false },
  { value: 'Ireland', name: 'Ireland', code: 'IE', primary: false },
  { value: 'Italy', name: 'Italy', code: 'IT', primary: false },
  { value: 'Japan', name: 'Japan', code: 'JP', primary: false },
  { value: 'Mexico', name: 'Mexico', code: 'MX', primary: false },
  { value: 'Netherlands', name: 'Netherlands', code: 'NL', primary: false },
  { value: 'NewZealand', name: 'New Zealand', code: 'NZ', primary: false },
  { value: 'Singapore', name: 'Singapore', code: 'SG', primary: false },
  { value: 'SouthAfrica', name: 'South Africa', code: 'ZA', primary: false },
  { value: 'Spain', name: 'Spain', code: 'ES', primary: false },
  { value: 'Sweden', name: 'Sweden', code: 'SE', primary: false },
  { value: 'UAE', name: 'United Arab Emirates', code: 'AE', primary: false },
  { value: 'USA', name: 'United States', code: 'US', primary: false },
];

export const DEFAULT_SEARCH_COUNTRY: Country = 'UK';

/** The country's written name ("New Zealand", "United Kingdom"). Unknown → the value itself. */
export function countryName(c: Country | string | null | undefined): string {
  return SEARCH_COUNTRY_OPTIONS.find((o) => o.value === c)?.name ?? String(c ?? '');
}

/** A persisted / URL value read back as a country we offer; anything else (an old or hand-edited value,
 *  blank) is the default — never an unknown string passed to the search as a bias. */
export function normaliseSearchCountry(v: unknown): Country {
  return SEARCH_COUNTRY_OPTIONS.some((o) => o.value === v) ? (v as Country) : DEFAULT_SEARCH_COUNTRY;
}

/** The word the server's geocoder reads after the city — the "City, Country" form the old Quick Locations
 *  sent, kept byte-identical ("New Zealand", "South Africa", "Australia"; "UAE", "USA" as they were). */
const SUFFIX_WORD: Partial<Record<Country, string>> = { NewZealand: 'New Zealand', SouthAfrica: 'South Africa' };
const suffixWord = (c: Country): string => SUFFIX_WORD[c] ?? c;

/* ── Suggested locations, per country — the old Quick Locations lists, the biggest places first. ── */
export const SUGGESTED_LOCATIONS: Record<Country, readonly string[]> = {
  UK: [
    'London', 'Manchester', 'Birmingham', 'Leeds', 'Sheffield', 'Bristol', 'Liverpool', 'Glasgow',
    'Edinburgh', 'Newcastle', 'Nottingham', 'Leicester', 'Southampton', 'Cardiff', 'Belfast', 'Brighton',
    'Plymouth', 'Reading', 'Coventry', 'Hull', 'Stoke-on-Trent', 'Wolverhampton', 'Derby', 'Swansea',
    'Milton Keynes', 'Aberdeen', 'Norwich', 'Oxford', 'Cambridge', 'York',
    'Sunderland', 'Bath', 'Exeter', 'Cheltenham', 'Gloucester', 'Worcester',
    'Ipswich', 'Peterborough', 'Dundee', 'Stirling', 'Inverness', 'Luton',
    'Slough', 'Watford', 'St Albans', 'Guildford', 'Chelmsford', 'Maidstone',
    'Bournemouth', 'Swindon', 'Northampton', 'Warrington', 'Blackpool', 'Preston',
    'Huddersfield', 'Halifax', 'Wakefield', 'Barnsley', 'Doncaster', 'Rotherham',
    'Wigan', 'Bolton', 'Stockport', 'Oldham', 'Rochdale', 'Salford',
    'Chester', 'Shrewsbury', 'Telford', 'Hereford', 'Lincoln', 'Grimsby',
    'Scarborough', 'Harrogate', 'Carlisle', 'Lancaster', 'Burnley', 'Crewe',
    'Stafford', 'Lichfield', 'Tamworth', 'Solihull', 'Dudley', 'Walsall',
    'Redditch', 'Kidderminster', 'Bangor', 'Wrexham', 'Newport', 'Llanelli',
    'Torquay', 'Taunton', 'Yeovil', 'Salisbury', 'Basingstoke', 'Winchester',
    'Eastbourne', 'Hastings', 'Tunbridge Wells', 'Canterbury', 'Margate', 'Dover',
    'Folkestone', 'Ashford', 'Crawley', 'Worthing', 'Chichester', 'Portsmouth',
  ],
  /* Ordered by urban population (ABS significant urban areas): the five capitals, then the big regional
     cities, then the rest. */
  Australia: [
    'Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide', 'Gold Coast',
    'Newcastle', 'Canberra', 'Sunshine Coast', 'Wollongong', 'Geelong', 'Hobart',
    'Townsville', 'Cairns', 'Toowoomba', 'Darwin', 'Ballarat', 'Bendigo',
    'Albury', 'Launceston', 'Mackay', 'Rockhampton', 'Bunbury', 'Bundaberg',
    'Coffs Harbour', 'Wagga Wagga', 'Hervey Bay', 'Mildura', 'Shepparton', 'Port Macquarie',
    'Gladstone', 'Tamworth', 'Orange', 'Dubbo', 'Geraldton', 'Bathurst',
    'Warrnambool', 'Kalgoorlie', 'Lismore', 'Mandurah', 'Devonport', 'Burnie',
    'Alice Springs', 'Mount Isa',
  ],
  India: [
    'Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Chennai', 'Kolkata',
    'Ahmedabad', 'Pune', 'Surat', 'Jaipur', 'Lucknow', 'Kanpur',
    'Nagpur', 'Indore', 'Thane', 'Bhopal', 'Visakhapatnam', 'Vadodara',
    'Kochi', 'Chandigarh', 'Gurugram', 'Noida', 'Coimbatore', 'Mysuru',
  ],
  USA: [
    'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia',
    'San Antonio', 'San Diego', 'Dallas', 'Austin', 'San Jose', 'Jacksonville',
    'Fort Worth', 'Columbus', 'Charlotte', 'Indianapolis', 'Seattle', 'Denver',
    'Boston', 'Nashville', 'Portland', 'Las Vegas', 'Miami', 'Atlanta',
    'Tampa', 'Orlando', 'Minneapolis', 'Cleveland', 'Pittsburgh', 'Cincinnati',
    'Kansas City', 'St Louis', 'Salt Lake City', 'Sacramento', 'Raleigh', 'Richmond',
    'Memphis', 'Louisville', 'Milwaukee', 'Oklahoma City', 'Tucson', 'Albuquerque',
    'Omaha', 'Colorado Springs', 'Boise', 'Tulsa', 'El Paso', 'Fresno',
    'Bakersfield', 'Knoxville', 'Chattanooga', 'Spokane', 'Savannah', 'Charleston',
    'Greenville', 'Lexington', 'Des Moines', 'Madison', 'Little Rock', 'Birmingham',
  ],
  Canada: [
    'Toronto', 'Montreal', 'Vancouver', 'Calgary', 'Edmonton', 'Ottawa',
    'Winnipeg', 'Quebec City', 'Hamilton', 'Kitchener', 'London', 'Victoria',
    'Halifax', 'Oshawa', 'Windsor', 'Saskatoon', 'Regina', 'Barrie',
    'Kelowna', 'Abbotsford', 'St Catharines', 'Guelph', 'Kingston', 'Thunder Bay',
    'Lethbridge', 'Nanaimo', 'Kamloops', 'Red Deer', 'Brantford', 'Moncton',
    'Fredericton', 'Peterborough', 'Chilliwack', 'Prince George', 'Sudbury',
  ],
  Germany: [
    'Berlin', 'Hamburg', 'Munich', 'Cologne', 'Frankfurt', 'Stuttgart',
    'Düsseldorf', 'Leipzig', 'Dortmund', 'Essen', 'Bremen', 'Dresden',
    'Hanover', 'Nuremberg', 'Duisburg', 'Bochum', 'Wuppertal', 'Bielefeld',
    'Bonn', 'Münster', 'Mannheim', 'Karlsruhe', 'Augsburg', 'Wiesbaden',
    'Aachen', 'Freiburg', 'Heidelberg', 'Regensburg', 'Kiel', 'Lübeck',
    'Rostock', 'Mainz', 'Potsdam', 'Wolfsburg', 'Ulm', 'Kassel',
  ],
  France: [
    'Paris', 'Marseille', 'Lyon', 'Toulouse', 'Nice', 'Nantes', 'Strasbourg',
    'Montpellier', 'Bordeaux', 'Lille', 'Rennes', 'Reims', 'Toulon',
    'Saint-Étienne', 'Le Havre', 'Grenoble', 'Dijon', 'Angers',
    'Clermont-Ferrand', 'Amiens', 'Limoges', 'Tours', 'Metz', 'Besançon',
    'Perpignan', 'Orléans', 'Rouen', 'Caen', 'Brest', 'Pau',
    'La Rochelle', 'Avignon', 'Cannes', 'Antibes', 'Ajaccio',
  ],
  Spain: [
    'Madrid', 'Barcelona', 'Valencia', 'Seville', 'Zaragoza', 'Málaga',
    'Murcia', 'Palma', 'Las Palmas', 'Bilbao', 'Alicante', 'Córdoba',
    'Valladolid', 'Vigo', 'Gijón', 'Granada', 'Elche', 'Oviedo',
    'Santander', 'Pamplona', 'Toledo', 'Salamanca', 'Burgos', 'Almería',
    'San Sebastián', 'Cádiz', 'Tarragona', 'Marbella', 'Jerez', 'León',
  ],
  Italy: [
    'Rome', 'Milan', 'Naples', 'Turin', 'Palermo', 'Genoa', 'Bologna',
    'Florence', 'Bari', 'Catania', 'Venice', 'Verona', 'Messina', 'Padua',
    'Trieste', 'Brescia', 'Parma', 'Modena',
    'Reggio Calabria', 'Livorno', 'Cagliari', 'Foggia', 'Rimini', 'Perugia',
    'Ravenna', 'Ferrara', 'Bergamo', 'Siracusa', 'Pescara', 'Lecce',
  ],
  Netherlands: [
    'Amsterdam', 'Rotterdam', 'The Hague', 'Utrecht', 'Eindhoven', 'Tilburg',
    'Groningen', 'Almere', 'Breda', 'Nijmegen', 'Haarlem', 'Arnhem',
    'Zaanstad', 'Amersfoort', 'Apeldoorn', 'Enschede',
  ],
  Belgium: [
    'Brussels', 'Antwerp', 'Ghent', 'Charleroi', 'Liège', 'Bruges',
    'Namur', 'Leuven', 'Mons', 'Mechelen', 'Aalst', 'Hasselt',
  ],
  Ireland: [
    'Dublin', 'Cork', 'Limerick', 'Galway', 'Waterford', 'Drogheda',
    'Swords', 'Dundalk', 'Bray', 'Navan', 'Ennis', 'Kilkenny',
    'Tralee', 'Carlow', 'Athlone', 'Sligo', 'Wexford', 'Letterkenny',
    'Newbridge', 'Celbridge', 'Mullingar', 'Greystones', 'Tullamore', 'Maynooth',
  ],
  NewZealand: [
    'Auckland', 'Wellington', 'Christchurch', 'Hamilton', 'Tauranga',
    'Napier-Hastings', 'Dunedin', 'Palmerston North', 'Nelson', 'Rotorua',
    'New Plymouth', 'Whangarei', 'Invercargill', 'Whanganui',
  ],
  SouthAfrica: [
    'Johannesburg', 'Cape Town', 'Durban', 'Pretoria', 'Port Elizabeth',
    'Bloemfontein', 'East London', 'Nelspruit', 'Kimberley', 'Polokwane',
    'Pietermaritzburg', 'Rustenburg', 'George', 'Stellenbosch',
  ],
  Singapore: [
    'Orchard', 'Marina Bay', 'Jurong East', 'Tampines', 'Woodlands',
    'Ang Mo Kio', 'Bedok', 'Clementi', 'Bukit Timah', 'Changi',
  ],
  UAE: [
    'Dubai', 'Abu Dhabi', 'Sharjah', 'Al Ain', 'Ajman', 'Ras Al Khaimah',
    'Fujairah', 'Umm Al Quwain', 'Dubai Marina', 'Jumeirah',
  ],
  Brazil: [
    'São Paulo', 'Rio de Janeiro', 'Brasília', 'Salvador', 'Fortaleza',
    'Belo Horizonte', 'Manaus', 'Curitiba', 'Recife', 'Porto Alegre',
    'Belém', 'Goiânia', 'Guarulhos', 'Campinas', 'São Luís',
  ],
  Mexico: [
    'Mexico City', 'Guadalajara', 'Monterrey', 'Puebla', 'Tijuana',
    'León', 'Ciudad Juárez', 'Zapopan', 'Mérida', 'San Luis Potosí',
    'Aguascalientes', 'Querétaro', 'Cancún', 'Morelia', 'Chihuahua',
  ],
  Japan: [
    'Tokyo', 'Osaka', 'Yokohama', 'Nagoya', 'Sapporo', 'Kobe', 'Kyoto',
    'Fukuoka', 'Kawasaki', 'Saitama', 'Hiroshima', 'Sendai', 'Chiba',
    'Kitakyushu', 'Sakai', 'Niigata', 'Hamamatsu', 'Shizuoka',
  ],
  Sweden: [
    'Stockholm', 'Gothenburg', 'Malmö', 'Uppsala', 'Västerås', 'Örebro',
    'Linköping', 'Helsingborg', 'Jönköping', 'Norrköping', 'Lund', 'Umeå',
  ],
};

/** How many suggestions show before "Show all". */
export const SUGGESTED_COLLAPSED_COUNT = 12;

/** The suggestions for ONE country: the first SUGGESTED_COLLAPSED_COUNT, or all of them when expanded. */
export function suggestedLocationsFor(country: Country, showAll: boolean): { visible: readonly string[]; hiddenCount: number } {
  const all = SUGGESTED_LOCATIONS[country] ?? [];
  if (showAll || all.length <= SUGGESTED_COLLAPSED_COUNT) return { visible: all, hiddenCount: 0 };
  return { visible: all.slice(0, SUGGESTED_COLLAPSED_COUNT), hiddenCount: all.length - SUGGESTED_COLLAPSED_COUNT };
}

/** What a suggestion puts in the Location box: a UK city bare, any other "City, Country" (unchanged rule). */
export function quickLocationValue(city: string, country: Country): string {
  return country === 'UK' ? city : `${city}, ${suffixWord(country)}`;
}

const norm = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** True when the Location box holds exactly this suggestion (either form). Drives the chip's "selected" look. */
export function isQuickLocationSelected(location: string, city: string, country: Country): boolean {
  const l = norm(location);
  return !!l && (l === norm(city) || l === norm(quickLocationValue(city, country)));
}

/** The words that, at the END of a location, tie it to a country ("…, Australia", "Leeds UK"). */
const COUNTRY_TAILS: Partial<Record<Country, readonly string[]>> = {
  UK: ['uk', 'united kingdom', 'gb', 'great britain', 'england', 'scotland', 'wales', 'northern ireland'],
  Australia: ['australia', 'au', 'aus'],
  USA: ['usa', 'us', 'united states', 'united states of america'],
  NewZealand: ['new zealand', 'nz'],
  SouthAfrica: ['south africa'],
  UAE: ['uae', 'united arab emirates'],
};
function tailsFor(c: Country): string[] {
  return [...new Set([...(COUNTRY_TAILS[c] ?? []), norm(c), norm(countryName(c)), norm(suffixWord(c))])];
}

/** Is this Location tied to `country` — one of its suggestions (bare or "City, Country"), or text ending in
 *  its name ("Perth, Australia", "Leeds UK")? A typed suburb ("Ashgrove") is tied to nothing. */
export function locationTiedToCountry(location: string, country: Country): boolean {
  const l = norm(location);
  if (!l) return false;
  if ((SUGGESTED_LOCATIONS[country] ?? []).some((city) => isQuickLocationSelected(location, city, country))) return true;
  const stripped = l.replace(/[.,]+$/, '');
  /* "New South Wales" ends in "wales" and is not in the UK. */
  if (country === 'UK' && /\bnew south wales$/.test(stripped)) return false;
  return tailsFor(country).some((t) => t && (stripped === t || stripped.endsWith(`, ${t}`) || stripped.endsWith(` ${t}`)));
}

/**
 * The Location box after the country changes from `from` to `to`.
 * ⛔ Cleared when it belongs to the OLD country (one of its suggestions, or it names that country) — a
 *    "Leeds" left in the box under Australia would search Leeds with an Australian bias.
 * ⛔ Kept when the person typed something tied to no country (a suburb, a postcode) — it may well be in the
 *    new country, and retyping it is the annoyance this avoids.
 * The radius and "This town only" are separate state and never change here.
 */
export function locationAfterCountryChange(location: string, from: Country, to: Country): string {
  if (from === to) return location;
  return locationTiedToCountry(location, from) ? '' : location;
}
