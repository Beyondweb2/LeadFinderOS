/* ════════════════════════════════════════════════════════════════════════════════════════════════
   IS THE LEAD'S "WEBSITE" THEIR OWN SITE, OR A PROFILE ON SOMEONE ELSE'S? (moved here 2026-09-27)

   One rule, read by the voice-note script (voiceNoteScript.ts) and the Cold Call Playbook
   (coldCallPlaybook.ts), so neither can call a TradeHQ page "your website" while the other does not.
   Pure and edge-reachable: relative `.ts` imports only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { isAggregatorUrl, domainOf } from './aggregators.ts';

/* ⛔ A PROFILE PAGE IS NOT "YOUR WEBSITE" (Paul, 2026-09-26). Firebeard Electrical's website on record
   is tradehq.co.uk/firebeardelectrical — a directory profile. Researching it as their site produced
   "nothing obviously broken" about a page they do not own. So the lead's website is CLASSIFIED first:
   a directory / social profile is never researched, and the script says what it really is. The host
   lists are aggregators.ts (the shared "not an own website" sets) plus the trade-profile platforms it
   does not carry; the additions live here so this does not change what other features call a directory. */
const EXTRA_PROFILE_HOSTS = ['tradehq.co.uk', 'houzz.co.uk', 'houzz.com', 'linktr.ee', 'myhammer.co.uk', 'localheroes.com', 'yably.co.uk'];
const SOCIAL_HOSTS = ['facebook.com', 'fb.com', 'fb.me', 'm.me', 'instagram.com', 'instagr.am', 'tiktok.com', 'x.com', 'twitter.com', 'linkedin.com', 'youtube.com', 'pinterest.com', 'linktr.ee'];
const PROFILE_LABELS: Record<string, string> = {
  'tradehq.co.uk': 'TradeHQ', 'checkatrade.com': 'Checkatrade', 'mybuilder.com': 'MyBuilder', 'ratedpeople.com': 'Rated People',
  'trustatrader.com': 'TrustATrader', 'bark.com': 'Bark', 'yell.com': 'Yell', 'yell.co.uk': 'Yell', 'houzz.co.uk': 'Houzz', 'houzz.com': 'Houzz',
  'freeindex.co.uk': 'FreeIndex', 'thomsonlocal.com': 'Thomson Local', 'yelp.com': 'Yelp', 'yelp.co.uk': 'Yelp', 'nextdoor.co.uk': 'Nextdoor',
  'nextdoor.com': 'Nextdoor', 'facebook.com': 'Facebook', 'fb.com': 'Facebook', 'fb.me': 'Facebook', 'instagram.com': 'Instagram',
  'linkedin.com': 'LinkedIn', 'tiktok.com': 'TikTok', 'x.com': 'X', 'twitter.com': 'X', 'youtube.com': 'YouTube', 'linktr.ee': 'Linktree',
  'google.com': 'Google', 'business.google.com': 'Google', 'myhammer.co.uk': 'MyHammer', 'localheroes.com': 'Local Heroes', 'yably.co.uk': 'Yably',
};

export type SiteSource = 'own_site' | 'directory_profile' | 'social_profile' | 'none';
export interface LeadWebsiteKind { source: SiteSource; host: string; label: string | null }

const onHost = (host: string, list: readonly string[]) => list.find((d) => host === d || host.endsWith(`.${d}`)) ?? null;

export function classifyLeadWebsite(url: string | null | undefined): LeadWebsiteKind {
  const raw = (url ?? '').trim();
  if (!raw) return { source: 'none', host: '', label: null };
  const host = domainOf(raw);
  if (!host) return { source: 'none', host: '', label: null };
  const social = onHost(host, SOCIAL_HOSTS);
  if (social) return { source: 'social_profile', host, label: PROFILE_LABELS[social] ?? social };
  const extra = onHost(host, EXTRA_PROFILE_HOSTS);
  if (extra || isAggregatorUrl(raw)) {
    const key = extra ?? Object.keys(PROFILE_LABELS).find((d) => host === d || host.endsWith(`.${d}`)) ?? host;
    return { source: 'directory_profile', host, label: PROFILE_LABELS[key] ?? host };
  }
  return { source: 'own_site', host, label: null };
}
