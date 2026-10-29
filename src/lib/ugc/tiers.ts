/* JESS'S BRAND TIERS — pure, derived on every read, never stored (docs/ugc-brand-finder.md).
 *
 *   skip   a hard no: mega-brand, retailer, marketplace, her blocked list, already pitched (her pitch log),
 *          gambling / crypto / forex & money courses / religion-based, or a dropshipping sign.
 *   B      from the Ads Library (Jess): 5+ ACTIVE video ads with at least one started in the last 60 days,
 *          or 3+ active video ads started in the last 30 days. Raw ad count alone never ranks a brand.
 *   A/C/D  her rules in her private pitch system need her judgement; until she sets one (tier_override, or the
 *          tier imported from her sheet) the brand is 'unrated' — never guessed.
 *   An override from Jess always wins, except over a hard no.
 *
 * ⛔ Her template choice follows the tier: Ad idea v2 for A/B, Video idea v3 for C/D (pitch.ts). */

import { brandVerdict, verdictReasons, type BrandFacts } from './brandRules.ts';
import { normaliseName } from './normalize.ts';

export type Tier = 'A' | 'B' | 'C' | 'D';
export type TierResult =
  | { tier: Tier; why: string; source: 'jess' | 'ads_library' }
  | { tier: 'unrated'; why: string }
  | { tier: 'local'; why: string }
  | { tier: 'skip'; why: string; reasons: string[] };

/** Tier B thresholds (Jess). */
export const TIER_B_MIN_ADS = 5;
export const TIER_B_RECENT_DAYS = 60;
export const TIER_B_FRESH_MIN_ADS = 3;
export const TIER_B_FRESH_DAYS = 30;

/** Brands too big to answer a creator cold (Jess: skip mega-brands). Matched on the normalised name or domain. */
export const MEGA_BRANDS = [
  'nike', 'adidas', 'apple', 'samsung', 'loreal', 'l oreal', 'maybelline', 'nivea', 'dove', 'unilever', 'procter and gamble',
  'pg', 'nestle', 'coca cola', 'pepsi', 'red bull', 'sephora', 'estee lauder', 'clinique', 'lancome', 'garnier', 'olay',
  'gillette', 'colgate', 'johnson and johnson', 'neutrogena', 'cerave', 'la roche posay', 'the ordinary', 'dyson', 'sony',
  'microsoft', 'google', 'amazon', 'meta', 'h and m', 'hm', 'zara', 'uniqlo', 'shein', 'primark', 'gymshark', 'lululemon',
] as const;
/** Retailers and marketplaces (they sell other brands; Jess pitches the brand itself). */
export const RETAILERS = [
  'amazon', 'ebay', 'etsy', 'aliexpress', 'temu', 'shein', 'walmart', 'target', 'tesco', 'sainsburys', 'asda', 'boots',
  'superdrug', 'argos', 'john lewis', 'selfridges', 'harrods', 'asos', 'zalando', 'lookfantastic', 'cult beauty', 'feelunique',
  'ulta', 'sephora', 'costco', 'shopee', 'lazada', 'qoo10', 'watsons', 'guardian', 'noon', 'myer', 'david jones', 'iherb',
] as const;
const RETAILER_HOSTS = /(^|\.)(amazon|ebay|etsy|aliexpress|temu|shein|walmart|target|tesco|boots|superdrug|argos|asos|zalando|lookfantastic|cultbeauty|ulta|sephora|shopee|lazada|watsons|iherb)\.[a-z.]+$/i;

export interface TierInput extends BrandFacts {
  domain?: string | null;
  brand_key?: string | null;
  ad_start_dates?: readonly string[] | null;
  tier_override?: string | null;
  track?: string | null;
  /** Her tier-adjustment facts (null = not known; nothing is adjusted on an unknown). */
  company_country?: string | null;
  ships_to?: ShipsTo | string | null;
  ships_thailand?: boolean | null;
  creator_programme_country?: string | null;
}
export interface TierContext {
  now?: Date;
  /** Her blocked list (names or domains). */
  blocked?: readonly string[];
  /** brand_keys and normalised names already in her pitch log (still inside any re-pitch wait). */
  pitchedKeys?: ReadonlySet<string>;
}

const nameHit = (name: string, list: readonly string[]) => {
  const n = normaliseName(name);
  return list.some((x) => n === x || n.startsWith(`${x} `));
};

export function adsLibraryTierB(starts: readonly string[] | null | undefined, now: Date): { ok: boolean; why: string } {
  const times = (starts ?? []).map((d) => Date.parse(d)).filter((t) => Number.isFinite(t));
  const days = (t: number) => (now.getTime() - t) / 86_400_000;
  const in60 = times.filter((t) => days(t) <= TIER_B_RECENT_DAYS).length;
  const in30 = times.filter((t) => days(t) <= TIER_B_FRESH_DAYS).length;
  if (times.length >= TIER_B_MIN_ADS && in60 >= 1) return { ok: true, why: `${times.length} active video ads, ${in60} started in the last ${TIER_B_RECENT_DAYS} days` };
  if (in30 >= TIER_B_FRESH_MIN_ADS) return { ok: true, why: `${in30} active video ads started in the last ${TIER_B_FRESH_DAYS} days` };
  return { ok: false, why: times.length ? `${times.length} active video ads; ${in30} started in the last ${TIER_B_FRESH_DAYS} days` : 'No active video ads found' };
}

export function hardNoReasons(b: TierInput, ctx: TierContext = {}): string[] {
  const now = ctx.now ?? new Date();
  const out = verdictReasons(brandVerdict(b, now));
  const name = b.name ?? '';
  const host = (b.domain ?? '').toLowerCase();
  if (name && nameHit(name, MEGA_BRANDS)) out.unshift('Mega-brand');
  if ((name && nameHit(name, RETAILERS)) || (host && RETAILER_HOSTS.test(host))) out.unshift('Retailer or marketplace');
  const blocked = (ctx.blocked ?? []).map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (blocked.length && (blocked.includes(host) || blocked.some((x) => normaliseName(x) === normaliseName(name)))) out.unshift('On her blocked list');
  if (ctx.pitchedKeys && ((b.brand_key && ctx.pitchedKeys.has(b.brand_key)) || ctx.pitchedKeys.has(`n:${normaliseName(name)}`))) out.unshift('Already in her pitch log');
  /* Her rule: a brand whose creator programme is limited to residents of one country is skipped (hidden, not deleted). */
  if (b.creator_programme_country) out.unshift(`Creator programme limited to residents of ${b.creator_programme_country}`);
  return [...new Set(out)];
}

/* ── Her tier adjustments (pitch system 3a step 3) ─────────────────────────────────────────────────────────────
   Facts on the brand, set from her research or by her on the sheet. An absent fact adjusts nothing. */
export type ShipsTo = 'worldwide' | 'one_country' | 'uk_ie';

/** A Thai company: her recorded company country, or a Thai domain (.th). */
export function isThaiCompany(b: Pick<TierInput, 'company_country' | 'domain'>): boolean {
  if (String(b.company_country ?? '').toUpperCase() === 'TH') return true;
  return /\.(co\.|in\.|or\.|ac\.)?th$/i.test(String(b.domain ?? ''));
}

const LOWER: Record<Tier, Tier> = { A: 'B', B: 'C', C: 'D', D: 'D' };

/** Apply her adjustments to a base tier. Returns the tier and the reasons that changed it. */
export function adjustTier(base: Tier, b: TierInput): { tier: Tier; notes: string[] } {
  if (isThaiCompany(b)) return { tier: 'D', notes: base === 'D' ? [] : ['Thai company: always Tier D'] };
  if (b.ships_to === 'uk_ie') return { tier: LOWER[base], notes: base === 'D' ? [] : ['Ships to the UK and Ireland only: one tier lower'] };
  /* Positive match: only an explicit "does not ship to Thailand" lowers it; unknown leaves the tier alone. */
  if (b.ships_to === 'one_country' && b.ships_thailand === false) return { tier: LOWER[base], notes: base === 'D' ? [] : ['Ships to one country only, not Thailand: one tier lower'] };
  return { tier: base, notes: [] };
}

export function tierFor(b: TierInput, ctx: TierContext = {}): TierResult {
  const now = ctx.now ?? new Date();
  const no = hardNoReasons(b, ctx);
  if (no.length) return { tier: 'skip', why: no[0], reasons: no };
  /* The Chiang Mai local track is not tiered: one business per category, CM collab DM v4 (her Agencies & Talent rules). */
  if (b.track === 'local') return { tier: 'local', why: 'Local collab (CM collab DM v4)' };
  const o = String(b.tier_override ?? '').toUpperCase();
  const withAdjust = (base: Tier, why: string, source: 'jess' | 'ads_library'): TierResult => {
    const a = adjustTier(base, b);
    return { tier: a.tier, why: a.notes.length ? `${why}; ${a.notes.join('; ')}` : why, source };
  };
  if (o === 'A' || o === 'B' || o === 'C' || o === 'D') return withAdjust(o, `Set by Jess (${o})`, 'jess');
  const ads = adsLibraryTierB(b.ad_start_dates, now);
  if (ads.ok) return withAdjust('B', ads.why, 'ads_library');
  /* A Thai company is Tier D even before Jess rates it. */
  if (isThaiCompany(b)) return { tier: 'D', why: 'Thai company: always Tier D', source: 'jess' };
  return { tier: 'unrated', why: `${ads.why}. Jess to set A, C or D.` };
}

/** Sort order for the list: A, B, C, D, then unrated, skips last. */
export const TIER_RANK: Record<string, number> = { A: 0, B: 1, C: 2, D: 3, unrated: 4, local: 5, skip: 9 };

/** Her template family by tier: Ad idea v2 for A/B, Video idea v3 for C/D (UGC Jobs sheet, 16.10.26). */
export function templateFamilyFor(t: TierResult['tier']): 'ad_idea_v2' | 'video_idea_v3' | null {
  if (t === 'A' || t === 'B') return 'ad_idea_v2';
  if (t === 'C' || t === 'D') return 'video_idea_v3';
  return null;
}
