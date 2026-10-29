/* What the UGC page shows for one brand — derived on every render from the stored facts (docs/ugc-brand-finder.md).
 * SPA only (it reads the mobile-number check, src/lib/lineType.ts). */

import { classifyLineType, type LineType } from '@/lib/lineType';
import { bestContact, contactOptions, followUps, type ContactChoice, type FollowUpState } from './contactOrder';
import { tierFor, TIER_RANK, type TierContext, type TierResult } from './tiers';
import { WA_SOURCE_LABEL, type WaNumber } from './normalize';
import type { UgcBrand } from '@/hooks/useUgc';

export interface WaView extends WaNumber { lineType: LineType; worthTrying: boolean; sourceLabel: string }

export interface BrandView {
  tier: TierResult;
  hidden: boolean;
  contact: ContactChoice;
  contacts: ContactChoice[];
  wa: WaView[];
  followUp: FollowUpState;
}

/** A stored WhatsApp number (digits with country code) → mobile / landline from the existing check. */
export function waView(n: WaNumber): WaView {
  const lt = classifyLineType(`+${n.number}`);
  return { ...n, lineType: lt.lineType, worthTrying: lt.lineType === 'mobile' || n.source === 'website_button', sourceLabel: n.source === 'named_person' && n.label ? `${WA_SOURCE_LABEL.named_person}: ${n.label}` : WA_SOURCE_LABEL[n.source] };
}

export function brandView(b: UgcBrand, ctx: TierContext, now: Date = new Date()): BrandView {
  const tier = tierFor({ ...b, text: [...(b.research?.snippets ?? []), ...b.ad_samples.map((a) => a.text ?? '')].join(' ') }, { ...ctx, now });
  /* A website "chat on WhatsApp" button is a WhatsApp line by definition; a reception or person number is worth a
     try only when it reads as a mobile. Website buttons first, then mobiles, then the rest. */
  const wa = (b.wa_numbers ?? []).map(waView).sort((x, y) => Number(y.worthTrying) - Number(x.worthTrying));
  return { tier, hidden: tier.tier === 'skip', contact: bestContact(b), contacts: contactOptions(b), wa, followUp: followUps(b, now) };
}

export function sortByTier<T extends { view: BrandView; brand: UgcBrand }>(rows: T[]): T[] {
  return [...rows].sort((a, z) => (TIER_RANK[a.view.tier.tier] - TIER_RANK[z.view.tier.tier]) || (z.brand.live_ads_count - a.brand.live_ads_count) || a.brand.name.localeCompare(z.brand.name));
}

export const CONTACT_KIND_LABEL: Record<ContactChoice['kind'], string> = {
  named: 'Named person', partnerships: 'Partnerships inbox', marketing: 'Marketing inbox', generic: 'Generic inbox',
  instagram: 'Instagram DM', form: 'Form', none: 'No contact yet',
};
