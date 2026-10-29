/* JESS'S EXCLUSION RULES — pure, one copy (docs/ugc-brand-finder.md). Read by the brand list (to hide), the
 * edge function (to say why) and the tests.
 *
 * ⛔ DERIVED, NEVER STORED. ugc_brands keeps the FACTS (page age, admin countries, links, about/address); the
 *    verdict is worked out on every read, so a rule change re-judges every brand without a backfill.
 * ⛔ HIDE, NEVER DELETE. A flagged or blocked brand is hidden by default and shown under "Show hidden".
 * ⛔ AN UNKNOWN FACT IS NOT A FLAG. A page age, admin list or about/address we could not read flags nothing —
 *    only a fact we actually have does. (Positive match: flag on the fact, never on its absence.) */

export type DropshipFlag = 'new_page' | 'foreign_admins' | 'marketplace_links' | 'no_about_or_address';
export type BlockedCategory = 'gambling' | 'crypto' | 'money_course' | 'religion';

export const DROPSHIP_FLAG_LABEL: Record<DropshipFlag, string> = {
  new_page: 'Page under 6 months old',
  foreign_admins: 'Page run from another country',
  marketplace_links: 'Links to AliExpress / Temu',
  no_about_or_address: 'No About page and no address',
};
export const BLOCKED_LABEL: Record<BlockedCategory, string> = {
  gambling: 'Gambling',
  crypto: 'Crypto',
  money_course: 'Forex / trading / "make money" course',
  religion: 'Religion-based brand',
};

/** A page younger than this many months counts as new (Jess: under 6 months). */
export const NEW_PAGE_MONTHS = 6;

const MARKETPLACE = /(^|[./])(aliexpress\.[a-z.]+|temu\.com|s\.click\.aliexpress\.com|a\.aliexpress\.com)(\/|$|\?)|aliexpress|\btemu\b/i;

const BLOCKED_PATTERNS: Record<BlockedCategory, RegExp> = {
  gambling: /\b(casino|casinos|gambling|gamble|sportsbook|betting|bets|slot machines?|online slots|poker|roulette|blackjack|bookmaker|lottery|jackpot)\b/i,
  crypto: /\b(crypto|cryptocurrency|bitcoin|btc|ethereum|nft|nfts|web3|blockchain|defi|altcoins?|memecoins?|airdrop)\b/i,
  religion: /\b(christian|christianity|church|jesus|bible|biblical|scripture|faith[- ]based|gospel|catholic|islamic|muslim|quran|halal lifestyle|hijab brand|jewish|torah|kosher lifestyle|hindu|buddhist|dharma|prayer|worship|ministry|god's|godly)\b/i,
  money_course: /\b(forex|fx trading|day ?trading|trading (signals?|course|academy|mentorship)|prop firm|options trading|make money (online|from home)|passive income|get rich|financial freedom course|side hustle (course|academy)|dropshipping (course|mentor|academy))\b/i,
};

export interface BrandFacts {
  name?: string | null;
  website?: string | null;
  country?: string | null;
  page_created_at?: string | null;
  admin_countries?: readonly string[] | null;
  shop_links?: readonly string[] | null;
  has_about_page?: boolean | null;
  has_address?: boolean | null;
  /** Free text we saw: ad copy, search snippet, page description. */
  text?: string | null;
}

export interface BrandVerdict {
  dropship: DropshipFlag[];
  blocked: BlockedCategory[];
  /** Hidden by default: any dropshipping sign, or a blocked category. */
  hidden: boolean;
}

/** ISO-2 and common names → ISO-2, for comparing admin countries with the brand's country. */
const COUNTRY_ALIASES: Record<string, string> = {
  'united kingdom': 'GB', uk: 'GB', gb: 'GB', 'great britain': 'GB', england: 'GB', scotland: 'GB', wales: 'GB',
  'united states': 'US', usa: 'US', us: 'US', 'united states of america': 'US', canada: 'CA', ca: 'CA',
  australia: 'AU', au: 'AU', singapore: 'SG', sg: 'SG', malaysia: 'MY', my: 'MY', philippines: 'PH', ph: 'PH',
  'hong kong': 'HK', hk: 'HK', thailand: 'TH', th: 'TH', china: 'CN', cn: 'CN', vietnam: 'VN', 'viet nam': 'VN',
  india: 'IN', pakistan: 'PK', bangladesh: 'BD', indonesia: 'ID', nigeria: 'NG', turkey: 'TR', 'türkiye': 'TR',
};
export function countryCode(v: string | null | undefined): string | null {
  const k = String(v ?? '').trim().toLowerCase();
  if (!k) return null;
  return COUNTRY_ALIASES[k] ?? (/^[a-z]{2}$/.test(k) ? k.toUpperCase() : null);
}

export function isNewPage(createdAt: string | null | undefined, now: Date): boolean {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return false;
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - NEW_PAGE_MONTHS);
  return t > cutoff.getTime();
}

export function brandVerdict(f: BrandFacts, now: Date = new Date()): BrandVerdict {
  const dropship: DropshipFlag[] = [];
  if (isNewPage(f.page_created_at, now)) dropship.push('new_page');

  const home = countryCode(f.country);
  const admins = (f.admin_countries ?? []).map(countryCode).filter((c): c is string => !!c);
  if (home && admins.length > 0 && !admins.includes(home)) dropship.push('foreign_admins');

  const links = [f.website ?? '', ...(f.shop_links ?? [])].filter(Boolean);
  if (links.some((l) => MARKETPLACE.test(l))) dropship.push('marketplace_links');

  if (f.has_about_page === false && f.has_address === false) dropship.push('no_about_or_address');

  const corpus = [f.name, f.website, f.text].filter(Boolean).join(' \n ');
  const blocked = (Object.keys(BLOCKED_PATTERNS) as BlockedCategory[]).filter((k) => BLOCKED_PATTERNS[k].test(corpus));

  return { dropship, blocked, hidden: dropship.length > 0 || blocked.length > 0 };
}

/** The reasons as words, for the row's warning chip and the "Show hidden" list. */
export function verdictReasons(v: BrandVerdict): string[] {
  return [...v.blocked.map((b) => BLOCKED_LABEL[b]), ...v.dropship.map((d) => DROPSHIP_FLAG_LABEL[d])];
}
