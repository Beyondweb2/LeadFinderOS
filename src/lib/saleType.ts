/**
 * "What we're selling" per lead. Stored as plain text (DB) + this TS union so a
 * 4th type later needs no migration. Effective type for a lead is:
 *   lead.sale_type ?? campaign.default_sale_type ?? 'website'
 */
export type SaleType = 'website' | 'webapp' | 'app' | 'service';

export const SALE_TYPES: { value: SaleType; label: string }[] = [
  { value: 'website', label: 'Website' },
  { value: 'webapp', label: 'Web App' },
  { value: 'app', label: 'App' },
  { value: 'service', label: 'Service' },
];

export const SALE_TYPE_LABELS: Record<SaleType, string> = {
  website: 'Website',
  webapp: 'Web App',
  app: 'App',
  service: 'Service',
};

/** Deliverable/scope checkbox options per effective sale type (stored in services_included). */
export const DELIVERABLE_OPTIONS: Record<SaleType, string[]> = {
  website: ['Website Design', 'Website Development', 'SEO', 'Google Business Setup', 'Hosting', 'Maintenance', 'Copywriting'],
  webapp: ['Web App Design', 'Frontend Build', 'Backend / API', 'Database', 'Hosting', 'Auth / Accounts', 'Maintenance'],
  app: ['iOS', 'Android', 'Cross-platform', 'Backend / API', 'App Store Setup', 'Maintenance'],
  // Service leads use a free-text deliverables note instead of checkboxes.
  service: [],
};

/** Resolve a lead's effective sale type from its override + its campaign default. */
export function resolveSaleType(leadSaleType: string | null | undefined, campaignDefault: string | null | undefined): SaleType {
  const v = (leadSaleType || campaignDefault || 'website') as SaleType;
  return (['website', 'webapp', 'app', 'service'] as string[]).includes(v) ? v : 'website';
}
