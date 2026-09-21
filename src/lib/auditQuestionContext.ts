import type { MarketModel } from './marketModel.ts';

/**
 * THE ONE business-context shape question generation reads, for every manual audit path.
 *
 * ⛔ ONE SHAPE, TWO REQUESTS. The wizard used to build the preview body from this and then hand-
 * write a SECOND, different body on confirm — which is how a field could exist on the screen,
 * shape the previewed questions, and then never reach the stored audit. Both requests are built
 * here now (buildAuditPreviewRequest / buildAuditRunRequest) off the same object.
 *
 * IMPORTED BY AN EDGE FUNCTION: relative imports with an explicit .ts extension only (CLAUDE.md §4).
 */
export type AuditQuestionContext = {
  business_name: string;
  business_category: string;
  website: string;
  primary_location: string;
  services: string[];
  service_areas: string[];
  specialisms: string[];
  country: string;
  /** Explicit answer to "does it have a website?". Falls back to "a URL was given" when absent —
   *  they differ when the operator ticks Yes and has not typed the URL yet, and has_website
   *  branches the whole framing (service/booking angles vs presence/discovery). */
  has_website?: boolean;
  /** Where the business actually competes. Null = let the server's heuristic classify. */
  market_model?: MarketModel | null;
  /** e.g. "UK local businesses". National/hybrid only; a local trade's buyer is "people in the town". */
  target_audience?: string;
  /** Optional niches, kept separate from services so a sector can be a minority of the set. */
  specialist_sectors?: string[];
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

type AuditRequestOptions = {
  questionCount: number;
  /** 'discovery' is the manual 40 x 1 breadth scan; absent = an ordinary wizard audit. */
  purpose?: 'baseline' | 'measurement' | 'discovery';
  /** Explicit override; otherwise the context's own market_model is used. */
  businessScope?: MarketModel;
  userId?: string;
  leadId?: string;
  /** DISCOVERY ONLY: how many times the approved set is asked. The server clamps and defaults it. */
  runCount?: number;
};

/** The fields BOTH requests carry, derived from the context and nothing else. */
function baseRequest(context: AuditQuestionContext, options: AuditRequestOptions): Record<string, unknown> {
  const services = normalizeAuditList(context.services);
  const specialisms = normalizeAuditList(context.specialisms);
  const sectors = normalizeAuditList(context.specialist_sectors);
  const serviceAreas = normalizeAuditList(context.service_areas);
  const scope = options.businessScope ?? context.market_model ?? null;
  /* ⛔ THE MODEL DECIDES WHICH FIELDS EXIST, IN ONE PLACE. A local trade's buyer is "whoever is in
     the town", so an audience on a local audit is a field that changes nothing and a number in the
     stored row that nobody can act on. Enforced here rather than only in the wizard, so a caller
     that fills the whole context in cannot smuggle one in. */
  const wide = scope === 'national' || scope === 'hybrid';
  const audience = wide ? clean(context.target_audience) : '';
  const areas = scope === 'national' ? [] : serviceAreas;
  return {
    ...(options.purpose ? { purpose: options.purpose } : {}),
    ...(options.userId ? { user_id: options.userId } : {}),
    ...(options.leadId ? { lead_id: options.leadId } : {}),
    business_name: clean(context.business_name),
    business_type: clean(context.business_category) || 'business',
    location_text: clean(context.primary_location),
    country: clean(context.country) || null,
    has_website: typeof context.has_website === 'boolean' ? context.has_website : Boolean(clean(context.website)),
    ...(clean(context.website) ? { website: clean(context.website) } : {}),
    ...(scope ? { business_scope: scope } : {}),
    /* Services, specialisms and sectors all land in the one free-text `specialisms` column the
       audit row already has — no migration, and the generator reads them as one grounding list.
       `specialist_sectors` travels separately as well so the prompt can hold sectors to a minority
       rather than treating a niche as a headline service. */
    specialisms: normalizeAuditList([...services, ...specialisms, ...sectors]).join(', '),
    ...(wide && sectors.length ? { specialist_sectors: sectors } : {}),
    ...(audience ? { target_audience: audience } : {}),
    service_areas: areas,
    question_count: options.questionCount,
    /* ⛔ SENT WHENEVER THE CALLER STATED ONE, INCLUDING 1. This was `> 1` while the server's
       absent-default was a single run, so omitting it and asking for one meant the same thing.
       They stopped meaning the same thing the day discovery's default became DISCOVERY_DEFAULT_RUNS
       (3): a stated 1 that travels as an absence comes back as three runs and three times the
       Apify bill, with nothing on the screen saying so. A stated value is sent; absence is left to
       the callers that never had the dial. */
    ...(typeof options.runCount === 'number' && Number.isFinite(options.runCount) && options.runCount >= 1
      ? { run_count: Math.round(options.runCount) }
      : {}),
    ...(options.purpose === 'measurement' ? { skip_seo: true } : {}),
  };
}

export function buildAuditPreviewRequest(
  context: AuditQuestionContext,
  options: AuditRequestOptions,
): Record<string, unknown> {
  return { preview: true, ...baseRequest(context, options) };
}

/**
 * The confirm request: the same context plus the set the operator actually approved. The questions
 * travel verbatim, so no provider work happens between review and run.
 */
export function buildAuditRunRequest(
  context: AuditQuestionContext,
  options: AuditRequestOptions & {
    questions: string[];
    moneyQuestions?: string[];
    overrideDistance?: boolean;
  },
): Record<string, unknown> {
  const questions = options.questions.map((q) => q.trim()).filter(Boolean);
  const money = (options.moneyQuestions ?? []).filter((q) => questions.includes(q));
  return {
    ...baseRequest(context, options),
    questions,
    ...(money.length ? { money_questions: money } : {}),
    ...(options.overrideDistance ? { override_distance: true } : {}),
  };
}

/** Prompt-only context: areas are verified facts, not an instruction to clone one query per town. */
export function serviceAreaQuestionDirective(primaryLocation: string, value: unknown): string {
  const primaryKey = key(clean(primaryLocation));
  const areas = normalizeAuditList(value).filter((area) => key(area) !== primaryKey).slice(0, 12);
  if (!areas.length) return '';
  return `VERIFIED SERVICE AREAS: ${areas.join(', ')}. Use these only for a balanced minority of relevant local questions. Do not repeat the same intent for every area or create a list of town-swapped near-duplicates; prioritise distinct services and realistic high-value service/location combinations.`;
}
