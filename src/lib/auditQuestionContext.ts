export type AuditQuestionContext = {
  business_name: string;
  business_category: string;
  website: string;
  primary_location: string;
  services: string[];
  service_areas: string[];
  specialisms: string[];
  country: string;
};

const clean = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const key = (value: string) => value.toLocaleLowerCase();

export function normalizeAuditList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,\n]/) : [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of raw) {
    const next = clean(item);
    const k = key(next);
    if (!next || seen.has(k)) continue;
    seen.add(k);
    result.push(next);
  }
  return result;
}

export function buildAuditPreviewRequest(
  context: AuditQuestionContext,
  options: { questionCount: number; purpose?: 'baseline' | 'measurement'; businessScope?: 'local' | 'national' | 'hybrid'; userId?: string; leadId?: string } ,
): Record<string, unknown> {
  const services = normalizeAuditList(context.services);
  const specialisms = normalizeAuditList(context.specialisms);
  const serviceAreas = normalizeAuditList(context.service_areas);
  return {
    preview: true,
    ...(options.purpose ? { purpose: options.purpose } : {}),
    ...(options.userId ? { user_id: options.userId } : {}),
    ...(options.leadId ? { lead_id: options.leadId } : {}),
    business_name: clean(context.business_name),
    business_type: clean(context.business_category) || 'business',
    location_text: clean(context.primary_location),
    country: clean(context.country) || null,
    has_website: Boolean(clean(context.website)),
    ...(clean(context.website) ? { website: clean(context.website) } : {}),
    ...(options.businessScope ? { business_scope: options.businessScope } : {}),
    specialisms: normalizeAuditList([...services, ...specialisms]).join(', '),
    service_areas: serviceAreas,
    question_count: options.questionCount,
    ...(options.purpose === 'measurement' ? { skip_seo: true } : {}),
  };
}

/** Prompt-only context: areas are verified facts, not an instruction to clone one query per town. */
export function serviceAreaQuestionDirective(primaryLocation: string, value: unknown): string {
  const primaryKey = key(clean(primaryLocation));
  const areas = normalizeAuditList(value).filter((area) => key(area) !== primaryKey).slice(0, 12);
  if (!areas.length) return '';
  return `VERIFIED SERVICE AREAS: ${areas.join(', ')}. Use these only for a balanced minority of relevant local questions. Do not repeat the same intent for every area or create a list of town-swapped near-duplicates; prioritise distinct services and realistic high-value service/location combinations.`;
}
