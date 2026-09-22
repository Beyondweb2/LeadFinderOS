/* ════════════════════════════════════════════════════════════════════════════════════════════════
   CLIENT FACTS — one ranked resolver for everything Findable believes about a paid client, and the
   one place a genuine disagreement between sources becomes a QUESTION rather than a silent choice.

   ⛔ NEVER BLINDLY CONCATENATE, NEVER SILENTLY PICK. Every fact carries WHICH source won and WHICH
   sources disagreed. A disagreement is surfaced as CLIENT CONFIRMATION REQUIRED — it is not averaged,
   not concatenated, and not resolved by recency alone.
   ⛔ NEVER INVENT. A fact with no candidate is `null`, and a `null` renders as an explicit
   "not recorded" everywhere it appears. There is no placeholder that reads as a fact.

   THE ORDER, highest authority first (Paul, 2026-09-22):
     1 onboarding     — the client typed it or confirmed it
     2 client_record  — the paid lead row as it stands now
     3 baseline       — evidence from the completed paid baseline (its frozen context)
     4 discovery      — a verified Discovery scan's context
     5 crawl          — the stored website crawl and older audits

   ⚠️ RANK BREAKS TIES; IT DOES NOT HIDE THE LOSER. A lower-ranked source with a DIFFERENT value is
   recorded in `conflicts` even though it lost, because "the client's onboarding says Huntingdon and
   their own website says St Ives" is a thing Paul needs to ask about, not a thing to settle by table
   position.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Where a fact came from, most authoritative first. */
export const FACT_SOURCES = ['onboarding', 'client_record', 'baseline', 'discovery', 'crawl'] as const;
export type FactSource = (typeof FACT_SOURCES)[number];

/** Human wording for each source, for the confirmation list and the generated prompt. */
export const FACT_SOURCE_LABELS: Record<FactSource, string> = {
  onboarding: 'client onboarding',
  client_record: 'paid client record',
  baseline: 'paid baseline context',
  discovery: 'Discovery scan',
  crawl: 'website crawl / earlier audit',
};

const RANK: Record<FactSource, number> = FACT_SOURCES.reduce(
  (acc, s, i) => { acc[s] = i; return acc; },
  {} as Record<FactSource, number>,
);

export interface FactCandidate { value: string; source: FactSource }

export interface ResolvedFact {
  label: string;
  /** The winning value, or null when no source had one. */
  value: string | null;
  source: FactSource | null;
  /** Losing candidates whose value genuinely differs from the winner. Empty when everyone agrees. */
  conflicts: FactCandidate[];
}

export interface ResolvedListFact {
  label: string;
  /** The winning source's list. Lists are NOT merged across sources — see below. */
  values: string[];
  source: FactSource | null;
  /** Lower-ranked lists that are not a subset of the winner, kept whole for the confirmation line. */
  conflicts: { values: string[]; source: FactSource }[];
}

/** Comparison form: case-folded, whitespace-collapsed, punctuation-trimmed. */
function norm(v: string): string {
  return String(v || '').toLowerCase().replace(/\s+/g, ' ').replace(/[.,;:]+$/, '').trim();
}

/** URLs compare on scheme-less host+path, so http/https and a trailing slash are not a "conflict". */
export function normUrl(v: string): string {
  const s = String(v || '').trim();
  if (!s) return '';
  try {
    const u = new URL(s.includes('://') ? s : `https://${s}`);
    return `${u.hostname.toLowerCase().replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`.replace(/\/$/, '');
  } catch {
    return norm(s).replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
  }
}

/**
 * Resolve one scalar fact. Candidates may arrive in any order and may be blank; blanks are dropped
 * (an absent value is not a vote). `compare` lets URLs and plain text use different sameness rules.
 */
export function resolveFact(
  label: string,
  candidates: Array<FactCandidate | null | undefined>,
  compare: (v: string) => string = norm,
): ResolvedFact {
  const real = (candidates.filter(Boolean) as FactCandidate[])
    .map((c) => ({ value: String(c.value ?? '').trim(), source: c.source }))
    .filter((c) => c.value.length > 0);
  if (!real.length) return { label, value: null, source: null, conflicts: [] };
  const sorted = [...real].sort((a, b) => RANK[a.source] - RANK[b.source]);
  const winner = sorted[0];
  const key = compare(winner.value);
  const conflicts = sorted.slice(1).filter((c) => compare(c.value) !== key);
  return { label, value: winner.value, source: winner.source, conflicts };
}

/**
 * Resolve a LIST fact (services, service areas).
 *
 * ⛔ LISTS ARE NOT MERGED. Merging is concatenation with extra steps: a client who cut "boarding up"
 * out of their services during onboarding would get it back from an older lead row, and the pack
 * would then promise work they took off the list. The highest-ranked non-empty list WINS WHOLE; any
 * lower-ranked list carrying entries the winner does not have is recorded as a conflict so Paul can
 * ask, which is the only honest way to add to it.
 */
export function resolveListFact(
  label: string,
  candidates: Array<{ values: string[]; source: FactSource } | null | undefined>,
): ResolvedListFact {
  const real = (candidates.filter(Boolean) as Array<{ values: string[]; source: FactSource }>)
    .map((c) => ({ values: (c.values ?? []).map((v) => String(v ?? '').trim()).filter(Boolean), source: c.source }))
    .filter((c) => c.values.length > 0);
  if (!real.length) return { label, values: [], source: null, conflicts: [] };
  const sorted = [...real].sort((a, b) => RANK[a.source] - RANK[b.source]);
  const winner = sorted[0];
  const have = new Set(winner.values.map(norm));
  const conflicts = sorted.slice(1).filter((c) => c.values.some((v) => !have.has(norm(v))));
  return { label, values: winner.values, source: winner.source, conflicts };
}

/* ── the inputs ──────────────────────────────────────────────────────────────────────────────── */

/** The paid lead row, client-safe columns only. */
export interface FactsLead {
  business_name?: string | null;
  website?: string | null;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  derived_town?: string | null;
  search_location?: string | null;
  category?: string | null;
  search_keyword?: string | null;
  services_included?: string[] | null;
  payment_date?: string | null;
}

/** The paid onboarding row. */
export interface FactsOnboarding {
  business_name?: string | null;
  business_website?: string | null;
  confirmed_location?: string | null;
  business_address?: string | null;
  services?: string | null;
  services_list?: unknown;
  areas_list?: unknown;
  areas_wanted?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  confirmed_phone?: string | null;
  standout?: string | null;
  accreditations?: string | null;
  must_not_say?: string | null;
  website_platform?: string | null;
  website_platform_other?: string | null;
  willing_to_migrate?: string | null;
  website_route?: string | null;
  domain_status?: string | null;
  access_status?: string | null;
  gbp_consent?: string | null;
  gbp_exists?: string | null;
  gbp_status?: string | null;
  gbp_verified?: string | null;
  gbp_manager_email?: string | null;
  competitor_name?: string | null;
  incomplete?: boolean | null;
}

/** An audit row's frozen context — the baseline's, or a Discovery scan's. */
export interface FactsAudit {
  business_name?: string | null;
  business_type?: string | null;
  location_text?: string | null;
  website?: string | null;
  specialism?: string | null;
}

export interface ClientFactsInput {
  lead: FactsLead | null | undefined;
  onboarding: FactsOnboarding | null | undefined;
  baselineAudit: FactsAudit | null | undefined;
  discoveryAudit?: FactsAudit | null | undefined;
  /** Canonical domain the operator has saved on the website-build record, if any. */
  savedCanonicalDomain?: string | null;
}

export interface ClientFacts {
  businessName: ResolvedFact;
  website: ResolvedFact;
  canonicalDomain: ResolvedFact;
  primaryLocation: ResolvedFact;
  category: ResolvedFact;
  services: ResolvedListFact;
  areas: ResolvedListFact;
  contactName: ResolvedFact;
  email: ResolvedFact;
  phone: ResolvedFact;
  standout: ResolvedFact;
  accreditations: ResolvedFact;
  mustNotSay: ResolvedFact;
  websitePlatform: ResolvedFact;
  willingToMigrate: ResolvedFact;
  websiteRoute: ResolvedFact;
  domainStatus: ResolvedFact;
  accessStatus: ResolvedFact;
  gbp: ResolvedFact;
  competitorNamedByClient: ResolvedFact;
  /** True when the onboarding row is flagged incomplete — used to soften, never to fail. */
  onboardingIncomplete: boolean;
}

/** jsonb list column → string[]. Accepts an array, a JSON array in a string, or a comma list. */
export function toList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((v) => String(v ?? '').trim()).filter(Boolean);
  const s = String(raw ?? '').trim();
  if (!s) return [];
  if (s.startsWith('[')) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v ?? '').trim()).filter(Boolean);
    } catch { /* fall through to the comma reading */ }
  }
  return s.split(',').map((v) => v.trim()).filter(Boolean);
}

const cand = (value: unknown, source: FactSource): FactCandidate | null => {
  const v = String(value ?? '').trim();
  return v ? { value: v, source } : null;
};

/** Domain (host only, no scheme, no www) of a URL — for the canonical-domain fact. */
function domainOf(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  try {
    return new URL(s.includes('://') ? s : `https://${s}`).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Resolve every fact the Welcome Pack and the rebuild prompt use, with its source and conflicts. */
export function resolveClientFacts(input: ClientFactsInput): ClientFacts {
  const { lead, onboarding: ob, baselineAudit: base, discoveryAudit: disc } = input;

  const websiteFact = resolveFact('Live website', [
    cand(ob?.business_website, 'onboarding'),
    cand(lead?.website, 'client_record'),
    cand(base?.website, 'baseline'),
    cand(disc?.website, 'discovery'),
  ], normUrl);

  return {
    businessName: resolveFact('Business name', [
      cand(ob?.business_name, 'onboarding'),
      cand(lead?.business_name, 'client_record'),
      cand(base?.business_name, 'baseline'),
      cand(disc?.business_name, 'discovery'),
    ]),
    website: websiteFact,
    canonicalDomain: resolveFact('Canonical domain', [
      cand(input.savedCanonicalDomain, 'client_record'),
      cand(domainOf(ob?.business_website), 'onboarding'),
      cand(domainOf(lead?.website), 'client_record'),
      cand(domainOf(base?.website), 'baseline'),
    ]),
    primaryLocation: resolveFact('Primary location', [
      cand(ob?.confirmed_location, 'onboarding'),
      cand(lead?.derived_town, 'client_record'),
      cand(lead?.search_location, 'client_record'),
      cand(base?.location_text, 'baseline'),
      cand(disc?.location_text, 'discovery'),
    ]),
    category: resolveFact('Business category', [
      cand(lead?.category, 'client_record'),
      cand(base?.business_type, 'baseline'),
      cand(lead?.search_keyword, 'client_record'),
      cand(disc?.business_type, 'discovery'),
    ]),
    services: resolveListFact('Services', [
      { values: toList(ob?.services_list), source: 'onboarding' },
      { values: toList(ob?.services), source: 'onboarding' },
      { values: toList(lead?.services_included), source: 'client_record' },
      { values: toList(base?.specialism), source: 'baseline' },
    ]),
    areas: resolveListFact('Service areas', [
      { values: toList(ob?.areas_list), source: 'onboarding' },
      { values: toList(ob?.areas_wanted), source: 'onboarding' },
    ]),
    contactName: resolveFact('Contact name', [
      cand(ob?.contact_name, 'onboarding'),
      cand(lead?.contact_name, 'client_record'),
    ]),
    email: resolveFact('Email', [
      cand(ob?.contact_email, 'onboarding'),
      cand(lead?.email, 'client_record'),
    ]),
    phone: resolveFact('Phone', [
      cand(ob?.confirmed_phone, 'onboarding'),
      cand(lead?.phone, 'client_record'),
    ]),
    standout: resolveFact('What makes them different', [cand(ob?.standout, 'onboarding')]),
    accreditations: resolveFact('Accreditations', [cand(ob?.accreditations, 'onboarding')]),
    mustNotSay: resolveFact('Must not say', [cand(ob?.must_not_say, 'onboarding')]),
    websitePlatform: resolveFact('Website platform', [
      cand(ob?.website_platform_other, 'onboarding'),
      cand(ob?.website_platform, 'onboarding'),
    ]),
    willingToMigrate: resolveFact('Willing to migrate hosting', [cand(ob?.willing_to_migrate, 'onboarding')]),
    websiteRoute: resolveFact('Website route', [cand(ob?.website_route, 'onboarding')]),
    domainStatus: resolveFact('Domain status', [cand(ob?.domain_status, 'onboarding')]),
    accessStatus: resolveFact('Website access', [cand(ob?.access_status, 'onboarding')]),
    gbp: resolveFact('Google Business Profile', [
      cand([ob?.gbp_exists, ob?.gbp_status, ob?.gbp_verified, ob?.gbp_consent].filter(Boolean).join(' · '), 'onboarding'),
    ]),
    competitorNamedByClient: resolveFact('Competitor named by the client', [cand(ob?.competitor_name, 'onboarding')]),
    onboardingIncomplete: ob?.incomplete === true,
  };
}

/* ── CLIENT CONFIRMATION REQUIRED ─────────────────────────────────────────────────────────────── */

export interface ConfirmationItem {
  label: string;
  /** Why it needs asking — either a conflict between sources, or nothing recorded at all. */
  kind: 'conflict' | 'missing';
  detail: string;
}

/** Facts whose absence genuinely blocks a rebuild, so "not recorded" is worth asking about. */
/* ⚠️ `areas` IS ON THIS LIST DELIBERATELY. Service areas are the single most-invented fact on a
   trade website — a rebuild with no recorded areas will otherwise grow a town list from nowhere. */
const REQUIRED_FOR_REBUILD: Array<keyof ClientFacts> = [
  'website', 'primaryLocation', 'category', 'services', 'areas',
];

/**
 * Everything Paul should put to the client before the rebuild starts: every genuine disagreement
 * between sources, plus the handful of facts a rebuild cannot proceed without.
 *
 * ⛔ A CONFLICT IS NEVER RESOLVED HERE. The item names both values and both sources and stops.
 */
export function clientConfirmationsNeeded(facts: ClientFacts): ConfirmationItem[] {
  const out: ConfirmationItem[] = [];
  for (const key of Object.keys(facts) as Array<keyof ClientFacts>) {
    const f = facts[key];
    if (!f || typeof f !== 'object') continue;
    if ('values' in f) {
      const list = f as ResolvedListFact;
      for (const c of list.conflicts) {
        out.push({
          label: list.label,
          kind: 'conflict',
          detail: `${FACT_SOURCE_LABELS[list.source as FactSource]} says "${list.values.join(', ')}"; ${FACT_SOURCE_LABELS[c.source]} says "${c.values.join(', ')}". Not merged and not chosen — confirm which is current.`,
        });
      }
      if (!list.values.length && REQUIRED_FOR_REBUILD.includes(key)) {
        out.push({ label: list.label, kind: 'missing', detail: 'Nothing recorded from any source.' });
      }
      continue;
    }
    const fact = f as ResolvedFact;
    for (const c of fact.conflicts) {
      out.push({
        label: fact.label,
        kind: 'conflict',
        detail: `${FACT_SOURCE_LABELS[fact.source as FactSource]} says "${fact.value}"; ${FACT_SOURCE_LABELS[c.source]} says "${c.value}". Not chosen — confirm which is current.`,
      });
    }
    if (!fact.value && REQUIRED_FOR_REBUILD.includes(key)) {
      out.push({ label: fact.label, kind: 'missing', detail: 'Nothing recorded from any source.' });
    }
  }
  return out;
}
