/* PROSPECT PREVIEW — trade families.

   A trade key picks a template and a small WORD pack (what the trade is called, which icon a
   service gets). ⛔ A word pack holds vocabulary only — never a service the prospect did not list,
   never a claim ("24/7", "fully insured", "fast response"). Services come from the prospect. */

export interface TradePack {
  key: string;
  /** Singular, lower case: "electrician". */
  label: string;
  /** Recognises the stored trade (lead category / search keyword / audit business_type — often
   *  plural, sometimes "electrical contractor"). */
  match: RegExp;
  /** The work, as a heading noun: "Electrical services". Vocabulary, not a claim. */
  servicePhrase: string;
  /** schema.org LocalBusiness subtype, when one exists. */
  schemaType: string;
  /** Icon per service word, first match wins; `default` otherwise. */
  icons: Array<{ match: RegExp; icon: IconName }>;
  /** Credentials this trade's customers recognise — only ever SHOWN when the prospect's own site
   *  states them (facts.ts reads their pages for these words). */
  credentials: RegExp[];
}

export type IconName =
  | 'bolt' | 'plug' | 'light' | 'shield' | 'wrench' | 'drop' | 'flame' | 'key' | 'lock' | 'home'
  | 'roof' | 'hammer' | 'search' | 'car' | 'sun' | 'check' | 'default';

const COMMON_CREDENTIALS: RegExp[] = [
  /\bTrustMark\b/i, /\bWhich\?\s*Trusted Trader\b/i, /\bFederation of Master Builders\b|\bFMB\b/, /\bGuild of Master Craftsmen\b/i,
  /\bCITB\b/, /\bConstructionline\b/i, /\bSafeContractor\b/i, /\bCHAS\b/,
];

export const TRADE_PACKS: TradePack[] = [
  {
    key: 'electrician', servicePhrase: 'Electrical services', label: 'electrician', match: /electric/i, schemaType: 'Electrician',
    icons: [
      { match: /ev|charg|car/i, icon: 'car' }, { match: /solar|pv|battery/i, icon: 'sun' },
      { match: /light/i, icon: 'light' }, { match: /socket|rewir|wiring|board|consumer|fuse/i, icon: 'plug' },
      { match: /test|inspect|eicr|pat|safety|certif/i, icon: 'check' }, { match: /alarm|cctv|security|smoke/i, icon: 'shield' },
      { match: /fault|emergenc|repair/i, icon: 'bolt' },
    ],
    credentials: [/\bNICEIC\b/, /\bNAPIT\b/, /\bELECSA\b/, /\bPart P\b/i, /\b18th Edition\b/i, /\bECA\b/, /\bStroma\b/i, ...COMMON_CREDENTIALS],
  },
  {
    key: 'plumber', servicePhrase: 'Plumbing services', label: 'plumber', match: /plumb/i, schemaType: 'Plumber',
    icons: [
      { match: /boiler|heating|radiator/i, icon: 'flame' }, { match: /leak|drain|pipe|tap|toilet|water/i, icon: 'drop' },
      { match: /bathroom|kitchen|install/i, icon: 'home' }, { match: /emergenc|repair/i, icon: 'wrench' },
    ],
    credentials: [/\bGas Safe\b/i, /\bWRAS\b/, /\bCIPHE\b/, /\bAPHC\b/, /\bOFTEC\b/, ...COMMON_CREDENTIALS],
  },
  {
    key: 'heating', servicePhrase: 'Heating services', label: 'heating engineer', match: /heating|boiler|gas engineer|hvac|air con/i, schemaType: 'HVACBusiness',
    icons: [{ match: /boiler|heating|gas/i, icon: 'flame' }, { match: /service|repair/i, icon: 'wrench' }, { match: /heat pump|solar/i, icon: 'sun' }],
    credentials: [/\bGas Safe\b/i, /\bOFTEC\b/, /\bHETAS\b/, /\bMCS\b/, /\bF-Gas\b/i, ...COMMON_CREDENTIALS],
  },
  {
    key: 'locksmith', servicePhrase: 'Locksmith services', label: 'locksmith', match: /locksmith|lock/i, schemaType: 'Locksmith',
    icons: [{ match: /lock|cylinder|upvc|door/i, icon: 'lock' }, { match: /key|car|auto/i, icon: 'key' }, { match: /safe|security|alarm/i, icon: 'shield' }],
    credentials: [/\bMaster Locksmiths Association\b|\bMLA\b/, /\bDBS\b/, ...COMMON_CREDENTIALS],
  },
  {
    key: 'roofer', servicePhrase: 'Roofing services', label: 'roofer', match: /roof|gutter/i, schemaType: 'RoofingContractor',
    icons: [{ match: /roof|tile|slate|flat|chimney|fascia|soffit|gutter/i, icon: 'roof' }, { match: /repair|leak/i, icon: 'wrench' }],
    credentials: [/\bNFRC\b/, /\bCompetentRoofer\b/i, /\bCORC\b/, ...COMMON_CREDENTIALS],
  },
  {
    key: 'builder', servicePhrase: 'Building services', label: 'builder', match: /builder|building|construct|extension|renovat/i, schemaType: 'GeneralContractor',
    icons: [{ match: /extension|loft|build|renovat|conversion/i, icon: 'home' }, { match: /brick|repair|plaster/i, icon: 'hammer' }],
    credentials: [...COMMON_CREDENTIALS],
  },
];

/** The fallback pack: any trade, plain vocabulary. */
export function genericPack(trade: string | null | undefined): TradePack {
  const label = singularTrade(trade) || 'local business';
  const phrase = label ? label.charAt(0).toUpperCase() + label.slice(1) + ' services' : 'Our services';
  return { key: 'generic', servicePhrase: phrase, label, match: /.^/, schemaType: 'LocalBusiness', icons: [], credentials: COMMON_CREDENTIALS };
}

/** "Electricians" → "electrician", "Roofers" → "roofer". Conservative: only a trailing -s/-es. */
export function singularTrade(trade: string | null | undefined): string {
  const t = (trade ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return '';
  if (/(ss|us|is)$/.test(t)) return t;
  if (/(ches|shes|xes)$/.test(t)) return t.slice(0, -2);
  if (/s$/.test(t)) return t.slice(0, -1);
  return t;
}

export function tradePackFor(trade: string | null | undefined): TradePack {
  const t = (trade ?? '').trim();
  if (!t) return genericPack(t);
  return TRADE_PACKS.find((p) => p.match.test(t)) ?? genericPack(t);
}

export function iconForService(pack: TradePack, service: string): IconName {
  return pack.icons.find((i) => i.match.test(service))?.icon ?? (pack.key === 'electrician' ? 'bolt' : 'default');
}
