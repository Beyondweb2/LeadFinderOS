/* THE RESEARCH PACK — one plain-text block per researched brand that Jess pastes into her own Claude Project
 * (docs/ugc-brand-finder.md). Her field order is section 2 of her pitch-system export ("Inputs per brand").
 * Pure. Every field carries its source URL; anything not known is written "unknown", never guessed.
 * It ends with the one instruction her project answers: "Write the pitch for [channel] using my pitch system." */

import type { ContactChoice } from './contactOrder.ts';
import { reviewsLine, type ResearchResult, type Sourced } from './research.ts';
import type { TierResult } from './tiers.ts';
import type { NamedContact, WaNumber } from './normalize.ts';

export const NO_EXPERIENCE_FIT = 'none, lead with the problem';
const UNKNOWN = 'unknown';

export interface PackBrand {
  name: string;
  website: string | null;
  instagram_url: string | null;
  country: string | null;
  facebook_page_id?: string | null;
  ad_start_dates?: readonly string[] | null;
  creators_seen?: readonly string[] | null;
  ships_thailand?: boolean | null;
  experience_fit?: string | null;
  researched_at?: string | null;
  research?: { verified?: ResearchResult | null } | null;
}

export interface PackContext {
  tier: TierResult;
  contact: ContactChoice;
  /** A WhatsApp number worth trying (mobile or a website chat button), used only when there is no email or Instagram route. */
  wa?: readonly Pick<WaNumber, 'number' | 'source'>[];
  now?: Date;
}

const src = (url: string | null | undefined) => (url ? ` (source: ${url})` : ` (source: ${UNKNOWN})`);
const sourced = (s: Sourced | null | undefined) => (s ? `${s.value}${src(s.url)}` : UNKNOWN);

/** The channel her pitch is written for: the brand's best contact route. */
export function packChannel(contact: ContactChoice, wa: PackContext['wa'] = []): 'email' | 'Instagram DM' | 'WhatsApp' | null {
  if (contact.channel === 'email') return 'email';
  if (contact.channel === 'instagram') return 'Instagram DM';
  if (wa.length) return 'WhatsApp';
  return null;
}

const CONTACT_QUALITY: Record<ContactChoice['kind'], string> = {
  named: 'Named person', partnerships: 'Partnerships inbox', marketing: 'Marketing inbox', generic: 'Generic inbox',
  instagram: 'DM', form: 'Form', none: UNKNOWN,
};

function contactLines(b: PackBrand, c: ContactChoice, wa: PackContext['wa']): string[] {
  if (c.kind === 'none') {
    const w = wa?.[0];
    return [w ? `Contact: WhatsApp +${w.number} (source: ${w.source === 'website_button' ? 'the brand’s website chat button' : 'contact scraper'}, ${b.website ?? UNKNOWN})` : `Contact: ${UNKNOWN}`, `Contact quality: ${w ? 'DM' : UNKNOWN}`];
  }
  const where = c.channel === 'instagram' ? b.instagram_url : c.channel === 'email' ? c.email : null;
  const via = c.channel === 'instagram' ? (b.instagram_url ?? UNKNOWN) : c.channel === 'email' ? `contact scraper read of ${b.website ?? UNKNOWN}` : (b.website ?? UNKNOWN);
  const person = c.person;
  return [`Contact: ${where ?? c.label} (source: ${via}${c.kind === 'named' && person?.email ? `; email status: ${person.email_status ?? UNKNOWN}` : ''})`, `Contact quality: ${CONTACT_QUALITY[c.kind]}`];
}

function namedLine(p: NamedContact | null): string {
  if (!p) return `Named person: ${UNKNOWN}`;
  return `Named person: Address to: ${p.name}, ${p.title}${p.linkedin ? ` (source: ${p.linkedin})` : src(null)}`;
}

function tierLine(b: PackBrand, t: TierResult): string {
  const letter = t.tier === 'unrated' ? 'unrated' : t.tier === 'skip' ? 'skip (a hard no)' : t.tier === 'local' ? 'local' : t.tier;
  const adsUrl = b.facebook_page_id && (b.ad_start_dates?.length ?? 0) > 0 ? `https://www.facebook.com/ads/library/?view_all_page_id=${b.facebook_page_id}` : null;
  return `Pays-for-UGC tier: ${letter}. Evidence: ${t.why}${adsUrl ? ` (source: ${adsUrl})` : (b.creators_seen?.length ? ` (source: ${UNKNOWN})` : '')}`;
}

export function marketLabel(country: string | null | undefined): string {
  if (!country) return UNKNOWN;
  return country.toUpperCase() === 'GB' ? 'UK' : country.toUpperCase();
}

export function researchPack(b: PackBrand, ctx: PackContext): string {
  const v = b.research?.verified ?? null;
  const when = b.researched_at ? new Date(b.researched_at) : null;
  const ships = v?.ships_to_thailand
    ? `${v.ships_to_thailand.ships ? 'yes' : 'no'}${src(v.ships_to_thailand.url)}`
    : b.ships_thailand == null ? UNKNOWN : `${b.ships_thailand ? 'yes' : 'no'} (source: set by Jess)`;
  const reviews = v?.reviews ? `${reviewsLine(v.reviews)?.replace(/^Reviews: /, '') ?? UNKNOWN}${v.reviews.url ? src(v.reviews.url) : ''}` : UNKNOWN;
  const ig = v?.instagram ? `@${v.instagram.handle} (source: ${v.instagram.url})` : b.instagram_url ? `${b.instagram_url} (source: unverified)` : UNKNOWN;
  const channel = packChannel(ctx.contact, ctx.wa);
  const lines = [
    `Brand: ${b.name}`,
    `Website: ${b.website ?? UNKNOWN}`,
    ...contactLines(b, ctx.contact, ctx.wa),
    namedLine(ctx.contact.person),
    `Instagram: ${ig}`,
    tierLine(b, ctx.tier),
    `Product: ${sourced(v?.product)}`,
    `Verified product detail: ${sourced(v?.product_detail)}`,
    `What the brand is pushing now: ${sourced(v?.pushing_now)}`,
    `Reviews: ${reviews}`,
    `Your experience fit: ${b.experience_fit?.trim() || NO_EXPERIENCE_FIT}`,
    `Ships to Thailand: ${ships}`,
    `Market: ${marketLabel(b.country)}`,
    `Research date: ${when && Number.isFinite(when.getTime()) ? when.toISOString().slice(0, 10) : UNKNOWN}`,
    '',
    `Write the pitch for ${channel ?? 'the best channel (no contact found yet)'} using my pitch system.`,
  ];
  return lines.join('\n');
}
