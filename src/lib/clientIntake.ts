/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PAID CLIENT AUTO-INTAKE — THE RULES (2026-10-06,
   docs/pre-sales-certification/paid-client-auto-intake-final-sales-check.md).

   When a lead becomes a Paid Client, LeadFinderOS gathers everything it already knows about them into ONE
   consolidated profile, so Paul never opens a new client to a blank form. This file is the whole rule:
     COLLECT (the edge loader, _shared/client-intake.ts — database reads only)
     → NORMALISE + MERGE (mergeClientProfile: one value per field, ranked by source)
     → FLAG CONFLICTS (a disagreeing source is shown, never silently dropped)
     → FIND GAPS (intakeSummary: only what is genuinely still missing).

   ⛔ THE PROFILE IS DERIVED ON EVERY READ, never stored (CLAUDE.md "derived, never stored"): a stored profile
      would freeze an old rule and go stale the moment the client's form or a crawl lands. What IS stored is
      the run state and Paul's own decisions (client_intake.overrides).
   ⛔ SOURCE PRECEDENCE (Paul's brief): confirmed by Paul > what the CLIENT said (onboarding, the signed
      agreement) > what the SALESPERSON confirmed (handoff, Quick Close, the lead details they set) >
      structured business records (Companies House) > the lead record > the client's own WEBSITE > Google
      business data > inferred. Rank breaks the tie; it never hides the loser (clientFacts.ts's rule).
   ⛔ AUTOMATIC RESEARCH NEVER OVERWRITES A CONFIRMED VALUE: a field Paul confirmed shows his value whatever
      a later crawl finds, and a value he rejected is never shown again. Only paid-client-hub intake_fact
      (admin) writes the overrides.
   ⛔ AUTOMATIC FILLING IS FOR CLIENT- AND SALES-GRADE ANSWERS ONLY (autoApplyCandidates): an earlier form
      the client filled, the handoff, the Quick Close answer. A website find is NEVER written onto the lead
      — the crawl never merges into what the baseline measures (CLAUDE.md, paid-client-evidence) — it is
      shown as "found on their website — not confirmed" until Paul confirms it.
   ⛔ NEVER CONTACTS ANYONE. Nothing here, or in the loader, sends a WhatsApp, an email or a reminder.
   Pure. ⚠️ Edge-reachable (paid-client-hub, client-intake): relative imports, explicit .ts.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { CRAWL_FRESH_MS } from './crawlCheck.ts';
import { sameSite } from './crawlUrl.ts';
import type { KnownCandidate, KnownForItem } from './clientMissingInfo.ts';

/* ══ SOURCES ══════════════════════════════════════════════════════════════════════════════════════ */

export type IntakeSourceKey =
  | 'manual' | 'onboarding' | 'agreement' | 'handoff' | 'quick_close' | 'sales'
  | 'companies_house' | 'lead' | 'website' | 'places' | 'audit';

/** Lower = stronger. Two sources may share a rank (they are then equally strong; the first listed wins). */
export const SOURCE_RANK: Record<IntakeSourceKey, number> = {
  manual: 0, onboarding: 1, agreement: 2, handoff: 3, quick_close: 3, sales: 4,
  companies_house: 5, lead: 6, website: 7, places: 8, audit: 9,
};
export const SOURCE_LABEL: Record<IntakeSourceKey, string> = {
  manual: 'Confirmed by Paul',
  onboarding: 'Client onboarding',
  agreement: 'Signed client agreement',
  handoff: 'Sales handoff',
  quick_close: 'Sales call (Quick Close)',
  sales: 'Salesperson (lead details)',
  companies_house: 'Companies House',
  lead: 'Lead record',
  website: 'Existing website',
  places: 'Google business data',
  audit: 'Hook audit (inferred)',
};
/** What a value's source means for trust — the chip Paul sees beside it. */
export type SourceTier = 'confirmed' | 'client' | 'sales' | 'record' | 'website' | 'places' | 'inferred';
export const SOURCE_TIER: Record<IntakeSourceKey, SourceTier> = {
  manual: 'confirmed', onboarding: 'client', agreement: 'client', handoff: 'sales', quick_close: 'sales', sales: 'sales',
  companies_house: 'record', lead: 'record', website: 'website', places: 'places', audit: 'inferred',
};
export const TIER_WORDS: Record<SourceTier, string> = {
  confirmed: 'Confirmed by Paul', client: 'From the client', sales: 'From the salesperson', record: 'On record',
  website: 'Found on their website — not confirmed', places: 'Google business data — not confirmed', inferred: 'Inferred — not confirmed',
};

/** One candidate value for one field, with where it came from. */
export interface IntakeCandidate {
  source: IntakeSourceKey;
  /** Overrides SOURCE_LABEL when more precise ("An earlier form they filled in"). */
  label?: string;
  value?: string | null;
  values?: readonly string[] | null;
  /** Where on the website it was read (website evidence only). */
  urls?: readonly string[];
}

/* ══ FIELDS ═══════════════════════════════════════════════════════════════════════════════════════ */

export type IntakeFieldKey =
  | 'business_name' | 'trade' | 'town' | 'address' | 'phone' | 'email' | 'website' | 'contact_name'
  | 'services' | 'service_areas'
  | 'opening_hours' | 'company_number' | 'credentials' | 'guarantees' | 'experience' | 'people' | 'reviews' | 'social_profiles';
export type IntakeGroup = 'who' | 'work' | 'found';

interface FieldDef {
  key: IntakeFieldKey; label: string; group: IntakeGroup; kind: 'text' | 'list';
  /** Counted as "still needed" when blank. */
  required: boolean;
  /** The weakest source whose DIFFERENT value counts as a conflict. null = never a conflict (wording varies). */
  conflictFrom: IntakeSourceKey | null;
  /** Paul may confirm / edit / reject it from the profile. */
  editable: boolean;
}
export const INTAKE_FIELDS: readonly FieldDef[] = [
  { key: 'business_name', label: 'Business name', group: 'who', kind: 'text', required: true, conflictFrom: 'website', editable: true },
  { key: 'trade', label: 'Trade', group: 'who', kind: 'text', required: true, conflictFrom: null, editable: true },
  { key: 'town', label: 'Home town', group: 'who', kind: 'text', required: true, conflictFrom: 'places', editable: true },
  { key: 'address', label: 'Address', group: 'who', kind: 'text', required: false, conflictFrom: 'website', editable: true },
  { key: 'phone', label: 'Phone', group: 'who', kind: 'text', required: true, conflictFrom: 'places', editable: true },
  { key: 'email', label: 'Email', group: 'who', kind: 'text', required: true, conflictFrom: 'website', editable: true },
  { key: 'website', label: 'Website', group: 'who', kind: 'text', required: false, conflictFrom: 'places', editable: true },
  { key: 'contact_name', label: 'Contact / decision maker', group: 'who', kind: 'text', required: true, conflictFrom: 'sales', editable: true },
  { key: 'services', label: 'Services', group: 'work', kind: 'list', required: true, conflictFrom: 'sales', editable: true },
  { key: 'service_areas', label: 'Service areas', group: 'work', kind: 'list', required: true, conflictFrom: 'website', editable: true },
  { key: 'opening_hours', label: 'Opening hours', group: 'found', kind: 'list', required: false, conflictFrom: null, editable: false },
  { key: 'company_number', label: 'Company number', group: 'found', kind: 'text', required: false, conflictFrom: 'website', editable: true },
  { key: 'credentials', label: 'Credentials & memberships', group: 'found', kind: 'list', required: false, conflictFrom: null, editable: false },
  { key: 'guarantees', label: 'Guarantees & 24-hour cover', group: 'found', kind: 'list', required: false, conflictFrom: null, editable: false },
  { key: 'experience', label: 'Experience & history', group: 'found', kind: 'list', required: false, conflictFrom: null, editable: false },
  { key: 'people', label: 'Team', group: 'found', kind: 'list', required: false, conflictFrom: null, editable: false },
  { key: 'reviews', label: 'Google reviews', group: 'found', kind: 'text', required: false, conflictFrom: null, editable: false },
  { key: 'social_profiles', label: 'Social & directory profiles', group: 'found', kind: 'list', required: false, conflictFrom: null, editable: false },
];
export const INTAKE_FIELD_KEYS: readonly IntakeFieldKey[] = INTAKE_FIELDS.map((f) => f.key);
export const isIntakeFieldKey = (v: unknown): v is IntakeFieldKey => typeof v === 'string' && (INTAKE_FIELD_KEYS as readonly string[]).includes(v);

/* ══ NORMALISING ══════════════════════════════════════════════════════════════════════════════════ */

const str = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
/** UK phone digits: +44 / 0044 / 44 → a leading 0, punctuation dropped. */
export function normPhone(v: string): string {
  let d = v.replace(/[^\d+]/g, '');
  if (d.startsWith('+44')) d = '0' + d.slice(3);
  else if (d.startsWith('0044')) d = '0' + d.slice(4);
  else if (/^44\d{9,10}$/.test(d)) d = '0' + d.slice(2);
  return d.replace(/\D/g, '');
}
export function normUrlHost(v: string): string {
  try { return new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`).hostname.toLowerCase().replace(/^www\./, ''); } catch { return v.toLowerCase(); }
}
const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
/** An address compares by its postcode when it has one (formatting varies wildly between sources). */
export function normAddress(v: string): string {
  const m = v.match(POSTCODE);
  return m ? `${m[1]}${m[2]}`.toUpperCase() : v.toLowerCase().replace(/[^a-z0-9]/g, '');
}
const LEGAL_SUFFIX = /\b(ltd|limited|llp|plc|& co|and co)\.?$/i;
export function normName(v: string): string { return v.toLowerCase().replace(/[’']/g, '').replace(LEGAL_SUFFIX, '').replace(/[^a-z0-9]/g, ''); }
export function normValue(key: IntakeFieldKey, v: string): string {
  if (key === 'phone') return normPhone(v);
  if (key === 'website') return normUrlHost(v);
  if (key === 'address') return normAddress(v);
  if (key === 'business_name') return normName(v);
  if (key === 'email') return v.trim().toLowerCase();
  if (key === 'company_number') return v.replace(/\s/g, '').toUpperCase().replace(/^0+/, '');
  return v.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
export function cleanIntakeList(v: unknown, max = 40): string[] {
  const xs = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,\n]/) : [];
  const out: string[] = []; const seen = new Set<string>();
  for (const x of xs) {
    const t = str(x && typeof x === 'object' && 'value' in (x as Record<string, unknown>) ? (x as { value: unknown }).value
      : x && typeof x === 'object' && 'name' in (x as Record<string, unknown>) ? (x as { name: unknown }).name : x).slice(0, 160);
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase()); out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

/* ══ PAUL'S DECISIONS (client_intake.overrides) ═══════════════════════════════════════════════════ */

export interface FieldOverride {
  confirmed?: { value?: string | null; values?: string[] | null; by?: string | null; at?: string | null } | null;
  /** Normalised values Paul said are wrong — never shown as the value again, whatever source repeats them. */
  rejected?: string[] | null;
}
export type IntakeOverrides = Partial<Record<IntakeFieldKey, FieldOverride>>;

export function cleanOverrides(raw: unknown): IntakeOverrides {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: IntakeOverrides = {};
  for (const k of INTAKE_FIELD_KEYS) {
    const o = r[k] as FieldOverride | undefined;
    if (!o || typeof o !== 'object') continue;
    const c = o.confirmed && typeof o.confirmed === 'object' ? o.confirmed : null;
    const rejected = Array.isArray(o.rejected) ? o.rejected.filter((x): x is string => typeof x === 'string').slice(0, 50) : [];
    out[k] = {
      confirmed: c ? { value: str(c.value) || null, values: c.values ? cleanIntakeList(c.values) : null, by: str(c.by) || null, at: str(c.at) || null } : null,
      rejected,
    };
  }
  return out;
}

export type OverrideAction = 'confirm' | 'edit' | 'reject' | 'clear';
/** Paul's action on one field → the next overrides. ⛔ Pure; the hub re-reads the profile on the server and
 *  passes the CURRENT value for "confirm" — the browser never decides what is confirmed. */
export function applyOverride(prev: IntakeOverrides, key: IntakeFieldKey, action: OverrideAction,
  input: { value?: string | null; values?: readonly string[] | null; by: string; at: string }): { next: IntakeOverrides; refused?: string } {
  const def = INTAKE_FIELDS.find((f) => f.key === key)!;
  if (!def.editable) return { next: prev, refused: 'This is evidence from their website — it is shown, not edited.' };
  const next: IntakeOverrides = { ...prev };
  const cur = { ...(prev[key] ?? {}) } as FieldOverride;
  if (action === 'clear') { delete next[key]; return { next }; }
  if (action === 'reject') {
    const v = def.kind === 'list' ? cleanIntakeList(input.values ?? []).join('|') : str(input.value);
    if (!v) return { next: prev, refused: 'Nothing to reject.' };
    const norm = def.kind === 'list' ? v.toLowerCase() : normValue(key, v);
    cur.rejected = [...new Set([...(cur.rejected ?? []), norm])];
    /* Rejecting the value Paul himself confirmed undoes the confirmation. */
    if (cur.confirmed && (def.kind === 'list' ? (cur.confirmed.values ?? []).join('|').toLowerCase() === norm : normValue(key, cur.confirmed.value ?? '') === norm)) cur.confirmed = null;
    next[key] = cur;
    return { next };
  }
  if (def.kind === 'list') {
    const values = cleanIntakeList(input.values ?? []);
    if (!values.length) return { next: prev, refused: 'Add at least one entry.' };
    cur.confirmed = { values, by: input.by, at: input.at };
  } else {
    const value = str(input.value).slice(0, 300);
    if (!value) return { next: prev, refused: 'Type a value first.' };
    if (key === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return { next: prev, refused: 'That email address does not look right.' };
    if (key === 'phone' && normPhone(value).length < 9) return { next: prev, refused: 'That phone number does not look right.' };
    cur.confirmed = { value, by: input.by, at: input.at };
  }
  next[key] = cur;
  return { next };
}

/* ══ MERGE ════════════════════════════════════════════════════════════════════════════════════════ */

export type FieldStatus = 'confirmed' | 'client' | 'sales' | 'record' | 'website' | 'places' | 'inferred' | 'conflict' | 'missing';
export interface ProfileSource { source: IntakeSourceKey; label: string; value?: string; values?: string[]; urls?: string[]; rejected?: boolean }
export interface ProfileField {
  key: IntakeFieldKey; label: string; group: IntakeGroup; kind: 'text' | 'list'; required: boolean; editable: boolean;
  value: string | null; values: string[];
  /** Where the shown value came from (null when missing). */
  source: IntakeSourceKey | null; sourceLabel: string | null; tier: SourceTier | null;
  status: FieldStatus;
  /** True when sources disagree and Paul has not confirmed one: "Needs review — conflicting evidence". */
  conflict: boolean;
  /** Every source that had something, strongest first — the expandable "Sources" list. */
  sources: ProfileSource[];
}

const listKey = (xs: readonly string[]) => xs.map((x) => x.toLowerCase()).sort().join('|');

export function mergeField(def: FieldDef, raw: readonly IntakeCandidate[], override?: FieldOverride | null): ProfileField {
  const rejected = new Set(override?.rejected ?? []);
  const isList = def.kind === 'list';
  const cands = raw
    .map((c) => ({ ...c, value: isList ? null : str(c.value) || null, values: isList ? cleanIntakeList(c.values ?? []) : [] }))
    .filter((c) => (isList ? c.values.length > 0 : !!c.value))
    .sort((a, b) => SOURCE_RANK[a.source] - SOURCE_RANK[b.source]);
  const isRejected = (c: { value: string | null; values: string[] }) => isList ? rejected.has(listKey(c.values)) : rejected.has(normValue(def.key, c.value ?? ''));
  const sources: ProfileSource[] = cands.map((c) => ({
    source: c.source, label: c.label ?? SOURCE_LABEL[c.source],
    ...(isList ? { values: c.values } : { value: c.value ?? undefined }),
    ...(c.urls?.length ? { urls: [...new Set(c.urls)].slice(0, 5) } : {}),
    ...(isRejected(c) ? { rejected: true } : {}),
  }));
  const base = { key: def.key, label: def.label, group: def.group, kind: def.kind, required: def.required, editable: def.editable, sources };

  const conf = override?.confirmed ?? null;
  if (conf && (isList ? (conf.values ?? []).length > 0 : !!conf.value)) {
    return { ...base, value: isList ? null : conf.value ?? null, values: isList ? [...(conf.values ?? [])] : [],
      source: 'manual', sourceLabel: SOURCE_LABEL.manual, tier: 'confirmed', status: 'confirmed', conflict: false,
      sources: [{ source: 'manual', label: SOURCE_LABEL.manual, ...(isList ? { values: [...(conf.values ?? [])] } : { value: conf.value ?? undefined }) }, ...sources] };
  }
  const usable = cands.filter((c) => !isRejected(c));
  const win = usable[0];
  if (!win) return { ...base, value: null, values: [], source: null, sourceLabel: null, tier: null, status: 'missing', conflict: false };

  let conflict = false;
  if (def.conflictFrom) {
    const limit = SOURCE_RANK[def.conflictFrom];
    for (const c of usable.slice(1)) {
      if (SOURCE_RANK[c.source] > limit) continue;
      const differs = isList ? listKey(c.values) !== listKey(win.values) : normValue(def.key, c.value!) !== normValue(def.key, win.value!);
      if (differs) { conflict = true; break; }
    }
  }
  const tier = SOURCE_TIER[win.source];
  return {
    ...base, value: isList ? null : win.value, values: isList ? win.values : [],
    source: win.source, sourceLabel: win.label ?? SOURCE_LABEL[win.source], tier,
    status: conflict ? 'conflict' : tier, conflict,
  };
}

/** Every field, merged. `candidates` is keyed by field; a field with no key is simply missing. */
export function mergeClientProfile(candidates: Partial<Record<IntakeFieldKey, IntakeCandidate[]>>, overrides: IntakeOverrides = {}): ProfileField[] {
  return INTAKE_FIELDS.map((def) => mergeField(def, candidates[def.key] ?? [], overrides[def.key] ?? null));
}

/* ══ CANDIDATES FROM THE GATHERED ROWS ═══════════════════════════════════════════════════════════════
   The loader hands the raw rows here; every mapping of "which column means what, from whom" is in ONE
   place. A lead row with a Google place id holds Google's own name / phone / website / address (the
   search wrote them), so those are labelled Google business data; a hand-added lead's are the lead
   record. Services / areas / website control on the lead are what the SALESPERSON set (lead_set_profile). */

export interface IntakeRows {
  lead: Record<string, unknown>;
  /** The onboarding row the checklist counts (client-setup pickOnboarding). */
  onboarding: Record<string, unknown> | null;
  /** The newest signed v3 agreement acceptance for this lead. */
  agreement: Record<string, unknown> | null;
  handoff: Record<string, unknown> | null;
  quickClose: Record<string, unknown> | null;
  /** Google Place Details cache (phone_cache) for the lead's place id. */
  placeCache: Record<string, unknown> | null;
  companiesHouse: Record<string, unknown> | null;
  /** lead_crawl_checks: result.siteInfo + full_evidence.business, when the crawl is of THIS site. */
  crawl: { url?: string | null; siteInfo?: Record<string, unknown> | null; business?: Record<string, unknown> | null } | null;
  /** The prospect hook audit's own business_type / location_text (inferred context only). */
  hookAudit: { business_type?: string | null; location_text?: string | null } | null;
  /** Canonical social profiles (lead_social_profiles, confirmed / likely). */
  socials?: readonly { platform: string; url: string }[];
}

const seenValues = (v: unknown): { values: string[]; urls: string[] } => {
  const xs = Array.isArray(v) ? v as Array<{ value?: unknown; url?: unknown }> : [];
  return { values: cleanIntakeList(xs.map((x) => x?.value)), urls: xs.map((x) => str(x?.url)).filter(Boolean) };
};

export function intakeCandidates(r: IntakeRows): Partial<Record<IntakeFieldKey, IntakeCandidate[]>> {
  const L = r.lead ?? {};
  const ob = r.onboarding ?? null;
  const ag = r.agreement ?? null;
  const h = r.handoff ?? null;
  const pc = r.placeCache ?? null;
  const ch = r.companiesHouse ?? null;
  const si = (r.crawl?.siteInfo ?? null) as Record<string, unknown> | null;
  const biz = (r.crawl?.business ?? null) as Record<string, unknown> | null;
  const google: IntakeSourceKey = str(L.place_id) ? 'places' : 'lead';
  const out: Partial<Record<IntakeFieldKey, IntakeCandidate[]>> = {};
  const add = (k: IntakeFieldKey, c: IntakeCandidate) => { (out[k] ??= []).push(c); };
  const v = (x: unknown) => str(x) || null;

  /* Who they are */
  add('business_name', { source: 'onboarding', value: v(ob?.business_name) });
  add('business_name', { source: 'agreement', value: v(ag?.legal_business_name) || v(ag?.business_name) });
  add('business_name', { source: 'companies_house', value: ch && str(ch.match) === 'strong' ? v(ch.company_name) : null });
  add('business_name', { source: google, value: v(L.business_name) });
  add('trade', { source: 'lead', label: 'Lead record (trade)', value: v(L.category) || v(L.search_keyword) });
  add('trade', { source: 'places', value: v(pc?.category) });
  add('trade', { source: 'audit', value: v(r.hookAudit?.business_type) });
  add('town', { source: 'onboarding', value: v(ob?.confirmed_location) });
  add('town', { source: google, value: v(L.derived_town) });
  add('town', { source: 'places', label: 'Google business data (cache)', value: v(pc?.derived_town) });
  add('town', { source: 'audit', value: v(r.hookAudit?.location_text) });
  add('address', { source: 'onboarding', value: v(ob?.business_address) });
  add('address', { source: 'agreement', value: v(ag?.business_address) });
  add('address', { source: google, value: v(L.address) });
  add('address', { source: 'website', value: v(si?.address), urls: r.crawl?.url ? [str(r.crawl.url)] : [] });
  add('phone', { source: 'onboarding', value: v(ob?.confirmed_phone) });
  add('phone', { source: 'agreement', value: v(ag?.phone) });
  add('phone', { source: google, value: v(L.phone) });
  add('phone', { source: 'website', value: v(si?.phone), urls: seenValues(biz?.phones).urls.slice(0, 3) });
  add('phone', { source: 'places', label: 'Google business data (cache)', value: v(pc?.phone) });
  add('email', { source: 'onboarding', value: v(ob?.contact_email) });
  add('email', { source: 'agreement', value: v(ag?.email) });
  add('email', { source: 'lead', value: v(L.email) });
  add('email', { source: 'website', value: v(si?.email), urls: seenValues(biz?.emails).urls.slice(0, 3) });
  add('website', { source: 'onboarding', value: v(ob?.business_website) });
  add('website', { source: 'agreement', value: v(ag?.website_domain) });
  add('website', { source: google, value: v(L.website) });
  add('website', { source: 'places', label: 'Google business data (cache)', value: v(pc?.website) });
  add('contact_name', { source: 'onboarding', value: v(ob?.contact_name) });
  add('contact_name', { source: 'agreement', label: 'Signed client agreement (signer)', value: v(ag?.typed_name) });
  add('contact_name', { source: 'handoff', label: 'Sales handoff (decision maker)', value: v(h?.decision_maker_name) });
  add('contact_name', { source: 'lead', value: v(L.contact_name) });

  /* The work */
  const obServices = cleanIntakeList(ob?.services_list).length ? cleanIntakeList(ob?.services_list) : cleanIntakeList(ob?.services);
  add('services', { source: 'onboarding', values: obServices });
  add('services', { source: 'sales', values: cleanIntakeList(L.services_included) });
  add('services', { source: 'website', values: cleanIntakeList(si?.services), urls: r.crawl?.url ? [str(r.crawl.url)] : [] });
  const obAreas = cleanIntakeList(ob?.areas_list).length ? cleanIntakeList(ob?.areas_list) : cleanIntakeList(ob?.areas_wanted);
  add('service_areas', { source: 'onboarding', values: obAreas });
  add('service_areas', { source: 'sales', values: cleanIntakeList(L.service_areas) });
  add('service_areas', { source: 'website', values: cleanIntakeList(si?.towns), urls: r.crawl?.url ? [str(r.crawl.url)] : [] });

  /* What their website (and Google) says — evidence, each with the page it was read on */
  add('opening_hours', { source: 'website', values: cleanIntakeList(si?.openingHours) });
  add('company_number', { source: 'agreement', value: v(ag?.company_number) });
  add('company_number', { source: 'companies_house', value: ch && str(ch.match) === 'strong' ? v(ch.company_number) : null });
  add('company_number', { source: 'website', value: v(si?.companyNumber) });
  for (const [key, ev] of [['credentials', 'credentials'], ['guarantees', 'guarantees'], ['experience', 'experience'], ['people', 'people']] as const) {
    const s = seenValues(biz?.[ev]);
    add(key, { source: 'website', values: s.values, urls: s.urls });
  }
  const rating = Number(L.rating ?? pc?.rating ?? NaN);
  const count = Number(L.review_count ?? pc?.review_count ?? NaN);
  if (Number.isFinite(rating) && rating > 0) add('reviews', { source: 'places', value: `${rating.toFixed(1)}★${Number.isFinite(count) ? ` · ${count} Google review${count === 1 ? '' : 's'}` : ''}` });
  const socialUrls = [...(r.socials ?? []).map((s) => s.url), ...((Array.isArray(si?.socialLinks) ? si!.socialLinks as Array<{ url?: string }> : []).map((s) => str(s?.url)))];
  add('social_profiles', { source: 'website', values: cleanIntakeList(socialUrls) });
  return out;
}

/* ══ WHAT THE SALESPERSON AND THE CLIENT TOLD US (structured, never merged into a contact field) ════ */

/** Reuse of the existing site's content / branding / photos. ⛔ Public is not permission: only an explicit
 *  yes (the Quick Close rights answer, or the client's own site_rights answer) allows reuse. */
export type ContentReuse = 'permitted' | 'not_permitted' | 'unknown';
export function contentReuse(i: { quickCloseRights?: unknown; siteRights?: unknown }): ContentReuse {
  const qc = str(i.quickCloseRights); const site = str(i.siteRights);
  if (site === 'no' || qc === 'no') return 'not_permitted';
  if (site === 'yes' || qc === 'yes') return 'permitted';
  return 'unknown';
}
export const CONTENT_REUSE_WORDS: Record<ContentReuse, string> = {
  permitted: 'May reuse — the client confirmed they own or may reuse the content, branding and photos.',
  not_permitted: 'REFERENCE ONLY — DO NOT REUSE. The client does not have the right to reuse this content, branding or photos.',
  unknown: 'REFERENCE ONLY — DO NOT REUSE until the client confirms they own it or may reuse it.',
};

/* ══ AUTOMATIC FILLING — "Find what we already have", done for Paul ═══════════════════════════════
   The candidates gatherKnown already offers, applied automatically ONLY from a client or sales source.
   ⛔ Never a website (crawl) candidate: that stays a suggestion until Paul presses Use / Confirm. */
export const AUTO_APPLY_SOURCES: ReadonlySet<KnownCandidate['source']> = new Set(['onboarding', 'free_check', 'handoff', 'quick_close']);
export function autoApplyCandidates(known: readonly KnownForItem[]): KnownCandidate[] {
  const out: KnownCandidate[] = [];
  for (const item of known) {
    if (item.clientOnly) continue;
    const c = item.candidates.find((x) => x.apply && AUTO_APPLY_SOURCES.has(x.source));
    if (c) out.push(c);
  }
  return out;
}

/* ══ THE CRAWL — reuse, wait, start once, or give up and carry on ═════════════════════════════════ */

/** How long an intake waits for its crawl before carrying on without it (the profile is still usable). */
export const INTAKE_CRAWL_MAX_WAIT_MS = 6 * 60 * 60 * 1000;
/** A run holds its row this long; a crashed run is picked up again after it. */
export const INTAKE_LEASE_MS = 3 * 60 * 1000;
/** While a crawl runs, the intake looks again after this. */
export const INTAKE_CRAWL_POLL_MS = 60 * 1000;
/** Runs (not crawls) an intake may make before it stops and asks for Paul (no retry loop, ever). */
export const INTAKE_MAX_ATTEMPTS = 8;

export type CrawlPlan =
  | { action: 'not_needed'; reason: string }
  | { action: 'reuse'; reason: string; crawledAt: string }
  | { action: 'wait'; reason: string; jobId: string }
  | { action: 'start'; reason: string }
  | { action: 'give_up'; reason: string };

export interface CrawlPlanInput {
  website: string | null | undefined;
  crawl: { url?: string | null; created_at?: string | null; mode?: string | null; completeness?: string | null; job_id?: string | null } | null;
  /** The newest crawl job for the lead (any starter). */
  job: { id: string; status: string; started_at?: string | null } | null;
  /** The job THIS intake started, if any — an intake starts at most one, ever. */
  intakeJobId: string | null;
  intakeCrawlStartedAt: string | null;
  nowMs: number;
}

export function crawlPlan(i: CrawlPlanInput): CrawlPlan {
  const site = str(i.website);
  if (!site) return { action: 'not_needed', reason: 'No website on file — nothing to crawl.' };
  const url = /^https?:\/\//i.test(site) ? site : `https://${site}`;
  const c = i.crawl;
  const crawledMs = c?.created_at ? Date.parse(c.created_at) : NaN;
  const sameSiteCrawl = !!c?.url && sameSite(str(c.url), url);
  const fullAndFresh = !!c && c.mode === 'full' && sameSiteCrawl && Number.isFinite(crawledMs) && i.nowMs - crawledMs < CRAWL_FRESH_MS && c.completeness !== 'failed';
  if (i.job && i.job.status === 'running') {
    const startedMs = Date.parse(i.intakeCrawlStartedAt ?? i.job.started_at ?? '');
    if (Number.isFinite(startedMs) && i.nowMs - startedMs > INTAKE_CRAWL_MAX_WAIT_MS) return { action: 'give_up', reason: 'The website crawl is still running after six hours — carrying on without it.' };
    return { action: 'wait', reason: 'Crawling their website…', jobId: i.job.id };
  }
  if (fullAndFresh) return { action: 'reuse', reason: i.intakeJobId && c?.job_id === i.intakeJobId ? 'Website crawled for this intake.' : 'Reused a recent full crawl of their website.', crawledAt: c!.created_at! };
  /* ⛔ ONE crawl per intake: a started job that finished without a usable full crawl is not retried here. */
  if (i.intakeJobId) return { action: 'give_up', reason: 'The website crawl did not finish with usable results — the rest of the intake carries on. Re-crawl from Website evidence.' };
  return { action: 'start', reason: c ? (sameSiteCrawl ? 'The saved crawl is out of date or partial — starting a full crawl.' : 'The saved crawl is of a different site — starting a full crawl.') : 'No crawl on file — starting a full crawl.' };
}

/* ══ STEPS, SUMMARY, STATUS ═══════════════════════════════════════════════════════════════════════ */

export type StepStatus = 'done' | 'reused' | 'running' | 'not_needed' | 'not_found' | 'failed';
export interface IntakeStep { key: string; label: string; status: StepStatus; detail?: string | null; /** Does this step spend money with a provider? */ cost: 'none' | 'external' }
export const STEP_LABEL: Record<string, string> = {
  lead: 'Lead record', handoff: 'Sales handoff', quick_close: 'Sales call answers', onboarding: 'Client onboarding',
  agreement: 'Signed agreement', places: 'Google business data', companies_house: 'Companies House', hook_audit: 'Hook audit',
  crawl: 'Website crawl', autofill: 'Filled from what we already had', socials: 'Social profiles',
};

export interface IntakeSummary {
  sources_checked: number;
  sources_with_data: number;
  fields_populated: number;
  still_needed: string[];
  conflicts: string[];
}
export function intakeSummary(profile: readonly ProfileField[], steps: readonly IntakeStep[], route: 'build' | 'optimise' | null): IntakeSummary {
  const needed = profile.filter((f) => f.status === 'missing' && (f.required || (f.key === 'website' && route === 'optimise')));
  /* Contact: a phone OR an email is enough — one of the two missing is not "still needed". */
  const phone = profile.find((f) => f.key === 'phone'); const email = profile.find((f) => f.key === 'email');
  const contactOk = phone?.status !== 'missing' || email?.status !== 'missing';
  const still = needed.filter((f) => !(contactOk && (f.key === 'phone' || f.key === 'email'))).map((f) => f.label);
  return {
    sources_checked: steps.filter((s) => s.key !== 'autofill').length,
    sources_with_data: steps.filter((s) => s.key !== 'autofill' && (s.status === 'done' || s.status === 'reused')).length,
    fields_populated: profile.filter((f) => f.status !== 'missing').length,
    still_needed: still,
    conflicts: profile.filter((f) => f.conflict).map((f) => f.label),
  };
}

export type IntakeStatus = 'queued' | 'running' | 'crawling' | 'ready' | 'needs_attention';
/** The one line Paul reads on the card and in the list. */
export function intakeStatusLine(status: IntakeStatus | null | undefined, s: IntakeSummary | null | undefined): string {
  if (!status) return 'Not run yet';
  if (status === 'queued') return 'Gathering existing information…';
  if (status === 'running') return 'Merging findings…';
  if (status === 'crawling') return 'Crawling website… (the client is usable now)';
  const bits = s ? [`${s.sources_checked} sources checked`, `${s.fields_populated} fields populated`] : [];
  if (s && s.still_needed.length) bits.push(`${s.still_needed.length} item${s.still_needed.length === 1 ? '' : 's'} still needed`);
  if (s && s.conflicts.length) bits.push(`${s.conflicts.length} to review`);
  if (status === 'needs_attention') return ['Needs attention', ...bits].join(' · ');
  return bits.length ? bits.join(' · ') : 'Ready for Paul';
}
/** Ready = nothing still needed and nothing to review. Otherwise the intake has finished but needs Paul. */
export function finishedStatus(s: IntakeSummary): Extract<IntakeStatus, 'ready' | 'needs_attention'> {
  return s.still_needed.length === 0 && s.conflicts.length === 0 ? 'ready' : 'needs_attention';
}

/** The notification Paul gets when an intake finishes (once per client — the dedupe key). */
export function intakeNoticeTitle(business: string | null | undefined, status: 'ready' | 'needs_attention'): string {
  const name = str(business) || 'A client';
  return status === 'ready' ? `CLIENT READY · ${name}` : `CLIENT INTAKE DONE · ${name} · needs attention`;
}
export function intakeNoticeBody(s: IntakeSummary): string {
  const bits = [`${s.sources_checked} sources checked, ${s.fields_populated} fields populated.`];
  if (s.still_needed.length) bits.push(`Still needed: ${s.still_needed.join(', ')}.`);
  if (s.conflicts.length) bits.push(`To review: ${s.conflicts.join(', ')}.`);
  return bits.join(' ');
}
